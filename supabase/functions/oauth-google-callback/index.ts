// Callback OAuth Google — reçoit le "code" après que l'utilisateur a autorisé l'app sur son
// compte Gmail (bouton "Connecter mon Gmail" dans Mon entreprise / Réglages), l'échange contre un
// refresh_token, et le dépose temporairement dans la table oauth_pending (clé = "state", un nonce
// généré côté client avant d'ouvrir la popup). Le client (facture.html/mobile/index.html) poll
// oauth-google-poll avec ce même state pour récupérer le jeton.
//
// Pourquoi pas un simple postMessage() depuis la page de callback vers window.opener ? Supabase
// impose une Content-Security-Policy stricte (sandbox) sur toutes les réponses d'Edge Functions,
// qui bloque l'exécution de script inline — impossible de faire du postMessage depuis cette page.
// D'où le détour par une table de handoff + polling côté client.

import { createClient } from 'npm:@supabase/supabase-js@2';

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const REDIRECT_URI = 'https://chlmqnrvnrgeaihryreb.supabase.co/functions/v1/oauth-google-callback';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function textResponse(body: string, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

function decodeJwtPayload(idToken: string): any {
  const payload = idToken.split('.')[1];
  const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
  const json = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(json);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (oauthError) {
    return textResponse('Connexion refusée (' + oauthError + '). Tu peux fermer cette fenêtre.');
  }
  if (!code || !state) {
    return textResponse('Requête invalide.', 400);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.refresh_token) {
      return textResponse('Échec de la connexion Gmail (' + (tokenData.error_description || tokenData.error || 'no_refresh_token') + '). Tu peux fermer cette fenêtre.');
    }
    let email = '';
    if (tokenData.id_token) {
      try { email = decodeJwtPayload(tokenData.id_token).email || ''; } catch { /* ignore */ }
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    await supabase.from('oauth_pending').delete().lt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());
    const { error: dbError } = await supabase.from('oauth_pending').upsert({
      state,
      refresh_token: tokenData.refresh_token,
      email,
    });
    if (dbError) {
      return textResponse('Erreur interne (' + dbError.message + '). Tu peux fermer cette fenêtre.', 500);
    }

    return textResponse('Connexion réussie (' + email + '). Tu peux fermer cette fenêtre.');
  } catch (e) {
    return textResponse('Erreur : ' + String((e as Error)?.message || e) + '. Tu peux fermer cette fenêtre.', 500);
  }
});
