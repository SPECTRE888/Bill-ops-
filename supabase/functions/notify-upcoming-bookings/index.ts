// Edge Function déclenchée toutes les ~3 min par pg_cron (voir supabase/README.md pour le SQL
// de planification). Cherche les prestations qui démarrent maintenant (fenêtre de 10 min pour
// tolérer un tick pg_cron manqué) et n'ont pas encore été pointées, envoie une notification push
// (sans contenu chiffré — voir mobile/sw.js) à chaque abonnement, puis marque `notifiedAt`.
//
// Risque connu à vérifier en premier lors du déploiement : npm:web-push peut avoir des soucis de
// compatibilité avec certains internals Node sous Deno. Tester isolément (voir CLAUDE.md) avant de
// brancher pg_cron ; si ça échoue, remplacer l'appel à webpush.sendNotification par une signature
// VAPID JWT (ES256) maison via crypto.subtle (natif à Deno) — plus simple puisqu'on n'a pas besoin
// du chiffrement RFC 8291 (push payload-less).

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET');
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;

const WINDOW_MIN = 10;
const SYNC_TABLE = 'billops_sync';

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
  const { data: rows, error } = await supabase.from(SYNC_TABLE).select('sync_code, data, updated_at');
  if (error) return new Response(error.message, { status: 500 });

  const nowStr = parisNowStr();
  let notified = 0;

  for (const row of rows ?? []) {
    const payload = row.data as any;
    const bookings: any[] = payload?.bookings ?? [];
    const subs: any[] = payload?.pushSubscriptions ?? [];
    if (!subs.length) continue;

    const idsToMark: any[] = [];
    for (const b of bookings) {
      if (b.status !== 'à facturer' || b.checkedInAt || b.notifiedAt || !b.date || !b.from) continue;
      const diffMin = minutesSince(nowStr, b.date, b.from);
      if (diffMin < 0 || diffMin > WINDOW_MIN) continue;

      for (const sub of subs) {
        try {
          await webpush.sendNotification(sub);
        } catch (e) {
          console.error('push failed for', sub.endpoint, e.message ?? e);
        }
      }
      const stamp = new Date().toISOString();
      b.notifiedAt = stamp;
      idsToMark.push(b.id);
      notified++;
    }

    if (!idsToMark.length) continue;

    // Concurrence optimiste : n'écrase que si personne n'a écrit depuis notre lecture.
    const { data: updated, error: updErr } = await supabase
      .from(SYNC_TABLE)
      .update({ data: payload, updated_at: new Date().toISOString() })
      .eq('sync_code', row.sync_code)
      .eq('updated_at', row.updated_at)
      .select('sync_code');
    if (updErr) { console.error('update failed', updErr.message); continue; }
    if (!updated || updated.length === 0) {
      // Quelqu'un a écrit entre-temps : on relit la version fraîche et on ne pose que le flag
      // notifiedAt sur les bookings identifiés par id (les push, eux, ont déjà été envoyés).
      const { data: fresh } = await supabase.from(SYNC_TABLE).select('data, updated_at').eq('sync_code', row.sync_code).maybeSingle();
      if (fresh) {
        const freshBookings: any[] = fresh.data?.bookings ?? [];
        const stamp = new Date().toISOString();
        for (const fb of freshBookings) {
          if (idsToMark.includes(fb.id) && !fb.notifiedAt) fb.notifiedAt = stamp;
        }
        await supabase.from(SYNC_TABLE)
          .update({ data: fresh.data, updated_at: stamp })
          .eq('sync_code', row.sync_code)
          .eq('updated_at', fresh.updated_at);
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, notified }), { headers: { 'Content-Type': 'application/json' } });
});
