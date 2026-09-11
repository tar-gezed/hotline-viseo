const {chromium}=require('C:/Users/Quentin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('assert');
(async()=>{
 const b=await chromium.launch({headless:true}),p=await b.newPage({viewport:{width:1440,height:960}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{for(const key of ['arc','fillRect','strokeRect','moveTo','lineTo']){const original=CanvasRenderingContext2D.prototype[key];CanvasRenderingContext2D.prototype[key]=function(...args){if(args.some(x=>typeof x==='number'&&!Number.isFinite(x)) || args.some(x=>x===undefined))throw Error('Invalid drawing coordinate in '+key);return original.apply(this,args);};}});
 await p.goto('http://localhost:8080/map_editor.html');await p.waitForFunction(()=>window.MapEditor);
 const options=await p.locator('#addType option').evaluateAll(xs=>xs.filter(x=>x.value.startsWith('prop:')).map(x=>x.value));
 const rect=await p.locator('#mapCanvas').boundingBox();
 for(const option of options){await p.locator('#addType').selectOption(option);await p.locator('#addBtn').click();await p.mouse.click(rect.x+rect.width*.6,rect.y+rect.height*.6);assert.equal(await p.locator('#field-type').inputValue(),option.split(':')[1]);await p.locator('#deleteBtn').click();await p.locator('#undoBtn').click();await p.locator('#redoBtn').click();}
 assert.deepEqual(errors,[]);console.log('PASS all '+options.length+' furniture types: create/render/delete/undo/redo with finite canvas coordinates');await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
