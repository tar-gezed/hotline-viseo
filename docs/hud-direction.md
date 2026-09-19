# HUD en jeu

Les [résultats After Hours](score-direction.md) reprennent les statistiques de la
partie dans une composition distincte : le total final inclut les bonus existants,
avec un décompte et un impact de grade propres à cet écran.

Le HUD reprend les caractères Impact inclinés, l’ivoire, le rose et le cyan du titre. Le score domine en haut à droite, avec une taille de 44 pixels logiques et une ombre dure décalée de 4 pixels. Le combo se place dessous et grandit avec la série, avec un trait fin conservant l’information de decay. Les points de série et le nombre de kills restent affichés. Le total apparaît immédiatement, sans compteur roulant ni halo persistant.

Les impacts de score, combo, changement de vague et arme vide durent 100 ms de temps réel en jeu, y compris pendant le hit stop ; le decay du combo conserve le temps de simulation. Ils partent à leur amplitude maximale et retombent rapidement, sans oscillation. Les synchronisations répétées d’une même vague ou d’une arme vide ne relancent pas l’animation. Un événement `DRY_FIRE` accepté par le contrôleur d’attaque relance l’impact de l’ammo ; le cooldown et les quantités restent ceux du jeu.

`WAVE 01` / `7 LEFT` reste en haut à gauche. Après 2,5 secondes, le titre passe de 26 à 20 pixels et son opacité à 65 %, sur une transition de 500 ms. Le nom du masque reste visible 2,75 secondes, puis disparaît sur 750 ms ; il revient à chaque nouvelle vague. Il reste consultable sans limite de temps dans la pause, au-dessus des choix.

L’ammo utilise une police monospace simple : quantité / capacité réelle, petite unité `RND`, puis nom de l’arme en metadata. À zéro, le compteur grossit et devient rouge, accompagné de `EMPTY / THROW / GRAB`. Un tir à vide donne une frappe blanche de 100 ms. En mêlée, seul le nom de l’arme apparaît. Les bonus de capacité existants restent appliqués à l’affichage.

La mise à l’échelle uniforme suit la base 1280×720 du titre. Les quatre ancrages gardent 32 pixels logiques de marge et utilisent toute la largeur disponible en ultralarge. Le combo se déporte à gauche si le joueur entre dans sa zone habituelle ; une exclusion de 88×88 pixels logiques autour du joueur protège également son sprite pendant les transitions. Pré-vague et ravitaillement conservent leurs informations au centre, sans panneau. Popups de points, flashs événementiels et indicateurs de menace sont conservés.

Les calculs de score, multiplicateurs, fenêtres de combo, règles de vague et consommation de munitions ne changent pas. Les seuls fichiers de production modifiés sont `js/ui/hud.js`, le raccordement de `DRY_FIRE` et du nom du masque dans `js/main.js`, et le rappel du masque dans `js/ui/pause_menu.js`.

## Références

Recherche confiée à GPT‑5.6 Luna High : [capture du premier Hotline Miami](https://www.hookedgamers.com/images/4639/hotline_miami/screenshot_pc_hotline_miami010.jpg), [combo dans Hotline Miami 2](https://cdn.mos.cms.futurecdn.net/3121a85c1f2d8029947ab4da7ac2b6ee.jpg), [combat et typographie cyan/rose](https://i.jeuxactus.com/datas/jeux/h/o/hotline-miami-2-wrong-number/xl/hotline-miami-2-wrong-n-55044a4f41ae6.jpg). Les références guident la hiérarchie et l’absence de panneaux ; les durées d’animation sont des choix de cette implémentation. Aucun asset commercial n’est intégré.

## Vérification reproductible

`npm test` exécute les 21 suites. `test_scoring.js` vérifie aussi l’indépendance des impacts visuels, leur extinction, le reset, l’absence de réannonce lors des synchronisations répétées et le decay inchangé.

Pour le navigateur : démarrer `node tools/serve.cjs --port 8093`, puis `node tools/validate_hud.cjs`. `PLAYWRIGHT_MODULE` peut désigner un package Playwright installé, `CHROME_PATH` un exécutable Chromium et `HUD_TEST_URL` une URL alternative. Ces outils n’ajoutent aucune dépendance de production.

Le script vérifie le dernier tir, deux tentatives de tir à vide successives et une attaque de mêlée avec le vrai contrôleur d’entrée. Il produit 45 captures dans `test-results/hud/`, avec une galerie `index.html` et `validation.json` : intro, arme à feu, combo, vide, tir à vide, mêlée, protection du joueur, intermission et pause, aux formats 1280×720, 1440×900, 1920×1080, 2560×1440 et 3440×1440. Les fixtures d’image sont déterministes, figées dans le navigateur ; l’IA est suspendue pour isoler le HUD. La capture de protection place le sprite réel du joueur dans la zone du combo, caméra figée. Les tests d’entrée se font avant ce gel. La revue des captures est confiée à GPT‑5.6 Luna Max.

Validation du 18 septembre 2026 : les 21 suites Node passent et les cinq formats passent les tests navigateur, sans erreur de page. GPT‑5.6 Luna Max a examiné les 45 captures et validé la hiérarchie, la lisibilité, les marges et la protection du joueur. Sa remarque initiale sur la pause provenait d’une fixture qui superposait le HUD à la pause ; le scénario utilise désormais le véritable état `PAUSED`, qui masque déjà le HUD. Les captures de pause corrigées en 720p et 1440p ont été revues et validées sans chevauchement.
