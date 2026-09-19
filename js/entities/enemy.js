/**
 * Hotline Miami: VISEO Arcade Edition
 * Multi-Archetype Enemy AI Engine - js/entities/enemy.js
 * 
 * Features:
 * - Archetypes: Standard Mobster, Shotgunner, Attack Dog (Rusher), Heavy Bouncer
 * - Complete AI State Machine: PATROL -> SUSPICIOUS -> ALERT/CHASE -> ATTACK -> KNOCKED_DOWN -> DEAD
 * - Line-of-sight Raycasting with 110-deg vision cone & glass transparency
 * - Acoustic Sound Hearing (alerts to non-silenced gunshots and door kicks)
 * - Dynamic weapon dropping on knockdown and death
 * - Ground knockdown state (4.5s crawl, vulnerable to player executions)
 * - Distinct visuals, animations, alert indicators (!), and death sprites
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
        window.Enemy = result;
    }
    root.Enemy = result;
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

    // Enemy Archetype Configurations
    const ENEMY_ARCHETYPES = {
        STANDARD: {
            id: 'STANDARD',
            name: 'Russian Mobster',
            hp: 1,
            speed: 165,
            chaseSpeed: 210,
            radius: 14,
            reactionTime: 0.22,
            visionRange: 480,
            visionFov: (110 * Math.PI) / 180,
            isHeavy: false,
            isDog: false,
            suitColor: '#ffffff', // White suit
            shirtColor: '#00cccc'  // Cyan shirt
        },
        SHOTGUNNER: {
            id: 'SHOTGUNNER',
            name: 'Shotgun Guard',
            hp: 1,
            speed: 140,
            chaseSpeed: 180,
            radius: 14,
            reactionTime: 0.28,
            visionRange: 450,
            visionFov: (100 * Math.PI) / 180,
            isHeavy: false,
            isDog: false,
            suitColor: '#2c3e50', // Dark suit
            shirtColor: '#e74c3c'  // Red shirt
        },
        DOG: {
            id: 'DOG',
            name: 'Attack Dog',
            hp: 1,
            speed: 220,
            chaseSpeed: 320, // Super fast rush!
            radius: 12,
            reactionTime: 0.10,
            visionRange: 520,
            visionFov: (120 * Math.PI) / 180,
            isHeavy: false,
            isDog: true,
            coatColor: '#6e2c00', // German Shepherd brown
            lungeSpeed: 460
        },
        HEAVY: {
            id: 'HEAVY',
            name: 'Heavy Bouncer',
            hp: 3, // Requires 3 standard hits or 1 heavy/shotgun blast
            speed: 110,
            chaseSpeed: 155,
            radius: 20, // Giant frame
            reactionTime: 0.35,
            visionRange: 440,
            visionFov: (95 * Math.PI) / 180,
            isHeavy: true,
            isDog: false,
            suitColor: '#17202a', // Heavy black suit
            shirtColor: '#7d3c98'  // Purple shirt
        }
    };

    class Enemy {
        /**
         * @param {number} x Starting X
         * @param {number} y Starting Y
         * @param {string} [archetype='STANDARD'] 'STANDARD', 'SHOTGUNNER', 'DOG', 'HEAVY'
         * @param {string|Object} [weapon='BAT'] Weapon assigned
         * @param {Array<{x: number, y: number}>} [patrolWaypoints=[]]
         * @param {number} [initialAngle=0]
         */
        constructor(x, y, archetype = 'STANDARD', weapon = 'BAT', patrolWaypoints = [], initialAngle = 0) {
            const rawArchetype = typeof archetype === 'string' ? archetype.toUpperCase() : (archetype && archetype.id) || 'STANDARD';
            const archetypeAliases = {
                MOBSTER_MELEE: 'STANDARD', MOBSTER_GUN: 'STANDARD', STANDARD: 'STANDARD',
                SHOTGUNNER: 'SHOTGUNNER', DOG: 'DOG', HEAVY: 'HEAVY'
            };
            const archetypeKey = archetypeAliases[rawArchetype] || rawArchetype;
            this.archetype = ENEMY_ARCHETYPES[archetypeKey] || ENEMY_ARCHETYPES.STANDARD;

            // Transform & Physics
            this.x = x;
            this.y = y;
            this.vx = 0;
            this.vy = 0;
            this.angle = initialAngle;
            this.targetAngle = initialAngle;
            this.radius = this.archetype.radius;

            // Health & Stats
            this.hp = this.archetype.hp;
            this.maxHp = this.archetype.hp;
            this.speed = this.archetype.speed;
            this.isAlive = true;

            // Weapon setup
            if (this.archetype.isDog) {
                this.currentWeapon = null;
                this.ammo = 0;
            } else {
                const wDef = typeof weapon === 'string'
                    ? (WSystem.getWeaponType ? WSystem.getWeaponType(weapon) : WEAPON_TYPES[weapon.toUpperCase()])
                    : weapon;
                this.currentWeapon = wDef || WEAPON_TYPES.BAT;
                this.ammo = this.currentWeapon.isGun ? this.currentWeapon.maxAmmo : 0;
            }

            // AI State Machine
            // 'PATROL', 'SUSPICIOUS', 'ALERT', 'ATTACKING', 'KNOCKED_DOWN', 'DEAD'
            this.state = 'PATROL';

            // Patrol Waypoints
            this.waypoints = patrolWaypoints && patrolWaypoints.length > 0 ? patrolWaypoints : [{ x, y }];
            this.currentWaypointIndex = 0;
            this.waypointWaitTimer = 0;

            // Suspicious / Investigation
            this.investigateX = x;
            this.investigateY = y;
            this.investigateTimer = 0;
            this.navPath = [];
            this.navPathIndex = 0;
            this.navRepathTimer = 0;
            this.navDestinationX = x;
            this.navDestinationY = y;

            // Combat & Reaction
            this.reactionTimer = 0;
            this.entryTimer = 0; // Director sets a brief, vulnerable ingress pause.
            this.attackCooldown = 0;
            // Accessibility/difficulty grace: armed enemies deliberately miss their first two trigger pulls.
            this.gunShotsFired = 0;
            this.dogLungeTimer = 0;
            this.dogLungeDuration = 0.35;

            // Knockdown State
            this.knockdownTimer = 0;
            this.knockdownMaxTime = 4.5; // 4.5s vulnerable to execution
            this.knockdownCrawling = false;

            // Visual FX / Feedback
            this.alertIndicatorTimer = 0; // Exclamation mark !
            this.legPhase = Math.random() * 10;
            this.legAngle = initialAngle;
            this.gaitHeading = initialAngle;
            this.gaitMoving = false;
            this.bodyBob = 0;
            this.recoilOffset = 0;
            this.swingAnimationTimer = 0;

            // Acoustic hearing listener binding
            this._acousticListener = this._onAcousticEvent.bind(this);
            if (AudioManager && typeof AudioManager.addAcousticListener === 'function') {
                AudioManager.addAcousticListener(this._acousticListener);
            }
        }

        // ==================== ACOUSTIC HEARING ====================

        _onAcousticEvent(soundX, soundY, soundRadius, soundType) {
            if (!this.isAlive || this.state === 'DEAD' || this.state === 'KNOCKED_DOWN') return;

            const dist = Math.hypot(this.x - soundX, this.y - soundY);
            if (dist <= soundRadius) {
                // If already alerting, update target position
                if (this.state === 'ALERT' || this.state === 'ATTACKING') {
                    this.investigateX = soundX;
                    this.investigateY = soundY;
                    return;
                }

                // Alert or investigate sound
                this.state = 'SUSPICIOUS';
                this.investigateX = soundX;
                this.investigateY = soundY;
                this.investigateTimer = 4.0;
                this.targetAngle = Math.atan2(soundY - this.y, soundX - this.x);
                this.alertIndicatorTimer = 0.8;
            }
        }

        /** Public acoustic hook used by the game director. */
        onHeardSound(soundX, soundY, soundRadius, soundType = 'GUNSHOT') {
            this._onAcousticEvent(soundX, soundY, soundRadius, soundType);
        }

        /** Public knockdown hook for thrown weapons and kicked doors. */
        knockDown(angle = this.angle, duration = this.knockdownMaxTime) {
            this._triggerKnockdown({
                type: 'IMPACT', angle, damage: 1, knockdown: true, isLethal: false
            }, duration);
        }

        // ==================== MAIN AI UPDATE ====================

        /**
         * Updates enemy AI, vision checks, state machine transitions, and combat.
         * @param {number} dt 
         * @param {Object} player Player instance
         * @param {Array<Object>} obstacles Walls and doors
         * @param {Array<Object>} enemies Peer enemies list
         * @param {Array<Object>} floorWeapons Dropped weapons
         * @param {Array<Object>} bullets Projectiles list
         * @param {Object} effects Gore & particle manager
         * @param {Object} camera Camera
         */
        update(dt = 1 / 60, player = null, obstacles = [], enemies = [], floorWeapons = [], bullets = [], effects = null, camera = null, navGraph = null) {
            dt = typeof dt === 'number' && !isNaN(dt) ? Math.min(Math.max(dt, 0.0001), 0.1) : 1 / 60;

            if (!this.isAlive) {
                this.state = 'DEAD';
                return;
            }

            // Timers
            if (this.attackCooldown > 0) this.attackCooldown = Math.max(0, this.attackCooldown - dt);
            if (this.alertIndicatorTimer > 0) this.alertIndicatorTimer = Math.max(0, this.alertIndicatorTimer - dt);
            if (this.recoilOffset > 0) this.recoilOffset = Math.max(0, this.recoilOffset - dt * 25);
            if (this.swingAnimationTimer > 0) this.swingAnimationTimer = Math.max(0, this.swingAnimationTimer - dt);

            // 1. Handle Knocked Down State
            if (this.state === 'KNOCKED_DOWN') {
                this._updateKnockdown(dt, floorWeapons, obstacles);
                return;
            }

            if (this.entryTimer > 0) {
                this.entryTimer = Math.max(0, this.entryTimer - dt);
                this.vx = this.vy = 0;
                return;
            }

            const movementStartX = this.x;
            const movementStartY = this.y;

            // 2. Line of Sight & Perception Check on Player
            let canSeePlayer = false;
            if (player && player.isAlive && player.state !== 'DEAD') {
                // If Ted mask is active, dogs ignore the player
                const isIgnoredByDog = this.archetype.isDog && player.mask === 'TED';

                if (!isIgnoredByDog) {
                    canSeePlayer = this._checkLineOfSightToPlayer(player, obstacles);
                }
            }

            // 3. AI State Machine Execution
            switch (this.state) {
                case 'PATROL':
                    this._updatePatrol(dt, canSeePlayer, player, obstacles);
                    break;

                case 'SUSPICIOUS':
                    this._updateSuspicious(dt, canSeePlayer, player, obstacles, navGraph);
                    break;

                case 'ALERT':
                    this._updateAlert(dt, canSeePlayer, player, obstacles, enemies, bullets, effects, camera, navGraph);
                    break;

                case 'ATTACKING':
                    this._updateAttacking(dt, canSeePlayer, player, obstacles, bullets, effects, camera);
                    break;
            }

            // 4. Movement integration & Wall collision
            if (ColSystem) ColSystem.moveCircle(this, obstacles, dt);
            else { this.x += this.vx * dt; this.y += this.vy * dt; }


            // Advance the gait from actual displacement after collision
            // resolution.  This prevents feet from skating when an enemy is
            // pressed against a wall and keeps the sprite calm while aiming.
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
                // A compact alternating stride with one cycle per ~115 px.
                this.legPhase += travelled * 0.055;
                this.bodyBob = Math.sin(this.legPhase * 2) * 0.55;
            } else {
                this.bodyBob *= Math.pow(0.04, dt * 60);
                if (Math.abs(this.bodyBob) < 0.01) this.bodyBob = 0;
            }

            // 5. Smooth rotation towards target angle
            this._rotateTowardsTarget(dt);
        }

        // ==================== PERCEPTION & VISION ====================

        _checkLineOfSightToPlayer(player, obstacles) {
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.hypot(dx, dy);

            // Proximity awareness (can't sneak directly behind within 40px)
            if (dist < 42) {
                return this._hasClearAttackLine(player, obstacles, true);
            }

            // Max vision range
            if (dist > this.archetype.visionRange) return false;

            // Vision Cone check
            const inCone = ColSystem && typeof ColSystem.circleInCone === 'function' ? ColSystem.circleInCone(
                player.x, player.y, player.radius || 14,
                this.x, this.y, this.angle,
                this.archetype.visionFov, this.archetype.visionRange
            ) : true;

            if (!inCone) return false;

            // Raycast against walls / closed opaque doors (can see through glass)
            return this._hasClearAttackLine(player, obstacles, true);
        }

        _hasClearAttackLine(target, obstacles, seeThroughGlass = false) {
            if (!ColSystem) return true;
            const dx = target.x - this.x;
            const dy = target.y - this.y;
            const distance = Math.hypot(dx, dy);
            if (distance < 0.001) return true;
            return !ColSystem.raycast(this.x, this.y, dx / distance, dy / distance,
                distance + 0.001, ColSystem.worldObstacles(obstacles), {
                    ignoreGlass: seeThroughGlass, ignoreOpenDoors: false
                }).hit;
        }

        _rotateTowardsTarget(dt) {
            let diff = this.targetAngle - this.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;

            const turnSpeed = this.state === 'ALERT' ? 14 : 6;
            this.angle += Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed * dt);
        }

        // ==================== STATE HANDLERS ====================

        _updatePatrol(dt, canSeePlayer, player, obstacles) {
            if (canSeePlayer) {
                this._transitionToAlert(player);
                return;
            }

            if (this.waypoints.length === 0) {
                this.vx = 0;
                this.vy = 0;
                return;
            }

            const wp = this.waypoints[this.currentWaypointIndex];
            const dx = wp.x - this.x;
            const dy = wp.y - this.y;
            const dist = Math.hypot(dx, dy);

            if (dist < 16) {
                // Reached waypoint, pause briefly
                this.vx = 0;
                this.vy = 0;
                this.waypointWaitTimer += dt;

                if (this.waypointWaitTimer > 1.8) {
                    this.waypointWaitTimer = 0;
                    this.currentWaypointIndex = (this.currentWaypointIndex + 1) % this.waypoints.length;
                }
            } else {
                // Move towards waypoint
                this.targetAngle = Math.atan2(dy, dx);
                this.vx = Math.cos(this.angle) * (this.speed * 0.7);
                this.vy = Math.sin(this.angle) * (this.speed * 0.7);
            }
        }

        _updateSuspicious(dt, canSeePlayer, player, obstacles, navGraph = null) {
            if (canSeePlayer) {
                this._transitionToAlert(player);
                return;
            }

            this.investigateTimer -= dt;
            const navTarget = this._getNavigationTarget(this.investigateX, this.investigateY, navGraph, dt);
            const dx = navTarget.x - this.x;
            const dy = navTarget.y - this.y;
            const destinationDist = Math.hypot(this.investigateX - this.x, this.investigateY - this.y);
            const dist = Math.hypot(dx, dy);

            if (destinationDist > 20) {
                this.targetAngle = Math.atan2(dy, dx);
                this.vx = Math.cos(this.angle) * this.speed;
                this.vy = Math.sin(this.angle) * this.speed;
            } else {
                this.vx = 0;
                this.vy = 0;
                // Sweep vision around suspiciously
                this.targetAngle += Math.sin(this.investigateTimer * 3) * 0.05;
            }

            if (this.investigateTimer <= 0) {
                this.state = 'PATROL';
            }
        }

        _getNavigationTarget(destX, destY, navGraph, dt = 1 / 60) {
            if (!navGraph || typeof navGraph.findPath !== 'function') return { x: destX, y: destY };
            this.navRepathTimer = Math.max(0, (this.navRepathTimer || 0) - dt);
            const destinationMoved = Math.hypot(destX - (this.navDestinationX || 0), destY - (this.navDestinationY || 0)) > 70;
            if (!this.navPath || this.navPath.length < 2 || this.navRepathTimer <= 0 || destinationMoved) {
                const path = navGraph.findPath(this.x, this.y, destX, destY);
                this.navPath = Array.isArray(path) && path.length ? path : [{ x: destX, y: destY }];
                this.navPathIndex = this.navPath.length > 1 ? 1 : 0;
                this.navRepathTimer = 0.42 + Math.random() * 0.18;
                this.navDestinationX = destX;
                this.navDestinationY = destY;
            }
            let target = this.navPath[this.navPathIndex] || { x: destX, y: destY };
            if (Math.hypot(target.x - this.x, target.y - this.y) < 24 && this.navPathIndex < this.navPath.length - 1) {
                this.navPathIndex++;
                target = this.navPath[this.navPathIndex] || target;
            }
            return target;
        }

        _transitionToAlert(player) {
            this.state = 'ALERT';
            this.reactionTimer = this.archetype.reactionTime;
            this.alertIndicatorTimer = 1.0;
            this.targetAngle = Math.atan2(player.y - this.y, player.x - this.x);

            if (AudioManager) {
                if (this.archetype.isDog) {
                    AudioManager.playDogBark();
                } else {
                    AudioManager.playAlertSound();
                }
            }
        }

        _updateAlert(dt, canSeePlayer, player, obstacles, enemies, bullets, effects, camera, navGraph = null) {
            if (!player || !player.isAlive) {
                this.state = 'PATROL';
                this.vx = 0;
                this.vy = 0;
                return;
            }

            // Keep track of player position
            if (canSeePlayer) {
                this.investigateX = player.x;
                this.investigateY = player.y;
            }

            const navTarget = canSeePlayer
                ? { x: this.investigateX, y: this.investigateY }
                : this._getNavigationTarget(this.investigateX, this.investigateY, navGraph, dt);
            const dx = navTarget.x - this.x;
            const dy = navTarget.y - this.y;
            const dist = Math.hypot(this.investigateX - this.x, this.investigateY - this.y);

            this.targetAngle = Math.atan2(dy, dx);

            // Reaction Delay countdown before attacking
            if (this.reactionTimer > 0) {
                this.reactionTimer -= dt;
                this.vx = 0;
                this.vy = 0;
                return;
            }

            // Alert nearby comrades
            if (enemies && enemies.length > 0) {
                for (let i = 0; i < enemies.length; i++) {
                    const peer = enemies[i];
                    if (peer && peer !== this && peer.state === 'PATROL') {
                        if (Math.hypot(this.x - peer.x, this.y - peer.y) < 140) {
                            peer.state = 'ALERT';
                            peer.reactionTimer = peer.archetype.reactionTime;
                            peer.alertIndicatorTimer = 0.8;
                            peer.investigateX = this.investigateX;
                            peer.investigateY = this.investigateY;
                        }
                    }
                }
            }

            // Decide Attack vs Chase based on weapon type
            const isGun = this.currentWeapon && this.currentWeapon.isGun;

            if (this.archetype.isDog) {
                // Dog Rush & Lunge
                if (this.attackCooldown > 0) {
                    this.vx = this.vy = 0;
                } else if (dist < 80 && canSeePlayer) {
                    this.state = 'ATTACKING';
                    this.dogLungeTimer = this.dogLungeDuration;
                } else {
                    this.vx = Math.cos(this.angle) * this.archetype.chaseSpeed;
                    this.vy = Math.sin(this.angle) * this.archetype.chaseSpeed;
                }
            } else if (isGun) {
                // Firearm Combat
                if (canSeePlayer && dist < 420) {
                    this.state = 'ATTACKING';
                    this.vx = 0;
                    this.vy = 0;
                } else {
                    // Move into firing range
                    this.vx = Math.cos(this.angle) * this.archetype.chaseSpeed;
                    this.vy = Math.sin(this.angle) * this.archetype.chaseSpeed;
                }
            } else {
                // Melee Charge
                if (dist < (this.currentWeapon ? this.currentWeapon.range + 8 : 45) && canSeePlayer) {
                    this.state = 'ATTACKING';
                } else {
                    this.vx = Math.cos(this.angle) * this.archetype.chaseSpeed;
                    this.vy = Math.sin(this.angle) * this.archetype.chaseSpeed;
                }
            }
        }

        _updateAttacking(dt, canSeePlayer, player, obstacles, bullets, effects, camera) {
            if (!player || !player.isAlive) {
                this.state = 'PATROL';
                return;
            }

            this.targetAngle = Math.atan2(player.y - this.y, player.x - this.x);

            if (this.archetype.isDog) {
                // Dog Lunge Attack
                this.dogLungeTimer -= dt;
                this.vx = Math.cos(this.angle) * (this.archetype.lungeSpeed || 450);
                this.vy = Math.sin(this.angle) * (this.archetype.lungeSpeed || 450);

                // Bite check
                const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);
                if (canSeePlayer && this._hasClearAttackLine(player, obstacles) && distToPlayer < this.radius + (player.radius || 14)) {
                    if (typeof player.takeHit === 'function') {
                        player.takeHit({ type: 'DOG_BITE', angle: this.angle });
                    }
                    if (camera && typeof camera.addTrauma === 'function') camera.addTrauma(0.5);
                }

                if (this.dogLungeTimer <= 0) {
                    this.state = 'ALERT';
                    this.attackCooldown = 0.6;
                }
                return;
            }

            const isGun = this.currentWeapon && this.currentWeapon.isGun;

            if (isGun) {
                // Fire weapon when cooldown ready
                if (this.attackCooldown <= 0 && canSeePlayer) {
                    this._fireGunAtPlayer(player, bullets, effects, camera, obstacles);
                    this.attackCooldown = this.currentWeapon.cooldown + 0.15; // AI slight delay
                }

                // If player leaves LoS, return to chase
                if (!canSeePlayer) {
                    this.state = 'ALERT';
                }
            } else {
                // Melee Swing
                if (this.attackCooldown <= 0 && canSeePlayer) {
                    this._performMeleeSwing(player, effects, camera, obstacles);
                    this.attackCooldown = (this.currentWeapon ? this.currentWeapon.cooldown : 0.3) + 0.2;
                }

                const dist = Math.hypot(player.x - this.x, player.y - this.y);
                if (!canSeePlayer || dist > (this.currentWeapon ? this.currentWeapon.range + 20 : 55)) {
                    this.state = 'ALERT';
                }
            }
        }

        _fireGunAtPlayer(player, bullets, effects, camera, obstacles = []) {
            if (!this.currentWeapon || !this._hasClearAttackLine(player, obstacles, true)) return;

            const w = this.currentWeapon;
            const pellets = w.pellets || 1;

            this.recoilOffset = 6;
            if (AudioManager) AudioManager.playGunshot(w.id, this.x, this.y);

            const barrelLen = (w.length || 20) + 8;
            // A long barrel can extend beyond cover while the body is still
            // behind it. Keep the projectile on the shooter's side so its
            // first swept update hits the obstruction (including glass).
            const barrelHit = ColSystem && ColSystem.raycast(this.x, this.y,
                Math.cos(this.angle), Math.sin(this.angle), barrelLen + 0.001,
                ColSystem.worldObstacles(obstacles), { ignoreOpenDoors: false });
            const muzzleDistance = barrelHit && barrelHit.hit
                ? Math.max(0, barrelHit.distance - 1) : barrelLen;
            const muzzleX = this.x + Math.cos(this.angle) * muzzleDistance;
            const muzzleY = this.y + Math.sin(this.angle) * muzzleDistance;

            if (effects) {
                const fxWeapon = String(w.id || 'PISTOL').toLowerCase();
                const casingType = fxWeapon.includes('shotgun') || fxWeapon.includes('double') ? 'shotgun' : (fxWeapon.includes('magnum') ? 'magnum' : (fxWeapon.includes('m16') || fxWeapon.includes('rifle') ? 'rifle' : 'pistol'));
                effects.spawnMuzzleFlash(muzzleX, muzzleY, this.angle, fxWeapon);
                effects.spawnShellCasing(this.x, this.y, this.angle, casingType);
            }

            // Give the player a readable grace window when a gun enemy first acquires them.
            // The first two trigger pulls are guaranteed near-misses, then normal accuracy resumes.
            const targetAngle = Math.atan2(player.y - this.y, player.x - this.x);
            const targetDistance = Math.max(1, Math.hypot(player.x - this.x, player.y - this.y));
            const weaponSpread = Number.isFinite(w.spread) ? w.spread * 1.6 : 0.08;
            const isOpeningMiss = this.gunShotsFired < 2;
            let openingMissOffset = 0;
            if (isOpeningMiss) {
                const playerRadius = player.radius || 14;
                const missClearance = playerRadius + 12;
                const geometricMiss = Math.asin(Math.min(0.92, missClearance / targetDistance));
                // Add half the weapon spread so an entire shotgun cone also clears the player.
                const missMagnitude = geometricMiss + weaponSpread * 0.6 + 0.035;
                const missSide = (this.gunShotsFired % 2 === 0) ? 1 : -1;
                openingMissOffset = missSide * missMagnitude;
            }

            for (let i = 0; i < pellets; i++) {
                const spreadAngle = (Math.random() - 0.5) * weaponSpread;
                const bulletAngle = (isOpeningMiss ? targetAngle + openingMissOffset : this.angle) + spreadAngle;
                bullets.push(new Bullet(muzzleX, muzzleY, bulletAngle, w, false));
            }
            this.gunShotsFired++;
        }

        _performMeleeSwing(player, effects, camera, obstacles = []) {
            const w = this.currentWeapon || WEAPON_TYPES.BAT;
            this.swingAnimationTimer = 0.16;

            if (AudioManager) AudioManager.playMeleeSwing(w.id);

            if (effects) {
                const startAngle = this.angle - w.arc * 0.5;
                effects.spawnMeleeTrail(this.x, this.y, startAngle, w.arc, w.range, 'rgba(255, 50, 50, 0.7)');
            }

            // Check if player is hit
            const inCone = ColSystem && typeof ColSystem.circleInCone === 'function' ? ColSystem.circleInCone(
                player.x, player.y, player.radius || 14,
                this.x, this.y, this.angle, w.arc, w.range
            ) : false;

            if (inCone && this._hasClearAttackLine(player, obstacles)) {
                if (typeof player.takeHit === 'function') {
                    player.takeHit({ type: 'MELEE', angle: this.angle, weaponType: w.id });
                }
                if (AudioManager) AudioManager.playMeleeHit(true, w.id);
                if (camera && typeof camera.addTrauma === 'function') camera.addTrauma(0.45);
            }
        }

        // ==================== KNOCKDOWN & STUN SYSTEM ====================

        _updateKnockdown(dt, floorWeapons, obstacles = []) {
            this.knockdownTimer -= dt;
            if (ColSystem) ColSystem.moveCircle(this, obstacles, dt);
            else { this.x += this.vx * dt; this.y += this.vy * dt; }
            this.vx *= Math.pow(0.86, dt * 60);
            this.vy *= Math.pow(0.86, dt * 60);


            // Stunned / Crawling on floor
            if (this.knockdownTimer <= 0) {
                // Recover and stand back up
                this.state = 'ALERT';
                this.reactionTimer = 0.3;
                this.currentWeapon = WEAPON_TYPES.FISTS; // Unarmed unless picks up weapon
            }
        }

        /**
         * Called when player initiates execution on this downed enemy.
         */
        onExecutionStart(player) {
            this.knockdownTimer = 99; // Keep pinned until execution completes
        }

        // ==================== DAMAGE & DEATH ====================

        /**
         * Handles incoming hit from player, bullet, melee, door slam, or thrown weapon.
         * @param {Object} hitInfo 
         */
        takeHit(hitInfo = {}) {
            if (!this.isAlive || this.state === 'DEAD') return;

            // Heavy Bouncer Defense Handling
            if (this.archetype.isHeavy) {
                // Heavy is immune to regular melee from front and single pistol bullet
                if (hitInfo.type === 'MELEE' && hitInfo.damage < 2) {
                    if (AudioManager) AudioManager.playWeaponThrowHit(this.x, this.y);
                    this.state = 'ALERT';
                    return; // Deflected!
                }

                if (hitInfo.type === 'THROW' || hitInfo.type === 'DOOR_SLAM') {
                    // Thrown weapon stuns heavy for 2.5s
                    this.hp -= 1;
                    if (this.hp <= 0) {
                        this.die(hitInfo);
                    } else {
                        this._triggerKnockdown(hitInfo, 2.8);
                    }
                    return;
                }

                this.hp -= (hitInfo.damage || 1);
                if (this.hp <= 0) {
                    this.die(hitInfo);
                } else {
                    // Flinch
                    this.state = 'ALERT';
                }
                return;
            }

            // Normal Enemy / Dog / Shotgunner
            if (hitInfo.knockdown && !hitInfo.isLethal) {
                this._triggerKnockdown(hitInfo, this.knockdownMaxTime);
                return;
            }

            // Lethal hit = Instant Kill
            this.die(hitInfo);
        }

        _triggerKnockdown(hitInfo, duration = 4.5) {
            this.state = 'KNOCKED_DOWN';
            this.downAngle = hitInfo.angle ?? this.angle;
            this.knockdownTimer = duration;

            // Drop held weapon
            if (this.currentWeapon && this.currentWeapon.id !== 'FISTS') {
                // In game loop, floor weapon is added
                this.droppedWeaponToSpawn = {
                    x: this.x,
                    y: this.y,
                    weapon: this.currentWeapon,
                    ammo: this.ammo
                };
                this.currentWeapon = WEAPON_TYPES.FISTS;
            }

            // Slide backward from impact
            const pushAngle = hitInfo.angle ?? this.angle;
            this.vx = Math.cos(pushAngle) * 220;
            this.vy = Math.sin(pushAngle) * 220;
        }

        die(hitInfo = {}) {
            if (!this.isAlive) return;
            this.deathAngle = hitInfo.angle ?? this.angle;
            this.knockdownTimer = 0;
            this.isAlive = false;
            this.state = 'DEAD';
            this.hp = 0;

            // Drop weapon
            if (this.currentWeapon && this.currentWeapon.id !== 'FISTS') {
                this.droppedWeaponToSpawn = {
                    x: this.x,
                    y: this.y,
                    weapon: this.currentWeapon,
                    ammo: this.ammo
                };
                this.currentWeapon = null;
            }

            // Ragdoll fling
            const pushAngle = hitInfo.angle ?? this.angle;
            this.vx = Math.cos(pushAngle) * 180;
            this.vy = Math.sin(pushAngle) * 180;
        }

        onDoorSlam(door, damage = 80, dirX = 1, dirY = 0) {
            if (!this.isAlive || this.state === 'DEAD') return;
            const hitAngle = Math.atan2(dirY, dirX);
            const lethal = door?.lastKickedBy?.mask === 'DON_JUAN' || door?.lastKickedBy?.perks?.doorLethal === true;
            this.takeHit({
                type: 'DOOR_SLAM',
                damage: lethal ? Math.max(2, this.hp || 1) : 1,
                isLethal: lethal,
                knockdown: !lethal,
                angle: hitAngle
            });
        }

        updateDeadBody(dt = 1 / 60, obstacles = null) {
            if (this.isAlive) return;
            dt = Math.min(0.1, Math.max(0, Number(dt) || 0));
            const speed = Math.hypot(this.vx || 0, this.vy || 0);
            if (speed < 2) {
                this.vx = 0;
                this.vy = 0;
                return;
            }
            if (ColSystem) ColSystem.moveCircle(this, obstacles, dt);
            else { this.x += this.vx * dt; this.y += this.vy * dt; }
            this.vx *= Math.pow(0.80, dt * 60);
            this.vy *= Math.pow(0.80, dt * 60);

        }

        kill(type = 'MELEE', angle = 0) {
            this.die({ type, angle });
        }

        // ==================== RENDERING ====================

        /**
         * Renders enemy entity, suit, weapon, alert indicator, or death corpse.
         * @param {CanvasRenderingContext2D} ctx 
         */
        draw(ctx) {
            const ex = typeof this.x === 'number' && !isNaN(this.x) ? this.x : 0;
            const ey = typeof this.y === 'number' && !isNaN(this.y) ? this.y : 0;
            ctx.save();
            ctx.translate(ex, ey);

            // Dead state
            if (!this.isAlive || this.state === 'DEAD') {
                this._drawCorpse(ctx);
                ctx.restore();
                return;
            }

            // Knocked down state (lying on floor)
            if (this.state === 'KNOCKED_DOWN') {
                this._drawKnockedDown(ctx);
                ctx.restore();
                return;
            }

            // Dog rendering
            if (this.archetype.isDog) {
                this._drawDog(ctx);
                this._drawAlertIndicator(ctx);
                ctx.restore();
                return;
            }

            // 1. Legs.  They share the aim frame and use short, distance-driven
            // step offsets, so lateral movement never spins or scissors the
            // lower body away from the torso.
            ctx.save();
            ctx.rotate(this.angle);
            this._drawMobsterLegs(ctx);
            ctx.restore();

            // 2. Torso, Suit & Weapon
            ctx.save();
            ctx.rotate(this.angle);
            ctx.translate(0, this.bodyBob || 0);

            if (this.recoilOffset > 0) {
                ctx.translate(-this.recoilOffset, 0);
            }

            const isSwinging = this.swingAnimationTimer > 0;
            const swingDur = 0.16;
            const swingProgress = isSwinging ? (1.0 - Math.max(0, Math.min(1, this.swingAnimationTimer / swingDur))) : 0;

            if (isSwinging) {
                this._drawSlashWave(ctx, swingProgress);
            }

            this._drawHeldWeapon(ctx, isSwinging, swingProgress);
            this._drawMobsterTorso(ctx, isSwinging, swingProgress);

            ctx.restore();

            // 3. Alert / Exclamation Indicator
            this._drawAlertIndicator(ctx);

            ctx.restore();
        }

        _drawSlashWave(ctx, progress) {
            const w = this.currentWeapon;
            if (w && w.isGun) return;

            ctx.save();
            const radius = 48;
            const sweepAngle = 2.2;
            const startAngle = -1.1;
            const currentAngle = startAngle + sweepAngle * Math.min(1, progress * 1.25);
            const tailAngle = Math.max(startAngle, currentAngle - 0.9);
            const alpha = Math.sin(progress * Math.PI);

            ctx.globalAlpha = alpha * 0.85;
            ctx.shadowColor = '#ff0055';
            ctx.shadowBlur = 0;

            ctx.beginPath();
            ctx.arc(0, 0, radius, tailAngle, currentAngle, false);
            ctx.arc(0, 0, radius * 0.65, currentAngle, tailAngle, true);
            ctx.closePath();

            const grad = ctx.createRadialGradient(0, 0, radius * 0.6, 0, 0, radius);
            grad.addColorStop(0, 'rgba(255, 0, 50, 0)');
            grad.addColorStop(0.7, '#ff0055');
            grad.addColorStop(1, '#ffffff');
            ctx.fillStyle = grad;
            ctx.fill();

            ctx.restore();
        }

        _drawMobsterLegs(ctx) {
            const heavy = this.archetype.isHeavy;
            const moving = this.gaitMoving === true;
            const step = moving ? Math.sin(this.legPhase) * 3.5 : 0;
            const travel = (this.gaitHeading || 0) - this.angle;
            const dx = Math.cos(travel) * step;
            const dy = Math.sin(travel) * step;
            const leftLift = moving ? Math.max(0, Math.sin(this.legPhase)) * 0.65 : 0;
            const rightLift = moving ? Math.max(0, Math.sin(this.legPhase + Math.PI)) * 0.65 : 0;
            const side = heavy ? 9 : 7;
            const feet = [
                { x: -16 + dx, y: -side + dy, lift: leftLift },
                { x: -16 - dx, y: side - dy, lift: rightLift }
            ];
            for (const foot of feet) {
                const x = foot.x;
                const y = foot.y;
                ctx.fillStyle = '#171324';
                ctx.fillRect(x - 3, y - 2 - foot.lift, 16, 10);
                ctx.fillStyle = heavy ? '#453049' : '#655573';
                ctx.fillRect(x, y - foot.lift, 11, 7);
                ctx.fillStyle = '#eee1cc';
                ctx.fillRect(x - 2, y - foot.lift, 5, 7);
            }
        }

        _drawMobsterTorso(ctx, isSwinging = false, progress = 0) {
            const heavy = this.archetype.isHeavy;
            const shotgun = this.archetype.id === 'SHOTGUNNER';
            const melee = !heavy && !shotgun && (!this.currentWeapon || !this.currentWeapon.isGun);
            const jacket = heavy ? '#40334d' : shotgun ? '#b55568' : melee ? '#49b4ab' : '#f1e7d4';
            const shoulder = heavy ? 20 : 16;
            ctx.save();
            if (isSwinging) ctx.rotate((-1.1 + progress * 2.2) * 0.35);
            ctx.strokeStyle = '#1c1325';
            ctx.lineWidth = 3;
            ctx.lineJoin = 'miter';
            ctx.fillStyle = jacket;
            ctx.beginPath();
            ctx.moveTo(-16, -shoulder + 5); ctx.lineTo(-8, -shoulder);
            ctx.lineTo(9, -shoulder); ctx.lineTo(14, -shoulder + 7);
            ctx.lineTo(14, shoulder - 7); ctx.lineTo(9, shoulder);
            ctx.lineTo(-8, shoulder); ctx.lineTo(-16, shoulder - 5);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            // Strong shirt panel, full sleeves and visible fists replace bead-like bodies.
            ctx.fillStyle = heavy ? '#151423' : '#963955';
            ctx.fillRect(-7, -6, 14, 12);
            ctx.fillStyle = heavy ? '#d79b77' : jacket;
            for (const side of [-1,1]) {
                ctx.fillRect(3, side * shoulder - 5, 14, 10);
                ctx.strokeRect(3, side * shoulder - 5, 14, 10);
                ctx.fillStyle = '#e6b28b';
                ctx.fillRect(17, side * (shoulder - 4) - 3, 7, 7);
                ctx.strokeRect(17, side * (shoulder - 4) - 3, 7, 7);
                ctx.fillStyle = heavy ? '#d79b77' : jacket;
            }
            // Short neck/vest bridge keeps the head anchored to the shoulders.
            ctx.fillStyle = '#251b29';
            ctx.fillRect(0, -8, 14, 16);
            ctx.fillStyle = '#e7b28c';
            ctx.beginPath();
            ctx.arc(10, 0, 6.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#1c1325';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = heavy ? '#714354' : '#292039';
            ctx.fillRect(3, -6, 3, 12);
            if (!heavy) {
                ctx.fillStyle = '#171324';
                ctx.fillRect(11, -6, 3, 12);
            }
            if (melee) {
                ctx.fillStyle = '#e8e4cb';
                ctx.fillRect(-5, -shoulder, 11, 3);
                ctx.fillRect(-5, shoulder - 3, 11, 3);
            }
            ctx.restore();
        }

        _drawHeldWeapon(ctx, isSwinging = false, progress = 0) {
            if (!this.currentWeapon || this.currentWeapon.id === 'FISTS' || this.currentWeapon.id === 'fists' || this.currentWeapon.id === 'unarmed') return;

            const isGun = this.currentWeapon.isGun;
            const len = this.currentWeapon.length || 18;
            const wid = this.currentWeapon.width || 6;

            ctx.save();

            if (isSwinging && !isGun) {
                const swingAngle = -1.1 + progress * 2.2;
                const swingRadius = 15;
                const hx = 4 + Math.cos(swingAngle) * swingRadius;
                const hy = Math.sin(swingAngle) * swingRadius;
                ctx.translate(hx, hy);
                ctx.rotate(swingAngle + 0.35);
            } else {
                // Leave the weapon projecting past the hands so the aim line
                // remains legible at normal gameplay zoom.
                ctx.translate(18, 2);
            }

            if (typeof drawWeaponSprite === 'function') {
                drawWeaponSprite(ctx, this.currentWeapon.id, len, wid, true);
            } else if (typeof window !== 'undefined' && typeof window.drawWeaponSprite === 'function') {
                window.drawWeaponSprite(ctx, this.currentWeapon.id, len, wid, true);
            } else {
                ctx.fillStyle = this.currentWeapon.spriteColor || '#bdc3c7';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1;
                ctx.fillRect(0, -wid * 0.5, len, wid);
                ctx.strokeRect(0, -wid * 0.5, len, wid);
            }

            ctx.restore();
        }

        _drawDog(ctx) {
            ctx.save();
            ctx.rotate(this.angle);

            const isSprinting = this.gaitMoving === true;
            const stride = isSprinting ? Math.sin(this.legPhase) * 9 : 0;

            // Drop shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.beginPath();
            ctx.ellipse(2, 2, 16, 8, 0, 0, Math.PI * 2);
            ctx.fill();

            // 4 Galloping Legs
            ctx.fillStyle = '#4a2305'; // Tan/brown paws
            ctx.fillRect(stride + 8, -10, 4, 3.5);
            ctx.fillRect(-stride + 8, 7, 4, 3.5);
            ctx.fillRect(-stride - 8, -10, 4, 3.5);
            ctx.fillRect(stride - 8, 7, 4, 3.5);

            // Tail
            ctx.strokeStyle = '#17202a';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(-14, 0);
            ctx.quadraticCurveTo(-20, isSprinting ? Math.sin(this.legPhase * 2) * 5 : 0, -22, -4);
            ctx.stroke();

            // German Shepherd Body (Black Saddle with Tan flanks)
            ctx.fillStyle = '#b9770e'; // Tan base
            ctx.beginPath();
            ctx.ellipse(0, 0, 16, 9, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#271202';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Black Saddle marking
            ctx.fillStyle = '#17202a';
            ctx.beginPath();
            ctx.ellipse(-2, 0, 10, 6, 0, 0, Math.PI * 2);
            ctx.fill();

            // Head & Muzzle
            ctx.fillStyle = '#b9770e';
            ctx.beginPath();
            ctx.ellipse(13, 0, 8, 6, 0, 0, Math.PI * 2);
            ctx.fill();

            // Black Muzzle & Wet Nose
            ctx.fillStyle = '#17202a';
            ctx.beginPath();
            ctx.moveTo(14, -3); ctx.lineTo(20, 0); ctx.lineTo(14, 3);
            ctx.fill();

            // Red Panting Tongue
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.ellipse(18, 2, 3, 2, 0.4, 0, Math.PI * 2);
            ctx.fill();

            // Upright Pointed German Shepherd Ears with black tips
            ctx.fillStyle = '#17202a';
            ctx.beginPath();
            ctx.moveTo(9, -7); ctx.lineTo(14, -13); ctx.lineTo(14, -5); ctx.fill();
            ctx.moveTo(9, 7); ctx.lineTo(14, 13); ctx.lineTo(14, 5); ctx.fill();

            ctx.restore();
        }

        _drawKnockedDown(ctx) {
            // Same anatomy as a corpse, but intact clothes, breathing and a
            // readable recovery bar make a living, executable target distinct.
            ctx.save();
            ctx.translate(0, Math.sin(this.knockdownTimer * 5) * 0.7);
            this._drawCorpse(ctx, true);
            ctx.restore();
            ctx.fillStyle = '#201827';
            ctx.fillRect(-18, -37, 36, 6);
            ctx.fillStyle = '#ffd878';
            ctx.fillRect(-16, -35, 32 * Math.min(1, this.knockdownTimer / this.knockdownMaxTime), 2);
            ctx.fillStyle = '#ffe6a1';
            ctx.font = 'bold 10px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('AU SOL', 0, -42);
        }

        _drawCorpse(ctx, down = false) {
            ctx.save();
            ctx.rotate((down ? this.downAngle : this.deathAngle) ?? this.angle);

            const rect=(color,x,y,w,h)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
            const shape=(color,points)=>{ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();};
            const ink='#201827', skin='#d8a17d';
            if (this.archetype.isDog) {
                shape(ink,[[-20,-6],[-8,-10],[10,-8],[18,-4],[24,-2],[24,4],[12,8],[-12,8]]);
                rect('#724a2a',-14,-6,24,12);rect('#aa7950',2,-6,12,10);
                rect(ink,-14,6,6,10);rect('#aa7950',-12,6,4,8);
                rect(ink,6,6,6,10);rect('#aa7950',8,6,2,8);
                rect(ink,12,-10,4,6);rect(ink,18,0,6,4);
            } else {
                const coat=this.archetype.isHeavy?'#66526f':'#ddd5c2';
                const shade=this.archetype.isHeavy?'#42334e':'#a5a29c';
                // Bent legs and staggered shoes; preserve the live actor's scale.
                shape(ink,[[-10,-10],[-20,-12],[-30,-6],[-30,0],[-24,2],[-16,-4],[-8,-2]]);
                shape('#424053',[[-12,-8],[-20,-10],[-26,-6],[-24,-2],[-16,-6],[-10,-4]]);
                shape(ink,[[-10,2],[-20,4],[-24,14],[-20,18],[-14,16],[-12,10],[-6,10]]);
                shape('#424053',[[-10,4],[-18,6],[-20,12],[-16,14],[-14,8],[-8,8]]);
                rect('#b9b8ac',-30,-6,4,6);rect('#b9b8ac',-22,14,6,4);
                // Sleeves turn at the elbows instead of forming a rigid cross.
                shape(ink,[[0,-8],[-4,-16],[2,-22],[10,-22],[12,-16],[4,-16],[6,-10]]);
                shape(shade,[[0,-10],[-2,-16],[2,-20],[8,-20],[8,-18],[2,-18],[4,-12]]);
                shape(ink,[[6,6],[16,10],[14,20],[6,24],[2,20],[10,16],[10,12],[4,12]]);
                shape(coat,[[8,8],[14,12],[12,18],[8,20],[6,18],[10,16],[10,12],[6,12]]);
                rect(skin,8,-22,6,4);rect(skin,2,20,6,4);
                shape(ink,[[-12,-10],[2,-12],[14,-8],[16,6],[6,12],[-12,10],[-16,4]]);
                shape(coat,[[-10,-8],[2,-10],[12,-6],[12,4],[4,10],[-10,8],[-12,2]]);
                rect(shade,-10,6,14,2);rect('#f1ead7',-8,-8,8,2);
                shape(this.archetype.shirtColor||'#65b6b8',[[2,-6],[10,-4],[10,4],[2,6]]);
                shape(shade,[[0,-8],[6,-4],[2,0],[-2,-2]]);
                rect(ink,6,-2,2,6);rect('#877f82',-4,0,2,2);
                // Neck, jaw, hair and face highlight remain legible at 1x zoom.
                rect(ink,14,-6,12,14);rect(skin,16,-4,8,10);
                rect('#edc19b',20,-2,4,4);rect('#a76d57',16,4,6,2);
                rect('#3c2b32',14,-6,8,4);rect('#3c2b32',14,-2,2,6);
                rect(ink,22,-2,2,2);
                if(!down){
                    shape('#742036',[[-6,0],[0,-4],[4,-2],[6,4],[0,6],[-6,4]]);
                    rect('#ba3651',-2,0,4,4);rect('#742036',22,4,4,2);
                }
            }

            ctx.restore();
        }

        _drawAlertIndicator(ctx) {
            if (this.alertIndicatorTimer <= 0) return;
            ctx.save();
            ctx.fillStyle = '#321625';
            ctx.fillRect(-4, -37, 9, 20);
            ctx.fillStyle = '#ffca83';
            ctx.fillRect(-2, -35, 5, 10);
            ctx.fillRect(-2, -22, 5, 4);
            ctx.restore();
        }
    }

    Enemy.prototype.render = Enemy.prototype.draw;
    Enemy.ARCHETYPES = ENEMY_ARCHETYPES;

    return Enemy;
}));
