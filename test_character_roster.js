const assert=require('node:assert/strict');
const CONFIG=require('./js/config'),Player=require('./js/entities/player'),Enemy=require('./js/entities/enemy');
const {GameHUD}=require('./js/ui/hud');
const chars=Object.values(CONFIG.MASKS);
assert.deepEqual(chars.map(c=>c.name),['VINCENT','ANNE','LUCAS','ARNAUD','JADE','PAP','JC']);
assert.equal(new Set(chars.map(c=>c.animal)).size,7);assert.equal(new Set(chars.map(c=>c.perks.startWeapon)).size,7);
for(const ch of chars){
 const p=new Player(0,0,ch.id),k=ch.perks;
 assert.equal(p.currentWeapon.id,k.startWeapon);assert.equal(p.ammo,k.startAmmo);
 assert.equal(p.baseSpeed,220*(k.speedMult||1));assert.equal(p.executionTotalTime,1.2*(k.executionTimeMult||1));
 assert(ch.description&&ch.role&&ch.perkDesc&&ch.startDesc&&ch.look);
 const hud=new GameHUD();hud.setMask(ch.id);hud.addKillScore('KILL',100,0,0);
 assert.equal(hud.currentScore,100*(k.scoreMult||1));
 assert.equal(hud.comboMaxTimer,CONFIG.SCORING.COMBO_WINDOW_BASE*(k.comboTimeMult||1));
 hud.setWeapon(p.currentWeapon,p.ammo);
 if(p.currentWeapon.isGun)assert.equal(hud.maxAmmo,Math.floor(p.currentWeapon.maxAmmo*(k.ammoCapacityMult||1)));
 if(p.currentWeapon.isGun){const cd=p.currentWeapon.cooldown;p.attack(100,0);assert.equal(p.attackCooldown,cd*(k.gunCooldownMult||1));assert.equal(p.ammo,k.startAmmo-1);}
 p.respawn(10,20);assert.equal(p.currentWeapon.id,k.startWeapon);assert.equal(p.ammo,k.startAmmo);
 p.equipWeapon('UZI',30);assert.equal(p.ammo,k.ammoCapacityMult?Math.floor(30*k.ammoCapacityMult):30);
 // Zero ammo and partial pickup never turn into free ammunition.
 p.equipWeapon('UZI',0);assert.equal(p.ammo,0);p.equipWeapon('UZI',2);assert.equal(p.ammo,2);
 const e=new Enemy(0,0);e.onDoorSlam({lastKickedBy:p},1,1,0);assert.equal(e.isAlive,!k.doorLethal);
}
// Spread changes the actual bullet direction, not just a menu description.
const random=Math.random;try{Math.random=()=>1;
 for(const id of ['lucas','jc']){const p=new Player(0,0,id),w=p.currentWeapon,shot=p.attack(100,0);assert(Math.abs(shot.bullets[0].angle - .5*w.spread*p.perks.spreadMult)<1e-8);}
}finally{Math.random=random;}
for(const id of ['vincent','anne']){
 const p=new Player(0,0,id),target=new Enemy(0,0);target.knockDown(0,5);
 p._startExecution(target,null,null);
 for(let i=0;i<95;i++)p._updateExecution(.01,null,null);
 assert.equal(target.isAlive,id!=='vincent','execution duration must affect real target death');
}
console.log('PASS seven names/animals/loadouts, perks, cooldowns, spread, ammo capacity, respawn and Arnaud door impacts');
