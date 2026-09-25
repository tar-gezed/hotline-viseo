/**
 * Hotline Miami: VISEO Arcade Edition - Progressive Wave Spawner & Manager
 * Handles Wave 1 to Infinity scaling, tactical squad reinforcements,
 * enemy archetype progression (dogs at Wave 2, shotgunners at Wave 3, heavies at Wave 4),
 * supply crate drops, and inter-wave progression.
 */

class WaveSpawner {
  constructor() {
    this.currentWave = 0;
    this.state = 'IDLE'; // 'IDLE', 'PREWAVE', 'SPAWNING', 'IN_PROGRESS', 'INTERMISSION', 'GAME_OVER'

    // Wave Progression Stats
    this.totalWaveEnemies = 0;
    this.enemiesSpawned = 0;
    this.enemiesAlive = 0;
    this.enemiesKilled = 0;

    // Queue of enemies waiting to be spawned in tactical squads
    this.spawnQueue = [];
    this.spawnInterval = 1.6; // Seconds between reinforcement squads
    this.spawnTimer = 0;
    this.coopTime = 0;
    this.coopPlanTimer = 0;
    this.networkTelegraphs = null;

    // Intermission Timer
    this.intermissionTimeTotal = CONFIG.WAVES.INTERMISSION_TIME || 10;
    this.intermissionTimer = 0;
    this.preWaveTimeTotal = 4.0;
    this.preWaveTimer = 0;
    this.spawnTelegraphs = [];
    this.nextWaveTelegraphPoints = [];

    // Active Supply Crates & Weapon Drops
    this.supplyCrates = [];

    // Pre-configured / dynamic spawn points (Elevators, Stairwells, Reception)
    this.spawnPoints = [
      { id: 'elevator_north_1', x: 420, y: 120, type: 'elevator', name: 'North Elevator 1', angle: Math.PI / 2 },
      { id: 'elevator_north_2', x: 860, y: 120, type: 'elevator', name: 'North Elevator 2', angle: Math.PI / 2 },
      { id: 'stairwell_west', x: 120, y: 360, type: 'stairwell', name: 'West Emergency Stairwell', angle: 0 },
      { id: 'stairwell_east', x: 1160, y: 360, type: 'stairwell', name: 'East Emergency Stairwell', angle: Math.PI },
      { id: 'reception_south', x: 640, y: 640, type: 'reception', name: 'Main South Entrance', angle: -Math.PI / 2 },
      { id: 'cafeteria_back', x: 260, y: 580, type: 'cafeteria', name: 'Cafeteria Service Door', angle: 0 },
    ];

    // Crate Drop Locations (Cafeteria, Reception, Lounge)
    this.crateLocations = [
      { x: 280, y: 520, area: 'Cafeteria Counter' },
      { x: 640, y: 560, area: 'Reception Desk' },
      { x: 1000, y: 520, area: 'Executive Lounge' },
      { x: 640, y: 260, area: 'Central Corridor' },
    ];

    // Player Active Mask Reference
    this.activeMaskId = 'vincent';

    // Callbacks for engine events
    this.onPreWave = null;
    this.onWaveStart = null;
    this.onWaveClear = null;
    this.onEnemySpawned = null;
    this.onSupplySpawned = null;
  }

  /**
   * Initialize spawner with custom map spawn points if available
   */
  init(customSpawnPoints = null, customCrateLocations = null) {
    if (customSpawnPoints && customSpawnPoints.length > 0) {
      this.spawnPoints = customSpawnPoints;
    }
    if (customCrateLocations && customCrateLocations.length > 0) {
      this.crateLocations = customCrateLocations;
    }
    this.reset();
  }

  setCustomSpawnPoints(customSpawnPoints, customCrateLocations = null) {
    if (customSpawnPoints && customSpawnPoints.length > 0) {
      this.spawnPoints = customSpawnPoints;
    }
    if (customCrateLocations && customCrateLocations.length > 0) {
      this.crateLocations = customCrateLocations;
    }
  }

  start(maskId = null, playerPosition = null) {
    this.playerPosition = playerPosition;
    if (maskId) this.setActiveMask(maskId);
    this.startWave(1);
  }

  /**
   * Reset spawner state
   */
  reset() {
    this.coopTime = 0;
    this.coopPlanTimer = 0;
    this.networkTelegraphs = null;
    this.currentWave = 0;
    this.state = 'IDLE';
    this.totalWaveEnemies = 0;
    this.enemiesSpawned = 0;
    this.enemiesAlive = 0;
    this.enemiesKilled = 0;
    this.spawnQueue = [];
    this.supplyCrates = [];
    this.intermissionTimer = 0;
    this.preWaveTimer = 0;
    this.spawnTelegraphs = [];
    this.nextWaveTelegraphPoints = [];
  }

  /**
   * Set active animal mask
   */
  setActiveMask(maskId) {
    this.activeMaskId = maskId || 'vincent';
  }

  /**
   * Start next wave
   */
  startWave(waveNumber = null, skipCountdown = false) {
    this.currentWave = waveNumber !== null ? waveNumber : this.currentWave + 1;
    this.enemiesSpawned = 0;
    this.enemiesKilled = 0;
    this.supplyCrates = [];

    this.spawnQueue = this._generateWaveQueue(this.currentWave);
    this.totalWaveEnemies = this.spawnQueue.length;
    this.enemiesAlive = this.totalWaveEnemies;
    this.spawnTimer = 0;

    if (skipCountdown && this.nextWaveTelegraphPoints.length) {
      this._applyTelegraphsToQueue(this.nextWaveTelegraphPoints);
    }

    if (typeof window !== 'undefined' && window.synthMusic) {
      window.synthMusic.play(skipCountdown ? 'combat' : 'wave_clear');
      window.synthMusic.setIntensity(skipCountdown ? 0.25 : 0.08);
    }

    if (skipCountdown) {
      const launchPoints = this.nextWaveTelegraphPoints.slice();
      this.state = 'SPAWNING';
      this.preWaveTimer = 0;
      this.spawnTelegraphs = [];
      this._beginCombatWave(launchPoints);
      this.nextWaveTelegraphPoints = [];
    } else {
      this.state = 'PREWAVE';
      this.preWaveTimer = this.preWaveTimeTotal;
      this.spawnTelegraphs = this._uniqueSpawnPointsFromQueue(this.spawnQueue);
      if (this.onPreWave) this.onPreWave(this.currentWave, this.totalWaveEnemies);
    }

    return { wave: this.currentWave, totalEnemies: this.totalWaveEnemies };
  }

  _beginCombatWave(telegraphPoints = []) {
    if (this.onWaveStart) this.onWaveStart(this.currentWave, this.totalWaveEnemies);
    if (typeof window !== 'undefined' && window.soundFx) window.soundFx.playWaveStart();
    if (typeof window !== 'undefined' && window.synthMusic) {
      window.synthMusic.play('combat');
      window.synthMusic.setIntensity(0.25);
    }
    return telegraphPoints && telegraphPoints.length
      ? this._spawnTelegraphedVanguard(telegraphPoints)
      : this._spawnNextSquad();
  }

  _spawnEnemyData(enemyData, activeSpawnPoint, exactPosition = false) {
    if (this.coopPlayers && (enemyData.coopWarnUntil || 0) > this.coopTime) return null;
    const jitterX = exactPosition ? 0 : (Math.random() * 32 - 16);
    const jitterY = exactPosition ? 0 : (Math.random() * 32 - 16);
    let position = { x: activeSpawnPoint.x + jitterX, y: activeSpawnPoint.y + jitterY };
    if (this.spawnPositionValidator && !this.spawnPositionValidator(position)) position = activeSpawnPoint;
    // A swinging door may temporarily cover an announced marker. Wait for a
    // clear body-sized space rather than spawning embedded or moving the marker.
    if (this.spawnPositionValidator && !this.spawnPositionValidator(position)) return null;
    if (this.coopPlayers && !this._isCoopSpawnSafe(position)) {
      if (!this._isCoopSpawnSafe(activeSpawnPoint)) return null;
      position = activeSpawnPoint;
    }
    const newEnemyInstance = {
      id: enemyData.id,
      type: enemyData.type,
      weapon: enemyData.weapon,
      x: position.x,
      y: position.y,
      angle: activeSpawnPoint.angle || 0,
      spawnLocationName: activeSpawnPoint.name,
      spawnType: activeSpawnPoint.type,
      patrol: enemyData.patrol || activeSpawnPoint.patrol || null,
    };
    this.enemiesSpawned++;
    if (this.onEnemySpawned) this.onEnemySpawned(newEnemyInstance);
    return newEnemyInstance;
  }

  _spawnTelegraphedVanguard(points) {
    const spawnedEntities = [];
    for (const point of points) {
      if (!this.spawnQueue.length) break;
      const pointKey = point.id || `${Math.round(point.x)}:${Math.round(point.y)}`;
      let queueIndex = this.spawnQueue.findIndex(item => {
        const p = item && item.spawnPoint;
        if (!p) return false;
        const key = p.id || `${Math.round(p.x)}:${Math.round(p.y)}`;
        return key === pointKey;
      });
      if (queueIndex < 0) queueIndex = 0;
      const enemyData = this.spawnQueue.splice(queueIndex, 1)[0];
      const spawned = this._spawnEnemyData(enemyData, point, true);
      if (spawned) spawnedEntities.push(spawned);
      else if (this.coopPlayers) this.spawnQueue.push({ ...enemyData, spawnPoint: point });
      else this.spawnQueue.unshift({ ...enemyData, spawnPoint: point });
    }
    this.spawnTimer = this.spawnInterval;
    if (this.spawnQueue.length === 0) this.state = 'IN_PROGRESS';
    return spawnedEntities;
  }

  _uniqueSpawnPointsFromQueue(queue, max = 6) {
    const unique = [];
    const seen = new Set();
    for (const item of queue) {
      const point = item && item.spawnPoint;
      if (!point) continue;
      const key = point.id || `${Math.round(point.x)}:${Math.round(point.y)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(point);
      if (unique.length >= max) break;
    }
    return unique;
  }

  _applyTelegraphsToQueue(points) {
    if (!points || !points.length) return;
    const count = Math.min(this.spawnQueue.length, Math.max(3, points.length));
    for (let i = 0; i < count; i++) this.spawnQueue[i].spawnPoint = points[i % points.length];
  }

  getSpawnTelegraphs() {
    if (this.networkTelegraphs) return this.networkTelegraphs;
    const reinforcing = this.state === 'SPAWNING' && this.spawnQueue.length > 0 && this.spawnTimer <= 1.2;
    const points = reinforcing ? this._uniqueSpawnPointsFromQueue(this.spawnQueue.slice(0, 3))
      : this.state === 'INTERMISSION' ? this.nextWaveTelegraphPoints : this.spawnTelegraphs;
    const countdown = reinforcing ? this.spawnTimer
      : this.state === 'INTERMISSION' ? this.intermissionTimer : this.preWaveTimer;
    return (points || []).map((point, index) => ({
      id: point.id || `spawn_${index}`, x: point.x, y: point.y, angle: point.angle || 0,
      name: point.name || 'INCOMING', type: point.type || 'reinforcement', countdown: Math.max(0, countdown),
      blocked: !!this.coopPlayers && !this._isCoopSpawnSafe(point)
    }));
  }

  /**
   * Spawn next reinforcement squad
   */
  _spawnNextSquad(capacity = 3) {
    if (this.spawnQueue.length === 0) return [];
    const spawnedEntities = [];
    const squadSize = Math.min(this.spawnQueue.length, 3, capacity);
    let activeSpawnPoint = null;

    for (let s = 0; s < squadSize; s++) {
      if (this.spawnQueue.length === 0) break;
      const enemyData = this.spawnQueue.shift();
      activeSpawnPoint = enemyData.spawnPoint || this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];

      const spawned = this._spawnEnemyData(enemyData, activeSpawnPoint, false);
      if (spawned) spawnedEntities.push(spawned);
      else if (this.coopPlayers) this.spawnQueue.push(enemyData);
      else { this.spawnQueue.unshift(enemyData); break; }
    }

    // Reset squad interval
    this.spawnTimer = this.spawnInterval;

    if (this.spawnQueue.length === 0) {
      this.state = 'IN_PROGRESS';
    }

    return spawnedEntities;
  }

  /**
   * Generate scaled enemy roster for the wave
   */
  _generateWaveQueue(wave) {
    const queue = [];
    // Choose safe entrances before drawing their warnings. Once announced,
    // markers remain authoritative even if the player approaches one.
    const targets = this.coopPlayers || (this.playerPosition ? [this.playerPosition] : []);
    const safePoints = this.spawnPoints.filter(p => targets.every(t => t.isAlive === false || Math.hypot(p.x - t.x, p.y - t.y) >= 260));
    const availablePoints = safePoints.length ? safePoints : this.spawnPoints;

    const enemyCount = this.getWaveEnemyCount(wave);

    // Distribution weights based on wave progression
    let meleeWeight = Math.max(0.15, 0.65 - wave * 0.08);
    let gunWeight = Math.min(0.45, 0.30 + wave * 0.06);
    let dogWeight = wave >= 2 ? Math.min(0.22, 0.12 + (wave - 2) * 0.03) : 0;
    let shotgunWeight = wave >= 3 ? Math.min(0.20, 0.10 + (wave - 3) * 0.03) : 0;
    let heavyWeight = wave >= 4 ? Math.min(0.18, 0.08 + (wave - 4) * 0.025) : 0;

    // Normalize weights
    const totalWeight = meleeWeight + gunWeight + dogWeight + shotgunWeight + heavyWeight;
    meleeWeight /= totalWeight;
    gunWeight /= totalWeight;
    dogWeight /= totalWeight;
    shotgunWeight /= totalWeight;
    heavyWeight /= totalWeight;

    for (let i = 0; i < enemyCount; i++) {
      const rand = Math.random();
      let enemyType = 'mobster_melee';
      let weaponType = 'bat';

      if (rand < heavyWeight) {
        enemyType = 'heavy';
        weaponType = Math.random() < 0.5 ? 'pipe' : (Math.random() < 0.8 ? 'magnum' : 'unarmed');
      } else if (rand < heavyWeight + shotgunWeight) {
        enemyType = 'shotgunner';
        weaponType = 'shotgun';
      } else if (rand < heavyWeight + shotgunWeight + dogWeight) {
        enemyType = 'dog';
        weaponType = 'unarmed';
      } else if (rand < heavyWeight + shotgunWeight + dogWeight + gunWeight) {
        enemyType = 'mobster_gun';
        const gunChoices = wave >= 4 ? ['pistol', 'uzi', 'm16'] : ['pistol', 'uzi'];
        weaponType = gunChoices[Math.floor(Math.random() * gunChoices.length)];
      } else {
        enemyType = 'mobster_melee';
        const meleeChoices = ['bat', 'knife', 'pipe'];
        if (wave >= 3) meleeChoices.push('katana');
        weaponType = meleeChoices[Math.floor(Math.random() * meleeChoices.length)];
      }

      // Pick a spawn point
      const spawnPt = availablePoints[Math.floor(Math.random() * availablePoints.length)];

      queue.push({
        id: `enemy_w${wave}_${i + 1}`,
        type: enemyType,
        weapon: weaponType,
        spawnPoint: spawnPt,
        spawnDelay: Math.floor(i / 3) * 1.4 + (Math.random() * 0.4), // Squad groupings of 3
      });
    }

    // Sort queue by spawn delay
    queue.sort((a, b) => a.spawnDelay - b.spawnDelay);
    return queue;
  }

  getWaveEnemyCount(wave) {
    let previous = 3, current = 5;
    for (let i = 1; i < wave; i++) [previous, current] = [current, previous + current];
    return Math.ceil(current * (1 + (Math.max(1, this.playerCount || 1) - 1) * .35));
  }

  _isCoopSpawnSafe(point) {
    return !!point && (!this.spawnPositionValidator || this.spawnPositionValidator(point))
      && (this.coopPlayers || []).every(p => p.isAlive === false || Math.hypot(p.x - point.x, p.y - point.y) >= 260);
  }

  _planCoopSpawns() {
    // Never let a camped entrance block every reinforcement behind it. Retarget
    // the next squad to clear ingress space and give the new position a full
    // warning. The solo telegraph/door behavior is deliberately unchanged.
    let changed = false;
    for (const data of this.spawnQueue.slice(0, 3)) {
      if (this._isCoopSpawnSafe(data.spawnPoint)) continue;
      let point = this.spawnPoints.find(p => this._isCoopSpawnSafe(p));
      if (!point && this.spawnPositionValidator) {
        // Nearby validated ingress offsets also work when every exact doorway
        // is occupied. No fallback is allowed inside the players' safe radius.
        outer: for (const base of this.spawnPoints) for (const radius of [64,128,192,256]) for (let i=0;i<8;i++) {
          const candidate = {...base, id:base.id+'_'+radius+'_'+i, x:base.x+Math.cos(i*Math.PI/4)*radius, y:base.y+Math.sin(i*Math.PI/4)*radius};
          if (this._isCoopSpawnSafe(candidate)) { point = candidate; break outer; }
        }
      }
      if (point) { data.spawnPoint = point; data.coopWarnUntil = this.coopTime + 1.2; changed = true; }
    }
    if (changed) {
      this.spawnTimer = Math.max(this.spawnTimer,1.2);
      if (this.state === 'PREWAVE') { this.preWaveTimer = Math.max(this.preWaveTimer,1.2); this.spawnTelegraphs = this._uniqueSpawnPointsFromQueue(this.spawnQueue); }
    }
  }

  /**
   * Update spawner ticks, squad reinforcements, supply crate pickups
   */
  update(dt, playerPosition = null, currentLivingEnemiesCount = null) {
    if (typeof playerPosition === 'number' && currentLivingEnemiesCount === null) {
      currentLivingEnemiesCount = playerPosition;
      playerPosition = null;
    }
    if (playerPosition) this.playerPosition = playerPosition;

    if (this.coopPlayers) {
      this.coopTime += dt; this.coopPlanTimer -= dt;
      if (this.coopPlanTimer <= 0) { this.coopPlanTimer = .2; this._planCoopSpawns(); }
    }

    const spawnedEntities = [];

    if (this.state === 'PREWAVE') {
      this.preWaveTimer = Math.max(0, this.preWaveTimer - dt);
      if (this.preWaveTimer <= 0) {
        const launchPoints = this.spawnTelegraphs.slice();
        this.state = 'SPAWNING';
        const vanguard = this._beginCombatWave(launchPoints);
        spawnedEntities.push(...vanguard);
        this.spawnTelegraphs = [];
      }
    }

    // Sync living enemies count if provided by world/engine
    if (currentLivingEnemiesCount !== null && (this.state === 'IN_PROGRESS' || this.state === 'SPAWNING')) {
      this.enemiesAlive = currentLivingEnemiesCount + spawnedEntities.length + this.spawnQueue.length;
      if (currentLivingEnemiesCount <= 0 && spawnedEntities.length === 0 && this.spawnQueue.length === 0 && this.enemiesSpawned > 0) {
        this._triggerWaveClear();
      }
    }

    // Handle music intensity based on remaining wave enemies
    if (this.state === 'IN_PROGRESS' || this.state === 'SPAWNING') {
      const remainingRatio = this.totalWaveEnemies > 0 ? (this.enemiesAlive / this.totalWaveEnemies) : 1;
      const intensity = (1 - remainingRatio * 0.7) + (this.enemiesAlive <= 3 ? 0.4 : 0);
      if (typeof window !== 'undefined' && window.synthMusic) {
        window.synthMusic.setIntensity(intensity);
      }
    }

    // 1. Handle Spawning Queue
    if (this.state === 'SPAWNING' || (this.state === 'IN_PROGRESS' && this.spawnQueue.length > 0)) {
      this.spawnTimer -= dt;

      if (this.spawnTimer <= 0 && this.spawnQueue.length > 0) {
        const living = currentLivingEnemiesCount ?? Math.max(0, this.enemiesSpawned - this.enemiesKilled - spawnedEntities.length);
        const capacity = Math.max(0, (CONFIG.WAVES.MAX_CONCURRENT_ENEMIES || 36) - living - spawnedEntities.length);
        const squad = this._spawnNextSquad(capacity);
        spawnedEntities.push(...squad);
      }
    }

    // 2. Handle Inter-wave Intermission
    if (this.state === 'INTERMISSION') {
      this.intermissionTimer -= dt;
      if (this.intermissionTimer <= 0) {
        this.startWave(null, true);
      }
    }

    return {
      newEnemies: spawnedEntities,
      state: this.state,
      wave: this.currentWave,
      totalEnemies: this.totalWaveEnemies,
      enemiesRemaining: this.enemiesAlive,
      preWaveTimeLeft: this.state === 'PREWAVE' ? Math.max(0, this.preWaveTimer) : 0,
      intermissionTimeLeft: this.state === 'INTERMISSION' ? Math.max(0, this.intermissionTimer) : 0,
      supplyCrates: this.supplyCrates,
    };
  }

  /**
   * Called whenever an enemy is eliminated
   */
  onEnemyKilled(enemy) {
    this.enemiesKilled++;
    this.enemiesAlive = Math.max(0, this.enemiesAlive - 1);

    // Audio / combo / intensity feedback
    if (this.enemiesAlive <= 0 && this.spawnQueue.length === 0 && this.state !== 'INTERMISSION') {
      this._triggerWaveClear();
    }
  }

  /**
   * Wave Clear trigger & Supply Drop Deployment
   */
  _triggerWaveClear() {
    this.state = 'INTERMISSION';
    this.intermissionTimer = CONFIG.WAVES.INTERMISSION_TIME || 10;
    this.nextWaveTelegraphPoints = this._pickNextWaveTelegraphs();

    // Victory audio fanfare & calm music
    if (typeof window !== 'undefined' && window.soundFx) {
      window.soundFx.playWaveClear();
    }
    if (typeof window !== 'undefined' && window.synthMusic) {
      window.synthMusic.play('wave_clear');
    }

    // Spawn Supply Crates at Cafeteria and Reception
    this._spawnInterWaveSupplies();

    const clearBonus = Math.round(500 + this.currentWave * 500 + this.totalWaveEnemies * 75);
    if (this.onWaveClear) {
      this.onWaveClear(this.currentWave, clearBonus);
    }
  }

  _pickNextWaveTelegraphs() {
    if (!this.spawnPoints.length) return [];
    const available = this.coopPlayers ? this.spawnPoints.filter(p => this._isCoopSpawnSafe(p)) : this.spawnPoints;
    const shuffled = available.slice().sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(4, shuffled.length));
  }

  /**
   * Spawn Supply Crates & Weapon Racks
   */
  _spawnInterWaveSupplies() {
    this.supplyCrates = [];

    // Aubrey mask gives extra crates!
    const isAubrey = this.activeMaskId === 'aubrey';
    const crateCount = isAubrey ? 3 : 2;

    // Available weapons in crates based on wave number
    const weaponPool = ['shotgun', 'uzi', 'm16', 'magnum', 'katana', 'pistol'];
    if (this.currentWave >= 3) {
      weaponPool.push('m16', 'magnum', 'shotgun');
    }

    for (let i = 0; i < Math.min(crateCount, this.crateLocations.length); i++) {
      const loc = this.crateLocations[i];
      const randomWeapon = weaponPool[Math.floor(Math.random() * weaponPool.length)];

      const crate = {
        id: `crate_w${this.currentWave}_${i}`,
        x: loc.x,
        y: loc.y,
        area: loc.area,
        weapon: randomWeapon,
        ammoRefill: true,
        ammoAmount: isAubrey ? 1.5 : 1.0, // Aubrey +50% ammo
        isOpened: false,
        claimedMask: 0,
        render: WaveSpawner.renderSupplyCrate
      };
      crate.draw = crate.render;

      this.supplyCrates.push(crate);
      if (this.onSupplySpawned) {
        this.onSupplySpawned(crate);
      }
    }
  }

  /**
   * Collect a supply crate
   */
  static renderSupplyCrate(ctx, localId) {
    if(this.isOpened)return;
    const claimed=Number.isInteger(localId)&&!!(this.claimedMask & (1<<localId));
    ctx.save();ctx.translate(this.x,this.y);ctx.globalAlpha=claimed ? .45 : 1;
    ctx.shadowColor=claimed?'#776c84':'#00f3ff';ctx.shadowBlur=10;ctx.fillStyle='#1b1429';ctx.fillRect(-16,-12,32,24);
    ctx.strokeStyle=claimed?'#776c84':'#00f3ff';ctx.lineWidth=2;ctx.strokeRect(-16,-12,32,24);
    ctx.fillStyle=claimed?'#b6abbf':'#ffe600';ctx.font='900 9px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('AMMO',0,0);
    if(Number.isInteger(localId)){ctx.font='bold 8px monospace';ctx.fillText(claimed?'RÉCUPÉRÉ':'RAVITAILLEMENT',0,-22);}
    ctx.restore();
  }

  claimSupply(crate, slot) {
    if(!crate || crate.isOpened)return false;
    if(!this.coopPlayers){crate.isOpened=true;return true;}
    if(!Number.isInteger(slot)||!this.coopPlayers.some(p=>p.playerId===slot))return false;
    const bit=1<<slot;if(crate.claimedMask & bit)return false;
    crate.claimedMask=(crate.claimedMask||0)|bit;
    const eligible=this.coopPlayers.reduce((mask,p)=>mask|(1<<p.playerId),0);
    crate.isOpened=(crate.claimedMask & eligible)===eligible;
    return true;
  }

  collectSupplyCrate(crateId, slot) {
    const crate = this.supplyCrates.find(c => c.id === crateId && !c.isOpened);
    if (!crate) return null;

    if(!this.claimSupply(crate,slot))return null;
    if (typeof window !== 'undefined' && window.soundFx) {
      window.soundFx.playAmmoRefill();
    }
    return crate;
  }

  /**
   * Skip intermission timer immediately (e.g. player pressing elevator call)
   */
  skipIntermission() {
    if (this.state === 'INTERMISSION') {
      this.intermissionTimer = 0;
      this.startWave(null, true);
    }
  }

  // Getters
  getWaveNumber() { return this.currentWave; }
  getEnemiesRemaining() { return this.enemiesAlive; }
  getTotalWaveEnemies() { return this.totalWaveEnemies; }
  isWaveActive() { return this.state === 'PREWAVE' || this.state === 'SPAWNING' || this.state === 'IN_PROGRESS'; }
  isIntermission() { return this.state === 'INTERMISSION'; }
}

// Global export / module compatibility
const waveSpawner = new WaveSpawner();

if (typeof window !== 'undefined') {
  window.waveSpawner = waveSpawner;
  window.WaveSpawner = WaveSpawner;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { waveSpawner, WaveSpawner };
}
