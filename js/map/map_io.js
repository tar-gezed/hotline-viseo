/* Shared, backward-compatible map file codec. No runtime state is exported. */
(function(root){
  'use strict';
  const FORMAT = 'hotline-viseo-map-edits';
  const VERSION = 2;
  const clone = x => JSON.parse(JSON.stringify(x));
  const finite = Number.isFinite;
  function validationError(message) {
    return { ok: false, error: message };
  }

  function validateArray(value, label, max) {
    if (!Array.isArray(value)) return validationError(`${label} must be an array.`);
    if (value.length > max) return validationError(`${label} contains too many records.`);
    return { ok: true };
  }

  function validateRecordIds(records, label) {
    const seen = new Set();
    for (const item of records) {
      if (!item || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 160) {
        return validationError(`${label} contains a record without a valid id.`);
      }
      if (seen.has(item.id)) return validationError(`${label} contains duplicate id “${item.id}”.`);
      seen.add(item.id);
    }
    return { ok: true };
  }

  function checkNumber(record, key, label, options = {}) {
    if (!finite(record[key])) return validationError(`${label}.${key} must be a finite number.`);
    if (options.min !== undefined && record[key] < options.min) return validationError(`${label}.${key} is below the allowed minimum.`);
    if (options.max !== undefined && record[key] > options.max) return validationError(`${label}.${key} is above the allowed maximum.`);
    return { ok: true };
  }

  function validatePayload(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return validationError('The JSON root must be an object.');
    if (input.format && input.format !== FORMAT) return validationError('This file is not a VISEO map edit export.');
    if (input.version !== undefined && ![1, 2].includes(input.version)) return validationError(`Unsupported edit version ${input.version}.`);

    for (const [key, label, max] of [
      ['walls', 'Walls', 512],
      ['glassPartitions', 'Glass partitions', 512],
      ['doors', 'Doors', 256],
      ['props', 'Furniture', 512]
    ]) {
      const valid = validateArray(input[key], label, max);
      if (!valid.ok) return valid;
      const ids = validateRecordIds(input[key], label);
      if (!ids.ok) return ids;
    }

    for (const [index, wall] of input.walls.entries()) {
      for (const key of ['x1', 'y1', 'x2', 'y2']) {
        const valid = checkNumber(wall, key, `walls[${index}]`);
        if (!valid.ok) return valid;
      }
      if (wall.type !== undefined && typeof wall.type !== 'string') return validationError(`walls[${index}].type must be text.`);
    }
    for (const [index, partition] of input.glassPartitions.entries()) {
      for (const key of ['x1', 'y1', 'x2', 'y2']) {
        const valid = checkNumber(partition, key, `glassPartitions[${index}]`);
        if (!valid.ok) return valid;
      }
      const thickness = checkNumber(partition, 'thickness', `glassPartitions[${index}]`, { min: 0, max: 100 });
      if (!thickness.ok) return thickness;
    }
    for (const [index, door] of input.doors.entries()) {
      for (const key of ['x', 'y', 'length', 'baseAngle']) {
        const valid = checkNumber(door, key, `doors[${index}]`);
        if (!valid.ok) return valid;
      }
      const length = checkNumber(door, 'length', `doors[${index}]`, { min: 1, max: 2000 });
      if (!length.ok) return length;
      if (door.swingRange !== undefined) {
        const range = checkNumber(door, 'swingRange', `doors[${index}]`, { min: 0, max: Math.PI * 4 });
        if (!range.ok) return range;
      }
      if (door.type !== undefined && typeof door.type !== 'string') return validationError(`doors[${index}].type must be text.`);
      if (door.name !== undefined && typeof door.name !== 'string') return validationError(`doors[${index}].name must be text.`);
    }
    for (const [index, prop] of input.props.entries()) {
      for (const key of ['x', 'y', 'width', 'height']) {
        const valid = checkNumber(prop, key, `props[${index}]`);
        if (!valid.ok) return valid;
      }
      for (const key of ['collisionWidth', 'collisionHeight', 'angle']) {
        if (prop[key] !== undefined) {
          const valid = checkNumber(prop, key, `props[${index}]`);
          if (!valid.ok) return valid;
        }
      }
      if (prop.width < 0 || prop.height < 0) return validationError(`props[${index}] cannot have negative dimensions.`);
      if (prop.type !== undefined && typeof prop.type !== 'string') return validationError(`props[${index}].type must be text.`);
    }
    return { ok: true };
  }


  const fields = ['buildingFootprint','zones','serviceCoreRooms','visualFixtures','playerSpawn','extractionElevator','spawnLocations','crateLocations','enemies','weapons','navGraphDefinition','editableDecor','floorLayers'];
  const materials = {
    carpet_grey:'Moquette grise', carpet_jade:'Moquette verte', carpet_lavender:'Moquette violette',
    carpet_dark:'Moquette sombre', carpet_blue_accent:'Moquette bleue', wood_parquet:'Parquet',
    tile_restroom:'Carrelage clair', tile_reception:'Carrelage vert'
  };
  function defaultFloors(map) {
    const floors=(map.zones||[]).filter(z=>z.id!=='diagonal_upper').map(z=>clone(z));
    for(const bay of map.visualFixtures?.executiveOfficeBays||[]) floors.push({id:'floor_'+bay.id,name:'Bureau vitré '+bay.id.split('_').pop(),type:'carpet_dark',polygon:clone(bay.polygon)});
    for(const [i,room] of (map.serviceCoreRooms||[]).entries()) floors.push({id:room.id,name:'Pièce centrale '+(i+1),type:'tile_restroom',polygon:clone(room.polygon)});
    return floors;
  }
  function polygonError(points) {
    try {checkPolygon(points);}catch(e){return e.message;}
    const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    let area=0;
    for(let i=0;i<points.length;i++) {
      const a=points[i],b=points[(i+1)%points.length];
      if(Math.hypot(b.x-a.x,b.y-a.y)<1) return 'Deux sommets du sol sont confondus.';
      area+=a.x*b.y-b.x*a.y;
      for(let j=i+1;j<points.length;j++) {
        if(j===i+1 || (i===0&&j===points.length-1)) continue;
        const c=points[j],d=points[(j+1)%points.length];
        if(cross(a,b,c)*cross(a,b,d)<=0 && cross(c,d,a)*cross(c,d,b)<=0 &&
          Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x)) &&
          Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y))<=Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y))) return 'Les bords du sol se croisent.';
      }
    }
    return Math.abs(area)<2?'La surface du sol est nulle.':null;
  }
  function editableDressing(map) {
    if(map.editableDecor) return;
    const at=map.visualFixtures?.westLounge?.loungeAnchor || map.planToWorld(31,40);
    const plant=map.planToWorld(28,58);
    const items=[
      ['ambient_sofa','lounge_sofa',at.x+86,at.y+26,172,52],
      ['ambient_pouf_cyan','pouf_cyan',at.x-22,at.y+26,38,38],
      ['ambient_pouf_navy','pouf_navy',at.x+194,at.y+26,34,34],
      ['ambient_plant','plant',plant.x,plant.y-12,44,44],
      ...(map.spawnLocations||[]).filter(p=>p.type==='elevator').map(p=>['ambient_'+p.id,'elevator',p.x,p.y,104,72])
    ];
    for(const [id,type,x,y,width,height] of items) if(!map.props.some(p=>p.id===id)) map.props.push({id,type,x,y,width,height,collisionWidth:width,collisionHeight:height,angle:0,centered:true,solid:false});
    map.editableDecor=true;
  }
  function validate(raw) {
    const p = raw && raw.payload || raw;
    const basic = validatePayload(p);
    if (!basic.ok) return basic;
    const walk = (v,depth=0) => {
      if(depth>24) throw Error('Carte trop profondément imbriquée.');
      if(typeof v==='number' && (!Number.isFinite(v)||Math.abs(v)>10000000)) throw Error('Coordonnée invalide.');
      if(v && typeof v==='object') for(const k of Object.keys(v)) {
        if(['__proto__','constructor','prototype'].includes(k)) throw Error('Clé non autorisée.');
        walk(v[k],depth+1);
      }
    };
    try {
      walk(p);
      if(p.mapSize && (!finite(p.mapSize.width)||!finite(p.mapSize.height)||p.mapSize.width<100||p.mapSize.height<100||p.mapSize.width>8000||p.mapSize.height>8000)) throw Error('Dimensions de carte invalides (100–8000).');
      for(const key of ['zones','serviceCoreRooms']) if(p[key]!==undefined) {
        if(!Array.isArray(p[key])||p[key].length>512) throw Error(key+' invalide.');
        for(const z of p[key]) checkPolygon(z.polygon);
      }
      if(p.floorLayers!==undefined) {
        if(!Array.isArray(p.floorLayers)||p.floorLayers.length>512) throw Error('Liste des sols invalide.');
        const ids=validateRecordIds(p.floorLayers,'Sols');if(!ids.ok)throw Error(ids.error);
        for(const floor of p.floorLayers) {
          if(!Object.hasOwn(materials,floor.type))throw Error('Matériau de sol inconnu.');
          const error=polygonError(floor.polygon);if(error)throw Error(error);
        }
      }
      if(p.buildingFootprint) checkPolygon(p.buildingFootprint);
      for(const key of ['playerSpawn','extractionElevator']) if(p[key]) checkPoint(p[key]);
      for(const key of ['spawnLocations','crateLocations','enemies','weapons']) if(p[key]!==undefined) {
        if(!Array.isArray(p[key])||p[key].length>512) throw Error(key+' invalide.');
        p[key].forEach(checkPoint);
      }
      for(const w of p.weapons||[]) {
        if(typeof w.type!=='string'||!w.type.trim())throw Error('Type d’arme manquant.');
        if(w.ammo!==undefined && (!Number.isInteger(w.ammo)||w.ammo<0||w.ammo>9999))throw Error('Munitions : entier entre 0 et 9999.');
      }
      for(const group of [p.weapons||[],p.spawnLocations||[]]){
        const ids=new Set();for(const point of group){if(point.id!==undefined){if(typeof point.id!=='string'||!point.id||ids.has(point.id))throw Error('Identifiant de point invalide ou dupliqué.');ids.add(point.id);}}
      }
      if(p.spawnLocations && !p.spawnLocations.length) throw Error('Au moins une arrivée ennemie est nécessaire.');
      if(p.navGraphDefinition && (!Array.isArray(p.navGraphDefinition.nodes)||p.navGraphDefinition.nodes.length>5000)) throw Error('Navigation invalide.');
      if(p.navGraphDefinition) p.navGraphDefinition.nodes.forEach(checkPoint);
      return {ok:true};
    } catch(e){return {ok:false,error:e.message};}
  }
  function checkPoint(p){if(!p||!finite(p.x)||!finite(p.y)) throw Error('Point invalide.');if(p.angle!==undefined&&!finite(p.angle))throw Error('Orientation invalide.');}
  function checkPolygon(p){if(!Array.isArray(p)||p.length<3||p.length>1024) throw Error('Polygone invalide.');p.forEach(checkPoint);}
  function snapshot(map) {
    const p={format:FORMAT,version:VERSION,mapSize:{width:map.MAP_WIDTH,height:map.MAP_HEIGHT},name:map.name||'Ma carte'};
    for(const key of ['walls','glassPartitions','doors','props']) p[key]=map[key].map((v,i)=>{
      const authored = {...v};
      if(key==='doors') for(const k of ['lastKickedBy','lastKickedByPlayerId','renderAngle','hitEntities','pushContributors','contactPush','kickTime','kickCooldown','kickSign','isDangerous','bloodStains']) delete authored[k];
      const q=clone(authored);q.id=q.id||key+'_'+String(i+1).padStart(3,'0');
      if(key==='doors'||key==='glassPartitions') for(const k of ['shattered','health','maxHealth','angle','prevAngle','angularVelocity','minAngle','maxAngle']) delete q[k];
      return q;
    });
    for(const key of fields) if(map[key]!==undefined) p[key]=clone(map[key]);
    const dressing=Object.assign({},map,p,{props:p.props});editableDressing(dressing);
    p.props=dressing.props;p.editableDecor=true;
    p.floorLayers=clone(map.floorLayers===undefined?defaultFloors(map):map.floorLayers);
    return p;
  }
  // Cut every collinear layer, including duplicate wall/glass segments. Work
  // on map data only; never write over an imported file or a saved draft.
  function cutDoorOpening(map, a, b, tolerance=2) {
    const len=Math.hypot(b.x-a.x,b.y-a.y);if(len<1)return;
    const ux=(b.x-a.x)/len,uy=(b.y-a.y)/len;
    for(const key of ['walls','glassPartitions']) {
      const result=[],ids=new Set(map[key].map(x=>x.id));
      for(const w of map[key]) {
        const ax=w.x1-a.x,ay=w.y1-a.y,bx=w.x2-a.x,by=w.y2-a.y;
        const ta=ax*ux+ay*uy,tb=bx*ux+by*uy;
        if(Math.abs(ax*uy-ay*ux)>tolerance||Math.abs(bx*uy-by*ux)>tolerance||Math.abs(tb-ta)<1) {result.push(w);continue;}
        const lo=Math.max(0,Math.min(ta,tb)),hi=Math.min(len,Math.max(ta,tb));
        if(hi-lo<0.5){result.push(w);continue;}
        const t0=Math.min((lo-ta)/(tb-ta),(hi-ta)/(tb-ta)),t1=Math.max((lo-ta)/(tb-ta),(hi-ta)/(tb-ta));
        const point=t=>({x:w.x1+(w.x2-w.x1)*t,y:w.y1+(w.y2-w.y1)*t});
        if(t0>0.0001){const q=point(t0);const left=Object.assign(Object.create(Object.getPrototypeOf(w)),w,{x2:q.x,y2:q.y});result.push(left);}
        if(t1<0.9999){const q=point(t1);let id=w.id;
          if(t0>0.0001){let n=1;while(ids.has(id=w.id+'_opening_'+n))n++;ids.add(id);}
          result.push(Object.assign(Object.create(Object.getPrototypeOf(w)),w,{id,x1:q.x,y1:q.y}));}
      }
      map[key]=result;
    }
  }
  function materialize(raw,base,Doors) {
    const p=raw && raw.payload || raw; const valid=validate(p);if(!valid.ok) throw Error(valid.error);
    const map=Object.assign({},base);
    for(const key of fields) if(p[key]!==undefined || base[key]!==undefined) map[key]=clone(p[key]===undefined?base[key]:p[key]);
    map.name=typeof p.name==='string'?p.name.slice(0,120):'Carte importée';
    map.MAP_WIDTH=p.mapSize?.width||base.MAP_WIDTH;map.MAP_HEIGHT=p.mapSize?.height||base.MAP_HEIGHT;
    map.walls=clone(p.walls);map.props=clone(p.props);
    editableDressing(map);
    if(map.floorLayers===undefined) map.floorLayers=defaultFloors(map);
    for(const [key,Class] of [['doors',Doors.Door],['glassPartitions',Doors.GlassPartition]]) map[key]=p[key].map(v=>{
      const q=clone(v);for(const k of ['shattered','health','maxHealth','angle','prevAngle','angularVelocity','minAngle','maxAngle']) delete q[k];
      return Class?new Class(q):q;
    });
    for(const d of map.doors) cutDoorOpening(map,{x:d.x,y:d.y},{x:d.x+Math.cos(d.baseAngle)*d.length,y:d.y+Math.sin(d.baseAngle)*d.length});
    map.spawnPoints={player:map.playerSpawn,enemies:map.enemies,weapons:map.weapons,spawnLocations:map.spawnLocations,crateLocations:map.crateLocations};
    return map;
  }
  const api={FORMAT,VERSION,snapshot,materialize,validate,materials,polygonError,cutDoorOpening};
  root.MapIO=api;if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

