/**
 * Hotline Miami: VISEO Arcade Edition
 * Retro Audio & Sound Effects Synthesizer - js/engine/audio.js
 * 
 * Uses Web Audio API to synthesize punchy, authentic 80s arcade combat SFX
 * completely procedurally with zero external asset dependencies.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.AudioManager = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    class SoundEngine {
        constructor() {
            this.ctx = null;
            this.masterGain = null;
            this.sfxGain = null;
            this.musicGain = null;
            this.muted = false;
            this.initialized = false;
            this.noiseBuffer = null;

            // Acoustic sound event listeners (e.g. enemy AI hearing)
            this.acousticListeners = [];
        }

        /**
         * Initializes the Web Audio Context (must be triggered by user interaction).
         */
        init() {
            if (this.initialized) return;

            const AudioContextClass = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
            if (!AudioContextClass) return;

            this.ctx = new AudioContextClass();

            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.8;
            this.masterGain.connect(this.ctx.destination);

            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = 0.9;
            this.sfxGain.connect(this.masterGain);

            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = 0.5;
            this.musicGain.connect(this.masterGain);

            this._generateNoiseBuffer();
            this.initialized = true;
        }

        resume() {
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        }

        _ensureContext() {
            if (!this.initialized) {
                this.init();
            }
            this.resume();
        }

        _generateNoiseBuffer() {
            if (!this.ctx) return;
            const bufferSize = this.ctx.sampleRate * 2; // 2 seconds of white noise
            this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const output = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }
        }

        /**
         * Register a callback to receive spatial acoustic noise events for AI hearing.
         * @param {Function} listener callback(x, y, radius, type)
         */
        addAcousticListener(listener) {
            this.acousticListeners.push(listener);
        }

        /**
         * Emits an acoustic sound wave in the game world to alert enemies.
         * @param {number} x World X
         * @param {number} y World Y
         * @param {number} radius Hearing radius (px)
         * @param {string} type Sound type ('gunshot', 'door_slam', 'melee', etc.)
         */
        emitAcousticEvent(x, y, radius, type = 'gunshot') {
            if (radius <= 0) return; // Silent weapons
            for (let i = 0; i < this.acousticListeners.length; i++) {
                try {
                    this.acousticListeners[i](x, y, radius, type);
                } catch (e) {
                    console.error(e);
                }
            }
        }

        // ==================== PROCEDURAL SOUND GENERATORS ====================

        /**
         * Gunshot synthesizer supporting varied calibers.
         */
        playGunshot(type = 'PISTOL', x = 0, y = 0) {
            this._ensureContext();
            if (!this.ctx) return;

            const t = this.ctx.currentTime;

            switch (type) {
                case 'SILENCED_PISTOL': {
                    // Suppressed 'pfft-tick'
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    const filter = this.ctx.createBiquadFilter();

                    filter.type = 'bandpass';
                    filter.frequency.setValueAtTime(1400, t);
                    filter.Q.setValueAtTime(3, t);

                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(450, t);
                    osc.frequency.exponentialRampToValueAtTime(80, t + 0.06);

                    gain.gain.setValueAtTime(0.3, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

                    osc.connect(filter);
                    filter.connect(gain);
                    gain.connect(this.sfxGain);

                    osc.start(t);
                    osc.stop(t + 0.08);

                    this.emitAcousticEvent(x, y, 0, 'silent');
                    break;
                }

                case 'PISTOL': {
                    // 9mm punchy snap + low boom
                    this._playNoiseExplosion(t, 0.22, 1800, 150, 0.7);
                    this._playTone(t, 240, 45, 0.18, 'triangle', 0.6);
                    this.emitAcousticEvent(x, y, 550, 'gunshot');
                    break;
                }

                case 'MAGNUM': {
                    // Heavy .44 caliber cannon
                    this._playNoiseExplosion(t, 0.45, 3200, 80, 1.0);
                    this._playTone(t, 180, 30, 0.35, 'sawtooth', 0.8);
                    this.emitAcousticEvent(x, y, 750, 'gunshot');
                    break;
                }

                case 'SHOTGUN':
                case 'DOUBLE_BARREL': {
                    // Devastating dual-stage shotgun explosion
                    this._playNoiseExplosion(t, 0.38, 2600, 100, 1.0);
                    this._playNoiseExplosion(t + 0.02, 0.32, 1200, 60, 0.8);
                    this._playTone(t, 140, 25, 0.30, 'sine', 0.9);
                    this.emitAcousticEvent(x, y, 850, 'gunshot');
                    break;
                }

                case 'UZI': {
                    // Fast snappy machine pistol
                    this._playNoiseExplosion(t, 0.12, 3500, 300, 0.55);
                    this._playTone(t, 320, 90, 0.09, 'square', 0.35);
                    this.emitAcousticEvent(x, y, 620, 'gunshot');
                    break;
                }

                case 'M16': {
                    // Military rifle crack
                    this._playNoiseExplosion(t, 0.18, 4000, 200, 0.75);
                    this._playTone(t, 280, 60, 0.14, 'sawtooth', 0.5);
                    this.emitAcousticEvent(x, y, 700, 'gunshot');
                    break;
                }

                default:
                    this._playNoiseExplosion(t, 0.2, 2000, 200, 0.6);
                    this.emitAcousticEvent(x, y, 500, 'gunshot');
            }
        }

        /**
         * Empty gun click (dry fire).
         */
        playDryFire() {
            this._ensureContext();
            if (!this.ctx) return;
            const t = this.ctx.currentTime;
            this._playTone(t, 1200, 800, 0.03, 'sine', 0.3);
            this._playTone(t + 0.02, 600, 400, 0.04, 'triangle', 0.25);
        }

        /**
         * Melee whoosh / swing sound.
         */
        playMeleeSwing(weaponType = 'BAT') {
            this._ensureContext();
            if (!this.ctx) return;
            const t = this.ctx.currentTime;

            if (weaponType === 'KNIFE' || weaponType === 'KATANA') {
                // High pitch razor slice whoosh
                this._playFilteredNoise(t, 0.12, 3500, 1200, 0.35);
            } else if (weaponType === 'AXE') {
                // Heavy cleave
                this._playFilteredNoise(t, 0.20, 1800, 400, 0.55);
                this._playTone(t, 180, 60, 0.18, 'sine', 0.4);
            } else {
                // Bat / Pipe / Fists blunt whoosh
                this._playFilteredNoise(t, 0.15, 2200, 600, 0.4);
                this._playTone(t, 220, 80, 0.14, 'sine', 0.3);
            }
        }

        /**
         * Melee hit / flesh impact / skull crunch.
         */
        playMeleeHit(isLethal = true, weaponType = 'BAT') {
            this._ensureContext();
            if (!this.ctx) return;
            const t = this.ctx.currentTime;

            if (weaponType === 'KNIFE' || weaponType === 'KATANA') {
                // Wet slash
                this._playNoiseExplosion(t, 0.18, 4000, 1200, 0.6);
                this._playTone(t, 400, 150, 0.12, 'sawtooth', 0.4);
            } else {
                // Blunt crunch / bone shatter
                this._playNoiseExplosion(t, 0.22, 1500, 120, 0.8);
                this._playTone(t, 160, 35, 0.20, 'triangle', 0.7);
            }
        }

        /**
         * Door kick / slam physics boom.
         */
        playDoorSlam(x = 0, y = 0) {
            this._ensureContext();
            if (!this.ctx) return;
            const t = this.ctx.currentTime;
            this._playNoiseExplosion(t, 0.30, 800, 80, 0.9);
            this._playTone(t, 120, 20, 0.25, 'triangle', 0.8);
            this.emitAcousticEvent(x, y, 320, 'door_slam');
        }

        /**
         * Thrown weapon wall hit / ricochet.
         */
        playWeaponThrowHit(x = 0, y = 0) {
            this._ensureContext();
            if (!this.ctx) return;
            const t = this.ctx.currentTime;
            this._playTone(t, 900, 300, 0.08, 'square', 0.4);
            this._playNoiseExplosion(t, 0.08, 2500, 800, 0.35);
            this.emitAcousticEvent(x, y, 200, 'wall_hit');
        }

        /**
         * Weapon pickup click.
         */
        playWeaponPickup() {
            this._ensureContext();
            if (!this.ctx) return;
            const t = this.ctx.currentTime;
            this._playTone(t, 520, 840, 0.06, 'triangle', 0.35);
            this._playTone(t + 0.04, 880, 1200, 0.08, 'sine', 0.4);
        }

        /**
         * Ground execution brutality sequence SFX.
         */
        playExecutionHit(step = 1) {
            this._ensureContext();
            if (!this.ctx) return;
            const t = this.ctx.currentTime;
            // Progressive crunching thud
            const pitch = 140 - step * 20;
            this._playNoiseExplosion(t, 0.25, 2000, 90, 0.9);
            this._playTone(t, pitch, 25, 0.22, 'sawtooth', 0.8);
        }

        /**
         * Enemy alert shout / exclamation sting.
         */
        playAlertSound() {
            this._ensureContext();
            if (!this.ctx) return;
            const t = this.ctx.currentTime;
            // Sharp retro sting
            this._playTone(t, 440, 880, 0.12, 'sawtooth', 0.4);
        }

        /**
         * Attack Dog bark / snarl.
         */
        playDogBark() {
            this._ensureContext();
            if (!this.ctx) return;
            const t = this.ctx.currentTime;
            this._playTone(t, 280, 120, 0.15, 'sawtooth', 0.6);
            this._playFilteredNoise(t, 0.12, 1200, 300, 0.5);
        }

        /**
         * Death groan / player flatline.
         */
        playDeath() {
            this._ensureContext();
            if (!this.ctx) return;
            const t = this.ctx.currentTime;
            this._playNoiseExplosion(t, 0.6, 1200, 50, 1.0);
            this._playTone(t, 200, 30, 0.5, 'sine', 0.9);
        }

        // ==================== LOW LEVEL AUDIO UTILITIES ====================

        _playTone(time, startFreq, endFreq, duration, type = 'sine', volume = 0.5) {
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(startFreq, time);
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), time + duration);

            gain.gain.setValueAtTime(volume, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

            osc.connect(gain);
            gain.connect(this.sfxGain);

            osc.start(time);
            osc.stop(time + duration + 0.02);
        }

        _playNoiseExplosion(time, duration, startFreq, endFreq, volume = 0.5) {
            if (!this.ctx || !this.noiseBuffer) return;

            const noise = this.ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(startFreq, time);
            filter.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), time + duration);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(volume, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.sfxGain);

            noise.start(time);
            noise.stop(time + duration + 0.02);
        }

        _playFilteredNoise(time, duration, startFreq, endFreq, volume = 0.5) {
            if (!this.ctx || !this.noiseBuffer) return;

            const noise = this.ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(startFreq, time);
            filter.frequency.exponentialRampToValueAtTime(Math.max(50, endFreq), time + duration);
            filter.Q.setValueAtTime(2.0, time);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(volume, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.sfxGain);

            noise.start(time);
            noise.stop(time + duration + 0.02);
        }
    }

    const instance = new SoundEngine();
    instance.SoundEngine = SoundEngine;
    return instance;
}));
