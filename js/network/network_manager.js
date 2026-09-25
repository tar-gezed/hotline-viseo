import { VERSION, RULESET, MAX_PLAYERS, nonce, validateHello, validateInput, validateSnapshot } from './protocol.js';
import { createRoomCode, normalizeRoomCode, isValidRoomCode } from './room_code.js';

const now = () => performance.now();
const cleanName = name => String(name || 'Collègue').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 18) || 'Collègue';
export const prewarm = () => import('../../vendor/trystero-mqtt.min.js');

/** All gameplay traffic is addressed explicitly: only admitted host/client links exist. */
export class NetworkManager {
  constructor({ fingerprint, masks, onChange = () => {}, onEvent = () => {}, onInput = () => {}, onSnapshot = () => {}, onClose = () => {}, transport = prewarm }) {
    Object.assign(this, { fingerprint, masks, onChange, onEvent, onInput, onSnapshot, onClose, transport });
    this.members = new Map(); this.admitted = new Map(); this.fast = new Map(); this.pending = new Map();
    this.lastHeard = new Map(); this.pingPending = new Map(); this.rate = new Map();
    this.phase = 'closed'; this.slot = null; this.run = 0; this.hidden = false; this.generation = 0;
  }
  async connect(host, code, profile = {}) {
    await this.leave();
    const generation = ++this.generation;
    const lib = await this.transport();
    if (generation !== this.generation) return;
    this.isHost = host; this.selfId = lib.selfId; this.code = host ? createRoomCode() : normalizeRoomCode(code);
    if (!isValidRoomCode(this.code)) throw Error('Le code doit contenir 5 caractères sans 0, O, 1 ou I.');
    this.session = nonce(); this.hostId = host ? this.selfId : null; this.slot = host ? 0 : null;
    this.profile = { name: cleanName(profile.name), mask: this.masks.includes(profile.mask) ? profile.mask : this.masks[0] };
    this.phase = host ? 'lobby' : 'connecting'; this.run = 0;
    if (host) this.members.set(0, { slot: 0, ...this.profile, ready: false, ping: 0, peerId: this.selfId });
    this.room = lib.joinRoom({ appId: 'hotline-viseo:mp:v1', ...(this.rtcConfig ? { rtcConfig: this.rtcConfig } : {}) }, 'hotline-viseo:mp:v1:' + this.code, {
      handshakeTimeoutMs: 12000,
      onPeerHandshake: (id, send, receive) => this.handshake(id, send, receive, generation),
      onJoinError: () => { /* Discovery retries are owned by Trystero; the join deadline is bounded below. */ }
    });
    this.control = this.room.makeAction('hv-control');
    this.realtime = this.room.makeAction('hv-realtime');
    this.control.onMessage = (data, { peerId }) => { if (generation === this.generation) this.receiveControl(data, peerId); };
    this.realtime.onMessage = (data, { peerId }) => { if (generation === this.generation) this.receiveRealtime(data, peerId); };
    this.room.onPeerJoin = id => { if (generation === this.generation) this.joined(id); };
    this.room.onPeerLeave = id => { if (generation === this.generation) this.departed(id); };
    this.timer = setInterval(() => this.heartbeat(), 1000);
    this.deadline = now() + 35000;
    this.onChange();
  }
  async handshake(id, send, receive, generation) {
    const hello = { version: VERSION, ruleset:RULESET, role: this.isHost ? 'HOST' : 'CLIENT', nonce: this.session, fingerprint: this.fingerprint, ...this.profile };
    await send(hello);
    const { data: remote } = await receive();
    if (generation !== this.generation) throw Error('Session closed');
    let error = '';
    if (!validateHello(remote)) error = 'Version réseau incompatible.';
    else if (remote.fingerprint !== this.fingerprint) error = 'Carte incompatible : utilisez la même carte.';
    else if (remote.role === hello.role) error = remote.role === 'HOST' ? 'Collision de code.' : 'Client links are not allowed';
    else if (this.isHost && this.phase !== 'lobby') error = 'La mission a déjà commencé.';
    else if (this.isHost && this.admitted.size >= MAX_PLAYERS - 1) error = 'Ce salon est complet (5 joueurs).';
    else if (!this.isHost && this.hostId && this.hostId !== id) error = 'Un hôte est déjà connecté.';
    let slot;
    if (!error && this.isHost) {
      const occupied = new Set([...this.admitted.values()].map(p => p.slot));
      slot = [1, 2, 3, 4].find(s => !occupied.has(s));
      this.admitted.set(id, { slot, name: cleanName(remote.name), mask: this.masks.includes(remote.mask) ? remote.mask : this.masks[0], ready: false, ping: 0, peerId: id, expires: now() + 15000 });
    }
    await send({ ok: !error, error });
    const { data: verdict } = await receive();
    if (generation !== this.generation) throw Error('Session closed');
    if (error || verdict?.ok !== true) {
      this.admitted.delete(id);
      if (remote?.role === 'HOST' && this.isHost && id < this.selfId) {
        // Only one creator regenerates; no established client can silently become host.
        setTimeout(() => { if (generation === this.generation) this.connect(true, null, this.profile).catch(e => this.fail(e.message)); }, 0);
      } else if (!this.isHost && remote?.role === 'HOST') setTimeout(() => { if (generation === this.generation) this.fail(error || verdict?.error || 'Connexion refusée.'); }, 0);
      throw Error(error || verdict?.error || 'Handshake rejected');
    }
    if (!this.isHost) { this.hostId = id; this.session = remote.nonce; }
  }
  joined(id) {
    if (this.isHost && !this.admitted.has(id) || !this.isHost && id !== this.hostId) return;
    this.lastHeard.set(id, now());
    try {
      // Negotiated SCTP stream avoids SDP renegotiation and Trystero's own channel handler.
      const channel = this.room.getPeers()[id].createDataChannel('hv-fast-v1', { negotiated: true, id: 12, ordered: false, maxRetransmits: 0 });
      const generation = this.generation;
      const current = () => generation === this.generation && this.fast.get(id) === channel;
      channel.onmessage = e => { if (current() && typeof e.data === 'string' && e.data.length <= 256000) { try { this.receiveRealtime(JSON.parse(e.data), id); } catch { /* Drop malformed datagrams. */ } } };
      // A closing stream can dispatch callbacks after its replacement is open.
      channel.onclose = () => { if (current()) this.fast.delete(id); };
      channel.onerror = () => { if (current()) this.fast.delete(id); channel.close(); };
      this.fast.set(id, channel);
    } catch { /* Reliable actions remain available on browsers without the fast stream. */ }
    if (this.isHost) {
      const member = this.admitted.get(id); delete member.expires;
      this.members.set(member.slot, member);
      this.send('welcome', { slot: member.slot }, id); this.publishLobby();
    }
  }
  targets() { return this.isHost ? [...this.members.values()].filter(m => m.slot !== 0).map(m => m.peerId) : this.hostId ? [this.hostId] : []; }
  send(type, data, target) {
    if (!this.control) return;
    const ids = target ? [target] : this.targets();
    if (ids.length) return this.control.send({ session: this.session, run: this.run, type, data }, { target: ids }).catch(() => {});
  }
  publishLobby() { this.send('lobby', { phase: this.phase, members: [...this.members.values()] }); this.onChange(); }
  allowedRate(id, kind, limit) {
    const key = id + kind, time = now(); let r = this.rate.get(key);
    if (!r || time - r.at >= 1000) this.rate.set(key, r = { at: time, count: 0 });
    return ++r.count <= limit;
  }
  receiveControl(packet, id) {
    if (!packet || packet.session !== this.session || !this.targets().includes(id) && !(this.isHost && this.admitted.has(id))) return;
    if (!this.allowedRate(id, 'control', 200)) return;
    const { type, data } = packet; this.lastHeard.set(id, now());
    if (type === 'ping') { this.send('pong', data, id); return; }
    if (type === 'pong') {
      if (data !== this.pingPending.get(id)) return;
      this.pingPending.delete(id); const member = [...this.members.values()].find(p => p.peerId === id);
      if (member) member.ping = Math.round(Math.min(9999, now() - data)); return;
    }
    if (type === 'bye') { this.departed(id); return; }
    if (!this.isHost) {
      if (type === 'welcome' && Number.isInteger(data?.slot) && data.slot > 0 && data.slot < 5 && Number.isInteger(packet.run) && packet.run >= 0) { this.slot = data.slot; this.run = packet.run; this.phase = 'lobby'; }
      else if (type === 'lobby' && ['lobby', 'playing', 'results'].includes(data?.phase) && this.validMembers(data.members)) {
        this.members = new Map(data.members.map(m => [m.slot, m])); this.phase = data.phase; this.onChange();
      } else if (type === 'start' && packet.run > this.run && Number.isInteger(packet.run) && typeof data?.seed === 'string') {
        this.run = packet.run; this.phase = 'playing'; this.hidden = false; this.onEvent('start', data);
      } else if (packet.run === this.run) {
        if (type === 'hidden') this.hidden = data === true;
        else if (type === 'results') this.phase = 'results';
        else if (type === 'return') this.phase = 'lobby';
        this.onEvent(type, data);
      }
      return;
    }
    const member = this.admitted.get(id); if (!member || packet.run !== this.run) return;
    if (type === 'visibility' && typeof data === 'boolean') member.hidden = data;
    else if (type === 'profile' && this.phase === 'lobby') this.setProfile(member.slot, data);
    else if (type === 'ready' && this.phase === 'lobby' && typeof data === 'boolean') { member.ready = data; this.publishLobby(); }
    else if (type === 'resultReady' && this.phase === 'results') this.resultReady(member.slot);
    else if (type === 'pingMark' && this.phase === 'playing' && Number.isInteger(data) && data >= 1 && data <= 4 && this.allowedRate(id, 'mark', 2)) {
      this.send('pingMark', { slot: member.slot, kind: data }); this.onEvent('pingMark', { slot: member.slot, kind: data });
    }
  }
  validMembers(list) {
    return Array.isArray(list) && list.length >= 1 && list.length <= 5 && new Set(list.map(p => p?.slot)).size === list.length && list.every(p => p && Number.isInteger(p.slot) && p.slot >= 0 && p.slot < 5 && this.masks.includes(p.mask) && typeof p.name === 'string' && p.name.length <= 18 && typeof p.ready === 'boolean' && typeof p.peerId === 'string');
  }
  setProfile(slot, profile) {
    const member = this.members.get(slot); if (!member || !profile || this.phase !== 'lobby') return;
    member.name = cleanName(profile.name ?? member.name); if (this.masks.includes(profile.mask)) member.mask = profile.mask;
    member.ready = false; this.publishLobby();
  }
  profileUpdate(profile) { if (this.isHost) this.setProfile(0, profile); else this.send('profile', profile); }
  ready() { const p = this.members.get(this.slot); if (!p) return; if (this.isHost) { p.ready = !p.ready; this.publishLobby(); } else this.send('ready', !p.ready); }
  canStart() { return this.isHost && this.phase === 'lobby' && this.members.size >= 2 && [...this.members.values()].every(p => p.ready); }
  start() { if (!this.canStart()) return; this.run++; this.phase = 'playing'; const data = { seed: nonce() }; this.send('start', data); this.onEvent('start', data); }
  realtimeSend(type, data) {
    const packet = { session: this.session, run: this.run, type, data }, wire = JSON.stringify(packet);
    for (const id of this.targets()) {
      const ch = this.fast.get(id);
      if (ch?.readyState === 'open' && wire.length < 60000) {
        if (ch.bufferedAmount > 65536) continue;
        try { ch.send(wire); continue; } catch { ch.close(); this.fast.delete(id); }
      }
      // At most one pending reliable frame per peer: obsolete frames never queue up.
      if (!this.pending.has(id)) {
        const pending = {};
        this.pending.set(id, pending);
        this.realtime.send(packet, { target: id }).catch(() => {}).finally(() => {
          if (this.pending.get(id) === pending) this.pending.delete(id);
        });
      }
    }
  }
  receiveRealtime(p, id) {
    if (!p || p.session !== this.session || p.run !== this.run || this.phase !== 'playing' || !this.targets().includes(id) || !this.allowedRate(id, 'fast', 100)) return;
    if (this.isHost && p.type === 'input' && validateInput(p.data)) { this.lastHeard.set(id, now()); this.onInput(this.admitted.get(id).slot, p.data); }
    else if (!this.isHost && p.type === 'snapshot' && validateSnapshot(p.data)) { this.lastHeard.set(id, now()); this.onSnapshot(p.data); }
  }
  resultReady(slot = this.slot) {
    if (this.phase !== 'results') return;
    if (!this.isHost) { this.send('resultReady', true); return; }
    const p = this.members.get(slot); if (p) p.resultReady = true;
    this.send('resultReady', [...this.members.values()].filter(m => m.resultReady).map(m => m.slot));
    this.onChange();
    if ([...this.members.values()].every(m => m.resultReady)) {
      this.phase = 'lobby'; for (const m of this.members.values()) { m.ready = false; m.resultReady = false; }
      this.send('return', {}); this.onEvent('return', {}); this.publishLobby();
    }
  }
  heartbeat() {
    if (this.phase === 'connecting' && now() > this.deadline) { this.fail('Hôte introuvable. Vérifiez le code et la connexion WebRTC.'); return; }
    for (const [id, member] of this.admitted) if (member.expires && member.expires < now()) this.admitted.delete(id);
    for (const id of this.targets()) {
      const grace = this.hidden || this.admitted.get(id)?.hidden ? 120000 : 20000;
      if (now() - (this.lastHeard.get(id) || now()) > grace) { this.departed(id); continue; }
      const stamp = now(); this.pingPending.set(id, stamp); this.send('ping', stamp, id);
    }
    if (this.isHost && this.phase === 'lobby') this.publishLobby();
  }
  departed(id) {
    if (!this.isHost && id === this.hostId) { this.fail('L’hôte a quitté le salon. La session est terminée.'); return; }
    const member = this.admitted.get(id); if (!member) return;
    this.admitted.delete(id); this.members.delete(member.slot); this.fast.get(id)?.close(); this.fast.delete(id);
    this.pending.delete(id); this.lastHeard.delete(id); this.onEvent('departed', { slot: member.slot }); this.publishLobby();
    if (this.phase === 'results') this.resultReady(-1);
  }
  fail(message) { this.leave(); this.onClose(message); }
  async leave() {
    ++this.generation; clearInterval(this.timer);
    const room = this.room;
    if (room) { this.send('bye', {}); for (const ch of this.fast.values()) ch.close(); }
    // Clear synchronously: a slow transport shutdown must not wipe a new
    // session opened while the previous room is still releasing its relays.
    this.room = null;
    this.control = null; this.realtime = null; this.phase = 'closed'; this.members.clear(); this.admitted.clear(); this.fast.clear(); this.pending.clear(); this.lastHeard.clear(); this.pingPending.clear(); this.rate.clear();
    this.hidden = false;
    if (room) await room.leave().catch(() => {});
  }
}
