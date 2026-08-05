// Webhook Stripe (même compte que BAR OPS, endpoint dédié à Helm). Synchronise la table
// `subscriptions` à partir des events `customer.subscription.*`/`invoice.payment_failed`.
// `expires_at` est lu directement depuis `current_period_end` de l'objet Subscription — pas
// d'appel Stripe supplémentaire. Un abonnement annulé garde `expires_at` tel quel : l'accès
// continue jusqu'à la fin de la période déjà payée (voir check-access).
//
// Important : les webhooks Stripe ne sont pas filtrés par produit — cette destination reçoit
// TOUS les events des types écoutés sur l'ensemble du compte, y compris ceux générés par BAR OPS
// (même compte Stripe, décision explicite pour simplifier les paiements). On ignore donc tout
// abonnement qui n'a pas metadata.app==='helm' (posé par stripe-checkout) pour ne jamais créer de
// ligne pour un abonnement qui n'appartient pas à Helm.

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

function mapStatus(stripeStatus: string): 'active' | 'past_due' | 'cancelled' {
  if (stripeStatus === 'active' || stripeStatus === 'trialing') return 'active';
  if (stripeStatus === 'past_due' || stripeStatus === 'unpaid' || stripeStatus === 'incomplete') return 'past_due';
  return 'cancelled';
}

function getCurrentPeriodEnd(sub: Stripe.Subscription): number | undefined {
  // Depuis les versions récentes de l'API Stripe, current_period_end n'est plus à la racine de
  // l'objet Subscription (déplacé au niveau de chaque subscription item, pour gérer plusieurs
  // prix par abonnement) — on essaie les deux emplacements.
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  if (typeof legacy === 'number') return legacy;
  const itemPeriodEnd = sub.items?.data?.[0]?.current_period_end;
  return typeof itemPeriodEnd === 'number' ? itemPeriodEnd : undefined;
}

async function upsertFromSubscription(supabase: ReturnType<typeof createClient>, sub: Stripe.Subscription) {
  if (sub.metadata?.app !== 'helm') return; // event d'un autre produit du même compte Stripe (ex. BAR OPS) — ignoré
  const userId = sub.metadata?.user_id;
  if (!userId) return;
  const periodEnd = getCurrentPeriodEnd(sub);
  if (!periodEnd) throw new Error('current_period_end introuvable sur la Subscription Stripe.');
  const row = {
    user_id: userId,
    status: mapStatus(sub.status),
    expires_at: new Date(periodEnd * 1000).toISOString(),
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    stripe_subscription_id: sub.id,
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await supabase.from('subscriptions').select('id').eq('stripe_subscription_id', sub.id).maybeSingle();
  if (existing) {
    await supabase.from('subscriptions').update(row).eq('id', existing.id);
  } else {
    await supabase.from('subscriptions').insert(row);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const sig = req.headers.get('Stripe-Signature');
  const rawBody = await req.text();
  if (!sig) return new Response('Missing signature', { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return new Response(`Signature invalide: ${String((e as Error)?.message || e)}`, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        await upsertFromSubscription(supabase, event.data.object as Stripe.Subscription);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await supabase.from('subscriptions').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('stripe_subscription_id', sub.id);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
        if (subId) {
          await supabase.from('subscriptions').update({ status: 'past_due', updated_at: new Date().toISOString() }).eq('stripe_subscription_id', subId);
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    return new Response(`Erreur: ${String((e as Error)?.message || e)}`, { status: 500 });
  }

  return new Response('OK', { status: 200 });
});
