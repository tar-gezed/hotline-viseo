'use strict';
// Optional browser acceptance; uses an externally installed Playwright package.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(__dirname, '../test-results/wave-hud');
const sizes = [[960,540], [1280,720], [1440,900], [1920,1080], [2560,1440], [3440,1440]];
const scenarios = ['wave-slide', 'wave-hold', 'first-second', 'wave-exit', 'beat-3', 'beat-2', 'beat-1',
  'clear-impact', 'clear-exit', 'resupply', 'resupply-opened', 'resupply-exhausted',
  'kill-impact', 'multikill-impact', 'combat-quiet', 'wave-02', 'player-aim-safe'];
fs.mkdirSync(output, { recursive:true });

(async () => {
  const browser = await chromium.launch({ headless:true,
    ...(process.env.CHROME_PATH ? { executablePath:process.env.CHROME_PATH } : {}) });
  const errors = [], results = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const raf = requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => raf(function frame(time) {
        if (window.__freezeWaveHUD) raf(frame); else callback(time);
      });
    });
    await page.route('**/js/main.js', async route => {
      const response = await route.fetch();
      const body = (await response.text()).replace('  // Boot & Start', `  // Boot & Start
        window.__waveTest = {
          get state() { return gameState; }, get player() { return player; },
          get hud() { return hud; }, get camera() { return camera; },
          get spawner() { return waveSpawner; }, get input() { return input; },
          render() { renderGameWorld(0); }
        };`);
      await route.fulfill({ response, body });
    });
    for (const [width,height] of sizes) {
      await page.setViewportSize({ width,height });
      await page.goto(process.env.WAVE_HUD_TEST_URL || 'http://127.0.0.1:8095/');
      await page.waitForFunction(() => window.__waveTest?.state === 'MENU_TITLE');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => __waveTest.state === 'MENU_MASK');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => __waveTest.state === 'PLAYING');
      const before = await page.evaluate(() => ({x:__waveTest.player.x,y:__waveTest.player.y}));
      await page.keyboard.down('KeyD'); await page.waitForTimeout(120); await page.keyboard.up('KeyD');
      assert(await page.evaluate(p => Math.hypot(__waveTest.player.x-p.x,__waveTest.player.y-p.y) > 1, before), 'movement works during announcement');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => __waveTest.state === 'PAUSED');
      const pausedAge = await page.evaluate(() => __waveTest.hud.waveAge);
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => __waveTest.hud.waveAge), pausedAge, 'pause freezes presentation');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => __waveTest.state === 'PLAYING');
      await page.evaluate(() => { window.__freezeWaveHUD = true; });

      const checks = await page.evaluate(() => {
        const t = __waveTest, h = t.hud;
        // Use the real map's caches, with additional caches tested by Node.
        t.spawner._spawnInterWaveSupplies();
        t.crates = t.spawner.supplyCrates;
        assertLocal(t.crates.length >= 2, 'map has both supply locations');
        const canvas = document.createElement('canvas');
        canvas.width = innerWidth; canvas.height = innerHeight;
        const ctx = canvas.getContext('2d');
        h.reset(); h.setWave(1,7); h.setPreWave(4);
        let panels = 0;
        const fillRect = ctx.fillRect.bind(ctx);
        ctx.fillRect = (...args) => { panels++; fillRect(...args); };
        // Every announcement frame remains free of rectangular backdrops.
        for (let i=0;i<=130;i++) {
          h.waveAge = i/100;
          h._drawPreWaveBanner(ctx,1280,720);
          h.clearAge = i/100; h.intermissionTime = 9;
          h._drawIntermissionBanner(ctx,1280,720);
        }
        assertLocal(panels === 0, 'announcements use no backdrop');
        const lettering = [], fillText = ctx.fillText.bind(ctx);
        ctx.fillText = (text,x,y,...args) => {
          const m = ctx.getTransform();
          lettering.push({text,font:ctx.font,x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f});
          fillText(text,x,y,...args);
        };
        // Both headlines stay visible until 1200 ms, including direct combat starts.
        h.preWaveTime = 0;
        for (const age of [1,1.199,1.2]) {
          lettering.length = 0; h.waveAge = age;
          h._drawPreWaveBanner(ctx,1280,720);
          assertLocal(lettering.some(v=>v.text==='WAVE 01') === (age<1.2), 'intro lasts exactly 1200 ms');
          lettering.length = 0; h.clearAge = age;
          h._drawIntermissionBanner(ctx,1280,720);
          const headline = lettering.find(v=>v.text==='WAVE 01 CLEAR');
          assertLocal(Boolean(headline) === (age<1.2), 'clear lasts exactly 1200 ms');
          if (headline) {
            assertLocal(headline.font.includes('96px'), 'headline is 20 percent smaller');
            assertLocal(headline.y === 136, 'headline keeps its top anchor during exit');
          }
          const metadata = lettering.find(v=>v.text.startsWith('REAPPRO'));
          assertLocal(metadata.y === 38 && metadata.x === 640, 'resupply has a fixed centered anchor');
          assertLocal(metadata.font.includes('18px'), 'resupply metadata is larger');
        }
        lettering.length = 0; h.clearedWave = 12; h.clearAge = .3;
        h._drawIntermissionBanner(ctx,1280,720);
        assertLocal(lettering.some(v=>v.text==='WAVE 12 CLEAR'), 'double-digit waves have no hash');
        // Whole HUD draw protects both actor and aim, even when they overlap.
        h.setPreWave(4);
        h.waveAge = .3; h.intermissionTime = 0;
        h.maskAge = 10; h.popups = [];
        const s = Math.min(innerWidth/1280,innerHeight/720);
        const p = {x:innerWidth/2,y:170*s};
        const aim = {x:p.x+30*s,y:p.y};
        ctx.clearRect(0,0,canvas.width,canvas.height);
        h.draw(ctx,innerWidth,innerHeight,{worldToScreen:(x,y)=>({x,y})},[],p,aim);
        for (const point of [p,aim]) {
          const pixels = ctx.getImageData(Math.floor(point.x-10),Math.floor(point.y-10),20,20).data;
          assertLocal(pixels.every((v,i)=>i%4!==3 || v===0), 'actor/aim exclusion stays transparent');
        }
        // Moving the actor/reticle cannot relocate any of the announcement text.
        for (const phase of ['intro','countdown','resupply']) {
          h.waveAge = phase === 'intro' ? .3 : 2;
          h.preWaveTime = phase === 'countdown' ? 2 : 4; h._syncCountdown();
          h.intermissionTime = phase === 'resupply' ? 8 : 0; h.clearAge = 1.3;
          const positions = [];
          for (const y of [innerHeight/2,136*s]) {
            lettering.length = 0;
            h.draw(ctx,innerWidth,innerHeight,{worldToScreen:(x,y)=>({x,y})},[],{x:p.x,y},{x:aim.x,y});
            positions.push(lettering.filter(v=>v.font.includes('96px') || v.text === '2' || v.text.startsWith('REAPPRO')));
          }
          assertLocal(JSON.stringify(positions[0])===JSON.stringify(positions[1]), `${phase} never follows player/aim`);
        }
        return { movement:'pass', pause:'pass', noPanels:'pass', actorAndAim:'pass', fixedAnchors:'pass', durationAndSize:'pass', caches:t.crates.length };
        function assertLocal(value,message) { if (!value) throw Error(message); }
      });

      for (const scenario of scenarios) {
        const labels = await page.evaluate(name => {
          const t = __waveTest, h = t.hud;
          h.reset(); h.setWave(1,7); h.setPreWave(4);
          h.setWeapon(t.player.currentWeapon,t.player.ammo);
          h.currentScore = 6325; h.waveAge = .32; h.waveImpact = 0;
          h.countdownImpact = 0; h.maskAge = 10;
          t.crates.forEach(crate => { crate.isOpened = false; });
          h.supplyCrates = t.crates;
          t.camera.snapTo(t.player.x,t.player.y);
          t.camera.roll = t.camera.shakeRoll = t.camera.shakeOffsetX = t.camera.shakeOffsetY = 0;
          t.camera.trauma = 0;
          if (name === 'wave-slide') h.waveAge = .035;
          if (name === 'first-second') h.waveAge = .8;
          if (name === 'wave-exit') { h.waveAge = 1.1; h.preWaveTime = 2.9; h._syncCountdown(); }
          if (name.startsWith('beat-')) {
            const beat = Number(name.slice(-1));
            h.preWaveTime = beat - .02; h._syncCountdown();
            h.waveAge = 4 - h.preWaveTime;
            h.countdownImpact = h.countdownImpactDuration;
          }
          if (name.startsWith('clear-') || name.startsWith('resupply')) {
            h.preWaveTime = 0; h.setIntermission(8,1);
            h.clearAge = name === 'clear-impact' ? .12 : name === 'clear-exit' ? 1.1 : 1.3;
            h.enemiesRemaining = 0;
            if (name === 'resupply-opened') t.crates[0].isOpened = true;
            if (name === 'resupply-exhausted') t.crates.forEach(crate => { crate.isOpened = true; });
          }
          if (['kill-impact','multikill-impact','combat-quiet'].includes(name)) {
            h.preWaveTime = 0; h.waveAge = 5;
            h.setEnemiesRemaining(name === 'multikill-impact' ? 4 : 6);
            if (name === 'combat-quiet') h.enemyImpact = 0;
          }
          if (name === 'wave-02') {
            h.preWaveTime = 0; h.setWave(2,10); h.waveAge = .2;
          }
          const original = {x:t.player.x,y:t.player.y};
          if (name === 'player-aim-safe') {
            const s = Math.min(innerWidth/1280,innerHeight/720);
            Object.assign(t.player,t.camera.screenToWorld(innerWidth/2,170*s));
            t.input.mouse.x = innerWidth/2+30*s; t.input.mouse.y = 170*s;
          }
          // Record labels from the actual HUD draw, leaving the world renderer intact.
          const labels = [], baseType = h._type, baseMetadata = h._metadata, baseHeadline = h._drawWaveHeadline;
          h._type = function(ctx,text,...args) { labels.push(text); return baseType.call(this,ctx,text,...args); };
          h._metadata = function(ctx,text,...args) { labels.push(text); return baseMetadata.call(this,ctx,text,...args); };
          h._drawWaveHeadline = function(ctx,width,text,age,duration,...args) {
            if (age < duration) labels.push(text);
            return baseHeadline.call(this,ctx,width,text,age,duration,...args);
          };
          t.render();
          h._type = baseType; h._metadata = baseMetadata; h._drawWaveHeadline = baseHeadline;
          Object.assign(t.player,original);
          return labels;
        }, scenario);
        if (scenario.startsWith('beat-')) assert(labels.includes(scenario.slice(-1)));
        if (scenario === 'first-second') assert(!labels.some(label=>/^[1-5]$/.test(label)));
        if (scenario === 'wave-exit') assert(labels.includes('WAVE 01'));
        if (scenario === 'clear-impact') assert(labels.includes('WAVE 01 CLEAR'));
        if (scenario === 'resupply') assert(labels.includes('REAPPRO MUNITIONS DISPO 8s'));
        if (scenario === 'resupply-exhausted') assert(labels.includes('REAPPRO EPUISES / VAGUE SUIVANTE 8s'));
        if (scenario === 'wave-02') assert(labels.includes('WAVE 02'));
        await page.screenshot({ path:path.join(output,`${scenario}-${width}x${height}.png`) });
      }
      results.push({width,height,...checks,screenshots:scenarios.length});
      console.log(`PASS ${width}x${height}: input, pause, transparent type, actor/aim protection, ${scenarios.length} screenshots`);
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'validation.json'),JSON.stringify({results,errors},null,2));
    fs.writeFileSync(path.join(output,'index.html'), `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Annonces de vague</title>
      <style>body{background:#100e20;color:#f2e5c9;font:16px monospace;margin:32px}a{color:#39ff14}img{width:100%;display:block}details{padding:12px}summary{cursor:pointer}section{max-width:1600px}</style>
      <h1>HOTLINE VISEO / WAVES</h1><p>${sizes.length*scenarios.length} captures · <a href="validation.json">Validation</a></p>
      ${scenarios.map(name=>`<section><h2>${name}</h2>${sizes.map(([w,h],i)=>`<details ${i===1?'open':''}><summary>${w} × ${h}</summary><img loading="lazy" src="${name}-${w}x${h}.png"></details>`).join('')}</section>`).join('')}</html>`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
