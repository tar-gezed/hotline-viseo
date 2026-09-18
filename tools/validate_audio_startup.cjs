'use strict';
// Optional real-browser checks for both autoplay permission outcomes.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const url = process.env.MENU_TEST_URL || 'http://127.0.0.1:8087/';

(async () => {
  for (const allowed of [true, false]) {
    const browser = await chromium.launch({ headless: true,
      ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
      args: [`--autoplay-policy=${allowed ? 'no-user-gesture-required' : 'document-user-activation-required'}`]
    });
    try {
      for (const gesture of allowed ? ['none', 'muted'] : ['keyboard', 'background', 'touch']) {
        const context = await browser.newContext({ hasTouch: true });
        const page = await context.newPage(); const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        if (gesture === 'muted') await page.addInitScript(() => {
          localStorage.setItem('hotline-viseo-audio-v1', JSON.stringify({ music: .4, sfx: .6, muted: true }));
        });
        await page.goto(url);
        await page.waitForFunction(() => window.synthMusic?.currentTrack === 'menu');
        if (!allowed) {
          assert.equal(await page.evaluate(() => window.synthMusic.ctx.state), 'suspended');
          if (gesture === 'keyboard') await page.keyboard.press('Shift');
          else if (gesture === 'touch') await page.touchscreen.tap(15, 15);
          else await page.mouse.click(15, 15);
        }
        await page.waitForFunction(() => window.synthMusic.ctx.state === 'running');
        await page.waitForTimeout(250);
        assert.equal(await page.evaluate(() => window.synthMusic.currentTrack), 'menu');
        assert.equal(await page.evaluate(() => window.synthMusic.isMuted), gesture === 'muted');
        // Measure the real output; running context alone does not prove audible music.
        const peak = await page.evaluate(async () => {
          const engine = window.synthMusic, analyser = engine.ctx.createAnalyser();
          engine.masterGain.connect(analyser);
          const data = new Float32Array(analyser.fftSize); let peak = 0;
          for (let i = 0; i < 12; i++) {
            await new Promise(resolve => setTimeout(resolve, 30));
            analyser.getFloatTimeDomainData(data);
            for (const v of data) peak = Math.max(peak, Math.abs(v));
          }
          engine.masterGain.disconnect(analyser); return peak;
        });
        assert(gesture === 'muted' ? peak === 0 : peak > .0001, `Unexpected output: ${gesture} (${peak})`);
        assert.deepEqual(errors, []);
        console.log(`PASS: ${allowed ? 'autoplay allowed' : 'autoplay blocked'} / ${gesture}`);
        await context.close();
      }
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
