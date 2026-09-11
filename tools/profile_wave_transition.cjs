'use strict';
// Development-only Playwright probe. Start npm start, then run this script.
// The private test bridge is injected in the browser response, never shipped.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const url = process.argv[2] || 'http://localhost:8080';
const mainPath = path.join(__dirname, '../js/main.js');
const bridge = `
  window.__waveProbe = {
    ready: () => !!waveSpawner,
    start: () => { unlockAudio(); startNewGame('vincent'); waveSpawner.startWave(1, true); },
    clear: () => { enemies.forEach(e => e.kill('BULLET', 0)); waveSpawner.spawnQueue = []; waveSpawner.enemiesAlive = 1; waveSpawner.onEnemyKilled(); ${process.argv.includes('--no-clear-text') ? 'particleSystem.floatingTexts = [];' : ''} },
    state: () => ({ gameState, hitStopTimer, wave: waveSpawner.currentWave, voices: synthMusic.activeVoices.size, track: synthMusic.currentTrack }),
    next: () => waveSpawner.skipIntermission(),
    instrument: () => {
      for (const name of ['play','_scheduler','_releaseVoices','init']) window.__measure(synthMusic, name, 'music.' + name);
      window.__measure(soundFX, 'playWaveClearFanfare', 'fanfare');
      window.__measure(waveSpawner, '_triggerWaveClear', 'waveClear');
      window.__measure(particleSystem, 'render', 'particles');
      window.__measure(hud, 'render', 'hud');
      window.__measure(postProcessor, 'render', 'postprocess');
    }
  };
`;
function summary(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a,b) => a-b);
  return { count: values.length, median: +sorted[Math.floor(sorted.length/2)].toFixed(2), p95: +sorted[Math.floor(sorted.length*.95)].toFixed(2), max: +sorted.at(-1).toFixed(2) };
}
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    for (const music of [true, false]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/js/main.js', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(mainPath, 'utf8').replace('  // Boot & Start', bridge + '\n  // Boot & Start') }));
      await page.addInitScript(() => {
        window.__samples = { frames: [], calls: [], longTasks: [] };
        window.__phase = 'boot';
        window.__measure = (object, method, label) => {
          const original = object[method];
          object[method] = function (...args) {
            const t = performance.now();
            try { return original.apply(this, args); }
            finally { window.__samples.calls.push({ label, phase: window.__phase, ms: performance.now() - t }); }
          };
        };
        new PerformanceObserver(list => list.getEntries().forEach(e => window.__samples.longTasks.push({ ms: e.duration, phase: window.__phase }))).observe({ type: 'longtask', buffered: true });
        const raf = window.requestAnimationFrame.bind(window);
        let last = 0;
        window.requestAnimationFrame = callback => raf(time => {
          const t = performance.now();
          callback(time);
          window.__samples.frames.push({ phase: window.__phase, interval: last ? time - last : 0, work: performance.now() - t });
          last = time;
        });
      });
      await page.goto(url);
      await page.waitForFunction(() => window.__waveProbe?.ready());
      await page.evaluate(music => {
        // Keep the player alive so all runs measure the same transition.
        window.Enemy.prototype.update = function () {};
        window.__waveProbe.instrument();
        if (!music) { window.synthMusic.stop(); window.synthMusic.play = function () {}; }
        window.__waveProbe.start();
        window.__phase = 'combat';
      }, music);
      await page.waitForTimeout(2500);
      const transition = await page.evaluate(() => {
        window.__phase = 'clear';
        window.__waveProbe.clear();
        return window.__waveProbe.state();
      });
      if (process.argv.includes('--screenshot')) {
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(os.tmpdir(), `hotline-wave-clear-${music}.png`) });
      }
      await page.waitForTimeout(2500);
      await page.evaluate(() => { window.__phase = 'next'; window.__waveProbe.next(); });
      await page.waitForTimeout(1500);
      const data = await page.evaluate(() => ({ ...window.__samples, state: window.__waveProbe.state() }));
      const phases = {};
      for (const phase of ['combat','clear','next']) {
        const frames = data.frames.filter(f => f.phase === phase);
        phases[phase] = { interval: summary(frames.map(f => f.interval)), work: summary(frames.map(f => f.work)) };
      }
      const calls = {};
      for (const label of new Set(data.calls.map(c => c.label))) {
        calls[label] = {};
        for (const phase of ['combat','clear','next']) calls[label][phase] = summary(data.calls.filter(c => c.label === label && c.phase === phase).map(c => c.ms));
      }
      console.log(JSON.stringify({ music, transition, phases, calls, longTasks: data.longTasks.filter(t => t.phase !== 'boot'), final: data.state, errors }));
      if (errors.length || transition.gameState !== 'INTERMISSION' || data.state.wave !== 2 || transition.hitStopTimer !== 0) throw new Error('Wave lifecycle failed');
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
