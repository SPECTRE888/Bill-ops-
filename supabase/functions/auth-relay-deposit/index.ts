// Dépose les tokens de session Supabase Auth (login Google) obtenus sur `mobile/oauth-relay.html`
// après le retour d'OAuth côté desktop Electron — voir oauth-google-callback pour le même
// principe côté Gmail. Nécessaire car facture.html tourne en file:// dans Electron, sans origine
// https pour recevoir un redirectTo direct ; le relais tourne sur GitHub Pages (https réel) et
// pousse les tokens ici, que l'app Electron récupère ensuite par polling (auth-relay-poll).

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_RELAY_SECRET = Deno.env.get('APP_RELAY_SECRET');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-app-secret',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });

  if (!APP_RELAY_SECRET || req.headers.get('x-app-secret') !== APP_RELAY_SECRET) {
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS });
  }

  let body: any;
  try { body = await req.json(); } catch { return new Response('Invalid JSON', { status: 400, headers: CORS_HEADERS }); }

  const { state, accessToken, refreshToken } = body ?? {};
  if (!state || !accessToken || !refreshToken) {
    return new Response('state, accessToken et refreshToken sont requis.', { status: 400, headers: CORS_HEADERS });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  await supabase.from('login_relay').delete().lt('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString());
  const { error } = await supabase.from('login_relay').upsert({ state, access_token: accessToken, refresh_token: refreshToken });
  if (error) return new Response(error.message, { status: 500, headers: CORS_HEADERS });

  return new Response('OK', { status: 200, headers: CORS_HEADERS });
});
