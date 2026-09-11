const assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('./js/engine/collision'),D=require('./js/map/doors'),IO=require('./js/map/map_io');
const base=require('./js/map/map_data'),Enemy=require('./js/entities/enemy');
const mapFile=fs.readFileSync('maps/active.json','utf8');
const body=(x,y)=>({x,y,radius:14,vx:0,vy:0,isAlive:true,state:'ALERT',onDoorSlam(){this.hits=(this.hits||0)+1;}});

// Every wall type, slow frames, dog speed, and knockdown motion.
for(const key of ['walls','glassPartitions'])for(const angle of [0,.6,Math.PI/2])for(const fps of [10,30,60,144]){
 const tx=Math.cos(angle),ty=Math.sin(angle),nx=-ty,ny=tx;
 const wall={x1:-tx*100,y1:-ty*100,x2:tx*100,y2:ty*100,thickness:6};
 const p=body(-nx*40,-ny*40),world={[key]:[wall]};
 for(let i=0;i<fps;i++){p.vx=nx*450;p.vy=ny*450;C.moveCircle(p,world,1/fps);}
 assert.ok(p.x*nx+p.y*ny<=-16.9,`${key} ${angle} ${fps}: no tunnelling`);
 if(key==='glassPartitions'){wall.shattered=true;for(let i=0;i<fps;i++){p.vx=nx*200;p.vy=ny*200;C.moveCircle(p,world,1/fps);}assert.ok(p.x*nx+p.y*ny>20);}
}
console.log('PASS solid/glass/diagonal walls at 10/30/60/144 FPS; shattered glass passable');

for(const who of ['player','enemy']){
 const d=new D.Door({x:0,y:0,length:60}),source=body(40,-16),target=body(40,18),behind=body(42,-18);
 source.team=who;source.vy=200;d.pushEntity(source,1/60);d.update(1/60);
 d.handleEntityInteraction(source,source.x,source.y,14);d.handleEntityInteraction(target,target.x,target.y,14);d.handleEntityInteraction(behind,behind.x,behind.y,14);
 assert.equal(source.hits,undefined);assert.equal(behind.hits,undefined);assert.equal(target.hits,1);
 for(let i=0;i<180;i++){d.update(1/60);for(const p of [source,target,behind])d.handleEntityInteraction(p,p.x,p.y,14);}
 assert.equal(target.hits,1);assert.equal(source.hits,undefined);assert.equal(behind.hits,undefined);
}
console.log('PASS player/enemy pushes hit only the other actor ahead, once; no self/return impacts');

// The red-framed door in the current user map, both directions and three contact points.
for(const fps of [30,60,144])for(const side of [-1,1])for(const t of [.3,.5,.7]){
 const m=IO.materialize(JSON.parse(mapFile),base,D),d=m.doors.find(d=>d.id==='door_2');assert(d);
 const nx=-Math.sin(d.baseAngle),ny=Math.cos(d.baseAngle),mx=d.x+Math.cos(d.baseAngle)*d.length*t,my=d.y+Math.sin(d.baseAngle)*d.length*t;
 const p=body(mx+nx*side*50,my+ny*side*50);
 let crossed=false;
 for(let i=0;i<fps*2;i++){
  p.vx=-nx*side*200;p.vy=-ny*side*200;C.moveCircle(p,m,1/fps);d.update(1/fps);d.handleEntityInteraction(p,p.x,p.y,14);
  if(((p.x-mx)*nx+(p.y-my)*ny)*side < -22){crossed=true;break;}
 }
 assert.ok(crossed,`red door crossing ${fps}fps side ${side} contact ${t}`);assert.equal(p.hits,undefined);
}
console.log('PASS red-framed user door: 18 crossings, both directions, no self stun');

// A door placed across overlapping wall and glass must cut all copies, not only its host.
const map={walls:[{id:'w',x1:0,y1:0,x2:200,y2:0},{id:'w2',x1:200,y1:0,x2:0,y2:0}],glassPartitions:[new D.GlassPartition({id:'g',x1:20,y1:0,x2:180,y2:0})]};
IO.cutDoorOpening(map,{x:60,y:0},{x:120,y:0});
assert.equal(map.walls.length,4);assert.equal(map.glassPartitions.length,2);
assert.equal(typeof map.glassPartitions[0].shatter,'function');
const p=body(90,-50);for(let i=0;i<60;i++){p.vy=120;C.moveCircle(p,map,1/60);}assert.ok(p.y>30);
assert.equal(new Set([...map.walls,...map.glassPartitions].map(w=>w.id)).size,6);
assert.equal(fs.readFileSync('maps/active.json','utf8'),mapFile);
console.log('PASS overlapping wall/glass door openings, valid IDs, user JSON unchanged');
