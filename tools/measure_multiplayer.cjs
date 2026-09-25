'use strict';
// Optional workload on the real five-context acceptance room. The overrides
// below live only in Playwright pages and never in production modules.
module.exports=async function measure(squad,output){
  const fs=require('node:fs'),path=require('node:path');
  const host=squad[0];
  const profiler=process.env.MP_PROFILE?await host.context().newCDPSession(host):null;
  if(profiler){await profiler.send('Profiler.enable');await profiler.send('Profiler.start');}
  await host.evaluate(()=>{
    const t=window.__mpTest,w=t.spawner;w.state='PREWAVE';w.preWaveTimer=100;w.spawnQueue=[];t.clear();
    window.__randomBeforeMeasure=Math.random;let seed=41523;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
    for(const p of t.players.values()){p.isInvulnerable=true;p.equipWeapon('UZI',10000);}
    const points=w.spawnPoints;
    for(let i=0;i<36;i++){const at=points[i%points.length];const e=new Enemy(at.x,at.y,'STANDARD','UZI');e.takeHit=()=>{};e.configurePatrol(t.mp.b.navGraph,at.patrol);t.addEnemy(e);}
    const d=t.mp.b.mapData.doors[0];window.__originalDoorUpdate=d.update;d.update=function(){this.angle=this.baseAngle+Math.sin(t.stats.elapsedTime*2)*.7;this.angularVelocity=Math.cos(t.stats.elapsedTime*2)*1.4;this.isDangerous=false;};
  });
  await Promise.all(squad.map(p=>p.waitForTimeout(500)));
  for(const p of squad)await p.evaluate(()=>{
    const t=window.__mpTest,m=t.mp,stats=window.__metrics={frames:[],cpu:[],sync:[],simulate:[],draw:[],bytes:[],doorFrames:0,doorFrozen:0,bulletFrames:0,bulletFrozen:0};
    const tick=m.tick.bind(m),sample=m.sync.sample.bind(m.sync),send=m.network.realtimeSend.bind(m.network);let lastTime=performance.now(),lastDoor,lastBullets=new Map();
    const simulate=m.b.simulate,draw=m.b.render;
    m.b.simulate=(...args)=>{const start=performance.now();const result=simulate(...args);stats.simulate.push(performance.now()-start);return result;};
    m.b.render=(...args)=>{const start=performance.now();const result=draw(...args);stats.draw.push(performance.now()-start);return result;};
    window.__measureUndo=()=>{m.tick=tick;m.sync.sample=sample;m.network.realtimeSend=send;m.b.simulate=simulate;m.b.render=draw;};
    m.sync.sample=(...args)=>{const before=performance.now();const result=sample(...args);stats.sync.push(performance.now()-before);return result;};
    m.network.realtimeSend=(kind,data)=>{if(kind==='snapshot')stats.bytes.push(JSON.stringify(data).length);return send(kind,data);};
    m.tick=(...args)=>{
      const now=performance.now();stats.frames.push(now-lastTime);lastTime=now;tick(...args);stats.cpu.push(performance.now()-now);
      const d=m.b.mapData.doors[0],angle=d.renderAngle??d.angle;
      if(lastDoor!==undefined){stats.doorFrames++;if(Math.abs(angle-lastDoor)<.000001)stats.doorFrozen++;}lastDoor=angle;
      const tracks=m.sync.projectiles?.tracks||m.sync.cache;
      for(const [key,value] of tracks){if(!m.sync.projectiles&&!key.startsWith('b:'))continue;const e=value.bullet||value;const prev=lastBullets.get(key);if(prev&&Math.hypot(e.vx||0,e.vy||0)>100){stats.bulletFrames++;if(Math.hypot(e.x-prev.x,e.y-prev.y)<.001)stats.bulletFrozen++;}lastBullets.set(key,{x:e.x,y:e.y});}
      for(const key of lastBullets.keys())if(!tracks.has(key))lastBullets.delete(key);
    };
  });
  for(const p of squad){await p.mouse.move(900,360);await p.mouse.down();}
  await host.waitForTimeout(7000);
  for(const p of squad)await p.mouse.up();
  if(profiler){const {profile}=await profiler.send('Profiler.stop');fs.writeFileSync(path.join(output,'host.cpuprofile'),JSON.stringify(profile));await profiler.detach();}
  const report=await Promise.all(squad.map(p=>p.evaluate(()=>{
    const t=window.__mpTest,m=window.__metrics,percentile=(a,q)=>a.slice().sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*q))]||0;
    window.__measureUndo();
    return {slot:t.mp.network.slot,frames:m.frames.length,fps:1000/(m.frames.reduce((a,b)=>a+b,0)/m.frames.length),frameP95:percentile(m.frames,.95),cpuP95:percentile(m.cpu,.95),simulateStepP95:percentile(m.simulate,.95),drawP95:percentile(m.draw,.95),syncP95:percentile(m.sync,.95),snapshotMeanBytes:m.bytes.length?m.bytes.reduce((a,b)=>a+b,0)/m.bytes.length:0,snapshotMaxBytes:Math.max(0,...m.bytes),doorFrozenRatio:m.doorFrozen/Math.max(1,m.doorFrames),bulletFrozenRatio:m.bulletFrozen/Math.max(1,m.bulletFrames),bulletSamples:m.bulletFrames,fast:[...t.mp.network.fast.values()].filter(c=>c.readyState==='open').length};
  })));
  // Keep all five transports and simulations running, but draw one viewport.
  // This isolates shared-machine Canvas contention; it is not a claim that
  // the peers ran on separate physical computers.
  if(process.env.MP_ISOLATE)for(const focus of [0,1]){
    for(const [slot,p] of squad.entries())await p.evaluate(({slot,focus})=>{
      const m=window.__mpTest.mp,render=m.b.render,tick=m.tick.bind(m),stats=window.__isolated={interval:[],work:[]};let last=performance.now();
      if(slot!==focus)m.b.render=()=>{};
      m.tick=(...args)=>{const start=performance.now();stats.interval.push(start-last);last=start;tick(...args);stats.work.push(performance.now()-start);};
      window.__isolateUndo=()=>{m.b.render=render;m.tick=tick;};
    },{slot,focus});
    for(const p of squad)await p.mouse.down();
    await host.waitForTimeout(5000);
    for(const p of squad)await p.mouse.up();
    const isolated=await squad[focus].evaluate(()=>{
      const m=window.__isolated,p95=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length*.95)];
      return {slot:window.__mpTest.mp.network.slot,fps:1000/(m.interval.reduce((a,b)=>a+b,0)/m.interval.length),frameP95:p95(m.interval),cpuP95:p95(m.work)};
    });
    for(const p of squad)await p.evaluate(()=>window.__isolateUndo());
    fs.writeFileSync(path.join(output,'performance-one-viewport-'+focus+'.json'),JSON.stringify(isolated,null,2));
    console.log('One viewport, five active peers',JSON.stringify(isolated));
  }
  await host.evaluate(()=>{const t=window.__mpTest;t.mp.b.mapData.doors[0].update=window.__originalDoorUpdate;Math.random=window.__randomBeforeMeasure;t.clear();});
  fs.writeFileSync(path.join(output,'performance-'+(process.env.MP_MEASURE||'current')+'.json'),JSON.stringify(report,null,2));
  console.log('Five-player rendering measurement',JSON.stringify(report));
};
