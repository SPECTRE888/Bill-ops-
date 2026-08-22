/*!
 * Helm Ops — Electron main process
 */
const { app, BrowserWindow, shell, ipcMain } = require('electron')
const http = require('http')
const url  = require('url')
const path = require('path')

const APP_FILE  = path.join(__dirname, '..', 'facture.html')
const AUTH_PORT = 59877

let mainWin    = null
let authServer = null

// ─── Migration userData depuis l'ancien nom "bill-ops" (renommage → Helm Ops) ──
// Sans ça, macOS traite l'app comme nouvelle après le renommage de productName/appId
// et le thème + le code de synchro locaux semblent perdus au premier lancement.
// Le dossier userData est nommé d'après le champ "name" du package.json (pas "productName"),
// donc l'ancien dossier est bien "bill-ops" (pas "Bill Ops"). Electron crée aussi le dossier
// userData du nouveau nom dès le démarrage (avant même whenReady), donc on ne peut pas se fier
// à sa simple existence pour savoir si de vraies données y ont déjà été écrites — on vérifie
// plutôt la présence du Local Storage (leveldb) qui, lui, n'existe que si on a déjà tourné.
function migrateLegacyUserData() {
  const fs = require('fs')
  const newDir = app.getPath('userData')
  const oldDir = path.join(path.dirname(newDir), 'bill-ops')
  const newHasData = fs.existsSync(path.join(newDir, 'Local Storage', 'leveldb'))
  if (!fs.existsSync(oldDir) || newHasData) return
  try {
    fs.rmSync(newDir, { recursive: true, force: true })
    fs.cpSync(oldDir, newDir, { recursive: true })
  } catch (e) {
    console.error('[migration]', e?.message || e)
  }
}

ipcMain.handle('open-external', (_e, u) => shell.openExternal(u))
ipcMain.handle('get-version', () => app.getVersion())
ipcMain.handle('check-for-updates', () => checkForUpdates())
ipcMain.handle('download-update', () => downloadAndInstallUpdate())
ipcMain.handle('restart-auth-server', () => {
  if (authServer?.listening) return 'already-running'
  startAuthServer()
  return 'restarted'
})

// ─── Login Google : serveur local pour recevoir le callback OAuth ──────────
// Electron n'a pas d'origine https locale pour recevoir un redirectTo direct, donc le flow
// ouvre le navigateur système. Au lieu de relayer via une page Vercel + polling Supabase
// (ancien flow, voir historique CLAUDE.md), Supabase redirige directement vers ce serveur
// loopback : plus rapide (pas d'aller-retour réseau), pas de dépendance d'hébergement externe.
function startAuthServer() {
  if (authServer?.listening) return
  authServer = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true)

    if (parsed.pathname === '/callback') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>Helm Ops — Connexion réussie</title>
        <style>
          *{box-sizing:border-box;margin:0;padding:0}
          body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#080808;color:#ede8e0;display:flex;align-items:center;justify-content:center;height:100vh}
          .box{text-align:center;padding:48px 40px;max-width:360px}
          .icon{font-size:52px;margin-bottom:20px;animation:pop .4s ease}
          @keyframes pop{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}
          h1{font-size:20px;font-weight:500;letter-spacing:.06em;margin-bottom:10px;color:#c4a46b}
          p{font-size:13px;color:#666;margin-bottom:24px;line-height:1.6}
          .btn{padding:11px 32px;background:#c4a46b;color:#080808;border:none;border-radius:5px;cursor:pointer;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
          .btn:hover{background:#d4b47a}
        </style>
        </head><body>
        <div class="box">
          <div class="icon">✓</div>
          <h1>HELM OPS</h1>
          <p>Authentification réussie.<br>L'application est prête.</p>
          <button class="btn" id="btn">Fermer cet onglet</button>
        </div>
        <script>
          const hash = window.location.hash || ''
          fetch('/token?' + new URLSearchParams({ hash })).catch(()=>{})
          function closeTab(){ window.open('about:blank','_self'); window.close(); }
          document.getElementById('btn').addEventListener('click', closeTab)
          setTimeout(closeTab, 1000)
        </script></body></html>`)
      return
    }

    if (parsed.pathname === '/token') {
      const hash = parsed.query.hash || ''
      res.writeHead(200); res.end('ok')
      if (mainWin) {
        setTimeout(() => {
          mainWin.show()
          mainWin.focus()
          mainWin.loadURL(`file://${APP_FILE.replace(/\\/g, '/')}${hash}`)
        }, 400)
      }
      return
    }

    res.writeHead(404); res.end()
  })

  authServer.on('error', (e) => {
    console.error('[authServer] error:', e.message)
    authServer = null
  })
  authServer.on('close', () => { authServer = null })
  authServer.listen(AUTH_PORT, '127.0.0.1', () => {
    console.log(`Auth server listening on http://127.0.0.1:${AUTH_PORT}`)
  })
}

ipcMain.handle('open-invoice-window', (_e, { html, title }) => {
  const fs = require('fs')
  const os = require('os')
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-ops-inv-'))
  const filePath = path.join(tmpDir, 'invoice.html')
  fs.writeFileSync(filePath, html, 'utf8')
  const win = new BrowserWindow({
    width: 900,
    height: 1040,
    minWidth: 700,
    minHeight: 600,
    center: true,
    show: false,
    backgroundColor: '#f5f3ef',
    title: title || 'Facture',
    parent: mainWin || undefined,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => { fs.rm(tmpDir, { recursive: true, force: true }, () => {}) })
  win.loadFile(filePath)
  return true
})

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Helm Ops',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.icns'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  mainWin.maximize()
  mainWin.loadFile(APP_FILE)

  mainWin.webContents.setWindowOpenHandler(({ url: u }) => {
    if (u.startsWith('file://')) return { action: 'allow' }
    shell.openExternal(u)
    return { action: 'deny' }
  })

  mainWin.webContents.on('will-navigate', (event, u) => {
    if (!u.startsWith('file://')) {
      event.preventDefault()
      shell.openExternal(u)
    }
  })
}

// ─── Single instance ──────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWin) { mainWin.show(); mainWin.focus() }
  })
}

// ─── Auto-updater custom (bypass Squirrel.Mac — app non signée) ──────────
const https    = require('https')
const fs       = require('fs')
const os       = require('os')
const { spawn } = require('child_process')

const GH_OWNER = 'SPECTRE888'
const GH_REPO  = 'Bill-ops-'

// Statut structuré (pas juste un message texte) envoyé au renderer, qui pilote le popup central
// de mise à jour (#updateModal) + le badge de version dans la sidebar — voir handleUpdateStatus()
// dans facture.html.
function sendUpdateStatus(payload) {
  try { mainWin?.webContents.send('update-status', payload) } catch (e) {}
}

function get(url) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      https.get(u, { headers: { 'User-Agent': 'Helm-Ops-Updater' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302)
          return follow(res.headers.location)
        let d = ''
        res.on('data', c => d += c)
        res.on('end', () => resolve(d))
      }).on('error', reject)
    }
    follow(url)
  })
}

function download(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const follow = (u, redirects) => {
      if (redirects > 10) return reject(new Error('Trop de redirections'))
      https.get(u, { headers: { 'User-Agent': 'Helm-Ops-Updater' } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume()
          return follow(res.headers.location, redirects + 1)
        }
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`HTTP ${res.statusCode} lors du téléchargement`))
        }
        const total = Number(res.headers['content-length'] || 0)
        let received = 0
        if (onProgress && total) {
          res.on('data', (chunk) => {
            received += chunk.length
            onProgress(Math.round((received / total) * 100))
          })
        }
        const f = fs.createWriteStream(dest)
        res.pipe(f)
        f.on('finish', () => f.close(() => resolve()))
        f.on('error', reject)
      }).on('error', reject)
    }
    follow(url, 0)
  })
}

function semverGt(a, b) {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return true
    if (pa[i] < pb[i]) return false
  }
  return false
}

// Résultat du dernier check positif, gardé en mémoire pour que downloadAndInstallUpdate() (déclenché
// par le clic utilisateur sur le badge sidebar, pas automatiquement) sache quoi télécharger sans
// re-fetcher l'API GitHub.
let pendingRelease = null

async function checkForUpdates() {
  try {
    const raw     = await get(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/latest`)
    const release = JSON.parse(raw)
    if (!release.tag_name) return // pas de release publiée

    const latest  = release.tag_name.replace(/^v/, '')
    const current = app.getVersion()

    if (!semverGt(latest, current)) {
      pendingRelease = null
      sendUpdateStatus({ state: 'uptodate', version: current })
      return
    }

    const asset = release.assets.find(a => a.name.match(/arm64-mac\.zip$/) && !a.name.endsWith('.blockmap'))
    if (!asset) throw new Error('Asset ZIP introuvable dans la release')

    pendingRelease = { version: latest, asset }
    sendUpdateStatus({ state: 'available', version: latest })
  } catch (err) {
    console.error('[updater]', err?.message || err)
    sendUpdateStatus({ state: 'error', message: err?.message || String(err) })
  }
}

async function downloadAndInstallUpdate() {
  if (!pendingRelease) return
  const { version: latest, asset } = pendingRelease
  try {
    const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-ops-upd-'))
    const zipPath = path.join(tmpDir, 'update.zip')

    await download(asset.browser_download_url, zipPath, (pct) => {
      sendUpdateStatus({ state: 'downloading', version: latest, pct })
    })
    sendUpdateStatus({ state: 'installing', version: latest })

    const appPath    = process.execPath.split('.app/Contents/')[0] + '.app'
    const extractDir = path.join(tmpDir, 'ext')
    fs.mkdirSync(extractDir)

    const logFile = path.join(tmpDir, 'update.log')
    const script = [
      `exec > "${logFile}" 2>&1`,
      `set -ex`,
      `echo "=== Helm Ops update script ==="`,
      `sleep 5`,
      `for i in $(seq 1 20); do`,
      `  pgrep -f "Helm Ops" >/dev/null 2>&1 || break`,
      `  sleep 1`,
      `done`,
      `cd "${extractDir}"`,
      `unzip -q "${zipPath}"`,
      `NEWAPP=$(find "${extractDir}" -maxdepth 2 -name "*.app" -type d | head -1)`,
      `if [ -z "$NEWAPP" ]; then echo "ERROR: no .app found"; exit 1; fi`,
      `xattr -cr "$NEWAPP"`,
      `rm -rf "${appPath}"`,
      `cp -R "$NEWAPP" "${appPath}"`,
      `xattr -cr "${appPath}"`,
      `codesign --force --deep --sign - --timestamp=none "${appPath}" 2>/dev/null || true`,
      `touch "${appPath}"`,
      `/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -f "${appPath}" >/dev/null 2>&1 || true`,
      `killall Dock >/dev/null 2>&1 || true`,
      `open "${appPath}"`,
      `echo "Done."`,
    ].join('\n')

    sendUpdateStatus({ state: 'ready', version: latest, seconds: 3 })
    setTimeout(() => {
      spawn('bash', ['-c', script], { detached: true, stdio: 'ignore' }).unref()
      app.quit()
    }, 3000)

  } catch (err) {
    console.error('[updater]', err?.message || err)
    sendUpdateStatus({ state: 'error', message: err?.message || String(err) })
  }
}

// Pas de check au timer fixe ici : le renderer déclenche lui-même le premier check
// (initUpdateSystem() dans facture.html) une fois son écouteur 'update-status' branché —
// sinon, si le boot (login + hydrateFromCloud) dépasse le délai fixe, le statut 'available'
// part avant que quiconque écoute côté renderer et le badge sidebar ne s'affiche jamais.
function setupUpdater() {
  setInterval(checkForUpdates, 30 * 60 * 1000)
}

// ─── Boot ───────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  if (app.isPackaged) migrateLegacyUserData()

  if (process.platform === 'darwin' && app.isPackaged) {
    try {
      const { execSync } = require('child_process')
      const appPath = process.execPath.split('.app/Contents/')[0] + '.app'
      execSync(`xattr -cr "${appPath}"`)
    } catch (e) {}
  }

  createWindow()
  startAuthServer()
  if (app.isPackaged) setupUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
