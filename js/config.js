/**
 * Hotline Miami: VISEO Arcade Edition - Game Configuration & Constants
 */

// Universal Canvas roundRect polyfill
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, radii = 0) {
    const r = typeof radii === 'number' ? radii : (Array.isArray(radii) ? radii[0] || 0 : 0);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    return this;
  };
}

const CONFIG = {
  // Game & Display Dimensions
  CANVAS: {
    WIDTH: 1280,
    HEIGHT: 720,
    FPS: 60,
    TILE_SIZE: 48,
    CAMERA_LERP: 0.12,
    RETICLE_LEAD: 0.28,
  },

  // Authentic 80s Synthwave & Neon Miami Palette
  COLORS: {
    BG_DARK: '#0b0813',
    BG_FLOOR: '#1a162b',
    BG_GRID: '#281f3d',
    WALL_PRIMARY: '#4a154b',
    WALL_BORDER: '#ff007f',
    NEON_PINK: '#ff007f',
    NEON_CYAN: '#00f3ff',
    NEON_YELLOW: '#ffe600',
    NEON_PURPLE: '#b537f2',
    NEON_LIME: '#39ff14',
    NEON_ORANGE: '#ff7700',
    BLOOD_RED: '#b3001e',
    BLOOD_FRESH: '#ff1744',
    BLOOD_POOL: '#660011',
    WHITE: '#ffffff',
    TEXT_MUTED: '#8f82a8',
    GOLD: '#ffd700',
  },

  // Animal Masks Collection with Unique Perks
  MASKS: {
    vincent: {
      id:'vincent',name:'VINCENT',animal:'Lion',role:"Directeur d’agence",
      quote:'Le dernier mot.',description:'Tout simplement le boss.',
      perkDesc:'Exécutions 25 % plus rapides · capacité des armes à feu −25 %.',
      startDesc:'Magnum · 4 cartouches',color:'#d9ad62',
      perks:{executionTimeMult:.75,ammoCapacityMult:.75,startWeapon:'MAGNUM',startAmmo:4},
      look:{coat:'#2b3f66',shade:'#18243c',accent:'#dca020',pants:'#28283e',hair:'#51352e',beard:'short',glasses:true,build:1,skin:'#dca67f'}
    },
    anne: {
      id:'anne',name:'ANNE',animal:'Panthère',role:'Commerciale',
      quote:'Toujours une longueur d’avance.',description:'Elle a déjà 3 backups de prévus pour 6 missions différentes !',
      perkDesc:'Déplacement +20 % · capacité des armes à feu −25 %.',
      startDesc:'Couteau',color:'#d78baa',
      perks:{speedMult:1.2,ammoCapacityMult:.75,startWeapon:'KNIFE',startAmmo:0},
      look:{coat:'#a83e6d',shade:'#682d54',accent:'#edb0c4',pants:'#29253c',hair:'#181923',curls:true,build:.82,skin:'#e2ad89'}
    },
    lucas: {
      id:'lucas',name:'LUCAS',animal:'Loup',role:'Commercial',
      quote:'Premier jour. Dernier avertissement.',description:'Le petit nouveau de la bande !',
      perkDesc:'Délai entre les tirs −15 % · dispersion +25 %.',
      startDesc:'Uzi · 20 cartouches',color:'#75b8ae',
      perks:{gunCooldownMult:.85,spreadMult:1.25,startWeapon:'UZI',startAmmo:20},
      look:{coat:'#447f71',shade:'#28534e',accent:'#366d62',pants:'#273344',hair:'#302b31',beard:'stubble',fade:true,build:.95,skin:'#cb956f'}
    },
    arnaud: {
      id:'arnaud',name:'ARNAUD',animal:'Ours',role:'Manager',
      quote:'On passe en force.',description:'Toujours là pour nous rappeler de remplir Tempo #RIPShiva !',
      perkDesc:'Impacts de porte létaux (lourds résistants) · déplacement −20 %.',
      startDesc:'Fusil à pompe · 6 cartouches',color:'#c18c74',
      perks:{doorLethal:true,speedMult:.8,startWeapon:'SHOTGUN',startAmmo:6},
      look:{coat:'#eee9db',shade:'#dedad0',accent:'#eee9db',pants:'#302d40',hair:'#99928c',beard:'long',glasses:true,build:1.25,skin:'#d5a282'}
    },
    jade: {
      id:'jade',name:'JADE',animal:'Cygne',role:'Recrutement',
      quote:'Le bon profil, au bon moment.',description:'N\'oubliez pas la prime de cooptation !',
      perkDesc:'Fenêtre de combo +50 % · délai entre les tirs +15 %.',
      startDesc:'Pistolet silencieux · 12 cartouches',color:'#80d2bb',
      perks:{comboTimeMult:1.5,gunCooldownMult:1.15,startWeapon:'SILENCED_PISTOL',startAmmo:12},
      look:{coat:'#1e5247',shade:'#133830',accent:'#286c5e',pants:'#322b40',hair:'#362230',longHair:true,dress:true,build:1.05,skin:'#e5b493'}
    },
    pap: {
      id:'pap',name:'PAP',animal:'Grand-duc',role:'IT Support Manager',
      quote:'J’en ai vu d’autres.',description:'La rumeur dit que c\'est l\'inventeur d\'Internet !',
      perkDesc:'Points par élimination +50 % · déplacement −15 %.',
      startDesc:'Batte de baseball',color:'#dbd2b3',
      perks:{scoreMult:1.5,speedMult:.85,startWeapon:'BAT',startAmmo:0},
      look:{coat:'#afa183',shade:'#726854',accent:'#e4d9bc',pants:'#40424d',hair:'#ece5d4',whiteHair:true,build:1.22,skin:'#d3a287'}
    },
    jc: {
      id:'jc',name:'JC',animal:'Cobra',role:'Chief Information Security Officer',
      quote:'Aucune faille.',description:'Sa magie c\'est sa puissance !',
      perkDesc:'Dispersion −45 % · délai entre les tirs +20 %.',
      startDesc:'M16 · 24 cartouches',color:'#78a5e0',
      perks:{spreadMult:.55,gunCooldownMult:1.2,startWeapon:'M16',startAmmo:24},
      look:{coat:'#3e4562',shade:'#25283d',accent:'#729dd6',pants:'#242638',hair:null,bald:true,build:1.08,skin:'#d49b7d'}
    }
  },

  // Weapon Armory Statistics & Behaviors
  WEAPONS: {
    unarmed: {
      id: 'unarmed',
      name: 'BARE FISTS',
      type: 'melee',
      damage: 1,
      range: 40,
      swingArc: 1.2,
      attackSpeed: 0.22,
      knockback: 180,
      noise: 40,
      ammo: Infinity,
      maxAmmo: Infinity,
      color: '#ffccaa',
      icon: 'punch',
      lethal: false,
    },
    knife: {
      id: 'knife',
      name: 'COMBAT KNIFE',
      type: 'melee',
      damage: 3,
      range: 44,
      swingArc: 1.1,
      attackSpeed: 0.16,
      knockback: 80,
      noise: 15,
      ammo: Infinity,
      maxAmmo: Infinity,
      color: '#e2e8f0',
      icon: 'knife',
      lethal: true,
      silent: true,
    },
    bat: {
      id: 'bat',
      name: 'BASEBALL BAT',
      type: 'melee',
      damage: 2,
      range: 58,
      swingArc: 1.6,
      attackSpeed: 0.28,
      knockback: 350,
      noise: 60,
      ammo: Infinity,
      maxAmmo: Infinity,
      color: '#d2a679',
      icon: 'bat',
      lethal: true,
    },
    katana: {
      id: 'katana',
      name: 'KATANA',
      type: 'melee',
      damage: 4,
      range: 70,
      swingArc: 2.1,
      attackSpeed: 0.20,
      knockback: 220,
      noise: 30,
      ammo: Infinity,
      maxAmmo: Infinity,
      color: '#ffffff',
      icon: 'katana',
      lethal: true,
      cleave: true,
    },
    pipe: {
      id: 'pipe',
      name: 'LEAD PIPE',
      type: 'melee',
      damage: 2,
      range: 50,
      swingArc: 1.4,
      attackSpeed: 0.25,
      knockback: 300,
      noise: 50,
      ammo: Infinity,
      maxAmmo: Infinity,
      color: '#a0aec0',
      icon: 'pipe',
      lethal: true,
    },
    pistol: {
      id: 'pistol',
      name: '9MM PISTOL',
      type: 'gun',
      magSize: 13,
      fireRate: 0.24,
      spread: 0.04,
      bulletSpeed: 960,
      damage: 2,
      pellets: 1,
      noise: 650,
      color: '#38b2ac',
      icon: 'pistol',
      lethal: true,
      recoil: 6,
    },
    silenced_pistol: {
      id: 'silenced_pistol',
      name: 'SILENCED PISTOL',
      type: 'gun',
      magSize: 13,
      fireRate: 0.22,
      spread: 0.03,
      bulletSpeed: 920,
      damage: 2,
      pellets: 1,
      noise: 110,
      color: '#4fd1c5',
      icon: 'silencer',
      lethal: true,
      recoil: 4,
    },
    magnum: {
      id: 'magnum',
      name: '.44 MAGNUM',
      type: 'gun',
      magSize: 6,
      fireRate: 0.48,
      spread: 0.015,
      bulletSpeed: 1250,
      damage: 4,
      penetrate: true,
      pellets: 1,
      noise: 980,
      color: '#f6ad55',
      icon: 'magnum',
      lethal: true,
      recoil: 14,
    },
    shotgun: {
      id: 'shotgun',
      name: 'PUMP SHOTGUN',
      type: 'gun',
      magSize: 6,
      fireRate: 0.68,
      spread: 0.18,
      bulletSpeed: 840,
      damage: 1.6,
      pellets: 7,
      noise: 1050,
      color: '#f56565',
      icon: 'shotgun',
      lethal: true,
      recoil: 18,
    },
    uzi: {
      id: 'uzi',
      name: 'UZI SUBMACHINE',
      type: 'gun',
      magSize: 30,
      fireRate: 0.085,
      spread: 0.13,
      bulletSpeed: 890,
      damage: 1.2,
      pellets: 1,
      noise: 780,
      color: '#ed64a6',
      icon: 'uzi',
      lethal: true,
      recoil: 5,
    },
    m16: {
      id: 'm16',
      name: 'M16 ASSAULT RIFLE',
      type: 'gun',
      magSize: 24,
      fireRate: 0.11,
      spread: 0.045,
      bulletSpeed: 1120,
      damage: 2,
      pellets: 1,
      noise: 860,
      color: '#4299e1',
      icon: 'm16',
      lethal: true,
      recoil: 8,
    },
  },

  // Enemy Archetypes & Attributes
  ENEMIES: {
    mobster_melee: {
      type: 'mobster_melee',
      name: 'Russian Mobster (Melee)',
      hp: 1,
      speed: 150,
      turnSpeed: 9.0,
      reactionTime: 0.28,
      fov: 1.8,
      sightRange: 440,
      attackRange: 45,
      weaponChoices: ['bat', 'knife', 'pipe'],
      points: 500,
      color: '#ffffff',
      suitColor: '#ffffff',
      hairColor: '#3d2314',
    },
    mobster_gun: {
      type: 'mobster_gun',
      name: 'Russian Mobster (Armed)',
      hp: 1,
      speed: 125,
      turnSpeed: 8.0,
      reactionTime: 0.34,
      fov: 1.6,
      sightRange: 480,
      attackRange: 380,
      accuracy: 0.82,
      weaponChoices: ['pistol', 'uzi'],
      points: 600,
      color: '#fef08a',
      suitColor: '#ffffff',
      hairColor: '#1e293b',
    },
    dog: {
      type: 'dog',
      name: 'Russian Attack Dog',
      hp: 1,
      speed: 245,
      turnSpeed: 12.0,
      reactionTime: 0.10,
      fov: 2.4,
      sightRange: 540,
      attackRange: 32,
      pounceRange: 160,
      isDog: true,
      weaponChoices: ['unarmed'],
      points: 750,
      color: '#b45309',
      suitColor: '#78350f',
    },
    shotgunner: {
      type: 'shotgunner',
      name: 'Shotgun Enforcer',
      hp: 1,
      speed: 110,
      turnSpeed: 7.0,
      reactionTime: 0.38,
      fov: 1.5,
      sightRange: 460,
      attackRange: 320,
      accuracy: 0.88,
      weaponChoices: ['shotgun'],
      points: 850,
      color: '#ef4444',
      suitColor: '#1e1e24',
    },
    heavy: {
      type: 'heavy',
      name: 'Russian Heavy Guard',
      hp: 3,
      speed: 95,
      turnSpeed: 5.5,
      reactionTime: 0.45,
      fov: 1.4,
      sightRange: 420,
      attackRange: 50,
      weaponChoices: ['pipe', 'magnum', 'unarmed'],
      isHeavy: true,
      immuneToMeleeKnockdown: true,
      points: 1500,
      color: '#0f172a',
      suitColor: '#0f172a',
    },
  },

  // Scoring & Grade Evaluation
  SCORING: {
    BASE_KILL: 400,
    MELEE_KILL_BONUS: 200,
    EXECUTION_BONUS: 600,
    DOOR_SLAM_BONUS: 250,
    WEAPON_THROW_BONUS: 400,
    GUN_KILL: 300,
    DOG_KILL: 500,
    HEAVY_KILL: 1000,
    COMBO_WINDOW_BASE: 2.8,
    COMBO_WINDOW_DECAY: 0.08,
    COMBO_MULTIPLIERS: [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16],
    GRADES: [
      { grade: 'S', minScore: 45000, color: '#ff007f', title: 'APEX PSYCHOPATH' },
      { grade: 'A+', minScore: 32000, color: '#ffe600', title: 'SUPERHUMAN EXECUTIONER' },
      { grade: 'A', minScore: 22000, color: '#00f3ff', title: 'RUTHLESS HITMAN' },
      { grade: 'B', minScore: 14000, color: '#39ff14', title: 'COLD BLOODED' },
      { grade: 'C', minScore: 7000, color: '#ff7700', title: 'SLOPPY BUTCHER' },
      { grade: 'D', minScore: 0, color: '#8f82a8', title: 'STREET THUG' },
    ],
  },

  // Wave Survival Spawner Settings
  WAVES: {
    INTERMISSION_TIME: 10,
    AMMO_REFILL_PERCENT: 0.6,
    MAX_CONCURRENT_ENEMIES: 36,
  },

  // Cosmetic retention, measured against dense late-wave scenes.
  CLEANUP: {
    MAX_CORPSES: 96,
    CORPSE_SECONDS: 90,
    CORPSE_FADE_SECONDS: 2,
    SUPPLY_WEAPON_WAVES: 2,
  },

  // Player Base Physics & Movement
  PLAYER: {
    BASE_SPEED: 190,
    RADIUS: 16,
    INTERACT_RANGE: 55,
    EXECUTION_DURATION: 1.2,
    THROW_SPEED: 720,
  },

  // Audio Tuning & Master Levels
  AUDIO: {
    MASTER_VOLUME: 0.8,
    MUSIC_VOLUME: 0.7,
    SFX_VOLUME: 0.85,
    COMBAT_BPM: 124,
    MENU_BPM: 100,
  },
};

// Global export / module compatibility
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}
if (typeof global !== 'undefined') {
  global.CONFIG = CONFIG;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
