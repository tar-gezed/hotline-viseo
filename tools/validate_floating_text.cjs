'use strict';
// Real raster regression: italic outlines must stay within a round 2px stroke.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const output=path.join(__dirname,'../test-results/performance');
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const results=[];
    for(const baseline of [true,false]) {
      const page=await browser.newPage();
      await page.addInitScript(()=>window.requestAnimationFrame=()=>1);
      if(baseline)await page.route('**/js/effects/particles.js',route=>route.fulfill({contentType:'text/javascript',body:cp.execFileSync('git',['show','84afbfb:js/effects/particles.js'],{encoding:'utf8'})}));
      await page.goto(process.env.PERF_TEST_URL||'http://127.0.0.1:8097/');
      const result=await page.evaluate(async()=>{
        await document.fonts.ready;
        const sheet=document.createElement('canvas');sheet.width=1000;sheet.height=660;
        const ctx=sheet.getContext('2d');ctx.fillStyle='#484655';ctx.fillRect(0,0,1000,660);
        const cases=[];
        for(const [i,text] of ['PICKED UP 9MM PISTOL','PICKED UP KATANA','PICKED UP SHOTGUN','WAVE 12 COMPLETE! +1525','AMMO REFILLED & WEAPON CACHE OPENED!'].entries()) {
          const label=new FloatingText(500,65+i*125,text,{fontSize:i===3?28:16,color:'#00f3ff'});
          label.scale=1.8;label.rotation=-.03;label.draw(ctx);
          const sprite=label.textSprite.canvas,spriteCtx=sprite.getContext('2d');
          const metrics=spriteCtx.measureText(text);
          const top=sprite.height/2-(metrics.actualBoundingBoxAscent+2.5)*2;
          const bottom=sprite.height/2+(metrics.actualBoundingBoxDescent+2.5)*2;
          const data=spriteCtx.getImageData(0,0,sprite.width,sprite.height).data;
          let spikes=0;
          for(let y=0;y<sprite.height;y++)if(y<top||y>bottom)for(let x=0;x<sprite.width;x++){
            const p=(y*sprite.width+x)*4;
            if(data[p+3]>180 && data[p]<45 && data[p+1]<45 && data[p+2]<45)spikes++;
          }
          const cached=label.textSprite;label.update(.05);label.draw(document.createElement('canvas').getContext('2d'));
          cases.push({text,spikes,cached:cached===label.textSprite});
        }
        return {cases,image:sheet.toDataURL()};
      });
      fs.writeFileSync(path.join(output,baseline?'text-before.png':'text-after.png'),Buffer.from(result.image.split(',')[1],'base64'));
      results.push(result.cases);await page.close();
    }
    assert(results[0].some(c=>c.spikes>0),'fixture reproduces original italic spikes');
    assert(results[1].every(c=>c.spikes===0 && c.cached),'rounded outlines remove spikes and preserve sprite cache');
    console.log(JSON.stringify({before:results[0],after:results[1]}));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
