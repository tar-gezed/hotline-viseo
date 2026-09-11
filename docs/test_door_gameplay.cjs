const {chromium}=require('C:/Users/Quentin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({headless:true});
 try {
  const p=await b.newPage({viewport:{width:1400,height:900}}),errors=[];
  p.setDefaultTimeout(15000);
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://localhost:8080/');await p.waitForFunction(()=>window.activeMapLabel);
  await p.evaluate(()=>{
   window.doorTest={enemies:[]};
   const er=Enemy.prototype.render,pr=Player.prototype.render;
   Enemy.prototype.render=function(...args){if(!doorTest.enemies.includes(this))doorTest.enemies.push(this);return er.apply(this,args);};
   Player.prototype.render=function(...args){doorTest.player=this;return pr.apply(this,args);};
  });
  console.log('map loaded');await p.keyboard.press('Enter');await p.waitForFunction(()=>doorTest.player && doorTest.enemies.length>0);
  console.log('actors loaded');
  await p.evaluate(()=>{
   const player=doorTest.player;player.isInvulnerable=true;
   // Freeze AI only in this isolated test, so the real door update, death
   // bookkeeping and wave transition can be exercised without gunfire.
   Enemy.prototype.update=function(){};
   window.waveSpawner.spawnQueue=[];window.waveSpawner.enemiesSpawned=Math.max(1,window.waveSpawner.enemiesSpawned);window.waveSpawner.state='IN_PROGRESS';
   for(const e of doorTest.enemies.slice(1))e.die({type:'BULLET',angle:0});
   const victim=doorTest.enemies[0];victim.x=player.x+100;victim.y=player.y+100;
   const d=new Doors.Door({x:victim.x-40,y:victim.y-18,length:60});MapData.doors.push(d);
   player.mask='DON_JUAN';d.kick(player,0,1,34);doorTest.victim=victim;doorTest.door=d;
  });
  console.log('kick armed');
  await p.waitForFunction(()=>!doorTest.victim.isAlive && window.waveSpawner.state==='INTERMISSION').catch(async e=>{console.log(await p.evaluate(()=>({alive:doorTest.victim.isAlive,hp:doorTest.victim.hp,state:doorTest.victim.state,pos:[doorTest.victim.x,doorTest.victim.y],door:[doorTest.door.x,doorTest.door.y,doorTest.door.angle,doorTest.door.kickTime],wave:window.waveSpawner.state,enemies:doorTest.enemies.map(e=>[e.isAlive,e.state,e.hp])})));throw e;});
  assert.equal(await p.evaluate(()=>doorTest.victim.state),'DEAD');
  await p.evaluate(()=>{window.waveSpawner.intermissionTimer=0.01;});
  await p.waitForFunction(()=>window.waveSpawner.currentWave===2);
  // Render the actual shared sprites at gameplay size and magnified for critique.
  await p.evaluate(()=>{
   const c=document.createElement('canvas');c.id='doorReview';c.width=1200;c.height=440;
   c.style='position:fixed;inset:0;z-index:9999;width:1200px;height:440px';document.body.append(c);
   const ctx=c.getContext('2d');ctx.fillStyle='#302b40';ctx.fillRect(0,0,1200,440);
   const captions=['ASSOMMÉ — VIVANT','TUÉ PAR PORTE','TUÉ PAR ARME'];
   for(let i=0;i<3;i++){
    const e=new Enemy(0,0);if(i===0)e.onDoorSlam({lastKickedBy:{mask:'RICHARD'}},1,1,0);
    else if(i===1)e.onDoorSlam({lastKickedBy:{mask:'DON_JUAN'}},1,1,0);
    else e.takeHit({type:'BULLET',angle:0});
    ctx.fillStyle='#f5e8d2';ctx.font='bold 18px monospace';ctx.textAlign='center';ctx.fillText(captions[i],200+i*400,36);
    ctx.save();ctx.translate(200+i*400,130);e.render(ctx);ctx.restore();
    ctx.save();ctx.translate(200+i*400,315);ctx.scale(3,3);e.render(ctx);ctx.restore();
   }
  });
  await p.locator('#doorReview').screenshot({path:'docs/door-states-review.png'});
  assert.deepEqual(errors,[]);console.log('PASS real game door death, intermission, wave 2, sprite review; no browser errors');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
