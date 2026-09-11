const assert=require('node:assert/strict');const Player=require('./js/entities/player'),Enemy=require('./js/entities/enemy');const {FloorWeapon,WEAPON_TYPES}=require('./js/entities/weapon');
for(const id of ['BAT','KNIFE','KATANA','PIPE','CROWBAR','AXE','MACHETE','FISTS'].filter(id=>WEAPON_TYPES[id])){const p=new Player(0,0,'ANNE');p.currentWeapon=WEAPON_TYPES[id];p.attackCooldown=0;const a=p.attack(100,0);assert.equal(a.range,WEAPON_TYPES[id].range*(id==='FISTS'?1:1.2));assert.equal(new Enemy(0,0,'STANDARD',id).currentWeapon.range,WEAPON_TYPES[id].range);}
function travel(hz,speed){const w=new FloorWeapon(0,0,'KNIFE');w.throw(0,0,0,speed===780?'enemy':'player',speed);for(let i=0;i<hz*5&&w.isFlying;i++)w.update(1/hz);return w.x;}
for(const hz of [30,60,120,144]){const base=travel(hz,780),far=travel(hz,1560);assert(far/base>1.95&&far/base<2.1);assert(Math.abs(far-travel(60,1560))/far<.02);console.log(hz+' fps: '+base.toFixed(1)+' -> '+far.toFixed(1));}
const p=new Player(0,0,'ANNE');assert.equal(p.throwWeapon(100,0).vx,1560);
const en=new Enemy(120,0),w=new FloorWeapon(0,0,'KNIFE');w.throw(0,0,0,'player',1560);for(let i=0;i<10&&en.isAlive;i++)w.update(1/30,[],[en]);assert.equal(en.isAlive,false);
console.log('PASS +20% player melee, unchanged fists/enemy range, near-double throw distance independent of FPS, fast throw hits target');
