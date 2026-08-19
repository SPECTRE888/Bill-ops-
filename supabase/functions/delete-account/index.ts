// Supprime définitivement le compte de l'utilisateur connecté (session Supabase Auth). Toutes les
// tables applicatives (clients, bookings, invoices, company_info, push_subscriptions, profiles,
// subscriptions) référencent auth.users(id) avec ON DELETE CASCADE (voir les migrations
// supabase/migrations/2026080*.sql) — supprimer l'utilisateur Auth suffit à tout effacer, pas
// besoin de vider chaque table à la main. Nécessite le service role (auth.admin.deleteUser n'est
// pas exposé côté client), comme check-access/stripe-checkout qui suivent le même schéma
// bearer-token → resolve user → action privilégiée avec la clé service role.
//
// Annule aussi l'abonnement Stripe actif s'il existe, en best-effort (échec Stripe non bloquant :
// on ne veut pas empêcher un utilisateur de supprimer son compte à cause d'un problème Stripe
// transitoire — un abonnement orphelin sans compte applicatif ne fait de mal à personne, le webhook
// stripe-webhook mettra simplement à jour une ligne subscriptions qui va de toute façon disparaître).

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
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
  const uid = userData.user.id;

  if (STRIPE_SECRET_KEY) {
    try {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('stripe_subscription_id')
        .eq('user_id', uid)
        .not('stripe_subscription_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sub?.stripe_subscription_id) {
        await fetch(`https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
        });
      }
    } catch (_e) { /* best-effort, ne bloque pas la suppression du compte */ }
  }

  const { error: deleteError } = await supabase.auth.admin.deleteUser(uid);
  if (deleteError) return json({ error: deleteError.message }, 500);

  return json({ success: true });
});
