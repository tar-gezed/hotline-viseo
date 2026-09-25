(function (root) {
  'use strict';
  class TitleMenu extends CanvasMenu {
    constructor(actions) {
      super();
      this.items = [
        { label: 'COMMENCER MA JOURNÉE', action: actions.start },
        ...(actions.multiplayer ? [{ label: 'MULTIJOUEUR (2–5)', action: actions.multiplayer }] : []),
        { label: 'CONTRÔLES', action: actions.controls },
        { label: 'AUDIO', action: actions.audio },
        { label: 'TOOLS / MAPS', action: actions.tools },
        { label: 'CRÉDITS', action: actions.credits }
      ];
    }
    render(c, w, h) {
      UITheme.background(c, w, h, this.timer);
      UITheme.begin(c, w, h); this.regions = [];
      const entrance = Math.pow(1 - Math.min(1, this.timer / .48), 3);
      c.save(); c.translate(640, 235 + Math.sin(this.timer * .75) * 4 - entrance * 24);
      c.rotate(-.075 + Math.sin(this.timer * .45) * .008);
      c.globalAlpha = 1 - entrance;
      // Match the death stamp's steady neon halo in display pixels.
      const glow = 16 * UITheme.frame(w, h).scale;
      UITheme.text(c, 'HOTLINE', -8, -54, 128, UITheme.ivory, 'center', 0, glow);
      UITheme.text(c, 'VISEO', 3, 70, 180, UITheme.pink, 'center', 0, glow);
      // The cyan registration slip stays crisp below the glowing lettering.
      c.fillStyle = UITheme.cyan; c.fillRect(-230, 150, 460, 3);
      c.restore();
      this.items.forEach((item, i) => {
        const reveal = Math.min(1, Math.max(0, (this.timer - .08 - i * .045) / .22));
        c.save(); c.globalAlpha = reveal;
        if (i === this.items.length - 1) this.option(c, i, item.label, 1118, 674, 23, 120, 'center');
        else this.option(c, i, item.label, 640 - (1 - reveal) * 22, this.items.length > 5 ? 435 + i * 47 : 459 + i * 51, i === this.items.length - 2 ? 23 : 32, 440, 'center');
        c.restore();
      });
      c.restore(); UITheme.texture(c, w, h, this.timer);
    }
  }
  root.TitleMenu = TitleMenu;
})(typeof window !== 'undefined' ? window : globalThis);
