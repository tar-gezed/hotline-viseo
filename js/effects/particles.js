/**
 * ============================================================================
 * HOTLINE MIAMI: VISEO ARCADE EDITION - PARTICLE & COMBAT FX SYSTEM
 * js/effects/particles.js
 * ============================================================================
 * Features:
 *  - Ejected brass shell casings (Pistol, Shotgun red shells, Rifle, Magnum)
 *    with 2.5D bouncing physics, rotation, and metallic bounce sound triggers
 *  - High-intensity muzzle flashes & dynamic light flashes
 *  - Gunsmoke drift & bullet impact dust/sparks/wood chips
 *  - Shattered glass physics: hundreds of crystalline translucent shards
 *  - Retro Arcade floating combo & score popups ("COMBO x4", "DOOR SLAM +200")
 * ============================================================================
 */

(function (global) {
  'use strict';

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function randChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * ============================================================================
   * 1. SHELL CASINGS (Brass / Shotgun Shells)
   * ============================================================================
   */
  class ShellCasing {
    constructor(x, y, angle, type = 'pistol', options = {}) {
      this.x = x;
      this.y = y;
      this.type = type; // 'pistol', 'shotgun', 'rifle', 'magnum'

      // Eject perpendicular/slightly backwards to firing angle
      const ejectSide = options.ejectSide || (Math.random() < 0.5 ? 1 : -1);
      const ejectAngle = angle + (Math.PI / 2) * ejectSide + rand(-0.3, 0.3);
      const speed = rand(2.5, 6.0);

      this.vx = Math.cos(ejectAngle) * speed;
      this.vy = Math.sin(ejectAngle) * speed;

      // 2.5D Height & Gravity
      this.z = options.z || rand(8, 14); // height in pixels
      this.vz = rand(2.5, 5.0);
      this.gravity = 14.0;

      this.rotation = rand(0, Math.PI * 2);
      this.vRot = rand(10, 30) * (Math.random() < 0.5 ? 1 : -1);

      this.bounces = 0;
      this.maxBounces = type === 'shotgun' ? 2 : rand(2, 4);
      this.isSettled = false;
      this.friction = 0.92;
      this.life = 15.0; // Settled casings stay for 15s then fade
      this.age = 0;
      this.alpha = 1.0;

      // Sound trigger flag
      this.hasBouncedOnce = false;
    }

    update(dt, soundCallback = null) {
      if (this.isSettled) {
        this.age += dt;
        if (this.age > this.life) {
          this.alpha -= dt * 0.5;
        }
        return;
      }

      this.x += this.vx * dt * 60;
      this.y += this.vy * dt * 60;
      this.rotation += this.vRot * dt * 60;

      this.vx *= Math.pow(this.friction, dt * 60);
      this.vy *= Math.pow(this.friction, dt * 60);
      this.vRot *= Math.pow(0.94, dt * 60);

      // Z gravity
      this.z += this.vz * dt * 60;
      this.vz -= (this.gravity * 0.18) * dt * 60;

      // Floor collision
      if (this.z <= 0) {
        this.z = 0;
        this.bounces++;

        // Sound callback on first/second bounce
        if (soundCallback && (!this.hasBouncedOnce || Math.abs(this.vz) > 1.2)) {
          soundCallback(this.type, this.x, this.y);
          this.hasBouncedOnce = true;
        }

        if (this.bounces >= this.maxBounces || Math.abs(this.vz) < 0.8) {
          this.isSettled = true;
          this.vz = 0;
          this.vx = 0;
          this.vy = 0;
        } else {
          this.vz = -this.vz * 0.45;
          this.vx *= 0.7;
          this.vy *= 0.7;
        }
      }
    }

    draw(ctx) {
      if (this.alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.translate(this.x, this.y - this.z);
      ctx.rotate(this.rotation);

      // Shadow when airborne
      if (this.z > 0.5) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(-2, this.z - 1, 4, 2);
        ctx.restore();
      }

      if (this.type === 'shotgun') {
        // Red plastic shotgun shell with gold brass base
        ctx.fillStyle = '#b31212';
        ctx.fillRect(-3, -1.5, 6, 3);
        ctx.fillStyle = '#ffd700'; // brass rim
        ctx.fillRect(-3, -1.5, 2, 3);
      } else if (this.type === 'rifle') {
        // Long brass casing
        ctx.fillStyle = '#e6b800';
        ctx.fillRect(-3.5, -1.2, 7, 2.4);
        ctx.fillStyle = '#b89200';
        ctx.fillRect(-3.5, -1.2, 1.5, 2.4);
      } else {
        // 9mm Pistol / SMG brass
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(-2, -1, 4, 2);
        ctx.fillStyle = '#ccaa00';
        ctx.fillRect(-2, -1, 1, 2);
      }

      ctx.restore();
    }
  }

  /**
   * ============================================================================
   * 2. MUZZLE FLASH & DYNAMIC LIGHT
   * ============================================================================
   */
  class MuzzleFlash {
    constructor(x, y, angle, type = 'pistol') {
      this.x = x;
      this.y = y;
      this.angle = angle;
      this.type = type; // 'pistol', 'shotgun', 'rifle', 'silencer', 'magnum'
      this.life = type === 'shotgun' ? 0.07 : 0.045; // very fast flash (2-4 frames)
      this.age = 0;
      this.isAlive = true;
      this.scale = type === 'shotgun' ? rand(1.4, 2.0) : type === 'magnum' ? rand(1.3, 1.7) : rand(0.9, 1.3);

      // Dynamic light parameters
      this.lightRadius = type === 'shotgun' ? 240 : type === 'magnum' ? 210 : 160;
      this.lightColor = type === 'silencer' ? 'rgba(255, 180, 100, 0.3)' : 'rgba(255, 235, 170, 0.85)';
    }

    update(dt) {
      this.age += dt;
      if (this.age >= this.life) {
        this.isAlive = false;
      }
    }

    draw(ctx) {
      if (!this.isAlive) return;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);

      const s = this.scale;

      if (this.type === 'silencer') {
        // Tiny subtle puff flash
        ctx.fillStyle = 'rgba(255, 200, 120, 0.6)';
        ctx.beginPath();
        ctx.arc(4 * s, 0, 3 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }

      // 1. Core bright white-yellow starburst
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(16 * s, 0);
      ctx.lineTo(8 * s, -4 * s);
      ctx.lineTo(12 * s, -10 * s);
      ctx.lineTo(6 * s, -5 * s);
      ctx.lineTo(0, -8 * s);
      ctx.lineTo(3 * s, -3 * s);
      ctx.lineTo(0, 0);
      ctx.lineTo(3 * s, 3 * s);
      ctx.lineTo(0, 8 * s);
      ctx.lineTo(6 * s, 5 * s);
      ctx.lineTo(12 * s, 10 * s);
      ctx.lineTo(8 * s, 4 * s);
      ctx.lineTo(16 * s, 0);
      ctx.closePath();
      ctx.fill();

      // 2. Vibrant orange/yellow outer bloom
      ctx.fillStyle = '#ffb300';
      ctx.beginPath();
      ctx.arc(8 * s, 0, 9 * s, 0, Math.PI * 2);
      ctx.fill();

      // 3. Forward fire dart
      ctx.fillStyle = '#fff4a3';
      ctx.beginPath();
      ctx.moveTo(4 * s, -3 * s);
      ctx.lineTo(22 * s, 0);
      ctx.lineTo(4 * s, 3 * s);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }

  /**
   * ============================================================================
   * 3. GUNSMOKE & IMPACT DUST/SPARKS
   * ============================================================================
   */
  class Gunsmoke {
    constructor(x, y, vx, vy, options = {}) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.radius = options.radius || rand(3, 7);
      this.maxRadius = options.maxRadius || rand(14, 26);
      this.growthRate = rand(18, 35);
      this.alpha = options.alpha || rand(0.35, 0.65);
      this.decay = options.decay || rand(0.9, 1.6);
      this.color = options.color || randChoice(['#aaaaaa', '#888888', '#cccccc', '#667788']);
      this.isAlive = true;
    }

    update(dt) {
      this.x += this.vx * dt * 60;
      this.y += this.vy * dt * 60;
      this.vx *= Math.pow(0.93, dt * 60);
      this.vy *= Math.pow(0.93, dt * 60);

      this.radius += this.growthRate * dt;
      this.alpha -= this.decay * dt;

      if (this.alpha <= 0 || this.radius >= this.maxRadius) {
        this.isAlive = false;
      }
    }

    draw(ctx) {
      if (!this.isAlive || this.alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = Math.max(0, this.alpha);
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  class ImpactSpark {
    constructor(x, y, vx, vy, color = '#ffe853', life = 0.2) {
      this.x = x;
      this.y = y;
      this.prevX = x;
      this.prevY = y;
      this.vx = vx;
      this.vy = vy;
      this.color = color;
      this.life = life;
      this.age = 0;
      this.isAlive = true;
    }

    update(dt) {
      this.prevX = this.x;
      this.prevY = this.y;
      this.x += this.vx * dt * 60;
      this.y += this.vy * dt * 60;
      this.vx *= Math.pow(0.88, dt * 60);
      this.vy *= Math.pow(0.88, dt * 60);

      this.age += dt;
      if (this.age >= this.life) {
        this.isAlive = false;
      }
    }

    draw(ctx) {
      if (!this.isAlive) return;
      ctx.save();
      const alpha = 1.0 - (this.age / this.life);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.prevX, this.prevY);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * ============================================================================
   * 4. SHATTERED GLASS PHYSICS
   * ============================================================================
   */
  class GlassShard {
    constructor(x, y, vx, vy, options = {}) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.rotation = rand(0, Math.PI * 2);
      this.vRot = rand(-20, 20);
      this.size = options.size || rand(1.5, 3.5);
      this.friction = rand(0.83, 0.89);
      this.alpha = 1.0;
      this.life = rand(4.0, 7.0);
      this.age = 0;
      this.isSettled = false;

      // Irregular polygonal shard vertices (3-5 points)
      this.vertices = [];
      const numVerts = Math.floor(rand(3, 5));
      for (let i = 0; i < numVerts; i++) {
        const ang = (i / numVerts) * Math.PI * 2 + rand(-0.4, 0.4);
        const rad = this.size * rand(0.6, 1.4);
        this.vertices.push({
          x: Math.cos(ang) * rad,
          y: Math.sin(ang) * rad
        });
      }

      // Shard color: icy cyan / crystal white
      this.fillColor = randChoice([
        'rgba(126, 195, 202, 0.65)',
        'rgba(165, 211, 212, 0.7)',
        'rgba(102, 172, 184, 0.65)',
        'rgba(194, 222, 216, 0.7)'
      ]);
    }

    update(dt) {
      if (this.isSettled) {
        this.age += dt;
        if (this.age > this.life) {
          this.alpha -= dt * 0.5;
        }
        return;
      }

      this.x += this.vx * dt * 60;
      this.y += this.vy * dt * 60;
      this.rotation += this.vRot * dt * 60;

      this.vx *= Math.pow(this.friction, dt * 60);
      this.vy *= Math.pow(this.friction, dt * 60);
      this.vRot *= Math.pow(0.92, dt * 60);

      const speed = Math.hypot(this.vx, this.vy);
      if (speed < 0.2) {
        this.isSettled = true;
        this.vx = 0;
        this.vy = 0;
      }
    }

    draw(ctx) {
      if (this.alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);

      // Glass polygon
      ctx.fillStyle = this.fillColor;
      ctx.strokeStyle = '#8db9bd';
      ctx.lineWidth = 1.0;

      ctx.beginPath();
      for (let i = 0; i < this.vertices.length; i++) {
        const v = this.vertices[i];
        if (i === 0) ctx.moveTo(v.x, v.y);
        else ctx.lineTo(v.x, v.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Specular highlight gleam
      ctx.strokeStyle = 'rgba(216, 235, 224, 0.35)';
      ctx.beginPath();
      ctx.moveTo(this.vertices[0].x * 0.7, this.vertices[0].y * 0.7);
      ctx.lineTo(this.vertices[1].x * 0.7, this.vertices[1].y * 0.7);
      ctx.stroke();

      ctx.restore();
    }
  }

  /**
   * ============================================================================
   * 5. FLOATING RETRO ARCADE COMBO & SCORE TEXT
   * ============================================================================
   */
  class FloatingText {
    constructor(x, y, text, options = {}) {
      this.x = x;
      this.y = y;
      this.text = text;
      this.color = options.color || '#ffeb3b'; // Neon yellow / cyan / magenta
      this.strokeColor = options.strokeColor || '#000000';
      this.fontSize = options.fontSize || 18;
      this.vy = options.vy || -1.4; // float upwards
      this.vx = options.vx || rand(-0.3, 0.3);
      this.life = options.life || 1.1; // seconds
      this.age = 0;
      this.scale = 1.8; // Pop scale bounce (1.8 -> 1.0)
      this.targetScale = options.scale || 1.0;
      this.isAlive = true;
      this.isCombo = options.isCombo || false;
      this.rotation = options.rotation || rand(-0.08, 0.08);
      this.textSprite = null;
    }

    update(dt) {
      this.age += dt;
      this.x += this.vx * dt * 60;
      this.y += this.vy * dt * 60;

      // Scale bounce
      if (this.scale > this.targetScale) {
        this.scale -= dt * 6.0;
        if (this.scale < this.targetScale) this.scale = this.targetScale;
      }

      if (this.age >= this.life) {
        this.isAlive = false;
      }
    }

    draw(ctx) {
      if (!this.isAlive) return;
      ctx.save();
      const progress = this.age / this.life;
      const alpha = progress > 0.6 ? 1.0 - (progress - 0.6) / 0.4 : 1.0;

      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.scale(this.scale, this.scale);

      // Rasterize the outline/glow once. Repainting blurred, scaled text every
      // frame causes expensive canvas raster work during wave-clear popups.
      if (!this.textSprite && typeof document !== 'undefined') {
        const sprite = document.createElement('canvas');
        const spriteCtx = sprite.getContext('2d');
        if (spriteCtx) {
          spriteCtx.font = `italic 900 ${this.fontSize}px "Impact", "Arial Black", sans-serif`;
          const width = Math.ceil(spriteCtx.measureText(this.text).width + this.fontSize + 32);
          const height = Math.ceil(this.fontSize * 2 + 32);
          // Supersample for the initial 1.8x pop and camera zoom; local ownership
          // lets the bitmap be collected together with this short-lived text.
          sprite.width = width * 2;
          sprite.height = height * 2;
          spriteCtx.scale(2, 2);
          spriteCtx.translate(width / 2, height / 2);
          this._drawLabel(spriteCtx);
          this.textSprite = { canvas: sprite, width, height };
        }
      }
      if (this.textSprite) {
        const { canvas, width, height } = this.textSprite;
        ctx.drawImage(canvas, -width / 2, -height / 2, width, height);
      } else {
        this._drawLabel(ctx);
      }
      ctx.restore();
    }

    _drawLabel(ctx) {
      ctx.font = `italic 900 ${this.fontSize}px "Impact", "Arial Black", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Outer glow
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 8;

      // Thick black stroke for high readability
      ctx.strokeStyle = this.strokeColor;
      ctx.lineWidth = 4;
      ctx.strokeText(this.text, 0, 0);

      // Text fill
      ctx.fillStyle = this.color;
      ctx.fillText(this.text, 0, 0);
    }
  }

  /**
   * ============================================================================
   * 6. PARTICLE SYSTEM MANAGER
   * ============================================================================
   */
  class ParticleSystem {
    constructor() {
      this.casings = [];
      this.muzzleFlashes = [];
      this.smoke = [];
      this.sparks = [];
      this.glassShards = [];
      this.floatingTexts = [];

      // Sound trigger callback: (type, x, y) => soundManager.play(...)
      this.onSoundTrigger = null;

      // Caps
      this.maxCasings = 150;
      this.maxGlass = 250;
      this.maxSmoke = 120;
      this.maxSparks = 200;
    }

    clear() {
      this.casings = [];
      this.muzzleFlashes = [];
      this.smoke = [];
      this.sparks = [];
      this.glassShards = [];
      this.floatingTexts = [];
    }

    /**
     * Spawn Brass Shell Casing
     */
    spawnCasing(x, y, angle, weaponType = 'pistol') {
      if (this.casings.length >= this.maxCasings) {
        this.casings.shift(); // remove oldest
      }
      const casing = new ShellCasing(x, y, angle, weaponType);
      this.casings.push(casing);
      return casing;
    }

    /**
     * Spawn Gun Muzzle Flash
     */
    spawnMuzzleFlash(x, y, angle, weaponType = 'pistol') {
      const flash = new MuzzleFlash(x, y, angle, weaponType);
      this.muzzleFlashes.push(flash);

      // Gunsmoke puff
      const smokeSpeed = rand(1.0, 3.5);
      const smokeAngle = angle + rand(-0.35, 0.35);
      this.spawnSmoke(
        x + Math.cos(angle) * 12,
        y + Math.sin(angle) * 12,
        Math.cos(smokeAngle) * smokeSpeed,
        Math.sin(smokeAngle) * smokeSpeed,
        { radius: weaponType === 'shotgun' ? 8 : 4 }
      );

      return flash;
    }

    /**
     * Spawn Gunsmoke Particle
     */
    spawnSmoke(x, y, vx, vy, options = {}) {
      if (this.smoke.length >= this.maxSmoke) {
        this.smoke.shift();
      }
      const s = new Gunsmoke(x, y, vx, vy, options);
      this.smoke.push(s);
      return s;
    }

    /**
     * Spawn Bullet Impact FX on Wall, Wood, Metal, or Concrete
     */
    spawnImpact(x, y, hitAngle, material = 'wall') {
      const reflectAngle = hitAngle + Math.PI; // bounce back outward

      if (material === 'metal') {
        // Bright ricochet sparks
        for (let i = 0; i < 10; i++) {
          const ang = reflectAngle + rand(-0.8, 0.8);
          const spd = rand(3.0, 8.0);
          this.sparks.push(new ImpactSpark(x, y, Math.cos(ang) * spd, Math.sin(ang) * spd, '#ffea42', rand(0.1, 0.25)));
        }
      } else if (material === 'wood') {
        // Wood splinter chips
        for (let i = 0; i < 7; i++) {
          const ang = reflectAngle + rand(-0.7, 0.7);
          const spd = rand(2.0, 5.0);
          this.sparks.push(new ImpactSpark(x, y, Math.cos(ang) * spd, Math.sin(ang) * spd, '#c48f49', rand(0.15, 0.3)));
        }
      } else {
        // Wall / Concrete dust & sparks
        for (let i = 0; i < 6; i++) {
          const ang = reflectAngle + rand(-0.6, 0.6);
          const spd = rand(2.5, 6.0);
          this.sparks.push(new ImpactSpark(x, y, Math.cos(ang) * spd, Math.sin(ang) * spd, '#ffffff', rand(0.12, 0.22)));
        }
        this.spawnSmoke(x, y, Math.cos(reflectAngle) * 1.5, Math.sin(reflectAngle) * 1.5, {
          radius: 5,
          color: '#b0a89d'
        });
      }
    }

    /**
     * Shatter a Glass Window into hundreds of flying crystal shards
     */
    spawnGlassShatter(x, y, impactAngle = 0, count = 45) {
      const numShards = Math.max(0, Math.min(16, Math.ceil(count * 0.4), this.maxGlass - this.glassShards.length));

      for (let i = 0; i < numShards; i++) {
        // Outward directional burst + radial spread
        const shardAngle = impactAngle + rand(-1.2, 1.2);
        const speed = rand(1.5, 4.5);
        const vx = Math.cos(shardAngle) * speed;
        const vy = Math.sin(shardAngle) * speed;

        this.glassShards.push(new GlassShard(x + rand(-8, 8), y + rand(-8, 8), vx, vy, {
          size: rand(1.5, 3.5)
        }));
      }

      // Glass impact sound callback
      if (this.onSoundTrigger) {
        this.onSoundTrigger('glass_shatter', x, y);
      }
    }

    /**
     * Spawn Retro Floating Combo / Score Text
     * ("COMBO x4", "DOOR SLAM +200", "EXECUTION +1000", "BLAST +400", "EXPOSURE +300")
     */
    spawnFloatingText(x, y, text, options = {}) {
      const ft = new FloatingText(x, y, text, options);
      this.floatingTexts.push(ft);
      return ft;
    }

    addFloatingText(x, y, text, color = '#ffe600', fontSize = 20, options = {}) {
      return this.spawnFloatingText(x, y, text, {
        color: color,
        fontSize: fontSize,
        ...options
      });
    }

    /**
     * Shortcut helpers for classic Hotline Miami floating notifications
     */
    spawnComboText(x, y, comboCount) {
      const colors = ['#ffe600', '#ff0055', '#00ffff', '#39ff14', '#ff00ff'];
      const color = colors[(comboCount - 1) % colors.length];
      return this.spawnFloatingText(x, y - 20, `COMBO x${comboCount}!`, {
        color: color,
        fontSize: 22,
        scale: 1.4,
        isCombo: true
      });
    }

    spawnKillScore(x, y, actionName, score) {
      const colorMap = {
        'DOOR SLAM': '#00ffff',
        'EXECUTION': '#ff0055',
        'BLAST': '#ff9900',
        'EXPOSURE': '#39ff14',
        'HEADSHOT': '#ff0033',
        'DOUBLE KILL': '#ffe600'
      };
      const color = colorMap[actionName] || '#00ffff';
      return this.spawnFloatingText(x, y - 10, `${actionName} +${score}`, {
        color: color,
        fontSize: 16
      });
    }

    /**
     * Update all particles
     */
    update(dt) {
      // 1. Casings
      for (let i = this.casings.length - 1; i >= 0; i--) {
        const c = this.casings[i];
        c.update(dt, this.onSoundTrigger);
        if (c.alpha <= 0) this.casings.splice(i, 1);
      }

      // 2. Muzzle flashes
      for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
        const f = this.muzzleFlashes[i];
        f.update(dt);
        if (!f.isAlive) this.muzzleFlashes.splice(i, 1);
      }

      // 3. Smoke
      for (let i = this.smoke.length - 1; i >= 0; i--) {
        const s = this.smoke[i];
        s.update(dt);
        if (!s.isAlive) this.smoke.splice(i, 1);
      }

      // 4. Sparks
      for (let i = this.sparks.length - 1; i >= 0; i--) {
        const sp = this.sparks[i];
        sp.update(dt);
        if (!sp.isAlive) this.sparks.splice(i, 1);
      }

      // 5. Glass Shards
      for (let i = this.glassShards.length - 1; i >= 0; i--) {
        const g = this.glassShards[i];
        g.update(dt);
        if (g.alpha <= 0) this.glassShards.splice(i, 1);
      }

      // 6. Floating Texts
      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        const t = this.floatingTexts[i];
        t.update(dt);
        if (!t.isAlive) this.floatingTexts.splice(i, 1);
      }
    }

    /**
     * Draw floor layer particles (casings, glass shards on floor)
     */
    drawFloor(ctx) {
      for (let i = 0; i < this.casings.length; i++) {
        this.casings[i].draw(ctx);
      }
      for (let i = 0; i < this.glassShards.length; i++) {
        this.glassShards[i].draw(ctx);
      }
    }

    /**
     * Draw air layer particles (smoke, sparks, muzzle flashes)
     */
    drawAir(ctx) {
      for (let i = 0; i < this.smoke.length; i++) {
        this.smoke[i].draw(ctx);
      }
      for (let i = 0; i < this.sparks.length; i++) {
        this.sparks[i].draw(ctx);
      }
      for (let i = 0; i < this.muzzleFlashes.length; i++) {
        this.muzzleFlashes[i].draw(ctx);
      }
    }

    /**
     * Draw UI / Floating Text layer (drawn over entities)
     */
    drawUI(ctx) {
      for (let i = 0; i < this.floatingTexts.length; i++) {
        this.floatingTexts[i].draw(ctx);
      }
    }

    /**
     * Get active dynamic lights for lighting / postprocess passes
     */
    getActiveLights() {
      const lights = [];
      for (let i = 0; i < this.muzzleFlashes.length; i++) {
        const mf = this.muzzleFlashes[i];
        if (mf.isAlive) {
          lights.push({
            x: mf.x,
            y: mf.y,
            radius: mf.lightRadius,
            color: mf.lightColor
          });
        }
      }
      return lights;
    }

    /**
     * Unified render method
     */
    render(ctx) {
      this.drawFloor(ctx);
      this.drawAir(ctx);
      this.drawUI(ctx);
    }

    /**
     * Convenience aliases
     */
    ejectShell(x, y, angle, type) {
      return this.spawnCasing(x, y, angle, type);
    }

    muzzleFlash(x, y, angle, color) {
      return this.spawnMuzzleFlash(x, y, angle, color);
    }

    spark(x, y, dirX, dirY, count, color) {
      const angle = Math.atan2(dirY || 0, dirX || 0);
      const mat = color === '#c19a6b' || color === '#c48f49' ? 'wood' : (color === '#ffe600' ? 'metal' : 'wall');
      return this.spawnImpact(x, y, angle, mat);
    }

    shatterGlass(x, y, count, vx, vy) {
      const impactAngle = (vx || vy) ? Math.atan2(vy || 0, vx || 0) : 0;
      return this.spawnGlassShatter(x, y, impactAngle, count || 40);
    }

    floatingComboText(x, y, pts, label, color) {
      const txt = label ? `${label} +${pts}` : `+${pts}`;
      return this.addFloatingText(x, y, txt, color || '#ffe600', 20);
    }
  }

  // Export
  global.ParticleSystem = ParticleSystem;
  global.ShellCasing = ShellCasing;
  global.MuzzleFlash = MuzzleFlash;
  global.GlassShard = GlassShard;
  global.FloatingText = FloatingText;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ParticleSystem, ShellCasing, MuzzleFlash, GlassShard, FloatingText };
  }
})(typeof window !== 'undefined' ? window : this);
