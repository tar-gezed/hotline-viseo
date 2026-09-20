/**
 * Hotline Miami: VISEO Arcade Edition
 * Collision & Raycasting Engine - js/engine/collision.js
 * 
 * Provides:
 * - Line of Sight raycasting (can see through glass, blocked by walls / opaque doors)
 * - Continuous high-speed bullet raycasting with penetration support
 * - Circle vs Box / Segment collision & wall sliding physics
 * - Vision cone polygon calculation for dynamic lighting / shadows
 */

(function (root, factory) {
    const result = factory();
    if (typeof define === 'function' && define.amd) {
        define([], () => result);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = result;
    }
    if (typeof window !== 'undefined') {
        window.Collision = result;
    }
    root.Collision = result;
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    class CollisionSystem {
        /**
         * Read the state of an obstacle without confusing the Door#isOpen
         * method with a truthy boolean.  A fair amount of the older gameplay
         * code passes a mixture of plain segment records and live Door objects
         * through this module, so the normalisation lives here instead of at
         * every call site.
         */
        static _isOpenObstacle(obstacle) {
            if (!obstacle) return false;
            if (typeof obstacle.isOpen === 'function') {
                try { return !!obstacle.isOpen(); } catch (error) { return false; }
            }
            return obstacle.isOpen === true || obstacle.open === true;
        }

        static _isDoorObstacle(obstacle) {
            return !!(obstacle && (
                obstacle.isDoor === true ||
                typeof obstacle.getTipPosition === 'function' ||
                (obstacle.length !== undefined && obstacle.x !== undefined && obstacle.y !== undefined &&
                    (obstacle.angle !== undefined || obstacle.baseAngle !== undefined))
            ));
        }

        /**
         * Convert a live door or a static segment into the segment that is
         * physically present this frame.  Closed-door collision used to be
         * silently absent because Door instances do not expose x1/x2 fields.
         */
        static _getSegmentObstacle(obstacle) {
            if (!obstacle) return null;
            if (obstacle.x1 !== undefined && obstacle.y1 !== undefined &&
                obstacle.x2 !== undefined && obstacle.y2 !== undefined) {
                // Callers only read endpoints; static walls need no per-query copy.
                return obstacle;
            }
            if (!this._isDoorObstacle(obstacle)) return null;

            const angle = Number.isFinite(obstacle.angle)
                ? obstacle.angle
                : (Number.isFinite(obstacle.baseAngle) ? obstacle.baseAngle : 0);
            const length = Number.isFinite(obstacle.length) ? obstacle.length : 0;
            if (!Number.isFinite(obstacle.x) || !Number.isFinite(obstacle.y) || length <= 0) return null;

            if (typeof obstacle.getTipPosition === 'function') {
                const tip = obstacle.getTipPosition();
                if (tip && Number.isFinite(tip.x) && Number.isFinite(tip.y)) {
                    return { x1: obstacle.x, y1: obstacle.y, x2: tip.x, y2: tip.y };
                }
            }
            return {
                x1: obstacle.x,
                y1: obstacle.y,
                x2: obstacle.x + Math.cos(angle) * length,
                y2: obstacle.y + Math.sin(angle) * length
            };
        }

        /**
         * Return the four world-space edges of a rectangle.  Map furniture is
         * authored around a centered origin and may be rotated; treating it as
         * an axis-aligned box at (x,y) creates invisible blockers offset by half
         * a desk or table.  Legacy top-left records remain supported.
         */
        static _getRectangleSegments(obstacle) {
            if (!obstacle || obstacle.width === undefined || obstacle.height === undefined) return null;
            const width = Number.isFinite(obstacle.collisionWidth) ? obstacle.collisionWidth : obstacle.width;
            const height = Number.isFinite(obstacle.collisionHeight) ? obstacle.collisionHeight : obstacle.height;
            if (!(width > 0) || !(height > 0) || !Number.isFinite(obstacle.x) || !Number.isFinite(obstacle.y)) return null;

            const angle = Number.isFinite(obstacle.angle) ? obstacle.angle : 0;
            const centered = obstacle.centered === true || angle !== 0;
            let corners;
            if (centered) {
                const cx = obstacle.centered === true ? obstacle.x : obstacle.x + width * 0.5;
                const cy = obstacle.centered === true ? obstacle.y : obstacle.y + height * 0.5;
                const hw = width * 0.5;
                const hh = height * 0.5;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                corners = [
                    { x: cx + (-hw * cos - -hh * sin), y: cy + (-hw * sin + -hh * cos) },
                    { x: cx + ( hw * cos - -hh * sin), y: cy + ( hw * sin + -hh * cos) },
                    { x: cx + ( hw * cos -  hh * sin), y: cy + ( hw * sin +  hh * cos) },
                    { x: cx + (-hw * cos -  hh * sin), y: cy + (-hw * sin +  hh * cos) }
                ];
            } else {
                corners = [
                    { x: obstacle.x, y: obstacle.y },
                    { x: obstacle.x + width, y: obstacle.y },
                    { x: obstacle.x + width, y: obstacle.y + height },
                    { x: obstacle.x, y: obstacle.y + height }
                ];
            }

            return corners.map((corner, index) => ({
                x1: corner.x,
                y1: corner.y,
                x2: corners[(index + 1) % corners.length].x,
                y2: corners[(index + 1) % corners.length].y
            }));
        }

        /**
         * Checks line segment intersection between (x1,y1)-(x2,y2) and (x3,y3)-(x4,y4).
         * @returns {{x: number, y: number, t: number, u: number}|null}
         */
        static lineSegmentIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
            const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
            if (Math.abs(denom) < 1e-6) return null;

            const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
            const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

            if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
                return {
                    x: x1 + ua * (x2 - x1),
                    y: y1 + ua * (y2 - y1),
                    t: ua,
                    u: ub
                };
            }
            return null;
        }

        /**
         * Raycasts from origin along direction vector up to maxDistance against an array of obstacles.
         * Obstacles can be:
         * - Walls / Segments: { x1, y1, x2, y2, isGlass, isDoor }
         * - Rectangles: { x, y, width, height, isGlass }
         * - Doors: { x1, y1, x2, y2, open, isGlass }
         * 
         * @param {number} ox Ray Origin X
         * @param {number} oy Ray Origin Y
         * @param {number} dx Ray Direction X (normalized)
         * @param {number} dy Ray Direction Y (normalized)
         * @param {number} maxDist Maximum raycast distance
         * @param {Array<Object>} obstacles
         * @param {Object} [options] { ignoreGlass: boolean, ignoreDoors: boolean }
         * @returns {{hit: boolean, distance: number, point: {x: number, y: number}, normal: {x: number, y: number}, obstacle: Object|null}}
         */
        static raycast(ox, oy, dx, dy, maxDist, obstacles = [], options = {}) {
            let closestHit = null;
            let minDistance = maxDist;

            const targetX = ox + dx * maxDist;
            const targetY = oy + dy * maxDist;
            const minX = Math.min(ox, targetX), maxX = Math.max(ox, targetX);
            const minY = Math.min(oy, targetY), maxY = Math.max(oy, targetY);

            for (let i = 0; i < obstacles.length; i++) {
                const obs = obstacles[i];
                if (!obs || obs.shattered) continue;

                // Handle glass transparency option
                if (obs.isGlass && options.ignoreGlass) continue;

                // Doors can be live objects with isOpen(), plain records with
                // isOpen/open booleans, or explicit segment metadata.
                const isDoor = this._isDoorObstacle(obs);
                if (isDoor && options.ignoreDoors) continue;
                if (isDoor && this._isOpenObstacle(obs) && options.ignoreOpenDoors !== false) continue;

                // If obstacle is a segment
                const segment = this._getSegmentObstacle(obs);
                if (segment) {
                    if (Math.max(segment.x1, segment.x2) < minX || Math.min(segment.x1, segment.x2) > maxX
                        || Math.max(segment.y1, segment.y2) < minY || Math.min(segment.y1, segment.y2) > maxY) continue;
                    const hit = this.lineSegmentIntersection(ox, oy, targetX, targetY, segment.x1, segment.y1, segment.x2, segment.y2);
                    if (hit) {
                        const dist = Math.hypot(hit.x - ox, hit.y - oy);
                        if (dist < minDistance) {
                            minDistance = dist;
                            // Calculate normal
                            const segDx = segment.x2 - segment.x1;
                            const segDy = segment.y2 - segment.y1;
                            const segLen = Math.hypot(segDx, segDy) || 1;
                            let nx = -segDy / segLen;
                            let ny = segDx / segLen;
                            // Ensure normal points against ray
                            if (nx * dx + ny * dy > 0) {
                                nx = -nx;
                                ny = -ny;
                            }

                            closestHit = {
                                hit: true,
                                distance: dist,
                                point: { x: hit.x, y: hit.y },
                                normal: { x: nx, y: ny },
                                obstacle: obs
                            };
                        }
                    }
                }
                // If obstacle is a bounding box / rectangle
                else if (obs.width !== undefined && obs.height !== undefined) {
                    const w = Number.isFinite(obs.collisionWidth) ? obs.collisionWidth : obs.width;
                    const h = Number.isFinite(obs.collisionHeight) ? obs.collisionHeight : obs.height;
                    const cx = obs.centered === true ? obs.x : obs.x + w / 2;
                    const cy = obs.centered === true ? obs.y : obs.y + h / 2;
                    // Half the sum bounds every rotation, avoiding trig and
                    // four temporary edges for furniture nowhere near the ray.
                    const extent = (Math.abs(w) + Math.abs(h)) / 2;
                    if (cx + extent < minX || cx - extent > maxX
                        || cy + extent < minY || cy - extent > maxY) continue;
                    const segments = this._getRectangleSegments(obs) || [];

                    for (let s = 0; s < segments.length; s++) {
                        const seg = segments[s];
                        const hit = this.lineSegmentIntersection(ox, oy, targetX, targetY, seg.x1, seg.y1, seg.x2, seg.y2);
                        if (hit) {
                            const dist = Math.hypot(hit.x - ox, hit.y - oy);
                            if (dist < minDistance) {
                                minDistance = dist;
                                const segDx = seg.x2 - seg.x1;
                                const segDy = seg.y2 - seg.y1;
                                const segLen = Math.hypot(segDx, segDy) || 1;
                                let nx = -segDy / segLen;
                                let ny = segDx / segLen;
                                if (nx * dx + ny * dy > 0) { nx = -nx; ny = -ny; }

                                closestHit = {
                                    hit: true,
                                    distance: dist,
                                    point: { x: hit.x, y: hit.y },
                                    normal: { x: nx, y: ny },
                                    obstacle: obs
                                };
                            }
                        }
                    }
                }
            }

            if (closestHit) {
                return closestHit;
            }

            return {
                hit: false,
                distance: maxDist,
                point: { x: targetX, y: targetY },
                normal: { x: 0, y: 0 },
                obstacle: null
            };
        }

        /**
         * Fast line-of-sight test between point A and point B.
         * Returns true if unobstructed, false if blocked by walls or closed doors.
         * @param {number} x1 
         * @param {number} y1 
         * @param {number} x2 
         * @param {number} y2 
         * @param {Array<Object>} obstacles 
         * @param {boolean} [canSeeThroughGlass=true] 
         * @returns {boolean}
         */
        static hasLineOfSight(x1, y1, x2, y2, obstacles = [], canSeeThroughGlass = true) {
            const dx = x2 - x1;
            const dy = y2 - y1;
            const dist = Math.hypot(dx, dy);
            if (dist < 1) return true;

            const ray = this.raycast(x1, y1, dx / dist, dy / dist, dist - 1, obstacles, {
                ignoreGlass: canSeeThroughGlass,
                ignoreOpenDoors: true
            });

            return !ray.hit;
        }

        /**
         * Resolves circle collision against static obstacles with wall sliding.
         * @param {Object} entity Entity with {x, y, radius, vx, vy}
         * @param {Array<Object>} obstacles List of wall segments or boxes
         */
        static worldObstacles(world) {
            return Array.isArray(world) ? world : [ ...(world?.walls||[]),
                ...(world?.glassPartitions||[]), ...(world?.doors||[]),
                ...(world?.props||[]).filter(p=>p.solid) ];
        }

        // Bound each displacement by the actor's radius so even a low-FPS dog
        // or a sliding body cannot jump from one side of a wall to the other.
        static moveCircle(entity, world, dt) {
            const obstacles=this.worldObstacles(world);
            const steps=Math.max(1, Math.ceil(Math.hypot(entity.vx||0,entity.vy||0)*dt / Math.max(2,(entity.radius||14)/3)));
            const step=dt/steps;
            for(let i=0;i<steps;i++) {
                entity.x+=(entity.vx||0)*step; entity.y+=(entity.vy||0)*step;
                this.resolveCircleCollision(entity,obstacles,step);
            }
        }

        static resolveCircleCollision(entity, obstacles = [], dt = 1/60) {
            const r = entity.radius || 14;

            // Push before any neighbouring wall removes the movement velocity.
            for(const obs of obstacles) if(obs && typeof obs.pushEntity === 'function') obs.pushEntity(entity,dt);
            for (let pass=0;pass<3;pass++) for (let i = 0; i < obstacles.length; i++) {
                const obs = obstacles[i];
                if (!obs || obs.shattered || obs.broken) continue;
                if (typeof obs.getTipPosition !== 'function' && this._isOpenObstacle(obs)) continue;

                // Segment collision
                const segment = this._getSegmentObstacle(obs);
                if (segment) {
                    this._resolveCircleSegment(entity, segment.x1, segment.y1, segment.x2, segment.y2, r + (obs.thickness || 0)/2);
                }
                // Box collision
                else if (obs.width !== undefined && obs.height !== undefined) {
                    this._resolveCircleRect(entity, obs.x, obs.y,
                        Number.isFinite(obs.collisionWidth) ? obs.collisionWidth : obs.width,
                        Number.isFinite(obs.collisionHeight) ? obs.collisionHeight : obs.height, r,
                        obs);
                }
            }
        }

        static _resolveCircleSegment(entity, x1, y1, x2, y2, r) {
            if (entity.x < Math.min(x1, x2) - r || entity.x > Math.max(x1, x2) + r
                || entity.y < Math.min(y1, y2) - r || entity.y > Math.max(y1, y2) + r) return;
            const segDx = x2 - x1;
            const segDy = y2 - y1;
            const segLenSq = segDx * segDx + segDy * segDy;
            if (segLenSq === 0) return;

            // Project entity center onto segment
            let t = ((entity.x - x1) * segDx + (entity.y - y1) * segDy) / segLenSq;
            t = Math.max(0, Math.min(1, t));

            const closestX = x1 + t * segDx;
            const closestY = y1 + t * segDy;

            const dx = entity.x - closestX;
            const dy = entity.y - closestY;
            const distSq = dx * dx + dy * dy;

            if (distSq < r * r && distSq > 0.0001) {
                const dist = Math.sqrt(distSq);
                const overlap = r - dist;
                const nx = dx / dist;
                const ny = dy / dist;

                // Push entity out of wall
                entity.x += nx * overlap;
                entity.y += ny * overlap;

                // Nullify velocity along normal (wall slide)
                if (entity.vx !== undefined && entity.vy !== undefined) {
                    const dot = entity.vx * nx + entity.vy * ny;
                    if (dot < 0) {
                        entity.vx -= dot * nx;
                        entity.vy -= dot * ny;
                    }
                }
            } else if (distSq <= 0.0001) {
                // An entity exactly on a segment used to pass through an
                // invisible wall because the zero-distance case was ignored.
                // Pick a stable perpendicular and push it clear.
                const segLen = Math.sqrt(segLenSq) || 1;
                let nx = -segDy / segLen;
                let ny = segDx / segLen;
                if (entity.vx !== undefined && entity.vy !== undefined && nx * entity.vx + ny * entity.vy > 0) {
                    nx = -nx;
                    ny = -ny;
                }
                entity.x += nx * r;
                entity.y += ny * r;
                if (entity.vx !== undefined && entity.vy !== undefined) {
                    const dot = entity.vx * nx + entity.vy * ny;
                    if (dot < 0) {
                        entity.vx -= dot * nx;
                        entity.vy -= dot * ny;
                    }
                }
            }
        }

        static _resolveCircleRect(entity, rx, ry, rw, rh, r, obstacle = null) {
            const cx = obstacle?.centered === true ? rx : rx + rw / 2;
            const cy = obstacle?.centered === true ? ry : ry + rh / 2;
            const extent = (Math.abs(rw) + Math.abs(rh)) / 2 + r;
            if (entity.x < cx - extent || entity.x > cx + extent
                || entity.y < cy - extent || entity.y > cy + extent) return;
            if (obstacle && (obstacle.centered === true || (obstacle.angle && obstacle.angle !== 0))) {
                this._resolveCircleOBB(entity, obstacle, r, rw, rh);
                return;
            }
            const closestX = Math.max(rx, Math.min(entity.x, rx + rw));
            const closestY = Math.max(ry, Math.min(entity.y, ry + rh));

            const dx = entity.x - closestX;
            const dy = entity.y - closestY;
            const distSq = dx * dx + dy * dy;

            if (distSq < r * r && distSq > 0.0001) {
                const dist = Math.sqrt(distSq);
                const overlap = r - dist;
                const nx = dx / dist;
                const ny = dy / dist;

                entity.x += nx * overlap;
                entity.y += ny * overlap;

                if (entity.vx !== undefined && entity.vy !== undefined) {
                    const dot = entity.vx * nx + entity.vy * ny;
                    if (dot < 0) {
                        entity.vx -= dot * nx;
                        entity.vy -= dot * ny;
                    }
                }
            } else if (distSq <= 0.0001 && entity.x >= rx && entity.x <= rx + rw && entity.y >= ry && entity.y <= ry + rh) {
                const leftDist = entity.x - rx;
                const rightDist = rx + rw - entity.x;
                const topDist = entity.y - ry;
                const bottomDist = ry + rh - entity.y;
                const minDist = Math.min(leftDist, rightDist, topDist, bottomDist);
                let nx = 0; let ny = 0;
                if (minDist === leftDist) nx = -1;
                else if (minDist === rightDist) nx = 1;
                else if (minDist === topDist) ny = -1;
                else ny = 1;
                const push = r + minDist;
                entity.x += nx * push;
                entity.y += ny * push;
                if (entity.vx !== undefined && entity.vy !== undefined) {
                    const dot = entity.vx * nx + entity.vy * ny;
                    if (dot < 0) {
                        entity.vx -= dot * nx;
                        entity.vy -= dot * ny;
                    }
                }
            }
        }

        static _resolveCircleOBB(entity, obstacle, r, width, height) {
            const angle = Number.isFinite(obstacle.angle) ? obstacle.angle : 0;
            const centered = obstacle.centered === true;
            const cx = centered ? obstacle.x : obstacle.x + width * 0.5;
            const cy = centered ? obstacle.y : obstacle.y + height * 0.5;
            const cos = Math.cos(-angle);
            const sin = Math.sin(-angle);
            const lx = (entity.x - cx) * cos - (entity.y - cy) * sin;
            const ly = (entity.x - cx) * sin + (entity.y - cy) * cos;
            const hw = width * 0.5;
            const hh = height * 0.5;
            const closestLX = Math.max(-hw, Math.min(lx, hw));
            const closestLY = Math.max(-hh, Math.min(ly, hh));
            const dx = lx - closestLX;
            const dy = ly - closestLY;
            const distSq = dx * dx + dy * dy;

            let lnx; let lny; let push;
            if (distSq > 0.0001) {
                const dist = Math.sqrt(distSq);
                if (dist >= r) return;
                lnx = dx / dist;
                lny = dy / dist;
                push = r - dist;
            } else if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) {
                const leftDist = lx + hw;
                const rightDist = hw - lx;
                const topDist = ly + hh;
                const bottomDist = hh - ly;
                const minDist = Math.min(leftDist, rightDist, topDist, bottomDist);
                lnx = 0; lny = 0;
                if (minDist === leftDist) lnx = -1;
                else if (minDist === rightDist) lnx = 1;
                else if (minDist === topDist) lny = -1;
                else lny = 1;
                push = r + minDist;
            } else {
                return;
            }

            const wcos = Math.cos(angle);
            const wsin = Math.sin(angle);
            const nx = lnx * wcos - lny * wsin;
            const ny = lnx * wsin + lny * wcos;
            entity.x += nx * push;
            entity.y += ny * push;
            if (entity.vx !== undefined && entity.vy !== undefined) {
                const dot = entity.vx * nx + entity.vy * ny;
                if (dot < 0) {
                    entity.vx -= dot * nx;
                    entity.vy -= dot * ny;
                }
            }
        }

        /**
         * Circle vs Circle intersection check.
         */
        static circleCircle(x1, y1, r1, x2, y2, r2) {
            const dx = x2 - x1;
            const dy = y2 - y1;
            return (dx * dx + dy * dy) <= (r1 + r2) * (r1 + r2);
        }

        /**
         * Circle vs Sector / Cone intersection test (for melee swings and vision checks).
         * @param {number} cx Circle Center X
         * @param {number} cy Circle Center Y
         * @param {number} cr Circle Radius
         * @param {number} ox Cone Origin X
         * @param {number} oy Cone Origin Y
         * @param {number} coneAngle Cone central facing angle (radians)
         * @param {number} coneArc Cone total sweep angle (radians)
         * @param {number} coneRange Cone max range (pixels)
         * @returns {boolean}
         */
        static circleInCone(cx, cy, cr, ox, oy, coneAngle, coneArc, coneRange) {
            const dx = cx - ox;
            const dy = cy - oy;
            const dist = Math.hypot(dx, dy);

            // Check range (accounting for circle radius)
            if (dist > coneRange + cr) return false;
            if (dist < cr) return true; // Inside origin

            // Check angle delta
            const targetAngle = Math.atan2(dy, dx);
            let angleDiff = Math.abs(targetAngle - coneAngle);
            while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - Math.PI * 2);

            return angleDiff <= (coneArc * 0.5) + Math.asin(Math.min(1, cr / dist));
        }

        /**
         * Calculates shortest distance from a point to a line segment.
         */
        static pointToSegmentDistance(px, py, x1, y1, x2, y2) {
            const dx = x2 - x1;
            const dy = y2 - y1;
            const lenSq = dx * dx + dy * dy;
            if (lenSq === 0) return Math.hypot(px - x1, py - y1);
            let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
            t = Math.max(0, Math.min(1, t));
            const projX = x1 + t * dx;
            const projY = y1 + t * dy;
            return Math.hypot(px - projX, py - projY);
        }

        static circleIntersectsSegment(x1, y1, x2, y2, cx, cy, radius) {
            const segDx = x2 - x1;
            const segDy = y2 - y1;
            const segLenSq = segDx * segDx + segDy * segDy;
            if (segLenSq <= 1e-9) return Math.hypot(cx - x1, cy - y1) <= radius;
            let t = ((cx - x1) * segDx + (cy - y1) * segDy) / segLenSq;
            t = Math.max(0, Math.min(1, t));
            const closestX = x1 + t * segDx;
            const closestY = y1 + t * segDy;
            const dx = cx - closestX;
            const dy = cy - closestY;
            return dx * dx + dy * dy <= radius * radius;
        }

        static lineIntersectsSegment(x1, y1, x2, y2, x3, y3, x4, y4) {
            return CollisionSystem.lineSegmentIntersection(x1, y1, x2, y2, x3, y3, x4, y4) !== null;
        }

        static raycastWalls(x1, y1, x2, y2, walls) {
            if (typeof Physics !== 'undefined' && typeof Physics.raycastWalls === 'function') {
                return Physics.raycastWalls(x1, y1, x2, y2, walls);
            }
            return null;
        }
    }

    return CollisionSystem;
}));
