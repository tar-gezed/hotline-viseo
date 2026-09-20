(function (root) {
  'use strict';
  class AudioSettings {
    constructor(music, sfx, storage) {
      this.music = music; this.sfx = sfx; this.storage = storage;
      this.key = 'hotline-viseo-audio-v1';
      this.values = { music: .7, sfx: .85, muted: false };
      try {
        const saved = JSON.parse(storage?.getItem(this.key) || 'null');
        for (const key of ['music', 'sfx']) if (Number.isFinite(saved?.[key])) this.values[key] = Math.max(0, Math.min(1, saved[key]));
        if (typeof saved?.muted === 'boolean') this.values.muted = saved.muted;
      } catch (_) { /* Storage is optional (private browsing, malformed values). */ }
      this.apply();
    }
    apply() {
      this.music.setVolume(this.values.music); this.sfx.setVolume(this.values.sfx);
      this.music.setMute(this.values.muted);
    }
    set(key, value) {
      if (key === 'muted') this.values.muted = Boolean(value);
      else if (['music', 'sfx'].includes(key) && Number.isFinite(value)) this.values[key] = Math.max(0, Math.min(1, Math.round(value * 100) / 100));
      this.apply();
      try { this.storage?.setItem(this.key, JSON.stringify(this.values)); } catch (_) { /* Keep session settings. */ }
    }
  }
  class AudioMenu extends CanvasMenu {
    constructor(settings, onBack) {
      super(); this.settings = settings; this.onBack = onBack;
      this.items = [{ label: 'MUSIQUE' }, { label: 'EFFETS SONORES' },
        { label: 'MUSIQUE MUETTE', action: () => settings.set('muted', !settings.values.muted) },
        { label: 'RETOUR', action: onBack }];
    }
    adjust(direction) {
      if (this.selectedIndex < 2) {
        const key = this.selectedIndex ? 'sfx' : 'music';
        this.settings.set(key, this.settings.values[key] + direction * .05);
      } else if (this.selectedIndex === 2) this.activate();
    }
    click(hit, point) {
      if (hit.index < 2) {
        if (point.x >= 572) {
          const key = hit.index ? 'sfx' : 'music';
          const value = point.x < 620 ? this.settings.values[key] - .05 : point.x > 1050 ? this.settings.values[key] + .05 : (point.x - 620) / 430;
          this.settings.set(key, value);
          if (point.x >= 620 && point.x <= 1050) this.dragIndex = hit.index;
        }
      } else this.activate();
    }
    update(dt, input, w, h) {
      super.update(dt, input, w, h);
      if (!input.mouse?.left || input.isGamepadMode || !this.visible) { this.dragIndex = null; return; }
      if (this.dragIndex != null) {
        const point = UITheme.point(input.mouse.x, input.mouse.y, w, h);
        this.settings.set(this.dragIndex ? 'sfx' : 'music', (point.x - 620) / 430);
      }
    }
    render(c, w, h, input) {
      UITheme.background(c, w, h, this.timer, true); UITheme.begin(c, w, h); this.regions = [];
      this.header(c, 'AUDIO');
      for (let i = 0; i < 2; i++) {
        const y = 290 + i * 118, value = this.settings.values[i ? 'sfx' : 'music'];
        this.option(c, i, this.items[i].label, 160, y, 36, 950);
        c.fillStyle = '#4a334a'; c.fillRect(620, y - 5, 430, 10);
        c.fillStyle = i === this.selectedIndex ? UITheme.pink : UITheme.ivory;
        c.fillRect(620, y - 5, 430 * value, 10); c.fillRect(616 + 430 * value, y - 14, 8, 28);
        UITheme.text(c, '−', 580, y, 30, UITheme.cyan); UITheme.text(c, '+', 1076, y, 30, UITheme.cyan);
        UITheme.small(c, Math.round(value * 100) + '%', 1150, y, 20, UITheme.ivory, 'right');
      }
      this.option(c, 2, 'MUSIQUE MUETTE : ' + (this.settings.values.muted ? 'OUI' : 'NON'), 160, 529, 28, 850);
      UITheme.small(c, input?.isGamepadMode ? '← →  RÉGLER' : '← →  RÉGLER   /   CLIQUER SUR LA PISTE', 620, 594, 13);
      this.option(c, 3, 'RETOUR', 80, 674, 23, 130); this.footer(c, input);
      c.restore(); UITheme.texture(c, w, h, this.timer);
    }
  }
  root.AudioSettings = AudioSettings; root.AudioMenu = AudioMenu;
})(typeof window !== 'undefined' ? window : globalThis);
