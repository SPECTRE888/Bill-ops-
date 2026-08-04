# Helm Ops — Gestion complète d'activité (clients, planning, facturation)

Anciennement "Bill Ops" — renommé car l'app dépasse la simple facturation (CRM clients + planning/pointage + facturation). Le repo GitHub (`Bill-ops-`) et la table Supabase (`billops_sync`) gardent leur nom technique historique, décorrélé de la marque affichée.

Fichiers : `facture.html` (app desktop complète, single-file, packagée en app Mac via Electron), `mobile/index.html` (PWA compagnon iPhone, single-file, déployée sur GitHub Pages), `mobile/oauth-relay.html` (page statique de relais pour le login Google côté Electron, voir Login + abonnement ci-dessous), `supabase/functions/` (Edge Functions : `send-invoice` envoi via Gmail API au nom de l'utilisateur, `oauth-google-callback`/`oauth-google-poll` handoff du flux OAuth Gmail-send, `check-access`/`stripe-checkout`/`stripe-webhook`/`auth-relay-deposit`/`auth-relay-poll` login + abonnement, `notify-upcoming-bookings` rappels push). `send-invoice-server.js` (ancienne version Express, référence obsolète pré-SMTP, pas utilisée en prod).

## Stack
HTML/CSS/JS vanilla, localStorage (from, clients, invoices, bookings, invCounters, inv_theme).
Thème dark/light/auto (tokens BAR OPS), fonts Cormorant Garamond + Jost.

## Sync multi-device (Mac ↔ iPhone)
`facture.html` et `mobile/index.html` partagent les mêmes données via Supabase (table `billops_sync`, clé anon publique — même modèle de confiance que le reste de l'app client-side). Principe : un "code de synchro" aléatoire sert de clé pour une ligne unique en base contenant tout l'état (`from, clients, invoices, bookings, invCounters, inv_theme, pushSubscriptions`) en un seul blob JSON. Toute écriture locale (`set(k,v)`) déclenche un push debounced (1.2s) ; chaque appareil pull toutes les 60s + au retour au premier plan (`visibilitychange`). Whole-blob last-write-wins, pas de fusion par enregistrement — acceptable pour un usage solo sur deux appareils utilisés séquentiellement.
Le code peut être généré des deux côtés : Mon entreprise → Synchronisation sur Mac, ou "Créer un compte" sur l'écran de pairing mobile (utilisateur sans Mac). Dans les deux cas on colle ensuite ce même code sur l'autre appareil pour le pairer. Le code généré côté mobile reste consultable après coup dans Réglages → Synchronisation → "Voir le code".
`SYNC_KEYS` doit toujours être identique dans les deux fichiers (même si une clé n'est utilisée activement que d'un côté, ex. `pushSubscriptions`) : `pushSync()` remplace tout le blob JSON à chaque écriture, donc une clé absente d'un des deux serait effacée silencieusement au prochain push de l'autre appareil.

## Onglets (nav gauche, groupés par catégorie)
Accueil : tableau de bord (CA du mois, prestas à venir, factures en attente, heures prévues, prochaine presta, actions rapides), onglet par défaut, sans catégorie (item unique en haut de nav).
Catégorie Planning : Planning (prestas à venir uniquement) → Calendrier (calendrier CA/jour + prévisionnel du mois + formulaire booking, séparé de Planning).
Catégorie Facturation : Pointage (prestas à facturer, sélection multi-prestas d'un même client → une seule facture via `invoiceSelectedBookings()`) → Facture (preview visible seulement ici, formulaire tenant sur un écran sans scroll, prestations scrollables en interne) → Historique (recherche + Voir/Modifier/PDF/Renvoyer + stats CA mois/année/total/par client, liste scrollable en interne sans faire défiler la page).
Catégorie Clients : Mes clients.
Catégorie Paramètres (en bas de nav, après le spacer) : Mon entreprise + sélecteur de thème dark/light/auto.

## Layout
`.app` est bloqué à `height:100vh` avec 3 colonnes qui scrollent chacune indépendamment (nav fixe, panel, preview) — évite que la sidebar ou le formulaire Facture ne scrollent avec la page.
`mobile/index.html` a sa propre mise en page (barre d'onglets fixe en bas : Pointage/Planning/Factures/Clients), indépendante du layout desktop.

## App mobile (PWA)
`mobile/index.html` — compagnon iPhone installable via Safari (Ajouter à l'écran d'accueil), pas d'app native/App Store. Objectif : utilisable en autonomie complète par quelqu'un sans Mac (voir génération de code de synchro ci-dessus). Quatre onglets : Pointage (pointer arrivée/départ, transformer une presta pointée en facture avec extras km/péage/parking/offert/repas), Planning (consultation + ajout/modif/suppression de prestas, comme sur le Mac), Factures (lecture, aperçu en overlay in-app, téléchargement PDF, envoi par email — automatique, aucune config requise, voir Envoi de factures ci-dessous), Clients (CRUD clients, même modèle de données que `facture.html` — `name/prefix/email/phone/addr`, `prefix` utilisé pour la numérotation des factures). Réglages (accès via l'icône engrenage, pas dans la barre du bas) contient aussi Mon entreprise (formulaire repliable, même modèle `from` que `facture.html`), volontairement pas un onglet séparé pour ne pas alourdir la nav.
Champs additionnels sur les objets `bookings` (optionnels, rétrocompatibles) : `checkedInAt`, `checkedOutAt` (timestamps ISO), `actualHours` (arrondi au quart d'heure), `notifiedAt` (posé par la Edge Function de notification, voir plus bas). `facture.html:invoiceBooking` utilise les heures réelles pour la ligne de facture quand elles existent, sinon retombe sur `hours`/`from`/`to` statiques.
Déploiement : `.github/workflows/pages.yml` publie le dossier `mobile/` sur GitHub Pages à chaque push touchant `mobile/**` (Pages doit être activé une fois dans Settings → Pages → Source: GitHub Actions).

## Notifications push ("la presta commence bientôt")
Web Push standard (VAPID), supporté par Safari iOS 16.4+ pour les PWA installées sur l'écran d'accueil. Bouton "Activer les notifications" dans le header mobile → abonnement stocké dans `pushSubscriptions` (synced comme le reste, pas de table dédiée). Une Edge Function Supabase (`supabase/functions/notify-upcoming-bookings`), déclenchée toutes les ~3 min par pg_cron, scanne les bookings non pointés dont l'heure de début tombe dans une fenêtre ~10-20 min à venir (viser un rappel ~15 min avant, tolérant un tick pg_cron manqué) et envoie une notification (sans contenu chiffré, texte fixe géré par `mobile/sw.js`), puis pose `notifiedAt` pour ne pas re-notifier. Les abonnements qui répondent 404/410 (révoqués côté navigateur) sont retirés automatiquement de `pushSubscriptions`.
Déploiement des Edge Functions (`send-invoice`, `notify-upcoming-bookings`) : voir `supabase/README.md` — nécessite un compte Supabase authentifié en CLI (login une fois via navigateur ; link/deploy/secrets ensuite automatisables).

## Envoi de factures (OAuth Gmail par utilisateur, plus de SMTP relais commun)
Depuis le 2026-08-04 : chaque utilisateur connecte son propre compte Gmail une fois (bouton
"Connecter mon Gmail" dans Mon entreprise / Réglages), et l'envoi se fait via l'API Gmail au nom de
l'utilisateur lui-même — plus de compte mail technique partagé (l'étape SMTP centralisé du
2026-08-03 est abandonnée). Le mail part littéralement depuis l'adresse Gmail de l'utilisateur
(l'API Gmail n'accepte que l'adresse du compte authentifié en `From:`), donc plus besoin de
Reply-To ni de `from.email` séparé pour ça.

Flux OAuth (Authorization Code, `access_type=offline&prompt=consent` pour obtenir un
`refresh_token`) :
1. `connectGmail()` (`facture.html`/`mobile/index.html`) ouvre une popup vers
   `accounts.google.com/o/oauth2/v2/auth` avec un `state` aléatoire, scope
   `openid email https://www.googleapis.com/auth/gmail.send`.
2. Google redirige vers l'Edge Function `oauth-google-callback` (redirect URI enregistrée côté
   Google Cloud Console), qui échange le `code` contre un `refresh_token` et le dépose dans la
   table `oauth_pending` (clé = `state`, purge auto après 10 min).
3. Le client poll `oauth-google-poll` toutes les 1.5s avec ce `state` (via `x-app-secret`) ; la
   ligne est supprimée dès qu'elle est lue (usage unique). Pas de `postMessage()` possible : la CSP
   des Edge Functions Supabase bloque le JS inline sur la page de callback, d'où ce détour par
   handoff en base + polling.
4. Le `refreshToken`/`email` obtenus sont stockés dans `gmailAuth` (localStorage, clé ajoutée à
   `SYNC_KEYS` — syncée comme le reste).
5. À l'envoi, `send-invoice` échange le `refreshToken` contre un `access_token` (endpoint standard
   Google), construit le MIME brut et appelle `gmail.googleapis.com/.../messages/send`. Payload
   client : `{refreshToken, fromEmail, fromName, to, subject, html}`, protégé par le même header
   `x-app-secret` que le reste (scan automatisé, pas une vraie auth).

Secrets nécessaires : `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (credentials OAuth Web côté Google
Cloud Console, redirect URI = URL de `oauth-google-callback`). Voir `supabase/README.md`.
Risque connu non encore validé en prod : si l'app OAuth Google Cloud reste en mode "Testing" (écran
de consentement non publié/vérifié), seuls les comptes ajoutés comme testeurs peuvent se connecter
et les refresh tokens expirent au bout de 7 jours — à vérifier/passer en production côté Google
Cloud Console avant un usage multi-utilisateurs réel.

## Login Google + abonnement Stripe (porte d'entrée de l'app)
Depuis le 2026-08-04 : l'app est gated par une connexion Google (Supabase Auth) + une vérification
d'abonnement Stripe, indépendante du système "connecter mon Gmail" (envoi de factures) et du code
de synchro (pairing d'appareils) — trois mécanismes distincts qui ne se recoupent pas. Même compte
Stripe que BAR OPS (décision explicite, "ça facilite les paiements"), produit/prix et webhook
dédiés à Helm dans ce même compte. Prix actuel : 9,90 €/mois (placeholder, modifiable dans Stripe).

Ordre des portes au boot (`bootAuth()` dans `facture.html`, `bootApp()` dans `mobile/index.html`) :
pas de session Supabase → écran de connexion (`#loginGate`) ; session mais `check-access` refuse
→ écran d'abonnement (`#paywallGate`, prix + bouton "S'abonner" + "Gérer mon abonnement") ; sinon
→ comportement normal (le `pairGate` du code de synchro reste une couche indépendante, déclenchée
seulement après ces deux contrôles). Annulation d'abonnement : accès conservé jusqu'à
`expires_at` (fin de période déjà payée), pas de coupure immédiate.

Flux OAuth : flow implicite Supabase (`flowType:'implicit'` sur `getSb()`, tokens dans le fragment
d'URL, pas de PKCE — nécessaire car le flux desktop termine dans un contexte navigateur différent
de celui qui l'a initié).
- **Mobile** (déjà en https réel via GitHub Pages) : redirection directe
  (`signInWithOAuth({redirectTo: <page elle-même>})`), tokens repris dans `location.hash` au
  chargement.
- **Desktop Electron** (`file://`, pas d'origine https locale) : `connectLogin()` ouvre le flow
  avec `redirectTo` pointant vers `mobile/oauth-relay.html?state=...` (`skipBrowserRedirect:true`),
  Electron force l'URL vers le navigateur système (`shell.openExternal`, `window.open()` renvoie
  `null` — ne pas s'y fier, cf. `connectGmail()`), la page de relais dépose les tokens via
  `auth-relay-deposit` et l'app les récupère par polling (`auth-relay-poll`, table `login_relay`,
  usage unique) — même principe que `oauth-google-callback`/`oauth-google-poll` pour Gmail-send.

Tables Supabase : `profiles` (id/email, remplie par un trigger `handle_new_user` sur `auth.users`,
lecture seule côté client), `subscriptions` (`user_id, status, plan, period, expires_at,
stripe_customer_id, stripe_subscription_id` — écrite uniquement par les Edge Functions via
service role, `check-access` fait foi), `login_relay` (handoff desktop, cf. ci-dessus).

Étapes manuelles restantes (voir `supabase/README.md` pour le détail) : créer le produit/prix
Stripe + le webhook dédié à Helm, activer le provider Google dans Supabase Auth Dashboard + ajouter
les redirect URLs autorisées, ajouter le callback Supabase comme 2e "Authorized redirect URI" sur
le client OAuth Google Cloud déjà utilisé pour Gmail-send. Tant que ces étapes manuelles n'ont pas
été faites, le login/abonnement ne fonctionne pas encore en pratique (code déployé mais secrets
Stripe pas encore posés).

## Repo cible
https://github.com/SPECTRE888/Bill-ops-.git (branche main)

## Backlog fonctionnel en attente
- Autonomie mobile complète (usage sans Mac) : génération de code de synchro, onglet Clients, et Mon entreprise (dans Réglages, formulaire repliable) faits côté mobile. Aucun point bloquant connu restant sur cet axe.
- Facturation groupée (plusieurs prestas d'un même client → une facture) : faite sur Mac (onglet Pointage) et sur mobile (Factures → À facturer, sélection multi-cases + "Facturer la sélection"). Sur les deux, le bouton se désactive si les prestas sélectionnées n'ont pas toutes le même client.
- PDF (html2pdf.js) en prod. Envoi de factures : OAuth Gmail codé et déployé (functions + secrets + table `oauth_pending` en place), en attente de test réel bout-en-bout et de vérifier le statut de publication de l'écran de consentement Google Cloud (voir section Envoi de factures ci-dessus).

## Contraintes de style utilisateur
Réponses ultra-minimales, exécution directe, pas d'explication.
