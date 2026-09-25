'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const CONFIG = require('./js/config.js');
const { InputManager } = require('./js/engine/input.js');
const env = { CONFIG, Image: class {}, console };
vm.createContext(env);
for (const name of ['ui_theme', 'title_menu', 'credits_menu', 'mask_menu', 'controls_menu', 'audio_menu', 'tools_menu', 'pause_menu']) {
  vm.runInContext(fs.readFileSync(`js/ui/${name}.js`, 'utf8'), env);
}
const input = new InputManager();
function tick(menu, keys = [], w = 1280, h = 720) {
  for (const key of keys) input._onKeyDown({ code: key, preventDefault() {} });
  menu.update(1 / 60, input, w, h);
  input.clearFrameTriggers();
  for (const key of keys) input._onKeyUp({ code: key });
}
let action = '';
const title = new env.TitleMenu(Object.fromEntries(['start', 'controls', 'audio', 'tools', 'credits'].map(k => [k, () => { action = k; }])));
title.show(); tick(title, ['ArrowDown']); assert.equal(title.selectedIndex, 1);
tick(title, ['Enter']); assert.equal(action, 'controls');
tick(title, ['KeyS']); tick(title, ['Space']); assert.equal(action, 'audio');
tick(title, ['KeyZ']); assert.equal(title.selectedIndex, 1);
tick(title, ['ArrowUp']); tick(title, ['ArrowUp']); assert.equal(title.selectedIndex, 4, 'wrap selection');
tick(title, ['Enter']); assert.equal(action, 'credits');

// A held stick repeats at a bounded rate; reconnecting has no keyboard side effects.
input.gamepad.connected = true; input.gamepad.leftStick.y = 1;
title.stickTimer = 0; tick(title); assert.equal(title.selectedIndex, 0);
tick(title); assert.equal(title.selectedIndex, 0, 'held stick must not skip all choices');
input.gamepad.leftStick.y = 0; input.gamepad.justPressed.buttonA = true;
tick(title); assert.equal(action, 'start'); input.gamepad.connected = false;

let back = 0, confirmed = '';
const mask = new env.MaskMenu(); mask.onBack = () => back++; mask.onMaskConfirmed = id => { confirmed = id; };
mask.show('jade'); assert.equal(mask.getSelectedMask().id, 'jade');
tick(mask, ['Digit7']); assert.equal(mask.selectedMaskId, 'jc');
tick(mask, ['Escape']); assert.equal(back, 1); assert.equal(confirmed, '');
mask.hide(); mask.show(); assert.equal(mask.selectedMaskId, 'jc');
tick(mask, ['Enter']); assert.equal(confirmed, 'jc');

const music = { setVolume(v) { this.volume = v; }, setMute(v) { this.muted = v; } };
const sfx = { setVolume(v) { this.volume = v; } };
const storage = { text: null, getItem() { return this.text; }, setItem(k, v) { this.text = v; } };
const settings = new env.AudioSettings(music, sfx, storage);
assert.equal(music.volume, .7); assert.equal(sfx.volume, .85);
const audio = new env.AudioMenu(settings, () => back++); audio.show();
tick(audio, ['ArrowLeft']); assert.equal(music.volume, .65); assert.equal(sfx.volume, .85);
tick(audio, ['ArrowDown']); tick(audio, ['ArrowRight']); assert.equal(sfx.volume, .9);
settings.set('music', -2); assert.equal(music.volume, 0);
settings.set('sfx', 5); assert.equal(sfx.volume, 1);
settings.set('music', NaN); assert.equal(music.volume, 0);
settings.set('muted', true); assert.equal(music.muted, true);
const reloaded = new env.AudioSettings(music, sfx, storage);
assert.equal(reloaded.values.music, 0); assert.equal(reloaded.values.sfx, 1); assert.equal(reloaded.values.muted, true);
assert.doesNotThrow(() => new env.AudioSettings(music, sfx, { getItem() { throw Error('blocked'); } }).set('music', .3));
storage.text = '{broken'; assert.equal(new env.AudioSettings(music, sfx, storage).values.music, .7);

// All screens paint and hit-test with exactly the same uniform transform.
const texts = [];
const c = new Proxy({ measureText: s => ({ width: s.length * 8 }), createLinearGradient: () => ({ addColorStop() {} }), fillText: (...a) => texts.push(a) }, { get: (o, k) => o[k] || (() => {}) });
env.CharacterArt = { portrait() {} };
const controls = new env.ControlsMenu(() => back++); controls.show();
tick(controls, ['ArrowRight']); assert.equal(controls.tab, 1);
tick(controls, ['Backspace']); assert.equal(back, 2);
const credits = new env.CreditsMenu(() => back++); credits.show();
tick(credits, ['Escape']); assert.equal(back, 3);
const pause=new env.PauseMenu({resume(){},audio(){},restart(){},quit(){action='quit';}});
pause.show();pause.selectedIndex=3;tick(pause,['Enter']);assert.equal(action,'quit','solo pause exposes a working exit');
const menus = [title, mask, audio, controls, credits, new env.ToolsMenu(() => {}), pause];
for (const [w, h] of [[1280, 720], [1440, 900], [1920, 1080], [3440, 1440]]) {
  const frame = env.UITheme.frame(w, h);
  assert(frame.x >= 0 && frame.y >= 0);
  assert.equal(1280 * frame.scale + 2 * frame.x, w);
  for (const menu of menus) {
    menu.render(c, w, h, input);
    for (const r of menu.regions) {
      assert(r.x >= 0 && r.x + r.w <= 1280, 'interactive region inside safe width');
      assert(r.y >= 0 && r.y + r.h <= 720, 'interactive region inside safe height');
    }
  }
  // Click AUDIO on the title, using physical viewport coordinates.
  title.selectedIndex = 0; title.render(c, w, h);
  const hit = title.regions[2];
  input.mouse.x = frame.x + (hit.x + hit.w / 2) * frame.scale;
  input.mouse.y = frame.y + (hit.y + hit.h / 2) * frame.scale;
  action = '';
  input.mouse.leftJustPressed = true; tick(title, [], w, h); assert.equal(action, 'audio');
}
console.log('Menu navigation, layouts and audio persistence passed.');
