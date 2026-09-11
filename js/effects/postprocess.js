/**
 * ============================================================================
 * HOTLINE MIAMI: VISEO ARCADE EDITION - POST-PROCESSING & SCREEN FX
 * js/effects/postprocess.js
 * ============================================================================
 * Features:
 *  - 80s Synthwave CRT Scanlines & Curved Monitor Vignette (Toggleable)
 *  - High-performance Chromatic Aberration RGB-Split (Surges on Kills/Combos)
 *  - Dynamic Neon Color Grading (Cyan / Magenta / Yellow disco pulse)
 *  - Slow-Motion Hit Stop (Visceral 50-80ms micro-pause on lethal impacts)
 *  - Trauma-Based Screen Shake (Rotational & translational violent punch)
 *  - Fullscreen Screen Flashes (Kill flash, blood damage flash, combo pulse)
 * ============================================================================
 */

(function (global) {
  'use strict';

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  class PostProcessor {
    constructor(width = 800, height = 600) {
      if (typeof width === 'object' && width !== null && width.width !== undefined) {
        this.height = width.height || 600;
        this.width = width.width || 800;
      } else {
        this.width = width || 800;
        this.height = height || 600;
      }

      // Post-process settings
      this.crtEnabled = false;
      this.chromaticAberrationEnabled = true;
      this.vignetteEnabled = true;
      this.neonGradingEnabled = false;

      // Trauma & Screen Shake
      this.trauma = 0.0; // 0.0 to 1.0 (decays quadratically)
      this.maxShakeAngle = 0.065; // radians (~3.7 degrees)
      this.maxShakeOffset = 18; // pixels
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
      this.shakeAngle = 0;
      this.shakeDecay = 1.4; // trauma decay per second

      // Hit Stop (Slow-mo impact freeze frame)
      this.hitStopDuration = 0;
      this.hitStopTimer = 0;
      this.hitStopTimeScale = 0.0;

      // Chromatic Aberration
      this.baseAberration = 0; // Color separation belongs to impacts, not every edge.
      this.currentAberration = 0;
      this.targetAberration = 0;
      this.aberrationAngle = 0;

      // Screen Flash
      this.flashColor = '#ffffff';
      this.flashAlpha = 0.0;
      this.flashDuration = 0.0;
      this.flashTimer = 0.0;

      // Neon Color Grading & Music Disco Pulse
      this.neonHue = 320; // Magenta -> Cyan -> Yellow cycle
      this.neonPulseTimer = 0;
      this.comboLevel = 0;
      this.comboPulseIntensity = 0.0;

      // Glitch Bar Artifacts (Random VHS tape tracking noise)
      this.glitchTimer = 0;
      this.glitchActive = false;
      this.glitchY = 0;
      this.glitchHeight = 0;
      this.glitchOffset = 0;

      // Scanline Canvas Pattern Cache
      this.scanlinePattern = null;
      this.initScanlinePattern();

      // Offscreen RGB split buffer canvas
      this.rgbCanvas = document.createElement('canvas');
      this.rgbCanvas.width = this.width;
      this.rgbCanvas.height = this.height;
      this.rgbCtx = this.rgbCanvas.getContext('2d', { willReadFrequently: false });
    }

    /**
     * Create cached pattern for authentic retro CRT scanlines
     */
    initScanlinePattern() {
      const pCanvas = document.createElement('canvas');
      pCanvas.width = 4;
      pCanvas.height = 4;
      const pCtx = pCanvas.getContext('2d');

      // Top 2px transparent, bottom 2px dark scanline bar
      pCtx.fillStyle = 'rgba(0, 0, 0, 0.055)';
      pCtx.fillRect(0, 2, 4, 2);

      // Subtle RGB phosphor dot matrix
      pCtx.fillStyle = 'rgba(255, 0, 0, 0)';
      pCtx.fillRect(0, 0, 1, 2);
      pCtx.fillStyle = 'rgba(0, 255, 0, 0)';
      pCtx.fillRect(1, 0, 1, 2);
      pCtx.fillStyle = 'rgba(0, 0, 255, 0)';
      pCtx.fillRect(2, 0, 1, 2);

      this.scanlinePattern = pCanvas;
    }

    /**
     * Resize internal buffers
     */
    resize(width, height) {
      if (this.width === width && this.height === height) return;
      this.width = width;
      this.height = height;
      this.rgbCanvas.width = width;
      this.rgbCanvas.height = height;
    }

    // =========================================================================
    // TRAUMA & SHAKE
    // =========================================================================

    /**
     * Add trauma for explosive screen shake (decays smoothly)
     * e.g., Shotgun blast = 0.5, Katana kill = 0.3, Execution = 0.7, Door slam = 0.4
     */
    addTrauma(amount) {
      this.trauma = Math.min(1.0, this.trauma + amount);
    }

    shake(amount) {
      this.addTrauma(amount);
    }

    resetTransientEffects() {
      this.trauma = 0;
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
      this.shakeAngle = 0;
      this.hitStopDuration = 0;
      this.hitStopTimer = 0;
      this.flashTimer = 0;
      this.flashAlpha = 0;
      this.currentAberration = this.baseAberration;
      this.targetAberration = this.baseAberration;
      this.glitchActive = false;
      this.glitchTimer = 0;
      this.glitchOffset = 0;
    }

    // =========================================================================
    // HIT STOP & IMPACT SLOW-MO
    // =========================================================================

    /**
     * Trigger micro freeze frame on lethal impact (50-80ms)
     */
    triggerHitStop(durationMs = 60, timeScale = 0.0) {
      this.hitStopDuration = durationMs / 1000;
      this.hitStopTimer = this.hitStopDuration;
      this.hitStopTimeScale = timeScale;
    }

    /**
     * Check if currently in hit stop
     */
    isHitStopped() {
      return this.hitStopTimer > 0;
    }

    /**
     * Get effective time delta multiplier (0.0 during hit stop, 1.0 normal)
     */
    getTimeScale() {
      if (this.hitStopTimer > 0) return this.hitStopTimeScale;
      return 1.0;
    }

    // =========================================================================
    // FLASH & ABERRATION SURGES
    // =========================================================================

    /**
     * Trigger screen flash (White kill flash, red damage flash, neon flash)
     */
    triggerFlash(color = '#ffffff', duration = 0.08, maxAlpha = 0.6) {
      this.flashColor = color;
      this.flashDuration = duration;
      this.flashTimer = duration;
      this.flashAlpha = maxAlpha;
    }

    /**
     * Surge chromatic aberration on kills / combo increases
     */
    surgeAberration(amount = 7.0) {
      this.currentAberration = Math.min(18.0, this.currentAberration + amount);
    }

    /**
     * Set current combo level to drive neon disco background pulse
     */
    setComboLevel(comboCount) {
      this.comboLevel = comboCount;
      if (comboCount > 1) {
        this.surgeAberration(Math.min(1.2 * comboCount, 8.0));
      }
    }

    /**
     * Toggle CRT scanlines on/off
     */
    toggleCRT(state = null) {
      if (state !== null) {
        this.crtEnabled = state;
      } else {
        this.crtEnabled = !this.crtEnabled;
      }
      return this.crtEnabled;
    }

    // =========================================================================
    // UPDATE CYCLE
    // =========================================================================

    update(dt) {
      // 1. Update Hit Stop
      if (this.hitStopTimer > 0) {
        this.hitStopTimer -= dt;
        if (this.hitStopTimer < 0) this.hitStopTimer = 0;
      }

      // 2. Update Trauma & Screen Shake
      if (this.trauma > 0) {
        this.trauma -= this.shakeDecay * dt;
        if (this.trauma < 0) this.trauma = 0;

        // Quadratic trauma formula: Shake = Trauma^2
        const shakePower = this.trauma * this.trauma;
        this.shakeOffsetX = (Math.random() * 2 - 1) * this.maxShakeOffset * shakePower;
        this.shakeOffsetY = (Math.random() * 2 - 1) * this.maxShakeOffset * shakePower;
        this.shakeAngle = (Math.random() * 2 - 1) * this.maxShakeAngle * shakePower;
      } else {
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;
        this.shakeAngle = 0;
      }

      // 3. Update Chromatic Aberration decay back to base
      if (this.currentAberration > this.baseAberration) {
        this.currentAberration -= (this.currentAberration - this.baseAberration) * 6.0 * dt;
        if (this.currentAberration < this.baseAberration) {
          this.currentAberration = this.baseAberration;
        }
      }

      // 4. Update Screen Flash
      if (this.flashTimer > 0) {
        this.flashTimer -= dt;
        if (this.flashTimer < 0) this.flashTimer = 0;
      }

      // 5. Neon Color Cycle & Pulse
      this.neonPulseTimer += dt * (1.2 + this.comboLevel * 0.4);
      this.neonHue = (this.neonHue + dt * 25) % 360;

      // 6. Glitch bar artifact chance
      this.glitchTimer += dt;
      if (this.glitchActive) {
        this.glitchActive = false;
      } else if (this.glitchTimer > rand(2.5, 6.0)) {
        this.glitchTimer = 0;
        this.glitchActive = true;
        this.glitchY = rand(0, this.height);
        this.glitchHeight = rand(4, 25);
        this.glitchOffset = rand(-12, 12);
      }
    }

    // =========================================================================
    // CAMERA PRE-RENDER TRANSFORM (Applies screen shake to game world)
    // =========================================================================

    /**
     * Apply camera screen shake before drawing game entities
     */
    applyCameraShake(ctx) {
      if (this.trauma > 0) {
        ctx.save();
        ctx.translate(this.width / 2 + this.shakeOffsetX, this.height / 2 + this.shakeOffsetY);
        ctx.rotate(this.shakeAngle);
        ctx.translate(-this.width / 2, -this.height / 2);
      }
    }

    /**
     * Restore camera transform after drawing game entities
     */
    restoreCameraShake(ctx) {
      if (this.trauma > 0) {
        ctx.restore();
      }
    }

    // =========================================================================
    // POST-PROCESSING RENDER PASS
    // =========================================================================

    /**
     * Apply full post-processing pipeline from sourceCanvas to targetCtx
     */
    render(sourceCanvas, targetCtx) {
      const w = this.width;
      const h = this.height;

      // 1. Chromatic Aberration / RGB Split Pass
      // Always preserve a full-luminance base frame. The previous implementation
      // multiplied the actual target by three solid channel colors at alpha=1,
      // which crushed luminance and made the whole game blue/black.
      targetCtx.clearRect(0, 0, w, h);
      targetCtx.drawImage(sourceCanvas, 0, 0, w, h);

      if (this.chromaticAberrationEnabled && this.currentAberration > 0.8) {
        const shift = Math.min(8, this.currentAberration);
        const rgbCtx = this.rgbCtx;
        const channelPass = (dx, dy, tint, alpha) => {
          rgbCtx.save();
          rgbCtx.clearRect(0, 0, w, h);
          rgbCtx.globalCompositeOperation = 'source-over';
          rgbCtx.globalAlpha = 1;
          rgbCtx.drawImage(sourceCanvas, dx, dy, w, h);
          rgbCtx.globalCompositeOperation = 'multiply';
          rgbCtx.fillStyle = tint;
          rgbCtx.fillRect(0, 0, w, h);
          rgbCtx.restore();

          targetCtx.save();
          targetCtx.globalCompositeOperation = 'screen';
          targetCtx.globalAlpha = alpha;
          targetCtx.drawImage(this.rgbCanvas, 0, 0, w, h);
          targetCtx.restore();
        };

        // Subtle VHS fringing: visible on bright edges, nearly invisible on floors.
        channelPass(-shift, -shift * 0.35, '#ff2038', 0.10);
        channelPass( shift,  shift * 0.35, '#2070ff', 0.10);
      }

      // 2. Glitch Bar VHS Distortion
      if (this.glitchActive) {
        targetCtx.save();
        targetCtx.drawImage(
          sourceCanvas,
          0, this.glitchY, w, this.glitchHeight,
          this.glitchOffset, this.glitchY, w, this.glitchHeight
        );
        targetCtx.fillStyle = 'rgba(255, 0, 255, 0.15)';
        targetCtx.fillRect(0, this.glitchY, w, this.glitchHeight);
        targetCtx.restore();
      }

      // 3. Dynamic Neon Color Grading & Disco Glow
      if (this.neonGradingEnabled) {
        targetCtx.save();
        targetCtx.globalCompositeOperation = 'overlay';

        // Pulse intensity scales with combo
        const pulse = (Math.sin(this.neonPulseTimer) + 1) * 0.5;
        const gradingAlpha = 0.05 + pulse * 0.07 + (this.comboLevel > 0 ? 0.08 : 0);

        targetCtx.globalAlpha = gradingAlpha;
        targetCtx.fillStyle = `hsl(${this.neonHue}, 100%, 50%)`;
        targetCtx.fillRect(0, 0, w, h);
        targetCtx.restore();
      }

      // 4. CRT Scanlines & Phosphor Grid Overlay
      if (this.crtEnabled && this.scanlinePattern) {
        targetCtx.save();
        targetCtx.fillStyle = targetCtx.createPattern(this.scanlinePattern, 'repeat');
        targetCtx.fillRect(0, 0, w, h);

        // CRT Subtle Rolling Bar
        const scanY = (Date.now() * 0.06) % h;
        const scanGrad = targetCtx.createLinearGradient(0, scanY - 30, 0, scanY + 30);
        scanGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        scanGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)');
        scanGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        targetCtx.fillStyle = scanGrad;
        targetCtx.fillRect(0, scanY - 30, w, 60);

        targetCtx.restore();
      }

      // 5. Retro CRT Monitor Curvature Vignette
      if (this.vignetteEnabled) {
        targetCtx.save();
        const vigGrad = targetCtx.createRadialGradient(
          w / 2, h / 2, Math.min(w, h) * 0.35,
          w / 2, h / 2, Math.max(w, h) * 0.72
        );
        vigGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vigGrad.addColorStop(0.72, 'rgba(10, 0, 20, 0.16)');
        vigGrad.addColorStop(1, 'rgba(0, 0, 0, 0.48)');

        targetCtx.fillStyle = vigGrad;
        targetCtx.fillRect(0, 0, w, h);
        targetCtx.restore();
      }

      // 6. Impact / Kill / Damage Fullscreen Flash
      if (this.flashTimer > 0 && this.flashAlpha > 0) {
        targetCtx.save();
        const currentAlpha = (this.flashTimer / this.flashDuration) * this.flashAlpha;
        targetCtx.globalAlpha = Math.max(0, Math.min(1.0, currentAlpha));
        targetCtx.fillStyle = this.flashColor;
        targetCtx.fillRect(0, 0, w, h);
        targetCtx.restore();
      }
    }

    /**
     * Direct overlay apply pass on game canvas context
     */
    apply(targetCtx, sourceCanvas) {
      const w = this.width;
      const h = this.height;

      // 1. Neon grading overlay if active
      if (this.neonGradingEnabled && this.comboLevel > 0) {
        targetCtx.save();
        targetCtx.globalCompositeOperation = 'overlay';
        const pulse = (Math.sin(this.neonPulseTimer) + 1) * 0.5;
        targetCtx.globalAlpha = 0.04 + pulse * 0.05;
        targetCtx.fillStyle = `hsl(${this.neonHue}, 100%, 50%)`;
        targetCtx.fillRect(0, 0, w, h);
        targetCtx.restore();
      }

      // 2. CRT Scanlines & Phosphor Grid Overlay
      if (this.crtEnabled && this.scanlinePattern) {
        targetCtx.save();
        targetCtx.fillStyle = targetCtx.createPattern(this.scanlinePattern, 'repeat');
        targetCtx.fillRect(0, 0, w, h);

        const scanY = (Date.now() * 0.06) % h;
        const scanGrad = targetCtx.createLinearGradient(0, scanY - 30, 0, scanY + 30);
        scanGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        scanGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)');
        scanGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        targetCtx.fillStyle = scanGrad;
        targetCtx.fillRect(0, scanY - 30, w, 60);
        targetCtx.restore();
      }

      // 3. Retro CRT Monitor Curvature Vignette
      if (this.vignetteEnabled) {
        targetCtx.save();
        const vigGrad = targetCtx.createRadialGradient(
          w / 2, h / 2, Math.min(w, h) * 0.35,
          w / 2, h / 2, Math.max(w, h) * 0.72
        );
        vigGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vigGrad.addColorStop(0.72, 'rgba(10, 0, 20, 0.16)');
        vigGrad.addColorStop(1, 'rgba(0, 0, 0, 0.46)');

        targetCtx.fillStyle = vigGrad;
        targetCtx.fillRect(0, 0, w, h);
        targetCtx.restore();
      }

      // 4. Impact / Kill / Damage Fullscreen Flash
      if (this.flashTimer > 0 && this.flashAlpha > 0) {
        targetCtx.save();
        const currentAlpha = (this.flashTimer / this.flashDuration) * this.flashAlpha;
        targetCtx.globalAlpha = Math.max(0, Math.min(1.0, currentAlpha));
        targetCtx.fillStyle = this.flashColor;
        targetCtx.fillRect(0, 0, w, h);
        targetCtx.restore();
      }
    }
  }

  // Aliases & convenience methods
  PostProcessor.prototype.screenFlash = function(color = '#ffffff', duration = 0.15) {
    this.triggerFlash(color, duration);
  };
  PostProcessor.prototype.hitStop = function(durationSec = 0.06) {
    this.triggerHitStop(typeof durationSec === 'number' && durationSec < 1 ? durationSec * 1000 : durationSec);
  };
  PostProcessor.prototype.toggleScanlines = function() {
    this.toggleCRT();
  };

  // Export
  global.PostProcessor = PostProcessor;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PostProcessor };
  }
})(typeof window !== 'undefined' ? window : this);
