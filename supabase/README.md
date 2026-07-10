# Edge Functions Supabase — état déployé

Les deux fonctions sont déployées et actives sur le projet `chlmqnrvnrgeaihryreb` (Bill-ops) :

- **`send-invoice`** — proxy SendGrid (remplace `send-invoice-server.js`, jamais hébergé). URL à
  coller dans l'app, onglet Mon entreprise → Envoi (SendGrid) → Endpoint proxy serveur :
  `https://chlmqnrvnrgeaihryreb.supabase.co/functions/v1/send-invoice`
- **`notify-upcoming-bookings`** — rappel push ~15 min avant le début d'une presta pointée.
  Planifié via `pg_cron` toutes les 3 minutes (job `notify-upcoming-bookings`, voir
  `select * from cron.job;`).

Les deux sont déployées avec `--no-verify-jwt` (appelées directement en `fetch()` depuis
`facture.html`/`mobile/index.html`, ou par `pg_cron` — pas par un client Supabase authentifié).
`notify-upcoming-bookings` vérifie elle-même un header `x-cron-secret` ; `send-invoice` n'a pas
besoin de protection supplémentaire, elle ne peut rien faire sans une vraie clé API SendGrid.

## Secrets configurés
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET` (via `supabase secrets set`, jamais commités).
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` sont injectés automatiquement par Supabase dans toute
Edge Function.

## Redéployer après une modification du code

```
cd "bill ops"
npx supabase link --project-ref chlmqnrvnrgeaihryreb   # si pas déjà lié dans ce Terminal
npx supabase functions deploy send-invoice --no-verify-jwt
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
