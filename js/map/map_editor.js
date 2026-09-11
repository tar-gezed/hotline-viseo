/**
 * map_editor.js - standalone, non-destructive map geometry editor.
 *
 * The editor intentionally keeps an immutable serializable snapshot of MapData
 * and materializes a separate working map for MapRenderer/Physics. It never
 * assigns to the source MapData arrays, so opening the editor cannot alter a
 * game run or the authored map module.
 */
(function () {
  'use strict';

  const mapSource = window.MapData;
  const Physics = window.Physics;
  const Collision = window.Collision || null;
  const Doors = window.Doors || {};
  const MapRenderer = window.MapRenderer;
  const DRAFT_KEY = 'hotline-viseo-map-editor-draft-v1';
  const FORMAT = 'hotline-viseo-map-edits';
  const VERSION = 2;
  const PROBE_RADIUS = 14;

  if (!mapSource || !Physics || !MapRenderer) {
    document.body.innerHTML = '<main style="padding:24px;color:#fff;background:#080a14;font:16px system-ui">Map editor could not load MapData, Physics, or MapRenderer.</main>';
    return;
  }

  const $ = id => document.getElementById(id);
  const canvas = $('mapCanvas');
  const ctx = canvas.getContext('2d');
  const canvasWrap = canvas.parentElement;
  const statusMain = $('statusMain');
  const statusCollision = $('statusCollision');
  const inspectorEmpty = $('inspectorEmpty');
  const inspectorContent = $('inspectorContent');

  const layers = {
    gameplay: true,
    art: true,
    plan: false,
    walls: true,
    glass: true,
    doors: true,
    props: true,
    labels: false
  };

  const view = { x: mapSource.MAP_WIDTH * 0.5, y: mapSource.MAP_HEIGHT * 0.5, zoom: 1 };
  let dpr = 1;
  let viewportWidth = 1;
  let viewportHeight = 1;
  let planImage = null;
  let imageReady = false;
  let selected = null;
  let probeMode = false;
  let clearanceMode = false;
  let clearanceSamples = null;
  let probePoint = null;
  let pointerState = null;
  let spaceDown = false;
  let saveTimer = null;
  let sourceReset = false;
  let inspectorEditSession = null;

  let floorTool = null, floorPoints = [], floorPointer = null;
  let placing = false, placementStart = null, placementPointer = null, placementHost = null;
  const pointKinds = ['player','weapon','spawn'];
  const weaponDefs = Object.values(WeaponSystem.WEAPON_TYPES).filter(w=>w.id!=='FISTS');
  const palette = [
    ['player:start','Déplacer le départ du joueur'],['spawn:entry','Arrivée ennemie (toutes les vagues)'],
    ...weaponDefs.map(w=>['weapon:'+w.id,'Arme · '+w.name]),
    ['wall:interior','Mur intérieur'],['wall:exterior','Mur extérieur'],['wall:core','Cloison technique'],
    ['glass:glass','Vitre'],['door:wood','Porte en bois'],['door:glass','Porte vitrée'],['door:security','Porte métallique'],
    ['prop:desk_cluster_6','Bureaux · 6 places',260,150],['prop:desk_cluster_4','Bureaux · 4 places',190,150],
    ['prop:executive_desk','Bureau individuel',154,68],['prop:conference_table_oval','Table ovale',150,80],
    ['prop:conference_table_large','Grande table',240,110],['prop:kitchen_counter','Comptoir cuisine',180,64],
    ['prop:reception_counter','Comptoir accueil',150,60],['prop:acoustic_sofa_pod','Cabine acoustique',150,120],
    ['prop:lounge_sofa','Canapé',172,62],['prop:lounge_armchair','Fauteuil',60,60],
    ['prop:pouf_cyan','Pouf cyan',38,38],['prop:pouf_navy','Pouf bleu',38,38],
    ['prop:printer_station','Imprimante',62,48],['prop:planter_cabinet','Meuble végétalisé',90,42],
    ['prop:plant','Plante',42,42],['prop:planter_box','Jardinière',90,40],
    ['prop:coffee_machine','Machine à café',40,36],['prop:water_cooler','Fontaine à eau',36,36],['prop:elevator','Repère d’arrivée (sol)',104,72]
  ];
  function uniqueId(kind) {
    const used = new Set(['wall','glass','door','prop','floor','weapon','spawn'].flatMap(k=>collectionFor(k).map(v=>v.id)));
    let i=1;while(used.has(kind+'_'+i))i++;
    return kind+'_'+i;
  }
  function cancelPlacement() {
    placing=false;placementStart=null;placementPointer=null;placementHost=null;
    floorTool=null;floorPoints=[];floorPointer=null;$('finishFloorBtn').disabled=true;
    $('addBtn').textContent='Placer sur la carte';canvas.style.cursor='';render();
  }
  function floorContains(p,polygon) {
    let inside=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const a=polygon[i],b=polygon[j];
      if(((a.y>p.y)!==(b.y>p.y))&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
    }
    return inside;
  }
  function refreshFloorList() {
    const list=$('floorList');list.replaceChildren(new Option('Choisir une zone…',''));
    for(const floor of workingData.floorLayers) list.add(new Option(floor.name||floor.id,floor.id));
    list.value=selected?.kind==='floor'?selected.id:'';
  }
  function beginFloor(tool) {
    cancelPlacement();setSelected(null);floorTool=tool;$('editFloors').checked=true;
    probeMode=false;canvas.style.cursor='crosshair';
    setStatus(tool==='rectangle'?'Cliquer deux coins opposés.':'Cliquer les sommets puis Entrée, ou cliquer le premier sommet pour fermer.');
  }
  function finishFloor() {
    if(!floorTool || floorPoints.length<3) return;
    const error=window.MapIO.polygonError(floorPoints);
    if(error){setStatus(error,'error');if(floorTool==='rectangle'){floorPoints=[floorPoints[0]];$('finishFloorBtn').disabled=true;}return;}
    const id=uniqueId('floor'),type=$('floorMaterial').value;
    commitMutation('Sol créé',()=>{workingData.floorLayers.push({id,name:'Sol '+(workingData.floorLayers.length+1),type,polygon:deepClone(floorPoints)});selected={kind:'floor',id};});
    cancelPlacement();setSelected({kind:'floor',id});
  }
  function floorClick(world,event) {
    if(floorTool){
      const point={x:snapValue(world.x),y:snapValue(world.y)};
      if(floorTool==='rectangle' && floorPoints.length===1){
        const a=floorPoints[0];floorPoints=[a,{x:point.x,y:a.y},point,{x:a.x,y:point.y}];finishFloor();return true;
      }
      if(floorPoints.length>=3 && Math.hypot(point.x-floorPoints[0].x,point.y-floorPoints[0].y)<12/view.zoom){finishFloor();return true;}
      floorPoints.push(point);$('finishFloorBtn').disabled=floorPoints.length<3;render();return true;
    }
    if(!$('editFloors').checked)return false;
    let floor=selected?.kind==='floor'?recordFor(selected):null;
    let vertex=floor?floor.polygon.findIndex(p=>Math.hypot(world.x-p.x,world.y-p.y)<11/view.zoom):-1;
    const onSelectedEdge=floor && floor.polygon.some((a,i)=>distanceToSegment(world,a,floor.polygon[(i+1)%floor.polygon.length]).distance<10/view.zoom);
    if(vertex<0 && !onSelectedEdge && (!floor || !floorContains(world,floor.polygon))) floor=[...workingData.floorLayers].reverse().find(f=>floorContains(world,f.polygon));
    if(!floor){setSelected(null);return true;}
    setSelected({kind:'floor',id:floor.id});
    pointerState={mode:vertex>=0?'floorVertex':'floorMove',vertex,selection:{...selected},startSnapshot:currentSnapshot(),startWorld:world,original:deepClone(floor.polygon)};
    canvas.setPointerCapture(event.pointerId);return true;
  }
  function drawFloorTools() {
    if(!$('editFloors').checked&&!floorTool)return;
    ctx.save();ctx.lineWidth=1/view.zoom;
    for(const floor of workingData.floorLayers){
      if(!floor.polygon.length)continue;
      ctx.strokeStyle='rgba(115,239,209,.35)';ctx.beginPath();
      floor.polygon.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();
    }
    const item=selected?.kind==='floor'?recordFor(selected):null;
    if(item){
      ctx.strokeStyle='#fff';ctx.fillStyle='rgba(103,236,201,.12)';ctx.lineWidth=2/view.zoom;
      ctx.beginPath();item.polygon.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();ctx.stroke();
      item.polygon.forEach((p,i)=>{ctx.fillStyle='#fff';ctx.fillRect(p.x-5/view.zoom,p.y-5/view.zoom,10/view.zoom,10/view.zoom);ctx.font=`${12/view.zoom}px monospace`;ctx.fillText(String(i+1),p.x+9/view.zoom,p.y-9/view.zoom);});
    }
    if(floorTool&&floorPoints.length){
      let pts=[...floorPoints];if(floorPointer)pts.push(floorPointer);
      if(floorTool==='rectangle'&&pts.length===2){const [a,b]=pts;pts=[a,{x:b.x,y:a.y},b,{x:a.x,y:b.y},a];}
      ctx.strokeStyle='#ffcf72';ctx.lineWidth=2/view.zoom;ctx.setLineDash([6/view.zoom,4/view.zoom]);
      ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
      ctx.stroke();
      ctx.fillStyle='#ffcf72';for(const p of floorPoints)ctx.fillRect(p.x-4/view.zoom,p.y-4/view.zoom,8/view.zoom,8/view.zoom);
    }
    ctx.restore();
  }

  function cutOpening(a,b) {
    if(placementHost){
      const p={x:placementHost.x1,y:placementHost.y1},q={x:placementHost.x2,y:placementHost.y2};
      const pa=distanceToSegment(a,p,q),pb=distanceToSegment(b,p,q);
      a.x=pa.x;a.y=pa.y;b.x=pb.x;b.y=pb.y;
    }
    MapIO.cutDoorOpening(workingData,a,b);
  }
  function placeAt(point) {
    const choice=palette.find(p=>p[0]===$('addType').value);
    const [kind,type]=choice[0].split(':');
    const p={x:snapValue(point.x),y:snapValue(point.y)};
    if(pointKinds.includes(kind)) {
      const id=kind==='player'?'player_start':uniqueId(kind);
      commitMutation('Placement de jeu modifié',()=>{
        if(kind==='player') Object.assign(workingData.playerSpawn,p);
        else if(kind==='weapon'){const def=WeaponSystem.getWeaponType(type);workingData.weapons.push({id,...p,type,ammo:def.isGun?def.maxAmmo:0,angle:0});}
        else workingData.spawnLocations.push({id,...p,type:'entry',name:'Arrivée '+(workingData.spawnLocations.length+1),angle:0});
        layers.gameplay=true;$('layerGameplay').checked=true;
      });
      cancelPlacement();setSelected({kind,id});return;
    }
    if(kind==='door') {
      if(!placementStart) {
        let closest=Math.max(12,10/view.zoom);
        for(const host of [...workingData.walls,...workingData.glassPartitions]) {
          const hit=distanceToSegment(point,{x:host.x1,y:host.y1},{x:host.x2,y:host.y2});
          if(hit.distance<closest){closest=hit.distance;placementHost=host;}
        }
      }
      if(placementHost) {
        const hit=distanceToSegment(point,{x:placementHost.x1,y:placementHost.y1},{x:placementHost.x2,y:placementHost.y2});
        p.x=hit.x;p.y=hit.y;
      }
    }
    if(kind!=='prop'&&!placementStart){placementStart=p;placementPointer=p;setStatus('Cliquer la seconde extrémité. Échap annule.');render();return;}
    if(kind==='door'&&Math.hypot(p.x-placementStart.x,p.y-placementStart.y)<48){setStatus('Une porte doit mesurer au moins 48 unités pour laisser passer les personnages.','error');return;}
    if(kind!=='prop'&&Math.hypot(p.x-placementStart.x,p.y-placementStart.y)<16){setStatus('Le segment doit mesurer au moins 16 unités.','error');return;}
    const id=uniqueId(kind);
    commitMutation('Élément ajouté',()=>{
      let item;
      if(kind==='prop') item={id,type,...p,width:choice[2],height:choice[3],collisionWidth:choice[2],collisionHeight:choice[3],angle:0,centered:true,solid:!['plant','planter_box','coffee_machine','water_cooler','elevator'].includes(type),color:'#c6b087',chairs:type==='conference_table_large'?8:4};
      else {
        const a={...placementStart},b={...p};
        if(kind==='door') {
          cutOpening(a,b);
          item=new Doors.Door({id,name:choice[1],type,x:a.x,y:a.y,length:Math.hypot(b.x-a.x,b.y-a.y),baseAngle:Math.atan2(b.y-a.y,b.x-a.x)});
        } else {item={id,type,x1:a.x,y1:a.y,x2:b.x,y2:b.y};if(kind==='glass')item=new Doors.GlassPartition({...item,thickness:6});}
      }
      collectionFor(kind).push(item);selected={kind,id};
      const layer={wall:'walls',glass:'glass',door:'doors',prop:'props'}[kind];layers[layer]=true;
      $({wall:'layerWalls',glass:'layerGlass',door:'layerDoors',prop:'layerProps'}[kind]).checked=true;
    });
    cancelPlacement();setSelected({kind,id});
  }
  function deleteSelected() {
    if(!recordFor(selected)) return;
    if(selected.kind==='player'){setStatus('Le départ du joueur est unique : déplace-le au lieu de le supprimer.','error');return;}
    if(selected.kind==='spawn'&&workingData.spawnLocations.length<=1){setStatus('Conserver au moins une arrivée ennemie pour les vagues.','error');return;}
    const target={...selected};
    commitMutation('Élément supprimé',()=>{const c=collectionFor(target.kind);c.splice(c.findIndex(x=>x.id===target.id),1);selected=null;});
  }
  function duplicateSelected() {
    const item=recordFor(selected);if(!item)return;
    if(selected.kind==='player'){setStatus('Un seul départ joueur est nécessaire.','error');return;}
    const kind=selected.kind,copy=deepClone(item);copy.id=uniqueId(kind);
    if(kind==='floor'){copy.polygon=copy.polygon.map(p=>({x:p.x+40,y:p.y+40}));}else if(kind==='wall'||kind==='glass'){copy.x1+=40;copy.x2+=40;copy.y1+=40;copy.y2+=40;}else{copy.x+=40;copy.y+=40;}
    commitMutation('Élément dupliqué',()=>{collectionFor(kind).push(kind==='door'?new Doors.Door(copy):kind==='glass'?new Doors.GlassPartition(copy):copy);selected={kind,id:copy.id};});
  }

  let undoStack = [];
  let redoStack = [];
  let payload = snapshotFromMap(mapSource);
  const basePayload = deepClone(payload);
  let workingData = materialize(payload);
  let renderer = new MapRenderer(workingData);

  // -------------------------------------------------------------------------
  // Plain map snapshots and schema validation
  // -------------------------------------------------------------------------

  function deepClone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function idFor(prefix, index) {
    return `${prefix}_${String(index + 1).padStart(3, '0')}`;
  }

  function snapshotFromMap(data) { return window.MapIO.snapshot(data); }
  function materialize(next) {
    const map=window.MapIO.materialize(next,mapSource,Doors);
    for(const key of ['weapons','spawnLocations']){
      map[key]=map[key]||[];const ids=new Set(map[key].map(v=>v.id).filter(Boolean));
      map[key].forEach((v,i)=>{if(!v.id){let id=key+'_'+(i+1);while(ids.has(id))id+='_';v.id=id;ids.add(id);}});
    }
    return map;
  }

  function currentSnapshot() {
    return snapshotFromMap(workingData);
  }

  function payloadEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function validatePayload(data) { return window.MapIO.validate(data); }

  function normalizeImported(raw) {
    if (raw && raw.payload && typeof raw.payload === 'object') return raw.payload;
    return raw;
  }

  // -------------------------------------------------------------------------
  // Status, history, draft, and file actions
  // -------------------------------------------------------------------------

  function setStatus(message, tone) {
    statusMain.textContent = message;
    statusMain.style.color = tone === 'error' ? 'var(--red)' : tone === 'ok' ? 'var(--green)' : '';
  }

  function updateHistoryUI() {
    $('undoBtn').disabled = undoStack.length === 0;
    $('redoBtn').disabled = redoStack.length === 0;
    $('historyCount').textContent = `${undoStack.length} / ${redoStack.length}`;
  }

  function syncPayload() {
    clearanceSamples = null;
    payload = currentSnapshot();
  }

  function rebuildRenderer() {
    clearanceSamples = null;
    renderer = new MapRenderer(workingData);
    syncPayload();
    updateCounts();
    updateInspector();
    updateSelectionReadout();
    updateProbeStatus();
    render();
  }

  function saveDraftNow() {
    syncPayload();
    const valid=validatePayload(payload);
    if(!valid.ok){setStatus('Enregistrement refusé : '+valid.error,'error');return false;}
    const saved = Object.assign({}, payload, { savedAt: new Date().toISOString() });
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(saved));
      $('restoreBtn').disabled = false;
      $('draftPill').textContent = `Local draft saved · ${new Date().toLocaleTimeString()}`;
      setStatus('Brouillon enregistré. Jouer cette carte pour la lancer.', 'ok');
      return true;
    } catch (error) {
      setStatus(`Could not save local draft: ${error.message}`, 'error');
      return false;
    }
  }

  function scheduleDraftSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveDraftNow, 140);
    $('draftPill').textContent = 'Unsaved working edits · save draft or export JSON';
  }

  function readStoredDraft() {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const parsed = normalizeImported(JSON.parse(raw));
      const valid = validatePayload(parsed);
      return valid.ok ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function applyPayload(next, reason, options = {}) {
    const valid = validatePayload(next);
    if (!valid.ok) {
      setStatus(`Cannot apply edits: ${valid.error}`, 'error');
      return false;
    }
    const before = currentSnapshot();
    if (options.history !== false && !payloadEqual(before, next)) {
      undoStack.push(before);
      redoStack = [];
    }
    payload = deepClone(next);
    workingData = materialize(payload);
    clearanceSamples = null;
    renderer = new MapRenderer(workingData);
    sourceReset = false;
    updateCounts();
    updateHistoryUI();
    updateInspector();
    updateSelectionReadout();
    updateProbeStatus();
    render();
    if (options.save !== false) scheduleDraftSave();
    setStatus(reason || 'Working map rebuilt; Physics reads the edited geometry.', 'ok');
    return true;
  }

  function commitMutation(label, mutation) {
    const before = currentSnapshot();
    const changed = mutation();
    if (changed === false) return false;
    syncPayload();
    if (payloadEqual(before, payload)) return false;
    undoStack.push(before);
    redoStack = [];
    renderer = new MapRenderer(workingData);
    sourceReset = false;
    updateCounts();
    updateHistoryUI();
    updateInspector();
    updateSelectionReadout();
    updateProbeStatus();
    render();
    scheduleDraftSave();
    setStatus(`${label} · collision preview rebuilt from current geometry.`, 'ok');
    return true;
  }

  function undo() {
    if (!undoStack.length) return;
    const current = currentSnapshot();
    const previous = undoStack.pop();
    redoStack.push(current);
    applyPayload(previous, 'Undo applied.', { history: false });
    updateHistoryUI();
    scheduleDraftSave();
  }

  function redo() {
    if (!redoStack.length) return;
    const current = currentSnapshot();
    const next = redoStack.pop();
    undoStack.push(current);
    applyPayload(next, 'Redo applied.', { history: false });
    updateHistoryUI();
    scheduleDraftSave();
  }

  function restoreDraft() {
    const stored = readStoredDraft();
    if (!stored) {
      $('restoreBtn').disabled = true;
      setStatus('No valid local draft is available.', 'error');
      return;
    }
    applyPayload(stored, 'Local draft restored explicitly.', { history: true, save: false });
    $('restoreBtn').disabled = false;
    $('draftPill').textContent = 'Local draft restored · working copy only';
  }

  function clearDraft() {
    window.clearTimeout(saveTimer);
    try { window.localStorage.removeItem(DRAFT_KEY); } catch (error) { /* storage can be disabled */ }
    $('restoreBtn').disabled = true;
    $('draftPill').textContent = 'No local draft';
    setStatus('Local draft cleared. Current working edits are still in memory.', 'ok');
  }

  function playDraft() {
    // The game boot can opt into this same validated localStorage payload with
    // ?mapDraft=1. Save synchronously first so navigation cannot race the
    // debounce timer.
    if (!saveDraftNow()) return;
    window.location.href = 'index.html?mapDraft=1';
  }

  function resetToSource() {
    window.clearTimeout(saveTimer);
    applyPayload(deepClone(basePayload), 'Reset to the authored source snapshot.', { history: true, save: false });
    sourceReset = true;
    try { window.localStorage.removeItem(DRAFT_KEY); } catch (error) { /* storage can be disabled */ }
    $('restoreBtn').disabled = true;
    $('draftPill').textContent = 'Source snapshot restored · no local draft';
    setStatus('Reset to source snapshot. No source file was written.', 'ok');
  }

  function exportJSON() {
    syncPayload();
    const valid=validatePayload(payload);
    if(!valid.ok){setStatus('Export refusé : '+valid.error,'error');return;}
    const output = Object.assign({}, payload, {
      exportedAt: new Date().toISOString(),
      note: 'Carte directement lisible par le jeu. Déposer dans maps/active.json.'
    });
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'active.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus('Carte exportée : déplacer active.json dans le dossier maps, puis ouvrir le jeu.', 'ok');
    $('draftPill').textContent = 'JSON export created · source map files untouched';
  }

  function importJSON(file) {
    if(file.size>8*1024*1024){setStatus('Import refusé : 8 Mo maximum.','error');return;}
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = normalizeImported(JSON.parse(String(reader.result)));
        const valid = validatePayload(parsed);
        if (!valid.ok) throw new Error(valid.error);
        applyPayload(parsed, `Imported ${file.name}; working map rebuilt.`, { history: true, save: true });
      } catch (error) {
        setStatus(`Import rejected: ${error.message}`, 'error');
      }
    };
    reader.onerror = () => setStatus('Import failed while reading the file.', 'error');
    reader.readAsText(file);
  }

  // -------------------------------------------------------------------------
  // Geometry and selection
  // -------------------------------------------------------------------------

  function recordFor(selection) {
    if (!selection) return null;
    if(selection.kind==='player')return workingData.playerSpawn;
    const collection = collectionFor(selection.kind);
    return collection.find(item => item.id === selection.id) || null;
  }

  function collectionFor(kind) {
    if (kind === 'player') return [workingData.playerSpawn];
    if (kind === 'weapon') return workingData.weapons;
    if (kind === 'spawn') return workingData.spawnLocations;
    if (kind === 'wall') return workingData.walls;
    if (kind === 'glass') return workingData.glassPartitions;
    if (kind === 'door') return workingData.doors;
    if (kind === 'prop') return workingData.props;
    if (kind === 'floor') return workingData.floorLayers;
    return [];
  }

  function labelForKind(kind) {
    if(pointKinds.includes(kind))return {player:'Départ joueur',weapon:'Arme au sol',spawn:'Arrivée ennemie'}[kind];
    return kind === 'floor' ? 'Sol' : kind === 'wall' ? 'Wall' : kind === 'glass' ? 'Glass' : kind === 'door' ? 'Door' : 'Furniture';
  }

  function distanceToSegment(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq > 1e-9 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq)) : 0;
    const x = a.x + dx * t;
    const y = a.y + dy * t;
    return { distance: Math.hypot(point.x - x, point.y - y), t, x, y };
  }

  function doorEndpoints(door) {
    const angle = finite(door.baseAngle) ? door.baseAngle : 0;
    return { a: { x: door.x, y: door.y }, b: { x: door.x + Math.cos(angle) * door.length, y: door.y + Math.sin(angle) * door.length } };
  }

  function pointInProp(point, prop, padding = 0) {
    const width = Math.max(0, prop.collisionWidth || prop.width || 0) + padding * 2;
    const height = Math.max(0, prop.collisionHeight || prop.height || 0) + padding * 2;
    const centered = prop.centered || (prop.angle && prop.angle !== 0);
    if (!centered) return point.x >= prop.x - padding && point.x <= prop.x + width - padding && point.y >= prop.y - padding && point.y <= prop.y + height - padding;
    const angle = prop.angle || 0;
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const dx = point.x - prop.x;
    const dy = point.y - prop.y;
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    return Math.abs(lx) <= width * 0.5 && Math.abs(ly) <= height * 0.5;
  }

  function hitTest(point) {
    const threshold = Math.max(9, 11 / view.zoom);
    if(layers.gameplay&&selected&&pointKinds.includes(selected.kind)){const item=recordFor(selected);if(item&&Math.hypot(point.x-item.x,point.y-item.y)<=14/view.zoom)return {...selected};}
    if(layers.gameplay)for(const kind of pointKinds)for(const item of collectionFor(kind)){
      if(Math.hypot(point.x-item.x,point.y-item.y)<=14/view.zoom)return {kind,id:kind==='player'?'player_start':item.id};
    }
    // Props are drawn above structural geometry, so they win overlapping clicks.
    if (layers.props) {
      for (let index = workingData.props.length - 1; index >= 0; index--) {
        const prop = workingData.props[index];
        if (pointInProp(point, prop, threshold)) return { kind: 'prop', id: prop.id };
      }
    }
    if (layers.doors) {
      for (let index = workingData.doors.length - 1; index >= 0; index--) {
        const door = workingData.doors[index];
        const ends = doorEndpoints(door);
        if (distanceToSegment(point, ends.a, ends.b).distance <= threshold) return { kind: 'door', id: door.id };
      }
    }
    if (layers.glass) {
      for (let index = workingData.glassPartitions.length - 1; index >= 0; index--) {
        const glass = workingData.glassPartitions[index];
        if (distanceToSegment(point, { x: glass.x1, y: glass.y1 }, { x: glass.x2, y: glass.y2 }).distance <= threshold) return { kind: 'glass', id: glass.id };
      }
    }
    if (layers.walls) {
      for (let index = workingData.walls.length - 1; index >= 0; index--) {
        const wall = workingData.walls[index];
        if (distanceToSegment(point, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }).distance <= threshold) return { kind: 'wall', id: wall.id };
      }
    }
    return null;
  }

  function endpointHit(point) {
    const radius = Math.max(12, 15 / view.zoom);
    for (const kind of ['wall', 'glass']) {
      const collection = collectionFor(kind);
      for (const item of collection) {
        for (const endpoint of ['a', 'b']) {
          const x = endpoint === 'a' ? item.x1 : item.x2;
          const y = endpoint === 'a' ? item.y1 : item.y2;
          if (Math.hypot(point.x - x, point.y - y) <= radius) return { kind, id: item.id, endpoint };
        }
      }
    }
    return null;
  }

  function setSelected(next) {
    finishInspectorEdit();
    selected = next;
    refreshGameplayList();
    updateInspector();
    updateSelectionReadout();
    render();
  }

  function updateSelectionReadout() {
    const readout = $('selectionReadout');
    const item = recordFor(selected);
    readout.textContent = item ? `${labelForKind(selected.kind)} · ${item.id}` : 'No selection';
  }

  function snapValue(value) {
    if (!$('snapToggle').checked) return value;
    const planGrid = Number($('snapGrid').value) || 1;
    const worldGrid = planGrid * (mapSource.PLAN_SCALE || 1);
    return Math.round(value / worldGrid) * worldGrid;
  }

  function updateDraggedGeometry(state, worldPoint) {
    const item = recordFor(state.selection);
    if (!item) return false;
    const p = { x: snapValue(worldPoint.x), y: snapValue(worldPoint.y) };
    if (state.mode === 'endpointA' || state.mode === 'endpointB') {
      const suffix = state.mode === 'endpointA' ? '1' : '2';
      item[`x${suffix}`] = p.x;
      item[`y${suffix}`] = p.y;
      return true;
    }
    if (state.mode === 'move') {
      if (state.selection.kind === 'prop' || state.selection.kind === 'door' || pointKinds.includes(state.selection.kind)) {
        item.x = p.x - state.offsetX;
        item.y = p.y - state.offsetY;
        return true;
      }
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Inspector
  // -------------------------------------------------------------------------

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function numberField(label, key, value, step = 'any', suffix = '') {
    const safe = finite(value) ? Number(value.toFixed(3)) : 0;
    return `<div class="field"><label for="field-${esc(key)}"><span>${esc(label)}</span><em>${esc(suffix)}</em></label><input id="field-${esc(key)}" data-key="${esc(key)}" type="number" step="${step}" value="${safe}"></div>`;
  }

  function readonlyCoords(label, x, y) {
    const plan = mapSource.worldToPlan(x, y);
    return `<div class="field"><label><span>${esc(label)}</span><em>read only</em></label><div class="readonly-grid"><div><span>World X</span><strong>${formatNumber(x)}</strong></div><div><span>World Y</span><strong>${formatNumber(y)}</strong></div><div><span>Plan X</span><strong>${formatNumber(plan.x)}</strong></div><div><span>Plan Y</span><strong>${formatNumber(plan.y)}</strong></div></div></div>`;
  }

  function updateInspector() {
    refreshFloorList();
    $('deleteBtn').disabled = !recordFor(selected) || selected.kind==='player' || (selected.kind==='spawn'&&workingData.spawnLocations.length<=1);
    $('duplicateBtn').disabled = !recordFor(selected) || selected.kind==='player';
    const item = recordFor(selected);
    if (!item) {
      inspectorEmpty.style.display = '';
      inspectorContent.style.display = 'none';
      inspectorContent.innerHTML = '';
      return;
    }
    inspectorEmpty.style.display = 'none';
    inspectorContent.style.display = 'block';
    const kind = selected.kind;
    let html = `<div class="object-title"><span class="object-kind">${esc(labelForKind(kind))}</span><span class="object-id">${esc(item.id||'player_start')}</span></div>`;
    html += `<div class="field"><label for="field-id"><span>Id</span><em>source key</em></label><input id="field-id" type="text" value="${esc(item.id||'player_start')}" readonly></div>`;
    html += `<div class="field"><label for="field-type"><span>Type</span><em>render / collision</em></label><input id="field-type" type="text" value="${esc(item.type || kind)}" readonly></div>`;

    if(pointKinds.includes(kind)) {
      html+=`<div class="field-row">${numberField('X','x',item.x)}${numberField('Y','y',item.y)}</div>`;
      html+=numberField('Orientation','angleDeg',(item.angle||0)*180/Math.PI,'1','degrés');
      if(kind==='spawn')html+=`<label>Nom de l'arrivée<input data-key="name" type="text" maxlength="80" value="${esc(item.name||'Arrivée')}"></label><p class="inspector-note">Utilisée dès la vague 1 et pour les suivantes. Les ennemis sont répartis aléatoirement entre les arrivées disponibles.</p>`;
      if(kind==='weapon'){
        const def=WeaponSystem.getWeaponType(item.type);
        html+=`<label>Arme<select id="field-weaponType" data-key="type">${weaponDefs.map(w=>`<option value="${w.id}" ${def.id===w.id?'selected':''}>${esc(w.name)}</option>`).join('')}</select></label>`;
        html+=numberField('Munitions (0 = vide)','ammo',item.ammo??(def.isGun?def.maxAmmo:0),'1');
      }
      const blocked=probeCollision(item,18).blocked || !floorContains(item,workingData.buildingFootprint);
      html+=`<p class="inspector-note" style="color:${blocked?'#ff8b9d':'#83ead1'}">${blocked?'⚠ Point dans un obstacle ou hors bâtiment : le jeu le replacera sur un point libre.':'✓ Position libre.'}</p>`;
      if(kind==='player')html+='<p class="inspector-note">Départ unique, déplaçable. La flèche indique la direction initiale du regard.</p>';
    } else if(kind==='floor') {
      $('floorMaterial').value=item.type;
      html+=`<p class="inspector-note">Déplacer les poignées pour étendre ce matériau. Les sols ne déplacent pas les murs. La dernière couche recouvre les précédentes.</p><button id="floorRaise">Au-dessus</button><button id="floorLower">En dessous</button>`;
      item.polygon.forEach((p,i)=>{html+=`<div class="field-row">${numberField('Sommet '+(i+1)+' · X','vertex_'+i+'_x',p.x)}${numberField('Y','vertex_'+i+'_y',p.y)}</div><button data-remove-vertex="${i}" ${item.polygon.length<=3?'disabled':''}>Retirer le sommet ${i+1}</button>`;});
    } else if (kind === 'wall' || kind === 'glass') {
      html += `<div class="field-row">${numberField('Endpoint A · X', 'x1', item.x1, 'any', 'world')}${numberField('Endpoint A · Y', 'y1', item.y1, 'any', 'world')}</div>`;
      html += readonlyCoords('Endpoint A · plan mapping', item.x1, item.y1);
      html += `<div class="field-row">${numberField('Endpoint B · X', 'x2', item.x2, 'any', 'world')}${numberField('Endpoint B · Y', 'y2', item.y2, 'any', 'world')}</div>`;
      html += readonlyCoords('Endpoint B · plan mapping', item.x2, item.y2);
      if (kind === 'wall') html += `<div class="field"><label for="field-typeValue"><span>Wall type</span><em>collision tag</em></label><input id="field-typeValue" data-key="type" type="text" value="${esc(item.type || 'interior')}"></div>`;
      if (kind === 'glass') html += numberField('Thickness', 'thickness', item.thickness || 6, '0.5', 'world');
      html += `<p class="inspector-note">Drag the circular endpoint handles to edit this segment. Coordinates are stored in world units; plan values above use MapData.worldToPlan().</p>`;
    } else if (kind === 'door') {
      html += `<div class="field-row">${numberField('Hinge X', 'x', item.x, 'any', 'world')}${numberField('Hinge Y', 'y', item.y, 'any', 'world')}</div>`;
      html += readonlyCoords('Hinge · plan mapping', item.x, item.y);
      html += numberField('Leaf length', 'length', item.length, '0.5', 'world');
      html += numberField('Closed angle', 'baseAngleDeg', (item.baseAngle || 0) * 180 / Math.PI, '0.1', 'degrees');
      html += `<div class="field"><label for="field-doorType"><span>Door material</span><em>preview</em></label><select id="field-doorType" data-key="type"><option value="wood" ${item.type === 'wood' ? 'selected' : ''}>wood</option><option value="glass" ${item.type === 'glass' ? 'selected' : ''}>glass</option><option value="security" ${item.type === 'security' ? 'selected' : ''}>security</option></select></div>`;
      html += `<p class="inspector-note">The closed leaf is shown for editing. Live door interactions remain available in the working Physics map.</p>`;
    } else if (kind === 'prop') {
      html += `<div class="field-row">${numberField('Center / origin X', 'x', item.x, 'any', 'world')}${numberField('Center / origin Y', 'y', item.y, 'any', 'world')}</div>`;
      html += readonlyCoords('Origin · plan mapping', item.x, item.y);
      html += `<div class="field-row">${numberField('Visual width', 'width', item.width, '0.5', 'world')}${numberField('Visual height', 'height', item.height, '0.5', 'world')}</div>`;
      html += `<div class="field-row">${numberField('Collision width', 'collisionWidth', item.collisionWidth ?? item.width, '0.5', 'world')}${numberField('Collision height', 'collisionHeight', item.collisionHeight ?? item.height, '0.5', 'world')}</div>`;
      html += numberField('Rotation', 'angleDeg', (item.angle || 0) * 180 / Math.PI, '0.1', 'degrees');
      html += `<label class="check-row"><span>Solid to characters</span><input data-key="solid" type="checkbox" ${item.solid ? 'checked' : ''}></label>`;
      html += `<p class="inspector-note">Furniture drag uses the object's authored origin. The collision preview uses the same solid, dimensions, and rotation values as Physics.resolveEntityWorldCollisions().</p>`;
    }
    inspectorContent.innerHTML = html;
    bindInspectorFields();
    if(kind==='floor') {
      const order=delta=>commitMutation('Ordre des sols modifié',()=>{const a=workingData.floorLayers,i=a.indexOf(item),j=Math.max(0,Math.min(a.length-1,i+delta));if(i===j)return false;a.splice(i,1);a.splice(j,0,item);});
      $('floorRaise').onclick=()=>order(1);$('floorLower').onclick=()=>order(-1);
      inspectorContent.querySelectorAll('[data-remove-vertex]').forEach(button=>button.onclick=()=>{
        const next=item.polygon.filter((_,i)=>i!==Number(button.dataset.removeVertex));const error=MapIO.polygonError(next);
        if(error){setStatus(error,'error');return;}commitMutation('Sommet retiré',()=>{item.polygon=next;});
      });
    }
  }

  function formatNumber(value) {
    return finite(value) ? Number(value).toFixed(2).replace(/\.00$/, '') : '—';
  }

  function bindInspectorFields() {
    inspectorContent.querySelectorAll('[data-key]').forEach(input => {
      input.addEventListener('input', () => previewInspectorField(input));
      input.addEventListener('change', () => {
        previewInspectorField(input);
        finishInspectorEdit();
      });
      input.addEventListener('blur', finishInspectorEdit);
    });
  }

  function inspectorValue(input) {
    if (input.type === 'checkbox') return input.checked;
    if (['type','name'].includes(input.dataset.key)) return input.value;
    return Number(input.value);
  }

  function setInspectorValue(item, key, value) {
    if(key.startsWith('vertex_')) {const [,i,axis]=key.split('_');item.polygon[Number(i)][axis]=value;} else if (key === 'baseAngleDeg') {
      item.baseAngle = value * Math.PI / 180;
      item.angle = item.baseAngle;
    } else if (key === 'angleDeg') {
      item.angle = value * Math.PI / 180;
    } else {
      if(selected?.kind==='weapon'&&key==='type'){const def=WeaponSystem.getWeaponType(value);item.ammo=def.isGun?def.maxAmmo:0;}
      if(key==='width' && item.collisionWidth===item.width) item.collisionWidth=value;
      if(key==='height' && item.collisionHeight===item.height) item.collisionHeight=value;
      item[key] = value;
    }
  }

  function previewInspectorField(input) {
    const value = inspectorValue(input);
    const key = input.dataset.key;
    if (input.type !== 'checkbox' && !['type','name'].includes(key) && !finite(value)) {
      setStatus('Inspector value must be a finite number.', 'error');
      return false;
    }
    if (!selected) return false;
    if (!inspectorEditSession) {
      inspectorEditSession = { before: currentSnapshot(), selection: Object.assign({}, selected) };
    }
    const item = recordFor(inspectorEditSession.selection);
    if (!item) return false;
    setInspectorValue(item, key, value);
    syncPayload();
    renderer = new MapRenderer(workingData);
    updateCounts();
    updateSelectionReadout();
    updateProbeStatus();
    render();
    setStatus(`Editing ${labelForKind(inspectorEditSession.selection.kind)} ${inspectorEditSession.selection.id} · preview only until field commit.`, 'ok');
    return true;
  }

  function finishInspectorEdit() {
    if (!inspectorEditSession) return;
    const session = inspectorEditSession;
    inspectorEditSession = null;
    const after = currentSnapshot();
    const valid=validatePayload(after);
    if(!valid.ok){applyPayload(session.before,'Modification refusée : '+valid.error,{history:false,save:false});return;}
    if (!payloadEqual(session.before, after)) {
      undoStack.push(session.before);
      redoStack = [];
      payload = after;
      updateHistoryUI();
      scheduleDraftSave();
      setStatus(`Updated ${labelForKind(session.selection.kind)} ${session.selection.id} · collision preview rebuilt.`, 'ok');
    }
    updateInspector();
    updateProbeStatus();
    render();
  }

  function updateCounts() {
    refreshGameplayList();
    $('wallCount').textContent = workingData.walls.length;
    $('glassCount').textContent = workingData.glassPartitions.length;
    $('doorCount').textContent = workingData.doors.length;
    $('propCount').textContent = workingData.props.length;
  }

  // -------------------------------------------------------------------------
  // Canvas rendering and live collision probe
  // -------------------------------------------------------------------------

  function resizeCanvas() {
    const rect = canvasWrap.getBoundingClientRect();
    viewportWidth = Math.max(1, rect.width);
    viewportHeight = Math.max(1, rect.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(viewportWidth * dpr));
    canvas.height = Math.max(1, Math.round(viewportHeight * dpr));
    fitView(false);
    render();
  }

  function fitView(redraw = true) {
    const pad = 34;
    view.zoom = Math.max(0.05, Math.min(2.5, Math.min((viewportWidth - pad * 2) / mapSource.MAP_WIDTH, (viewportHeight - pad * 2) / mapSource.MAP_HEIGHT)));
    view.x = mapSource.MAP_WIDTH * 0.5;
    view.y = mapSource.MAP_HEIGHT * 0.5;
    if (redraw) render();
  }

  function worldToScreen(point) {
    return { x: (point.x - view.x) * view.zoom + viewportWidth * 0.5, y: (point.y - view.y) * view.zoom + viewportHeight * 0.5 };
  }

  function screenToWorld(point) {
    return { x: view.x + (point.x - viewportWidth * 0.5) / view.zoom, y: view.y + (point.y - viewportHeight * 0.5) / view.zoom };
  }

  function worldBounds() {
    return {
      left: view.x - viewportWidth * 0.5 / view.zoom,
      right: view.x + viewportWidth * 0.5 / view.zoom,
      top: view.y - viewportHeight * 0.5 / view.zoom,
      bottom: view.y + viewportHeight * 0.5 / view.zoom
    };
  }

  function drawPlanOverlay() {
    if (!layers.plan || !imageReady) return;
    const ref = mapSource.planReference;
    const origin = mapSource.planToWorld(0, 0);
    const scale = mapSource.PLAN_SCALE || (mapSource.planReference && mapSource.planReference.worldScale) || 1;
    ctx.save();
    ctx.globalAlpha = 0.36;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(planImage, origin.x, origin.y, ref.sourceSize.width * scale, ref.sourceSize.height * scale);
    ctx.restore();
  }

  function drawGrid() {
    if (view.zoom < 0.11) return;
    const bounds = worldBounds();
    const grid = view.zoom > 0.34 ? 100 : 250;
    const startX = Math.floor(bounds.left / grid) * grid;
    const startY = Math.floor(bounds.top / grid) * grid;
    ctx.save();
    ctx.strokeStyle = 'rgba(91, 116, 170, .13)';
    ctx.lineWidth = 1 / view.zoom;
    ctx.beginPath();
    for (let x = startX; x <= bounds.right; x += grid) { ctx.moveTo(x, bounds.top); ctx.lineTo(x, bounds.bottom); }
    for (let y = startY; y <= bounds.bottom; y += grid) { ctx.moveTo(bounds.left, y); ctx.lineTo(bounds.right, y); }
    ctx.stroke();
    ctx.restore();
  }

  function drawLine(a, b, color, width, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width / view.zoom;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
  }

  function refreshGameplayList() {
    const list=$('gameplayList');list.replaceChildren(new Option('Choisir un départ / une arme…',''));
    for(const kind of pointKinds)for(const item of collectionFor(kind)){
      const id=kind==='player'?'player_start':item.id;
      const name=kind==='weapon'?WeaponSystem.getWeaponType(item.type).name:item.name||id;
      list.add(new Option(kind==='player'?'Départ du joueur':labelForKind(kind)+' · '+name,kind+':'+id));
    }
    list.value=selected&&pointKinds.includes(selected.kind)?selected.kind+':'+selected.id:'';
  }
  function drawGameplay() {
    if(!layers.gameplay)return;
    for(const kind of pointKinds)for(const item of collectionFor(kind)){
      ctx.save();ctx.translate(item.x,item.y);ctx.scale(1/view.zoom,1/view.zoom);
      ctx.fillStyle={player:'#62ebd9',spawn:'#ff83b9',weapon:'#ffe18a'}[kind];ctx.strokeStyle='#101423';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(0,0,11,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle='#101423';ctx.font='bold 11px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText({player:'J',spawn:'E',weapon:'A'}[kind],0,0);
      if(kind!=='weapon'){ctx.rotate(item.angle||0);ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(14,-4);ctx.lineTo(22,0);ctx.lineTo(14,4);ctx.fill();}
      ctx.restore();
    }
  }

  function drawGeometry() {
    if (layers.walls) {
      for (const wall of workingData.walls) {
        const color = wall.type === 'exterior' ? '#ff4aab' : wall.type === 'core' ? '#ff9e5e' : '#e85bdb';
        drawLine({ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }, color, wall.type === 'exterior' ? 4 : 3, .87);
      }
    }
    if (layers.glass) {
      for (const glass of workingData.glassPartitions) {
        drawLine({ x: glass.x1, y: glass.y1 }, { x: glass.x2, y: glass.y2 }, glass.shattered ? '#68768d' : '#47e8ff', 3, glass.shattered ? .35 : .78);
      }
    }
    if (layers.doors) {
      for (const door of workingData.doors) {
        const ends = doorEndpoints(door);
        drawLine(ends.a, ends.b, door.type === 'glass' ? '#b0f7ff' : '#ffe26c', 5, .9);
        ctx.save();
        ctx.fillStyle = door.type === 'glass' ? '#9cf5ff' : '#ffe26c';
        ctx.beginPath(); ctx.arc(door.x, door.y, 4 / view.zoom, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    if (layers.props) drawPropOutlines();
    if (layers.labels) drawLabels();
  }

  function drawPropOutlines() {
    for (const prop of workingData.props) {
      const width = prop.collisionWidth || prop.width || 0;
      const height = prop.collisionHeight || prop.height || 0;
      if (!width || !height) continue;
      ctx.save();
      ctx.translate(prop.x, prop.y);
      ctx.rotate(prop.angle || 0);
      ctx.strokeStyle = prop.solid ? 'rgba(221, 173, 117, .62)' : 'rgba(165, 164, 180, .38)';
      ctx.lineWidth = 1.5 / view.zoom;
      ctx.setLineDash([6 / view.zoom, 5 / view.zoom]);
      if (prop.centered || (prop.angle && prop.angle !== 0)) ctx.strokeRect(-width * .5, -height * .5, width, height);
      else ctx.strokeRect(0, 0, width, height);
      ctx.restore();
    }
  }

  function drawLabels() {
    ctx.save();
    ctx.font = `${Math.max(10, 12 / view.zoom)}px ui-monospace, monospace`;
    ctx.textBaseline = 'middle';
    for (const [kind, collection, color] of [['wall', workingData.walls, '#ff8dcc'], ['glass', workingData.glassPartitions, '#8af3ff'], ['door', workingData.doors, '#ffe77c'], ['prop', workingData.props, '#e4c18f']]) {
      ctx.fillStyle = color;
      for (const item of collection) {
        let point;
        if (kind === 'wall' || kind === 'glass') point = { x: (item.x1 + item.x2) * .5, y: (item.y1 + item.y2) * .5 };
        else point = { x: item.x, y: item.y };
        ctx.fillText(item.id, point.x + 5 / view.zoom, point.y - 5 / view.zoom);
      }
    }
    ctx.restore();
  }

  function drawSelection() {
    const item = recordFor(selected);
    if (!item) return;
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ff3e9e';
    ctx.shadowBlur = 12 / view.zoom;
    ctx.lineWidth = 2.2 / view.zoom;
    if (selected.kind === 'wall' || selected.kind === 'glass') {
      ctx.beginPath(); ctx.moveTo(item.x1, item.y1); ctx.lineTo(item.x2, item.y2); ctx.stroke();
      for (const point of [{ x: item.x1, y: item.y1 }, { x: item.x2, y: item.y2 }]) {
        ctx.beginPath(); ctx.arc(point.x, point.y, 6 / view.zoom, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff3e9e'; ctx.beginPath(); ctx.arc(point.x, point.y, 3 / view.zoom, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff';
      }
    } else if (pointKinds.includes(selected.kind)) {
      ctx.beginPath();ctx.arc(item.x,item.y,18/view.zoom,0,Math.PI*2);ctx.stroke();
    } else if (selected.kind === 'door') {
      const ends = doorEndpoints(item);
      ctx.beginPath(); ctx.moveTo(ends.a.x, ends.a.y); ctx.lineTo(ends.b.x, ends.b.y); ctx.stroke();
      ctx.beginPath(); ctx.arc(ends.a.x, ends.a.y, 7 / view.zoom, 0, Math.PI * 2); ctx.stroke();
    } else if (selected.kind === 'prop') {
      const width = item.collisionWidth || item.width || 0;
      const height = item.collisionHeight || item.height || 0;
      ctx.translate(item.x, item.y); ctx.rotate(item.angle || 0);
      if (item.centered || (item.angle && item.angle !== 0)) ctx.strokeRect(-width * .5, -height * .5, width, height);
      else ctx.strokeRect(0, 0, width, height);
    }
    ctx.restore();
  }

  function probeCollision(point, radius = PROBE_RADIUS) {
    if (!point) return { blocked: false };
    // Direct primitive checks give the obstacle label without mutating doors.
    for (const wall of workingData.walls) {
      if (Physics.circleVsSegment(point.x, point.y, radius, wall.x1, wall.y1, wall.x2, wall.y2).collided) return { blocked: true, kind: 'wall', item: wall };
    }
    for (const glass of workingData.glassPartitions) {
      if (glass.shattered) continue;
      if (Physics.circleVsSegment(point.x, point.y, radius, glass.x1, glass.y1, glass.x2, glass.y2).collided) return { blocked: true, kind: 'glass', item: glass };
    }
    for (const door of workingData.doors) {
      if (door.shattered) continue;
      const ends = doorEndpoints(door);
      if (Physics.circleVsSegment(point.x, point.y, radius, ends.a.x, ends.a.y, ends.b.x, ends.b.y).collided) return { blocked: true, kind: 'door', item: door };
    }
    for (const prop of workingData.props) {
      if (!prop.solid) continue;
      const width = prop.collisionWidth || prop.width;
      const height = prop.collisionHeight || prop.height;
      const collisionProp = Object.assign({}, prop, { width, height });
      const collision = prop.centered || (prop.angle && prop.angle !== 0)
        ? Physics.circleVsOBB(point.x, point.y, radius, collisionProp)
        : Physics.circleVsAABB(point.x, point.y, radius, prop.x, prop.y, width, height);
      if (collision && collision.collided) return { blocked: true, kind: 'prop', item: prop };
    }
    return { blocked: false };
  }

  function updateProbeStatus() {
    if (!probeMode || !probePoint) {
      statusCollision.textContent = Collision ? 'Collision preview live' : 'Physics preview live';
      statusCollision.style.color = 'var(--green)';
      return;
    }
    const result = probeCollision(probePoint);
    if (result.blocked) {
      statusCollision.textContent = `BLOCKED · ${result.kind} ${result.item.id}`;
      statusCollision.style.color = 'var(--red)';
    } else {
      statusCollision.textContent = 'FREE · radius 14';
      statusCollision.style.color = 'var(--green)';
    }
  }

  function drawProbe() {
    if (!probeMode || !probePoint) return;
    const result = probeCollision(probePoint);
    const color = result.blocked ? '#ff6578' : '#56f59a';
    ctx.save();
    ctx.fillStyle = result.blocked ? 'rgba(255, 101, 120, .16)' : 'rgba(86, 245, 154, .14)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / view.zoom;
    ctx.beginPath(); ctx.arc(probePoint.x, probePoint.y, PROBE_RADIUS, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(probePoint.x - 5 / view.zoom, probePoint.y); ctx.lineTo(probePoint.x + 5 / view.zoom, probePoint.y); ctx.moveTo(probePoint.x, probePoint.y - 5 / view.zoom); ctx.lineTo(probePoint.x, probePoint.y + 5 / view.zoom); ctx.stroke();
    ctx.restore();
  }

  function drawClearance() {
    if (!clearanceMode) return;
    if (!clearanceSamples) {
      clearanceSamples = [];
      const polygon = workingData.buildingFootprint;
      for (let y = 0; y < workingData.MAP_HEIGHT; y += 24) {
        for (let x = 0; x < workingData.MAP_WIDTH; x += 24) {
          let inside = false;
          for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
            const a=polygon[i],b=polygon[j];
            if (((a.y>y)!==(b.y>y)) && x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x) inside=!inside;
          }
          if (inside) clearanceSamples.push({x,y,blocked:probeCollision({x,y}).blocked});
        }
      }
    }
    ctx.save();
    for (const p of clearanceSamples) {
      ctx.fillStyle = p.blocked ? 'rgba(255,65,104,.8)' : 'rgba(95,255,162,.45)';
      ctx.fillRect(p.x-4,p.y-4,8,8);
    }
    ctx.restore();
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewportWidth, viewportHeight);
    ctx.fillStyle = '#060810';
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);
    ctx.save();
    ctx.translate(viewportWidth * .5, viewportHeight * .5);
    ctx.scale(view.zoom, view.zoom);
    ctx.translate(-view.x, -view.y);
    drawGrid();
    if (layers.art) renderer.render(ctx, worldBounds());
    drawPlanOverlay();
    drawGeometry();
    drawClearance();
    drawSelection();
    drawFloorTools();
    if(placing && placementStart && placementPointer) drawLine(placementStart,placementPointer,'#ffffff',4);
    drawGameplay();
    drawProbe();
    ctx.restore();
    $('zoomReadout').textContent = `${Math.round(view.zoom * 100)}%`;
    updateProbeStatus();
  }

  // -------------------------------------------------------------------------
  // Pointer / keyboard controls
  // -------------------------------------------------------------------------

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function startPointer(event) {
    canvas.focus({preventScroll:true});
    const screen = canvasPoint(event);
    const world = screenToWorld(screen);
    if (placing && event.button === 0 && !spaceDown && event.type === 'pointerdown') { placeAt(world);event.preventDefault();return; }
    if (probeMode) {
      probePoint = world;
      updateProbeStatus();
      render();
    }
    const shouldPan = event.button === 1 || spaceDown || event.button === 2;
    if (shouldPan) {
      pointerState = { mode: 'pan', startScreen: screen, startX: view.x, startY: view.y };
      canvas.classList.add('dragging');
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    if(floorClick(world,event)){event.preventDefault();return;}
    const pointHit=hitTest(world);
    const endpoint = pointHit&&pointKinds.includes(pointHit.kind)?null:endpointHit(world);
    const hit = endpoint || pointHit;
    if (!hit) {
      setSelected(null);
      return;
    }
    const nextSelection = { kind: hit.kind, id: hit.id };
    setSelected(nextSelection);
    const item = recordFor(nextSelection);
    const mode = endpoint ? endpoint.endpoint === 'a' ? 'endpointA' : 'endpointB' : (nextSelection.kind === 'prop' || nextSelection.kind === 'door' || pointKinds.includes(nextSelection.kind) ? 'move' : 'select');
    if (mode === 'select') return;
    pointerState = {
      mode,
      selection: nextSelection,
      startSnapshot: currentSnapshot(),
      offsetX: mode === 'move' ? world.x - item.x : 0,
      offsetY: mode === 'move' ? world.y - item.y : 0
    };
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function movePointer(event) {
    const screen = canvasPoint(event);
    const world = screenToWorld(screen);
    if(floorTool){floorPointer={x:snapValue(world.x),y:snapValue(world.y)};render();}
    if(placing){placementPointer={x:snapValue(world.x),y:snapValue(world.y)};render();}
    if (probeMode) probePoint = world;
    if (!pointerState) {
      if (probeMode) { updateProbeStatus(); render(); }
      return;
    }
    if(pointerState.mode==='floorVertex'||pointerState.mode==='floorMove'){
      const state=pointerState,item=recordFor(state.selection);
      if(state.mode==='floorVertex')item.polygon[state.vertex]={x:snapValue(world.x),y:snapValue(world.y)};
      else {const dx=snapValue(world.x)-snapValue(state.startWorld.x),dy=snapValue(world.y)-snapValue(state.startWorld.y);item.polygon=state.original.map(p=>({x:p.x+dx,y:p.y+dy}));}
      render();return;
    }
    if (pointerState.mode === 'pan') {
      view.x = pointerState.startX - (screen.x - pointerState.startScreen.x) / view.zoom;
      view.y = pointerState.startY - (screen.y - pointerState.startScreen.y) / view.zoom;
      render();
      return;
    }
    if (pointerState.mode === 'endpointA' || pointerState.mode === 'endpointB' || pointerState.mode === 'move') {
      if (updateDraggedGeometry(pointerState, world)) {
        syncPayload();
        updateInspector();
        updateSelectionReadout();
        updateProbeStatus();
        render();
      }
    }
  }

  function endPointer(event) {
    if (!pointerState) return;
    const state = pointerState;
    pointerState = null;
    canvas.classList.remove('dragging');
    if (state.mode === 'pan') return;
    const valid=validatePayload(currentSnapshot());
    if(!valid.ok){applyPayload(state.startSnapshot,'Modification annulée : '+valid.error,{history:false,save:false});return;}
    const after = currentSnapshot();
    if (!payloadEqual(state.startSnapshot, after)) {
      undoStack.push(state.startSnapshot);
      redoStack = [];
      payload = after;
      updateHistoryUI();
      scheduleDraftSave();
      setStatus(`Moved ${labelForKind(state.selection.kind)} ${state.selection.id} · collision preview live.`, 'ok');
    }
    updateInspector();
    updateProbeStatus();
    render();
    if (event && event.pointerId !== undefined) {
      try { canvas.releasePointerCapture(event.pointerId); } catch (error) { /* capture may already be released */ }
    }
  }

  function zoomAt(factor, screenPoint) {
    const focus = screenPoint || { x: viewportWidth * .5, y: viewportHeight * .5 };
    const before = screenToWorld(focus);
    view.zoom = Math.max(0.05, Math.min(3.2, view.zoom * factor));
    const after = screenToWorld(focus);
    view.x += before.x - after.x;
    view.y += before.y - after.y;
    render();
  }

  function bindUI() {
    for(const [id,name] of Object.entries(MapIO.materials)) $('floorMaterial').add(new Option(name,id));
    $('drawFloorBtn').onclick=()=>beginFloor('polygon');$('rectFloorBtn').onclick=()=>beginFloor('rectangle');$('finishFloorBtn').onclick=finishFloor;
    $('editFloors').onchange=()=>{cancelPlacement();setSelected(null);render();};
    $('floorList').onchange=()=>{cancelPlacement();$('editFloors').checked=true;setSelected($('floorList').value?{kind:'floor',id:$('floorList').value}:null);};
    $('floorMaterial').onchange=()=>{const item=selected?.kind==='floor'?recordFor(selected):null;if(item)commitMutation('Matériau modifié',()=>{item.type=$('floorMaterial').value;});};
    canvas.addEventListener('dblclick',event=>{
      if(floorTool||!$('editFloors').checked||selected?.kind!=='floor')return;
      const item=recordFor(selected),world=screenToWorld(canvasPoint(event));let nearest=null;
      item.polygon.forEach((p,i)=>{const hit=distanceToSegment(world,p,item.polygon[(i+1)%item.polygon.length]);if(hit.t>.02&&hit.t<.98&&(!nearest||hit.distance<nearest.distance))nearest={...hit,i};});
      if(nearest&&nearest.distance<12/view.zoom)commitMutation('Sommet ajouté',()=>{item.polygon.splice(nearest.i+1,0,{x:nearest.x,y:nearest.y});});
    });
    for(const [value,label] of palette){const option=document.createElement('option');option.value=value;option.textContent=label;$('addType').appendChild(option);}
    $('addBtn').onclick=()=>{if(placing){cancelPlacement();return;}cancelPlacement();$('editFloors').checked=false;placing=true;probeMode=false;placementStart=null;canvas.style.cursor='crosshair';$('probeBtn').textContent='Probe mode: off';$('addBtn').textContent='Annuler le placement';setStatus('Cliquer sur la carte pour placer '+$('addType').selectedOptions[0].textContent);};
    $('addType').onchange=()=>{placementStart=null;placementHost=null;render();};
    $('layerGameplay').onchange=()=>{layers.gameplay=$('layerGameplay').checked;render();};
    $('gameplayList').onchange=()=>{const [kind,id]=$('gameplayList').value.split(':');if(!kind)return;cancelPlacement();$('editFloors').checked=false;layers.gameplay=true;$('layerGameplay').checked=true;setSelected({kind,id});};
    $('focusGameplay').onclick=()=>{const item=recordFor(selected);if(item&&pointKinds.includes(selected.kind)){view.x=item.x;view.y=item.y;view.zoom=Math.max(view.zoom,.8);render();}};
    $('deleteBtn').onclick=deleteSelected;
    $('duplicateBtn').onclick=duplicateSelected;
    window.addEventListener('resize', resizeCanvas);
    canvas.addEventListener('pointerdown', startPointer);
    canvas.addEventListener('pointermove', movePointer);
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      const point = canvasPoint(event);
      zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, point);
    }, { passive: false });

    $('fitBtn').addEventListener('click', () => fitView());
    $('zoomInBtn').addEventListener('click', () => zoomAt(1.25));
    $('zoomOutBtn').addEventListener('click', () => zoomAt(1 / 1.25));
    $('undoBtn').addEventListener('click', undo);
    $('redoBtn').addEventListener('click', redo);
    $('resetBtn').addEventListener('click', resetToSource);
    $('saveBtn').addEventListener('click', saveDraftNow);
    $('restoreBtn').addEventListener('click', restoreDraft);
    $('playDraftBtn').addEventListener('click', playDraft);
    $('clearDraftBtn').addEventListener('click', clearDraft);
    $('exportBtn').addEventListener('click', exportJSON);
    $('importBtn').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', event => {
      const file = event.target.files && event.target.files[0];
      if (file) importJSON(file);
      event.target.value = '';
    });
    $('probeBtn').addEventListener('click', () => {
      probeMode = !probeMode;
      $('probeBtn').textContent = `Probe mode: ${probeMode ? 'on' : 'off'}`;
      $('probeBtn').style.borderColor = probeMode ? 'var(--green)' : '';
      if (!probeMode) probePoint = null;
      setStatus(probeMode ? 'Probe mode active · move the pointer over the edited map.' : 'Probe mode off.', 'ok');
      updateProbeStatus();
      render();
    });
    $('clearanceBtn').addEventListener('click', () => {
      clearanceMode = !clearanceMode;
      $('clearanceBtn').textContent = `Player clearance: ${clearanceMode ? 'on' : 'off'}`;
      render();
    });

    const layerMap = { layerArt: 'art', layerPlan: 'plan', layerWalls: 'walls', layerGlass: 'glass', layerDoors: 'doors', layerProps: 'props', layerLabels: 'labels' };
    for (const [id, key] of Object.entries(layerMap)) {
      $(id).addEventListener('change', event => {
        layers[key] = event.target.checked;
        render();
      });
    }

    window.addEventListener('keydown', event => {
      if(floorTool && !/input|select|textarea/i.test(event.target.tagName) && (event.key==='Backspace'||event.key==='Delete'||((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'))) {
        event.preventDefault();floorPoints.pop();$('finishFloorBtn').disabled=floorPoints.length<3;render();return;
      }
      if (event.code === 'Space' && !/input|select|textarea/i.test(event.target.tagName)) { spaceDown = true; event.preventDefault(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
      if (event.key.toLowerCase() === 'f' && !/input|select|textarea/i.test(event.target.tagName)) { fitView(); }
      if (event.key === 'Escape') { if(pointerState?.startSnapshot){const previous=pointerState.startSnapshot;pointerState=null;applyPayload(previous,'Déplacement annulé',{history:false,save:false});}cancelPlacement();setSelected(null); }
      if(event.key==='Enter' && !/input|select|textarea|button/i.test(event.target.tagName)){event.preventDefault();finishFloor();}
      if ((event.key === 'Delete' || event.key === 'Backspace') && !/input|select|textarea/i.test(event.target.tagName)) {event.preventDefault();deleteSelected();}
    });
    window.addEventListener('keyup', event => { if (event.code === 'Space') spaceDown = false; });
  }

  function loadPlanImage() {
    planImage = new Image();
    planImage.onload = () => { imageReady = true; render(); };
    planImage.onerror = () => { imageReady = false; setStatus('Source plan overlay could not load; map geometry remains available.', 'error'); };
    planImage.src = 'plan_materials.png';
  }

  function initialize() {
    let stored = readStoredDraft();
    if(new URLSearchParams(location.search).get('importActive')==='1') {
      try {const candidate=normalizeImported(JSON.parse(localStorage.getItem('hotline-viseo-active-map-v2')));if(validatePayload(candidate).ok)stored=candidate;} catch(e){setStatus(e.message,'error');}
    }
    if (stored) {
      payload = deepClone(stored);
      workingData = materialize(payload);
      renderer = new MapRenderer(workingData);
      $('restoreBtn').disabled = false;
      $('draftPill').textContent = 'Local draft restored on load · working copy only';
      setStatus('Restored a validated local draft. Source map files remain untouched.', 'ok');
    } else {
      $('restoreBtn').disabled = true;
      setStatus('Loaded a cloned source map. Select geometry or enable the plan overlay.', 'ok');
    }
    updateCounts();
    updateHistoryUI();
    updateInspector();
    updateSelectionReadout();
    bindUI();
    loadPlanImage();
    resizeCanvas();
  }

  window.MapEditor = {
    getWorkingData: () => workingData,
    exportEdits: exportJSON,
    resetToSource
  };
  initialize();
})();
