// Envoi de factures centralisé via l'API Brevo (ex-Sendinblue), depuis le domaine mutualisé
// mail.ops-suite.fr (authentifié SPF/DKIM), avec Reply-To réglé sur l'adresse de connexion
// (Google) de l'utilisateur — remplace le mot de passe d'application Gmail (voir git history /
// CLAUDE.md) : plus aucune configuration côté client, l'utilisateur n'a qu'à être connecté.
// SendGrid a été essayé en premier mais le compte (partagé avec BAR OPS) n'avait plus de crédit
// d'envoi disponible (trial expiré) — Brevo a un vrai plan gratuit permanent (300 mails/jour).
//
// Le nom affiché à l'expéditeur ("From" name) reste celui du client (ex. "Jerome Jarrige"), donc
// le destinataire voit bien le nom de la personne/entreprise qui facture — seule l'adresse
// technique brute (invisible en usage normal) est celle du domaine mutualisé.
//
// Pas d'auth Supabase ici (appelé en fetch() simple depuis facture.html/mobile/index.html) :
// protégé par un secret partagé APP_RELAY_SECRET (même principe que x-cron-secret sur
// notify-upcoming-bookings) pour limiter le scan automatisé.

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!;
const APP_RELAY_SECRET = Deno.env.get('APP_RELAY_SECRET');
const SEND_FROM_EMAIL = 'mail@ops-suite.fr';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-app-secret',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const stripHeaderInjection = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

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

  const { replyTo, fromName, to, subject, html, pdfBase64, pdfFilename } = body ?? {};
  if (!replyTo || typeof replyTo !== 'string' || !EMAIL_RE.test(replyTo)) {
    return new Response('Adresse de réponse (replyTo) invalide.', { status: 400, headers: CORS_HEADERS });
  }
  if (!to || typeof to !== 'string' || !EMAIL_RE.test(to)) {
    return new Response('Adresse "to" invalide.', { status: 400, headers: CORS_HEADERS });
  }

  const safeFromName = stripHeaderInjection(String(fromName || 'Helm Ops'));
  const safeSubject = stripHeaderInjection(String(subject || 'Facture'));

  const payload: any = {
    sender: { email: SEND_FROM_EMAIL, name: safeFromName },
    replyTo: { email: replyTo, name: safeFromName },
    to: [{ email: to }],
    subject: safeSubject,
    htmlContent: html || '<p></p>',
  };
  if (pdfBase64) {
    payload.attachment = [{ content: pdfBase64, name: pdfFilename || 'facture.pdf' }];
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text();
      return new Response(errText, { status: res.status, headers: CORS_HEADERS });
    }
    return new Response('OK', { status: 200, headers: CORS_HEADERS });
  } catch (e) {
    return new Response(String((e as Error)?.message || e), { status: 502, headers: CORS_HEADERS });
  }
});
