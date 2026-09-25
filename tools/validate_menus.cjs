'use strict';
// Optional browser acceptance check; no dependency is shipped to the game.
// PLAYWRIGHT_MODULE may name an already installed Playwright package.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = process.env.MENU_TEST_URL || 'http://127.0.0.1:8087/';
const output = path.resolve(__dirname, '../test-results/menus');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const errors = [], results = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    // A test-only seam in the served response, never in production sources.
    await page.route('**/js/main.js', async route => {
      const response = await route.fetch();
      const source = (await response.text()).replace('  // Boot & Start', `  // Boot & Start
      window.__menuTest = {
        get state() { return gameState; }, get active() { return activeMenu(); },
        get selected() { return selectedMaskId; }, get input() { return input; },
        get player() { return player; }, get spawner() { return waveSpawner; },
        get settings() { return audioSettings; },
        get elapsed() { return runStats.elapsedTime; },
        intermission() { gameState = STATES.INTERMISSION; },
        die() { enterDeathState(); }, scores() { showScoreScreen(); }
      };`);
      await route.fulfill({ response, body: source });
    });
    await page.addInitScript(() => {
      window.__pad = null;
      Object.defineProperty(navigator, 'getGamepads', { value: () => window.__pad ? [window.__pad] : [] });
    });
    const state = () => page.evaluate(() => window.__menuTest.state);
    const expectState = async expected => { await page.waitForFunction(s => window.__menuTest?.state === s, expected); assert.equal(await state(), expected); };
    const key = async code => { await page.keyboard.press(code); await page.waitForTimeout(65); };
    const shot = async name => { await page.waitForTimeout(380); await page.screenshot({ path: path.join(output, name + '.png') }); };
    const click = async index => {
      const p = await page.evaluate(i => {
        const r = window.__menuTest.active.regions.find(r => r.index === i);
        const f = UITheme.frame(innerWidth, innerHeight);
        return { x: f.x + (r.x + r.w / 2) * f.scale, y: f.y + (r.y + r.h / 2) * f.scale };
      }, index);
      await page.mouse.click(p.x, p.y); await page.waitForTimeout(80);
    };
    for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080], [3440, 1440]]) {
      const size = `${width}x${height}`;
      await page.setViewportSize({ width, height });
      await page.goto(url); await expectState('MENU_TITLE');
      assert.equal(await page.evaluate(() => window.soundFX === window.soundFx && window.soundFX === window.AudioManager), true);
      await page.waitForFunction(() => window.__menuTest.active.timer >= .55);
      const titleReadyMs = await page.evaluate(() => performance.now());
      assert.equal(await page.locator('#mapMenuLink').isVisible(), false);
      assert.equal(await page.locator('#instructions-overlay').isVisible(), false);
      await shot('title-' + size);
      await click(5); await expectState('MENU_CREDITS'); await shot('credits-' + size);
      await key('Escape'); await expectState('MENU_TITLE');
      await key('Enter'); await expectState('MENU_CREDITS');
      await click(0); await expectState('MENU_TITLE');
      await key('ArrowDown');
      await key('Enter'); await expectState('MENU_MASK');
      assert.equal(await page.evaluate(() => window.__menuTest.player), null, 'title confirm cannot launch gameplay');
      await shot('characters-' + size);
      await key('Digit5'); await key('Escape'); await expectState('MENU_TITLE');
      await key('Enter'); await expectState('MENU_MASK');
      assert.equal(await page.evaluate(() => window.__menuTest.active.selectedMaskId), 'jade');
      await key('Escape'); await key('ArrowDown'); await key('ArrowDown'); await key('Enter'); await expectState('MENU_CONTROLS');
      await shot('keyboard-' + size); await key('ArrowRight'); await shot('controller-' + size);
      assert.equal(await page.evaluate(() => window.__menuTest.active.controller.naturalWidth), 2138);
      await key('Escape'); await expectState('MENU_TITLE');
      await click(3); await expectState('MENU_AUDIO');
      await key('ArrowLeft');
      const music = await page.evaluate(() => window.__menuTest.settings.values.music);
      assert.equal(music, .65);
      const sliderPoints = await page.evaluate(() => {
        const f = UITheme.frame(innerWidth, innerHeight);
        return [.35, .65].map(value => ({ x: f.x + (620 + 430 * value) * f.scale, y: f.y + 290 * f.scale }));
      });
      await page.mouse.move(sliderPoints[0].x, sliderPoints[0].y);
      await page.mouse.down(); await page.waitForTimeout(80);
      assert.equal(await page.evaluate(() => window.synthMusic.volume), .35);
      await page.mouse.move(sliderPoints[1].x, sliderPoints[1].y, { steps: 4 });
      await page.waitForTimeout(80); await page.mouse.up();
      assert.equal(await page.evaluate(() => window.synthMusic.volume), .65);
      await shot('audio-' + size);
      await key('Escape'); await click(4); await expectState('MENU_TOOLS'); await shot('tools-' + size);
      await key('Escape'); await click(0); await expectState('MENU_MASK');
      await key('Enter'); await expectState('PLAYING');
      assert.equal(await page.evaluate(() => window.synthMusic.volume), .65);
      await key('Escape'); await expectState('PAUSED'); await shot('pause-' + size);
      const before = await page.evaluate(() => ({ x: __menuTest.player.x, y: __menuTest.player.y, elapsed: __menuTest.elapsed, wave: __menuTest.spawner.currentWave }));
      await key('ArrowDown'); await key('Enter'); await expectState('MENU_AUDIO');
      await key('ArrowDown'); await key('ArrowLeft');
      await page.waitForTimeout(200);
      assert.deepEqual(await page.evaluate(() => ({ x: __menuTest.player.x, y: __menuTest.player.y, elapsed: __menuTest.elapsed, wave: __menuTest.spawner.currentWave })), before, 'audio freezes the run');
      await key('Escape'); await expectState('PAUSED');
      await key('Escape'); await expectState('PLAYING');
      assert.equal(await page.evaluate(() => window.soundFX.sfxVolume), .8);
      await page.reload(); await expectState('MENU_TITLE');
      assert.equal(await page.evaluate(() => __menuTest.settings.values.music), .65);
      assert.equal(await page.evaluate(() => __menuTest.settings.values.sfx), .8);
      await page.evaluate(() => localStorage.removeItem('hotline-viseo-audio-v1'));
      results.push({ size, screens: 8, titleReadyMs: Math.round(titleReadyMs), keyboard: 'pass', mouse: 'pass', settings: 'pass', pauseFreeze: 'pass' });
    }

    // Poll the actual InputManager with a standard gamepad, including held edges.
    await page.reload(); await expectState('MENU_TITLE');
    await page.evaluate(() => {
      window.__pad = { id: 'Acceptance controller', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    });
    const pad = async (index, held = 90) => {
      await page.evaluate(i => { __pad.buttons[i] = { pressed: true, value: 1 }; }, index);
      await page.waitForTimeout(held);
      await page.evaluate(i => { __pad.buttons[i] = { pressed: false, value: 0 }; }, index);
      await page.waitForTimeout(80);
    };
    await pad(12); await pad(0); await expectState('MENU_CREDITS');
    await pad(1); await expectState('MENU_TITLE'); await pad(13);
    await pad(13); await pad(13); await pad(0); await expectState('MENU_CONTROLS');
    await pad(15); assert.equal(await page.evaluate(() => __menuTest.active.tab), 1);
    await pad(1); await expectState('MENU_TITLE');
    await pad(13); await pad(0); await expectState('MENU_AUDIO');
    await pad(14); assert.equal(await page.evaluate(() => window.synthMusic.volume), .65);
    await pad(1); await expectState('MENU_TITLE');
    await pad(12); await pad(12); await pad(12); await pad(0, 400); await expectState('MENU_MASK');
    assert.equal(await page.evaluate(() => __menuTest.player), null, 'held A cannot double-confirm');
    await pad(0); await expectState('PLAYING');
    await pad(9); await expectState('PAUSED');
    await pad(2); assert.equal(await page.evaluate(() => window.synthMusic.isMuted), true);
    await pad(2); assert.equal(await page.evaluate(() => window.synthMusic.isMuted), false);
    await pad(13); await pad(0); await expectState('MENU_AUDIO');
    await pad(1); await expectState('PAUSED'); await pad(1); await expectState('PLAYING');
    await page.evaluate(() => __menuTest.intermission());
    await pad(9); await expectState('PAUSED'); await pad(1); await expectState('INTERMISSION');
    await page.evaluate(() => __menuTest.die());
    assert(Math.abs(await page.evaluate(() => window.synthMusic.volume) - .65 * .32 / .7) < .0001);
    await page.evaluate(() => __menuTest.scores()); await key('KeyM'); await expectState('MENU_MASK');
    assert.equal(await page.evaluate(() => window.synthMusic.volume), .65);
    await key('Escape'); await expectState('MENU_TITLE');
    // Existing map pages remain reachable under the same hosting prefix.
    await page.evaluate(() => { window.__pad = null; });
    await click(4); await expectState('MENU_TOOLS'); await click(0);
    await page.waitForURL('**/maps.html');
    await page.goto(url); await expectState('MENU_TITLE');
    await page.waitForTimeout(400); await click(4); await click(1);
    await page.waitForURL('**/map_editor.html');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify({ results, gamepad: 'pass (simulated standard mapping)', returnFromScores: 'pass', intermissionResume: 'pass', errors }, null, 2));
    const sizes = results.map(r => r.size);
    const screens = { title: 'Titre', credits: 'Crédits', characters: 'Personnages', keyboard: 'Clavier / souris', controller: 'Manette', audio: 'Audio', tools: 'Tools / Maps', pause: 'Pause' };
    fs.writeFileSync(path.join(output, 'index.html'), `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Hotline VISEO — captures</title><style>body{background:#100e20;color:#f2e5c9;font:16px monospace;margin:32px}a{color:#80d9d2}h1,h2{color:#ed4e93}img{width:100%;display:block;margin:16px 0 40px}nav{display:flex;gap:24px;flex-wrap:wrap}section{max-width:1400px}summary{cursor:pointer;padding:16px}details{border-bottom:1px solid #513347}</style><h1>HOTLINE VISEO</h1><p>32 captures · 4 résolutions · <a href="validation.json">Rapport de validation</a></p><nav>${Object.entries(screens).map(([id, name]) => `<a href="#${id}">${name}</a>`).join('')}</nav>${Object.entries(screens).map(([id, name]) => `<section id="${id}"><h2>${name}</h2>${sizes.map((size, i) => `<details ${i === 0 ? 'open' : ''}><summary>${size}</summary><a href="${id}-${size}.png"><img loading="lazy" src="${id}-${size}.png" alt="${name} ${size}"></a></details>`).join('')}</section>`).join('')}</html>`);
    console.log('PASS: 32 screenshots, four viewports, keyboard/mouse/gamepad, persisted audio, pause freeze and return paths.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
