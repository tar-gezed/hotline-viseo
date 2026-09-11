const {chromium}=require('C:/Users/Quentin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch();try{const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
for(const [w,h] of [[1920,1080],[2560,1440],[3840,2160]]){
await p.setViewportSize({width:w,height:h});await p.goto('http://localhost:8080/');await p.waitForFunction(()=>window.activeMapLabel);
await p.evaluate(()=>{window.audit={};const render=Player.prototype.render;Player.prototype.render=function(...a){audit.player=this;return render.apply(this,a)};const show=ScoreScreen.prototype.show;ScoreScreen.prototype.show=function(...a){audit.screen=this;return show.apply(this,a)};Enemy.prototype.update=function(){};});
await p.keyboard.press('Enter');await p.waitForFunction(()=>audit.player);await p.evaluate(()=>audit.player.takeHit({type:'BULLET'}));await p.waitForTimeout(500);
assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('hotline_viseo_leaderboard_v2')).length),1);
await p.keyboard.press('Space');await p.waitForFunction(()=>audit.screen);await p.waitForTimeout(800);
assert.equal(await p.evaluate(()=>audit.screen.leaderboard.length),1);
await p.evaluate(()=>{const s=audit.screen;s.evaluateRun({runId:'preview',score:26975,waveReached:4,wavesCleared:3,totalKills:18,gunKills:10,meleeKills:5,throwKills:3,executions:2,doorSlams:3,maxCombo:7,weaponsUsed:new Set(['BAT','UZI','KNIFE']),elapsedTime:160});});
await p.screenshot({path:`docs/scoring-${h}p.png`});
await p.mouse.click(w*.5-110*(h/1080),h*.86+23*(h/1080));await p.waitForFunction(()=>audit.player.isAlive);
await p.evaluate(()=>localStorage.clear());console.log('PASS death autosave, no duplicate, render and scaled restart click '+w+'x'+h);
}assert.deepEqual(errors,[]);}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
