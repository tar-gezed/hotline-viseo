const assert = require('assert');
global.CONFIG = require('./js/config.js');
const { WaveSpawner } = require('./js/entities/spawner.js');
const Enemy = require('./js/entities/enemy.js');

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
