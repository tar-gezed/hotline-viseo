const assert = require('assert');
const Physics = require('./js/engine/physics');
for (const angle of [0, 0.7, -1.3, Math.PI / 2]) {
  const box = { x: 100, y: 200, width: 90, height: 40, angle };
  for (const local of [{x:0,y:0},{x:40,y:10},{x:49,y:0}]) {
    const x=box.x+local.x*Math.cos(angle)-local.y*Math.sin(angle);
    const y=box.y+local.x*Math.sin(angle)+local.y*Math.cos(angle);
    const hit=Physics.circleVsOBB(x,y,14,box);
    assert(hit.collided, 'inside and edge contacts must be blocked');
    const resolved=Physics.circleVsOBB(x+hit.pushX,y+hit.pushY,14,box);
    assert(!resolved.collided || resolved.penetration<1e-8, 'push must remove overlap');
  }
  assert(!Physics.circleVsOBB(400,400,14,box).collided);
}
console.log('Rotated furniture interior and edge collision passed');
