'use strict';
// Optional development dependency; never loaded by the static game.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(__dirname, '../test-results/scores');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'msedge' }) });
  const errors = [], report = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
    const inspectLayout = async () => {
      const boxes = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = innerWidth; canvas.height = innerHeight;
        const c = canvas.getContext('2d'), fillText = c.fillText.bind(c), boxes = [];
        c.fillText = function (text, x, y) {
          if (c.fillStyle !== '#24152f') {
            const m = c.measureText(text), t = c.getTransform();
            const corners = [[x-m.actualBoundingBoxLeft,y-m.actualBoundingBoxAscent], [x+m.actualBoundingBoxRight,y-m.actualBoundingBoxAscent], [x-m.actualBoundingBoxLeft,y+m.actualBoundingBoxDescent], [x+m.actualBoundingBoxRight,y+m.actualBoundingBoxDescent]].map(([x,y]) => ({x:t.a*x+t.c*y+t.e,y:t.b*x+t.d*y+t.f}));
            boxes.push({text, left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))});
          }
          fillText(text,x,y);
        };
        __scoresTest.screen.draw(c,innerWidth,innerHeight);
        return boxes;
      });
      const size = page.viewportSize();
      for (const b of boxes) assert(b.left >= 0 && b.top >= 0 && b.right <= size.width && b.bottom <= size.height, `Text outside viewport: ${b.text}`);
      for (let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++) {
        const a=boxes[i],b=boxes[j];
        assert(!(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1), `Text overlaps: ${a.text} / ${b.text}`);
      }
    };
    await page.route('**/js/main.js', async route => {
      const response = await route.fetch();
      const source = (await response.text()).replace('  // Boot & Start', `
      window.__scoresTest = {
        get state() { return gameState; }, get screen() { return scoreScreen; },
        get input() { return input; }, die() { enterDeathState(); },
        show() { showScoreScreen(); }
      };
      // Boot & Start`);
      await route.fulfill({ response, body: source });
    });
    await page.addInitScript(() => {
      window.__pad = null;
      window.__copies = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__copies.push(text); } } });
      Object.defineProperty(navigator, 'getGamepads', { value: () => window.__pad ? [window.__pad] : [] });
    });
    await page.goto(process.env.SCORE_TEST_URL || 'http://127.0.0.1:8087/');
    await page.waitForFunction(() => window.__scoresTest?.state === 'MENU_TITLE');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => __scoresTest.state === 'MENU_MASK');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => __scoresTest.state === 'PLAYING');
    await page.evaluate(() => { __scoresTest.die(); __scoresTest.show(); });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => __scoresTest.state), 'GAME_OVER', 'first confirm only skips');
    assert(await page.evaluate(() => __scoresTest.screen.tallyComplete));
    await page.keyboard.press('Tab'); await page.waitForFunction(() => __scoresTest.screen.showLeaderboard);
    assert(await page.evaluate(() => __scoresTest.screen.showLeaderboard));
    await page.keyboard.press('l'); await page.waitForTimeout(350);
    assert(!await page.evaluate(() => __scoresTest.screen.showLeaderboard));
    await page.keyboard.press('r');
    await page.waitForFunction(() => __scoresTest.state === 'PLAYING');
    await page.evaluate(() => { __scoresTest.die(); __scoresTest.show(); });
    assert.equal(await page.evaluate(() => synthMusic.currentTrack), 'results');
    assert.equal(await page.evaluate(() => synthMusic.volume), await page.evaluate(() => __scoresTest ? JSON.parse(localStorage.getItem('hotline-viseo-audio-v1') || '{"music":0.7}').music : 0.7));
    // Printed M on AZERTY is physically Semicolon. It must open characters.
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {key:'m',code:'Semicolon',bubbles:true}));
      window.dispatchEvent(new KeyboardEvent('keyup', {key:'m',code:'Semicolon',bubbles:true}));
    });
    await page.waitForFunction(() => __scoresTest.state === 'MENU_MASK');
    await page.evaluate(() => __scoresTest.show());
    await page.keyboard.press('m');
    await page.waitForFunction(() => __scoresTest.state === 'MENU_MASK');
    await page.evaluate(() => __scoresTest.show());
    const clickAction = async action => {
      const p = await page.evaluate(action => {
        const canvas=document.querySelector('#gameCanvas'), r=canvas.getBoundingClientRect();
        const s=__scoresTest.screen,f=s.frame(canvas.width,canvas.height),a=s.actions().find(a=>a.action===action);
        return { x:r.left+(f.x+(a.x+35)*f.scale)*r.width/canvas.width,y:r.top+(f.y+676*f.scale)*r.height/canvas.height };
      }, action);
      await page.mouse.move(p.x,p.y);
      assert.equal(await page.locator('#gameCanvas').evaluate(c=>c.style.cursor),'pointer');
      await page.mouse.click(p.x,p.y);
      await page.waitForTimeout(100);
    };
    // Capture all real grades using the unchanged evaluator.
    for (const [width, height] of [[1280,720],[1440,900],[1920,1080],[2560,1440],[3440,1440]]) {
      await page.setViewportSize({ width, height });
      for (const [grade, target] of [['D',0],['C',9000],['B',16000],['A',25000],['A+',35000],['S',55000]]) {
        const actual = await page.evaluate(({ grade, target }) => {
          const screen = __scoresTest.screen;
          const stats = { runId: 'review-' + grade, waveReached: 1, maskId: 'vincent', elapsedTime: 37, wavesCleared: 1,
            totalKills: 18, meleeKills: 4, gunKills: 10, throwKills: 4, executions: 2, doorSlams: 1, maxCombo: 3, weaponsUsed: ['BAT','UZI'] };
          if (!target) Object.assign(stats, { wavesCleared: 0, totalKills: 0, meleeKills: 0, gunKills: 0, throwKills: 0, executions: 0, doorSlams: 0, maxCombo: 0, weaponsUsed: [] });
          screen.evaluateRun(stats);
          stats.score = target - screen.breakdown.totalCalculatedScore;
          screen.show('GAME_OVER', stats); screen.finishTally();
          return screen.breakdown.grade;
        }, { grade, target });
        assert.equal(actual, grade);
        await inspectLayout();
        await page.screenshot({ path: path.join(output, `${width}x${height}-${grade.replace('+','plus')}.png`) });
        report.push({ width, height, grade, total: target });
      }
      await page.keyboard.press('l'); await page.waitForTimeout(350);
      await inspectLayout();
      await page.screenshot({ path: path.join(output, `${width}x${height}-leaderboard.png`) });
      // The same safe-area transform drives live pointer hit testing.
      await clickAction('board');
      assert(!await page.evaluate(() => __scoresTest.screen.showLeaderboard));
      await clickAction('share');
      await page.waitForFunction(() => __scoresTest.screen.shareStatus === 'COPIÉ !');
      const copied = await page.evaluate(() => __copies.at(-1));
      assert.match(copied, /🏆 Score : 55\s000/);
      assert.match(copied, /🌊 Vague : 1/); assert.match(copied, /🔥 Grade : S/);
      assert(copied.includes('https://tar-gezed.github.io/hotline-viseo/'));
      await inspectLayout();
      await clickAction('mask');
      await page.waitForFunction(() => __scoresTest.state === 'MENU_MASK');
      await page.evaluate(() => { __scoresTest.show(); __scoresTest.screen.finishTally(); });
      await clickAction('confirm');
      await page.waitForFunction(() => __scoresTest.state === 'PLAYING');
      await page.evaluate(() => { __scoresTest.die(); __scoresTest.show(); });
    }
    // Current entry is deliberately second: only it may receive the highlight.
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => {
      const s = __scoresTest.screen;
      s.show('GAME_OVER', {runId: 'second', score: 40000}); s.finishTally(); s.showLeaderboard = true;
    });
    await page.screenshot({ path: path.join(output, 'current-second.png') });
    // Freeze presentation only to inspect the whole stamp, including its arrival.
    await page.evaluate(() => { const s=__scoresTest.screen; window.__scoreUpdate=s.update; s.update=()=>{};s.showLeaderboard=false; });
    for (const time of [1.58,1.66,1.75,1.99]) {
      await page.evaluate(time => {
        const s=__scoresTest.screen;s.animTimer=time-.001;s.stampLanded=false;
        window.__scoreUpdate.call(s,.001);
      }, time);
      await inspectLayout();
      await page.screenshot({path:path.join(output,`grade-impact-${time}.png`)});
    }
    await page.evaluate(() => { __scoresTest.screen.update=window.__scoreUpdate; });
    // Inspect the largest grade at the maximum stamp size and long totals.
    await page.evaluate(() => { const s=__scoresTest.screen; s.showLeaderboard=false; });
    await inspectLayout();
    await page.evaluate(() => { const s=__scoresTest.screen; s.show('WAVE_CLEAR',{score:123456789, waveReached:12, elapsedTime:3601, maskId:'jade'}); s.finishTally(); });
    await inspectLayout();
    await page.screenshot({ path: path.join(output, 'wave-clear-large-score.png') });
    // A scaled and offset canvas still has matching clickable text.
    await page.locator('#gameCanvas').evaluate(c => { c.style.width='90%';c.style.height='90%'; });
    await clickAction('board'); assert(await page.evaluate(() => __scoresTest.screen.showLeaderboard));
    await page.locator('#gameCanvas').evaluate(c => { c.style.width='';c.style.height=''; });
    await page.keyboard.press('s');
    await page.waitForFunction(() => __scoresTest.screen.shareStatus==='COPIÉ !');
    assert.match(await page.evaluate(()=>__copies.at(-1)), /Vague : 12/);
    // Denied clipboard access must never claim success (test doubles only).
    await page.evaluate(() => {
      navigator.clipboard.writeText=async()=>{throw new Error('denied');};
      document.execCommand=()=>false;
    });
    await clickAction('share');
    await page.waitForFunction(() => __scoresTest.screen.shareStatus==='RÉESSAYER');
    await page.evaluate(() => { document.execCommand=()=>true; });
    await clickAction('share');
    await page.waitForFunction(() => __scoresTest.screen.shareStatus==='COPIÉ !');
    await page.evaluate(() => { __scoresTest.screen.showLeaderboard=true; });
    // Gamepad fronts: X switches view, A skips, Y opens characters.
    const pad = async button => {
      await page.evaluate(button => { window.__pad = { id: 'Xbox test', index: 0, connected: true, mapping: 'standard', axes: [0,0,0,0], buttons: Array.from({length:17}, (_,i) => ({pressed: i===button, value: i===button ? 1 : 0})) }; }, button);
      await page.waitForTimeout(350);
      await page.evaluate(() => __pad.buttons.forEach(b => { b.pressed = false; b.value = 0; }));
      await page.waitForTimeout(350);
    };
    await pad(2); assert(!await page.evaluate(() => __scoresTest.screen.showLeaderboard));
    await page.screenshot({ path: path.join(output, 'gamepad.png') });
    await pad(3); await page.waitForFunction(() => __scoresTest.state === 'MENU_MASK');
    await page.evaluate(() => { __scoresTest.show(); __scoresTest.screen.animTimer = 0; });
    await pad(0); assert.equal(await page.evaluate(() => __scoresTest.state), 'GAME_OVER');
    await pad(0); await page.waitForFunction(() => __scoresTest.state === 'PLAYING');
    // Render a complete original score loop plus its seam with real Web Audio.
    const audio = await page.evaluate(async () => {
      const sampleRate = 22050, bpm = 84, steps = 144;
      const ctx = new OfflineAudioContext(2, Math.ceil((steps * 15 / bpm + 2) * sampleRate), sampleRate);
      const OriginalContext = window.AudioContext;
      const engine = new SynthMusicEngine();
      window.AudioContext = function () { return ctx; };
      try { engine.init(); } finally { window.AudioContext = OriginalContext; }
      engine.currentTrack = 'results'; engine.bpm = bpm;
      for (let step = 0; step < steps; step++) engine._scheduleStep(step % 128, .05 + step * 15 / bpm);
      const rendered = await ctx.startRendering();
      let peak = 0, sum = 0, clipped = 0;
      const pcm = new Int16Array(rendered.length * 2);
      for (let channel = 0; channel < 2; channel++) {
        const values = rendered.getChannelData(channel);
        for (let i = 0; i < values.length; i++) {
          if (!Number.isFinite(values[i])) throw new Error('Invalid results audio sample');
          peak = Math.max(peak, Math.abs(values[i])); sum += values[i] ** 2;
          if (Math.abs(values[i]) >= 1) clipped++;
          pcm[i * 2 + channel] = Math.round(Math.max(-1, Math.min(1, values[i])) * 32767);
        }
      }
      const bytes = new Uint8Array(pcm.buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return { peak, rms: Math.sqrt(sum / pcm.length), clipped, sampleRate, pcm: btoa(binary) };
    });
    assert(audio.rms > .01 && audio.clipped === 0, 'audible results loop without clipped samples');
    const pcm = Buffer.from(audio.pcm, 'base64'), header = Buffer.alloc(44);
    header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
    header.writeUInt32LE(audio.sampleRate, 24); header.writeUInt32LE(audio.sampleRate * 4, 28);
    header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
    fs.writeFileSync(path.join(output, 'after-hours.wav'), Buffer.concat([header, pcm]));
    delete audio.pcm;
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify({ captures: report, audio, errors, navigation: 'keyboard, live mouse clicks at five viewports, simulated gamepad' }, null, 2));
    console.log(`PASS ${report.length} grade/viewport cases, secondary leaderboard, skip and real navigation`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
