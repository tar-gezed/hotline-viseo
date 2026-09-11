/**
 * Hotline Miami: VISEO Arcade Edition - Procedural Sound Effects Synthesizer
 * 100% Web Audio API procedural synthesis with zero asset download latency.
 * Generates gunshots, melee impacts, visceral gore, door kicks, glass shatters,
 * pitch-scaling combo chimes, airhorns, and UI audio cues.
 */

class SoundEffectsEngine {
  constructor() {
    this.ctx = null;
    this.isInitialized = false;
    this.masterGain = null;
    this.sfxVolume = 0.85;
    this.isMuted = false;
  }

  /**
   * Initialize AudioContext on first user interaction
   */
  init() {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    // Share AudioContext with synthMusic if available, or create new
    if (window.synthMusic && window.synthMusic.ctx) {
      this.ctx = window.synthMusic.ctx;
    } else {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      this.ctx = new AudioContextClass();
    }

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.sfxVolume, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.isInitialized = true;
  }

  setVolume(vol) {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.sfxVolume, this.ctx.currentTime);
    }
  }

  setMute(isMuted) {
    this.isMuted = isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.sfxVolume, this.ctx.currentTime);
    }
  }

  _ensureReady() {
    if (!this.isInitialized) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return !!this.ctx;
  }

  /**
   * Create a panner node if spatial coordinates are supplied
   */
  _createSpatialNode(time, panX = 0) {
    if (!this.ctx || !this.masterGain) return null;
    if (!this.ctx.createStereoPanner) return this.masterGain;
    try {
      const panner = this.ctx.createStereoPanner();
      const safePan = (typeof panX === 'number' && Number.isFinite(panX)) ? Math.max(-1, Math.min(1, panX)) : 0;
      const safeTime = (typeof time === 'number' && Number.isFinite(time)) ? time : (this.ctx.currentTime || 0);
      panner.pan.setValueAtTime(safePan, safeTime);
      panner.connect(this.masterGain);
      return panner;
    } catch (e) {
      return this.masterGain;
    }
  }

  /**
   * Procedural White/Pink Noise Buffer Generator
   */
  _createNoiseBuffer(duration = 0.2) {
    if (!this.ctx) return null;
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = Math.floor(sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // ==========================================
  // GUNSHOTS & FIREARMS
  // ==========================================

  /**
   * 9mm Pistol Pop (Crisp, punchy, classic Hotline Miami)
   */
  playPistol(panX = 0) {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;
    const target = this._createSpatialNode(now, panX);

    // 1. High Velocity Noise Crack
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer(0.18);

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(3200, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(300, now + 0.14);
    noiseFilter.Q.setValueAtTime(2.0, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.9, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(target);

    // 2. Punch Transient Pop
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.08);

    oscGain.gain.setValueAtTime(1.0, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(oscGain);
    oscGain.connect(target);

    noise.start(now);
    noise.stop(now + 0.18);
    osc.start(now);
    osc.stop(now + 0.09);

    // Subtle shell ping shortly after
    setTimeout(() => this.playShellPing(panX), 120);
  }

  /**
   * Silenced Pistol "Pew / Thwip"
   */
  playSilenced(panX = 0) {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;
    const target = this._createSpatialNode(now, panX);

    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1600, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.06);

    oscGain.gain.setValueAtTime(0.7, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    // Highpass noise puff
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer(0.08);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2800, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(target);

    osc.connect(oscGain);
    oscGain.connect(target);

    osc.start(now);
    osc.stop(now + 0.08);
    noise.start(now);
    noise.stop(now + 0.08);
  }

  /**
   * .44 Magnum Cannon (Heavy reverberant bass boom)
   */
  playMagnum(panX = 0) {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;
    const target = this._createSpatialNode(now, panX);

    // 1. Deep Sub Boom
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(180, now);
    subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.28);

    subGain.gain.setValueAtTime(1.3, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    subOsc.connect(subGain);
    subGain.connect(target);

    // 2. Heavy Distortion / Wide Noise Shockwave
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer(0.35);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4500, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.3);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(1.0, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(target);

    subOsc.start(now);
    subOsc.stop(now + 0.35);
    noise.start(now);
    noise.stop(now + 0.35);

    setTimeout(() => this.playShellPing(panX), 240);
  }

  /**
   * Pump Shotgun Blast (Thunderous multi-stage blast)
   */
  playShotgun(panX = 0) {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;
    const target = this._createSpatialNode(now, panX);

    // Layer 1: Sub Punch
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(220, now);
    subOsc.frequency.exponentialRampToValueAtTime(30, now + 0.24);

    subGain.gain.setValueAtTime(1.2, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    subOsc.connect(subGain);
    subGain.connect(target);

    // Layer 2: Wideband Scatter Explosion
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer(0.42);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(5500, now);
    filter.frequency.exponentialRampToValueAtTime(400, now + 0.36);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(1.1, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(target);

    subOsc.start(now);
    subOsc.stop(now + 0.3);
    noise.start(now);
    noise.stop(now + 0.42);

    // Mechanical Pump Action Racking Sound after 280ms
    setTimeout(() => this._playPumpRack(panX), 280);
  }

  _playPumpRack(panX = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const target = this._createSpatialNode(now, panX);

    // Pump slide backward
    const osc1 = this.ctx.createOscillator();
    const g1 = this.ctx.createGain();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(800, now);
    osc1.frequency.exponentialRampToValueAtTime(350, now + 0.06);
    g1.gain.setValueAtTime(0.28, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc1.connect(g1);
    g1.connect(target);
    osc1.start(now);
    osc1.stop(now + 0.07);

    // Pump slide forward
    const osc2 = this.ctx.createOscillator();
    const g2 = this.ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(400, now + 0.08);
    osc2.frequency.linearRampToValueAtTime(900, now + 0.14);
    g2.gain.setValueAtTime(0.35, now + 0.08);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc2.connect(g2);
    g2.connect(target);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.16);
  }

  /**
   * Uzi Rapid Fire Chatter
   */
  playUzi(panX = 0) {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;
    const target = this._createSpatialNode(now, panX);

    // Sharp metallic crack
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer(0.09);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(4200, now);
    filter.Q.setValueAtTime(3.0, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.85, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(target);

    // Transient pitch pop
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(360, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.05);

    oscGain.gain.setValueAtTime(0.65, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(oscGain);
    oscGain.connect(target);

    noise.start(now);
    noise.stop(now + 0.09);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  /**
   * M16 Assault Rifle Snap
   */
  playM16(panX = 0) {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;
    const target = this._createSpatialNode(now, panX);

    // Supersonic Crack
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.11);

    oscGain.gain.setValueAtTime(0.95, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(oscGain);
    oscGain.connect(target);

    // High velocity gunpowder blast
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer(0.22);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2600, now);
    filter.Q.setValueAtTime(1.8, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.9, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(target);

    osc.start(now);
    osc.stop(now + 0.12);
    noise.start(now);
    noise.stop(now + 0.22);
  }

  // ==========================================
  // MELEE & WEAPON SWINGS
  // ==========================================

  /**
   * Weapon Swing / Whoosh
   */
  playMeleeSwing(panX = 0) {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;
    const target = this._createSpatialNode(now, panX);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer(0.16);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.exponentialRampToValueAtTime(1800, now + 0.08);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.15);
    filter.Q.setValueAtTime(2.5, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.45, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(target);

    noise.start(now);
    noise.stop(now + 0.16);
  }

  /**
   * Baseball Bat Heavy Crack (Solid wood impact)
   */
  playBatCrack(panX = 0) {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;
    const target = this._createSpatialNode(now, panX);

    // High wood resonance pop
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.14);

    oscGain.gain.setValueAtTime(0.8, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(oscGain);
    oscGain.connect(target);

    // Heavy blunt thump
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(160, now);
    sub.frequency.exponentialRampToValueAtTime(40, now + 0.12);
    subGain.gain.setValueAtTime(0.9, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    sub.connect(subGain);
    subGain.connect(target);

    osc.start(now);
    osc.stop(now + 0.15);
    sub.start(now);
    sub.stop(now + 0.15);
  }

  /**
   * Knife Slash (Sharp razor cutting slice)
   */
  playKnifeSlash(panX = 0) {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;
    const target = this._createSpatialNode(now, panX);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer(0.18);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(3200, now);
    filter.frequency.exponentialRampToValueAtTime(1200, now + 0.16);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.75, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(target);

    noise.start(now);
    noise.stop(now + 0.18);
  }

  /**
   * Katana Flesh Cleave (Resonant blade + deep slice)
   */
  playKatanaCleave(panX = 0) {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;
    const target = this._createSpatialNode(now, panX);

    // Metallic ring
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.2);

    oscGain.gain.setValueAtTime(0.5, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(oscGain);
    oscGain.connect(target);

    // Deep flesh slice noise
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer(0.24);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(450, now + 0.22);
    filter.Q.setValueAtTime(2.2, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.9, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(target);

    osc.start(now);
    osc.stop(now + 0.22);
    noise.start(now);
    noise.stop(now + 0.25);
  }

  /**
   * Pipe Metallic Clang
   */
  playPipeHit(panX = 0) {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;
    const target = this._createSpatialNode(now, panX);

    // High metal resonant ping (FM ping)
    const carrier = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const gain = this.ctx.createGain();

    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(740, now);

    mod.type = 'square';
    mod.frequency.setValueAtTime(320, now);
    modGain.gain.setValueAtTime(600, now);
    modGain.gain.exponentialRampToValueAtTime(1, now + 0.2);

    gain.gain.setValueAtTime(0.85, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(gain);
    gain.connect(target);

    mod.start(now);
    carrier.start(now);
    mod.stop(now + 0.26);
    carrier.stop(now + 0.26);
  }

  // ==========================================
  // COMBAT & VISCERAL GORE
  // ==========================================

  /**
   * Skull Crunch / Execution Final Strike
   */
  playSkullCrunch(panX = 0) {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;
    const target = this._createSpatialNode(now, panX);

    // 1. Heavy visceral bone snap (distorted lowpass burst)
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer(0.28);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(160, now + 0.22);
    filter.Q.setValueAtTime(3.5, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(1.2, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(target);

    // 2. Heavy Sub Bass Thud
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.2);

    oscGain.gain.setValueAtTime(1.1, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(oscGain);
    oscGain.connect(target);

    noise.start(now);
    noise.stop(now + 0.28);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  /**
   * Execution Multi-stage Thud (Step 1, Step 2, Step 3)
   */
  playExecutionThud(step = 1, panX = 0) {
    if (step >= 3) {
      this.playSkullCrunch(panX);
    } else {
      this.playBatCrack(panX);
    }
  }

  /**
   * Enemy Death Groan
   */
  playDeathGroan(pitchMod = 1.0, panX = 0) {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;
    const target = this._createSpatialNode(now, panX);

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    const startPitch = (180 + Math.random() * 60) * pitchMod;
    osc.frequency.setValueAtTime(startPitch, now);
    osc.frequency.exponentialRampToValueAtTime(startPitch * 0.4, now + 0.35);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(650, now);
    filter.frequency.linearRampToValueAtTime(280, now + 0.35);
    filter.Q.setValueAtTime(3.0, now);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.65, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(target);

    osc.start(now);
    osc.stop(now + 0.4);
  }

  /**
   * Body Collapsing / Falling onto Floor
   */
  playBodyCollapse(panX = 0) {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;
    const target = this._createSpatialNode(now, panX);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.18);

    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(target);

    osc.start(now);
    osc.stop(now + 0.22);
  }

  /**
   * Fresh Blood Splat / Gush
   */
  playBloodSplat(panX = 0) {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;
    const target = this._createSpatialNode(now, panX);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer(0.15);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(350, now + 0.12);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(target);

    noise.start(now);
    noise.stop(now + 0.15);
  }

  // ==========================================
  // ENVIRONMENT & WEAPON FEEDBACK
  // ==========================================

  /**
   * Door Kick Slam
   */
  playDoorKick(panX = 0) {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;
    const target = this._createSpatialNode(now, panX);

    // Low explosive punch
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.25);

    oscGain.gain.setValueAtTime(1.1, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(oscGain);
    oscGain.connect(target);

    // Wood splintering crash
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer(0.32);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.3);
    filter.Q.setValueAtTime(1.8, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.9, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(target);

    osc.start(now);
    osc.stop(now + 0.3);
    noise.start(now);
    noise.stop(now + 0.32);
  }

  /**
   * Glass Window / Pane Shatter
   */
  playGlassShatter(panX = 0) {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;
    const target = this._createSpatialNode(now, panX);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer(0.45);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(4500, now);
    filter.frequency.linearRampToValueAtTime(2500, now + 0.4);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.85, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(target);

    // Tinkle chimes
    for (let i = 0; i < 3; i++) {
      const chime = this.ctx.createOscillator();
      const chimeGain = this.ctx.createGain();
      chime.type = 'sine';
      chime.frequency.setValueAtTime(2400 + Math.random() * 2000, now + i * 0.05);
      chimeGain.gain.setValueAtTime(0.3, now + i * 0.05);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.12);

      chime.connect(chimeGain);
      chimeGain.connect(target);
      chime.start(now + i * 0.05);
      chime.stop(now + i * 0.05 + 0.13);
    }

    noise.start(now);
    noise.stop(now + 0.45);
  }

  /**
   * Brass Shell Casing Bounce Ping
   */
  playShellPing(panX = 0) {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;
    const target = this._createSpatialNode(now, panX);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    const f = 3200 + (Math.random() * 400 - 200);
    osc.frequency.setValueAtTime(f, now);
    osc.frequency.exponentialRampToValueAtTime(f * 0.85, now + 0.08);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(target);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  /**
   * Dry Fire Empty Trigger Click
   */
  playDryClick() {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.025);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.035);
  }

  /**
   * Weapon Pickup / Equip Clatter
   */
  playWeaponPickup() {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.08);

    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  /**
   * Supply Crate / Ammo Refill Ping
   */
  playAmmoRefill() {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;

    const freqs = [440, 554, 659, 880];
    freqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + i * 0.04);

      gain.gain.setValueAtTime(0.35, now + i * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.12);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now + i * 0.04);
      osc.stop(now + i * 0.04 + 0.13);
    });
  }

  // ==========================================
  // ARCADE FEEDBACK & SCORE CHIMES
  // ==========================================

  /**
   * Dynamic Rising Pitch Combo Multiplier Chime (x2 up to x16+)
   */
  playComboChime(comboCount = 2) {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;

    // Pentatonic scale index
    const scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66];
    const idx = Math.min(scale.length - 1, Math.max(0, comboCount - 2));
    const baseFreq = scale[idx];

    // Dual Synth Sine / Square Pluck
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(baseFreq, now);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(baseFreq * 2.0, now);

    gain.gain.setValueAtTime(0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.36);
    osc2.stop(now + 0.36);
  }

  /**
   * 80s Arcade Wave Start Siren / Airhorn
   */
  playWaveStart() {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;

    // Dual-tone Synth Siren
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';

    osc1.frequency.setValueAtTime(330, now);
    osc1.frequency.linearRampToValueAtTime(580, now + 0.25);
    osc1.frequency.linearRampToValueAtTime(440, now + 0.5);

    osc2.frequency.setValueAtTime(333, now);
    osc2.frequency.linearRampToValueAtTime(586, now + 0.25);
    osc2.frequency.linearRampToValueAtTime(444, now + 0.5);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.05);
    gain.gain.setValueAtTime(0.45, now + 0.45);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.68);
    osc2.stop(now + 0.68);
  }

  /**
   * Radiant Wave Clear Fanfare
   */
  playWaveClear() {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;

    const chords = [
      [523.25, 659.25, 783.99], // C Major
      [587.33, 739.99, 880.00], // D Major
      [659.25, 830.61, 987.77], // E Major
    ];

    chords.forEach((chord, step) => {
      const stepTime = now + step * 0.16;
      chord.forEach(freq => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, stepTime);

        gain.gain.setValueAtTime(0.28, stepTime);
        gain.gain.exponentialRampToValueAtTime(0.001, stepTime + 0.45);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(stepTime);
        osc.stop(stepTime + 0.5);
      });
    });
  }

  /**
   * UI Hover Tick
   */
  playUiHover() {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.035);
  }

  /**
   * UI Select / Confirm Slap
   */
  playUiSelect() {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  playGunshot(type, x = 0, y = 0) {
    const t = (type || '').toLowerCase();
    if (t.includes('shotgun') || t.includes('double')) return this.playShotgun();
    if (t.includes('magnum')) return this.playMagnum();
    if (t.includes('silence')) return this.playSilenced();
    if (t.includes('uzi') || t.includes('mac')) return this.playUzi();
    if (t.includes('rifle') || t.includes('m16') || t.includes('assault')) return this.playM16();
    return this.playPistol();
  }

  playMeleeImpact(type = 'bat', isFlesh = true) {
    const t = (type || '').toLowerCase();
    if (t.includes('katana') || t.includes('axe') || t.includes('knife')) {
      if (t.includes('katana')) return this.playKatanaCleave();
      return this.playKnifeSlash();
    }
    if (t.includes('pipe') || t.includes('lead')) return this.playPipeHit();
    if (isFlesh) return this.playSkullCrunch();
    return this.playBatCrack();
  }

  playExecution(step = 1) {
    this.playExecutionThud(step);
    this.playSkullCrunch();
  }

  playShellBounce(type = 'brass') {
    this.playShellPing();
  }

  playEmptyClick() {
    this.playDryClick();
  }

  playWeaponThrow() {
    this.playMeleeSwing();
  }

  playFleshImpact() {
    this.playBloodSplat();
  }

  playPlayerDeath() {
    this.playDeathGroan(0.9);
    this.playBodyCollapse();
  }

  playGameOverDrone() {
    this.playDeathGroan(0.5);
  }

  /**
   * Mobster Detection Alert "SHING / !" sound (Iconic Hotline Miami alert sting)
   */
  playAlertSound(panX = 0) {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;
    const target = this._createSpatialNode(now, panX) || this.masterGain;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(980, now);
      osc.frequency.exponentialRampToValueAtTime(1960, now + 0.06);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(target);

      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) {}
  }

  /**
   * Attack Dog Bark / Snarl
   */
  playDogBark(panX = 0) {
    if (!this._ensureReady()) return;
    const now = this.ctx.currentTime;
    const target = this._createSpatialNode(now, panX) || this.masterGain;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 0.12);

      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(target);

      osc.start(now);
      osc.stop(now + 0.16);
    } catch (e) {}
  }
}

// Audio Compatibility Aliases
SoundEffectsEngine.prototype.playWaveStartSiren = SoundEffectsEngine.prototype.playWaveStart;
SoundEffectsEngine.prototype.playWaveClearFanfare = SoundEffectsEngine.prototype.playWaveClear;
SoundEffectsEngine.prototype.playDryFire = SoundEffectsEngine.prototype.playDryClick;
SoundEffectsEngine.prototype.playMeleeHit = function(isLethal, weaponId) {
  return this.playMeleeImpact(weaponId, isLethal);
};
SoundEffectsEngine.prototype.playExecutionHit = SoundEffectsEngine.prototype.playExecution;
SoundEffectsEngine.prototype.playDeath = SoundEffectsEngine.prototype.playPlayerDeath;
SoundEffectsEngine.prototype.playWeaponThrowHit = function(x, y) {
  return this.playMeleeImpact('pipe', false);
};
SoundEffectsEngine.prototype.playDoorSlam = SoundEffectsEngine.prototype.playDoorKick;

// Singleton export
const soundFx = new SoundEffectsEngine();

if (typeof window !== 'undefined') {
  window.soundFx = soundFx;
  window.soundFX = soundFx;
  window.soundEffects = soundFx;
  window.AudioManager = soundFx;
  window.SoundEffects = SoundEffectsEngine;
  window.SoundEffectsEngine = SoundEffectsEngine;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { soundFx, soundFX: soundFx, AudioManager: soundFx, SoundEffects: SoundEffectsEngine, SoundEffectsEngine };
}
