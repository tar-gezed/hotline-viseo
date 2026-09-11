/* Seven VISEO characters, shared portraits and data-driven gameplay descriptions. */

class MaskMenu {
  constructor() {
    this.visible = false;
    this.selectedIndex = 0;
    this.maskList = Object.values(CONFIG.MASKS);
    this.hoverIndex = -1;

    // Animation & Visual State
    this.timer = 0;
    this.selectedMaskId = 'vincent';
    this.onMaskConfirmed = null; // Callback when player confirms selection

    // Scanline & CRT animation
    this.glowPulse = 0;

    // Carousel lerp position
    this.scrollPos = 0;
    this.targetScrollPos = 0;
  }

  show(initialMaskId = 'vincent') {
    this.visible = true;
    const foundIdx = this.maskList.findIndex(m => m.id === initialMaskId);
    this.selectedIndex = foundIdx >= 0 ? foundIdx : 0;
    this.selectedMaskId = this.maskList[this.selectedIndex].id;
    this.targetScrollPos = this.selectedIndex;
    this.scrollPos = this.selectedIndex;

    if (typeof window !== 'undefined' && window.synthMusic) {
      window.synthMusic.play('menu');
    }
  }

  hide() {
    this.visible = false;
  }

  update(dt, input = null) {
    if (!this.visible) return;
    this.timer += dt;
    this.glowPulse = (Math.sin(this.timer * 4.0) + 1) * 0.5;

    // Handle Gamepad & Keyboard Navigation
    const inMgr = input || (typeof window !== 'undefined' ? (window.input || window.Input) : null);
    if (inMgr) {
      if (typeof inMgr.isMenuPrevJustPressed === 'function' && inMgr.isMenuPrevJustPressed()) {
        this.prevMask();
      } else if (typeof inMgr.isMenuNextJustPressed === 'function' && inMgr.isMenuNextJustPressed()) {
        this.nextMask();
      } else if (typeof inMgr.isMenuConfirmJustPressed === 'function' && inMgr.isMenuConfirmJustPressed()) {
        this.confirmSelection();
      }
    }

    // Smooth carousel lerping
    this.targetScrollPos = this.selectedIndex;
    this.scrollPos += (this.targetScrollPos - this.scrollPos) * 0.18;
  }

  handleKeyDown(e) {
    if (!this.visible) return false;

    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      this.prevMask();
      return true;
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      this.nextMask();
      return true;
    } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'e' || e.key === 'E') {
      this.confirmSelection();
      return true;
    } else if (e.key >= '1' && e.key <= '7') {
      const idx = parseInt(e.key, 10) - 1;
      if (idx < this.maskList.length) {
        this.selectIndex(idx);
        return true;
      }
    }
    return false;
  }

  _layout(width, height) {
    const cardW = Math.min(124, (width - 64) / 7 - 12);
    return { cardW, cardH: 150, gap: 12, x: (width - (cardW + 12) * 7 + 12) / 2, y: height * 0.39 };
  }

  handleMouseMove(mouseX, mouseY, width, height) {
    if (!this.visible) return;
    const uiScale = Math.max(1, Math.min(width / 1920, height / 1080));
    mouseX /= uiScale; mouseY /= uiScale; width /= uiScale; height /= uiScale;
    const l = this._layout(width, height);
    this.hoverIndex = -1;
    for (let i = 0; i < this.maskList.length; i++) {
      const x = l.x + i * (l.cardW + l.gap);
      if (mouseX >= x && mouseX <= x + l.cardW && mouseY >= l.y && mouseY <= l.y + l.cardH) this.hoverIndex = i;
    }
  }

  handleClick(mouseX, mouseY, width, height) {
    if (!this.visible) return false;
    this.handleMouseMove(mouseX, mouseY, width, height);
    const uiScale = Math.max(1, Math.min(width / 1920, height / 1080));
    mouseX /= uiScale; mouseY /= uiScale; width /= uiScale; height /= uiScale;
    if (this.hoverIndex >= 0) {
      if (this.hoverIndex === this.selectedIndex) this.confirmSelection();
      else this.selectIndex(this.hoverIndex);
      return true;
    }
    if (mouseX >= width / 2 - 160 && mouseX <= width / 2 + 160 && mouseY >= height * 0.84 && mouseY <= height * 0.84 + 50) {
      this.confirmSelection(); return true;
    }
    return false;
  }


  nextMask() {
    this.selectedIndex = (this.selectedIndex + 1) % this.maskList.length;
    this.selectedMaskId = this.maskList[this.selectedIndex].id;
    if (typeof window !== 'undefined' && window.soundFx) window.soundFx.playUiHover();
  }

  prevMask() {
    this.selectedIndex = (this.selectedIndex - 1 + this.maskList.length) % this.maskList.length;
    this.selectedMaskId = this.maskList[this.selectedIndex].id;
    if (typeof window !== 'undefined' && window.soundFx) window.soundFx.playUiHover();
  }

  selectIndex(idx) {
    if (idx >= 0 && idx < this.maskList.length) {
      this.selectedIndex = idx;
      this.selectedMaskId = this.maskList[this.selectedIndex].id;
      if (typeof window !== 'undefined' && window.soundFx) window.soundFx.playUiHover();
    }
  }

  confirmSelection() {
    const selected = this.maskList[this.selectedIndex];
    this.selectedMaskId = selected.id;

    if (typeof window !== 'undefined' && window.soundFx) {
      window.soundFx.playUiSelect();
    }

    if (this.onMaskConfirmed) {
      this.onMaskConfirmed(selected.id, selected);
    }
  }

  getSelectedMask() {
    return this.maskList[this.selectedIndex];
  }

  /**
   * Render 80s Synthwave Mask Selection Screen
   */
  draw(ctx, width, height) {
    if (!this.visible) return;
    ctx.save();
    const uiScale = Math.max(1, Math.min(width / 1920, height / 1080));
    ctx.scale(uiScale, uiScale); width /= uiScale; height /= uiScale;
    ctx.fillStyle = '#1c142b'; ctx.fillRect(0, 0, width, height);
    // Printed title screen: flat ink, off-register shadow, no wireframe horizon.
    ctx.fillStyle = '#39203d';
    for (let y = 0; y < height; y += 24) ctx.fillRect(0, y, width, 2);
    ctx.save(); ctx.translate(width * .5, height * .19); ctx.rotate(-.035);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `italic 900 ${Math.min(100, width * .095)}px Impact, Arial Black, sans-serif`;
    ctx.fillStyle = '#b43678'; ctx.fillText('HOTLINE VISEO', 7, 8);
    ctx.fillStyle = '#f5edbf'; ctx.fillText('HOTLINE VISEO', 0, 0);
    ctx.restore();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 13px monospace'; ctx.fillStyle = '#ef8bab';
    ctx.fillText('AFTER HOURS  /  ENDLESS ARCADE  /  FLOOR 02', width / 2, height * .285);
    const l = this._layout(width, height);
    this._portraitScale=(l.cardW-14)/54;
    for (let i = 0; i < this.maskList.length; i++) {
      const m = this.maskList[i], x = l.x + i * (l.cardW + l.gap), selected = i === this.selectedIndex;
      ctx.fillStyle = selected ? '#e9dfb5' : (i === this.hoverIndex ? '#513347' : '#302538');
      ctx.fillRect(x, l.y, l.cardW, l.cardH);
      if (selected) { ctx.fillStyle = '#d64b83'; ctx.fillRect(x, l.y + l.cardH, l.cardW, 5); }
      this._drawPixelMask(ctx, m.id, x + l.cardW / 2, l.y + 63, 4);
      ctx.font = 'italic 900 19px Impact, Arial Black, sans-serif'; ctx.fillStyle = selected ? '#342132' : '#f3dfbe';
      ctx.fillText(m.name, x + l.cardW / 2, l.y + 118);
      ctx.font = 'bold 10px monospace'; ctx.fillStyle = selected ? '#75525a' : '#b28a9e';
      ctx.fillText(`0${i + 1} / ${m.animal.toUpperCase()}`, x + l.cardW / 2, l.y + 137);
    }
    const m = this.maskList[this.selectedIndex];
    ctx.font = 'italic 900 24px Impact, Arial Black, sans-serif'; ctx.fillStyle = '#f3dfbe';
    ctx.fillText(m.quote.toUpperCase(), width / 2, height * .65);
    ctx.font = '13px monospace'; ctx.fillStyle = '#bfa7ba';
    ctx.fillText(m.role+' — '+m.description, width / 2, height * .70, width - 50);
    ctx.fillStyle='#f3dfbe';ctx.fillText(m.perkDesc, width / 2, height * .745, width - 50);
    ctx.fillStyle=m.color;ctx.fillText('DÉPART : '+m.startDesc+'  /  arme réinitialisée à chaque partie',width/2,height*.785,width-50);
    ctx.fillStyle = '#dc4a80'; ctx.fillRect(width / 2 - 160, height * .84, 320, 50);
    ctx.fillStyle = '#fff0c8'; ctx.font = 'italic 900 25px Impact, Arial Black, sans-serif';
    ctx.fillText('ENTER  /  START SHIFT', width / 2, height * .84 + 25);
    ctx.font = '11px monospace'; ctx.fillStyle = '#b99dad';
    ctx.fillText('A / D  SELECT      /      ONE HIT. KEEP MOVING.      /      R  RESTART', width / 2, height - 24);
    ctx.restore();
  }

  _drawPixelMask(ctx, id, cx, cy, unit) {
    if(typeof CharacterArt!=='undefined'&&CONFIG.MASKS[id]){CharacterArt.portrait(ctx,CONFIG.MASKS[id],cx,cy-9,Math.min(1.7,this._portraitScale||1.7));return;}
    // Original tiny ink portraits. Every mask uses the same deliberate pixel grid.
    const rooster = ['      rr        ','    rrrrr       ','     rrr        ','    wwwwww      ','   wwwwwwww     ','  wwwkwwkwww    ','  wwwwwyywww    ','   wwwyyyyww    ','   wwwryyww     ','    wwrrww      ','     wrrw       ','      rr        '];
    const mammal = ['  bb      bb    ','  bbb    bbb    ','  bwwbbbbwwb    ','   bbbbbbbb     ','  bbbkbbkbbb    ','  bbbbwwbbbb    ','   bbwkkwbb     ','   bbwwwwbb     ','    bbbbb b     ','     bbbb       '];
    const colors = {richard:'#eee2b6',tony:'#d98535',brandon:'#4b3e64',aubrey:'#d48b9c',dennis:'#8b969e',rasmus:'#c7a267',ted:'#b28658'};
    const palette = {b:colors[id],w:id==='vincent'?'#eee2b6':'#e5cfab',r:'#b92e50',y:'#d5a444',k:'#251d2e'};
    const rows = id === 'vincent' ? rooster : mammal;
    ctx.save(); ctx.translate(Math.round(cx - 32), Math.round(cy - 24));
    rows.forEach((row,y)=>[...row].forEach((c,x)=>{ if(c!==' '){ctx.fillStyle='#201b2a';ctx.fillRect(x*unit-1,y*unit-1,unit+2,unit+2);} }));
    rows.forEach((row,y)=>[...row].forEach((c,x)=>{if(c!==' '){ctx.fillStyle=palette[c];ctx.fillRect(x*unit,y*unit,unit,unit);} }));
    if (id === 'tony') { ctx.fillStyle='#392b2c'; for(let y=3;y<8;y+=2){ctx.fillRect(12,y*unit,8,unit);ctx.fillRect(40,y*unit,8,unit);} }
    ctx.restore();
  }


  /**
   * Procedurally draw iconic Hotline Miami animal mask vector graphics
   */
  _drawMaskIcon(ctx, maskId, cx, cy, radius, primaryColor) {
    ctx.save();
    ctx.translate(cx, cy);

    ctx.fillStyle = primaryColor;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;

    switch (maskId) {
      case 'vincent': // Rooster
        // Head
        ctx.beginPath();
        ctx.arc(0, 4, radius * 0.7, 0, Math.PI * 2);
        ctx.fill();
        // Red Rooster Comb
        ctx.fillStyle = '#ff0033';
        ctx.beginPath();
        ctx.arc(-10, -radius * 0.7, 8, 0, Math.PI * 2);
        ctx.arc(0, -radius * 0.85, 10, 0, Math.PI * 2);
        ctx.arc(10, -radius * 0.7, 8, 0, Math.PI * 2);
        ctx.fill();
        // Beak
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.lineTo(14, 8);
        ctx.lineTo(0, 14);
        ctx.closePath();
        ctx.fill();
        // Eyes
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(-6, 2, 3, 0, Math.PI * 2);
        ctx.arc(6, 2, 3, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'tony': // Tiger
        // Tiger Face
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.75, 0, Math.PI * 2);
        ctx.fill();
        // Ears
        ctx.beginPath();
        ctx.arc(-radius * 0.65, -radius * 0.65, 10, 0, Math.PI * 2);
        ctx.arc(radius * 0.65, -radius * 0.65, 10, 0, Math.PI * 2);
        ctx.fill();
        // Black Stripes
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-18, -4); ctx.lineTo(-6, -2);
        ctx.moveTo(18, -4); ctx.lineTo(6, -2);
        ctx.moveTo(-16, 6); ctx.lineTo(-4, 6);
        ctx.moveTo(16, 6); ctx.lineTo(4, 6);
        ctx.moveTo(0, -18); ctx.lineTo(0, -6);
        ctx.stroke();
        // Snout
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 10, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(0, 8, 3.5, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'brandon': // Panther
        // Panther Sleek Head
        ctx.fillStyle = '#1e1138';
        ctx.beginPath();
        ctx.arc(0, 2, radius * 0.75, 0, Math.PI * 2);
        ctx.fill();
        // Panther Ears
        ctx.beginPath();
        ctx.moveTo(-radius * 0.7, 0); ctx.lineTo(-radius * 0.8, -radius * 0.8); ctx.lineTo(-10, -radius * 0.6);
        ctx.moveTo(radius * 0.7, 0); ctx.lineTo(radius * 0.8, -radius * 0.8); ctx.lineTo(10, -radius * 0.6);
        ctx.fill();
        // Piercing Neon Eyes
        ctx.fillStyle = '#cc00ff';
        ctx.shadowColor = '#cc00ff';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.ellipse(-10, 0, 5, 2.5, -0.3, 0, Math.PI * 2);
        ctx.ellipse(10, 0, 5, 2.5, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        break;

      case 'aubrey': // Pig
        // Pig Head
        ctx.fillStyle = '#ff88bb';
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.75, 0, Math.PI * 2);
        ctx.fill();
        // Ears
        ctx.beginPath();
        ctx.arc(-radius * 0.6, -radius * 0.6, 9, 0, Math.PI * 2);
        ctx.arc(radius * 0.6, -radius * 0.6, 9, 0, Math.PI * 2);
        ctx.fill();
        // Snout
        ctx.fillStyle = '#ff4488';
        ctx.beginPath();
        ctx.ellipse(0, 6, 14, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        // Nostrils
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(-5, 6, 3, 0, Math.PI * 2);
        ctx.arc(5, 6, 3, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'dennis': // Wolf
        // Wolf Head & Snout
        ctx.fillStyle = '#4a5568';
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
        ctx.fill();
        // Pointy Ears
        ctx.beginPath();
        ctx.moveTo(-16, -10); ctx.lineTo(-24, -radius * 0.9); ctx.lineTo(-6, -18);
        ctx.moveTo(16, -10); ctx.lineTo(24, -radius * 0.9); ctx.lineTo(6, -18);
        ctx.fill();
        // Snout
        ctx.fillStyle = '#2d3748';
        ctx.beginPath();
        ctx.moveTo(-8, 4); ctx.lineTo(0, 20); ctx.lineTo(8, 4);
        ctx.closePath();
        ctx.fill();
        // Cyan Eyes
        ctx.fillStyle = '#00f3ff';
        ctx.beginPath();
        ctx.arc(-8, -2, 3, 0, Math.PI * 2);
        ctx.arc(8, -2, 3, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'rasmus': // Owl
        // Owl Face
        ctx.fillStyle = '#cca300';
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.75, 0, Math.PI * 2);
        ctx.fill();
        // Massive Glowing Eyes
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(-11, 0, 10, 0, Math.PI * 2);
        ctx.arc(11, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffe600';
        ctx.beginPath();
        ctx.arc(-11, 0, 6, 0, Math.PI * 2);
        ctx.arc(11, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        // Small Beak
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0, 4); ctx.lineTo(-4, 12); ctx.lineTo(4, 12); ctx.closePath();
        ctx.fill();
        break;

      case 'ted': // Dog
        // Dog Face
        ctx.fillStyle = '#b45309';
        ctx.beginPath();
        ctx.arc(0, 2, radius * 0.75, 0, Math.PI * 2);
        ctx.fill();
        // Floppy Ears
        ctx.fillStyle = '#78350f';
        ctx.beginPath();
        ctx.ellipse(-radius * 0.7, 4, 8, 16, 0.4, 0, Math.PI * 2);
        ctx.ellipse(radius * 0.7, 4, 8, 16, -0.4, 0, Math.PI * 2);
        ctx.fill();
        // Snout
        ctx.fillStyle = '#d97706';
        ctx.beginPath();
        ctx.ellipse(0, 8, 12, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(0, 5, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
    }

    ctx.restore();
  }

  /**
   * Synthwave Perspective Grid
   */
  _drawNeonGrid(ctx, width, height) {
    const horizon = height * 0.65;
    ctx.save();
    ctx.strokeStyle = 'rgba(181, 55, 242, 0.25)';
    ctx.lineWidth = 1.5;

    // Horizontal grid lines
    for (let y = horizon; y <= height; y += 18 + (y - horizon) * 0.15) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Perspective converging vertical lines
    const fovCount = 18;
    for (let i = -fovCount; i <= fovCount; i++) {
      const startX = width * 0.5 + i * 25;
      const endX = width * 0.5 + i * 110;
      ctx.beginPath();
      ctx.moveTo(startX, horizon);
      ctx.lineTo(endX, height);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * CRT Scanlines & Vignette
   */
  _drawScanlines(ctx, width, height) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    for (let y = 0; y < height; y += 4) {
      ctx.fillRect(0, y, width, 1.5);
    }
    ctx.restore();
  }
}

// Global export / module compatibility
const maskMenu = new MaskMenu();
MaskMenu.prototype.render = MaskMenu.prototype.draw;

if (typeof window !== 'undefined') {
  window.maskMenu = maskMenu;
  window.MaskMenu = MaskMenu;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { maskMenu, MaskMenu };
}
