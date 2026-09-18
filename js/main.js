/**
 * Hotline Miami: VISEO Arcade Edition - Master Game Loop & Integration
 * 
 * Orchestrates:
 * - 80s Synthwave aesthetic, CRT post-processing, dynamic camera lookahead & trauma shake
 * - Full VISEO floor plan geometry & loopable corridor navigation
 * - One-hit-kill combat, weapon arsenal, weapon throwing, door slams, glass shattering
 * - Downed enemies & brutal ground executions
 * - Multi-archetype enemy AI (Mobsters, Shotgunners, Attack Dogs, Heavy Bouncers)
 * - Persistent blood splatter canvas, expanding pools, severed limbs, shell casings
 * - Procedural Web Audio synthwave music and visceral sound effects
 * - Progressive Arcade Wave Survival (Wave 1 to Infinite) & Hotline Miami Letter Grade (S/A+)
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Canvas & Context Setup
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const sceneCanvas = document.createElement('canvas');
  const sceneCtx = sceneCanvas.getContext('2d', { alpha: false });
  const pixelCanvas = document.createElement('canvas');
  const pixelCtx = pixelCanvas.getContext('2d', { alpha: false });

  // Post-Processor & Visual FX
  let postProcessor = null;
  let bloodSystem = null;
  let particleSystem = null;
  let combatEffects = null;

  // Audio Engines
  let synthMusic = null;
  let soundFX = null;

  // Game Engine & World
  let camera = null;
  let input = null;
  let mapData = null;
  let mapRenderer = null;
  let navGraph = null;

  // Entities
  let player = null;
  let enemies = [];
  let floorWeapons = [];
  let bullets = [];
  let thrownWeapons = [];
  let waveSpawner = null;

  // UI & Menus
  let maskMenu = null;
  let titleMenu, controlsMenu, audioMenu, toolsMenu, creditsMenu, pauseMenu, audioSettings;
  let audioReturnState;
  let resumeState;
  let hud = null;
  let scoreScreen = null;

  // Game State Machine
  const STATES = {
    MENU_TITLE: 'MENU_TITLE',
    MENU_CREDITS: 'MENU_CREDITS',
    MENU_MASK: 'MENU_MASK',
    MENU_CONTROLS: 'MENU_CONTROLS',
    MENU_AUDIO: 'MENU_AUDIO',
    MENU_TOOLS: 'MENU_TOOLS',
    PLAYING: 'PLAYING',
    INTERMISSION: 'INTERMISSION',
    DEAD: 'DEAD',
    GAME_OVER: 'GAME_OVER',
    PAUSED: 'PAUSED'
  };
  let gameState = STATES.MENU_TITLE;
  let selectedMaskId = 'vincent';
  let waitingForAttackRelease = false;
  let deathTimer = 0;
  let deathStatsCaptured = false;

  // Timing & Performance
  let lastTime = performance.now();
  let hitStopTimer = 0; // Slow-motion hit stop for lethal punchiness

  // Run Statistics
  let runStats = {
    score: 0,
    waveReached: 1,
    totalKills: 0,
    meleeKills: 0,
    gunKills: 0,
    executions: 0,
    doorSlams: 0,
    maxCombo: 0,
    weaponsUsed: new Set(),
    elapsedTime: 0,
    maskId: 'vincent'
  };

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  let initialized = false;
  async function init() {
    if (initialized) return;
    initialized = true;
    if (window.MapLoader) {
      try { await window.MapLoader.load(); }
      catch (error) { window.MapLoader.reportError(error); return; }
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize Audio
    const SynthClass = window.SynthMusic || window.SynthMusicEngine || (typeof SynthMusicEngine !== 'undefined' ? SynthMusicEngine : null);
    synthMusic = window.synthMusic || new SynthClass();
    const SfxClass = window.SoundEffects || window.SoundEffectsEngine || (typeof SoundEffectsEngine !== 'undefined' ? SoundEffectsEngine : null);
    // Entity modules capture this singleton at script load; UI and gameplay must
    // use the same gain node so the SFX preference applies to every sound.
    soundFX = window.soundFX || new SfxClass();
    window.synthMusic = synthMusic;
    window.soundFX = soundFX;
    window.soundFx = soundFX;
    window.AudioManager = soundFX;
    window.soundEffects = soundFX;
    window.audioManager = {
      playGunshot: (type, x, y) => soundFX.playGunshot(type, x, y),
      playMeleeSwing: (type) => soundFX.playMeleeSwing(type),
      playMeleeImpact: (type, isFlesh) => soundFX.playMeleeImpact(type, isFlesh),
      playExecution: () => soundFX.playExecution(),
      playDoorKick: () => soundFX.playDoorKick(),
      playGlassShatter: () => soundFX.playGlassShatter(),
      playShellBounce: (type) => soundFX.playShellBounce(type),
      playEmptyClick: () => soundFX.playEmptyClick(),
      playComboChime: (combo) => soundFX.playComboChime(combo)
    };

    // Initialize Map & Navigation
    mapData = window.MapData || (typeof MapData !== 'undefined' ? MapData : null);
    const MapRendererClass = window.MapRenderer || (typeof MapRenderer !== 'undefined' ? MapRenderer : null);
    mapRenderer = new MapRendererClass(mapData);
    const PathfindingModule = window.Pathfinding || (typeof Pathfinding !== 'undefined' ? Pathfinding : null);
    navGraph = new PathfindingModule.NavGraph(mapData);

    // Initialize Camera & Input
    const CameraClass = window.Camera || (typeof Camera !== 'undefined' ? Camera : null);
    camera = new CameraClass(canvas.width, canvas.height);
    if (mapData && mapData.spawnPoints && mapData.spawnPoints.player) {
      camera.snapTo(mapData.spawnPoints.player.x, mapData.spawnPoints.player.y);
    }
    const InputClass = window.InputManager || (typeof InputManager !== 'undefined' ? InputManager : null);
    input = new InputClass(canvas, camera);
    window.gameCamera = camera;
    camera.floorPolygon = mapData.buildingFootprint;

    // Initialize FX & Shaders
    const PostClass = window.PostProcessor || (typeof PostProcessor !== 'undefined' ? PostProcessor : null);
    postProcessor = new PostClass(canvas);
    const BloodClass = window.BloodSystem || (typeof BloodSystem !== 'undefined' ? BloodSystem : null);
    bloodSystem = new BloodClass(mapData.MAP_WIDTH, mapData.MAP_HEIGHT);
    const ParticleClass = window.ParticleSystem || (typeof ParticleSystem !== 'undefined' ? ParticleSystem : null);
    particleSystem = new ParticleClass();
    particleSystem.onSoundTrigger = (shellType) => {
      if (soundFX && typeof soundFX.playShellBounce === 'function') soundFX.playShellBounce(shellType);
    };

    combatEffects = {
      spawnMuzzleFlash: (x, y, angle, weaponType = 'pistol') => particleSystem.spawnMuzzleFlash(x, y, angle, typeof weaponType === 'string' ? weaponType.toLowerCase() : 'pistol'),
      spawnShellCasing: (x, y, angle, weaponType = 'pistol') => particleSystem.spawnCasing(x, y, angle, typeof weaponType === 'string' ? weaponType.toLowerCase() : 'pistol'),
      spawnBlood: (x, y, angle, count = 12) => bloodSystem.createSpray(x, y, angle, 0.5, count),
      spawnArterialSpurt: (x, y, angle) => bloodSystem.createSpray(x, y, angle, 0.22, 28, { speedMin: 180, speedMax: 480 }),
      spawnBloodPool: (x, y, radius = 28) => bloodSystem.createBloodPool(x, y, radius),
      spawnMeleeTrail: () => {},
      spawnFloatingText: (text, x, y, color) => particleSystem.addFloatingText(x, y, text, color || '#ffe600', 18),
      spawnSparks: (x, y, normal) => particleSystem.spawnImpact(x, y, Math.atan2(normal && normal.y || 0, normal && normal.x || 0), 'wall'),
      addBulletHole: (x, y, normal) => mapRenderer.addBulletHole(x, y, normal && normal.x || 0, normal && normal.y || 0)
    };

    window.bloodSystem = bloodSystem;
    window.particleSystem = particleSystem;
    window.postProcessor = postProcessor;

    // Initialize UI
    const MaskMenuClass = window.MaskMenu || (typeof MaskMenu !== 'undefined' ? MaskMenu : null);
    maskMenu = new MaskMenuClass();
    let settingsStorage;
    try { settingsStorage = window.localStorage; } catch (_) { /* Session-only settings. */ }
    audioSettings = new window.AudioSettings(synthMusic, soundFX, settingsStorage);
    const backToTitle = () => enterMenu(STATES.MENU_TITLE);
    maskMenu.onBack = () => { selectedMaskId = maskMenu.selectedMaskId; backToTitle(); };
    titleMenu = new window.TitleMenu({
      start: () => enterMenu(STATES.MENU_MASK),
      controls: () => enterMenu(STATES.MENU_CONTROLS),
      audio: () => openAudio(STATES.MENU_TITLE),
      tools: () => enterMenu(STATES.MENU_TOOLS),
      credits: () => enterMenu(STATES.MENU_CREDITS)
    });
    creditsMenu = new window.CreditsMenu(backToTitle);
    controlsMenu = new window.ControlsMenu(backToTitle);
    toolsMenu = new window.ToolsMenu(backToTitle);
    audioMenu = new window.AudioMenu(audioSettings, () => enterMenu(audioReturnState));
    pauseMenu = new window.PauseMenu({
      resume: resumeGame,
      audio: () => openAudio(STATES.PAUSED),
      restart: () => { pauseMenu.hide(); startNewGame(selectedMaskId); }
    });
    const HudClass = window.GameHUD || (typeof GameHUD !== 'undefined' ? GameHUD : null);
    hud = new HudClass();
    // Resolve the victory fonts/glyphs in the menu, not on the first wave's
    // final frame (the checkmark can trigger a separate fallback font).
    const textWarmup = document.createElement('canvas');
    textWarmup.width = 1024;
    textWarmup.height = 192;
    const textWarmupCtx = textWarmup.getContext('2d');
    hud._drawIntermissionBanner(textWarmupCtx, 1024, 192);
    new window.FloatingText(512, 64, 'WAVE 0123456789 COMPLETE! +', { fontSize: 28 }).draw(textWarmupCtx);
    // Materialize the offscreen text before entering the animation loop.
    ctx.drawImage(textWarmup, 0, 0);
    const ScoreClass = window.ScoreScreen || (typeof ScoreScreen !== 'undefined' ? ScoreScreen : null);
    scoreScreen = new ScoreClass();

    // Hook UI Callbacks
    maskMenu.onMaskConfirmed = (maskParam) => {
      const maskId = typeof maskParam === 'object' && maskParam ? (maskParam.id || 'vincent') : (maskParam || 'vincent');
      selectedMaskId = maskId;
      maskMenu.hide();
      startNewGame(selectedMaskId);
    };

    scoreScreen.onRestart = () => {
      scoreScreen.hide();
      startNewGame(selectedMaskId);
    };

    scoreScreen.onChangeMask = () => {
      scoreScreen.hide();
      enterMenu(STATES.MENU_MASK);
    };

    // Initialize Wave Spawner
    waveSpawner = new WaveSpawner();
    window.waveSpawner = waveSpawner;
    initWaveSpawnerHooks();

    // Global Debris & Audio Hooks
    window.game = {
      spawnDebris: (x, y, type, count, dirX, dirY) => {
        if (type === 'glass') {
          particleSystem.shatterGlass(x, y, count || 40, dirX || 0, dirY || 0);
          soundFX.playGlassShatter();
          addTrauma(0.15);
        } else if (type === 'wood') {
          particleSystem.spark(x, y, dirX || 0, dirY || 0, count || 12, '#c19a6b');
        } else {
          particleSystem.spark(x, y, dirX || 0, dirY || 0, count || 8);
        }
      },
      addBlood: (x, y, amount) => {
        bloodSystem.addBloodPool(x, y, amount || 20);
      }
    };

    // A distinct title is the normal entry point, including map previews.
    enterMenu(STATES.MENU_TITLE);

    // Start Animation Loop
    requestAnimationFrame(gameLoop);
  }

  function activeMenu() {
    return ({
      [STATES.MENU_TITLE]: titleMenu, [STATES.MENU_MASK]: maskMenu,
      [STATES.MENU_CONTROLS]: controlsMenu, [STATES.MENU_AUDIO]: audioMenu,
      [STATES.MENU_CREDITS]: creditsMenu,
      [STATES.MENU_TOOLS]: toolsMenu, [STATES.PAUSED]: pauseMenu
    })[gameState];
  }

  function enterMenu(state) {
    activeMenu()?.hide();
    gameState = state;
    const menu = activeMenu();
    if (state === STATES.MENU_MASK) menu.show(selectedMaskId);
    else menu?.show();
    if (state === STATES.MENU_TITLE || state === STATES.MENU_MASK) {
      audioSettings.apply();
      synthMusic.play('menu');
    }
  }

  function openAudio(from) {
    audioReturnState = from;
    enterMenu(STATES.MENU_AUDIO);
  }

  function pauseGame() {
    resumeState = gameState;
    pauseMenu.selectedIndex = 0;
    enterMenu(STATES.PAUSED);
  }

  function resumeGame() {
    pauseMenu.hide();
    gameState = resumeState || STATES.PLAYING;
    waitingForAttackRelease = true;
  }

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    sceneCanvas.width = canvas.width;
    sceneCanvas.height = canvas.height;
    pixelCanvas.width = Math.ceil(canvas.width / 2);
    pixelCanvas.height = Math.ceil(canvas.height / 2);
    if (camera) {
      camera.viewportWidth = canvas.width;
      camera.viewportHeight = canvas.height;
    }
    if (postProcessor) {
      postProcessor.resize(canvas.width, canvas.height);
    }
  }

  function addTrauma(amount) {
    // One authoritative shake system: Camera. PostProcessor trauma offsets are not
    // part of the render transform and keeping two accumulators made behavior hard
    // to reason about and restarts inconsistent.
    if (camera && typeof camera.addTrauma === 'function') camera.addTrauma(amount);
  }

  function triggerHitStop(seconds = 0.06) {
    hitStopTimer = Math.max(hitStopTimer, Math.max(0, seconds));
    if (postProcessor && typeof postProcessor.hitStop === 'function') postProcessor.hitStop(seconds);
  }

  function awardKill(basePoints, label, x, y, killType = 'KILL') {
    if (hud && typeof hud.addKillScore === 'function') hud.addKillScore(killType, basePoints, x, y, label);
    runStats.maxCombo = Math.max(runStats.maxCombo || 1, hud.comboCount || 1);
  }

  function unlockAudio() {
    // Also retain gestures received while the selected map is still loading.
    const music = synthMusic || window.synthMusic;
    const effects = soundFX || window.soundFX;
    if (music && !music.isInitialized) music.init();
    if (effects && !effects.isInitialized) effects.init();
    for (const engine of [music, effects]) {
      if (engine?.ctx?.state === 'suspended' || engine?.ctx?.state === 'interrupted') {
        engine.ctx.resume().catch(() => { /* Retry on the next trusted interaction. */ });
      }
    }
  }

  // Touch activation occurs on release; no menu selection is required to unlock audio.
  window.addEventListener('pointerup', unlockAudio);
  window.addEventListener('touchend', unlockAudio, { passive: true });
  window.addEventListener('focus', unlockAudio);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) unlockAudio();
  });

  // ---------------------------------------------------------------------------
  // Wave Spawner Hooks
  // ---------------------------------------------------------------------------
  function initWaveSpawnerHooks() {
    waveSpawner.onPreWave = (waveNum, totalEnemies) => {
      hud.setWave(waveNum, totalEnemies);
      hud.preWaveTime = waveSpawner.preWaveTimeTotal;
      synthMusic.play('wave_clear');
      synthMusic.setIntensity(0.08);
      gameState = STATES.PLAYING;
    };

    waveSpawner.onWaveStart = (waveNum, totalEnemies) => {
      hud.setWave(waveNum, totalEnemies);
      soundFX.playWaveStartSiren();
      postProcessor.screenFlash('#00f3ff', 0.4);
      addTrauma(0.3);
      synthMusic.play('combat');
      gameState = STATES.PLAYING;
    };

    waveSpawner.onEnemySpawned = (enemyData) => {
      let archetypeKey = 'STANDARD';
      const t = (enemyData.type || '').toUpperCase();
      if (t.includes('SHOTGUN')) archetypeKey = 'SHOTGUNNER';
      else if (t.includes('DOG')) archetypeKey = 'DOG';
      else if (t.includes('HEAVY') || t.includes('BOUNCER') || t.includes('BOSS')) archetypeKey = 'HEAVY';
      else archetypeKey = 'STANDARD';

      const enemy = new Enemy(enemyData.x, enemyData.y, archetypeKey, enemyData.weapon || 'unarmed');
      enemy.angle = enemyData.angle ?? 0;
      // Wave enemies enter already hunting: survival pacing, not static room sentries.
      enemy.state = 'SUSPICIOUS';
      enemy.investigateX = player ? player.x : enemy.x;
      enemy.investigateY = player ? player.y : enemy.y;
      enemy.investigateTimer = 8;
      enemy.entryTimer = 0.55;
      enemy.alertIndicatorTimer = 0.8;
      enemy.isWaveHunter = true;
      if (enemyData.patrol && navGraph) {
        enemy.patrolNodes = navGraph.getPatrolRoute(enemyData.patrol) || [];
      }
      enemies.push(enemy);
      const livingCount = enemies.filter(e => e.isAlive).length;
      const queuedCount = waveSpawner ? waveSpawner.spawnQueue.length : 0;
      hud.setEnemiesRemaining(livingCount + queuedCount);
    };

    waveSpawner.onWaveClear = (waveNum, bonusPoints) => {
      runStats.wavesCleared = waveNum;
      gameState = STATES.INTERMISSION;
      soundFX.playWaveClearFanfare();
      synthMusic.play('wave_clear');
      postProcessor.screenFlash('#39ff14', 0.5);
      // Keep intermission responsive; the final hit already supplies hit-stop.
      hud.addScore(bonusPoints, 'WAVE CLEAR BONUS');
      hud.setIntermission(waveSpawner.intermissionTimeTotal);
      particleSystem.addFloatingText(player.x, player.y - 40, `WAVE ${waveNum} COMPLETE! +${bonusPoints}`, '#39ff14', 28);
    };

    waveSpawner.onSupplySpawned = (crate) => {
      // Spawn high-tier floor weapons near crate
      const weaponTypes = ['shotgun', 'assault_rifle', 'magnum', 'katana', 'uzi'];
      const pick = weaponTypes[Math.floor(Math.random() * weaponTypes.length)];
      spawnFloorWeapon(crate.x, crate.y, pick);
      particleSystem.spark(crate.x, crate.y, 0, 0, 16, '#ffe600');
    };
  }

  // ---------------------------------------------------------------------------
  // Start New Game Run
  // ---------------------------------------------------------------------------
  function startNewGame(maskInput) {
    audioSettings.apply();
    const maskId = typeof maskInput === 'object' && maskInput ? (maskInput.id || 'vincent') : (maskInput || 'vincent');
    selectedMaskId = maskId;
    deathTimer = 0;
    deathStatsCaptured = false;

    // Reset World State
    enemies = [];
    bullets = [];
    floorWeapons = [];
    thrownWeapons = [];

    // Reset Blood and Particles
    bloodSystem.clear();
    particleSystem.clear();

    // Reset Doors and Glass
    mapData.doors.forEach(d => { if (d && d.reset) d.reset(); });
    mapData.glassPartitions.forEach(g => { if (g && g.reset) g.reset(); });

    // Reset Player
    const spawnP = (mapData && mapData.spawnPoints && mapData.spawnPoints.player) || (mapData && mapData.playerSpawn) || { x: 2150, y: 1480, angle: -2.35 };
    player = new Player(spawnP.x, spawnP.y, String(maskId).toUpperCase());
    player.angle = spawnP.angle ?? -2.35;
    if (input && typeof input.setPlayer === 'function') {
      input.setPlayer(player);
    }
    player.onExecutionComplete = (target) => {
      if (!target) return;
      bloodSystem.groundExecution(target.x, target.y, { angle: player.angle });
      triggerHitStop(0.10);
      addTrauma(0.55);
      postProcessor.screenFlash('#ff0055', 0.12);
      runStats.totalKills++;
      runStats.weaponsUsed.add(player.currentWeapon.id);
      runStats.executions++;
      runStats.meleeKills++;
      awardKill(1000, 'EXECUTION', target.x, target.y, 'EXECUTION');

      collectEnemyDrop(target);
    };

    // Reset Camera immediately to player position
    camera.snapTo(player.x, player.y);
    if (typeof camera.resetTrauma === 'function') camera.resetTrauma();
    if (postProcessor && typeof postProcessor.resetTransientEffects === 'function') postProcessor.resetTransientEffects();

    // Reset Stats
    runStats = {
      runId: crypto.randomUUID(),
      wavesCleared: 0,
      score: 0,
      waveReached: 1,
      totalKills: 0,
      meleeKills: 0,
      gunKills: 0,
      executions: 0,
      doorSlams: 0,
      maxCombo: 0,
      weaponsUsed: new Set(),
      elapsedTime: 0,
      maskId: maskId
    };



    // Spawn Initial Map Weapons
    const initWeapons = mapData.weapons || (mapData.spawnPoints && mapData.spawnPoints.weapons) || [];
    initWeapons.forEach(w => {
      spawnFloorWeapon(w.x, w.y, w.type, w.ammo ?? null, w.angle ?? null);
    });

    // Reset HUD
    hud.reset();
    hud.setMask(maskId);
    hud.setWeapon(player.currentWeapon, player.ammo);

    // Initialize Wave 1
    const spLocs = mapData.spawnLocations || (mapData.spawnPoints && mapData.spawnPoints.spawnLocations) || null;
    waveSpawner.setCustomSpawnPoints(spLocs, mapData.crateLocations || (mapData.spawnPoints && mapData.spawnPoints.crateLocations) || null);
    waveSpawner.start(maskId, { x: player.x, y: player.y });

    // Keep the large control cheat-sheet out of active gameplay.
    const instructionsOverlay = document.getElementById('instructions-overlay');
    if (instructionsOverlay) instructionsOverlay.classList.add('gameplay-hidden');

    // Menu confirmation must not leak into the first attack/pickup of the run.
    input.reset();
    waitingForAttackRelease = true;
    // PREWAVE hook owns the calm intro; combat audio starts at onWaveStart.
    gameState = STATES.PLAYING;
  }

  function spawnFloorWeapon(x, y, weaponType, ammo = null, angle = null) {
    const wDef = (WeaponSystem && WeaponSystem.getWeaponType) ? WeaponSystem.getWeaponType(weaponType) : (WeaponSystem.WEAPON_TYPES[String(weaponType).toUpperCase()] || WeaponSystem.WEAPON_TYPES.BAT);
    const finalAmmo = ammo !== null ? ammo : (wDef.isGun ? (wDef.maxAmmo || wDef.magSize || 12) : 0);
    const dropped=new WeaponSystem.FloorWeapon(x, y, wDef, finalAmmo);
    if(Number.isFinite(angle))dropped.angle=angle;
    floorWeapons.push(dropped);
  }

  // ---------------------------------------------------------------------------
  // Input Handling
  // ---------------------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F2') {
      e.preventDefault();
      if (!e.repeat && window.MapDebug) window.MapDebug.enabled = !window.MapDebug.enabled;
      return;
    }
    if (e.code === 'F3') {
      e.preventDefault();
      if (!e.repeat) {
        if (gameState === STATES.PLAYING || gameState === STATES.INTERMISSION) {
          pauseGame();
        }
        window.open('map_editor.html', '_blank', 'noopener');
      }
      return;
    }
    unlockAudio();
    if (gameState === STATES.GAME_OVER && scoreScreen) {
      scoreScreen.handleKeyDown(e);
    }
  });

  window.addEventListener('mousedown', (e) => {
    unlockAudio();
    if (gameState === STATES.GAME_OVER && scoreScreen) {
      scoreScreen.handleClick(e.clientX, e.clientY, canvas.width, canvas.height);
    }
  });

  window.addEventListener('contextmenu', (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
  });

  function handlePlayerAttack() {
    if (!player || !player.isAlive) return;

    // Check if player is near a downed enemy to execute
    const downedEnemy = enemies.find(en => en.state === 'KNOCKED_DOWN' && Math.hypot(en.x - player.x, en.y - player.y) < 32 && canReachTarget(player, en, mapData));
    if (downedEnemy) {
      executeEnemy(downedEnemy);
      return;
    }

    // Normal Weapon Attack
    const attackResult = player.attack(input.worldMouseX, input.worldMouseY);
    if (!attackResult) return;

    hud.setWeapon(player.currentWeapon, player.ammo);


    if (attackResult.type === 'GUN_FIRED') {
      const weaponId = (attackResult.weaponId || 'pistol').toLowerCase();
      addTrauma(attackResult.trauma || 0.3);
      player.recoilOffset = weaponId.includes('shotgun') || weaponId.includes('magnum') ? 10 : 6;
      particleSystem.spawnMuzzleFlash(attackResult.flashX, attackResult.flashY, attackResult.flashAngle, weaponId);
      particleSystem.spawnCasing(attackResult.shellX, attackResult.shellY, player.angle, weaponId.includes('shotgun') ? 'shotgun' : (weaponId.includes('magnum') ? 'magnum' : (weaponId.includes('m16') ? 'rifle' : 'pistol')));
      if (soundFX && typeof soundFX.playGunshot === 'function') soundFX.playGunshot(attackResult.weaponId, player.x, player.y);

      // Haptic Vibration (Dual-Rumble)
      if (input && typeof input.vibrate === 'function') {
        const wId = attackResult.weaponId ? attackResult.weaponId.toLowerCase() : '';
        if (wId.includes('shotgun') || wId.includes('magnum') || wId.includes('double')) {
          input.vibrate(120, 0.9, 0.7);
        } else if (wId.includes('uzi') || wId.includes('assault') || wId.includes('m16') || wId.includes('machine')) {
          input.vibrate(60, 0.6, 0.4);
        } else {
          input.vibrate(80, 0.75, 0.5);
        }
      }

      // Spawn Projectiles / Bullets
      if (attackResult.bullets) {
        attackResult.bullets.forEach(b => bullets.push(b));
      }

      // Acoustic Sound Propagation (Alert nearby enemies)
      if (!attackResult.isSilent) {
        alertEnemiesInRadius(player.x, player.y, attackResult.soundRadius || 650);
      }
    } else if (attackResult.type === 'MELEE_SWING') {
      soundFX.playMeleeSwing(attackResult.weaponId);
      addTrauma(0.06);
      if (input && typeof input.vibrate === 'function') {
        input.vibrate(50, 0.4, 0.3);
      }

      // Check Melee Hit in Arc
      checkMeleeHit(attackResult);
    } else if (attackResult.type === 'DRY_FIRE') {
      soundFX.playEmptyClick();
    }
  }

  function handlePlayerRightClick() {
    if (!player || !player.isAlive) return;

    // Check if there is a floor weapon within pickup radius
    let nearestWeapon = null;
    let minDist = 65;
    for (let i = 0; i < floorWeapons.length; i++) {
      const fw = floorWeapons[i];
      const d = Math.hypot(fw.x - player.x, fw.y - player.y);
      if (d < minDist && canReachTarget(player, fw, mapData)) {
        minDist = d;
        nearestWeapon = fw;
      }
    }

    if (nearestWeapon) {
      // Pick up weapon
      const oldWeapon = player.currentWeapon;
      const oldAmmo = player.ammo;

      const weaponToEquip = nearestWeapon.def || nearestWeapon.type;
      player.equipWeapon(weaponToEquip, nearestWeapon.ammo);
      floorWeapons = floorWeapons.filter(w => w !== nearestWeapon);

      // Drop old weapon if not fists
      if (oldWeapon && oldWeapon.id !== 'FISTS' && oldWeapon.id !== 'fists' && oldWeapon.id !== 'unarmed') {
        spawnFloorWeapon(player.x, player.y, oldWeapon.id, oldAmmo);
      }

      if (soundFX && soundFX.playWeaponPickup) soundFX.playWeaponPickup();
      if (input && typeof input.vibrate === 'function') input.vibrate(60, 0.35, 0.4);
      hud.setWeapon(player.currentWeapon, player.ammo);
      if (particleSystem && particleSystem.addFloatingText) {
        particleSystem.addFloatingText(player.x, player.y - 30, `PICKED UP ${player.currentWeapon.name.toUpperCase()}`, '#00f3ff', 16);
      }
    } else if (player.currentWeapon && player.currentWeapon.id !== 'FISTS' && player.currentWeapon.id !== 'fists' && player.currentWeapon.id !== 'unarmed') {
      // Throw currently held weapon!
      const thrown = player.throwWeapon(input.worldMouseX, input.worldMouseY);
      if (thrown) {
        thrownWeapons.push(thrown);
        if (soundFX && soundFX.playWeaponThrow) soundFX.playWeaponThrow();
        if (input && typeof input.vibrate === 'function') input.vibrate(70, 0.5, 0.3);
        hud.setWeapon(player.currentWeapon, player.ammo);
      }
    }
  }

  function executeEnemy(enemy) {
    if (!enemy || enemy.state !== 'KNOCKED_DOWN' || !canReachTarget(player, enemy, mapData)) return;

    player.startExecution(enemy);
    enemy.isBeingExecuted = true;
    soundFX.playExecution();
    triggerHitStop(0.12);
    addTrauma(0.4);
    if (input && typeof input.vibrate === 'function') {
      input.vibrate(220, 0.95, 0.85);
    }

    // The target remains alive-but-pinned for the 3-hit execution animation.
    // Gore and score are committed by player.onExecutionComplete, not immediately.
    particleSystem.addFloatingText(enemy.x, enemy.y - 26, 'FINISH HIM', '#ff007f', 16);
  }

  function alertEnemiesInRadius(x, y, radius) {
    for (let i = 0; i < enemies.length; i++) {
      const en = enemies[i];
      if (!en.isAlive || en.state === 'DEAD' || en.state === 'KNOCKED_DOWN') continue;

      const dist = Math.hypot(en.x - x, en.y - y);
      if (dist <= radius) {
        en.onHeardSound(x, y, radius);
      }
    }
  }

  function canReachTarget(actor, target, geometry) {
    if (!actor || !target) return false;
    const dx = target.x - actor.x, dy = target.y - actor.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) return true;
    return !Physics.castRay(geometry, new Physics.Vec2(actor.x, actor.y),
      new Physics.Vec2(dx / distance, dy / distance), distance, { ignoreGlass: false }).hit;
  }

  function checkMeleeHit(attack) {
    for (let i = 0; i < enemies.length; i++) {
      const en = enemies[i];
      if (!en.isAlive || en.state === 'DEAD') continue;

      const dx = en.x - player.x;
      const dy = en.y - player.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= attack.range + en.radius && canReachTarget(player, en, mapData)) {
        const angleToEnemy = Math.atan2(dy, dx);
        let angleDiff = Math.abs(angleToEnemy - attack.angle);
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        angleDiff = Math.abs(angleDiff);

        if (angleDiff <= attack.arc * 0.5) {
          // Melee Hit!
          handleEnemyMeleeHit(en, attack);
        }
      }
    }
  }

  function handleEnemyMeleeHit(enemy, attack) {
    soundFX.playMeleeImpact(attack.weaponId, true);
    triggerHitStop(0.06);
    addTrauma(0.25);
    if (input && typeof input.vibrate === 'function') {
      input.vibrate(100, 0.8, 0.6);
    }

    if (String(attack.weaponId).toUpperCase() === 'KATANA') {
      bloodSystem.katanaSlice(enemy.x, enemy.y, attack.angle);
    } else if (attack.isLethal || player.mask === 'TONY') {
      bloodSystem.decapitation(enemy.x, enemy.y, attack.angle);
    } else {
      bloodSystem.sprayBlood(enemy.x, enemy.y, attack.angle, 18);
    }

    if (enemy.archetype && enemy.archetype.isHeavy && !attack.isLethal && player.mask !== 'TONY') {
      enemy.takeHit({ type: 'MELEE', damage: 1, isLethal: false, knockdown: false, angle: attack.angle, weaponType: attack.weaponId });
      return;
    }

    if (attack.isLethal || player.mask === 'TONY') {
      enemy.kill('MELEE', attack.angle);
      runStats.totalKills++;
      runStats.weaponsUsed.add(attack.weaponId.toUpperCase());
      runStats.meleeKills++;
      const pts = String(attack.weaponId).toUpperCase() === 'KATANA' ? 600 : 400;
      awardKill(pts, `${attack.weaponName || 'MELEE'} KILL`, enemy.x, enemy.y, 'MELEE');

    } else {
      enemy.knockDown(attack.angle, 4.5);
      hud.addScore(200, 'KNOCK DOWN');
      particleSystem.floatingComboText(enemy.x, enemy.y - 20, 200, 'KNOCK DOWN', '#00f3ff');
    }

    if (enemy.heldWeapon && enemy.heldWeapon.id !== 'unarmed') {
      spawnFloorWeapon(enemy.x, enemy.y, enemy.heldWeapon.id, enemy.ammo);
      enemy.heldWeapon = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Instructions Overlay Synchronization (Gamepad vs Keyboard Mode)
  // ---------------------------------------------------------------------------
  function updateInstructionsOverlay() {
    // Controls and development links live in their own menus now.
    const mapLink = document.getElementById('mapMenuLink');
    if (mapLink) mapLink.style.display = 'none';
    const overlay = document.getElementById('instructions-overlay');
    if (overlay) overlay.classList.add('gameplay-hidden');
  }

  // ---------------------------------------------------------------------------
  // Main Game Loop
  // ---------------------------------------------------------------------------
  function gameLoop(currentTime) {
    requestAnimationFrame(gameLoop);

    let realDt = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    if (realDt > 0.1) realDt = 0.1;

    input.update(realDt, player);
    updateInstructionsOverlay();
    if ((input.isGamepadMode || input.isMouseDown) && (!synthMusic?.isInitialized || synthMusic?.ctx?.state === 'suspended')) unlockAudio();

    let dt = realDt;
    if (hitStopTimer > 0) {
      hitStopTimer = Math.max(0, hitStopTimer - realDt);
      dt *= 0.08;
    }

    if (input.isPauseJustPressed()) {
      if (gameState === STATES.PLAYING || gameState === STATES.INTERMISSION) {
        pauseGame(); input.clearFrameTriggers(); return;
      } else if (gameState === STATES.PAUSED) {
        resumeGame(); input.clearFrameTriggers(); return;
      }
    }

    const menu = activeMenu();
    if (menu) {
      if (gameState === STATES.PAUSED && input.isRestartJustPressed()) {
        pauseMenu.hide(); startNewGame(selectedMaskId);
      } else {
        if (gameState === STATES.PAUSED && (input.isJustPressed('KeyM') || input.gamepad?.justPressed.buttonX)) audioSettings.set('muted', !audioSettings.values.muted);
        menu.update(realDt, input, canvas.width, canvas.height);
        const current = activeMenu();
        if (current) {
          if (gameState === STATES.PAUSED) renderGameWorld(0);
          current.render(ctx, canvas.width, canvas.height, input);
        }
      }
      input.clearFrameTriggers();
      return;
    }

    if (gameState === STATES.DEAD) {
      deathTimer += realDt;
      // Keep particles/camera breathing alive while freezing combat.
      particleSystem.update(realDt);
      postProcessor.update(realDt);
      camera.update(realDt, player, input);
      renderGameWorld(0);
      renderDeathOverlay();
      const canRestart = deathTimer > 0.22;
      // Space/Y is also a menu-confirm key: scores must take precedence.
      if (canRestart && input.isExecuteJustPressed()) {
        showScoreScreen();
      } else if (canRestart && (input.isRestartJustPressed() || input.isMenuConfirmJustPressed() || input.isAttackJustPressed())) {
        startNewGame(selectedMaskId);
      }
      input.clearFrameTriggers();
      return;
    }

    if (gameState === STATES.GAME_OVER) {
      scoreScreen.update(realDt, input);
      renderGameWorld(0);
      scoreScreen.render(ctx, canvas.width, canvas.height);
      input.clearFrameTriggers();
      return;
    }

    if (input.isRestartJustPressed()) {
      startNewGame(selectedMaskId);
      input.clearFrameTriggers();
      return;
    }

    if (gameState === STATES.INTERMISSION && input.isMenuConfirmJustPressed()) {
      if (waveSpawner) waveSpawner.intermissionTimer = 0;
    }

    runStats.elapsedTime += realDt;
    updateGame(dt);
    renderGameWorld(realDt);
    input.clearFrameTriggers();
  }


  function updateGame(dt) {
    if (player && player.isAlive) {
      // Movement/aim only here. Gameplay actions are owned by this integration layer,
      // preventing the old double-fire / pickup-then-immediate-throw controller bug.
      player.update(dt, input, mapData, enemies, floorWeapons, bullets, combatEffects, camera, false);
      camera.update(dt, player, input);

      if (input.isExecuteJustPressed()) {
        const downedEnemy = enemies.find(en => en.state === 'KNOCKED_DOWN' && Math.hypot(en.x - player.x, en.y - player.y) < 48 && canReachTarget(player, en, mapData));
        if (downedEnemy) executeEnemy(downedEnemy);
      }

      if (input.isThrowOrPickupJustPressed() && player.state !== 'EXECUTING') {
        handlePlayerRightClick();
      }

      if (player.state !== 'EXECUTING') {
        const attackInputReady = !waitingForAttackRelease;
        if(waitingForAttackRelease && !input.isAttackDown()) waitingForAttackRelease=false;
        const isAuto = player.currentWeapon && player.currentWeapon.automatic;
        const wantsAttack = isAuto ? input.isAttackDown() : input.isAttackJustPressed();
        if (attackInputReady && wantsAttack && player.attackCooldown <= 0) handlePlayerAttack();
      }

      checkDoorInteractions();
      checkGlassCollisions();
      checkSupplyCrateInteractions();

      if (bloodSystem.isPointInBlood(player.x, player.y)) player.stepInBlood(bloodSystem);
    }

    updateBullets(dt);
    updateThrownWeapons(dt);

    // Keep map-owned animation (doors, glass shards and persistent environment
    // state) on one authoritative update path.  This is called once per live
    // simulation tick; rendering never mutates map state.
    updateMapRenderer(mapRenderer, dt);

    if (mapData.doors) {
      mapData.doors.forEach(door => {
        if (!door || typeof door.update !== 'function') return;
        if (player && player.isAlive && typeof door.handleEntityInteraction === 'function') {
          door.handleEntityInteraction(player, player.x, player.y, player.radius || 14);
        }
        enemies.forEach(en => {
          if (en && en.isAlive && typeof door.handleEntityInteraction === 'function') {
            const wasAlive = en.isAlive;
            const wasDown = en.state === 'KNOCKED_DOWN';
            door.handleEntityInteraction(en, en.x, en.y, en.radius || 14);
            if (wasAlive && !en.isAlive) {
              bloodSystem.sprayBlood(en.x, en.y, en.deathAngle ?? en.angle, 25);
              if (door.lastKickedBy === player) {
                runStats.totalKills++;
                runStats.doorSlams++;
                awardKill(800, 'DOOR SLAM CRUSH', en.x, en.y, 'DOOR');
              }
              collectEnemyDrop(en);
              triggerHitStop(0.075);
              addTrauma(0.38);
            } else if (!wasDown && en.state === 'KNOCKED_DOWN' && door.lastKickedBy === player) {
              runStats.doorSlams++;
              hud.addScore(400, 'DOOR SLAM STUN');
            }
          }
        });
      });
    }

    updateEnemies(dt);

    bloodSystem.update(dt, bloodWallCollision);
    particleSystem.update(dt);
    postProcessor.update(dt);

    const livingCountBeforeSpawn = enemies.filter(e => e.isAlive).length;
    const waveInfo = waveSpawner.update(dt, player ? { x: player.x, y: player.y } : null, livingCountBeforeSpawn);
    hud.update(dt, waveInfo || null);

    const livingCount = enemies.filter(e => e.isAlive).length;
    const queuedCount = waveSpawner ? waveSpawner.spawnQueue.length : 0;
    hud.setEnemiesRemaining(livingCount + queuedCount);

    if (player && !player.isAlive && gameState !== STATES.DEAD && gameState !== STATES.GAME_OVER) {
      enterDeathState();
    }
  }


  function checkSupplyCrateInteractions() {
    if (!player || !player.isAlive || !waveSpawner || !waveSpawner.supplyCrates) return;
    for (let i = 0; i < waveSpawner.supplyCrates.length; i++) {
      const crate = waveSpawner.supplyCrates[i];
      if (!crate || crate.isOpened) continue;
      const d = Math.hypot(crate.x - player.x, crate.y - player.y);
      if (d < player.radius + 28) {
        crate.isOpened = true;
        if (soundFX && soundFX.playAmmoRefill) soundFX.playAmmoRefill();

        if (crate.weapon) {
          spawnFloorWeapon(crate.x, crate.y + 16, crate.weapon);
        }
        if (player.currentWeapon && player.currentWeapon.isGun) {
          const maxA = player.currentWeapon.maxAmmo || 30;
          player.ammo = Math.floor(maxA * (player.perks?.ammoCapacityMult || 1));
          hud.setWeapon(player.currentWeapon, player.ammo);
        }
        hud.addScore(500, 'RESUPPLY');
        if (particleSystem && particleSystem.addFloatingText) {
          particleSystem.addFloatingText(crate.x, crate.y - 25, 'AMMO REFILLED & WEAPON CACHE OPENED!', '#39ff14', 18);
        }
      }
    }
  }

  function checkDoorInteractions() {
    if (!player || !player.isAlive || !mapData.doors) return;

    const speed = Math.hypot(player.vx || 0, player.vy || 0);
    const explicitKick = input.isExecuteJustPressed() && player.state !== 'EXECUTING';
    if (!explicitKick) return;

    for (let i = 0; i < mapData.doors.length; i++) {
      const door = mapData.doors[i];
      if (!door || door.shattered) continue;
      const tip = door.getTipPosition ? door.getTipPosition() : { x: door.x, y: door.y };
      const d = Collision.pointToSegmentDistance(player.x, player.y, door.x, door.y, tip.x, tip.y);
      if (d > player.radius + 15) continue;

      const kickDirX = speed > 35 ? player.vx / speed : Math.cos(player.angle);
      const kickDirY = speed > 35 ? player.vy / speed : Math.sin(player.angle);
      if (explicitKick) {
        const previousDanger = door.isDangerous;
        const result = door.kick(player, kickDirX, kickDirY, (player.mask === 'DON_JUAN'||player.perks?.doorLethal) ? 34 : 27);
        if (result && result.success !== false && !previousDanger) {
          soundFX.playDoorKick();
          addTrauma(0.18);
          triggerHitStop(0.025);
        }
      }
    }
  }

  function checkGlassCollisions() {
    if (!player || !player.isAlive) return;
    for (let i = 0; i < mapData.glassPartitions.length; i++) {
      const glass = mapData.glassPartitions[i];
      if (!glass || glass.shattered) continue;
      const d = Collision.pointToSegmentDistance(player.x, player.y, glass.x1, glass.y1, glass.x2, glass.y2);
      const speed = Math.hypot(player.vx || 0, player.vy || 0);
      if (d < player.radius + 6 && speed > player.baseSpeed * 0.78) {
        glass.shatter(player.x, player.y, player.vx, player.vy);
        particleSystem.shatterGlass(player.x, player.y, 60, player.vx, player.vy);
        soundFX.playGlassShatter();
        addTrauma(0.24);
      }
    }
  }


  function rayCircleDistance(ox, oy, dx, dy, maxDistance, cx, cy, radius) {
    const fx = cx - ox;
    const fy = cy - oy;
    const projection = fx * dx + fy * dy;
    if (projection < -radius || projection > maxDistance + radius) return null;
    const closestSq = fx * fx + fy * fy - projection * projection;
    const radiusSq = radius * radius;
    if (closestSq > radiusSq) return null;
    const offset = Math.sqrt(Math.max(0, radiusSq - closestSq));
    const entry = projection - offset;
    const distance = entry >= 0 ? entry : projection + offset;
    return distance >= 0 && distance <= maxDistance ? distance : null;
  }

  function handleWorldBulletImpact(ray, bullet, dirX, dirY) {
    if (!ray || !ray.hit) return;
    const material = ray.type === 'prop' ? 'wood' : (ray.type === 'door' && ray.target && ray.target.type === 'security' ? 'metal' : 'wall');
    particleSystem.spawnImpact(ray.point.x, ray.point.y, bullet.angle, material);
    if (ray.type === 'wall') {
      mapRenderer.addBulletHole(ray.point.x, ray.point.y, ray.normal.x, ray.normal.y);
    } else if (ray.type === 'door' && ray.target && typeof ray.target.damage === 'function') {
      const damage = bullet.weaponDef && bullet.weaponDef.id === 'MAGNUM' ? 55 : (bullet.weaponDef && bullet.weaponDef.id.includes('SHOTGUN') ? 22 : 16);
      ray.target.damage(damage, ray.point.x, ray.point.y, dirX, dirY);
    } else if (ray.type === 'prop' && ray.target) {
      const prop = ray.target;
      prop.hitPulse = 0.16;
      if (window.game && window.game.spawnDebris) window.game.spawnDebris(ray.point.x, ray.point.y, 'wood', 5, -dirX, -dirY);
    }
  }

  function handlePlayerBulletHit(bullet, enemy, hitX, hitY) {
    const weaponId = bullet.weaponDef && bullet.weaponDef.id || 'PISTOL';
    const isShotgun = weaponId.includes('SHOTGUN') || weaponId.includes('DOUBLE_BARREL');
    const isMagnum = weaponId === 'MAGNUM';
    if (soundFX && soundFX.playFleshImpact) soundFX.playFleshImpact();
    triggerHitStop(isShotgun ? 0.075 : 0.045);
    addTrauma(isShotgun ? 0.42 : 0.22);

    if (isShotgun) bloodSystem.shotgunBlast(enemy.x, enemy.y, bullet.angle);
    else bloodSystem.bulletWound(enemy.x, enemy.y, bullet.angle);

    const wasAlive = enemy.isAlive;
    enemy.takeHit({
      type: 'BULLET',
      damage: isMagnum ? 3 : 1,
      isLethal: !enemy.archetype || !enemy.archetype.isHeavy || isShotgun || isMagnum,
      angle: bullet.angle,
      hitX,
      hitY,
      weaponType: weaponId
    });

    if (wasAlive && !enemy.isAlive) {
      runStats.totalKills++;
      runStats.gunKills++;
      runStats.weaponsUsed.add(weaponId);
      const pts = isShotgun ? 600 : (isMagnum ? 550 : 400);
      awardKill(pts, isShotgun ? 'SHOTGUN BLAST' : 'GUNSHOT', enemy.x, enemy.y, 'GUN');

      collectEnemyDrop(enemy);
    }
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      if (!b || b.alive === false) {
        bullets.splice(i, 1);
        continue;
      }

      b.update(dt, [], [], null, null);
      if (b.alive === false && Math.hypot(b.x - b.prevX, b.y - b.prevY) < 0.01) {
        bullets.splice(i, 1);
        continue;
      }

      const segX = b.x - b.prevX;
      const segY = b.y - b.prevY;
      const segLen = Math.hypot(segX, segY);
      if (segLen < 0.001) continue;
      const dirX = segX / segLen;
      const dirY = segY / segLen;

      const ray = Physics.castRay(
        mapData,
        new Physics.Vec2(b.prevX, b.prevY),
        new Physics.Vec2(dirX, dirY),
        segLen,
        { pierceGlass: true }
      );
      const worldDistance = ray && ray.hit ? ray.distance : segLen + 0.001;

      if (ray && ray.piercedObjects) {
        ray.piercedObjects.forEach(hit => {
          if (hit.distance <= worldDistance && hit.target && !hit.target.shattered) {
            hit.target.shatter(hit.point.x, hit.point.y, dirX, dirY);
            particleSystem.shatterGlass(hit.point.x, hit.point.y, 34, dirX * 180, dirY * 180);
            if (soundFX && soundFX.playGlassShatter) soundFX.playGlassShatter();
          }
        });
      }

      const isPlayerBullet = b.isPlayer === true || b.isPlayerBullet === true || b.isPlayer === 'player';
      const targets = isPlayerBullet ? enemies : (player && player.isAlive ? [player] : []);
      let nearest = null;
      let nearestDistance = worldDistance;
      for (let t = 0; t < targets.length; t++) {
        const target = targets[t];
        if (!target || target.state === 'DEAD' || target.isAlive === false || (b.hitEntities && b.hitEntities.has(target))) continue;
        const hitDistance = rayCircleDistance(b.prevX, b.prevY, dirX, dirY, segLen, target.x, target.y, (target.radius || 14) + 4);
        if (hitDistance !== null && hitDistance < nearestDistance) {
          nearestDistance = hitDistance;
          nearest = target;
        }
      }

      if (nearest) {
        const hitX = b.prevX + dirX * nearestDistance;
        const hitY = b.prevY + dirY * nearestDistance;
        b.x = hitX;
        b.y = hitY;
        if (b.hitEntities) b.hitEntities.add(nearest);

        if (isPlayerBullet) {
          handlePlayerBulletHit(b, nearest, hitX, hitY);
        } else {
          nearest.takeHit({ type: 'BULLET', angle: b.angle, weaponType: b.weaponDef && b.weaponDef.id });
          bloodSystem.bulletWound(nearest.x, nearest.y, b.angle);
          addTrauma(0.9);
          triggerHitStop(0.055);
          postProcessor.screenFlash('#ff1744', 0.18);
          if (soundFX && soundFX.playPlayerDeath) soundFX.playPlayerDeath();
        }

        b.pierceLeft = Math.max(0, (b.pierceLeft || 1) - 1);
        if (b.pierceLeft <= 0 || !isPlayerBullet) b.alive = false;
        if (!b.alive) {
          bullets.splice(i, 1);
          continue;
        }
      }

      if (ray && ray.hit && worldDistance <= segLen) {
        b.x = ray.point.x;
        b.y = ray.point.y;
        handleWorldBulletImpact(ray, b, dirX, dirY);
        b.alive = false;
        bullets.splice(i, 1);
        continue;
      }

      if (b.isExpired || b.alive === false) bullets.splice(i, 1);
    }
  }


  function updateThrownWeapons(dt) {
    const obstacles = mapData.walls || [];
    for (let i = thrownWeapons.length - 1; i >= 0; i--) {
      const tw = thrownWeapons[i];
      if (!tw) {
        thrownWeapons.splice(i, 1);
        continue;
      }

      // Let FloorWeapon handle movement, bounce physics, and enemy knockdown
      const before = enemies.map(enemy => ({enemy, alive:enemy.isAlive, state:enemy.state}));
      tw.update(dt, obstacles, enemies, particleSystem, camera);
      if (tw.thrownBy === 'player') for (const {enemy, alive, state} of before) {
        if (alive && !enemy.isAlive) {
          runStats.totalKills++;
          runStats.throwKills = (runStats.throwKills || 0) + 1;
          runStats.weaponsUsed.add(tw.type.toUpperCase());
          awardKill(600, 'THROW KILL', enemy.x, enemy.y, 'THROW');
          collectEnemyDrop(enemy);
        } else if (alive && state !== 'KNOCKED_DOWN' && enemy.state === 'KNOCKED_DOWN') {
          hud.addScore(200, 'THROW KNOCKDOWN');
        }
      }

      if (!tw.isFlying) {
        floorWeapons.push(tw);
        thrownWeapons.splice(i, 1);
      }
    }
  }

  function collectEnemyDrop(enemy) {
    const drop = enemy && enemy.droppedWeaponToSpawn;
    if (!drop) return;
    const def = drop.weapon || drop.weaponType;
    if (def && def.id !== 'FISTS') spawnFloorWeapon(drop.x, drop.y, def, drop.ammo);
    enemy.droppedWeaponToSpawn = null;
  }

  function bloodWallCollision(x, y, prevX, prevY) {
    const hit = Physics.raycastWalls(prevX, prevY, x, y, mapData.walls || []);
    if (!hit) return false;
    bloodSystem.addBloodDrop(hit.point.x - hit.normal.x * 1.5, hit.point.y - hit.normal.y * 1.5, 3 + Math.random() * 4, '#8b0000');
    return true;
  }

  function updateEnemies(dt) {
    for (let i = 0; i < enemies.length; i++) {
      const en = enemies[i];
      if (!en) continue;

      if (!en.isAlive) {
        // Preserve a short physical death slide instead of freezing corpses instantly.
        if (typeof en.updateDeadBody === 'function') en.updateDeadBody(dt, mapData);
        collectEnemyDrop(en);
        continue;
      }

      const bulletsBefore = bullets.length;
      if (en.isWaveHunter && player && player.isAlive) {
        if (en.state === 'PATROL') en.state = 'SUSPICIOUS';
        if (en.state === 'SUSPICIOUS') {
          en.investigateX = player.x;
          en.investigateY = player.y;
          en.investigateTimer = Math.max(en.investigateTimer || 0, 1.5);
        }
      }
      en.update(dt, player, mapData, enemies, floorWeapons, bullets, combatEffects, camera, navGraph);
      collectEnemyDrop(en);

      if (bullets.length > bulletsBefore && soundFX && typeof soundFX.playGunshot === 'function') {
        const weaponId = en.currentWeapon && en.currentWeapon.id ? en.currentWeapon.id : 'PISTOL';
        soundFX.playGunshot(weaponId, en.x, en.y);
        alertEnemiesInRadius(en.x, en.y, 520);
      }
    }
  }


  function triggerGameOver() {
    enterDeathState();
  }



  function captureRunStats() {
    if (deathStatsCaptured) return;
    deathStatsCaptured = true;
    runStats.score = hud.currentScore;
    runStats.maxCombo = Math.max(runStats.maxCombo || 0, hud.maxComboRecorded || 0);
    runStats.waveReached = waveSpawner.currentWave;
    scoreScreen.evaluateRun(runStats);
    scoreScreen.saveToLeaderboard();
  }

  function enterDeathState() {
    if (gameState === STATES.DEAD || gameState === STATES.GAME_OVER) return;
    captureRunStats();
    gameState = STATES.DEAD;
    deathTimer = 0;
    triggerHitStop(0.075);
    addTrauma(1.0);
    postProcessor.screenFlash('#ff003c', 0.22);
    if (synthMusic && typeof synthMusic.setMasterVolume === 'function') synthMusic.setMasterVolume(audioSettings.values.music * (0.32 / 0.7));
  }

  function showScoreScreen() {
    captureRunStats();
    gameState = STATES.GAME_OVER;
    if (synthMusic) synthMusic.play('game_over');
    if (soundFX && soundFX.playGameOverDrone) soundFX.playGameOverDrone();
    scoreScreen.show('GAME_OVER', runStats);
  }

  function renderDeathOverlay() {
    ctx.save();
    const pulse = 0.55 + Math.sin(deathTimer * 9) * 0.08;
    ctx.fillStyle = `rgba(10, 0, 8, ${Math.min(0.58, 0.22 + deathTimer * 0.32)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff0055';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 5; ctx.shadowOffsetY = 5;
    ctx.shadowColor = '#43182e';
    ctx.fillStyle = '#ef5489';
    const uiScale = Math.max(1, Math.min(canvas.width / 1920, canvas.height / 1080));
    ctx.font = `italic 900 ${64 * uiScale}px Impact, Arial Black, sans-serif`;
    ctx.fillText('YOU ARE DEAD', canvas.width * 0.5, canvas.height * 0.46);
    if (deathTimer > 0.20) {
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#f8f8f2';
      ctx.font = `700 ${16 * uiScale}px monospace`;
      ctx.fillText(input && input.isGamepadMode ? 'A / RT  RESTART    Y  SCORE' : 'CLICK / ENTER / R  RESTART    SPACE  SCORE', canvas.width * 0.5, canvas.height * 0.54);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Rendering Pipeline
  // ---------------------------------------------------------------------------
  function renderSpawnTelegraphs(worldCtx) {
    if (!waveSpawner || typeof waveSpawner.getSpawnTelegraphs !== 'function') return;
    const telegraphs = waveSpawner.getSpawnTelegraphs();
    const now = performance.now() * 0.006;
    telegraphs.forEach(t => {
      const pulse = 0.5 + Math.sin(now + t.x * 0.01) * 0.5;
      const r = 20 + pulse * 10;
      worldCtx.save();
      worldCtx.translate(t.x, t.y);
      worldCtx.rotate(t.angle || 0);
      worldCtx.strokeStyle = `rgba(255, 0, 85, ${0.45 + pulse * 0.45})`;
      worldCtx.lineWidth = 2.5;
      worldCtx.shadowColor = '#ff0055';
      worldCtx.shadowBlur = 10;
      worldCtx.beginPath();
      worldCtx.arc(0, 0, r, 0, Math.PI * 2);
      worldCtx.stroke();
      for (let n = 0; n < 3; n++) {
        const a = n * Math.PI * 2 / 3 + now * 0.18;
        worldCtx.beginPath();
        worldCtx.moveTo(Math.cos(a) * (r + 7), Math.sin(a) * (r + 7));
        worldCtx.lineTo(Math.cos(a) * (r + 17), Math.sin(a) * (r + 17));
        worldCtx.stroke();
      }
      worldCtx.fillStyle = '#ffb3d0';
      worldCtx.font = '700 10px monospace';
      worldCtx.textAlign = 'center';
      worldCtx.fillText(`${Math.ceil(t.countdown)}s`, 0, -r - 9);
      worldCtx.restore();
    });
  }

  function renderDynamicLights(worldCtx) {
    if (!particleSystem || typeof particleSystem.getActiveLights !== 'function') return;
    const lights = particleSystem.getActiveLights();
    if (!lights.length) return;
    worldCtx.save();
    worldCtx.globalCompositeOperation = 'screen';
    lights.forEach(light => {
      const radius = Math.max(24, light.radius || 90);
      const g = worldCtx.createRadialGradient(light.x, light.y, 0, light.x, light.y, radius);
      g.addColorStop(0, light.color || 'rgba(255,245,190,0.85)');
      g.addColorStop(0.18, 'rgba(255,190,70,0.32)');
      g.addColorStop(1, 'rgba(255,120,20,0)');
      worldCtx.fillStyle = g;
      worldCtx.fillRect(light.x - radius, light.y - radius, radius * 2, radius * 2);
    });
    worldCtx.restore();
  }

  // Dependency-injected stage dispatch keeps the complete world layering
  // observable in Node tests without booting the browser frame loop.  Each
  // environment pass executes exactly once, with actor work supplied by the
  // two explicit between-layer callbacks.
  function renderWorldLayers(renderer, worldCtx, view, betweenLayers = {}) {
    if (!renderer) return;
    renderer.renderBackground(worldCtx, view);
    if (typeof betweenLayers.afterBackground === 'function') {
      betweenLayers.afterBackground(worldCtx, view);
    }
    renderer.renderFixtures(worldCtx, view);
    if (typeof betweenLayers.afterFixtures === 'function') {
      betweenLayers.afterFixtures(worldCtx, view);
    }
    renderer.renderForeground(worldCtx, view);
  }

  function updateMapRenderer(renderer, dt) {
    if (!renderer || typeof renderer.update !== 'function') return;
    renderer.update(dt);
  }

  function renderGameWorld(dt) {
    sceneCtx.save();
    sceneCtx.setTransform(1, 0, 0, 1, 0, 0);
    sceneCtx.fillStyle = '#080510';
    sceneCtx.fillRect(0, 0, sceneCanvas.width, sceneCanvas.height);

    camera.apply(sceneCtx);
    const view = camera.getBounds();
    renderWorldLayers(mapRenderer, sceneCtx, view, {
      // Background pass: map floors/shadows/decals, then persistent blood and
      // downed bodies/weapons remain grounded beneath furniture fixtures.
      afterBackground: () => {
        bloodSystem.render(sceneCtx, view);
        enemies.filter(e => !e.isAlive || e.state === 'KNOCKED_DOWN').forEach(e => e.render(sceneCtx));
        floorWeapons.forEach(fw => { if (fw && fw.render) fw.render(sceneCtx); });
        if (waveSpawner && waveSpawner.supplyCrates) {
          waveSpawner.supplyCrates.forEach(sc => { if (sc && sc.render) sc.render(sceneCtx); });
        }
      },
      // Fixture pass: props/mural/elevators and interactive glass/doors are
      // owned by MapRenderer, then live actors/effects sit above them before
      // structural wall caps occlude their edges.
      afterFixtures: () => {
        renderSpawnTelegraphs(sceneCtx);

        enemies.filter(e => e.isAlive && e.state !== 'KNOCKED_DOWN').forEach(e => e.render(sceneCtx));
        if (player) player.render(sceneCtx);
        thrownWeapons.forEach(tw => tw.render(sceneCtx));
        bullets.forEach(b => b.render(sceneCtx));
        particleSystem.render(sceneCtx);
      }
    });
    renderDynamicLights(sceneCtx);
    if (window.MapDebug) window.MapDebug.render(sceneCtx, mapData, player, enemies);

    sceneCtx.restore();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // A shared low-resolution raster gives scenery and actors the same pixel
    // density; the camera/input remain in display pixels for exact aiming.
    pixelCtx.imageSmoothingEnabled = false;
    pixelCtx.drawImage(sceneCanvas, 0, 0, pixelCanvas.width, pixelCanvas.height);
    sceneCtx.imageSmoothingEnabled = false;
    sceneCtx.drawImage(pixelCanvas, 0, 0, canvas.width, canvas.height);
    postProcessor.render(sceneCanvas, ctx);
    if (window.MapDebug && window.MapDebug.enabled) {
      ctx.save();
      ctx.fillStyle = 'rgba(12,10,24,.92)'; ctx.fillRect(16, 92, 440, 48);
      ctx.fillStyle = '#f1ead5'; ctx.font = '12px monospace';
      ctx.fillText('F2 COLLISION VIEW  /  F3 MAP EDITOR', 28, 111);
      ctx.fillText('Pink walls · cyan glass · yellow doors · green props', 28, 130);
      ctx.restore();
    }

    if (gameState === STATES.PLAYING || gameState === STATES.INTERMISSION || gameState === STATES.DEAD) {
      hud.render(ctx, canvas.width, canvas.height, camera, enemies.filter(e => e.isAlive), player);
      if (gameState !== STATES.DEAD) input.renderCrosshair(ctx);
    }
  }

  // CommonJS consumers (the plain Node regression scripts) can exercise the
  // integration seams with lightweight stubs.  Browsers ignore this branch.
  if (typeof module === 'object' && module.exports) {
    module.exports = { renderWorldLayers, updateMapRenderer, canReachTarget };
  }


  // ---------------------------------------------------------------------------
  // Boot & Start
  // ---------------------------------------------------------------------------
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    window.addEventListener('DOMContentLoaded', init);
    window.addEventListener('load', init);
  }
})();
