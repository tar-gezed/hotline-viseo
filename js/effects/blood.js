/**
 * ============================================================================
 * HOTLINE MIAMI: VISEO ARCADE EDITION - GORE & BLOOD SYSTEM
 * js/effects/blood.js
 * ============================================================================
 * Features:
 *  - Persistent offscreen Blood Canvas (baked floor decals, 0 frame drop)
 *  - High-velocity arterial blood spray cones with physics & wall-splatting
 *  - Dynamic undulating expanding blood pools beneath corpses & wounded
 *  - Dismemberment & Gibs: Severed heads, limbs, meat chunks, skull fragments
 *  - Weapon-specific gore presets: Shotgun blast, katana slice, execution, etc.
 *  - Blood footsteps when walking through blood pools with alternating shoe treads
 * ============================================================================
 */

(function (global) {
  'use strict';

  // Palette of authentic Hotline Miami blood shades
  const BLOOD_COLORS = {
    arterial: ['#b80000', '#c90404', '#db0808', '#990000'],
    dark: ['#6b0000', '#540000', '#420000', '#300000'],
    clot: ['#280000', '#3b0505', '#1f0000'],
    bright: ['#e60000', '#ff1a1a', '#cc0029'],
    brain: ['#a83b48', '#bf4352', '#d96876', '#872532'],
    bone: ['#e3dbce', '#cfc5b4', '#baa892']
  };

  /**
   * Helper: Random float between min and max
   */
  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  /**
   * Helper: Pick random element from array
   */
  function randChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Represents a flying blood droplet particle that lands and bakes onto the floor canvas
   */
  class BloodParticle {
    constructor(x, y, vx, vy, options = {}) {
      this.x = x;
      this.y = y;
      this.prevX = x;
      this.prevY = y;
      this.vx = vx;
      this.vy = vy;
      this.radius = options.radius || rand(1.5, 3.5);
      this.color = options.color || randChoice(BLOOD_COLORS.arterial);
      this.friction = options.friction || rand(0.91, 0.96);
      this.life = options.life || rand(0.12, 0.35); // in seconds
      this.age = 0;
      this.isAlive = true;
      this.isWallStick = options.isWallStick || false;
      this.splatterScale = options.splatterScale || rand(0.8, 1.6);
      this.streak = options.streak !== undefined ? options.streak : true;
    }

    update(dt, wallCheckCallback) {
      if (!this.isAlive) return;

      this.prevX = this.x;
      this.prevY = this.y;

      this.x += this.vx * dt * 60;
      this.y += this.vy * dt * 60;

      this.vx *= Math.pow(this.friction, dt * 60);
      this.vy *= Math.pow(this.friction, dt * 60);

      // Check wall collision if provided
      if (wallCheckCallback && wallCheckCallback(this.x, this.y, this.prevX, this.prevY)) {
        this.isWallStick = true;
        this.isAlive = false;
        return;
      }

      this.age += dt;
      const speed = Math.hypot(this.vx, this.vy);
      if (this.age >= this.life || speed < 0.25) {
        this.isAlive = false;
      }
    }

    /**
     * Draw while in the air (streak line or droplet)
     */
    drawAir(ctx) {
      if (!this.isAlive) return;
      ctx.save();
      ctx.strokeStyle = this.color;
      ctx.fillStyle = this.color;
      ctx.lineWidth = this.radius * 1.2;
      ctx.lineCap = 'round';

      if (this.streak) {
        ctx.beginPath();
        ctx.moveTo(this.prevX, this.prevY);
        ctx.lineTo(this.x, this.y);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    /**
     * Bake onto the persistent blood canvas upon landing
     */
    bake(ctx) {
      ctx.save();
      ctx.fillStyle = this.color;
      ctx.strokeStyle = this.color;

      const speed = Math.hypot(this.vx, this.vy);
      const angle = Math.atan2(this.vy, this.vx);

      if (speed > 0.8) {
        // Elongated splatter droplet with tail
        ctx.translate(this.x, this.y);
        ctx.rotate(angle);

        const length = Math.min(this.radius * (speed * 1.8) * this.splatterScale, 18);
        const width = this.radius * this.splatterScale;

        ctx.beginPath();
        ctx.ellipse(0, 0, Math.max(length, width), width * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Little satellite droplets
        if (Math.random() < 0.4) {
          const satDist = length * rand(1.1, 1.8);
          const satRadius = width * rand(0.3, 0.6);
          ctx.beginPath();
          ctx.arc(satDist, rand(-2, 2), satRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Round impact spot
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * this.splatterScale, 0, Math.PI * 2);
        ctx.fill();

        // 1-2 small jagged micro-splatters around it
        const numMicro = Math.floor(rand(1, 4));
        for (let i = 0; i < numMicro; i++) {
          const microAngle = rand(0, Math.PI * 2);
          const microDist = this.radius * rand(1.2, 2.5);
          const microRad = rand(0.6, 1.2);
          ctx.beginPath();
          ctx.arc(
            this.x + Math.cos(microAngle) * microDist,
            this.y + Math.sin(microAngle) * microDist,
            microRad,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }

      ctx.restore();
    }
  }

  /**
   * Represents an organic, expanding blood pool beneath corpses or wounded bodies
   */
  class BloodPool {
    constructor(x, y, maxRadius = 30, options = {}) {
      this.x = x;
      this.y = y;
      this.currentRadius = options.initialRadius || rand(2, 4);
      this.maxRadius = maxRadius * rand(0.85, 1.25);
      this.growthSpeed = options.growthSpeed || rand(3.5, 7.0); // px per second
      this.color = options.color || randChoice(BLOOD_COLORS.dark);
      this.isFinished = false;
      this.lastBakeRadius = 0;
      this.pulsing = options.pulsing || false;
      this.pulseTimer = 0;
      this.pulseCount = options.pulseCount || 3;
      this.pulsesDone = 0;
      this.flowAngle = options.flowAngle !== undefined ? options.flowAngle : rand(0, Math.PI * 2);
      this.eccentricity = options.eccentricity || rand(1.0, 1.45); // stretched in body flow direction

      // Generate organic polygon offsets
      this.points = [];
      const numPoints = Math.floor(rand(10, 16));
      for (let i = 0; i < numPoints; i++) {
        const ang = (i / numPoints) * Math.PI * 2;
        const radVar = rand(0.7, 1.3);
        this.points.push({ angle: ang, factor: radVar });
      }
    }

    update(dt, bloodSystem) {
      if (this.isFinished) return;

      // Expansion
      if (this.currentRadius < this.maxRadius) {
        this.currentRadius += this.growthSpeed * dt;
        if (this.currentRadius >= this.maxRadius) {
          this.currentRadius = this.maxRadius;
          this.isFinished = true;
        }
      }

      // Rhythmic arterial spurts (for decapitations/severed arteries)
      if (this.pulsing && this.pulsesDone < this.pulseCount) {
        this.pulseTimer += dt;
        if (this.pulseTimer >= 0.75) {
          this.pulseTimer = 0;
          this.pulsesDone++;
          // Spurt small arc of blood
          const spurtAngle = this.flowAngle + rand(-0.3, 0.3);
          bloodSystem.createSpray(this.x, this.y, spurtAngle, 0.4, 8, 2.5, 5.5, {
            colorScheme: BLOOD_COLORS.bright
          });
        }
      }

      // Bake to canvas incrementally every ~2.5px of growth to keep rendering cheap
      if (this.currentRadius - this.lastBakeRadius >= 2.5 || this.isFinished) {
        this.bakeStep(bloodSystem.ctx);
        this.lastBakeRadius = this.currentRadius;
      }
    }

    bakeStep(ctx) {
      ctx.save();
      ctx.fillStyle = this.color;
      ctx.beginPath();

      const r = this.currentRadius;
      const cosF = Math.cos(this.flowAngle);
      const sinF = Math.sin(this.flowAngle);

      for (let i = 0; i < this.points.length; i++) {
        const p = this.points[i];
        const dist = r * p.factor;
        // Apply stretch in flow direction
        const px = dist * Math.cos(p.angle);
        const py = dist * Math.sin(p.angle) * this.eccentricity;

        // Rotate along flowAngle
        const rx = this.x + (px * cosF - py * sinF);
        const ry = this.y + (px * sinF + py * cosF);

        if (i === 0) {
          ctx.moveTo(rx, ry);
        } else {
          // Smooth curve
          const prevP = this.points[i - 1];
          const prevDist = r * prevP.factor;
          const prevPx = prevDist * Math.cos(prevP.angle);
          const prevPy = prevDist * Math.sin(prevP.angle) * this.eccentricity;
          const prevRx = this.x + (prevPx * cosF - prevPy * sinF);
          const prevRy = this.y + (prevPx * sinF + prevPy * sinF);

          const midX = (prevRx + rx) / 2;
          const midY = (prevRy + ry) / 2;
          ctx.quadraticCurveTo(prevRx, prevRy, midX, midY);
        }
      }
      ctx.closePath();
      ctx.fill();

      // Occasional small dark core for pooled depth
      if (r > 12) {
        ctx.fillStyle = '#260000';
        ctx.beginPath();
        ctx.arc(this.x, this.y, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  /**
   * Represents flying and rolling gibs, limbs, decapitated heads, and meat chunks
   */
  class Gib {
    constructor(x, y, vx, vy, type = 'meat', options = {}) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.z = options.z || rand(6, 18); // height above ground
      this.vz = options.vz || rand(1.5, 4.5);
      this.gravity = options.gravity || 9.8;
      this.rotation = options.rotation || rand(0, Math.PI * 2);
      this.vRot = options.vRot || rand(-15, 15);
      this.type = type; // 'head', 'arm', 'leg', 'meat', 'skull', 'eye', 'torso_upper', 'torso_lower'
      this.size = options.size || (type === 'head' ? 8 : type === 'meat' ? rand(3, 6) : rand(7, 12));
      this.friction = options.friction || 0.94;
      this.bounces = 0;
      this.maxBounces = options.maxBounces || (type === 'head' ? 4 : 2);
      this.isSettled = false;
      this.dripTimer = 0;
      this.color = options.color || (type === 'skull' || type === 'bone' ? randChoice(BLOOD_COLORS.bone) : randChoice(BLOOD_COLORS.dark));
      this.enemyType = options.enemyType || 'mafia'; // 'mafia', 'cop', 'boss', 'dog'
    }

    update(dt, bloodSystem) {
      if (this.isSettled) return;

      this.x += this.vx * dt * 60;
      this.y += this.vy * dt * 60;
      this.rotation += this.vRot * dt * 60;

      this.vx *= Math.pow(this.friction, dt * 60);
      this.vy *= Math.pow(this.friction, dt * 60);
      this.vRot *= Math.pow(0.95, dt * 60);

      // Z height gravity
      this.z += this.vz * dt * 60;
      this.vz -= (this.gravity * 0.15) * dt * 60;

      // Leave blood drip trail while flying
      this.dripTimer += dt;
      if (this.dripTimer > 0.04 && Math.hypot(this.vx, this.vy) > 0.5) {
        this.dripTimer = 0;
        bloodSystem.addBloodDrop(this.x, this.y, rand(1.2, 2.4), randChoice(BLOOD_COLORS.arterial));
      }

      // Bounce on floor
      if (this.z <= 0) {
        this.z = 0;
        this.bounces++;

        // Landing blood smear
        bloodSystem.addBloodDrop(this.x, this.y, this.size * rand(0.7, 1.2), randChoice(BLOOD_COLORS.arterial));

        if (this.bounces >= this.maxBounces || Math.hypot(this.vx, this.vy) < 0.4) {
          this.isSettled = true;
          this.vz = 0;
          this.vx = 0;
          this.vy = 0;
          // When head or severed torso settles, start an expanding blood pool
          if (this.type === 'head' || this.type === 'torso_upper' || this.type === 'torso_lower') {
            bloodSystem.createBloodPool(this.x, this.y, rand(16, 28), {
              pulsing: this.type === 'head',
              pulseCount: 2
            });
          }
        } else {
          this.vz = -this.vz * 0.45;
          this.vx *= 0.65;
          this.vy *= 0.65;
        }
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y - this.z); // Render with simulated height offset
      ctx.rotate(this.rotation);

      // Shadow when airborne
      if (this.z > 1) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(0, this.z, this.size * 0.9, this.size * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      switch (this.type) {
        case 'head':
          // Severed head with face/hair/neck stump
          ctx.fillStyle = this.enemyType === 'mafia' ? '#ffffff' : '#fcd0a1';
          ctx.beginPath();
          ctx.arc(0, 0, this.size, 0, Math.PI * 2);
          ctx.fill();
          // Hair/band
          ctx.fillStyle = '#111111';
          ctx.beginPath();
          ctx.arc(0, -2, this.size * 0.9, Math.PI, Math.PI * 2);
          ctx.fill();
          // Neck gore stump
          ctx.fillStyle = '#8a0303';
          ctx.beginPath();
          ctx.ellipse(0, this.size * 0.8, this.size * 0.6, 2.5, 0, 0, Math.PI * 2);
          ctx.fill();
          // Dead X eyes
          ctx.strokeStyle = '#111';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(-3, -1); ctx.lineTo(-1, 1);
          ctx.moveTo(-1, -1); ctx.lineTo(-3, 1);
          ctx.moveTo(1, -1); ctx.lineTo(3, 1);
          ctx.moveTo(3, -1); ctx.lineTo(1, 1);
          ctx.stroke();
          break;

        case 'arm':
          // Severed arm with sleeve and bloody elbow/shoulder joint
          ctx.fillStyle = this.enemyType === 'mafia' ? '#ffffff' : '#4a6984';
          ctx.fillRect(-this.size * 0.4, -this.size * 0.8, this.size * 0.8, this.size * 1.4);
          // Hand
          ctx.fillStyle = '#fcd0a1';
          ctx.beginPath();
          ctx.arc(0, this.size * 0.7, this.size * 0.35, 0, Math.PI * 2);
          ctx.fill();
          // Severed joint
          ctx.fillStyle = '#780000';
          ctx.beginPath();
          ctx.arc(0, -this.size * 0.8, this.size * 0.45, 0, Math.PI * 2);
          ctx.fill();
          break;

        case 'leg':
          // Severed leg with shoe and bloody knee joint
          ctx.fillStyle = '#1b1b1b'; // Black trousers
          ctx.fillRect(-this.size * 0.4, -this.size * 0.9, this.size * 0.8, this.size * 1.5);
          // Shoe
          ctx.fillStyle = '#eeeeee';
          ctx.fillRect(-this.size * 0.45, this.size * 0.6, this.size * 0.9, this.size * 0.5);
          // Bone/blood stump
          ctx.fillStyle = '#8a0303';
          ctx.fillRect(-this.size * 0.35, -this.size * 0.95, this.size * 0.7, 3);
          ctx.fillStyle = '#e3dbce';
          ctx.fillRect(-1.5, -this.size * 1.1, 3, 3); // protruding bone
          break;

        case 'torso_upper':
        case 'torso_lower':
          // Katana bisected half
          ctx.fillStyle = this.enemyType === 'mafia' ? '#ffffff' : '#333333';
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(-this.size, -this.size * 0.6, this.size * 2, this.size * 1.2, 4);
          } else {
            ctx.rect(-this.size, -this.size * 0.6, this.size * 2, this.size * 1.2);
          }
          ctx.fill();
          // Viscera cut line
          ctx.fillStyle = '#7a0000';
          ctx.beginPath();
          ctx.ellipse(0, this.type === 'torso_upper' ? this.size * 0.6 : -this.size * 0.6, this.size * 0.9, 3.5, 0, 0, Math.PI * 2);
          ctx.fill();
          break;

        case 'skull':
          // Skull / bone fragment
          ctx.fillStyle = this.color;
          ctx.beginPath();
          ctx.moveTo(-this.size, 0);
          ctx.lineTo(0, -this.size);
          ctx.lineTo(this.size * 0.8, this.size * 0.5);
          ctx.lineTo(-this.size * 0.3, this.size * 0.8);
          ctx.closePath();
          ctx.fill();
          break;

        case 'meat':
        default:
          // Organic meat chunk
          ctx.fillStyle = this.color;
          ctx.beginPath();
          ctx.moveTo(-this.size, 0);
          ctx.quadraticCurveTo(0, -this.size * 1.2, this.size, -this.size * 0.4);
          ctx.quadraticCurveTo(this.size * 1.1, this.size * 0.8, 0, this.size);
          ctx.quadraticCurveTo(-this.size * 0.9, this.size * 0.6, -this.size, 0);
          ctx.fill();
          break;
      }

      ctx.restore();
    }
  }

  /**
   * Main BloodSystem Manager
   */
  class BloodSystem {
    constructor(worldWidth = 3200, worldHeight = 2400) {
      this.worldWidth = worldWidth;
      this.worldHeight = worldHeight;

      // Offscreen Blood Canvas (Decals permanently baked)
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.worldWidth;
      this.canvas.height = this.worldHeight;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });

      // Active dynamic entities
      this.particles = [];
      this.pools = [];
      this.gibs = [];

      // Footstep tracking for characters
      this.activeFootsteps = new Map(); // entityId -> { stepsLeft, lastPos, side }

      // Performance caps
      this.maxActiveParticles = 400;
      this.maxActiveGibs = 60;

      // Clear offscreen canvas
      this.clear();
    }

    /**
     * Clear all persistent blood decals and active blood entities
     */
    clear() {
      this.ctx.clearRect(0, 0, this.worldWidth, this.worldHeight);
      this.particles = [];
      this.pools = [];
      this.gibs = [];
      this.activeFootsteps.clear();
    }

    /**
     * Resize persistent canvas if world bounds change
     */
    resize(width, height) {
      if (this.worldWidth === width && this.worldHeight === height) return;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = this.worldWidth;
      tempCanvas.height = this.worldHeight;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(this.canvas, 0, 0);

      this.worldWidth = width;
      this.worldHeight = height;
      this.canvas.width = width;
      this.canvas.height = height;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });
      this.ctx.drawImage(tempCanvas, 0, 0);
    }

    /**
     * Add single static blood drop directly onto persistent canvas
     */
    addBloodDrop(x, y, radius = 3, color = null) {
      this.ctx.save();
      this.ctx.fillStyle = color || randChoice(BLOOD_COLORS.arterial);
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    /**
     * Create high-velocity spray cone of blood particles
     */
    createSpray(x, y, angle, spread = 0.5, count = 20, speedMin = 3.0, speedMax = 9.0, options = {}) {
      const numDrops = Math.min(count, this.maxActiveParticles - this.particles.length);
      for (let i = 0; i < numDrops; i++) {
        const dropAngle = angle + rand(-spread, spread);
        const speed = rand(speedMin, speedMax);
        const vx = Math.cos(dropAngle) * speed;
        const vy = Math.sin(dropAngle) * speed;

        const p = new BloodParticle(x, y, vx, vy, {
          radius: options.radius || rand(1.2, 3.2),
          color: (options.colorScheme ? randChoice(options.colorScheme) : null) || randChoice(BLOOD_COLORS.arterial),
          friction: options.friction || rand(0.90, 0.96),
          life: options.life || rand(0.15, 0.4),
          splatterScale: options.splatterScale || rand(0.8, 1.8),
          streak: options.streak !== undefined ? options.streak : true
        });

        this.particles.push(p);
      }
    }

    /**
     * Create an expanding organic blood pool under a body
     */
    createBloodPool(x, y, maxRadius = 32, options = {}) {
      const pool = new BloodPool(x, y, maxRadius, options);
      this.pools.push(pool);
      return pool;
    }

    /**
     * Spawn a physical gib (severed limb, head, meat chunk)
     */
    spawnGib(x, y, vx, vy, type = 'meat', options = {}) {
      if (this.gibs.length >= this.maxActiveGibs) {
        // Force settle the oldest gib
        const oldest = this.gibs.shift();
        oldest.isSettled = true;
      }
      const gib = new Gib(x, y, vx, vy, type, options);
      this.gibs.push(gib);
      return gib;
    }

    /**
     * Register a character stepping in blood, generating bloody shoe footprints
     */
    triggerBloodySteps(entityId, stepCount = 10) {
      this.activeFootsteps.set(entityId, {
        stepsLeft: stepCount,
        maxSteps: stepCount,
        lastX: null,
        lastY: null,
        side: 1 // 1 for right, -1 for left
      });
    }

    /**
     * Update character footprint stepping
     */
    updateCharacterFootprint(entityId, x, y, angle) {
      const tracker = this.activeFootsteps.get(entityId);
      if (!tracker || tracker.stepsLeft <= 0) return;

      if (tracker.lastX === null) {
        tracker.lastX = x;
        tracker.lastY = y;
        return;
      }

      const dist = Math.hypot(x - tracker.lastX, y - tracker.lastY);
      const stepDistanceThreshold = 18; // Distance in pixels between steps

      if (dist >= stepDistanceThreshold) {
        tracker.lastX = x;
        tracker.lastY = y;
        tracker.stepsLeft--;
        tracker.side *= -1; // alternate feet

        // Compute foot lateral offset perpendicular to movement angle
        const footOffset = 5.5 * tracker.side;
        const perpAngle = angle + Math.PI / 2;
        const footX = x + Math.cos(perpAngle) * footOffset;
        const footY = y + Math.sin(perpAngle) * footOffset;

        const alpha = Math.max(0.08, (tracker.stepsLeft / tracker.maxSteps) * 0.75);

        this.stampFootprint(footX, footY, angle, alpha);

        if (tracker.stepsLeft <= 0) {
          this.activeFootsteps.delete(entityId);
        }
      }
    }

    /**
     * Stamp authentic shoe sole tread mark onto persistent blood canvas
     */
    stampFootprint(x, y, angle, alpha = 0.5) {
      this.ctx.save();
      this.ctx.translate(x, y);
      this.ctx.rotate(angle);
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = '#6b0000';

      // Shoe sole outline (Hotline Miami rectangular tread)
      // Sole front
      this.ctx.fillRect(-2.5, -6, 5, 7);
      // Heel
      this.ctx.fillRect(-2, 3, 4, 4);

      // Tread notches
      this.ctx.fillStyle = '#3a0000';
      this.ctx.fillRect(-2.5, -4, 5, 1);
      this.ctx.fillRect(-2.5, -1, 5, 1);
      this.ctx.fillRect(-2, 5, 4, 1);

      this.ctx.restore();
    }

    // =========================================================================
    // WEAPON GORE PRESETS
    // =========================================================================

    /**
     * Shotgun Blast: Massive cone of gore, 5-8 meat chunks, bone splinters, backward spray
     */
    shotgunBlast(x, y, hitAngle, options = {}) {
      // 1. Massive forward cone spray
      this.createSpray(x, y, hitAngle, 0.65, 55, 4.0, 14.0, {
        splatterScale: 2.2,
        colorScheme: BLOOD_COLORS.arterial
      });

      // 2. Wide high-density close blast mist
      this.createSpray(x, y, hitAngle, 1.2, 30, 2.0, 6.0, {
        radius: 1.2,
        splatterScale: 1.0,
        colorScheme: BLOOD_COLORS.dark
      });

      // 3. Backward blowback spray
      this.createSpray(x, y, hitAngle + Math.PI, 0.8, 15, 1.5, 4.5, {
        splatterScale: 1.2
      });

      // 4. Flying Meat Chunks & Skull / Bone Fragments
      const numGibs = Math.floor(rand(5, 9));
      for (let i = 0; i < numGibs; i++) {
        const gibAngle = hitAngle + rand(-0.7, 0.7);
        const gibSpeed = rand(3.5, 9.0);
        const gibType = i % 3 === 0 ? 'skull' : 'meat';
        this.spawnGib(
          x,
          y,
          Math.cos(gibAngle) * gibSpeed,
          Math.sin(gibAngle) * gibSpeed,
          gibType,
          { enemyType: options.enemyType || 'mafia' }
        );
      }

      // 5. Immediate blood pool start
      this.createBloodPool(x, y, rand(35, 50), {
        growthSpeed: 9.0,
        flowAngle: hitAngle
      });
    }

    /**
     * Katana / Blade Slice: Clean bisecting 180-degree crimson arc, flying severed limbs
     */
    katanaSlice(x, y, hitAngle, options = {}) {
      // 1. High-velocity razor arterial arc
      this.createSpray(x, y, hitAngle + Math.PI / 2, 0.25, 25, 6.0, 12.0, {
        colorScheme: BLOOD_COLORS.bright,
        splatterScale: 1.8
      });
      this.createSpray(x, y, hitAngle - Math.PI / 2, 0.25, 25, 6.0, 12.0, {
        colorScheme: BLOOD_COLORS.bright,
        splatterScale: 1.8
      });

      // 2. Forward cut spray
      this.createSpray(x, y, hitAngle, 0.4, 20, 3.0, 8.0);

      // 3. Severed halves or limbs
      const limbType = options.bisectTorso ? 'torso_upper' : (Math.random() < 0.5 ? 'arm' : 'leg');
      const flyAngle = hitAngle + rand(-0.5, 0.5);
      const flySpeed = rand(3.0, 6.5);
      this.spawnGib(
        x,
        y,
        Math.cos(flyAngle) * flySpeed,
        Math.sin(flyAngle) * flySpeed,
        limbType,
        { enemyType: options.enemyType || 'mafia' }
      );

      if (options.bisectTorso) {
        this.spawnGib(
          x,
          y,
          -Math.cos(flyAngle) * flySpeed * 0.5,
          -Math.sin(flyAngle) * flySpeed * 0.5,
          'torso_lower',
          { enemyType: options.enemyType || 'mafia' }
        );
      }

      // 4. Expanding blood pool
      this.createBloodPool(x, y, rand(28, 42), {
        growthSpeed: 7.0,
        flowAngle: hitAngle
      });
    }

    /**
     * Decapitation: Head flies spinning with blood spiral, neck stump spurts rhythmically
     */
    decapitation(x, y, hitAngle, options = {}) {
      // 1. Flying head
      const headAngle = hitAngle + rand(-0.35, 0.35);
      const headSpeed = rand(4.0, 7.5);
      this.spawnGib(
        x,
        y,
        Math.cos(headAngle) * headSpeed,
        Math.sin(headAngle) * headSpeed,
        'head',
        { enemyType: options.enemyType || 'mafia' }
      );

      // 2. High arterial neck jet
      this.createSpray(x, y, hitAngle, 0.3, 30, 5.0, 11.0, {
        colorScheme: BLOOD_COLORS.bright,
        splatterScale: 2.0
      });

      // 3. Pulsing pool beneath body
      this.createBloodPool(x, y, rand(30, 45), {
        pulsing: true,
        pulseCount: 4,
        flowAngle: hitAngle,
        growthSpeed: 6.5
      });
    }

    /**
     * Standard Bullet Wound (Pistol / Rifle / SMG)
     */
    bulletWound(x, y, bulletAngle, options = {}) {
      // Forward exit wound spray (larger)
      this.createSpray(x, y, bulletAngle, 0.45, rand(14, 22), 3.5, 8.5, {
        splatterScale: 1.4
      });

      // Backward entry wound puff
      this.createSpray(x, y, bulletAngle + Math.PI, 0.6, 6, 1.2, 3.0, {
        radius: 1.0,
        splatterScale: 0.8
      });

      // Expanding pool
      this.createBloodPool(x, y, rand(30, 40), {
        initialRadius: 12,
        flowAngle: bulletAngle,
        growthSpeed: 18
      });
    }

    /**
     * Brutal Ground Execution (Bat smash, pipe bash, stomp)
     */
    groundExecution(x, y, options = {}) {
      // 360-degree radial splatter explosion
      for (let ang = 0; ang < Math.PI * 2; ang += Math.PI / 4) {
        this.createSpray(x, y, ang + rand(-0.2, 0.2), 0.3, 8, 3.0, 9.0, {
          splatterScale: 2.0,
          colorScheme: BLOOD_COLORS.arterial
        });
      }

      // Flying skull/teeth/brain chunks
      for (let i = 0; i < 4; i++) {
        const gibAngle = rand(0, Math.PI * 2);
        const gibSpeed = rand(2.5, 6.0);
        this.spawnGib(
          x,
          y,
          Math.cos(gibAngle) * gibSpeed,
          Math.sin(gibAngle) * gibSpeed,
          i % 2 === 0 ? 'skull' : 'meat',
          { enemyType: options.enemyType || 'mafia', color: randChoice(BLOOD_COLORS.brain) }
        );
      }

      // Massive pool
      this.createBloodPool(x, y, rand(36, 52), {
        growthSpeed: 10.0
      });
    }

    // =========================================================================
    // UPDATE & RENDER
    // =========================================================================

    /**
     * Update active blood particles, pools, and gibs
     */
    update(dt, wallCheckCallback = null) {
      // 1. Update particles and bake dead ones to persistent canvas
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.update(dt, wallCheckCallback);
        if (!p.isAlive) {
          p.bake(this.ctx);
          this.particles.splice(i, 1);
        }
      }

      // 2. Update expanding blood pools
      for (let i = this.pools.length - 1; i >= 0; i--) {
        const pool = this.pools[i];
        pool.update(dt, this);
        if (pool.isFinished) {
          this.pools.splice(i, 1);
        }
      }

      // 3. Update gibs
      for (let i = this.gibs.length - 1; i >= 0; i--) {
        const gib = this.gibs[i];
        gib.update(dt, this);
      }
    }

    /**
     * Draw persistent blood canvas onto the main camera render context
     * Call this FIRST during floor/ground rendering before entities!
     */
    drawPersistent(targetCtx, camera = null) {
      if (!camera) {
        targetCtx.drawImage(this.canvas, 0, 0);
        return;
      }

      // Camera view culling: Only draw visible world slice
      const camX = camera.x || 0;
      const camY = camera.y || 0;
      const camW = camera.width || this.worldWidth;
      const camH = camera.height || this.worldHeight;

      // If camera uses transform/matrix, simply draw full canvas
      if (camera.useTransform) {
        targetCtx.drawImage(this.canvas, 0, 0);
      } else {
        targetCtx.drawImage(
          this.canvas,
          camX, camY, camW, camH,
          0, 0, camW, camH
        );
      }
    }

    /**
     * Draw dynamic active airborne blood particles and flying gibs
     * Call this in entity / particle layer
     */
    drawDynamic(targetCtx) {
      // 1. Airborne blood streaks
      for (let i = 0; i < this.particles.length; i++) {
        this.particles[i].drawAir(targetCtx);
      }

      // 2. Flying & rolling gibs
      for (let i = 0; i < this.gibs.length; i++) {
        this.gibs[i].draw(targetCtx);
      }
    }

    /**
     * Unified render method
     */
    render(targetCtx, bounds = null) {
      this.drawPersistent(targetCtx);
      this.drawDynamic(targetCtx);
    }

    /**
     * Convenience aliases
     */
    sprayBlood(x, y, angle, count = 18) {
      return this.createSpray(x, y, angle, 0.45, count);
    }

    addBloodPool(x, y, radius = 22) {
      return this.createBloodPool(x, y, radius);
    }

    isPointInBlood(x, y) {
      for (let i = 0; i < this.pools.length; i++) {
        const pool = this.pools[i];
        if (Math.hypot(x - pool.x, y - pool.y) < pool.currentRadius) {
          return true;
        }
      }
      return false;
    }
  }

  // Export to global and ES module if supported
  global.BloodSystem = BloodSystem;
  global.BloodParticle = BloodParticle;
  global.BloodPool = BloodPool;
  global.Gib = Gib;
  global.BLOOD_COLORS = BLOOD_COLORS;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BloodSystem, BloodParticle, BloodPool, Gib, BLOOD_COLORS };
  }
})(typeof window !== 'undefined' ? window : this);
