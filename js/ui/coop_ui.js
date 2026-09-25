/* Canvas-native coop components, loaded only with multiplayer. */
(function (root) {
  'use strict';
  const UI = {
    colors:['#00f3ff','#ff007f','#39ff14','#ffe600','#ff7700'],
    panel(c,x,y,w,h,color='#242036',cut=12) {
      c.beginPath();c.moveTo(x+cut,y);c.lineTo(x+w,y);c.lineTo(x+w,y+h-cut);c.lineTo(x+w-cut,y+h);c.lineTo(x,y+h);c.lineTo(x,y+cut);c.closePath();c.fillStyle=color;c.fill();
    },
    text(c,value,x,y,width,size=22,color=UITheme.ivory,align='left',heading=false) {
      const label=String(value);let s=size;
      const font=()=>heading?`italic 900 ${s}px GameHeading, Impact, sans-serif`:`bold ${s}px 'Courier New', monospace`;
      c.save();c.font=font();
      while(c.measureText(label).width>width&&s>Math.max(10,size*.65)){s--;c.font=font();}
      let shown=label;
      if(c.measureText(shown).width>width){while(shown.length&&c.measureText(shown+'…').width>width)shown=shown.slice(0,-1);shown+='…';}
      c.textAlign=align;c.textBaseline='middle';c.fillStyle=color;c.fillText(shown,x,y);c.restore();
    },
    portrait(c,mask,x,y,w,h,scale=3,offset=0) {
      c.save();c.beginPath();c.rect(x,y,w,h);c.clip();CharacterArt.portrait(c,mask,x+w/2,y+h*.57+offset,scale);c.restore();
    },
    button(menu,c,index,label,x,y,w,h,{color=UITheme.cyan,primary=false,disabled=false,hint=''}={}) {
      const focused=menu.selectedIndex===index;
      this.panel(c,x,y,w,h,disabled?'#211e2b':primary?color:focused?'#342a46':'#1d192b',8);
      if(focused){c.strokeStyle=disabled?'#72637e':color;c.lineWidth=2;c.stroke();}
      const ink=primary&&!disabled?'#100e20':disabled?'#87798f':UITheme.ivory;
      this.text(c,label,x+w/2,y+h/2-(hint?6:0),w-24,24,ink,'center',true);
      if(hint)this.text(c,hint,x+w/2,y+h-10,w-20,10,ink,'center');
      menu.regions.push({index,x,y,w,h});
    },
    navigate(menu,dt,input,w,h,move) {
      if(!menu.visible)return;
      menu.timer+=dt;menu.selectionAge+=dt;menu.stickTimer-=dt;
      const gp=input.gamepad?.connected?input.gamepad:null;
      if(input.isMenuCancelJustPressed()){menu.onBack?.();return;}
      let x=0,y=0;
      if(input.isJustPressed('ArrowLeft','KeyA','KeyQ')||gp?.justPressed.dpadLeft)x=-1;
      if(input.isJustPressed('ArrowRight','KeyD')||gp?.justPressed.dpadRight)x=1;
      if(input.isJustPressed('ArrowUp','KeyW','KeyZ')||gp?.justPressed.dpadUp)y=-1;
      if(input.isJustPressed('ArrowDown','KeyS')||gp?.justPressed.dpadDown)y=1;
      if(gp&&menu.stickTimer<=0){
        if(Math.abs(gp.leftStick.x)>.55){x=Math.sign(gp.leftStick.x);menu.stickTimer=.2;}
        else if(Math.abs(gp.leftStick.y)>.55){y=Math.sign(gp.leftStick.y);menu.stickTimer=.2;}
      }
      if(x||y)move(x,y);
      if(input.isJustPressed('Tab'))menu.select((menu.selectedIndex+1)%menu.items.length);
      const mouse=input.mouse;
      if(mouse&&!input.isGamepadMode){
        const p=UITheme.point(mouse.x,mouse.y,w,h),moved=menu.lastPointer&&(p.x!==menu.lastPointer.x||p.y!==menu.lastPointer.y);
        const hit=menu.regions.find(r=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h);
        if(hit&&(moved||mouse.leftJustPressed)){menu.select(hit.index);if(mouse.leftJustPressed){menu.activate();menu.lastPointer=p;return;}}
        menu.lastPointer=p;
      }
      if(!mouse?.leftJustPressed&&input.isMenuConfirmJustPressed())menu.activate();
    }
  };
  root.CoopUI=UI;
})(typeof window!=='undefined'?window:globalThis);
