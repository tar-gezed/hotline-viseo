/* Resolve a map before gameplay creates physics, navigation or wave spawners. */
(function () {
  'use strict';
  const ACTIVE_KEY = 'hotline-viseo-active-map-v2';
  const DRAFT_KEY = 'hotline-viseo-map-editor-draft-v1';
  const base = window.MapData;
  function decode(text) {
    if (text.length > 8 * 1024 * 1024) throw Error('Carte trop volumineuse (8 Mo maximum).');
    const value = JSON.parse(text);
    const valid = MapIO.validate(value);
    if (!valid.ok) throw Error(valid.error);
    return value.payload || value;
  }
  async function resolve() {
    const params = new URLSearchParams(location.search);
    if (params.get('map') === 'source') return { map: base, label: 'Carte originale' };
    if (params.get('mapDraft') === '1') {
      const text = localStorage.getItem(DRAFT_KEY);
      if (!text) throw Error('Aucun brouillon enregistré. Importer le JSON dans l’éditeur puis choisir Jouer cette carte.');
      return { map: MapIO.materialize(decode(text), base, Doors), label: 'Brouillon de l’éditeur' };
    }
    // An explicit file in the project wins over a browser-only import.
    if (params.get('map') !== 'imported') {
      if (location.protocol === 'file:') {
        const error = Error('Le navigateur ne peut pas lire automatiquement maps/active.json quand index.html est ouvert directement. Lance le serveur local puis ouvre le jeu en HTTP.');
        error.code = 'LOCAL_FILE';
        throw error;
      }
      const response = await fetch('maps/active.json', { cache: 'no-store' });
      if (response.ok) return { map: MapIO.materialize(decode(await response.text()), base, Doors), label: 'maps/active.json' };
      if (response.status !== 404) throw Error('Impossible de lire maps/active.json : HTTP ' + response.status);
    }
    const text = localStorage.getItem(ACTIVE_KEY);
    if (text) return { map: MapIO.materialize(decode(text), base, Doors), label: 'Carte importée dans ce navigateur' };
    if (params.get('map') === 'imported') throw Error('Aucune carte importée dans ce navigateur.');
    return { map: base, label: 'Carte originale' };
  }
  function prepareNavigation(map) {
    if (map === base) return;
    const inside = (x,y) => {
      let yes=false;const poly=map.buildingFootprint;
      for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
        const a=poly[i],b=poly[j];
        if(((a.y>y)!==(b.y>y)) && x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x) yes=!yes;
      }
      return yes;
    };
    const clear = (x,y) => {
      if(!inside(x,y)) return false;
      const p={x,y,radius:18,vx:0,vy:0};
      Physics.resolveEntityWorldCollisions(p,map,1/60);
      return Math.hypot(p.x-x,p.y-y)<0.1;
    };
    const nodes=(map.navGraphDefinition?.nodes||[]).filter(p=>clear(p.x,p.y));
    for(let y=56;y<map.MAP_HEIGHT;y+=112) for(let x=56;x<map.MAP_WIDTH;x+=112) {
      if(clear(x,y)) nodes.push({id:'custom_'+x+'_'+y,x,y,zone:'custom'});
    }
    if(!nodes.length) throw Error('La carte ne contient aucun passage libre.');
    const ids=new Set(nodes.map(n=>n.id));
    const patrolRoutes={};
    for(const [id,route] of Object.entries(map.navGraphDefinition?.patrolRoutes||{})) patrolRoutes[id]=route.filter(n=>ids.has(n));
    map.navGraphDefinition={nodes,patrolRoutes,autoConnectDistance:240};
    // Moving furniture over a starting position must not embed an actor.
    const placements=[map.playerSpawn,...(map.spawnLocations||[]),...(map.enemies||[]),...(map.weapons||[]),...(map.crateLocations||[])];
    for(const p of placements) {
      if(clear(p.x,p.y)) continue;
      const nearest=nodes.reduce((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)<Math.hypot(b.x-p.x,b.y-p.y)?a:b);
      p.x=nearest.x;p.y=nearest.y;
    }
  }
  window.MapLoader = {
    decode, ACTIVE_KEY, DRAFT_KEY,
    async load() {
      const result=await resolve();prepareNavigation(result.map);
      window.MapData=result.map;
      window.activeMapLabel=result.label;
      const label=document.getElementById('activeMapLabel');if(label) label.textContent=result.label;
      return result.map;
    },
    reportError(error) {
      const label=document.getElementById('activeMapLabel');if(label) label.textContent='Carte non chargée';
      const box=document.createElement('div');box.id='mapLoadError';
      box.style.cssText='position:fixed;inset:20%;z-index:100;background:#211827;color:#fff;padding:32px;font:18px monospace;overflow:auto';
      const title=document.createElement('h2');title.textContent='Carte non chargée';
      const message=document.createElement('p');message.textContent=error.message;
      const link=document.createElement('a');link.href='maps.html';link.textContent='Choisir ou importer une carte';link.style.color='#63efe0';
      box.append(title,message);
      if(error.code === 'LOCAL_FILE') {
        title.textContent='Lancer le jeu avec le serveur local';
        const help=document.createElement('p');help.textContent='Double-clique sur Lancer-le-jeu.cmd dans le dossier du jeu, ou exécute npm start dans ce dossier (Node.js requis, aucune installation de dépendances).';
        const open=document.createElement('a');open.href='http://localhost:8080/';open.textContent='Ouvrir le jeu sur localhost:8080';open.style.color='#63efe0';
        const note=document.createElement('p');note.textContent='Ton fichier maps/active.json reste intact. Les brouillons du navigateur dépendent de l’adresse utilisée : réimporte ton JSON dans l’éditeur HTTP si nécessaire. Sur GitHub Pages, la carte se charge directement, sans Node.';
        box.append(help,open,note);
      }
      box.append(link);document.body.append(box);
    }
  };
})();
