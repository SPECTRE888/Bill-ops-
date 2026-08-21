// Crée une session Stripe Checkout (abonnement) ou une session de portail de facturation, pour
// l'utilisateur connecté (session Supabase Auth). Même compte Stripe que BAR OPS, produit/prix
// distincts pour Helm (STRIPE_PRICE_ID_MONTHLY). Pas de clé publique Stripe côté client : on
// redirige simplement vers l'URL renvoyée (pas de Stripe.js/Elements).

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_PRICE_ID_MONTHLY = Deno.env.get('STRIPE_PRICE_ID_MONTHLY')!;
const APP_URL = 'https://helm-ops-ivory.vercel.app/';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

async function stripeRequest(path: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Erreur Stripe.');
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'no_session' }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return json({ error: 'invalid_token' }, 401);
  const user = userData.user;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const action = body?.action;

  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  let customerId = existingSub?.stripe_customer_id || null;

  try {
    if (action === 'subscribe') {
      if (!customerId) {
        const customer = await stripeRequest('customers', { email: user.email || '', 'metadata[user_id]': user.id, 'metadata[app]': 'helm' });
        customerId = customer.id;
      }
      const session = await stripeRequest('checkout/sessions', {
        mode: 'subscription',
        customer: customerId!,
        'line_items[0][price]': STRIPE_PRICE_ID_MONTHLY,
        'line_items[0][quantity]': '1',
        client_reference_id: user.id,
        // 'app':'helm' est le marqueur que stripe-webhook utilise pour ignorer les events des
        // autres produits du même compte Stripe (ex. BAR OPS) — les webhooks Stripe ne sont pas
        // filtrés par produit, une destination reçoit tous les events du type écouté sur tout le
        // compte, il faut donc filtrer soi-même côté code.
        'subscription_data[metadata][user_id]': user.id,
        'subscription_data[metadata][app]': 'helm',
        success_url: APP_URL,
        cancel_url: APP_URL,
      });
      return json({ url: session.url });
    }

    if (action === 'portal') {
      if (!customerId) return json({ error: 'Aucun abonnement Stripe pour cet utilisateur.' }, 400);
      const session = await stripeRequest('billing_portal/sessions', {
        customer: customerId,
        return_url: APP_URL,
      });
      return json({ url: session.url });
    }

    return json({ error: 'action invalide' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 502);
  }
});
