const assert=require('node:assert/strict');
const {Door}=require('./js/map/doors.js');
const Enemy=require('./js/entities/enemy.js');
const Player=require('./js/entities/player.js');
const Collision=require('./js/engine/collision.js');
const Physics=require('./js/engine/physics.js');
global.CONFIG=require('./js/config.js');
const {WaveSpawner}=require('./js/entities/spawner.js');
const makeDoor=()=>new Door({x:0,y:0,length:60});

// Walking through a doorway is safe at different frame rates, even in a crowd.
for(const fps of [30,60,144]) {
 const d=makeDoor(),p=new Player(40,-20),e=new Enemy(40,20);
 for(let i=0;i<fps*4;i++) {
  p.vx=0;p.vy=150;p.y+=p.vy/fps;
  e.vx=0;e.vy=-150;e.y+=e.vy/fps;
  Collision.resolveCircleCollision(p,[d],1/fps);
  Collision.resolveCircleCollision(e,[d],1/fps);
  d.update(1/fps);d.handleEntityInteraction(p,p.x,p.y,p.radius);d.handleEntityInteraction(e,e.x,e.y,e.radius);
  assert.equal(p.isAlive,true);assert.equal(e.isAlive,true);
 }
 assert.ok(p.y>60 && e.y < -60, 'both actors must cross the opening at '+fps+' fps');
}

// A deliberately kicked leaf sweeps a target once; ordinary kicks stun.
const d=makeDoor(),p=new Player(40,-12),e=new Enemy(40,18);
assert.equal(d.kick(p,0,1,27).success,true);
d.handleEntityInteraction(e,e.x,e.y,e.radius);
assert.notEqual(e.state,'KNOCKED_DOWN','no damage before the leaf moves');
d.update(1/60);d.handleEntityInteraction(e,e.x,e.y,e.radius);
assert.equal(e.state,'KNOCKED_DOWN');assert.equal(e.isAlive,true);
const timer=e.knockdownTimer;e.knockdownTimer=1;
d.handleEntityInteraction(e,e.x,e.y,e.radius);assert.equal(e.knockdownTimer,1);
assert.equal(d.kick(p,0,1,27).success,false,'holding kick cannot rearm the same swing');
for(let i=0;i<120;i++){d.update(1/60);d.handleEntityInteraction(p,p.x,p.y,p.radius);}
assert.equal(p.isAlive,true);assert.equal(d.isDangerous,false);
e.knockdownTimer=timer;

// Downed enemies slide against walls and recover; they cannot hide beyond a wall.
e.x=0;e.y=0;e.vx=220;e.vy=0;
for(let i=0;i<300;i++)e.update(1/60,null,[{x1:25,y1:-200,x2:25,y2:200}],[],[],[]);
assert.ok(e.x<=25-e.radius+0.01);assert.equal(e.isAlive,true);assert.notEqual(e.state,'KNOCKED_DOWN');

// Don Juan uses the exact death/drop/corpse lifecycle used by weapons.
const lethal=makeDoor(),killer=new Player(40,-12);killer.mask='DON_JUAN';
const victim=new Enemy(40,18);lethal.kick(killer,0,1,34);lethal.update(1/60);
lethal.handleEntityInteraction(victim,victim.x,victim.y,victim.radius);
assert.equal(victim.isAlive,false);assert.equal(victim.state,'DEAD');assert.equal(victim.hp,0);
assert.ok(Number.isFinite(victim.deathAngle));
const vx=victim.vx;victim.die({angle:2});assert.equal(victim.vx,vx,'death is idempotent');
const wave=new WaveSpawner();wave.state='IN_PROGRESS';wave.currentWave=1;wave.enemiesSpawned=1;wave.spawnQueue=[];
wave.update(1/60,null,[victim].filter(x=>x.isAlive).length);
assert.equal(wave.state,'INTERMISSION');
wave.update(wave.intermissionTimer+0.1,null,0);assert.equal(wave.currentWave,2);

// Locked doors and read-only collision probes cannot acquire energy or hurt actors.
const locked=new Door({x:0,y:0,length:60,isLocked:true});
locked.pushEntity({x:40,y:-10,vx:0,vy:200,radius:14});assert.equal(locked.angularVelocity,0);
assert.equal(locked.kick(p,0,1).success,false);
const probeDoor=makeDoor();const probe={x:40,y:0,vx:0,vy:200,radius:14};
Physics.resolveEntityWorldCollisions(probe,{doors:[probeDoor]});assert.equal(probeDoor.angularVelocity,0);
assert.ok(Math.abs(probe.y)>=14);
console.log('PASS safe traversal 30/60/144fps, kick sweep, single impact, recovery collision, shared death and next wave');
