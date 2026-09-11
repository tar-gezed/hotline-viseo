/**
 * map_data.js - Plan-driven geometric model for Hotline Miami: VISEO Arcade Edition
 *
 * Canonical source: plan_materials.png
 *   black = exterior floor perimeter
 *   green = partitions
 *   blue  = glass
 *   red   = doors
 *   brown = desks / chairs
 *
 * The plan is authored in source-image pixels and converted to game-world units
 * through planToWorld(). Keeping one canonical coordinate system makes the map
 * directly comparable with the supplied floor plan and avoids hand-tuned drift.
 */

(function (root, factory) {
  const DoorsModule = (typeof window !== 'undefined' && window.Doors)
    ? window.Doors
    : ((typeof module === 'object' && module.exports && typeof require === 'function') ? require('./doors.js') : (root.Doors || null));
  const result = factory(DoorsModule);
  if (typeof define === 'function' && define.amd) {
    define(['./doors'], () => result);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = result;
  }
  if (typeof window !== 'undefined') window.MapData = result;
  root.MapData = result;
}(typeof self !== 'undefined' ? self : this, function (DoorsModule) {
  'use strict';

  const Door = DoorsModule ? DoorsModule.Door : null;
  const GlassPartition = DoorsModule ? DoorsModule.GlassPartition : null;

  // -------------------------------------------------------------------------
  // Plan coordinate system & physical scale
  // -------------------------------------------------------------------------
  // The previous useful footprint was ~2360 world units wide. The annotated
  // footprint is now ~3280 world units wide: ~39% larger while the player size
  // and movement speed are intentionally untouched.
  const PLAN_SCALE = 8.8;
  const PLAN_MIN_X = 20;
  const PLAN_MIN_Y = 11;
  const PLAN_MARGIN = 140;

  function planToWorld(x, y) {
    return {
      x: PLAN_MARGIN + (x - PLAN_MIN_X) * PLAN_SCALE,
      y: PLAN_MARGIN + (y - PLAN_MIN_Y) * PLAN_SCALE
    };
  }

  function worldToPlan(x, y) {
    return {
      x: PLAN_MIN_X + (x - PLAN_MARGIN) / PLAN_SCALE,
      y: PLAN_MIN_Y + (y - PLAN_MARGIN) / PLAN_SCALE
    };
  }

  function P(x, y) { return planToWorld(x, y); }
  function poly(points) { return points.map(([x, y]) => P(x, y)); }
  function wall(x1, y1, x2, y2, type = 'interior') {
    const a = P(x1, y1); const b = P(x2, y2);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, type };
  }
  function glass(id, x1, y1, x2, y2, thickness = 6) {
    const a = P(x1, y1); const b = P(x2, y2);
    return { id, x1: a.x, y1: a.y, x2: b.x, y2: b.y, thickness };
  }
  function planPoint(x, y, extra = {}) { return Object.assign(P(x, y), extra); }

  const PLAN_MAX_X = 393;
  const PLAN_MAX_Y = 286;
  const MAP_WIDTH = Math.ceil(PLAN_MARGIN * 2 + (PLAN_MAX_X - PLAN_MIN_X) * PLAN_SCALE);
  const MAP_HEIGHT = Math.ceil(PLAN_MARGIN * 2 + (PLAN_MAX_Y - PLAN_MIN_Y) * PLAN_SCALE);

  // -------------------------------------------------------------------------
  // Exact building envelope measured from the black contour in plan_materials
  // -------------------------------------------------------------------------
  const buildingFootprint = poly([
    [21, 13],
    [230, 13],
    [393, 196],
    [288, 286],
    [171, 150],
    [21, 119]
  ]);

  // -------------------------------------------------------------------------
  // Floor material regions. The complete footprint is always painted first.
  // These regions only add visual material differences seen in the references.
  // -------------------------------------------------------------------------
  const zones = [
    {
      id: 'west_social_area', name: 'West social / meeting area', type: 'wood_parquet',
      polygon: poly([[22, 16], [95, 16], [95, 67], [22, 67]])
    },
    {
      id: 'north_open_space', name: 'North open space', type: 'carpet_jade',
      polygon: poly([[94, 16], [230, 16], [269, 60], [214, 77], [184, 63], [94, 64]])
    },
    {
      id: 'west_open_space', name: 'West open space', type: 'carpet_grey',
      polygon: poly([[78, 64], [184, 63], [184, 105], [171, 150], [22, 118], [22, 92], [75, 92]])
    },
    {
      id: 'diagonal_upper', name: 'Diagonal glass suites', type: 'carpet_dark',
      polygon: poly([[214, 77], [269, 60], [393, 196], [369, 216], [283, 164]])
    },
    {
      id: 'diagonal_lower', name: 'Diagonal collaboration wing', type: 'carpet_lavender',
      polygon: poly([[184, 105], [214, 77], [283, 164], [369, 216], [288, 286], [171, 150]])
    },
    {
      id: 'focus_material_1', name: 'West focus room', type: 'carpet_dark',
      polygon: poly([[99,67],[126,67],[126,95],[99,90]])
    },
    {
      id: 'focus_material_2', name: 'Middle focus room', type: 'carpet_jade',
      polygon: poly([[126,67],[151,67],[145,101],[126,95]])
    },
    {
      id: 'focus_material_3', name: 'East focus room', type: 'carpet_dark',
      polygon: poly([[151,67],[187,67],[184,105],[145,101]])
    },
    {
      id: 'central_meeting_material', name: 'Glass meeting room', type: 'carpet_jade',
      polygon: poly([[281.400,159.659],[304.015,185.048],[284.600,202.341],[261.985,176.952]])
    },
    {
      id: 'meeting_accent', name: 'Meeting rooms', type: 'carpet_blue_accent',
      polygon: poly([[251.927, 243.103], [290.169, 210.892], [312.073, 236.897], [273.831, 269.108]])
    }
  ];

  // -------------------------------------------------------------------------
  // Structural walls
  // -------------------------------------------------------------------------
  // The service rooms share vertices with their real shell and partitions.
  const serviceCoreRooms = [
    { id: 'service_north', polygon: poly([[194,74],[210,74],[219,85],[224,91],[205,106],[194,85]]) },
    { id: 'service_middle', polygon: poly([[205,106],[224,91],[239,107],[220,116]]) },
    { id: 'service_south', polygon: poly([[220,116],[239,107],[248,116],[253,126],[248,145],[236,134]]) }
  ];

  const rawWalls = [
    // Exterior perimeter
    wall(21, 13, 230, 13, 'exterior'),
    wall(230, 13, 393, 196, 'exterior'),
    wall(393, 196, 288, 286, 'exterior'),
    wall(288, 286, 171, 150, 'exterior'),
    wall(171, 150, 21, 119, 'exterior'),
    wall(21, 119, 21, 13, 'exterior'),

    // A. West social area — clean closed separation between lounge and open space.
    wall(23, 67, 58, 67, 'interior'),
    wall(72, 67, 95, 67, 'interior'),

    // B. North open-space + focus rooms. The three rooms are now closed polygons
    // with explicit door gaps on their top/front edges.
    wall(99, 67, 111, 67, 'interior'),
    wall(120, 67, 126, 67, 'interior'),
    wall(99, 67, 99, 90, 'interior'),
    wall(99, 90, 126, 95, 'interior'),
    wall(126, 67, 126, 95, 'interior'),

    wall(126, 67, 138, 67, 'interior'),
    wall(145, 67, 151, 67, 'interior'),
    // Lower focus-room envelope: opaque wall -> real door opening -> glass.
    // The three pieces are collinear and meet at exact endpoints.
    wall(126, 95, 133, 97.210526, 'interior'),
    wall(151, 67, 145, 101, 'interior'),

    wall(151, 67, 163, 67, 'interior'),
    wall(171, 67, 187, 67, 'interior'),
    wall(145, 101, 184, 105, 'interior'),
    wall(187, 67, 184, 105, 'interior'),

    // C. South-west enclosed meeting room beside the desk islands.
    wall(160, 110, 178, 110, 'interior'),
    // The east side is split around the visible glass span so the same barrier
    // is never rendered or collided twice.
    wall(184, 110, 184, 116, 'interior'),
    wall(184, 134, 184, 142, 'interior'),
    wall(166, 142, 184, 142, 'interior'),
    wall(160, 110, 166, 142, 'interior'),

    // D. Central service core — rebuilt as continuous clean shells.
    // Pull the west face eastward to leave a body-sized circulation lane
    // between the focus rooms and the service core.
    wall(194, 74, 210, 74, 'core'),
    wall(210, 74, 219, 85, 'core'),
    wall(224, 91, 239, 107, 'core'),
    wall(239, 107, 248, 116, 'core'),
    wall(253, 126, 248, 145, 'core'),
    // This shortened return terminates at the closed lower-core door tip;
    // the remaining edge is the real interactive opening.
    wall(248, 145, 243.704, 141.061, 'core'),
    wall(236, 134, 220, 116, 'core'),
    wall(220, 116, 205, 106, 'core'),
    wall(205, 106, 194, 85, 'core'),
    wall(194, 85, 194, 74, 'core'),
    wall(205, 106, 224, 91, 'core'),
    wall(220, 116, 239, 107, 'core'),

    // D. Central glass meeting room is rendered from clean glass geometry below.

    // E. Diagonal offices are glass-fronted rectangles against the exterior facade.
    // Their side walls are glass and are defined in rawGlass so all five separators
    // are exactly perpendicular to the facade/front wall.

    // F. Lower-right meeting room: two clean solid short sides. The long sides
    // are glass and contain door openings defined below.
    wall(290.169, 210.892, 298.931, 221.294, 'interior'),
    wall(303.311, 226.495, 312.073, 236.897, 'interior'),
    wall(273.831, 269.108, 251.927, 243.103, 'interior')
  ];

  // -------------------------------------------------------------------------
  // Glass partitions — traced from the blue annotation.
  // -------------------------------------------------------------------------
  const rawGlass = [
    // West / north glazed separators and the phone-booth style room.
    glass('glass_social_east_upper', 95, 20, 95, 53),
    glass('glass_social_east_lower', 95, 60, 95, 67),
    glass('glass_social_link', 78, 52, 78, 79),
    glass('glass_west_south', 69, 122, 77, 93),
    glass('glass_north_divider_1', 152, 20, 152, 56),
    glass('glass_north_divider_2', 171, 23, 172, 51),
    glass('glass_phone_room_front', 183, 24, 183, 56),

    // Focus / meeting cluster accent glazing.
    glass('glass_focus_south', 139.285, 99.195, 145, 101),
    glass('glass_sw_meeting_front', 184, 116, 184, 134),

    // D. Clean rectangular glass meeting room (34 x 26 plan pixels, rotated
    // with the diagonal wing). One long side is split around its door opening.
    glass('glass_central_room_back', 281.400, 159.659, 304.015, 185.048),
    glass('glass_central_room_right', 304.015, 185.048, 284.600, 202.341),
    glass('glass_central_room_front_a', 284.600, 202.341, 278.946, 195.994),
    glass('glass_central_room_front_b', 272.162, 188.377, 261.985, 176.952),
    glass('glass_central_room_left', 261.985, 176.952, 281.400, 159.659),

    // E. Four regular rectangular glass offices. The five side separators are
    // perpendicular to both the exterior facade and the corridor-side front wall.
    glass('glass_office_sep_0', 321.110, 115.290, 290.000, 143.000),
    glass('glass_office_sep_1', 334.745, 130.598, 303.635, 158.308),
    glass('glass_office_sep_2', 348.380, 145.906, 317.270, 173.616),
    glass('glass_office_sep_3', 362.016, 161.214, 330.905, 188.924),
    glass('glass_office_sep_4', 375.651, 176.522, 344.540, 204.232),

    // Corridor-side glass fronts, split into two panes around each real door.
    glass('glass_office_front_1a', 290.000, 143.000, 294.500, 148.051),
    glass('glass_office_front_1b', 299.135, 153.257, 303.635, 158.308),
    glass('glass_office_front_2a', 303.635, 158.308, 308.135, 163.359),
    glass('glass_office_front_2b', 312.770, 168.565, 317.270, 173.616),
    glass('glass_office_front_3a', 317.270, 173.616, 321.770, 178.667),
    glass('glass_office_front_3b', 326.405, 183.873, 330.905, 188.924),
    glass('glass_office_front_4a', 330.905, 188.924, 335.405, 193.975),
    glass('glass_office_front_4b', 340.040, 199.181, 344.540, 204.232),

    // F. Clean lower-right room. Both long glass walls are split around a door;
    // no glass or wall crosses either desk anymore.
    glass('glass_lower_room_north_a', 251.927, 243.103, 268.744, 229.000),
    glass('glass_lower_room_north_b', 274.488, 224.180, 290.169, 210.892),
    glass('glass_lower_room_south_a', 312.073, 236.897, 295.257, 251.000),
    glass('glass_lower_room_south_b', 289.512, 255.820, 273.831, 269.108)
  ];

  // -------------------------------------------------------------------------
  // Render-only presentation metadata.  These records are deliberately kept
  // outside walls/props/nav data so visual dressing cannot alter collision or
  // pathfinding.  The E-office bay quads are authored directly from adjacent
  // separator segments rather than from the old broad diagonal guide wedge.
  // -------------------------------------------------------------------------
  const separatorById = rawGlass.reduce((lookup, partition) => {
    if (partition.id.startsWith('glass_office_sep_')) lookup[partition.id] = partition;
    return lookup;
  }, {});

  function makeExecutiveBay(index) {
    const start = separatorById[`glass_office_sep_${index}`];
    const end = separatorById[`glass_office_sep_${index + 1}`];
    const polygon = [
      { x: start.x1, y: start.y1 },
      { x: end.x1, y: end.y1 },
      { x: end.x2, y: end.y2 },
      { x: start.x2, y: start.y2 }
    ];

    const center = polygon.reduce((sum, point) => ({
      x: sum.x + point.x / polygon.length,
      y: sum.y + point.y / polygon.length
    }), { x: 0, y: 0 });
    const angle = Math.atan2(start.y2 - start.y1, start.x2 - start.x1);
    return {
      id: `executive_bay_${index}`,
      separatorStartId: start.id,
      separatorEndId: end.id,
      polygon,
      carpetColor: '#30434f',
      desk: {
        x: center.x - Math.cos(angle) * 40,
        y: center.y - Math.sin(angle) * 40,
        width: 154,
        height: 68,
        angle
      },
      chair: {
        x: center.x + Math.cos(angle + Math.PI * 0.5) * 58,
        y: center.y + Math.sin(angle + Math.PI * 0.5) * 58,
        radius: 11
      }
    };
  }

  const executiveOfficeBays = [0, 1, 2, 3].map(makeExecutiveBay);

  // -------------------------------------------------------------------------
  // Doors — center/angle measured from every red component inside the floorplan.
  // Door leaf size is deliberately capped so interaction proportions stay close
  // to the existing gameplay while openings are positioned like the real plan.
  // -------------------------------------------------------------------------
  function doorFromPlan(id, name, x1, y1, x2, y2, type = 'wood') {
    const a = P(x1, y1); const b = P(x2, y2);
    const srcLength = Math.hypot(x2 - x1, y2 - y1) * PLAN_SCALE;
    return {
      id, name,
      x: a.x, y: a.y,
      length: Math.max(58, Math.min(92, srcLength * 0.75)),
      baseAngle: Math.atan2(b.y - a.y, b.x - a.x),
      type,
      swingRange: Math.PI * 0.55
    };
  }

  const rawDoors = [
    doorFromPlan('door_west_cross', 'West cross door', 58, 67, 72, 67, 'wood'),
    doorFromPlan('door_west_vertical', 'West vertical glass door', 78, 79, 76, 91, 'glass'),
    doorFromPlan('door_west_north', 'West north glass door', 95, 53, 95, 60, 'glass'),

    doorFromPlan('door_focus_1', 'Focus room door 1', 111, 67, 120, 67, 'wood'),
    doorFromPlan('door_focus_2', 'Focus room door 2', 138, 67, 145, 67, 'wood'),
    doorFromPlan('door_focus_3', 'Focus room door 3', 163, 67, 171, 67, 'wood'),
    doorFromPlan('door_focus_lower', 'Focus room lower door', 133, 97.210526, 139.285, 99.195, 'wood'),
    doorFromPlan('door_sw_meeting', 'South-west meeting room door', 178, 110, 184, 110, 'wood'),

    doorFromPlan('door_core_upper', 'Core upper door', 219, 85, 224, 91, 'wood'),
    doorFromPlan('door_core_east', 'Core east door', 248, 116, 253, 126, 'wood'),
    doorFromPlan('door_core_lower', 'Core lower door', 236, 134, 248, 145, 'wood'),

    doorFromPlan('door_central_glass_room', 'Central glass meeting room', 278.946, 195.994, 272.162, 188.377, 'glass'),

    doorFromPlan('door_diag_office_1', 'Diagonal office door 1', 294.500, 148.051, 299.135, 153.257, 'glass'),
    doorFromPlan('door_diag_office_2', 'Diagonal office door 2', 308.135, 163.359, 312.770, 168.565, 'glass'),
    doorFromPlan('door_diag_office_3', 'Diagonal office door 3', 321.770, 178.667, 326.405, 183.873, 'glass'),
    doorFromPlan('door_diag_office_4', 'Diagonal office door 4', 335.405, 193.975, 340.040, 199.181, 'glass'),

    doorFromPlan('door_lower_room_north', 'Lower meeting room north door', 268.744, 229.000, 274.488, 224.180, 'glass'),
    doorFromPlan('door_lower_room_south', 'Lower meeting room south door', 295.257, 251.000, 289.512, 255.820, 'glass'),
    doorFromPlan('door_lower_reception', 'Lower reception access', 298.931, 221.294, 303.311, 226.495, 'wood')
  ];

  // -------------------------------------------------------------------------
  // Furniture — positions, dimensions and rotations derived from brown masks.
  // Rectangular furniture uses centered coordinates so rotated visuals and OBB
  // collision share the same origin.
  // -------------------------------------------------------------------------
  function centeredProp(id, type, cx, cy, widthPx, heightPx, angle = 0, extra = {}) {
    const c = P(cx, cy);
    const isFurnitureBlockingCharacters = /desk|table|sofa|armchair|chair|counter|printer|pod|pouf/i.test(type);
    // Do not enclose the empty space between decorative chairs in a solid box.
    const defaultCollisionPadX = 0;
    const defaultCollisionPadY = 0;
    return Object.assign({
      id, type, x: c.x, y: c.y,
      width: widthPx * PLAN_SCALE,
      height: heightPx * PLAN_SCALE,
      collisionWidth: (widthPx + (extra.collisionPadX ?? defaultCollisionPadX)) * PLAN_SCALE,
      collisionHeight: (heightPx + (extra.collisionPadY ?? defaultCollisionPadY)) * PLAN_SCALE,
      angle,
      centered: true,
      solid: isFurnitureBlockingCharacters,
      isCover: false,
      blocksBullets: false,
      color: '#d8b98a'
    }, extra);
  }

  const rawProps = [
    centeredProp('focus_table_1', 'conference_table_oval', 112, 81, 12, 7, 0.10, { chairs: 4, color: '#b8ab81' }),
    centeredProp('focus_table_2', 'conference_table_oval', 137, 88, 8, 6, 0.18, { chairs: 2, color: '#b8ab81' }),
    centeredProp('focus_table_3', 'conference_table_oval', 166, 86, 15, 9, 0.10, { chairs: 6, color: '#b8ab81' }),
    centeredProp('sw_meeting_table', 'conference_table_oval', 174, 128, 9, 12, 0, { chairs: 4, color: '#b8ab81' }),
    centeredProp('table_boardroom_west', 'conference_table_oval', 76.0, 37.5, 32.0, 17.0, 0, { chairs: 8, color: '#6d4c2b' }),
    centeredProp('desk_north_1', 'desk_cluster_6', 110.5, 37.0, 30.0, 13.0, -Math.PI / 2, { monitors: 6, chairs: 6 }),
    centeredProp('desk_north_2', 'desk_cluster_6', 136.5, 35.0, 30.0, 13.0, -Math.PI / 2, { monitors: 6, chairs: 6 }),
    centeredProp('desk_north_3', 'desk_cluster_6', 201.0, 36.0, 34.0, 16.0, -Math.PI / 2, { monitors: 6, chairs: 6 }),
    centeredProp('desk_north_diag_1', 'desk_cluster_4', 235.8, 42.9, 23.5, 16.8, -0.5404, { monitors: 4, chairs: 4 }),
    centeredProp('desk_north_diag_2', 'desk_cluster_6', 245.4, 63.5, 31.5, 17.5, -0.6747, { monitors: 6, chairs: 6 }),

    centeredProp('table_west_meeting', 'conference_table_oval', 45.5, 92.5, 17.0, 15.0, -Math.PI / 2, { chairs: 6, color: '#8b6a45' }),
    centeredProp('desk_west_1', 'desk_cluster_6', 85.1, 111.4, 29.3, 17.0, -1.3258, { monitors: 6, chairs: 6 }),
    centeredProp('table_west_small', 'conference_table_oval', 42.5, 113.0, 13.0, 12.0, 0, { chairs: 4, color: '#8b6a45' }),
    centeredProp('desk_west_2', 'desk_cluster_6', 109.3, 116.5, 27.8, 14.5, -1.3734, { monitors: 6, chairs: 6 }),
    centeredProp('desk_west_3', 'desk_cluster_4', 140.9, 127.5, 21.4, 16.1, -1.3734, { monitors: 4, chairs: 4 }),

    centeredProp('desk_mid_1', 'desk_cluster_4', 192.0, 150.5, 22.7, 17.5, -0.5880, { monitors: 4, chairs: 4 }),
    centeredProp('desk_mid_2', 'desk_cluster_6', 212.8, 166.6, 31.1, 16.9, -0.8124, { monitors: 6, chairs: 6 }),
    centeredProp('desk_mid_3', 'desk_cluster_6', 226.9, 183.3, 28.7, 14.2, -0.7266, { monitors: 6, chairs: 6 }),
    centeredProp('table_central_glass_room', 'conference_table_oval', 283.0, 181.0, 18.0, 8.0, 0.8431, { chairs: 6, color: '#b99463' }),
    centeredProp('desk_lower_1', 'desk_cluster_6', 277.81, 235.03, 31.4, 15.1, -0.70, { monitors: 6, chairs: 6 }),
    centeredProp('desk_lower_2', 'desk_cluster_4', 287.15, 246.12, 25.4, 13.0, -0.70, { monitors: 4, chairs: 4 }),

    // The two narrow brown objects at the far right are single executive desks.
    centeredProp('desk_right_1', 'executive_desk', 333.5, 213.5, 32.6, 7.0, 0.8330, { color: '#c6b087', monitors: 3 }),
    centeredProp('desk_right_2', 'executive_desk', 328.2, 221.3, 27.7, 7.0, 0.8380, { color: '#c6b087', monitors: 3 }),

    // Reference-image accents placed in clear circulation pockets, not replacing
    // the measured desk clusters above.
    centeredProp('printer_reference', 'printer_station', 166, 115, 5.0, 4.0, 0, { blocksBullets: true, color: '#f0f3f4' }),
    centeredProp('reception_counter_reference', 'reception_counter', 309, 244, 12.0, 5.0, -0.72, { blocksBullets: true, color: '#2c3e50' })
  ];

  for (const bay of executiveOfficeBays) {
    const pos = worldToPlan(bay.desk.x, bay.desk.y);
    const id = bay.id + '_desk';
    bay.collidableDeskId = id;
    rawProps.push(centeredProp(id, 'executive_desk', pos.x, pos.y,
      bay.desk.width / PLAN_SCALE, bay.desk.height / PLAN_SCALE,
      bay.desk.angle, { color: '#c6b087', monitors: 1 }));
  }

  const visualFixtures = {
    executiveOfficeBays,
    meetingAccent: {
      zoneId: 'meeting_accent',
      fillColor: '#427e86',
      strokeColor: '#70a09f',
      alpha: 0.78
    },
    westLounge: {
      // Reference-aligned social pocket: seating and a large VISEO plaque are
      // visual-only and intentionally absent from rawProps/collision metadata.
      loungeAnchor: planPoint(31, 40),
      mural: planPoint(31, 81, { angle: 0, width: 216, height: 62 }),
      sofaColor: '#22558a',
      cushionColor: '#3b78b5',
      accentColor: '#47d5e0'
    },
    reception: {
      elevatorBeacon: planPoint(367, 204, { radius: 45 }),
      label: 'RECEPTION'
    }
  };

  // -------------------------------------------------------------------------
  // Navigation nodes. Coordinates are in the exact same source-plan space.
  // Pathfinding auto-connects nodes when a straight segment is structurally
  // visible; the A* implementation itself remains unchanged.
  // -------------------------------------------------------------------------
  function pointInPolygonWorld(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i]; const b = polygon[j];
      const intersects = ((a.y > y) !== (b.y > y)) &&
        (x < (b.x - a.x) * (y - a.y) / ((b.y - a.y) || 1e-9) + a.x);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function distancePointToSegment(x, y, x1, y1, x2, y2) {
    const vx = x2 - x1; const vy = y2 - y1;
    const wx = x - x1; const wy = y - y1;
    const vv = vx * vx + vy * vy;
    const t = vv > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / vv)) : 0;
    return Math.hypot(x - (x1 + vx * t), y - (y1 + vy * t));
  }

  function distancePointToProp(x, y, prop) {
    const angle = -(prop.angle || 0);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const lx = (x - prop.x) * cos - (y - prop.y) * sin;
    const ly = (x - prop.x) * sin + (y - prop.y) * cos;
    const hw = (prop.collisionWidth || prop.width) * 0.5;
    const hh = (prop.collisionHeight || prop.height) * 0.5;
    const dx = Math.max(Math.abs(lx) - hw, 0);
    const dy = Math.max(Math.abs(ly) - hh, 0);
    return Math.hypot(dx, dy);
  }

  function buildPlanNavNodes() {
    const nodes = [];
    // An 18-plan-pixel lattice is dense enough to follow the narrow circulation
    // lanes while keeping A* substantially lighter than a tile grid.
    for (let sy = 20; sy <= 278; sy += 18) {
      for (let sx = 28; sx <= 386; sx += 18) {
        const p = P(sx, sy);
        if (!pointInPolygonWorld(p.x, p.y, buildingFootprint)) continue;

        // Keep waypoint centers at least one player-radius-ish distance away
        // from structural solids. Doors are intentionally not excluded here.
        let clear = true;
        for (const w of rawWalls) {
          if (distancePointToSegment(p.x, p.y, w.x1, w.y1, w.x2, w.y2) < 24) {
            clear = false; break;
          }
        }
        if (!clear) continue;
        for (const g of rawGlass) {
          if (distancePointToSegment(p.x, p.y, g.x1, g.y1, g.x2, g.y2) < 20) {
            clear = false; break;
          }
        }
        if (!clear) continue;
        for (const prop of rawProps) {
          if (!prop.solid) continue;
          if (distancePointToProp(p.x, p.y, prop) < 24) {
            clear = false; break;
          }
        }
        if (!clear) continue;

        nodes.push({ id: `grid_${sx}_${sy}`, x: p.x, y: p.y, zone: 'plan_grid' });
      }
    }

    const anchors = [
      ['anchor_west_social', 55, 55],
      ['anchor_west_junction', 86, 86],
      ['anchor_focus_lower', 118, 112],
      ['anchor_top_corridor_1', 110, 60],
      ['anchor_top_corridor_2', 140, 60],
      ['anchor_top_corridor_3', 170, 60],
      ['anchor_top_corridor_4', 200, 60],
      ['anchor_focus_mid', 156, 116],
      ['anchor_core_west', 194, 116],
      ['anchor_core_southwest', 205, 158],
      ['anchor_core_south', 232, 182],
      ['anchor_diag_1', 255, 160],
      ['anchor_diag_2', 276, 150],
      ['anchor_diag_3', 294, 166],
      ['anchor_diag_4', 313, 182],
      ['anchor_diag_5', 333, 194],
      ['anchor_reception_lane', 346, 214],
      ['anchor_reception_center', 320, 228],
      ['grid_352_200', 352, 200],
      // Missing grid references kept alive explicitly for patrol loops.
      ['grid_226_182', 226, 182],
      ['grid_208_164', 208, 164],
      ['grid_190_146', 190, 146],
      ['grid_118_56', 118, 56],
      ['grid_118_110', 118, 110],
      ['grid_100_110', 100, 110],
      ['grid_82_92', 82, 92],
      ['grid_316_218', 316, 218],
      ['grid_334_218', 334, 218],
      ['grid_280_218', 280, 218],
      ['grid_172_110', 172, 110],
      ['grid_298_218', 298, 218],
      ['grid_334_200', 334, 200],
      ['grid_316_182', 316, 182],
      ['grid_82_110', 82, 110],
      ['grid_100_128', 100, 128],
      ['grid_118_128', 118, 128],
      ['grid_136_128', 136, 128]
    ];
    for (const [id, px, py] of anchors) {
      const p = P(px, py);
      nodes.push({ id, x: p.x, y: p.y, zone: 'anchor' });
    }
    return nodes;
  }

  const navGraphDefinition = {
    nodes: buildPlanNavNodes(),
    autoConnectDistance: 280,
    patrolRoutes: {
      loop_core_counter_clockwise: [
        'grid_190_110', 'grid_208_128', 'grid_226_146', 'grid_244_164',
        'grid_226_182', 'grid_208_164', 'grid_190_146', 'anchor_focus_mid'
      ],
      loop_core_clockwise: [
        'anchor_focus_mid', 'grid_190_146', 'grid_208_164', 'grid_226_182',
        'grid_244_164', 'grid_226_146', 'grid_208_128', 'grid_190_110'
      ],
      loop_focus_island: [
        'grid_100_56', 'grid_118_56', 'grid_136_56', 'grid_172_110',
        'grid_154_110', 'grid_136_110', 'grid_118_110', 'grid_100_110', 'grid_82_92'
      ],
      patrol_reception: [
        'grid_298_218', 'grid_316_218', 'grid_334_218', 'grid_352_200',
        'grid_334_200', 'grid_316_200'
      ],
      patrol_diag_lower: [
        'grid_208_164', 'grid_226_182', 'grid_244_200', 'grid_262_218',
        'grid_280_218', 'grid_298_200', 'grid_316_182'
      ],
      patrol_south_hall: [
        'grid_82_110', 'grid_100_128', 'grid_118_128', 'grid_136_128',
        'grid_154_128', 'anchor_focus_mid', 'grid_190_146'
      ]
    }
  };

  // -------------------------------------------------------------------------
  // Spatial gameplay placements. Types/counts/rules are preserved; only map
  // coordinates move to clear positions in the reconstructed floor.
  // -------------------------------------------------------------------------
  const playerSpawn = planPoint(360, 205, { angle: -2.35 });
  const extractionElevator = Object.assign(planPoint(367, 204), { radius: 45 });

  const spawnLocations = [
    planPoint(360, 205, { id: 'spawn_reception_elevators', type: 'elevator', name: 'East arrival', angle: -2.35 }),
    planPoint(55, 55, { id: 'spawn_west_meeting', type: 'cafeteria', name: 'West meeting area', angle: 0 }),
    planPoint(205, 55, { id: 'spawn_north_open', type: 'elevator', name: 'North open space', angle: Math.PI * 0.5 }),
    planPoint(55, 106, { id: 'spawn_west_exit', type: 'stairwell', name: 'West fire exit', angle: 0 }),
    planPoint(310, 150, { id: 'spawn_diagonal_suites', type: 'executive', name: 'Glass suites corridor', angle: Math.PI * 0.75 }),
    planPoint(270, 220, { id: 'spawn_conference_hub', type: 'conference', name: 'Lower conference hub', angle: -Math.PI * 0.5 })
  ];

  const crateLocations = [
    Object.assign(planPoint(58, 58), { area: 'West meeting floor' }),
    Object.assign(planPoint(336, 225), { area: 'East lounge corridor' }),
    Object.assign(planPoint(270, 220), { area: 'Lower conference hub' }),
    Object.assign(planPoint(155, 135), { area: 'West open space' })
  ];

  const enemies = [
    planPoint(342, 213, { id: 'e1', angle: Math.PI, type: 'guard_pistol', patrol: 'patrol_reception' }),
    planPoint(320, 230, { id: 'e2', angle: -Math.PI * 0.5, type: 'guard_bat', patrol: null }),
    planPoint(318, 184, { id: 'e3', angle: -Math.PI * 0.75, type: 'guard_shotgun', patrol: 'patrol_diag_lower' }),
    planPoint(278, 217, { id: 'e4', angle: 0, type: 'guard_uzi', patrol: null }),
    planPoint(300, 250, { id: 'e5', angle: Math.PI * 0.25, type: 'guard_pistol', patrol: null }),
    planPoint(252, 196, { id: 'e6', angle: -Math.PI * 0.75, type: 'guard_shotgun', patrol: 'patrol_diag_lower' }),
    planPoint(241, 173, { id: 'e7', angle: -Math.PI * 0.25, type: 'guard_knife', patrol: null }),
    planPoint(270, 112, { id: 'e8', angle: Math.PI * 0.75, type: 'guard_pistol', patrol: null }),
    planPoint(306, 147, { id: 'e9', angle: Math.PI * 0.75, type: 'guard_katana', patrol: null }),
    planPoint(344, 184, { id: 'e10', angle: -Math.PI * 0.25, type: 'guard_uzi', patrol: null }),
    planPoint(224, 98, { id: 'e11', angle: Math.PI, type: 'guard_rifle', patrol: 'loop_core_counter_clockwise' }),
    planPoint(205, 133, { id: 'e12', angle: 0, type: 'guard_shotgun', patrol: 'loop_core_clockwise' }),
    planPoint(129, 133, { id: 'e13', angle: -Math.PI * 0.5, type: 'guard_bat', patrol: null }),
    planPoint(158, 141, { id: 'e14', angle: 0, type: 'guard_pistol', patrol: 'patrol_south_hall' }),
    planPoint(181, 127, { id: 'e15', angle: Math.PI, type: 'guard_uzi', patrol: null }),
    planPoint(140, 78, { id: 'e16', angle: Math.PI, type: 'guard_knife', patrol: 'loop_focus_island' }),
    planPoint(101.5, 100, { id: 'e17', angle: -Math.PI * 0.5, type: 'guard_pistol', patrol: null }),
    planPoint(70.5, 108, { id: 'e18', angle: 0, type: 'guard_bat', patrol: null }),
    planPoint(55, 82, { id: 'e19', angle: -Math.PI * 0.5, type: 'guard_shotgun', patrol: null }),
    planPoint(72, 55, { id: 'e20', angle: Math.PI * 0.5, type: 'boss_executive', patrol: null }),
    planPoint(112, 58, { id: 'e21', angle: 0, type: 'guard_rifle', patrol: null }),
    planPoint(176, 57, { id: 'e22', angle: -Math.PI * 0.5, type: 'guard_knife', patrol: null })
  ];

  const weapons = [
    planPoint(353, 210, { type: 'pipe' }),
    planPoint(365, 200, { type: 'pistol' }),
    planPoint(332, 232, { type: 'baseball_bat' }),
    planPoint(310, 247, { type: 'katana' }),
    planPoint(270, 220, { type: 'shotgun' }),
    planPoint(136, 80, { type: 'uzi' }),
    planPoint(58, 84, { type: 'pistol' }),
    planPoint(165, 137, { type: 'baseball_bat' }),
    planPoint(80, 58, { type: 'assault_rifle' })
  ];

  const level = {
    MAP_WIDTH,
    MAP_HEIGHT,
    PLAN_SCALE,
    planReference: {
      source: 'plan_materials.png',
      sourceSize: { width: 559, height: 287 },
      floorBounds: { minX: PLAN_MIN_X, minY: PLAN_MIN_Y, maxX: PLAN_MAX_X, maxY: PLAN_MAX_Y },
      worldMargin: PLAN_MARGIN
    },
    planToWorld,
    worldToPlan,
    buildingFootprint,
    serviceCoreRooms,
    zones,
    walls: rawWalls,
    glassPartitions: GlassPartition ? rawGlass.map(g => new GlassPartition(g)) : rawGlass,
    doors: Door ? rawDoors.map(d => new Door(d)) : rawDoors,
    props: rawProps,
    visualFixtures,
    navGraphDefinition,
    viseoMuralAnchor: planPoint(315, 241, { angle: -0.72 }),
    playerSpawn,
    extractionElevator,
    spawnLocations,
    crateLocations,
    enemies,
    weapons,
    spawnPoints: {
      player: playerSpawn,
      enemies,
      weapons,
      spawnLocations,
      crateLocations,
      extractionElevator
    }
  };

  return level;
}));
