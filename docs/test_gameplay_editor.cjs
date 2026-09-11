const {chromium}=require('C:/Users/Quentin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({headless:true});
 try{
  const p=await b.newPage({viewport:{width:1500,height:1000}}),errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://localhost:8080/map_editor.html');await p.waitForFunction(()=>window.MapEditor);
  const original=await p.evaluate(()=>MapIO.snapshot(MapEditor.getWorkingData()));
  const place=async type=>{await p.locator('#addType').selectOption(type);await p.locator('#addBtn').click();const r=await p.locator('#mapCanvas').boundingBox();await p.mouse.click(r.x+r.width*.55,r.y+r.height*.5);};
  const field=async(key,value)=>{await p.locator('#field-'+key).fill(String(value));await p.locator('#field-'+key).press('Tab');};
  await p.locator('#gameplayList').selectOption('player:player_start');
  assert.equal(await p.locator('#deleteBtn').isDisabled(),true);assert.equal(await p.locator('#duplicateBtn').isDisabled(),true);
  await place('player:start');await field('x',original.playerSpawn.x);await field('y',original.playerSpawn.y);
  await field('angleDeg',45);await p.locator('#undoBtn').click();await p.locator('#redoBtn').click();
  await place('weapon:SHOTGUN');assert.equal(await p.evaluate(()=>MapEditor.getWorkingData().weapons.length),original.weapons.length+1);
  await p.locator('#field-weaponType').selectOption('PISTOL');await field('ammo',3);await field('ammo',-1);assert.equal(await p.evaluate(()=>MapEditor.getWorkingData().weapons.at(-1).ammo),3);
  await field('x',original.playerSpawn.x);await field('y',original.playerSpawn.y);await field('angleDeg',0);
  const added=await p.evaluate(()=>MapEditor.getWorkingData().weapons.at(-1));assert.equal(added.type,'PISTOL');assert.equal(added.ammo,3);
  await p.locator('#duplicateBtn').click();await p.locator('#deleteBtn').click();await p.locator('#undoBtn').click();await p.locator('#redoBtn').click();
  assert.equal(await p.evaluate(()=>MapEditor.getWorkingData().weapons.length),original.weapons.length+1);
  // Existing weapons are editable and deletable, not only newly placed ones.
  await p.locator('#gameplayList').selectOption('weapon:'+original.weapons[0].id);await p.locator('#deleteBtn').click();
  assert.equal(await p.evaluate(()=>MapEditor.getWorkingData().weapons.length),original.weapons.length);await p.locator('#undoBtn').click();
  await place('spawn:entry');await field('x',original.spawnLocations[0].x);await field('y',original.spawnLocations[0].y);
  const name=p.locator('[data-key="name"]');await name.fill('Entrée personnalisée');await name.press('Tab');
  const addedSpawn=await p.evaluate(()=>MapEditor.getWorkingData().spawnLocations.at(-1));assert.equal(addedSpawn.name,'Entrée personnalisée');
  for(const s of original.spawnLocations){await p.locator('#gameplayList').selectOption('spawn:'+s.id);await p.locator('#deleteBtn').click();}
  await p.locator('#gameplayList').selectOption('spawn:'+addedSpawn.id);assert.equal(await p.locator('#deleteBtn').isDisabled(),true);
  await p.locator('#focusGameplay').click();
  const r=await p.locator('#mapCanvas').boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.mouse.move(r.x+r.width/2+25,r.y+r.height/2+20);await p.mouse.up();
  assert.notEqual(await p.evaluate(()=>MapEditor.getWorkingData().spawnLocations[0].x),addedSpawn.x);await p.locator('#undoBtn').click();
  await p.locator('#fitBtn').click();await p.screenshot({path:'docs/gameplay-editor-overview.png'});
  const download=p.waitForEvent('download');await p.locator('#exportBtn').click();const file=await(await download).path();
  const data=JSON.parse(require('node:fs').readFileSync(file,'utf8'));assert.equal(data.weapons.find(w=>w.id===added.id).ammo,3);assert.equal(data.spawnLocations.length,1);
  await p.reload();await p.waitForFunction(()=>window.MapEditor);assert.equal(await p.evaluate(()=>MapEditor.getWorkingData().spawnLocations[0].name),'Entrée personnalisée');
  await p.locator('#playDraftBtn').click();await p.waitForFunction(()=>window.activeMapLabel==='Brouillon de l’éditeur');
  assert.equal(await p.evaluate(()=>MapData.weapons.find(w=>w.id===window.MapData.weapons.at(-1).id).ammo),3);
  await p.evaluate(()=>{window.seenDrops=[];const render=FloorWeapon.prototype.render;FloorWeapon.prototype.render=function(...a){if(!seenDrops.includes(this))seenDrops.push(this);return render.apply(this,a);};});
  await p.keyboard.press('Enter');await p.waitForFunction(()=>seenDrops.some(w=>w.def.id==='PISTOL'&&w.ammo===3&&w.angle===0));
  assert.equal(await p.evaluate(()=>window.waveSpawner.spawnPoints.length),1);
  for(const wave of [1,3])assert.equal(await p.evaluate(n=>window.waveSpawner._generateWaveQueue(n).every(e=>e.spawnPoint.id===MapData.spawnLocations[0].id),wave),true);
  assert.deepEqual(errors,[]);console.log('PASS player, weapon CRUD/ammo, spawn CRUD/drag/last-point guard, undo/redo, persistence, export, actual game drops and waves 1/3');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
