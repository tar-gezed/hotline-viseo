/**
 * Hotline Miami: VISEO Arcade Edition - In-Game Arcade HUD
 * Real-time dynamic HUD featuring pulsing combo multipliers with decay bar,
 * rolling score tally, weapon & ammo counter, active mask badge,
 * wave status & enemy radar indicators, and floating score popups.
 */

class GameHUD {
  constructor() {
    // Score & Combo State
    this.currentScore = 0;
    this.displayScore = 0; // Smooth rolling score
    this.comboCount = 0;
    this.maxComboRecorded = 0;
    this.comboMultiplier = 1;
    this.comboTimer = 0;
    this.comboMaxTimer = CONFIG.SCORING.COMBO_WINDOW_BASE;
    this.comboPointsAccumulated = 0;

    // Wave & Enemies
    this.waveNumber = 1;
    this.enemiesRemaining = 0;
    this.totalWaveEnemies = 0;
    this.intermissionTime = 0;
    this.preWaveTime = 0;

    // Weapon & Mask Info
    this.currentWeapon = CONFIG.WEAPONS.unarmed;
    this.currentAmmo = Infinity;
    this.maxAmmo = Infinity;
    this.activeMask = CONFIG.MASKS.vincent;

    // Floating Score Popups
    this.popups = [];

    // Animation & Feedback
    this.comboPulse = 1.0;
    this.screenFlashAlpha = 0;
    this.flashColor = '#ff007f';
  }

  /**
   * Reset HUD on run start
   */
  reset() {
    this.currentScore = 0;
    this.displayScore = 0;
    this.comboCount = 0;
    this.maxComboRecorded = 0;
    this.comboMultiplier = 1;
    this.comboTimer = 0;
    this.comboPointsAccumulated = 0;
    this.popups = [];
    this.screenFlashAlpha = 0;
    this.intermissionTime = 0;
    this.preWaveTime = 0;
  }

  /**
   * Set player's active mask
   */
  setMask(maskId) {
    if (CONFIG.MASKS[maskId]) {
      this.activeMask = CONFIG.MASKS[maskId];
    }
  }

  /**
   * Update weapon status
   */
  setWeapon(weapon, ammo = null) {
    if (typeof weapon === 'string') {
      const wDef = (typeof WeaponSystem !== 'undefined' && WeaponSystem.getWeaponType) ? WeaponSystem.getWeaponType(weapon) : (CONFIG.WEAPONS[weapon] || { id: weapon.toUpperCase(), name: weapon, isGun: false });
      this.currentWeapon = wDef;
    } else if (typeof weapon === 'object' && weapon) {
      this.currentWeapon = weapon;
    } else {
      this.currentWeapon = { id: 'FISTS', name: 'Fists', isGun: false };
    }

    const isGun = this.currentWeapon.isGun === true;
    if (ammo !== null) {
      this.currentAmmo = ammo;
    } else {
      this.currentAmmo = isGun ? (this.currentWeapon.maxAmmo || this.currentWeapon.magSize || 12) : Infinity;
    }
    this.maxAmmo = isGun ? Math.floor((this.currentWeapon.maxAmmo || this.currentWeapon.magSize || 12) * (this.activeMask.perks?.ammoCapacityMult || 1)) : Infinity;
  }

  setWave(waveNum, totalEnemies = 0) {
    this.waveNumber = waveNum;
    this.totalWaveEnemies = totalEnemies;
    this.enemiesRemaining = totalEnemies;
  }

  setEnemiesRemaining(count) {
    this.enemiesRemaining = count;
  }

  addScore(points, label = '') {
    this.currentScore += points;
    if (label) {
      this.addScorePopup(typeof window !== 'undefined' ? window.innerWidth * 0.5 : 640, 200, `${label} +${points}`, '#39ff14');
    }
  }

  setIntermission(duration) {
    this.intermissionTime = duration;
  }

  addKill(type, x, y, label = '') {
    const basePoints = (CONFIG.SCORING && CONFIG.SCORING.BASE_POINTS && CONFIG.SCORING.BASE_POINTS[type ? type.toUpperCase() : '']) || 400;
    this.addKillScore(type, basePoints, x, y, label);
  }

  /**
   * Trigger screen flash on execution or huge multikill
   */
  flashScreen(color = '#ff007f', duration = 0.25) {
    this.flashColor = color;
    this.screenFlashAlpha = 0.35;
  }

  /**
   * Register a kill/score event and extend combo
   */
  addKillScore(killType, basePoints, worldX, worldY, customLabel = '') {
    // Shared character perks drive both displayed rules and scoring.
    const characterBonus = this.activeMask.perks?.scoreMult || 1;
    const comboWindowBonus = this.activeMask.perks?.comboTimeMult || 1;

    // Increment combo
    this.comboCount++;
    this.maxComboRecorded = Math.max(this.maxComboRecorded, this.comboCount);
    const multIdx = Math.min(CONFIG.SCORING.COMBO_MULTIPLIERS.length - 1, this.comboCount - 1);
    this.comboMultiplier = CONFIG.SCORING.COMBO_MULTIPLIERS[multIdx];

    // Reset and replenish combo timer
    const decay = (this.comboCount - 1) * CONFIG.SCORING.COMBO_WINDOW_DECAY;
    this.comboMaxTimer = Math.max(1.4, (CONFIG.SCORING.COMBO_WINDOW_BASE - decay) * comboWindowBonus);
    this.comboTimer = this.comboMaxTimer;

    // Calculate score
    const earnedPoints = Math.round(basePoints * this.comboMultiplier * characterBonus);
    this.currentScore += earnedPoints;
    this.comboPointsAccumulated += earnedPoints;
    this.comboPulse = 1.45;

    // Audio chime scaling
    if (typeof window !== 'undefined' && window.soundFx) {
      window.soundFx.playComboChime(this.comboCount);
    }

    // Add floating score text popup
    const popupText = customLabel ? `${customLabel} +${earnedPoints}` : (this.comboMultiplier > 1 ? `+${earnedPoints} (x${this.comboMultiplier})` : `+${earnedPoints}`);
    this.addScorePopup(worldX, worldY, popupText, this.comboMultiplier > 1 ? '#00f3ff' : '#ffe600');
  }

  /**
   * Add a floating animated score popup in world coordinates
   */
  addScorePopup(worldX, worldY, text, color = '#ffe600') {
    this.popups.push({
      x: worldX || 0,
      y: worldY || 0,
      text: text,
      color: color,
      alpha: 1.0,
      life: 0.9,
      maxLife: 0.9,
      scale: 1.2,
      velY: -45,
    });
  }

  /**
   * Update HUD timers and popups
   */
  update(dt, waveInfo = null) {
    // 1. Rolling score smooth lerp
    if (this.displayScore < this.currentScore) {
      const diff = this.currentScore - this.displayScore;
      this.displayScore += Math.max(1, Math.ceil(diff * 0.15));
      if (this.displayScore > this.currentScore) {
        this.displayScore = this.currentScore;
      }
    }

    // 2. Combo Timer countdown & expiration
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        // Combo dropped!
        this.comboCount = 0;
        this.comboMultiplier = 1;
        this.comboTimer = 0;
        this.comboPointsAccumulated = 0;
      }
    }

    // 3. Combo pulse animation decay
    if (this.comboPulse > 1.0) {
      this.comboPulse = Math.max(1.0, this.comboPulse - dt * 2.5);
    }

    // 4. Screen flash decay
    if (this.screenFlashAlpha > 0) {
      this.screenFlashAlpha = Math.max(0, this.screenFlashAlpha - dt * 2.0);
    }

    // 5. Update floating score popups
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      p.y += p.velY * dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
      p.scale = 1.0 + (p.life / p.maxLife) * 0.25;

      if (p.life <= 0) {
        this.popups.splice(i, 1);
      }
    }

    // 6. Sync wave spawner stats
    if (waveInfo) {
      this.waveNumber = waveInfo.wave || this.waveNumber;
      this.enemiesRemaining = waveInfo.enemiesRemaining !== undefined ? waveInfo.enemiesRemaining : this.enemiesRemaining;
      this.totalWaveEnemies = waveInfo.totalEnemies || this.totalWaveEnemies;
      this.preWaveTime = waveInfo.preWaveTimeLeft || 0;
      this.intermissionTime = waveInfo.intermissionTimeLeft || 0;
    }
  }

  /**
   * Render HUD elements and popups
   */
  draw(ctx, width, height, camera = null, enemyLocations = [], playerPos = null) {
    ctx.save();

    // 1. Screen Flash overlay
    if (this.screenFlashAlpha > 0) {
      ctx.fillStyle = this.flashColor;
      ctx.globalAlpha = this.screenFlashAlpha;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1.0;
    }

    // 2. Adrenaline Edge Glow Vignette when Combo is high
    if (this.comboCount >= 3) {
      const vignetteAlpha = Math.min(0.4, (this.comboCount / 10) * 0.4);
      const gradient = ctx.createRadialGradient(width * 0.5, height * 0.5, width * 0.3, width * 0.5, height * 0.5, width * 0.7);
      gradient.addColorStop(0, 'rgba(255, 0, 127, 0)');
      gradient.addColorStop(1, `rgba(255, 0, 127, ${vignetteAlpha})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }

    // 3. Floating Score Popups (Projected in camera world coordinates)
    this._drawPopups(ctx, camera);

    ctx.save();
    const uiScale = Math.max(1, Math.min(width / 1920, height / 1080));
    ctx.scale(uiScale, uiScale);
    const screenWidth = width, screenHeight = height;
    width /= uiScale; height /= uiScale;

    // 4. TOP LEFT: Neon Score Tally & Wave Status
    this._drawScoreAndWave(ctx, width, height);

    // 5. TOP RIGHT: Combo Multiplier & Decay Meter
    this._drawComboMeter(ctx, width, height);

    // 6. BOTTOM RIGHT: Weapon Armory & Ammo Counter
    this._drawWeaponAmmo(ctx, width, height);

    // 7. BOTTOM LEFT: Active Animal Mask Badge
    this._drawMaskBadge(ctx, width, height);

    // 8. CENTER TOP: Wave countdown / inter-wave resupply alert
    if (this.preWaveTime > 0) {
      this._drawPreWaveBanner(ctx, width, height);
    } else if (this.intermissionTime > 0) {
      this._drawIntermissionBanner(ctx, width, height);
    }

    ctx.restore();
    width = screenWidth; height = screenHeight;
    // 9. Offscreen Enemy Threat Indicators (Radar Arrows)
    if (playerPos && enemyLocations && enemyLocations.length > 0 && camera) {
      this._drawThreatArrows(ctx, width, height, camera, playerPos, enemyLocations);
    }

    ctx.restore();
  }

  /**
   * Draw Floating Score Popups
   */
  _drawPopups(ctx, camera) {
    for (const p of this.popups) {
      let screenX = p.x;
      let screenY = p.y;

      if (camera) {
        const point = camera.worldToScreen(p.x, p.y);
        screenX = point.x;
        screenY = point.y;
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(screenX, screenY);
      ctx.scale(p.scale, p.scale);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 17px "Courier New", monospace';

      ctx.shadowColor = p.color;
      ctx.shadowBlur = 0;
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);

      ctx.restore();
    }
  }

  /**
   * Draw Score & Wave Info
   */
  _drawScoreAndWave(ctx, width, height) {
    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = 'italic 900 42px Impact, Arial Black, sans-serif';
    ctx.shadowBlur = 0;
    ctx.shadowColor = '#32132e';
    ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#f4f19b';
    ctx.fillText(`${Math.round(this.displayScore)}PTS`, width - 30, 24);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f4b5d7';
    ctx.font = 'italic 900 30px Impact, Arial Black, sans-serif';
    ctx.fillText(`WAVE ${String(this.waveNumber).padStart(2, '0')}`, 28, 24);
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#e7e6d0';
    ctx.fillText(`${this.enemiesRemaining} TO CLEAR`, 29, 62);
    ctx.restore();
  }

  /**
   * Draw Dynamic Combo Multiplier & Decay Bar
   */
  _drawComboMeter(ctx, width, height) {
    if (this.comboCount <= 0) return;

    const x = width - 36;
    const y = 84;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(this.comboPulse, this.comboPulse);

    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';

    // Combo Title & Multiplier
    ctx.shadowColor = CONFIG.COLORS.NEON_PINK;
    ctx.shadowBlur = 0;
    ctx.fillStyle = CONFIG.COLORS.NEON_PINK;
    ctx.font = 'italic 900 36px Impact, Arial Black, sans-serif';
    ctx.shadowColor = '#31152e';
    ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3;
    ctx.fillText(`${this.comboMultiplier}X COMBO`, 0, 0);

    // Combo Count
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 14px "Courier New", monospace';
    ctx.fillText(`${this.comboCount} STREAK // +${this.comboPointsAccumulated} PTS`, 0, 36);

    // Combo Decay Meter Bar
    const barWidth = 180;
    const barHeight = 8;
    const barX = -barWidth;
    const barY = 58;

    const ratio = Math.max(0, Math.min(1, this.comboTimer / this.comboMaxTimer));
    let barColor = CONFIG.COLORS.NEON_LIME;
    if (ratio < 0.3) barColor = CONFIG.COLORS.BLOOD_FRESH;
    else if (ratio < 0.6) barColor = CONFIG.COLORS.NEON_YELLOW;

    // Background track
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Filled bar
    ctx.fillStyle = barColor;
    ctx.shadowColor = barColor;
    ctx.shadowBlur = 0;
    ctx.fillRect(barX + barWidth * (1 - ratio), barY, barWidth * ratio, barHeight);

    ctx.restore();
  }

  /**
   * Draw Current Weapon & Ammo Counter
   */
  _drawWeaponAmmo(ctx, width, height) {
    ctx.save();
    const gun = this.currentWeapon && this.currentWeapon.isGun;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.shadowBlur = 0; ctx.shadowColor = '#26172b';
    ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3;
    ctx.fillStyle = gun && this.currentAmmo === 0 ? '#ff647b' : '#f3ebbe';
    ctx.font = 'italic 900 40px Impact, Arial Black, sans-serif';
    const name = this.currentWeapon && this.currentWeapon.name || 'FISTS';
    ctx.fillText(gun ? `${this.currentAmmo}/${this.maxAmmo} RND` : name.toUpperCase(), width - 28, height - 26);
    ctx.font = 'bold 12px monospace'; ctx.fillStyle = '#f2b7d5';
    ctx.fillText(gun ? (this.currentAmmo === 0 ? 'EMPTY  /  THROW / GRAB' : name.toUpperCase()) : 'CLOSE QUARTERS', width - 28, height - 73);
    ctx.restore();
  }

  /**
   * Draw Active Animal Mask Badge
   */
  _drawMaskBadge(ctx, width, height) {
    ctx.save();
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.font = 'italic 900 24px Impact, Arial Black, sans-serif';
    ctx.shadowColor = '#281227'; ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#f2b7d5';
    ctx.fillText(this.activeMask.name, 28, height - 28);
    ctx.restore();
  }

  /**
   * Draw quiet pre-wave countdown. Spawn locations are telegraphed in-world.
   */
  _drawPreWaveBanner(ctx, width, height) {
    const y = 85;
    const timeLeft = Math.max(1, Math.ceil(this.preWaveTime));
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(15, 10, 25, 0.72)';
    ctx.fillRect(width * 0.5 - 205, y - 20, 410, 40);
    ctx.shadowColor = '#341b32';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#f4b5d7';
    ctx.font = 'italic 900 27px Impact, Arial Black, sans-serif';
    ctx.fillText(`GET READY  /  ${timeLeft}`, width * 0.5, y);
    ctx.restore();
  }

  /**
   * Draw Resupply Intermission Banner
   */
  _drawIntermissionBanner(ctx, width, height) {
    const y = 85;
    const timeLeft = Math.ceil(this.intermissionTime);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = 'rgba(15, 10, 25, 0.85)';
    ctx.fillRect(width * 0.5 - 300, y - 24, 600, 48);

    ctx.strokeStyle = CONFIG.COLORS.NEON_LIME;
    ctx.lineWidth = 2;
    ctx.shadowColor = CONFIG.COLORS.NEON_LIME;
    ctx.shadowBlur = 10;
    ctx.strokeRect(width * 0.5 - 300, y - 24, 600, 48);

    ctx.fillStyle = CONFIG.COLORS.NEON_LIME;
    ctx.font = '900 18px "Courier New", monospace';
    ctx.fillText(`✔ SECTOR CLEAR - RESUPPLY AT CAFETERIA (${timeLeft}s)`, width * 0.5, y);

    ctx.restore();
  }

  /**
   * Draw Offscreen Threat Arrows
   */
  _drawThreatArrows(ctx, width, height, camera, playerPos, enemyLocations) {
    const margin = 24;
    ctx.save();

    for (const enemy of enemyLocations) {
      if (!enemy || enemy.isDead) continue;

      const projected = camera.worldToScreen(enemy.x, enemy.y);
      const screenX = projected.x;
      const screenY = projected.y;

      // Check if enemy is off-screen
      const isOffscreen = screenX < margin || screenX > width - margin || screenY < margin || screenY > height - margin;

      if (isOffscreen) {
        // Calculate angle from center of screen to enemy
        const angle = Math.atan2(screenY - height / 2, screenX - width / 2);

        // Clamp arrow position along screen edge
        const edgeX = Math.max(margin, Math.min(width - margin, width * 0.5 + Math.cos(angle) * (width * 0.45)));
        const edgeY = Math.max(margin, Math.min(height - margin, height * 0.5 + Math.sin(angle) * (height * 0.42)));

        ctx.save();
        ctx.translate(edgeX, edgeY);
        ctx.rotate(angle);

        ctx.fillStyle = enemy.isDog ? '#ff8800' : (enemy.isHeavy ? '#b537f2' : '#ff0044');
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 6;

        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-6, -6);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-6, 6);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }
    }
    ctx.restore();
  }
}

// Global export / module compatibility
const hud = new GameHUD();
GameHUD.prototype.render = GameHUD.prototype.draw;

if (typeof window !== 'undefined') {
  window.hud = hud;
  window.GameHUD = GameHUD;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { hud, GameHUD };
}
