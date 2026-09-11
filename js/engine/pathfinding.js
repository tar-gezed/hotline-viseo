/**
 * pathfinding.js - Waypoint Navigation Graph & A* Engine for Hotline Miami: VISEO Arcade Edition
 * Ensures complete 360-degree seamless loops around the Central Core and Focus Island,
 * path smoothing (string pulling), dynamic door weights, and flanking AI queries.
 */

(function (root, factory) {
  const PhysicsObj = (typeof window !== 'undefined' && window.Physics) ? window.Physics : (root.Physics || null);
  const result = factory(PhysicsObj);
  if (typeof define === 'function' && define.amd) {
    define(['./physics'], () => result);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = result;
  }
  if (typeof window !== 'undefined') {
    window.Pathfinding = result;
  }
  root.Pathfinding = result;
}(typeof self !== 'undefined' ? self : this, function (Physics) {
  'use strict';
  if (!Physics && typeof module === 'object' && module.exports && typeof require === 'function') {
    Physics = require('./physics.js');
  }

  function getSolidPropCorners(prop) {
    const w = prop.collisionWidth || prop.width;
    const h = prop.collisionHeight || prop.height;
    if (prop.centered || (prop.angle && prop.angle !== 0)) {
      const hw = w * 0.5;
      const hh = h * 0.5;
      const cos = Math.cos(prop.angle || 0);
      const sin = Math.sin(prop.angle || 0);
      return [
        { x: prop.x + (-hw * cos - -hh * sin), y: prop.y + (-hw * sin + -hh * cos) },
        { x: prop.x + (hw * cos - -hh * sin), y: prop.y + (hw * sin + -hh * cos) },
        { x: prop.x + (hw * cos - hh * sin), y: prop.y + (hw * sin + hh * cos) },
        { x: prop.x + (-hw * cos - hh * sin), y: prop.y + (-hw * sin + hh * cos) }
      ];
    }
    return [
      { x: prop.x, y: prop.y },
      { x: prop.x + w, y: prop.y },
      { x: prop.x + w, y: prop.y + h },
      { x: prop.x, y: prop.y + h }
    ];
  }

  function pointInsideSolidProp(x, y, prop) {
    const angle = -(prop.angle || 0);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const cx = prop.centered ? prop.x : (prop.x + (prop.collisionWidth || prop.width) * 0.5);
    const cy = prop.centered ? prop.y : (prop.y + (prop.collisionHeight || prop.height) * 0.5);
    const lx = (x - cx) * cos - (y - cy) * sin;
    const ly = (x - cx) * sin + (y - cy) * cos;
    const hw = (prop.collisionWidth || prop.width) * 0.5;
    const hh = (prop.collisionHeight || prop.height) * 0.5;
    return Math.abs(lx) <= hw && Math.abs(ly) <= hh;
  }

  function segmentIntersectsSolidProp(ax, ay, bx, by, prop) {
    if (!prop || !prop.solid) return false;
    if (pointInsideSolidProp(ax, ay, prop) || pointInsideSolidProp(bx, by, prop)) return true;
    const corners = getSolidPropCorners(prop);
    for (let i = 0; i < 4; i++) {
      const p1 = corners[i];
      const p2 = corners[(i + 1) % 4];
      if (Physics.lineIntersectsSegment && Physics.lineIntersectsSegment(ax, ay, bx, by, p1.x, p1.y, p2.x, p2.y)) {
        return true;
      }
    }
    return false;
  }

  function hasTraversalLineOfSight(mapData, p1, p2, options = {}) {
    const visible = Physics.hasLineOfSight(mapData, p1, p2, {
      ignoreDoors: options.ignoreDoors || false,
      seeThroughGlass: options.seeThroughGlass !== false,
      ignoreProps: true
    });
    if (!visible) return false;
    if (mapData && Array.isArray(mapData.props)) {
      for (const prop of mapData.props) {
        if (segmentIntersectsSolidProp(p1.x, p1.y, p2.x, p2.y, prop)) return false;
      }
    }
    return true;
  }

  class NavNode {
    constructor(id, x, y, zone = 'hallway') {
      this.id = id;
      this.x = x;
      this.y = y;
      this.zone = zone;
      this.neighbors = []; // array of { node: NavNode, baseDist: number, door: Door|null }
    }

    addNeighbor(node, door = null) {
      if (!node || node === this) return;
      if (this.neighbors.some(n => n.node === node)) return;

      const dist = Math.hypot(this.x - node.x, this.y - node.y);
      this.neighbors.push({ node, baseDist: dist, door });
    }
  }

  class NavGraph {
    constructor(mapData) {
      this.mapData = mapData;
      this.nodes = new Map();
      this.patrolRoutes = new Map();
      this.buildGraph();
      this.buildPatrolRoutes();
    }

    addNode(id, x, y, zone) {
      const node = new NavNode(id, x, y, zone);
      this.nodes.set(id, node);
      return node;
    }

    connect(idA, idB, doorId = null) {
      const nodeA = this.nodes.get(idA);
      const nodeB = this.nodes.get(idB);
      if (!nodeA || !nodeB) return;

      let door = null;
      if (doorId && this.mapData && this.mapData.doors) {
        door = this.mapData.doors.find(d => d.id === doorId) || null;
      }

      nodeA.addNeighbor(nodeB, door);
      nodeB.addNeighbor(nodeA, door);
    }

    buildGraph() {
      // Plan-driven maps can provide their own waypoint cloud. We keep the
      // existing A* / smoothing implementation, but derive graph connectivity
      // from actual wall visibility so navigation cannot drift away from the
      // reconstructed floor plan.
      const def = this.mapData && this.mapData.navGraphDefinition;
      if (def && Array.isArray(def.nodes) && def.nodes.length) {
        for (const n of def.nodes) {
          let point = n;
          const blocked = (x, y) => (this.mapData.props || []).some(p => p.solid && pointInsideSolidProp(x, y, {
            ...p, collisionWidth: (p.collisionWidth || p.width) + 32,
            collisionHeight: (p.collisionHeight || p.height) + 32
          }));
          if (blocked(n.x, n.y)) {
            // Furniture may change after an authored patrol anchor. Keep its
            // identity but relocate it into the nearest adjacent walking lane.
            search: for (let radius = 24; radius <= 192; radius += 24) {
              for (let k = 0; k < 16; k++) {
                const candidate = {x:n.x + Math.cos(k*Math.PI/8)*radius, y:n.y + Math.sin(k*Math.PI/8)*radius};
                if (blocked(candidate.x, candidate.y)) continue;
                if (!Physics.hasLineOfSight(this.mapData, n, candidate, {ignoreProps:true,ignoreDoors:true,seeThroughGlass:false})) continue;
                point = candidate; break search;
              }
            }
          }
          this.addNode(n.id, point.x, point.y, n.zone || 'hallway');
        }
        // Sparse plan grids can miss narrow doorways entirely. Put waypoints
        // on both sides of each real opening so room occupants can rejoin a
        // wave without inventing links through glass or solid partitions.
        for (const door of this.mapData.doors || []) {
          const angle = door.baseAngle === undefined ? door.angle : door.baseAngle;
          const mx = door.x + Math.cos(angle) * door.length / 2;
          const my = door.y + Math.sin(angle) * door.length / 2;
          for (const side of [-1, 1]) {
            for (const offset of [36, 24, 54]) {
              const x = mx - Math.sin(angle) * offset * side;
              const y = my + Math.cos(angle) * offset * side;
              if ((this.mapData.props || []).some(p => p.solid && pointInsideSolidProp(x, y, p))) continue;
              this.addNode(`portal_${door.id}_${side}`, x, y, 'doorway');
              break;
            }
          }
        }

        const nodes = Array.from(this.nodes.values());
        const maxDist = Number.isFinite(def.autoConnectDistance) ? def.autoConnectDistance : 420;
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i];
            const b = nodes[j];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (dist > maxDist) continue;

            // Doors may open/push during play, so ignore their current closed
            // leaf for graph construction. Glass remains blocking unless the
            // annotated layout has a real doorway gap.
            const visible = hasTraversalLineOfSight(this.mapData, a, b, {
              ignoreDoors: true,
              seeThroughGlass: false,
              ignoreProps: true
            });
            if (!visible) continue;

            // Preserve the small closed-door path cost whenever a candidate
            // edge crosses a door leaf in its base (closed) position.
            let crossedDoorId = null;
            if (this.mapData.doors && Physics.lineIntersectsSegment) {
              for (const d of this.mapData.doors) {
                const tipX = d.x + Math.cos(d.baseAngle) * d.length;
                const tipY = d.y + Math.sin(d.baseAngle) * d.length;
                if (Physics.lineIntersectsSegment(a.x, a.y, b.x, b.y, d.x, d.y, tipX, tipY)) {
                  crossedDoorId = d.id;
                  break;
                }
              }
            }
            this.connect(a.id, b.id, crossedDoorId);
          }
        }

        // Optional explicit links are useful for intentionally long corridor
        // jumps while still keeping auto-connected local navigation.
        if (Array.isArray(def.edges)) {
          for (const e of def.edges) this.connect(e[0], e[1], e[2] || null);
        }
        return;
      }

      // -----------------------------------------------------------------------
      // 1. Boardroom & Cafeteria (Top-Left)
      // -----------------------------------------------------------------------
      this.addNode('boardroom_center', 300, 240, 'boardroom');
      this.addNode('boardroom_kitchen', 200, 160, 'boardroom');
      this.addNode('boardroom_high_table', 200, 310, 'boardroom');
      this.addNode('boardroom_door_east', 440, 240, 'boardroom');
      this.addNode('boardroom_door_south', 380, 360, 'boardroom');

      this.connect('boardroom_center', 'boardroom_kitchen');
      this.connect('boardroom_center', 'boardroom_high_table');
      this.connect('boardroom_center', 'boardroom_door_east');
      this.connect('boardroom_high_table', 'boardroom_door_south');

      // -----------------------------------------------------------------------
      // 2. North Hallway & Upper Open Space (Loop branch 1)
      // -----------------------------------------------------------------------
      this.addNode('hall_north_1', 480, 240, 'north_hall'); // Outside boardroom east door
      this.addNode('hall_north_2', 480, 150, 'north_hall');
      this.addNode('hall_north_3', 640, 150, 'north_hall');
      this.addNode('hall_north_4', 800, 150, 'north_hall');
      this.addNode('hall_north_5', 960, 150, 'north_hall');
      this.addNode('hall_north_6', 1120, 150, 'north_hall');
      this.addNode('hall_north_diag_turn', 1250, 220, 'north_hall');

      // Inter-desk aisles
      this.addNode('aisle_n_1', 615, 230, 'north_open_space');
      this.addNode('aisle_n_2', 775, 230, 'north_open_space');
      this.addNode('aisle_n_3', 935, 230, 'north_open_space');

      this.connect('boardroom_door_east', 'hall_north_1', 'door_boardroom_east');
      this.connect('hall_north_1', 'hall_north_2');
      this.connect('hall_north_2', 'hall_north_3');
      this.connect('hall_north_3', 'hall_north_4');
      this.connect('hall_north_4', 'hall_north_5');
      this.connect('hall_north_5', 'hall_north_6');
      this.connect('hall_north_6', 'hall_north_diag_turn');

      this.connect('hall_north_3', 'aisle_n_1');
      this.connect('hall_north_4', 'aisle_n_2');
      this.connect('hall_north_5', 'aisle_n_3');

      // -----------------------------------------------------------------------
      // 3. Central Focus Room Island Loops (North & South passages)
      // -----------------------------------------------------------------------
      this.addNode('focus_corridor_n1', 515, 330, 'focus_corridor');
      this.addNode('focus_corridor_n2', 620, 330, 'focus_corridor');
      this.addNode('focus_corridor_n3', 725, 330, 'focus_corridor');

      this.addNode('focus_corridor_s1', 515, 505, 'focus_corridor');
      this.addNode('focus_corridor_s2', 620, 505, 'focus_corridor');
      this.addNode('focus_corridor_s3', 725, 505, 'focus_corridor');

      this.addNode('focus_west_junction', 460, 420, 'junction');
      this.addNode('focus_east_junction', 780, 420, 'junction');

      // Focus Booth Interiors
      this.addNode('booth_1_inside', 515, 410, 'booth');
      this.addNode('booth_2_inside', 585, 410, 'booth');
      this.addNode('booth_3_inside', 655, 410, 'booth');
      this.addNode('booth_4_inside', 725, 410, 'booth');

      this.connect('focus_corridor_n1', 'booth_1_inside', 'door_booth_1');
      this.connect('focus_corridor_n2', 'booth_2_inside', 'door_booth_2');
      this.connect('focus_corridor_n2', 'booth_3_inside', 'door_booth_3');
      this.connect('focus_corridor_n3', 'booth_4_inside', 'door_booth_4');

      // Connect 360-degree loop around Focus Island
      this.connect('hall_north_1', 'focus_west_junction');
      this.connect('focus_west_junction', 'focus_corridor_n1');
      this.connect('focus_corridor_n1', 'focus_corridor_n2');
      this.connect('focus_corridor_n2', 'focus_corridor_n3');
      this.connect('focus_corridor_n3', 'focus_east_junction');

      this.connect('focus_west_junction', 'focus_corridor_s1');
      this.connect('focus_corridor_s1', 'focus_corridor_s2');
      this.connect('focus_corridor_s2', 'focus_corridor_s3');
      this.connect('focus_corridor_s3', 'focus_east_junction');

      // Connect inter-desk aisles into focus corridors
      this.connect('aisle_n_1', 'focus_corridor_n1');
      this.connect('aisle_n_2', 'focus_corridor_n2');
      this.connect('aisle_n_3', 'focus_corridor_n3');

      // -----------------------------------------------------------------------
      // 4. West Meeting Rooms (South-West)
      // -----------------------------------------------------------------------
      this.addNode('west_suite_1_inside', 280, 450, 'west_suite');
      this.addNode('west_suite_2_inside', 280, 580, 'west_suite');
      this.addNode('hall_west_1', 400, 420, 'west_hall');
      this.addNode('hall_west_2', 400, 560, 'west_hall');

      this.connect('boardroom_door_south', 'hall_west_1', 'door_boardroom_south');
      this.connect('hall_west_1', 'focus_west_junction');
      this.connect('hall_west_1', 'west_suite_1_inside', 'door_west_suite_1');
      this.connect('hall_west_1', 'hall_west_2');
      this.connect('hall_west_2', 'west_suite_2_inside', 'door_west_suite_2');

      // -----------------------------------------------------------------------
      // 5. South Open Space
      // -----------------------------------------------------------------------
      this.addNode('south_open_1', 520, 680, 'south_open_space');
      this.addNode('south_open_2', 680, 680, 'south_open_space');
      this.addNode('south_open_3', 840, 680, 'south_open_space');
      this.addNode('south_open_4', 1000, 680, 'south_open_space');
      this.addNode('south_pouf_corner', 1050, 740, 'south_open_space');

      this.connect('hall_west_2', 'south_open_1');
      this.connect('focus_corridor_s1', 'south_open_1');
      this.connect('focus_corridor_s2', 'south_open_2');
      this.connect('focus_corridor_s3', 'south_open_3');
      this.connect('south_open_1', 'south_open_2');
      this.connect('south_open_2', 'south_open_3');
      this.connect('south_open_3', 'south_open_4');
      this.connect('south_open_4', 'south_pouf_corner');

      // -----------------------------------------------------------------------
      // 6. Central Core Continuous 360-Degree Loop
      // -----------------------------------------------------------------------
      // West of Core (Connects North & South routes)
      this.addNode('core_west_lane', 780, 330, 'core_loop');
      this.connect('focus_east_junction', 'core_west_lane');
      this.connect('aisle_n_3', 'core_west_lane');

      // North of Core Lane
      this.addNode('core_north_lane_1', 920, 310, 'core_loop');
      this.addNode('core_north_lane_2', 1060, 310, 'core_loop');
      this.addNode('core_north_lane_3', 1200, 310, 'core_loop');

      this.connect('core_west_lane', 'core_north_lane_1');
      this.connect('core_north_lane_1', 'core_north_lane_2');
      this.connect('core_north_lane_2', 'core_north_lane_3');
      this.connect('hall_north_6', 'core_north_lane_3');
      this.connect('hall_north_diag_turn', 'core_north_lane_3');

      // South of Core Lane
      this.addNode('core_south_lane_1', 780, 540, 'core_loop');
      this.addNode('core_south_lane_2', 920, 540, 'core_loop');
      this.addNode('core_south_lane_3', 1060, 540, 'core_loop');
      this.addNode('core_south_lane_4', 1200, 540, 'core_loop');

      this.connect('focus_east_junction', 'core_south_lane_1');
      this.connect('core_south_lane_1', 'core_south_lane_2');
      this.connect('core_south_lane_2', 'core_south_lane_3');
      this.connect('core_south_lane_3', 'core_south_lane_4');
      this.connect('south_open_4', 'core_south_lane_3');

      // East Core Junction (Connects North and South around the Core!)
      this.addNode('core_east_bend_top', 1240, 360, 'core_loop');
      this.addNode('core_east_bend_mid', 1260, 450, 'core_loop');
      this.addNode('core_east_bend_bot', 1240, 540, 'core_loop');

      this.connect('core_north_lane_3', 'core_east_bend_top');
      this.connect('core_east_bend_top', 'core_east_bend_mid');
      this.connect('core_east_bend_mid', 'core_east_bend_bot');
      this.connect('core_east_bend_bot', 'core_south_lane_4');

      // Restroom Inside nodes
      this.addNode('core_restroom_men', 880, 400, 'restroom');
      this.addNode('core_restroom_women', 880, 480, 'restroom');
      this.connect('core_north_lane_1', 'core_restroom_men', 'door_core_north');
      this.connect('core_south_lane_2', 'core_restroom_women', 'door_core_south');

      // -----------------------------------------------------------------------
      // 7. Diagonal Wing - Upper Corridor & Executive Glass Suites
      // -----------------------------------------------------------------------
      this.addNode('diag_upper_1', 1350, 400, 'diag_upper');
      this.addNode('diag_upper_2', 1550, 600, 'diag_upper');
      this.addNode('diag_upper_3', 1750, 800, 'diag_upper');
      this.addNode('diag_upper_4', 1950, 1000, 'diag_upper');
      this.addNode('diag_upper_5', 2150, 1200, 'diag_upper');

      this.connect('core_east_bend_top', 'diag_upper_1');
      this.connect('diag_upper_1', 'diag_upper_2');
      this.connect('diag_upper_2', 'diag_upper_3');
      this.connect('diag_upper_3', 'diag_upper_4');
      this.connect('diag_upper_4', 'diag_upper_5');

      // Executive Suites Interiors
      this.addNode('suite_1_inside', 1400, 360, 'executive_suite');
      this.addNode('suite_2_inside', 1600, 560, 'executive_suite');
      this.addNode('suite_3_inside', 1800, 760, 'executive_suite');
      this.addNode('suite_4_inside', 2000, 960, 'executive_suite');

      this.connect('diag_upper_1', 'suite_1_inside', 'door_suite_1');
      this.connect('diag_upper_2', 'suite_2_inside', 'door_suite_2');
      this.connect('diag_upper_3', 'suite_3_inside', 'door_suite_3');
      this.connect('diag_upper_4', 'suite_4_inside', 'door_suite_4');

      // -----------------------------------------------------------------------
      // 8. Diagonal Wing - Central Shaft & Lower Corridor Loop
      // -----------------------------------------------------------------------
      // Lower Diagonal Corridor
      this.addNode('diag_lower_1', 1320, 680, 'diag_lower');
      this.addNode('diag_lower_2', 1440, 800, 'diag_lower');
      this.addNode('diag_lower_3', 1560, 920, 'diag_lower');
      this.addNode('diag_lower_4', 1680, 1040, 'diag_lower');
      this.addNode('diag_lower_5', 1800, 1160, 'diag_lower');

      this.connect('core_east_bend_bot', 'diag_lower_1');
      this.connect('diag_lower_1', 'diag_lower_2');
      this.connect('diag_lower_2', 'diag_lower_3');
      this.connect('diag_lower_3', 'diag_lower_4');
      this.connect('diag_lower_4', 'diag_lower_5');

      // Connecting Bypasses across Diagonal Core
      this.connect('diag_upper_1', 'diag_lower_1'); // Pre-core bypass
      this.connect('diag_upper_4', 'diag_lower_5'); // Post-core bypass

      // -----------------------------------------------------------------------
      // 9. Lower Large Conference Hub
      // -----------------------------------------------------------------------
      this.addNode('conference_hub_door_node', 1600, 1120, 'diag_lower');
      this.addNode('conference_hub_inside', 1510, 1280, 'conference_hub');
      this.addNode('conference_hub_west_corner', 1400, 1280, 'conference_hub');

      this.connect('diag_lower_4', 'conference_hub_door_node');
      this.connect('conference_hub_door_node', 'conference_hub_inside', 'door_conference_hub');
      this.connect('conference_hub_inside', 'conference_hub_west_corner');

      // -----------------------------------------------------------------------
      // 10. Reception & VISEO Lounge
      // -----------------------------------------------------------------------
      this.addNode('reception_approach', 1880, 1260, 'reception');
      this.addNode('reception_desk_node', 1860, 1380, 'reception');
      this.addNode('reception_feature_wall', 1980, 1340, 'reception');
      this.addNode('reception_sofa_lounge', 2040, 1420, 'reception');
      this.addNode('reception_armchair', 1980, 1480, 'reception');
      this.addNode('reception_elevators_player', 2150, 1480, 'reception');

      this.connect('diag_upper_5', 'reception_approach');
      this.connect('diag_lower_5', 'reception_approach');
      this.connect('reception_approach', 'reception_desk_node');
      this.connect('reception_approach', 'reception_feature_wall');
      this.connect('reception_desk_node', 'reception_sofa_lounge');
      this.connect('reception_sofa_lounge', 'reception_armchair');
      this.connect('reception_sofa_lounge', 'reception_elevators_player');
    }

    buildPatrolRoutes() {
      const def = this.mapData && this.mapData.navGraphDefinition;
      if (def && def.patrolRoutes) {
        for (const [name, route] of Object.entries(def.patrolRoutes)) {
          this.patrolRoutes.set(name, route.slice());
        }
        return;
      }

      // 360-degree Central Core Laps (Counter-Clockwise)
      this.patrolRoutes.set('loop_core_counter_clockwise', [
        'core_west_lane',
        'core_north_lane_1',
        'core_north_lane_2',
        'core_north_lane_3',
        'core_east_bend_top',
        'core_east_bend_mid',
        'core_east_bend_bot',
        'core_south_lane_4',
        'core_south_lane_3',
        'core_south_lane_2',
        'core_south_lane_1'
      ]);

      // 360-degree Central Core Laps (Clockwise)
      this.patrolRoutes.set('loop_core_clockwise', [
        'core_south_lane_1',
        'core_south_lane_2',
        'core_south_lane_3',
        'core_south_lane_4',
        'core_east_bend_bot',
        'core_east_bend_mid',
        'core_east_bend_top',
        'core_north_lane_3',
        'core_north_lane_2',
        'core_north_lane_1',
        'core_west_lane'
      ]);

      // 360-degree Focus Room Island Loop
      this.patrolRoutes.set('loop_focus_island', [
        'focus_west_junction',
        'focus_corridor_n1',
        'focus_corridor_n2',
        'focus_corridor_n3',
        'focus_east_junction',
        'focus_corridor_s3',
        'focus_corridor_s2',
        'focus_corridor_s1'
      ]);

      // Reception Patrol
      this.patrolRoutes.set('patrol_reception', [
        'reception_approach',
        'reception_desk_node',
        'reception_sofa_lounge',
        'reception_armchair',
        'reception_feature_wall'
      ]);

      // Diagonal Wing Lower Hub Patrol
      this.patrolRoutes.set('patrol_diag_lower', [
        'diag_lower_1',
        'diag_lower_2',
        'diag_lower_3',
        'diag_lower_4',
        'diag_lower_5',
        'diag_upper_4',
        'diag_upper_3',
        'diag_upper_2',
        'diag_upper_1'
      ]);

      // South Open Space Hallway Patrol
      this.patrolRoutes.set('patrol_south_hall', [
        'south_open_1',
        'south_open_2',
        'south_open_3',
        'south_open_4',
        'south_pouf_corner',
        'south_open_4',
        'south_open_3',
        'south_open_2'
      ]);
    }

    findNearestNode(x, y, maxDistance = 500) {
      let closest = null;
      let closestDistSq = maxDistance * maxDistance;

      for (const node of this.nodes.values()) {
        const dx = node.x - x;
        const dy = node.y - y;
        const distSq = dx * dx + dy * dy;
        if (distSq < closestDistSq) {
          // Verify line of sight to candidate node
          if (hasTraversalLineOfSight(this.mapData, { x, y }, node, {ignoreDoors:true,seeThroughGlass:false})) {
            closestDistSq = distSq;
            closest = node;
          }
        }
      }

      // Fallback to purely geometric closest if LOS check was fully obstructed by small obstacle
      if (!closest) {
        let bestDistSq = Infinity;
        for (const node of this.nodes.values()) {
          const dx = node.x - x;
          const dy = node.y - y;
          const distSq = dx * dx + dy * dy;
          if (distSq < bestDistSq) {
            bestDistSq = distSq;
            closest = node;
          }
        }
      }

      return closest;
    }

    /**
     * A* Search Algorithm
     */
    findPath(startX, startY, targetX, targetY, options = {}) {
      // 1. Check direct Line of Sight shortcut first
      if (hasTraversalLineOfSight(this.mapData, { x: startX, y: startY }, { x: targetX, y: targetY }, {ignoreDoors:true,seeThroughGlass:false})) {
        return [
          { x: startX, y: startY },
          { x: targetX, y: targetY }
        ];
      }

      const startNode = this.findNearestNode(startX, startY);
      const targetNode = this.findNearestNode(targetX, targetY);

      if (!startNode || !targetNode) return null;
      if (startNode === targetNode) {
        return [
          { x: startX, y: startY },
          { x: startNode.x, y: startNode.y },
          { x: targetX, y: targetY }
        ];
      }

      const openSet = new Set([startNode]);
      const cameFrom = new Map();

      const gScore = new Map();
      gScore.set(startNode, 0);

      const fScore = new Map();
      fScore.set(startNode, Math.hypot(startNode.x - targetNode.x, startNode.y - targetNode.y));

      while (openSet.size > 0) {
        let current = null;
        let lowestF = Infinity;

        for (const node of openSet) {
          const f = fScore.get(node) || Infinity;
          if (f < lowestF) {
            lowestF = f;
            current = node;
          }
        }

        if (current === targetNode) {
          // Reconstruct path
          const rawPath = [];
          let curr = current;
          while (curr) {
            rawPath.unshift({ x: curr.x, y: curr.y, node: curr });
            curr = cameFrom.get(curr);
          }

          rawPath.unshift({ x: startX, y: startY });
          rawPath.push({ x: targetX, y: targetY });

          // Smooth and string-pull path
          return this.smoothPath(rawPath);
        }

        openSet.delete(current);
        const currentG = gScore.get(current) || 0;

        for (const neighborEdge of current.neighbors) {
          const neighbor = neighborEdge.node;
          let weight = neighborEdge.baseDist;

          // Add dynamic cost for doors
          if (neighborEdge.door) {
            if (neighborEdge.door.isLocked) {
              weight += 10000; // impassable
            } else if (!neighborEdge.door.isOpen()) {
              weight += 30; // small cost to push/kick open
            }
          }

          // Optional avoidance heuristic for flanking
          if (options.avoidNode && neighbor === options.avoidNode) {
            weight += 1000;
          }

          const tentativeG = currentG + weight;
          const prevG = gScore.has(neighbor) ? gScore.get(neighbor) : Infinity;
          if (tentativeG < prevG) {
            cameFrom.set(neighbor, current);
            gScore.set(neighbor, tentativeG);
            const h = Math.hypot(neighbor.x - targetNode.x, neighbor.y - targetNode.y);
            fScore.set(neighbor, tentativeG + h);
            openSet.add(neighbor);
          }
        }
      }

      return null; // No path found
    }

    /**
     * Path smoothing (String Pulling via Raycast LOS)
     */
    smoothPath(path) {
      if (!path || path.length <= 2) return path;

      const smoothed = [path[0]];
      let currentIndex = 0;

      while (currentIndex < path.length - 1) {
        let furthestVisibleIndex = currentIndex + 1;

        for (let i = path.length - 1; i > currentIndex + 1; i--) {
          if (hasTraversalLineOfSight(this.mapData, path[currentIndex], path[i], {ignoreDoors:true,seeThroughGlass:false})) {
            furthestVisibleIndex = i;
            break;
          }
        }

        smoothed.push(path[furthestVisibleIndex]);
        currentIndex = furthestVisibleIndex;
      }

      return smoothed;
    }

    getPatrolRoute(routeName) {
      const nodeIds = this.patrolRoutes.get(routeName);
      if (!nodeIds) return null;
      return nodeIds.map(id => this.nodes.get(id)).filter(Boolean);
    }
  }

  return {
    NavNode,
    NavGraph
  };
}));
