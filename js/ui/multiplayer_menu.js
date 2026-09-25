(function (root) {
  'use strict';
  class MultiplayerMenu extends CanvasMenu {
    constructor(actions) {
      super(); this.onBack = actions.back; this.message = ''; this.busy = false; this.keypad = false;
      this.form = document.createElement('div');
      this.form.style.cssText = 'position:fixed;z-index:30;display:none;gap:12px;flex-direction:column';
      const field = (label, length) => {
        const input = document.createElement('input'); input.type = 'text'; input.maxLength = length;
        input.placeholder = label; input.setAttribute('aria-label', label); input.autocomplete = 'off'; input.spellcheck = false;
        input.style.cssText = 'box-sizing:border-box;width:100%;height:48px;padding:10px 16px;background:#181428;color:#80d9d2;border:1px solid #80d9d2;font:18px monospace;letter-spacing:2px';
        input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { input.blur(); } if (e.key === 'Enter') { input.blur(); if (input === this.codeField) this.join(); } });
        input.addEventListener('keyup', e => e.stopPropagation()); this.form.append(input); return input;
      };
      this.nameField = field('VOTRE PSEUDO (HÔTE OU INVITÉ)', 18); this.codeField = field('CODE DU SALON', 5);
      this.codeField.addEventListener('input', () => { this.codeField.value = this.codeField.value.trim().toUpperCase(); });
      document.body.append(this.form);
      this.join = () => { if (!this.busy) actions.join(); };
      this.items = [
        {action: () => !this.busy && actions.create()}, {action: this.join},
        {action: () => this.openKeypad()}, {action: this.onBack}
      ];
      this.pad = new CanvasMenu(); this.pad.onBack = () => { this.keypad = false; this.form.style.display = 'flex'; };
      this.alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      this.pad.items = [...this.alphabet].map(char => ({action: () => { if (this.codeField.value.length < 5) this.codeField.value += char; }}));
      this.pad.items.push({action: () => { this.codeField.value = this.codeField.value.slice(0,-1); }}, {action: () => { this.codeField.value = ''; }}, {action: () => { this.pad.onBack(); this.join(); }}, {action: this.pad.onBack});
    }
    openKeypad() { if (this.busy) return; this.keypad = true; this.form.style.display = 'none'; this.pad.show(); this.pad.selectedIndex = 0; }
    show() { super.show(); this.keypad = false; this.form.style.display = 'flex'; }
    hide() { super.hide(); this.form.style.display = 'none'; this.nameField.blur(); this.codeField.blur(); }
    update(dt, input, w, h) {
      if (this.keypad) {
        if (input.gamepad?.justPressed.buttonX) this.codeField.value = this.codeField.value.slice(0,-1);
        CoopUI.navigate(this.pad,dt,input,w,h,(x,y) => {
          const i=this.pad.selectedIndex;
          this.pad.select(i<32 ? y>0&&i>=24 ? 32+Math.floor((i%8)/2) : y<0&&i<8 ? 32+Math.floor(i/2) : (i+x+y*8+32)%32 : y ? (y<0?24:0)+(i-32)*2 : 32+(i-32+x+4)%4);
        }); return;
      }
      if (this.form.contains(document.activeElement)) { this.timer += dt; return; }
      CoopUI.navigate(this,dt,input,w,h,(x,y)=>this.select((this.selectedIndex+(y||x)+4)%4));
    }
    render(c, w, h, input) {
      const U=CoopUI;
      UITheme.background(c,w,h,this.timer,true);UITheme.begin(c,w,h);this.regions=[];
      U.text(c,'AFTER HOURS / COOP EN LIGNE',48,40,1184,14,UITheme.pink);
      U.text(c,'FINISSEZ LA JOURNÉE.',48,137,1160,67,UITheme.ivory,'left',true);
      U.text(c,'ENSEMBLE.',48,209,1100,79,UITheme.cyan,'left',true);
      U.text(c,'VOTRE IDENTITÉ / CRÉER OU REJOINDRE',656,204,550,13,UITheme.cyan);
      U.panel(c,48,282,563,324,'#241b31',16);U.panel(c,631,282,601,324,'#191624',16);
      U.text(c,'01 / RASSEMBLEZ L’ÉQUIPE',73,314,504,16,UITheme.cyan);
      U.text(c,'2 À 5 COLLÈGUES',73,362,504,34,UITheme.ivory,'left',true);
      UITheme.wrap(c,'Créez votre salon, puis partagez son code ou son lien d’invitation. Choisissez vos collègues ensemble avant de lancer la mission.',73,409,496,17,UITheme.muted);
      U.button(this,c,0,this.busy?'CONNEXION…':'CRÉER UN SALON',73,527,513,54,{primary:true,color:UITheme.cyan,disabled:this.busy});
      U.text(c,'02 / REJOIGNEZ VOS COLLÈGUES',656,314,552,16,UITheme.pink);
      U.text(c,'CODE D’INVITATION',656,354,552,13,UITheme.muted);
      U.button(this,c,2,'SAISIR LE CODE À LA MANETTE',656,460,551,40,{color:UITheme.muted,disabled:this.busy});
      U.button(this,c,1,this.busy?'CONNEXION…':'REJOINDRE LE SALON',656,527,551,54,{color:UITheme.pink,primary:true,disabled:this.busy});
      U.text(c,this.busy?'RECHERCHE DES COLLÈGUES…':this.message,48,629,1184,14,UITheme.pink);
      U.button(this,c,3,'RETOUR',48,662,180,39,{color:UITheme.muted});
      U.text(c,input?.isGamepadMode?'STICK / CROIX : CHOISIR · A : VALIDER · B : RETOUR':'ENTRÉE : VALIDER · CLIC : CHOISIR · ÉCHAP : RETOUR',1232,682,965,12,UITheme.muted,'right');
      if(this.keypad)this.renderKeypad(c,input);
      c.restore();
      const f=UITheme.frame(w,h);
      Object.assign(this.form.style,{left:'0',top:'0',width:'100%',height:'100%',pointerEvents:'none'});
      for(const [field,y] of [[this.nameField,218],[this.codeField,373]])Object.assign(field.style,{position:'absolute',left:f.x+656*f.scale+'px',top:f.y+y*f.scale+'px',width:551*f.scale+'px',height:44*f.scale+'px',fontSize:18*f.scale+'px',padding:10*f.scale+'px',pointerEvents:'auto'});
    }
    renderKeypad(c,input) {
      const U=CoopUI,p=this.pad;p.regions=[];
      c.fillStyle='rgba(10,8,22,.96)';c.fillRect(0,0,1280,720);
      U.text(c,'CODE D’INVITATION',640,95,1000,44,UITheme.ivory,'center',true);
      U.text(c,this.codeField.value.padEnd(5,'_').split('').join(' '),640,184,900,60,UITheme.cyan,'center');
      [...this.alphabet].forEach((char,i)=>U.button(p,c,i,char,280+(i%8)*92,259+Math.floor(i/8)*66,76,52,{color:UITheme.cyan}));
      ['EFFACER','VIDER','REJOINDRE','RETOUR'].forEach((label,i)=>U.button(p,c,32+i,label,264+i*194,554,180,51,{color:i===2?UITheme.pink:UITheme.cyan,primary:i===2}));
      U.text(c,input?.isGamepadMode?'CROIX / STICK : CHOISIR · A : SAISIR · X : EFFACER · B : RETOUR':'FLÈCHES : CHOISIR · ENTRÉE : SAISIR · ÉCHAP : RETOUR',640,661,1184,13,UITheme.muted,'center');
    }
  }
  root.MultiplayerMenu=MultiplayerMenu;
})(typeof window !== 'undefined' ? window : globalThis);
