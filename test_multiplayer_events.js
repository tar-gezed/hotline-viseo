'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
global.window=globalThis;global.CONFIG=require('./js/config');global.Collision=require('./js/engine/collision');
global.WeaponSystem=require('./js/entities/weapon');global.Player=require('./js/entities/player');
const {GlassPartition}=require('./js/map/doors'),{WaveSpawner}=require('./js/entities/spawner');
require('./js/ui/ui_theme');
const source=fs.readFileSync('js/main.js','utf8');
function integrate(context,from,to){vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  function '+from+'('),source.indexOf('  function '+to+'(')),context);return context;}
(async()=>{
  const {PresentationEvents,validPresentationEvent}=await import('./js/network/presentation_events.js');
  const sent=[],seen=[],bridge={particleSystem:{shatterGlass(...a){seen.push(['glass',...a]);},addFloatingText(...a){seen.push(['text',...a]);}},hud:{addScorePopup(...a){seen.push(['score',...a]);}},soundFX:{playGlassShatter(){seen.push(['sound']);},playWeaponPickup(){},playExecution(){},playAmmoRefill(){}}};
  const mirror=new PresentationEvents(bridge,e=>sent.push(e),()=>true);
  // Actual body/glass integration broadcasts debris at the impact, not at a
  // pane endpoint offscreen. Replaying it cannot shatter client geometry.
  global.game={spawnDebris:(x,y,type,count,dx,dy)=>bridge.particleSystem.shatterGlass(x,y,count,dx,dy)};
  const glass=new GlassPartition({x1:0,y1:-50,x2:0,y2:50});
  const glassWorld={mapData:{glassPartitions:[glass]},Collision,particleSystem:bridge.particleSystem,soundFX:bridge.soundFX,addTrauma(){},multiplayer:{playing:true},player:null};
  integrate(glassWorld,'checkGlassCollisions','rayCircleDistance').checkGlassCollisions({isAlive:true,x:0,y:0,radius:14,vx:300,vy:0,baseSpeed:300});
  assert(glass.shattered);assert(sent.some(e=>e.method==='shatterGlass'));const count=sent.length;
  for(const e of sent.slice())assert(mirror.replay(e));assert.equal(sent.length,count,'replay and nested cosmetics never echo');
  assert(!validPresentationEvent({kind:'presentation',target:'hud',method:'addScore',args:[999]}));
  assert(!validPresentationEvent({kind:'presentation',target:'__proto__',method:'constructor',args:[]}));
  assert(!validPresentationEvent({kind:'presentation',target:'particleSystem',method:'shatterGlass',args:[NaN]}));
  for(const method of ['addFloatingText'])bridge.particleSystem[method](10,20,'PICKED UP UZI','#00f3ff',16);
  bridge.hud.addScorePopup(10,20,'EXECUTION +1000','#00f3ff');assert(sent.some(e=>e.method==='addFloatingText'));assert(sent.some(e=>e.method==='addScorePopup'));
  const feet={activeFootsteps:new Map(),triggerBloodySteps(id){this.activeFootsteps.set(id,{});},updateCharacterFootprint(){}};
  for(const playerId of [0,1,2]){const p=new Player(0,0);p.playerId=playerId;p.stepInBlood(feet);}
  assert.deepEqual([...feet.activeFootsteps.keys()],['player:0','player:1','player:2'],'blood tracks must not be shared between colleagues');
  // Swept throws pierce panes, including high speeds / low display rates.
  for(const hz of [30,60,144]){
    const pane=new GlassPartition({x1:30,y1:-60,x2:30,y2:60}),weapon=new WeaponSystem.FloorWeapon(0,0,'KNIFE');weapon.throw(0,0,0,'player',1560);
    for(let i=0;i<8;i++)weapon.update(1/hz,[pane]);
    assert(pane.shattered,'a thrown weapon must break glass');assert(weapon.x>30);
  }
  const thrownPane=new GlassPartition({x1:10,y1:-50,x2:10,y2:50}),thrown=new WeaponSystem.FloorWeapon(0,0,'KNIFE');thrown.throw(0,0,0,'player',1560);
  const throws={Collision,mapData:{walls:[],glassPartitions:[thrownPane]},enemies:[],thrownWeapons:[thrown],floorWeapons:[],particleSystem:null,camera:null,runStats:{totalKills:0,weaponsUsed:new Set()},hud:{},collectEnemyDrop(){}};
  integrate(throws,'updateThrownWeapons','collectEnemyDrop').updateThrownWeapons(.016);assert(thrownPane.shattered,'main loop must pass panes to thrown physics');
  const {Door}=require('./js/map/doors'),closedDoor=new Door({x:20,y:-20,length:40,baseAngle:Math.PI/2});
  const bouncing=new WeaponSystem.FloorWeapon(0,0,'BAT');bouncing.throw(0,0,0,'player',1560);
  for(let i=0;i<5;i++)bouncing.update(1/60,[closedDoor]);
  assert(bouncing.bounceCount>0,'isOpen() method must not cause throws to ignore a closed door');
  // Every connected slot receives one refill; one player's claim cannot hide
  // the cache for the other four or grant repeated score/ammunition.
  const spawner=new WaveSpawner();spawner.coopPlayers=Array.from({length:5},(_,playerId)=>({playerId}));
  const crate={x:0,y:0,isOpened:false,claimedMask:0};
  assert(spawner.claimSupply(crate,1));assert(!crate.isOpened);assert(!spawner.claimSupply(crate,1));
  for(const slot of [0,2,3,4])assert(spawner.claimSupply(crate,slot));assert(crate.isOpened);assert.equal(crate.claimedMask,31);
  const labels=[],ctx=new Proxy({fillText:s=>labels.push(s)},{get:(o,k)=>o[k]||(()=>{})});
  WaveSpawner.renderSupplyCrate.call({...crate,isOpened:false,claimedMask:2},ctx,0);assert(labels.includes('AMMO')&&labels.includes('RAVITAILLEMENT'));
  labels.length=0;WaveSpawner.renderSupplyCrate.call({...crate,isOpened:false,claimedMask:2},ctx,1);assert(labels.includes('RÉCUPÉRÉ'));
  const {record}=await import('./js/network/protocol.js');assert.equal(record({id:1,claimedMask:2}).claimedMask,2);
  // A short projectile killed within a host tick must get a display frame,
  // even if empty snapshots and its terminal point arrive before its birth.
  const {ProjectilePresentation}=await import('./js/network/projectile_presentation.js');
  const traces=new ProjectilePresentation({mapData:{walls:[],doors:[],glassPartitions:[],props:[]},particleSystem:{}});
  const bullet={id:80,x:0,y:0,angle:0,vx:1200,vy:0,weapon:'PISTOL',ownerPlayerId:0,maxLifeTime:.24,isPlayer:true};
  traces.finish({id:80,x:12,y:0},0);traces.reconcile({time:1,bullets:[]},.001,1);traces.launch([bullet],.002,0,1);
  traces.reconcile({time:2,bullets:[]},.01,1);let tracer=traces.sample(.06)[0];assert(tracer&&tracer.x===12,'terminal short shot is visible and clipped to impact');
  assert.equal(traces.sample(.1).length,0);traces.launch([bullet],.11,0,1);assert.equal(traces.sample(.11).length,0,'no resurrection after presentation');
  traces.launch([{...bullet,id:81,ownerPlayerId:1}],1,1,1);assert.equal(traces.sample(1).length,1,'unpredicted own authoritative shots remain visible');
  const paneTrace=new ProjectilePresentation({mapData:{walls:[{x1:2,y1:-10,x2:2,y2:10}],doors:[],glassPartitions:[],props:[]},particleSystem:{}});
  paneTrace.launch([bullet],0,0,1);assert.equal(paneTrace.sample(1/60).length,1,'point-blank impacts cannot expire before the first display frame');
  const intactPane=new GlassPartition({x1:2,y1:-10,x2:2,y2:10});
  const throughGlass=new ProjectilePresentation({mapData:{walls:[],doors:[],glassPartitions:[intactPane],props:[]},particleSystem:{}});
  throughGlass.launch([bullet],0,0,1);assert(throughGlass.sample(.05)[0].x>2,'unmarked GlassPartition must not clip a piercing visual bullet');assert(!intactPane.shattered,'presentation cannot break glass');
  // Host options and visibility are two independent pause reasons. A client
  // opening local options cannot pause the host. Leave returns before teardown.
  const {CoopSession}=await import('./js/network/coop_session.js');
  const session=Object.create(CoopSession.prototype),messages=[];let backed=false,resolveLeave;
  Object.assign(session,{playing:true,network:{isHost:true,send:(...a)=>messages.push(a),leave:()=>new Promise(r=>resolveLeave=r)},options:{show(){},hide(){}},b:{input:{reset(){}},back(){backed=true;}},menu:{hide(){}},lobby:{hide(){}},results:{hide(){}}});
  session.setOverlay(true);assert(session.network.hidden);session.visibilityChanged(false);assert(session.network.hidden);
  session.visibilityChanged(true);session.setOverlay(false);assert(session.network.hidden);session.visibilityChanged(false);assert(!session.network.hidden);
  session.network.isHost=false;session.setOverlay(true);assert(!session.network.hidden);
  const leaving=session.leave();assert(backed,'room exit is immediate even if transport leave waits');resolveLeave();await leaving;
  for(const [key,type] of [['effectsPending','effects'],['reliablePending','state']]) {
    const releases=[];session.network.send=()=>new Promise(resolve=>releases.push(resolve));
    session.sendPending(key,type,[]);session[key]=null; // Mission reset while its old transport is closing.
    session.sendPending(key,type,[]);const current=session[key];
    releases[0]();await Promise.resolve();assert.equal(session[key],current,'old mission completion cannot unlock a new reliable batch');
    releases[1]();await Promise.resolve();assert.equal(session[key],null);
  }
  const {InputManager}=require('./js/engine/input');const input=new InputManager();input.gamepad.prevButtons.buttonA=true;
  input.reset({preserveGamepadButtons:true});assert.equal(input.gamepad.prevButtons.buttonA,true,'held A must not become a new title confirmation after exit');
  console.log('PASS short/own projectiles, glass body/throw effects, action text, per-player supplies and labels, synchronized pause and immediate exit');
})().catch(e=>{console.error(e);process.exit(1);});
