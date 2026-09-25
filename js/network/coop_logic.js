export function spawnPoints(origin, isClear) {
  const found = [];
  for (let ring = 0; ring <= 10 && found.length < 5; ring++) {
    const count = ring ? ring * 8 : 1;
    for (let i = 0; i < count && found.length < 5; i++) {
      const a = i / count * Math.PI * 2, p = { x: origin.x + Math.cos(a) * ring * 34, y: origin.y + Math.sin(a) * ring * 34 };
      if (isClear(p) && found.every(q => Math.hypot(p.x - q.x, p.y - q.y) >= 29)) found.push(p);
    }
  }
  if (found.length !== 5) throw Error('La carte ne contient pas cinq points de départ coopératifs sûrs.');
  return found;
}
export const canFight = player => player.isAlive && !player.isDowned;
export const squadDefeated = players => players.length > 0 && players.every(p => !canFight(p));
export function respawnSquad(players, points) {
  for (const p of players) if (!canFight(p)) {
    const at = points[p.playerId]; p.respawn(at.x, at.y); p.respawnShield = .8; p.isInvulnerable = true;
  }
}

export function reviveTarget(actor, players, canReach) {
  if (!canFight(actor) || actor.state === 'EXECUTING') return null;
  return players.filter(p => p !== actor && p.isAlive && p.isDowned && Math.hypot(p.x-actor.x,p.y-actor.y) <= 58 && canReach(actor,p))
    .sort((a,b) => Math.hypot(a.x-actor.x,a.y-actor.y)-Math.hypot(b.x-actor.x,b.y-actor.y) || a.playerId-b.playerId)[0] || null;
}

// Reserve contextual interaction before the ordinary actions run. One helper
// owns each rescue; holding E/Space never throws a weapon or executes an enemy.
export function prepareRevives(players, inputFor, canReach) {
  const helpers = new Map();
  for (const actor of players) {
    const target = inputFor(actor.playerId)?.isReviveDown() ? reviveTarget(actor,players,canReach) : null;
    actor.isReviving = !!target;
    if (!target) continue;
    const previous = helpers.get(target.playerId);
    if (!previous || actor.playerId === target.reviverId) helpers.set(target.playerId,actor);
  }
  return helpers;
}

export function advanceRevives(players, helpers, dt) {
  const revived = [], died = [];
  for (const target of players) {
    if (!target.isDowned) continue;
    target.downedTimer = Math.max(0,target.downedTimer-dt);
    // Bleeding wins if its deadline and rescue completion share one host tick.
    if (target.downedTimer <= 1e-8) { target.bleedOut(); died.push(target); continue; }
    const helper = helpers.get(target.playerId);
    if (!helper || !canFight(helper)) { target.reviveProgress=0; target.reviverId=-1; continue; }
    if (target.reviverId !== helper.playerId) target.reviveProgress = 0;
    target.reviverId = helper.playerId;
    target.reviveProgress = Math.min(2,target.reviveProgress+dt);
    if (target.reviveProgress >= 2-1e-8 && target.revive()) {
      helper.revives = (helper.revives || 0)+1;
      revived.push({helper,target});
    }
  }
  return {revived,died};
}
export function creditKill(player, points, weapon, config) {
  if (!player) return 0;
  player.kills = (player.kills || 0) + 1; player.combo = (player.combo || 0) + 1;
  player.maxCombo = Math.max(player.maxCombo || 0, player.combo);
  player.comboTimer = Math.max(1.4, (config.COMBO_WINDOW_BASE - (player.combo - 1) * config.COMBO_WINDOW_DECAY) * (player.perks?.comboTimeMult || 1));
  const multipliers = config.COMBO_MULTIPLIERS;
  const earned = Math.round(points * multipliers[Math.min(player.combo - 1, multipliers.length - 1)] * (player.perks?.scoreMult || 1));
  player.score += earned;
  player.weaponKills ||= {}; player.weaponKills[weapon] = (player.weaponKills[weapon] || 0) + 1;
  player.favoriteWeapon = Object.keys(player.weaponKills).sort((a,b) => player.weaponKills[b] - player.weaponKills[a])[0];
  return earned;
}
export function rankPlayers(players, members) {
  return players.map(p => ({ slot:p.playerId, name:members.get(p.playerId)?.name || 'Collègue', mask:p.mask.toLowerCase(), kills:p.kills || 0,
    falls:p.falls || 0, maxCombo:p.maxCombo || 0, score:p.score || 0, favoriteWeapon:p.favoriteWeapon || '—', isAlive:canFight(p),
    deathWave:p.deathWave || 1, deathTime:p.deathTime || 0, survival:canFight(p) ? p.elapsed || 0 : p.deathTime || 0 }))
    .sort((a,b) => (b.kills * 500 + b.score + b.survival - b.falls * 300) - (a.kills * 500 + a.score + a.survival - a.falls * 300) || a.slot - b.slot);
}
