# Hotline Viseo: After Hours

> Un jeu d'action / shooter rétro néon en vue du dessus inspiré de *Hotline Miami*, situé dans les locaux stylisés de l'agence VISEO. Développé en pur JavaScript standard (ES6+), HTML5 Canvas 2D et Web Audio API, sans framework ni backend applicatif. Le mode coop charge à la demande un bundle WebRTC/MQTT vendorisé localement.

[![JavaScript: Vanilla ES6+](https://img.shields.io/badge/JavaScript-Vanilla%20ES6+-yellow.svg)](#)
[![Runtime: Static Browser](https://img.shields.io/badge/Runtime-Static%20Browser-brightgreen.svg)](#)
[![Hosting: GitHub Pages](https://img.shields.io/badge/Hosting-GitHub%20Pages%20Ready-blue.svg)](https://tar-gezed.github.io/hotline-viseo/)
[![CI/CD: Deploy Pages](https://github.com/tar-gezed/hotline-viseo/actions/workflows/deploy.yml/badge.svg)](https://github.com/tar-gezed/hotline-viseo/actions/workflows/deploy.yml)
[![Tests: 31 Node Suites Passing](https://img.shields.io/badge/Tests-31%20Passing-success.svg)](#)

---

## Sommaire / Table of Contents
- [Running and inspecting the game](#running-and-inspecting-the-game)
- [GitHub Pages & Déploiement Automatique](#github-pages--déploiement-automatique)
- [Multijoueur coopératif](#multijoueur-coopératif)
- [Commandes & Contrôles](#commandes--contrôles)
- [Architecture & Organisation du projet](#architecture--organisation-du-projet)
- [Roster des 7 Personnages](#roster-des-7-personnages)
- [Map editing](#map-editing)
- [Importer une carte dans le jeu](#importer-une-carte-dans-le-jeu)
- [Dessiner et modifier les sols](#dessiner-et-modifier-les-sols)
- [Verification](#verification)
- [Performances et nettoyage](#performances-et-nettoyage)
- [Vérifications des passages et de l’écran de mort](#vérifications-des-passages-et-de-lécran-de-mort)
- [Départs du joueur, armes et arrivées ennemies](#départs-du-joueur-armes-et-arrivées-ennemies)
- [Scoring et classement V2](#scoring-et-classement-v2)
- [Règles de contribution & Commits (AGENTS.md)](#règles-de-contribution--commits)

---

# Running and inspecting the game

Les sept personnages jouables sont désormais **Vincent, Anne, Lucas, Arnaud, Jade, PAP et JC**. La sélection dédiée affiche un grand portrait actif, son métier, son animal, ses bonus/malus et son équipement initial. Les armes de départ reviennent à chaque nouvelle partie. Leurs portraits pixel art ainsi que leurs sprites en jeu en vue plongeante (marche, visée, exécution, mort) ont été intégralement refondus dans l'esprit authentique de *Hotline Miami*. Le [détail des personnages](docs/character-direction.md) et le comparatif visuel `character_review.html` documentent leurs silhouettes, leurs règles et les références Hotline Miami.

Double-cliquer sur **Lancer-le-jeu.cmd** (Windows), ou lancer **`npm start`** dans ce dossier avec Node.js 18+ puis ouvrir http://localhost:8080. Aucune dépendance npm à installer pour jouer en local. Garder le serveur ouvert ; Ctrl+C l'arrête. Si le port est occupé : `npm start -- --port 8082`, puis http://localhost:8082.

Pour une session de test avec des amis sur Internet (Windows), double-cliquez sur **Lancer-avec-des-amis.cmd**. Le launcher utilise `cloudflared` depuis le PATH ou depuis `.cache/cloudflared/cloudflared.exe` ; il détecte aussi `cloudflared.exe` placé à la racine du projet. Si le programme manque, téléchargez la version Windows x64 depuis les [releases officielles Cloudflare](https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe), renommez le fichier en `cloudflared.exe` et placez-le dans `.cache/cloudflared/` à la racine du projet. Le dossier `.cache/` est ignoré par Git : le binaire reste local et n’est pas ajouté au dépôt. Le launcher affiche aussi ces instructions lorsqu’il ne trouve pas `cloudflared`.

Le launcher démarre le jeu en HTTPS via un [Cloudflare Quick Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/), ouvre le lien dans le navigateur et le copie dans le presse-papiers. Partagez ce lien ; créez ensuite un salon multijoueur et envoyez le lien/code de salon aux autres joueurs. Appuyez sur **Ctrl+C** dans la fenêtre du launcher pour arrêter le serveur et le tunnel. L’adresse aléatoire change au prochain lancement. Le serveur public expose les pages du jeu et de l’éditeur, leurs ressources et les notices/licences de `vendor/` ; les autres documents, tests et outils du dépôt restent bloqués. Toute personne ayant l’URL du tunnel peut accéder au jeu pendant qu’il tourne ; Quick Tunnel est destiné aux tests, pas à l’hébergement permanent.

Ne pas ouvrir `index.html` en `file://` : le navigateur interdit la lecture automatique de `maps/active.json`. Le serveur local sert simplement les fichiers, sans modifier la carte. Alternative : `python -m http.server 8080`.

Les brouillons et cartes importées dans le navigateur dépendent de l'origine (protocole, hôte et port). Pour récupérer un travail réalisé sous une autre adresse, importer son JSON dans l'éditeur. Conserver une copie des exports.

## Écran titre et menus

Le lancement ouvre **HOTLINE VISEO** : logo animé, silhouettes de bâtiments en parallaxe et cinq choix principaux. **COMMENCER MA JOURNÉE** mène à la sélection des sept personnages ; **MULTIJOUEUR (2–5)**, en deuxième position, ouvre la coop ; **CONTRÔLES** sépare clavier/souris et manette ; **AUDIO** règle musique et effets ; **TOOLS / MAPS** donne accès aux cartes et à l’éditeur existants. **CRÉDITS**, en bas à droite, présente quinze postes tous attribués à **Targezed**.

La musique démarre au chargement si le navigateur autorise l’autoplay. Sinon, une touche, un clic n’importe où dans la page ou un toucher déverrouille le son, sans devoir choisir une option ; les réglages de volume et de mute sont conservés.

Flèches ou WASD/ZQSD, croix directionnelle ou stick gauche pour choisir ; Entrée/Espace ou A/× pour valider ; Échap/Retour arrière ou B/○ pour revenir. La souris sélectionne au survol et valide au clic. Les chiffres 1–7 sélectionnent un personnage. Le retour au titre garde ce choix en mémoire pendant la session.

Les deux volumes et le mute musique sont sauvegardés dans `hotline-viseo-audio-v1` lorsque le navigateur autorise le stockage. **Pause → AUDIO** utilise les mêmes réglages ; revenir à la pause puis reprendre conserve la partie et la phase de vague. Les flèches gauche/droite règlent par pas de 5 %, les pistes acceptent clic et glisser. Le thème de menu et le déverrouillage audio restent ceux du jeu.

La [direction et validation des menus](docs/menu-direction.md) documente les composants Canvas, les références et les captures aux formats 1280×720, 1440×900, 1920×1080 et 3440×1440.

Le [HUD en jeu](docs/hud-direction.md) privilégie le score et le combo, avec des impacts brefs uniquement sur événement. Vague et masque s’atténuent, le masque reste consultable en pause. L’ammo devient rouge à zéro et réagit à chaque tir à vide ; la mêlée n’affiche que le nom de l’arme. La validation couvre aussi 2560×1440, avec 45 captures et des essais d’armes réels dans le navigateur.

Les annonces de vague utilisent une typo inclinée sans panneau, réduite de 20 % et ancrée en haut au centre : `WAVE 01` pendant **1 200 ms**, puis **3 → 2 → 1** au rythme des trois secondes réellement restantes dans les **4 secondes de préparation existantes**. `WAVE 01 CLEAR` vert dure aussi **1 200 ms**, sans `#`. Le texte de réappro agrandi affiche son timer réel en haut au centre, à position fixe, avec des flèches vertes vers chaque caisse encore disponible. Le compteur d’ennemis réagit aux éliminations. Les timings de spawn restent inchangés ; les [détails et contrôles sur six résolutions](docs/hud-direction.md#annonces-cinétiques-de-vague) sont documentés.

## GitHub Pages & Déploiement Automatique

Le jeu est déployé et jouable publiquement en ligne sur GitHub Pages à l'adresse :
👉 **https://tar-gezed.github.io/hotline-viseo/**

Le déploiement est entièrement automatisé par GitHub Actions :
- **Workflow :** `.github/workflows/deploy.yml` déclenché à chaque push sur la branche `main` (ou manuellement via *Actions*).
- **Validation CI :** Exécute automatiquement la suite complète des 31 suites de régression (`npm test`) avant le packaging.
- **Publication Pages :** Utilise les actions officielles `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3` et `actions/deploy-pages@v4`.
- **Prévisualisation dynamique Slack & Réseaux (Open Graph) :** Le `<head>` de `index.html` intègre les métadonnées Open Graph (`og:image`, `og:title`, etc.), Twitter Cards (`summary_large_image`) et la couleur d'accent néon (`theme-color: #ff007f`). L'image de prévisualisation au format standard 1200×630 (`assets/images/og-preview.png`) est rafraîchie dynamiquement lors du déploiement via un navigateur headless Chromium (`tools/generate_preview.cjs`), avec conservation d'une image de secours haute définition.
- **Identité visuelle & Favicons :** Intégration du logo officiel inspiré de l'emblème chevron de VISEO revisité en néon cyan/magenta synthwave. Les favicons sont fournis en multi-résolution (`favicon.ico`, `assets/images/favicon-16x16.png`, `assets/images/favicon-32x32.png`, `assets/images/apple-touch-icon.png` 180×180, et `assets/images/logo-512x512.png`), avec chemins relatifs garantissant un affichage optimal sur GitHub Pages.
- **Compatibilité sous-dossier :** Tous les chemins de ressources (scripts, styles, cartes) sont relatifs (`maps/active.json`, `css/style.css`, etc.) pour fonctionner indifféremment à la racine ou sous le préfixe `/hotline-viseo/`. Le fichier `.nojekyll` est présent à la racine pour désactiver le traitement Jekyll.
- **Configuration GitHub requise :** Dans le dépôt GitHub, sous **Settings > Pages > Build and deployment > Source**, sélectionner **GitHub Actions**.

Pour tester le rendu sous le préfixe GitHub Pages en local : **`npm run preview:pages`**, puis ouvrir http://localhost:8081/hotline-viseo/.
Pour regénérer l'image Open Graph 1200×630 en local (nécessite Playwright) : **`npm run preview:generate`**.

## Musique de combat

La transition de fin de vague reste fluide sans arrêt supplémentaire de simulation : les textes lumineux sont mis en cache et les polices de victoire préparées dans le menu. Le [diagnostic de performances](docs/wave-transition-performance.md) détaille les mesures avec et sans musique et le scénario de vérification dans le navigateur.

Le **morceau de combat original est conservé en première position**, avec sa partition, ses sons et ses fills. Cinq compositions supplémentaires le suivent dans la rotation ; leurs boucles font **24 mesures, moins de 49 secondes**.

| Morceau | Harmonie | Tempo | Boucle |
| --- | --- | --- | --- |
| Original — Combat | Partition historique en ré mineur | 124 BPM | 7,7 s |
| Neon Lockdown | Dm – F – C – Bb ; proche du thème original | 124 BPM | 46,5 s |
| Chrome Pursuit | Am – F – G – Em ; motif pulsé | 130 BPM | 44,3 s |
| Violet Afterburn | Dm – Bb – F – C ; phrases plus amples | 120 BPM | 48 s |
| Redline Protocol | Em – C – Am – Bm ; motif court et percussif | 132 BPM | 43,6 s |
| Last Elevator | Am – G – F – Em ; refrain ascendant puis descendant | 126 BPM | 45,7 s |

Les nouveaux morceaux alternent huit mesures de thème, quatre de break basse/batterie, quatre de réponse et huit de reprise. Les mélodies sont écrites accord par accord, avec des notes d'accord sur les temps forts et des notes de passage dans la tonalité. La basse respecte les tierces majeures et mineures, les nappes changent avec l'accord, et les leads restent moins aigus et moins résonants que dans la première révision.

Chaque nouvelle entrée en combat avance dans la rotation, y compris après une défaite. Une vague longue boucle son morceau ; les appels répétés pendant la même vague ne le relancent pas. Le tempo reste stable, tandis que l'adrénaline enrichit les percussions et ouvre la basse. Les thèmes de menu, d'intermission et de défaite ainsi que le mute et le volume sont conservés. Une marge de sortie réduit le risque de saturation des transitoires.

`test_music.js` vérifie les six partitions et la conservation exacte des événements du morceau original, les notes fortes, les basses, la rotation et les commandes. Le [détail de la révision et des rendus audio](docs/music-direction.md) documente les références et l'outil d'export WAV, qui utilise le vrai moteur Web Audio sans ajouter de dépendance au jeu.

## Multijoueur coopératif

**MULTIJOUEUR → CRÉER UN SALON** crée un code à cinq caractères. Partagez **COPIER LE LIEN**, ou saisissez le code dans **REJOINDRE LE SALON**. Le champ accepte le collage ; un pavé virtuel permet aussi de rejoindre entièrement à la manette. Les liens `?room=7K9XM` conservent le sous-dossier GitHub Pages.

Dans le lobby, choisissez directement l’un des **sept portraits** (clic, 1–7, ou croix/stick puis A), consultez son métier, son équipement et ses bonus, puis validez **JE SUIS PRÊT** (X à la manette). L’hôte lance avec le bouton ou Start lorsque les 2 à 5 collègues sont prêts. Les choix identiques sont autorisés ; P1 à P5 gardent leur couleur.

Les joueurs partagent la mission sans tirs alliés. Un joueur touché tombe **À TERRE** : il rampe à 22 % de sa vitesse et dispose de **25 secondes** avant de mourir. Un collègue debout à proximité maintient **E ou ESPACE**, ou **A/X à la manette**, pendant **2 secondes** pour le relever avec 0,8 s de protection. Relâcher, s’éloigner, perdre le sauveteur ou fermer une porte entre eux interrompt le soin ; deux sauveteurs ne l’accélèrent pas. Le HUD affiche le saignement et un anneau indique la progression de réanimation. Un mort observe un survivant (Q/D, clic gauche/droit ou LB/RB), puis réapparaît à l’intermission avec son arme de départ ; les collègues encore à terre sont également remis sur pied. La défaite survient dès que tous les connectés sont à terre ou morts. Le solo conserve sa mort immédiate.

Un **liseré fin épouse la silhouette réelle** de chaque collègue, masque et arme compris, à la place des ovales. Les tags P1–P5 restent visibles et s’écartent lorsqu’ils se chevauchent. Les touches 1–4 ou la croix directionnelle émettent des pings d’équipe. **Échap/Start chez l’hôte suspend toute l’escouade**, comme son onglet caché ; chez un client, les options restent locales. Le bouton **QUITTER LA ROOM** revient immédiatement au titre ; le départ de l’hôte clôture la session. Le solo propose aussi **QUITTER LA PARTIE** dans sa pause.

Le pseudo se renseigne dans le champ commun **VOTRE IDENTITÉ**, avant de créer ou rejoindre. Chaque caisse de ravitaillement offre une recharge à **chaque joueur**, une seule fois par caisse, et affiche `AMMO` puis `RÉCUPÉRÉ` pour le joueur servi. Les textes d’action, bris de verre, impacts, exécutions et sons sont répliqués vers tous les clients. Les armes lancées cassent les vitres et rebondissent sur les portes et le décor. L’[audit des événements et ses tests](docs/multiplayer-events.md) suit chaque correction.

Les résultats présentent un **MVP**, puis les colonnes individuelles (rangs, KOs, morts, arme favorite, scores). Espace/Entrée/A ou le bouton de votre colonne valide le retour collectif au lobby. Le classement d’équipe est conservé localement chez l’hôte, séparément du solo.

Chez les joueurs non hôtes, les balles, les portes et les gestes d’exécution s’animent entre les snapshots réseau ; le tir local déclenche immédiatement traceur, recul, flash et son. Les effets sont regroupés et bornés pour les fusillades à cinq. Les collisions, dégâts et scores restent décidés par l’hôte. Les [mesures de performance coop](docs/multiplayer-performance.md) précisent le protocole de stress et ses limites.

Les lauriers du MVP et du tableau des scores partagent le même dessin, centré sur le chiffre et adapté aux deux tailles. Avec l’environnement Playwright de validation, `node tools/validate_results.cjs` contrôle leur rendu et produit 16 captures dans `test-results/results/`.

Le mode utilise **Trystero MQTT 0.25.4 vendorisé** dans `vendor/`, sans import CDN ni installation npm pour jouer. Seuls les relais publics de découverte et WebRTC nécessitent Internet ; le solo ne charge aucun module réseau. Les détails du protocole, les limites NAT et les commandes de test sont dans [l’architecture multijoueur](docs/multiplayer-architecture.md). HTTPS ou localhost est requis. Le bouton **COMMENCER MA JOURNÉE** garde le parcours solo habituel.

Validation : **31 suites Node** (les 23 historiques + 7 coop + 1 serveur site-only), scénario réel MQTT/WebRTC à cinq contextes Chrome, combat avec 180–220 ms d’aller-retour et 20 % de perte injectés, test des entrées occupées en vague 2, fondu du bandeau client, navigation via l’API Gamepad et captures à quatre résolutions. La manette est simulée via l’API standard ; aucun essai de matériel physique ni entre plusieurs accès Internet indépendants n’est revendiqué. Reproduction : `node tools/validate_multiplayer.cjs` avec Playwright de développement et le serveur sous `/hotline-viseo/` ; voir la documentation liée.

## Commandes & Contrôles

- WASD / ZQSD: move; mouse: aim; left click: attack.
- E / right click: pick up a nearby weapon, otherwise throw the held weapon.
- Space: execute; R: restart; Escape / P: pause.
- Portes : marcher contre une porte déverrouillée l'ouvre ; si le battant frappe un autre ennemi devant lui, celui-ci est assommé. Le personnage qui pousse n'est jamais touché par sa propre poussée, et le retour automatique est inoffensif. **Espace / Y à la manette** donne un coup volontaire près d'une porte (priorité à l'exécution d'un ennemi au sol). Un coup assomme ; le masque Don Juan permet les impacts létaux. Une porte ne frappe chaque cible qu'une fois par poussée ou coup et son retour ne provoque pas de dégâts.
- F2: show collision geometry and actor radii during play.
- F3: pause the run and open the map editor in a new tab.

The map editor is at `map_editor.html`; side-by-side reference comparisons are at `review.html`.

## Map editing

The editor works on a copy of the map. Select walls, glass, doors or furniture to inspect their coordinates. Drag furniture or segment endpoints; use the source-plan overlay to align the geometry. Pan with middle mouse or Space + drag; use the wheel to zoom. The probe shows whether a player-sized circle overlaps an obstacle.

Choose a type in **Ajouter un élément**, then **Placer sur la carte**. Furniture uses one click; walls, glass and doors use two endpoints. **Échap** cancels placement. A door placed along a wall or glass segment splits that segment to create its opening. Select an object to **Dupliquer**, **Supprimer**, or press Delete; undo/redo includes creation, deletion and door openings. All furniture render types are available, including the previously fixed lounge decorations and elevator decorations.

Undo/redo, local draft save/restore, and JSON import/export are available. Valid working edits are autosaved locally after changes; Save draft also saves immediately. **Jouer cette carte** saves the working map and explicitly loads it in the game. JSON exports and browser drafts do not rewrite `js/map/map_data.js`.

## Importer une carte dans le jeu

Ton ancien JSON est compatible. Deux parcours directs :

1. Dans `map_editor.html`, **Importer JSON**, puis **Jouer cette carte**. Un brouillon local valide est restauré à l'ouverture de l'éditeur.
2. Dans `maps.html` (menu titre **TOOLS / MAPS → CHOISIR / IMPORTER UNE CARTE**), sélectionner le JSON puis **Jouer la carte importée**. Cette carte est conservée séparément du brouillon dans ce navigateur.

Pour charger une carte automatiquement depuis un dossier : **Exporter la carte** télécharge `active.json`. Déplacer ce fichier dans **`D:\Downloads\hotline-viseo\maps\active.json`**, puis recharger le jeu. Il n'y a aucun fichier JavaScript à modifier. Si le navigateur ajoute un suffixe au nom téléchargé, le renommer `active.json`.

Ordre du lancement normal : fichier `maps/active.json`, carte importée du navigateur, carte originale. Les liens **Jouer cette carte**, **Jouer la carte importée** et **Jouer la carte originale** choisissent explicitement leur source. Un fichier invalide affiche une erreur au lieu de charger silencieusement une autre carte.

Le format v2 contient les géométries, matériaux et positions de jeu. Les anciens exports v1 conservent leurs géométries et reprennent les informations complémentaires de la carte de base. Le jeu reconstruit les portes/vitres interactives et la navigation depuis la carte chargée. Les positions de départ recouvertes par un obstacle sont replacées sur un point libre. Les ascenseurs de la palette sont des décors : les points d'arrivée des vagues restent des données de jeu distinctes.

Player clearance displays a cached grid of free/blocked positions for a radius-14 player and refreshes after edits, undo, redo, and imports. Doors are treated as closed. This is a sampled overview; use Probe mode for precise obstacle identification, including points inside rotated furniture.

## Dessiner et modifier les sols

Dans le panneau **Sols**, choisir une zone (par exemple **Pièce centrale 2**) puis déplacer ses poignées blanches pour étendre son matériau. La liste contient aussi les sols des bureaux vitrés et des autres pièces. Le menu de matériau propose huit finitions : moquettes grise, verte, violette, sombre et bleue, parquet, carrelages clair et vert.

**Dessiner** crée un polygone sommet par sommet : Entrée ou **Terminer le tracé** le ferme ; Retour arrière retire le dernier sommet ; Échap annule. **Rectangle** utilise deux coins opposés. En mode **Modifier les sols**, on peut déplacer une zone entière, ajouter un sommet par double-clic sur un bord, retirer un sommet dans l'inspecteur, dupliquer/supprimer une zone et changer son ordre avec **Au-dessus / En dessous**. Tout fonctionne avec annulation/rétablissement.

Les sols édités sont exportés avec la carte et affichés par le jeu sans superposition des anciens sols. Les anciens brouillons et exports reçoivent automatiquement leurs zones éditables lors du chargement. Les sols restent découpés par l'enveloppe extérieure du bâtiment ; déplacer un mur ne déplace pas automatiquement un sol.

Les sprites de mobilier sont partagés entre le jeu et l'éditeur, mis en cache sur une grille de deux unités et comparables dans `sprite_review.html`. Les anciennes façades d'ascenseur sont désormais des repères d'arrivée à plat sur le sol ; leurs données restent compatibles et les arrivées de vagues ne changent pas.

## Performances et nettoyage

La navigation et les collisions évitent les calculs sur les obstacles éloignés et réutilisent la géométrie du mobilier. Le rendu ignore les objets hors champ et supprime une copie plein écran lorsque les distorsions ne la nécessitent pas. Sur la machine de test, le temps de travail du callback animation à 36 ennemis passe de **15,5 à 3,7 ms au p95** en 1280×720. Le stress de combat mesure 90,1 FPS moyens en 1080p, mais 57,1 FPS en 3440×1440 : les 60 FPS constants ne sont pas garantis.

Les cadavres commencent à disparaître après 90 secondes de simulation, ou quand plus de 96 corps sont retenus, avec un fondu de deux secondes et une protection de la première seconde de chute. Les armes de ravitaillement non utilisées expirent au début de la deuxième vague suivante ; les armes placées sur la carte, lâchées par les ennemis ou reprises puis jetées sont conservées. Le sang reste sur sa toile persistante : le test de 5 000 taches ne montre pas de surcoût de redessin. Les petits pics noirs sur le texte de ramassage sont corrigés.

Le [rapport complet de performances](docs/game-performance.md) détaille les changements, les mesures, leurs limites, le choix de conserver Canvas 2D accéléré et la simulation synchrone, la validation historique à 23 suites et les validations navigateur, ainsi que les commandes de reproduction. Le runner actuel compte 31 suites, dont sept suites coop et une sur le serveur public du launcher. Les outils Playwright sont réservés au développement et n’ajoutent aucune dépendance au jeu.

## Verification

Exécuter l'ensemble des 31 suites de régression automatisées avec Node.js :

```bash
npm test
# Équivalent à : node tools/test.cjs
```

Ou individuellement sous PowerShell :

```powershell
Get-ChildItem test_*.js | ForEach-Object { node $_.FullName }
```

Browser captures and playtest evidence live under `docs/`. The scripts use the local Playwright installation indicated near the start of each file.

`node test_door_safety.js` vérifie la traversée à 30/60/144 FPS, les coups volontaires, les collisions des ennemis assommés, leur réveil et le passage à la vague suivante. `node docs/test_door_gameplay.cjs` vérifie aussi la mort par porte et la vague suivante dans la boucle réelle du jeu, puis capture les sprites au sol dans `docs/door-states-review.png`.

The latest repair review is in `docs/visual-critique.md`. Run `node docs/final_review.cjs` with the server running to verify editor edits, undo/redo, draft persistence, collision probing, and the reference comparison pages.

`node docs/test_map_workflow.cjs` verifies editor creation/deletion/duplication, undo/redo, door openings, JSON download, draft-to-game loading, old JSON import, invalid-file preservation, automatic-file loading and the original-map override in an isolated browser context. `node test_map_files.js` checks format compatibility and isolation from authored map data.

`node docs/test_floor_editor.cjs` checks central-room floor extension, material edits, polygon/rectangle creation, undo/redo, deletion and game loading. `node test_floor_layers.js` checks polygon validity, persistence, layer priority and prevention of legacy floor redraws. `node docs/test_editor_palette.cjs` checks all furniture types through creation, rendering and deletion.

## Vérifications des passages et de l’écran de mort

L’[overlay de mort](docs/death-direction.md) retire le HUD dès l’impact et affiche **YOU'RE DEAD!** en SELINCAH rose néon `#ed4e93`, sur un voile noir à 60 % avec vignetage. Les éclaboussures mêlent impacts asymétriques, traînées obliques et fines gouttelettes sur les bords et dans plusieurs zones intérieures ; leurs formes changent à chaque mort et seules certaines taches coulent brièvement. Les indications de restart et de score sont espacées du titre et partagent la même couleur ivoire ; le score apparaît après 400 ms. Les contrôles et le garde de 220 ms sont conservés. L’outil optionnel `node tools/validate_death.cjs` couvre cinq formats, de 1280×720 à 3440×1440 ; la campagne de performances du 20 septembre l’a exécuté avec succès, avec 25 captures sur cinq formats.

`node test_collision_passages.js` couvre les murs et vitres (y compris en diagonale) à 10/30/60/144 FPS, les poussées joueur/ennemi, la porte ajoutée `door_2` de la carte utilisateur et les ouvertures traversant plusieurs couches superposées. `node docs/test_passages_and_scores.cjs` traverse cette porte dans les deux sens avec les touches de déplacement puis vérifie qu'Espace ouvre les scores après la mort, sans recommencer la partie.

L'éditeur refuse maintenant de créer une porte de moins de 48 unités. La découpe traverse toutes les couches collinéaires mur/vitre. Les chevauchements derrière les portes des anciens JSON sont corrigés sur la copie chargée ; le fichier importé n'est jamais réécrit automatiquement.

## Départs du joueur, armes et arrivées ennemies

Dans **Départs et armes**, sélectionner un élément existant dans la liste, puis le déplacer sur la carte ou saisir ses coordonnées dans l'inspecteur. **Centrer la sélection** permet de retrouver un point. Les marqueurs sont J (joueur), E (ennemis) et A (arme) ; leur calque peut être masqué.

Dans **Ajouter un élément**, choisir le départ joueur, une arrivée ennemie ou une arme, puis **Placer sur la carte** et cliquer une fois. Le départ joueur est unique : le replacer déplace le point existant. Les armes et arrivées se dupliquent et se suppriment ; au moins une arrivée ennemie doit rester. Les opérations sont annulables, enregistrées dans le brouillon et exportées dans `active.json`.

L'inspecteur règle l'orientation, le type d'arme et les munitions (0 signifie vide), ou le nom d'une arrivée. Il signale un point dans un obstacle/hors bâtiment : au chargement, le jeu peut replacer ce point sur une position libre. Pour respecter précisément un placement, choisir une position libre dans l'éditeur.

Les arrivées constituent l'ensemble utilisé pour **toutes les vagues, dès la première**. Le système choisit aléatoirement parmi elles, en privilégiant celles à au moins 260 unités du joueur lorsque c'est possible. Les renforts peuvent avoir un décalage de ±16 unités autour du point ; les premières arrivées annoncées utilisent le point exact. Ces marqueurs définissent les lieux possibles, pas un ennemi individuel, son équipement ou un nombre par vague. La quantité et les types d'ennemis restent déterminés par la progression des vagues.

Validation : `node docs/test_gameplay_editor.cjs` teste placement, édition, suppression, duplication, déplacement, protections, annulation, sauvegarde/rechargement, export et chargement dans le jeu avec les munitions personnalisées et les arrivées des vagues 1 et 3.

## Scoring et classement V2

Le bilan **AFTER HOURS** devient une scène Canvas grenobloise : montagnes, bureaux,
disque rose-orangé et reflets. Huit catégories apparaissent au rythme de 140 ms,
puis un score massif et le grade. Une boucle synthwave originale à 84 BPM accompagne
ce moment. Entrée/R ou A/× passent le décompte avant de rejouer ; M ou Y/△ ouvrent
les personnages ; Tab/L ou X/□ affichent le classement secondaire, qui met uniquement
la partie actuelle en évidence. Les quatre actions sont cliquables avec survol ;
**Partager** (S ou RB/R1) copie score, vague, grade, emojis et lien du jeu, puis
affiche « COPIÉ ! ». M fonctionne aussi sur AZERTY. Le commentaire est centré sous
le grade, dont l’arrivée combine frappe sonore, rebond et éclats brefs.
Voir la [direction et validation des résultats](docs/score-direction.md).

Le score en jeu comprend les points des éliminations (avec multiplicateur de combo et bonus de PAP), assommages, ravitaillements et fins de vague. Le bilan ajoute les bonus suivants :

- Variété : 2 500 points par arme ayant servi à une élimination après la première, plafond 15 000. Ramasser une arme ou tirer dans le vide ne compte pas.
- Audace : 600 × (meilleure série − 1)^1,5 (série plafonnée à 16), plus 350 par élimination au corps à corps, exécutions incluses.
- Carnage : 1 200 par exécution et 400 par impact de porte attribué au joueur.
- Temps : 80 par seconde économisée sur une cible de 45 secondes par vague terminée ; aucun bonus pour mourir rapidement sans terminer de vague.

Le bilan distingue les éliminations par tir et par lancer. Le meilleur combo est conservé après expiration. Les points flottants d’élimination proviennent du HUD pour refléter le multiplicateur réel.

Le classement V2 enregistre automatiquement les huit meilleurs résultats à la mort, sans doublon lors de l’ouverture du bilan. Il est local au navigateur et à l’adresse du site : localhost et GitHub Pages ne partagent pas leurs scores. L’ancienne clé localStorage est conservée, mais ses scores issus de l’ancien calcul et ses entrées fictives ne sont pas mélangés aux nouveaux résultats.

L’interface Canvas s’agrandit proportionnellement au-delà de 1920 × 1080 : ×1,33 en 1440p et ×2 en 4K, y compris les zones cliquables des menus.

---

## Architecture & Organisation du projet

Le projet est conçu pour être 100 % statique côté client, modulaire et hautement performant.
Pour une description technique approfondie de tous les sous-systèmes, voir **[docs/architecture.md](docs/architecture.md)**.

```text
hotline-viseo/
├── index.html              # Point d'entrée principal du jeu
├── map_editor.html         # Éditeur visuel de cartes complet dans le navigateur
├── maps.html               # Gestionnaire et importateur de cartes JSON
├── character_review.html   # Comparatif visuel des personnages et références
├── inspect_map.html        # Inspecteur de géométrie, collisions et NavGraph
├── review.html             # Comparateur de rendus de référence
├── sprite_review.html      # Galerie des sprites de mobilier et décors
├── package.json            # Configuration Node pour scripts de dev et preview
├── Lancer-le-jeu.cmd       # Lanceur rapide Windows (double-clic)
├── .nojekyll               # Déploiement statique GitHub Pages
├── .gitignore              # Règles Git d'exclusion (OS, IDE, backups, logs)
├── .gitattributes          # Normalisation des fins de ligne (LF/CRLF) et binaires
├── AGENTS.md               # Règles impératives de commit et directives d'agents
├── README.md               # Documentation générale du projet
├── assets/fonts/           # Polices locales utilisées par les écrans Canvas
│   ├── Anton-Regular.ttf   # Police de titre et d'en-têtes rétro (alternative Impact zéro CDN)
│   └── SELINCAH.ttf        # Police du tampon de mort
├── test_*.js               # Suites de tests unitaires et de non-régression Node
├── css/                    # Feuilles de style pour le canvas et les overlays
├── docs/                   # Documentation technique, critiques visuelles et tests Playwright
│   ├── architecture.md     # Architecture détaillée du moteur et des sous-systèmes
│   ├── game-performance.md # Optimisations, mesures, limites et reproduction
│   ├── character-direction.md # Direction artistique des 7 masques VISEO
│   ├── death-direction.md  # Direction et validation de l'overlay de mort
│   ├── door-physics-review.md # Physique des portes et résolution des contacts
│   ├── floor-and-sprites-review.md # Revue des sols polygonaux et sprites
│   ├── hud-direction.md    # Direction et validation du HUD en jeu
│   ├── passages-and-scores-review.md # Revue des passages et calculs de score
│   ├── menu-direction.md   # Direction et validation des menus Canvas
│   ├── visual-critique.md  # Critiques visuelles et gameplay
│   └── *.cjs / *.png       # Outils Playwright et captures de référence
├── js/                     # Code source modulaire du jeu
│   ├── config.js           # Configuration centrale, couleurs, armes, masques, scoring
│   ├── game.js             # Moteur de test et démonstration autonome
│   ├── main.js             # Boucle de jeu maîtresse, machine à états et orchestration
│   ├── audio/              # Synthétiseur de musique rétro et effets sonores procéduraux
│   ├── effects/            # Moteur de sang persistant, particules et post-processing CRT
│   ├── engine/             # Physique, détection de collisions, caméra, entrées et pathfinding
│   ├── entities/           # Joueur, IA ennemie, arsenal d'armes, portes, spawner de vagues
│   ├── map/                # Données de carte, chargeur, moteur de rendu et éditeur
│   └── ui/                 # Menus, HUD, overlay de mort et écran de scores
├── maps/                   # Cartes de jeu exportées
│   ├── active.json         # Carte personnalisée active chargée au démarrage
│   └── README.md           # Documentation sur le chargement automatique des cartes
└── tools/                  # Outils serveur Node et validations optionnelles
    ├── serve.cjs           # Serveur HTTP statique léger avec support preview
    ├── validate_death.cjs  # Validation navigateur de l'écran de mort
    └── validate_hud.cjs    # Validation navigateur du HUD
```

---

## Roster des 7 Personnages

| Personnage | Animal | Rôle | Arme de départ | Effets & Perks |
|---|---|---|---|---|
| **Vincent** | Lion | Directeur d'agence | Magnum .44 (4 balles) | Exécution en 0,9s (-25%), munitions max armes à feu -25% |
| **Anne** | Panthère | Commerciale | Couteau de combat | Vitesse +20%, munitions max armes à feu -25% |
| **Lucas** | Loup | Commercial | Uzi (20 balles) | Cadence de tir +15% (délai -15%), dispersion +25% |
| **Arnaud** | Ours | Manager | Fusil à pompe (6 cartouches) | Coups de porte mortels contre ennemis ordinaires, vitesse -20% |
| **Jade** | Cygne | Recrutement | Pistolet silencieux (12 balles) | Fenêtre de combo +50%, cadence de tir -15% (délai +15%) |
| **PAP** | Grand-duc | IT Support Manager | Batte de baseball | Points par kill +50%, vitesse -15% |
| **JC** | Cobra | CISO | Fusil d'assaut M16 (24 balles) | Précision accrue (dispersion -45%), cadence -20% (délai +20%) |

---

## Règles de contribution & Commits

Toutes les modifications du projet doivent respecter les règles établies dans **[AGENTS.md](AGENTS.md)** :
1. **Conventional Commits en anglais uniquement** : Tout commit doit obligatoirement suivre la convention (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, etc.) avec un titre complet, clair et pertinent, et une description ultra complète de tous les changements.
2. **Mise à jour obligatoire de la documentation** : Avant **chaque** commit, toute la documentation (`README.md`, `docs/`, `maps/README.md`) doit obligatoirement être mise à jour pour refléter l'état exact du projet.
3. **Validation des suites de tests** : Avant tout commit, lancer `Get-ChildItem test_*.js | ForEach-Object { node $_.FullName }` et s'assurer que tous les tests passent.

## Enemy combat and patrol integration

Enemy shots check cover between body and muzzle. Enemies investigate player gunshots at their heard location, while melee and dry fire do not summon them. Each automatic patrol round has a 50% chance of a reachable doorway excursion and return. Wave totals follow 5, 8, 13, 21, 34, 55, 89, 144 and onward, with at most 36 concurrent enemies and validated spawn space. Visual targeting, body clearance and stuck recovery remain active. The current Node regression runner includes 31 suites. See [combat rules and regression coverage](docs/architecture.md#enemy-combat-and-navigation).
