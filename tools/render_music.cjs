'use strict';
// Development-only audit/export. Requires Playwright via local tooling/NODE_PATH.
// Usage: node tools/render_music.cjs [output-directory]
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const { SynthMusicEngine } = require('../js/audio/synth_music.js');

async function main() {
  const directory = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'hotline-viseo-music'));
  fs.mkdirSync(directory, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ path: path.join(__dirname, '../js/audio/synth_music.js') });
    const tracks = new SynthMusicEngine().combatTracks;
    const report = [];
    for (let index = 0; index < tracks.length; index++) {
      const result = await page.evaluate(async index => {
        const engine = new window.SynthMusicEngine();
        const track = engine.combatTracks[index];
        // Two original repeats, or the complete new arrangement plus loop seam.
        const bars = track.legacy ? 8 : track.bars + 2;
        const sampleRate = 22050;
        const duration = bars * 240 / track.bpm;
        const ctx = new OfflineAudioContext(2, Math.ceil((duration + 1) * sampleRate), sampleRate);
        const realContext = window.AudioContext;
        window.AudioContext = function () { return ctx; };
        try { engine.init(); } finally { window.AudioContext = realContext; }
        engine.combatTrack = track;
        engine.currentTrack = 'combat';
        engine.bpm = track.bpm;
        engine.intensity = 0.35;
        for (let step = 0; step < bars * 16; step++) engine._scheduleStep(step % (track.bars * 16), 0.05 + step * 15 / track.bpm);
        const buffer = await ctx.startRendering();
        const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
        let peak = 0, squared = 0, clipped = 0;
        const pcm = new Int16Array(buffer.length * 2);
        for (let i = 0; i < buffer.length; i++) {
          for (let c = 0; c < 2; c++) {
            const value = channels[c][i];
            if (!Number.isFinite(value)) throw new Error('Non-finite audio sample');
            peak = Math.max(peak, Math.abs(value));
            squared += value * value;
            if (Math.abs(value) >= 1) clipped++;
            pcm[i * 2 + c] = Math.round(Math.max(-1, Math.min(1, value)) * 32767);
          }
        }
        const bytes = new Uint8Array(pcm.buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return { id: track.id, sampleRate, peak, rms: Math.sqrt(squared / pcm.length), clipped, seconds: buffer.duration, pcm: btoa(binary) };
      }, index);
      const pcm = Buffer.from(result.pcm, 'base64');
      const header = Buffer.alloc(44);
      header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
      header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
      header.writeUInt32LE(result.sampleRate, 24); header.writeUInt32LE(result.sampleRate * 4, 28);
      header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36);
      header.writeUInt32LE(pcm.length, 40);
      fs.writeFileSync(path.join(directory, `${result.id}.wav`), Buffer.concat([header, pcm]));
      delete result.pcm;
      report.push(result);
      console.log(JSON.stringify(result));
      if (result.clipped || result.rms < 0.01) throw new Error(`${result.id}: clipped or silent render`);
    }
    fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`WAV previews and signal report: ${directory}`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
