const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const MapRenderer = require('./js/map/map_renderer.js');
const MapData = require('./js/map/map_data.js');
const { Door, GlassPartition } = require('./js/map/doors.js');

function recordPass(method) {
  return function () { this._calls.push(method); };
}

const renderer = Object.create(MapRenderer.prototype);
renderer._calls = [];
renderer.renderFloorZones = recordPass('floors');
renderer.renderWallShadows = recordPass('shadows');
renderer.renderDecals = recordPass('decals');
renderer.renderProps = recordPass('props');
renderer.renderViseoLogoMural = recordPass('mural');
renderer.renderElevators = recordPass('elevators');
renderer.renderWalls = recordPass('walls');
renderer.renderBackground({}, {});
renderer.renderFixtures({}, {});
renderer.renderForeground({}, {});
assert.deepStrictEqual(renderer._calls, [
  'floors', 'shadows', 'decals', 'props', 'mural', 'elevators', 'walls'
]);

const composite = Object.create(MapRenderer.prototype);
composite._calls = [];
for (const name of ['renderBackground', 'renderFixtures', 'renderForeground']) {
  composite[name] = recordPass(name);
}
composite.render({}, {});
assert.deepStrictEqual(composite._calls, [
  'renderBackground', 'renderFixtures', 'renderForeground'
]);

// Exercise the live integration helpers through a browser-shaped VM context.
// This verifies behavior (the renderer methods and update callback are really
// invoked) without relying on source-text/regex assertions or booting a frame
// loop in Node.
const fakeContext = {
  setTransform() {},
  fillRect() {},
  clearRect() {}
};
const fakeCanvas = {
  width: 1280,
  height: 720,
  getContext() { return fakeContext; }
};
const browserHarness = {
  document: {
    readyState: 'loading',
    addEventListener() {},
    getElementById() { return fakeCanvas; },
    createElement() { return fakeCanvas; }
  },
  window: { addEventListener() {} },
  performance: { now() { return 0; } },
  requestAnimationFrame() {},
  module: { exports: {} },
  console
};
vm.runInNewContext(fs.readFileSync('./js/main.js', 'utf8'), browserHarness, { filename: 'js/main.js' });
const mainPipeline = browserHarness.module.exports;
const liveCalls = [];
const liveRenderer = {
  renderBackground() { liveCalls.push('renderBackground'); },
  renderFixtures() { liveCalls.push('renderFixtures'); },
  renderForeground() { liveCalls.push('renderForeground'); },
  update() { liveCalls.push('update'); }
};
mainPipeline.renderWorldLayers(liveRenderer, {}, {}, {
  afterBackground() { liveCalls.push('afterBackground'); },
  afterFixtures() { liveCalls.push('afterFixtures'); }
});
assert.deepStrictEqual(liveCalls, [
  'renderBackground', 'afterBackground',
  'renderFixtures', 'afterFixtures',
  'renderForeground'
]);
mainPipeline.updateMapRenderer(liveRenderer, 1 / 60);
mainPipeline.updateMapRenderer(liveRenderer, 1 / 60);
assert.deepStrictEqual(liveCalls, [
  'renderBackground', 'afterBackground',
  'renderFixtures', 'afterFixtures',
  'renderForeground', 'update', 'update'
]);

// Round-4 map presentation contracts. These are behavior-level seams: they
// exercise semantic metadata and renderer operations rather than source text.
assert(Array.isArray(MapData.visualFixtures && MapData.visualFixtures.executiveOfficeBays),
  'map presentation must expose executive office bays');
assert.strictEqual(MapData.visualFixtures.executiveOfficeBays.length, 4,
  'exactly four E office bays are expected');
assert.deepStrictEqual(
  MapData.visualFixtures.executiveOfficeBays.map(bay => bay.separatorStartId),
  ['glass_office_sep_0', 'glass_office_sep_1', 'glass_office_sep_2', 'glass_office_sep_3']
);
assert.deepStrictEqual(
  MapData.visualFixtures.executiveOfficeBays.map(bay => bay.separatorEndId),
  ['glass_office_sep_1', 'glass_office_sep_2', 'glass_office_sep_3', 'glass_office_sep_4']
);
assert(MapData.visualFixtures.westLounge && MapData.visualFixtures.westLounge.mural,
  'west lounge must expose a dedicated mural/plaque anchor');
assert(MapData.visualFixtures.reception && MapData.visualFixtures.reception.elevatorBeacon,
  'reception must expose an elevator landmark cue');

function recordingContext() {
  const ctx = {
    fills: [],
    strokes: [],
    texts: [],
    rotations: [],
    translates: [],
    paths: 0,
    currentPath: [],
    _fillStyle: null,
    _strokeStyle: null,
    _lineWidth: 1,
    save() {}, restore() {},
    beginPath() { this.paths += 1; this.currentPath = []; },
    closePath() { this.currentPath.push(['Z']); },
    moveTo(x, y) { this.currentPath.push(['M', x, y]); },
    lineTo(x, y) { this.currentPath.push(['L', x, y]); },
    rect(x, y, width, height) { this.currentPath.push(['R', x, y, width, height]); },
    roundRect(x, y, width, height, radius) { this.currentPath.push(['RR', x, y, width, height, radius]); },
    fill() { this.fills.push({ style: this._fillStyle, path: this.paths, vertices: this.currentPath.map(v => v.slice()) }); },
    stroke() { this.strokes.push({ style: this._strokeStyle, width: this._lineWidth, path: this.paths, vertices: this.currentPath.map(v => v.slice()) }); },
    fillRect(x, y, width, height) { this.fills.push({ style: this._fillStyle, x, y, width, height }); },
    strokeRect(x, y, width, height) { this.strokes.push({ style: this._strokeStyle, width: this._lineWidth, x, y, width, height }); },
    arc() {},
    translate(x, y) { this.translates.push([x, y]); },
    rotate(angle) { this.rotations.push(angle); },
    clip() {},
    setLineDash() {},
    createPattern() { return 'pattern'; },
    fillText(text, x, y) { this.texts.push({ text, x, y, style: this._fillStyle }); }
  };
  Object.defineProperties(ctx, {
    fillStyle: { get() { return this._fillStyle; }, set(value) { this._fillStyle = value; } },
    strokeStyle: { get() { return this._strokeStyle; }, set(value) { this._strokeStyle = value; } },
    lineWidth: { get() { return this._lineWidth; }, set(value) { this._lineWidth = value; } },
    globalAlpha: { get() { return this._globalAlpha; }, set(value) { this._globalAlpha = value; } },
    filter: { get() { return this._filter; }, set(value) { this._filter = value; } },
    lineCap: { get() { return this._lineCap; }, set(value) { this._lineCap = value; } },
    shadowColor: { get() { return this._shadowColor; }, set(value) { this._shadowColor = value; } },
    shadowBlur: { get() { return this._shadowBlur; }, set(value) { this._shadowBlur = value; } },
    shadowOffsetX: { get() { return this._shadowOffsetX; }, set(value) { this._shadowOffsetX = value; } },
    shadowOffsetY: { get() { return this._shadowOffsetY; }, set(value) { this._shadowOffsetY = value; } },
    font: { get() { return this._font; }, set(value) { this._font = value; } },
    letterSpacing: { get() { return this._letterSpacing; }, set(value) { this._letterSpacing = value; } }
  });
  return ctx;
}

const visualRenderer = Object.create(MapRenderer.prototype);
visualRenderer.mapData = MapData;
visualRenderer.floorPatterns = {};
visualRenderer.time = 0;
visualRenderer.decals = [];
visualRenderer.glassShards = [];
visualRenderer.debris = [];

const coreCtx = recordingContext();
visualRenderer.renderCoreMass(coreCtx);
assert(Array.isArray(MapData.serviceCoreRooms) && MapData.serviceCoreRooms.length >= 3,
  'service floors must have canonical room geometry');
assert.strictEqual(coreCtx.fills.length, MapData.serviceCoreRooms.length,
  'each service room should render exactly one floor, without overlapping fake panels');
MapData.serviceCoreRooms.forEach((room,i) => {
  const actual = coreCtx.fills[i].vertices.filter(v => v[0] === 'M' || v[0] === 'L');
  assert.deepStrictEqual(actual.map(v=>v.slice(1)),room.polygon.map(p=>[p.x,p.y]),
    'service floor must use the same canonical polygon as map inspection');
});
assert.strictEqual(coreCtx.strokes.length,0,'floor edges must not create fake walls');
const muralCtx = recordingContext();
visualRenderer.renderViseoLogoMural(muralCtx);
visualRenderer.renderWestLoungeMural(muralCtx);
assert.strictEqual(muralCtx.fills.length,0,'wall logos must not float over walkable floor');

const bayCtx = recordingContext();
visualRenderer.renderExecutiveOfficeBays(bayCtx);
assert.strictEqual(bayCtx.fills.filter(fill => fill.style === MapData.visualFixtures.executiveOfficeBays[0].carpetColor).length, 4,
  'four dark executive carpet surfaces must be rendered from the bay metadata');
visualRenderer.renderExecutiveDesks(bayCtx);
assert.strictEqual(bayCtx.rotations.length, 4,
  'one rotated executive desk silhouette is required in each E bay');

const accentCtx = recordingContext();
visualRenderer.renderMeetingAccent(accentCtx);
assert(accentCtx.fills.some(fill => fill.style === MapData.visualFixtures.meetingAccent.fillColor) &&
  accentCtx.strokes.some(stroke => stroke.style === MapData.visualFixtures.meetingAccent.strokeColor),
  'meeting accent must render with a visibly blue/teal treatment');

// Exercise the actual domain objects so shattered stubs and intact envelopes
// are proven from their emitted geometry, not from injected callback stubs.
const intactGlass = new GlassPartition({ id: 'intact-test-glass', x1: 10, y1: 20, x2: 110, y2: 20, thickness: 6 });
const glassRenderer = Object.create(MapRenderer.prototype);
glassRenderer.mapData = { glassPartitions: [intactGlass] };
const intactGlassCtx = recordingContext();
glassRenderer.renderGlassPartitions(intactGlassCtx, {});
assert.strictEqual(intactGlassCtx.fills.filter(fill => fill.width >= 90 && fill.height >= 10).length, 1,
  'intact glass must draw exactly one full pane envelope');
intactGlass.shattered = true;
const shatteredGlassCtx = recordingContext();
glassRenderer.renderGlassPartitions(shatteredGlassCtx, {});
assert.strictEqual(shatteredGlassCtx.fills.filter(fill => fill.width >= 90 && fill.height >= 10).length, 0,
  'shattered glass must not redraw a full pane');
assert(shatteredGlassCtx.strokes.some(stroke => stroke.vertices.filter(v => v[0] === 'M' || v[0] === 'L').length === 4),
  'shattered glass must retain two short endpoint stubs');

const intactDoor = new Door({ id: 'intact-test-door', x: 20, y: 30, length: 72, baseAngle: 0, type: 'wood' });
const doorRenderer = Object.create(MapRenderer.prototype);
doorRenderer.mapData = { doors: [intactDoor] };
const intactDoorCtx = recordingContext();
doorRenderer.renderDoors(intactDoorCtx, {});
assert.strictEqual(intactDoorCtx.fills.filter(fill => fill.width === 72).length, 1,
  'intact door must draw one live leaf');
intactDoor.shattered = true;
const shatteredDoorCtx = recordingContext();
doorRenderer.renderDoors(shatteredDoorCtx, {});
assert.strictEqual(shatteredDoorCtx.fills.filter(fill => fill.width === 72).length, 0,
  'shattered door must not redraw its intact leaf');
assert(shatteredDoorCtx.fills.some(fill => fill.width === 6 && fill.height === 6),
  'shattered door must retain its broken hinge stub');

// Reproducible full-render smoke through the actual MapRenderer methods.
const smokeCtx = recordingContext();
visualRenderer.render(smokeCtx, { x: 0, y: 0, width: MapData.MAP_WIDTH, height: MapData.MAP_HEIGHT });
assert(smokeCtx.fills.length > 50 && smokeCtx.strokes.length > 50,
  'real MapRenderer full pass must emit substantial floor, fixture and wall geometry');

// Animated text must rasterize its expensive outline/glow only once, while
// keeping per-frame movement, fade and expiry independent of the bitmap.
{
  const { FloatingText } = require('./js/effects/particles.js');
  const oldDocument = global.document;
  let canvases = 0, labels = 0, blits = 0;
  const transforms = [];
  const labelContext = {
    scale() {}, translate() {}, measureText() { return { width: 400 }; },
    strokeText() {}, fillText() { labels++; }
  };
  global.document = { createElement() { canvases++; return { getContext: () => labelContext }; } };
  const target = {
    save() {}, restore() {}, rotate() {}, scale() {},
    translate(x, y) { transforms.push([x, y]); },
    drawImage() { blits++; }
  };
  try {
    const text = new FloatingText(100, 200, 'WAVE 1 COMPLETE! +1525', { fontSize: 28 });
    for (let i = 0; i < 60; i++) { text.draw(target); text.update(1 / 60); }
    assert.equal(labels, 1, 'glow/text must not be repainted every frame');
    assert.equal(canvases, 1, 'one short-lived bitmap per announcement');
    assert.equal(blits, 60);
    assert.notDeepStrictEqual(transforms[0], transforms[59], 'cached text still moves');
    assert(target.globalAlpha < 1, 'cached text still fades');
    text.update(1);
    text.draw(target);
    assert.equal(blits, 60, 'expired text must not render');
  } finally {
    if (oldDocument === undefined) delete global.document;
    else global.document = oldDocument;
  }
}

console.log('VISUAL PIPELINE CONTRACT PASSED');
