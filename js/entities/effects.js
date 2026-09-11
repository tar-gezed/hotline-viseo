/**
 * Hotline Miami: VISEO Arcade Edition
 * Gore, Particles & Visual FX Engine - js/entities/effects.js
 * 
 * Features:
 * - Persistent blood decals & dynamic expanding blood pools
 * - Directional arterial blood squirts & gore chunk physics
 * - Dynamic muzzle flashes & ejected brass shell casings
 * - Slashing melee swing trails & spark impacts
 * - Floating arcade score & combo popups (+1000 EXECUTION!)
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.Effects = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    class EffectManager {
        constructor() {
            // Persistent floor decals (blood pools, bullet holes)
            this.decals = [];
            this.maxDecals = 300;

            // Active dynamic particles (blood squirts, sparks, casings)
            this.particles = [];
            this.maxParticles = 500;

            // Muzzle flashes
            this.muzzleFlashes = [];

            // Melee swing arcs
            this.meleeTrails = [];

            // Floating arcade score popups
            this.floatingTexts = [];
        }

        reset() {
            this.decals = [];
            this.particles = [];
            this.muzzleFlashes = [];
            this.meleeTrails = [];
            this.floatingTexts = [];
        }

        // ==================== BLOOD & GORE ====================

        /**
         * Spawns a spray of blood particles and leaves decals.
         * @param {number} x 
         * @param {number} y 
         * @param {number} dirAngle 
         * @param {number} count 
         */
        spawnBlood(x, y, dirAngle, count = 12) {
            for (let i = 0; i < count; i++) {
                const spread = (Math.random() - 0.5) * 1.2;
                const speed = 120 + Math.random() * 320;
                const angle = dirAngle + spread;

                this.particles.push({
                    type: 'blood',
                    x: x + (Math.random() - 0.5) * 8,
                    y: y + (Math.random() - 0.5) * 8,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    radius: 2 + Math.random() * 3.5,
                    life: 0.35 + Math.random() * 0.3,
                    maxLife: 0.65,
                    color: Math.random() > 0.3 ? '#990000' : '#bb0000'
                });
            }

            // Add static blood splatter on floor
            this.addDecal({
                type: 'splatter',
                x: x,
                y: y,
                angle: dirAngle,
                scale: 0.8 + Math.random() * 0.8,
                color: '#800000'
            });
        }

        /**
         * Creates an expanding blood pool under a corpse.
         */
        spawnBloodPool(x, y, maxRadius = 26) {
            this.decals.push({
                type: 'pool',
                x: x,
                y: y,
                radius: 4,
                maxRadius: maxRadius,
                growthSpeed: 8,
                color: '#730000',
                alpha: 0.95
            });
        }

        /**
         * Spawns brutal arterial blood fountain (for executions and decapitations).
         */
        spawnArterialSpurt(x, y, angle) {
            for (let i = 0; i < 20; i++) {
                const speed = 180 + Math.random() * 360;
                const spreadAngle = angle + (Math.random() - 0.5) * 0.6;
                this.particles.push({
                    type: 'blood',
                    x: x,
                    y: y,
                    vx: Math.cos(spreadAngle) * speed,
                    vy: Math.sin(spreadAngle) * speed,
                    radius: 2.5 + Math.random() * 3.5,
                    life: 0.5 + Math.random() * 0.4,
                    maxLife: 0.9,
                    color: '#aa0000'
                });
            }
        }

        // ==================== GUN & IMPACT FX ====================

        /**
         * Spawns weapon muzzle flash.
         */
        spawnMuzzleFlash(x, y, angle, size = 18) {
            this.muzzleFlashes.push({
                x: x,
                y: y,
                angle: angle,
                size: size,
                life: 0.05,
                maxLife: 0.05
            });
        }

        /**
         * Spawns ejected brass cartridge.
         */
        spawnShellCasing(x, y, angle) {
            const ejectAngle = angle + Math.PI * 0.5 + (Math.random() - 0.5) * 0.4;
            const speed = 90 + Math.random() * 90;

            this.particles.push({
                type: 'shell',
                x: x,
                y: y,
                vx: Math.cos(ejectAngle) * speed,
                vy: Math.sin(ejectAngle) * speed,
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 30,
                life: 1.0,
                maxLife: 1.0,
                settled: false
            });
        }

        /**
         * Spawns rich wall impact sparks.
         */
        spawnSparks(x, y, normal) {
            const baseAngle = Math.atan2(normal.y, normal.x);
            for (let i = 0; i < 8; i++) {
                const angle = baseAngle + (Math.random() - 0.5) * 1.5;
                const speed = 140 + Math.random() * 260;
                this.particles.push({
                    type: 'spark',
                    x: x,
                    y: y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 0.15 + Math.random() * 0.15,
                    maxLife: 0.3,
                    color: '#fff275'
                });
            }
        }

        /**
         * Adds permanent bullet hole decal.
         */
        addBulletHole(x, y, normal) {
            this.addDecal({
                type: 'bullethole',
                x: x,
                y: y,
                angle: Math.atan2(normal.y, normal.x),
                color: '#1a1a1a'
            });
        }

        // ==================== MELEE SWING TRAILS ====================

        /**
         * Spawns an animated slashing melee swing trail.
         */
        spawnMeleeTrail(originX, originY, startAngle, sweepAngle, range, color = 'rgba(255, 255, 255, 0.75)') {
            this.meleeTrails.push({
                x: originX,
                y: originY,
                startAngle: startAngle,
                sweepAngle: sweepAngle,
                range: range,
                life: 0.12,
                maxLife: 0.12,
                color: color
            });
        }

        // ==================== FLOATING TEXT / SCORE ====================

        /**
         * Spawns floating arcade score text.
         */
        spawnFloatingText(text, x, y, color = '#ffff00', scale = 1.0) {
            this.floatingTexts.push({
                text: text,
                x: x,
                y: y,
                vy: -55,
                life: 0.85,
                maxLife: 0.85,
                color: color,
                scale: scale
            });
        }

        addDecal(decal) {
            if (this.decals.length >= this.maxDecals) {
                this.decals.shift();
            }
            this.decals.push(decal);
        }

        // ==================== UPDATE & RENDER ====================

        update(dt) {
            // 1. Update expanding blood pools
            for (let i = 0; i < this.decals.length; i++) {
                const d = this.decals[i];
                if (d.type === 'pool' && d.radius < d.maxRadius) {
                    d.radius += d.growthSpeed * dt;
                }
            }

            // 2. Update particles
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.life -= dt;

                if (p.life <= 0) {
                    if (p.type === 'blood') {
                        // Drop small blood droplet decal
                        this.addDecal({
                            type: 'droplet',
                            x: p.x,
                            y: p.y,
                            radius: p.radius * 0.9,
                            color: p.color
                        });
                    }
                    this.particles.splice(i, 1);
                    continue;
                }

                if (!p.settled) {
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                    p.vx *= 0.88;
                    p.vy *= 0.88;

                    if (p.rotSpeed) {
                        p.rot += p.rotSpeed * dt;
                        p.rotSpeed *= 0.92;
                    }
                }
            }

            // 3. Update Muzzle Flashes
            for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
                this.muzzleFlashes[i].life -= dt;
                if (this.muzzleFlashes[i].life <= 0) {
                    this.muzzleFlashes.splice(i, 1);
                }
            }

            // 4. Update Melee Trails
            for (let i = this.meleeTrails.length - 1; i >= 0; i--) {
                this.meleeTrails[i].life -= dt;
                if (this.meleeTrails[i].life <= 0) {
                    this.meleeTrails.splice(i, 1);
                }
            }

            // 5. Update Floating Texts
            for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
                const ft = this.floatingTexts[i];
                ft.life -= dt;
                ft.y += ft.vy * dt;
                ft.vy *= 0.95;
                if (ft.life <= 0) {
                    this.floatingTexts.splice(i, 1);
                }
            }
        }

        /**
         * Renders floor decals (draw BEFORE entities so entities stand over them).
         */
        drawDecals(ctx) {
            for (let i = 0; i < this.decals.length; i++) {
                const d = this.decals[i];
                ctx.save();

                if (d.type === 'pool') {
                    ctx.fillStyle = d.color;
                    ctx.beginPath();
                    ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
                    ctx.fill();
                } else if (d.type === 'droplet') {
                    ctx.fillStyle = d.color;
                    ctx.beginPath();
                    ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
                    ctx.fill();
                } else if (d.type === 'splatter') {
                    ctx.translate(d.x, d.y);
                    ctx.rotate(d.angle);
                    ctx.scale(d.scale, d.scale);
                    ctx.fillStyle = d.color;

                    ctx.beginPath();
                    ctx.ellipse(8, 0, 14, 5, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(22, 6, 2.5, 0, Math.PI * 2);
                    ctx.arc(18, -7, 3, 0, Math.PI * 2);
                    ctx.arc(30, 2, 2, 0, Math.PI * 2);
                    ctx.fill();
                } else if (d.type === 'bullethole') {
                    ctx.translate(d.x, d.y);
                    ctx.rotate(d.angle);
                    ctx.fillStyle = d.color;
                    ctx.fillRect(-2, -2, 4, 4);
                }

                ctx.restore();
            }
        }

        /**
         * Renders active particles, swing arcs, muzzle flashes, and floating text (draw AFTER entities).
         */
        drawForeground(ctx) {
            // Draw Melee trails
            for (let i = 0; i < this.meleeTrails.length; i++) {
                const tr = this.meleeTrails[i];
                const alpha = tr.life / tr.maxLife;

                ctx.save();
                ctx.fillStyle = tr.color;
                ctx.globalAlpha = alpha * 0.6;
                ctx.beginPath();
                ctx.moveTo(tr.x, tr.y);
                ctx.arc(tr.x, tr.y, tr.range, tr.startAngle, tr.startAngle + tr.sweepAngle);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }

            // Draw Muzzle flashes
            for (let i = 0; i < this.muzzleFlashes.length; i++) {
                const mf = this.muzzleFlashes[i];
                ctx.save();
                ctx.translate(mf.x, mf.y);
                ctx.rotate(mf.angle);

                // Bright dynamic flash
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = '#ffff00';
                ctx.shadowBlur = 16;

                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(mf.size, -mf.size * 0.4);
                ctx.lineTo(mf.size * 1.4, 0);
                ctx.lineTo(mf.size, mf.size * 0.4);
                ctx.closePath();
                ctx.fill();

                ctx.restore();
            }

            // Draw particles
            for (let i = 0; i < this.particles.length; i++) {
                const p = this.particles[i];
                const alpha = Math.min(1, p.life / (p.maxLife * 0.4));

                ctx.save();
                ctx.globalAlpha = alpha;

                if (p.type === 'blood') {
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                    ctx.fill();
                } else if (p.type === 'spark') {
                    ctx.fillStyle = p.color;
                    ctx.fillRect(p.x - 1, p.y - 1, 2.5, 2.5);
                } else if (p.type === 'shell') {
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rot);
                    ctx.fillStyle = '#d4ac0d'; // Gold brass
                    ctx.fillRect(-3, -1, 6, 2.2);
                }

                ctx.restore();
            }

            // Draw floating texts
            for (let i = 0; i < this.floatingTexts.length; i++) {
                const ft = this.floatingTexts[i];
                const alpha = Math.min(1, ft.life / (ft.maxLife * 0.3));

                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.font = `900 ${Math.round(14 * ft.scale)}px "Courier New", monospace`;
                ctx.textAlign = 'center';
                ctx.fillStyle = ft.color;
                ctx.shadowColor = ft.color;
                ctx.shadowBlur = 8;
                ctx.fillText(ft.text, ft.x, ft.y);
                ctx.restore();
            }
        }
    }

    const instance = new EffectManager();
    instance.EffectManager = EffectManager;
    return instance;
}));
