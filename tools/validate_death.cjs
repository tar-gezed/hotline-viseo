'use strict';
// Optional browser acceptance tool. Uses an existing Playwright installation.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(__dirname, '../test-results/death');
fs.mkdirSync(output, { recursive: true });
const sizes = [[1280,720], [1440,900], [1920,1080], [2560,1440], [3440,1440]];

(async () => {
  const browser = await chromium.launch({ headless:true, ...(process.env.CHROME_PATH ? { executablePath:process.env.CHROME_PATH } : {}) });
  const errors = [], results = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      // A manually advanced real game loop makes 220/400 ms boundaries exact.
      window.requestAnimationFrame = callback => { window.__frame = callback; return 1; };
      window.__pad = null;
      navigator.getGamepads = () => window.__pad ? [window.__pad] : [];
    });
    await page.route('**/js/main.js', async route => {
      const response = await route.fetch();
      const body = (await response.text()).replace('  // Boot & Start', `  // Boot & Start
        window.__deathTest = {
          get state() { return gameState; }, get timer() { return deathTimer; },
          get player() { return player; }, get hud() { return hud; },
          get input() { return input; }, get overlay() { return deathOverlay; },
          tick(dt = .016) { window.__frame(lastTime + dt * 1000); },
          die() { player.isInvulnerable = false; player.takeHit({type:'BULLET', angle: .8}); },
          prepare() {
            Enemy.prototype.update = function () {};
            this.hudCalls = 0; this.overlayCalls = 0; this.text = [];
            const hudRender = hud.render.bind(hud), overlayRender = deathOverlay.render.bind(deathOverlay);
            hud.render = (...args) => { this.hudCalls++; return hudRender(...args); };
            deathOverlay.render = (...args) => { this.overlayCalls++; return overlayRender(...args); };
            const fillText = ctx.fillText.bind(ctx);
            ctx.fillText = (text, ...args) => { this.text.push(text); return fillText(text, ...args); };
          },
          resetCalls() { this.hudCalls = 0; this.overlayCalls = 0; this.text = []; },
          snapshot() {
            postProcessor.resetTransientEffects(); camera.snapTo(player.x, player.y);
            const draw = deathOverlay.render; deathOverlay.render = () => {};
            renderGameWorld(0); deathOverlay.render = draw;
            this.base = document.createElement('canvas');
            this.base.width = canvas.width; this.base.height = canvas.height;
            this.base.getContext('2d').drawImage(canvas,0,0);
          },
          preview(time, font, gamepad = false) {
            ctx.drawImage(this.base,0,0); this.text = [];
            deathOverlay.fontFamily = font;
            deathOverlay.render(ctx,canvas.width,canvas.height,time,gamepad);
          },
          brightness() {
            const x = Math.floor(canvas.width*.46), y = Math.floor(canvas.height*.78);
            const w = Math.floor(canvas.width*.08), h = Math.floor(canvas.height*.04);
            const before = this.base.getContext('2d').getImageData(x,y,w,h).data;
            const after = ctx.getImageData(x,y,w,h).data;
            let a=0,b=0;
            for (let i=0;i<before.length;i+=4) {
              a += before[i]*.2126 + before[i+1]*.7152 + before[i+2]*.0722;
              b += after[i]*.2126 + after[i+1]*.7152 + after[i+2]*.0722;
            }
            return b/a;
          },
          image() { return canvas.toDataURL(); }
        };`);
      assert.notEqual(body, await response.text(), 'browser test injection found its anchor');
      await route.fulfill({ response,body });
    });
    const tick = dt => page.evaluate(dt => __deathTest.tick(dt), dt);
    const key = async name => { await page.keyboard.down(name); await tick(.01); await page.keyboard.up(name); await tick(.01); };
    const advance = async seconds => { for (let i=0;i<Math.round(seconds*100);i++) await tick(.01); };
    for (const [width,height] of sizes) {
      const size = `${width}x${height}`;
      await page.setViewportSize({ width,height });
      await page.goto(process.env.DEATH_TEST_URL || 'http://127.0.0.1:8094/');
      await page.waitForFunction(() => window.__frame && window.__deathTest?.overlay, null, { polling:100 });
      await page.evaluate(() => __deathTest.prepare());
      await key('Enter'); await key('Enter');
      assert.equal(await page.evaluate(() => __deathTest.state), 'PLAYING');
      const selectedFont = await page.evaluate(() => __deathTest.overlay.fontFamily);
      await page.evaluate(() => { __deathTest.hud.addKillScore('GUN',400,0,0); __deathTest.resetCalls(); __deathTest.die(); });
      await tick(.01);
      const first = await page.evaluate(() => ({ state:__deathTest.state, hud:__deathTest.hudCalls, overlay:__deathTest.overlayCalls, text:__deathTest.text }));
      assert.equal(first.state,'DEAD');
      assert.equal(first.hud,0,'HUD disappears on the lethal frame');
      assert.equal(first.overlay,1,'stamp renders on the lethal frame');
      assert(first.text.includes("YOU'RE DEAD!"));
      assert(first.text.includes('[R] RESTART'));
      assert(!first.text.includes('[SPACE] SCORE'));
      await page.screenshot({ path:path.join(output, `impact-${size}.png`) });
      await page.evaluate(() => __deathTest.snapshot());
      await page.screenshot({ path:path.join(output, `world-${size}.png`) });
      assert(await page.evaluate(font => document.fonts.check('128px '+font),selectedFont));
      await page.evaluate(font => __deathTest.preview(1.3,font),selectedFont);
      const brightness = await page.evaluate(() => __deathTest.brightness());
      assert(brightness > .30 && brightness < .41, '60% veil plus vignette darkens the unobstructed world');
      await page.screenshot({ path:path.join(output, `final-${size}.png`) });
      // The overlay stops moving completely after its short blood run.
      const settled = await page.evaluate(() => __deathTest.image());
      await page.evaluate(font => __deathTest.preview(5,font),selectedFont);
      assert.equal(await page.evaluate(() => __deathTest.image()),settled,'no perpetual pulse or flowing blood');
      await page.evaluate(font => __deathTest.preview(.399,font),selectedFont);
      assert(!await page.evaluate(() => __deathTest.text.includes('[SPACE] SCORE')));
      await page.evaluate(font => __deathTest.preview(.4,font),selectedFont);
      assert(await page.evaluate(() => __deathTest.text.includes('[SPACE] SCORE')));
      await page.evaluate(font => __deathTest.preview(1.3,font,true),selectedFont);
      await page.screenshot({ path:path.join(output, `gamepad-${size}.png`) });
      assert(await page.evaluate(() => __deathTest.text.includes('[A] RESTART') && __deathTest.text.includes('[Y] SCORE')));

      await advance(.10); await key('r');
      assert.equal(await page.evaluate(() => __deathTest.state),'DEAD','early retry is ignored');
      await advance(.09); // timer .21; test either side of .22 without floating-point ambiguity.
      await page.keyboard.down('r'); await tick(.009);
      assert.equal(await page.evaluate(() => __deathTest.state),'DEAD','input before 220 ms remains guarded');
      await page.keyboard.up('r'); await tick(.01);
      await key('r');
      assert.equal(await page.evaluate(() => __deathTest.state),'PLAYING','next fresh retry is immediate');
      await page.evaluate(() => __deathTest.resetCalls()); await tick(.01);
      assert.deepEqual(await page.evaluate(() => ({ overlay:__deathTest.overlayCalls,hud:__deathTest.hudCalls,alive:__deathTest.player.isAlive })),{overlay:0,hud:1,alive:true});
      await page.screenshot({ path:path.join(output, `respawn-${size}.png`) });
      // Score remains accessible with the old guard, even before its hint appears.
      await page.evaluate(() => __deathTest.die()); await tick(.01); await advance(.24); await key('Space');
      assert.equal(await page.evaluate(() => __deathTest.state),'GAME_OVER','Space wins over menu-confirm/retry');
      results.push({ size, brightnessRatio:+brightness.toFixed(4), firstFrame:'pass', guard:'pass', retry:'pass', score:'pass', stable:'pass' });
    }
    await key('r');
    await page.evaluate(() => {
      window.__pad = { id:'Acceptance controller', index:0, connected:true, mapping:'standard', axes:[0,0,0,0],
        buttons:Array.from({length:17}, () => ({ pressed:false,value:0 })) };
    });
    const button = async (index, down) => {
      await page.evaluate(({index,down}) => { __pad.buttons[index] = { pressed:down,value:down ? 1 : 0 }; },{index,down});
      await tick(.01);
    };
    // A held through death never restarts when the safety window expires.
    await button(0,true);
    await page.evaluate(() => __deathTest.die()); await tick(.01); await advance(.30);
    assert.equal(await page.evaluate(() => __deathTest.state),'DEAD','held gamepad input cannot retry');
    await button(0,false); await button(0,true); await button(0,false);
    assert.equal(await page.evaluate(() => __deathTest.state),'PLAYING','A retries');
    for (const index of [0,7,8]) {
      await page.evaluate(() => __deathTest.die()); await tick(.01);
      await button(index,true); await button(index,false);
      assert.equal(await page.evaluate(() => __deathTest.state),'DEAD','early gamepad retry ignored');
      await advance(.23); await button(index,true); await button(index,false);
      assert.equal(await page.evaluate(() => __deathTest.state),'PLAYING','A/RT/Select retries remain available');
    }
    await page.evaluate(() => __deathTest.die()); await tick(.01); await advance(.24);
    await button(3,true); await button(3,false);
    assert.equal(await page.evaluate(() => __deathTest.state),'GAME_OVER','Y opens scores');
    await key('r');
    for (const name of ['Enter','click']) {
      await page.evaluate(() => __deathTest.die()); await tick(.01); await advance(.24);
      if (name === 'click') { await page.mouse.down(); await tick(.01); await page.mouse.up(); await tick(.01); }
      else await key(name);
      assert.equal(await page.evaluate(() => __deathTest.state),'PLAYING','existing Enter/click retry preserved');
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'validation.json'),JSON.stringify({ results,gamepad:'pass (simulated standard mapping: held guard, A/RT/Select retry, Y score)',alternateRetry:'pass (Enter/click)',errors },null,2));
    fs.writeFileSync(path.join(output,'index.html'), `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Death overlay — validation</title><style>body{background:#100e20;color:#eee;font:16px monospace;margin:32px}a{color:#df9aff}img{width:100%;display:block}details{padding:12px}summary{cursor:pointer}section{max-width:1600px}</style><h1>YOU'RE DEAD!</h1><p><a href="validation.json">Validation navigateur</a></p>${['final','world','impact','gamepad','respawn'].map(name=>`<section><h2>${name}</h2>${sizes.map(([w,h],i)=>`<details ${i===1?'open':''}><summary>${w} × ${h}</summary><img loading="lazy" src="${name}-${w}x${h}.png"></details>`).join('')}</section>`).join('')}</html>`);
    console.log(JSON.stringify(results,null,2));
    console.log('PASS: death frame, HUD, 220/400 ms, immediate retry, scores, brightness, stable overlay, gamepad/keyboard/mouse; 25 captures; no browser errors.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
