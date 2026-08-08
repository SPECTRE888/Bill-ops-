// Envoi de factures via SMTP (mot de passe d'application), au nom de l'utilisateur lui-même.
// Remplace le flux OAuth Gmail précédent (voir git history / CLAUDE.md) : chaque utilisateur
// génère un mot de passe d'application dans son compte Google (Sécurité → Validation en 2 étapes
// → Mots de passe des applications) et le colle dans Helm Ops avec son adresse Gmail — plus de
// Google Cloud Console, plus d'écran "app non vérifiée", auto-service complet.
//
// Gmail uniquement pour l'instant : smtp.gmail.com accepte le port 465 (TLS implicite), seul port
// SMTP que les Edge Functions Supabase autorisent en sortie (25 et 587 sont bloqués) — ce qui
// exclut Outlook/Office365 (SMTP uniquement en 587) tant que ça reste une Edge Function Supabase.
//
// Pas d'auth Supabase ici (appelé en fetch() simple depuis facture.html/mobile/index.html) :
// protégé par un secret partagé APP_RELAY_SECRET (même principe que x-cron-secret sur
// notify-upcoming-bookings) pour limiter le scan automatisé — pas une vraie auth, le secret est
// dans du code client public. La vraie protection ici est que chaque requête doit porter un mot
// de passe d'application Gmail valide appartenant à l'utilisateur.

import nodemailer from 'npm:nodemailer@6';

const APP_RELAY_SECRET = Deno.env.get('APP_RELAY_SECRET');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-app-secret',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GMAIL_DOMAINS = ['gmail.com', 'googlemail.com'];
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

  const { email, appPassword, fromName, to, subject, html, pdfBase64, pdfFilename } = body ?? {};
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return new Response('Adresse Gmail expéditrice invalide.', { status: 400, headers: CORS_HEADERS });
  }
  const domain = email.split('@')[1]?.toLowerCase() || '';
  if (!GMAIL_DOMAINS.includes(domain)) {
    return new Response('Seules les adresses Gmail sont supportées pour le moment.', { status: 400, headers: CORS_HEADERS });
  }
  if (!appPassword || typeof appPassword !== 'string') {
    return new Response("Mot de passe d'application manquant.", { status: 400, headers: CORS_HEADERS });
  }
  if (!to || typeof to !== 'string' || !EMAIL_RE.test(to)) {
    return new Response('Adresse "to" invalide.', { status: 400, headers: CORS_HEADERS });
  }

  const safeFromName = stripHeaderInjection(String(fromName || 'Helm Ops'));
  const safeSubject = stripHeaderInjection(String(subject || 'Facture'));

  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: email, pass: appPassword },
  });

  try {
    await transport.sendMail({
      from: `"${safeFromName.replace(/"/g, "'")}" <${email}>`,
      to,
      subject: safeSubject,
      html: html || '',
      attachments: pdfBase64
        ? [{ filename: pdfFilename || 'facture.pdf', content: pdfBase64, encoding: 'base64', contentType: 'application/pdf' }]
        : [],
    });
    return new Response('OK', { status: 200, headers: CORS_HEADERS });
  } catch (e) {
    return new Response(String((e as Error)?.message || e), { status: 502, headers: CORS_HEADERS });
  }
});
