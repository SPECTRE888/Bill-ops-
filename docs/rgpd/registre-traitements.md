# Registre des traitements — Helm Ops

Tenu en application de l'article 30 du RGPD. Dernière mise à jour : 2026-08-24.

À compléter par l'éditeur : `[À COMPLÉTER]` — identité complète (nom, adresse, SIRET) et contact
pour l'exercice des droits (email dédié recommandé, ex. `contact@ops-suite.fr`).

## Responsable de traitement

- **Nom** : Jérôme Jarrige (éditeur individuel de l'application Helm Ops)
- **Adresse** : `[À COMPLÉTER]`
- **SIRET** : `[À COMPLÉTER]`
- **Contact RGPD** : `[À COMPLÉTER — email]`
- **DPO** : non désigné. Non obligatoire en l'état (pas de traitement à grande échelle de données
  sensibles au sens de l'art. 37 RGPD, volume d'utilisateurs limité à ce jour). À réévaluer si le
  volume d'utilisateurs ou le type de données traitées change significativement (avis non
  définitif, pas un avis juridique).

## Double casquette : responsable de traitement / sous-traitant

Helm Ops traite deux catégories de données avec deux qualifications RGPD différentes :

1. **Données de compte de l'utilisateur du SaaS** (identité, connexion, abonnement) — l'éditeur
   est **responsable de traitement**.
2. **Données saisies par l'utilisateur dans l'app** (ses propres clients, ses prestations, ses
   factures) — l'utilisateur du SaaS est **responsable de traitement** de ses propres clients ;
   l'éditeur agit uniquement comme **sous-traitant** (art. 28 RGPD), sur instruction de
   l'utilisateur, sans utiliser ces données à d'autres fins. Ce partage de responsabilité est
   rappelé dans les mentions légales de l'app (`facture.html` / `mobile/index.html`).

Chaque fiche ci-dessous précise laquelle des deux casquettes s'applique.

---

## Fiche 1 — Gestion du compte utilisateur et de l'abonnement

- **Qualification** : responsable de traitement
- **Finalité** : création de compte, authentification, gestion de l'abonnement payant
- **Base légale** : exécution du contrat (CGU/abonnement)
- **Personnes concernées** : utilisateurs du SaaS Helm Ops (indépendants/TPE)
- **Données traitées** : email, mot de passe (haché, géré par Supabase Auth — jamais en clair côté
  éditeur), nom/avatar Google si connexion Google, statut et historique d'abonnement, identifiants
  Stripe (`customer_id`, `subscription_id`)
- **Table(s)** : `profiles`, `subscriptions` (Supabase, projet `chlmqnrvnrgeaihryreb`, région UE)
- **Destinataires / sous-traitants** :
  - Supabase (hébergement + authentification, UE — eu-west-1)
  - Stripe (paiement, États-Unis — cadre EU-US Data Privacy Framework)
- **Transfert hors UE** : oui, vers Stripe (email + moyen de paiement), couvert par le Data Privacy
  Framework (à faire confirmer par le DPA Stripe, voir procédure de violation / actions en attente)
- **Durée de conservation** : durée de vie du compte ; suppression intégrale et immédiate sur
  demande (bouton "Supprimer mon compte", `delete-account`, cascade sur toutes les tables
  applicatives via `ON DELETE CASCADE`)
- **Mesures de sécurité** : RLS Supabase (`auth.uid() = id`), hachage mot de passe par Supabase
  Auth, HTTPS, CSP, audit de sécurité régulier (dernier en date : 2026-08-24)

## Fiche 2 — Gestion des clients de l'utilisateur (CRM)

- **Qualification** : sous-traitant (le responsable de traitement est l'utilisateur du SaaS
  pour ses propres clients)
- **Finalité** : permettre à l'utilisateur de gérer sa relation client (coordonnées, historique)
- **Base légale** : définie par l'utilisateur lui-même vis-à-vis de ses clients (hors périmètre
  de l'éditeur) — l'éditeur agit sur instruction contractuelle (art. 28 RGPD)
- **Personnes concernées** : clients des utilisateurs du SaaS (particuliers ou professionnels)
- **Données traitées** : nom, email, téléphone, adresse, SIRET, tarif par défaut, notes libres,
  préférence de tutoiement
- **Table(s)** : `clients` (Supabase, UE)
- **Destinataires / sous-traitants** : Supabase (hébergement, UE). Aucune autre transmission —
  ces données ne quittent le compte de l'utilisateur, sauf lors de l'envoi d'une facture
  (voir Fiche 5)
- **Transfert hors UE** : non
- **Durée de conservation** : à la main de l'utilisateur (pas de purge automatique côté éditeur) ;
  supprimée en cascade si l'utilisateur supprime son compte. **Aucune politique de durée de
  conservation formelle définie à ce jour** côté éditeur pour guider l'utilisateur (recommandation
  CNIL usuelle : 3 ans après le dernier contact pour des données de prospection/clientèle) — à
  formaliser, voir section Actions en attente
- **Mesures de sécurité** : RLS Supabase (`auth.uid() = user_id`), HTTPS, CSP, échappement HTML
  systématique à l'affichage (`esc()`, corrigé pour tous les points d'affichage lors de l'audit du
  2026-08-24)

## Fiche 3 — Planning et pointage des prestations

- **Qualification** : sous-traitant
- **Finalité** : planifier et pointer les prestations réalisées pour un client
- **Base légale** : instruction de l'utilisateur (art. 28)
- **Personnes concernées** : clients des utilisateurs (via le nom associé à chaque prestation)
- **Données traitées** : date, horaires, tarif, statut de pointage (heures réelles d'arrivée/
  départ côté mobile), lien vers le client concerné
- **Table(s)** : `bookings` (Supabase, UE)
- **Destinataires / sous-traitants** : Supabase (UE)
- **Transfert hors UE** : non
- **Durée de conservation** : à la main de l'utilisateur ; supprimée en cascade avec le compte
- **Mesures de sécurité** : RLS Supabase (`auth.uid() = user_id`), HTTPS

## Fiche 4 — Facturation

- **Qualification** : sous-traitant (données du client de l'utilisateur) + obligation légale
  d'archivage qui repose sur l'utilisateur en tant que professionnel
- **Finalité** : émission, historique et suivi des factures
- **Base légale** : instruction de l'utilisateur (art. 28) ; obligation légale d'archivage
  comptable pour l'utilisateur (art. L.110-4 Code de commerce, 10 ans)
- **Personnes concernées** : clients des utilisateurs
- **Données traitées** : identité et coordonnées du client facturé, détail des prestations
  facturées, montants, IBAN/BIC de l'utilisateur (émetteur, pas du client)
- **Table(s)** : `invoices` (Supabase, UE) — contient un snapshot HTML complet de chaque facture
- **Destinataires / sous-traitants** : Supabase (UE) ; Brevo lors de l'envoi par email
  (voir Fiche 5)
- **Transfert hors UE** : non
- **Durée de conservation** : conservées côté éditeur tant que le compte existe (supprimées en
  cascade à la suppression du compte). L'obligation légale de conservation décennale des factures
  repose sur l'utilisateur lui-même en tant que professionnel — l'export JSON ("Exporter mes
  données", desktop uniquement à ce jour) lui permet de conserver une copie indépendamment de
  Helm Ops. **Point d'attention** : si un utilisateur supprime son compte avant 10 ans, il perd
  l'accès aux factures côté Helm Ops sans copie externe — à mentionner explicitement dans le
  parcours de suppression de compte (voir Actions en attente)
- **Mesures de sécurité** : RLS Supabase, HTTPS, CSP, échappement HTML corrigé sur tous les champs
  affichés lors du rendu (audit 2026-08-24) ; aucun payload malveillant trouvé dans les factures
  existantes lors du contrôle du 2026-08-24

## Fiche 5 — Envoi de factures par email

- **Qualification** : sous-traitant
- **Finalité** : transmettre une facture par email au client de l'utilisateur, au nom de
  l'utilisateur
- **Base légale** : instruction de l'utilisateur (art. 28)
- **Personnes concernées** : clients des utilisateurs (destinataires de l'email)
- **Données traitées** : adresse email du destinataire, nom affiché de l'expéditeur (celui de
  l'utilisateur), contenu de la facture (PDF joint), adresse de réponse (celle de l'utilisateur)
- **Destinataires / sous-traitants** : Brevo (délégation d'envoi email, UE/France), via l'Edge
  Function `send-invoice` (Supabase). Depuis le 2026-08-24, l'envoi exige un abonnement actif en
  plus d'une session valide (contrôle anti-abus, voir `supabase/functions/send-invoice/index.ts`)
- **Transfert hors UE** : non (Brevo, UE)
- **Durée de conservation** : le contenu de l'email n'est pas stocké côté éditeur au-delà de
  l'envoi. Rétention résiduelle possible dans les logs internes de Brevo, selon leur propre
  politique — à vérifier dans le DPA Brevo (voir Actions en attente)
- **Mesures de sécurité** : domaine expéditeur authentifié SPF/DKIM/DMARC, contrôle d'abonnement
  actif avant envoi, protection anti-injection d'en-têtes email (`stripHeaderInjection`)

## Fiche 6 — Notifications push (rappel de prestation)

- **Qualification** : responsable de traitement (fonctionnalité technique de l'app elle-même,
  pas une donnée de client transmise à un tiers)
- **Finalité** : rappeler à l'utilisateur qu'une prestation commence bientôt
- **Base légale** : intérêt légitime / fonctionnalité du service à laquelle l'utilisateur
  s'abonne explicitement (bouton "Activer les notifications")
- **Personnes concernées** : utilisateurs du SaaS (pas leurs clients)
- **Données traitées** : endpoint d'abonnement push (identifiant technique du navigateur/
  appareil), aucun contenu chiffré transmis (texte de notification générique fixe côté service
  worker)
- **Table(s)** : `push_subscriptions` (Supabase, UE)
- **Destinataires / sous-traitants** : Supabase (UE). Le service de push sous-jacent (infrastructure
  Apple/Google Web Push selon le navigateur) ne voit pas le contenu, protocole standard chiffré
- **Transfert hors UE** : non pour les données stockées (le routage réseau du Web Push standard
  peut transiter par l'infrastructure Apple/Google selon la plateforme, hors du contrôle direct de
  l'éditeur — risque considéré négligeable, aucune donnée personnelle identifiable transmise)
- **Durée de conservation** : jusqu'à révocation côté navigateur (abonnements expirés/révoqués
  purgés automatiquement sur réponse 404/410 de la fonction `notify-upcoming-bookings`)
- **Mesures de sécurité** : RLS Supabase, clés VAPID, purge automatique des abonnements invalides

## Fiche 7 — Informations de l'entreprise de l'utilisateur (émetteur des factures)

- **Qualification** : responsable de traitement pour les données de l'utilisateur lui-même
  (son propre nom d'entreprise, son IBAN d'émetteur — pas des données de tiers)
- **Finalité** : constituer l'en-tête des factures émises par l'utilisateur
- **Base légale** : exécution du contrat / nécessaire au service
- **Personnes concernées** : l'utilisateur lui-même (auto-entrepreneur ou société)
- **Données traitées** : nom, adresse, contact, SIRET, régime TVA, IBAN/BIC, adresse de réponse
  email personnalisée
- **Table(s)** : `company_info` (Supabase, UE)
- **Destinataires / sous-traitants** : Supabase (UE)
- **Transfert hors UE** : non
- **Durée de conservation** : durée de vie du compte, supprimée en cascade
- **Mesures de sécurité** : RLS Supabase (fuite entre comptes détectée et corrigée le 2026-08-05,
  voir historique `CLAUDE.md` commit `6ba9c97`)

---

## Sous-traitants (tableau récapitulatif)

| Sous-traitant | Rôle | Localisation | Données concernées | Mécanisme de transfert | DPA signé ? |
|---|---|---|---|---|---|
| Supabase | Base de données, authentification, Edge Functions | UE (eu-west-1) | Toutes | — (UE) | `[À VÉRIFIER]` |
| Brevo | Envoi d'emails de factures | UE/France | Email destinataire, contenu facture | — (UE) | `[À VÉRIFIER]` |
| Stripe | Paiement de l'abonnement | États-Unis | Email, moyen de paiement de l'utilisateur | EU-US Data Privacy Framework (à confirmer) | `[À VÉRIFIER]` |
| GitHub Pages | Hébergement statique de la PWA mobile | États-Unis (Microsoft) | Aucune (sert uniquement les fichiers statiques, les données transitent en direct navigateur↔Supabase) | Risque considéré faible | `[À VÉRIFIER]` |
| IONOS | Registrar du domaine `ops-suite.fr` | UE | Aucune donnée personnelle d'utilisateur final | — (UE) | Non applicable |

## Actions en attente (hors périmètre de ce registre, à traiter séparément)

- Obtenir/vérifier les DPA (Data Processing Agreement) de Supabase, Brevo et Stripe.
- Confirmer le mécanisme de transfert Stripe (adhésion effective au Data Privacy Framework).
- Formaliser une politique de durée de conservation pour les données `clients`/`bookings`
  (actuellement : conservation indéfinie tant que le compte existe, aucune purge automatique).
- Avertir l'utilisateur, dans le parcours de suppression de compte, qu'il perd l'accès aux
  factures sans copie externe préalable (export JSON).
- Rédiger des CGV (obligatoires pour un service payant en France : prix, droit de rétractation,
  modalités de résiliation).
- Compléter les champs `[À COMPLÉTER]`/`[À VÉRIFIER]` ci-dessus.

Ce registre doit être mis à jour à chaque ajout de nouveau traitement, nouveau sous-traitant, ou
changement de finalité — voir aussi `docs/rgpd/procedure-violation-donnees.md`.
