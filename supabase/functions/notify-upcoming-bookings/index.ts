// Edge Function déclenchée toutes les ~3 min par pg_cron (voir supabase/README.md pour le SQL
// de planification). Cherche les prestations qui démarrent dans ~15 min et n'ont pas encore été
// pointées, envoie une notification push (sans contenu chiffré — voir mobile/sw.js) à chaque
// abonnement de l'utilisateur concerné, marque `notified_at`, et nettoie les abonnements devenus
// invalides (404/410).
//
// Depuis le passage au stockage cloud par utilisateur (retrait du "code de synchro" et de
// billops_sync), lit directement les tables `bookings`/`push_subscriptions` — plus de blob JSON
// unique à relire/réécrire en entier, chaque booking se met à jour individuellement (plus besoin
// de la gestion de concurrence optimiste qu'exigeait l'ancien modèle en blob).

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET');
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;

const LEAD_MIN = 15; // rappel ~15 min avant le début de la presta
const TOLERANCE_MIN = 5; // demi-largeur de la fenêtre, pour tolérer un tick pg_cron manqué

webpush.setVapidDetails('mailto:jarrige.jerome@hotmail.fr', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

function parisNowStr(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

// Les deux chaînes représentent la même convention (heure murale locale) : on les traite comme
// UTC juste pour pouvoir soustraire, jamais mélangé à une vraie conversion de fuseau.
function minutesSince(nowStr: string, bookingDate: string, bookingFrom: string): number {
  const nowMs = Date.parse(nowStr + ':00Z');
  const startMs = Date.parse(bookingDate + 'T' + bookingFrom + ':00Z');
  return (nowMs - startMs) / 60000;
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, user_id, date, time_from')
    .eq('status', 'à facturer')
    .is('checked_in_at', null)
    .is('notified_at', null)
    .not('date', 'is', null)
    .not('time_from', 'is', null);
  if (error) return new Response(error.message, { status: 500 });

  const nowStr = parisNowStr();
  const due = (bookings ?? []).filter((b) => {
    const diffMin = minutesSince(nowStr, b.date, b.time_from);
    return diffMin >= -(LEAD_MIN + TOLERANCE_MIN) && diffMin <= -(LEAD_MIN - TOLERANCE_MIN);
  });

  let notified = 0;
  const userIds = [...new Set(due.map((b) => b.user_id))];

  for (const userId of userIds) {
    const { data: subs } = await supabase.from('push_subscriptions').select('endpoint, subscription').eq('user_id', userId);
    if (!subs?.length) continue;

    const staleEndpoints: string[] = [];
    for (const { endpoint, subscription } of subs) {
      try {
        await webpush.sendNotification(subscription as any);
      } catch (e: any) {
        // 404/410 = abonnement révoqué côté navigateur (RFC 8030) : on le retire pour de bon,
        // les autres erreurs (réseau, quota...) sont juste loguées et retentées au prochain tick.
        if (e?.statusCode === 404 || e?.statusCode === 410) staleEndpoints.push(endpoint);
        else console.error('push failed for', endpoint, e?.message ?? e);
      }
    }
    if (staleEndpoints.length) {
      await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints);
    }

    const stamp = new Date().toISOString();
    const bookingIds = due.filter((b) => b.user_id === userId).map((b) => b.id);
    await supabase.from('bookings').update({ notified_at: stamp }).in('id', bookingIds);
    notified += bookingIds.length;
  }

  return new Response(JSON.stringify({ ok: true, notified }), { headers: { 'Content-Type': 'application/json' } });
});
