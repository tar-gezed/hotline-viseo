const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.CONFIG = require('./js/config.js');
const Camera = require('./js/engine/camera.js');
const Collision = require('./js/engine/collision.js');
const MapData = require('./js/map/map_data.js');
const WeaponSystem = require('./js/entities/weapon.js');
const Player = require('./js/entities/player.js');
const { WaveSpawner } = require('./js/entities/spawner.js');
const { GameHUD } = require('./js/ui/hud.js');

console.log('--- FINAL REGRESSION SUITE ---');

// 1. Camera is perfectly still when the player is idle and trauma is zero.
{
  const cam = new Camera(1280, 720);
  cam.snapTo(500, 400);
  const player = { x: 500, y: 400, vx: 0, vy: 0 };
  const input = { mouse: { x: 640, y: 360 }, isLookaheadDown: () => false };
  for (let i = 0; i < 240; i++) cam.update(1 / 60, player, input);
  assert.strictEqual(cam.shakeOffsetX, 0);
  assert.strictEqual(cam.shakeOffsetY, 0);
  assert(Math.abs(cam.roll) < 1e-8, `idle roll=${cam.roll}`);
  cam.addTrauma(1);
  cam.resetTrauma();
  assert.strictEqual(cam.trauma, 0);
  assert.strictEqual(cam.shakeRoll, 0);
  console.log('✓ Idle camera is stable and trauma resets cleanly');
}

// 2. Collision primitive belongs to the collision engine, not weapon load order.
{
  assert.strictEqual(typeof Collision.circleIntersectsSegment, 'function');
  assert.strictEqual(Collision.circleIntersectsSegment(0, 0, 100, 0, 50, 5, 6), true);
  assert.strictEqual(Collision.circleIntersectsSegment(0, 0, 100, 0, 50, 20, 6), false);
  console.log('✓ Circle/segment collision is deterministic');
}

// 3. Map interactive objects must be fully constructed with real coordinates.
{
  assert.strictEqual(MapData.doors.length, 19);
  assert(MapData.glassPartitions.length >= 19, 'expected at least the original glass partition density');
  for (const d of MapData.doors) {
    assert(Number.isFinite(d.x) && Number.isFinite(d.y), `door ${d.id} has invalid coordinates`);
    assert.strictEqual(typeof d.isOpen, 'function', `door ${d.id} is not interactive`);
  }
  for (const g of MapData.glassPartitions) {
    assert([g.x1, g.y1, g.x2, g.y2].every(Number.isFinite), `glass ${g.id} has invalid coordinates`);
  }
  assert(Array.isArray(MapData.buildingFootprint) && MapData.buildingFootprint.length >= 4);
  console.log('✓ Doors, glass and continuous building footprint are valid');
}

// 4. Combat feel contract: fast bullets and destructive shotgun spread.
{
  const pump = WeaponSystem.WEAPON_TYPES.SHOTGUN;
  assert.strictEqual(pump.pellets, 8);
  assert(pump.bulletSpeed >= 6500, 'shotgun must be quasi-hitscan');
  assert(WeaponSystem.WEAPON_TYPES.PISTOL.bulletSpeed >= 6500, 'pistol must be quasi-hitscan');
  console.log('✓ Firearms use quasi-hitscan speeds; shotgun fires 8 pellets');
}

// 5. Input is processed once: movement-only updates cannot consume ammo.
{
  const p = new Player(100, 100, 'RICHARD');
  p.currentWeapon = WeaponSystem.WEAPON_TYPES.PISTOL;
  p.ammo = 5;
  const fakeInput = {
    getAimAngle: () => 0,
    getMovementVector: () => ({ x: 0, y: 0, length: 0 }),
    isAttackJustPressed: () => true,
    isAttackDown: () => true,
    isThrowOrPickupJustPressed: () => false,
    isExecuteJustPressed: () => false
  };
  p.update(1 / 60, fakeInput, [], [], [], [], null, null, false);
  assert.strictEqual(p.ammo, 5, 'movement-only update must not fire/consume ammo');
  console.log('✓ No duplicate player action processing');
}

// 6. PREWAVE is quiet, visible, and exposes an accurate countdown to HUD.
{
  const ws = new WaveSpawner();
  let previews = 0;
  let starts = 0;
  ws.onPreWave = () => previews++;
  ws.onWaveStart = () => starts++;
  ws.start('richard');
  assert.strictEqual(ws.state, 'PREWAVE');
  assert.strictEqual(previews, 1);
  assert.strictEqual(starts, 0);
  const info = ws.update(0.25, { x: 0, y: 0 }, 0);
  assert(info.preWaveTimeLeft > 0 && info.preWaveTimeLeft < ws.preWaveTimeTotal);
  assert.strictEqual(info.wave, 1);
  assert.strictEqual(info.totalEnemies, ws.totalWaveEnemies);
  const hud = new GameHUD();
  hud.update(0.016, info);
  assert(hud.preWaveTime > 0);
  ws.update(ws.preWaveTimeTotal + 0.1, { x: 0, y: 0 }, 0);
  assert.strictEqual(starts, 1);
  console.log('✓ Quiet PREWAVE countdown is correctly integrated into HUD');
}

// 7. Post-processing must preserve a full-luminance base frame.
{
  const source = fs.readFileSync('./js/effects/postprocess.js', 'utf8');
  assert(source.includes('targetCtx.drawImage(sourceCanvas, 0, 0, w, h)'), 'base frame must be drawn normally');
  assert(!/targetCtx\.globalCompositeOperation\s*=\s*['"]multiply['"][\s\S]{0,180}globalAlpha\s*=\s*1/.test(source), 'target must not receive a full-opacity multiply wash');
  console.log('✓ Post-processing keeps the base image luminance');
}

// 8. Main integration separates calm PREWAVE from real combat start and clears trauma on restart.
{
  const main = fs.readFileSync('./js/main.js', 'utf8');
  assert(main.includes('waveSpawner.onPreWave'));
  assert(main.includes('camera.resetTrauma()'));
  assert(main.includes('postProcessor.resetTransientEffects()'));
  console.log('✓ Main loop keeps PREWAVE quiet and restart state clean');
}


// 9. The control cheat-sheet must not cover active gameplay.
{
  const mainSource = fs.readFileSync(path.join(__dirname, 'js/main.js'), 'utf8');
  assert(/instructions-overlay/.test(mainSource) && /gameplay-hidden/.test(mainSource), 'active gameplay should hide the large controls overlay');
  console.log('✓ Gameplay HUD is not covered by the controls cheat-sheet');
}

console.log('ALL FINAL REGRESSION TESTS PASSED');
