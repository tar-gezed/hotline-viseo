/* Bounded cosmetic lifetime; never retire a living/knocked-down actor. */
(function(root) {
  'use strict';
  function updateCorpses(enemies, dt, settings) {
    let retained = 0;
    for (const enemy of enemies) {
      if (enemy.isAlive) continue;
      enemy.corpseAge = (enemy.corpseAge || 0) + dt;
      if (enemy.corpseAge >= settings.CORPSE_SECONDS && enemy.corpseFade === undefined) enemy.corpseFade = settings.CORPSE_FADE_SECONDS;
      if (enemy.corpseFade === undefined) retained++;
    }
    if (retained > settings.MAX_CORPSES) {
      // Sort only when the cap is exceeded, by death time rather than spawn order.
      const oldest = enemies.filter(e => !e.isAlive && e.corpseFade === undefined && e.corpseAge >= 1)
        .sort((a,b) => b.corpseAge - a.corpseAge);
      for (let i = 0; i < oldest.length && retained > settings.MAX_CORPSES; i++, retained--) {
        oldest[i].corpseFade = settings.CORPSE_FADE_SECONDS;
      }
    }
    let write = 0;
    for (const enemy of enemies) {
      if (!enemy.isAlive && enemy.corpseFade !== undefined) {
        enemy.corpseFade = Math.max(0, enemy.corpseFade - dt);
        enemy.corpseAlpha = enemy.corpseFade / settings.CORPSE_FADE_SECONDS;
        if (enemy.corpseFade === 0) continue;
      }
      enemies[write++] = enemy;
    }
    enemies.length = write;
  }
  function expireSupplies(weapons, wave, lifetime = 2) {
    let write = 0;
    for (const weapon of weapons) {
      if (Number.isFinite(weapon.supplyWave) && wave - weapon.supplyWave >= lifetime) continue;
      weapons[write++] = weapon;
    }
    weapons.length = write;
  }
  const api = { updateCorpses, expireSupplies };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WorldCleanup = api;
})(typeof window !== 'undefined' ? window : globalThis);
