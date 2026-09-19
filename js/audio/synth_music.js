/**
 * Hotline Miami: VISEO Arcade Edition - Procedural Synthwave Music Engine
 * Generates real-time 80s dark synthwave BGM with multi-channel synthesis,
 * sidechained 4-on-the-floor kicks, rolling 16th analog bass arpeggios,
 * lush chorus pads, retro lead riffs, and dynamic adrenaline orchestration.
 */

// The original score stays first. New scores use explicit pitches per chord;
// bass figures address chord members, never a minor interval over a major triad.
const COMBAT_TRACKS = [
  { id: 'original', title: 'Original — Combat', bpm: 124, bars: 4, legacy: true },
  { id: 'neon-lockdown', title: 'Neon Lockdown', bpm: 124, bars: 24, tone: 'square', cutoff: 2400,
    chords: ['D2 F2 A2', 'F2 A2 C3', 'C2 E2 G2', 'Bb1 D2 F2'],
    bass: [0,3,1,3,2,3,1,3,0,3,1,3,2,3,2,3],
    rhythm: [0,3,6,8,11,14], gate: 0.82,
    melody: ['D4 F4 A4 D5 C5 A4', 'C5 A4 F4 A4 G4 F4', 'G4 E4 G4 C5 D5 C5', 'Bb4 A4 F4 D4 F4 A4'],
    answer: ['A4 F4 D4 F4 A4 D5', 'C5 A4 F4 C5 A4 F4', 'E4 G4 C5 G4 E4 G4', 'F4 D4 Bb3 D4 F4 A4'] },
  { id: 'chrome-pursuit', title: 'Chrome Pursuit', bpm: 130, bars: 24, tone: 'sawtooth', cutoff: 2600,
    chords: ['A1 C2 E2', 'F2 A2 C3', 'G1 B1 D2', 'E2 G2 B2'],
    bass: [0,3,0,null,2,3,1,3,0,3,0,null,2,3,1,2],
    rhythm: [0,2,4,7,8,10,12,14], gate: 0.72,
    melody: ['A4 A4 E4 G4 A4 C5 E5 C5', 'A4 A4 F4 G4 A4 C5 A4 F4', 'G4 G4 D4 A4 B4 D5 B4 G4', 'G4 G4 E4 F4 G4 B4 G4 E4'],
    answer: ['E5 C5 A4 G4 E4 G4 A4 C5', 'C5 A4 F4 G4 A4 G4 F4 A4', 'D5 B4 G4 A4 B4 A4 G4 D4', 'B4 G4 E4 F4 G4 F4 E4 G4'] },
  { id: 'violet-afterburn', title: 'Violet Afterburn', bpm: 120, bars: 24, tone: 'triangle', cutoff: 2200,
    chords: ['D2 F2 A2', 'Bb1 D2 F2', 'F2 A2 C3', 'C2 E2 G2'],
    bass: [0,null,3,2,0,null,1,3,0,null,3,2,0,null,1,2],
    rhythm: [0,4,6,8,12,14], gate: 0.9,
    melody: ['A4 F4 G4 A4 D5 C5', 'Bb4 F4 A4 Bb4 D5 F5', 'C5 A4 G4 F4 A4 C5', 'G4 E4 F4 G4 C5 E5'],
    answer: ['F5 D5 C5 A4 F4 E4', 'F4 D4 C4 Bb3 D4 F4', 'A4 F4 G4 A4 C5 A4', 'G4 E4 D4 C4 E4 G4'] },
  { id: 'redline-protocol', title: 'Redline Protocol', bpm: 132, bars: 24, tone: 'square', cutoff: 2300,
    chords: ['E2 G2 B2', 'C2 E2 G2', 'A1 C2 E2', 'B1 D2 Fs2'],
    bass: [0,0,3,null,2,0,3,1,0,0,3,null,2,3,1,2],
    rhythm: [0,3,4,6,8,11,12,14], gate: 0.65,
    melody: ['E4 B4 E4 G4 B4 A4 G4 E4', 'E4 G4 E4 G4 C5 B4 G4 E4', 'E4 A4 E4 C5 A4 G4 E4 C4', 'Fs4 B4 Fs4 A4 B4 A4 Fs4 D4'],
    answer: ['G4 B4 G4 E4 B4 A4 G4 E4', 'G4 C5 G4 E4 C5 B4 G4 E4', 'A4 C5 A4 E4 C5 B4 A4 E4', 'B4 D5 B4 Fs4 D5 C5 B4 Fs4'] },
  { id: 'last-elevator', title: 'Last Elevator', bpm: 126, bars: 24, tone: 'sawtooth', cutoff: 2500,
    chords: ['A1 C2 E2', 'G1 B1 D2', 'F2 A2 C3', 'E2 G2 B2'],
    bass: [0,3,2,3,1,3,2,3,0,3,2,3,1,3,2,3],
    rhythm: [0,3,6,8,12,14], gate: 0.85,
    melody: ['E4 A4 C5 E5 C5 A4', 'D5 B4 G4 B4 D5 B4', 'C5 A4 F4 A4 C5 A4', 'B4 G4 E4 G4 B4 G4'],
    answer: ['C5 B4 A4 E4 A4 C5', 'B4 A4 G4 D4 G4 B4', 'A4 G4 F4 C4 F4 A4', 'G4 F4 E4 B3 E4 G4'] }
].map(track => track.legacy ? track : {
  ...track,
  chords: track.chords.map(chord => chord.split(' ')),
  melody: track.melody.map(phrase => phrase.split(' ')),
  answer: track.answer.map(phrase => phrase.split(' '))
});

class SynthMusicEngine {
  constructor() {
    this.ctx = null;
    this.isInitialized = false;
    this.isPlaying = false;
    this.isMuted = false;
    this.volume = 0.7;
    this.currentTrack = null; // 'menu', 'combat', 'wave_clear', 'game_over', 'results'

    // Timing & Sequencer
    this.bpm = 124;
    this.baseBpm = 124;
    this.targetBpm = 124;
    this.step = 0;
    this.bar = 0;
    this.totalSteps = 64; // 4 bars of 16 steps
    this.combatTracks = COMBAT_TRACKS;
    this.combatTrackIndex = -1;
    this.combatTrack = null;
    this.nextNoteTime = 0;
    this.scheduleAheadTime = 0.12; // 120ms lookahead
    this.timerId = null;

    // Intensity / Adrenaline level (0.0 to 1.0)
    this.intensity = 0.0;

    // Audio Graph Nodes
    this.masterGain = null;
    this.limiter = null;
    this.duckingGain = null; // Sidechain bus for bass & pads
    this.directBus = null;   // Drums & leads
    this.reverbBus = null;

    // Scale Frequencies (Full chromatic scale catalogue across all octaves)
    this.notes = {
      C1: 32.70, Cs1: 34.65, Db1: 34.65, D1: 36.71, Ds1: 38.89, Eb1: 38.89, E1: 41.20, F1: 43.65, Fs1: 46.25, Gb1: 46.25, G1: 49.00, Gs1: 51.91, Ab1: 51.91, A1: 55.00, As1: 58.27, Bb1: 58.27, B1: 61.74,
      C2: 65.41, Cs2: 69.30, Db2: 69.30, D2: 73.42, Ds2: 77.78, Eb2: 77.78, E2: 82.41, F2: 87.31, Fs2: 92.50, Gb2: 92.50, G2: 98.00, Gs2: 103.83, Ab2: 103.83, A2: 110.00, As2: 116.54, Bb2: 116.54, B2: 123.47,
      C3: 130.81, Cs3: 138.59, Db3: 138.59, D3: 146.83, Ds3: 155.56, Eb3: 155.56, E3: 164.81, F3: 174.61, Fs3: 185.00, Gb3: 185.00, G3: 196.00, Gs3: 207.65, Ab3: 207.65, A3: 220.00, As3: 233.08, Bb3: 233.08, B3: 246.94,
      C4: 261.63, Cs4: 277.18, Db4: 277.18, D4: 293.66, Ds4: 311.13, Eb4: 311.13, E4: 329.63, F4: 349.23, Fs4: 369.99, Gb4: 369.99, G4: 392.00, Gs4: 415.30, Ab4: 415.30, A4: 440.00, As4: 466.16, Bb4: 466.16, B4: 493.88,
      C5: 523.25, Cs5: 554.37, Db5: 554.37, D5: 587.33, Ds5: 622.25, Eb5: 622.25, E5: 659.25, F5: 698.46, Fs5: 739.99, Gb5: 739.99, G5: 783.99, Gs5: 830.61, Ab5: 830.61, A5: 880.00, As5: 932.33, Bb5: 932.33, B5: 987.77,
      C6: 1046.50, D6: 1174.66, E6: 1318.51, F6: 1396.91, G6: 1567.98, A6: 1760.00, B6: 1975.53
    };

    // Cached synthetic impulse response for 80s gated digital reverb
    this.reverbBuffer = null;
    this.activeVoices = new Set();
    this.noiseBuffers = new Map();
  }

  /**
   * Initialize AudioContext on first user interaction
   */
  init() {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume()?.catch(() => { /* Browser policy: retry on user activation. */ });
      }
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      console.warn('Web Audio API not supported in this browser.');
      return;
    }

    this.ctx = new AudioContextClass();

    // Master Dynamics & Limiter
    if (typeof this.ctx.createDynamicsCompressor === 'function') {
      this.limiter = this.ctx.createDynamicsCompressor();
      if (this.limiter.threshold) this.limiter.threshold.setValueAtTime(-2.0, this.ctx.currentTime);
      if (this.limiter.knee) this.limiter.knee.setValueAtTime(4.0, this.ctx.currentTime);
      if (this.limiter.ratio) this.limiter.ratio.setValueAtTime(14.0, this.ctx.currentTime);
      if (this.limiter.attack) this.limiter.attack.setValueAtTime(0.003, this.ctx.currentTime);
      if (this.limiter.release) this.limiter.release.setValueAtTime(0.15, this.ctx.currentTime);
    } else {
      this.limiter = this.ctx.createGain();
    }

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);

    // Sidechain Ducking Bus (pumps when kick hits)
    this.duckingGain = this.ctx.createGain();
    this.duckingGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

    // Direct Bus (drums and transients)
    this.directBus = this.ctx.createGain();
    this.directBus.gain.setValueAtTime(1.0, this.ctx.currentTime);

    // 80s Reverb Convolver Bus
    this.reverbBus = this.ctx.createGain();
    this.reverbBus.gain.setValueAtTime(0.35, this.ctx.currentTime);
    if (typeof this.ctx.createConvolver === 'function') {
      try {
        this.convolver = this.ctx.createConvolver();
        this.convolver.buffer = this._generateReverbImpulse(1.6, 2.5);
        this.reverbBus.connect(this.convolver);
        this.convolver.connect(this.limiter);
      } catch (e) {
        this.reverbBus.connect(this.limiter);
      }
    } else {
      this.reverbBus.connect(this.limiter);
    }

    // Graph Routing: duckingBus -> limiter, directBus -> limiter, limiter -> masterGain -> destination
    this.duckingGain.connect(this.limiter);
    this.directBus.connect(this.limiter);
    // The compressor is not a brick-wall limiter: reserve headroom for transients
    // even when the user sets music volume to 100%.
    this.outputHeadroom = this.ctx.createGain();
    this.outputHeadroom.gain.setValueAtTime(0.6, this.ctx.currentTime);
    this.limiter.connect(this.outputHeadroom);
    this.outputHeadroom.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.isInitialized = true;

    // Handle background tab suspend / resume
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.ctx && this.ctx.state === 'running') {
        // keep context going or pause gracefully
      } else if (!document.hidden && this.ctx && this.ctx.state === 'suspended' && this.isPlaying) {
        this.ctx.resume()?.catch(() => { /* Browser policy: retry on user activation. */ });
      }
    });
  }

  /**
   * Procedurally generate 80s gated neon reverb impulse response
   */
  _generateReverbImpulse(duration, decay) {
    if (!this.ctx) return null;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / length;
      const n = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      left[i] = n * (0.8 + 0.2 * Math.sin(i * 0.05));
      right[i] = n * (0.8 + 0.2 * Math.cos(i * 0.05));
    }
    return impulse;
  }

  /**
   * Play specific soundtrack: 'menu', 'combat', 'wave_clear', 'game_over'
   */
  play(trackName) {
    if (!this.isInitialized) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume()?.catch(() => { /* Browser policy: retry on user activation. */ });
    }

    if (!this.ctx) return;

    if (this.currentTrack === trackName && this.isPlaying) {
      return;
    }

    this._releaseVoices();
    this.masterGain.gain.linearRampToValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime + 0.05);
    this.currentTrack = trackName;
    this.isPlaying = true;
    this.step = 0;
    this.bar = 0;

    if (trackName === 'combat') {
      this.combatTrackIndex = (this.combatTrackIndex + 1) % this.combatTracks.length;
      this.combatTrack = this.combatTracks[this.combatTrackIndex];
      this.bpm = this.baseBpm = this.targetBpm = this.combatTrack.bpm;
    } else if (trackName === 'menu') {
      this.bpm = 100;
      this.baseBpm = 100;
      this.targetBpm = 100;
    } else if (trackName === 'wave_clear') {
      this.bpm = 92;
      this.baseBpm = 92;
      this.targetBpm = 92;
    } else if (trackName === 'game_over') {
      this.bpm = 60;
      this.baseBpm = 60;
      this.targetBpm = 60;
    } else if (trackName === 'results') {
      this.bpm = this.baseBpm = this.targetBpm = 84;
    }

    this.totalSteps = trackName === 'combat' ? this.combatTrack.bars * 16 : 64;
    if (trackName === 'results') this.totalSteps = 128;
    if (this.timerId) {
      clearInterval(this.timerId);
    }

    this.nextNoteTime = this.ctx ? this.ctx.currentTime + 0.05 : 0;
    this.timerId = setInterval(() => this._scheduler(), 25);
  }

  /**
   * Stop music playback
   */
  stop() {
    this._releaseVoices();
    this.isPlaying = false;
    this.currentTrack = null;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Set master music volume (0.0 to 1.0)
   */
  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  /**
   * Toggle mute
   */
  setMute(isMuted) {
    this.isMuted = isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  toggleMute() {
    this.setMute(!this.isMuted);
    return this.isMuted;
  }

  setMasterVolume(vol) {
    this.setVolume(vol);
  }

  /**
   * Dynamic adrenaline intensity (0.0 to 1.0)
   * Higher intensity boosts filter cutoffs and percussion/counterpoint density
   */
  setIntensity(level) {
    this.intensity = Math.max(0, Math.min(1, level));
    if (this.currentTrack === 'combat') {
      // Stable groove: adrenaline changes orchestration, never the song's tempo.
      this.targetBpm = this.baseBpm;
    }
  }

  /**
   * Lookahead Web Audio scheduler loop
   */
  _scheduler() {
    if (!this.isPlaying || !this.ctx) return;

    // Smooth tempo lerp
    this.bpm += (this.targetBpm - this.bpm) * 0.08;
    const secondsPerStep = (60.0 / this.bpm) / 4; // 16th notes

    // Do not emit a burst of missed notes after a throttled background tab.
    if (this.nextNoteTime < this.ctx.currentTime - this.scheduleAheadTime) {
      this.nextNoteTime = this.ctx.currentTime + 0.02;
    }

    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this._scheduleStep(this.step, this.nextNoteTime);
      this.nextNoteTime += secondsPerStep;
      this.step = (this.step + 1) % this.totalSteps;
      this.bar = Math.floor(this.step / 16);
    }
  }

  /**
   * Dispatch patterns based on current active track
   */
  _scheduleStep(step, time) {
    if (this.currentTrack === 'combat') {
      this._scheduleCombatTrack(step, time);
    } else if (this.currentTrack === 'menu') {
      this._scheduleMenuTrack(step, time);
    } else if (this.currentTrack === 'wave_clear') {
      this._scheduleWaveClearTrack(step, time);
    } else if (this.currentTrack === 'game_over') {
      this._scheduleGameOverTrack(step, time);
    } else if (this.currentTrack === 'results') {
      this._scheduleResultsTrack(step, time);
    }
  }

  // Original eight-bar after-hours loop: Dm9 / Bbmaj7 / Fmaj7 / Cadd9.
  // Half-time drums, warm sustained pads and a sparse answering bell melody.
  _scheduleResultsTrack(step, time) {
    const bar = Math.floor(step / 16) % 8, tick = step % 16, dt = 15 / this.bpm;
    const chords = [
      ['D3', 'F3', 'A3', 'E4'], ['Bb2', 'D3', 'F3', 'A3'],
      ['F3', 'A3', 'C4', 'E4'], ['C3', 'E3', 'G3', 'D4']
    ];
    const chord = chords[Math.floor(bar / 2)].map(n => this.notes[n]);
    if (tick === 0) this._synthPad(time, chord, dt * 15.8, .23);
    if (tick === 0 || tick === 10) this._synthKick(time, .38);
    if (tick === 8) this._synthSnare(time, .19);
    if (tick === 2 || tick === 6 || tick === 10 || tick === 14) this._synthHiHat(time, .11);
    if (tick === 0 || tick === 8) this._synthAnalogBass(time, chord[0] / 2, .35, 0, dt * 3);
    const melody = [
      ['A4', 'E4', 'F4'], ['D4', 'F4', 'E4'], ['F4', 'A4', 'D4'], ['A4', 'F4', 'D4'],
      ['E4', 'C4', 'A4'], ['G4', 'E4', 'C4'], ['G4', 'D4', 'E4'], ['D4', 'E4', 'A4']
    ];
    const note = [3, 7, 14].indexOf(tick);
    if (note >= 0) this._synthPluck(time, this.notes[melody[bar][note]], .16);
  }

  // 24 bars (~44–48 seconds): hook x2, bass break, answer, full reprise x2.
  _scheduleCombatTrack(step, time) {
    const track = this.combatTrack || this.combatTracks[0];
    if (track.legacy) return this._scheduleOriginalCombatTrack(step % 64, time);
    const bar = Math.floor(step / 16) % track.bars;
    const tick = step % 16;
    const chordBar = bar % 4;
    const chord = track.chords[chordBar].map(note => this.notes[note]);
    const dt = 15 / this.bpm;
    const breakdown = bar >= 8 && bar < 12;
    const finale = bar >= 16;
    const fill = bar % 8 === 7;

    // Keep the original's dependable four-on-the-floor drive, even in the break.
    if (tick % 4 === 0) {
      this._synthKick(time, 0.95);
      this._triggerSidechainDucking(time);
    }
    if (tick === 4 || tick === 12) this._synthSnare(time, breakdown ? 0.56 : 0.8);
    if (tick % 2 === 0 || (!breakdown && (finale || this.intensity > 0.6))) {
      this._synthHiHat(time, tick % 4 === 2 ? 0.48 : tick % 2 ? 0.2 : 0.25, tick % 2 === 1);
    }
    if (!breakdown && tick === 14) this._synthOpenHat(time, 0.32);
    if (fill && (tick === 13 || tick === 15)) this._synthSnare(time, tick === 13 ? 0.28 : 0.42);

    const degree = track.bass[tick];
    if (degree !== null) {
      // 0/1/2 = root/third/fifth, 3 = root an octave up. Major thirds stay major.
      let freq = chord[degree % 3] * (degree >= 3 ? 1 : 0.5);
      if (freq < 32) freq *= 2; // Keep A/Bb/B/G roots above inaudible sub-bass.
      this._synthAnalogBass(time, freq, tick % 4 === 0 ? 0.95 : 0.72,
        (breakdown ? 0 : 200) + this.intensity * 350, dt * 0.88);
    }
    // Change pad WITH its chord and release before the next bar, not across it.
    if (tick === 0) {
      this._synthPad(time, chord.map(f => f * 2), dt * 15.7, breakdown ? 0.24 : 0.28);
    }
    const phrase = (bar >= 12 && bar < 16) || bar >= 20 ? track.answer : track.melody;
    const eventIndex = track.rhythm.indexOf(tick);
    if (!breakdown && eventIndex !== -1) {
      const next = track.rhythm[eventIndex + 1] ?? 16;
      const duration = (next - tick) * dt * track.gate;
      this._synthLead(time, this.notes[phrase[chordBar][eventIndex]], duration, 0.29, track);
    }
    // Sparse, quiet, consonant response instead of a competing high melody.
    if ((breakdown || finale) && (tick === 6 || tick === 14)) {
      this._synthPluck(time, chord[tick === 6 ? 2 : 1] * 4, breakdown ? 0.22 : 0.1);
    }
  }

  // Preserved original four-bar score: pitches, rhythms, fills and voicing.
  _scheduleOriginalCombatTrack(step, time) {
    const stepInBar = step % 16;
    const bar = Math.floor(step / 16);

    // 1. Four-on-the-floor Driving Kick on beats 1, 2, 3, 4 (steps 0, 4, 8, 12)
    if (stepInBar % 4 === 0) {
      this._synthKick(time, 1.0);
      this._triggerSidechainDucking(time);
    }

    // 2. Snappy 80s Snare / Clap on beats 2 & 4 (steps 4, 12)
    if (stepInBar === 4 || stepInBar === 12) {
      this._synthSnare(time, 0.9);
      if (bar === 3 && stepInBar === 12) {
        // Roll fill on 4th bar
        this._synthSnare(time + 0.12, 0.6);
        this._synthSnare(time + 0.18, 0.75);
      }
    }

    // 3. 16th-note Hi-Hats with 80s velocity swing
    const isOffbeat = stepInBar % 2 === 1;
    const hatVelocity = (stepInBar % 4 === 2) ? 0.65 : (isOffbeat ? 0.45 : 0.25);
    this._synthHiHat(time, hatVelocity, isOffbeat);

    if (stepInBar === 14 && bar === 3) {
      this._synthOpenHat(time, 0.7);
    }

    // 4. Rolling 16th-Note Analog Bassline (D Minor Synthwave Arpeggio)
    // Chord progression: Bar 0: Dm, Bar 1: F, Bar 2: C, Bar 3: Bb (or Gm)
    const bassChords = [
      ['D1', 'D2', 'F1', 'D2', 'A1', 'D2', 'F1', 'D2', 'D1', 'D2', 'F1', 'D2', 'C2', 'D2', 'F2', 'D2'],
      ['F1', 'F2', 'A1', 'F2', 'C2', 'F2', 'A1', 'F2', 'F1', 'F2', 'A1', 'F2', 'E2', 'F2', 'G2', 'F2'],
      ['C1', 'C2', 'E1', 'C2', 'G1', 'C2', 'E1', 'C2', 'C1', 'C2', 'E1', 'C2', 'D2', 'C2', 'G2', 'C2'],
      ['Bb1', 'Bb2', 'D2', 'Bb2', 'F1', 'Bb2', 'D2', 'Bb2', 'Bb1', 'Bb2', 'A1', 'A2', 'G1', 'G2', 'A1', 'C2'],
    ];

    const currentBassNote = bassChords[bar][stepInBar];
    if (currentBassNote && this.notes[currentBassNote]) {
      const accent = (stepInBar % 4 === 0) ? 1.0 : 0.75;
      const cutoffBoost = this.intensity * 800;
      this._synthAnalogBass(time, this.notes[currentBassNote], accent, cutoffBoost);
    }

    // 5. Dreamy Chorus Synth Pads on Bar Starts
    if (stepInBar === 0) {
      const padChords = [
        [this.notes.D3, this.notes.F3, this.notes.A3, this.notes.D4],
        [this.notes.F3, this.notes.A3, this.notes.C4, this.notes.F4],
        [this.notes.C3, this.notes.E3, this.notes.G3, this.notes.C4],
        [this.notes.Bb2, this.notes.D3, this.notes.F3, this.notes.Bb3],
      ];
      this._synthPad(time, padChords[bar], (60.0 / this.bpm) * 4);
    }

    // 6. Catchy Retro Synth Lead Riffs (Active on bars 1..3 and high intensity)
    const leadPatterns = [
      // Bar 0: Atmospheric opening lick
      { 0: 'D4', 3: 'F4', 6: 'A4', 8: 'D5', 11: 'C5', 14: 'A4' },
      // Bar 1: Driving sequence
      { 0: 'A4', 2: 'F4', 4: 'A4', 6: 'C5', 8: 'E5', 10: 'D5', 12: 'C5', 14: 'A4' },
      // Bar 2: Soaring hook
      { 0: 'G4', 3: 'E4', 6: 'G4', 8: 'C5', 10: 'E5', 12: 'G5', 14: 'E5' },
      // Bar 3: Climax resolution & drop
      { 0: 'F4', 2: 'D4', 4: 'F4', 6: 'Bb4', 8: 'D5', 10: 'C5', 12: 'A4', 14: 'G4' },
    ];

    const leadNoteName = leadPatterns[bar][stepInBar];
    if (leadNoteName && this.notes[leadNoteName]) {
      this._synthLead(time, this.notes[leadNoteName], 0.28);
    }

    // Extra adrenaline counter-melody when combo/intensity is high
    if (this.intensity > 0.5 && stepInBar % 2 === 0) {
      const arpHook = ['D5', 'F5', 'A5', 'D6', 'C6', 'A5', 'F5', 'E5'];
      const arpNote = arpHook[(stepInBar / 2 + bar * 2) % arpHook.length];
      if (this.notes[arpNote]) {
        this._synthPluck(time, this.notes[arpNote], 0.35 * this.intensity);
      }
    }
  }

  // ==========================================
  // TRACK 2: RETRO MENU / LOBBY THEME (100 BPM)
  // ==========================================
  _scheduleMenuTrack(step, time) {
    const stepInBar = step % 16;
    const bar = Math.floor(step / 16);

    // Gentle sub kick on beat 1 and 3
    if (stepInBar === 0 || stepInBar === 8) {
      this._synthKick(time, 0.65, true);
    }

    // Soft rim/hi-hat on offbeats
    if (stepInBar % 4 === 2) {
      this._synthHiHat(time, 0.35, true);
    }

    // Smooth hypnotic chill bass arpeggio
    const menuBass = [
      ['D2', null, 'A2', null, 'F2', null, 'D2', null, 'E2', null, 'F2', null, 'A2', null, 'C3', null],
      ['Bb1', null, 'F2', null, 'D2', null, 'Bb1', null, 'C2', null, 'D2', null, 'F2', null, 'A2', null],
      ['G1', null, 'D2', null, 'Bb1', null, 'G1', null, 'A1', null, 'Bb1', null, 'D2', null, 'F2', null],
      ['A1', null, 'E2', null, 'C2', null, 'A1', null, 'Bb1', null, 'C2', null, 'E2', null, 'G2', null],
    ];

    const note = menuBass[bar][stepInBar];
    if (note && this.notes[note]) {
      this._synthAnalogBass(time, this.notes[note], 0.55, 0, 0.25);
    }

    // Nostalgic shimmering pads
    if (stepInBar === 0) {
      const menuPads = [
        [this.notes.D3, this.notes.F3, this.notes.A3, this.notes.C4],
        [this.notes.Bb2, this.notes.D3, this.notes.F3, this.notes.A3],
        [this.notes.G2, this.notes.Bb2, this.notes.D3, this.notes.F3],
        [this.notes.A2, this.notes.C3, this.notes.E3, this.notes.G3],
      ];
      this._synthPad(time, menuPads[bar], (60.0 / this.bpm) * 4, 0.4);
    }

    // Dreamy high chime pluck
    if (stepInBar === 4 || stepInBar === 12) {
      const chimeNotes = ['A4', 'C5', 'D5', 'F5', 'E5', 'G5', 'A5'];
      const cNote = chimeNotes[(bar * 2 + (stepInBar === 12 ? 1 : 0)) % chimeNotes.length];
      this._synthPluck(time, this.notes[cNote], 0.3);
    }
  }

  // ==========================================
  // TRACK 3: WAVE CLEAR VICTORY JINGLE (92 BPM)
  // ==========================================
  _scheduleWaveClearTrack(step, time) {
    const stepInBar = step % 16;
    const bar = Math.floor(step / 16);

    // Warm celebratory major/modal progression: F - G - A (Triumphant D Dorian / F Major)
    if (stepInBar === 0 && bar === 0) {
      this._synthKick(time, 0.9);
      this._synthPad(time, [this.notes.F3, this.notes.A3, this.notes.C4, this.notes.E4], 2.0, 0.6);
      this._synthLead(time, this.notes.A4, 0.5);
    } else if (stepInBar === 8 && bar === 0) {
      this._synthLead(time, this.notes.C5, 0.5);
    } else if (stepInBar === 0 && bar === 1) {
      this._synthKick(time, 0.9);
      this._synthPad(time, [this.notes.G3, this.notes.B3, this.notes.D4, this.notes.G4], 2.0, 0.6);
      this._synthLead(time, this.notes.D5, 0.6);
    } else if (stepInBar === 8 && bar === 1) {
      this._synthLead(time, this.notes.E5, 0.6);
    } else if (stepInBar === 0 && bar === 2) {
      this._synthKick(time, 1.0);
      this._synthPad(time, [this.notes.D3, this.notes.F3, this.notes.A3, this.notes.D4], 3.5, 0.7);
      this._synthLead(time, this.notes.D5, 1.2);
    }

    if (stepInBar % 4 === 0 && bar < 2) {
      this._synthHiHat(time, 0.3);
    }
  }

  // ==========================================
  // TRACK 4: GAME OVER EERIE DRONE (60 BPM)
  // ==========================================
  _scheduleGameOverTrack(step, time) {
    if (step === 0) {
      // Deep sub drone + detuned ominous saw cluster
      this._synthDrone(time, this.notes.D1, 6.0);
      this._synthNoiseSweep(time, 4.0);
    }
  }

  // ==========================================
  // SYNTHESIS ENGINES & VOICE GENERATORS
  // ==========================================

  _startVoice(source, time) {
    this.activeVoices.add(source);
    source.onended = () => {
      this.activeVoices.delete(source);
      source.disconnect();
    };
    source.start(time);
  }

  _releaseVoices() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const gain = this.masterGain.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, now + 0.025);
    for (const voice of this.activeVoices) {
      try { voice.stop(now + 0.03); } catch (e) { /* Already ended. */ }
    }
    this.activeVoices.clear();
  }

  _noiseBuffer(duration) {
    const size = Math.floor(this.ctx.sampleRate * duration);
    if (!this.noiseBuffers.has(size)) {
      const buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffers.set(size, buffer);
    }
    return this.noiseBuffers.get(size);
  }

  /**
   * Pumping Sidechain Compression envelope
   */
  _triggerSidechainDucking(time) {
    if (!this.duckingGain) return;
    const g = this.duckingGain.gain;
    if (g.cancelScheduledValues) g.cancelScheduledValues(time);
    if (g.setValueAtTime) g.setValueAtTime(0.12, time);
    if (g.exponentialRampToValueAtTime) g.exponentialRampToValueAtTime(0.95, time + 0.16);
    if (g.setValueAtTime) g.setValueAtTime(1.0, time + 0.22);
  }

  /**
   * Punchy Analog Synth Kick (150Hz -> 42Hz pitch drop + transient click)
   */
  _synthKick(time, volume = 1.0, soft = false) {
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const startFreq = soft ? 110 : 160;
    const endFreq = 38;
    const dur = soft ? 0.25 : 0.32;

    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.08);

    gain.gain.setValueAtTime(volume * 1.1, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(gain);
    gain.connect(this.directBus);

    // Transient click layer
    if (!soft) {
      const clickOsc = this.ctx.createOscillator();
      const clickGain = this.ctx.createGain();
      clickOsc.type = 'triangle';
      clickOsc.frequency.setValueAtTime(450, time);
      clickOsc.frequency.exponentialRampToValueAtTime(80, time + 0.015);
      clickGain.gain.setValueAtTime(volume * 0.7, time);
      clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.018);

      clickOsc.connect(clickGain);
      clickGain.connect(this.directBus);

      this._startVoice(clickOsc, time);
      clickOsc.stop(time + 0.02);
    }

    this._startVoice(osc, time);
    osc.stop(time + dur);
  }

  /**
   * 80s Snappy Snare / Clapper
   */
  _synthSnare(time, volume = 0.8) {
    if (!this.ctx) return;

    // 1. Noise burst layer
    const buffer = this._noiseBuffer(0.2);

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(1000, time);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.9, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.directBus);
    noiseGain.connect(this.reverbBus);

    // 2. Body Tone Layer (185 Hz)
    const toneOsc = this.ctx.createOscillator();
    const toneGain = this.ctx.createGain();
    toneOsc.type = 'triangle';
    toneOsc.frequency.setValueAtTime(185, time);
    toneOsc.frequency.exponentialRampToValueAtTime(80, time + 0.09);

    toneGain.gain.setValueAtTime(volume * 0.7, time);
    toneGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    toneOsc.connect(toneGain);
    toneGain.connect(this.directBus);

    this._startVoice(noise, time);
    noise.stop(time + 0.2);
    this._startVoice(toneOsc, time);
    toneOsc.stop(time + 0.1);
  }

  /**
   * Crisp 80s Closed Hi-Hat
   */
  _synthHiHat(time, volume = 0.35, isOffbeat = false) {
    if (!this.ctx) return;

    const dur = isOffbeat ? 0.065 : 0.04;
    const buffer = this._noiseBuffer(dur);

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(8500, time);
    filter.Q.setValueAtTime(4.0, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume * 0.65, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.directBus);

    this._startVoice(noise, time);
    noise.stop(time + dur);
  }

  /**
   * Open Hi-Hat
   */
  _synthOpenHat(time, volume = 0.6) {
    if (!this.ctx) return;
    const dur = 0.28;
    const buffer = this._noiseBuffer(dur);

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7000, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume * 0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.directBus);
    gain.connect(this.reverbBus);

    this._startVoice(noise, time);
    noise.stop(time + dur);
  }

  /**
   * Rolling 16th-Note Analog Synthwave Bass (Dual Sawtooth + Lowpass Enveloping)
   */
  _synthAnalogBass(time, freq, accent = 1.0, cutoffBoost = 0, noteLength = 0.12) {
    if (!this.ctx || !freq) return;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, time);

    // Osc 2: Sub octave + subtle detune
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(freq * 0.5, time);
    if (osc2.detune && osc2.detune.setValueAtTime) osc2.detune.setValueAtTime(7, time);

    // Resonant Analog Filter Sweep
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(4.5, time);
    const startCutoff = 450 + cutoffBoost + (accent > 0.8 ? 600 : 0);
    filter.frequency.setValueAtTime(startCutoff, time);
    filter.frequency.exponentialRampToValueAtTime(140, time + noteLength);

    // Amp Envelope
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.42 * accent, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, time + noteLength);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.duckingGain); // Route to ducking bus for sidechain compression!

    this._startVoice(osc1, time);
    this._startVoice(osc2, time);
    osc1.stop(time + noteLength);
    osc2.stop(time + noteLength);
  }

  /**
   * Lush Detuned Chorus Synth Pads
   */
  _synthPad(time, chordFrequencies, duration = 3.0, volume = 0.35) {
    if (!this.ctx || !chordFrequencies || !Array.isArray(chordFrequencies)) return;
    const validChords = chordFrequencies.filter(f => typeof f === 'number' && Number.isFinite(f) && f > 20);
    if (validChords.length === 0) return;

    validChords.forEach((freq, idx) => {
      try {
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(freq, time);
        if (osc1.detune && osc1.detune.setValueAtTime) osc1.detune.setValueAtTime(-8, time);

        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(freq, time);
        if (osc2.detune && osc2.detune.setValueAtTime) osc2.detune.setValueAtTime(8, time);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, time);
        filter.Q.setValueAtTime(1.5, time);

        // Smooth attack & decay
        gain.gain.setValueAtTime(0.001, time);
        gain.gain.linearRampToValueAtTime((volume / validChords.length) * 0.9, time + 0.35);
        gain.gain.setValueAtTime((volume / validChords.length) * 0.8, time + Math.max(0.4, duration - 0.4));
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.duckingGain);
        gain.connect(this.reverbBus);

        this._startVoice(osc1, time);
        this._startVoice(osc2, time);
        osc1.stop(time + duration);
        osc2.stop(time + duration);
      } catch (e) {}
    });
  }

  /**
   * Piercing Retro Synth Lead with Pitch Vibrato & Glide
   */
  _synthLead(time, freq, duration = 0.28, volume = 0.42, voice = null) {
    if (!this.ctx || !freq) return;

    const osc = this.ctx.createOscillator();
    const subOsc = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = voice ? voice.tone : 'square';
    osc.frequency.setValueAtTime(freq, time);

    subOsc.type = 'sawtooth';
    subOsc.frequency.setValueAtTime(freq, time);
    if (subOsc.detune && subOsc.detune.setValueAtTime) subOsc.detune.setValueAtTime(6, time);

    // LFO Vibrato (5.5 Hz)
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(5.5, time);
    lfoGain.gain.setValueAtTime(voice ? 4 : 7, time);
    lfo.connect(lfoGain);
    lfoGain.connect(voice ? osc.detune : osc.frequency);
    lfoGain.connect(voice ? subOsc.detune : subOsc.frequency);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(voice ? voice.cutoff : 2800, time);
    filter.frequency.exponentialRampToValueAtTime(voice ? 900 : 1200, time + duration);
    filter.Q.setValueAtTime(voice ? 0.8 : 3.0, time);

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.015);
    gain.gain.setValueAtTime(volume * 0.85, time + duration * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    subOsc.connect(filter);
    filter.connect(gain);
    gain.connect(this.directBus);
    gain.connect(this.reverbBus);

    this._startVoice(lfo, time);
    this._startVoice(osc, time);
    this._startVoice(subOsc, time);
    lfo.stop(time + duration);
    osc.stop(time + duration);
    subOsc.stop(time + duration);
  }

  /**
   * Shimmering Retro Arpeggio Pluck
   */
  _synthPluck(time, freq, volume = 0.3) {
    if (!this.ctx || !freq) return;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4500, time);
    filter.frequency.exponentialRampToValueAtTime(600, time + 0.16);

    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.directBus);
    gain.connect(this.reverbBus);

    this._startVoice(osc, time);
    osc.stop(time + 0.2);
  }

  /**
   * Dark Atmospheric Drone for Game Over
   */
  _synthDrone(time, freq, duration = 6.0) {
    if (!this.ctx || !freq) return;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, time);
    osc1.frequency.exponentialRampToValueAtTime(freq * 0.75, time + duration);

    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(freq * 1.01, time);
    if (osc2.detune && osc2.detune.setValueAtTime) osc2.detune.setValueAtTime(-15, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, time);
    filter.frequency.linearRampToValueAtTime(80, time + duration);

    gain.gain.setValueAtTime(0.01, time);
    gain.gain.linearRampToValueAtTime(0.7, time + 0.8);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    this._startVoice(osc1, time);
    this._startVoice(osc2, time);
    osc1.stop(time + duration);
    osc2.stop(time + duration);
  }

  /**
   * Ambient tape noise sweep
   */
  _synthNoiseSweep(time, duration = 3.5) {
    if (!this.ctx) return;
    const buffer = this._noiseBuffer(duration);

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, time);
    filter.frequency.exponentialRampToValueAtTime(100, time + duration);
    filter.Q.setValueAtTime(3.0, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    this._startVoice(noise, time);
    noise.stop(time + duration);
  }
}

// Singleton export
const synthMusic = new SynthMusicEngine();

if (typeof window !== 'undefined') {
  window.synthMusic = synthMusic;
  window.SynthMusic = SynthMusicEngine;
  window.SynthMusicEngine = SynthMusicEngine;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { synthMusic, SynthMusic: SynthMusicEngine, SynthMusicEngine };
}
