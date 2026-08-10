/*!
 * Helm Ops — Electron main process
 */
const { app, BrowserWindow, shell, ipcMain } = require('electron')
const path = require('path')

const APP_FILE = path.join(__dirname, '..', 'facture.html')

let mainWin = null

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
ipcMain.handle('check-for-updates', () => checkAndUpdate())

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

async function checkAndUpdate() {
  try {
    const raw     = await get(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/latest`)
    const release = JSON.parse(raw)
    if (!release.tag_name) return // pas de release publiée

    const latest  = release.tag_name.replace(/^v/, '')
    const current = app.getVersion()

    if (!semverGt(latest, current)) {
      sendUpdateStatus({ state: 'uptodate', version: current })
      return
    }

    sendUpdateStatus({ state: 'available', version: latest })

    const asset = release.assets.find(a => a.name.match(/arm64-mac\.zip$/) && !a.name.endsWith('.blockmap'))
    if (!asset) throw new Error('Asset ZIP introuvable dans la release')

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

function setupUpdater() {
  setTimeout(checkAndUpdate, 10000)
  setInterval(checkAndUpdate, 30 * 60 * 1000)
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
  if (app.isPackaged) setupUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
