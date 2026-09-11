const { chromium } = require('C:/Users/Quentin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('path');

async function waitForActors(page) {
  await page.waitForFunction(() => window.critic && window.critic.player, null, { timeout: 8000 });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:8080');

  // Observe actual live entities without changing their render methods.
  await page.evaluate(() => {
    window.critic = { enemies: [], player: null };
    const enemyRender = Enemy.prototype.render;
    Enemy.prototype.render = function (...args) {
      if (!window.critic.enemies.includes(this)) window.critic.enemies.push(this);
      return enemyRender.apply(this, args);
    };
    const playerRender = Player.prototype.render;
    Player.prototype.render = function (...args) {
      window.critic.player = this;
      return playerRender.apply(this, args);
    };
  });

  await page.mouse.click(640, 629);
  await page.waitForTimeout(4200);
  await waitForActors(page);

  // Keep the default 1.12 gameplay zoom and pin the camera to the actor so
  // each sample shows the same normal in-game scale rather than an editor view.
  await page.evaluate(() => {
    const originalCameraUpdate = gameCamera.update.bind(gameCamera);
    gameCamera.update = function (...args) {
      const result = originalCameraUpdate(...args);
      if (window.critic.player) this.snapTo(window.critic.player.x, window.critic.player.y);
      return result;
    };
    gameCamera.targetZoom = 1.12;
    gameCamera.zoom = 1.12;

    const p = window.critic.player;
    p.isInvulnerable = true;
    p.angle = 0;
    if (window.WeaponSystem && typeof window.WeaponSystem.getWeaponType === 'function') {
      p.currentWeapon = window.WeaponSystem.getWeaponType('PISTOL');
      p.ammo = p.currentWeapon.maxAmmo || 12;
    }
    p.x = 2140;
    p.y = 860;
    gameCamera.snapTo(p.x, p.y);

    // Freeze one live human enemy beside the player for silhouette comparison.
    const human = window.critic.enemies.find(e => e && !e.archetype.isDog && e.isAlive);
    if (human) {
      human.x = p.x + 72;
      human.y = p.y + 22;
      human.angle = Math.PI;
      human.targetAngle = Math.PI;
      human.state = 'PATROL';
      human.waypoints = [{ x: human.x, y: human.y }];
      human.entryTimer = 0;
      human.alertIndicatorTimer = 0;
      // Keep the comparison frame quiet: the actor still renders through the
      // live prototype, but AI combat cannot cover the gait with hit flashes.
      human.update = function () {
        this.vx = 0;
        this.vy = 0;
        this.gaitMoving = false;
      };
      if (window.WeaponSystem && typeof window.WeaponSystem.getWeaponType === 'function') {
        human.currentWeapon = window.WeaponSystem.getWeaponType('FISTS');
      }
      window.critic.human = human;
    }
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(__dirname, 'critic-actors-live.png') });

  // Render eight real gameplay frames to a canvas contact sheet.  Each tile is
  // a center crop from the live game canvas, with the same camera and zoom.
  await page.evaluate(() => {
    const gameCanvas = document.getElementById('gameCanvas');
    const sheet = document.createElement('canvas');
    sheet.id = 'criticActorSheet';
    sheet.width = 8 * 220;
    sheet.height = 180;
    sheet.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;width:1760px;height:180px;image-rendering:pixelated;background:#080510';
    document.body.appendChild(sheet);
    const sheet2 = document.createElement('canvas');
    sheet2.id = 'criticActorSheet2x';
    sheet2.width = 8 * 128;
    sheet2.height = 128;
    sheet2.style.cssText = 'position:fixed;left:0;top:190px;z-index:99999;width:1024px;height:128px;image-rendering:pixelated;background:#080510';
    document.body.appendChild(sheet2);
    window.critic.sheet = sheet;
    window.critic.sheet2 = sheet2;
    window.critic.sheetIndex = 0;
    window.critic.captureFrame = () => {
      const ctx = sheet.getContext('2d');
      const ctx2 = sheet2.getContext('2d');
      const col = window.critic.sheetIndex++;
      if (col >= 8) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(gameCanvas, 530, 270, 220, 180, col * 220, 0, 220, 180);
      ctx2.imageSmoothingEnabled = false;
      ctx2.drawImage(gameCanvas, 608, 328, 64, 64, col * 128, 0, 128, 128);
    };
  });

  await page.mouse.move(1050, 360);
  await page.keyboard.down('d');
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(120);
    await page.evaluate(() => window.critic.captureFrame());
  }
  await page.keyboard.up('d');
  await page.waitForTimeout(80);
  await page.locator('#criticActorSheet').screenshot({ path: path.join(__dirname, 'critic-actors-gait.png') });
  await page.locator('#criticActorSheet2x').screenshot({ path: path.join(__dirname, 'critic-actors-gait-2x.png') });

  // Capture a still after the movement sample for a normal-zoom gameplay view.
  await page.screenshot({ path: path.join(__dirname, 'critic-actors-after-walk.png') });
  console.log(JSON.stringify(await page.evaluate(() => ({
    player: window.critic.player && {
      x: window.critic.player.x,
      y: window.critic.player.y,
      angle: window.critic.player.angle,
      gaitMoving: window.critic.player.gaitMoving,
      legPhase: window.critic.player.legPhase,
      bodyBob: window.critic.player.bodyBob
    },
    human: window.critic.human && {
      state: window.critic.human.state,
      gaitMoving: window.critic.human.gaitMoving,
      legPhase: window.critic.human.legPhase,
      bodyBob: window.critic.human.bodyBob
    }
  })), null, 2));
  console.log('PAGE_ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
