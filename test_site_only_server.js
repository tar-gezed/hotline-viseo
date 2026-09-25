'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const root = __dirname;

async function freePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

function get(port, requestPath) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path: requestPath }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    request.setTimeout(2000, () => request.destroy(new Error('HTTP request timed out')));
    request.on('error', reject);
  });
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForServer(child, port, getLogs) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (child.spawnError) throw child.spawnError;
    if (child.exitCode !== null) throw new Error(`Static server exited early: ${getLogs()}`);
    try { return await get(port, '/'); } catch { await delay(50); }
  }
  throw new Error(`Static server did not become ready: ${getLogs()}`);
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill();
  await Promise.race([exited, delay(2000)]);
}

(async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [
    path.join(root, 'tools', 'serve.cjs'), '--port', String(port), '--site-only'
  ], { cwd: root, windowsHide: true });
  let logs = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  child.on('error', error => { child.spawnError = error; });

  try {
    const home = await waitForServer(child, port, () => logs);
    assert.equal(home.status, 200);
    assert.match(home.body, /HOTLINE VISEO/i);

    for (const resource of [
      '/js/main.js',
      '/js/network/coop_session.js',
      '/vendor/trystero-mqtt.min.js',
      '/vendor/LICENSES.txt',
      '/maps/active.json',
      '/map_editor.html'
    ]) {
      const response = await get(port, resource);
      assert.equal(response.status, 200, `${resource} should be available through the public site server`);
    }

    for (const privateFile of [
      '/AGENTS.md',
      '/README.md',
      '/package.json',
      '/docs/multiplayer-architecture.md',
      '/tools/serve.cjs',
      '/test_site_only_server.js',
      '/js/../tools/serve.cjs'
    ]) {
      const response = await get(port, privateFile);
      assert.equal(response.status, 404, `${privateFile} must not be exposed by the public site server`);
    }

    assert.equal((await get(port, '/.git/config')).status, 403, 'hidden paths must remain blocked');
    console.log('PASS site-only server exposes game and multiplayer assets while hiding repository files');
  } finally {
    await stop(child);
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
