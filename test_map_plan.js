const assert = require('assert');
const MapData = require('./js/map/map_data.js');
const Physics = require('./js/engine/physics.js');
const Pathfinding = require('./js/engine/pathfinding.js');

global.CONFIG = require('./js/config.js');

console.log('--- PLAN-DRIVEN MAP REGRESSION SUITE ---');

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    const intersects = ((a.y > y) !== (b.y > y)) &&
      (x < (b.x - a.x) * (y - a.y) / ((b.y - a.y) || 1e-9) + a.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentDistance(a, b, c, d) {
  const orientation = (p, q, r) => cross(p, q, r);
  const onSegment = (p, q, r) =>
    Math.min(p.x, r.x) - 1e-6 <= q.x && q.x <= Math.max(p.x, r.x) + 1e-6 &&
    Math.min(p.y, r.y) - 1e-6 <= q.y && q.y <= Math.max(p.y, r.y) + 1e-6;
  const intersects = orientation(a, b, c) * orientation(a, b, d) < 0 &&
    orientation(c, d, a) * orientation(c, d, b) < 0;
  if (intersects) return 0;
  const distancePoint = (p, x, y) => {
    const vx = y.x - x.x;
    const vy = y.y - x.y;
    const vv = vx * vx + vy * vy;
    const t = vv > 0 ? Math.max(0, Math.min(1, ((p.x - x.x) * vx + (p.y - x.y) * vy) / vv)) : 0;
    return Math.hypot(p.x - (x.x + vx * t), p.y - (x.y + vy * t));
  };
  return Math.min(distancePoint(a, c, d), distancePoint(b, c, d), distancePoint(c, a, b), distancePoint(d, a, b));
}

function pointSegmentDistance(point, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const vv = vx * vx + vy * vy;
  const t = vv > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * vx + (point.y - a.y) * vy) / vv)) : 0;
  return Math.hypot(point.x - (a.x + vx * t), point.y - (a.y + vy * t));
}

function properOrCollinearOverlap(a, b, c, d) {
  const eps = 1e-6;
  const proper = cross(a, b, c) * cross(a, b, d) < -eps && cross(c, d, a) * cross(c, d, b) < -eps;
  if (proper) return true;
  const collinear = Math.abs(cross(a, b, c)) <= eps && Math.abs(cross(a, b, d)) <= eps;
  if (!collinear) return false;
  const axis = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'x' : 'y';
  const lo = Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis]));
  const hi = Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis]));
  return hi - lo > 1e-3;
}

// 1. The canonical floor is intentionally substantially larger than v3.
{
  const xs = MapData.buildingFootprint.map(p => p.x);
  const usefulWidth = Math.max(...xs) - Math.min(...xs);
  const previousUsefulWidth = 2360;
  assert(usefulWidth / previousUsefulWidth >= 1.35, `map enlargement only ${(usefulWidth / previousUsefulWidth).toFixed(2)}x`);
  assert(MapData.MAP_WIDTH >= 3500 && MapData.MAP_HEIGHT >= 2650);
  assert.strictEqual(MapData.PLAN_SCALE, 8.8);
  console.log(`✓ Floor footprint enlarged ${(usefulWidth / previousUsefulWidth).toFixed(2)}x without scaling the player`);
}

// 2. The silhouette is the measured six-corner envelope from plan_materials.png.
{
  assert.strictEqual(MapData.buildingFootprint.length, 6);
  const expectedPlanCorners = [[21,13], [230,13], [393,196], [288,286], [171,150], [21,119]];
  for (let i = 0; i < expectedPlanCorners.length; i++) {
    const p = MapData.planToWorld(...expectedPlanCorners[i]);
    const q = MapData.buildingFootprint[i];
    assert(Math.hypot(p.x - q.x, p.y - q.y) < 0.01, `footprint corner ${i} drifted`);
  }
  console.log('✓ Exterior silhouette is tied directly to measured plan coordinates');
}

// 3. Material annotation coverage is represented structurally.
{
  assert(MapData.walls.length >= 35, 'not enough structural wall segments');
  assert(MapData.glassPartitions.length >= 19, 'expected at least the original glass partition density');
  assert.strictEqual(MapData.doors.length, 19);
  assert(MapData.props.filter(p => /desk|table/.test(p.type)).length >= 16);
  console.log('✓ Partitions, glass, doors and desk islands are represented at plan density');
}

// 4. Final D/E/F geometry contract: central meeting table, four office doors,
// and both lower-right desk islands fully inside the cleaned rectangular room.
{
  assert(MapData.props.some(p => p.id === 'table_central_glass_room'), 'central glass room is missing its meeting table');
  assert.strictEqual(MapData.doors.filter(d => d.id.startsWith('door_diag_office_')).length, 4, 'diagonal offices need one door each');

  const lowerRoomPlan = [[251.927,243.103],[290.169,210.892],[312.073,236.897],[273.831,269.108]]
    .map(([x,y]) => MapData.planToWorld(x,y));
  for (const id of ['desk_lower_1','desk_lower_2']) {
    const p = MapData.props.find(prop => prop.id === id);
    assert(p && pointInPolygon(p.x, p.y, lowerRoomPlan), `${id} is not inside the lower-right room`);
  }
  console.log('✓ D/E/F cleanup keeps the central table, office doors and lower desks inside their rooms');
}

// 5. Desk islands are large relative to the unchanged player body.
// 5. Central circulation has body-sized clearance and semantic openings.
{
  const p = MapData.planToWorld;
  const point = (x, y) => p(x, y);
  const samePoint = (a, b, tolerance = 0.75) => Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
  const segmentEnds = segment => [
    { x: segment.x1, y: segment.y1 },
    { x: segment.x2, y: segment.y2 }
  ];
  const findWall = (a, b, type) => MapData.walls.find(w =>
    (!type || w.type === type) &&
    ((samePoint(segmentEnds(w)[0], a) && samePoint(segmentEnds(w)[1], b)) ||
      (samePoint(segmentEnds(w)[0], b) && samePoint(segmentEnds(w)[1], a))));

  const focusEast = findWall(point(187, 67), point(184, 105), 'interior');
  assert(focusEast, 'focus-room east wall is missing');
  const focusSegment = segmentEnds(focusEast);
  const coreClearance = Math.min(...MapData.walls.filter(w => w.type === 'core').map(w =>
    segmentDistance(focusSegment[0], focusSegment[1], ...segmentEnds(w))));
  assert(coreClearance >= 40, `focus/core passage is only ${coreClearance.toFixed(2)} world units wide`);

  const allBarrierEnds = MapData.walls.flatMap(segmentEnds).concat(MapData.glassPartitions.flatMap(segmentEnds));
  for (const id of ['door_focus_lower', 'door_core_lower']) {
    const door = MapData.doors.find(d => d.id === id);
    assert(door, `${id} is missing`);
    const hinge = { x: door.x, y: door.y };
    const tip = {
      x: door.x + Math.cos(door.baseAngle) * door.length,
      y: door.y + Math.sin(door.baseAngle) * door.length
    };
    const hingeDistance = Math.min(...allBarrierEnds.map(endpoint => Math.hypot(endpoint.x - hinge.x, endpoint.y - hinge.y)));
    const tipDistance = Math.min(...allBarrierEnds.map(endpoint => Math.hypot(endpoint.x - tip.x, endpoint.y - tip.y)));
    assert(hingeDistance <= 0.75, `${id} hinge floats ${hingeDistance.toFixed(2)} world units from its host`);
    assert(tipDistance <= 0.75, `${id} tip floats ${tipDistance.toFixed(2)} world units from its opening`);
  }

  for (const id of ['glass_focus_south', 'glass_sw_meeting_front']) {
    const pane = MapData.glassPartitions.find(g => g.id === id);
    assert(pane, `${id} is missing`);
    const paneEnds = segmentEnds(pane);
    const overlap = MapData.walls.some(w => properOrCollinearOverlap(paneEnds[0], paneEnds[1], ...segmentEnds(w)));
    assert(!overlap, `${id} crosses or overlaps an opaque wall`);
  }
  console.log(`✓ Central focus/core circulation preserves ${coreClearance.toFixed(1)}px clearance with hosted doors and clean glass joins`);
}

// 6. Desk islands are large relative to the unchanged player body.
{
  const playerDiameter = global.CONFIG.PLAYER.RADIUS * 2;
  const deskLongSides = MapData.props
    .filter(p => /^desk_cluster_/.test(p.type))
    .map(p => Math.max(p.width, p.height));
  const avg = deskLongSides.reduce((a, b) => a + b, 0) / deskLongSides.length;
  assert(avg / playerDiameter > 6.5, `desks still too small vs player (${(avg / playerDiameter).toFixed(2)}x)`);
  console.log(`✓ Desk islands average ${(avg / playerDiameter).toFixed(1)} player diameters on their long side`);
}

// 7. Player/enemy placements are inside the floor and do not start embedded.
{
  const placements = [['player', MapData.playerSpawn, 16], ...MapData.enemies.map(e => [e.id, e, 14])];
  for (const [id, p, radius] of placements) {
    assert(pointInPolygon(p.x, p.y, MapData.buildingFootprint), `${id} is outside building footprint`);
    const probe = { x: p.x, y: p.y, radius, vx: 0, vy: 0, speed: 190 };
    Physics.resolveEntityWorldCollisions(probe, MapData, 1 / 60);
    const displacement = Math.hypot(probe.x - p.x, probe.y - p.y);
    assert(displacement < 0.8, `${id} starts embedded by ${displacement.toFixed(1)}px`);
  }
  console.log('✓ Player and all 22 initial enemies start in valid clear floor space');
}

// 8. AI can traverse the complete public circulation from east arrival to west.
{
  const nav = new Pathfinding.NavGraph(MapData);
  const west = MapData.planToWorld(55, 55);
  const route = nav.findPath(MapData.playerSpawn.x, MapData.playerSpawn.y, west.x, west.y);
  assert(route && route.length >= 3, 'cross-floor route is disconnected');
  for (const [name, ids] of nav.patrolRoutes.entries()) {
    assert(ids.every(id => nav.nodes.has(id)), `patrol ${name} references a missing node`);
  }
  console.log(`✓ Cross-floor AI route is connected (${route.length} smoothed waypoints)`);
}

console.log('ALL PLAN-DRIVEN MAP REGRESSIONS PASSED');
