/**
 * physics.js - 2D Physics Engine for Hotline Miami: VISEO Arcade Edition
 * Includes Vector2D, Circle/Segment/OBB/AABB collision, Raycasting, Door sweep physics, and Glass fracture.
 */

(function (root, factory) {
  const result = factory();
  if (typeof define === 'function' && define.amd) {
    define([], () => result);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = result;
  }
  if (typeof window !== 'undefined') {
    window.Physics = result;
  }
  root.Physics = result;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Vector2D Helper
  // ---------------------------------------------------------------------------
  class Vec2 {
    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
    }

    set(x, y) {
      this.x = x;
      this.y = y;
      return this;
    }

    clone() {
      return new Vec2(this.x, this.y);
    }

    copy(v) {
      this.x = v.x;
      this.y = v.y;
      return this;
    }

    add(v) {
      this.x += v.x;
      this.y += v.y;
      return this;
    }

    sub(v) {
      this.x -= v.x;
      this.y -= v.y;
      return this;
    }

    scale(s) {
      this.x *= s;
      this.y *= s;
      return this;
    }

    dot(v) {
      return this.x * v.x + this.y * v.y;
    }

    cross(v) {
      return this.x * v.y - this.y * v.x;
    }

    lenSq() {
      return this.x * this.x + this.y * this.y;
    }

    len() {
      return Math.sqrt(this.lenSq());
    }

    normalize() {
      const l = this.len();
      if (l > 1e-6) {
        this.x /= l;
        this.y /= l;
      } else {
        this.x = 0;
        this.y = 0;
      }
      return this;
    }

    distSq(v) {
      const dx = this.x - v.x;
      const dy = this.y - v.y;
      return dx * dx + dy * dy;
    }

    dist(v) {
      return Math.sqrt(this.distSq(v));
    }

    angle() {
      return Math.atan2(this.y, this.x);
    }

    rotate(radians) {
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const rx = this.x * cos - this.y * sin;
      const ry = this.x * sin + this.y * cos;
      this.x = rx;
      this.y = ry;
      return this;
    }

    static fromAngle(radians, length = 1) {
      return new Vec2(Math.cos(radians) * length, Math.sin(radians) * length);
    }

    static add(a, b) {
      return new Vec2(a.x + b.x, a.y + b.y);
    }

    static sub(a, b) {
      return new Vec2(a.x - b.x, a.y - b.y);
    }

    static scale(a, s) {
      return new Vec2(a.x * s, a.y * s);
    }

    static dist(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    static lerp(a, b, t) {
      return new Vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    }
  }

  // ---------------------------------------------------------------------------
  // Math & Geometry Utilities
  // ---------------------------------------------------------------------------
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  function closestPointOnSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const abLenSq = abx * abx + aby * aby;
    if (abLenSq < 1e-8) {
      return { x: ax, y: ay, t: 0 };
    }
    const t = clamp((apx * abx + apy * aby) / abLenSq, 0, 1);
    return {
      x: ax + abx * t,
      y: ay + aby * t,
      t: t
    };
  }

  function pointLineDistanceSq(px, py, ax, ay, bx, by) {
    const cp = closestPointOnSegment(px, py, ax, ay, bx, by);
    const dx = px - cp.x;
    const dy = py - cp.y;
    return dx * dx + dy * dy;
  }

  function segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    if (Math.abs(denom) < 1e-8) return null;

    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
    const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
      return {
        x: x1 + ua * (x2 - x1),
        y: y1 + ua * (y2 - y1),
        fractionA: ua,
        fractionB: ub
      };
    }
    return null;
  }

  function raySegmentIntersection(rayOrigin, rayDir, maxDist, ax, ay, bx, by) {
    const rdx = rayDir.x * maxDist;
    const rdy = rayDir.y * maxDist;
    const hit = segmentsIntersect(
      rayOrigin.x, rayOrigin.y,
      rayOrigin.x + rdx, rayOrigin.y + rdy,
      ax, ay, bx, by
    );
    if (hit) {
      const dist = hit.fractionA * maxDist;
      const segDx = bx - ax;
      const segDy = by - ay;
      let nx = -segDy;
      let ny = segDx;
      const nlen = Math.hypot(nx, ny);
      if (nlen > 1e-6) {
        nx /= nlen;
        ny /= nlen;
      }
      if (nx * rayDir.x + ny * rayDir.y > 0) {
        nx = -nx;
        ny = -ny;
      }
      return {
        point: new Vec2(hit.x, hit.y),
        normal: new Vec2(nx, ny),
        distance: dist,
        fraction: hit.fractionA,
        segmentT: hit.fractionB
      };
    }
    return null;
  }

  function raycastWalls(x1, y1, x2, y2, walls) {
    if (!walls || !Array.isArray(walls)) return null;
    let closestHit = null;
    let minT = 1.0001;

    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (!w) continue;
      const wx1 = w.x1 !== undefined ? w.x1 : w.x;
      const wy1 = w.y1 !== undefined ? w.y1 : w.y;
      const wx2 = w.x2 !== undefined ? w.x2 : (w.x + (w.width || 0));
      const wy2 = w.y2 !== undefined ? w.y2 : (w.y + (w.height || 0));

      const hit = segmentsIntersect(x1, y1, x2, y2, wx1, wy1, wx2, wy2);
      if (hit && hit.fractionA < minT) {
        minT = hit.fractionA;
        const segDx = wx2 - wx1;
        const segDy = wy2 - wy1;
        let nx = -segDy;
        let ny = segDx;
        const nlen = Math.hypot(nx, ny) || 1;
        nx /= nlen;
        ny /= nlen;
        const rayDx = x2 - x1;
        const rayDy = y2 - y1;
        if (nx * rayDx + ny * rayDy > 0) {
          nx = -nx;
          ny = -ny;
        }
        closestHit = {
          hit: true,
          point: new Vec2(hit.x, hit.y),
          normal: new Vec2(nx, ny),
          fraction: hit.fractionA,
          t: hit.fractionA
        };
      }
    }
    return closestHit;
  }

  // ---------------------------------------------------------------------------
  // Collision Detection Functions
  // ---------------------------------------------------------------------------

  function circleVsSegment(cx, cy, radius, ax, ay, bx, by) {
    const cp = closestPointOnSegment(cx, cy, ax, ay, bx, by);
    const dx = cx - cp.x;
    const dy = cy - cp.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < radius * radius && distSq > 1e-9) {
      const dist = Math.sqrt(distSq);
      const overlap = radius - dist;
      const nx = dx / dist;
      const ny = dy / dist;
      return {
        collided: true,
        penetration: overlap,
        normal: new Vec2(nx, ny),
        contactPoint: new Vec2(cp.x, cp.y),
        pushX: nx * overlap,
        pushY: ny * overlap
      };
    } else if (distSq <= 1e-9) {
      const segDx = bx - ax;
      const segDy = by - ay;
      let nx = -segDy;
      let ny = segDx;
      const l = Math.hypot(nx, ny);
      if (l > 1e-6) { nx /= l; ny /= l; } else { nx = 1; ny = 0; }
      return {
        collided: true,
        penetration: radius,
        normal: new Vec2(nx, ny),
        contactPoint: new Vec2(cx, cy),
        pushX: nx * radius,
        pushY: ny * radius
      };
    }
    return { collided: false, penetration: 0, pushX: 0, pushY: 0 };
  }

  function circleVsAABB(cx, cy, radius, boxX, boxY, boxW, boxH) {
    const closestX = clamp(cx, boxX, boxX + boxW);
    const closestY = clamp(cy, boxY, boxY + boxH);

    const dx = cx - closestX;
    const dy = cy - closestY;
    const distSq = dx * dx + dy * dy;

    if (distSq < radius * radius && distSq > 1e-9) {
      const dist = Math.sqrt(distSq);
      const overlap = radius - dist;
      const nx = dx / dist;
      const ny = dy / dist;
      return {
        collided: true,
        penetration: overlap,
        normal: new Vec2(nx, ny),
        contactPoint: new Vec2(closestX, closestY),
        pushX: nx * overlap,
        pushY: ny * overlap
      };
    } else if (distSq <= 1e-9) {
      const leftDist = cx - boxX;
      const rightDist = (boxX + boxW) - cx;
      const topDist = cy - boxY;
      const bottomDist = (boxY + boxH) - cy;

      const minDist = Math.min(leftDist, rightDist, topDist, bottomDist);
      let nx = 0, ny = 0, pushDist = minDist + radius;

      if (minDist === leftDist) nx = -1;
      else if (minDist === rightDist) nx = 1;
      else if (minDist === topDist) ny = -1;
      else ny = 1;

      return {
        collided: true,
        penetration: pushDist,
        normal: new Vec2(nx, ny),
        contactPoint: new Vec2(cx, cy),
        pushX: nx * pushDist,
        pushY: ny * pushDist
      };
    }
    return { collided: false, penetration: 0, pushX: 0, pushY: 0 };
  }

  function circleVsOBB(cx, cy, radius, obb) {
    const angle = obb.angle || 0;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const dx = cx - obb.x, dy = cy - obb.y;
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    // Resolve in local space, including a circle fully inside the rectangle.
    const hit = circleVsAABB(lx, ly, radius, -obb.width / 2, -obb.height / 2, obb.width, obb.height);
    if (!hit.collided) return hit;
    return {
      collided: true, penetration: hit.penetration,
      normal: new Vec2(hit.normal.x * cos - hit.normal.y * sin, hit.normal.x * sin + hit.normal.y * cos),
      pushX: hit.pushX * cos - hit.pushY * sin,
      pushY: hit.pushX * sin + hit.pushY * cos
    };
  }

  function circleVsCircle(c1x, c1y, r1, c2x, c2y, r2) {
    const dx = c1x - c2x;
    const dy = c1y - c2y;
    const distSq = dx * dx + dy * dy;
    const totalR = r1 + r2;
    if (distSq < totalR * totalR && distSq > 1e-9) {
      const dist = Math.sqrt(distSq);
      const overlap = totalR - dist;
      const nx = dx / dist;
      const ny = dy / dist;
      return {
        collided: true,
        penetration: overlap,
        normal: new Vec2(nx, ny),
        pushX: nx * overlap,
        pushY: ny * overlap
      };
    }
    return { collided: false, penetration: 0, pushX: 0, pushY: 0 };
  }

  // ---------------------------------------------------------------------------
  // Raycast Engine
  // ---------------------------------------------------------------------------
  class RaycastResult {
    constructor() {
      this.hit = false;
      this.point = new Vec2();
      this.normal = new Vec2();
      this.distance = Infinity;
      this.fraction = 1;
      this.type = null; // 'wall', 'glass', 'door', 'prop', 'entity'
      this.target = null;
      this.wallSegment = null;
    }

    setHit(point, normal, distance, fraction, type, target, wallSeg) {
      this.hit = true;
      this.point.copy(point);
      this.normal.copy(normal);
      this.distance = distance;
      this.fraction = fraction;
      this.type = type;
      this.target = target;
      this.wallSegment = wallSeg;
      return this;
    }
  }

  function castRay(mapData, rayOrigin, rayDir, maxDistance = 2000, options = {}) {
    const ignoreGlass = options.ignoreGlass || false;
    const ignoreDoors = options.ignoreDoors || false;
    const ignoreProps = options.ignoreProps || false;
    const pierceGlass = options.pierceGlass || false;
    const piercedObjects = [];

    const normDir = rayDir.clone().normalize();
    let closestDist = maxDistance;
    let closestHit = null;

    // 1. Static Wall Segments
    if (mapData && mapData.walls) {
      for (let i = 0; i < mapData.walls.length; i++) {
        const w = mapData.walls[i];
        const hit = raySegmentIntersection(rayOrigin, normDir, closestDist, w.x1, w.y1, w.x2, w.y2);
        if (hit && hit.distance < closestDist) {
          closestDist = hit.distance;
          closestHit = {
            point: hit.point,
            normal: hit.normal,
            distance: hit.distance,
            fraction: hit.fraction,
            type: 'wall',
            target: w,
            wallSegment: w
          };
        }
      }
    }

    // 2. Glass Partitions
    if (mapData && mapData.glassPartitions && !ignoreGlass) {
      for (let i = 0; i < mapData.glassPartitions.length; i++) {
        const g = mapData.glassPartitions[i];
        if (g.shattered) continue;
        const hit = raySegmentIntersection(rayOrigin, normDir, closestDist, g.x1, g.y1, g.x2, g.y2);
        if (hit) {
          if (pierceGlass) {
            piercedObjects.push({
              point: hit.point,
              normal: hit.normal,
              distance: hit.distance,
              type: 'glass',
              target: g
            });
          }
          if (hit.distance < closestDist && !pierceGlass) {
            closestDist = hit.distance;
            closestHit = {
              point: hit.point,
              normal: hit.normal,
              distance: hit.distance,
              fraction: hit.fraction,
              type: 'glass',
              target: g
            };
          }
        }
      }
    }

    // 3. Doors
    if (mapData && mapData.doors && !ignoreDoors) {
      for (let i = 0; i < mapData.doors.length; i++) {
        const d = mapData.doors[i];
        if (d.shattered) continue;
        const p2 = d.getTipPosition ? d.getTipPosition() : {
          x: d.x + Math.cos(d.angle) * d.length,
          y: d.y + Math.sin(d.angle) * d.length
        };
        const hit = raySegmentIntersection(rayOrigin, normDir, closestDist, d.x, d.y, p2.x, p2.y);
        if (hit && hit.distance < closestDist) {
          closestDist = hit.distance;
          closestHit = {
            point: hit.point,
            normal: hit.normal,
            distance: hit.distance,
            fraction: hit.fraction,
            type: 'door',
            target: d
          };
        }
      }
    }

    // 4. Props (Desks, solid furniture)
    if (mapData && mapData.props && !ignoreProps) {
      for (let i = 0; i < mapData.props.length; i++) {
        const prop = mapData.props[i];
        if (!prop.blocksBullets && !prop.isCover) continue;

        if (prop.centered || (prop.angle && prop.angle !== 0)) {
          const hw = prop.width * 0.5;
          const hh = prop.height * 0.5;
          const cos = Math.cos(prop.angle);
          const sin = Math.sin(prop.angle);
          const corners = [
            { x: prop.x + (-hw * cos - -hh * sin), y: prop.y + (-hw * sin + -hh * cos) },
            { x: prop.x + (hw * cos - -hh * sin), y: prop.y + (hw * sin + -hh * cos) },
            { x: prop.x + (hw * cos - hh * sin), y: prop.y + (hw * sin + hh * cos) },
            { x: prop.x + (-hw * cos - hh * sin), y: prop.y + (-hw * sin + hh * cos) }
          ];
          for (let s = 0; s < 4; s++) {
            const p1 = corners[s];
            const p2 = corners[(s + 1) % 4];
            const hit = raySegmentIntersection(rayOrigin, normDir, closestDist, p1.x, p1.y, p2.x, p2.y);
            if (hit && hit.distance < closestDist) {
              closestDist = hit.distance;
              closestHit = {
                point: hit.point,
                normal: hit.normal,
                distance: hit.distance,
                fraction: hit.fraction,
                type: 'prop',
                target: prop
              };
            }
          }
        } else {
          const x1 = prop.x, y1 = prop.y, x2 = prop.x + prop.width, y2 = prop.y + prop.height;
          const sides = [
            [x1, y1, x2, y1],
            [x2, y1, x2, y2],
            [x2, y2, x1, y2],
            [x1, y2, x1, y1]
          ];
          for (let s = 0; s < 4; s++) {
            const side = sides[s];
            const hit = raySegmentIntersection(rayOrigin, normDir, closestDist, side[0], side[1], side[2], side[3]);
            if (hit && hit.distance < closestDist) {
              closestDist = hit.distance;
              closestHit = {
                point: hit.point,
                normal: hit.normal,
                distance: hit.distance,
                fraction: hit.fraction,
                type: 'prop',
                target: prop
              };
            }
          }
        }
      }
    }

    const result = new RaycastResult();
    if (closestHit) {
      result.setHit(
        closestHit.point,
        closestHit.normal,
        closestHit.distance,
        closestHit.fraction,
        closestHit.type,
        closestHit.target,
        closestHit.wallSegment
      );
    }
    result.piercedObjects = piercedObjects;
    return result;
  }

  // ---------------------------------------------------------------------------
  // Check Line of Sight (LOS)
  // ---------------------------------------------------------------------------
  function hasLineOfSight(mapData, p1, p2, options = {}) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-4) return true;

    const dir = new Vec2(dx / dist, dy / dist);
    const result = castRay(mapData, p1, dir, dist, {
      ignoreGlass: options.seeThroughGlass !== false,
      ignoreDoors: options.ignoreDoors || false,
      ignoreProps: options.ignoreProps !== undefined ? options.ignoreProps : true
    });

    if (!result.hit) return true;
    return result.distance >= dist - 1.0;
  }

  // ---------------------------------------------------------------------------
  // World Entity Collision Resolver
  // ---------------------------------------------------------------------------
  function resolveEntityWorldCollisions(entity, mapData, dt = 1 / 60) {
    if (!entity || !mapData) return;
    const radius = entity.radius || 16;
    let cx = entity.x;
    let cy = entity.y;

    // 1. Resolve against solid walls (Multi-pass for smooth sliding in corners)
    for (let iter = 0; iter < 3; iter++) {
      let collidedAny = false;
      if (mapData.walls) {
        for (let i = 0; i < mapData.walls.length; i++) {
          const w = mapData.walls[i];
          const col = circleVsSegment(cx, cy, radius, w.x1, w.y1, w.x2, w.y2);
          if (col.collided) {
            cx += col.pushX;
            cy += col.pushY;
            collidedAny = true;
            if (entity.vx !== undefined && entity.vy !== undefined) {
              const vn = entity.vx * col.normal.x + entity.vy * col.normal.y;
              if (vn < 0) {
                entity.vx -= vn * col.normal.x;
                entity.vy -= vn * col.normal.y;
              }
            }
          }
        }
      }

      // 2. Resolve against intact glass partitions
      if (mapData.glassPartitions) {
        for (let i = 0; i < mapData.glassPartitions.length; i++) {
          const g = mapData.glassPartitions[i];
          if (g.shattered) continue;

          const col = circleVsSegment(cx, cy, radius, g.x1, g.y1, g.x2, g.y2);
          if (col.collided) {
            const speedSq = (entity.vx || 0) * (entity.vx || 0) + (entity.vy || 0) * (entity.vy || 0);
            if (entity.isDashing || entity.isKnockedBack || speedSq > 250000) {
              g.shatter(cx, cy, entity.vx || 0, entity.vy || 0);
            } else {
              cx += col.pushX;
              cy += col.pushY;
              collidedAny = true;
            }
          }
        }
      }

      // 3. Resolve against solid props
      if (mapData.props) {
        for (let i = 0; i < mapData.props.length; i++) {
          const prop = mapData.props[i];
          if (!prop.solid) continue;

          const solidProp = (prop.collisionWidth || prop.collisionHeight)
            ? Object.assign({}, prop, {
                width: prop.collisionWidth || prop.width,
                height: prop.collisionHeight || prop.height
              })
            : prop;

          let col;
          if (solidProp.centered || (solidProp.angle && solidProp.angle !== 0)) {
            col = circleVsOBB(cx, cy, radius, solidProp);
          } else {
            col = circleVsAABB(cx, cy, radius, solidProp.x, solidProp.y, solidProp.width, solidProp.height);
          }

          if (col && col.collided) {
            cx += col.pushX;
            cy += col.pushY;
            collidedAny = true;
          }
        }
      }

      if (!collidedAny) break;
    }

    // 4. Resolve against doors & door sweep interaction
    if (mapData.doors) {
      for (let i = 0; i < mapData.doors.length; i++) {
        const d = mapData.doors[i];
        if (d.shattered) continue;
        // Collision queries (including editor probes) must never inflict damage
        // or change the door. Gameplay handles contacts separately.
        const tip = d.getTipPosition();
        if (d.isLocked || !d.isOpen()) {
          const hit = circleVsSegment(cx, cy, radius + d.thickness / 2, d.x, d.y, tip.x, tip.y);
          if (hit.collided) { cx += hit.pushX; cy += hit.pushY; }
        }
      }
    }

    entity.x = cx;
    entity.y = cy;
  }

  // ---------------------------------------------------------------------------
  // Glass Particle & Fracture System
  // ---------------------------------------------------------------------------
  class GlassShard {
    constructor(x, y, vx, vy, size, rotation, rotSpeed, color = 'rgba(180, 230, 255, 0.85)') {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.size = size;
      this.rotation = rotation;
      this.rotSpeed = rotSpeed;
      this.color = color;
      this.alpha = 1.0;
      this.life = 1.0;
      this.friction = 0.90;
      this.settled = false;
    }

    update(dt) {
      if (!this.settled) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.rotation += this.rotSpeed * dt;
        this.vx *= this.friction;
        this.vy *= this.friction;
        this.rotSpeed *= this.friction;

        if (Math.hypot(this.vx, this.vy) < 5) {
          this.settled = true;
        }
      }
    }

    render(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.fillStyle = this.color;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-this.size, -this.size * 0.5);
      ctx.lineTo(this.size * 0.8, -this.size * 0.2);
      ctx.lineTo(this.size * 0.3, this.size * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  return {
    Vec2,
    clamp,
    normalizeAngle,
    closestPointOnSegment,
    pointLineDistanceSq,
    segmentsIntersect,
    raySegmentIntersection,
    raycastWalls,
    lineIntersectsSegment: (x1, y1, x2, y2, x3, y3, x4, y4) => segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) !== null,
    circleVsSegment,
    circleVsAABB,
    circleVsOBB,
    circleVsCircle,
    castRay,
    hasLineOfSight,
    resolveEntityWorldCollisions,
    GlassShard,
    RaycastResult
  };
}));
