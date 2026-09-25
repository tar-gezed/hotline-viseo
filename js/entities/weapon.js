/**
 * Hotline Miami: VISEO Arcade Edition
 * Weapon Arsenal & Projectile Engine - js/entities/weapon.js
 * 
 * Features:
 * - Complete melee & firearm arsenal with authentic Hotline Miami timings
 * - Floor weapon instances with dynamic throwing physics, wall bouncing, and enemy knockdown
 * - High-speed bullet raycasting with multi-enemy penetration (.44 Magnum) & shotgun pellet cones
 * - Ammo management, empty dry-fire triggers, weapon pickup & swap mechanics
 * - Visual rendering for floor weapons, thrown spinning weapons, and bullet tracers
 */

(function (root, factory) {
    const AudioObj = (typeof window !== 'undefined' && (window.soundFX || window.soundEffects || window.audioManager)) || root.AudioManager || null;
    const CollisionObj = (typeof window !== 'undefined' && window.Collision) || root.Collision || null;
    const result = factory(AudioObj, CollisionObj);
    if (typeof define === 'function' && define.amd) {
        define(['../engine/audio', '../engine/collision'], () => result);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = result;
    }
    if (typeof window !== 'undefined') {
        window.WeaponSystem = result;
        window.WEAPON_TYPES = result.WEAPON_TYPES;
        window.FloorWeapon = result.FloorWeapon;
        window.Bullet = result.Bullet;
    }
    root.WeaponSystem = result;
    root.WEAPON_TYPES = result.WEAPON_TYPES;
    root.FloorWeapon = result.FloorWeapon;
    root.Bullet = result.Bullet;
}(typeof self !== 'undefined' ? self : this, function (AudioManager, Collision) {
    'use strict';

    // ==================== WEAPON DEFINITIONS CATALOG ====================

    const WEAPON_TYPES = {
        // --- MELEE WEAPONS ---
        FISTS: {
            id: 'FISTS',
            name: 'Fists',
            isGun: false,
            cooldown: 0.22,
            range: 44,
            arc: (70 * Math.PI) / 180,
            damage: 1,
            isLethalMelee: false, // Knocks down unless Tony mask is active
            noiseRadius: 0,
            spriteColor: '#f1c40f',
            length: 12,
            width: 8,
            twoHanded: false,
            throwDamage: 0
        },
        KNIFE: {
            id: 'KNIFE',
            name: 'Combat Knife',
            isGun: false,
            cooldown: 0.18,
            range: 50,
            arc: (55 * Math.PI) / 180,
            damage: 1,
            isLethalMelee: true,
            noiseRadius: 0,
            spriteColor: '#bdc3c7',
            length: 18,
            width: 5,
            twoHanded: false,
            throwDamage: 1 // Thrown knife can kill
        },
        BAT: {
            id: 'BAT',
            name: 'Baseball Bat',
            isGun: false,
            cooldown: 0.32,
            range: 58,
            arc: (120 * Math.PI) / 180,
            damage: 1,
            isLethalMelee: true,
            noiseRadius: 0,
            spriteColor: '#d35400',
            length: 28,
            width: 6,
            twoHanded: true,
            throwDamage: 0
        },
        PIPE: {
            id: 'PIPE',
            name: 'Lead Pipe',
            isGun: false,
            cooldown: 0.30,
            range: 56,
            arc: (110 * Math.PI) / 180,
            damage: 1,
            isLethalMelee: true,
            noiseRadius: 0,
            spriteColor: '#7f8c8d',
            length: 26,
            width: 5,
            twoHanded: false,
            throwDamage: 0
        },
        GOLF_CLUB: {
            id: 'GOLF_CLUB',
            name: 'Golf Club',
            isGun: false,
            cooldown: 0.28,
            range: 60,
            arc: (130 * Math.PI) / 180,
            damage: 1,
            isLethalMelee: true,
            noiseRadius: 0,
            spriteColor: '#95a5a6',
            length: 30,
            width: 5,
            twoHanded: true,
            throwDamage: 0
        },
        AXE: {
            id: 'AXE',
            name: 'Fire Axe',
            isGun: false,
            cooldown: 0.44,
            range: 64,
            arc: (140 * Math.PI) / 180,
            damage: 2,
            isLethalMelee: true,
            noiseRadius: 0,
            spriteColor: '#c0392b',
            length: 32,
            width: 10,
            twoHanded: true,
            throwDamage: 1
        },
        KATANA: {
            id: 'KATANA',
            name: 'Katana',
            isGun: false,
            cooldown: 0.24,
            range: 70,
            arc: (150 * Math.PI) / 180,
            damage: 2,
            isLethalMelee: true,
            noiseRadius: 0,
            spriteColor: '#ecf0f1',
            length: 36,
            width: 4,
            twoHanded: true,
            throwDamage: 1
        },

        // --- FIREARMS ---
        SILENCED_PISTOL: {
            id: 'SILENCED_PISTOL',
            name: 'Silenced Pistol',
            isGun: true,
            maxAmmo: 12,
            cooldown: 0.18,
            bulletSpeed: 7200,
            spread: 0.03,
            pellets: 1,
            pierceCount: 1,
            noiseRadius: 0, // Silent assassination
            screenShake: 0.12,
            spriteColor: '#2c3e50',
            length: 22,
            width: 6,
            twoHanded: false,
            automatic: false,
            burstCount: 1
        },
        PISTOL: {
            id: 'PISTOL',
            name: '9mm Pistol',
            isGun: true,
            maxAmmo: 8,
            cooldown: 0.20,
            bulletSpeed: 7600,
            spread: 0.05,
            pellets: 1,
            pierceCount: 1,
            noiseRadius: 550,
            screenShake: 0.20,
            spriteColor: '#34495e',
            length: 16,
            width: 6,
            twoHanded: false,
            automatic: false,
            burstCount: 1
        },
        MAGNUM: {
            id: 'MAGNUM',
            name: '.44 Magnum',
            isGun: true,
            maxAmmo: 6,
            cooldown: 0.42,
            bulletSpeed: 9000,
            spread: 0.015,
            pellets: 1,
            pierceCount: 3, // Pierces through multiple enemies
            noiseRadius: 750,
            screenShake: 0.45,
            spriteColor: '#95a5a6',
            length: 20,
            width: 7,
            twoHanded: false,
            automatic: false,
            burstCount: 1
        },
        DOUBLE_BARREL: {
            id: 'DOUBLE_BARREL',
            name: 'Double Barrel',
            isGun: true,
            maxAmmo: 2,
            cooldown: 0.55,
            bulletSpeed: 6800,
            spread: 0.28,
            pellets: 8, // 8 devastating pellets
            pierceCount: 1,
            noiseRadius: 850,
            screenShake: 0.50,
            spriteColor: '#784212',
            length: 28,
            width: 8,
            twoHanded: true,
            automatic: false,
            burstCount: 1
        },
        SHOTGUN: {
            id: 'SHOTGUN',
            name: 'Pump Shotgun',
            isGun: true,
            maxAmmo: 6,
            cooldown: 0.65,
            bulletSpeed: 7000,
            spread: 0.22,
            pellets: 8,
            pierceCount: 1,
            noiseRadius: 820,
            screenShake: 0.62,
            spriteColor: '#1b2631',
            length: 32,
            width: 8,
            twoHanded: true,
            automatic: false,
            burstCount: 1
        },
        UZI: {
            id: 'UZI',
            name: 'MAC-10 / Uzi',
            isGun: true,
            maxAmmo: 30,
            cooldown: 0.08, // High-speed automatic
            bulletSpeed: 7400,
            spread: 0.15,
            pellets: 1,
            pierceCount: 1,
            noiseRadius: 620,
            screenShake: 0.16,
            spriteColor: '#283747',
            length: 18,
            width: 7,
            twoHanded: false,
            automatic: true,
            burstCount: 1
        },
        M16: {
            id: 'M16',
            name: 'M16 Assault Rifle',
            isGun: true,
            maxAmmo: 24,
            cooldown: 0.35,
            burstInterval: 0.07,
            burstCount: 3, // 3-round burst
            bulletSpeed: 8000,
            spread: 0.035,
            pellets: 1,
            pierceCount: 1,
            noiseRadius: 700,
            screenShake: 0.24,
            spriteColor: '#17202a',
            length: 34,
            width: 7,
            twoHanded: true,
            automatic: false
        }
    };

    function getWeaponType(type) {
        if (!type) return WEAPON_TYPES.FISTS;
        if (typeof type === 'object' && type.id && WEAPON_TYPES[type.id]) return WEAPON_TYPES[type.id];
        if (typeof type === 'object' && type.id) return type;
        const s = String(type).toUpperCase().replace(/[\s-]/g, '_');
        if (WEAPON_TYPES[s]) return WEAPON_TYPES[s];
        if (s.includes('BAT') || s.includes('BASEBALL')) return WEAPON_TYPES.BAT;
        if (s.includes('KNIFE')) return WEAPON_TYPES.KNIFE;
        if (s.includes('PIPE')) return WEAPON_TYPES.PIPE;
        if (s.includes('KATANA') || s.includes('SWORD')) return WEAPON_TYPES.KATANA;
        if (s.includes('AXE')) return WEAPON_TYPES.AXE;
        if (s.includes('GOLF')) return WEAPON_TYPES.GOLF_CLUB;
        if (s.includes('SILENCE')) return WEAPON_TYPES.SILENCED_PISTOL;
        if (s.includes('MAGNUM') || s.includes('REVOLVER')) return WEAPON_TYPES.MAGNUM;
        if (s.includes('DOUBLE')) return WEAPON_TYPES.DOUBLE_BARREL;
        if (s.includes('SHOTGUN')) return WEAPON_TYPES.SHOTGUN;
        if (s.includes('UZI') || s.includes('MAC')) return WEAPON_TYPES.UZI;
        if (s.includes('RIFLE') || s.includes('M16') || s.includes('ASSAULT')) return WEAPON_TYPES.M16;
        if (s.includes('PISTOL') || s.includes('9MM')) return WEAPON_TYPES.PISTOL;
        if (s.includes('FIST') || s.includes('UNARMED')) return WEAPON_TYPES.FISTS;
        return WEAPON_TYPES.BAT;
    }

    // ==================== FLOOR WEAPON ENTITY ====================

    class FloorWeapon {
        /**
         * @param {number} x 
         * @param {number} y 
         * @param {string|Object} weaponType 
         * @param {number} [ammo] 
         * @param {number} [angle=0] 
         */
        constructor(x, y, weaponType, ammo = null, angle = 0) {
            this.x = x;
            this.y = y;
            this.vx = 0;
            this.vy = 0;
            this.angle = angle || Math.random() * Math.PI * 2;
            this.angularVelocity = 0;

            this.def = getWeaponType(weaponType);
            this.type = this.def.id;

            this.ammo = ammo !== null ? ammo : (this.def.isGun ? this.def.maxAmmo : 0);
            this.radius = 14;

            // Thrown physics state
            this.isFlying = false;
            this.thrownBy = null; // 'player' or 'enemy'
            this.throwTimer = 0;
            this.bounceCount = 0;
            this.maxBounces = 3;

            // Highlight pulse
            this.pulseTimer = Math.random() * 5;
        }

        /**
         * Throws the weapon in the specified direction.
         * @param {number} startX 
         * @param {number} startY 
         * @param {number} angle 
         * @param {string} [thrownBy='player'] 
         * @param {number} [throwSpeed=780] 
         */
        throw(startX, startY, angle, thrownBy = 'player', throwSpeed = 780) {
            this.x = startX;
            this.y = startY;
            this.vx = Math.cos(angle) * throwSpeed;
            this.vy = Math.sin(angle) * throwSpeed;
            this.angularVelocity = 28 * (Math.random() > 0.5 ? 1 : -1);
            this.angle = angle;
            this.isFlying = true;
            this.thrownBy = thrownBy;
            this.throwTimer = 0;
            this.bounceCount = 0;
        }

        /**
         * Updates floor weapon physics, wall bouncing, and friction.
         * @param {number} dt 
         * @param {Array<Object>} obstacles 
         * @param {Array<Object>} enemies Target enemies to check knockdown
         * @param {Object} [effects] Effect manager for hit sparks/blood
         * @param {Object} [camera] Camera for shake
         */
        update(dt, obstacles = [], enemies = [], effects = null, camera = null) {
            // Small physics steps prevent fast player throws skipping narrow targets.
            if (dt > 1 / 120 + 1e-8) {
                const steps = Math.ceil(dt * 120);
                for (let i = 0; i < steps; i++) this.update(dt / steps, obstacles, enemies, effects, camera);
                return;
            }
            this.pulseTimer += dt * 3;

            if (this.isFlying) {
                this.throwTimer += dt;

                const prevX = this.x, prevY = this.y;
                // Move
                this.x += this.vx * dt;
                this.y += this.vy * dt;
                this.angle += this.angularVelocity * dt;

                // Drag / air resistance
                const speed = Math.hypot(this.vx, this.vy);
                const friction = Math.pow(0.945, dt * 60);
                this.vx *= friction;
                this.vy *= friction;
                this.angularVelocity *= Math.pow(0.96, dt * 60);

                // Wall Collision & Bouncing
                for (let i = 0; i < obstacles.length; i++) {
                    const obs = obstacles[i];
                    if (!obs || obs.shattered || (obs.isOpen === true && typeof obs.getTipPosition !== 'function')) continue;

                    // Test ray from previous to current
                    const ray = Collision.raycast(prevX, prevY, (this.x - prevX) / (speed * dt || 1), (this.y - prevY) / (speed * dt || 1), speed * dt, [obs], {ignoreOpenDoors:false});
                    if (ray.hit) {
                        if(obs.x1 !== undefined && typeof obs.shatter === 'function' && obs.health !== undefined) {
                            // A swept glass hit shatters the pane; the throw
                            // continues. Walls, props and door leaves bounce.
                            obs.shatter(ray.point.x,ray.point.y,this.vx,this.vy);
                            continue;
                        }
                        this.x = ray.point.x + ray.normal.x * 6;
                        this.y = ray.point.y + ray.normal.y * 6;

                        // Reflect velocity vector: v' = v - 2(v·n)n
                        const dot = this.vx * ray.normal.x + this.vy * ray.normal.y;
                        this.vx = (this.vx - 2 * dot * ray.normal.x) * 0.5;
                        this.vy = (this.vy - 2 * dot * ray.normal.y) * 0.5;
                        this.angularVelocity = -this.angularVelocity * 0.6;

                        this.bounceCount++;
                        if (AudioManager) AudioManager.playWeaponThrowHit(this.x, this.y);
                        if (effects && typeof effects.spawnSparks === 'function') {
                            effects.spawnSparks(this.x, this.y, ray.normal);
                        }

                        if (this.bounceCount >= this.maxBounces) {
                            this.isFlying = false;
                        }
                        break;
                    }
                }

                // Enemy Collision Check during flight (Knockdown + Stun)
                if (this.isFlying && speed > 140 && enemies && enemies.length > 0) {
                    for (let i = 0; i < enemies.length; i++) {
                        const enemy = enemies[i];
                        if (!enemy || enemy.state === 'DEAD' || enemy.state === 'KNOCKED_DOWN') continue;

                        const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y);
                        if (dist < this.radius + (enemy.radius || 14)) {
                            // Hit enemy!
                            const hitAngle = Math.atan2(this.vy, this.vx);

                            if (typeof enemy.takeHit === 'function') {
                                // Thrown weapons deal knockdown or lethal hit if knife/axe
                                const isLethal = this.def.throwDamage > 0;
                                enemy.takeHit({
                                    type: 'THROW',
                                    damage: 1,
                                    isLethal: isLethal,
                                    knockdown: true,
                                    angle: hitAngle,
                                    hitX: this.x,
                                    hitY: this.y,
                                    weaponType: this.type
                                });
                            }

                            if (AudioManager) AudioManager.playMeleeHit(false, this.type);
                            if (camera && typeof camera.addTrauma === 'function') camera.addTrauma(0.25);
                            if (effects && typeof effects.spawnBlood === 'function') {
                                effects.spawnBlood(this.x, this.y, hitAngle, 8);
                            }

                            // Deflect off enemy and drop
                            this.vx = -this.vx * 0.25 + (Math.random() * 60 - 30);
                            this.vy = -this.vy * 0.25 + (Math.random() * 60 - 30);
                            this.angularVelocity *= 0.3;
                            this.isFlying = false;
                            break;
                        }
                    }
                }

                // When slowed down enough, drop to floor
                if (speed < 40 || this.throwTimer > 2.5) {
                    this.isFlying = false;
                    this.vx = 0;
                    this.vy = 0;
                    this.angularVelocity = 0;
                }
            }
        }

        /**
         * Renders the weapon on the floor or in flight.
         * @param {CanvasRenderingContext2D} ctx 
         * @param {boolean} [isHovered=false] 
         */
        draw(ctx, isHovered = false) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.angle);

            const len = this.def.length || 20;
            const wid = this.def.width || 6;

            // Highlight glow when on floor
            if (!this.isFlying) {
                const pulse = 0.5 + Math.sin(this.pulseTimer) * 0.4;
                ctx.shadowColor = isHovered ? '#00ffff' : '#ffff00';
                ctx.shadowBlur = isHovered ? 14 : (7 * pulse);
            }

            // Drop shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.fillRect(-len * 0.45 + 3, -wid * 0.5 + 3, len, wid);

            // Detailed Pixel Art Weapon Sprite
            drawWeaponSprite(ctx, this.type, len, wid, false);

            ctx.restore();

            // Hover HUD Indicator
            if (isHovered && !this.isFlying) {
                ctx.save();
                ctx.fillStyle = '#00ffff';
                ctx.font = '900 10px "Courier New", monospace';
                ctx.textAlign = 'center';
                const text = this.def.isGun ? `[R-CLICK / E] ${this.def.name} (${this.ammo}/${this.def.maxAmmo})` : `[R-CLICK / E] ${this.def.name}`;
                ctx.fillText(text, this.x, this.y - 18);
                ctx.restore();
            }
        }
    }

    /**
     * Authentic Hotline Miami Pixel-Art Weapon Renderer
     */
    function drawWeaponSprite(ctx, weaponId, len = 20, wid = 6, isHeld = false) {
        ctx.save();
        const id = (weaponId || '').toUpperCase();

        if (id.includes('KATANA')) {
            // Katana: Curved razor silver blade, gold tsuba, dark red wrapped hilt
            ctx.fillStyle = '#e8ecf1';
            ctx.strokeStyle = '#2c3e50';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-10, -1);
            ctx.lineTo(len - 4, -2.5);
            ctx.quadraticCurveTo(len, -2, len + 3, -1);
            ctx.lineTo(len - 4, 1.5);
            ctx.lineTo(-10, 1.5);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Blade shine
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, -1.5, len - 8, 1);

            // Tsuba (Guard)
            ctx.fillStyle = '#f1c40f';
            ctx.fillRect(-10, -4, 2.5, 8);

            // Tsuka (Hilt)
            ctx.fillStyle = '#900c3f';
            ctx.fillRect(-18, -2, 8, 4);
            ctx.fillStyle = '#111111';
            ctx.fillRect(-16, -2, 2, 4);
            ctx.fillRect(-12, -2, 2, 4);
        } else if (id.includes('BAT')) {
            // Baseball bat: Tapered ash wood with red grip tape and knob
            ctx.fillStyle = '#d4ac0d';
            ctx.strokeStyle = '#7d6608';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-16, -2);
            ctx.lineTo(len - 4, -3.5);
            ctx.quadraticCurveTo(len, -3, len, 0);
            ctx.quadraticCurveTo(len, 3, len - 4, 3.5);
            ctx.lineTo(-16, 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Red grip tape
            ctx.fillStyle = '#e74c3c';
            ctx.fillRect(-16, -2.5, 9, 5);
            // Knob
            ctx.fillStyle = '#7d6608';
            ctx.fillRect(-18, -3, 2.5, 6);
        } else if (id.includes('PIPE')) {
            // Lead Pipe: Metallic grey cylinder with dark threaded coupler ends
            ctx.fillStyle = '#7f8c8d';
            ctx.strokeStyle = '#2c3e50';
            ctx.lineWidth = 1;
            ctx.fillRect(-14, -2.5, len + 4, 5);
            ctx.strokeRect(-14, -2.5, len + 4, 5);

            // Specular sheen
            ctx.fillStyle = '#bdc3c7';
            ctx.fillRect(-12, -1.5, len, 1.5);

            // Threaded couplers
            ctx.fillStyle = '#34495e';
            ctx.fillRect(-15, -3.5, 3, 7);
            ctx.fillRect(len - 12, -3.5, 3, 7);
        } else if (id.includes('KNIFE')) {
            // Combat Knife: Tactical clip-point blade and rubber grip
            ctx.fillStyle = '#ecf0f1';
            ctx.strokeStyle = '#2c3e50';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-4, -2);
            ctx.lineTo(len - 6, -2);
            ctx.lineTo(len, 0);
            ctx.lineTo(len - 4, 2);
            ctx.lineTo(-4, 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Serration notches
            ctx.fillStyle = '#2c3e50';
            ctx.fillRect(0, -2, 2, 1);
            ctx.fillRect(4, -2, 2, 1);

            // Guard & Handle
            ctx.fillStyle = '#17202a';
            ctx.fillRect(-5, -4, 2, 8);
            ctx.fillRect(-14, -2.5, 9, 5);
        } else if (id.includes('AXE')) {
            // Fire Axe: Ash handle with large red fire axe head
            ctx.fillStyle = '#ba4a00';
            ctx.fillRect(-14, -2, len, 4);
            ctx.strokeStyle = '#5e2400';
            ctx.strokeRect(-14, -2, len, 4);

            // Red Axe Head
            ctx.fillStyle = '#c0392b';
            ctx.beginPath();
            ctx.moveTo(len - 18, -8);
            ctx.lineTo(len - 6, -11);
            ctx.lineTo(len - 6, 5);
            ctx.lineTo(len - 18, 2);
            ctx.closePath();
            ctx.fill();

            // Polished Steel Bevel
            ctx.fillStyle = '#ecf0f1';
            ctx.fillRect(len - 7, -11, 2, 16);
        } else if (id.includes('MAGNUM')) {
            // .44 Magnum: Heavy long silver barrel, 6-shot cylinder, rosewood grip
            ctx.fillStyle = '#bdc3c7';
            ctx.strokeStyle = '#2c3e50';
            ctx.lineWidth = 1;
            ctx.fillRect(-2, -2, len + 2, 4);
            ctx.strokeRect(-2, -2, len + 2, 4);

            // Cylinder
            ctx.fillStyle = '#7f8c8d';
            ctx.fillRect(-6, -3.5, 6, 7);
            ctx.strokeRect(-6, -3.5, 6, 7);

            // Rosewood Grip
            ctx.fillStyle = '#6e2c00';
            ctx.fillRect(-12, -2, 6, 6);
        } else if (id.includes('SHOTGUN') || id.includes('DOUBLE')) {
            // Shotgun: Dark blued steel barrel, walnut pump/forend, walnut buttstock
            ctx.fillStyle = '#2c3e50';
            ctx.strokeStyle = '#17202a';
            ctx.lineWidth = 1;
            ctx.fillRect(-6, -2.5, len + 4, 5);
            ctx.strokeRect(-6, -2.5, len + 4, 5);

            // Walnut Pump / Forend
            ctx.fillStyle = '#873600';
            ctx.fillRect(2, -3.5, 9, 7);

            // Walnut Buttstock
            ctx.fillStyle = '#6e2c00';
            ctx.fillRect(-16, -3, 10, 6);
        } else if (id.includes('UZI') || id.includes('MAC')) {
            // Uzi / MAC-10: Boxy receiver, top charging handle, straight magazine
            ctx.fillStyle = '#212f3d';
            ctx.strokeStyle = '#111111';
            ctx.lineWidth = 1;
            ctx.fillRect(-8, -4, len, 8);
            ctx.strokeRect(-8, -4, len, 8);

            // Barrel tip
            ctx.fillStyle = '#111111';
            ctx.fillRect(len - 8, -2, 5, 4);

            // Extended Magazine
            ctx.fillStyle = '#34495e';
            ctx.fillRect(-2, 4, 4, 8);
        } else if (id.includes('M16') || id.includes('RIFLE')) {
            // M16 Rifle: Triangular front sight, ribbed handguard, carry handle, flash hider
            ctx.fillStyle = '#1c2833';
            ctx.strokeStyle = '#111111';
            ctx.lineWidth = 1;
            ctx.fillRect(-12, -3, len + 8, 6);
            ctx.strokeRect(-12, -3, len + 8, 6);

            // Triangular Sight
            ctx.fillStyle = '#111111';
            ctx.fillRect(len - 8, -6, 3, 4);

            // Ribbed Handguard
            ctx.fillStyle = '#2e4053';
            ctx.fillRect(-4, -4, 12, 8);

            // Magazine
            ctx.fillStyle = '#17202a';
            ctx.fillRect(-2, 3, 4, 7);

            // Buttstock
            ctx.fillStyle = '#111111';
            ctx.fillRect(-18, -3.5, 7, 7);
        } else {
            // 9mm Pistol (Standard)
            ctx.fillStyle = '#2c3e50';
            ctx.strokeStyle = '#111111';
            ctx.lineWidth = 1;
            ctx.fillRect(-4, -2.5, len, 5);
            ctx.strokeRect(-4, -2.5, len, 5);

            // Silencer if silenced
            if (id.includes('SILENCED')) {
                ctx.fillStyle = '#111111';
                ctx.fillRect(len - 4, -3.5, 10, 7);
            }

            // Grip
            ctx.fillStyle = '#17202a';
            ctx.fillRect(-9, -2, 5, 5);
        }

        ctx.restore();
    }

    // ==================== BULLET / PROJECTILE SYSTEM ====================

    class Bullet {
        constructor(x, y, angle, weaponDef, isPlayer = true) {
            this.x = x;
            this.y = y;
            this.prevX = x;
            this.prevY = y;
            this.angle = angle;
            this.speed = weaponDef.bulletSpeed || 1200;
            this.vx = Math.cos(angle) * this.speed;
            this.vy = Math.sin(angle) * this.speed;
            this.weaponDef = weaponDef;
            this.isPlayer = isPlayer;

            this.alive = true;
            this.lifeTime = 0;
            this.maxLifeTime = weaponDef.tracerLifetime || 0.24; // visual tracer only; collision is continuous

            this.pierceLeft = weaponDef.pierceCount || 1;
            this.hitEntities = new Set();

            this.tracerLength = weaponDef.id === 'MAGNUM' ? 96 : (weaponDef.id.includes('SHOTGUN') ? 72 : 58);
        }

        /**
         * Step-marches bullet and checks collisions.
         * @param {number} dt 
         * @param {Array<Object>} obstacles 
         * @param {Array<Object>} targets (Enemies or Player)
         * @param {Object} [effects] 
         * @param {Object} [camera] 
         */
        update(dt, obstacles = [], targets = [], effects = null, camera = null) {
            if (!this.alive) return;

            this.lifeTime += dt;
            if (this.lifeTime > this.maxLifeTime) {
                this.alive = false;
                return;
            }

            this.prevX = this.x;
            this.prevY = this.y;

            const stepDist = this.speed * dt;
            const nextX = this.x + (this.vx / this.speed) * stepDist;
            const nextY = this.y + (this.vy / this.speed) * stepDist;

            // 1. Raycast against Obstacles / Walls
            const dirX = this.vx / this.speed;
            const dirY = this.vy / this.speed;
            const wallHit = Collision.raycast(this.prevX, this.prevY, dirX, dirY, stepDist, obstacles, {
                ignoreGlass: false,
                ignoreOpenDoors: true
            });

            const maxTravel = wallHit.hit ? wallHit.distance : stepDist;

            // 2. Check Targets along ray segment
            if (targets && targets.length > 0) {
                for (let i = 0; i < targets.length; i++) {
                    const target = targets[i];
                    if (!target || target.state === 'DEAD' || this.hitEntities.has(target)) continue;

                    // Circle intersection with segment from prev to next
                    const t = Collision.circleIntersectsSegment(this.prevX, this.prevY, this.prevX + dirX * maxTravel, this.prevY + dirY * maxTravel, target.x, target.y, target.radius || 14);

                    if (t) {
                        this.hitEntities.add(target);

                        if (typeof target.takeHit === 'function') {
                            target.takeHit({
                                type: 'BULLET',
                                damage: this.weaponDef.id === 'MAGNUM' ? 3 : 1,
                                angle: this.angle,
                                hitX: target.x,
                                hitY: target.y,
                                isPlayerBullet: this.isPlayer,
                                weaponType: this.weaponDef.id
                            });
                        }

                        if (effects && typeof effects.spawnBlood === 'function') {
                            effects.spawnBlood(target.x, target.y, this.angle, 14);
                        }

                        this.pierceLeft--;
                        if (this.pierceLeft <= 0) {
                            this.alive = false;
                            this.x = target.x;
                            this.y = target.y;
                            return;
                        }
                    }
                }
            }

            // 3. Handle Wall Impact
            if (wallHit.hit) {
                this.x = wallHit.point.x;
                this.y = wallHit.point.y;
                this.alive = false;

                if (effects && typeof effects.spawnSparks === 'function') {
                    effects.spawnSparks(this.x, this.y, wallHit.normal);
                }
                if (effects && typeof effects.addBulletHole === 'function') {
                    effects.addBulletHole(this.x, this.y, wallHit.normal);
                }
                return;
            }

            this.x = nextX;
            this.y = nextY;
        }

        /**
         * Render glowing bullet tracer.
         * @param {CanvasRenderingContext2D} ctx 
         */
        draw(ctx) {
            if (!this.alive) return;

            const tailX = this.x - Math.cos(this.angle) * this.tracerLength;
            const tailY = this.y - Math.sin(this.angle) * this.tracerLength;

            ctx.save();
            ctx.lineWidth = this.weaponDef.id === 'MAGNUM' ? 3.5 : 2;
            ctx.lineCap = 'round';

            const grad = ctx.createLinearGradient(tailX, tailY, this.x, this.y);
            grad.addColorStop(0, 'rgba(255, 200, 0, 0)');
            grad.addColorStop(0.7, '#ffaa00');
            grad.addColorStop(1, '#ffffff');

            ctx.strokeStyle = grad;
            ctx.shadowColor = '#ffcc00';
            ctx.shadowBlur = 6;

            ctx.beginPath();
            ctx.moveTo(tailX, tailY);
            ctx.lineTo(this.x, this.y);
            ctx.stroke();

            ctx.restore();
        }
    }

    // Helper: Circle vs Line Segment test
    if (Collision) {
        Collision.circleIntersectsSegment = function (x1, y1, x2, y2, cx, cy, r) {
        const segDx = x2 - x1;
        const segDy = y2 - y1;
        const segLenSq = segDx * segDx + segDy * segDy;
        if (segLenSq === 0) return Math.hypot(cx - x1, cy - y1) <= r;

        let u = ((cx - x1) * segDx + (cy - y1) * segDy) / segLenSq;
        u = Math.max(0, Math.min(1, u));

        const closestX = x1 + u * segDx;
        const closestY = y1 + u * segDy;
        const distSq = (cx - closestX) * (cx - closestX) + (cy - closestY) * (cy - closestY);

        return distSq <= r * r;
    };
    }

    FloorWeapon.prototype.render = FloorWeapon.prototype.draw;
    Bullet.prototype.render = Bullet.prototype.draw;

    if (typeof window !== 'undefined') {
        window.drawWeaponSprite = drawWeaponSprite;
    }

    return {
        WEAPON_TYPES,
        FloorWeapon,
        Bullet,
        getWeaponType,
        drawWeaponSprite
    };
}));
