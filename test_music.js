'use strict';
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { SynthMusicEngine } = require('./js/audio/synth_music.js');

// Exercise the real voices, not just score dispatch: reject invalid automation.
class Param {
  constructor() { this.value = 1; }
  setValueAtTime(v, t) { assert(Number.isFinite(v) && Number.isFinite(t) && t >= 0); this.value = v; }
  linearRampToValueAtTime(v, t) { this.setValueAtTime(v, t); }
  exponentialRampToValueAtTime(v, t) { assert(v > 0); this.setValueAtTime(v, t); }
  cancelScheduledValues() {}
}
let sources = [];
function node() {
  const n = { connect() {}, disconnect() {}, start(t) { assert(t >= 0); sources.push(this); }, stop(t) { assert(t >= 0); this.stopTime = t; } };
  for (const key of ['gain','frequency','Q','detune','threshold','knee','ratio','attack','release']) n[key] = new Param();
  return n;
}
class Context {
  constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = node(); }
  createGain() { return node(); }
  createOscillator() { return node(); }
  createBiquadFilter() { return node(); }
  createBufferSource() { return node(); }
  createDynamicsCompressor() { return node(); }
  createConvolver() { return node(); }
  createBuffer(channels, length) { assert(length > 0); return { getChannelData: () => new Float32Array(length) }; }
}
global.window = { AudioContext: Context };
global.document = { addEventListener() {} };
const engine = new SynthMusicEngine();
const visited = new Set();
// Reference event fingerprints captured from the original pre-rewrite score.
// Protect its exact notes, velocities, fills and high-intensity counter-melody.
for (const [intensity, expected] of [
  [0, 'a3159f42a767e74a57d35384823432e5de0454d5b1afd030f767edae4a609584'],
  [1, '417eb0844144b64b85cb217444d3e7e5252b1f1bd59df852b39ca279879657a4']
]) {
  const original = new SynthMusicEngine();
  const events = [];
  for (const name of ['_synthKick','_synthSnare','_synthHiHat','_synthOpenHat','_synthAnalogBass','_synthPad','_synthLead','_synthPluck','_triggerSidechainDucking']) {
    original[name] = (...args) => events.push([name, ...args]);
  }
  original.intensity = intensity;
  for (let step = 0; step < 64; step++) original._scheduleCombatTrack(step, step * 15 / 124);
  assert.equal(createHash('sha256').update(JSON.stringify(events)).digest('hex'), expected);
}
// Musical regressions: detect the former minor-third-over-major-chord bug,
// off-key transposition, excessive register, and pads spanning chord changes.
const pitchClass = freq => ((Math.round(69 + 12 * Math.log2(freq / 440)) % 12) + 12) % 12;
for (const track of engine.combatTracks.filter(t => !t.legacy)) {
  const tonic = pitchClass(engine.notes[track.chords[0][0]]);
  const scale = [0,2,3,5,7,8,10].map(n => (n + tonic) % 12);
  for (const phrases of [track.melody, track.answer]) {
    for (let bar = 0; bar < 4; bar++) {
      assert.equal(phrases[bar].length, track.rhythm.length);
      const chord = track.chords[bar].map(n => pitchClass(engine.notes[n]));
      phrases[bar].forEach((note, i) => {
        const freq = engine.notes[note];
        assert(freq >= engine.notes.Bb3 && freq <= engine.notes.F5, `${track.id}: lead register`);
        assert(scale.includes(pitchClass(freq)), `${track.id}: ${note} outside key`);
        if (track.rhythm[i] % 4 === 0) {
          assert(chord.includes(pitchClass(freq)), `${track.id}: ${note} clashes on strong beat`);
        }
      });
    }
  }
  const score = new SynthMusicEngine();
  score.combatTrack = track;
  score.bpm = track.bpm;
  let currentStep = 0;
  for (const name of ['Kick','Snare','HiHat','OpenHat','Pluck','Lead']) score[`_synth${name}`] = () => {};
  score._synthAnalogBass = (time, freq) => {
    const chord = track.chords[Math.floor(currentStep / 16) % 4].map(n => pitchClass(engine.notes[n]));
    assert(chord.includes(pitchClass(freq)), `${track.id}: bass outside current chord`);
  };
  score._synthPad = (time, chord, duration) => {
    assert(duration < 240 / track.bpm, 'Pad must release before next chord');
  };
  for (; currentStep < track.bars * 16; currentStep++) score._scheduleCombatTrack(currentStep, currentStep * 15 / track.bpm);
}
try {
  for (let i = 0; i < engine.combatTracks.length; i++) {
    engine.play('combat');
    const track = engine.combatTrack;
    assert(!visited.has(track.id)); visited.add(track.id);
    assert.equal(engine.totalSteps, track.bars * 16);
    assert(track.bars * 240 / track.bpm <= 60);
    engine.play('combat'); // Spawner and main both call this on the same wave.
    assert.equal(engine.combatTrack, track);
    engine.setIntensity(1);
    assert.equal(engine.targetBpm, track.bpm);
    for (let step = 0; step < engine.totalSteps; step++) {
      engine._scheduleStep(step, step * 15 / track.bpm);
      for (const source of sources) {
        assert(Number.isFinite(source.stopTime), 'Every oscillator/noise source must end');
        source.onended();
      }
      sources = [];
    }
    assert.equal(engine.activeVoices.size, 0);
    assert(engine.noiseBuffers.size <= 4, 'Percussion buffers are reused');
    engine.play('wave_clear');
    assert.equal(engine.totalSteps, 64);
    for (let step = 0; step < 64; step++) engine._scheduleStep(step, step * 15 / engine.bpm);
  }
  engine.play('combat');
  assert.equal(engine.combatTrack.id, engine.combatTracks[0].id);
  engine.nextNoteTime = -100;
  engine.ctx.currentTime = 5;
  let scheduled = 0;
  const schedule = engine._scheduleStep;
  engine._scheduleStep = () => scheduled++;
  engine._scheduler();
  assert(scheduled <= 2, 'Background return must not replay missed bars');
  engine._scheduleStep = schedule;
  for (const mode of ['menu', 'game_over', 'results']) {
    engine.play(mode);
    if (mode === 'results') {
      assert.equal(engine.bpm, 84);
      assert.equal(engine.totalSteps, 128);
    }
    for (let step = 0; step < engine.totalSteps; step++) engine._scheduleStep(step, 5 + step * 15 / engine.bpm);
  }
  engine.setMute(true); assert.equal(engine.masterGain.gain.value, 0);
  engine.setVolume(0.4); assert.equal(engine.masterGain.gain.value, 0);
  engine.setMute(false); assert.equal(engine.masterGain.gain.value, 0.4);
  const live = [...engine.activeVoices];
  engine.stop();
  assert(live.every(n => n.stopTime === engine.ctx.currentTime + 0.03));
  assert.equal(engine.timerId, null);
} finally { engine.stop(); }
window.AudioContext = undefined;
const unsupported = new SynthMusicEngine();
unsupported.play('combat');
assert.equal(unsupported.isPlaying, false);
assert.equal(unsupported.timerId, null);
console.log('Original and five complete arrangements, voices, rotation, transitions and controls passed.');

