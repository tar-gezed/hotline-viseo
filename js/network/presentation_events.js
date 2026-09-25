// Cosmetic allowlist: replay never damages entities, changes inventory or scores.
const METHODS = {
  particleSystem: ['addFloatingText','floatingComboText','shatterGlass','spark','spawnImpact'],
  bloodSystem: ['bulletWound','shotgunBlast','groundExecution','katanaSlice','decapitation','sprayBlood','createSpray','createBloodPool','stampFootprint'],
  hud: ['addScorePopup','notifyDryFire'],
  soundFX: ['playWeaponPickup','playWeaponThrow','playAmmoRefill','playExecution','playExecutionHit','playFleshImpact','playMeleeHit','playMeleeImpact','playEmptyClick','playGlassShatter','playDoorKick','playRevive'],
  mapRenderer: ['addBulletHole']
};
function safe(value, depth = 0) {
  if (depth > 3) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= 1e7;
  if (typeof value === 'string') return value.length <= 160;
  if (Array.isArray(value)) return value.length <= 16 && value.every(v => safe(v,depth+1));
  if (value && typeof value === 'object') return Object.keys(value).length <= 16 && Object.entries(value).every(([k,v]) => !['__proto__','constructor','prototype'].includes(k) && safe(v,depth+1));
  return false;
}
export function validPresentationEvent(e) {
  return !!e && e.kind === 'presentation' && Object.hasOwn(METHODS,e.target) && METHODS[e.target].includes(e.method)
    && Array.isArray(e.args) && e.args.length <= 8 && safe(e.args) && JSON.stringify(e.args).length <= 1600;
}
export class PresentationEvents {
  constructor(bridge, broadcast, enabled) {
    this.b = bridge; this.depth = 0;
    for (const [target,methods] of Object.entries(METHODS)) for (const method of methods) {
      const object=bridge[target], original=object?.[method]; if(typeof original !== 'function')continue;
      object[method]=(...args)=>{
        const outer=this.depth++ === 0;
        try {
          if(outer && enabled()) {
            const event={kind:'presentation',target,method,args:args.map(v=>v===undefined?null:v)};
            if(validPresentationEvent(event))broadcast(event);
          }
          return original.apply(object,args);
        } finally { this.depth--; }
      };
    }
  }
  replay(event) {
    if(!validPresentationEvent(event))return false;
    const object=this.b[event.target];
    if(typeof object?.[event.method] !== 'function')return false;
    this.depth++;
    try { object[event.method](...event.args); } finally { this.depth--; }
    return true;
  }
}
