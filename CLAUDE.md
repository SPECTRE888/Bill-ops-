# Bill-Ops — App de facturation

Fichiers : `facture.html` (app desktop complète, single-file, packagée en app Mac via Electron), `mobile/index.html` (PWA compagnon iPhone, single-file, déployée sur GitHub Pages), `send-invoice-server.js` (proxy SendGrid).

## Stack
HTML/CSS/JS vanilla, localStorage (from, clients, invoices, bookings, invCounters, sg, inv_theme).
Thème dark/light/auto (tokens BAR OPS), fonts Cormorant Garamond + Jost.

## Sync multi-device (Mac ↔ iPhone)
`facture.html` et `mobile/index.html` partagent les mêmes données via Supabase (table `billops_sync`, clé anon publique — même modèle de confiance que le reste de l'app client-side). Principe : un "code de synchro" aléatoire généré côté Mac (Mon entreprise → Synchronisation) sert de clé pour une ligne unique en base contenant tout l'état (`from, sg, clients, invoices, bookings, invCounters, inv_theme`) en un seul blob JSON. Toute écriture locale (`set(k,v)`) déclenche un push debounced (1.2s) ; chaque appareil pull toutes les 60s + au retour au premier plan (`visibilitychange`). Whole-blob last-write-wins, pas de fusion par enregistrement — acceptable pour un usage solo sur deux appareils utilisés séquentiellement.
La PWA mobile ne génère pas de code (pairing unidirectionnel Mac → téléphone) : on colle sur le téléphone le code affiché côté Mac.

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
`mobile/index.html` — compagnon iPhone installable via Safari (Ajouter à l'écran d'accueil), pas d'app native/App Store. Usage volontairement restreint : consulter le planning, consulter les factures (lecture seule), et pointer les horaires réels d'une presta via deux popups (arrivée / départ).
Champs additionnels sur les objets `bookings` (optionnels, rétrocompatibles) : `checkedInAt`, `checkedOutAt` (timestamps ISO), `actualHours` (arrondi au quart d'heure). `facture.html:invoiceBooking` utilise ces heures réelles pour la ligne de facture quand elles existent, sinon retombe sur `hours`/`from`/`to` statiques.
Déploiement : `.github/workflows/pages.yml` publie le dossier `mobile/` sur GitHub Pages à chaque push touchant `mobile/**` (Pages doit être activé une fois dans Settings → Pages → Source: GitHub Actions).

## Repo cible
https://github.com/SPECTRE888/Bill-ops-.git (branche main)

## Backlog fonctionnel en attente
- Génération PDF réelle (actuellement window.print manuel) → intégrer html2pdf.js ou jsPDF.
- SendGrid : endpoint proxy à déployer (send-invoice-server.js, Node/Express) — non hébergé.

## Contraintes de style utilisateur
Réponses ultra-minimales, exécution directe, pas d'explication.
