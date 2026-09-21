/* Shared Canvas menu language. A uniform 1280 x 720 safe area, never stretched. */
(function (root) {
  'use strict';
  const UITheme = {
    ink: '#100e20', ivory: '#f2e5c9', pink: '#ed4e93', cyan: '#80d9d2', muted: '#b89bb5',
    frame(w, h) {
      const scale = Math.min(w / 1280, h / 720);
      return { scale, x: (w - 1280 * scale) / 2, y: (h - 720 * scale) / 2 };
    },
    begin(c, w, h) {
      const f = this.frame(w, h);
      c.save(); c.translate(f.x, f.y); c.scale(f.scale, f.scale);
    },
    point(x, y, w, h) {
      const f = this.frame(w, h);
      return { x: (x - f.x) / f.scale, y: (y - f.y) / f.scale };
    },
    text(c, text, x, y, size = 30, color = this.ivory, align = 'left', angle = 0, glow = 0) {
      c.save(); c.translate(x, y); c.rotate(angle);
      c.font = `italic 900 ${size}px GameHeading, Impact, 'Arial Black', sans-serif`;
      c.textAlign = align; c.textBaseline = 'middle';
      if (glow > 0) c.shadowBlur = 0;
      c.fillStyle = this.ink; c.fillText(text, 4, 4);
      if (glow > 0) {
        c.shadowColor = color; c.shadowBlur = glow;
        c.shadowOffsetX = 0; c.shadowOffsetY = 0;
      }
      c.fillStyle = color; c.fillText(text, 0, 0); c.restore();
    },
    small(c, text, x, y, size = 15, color = this.muted, align = 'left') {
      c.font = `bold ${size}px 'Courier New', monospace`;
      c.textAlign = align; c.textBaseline = 'middle'; c.fillStyle = color;
      c.fillText(text, x, y);
    },
    wrap(c, text, x, y, width, size = 17, color = this.ivory) {
      c.font = `bold ${size}px 'Courier New', monospace`;
      let line = '', row = 0;
      for (const word of text.split(' ')) {
        if (line && c.measureText(line + ' ' + word).width > width) {
          this.small(c, line, x, y + row++ * (size + 9), size, color); line = '';
        }
        line += (line ? ' ' : '') + word;
      }
      this.small(c, line, x, y + row * (size + 9), size, color);
      return (row + 1) * (size + 9);
    },
    background(c, w, h, time, dim = false) {
      c.save();
      const s = h / 720;
      c.scale(s, s); const width = w / s;
      const sky = c.createLinearGradient(0, 0, 0, 720);
      sky.addColorStop(0, '#241930'); sky.addColorStop(.55, '#803957'); sky.addColorStop(1, '#da6586');
      c.fillStyle = sky; c.fillRect(0, 0, width, 720);
      // Distant sunset, an original office skyline sliding past the window.
      c.fillStyle = '#c67489'; c.beginPath(); c.arc(width * .73, 265, 155, 0, Math.PI * 2); c.fill();
      for (let layer = 0; layer < 3; layer++) {
        const step = 110 + layer * 34, offset = (time * (3 + layer * 5)) % (step * 12);
        c.fillStyle = ['#60324f', '#35243e', '#19182b'][layer];
        for (let i = -2; i < width / step + 14; i++) {
          const n = ((i % 12) + 12) % 12;
          const bh = 70 + ((n * 73 + layer * 47) % 185);
          const x = i * step - offset, y = 510 + layer * 76 - bh;
          c.fillRect(x, y, step - 12, 720 - y);
          c.fillRect(x + 15, y - 12, step - 42, 16);
          if (n % 3 === 0) c.fillRect(x + 26, y - 49, 3, 40);
          if (layer === 1) {
            c.fillStyle = '#97536b';
            for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
              if ((row + col + n) % 3) c.fillRect(x + 19 + col * 25, y + 23 + row * 28, 8, 3);
            }
            c.fillStyle = '#35243e';
          }
        }
      }
      c.fillStyle = '#100f20'; c.fillRect(0, 663, width, 57);
      c.fillStyle = '#74415a'; c.fillRect(0, 672, width, 2);
      for (let x = -200; x < width + 200; x += 220) {
        c.fillRect(x - (time * 38) % 220, 686, 130, 2);
      }
      if (dim) { c.fillStyle = 'rgba(16,14,32,.78)'; c.fillRect(0, 0, width, 720); }
      c.restore();
    },
    texture(c, w, h, time) {
      c.save(); c.fillStyle = 'rgba(10,5,24,.065)';
      for (let y = 0; y < h; y += 4) c.fillRect(0, y, w, 1);
      c.fillStyle = 'rgba(242,229,201,.025)'; c.fillRect(0, (time * 19) % h, w, 2);
      c.restore();
    }
  };

  class CanvasMenu {
    constructor() {
      this.visible = false; this.timer = 0; this.selectedIndex = 0;
      this.items = []; this.regions = []; this.onBack = null; this.selectionAge = 1;
      this.stickTimer = 0; this.lastPointer = null;
    }
    show() { this.visible = true; this.timer = 0; this.stickTimer = .22; this.lastPointer = null; }
    hide() { this.visible = false; }
    select(index) {
      if (index === this.selectedIndex || index < 0 || index >= this.items.length) return;
      this.selectedIndex = index; this.selectionAge = 0;
      if (root.soundFX && root.soundFX.isInitialized) root.soundFX.playUiHover?.();
    }
    activate() { this.items[this.selectedIndex]?.action?.(); }
    update(dt, input, w, h) {
      if (!this.visible) return;
      this.timer += dt; this.selectionAge += dt; this.stickTimer -= dt;
      const gp = input.gamepad?.connected ? input.gamepad : null;
      const pressed = (...keys) => input.isJustPressed(...keys);
      if (input.isMenuCancelJustPressed()) { this.onBack?.(); return; }
      let direction = 0;
      if (pressed('ArrowUp', 'KeyW', 'KeyZ') || gp?.justPressed.dpadUp) direction = -1;
      if (pressed('ArrowDown', 'KeyS') || gp?.justPressed.dpadDown) direction = 1;
      if (gp && Math.abs(gp.leftStick.y) > .55 && this.stickTimer <= 0) {
        direction = Math.sign(gp.leftStick.y); this.stickTimer = .19;
      }
      if (direction) this.select((this.selectedIndex + direction + this.items.length) % this.items.length);
      let horizontal = 0;
      if (pressed('ArrowLeft', 'KeyA', 'KeyQ') || gp?.justPressed.dpadLeft) horizontal = -1;
      if (pressed('ArrowRight', 'KeyD') || gp?.justPressed.dpadRight) horizontal = 1;
      if (gp && Math.abs(gp.leftStick.x) > .55 && this.stickTimer <= 0) {
        horizontal = Math.sign(gp.leftStick.x); this.stickTimer = .19;
      }
      if (horizontal) this.adjust(horizontal);
      const mouse = input.mouse;
      if (mouse && !input.isGamepadMode) {
        const p = UITheme.point(mouse.x, mouse.y, w, h);
        const moved = this.lastPointer && (p.x !== this.lastPointer.x || p.y !== this.lastPointer.y);
        const hit = this.regions.find(r => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
        if (hit && (moved || mouse.leftJustPressed)) {
          this.select(hit.index);
          if (mouse.leftJustPressed) { this.click(hit, p); this.lastPointer = p; return; }
        }
        this.lastPointer = p;
      }
      if (input.isMenuConfirmJustPressed()) this.activate();
    }
    adjust(direction) { this.select((this.selectedIndex + direction + this.items.length) % this.items.length); }
    click() { this.activate(); }
    option(c, index, label, x, y, size = 32, width = 560, align = 'left') {
      const selected = index === this.selectedIndex;
      const offset = selected ? 9 + 5 * Math.exp(-this.selectionAge * 18) : 0;
      UITheme.text(c, label, x + offset, y, size, selected ? UITheme.pink : UITheme.ivory, align, selected ? -.035 : 0);
      if (selected) UITheme.text(c, '›', x - (align === 'center' ? width / 2 : 27), y, size, UITheme.cyan);
      this.regions.push({ index, x: align === 'center' ? x - width / 2 : x - 30, y: y - size * .7, w: width + 40, h: size * 1.4 });
    }
    header(c, title) { UITheme.small(c, 'HOTLINE VISEO', 80, 55, 14, UITheme.pink); UITheme.text(c, title, 80, 112, 54); }
    footer(c, input) { UITheme.small(c, input?.isGamepadMode ? '↑ ↓  CHOISIR     A / ×  VALIDER     B / ○  RETOUR' : '↑ ↓  CHOISIR     ENTRÉE  VALIDER     ÉCHAP  RETOUR', 1200, 674, 13, UITheme.muted, 'right'); }
  }
  root.UITheme = UITheme; root.CanvasMenu = CanvasMenu;
})(typeof window !== 'undefined' ? window : globalThis);
