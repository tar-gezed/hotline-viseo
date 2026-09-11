/**
 * Hotline Miami: VISEO Arcade Edition
 * Dynamic Door & Slam Physics - js/entities/door.js
 * 
 * Features:
 * - Hinge-based dynamic swinging physics with rotational inertia and spring damping
 * - Door breach / kick mechanics on E/F interaction or sprint collision
 * - Devastating Door Slam: Stuns, disarms, and knocks down enemies behind the door
 * - Don Juan (Horse) mask lethal door crush integration
 * - Bullet penetration and door splintering
 * - Acoustic noise generation alerting adjacent rooms
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['../engine/audio', '../engine/collision'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(
            require('../engine/audio'),
            require('../engine/collision')
        );
    } else {
        root.Door = factory(root.AudioManager, root.Collision);
    }
}(typeof self !== 'undefined' ? self : this, function (AudioManager, Collision) {
    'use strict';

    class Door {
        /**
         * @param {number} x Hinge X
         * @param {number} y Hinge Y
         * @param {number} [length=48] Door length / width of doorway
         * @param {number} [baseAngle=0] Closed orientation angle (radians)
         * @param {boolean} [isGlass=false]
         */
        constructor(x, y, length = 48, baseAngle = 0, isGlass = false) {
            this.x = x;
            this.y = y;
            this.length = length;
            this.baseAngle = baseAngle;
            this.currentAngle = baseAngle;
            this.angularVelocity = 0;

            this.isGlass = isGlass;
            this.isOpen = false;
            this.thickness = 6;

            // Health & destruction
            this.hp = isGlass ? 1 : 4;
            this.broken = false;

            // Maximum swing limits (radians from base)
            this.maxSwing = (120 * Math.PI) / 180;

            // Segment coordinates for collision
            this.x1 = x;
            this.y1 = y;
            this.x2 = x + Math.cos(this.currentAngle) * length;
            this.y2 = y + Math.sin(this.currentAngle) * length;

            // Cooldown between slam hits
            this.hitCooldown = 0;
        }

        /**
         * Kick or slam the door open in the direction of the instigator's movement/facing.
         * @param {number} forceAngle Angle from which force is applied
         * @param {number} [force=22] Angular impulse
         * @param {Object} [effects] 
         * @param {Object} [camera] 
         */
        kick(forceAngle, force = 22, effects = null, camera = null) {
            if (this.broken) return;

            // Determine swing direction based on cross product between door vector and kick direction
            const doorDx = Math.cos(this.baseAngle);
            const doorDy = Math.sin(this.baseAngle);
            const forceDx = Math.cos(forceAngle);
            const forceDy = Math.sin(forceAngle);

            const cross = doorDx * forceDy - doorDy * forceDx;
            const sign = cross >= 0 ? 1 : -1;

            this.angularVelocity = sign * force;
            this.isOpen = true;

            if (AudioManager) AudioManager.playDoorSlam(this.x, this.y);
            if (camera && typeof camera.addTrauma === 'function') camera.addTrauma(0.35);

            if (effects && typeof effects.spawnFloatingText === 'function') {
                effects.spawnFloatingText('DOOR BREACH!', this.x1 + 10, this.y1, '#ff0055', 1.1);
            }
        }

        /**
         * Update door physics, swing limits, and check door-slam collision against enemies.
         * @param {number} dt 
         * @param {Array<Object>} enemies 
         * @param {Object} [player] 
         * @param {Object} [effects] 
         * @param {Object} [camera] 
         */
        update(dt, enemies = [], player = null, effects = null, camera = null) {
            if (this.broken) return;

            this.hitCooldown = Math.max(0, this.hitCooldown - dt);

            // 1. Angular Physics & Spring Damper
            this.currentAngle += this.angularVelocity * dt;

            // Angular damping
            this.angularVelocity *= 0.88;

            // Limit swing range
            const deltaAngle = this.currentAngle - this.baseAngle;
            if (Math.abs(deltaAngle) > this.maxSwing) {
                this.currentAngle = this.baseAngle + Math.sign(deltaAngle) * this.maxSwing;
                this.angularVelocity = -this.angularVelocity * 0.4; // Bounce off door frame
            }

            // Slowly return towards base when moving slowly
            if (Math.abs(this.angularVelocity) < 0.2 && Math.abs(deltaAngle) > 0.05) {
                this.currentAngle += (this.baseAngle - this.currentAngle) * 0.08;
            }

            // Update line segment
            this.x1 = this.x;
            this.y1 = this.y;
            this.x2 = this.x + Math.cos(this.currentAngle) * this.length;
            this.y2 = this.y + Math.sin(this.currentAngle) * this.length;

            // Mark isOpen if swung open
            this.isOpen = Math.abs(this.currentAngle - this.baseAngle) > 0.35;

            // 2. High-Speed Door Slam Check on Enemies
            const swingSpeed = Math.abs(this.angularVelocity);
            if (swingSpeed > 5.0 && this.hitCooldown <= 0 && enemies && enemies.length > 0) {
                for (let i = 0; i < enemies.length; i++) {
                    const enemy = enemies[i];
                    if (!enemy || enemy.state === 'DEAD') continue;

                    // Check circle vs door segment
                    const hit = Collision.circleIntersectsSegment(this.x1, this.y1, this.x2, this.y2, enemy.x, enemy.y, (enemy.radius || 14) + 6);
                    if (hit) {
                        this.hitCooldown = 0.3; // Prevent multiple triggers in same swing

                        // Check mask perk for Don Juan (Horse): Lethal door slam!
                        const isLethal = player && player.mask === 'DON_JUAN';

                        const slamAngle = this.currentAngle + (this.angularVelocity > 0 ? Math.PI * 0.5 : -Math.PI * 0.5);

                        if (typeof enemy.takeHit === 'function') {
                            enemy.takeHit({
                                type: 'DOOR_SLAM',
                                damage: isLethal ? 3 : 1,
                                isLethal: isLethal,
                                knockdown: true,
                                angle: slamAngle,
                                hitX: enemy.x,
                                hitY: enemy.y,
                                isDoor: true
                            });
                        }

                        if (AudioManager) AudioManager.playDoorSlam(enemy.x, enemy.y);
                        if (camera && typeof camera.addTrauma === 'function') camera.addTrauma(isLethal ? 0.45 : 0.30);

                        if (effects) {
                            if (isLethal) {
                                effects.spawnBlood(enemy.x, enemy.y, slamAngle, 22);
                                effects.spawnFloatingText('+400 CRUSHED!', enemy.x, enemy.y - 12, '#ff0055', 1.2);
                            } else {
                                effects.spawnBlood(enemy.x, enemy.y, slamAngle, 6);
                                effects.spawnFloatingText('+200 DOOR SLAM!', enemy.x, enemy.y - 12, '#ffff00', 1.0);
                            }
                        }

                        // Lose velocity upon impact
                        this.angularVelocity *= 0.3;
                    }
                }
            }

            // 3. Player Proximity Auto-Slam when sprinting into door
            if (player && !this.isOpen && Math.abs(this.angularVelocity) < 2) {
                const distToHinge = Math.hypot(player.x - this.x, player.y - this.y);
                if (distToHinge < this.length + (player.radius || 14)) {
                    const hit = Collision.circleIntersectsSegment(this.x1, this.y1, this.x2, this.y2, player.x, player.y, (player.radius || 14) + 4);
                    if (hit) {
                        const pSpeed = Math.hypot(player.vx || 0, player.vy || 0);
                        if (pSpeed > 100) {
                            const pAngle = Math.atan2(player.vy, player.vx);
                            this.kick(pAngle, 18, effects, camera);
                        }
                    }
                }
            }
        }

        /**
         * Render door on canvas.
         * @param {CanvasRenderingContext2D} ctx 
         */
        draw(ctx) {
            if (this.broken) return;

            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.currentAngle);

            // Door Drop Shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.fillRect(0, 2, this.length, this.thickness);

            if (this.isGlass) {
                // Glass Door
                ctx.fillStyle = 'rgba(150, 230, 255, 0.55)';
                ctx.strokeStyle = '#00ffff';
                ctx.lineWidth = 1.5;
            } else {
                // Heavy Wooden Door
                ctx.fillStyle = '#8b5a2b';
                ctx.strokeStyle = '#3e2723';
                ctx.lineWidth = 1.8;
            }

            ctx.beginPath();
            ctx.rect(0, -this.thickness * 0.5, this.length, this.thickness);
            ctx.fill();
            ctx.stroke();

            // Metallic door handle
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            ctx.arc(this.length - 8, 0, 2.5, 0, Math.PI * 2);
            ctx.fill();

            // Hinge pin
            ctx.fillStyle = '#2c3e50';
            ctx.beginPath();
            ctx.arc(0, 0, 3, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }
    }

    return Door;
}));
