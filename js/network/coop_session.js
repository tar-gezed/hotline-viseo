import { NetworkManager, prewarm } from './network_manager.js';
import { fingerprint, COLORS, validateSnapshot, validRecord } from './protocol.js';
import { invitationURL, isValidRoomCode } from './room_code.js';
import { InputFrames, RemoteInputSource } from './remote_input.js';
import { spawnPoints, squadDefeated, respawnSquad, creditKill, rankPlayers, canFight, reviveTarget, prepareRevives, advanceRevives } from './coop_logic.js';
import { PlayerPresentation } from './player_presentation.js';
import { WorldSync, applyRecord } from './world_sync.js';
import { PresentationEvents } from './presentation_events.js';
import '../entities/remote_player.js';
import '../ui/coop_ui.js';
import '../ui/multiplayer_menu.js';
import '../ui/lobby_menu.js';
import '../ui/multi_score_screen.js';

export class CoopSession {
  constructor(bridge) {
    this.b = bridge; this.active = false; this.playing = false; this.time = 0; this.inputs = new Map();
    this.network = new NetworkManager({ fingerprint: '', masks: Object.keys(CONFIG.MASKS),
      onChange: () => {
        if (this.playing) for (const slot of this.b.players.keys()) if (!this.network.members.has(slot)) this.b.players.delete(slot);
      }, onClose: message => this.closed(message),
      onEvent: (type, data) => this.event(type, data),
      onInput: (slot, frame) => this.inputs.get(slot)?.receive(frame, this.time),
      onSnapshot: s => this.receiveSnapshot(s)
    });
    this.mapHash = fingerprint(bridge.mapDefinition);
    this.menu = new MultiplayerMenu({ create: () => this.connect(true), join: () => this.connect(false), back: () => this.leave() });
    this.lobby = new LobbyMenu(this.network, { leave: () => this.leave(), copy: () => this.copy() });
    this.results = new MultiScoreScreen(this.network);
    this.options = new CanvasMenu(); this.options.onBack = () => this.setOverlay(false);
    this.options.items = [ { action: () => {} }, { action: () => {} }, { action: () => this.options.onBack() }, { action: () => this.leave() } ];
    this.options.adjust = dir => {
      if (this.options.selectedIndex < 2) { const key = this.options.selectedIndex ? 'sfx' : 'music'; bridge.audioSettings.set(key, bridge.audioSettings.values[key] + dir * .05); }
      else this.options.select((this.options.selectedIndex + dir + 4) % 4);
    };
    this.options.click = (hit, point) => {
      if (hit.index < 2 && point.x >= 845) bridge.audioSettings.set(hit.index ? 'sfx' : 'music', (point.x - 860) / 160);
      else this.options.activate();
    };
    this.sync = new WorldSync(bridge);
    this.playerPresentation = new PlayerPresentation();
    this.canReviveReach = (a,b) => bridge.navGraph.canTraverse(a,b,4,false);
    this.presentation = new PresentationEvents(bridge, event => this.queueEffect(event), () => this.playing && this.network.isHost);
    this.marks = new Map(); this.lastMark = -10;
  }
  open(code = '') {
    this.active = true; this.playing = false; this.screen = 'menu'; this.menu.busy = false; this.menu.message = '';
    this.menu.codeField.value = code.trim().toUpperCase(); this.menu.show(); this.b.input.reset();
    // Prewarm only after opting into multiplayer, during idle time in its menu.
    (window.requestIdleCallback || (fn => setTimeout(fn, 0)))(() => prewarm().catch(() => {}));
  }
  async connect(host) {
    if (this.menu.busy) return;
    if (!host && !isValidRoomCode(this.menu.codeField.value)) { this.menu.message = 'CODE INVALIDE (5 CARACTÈRES)'; return; }
    this.menu.busy = true; this.menu.message = '';
    try {
      this.network.fingerprint = await this.mapHash;
      await this.network.connect(host, this.menu.codeField.value, { name: this.menu.nameField.value, mask: 'vincent' });
      if (!this.active) return;
      this.menu.hide(); this.lobby.show(); this.screen = 'lobby'; this.b.input.reset();
    } catch (e) { this.menu.message = e.message; } finally { this.menu.busy = false; }
  }
  async copy() {
    const link = invitationURL(this.network.code);
    try { await navigator.clipboard.writeText(link); this.lobby.notice = 'LIEN COPIÉ !'; }
    catch {
      this.lobby.notice = 'COPIEZ LE LIEN CI-DESSOUS';
      // A real selectable field is also usable when clipboard permission is denied.
      const field = document.createElement('input'); field.value = link; field.setAttribute('aria-label', 'Lien d’invitation');
      field.style.cssText = 'position:fixed;left:20%;top:22%;width:60%;z-index:50;background:#161222;color:#00f3ff;padding:12px;border:1px solid #00f3ff';
      document.body.append(field); field.select(); field.addEventListener('blur', () => field.remove(), { once:true });
    }
  }
  async leave() { this.active = false; this.playing = false; this.overlay = false; this.menu.hide(); this.lobby.hide(); this.results.hide(); this.options.hide(); this.b.input.reset({preserveGamepadButtons:true}); this.b.back(); await this.network.leave(); }
  closed(message) { this.playing = false; this.overlay = false; this.screen = 'menu'; this.lobby.hide(); this.results.hide(); this.menu.show(); this.menu.message = message; this.menu.busy = false; this.b.input.reset(); }
  event(type, data) {
    if (type === 'effects' && this.playing && Array.isArray(data) && data.length <= 96) {
      for (const effect of data) {
        if (effect?.kind === 'presentation') this.presentation.replay(effect);
        else if (effect?.kind === 'projectileEnd') this.sync.projectiles.finish(effect,this.time);
        else if (effect?.kind === 'impact' && effect.owner !== this.network.slot && Number.isFinite(effect.x) && Number.isFinite(effect.y) && Number.isFinite(effect.angle)) {
          this.b.particleSystem.spawnImpact(effect.x,effect.y,effect.angle,'wall');
        } else if (effect?.kind === 'door') this.b.soundFX.playDoorKick();
        else this.event('attack',effect);
      }
    } else if (type === 'start') this.start(data);
    else if (type === 'state' && validateSnapshot(data)) this.receiveSnapshot(data);
    else if (type === 'hidden') { this.history = []; this.b.input.reset(); }
    else if (type === 'departed') { this.b.players.delete(data.slot); this.inputs.delete(data.slot); }
    else if (type === 'results' && Array.isArray(data) && data.length <= 5 && data.every(p => Number.isInteger(p.slot) && CONFIG.MASKS[p.mask] && Number.isFinite(p.score))) this.showResults(data);
    else if (type === 'resultReady' && Array.isArray(data)) this.results.ready = new Set(data);
    else if (type === 'return') { this.playing = false; this.overlay = false; this.screen = 'lobby'; this.results.hide(); this.lobby.show(); this.b.input.reset(); }
    else if (type === 'pingMark' && Number.isInteger(data?.slot) && data.slot >= 0 && data.slot < 5 && data.kind >= 1 && data.kind <= 4) {
      this.marks.set(data.slot, { kind: data.kind, until: this.time + 2.5 }); this.b.soundFX.playUiHover?.();
    } else if (type === 'attack' && this.playing && data && (data.slot === -1 || this.b.players.has(data.slot)) && Number.isFinite(data.x) && Number.isFinite(data.y) && Number.isFinite(data.angle)) {
      const weapon = WeaponSystem.getWeaponType(data.weapon);
      if (weapon.isGun) {
        if(data.slot !== this.network.slot) { this.b.particleSystem.spawnMuzzleFlash(data.x, data.y, data.angle, weapon.id.toLowerCase()); this.b.soundFX.playGunshot(weapon.id, data.x, data.y); }
        if (Array.isArray(data.bullets) && data.bullets.length <= 16 && Number.isFinite(data.time) && data.bullets.every(p => validRecord(p) && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.angle))) {
          this.sync.projectiles.launch(data.bullets,this.time,data.time,this.network.slot);
        }
      }
      else if(data.slot !== this.network.slot) this.b.soundFX.playMeleeSwing(weapon.id);
    }
  }
  start() {
    this.lobby.hide(); this.results.hide(); this.playing = true; this.screen = 'game'; this.overlay = false;
    this.effectsPending = null; this.reliablePending = null; this.needsReliable = false;
    this.sync.reset(); this.inputs.clear(); this.frames = new InputFrames(); this.history = []; this.effectQueue = []; this.sentBullets = new WeakSet(); this.accumulator = 0; this.sendTimer = 0; this.snapshotTimer = 0; this.cosmeticCooldown = 0; this.spectated = null; this.marks.clear();
    const local = this.network.members.get(this.network.slot); if (!local) { this.network.fail('Salon incomplet. Rejoignez à nouveau la room.'); return; }
    this.b.reset(local.mask);
    const origin = this.b.mapData.spawnPoints.player;
    try { this.spawns = spawnPoints(origin, p => this.b.navGraph.canTraverse(p,p,14,false) && this.b.navGraph.canTraverse(origin,p,14,false)); }
    catch (e) { this.network.fail(e.message); return; }
    for (const member of this.network.members.values()) {
      const at = this.spawns[member.slot], Class = this.network.isHost || member.slot === this.network.slot ? Player : RemotePlayer;
      const p = new Class(at.x, at.y, member.mask, member.slot);
      Object.assign(p, { playerId:member.slot, coopEnabled:true, kills:0, falls:0, revives:0, maxCombo:0, shots:0, hits:0, deathWave:0, deathTime:0, networkPrediction:!this.network.isHost, externalScoring:true });
      p.angle = origin.angle || 0; p.onExecutionComplete = target => this.b.creditExecution(p, target);
      this.b.players.set(member.slot,p); this.inputs.set(member.slot,new RemoteInputSource());
      if (member.slot === this.network.slot) this.inputs.get(member.slot).vibrate = (...args) => this.b.input.vibrate(...args);
    }
    this.b.setPlayer(this.b.players.get(this.network.slot)); this.b.camera.snapTo(this.b.getPlayer().x,this.b.getPlayer().y);
    const w = this.b.getWorld().waveSpawner; w.playerCount = this.network.members.size; w.coopPlayers = [...this.b.players.values()];
    if (this.network.isHost) w.start(local.mask, origin);
    this.lastPhase = w.state; this.b.input.reset(); this.waitRelease = true; this.waitMenuRelease = true;
    this.visibilityChanged(document.hidden);
  }
  inputFor(slot) {
    const input = this.inputs.get(slot); input.expire(this.time); input.aimAt(this.b.players.get(slot)); return input;
  }
  attackEffect(actor, result) {
    if (!this.network.isHost || result.type === 'DRY_FIRE') return;
    actor.recentShotTimer = result.type === 'GUN_FIRED' ? .8 : 0;
    if (result.type === 'GUN_FIRED' && actor.playerId !== undefined) actor.shots++;
    for(const bullet of result.bullets || [])this.sentBullets.add(bullet);
    this.queueEffect({ slot:actor.playerId ?? -1, x:result.flashX ?? actor.x, y:result.flashY ?? actor.y, angle:actor.angle, weapon:result.weaponId,
      time:this.b.getWorld().runStats.elapsedTime, bullets:(result.bullets || []).map(b => this.sync.entity(b)) });
  }
  queueEffect(effect) {
    if (!this.network.isHost) return;
    if (this.effectQueue.length >= 96) this.effectQueue.shift();
    this.effectQueue.push(effect);
  }
  sendPending(key, type, data) {
    const pending = {};
    this[key] = pending;
    Promise.resolve(this.network.send(type, data)).finally(() => {
      // A previous mission's send must never unlock this mission's batch.
      if (this[key] === pending) this[key] = null;
    });
  }
  ensureProjectileBirths(bullets) {
    for(const bullet of bullets) if(!this.sentBullets.has(bullet)) {
      const actor=this.b.players.get(bullet.ownerPlayerId) || {angle:bullet.angle,x:bullet.x,y:bullet.y};
      this.attackEffect(actor,{type:'GUN_FIRED',weaponId:bullet.weaponDef.id,flashX:bullet.x,flashY:bullet.y,bullets:[bullet]});
    }
  }
  projectileEnd(bullet) { this.queueEffect({kind:'projectileEnd',id:this.sync.entity(bullet).id,x:bullet.x,y:bullet.y,owner:bullet.ownerPlayerId}); }
  creditKill(id, points, weapon) { return creditKill(this.b.players.get(id), points, weapon, CONFIG.SCORING); }
  visibilityChanged(hidden) {
    if (!this.playing) return;
    this.tabHidden = hidden;
    if (this.network.isHost) this.syncPause();
    else this.network.send('visibility', hidden);
    this.b.input.reset();
  }
  syncPause() {
    const paused=!!(this.tabHidden || this.overlay);
    this.network.hidden=paused;this.network.send('hidden',paused);
    this.accumulator=0;this.history=[];
  }
  setOverlay(open) {
    this.overlay=open;if(open){this.options.selectedIndex=0;this.options.show();}else this.options.hide();
    if(this.network.isHost)this.syncPause();
    this.waitRelease=true;
  }
  receiveSnapshot(s) {
    if (!this.playing || !this.sync.receive(s,this.time)) return;
    const p = this.b.getPlayer(), authoritative = s.players.find(p => p.id === this.network.slot); if (!authoritative) return;
    const wasAlive = p.isAlive, wasDowned = p.isDowned;
    // Reconciliation corrects the simulation, not the locally animated gun and
    // feet. Replaying pending movement must not replay their visual phase too.
    const pose = Object.fromEntries(['legPhase','legAngle','gaitHeading','bodyBob','gaitMoving','recoilOffset','swingAnimationTimer'].map(key => [key,p[key]]));
    applyRecord(p,authoritative); this.history = this.history.filter(h => h.frame.seq > (authoritative.ack || 0));
    if (p.isAlive && wasAlive && p.isDowned === wasDowned) {
      // Reapply only unacknowledged movement. Combat is never replayed or predicted authoritatively.
      const replay = new RemoteInputSource();
      for (const h of this.history) { replay.receive(h.frame,this.time); p.update(h.dt,replay,this.b.mapData,[],[],[],null,null,false); }
      Object.assign(p,pose);
    } else {
      this.history = [];
      if (wasAlive && !p.isAlive || !wasDowned && p.isDowned) {
        this.b.soundFX.playPlayerDeath();this.b.camera.addTrauma(.9);this.b.hud.flashScreen('#ff1744');
        this.b.input.vibrate(180,.9,.7);
      }
    }
    if (p.isAlive) p.angle = this.b.input.getAimAngle(p.x,p.y);
    this.b.hud.setWeapon(p.currentWeapon,p.ammo);
  }
  tick(dt, c, w, h) {
    this.time += dt;
    const input = this.b.input;
    if (!this.playing) {
      const menu = this.screen === 'lobby' ? this.lobby : this.screen === 'results' ? this.results : this.menu;
      menu.update(dt,input,w,h); if (!this.active || this.playing) return; menu.render(c,w,h,input); return;
    }
    // Resetting InputManager clears its previous button sample. Do not turn a
    // held Start/A from the lobby into a new pause/interaction on the next poll.
    if (this.waitMenuRelease) {
      const g = input.gamepad;
      if (!g?.buttonStart && !g?.buttonA && !g?.buttonRT && !input.isDown('Enter','Space')) this.waitMenuRelease = false;
      input.clearFrameTriggers();
    }
    if (input.isPauseJustPressed()) { this.setOverlay(!this.overlay); input.clearFrameTriggers(); }
    if (this.overlay) this.options.update(dt,input,w,h);
    if (!this.playing || !this.active) return;
    const p = this.b.getPlayer(), n = this.network;
    if (this.waitRelease && !input.isAttackDown()) this.waitRelease = false;
    const muted = this.overlay || document.hidden || n.hidden || !p.isAlive || this.waitRelease || this.waitMenuRelease;
    const frame = this.frames.capture(input,p,muted);
    if (!n.hidden) {
      if (n.isHost) {
        this.inputs.get(n.slot).receive(frame,this.time);
        // Bounded fixed-step authority; tab hiding is handled explicitly, not by catching up.
        this.accumulator = Math.min(.1,this.accumulator + dt);
        while (this.accumulator >= 1/60 && this.playing) {
          this.hostStep(1/60); this.accumulator -= 1/60;
          for (const source of this.inputs.values()) source.clearFrameTriggers();
        }
        this.snapshotTimer += dt;
        if (this.playing && this.snapshotTimer >= .05) {
          this.snapshotTimer %= .05;
          // Birth/impact effects are batched: 36 shooters cannot flood the
          // reliable control channel or crowd out lobby/mission messages.
          if (this.effectQueue.length && !this.effectsPending) {
            this.sendPending('effectsPending','effects',this.effectQueue.splice(0));
          }
          n.realtimeSend('snapshot',this.sync.snapshot());
        }
      } else {
        this.sendTimer += dt;
        if (this.sendTimer >= 1/40) { this.sendTimer %= 1/40; n.realtimeSend('input',frame); }
        if (p.isAlive) {
          const source = new RemoteInputSource(); source.receive(frame,this.time);
          p.update(dt,source,this.b.mapData,[],[],[],null,null,false);
          this.history.push({ frame,dt }); if (this.history.length > 90) this.history.shift();
          this.cosmeticCooldown = Math.max(0,this.cosmeticCooldown-dt);
          const wants = p.currentWeapon.automatic ? input.isAttackDown() : input.isAttackJustPressed();
          const rescuing = input.isReviveDown() && reviveTarget(p,[...this.b.players.values()],this.canReviveReach);
          if (!muted && !p.isDowned && !p.isReviving && !rescuing && p.state !== 'EXECUTING' && wants && this.cosmeticCooldown <= 0) {
            const gun = p.currentWeapon;
            this.cosmeticCooldown = (gun.cooldown || .3) * (p.perks.gunCooldownMult || 1);
            if (gun.isGun && p.ammo > 0) {
              p.recoilOffset = 6; this.b.soundFX.playGunshot(gun.id,p.x,p.y);
              this.b.camera.addTrauma(gun.screenShake || .2);
              const length = (gun.length || 20) + 10;
              this.b.particleSystem.spawnMuzzleFlash(p.x+Math.cos(p.angle)*length,p.y+Math.sin(p.angle)*length,p.angle,gun.id.toLowerCase());
              this.b.particleSystem.spawnCasing(p.x,p.y,p.angle,gun.id.toLowerCase());
              this.sync.projectiles.predict(p,this.time); input.vibrate(60,.6,.4);
            } else if (!gun.isGun) { p.swingAnimationTimer=.18; this.b.soundFX.playMeleeSwing(gun.id); }
          }
        }
        this.sync.sample(this.time,n.slot,dt); this.b.clientEffects(dt);
      }
    }
    if (!this.playing) { this.results.render(c,w,h); return; }
    this.updateSpectator(dt);
    if (!this.overlay && this.time-this.lastMark > .5) {
      const pad = input.gamepad?.justPressed || {}, keys = ['dpadUp','dpadRight','dpadDown','dpadLeft'];
      for (let i=1;i<=4;i++) if (input.isJustPressed('Digit'+i) || pad[keys[i-1]]) {
        this.lastMark=this.time;
        if(n.isHost) { const mark={slot:n.slot,kind:i}; n.send('pingMark',mark); this.event('pingMark',mark); }
        else n.send('pingMark',i);
      }
    }
    this.b.render(dt);
    if (n.hidden) { UITheme.begin(c,w,h); UITheme.text(c,'HÔTE EN PAUSE / EN ATTENTE',640,330,37,'#ffe600','center'); c.restore(); }
    if (this.overlay) this.drawOptions(c,w,h);
  }
  hostStep(dt) {
    const w = this.b.getWorld().waveSpawner;
    const live = [...this.b.players.values()]; w.coopPlayers=live; w.playerCount=live.length;
    for (const p of live) {
      p.ack=this.inputs.get(p.playerId).seq; p.recentShotTimer=Math.max(0,(p.recentShotTimer||0)-dt);
      if (!p.isAlive) p.deathTimer += dt;
      if(p.respawnShield>0) { p.respawnShield=Math.max(0,p.respawnShield-dt); if(!p.respawnShield && p.state!=='EXECUTING')p.isInvulnerable=false; }
    }
    const standing = new Set(live.filter(canFight));
    prepareRevives(live,slot=>this.inputFor(slot),this.canReviveReach);
    this.b.simulate(dt);
    for(const p of live) {
      p.elapsed=this.b.getWorld().runStats.elapsedTime;
      if(standing.has(p)&&!canFight(p)) {
        p.falls++; p.deathWave=w.currentWave; p.deathTime=p.elapsed; this.needsReliable=true;
        this.b.bloodSystem.createBloodPool(p.x,p.y,34,{initialRadius:7,growthSpeed:1.1,color:'#620c29'});
        p.bleedX=p.x; p.bleedY=p.y;
      }
      if(p.isDowned && Math.hypot(p.x-p.bleedX,p.y-p.bleedY)>22) {
        this.b.bloodSystem.createBloodPool(p.x,p.y,9,{initialRadius:3,growthSpeed:2,color:'#620c29'});
        p.bleedX=p.x; p.bleedY=p.y;
      }
    }
    // Check defeat before respawns: a last-moment squad wipe cannot be rescued by the wave hook.
    if(squadDefeated(live)) { this.finish(); return; }
    const helpers=prepareRevives(live,slot=>this.inputFor(slot),this.canReviveReach);
    const {revived,died}=advanceRevives(live,helpers,dt);
    if(revived.length || died.length) this.needsReliable=true;
    for(const p of died) { p.deathWave=w.currentWave; p.deathTime=p.elapsed; }
    for(const {target} of revived) {
      this.b.soundFX.playRevive?.(true);
      this.b.particleSystem.addFloatingText(target.x,target.y-38,'DEBOUT !',COLORS[target.playerId],16);
    }
    for(const p of live) if(p.isDowned && p.reviveProgress>0 && (p.reviveSoundAt || 0)<=this.time) {
      p.reviveSoundAt=this.time+.4; this.b.soundFX.playRevive?.(false);
    }
    if(w.state==='INTERMISSION'&&this.lastPhase!=='INTERMISSION') { respawnSquad(live,this.spawns); this.network.send('wave',{wave:w.currentWave}); this.needsReliable=true; }
    if(this.needsReliable&&!this.reliablePending) {
      this.needsReliable=false;
      this.sendPending('reliablePending','state',this.sync.snapshot());
    }
    this.lastPhase=w.state;
    this.b.hud.setWeapon(this.b.getPlayer().currentWeapon,this.b.getPlayer().ammo);
  }
  finish() {
    const rows=rankPlayers([...this.b.players.values()],this.network.members);
    this.network.phase='results'; this.network.send('results',rows);
    try {
      const key='hotline-viseo-coop-leaderboard-v1', parsed=JSON.parse(localStorage.getItem(key)||'[]'), board=Array.isArray(parsed)?parsed:[];
      const world=this.b.getWorld(); board.push({date:new Date().toISOString(),wave:world.waveSpawner.currentWave,score:this.b.hud.currentScore,players:rows});
      board.sort((a,b)=>b.score-a.score); localStorage.setItem(key,JSON.stringify(board.slice(0,20)));
    } catch { /* A private/blocked storage context never prevents results. */ }
    this.showResults(rows);
  }
  showResults(rows) { this.playing=false; this.overlay=false; this.screen='results'; this.results.show(rows); this.b.input.reset(); }
  updateSpectator(dt) {
    const local=this.b.getPlayer(), candidates=[...this.b.players.values()].filter(canFight);
    let target=local;
    if(!local.isAlive&&candidates.length) {
      target=candidates.find(p=>p.playerId===this.spectated) || candidates.slice().sort((a,b)=>Math.hypot(a.x-local.x,a.y-local.y)-Math.hypot(b.x-local.x,b.y-local.y))[0];
      const i=this.b.input;
      if(!this.overlay) {
        const prev=i.isJustPressed('KeyQ','ArrowLeft')||i.mouse?.rightJustPressed||i.gamepad?.justPressed.buttonLB;
        const next=i.isJustPressed('KeyD','ArrowRight')||i.mouse?.leftJustPressed||i.gamepad?.justPressed.buttonRB;
        if(prev||next) target=candidates[(candidates.indexOf(target)+(prev?-1:1)+candidates.length)%candidates.length];
      }
      this.spectated=target.playerId;
    }
    this.b.camera.update(dt,target,local.isAlive?this.b.input:null);
  }
  drawPlayers(c) {
    const local=this.b.getPlayer(), squad=[...this.b.players.values()];
    const nearby=reviveTarget(local,squad,this.canReviveReach);
    for(const p of squad) this.playerPresentation.draw(c,p,COLORS[p.playerId]);
    const labels=[];
    for(const p of squad) {
      c.save();
      c.font='bold 12px monospace'; c.textAlign='center'; c.fillStyle=COLORS[p.playerId];
      const tag='P'+(p.playerId+1)+' · '+(CONFIG.MASKS[p.mask.toLowerCase()]?.name||p.mask);
      const mark=this.marks.get(p.playerId),marked=mark?.until>this.time;
      const half=Math.max(c.measureText(tag).width/2,p.isDowned?58:0,marked?85:0)+4;
      const height=16+(p.isDowned?16:0)+(marked?18:0);
      let labelY=p.y-33;
      // Stable slot order keeps crowded rescue tags readable.
      while(labels.some(r=>p.x+half>r.left&&p.x-half<r.right&&labelY+3>r.top&&labelY-height<r.bottom))labelY-=18;
      labels.push({left:p.x-half,right:p.x+half,top:labelY-height,bottom:labelY+3});
      if(labelY<p.y-36) {
        c.strokeStyle=COLORS[p.playerId];c.globalAlpha=.4;c.lineWidth=.75;c.beginPath();c.moveTo(p.x,labelY+5);c.lineTo(p.x,p.y-26);c.stroke();c.globalAlpha=1;
      }
      c.fillText(tag,p.x,labelY);
      if(p.isDowned) {
        c.fillStyle='#ff668a';c.font='bold 12px monospace';
        c.fillText('À TERRE · '+Math.ceil(p.downedTimer)+' s',p.x,labelY-16);
        if(p.reviveProgress>0) {
          c.strokeStyle='rgba(12,10,24,.85)';c.lineWidth=5;c.beginPath();c.arc(p.x,p.y,30,0,Math.PI*2);c.stroke();
          c.strokeStyle=COLORS[p.playerId];c.lineWidth=3;c.beginPath();c.arc(p.x,p.y,30,-Math.PI/2,-Math.PI/2+Math.PI*2*p.reviveProgress/2);c.stroke();
        }
        if(nearby===p) {
          c.fillStyle='#f2e5c9';c.font='bold 11px monospace';
          c.fillText(this.b.input.isGamepadMode?'MAINTENIR A / X · RÉANIMER':'MAINTENIR E / ESPACE · RÉANIMER',p.x,p.y+46);
        }
      }
      if(marked)c.fillText(['','✚ À L’AIDE !','➜ PAR ICI !','⊕ ATTENTION !','♥ MERCI !'][mark.kind],p.x,labelY-(p.isDowned?34:18));
      c.restore();
    }
  }
  drawHUD(c,w,h) {
    this.b.hud.drawSquad(c,w,h,[...this.b.players.values()],this.b.camera,this.network.slot);
    if(this.b.getPlayer().isDowned) {
      UITheme.begin(c,w,h);
      UITheme.small(c,'À TERRE — RAMPEZ VERS UN COLLÈGUE · 1 / ↑ : À L’AIDE',640,675,16,'#ff668a','center');c.restore();
    }
    if(!this.b.getPlayer().isAlive) {
      UITheme.begin(c,w,h); c.fillStyle='rgba(12,10,24,.85)';c.fillRect(230,635,820,45);
      UITheme.small(c,'SPECTATEUR — EN ATTENTE DE LA PROCHAINE VAGUE',640,651,16,'#00f3ff','center');
      UITheme.small(c,'Q / D · CLIC GAUCHE / DROIT · LB / RB : CHANGER DE COLLÈGUE',640,672,12,UITheme.ivory,'center');c.restore();
    }
  }
  drawOptions(c,w,h) {
    c.fillStyle='rgba(10,8,22,.82)';c.fillRect(0,0,w,h);UITheme.begin(c,w,h);this.options.regions=[];
    UITheme.text(c,'OPTIONS / COOP',640,180,64,UITheme.ivory,'center');UITheme.small(c,this.network.isHost?'MISSION EN PAUSE POUR L’ÉQUIPE':'LA MISSION CONTINUE',640,240,18,UITheme.pink,'center');
    const labels=['MUSIQUE','EFFETS SONORES','REPRENDRE','QUITTER LA ROOM'];
    labels.forEach((label,i)=>{
      const value=this.b.audioSettings.values[i?'sfx':'music'];this.options.option(c,i,label+(i<2?'   '+Math.round(value*100)+' %':''),380,320+i*77,29,610);
      if(i<2){c.fillStyle='#42344e';c.fillRect(860,310+i*77,160,6);c.fillStyle=UITheme.cyan;c.fillRect(860,310+i*77,160*value,6);this.options.regions.push({index:i,x:845,y:298+i*77,w:190,h:40});}
    });UITheme.small(c,'← → : VOLUME · ÉCHAP : REPRENDRE',640,660,16,UITheme.muted,'center');c.restore();
  }
}
