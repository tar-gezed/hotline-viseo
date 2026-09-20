(function (root) {
  'use strict';
  class ToolsMenu extends CanvasMenu {
    constructor(onBack) {
      super(); this.onBack = onBack;
      this.items = [
        { label: 'CHOISIR / IMPORTER UNE CARTE', action: () => { location.href = 'maps.html'; } },
        { label: 'ÉDITEUR DE CARTE', action: () => { location.href = 'map_editor.html'; } },
        { label: 'RETOUR', action: onBack }
      ];
    }
    render(c, w, h, input) {
      UITheme.background(c, w, h, this.timer, true); UITheme.begin(c, w, h); this.regions = [];
      this.header(c, 'TOOLS / MAPS');
      UITheme.small(c, 'CARTE ACTIVE', 160, 250, 14, UITheme.cyan);
      UITheme.small(c, root.activeMapLabel || 'Carte originale', 160, 281, 18);
      this.items.forEach((item, i) => this.option(c, i, item.label, 160, 376 + i * 76, 34, 950));
      this.footer(c, input); c.restore(); UITheme.texture(c, w, h, this.timer);
    }
  }
  root.ToolsMenu = ToolsMenu;
})(typeof window !== 'undefined' ? window : globalThis);
