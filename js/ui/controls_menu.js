(function (root) {
  'use strict';
  class ControlsMenu extends CanvasMenu {
    constructor(onBack) {
      super(); this.onBack = onBack; this.tab = 0;
      this.items = [
        { label: 'CLAVIER / SOURIS', action: () => { this.tab = 0; } },
        { label: 'MANETTE', action: () => { this.tab = 1; } },
        { label: 'RETOUR', action: onBack }
      ];
      this.controller = new Image(); this.controller.src = 'assets/images/PS5_Controller.png';
    }
    select(i) { super.select(i); if (i < 2) this.tab = i; }
    render(c, w, h, input) {
      UITheme.background(c, w, h, this.timer, true); UITheme.begin(c, w, h); this.regions = [];
      this.header(c, 'CONTRÔLES');
      this.option(c, 0, 'CLAVIER / SOURIS', 80, 188, 28, 320);
      this.option(c, 1, 'MANETTE', 470, 188, 28, 240);
      if (this.tab === 0) this.keyboard(c); else this.gamepad(c);
      this.option(c, 2, 'RETOUR', 80, 674, 23, 130); this.footer(c, input);
      c.restore(); UITheme.texture(c, w, h, this.timer);
    }
    keyboard(c) {
      const rows = [
        ['WASD / ZQSD / FLÈCHES', 'Se déplacer'], ['SOURIS', 'Viser'],
        ['CLIC GAUCHE / J / ENTRÉE', 'Attaquer'], ['CLIC DROIT / E / F / K', 'Ramasser / lancer'],
        ['ESPACE', 'Exécuter / frapper une porte'], ['MAJ', 'Regarder plus loin'],
        ['R', 'Recommencer'], ['ÉCHAP / P', 'Pause'], ['M (EN PAUSE)', 'Couper la musique']
      ];
      rows.forEach(([key, action], i) => {
        const x = i < 5 ? 80 : 700, y = 278 + i % 5 * 67;
        UITheme.small(c, key, x, y, 16, UITheme.cyan);
        UITheme.text(c, action.toUpperCase(), x, y + 26, 23);
      });
    }
    gamepad(c) {
      // Keep the supplied transparent artwork intact, with its original aspect.
      if (this.controller.complete && this.controller.naturalWidth) {
        c.save(); c.globalAlpha = .86;
        c.globalCompositeOperation = 'screen';
        c.drawImage(this.controller, 425, 228, 430, 430); c.restore();
      }
      const rows = [
        ['L2 / LT', 'RAMASSER / LANCER', 80, 278, 500, 301],
        ['L1 / LB', 'REGARDER PLUS LOIN', 80, 354, 493, 314],
        ['CREATE / BACK', 'RECOMMENCER', 80, 438, 541, 338],
        ['STICK GAUCHE', 'SE DÉPLACER', 80, 522, 574, 444],
        ['R2 / RT', 'ATTAQUER', 950, 278, 780, 301],
        ['R1 / RB / □ / X', 'RAMASSER / LANCER', 950, 354, 787, 314],
        ['△ / Y', 'EXÉCUTER / PORTE', 950, 430, 769, 354],
        ['OPTIONS / START', 'PAUSE', 950, 506, 735, 338],
        ['STICK DROIT', 'VISER', 950, 582, 707, 444]
      ];
      rows.forEach(([key, label, x, y, ax, ay]) => {
        c.strokeStyle = '#775569'; c.lineWidth = 1; c.beginPath();
        c.moveTo(x < 640 ? x + 275 : x - 16, y + 8); c.lineTo(ax, ay); c.stroke();
        c.fillStyle = UITheme.pink; c.beginPath(); c.arc(ax, ay, 3, 0, Math.PI * 2); c.fill();
        UITheme.small(c, key, x, y, 15, UITheme.cyan); UITheme.text(c, label, x, y + 25, 21);
      });
    }
  }
  root.ControlsMenu = ControlsMenu;
})(typeof window !== 'undefined' ? window : globalThis);
