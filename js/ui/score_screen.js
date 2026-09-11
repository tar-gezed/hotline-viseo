/**
 * Hotline Miami: VISEO Arcade Edition - Score Evaluation & Leaderboard Screen
 * Authentic Hotline Miami grading engine (S, A+, A, B, C, D) evaluating
 * Carnage, Boldness, Flexibility, and Time Bonus. LocalStorage persistent arcade leaderboard.
 */

class ScoreScreen {
  constructor() {
    this.visible = false;
    this.mode = 'GAME_OVER'; // 'GAME_OVER' or 'WAVE_CLEAR'

    // Run Performance Stats
    this.stats = {
      score: 0,
      waveReached: 1,
      totalKills: 0,
      meleeKills: 0,
      gunKills: 0,
      executions: 0,
      doorSlams: 0,
      maxCombo: 0,
      weaponsUsed: new Set(),
      elapsedTime: 0, // seconds
      maskId: 'vincent',
    };

    // Calculated Scores Breakdown
    this.breakdown = {
      baseScore: 0,
      flexibilityScore: 0,
      boldnessScore: 0,
      carnageScore: 0,
      timeBonus: 0,
      totalCalculatedScore: 0,
      grade: 'D',
      gradeColor: '#8f82a8',
      gradeTitle: 'STREET THUG',
    };

    // Visual Animation State
    this.animTimer = 0;
    this.stampLanded = false;
    this.stampScale = 3.0;

    // Leaderboard Storage Key
    this.LEADERBOARD_KEY = 'hotline_viseo_leaderboard_v2';
    this.leaderboard = this.loadLeaderboard();

    // Action Callbacks
    this.onRestart = null;
    this.onChangeMask = null;
    this.onNextWave = null;
    this.onMainMenu = null;
  }

  /**
   * Show Score Screen with stats
   */
  show(mode, runStats) {
    this.visible = true;
    this.mode = mode; // 'GAME_OVER' or 'WAVE_CLEAR'
    this.animTimer = 0;
    this.stampLanded = false;
    this.stampScale = 3.5;

    this.evaluateRun(runStats);

    // If Game Over, save high score to localStorage leaderboard
    if (this.mode === 'GAME_OVER') {
      this.saveToLeaderboard();
      if (typeof window !== 'undefined' && window.synthMusic) {
        window.synthMusic.play('game_over');
      }
    } else {
      if (typeof window !== 'undefined' && window.synthMusic) {
        window.synthMusic.play('wave_clear');
      }
    }
  }

  evaluateRun(runStats) {
    // Populate stats
    this.stats = {
      runId: runStats.runId || (this._fallbackRun === runStats ? this._fallbackId : (this._fallbackRun = runStats, this._fallbackId = Date.now().toString(36) + Math.random().toString(36))),
      wavesCleared: runStats.wavesCleared ?? 0,
      throwKills: runStats.throwKills || 0,
      score: runStats.score || 0,
      waveReached: runStats.waveReached ?? runStats.wave ?? 1,
      totalKills: runStats.totalKills || 0,
      meleeKills: runStats.meleeKills || 0,
      gunKills: runStats.gunKills || 0,
      executions: runStats.executions || 0,
      doorSlams: runStats.doorSlams || 0,
      maxCombo: runStats.maxCombo || 0,
      weaponsUsed: new Set(runStats.weaponsUsed || []),
      elapsedTime: runStats.elapsedTime ?? 0,
      maskId: runStats.maskId || 'vincent',
    };

    // Calculate score bonuses & letter grade
    this._calculateEvaluation();

  }

  hide() {
    this.visible = false;
  }

  /**
   * Compute Hotline Miami style breakdown & letter grade
   */
  _calculateEvaluation() {
    const s = this.stats;

    // 1. Flexibility: Reward variety of weapons used
    const uniqueWeapons = s.weaponsUsed instanceof Set ? s.weaponsUsed.size : (Array.isArray(s.weaponsUsed) ? s.weaponsUsed.length : 1);
    this.breakdown.flexibilityScore = Math.min(15000, Math.max(0, uniqueWeapons - 1) * 2500);

    // 2. Boldness: Reward high combos and melee aggression
    const comboFactor = Math.pow(Math.max(0, Math.min(s.maxCombo, 16) - 1), 1.5) * 600;
    const meleeFactor = s.meleeKills * 350;
    this.breakdown.boldnessScore = Math.round(comboFactor + meleeFactor);

    // 3. Carnage: Executions, door slams, heavy multikills
    this.breakdown.carnageScore = Math.round((s.executions * 1200) + (s.doorSlams * 400));

    // 4. Time Bonus: Higher bonus for speed
    const baseTimeTarget = s.wavesCleared * 45; // 45s per wave expected
    const timeSaved = Math.max(0, baseTimeTarget - s.elapsedTime);
    this.breakdown.timeBonus = Math.round(timeSaved * 80);

    // Total Aggregated Score
    this.breakdown.baseScore = s.score;
    this.breakdown.totalCalculatedScore = this.breakdown.baseScore +
      this.breakdown.flexibilityScore +
      this.breakdown.boldnessScore +
      this.breakdown.carnageScore +
      this.breakdown.timeBonus;

    // Grade Assignment
    const total = this.breakdown.totalCalculatedScore;
    const grades = CONFIG.SCORING.GRADES;

    let evaluatedGrade = grades[grades.length - 1]; // Default D
    for (const g of grades) {
      // Scale thresholds by wave number
      const scaledMin = g.minScore * Math.max(1, s.waveReached * 0.75);
      if (total >= scaledMin) {
        evaluatedGrade = g;
        break;
      }
    }

    this.breakdown.grade = evaluatedGrade.grade;
    this.breakdown.gradeColor = evaluatedGrade.color;
    this.breakdown.gradeTitle = evaluatedGrade.title;
  }

  /**
   * Save record to local leaderboard in localStorage
   */
  saveToLeaderboard() {
    this.leaderboard = this.loadLeaderboard();
    if (this.leaderboard.some(entry => entry.runId === this.stats.runId)) return;
    const entry = {
      runId: this.stats.runId,
      score: this.breakdown.totalCalculatedScore,
      wave: this.stats.waveReached,
      grade: this.breakdown.grade,
      mask: this.stats.maskId,
      maxCombo: this.stats.maxCombo,
      date: new Date().toLocaleDateString(),
    };

    this.leaderboard.push(entry);
    this.leaderboard.sort((a, b) => b.score - a.score);
    this.leaderboard = this.leaderboard.slice(0, 8); // Keep top 8

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.LEADERBOARD_KEY, JSON.stringify(this.leaderboard));
      }
    } catch (e) {
      console.warn('Unable to write to localStorage', e);
    }
  }

  loadLeaderboard() {
    try {
      if (typeof localStorage !== 'undefined') {
        const data = localStorage.getItem(this.LEADERBOARD_KEY);
        if (data) {
          const entries = JSON.parse(data);
          if (!Array.isArray(entries)) return [];
          const seen = new Set();
          return entries.filter(e => e && typeof e.runId === 'string' && !seen.has(e.runId) && seen.add(e.runId) && Number.isFinite(e.score) && e.score >= 0 && Number.isInteger(e.wave) && e.wave > 0 && typeof e.mask === 'string' && ['S','A+','A','B','C','D'].includes(e.grade)).sort((a,b) => b.score-a.score).slice(0,8);
        }
      }
    } catch (e) {
      console.warn('Unable to read localStorage', e);
    }

    return [];
  }

  update(dt, input = null) {
    if (!this.visible) return;
    this.animTimer += dt;

    // Handle Gamepad Navigation
    const inMgr = input || (typeof window !== 'undefined' ? (window.input || window.Input) : null);
    if (inMgr) {
      const confirmPressed = (typeof inMgr.isMenuConfirmJustPressed === 'function' && inMgr.isMenuConfirmJustPressed()) ||
                             (typeof inMgr.isRestartJustPressed === 'function' && inMgr.isRestartJustPressed()) ||
                             (inMgr.gamepad && inMgr.gamepad.connected && (inMgr.gamepad.justPressed.buttonA || inMgr.gamepad.justPressed.buttonRT || inMgr.gamepad.justPressed.buttonSelect));
      
      const maskPressed = (inMgr.gamepad && inMgr.gamepad.connected && (inMgr.gamepad.justPressed.buttonY || inMgr.gamepad.justPressed.buttonX || inMgr.gamepad.justPressed.buttonB)) ||
                          (typeof inMgr.isJustPressed === 'function' && inMgr.isJustPressed('KeyM'));

      if (confirmPressed) {
        if (typeof window !== 'undefined' && window.soundFx) window.soundFx.playUiSelect();
        if (this.mode === 'GAME_OVER') {
          if (this.onRestart) this.onRestart();
        } else {
          if (this.onNextWave) this.onNextWave();
        }
      } else if (maskPressed) {
        if (typeof window !== 'undefined' && window.soundFx) window.soundFx.playUiSelect();
        if (this.onChangeMask) this.onChangeMask();
      }
    }

    // Grade stamp slam animation (lands at 0.75s)
    if (this.animTimer >= 0.65 && !this.stampLanded) {
      this.stampScale = Math.max(1.0, this.stampScale - dt * 10);
      if (this.stampScale <= 1.0) {
        this.stampScale = 1.0;
        this.stampLanded = true;
        // Heavy impact thud
        if (typeof window !== 'undefined' && window.soundFx) {
          window.soundFx.playSkullCrunch();
        }
      }
    }
  }

  handleKeyDown(e) {
    if (!this.visible) return false;

    if (e.key === 'r' || e.key === 'R' || e.key === 'Enter' || e.key === ' ') {
      if (this.mode === 'GAME_OVER') {
        if (this.onRestart) this.onRestart();
      } else {
        if (this.onNextWave) this.onNextWave();
      }
      return true;
    } else if (e.key === 'm' || e.key === 'M') {
      if (this.onChangeMask) this.onChangeMask();
      return true;
    } else if (e.key === 'Escape') {
      if (this.onMainMenu) this.onMainMenu();
      return true;
    }
    return false;
  }

  handleClick(mouseX, mouseY, width, height) {
    if (!this.visible) return false;

    const uiScale = Math.max(1, Math.min(width / 1920, height / 1080));
    mouseX /= uiScale; mouseY /= uiScale; width /= uiScale; height /= uiScale;
    const btnY = height * 0.86;
    const btnH = 46;
    const inMgr = typeof window !== 'undefined' ? (window.input || window.Input) : null;
    const btnW = inMgr && inMgr.isGamepadMode ? 240 : 200;

    // Button 1: Restart / Next Wave
    const btn1X = width * 0.5 - btnW - 12;
    if (mouseX >= btn1X && mouseX <= btn1X + btnW && mouseY >= btnY && mouseY <= btnY + btnH) {
      if (typeof window !== 'undefined' && window.soundFx) window.soundFx.playUiSelect();
      if (this.mode === 'GAME_OVER') {
        if (this.onRestart) this.onRestart();
      } else {
        if (this.onNextWave) this.onNextWave();
      }
      return true;
    }

    // Button 2: Change Mask
    const btn2X = width * 0.5 + 12;
    if (mouseX >= btn2X && mouseX <= btn2X + btnW && mouseY >= btnY && mouseY <= btnY + btnH) {
      if (typeof window !== 'undefined' && window.soundFx) window.soundFx.playUiSelect();
      if (this.onChangeMask) this.onChangeMask();
      return true;
    }

    return false;
  }

  /**
   * Render Score Evaluation Screen
   */
  draw(ctx, width, height) {
    if (!this.visible) return;

    ctx.save();
    const uiScale = Math.max(1, Math.min(width / 1920, height / 1080));
    ctx.scale(uiScale, uiScale); width /= uiScale; height /= uiScale;

    // 1. Dark Vignette Background
    ctx.fillStyle = 'rgba(8, 5, 14, 0.95)';
    ctx.fillRect(0, 0, width, height);

    // 2. Header Banner
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const isGameOver = (this.mode === 'GAME_OVER');
    const titleText = isGameOver ? 'YOU ARE DEAD' : `WAVE ${this.stats.waveReached} CLEARED`;
    const titleColor = isGameOver ? CONFIG.COLORS.BLOOD_FRESH : CONFIG.COLORS.NEON_LIME;

    ctx.shadowColor = titleColor;
    ctx.shadowBlur = 18;
    ctx.fillStyle = titleColor;
    ctx.font = '900 42px "Courier New", monospace';
    ctx.fillText(titleText, width * 0.5, 36);

    ctx.shadowColor = CONFIG.COLORS.NEON_CYAN;
    ctx.shadowBlur = 8;
    ctx.fillStyle = CONFIG.COLORS.NEON_CYAN;
    ctx.font = '700 16px "Courier New", monospace';
    ctx.fillText(isGameOver ? '// EVALUATION REPORT //' : '// SECTOR PACIFIED //', width * 0.5, 88);
    ctx.shadowBlur = 0;

    // 3. Stats & Score Breakdown Left Column
    const col1X = width * 0.035;
    const colY = 130;
    const lineHeight = 28;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 16px "Courier New", monospace';

    ctx.fillText(`TOTAL KILLS:       ${this.stats.totalKills}`, col1X, colY);
    ctx.fillText(`MELEE KILLS:       ${this.stats.meleeKills}`, col1X, colY + lineHeight);
    ctx.fillText(`EXECUTIONS:        ${this.stats.executions}`, col1X, colY + lineHeight * 2);
    ctx.fillText(`DOOR KNOCKDOWNS:   ${this.stats.doorSlams}`, col1X, colY + lineHeight * 3);
    ctx.fillText(`HIGHEST COMBO:     x${this.stats.maxCombo}`, col1X, colY + lineHeight * 4);

    ctx.fillText(`GUN / THROW KILLS: ${this.stats.gunKills} / ${this.stats.throwKills}`, col1X, colY + lineHeight * 5);
    // Points Breakdown
    const bY = colY + lineHeight * 6.2;
    ctx.fillStyle = CONFIG.COLORS.NEON_YELLOW;
    ctx.fillText(`BASE SCORE:        +${this.breakdown.baseScore}`, col1X, bY);
    ctx.fillText(`FLEXIBILITY BONUS: +${this.breakdown.flexibilityScore}`, col1X, bY + lineHeight);
    ctx.fillText(`BOLDNESS BONUS:    +${this.breakdown.boldnessScore}`, col1X, bY + lineHeight * 2);
    ctx.fillText(`CARNAGE BONUS:     +${this.breakdown.carnageScore}`, col1X, bY + lineHeight * 3);
    ctx.fillText(`TIME BONUS:        +${this.breakdown.timeBonus}`, col1X, bY + lineHeight * 4);

    // Total Score Separator Line
    ctx.strokeStyle = CONFIG.COLORS.NEON_PINK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(col1X, bY + lineHeight * 5.2);
    ctx.lineTo(col1X + 360, bY + lineHeight * 5.2);
    ctx.stroke();

    ctx.fillStyle = CONFIG.COLORS.NEON_PINK;
    ctx.font = '900 22px "Courier New", monospace';
    ctx.fillText(`FINAL SCORE: ${this.breakdown.totalCalculatedScore}`, col1X, bY + lineHeight * 6.2);

    // 4. Large Letter Grade Stamp (Right-Center)
    const gradeCenterX = width * 0.51;
    const gradeCenterY = 240;

    ctx.save();
    ctx.translate(gradeCenterX, gradeCenterY);
    ctx.scale(this.stampScale, this.stampScale);
    ctx.rotate(-0.15); // Authentic tilted stamp

    // Grade Letter Box
    ctx.strokeStyle = this.breakdown.gradeColor;
    ctx.lineWidth = 6;
    ctx.shadowColor = this.breakdown.gradeColor;
    ctx.shadowBlur = 24;
    ctx.strokeRect(-65, -65, 130, 130);

    // Grade Letter
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.breakdown.gradeColor;
    ctx.font = '900 78px "Courier New", monospace';
    ctx.fillText(this.breakdown.grade, 0, 4);

    ctx.restore();

    // Grade Title Subtext
    ctx.textAlign = 'center';
    ctx.fillStyle = this.breakdown.gradeColor;
    ctx.font = '900 18px "Courier New", monospace';
    ctx.shadowColor = this.breakdown.gradeColor;
    ctx.shadowBlur = 10;
    ctx.fillText(`"${this.breakdown.gradeTitle}"`, gradeCenterX, gradeCenterY + 85);
    ctx.shadowBlur = 0;

    // 5. Arcade Leaderboard (Right Column)
    const col2X = width * 0.70;
    const leadY = 130;

    ctx.textAlign = 'left';
    ctx.fillStyle = CONFIG.COLORS.NEON_CYAN;
    ctx.font = '900 18px "Courier New", monospace';
    ctx.fillText('CLASSEMENT LOCAL', col2X, leadY);

    ctx.font = '700 13px "Courier New", monospace';
    ctx.fillStyle = '#a0aec0';
    for (let i = 0; i < Math.min(8, this.leaderboard.length); i++) {
      const entry = this.leaderboard[i];
      const y = leadY + 36 + i * 42;
      const maskTag = CONFIG.MASKS[entry.mask]?.name || (entry.mask ? entry.mask.toUpperCase().slice(0,8) : 'PERSONNAGE');
      ctx.fillStyle = (i === 0) ? '#ffd700' : '#ffffff';
      ctx.fillText(`${i + 1}. ${entry.score.toString().padStart(6, '0')} [${entry.grade}] ${maskTag}`, col2X, y);
      ctx.fillStyle = '#b9acc1';
      ctx.fillText(`Vague atteinte : ${entry.wave}`, col2X + 24, y + 18);
    }

    // 6. Action Buttons at Bottom
    const inMgr = (typeof window !== 'undefined') ? (window.input || window.Input) : null;
    const isGamepad = inMgr && inMgr.isGamepadMode;

    const btnY = height * 0.86;
    const btnH = 46;
    const btnW = isGamepad ? 240 : 200;

    // Button 1: Restart / Next
    const btn1X = width * 0.5 - btnW - 12;
    ctx.fillStyle = CONFIG.COLORS.NEON_PINK;
    ctx.fillRect(btn1X, btnY, btnW, btnH);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(btn1X, btnY, btnW, btnH);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 15px "Courier New", monospace';
    const btn1Text = isGameOver 
      ? (isGamepad ? '[A / SELECT] RESTART' : '[R] RESTART RUN')
      : (isGamepad ? '[A] NEXT WAVE' : '[ENTER] NEXT WAVE');
    ctx.fillText(btn1Text, btn1X + btnW * 0.5, btnY + btnH * 0.5);

    // Button 2: Mask Menu
    const btn2X = width * 0.5 + 12;
    ctx.fillStyle = '#1f1633';
    ctx.fillRect(btn2X, btnY, btnW, btnH);
    ctx.strokeStyle = CONFIG.COLORS.NEON_CYAN;
    ctx.strokeRect(btn2X, btnY, btnW, btnH);

    ctx.fillStyle = CONFIG.COLORS.NEON_CYAN;
    const btn2Text = isGamepad ? '[Y / X] CHANGE MASK' : '[M] CHANGE MASK';
    ctx.fillText(btn2Text, btn2X + btnW * 0.5, btnY + btnH * 0.5);

    ctx.restore();
  }
}

// Global export / module compatibility
const scoreScreen = new ScoreScreen();
ScoreScreen.prototype.render = ScoreScreen.prototype.draw;

if (typeof window !== 'undefined') {
  window.scoreScreen = scoreScreen;
  window.ScoreScreen = ScoreScreen;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { scoreScreen, ScoreScreen };
}
