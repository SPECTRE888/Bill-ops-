# Bill-Ops — App de facturation

Fichiers : `facture.html` (app complète, single-file), `send-invoice-server.js` (proxy SendGrid).

## Stack
HTML/CSS/JS vanilla, localStorage (from, clients, invoices, bookings, invCounters, sg, inv_theme).
Thème dark/light/auto (tokens BAR OPS), fonts Cormorant Garamond + Jost.

## Onglets (nav gauche, groupés par catégorie)
Accueil : tableau de bord (CA du mois, prestas à venir, factures en attente, heures prévues, prochaine presta, actions rapides), onglet par défaut, sans catégorie (item unique en haut de nav).
Catégorie Planning : Planning (prestas à venir condensées + formulaire booking + bookings à facturer) → Calendrier (calendrier CA/jour + prévisionnel du mois, séparé de Planning).
Catégorie Facturation : Facture (preview visible seulement ici, formulaire tenant sur un écran sans scroll, prestations scrollables en interne) → Historique (recherche + Voir/Modifier/PDF/Renvoyer + stats CA mois/année/total/par client, liste scrollable en interne sans faire défiler la page).
Catégorie Clients : Mes clients.
Catégorie Paramètres (en bas de nav, après le spacer) : Mon entreprise + sélecteur de thème dark/light/auto.

## Layout
`.app` est bloqué à `height:100vh` avec 3 colonnes qui scrollent chacune indépendamment (nav fixe, panel, preview) — évite que la sidebar ou le formulaire Facture ne scrollent avec la page.

## Repo cible
https://github.com/SPECTRE888/Bill-ops-.git (branche main, vide actuellement)

## À faire immédiatement
1. `git init`, add, commit, push initial vers le repo ci-dessus avec le token GitHub fourni par l'utilisateur (PAT scope repo).
2. Configurer un remote deploy (Vercel/Netlify) pointant sur facture.html pour URL publique.
3. Config `.gitignore` (exclure tokens/secrets, aucun fichier .env présent actuellement).

## Backlog fonctionnel en attente
- Génération PDF réelle (actuellement window.print manuel) → intégrer html2pdf.js ou jsPDF.
- Auth multi-device (actuellement localStorage = local au navigateur, pas de sync cloud).
- SendGrid : endpoint proxy à déployer (send-invoice-server.js, Node/Express) — non hébergé.

## Contraintes de style utilisateur
Réponses ultra-minimales, exécution directe, pas d'explication.
