(function (root) {
  'use strict';
  class PauseMenu extends CanvasMenu {
    constructor(actions) {
      super(); this.onBack = actions.resume;
      this.maskName = actions.maskName;
      this.items = [{ label: 'REPRENDRE', action: actions.resume }, { label: 'AUDIO', action: actions.audio }, { label: 'RECOMMENCER', action: actions.restart }];
    }
    render(c, w, h, input) {
      c.fillStyle = 'rgba(16,14,32,.88)'; c.fillRect(0, 0, w, h);
      UITheme.begin(c, w, h); this.regions = [];
      UITheme.text(c, 'PAUSE', 640, 222, 92, UITheme.ivory, 'center', -.04);
      UITheme.small(c, this.maskName?.() || '', 640, 290, 18, UITheme.ivory, 'center');
      this.items.forEach((item, i) => this.option(c, i, item.label, 640, 364 + i * 65, 36, 420, 'center'));
      this.footer(c, input); c.restore();
    }
  }
  root.PauseMenu = PauseMenu;
})(typeof window !== 'undefined' ? window : globalThis);
