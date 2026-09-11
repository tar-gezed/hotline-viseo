const {chromium}=require('C:/Users/Quentin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];p.setDefaultTimeout(15000);
  p.on('pageerror',e=>errors.push(e.message));await p.goto('http://localhost:8080/');await p.waitForFunction(()=>window.activeMapLabel);
  await p.evaluate(()=>{
   window.passageTest={};const render=Player.prototype.render,show=ScoreScreen.prototype.show;
   Player.prototype.render=function(...args){passageTest.player=this;return render.apply(this,args);};
   ScoreScreen.prototype.show=function(...args){passageTest.scoreShown=(passageTest.scoreShown||0)+1;return show.apply(this,args);};
   Enemy.prototype.update=function(){}; // Isolate movement/UI from enemy attacks.
  });
  await p.keyboard.press('Enter');await p.waitForFunction(()=>passageTest.player);
  for(const side of [-1,1]){
   await p.evaluate(side=>{
    const d=MapData.doors.find(d=>d.id==='door_2'),actor=passageTest.player;d.reset();
    const nx=-Math.sin(d.baseAngle),ny=Math.cos(d.baseAngle),mx=d.x+Math.cos(d.baseAngle)*d.length/2,my=d.y+Math.sin(d.baseAngle)*d.length/2;
    Object.assign(actor,{x:mx+nx*side*50,y:my+ny*side*50,vx:0,vy:0,isInvulnerable:true});
    passageTest.cross={nx,ny,mx,my,side};
   },side);
   const key=side===1?'KeyD':'KeyA';await p.keyboard.down(key);
   await p.waitForFunction(()=>{const a=passageTest.player,c=passageTest.cross;return ((a.x-c.mx)*c.nx+(a.y-c.my)*c.ny)*c.side < -25;});
   await p.keyboard.up(key);assert.equal(await p.evaluate(()=>passageTest.player.isAlive),true);
  }
  await p.screenshot({path:'docs/red-door-passage.png'});console.log('PASS real player crosses red-framed door both ways without kick');
  await p.evaluate(()=>{passageTest.original=passageTest.player;passageTest.player.isInvulnerable=false;passageTest.player.takeHit({type:'BULLET'});});
  await p.waitForTimeout(600);await p.keyboard.press('Space');
  await p.waitForFunction(()=>passageTest.scoreShown===1);
  assert.equal(await p.evaluate(()=>passageTest.player===passageTest.original&&!passageTest.player.isAlive),true);
  await p.screenshot({path:'docs/space-shows-scores.png'});
  console.log('PASS Space opens scores, no new player/run');
  // Restart remains usable from the score screen.
  await p.waitForTimeout(500);await p.keyboard.press('Enter');
  await p.waitForFunction(()=>passageTest.player!==passageTest.original&&passageTest.player.isAlive);
  assert.deepEqual(errors,[]);console.log('PASS restart from scores; no browser errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
