# HUD en jeu

Les [résultats After Hours](score-direction.md) reprennent les statistiques de la
partie dans une composition distincte : le total final inclut les bonus existants,
avec un décompte et un impact de grade propres à cet écran.

Le HUD reprend les caractères Impact inclinés, l’ivoire, le rose et le cyan du titre. Le score domine en haut à droite, avec une taille de 44 pixels logiques et une ombre dure décalée de 4 pixels. Le combo se place dessous et grandit avec la série, avec un trait fin conservant l’information de decay. Les points de série et le nombre de kills restent affichés. Le total apparaît immédiatement, sans compteur roulant ni halo persistant.

Les impacts de score, combo, changement de vague et arme vide durent 100 ms de temps réel en jeu, y compris pendant le hit stop ; le decay du combo conserve le temps de simulation. Ils partent à leur amplitude maximale et retombent rapidement, sans oscillation. Les synchronisations répétées d’une même vague ou d’une arme vide ne relancent pas l’animation. Un événement `DRY_FIRE` accepté par le contrôleur d’attaque relance l’impact de l’ammo ; le cooldown et les quantités restent ceux du jeu.

`WAVE 01` / `7 LEFT` reste en haut à gauche. Après 2,5 secondes, le titre passe de 26 à 20 pixels et son opacité à 65 %, sur une transition de 500 ms. Le nom du masque reste visible 2,75 secondes, puis disparaît sur 750 ms ; il revient à chaque nouvelle vague. Il reste consultable sans limite de temps dans la pause, au-dessus des choix.

L’ammo utilise une police monospace simple : quantité / capacité réelle, petite unité `RND`, puis nom de l’arme en metadata. À zéro, le compteur grossit et devient rouge, accompagné de `EMPTY / THROW / GRAB`. Un tir à vide donne une frappe blanche de 100 ms. En mêlée, seul le nom de l’arme apparaît. Les bonus de capacité existants restent appliqués à l’affichage.

La mise à l’échelle uniforme suit la base 1280×720 du titre. Les quatre ancrages gardent 32 pixels logiques de marge et utilisent toute la largeur disponible en ultralarge. Le combo se déporte à gauche si le joueur entre dans sa zone habituelle ; une exclusion de 88×88 pixels logiques autour du joueur protège également son sprite pendant les transitions. Les annonces de vague, les chiffres et le réappro restent ancrés en haut au centre, indépendamment de la position du joueur et du viseur. Deux exclusions protègent le sprite et le viseur souris/manette lorsqu’ils traversent le texte, sans déplacer celui-ci.

Les calculs de score, multiplicateurs, fenêtres de combo, règles de vague et consommation de munitions ne changent pas. La présentation du HUD est dans `js/ui/hud.js`, les événements de vague et d’arme et la position du viseur sont raccordés dans `js/main.js`. Le nom du masque reste rappelé dans `js/ui/pause_menu.js`.

## Annonces cinétiques de vague

`WAVE 01` frappe en rose pendant **1 200 ms** : glissement horizontal court, cisaillement et ombre dure, sans panneau ni voile sur le monde. La taille du titre passe de 120 à **96 pixels logiques**, soit une réduction de 20 %, avec un ancrage vertical fixe à 136 pixels. `GET READY` est plus petit et ivoire, à 34 pixels du haut. Les **4 secondes existantes** de pré-vague sont conservées : aucun chiffre pendant la première seconde, puis **3 → 2 → 1**, chacun correspondant à une seconde réellement restante (3 lorsque le timer atteint 3 s, 2 à 2 s, 1 à 1 s). Chaque chiffre frappe pendant 100 à 140 ms, avec une amplitude croissante et des impacts plus longs sur 2 et 1. Les chiffres gardent le même centre à 230 pixels du haut, sans glissement vertical ni repositionnement en fonction du joueur. Les vagues suivantes, qui sautent déjà la pré-vague, reçoivent seulement le titre pendant leur démarrage immédiat.

`WAVE 01 CLEAR` (ou `WAVE 12 CLEAR`, sans `#`) apparaît en vert néon pendant **1 200 ms**, avec la même taille réduite de 96 pixels et le même ancrage haut-centre que le titre de début. À partir de 900 ms, la metadata apparaît progressivement à sa position fixe, centrée à 38 pixels du haut : `REAPPRO MUNITIONS DISPO Xs`, avec les secondes réelles arrondies au supérieur. Sa police passe de 12 à **18 pixels logiques**, sans déplacement pendant la transition. Les flèches reprennent exactement le chevron des ennemis en vert : au bord de l’écran vers une caisse hors champ, juste au-dessus si elle est visible. Elles suivent toutes les caisses non ouvertes fournies par le spawner, sans limite à deux emplacements. Après collecte totale, la metadata devient `REAPPRO EPUISES / VAGUE SUIVANTE Xs` et les flèches disparaissent.

Les anciens flashs plein écran de début/fin de vague et les textes de bonus dupliqués sont remplacés par cette typographie. Le bonus reste ajouté immédiatement au score. Les effets de combat restent en place. Le numéro de vague et le compteur d’ennemis gardent leur ancrage supérieur gauche ; chaque diminution du compteur produit une frappe ivoire/blanche de 120 ms, plus forte pour plusieurs éliminations sur la même frame. Une synchronisation identique ne relance rien.

`waveAge`, `clearAge`, `countdownImpact` et `enemyImpact` utilisent exclusivement le delta de présentation. `preWaveTime` et `intermissionTime` sont des copies des timers de simulation ; aucun dessin ne modifie le spawner. La pause fige les deux horloges. `setPreWave` initialise le timer affiché ; le chiffre est déterminé par les secondes restantes, sans normalisation de durée. `setIntermission` annonce une fin de vague une seule fois. Aucun changement de difficulté, de délai de spawn ou de durée de phase n’est introduit.

Validation du 19 septembre 2026 : `npm test` passe les 21 suites, avec régressions ajoutées à `test_arcade_waves.js` et `test_scoring.js` pour les seuils exacts des trois secondes restantes, les événements répétés, les multikills, les caisses ouvertes et l’indépendance des horloges. Le test compare les départs réels des vagues avec une horloge visuelle volontairement deux fois plus rapide.

Pour reproduire les contrôles navigateur : `node tools/serve.cjs --port 8095`, puis `node tools/validate_wave_hud.cjs`. Variables optionnelles : `PLAYWRIGHT_MODULE`, `CHROME_PATH`, `WAVE_HUD_TEST_URL`. Le script produit **102 captures** et une galerie `test-results/wave-hud/index.html` pour **960×540, 1280×720, 1440×900, 1920×1080, 2560×1440 et 3440×1440**. Il vérifie le mouvement réel pendant l’annonce, la pause, l’absence de panneau sur 131 instants d’animation, les zones transparentes du joueur/viseur, les ancrages fixes, les durées de 1 200 ms, les tailles de police et les textes affichés. Les captures isolent les états par des fixtures dans le navigateur ; aucun outil de test n’est chargé en production.

## Références

Recherche confiée à GPT‑5.6 Luna High : [capture du premier Hotline Miami](https://www.hookedgamers.com/images/4639/hotline_miami/screenshot_pc_hotline_miami010.jpg), [combo dans Hotline Miami 2](https://cdn.mos.cms.futurecdn.net/3121a85c1f2d8029947ab4da7ac2b6ee.jpg), [combat et typographie cyan/rose](https://i.jeuxactus.com/datas/jeux/h/o/hotline-miami-2-wrong-number/xl/hotline-miami-2-wrong-n-55044a4f41ae6.jpg). Les références guident la hiérarchie et l’absence de panneaux ; les durées d’animation sont des choix de cette implémentation. Aucun asset commercial n’est intégré.

## Vérification reproductible

`npm test` exécute les 30 suites actuelles. `test_scoring.js` vérifie aussi l’indépendance des impacts visuels, leur extinction, le reset, l’absence de réannonce lors des synchronisations répétées et le decay inchangé.

Pour le navigateur : démarrer `node tools/serve.cjs --port 8093`, puis `node tools/validate_hud.cjs`. `PLAYWRIGHT_MODULE` peut désigner un package Playwright installé, `CHROME_PATH` un exécutable Chromium et `HUD_TEST_URL` une URL alternative. Ces outils n’ajoutent aucune dépendance de production.

Le script vérifie le dernier tir, deux tentatives de tir à vide successives et une attaque de mêlée avec le vrai contrôleur d’entrée. Il produit 45 captures dans `test-results/hud/`, avec une galerie `index.html` et `validation.json` : intro, arme à feu, combo, vide, tir à vide, mêlée, protection du joueur, intermission et pause, aux formats 1280×720, 1440×900, 1920×1080, 2560×1440 et 3440×1440. Les fixtures d’image sont déterministes, figées dans le navigateur ; l’IA est suspendue pour isoler le HUD. La capture de protection place le sprite réel du joueur dans la zone du combo, caméra figée. Les tests d’entrée se font avant ce gel. La revue des captures est confiée à GPT‑5.6 Luna Max.

Validation du 18 septembre 2026 : les 21 suites Node passent et les cinq formats passent les tests navigateur, sans erreur de page. GPT‑5.6 Luna Max a examiné les 45 captures et validé la hiérarchie, la lisibilité, les marges et la protection du joueur. Sa remarque initiale sur la pause provenait d’une fixture qui superposait le HUD à la pause ; le scénario utilise désormais le véritable état `PAUSED`, qui masque déjà le HUD. Les captures de pause corrigées en 720p et 1440p ont été revues et validées sans chevauchement.

## Enemy combat and patrol integration

Enemy shots check cover between body and muzzle. Enemies investigate player gunshots at their heard location, while melee and dry fire do not summon them. Each automatic patrol round has a 50% chance of a reachable doorway excursion and return. Wave totals follow 5, 8, 13, 21, 34, 55, 89, 144 and onward, with at most 36 concurrent enemies and validated spawn space. Visual targeting, body clearance and stuck recovery remain active. The current Node regression runner includes 30 suites. See [combat rules and regression coverage](architecture.md#enemy-combat-and-navigation).

## Performance review — 20 September 2026

Les contours des textes flottants utilisent des jointures arrondies pour supprimer les pics noirs sur les glyphes inclinés, tout en conservant leur sprite en cache, leur animation et leur fondu. Le HUD conserve ses placements et timings. `validate_hud.cjs` et `validate_wave_hud.cjs` passent dans la campagne courante, avec les 30 suites Node. Voir les [cinq cas de texte et les comparaisons visuelles](game-performance.md).

## Coop presentation clocks

Since the September 24 rescue extension, the squad panel distinguishes `EN VIE`, `À TERRE · Ns` and `SPECTATEUR`. A narrow gauge shows remaining bleeding time or rescue progress. Downed teammates have pulsing offscreen arrows. A clockwise progress arc appears only while a teammate is being revived; E/SPACE or gamepad A/X hints are contextual. The local downed hint explains crawling and the help ping.

Player identification now uses a 1.25-world-unit outline following actual sprite alpha, including the mask and held weapon. It replaces the permanent oval. Two 160×160 offscreen canvases are shared by the squad. P1–P5 labels are stacked when crowded instead of overwriting each other. The results and leaderboard layouts are unchanged. Browser checks validate outline proximity to the sprite and preserve all opaque interior pixels; captures are in `test-results/multiplayer/player-outlines.png` and `revive-host.png` / `revive-client.png`.

Coop world-space action/score labels are sent through the bounded presentation event channel. Every client uses the same `AMMO` crate renderer; `claimedMask` gives each player a separate refill and a personal `RÉCUPÉRÉ` state. See the [event audit](multiplayer-events.md) for pickup, execution, glass and supply regression coverage.

`WorldSync.sample` advances the client HUD with frame time; setting presentation dt to zero freezes the WAVE announcement after PREWAVE. Countdown values and spawn markers remain host data. Coop adds a color-coded squad panel and offscreen teammate indicators. Occupied spawn entrances are rerouted with a fresh warning; an entrance with no safe alternative displays `ZONE OCCUPÉE`. The [multiplayer architecture](multiplayer-architecture.md) and `test_multiplayer_presentation.js` cover these behaviors without changing solo HUD timing.
