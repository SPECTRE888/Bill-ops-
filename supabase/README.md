# Edge Functions Supabase — état déployé

Dix fonctions déployées et actives sur le projet `chlmqnrvnrgeaihryreb` (Bill-ops) :

- **`send-invoice`** — envoi via l'API Gmail au nom de l'utilisateur lui-même (plus de SendGrid ni
  de relais SMTP centralisé, abandonnés ; remplace aussi `send-invoice-server.js`, jamais hébergé,
  devenu une référence obsolète). Chaque utilisateur connecte son propre compte Gmail une fois
  (bouton "Connecter mon Gmail"), le `refresh_token` obtenu est stocké côté client (`gmailAuth`,
  **pas synchronisé entre appareils depuis le retrait du code de synchro**, voir `CLAUDE.md`) et
  envoyé à chaque appel. URL codée en dur dans `facture.html`/`mobile/index.html`
  (constante `SEND_INVOICE_URL`, dérivée de `SUPABASE_URL`) :
  `https://chlmqnrvnrgeaihryreb.supabase.co/functions/v1/send-invoice`
- **`oauth-google-callback`** — reçoit le `code` OAuth après consentement Google, l'échange contre
  un `refresh_token`, le dépose dans la table `oauth_pending` (clé = `state`).
- **`oauth-google-poll`** — pollée par le client pour récupérer le `refresh_token` déposé par
  `oauth-google-callback` (la CSP des Edge Functions bloque le `postMessage()` direct depuis la
  page de callback, d'où ce détour). Voir la section "Envoi de factures" de `CLAUDE.md` pour le
  détail du flux.
- **`notify-upcoming-bookings`** — rappel push ~15 min avant le début d'une presta pointée. Lit
  directement les tables `bookings`/`push_subscriptions` (voir plus bas) depuis le 2026-08-05 —
  avant ça lisait/écrivait tout dans `billops_sync`, migré en même temps que le reste pour ne pas
  arrêter de fonctionner silencieusement une fois le code de synchro retiré côté client. Planifié
  via `pg_cron` toutes les 3 minutes (job `notify-upcoming-bookings`, voir `select * from
  cron.job;`).
- **`check-access`** — GET, bearer token Supabase Auth. Résout l'utilisateur, lit la dernière
  ligne `subscriptions`, retourne `{allowed, status, plan, period, expiresAt}` (`allowed` basé sur
  `expires_at > now`, pas sur `status` seul — accès conservé jusqu'à fin de période après
  annulation).
- **`stripe-checkout`** — POST, bearer token. `{action:'subscribe'}` crée/retrouve le Customer
  Stripe et une Checkout Session (`STRIPE_PRICE_ID_MONTHLY`) ; `{action:'portal'}` crée une session
  de portail de facturation. Retourne `{url}` à ouvrir/rediriger côté client.
- **`stripe-webhook`** — POST, signature Stripe (`STRIPE_WEBHOOK_SECRET`, body brut). Synchronise
  `subscriptions` sur `customer.subscription.created/updated/deleted` et `invoice.payment_failed`.
  Même compte Stripe que BAR OPS, produit/prix et endpoint webhook dédiés à Helm.
- **`delete-account`** — POST, bearer token. Supprime définitivement le compte de l'utilisateur
  connecté : annule son abonnement Stripe actif s'il existe (best-effort), puis
  `auth.admin.deleteUser` — toutes les tables applicatives (`clients`, `bookings`, `invoices`,
  `company_info`, `push_subscriptions`, `profiles`, `subscriptions`) référencent `auth.users(id)`
  en `ON DELETE CASCADE`, donc supprimer l'utilisateur Auth suffit à tout effacer côté serveur.
  Appelée depuis le bouton "Supprimer" de la carte Informations (`facture.html`, onglet Profil —
  pas encore répliqué sur mobile).
- **`oauth-relay`** — sert la page HTML de relais du login Google desktop (voir juste en dessous).
- **`auth-relay-deposit`**/**`auth-relay-poll`** — handoff des tokens de session Supabase Auth pour
  le login Google côté Electron desktop (pas d'origine https locale pour un `redirectTo` direct) :
  `oauth-relay` dépose les tokens via `auth-relay-deposit`, l'app les récupère par polling sur
  `auth-relay-poll` (table `login_relay`, usage unique) — même principe que
  `oauth-google-callback`/`oauth-google-poll` ci-dessus, table séparée (`oauth_pending` reste
  dédiée au seul flux Gmail-send).

  `oauth-relay` a remplacé `mobile/oauth-relay.html` (hébergée sur GitHub Pages) le 2026-08-21 :
  à ce moment-là, la PWA mobile venait d'être bougée sur un domaine perso GitHub Pages
  (`app.ops-suite.fr`) — ouvrir la page de relais sur ce même domaine tombait dans le
  `"scope": "./"` du `manifest.json` de la PWA, un onglet Safari affichant "Connexion en cours…"
  basculait alors tout seul vers le `start_url` de la PWA (`index.html`) quelques secondes après,
  sans qu'aucun code de la page de relais ne redirige quoi que ce soit (comportement du
  navigateur/OS pour une PWA installée, pas un bug JS). La servir depuis `*.supabase.co` (hors de
  tout scope PWA) élimine le problème, indépendamment d'où vit la PWA elle-même.

Les dix sont déployées avec `--no-verify-jwt` (appelées directement en `fetch()` depuis
`facture.html`/`mobile/index.html`, ou par `pg_cron` — pas par un client Supabase authentifié).
`notify-upcoming-bookings` vérifie un header `x-cron-secret` ; `send-invoice`, `oauth-google-poll`
et `auth-relay-deposit`/`auth-relay-poll` vérifient un header `x-app-secret` (constante
`APP_RELAY_SECRET`, identique dans les deux fichiers client et dans le secret `APP_RELAY_SECRET`
côté fonction) — protection légère contre le scan automatisé, pas une vraie auth (le secret est
dans du code client public). `check-access` et `stripe-checkout` vérifient à la place un vrai
`Authorization: Bearer <token Supabase>` (l'utilisateur doit être réellement connecté).
`stripe-webhook` vérifie la signature Stripe, pas de secret partagé (appelée par Stripe, pas par le
client). `oauth-google-callback` n'a pas de protection (appelée par une redirection Google) — sa
seule protection est le `state` à usage unique. Si ça devient un vrai produit multi-utilisateurs à
plus grande échelle, prévoir mieux (rate limit en base) : voir le commentaire en tête de
`supabase/functions/send-invoice/index.ts`.

## Table `oauth_pending`
Handoff temporaire pour le flux OAuth Gmail-send (voir ci-dessus). Colonnes : `state` (clé, nonce
généré côté client), `refresh_token`, `email`, `created_at`. RLS activé (accès uniquement via
service role key, utilisée par les deux fonctions `oauth-google-*`) ; purge automatique des lignes
> 10 min faite par `oauth-google-callback` à chaque appel, et suppression immédiate dès lecture par
`oauth-google-poll` (usage unique).

## Tables `clients` / `bookings` / `invoices` / `company_info` / `push_subscriptions`
Stockage cloud par utilisateur (voir la section "Stockage cloud" de `CLAUDE.md` pour le détail
du flux — migration, hydrateFromCloud, flags par clé). Toutes scindées par `user_id
references auth.users(id)`, RLS complète select/insert/update/delete `using (auth.uid() =
user_id)` — contrairement à `profiles`/`subscriptions`, ces tables sont écrites directement par
le client via son JWT de session, pas par une Edge Function. `push_subscriptions` a `endpoint`
comme clé primaire (identifiant naturel côté navigateur), pas de policy update (juste
select/insert/delete). Migrations : `supabase/migrations/20260805122943_cloud_storage.sql` et
`20260805131409_push_subscriptions.sql`.
Remplace l'ancienne table `billops_sync` (blob JSON unique par "code de synchro", sans notion de
compte) — celle-ci existe toujours côté Supabase mais n'est plus lue/écrite par le client ni par
`notify-upcoming-bookings`.

## Tables `profiles` / `subscriptions` / `login_relay`
Login Google + abonnement Stripe (voir la section dédiée dans `CLAUDE.md` pour le flux complet).
`profiles` (`id, email, full_name, avatar_url`) est remplie automatiquement par un trigger
`handle_new_user` sur `auth.users` — jamais écrite côté client, lecture seule (`select using
(auth.uid() = id)`). `subscriptions` (`user_id, status, plan, period, expires_at,
stripe_customer_id, stripe_subscription_id`) n'est écrite que par les Edge Functions (service
role) ; le contrôle d'accès faisant foi est toujours `check-access`, jamais une lecture directe
côté client. `login_relay` (`state, access_token, refresh_token`) est le handoff desktop décrit
ci-dessus, RLS activé sans policy (service role only), purge > 2 min + suppression à la lecture.
Migration versionnée : `supabase/migrations/20260804102232_login_paywall.sql`.

## Secrets configurés
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`APP_RELAY_SECRET` (via `supabase secrets set`, jamais commités).
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` sont injectés automatiquement par Supabase dans toute
Edge Function.

`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_ID_MONTHLY` sont posés et fonctionnels
depuis le 2026-08-05 (login/abonnement vérifié en usage réel) — **en mode Stripe Test**. Pour
passer en Live : recréer le produit/prix "Helm Ops" et l'endpoint webhook en mode Live dans le
même compte Stripe (que BAR OPS), puis reposer les 3 secrets avec les valeurs Live :

```
npx supabase secrets set STRIPE_SECRET_KEY=<clé secrète live> \
  STRIPE_WEBHOOK_SECRET=<signing secret live de l'endpoint Helm> \
  STRIPE_PRICE_ID_MONTHLY=<price id live du produit Helm Ops>
```

⚠️ Le webhook Stripe n'est pas filtré par produit — la destination Helm reçoit tous les events des
types écoutés sur l'ensemble du compte, y compris ceux de BAR OPS. `stripe-checkout` tague chaque
abonnement Helm avec `metadata.app='helm'` et `stripe-webhook` ignore tout ce qui n'a pas ce
marqueur (voir le commentaire en tête de `supabase/functions/stripe-webhook/index.ts`) — pas
vérifié côté BAR OPS que leur webhook fait de même avec les events Helm.

Côté Supabase Dashboard (`chlmqnrvnrgeaihryreb`), déjà configuré : Authentication → Providers →
Google (Client ID/Secret = `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`) ; Authentication → URL
Configuration → `https://helm-ops-ivory.vercel.app/**` (login PWA mobile) et
`https://chlmqnrvnrgeaihryreb.supabase.co/functions/v1/oauth-relay**` (relais desktop) dans les
redirect URLs autorisées (le wildcard `**` est nécessaire — le `redirectTo` du flux desktop porte
un `?state=...` dynamique qui ne matche pas une entrée sans wildcard, Supabase retombe alors
silencieusement sur le Site URL par défaut du projet). Et côté Google Cloud Console :
`https://chlmqnrvnrgeaihryreb.supabase.co/auth/v1/callback` ajouté comme second "Authorized
redirect URI" sur le client OAuth déjà utilisé pour Gmail-send.

`mobile/` est hébergée sur Vercel (`helm-ops-ivory.vercel.app`, projet `helm-ops`, déploiement
continu branché sur `main` via `vercel git connect`, Root Directory réglé sur `mobile` côté
Vercel) — même pattern que BAR OPS (`bar-ops-v2.vercel.app`). Avant le 2026-08-21 : GitHub Pages,
d'abord en `spectre888.github.io/Bill-ops-/` (exposait le pseudo GitHub personnel dans l'URL),
puis brièvement en domaine perso `app.ops-suite.fr` — abandonné aussi car `ops-suite.fr` est
réservé au mailing (`mail.ops-suite.fr`) et à une future plateforme multi-produits, pas à l'URL
d'un produit Helm spécifique (décision utilisateur explicite). GitHub Pages désactivé pour ce
repo (`gh api -X DELETE repos/.../pages`), `.github/workflows/pages.yml` supprimé.

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
npx supabase functions deploy check-access --no-verify-jwt
npx supabase functions deploy stripe-checkout --no-verify-jwt
npx supabase functions deploy stripe-webhook --no-verify-jwt
npx supabase functions deploy oauth-relay --no-verify-jwt
npx supabase functions deploy auth-relay-deposit --no-verify-jwt
npx supabase functions deploy auth-relay-poll --no-verify-jwt
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
