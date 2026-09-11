const {chromium}=require('C:/Users/Quentin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
(async()=>{
 const original=fs.readFileSync(path.join(root,'maps/active.json'));
 const browser=await chromium.launch({headless:true});
 try {
  for(const prefix of ['/','/hotline-viseo/']) {
   const child=spawn(process.execPath,['tools/serve.cjs','--port','8187','--prefix',prefix],{cwd:root});
   try {
    await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Server exited '+code)));});
    const url='http://localhost:8187'+prefix;
    const response=await fetch(url+'maps/active.json');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/json/);assert.equal(await response.text(),original.toString());
    assert.equal((await fetch(url+'missing.json')).status,404);
    assert.equal((await fetch(url+'.git/config')).status,403);
    assert.equal((await fetch(url+'index.html',{method:'HEAD'})).status,200);
    assert.equal((await fetch(url,{method:'POST'})).status,405);
    const context=await browser.newContext({viewport:{width:1400,height:900}}),p=await context.newPage(),errors=[];
    p.on('pageerror',e=>errors.push(e.message));
    await p.goto(url);await p.waitForFunction(()=>window.activeMapLabel==='maps/active.json');
    assert.equal(await p.locator('#mapLoadError').count(),0);
    await p.keyboard.press('Enter');await p.waitForFunction(()=>window.waveSpawner?.currentWave>0);
    if(prefix!=='/')await p.screenshot({path:path.join(__dirname,'static-hosting-game.png')});
    await p.goto(url+'map_editor.html');await p.waitForFunction(()=>window.MapEditor);assert.ok(await p.locator('#floorList option').count()>0);
    await p.goto(url+'maps.html');assert.equal((await p.locator('a[href="index.html?map=source"]').count()),1);
    await p.route('**/maps/active.json',r=>r.fulfill({status:404,body:'Not found'}));
    await p.goto(url);await p.waitForFunction(()=>window.activeMapLabel==='Carte originale');
    await p.unroute('**/maps/active.json');await p.route('**/maps/active.json',r=>r.fulfill({status:200,body:'{invalid'}));
    await p.goto(url);await p.locator('#mapLoadError').waitFor();assert.equal(await p.locator('#activeMapLabel').textContent(),'Carte non chargée');
    assert.deepEqual(errors,[]);await context.close();console.log('PASS HTTP '+prefix);
   } finally { const exited=new Promise(r=>child.once('exit',r));child.kill();await exited; }
  }
  const p=await browser.newPage(),requests=[];p.on('request',r=>requests.push(r.url()));
  await p.goto(pathToFileURL(path.join(root,'index.html')).href);await p.locator('#mapLoadError').waitFor();
  assert.match(await p.locator('#mapLoadError').textContent(),/Lancer-le-jeu.cmd/);
  assert.ok(!requests.some(url=>url.endsWith('/maps/active.json')));
  await p.screenshot({path:path.join(__dirname,'static-hosting-file-help.png')});
  assert.deepEqual(fs.readFileSync(path.join(root,'maps/active.json')),original);
  console.log('PASS file protocol guidance; user map unchanged');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
