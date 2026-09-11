/**
 * map_renderer.js - Canvas Map & Environment Renderer for Hotline Miami: VISEO Arcade Edition
 * Renders textured floors (Wood Parquet, Grey Woven Carpet, Dark Executive Carpet, Tiles),
 * VISEO reception logo and cable car mural, detailed furniture/desks/monitors, retro wall caps with drop shadows,
 * glass partitions, doors, decals (blood pools, bullet holes, glass shards), and lighting/shadow ambiance.
 */

(function (root, factory) {
  const PhysicsObj = (typeof window !== 'undefined' && window.Physics) ? window.Physics : (root.Physics || null);
  const result = factory(PhysicsObj);
  if (typeof define === 'function' && define.amd) {
    define(['../engine/physics'], () => result);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = result;
  }
  if (typeof window !== 'undefined') {
    window.MapRenderer = result;
  }
  root.MapRenderer = result;
}(typeof self !== 'undefined' ? self : this, function (Physics) {
  'use strict';
  const PropSprites = typeof module !== 'undefined' && module.exports ? require('./prop_sprites.js') : window.PropSprites;

  class MapRenderer {
    constructor(mapData) {
      this.mapData = mapData;
      this.floorPatterns = {};
      this.decals = []; // Array of { type, x, y, angle, size, color, alpha }
      this.glassShards = [];
      this.debris = [];
      this.time = 0;

      // Pre-render floor tile patterns into offscreen canvases for blistering performance
      this.createFloorPatterns();
    }

    createFloorPatterns() {
      // Coarse, low-contrast material pixels survive the game's reduced canvas
      // without the fine grid producing shimmering tartan/moire under motion.
      const carpet = (id, base, light, dark) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 96;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = base; ctx.fillRect(0, 0, 96, 96);
        ctx.fillStyle = light;
        for (const [x,y,w,h] of [[8,12,10,3],[56,32,8,3],[26,72,12,3],[80,84,8,3]]) ctx.fillRect(x,y,w,h);
        ctx.fillStyle = dark;
        for (const [x,y,w,h] of [[38,20,7,3],[10,50,9,3],[70,62,10,3]]) ctx.fillRect(x,y,w,h);
        this.floorPatterns[id] = canvas;
      };
      carpet('carpet_grey', '#494657', '#535061', '#413e4e');
      carpet('carpet_jade', '#326b65', '#3d7770', '#2b605a');
      carpet('carpet_lavender', '#574759', '#625064', '#4e4050');
      carpet('carpet_dark', '#49415b', '#504762', '#433b55');
      carpet('carpet_blue_accent', '#447e87', '#4b858d', '#3f7680');
      const wood = document.createElement('canvas');
      wood.width = 144; wood.height = 96;
      const w = wood.getContext('2d');
      w.fillStyle = '#b99b74'; w.fillRect(0,0,144,96);
      for (let row = 0; row < 3; row++) {
        const y = row * 32;
        w.fillStyle = row === 1 ? '#c3a780' : '#bca079';
        w.fillRect(0,y,144,30);
        w.fillStyle = '#957c65'; w.fillRect(0,y+30,144,2);
        w.fillRect(row % 2 ? 36 : 96,y,2,32);
        w.fillStyle = '#cbb08a'; w.fillRect(9,y+8,62,2);
      }
      this.floorPatterns.wood_parquet = wood;
      const tile = (id, base, seam) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const c = canvas.getContext('2d');
        c.fillStyle = base; c.fillRect(0,0,64,64);
        c.fillStyle = seam; c.fillRect(0,0,64,3); c.fillRect(0,0,3,64);
        this.floorPatterns[id] = canvas;
      };
      tile('tile_restroom', '#c7c8b9', '#afb5aa');
      tile('tile_reception', '#71988b', '#63887e');
    }

    addBloodPool(x, y, radius = 22) {
      this.decals.push({
        type: 'blood_pool',
        x,
        y,
        radius,
        color: '#800505',
        splats: Array.from({ length: 5 }, () => ({
          dx: (Math.random() - 0.5) * radius * 1.8,
          dy: (Math.random() - 0.5) * radius * 1.8,
          r: 3 + Math.random() * 6
        }))
      });
      if (this.decals.length > 250) this.decals.shift();
    }

    addBulletHole(x, y, normalX = 0, normalY = 0) {
      this.decals.push({
        type: 'bullet_hole',
        x,
        y,
        normalX,
        normalY,
        color: '#111111'
      });
      if (this.decals.length > 250) this.decals.shift();
    }

    spawnDebris(x, y, type = 'glass', count = 10, dirX = 0, dirY = 0) {
      for (let i = 0; i < count; i++) {
        const speed = 60 + Math.random() * 220;
        const angle = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * 1.8;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const size = 3 + Math.random() * 6;
        const rotSpeed = (Math.random() - 0.5) * 15;

        if (type === 'glass') {
          this.glassShards.push(new Physics.GlassShard(x, y, vx, vy, size, Math.random() * 6.28, rotSpeed));
        }
      }
    }

    update(dt) {
      this.time += dt;
      for (let i = 0; i < this.glassShards.length; i++) {
        this.glassShards[i].update(dt);
      }
      // Update interactive doors
      if (this.mapData && this.mapData.doors) {
        for (let i = 0; i < this.mapData.doors.length; i++) {
          this.mapData.doors[i].update(dt);
        }
      }
      if (this.mapData && this.mapData.glassPartitions) {
        for (let i = 0; i < this.mapData.glassPartitions.length; i++) {
          const glass = this.mapData.glassPartitions[i];
          if (glass && typeof glass.update === 'function') glass.update(dt);
        }
      }
    }

    // -------------------------------------------------------------------------
    // Explicit render passes
    // -------------------------------------------------------------------------
    // Keep the environment work split into named passes so the live game loop
    // can place world actors (bodies, weapons, players and effects) between the
    // floor fixtures and the structural wall occlusion.  The individual
    // low-level methods remain public for compatibility with older callers.
    renderBackground(ctx, view) {
      this.renderFloorZones(ctx, view);
      this.renderCoreMass(ctx);
      this.renderWallShadows(ctx, view);
      this.renderDecals(ctx, view);
    }

    renderFixtures(ctx, view) {
      this.renderProps(ctx, view);
      this.renderExecutiveDesks(ctx, view);
      this.renderViseoLogoMural(ctx, view);
      this.renderWestLoungeMural(ctx, view);
      this.renderElevators(ctx, view);
      // Interactive doors and glazed partitions belong to the fixture layer.  A
      // bare renderer used by the pass-contract test has no mapData, so these
      // optional calls remain invisible there while the live/full-map renderer
      // gets the complete enclosure treatment.
      if (this.mapData) {
        this.renderGlassPartitions(ctx, view);
        this.renderDoors(ctx, view);
      }
    }

    renderForeground(ctx, view) {
      this.renderWalls(ctx, view);
    }

    renderFloorZones(ctx, view) {
      if (!this.mapData || !this.mapData.zones) return;

      // Canvas strokes look soft when plan coordinates land between pixels.  The
      // plan remains authoritative for physics; only the rasterized vertices are
      // snapped to integer pixels so each zone reads as a deliberate tile rather
      // than a blurry anti-aliased seam.
      const aligned = (point) => ({ x: Math.round(point.x), y: Math.round(point.y) });
      const drawPolygon = (polygon) => {
        const first = aligned(polygon[0]);
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        for (let p = 1; p < polygon.length; p++) {
          const next = aligned(polygon[p]);
          ctx.lineTo(next.x, next.y);
        }
        ctx.closePath();
      };

      // Paint one continuous base floor inside the exterior envelope first.
      // The hand-authored semantic zone polygons intentionally overlap and leave
      // small seams; without this base those seams exposed the black clear color
      // as huge triangular artifacts once the camera was rotated/zoomed.
      if (Array.isArray(this.mapData.buildingFootprint) && this.mapData.buildingFootprint.length >= 3) {
        const basePatternCanvas = this.floorPatterns['carpet_grey'];
        const basePattern = ctx.createPattern(basePatternCanvas, 'repeat');
        const fp = this.mapData.buildingFootprint;
        ctx.save();
        drawPolygon(fp);
        ctx.fillStyle = basePattern;
        ctx.fill();
        ctx.restore();
      }

      if(Array.isArray(this.mapData.floorLayers)) {
        ctx.save();
        if(this.mapData.buildingFootprint?.length>=3){drawPolygon(this.mapData.buildingFootprint);ctx.clip();}
        for(const floor of this.mapData.floorLayers) {
          if(!floor.polygon || floor.polygon.length<3) continue;
          drawPolygon(floor.polygon);
          ctx.fillStyle=ctx.createPattern(this.floorPatterns[floor.type]||this.floorPatterns.carpet_grey,'repeat');
          ctx.fill();
        }
        ctx.restore();return;
      }

      for (let i = 0; i < this.mapData.zones.length; i++) {
        const zone = this.mapData.zones[i];
        // The annotated diagonal-upper polygon is a broad planning guide, not
        // a finished floor boundary.  Filling it wholesale created a dark
        // triangular wedge across the reception lane.  Leave the light woven
        // base visible here; the glass-office framing below supplies the actual
        // room-aligned visual boundaries.
        if (zone.id === 'diagonal_upper') continue;
        const patternCanvas = this.floorPatterns[zone.type] || this.floorPatterns['carpet_grey'];
        const pattern = ctx.createPattern(patternCanvas, 'repeat');

        ctx.save();
        const poly = zone.polygon;
        drawPolygon(poly);
        ctx.fillStyle = pattern;
        ctx.fill();

        ctx.restore();
      }

      // The diagonal guide polygon is intentionally not a floor material.  Use
      // the authored separator quads to restore dark executive carpet only
      // inside the four enclosed E offices, then add the blue/teal meeting-room
      // accent as a high-salience but still translucent surface.
      this.renderExecutiveOfficeBays(ctx, view);
      this.renderMeetingAccent(ctx, view);
    }

    /**
     * Paint the four executive office floors from adjacent authored glass
     * separators.  These polygons are presentation-only; no collision object
     * is created and the broad diagonal planning guide remains unfilled.
     */
    renderExecutiveOfficeBays(ctx, view) {
      const fixtures = this.mapData && this.mapData.visualFixtures;
      const bays = fixtures && fixtures.executiveOfficeBays;
      if (!Array.isArray(bays)) return;

      const drawPolygon = (polygon) => {
        if (!Array.isArray(polygon) || polygon.length < 3) return false;
        ctx.beginPath();
        ctx.moveTo(Math.round(polygon[0].x), Math.round(polygon[0].y));
        for (let i = 1; i < polygon.length; i++) {
          ctx.lineTo(Math.round(polygon[i].x), Math.round(polygon[i].y));
        }
        ctx.closePath();
        return true;
      };

      for (let i = 0; i < bays.length; i++) {
        const bay = bays[i];
        if (!drawPolygon(bay.polygon)) continue;
        ctx.save();
        // Keep the dark carpet visibly different from adjacent grey circulation
        // while avoiding the high-contrast checkerboard that obscured door gaps.
        const pattern = this.floorPatterns && this.floorPatterns.carpet_dark &&
          typeof ctx.createPattern === 'function'
          ? ctx.createPattern(this.floorPatterns.carpet_dark, 'repeat')
          : null;
        ctx.fillStyle = pattern || bay.carpetColor || '#30434f';
        ctx.globalAlpha = 0.96;
        ctx.fill();
        ctx.strokeStyle = 'rgba(12, 25, 34, 0.78)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // A restrained inset edge gives each suite a readable floor boundary
        // without painting over the glass separator itself.
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = '#75aab1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round((bay.polygon[0].x + bay.polygon[3].x) * 0.5), Math.round((bay.polygon[0].y + bay.polygon[3].y) * 0.5));
        ctx.lineTo(Math.round((bay.polygon[1].x + bay.polygon[2].x) * 0.5), Math.round((bay.polygon[1].y + bay.polygon[2].y) * 0.5));
        ctx.stroke();
        ctx.restore();
      }
    }

    /** Paint the existing lower meeting polygon with an unambiguous blue/teal material. */
    renderMeetingAccent(ctx, view) {
      if (!this.mapData || !Array.isArray(this.mapData.zones)) return;
      const zone = this.mapData.zones.find(candidate => candidate && candidate.id === 'meeting_accent');
      if (!zone || !Array.isArray(zone.polygon) || zone.polygon.length < 3) return;
      const style = (this.mapData.visualFixtures && this.mapData.visualFixtures.meetingAccent) || {};
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(Math.round(zone.polygon[0].x), Math.round(zone.polygon[0].y));
      for (let i = 1; i < zone.polygon.length; i++) {
        ctx.lineTo(Math.round(zone.polygon[i].x), Math.round(zone.polygon[i].y));
      }
      ctx.closePath();
      ctx.globalAlpha = Number.isFinite(style.alpha) ? style.alpha : 0.78;
      ctx.fillStyle = style.fillColor || '#277f9a';
      ctx.fill();
      ctx.globalAlpha = 0.94;
      ctx.strokeStyle = style.strokeColor || '#52d8de';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    renderWallShadows(ctx, view) {
      if (!this.mapData || !this.mapData.walls) return;

      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
      ctx.filter = 'none';

      for (let i = 0; i < this.mapData.walls.length; i++) {
        const w = this.mapData.walls[i];
        ctx.beginPath();
        const dx = w.x2 - w.x1;
        const dy = w.y2 - w.y1;
        const l = Math.hypot(dx, dy);
        if (!l) continue;
        const nx = (-dy / l) * 14;
        const ny = (dx / l) * 14;

        ctx.moveTo(w.x1 + 6, w.y1 + 6);
        ctx.lineTo(w.x2 + 6, w.y2 + 6);
        ctx.lineTo(w.x2 + nx + 6, w.y2 + ny + 6);
        ctx.lineTo(w.x1 + nx + 6, w.y1 + ny + 6);
        ctx.closePath();
        ctx.fill();
      }

      // A crisp inner edge keeps the ambient occlusion visible on low-contrast
      // carpets where a soft blur alone tends to disappear.
      ctx.filter = 'none';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.30)';
      ctx.lineCap = 'square';
      for (let i = 0; i < this.mapData.walls.length; i++) {
        const w = this.mapData.walls[i];
        const dx = w.x2 - w.x1;
        const dy = w.y2 - w.y1;
        const l = Math.hypot(dx, dy);
        if (!l) continue;
        const nx = (-dy / l) * 5;
        const ny = (dx / l) * 5;
        ctx.lineWidth = w.type === 'exterior' ? 7 : 5;
        ctx.beginPath();
        ctx.moveTo(Math.round(w.x1 + nx), Math.round(w.y1 + ny));
        ctx.lineTo(Math.round(w.x2 + nx), Math.round(w.y2 + ny));
        ctx.stroke();
      }
      ctx.restore();
    }

    renderDecals(ctx, view) {
      ctx.save();
      // Render Blood Pools & Bullet Holes
      for (let i = 0; i < this.decals.length; i++) {
        const d = this.decals[i];
        if (d.type === 'blood_pool') {
          ctx.fillStyle = d.color;
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
          ctx.fill();

          for (let s = 0; s < d.splats.length; s++) {
            const splat = d.splats[s];
            ctx.beginPath();
            ctx.arc(d.x + splat.dx, d.y + splat.dy, splat.r, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (d.type === 'bullet_hole') {
          ctx.fillStyle = '#111111';
          ctx.beginPath();
          ctx.arc(d.x, d.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#555555';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // Render Broken Glass Shards
      for (let i = 0; i < this.glassShards.length; i++) {
        this.glassShards[i].render(ctx);
      }
      ctx.restore();
    }

    renderProps(ctx, view) {
      if (!this.mapData || !this.mapData.props) return;

      for (let i = 0; i < this.mapData.props.length; i++) {
        const p = this.mapData.props[i];
        if (/^executive_bay_/.test(p.id || '')) continue;

        ctx.save();
        let drawP = p;
        if (p.centered) {
          // Physics treats centered/rotated rectangular props as OBBs around
          // (p.x,p.y). Render from that same origin so visuals and collision
          // are exactly superposed.
          ctx.translate(p.x, p.y);
          if (p.angle && p.angle !== 0) ctx.rotate(p.angle);
          drawP = Object.assign({}, p, {
            x: -p.width * 0.5,
            y: -p.height * 0.5,
            angle: 0,
            centered: false
          });
        } else if (p.angle && p.angle !== 0) {
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          ctx.translate(-p.x, -p.y);
        }

        // Furniture Drop Shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 3;

        if(drawP.type==='elevator')ctx.shadowColor='transparent';
        if(PropSprites && PropSprites.render(ctx,drawP)){ctx.restore();continue;}
        switch (drawP.type) {
          case 'elevator':
            ctx.fillStyle='#101e2b';ctx.fillRect(drawP.x,drawP.y,drawP.width,drawP.height);
            ctx.strokeStyle='#385468';ctx.lineWidth=4;ctx.strokeRect(drawP.x,drawP.y,drawP.width,drawP.height);
            ctx.fillStyle='#254254';ctx.fillRect(drawP.x+6,drawP.y+6,drawP.width/2-9,drawP.height-12);
            ctx.fillRect(drawP.x+drawP.width/2+3,drawP.y+6,drawP.width/2-9,drawP.height-12);
            ctx.fillStyle='#edcb6a';ctx.fillRect(drawP.x+drawP.width/2-7,drawP.y-9,14,5);
            break;
          case 'desk_cluster_6':
          case 'desk_cluster_4':
            this.renderDeskCluster(ctx, drawP);
            break;
          case 'executive_desk':
            this.renderExecutiveDesk(ctx, drawP);
            break;
          case 'conference_table_oval':
          case 'conference_table_large':
            this.renderConferenceTable(ctx, drawP);
            break;
          case 'kitchen_counter':
          case 'reception_counter':
            this.renderCounter(ctx, drawP);
            break;
          case 'acoustic_sofa_pod':
            this.renderAcousticSofaPod(ctx, drawP);
            break;
          case 'lounge_sofa':
            this.renderLoungeSofa(ctx, drawP);
            break;
          case 'lounge_armchair':
            this.renderArmchair(ctx, {...drawP,x:drawP.x+drawP.width/2,y:drawP.y+drawP.height/2,radius:Math.min(drawP.width,drawP.height)/2});
            break;
          case 'pouf_cyan':
          case 'pouf_navy':
            this.renderPouf(ctx, {...drawP,x:drawP.x+drawP.width/2,y:drawP.y+drawP.height/2,radius:Math.min(drawP.width,drawP.height)/2,color:drawP.type==='pouf_cyan'?'#47d5e0':'#324977'});
            break;
          case 'printer_station':
            this.renderPrinterStation(ctx, drawP);
            break;
          case 'planter_cabinet':
          case 'plant':
          case 'planter_box':
            this.renderPlanter(ctx, drawP);
            break;
          case 'coffee_machine':
            this.renderCoffeeMachine(ctx, drawP);
            break;
          case 'water_cooler':
            this.renderWaterCooler(ctx, drawP);
            break;
          default:
            // Generic solid desk / prop
            ctx.fillStyle = drawP.color || '#bb9b74';
            ctx.fillRect(drawP.x, drawP.y, drawP.width, drawP.height);
            ctx.strokeStyle = '#222222';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(drawP.x, drawP.y, drawP.width, drawP.height);
            break;
        }

        ctx.restore();
      }

      // A handful of non-blocking dressing pieces fill the social and reception
      // pockets visible in the source references.  They are rendered here (and
      // never added to MapData.props) so plan collision/pathfinding semantics stay
      // exactly as authored.
      this.renderAmbientProps(ctx);
    }

    /**
     * Dress each diagonal E bay with one small rotated executive desk and a
     * chair silhouette.  Fixtures are intentionally render-only metadata and
     * never enter the physics prop list.
     */
    renderExecutiveDesks(ctx, view) {
      // Use the actual editable/collidable prop, not a second visual-only copy.
      const props = this.mapData && this.mapData.props;
      if (!props) return;
      for (const p of props.filter(p => /^executive_bay_/.test(p.id || ''))) {
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.angle || 0);
        this.renderExecutiveDesk(ctx, Object.assign({},p,{x:-p.width/2,y:-p.height/2}));
        ctx.restore();
      }
    }

    renderAmbientProps(ctx) {
      if(this.mapData?.editableDecor || !this.mapData?.planToWorld)return;
      const anchor=this.mapData.visualFixtures?.westLounge?.loungeAnchor || this.mapData.planToWorld(31,40);
      const plant=this.mapData.planToWorld(28,58);
      for(const p of [
        {type:'lounge_sofa',x:anchor.x,y:anchor.y,width:172,height:52},
        {type:'pouf_cyan',x:anchor.x-41,y:anchor.y+7,width:38,height:38},
        {type:'pouf_navy',x:anchor.x+177,y:anchor.y+9,width:34,height:34},
        {type:'plant',x:plant.x-22,y:plant.y-34,width:44,height:44}
      ])PropSprites.render(ctx,p);
    }

    // -------------------------------------------------------------------------
    // Specific Furniture Drawing Routines
    // -------------------------------------------------------------------------
    renderDeskCluster(ctx, p) {
      // The authored rectangle is the entire workstation island, chairs included.
      // Desks face the central divider; seats belong at the OUTSIDE edges.
      const top = p.y + 18, height = p.height - 36;
      ctx.fillStyle = '#d4af7f';
      ctx.fillRect(p.x, top, p.width, height);
      ctx.strokeStyle = '#443344'; ctx.lineWidth = 3;
      ctx.strokeRect(p.x, top, p.width, height);
      ctx.fillStyle = '#f0cf98'; ctx.fillRect(p.x+3,top+3,p.width-6,3);
      ctx.fillStyle = '#987055'; ctx.fillRect(p.x+3,top+height-6,p.width-6,3);
      ctx.fillStyle = '#354153';
      ctx.fillRect(p.x+2,p.y+p.height/2-3,p.width-4,6);
      const count = p.type === 'desk_cluster_6' ? 3 : 2;
      for (let i=0;i<count;i++) {
        const x = p.x + p.width*(i+.5)/count;
        this.renderWorkstation(ctx,x,p.y+p.height/2-14,p.y+29,-1,p.y+8);
        this.renderWorkstation(ctx,x,p.y+p.height/2+14,p.y+p.height-29,1,p.y+p.height-8);
        ctx.fillStyle = '#efe4c4';
        ctx.fillRect(Math.round(x+20),Math.round(top+7),10,14);
        ctx.fillStyle = '#a49791';
        ctx.fillRect(Math.round(x+22),Math.round(top+10),6,2);
        if(i>0) {
          ctx.fillStyle='#ab8668';
          ctx.fillRect(Math.round(p.x+p.width*i/count),top+3,2,height-6);
        }
      }
    }

    renderWorkstation(ctx, x, monY, kbY, side, seatY) {
      // Chunky CRTs and square chair silhouettes remain legible on the low-res canvas.
      const chairY = seatY === undefined ? kbY + side * 23 : seatY;
      ctx.fillStyle = '#211c31';
      ctx.fillRect(Math.round(x - 10), Math.round(chairY - 9), 20, 18);
      ctx.fillRect(Math.round(x - 14), Math.round(chairY - 5), 4, 12);
      ctx.fillRect(Math.round(x + 10), Math.round(chairY - 5), 4, 12);
      ctx.fillStyle = '#485064';
      ctx.fillRect(Math.round(x - 7), Math.round(chairY - 6), 14, 11);
      ctx.fillStyle = '#777785';
      ctx.fillRect(Math.round(x - 7), Math.round(chairY - 6), 14, 3);
      ctx.fillStyle = '#44404e';
      ctx.fillRect(x - 11, kbY - 4, 22, 8);
      ctx.fillStyle = '#b1aaa9';
      ctx.fillRect(x - 8, kbY - 2, 16, 2);
      ctx.fillStyle = '#332a3f';
      ctx.fillRect(x - 15, monY - 8, 30, 17);
      ctx.fillStyle = '#c8bcb0';
      ctx.fillRect(x - 12, monY - 6, 24, 12);
      ctx.fillStyle = '#235365';
      ctx.fillRect(x - 9, monY - 4, 18, 7);
      ctx.fillStyle = '#72c8ba';
      ctx.fillRect(x - 7, monY - 3, 10, 2);
      ctx.fillStyle = '#4c3f4f';
      ctx.fillRect(x - 5, monY + (side < 0 ? -11 : 9), 10, 3);
    }

    renderExecutiveDesk(ctx, p) {
      ctx.fillStyle = p.color || '#c6b087';
      ctx.fillRect(p.x, p.y, p.width, p.height);
      ctx.strokeStyle = '#514052';
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x, p.y, p.width, p.height);
      ctx.fillStyle = '#e3cea0';
      ctx.fillRect(p.x + 3, p.y + 3, p.width - 6, 4);
      ctx.fillStyle = '#997861';
      ctx.fillRect(p.x + 3, p.y + p.height - 7, p.width - 6, 4);
      const count = p.monitors || 1;
      for (let i = 0; i < count; i++) {
        const x = p.x + p.width * (i + 0.5) / count;
        this.renderWorkstation(ctx, x, p.y + 15, p.y + p.height - 14, 1);
        ctx.fillStyle = '#e4e0ca';
        ctx.fillRect(x + 21, p.y + p.height - 27, 13, 19);
        ctx.fillStyle = '#7e8590';
        ctx.fillRect(x + 23, p.y + p.height - 22, 9, 2);
      }
    }

    renderConferenceTable(ctx, p) {
      ctx.fillStyle = p.color || '#6d4c2b';
      ctx.strokeStyle = '#222222';
      ctx.lineWidth = 2;

      // Rounded oval table
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(p.x, p.y, p.width, p.height, 20);
      } else {
        ctx.rect(p.x, p.y, p.width, p.height);
      }
      ctx.fill();
      ctx.stroke();
      ctx.save(); ctx.clip();
      ctx.fillStyle = 'rgba(244,208,149,.20)';
      ctx.fillRect(p.x+9,p.y+7,p.width-18,3);
      ctx.fillStyle = 'rgba(39,26,41,.22)';
      ctx.fillRect(p.x+7,p.y+p.height-8,p.width-14,3);
      // One folder and a mug provide scale without covering the table surface.
      if (p.width > 100) {
        ctx.fillStyle = '#ded8bc'; ctx.fillRect(p.x+p.width*.48,p.y+p.height*.38,13,19);
        ctx.fillStyle = '#8c9392'; ctx.fillRect(p.x+p.width*.48+3,p.y+p.height*.38+5,7,2);
        ctx.fillStyle = '#eee0bd'; ctx.fillRect(p.x+p.width*.67,p.y+p.height*.56,6,6);
        ctx.fillStyle = '#47373f'; ctx.fillRect(p.x+p.width*.67+2,p.y+p.height*.56+2,2,2);
      }
      ctx.restore();

      // Conference Chairs arranged around perimeter
      const chairCount = p.chairs || 8;
      ctx.fillStyle = '#1c2833';
      const perimeter = (p.width + p.height) * 2;

      for (let c = 0; c < chairCount; c++) {
        let cx, cy;
        const side = c % 4;
        if (c < chairCount * 0.5) {
          cx = p.x + 20 + (chairCount === 2 ? 0.5 : c / (chairCount * 0.5 - 1)) * (p.width - 40);
          cy = p.y - 8;
        } else {
          const idx = c - chairCount * 0.5;
          cx = p.x + 20 + (chairCount === 2 ? 0.5 : idx / (chairCount * 0.5 - 1)) * (p.width - 40);
          cy = p.y + p.height + 8;
        }
        ctx.fillStyle = '#202031';
        ctx.fillRect(Math.round(cx-8),Math.round(cy-7),16,14);
        ctx.fillStyle = '#47505b';
        ctx.fillRect(Math.round(cx-5),Math.round(cy-4),10,8);
        ctx.fillStyle = '#727681';
        ctx.fillRect(Math.round(cx-5),Math.round(cy-4),10,2);
      }
    }

    renderAcousticSofaPod(ctx, p) {
      // High-back curved soundproof booth pod (Top-right render in plan.png)
      ctx.fillStyle = '#1b4f72';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(p.x, p.y, p.width, p.height, 16);
      } else {
        ctx.rect(p.x, p.y, p.width, p.height);
      }
      ctx.fill();
      ctx.strokeStyle = '#0b2438';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Inner table
      ctx.fillStyle = '#f5cba7';
      ctx.fillRect(p.x + p.width * 0.25, p.y + 12, p.width * 0.5, p.height - 24);
    }

    renderLoungeSofa(ctx, p) {
      // Dark Navy 2-Seater Sofa (Matching left render in plan.png)
      ctx.fillStyle = '#1a365d';
      ctx.fillRect(p.x, p.y, p.width, p.height);
      ctx.strokeStyle = '#0f223d';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x, p.y, p.width, p.height);

      // Cushions
      ctx.fillStyle = '#2a4365';
      ctx.fillRect(p.x + 4, p.y + 4, (p.width - 12) * 0.5, p.height - 8);
      ctx.fillRect(p.x + (p.width - 12) * 0.5 + 8, p.y + 4, (p.width - 12) * 0.5, p.height - 8);
    }

    renderArmchair(ctx, p) {
      ctx.fillStyle = '#1a365d';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0f223d';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Inner cushion
      ctx.fillStyle = '#2a4365';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * 0.65, 0, Math.PI * 2);
      ctx.fill();
    }

    renderPouf(ctx, p) {
      ctx.fillStyle = p.color || '#00d2d3';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    renderPrinterStation(ctx, p) {
      // White Double Copier / Printer station (Top-right render in plan.png)
      ctx.fillStyle = '#f8f9f9';
      ctx.fillRect(p.x, p.y, p.width, p.height);
      ctx.strokeStyle = '#bdc3c7';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x, p.y, p.width, p.height);

      // Paper output slots & control screen
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(p.x + 8, p.y + 8, p.width - 16, 6);
      ctx.fillStyle = '#00d2d3';
      ctx.fillRect(p.x + p.width - 16, p.y + 18, 8, 8);
    }

    renderPlanter(ctx, p) {
      // Planter cabinet / box
      ctx.fillStyle = p.color === '#27ae60' ? '#c4a47c' : '#a08055';
      if (p.radius) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#4e3b2b';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Green foliage
        ctx.fillStyle = '#27ae60';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 0.75, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(p.x, p.y, p.width, p.height);
        ctx.strokeStyle = '#4e3b2b';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(p.x, p.y, p.width, p.height);
        // Green leaves on top
        ctx.fillStyle = '#2e7d32';
        ctx.fillRect(p.x + 2, p.y + 2, p.width - 4, p.height - 4);
      }
    }

    renderCounter(ctx, p) {
      ctx.fillStyle = p.color || '#2c3e50';
      ctx.fillRect(p.x, p.y, p.width, p.height);
      ctx.strokeStyle = '#1a252f';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x, p.y, p.width, p.height);
      // Top granite trim
      ctx.fillStyle = '#34495e';
      ctx.fillRect(p.x + 2, p.y + 2, p.width - 4, 6);
    }

    renderCoffeeMachine(ctx, p) {
      ctx.fillStyle = '#111111';
      ctx.fillRect(p.x, p.y, p.width, p.height);
      ctx.fillStyle = '#e74c3c'; // red indicator light
      ctx.fillRect(p.x + 4, p.y + 4, 3, 3);
      ctx.fillStyle = '#ecf0f1'; // metallic dispenser spout
      ctx.fillRect(p.x + p.width * 0.5 - 2, p.y + p.height - 4, 4, 3);
    }

    renderWaterCooler(ctx, p) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(p.x, p.y, p.width, p.height);
      ctx.fillStyle = '#3498db'; // water bottle dome
      ctx.beginPath();
      ctx.arc(p.x + p.width * 0.5, p.y + p.height * 0.5, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // -------------------------------------------------------------------------
    // VISEO Wall Logo & Cable Car Mural (Faithful to Left Render in plan.png)
    // -------------------------------------------------------------------------
    // The reference logo is on a vertical wall. In a true overhead view it
    // should not become a large floating board across furniture or circulation.
    // Retain the pass hooks for inspection tools, without drawing false props.
    renderViseoLogoMural(ctx) {}
    renderWestLoungeMural(ctx, view) {}

    renderGlassPartitions(ctx, view) {
      if (!this.mapData || !this.mapData.glassPartitions) return;
      for (let i = 0; i < this.mapData.glassPartitions.length; i++) {
        const glass = this.mapData.glassPartitions[i];
        if (!glass) continue;
        // A shattered partition owns its broken endpoint stubs.  Do not lay an
        // intact pane/envelope underneath it; that would visually heal the
        // glass while shards are still present.
        if (glass.shattered) {
          if (typeof glass.render === 'function') glass.render(ctx);
          continue;
        }
        // MapRenderer owns the full framed-pane treatment for intact glass.
        // Avoid invoking GlassPartition.render() as well, which would double
        // the translucent body and make glass read like an opaque cover.
        this.renderGlassEnvelope(ctx, glass);
      }
    }

    renderGlassEnvelope(ctx, glass) {
      const dx = glass.x2 - glass.x1;
      const dy = glass.y2 - glass.y1;
      const length = Math.hypot(dx, dy);
      if (!Number.isFinite(length) || length <= 0) return;
      const angle = Math.atan2(dy, dx);
      const half = Math.max(5, (glass.thickness || 6) * 0.9);

      ctx.save();
      ctx.translate(Math.round(glass.x1), Math.round(glass.y1));
      ctx.rotate(angle);

      // Broad, low-opacity pane body: the floor remains visible through it,
      // unlike a single cyan rail at map-inspection scale.
      ctx.fillStyle = 'rgba(179, 224, 236, 0.12)';
      ctx.fillRect(0, -half, Math.round(length), Math.round(half * 2));

      // Dark mullion frame plus a pale top-facing highlight create a complete
      // office rectangle rhythm for E and the glazed F room.
      ctx.strokeStyle = 'rgba(15, 29, 42, 0.94)';
      ctx.lineWidth = Math.max(4, Math.round((glass.thickness || 6) * 0.72));
      ctx.strokeRect(0, -half, Math.round(length), Math.round(half * 2));
      ctx.strokeStyle = 'rgba(243, 253, 255, 0.78)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(2, Math.round(-half + 1));
      ctx.lineTo(Math.round(length - 2), Math.round(-half + 1));
      ctx.stroke();

      // Frosted privacy stripe and regularly spaced vertical mullions make the
      // panes read as framed glass instead of collision rails.
      ctx.fillStyle = 'rgba(238, 250, 255, 0.12)';
      ctx.fillRect(2, -2, Math.max(1, Math.round(length - 4)), 4);
      ctx.fillStyle = 'rgba(20, 39, 53, 0.86)';
      const mullions = Math.max(0, Math.floor(length / 42));
      for (let i = 1; i <= mullions; i++) {
        const mx = Math.round((length / (mullions + 1)) * i);
        ctx.fillRect(mx - 1, Math.round(-half), 2, Math.round(half * 2));
      }

      // Termination posts are intentionally wider than the pane, making each
      // room corner and door gap readable at gameplay zoom.
      ctx.fillRect(-3, Math.round(-half - 2), 6, Math.round(half * 2 + 4));
      ctx.fillRect(Math.round(length - 3), Math.round(-half - 2), 6, Math.round(half * 2 + 4));
      ctx.restore();
    }

    renderDoors(ctx, view) {
      if (!this.mapData || !this.mapData.doors) return;
      for (let i = 0; i < this.mapData.doors.length; i++) {
        const door = this.mapData.doors[i];
        if (!door) continue;
        if (typeof door.render === 'function') door.render(ctx);
        // Door.render() draws the broken pivot/frame when shattered.  Leave it
        // as the sole visual owner of that state; the intact leaf/jamb overlay
        // below must never be painted back over a destroyed door.
        if (door.shattered) continue;
        this.renderDoorOpening(ctx, door);
      }
    }

    renderDoorOpening(ctx, door) {
      if (!door || door.shattered) return;
      const length = Math.max(24, Math.round(door.length || 54));
      const thickness = Math.max(6, Math.round(door.thickness || 6));
      const closedAngle = Number.isFinite(door.baseAngle) ? door.baseAngle : (door.angle || 0);
      const angle = Number.isFinite(door.angle) ? door.angle : closedAngle;
      const hingeX = Math.round(door.x);
      const hingeY = Math.round(door.y);
      const closedTipX = Math.round(door.x + Math.cos(closedAngle) * length);
      const closedTipY = Math.round(door.y + Math.sin(closedAngle) * length);
      const liveTipX = Math.round(door.x + Math.cos(angle) * length);
      const liveTipY = Math.round(door.y + Math.sin(angle) * length);

      ctx.save();
      // Fixed jambs at both ends visibly terminate the opening while preserving
      // the actual floor gap between them.
      const normalX = -Math.sin(closedAngle);
      const normalY = Math.cos(closedAngle);
      const postHalf = Math.max(6, Math.round(thickness * 0.75));
      ctx.strokeStyle = 'rgba(12, 21, 29, 0.96)';
      ctx.lineWidth = thickness + 7;
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(Math.round(hingeX - normalX * postHalf), Math.round(hingeY - normalY * postHalf));
      ctx.lineTo(Math.round(hingeX + normalX * postHalf), Math.round(hingeY + normalY * postHalf));
      ctx.moveTo(Math.round(closedTipX - normalX * postHalf), Math.round(closedTipY - normalY * postHalf));
      ctx.lineTo(Math.round(closedTipX + normalX * postHalf), Math.round(closedTipY + normalY * postHalf));
      ctx.stroke();
      ctx.strokeStyle = door.type === 'glass' ? 'rgba(235, 249, 255, 0.86)' : 'rgba(214, 185, 126, 0.88)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.round(hingeX - normalX * postHalf), Math.round(hingeY - normalY * postHalf));
      ctx.lineTo(Math.round(hingeX + normalX * postHalf), Math.round(hingeY + normalY * postHalf));
      ctx.moveTo(Math.round(closedTipX - normalX * postHalf), Math.round(closedTipY - normalY * postHalf));
      ctx.lineTo(Math.round(closedTipX + normalX * postHalf), Math.round(closedTipY + normalY * postHalf));
      ctx.stroke();

      // Threshold/floor gap: this short light line is intentionally inset from
      // the jambs so an open doorway is never mistaken for a wall segment.
      ctx.strokeStyle = 'rgba(242, 238, 214, 0.78)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(Math.round(door.x + Math.cos(closedAngle) * 10), Math.round(door.y + Math.sin(closedAngle) * 10));
      ctx.lineTo(Math.round(door.x + Math.cos(closedAngle) * Math.max(11, length - 10)), Math.round(door.y + Math.sin(closedAngle) * Math.max(11, length - 10)));
      ctx.stroke();

      // Emphasize the live leaf/slab edge, hinge pin and handle endpoint.  The
      // door object still owns all physical dimensions and interaction state.
      ctx.strokeStyle = door.type === 'glass' ? 'rgba(168, 234, 247, 0.94)' : 'rgba(190, 128, 61, 0.98)';
      ctx.lineWidth = thickness + 2;
      ctx.beginPath();
      ctx.moveTo(hingeX, hingeY);
      ctx.lineTo(liveTipX, liveTipY);
      ctx.stroke();
      ctx.fillStyle = '#111a22';
      ctx.beginPath();
      ctx.arc(hingeX, hingeY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f1d16a';
      ctx.beginPath();
      ctx.arc(Math.round(door.x + Math.cos(angle) * Math.max(8, length - 8)), Math.round(door.y + Math.sin(angle) * Math.max(8, length - 8)), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2a1c0d';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    renderCoreMass(ctx) {
      if(Array.isArray(this.mapData?.floorLayers)) return;
      if (!this.mapData || !this.mapData.serviceCoreRooms) return;
      // Canonical room floors meet their physical shell. No decorative strokes
      // masquerading as walls, overlapping triangles, or unwalkable fake panels.
      for (const room of this.mapData.serviceCoreRooms) {
        const points = room.polygon;
        if (!points || points.length < 3) continue;
        ctx.save(); ctx.beginPath();
        points.forEach((p,i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));
        ctx.closePath();
        const pattern = this.floorPatterns.tile_restroom;
        ctx.fillStyle = pattern ? ctx.createPattern(pattern,'repeat') : '#cbcbbd';
        ctx.fill();
        ctx.restore();
      }
    }

    renderWalls(ctx, view) {
      if (!this.mapData || !this.mapData.walls) return;

      ctx.save();
      for (let i = 0; i < this.mapData.walls.length; i++) {
        const w = this.mapData.walls[i];
        const isExterior = w.type === 'exterior';
        const wallThickness = isExterior || w.type === 'core' ? 17 : 13;
        const x1 = Math.round(w.x1);
        const y1 = Math.round(w.y1);
        const x2 = Math.round(w.x2);
        const y2 = Math.round(w.y2);

        // Base Wall Core (Solid Black/Dark Charcoal)
        ctx.strokeStyle = '#242036';
        ctx.lineWidth = wallThickness;
        ctx.lineCap = 'square';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Broad plaster wall caps give architecture mass at gameplay scale.
        ctx.strokeStyle = isExterior ? '#bd8b9d' : '#b8b5bb';
        ctx.lineWidth = isExterior ? 10 : 7;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Offset light lip gives the wall a readable top-facing plane while the
        // dark core remains the collision-faithful structural footprint.
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.hypot(dx, dy);
        if (length > 0) {
          const offset = isExterior ? 3 : 2;
          const nx = Math.round((-dy / length) * offset);
          const ny = Math.round((dx / length) * offset);
          ctx.strokeStyle = isExterior ? '#e1b3bc' : '#e0d7cd';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x1 + nx, y1 + ny);
          ctx.lineTo(x2 + nx, y2 + ny);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    renderElevators(ctx, view) {
      if(this.mapData?.editableDecor)return;
      for(const point of this.mapData?.spawnPoints?.spawnLocations||[]) {
        if(point.type==='elevator')PropSprites.render(ctx,{type:'elevator',x:point.x-52,y:point.y-36,width:104,height:72});
      }
    }

    /**
     * Compatibility composite.  New callers should use the explicit passes so
     * actor depth can be controlled by the live game loop; legacy callers still
     * receive the complete map background/fixture/foreground sequence.
     */
    render(ctx, view = null) {
      // Accept the historical camera argument as well as a precomputed bounds
      // object.  Passing a camera here is intentionally side-effect free.
      const resolvedView = view && typeof view.getBounds === 'function'
        ? view.getBounds()
        : view;
      this.renderBackground(ctx, resolvedView);
      this.renderFixtures(ctx, resolvedView);
      this.renderForeground(ctx, resolvedView);
    }
  }

  MapRenderer.prototype.renderFloors = MapRenderer.prototype.renderFloorZones;

  return MapRenderer;
}));
