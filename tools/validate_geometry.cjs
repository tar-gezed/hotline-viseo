'use strict';
// Development-only sampled equivalence against a trusted local Git revision.
// Run from the repository: node tools/validate_geometry.cjs
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const Module = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const revision = process.env.PERF_REFERENCE || '84afbfb';

function referenceModule(relative) {
  const filename = path.join(root, relative);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(cp.execFileSync('git', ['show', revision + ':' + relative], {
    cwd: root, encoding: 'utf8', maxBuffer: 8e6
  }), filename);
  return loaded.exports;
}

const referenceNav = referenceModule('js/engine/pathfinding.js');
const currentNav = require('../js/engine/pathfinding');
const map = require('../js/map/map_io').materialize(
  require('../maps/active.json'), require('../js/map/map_data'), require('../js/map/doors')
);
const before = Object.create(referenceNav.NavGraph.prototype);
const after = Object.create(currentNav.NavGraph.prototype);
before.mapData = after.mapData = map;
let seed = 42;
const random = () => {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 4294967296;
};
for (let i = 0; i < 5000; i++) {
  const a = { x: random() * 3400, y: random() * 2400 };
  const b = i % 5 ? { x: a.x + (random() - .5) * 900, y: a.y + (random() - .5) * 900 } : a;
  const radius = [0, 12, 14, 20, 24][i % 5], ignoreDoors = !!(i % 2);
  if (i % 100 === 0) {
    for (const door of map.doors) { door.angle += .1; door.isLocked = random() < .3; }
    for (const glass of map.glassPartitions) glass.shattered = random() < .1;
  }
  assert.equal(after.canTraverse(a, b, radius, ignoreDoors),
    before.canTraverse(a, b, radius, ignoreDoors), 'clearance ' + i);
}
console.log(`PASS 5000 clearance queries identical to ${revision} across radii, stationary discs, doors/locks and shattered glass`);

const referenceCollision = referenceModule('js/engine/collision.js');
const Collision = require('../js/engine/collision');
const obstacles = Collision.worldObstacles(map);
const staticObstacles = [...map.walls, ...map.props.filter(p => p.solid)];
for (let i = 0; i < 5000; i++) {
  const a = { x: random() * 3400, y: random() * 2400, radius: [12, 14, 20][i % 3],
    vx: random() * 400 - 200, vy: random() * 400 - 200 };
  const b = { ...a }, angle = random() * Math.PI * 2, distance = random() * 900;
  const options = { ignoreGlass: !!(i % 2), ignoreOpenDoors: !!(i % 3) };
  assert.deepEqual(
    Collision.raycast(a.x, a.y, Math.cos(angle), Math.sin(angle), distance, obstacles, options),
    referenceCollision.raycast(a.x, a.y, Math.cos(angle), Math.sin(angle), distance, obstacles, options),
    'ray ' + i
  );
  Collision.resolveCircleCollision(a, staticObstacles);
  referenceCollision.resolveCircleCollision(b, staticObstacles);
  assert.deepEqual(a, b, 'body collision ' + i);
}
console.log(`PASS 5000 raycasts and 5000 body collisions identical to ${revision}`);
