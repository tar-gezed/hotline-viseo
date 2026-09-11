const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const Enemy=require('./js/entities/enemy'),{FloorWeapon}=require('./js/entities/weapon');
const source=fs.readFileSync('js/main.js','utf8');
function fn(name,next){return source.slice(source.indexOf('  function '+name+'('),source.indexOf('  function '+next+'('));}
for(const [type,lethal] of [['KNIFE',true],['BAT',false]]){
 const enemy=new Enemy(15,0),weapon=new FloorWeapon(0,0,type);weapon.throw(0,0,0,'player');const awards=[];
 const c={mapData:{walls:[]},enemies:[enemy],thrownWeapons:[weapon],floorWeapons:[],particleSystem:null,camera:null,runStats:{totalKills:0,weaponsUsed:new Set()},awardKill:(...a)=>awards.push(a),hud:{addScore:(...a)=>awards.push(a)},collectEnemyDrop:()=>{}};
 vm.createContext(c);vm.runInContext(fn('updateThrownWeapons','collectEnemyDrop'),c);c.updateThrownWeapons(.016);assert.equal(enemy.isAlive,!lethal);assert.equal(c.runStats.totalKills,lethal?1:0);assert.equal(awards[0][0],lethal?600:200);c.updateThrownWeapons(.016);assert.equal(awards.length,1);
}
console.log('PASS real thrown knife kill and bat stun counted exactly once');
