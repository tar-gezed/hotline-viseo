import { VERSION, BUTTON, validateInput } from './protocol.js';
export class InputFrames {
  constructor() { this.seq = 0; this.edges = [0,0,0]; }
  capture(input, player, muted = false) {
    const move = muted ? {x:0,y:0} : input.getMovementVector();
    const combat = !muted && !player.isDowned;
    const triggers = combat ? [input.isAttackJustPressed(), input.isThrowOrPickupJustPressed(), input.isExecuteJustPressed()] : [];
    triggers.forEach((v,i) => { if (v) this.edges[i]++; });
    const a = input.getAimAngle(player.x,player.y);
    const buttons = combat ? (input.isAttackDown() ? BUTTON.ATTACK : 0) | (input.isReviveDown?.() ? BUTTON.INTERACT : 0) : 0;
    return { version:VERSION, seq:++this.seq, x:Math.max(-1,Math.min(1,move.x)), y:Math.max(-1,Math.min(1,move.y)), angle:Math.atan2(Math.sin(a),Math.cos(a)), buttons, edges:this.edges.slice() };
  }
}
export class RemoteInputSource {
  constructor() { this.seq = 0; this.edges = [0,0,0]; this.pending = [false,false,false]; this.frame = {x:0,y:0,angle:0,buttons:0}; this.receivedAt = -Infinity; }
  receive(frame, now) {
    if (!validateInput(frame) || frame.seq <= this.seq) return false;
    this.seq = frame.seq; this.receivedAt = now; this.frame = frame;
    frame.edges.forEach((n,i) => { if (n > this.edges[i]) { this.pending[i] = true; this.edges[i] = n; } });
    return true;
  }
  expire(now) { if (now-this.receivedAt > .25) { this.frame = {...this.frame,x:0,y:0,buttons:0}; this.pending.fill(false); } }
  getMovementVector() { const {x,y} = this.frame, n = Math.hypot(x,y); return {x:x/Math.max(1,n),y:y/Math.max(1,n),length:Math.min(1,n)}; }
  getAimAngle() { return this.frame.angle; }
  aimAt(player) { this.worldMouseX = player.x + Math.cos(this.frame.angle)*200; this.worldMouseY = player.y + Math.sin(this.frame.angle)*200; }
  isAttackDown() { return !!(this.frame.buttons & BUTTON.ATTACK); }
  isReviveDown() { return !!(this.frame.buttons & BUTTON.INTERACT); }
  isAttackJustPressed() { return this.pending[0]; }
  isThrowOrPickupJustPressed() { return this.pending[1]; }
  isExecuteJustPressed() { return this.pending[2]; }
  clearFrameTriggers() { this.pending.fill(false); }
  vibrate() {}
}
