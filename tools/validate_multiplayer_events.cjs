'use strict';
// Called inside the five-peer acceptance room; exercises ordinary host handlers
// and client renderers over actual WebRTC, not a mock event transport.
const assert=require('node:assert/strict');
module.exports=async function audit(squad){
  const host=squad[0],clients=squad.slice(1);
  for(const p of clients)await p.evaluate(()=>{
    const m=window.__mpTest.mp,events=m.presentation.replay.bind(m.presentation),sample=m.sync.projectiles.sample.bind(m.sync.projectiles);
    window.__eventAudit={methods:[],owners:[]};
    m.presentation.replay=e=>{window.__eventAudit.methods.push(e.method);return events(e);};
    m.sync.projectiles.sample=(...args)=>{const result=sample(...args);for(const t of m.sync.projectiles.tracks.values())if(t.shown&&!window.__eventAudit.owners.includes(t.owner))window.__eventAudit.owners.push(t.owner);return result;};
    window.__eventUndo=()=>{m.presentation.replay=events;m.sync.projectiles.sample=sample;};
  });
  await host.evaluate(()=>{
    const t=window.__mpTest;t.clear();t.spawner.preWaveTimer=100;
    for(const p of t.players.values()){p.isInvulnerable=true;p.equipWeapon('PISTOL',5);}
    for(const slot of [0,1,2]){const p=t.players.get(slot);p.attackCooldown=0;t.attack(p,{worldMouseX:p.x+200,worldMouseY:p.y,vibrate(){}});}
  });
  for(const p of clients)await p.waitForFunction(()=>[0,1,2].every(id=>window.__eventAudit.owners.includes(id)));
  await host.evaluate(()=>{const t=window.__mpTest;t.mp.b.mapData.glassPartitions[0].reset();t.mp.needsReliable=true;});
  for(const p of clients)await p.waitForFunction(()=>!window.__mpTest.mp.b.mapData.glassPartitions[0].shattered);
  await host.evaluate(()=>{
    const t=window.__mpTest,p=t.players.get(1),g=t.mp.b.mapData.glassPartitions[0],old={x:p.x,y:p.y,vx:p.vx,vy:p.vy};
    Object.assign(p,{x:(g.x1+g.x2)/2,y:(g.y1+g.y2)/2,vx:p.baseSpeed,vy:0});t.glass(p);Object.assign(p,old);
  });
  for(const p of clients)await p.waitForFunction(()=>window.__mpTest.mp.b.mapData.glassPartitions[0].shattered&&window.__eventAudit.methods.includes('shatterGlass')&&window.__eventAudit.methods.includes('playGlassShatter'));
  await host.evaluate(()=>{
    const t=window.__mpTest,p=t.players.get(1);t.clear();t.addWeapon(p.x,p.y,'MAGNUM',2);t.pickup(p,{vibrate(){}});
    t.spawner._spawnInterWaveSupplies();
    const crate=t.spawner.supplyCrates[0];if(!crate)throw Error('No supply fixture');
    for(const slot of [1,0,2,3,4]){
      const actor=t.players.get(slot),at={x:actor.x,y:actor.y};actor.equipWeapon('PISTOL',0);Object.assign(actor,{x:crate.x,y:crate.y});
      t.supply(actor);Object.assign(actor,at);
      if(actor.ammo<=0)throw Error('No ammo for P'+(slot+1));
    }
    if(crate.claimedMask!==31)throw Error('Missing per-player claim');
    // Separate fresh cache to verify the client's actual shared renderer label.
    t.spawner._spawnInterWaveSupplies();t.mp.needsReliable=true;
  });
  for(const p of clients){
    await p.waitForFunction(()=>window.__eventAudit.methods.includes('addFloatingText')&&window.__eventAudit.methods.includes('playWeaponPickup')&&window.__eventAudit.methods.includes('playAmmoRefill')&&window.__mpTest.spawner.supplyCrates.length>0);
    assert(await p.evaluate(()=>{
      const labels=[],ctx=new Proxy({fillText:s=>labels.push(s)},{get:(o,k)=>o[k]||(()=>{})});
      window.__mpTest.spawner.supplyCrates[0].render(ctx,window.__mpTest.mp.network.slot);return labels.includes('AMMO')&&labels.includes('RAVITAILLEMENT');
    }));
  }
  await host.evaluate(()=>{
    const t=window.__mpTest,p=t.players.get(1);t.clear();const e=new Enemy(p.x,p.y,'STANDARD','BAT');e.state='KNOCKED_DOWN';e.knockdownTimer=10;t.addEnemy(e);t.execute(e,p,{vibrate(){}});
  });
  for(const p of clients)await p.waitForFunction(()=>window.__eventAudit.methods.includes('addScorePopup')&&window.__eventAudit.methods.includes('groundExecution')&&window.__eventAudit.methods.includes('playExecution'));
  await host.evaluate(()=>{window.__mpTest.clear();window.__mpTest.spawner.supplyCrates=[];});
  for(const p of clients)await p.evaluate(()=>window.__eventUndo());
  console.log('PASS P1/P2/P3 visible projectiles, body glass debris/audio, pickup/execution feedback, five refills and client AMMO labels');
};
