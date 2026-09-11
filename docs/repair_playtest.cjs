const {chromium}=require('C:/Users/Quentin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:8080');
 await page.evaluate(()=>{
  window.observe={enemies:[],player:null,kills:0};
  const er=Enemy.prototype.render;Enemy.prototype.render=function(...a){if(!observe.enemies.includes(this))observe.enemies.push(this);return er.apply(this,a)};
  const pr=Player.prototype.render;Player.prototype.render=function(...a){observe.player=this;return pr.apply(this,a)};
  window.reviewNav=new Pathfinding.NavGraph(MapData);
 });
 await page.screenshot({path:path.join(__dirname,'repair-menu.png')});
 await page.keyboard.press('Enter');
 await page.waitForTimeout(500);
 await page.screenshot({path:path.join(__dirname,'repair-ready.png')});
 await page.keyboard.press('e'); await page.waitForTimeout(150);
 console.log('Initial pickup',await page.evaluate(()=>({weapon:observe.player?.currentWeapon?.id,ammo:observe.player?.ammo})));
 await page.keyboard.press('F2');await page.screenshot({path:path.join(__dirname,'repair-debug.png')});await page.keyboard.press('F2');
 let held=new Set(),bestKills=-1;
 for(let i=0;i<200;i++){
  const info=await page.evaluate(()=>{
   const p=observe.player;if(!p)return null;
   const live=observe.enemies.filter(e=>e.isAlive);
   const e=live.sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
   const kills=observe.enemies.filter(e=>!e.isAlive).length;
   let move=null,target=null,dist=0;
   if(e){dist=Math.hypot(e.x-p.x,e.y-p.y);target=gameCamera.worldToScreen(e.x,e.y);const route=reviewNav.findPath(p.x,p.y,e.x,e.y)||[];const wp=route.find(w=>Math.hypot(w.x-p.x,w.y-p.y)>25)||e;move={x:wp.x-p.x,y:wp.y-p.y};}
   return {alive:p.isAlive,kills,move,target,dist,gun:p.currentWeapon?.isGun,ammo:p.ammo,wave:window.waveSpawner.currentWave,state:window.waveSpawner.state};
  });
  if(!info||!info.alive)break;
  const next=new Set();
  if(info.move&&info.dist>(info.gun?300:35)){if(info.move.x>12)next.add('d');if(info.move.x< -12)next.add('a');if(info.move.y>12)next.add('s');if(info.move.y< -12)next.add('w');}
  for(const k of held)if(!next.has(k))await page.keyboard.up(k);
  for(const k of next)if(!held.has(k))await page.keyboard.down(k);
  held=next;
  if(info.target){await page.mouse.move(Math.max(2,Math.min(1278,info.target.x)),Math.max(2,Math.min(718,info.target.y)));await page.waitForTimeout(40);if(info.dist<(info.gun?650:75))await page.mouse.click(Math.max(2,Math.min(1278,info.target.x)),Math.max(2,Math.min(718,info.target.y)));}
  if(info.kills>bestKills){bestKills=info.kills;await page.screenshot({path:path.join(__dirname,'repair-gameplay.png')});}
  if(i===45&&bestKills<0)await page.screenshot({path:path.join(__dirname,'repair-gameplay.png')});
  await page.waitForTimeout(100);
 }
 for(const k of held)await page.keyboard.up(k);
 const result=await page.evaluate(()=>({wave:window.waveSpawner.currentWave,state:window.waveSpawner.state,kills:observe.enemies.filter(e=>!e.isAlive).length,alive:observe.player?.isAlive}));
 await page.screenshot({path:path.join(__dirname,'repair-end.png')});
 if(!fs.existsSync(path.join(__dirname,'repair-gameplay.png')))await page.screenshot({path:path.join(__dirname,'repair-gameplay.png')});
 await page.keyboard.press('r');await page.waitForTimeout(300);
 result.restart=await page.evaluate(()=>({wave:window.waveSpawner.currentWave,state:window.waveSpawner.state,alive:observe.player?.isAlive}));
 await page.goto('http://localhost:8080/review.html');
 await page.screenshot({path:path.join(__dirname,'repair-compare-plan.png'),fullPage:true});
 await page.locator('[data-mode="materials"]').click();await page.waitForTimeout(200);await page.screenshot({path:path.join(__dirname,'repair-compare-materials.png'),fullPage:true});
 await page.locator('[data-mode="interiors"]').click();await page.waitForTimeout(200);await page.screenshot({path:path.join(__dirname,'repair-compare-interiors.png'),fullPage:true});
 await page.locator('[data-mode="gameplay"]').click();await page.waitForTimeout(500);await page.screenshot({path:path.join(__dirname,'repair-compare-gameplay.png'),fullPage:true});
 result.errors=errors;fs.writeFileSync(path.join(__dirname,'repair-playtest-result.json'),JSON.stringify(result,null,2));console.log(result);
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
