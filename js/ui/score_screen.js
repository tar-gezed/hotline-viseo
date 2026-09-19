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
    this.showLeaderboard = false;
    this.isGamepad = false;
    this.pendingAction = null;
    this.hoveredAction = null;
    this.shareStatus = '';
    this.sharePending = false;
    this.shareRequest = (this.shareRequest || 0) + 1;

    this.evaluateRun(runStats);

    // If Game Over, save high score to localStorage leaderboard
    if (this.mode === 'GAME_OVER') {
      this.saveToLeaderboard();
    }
    if (typeof window !== 'undefined') window.synthMusic?.play('results');
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

  // All presentation uses one 1280 × 720 safe area; scenery fills the viewport.
  frame(width, height) {
    const scale = Math.min(width / 1280, height / 720);
    return { scale, x: (width - 1280 * scale) / 2, y: (height - 720 * scale) / 2 };
  }

  get tallyComplete() { return this.animTimer >= 1.85; }

  sound(method) {
    if (typeof window !== 'undefined') window.soundFx?.[method]?.();
  }

  finishTally() {
    this.animTimer = Math.max(this.animTimer, 1.85);
    this.stampScale = 1;
    this.stampLanded = true;
    this.sound('playUiSelect');
  }

  activate(action) {
    if (action === 'share') return this.shareScore();
    if (action === 'confirm' && !this.tallyComplete) return this.finishTally();
    if (action === 'board') {
      if (!this.tallyComplete) this.finishTally();
      this.showLeaderboard = !this.showLeaderboard;
      return;
    }
    this.sound('playUiSelect');
    if (action === 'confirm') {
      if (this.mode === 'GAME_OVER') this.onRestart?.();
      else this.onNextWave?.();
    } else if (action === 'mask') this.onChangeMask?.();
    else if (action === 'back') {
      if (this.showLeaderboard) this.showLeaderboard = false;
      else this.onMainMenu?.();
    }
  }

  update(dt, input = null) {
    if (!this.visible) return;
    const before = this.animTimer;
    this.animTimer += Math.max(0, dt);
    const inMgr = input || (typeof window !== 'undefined' ? window.input : null);
    if (this.pendingAction) {
      const action = this.pendingAction;
      this.pendingAction = null;
      this.activate(action);
    } else if (inMgr) {
      this.isGamepad = !!inMgr.isGamepadMode;
      const key = (...keys) => !this.eventDrivenKeyboard && !!inMgr.isJustPressed?.(...keys);
      const pad = inMgr.gamepad?.connected ? inMgr.gamepad.justPressed || {} : {};
      if (key('Tab', 'KeyL') || pad.buttonX) this.activate('board');
      else if (key('KeyM') || pad.buttonY) this.activate('mask');
      else if (key('Escape') || pad.buttonB) this.activate('back');
      else if (key('KeyS') || pad.buttonRB) this.activate('share');
      else if (this.eventDrivenKeyboard ? (pad.buttonA || pad.buttonRT || pad.buttonStart || pad.buttonSelect) : (inMgr.isMenuConfirmJustPressed?.() || inMgr.isRestartJustPressed?.())) this.activate('confirm');
    }
    // Never replay a burst of ticks after a background tab resumes or a skip.
    const tick = t => Math.min(8, Math.max(0, Math.floor((t - .18) / .14) + 1));
    if (!this.tallyComplete && tick(this.animTimer) > tick(before)) this.sound('playUiHover');
    if (this.animTimer >= 1.58) {
      const age = this.animTimer - 1.58;
      this.stampScale = age < .16 ? 1.42 - .5 * Math.pow(age / .16, 2) :
        age < .27 ? .92 + .08 * Math.sin((age - .16) / .11 * Math.PI / 2) : 1;
      if (age >= .16 && !this.stampLanded) {
        this.stampLanded = true;
        this.sound('playScoreStamp');
      }
    }
  }

  handleKeyDown(e, queue = false) {
    if (!this.visible) return false;
    const action = { r: 'confirm', Enter: 'confirm', ' ': 'confirm', e: 'confirm',
      m: 'mask', s: 'share', Tab: 'board', l: 'board', Escape: 'back' }[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (!action) return false;
    e.preventDefault?.();
    if (!e.repeat) {
      if (queue && action !== 'share') this.pendingAction = action;
      else this.activate(action); // Clipboard APIs need the actual user gesture.
    }
    return true;
  }

  actions() {
    const pad = this.isGamepad;
    return [
      { action: 'confirm', x: 64, w: 280, text: !this.tallyComplete ? `${pad ? '[A / ×]' : '[ENTRÉE]'} PASSER LE DÉCOMPTE` : `${pad ? '[A / ×]' : '[R]'} ${this.mode === 'GAME_OVER' ? 'REJOUER' : 'VAGUE SUIVANTE'}` },
      { action: 'mask', x: 370, w: 255, text: `${pad ? '[Y / △]' : '[M]'} PERSONNAGES` },
      { action: 'board', x: 670, w: 295, text: `${pad ? '[X / □]' : '[TAB / L]'} ${this.showLeaderboard ? 'RÉSULTATS' : 'CLASSEMENT'}` },
      { action: 'share', x: 1000, w: 216, text: `${pad ? '[RB / R1]' : '[S]'} ${this.shareStatus || 'PARTAGER'}` }
    ];
  }

  hitAction(mouseX, mouseY, width, height) {
    if (!this.visible) return null;
    const f = this.frame(width, height);
    const x = (mouseX - f.x) / f.scale, y = (mouseY - f.y) / f.scale;
    return this.actions().find(a => x >= a.x && x <= a.x + a.w && y >= 651 && y <= 701);
  }

  handleClick(mouseX, mouseY, width, height, queue = false) {
    const action = this.hitAction(mouseX, mouseY, width, height);
    if (!action) return false;
    if (queue && action.action !== 'share') this.pendingAction = action.action;
    else this.activate(action.action);
    return true;
  }

  shareText() {
    return `🌴 Hotline VISEO — AFTER HOURS\n🏆 Score : ${this.breakdown.totalCalculatedScore.toLocaleString('fr-FR')}\n🌊 Vague : ${this.stats.waveReached}\n🔥 Grade : ${this.breakdown.grade} — ${this.breakdown.gradeTitle}\n🎮 À vous de jouer ! https://tar-gezed.github.io/hotline-viseo/`;
  }

  async shareScore() {
    if (this.sharePending) return;
    const request = this.shareRequest, text = this.shareText();
    this.sharePending = true;
    this.shareStatus = 'COPIE…';
    let copied = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (_) { /* Try the legacy copy path when clipboard access is unavailable. */ }
    if (!copied && typeof document !== 'undefined') {
      const previous = document.activeElement;
      const field = document.createElement('textarea');
      field.value = text;
      field.style.cssText = 'position:fixed;left:-9999px;top:0;user-select:text';
      try {
        document.body.appendChild(field); field.select();
        copied = !!document.execCommand?.('copy');
      } catch (_) { /* Show a truthful retry state if browser policy blocks copying. */ }
      finally { field.remove(); previous?.focus?.({ preventScroll: true }); }
    }
    if (request === this.shareRequest) {
      this.sharePending = false;
      this.shareStatus = copied ? 'COPIÉ !' : 'RÉESSAYER';
      if (copied) this.sound('playUiSelect');
    }
    return copied;
  }

  text(c, text, x, y, size, color = '#f9ecd7', angle = 0, align = 'left', maxWidth = Infinity) {
    c.save(); c.translate(x, y); c.rotate(angle);
    c.textBaseline = 'middle'; c.textAlign = align;
    c.font = `italic 900 ${size}px Impact, 'Arial Black', sans-serif`;
    const measured = c.measureText(String(text)).width;
    if (measured > maxWidth) c.font = `italic 900 ${size * maxWidth / measured}px Impact, 'Arial Black', sans-serif`;
    c.fillStyle = '#24152f'; c.fillText(String(text), 3, 4);
    c.fillStyle = color; c.fillText(String(text), 0, 0); c.restore();
  }

  small(c, text, x, y, color = '#dac0d5', align = 'left') {
    c.font = '600 13px Arial, sans-serif'; c.textAlign = align;
    c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(text, x, y);
  }

  scenery(c, width, height) {
    c.save();
    const scale = height / 720, w = width / scale;
    c.scale(scale, scale);
    const sky = c.createLinearGradient(0, 0, 0, 720);
    sky.addColorStop(0, '#241739'); sky.addColorStop(.48, '#9d386a');
    sky.addColorStop(.72, '#e16d7c'); sky.addColorStop(1, '#231b42');
    c.fillStyle = sky; c.fillRect(0, 0, w, 720);
    const sunX = w / 2 + 245;
    const glow = c.createRadialGradient(sunX, 287, 20, sunX, 287, 300);
    glow.addColorStop(0, '#e96b8466'); glow.addColorStop(1, '#e96b8400');
    c.fillStyle = glow; c.fillRect(sunX - 300, 0, 600, 600);
    c.save(); c.beginPath(); c.arc(sunX, 283, 145, 0, Math.PI * 2); c.clip();
    const sun = c.createLinearGradient(0, 138, 0, 420);
    sun.addColorStop(0, '#ffbc87'); sun.addColorStop(1, '#ff4d8b');
    c.fillStyle = sun; c.fillRect(sunX - 145, 130, 290, 300);
    c.fillStyle = '#a13d70';
    for (let y = 290; y < 430; y += 14) c.fillRect(sunX - 150, y, 300, (y - 270) / 22);
    c.restore();
    // Angular Alpine ridgelines, original geometry, no external assets.
    for (let layer = 0; layer < 3; layer++) {
      c.fillStyle = ['#794169', '#512c57', '#34233f'][layer];
      c.beginPath(); c.moveTo(0, 490);
      for (let i = 0; i <= Math.ceil(w / 95); i++) {
        const y = 350 + layer * 40 - Math.sin(i * 2.1 + layer) * (65 - layer * 12);
        c.lineTo(i * 95, y);
      }
      c.lineTo(w, 550); c.lineTo(0, 550); c.fill();
    }
    c.fillStyle = '#312440'; c.fillRect(0, 495, w, 225);
    // Isère-like horizontal reflections gently drift below the skyline.
    for (let i = 0; i < 42; i++) {
      const y = 499 + i * 4;
      const span = 50 + i * 8 + Math.sin(i * 3.8) * 45;
      c.fillStyle = i % 3 ? '#d3618b28' : '#f2a08a55';
      c.fillRect(sunX - span / 2 + Math.sin(this.animTimer * .35 + i) * 10, y, span, 2);
    }
    for (let i = 0; i < Math.ceil(w / 72); i++) {
      const x = i * 72, h = 28 + ((i * 37) % 65);
      c.fillStyle = '#261e38'; c.fillRect(x, 500 - h, 61, h);
      c.fillStyle = '#e9949866';
      for (let row = 0; row < h / 12 - 1; row++) for (let col = 0; col < 5; col++) {
        if ((row + col + i) % 3) c.fillRect(x + 7 + col * 10, 506 - h + row * 12, 3, 4);
      }
    }
    // Foreground office roof, antenna and ventilation silhouette.
    c.fillStyle = '#19172c'; c.fillRect(w - 235, 574, 235, 146);
    c.fillRect(w - 190, 557, 62, 17); c.fillRect(w - 95, 508, 3, 70);
    c.fillRect(w - 122, 526, 54, 2);
    const shade = c.createLinearGradient(0, 0, w, 0);
    shade.addColorStop(0, '#231830e8'); shade.addColorStop(.44, '#291732b0'); shade.addColorStop(.68, '#29173200');
    c.fillStyle = shade; c.fillRect(0, 0, w, 720);
    c.fillStyle = '#130e211a';
    for (let y = 0; y < 720; y += 4) c.fillRect(0, y, w, 1);
    c.restore();
  }

  categories() {
    return [
      ['TOTAL KILLS', this.stats.totalKills, ''], ['MELEE KILLS', this.stats.meleeKills, ''],
      ['EXECUTIONS', this.stats.executions, ''], ['HIGHEST COMBO', this.stats.maxCombo, '×'],
      ['FLEXIBILITY BONUS', this.breakdown.flexibilityScore, '+'], ['BOLDNESS BONUS', this.breakdown.boldnessScore, '+'],
      ['CARNAGE BONUS', this.breakdown.carnageScore, '+'], ['TIME BONUS', this.breakdown.timeBonus, '+']
    ];
  }

  drawLeaderboard(c) {
    this.text(c, 'CLASSEMENT LOCAL', 64, 189, 27, '#f5bad4', -.04);
    if (!this.leaderboard.length) this.small(c, 'AUCUNE PARTIE ENREGISTRÉE', 64, 250);
    this.leaderboard.forEach((entry, i) => {
      const y = 237 + i * 38, current = entry.runId === this.stats.runId;
      if (current) {
        c.fillStyle = '#f6559b25'; c.fillRect(58, y - 17, 514, 35);
        c.fillStyle = '#ff80b1'; c.fillRect(58, y - 17, 3, 35);
      }
      const color = current ? '#ffd4e4' : '#c4a9c2';
      const mask = CONFIG.MASKS[entry.mask]?.name || entry.mask.toUpperCase().slice(0, 12);
      this.text(c, String(i + 1).padStart(2, '0'), 72, y, 22, color);
      this.text(c, entry.score.toLocaleString('fr-FR'), 272, y, 25, color, 0, 'right', 150);
      this.text(c, entry.grade, 300, y, 23, color);
      this.small(c, `${mask} · V${entry.wave}${current ? ' · VOUS' : ''}`, 340, y - 6, color);
      this.small(c, `${entry.date || '—'} · COMBO ×${entry.maxCombo ?? 0}`, 340, y + 9, color);
    });
    if (!this.leaderboard.some(e => e.runId === this.stats.runId)) {
      this.small(c, this.mode === 'WAVE_CLEAR' ? 'CLASSEMENT ENREGISTRÉ EN FIN DE PARTIE' : 'CETTE PARTIE EST HORS DU TOP 8', 64, 558, '#f5bad4');
    }
  }

  draw(ctx, width, height) {
    if (!this.visible) return;
    this.scenery(ctx, width, height);
    const f = this.frame(width, height);
    ctx.save(); ctx.translate(f.x, f.y); ctx.scale(f.scale, f.scale);
    this.small(ctx, `VISEO   /   GRENOBLE   /   ${this.mode === 'GAME_OVER' ? 'FIN DE SERVICE' : 'VAGUE TERMINÉE'}`, 64, 40, '#ffb8cc');
    this.text(ctx, 'AFTER HOURS', 60, 113, 84, '#f9ecd7', -.065);
    this.small(ctx, `VAGUE ${String(this.stats.waveReached).padStart(2, '0')}  ·  ${CONFIG.MASKS[this.stats.maskId]?.name || this.stats.maskId.toUpperCase()}  ·  ${Math.floor(this.stats.elapsedTime / 60)}:${String(Math.floor(this.stats.elapsedTime % 60)).padStart(2, '0')}`, 67, 162);

    if (this.showLeaderboard) this.drawLeaderboard(ctx);
    else this.categories().forEach(([label, value, prefix], i) => {
      const age = this.animTimer - (.18 + i * .14);
      if (age < 0) return;
      const progress = Math.min(1, age / .24), ease = 1 - Math.pow(1 - progress, 3);
      const x = 64 + (i % 2) * 265, y = 212 + Math.floor(i / 2) * 91;
      ctx.save(); ctx.globalAlpha = Math.min(1, age / .08);
      ctx.translate(0, (1 - ease) * 12);
      this.text(ctx, label, x, y, 19, i < 4 ? '#eeb7cf' : '#95d5d1', -.04);
      this.text(ctx, prefix + Math.round(value * ease).toLocaleString('fr-FR'), x, y + 38, 49, '#fff0d7', -.025, 'left', 228);
      ctx.restore();
    });

    // Grade stamps only after the final score has finished counting.
    if (this.animTimer >= 1.58) {
      const impactAge = this.animTimer - 1.74;
      const impact = impactAge >= 0 ? Math.max(0, 1 - impactAge / .24) : 0;
      ctx.save(); ctx.translate(1020, 250);
      if (impact > 0) {
        ctx.strokeStyle = this.breakdown.gradeColor;
        ctx.globalAlpha = impact * .7; ctx.lineWidth = 3;
        for (let i = 0; i < 12; i++) {
          const angle = i * Math.PI / 6, r = 128 + (1 - impact) * 18;
          ctx.beginPath(); ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r * .72);
          ctx.lineTo(Math.cos(angle) * (r + 22 * impact), Math.sin(angle) * (r + 22 * impact) * .72); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      ctx.translate(Math.sin(impactAge * 90) * impact * 5, Math.cos(impactAge * 70) * impact * 3);
      ctx.scale(this.stampScale, this.stampScale);
      this.text(ctx, this.breakdown.grade, 0, 0, 206, this.breakdown.gradeColor, .12, 'center');
      ctx.restore();
      if (this.stampLanded) this.text(ctx, this.breakdown.gradeTitle, 1020, 388, 23, '#ffe4d5', 0, 'center', 370);
    }
    this.text(ctx, 'FINAL SCORE', 646, 458, 40, '#ffadd0', -.065);
    const totalProgress = Math.max(0, Math.min(1, (this.animTimer - 1.22) / .34));
    const total = Math.round(this.breakdown.totalCalculatedScore * (1 - Math.pow(1 - totalProgress, 3)));
    this.text(ctx, total.toLocaleString('fr-FR'), 640, 545, 106, '#fff1cc', -.04, 'left', 572);
    this.small(ctx, 'LES NÉONS S’ÉTEIGNENT. LE SCORE RESTE.', 648, 602, '#dba6c4');

    this.small(ctx, `BASE ${this.breakdown.baseScore.toLocaleString('fr-FR')}   ·   TIRS ${this.stats.gunKills}   ·   LANCERS ${this.stats.throwKills}`, 64, 589);
    this.small(ctx, `PORTES ${this.stats.doorSlams}   ·   ARMES ${this.stats.weaponsUsed.size}   ·   VAGUES FINIES ${this.stats.wavesCleared}`, 64, 610);
    ctx.fillStyle = '#f898bc66'; ctx.fillRect(64, 637, 1152, 1);
    for (const action of this.actions()) {
      const hovered = action.action === this.hoveredAction && !this.isGamepad;
      this.text(ctx, action.text, action.x, 676, 22, hovered ? '#ffadd0' : '#f9ecd7', -.025, 'left', action.w);
      if (hovered) { ctx.fillStyle = '#ffadd0'; ctx.fillRect(action.x, 695, action.w - 12, 2); }
    }
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
