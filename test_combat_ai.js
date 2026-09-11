/**
 * Hotline Miami: VISEO Arcade Edition
 * Combat & AI Automated Verification Suite
 */

const assert = require('assert');

// Load modules
const Input = require('./js/engine/input.js');
const Camera = require('./js/engine/camera.js');
const AudioManager = require('./js/engine/audio.js');
const Collision = require('./js/engine/collision.js');
const WeaponSystem = require('./js/entities/weapon.js');
const Effects = require('./js/entities/effects.js');
const Door = require('./js/entities/door.js');
const Player = require('./js/entities/player.js');
const Enemy = require('./js/entities/enemy.js');

console.log('--- RUNNING COMBAT & AI VALIDATION TESTS ---');

// Test 1: Input Engine
console.log('Test 1: Input System');
assert(Input !== undefined, 'Input module loaded');
Input.keysDown['KeyW'] = true;
Input.keysDown['KeyD'] = true;
const move = Input.getMovementVector();
assert(Math.abs(move.length - 1.0) < 1e-4, 'Diagonal movement must be normalized to length 1');
assert(move.x > 0 && move.y < 0, 'W+D moves top-right');

Input.mouse.worldX = 100;
Input.mouse.worldY = 100;
const aimAngle = Input.getAimAngle(0, 0);
assert(Math.abs(aimAngle - Math.PI / 4) < 1e-4, 'Aim angle correctly computed');
console.log('✓ Input System Passed');

// Test 2: Camera & Screen Shake
console.log('Test 2: Dynamic Camera System');
const cam = new Camera(1280, 720);
cam.snapTo(500, 500);
assert(cam.x === 500 && cam.y === 500, 'Camera snaps to position');

// Test Trauma Screen Shake
cam.addTrauma(0.5);
assert(cam.trauma === 0.5, 'Trauma added');
cam.update(0.1, { x: 500, y: 500, vx: 100, vy: 0 }, Input);
assert(cam.trauma < 0.5, 'Trauma decays linearly over time');

// Test Coordinate transformations invertibility
const testWorldX = 420;
const testWorldY = 680;
const screenPos = cam.worldToScreen(testWorldX, testWorldY);
const backWorld = cam.screenToWorld(screenPos.x, screenPos.y);
assert(Math.abs(backWorld.x - testWorldX) < 1e-3, 'worldToScreen -> screenToWorld X invertible');
assert(Math.abs(backWorld.y - testWorldY) < 1e-3, 'worldToScreen -> screenToWorld Y invertible');
console.log('✓ Dynamic Camera System Passed');

// Test 3: Collision & Line of Sight Raycasting
console.log('Test 3: Collision & Raycasting');
const walls = [
    { x1: 0, y1: 100, x2: 200, y2: 100, isGlass: false }
];
const rayHit = Collision.raycast(50, 50, 0, 1, 100, walls);
assert(rayHit.hit === true, 'Raycast hits horizontal wall');
assert(Math.abs(rayHit.distance - 50) < 1e-3, 'Raycast hit distance is 50px');

const losBlocked = Collision.hasLineOfSight(50, 50, 50, 150, walls);
assert(losBlocked === false, 'Line of sight is blocked by solid wall');

const losClear = Collision.hasLineOfSight(50, 50, 150, 50, walls);
assert(losClear === true, 'Line of sight is clear when unobstructed');
console.log('✓ Collision & Raycasting Passed');

// Test 4: Weapon System & Floor Physics
console.log('Test 4: Weapon System & Floor Throws');
const { WEAPON_TYPES, FloorWeapon, Bullet } = WeaponSystem;
assert(WEAPON_TYPES.MAGNUM.pierceCount === 3, '.44 Magnum pierces multiple targets');
assert(WEAPON_TYPES.DOUBLE_BARREL.pellets === 8, 'Double barrel fires 8 pellets');

const floorBat = new FloorWeapon(100, 100, 'BAT');
floorBat.throw(100, 100, 0, 'player', 780);
assert(floorBat.isFlying === true, 'Weapon thrown into flight');
floorBat.update(0.016, [], []);
assert(floorBat.x > 100, 'Thrown weapon moves forward');
console.log('✓ Weapon System Passed');

// Test 5: Door Physics & Door Slam
console.log('Test 5: Door Physics & Slam Knockdown');
const door = new Door(200, 200, 48, 0);
assert(door.isOpen === false, 'Door initially closed');

const enemyNearDoor = new Enemy(220, 220, 'STANDARD', 'BAT');
door.kick(Math.PI * 0.5, 20);
assert(door.isOpen === true, 'Door swings open on kick');
door.update(0.016, [enemyNearDoor]);
assert(enemyNearDoor.state === 'KNOCKED_DOWN', 'High-speed door slam knocks down enemy');
console.log('✓ Door Physics Passed');

// Test 6: Player Combat, Perks & Executions
console.log('Test 6: Player Entity & Mask Perks');
const player = new Player(100, 100, 'TONY');
assert(player.isAlive === true, 'Player initialized');

// Test Melee Punch with Tony Mask (Lethal Fists)
const dummyEnemy = new Enemy(125, 100, 'STANDARD', 'BAT');
player.angle = 0; // facing right towards enemy
player._performMeleeAttack([dummyEnemy], Effects, cam);
assert(dummyEnemy.state === 'DEAD', 'Tony mask allows player fists to kill enemy instantly');

// Test Downed Execution with iframes
const downedTarget = new Enemy(120, 100, 'STANDARD', 'BAT');
downedTarget.state = 'KNOCKED_DOWN';
player._startExecution(downedTarget, Effects, cam);
assert(player.state === 'EXECUTING', 'Player entered ground execution state');
assert(player.isInvulnerable === true, 'Player is invulnerable during ground execution');

// Advance execution time
player._updateExecution(1.5, Effects, cam);
assert(player.state === 'IDLE', 'Player returns to IDLE after execution completes');
assert(downedTarget.state === 'DEAD', 'Executed enemy is dead');
assert(player.score >= 1000, 'Execution awards +1000 points');
console.log('✓ Player Combat & Executions Passed');

// Test 7: Enemy AI Archetypes & State Transitions
console.log('Test 7: Enemy AI & Archetypes');
const dog = new Enemy(300, 300, 'DOG');
assert(dog.archetype.isDog === true, 'Dog archetype initialized');
assert(dog.speed > 200, 'Dog has fast sprint');

const heavy = new Enemy(400, 400, 'HEAVY', 'BAT');
assert(heavy.hp === 3, 'Heavy bouncer has 3 HP');
// Test Heavy deflection against basic melee
heavy.takeHit({ type: 'MELEE', damage: 1 });
assert(heavy.hp === 3, 'Heavy deflects basic melee strikes');
// Heavy hit by .44 Magnum (3 damage)
heavy.takeHit({ type: 'BULLET', damage: 3 });
assert(heavy.state === 'DEAD', 'Heavy killed by .44 Magnum or 3 damage');

// Test Acoustic Hearing Alert
const sentry = new Enemy(500, 500, 'STANDARD', 'PISTOL');
assert(sentry.state === 'PATROL', 'Sentry in PATROL state');
AudioManager.emitAcousticEvent(520, 520, 500, 'gunshot');
assert(sentry.state === 'SUSPICIOUS' || sentry.state === 'ALERT', 'Sentry alerted by nearby gunshot sound wave');

console.log('✓ Enemy AI & Archetypes Passed');

console.log('\n=========================================');
console.log('ALL COMBAT & AI MODULES VERIFIED SUCCESSFULLY!');
console.log('=========================================');
