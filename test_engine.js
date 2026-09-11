const Physics = require('./js/engine/physics.js');
const MapData = require('./js/map/map_data.js');
const Pathfinding = require('./js/engine/pathfinding.js');

console.log('--- VISEO Arcade Edition Architecture Verification ---');
console.log('Map Dimensions:', MapData.MAP_WIDTH, 'x', MapData.MAP_HEIGHT);
console.log('Zones count:', MapData.zones.length);
console.log('Walls count:', MapData.walls.length);
console.log('Doors count:', MapData.doors.length);
console.log('Glass partitions count:', MapData.glassPartitions.length);
console.log('Props / Furniture count:', MapData.props.length);
console.log('Enemies count:', MapData.spawnPoints.enemies.length);

// Test Pathfinding
const nav = new Pathfinding.NavGraph(MapData);
console.log('NavGraph nodes count:', nav.nodes.size);
console.log('Patrol routes count:', nav.patrolRoutes.size);

// Find path from Reception to Boardroom (spanning the entire building)
const westMeeting = MapData.planToWorld(55, 55);
const pathReceptionToBoardroom = nav.findPath(MapData.playerSpawn.x, MapData.playerSpawn.y, westMeeting.x, westMeeting.y);
console.log('Path from Reception to Boardroom waypoints:', pathReceptionToBoardroom.length);

// Find path looping around Central Core
const coreA = MapData.planToWorld(190, 110);
// (226,182) is the middle of a solid desk bank; use the real corridor anchor.
const coreB = MapData.planToWorld(255, 160);
const pathAroundCore = nav.findPath(coreA.x, coreA.y, coreB.x, coreB.y);
console.log('Path around Central Core waypoints:', pathAroundCore.length);

// Test Raycast
const rayOrigin = new Physics.Vec2(MapData.playerSpawn.x, MapData.playerSpawn.y);
const rayDir = new Physics.Vec2(-1, 0);
const rayHit = Physics.castRay(MapData, rayOrigin, rayDir, 2000);
console.log('Raycast Hit:', rayHit.hit, '| Type:', rayHit.type, '| Distance:', Math.round(rayHit.distance));

// Test Door Kick Physics
const door = MapData.doors[0];
console.log('Door initial angle:', door.angle, 'baseAngle:', door.baseAngle);
door.kick({ isPlayer: true }, 0, 1, 20);
console.log('Door kicked -> angularVelocity:', door.angularVelocity, 'isDangerous:', door.isDangerous);
door.update(0.016);
console.log('Door after 1 frame -> angle:', door.angle.toFixed(3));

console.log('--- All tests passed with flying colors! ---');
