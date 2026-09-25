/**
 * doors.js - Interactive Swinging Doors for Hotline Miami: VISEO Arcade Edition
 * Supports normal pushing, high-speed door kicks, enemy stun/slam, glass door shattering, and blood decals.
 */

(function (root, factory) {
  const PhysicsObj = (typeof window !== 'undefined' && window.Physics) ? window.Physics : (root.Physics || null);
  const result = factory(PhysicsObj);
  if (typeof define === 'function' && define.amd) {
    define(['../engine/physics'], () => result);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = result;
  }
  if (typeof window !== 'undefined') {
    window.Doors = result;
    window.Door = result.Door;
    window.GlassPartition = result.GlassPartition;
  }
  root.Doors = result;
  root.Door = result.Door;
  root.GlassPartition = result.GlassPartition;
}(typeof self !== 'undefined' ? self : this, function (Physics) {
  'use strict';
  if (!Physics && typeof module === 'object' && module.exports && typeof require === 'function') {
    Physics = require('../engine/physics.js');
  }

  class Door {
    constructor(config) {
      this.id = config.id || 'door_' + Math.random().toString(36).substr(2, 9);
      this.name = config.name || 'Door';
      this.x = config.x; // hinge X
      this.y = config.y; // hinge Y
      this.length = config.length || 54;
      this.thickness = config.thickness || 6;
      this.baseAngle = config.baseAngle || 0; // angle when fully closed (radians)
      this.angle = this.baseAngle;
      this.prevAngle = this.baseAngle;
      
      // Swing bounds (relative to baseAngle)
      this.swingRange = config.swingRange || Math.PI * 0.55; // default ~100 degrees
      this.swingDirection = config.swingDirection || 0; // 0 = both ways, 1 = positive only, -1 = negative only
      
      if (this.swingDirection === 1) {
        this.minAngle = this.baseAngle;
        this.maxAngle = this.baseAngle + this.swingRange;
      } else if (this.swingDirection === -1) {
        this.minAngle = this.baseAngle - this.swingRange;
        this.maxAngle = this.baseAngle;
      } else {
        this.minAngle = this.baseAngle - this.swingRange;
        this.maxAngle = this.baseAngle + this.swingRange;
      }

      this.type = config.type || 'wood'; // 'wood', 'glass', 'security'
      this.angularVelocity = 0;
      this.angularFriction = 0.90;
      this.springStrength = config.springStrength !== undefined ? config.springStrength : 2.5; // gentle self-centering
      this.restitution = 0.35; // bounce off door stops
      
      this.health = this.type === 'glass' ? 25 : 100;
      this.maxHealth = this.health;
      this.shattered = false;
      this.isLocked = config.isLocked || false;
      this.keyCardRequired = config.keyCardRequired || null;

      // Lethal / Stun sweep properties
      this.isDangerous = false;
      this.lastKickedBy = null;
      this.lastKickedByPlayerId = undefined;
      this.renderAngle = undefined;
      this.kickTime = 0;
      this.kickCooldown = 0;
      this.kickSign = 0;
      this.hitEntities = new WeakSet();
      this.pushContributors = new WeakSet();
      this.contactPush = false;
      this.dangerThreshold = 6.0; // rad/s velocity required to stun/damage

      // Visuals
      this.color = config.color || (this.type === 'glass' ? 'rgba(120, 210, 255, 0.45)' : '#7a5230');
      this.trimColor = config.trimColor || '#222222';
      this.bloodStains = []; // array of blood decals stuck to the door surface
    }

    getTipPosition() {
      return {
        x: this.x + Math.cos(this.angle) * this.length,
        y: this.y + Math.sin(this.angle) * this.length
      };
    }

    getNormal() {
      return {
        x: -Math.sin(this.angle),
        y: Math.cos(this.angle)
      };
    }

    isOpen() {
      return Math.abs(this.angle - this.baseAngle) > 0.3;
    }

    isWideOpen() {
      return Math.abs(this.angle - this.baseAngle) > 0.9;
    }

    update(dt) {
      if (this.shattered) return;

      this.prevAngle = this.angle;
      this.kickTime = Math.max(0, this.kickTime - dt);
      this.kickCooldown = Math.max(0, this.kickCooldown - dt);
      if (this.isLocked) { this.angularVelocity = 0; return; }

      // Gentle spring return to closed position if not moving fast
      if (Math.abs(this.angularVelocity) < 1.5) {
        const diff = this.baseAngle - this.angle;
        this.angularVelocity += diff * this.springStrength * dt;
      }

      // Integrate angular velocity
      this.angle += this.angularVelocity * dt;
      this.angularVelocity *= Math.pow(this.angularFriction, dt * 60);

      // Check angular bounds
      if (this.angle < this.minAngle) {
        this.angle = this.minAngle;
        if (this.angularVelocity < 0) {
          this.angularVelocity = 0;
          this.kickTime = 0;
        }
      } else if (this.angle > this.maxAngle) {
        this.angle = this.maxAngle;
        if (this.angularVelocity > 0) {
          this.angularVelocity = 0;
          this.kickTime = 0;
        }
      }

      // Check if dangerous swing
      this.isDangerous = this.kickTime > 0 && this.angularVelocity * this.kickSign > (this.contactPush ? 0.25 : this.dangerThreshold);

      // Lock angular velocity to 0 if very tiny near closed
      if (Math.abs(this.angle - this.baseAngle) < 0.01 && Math.abs(this.angularVelocity) < 0.05) {
        this.angle = this.baseAngle;
        this.angularVelocity = 0;
      }
    }

    reset() {
      this.angle = this.baseAngle;
      this.prevAngle = this.baseAngle;
      this.angularVelocity = 0;
      this.shattered = false;
      this.health = this.maxHealth;
      this.bloodStains = [];
      this.isDangerous = false;
      this.lastKickedBy = null;
      this.lastKickedByPlayerId = undefined;
      this.renderAngle = undefined;
      this.kickTime = this.kickCooldown = this.kickSign = 0;
      this.hitEntities = new WeakSet();
      this.pushContributors = new WeakSet();
      this.contactPush = false;
    }

    /**
     * Kick the door violently open
     */
    kick(instigator, kickDirX, kickDirY, force = 22.0) {
      if (this.shattered || this.kickCooldown > 0) return { success: false };

      if (this.isLocked) {
        // Locked door sound / shake
        this.angularVelocity = 0;
        return { success: false, reason: 'locked' };
      }

      this.lastKickedBy = instigator;
      this.lastKickedByPlayerId = instigator?.playerId;
      const normal = this.getNormal();
      const dot = kickDirX * normal.x + kickDirY * normal.y;
      const swingSign = dot >= 0 ? 1 : -1;

      if ((swingSign > 0 && this.angle >= this.maxAngle - 0.01) ||
          (swingSign < 0 && this.angle <= this.minAngle + 0.01)) return { success: false };
      this.kickTime = 0.22;
      this.kickCooldown = 0.5;
      this.kickSign = swingSign;
      this.hitEntities = new WeakSet();
      this.pushContributors = new WeakSet();
      this.contactPush = false;
      this.prevAngle = this.angle;
      this.angularVelocity = swingSign * force;
      this.isDangerous = true;

      // Glass door kick may shatter directly
      if (this.type === 'glass' && force > 20) {
        this.damage(40, this.x, this.y, kickDirX, kickDirY);
      }

      return { success: true, swingSign };
    }

    /**
     * Entity interaction: push door or get slammed/stunned by fast swinging door
     */
    handleEntityInteraction(entity, cx, cy, radius) {
      if (this.shattered || !this.isDangerous || !this.lastKickedBy ||
          entity === this.lastKickedBy || this.pushContributors.has(entity) || this.lastKickedBy.isAlive === false || entity.isAlive === false ||
          entity.state === 'KNOCKED_DOWN' || this.hitEntities.has(entity)) return;
      // Only a body in front of the moving leaf can receive the impact.
      // A spring return or another frame of its own push cannot stun an actor.
      const incomingSide=((cx-this.x)*-Math.sin(this.prevAngle)+(cy-this.y)*Math.cos(this.prevAngle))*this.kickSign;
      if(incomingSide < 2) return;
      const sweep = this.angle - this.prevAngle;
      if (sweep * this.kickSign <= 0.0001) return;
      // Sample the swept leaf, not only its final position: fast kicks must
      // neither tunnel through a target nor hit someone behind the swing.
      const steps = Math.max(1, Math.ceil(Math.abs(sweep) * this.length / 5));
      for (let i = 0; i <= steps; i++) {
        const angle = this.prevAngle + sweep * i / steps;
        const nx = -Math.sin(angle) * this.kickSign;
        const ny = Math.cos(angle) * this.kickSign;
        if ((cx-this.x)*nx + (cy-this.y)*ny < -1) continue;
        const col = Physics.circleVsSegment(cx,cy,radius+this.thickness/2,
          this.x,this.y,this.x+Math.cos(angle)*this.length,this.y+Math.sin(angle)*this.length);
        if (!col.collided) continue;
        this.hitEntities.add(entity);
        if (entity.onDoorSlam) entity.onDoorSlam(this, 1, nx, ny);
        if (entity.isAlive === false) this.addBloodDecal(col.contactPoint.x,col.contactPoint.y);
        return;
      }
    }

    // Contact opens an unlocked door without arming an attack. Called before
    // collision removes the actor's velocity, with a frame-rate independent response.
    pushEntity(entity, dt = 1/60) {
      if (this.shattered || this.isLocked || (this.kickTime > 0 && !this.contactPush) ||
          entity.isAlive === false || entity.state === 'KNOCKED_DOWN') return;
      const tip=this.getTipPosition();
      const col=Physics.circleVsSegment(entity.x,entity.y,(entity.radius||14)+this.thickness/2+2,this.x,this.y,tip.x,tip.y);
      if (!col.collided) return;
      const n=this.getNormal();
      const force=(entity.vx||0)*n.x+(entity.vy||0)*n.y;
      const side=(entity.x-col.contactPoint.x)*n.x+(entity.y-col.contactPoint.y)*n.y;
      if (Math.abs(force)<5 || side*force>0) return;
      const sign=Math.sign(force);
      if ((sign>0 && this.angle>=this.maxAngle-0.01) || (sign<0 && this.angle<=this.minAngle+0.01)) return;
      // A new contact stroke owns its impacts. All contributing pushers are
      // exempt, and a reversal starts a new stroke instead of a rebound attack.
      if(this.kickTime<=0 || !this.contactPush || this.kickSign!==sign) {
        this.hitEntities=new WeakSet();this.pushContributors=new WeakSet();
        this.lastKickedBy=entity;this.lastKickedByPlayerId=entity.playerId;this.kickSign=sign;
      }
      this.pushContributors.add(entity);
      this.contactPush=true;this.kickTime=0.08;
      const target=Physics.clamp(force / Math.max(20,this.length*0.35),-7,7);
      this.angularVelocity += (target-this.angularVelocity)*(1-Math.exp(-60*dt));
    }

    damage(amount, hitX, hitY, dirX = 0, dirY = 0) {
      if (this.shattered) return;
      this.health -= amount;
      if (this.health <= 0) {
        this.shatter(hitX, hitY, dirX, dirY);
      }
    }

    shatter(hitX, hitY, dirX = 0, dirY = 0) {
      if (this.shattered) return;
      this.shattered = true;
      
      // Spawn shards if physics/particles available
      if (window.game && window.game.spawnDebris) {
        window.game.spawnDebris(this.x, this.y, this.type === 'glass' ? 'glass' : 'wood', 12, dirX, dirY);
      }
    }

    addBloodDecal(contactX, contactY) {
      const relX = contactX - this.x;
      const relY = contactY - this.y;
      const cos = Math.cos(-this.angle);
      const sin = Math.sin(-this.angle);
      const localX = relX * cos - relY * sin;
      const localY = relX * sin + relY * cos;

      this.bloodStains.push({
        lx: localX,
        ly: localY,
        radius: 4 + Math.random() * 8,
        color: `rgba(${160 + Math.floor(Math.random() * 40)}, 0, 0, ${0.7 + Math.random() * 0.3})`
      });

      if (this.bloodStains.length > 8) {
        this.bloodStains.shift();
      }
    }

    render(ctx) {
      if (this.shattered) {
        // Draw broken door frame remains
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.baseAngle);
        ctx.fillStyle = '#444444';
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();
        return;
      }

      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.renderAngle ?? this.angle);

      // Door Drop Shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 4;

      // Door Body
      if (this.type === 'glass') {
        // Translucent Glass with Dark Frame
        ctx.fillStyle = this.color;
        ctx.fillRect(0, -this.thickness * 0.5, this.length, this.thickness);

        // Frame
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(0, -this.thickness * 0.5, this.length, this.thickness);

        // Center glass pane shine line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(8, -1);
        ctx.lineTo(this.length - 8, -1);
        ctx.stroke();
      } else if (this.type === 'security') {
        // Heavy steel door with yellow caution stripes
        ctx.fillStyle = '#3a3d40';
        ctx.fillRect(0, -this.thickness * 0.5, this.length, this.thickness);

        ctx.strokeStyle = '#e67e22';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, -this.thickness * 0.5, this.length, this.thickness);
      } else {
        // Warm Wood Door with Wood Grain Trim
        ctx.fillStyle = this.color;
        ctx.fillRect(0, -this.thickness * 0.5, this.length, this.thickness);

        // Wood Paneling Bevels
        ctx.strokeStyle = '#4a2f18';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(0, -this.thickness * 0.5, this.length, this.thickness);

        // Inner wood line
        ctx.strokeStyle = '#9c6b3e';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(this.length - 6, 0);
        ctx.stroke();
      }

      // Reset Shadow for sharp details
      ctx.shadowColor = 'transparent';

      // Door Handle / Knob
      ctx.fillStyle = '#d4af37'; // brass/gold handle
      ctx.beginPath();
      ctx.arc(this.length - 8, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Blood Stains on Door
      for (let i = 0; i < this.bloodStains.length; i++) {
        const b = this.bloodStains[i];
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.lx, b.ly, b.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Hinge Pivot Pin
      ctx.fillStyle = '#222222';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#666666';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // Glass Partition Class
  // ---------------------------------------------------------------------------
  class GlassPartition {
    constructor(config) {
      this.id = config.id || 'glass_' + Math.random().toString(36).substr(2, 9);
      this.x1 = config.x1;
      this.y1 = config.y1;
      this.x2 = config.x2;
      this.y2 = config.y2;
      this.thickness = config.thickness || 6;
      this.health = config.health || 20;
      this.maxHealth = this.health;
      this.shattered = false;
      this.tintColor = config.tintColor || 'rgba(160, 225, 255, 0.35)';
      this.frameColor = config.frameColor || '#1c2833';
      this.hasFrostedBand = config.hasFrostedBand !== false; // Modern office frosted privacy band
    }

    reset() {
      this.shattered = false;
      this.health = this.maxHealth;
    }

    update(dt) {
      // Glass partition state updates if any
    }

    damage(amount, hitX, hitY, dirX = 0, dirY = 0) {
      if (this.shattered) return;
      this.health -= amount;
      if (this.health <= 0) {
        this.shatter(hitX, hitY, dirX, dirY);
      }
    }

    shatter(hitX, hitY, dirX = 0, dirY = 0) {
      if (this.shattered) return;
      this.shattered = true;

      const len = Math.hypot(this.x2 - this.x1, this.y2 - this.y1);
      const shardCount = Math.max(8, Math.floor(len / 12));

      if (window.game && window.game.spawnDebris) {
        const midX = (this.x1 + this.x2) * 0.5;
        const midY = (this.y1 + this.y2) * 0.5;
        window.game.spawnDebris(midX, midY, 'glass', shardCount, dirX, dirY);
      }
    }

    render(ctx) {
      if (this.shattered) {
        // Draw broken frame stubs on both endpoints
        ctx.strokeStyle = this.frameColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        const dx = (this.x2 - this.x1);
        const dy = (this.y2 - this.y1);
        const l = Math.hypot(dx, dy);
        const nx = dx / l;
        const ny = dy / l;
        ctx.moveTo(this.x1, this.y1);
        ctx.lineTo(this.x1 + nx * 8, this.y1 + ny * 8);
        ctx.moveTo(this.x2 - nx * 8, this.y2 - ny * 8);
        ctx.lineTo(this.x2, this.y2);
        ctx.stroke();
        return;
      }

      const dx = this.x2 - this.x1;
      const dy = this.y2 - this.y1;
      const len = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);

      ctx.save();
      ctx.translate(this.x1, this.y1);
      ctx.rotate(angle);

      // Glass Pane Body
      ctx.fillStyle = this.tintColor;
      ctx.fillRect(0, -this.thickness * 0.5, len, this.thickness);

      // Frosted privacy band in middle
      if (this.hasFrostedBand) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillRect(4, -this.thickness * 0.35, len - 8, this.thickness * 0.7);
      }

      // Outer Frame
      ctx.strokeStyle = this.frameColor;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(0, -this.thickness * 0.5, len, this.thickness);

      // Black Mullion Vertical Dividers (every 35-40px)
      const numMullions = Math.floor(len / 38);
      ctx.fillStyle = this.frameColor;
      for (let m = 1; m <= numMullions; m++) {
        const mx = (len / (numMullions + 1)) * m;
        ctx.fillRect(mx - 1, -this.thickness * 0.5, 2, this.thickness);
      }

      // Glass Reflection Highlights
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(6, -1);
      ctx.lineTo(len - 6, -1);
      ctx.stroke();

      ctx.restore();
    }
  }

  return {
    Door,
    GlassPartition
  };
}));
