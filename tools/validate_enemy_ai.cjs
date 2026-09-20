'use strict';
// Optional browser integration check; uses an existing Playwright installation.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await page.route('**/js/main.js', async route => {
      const response = await route.fetch();
      const original = await response.text();
      const body = original.replace('  // Boot & Start', `
        window.__enemyTest = {
          get ready() { return !!waveSpawner && !!navGraph; },
          run() {
            startNewGame('VINCENT');
            player.x = player.y = -10000;
            for (const spawn of mapData.spawnLocations) {
              waveSpawner.onEnemySpawned({ ...spawn, type: 'heavy', weapon: 'bat' });
            }
            const actors = enemies.slice();
            const starts = actors.map(e => ({ x: e.x, y: e.y, waypoints: e.waypoints.length, state: e.state }));
            const distances = actors.map(() => 0);
            for (let i = 0; i < 600; i++) {
              const previous = actors.map(e => ({ x: e.x, y: e.y }));
              updateEnemies(1 / 30);
              for (const door of mapData.doors) door.update(1 / 30);
              actors.forEach((e, index) => { distances[index] += Math.hypot(e.x - previous[index].x, e.y - previous[index].y); });
            }
            const patrols = actors.map((e, i) => ({ ...starts[i], distance: distances[i],
              finalState: e.state, hiddenPositionKnown: e.investigateX === player.x }));
            enemies = [actors[0]];
            const actor = actors[0];
            actor.entryTimer = 0; actor.state = 'PATROL';
            let target;
            for (let i = 0; i < 16; i++) {
              const angle = i * Math.PI / 8;
              const p = { x: actor.x + Math.cos(angle) * 100, y: actor.y + Math.sin(angle) * 100 };
              if (navGraph.canTraverse(actor, p, actor.radius)) { target = p; actor.angle = angle; break; }
            }
            if (!target) throw Error('No clear visual acquisition fixture');
            player.x = target.x; player.y = target.y;
            updateEnemies(1 / 60);
            const acquired = actor.state;
            player.x = player.y = -10000;
            updateEnemies(1 / 60);
            const lost = { state: actor.state, x: actor.investigateX, y: actor.investigateY };

            // Exercise the real browser projectile loop with stale aim at a corner.
            mapData = { walls: [{ x1: 22, y1: -100, x2: 22, y2: 15 }], doors: [], props: [], glassPartitions: [] };
            const shooter = new Enemy(0, 0, 'STANDARD', 'M16');
            shooter.gunShotsFired = 3;
            shooter.currentWeapon = { ...shooter.currentWeapon, spread: 0 };
            player.x = 150; player.y = 150;
            bullets = [];
            shooter._fireGunAtPlayer(player, bullets, combatEffects, camera, mapData);
            const muzzle = bullets[0] && bullets[0].x;
            updateBullets(1 / 60);
            const remainingBullets = bullets.length;
            player.y = 0;
            shooter._fireGunAtPlayer(player, bullets, combatEffects, camera, mapData);
            const coveredShots = bullets.length;
            const listener = new Enemy(0, 0, 'STANDARD', 'BAT');
            enemies = [listener];
            player.currentWeapon = WeaponSystem.WEAPON_TYPES.BAT;
            player.attackCooldown = 0;
            handlePlayerAttack();
            const meleeListenerState = listener.state;
            player.currentWeapon = WeaponSystem.WEAPON_TYPES.PISTOL;
            player.ammo = 0; player.attackCooldown = 0;
            handlePlayerAttack();
            const dryListenerState = listener.state;
            player.ammo = 5; player.attackCooldown = 0;
            handlePlayerAttack();
            const shotListener = { state: listener.state, x: listener.investigateX, y: listener.investigateY };
            player.x = player.y = -10000;
            updateEnemies(1 / 60);
            return { patrols, acquired, lost, target, muzzle, remainingBullets, coveredShots,
              meleeListenerState, dryListenerState, shotListener, rememberedShot: listener.investigateX };
          }
        };
        // Boot & Start`);
      assert.notEqual(body, original, 'main-loop injection anchor exists');
      await route.fulfill({ response, body });
    });
    await page.goto(process.env.ENEMY_TEST_URL || 'http://127.0.0.1:8097/');
    await page.waitForFunction(() => window.__enemyTest?.ready, null, { polling: 100 });
    const result = await page.evaluate(() => window.__enemyTest.run());
    for (const patrol of result.patrols) {
      assert.equal(patrol.state, 'PATROL');
      assert.equal(patrol.finalState, 'PATROL');
      assert(patrol.waypoints > 1 && patrol.distance > 250);
      assert.equal(patrol.hiddenPositionKnown, false);
    }
    assert.equal(result.acquired, 'ALERT');
    assert.equal(result.lost.state, 'SUSPICIOUS');
    assert.equal(result.lost.x, result.target.x); assert.equal(result.lost.y, result.target.y);
    assert(result.muzzle < 22);
    assert.equal(result.remainingBullets, 0, 'wall consumes the real browser projectile');
    assert.equal(result.coveredShots, 0);
    assert.equal(result.meleeListenerState, 'PATROL');
    assert.equal(result.dryListenerState, 'PATROL');
    assert.deepEqual(result.shotListener, { state: 'SUSPICIOUS', x: 150, y: 0 });
    assert.equal(result.rememberedShot, 150);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ...result, pageErrors: errors }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
