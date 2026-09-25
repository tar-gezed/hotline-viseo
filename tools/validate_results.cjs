'use strict';
// Optional Canvas/browser regression for the shared MVP laurel, without rooms
// or network fixtures. Uses the production font and both real results layouts.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const output=path.resolve(__dirname,'../test-results/results');fs.mkdirSync(output,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.MULTIPLAYER_TEST_URL||'http://127.0.0.1:8087/hotline-viseo/');
    await page.evaluate(async()=>{
      await document.fonts.ready;
      await import('./js/ui/coop_ui.js');await import('./js/ui/multi_score_screen.js');
      const canvas=document.createElement('canvas');canvas.id='results-review';
      canvas.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:100;background:#100e20';document.body.append(canvas);
      window.__resultsReview={canvas,screen:new MultiScoreScreen({slot:0,members:new Map(),resultReady(){}})};
    });
    const badges=await page.evaluate(()=>[88,172].map(size=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
      const c=canvas.getContext('2d'),screen=window.__resultsReview.screen;
      const realFillText=c.fillText;let glyph;
      // Capture the actual transformed ink box, including italic side bearings.
      c.fillText=function(text,x,y){
        if(this.fillStyle==='#ffe36c'){
          const m=this.measureText(text),t=this.getTransform();
          glyph={left:x-m.actualBoundingBoxLeft+t.e,right:x+m.actualBoundingBoxRight+t.e,
            top:y-m.actualBoundingBoxAscent+t.f,bottom:y+m.actualBoundingBoxDescent+t.f};
        }
        realFillText.call(this,text,x,y);
      };
      screen.rank(c,1,256,256,size);
      // Render just the branches through the same production path, then inspect
      // their pixels: symmetry and empty space around the visible numeral.
      c.clearRect(0,0,512,512);c.fillText=()=>{};screen.rank(c,1,256,256,size);
      const pixels=c.getImageData(0,0,512,512).data;
      let alpha=0,difference=0,overlap=0;
      for(let y=0;y<512;y++)for(let x=0;x<512;x++){
        const a=pixels[(y*512+x)*4+3];alpha+=a;
        difference+=Math.abs(a-pixels[(y*512+511-x)*4+3]);
        if(a>8&&x+.5>glyph.left-2&&x+.5<glyph.right+2&&y+.5>glyph.top-2&&y+.5<glyph.bottom+2)overlap+=a;
      }
      return {size,glyph,alpha,symmetryError:difference/alpha,overlap};
    }));
    for(const b of badges){
      assert(b.alpha>0,'wreath must be visible');assert(b.symmetryError<.02,'branches must mirror around the numeral');
      assert(Math.abs((b.glyph.left+b.glyph.right)/2-256)<.01,'visible numeral must be centered horizontally');
      assert(Math.abs((b.glyph.top+b.glyph.bottom)/2-256)<.01,'visible numeral must be centered vertically');
      assert.equal(b.overlap,0,'branches must leave clearance around the numeral');
    }
    for(const [width,height] of [[1280,720],[1920,1080],[2560,1080],[1024,768]]){
      await page.setViewportSize({width,height});
      for(const count of [2,5])for(const phase of [0,1]){
        await page.evaluate(({count,phase,width,height})=>{
          const {canvas,screen}=window.__resultsReview;
          const masks=['anne','arnaud','vincent','jade','lucas'];
          const rows=Array.from({length:count},(_,slot)=>({slot,mask:masks[slot],name:slot===0?'Michel':'Collègue',kills:5-slot,falls:1,score:2000-slot*200,deathWave:4,deathTime:165,favoriteWeapon:'PISTOL'}));
          [rows[0],rows[1]]=[rows[1],rows[0]];rows[0].kills=7;rows[0].score=3400;screen.network.members=new Map(rows.map(r=>[r.slot,r]));
          screen.show(rows);screen.phase=phase;screen.timer=1;screen.slide=1;
          canvas.width=width;canvas.height=height;screen.render(canvas.getContext('2d'),width,height);
        },{count,phase,width,height});
        await page.screenshot({path:path.join(output,`${phase?'columns':'mvp'}-${count}-${width}x${height}.png`)});
      }
    }
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({badges,errors,screenshots:16},null,2));
    console.log('PASS centered visible rank, mirrored laurels, clear numeral, MVP and 2/5-player columns at four viewports (16 captures)');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
