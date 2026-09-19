const assert = require('assert');
global.CONFIG = require('./js/config.js');
const { WaveSpawner } = require('./js/entities/spawner.js');
const Enemy = require('./js/entities/enemy.js');

// Fibonacci totals retain squad pacing without the former 48-enemy wave cap.
{
  const spawner = new WaveSpawner();
  const totals = [5, 8, 13, 21, 34, 55, 89, 144];
  for (let wave = 1; wave <= totals.length; wave++) {
    assert.equal(spawner.getWaveEnemyCount(wave), totals[wave - 1]);
    assert.equal(spawner._generateWaveQueue(wave).length, totals[wave - 1]);
  }
  spawner.currentWave = 8;
  spawner.spawnQueue = spawner._generateWaveQueue(8);
  spawner.totalWaveEnemies = 144;
  spawner.state = 'SPAWNING';
  spawner.spawnTimer = 0;
  assert.equal(spawner.update(.1, null, 36).newEnemies.length, 0);
  assert.equal(spawner.spawnQueue.length, 144, 'full arena retains queued reinforcements');
  spawner.spawnTimer = 0;
  assert.equal(spawner.update(.1, null, 35).newEnemies.length, 1);
  assert.equal(spawner.spawnQueue.length, 143);
  let emitted = 1;
  while (spawner.spawnQueue.length) emitted += spawner.update(2, null, 0).newEnemies.length;
  assert.equal(emitted, 144, 'all enemies eventually arrive, with no total-wave cap');
}

// Jitter never embeds an actor; temporarily obstructed markers wait and retry.
{
  const spawner = new WaveSpawner(), point = { id: 'safe', x: 100, y: 100 };
  spawner.spawnPositionValidator = p => p.x === 100 && p.y === 100;
  const enemy = spawner._spawnEnemyData({ id: 'one' }, point);
  assert.equal(enemy.x, 100); assert.equal(enemy.y, 100);
  spawner.spawnQueue = [{ id: 'two', spawnPoint: point }];
  spawner.spawnPositionValidator = () => false;
  assert.equal(spawner._spawnNextSquad().length, 0);
  assert.equal(spawner.spawnQueue.length, 1);
  assert.equal(spawner.enemiesSpawned, 1);
  spawner.spawnPositionValidator = () => true;
  assert.equal(spawner._spawnNextSquad().length, 1);
}

// The world supplies the count from BEFORE this tick's spawns.
{
  const spawner = new WaveSpawner();
  const point = { id: 'door', x: 100, y: 100, name: 'Door' };
  spawner._generateWaveQueue = () => [{id:'one',type:'mobster_melee',weapon:'bat',spawnPoint:point}];
  spawner.startWave(1);
  const result = spawner.update(spawner.preWaveTimeTotal, {x:0,y:0}, 0);
  assert.equal(result.newEnemies.length, 1);
  assert.equal(spawner.state, 'IN_PROGRESS', 'newly spawned last enemy must not clear the wave');
  assert.equal(spawner.enemiesAlive, 1);
  spawner.update(0.016, null, 0);
  assert.equal(spawner.state, 'INTERMISSION');
}

// Mid-wave markers identify the exact next squad; skipping prep uses announced doors.
{
  const spawner = new WaveSpawner();
  spawner.startWave(2, true);
  spawner.spawnTimer = 1;
  const promised = new Set(spawner.getSpawnTelegraphs().map(p=>p.id));
  const upcoming = spawner.spawnQueue.slice(0,3).map(e=>e.spawnPoint.id);
  assert(upcoming.every(id=>promised.has(id)), 'all next squad doors must be warned');
  assert(spawner.getSpawnTelegraphs().every(p=>p.countdown===1));
  spawner.state='INTERMISSION';
  spawner.nextWaveTelegraphPoints = spawner.spawnPoints.slice(0,2);
  const announced = spawner.nextWaveTelegraphPoints.map(p=>p.name);
  const spawned=[];
  spawner.onEnemySpawned=e=>spawned.push(e);
  spawner.skipIntermission();
  assert.notEqual(spawner.state,'PREWAVE','skip must not impose another countdown');
  assert(announced.every(name=>spawned.some(e=>e.spawnLocationName===name)));
}

// Solid walls must prevent both close-range damage paths.
for (const type of ['STANDARD','DOG']) {
  const enemy = new Enemy(0,0,type,'BAT');
  enemy.state='ATTACKING';
  enemy.dogLungeTimer=0.2;
  let hits=0;
  const player={x:20,y:0,radius:14,isAlive:true,takeHit:()=>hits++};
  enemy._updateAttacking(0.016,false,player,[],[],null,null);
  assert.equal(hits,0,`${type} must not hit without line of sight`);
}

// A missed dog lunge grants a real recovery window instead of chaining lunges.
{
  const enemy=new Enemy(0,0,'DOG');
  enemy.state='ALERT'; enemy.attackCooldown=0.4;
  const player={x:50,y:0,isAlive:true};
  enemy.investigateX=50;
  enemy._updateAlert(0.016,true,player,[],[],[],null,null);
  assert.equal(enemy.state,'ALERT');
  assert.equal(enemy.vx,0);
}

// Ingress pause does not grant invulnerability and does not bypass knockdown.
{
  const enemy=new Enemy(0,0,'STANDARD','PISTOL');
  enemy.entryTimer=0.55; enemy.state='ATTACKING';
  const bullets=[];
  enemy.update(0.1,{x:60,y:0,isAlive:true},[],[],[],bullets);
  assert.equal(bullets.length,0);
  assert(enemy.entryTimer>0);
  enemy.takeHit({type:'BULLET',damage:1,isLethal:true});
  assert.equal(enemy.isAlive,false,'entering enemies must remain vulnerable');
}
console.log('Arcade wave / ingress / wall / dog recovery regressions passed');

// Visual beats and celebrations must not add simulation time or delay squads.
{
  const { GameHUD } = require('./js/ui/hud.js');
  const spawner = new WaveSpawner(), hud = new GameHUD();
  let started = 0;
  spawner.onPreWave = (wave, total) => { hud.setWave(wave, total); hud.setPreWave(spawner.preWaveTimeTotal); };
  spawner.onWaveStart = (wave, total) => { started++; hud.setWave(wave, total); };
  spawner.onWaveClear = wave => hud.setIntermission(spawner.intermissionTimer, wave);
  spawner.startWave(1);
  assert.equal(spawner.preWaveTimeTotal, 4);
  assert.equal(hud.countdownNumber, 0, 'no digit during the first second');
  const beats = [0];
  for (let tick = 0; tick < 39; tick++) {
    const info = spawner.update(.1, null, 0);
    hud.update(.1, info, .2); // Visual time deliberately runs twice as fast.
    if (beats.at(-1) !== hud.countdownNumber) beats.push(hud.countdownNumber);
    assert.equal(started, 0);
    assert.equal(spawner.enemiesSpawned, 0);
  }
  assert.deepEqual(beats, [0,3,2,1]);
  assert(hud.waveAge > 7, 'finished visual animation cannot end the phase');
  hud.update(.1, spawner.update(.1, null, 0), .2);
  assert.equal(started, 1, 'combat starts at the original four seconds');
  assert.equal(hud.countdownNumber, 0);
  assert(spawner.enemiesSpawned > 0);
  spawner.spawnQueue = [];
  hud.update(.01, spawner.update(.01, null, 0), .01);
  assert.equal(spawner.state, 'INTERMISSION');
  const remaining = spawner.intermissionTimer;
  hud.update(0, null, 1.3);
  assert(hud.clearAge > 1.2);
  assert.equal(spawner.intermissionTimer, remaining, 'clear animation cannot consume resupply time');
  spawner.update(remaining - .01, null, 0);
  assert.equal(started, 1);
  hud.update(.02, spawner.update(.02, null, 0), .02);
  assert.equal(started, 2);
  assert.equal(spawner.preWaveTimer, 0, 'later waves gain no prep phase');
  assert(hud.waveAge < 1.2, 'later waves still get their short headline');
}
