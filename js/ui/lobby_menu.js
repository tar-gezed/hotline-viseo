(function (root) {
  'use strict';
  class LobbyMenu extends CanvasMenu {
    constructor(network,actions) {
      super();this.network=network;this.onBack=actions.leave;this.notice='';this.roster=Object.values(CONFIG.MASKS);this.rosterFocus=0;
      this.items=[...this.roster.map((m,i)=>({action:()=>this.choose(i)})),
        {action:()=>network.ready()},{action:()=>network.start()},{action:actions.copy},{action:actions.leave}];
    }
    show(){super.show();this.selectedIndex=Math.max(0,this.roster.findIndex(m=>m.id===this.network.members.get(this.network.slot)?.mask));this.rosterFocus=this.selectedIndex;this.notice='';}
    choose(index){
      const member=this.network.members.get(this.network.slot);if(!member)return;
      if(member.ready){this.notice='Annulez PRÊT pour changer de collègue.';this.select(7);return;}
      if(member.mask!==this.roster[index].id)this.network.profileUpdate({mask:this.roster[index].id});
      this.rosterFocus=index;this.notice='';this.select(7);
    }
    move(x,y){
      const i=this.selectedIndex;
      if(i<7){this.rosterFocus=i;this.select(y>0?7:y<0?9:(i+x+7)%7);}
      else if(i===7||i===8)this.select(y<0?this.rosterFocus:y>0?10:i===7?8:7);
      else this.select(y>0?this.rosterFocus:y<0?7:i===9?10:9);
    }
    update(dt,input,w,h){
      const gp=input.gamepad?.justPressed||{};
      if(gp.buttonX){this.network.ready();this.select(7);return;}
      if(gp.buttonStart){if(this.network.canStart())this.network.start();return;}
      if(gp.buttonLB||gp.buttonRB)this.select((this.rosterFocus+(gp.buttonLB?-1:1)+7)%7);
      for(let i=0;i<7;i++)if(input.isJustPressed('Digit'+(i+1)))this.choose(i);
      CoopUI.navigate(this,dt,input,w,h,(x,y)=>this.move(x,y));
      if(this.selectedIndex<7)this.rosterFocus=this.selectedIndex;
    }
    render(c,w,h,input){
      const n=this.network,U=CoopUI,mine=n.members.get(n.slot),chosen=mine?.mask||'vincent';
      const preview=this.selectedIndex<7?this.roster[this.selectedIndex]:CONFIG.MASKS[chosen];
      UITheme.background(c,w,h,this.timer,true);UITheme.begin(c,w,h);this.regions=[];
      U.text(c,'AFTER HOURS / COOP',40,32,500,13,UITheme.pink);
      U.text(c,'SALLE DE BRIEFING',40,69,630,43,UITheme.ivory,'left',true);
      U.text(c,'CODE DU SALON',840,34,170,11,UITheme.muted);
      U.text(c,n.code||'…',840,65,218,32,UITheme.cyan);
      U.button(this,c,9,'COPIER LE LIEN',1068,30,172,48,{color:UITheme.cyan});
      for(let slot=0;slot<5;slot++){
        const p=n.members.get(slot),x=40+slot*243,color=U.colors[slot],local=slot===n.slot;
        U.panel(c,x,109,228,238,p?color+'12':'#151321',12);
        c.fillStyle=p?color:'#4c4056';c.fillRect(x,109,228,local?4:2);
        U.text(c,'P'+(slot+1)+(slot===0?' / HÔTE':''),x+12,132,113,12,color);
        if(!p){U.text(c,'+',x+114,213,100,50,'#584962','center',true);U.text(c,'PLACE LIBRE',x+114,293,200,13,UITheme.muted,'center');continue;}
        U.text(c,p.ready?'PRÊT ✓':local?'VOUS':'EN LIGNE',x+216,132,100,11,p.ready?color:UITheme.muted,'right');
        U.portrait(c,CONFIG.MASKS[p.mask],x+6,146,216,136,2.5,Math.sin(this.timer*2+slot)*1.4);
        U.text(c,CONFIG.MASKS[p.mask].name,x+114,291,204,29,color,'center',true);
        U.text(c,p.name,x+114,315,202,13,UITheme.ivory,'center');
        U.text(c,p.ready?'✓ SERVICE CONFIRMÉ':'CHOIX EN COURS',x+12,336,160,10,p.ready?color:UITheme.muted);
        U.text(c,(p.ping||0)+' ms',x+216,336,60,10,UITheme.muted,'right');
      }
      U.text(c,'01 / CHOISISSEZ VOTRE COLLÈGUE',40,381,760,18,UITheme.ivory);
      this.roster.forEach((m,i)=>{
        const x=40+i*113,selected=m.id===chosen,focus=this.selectedIndex===i,color=U.colors[n.slot||0];
        U.panel(c,x,409,103,125,selected?color+'26':focus?'#382b45':'#211b30',8);
        c.strokeStyle=selected?color:focus?UITheme.ivory:'#493a53';c.lineWidth=selected||focus?3:1;c.stroke();
        U.portrait(c,m,x+4,416,95,81,1.65);
        U.text(c,m.name,x+51,512,94,19,selected?color:UITheme.ivory,'center',true);
        const occupants=[...n.members.values()].filter(p=>p.mask===m.id);
        occupants.forEach((p,j)=>{c.fillStyle=U.colors[p.slot];c.fillRect(x+8+j*17,423,12,4);});
        this.regions.push({index:i,x,y:409,w:103,h:125});
      });
      U.panel(c,860,370,380,213,'#211a2e',14);
      U.text(c,preview.name,881,397,335,32,U.colors[n.slot||0],'left',true);
      U.text(c,preview.role,881,426,335,13,UITheme.ivory);
      U.text(c,'ÉQUIPEMENT',881,455,335,10,UITheme.muted);
      U.text(c,preview.startDesc,881,477,335,14,UITheme.ivory);
      UITheme.wrap(c,preview.perkDesc,881,513,332,13,UITheme.muted);
      U.text(c,mine?.ready?'CHOIX VERROUILLÉ · ANNULEZ PRÊT POUR CHANGER':input?.isGamepadMode?'STICK / CROIX : PARCOURIR · A : CHOISIR':'CLIQUEZ UN PORTRAIT · OU TOUCHES 1–7',40,558,788,12,UITheme.muted);
      const ready=[...n.members.values()].filter(p=>p.ready).length;
      const message=this.notice||(!mine?'Connexion à l’hôte…':n.members.size<2?'Partagez le code : il faut au moins deux collègues.':`${ready} / ${n.members.size} collègues prêts`);
      U.text(c,message,40,603,760,14,mine?.ready?UITheme.cyan:UITheme.ivory);
      U.button(this,c,7,mine?.ready?'✓ PRÊT · ANNULER':'JE SUIS PRÊT',40,633,335,52,{primary:true,color:U.colors[n.slot||0],disabled:!mine});
      U.button(this,c,8,n.isHost?'LANCER LA MISSION':'L’HÔTE LANCE LA MISSION',392,633,395,52,{primary:n.canStart(),color:UITheme.pink,disabled:!n.canStart()});
      U.button(this,c,10,'QUITTER',1045,635,195,48,{color:UITheme.muted});
      U.text(c,input?.isGamepadMode?'A CHOISIR · X PRÊT · START LANCER · B RETOUR':'ENTRÉE VALIDER · TAB CHANGER DE ZONE · ÉCHAP QUITTER',40,705,1170,11,UITheme.muted);
      c.restore();
    }
  }
  root.LobbyMenu=LobbyMenu;
})(typeof window!=='undefined'?window:globalThis);
