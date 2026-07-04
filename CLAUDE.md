# Bill-Ops — App de facturation

Fichiers : `facture.html` (app complète, single-file), `send-invoice-server.js` (proxy SendGrid).

## Stack
HTML/CSS/JS vanilla, localStorage (from, clients, invoices, bookings, invCounters, sg, inv_theme).
Thème dark/light/auto (tokens BAR OPS), fonts Cormorant Garamond + Jost.

## Onglets (nav gauche, groupés par catégorie)
Catégorie Planning : Planning (prestas à venir + calendrier avec CA/jour + prévisionnel + booking, onglet par défaut).
Catégorie Facturation : Facture (preview visible seulement ici) → Mes clients → Historique (recherche + Voir/Modifier/PDF/Renvoyer) → CA (par client).
Bas de nav : Mon entreprise + sélecteur de thème.

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
