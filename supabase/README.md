# Edge Functions Supabase — état déployé

Quatre fonctions déployées et actives sur le projet `chlmqnrvnrgeaihryreb` (Bill-ops) :

- **`send-invoice`** — envoi via l'API Gmail au nom de l'utilisateur lui-même (plus de SendGrid ni
  de relais SMTP centralisé, abandonnés ; remplace aussi `send-invoice-server.js`, jamais hébergé,
  devenu une référence obsolète). Chaque utilisateur connecte son propre compte Gmail une fois
  (bouton "Connecter mon Gmail"), le `refresh_token` obtenu est stocké côté client (`gmailAuth`,
  syncé) et envoyé à chaque appel. URL codée en dur dans `facture.html`/`mobile/index.html`
  (constante `SEND_INVOICE_URL`, dérivée de `SUPABASE_URL`) :
  `https://chlmqnrvnrgeaihryreb.supabase.co/functions/v1/send-invoice`
- **`oauth-google-callback`** — reçoit le `code` OAuth après consentement Google, l'échange contre
  un `refresh_token`, le dépose dans la table `oauth_pending` (clé = `state`).
- **`oauth-google-poll`** — pollée par le client pour récupérer le `refresh_token` déposé par
  `oauth-google-callback` (la CSP des Edge Functions bloque le `postMessage()` direct depuis la
  page de callback, d'où ce détour). Voir la section "Envoi de factures" de `CLAUDE.md` pour le
  détail du flux.
- **`notify-upcoming-bookings`** — rappel push ~15 min avant le début d'une presta pointée.
  Planifié via `pg_cron` toutes les 3 minutes (job `notify-upcoming-bookings`, voir
  `select * from cron.job;`).

Les quatre sont déployées avec `--no-verify-jwt` (appelées directement en `fetch()` depuis
`facture.html`/`mobile/index.html`, ou par `pg_cron` — pas par un client Supabase authentifié).
`notify-upcoming-bookings` vérifie un header `x-cron-secret` ; `send-invoice` et
`oauth-google-poll` vérifient un header `x-app-secret` (constante `APP_RELAY_SECRET`, identique
dans les deux fichiers client et dans le secret `APP_RELAY_SECRET` côté fonction) — protection
légère contre le scan automatisé, pas une vraie auth (le secret est dans du code client public).
`oauth-google-callback` n'a pas cette protection (appelée par une redirection Google, pas par le
client) — sa seule protection est le `state` à usage unique. Si ça devient un vrai produit
multi-utilisateurs, prévoir mieux (auth par utilisateur + rate limit en base) : voir le commentaire
en tête de `supabase/functions/send-invoice/index.ts`.

## Table `oauth_pending`
Handoff temporaire pour le flux OAuth Gmail (voir ci-dessus). Colonnes : `state` (clé, nonce
généré côté client), `refresh_token`, `email`, `created_at`. RLS activé (accès uniquement via
service role key, utilisée par les deux fonctions `oauth-google-*`) ; purge automatique des lignes
> 10 min faite par `oauth-google-callback` à chaque appel, et suppression immédiate dès lecture par
`oauth-google-poll` (usage unique).

## Secrets configurés
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`APP_RELAY_SECRET` (via `supabase secrets set`, jamais commités).
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` sont injectés automatiquement par Supabase dans toute
Edge Function.

`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` viennent d'un identifiant OAuth "Web application" créé
dans Google Cloud Console (API activée : Gmail API), avec comme URI de redirection autorisée
exactement l'URL de `oauth-google-callback` :
`https://chlmqnrvnrgeaihryreb.supabase.co/functions/v1/oauth-google-callback`.
`GOOGLE_CLIENT_ID` doit aussi être recopié en dur dans `facture.html`/`mobile/index.html`
(constante `GOOGLE_CLIENT_ID`, publique par nature pour un client OAuth). Tant que l'écran de
consentement OAuth du projet Google Cloud reste en mode "Testing" (non publié/vérifié), seuls les
comptes Google ajoutés comme testeurs peuvent se connecter et les refresh tokens expirent après 7
jours — passer en production côté Google Cloud Console avant un usage multi-utilisateurs réel.

```
npx supabase secrets set GOOGLE_CLIENT_ID=<client id> GOOGLE_CLIENT_SECRET=<client secret> \
  APP_RELAY_SECRET=<valeur de APP_RELAY_SECRET dans facture.html/mobile/index.html>
```

## Redéployer après une modification du code

```
cd "bill ops"
npx supabase link --project-ref chlmqnrvnrgeaihryreb   # si pas déjà lié dans ce Terminal
npx supabase functions deploy send-invoice --no-verify-jwt
npx supabase functions deploy oauth-google-callback --no-verify-jwt
npx supabase functions deploy oauth-google-poll --no-verify-jwt
npx supabase functions deploy notify-upcoming-bookings --no-verify-jwt
```

Nécessite d'être connecté (`npx supabase login`, une seule fois par machine — ouvre le navigateur).

## Vérifier que ça tourne

```
# Ticks du cron
npx supabase db query --linked "select * from cron.job_run_details order by start_time desc limit 5;"

# Réponses HTTP réelles de la fonction (pas juste que la requête a été envoyée)
npx supabase db query --linked "select status_code, created, left(content::text,200) as body from net._http_response order by created desc limit 5;"

# Test manuel de notify-upcoming-bookings (remplacer <CRON_SECRET>)
curl -i -X POST 'https://chlmqnrvnrgeaihryreb.supabase.co/functions/v1/notify-upcoming-bookings' -H 'x-cron-secret: <CRON_SECRET>'

# Logs d'une fonction
npx supabase functions logs notify-upcoming-bookings
```
