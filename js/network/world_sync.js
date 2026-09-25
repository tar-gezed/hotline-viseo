import { VERSION, record, NUMBER_FIELDS, BOOL_FIELDS, SnapshotBuffer, lerpAngle } from './protocol.js';
import { ProjectilePresentation } from './projectile_presentation.js';

export function applyRecord(entity, data, skip = []) {
  for (const key of [...NUMBER_FIELDS, ...BOOL_FIELDS, 'state']) if (!skip.includes(key) && data[key] !== undefined) entity[key] = data[key];
  if (data.weapon && entity.currentWeapon?.id !== data.weapon) entity.currentWeapon = WeaponSystem.getWeaponType(data.weapon);
}

/** Explicit entity adapters: no methods, object references, or arbitrary fields cross the wire. */
export class WorldSync {
  constructor(bridge) { this.b = bridge; this.reset(); }
  reset() { this.ids = new WeakMap(); this.nextId = 1; this.seq = 0; this.buffer = new SnapshotBuffer(.1); this.latest = null; this.cache = new Map(); this.projectiles = new ProjectilePresentation(this.b); this.receivedAt = 0; }
  entity(entity, id) {
    if (id === undefined) { if (!this.ids.has(entity)) this.ids.set(entity, this.nextId++); id = this.ids.get(entity); }
    return record({ ...entity, id, weapon: entity.currentWeapon?.id || entity.def?.id || entity.weaponDef?.id || entity.weapon,
      archetype: entity.archetype?.id, isPlayer: !!(entity.isPlayer === true || entity.isPlayer === 'player') });
  }
  snapshot() {
    const { waveSpawner:w, enemies, bullets, floorWeapons, thrownWeapons, runStats } = this.b.getWorld();
    return {
      version: VERSION, seq: ++this.seq, time: runStats.elapsedTime, wave: w.currentWave, remaining: w.enemiesAlive,
      total: w.totalWaveEnemies, teamScore: this.b.hud.currentScore, timer: w.state === 'INTERMISSION' ? w.intermissionTimer : w.preWaveTimer, phase: w.state,
      players: [...this.b.players.values()].map(p => this.entity(p, p.playerId)), enemies: enemies.slice(-160).map(e => this.entity(e)),
      bullets: bullets.slice(-512).map(e => this.entity(e)), floor: floorWeapons.slice(-512).map(e => this.entity(e)), thrown: thrownWeapons.slice(-32).map(e => this.entity(e)),
      doors: this.b.mapData.doors.map((d,i) => this.entity(d,i)), glass: this.b.mapData.glassPartitions.map((g,i) => this.entity(g,i)),
      crates: w.supplyCrates.map(c => this.entity(c)),
      telegraphs: w.getSpawnTelegraphs().map((t,id) => ({id,x:t.x,y:t.y,angle:t.angle || 0,countdown:t.countdown,blocked:!!t.blocked}))
    };
  }
  receive(snapshot, now) {
    if (!this.buffer.push(snapshot, now)) return false;
    this.latest = snapshot; this.receivedAt = now; this.geometry(snapshot);
    this.projectiles.reconcile(snapshot,now,this.b.getPlayer?.()?.playerId);
    return true;
  }
  geometry(s) {
    for (const [key, list] of [['doors',this.b.mapData.doors], ['glass',this.b.mapData.glassPartitions]]) {
      for (const data of s[key]) {
        const entity = list[data.id]; if (!entity) continue;
        if (key === 'doors' && entity.renderAngle === undefined) entity.renderAngle = entity.angle;
        applyRecord(entity, data);
      }
    }
  }
  sample(now, localId, dt = 0) {
    const s = this.buffer.sample(now); if (!s) return;
    // Collision uses the newest authoritative geometry immediately. Only the
    // drawn leaf/jamb angle eases between samples, independently at display Hz.
    const age = Math.min(.05,Math.max(0,now-this.receivedAt));
    for (const d of this.b.mapData.doors) {
      if (d.shattered) continue;
      const target = Math.max(d.minAngle ?? -Infinity,Math.min(d.maxAngle ?? Infinity,d.angle+(d.angularVelocity||0)*age));
      d.renderAngle = lerpAngle(d.renderAngle ?? d.angle,target,1-Math.exp(-Math.max(0,dt)*30));
    }
    for (const data of s.players) {
      const p = this.b.players.get(data.id);
      if (p) {
        if (data.id !== localId) applyRecord(p, data);
        // Execution hits remain host-only; its visible pose advances at display
        // rate, including the local actor whose simulation clock is reconciled.
        const source = data.id === localId ? this.latest.players.find(v => v.id === localId) : data;
        p.executionRenderTimer = p.state === 'EXECUTING' && source?.state === 'EXECUTING'
          ? (source.executionTimer || 0) + (data.id === localId ? Math.min(.1,Math.max(0,now-this.receivedAt)) : 0) : undefined;
      }
    }
    const active = new Set();
    const entities = (list, type, create) => list.map(data => {
      const key = type + ':' + data.id; active.add(key); let entity = this.cache.get(key);
      if (!entity) { entity = create(data); this.cache.set(key, entity); }
      applyRecord(entity, data); return entity;
    });
    this.b.setWorld({
      enemies: entities(s.enemies, 'e', d => new Enemy(d.x, d.y, d.archetype, d.weapon)),
      bullets: this.projectiles.sample(now),
      floorWeapons: entities(s.floor, 'f', d => new WeaponSystem.FloorWeapon(d.x, d.y, WeaponSystem.getWeaponType(d.weapon), d.ammo)),
      thrownWeapons: entities(s.thrown, 'f', d => new WeaponSystem.FloorWeapon(d.x, d.y, WeaponSystem.getWeaponType(d.weapon), d.ammo))
    });
    const w = this.b.getWorld().waveSpawner;
    w.supplyCrates = entities(s.crates, 'c', d => ({ render:WaveSpawner.renderSupplyCrate }));
    for (const key of this.cache.keys()) if (!active.has(key)) this.cache.delete(key);
    if (w.currentWave !== s.wave || w.state !== s.phase) {
      this.b.hud.setWave(s.wave, s.total || s.remaining);
      if (s.phase === 'INTERMISSION') { this.b.hud.setIntermission(s.timer, s.wave); this.b.soundFX.playWaveClearFanfare(); }
      else if (s.phase === 'PREWAVE') this.b.hud.setPreWave(s.timer);
      else if(s.phase === 'SPAWNING' && w.state === 'PREWAVE') this.b.soundFX.playWaveStartSiren?.();
      if (typeof window !== 'undefined') window.synthMusic?.play(s.phase === 'INTERMISSION' || s.phase === 'PREWAVE' ? 'wave_clear' : 'combat');
    }
    w.currentWave = s.wave; w.state = s.phase; w.enemiesAlive = s.remaining; w.totalWaveEnemies = s.total;
    w.networkTelegraphs = s.telegraphs || [];
    this.b.setPlayingState(s.phase);
    this.b.hud.currentScore = s.teamScore || 0;
    this.b.hud.setEnemiesRemaining(s.remaining);
    // Network clocks own countdowns; local presentation time owns announcement
    // fades. A zero dt here left WAVE 01 permanently painted on every client.
    this.b.hud.update(dt, { wave:s.wave,state:s.phase,totalEnemies:s.total,enemiesRemaining:s.remaining,preWaveTimeLeft:s.phase === 'PREWAVE' ? s.timer : 0,intermissionTimeLeft:s.phase === 'INTERMISSION' ? s.timer : 0,supplyCrates:w.supplyCrates }, dt);
  }
}
