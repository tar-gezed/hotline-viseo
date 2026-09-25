export const VERSION = 1;
export const RULESET = 'downed-revive-v1';
export const COLORS = ['#00f3ff', '#ff007f', '#39ff14', '#ffe600', '#ff7700'];
export const MAX_PLAYERS = 5;
export const BUTTON = { ATTACK: 1, INTERACT: 2, EXECUTE: 4 };
const finite = (n, limit = 1e7) => Number.isFinite(n) && Math.abs(n) <= limit;
const uint = n => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
export const nonce = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
export const validNonce = n => typeof n === 'string' && /^[a-f0-9]{32}$/.test(n);
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().filter(k => value[k] !== undefined && typeof value[k] !== 'function').map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export async function fingerprint(map, subtle = crypto.subtle) {
  const hash = await subtle.digest('SHA-256', new TextEncoder().encode(canonical(map)));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
export function validateHello(h) {
  return !!h && h.version === VERSION && h.ruleset === RULESET && ['HOST', 'CLIENT'].includes(h.role) && validNonce(h.nonce) && /^[a-f0-9]{64}$/.test(h.fingerprint);
}
export function validateInput(f) {
  return !!f && f.version === VERSION && uint(f.seq) && finite(f.x, 1) && finite(f.y, 1) && finite(f.angle, Math.PI + .00001)
    && uint(f.buttons) && f.buttons <= 7 && Array.isArray(f.edges) && f.edges.length === 3 && f.edges.every(uint);
}
export function encodeInput(f) {
  if (!validateInput(f)) throw Error('Invalid input');
  const bytes = new Uint8Array(30), v = new DataView(bytes.buffer);
  v.setUint8(0, VERSION); v.setUint32(1, f.seq); v.setFloat32(5, f.x); v.setFloat32(9, f.y);
  v.setFloat32(13, f.angle); v.setUint8(17, f.buttons);
  f.edges.forEach((edge, i) => v.setUint32(18 + i * 4, edge)); return bytes;
}
export function decodeInput(bytes) {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 30) return null;
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const f = { version: v.getUint8(0), seq: v.getUint32(1), x: v.getFloat32(5), y: v.getFloat32(9), angle: v.getFloat32(13), buttons: v.getUint8(17), edges: [18, 22, 26].map(i => v.getUint32(i)) };
    return validateInput(f) ? f : null;
  } catch { return null; }
}

// Snapshots are complete bounded records. No wire object is assigned to an entity
// directly: the scene adapter copies only this explicit field whitelist.
export const NUMBER_FIELDS = ['x','y','vx','vy','prevX','prevY','angle','legPhase','legAngle','gaitHeading','bodyBob','recoilOffset','swingAnimationTimer','deathTimer','deathAngle','hp','ammo','score','combo','attackCooldown','ack','radius','angularVelocity','prevAngle','health','ownerPlayerId','lastKickedByPlayerId','kills','falls','maxCombo','deathWave','deathTime','elapsed','shots','hits','knockdownTimer','executionTimer','executionStep','lifeTime','maxLifeTime','claimedMask'];
NUMBER_FIELDS.push('downedTimer','reviveProgress','reviverId','revives');
export const BOOL_FIELDS = ['isAlive','alive','isPlayer','isFlying','shattered','isOpened','isDangerous','gaitMoving','isInvulnerable','isDowned','isReviving'];
export const TEXT_FIELDS = ['state','weapon','archetype','mask','favoriteWeapon'];
export function record(entity) {
  const out = { id: entity.id };
  for (const k of NUMBER_FIELDS) if (finite(entity[k])) out[k] = Math.round(entity[k] * 1000) / 1000;
  for (const k of BOOL_FIELDS) if (typeof entity[k] === 'boolean') out[k] = entity[k];
  for (const k of TEXT_FIELDS) if (typeof entity[k] === 'string') out[k] = entity[k].slice(0, 40);
  return out;
}
export function validRecord(r) {
  if (!r || typeof r !== 'object' || !uint(r.id)) return false;
  return Object.entries(r).every(([k,v]) => k === 'id' || (NUMBER_FIELDS.includes(k) && finite(v)) || (BOOL_FIELDS.includes(k) && typeof v === 'boolean') || (TEXT_FIELDS.includes(k) && typeof v === 'string' && v.length <= 40));
}
const LIMITS = { players:5, enemies:160, bullets:512, floor:512, thrown:32, doors:256, glass:512, crates:32 };
export function validateSnapshot(s) {
  if (!s || s.version !== VERSION || !uint(s.seq) || !finite(s.time) || s.time < 0 || !uint(s.wave) || !uint(s.remaining) || !finite(s.timer) || !['PREWAVE','SPAWNING','IN_PROGRESS','INTERMISSION'].includes(s.phase)) return false;
  if (s.total !== undefined && !uint(s.total) || s.teamScore !== undefined && !finite(s.teamScore)) return false;
  if (s.telegraphs !== undefined && (!Array.isArray(s.telegraphs) || s.telegraphs.length > 16 || !s.telegraphs.every(t => t && uint(t.id) && finite(t.x) && finite(t.y) && finite(t.angle) && finite(t.countdown,120) && t.countdown >= 0 && typeof t.blocked === 'boolean'))) return false;
  return Object.entries(LIMITS).every(([k,limit]) => Array.isArray(s[k]) && s[k].length <= limit && s[k].every(validRecord) && new Set(s[k].map(e => e.id)).size === s[k].length)
    && s.players.length >= 1 && s.players.every(p => p.id < 5 && finite(p.x) && finite(p.y) && typeof p.isAlive === 'boolean');
}
export function encodeSnapshot(s) {
  if (!validateSnapshot(s)) throw Error('Invalid snapshot');
  return new TextEncoder().encode(JSON.stringify(s));
}
export function decodeSnapshot(bytes) {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > 256000) return null;
    const s = JSON.parse(new TextDecoder().decode(bytes)); return validateSnapshot(s) ? s : null;
  } catch { return null; }
}
export const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b-a), Math.cos(b-a)) * t;
export class SnapshotBuffer {
  constructor(delay = .1) { this.delay = delay; this.frames = []; this.last = -1; }
  push(frame, receivedAt) {
    if (!validateSnapshot(frame) || frame.seq <= this.last) return false;
    this.last = frame.seq; this.frames.push({frame, receivedAt});
    if (this.frames.length > 12) this.frames.shift(); return true;
  }
  sample(now) {
    if (!this.frames.length) return null;
    const target = now - this.delay;
    while (this.frames.length > 2 && this.frames[1].receivedAt <= target) this.frames.shift();
    const a = this.frames[0], b = this.frames[1] || a;
    const t = Math.max(0, Math.min(1, (target-a.receivedAt) / (b.receivedAt-a.receivedAt || 1)));
    const result = {...b.frame};
    for (const key of ['players','enemies','bullets','thrown','doors']) {
      const old = new Map(a.frame[key].map(e => [e.id,e]));
      result[key] = b.frame[key].map(e => {
        const p = old.get(e.id); if (!p || p.isAlive !== e.isAlive || p.isDowned !== e.isDowned || Math.hypot(e.x-p.x,e.y-p.y) > 200) return e;
        const r = {...e};
        for (const k of ['x','y','legPhase','bodyBob','recoilOffset','swingAnimationTimer','deathTimer','knockdownTimer']) if (finite(p[k]) && finite(e[k])) r[k] = p[k] + (e[k]-p[k])*t;
        if (p.state === 'EXECUTING' && e.state === 'EXECUTING' && finite(p.executionTimer) && finite(e.executionTimer)) r.executionTimer = p.executionTimer + (e.executionTimer-p.executionTimer)*t;
        if (p.isDowned && e.isDowned) {
          r.downedTimer = p.downedTimer + (e.downedTimer-p.downedTimer)*t;
          if (p.reviverId === e.reviverId && e.reviverId >= 0) r.reviveProgress = p.reviveProgress + (e.reviveProgress-p.reviveProgress)*t;
        }
        for (const k of ['angle','legAngle','gaitHeading']) if (finite(p[k]) && finite(e[k])) r[k] = lerpAngle(p[k],e[k],t);
        return r;
      });
    }
    return result;
  }
}
