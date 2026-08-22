# Helm Ops — Gestion complète d'activité (clients, planning, facturation)

Anciennement "Bill Ops" — renommé car l'app dépasse la simple facturation (CRM clients + planning/pointage + facturation). Le repo GitHub (`Bill-ops-`) garde son nom technique historique, décorrélé de la marque affichée. La table `billops_sync` (ancien mécanisme de sync par code, voir Historique en bas de section Stockage cloud) n'est plus utilisée par le client mais n'a pas été supprimée côté Supabase.

Fichiers : `facture.html` (app desktop complète, single-file, packagée en app Mac via Electron), `mobile/index.html` (PWA compagnon iPhone, single-file, déployée sur GitHub Pages), `oauth-relay-page/index.html` (ancienne page statique de relais pour le login Google côté Electron, déployée sur Vercel — projet séparé `helm-relay`, morte depuis le passage au serveur loopback local, voir Login + abonnement ci-dessous), `supabase/functions/` (Edge Functions : `send-invoice` envoi centralisé via l'API Brevo depuis `mail.ops-suite.fr`, `oauth-google-callback`/`oauth-google-poll` mortes depuis l'abandon de l'OAuth Gmail (voir Envoi de factures), `check-access`/`stripe-checkout`/`stripe-webhook`/`auth-relay-deposit`/`auth-relay-poll` login + abonnement, `notify-upcoming-bookings` rappels push). `send-invoice-server.js` (ancienne version Express, référence obsolète pré-SMTP, pas utilisée en prod).

## Stack
HTML/CSS/JS vanilla. `localStorage` sert de **cache local** (from, clients, invoices, bookings, inv_theme, inv_lang, gmailAuth, pushSubscriptions) — la source de vérité pour les données métier (clients/bookings/invoices/from) est Supabase, scindée par utilisateur (voir Stockage cloud ci-dessous).
Thème dark/light/auto (tokens BAR OPS), fonts Cormorant Garamond + Jost.

## Stockage cloud par utilisateur (remplace l'ancien "code de synchro")
Depuis le 2026-08-05 : `clients`/`bookings`/`invoices`/`from` vivent dans Supabase (tables `clients`,
`bookings`, `invoices`, `company_info`, projet `chlmqnrvnrgeaihryreb`), scindées par `user_id`
(RLS complète select/insert/update/delete `using (auth.uid() = user_id)` — le client écrit
directement via son JWT de session, pas via une Edge Function). Se connecter au même compte
Google sur Mac et iPhone donne accès aux mêmes données automatiquement — plus besoin de coller un
code entre appareils.

`store(k)`/`storeArr(k)` (`facture.html`/`mobile/index.html`) n'ont pas changé : lecture
synchrone de `localStorage`, comme avant — c'est ce qui permet de garder ~150 sites d'appel
(rendus, formulaires) inchangés malgré la migration cloud. Ce qui change : `set(k,v)` écrit
toujours immédiatement en local (UI instantanée, tolère le hors-ligne), puis pousse en tâche de
fond (`queueCloudPush`/`pushCloudKey`, debounce 1.2s comme l'ancien `queueSync()`) vers la table
Supabase correspondante — diff par `id` entre ce qui existe déjà côté cloud et le tableau local
actuel (upsert des présents, delete de ceux disparus localement).

Au boot, une fois login + abonnement validés (`hydrateFromCloud()`) : si le cloud a déjà des
lignes pour l'utilisateur, elles écrasent le cache local (cloud fait foi) ; sinon, si des données
locales existent (première connexion sur un appareil qui avait déjà des données avant ce système),
elles sont migrées une fois vers le cloud (`migrateLocalToCloud()`). Chaque clé a son propre flag
`localStorage.cloudMigrated_<clé>`, posé uniquement après un upsert cloud confirmé **sans
erreur** (le champ `.error` de la réponse Supabase est vérifié explicitement, pas seulement
l'absence d'exception — un bug vécu en prod : `total` stocké localement comme chaîne formatée
`"2652.00 €"` face à une colonne `numeric` faisait échouer l'upsert des factures sans jamais
lever d'exception, et l'ancien code à flag unique se croyait migré alors que non). Tant qu'une clé
n'est pas confirmée migrée, `hydrateFromCloud()` ne l'écrase jamais avec un cloud vide.

Identifiants stables : les factures et prestas ont un champ `id` (uuid, `crypto.randomUUID()`)
miné à la création — les prestas utilisaient un `Date.now()` numérique avant, les clients n'en
avaient pas du tout (adressés par index de tableau, toujours vrai côté UI ; `id` sert uniquement
de clé cloud). `bookings.from`/`.to` (heures, pas des mots réservés SQL) sont mappés vers
`time_from`/`time_to` en base ; `invoices.bookingId`/`.bookingIds` vers `booking_id`/`booking_ids`.
`invCounters` a été supprimé : c'était déjà purement indicatif côté client
(`computeNextInvoiceNumber()` scanne les factures existantes pour trouver le prochain numéro
libre, le compteur n'accélérait qu'un scan qui se fait de toute façon).

Resynchronisation cross-device : poll toutes les 60s + au retour au premier plan
(`refreshFromCloudIfIdle`, remplace l'ancien `pullSync`), sauté si une écriture cloud est en
attente (évite d'écraser une modif pas encore poussée). Pas de Supabase Realtime, juste un
re-fetch + comparaison, cohérent avec le fonctionnement d'avant.

**Régression connue non résolue** : `gmailAuth` (compte Gmail connecté pour l'envoi de factures)
n'est plus synchronisé entre appareils — avant, il faisait partie du blob `SYNC_KEYS` poussé/tiré
en entier ; maintenant chaque appareil doit reconnecter son Gmail séparément. Pas critique (chaque
utilisateur n'a qu'un compte Gmail de toute façon, la reconnexion est rapide) mais à corriger
proprement si ça gêne (ex. ajouter `gmail_refresh_token`/`gmail_email` à `company_info`).

Historique : avant ce système, `facture.html`/`mobile/index.html` partageaient leurs données via
un blob JSON unique dans la table `billops_sync`, clé par un "code de synchro" aléatoire collé
manuellement sur chaque appareil (whole-blob last-write-wins, sans notion de compte). Abandonné
au profit du stockage par compte ci-dessus ; la table `billops_sync` existe encore côté Supabase
mais n'est plus utilisée par le client (voir tout en haut de ce fichier).

## Onglets (nav gauche, groupés par catégorie)
Accueil : tableau de bord (CA du mois, prestas à venir, factures en attente, heures prévues, prochaine presta, actions rapides), onglet par défaut, sans catégorie (item unique en haut de nav).
Catégorie Planning : Planning (prestas à venir uniquement) → Calendrier (calendrier CA/jour + prévisionnel du mois + formulaire booking, séparé de Planning).
Catégorie Facturation : Pointage (prestas à facturer, sélection multi-prestas d'un même client → une seule facture via `invoiceSelectedBookings()`) → Facture (preview visible seulement ici, formulaire tenant sur un écran sans scroll, prestations scrollables en interne) → Historique (recherche + Voir/Modifier/PDF/Renvoyer, liste scrollable en interne sans faire défiler la page) → Chiffre d'affaires (graphique CA/mois + stats mois/année/total + CA par client, séparé de Historique depuis le 2026-08-11 pour désencombrer la liste des factures — `renderCA()` inchangée, juste déplacée dans son propre onglet `tab-ca`/`nav-ca`).
Catégorie Clients : Mes clients (liste repiquée du design BAR OPS — rangée horizontale avatar/infos/actions, recherche en haut — mais sans le badge CA cumulé de BAR OPS, ce total reste réservé à Historique). `clients.createdAt` (mappé sur la colonne `created_at`, déjà existante côté Supabase depuis la migration initiale, jamais écrite par le client — seulement lue en retour) alimente le "depuis DATE" affiché sur chaque carte ; absent tant qu'un client créé avant ce champ n'a pas de valeur. Le formulaire d'ajout/modif (`#clientFormWrap`) est masqué par défaut (autre différence avec l'ancien comportement, où il restait affiché en permanence en haut de l'onglet) : il n'apparaît qu'au clic sur "+ Nouveau client" (header, à côté de la recherche) ou "Modifier" sur une carte, et se referme après enregistrement/suppression/Annuler.
Catégorie Paramètres (en bas de nav, après le spacer) : Mon entreprise + sélecteur de thème dark/light/auto.

## Layout
`.app` est bloqué à `height:100vh` avec 3 colonnes qui scrollent chacune indépendamment (nav fixe, panel, preview) — évite que la sidebar ou le formulaire Facture ne scrollent avec la page.
`mobile/index.html` a sa propre mise en page (barre d'onglets fixe en bas : Pointage/Planning/Factures/Clients), indépendante du layout desktop.

## App mobile (PWA)
`mobile/index.html` — compagnon iPhone installable via Safari (Ajouter à l'écran d'accueil), pas d'app native/App Store. Objectif : utilisable en autonomie complète par quelqu'un sans Mac (se connecter avec un compte Google suffit, voir Stockage cloud plus haut). Quatre onglets : Pointage (pointer arrivée/départ, transformer une presta pointée en facture avec extras km/péage/parking/offert/repas), Planning (consultation + ajout/modif/suppression de prestas, comme sur le Mac), Factures (lecture, aperçu en overlay in-app, téléchargement PDF, envoi par email — automatique, aucune config requise, voir Envoi de factures ci-dessous), Clients (CRUD clients, même modèle de données que `facture.html` — `name/prefix/email/phone/addr/tutoiement/siret/billingAddr/defaultRate/notes`, `prefix` utilisé pour la numérotation des factures ; `siret`/`billingAddr`/`defaultRate`/`notes` non éditables depuis l'UI mobile — pas de champs dédiés dans le formulaire client mobile, volontairement pour ne pas alourdir un écran déjà dense — mais préservés lors d'une modif faite sur mobile, `siret`/`billingAddr` réinjectés dans la facture générée si présents). Réglages (accès via l'icône engrenage, pas dans la barre du bas) contient aussi Mon entreprise (formulaire repliable, même modèle `from` que `facture.html`), volontairement pas un onglet séparé pour ne pas alourdir la nav.
Champs additionnels sur les objets `bookings` (optionnels, rétrocompatibles) : `checkedInAt`, `checkedOutAt` (timestamps ISO), `actualHours` (arrondi au quart d'heure), `notifiedAt` (posé par la Edge Function de notification, voir plus bas). `facture.html:invoiceBooking` utilise les heures réelles pour la ligne de facture quand elles existent, sinon retombe sur `hours`/`from`/`to` statiques.
Déploiement : `.github/workflows/pages.yml` publie le dossier `mobile/` sur GitHub Pages à chaque push touchant `mobile/**` (Pages doit être activé une fois dans Settings → Pages → Source: GitHub Actions).

**Historique (2026-08-21)** : la PWA mobile est restée sur GitHub Pages tout du long (voir
Déploiement ci-dessus) — seule la page de relais du login desktop a bougé, voir section Login +
abonnement plus bas pour le détail. Deux essais intermédiaires ont été tentés puis abandonnés avant
cette solution : un domaine perso `app.ops-suite.fr` en CNAME GitHub Pages pour la PWA (abandonné,
l'utilisateur réserve `ops-suite.fr` au mailing et à une future plateforme multi-produits, pas à
l'URL d'un produit Helm spécifique), puis une migration complète de la PWA vers Vercel
(`helm-ops-ivory.vercel.app`, même pattern que BAR OPS — fonctionnelle mais abandonnée pour la même
raison de nommage, sans lien avec un bug). Un après-midi entier a été perdu à déboguer un login
desktop apparemment cassé après ces essais (redirection vers la PWA au lieu de l'app Electron) :
la cause réelle n'était ni le domaine ni la page de relais mais l'app Electron installée restée
bloquée sur une ancienne version (l'auto-updater ne s'était jamais déclenché) — tous les tests
portaient sur du code obsolète. Retenir pour la prochaine fois : vérifier la version réellement
installée (`defaults read "/Applications/Helm Ops.app/Contents/Info.plist"
CFBundleShortVersionString`) avant de chercher un bug de comportement après un changement de build.

## Notifications push ("la presta commence bientôt")
Web Push standard (VAPID), supporté par Safari iOS 16.4+ pour les PWA installées sur l'écran d'accueil. Bouton "Activer les notifications" dans le header mobile → abonnement stocké localement (`pushSubscriptions`) et poussé dans la table cloud `push_subscriptions` (clé = `endpoint`, scindée par `user_id`, RLS select/insert/delete). Une Edge Function Supabase (`supabase/functions/notify-upcoming-bookings`), déclenchée toutes les ~3 min par pg_cron, lit directement la table `bookings` (statut à facturer, non pointé, non notifié) et filtre celles dont l'heure de début tombe dans une fenêtre ~10-20 min à venir (viser un rappel ~15 min avant, tolérant un tick pg_cron manqué), envoie une notification à chaque abonnement `push_subscriptions` de l'utilisateur concerné (sans contenu chiffré, texte fixe géré par `mobile/sw.js`), puis pose `notified_at` sur les bookings correspondants pour ne pas re-notifier. Les abonnements qui répondent 404/410 (révoqués côté navigateur) sont supprimés automatiquement de `push_subscriptions`. Avant le 2026-08-05, cette fonction lisait/écrivait tout depuis le blob unique `billops_sync` (voir Stockage cloud plus haut) — migrée en même temps que le reste pour ne pas silencieusement arrêter de fonctionner une fois le code de synchro retiré côté client.
Déploiement des Edge Functions (`send-invoice`, `notify-upcoming-bookings`) : voir `supabase/README.md` — nécessite un compte Supabase authentifié en CLI (login une fois via navigateur ; link/deploy/secrets ensuite automatisables).

## Envoi de factures (centralisé via Brevo, zéro configuration côté utilisateur)
Depuis le 2026-08-08 : troisième architecture d'envoi en une journée, après l'OAuth Gmail
(2026-08-04 → abandonné, vérification Google trop lourde pour du self-service) et le mot de passe
d'application Gmail + SMTP par utilisateur (2026-08-08 matin → abandonné aussi, car les mots de
passe d'application ne sont pas fiables : Google les masque/désactive pour de plus en plus de
comptes — programme de protection avancée, comptes récents — donc "ça ne marche pas pour tout le
monde" quoi qu'on fasse côté UX). Décision utilisateur explicite : centraliser complètement
l'envoi, quitte à ce que l'adresse technique brute ne soit pas celle du client, du moment que le
**nom affiché** au destinataire reste bien le sien (compromis accepté : "on s'en fout de l'aspect
technique, je veux juste le nom du client qui envoie la facture").

Toutes les factures (tous utilisateurs confondus) partent du domaine mutualisé `mail.ops-suite.fr`
(acheté chez IONOS, authentifié SPF/DKIM/DMARC côté **Brevo** — voir plus bas pourquoi Brevo et
pas SendGrid). `send-invoice` envoie via l'API Brevo (`https://api.brevo.com/v3/smtp/email`) avec :
- `sender` = toujours `mail@ops-suite.fr`, mais avec le **nom** affiché réglé sur `from.name` du
  client (ex. "Jerome Jarrige") — c'est ce que voit le destinataire dans sa boîte de réception,
  l'adresse technique brute n'étant visible que s'il inspecte les détails du mail (rare).
- `replyTo` = par défaut l'adresse de connexion Google de l'utilisateur (`sessionEmail`, capturée
  dans `renderAccountCard()` au boot depuis `access.session.user.email`) — donc les réponses du
  client arrivent bien dans la vraie boîte de l'utilisateur, sans qu'il ait à configurer quoi que
  ce soit au départ. Overridable : champ `from.replyTo` (carte "Envoi de factures" dans Mon
  entreprise / Réglages, synchronisé via `company_info.reply_to`) pour recevoir les réponses sur
  une autre adresse que celle de connexion — `resolveReplyTo()` (`facture.html`/`mobile/index.html`)
  retombe sur `sessionEmail` si le champ est vide ou invalide.
- Payload : `{replyTo, fromName, to, subject, html, pdfBase64, pdfFilename}`, protégé par le même
  header `x-app-secret` que le reste (scan automatisé, pas une vraie auth).

**Pourquoi Brevo et pas SendGrid** : SendGrid a été essayé en premier (même compte que BAR OPS,
domaine authentifié avec succès via leur API `/v3/whitelabel/domains`), mais son crédit d'envoi
était à zéro (trial expiré, `is_hard_limit:true` sur `/v3/user/credits`) — aucun plan gratuit
utilisable dans l'immédiat. Brevo a un vrai plan gratuit permanent (300 mails/jour, pas un trial
qui expire), largement suffisant pour du volume de facturation. Domaine authentifié via l'API Brevo
(`POST /v3/senders/domains` puis `PUT /v3/senders/domains/{domain}/authenticate` une fois les DNS
propagés) — 4 enregistrements : `brevo1._domainkey`/`brevo2._domainkey` (CNAME, DKIM),
`@` (TXT, `brevo-code:...`, preuve de propriété), `_dmarc` (TXT) — ce dernier a remplacé un CNAME
`_dmarc → dmarc.ionos.fr` posé par défaut par IONOS à l'achat du domaine (un nom ne peut pas avoir
à la fois un CNAME et un TXT, l'un remplace l'autre ; sans risque ici car le domaine est neuf et
n'a pas de vraie boîte mail ailleurs). Secret `BREVO_API_KEY` posé via `supabase secrets set`.

Le corps de l'email n'est plus la facture en HTML brut : c'est une formule de politesse
(vouvoiement par défaut, tutoiement activable par un interrupteur sur la fiche client —
`clients.tutoiement`, formule figée dans le code, pas éditable par l'utilisateur) + la facture en
**PDF joint** (généré client-side via `html2pdf` → `toPdf().output('datauristring')`, voir
`pdfBase64FromElement()`/`pdfBase64FromHtml()` dans `facture.html`).

Restes morts, pas supprimés (aucune raison tant que ça ne gêne pas) : les Edge Functions
`oauth-google-callback`/`oauth-google-poll` + table `oauth_pending` (flux OAuth Gmail) ; les
colonnes `company_info.smtp_email`/`smtp_app_password` (flux mot de passe d'application) ; le
compte/domaine SendGrid `ops-suite.fr` authentifié mais inutilisé (Brevo utilise le même domaine,
authentification indépendante par prestataire).

**Piège vécu en dev** (toujours valable) : `saveFrom()`/`saveFromMobile()` (formulaire "Mon
entreprise") remplaçaient tout l'objet `from` sans repartir de `store('from')` — modifier son
nom/adresse effaçait silencieusement `bic` (et avant ça, `smtpEmail`/`smtpAppPassword`) déjà
enregistrés. Fix appliqué : toujours `set('from', {...store('from'), ...champsModifiés})`, jamais
un objet neuf en dur.

## Login Google + email/mot de passe + abonnement Stripe (porte d'entrée de l'app)
Depuis le 2026-08-04 : l'app est gated par une connexion (Supabase Auth) + une vérification
d'abonnement Stripe, indépendante du système "connecter mon Gmail" (envoi de factures, régression
de sync connue plus haut) — deux mécanismes distincts qui ne se recoupent pas. Ce même login
est aussi ce qui fait maintenant office de liaison entre appareils pour les données (voir
Stockage cloud), le code de synchro ayant été retiré. Même compte Stripe que BAR OPS (décision
explicite, "ça facilite les paiements"), produit/prix et webhook dédiés à Helm dans ce même compte.
Prix actuel : 9,90 €/mois (placeholder, modifiable dans Stripe).

Deux méthodes de connexion sur `#loginGate` depuis le 2026-08-22 (email/mot de passe ajouté en
plus de Google — tout le monde n'a pas de compte Google) : formulaire email + mot de passe
(`authEmailSubmit()`, bascule connexion/inscription via `toggleAuthMode()`) et bouton Google
(`connectLogin()`/`connectLoginMobile()`, inchangé). Mot de passe oublié
(`authForgotPassword()` → `resetPasswordForEmail()`) affiche un 3e écran (`#resetPasswordGate`,
`submitNewPassword()` → `updateUser({password})`) au retour du lien reçu par email — détecté via
`type=recovery` dans le hash de redirection, `handleLoginRedirect()` retourne ce booléen et le
boot route vers l'écran de reset au lieu du boot normal. Sur desktop, les liens email
(confirmation d'inscription, reset) utilisent le même `redirectTo` que l'OAuth Google
(`http://127.0.0.1:59877/callback`, voir Flux OAuth ci-dessous) — déjà whitelisté côté Supabase,
donc aucune config supplémentaire ; implique que l'app doit être ouverte (serveur loopback actif)
au moment où l'utilisateur clique le lien reçu par email, même limite déjà acceptée pour l'OAuth.
Sur mobile (déjà en https réel), `redirectTo` pointe simplement vers la page elle-même. Pas de
vérification d'email forcée côté client : `signUp()` peut renvoyer une session immédiate (si la
confirmation est désactivée côté Supabase Auth) ou `data.session===null` (si activée), les deux
cas sont gérés sans dépendre du réglage exact du dashboard.

Ordre des portes au boot (`bootAuth()` dans `facture.html`, `bootApp()` dans `mobile/index.html`) :
pas de session Supabase → écran de connexion (`#loginGate`) ; lien de reset cliqué → écran
nouveau mot de passe (`#resetPasswordGate`) ; session mais `check-access` refuse → écran
d'abonnement (`#paywallGate`, prix + bouton "S'abonner" + "Gérer mon abonnement") ; sinon →
`hydrateFromCloud()` puis boot normal de l'app. Annulation d'abonnement : accès conservé jusqu'à
`expires_at` (fin de période déjà payée), pas de coupure immédiate.

Flux OAuth : flow implicite Supabase (`flowType:'implicit'` sur `getSb()`, tokens dans le fragment
d'URL, pas de PKCE — nécessaire car le flux desktop termine dans un contexte navigateur différent
de celui qui l'a initié).
- **Mobile** (déjà en https réel via GitHub Pages) : redirection directe
  (`signInWithOAuth({redirectTo: <page elle-même>})`), tokens repris dans `location.hash` au
  chargement.
- **Desktop Electron** (`file://`, pas d'origine https locale) : depuis le 2026-08-22,
  `connectLogin()` ouvre le flow avec `redirectTo:'http://127.0.0.1:59877/callback'`
  (`skipBrowserRedirect:true`), Electron force l'URL vers le navigateur système
  (`shell.openExternal`, `window.open()` renvoie `null` — ne pas s'y fier, cf. `connectGmail()`
  mort). Un petit serveur HTTP tourne en boucle dans le process principal
  (`electron/main.js:startAuthServer`, port `59877`, démarré au boot et redémarrable via l'IPC
  `restart-auth-server` avant chaque tentative de connexion, au cas où il serait mort — ex. après
  une mise en veille) : Supabase redirige Google directement dessus, la page `/callback` fait un
  `fetch('/token?hash=...')`, et le process principal recharge la fenêtre principale
  (`mainWin.loadURL(file://facture.html#access_token=...)`) — `handleLoginRedirect()` côté renderer
  reprend les tokens du `location.hash` (même logique que côté mobile) puis appelle `bootAuth()`.
  Nécessite d'ajouter `http://127.0.0.1:59877/callback` aux "Redirect URLs" du dashboard Supabase
  Auth (étape manuelle, une fois). Remplace l'ancien flow (page de relais Vercel
  `helm-relay.vercel.app` + polling `auth-relay-poll`/table `login_relay`) : le navigateur système
  s'ouvre toujours (Google refuse l'OAuth en webview embarquée, quel que soit le user-agent), mais
  plus de dépendance d'hébergement externe ni d'aller-retour réseau pour récupérer les tokens —
  motif du changement : repéré dans BAR OPS, qui utilise ce même pattern (serveur loopback local
  au lieu d'un relais hébergé).
  **Restes morts, pas supprimés** : `oauth-relay-page/index.html` (projet Vercel `helm-relay`),
  Edge Functions `auth-relay-deposit`/`auth-relay-poll`, table `login_relay` — la page de relais
  avait elle-même remplacé une Edge Function Supabase essayée en premier, abandonnée car la
  plateforme force un `Content-Type: text/plain` + `Content-Security-Policy: default-src 'none';
  sandbox` sur toute réponse HTTP d'une Edge Function, empêchant le script de la page de s'exécuter
  (les Edge Functions Supabase ne peuvent donc pas servir une page interactive).

Tables Supabase : `profiles` (id/email, remplie par un trigger `handle_new_user` sur `auth.users`,
lecture seule côté client), `subscriptions` (`user_id, status, plan, period, expires_at,
stripe_customer_id, stripe_subscription_id` — écrite uniquement par les Edge Functions via
service role, `check-access` fait foi). `login_relay` existe encore côté Supabase mais n'est plus
utilisée par le client (voir flow desktop ci-dessus).

Fonctionnel de bout en bout depuis le 2026-08-05 (vérifié en usage réel : login, abonnement test
Stripe, accès débloqué). Étapes manuelles faites : produit/prix + webhook Stripe dédiés à Helm,
provider Google + redirect URLs dans Supabase Auth Dashboard, callback Supabase ajouté comme 2e
"Authorized redirect URI" sur le client OAuth Google Cloud déjà utilisé pour Gmail-send. Reste en
mode Stripe **test** — bascule en **live** à faire manuellement (nouveau produit/prix/webhook en
mode Live, nouvelles valeurs de secrets) avant un usage réel multi-utilisateurs. Voir
`supabase/README.md` pour le détail des secrets/tables.

## Onboarding première connexion (desktop uniquement)
Depuis le 2026-08-22 : repéré dans BAR OPS (même principe, wizard modal 4 étapes au lieu de 6 —
adapté aux 3 piliers réels de Helm Ops au lieu des 5 de BAR OPS). Se déclenche dans `bootAuth()`
juste après `bootApp()` (`obInit()`, `facture.html`), uniquement si l'espace de travail est
vide : aucun client, aucune presta, et `store('from').name` absent — sinon le flag local
`helmops_onboarding_done` est posé sans jamais afficher le modal (couvre le cas d'un utilisateur
qui avait déjà des données avant l'ajout de cette fonctionnalité). Étapes : (1) prénom (juste
pour usage local, pas persisté en base) + nom de structure → écrit dans `from.name` ; (2) premier
client (nom/email/téléphone) → poussé dans `clients` ; (3) première presta (client pré-rempli
depuis l'étape 2, date, horaires, tarif) → poussée dans `bookings`, `hours` calculé comme dans
`addBooking()` ; (4) écran récap final. Chaque étape sauvegarde uniquement si son champ principal
est rempli — sinon "Continuer"/"Passer" avance sans rien créer (seule l'étape 1 bloque avec une
validation si le prénom est vide). Pas de pendant équivalent sur mobile (PWA) ni dans le
système i18n (texte en dur en français, comme `loginGate`/`paywallGate` — ces écrans pré-app ne
sont jamais passés par `t()`).

## Repo cible
https://github.com/SPECTRE888/Bill-ops-.git (branche main)

## Backlog fonctionnel en attente
- Autonomie mobile complète (usage sans Mac) : se connecter avec un compte Google suffit désormais (plus de code à générer), onglet Clients et Mon entreprise faits côté mobile. Aucun point bloquant connu restant sur cet axe.
- Facturation groupée (plusieurs prestas d'un même client → une facture) : faite sur Mac (onglet Pointage) et sur mobile (Factures → À facturer, sélection multi-cases + "Facturer la sélection"). Sur les deux, le bouton se désactive si les prestas sélectionnées n'ont pas toutes le même client.
- PDF (html2pdf.js) en prod, envoyé en pièce jointe (plus en texte brut dans le corps du mail). Envoi de factures désormais centralisé via Brevo depuis `mail.ops-suite.fr`, zéro configuration côté utilisateur (plus d'OAuth Google, plus de mot de passe d'application) — voir Envoi de factures. Fonctionne pour tout provider email côté client (Gmail, Outlook, autre) puisque l'envoi ne dépend plus du provider de l'utilisateur.
- Login/abonnement Stripe toujours en mode **test** — bascule en mode live à faire manuellement (voir section dédiée).

## Contraintes de style utilisateur
Réponses ultra-minimales, exécution directe, pas d'explication.
