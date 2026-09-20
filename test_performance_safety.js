'use strict';
const assert = require('node:assert/strict');
const { NavGraph } = require('./js/engine/pathfinding');
const Camera = require('./js/engine/camera');
const { updateCorpses, expireSupplies } = require('./js/entities/world_cleanup');
const settings = require('./js/config').CLEANUP;

// Cached rotated geometry must immediately follow every editor mutation.
const prop = { x:0,y:0,width:100,height:20,solid:true,centered:true,angle:0 };
const map = { walls:[],glassPartitions:[],doors:[],props:[prop] };
const nav = Object.create(NavGraph.prototype); nav.mapData = map;
const a={x:-80,y:45}, b={x:80,y:45};
assert(nav.canTraverse(a,b,14));
prop.angle=Math.PI/2; assert(!nav.canTraverse(a,b,14));
prop.x=500; assert(nav.canTraverse(a,b,14));
prop.x=0;prop.collisionWidth=10; assert(nav.canTraverse(a,b,14));
prop.collisionWidth=200; assert(!nav.canTraverse(a,b,14));
prop.solid=false; assert(nav.canTraverse(a,b,14));
map.glassPartitions.push({x1:0,y1:0,x2:0,y2:100,thickness:8});
assert(!nav.canTraverse(a,b,14));
map.glassPartitions[0].shattered=true;assert(nav.canTraverse(a,b,14));
const door={x:0,y:0,length:100,angle:Math.PI/2,isLocked:true};map.doors.push(door);
assert(!nav.canTraverse(a,b,14));door.isLocked=false;assert(nav.canTraverse(a,b,14));
assert(!nav.canTraverse(a,b,14,false));door.angle=0;assert(nav.canTraverse(a,b,14,false));

// Inverse-transformed screen corners always fit the rotated camera AABB.
for(const roll of [0,.1,-.4,Math.PI/2]) for(const zoom of [.5,1,2]) {
  const camera=new Camera(3440,1440);camera.x=700;camera.y=300;camera.roll=roll;
  camera.zoom=zoom;camera.shakeRoll=.07;camera.shakeOffsetX=13;camera.shakeOffsetY=-7;
  const bounds=camera.getBounds(0);
  for(const x of [0,3440]) for(const y of [0,1440]) {
    const p=camera.screenToWorld(x,y);
    assert(p.x>=bounds.left-1e-8 && p.x<=bounds.right+1e-8);
    assert(p.y>=bounds.top-1e-8 && p.y<=bounds.bottom+1e-8);
  }
}

const live={isAlive:true}, down={isAlive:true,state:'KNOCKED_DOWN'};
const corpses=Array.from({length:500},(_,i)=>({isAlive:false,corpseAge:i/100}));
const actors=[live,down,...corpses];
for(let i=0;i<240;i++)updateCorpses(actors,1/60,settings);
assert.equal(actors.length,settings.MAX_CORPSES+2);
assert.deepEqual(actors.slice(0,2),[live,down]);
assert(actors.includes(corpses[0]),'keep newest death, regardless of spawn order');
for(let i=0;i<6000;i++)updateCorpses(actors,1/60,settings);
assert.deepEqual(actors,[live,down]);
const sliding=[{isAlive:false}];updateCorpses(sliding,.5,{...settings,MAX_CORPSES:0});
assert.equal(sliding[0].corpseFade,undefined,'preserve initial death slide');
const natural=[{isAlive:false,corpseAge:settings.CORPSE_SECONDS-.1}];
updateCorpses(natural,.2,settings);assert(natural[0].corpseAlpha>0 && natural[0].corpseAlpha<1);

const supply={supplyWave:3}, mapWeapon={}, enemyDrop={}, usedAndDropped={};
const weapons=[supply,mapWeapon,enemyDrop,usedAndDropped];
expireSupplies(weapons,4);assert.equal(weapons.length,4);
expireSupplies(weapons,5);assert.deepEqual(weapons,[mapWeapon,enemyDrop,usedAndDropped]);
console.log('PASS geometry invalidation, rotated viewport, corpse retention and supply expiry');
