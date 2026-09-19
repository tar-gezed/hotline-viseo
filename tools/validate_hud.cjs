'use strict';
// Optional Playwright acceptance tool. No browser dependency is shipped.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(__dirname, '../test-results/hud');
fs.mkdirSync(output, { recursive: true });
const sizes = [[1280,720],[1440,900],[1920,1080],[2560,1440],[3440,1440]];
const scenarios = ['intro', 'gun', 'combo-impact', 'empty', 'dry-fire', 'melee', 'player-safe', 'intermission', 'pause'];
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const errors = [], results = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => raf(function frame(t) {
        if (window.__freezeHUD) raf(frame); else callback(t);
      });
    });
    await page.route('**/js/main.js', async route => {
      const response = await route.fetch();
      const body = (await response.text()).replace('  // Boot & Start', `  // Boot & Start
        window.__hudTest = {
          get state() { return gameState; }, get player() { return player; },
          get hud() { return hud; }, get camera() { return camera; },
          get bullets() { return bullets; }, get pause() { return pauseMenu; },
          renderPause() { pauseGame(); renderGameWorld(0); pauseMenu.render(ctx,canvas.width,canvas.height,input); resumeGame(); },
          render() { renderGameWorld(0); }
        };`);
      await route.fulfill({ response, body });
    });
    for (const [width,height] of sizes) {
      const size = `${width}x${height}`;
      await page.setViewportSize({ width,height });
      await page.goto(process.env.HUD_TEST_URL || 'http://127.0.0.1:8093/');
      await page.waitForFunction(() => window.__hudTest?.state === 'MENU_TITLE');
      await page.evaluate(() => { Enemy.prototype.update = function () {}; });
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => __hudTest.state === 'MENU_MASK');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => __hudTest.state === 'PLAYING');
      await page.waitForTimeout(150);
      await page.evaluate(() => {
        const t = __hudTest;
        t.player.equipWeapon('PISTOL', 1);
        t.hud.setWeapon(t.player.currentWeapon, t.player.ammo);
        t.dryEvents = 0;
        const original = t.hud.notifyDryFire.bind(t.hud);
        t.hud.notifyDryFire = () => { original(); t.dryEvents++; t.peak = t.hud.ammoImpact; };
      });
      await page.mouse.click(width/2+120,height/2);
      await page.waitForTimeout(350);
      assert.equal(await page.evaluate(() => __hudTest.player.ammo), 0, 'last shot spends exactly one round');
      await page.mouse.click(width/2+120,height/2);
      await page.waitForTimeout(40);
      assert.deepEqual(await page.evaluate(() => ({ ammo: __hudTest.player.ammo, events: __hudTest.dryEvents, peak: __hudTest.peak })), { ammo:0, events:1, peak:.1 });
      await page.waitForTimeout(350);
      await page.mouse.click(width/2+120,height/2);
      await page.waitForTimeout(40);
      assert.equal(await page.evaluate(() => __hudTest.dryEvents), 2, 'repeated dry fire retriggers');
      await page.evaluate(() => { __hudTest.player.equipWeapon('BAT'); __hudTest.player.attackCooldown = 0; });
      await page.mouse.click(width/2+120,height/2);
      await page.waitForTimeout(30);
      assert.equal(await page.evaluate(() => __hudTest.dryEvents), 2, 'melee never triggers empty feedback');
      assert(await page.evaluate(() => __hudTest.player.attackCooldown > 0), 'melee swing still works');
      await page.evaluate(() => { window.__freezeHUD = true; });
      for (const scenario of scenarios) {
        await page.evaluate(name => {
          const t = __hudTest, h = t.hud;
          h.reset(); h.setMask('vincent'); h.setWave(1,7);
          t.player.equipWeapon('UZI',20); h.setWeapon(t.player.currentWeapon, t.player.ammo);
          h.addScore(12400); h.update(4);
          t.camera.snapTo(t.player.x,t.player.y);
          if (name === 'intro') { h.setWave(2,7); h.preWaveTime = 3; }
          if (['combo-impact','player-safe'].includes(name)) {
            for (let i=0;i<6;i++) h.addKillScore('GUN',400,t.player.x+80,t.player.y-40);
            h.popups = []; h.update(.016);
          }
          if (['empty','dry-fire'].includes(name)) {
            t.player.equipWeapon('UZI',0); h.setWeapon(t.player.currentWeapon,0); h.update(.2);
            if (name === 'dry-fire') h.notifyDryFire();
          }
          if (name === 'melee') { t.player.equipWeapon('BAT'); h.setWeapon(t.player.currentWeapon,t.player.ammo); }
          if (name === 'intermission') h.intermissionTime = 8;
          if (name === 'player-safe') {
            // Move the actual sprite into the usual combo zone, with camera frozen.
            const original = { x:t.player.x, y:t.player.y };
            const s = Math.min(innerWidth/1280,innerHeight/720);
            const position = t.camera.screenToWorld(innerWidth-170*s,140*s);
            Object.assign(t.player,position);
            t.render(); Object.assign(t.player,original);
          } else t.render();
          if (name === 'pause') t.renderPause();
        }, scenario);
        await page.screenshot({ path:path.join(output, `${scenario}-${size}.png`) });
      }
      results.push({ size, firearm:'pass', melee:'pass', repeatedDryFire:'pass', screenshots:scenarios.length });
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output,'validation.json'), JSON.stringify({ results,errors },null,2));
    fs.writeFileSync(path.join(output,'index.html'), `<!doctype html><html lang="fr"><meta charset="utf-8"><title>HUD — validation</title><style>body{background:#100e20;color:#f2e5c9;font:16px monospace;margin:32px}a{color:#80d9d2}img{width:100%;display:block}details{padding:15px}summary{cursor:pointer}section{max-width:1500px}</style><h1>HOTLINE VISEO / HUD</h1><p>45 captures · 5 formats · <a href="validation.json">Tests navigateur</a></p>${scenarios.map(name=>`<section><h2>${name}</h2>${sizes.map(([w,h],i)=>`<details ${i===0?'open':''}><summary>${w} × ${h}</summary><a href="${name}-${w}x${h}.png"><img loading="lazy" src="${name}-${w}x${h}.png"></a></details>`).join('')}</section>`).join('')}</html>`);
    console.log('PASS: firearm, repeated dry fire, melee, 45 screenshots across five viewports; no page errors.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
