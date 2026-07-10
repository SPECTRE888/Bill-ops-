// Proxy SendGrid — remplace send-invoice-server.js (jamais hébergé) par une Edge Function,
// pour ne pas avoir à monter/payer un hébergement séparé juste pour cet endpoint.
// Appelé directement par facture.html et mobile/index.html (fetch simple, pas de client Supabase),
// donc pas d'auth Supabase ici : la seule protection est qu'il faut une vraie clé API SendGrid
// pour que l'envoi aboutisse (même modèle de confiance que l'ancien serveur Express).

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS_HEADERS });
  }

  const { apiKey, from, to, subject, html } = body ?? {};
  if (!apiKey || !from || !to) {
    return new Response('apiKey, from et to sont requis.', { status: 400, headers: CORS_HEADERS });
  }

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject: subject || 'Facture',
      content: [{ type: 'text/html', value: html || '' }],
    }),
  });

  if (res.ok) return new Response('OK', { status: 200, headers: CORS_HEADERS });
  const errText = await res.text();
  return new Response(errText, { status: res.status, headers: CORS_HEADERS });
});
