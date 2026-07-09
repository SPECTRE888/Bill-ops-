# Notifications push — déploiement (à faire une seule fois)

La Edge Function `notify-upcoming-bookings` envoie une notification iPhone quand une prestation
pointée commence. Le code est prêt, mais le déploiement doit être fait depuis un Terminal avec
un compte Supabase authentifié (Claude n'a pas accès à ce compte).

Les valeurs secrètes (`VAPID_PRIVATE_KEY`, `CRON_SECRET`) ont été communiquées séparément dans la
conversation — ne jamais les committer dans ce repo. `VAPID_PUBLIC_KEY` est déjà dans
`mobile/index.html` (une clé publique n'a pas besoin d'être secrète).

## 1. Installer/lier le projet

```
cd "bill ops"
npx supabase login
npx supabase link --project-ref chlmqnrvnrgeaihryreb
```

## 2. Déployer la fonction

```
npx supabase functions deploy notify-upcoming-bookings --no-verify-jwt
```

`--no-verify-jwt` est nécessaire car la fonction est appelée par pg_cron, pas par un client
connecté — c'est pour ça que le code vérifie lui-même un header `x-cron-secret`.

## 3. Configurer les secrets

```
npx supabase secrets set VAPID_PUBLIC_KEY=<la clé publique déjà dans mobile/index.html>
npx supabase secrets set VAPID_PRIVATE_KEY=<valeur donnée séparément>
npx supabase secrets set CRON_SECRET=<valeur donnée séparément>
```

## 4. Tester la fonction manuellement AVANT de brancher le cron

Récupérer l'URL affichée après le déploiement (étape 2), puis :

```
curl -i -X POST 'https://chlmqnrvnrgeaihryreb.supabase.co/functions/v1/notify-upcoming-bookings' \
  -H 'x-cron-secret: <CRON_SECRET>'
```

- Sans le header → doit répondre `401`.
- Avec le header → doit répondre `200` avec `{"ok":true,"notified":0}` (ou plus si une presta
  tombe dans la fenêtre de 10 min). C'est ici qu'un souci de compatibilité `npm:web-push`/Deno
  apparaîtrait dans les logs (`npx supabase functions logs notify-upcoming-bookings`).

Pour tester l'envoi réel : créer/modifier une presta de test avec une heure de début dans les
10 dernières minutes, s'être abonné aux notifs sur le téléphone (bouton "Activer les
notifications" dans l'app mobile), puis relancer le curl ci-dessus — la notif doit arriver sur
l'écran verrouillé.

## 5. Planifier l'exécution toutes les 3 minutes

Dans le SQL Editor du dashboard Supabase (activer `pg_cron` et `pg_net` si pas déjà fait —
Database → Extensions). **Le squelette ci-dessous est un template, pas une requête garantie** :
la signature exacte de `net.http_post` a changé selon les versions de Supabase — vérifier contre
la doc actuelle ["Schedule Edge Functions"](https://supabase.com/docs/guides/functions/schedule-functions)
avant d'exécuter :

```sql
select cron.schedule(
  'notify-upcoming-bookings',
  '*/3 * * * *',
  $$
  select net.http_post(
    url := 'https://chlmqnrvnrgeaihryreb.supabase.co/functions/v1/notify-upcoming-bookings',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'),
    timeout_milliseconds := 10000
  );
  $$
);
```

Vérifier ensuite que les ticks s'exécutent : `select * from cron.job_run_details order by start_time desc limit 10;`

Si le curl manuel (étape 4) fonctionne mais que rien ne se déclenche ici, le problème est dans
cette requête SQL, pas dans la fonction elle-même.
