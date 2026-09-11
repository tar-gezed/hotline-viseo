/* Collision inspection uses the same coordinates and dimensions as movement. */
(function () {
  'use strict';
  window.MapDebug = {
    enabled: false,
    render(ctx, map, player, enemies) {
      if (!this.enabled || !map) return;
      ctx.save();
      ctx.lineWidth = 2;
      const segment = (a, color) => {
        ctx.strokeStyle = color;
        ctx.beginPath(); ctx.moveTo(a.x1, a.y1); ctx.lineTo(a.x2, a.y2); ctx.stroke();
      };
      (map.walls || []).forEach(w => segment(w, '#ff578b'));
      (map.glassPartitions || []).filter(g => !g.shattered).forEach(g => segment(g, '#48f5ec'));
      (map.doors || []).filter(d => !d.shattered).forEach(d => segment({x1:d.x,y1:d.y,x2:d.x+Math.cos(d.angle)*d.length,y2:d.y+Math.sin(d.angle)*d.length}, '#ffe67b'));
      (map.props || []).filter(p => p.solid).forEach(p => {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle || 0);
        const w = p.collisionWidth || p.width, h = p.collisionHeight || p.height;
        ctx.strokeStyle = '#90f185'; ctx.fillStyle = 'rgba(144,241,133,.10)';
        const x = p.centered ? -w/2 : 0, y = p.centered ? -h/2 : 0;
        ctx.fillRect(x,y,w,h); ctx.strokeRect(x,y,w,h); ctx.restore();
      });
      [player, ...(enemies || [])].filter(e => e && e.isAlive).forEach(e => {
        ctx.strokeStyle = e === player ? '#ffffff' : '#ff895b';
        ctx.beginPath(); ctx.arc(e.x,e.y,e.radius || 14,0,Math.PI*2); ctx.stroke();
      });
      ctx.restore();
    }
  };
}());
