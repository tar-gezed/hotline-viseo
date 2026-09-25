'use strict';
// Development only: the game itself remains an ordinary static site.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const siteOnly = args.includes('--site-only');
const sitePages = new Set(['index.html', 'maps.html', 'map_editor.html', 'favicon.ico']);
const siteDirectories = new Set(['assets', 'css', 'js', 'maps']);
const siteVendorFiles = new Set(['vendor/trystero-mqtt.min.js', 'vendor/LICENSES.txt', 'vendor/README.md']);
function option(name, fallback) {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
}
const port = Number(option('--port', '8080'));
const prefix = option('--prefix', '/');
if (!Number.isInteger(port) || port < 1 || port > 65535 || !/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(prefix)) {
  console.error('Usage: node tools/serve.cjs [--port 8080] [--prefix /hotline-viseo/] [--site-only] [--open]');
  process.exit(1);
}
function isAllowedSiteFile(file) {
  if (!siteOnly) return true;
  const relative = path.relative(root, file).split(path.sep).join('/');
  if (!relative || sitePages.has(relative) || siteVendorFiles.has(relative)) return true;
  return siteDirectories.has(relative.split('/')[0]);
}
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.wav':'audio/wav', '.mp3':'audio/mpeg', '.ico':'image/x-icon', '.ttf':'font/ttf', '.woff':'font/woff', '.woff2':'font/woff2' };
const server = http.createServer(async (req, res) => {
  const reply = (status, message) => { res.writeHead(status, {'Content-Type':'text/plain; charset=utf-8'}); res.end(message); };
  if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow','GET, HEAD'); return reply(405, 'Method not allowed'); }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { return reply(400, 'Invalid URL'); }
  if (prefix !== '/' && pathname === prefix.slice(0,-1)) { res.writeHead(302, {Location:prefix}); return res.end(); }
  if (!pathname.startsWith(prefix)) return reply(404, 'Not found');
  const relative = pathname.slice(prefix.length);
  if (relative.includes('\\') || relative.includes('\0') || relative.split('/').some(s=>s.startsWith('.'))) return reply(403, 'Forbidden');
  let file = path.resolve(root, relative);
  if (file !== root && !file.startsWith(root + path.sep)) return reply(403, 'Forbidden');
  if (!isAllowedSiteFile(file)) return reply(404, 'Not found');
  try {
    // realpath also prevents symbolic links escaping the served folder.
    file = await fs.promises.realpath(file);
    if (file !== root && !file.startsWith(root + path.sep)) return reply(403, 'Forbidden');
    if (!isAllowedSiteFile(file)) return reply(404, 'Not found');
    let stat = await fs.promises.stat(file);
    if (stat.isDirectory()) {
      if (!pathname.endsWith('/')) { res.writeHead(302,{Location:encodeURI(pathname + '/')}); return res.end(); }
      file = path.join(file, 'index.html'); stat = await fs.promises.stat(file);
    }
    if (!stat.isFile()) return reply(404, 'Not found');
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream', 'Content-Length':stat.size, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  } catch (e) { reply(e.code === 'ENOENT' || e.code === 'ENOTDIR' ? 404 : 500, 'File unavailable'); }
});
server.on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? `Le port ${port} est déjà utilisé. Fermer l’ancien serveur ou lancer npm start -- --port ${port+1}.` : e.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  const url = `http://localhost:${port}${prefix}`;
  console.log(`Jeu : ${url}\nÉditeur : ${url}map_editor.html\nArrêter : Ctrl+C`);
  if (args.includes('--open')) {
    const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawn(command,[url],{stdio:'ignore'}).on('error',()=>console.log(`Ouvrir ${url} dans le navigateur.`));
  }
});
