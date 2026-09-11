/**
 * game.js - Core Game Runner & Interactive Demonstration for Hotline Miami: VISEO Arcade Edition
 */

(function () {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  // Camera & Viewport
  const camera = {
    x: 2150,
    y: 1480,
    zoom: 1.1,
    shake: 0,
    getBounds() {
      const halfW = (canvas.width * 0.5) / this.zoom;
      const halfH = (canvas.height * 0.5) / this.zoom;
      return {
        left: this.x - halfW,
        top: this.y - halfH,
        right: this.x + halfW,
        bottom: this.y + halfH
      };
    }
  };

  // Resize handling
  function resize() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // Initialize Map, Physics, Doors, Renderer & Pathfinding
  let mapData = MapData;
  let renderer = new MapRenderer(mapData);
  let navGraph = new Pathfinding.NavGraph(mapData);

  // Global game reference for debris callbacks
  window.game = {
    spawnDebris: (x, y, type, count, dirX, dirY) => {
      renderer.spawnDebris(x, y, type, count, dirX, dirY);
    }
  };

  // Player State
  const player = {
    x: mapData.spawnPoints.player.x,
    y: mapData.spawnPoints.player.y,
    angle: mapData.spawnPoints.player.angle,
    radius: 16,
    speed: 280,
    vx: 0,
    vy: 0,
    isDashing: false
  };

  // Enemy Entities
  let enemies = [];
  function initEnemies() {
    enemies = mapData.spawnPoints.enemies.map(sp => {
      let patrolNodes = [];
      if (sp.patrol) {
        patrolNodes = navGraph.getPatrolRoute(sp.patrol) || [];
      }
      return {
        id: sp.id,
        x: sp.x,
        y: sp.y,
        angle: sp.angle,
        radius: 16,
        type: sp.type,
        patrol: sp.patrol,
        patrolNodes: patrolNodes,
        patrolIndex: 0,
        speed: 120,
        state: 'patrol', // 'patrol', 'chase', 'stunned'
        stunTimer: 0,
        isEnemy: true,
        onDoorSlam: function(door, damage, pushX, pushY) {
          this.state = 'stunned';
          this.stunTimer = 2.5; // 2.5s stun
          this.x += pushX * 25;
          this.y += pushY * 25;
          renderer.addBloodPool(this.x, this.y, 18);
          stats.doorsKicked++;
        }
      };
    });
  }
  initEnemies();

  // Game Stats for HUD
  const stats = {
    glassShattered: 0,
    doorsKicked: 0,
    fps: 60
  };

  // Input Handling
  const keys = {};
  const mouse = { x: 0, y: 0, worldX: 0, worldY: 0, isDown: false };
  let showNavGraph = false;

  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if (e.key.toLowerCase() === 'g') {
      showNavGraph = !showNavGraph;
    }
    if (e.key.toLowerCase() === ' ' || e.key.toLowerCase() === 'space') {
      kickDoor();
    }
    if (e.key.toLowerCase() === 'r') {
      resetGame();
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      shootBullet();
    } else if (e.button === 2) {
      kickDoor();
    }
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function resetGame() {
    // Re-initialize map
    window.location.reload();
  }

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------
  function kickDoor() {
    const kickRange = 45;
    const kickDirX = Math.cos(player.angle);
    const kickDirY = Math.sin(player.angle);

    for (let i = 0; i < mapData.doors.length; i++) {
      const d = mapData.doors[i];
      if (d.shattered) continue;

      const tip = d.getTipPosition();
      const col = Physics.circleVsSegment(player.x, player.y, kickRange, d.x, d.y, tip.x, tip.y);
      if (col.collided) {
        d.kick(player, kickDirX, kickDirY, 24.0);
        camera.shake = 8;
        stats.doorsKicked++;
        break;
      }
    }
  }

  function shootBullet() {
    camera.shake = 4;
    const origin = new Physics.Vec2(player.x, player.y);
    const dir = new Physics.Vec2(Math.cos(player.angle), Math.sin(player.angle));

    // Cast ray piercing glass
    const result = Physics.castRay(mapData, origin, dir, 2000, { pierceGlass: true });

    // Shatter any pierced glass along the bullet trajectory
    if (result.piercedObjects && result.piercedObjects.length > 0) {
      for (let i = 0; i < result.piercedObjects.length; i++) {
        const obj = result.piercedObjects[i];
        if (obj.type === 'glass' && !obj.target.shattered) {
          obj.target.shatter(obj.point.x, obj.point.y, dir.x, dir.y);
          stats.glassShattered++;
        }
      }
    }

    if (result.hit) {
      if (result.type === 'glass' && !result.target.shattered) {
        result.target.shatter(result.point.x, result.point.y, dir.x, dir.y);
        stats.glassShattered++;
      } else if (result.type === 'wall' || result.type === 'prop') {
        renderer.addBulletHole(result.point.x, result.point.y, result.normal.x, result.normal.y);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Game Loop
  // ---------------------------------------------------------------------------
  let lastTime = performance.now();
  let frameCount = 0;
  let fpsTimer = 0;

  function gameLoop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // FPS calculation
    frameCount++;
    fpsTimer += dt;
    if (fpsTimer >= 0.5) {
      stats.fps = Math.round((frameCount / fpsTimer));
      frameCount = 0;
      fpsTimer = 0;
      updateHUD();
    }

    update(dt);
    render();

    requestAnimationFrame(gameLoop);
  }
  requestAnimationFrame(gameLoop);

  function update(dt) {
    // 1. Update Camera Shake
    if (camera.shake > 0) {
      camera.shake = Math.max(0, camera.shake - dt * 25);
    }

    // 2. Player Input & Movement
    let moveX = 0;
    let moveY = 0;

    if (keys['w'] || keys['arrowup']) moveY -= 1;
    if (keys['s'] || keys['arrowdown']) moveY += 1;
    if (keys['a'] || keys['arrowleft']) moveX -= 1;
    if (keys['d'] || keys['arrowright']) moveX += 1;

    const moveLen = Math.hypot(moveX, moveY);
    if (moveLen > 0) {
      moveX /= moveLen;
      moveY /= moveLen;
      player.vx = moveX * player.speed;
      player.vy = moveY * player.speed;
    } else {
      player.vx = 0;
      player.vy = 0;
    }

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // Player aim angle towards mouse cursor in world coordinates
    const halfW = canvas.width * 0.5;
    const halfH = canvas.height * 0.5;
    mouse.worldX = camera.x + (mouse.x - halfW) / camera.zoom;
    mouse.worldY = camera.y + (mouse.y - halfH) / camera.zoom;

    player.angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);

    // Resolve Player World Collisions (Walls, Desks, Glass, Doors)
    Physics.resolveEntityWorldCollisions(player, mapData, dt);

    // 3. Smooth Camera Follow
    camera.x += (player.x - camera.x) * 8 * dt;
    camera.y += (player.y - camera.y) * 8 * dt;

    // 4. Update Renderer (Door physics, Glass Shards, Decals)
    renderer.update(dt);

    // 5. Update Enemy AI (Patrolling around loops & Focus Island)
    updateEnemies(dt);
  }

  function updateEnemies(dt) {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];

      if (e.state === 'stunned') {
        e.stunTimer -= dt;
        if (e.stunTimer <= 0) {
          e.state = 'patrol';
        }
        continue;
      }

      if (e.patrolNodes && e.patrolNodes.length > 0) {
        const targetNode = e.patrolNodes[e.patrolIndex];
        const dx = targetNode.x - e.x;
        const dy = targetNode.y - e.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 20) {
          // Advance to next patrol waypoint in loop
          e.patrolIndex = (e.patrolIndex + 1) % e.patrolNodes.length;
        } else {
          const dirX = dx / dist;
          const dirY = dy / dist;
          e.vx = dirX * e.speed;
          e.vy = dirY * e.speed;
          e.x += e.vx * dt;
          e.y += e.vy * dt;
          e.angle = Math.atan2(dirY, dirX);
        }

        // Enemy collision against environment
        Physics.resolveEntityWorldCollisions(e, mapData, dt);
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Apply Camera Transform & Screen Shake
    const shakeOffsetX = (Math.random() - 0.5) * camera.shake;
    const shakeOffsetY = (Math.random() - 0.5) * camera.shake;

    ctx.translate(canvas.width * 0.5 + shakeOffsetX, canvas.height * 0.5 + shakeOffsetY);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // 1. Render Map Environment (Floors, Walls, Props, Decals, Doors, Mural)
    renderer.render(ctx, camera);

    // 2. Render Weapons on Ground
    renderWeapons(ctx);

    // 3. Render Enemies
    renderEnemies(ctx);

    // 4. Render Player
    renderPlayer(ctx);

    // 5. Render AI Waypoint Graph (if toggled via 'G')
    if (showNavGraph) {
      renderNavGraph(ctx);
    }

    ctx.restore();
  }

  function renderPlayer(ctx) {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);

    // Player Drop Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 4;

    // Body (Hotline Miami Varsity Letterman Jacket - Brown & White)
    ctx.fillStyle = '#b76e35';
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Arms
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(4, -13, 14, 6);
    ctx.fillRect(4, 7, 14, 6);

    // Hands
    ctx.fillStyle = '#f3c49e';
    ctx.beginPath();
    ctx.arc(17, -10, 3.5, 0, Math.PI * 2);
    ctx.arc(17, 10, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Mask / Head (Richard Rooster mask / Tiger Mask)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e74c3c'; // Rooster comb
    ctx.beginPath();
    ctx.arc(-2, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    // Reset shadow
    ctx.shadowColor = 'transparent';

    ctx.restore();
  }

  function renderEnemies(ctx) {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);

      // Enemy Drop Shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 3;

      // Enemy Body (White Suit Russian Mobster / Guard)
      ctx.fillStyle = e.state === 'stunned' ? '#808b96' : '#ecf0f1';
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // Arms & Weapon
      ctx.fillStyle = '#ecf0f1';
      ctx.fillRect(4, -12, 12, 5);
      ctx.fillRect(4, 7, 12, 5);

      // Black tie / collar
      ctx.fillStyle = '#111111';
      ctx.fillRect(-2, -2, 6, 4);

      // Head
      ctx.fillStyle = '#f3c49e';
      ctx.beginPath();
      ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  function renderWeapons(ctx) {
    if (!mapData.spawnPoints || !mapData.spawnPoints.weapons) return;
    for (let i = 0; i < mapData.spawnPoints.weapons.length; i++) {
      const w = mapData.spawnPoints.weapons[i];
      ctx.save();
      ctx.translate(w.x, w.y);

      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(-8, -2, 16, 4);
      ctx.restore();
    }
  }

  function renderNavGraph(ctx) {
    ctx.save();
    // Render Edges
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
    ctx.lineWidth = 1.5;
    for (const node of navGraph.nodes.values()) {
      for (const edge of node.neighbors) {
        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(edge.node.x, edge.node.y);
        ctx.stroke();
      }
    }

    // Render Nodes
    for (const node of navGraph.nodes.values()) {
      ctx.fillStyle = node.zone === 'core_loop' ? '#ff007f' : '#66fcf1';
      ctx.beginPath();
      ctx.arc(node.x, node.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function updateHUD() {
    document.getElementById('hud-fps').textContent = stats.fps;
    document.getElementById('hud-glass').textContent = stats.glassShattered;
    document.getElementById('hud-doors').textContent = stats.doorsKicked;

    // Detect current player zone
    let currentZoneName = 'Corridor';
    if (mapData.zones) {
      for (let i = 0; i < mapData.zones.length; i++) {
        const z = mapData.zones[i];
        if (isPointInPoly(player.x, player.y, z.polygon)) {
          currentZoneName = z.name;
          break;
        }
      }
    }
    document.getElementById('hud-zone').textContent = currentZoneName;
  }

  function isPointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

})();
