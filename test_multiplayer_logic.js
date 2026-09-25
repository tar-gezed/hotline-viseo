'use strict';
const assert=require('node:assert/strict');
const CONFIG=require('./js/config.js'); global.CONFIG=CONFIG;
const Enemy=require('./js/entities/enemy.js'),Player=require('./js/entities/player.js');
const {WaveSpawner}=require('./js/entities/spawner.js');
(async()=>{
  const {spawnPoints,squadDefeated,respawnSquad,creditKill,rankPlayers}=await import('./js/network/coop_logic.js');
  const enemy=new Enemy(0,0), near=new Player(40,0), visible=new Player(100,0);
  enemy._checkLineOfSightToPlayer=p=>p===visible;
  assert.equal(enemy.selectPlayer([near,visible],[]),visible,'visible targets outrank hidden nearest');
  visible.isAlive=false; assert.equal(enemy.selectPlayer([near,visible],[]),near);
  const dog=new Enemy(0,0,'DOG'), ted=new Player(30,0,'TED');
  dog._checkLineOfSightToPlayer=()=>true;
  assert.equal(dog.selectPlayer([ted,near],[]),near);assert.equal(dog.selectPlayer([ted],[]),null);
  // A five-player perception scan is amortized, but a dead/departed target
  // cannot remain selected until the next scheduled scan.
  const observer=new Enemy(0,0),a=new Player(100,0),b=new Player(150,0);
  observer.entryTimer=10;let scans=0;
  observer.selectPlayer=ps=>{scans++;return ps.find(p=>p.isAlive)||null;};
  for(let i=0;i<5;i++)observer.update(1/60,[a,b]);
  assert.equal(scans,1);assert.equal(observer.coopTarget,a);
  a.isAlive=false;observer.update(1/60,[a,b]);assert.equal(scans,2);assert.equal(observer.coopTarget,b);
  observer.update(1/60,[]);assert.equal(observer.coopTarget,null);
  const beforeCorpse=scans;observer.isAlive=false;observer.update(1/60,[b]);assert.equal(scans,beforeCorpse,'corpses never rescan squad visibility');
  const shooter=new Player(0,0,'vincent');shooter.playerId=3;
  shooter.equipWeapon('PISTOL',3);const shot=shooter.attack(100,0);assert(shot.bullets.every(b=>b.ownerPlayerId===3));
  const {Door}=require('./js/map/doors.js'),door=new Door({x:0,y:0,length:50});
  door.kick(shooter,0,1,34);assert.equal(door.lastKickedByPlayerId,3);door.reset();assert.equal(door.lastKickedByPlayerId,undefined);
  const spawn=spawnPoints({x:0,y:0},p=>p.x>=0&&p.y>=0);assert.equal(spawn.length,5);assert(spawn.every(p=>p.x>=0&&p.y>=0));
  assert.throws(()=>spawnPoints({x:0,y:0},()=>false));
  near.playerId=0;visible.playerId=1;assert(!squadDefeated([near,visible]));near.isAlive=false;assert(squadDefeated([near,visible]));
  respawnSquad([near,visible],spawn);assert(near.isAlive&&visible.isAlive);assert.equal(visible.x,spawn[1].x);assert(near.isInvulnerable);
  const spawner=new WaveSpawner();assert.equal(spawner.getWaveEnemyCount(1),5);spawner.playerCount=5;assert.equal(spawner.getWaveEnemyCount(1),12);
  spawner.coopPlayers=[new Player(500,500)];assert.equal(spawner._spawnEnemyData({type:'standard'},{x:510,y:500},true),null);
  assert(spawner._spawnEnemyData({type:'standard'},{x:1000,y:500},true));
  // Wave two: both colleagues camp formerly announced entrances. The queue
  // must reroute to a body-valid safe point without needing either to die.
  const retry=new WaveSpawner();retry.playerCount=2;retry.currentWave=2;
  retry.coopPlayers=[new Player(0,0),new Player(500,0)];
  retry.spawnPoints=[{id:'left',x:0,y:0},{id:'right',x:500,y:0},{id:'clear',x:1000,y:0}];
  retry.spawnPositionValidator=p=>p.x>=0&&p.y===0;
  retry.state='SPAWNING';retry.spawnTimer=0;retry.totalWaveEnemies=2;
  retry.spawnQueue=[{id:'a',type:'STANDARD',spawnPoint:retry.spawnPoints[0]},{id:'b',type:'STANDARD',spawnPoint:retry.spawnPoints[1]}];
  let spawned=[];retry.onEnemySpawned=e=>spawned.push(e);
  retry.update(.1,null,0);assert.equal(spawned.length,0,'retargeting must telegraph first');
  assert(retry.getSpawnTelegraphs().some(t=>t.x===1000&&!t.blocked));
  for(let i=0;i<60;i++)retry.update(.1,null,spawned.length);
  assert.equal(spawned.length,2);assert.equal(retry.spawnQueue.length,0);
  assert(spawned.every(e=>retry.coopPlayers.every(p=>Math.hypot(e.x-p.x,e.y-p.y)>=260)));
  assert(retry.coopPlayers.every(p=>p.isAlive));
  // A temporarily impossible spawn rotates behind a valid reinforcement.
  retry.spawnQueue=[{id:'blocked',type:'STANDARD',spawnPoint:retry.spawnPoints[0]},{id:'ok',type:'STANDARD',spawnPoint:retry.spawnPoints[2]}];
  assert.equal(retry._spawnNextSquad().length,1);assert.equal(retry.spawnQueue[0].id,'blocked');
  const old=shooter.score;creditKill(shooter,400,'PISTOL',CONFIG.SCORING);assert.equal(shooter.kills,1);assert(shooter.score>old);assert.equal(shooter.favoriteWeapon,'PISTOL');
  creditKill(shooter,400,'PISTOL',CONFIG.SCORING);assert.equal(shooter.maxCombo,2);
  shooter.externalScoring=true;const beforeExecution=shooter.score;shooter.addScore(1000,'EXECUTION');assert.equal(shooter.score,beforeExecution,'coop execution has one score authority');
  const rows=rankPlayers([shooter],new Map([[3,{name:'Alice'}]]));assert.equal(rows[0].name,'Alice');assert.equal(rows[0].slot,3);
  console.log('PASS multi-target visibility, TED, owner attribution, safe spawns, respawn, defeat and individual scores');
})().catch(e=>{console.error(e);process.exit(1);});
