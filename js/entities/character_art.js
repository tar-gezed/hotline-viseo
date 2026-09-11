/* Shared character design: menu portraits and top-down masks use the same palette. */
(function(root){
  'use strict';
  const ink='#211a2d',light='#f2e5c9';
  const rect=(c,color,x,y,w,h)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
  function poly(c,color,pts){c.fillStyle=color;c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();}
  function paintPortrait(c,ch,x,y,scale=1){
    const a=ch.look,id=ch.id,b=a.build;
    c.save();c.translate(x,y);c.scale(scale,scale);
    // Hair falls behind the shoulders, while the face remains a partial mask.
    if(a.longHair)poly(c,a.hair,[[-12,-20],[8,-22],[15,-12],[17,23],[-17,23],[-15,-10]]);
    if(a.curls){
      // Shoulder-length waves form one silhouette, with an asymmetric side part.
      poly(c,ink,[[-13,-20],[-3,-25],[8,-24],[15,-18],[17,-9],[16,-3],[19,5],[17,14],[12,17],[8,12],[-9,12],[-13,17],[-19,13],[-20,6],[-17,0],[-18,-8]]);
      poly(c,a.hair,[[-12,-18],[-3,-23],[8,-22],[13,-17],[15,-8],[14,-2],[17,6],[15,14],[11,14],[8,8],[-10,8],[-13,14],[-17,11],[-18,6],[-15,0],[-16,-8]]);
      poly(c,'#30303b',[[-12,-13],[-15,-5],[-13,1],[-15,8],[-13,12],[-12,6],[-11,0],[-13,-5],[-9,-14]]);
      poly(c,'#30303b',[[12,-14],[14,-6],[12,1],[15,8],[13,12],[12,6],[10,1],[12,-6]]);
    }
    poly(c,ink,[[-5,6],[-16*b,12],[-21*b,29],[21*b,29],[16*b,12],[5,6]]);
    poly(c,a.coat,[[-5,8],[-14*b,13],[-18*b,28],[18*b,28],[14*b,13],[5,8]]);
    poly(c,a.shade,[[-14*b,14],[-18*b,28],[-8,28],[-7,13]]);
    rect(c,a.accent,10*b,19,5,2);
    rect(c,a.shade,-2,25,2,3);rect(c,a.shade,2,24,2,4);
    rect(c,a.accent,-13*b,19,2,6);rect(c,a.skin,-5,4,10,9);
    if(a.dress){poly(c,a.accent,[[-7,11],[0,15],[7,11],[5,17],[-5,17]]);rect(c,a.shade,-10,23,20,2);}
    else {poly(c,light,[[-7,10],[0,16],[7,10],[4,24],[-4,24]]);poly(c,a.accent,[[0,13],[3,17],[1,25],[-2,22],[-2,17]]);}
    poly(c,ink,[[-11,-17],[9,-18],[13,-10],[11,4],[6,11],[-5,11],[-11,4],[-13,-9]]);
    poly(c,a.skin,[[-9,-15],[8,-16],[11,-8],[9,4],[4,9],[-4,9],[-9,3],[-11,-7]]);
    rect(c,'#a66c60',-8,1,3,3);rect(c,'#edc19a',5,0,3,4);
    if(a.bald){poly(c,'#efc4a0',[[-7,-17],[5,-18],[9,-14],[7,-11],[-8,-11]]);rect(c,light,-5,-17,6,2);}
    else if(a.curls){poly(c,a.hair,[[-12,-12],[-11,-20],[-3,-24],[7,-22],[12,-16],[11,-10],[7,-16],[3,-19],[-2,-17],[-7,-12]]);poly(c,'#34313d',[[-9,-18],[-3,-22],[3,-21],[-3,-19],[-8,-15]]);}
    else {poly(c,a.hair,[[-11,-14],[-9,-21],[6,-23],[12,-17],[10,-11],[6,-16],[-5,-17],[-10,-10]]);}
    if(id==='vincent'){
      poly(c,'#93643e',[[-9,-18],[-16,-13],[-17,2],[-10,10],[-7,3],[7,3],[11,10],[17,1],[15,-13],[8,-18]]);
      poly(c,'#d8ac60',[[-9,-15],[-13,-9],[-11,0],[-5,-2],[0,2],[5,-2],[11,0],[13,-9],[9,-15]]);
      rect(c,'#efcd81',-9,-12,6,3);rect(c,'#efcd81',3,-12,6,3);
    }else if(id==='anne'){
      poly(c,ink,[[-13,-21],[-5,-14],[5,-14],[13,-21],[13,-4],[6,2],[0,0],[-6,2],[-13,-4]]);
      poly(c,'#534563',[[-10,-17],[-5,-11],[5,-11],[10,-17],[10,-4],[4,-1],[-4,-1],[-10,-4]]);
      poly(c,'#e0bd79',[[-9,-7],[-3,-5],[-9,-4]]);poly(c,'#e0bd79',[[9,-7],[3,-5],[9,-4]]);
      poly(c,'#b3769d',[[-3,-2],[3,-2],[0,1]]);
    }else if(id==='lucas'){
      poly(c,ink,[[-12,-21],[-3,-15],[3,-15],[12,-21],[14,-5],[5,2],[-5,2],[-14,-5]]);
      poly(c,'#849aa5',[[-10,-17],[-4,-12],[4,-12],[10,-17],[11,-5],[4,-1],[-4,-1],[-11,-5]]);
      poly(c,light,[[-5,-5],[5,-5],[3,2],[-3,2]]);rect(c,ink,-2,-3,4,3);
      rect(c,ink,-9,-8,5,2);rect(c,ink,4,-8,5,2);rect(c,'#d7ba7a',-8,-7,2,1);rect(c,'#d7ba7a',6,-7,2,1);
      rect(c,'#82736a',-11,-1,2,7);rect(c,'#82736a',9,-1,2,7);
    }else if(id==='arnaud'){
      for(const ex of [-11,11]){rect(c,ink,ex-4,-19,8,8);rect(c,'#986c51',ex-2,-17,4,4);}
      poly(c,'#9b7157',[[-10,-16],[10,-16],[13,-7],[8,2],[-8,2],[-13,-7]]);
      rect(c,'#c5a180',-7,-4,14,5);rect(c,ink,-3,-4,6,3);
    }else if(id==='jade'){
      poly(c,light,[[-11,-17],[-6,-12],[0,-19],[6,-12],[11,-17],[12,-6],[5,1],[-5,1],[-12,-6]]);
      poly(c,'#a7bec0',[[-11,-8],[-5,-5],[-4,0],[-10,-3]]);poly(c,'#a7bec0',[[11,-8],[5,-5],[4,0],[10,-3]]);
      rect(c,ink,-8,-7,4,2);rect(c,ink,4,-7,4,2);poly(c,'#d9a75d',[[-2,-5],[2,-5],[3,1],[0,4],[-3,1]]);
    }else if(id==='pap'){
      poly(c,'#b7b7a7',[[-14,-21],[-4,-14],[4,-14],[14,-21],[11,1],[0,5],[-11,1]]);
      for(const ex of [-6,6]){rect(c,ink,ex-5,-13,10,11);rect(c,light,ex-4,-12,8,9);rect(c,'#b39d5e',ex-2,-9,4,5);rect(c,ink,ex-1,-9,2,4);}
      poly(c,'#977448',[[-3,-3],[3,-3],[0,3]]);rect(c,'#a87569',-7,5,4,1);rect(c,'#a87569',3,5,4,1);
    }else if(id==='jc'){
      poly(c,ink,[[-9,-12],[-18,-13],[-19,3],[-13,12],[-9,5],[9,5],[13,12],[19,3],[18,-13],[9,-12]]);
      for(const sign of [-1,1]){poly(c,'#466896',[[sign*10,-11],[sign*16,-10],[sign*16,3],[sign*12,8],[sign*10,2]]);for(let yy=-7;yy<6;yy+=5)rect(c,'#84b2c9',sign<0?-16:12,yy,4,2);}
      poly(c,'#2a364c',[[-10,-8],[0,-5],[10,-8],[9,-1],[3,2],[-3,2],[-9,-1]]);
      rect(c,'#e9c761',-8,-5,5,2);rect(c,'#e9c761',3,-5,5,2);
    }
    if(a.beard==='long'){
      poly(c,ink,[[-10,0],[-6,4],[6,4],[10,0],[10,14],[3,21],[-3,21],[-10,14]]);
      poly(c,'#aea79c',[[-8,2],[-4,6],[4,6],[8,2],[7,13],[2,18],[-2,18],[-7,13]]);
      rect(c,'#e0d7c2',-5,8,2,7);rect(c,'#777780',2,8,2,8);
    }else if(a.beard){
      poly(c,a.beard==='stubble'?'#7b665d':a.hair,[[-9,0],[-5,5],[5,5],[9,0],[8,7],[3,11],[-3,11],[-8,7]]);
      if(a.beard==='stubble'){rect(c,a.skin,-5,5,2,2);rect(c,a.skin,3,5,2,2);}
    }
    if(a.glasses){for(const gx of [-10,1]){rect(c,ink,gx,-8,9,6);rect(c,'#71939a',gx+1,-7,7,3);rect(c,'#d1dbc8',gx+2,-7,3,1);}rect(c,ink,-1,-6,2,2);}
    rect(c,'#75424c',-3,5,6,1);
    c.restore();
  }

  function head(c,ch){
    const a=ch.look,id=ch.id;
    // Aim points right. Hair/beard and animal geometry differ independently.
    if(a.longHair)poly(c,a.hair,[[-12,-11],[1,-10],[7,-6],[7,6],[1,10],[-12,11],[-17,6],[-17,-6]]);
    if(a.curls){
      poly(c,ink,[[-13,-10],[-7,-13],[0,-12],[4,-9],[0,-6],[0,6],[3,10],[-3,13],[-10,12],[-14,8],[-15,2],[-14,-3]]);
      poly(c,a.hair,[[-12,-9],[-7,-11],[-1,-10],[1,-8],[-3,-5],[-3,6],[0,9],[-4,11],[-10,10],[-12,7],[-13,2],[-12,-3]]);
      poly(c,'#34313d',[[-11,-7],[-8,-9],[-5,-9],[-8,-6],[-10,-1],[-9,4],[-11,7],[-12,2]]);
    }
    const skin=a.skin;
    poly(c,ink,[[-7,-7],[3,-9],[9,-5],[11,0],[9,5],[3,9],[-7,7],[-10,0]]);
    poly(c,skin,[[-6,-5],[3,-7],[7,-4],[9,0],[7,4],[3,7],[-6,5],[-8,0]]);
    if(a.hair&&!a.longHair&&!a.curls)rect(c,a.hair,-7,-6,7,12);
    if(a.bald){rect(c,'#ecc09c',-5,-4,6,8);rect(c,light,-4,-3,2,4);}
    if(id==='vincent'){
      poly(c,'#91603c',[[-5,-9],[3,-11],[9,-7],[7,-4],[7,4],[9,7],[3,11],[-5,9],[-8,0]]);
      rect(c,'#d9ad62',0,-7,7,14);poly(c,'#e8c47b',[[5,-4],[12,-2],[12,2],[5,4]]);
    }else if(id==='anne'){
      poly(c,'#50425f',[[-3,-7],[-5,-13],[2,-9],[7,-6],[10,0],[7,6],[2,9],[-5,13],[-3,7]]);
      rect(c,'#e5c36e',5,-6,3,2);rect(c,'#e5c36e',5,4,3,2);rect(c,'#a57691',9,-1,3,2);
    }else if(id==='lucas'){
      poly(c,'#849aa5',[[-3,-6],[-4,-12],[3,-8],[8,-5],[13,-2],[13,2],[8,5],[3,8],[-4,12],[-3,6]]);
      rect(c,light,7,-3,6,6);rect(c,ink,12,-2,3,4);rect(c,ink,4,-6,3,2);rect(c,ink,4,4,3,2);
    }else if(id==='arnaud'){
      rect(c,ink,-4,-12,7,6);rect(c,ink,-4,6,7,6);rect(c,'#a17a5c',-3,-10,5,4);rect(c,'#a17a5c',-3,6,5,4);
      rect(c,'#9b7157',0,-7,8,14);rect(c,'#c5a180',7,-4,5,8);
    }else if(id==='jade'){
      poly(c,light,[[-3,-8],[3,-10],[8,-5],[14,-2],[14,2],[8,5],[3,10],[-3,8],[1,0]]);
      rect(c,ink,6,-5,3,2);rect(c,ink,6,3,3,2);rect(c,'#d9a75d',12,-2,5,4);
    }else if(id==='pap'){
      poly(c,'#d5d1bb',[[-6,-11],[2,-7],[9,-7],[12,0],[9,7],[2,7],[-6,11],[-3,0]]);
      for(const y of [-6,2]){rect(c,ink,4,y,7,5);rect(c,'#e3c888',5,y+1,4,3);rect(c,ink,7,y+1,2,3);}rect(c,'#947044',11,-1,4,2);
    }else if(id==='jc'){
      poly(c,'#41658f',[[-6,-8],[-2,-14],[6,-12],[8,-6],[6,-4],[6,4],[8,6],[6,12],[-2,14],[-6,8],[-3,0]]);
      rect(c,'#82b3ce',-1,-11,4,2);rect(c,'#82b3ce',-1,9,4,2);rect(c,'#26364b',5,-5,5,10);rect(c,'#e8cf74',8,-4,2,2);rect(c,'#e8cf74',8,2,2,2);
    }
    if(a.beard==='long'){poly(c,'#b9b1a1',[[8,-6],[14,-5],[20,0],[14,5],[8,6]]);rect(c,'#777982',12,-2,5,2);}
    else if(a.beard)rect(c,a.beard==='stubble'?'#716159':a.hair,9,-4,3,8);
    if(a.glasses){for(const yy of [-7,1]){rect(c,ink,5,yy,4,6);rect(c,'#a6d1ce',6,yy+1,2,3);}rect(c,ink,6,-1,2,2);}
  }
  const portraits=new Map();
  function portrait(c,ch,x,y,scale=1){
    if(typeof document==='undefined')return paintPortrait(c,ch,x,y,scale);
    let bitmap=portraits.get(ch.id);
    if(!bitmap){bitmap=document.createElement('canvas');bitmap.width=bitmap.height=64;paintPortrait(bitmap.getContext('2d'),ch,32,32,1);portraits.set(ch.id,bitmap);}
    c.save();c.imageSmoothingEnabled=false;c.drawImage(bitmap,x-32*scale,y-32*scale,64*scale,64*scale);c.restore();
  }
  root.CharacterArt={portrait,head};
  if(typeof module!=='undefined')module.exports=root.CharacterArt;
})(typeof window!=='undefined'?window:globalThis);
