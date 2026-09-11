const assert = require('assert');
const Player = require('./js/entities/player.js');
const Enemy = require('./js/entities/enemy.js');

function movementInput(vector) {
  return {
    getAimAngle() { return Math.PI * 0.5; },
    getMovementVector() { return vector; }
  };
}

const right = { x: 1, y: 0, length: 1 };
const idle = { x: 0, y: 0, length: 0 };
const wall = [{ x1: 10, y1: -100, x2: 10, y2: 100, type: 'test-wall' }];

// Free travel advances the phase from actual displacement.
const freePlayer = new Player(0, 0);
const freeStart = freePlayer.legPhase;
const freeInput = movementInput(right);
for (let i = 0; i < 30; i++) {
  freePlayer.update(1 / 60, freeInput, [], [], [], [], null, null, false);
}
assert(freePlayer.x > 20, 'free player should travel through open space');
assert(freePlayer.legPhase > freeStart + 0.5, 'free player gait should advance with distance');
assert.strictEqual(freePlayer.gaitMoving, true, 'free player should report active gait');

// A player held into a wall must stop accumulating gait phase once the
// collision resolver removes the attempted displacement.
const blockedPlayer = new Player(0, 0);
for (let i = 0; i < 60; i++) {
  blockedPlayer.update(1 / 60, freeInput, wall, [], [], [], null, null, false);
}
const blockedPhase = blockedPlayer.legPhase;
for (let i = 0; i < 12; i++) {
  blockedPlayer.update(1 / 60, freeInput, wall, [], [], [], null, null, false);
}
assert(Math.abs(blockedPlayer.legPhase - blockedPhase) < 0.001,
  'blocked player must not animate feet in place');
assert.strictEqual(blockedPlayer.gaitMoving, false, 'blocked player should report planted gait');

// Releasing input allows the short friction tail to finish, then the phase and
// body bob settle instead of continuing to drift indefinitely.
const startStopPlayer = new Player(0, 0);
for (let i = 0; i < 30; i++) {
  startStopPlayer.update(1 / 60, freeInput, [], [], [], [], null, null, false);
}
for (let i = 0; i < 45; i++) {
  startStopPlayer.update(1 / 60, movementInput(idle), [], [], [], [], null, null, false);
}
const settledPhase = startStopPlayer.legPhase;
for (let i = 0; i < 12; i++) {
  startStopPlayer.update(1 / 60, movementInput(idle), [], [], [], [], null, null, false);
}
assert(Math.abs(startStopPlayer.legPhase - settledPhase) < 0.001,
  'stopped player gait phase should remain settled');
assert.strictEqual(startStopPlayer.gaitMoving, false, 'stopped player should report planted gait');
assert(Math.abs(startStopPlayer.bodyBob) < 0.01, 'stopped player bob should settle');

// The enemy uses the same distance-driven contract while patrolling.
const freeEnemy = new Enemy(0, 0, 'STANDARD', 'FISTS', [{ x: 160, y: 0 }], 0);
const enemyStart = freeEnemy.legPhase;
for (let i = 0; i < 20; i++) {
  freeEnemy.update(1 / 60, null, [], [freeEnemy], [], [], null, null, null);
}
assert(freeEnemy.x > 10, 'free enemy should travel through open space');
assert(freeEnemy.legPhase > enemyStart + 0.1, 'free enemy gait should advance with distance');

const blockedEnemy = new Enemy(0, 0, 'STANDARD', 'FISTS', [{ x: 160, y: 0 }], 0);
for (let i = 0; i < 60; i++) {
  blockedEnemy.update(1 / 60, null, wall, [blockedEnemy], [], [], null, null, null);
}
const blockedEnemyPhase = blockedEnemy.legPhase;
for (let i = 0; i < 12; i++) {
  blockedEnemy.update(1 / 60, null, wall, [blockedEnemy], [], [], null, null, null);
}
assert(Math.abs(blockedEnemy.legPhase - blockedEnemyPhase) < 0.001,
  'blocked enemy must not animate feet in place');
assert.strictEqual(blockedEnemy.gaitMoving, false, 'blocked enemy should report planted gait');

console.log('CHARACTER GAIT REGRESSION PASSED');
