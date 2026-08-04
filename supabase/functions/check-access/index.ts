// Vérifie si l'utilisateur connecté (session Supabase Auth) a un abonnement actif. Appelée au
// boot de facture.html/mobile/index.html après la porte de connexion, et en boucle après un
// checkout Stripe pour détecter la fin du webhook. `allowed` se base sur `expires_at`, pas sur
// `status` seul : un abonnement annulé reste utilisable jusqu'à la fin de la période déjà payée.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ allowed: false, reason: 'no_session' }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return json({ allowed: false, reason: 'invalid_token' }, 401);

  const { data: sub, error: subError } = await supabase
    .from('subscriptions')
    .select('status, plan, period, expires_at')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subError) return json({ allowed: false, reason: subError.message }, 500);

  const allowed = !!sub?.expires_at && new Date(sub.expires_at).getTime() > Date.now();
  return json({
    allowed,
    status: sub?.status ?? null,
    plan: sub?.plan ?? null,
    period: sub?.period ?? null,
    expiresAt: sub?.expires_at ?? null,
  });
});
