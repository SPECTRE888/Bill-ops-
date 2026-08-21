// Page de relais OAuth pour le login desktop Electron, servie ici (Supabase Edge Function) plutôt
// que sur app.ops-suite.fr (GitHub Pages) — reprise du 2026-08-21 : app.ops-suite.fr héberge aussi
// la PWA mobile (mobile/index.html), dont le manifest.json déclare `"scope": "./"` (racine du
// domaine). Un onglet Safari ouvrant /oauth-relay.html sur ce même domaine tombe dans le scope de
// la PWA installée (Add to Dock) et se fait rediriger vers son start_url (index.html) au lieu de
// rester sur la page de relais — observé en test réel : "Connexion en cours…" bascule seul vers
// la PWA quelques secondes après. Servir cette page depuis un domaine entièrement différent
// (*.supabase.co, hors du scope PWA) élimine le problème sans toucher à la structure de mobile/.
// Même logique que mobile/oauth-relay.html (dépose les tokens via auth-relay-deposit, l'app
// Electron les récupère par polling via auth-relay-poll) — seul l'hébergement change.

const HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Connexion — Helm Ops</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#080808;--surface:#0f0f0f;--text:#ede8e0;--text2:#a89f92;--gold:#d9a637}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Jost',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center}
.box{background:var(--surface);border:1px solid #222;border-radius:8px;padding:40px 32px;max-width:400px}
h1{font-family:'Jost',sans-serif;font-size:22px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--gold);margin-bottom:14px}
p{font-family:'Jost',sans-serif;font-size:13px;font-weight:500;color:var(--text2);line-height:1.5}
</style>
</head>
<body>
<div class="box">
  <h1>HELM OPS</h1>
  <p id="msg">Connexion en cours…</p>
</div>
<script>
(function(){
  var AUTH_RELAY_DEPOSIT_URL = 'https://chlmqnrvnrgeaihryreb.supabase.co/functions/v1/auth-relay-deposit';
  var APP_RELAY_SECRET = '364ae57df352752832e9c6cb52ad7b040740ad481628839b';
  var msgEl = document.getElementById('msg');

  var state = new URLSearchParams(location.search).get('state');
  var hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  var accessToken = hash.get('access_token');
  var refreshToken = hash.get('refresh_token');
  var authError = hash.get('error_description') || new URLSearchParams(location.search).get('error_description');

  if(authError){
    msgEl.textContent = 'Connexion refusée (' + authError + '). Tu peux fermer cette fenêtre.';
    return;
  }
  if(!state || !accessToken || !refreshToken){
    msgEl.textContent = 'Requête invalide. Tu peux fermer cette fenêtre.';
    return;
  }

  fetch(AUTH_RELAY_DEPOSIT_URL, {
    method: 'POST',
    headers: {'Content-Type':'application/json', 'x-app-secret': APP_RELAY_SECRET},
    body: JSON.stringify({state: state, accessToken: accessToken, refreshToken: refreshToken})
  }).then(function(res){
    if(res.ok){ msgEl.textContent = 'Connexion réussie. Tu peux fermer cette fenêtre.'; }
    else { msgEl.textContent = 'Erreur lors de la connexion. Tu peux fermer cette fenêtre.'; }
  }).catch(function(){
    msgEl.textContent = 'Erreur réseau. Tu peux fermer cette fenêtre.';
  });
})();
</script>
</body>
</html>
`;

Deno.serve((req) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  return new Response(HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
});
