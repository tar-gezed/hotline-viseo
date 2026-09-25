// Two small reusable surfaces for the whole squad. Dilating the actual sprite's
// alpha follows every mask, limb and weapon without a geometric player oval.
export class PlayerPresentation {
  constructor() { this.size = 160; }
  draw(ctx, player, color) {
    if (!player.isAlive) { player.render(ctx); return; }
    if (!this.sprite) {
      this.sprite = document.createElement('canvas'); this.edge = document.createElement('canvas');
      for (const canvas of [this.sprite,this.edge]) canvas.width = canvas.height = this.size;
      this.spriteContext = this.sprite.getContext('2d'); this.edgeContext = this.edge.getContext('2d');
    }
    const s = this.size, half = s/2, body = this.spriteContext, edge = this.edgeContext;
    body.clearRect(0,0,s,s);
    body.save(); body.translate(half-player.x,half-player.y); player.draw(body,true); body.restore();
    edge.globalCompositeOperation = 'source-over'; edge.clearRect(0,0,s,s);
    for (let i=0;i<8;i++) { const a=i*Math.PI/4; edge.drawImage(this.sprite,Math.cos(a)*1.25,Math.sin(a)*1.25); }
    edge.globalCompositeOperation = 'destination-out'; edge.drawImage(this.sprite,0,0);
    edge.globalCompositeOperation = 'source-in'; edge.fillStyle=color; edge.fillRect(0,0,s,s);
    edge.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.edge,player.x-half,player.y-half);
    player.drawAttackTrail(ctx);
    ctx.drawImage(this.sprite,player.x-half,player.y-half);
  }
}
