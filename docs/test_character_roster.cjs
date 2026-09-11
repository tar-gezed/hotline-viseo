const {chromium}=require('C:/Users/Quentin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({headless:true});try{
  const p=await b.newPage({viewport:{width:1400,height:900}}),errors=[];p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://localhost:8080/character_review.html');await p.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
  await p.screenshot({path:'docs/character-roster-comparison.png',fullPage:true});
  const result=[];
  for(let i=0;i<7;i++){
   await p.goto('http://localhost:8080/');await p.waitForFunction(()=>window.activeMapLabel);
   await p.evaluate(()=>{window.rosterTest={};const render=Player.prototype.render;Player.prototype.render=function(...a){rosterTest.player=this;return render.apply(this,a);};});
   await p.keyboard.press(String(i+1));await p.screenshot({path:`docs/character-menu-${i+1}.png`});
   await p.keyboard.press('Enter');await p.waitForFunction(()=>window.rosterTest.player);
   const actual=await p.evaluate(()=>{const p=rosterTest.player;p.isInvulnerable=true;const ch=p.character;return {name:ch.name,weapon:p.currentWeapon.id,ammo:p.ammo,expectedWeapon:ch.perks.startWeapon,expectedAmmo:ch.perks.startAmmo};});
   assert.equal(actual.weapon,actual.expectedWeapon);assert.equal(actual.ammo,actual.expectedAmmo);result.push(actual);
   await p.screenshot({path:`docs/character-game-${i+1}.png`});
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify(result));console.log('PASS seven menu selections and actual in-game starting weapons/ammo; no JS errors');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
