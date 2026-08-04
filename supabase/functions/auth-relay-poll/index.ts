// Poll pour récupérer les tokens de session Supabase Auth déposés par auth-relay-deposit — quasi
// identique à oauth-google-poll (voir ce fichier pour le pourquoi du polling plutôt qu'un
// postMessage). Usage unique : la ligne est supprimée dès qu'elle est lue.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_RELAY_SECRET = Deno.env.get('APP_RELAY_SECRET');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-app-secret',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });

  if (APP_RELAY_SECRET && req.headers.get('x-app-secret') !== APP_RELAY_SECRET) {
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const state = url.searchParams.get('state');
  if (!state) {
    return new Response(JSON.stringify({ error: 'missing state' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data, error } = await supabase.from('login_relay').select('access_token, refresh_token').eq('state', state).maybeSingle();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
  if (!data) {
    return new Response(JSON.stringify({ pending: true }), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  await supabase.from('login_relay').delete().eq('state', state);
  return new Response(JSON.stringify({ accessToken: data.access_token, refreshToken: data.refresh_token }), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
});
