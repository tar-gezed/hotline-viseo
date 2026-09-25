'use strict';
// Invoked by the real two-peer MQTT/WebRTC acceptance. Only test pages receive
// fixtures; gameplay continues through the production host loop and inputs.
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function validateRevive([host,client],output){
  await host.evaluate(()=>{
    const t=window.__mpTest;t.clear();t.spawner.state='PREWAVE';t.spawner.preWaveTimer=100;
    for(const p of t.players.values()) { const at=t.mp.spawns[p.playerId];Object.assign(p,{x:at.x,y:at.y,vx:0,vy:0,isInvulnerable:false,respawnShield:0}); }
    const simulate=t.mp.b.simulate;
    t.mp.b.simulate=dt=>{simulate(dt);t.players.get(1).takeHit({type:'TEST'});t.mp.b.simulate=simulate;};
  });
  await client.waitForFunction(()=>window.__mpTest.player.isDowned);
  const state=await client.evaluate(()=>({alive:window.__mpTest.player.isAlive,timer:window.__mpTest.player.downedTimer,spectated:window.__mpTest.mp.spectated}));
  assert(state.alive&&state.timer>23&&state.timer<=25);assert.equal(state.spectated,null);
  // Downed inputs retain movement while attacks and inventory are unavailable.
  const before=await client.evaluate(()=>({x:window.__mpTest.player.x,y:window.__mpTest.player.y,ammo:window.__mpTest.player.ammo,weapon:window.__mpTest.player.currentWeapon.id}));
  await client.keyboard.down('KeyW');await client.mouse.down();await client.keyboard.press('KeyE');await client.waitForTimeout(300);
  await client.keyboard.up('KeyW');await client.mouse.up();await client.waitForTimeout(250);
  const after=await host.evaluate(()=>{const p=window.__mpTest.players.get(1);return {x:p.x,y:p.y,ammo:p.ammo,weapon:p.currentWeapon.id,state:p.state};});
  assert(Math.hypot(before.x-after.x,before.y-after.y)>3);assert(Math.hypot(before.x-after.x,before.y-after.y)<30);
  assert.equal(after.ammo,before.ammo);assert.equal(after.weapon,before.weapon);assert.equal(after.state,'DOWNED');
  await host.evaluate(()=>{const t=window.__mpTest,p=t.players.get(1),at=t.mp.spawns[1];p.x=at.x;p.y=at.y;p.vx=p.vy=0;t.mp.needsReliable=true;});
  await host.keyboard.down('Space');
  await client.waitForFunction(()=>window.__mpTest.player.reviveProgress>.3);
  await host.keyboard.up('Space');
  await client.waitForFunction(()=>window.__mpTest.player.isDowned&&window.__mpTest.player.reviveProgress===0);
  const inventory=await host.evaluate(()=>({weapon:window.__mpTest.player.currentWeapon.id,thrown:window.__mpTest.mp.b.getWorld().thrownWeapons.length}));
  await host.keyboard.down('KeyE');
  await client.waitForFunction(()=>window.__mpTest.player.reviveProgress>.5);
  assert(await client.evaluate(()=>window.__mpTest.player.isDowned));
  await client.screenshot({path:path.join(output,'revive-client.png')});
  await host.screenshot({path:path.join(output,'revive-host.png')});
  await client.waitForFunction(()=>!window.__mpTest.player.isDowned&&window.__mpTest.player.isInvulnerable);
  await host.keyboard.up('KeyE');
  assert.equal(await host.evaluate(()=>window.__mpTest.player.revives),1);
  assert.deepEqual(await host.evaluate(()=>({weapon:window.__mpTest.player.currentWeapon.id,thrown:window.__mpTest.mp.b.getWorld().thrownWeapons.length})),inventory);
  assert.equal(await client.evaluate(()=>window.__mpTest.player.ammo),before.ammo);
  // Reverse roles: the client holds a real Gamepad API A state and the host
  // arbitrates its own recovery. This also exercises held bits over fallback.
  await host.evaluate(()=>{const t=window.__mpTest,simulate=t.mp.b.simulate;t.mp.b.simulate=dt=>{simulate(dt);t.player.isInvulnerable=false;t.player.takeHit({type:'TEST'});t.mp.b.simulate=simulate;};});
  await client.waitForFunction(()=>window.__mpTest.players.get(0).isDowned);
  await client.evaluate(()=>{window.__pad.buttons[0]={pressed:true,value:1};});
  await host.waitForFunction(()=>window.__mpTest.player.reviveProgress>.2);
  await host.waitForFunction(()=>!window.__mpTest.player.isDowned&&window.__mpTest.player.isInvulnerable);
  await client.evaluate(()=>{window.__pad.buttons[0]={pressed:false,value:0};});
  assert.equal(await host.evaluate(()=>window.__mpTest.players.get(1).revives),1);
  // Cover all seven silhouettes, aim directions and crawling poses. Solid
  // sprite pixels are unchanged; every outline pixel lies within three pixels
  // of a real sprite pixel, excluding the old arbitrary ellipse.
  const review=await client.evaluate(async()=>{
    const {PlayerPresentation}=await import('./js/network/player_presentation.js');
    const draw=new PlayerPresentation(),canvas=document.createElement('canvas');canvas.width=canvas.height=160;
    const c=canvas.getContext('2d');let samples=0;
    for(const mask of Object.keys(CONFIG.MASKS))for(const angle of [0,1.2,3.1])for(const downed of [false,true]) {
      c.clearRect(0,0,160,160);const p=new Player(80,80,mask);p.angle=angle;p.isDowned=downed;
      draw.draw(c,p,'#00f3ff');
      const sprite=draw.spriteContext.getImageData(0,0,160,160).data,edge=draw.edgeContext.getImageData(0,0,160,160).data,result=c.getImageData(0,0,160,160).data;
      let border=0;
      for(let y=0;y<160;y++)for(let x=0;x<160;x++) {
        const i=(y*160+x)*4;
        if(sprite[i+3]===255 && [0,1,2].some(k=>sprite[i+k]!==result[i+k]))throw Error('Outline recolors the sprite interior');
        if(edge[i+3]<20)continue;border++;
        let near=false;for(let dy=-3;dy<=3&&!near;dy++)for(let dx=-3;dx<=3;dx++)if(x+dx>=0&&x+dx<160&&y+dy>=0&&y+dy<160&&sprite[((y+dy)*160+x+dx)*4+3]>0){near=true;break;}
        if(!near)throw Error('Outline does not follow the sprite');
      }
      if(border<20)throw Error('Missing outline');samples++;
    }
    const sheet=document.createElement('canvas');sheet.width=1120;sheet.height=420;const art=sheet.getContext('2d');art.fillStyle='#252135';art.fillRect(0,0,1120,420);
    for(const [i,mask] of Object.keys(CONFIG.MASKS).entries()) {
      art.fillStyle='#e9dfef';art.textAlign='center';art.font='bold 15px monospace';art.fillText(CONFIG.MASKS[mask].name,i*160+80,35);
      for(const downed of [false,true]) {art.save();art.translate(i*160+80,downed?305:135);art.scale(2.2,2.2);const p=new Player(0,0,mask);p.angle=-Math.PI/2;p.isDowned=downed;draw.draw(art,p,['#00f3ff','#ff007f','#39ff14','#ffe600','#ff7700'][i%5]);art.restore();}
    }
    return {samples,image:sheet.toDataURL('image/png')};
  });
  require('node:fs').writeFileSync(path.join(output,'player-outlines.png'),Buffer.from(review.image.split(',')[1],'base64'));
  assert.equal(review.samples,42);
  console.log('PASS 25s DOWNED, crawl, rescue release, host E/client gamepad rescue, inventory protection and 42 silhouette pixel checks');
};
