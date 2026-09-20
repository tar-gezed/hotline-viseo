/* Character selection: one featured portrait, seven names, existing gameplay data. */
(function (root) {
  'use strict';
  class MaskMenu extends CanvasMenu {
    constructor() {
      super(); this.maskList = Object.values(CONFIG.MASKS);
      this.selectedMaskId = 'vincent'; this.onMaskConfirmed = null;
      this.items = this.maskList.map(m => ({ label: m.name, action: () => this.confirmSelection() }));
      this.items.push({ label: 'RETOUR', action: () => this.onBack?.() });
    }
    show(initialMaskId = this.selectedMaskId) {
      super.show();
      this.selectedIndex = Math.max(0, this.maskList.findIndex(m => m.id === initialMaskId));
      this.selectedMaskId = this.maskList[this.selectedIndex].id;
    }
    select(index) {
      super.select(index);
      if (this.maskList[this.selectedIndex]) this.selectedMaskId = this.maskList[this.selectedIndex].id;
    }
    selectIndex(index) { this.select(index); }
    nextMask() { this.select((this.selectedIndex + 1) % this.maskList.length); }
    prevMask() { this.select((this.selectedIndex - 1 + this.maskList.length) % this.maskList.length); }
    getSelectedMask() { return CONFIG.MASKS[this.selectedMaskId]; }
    confirmSelection() { this.onMaskConfirmed?.(this.selectedMaskId, this.getSelectedMask()); }
    update(dt, input, w, h) {
      for (let i = 0; i < this.maskList.length; i++) if (input.isJustPressed('Digit' + (i + 1))) this.select(i);
      super.update(dt, input, w, h);
    }
    render(c, w, h, input) {
      UITheme.background(c, w, h, this.timer, true); UITheme.begin(c, w, h); this.regions = [];
      this.header(c, 'QUI PREND SON SERVICE ?');
      const m = this.getSelectedMask();
      c.save(); c.translate(324, 342); c.rotate(-.045);
      c.fillStyle = '#38283e'; c.fillRect(-179, -168, 358, 338);
      c.fillStyle = UITheme.pink; c.fillRect(-180, 157, 360, 5);
      CharacterArt.portrait(c, m, 0, -9 + Math.sin(this.timer * 2) * 2, 5.2);
      c.restore();
      UITheme.text(c, m.name, 324, 553, 52, UITheme.ivory, 'center', -.035);
      UITheme.small(c, m.animal.toUpperCase() + ' / ' + m.role.toUpperCase(), 324, 596, 13, UITheme.muted, 'center');
      this.maskList.forEach((mask, i) => {
        UITheme.small(c, '0' + (i + 1), 674, 193 + i * 41, 12, UITheme.muted);
        this.option(c, i, mask.name, 720, 193 + i * 41, 29, 360);
      });
      UITheme.text(c, m.quote.toUpperCase(), 684, 503, 23, UITheme.pink);
      const used = UITheme.wrap(c, m.perkDesc, 684, 546, 490, 16);
      UITheme.small(c, 'DÉPART : ' + m.startDesc, 684, 552 + used, 15, UITheme.cyan);
      this.option(c, 7, 'RETOUR', 80, 674, 23, 130);
      this.footer(c, input);
      c.restore(); UITheme.texture(c, w, h, this.timer);
    }
    draw(...args) { this.render(...args); }
  }
  root.MaskMenu = MaskMenu;
})(typeof window !== 'undefined' ? window : globalThis);
