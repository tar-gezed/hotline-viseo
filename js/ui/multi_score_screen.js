(function (root) {
  'use strict';
  const medal = rank => ['#ffe36c', '#d6e0ef', '#dfa073'][rank - 1] || '#bbaec9';
  const clock = seconds => Math.floor((seconds || 0) / 60) + ':' + String(Math.floor((seconds || 0) % 60)).padStart(2, '0');
  function laurels(c, x, y, size) {
    c.save(); c.translate(x, y); c.scale(size, size);
    c.strokeStyle = '#ffe36c'; c.fillStyle = '#ffe36c'; c.lineWidth = .011; c.lineCap = 'round';
    // Both branches share the same curve, mirrored as a whole. Leaves grow
    // directly from that curve; the crossed stems sit below the numeral.
    const point = t => {
      const u = 1 - t;
      return { x:.04*u*u*u + 3*.55*u*u*t + 3*.66*u*t*t + .48*t*t*t,
        y:.49*u*u*u + 3*.45*u*u*t - 3*.06*u*t*t - .38*t*t*t };
    };
    const leaf = (t, dx, dy, width) => {
      const p = point(t), length = Math.hypot(dx, dy), nx = -dy / length * width, ny = dx / length * width;
      c.beginPath(); c.moveTo(p.x, p.y);
      c.quadraticCurveTo(p.x + dx*.48 + nx, p.y + dy*.48 + ny, p.x + dx, p.y + dy);
      c.quadraticCurveTo(p.x + dx*.48 - nx, p.y + dy*.48 - ny, p.x, p.y); c.fill();
    };
    for (const side of [-1, 1]) {
      c.save(); c.scale(side, 1);
      c.beginPath(); c.moveTo(-.075, .505); c.lineTo(.04, .49);
      c.bezierCurveTo(.55, .45, .66, -.06, .48, -.38); c.stroke();
      for (let i = 0; i < 8; i++) {
        const t = .20 + i * .10;
        leaf(t, .12 - t*.045, -.035 - t*.10, .031);
      }
      for (let i = 0; i < 7; i++) leaf(.32 + i*.10, -.055, -.078, .024);
      leaf(.97, -.018, -.10, .023);
      c.restore();
    }
    c.restore();
  }
  class MultiScoreScreen extends CanvasMenu {
    constructor(network) {
      super(); this.network = network; this.rows = []; this.phase = 0; this.ready = new Set(); this.slide = 0;
      this.items = [{action: () => this.advance()}];
    }
    show(rows) { super.show(); this.rows = rows; this.phase = 0; this.ready.clear(); this.slide = 0; this.selectedIndex = 0; }
    advance() {
      if (this.timer < .4) return;
      if (!this.phase) { this.phase = 1; this.slide = 0; this.timer = 0; }
      else if (!this.isReady(this.network.slot)) this.network.resultReady();
    }
    isReady(slot) { return this.ready.has(slot) || this.network.members.get(slot)?.resultReady; }
    update(dt, input, w, h) {
      this.slide = Math.min(1, this.slide + dt * 5);
      // Mouse confirmation is limited to the visible button. Keyboard / A use
      // the same action, and the phase guard prevents a held press skipping it.
      CoopUI.navigate(this, dt, input, w, h, () => {});
    }
    rank(c, rank, x, y, size) {
      if (rank !== 1) { UITheme.text(c, String(rank), x, y, size, medal(rank), 'center', -.045); return; }
      // Italic fonts have asymmetric side bearings. Center the visible ink,
      // rather than its advance width, inside the same wreath at every size.
      c.save(); c.font = `italic 900 ${size}px GameHeading, Impact, 'Arial Black', sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      const m = c.measureText('1');
      const offsetX = (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2 || 0;
      const offsetY = (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2 || 0;
      c.restore();
      laurels(c, x, y, size);
      UITheme.text(c, '1', x - offsetX, y - offsetY, size, medal(rank), 'center', 0, size * .025);
    }
    render(c, w, h, input) {
      if (!this.rows.length) return;
      UITheme.background(c, w, h, this.timer, true); UITheme.begin(c, w, h); this.regions = [];
      c.translate((1 - this.slide) ** 2 * 60, 0);
      if (this.phase === 0) this.spotlight(c, input); else this.columns(c, input);
      c.restore();
    }
    spotlight(c, input) {
      const U = CoopUI, winner = this.rows[0], color = U.colors[winner.slot], mask = CONFIG.MASKS[winner.mask];
      U.text(c, 'FIN DE SERVICE / LE COLLÈGUE DU SOIR', 48, 35, 1184, 14, UITheme.pink);
      // One large rank and one portrait: leave the hero's name its own safe area.
      U.panel(c, 752, 80, 480, 370, color + '25', 26);
      c.save(); c.beginPath(); c.rect(752, 80, 480, 370); c.clip();
      c.strokeStyle = color + '40'; c.lineWidth = 32;
      for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(660 + i * 140, 500); c.lineTo(880 + i * 140, 40); c.stroke(); }
      c.restore();
      U.portrait(c, mask, 752, 80, 480, 370, 6.5, Math.sin(this.timer * 2) * 2);
      this.rank(c, 1, 162, 168, 172);
      U.text(c, 'MVP', 310, 150, 350, 22, '#ffe36c');
      U.text(c, 'P' + (winner.slot + 1) + ' · ' + winner.name, 310, 190, 398, 22, color);
      U.text(c, mask.name, 52, 311, 653, 108, UITheme.ivory, 'left', true);
      U.text(c, 'L’ÉQUIPE AVAIT BESOIN DE VOUS.', 56, 376, 635, 15, UITheme.muted);
      U.text(c, winner.kills + ' KOs   /   ' + winner.score.toLocaleString('fr-FR') + ' POINTS', 56, 417, 650, 23, color);
      const others = this.rows.slice(1), width = Math.min(282, 1184 / others.length), left = (1280 - width * others.length) / 2;
      others.forEach((row, i) => {
        const x = left + i * width, color = U.colors[row.slot];
        U.panel(c, x + 5, 483, width - 10, 126, '#251d32', 12);
        c.fillStyle = color; c.fillRect(x + 5, 483, width - 10, 3);
        U.portrait(c, CONFIG.MASKS[row.mask], x + 55, 490, 98, 119, 2.1);
        this.rank(c, i + 2, x + 35, 549, 56);
        U.text(c, 'P' + (row.slot + 1), x + 161, 508, width - 174, 12, color);
        U.text(c, CONFIG.MASKS[row.mask].name, x + 161, 537, width - 174, 24, UITheme.ivory, 'left', true);
        U.text(c, row.name, x + 161, 567, width - 174, 12, UITheme.muted);
        U.text(c, row.kills + ' KOs', x + 161, 591, width - 174, 12, color);
      });
      U.button(this, c, 0, 'VOIR LES SCORES', 432, 644, 416, 49, {primary:true, color:UITheme.cyan, hint:input?.isGamepadMode ? 'A' : 'ESPACE / ENTRÉE'});
    }
    columns(c, input) {
      const U = CoopUI, rows = this.rows.slice().sort((a, b) => a.slot - b.slot);
      const width = Math.min(430, 1200 / rows.length), left = (1280 - width * rows.length) / 2;
      U.text(c, 'BILAN DE MISSION', 40, 32, 630, 25, UITheme.ivory, 'left', true);
      const connected = [...this.network.members.keys()].filter(slot => rows.some(r => r.slot === slot));
      const readyCount = connected.filter(slot => this.isReady(slot)).length;
      U.text(c, readyCount + ' / ' + connected.length + ' VALIDÉS', 1240, 32, 450, 14, UITheme.cyan, 'right');
      rows.forEach((row, i) => {
        const x = left + i * width + 6, cw = width - 12, color = U.colors[row.slot], rank = this.rows.indexOf(row) + 1;
        const local = row.slot === this.network.slot, connected = this.network.members.has(row.slot), ready = this.isReady(row.slot);
        U.panel(c, x, 63, cw, 594, '#171421', 14);
        c.fillStyle = color; c.fillRect(x, 63, cw, 5);
        U.text(c, CONFIG.MASKS[row.mask].name, x + 16, 94, cw - 32, 35, color, 'left', true);
        U.text(c, 'P' + (row.slot + 1) + (local ? ' / VOUS' : ''), x + 16, 124, cw - 32, 12, UITheme.ivory);
        U.text(c, row.name, x + 16, 145, cw - 32, 13, UITheme.muted);
        c.save(); c.beginPath(); c.moveTo(x, 168); c.lineTo(x + cw, 157); c.lineTo(x + cw, 340); c.lineTo(x, 352); c.closePath(); c.clip();
        c.fillStyle = color + '45'; c.fillRect(x, 157, cw, 198);
        U.portrait(c, CONFIG.MASKS[row.mask], x, 153, cw, 205, cw > 300 ? 4.7 : 4.2);
        c.restore();
        this.rank(c, rank, x + cw - (rank === 1 ? 65 : 51), rank === 1 ? 303 : 310, 88);
        c.fillStyle = color + '25'; c.fillRect(x, 353, cw, 58);
        U.text(c, row.isAlive ? 'SURVIVANT' : 'K.O. · VAGUE ' + row.deathWave, x + 16, 373, cw - 32, 16, color);
        U.text(c, row.isAlive ? 'AU BOUT DE LA MISSION' : clock(row.deathTime), x + 16, 396, cw - 32, 12, UITheme.ivory);
        const stats = [['ÉLIMINATIONS', row.kills], ['MISES K.O.', row.falls]];
        stats.forEach(([label, value], j) => {
          const y = 433 + j * 41;
          c.fillStyle = j ? '#211a2d' : '#1a1626'; c.fillRect(x, y - 19, cw, 40);
          U.text(c, label, x + 16, y, cw - 85, 12, UITheme.muted);
          U.text(c, value, x + cw - 16, y, 60, 29, UITheme.ivory, 'right', true);
        });
        const weapon = Object.values(CONFIG.WEAPONS).find(w => w.id.toUpperCase() === row.favoriteWeapon?.toUpperCase());
        const weaponLabel = weapon?.name || ({FISTS:'À MAINS NUES',DOOR:'PORTES',EXECUTION:'EXÉCUTIONS'})[row.favoriteWeapon] || '—';
        U.text(c, 'ARME DE PRÉDILECTION', x + 16, 512, cw - 32, 10, UITheme.muted);
        U.text(c, weaponLabel, x + 16, 534, cw - 32, 17, UITheme.ivory, 'left', true);
        U.text(c, 'SCORE', x + 16, 574, 67, 12, UITheme.muted);
        U.text(c, row.score.toLocaleString('fr-FR'), x + cw - 16, 574, cw - 106, 31, color, 'right', true);
        if (local) U.button(this, c, 0, ready ? '✓ VALIDÉ !' : 'RETOUR AU SALON', x + 8, 608, cw - 16, 40, {primary:true,color,disabled:ready,hint:ready ? '' : input?.isGamepadMode ? 'A : PRÊT' : 'ESPACE / ENTRÉE : PRÊT'});
        else U.text(c, !connected ? 'DÉCONNECTÉ' : ready ? '✓ VALIDÉ !' : 'EN ATTENTE…', x + cw / 2, 629, cw - 24, 15, ready ? color : UITheme.muted, 'center');
        if (ready) { c.strokeStyle = color; c.lineWidth = 2; c.strokeRect(x + 1, 64, cw - 2, 592); }
      });
      U.text(c, 'LE SALON ROUVRE QUAND TOUS LES COLLÈGUES CONNECTÉS ONT VALIDÉ.', 640, 689, 1200, 12, UITheme.muted, 'center');
    }
  }
  root.MultiScoreScreen = MultiScoreScreen;
})(typeof window !== 'undefined' ? window : globalThis);
