# Edge Functions Supabase — état déployé (à jour au 2026-08-24)

Six fonctions déployées et actives sur le projet `chlmqnrvnrgeaihryreb` (Helm Ops), toutes dans
`supabase/functions/` :

- **`send-invoice`** — envoi centralisé via l'API Brevo depuis `mail.ops-suite.fr` (voir la section
  "Envoi de factures" de `CLAUDE.md`). Vérifie `x-app-secret` (protection légère, secret public
  côté client), un vrai `Authorization: Bearer <token Supabase>`, **et depuis le 2026-08-24** un
  abonnement actif (`subscriptions.expires_at > now`, même logique que `check-access`) — sans ce
  dernier contrôle, un compte inscrit mais non payant pouvait utiliser le domaine mutualisé
  (authentifié SPF/DKIM/DMARC) comme relais email gratuit.
- **`notify-upcoming-bookings`** — rappel push ~15 min avant le début d'une presta pointée. Lit
  directement `bookings`/`push_subscriptions`. Vérifie `x-cron-secret`. Planifiée via `pg_cron`
  toutes les 3 minutes (job `notify-upcoming-bookings`, voir `select * from cron.job;`).
- **`check-access`** — GET, bearer token Supabase Auth. Résout l'utilisateur, lit la dernière ligne
  `subscriptions`, retourne `{allowed, status, plan, period, expiresAt}` (`allowed` basé sur
  `expires_at > now`, pas sur `status` seul — accès conservé jusqu'à fin de période après
  annulation).
- **`stripe-checkout`** — POST, bearer token. `{action:'subscribe'}` crée/retrouve le Customer
  Stripe et une Checkout Session (`STRIPE_PRICE_ID_MONTHLY`) ; `{action:'portal'}` crée une session
  de portail de facturation. Retourne `{url}` à ouvrir/rediriger côté client.
- **`stripe-webhook`** — POST, signature Stripe vérifiée avant tout traitement
  (`STRIPE_WEBHOOK_SECRET`, body brut). Synchronise `subscriptions` sur
  `customer.subscription.created/updated/deleted` et `invoice.payment_failed`. Même compte Stripe
  que BAR OPS, produit/prix et endpoint webhook dédiés à Helm — filtré par `metadata.app==='helm'`.
- **`delete-account`** — POST, bearer token. Supprime définitivement le compte de l'utilisateur
  connecté : annule son abonnement Stripe actif s'il existe (best-effort), puis
  `auth.admin.deleteUser` — toutes les tables applicatives référencent `auth.users(id)` en
  `ON DELETE CASCADE`, donc supprimer l'utilisateur Auth suffit à tout effacer côté serveur.

Toutes déployées avec `--no-verify-jwt` (appelées directement en `fetch()` depuis
`facture.html`/`mobile/index.html`, ou par `pg_cron`). `check-access`, `stripe-checkout`,
`send-invoice` et `delete-account` vérifient un vrai `Authorization: Bearer <token Supabase>`.
`stripe-webhook` vérifie la signature Stripe. `notify-upcoming-bookings` vérifie `x-cron-secret`.

## ⚠️ Fonctions et tables supprimées le 2026-08-23 (audit de sécurité) — ne pas redéployer

`oauth-google-callback`, `oauth-google-poll`, `auth-relay-deposit`, `auth-relay-poll` (ancien flow
OAuth Gmail-send + relais desktop Vercel `helm-relay.vercel.app`), et les tables `oauth_pending`,
`login_relay`, `billops_sync` ont été supprimées définitivement — voir le tout début de `CLAUDE.md`
pour le détail de la faille (URL de relais restée whitelistée côté Supabase Auth, exploitable par
phishing à distance). Ce fichier README documentait encore ces commandes de déploiement jusqu'au
2026-08-24 — un ancien risque opérationnel en soi (suivre ce README à l'aveugle aurait littéralement
recréé la faille). Si vous retrouvez du code source pour l'une de ces fonctions quelque part, ne le
redéployez pas.

## Table `oauth_pending` / `login_relay` / `billops_sync`
Supprimées. Voir ci-dessus et `CLAUDE.md`.

## Tables `clients` / `bookings` / `invoices` / `company_info` / `push_subscriptions`
Stockage cloud par utilisateur (voir la section "Stockage cloud" de `CLAUDE.md`). Toutes scindées
par `user_id references auth.users(id)`, RLS complète select/insert/update/delete `using
(auth.uid() = user_id)` — écrites directement par le client via son JWT de session, pas par une
Edge Function. `push_subscriptions` a `endpoint` comme clé primaire, pas de policy update (juste
select/insert/delete). Migrations : `supabase/migrations/20260805122943_cloud_storage.sql` et
`20260805131409_push_subscriptions.sql`.

## Tables `profiles` / `subscriptions`
Login Google/email + abonnement Stripe (voir la section dédiée dans `CLAUDE.md`). `profiles`
(`id, email, full_name, avatar_url`) est remplie automatiquement par un trigger `handle_new_user`
sur `auth.users` — jamais écrite côté client, lecture seule (`select using (auth.uid() = id)`).
Depuis le 2026-08-24, `EXECUTE` sur `handle_new_user()` est révoqué pour `anon`/`authenticated`
(la fonction n'est censée être appelée qu'en tant que trigger, un advisor Supabase signalait
qu'elle restait exécutable en RPC direct — voir
`supabase/migrations/20260824082106_revoke_handle_new_user_rpc.sql`). `subscriptions` (`user_id,
status, plan, period, expires_at, stripe_customer_id, stripe_subscription_id`) n'est écrite que par
les Edge Functions (service role) ; le contrôle d'accès faisant foi est toujours `check-access`,
jamais une lecture directe côté client. Migration versionnée :
`supabase/migrations/20260804102232_login_paywall.sql`.

## Secrets configurés
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `APP_RELAY_SECRET`, `BREVO_API_KEY`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_MONTHLY` (via `supabase secrets
set`, jamais commités). `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` sont injectés automatiquement
par Supabase dans toute Edge Function.

`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`SENDGRID_API_KEY` (secrets de l'ancien flow Gmail-send/
SendGrid, tous deux abandonnés) ont été supprimés le 2026-08-24 par hygiène — ils n'étaient
référencés par aucune fonction encore déployée.

**Toujours en mode Stripe Test** — bascule en Live à faire manuellement : recréer le produit/prix
"Helm Ops" et l'endpoint webhook en mode Live dans le même compte Stripe (que BAR OPS), puis
reposer les 3 secrets avec les valeurs Live :

```
npx supabase secrets set STRIPE_SECRET_KEY=<clé secrète live> \
  STRIPE_WEBHOOK_SECRET=<signing secret live de l'endpoint Helm> \
  STRIPE_PRICE_ID_MONTHLY=<price id live du produit Helm Ops>
```

⚠️ Le webhook Stripe n'est pas filtré par produit au niveau Stripe — la destination Helm reçoit
tous les events des types écoutés sur l'ensemble du compte, y compris ceux de BAR OPS.
`stripe-checkout` tague chaque abonnement Helm avec `metadata.app='helm'` et `stripe-webhook`
ignore tout ce qui n'a pas ce marqueur (voir le commentaire en tête de
`supabase/functions/stripe-webhook/index.ts`).

Côté Supabase Dashboard (`chlmqnrvnrgeaihryreb`), Authentication → URL Configuration →
`uri_allow_list` ne doit contenir que `https://spectre888.github.io/Bill-ops-/**` (PWA mobile) et
`http://127.0.0.1:59877/callback**` (serveur loopback desktop, voir `CLAUDE.md`) — vérifié propre
au 2026-08-24.

⚠️ **Protection "mot de passe fuité" (HaveIBeenPwned)** : indisponible sur le plan actuel
(réservée au plan Pro Supabase et plus). À activer (Authentication → Policies → Password
Security) si/quand le projet passe sur un plan payant.

## Redéployer après une modification du code

```
cd "bill ops"
npx supabase link --project-ref chlmqnrvnrgeaihryreb   # si pas déjà lié dans ce Terminal
npx supabase functions deploy send-invoice --no-verify-jwt
npx supabase functions deploy check-access --no-verify-jwt
npx supabase functions deploy stripe-checkout --no-verify-jwt
npx supabase functions deploy stripe-webhook --no-verify-jwt
npx supabase functions deploy notify-upcoming-bookings --no-verify-jwt
npx supabase functions deploy delete-account --no-verify-jwt
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
```

`npx supabase functions logs <nom>` n'existe plus dans les versions récentes de la CLI
(`supabase functions` n'a que `list/delete/download/deploy/new/serve`) — passer par le Dashboard
(Edge Functions → la fonction → Logs) pour consulter les logs runtime.
