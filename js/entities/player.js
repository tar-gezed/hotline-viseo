/**
 * Hotline Miami: VISEO Arcade Edition
 * Player Entity & Combat Controller - js/entities/player.js
 * 
 * Features:
 * - Fluid 8-directional movement with responsive acceleration & wall sliding
 * - 360-degree mouse aiming & independent scissor-leg walking animation
 * - Complete melee & firearm attack system (bursts, shotgun spreads, automatic spray)
 * - Brutal Ground Executions with invulnerability frames & gory multistep animations
 * - Weapon throwing (Right Click) and seamless floor pickup / swap
 * - Mask perk system (Tony, Brandon, Don Juan, Dennis, Aubrey, George, Ted)
 * - 1-Hit instant lethality & instantaneous restart loop (R key)
 */

(function (root, factory) {
    const AudioObj = (typeof window !== 'undefined' && (window.soundFX || window.soundEffects || window.audioManager)) || root.AudioManager || null;
    const CollisionObj = (typeof window !== 'undefined' && window.Collision) || root.Collision || null;
    const WeaponObj = (typeof window !== 'undefined' && window.WeaponSystem) || root.WeaponSystem || null;
    const result = factory(AudioObj, CollisionObj, WeaponObj);
    if (typeof define === 'function' && define.amd) {
        define(['../engine/audio', '../engine/collision', './weapon'], () => result);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = result;
    }
    if (typeof window !== 'undefined') {
        window.Player = result;
    }
    root.Player = result;
}(typeof self !== 'undefined' ? self : this, function (AudioManager, Collision, WeaponSystem) {
    if (!AudioManager && typeof module === 'object' && module.exports && typeof require === 'function') {
        AudioManager = require('../engine/audio.js');
    }
    const commonJsWeaponSystem = (!WeaponSystem && typeof module === 'object' && module.exports && typeof require === 'function')
        ? require('./weapon.js') : null;
    const commonJsCollision = (!Collision && typeof module === 'object' && module.exports && typeof require === 'function')
        ? require('../engine/collision.js') : null;
    const WSystem = WeaponSystem || commonJsWeaponSystem || (typeof window !== 'undefined' ? window.WeaponSystem : null) || {};
    const WEAPON_TYPES = WSystem.WEAPON_TYPES || (typeof window !== 'undefined' ? window.WEAPON_TYPES : {});
    const FloorWeapon = WSystem.FloorWeapon || (typeof window !== 'undefined' ? window.FloorWeapon : null);
    const Bullet = WSystem.Bullet || (typeof window !== 'undefined' ? window.Bullet : null);
    const ColSystem = Collision || commonJsCollision || (typeof window !== 'undefined' ? (window.Collision || window.CollisionSystem) : null) || (typeof global !== 'undefined' ? (global.Collision || global.CollisionSystem) : null);

    const RosterConfig = typeof window!=='undefined'?window.CONFIG:require('../config.js');

    const CharacterArt = typeof window!=='undefined'?window.CharacterArt:require('./character_art.js');

    class Player {
        /**
         * @param {number} x Starting X
         * @param {number} y Starting Y
         * @param {string} [mask='RICHARD'] Selected mask perk
         */
        constructor(x = 0, y = 0, mask = 'RICHARD') {
            // Transform & Physics
            this.x = x;
            this.y = y;
            this.vx = 0;
            this.vy = 0;
            this.radius = 14;
            this.angle = 0; // Torso & aim angle

            // Movement parameters
            this.baseSpeed = 220; // px/sec
            this.accel = 2400;
            this.friction = 0.82;

            // Health & state
            this.isAlive = true;
            this.state = 'IDLE'; // 'IDLE', 'WALK', 'ATTACKING', 'EXECUTING', 'DEAD'
            this.isInvulnerable = false;

            // Mask Perks
            this.mask = String(mask).toUpperCase();
            this.character = RosterConfig?.MASKS?.[String(mask).toLowerCase()] || null;
            this.perks = this.character?.perks || {}; // 'RICHARD', 'TONY', 'BRANDON', 'DON_JUAN', 'DENNIS', 'AUBREY', 'GEORGE', 'TED'
            this._applyMaskPerks();

            // Weapon state
            this.currentWeapon = WEAPON_TYPES.FISTS;
            this.ammo = 0;
            if (this.mask === 'DENNIS') {
                this.currentWeapon = WEAPON_TYPES.KNIFE;
            }
            if(this.character){this.currentWeapon=WEAPON_TYPES[this.perks.startWeapon];this.ammo=this.perks.startAmmo;}

            // Timers & Cooldowns
            this.attackCooldown = 0;
            this.recoilOffset = 0;
            this.swingAnimationTimer = 0;
            this.swingAnimationDuration = 0.16;

            // Burst fire state (e.g. M16)
            this.burstRemaining = 0;
            this.burstTimer = 0;

            // Locomotion animation.  The gait is advanced from actual travelled
            // distance after collision resolution, so a blocked player never
            // appears to run in place.  Keep legAngle public for footprints and
            // other existing consumers, but the sprite itself stays aim-stable.
            this.legAngle = 0;
            this.legPhase = 0;
            this.gaitHeading = 0;
            this.gaitMoving = false;
            this.bodyBob = 0;

            // Ground Execution Sequence State
            this.executionTarget = null;
            this.executionTimer = 0;
            this.executionTotalTime = 1.2 * (this.perks.executionTimeMult || 1);
            this.executionStep = 0;
            this.executionMaxSteps = 3;

            // Score & Combos
            this.score = 0;
            this.combo = 0;
            this.comboTimer = 0;
            this.comboMaxTime = 3.5 * (this.perks.comboTimeMult || 1);

            // Death animation
            this.deathTimer = 0;
        }

        _applyMaskPerks() {
            this.baseSpeed = 220 * (this.perks.speedMult || 1);
            // Brandon (Panther): +30% movement speed
            if (this.mask === 'BRANDON') {
                this.baseSpeed = 285;
            }
        }

        /**
         * Resets player state for instant respawn.
         * @param {number} startX 
         * @param {number} startY 
         */
        respawn(startX, startY) {
            this.x = startX;
            this.y = startY;
            this.vx = 0;
            this.vy = 0;
            this.isAlive = true;
            this.state = 'IDLE';
            this.isInvulnerable = false;
            this.currentWeapon = this.mask === 'DENNIS' ? WEAPON_TYPES.KNIFE : WEAPON_TYPES.FISTS;
            this.ammo = 0;
            if(this.character){this.currentWeapon=WEAPON_TYPES[this.perks.startWeapon];this.ammo=this.perks.startAmmo;}
            this.attackCooldown = 0;
            this.burstRemaining = 0;
            this.recoilOffset = 0;
            this.executionTarget = null;
            this.executionTimer = 0;
            this.deathTimer = 0;
            this.combo = 0;
            this.legAngle = 0;
            this.legPhase = 0;
            this.gaitHeading = 0;
            this.gaitMoving = false;
            this.bodyBob = 0;
        }

        // ==================== MAIN UPDATE LOOP ====================

        /**
         * Main player update loop.
         * @param {number} dt 
         * @param {Object} input InputManager instance
         * @param {Array<Object>} obstacles Walls and doors
         * @param {Array<Object>} enemies Enemy AI instances
         * @param {Array<Object>} floorWeapons Dropped weapon instances
         * @param {Array<Object>} bullets Active bullet projectile list
         * @param {Object} effects Gore & effects manager
         * @param {Object} camera Dynamic camera instance
         */
        update(dt = 1 / 60, input = null, obstacles = [], enemies = [], floorWeapons = [], bullets = [], effects = null, camera = null, processActions = true) {
            dt = typeof dt === 'number' && !isNaN(dt) ? Math.min(Math.max(dt, 0.0001), 0.1) : 1 / 60;

            // Update Combo Timer
            if (this.comboTimer > 0) {
                this.comboTimer -= dt;
                if (this.comboTimer <= 0) {
                    this.combo = 0;
                }
            }

            // If dead, update death animation and handle restart
            if (!this.isAlive) {
                this.state = 'DEAD';
                this.deathTimer += dt;
                return;
            }

            // Handle Active Ground Execution
            if (this.state === 'EXECUTING') {
                this._updateExecution(dt, effects, camera);
                return;
            }

            // 1. Aim Angle towards Mouse
            if (input && typeof input.getAimAngle === 'function') {
                const aimAngle = input.getAimAngle(this.x, this.y);
                if (typeof aimAngle === 'number' && !isNaN(aimAngle)) {
                    this.angle = aimAngle;
                }
            }

            // 2. 8-Directional Movement Input & Physics
            const movementStartX = this.x;
            const movementStartY = this.y;
            const move = input && typeof input.getMovementVector === 'function' ? input.getMovementVector() : { x: 0, y: 0, length: 0 };
            if (move.length > 0) {
                const targetVx = move.x * this.baseSpeed;
                const targetVy = move.y * this.baseSpeed;

                this.vx += (targetVx - this.vx) * Math.min(1, this.accel * dt / this.baseSpeed);
                this.vy += (targetVy - this.vy) * Math.min(1, this.accel * dt / this.baseSpeed);

                this.state = 'WALK';

            } else {
                this.vx *= Math.pow(this.friction, dt * 60);
                this.vy *= Math.pow(this.friction, dt * 60);
                if (Math.hypot(this.vx, this.vy) < 10) {
                    this.vx = 0;
                    this.vy = 0;
                    this.state = 'IDLE';
                }
            }

            // Apply movement & resolve wall collisions
            if (ColSystem) ColSystem.moveCircle(this, obstacles, dt);
            else { this.x += this.vx * dt; this.y += this.vy * dt; }


            // Drive the gait from displacement after collision resolution.  This
            // keeps feet planted against walls and makes strafing/backpedalling
            // visually stable instead of rotating the whole lower body every
            // frame from the input vector.
            const travelledX = this.x - movementStartX;
            const travelledY = this.y - movementStartY;
            const travelled = Math.hypot(travelledX, travelledY);
            this.gaitMoving = travelled > 0.18;
            if (this.gaitMoving) {
                const travelAngle = Math.atan2(travelledY, travelledX);
                this.legAngle = travelAngle;
                let headingDelta = travelAngle - this.gaitHeading;
                while (headingDelta > Math.PI) headingDelta -= Math.PI * 2;
                while (headingDelta < -Math.PI) headingDelta += Math.PI * 2;
                this.gaitHeading += headingDelta * Math.min(1, dt * 12);
                // One restrained alternating step per roughly 115 px of travel.
                this.legPhase += travelled * 0.055;
                this.bodyBob = Math.sin(this.legPhase * 2) * 0.65;
            } else {
                this.bodyBob *= Math.pow(0.04, dt * 60);
                if (Math.abs(this.bodyBob) < 0.01) this.bodyBob = 0;
            }

            // 3. Timers & Cooldowns
            if (this.attackCooldown > 0) {
                this.attackCooldown = Math.max(0, this.attackCooldown - dt);
            }
            if (this.recoilOffset > 0) {
                this.recoilOffset = Math.max(0, this.recoilOffset - dt * 25);
            }
            if (this.swingAnimationTimer > 0) {
                this.swingAnimationTimer = Math.max(0, this.swingAnimationTimer - dt);
            }

            // 4. Handle M16 Burst Fire Queuing
            if (this.burstRemaining > 0) {
                this.burstTimer -= dt;
                if (this.burstTimer <= 0) {
                    this._fireBullet(bullets, effects, camera);
                    this.burstRemaining--;
                    this.burstTimer = this.currentWeapon.burstInterval || 0.07;
                }
            }

            if (processActions) {
                // 5. Check Ground Executions (if enemies list provided)
                if (enemies && Array.isArray(enemies) && enemies.length > 0) {
                    const downedEnemy = this._findNearbyDownedEnemy(enemies, 38);
                    if (downedEnemy && input && typeof input.isExecuteJustPressed === 'function' && input.isExecuteJustPressed()) {
                        this._startExecution(downedEnemy, effects, camera);
                        return;
                    }
                }

                // 6. Right Click / Pickup / Throw (if floorWeapons list provided)
                if (floorWeapons && Array.isArray(floorWeapons)) {
                    if (input && typeof input.isThrowOrPickupJustPressed === 'function' && input.isThrowOrPickupJustPressed()) {
                        this._handleThrowOrPickup(floorWeapons, enemies, effects, camera);
                    }
                }

                // 7. Left Click / Trigger Attack (if bullets array provided)
                if (bullets && Array.isArray(bullets)) {
                    const wantsToAttack = input ? (this.currentWeapon.automatic ? (typeof input.isAttackDown === 'function' && input.isAttackDown()) : (typeof input.isAttackJustPressed === 'function' && input.isAttackJustPressed())) : false;
                    if (wantsToAttack && this.attackCooldown <= 0 && this.burstRemaining <= 0) {
                        this._performAttack(bullets, enemies, effects, camera);
                    }
                }
            }
        }

        // ==================== COMBAT ACTIONS ====================

        _performAttack(bullets, enemies, effects, camera) {
            if (this.currentWeapon.isGun) {
                // Out of ammo: Dry fire click
                if (this.ammo <= 0) {
                    if (AudioManager) AudioManager.playDryFire();
                    this.attackCooldown = 0.25;
                    return;
                }

                // Check burst fire (M16)
                if (this.currentWeapon.burstCount > 1) {
                    this.burstRemaining = this.currentWeapon.burstCount;
                    this.burstTimer = 0; // Fire first immediately
                    this.attackCooldown = this.currentWeapon.cooldown * (this.currentWeapon.isGun ? (this.perks.gunCooldownMult || 1) : 1);
                } else {
                    // Single shot / Shotgun / Uzi
                    this._fireBullet(bullets, effects, camera);
                    this.attackCooldown = this.currentWeapon.cooldown * (this.currentWeapon.isGun ? (this.perks.gunCooldownMult || 1) : 1);
                }
            } else {
                // Melee Swing / Stab / Punch
                this._performMeleeAttack(enemies, effects, camera);
                this.attackCooldown = this.currentWeapon.cooldown * (this.currentWeapon.isGun ? (this.perks.gunCooldownMult || 1) : 1);
            }
        }

        _fireBullet(bullets, effects, camera) {
            if (this.ammo <= 0) return;
            this.ammo--;

            const w = this.currentWeapon;
            const pellets = w.pellets || 1;

            // Recoil & Screen Shake
            this.recoilOffset = 6;
            if (camera && typeof camera.addTrauma === 'function') {
                camera.addTrauma(w.screenShake || 0.2);
            }

            // Gunshot Audio & Acoustic Event
            if (AudioManager) {
                AudioManager.playGunshot(w.id, this.x, this.y);
            }

            // Barrel tip position for muzzle flash and bullet origin
            const barrelLen = (w.length || 20) + 10;
            const muzzleX = this.x + Math.cos(this.angle) * barrelLen;
            const muzzleY = this.y + Math.sin(this.angle) * barrelLen;

            // Muzzle flash & Shell casing
            if (effects) {
                effects.spawnMuzzleFlash(muzzleX, muzzleY, this.angle, pellets > 1 ? 26 : 18);
                effects.spawnShellCasing(this.x, this.y, this.angle);
            }

            // Spawn Projectile(s)
            for (let i = 0; i < pellets; i++) {
                const spreadAngle = (Math.random() - 0.5) * (w.spread || 0.05) * (this.perks.spreadMult || 1);
                const bulletAngle = this.angle + spreadAngle;
                bullets.push(new Bullet(muzzleX, muzzleY, bulletAngle, w, true));
            }
        }

        _performMeleeAttack(enemies, effects, camera) {
            const w = this.currentWeapon;
            this.swingAnimationTimer = this.swingAnimationDuration;

            // Swing whoosh sound
            if (AudioManager) {
                AudioManager.playMeleeSwing(w.id);
            }

            // Spawn slashing visual trail
            if (effects) {
                const startAngle = this.angle - w.arc * 0.5;
                const trailColor = w.id === 'KATANA' ? 'rgba(0, 255, 255, 0.85)' : (w.id === 'KNIFE' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 200, 50, 0.7)');
                effects.spawnMeleeTrail(this.x, this.y, startAngle, w.arc, this._meleeRange(w), trailColor);
            }

            // Check hit against enemies in swing arc
            let hitEnemy = false;
            if (enemies && enemies.length > 0) {
                for (let i = 0; i < enemies.length; i++) {
                    const enemy = enemies[i];
                    if (!enemy || enemy.state === 'DEAD') continue;

                    const inCone = ColSystem.circleInCone(
                        enemy.x, enemy.y, enemy.radius || 14,
                        this.x, this.y, this.angle, w.arc, this._meleeRange(w)
                    );

                    if (inCone) {
                        hitEnemy = true;
                        const hitAngle = Math.atan2(enemy.y - this.y, enemy.x - this.x);

                        // Mask Perk: Tony (Tiger) turns fists into instant lethal strikes
                        const isLethal = w.isLethalMelee || (this.mask === 'TONY' && w.id === 'FISTS');

                        if (typeof enemy.takeHit === 'function') {
                            enemy.takeHit({
                                type: 'MELEE',
                                damage: (this.mask === 'TONY' && w.id === 'FISTS') ? 2 : w.damage,
                                isLethal: isLethal,
                                knockdown: !isLethal,
                                angle: hitAngle,
                                hitX: enemy.x,
                                hitY: enemy.y,
                                weaponType: w.id
                            });
                        }

                        if (AudioManager) AudioManager.playMeleeHit(isLethal, w.id);
                        if (camera && typeof camera.addTrauma === 'function') camera.addTrauma(isLethal ? 0.35 : 0.22);
                        if (effects) {
                            effects.spawnBlood(enemy.x, enemy.y, hitAngle, isLethal ? 18 : 6);
                            if (isLethal) {
                                this.addScore(400, 'EXECUTION KILL');
                            }
                        }

                        // Katana and Axe can hit multiple enemies; fists/knife hit one target
                        if (w.id !== 'KATANA' && w.id !== 'AXE') {
                            break;
                        }
                    }
                }
            }
        }

        // ==================== WEAPON THROWING & FLOOR PICKUP ====================

        _handleThrowOrPickup(floorWeapons, enemies, effects, camera) {
            if (!floorWeapons || !Array.isArray(floorWeapons)) return;

            // 1. Search for nearest floor weapon in pickup radius
            let closestWeapon = null;
            let minDist = 48; // Pickup radius

            for (let i = 0; i < floorWeapons.length; i++) {
                const fw = floorWeapons[i];
                if (!fw || fw.isFlying) continue;

                const dist = Math.hypot(this.x - fw.x, this.y - fw.y);
                if (dist < minDist) {
                    minDist = dist;
                    closestWeapon = fw;
                }
            }

            // If hovering near a floor weapon: Pick Up & Swap
            if (closestWeapon) {
                // Drop current weapon if not fists
                if (this.currentWeapon.id !== 'FISTS') {
                    const dropped = new FloorWeapon(this.x, this.y, this.currentWeapon, this.ammo, this.angle);
                    floorWeapons.push(dropped);
                }

                // Equip floor weapon
                this.currentWeapon = closestWeapon.def;
                this.ammo = closestWeapon.ammo;

                if(this.currentWeapon.isGun&&this.perks.ammoCapacityMult)this.ammo=Math.min(this.ammo,Math.floor(this.currentWeapon.maxAmmo*this.perks.ammoCapacityMult));
                // Bonus ammo if Aubrey (Pig) mask
                if (this.mask === 'AUBREY' && this.currentWeapon.isGun) {
                    this.ammo = Math.min(this.currentWeapon.maxAmmo, Math.round(this.ammo * 1.5));
                }

                // Remove picked weapon from floor
                const index = floorWeapons.indexOf(closestWeapon);
                if (index !== -1) floorWeapons.splice(index, 1);

                if (AudioManager) AudioManager.playWeaponPickup();
                return;
            }

            // 2. If holding a weapon, throw it forward towards cursor
            if (this.currentWeapon.id !== 'FISTS') {
                const thrown = new FloorWeapon(this.x, this.y, this.currentWeapon, this.ammo, this.angle);
                thrown.throw(this.x, this.y, this.angle, 'player', 1560);
                floorWeapons.push(thrown);

                // Revert player to FISTS
                this.currentWeapon = WEAPON_TYPES.FISTS;
                this.ammo = 0;
                this.attackCooldown = 0.20;

                if (AudioManager) AudioManager.playMeleeSwing('FISTS');
            }
        }

        // ==================== BRUTAL GROUND EXECUTIONS ====================

        _findNearbyDownedEnemy(enemies, range = 38) {
            if (!enemies || !Array.isArray(enemies)) return null;
            for (let i = 0; i < enemies.length; i++) {
                const enemy = enemies[i];
                if (!enemy || enemy.state !== 'KNOCKED_DOWN') continue;

                const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y);
                if (dist < range) {
                    return enemy;
                }
            }
            return null;
        }

        _startExecution(enemy, effects, camera) {
            this.state = 'EXECUTING';
            this.isInvulnerable = true;
            this.executionTarget = enemy;
            this.executionTimer = 0;
            this.executionStep = 0;

            // Snap player over enemy
            this.x = enemy.x;
            this.y = enemy.y;
            this.angle = enemy.angle || this.angle;
            this.vx = 0;
            this.vy = 0;

            // Inform enemy of execution lock
            if (typeof enemy.onExecutionStart === 'function') {
                enemy.onExecutionStart(this);
            }

            if (camera && typeof camera.addTrauma === 'function') camera.addTrauma(0.3);
        }

        _updateExecution(dt, effects, camera) {
            if (!this.executionTarget || this.executionTarget.state === 'DEAD') {
                this._finishExecution();
                return;
            }

            this.executionTimer += dt;
            const stepDuration = this.executionTotalTime / (this.executionMaxSteps + .4);

            // Step progression (e.g. 3 brutal punches or weapon smashes)
            const currentStepIndex = Math.floor(this.executionTimer / stepDuration);
            if (currentStepIndex > this.executionStep && this.executionStep < this.executionMaxSteps) {
                this.executionStep = currentStepIndex;

                // Play brutal impact sound
                if (AudioManager) AudioManager.playExecutionHit(this.executionStep);
                if (camera && typeof camera.addTrauma === 'function') camera.addTrauma(0.35);

                // Spawn gore & arterial spray
                if (effects) {
                    effects.spawnBlood(this.x, this.y, this.angle + (Math.random() - 0.5), 14);
                    if (this.executionStep === this.executionMaxSteps) {
                        effects.spawnArterialSpurt(this.x, this.y, this.angle);
                        effects.spawnBloodPool(this.x, this.y, 30);
                    }
                }
            }

            // Finish execution
            if (this.executionTimer >= this.executionTotalTime) {
                const completedTarget = this.executionTarget;
                if (completedTarget && typeof completedTarget.die === 'function') {
                    completedTarget.die({ type: 'EXECUTION', angle: this.angle });
                }

                this.addScore(1000, '+1000 EXECUTION!');
                if (effects) {
                    effects.spawnFloatingText('+1000 EXECUTION!', this.x, this.y - 20, '#ff0055', 1.3);
                }

                if (typeof this.onExecutionComplete === 'function') {
                    this.onExecutionComplete(completedTarget);
                }
                this._finishExecution();
            }
        }

        _finishExecution() {
            this.state = 'IDLE';
            this.isInvulnerable = false;
            this.executionTarget = null;
            this.executionTimer = 0;
            this.executionStep = 0;
            this.attackCooldown = 0.25;
        }

        attack(targetX, targetY) {
            if (!this.isAlive || this.attackCooldown > 0) return null;
            if (this.state === 'EXECUTING') return null;

            const w = this.currentWeapon || WEAPON_TYPES.FISTS;

            if (w.isGun) {
                if (this.ammo <= 0) {
                    this.attackCooldown = 0.25;
                    return { type: 'DRY_FIRE' };
                }

                this.ammo--;
                this.attackCooldown = (w.cooldown || 0.2) * (this.perks.gunCooldownMult || 1);
                const pellets = w.pellets || 1;
                const barrelLen = (w.length || 20) + 10;
                const muzzleX = this.x + Math.cos(this.angle) * barrelLen;
                const muzzleY = this.y + Math.sin(this.angle) * barrelLen;
                const spawnedBullets = [];

                const BulletClass = Bullet || (WeaponSystem ? WeaponSystem.Bullet : null) || (typeof window !== 'undefined' ? window.Bullet : null);

                for (let i = 0; i < pellets; i++) {
                    const spreadAngle = (Math.random() - 0.5) * (w.spread || 0.05) * (this.perks.spreadMult || 1);
                    const finalAngle = this.angle + spreadAngle;
                    if (BulletClass) {
                        spawnedBullets.push(new BulletClass(muzzleX, muzzleY, finalAngle, w, 'player'));
                    }
                }

                return {
                    type: 'GUN_FIRED',
                    weaponId: w.id,
                    trauma: w.screenShake || 0.3,
                    flashX: muzzleX,
                    flashY: muzzleY,
                    flashAngle: this.angle,
                    color: w.flashColor || '#ffffaa',
                    shellX: this.x,
                    shellY: this.y,
                    shellType: w.shellType || 'brass',
                    bullets: spawnedBullets,
                    isSilent: w.isSilent || false,
                    soundRadius: w.soundRadius || (w.isSilent ? 60 : 700)
                };
            } else {
                this.attackCooldown = w.cooldown || 0.3;
                this.swingAnimationTimer = 0.18;
                return {
                    type: 'MELEE_SWING',
                    weaponId: w.id,
                    range: this._meleeRange(w),
                    arc: w.arc || Math.PI * 0.5,
                    angle: this.angle,
                    damage: w.damage || 1,
                    isLethal: w.isLethalMelee === true || (this.mask === 'TONY' && w.id === 'FISTS'),
                    knockdownDuration: w.knockdownDuration || 4.5
                };
            }
        }

        equipWeapon(weaponType, ammo = null) {
            let wDef = WEAPON_TYPES.FISTS;
            if (WeaponSystem && typeof WeaponSystem.getWeaponType === 'function') {
                wDef = WeaponSystem.getWeaponType(weaponType);
            } else if (typeof window !== 'undefined' && window.WeaponSystem && typeof window.WeaponSystem.getWeaponType === 'function') {
                wDef = window.WeaponSystem.getWeaponType(weaponType);
            } else if (typeof weaponType === 'string') {
                const k = weaponType.toUpperCase();
                wDef = WEAPON_TYPES[k] || WEAPON_TYPES.BAT;
            } else if (weaponType && weaponType.id) {
                wDef = weaponType;
            }

            this.currentWeapon = wDef;
            this.ammo = ammo !== null ? ammo : (wDef.isGun ? (wDef.maxAmmo || 12) : 0);
            if(wDef.isGun&&this.perks.ammoCapacityMult)this.ammo=Math.min(this.ammo,Math.floor(wDef.maxAmmo*this.perks.ammoCapacityMult));
            if (this.mask === 'AUBREY' && wDef.isGun) {
                this.ammo = Math.min(wDef.maxAmmo || 60, Math.round(this.ammo * 1.5));
            }
        }

        _meleeRange(weapon) {
            const base = weapon.range || 42;
            return base * (['FISTS', 'UNARMED'].includes(String(weapon.id).toUpperCase()) ? 1 : 1.2);
        }

        throwWeapon(targetX, targetY) {
            if (this.currentWeapon.id === 'FISTS' || this.currentWeapon.id === 'unarmed') return null;
            const oldWeapon = this.currentWeapon;
            const oldAmmo = this.ammo;
            const FWClass = FloorWeapon || (WeaponSystem ? WeaponSystem.FloorWeapon : null) || (typeof window !== 'undefined' ? window.FloorWeapon : null);
            if (!FWClass) return null;

            const thrown = new FWClass(this.x, this.y, oldWeapon, oldAmmo, this.angle);
            this.currentWeapon = WEAPON_TYPES.FISTS;
            this.ammo = 0;
            this.attackCooldown = 0.25;
            if (thrown.throw) {
                thrown.throw(this.x, this.y, this.angle, 'player', 1560);
            }
            return thrown;
        }

        startExecution(enemy) {
            this._startExecution(enemy, null, null);
        }

        stepInBlood(bloodSystem) {
            if (!bloodSystem) return;
            const id = 'player';
            if (bloodSystem.activeFootsteps && !bloodSystem.activeFootsteps.has(id) && typeof bloodSystem.triggerBloodySteps === 'function') {
                bloodSystem.triggerBloodySteps(id, 12);
            }
            if (typeof bloodSystem.updateCharacterFootprint === 'function') {
                bloodSystem.updateCharacterFootprint(id, this.x, this.y, this.legAngle || this.angle);
            } else if (typeof bloodSystem.stampFootprint === 'function') {
                bloodSystem.stampFootprint(this.x, this.y, this.legAngle || this.angle, 0.5);
            }
        }

        // ==================== DAMAGE & DEATH ====================

        /**
         * Handles incoming lethal hit.
         * Hotline Miami standard: 1 hit = instant death.
         */
        takeHit(hitInfo = {}) {
            if (!this.isAlive || this.isInvulnerable) return;

            this.isAlive = false;
            this.state = 'DEAD';
            const hitAngle = typeof hitInfo === 'object' ? (hitInfo.angle || 0) : (typeof hitInfo === 'number' ? hitInfo : 0);
            this.vx = Math.cos(hitAngle) * 160;
            this.vy = Math.sin(hitAngle) * 160;

            const Audio = AudioManager || (typeof window !== 'undefined' ? (window.soundFX || window.soundEffects || window.AudioManager) : null);
            if (Audio && typeof Audio.playDeath === 'function') Audio.playDeath();
            else if (Audio && typeof Audio.playPlayerDeath === 'function') Audio.playPlayerDeath();
        }

        onDoorSlam(door, damage = 80, dirX = 1, dirY = 0) {
            if (!this.isAlive || this.isInvulnerable || !door?.lastKickedBy?.isEnemy) return;
            this.takeHit({ type: 'DOOR_SLAM', damage, angle: Math.atan2(dirY, dirX) });
        }

        kill(type = 'MELEE', angle = 0) {
            this.takeHit({ type, angle });
        }

        addScore(points, label = '') {
            this.combo++;
            this.comboTimer = this.comboMaxTime;
            const multiplier = Math.min(8, this.combo);
            this.score += points * multiplier;
        }

        // ==================== RENDERING ====================

        /**
         * Renders player entity, scissor walking legs, rotating torso, mask, and held weapon.
         * @param {CanvasRenderingContext2D} ctx 
         */
        draw(ctx) {
            const px = typeof this.x === 'number' && !isNaN(this.x) ? this.x : 0;
            const py = typeof this.y === 'number' && !isNaN(this.y) ? this.y : 0;
            ctx.save();
            ctx.translate(px, py);

            // If dead, render death sprite on floor
            if (!this.isAlive) {
                this._drawDeadBody(ctx);
                ctx.restore();
                return;
            }

            // If executing, render mounted execution animation
            if (this.state === 'EXECUTING') {
                this._drawExecutionSprite(ctx);
                ctx.restore();
                return;
            }

            // 1. Compact planted shoes.  The lower body shares the torso's
            // stable aim frame; travel direction only changes the step offsets,
            // so strafing and backpedalling never spin the character.
            ctx.save();
            ctx.rotate(this.angle);
            // Keep the feet slightly behind the torso so they remain visible as
            // two planted shoes instead of disappearing under the jacket.
            this._drawLegs(ctx);
            ctx.restore();

            // 2. Torso, Arms & Weapon (Oriented along aim angle)
            ctx.save();
            ctx.rotate(this.angle);
            ctx.translate(0, this.bodyBob || 0);

            // Apply recoil kickback
            if (this.recoilOffset > 0) {
                ctx.translate(-this.recoilOffset, 0);
            }

            // Compute Melee Swing Animation Phase
            const isSwinging = this.swingAnimationTimer > 0;
            const swingDur = this.swingAnimationDuration || 0.18;
            const swingProgress = isSwinging ? (1.0 - Math.max(0, Math.min(1, this.swingAnimationTimer / swingDur))) : 0;

            // Draw Melee Slash Arc Wave (VFX Trail)
            if (isSwinging) {
                this._drawSlashWave(ctx, swingProgress);
            }

            // Draw Weapon in hands
            this._drawHeldWeapon(ctx, isSwinging, swingProgress);

            // Draw Torso & Arms
            this._drawTorso(ctx, isSwinging, swingProgress);

            // Draw Mask on head
            this._drawMask(ctx, isSwinging, swingProgress);

            ctx.restore();
            ctx.restore();
        }

        _drawSlashWave(ctx, progress) {
            const w = this.currentWeapon;
            if (w && w.isGun) return;

            const weaponId = (w && w.id ? w.id : 'FISTS').toUpperCase();
            ctx.save();

            let radius = 48;
            let sweepAngle = 2.4;
            let color = '#ffffff';
            let glowColor = '#00f3ff';

            if (weaponId.includes('KATANA')) {
                radius = 58;
                color = '#ffffff';
                glowColor = '#00f3ff';
            } else if (weaponId.includes('BAT') || weaponId.includes('PIPE')) {
                radius = 50;
                color = '#fffbe0';
                glowColor = '#ffe600';
            } else if (weaponId.includes('AXE')) {
                radius = 52;
                color = '#ffccd5';
                glowColor = '#ff0055';
            } else if (weaponId.includes('KNIFE')) {
                radius = 38;
                sweepAngle = 1.4;
                color = '#ffffff';
                glowColor = '#00ffff';
            } else {
                // Fists
                radius = 34;
                sweepAngle = 1.3;
                color = '#ffffff';
                glowColor = '#00ffff';
            }

            const startAngle = -1.2;
            const currentAngle = startAngle + sweepAngle * Math.min(1, progress * 1.25);
            const tailAngle = Math.max(startAngle, currentAngle - 1.0);
            const alpha = Math.sin(progress * Math.PI);

            ctx.globalAlpha = alpha * 0.9;
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = 0;

            ctx.beginPath();
            ctx.arc(0, 0, radius, tailAngle, currentAngle, false);
            ctx.arc(0, 0, radius * 0.65, currentAngle, tailAngle, true);
            ctx.closePath();

            const grad = ctx.createRadialGradient(0, 0, radius * 0.6, 0, 0, radius);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
            grad.addColorStop(0.65, glowColor);
            grad.addColorStop(1, color);
            ctx.fillStyle = grad;
            ctx.fill();

            // Sharp blade edge
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, radius, tailAngle + 0.15, currentAngle, false);
            ctx.stroke();

            ctx.restore();
        }

        _drawLegs(ctx) {
            const moving = this.gaitMoving === true;
            const step = moving ? Math.sin(this.legPhase) * 3.2 : 0;
            const travel = (this.gaitHeading || 0) - this.angle;
            const dx = Math.cos(travel) * step;
            const dy = Math.sin(travel) * step;
            const leftLift = moving ? Math.max(0, Math.sin(this.legPhase)) * 0.7 : 0;
            const rightLift = moving ? Math.max(0, Math.sin(this.legPhase + Math.PI)) * 0.7 : 0;

            // Feet stay on their own side of the body.  The small forward/back
            // offsets read as alternating planted steps at the game's pixel
            // scale without the old long scissor limbs.
            const feet = [
                { x: -13.5 + dx, y: -9 + dy, lift: leftLift },
                { x: -13.5 - dx, y: 6 - dy, lift: rightLift }
            ];
            for (const foot of feet) {
                ctx.fillStyle = 'rgba(18, 12, 24, 0.42)';
                ctx.fillRect(foot.x - 2, foot.y - 2, 11, 8);
                ctx.fillStyle = '#191629';
                ctx.fillRect(foot.x - 3, foot.y - 2 - foot.lift, 12, 9);
                ctx.fillStyle = this.character?.look.pants || '#39516b';
                ctx.fillRect(foot.x, foot.y - foot.lift, 8, 6);
                ctx.fillStyle = '#292437';
                ctx.fillRect(foot.x - 2, foot.y - foot.lift, 4, 6);
            }
        }

        _drawTorso(ctx, isSwinging = false, progress = 0) {
            ctx.save();
            const look=this.character?.look;
            if(look)ctx.scale(1,look.build);
            let torsoTwist = 0;
            // Keep the head forward and the hands outside the jacket footprint;
            // this is what makes a tiny top-down actor read as a person rather
            // than a floating mask.
            let leftHandX = 19, leftHandY = -7;
            let rightHandX = 19, rightHandY = 7;
            let leftShoulderX = 5, leftShoulderY = -11;
            let rightShoulderX = 5, rightShoulderY = 11;

            const w = this.currentWeapon;
            const isGun = w && w.isGun;
            const weaponId = (w && w.id ? w.id : 'FISTS').toUpperCase();

            if (isSwinging && !isGun) {
                if (weaponId.includes('KNIFE')) {
                    // Stabbing lunge forward
                    const thrust = Math.sin(progress * Math.PI) * 16;
                    rightHandX += thrust;
                    rightHandY -= 3;
                    rightShoulderX += thrust * 0.3;
                    torsoTwist = Math.sin(progress * Math.PI) * 0.15;
                } else if (weaponId === 'FISTS' || weaponId === 'fists' || weaponId === 'unarmed') {
                    // Rapid alternating punch
                    const punch = Math.sin(progress * Math.PI) * 18;
                    const punchRight = (Math.floor((this.attackCooldown || 0) * 10) % 2 === 0);
                    if (punchRight) {
                        rightHandX += punch;
                        rightShoulderX += punch * 0.3;
                        torsoTwist = Math.sin(progress * Math.PI) * 0.2;
                    } else {
                        leftHandX += punch;
                        leftShoulderX += punch * 0.3;
                        torsoTwist = -Math.sin(progress * Math.PI) * 0.2;
                    }
                } else {
                    // Slashing swing (Katana, Bat, Pipe, Axe)
                    const swingAngle = -1.15 + progress * 2.35;
                    torsoTwist = swingAngle * 0.4;

                    const swingRadius = 16;
                    rightHandX = 4 + Math.cos(swingAngle) * swingRadius;
                    rightHandY = Math.sin(swingAngle) * swingRadius;

                    leftHandX = rightHandX - Math.cos(swingAngle) * 6;
                    leftHandY = rightHandY - Math.sin(swingAngle) * 6;

                    rightShoulderX = 4 + Math.cos(swingAngle * 0.5) * 3;
                    rightShoulderY = 8 + Math.sin(swingAngle * 0.5) * 3;
                }
            }

            ctx.rotate(torsoTwist);

            // Same connected shoulder / neck proportions as the human enemies.
            ctx.strokeStyle = '#1c1325';
            ctx.lineWidth = 3;
            ctx.lineJoin = 'miter';
            ctx.fillStyle = look?.coat || '#986048';
            ctx.beginPath();
            if (look?.dress) {
                // Unified dress silhouette: bodice curves naturally into rounded wrap skirt over thighs
                ctx.moveTo(-22, 0);
                ctx.lineTo(-21.5, -6);
                ctx.lineTo(-19.5, -11.5);
                ctx.lineTo(-15.5, -15);
                ctx.lineTo(-9, -16);
                ctx.lineTo(9, -16);
                ctx.lineTo(14, -9);
                ctx.lineTo(14, 9);
                ctx.lineTo(9, 16);
                ctx.lineTo(-9, 16);
                ctx.lineTo(-15.5, 15);
                ctx.lineTo(-19.5, 11.5);
                ctx.lineTo(-21.5, 6);
                ctx.closePath();
            } else {
                ctx.moveTo(-16,-11); ctx.lineTo(-8,-16); ctx.lineTo(9,-16);
                ctx.lineTo(14,-9); ctx.lineTo(14,9); ctx.lineTo(9,16);
                ctx.lineTo(-8,16); ctx.lineTo(-16,11); ctx.closePath();
            }
            ctx.fill(); ctx.stroke();
            if (!look?.dress && (!this.character || typeof CharacterArt?.torsoDetails !== 'function')) {
                ctx.fillStyle = look?.shade || '#653c40'; ctx.fillRect(-14,-9,5,18);
                ctx.fillStyle = look?.accent || '#c48a5c'; ctx.fillRect(-7,-10,9,20);
            }
            // Cream sleeves are narrow connected limbs, not oversized squares.
            ctx.lineCap = 'square';
            for (const [sx,sy,hx,hy] of [
                [leftShoulderX,leftShoulderY,leftHandX,leftHandY],
                [rightShoulderX,rightShoulderY,rightHandX,rightHandY]
            ]) {
                ctx.strokeStyle = '#1c1325'; ctx.lineWidth = 10;
                ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(hx-3,hy); ctx.stroke();
                ctx.strokeStyle = look?.coat || '#d8ceb2'; ctx.lineWidth = 6; ctx.stroke();
                ctx.fillStyle = look?.skin || '#e6b28b'; ctx.fillRect(hx-2,hy-3,6,6);
                ctx.strokeStyle = '#1c1325'; ctx.lineWidth = 2;
                ctx.strokeRect(hx-2,hy-3,6,6);
            }
            if (this.character && CharacterArt && typeof CharacterArt.torsoDetails === 'function') {
                CharacterArt.torsoDetails(ctx, this.character, isSwinging, progress);
            } else {
                ctx.fillStyle = '#251b29'; ctx.fillRect(0,-7,13,14);
            }

            ctx.restore();
        }

        _drawHeldWeapon(ctx, isSwinging = false, progress = 0) {
            const w = this.currentWeapon;
            if (!w || w.id === 'FISTS' || w.id === 'fists' || w.id === 'unarmed') return;

            const isGun = w.isGun;
            const weaponId = (w.id || '').toUpperCase();
            const len = w.length || 18;
            const wid = w.width || 6;

            ctx.save();

            if (isSwinging && !isGun) {
                if (weaponId.includes('KNIFE')) {
                    const thrust = Math.sin(progress * Math.PI) * 16;
                    ctx.translate(18 + thrust, 1);
                    ctx.rotate(Math.sin(progress * Math.PI) * 0.1);
                } else {
                    const swingAngle = -1.15 + progress * 2.35;
                    const swingRadius = 16;
                    const hx = 4 + Math.cos(swingAngle) * swingRadius;
                    const hy = Math.sin(swingAngle) * swingRadius;

                    ctx.translate(hx, hy);
                    ctx.rotate(swingAngle + 0.35);
                }
            } else {
                // Project the held weapon beyond the hands so it remains a
                // readable aiming line at normal gameplay zoom.
                ctx.translate(18, 2);
            }

            if (typeof drawWeaponSprite === 'function') {
                drawWeaponSprite(ctx, w.id, len, wid, true);
            } else if (typeof window !== 'undefined' && typeof window.drawWeaponSprite === 'function') {
                window.drawWeaponSprite(ctx, w.id, len, wid, true);
            } else {
                ctx.fillStyle = w.spriteColor || '#ffffff';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1;
                ctx.fillRect(0, -wid * 0.5, len, wid);
                ctx.strokeRect(0, -wid * 0.5, len, wid);
            }

            ctx.restore();
        }

        _drawMask(ctx, isSwinging = false, progress = 0) {
            if(this.character&&CharacterArt){ctx.save();ctx.translate(6,0);CharacterArt.head(ctx,this.character);ctx.restore();return;}
            ctx.save();
            // HM2's mask is a small forward-facing accent over a broad human
            // silhouette.  The previous full-size mask hid the shoulders and
            // read as a white square at the game's 3x pixel reduction.
            ctx.translate(9, 0);
            ctx.fillStyle = '#251b29';
            ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
            ctx.scale(0.85, 0.85);

            if (isSwinging) {
                ctx.rotate((-0.8 + progress * 1.6) * 0.25);
            }

            const m = (this.mask || 'RICHARD').toUpperCase();

            if (m.includes('TONY') || m.includes('TIGER')) {
                // TONY (Tiger): Orange head, white cheeks, black stripes, ears, whiskers, pink nose
                ctx.fillStyle = '#e67e22';
                ctx.beginPath();
                ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
                ctx.fill();

                // White jaw/cheeks
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.ellipse(3, 0, 5, 6, 0, 0, Math.PI * 2);
                ctx.fill();

                // Pointed ears with black tips
                ctx.fillStyle = '#d35400';
                ctx.beginPath();
                ctx.moveTo(-4, -8); ctx.lineTo(-1, -12); ctx.lineTo(2, -7); ctx.fill();
                ctx.moveTo(-4, 8); ctx.lineTo(-1, 12); ctx.lineTo(2, 7); ctx.fill();
                ctx.fillStyle = '#111111';
                ctx.fillRect(-2, -12, 2, 3);
                ctx.fillRect(-2, 9, 2, 3);

                // Black tiger stripes across crown
                ctx.fillStyle = '#111111';
                ctx.fillRect(-5, -5, 6, 1.8);
                ctx.fillRect(-3, -2, 5, 1.8);
                ctx.fillRect(-3, 2, 5, 1.8);
                ctx.fillRect(-5, 5, 6, 1.8);

                // Pink nose & whiskers
                ctx.fillStyle = '#ff7675';
                ctx.beginPath();
                ctx.moveTo(6, -2); ctx.lineTo(8, 0); ctx.lineTo(6, 2); ctx.fill();
            } else if (m.includes('BRANDON') || m.includes('PANTHER')) {
                // BRANDON (Panther): Midnight black sleek head, pointed feline ears, piercing neon-yellow slit eyes
                ctx.fillStyle = '#17202a';
                ctx.beginPath();
                ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
                ctx.fill();

                // Pointed panther ears
                ctx.fillStyle = '#0e1726';
                ctx.beginPath();
                ctx.moveTo(-4, -8); ctx.lineTo(-1, -12); ctx.lineTo(2, -7); ctx.fill();
                ctx.moveTo(-4, 8); ctx.lineTo(-1, 12); ctx.lineTo(2, 7); ctx.fill();

                // Glowing yellow feline eyes
                ctx.fillStyle = '#f1c40f';
                ctx.fillRect(2, -5, 3, 2);
                ctx.fillRect(2, 3, 3, 2);
                ctx.fillStyle = '#111111';
                ctx.fillRect(3, -5, 1, 2);
                ctx.fillRect(3, 3, 1, 2);

                // Muzzle & nose
                ctx.fillStyle = '#2c3e50';
                ctx.fillRect(5, -2, 3, 4);
            } else if (m.includes('AUBREY') || m.includes('PIG')) {
                // AUBREY (Pig): Flesh-pink head, flattened snout with nostrils, floppy folded ears
                ctx.fillStyle = '#fab1a0';
                ctx.beginPath();
                ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
                ctx.fill();

                // Floppy folded ears
                ctx.fillStyle = '#e17055';
                ctx.beginPath();
                ctx.moveTo(-4, -8); ctx.lineTo(-6, -11); ctx.lineTo(0, -8); ctx.fill();
                ctx.moveTo(-4, 8); ctx.lineTo(-6, 11); ctx.lineTo(0, 8); ctx.fill();

                // Wide Pig Snout
                ctx.fillStyle = '#ff7675';
                ctx.beginPath();
                ctx.ellipse(6, 0, 4.5, 3.5, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#d63031';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Dark Nostrils
                ctx.fillStyle = '#2d3436';
                ctx.fillRect(7, -1.8, 1.5, 1.5);
                ctx.fillRect(7, 0.5, 1.5, 1.5);

                // Beady eyes
                ctx.fillRect(2, -4, 2, 2);
                ctx.fillRect(2, 2, 2, 2);
            } else if (m.includes('DENNIS') || m.includes('WOLF')) {
                // DENNIS (Wolf): Grey furry wolf head with sharp snout, wolf ears and fangs
                ctx.fillStyle = '#7f8c8d';
                ctx.beginPath();
                ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
                ctx.fill();

                // Pointed wolf ears
                ctx.fillStyle = '#34495e';
                ctx.beginPath();
                ctx.moveTo(-4, -8); ctx.lineTo(-1, -13); ctx.lineTo(3, -7); ctx.fill();
                ctx.moveTo(-4, 8); ctx.lineTo(-1, 13); ctx.lineTo(3, 7); ctx.fill();

                // Dark snout
                ctx.fillStyle = '#2c3e50';
                ctx.beginPath();
                ctx.moveTo(3, -3); ctx.lineTo(9, 0); ctx.lineTo(3, 3); ctx.fill();

                // Amber eyes
                ctx.fillStyle = '#f39c12';
                ctx.fillRect(2, -4.5, 2.5, 2);
                ctx.fillRect(2, 2.5, 2.5, 2);
            } else if (m.includes('RASMUS') || m.includes('OWL')) {
                // RASMUS (Owl): Amber/brown feathers, large circular hypnotic yellow eyes, hooked beak
                ctx.fillStyle = '#a0522d';
                ctx.beginPath();
                ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
                ctx.fill();

                // Giant yellow owl eyes with black pupils
                ctx.fillStyle = '#f1c40f';
                ctx.beginPath();
                ctx.arc(3, -4, 3.5, 0, Math.PI * 2);
                ctx.arc(3, 4, 3.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#111111';
                ctx.beginPath();
                ctx.arc(4, -4, 1.8, 0, Math.PI * 2);
                ctx.arc(4, 4, 1.8, 0, Math.PI * 2);
                ctx.fill();

                // Hooked beak
                ctx.fillStyle = '#5d4037';
                ctx.beginPath();
                ctx.moveTo(5, -1.5); ctx.lineTo(9, 0); ctx.lineTo(5, 1.5); ctx.fill();
            } else if (m.includes('TED') || m.includes('DOG')) {
                // TED (Dog): Golden retriever tan head with floppy brown ears, black nose
                ctx.fillStyle = '#d4ac0d';
                ctx.beginPath();
                ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
                ctx.fill();

                // Floppy drooping ears
                ctx.fillStyle = '#7d6608';
                ctx.beginPath();
                ctx.ellipse(-2, -9, 4, 6, 0.4, 0, Math.PI * 2);
                ctx.ellipse(-2, 9, 4, 6, -0.4, 0, Math.PI * 2);
                ctx.fill();

                // Snout & black nose
                ctx.fillStyle = '#f4d03f';
                ctx.fillRect(3, -3, 4, 6);
                ctx.fillStyle = '#111111';
                ctx.fillRect(7, -1.5, 2.5, 3);
            } else if (m.includes('DON_JUAN') || m.includes('HORSE')) {
                // DON JUAN (Horse): Elongated brown horse head, black mane, white blaze
                ctx.fillStyle = '#784212';
                ctx.beginPath();
                ctx.ellipse(3, 0, 11, 6, 0, 0, Math.PI * 2);
                ctx.fill();

                // Black mane on crest
                ctx.fillStyle = '#111111';
                ctx.fillRect(-6, -2, 8, 4);

                // White blaze
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, -1.5, 8, 3);

                // Muzzle & nostrils
                ctx.fillStyle = '#4a2305';
                ctx.fillRect(10, -2.5, 4, 5);
            } else {
                // RICHARD (Rooster): White feathered head, yellow beak, vibrant crimson-red comb, red wattle, eyes
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(0, 0, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#bdc3c7';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Crimson Rooster Comb with 3 serrated bumps on crest
                ctx.fillStyle = '#c0392b';
                ctx.beginPath();
                ctx.arc(-4, -6, 2.5, 0, Math.PI * 2);
                ctx.arc(0, -7, 3, 0, Math.PI * 2);
                ctx.arc(4, -5, 2.5, 0, Math.PI * 2);
                ctx.fill();

                // Yellow sharp Beak
                ctx.fillStyle = '#f39c12';
                ctx.beginPath();
                ctx.moveTo(6, -2.5);
                ctx.lineTo(12, 0);
                ctx.lineTo(6, 2.5);
                ctx.closePath();
                ctx.fill();

                // Red Wattle below chin
                ctx.fillStyle = '#e74c3c';
                ctx.beginPath();
                ctx.ellipse(5, 3.5, 2, 3, 0.3, 0, Math.PI * 2);
                ctx.fill();

                // Black bead eyes
                ctx.fillStyle = '#111111';
                ctx.fillRect(3, -4, 2, 2);
                ctx.fillRect(3, 2, 2, 2);
            }

            ctx.restore();
        }

        _drawExecutionSprite(ctx) {
            if(this.character){ctx.save();ctx.rotate(this.angle);this._drawLegs(ctx);this._drawTorso(ctx,true,(Math.sin(this.executionTimer*14)+1)/2);this._drawMask(ctx);ctx.restore();return;}
            // Mounted stance over downed enemy
            ctx.save();
            ctx.rotate(this.angle);

            // Heavy mounting legs straddling target
            ctx.fillStyle = '#2c3e50';
            ctx.fillRect(-10, -14, 20, 7);
            ctx.fillRect(-10, 7, 20, 7);

            // Torso leaned forward
            ctx.fillStyle = '#935116';
            ctx.beginPath();
            ctx.ellipse(0, 0, 13, 11, 0, 0, Math.PI * 2);
            ctx.fill();

            // Fist raised or smashing down based on step timer
            const smashOffset = Math.sin(this.executionTimer * 18) * 8;
            ctx.fillStyle = '#f5cba7';
            ctx.beginPath();
            ctx.arc(10 + smashOffset, 0, 6, 0, Math.PI * 2);
            ctx.fill();

            this._drawMask(ctx);
            ctx.restore();
        }

        _drawDeadBody(ctx) {
            if(this.character){
                ctx.save();ctx.rotate(this.angle+Math.PI*.5);
                ctx.fillStyle='#621c32';ctx.beginPath();ctx.ellipse(5,5,15,10,.3,0,Math.PI*2);ctx.fill();
                ctx.save();ctx.translate(-1,2);this._drawLegs(ctx);ctx.restore();this._drawTorso(ctx);this._drawMask(ctx);
                ctx.restore();return;
            }
            ctx.save();
            ctx.rotate(this.angle + Math.PI * 0.5);

            // Blood pool under dead player
            ctx.fillStyle = '#800000';
            ctx.beginPath();
            ctx.arc(0, 0, 20, 0, Math.PI * 2);
            ctx.fill();

            // Ragdoll jacket & trousers
            ctx.fillStyle = '#2c3e50';
            ctx.fillRect(-12, -4, 14, 8);
            ctx.fillStyle = '#935116';
            ctx.fillRect(2, -6, 12, 12);

            // Head with mask askew
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(16, 2, 7, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }
    }

    Player.prototype.render = Player.prototype.draw;

    return Player;
}));
