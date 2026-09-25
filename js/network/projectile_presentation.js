/** Render-only tracers. Never calls entity damage, door physics or score logic.
 * Birth events preserve projectiles shorter than a snapshot interval; snapshots
 * reconcile remote tracks. Local tracers begin immediately at the muzzle.
 */
export class ProjectilePresentation {
  constructor(bridge) { this.b = bridge; this.tracks = new Map(); this.retired = new Map(); this.ends = new Map(); this.predictions = []; this.ownIds = new Map(); this.nextLocal = 0; }
  clear() { this.tracks.clear(); this.retired.clear(); this.ends.clear(); this.predictions=[]; this.ownIds.clear(); }
  retire(id, now) {
    if (typeof id === 'number') {
      this.retired.set(id,now+.5);
      if (this.retired.size > 512) this.retired.delete(this.retired.keys().next().value);
    }
    this.tracks.delete(id);
  }
  spawn(data, now, time = 0, local = false) {
    const key = local ? 'local:' + this.nextLocal++ : data.id;
    if (this.tracks.has(key)) return;
    const weapon = WeaponSystem.getWeaponType(data.weapon);
    const bullet = new WeaponSystem.Bullet(data.x, data.y, data.angle, weapon, data.isPlayer);
    const vx = data.vx ?? bullet.vx, vy = data.vy ?? bullet.vy;
    const life = Math.max(0, (data.maxLifeTime || bullet.maxLifeTime) - (data.lifeTime || 0));
    let duration = life, impact = null;
    // One read-only ray per birth instead of scanning map geometry every frame.
    const speed = Math.hypot(vx, vy);
    if (speed && typeof Collision !== 'undefined') {
      const hit = Collision.raycast(data.x, data.y, vx / speed, vy / speed, speed * life,
        // GlassPartition instances need not carry the generic isGlass flag.
        // Authority pierces these panes; cosmetic clipping must do so too.
        Collision.worldObstacles(this.b.mapData).filter(o=>!this.b.mapData.glassPartitions?.includes(o)), { ignoreGlass:true, ignoreOpenDoors:false });
      if (hit.hit) { duration = Math.min(life, hit.distance / speed); impact = hit.point; }
    }
    if (this.tracks.size >= 128) this.tracks.delete(this.tracks.keys().next().value);
    const track={ bullet, local, time, born:now, shown:false, anchor:now, x:data.x, y:data.y, originX:data.x, originY:data.y, vx, vy, errorX:0, errorY:0,
      duration, expires:now + Math.max(.05,duration), impact, owner:data.ownerPlayerId };
    this.tracks.set(key,track);
    if(local) {
      this.predictions.push({key,weapon:weapon.id,angle:data.angle,at:now,matched:false});
      if(this.predictions.length>128)this.predictions.shift();
    }
    const end=this.ends.get(key);if(end)this.stop(track,now,end);
  }
  launch(records, now, time, localId) {
    this.predictions=this.predictions.filter(p=>now-p.at<.8);
    for (const data of records) {
      if(this.retired.has(data.id)||this.tracks.has(data.id)||this.ownIds.has(data.id))continue;
      if(data.ownerPlayerId===localId) {
        const predicted=this.predictions.find(p=>!p.matched&&p.weapon===data.weapon&&Math.abs(Math.atan2(Math.sin(p.angle-data.angle),Math.cos(p.angle-data.angle)))<.5);
        if(predicted) {
          predicted.matched=true;this.ownIds.set(data.id,predicted.key);
          if(this.ownIds.size>512)this.ownIds.delete(this.ownIds.keys().next().value);
          const end=this.ends.get(data.id),track=this.tracks.get(predicted.key);if(end&&track)this.stop(track,now,end);
          continue;
        }
      }
      // A server-confirmed shot without a local prediction must still appear.
      this.spawn(data,now,time);
    }
  }
  stop(track, now, end) {
    const age=Math.max(0,Math.min(track.duration,now-track.anchor));
    track.stopX=end?.x ?? track.x+track.vx*age;track.stopY=end?.y ?? track.y+track.vy*age;
    track.stopped=true;track.expires=Math.min(track.expires,Math.max(track.born+.05,now));
  }
  finish(end, now) {
    if(!Number.isInteger(end?.id)||end.id<0||![end.x,end.y].every(n=>Number.isFinite(n)&&Math.abs(n)<1e7))return;
    this.ends.set(end.id,{...end,until:now+1});
    if(this.ends.size>512)this.ends.delete(this.ends.keys().next().value);
    const track=this.tracks.get(this.ownIds.get(end.id)??end.id);if(track)this.stop(track,now,end);
  }
  predict(player, now) {
    const w = player.currentWeapon, count = Math.min(16, w.pellets || 1), length = (w.length || 20) + 10;
    for (let i = 0; i < count; i++) {
      const angle = player.angle + (count > 1 ? (i / (count - 1) - .5) * (w.spread || .05) : 0);
      this.spawn({x:player.x+Math.cos(player.angle)*length,y:player.y+Math.sin(player.angle)*length,
        angle,weapon:w.id,isPlayer:true,ownerPlayerId:player.playerId},now,0,true);
    }
  }
  reconcile(snapshot, now, localId) {
    for (const [id, until] of this.retired) if (now >= until) this.retired.delete(id);
    for (const [id,end] of this.ends) if(now>=end.until)this.ends.delete(id);
    const present = new Set();
    for (const data of snapshot.bullets) {
      present.add(data.id);
      if (data.ownerPlayerId === localId) { this.launch([data],now,snapshot.time,localId);continue; }
      let track = this.tracks.get(data.id);
      if (!track) { if(!this.retired.has(data.id))this.spawn(data, now, snapshot.time); continue; }
      if(track.stopped)continue;
      const age = Math.max(0,Math.min(.1,now-track.anchor)), decay = Math.exp(-age*35);
      // Compare at packet time, not the previous rendered frame, otherwise
      // every arriving snapshot introduces a one-frame pause in the tracer.
      const dx = track.x + track.vx*age + track.errorX*decay - data.x;
      const dy = track.y + track.vy*age + track.errorY*decay - data.y;
      track.errorX = Math.abs(dx) < 128 ? dx : 0; track.errorY = Math.abs(dy) < 128 ? dy : 0;
      track.x = data.x; track.y = data.y; track.vx = data.vx ?? track.vx; track.vy = data.vy ?? track.vy;
      track.anchor = now; track.time = snapshot.time;
      track.expires = Math.min(track.expires, now + Math.max(0,(data.maxLifeTime || .24) - (data.lifeTime || 0)));
    }
    // An older datagram cannot erase a more recent reliable birth event.
    for (const [id, track] of this.tracks) if (!track.local && !track.stopped && track.time <= snapshot.time && !present.has(id)) this.stop(track,now,this.ends.get(id));
  }
  sample(now) {
    const rendered = [];
    for (const [id, t] of this.tracks) {
      if (now >= t.expires && t.shown) {
        if (t.local && t.impact) this.b.particleSystem.spawnImpact?.(t.impact.x,t.impact.y,t.bullet.angle,'wall');
        this.retire(id,now); continue;
      }
      // Stop extrapolating remote bullets through a long network interruption.
      const age = Math.max(0,Math.min(t.duration,t.local ? .3 : .1,now-t.anchor)), decay = Math.exp(-age*35);
      t.bullet.prevX=t.bullet.x;t.bullet.prevY=t.bullet.y;
      t.bullet.x=t.stopped?t.stopX:t.x+t.vx*age+t.errorX*decay;t.bullet.y=t.stopped?t.stopY:t.y+t.vy*age+t.errorY*decay;
      t.bullet.tracerLength=Math.min(t.bullet.weaponDef.id==='MAGNUM'?96:58,Math.max(4,Math.hypot(t.bullet.x-t.originX,t.bullet.y-t.originY)));
      t.shown=true;
      rendered.push(t.bullet);
    }
    return rendered;
  }
}
