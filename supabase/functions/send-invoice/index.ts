// Envoi de factures via l'API Gmail, au nom de l'utilisateur lui-même (plus de SendGrid, plus de
// relais technique commun) : chaque utilisateur connecte son propre compte Gmail une fois (bouton
// "Connecter mon Gmail" dans Mon entreprise / Réglages, voir oauth-google-callback), le
// refresh_token obtenu est stocké côté client et envoyé à chaque appel ici. Le mail part donc
// littéralement depuis l'adresse Gmail de l'utilisateur — pas d'usurpation, l'API Gmail n'accepte
// que l'adresse du compte authentifié dans le "From:".
//
// Pas d'auth Supabase ici (appelé en fetch() simple depuis facture.html/mobile/index.html) :
// protégé par un secret partagé APP_RELAY_SECRET (même principe que x-cron-secret sur
// notify-upcoming-bookings) pour limiter le scan automatisé — pas une vraie auth, le secret est
// dans du code client public. La vraie protection ici est que chaque requête doit porter un
// refresh_token Gmail valide appartenant à l'utilisateur.

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const APP_RELAY_SECRET = Deno.env.get('APP_RELAY_SECRET');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-app-secret',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const stripHeaderInjection = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
function toBase64Url(str: string): string {
  return utf8ToBase64(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function encodeMimeWord(s: string): string {
  return `=?UTF-8?B?${utf8ToBase64(s)}?=`;
}

async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Échec du rafraîchissement du jeton Gmail.');
  return data.access_token;
}

function buildRawMime(opts: { fromName: string; fromEmail: string; to: string; subject: string; html: string }): string {
  const lines = [
    `From: "${opts.fromName.replace(/"/g, "'")}" <${opts.fromEmail}>`,
    `To: ${opts.to}`,
    `Subject: ${encodeMimeWord(opts.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    utf8ToBase64(opts.html),
  ];
  return lines.join('\r\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });

  if (APP_RELAY_SECRET && req.headers.get('x-app-secret') !== APP_RELAY_SECRET) {
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS_HEADERS });
  }

  const { refreshToken, fromEmail, fromName, to, subject, html } = body ?? {};
  if (!refreshToken || typeof refreshToken !== 'string') {
    return new Response('Compte Gmail non connecté.', { status: 400, headers: CORS_HEADERS });
  }
  if (!fromEmail || typeof fromEmail !== 'string' || !EMAIL_RE.test(fromEmail)) {
    return new Response('Adresse Gmail expéditrice invalide.', { status: 400, headers: CORS_HEADERS });
  }
  if (!to || typeof to !== 'string' || !EMAIL_RE.test(to)) {
    return new Response('Adresse "to" invalide.', { status: 400, headers: CORS_HEADERS });
  }

  const safeFromName = stripHeaderInjection(String(fromName || 'Helm Ops'));
  const safeSubject = stripHeaderInjection(String(subject || 'Facture'));

  try {
    const accessToken = await getAccessToken(refreshToken);
    const raw = toBase64Url(buildRawMime({
      fromName: safeFromName,
      fromEmail,
      to,
      subject: safeSubject,
      html: html || '',
    }));
    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });
    if (!sendRes.ok) {
      const errText = await sendRes.text();
      return new Response(errText, { status: sendRes.status, headers: CORS_HEADERS });
    }
    return new Response('OK', { status: 200, headers: CORS_HEADERS });
  } catch (e) {
    return new Response(String((e as Error)?.message || e), { status: 502, headers: CORS_HEADERS });
  }
});
