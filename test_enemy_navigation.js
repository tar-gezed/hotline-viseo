'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Enemy = require('./js/entities/enemy');
const { NavGraph } = require('./js/engine/pathfinding');
const Doors = require('./js/map/doors');
const IO = require('./js/map/map_io');
const base = require('./js/map/map_data');

// Perception always uses facing, including very close targets and all archetypes.
for (const type of ['STANDARD', 'SHOTGUNNER', 'DOG', 'HEAVY']) {
  const enemy = new Enemy(0, 0, type, 'BAT');
  assert(!enemy._checkLineOfSightToPlayer({ x: -30, y: 0, radius: 14 }, []));
  assert(enemy._checkLineOfSightToPlayer({ x: 620, y: 0, radius: 14 }, []));
  assert(!enemy._checkLineOfSightToPlayer({ x: 900, y: 0, radius: 14 }, []));
  assert(!enemy._checkLineOfSightToPlayer({ x: 0, y: 100, radius: 14 }, []));
  assert(!enemy._checkLineOfSightToPlayer({ x: 620, y: 0, radius: 14 }, {
    walls: [{ x1: 200, y1: -100, x2: 200, y2: 100 }]
  }));
}

// Ally alerts only orient the listener; gunshots investigate a fixed location.
{
  const enemy = new Enemy(0, 0, 'STANDARD', 'BAT');
  enemy.onHeardSound(-200, 100, 500, 'ALERT');
  for (let i = 0; i < 60; i++) enemy.update(1 / 60, null);
  assert.equal(enemy.x, 0); assert.equal(enemy.y, 0);
  assert.equal(enemy.investigateX, 0); assert.equal(enemy.investigateY, 0);
  assert.notEqual(enemy.angle, 0);
  const player = { x: 200, y: 0, isAlive: true, radius: 14 };
  enemy.angle = 0;
  enemy.update(1 / 60, player);
  assert.equal(enemy.state, 'ALERT');
  player.x = -300; player.y = -200;
  enemy.update(1 / 60, player);
  assert.equal(enemy.state, 'SUSPICIOUS');
  assert.equal(enemy.investigateX, 200); assert.equal(enemy.investigateY, 0);
  enemy.onHeardSound(-400, -300, 800, 'ALERT');
  assert.equal(enemy.investigateX, 200, 'hearing does not overwrite last sighting');
  for (let i = 0; i < 370; i++) enemy.update(1 / 60, null);
  assert.equal(enemy.state, 'PATROL', 'search expires instead of tracking forever');
}

{
  const enemy = new Enemy(0, 0, 'STANDARD', 'BAT');
  enemy.onHeardSound(-200, 100, 500, 'PLAYER_GUNSHOT');
  for (let i = 0; i < 60; i++) enemy.update(1 / 60, null);
  assert(enemy.x < -100 && enemy.y > 50, 'guard runs to heard shot without seeing player');
  assert.equal(enemy.investigateX, -200);
  enemy.onHeardSound(-300, 0, 500, 'PLAYER_GUNSHOT');
  assert.equal(enemy.investigateX, -300, 'new shot updates investigation');
  enemy.onHeardSound(2000, 0, 500, 'PLAYER_GUNSHOT');
  assert.equal(enemy.investigateX, -300, 'out-of-range shots are ignored');
  for (let i = 0; i < 400; i++) enemy.update(1 / 60, null);
  assert.equal(enemy.state, 'PATROL', 'guard searches then returns after a sound');
}

// An ally's alert invites a look, not an omniscient chase.
{
  const guard = new Enemy(0, 0, 'STANDARD', 'BAT');
  const peer = new Enemy(0, 50, 'STANDARD', 'BAT', [], Math.PI);
  const player = { x: 300, y: 0, radius: 14, isAlive: true };
  guard._transitionToAlert(player); guard.reactionTimer = 0;
  guard.update(1 / 60, player, [], [guard, peer]);
  assert.equal(peer.state, 'SUSPICIOUS');
  assert.equal(peer.investigateX, peer.x); assert.equal(peer.investigateY, peer.y);
}

function room(angle = 0) {
  const p = (x, y) => ({ x: x * Math.cos(angle) - y * Math.sin(angle),
    y: x * Math.sin(angle) + y * Math.cos(angle) });
  const wall = (x1, y1, x2, y2) => {
    const a = p(x1, y1), b = p(x2, y2);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, thickness: 8 };
  };
  const hinge = p(150, 90);
  return {
    p, walls: [wall(150, -200, 150, 90), wall(150, 150, 150, 350)],
    doors: [new Doors.Door({ id: 'exit', ...hinge, length: 60, baseAngle: Math.PI / 2 + angle })],
    glassPartitions: [], props: [],
    navGraphDefinition: { nodes: [
      { id: 'inside', ...p(70, 120) }, { id: 'outside', ...p(230, 120) }
    ], autoConnectDistance: 400 }
  };
}

// Exactly one choice per round: stay indoors or inspect through one viable door.
for (const roll of [0.49, 0.5]) {
  const map = room(), nav = new NavGraph(map);
  const enemy = new Enemy(60, 40, 'STANDARD', 'BAT');
  const original = Math.random;
  try { Math.random = () => roll; enemy.configurePatrol(nav); }
  finally { Math.random = original; }
  assert.equal(!!enemy.patrolHome.allowedDoorId, roll < 0.5);
  if (roll < 0.5) {
    assert(enemy.waypoints.some(p => p.x > 150), 'round includes a stop outside');
    for (let i = 0; i < enemy.waypoints.length; i++) {
      const a = enemy.waypoints[i], b = enemy.waypoints[(i + 1) % enemy.waypoints.length];
      assert(nav.findPath(a.x, a.y, b.x, b.y, { radius: enemy.radius, patrolHome: enemy.patrolHome }));
    }
    let leftRoom = false, returned = false;
    for (let i = 0; i < 1800; i++) {
      enemy.update(1 / 30, null, map, [], [], [], null, null, nav);
      map.doors[0].update(1 / 30);
      if (enemy.x > 180) leftRoom = true;
      if (leftRoom && Math.hypot(enemy.x - 60, enemy.y - 40) < 8) { returned = true; break; }
    }
    assert(leftRoom && returned, 'excursion physically exits the room and returns home');
  } else assert(enemy.waypoints.every(p => p.x < 150));
  map.doors[0].isLocked = true;
  assert.equal(nav.getPatrolExcursion({ x: 60, y: 40 }), null);
}

// Gunshot investigation can exit a room via physical navigation, then search.
{
  const map = room(), nav = new NavGraph(map), enemy = new Enemy(60, 40, 'STANDARD', 'BAT');
  enemy.configurePatrol(nav);
  enemy.onHeardSound(250, 40, 700, 'PLAYER_GUNSHOT');
  let arrived = false;
  for (let i = 0; i < 600; i++) {
    enemy.update(1 / 60, null, map, [], [], [], null, null, nav);
    map.doors[0].update(1 / 60);
    if (Math.hypot(enemy.x - 250, enemy.y - 40) < 10) { arrived = true; break; }
  }
  assert(arrived, 'guard reaches a shot heard outside its room');
}

// Follow the real state machine and physical door pushing at different frame rates.
for (const angle of [0, 0.6]) for (const type of ['STANDARD', 'DOG', 'HEAVY']) {
  for (const fps of [10, 30, 60, 144]) {
    const map = room(angle), nav = new NavGraph(map);
    const start = map.p(60, 40), target = map.p(250, 40);
    const enemy = new Enemy(start.x, start.y, type, 'BAT', [target]);
    let arrived = false;
    for (let i = 0; i < fps * 14; i++) {
      enemy.update(1 / fps, null, map, [], [], [], null, null, nav);
      map.doors[0].update(1 / fps);
      if (Math.hypot(enemy.x - target.x, enemy.y - target.y) < 8) { arrived = true; break; }
    }
    assert(arrived, `${type} exits room through real door: angle=${angle}, fps=${fps}`);
  }
}

// Locked doors and disconnected geometry are never replaced with a straight chase.
{
  const map = room(), nav = new NavGraph(map);
  map.doors[0].isLocked = true;
  assert.equal(nav.findPath(60, 40, 250, 40), null);
  map.doors[0].isLocked = false;
  assert(nav.findPath(60, 40, 250, 40));
  const sealed = { walls: [{ x1: 100, y1: -1000, x2: 100, y2: 1000, thickness: 8 }],
    navGraphDefinition: { nodes: [{ id: 'left', x: 0, y: 0 }, { id: 'right', x: 200, y: 0 }] } };
  const sealedNav = new NavGraph(sealed);
  assert.equal(sealedNav.findPath(0, 0, 200, 0), null);
  assert.equal(sealedNav.findNearestNode(100, 0), null, 'no nearest-node fallback through walls');
  const enemy = new Enemy(0, 0, 'STANDARD', 'BAT', [{ x: 200, y: 0 }, { x: 0, y: 150 }]);
  for (let i = 0; i < 180; i++) enemy.update(1 / 60, null, sealed, [], [], [], null, null, sealedNav);
  assert(enemy.y > 40, 'unreachable patrol stop is skipped');
  assert.equal(enemy.x, 0, 'failed route never drives toward wall');
}

// A centre ray fits this narrow passage; a bouncer's body does not.
{
  const map = { walls: [{ x1: -100, y1: -20, x2: 100, y2: -20, thickness: 8 },
    { x1: -100, y1: 20, x2: 100, y2: 20, thickness: 8 }],
    navGraphDefinition: { nodes: [{ id: 'a', x: -80, y: 0 }, { id: 'b', x: 80, y: 0 }] } };
  const nav = new NavGraph(map);
  assert(nav.findPath(-80, 0, 80, 0, { radius: 12 }));
  assert.equal(nav.findPath(-80, 0, 80, 0, { radius: 20 }), null);
  const prop = { x: 0, y: 0, width: 80, height: 40, centered: true, angle: 0.7, solid: true };
  const furniture = new NavGraph({ props: [prop], navGraphDefinition: { nodes: [
    { id: 'left', x: -140, y: 0 }, { id: 'right', x: 140, y: 0 }
  ] } });
  const path = furniture.findPath(-140, 0, 140, 0, { radius: 20 });
  assert(path && path.length > 2, 'rotated furniture receives a real detour');
  for (let i = 1; i < path.length; i++) assert(furniture.canTraverse(path[i - 1], path[i], 20));
}

// Validate all real imported-map ingress areas without modifying the user's map.
const mapText = fs.readFileSync('maps/active.json', 'utf8');
const map = IO.materialize(JSON.parse(mapText), base, Doors);
const nav = new NavGraph(map);
const safeSpawns = nav.getSafeSpawnPoints([...map.spawnLocations,
  { x: map.walls[0].x1, y: map.walls[0].y1, id: 'embedded' }], map.playerSpawn);
assert(safeSpawns.length > 0);
assert(!safeSpawns.some(p => p.id === 'embedded'));
for (const p of safeSpawns) assert(nav.canTraverse(p, p, 20, false));
for (const spawn of map.spawnLocations) for (const radius of [12, 14, 20]) {
  const route = nav.getLocalPatrolRoute(spawn.x, spawn.y, radius);
  assert(route.length > 1, `${spawn.id} has an actual round for radius ${radius}`);
  for (let i = 0; i < route.length; i++) {
    const a = route[i], b = route[(i + 1) % route.length];
    assert(Math.hypot(a.x - spawn.x, a.y - spawn.y) <= 520.01);
    const path = nav.findPath(a.x, a.y, b.x, b.y, { radius, patrolHome: spawn });
    assert(path, `${spawn.id}: each patrol leg is reachable`);
    for (let j = 1; j < path.length; j++) assert(nav.canPatrolBetween(path[j - 1], path[j], radius, spawn));
  }
  assert(nav.findPath(spawn.x, spawn.y, map.playerSpawn.x, map.playerSpawn.y, { radius }),
    `${spawn.id}: connected to public circulation`);
}
// Real displacement, not merely a successful A* result.
for (const spawn of map.spawnLocations) {
  const enemy = new Enemy(spawn.x, spawn.y, 'HEAVY', 'BAT');
  enemy.configurePatrol(nav);
  let travelled = 0;
  for (let i = 0; i < 600; i++) {
    const x = enemy.x, y = enemy.y;
    enemy.update(1 / 30, null, map, [], [], [], null, null, nav);
    travelled += Math.hypot(enemy.x - x, enemy.y - y);
    for (const door of map.doors) door.update(1 / 30);
  }
  assert(travelled > 250, `${spawn.id}: heavy patrol does not remain stuck`);
}
assert.equal(fs.readFileSync('maps/active.json', 'utf8'), mapText);
console.log('PASS vision, sound, last-seen search, local rounds, body clearance, room exits and active-map navigation');
