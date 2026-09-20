'use strict';
// Compare optimized rendering with the pre-optimization implementation.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const reference = process.env.PERF_REFERENCE || '84afbfb';
const bridge = `
window.__visual = {
 ready:()=>!!waveSpawner && !!navGraph,
 setup() {
   window.__seed=42;startNewGame('vincent');synthMusic.stop();gameState=STATES.PAUSED;
   enemies=[];
   for(const p of mapData.spawnLocations) for(let i=0;i<6;i++) {
     const e=new Enemy(p.x+i*30,p.y+i*10,['STANDARD','HEAVY','DOG'][i%3],'BAT');
     if(i%2)e.kill('BULLET',i);enemies.push(e);
   }
 },
 render(x,y,roll,zoom,fx=false) {
   camera.x=x;camera.y=y;camera.roll=roll;camera.zoom=zoom;
   camera.shakeRoll=.035;camera.shakeOffsetX=15;camera.shakeOffsetY=-12;
   postProcessor.glitchActive=fx;postProcessor.glitchY=100.5;postProcessor.glitchHeight=12.5;postProcessor.glitchOffset=-7.5;
   postProcessor.currentAberration=fx?5:0;postProcessor.crtEnabled=fx;
   postProcessor.flashTimer=fx ? .1 : 0;postProcessor.flashDuration=.2;postProcessor.flashAlpha=.3;
   const clock=performance.now,wallClock=Date.now;performance.now=Date.now=()=>1000;
   try {renderGameWorld(0);return canvas.toDataURL();} finally {performance.now=clock;Date.now=wallClock;}
 },
 pickupPreview() {
   floorWeapons=[];particleSystem.clear();
   spawnFloorWeapon(player.x,player.y,'pistol');handlePlayerRightClick();
   particleSystem.update(.2);
   return this.render(player.x,player.y,0,1);
 },
 supplies() {
   floorWeapons=[];waveSpawner.currentWave=3;
   const p={x:player.x+10,y:player.y};waveSpawner.onSupplySpawned(p);
   const unopened=floorWeapons[0];
   waveSpawner.supplyCrates=[{id:'test',...p,weapon:'shotgun',isOpened:false}];
   checkSupplyCrateInteractions();const opened=floorWeapons[1];
   const authored=spawnFloorWeapon(player.x+300,player.y,'bat');
   waveSpawner.onWaveStart(4,21);const at4=floorWeapons.length;
   waveSpawner.onWaveStart(5,34);
   const after=floorWeapons.includes(authored)&&!floorWeapons.includes(unopened)&&!floorWeapons.includes(opened);
   // Picking up a supply and dropping it again removes the unused-supply tag.
   floorWeapons=[];waveSpawner.currentWave=5;waveSpawner.onSupplySpawned({x:player.x,y:player.y});
   handlePlayerRightClick();
   const reused=spawnFloorWeapon(player.x,player.y,player.currentWeapon,player.ammo);
   waveSpawner.onWaveStart(7,89);
   return {at4,after,reused:floorWeapons.includes(reused)};
 }
};
`;
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const captures=[];const errors=[];
  for(const baseline of [true,false]) {
   const page=await browser.newPage({viewport:{width:1280,height:720}});
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{window.requestAnimationFrame=()=>1;window.__seed=42;Math.random=()=>{window.__seed=(1664525*window.__seed+1013904223)>>>0;return window.__seed/4294967296;};});
   await page.route('**/js/**',route=>{
     const relative=new URL(route.request().url()).pathname.slice(1);
     let body=baseline&&relative!=='js/entities/world_cleanup.js'?cp.execFileSync('git',['show',reference+':'+relative],{encoding:'utf8',maxBuffer:8e6}):fs.readFileSync(path.join(__dirname,'..',relative),'utf8');
     if(relative==='js/main.js')body=body.replace('  // Boot & Start',bridge+'\n  // Boot & Start');
     return route.fulfill({contentType:'text/javascript',body});
   });
   await page.goto(process.env.PERF_TEST_URL||'http://127.0.0.1:8097/');
   await page.waitForFunction(()=>window.__visual?.ready(),null,{polling:100});
   await page.evaluate(()=>window.__visual.setup());
   const images=[];
   for(const [width,height] of [[1280,720],[3440,1440],[1153,721]]) {
    await page.setViewportSize({width,height});
    // Resize listeners run asynchronously; let them settle before capture.
    await page.waitForTimeout(100);
    for(const fixture of [[2150,1480,0,1],[900,500,.3,.75],[1500,1000,-.2,1.5],[400,300,Math.PI/2,1],[2150,1480,.1,1,true]]) {
     images.push(await page.evaluate(f=>window.__visual.render(...f),fixture));
    }
   }
   captures.push(images);
   if(!baseline) {
     assert.deepEqual(await page.evaluate(()=>window.__visual.supplies()),{at4:3,after:true,reused:true});
     await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(100);
     const preview=await page.evaluate(()=>window.__visual.pickupPreview());
     const output=path.join(__dirname,'../test-results/performance');fs.mkdirSync(output,{recursive:true});
     fs.writeFileSync(path.join(output,'pickup-after.png'),Buffer.from(preview.split(',')[1],'base64'));
   }
   await page.close();
  }
  for(let i=0;i<captures[0].length;i++)if(captures[1][i]!==captures[0][i]) {
    const output=path.join(__dirname,'../test-results/performance');fs.mkdirSync(output,{recursive:true});
    for(let j=0;j<2;j++)fs.writeFileSync(path.join(output,'visual-'+i+'-'+j+'.png'),Buffer.from(captures[j][i].split(',')[1],'base64'));
    const probe=await browser.newPage();
    const difference=await probe.evaluate(async images=>{
      const data=[];
      for(const src of images){const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);data.push(ctx.getImageData(0,0,c.width,c.height));}
      let count=0,max=0,minX=Infinity,minY=Infinity,maxX=0,maxY=0;
      for(let p=0;p<data[0].data.length;p+=4){let changed=false;for(let ch=0;ch<4;ch++){const d=Math.abs(data[0].data[p+ch]-data[1].data[p+ch]);max=Math.max(max,d);changed ||= d>0;}if(changed){count++;const x=p/4%data[0].width,y=Math.floor(p/4/data[0].width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}
      return {count,max,minX,minY,maxX,maxY};
    },[captures[0][i],captures[1][i]]);
    await probe.close();
    assert.equal(difference.count,0,'World fixture '+i+' pixel differences: '+JSON.stringify(difference));
  }
  assert.deepEqual(errors,[]);
  console.log('PASS 15 pixel-identical world renders (roll, shake, zoom, odd sizes, ultrawide, postprocessing), real supply expiry and pickup reuse');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message.slice(0,2000));process.exitCode=1;});
