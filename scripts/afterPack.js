const { execSync } = require('child_process')
const path = require('path')

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productName}.app`
  )

  console.log('[afterPack] Ad-hoc re-signing:', appPath)

  const sign = (target) => {
    try {
      execSync(`codesign --force --sign - --timestamp=none --preserve-metadata=identifier,entitlements "${target}"`, { stdio: 'pipe' })
    } catch (e) {
      try {
        execSync(`codesign --force --sign - --timestamp=none "${target}"`, { stdio: 'pipe' })
      } catch (e2) { /* ignore */ }
    }
  }

  const find = (pattern) => {
    try {
      return execSync(`find "${appPath}" ${pattern}`, { stdio: 'pipe' })
        .toString().trim().split('\n').filter(Boolean)
    } catch (e) { return [] }
  }

  for (const p of find('-name "*.dylib"')) sign(p)
  for (const p of find('-name "*.node"')) sign(p)
  for (const p of find('-perm +111 -type f')) sign(p)
  for (const p of find('-name "*.framework" -type d')) sign(p)
  for (const p of find('-name "*.app" -type d')) sign(p)
  sign(appPath)

  console.log('[afterPack] Ad-hoc signing done.')
}
