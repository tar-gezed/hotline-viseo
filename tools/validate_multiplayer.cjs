'use strict';
// Optional real-browser acceptance test. MQTT performs public discovery; gameplay
// uses genuine RTCDataChannels. No mock transport is used by this runner.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const url=process.env.MULTIPLAYER_TEST_URL||'http://127.0.0.1:8087/hotline-viseo/';
const output=path.resolve(__dirname,'../test-results/multiplayer');fs.mkdirSync(output,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-features=WebRtcHideLocalIpsWithMdns']});
  const errors=[],pages=[];
  try {
    async function page() {
      const p=await browser.newPage({viewport:{width:1280,height:720}});pages.push(p);
      p.on('pageerror',e=>{errors.push(e.stack);console.log('PAGE ERROR',e.message);});
      await p.route('**/js/main.js',async route=>{
        const response=await route.fetch();const source=(await response.text()).replace('  // Boot & Start',`  // Boot & Start
        window.__mpTest={get mp(){return multiplayer},get player(){return player},get players(){return players},get state(){return gameState},get enemies(){return enemies},get bullets(){return bullets},get floor(){return floorWeapons},get spawner(){return waveSpawner},get hud(){return hud},get input(){return input},get stats(){return runStats},get title(){return titleMenu},get pause(){return pauseMenu},open:openMultiplayer,solo:startNewGame, clear(){enemies=[];floorWeapons=[];bullets=[];},addEnemy:e=>enemies.push(e),addWeapon:spawnFloorWeapon,attack:handlePlayerAttack,pickup:handlePlayerRightClick,execute:executeEnemy,glass:checkGlassCollisions,supply:checkSupplyCrateInteractions};`);
        await route.fulfill({response,body:source});
      });
      await p.goto(url);await p.waitForFunction(()=>window.__mpTest?.title?.visible);
      return p;
    }
    const host=await page(),client=await page();
    // Exercise the real InputManager poller through the standard Gamepad API.
    // This verifies mappings/debouncing, not a particular physical controller.
    for(const p of [host,client])await p.evaluate(()=>{
      window.__pad={id:'Acceptance standard pad',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
      Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.__pad]});
    });
    async function pressPad(p,button){await p.evaluate(i=>{window.__pad.buttons[i]={pressed:true,value:1};},button);await p.waitForTimeout(100);await p.evaluate(i=>{window.__pad.buttons[i]={pressed:false,value:0};},button);await p.waitForTimeout(100);}
    // Network code must not be requested during ordinary solo/menu startup.
    assert.equal(await host.evaluate(()=>performance.getEntriesByType('resource').some(r=>/trystero|network\//.test(r.name))),false);
    await host.evaluate(()=>window.__mpTest.open());await host.waitForFunction(()=>window.__mpTest.mp?.active);
    await client.evaluate(()=>window.__mpTest.open());await client.waitForFunction(()=>window.__mpTest.mp?.active);
    await client.waitForFunction(()=>window.__mpTest.mp.menu.regions.some(r=>r.index===2));
    await client.mouse.click(900,480);await client.waitForFunction(()=>window.__mpTest.mp.menu.keypad);
    await pressPad(client,15);await pressPad(client,0);assert.equal(await client.evaluate(()=>window.__mpTest.mp.menu.codeField.value),'3');
    await pressPad(client,2);assert.equal(await client.evaluate(()=>window.__mpTest.mp.menu.codeField.value),'');await pressPad(client,1);
    assert.equal(await client.evaluate(()=>window.__mpTest.mp.menu.keypad),false);
    await client.screenshot({path:path.join(output,'multiplayer-menu.png')});
    await host.getByRole('textbox',{name:'VOTRE PSEUDO (HÔTE OU INVITÉ)',exact:true}).fill('Alice');
    await host.mouse.click(320,550);await host.waitForFunction(()=>window.__mpTest.mp.screen==='lobby');
    assert.equal(await host.evaluate(()=>window.__mpTest.mp.network.members.get(0).name),'Alice');
    const code=await host.evaluate(()=>window.__mpTest.mp.network.code);console.log('Room',code);
    await client.evaluate(code=>{const m=window.__mpTest.mp;m.menu.nameField.value='Bob';m.menu.codeField.value=code;return m.connect(false);},code);
    try {await Promise.all(pages.map(p=>p.waitForFunction(()=>window.__mpTest.mp.network.members.size===2,null,{timeout:45000})));}
    catch(e) {console.log('Connection diagnostics',await Promise.all(pages.map(p=>p.evaluate(()=>{const m=window.__mpTest.mp;return {phase:m.network.phase,host:m.network.hostId,slot:m.network.slot,members:[...m.network.members.values()],peers:Object.keys(m.network.room?.getPeers()||{}),message:m.menu.message};}))));throw e;}
    await host.screenshot({path:path.join(output,'lobby-2.png')});
    console.log('Connected real MQTT/WebRTC');
    await pressPad(client,15);await pressPad(client,0);await host.waitForFunction(()=>window.__mpTest.mp.network.members.get(1).mask==='anne');
    await pressPad(client,4);await pressPad(client,0);await host.waitForFunction(()=>window.__mpTest.mp.network.members.get(1).mask==='vincent');
    await pressPad(client,2);await pressPad(host,2);
    await host.waitForFunction(()=>window.__mpTest.mp.network.canStart());await pressPad(host,9);
    await Promise.all(pages.map(p=>p.waitForFunction(()=>window.__mpTest.mp.playing)));
    await host.evaluate(()=>{window.__mpTest.spawner.preWaveTimer=100;});
    await client.waitForFunction(()=>window.__mpTest.mp.sync.latest?.seq>5);
    await client.evaluate(()=>{window.__pad.axes[1]=-1;});await client.waitForTimeout(600);await client.evaluate(()=>{window.__pad.axes[1]=0;});await client.waitForTimeout(300);
    const diagnostics=await Promise.all(pages.map(p=>p.evaluate(()=>{const m=window.__mpTest.mp;return {phase:m.network.phase,playing:m.playing,players:[...m.b.players.values()].map(p=>({id:p.playerId,x:p.x,y:p.y})),channels:[...m.network.fast.values()].map(c=>({state:c.readyState,ordered:c.ordered,maxRetransmits:c.maxRetransmits})),snapshot:m.sync.latest?.seq};})));
    console.log(JSON.stringify(diagnostics));
    await host.screenshot({path:path.join(output,'game-host.png')});await client.screenshot({path:path.join(output,'game-client.png')});
    assert(diagnostics.every(d=>d.channels.every(c=>c.state==='open'&&!c.ordered&&c.maxRetransmits===0)));
    assert(Math.abs(diagnostics[0].players[1].y-diagnostics[1].players[1].y)<15);

    // Reproduce the two reported wave defects with both players alive. Two
    // occupied markers must be retargeted, and the client's headline must fade.
    await host.evaluate(()=>{
      const t=window.__mpTest,w=t.spawner;for(const p of t.players.values())p.isInvulnerable=true;
      const clear=w.spawnPoints.find(s=>[...t.players.values()].every(p=>Math.hypot(s.x-p.x,s.y-p.y)>300)&&w.spawnPositionValidator(s));
      if(!clear)throw Error('No safe wave fixture');
      w.currentWave=2;w.state='SPAWNING';w.preWaveTimer=0;w.spawnTimer=0;w.totalWaveEnemies=2;w.enemiesSpawned=0;
      w.spawnQueue=[...t.players.values()].map((p,i)=>({id:'camped'+i,type:'STANDARD',weapon:'PISTOL',spawnPoint:{id:'camp'+i,x:p.x,y:p.y}}));
    });
    await host.waitForFunction(()=>window.__mpTest.spawner.spawnQueue.length===0,null,{timeout:15000});
    assert(await host.evaluate(()=>[...window.__mpTest.players.values()].every(p=>p.isAlive)));
    await client.waitForFunction(()=>window.__mpTest.hud.presentedWave===2&&window.__mpTest.hud.waveAge>3&&window.__mpTest.hud.preWaveTime===0);
    await client.screenshot({path:path.join(output,'wave-2-client.png')});
    await host.evaluate(()=>{const t=window.__mpTest;t.clear();t.spawner.currentWave=1;t.spawner.state='PREWAVE';t.spawner.preWaveTimer=100;t.spawner.enemiesSpawned=0;for(const p of t.players.values())p.isInvulnerable=false;});
    console.log('PASS occupied wave-two entrances, both players alive, client wave fade and Gamepad API lobby/movement');

    // Host ESC/Start freezes the whole room. Client options remain local.
    await pressPad(host,9);await host.waitForTimeout(350);
    await client.waitForFunction(()=>window.__mpTest.mp.network.hidden);
    const elapsed=await host.evaluate(()=>window.__mpTest.stats.elapsedTime);await host.waitForTimeout(180);
    assert.equal(await host.evaluate(()=>window.__mpTest.stats.elapsedTime),elapsed);
    assert(await host.evaluate(()=>window.__mpTest.mp.overlay));
    await host.mouse.click(980,313);
    await host.waitForFunction(()=>window.__mpTest.mp.b.audioSettings.values.music===.75);
    await pressPad(host,1);
    await client.waitForFunction(()=>!window.__mpTest.mp.network.hidden);
    await pressPad(client,9);const liveTime=await host.evaluate(()=>window.__mpTest.stats.elapsedTime);await host.waitForTimeout(180);
    assert(await host.evaluate(t=>window.__mpTest.stats.elapsedTime>t+.05,liveTime));await pressPad(client,1);
    await host.evaluate(()=>window.__mpTest.mp.visibilityChanged(true));await client.waitForFunction(()=>window.__mpTest.mp.network.hidden);
    const paused=await host.evaluate(()=>window.__mpTest.stats.elapsedTime);await host.waitForTimeout(250);
    assert.equal(await host.evaluate(()=>window.__mpTest.stats.elapsedTime),paused);
    await host.evaluate(()=>window.__mpTest.mp.visibilityChanged(false));await client.waitForFunction(()=>!window.__mpTest.mp.network.hidden);
    console.log('PASS host options/visibility pause and client local options');

    // Add 180–220 ms round-trip delay and drop one realtime packet in five.
    // Cosmetic feedback must remain local; hits must still come from the host.
    for(const p of [host,client])await p.evaluate(()=>{
      const n=window.__mpTest.mp.network,receive=n.receiveRealtime.bind(n),control=n.receiveControl.bind(n);let packets=0;
      n.receiveRealtime=(packet,id)=>{if(++packets%5)setTimeout(()=>receive(packet,id),90+(packets%3)*10);};
      n.receiveControl=(packet,id)=>{if(['effects','state'].includes(packet?.type))setTimeout(()=>control(packet,id),100);else control(packet,id);};
      window.__restoreLatency=()=>{n.receiveRealtime=receive;n.receiveControl=control;};
      const v=window.__mpTest.mp.sync.projectiles,predict=v.predict.bind(v);window.__predictedShots=0;
      v.predict=(...args)=>{window.__predictedShots++;return predict(...args);};
    });

    // A real remote mouse attack crosses a teammate without friendly fire and
    // kills a fixture enemy through the ordinary host projectile collision loop.
    const target=await host.evaluate(()=>{
      const t=window.__mpTest;t.clear();const shooter=t.players.get(1),friend=t.players.get(0);shooter.equipWeapon('MAGNUM',4);
      const angle=Array.from({length:16},(_,i)=>i*Math.PI/8).find(a=>t.mp.b.navGraph.canTraverse(shooter,{x:shooter.x+Math.cos(a)*100,y:shooter.y+Math.sin(a)*100},14,false));
      if(angle===undefined)throw Error('No clear combat fixture');
      friend.x=shooter.x+Math.cos(angle)*45;friend.y=shooter.y+Math.sin(angle)*45;
      const e=new Enemy(shooter.x+Math.cos(angle)*95,shooter.y+Math.sin(angle)*95,'STANDARD','PISTOL');e.update=()=>{};t.addEnemy(e);
      return {x:e.x,y:e.y};
    });
    await client.waitForFunction(()=>window.__mpTest.player.currentWeapon.id==='MAGNUM'&&window.__mpTest.player.ammo===4);
    const aim=await client.evaluate(p=>window.__mpTest.mp.b.camera.worldToScreen(p.x,p.y),target);
    await client.mouse.move(aim.x,aim.y);await client.mouse.click(aim.x,aim.y);
    await client.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await client.evaluate(()=>window.__predictedShots),1,'feedback occurs locally before network acknowledgement');
    await host.waitForFunction(()=>window.__mpTest.players.get(1).kills===1);
    assert(await host.evaluate(()=>window.__mpTest.players.get(0).isAlive));
    assert.equal(await host.evaluate(()=>window.__mpTest.players.get(0).kills),0);
    await client.waitForFunction(()=>window.__mpTest.player.kills===1);
    await client.keyboard.down('KeyW');await client.waitForTimeout(280);await client.keyboard.up('KeyW');await client.waitForTimeout(600);
    const lagged=await Promise.all([host,client].map(p=>p.evaluate(()=>{const q=window.__mpTest.players.get(1);return {x:q.x,y:q.y};})));
    assert(Math.hypot(lagged[0].x-lagged[1].x,lagged[0].y-lagged[1].y)<18,'prediction reconciles under loss and delay');
    for(const p of [host,client])await p.evaluate(()=>window.__restoreLatency());
    console.log('PASS remote authoritative hit, immediate tracer, reconciliation at 180–220 ms RTT/20% loss and no friendly fire');

    // Concurrent pickup intentions are arbitrated by the host exactly once.
    await host.evaluate(()=>{const t=window.__mpTest;t.clear();const p=t.players.get(0);for(const q of t.players.values()){q.x=p.x;q.y=p.y;q.equipWeapon('FISTS');}t.addWeapon(p.x,p.y,'PISTOL',7);t.mp.needsReliable=true;});
    await client.waitForFunction(()=>window.__mpTest.player.currentWeapon.id==='FISTS');
    await Promise.all([host.keyboard.press('KeyE'),client.keyboard.press('KeyE')]);await host.waitForTimeout(250);
    assert.equal(await host.evaluate(()=>[...window.__mpTest.players.values()].filter(p=>p.currentWeapon.id==='PISTOL').length),1);
    assert.equal(await host.evaluate(()=>window.__mpTest.floor.filter(w=>w.def.id==='PISTOL').length),0);

    // Closed fast streams transparently fall back to bounded reliable actions.
    const seq=await client.evaluate(()=>window.__mpTest.mp.sync.latest.seq);
    await host.evaluate(()=>{for(const c of window.__mpTest.mp.network.fast.values())c.close();});
    await client.waitForFunction(s=>window.__mpTest.mp.sync.latest.seq>s+3,seq);
    await host.evaluate(()=>{const t=window.__mpTest;const d=t.mp.b.mapData.doors[0];d.kick(t.players.get(1),1,0,34);t.mp.b.mapData.glassPartitions[0].shatter(0,0,1,0);t.mp.needsReliable=true;});
    await client.waitForFunction(()=>window.__mpTest.mp.b.mapData.glassPartitions[0].shattered);
    console.log('PASS simultaneous pickup, reliable fallback and mutable geometry');

    await require('./validate_revive.cjs')([host,client],output);

    await host.evaluate(()=>{const t=window.__mpTest,simulate=t.mp.b.simulate;t.mp.b.simulate=dt=>{simulate(dt);const p=t.players.get(1);p.isInvulnerable=false;p.takeHit({type:'TEST',angle:0});p.downedTimer=.15;t.mp.b.simulate=simulate;};});
    await client.waitForFunction(()=>!window.__mpTest.player.isAlive);
    assert(await host.evaluate(()=>window.__mpTest.mp.playing));
    await client.screenshot({path:path.join(output,'spectator.png')});
    await host.evaluate(()=>{const t=window.__mpTest;t.clear();t.spawner.state='IN_PROGRESS';t.spawner.spawnQueue=[];t.spawner.enemiesSpawned=1;});
    await client.waitForFunction(()=>window.__mpTest.player.isAlive&&window.__mpTest.mp.sync.latest.phase==='INTERMISSION');
    assert.equal(await client.evaluate(()=>window.__mpTest.player.currentWeapon.id),'MAGNUM');
    await host.evaluate(()=>{const t=window.__mpTest,simulate=t.mp.b.simulate;t.mp.b.simulate=dt=>{simulate(dt);for(const p of t.players.values()){p.isInvulnerable=false;p.takeHit({type:'TEST'});}t.mp.b.simulate=simulate;};});
    await Promise.all([host,client].map(p=>p.waitForFunction(()=>window.__mpTest.mp.screen==='results')));
    assert.equal(await host.evaluate(()=>window.__mpTest.mp.results.rows.find(r=>r.slot===1).falls),3);
    assert.equal(await host.evaluate(()=>window.__mpTest.mp.results.rows.find(r=>r.slot===1).favoriteWeapon),'MAGNUM');
    await host.waitForTimeout(450);await host.screenshot({path:path.join(output,'mvp-2.png')});await pressPad(host,0);await host.waitForTimeout(250);await host.screenshot({path:path.join(output,'results-2.png')});
    await host.evaluate(()=>window.__mpTest.mp.network.resultReady());await client.evaluate(()=>window.__mpTest.mp.network.resultReady());
    await Promise.all([host,client].map(p=>p.waitForFunction(()=>window.__mpTest.mp.screen==='lobby')));
    console.log('PASS spectator, wave respawn, results and collective lobby return');

    for(let i=2;i<5;i++){
      const p=await page();await p.evaluate(()=>window.__mpTest.open());await p.waitForFunction(()=>window.__mpTest.mp?.active);
      await p.evaluate(code=>{const m=window.__mpTest.mp;m.menu.nameField.value='Collègue '+(window.name||'');m.menu.codeField.value=code;return m.connect(false);},code);
      await p.waitForFunction(size=>window.__mpTest.mp.network.members.size===size,i+1,{timeout:40000});
    }
    const squad=pages.slice();await Promise.all(squad.map(p=>p.waitForFunction(()=>window.__mpTest.mp.network.members.size===5)));
    for(let i=0;i<squad.length;i++)await squad[i].evaluate(i=>window.__mpTest.mp.network.profileUpdate({mask:Object.keys(CONFIG.MASKS)[i],name:['Alice','Bob','Charlie','Diane','Émile'][i]}),i);
    const full=await page();await full.evaluate(()=>window.__mpTest.open());await full.waitForFunction(()=>window.__mpTest.mp?.active);
    await full.evaluate(code=>{const m=window.__mpTest.mp;m.menu.codeField.value=code;return m.connect(false);},code);
    await full.waitForFunction(()=>window.__mpTest.mp.menu.message.includes('complet'),null,{timeout:40000});
    await full.close();
    assert.equal(await host.evaluate(()=>Object.keys(window.__mpTest.mp.network.room.getPeers()).length),4);
    for(const p of squad.slice(1))assert.equal(await p.evaluate(()=>Object.keys(window.__mpTest.mp.network.room.getPeers()).length),1);
    await host.screenshot({path:path.join(output,'lobby-5.png')});
    for(const p of squad)await p.evaluate(()=>window.__mpTest.mp.network.ready());
    await host.waitForFunction(()=>window.__mpTest.mp.network.canStart());await host.evaluate(()=>window.__mpTest.mp.network.start());
    await Promise.all(squad.map(p=>p.waitForFunction(()=>window.__mpTest.mp.playing)));
    await squad[4].waitForFunction(()=>window.__mpTest.mp.sync.latest?.players.length===5);
    assert.equal(await host.evaluate(()=>window.__mpTest.spawner.totalWaveEnemies),12);
    await host.evaluate(()=>{const t=window.__mpTest;t.spawner.preWaveTimer=100;const simulate=t.mp.b.simulate;t.mp.b.simulate=dt=>{simulate(dt);const p=t.players.get(1);p.takeHit({type:'TEST'});p.downedTimer=.15;t.mp.b.simulate=simulate;};});
    await client.waitForFunction(()=>!window.__mpTest.player.isAlive&&window.__mpTest.mp.spectated!==null);
    const watched=await client.evaluate(()=>window.__mpTest.mp.spectated);await pressPad(client,5);
    assert.notEqual(await client.evaluate(()=>window.__mpTest.mp.spectated),watched);await pressPad(client,4);
    assert.equal(await client.evaluate(()=>window.__mpTest.mp.spectated),watched);
    await host.evaluate(()=>{const t=window.__mpTest,p=t.players.get(1),at=t.mp.spawns[1];p.respawn(at.x,at.y);t.mp.needsReliable=true;});
    await client.waitForFunction(()=>window.__mpTest.player.isAlive);
    await require('./validate_multiplayer_events.cjs')(squad);
    if(process.env.MP_MEASURE)await require('./measure_multiplayer.cjs')(squad,output);
    await host.evaluate(()=>{const t=window.__mpTest,simulate=t.mp.b.simulate;t.spawner.preWaveTimer=100;t.mp.b.simulate=dt=>{simulate(dt);for(const p of t.players.values()){p.kills=5-p.playerId;p.score=p.kills*1400;p.favoriteWeapon=p.currentWeapon.id;p.isInvulnerable=false;p.takeHit({type:'TEST'});}t.mp.b.simulate=simulate;};});
    await Promise.all(squad.map(p=>p.waitForFunction(()=>window.__mpTest.mp.screen==='results')));
    await host.waitForTimeout(450);await host.screenshot({path:path.join(output,'mvp-5.png')});
    await host.keyboard.press('Space');await host.waitForTimeout(250);await host.screenshot({path:path.join(output,'results-5.png')});
    // Same Canvas safe area across desktop aspect ratios and pointer transforms.
    for(const [width,height] of [[1920,1080],[2560,1080],[1024,768]]) {
      await host.setViewportSize({width,height});await host.waitForTimeout(120);await host.screenshot({path:path.join(output,`results-5-${width}x${height}.png`)});
    }
    await host.setViewportSize({width:1280,height:720});
    await squad[4].close();
    for(const p of squad.slice(0,4))await p.evaluate(()=>window.__mpTest.mp.network.resultReady());
    await Promise.all(squad.slice(0,4).map(p=>p.waitForFunction(()=>window.__mpTest.mp.screen==='lobby')));
    for(const p of squad.slice(0,4))await p.evaluate(()=>window.__mpTest.mp.network.ready());
    await host.waitForFunction(()=>window.__mpTest.mp.network.canStart());await host.evaluate(()=>window.__mpTest.mp.network.start());
    await Promise.all(squad.slice(0,4).map(p=>p.waitForFunction(()=>window.__mpTest.mp.playing)));
    // Exit through actual Canvas options, including a non-host exit.
    await squad[3].keyboard.press('Escape');await squad[3].waitForFunction(()=>window.__mpTest.mp.overlay&&window.__mpTest.mp.options.regions.some(r=>r.index===3));await squad[3].mouse.click(660,550);
    await squad[3].waitForFunction(()=>window.__mpTest.state==='MENU_TITLE'&&!window.__mpTest.mp.active);
    await host.waitForFunction(()=>window.__mpTest.mp.network.members.size===3);
    await pressPad(host,9);for(let i=0;i<3;i++)await pressPad(host,13);await pressPad(host,0);
    await host.waitForFunction(()=>window.__mpTest.state==='MENU_TITLE'&&!window.__mpTest.mp.active);
    await Promise.all(squad.slice(1,3).map(p=>p.waitForFunction(()=>window.__mpTest.mp.menu.message.includes('hôte'))));
    console.log('PASS five-player strict star, full-room rejection, MVP/columns, disconnected quorum and host departure');

    // Return to unchanged solo behavior after leaving a multiplayer session.
    await host.evaluate(()=>window.__mpTest.solo('vincent'));await host.waitForTimeout(100);
    assert.equal(await host.evaluate(()=>window.__mpTest.spawner.totalWaveEnemies),5);
    await host.keyboard.press('Escape');const soloTime=await host.evaluate(()=>window.__mpTest.stats.elapsedTime);await host.waitForTimeout(200);
    assert.equal(await host.evaluate(()=>window.__mpTest.stats.elapsedTime),soloTime);
    await host.mouse.click(650,559);await host.waitForFunction(()=>window.__mpTest.state==='MENU_TITLE');
    assert.equal(errors.length,0,errors.join('\n'));
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({code,diagnostics,errors},null,2));
    console.log('PASS complete 2–5 player MQTT / WebRTC acceptance and solo pause regression');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

