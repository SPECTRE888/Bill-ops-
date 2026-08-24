# Procédure de notification de violation de données — Helm Ops

En application des articles 33 et 34 du RGPD. Dernière mise à jour : 2026-08-24.

## 1. Qu'est-ce qu'une "violation de données" au sens du RGPD

Une violation de données personnelles (art. 4.12 RGPD) est **la destruction, la perte,
l'altération, la divulgation ou l'accès non autorisé — accidentels ou illicites — à des données
personnelles**. Cela inclut :

- un accès non autorisé confirmé (ex. quelqu'un a effectivement lu/exporté des données via une
  policy RLS ouverte) ;
- une fuite (ex. clé secrète publiée par erreur, base de données exposée publiquement) ;
- une perte de disponibilité grave (ex. suppression accidentelle sans sauvegarde) ;
- une compromission de compte (ex. vol de session).

**Une vulnérabilité découverte et corrigée, sans preuve d'accès non autorisé effectif, n'est pas
en soi une "violation" au sens de l'art. 4.12** — c'est un risque qui a existé, mais tant qu'aucun
accès illégitime confirmé n'a eu lieu, l'obligation de notification ne se déclenche pas
automatiquement. Il faut néanmoins documenter l'incident en interne (voir section 5) et vérifier
activement s'il existe des traces d'exploitation.

## 2. Dès la détection — que faire immédiatement

1. **Contenir** : couper l'accès vulnérable en priorité (révoquer une clé, fermer une policy,
   supprimer une fonction/table) avant toute autre étape — la fermeture prime sur l'investigation.
2. **Ne pas détruire les preuves** : avant de nettoyer complètement, si possible, noter/exporter
   les logs pertinents (Supabase Dashboard → Logs, `auth.audit_log_entries`, logs Vercel/GitHub si
   applicable) — ils serviront à évaluer si un accès non autorisé a réellement eu lieu.
3. **Dater précisément** : depuis quand la faille existe (date de mise en prod du code/config
   vulnérable) et depuis quand elle est fermée. Cette fenêtre définit la période à vérifier.
4. **Qualifier les données concernées** : quelles tables/colonnes étaient exposées, quelles
   catégories de personnes (utilisateurs Helm Ops ? leurs clients ?), combien de lignes/comptes
   au total dans la fenêtre concernée.

## 3. Évaluer si une notification est nécessaire (grille de décision)

| Question | Si oui → |
|---|---|
| Y a-t-il une preuve ou un indice sérieux d'accès non autorisé effectif (pas juste une vulnérabilité théorique) ? | Passer à l'évaluation du risque (ci-dessous) |
| Aucune preuve d'accès, faille fermée avant toute exploitation connue | Documenter en interne (section 5), notification non requise, mais garder le dossier au cas où de nouveaux éléments apparaîtraient |

Si un accès non autorisé est confirmé ou fortement probable, évaluer le **risque pour les
personnes concernées** :

- **Risque élevé** (notification à la CNIL **et** aux personnes concernées, art. 34) : données
  sensibles exposées, volume important, risque d'usurpation d'identité, de fraude financière, ou
  de préjudice moral/matériel significatif. Exemple : accès confirmé à des factures avec IBAN, ou
  prise de contrôle de comptes utilisateurs.
- **Risque non négligeable mais pas élevé** (notification à la **CNIL uniquement**, pas aux
  personnes concernées) : exposition de coordonnées (nom, email, téléphone) sans données
  financières ni sensibles, accès limité ou non confirmé exploité à grande échelle.
- **Risque négligeable** (pas de notification obligatoire, mais documentation interne
  systématique) : faille théorique fermée avant toute preuve d'exploitation, ou données déjà
  publiques par ailleurs.

**En cas de doute, notifier à la CNIL** — la sanction pour non-notification d'une violation
avérée est bien plus lourde que celle pour une notification "par excès de prudence" qui s'avère
non nécessaire.

## 4. Si notification requise — délai et contenu

**Délai : 72 heures maximum après la prise de connaissance de la violation** (pas après sa
survenue — le compteur démarre quand vous en avez connaissance, ou raisonnablement dû en avoir
connaissance). Si le délai de 72h ne peut être tenu, notifier quand même avec les informations
disponibles et compléter par notifications successives.

**Notification à la CNIL** — formulaire en ligne sur [cnil.fr](https://www.cnil.fr), doit
contenir :
- nature de la violation ;
- catégories et nombre approximatif de personnes concernées ;
- catégories et nombre approximatif d'enregistrements de données concernés ;
- nom et coordonnées du contact RGPD (`[À COMPLÉTER]`, voir registre des traitements) ;
- conséquences probables de la violation ;
- mesures prises ou proposées pour remédier à la violation et en atténuer les effets éventuels.

**Notification aux personnes concernées** (uniquement si risque élevé, art. 34) : message clair
et simple, en langage courant (pas juridique), décrivant la nature de la violation, le contact
RGPD, les conséquences probables, et les mesures prises. Canal : email direct (l'app connaît déjà
l'email de chaque utilisateur concerné).

## 5. Registre interne des violations (obligatoire même sans notification, art. 33.5)

Le RGPD impose de documenter **toute** violation, notifiée ou non, avec les faits, ses effets et
les mesures prises. Tenir ce registre dans ce même fichier (section ci-dessous, une entrée par
incident) ou dans un fichier séparé `docs/rgpd/journal-incidents.md` si le volume grossit.

### Modèle d'entrée

```
## [DATE] — [Titre court de l'incident]
- Détecté le : 
- Fermé le : 
- Description technique : 
- Données/tables concernées : 
- Personnes concernées (catégorie + nombre estimé) : 
- Preuve d'accès non autorisé effectif ? (oui/non/indéterminé, sur quelle base) : 
- Évaluation du risque : négligeable / non négligeable / élevé
- Notification CNIL : oui/non — si non, justification
- Notification personnes concernées : oui/non — si non, justification
- Mesures correctives : 
```

---

## Annexe — Évaluation préliminaire des incidents du 2026-08-23

**Ceci n'est pas un avis juridique.** C'est une évaluation préliminaire basée sur les faits connus
et documentés dans `CLAUDE.md`, destinée à aider l'éditeur à prendre une décision éclairée — au
besoin avec un avocat si le doute persiste. Deux incidents distincts, à traiter séparément.

### Incident A — Policy RLS ouverte sur `billops_sync`

- **Détecté le** : 2026-08-23 (audit de sécurité interne)
- **Fermé le** : 2026-08-23 (table supprimée)
- **Description technique** : la table contenait un blob JSON par "code de synchro" (ancien
  mécanisme pré-comptes utilisateurs), avec une policy RLS `anon` en lecture/écriture sans
  authentification (`qual:true`). Exploitable par quiconque connaissait — ou devinait/scannait —
  un code de synchro, avec la seule clé publique de l'app (visible dans le code source client).
  La table "contenait encore de vraies données" au moment de la découverte.
- **Données concernées** : selon le contenu du blob (probablement clients/factures/planning
  d'utilisateurs n'ayant pas encore migré vers le nouveau système de comptes)
- **Personnes concernées** : utilisateurs encore sur l'ancien système de code de synchro au moment
  de la découverte + leurs propres clients (données de facturation)
- **Preuve d'accès non autorisé effectif** : **indéterminée à ce jour**. Un "code de synchro" agit
  comme un secret faible (chaîne aléatoire mais pas un vrai contrôle d'accès) — l'exploitation
  nécessite de connaître ou deviner un code existant, ce qui réduit mais n'élimine pas le risque
  qu'un accès ait eu lieu avant la découverte. **Action recommandée avant de clore ce point** :
  vérifier les logs Supabase (Dashboard → Logs → Postgres/API logs) pour repérer des requêtes
  `anon` sur `billops_sync` dans les jours/semaines précédant la suppression — si l'historique de
  logs remonte suffisamment loin (souvent limité à 24-48h ou 7 jours selon le plan Supabase, donc
  peut-être déjà indisponible).
- **Évaluation préliminaire du risque** : si aucune trace d'accès `anon` suspect n'est trouvée →
  risque considéré **négligeable à non négligeable** (vulnérabilité théorique fermée rapidement
  après détection, pas de preuve d'exploitation). Si des traces d'accès `anon` inexpliqué sont
  trouvées → repasser en risque **non négligeable au minimum**, notification CNIL probablement
  requise selon le volume/nature des données dans le blob.
- **Recommandation** : vérifier les logs disponibles avant de considérer ce point clos. Si les
  logs ne remontent plus assez loin pour trancher, documenter cette limite dans le registre interne
  (section 5) et conserver la décision prise avec sa justification.

### Incident B — Flow OAuth relais (Vercel) toujours actif côté infra

- **Détecté le** : 2026-08-23 (audit de sécurité interne)
- **Fermé le** : 2026-08-23 (projet Vercel supprimé, Edge Functions supprimées, `uri_allow_list`
  nettoyée, secret partagé tourné)
- **Description technique** : le flow OAuth desktop via relais Vercel
  (`helm-relay.vercel.app`), documenté "mort côté app" depuis le 2026-08-22, était resté whitelisté
  dans `uri_allow_list` côté Supabase Auth, avec un secret partagé public embarqué en clair dans le
  JS de la page de relais. Un attaquant pouvait construire un lien de phishing exploitant cette
  URL, et — **à condition que la victime clique le lien ET s'authentifie via un vrai écran Google
  légitime** — récupérer les tokens de session de la victime via `auth-relay-poll`, permettant
  ensuite d'accéder à ses données cloud (clients, factures, planning) au nom de la victime.
- **Données concernées** : potentiellement toutes les données cloud (clients, prestations,
  factures, infos entreprise) de tout utilisateur ciblé par une campagne de phishing exploitant ce
  lien
- **Personnes concernées** : dépend entièrement de si une campagne de phishing a réellement eu
  lieu — voir ci-dessous
- **Preuve d'accès non autorisé effectif** : **aucune preuve connue d'exploitation active**.
  Contrairement à l'incident A (accessible passivement à quiconque connaît un code), celui-ci
  nécessite une action active de l'attaquant (envoyer un lien de phishing ciblé) — bien plus
  probable d'être une vulnérabilité *découverte avant exploitation* qu'un canal d'attaque
  opportuniste déjà en cours. **Action recommandée avant de clore ce point** : vérifier les logs
  d'authentification Supabase (`auth.audit_log_entries`, filtrer sur la fenêtre où
  `helm-relay.vercel.app` était whitelisté) pour toute connexion suspecte, et vérifier les
  éventuels logs Vercel du projet supprimé si encore accessibles (analytics Vercel, logs de
  fonction) pour un trafic inhabituel sur `auth-relay-deposit`/`auth-relay-poll` avant suppression.
- **Évaluation préliminaire du risque** : si aucune trace d'exploitation trouvée → risque
  **négligeable** (vulnérabilité corrigée avant preuve d'usage malveillant, nécessitait une action
  active improbable sans campagne de phishing ciblée documentée par ailleurs). Si des logs
  montrent un usage réel de ce flow par un tiers non identifié pendant la fenêtre à risque →
  réévaluer immédiatement en risque élevé et notifier.
- **Recommandation** : mêmes réserves que l'incident A concernant la disponibilité des logs
  historiques — documenter la limite si les logs ne sont plus disponibles.

### Conclusion préliminaire (non définitive)

Sur la base des faits connus et en l'absence de toute preuve d'accès non autorisé effectif pour
les deux incidents, **la notification CNIL ne semble pas obligatoire dans l'état actuel des
connaissances** — mais cette conclusion repose sur l'hypothèse qu'aucune trace d'exploitation
n'est retrouvée dans les logs disponibles. Il revient à l'éditeur de :
1. vérifier les logs mentionnés ci-dessus tant qu'ils sont encore accessibles ;
2. consigner le résultat de cette vérification dans le registre interne (section 5) ;
3. en cas de doute persistant ou de découverte d'un indice d'accès réel, consulter un avocat
   spécialisé RGPD avant de décider définitivement de ne pas notifier — la décision de ne pas
   notifier doit elle-même être documentée et justifiable (art. 33.5).
