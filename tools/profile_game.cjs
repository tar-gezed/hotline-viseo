'use strict';
// Development-only seeded stress probe; no bridge is shipped to players.
// npm start -- --port 8097, then node tools/profile_game.cjs [--out file.json]
// work = JS requestAnimationFrame callback time; intervals also expose missed
// presentations. GPU work is asynchronous and is not included in work alone.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const revision = option('--revision', null);
const output = option('--out', null);
if (output) fs.mkdirSync(path.dirname(path.resolve(output)), {recursive:true});
const summary = values => {
  const a = values.slice().sort((a,b) => a-b);
  return { n:a.length, mean:a.reduce((s,x)=>s+x,0)/a.length, p50:a[Math.floor(a.length*.5)], p95:a[Math.floor(a.length*.95)], max:a.at(-1) };
};
const bridge = `
window.__perf = {
 ready: () => !!navGraph && !!waveSpawner,
 setup(count, corpses, combat = false) {
   startNewGame('vincent'); unlockAudio();
   waveSpawner.startWave(8, true);
   waveSpawner.spawnQueue = []; waveSpawner.enemiesAlive = count;
   enemies = [];
   player.takeHit = () => {}; player.die = () => {};
   const spawns = mapData.spawnLocations;
   for(let i=0;i<count;i++) waveSpawner.onEnemySpawned({...spawns[i%spawns.length],type:i%3===0?'heavy':'standard',weapon:'pistol'});
   if(combat) {
     const anchors=[];
     for(let r=90;r<=300;r+=35) for(let i=0;i<24;i++) {
       const p={x:player.x+Math.cos(i*Math.PI/12)*r,y:player.y+Math.sin(i*Math.PI/12)*r};
       if(navGraph.canTraverse(p,player,20)) anchors.push(p);
     }
     if(!anchors.length) throw Error('No combat anchors');
     enemies.forEach((e,i)=>{Object.assign(e,anchors[i%anchors.length]);e.entryTimer=0;e.angle=e.targetAngle=Math.atan2(player.y-e.y,player.x-e.x);e.state='ALERT';e.reactionTimer=0;});
   }
   for(let i=0;i<corpses;i++) {
     const p=spawns[i%spawns.length]; const e=new Enemy(p.x+(i%11)*7,p.y+(i%7)*7,'STANDARD','BAT');
     e.kill('BULLET',i); e.vx=e.vy=0; e.droppedWeaponToSpawn=null; enemies.push(e);
   }
   this.counts=()=>({enemies:enemies.length,living:enemies.filter(e=>e.isAlive).length,bullets:bullets.length,shots:enemies.reduce((s,e)=>s+(e.gunShotsFired||0),0),voices:synthMusic.activeVoices.size,gameState,queue:waveSpawner.spawnQueue.length});
 },
 instrument() {
   const wrap=(object,key,label)=>{const original=object[key]; object[key]=function(...args){const t=performance.now();try{return original.apply(this,args);}finally{const m=window.__metrics; if(m){(m.calls[label] ||= []).push(performance.now()-t);}}};};
   for(const key of ['findPath','getLocalPatrolRoute','getPatrolExcursion']) wrap(navGraph,key,key);
   for(const key of ['playGunshot','_createNoiseBuffer']) wrap(soundFX,key,'sfx.'+key);
   for(const key of ['renderBackground','renderFixtures','renderForeground']) wrap(mapRenderer,key,key);
   for(const [o,k,n] of [[bloodSystem,'update','bloodUpdate'],[bloodSystem,'render','bloodRender'],[particleSystem,'render','particles'],[postProcessor,'render','postprocess'],[hud,'render','hud']]) wrap(o,k,n);
   const u=updateEnemies;updateEnemies=function(dt){const t=performance.now();u(dt);if(window.__metrics)window.__metrics.calls.enemies.push(performance.now()-t);};
 },
 simulate(frames) { const times=[]; for(let i=0;i<frames;i++){const t=performance.now();updateEnemies(1/60);for(const d of mapData.doors)d.update(1/60);times.push(performance.now()-t);} return times; },
 async retentionSweep() {
   window.__pausePerfFrames=true;
   await new Promise(window.__nativeRaf);
   const results=[]; const saved=enemies; gameState=STATES.PAUSED;
   for(const n of [0,48,96,192,500]) {
     enemies=[];
     for(let i=0;i<n;i++){const e=new Enemy(player.x+(i%20-10)*25,player.y+(Math.floor(i/20)%12-6)*25,'STANDARD','BAT');e.kill('BULLET',i);enemies.push(e);}
     const samples=[];
     for(let i=0;i<150;i++){await new Promise(window.__nativeRaf);const t=performance.now();renderGameWorld(1/60);if(i>=30)samples.push(performance.now()-t);}
     results.push({corpses:n,samples});
   }
   enemies=[];
   for(const n of [0,5000]) {
     bloodSystem.clear();for(let i=0;i<n;i++)bloodSystem.addBloodDrop(player.x+(i%40)*7,player.y+(i%30)*7,4,'#800000');
     const samples=[];for(let i=0;i<150;i++){await new Promise(window.__nativeRaf);const t=performance.now();renderGameWorld(1/60);if(i>=30)samples.push(performance.now()-t);}
     results.push({bloodStamps:n,samples});
   }
   enemies=saved;return results;
 }
};
`;
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:!args.includes('--headed'),args:['--autoplay-policy=no-user-gesture-required']});
 try {
  const browserSession=await browser.newBrowserCDPSession();
  const gpu=await browserSession.send('SystemInfo.getInfo');
  const results={revision:revision||'working-tree',browser:browser.version(),gpu:gpu.gpu,
    fixture:{width:Number(option('--width',1280)),height:Number(option('--height',720)),seconds:Number(option('--seconds',10)),combat:args.includes('--combat'),invulnerablePlayer:true,seed:123456789},scenarios:[]};
  const scenarios=args.includes('--combat')?[[36,96]]:args.includes('--retention')?[[36,0]]:[[5,0],[36,0],[36,500]];
  for(const [count,corpses] of scenarios) {
   const page=await browser.newPage({viewport:{width:Number(option('--width',1280)),height:Number(option('--height',720))}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/js/**', async route=>{
     const relative=new URL(route.request().url()).pathname.slice(1);
     let body;
     if(revision && relative !== 'js/entities/world_cleanup.js') body=cp.execFileSync('git',['show',revision+':'+relative],{encoding:'utf8',maxBuffer:8e6});
     else body=fs.readFileSync(path.join(__dirname,'..',relative),'utf8');
     if(relative==='js/main.js') { if(!body.includes('  // Boot & Start'))throw Error('Missing probe anchor');body=body.replace('  // Boot & Start',bridge+'\n  // Boot & Start'); }
     await route.fulfill({contentType:'text/javascript',body});
   });
   await page.addInitScript(()=>{
     let seed=123456789;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
     const raf=requestAnimationFrame;window.__nativeRaf=raf;let last;
     window.requestAnimationFrame=callback=>raf(time=>{if(window.__pausePerfFrames)return;const t=performance.now();callback(time);if(window.__metrics){window.__metrics.work.push(performance.now()-t);if(last)window.__metrics.intervals.push(time-last);}last=time;});
   });
   await page.goto(option('--url','http://127.0.0.1:8097/'));
   await page.waitForFunction(()=>window.__perf?.ready());
   await page.evaluate(([count,corpses,combat])=>{window.__perf.setup(count,corpses,combat);window.__perf.instrument();},[count,corpses,args.includes('--combat')]);
   await page.waitForTimeout(2000);
   const session=await page.context().newCDPSession(page);
   if(args.includes('--cpu-profile')) {await session.send('Profiler.enable');await session.send('Profiler.start');}
   await page.evaluate(()=>window.__metrics={work:[],intervals:[],calls:{enemies:[]}});
   await page.waitForTimeout(Number(option('--seconds',10))*1000);
   const metrics=await page.evaluate(()=>{const m=window.__metrics;window.__metrics=null;return {...m,counts:window.__perf.counts(),heap:performance.memory?.usedJSHeapSize};});
   if(args.includes('--cpu-profile')) {const {profile}=await session.send('Profiler.stop');fs.writeFileSync(option('--out','profile.json')+'.cpuprofile',JSON.stringify(profile));}
   const simulation=await page.evaluate(()=>window.__perf.simulate(600));
   if(args.includes('--retention')) results.retention=(await page.evaluate(()=>window.__perf.retentionSweep())).map(({samples,...fixture})=>({...fixture,work:summary(samples)}));
   results.scenarios.push({count,corpses,counts:metrics.counts,heap:metrics.heap,work:summary(metrics.work),intervals:summary(metrics.intervals),over25ms:metrics.intervals.filter(x=>x>25).length,calls:Object.fromEntries(Object.entries(metrics.calls).map(([k,v])=>[k,summary(v)])),simulation:summary(simulation),errors});
   console.log(JSON.stringify(results.scenarios.at(-1)));
   if(errors.length)throw Error(errors.join('\n'));
   if(metrics.counts.living!==count || metrics.counts.gameState!=='PLAYING')throw Error('Stress fixture lost its active actors');
   if(args.includes('--combat') && !metrics.counts.shots)throw Error('Combat fixture did not fire');
   await page.close();
  }
  if(results.retention) console.log(JSON.stringify({retention:results.retention}));
  if(option('--out',null))fs.writeFileSync(option('--out'),JSON.stringify(results,null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
