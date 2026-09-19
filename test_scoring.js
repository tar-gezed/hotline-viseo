const assert=require('node:assert/strict');
global.CONFIG=require('./js/config');
const data=new Map();global.localStorage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
const {GameHUD}=require('./js/ui/hud'),{ScoreScreen}=require('./js/ui/score_screen');
const hud=new GameHUD();for(let i=0;i<5;i++)hud.addKillScore('GUN',400,0,0);
const points=CONFIG.SCORING.COMBO_MULTIPLIERS.slice(0,5).reduce((a,m)=>a+400*m,0);assert.equal(hud.currentScore,points);
hud.update(20);assert.equal(hud.comboCount,0);assert.equal(hud.maxComboRecorded,5);hud.reset();assert.equal(hud.maxComboRecorded,0);
const screen=new ScoreScreen();assert.deepEqual(screen.leaderboard,[]);
const run={runId:'empty',score:0,totalKills:0,weaponsUsed:new Set(),elapsedTime:0,waveReached:1,maxCombo:0};screen.show('GAME_OVER',run);assert.equal(screen.breakdown.totalCalculatedScore,0);screen.show('GAME_OVER',run);assert.equal(screen.leaderboard.length,1);
screen.show('GAME_OVER',{...run,runId:'real',score:5000,totalKills:10,meleeKills:2,gunKills:6,throwKills:2,executions:1,doorSlams:1,weaponsUsed:new Set(['BAT','UZI']),waveReached:4,wavesCleared:3,elapsedTime:120,maxCombo:5});
assert.equal(screen.stats.waveReached,4);assert.equal(screen.breakdown.timeBonus,1200);assert.equal(screen.breakdown.flexibilityScore,2500);assert.equal(screen.breakdown.carnageScore,1600);assert.equal(screen.breakdown.boldnessScore,5500);assert.equal(screen.breakdown.totalCalculatedScore,15800);
assert.equal(new ScoreScreen().leaderboard[0].score,15800);
for(let i=0;i<12;i++)screen.show('GAME_OVER',{...run,runId:'r'+i,score:i});assert.equal(screen.leaderboard.length,8);
data.set(screen.LEADERBOARD_KEY,'{}');assert.deepEqual(screen.loadLeaderboard(),[]);data.set(screen.LEADERBOARD_KEY,'{');assert.deepEqual(screen.loadLeaderboard(),[]);
data.set(screen.LEADERBOARD_KEY,JSON.stringify([{score:'bad',runId:'x'},null]));assert.deepEqual(screen.loadLeaderboard(),[]);
console.log('PASS combos persist/reset, exact scoring, empty run, waves, bonuses, deduplication, top eight, persistence and corrupt storage');

// Presentation events must never modify scoring, combo decay, or ammunition.
const visual=new GameHUD();
visual.setWave(2,7);visual.update(.12);
assert.equal(visual.waveImpact,0);
visual.update(3,{wave:2,enemiesRemaining:7});
visual.setWave(2,7);assert(visual.waveAge>3,'same-wave sync cannot replay the announcement');
visual.setWave(3,9);assert.equal(visual.waveAge,0);assert.equal(visual.waveImpact,.1);
const gun={id:'PISTOL',name:'Pistol',isGun:true,maxAmmo:12};
visual.setWeapon(gun,1);visual.setWeapon(gun,0);assert.equal(visual.ammoImpact,.1);
visual.update(.12);visual.setWeapon(gun,0);assert.equal(visual.ammoImpact,0,'empty HUD sync stays still');
visual.addKillScore('GUN',400,0,0);
const state={score:visual.currentScore,combo:visual.comboCount,timer:visual.comboTimer};
visual.notifyDryFire();assert.equal(visual.ammoImpact,.1);
assert.deepEqual({score:visual.currentScore,combo:visual.comboCount,timer:visual.comboTimer},state);
assert.equal(visual.currentAmmo,0);
visual.update(.12);
assert.equal(visual.scoreImpact,0);assert.equal(visual.comboImpact,0);assert.equal(visual.ammoImpact,0);
assert.equal(visual.comboTimer,state.timer-.12,'presentation does not change combo decay');
visual.setWeapon({name:'Bat',isGun:false});visual.notifyDryFire();assert.equal(visual.ammoImpact,0);
visual.addKillScore('GUN',400,0,0);
const slowTimer=visual.comboTimer;
visual.update(.01,null,.1);
assert.equal(visual.scoreImpact,0,'100 ms impact uses real time during hit stop');
assert.equal(visual.comboTimer,slowTimer-.01,'combo still uses simulation time');
visual.reset();assert.equal(visual.maskAge,0);assert.equal(visual.presentedWave,null);
console.log('PASS event-only HUD impacts, repeated wave sync, dry fire isolation and reset');

// Kills (including one-frame multikills) animate only on a real count decrease.
{
  const h = new GameHUD();
  h.setWave(1, 7); h.setEnemiesRemaining(6);
  assert.equal(h.enemyImpact, .12);
  h.update(0, null, .13); h.setEnemiesRemaining(6);
  assert.equal(h.enemyImpact, 0);
  h.update(0, { wave:1, enemiesRemaining:3 }, 0);
  assert.equal(h.enemyImpactStrength, 3);
  h.setEnemiesRemaining(3); // main.js's second sync must not erase the impact.
  assert.equal(h.enemyImpact, .12);
  h.setPreWave(4);
  assert.equal(h.countdownNumber, 0);
  for (const [remaining, digit] of [[4,0],[3.001,0],[3,3],[2.001,3],[2,2],[1.001,2],[1,1],[.001,1],[0,0]]) {
    h.update(0, { preWaveTimeLeft:remaining }, 0);
    assert.equal(h.countdownNumber, digit, `countdown at ${remaining}s`);
  }
  h.update(0, { preWaveTimeLeft:3 }, 0);
  h.update(0, { preWaveTimeLeft:3 }, .15);
  assert.equal(h.countdownImpact, 0, 'same beat cannot keep retriggering');
  h.update(0, { preWaveTimeLeft:.7 }, 0);
  assert.equal(h.countdownNumber, 1);
  assert.equal(h.countdownImpactDuration, .14);
  h.setIntermission(10, 1); h.update(0, null, .9); h.setIntermission(9, 1);
  assert.equal(h.clearAge, .9, 'same clear callback cannot replay the celebration');
  h.reset();
  assert.equal(h.enemyImpact, 0); assert.equal(h.countdownNumber, 0);
  assert.equal(h.clearAge, Infinity); assert.deepEqual(h.supplyCrates, []);

  // Any number of caches, camera-projected positions, opened caches excluded.
  const arrows = [];
  h._drawRadarArrow = (...args) => arrows.push(args.slice(1));
  h.supplyCrates = [{x:-1000,y:100}, {x:2400,y:100}, {x:600,y:400}, {x:100,y:50,isOpened:true}];
  h._drawSupplyArrows({}, 1280, 720, {worldToScreen:(x,y)=>({x,y})});
  assert.equal(arrows.length, 3);
  for (const [x,y,angle,color] of arrows) {
    assert(x >= 28 && x <= 1252 && y >= 28 && y <= 692);
    assert.equal(color, '#39ff14'); assert(Number.isFinite(angle));
  }
  assert.equal(arrows[2][0],600); assert.equal(arrows[2][1],370);
  assert.equal(arrows[2][2],Math.PI/2);
}

// Results: first confirm skips; the next press activates. All routes share it.
const results = new ScoreScreen();
let restarts = 0, masks = 0, next = 0;
results.onRestart = () => restarts++;
results.onChangeMask = () => masks++;
results.onNextWave = () => next++;
results.show('GAME_OVER', run);
const evaluated = JSON.stringify(results.breakdown);
results.update(.2, { isMenuConfirmJustPressed: () => true });
assert.equal(restarts, 0); assert(results.tallyComplete);
results.update(.016, { isMenuConfirmJustPressed: () => true });
assert.equal(restarts, 1);
results.handleKeyDown({ key: 'r', repeat: true }); assert.equal(restarts, 1);
results.handleKeyDown({ key: 'Tab' }); assert(results.showLeaderboard);
results.handleKeyDown({ key: 'Escape' }); assert(!results.showLeaderboard);
results.update(.016, { gamepad: { connected: true, justPressed: { buttonX: true } } });
assert(results.showLeaderboard);
results.update(.016, { gamepad: { connected: true, justPressed: { buttonY: true } } });
assert.equal(masks, 1);
assert.equal(JSON.stringify(results.breakdown), evaluated);
for (const [width, height] of [[1280,720],[1440,900],[1920,1080],[2560,1440],[3440,1440]]) {
  results.show('WAVE_CLEAR', run);
  assert(!results.showLeaderboard);
  const f = results.frame(width, height);
  results.handleClick(f.x + 150 * f.scale, f.y + 676 * f.scale, width, height);
  assert(results.tallyComplete);
  const before = next;
  results.handleClick(f.x + 150 * f.scale, f.y + 676 * f.scale, width, height);
  assert.equal(next, before + 1);
}
const colors = new Set();
for (const grade of CONFIG.SCORING.GRADES) {
  results.show('WAVE_CLEAR', { ...run, score: grade.minScore });
  assert.equal(results.breakdown.grade, grade.grade);
  colors.add(results.breakdown.gradeColor);
}
assert.equal(colors.size, 6);
results.show('WAVE_CLEAR', run);
for (let i = 0; i < 120; i++) results.update(1 / 60);
assert(results.stampLanded); assert.equal(results.stampScale, 1);
console.log('PASS results skip, keyboard/gamepad/click routes, six grades, responsive hit regions and score isolation');

results.eventDrivenKeyboard = true;
results.show('GAME_OVER', run);
const masksBefore = masks;
results.handleKeyDown({key:'m',code:'Semicolon'}, true);
results.update(.016, {isJustPressed:()=>true});
assert.equal(masks,masksBefore+1,'AZERTY printed M reaches characters once');
results.update(.016, {isJustPressed:()=>true});
assert.equal(masks,masksBefore+1,'polled keyboard cannot replay queued actions');
assert.match(results.shareText(), /🌊 Vague : 1/);
assert.match(results.shareText(), /🔥 Grade : D/);
assert(results.shareText().endsWith('https://tar-gezed.github.io/hotline-viseo/'));
results.show('GAME_OVER',run);
results.update(1.58); assert(results.stampScale>1.4); assert(!results.stampLanded);
results.update(.161); assert(results.stampLanded); assert(results.stampScale<1);
results.update(.12); assert.equal(results.stampScale,1);
