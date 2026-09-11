const { chromium } = require('C:/Users/Quentin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1280,height:720}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:8080');
  await page.waitForTimeout(200);
  await page.screenshot({path:path.join(__dirname,'round2-menu.png')});
  // Observe rendered actors without changing combat, spawns, or input behavior.
  await page.evaluate(()=>{
    window.observed={enemies:[],player:null};
    const er=Enemy.prototype.render;
    Enemy.prototype.render=function(...a){ if(!observed.enemies.includes(this))observed.enemies.push(this);return er.apply(this,a); };
    const pr=Player.prototype.render;
    Player.prototype.render=function(...a){observed.player=this;return pr.apply(this,a);};
  });
  await page.mouse.click(640,629);
  await page.waitForTimeout(500);
  await page.screenshot({path:path.join(__dirname,'round2-ready.png')});
  // Move up the corridor and collect the starter weapon with normal controls.
  await page.keyboard.press('e');
  await page.keyboard.down('w'); await page.keyboard.down('a');
  await page.waitForTimeout(1600);
  await page.keyboard.up('w'); await page.keyboard.up('a');
  await page.keyboard.press('e');
  await page.waitForTimeout(2000);
  await page.screenshot({path:path.join(__dirname,'round2-game.png')});
  // Fire toward the nearest visible live target using the actual mouse input.
  for(let i=0;i<35;i++){
    const target=await page.evaluate(()=>{
      const p=observed.player;if(!p||!p.isAlive)return null;
      const e=observed.enemies.filter(e=>e.isAlive).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
      return e?gameCamera.worldToScreen(e.x,e.y):null;
    });
    if(target){await page.mouse.move(Math.max(0,Math.min(1279,target.x)),Math.max(0,Math.min(719,target.y)));await page.mouse.click(Math.max(0,Math.min(1279,target.x)),Math.max(0,Math.min(719,target.y)));}
    await page.waitForTimeout(150);
  }
  await page.screenshot({path:path.join(__dirname,'round2-combat.png')});
  console.log(JSON.stringify(await page.evaluate(()=>({wave:{number:waveSpawner.currentWave,state:waveSpawner.state,queued:waveSpawner.spawnQueue.length},player:observed.player&&{x:observed.player.x,y:observed.player.y,alive:observed.player.isAlive,weapon:observed.player.currentWeapon?.id},enemies:observed.enemies.map(e=>({x:e.x,y:e.y,alive:e.isAlive,state:e.state}))})),null,2));
  await page.keyboard.press('r'); await page.waitForTimeout(200);
  console.log('restart',await page.evaluate(()=>waveSpawner.currentWave));
  await page.goto('http://localhost:8080/inspect_map.html');
  await page.locator('#full').screenshot({path:path.join(__dirname,'round2-map.png')});
  console.log('PAGE_ERRORS',errors);
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
