# Bill-Ops — App de facturation

Fichiers : `facture.html` (app desktop complète, single-file, packagée en app Mac via Electron), `mobile/index.html` (PWA compagnon iPhone, single-file, déployée sur GitHub Pages), `supabase/functions/` (Edge Functions : `send-invoice` proxy SendGrid, `notify-upcoming-bookings` rappels push). `send-invoice-server.js` (version Express équivalente à `send-invoice`, gardée en référence pour qui voudrait s'auto-héberger, mais pas utilisée en prod).

## Stack
HTML/CSS/JS vanilla, localStorage (from, clients, invoices, bookings, invCounters, sg, inv_theme).
Thème dark/light/auto (tokens BAR OPS), fonts Cormorant Garamond + Jost.

## Sync multi-device (Mac ↔ iPhone)
`facture.html` et `mobile/index.html` partagent les mêmes données via Supabase (table `billops_sync`, clé anon publique — même modèle de confiance que le reste de l'app client-side). Principe : un "code de synchro" aléatoire généré côté Mac (Mon entreprise → Synchronisation) sert de clé pour une ligne unique en base contenant tout l'état (`from, sg, clients, invoices, bookings, invCounters, inv_theme, pushSubscriptions`) en un seul blob JSON. Toute écriture locale (`set(k,v)`) déclenche un push debounced (1.2s) ; chaque appareil pull toutes les 60s + au retour au premier plan (`visibilitychange`). Whole-blob last-write-wins, pas de fusion par enregistrement — acceptable pour un usage solo sur deux appareils utilisés séquentiellement.
La PWA mobile ne génère pas de code (pairing unidirectionnel Mac → téléphone) : on colle sur le téléphone le code affiché côté Mac.
`SYNC_KEYS` doit toujours être identique dans les deux fichiers (même si une clé n'est utilisée activement que d'un côté, ex. `pushSubscriptions`) : `pushSync()` remplace tout le blob JSON à chaque écriture, donc une clé absente d'un des deux serait effacée silencieusement au prochain push de l'autre appareil.

## Onglets (nav gauche, groupés par catégorie)
Accueil : tableau de bord (CA du mois, prestas à venir, factures en attente, heures prévues, prochaine presta, actions rapides), onglet par défaut, sans catégorie (item unique en haut de nav).
Catégorie Planning : Planning (prestas à venir condensées + formulaire booking + bookings à facturer) → Calendrier (calendrier CA/jour + prévisionnel du mois, séparé de Planning).
Catégorie Facturation : Facture (preview visible seulement ici, formulaire tenant sur un écran sans scroll, prestations scrollables en interne) → Historique (recherche + Voir/Modifier/PDF/Renvoyer + stats CA mois/année/total/par client, liste scrollable en interne sans faire défiler la page).
Catégorie Clients : Mes clients.
Catégorie Paramètres (en bas de nav, après le spacer) : Mon entreprise + sélecteur de thème dark/light/auto.

## Layout
`.app` est bloqué à `height:100vh` avec 3 colonnes qui scrollent chacune indépendamment (nav fixe, panel, preview) — évite que la sidebar ou le formulaire Facture ne scrollent avec la page.
`mobile/index.html` a sa propre mise en page (barre d'onglets fixe en bas : Pointage/Planning/Factures), indépendante du layout desktop.

## App mobile (PWA)
`mobile/index.html` — compagnon iPhone installable via Safari (Ajouter à l'écran d'accueil), pas d'app native/App Store. Trois onglets : Pointage (pointer arrivée/départ, transformer une presta pointée en facture avec extras km/péage/parking/offert/repas), Planning (consultation + ajout/modif/suppression de prestas, comme sur le Mac), Factures (lecture, aperçu en overlay in-app, téléchargement PDF, envoi par email via la config SendGrid déjà synchronisée).
Champs additionnels sur les objets `bookings` (optionnels, rétrocompatibles) : `checkedInAt`, `checkedOutAt` (timestamps ISO), `actualHours` (arrondi au quart d'heure), `notifiedAt` (posé par la Edge Function de notification, voir plus bas). `facture.html:invoiceBooking` utilise les heures réelles pour la ligne de facture quand elles existent, sinon retombe sur `hours`/`from`/`to` statiques.
Déploiement : `.github/workflows/pages.yml` publie le dossier `mobile/` sur GitHub Pages à chaque push touchant `mobile/**` (Pages doit être activé une fois dans Settings → Pages → Source: GitHub Actions).

## Notifications push ("la presta commence bientôt")
Web Push standard (VAPID), supporté par Safari iOS 16.4+ pour les PWA installées sur l'écran d'accueil. Bouton "Activer les notifications" dans le header mobile → abonnement stocké dans `pushSubscriptions` (synced comme le reste, pas de table dédiée). Une Edge Function Supabase (`supabase/functions/notify-upcoming-bookings`), déclenchée toutes les ~3 min par pg_cron, scanne les bookings non pointés dont l'heure de début tombe dans une fenêtre ~10-20 min à venir (viser un rappel ~15 min avant, tolérant un tick pg_cron manqué) et envoie une notification (sans contenu chiffré, texte fixe géré par `mobile/sw.js`), puis pose `notifiedAt` pour ne pas re-notifier. Les abonnements qui répondent 404/410 (révoqués côté navigateur) sont retirés automatiquement de `pushSubscriptions`.
Déploiement des Edge Functions (`send-invoice`, `notify-upcoming-bookings`) : voir `supabase/README.md` — nécessite un compte Supabase authentifié en CLI (login une fois via navigateur ; link/deploy/secrets ensuite automatisables).

## Repo cible
https://github.com/SPECTRE888/Bill-ops-.git (branche main)

## Backlog fonctionnel en attente
- Aucun point bloquant connu. PDF (html2pdf.js) et proxy SendGrid (Edge Function `send-invoice`) sont en prod.

## Contraintes de style utilisateur
Réponses ultra-minimales, exécution directe, pas d'explication.
