'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const CONFIG=require('./js/config.js'),{InputManager}=require('./js/engine/input.js');
const {WaveSpawner}=require('./js/entities/spawner.js');
const env={CONFIG,console,CharacterArt:{portrait(){}}};vm.createContext(env);
for(const file of ['ui_theme','coop_ui','lobby_menu','multi_score_screen','hud'])vm.runInContext(fs.readFileSync(`js/ui/${file}.js`,'utf8'),env);
const GameHUD=vm.runInContext('GameHUD',env),input=new InputManager();
function tick(menu,keys=[],pad={}) {
  for(const key of keys)input._onKeyDown({code:key,preventDefault(){}});
  input.gamepad.connected=Object.keys(pad).length>0;Object.assign(input.gamepad.justPressed,pad);
  menu.update(1/60,input,1280,720);input.clearFrameTriggers();for(const key of keys)input._onKeyUp({code:key});
}
const calls=[],member={slot:0,mask:'vincent',name:'A very long alias',ready:false};
const network={slot:0,isHost:true,code:'H7K2P',members:new Map([[0,member],[1,{slot:1,mask:'anne',name:'Bob',ready:false}]]),ready(){member.ready=!member.ready;},profileUpdate(p){Object.assign(member,p);},canStart:()=>false,start(){calls.push('start');},resultReady(){calls.push('resultReady');}};
const lobby=new env.LobbyMenu(network,{leave:()=>calls.push('leave'),copy:()=>calls.push('copy')});lobby.show();
tick(lobby,[],{dpadRight:true});assert.equal(lobby.selectedIndex,1);assert.equal(member.mask,'vincent','roster focus previews without mutating profile');
tick(lobby,[],{buttonA:true});assert.equal(member.mask,'anne');assert.equal(lobby.selectedIndex,7);
tick(lobby,[],{buttonX:true});assert(member.ready);tick(lobby,['Digit5']);assert.equal(member.mask,'anne','ready locks character');
tick(lobby,[],{buttonX:true});tick(lobby,['Digit5']);assert.equal(member.mask,'jade');
tick(lobby,[],{buttonStart:true});assert(!calls.includes('start'),'host cannot start before everyone is ready');
const c=new Proxy({measureText:s=>({width:String(s).length*8}),createLinearGradient:()=>({addColorStop(){}})}, {get:(o,k)=>o[k]||(()=>{})});
lobby.render(c,1280,720,input);assert.equal(lobby.regions.length,11);
for(const r of lobby.regions)assert(r.x>=0&&r.y>=0&&r.x+r.w<=1280&&r.y+r.h<=720);
input.gamepad.connected=false;input.isGamepadMode=false;const portrait=lobby.regions.find(r=>r.index===3);
input.mouse.x=portrait.x+20;input.mouse.y=portrait.y+20;input.mouse.leftJustPressed=true;tick(lobby);assert.equal(member.mask,'arnaud');
const scores=new env.MultiScoreScreen(network);
const rows=Array.from({length:5},(_,slot)=>({slot,mask:Object.keys(CONFIG.MASKS)[slot],name:'A very long alias',kills:15-slot,falls:slot,score:1234567,favoriteWeapon:'SILENCED_PISTOL',deathWave:4,deathTime:165}));
for(const size of [2,3,4,5]) {
  scores.show(rows.slice(0,size));scores.timer=1;scores.render(c,1920,1080,input);
  // Clicking the background cannot skip or accept a result.
  input.mouse.x=2;input.mouse.y=2;input.mouse.leftJustPressed=true;tick(scores);assert.equal(scores.phase,0);
  tick(scores,[],{buttonA:true});assert.equal(scores.phase,1);scores.timer=1;scores.render(c,1280,720,input);
  tick(scores,[],{buttonA:true});assert.equal(calls.at(-1),'resultReady');
  assert.equal(scores.regions.length,1);
}
(async()=>{
  const {WorldSync}=await import('./js/network/world_sync.js');
  const hud=new GameHUD(),world={waveSpawner:new WaveSpawner()};
  const bridge={hud,players:new Map(),mapData:{doors:[],glassPartitions:[]},getWorld:()=>world,setWorld(){},setPlayingState(){},soundFX:{playWaveClearFanfare(){}},particleSystem:{},bloodSystem:{}};
  const sync=new WorldSync(bridge);
  const snapshot={version:1,seq:1,time:0,wave:1,phase:'PREWAVE',remaining:7,total:7,timer:4,players:[{id:0,x:0,y:0,isAlive:true}],enemies:[],bullets:[],floor:[],thrown:[],doors:[],glass:[],crates:[],telegraphs:[{id:0,x:500,y:500,angle:0,countdown:4,blocked:false}]};
  assert(sync.receive(snapshot,0));sync.sample(.1,0,.1);assert.equal(hud.preWaveTime,4);
  assert(sync.receive({...snapshot,seq:2,time:4,phase:'SPAWNING',timer:0},.1));
  for(let i=0;i<180;i++)sync.sample(.2+i/60,0,1/60);
  assert(hud.waveAge>2.9,'client presentation clock must fade WAVE 01 even without a new packet');
  assert.equal(hud.preWaveTime,0);assert.equal(world.waveSpawner.getSpawnTelegraphs()[0].x,500);
  assert(sync.receive({...snapshot,seq:3,wave:2,phase:'SPAWNING',timer:0},4));sync.sample(4.2,0,.016);
  assert.equal(hud.presentedWave,2);assert(hud.waveAge<.1,'next wave announces exactly once');
  sync.sample(4.3,0,.1);assert(hud.waveAge>=.1);
  // Authoritative geometry is instant; only the render angle eases at 60 Hz.
  const door={x:0,y:0,angle:0,minAngle:-2,maxAngle:2};bridge.mapData.doors.push(door);
  sync.receive({...snapshot,seq:4,time:4.5,doors:[{id:0,angle:1,angularVelocity:0}]},4.5);
  assert.equal(door.angle,1,'collision must never use delayed geometry');
  const angles=[];for(let i=0;i<6;i++){sync.sample(4.5+i/60,0,1/60);angles.push(door.renderAngle);assert.equal(door.angle,1);}
  assert(angles.every((a,i)=>a>0&&a<1&&(!i||a>angles[i-1])),'door animates on every display frame');
  const Player=require('./js/entities/player');
  const local=new Player(0,0);local.networkPrediction=true;local.state='EXECUTING';local.executionTimer=.4;
  const poses=[];local.character={};local._drawLegs=local._drawMask=()=>{};local._drawTorso=(_ctx,_executing,pose)=>poses.push(pose);
  bridge.players.set(0,local);
  sync.receive({...snapshot,seq:5,players:[{id:0,x:0,y:0,isAlive:true,state:'EXECUTING',executionTimer:.4}]},5);
  for(let i=0;i<4;i++){sync.sample(5+i/60,0,1/60);local._drawExecutionSprite(c);}
  assert(poses.every((pose,i)=>!i||pose!==poses[i-1]),'local client execution is animated on every display frame');
  assert.equal(local.executionTimer,.4,'render time cannot advance authoritative execution hits');
  assert.equal(local.executionStep,0);
  local.state='IDLE';sync.sample(5.1,0,1/60);assert.equal(local.executionRenderTimer,undefined);
  local.networkPrediction=false;local.executionRenderTimer=10;local._drawExecutionSprite(c);
  assert.equal(poses.at(-1),(Math.sin(.4*14)+1)/2,'solo and host always render their own simulation clock');
  global.WeaponSystem=require('./js/entities/weapon.js');global.Collision=require('./js/engine/collision.js');
  const {ProjectilePresentation}=await import('./js/network/projectile_presentation.js');
  const tracers=new ProjectilePresentation({mapData:{walls:[],doors:[],glassPartitions:[],props:[]},particleSystem:{}});
  const bullet={id:3,x:0,y:0,vx:1000,vy:0,angle:0,weapon:'PISTOL',isPlayer:true,ownerPlayerId:1,lifeTime:0,maxLifeTime:.24};
  tracers.launch([bullet],0,0,0);
  let last=0;
  for(let i=1;i<=12;i++){
    const now=i/60;
    if(i%3===0)tracers.reconcile({time:now,bullets:[{...bullet,x:1000*now,lifeTime:now}]},now,0);
    const b=tracers.sample(now)[0];assert(b&&b.x>last,'a 20 Hz bullet advances on every 60 Hz frame');last=b.x;
  }
  tracers.reconcile({time:.21,bullets:[]},.21,0);assert.equal(tracers.sample(.22).length,0,'authoritative impact retires the tracer');
  tracers.launch([bullet],.23,0,0);assert.equal(tracers.sample(.23).length,0,'a late reliable birth cannot resurrect an impacted bullet');
  tracers.predict({playerId:0,x:0,y:0,angle:0,currentWeapon:WeaponSystem.getWeaponType('PISTOL')},1);
  assert.equal(tracers.sample(1).length,1,'own tracer is visible before a round trip');
  tracers.reconcile({time:1,bullets:[{...bullet,ownerPlayerId:0}]},1,0);assert.equal(tracers.sample(1).length,1,'no duplicate own authoritative tracer');
  assert.equal(tracers.sample(2).length,0,'cosmetics expire without packets');
  for(let i=0;i<180;i++)tracers.launch([{...bullet,id:i}],3,3,0);assert.equal(tracers.tracks.size,128,'render memory is bounded');
  console.log('PASS client wave animation, replicated markers, roster mouse/controller, ready lock, safe result confirmation and 2–5 layouts');
})().catch(e=>{console.error(e);process.exit(1);});
