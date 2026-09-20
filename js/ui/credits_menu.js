(function (root) {
  'use strict';
  class CreditsMenu extends CanvasMenu {
    constructor(onBack) {
      super(); this.onBack = onBack;
      this.items = [{ label: 'RETOUR', action: onBack }];
      this.roles = [
        'CRÉATION & DIRECTION', 'GAME DESIGN', 'PRODUCTION',
        'PROGRAMMATION', 'MOTEUR & PHYSIQUE', 'INTELLIGENCE ARTIFICIELLE',
        'DIRECTION ARTISTIQUE', 'PERSONNAGES & ANIMATION', 'DÉCORS & LEVEL DESIGN',
        'INTERFACE & EXPÉRIENCE', 'MUSIQUE', 'SOUND DESIGN',
        'SCÉNARIO & DIALOGUES', 'TESTS & QUALITÉ', 'INTÉGRATION & PUBLICATION'
      ];
    }
    render(c, w, h, input) {
      UITheme.background(c, w, h, this.timer, true);
      UITheme.begin(c, w, h); this.regions = [];
      this.header(c, 'CRÉDITS');
      c.fillStyle = UITheme.pink; c.fillRect(80, 170, 1120, 2);
      this.roles.forEach((role, i) => {
        const x = 80 + i % 3 * 390, y = 228 + Math.floor(i / 3) * 82;
        const reveal = Math.min(1, Math.max(0, (this.timer - Math.floor(i / 3) * .045) / .25));
        c.save(); c.globalAlpha = reveal; c.translate(0, (1 - reveal) * 10);
        UITheme.small(c, role, x, y, 14, UITheme.cyan);
        UITheme.text(c, 'Targezed', x, y + 30, 32);
        c.restore();
      });
      this.option(c, 0, 'RETOUR', 80, 674, 23, 130); this.footer(c, input);
      c.restore(); UITheme.texture(c, w, h, this.timer);
    }
  }
  root.CreditsMenu = CreditsMenu;
})(typeof window !== 'undefined' ? window : globalThis);
