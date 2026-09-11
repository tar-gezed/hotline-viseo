const {chromium}=require('C:/Users/Quentin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('assert');
(async()=>{
 const b=await chromium.launch({headless:true}); const p=await b.newPage({viewport:{width:1440,height:960}});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://localhost:8080/map_editor.html');
 await p.locator('#clearanceBtn').click();
 await p.screenshot({path:'docs/final-editor-clearance.png'});
 const pos=await p.evaluate(()=>{const c=document.getElementById('mapCanvas'),r=c.getBoundingClientRect();const m=MapData;const z=Math.min((r.width-68)/m.MAP_WIDTH,(r.height-68)/m.MAP_HEIGHT);const a=m.props.find(x=>x.id==='focus_table_1');return {x:r.x+r.width/2+(a.x-m.MAP_WIDTH/2)*z,y:r.y+r.height/2+(a.y-m.MAP_HEIGHT/2)*z};});
 await p.mouse.click(pos.x,pos.y);assert.equal(await p.locator('#field-id').inputValue(),'focus_table_1');
 const x=Number(await p.locator('#field-x').inputValue());await p.locator('#field-x').fill(String(x+10));await p.locator('#field-x').press('Tab');
 await p.locator('#undoBtn').click();assert.equal(Number(await p.locator('#field-x').inputValue()),x);
 await p.locator('#redoBtn').click();assert.equal(Number(await p.locator('#field-x').inputValue()),x+10);
 await p.locator('#saveBtn').click();
 const draft=await p.evaluate(()=>JSON.parse(localStorage.getItem('hotline-viseo-map-editor-draft-v1')));assert.equal(draft.props.find(x=>x.id==='focus_table_1').x,x+10);
 await p.locator('#probeBtn').click();await p.mouse.move(pos.x,pos.y);assert.match(await p.locator('#statusCollision').innerText(),/BLOCKED/);
 await p.goto('http://localhost:8080/review.html');await p.screenshot({path:'docs/final-compare-plan.png',fullPage:true});
 for(const mode of ['materials','interiors','gameplay']){await p.locator('[data-mode="'+mode+'"]').click();await p.waitForTimeout(600);await p.screenshot({path:'docs/final-compare-'+mode+'.png',fullPage:true});}
 console.log('Review images',await p.locator('img').evaluateAll(xs=>xs.map(x=>({src:x.src,loaded:x.complete&&x.naturalWidth>0}))));
 assert.deepEqual(errors,[]);console.log('Editor edit / undo / redo / draft / probe / clearance passed');await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
