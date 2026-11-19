/**
 * Signe le ZIP de mise à jour (Ed25519) pour l'auto-updater d'electron/main.js.
 * Usage (CI) : UPDATE_SIGNING_KEY="<clé privée PEM>" node scripts/sign-update.js dist/HelmOps-X.Y.Z-arm64-mac.zip
 * Produit <zip>.sig (signature base64), à publier dans la release à côté du ZIP.
 * Échoue (exit 1) si la clé manque ou ne correspond pas à la clé publique embarquée dans main.js :
 * une release sans signature valide serait refusée par toutes les apps installées.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const pem = process.env.UPDATE_SIGNING_KEY;
const file = process.argv[2];
if (!pem) { console.error('❌ UPDATE_SIGNING_KEY manquant (secret GitHub)'); process.exit(1); }
if (!file || !fs.existsSync(file)) { console.error(`❌ Fichier introuvable : ${file}`); process.exit(1); }

const mainJs = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
const pub = (mainJs.match(/-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/) || [])[0];
if (!pub) { console.error('❌ Clé publique introuvable dans electron/main.js'); process.exit(1); }

const data = fs.readFileSync(file);
const sig = crypto.sign(null, data, crypto.createPrivateKey(pem));
if (!crypto.verify(null, data, crypto.createPublicKey(pub), sig)) {
  console.error('❌ La clé privée ne correspond pas à la clé publique de electron/main.js');
  process.exit(1);
}
fs.writeFileSync(`${file}.sig`, sig.toString('base64'));
console.log(`✅ Signé : ${file}.sig`);
