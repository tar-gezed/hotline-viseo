const assert = require('assert');

global.CONFIG = require('./js/config.js');
const Input = require('./js/engine/input.js');
const Enemy = require('./js/entities/enemy.js');
const { WaveSpawner } = require('./js/entities/spawner.js');

console.log('--- DIFFICULTY / AIM / SPAWN TUNING REGRESSION SUITE ---');

// 1. Every armed enemy must intentionally miss its first two trigger pulls.
{
  const enemy = new Enemy(0, 0, 'STANDARD', 'PISTOL');
  const player = { x: 240, y: 0, radius: 14, isAlive: true };
  enemy.angle = 0;
  enemy.targetAngle = 0;
  const bullets = [];
  const originalRandom = Math.random;
  Math.random = () => 0.5; // Remove ordinary weapon spread from the assertion.
  try {
    enemy._fireGunAtPlayer(player, bullets, null, null);
    enemy._fireGunAtPlayer(player, bullets, null, null);
    enemy._fireGunAtPlayer(player, bullets, null, null);
  } finally {
    Math.random = originalRandom;
  }

  assert.strictEqual(bullets.length, 3, 'pistol should emit one bullet per trigger pull');
  const targetAngle = 0;
  const dist = 240;
  const lateralMiss = bullet => Math.abs(Math.sin(bullet.angle - targetAngle) * dist);
  assert(lateralMiss(bullets[0]) >= player.radius + 8, 'first enemy bullet must visibly miss the player');
  assert(lateralMiss(bullets[1]) >= player.radius + 8, 'second enemy bullet must visibly miss the player');
  assert(lateralMiss(bullets[2]) < player.radius, 'third enemy bullet may aim normally at the player');
  console.log('✓ Enemy opening two gunshots are deliberate near-misses');
}

// Shotgun grace applies to the whole opening blast, not merely two individual pellets.
{
  const enemy = new Enemy(0, 0, 'SHOTGUNNER', 'SHOTGUN');
  const player = { x: 260, y: 0, radius: 14, isAlive: true };
  enemy.angle = 0;
  const bullets = [];
  const originalRandom = Math.random;
  Math.random = () => 0; // Worst spread edge back toward the target.
  try {
    enemy._fireGunAtPlayer(player, bullets, null, null);
  } finally {
    Math.random = originalRandom;
  }
  assert(bullets.length >= 6, 'shotgun should emit a multi-pellet blast');
  for (const bullet of bullets) {
    const lateral = Math.abs(Math.sin(bullet.angle) * 260);
    assert(lateral >= player.radius + 4, `opening shotgun pellet must miss, lateral=${lateral}`);
  }
  console.log('✓ Opening shotgun blast also clears the player');
}

// 2. Aim guide must span most of the distance from player to cursor, not just a tiny reticle stub.
{
  assert.strictEqual(typeof Input.getAimGuideLine, 'function', 'input must expose aim guide geometry');
  Input.playerRef = { x: 100, y: 100 };
  Input.camera = { worldToScreen: (x, y) => ({ x, y }) };
  Input.isGamepadMode = false;
  Input.mouse.x = 340;
  Input.mouse.y = 100;
  const guide = Input.getAimGuideLine();
  assert(guide, 'aim guide should exist when player and camera are available');
  assert(guide.startX >= 112 && guide.startX <= 130, `guide should start just outside player body, got ${guide.startX}`);
  assert(guide.endX >= 320, `guide should extend close to the cursor, got ${guide.endX}`);
  assert(guide.endX - guide.startX >= 180, 'aim guide should be substantially longer than the old short stub');
  console.log('✓ Aim guide spans player-to-cursor distance');
}

// 3. At countdown zero, every telegraphed location spawns one enemy immediately and exactly on its marker.
{
  const ws = new WaveSpawner();
  const points = [
    { id: 'A', x: 100, y: 100, angle: 0, name: 'A' },
    { id: 'B', x: 200, y: 100, angle: 0, name: 'B' },
    { id: 'C', x: 300, y: 100, angle: 0, name: 'C' },
    { id: 'D', x: 400, y: 100, angle: 0, name: 'D' }
  ];
  ws.setCustomSpawnPoints(points, []);
  ws._generateWaveQueue = () => points.map((p, i) => ({
    id: `enemy_${i}`,
    type: 'mobster_melee',
    weapon: 'bat',
    spawnPoint: p,
    spawnDelay: 0
  })).concat([{ id: 'reinforcement', type: 'mobster_melee', weapon: 'bat', spawnPoint: points[0], spawnDelay: 1.6 }]);

  const spawned = [];
  ws.onEnemySpawned = data => spawned.push(data);
  ws.startWave(1, false);
  assert.strictEqual(ws.getSpawnTelegraphs().length, 4, 'all four ingress markers should be telegraphed');

  ws.update(ws.preWaveTimeTotal - 0.01, { x: 0, y: 0 }, 0);
  const info = ws.update(0.02, { x: 0, y: 0 }, 0);
  assert.strictEqual(spawned.length, 4, 'all telegraphed ingress points must spawn immediately at countdown zero');
  assert.strictEqual(info.newEnemies.length, 4, 'same-tick spawn result must expose the full vanguard');
  for (const point of points) {
    const match = spawned.find(e => e.spawnLocationName === point.name);
    assert(match, `marker ${point.id} must spawn an enemy`);
    assert.strictEqual(match.x, point.x, `spawn at ${point.id} must match marker X exactly`);
    assert.strictEqual(match.y, point.y, `spawn at ${point.id} must match marker Y exactly`);
  }
  console.log('✓ Countdown zero spawns exactly on every telegraphed marker');
}


// 4. Legacy glass shatter integration must route to the real particle API without runtime errors.
{
  const { ParticleSystem } = require('./js/effects/particles.js');
  const ps = new ParticleSystem();
  ps.shatterGlass(10, 20, 12, 100, 0);
  assert(ps.glassShards.length > 0, 'glass shatter alias must create shards');
  console.log('✓ Glass shatter integration uses the valid particle API');
}

console.log('ALL DIFFICULTY TUNING REGRESSIONS PASSED');
