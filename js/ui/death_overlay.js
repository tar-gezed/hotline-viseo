/** Screen-space death stamp. Presentation only: the game owns input and timing. */
(function (global) {
  'use strict';

  class DeathOverlay {
    constructor() {
      this.fontFamily = 'DeathSelincah';
      this.resetBlood(1741);
    }

    resetBlood(seed = Math.floor(Math.random() * 0xffffffff)) {
      // All randomness and texture work happen once per death, never per frame.
      let state = seed >>> 0;
      const random = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
      };
      const layout = [
        [.018, .024, 54, 'burst', .5, 2], [.18, -.016, 30, 'smear', 1.2, 1],
        [.74, -.014, 39, 'burst', 1.8, 1], [.989, .085, 45, 'smear', 2.3, 3],
        [-.005, .35, 25, 'mist', .2, 0], [1.008, .55, 32, 'burst', 2.9, 1],
        [.035, .945, 45, 'smear', -.5, 0], [.85, 1.009, 36, 'burst', -1.7, 0],
        [.99, .87, 22, 'mist', -2.2, 0], [.23, .47, 27, 'burst', .3, 1],
        [.74, .44, 24, 'smear', -.8, 0], [.31, .75, 22, 'mist', -1, 0],
        [.68, .79, 30, 'burst', -2.1, 2], [.58, .09, 15, 'mist', 1.4, 0],
        [.14, .65, 20, 'smear', 1, 1], [.83, .64, 23, 'mist', 2, 0],
        [.40, .47, 12, 'mist', -2.4, 0]
      ];
      const colors = ['#8c1021', '#a51125', '#780d1d', '#b01828'];
      // Rounded, uneven contours: larger beads also avoid the old leaf shape.
      const blob = (path, x, y, radius, stretch = 1, angle = 0) => {
        const points = [];
        const count = radius > 10 ? 30 : 10;
        const phase = random() * Math.PI * 2;
        for (let n = 0; n < count; n++) {
          const a = n / count * Math.PI * 2;
          const r = radius * (.79 + Math.sin(a * 3 + phase) * .13 + (random() - .5) * .25);
          const px = Math.cos(a) * r * stretch, py = Math.sin(a) * r;
          points.push([x + px * Math.cos(angle) - py * Math.sin(angle),
            y + px * Math.sin(angle) + py * Math.cos(angle)]);
        }
        const last = points[count - 1], first = points[0];
        path.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
        points.forEach((a, n) => {
          const b = points[(n + 1) % count];
          path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        });
        path.closePath();
        return points;
      };
      this.splashes = layout.map(([u, v, size, kind, direction, runs]) => {
        const radius = size * (.85 + random() * .3);
        const angle = direction + (random() - .5) * .65;
        const core = new Path2D();
        let points = [];
        if (kind !== 'mist') {
          // A compact pool feeds broad curved fingers with rounded liquid tips.
          points = blob(core, 0, 0, radius * (kind === 'smear' ? .63 : .8),
            kind === 'smear' ? 1.35 : 1.05, angle);
          const fingers = kind === 'smear' ? 2 + Math.floor(random() * 3) : 3 + Math.floor(random() * 3);
          for (let n = 0; n < fingers; n++) {
            const a = angle + (random() - .5) * (kind === 'smear' ? 1.4 : 5.4);
            const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
            const distance = radius * (.75 + random() * (kind === 'smear' ? .95 : .7));
            const width = radius * (.10 + random() * .13);
            const tipWidth = width * (.12 + random() * .23);
            const bend = radius * (random() - .5) * .5;
            const startX = dx * radius * .3, startY = dy * radius * .3;
            const midX = dx * distance * .65 + nx * bend, midY = dy * distance * .65 + ny * bend;
            const endX = dx * distance, endY = dy * distance;
            if (n % 3 === 0) {
              blob(core, endX, endY, radius * (.09 + random() * .08), 1.25, a);
              continue;
            }
            core.moveTo(startX - nx * width, startY - ny * width);
            core.quadraticCurveTo(midX - nx * width * .45, midY - ny * width * .45,
              endX - nx * tipWidth, endY - ny * tipWidth);
            core.quadraticCurveTo(endX + dx * tipWidth * 1.4, endY + dy * tipWidth * 1.4,
              endX + nx * tipWidth, endY + ny * tipWidth);
            core.quadraticCurveTo(midX + nx * width * .45, midY + ny * width * .45,
              startX + nx * width, startY + ny * width);
            core.closePath();
            // Secondary pools merge into the core instead of forming radial stars.
            if (n % 2 === 0) blob(core, dx * radius * .58, dy * radius * .58, width * 1.7);
          }
        }
        const droplets = [];
        const jets = Array.from({ length: 3 + Math.floor(random() * 3) }, () => ({
          angle: angle + (random() - .5) * (kind === 'burst' ? 4.8 : 1.8),
          distance: radius * (1 + random() * 2), spread: .18 + random() * .25
        }));
        const count = kind === 'mist' ? 70 + Math.floor(random() * 35) : 45 + Math.floor(random() * 35);
        for (let n = 0; n < count; n++) {
          const jet = jets[n % jets.length];
          const a = jet.angle + (random() + random() - 1) * jet.spread;
          const distance = jet.distance * (.5 + random() * .95);
          const large = n % 17 === 0;
          const r = large ? 2.2 + random() * 2.8 : .35 + Math.pow(random(), 2.5) * 1.8;
          const x = Math.cos(a) * distance, y = Math.sin(a) * distance;
          const drop = new Path2D();
          if (large) blob(drop, x, y, r, 1 + random() * .5, a);
          else drop.ellipse(x, y, r * (1 + random() * .65), r * .8, a, 0, Math.PI * 2);
          droplets.push({ path:drop, x, y, r, large, alpha:.4 + random() * .55,
            color:colors[Math.floor(random() * colors.length)] });
        }
        const bottom = points.slice().sort((a, b) => b[1] - a[1]);
        const drips = Array.from({ length:runs }, (_, n) => {
          const p = bottom[(n * 4 + Math.floor(random() * 3)) % bottom.length];
          return { x:p[0] * .64, y:p[1] * .64, length:12 + random() * Math.min(46, radius * 1.5),
            width:.85 + random() * 1.5, bend:(random() - .5) * 5,
            delay:.17 + random() * .12, duration:.55 + random() * .4 };
        });
        const stain = {
          u:u + (random() - .5) * .018, v:v + (random() - .5) * .022,
          radius, core, droplets, drips, kind, color:colors[Math.floor(random() * colors.length)],
          alpha:.8 + random() * .18, delay:random() * .035, duration:.10 + random() * .06
        };
        this.paintBloodTexture(stain, random);
        return stain;
      });
    }

    paintBloodTexture(stain, random) {
      // Small native-resolution plates give blood the world's crisp pixel grain.
      // Once settled, each cluster costs two blits instead of hundreds of paths.
      const extent = Math.ceil(stain.radius * 4.6 + 12);
      const layer = () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = extent * 2;
        const ctx = canvas.getContext('2d');
        ctx.translate(extent, extent);
        return { canvas, ctx };
      };
      const pool = layer(), spray = layer();
      const ctx = pool.ctx, r = stain.radius;
      if (stain.kind !== 'mist') {
        ctx.shadowColor = 'rgba(25,0,8,.5)';
        ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 2;
        const ink = ctx.createLinearGradient(-r * .6, -r, r * .6, r * 1.5);
        ink.addColorStop(0, '#c52736');
        ink.addColorStop(.3, stain.color);
        ink.addColorStop(.78, '#780c1c');
        ink.addColorStop(1, '#390713');
        ctx.fillStyle = ink;
        ctx.fill(stain.core);
        ctx.shadowColor = 'transparent';
        ctx.save();
        ctx.clip(stain.core);
        // Uneven thickness, with darker clots and thinner translucent pockets.
        for (let n = 0; n < 7; n++) {
          const x = (random() - .5) * r * 1.5, y = (random() - .5) * r * 1.5;
          const size = r * (.15 + random() * .35);
          const pocket = ctx.createRadialGradient(x, y, 0, x, y, size);
          pocket.addColorStop(0, n % 3 ? 'rgba(30,0,7,.28)' : 'rgba(230,60,49,.22)');
          pocket.addColorStop(1, 'rgba(80,0,10,0)');
          ctx.fillStyle = pocket;
          ctx.fillRect(x - size, y - size, size * 2, size * 2);
        }
        // Uneven pigment and pinholes, without the old regular dark polka dots.
        for (let n = 0; n < 550; n++) {
          const x = (random() - .5) * r * 4, y = (random() - .5) * r * 4;
          ctx.fillStyle = n % 3 ? 'rgba(37,0,10,.13)' : 'rgba(235,72,66,.16)';
          ctx.fillRect(Math.round(x), Math.round(y), 1 + Math.floor(random() * 3), 1);
          if (n % 4 === 0 && Math.hypot(x, y) > r * .55) {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = 'rgba(0,0,0,.45)';
            ctx.fillRect(Math.round(x), Math.round(y), 1 + Math.floor(random() * 2), 1);
            ctx.globalCompositeOperation = 'source-over';
          }
        }
        ctx.restore();
        // A one-pixel reflected edge follows only the exposed silhouette.
        // Subtracting an offset mask avoids outlines around overlapping lobes.
        const rim = layer();
        rim.ctx.fillStyle = '#ec6a59';
        rim.ctx.fill(stain.core);
        rim.ctx.globalCompositeOperation = 'destination-out';
        rim.ctx.translate(1, 1);
        rim.ctx.fill(stain.core);
        ctx.globalAlpha = .19;
        ctx.drawImage(rim.canvas, -extent, -extent);
        ctx.globalAlpha = 1;
      }
      for (const drop of stain.droplets) {
        const c = spray.ctx;
        c.globalAlpha = drop.alpha;
        c.fillStyle = drop.color;
        c.fill(drop.path);
        if (drop.large) {
          c.globalAlpha = .22;
          c.fillStyle = '#f36955';
          c.fillRect(Math.round(drop.x - drop.r * .3), Math.round(drop.y - drop.r * .35), 1, 1);
        }
      }
      stain.poolTexture = pool.canvas;
      stain.sprayTexture = spray.canvas;
      stain.extent = extent;
      // Paths are baked; only light drawing metadata is needed during playback.
      delete stain.core;
      delete stain.droplets;
    }
    async loadFont() {
      try {
        await document.fonts.load(`128px ${this.fontFamily}`, "YOU'RE DEAD!");
      } catch (_) { /* The stamp remains readable with the local Impact fallback. */ }
    }

    render(ctx, width, height, elapsed, gamepad) {
      const s = Math.min(width / 1280, height / 720);
      ctx.save();
      // Strong neutral veil with additional shading toward the screen edges.
      ctx.fillStyle = 'rgba(0,0,0,0.60)';
      ctx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.scale(width / 2, height / 2);
      const vignette = ctx.createRadialGradient(0, 0, .35, 0, 0, 1.25);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(.65, 'rgba(0,0,0,0.12)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.36)');
      ctx.fillStyle = vignette;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
      this.drawBlood(ctx, width, height, s, elapsed);

      // Above the body, with no card or opaque band behind the lettering.
      ctx.save();
      ctx.translate(width / 2, height * .29 - 12 * s);
      ctx.rotate(-.045);
      const impact = 1 + .035 * Math.max(0, 1 - elapsed / .12);
      ctx.scale(impact, impact);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const title = "YOU'RE DEAD!";
      ctx.font = `128px ${this.fontFamily}, Impact, 'Arial Black', sans-serif`;
      const fontSize = Math.min(128 * s, width * .79 / ctx.measureText(title).width * 128);
      ctx.font = `${fontSize}px ${this.fontFamily}, Impact, 'Arial Black', sans-serif`;
      const metrics = ctx.measureText(title);
      const baseline = ((metrics.actualBoundingBoxAscent || fontSize * .75) -
        (metrics.actualBoundingBoxDescent || 0)) / 2;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 5 * s;
      ctx.strokeStyle = '#160c20';
      ctx.fillStyle = '#160c20';
      ctx.strokeText(title, 7 * s, baseline + 9 * s);
      ctx.fillText(title, 7 * s, baseline + 9 * s);
      // A fixed two-pixel color fringe gives the stamp a slight RGB split.
      ctx.fillStyle = '#f03764';
      ctx.fillText(title, 2 * s, baseline + 2 * s);
      ctx.strokeText(title, 0, baseline);
      ctx.fillStyle = '#ed4e93';
      ctx.shadowColor = '#ed4e93';
      ctx.shadowBlur = 16 * s;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillText(title, 0, baseline);
      ctx.restore();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#100c18';
      ctx.shadowOffsetX = 2 * s;
      ctx.shadowOffsetY = 3 * s;
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff1db';
      ctx.font = `900 ${23 * s}px 'Courier New', monospace`;
      const retryY = height * .64;
      ctx.fillText(gamepad ? '[A] RESTART' : '[R] RESTART', width / 2, retryY);
      if (elapsed >= .4) {
        ctx.fillStyle = '#fff1db';
        ctx.font = `700 ${13 * s}px 'Courier New', monospace`;
        ctx.fillText(gamepad ? '[Y] SCORE' : '[SPACE] SCORE', width / 2, retryY + 36 * s);
      }
      ctx.restore();
    }

    drawBlood(ctx, width, height, s, elapsed) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      this.splashes.forEach(stain => {
        const t = Math.min(1, Math.max(0, elapsed - stain.delay) / stain.duration);
        const spread = 1 - Math.pow(1 - t, 3);
        ctx.save();
        ctx.translate(width * stain.u, height * stain.v);
        ctx.scale(s, s);
        ctx.globalAlpha = stain.alpha;
        ctx.save();
        ctx.scale(.35 + spread * .65, .48 + spread * .52);
        ctx.drawImage(stain.poolTexture, -stain.extent, -stain.extent);
        ctx.restore();
        ctx.save();
        ctx.scale(.5 + spread * .5, .5 + spread * .5);
        ctx.drawImage(stain.sprayTexture, -stain.extent, -stain.extent);
        ctx.restore();
        // Gravity remains vertical; every run has its own start and stop time.
        for (const drip of stain.drips) {
          const p = Math.min(1, Math.max(0, elapsed - drip.delay) / drip.duration);
          if (p <= 0) continue;
          const length = drip.length * (1 - Math.pow(1 - p, 2));
          const x = drip.x, y = drip.y, w = drip.width;
          const endX = x + drip.bend * p, endY = y + length;
          ctx.fillStyle = '#700c1b';
          ctx.beginPath();
          ctx.moveTo(x - w, y);
          ctx.bezierCurveTo(x - w * .8, y + length * .35, endX - w * .3, endY - length * .15, endX - w * .35, endY);
          ctx.quadraticCurveTo(endX, endY + w, endX + w * .35, endY);
          ctx.bezierCurveTo(endX + w * .3, endY - length * .15, x + w * .8, y + length * .35, x + w, y);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = stain.color;
          ctx.beginPath(); ctx.ellipse(endX, endY, w * .8, w * 1.2, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(245,105,87,.28)';
          ctx.fillRect(endX - w * .3, endY - w * .55, .7, 1);
        }
        ctx.restore();
      });
      ctx.restore();
    }
  }
  global.DeathOverlay = DeathOverlay;
})(typeof window !== 'undefined' ? window : globalThis);
