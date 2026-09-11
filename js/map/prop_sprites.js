/* Original overhead sprites on the same two-world-unit pixel grid as the game. */
(function(root){
  'use strict';
  const supported=new Set(['lounge_sofa','lounge_armchair','pouf_cyan','pouf_navy','plant','planter_box','planter_cabinet','printer_station','acoustic_sofa_pod','elevator','coffee_machine','water_cooler']);
  const cache=new Map();
  const ink='#201a29', shade='#303040', cream='#ded6bd';
  function paint(rect,w,h,type) {
    const R=(color,x,y,width,height)=>{
      x=Math.round(x);y=Math.round(y);width=Math.round(width);height=Math.round(height);
      const right=Math.min(w,x+width),bottom=Math.min(h,y+height);x=Math.max(0,x);y=Math.max(0,y);
      if(right>x&&bottom>y)rect(color,x,y,right-x,bottom-y);
    };
    const box=(x,y,bw,bh,base,light,dark)=>{
      R(ink,x,y,bw,bh);R(base,x+1,y+1,bw-2,bh-2);
      R(light,x+2,y+1,bw-4,1);R(dark,x+1,y+bh-3,bw-2,2);
    };
    const cushion=(x,y,cw,ch)=>{
      // Rounded, compressed upholstery: inner cushions have seams, not frames.
      R('#285868',x+1,y,cw-2,ch);R('#397c85',x,y+1,cw,ch-2);
      R('#55949a',x+2,y+2,cw-4,Math.max(1,ch-6));
      R('#79aba9',x+3,y+1,cw-6,1);R('#427d89',x+2,y+ch-4,cw-4,2);
      R('#2d6270',x+2,y+ch-2,cw-4,1);R('#8bb8b1',x+3,y+3,2,1);
      R('#356874',x+cw-4,y+ch-5,1,2);
    };
    const plant=(cx,cy,size,seed)=>{
      // Pointed leaves, overlapping at a dark crown. Each leaf has a lit edge.
      const colors=['#28634b','#3a8652','#64a45d','#8eb86c'];
      // Dark foliage under the individual leaves keeps the crown dense and legible.
      for(let y=-Math.ceil(size);y<=size;y++)for(let x=-Math.ceil(size);x<=size;x++) {
        const angle=Math.atan2(y,x),edge=size*(.67+.10*Math.sin(angle*5+seed));
        if(x*x+y*y<edge*edge)R('#1c3b32',cx+x,cy+y,1,1);
      }
      for(let i=0;i<9;i++){
        const angle=i*2.399+seed,dx=Math.cos(angle),dy=Math.sin(angle);
        const length=size*(.72+(i%3)*.11),thickness=Math.max(1,size*.29);
        for(let y=-Math.ceil(size);y<=size;y++)for(let x=-Math.ceil(size);x<=size;x++){
          const along=x*dx+y*dy,across=-x*dy+y*dx;
          if(along<0||along>length)continue;
          const edge=Math.sin(along/length*Math.PI)*thickness;
          if(Math.abs(across)<=edge)R(Math.abs(across)<.55?'#abc779':colors[(i+(across<0?1:0))%4],cx+x,cy+y,1,1);
        }
      }
      R('#254635',cx-1,cy-1,3,3);R('#9eba70',cx,cy,1,1);
    };
    if(type==='elevator') {
      // A flush arrival pad / threshold, never upright doors on a horizontal floor.
      R('#474b55',3,h*.4,w-6,h*.45);R('#727980',4,h*.4,w-8,1);
      for(let x=5;x<w-4;x+=4)R('#353943',x,h*.4+3,1,h*.45-5);
      for(const cx of [w*.38,w*.62])for(let row=0;row<4;row++)R('#b3b5a2',cx-row,h*.13+row,row*2+1,1);
      return;
    }
    if(type==='lounge_sofa'||type==='lounge_armchair') {
      R('#272331',3,h-3,w-6,3);box(1,1,w-2,h-3,'#25495b','#5b8d94','#172f43');
      box(3,2,w-6,Math.max(5,h*.23),'#4b9198','#85b7b7','#285967');
      const count=type==='lounge_sofa'?Math.max(2,Math.round(w/27)):1;
      const cw=(w-12)/count;
      for(let i=0;i<count;i++)cushion(6+i*cw,h*.27,cw-1,h*.60);
      box(2,4,4,h-8,'#46878e','#72a8a7','#244857');
      box(w-6,4,4,h-8,'#346b7b','#6c999d','#213e51');
      R('#8ea69c',7,h-4,w-14,1);
      if(type==='lounge_sofa'&&w>50){R('#99b0a2',w*.72,h*.34,6,5);R('#536c71',w*.72+1,h*.34+4,5,2);}
      return;
    }
    if(type.startsWith('pouf_')) {
      const blue=type==='pouf_navy',cx=(w-1)/2,cy=(h-1)/2,rx=w/2-1,ry=h/2-1;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const d=((x-cx)/rx)**2+((y-cy)/ry)**2;
        if(d<=1)R(d>.79?ink:y>h*.68?(blue?'#35445f':'#286268'):y<h*.3?(blue?'#718398':'#80b5ac'):(blue?'#50627d':'#49978f'),x,y,1,1);
      }
      R(blue?'#9baba8':'#abd0b5',w*.28,h*.22,w*.35,1);
      R(blue?'#34445b':'#326e6a',w*.22,h*.68,w*.56,1);
      R(blue?'#34445b':'#326e6a',w*.16,h*.57,1,2);
      R(blue?'#34445b':'#326e6a',w*.79,h*.57,1,2);
      R(ink,cx,cy,1,1);R(cream,cx-1,cy-1,1,1);return;
    }
    if(type==='plant'||type==='planter_box'||type==='planter_cabinet') {
      if(type==='plant') {
        box(w*.25,h*.26,w*.5,h*.53,'#a86b49','#d19d6e','#694332');
        R('#382e2b',w*.32,h*.31,w*.36,h*.30);
        plant(w*.5,h*.47,Math.min(w,h)*.46,.8);
      } else {
        box(0,1,w,h-2,'#997d55','#d1b88a','#604a40');
        if(type==='planter_cabinet') {
          // Visible wooden top beside the planting trough; no front-facing drawers.
          R('#6c543e',2,h*.58,w-4,1);R('#bfa270',3,h*.65,w-6,h*.22);
          R('#dbc492',4,h*.66,w-8,1);R('#90764f',7,h*.79,w*.28,1);
          R('#ebe3c6',w*.69,h*.67,5,3);R('#849594',w*.69+1,h*.67+1,3,1);
        }
        const fh=type==='planter_cabinet'?h*.53:h-4;
        R('#343529',3,3,w-6,fh-2);
        const count=Math.max(2,Math.round(w/15));
        for(let i=0;i<count;i++)plant(7+i*(w-14)/(count-1),fh*.57+1,Math.min(fh*.48,9),i*.7);
      }return;
    }
    if(type==='printer_station') {
      box(1,1,w-2,h-2,'#aeb7b0','#f0e6cf','#626e77');
      box(3,3,w*.61,h*.60,'#cdd2c1','#f4eedb','#7b8d8a');
      R('#668789',5,5,w*.61-4,h*.30);R('#aac5b3',6,6,w*.61-6,1);
      R('#273e48',w*.70,3,w*.2,h*.34);R('#56c9be',w*.73,4,w*.14,2);
      R('#d6dfba',w*.73,h*.27,1,1);R('#c6687a',w*.83,h*.27,1,1);
      R('#27333c',4,h*.72,w-8,3);R('#efe8d5',6,h*.69,w*.53,2);
      R('#71827d',4,h-4,w-8,1);return;
    }
    if(type==='acoustic_sofa_pod') {
      // Open-front booth: visible carpet, thick U-shaped acoustic shell and seats.
      R('#253846',0,0,w,h);R('#5f6969',4,4,w-8,h-4);
      R('#82897d',5,5,w-10,1);R('#263342',0,0,6,h);R('#263342',w-6,0,6,h);R('#263342',0,0,w,6);
      R('#779593',1,1,w-2,2);R('#466674',2,4,2,h-5);R('#466674',w-4,4,2,h-5);
      for(let y=9;y<h-2;y+=7){R('#91a6a0',1,y,3,1);R('#91a6a0',w-4,y,3,1);}
      cushion(6,9,w*.23,h-17);cushion(w*.77-6,9,w*.23,h-17);
      box(w*.38,11,w*.24,h*.49,'#b49968','#e1c997','#775f47');
      R('#d8dac2',w*.43,14,3,4);R('#425661',w*.52,h*.35,2,3);
      // No sill across the entrance: the open footprint reads from above.
      R('#8c9385',w*.29,h-5,w*.42,1);return;
    }
    if(type==='coffee_machine') {
      box(1,1,w-2,h-2,'#394653','#718383','#182332');
      R('#96856c',3,3,w-6,3);R('#191f29',3,h*.48,w-6,h*.35);
      R('#dddbbf',w*.35,h*.56,4,4);R('#66b9ad',w-5,4,2,2);return;
    }
    box(1,1,w-2,h-2,'#adb9b9','#e0e1c9','#586d7d');
    for(let y=2;y<h*.65;y++)for(let x=2;x<w-2;x++)if(((x-w*.5)/(w*.36))**2+((y-h*.34)/(h*.27))**2<1)R(y<h*.25?'#a0d0c5':'#4c96a5',x,y,1,1);
    R('#ba5b73',w*.33,h*.74,2,2);R('#4584ac',w*.63,h*.74,2,2);
  }
  function render(ctx,p) {
    if(!supported.has(p.type))return false;
    const w=Math.max(8,Math.min(512,Math.round(p.width/2))),h=Math.max(8,Math.min(512,Math.round(p.height/2)));
    if(typeof document!=='undefined' && typeof ctx.drawImage==='function') {
      const key=p.type+':'+w+':'+h;let sprite=cache.get(key);
      if(!sprite){sprite=document.createElement('canvas');sprite.width=w;sprite.height=h;const c=sprite.getContext('2d');paint((color,x,y,bw,bh)=>{c.fillStyle=color;c.fillRect(x,y,bw,bh);},w,h,p.type);if(cache.size>=128)cache.clear();cache.set(key,sprite);}
      ctx.imageSmoothingEnabled=false;ctx.drawImage(sprite,p.x,p.y,p.width,p.height);
    } else paint((color,x,y,bw,bh)=>{ctx.fillStyle=color;ctx.fillRect(p.x+x*p.width/w,p.y+y*p.height/h,bw*p.width/w,bh*p.height/h);},w,h,p.type);
    return true;
  }
  const api={render};root.PropSprites=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
