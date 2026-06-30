// One-off: generate an RSA keypair for signing OTA bundles.
//
//   node scripts/ota-keygen.js
//
// Writes:
//   ota-private.pem    — KEEP SECRET. Used by scripts/ota-release.js to sign
//                        each bundle. Add to your password manager / CI secret
//                        store. .gitignored.
//
// Prints the matching public key to stdout. Paste that into
// capacitor.config.json under plugins.LiveUpdate.publicKey.
//
// Refuses to overwrite an existing ota-private.pem — rotating the key means
// every shipped native build needs to be updated with the new public key
// before it can pull OTA again, so make that a deliberate act.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const PRIVATE_PATH = path.join(ROOT, 'ota-private.pem');

if (fs.existsSync(PRIVATE_PATH)) {
  console.error(`❌ ${PRIVATE_PATH} already exists. Refusing to overwrite.`);
  console.error('   If you really want to rotate keys, delete the file first');
  console.error('   AND remember to ship a native release with the new public key.');
  process.exit(1);
}

console.log('▶ Generating RSA-2048 keypair...');
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

fs.writeFileSync(PRIVATE_PATH, privateKey, { mode: 0o600 });
console.log(`✅ Wrote private key → ${PRIVATE_PATH} (chmod 600)`);
console.log('');
console.log('▶ Public key — paste this into capacitor.config.json:');
console.log('');
console.log('  "plugins": {');
console.log('    "LiveUpdate": {');
const pem = publicKey.trim().replace(/\n/g, '\\n');
console.log(`      "publicKey": "${pem}"`);
console.log('    }');
console.log('  }');
console.log('');
console.log('Public key (raw PEM):');
console.log(publicKey);
