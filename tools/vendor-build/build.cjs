'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {buildSync} = require('esbuild');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'vendor');
fs.mkdirSync(out, {recursive:true});
buildSync({stdin:{contents:"export {joinRoom,selfId} from '@trystero-p2p/mqtt';",resolveDir:__dirname},bundle:true,format:'esm',platform:'browser',target:'es2020',minify:true,legalComments:'eof',outfile:path.join(out,'trystero-mqtt.min.js')});
// Retain every bundled package license, including MQTT's transitive packages.
const licenses = [];
function scan(dir) {
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    if (!entry.isDirectory() || entry.name === '.bin' || entry.name === '@esbuild') continue;
    const p = path.join(dir,entry.name), manifest = path.join(p,'package.json');
    if (entry.name.startsWith('@')) { scan(p); continue; }
    if (!fs.existsSync(manifest) || entry.name === 'esbuild') continue;
    const meta = JSON.parse(fs.readFileSync(manifest,'utf8'));
    const file = fs.readdirSync(p).find(n=>/^licen[sc]e(?:\.|$)/i.test(n));
    licenses.push(`\n--- ${meta.name}@${meta.version} (${meta.license || 'see package'}) ---\n${file ? fs.readFileSync(path.join(p,file),'utf8') : ''}`);
    if (fs.existsSync(path.join(p,'node_modules'))) scan(path.join(p,'node_modules'));
  }
}
scan(path.join(__dirname,'node_modules'));
fs.writeFileSync(path.join(out,'LICENSES.txt'),licenses.join('\n'));
console.log('Bundle SHA-256:',crypto.createHash('sha256').update(fs.readFileSync(path.join(out,'trystero-mqtt.min.js'))).digest('hex'));
