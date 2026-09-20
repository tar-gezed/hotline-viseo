/**
 * Hotline Miami: VISEO Arcade Edition
 * Dynamic Camera System - js/engine/camera.js
 * 
 * Features:
 * - Smooth player-following with adaptive lerping
 * - Dynamic mouse lookahead offset (standard + Shift scouting extension)
 * - Velocity & turning-based roll/tilt angle for iconic retro disorientation
 * - Non-linear Trauma-based Screen Shake system (shake = trauma^2)
 * - Screen-to-World and World-to-Screen coordinate transformation matrices
 * - Viewport bounds culling query
 */

(function (root, factory) {
    const result = factory();
    if (typeof define === 'function' && define.amd) {
        define([], () => result);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = result;
    }
    if (typeof window !== 'undefined') {
        window.Camera = result;
    }
    root.Camera = result;
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    class Camera {
        /**
         * @param {number} [viewportWidth=1280] 
         * @param {number} [viewportHeight=720] 
         */
        constructor(viewportWidth = 1280, viewportHeight = 720) {
            // Viewport dimensions
            this.viewportWidth = viewportWidth;
            this.viewportHeight = viewportHeight;

            // Interpolated camera center (world coords)
            this.x = 0;
            this.y = 0;

            // Target destination before shake
            this.targetX = 0;
            this.targetY = 0;

            // Lookahead offset
            this.lookaheadX = 0;
            this.lookaheadY = 0;
            this.lookaheadLerp = 0.12;

            // Max lookahead distances (pixels)
            this.standardLookaheadMax = 140;
            this.extendedLookaheadMax = 320;
            this.currentLookaheadMax = this.standardLookaheadMax;

            // Zoom scale (12% closer for intense top-down action)
            this.zoom = 1.12;
            this.targetZoom = 1.12;

            // Camera tilt / roll (radians)
            this.roll = 0;
            this.targetRoll = 0;
            this.maxRoll = 0.045; // ~2.5 degrees max tilt

            // Trauma Screen Shake System
            this.trauma = 0;          // [0..1]
            this.traumaDecay = 1.5;   // Trauma decay per second
            this.shakeOffsetX = 0;
            this.shakeOffsetY = 0;
            this.shakeRoll = 0;
            this.maxShakeOffset = 26; // Max shake displacement (px)
            this.maxShakeAngle = 0.07; // Max shake rotation (rad)

            // Dynamic breathing/bobbing
            this.breathingTimer = 0;
            this.enableBreathing = false;

            // Map boundary clamping (null for infinite)
            this.bounds = null; // { minX, minY, maxX, maxY }
            this.floorPolygon = null;

            // Target follow smoothing factor [0..1]
            this.lerpSpeed = 0.14;
        }

        /**
         * Adds trauma to the camera shake accumulator. Trauma is intentionally
         * additive so several pellets/impacts in the same frame feel heavier,
         * while remaining clamped to a stable [0..1] range.
         * @param {number} amount
         * @returns {number} current trauma
         */
        addTrauma(amount = 0) {
            const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
            this.trauma = Math.min(1, Math.max(0, this.trauma + safeAmount));
            return this.trauma;
        }

        /** Reset all transient impact motion. Used by restart/new-run paths. */
        resetTrauma() {
            this.trauma = 0;
            this.shakeOffsetX = 0;
            this.shakeOffsetY = 0;
            this.shakeRoll = 0;
        }

        /**
         * Resize viewport dimensions.
         * @param {number} width 
         * @param {number} height 
         */
        resize(width, height) {
            this.viewportWidth = width;
            this.viewportHeight = height;
        }

        /**
         * Set bounding box constraints for map clamping.
         * @param {number|null} minX 
         * @param {number|null} minY 
         * @param {number|null} maxX 
         * @param {number|null} maxY 
         */
        setBounds(minX, minY, maxX, maxY) {
            if (minX === null) {
                this.bounds = null;
            } else {
                this.bounds = { minX, minY, maxX, maxY };
            }
        }

        /**
         * Immediately snaps camera position to target coordinates without smoothing.
         * @param {number} x 
         * @param {number} y 
         */
        snapTo(x, y) {
            this.x = x;
            this.y = y;
            this.targetX = x;
            this.targetY = y;
            this.lookaheadX = 0;
            this.lookaheadY = 0;
        }

        /**
         * Sets the lookahead target coordinates.
         * @param {number} x 
         * @param {number} y 
         */
        setTarget(x, y) {
            if (typeof x === 'number' && !isNaN(x)) this.targetX = x;
            if (typeof y === 'number' && !isNaN(y)) this.targetY = y;
        }

        /**
         * Main update loop for camera.
         * @param {number} dt Delta time in seconds
         * @param {Object} [player] Target player entity with {x, y, vx, vy, angle}
         * @param {Object} [input] Input instance with {mouse, isLookaheadDown()}
         */
        update(dt = 1 / 60, player = null, input = null) {
            dt = typeof dt === 'number' && !isNaN(dt) ? Math.min(Math.max(dt, 0.0001), 0.1) : 1 / 60;

            if (isNaN(this.x) || isNaN(this.y)) {
                this.x = (typeof this.targetX === 'number' && !isNaN(this.targetX)) ? this.targetX : 0;
                this.y = (typeof this.targetY === 'number' && !isNaN(this.targetY)) ? this.targetY : 0;
            }

            // 1. Calculate Dynamic Lookahead if player provided
            if (player) {
                let lookBiasX = 0;
                let lookBiasY = 0;

                if (input && (input.mouse || input.worldMouseX !== undefined)) {
                    const mx = input.mouse && typeof input.mouse.worldX === 'number' && !isNaN(input.mouse.worldX) ? input.mouse.worldX : (typeof input.worldMouseX === 'number' && !isNaN(input.worldMouseX) ? input.worldMouseX : player.x);
                    const my = input.mouse && typeof input.mouse.worldY === 'number' && !isNaN(input.mouse.worldY) ? input.mouse.worldY : (typeof input.worldMouseY === 'number' && !isNaN(input.worldMouseY) ? input.worldMouseY : player.y);
                    const dx = mx - player.x;
                    const dy = my - player.y;
                    const dist = Math.hypot(dx, dy);

                    const isShift = input.isLookaheadDown ? input.isLookaheadDown() : (input.isShiftDown || false);
                    const targetMax = isShift ? this.extendedLookaheadMax : this.standardLookaheadMax;
                    const factor = isShift ? 0.65 : 0.28;

                    // Smoothly adjust current maximum lookahead distance
                    this.currentLookaheadMax += (targetMax - this.currentLookaheadMax) * 0.15;

                    if (dist > 1) {
                        const clampedDist = Math.min(dist * factor, this.currentLookaheadMax);
                        lookBiasX = (dx / dist) * clampedDist;
                        lookBiasY = (dy / dist) * clampedDist;
                    }
                }

                // Smooth lookahead interpolation
                this.lookaheadX += (lookBiasX - this.lookaheadX) * this.lookaheadLerp;
                this.lookaheadY += (lookBiasY - this.lookaheadY) * this.lookaheadLerp;

                // 2. Target position with lookahead
                this.targetX = player.x + this.lookaheadX;
                this.targetY = player.y + this.lookaheadY;
                // Frame the playable interior when following an exterior edge.
                // The player remains visible, with more room ahead than void.
                if (this.floorPolygon) {
                    let biasX = 0, biasY = 0;
                    for (let i = 0; i < this.floorPolygon.length; i++) {
                        const a = this.floorPolygon[i], b = this.floorPolygon[(i + 1) % this.floorPolygon.length];
                        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
                        if (!len) continue;
                        const along = ((player.x-a.x)*dx + (player.y-a.y)*dy)/(len*len);
                        if (along < 0 || along > 1) continue;
                        const nx = -dy/len, ny = dx/len;
                        const distance = (player.x-a.x)*nx + (player.y-a.y)*ny;
                        const inset = (Math.abs(nx)*this.viewportWidth + Math.abs(ny)*this.viewportHeight)*0.32/this.zoom;
                        if (distance >= 0 && distance < inset) {
                            const amount = (inset-distance)*0.72;
                            biasX += nx*amount; biasY += ny*amount;
                        }
                    }
                    this.targetX += biasX; this.targetY += biasY;
                }
            }

            // 3. Smooth Camera Follow Lerp
            const lerpSpeed = typeof this.lerpSpeed === 'number' && !isNaN(this.lerpSpeed) ? this.lerpSpeed : 0.14;
            const lerpFactor = Math.max(0, Math.min(1, 1 - Math.pow(1 - lerpSpeed, dt * 60)));
            if (!isNaN(this.targetX)) this.x += (this.targetX - this.x) * lerpFactor;
            if (!isNaN(this.targetY)) this.y += (this.targetY - this.y) * lerpFactor;

            // 4. Map Boundaries Clamping
            if (this.bounds) {
                const halfW = (this.viewportWidth * 0.5) / this.zoom;
                const halfH = (this.viewportHeight * 0.5) / this.zoom;

                if (this.bounds.maxX - this.bounds.minX > this.viewportWidth) {
                    this.x = Math.max(this.bounds.minX + halfW, Math.min(this.bounds.maxX - halfW, this.x));
                }
                if (this.bounds.maxY - this.bounds.minY > this.viewportHeight) {
                    this.y = Math.max(this.bounds.minY + halfH, Math.min(this.bounds.maxY - halfH, this.y));
                }
            }

            // 5. Velocity & Dynamic Tilt (Hotline Miami aesthetic)
            const pvx = player ? (player.vx || 0) : 0;
            const pvy = player ? (player.vy || 0) : 0;
            const speed = Math.hypot(pvx, pvy);
            const lateralSpeed = speed > 8 ? pvx * 0.0005 : 0;

            this.breathingTimer += dt;
            // Idle camera must be perfectly still. A tiny breathing roll looked like
            // permanent screen shake once the camera was zoomed and post-processed.
            const breathingTilt = (this.enableBreathing && speed > 30)
                ? Math.sin(this.breathingTimer * 1.5) * 0.002
                : 0;

            this.targetRoll = Math.max(-this.maxRoll, Math.min(this.maxRoll, -lateralSpeed + breathingTilt));
            this.roll += (this.targetRoll - this.roll) * 0.1;
            if (speed <= 8 && Math.abs(this.roll) < 0.00005) this.roll = 0;

            // 6. Trauma Decay and Screen Shake Generation
            if (this.trauma > 0) {
                this.trauma = Math.max(0, this.trauma - this.traumaDecay * dt);
                const shake = this.trauma * this.trauma;

                this.shakeOffsetX = (Math.random() * 2 - 1) * this.maxShakeOffset * shake;
                this.shakeOffsetY = (Math.random() * 2 - 1) * this.maxShakeOffset * shake;
                this.shakeRoll = (Math.random() * 2 - 1) * this.maxShakeAngle * shake;
            } else {
                this.shakeOffsetX = 0;
                this.shakeOffsetY = 0;
                this.shakeRoll = 0;
            }

            // 7. Zoom interpolation
            this.zoom += (this.targetZoom - this.zoom) * 0.1;
        }

        /**
         * Applies camera transformations (translation, tilt, shake, zoom) to 2D Canvas context.
         * Must be paired with restoreTransform(ctx).
         * @param {CanvasRenderingContext2D} ctx 
         */
        applyTransform(ctx) {
            ctx.save();

            const centerX = (typeof this.viewportWidth === 'number' && !isNaN(this.viewportWidth)) ? this.viewportWidth * 0.5 : 640;
            const centerY = (typeof this.viewportHeight === 'number' && !isNaN(this.viewportHeight)) ? this.viewportHeight * 0.5 : 360;

            // Move to screen center
            ctx.translate(centerX, centerY);

            // Apply total rotation (movement tilt + shake roll)
            const totalRoll = (this.roll || 0) + (this.shakeRoll || 0);
            if (Math.abs(totalRoll) > 0.0001 && !isNaN(totalRoll)) {
                ctx.rotate(totalRoll);
            }

            // Apply zoom
            const z = (typeof this.zoom === 'number' && !isNaN(this.zoom) && this.zoom > 0) ? this.zoom : 1.0;
            if (z !== 1.0) {
                ctx.scale(z, z);
            }

            // Translate by camera world position + shake displacement
            const finalCamX = (typeof this.x === 'number' && !isNaN(this.x) ? this.x : (this.targetX || 0)) + (this.shakeOffsetX || 0);
            const finalCamY = (typeof this.y === 'number' && !isNaN(this.y) ? this.y : (this.targetY || 0)) + (this.shakeOffsetY || 0);
            ctx.translate(-finalCamX, -finalCamY);
        }

        /**
         * Restores context matrix saved in applyTransform.
         * @param {CanvasRenderingContext2D} ctx 
         */
        restoreTransform(ctx) {
            ctx.restore();
        }

        /**
         * Converts screen coordinates to world coordinates accounting for camera roll, zoom, and shake.
         * @param {number} screenX 
         * @param {number} screenY 
         * @returns {{x: number, y: number}}
         */
        screenToWorld(screenX, screenY) {
            const centerX = this.viewportWidth * 0.5;
            const centerY = this.viewportHeight * 0.5;

            // 1. Offset from screen center
            let dx = screenX - centerX;
            let dy = screenY - centerY;

            // 2. Un-rotate
            const totalRoll = this.roll + this.shakeRoll;
            if (Math.abs(totalRoll) > 0.0001) {
                const cos = Math.cos(-totalRoll);
                const sin = Math.sin(-totalRoll);
                const rx = dx * cos - dy * sin;
                const ry = dx * sin + dy * cos;
                dx = rx;
                dy = ry;
            }

            // 3. Un-scale
            dx /= this.zoom;
            dy /= this.zoom;

            // 4. Add camera world position
            const finalCamX = this.x + this.shakeOffsetX;
            const finalCamY = this.y + this.shakeOffsetY;

            return {
                x: dx + finalCamX,
                y: dy + finalCamY
            };
        }

        /**
         * Converts world coordinates to screen coordinates.
         * @param {number} worldX 
         * @param {number} worldY 
         * @returns {{x: number, y: number}}
         */
        worldToScreen(worldX, worldY) {
            const centerX = this.viewportWidth * 0.5;
            const centerY = this.viewportHeight * 0.5;

            const finalCamX = this.x + this.shakeOffsetX;
            const finalCamY = this.y + this.shakeOffsetY;

            let dx = (worldX - finalCamX) * this.zoom;
            let dy = (worldY - finalCamY) * this.zoom;

            const totalRoll = this.roll + this.shakeRoll;
            if (Math.abs(totalRoll) > 0.0001) {
                const cos = Math.cos(totalRoll);
                const sin = Math.sin(totalRoll);
                const rx = dx * cos - dy * sin;
                const ry = dx * sin + dy * cos;
                dx = rx;
                dy = ry;
            }

            return {
                x: dx + centerX,
                y: dy + centerY
            };
        }

        /**
         * Returns current visible bounding box in world coordinates for frustum culling.
         * @param {number} [padding=100] Extra padding around bounds
         * @returns {{left: number, top: number, right: number, bottom: number, width: number, height: number}}
         */
        getVisibleWorldBounds(padding = 100) {
            const roll = this.roll + this.shakeRoll;
            const cos = Math.abs(Math.cos(roll)), sin = Math.abs(Math.sin(roll));
            const halfW = (this.viewportWidth * cos + this.viewportHeight * sin) * 0.5 / this.zoom + padding;
            const halfH = (this.viewportHeight * cos + this.viewportWidth * sin) * 0.5 / this.zoom + padding;
            const finalCamX = this.x + this.shakeOffsetX;
            const finalCamY = this.y + this.shakeOffsetY;

            return {
                left: finalCamX - halfW,
                top: finalCamY - halfH,
                right: finalCamX + halfW,
                bottom: finalCamY + halfH,
                width: halfW * 2,
                height: halfH * 2
            };
        }
    }

    Camera.prototype.apply = Camera.prototype.applyTransform;
    Camera.prototype.restore = Camera.prototype.restoreTransform;
    Camera.prototype.getBounds = Camera.prototype.getVisibleWorldBounds;

    return Camera;
}));
