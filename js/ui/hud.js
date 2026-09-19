/**
 * Hotline Miami: VISEO Arcade Edition - In-Game Arcade HUD
 * Event-driven typography, quiet system metadata and readable ammunition.
 * Presentation timers are independent of scoring and combo decay.
 */

class GameHUD {
  constructor() {
    // Score & Combo State
    this.currentScore = 0;
    this.displayScore = 0;
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
    this._resetPresentation();
  }

  _resetPresentation() {
    this.scoreImpact = 0;
    this.comboImpact = 0;
    this.waveImpact = 0;
    this.ammoImpact = 0;
    this.waveAge = 0;
    this.maskAge = 0;
    this.presentedWave = null;
    this.comboPulse = 1;
  }

  _announceWave(wave) {
    if (wave === this.presentedWave) return;
    this.presentedWave = wave;
    this.waveAge = this.maskAge = 0;
    this.waveImpact = .1;
  }

  notifyDryFire() {
    if (this.currentWeapon?.isGun && this.currentAmmo <= 0) this.ammoImpact = .1;
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
    this._resetPresentation();
  }

  /**
   * Set player's active mask
   */
  setMask(maskId) {
    if (CONFIG.MASKS[maskId]) {
      this.activeMask = CONFIG.MASKS[maskId];
      this.maskAge = 0;
    }
  }

  /**
   * Update weapon status
   */
  setWeapon(weapon, ammo = null) {
    const previousAmmo = this.currentAmmo;
    const previousWeapon = this.currentWeapon;
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
    if (isGun && this.currentAmmo <= 0 && (previousAmmo > 0 || previousWeapon !== this.currentWeapon)) {
      this.ammoImpact = .1;
    } else if (!isGun || this.currentAmmo > 0) {
      this.ammoImpact = 0;
    }
  }

  setWave(waveNum, totalEnemies = 0) {
    this._announceWave(waveNum);
    this.waveNumber = waveNum;
    this.totalWaveEnemies = totalEnemies;
    this.enemiesRemaining = totalEnemies;
  }

  setEnemiesRemaining(count) {
    this.enemiesRemaining = count;
  }

  addScore(points, label = '') {
    this.currentScore += points;
    if (points > 0) this.scoreImpact = .1;
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
    this.scoreImpact = this.comboImpact = .1;

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
  update(dt, waveInfo = null, presentationDt = dt) {
    // Exact tally on impact: no perpetual rolling/floating motion.
    this.displayScore = this.currentScore;
    for (const timer of ['scoreImpact', 'comboImpact', 'waveImpact', 'ammoImpact']) {
      this[timer] = Math.max(0, this[timer] - presentationDt);
    }
    this.waveAge += presentationDt;
    this.maskAge += presentationDt;

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

    this.comboPulse = 1 + .2 * this._impact(this.comboImpact);

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
      if (waveInfo.wave) this._announceWave(waveInfo.wave);
      this.waveNumber = waveInfo.wave || this.waveNumber;
      this.enemiesRemaining = waveInfo.enemiesRemaining !== undefined ? waveInfo.enemiesRemaining : this.enemiesRemaining;
      this.totalWaveEnemies = waveInfo.totalEnemies || this.totalWaveEnemies;
      this.preWaveTime = waveInfo.preWaveTimeLeft || 0;
      this.intermissionTime = waveInfo.intermissionTimeLeft || 0;
    }
  }

  _impact(remaining) {
    return Math.pow(Math.max(0, remaining / .1), 2);
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

    // 3. Floating Score Popups (Projected in camera world coordinates)
    this._drawPopups(ctx, camera);

    ctx.save();
    // Same logical scale as the title; retain full width on ultrawide displays.
    const uiScale = Math.min(width / 1280, height / 720);
    ctx.scale(uiScale, uiScale);
    const screenWidth = width, screenHeight = height;
    width /= uiScale; height /= uiScale;

    // Score top-right; quiet wave metadata top-left.
    this._drawScoreAndWave(ctx, width, height);

    const projectedPlayer = camera && playerPos ? camera.worldToScreen(playerPos.x, playerPos.y) : null;
    const hudPlayer = projectedPlayer ? { x: projectedPlayer.x / uiScale, y: projectedPlayer.y / uiScale } : null;
    this._drawComboMeter(ctx, width, height, hudPlayer);

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

  // Hard, offset type shares the title palette. No blur or oscillation.
  _type(ctx, text, x, y, size, color, accent = '#ed4e93') {
    ctx.font = `italic 900 ${size}px Impact, 'Arial Black', sans-serif`;
    ctx.shadowBlur = 0;
    ctx.shadowColor = '#100e20';
    ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
    ctx.fillStyle = accent;
    ctx.fillText(text, x + 4, y + 4);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
  }

  _metadata(ctx, text, x, y, color = '#f2e5c9') {
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.shadowColor = '#100e20'; ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 2;
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
  }

  _drawScoreAndWave(ctx, width, height) {
    const margin = 32;
    ctx.save();
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.translate(width - margin, margin);
    const impact = this._impact(this.scoreImpact);
    ctx.scale(1 + .12 * impact, 1 + .12 * impact);
    const score = String(Math.round(this.currentScore));
    ctx.font = "italic 900 44px Impact, 'Arial Black', sans-serif";
    const size = Math.min(44, 44 * 320 / Math.max(1, ctx.measureText(score).width));
    this._type(ctx, score, 0, 0, size, '#f2e5c9', impact ? '#80d9d2' : '#ed4e93');
    this._metadata(ctx, 'PTS', 0, 52, '#b89bb5');
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.translate(margin, margin);
    const waveImpact = this._impact(this.waveImpact);
    ctx.scale(1 + .28 * waveImpact, 1 + .28 * waveImpact);
    const quiet = Math.min(1, Math.max(0, (this.waveAge - 2.5) / .5));
    ctx.globalAlpha = 1 - quiet * .35;
    this._type(ctx, `WAVE ${String(this.waveNumber).padStart(2, '0')}`, 0, 0,
      26 - quiet * 6, '#f2e5c9', '#100e20');
    this._metadata(ctx, `${this.enemiesRemaining} LEFT`, 0, 36 - quiet * 8);
    ctx.restore();
  }

  _drawComboMeter(ctx, width, height, player = null) {
    if (this.comboCount <= 0) return;
    const margin = 32, zoneWidth = 350;
    const impact = this._impact(this.comboImpact);
    // Move to the opposite upper corner if the player enters the combo zone.
    const obstructed = player && player.x > width - zoneWidth - 48 && player.y < 235;
    const x = obstructed ? margin + zoneWidth : width - margin;
    ctx.save();
    if (player) {
      // Also protect the actor during edge/camera transitions and large impacts.
      ctx.beginPath(); ctx.rect(0, 0, width, height);
      ctx.rect(player.x - 44, player.y - 44, 88, 88);
      ctx.clip('evenodd');
    }
    ctx.translate(x - impact * (this.comboCount % 2 ? 7 : 2), 102 + impact * 3);
    const pop = 1 + impact * .2;
    ctx.scale(pop, pop);
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    const size = Math.min(46, 32 + this.comboCount * 2);
    const headline = `${this.comboMultiplier}X COMBO`;
    ctx.font = `italic 900 ${size}px Impact, 'Arial Black', sans-serif`;
    const fittedSize = Math.min(size, size * 280 / Math.max(1, ctx.measureText(headline).width));
    this._type(ctx, headline, 0, 0, fittedSize, '#ed4e93', '#80d9d2');
    this._metadata(ctx, `${this.comboCount} STREAK / +${this.comboPointsAccumulated} PTS`, 0, 54);
    const ratio = Math.max(0, Math.min(1, this.comboTimer / this.comboMaxTimer));
    ctx.fillStyle = '#100e20'; ctx.fillRect(-140, 76, 140, 3);
    ctx.fillStyle = ratio < .3 ? '#ff647b' : '#f2e5c9';
    ctx.fillRect(-140 * ratio, 76, 140 * ratio, 3);
    ctx.restore();
  }

  _drawWeaponAmmo(ctx, width, height) {
    const gun = this.currentWeapon?.isGun;
    const name = (this.currentWeapon?.name || 'FISTS').toUpperCase();
    const empty = gun && this.currentAmmo <= 0;
    const impact = this._impact(this.ammoImpact);
    ctx.save();
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.translate(width - 32 - impact * 6, height - 32);
    ctx.scale(1 + impact * .22, 1 + impact * .22);
    if (!gun) {
      ctx.font = 'bold 22px "Courier New", monospace';
      ctx.fillStyle = '#f2e5c9'; ctx.shadowColor = '#100e20';
      ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
      ctx.fillText(name, 0, 0);
    } else {
      this._metadata(ctx, name, 0, -48, '#b89bb5');
      ctx.font = `bold ${empty ? 38 : 32}px "Courier New", monospace`;
      ctx.fillStyle = empty ? (impact ? '#ffffff' : '#ff647b') : '#f2e5c9';
      ctx.shadowColor = '#100e20'; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
      ctx.fillText(`${this.currentAmmo} / ${this.maxAmmo}`, -34, 0);
      this._metadata(ctx, 'RND', 0, -4, empty ? '#ff647b' : '#f2e5c9');
      if (empty) this._metadata(ctx, 'EMPTY / THROW / GRAB', 0, -70, '#ff647b');
    }
    ctx.restore();
  }

  _drawMaskBadge(ctx, width, height) {
    const alpha = Math.max(0, Math.min(1, (3.5 - this.maskAge) / .75));
    if (alpha <= 0) return;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    this._type(ctx, this.activeMask.name, 32, height - 32, 22, '#b89bb5', '#100e20');
    ctx.restore();
  }

  _drawPreWaveBanner(ctx, width, height) {
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    this._metadata(ctx, `GET READY / ${Math.max(1, Math.ceil(this.preWaveTime))}`, width * .5, 38);
    ctx.restore();
  }

  _drawIntermissionBanner(ctx, width, height) {
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    this._type(ctx, 'SECTOR CLEAR', width * .5, 32, 24, '#f2e5c9', '#100e20');
    this._metadata(ctx, `RESUPPLY AT CAFETERIA / ${Math.ceil(this.intermissionTime)}s`, width * .5, 65);
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
