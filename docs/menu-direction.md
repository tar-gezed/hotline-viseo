# Hotline VISEO — écran titre et menus

L’onglet du navigateur affiche **Hotline Viseo: After Hours**, défini dans `index.html`.

## Direction

Le titre sépare l’identité du jeu du choix d’un personnage : un logo ivoire/rose en deux lignes, une skyline originale en trois couches à défilement lent, cinq choix et une texture discrète. Le logo conserve son ombre dure et reçoit le même halo néon fixe que le texte de mort : rayon de 16 pixels multiplié par l’échelle UI, teinté en ivoire pour HOTLINE et en rose pour VISEO. Les autres textes restent sans halo. Les options actives se décalent et s’inclinent légèrement. Le logo termine son apparition à 480 ms ; les cinq options sont visibles avant 500 ms d’animation. L’import de polices Google inutilisées par le Canvas a été retiré pour ne pas bloquer le lancement sur un CDN.

La recherche visuelle demandée a été confiée à GPT‑5.6 Luna High. Références : [menu principal de Hotline Miami 2](https://media.codeweavers.com/pub/crossover/website/appdb/bdb31c11bd2af1a8bb2ada834390fb3a.jpg), [sélection d’acte](https://cdn.mobygames.com/screenshots/3447942-hotline-miami-2-wrong-number-windows-act-selection-screen.jpg), [vidéo du titre](https://www.youtube.com/watch?v=eQG5a3kyQUQ), [analyse des menus et du VHS](https://cliqist.com/2015/03/30/aesthetic-excellence-hotline-miami-2/). Les captures ont guidé la hiérarchie logo/liste et la profondeur des silhouettes ; les vitesses de déplacement sont des choix originaux, pas des mesures du jeu de référence. Game UI Database n’était pas accessible à la recherche automatisée.

Les contrôles reprennent la composition du screenshot fourni et le PNG local `assets/images/PS5_Controller.png`, avec les bindings réels de `InputManager`. Les boutons Xbox équivalents sont également indiqués. Aucun asset du jeu commercial n’est intégré.

## Écrans et circulation

- `MENU_TITLE` → **COMMENCER MA JOURNÉE**, **MULTIJOUEUR (2–5)**, **CONTRÔLES**, **AUDIO**, **TOOLS / MAPS**, dans cet ordre ; accès secondaire **CRÉDITS** en bas à droite. Le premier choix ouvre la sélection de personnage.
- `MENU_CREDITS` → quinze postes attribués à **Targezed**, grille de trois colonnes, retour au titre sans reset ni interruption de musique.
- `MENU_MASK` → partie ou titre, avec le personnage conservé pour la session. Grand portrait actif, liste des sept noms, capacité et équipement initial.
- `MENU_CONTROLS` → onglet clavier/souris ou manette, retour au titre.
- `MENU_AUDIO` → musique, SFX, mute musique, retour au titre ou à la pause selon l’origine.
- `MENU_TOOLS` → pages existantes de sélection/import ou d’édition de carte.
- `PAUSED` → reprendre, audio, recommencer. Reprendre restaure aussi bien PLAYING qu’INTERMISSION.
- `DEAD` → [overlay brutal sur le monde](death-direction.md), retry immédiat après le garde existant ou accès aux scores ; HUD retiré dès la frame fatale, indication des scores après 400 ms.
- `GAME_OVER` → [résultats After Hours](score-direction.md), scène Canvas complète, décompte passable, classement secondaire par Tab/L ou X/□, rejouer, personnages et partage dans le presse-papier. Les quatre actions sont cliquables ; M utilise la touche imprimée pour fonctionner en AZERTY. La navigation est consommée une fois dans la boucle ; la copie démarre pendant le geste clavier/souris.

Chaque écran dispose de son composant dans `js/ui/`. `UITheme` et `CanvasMenu` partagent les couleurs, la typographie et la navigation. Les menus utilisent une zone logique 1280×720 mise à l’échelle uniformément ; la scène d’arrière-plan couvre tout le viewport en 16:9, 16:10 et ultralarge. Les textes ne sont jamais compressés par `fillText(maxWidth)`.

La pause rappelle désormais le nom du masque actif au-dessus des choix. Le [HUD en jeu](hud-direction.md) partage la palette et l’échelle du titre ; son rappel de masque transitoire reste ainsi consultable à tout moment sans limite de lecture.

Les événements clavier/souris des nouveaux menus sont traités une seule fois, dans la boucle, après le polling manette. Les boutons et les touches reposent sur leurs fronts d’appui ; le stick a une répétition temporisée. Le pointeur immobile ne vole pas la sélection au clavier. Le clic et le dessin partagent le même repère. Une validation ne traverse pas deux écrans dans la même frame ; le garde existant de relâchement d’attaque protège l’entrée en jeu.

`AudioSettings` valide les données du stockage et sauvegarde les deux volumes et le mute musique sous `hotline-viseo-audio-v1`. Le stockage indisponible conserve des réglages de session. Les instances audio partagées garantissent que le réglage SFX s’applique aussi aux entités, combos et sons UI. Aucun reset de partie n’intervient entre la pause et l’audio. La musique de menu garde sa piste et le déverrouillage par interaction reprend les contextes suspendus.

## Validation

`npm test` exécute 31 suites, dont `test_menu_navigation.js` : navigation avec le vrai `InputManager`, fronts manette, retour personnage, volumes indépendants, stockage invalide/bloqué et coordonnées dans les quatre formats.

Validation navigateur optionnelle : démarrer `node tools/serve.cjs --port 8087`, puis `node tools/validate_menus.cjs` dans un environnement disposant de Playwright. `PLAYWRIGHT_MODULE` peut désigner un package déjà installé, `CHROME_PATH` un exécutable Chromium local et `MENU_TEST_URL` une URL servie sous préfixe GitHub Pages. Aucune de ces dépendances n’est chargée par le jeu.

Le script produit 32 captures (titre, crédits, personnages, clavier, manette, audio, outils et pause) et `validation.json` dans `test-results/menus/`, aux dimensions 1280×720, 1440×900, 1920×1080 et 3440×1440. Il vérifie les retours sans reset, la conservation du personnage, la persistance après rechargement, l’arrêt de la simulation pendant l’audio, le retour après les scores et la reprise d’intermission. La navigation manette passe par une simulation de la Gamepad API standard ; une manette physique n’a pas été utilisée pour cette validation.

`node tools/validate_audio_startup.cjs` utilise le même environnement Playwright pour vérifier les deux politiques Chromium : autoplay autorisé (musique immédiate, mute conservé) et autoplay bloqué (déverrouillage par touche, clic hors des options et toucher). Le test mesure le signal audio réel. Le navigateur peut imposer une première interaction : [politique Web Audio de Chrome](https://developer.chrome.com/blog/web-audio-autoplay). Le jeu tente déjà la lecture au chargement ; les gestes reçus pendant le chargement de carte, les relâchements tactiles et le retour au premier plan permettent également de reprendre un contexte suspendu. Aucun réglage de sécurité du navigateur n’est modifié par le jeu.

## Enemy combat and patrol integration

Enemy shots check cover between body and muzzle. Enemies investigate player gunshots at their heard location, while melee and dry fire do not summon them. Each automatic patrol round has a 50% chance of a reachable doorway excursion and return. Wave totals follow 5, 8, 13, 21, 34, 55, 89, 144 and onward, with at most 36 concurrent enemies and validated spawn space. Visual targeting, body clearance and stuck recovery remain active. The current Node regression runner includes 31 suites. See [combat rules and regression coverage](architecture.md#enemy-combat-and-navigation).

## Performance review — 20 September 2026

La campagne courante repasse les contrôles de menus et les 31 suites Node. Le validateur audio isole chaque politique dans un navigateur neuf, désactive les exemptions liées à l’engagement et lit le démarrage via CDP sans geste utilisateur ; le test ne peut ainsi déverrouiller lui-même le son avant la vérification. Les gestes clavier, clic et toucher, le signal réel et le mute passent. Le code audio du jeu reste inchangé. Voir le [rapport et la reproduction](game-performance.md).

## Coop lobby and results

The identity field is shared by creation and joining, above both room actions. Host pause suspends the squad; client options remain local. Both the solo pause and multiplayer options offer exit to the title, including mouse and standard gamepad navigation. Exit does not wait for WebRTC teardown. See the [event audit](multiplayer-events.md) for acceptance coverage.

Multiplayer screens are loaded only after opting into multiplayer. The lobby uses five squad cards, seven direct portrait choices, a preview of perks/loadout, explicit ready state and a host-only launch. `CoopUI` provides bounded text and shared mouse/keyboard/controller hit-testing. A native code field supports paste and a Canvas keypad supports gamepads. Results use one MVP spotlight followed by 2–5 bounded columns and individual confirmation. The [multiplayer architecture](multiplayer-architecture.md#interactions-et-ui) records commands, references and acceptance checks. The original solo menu flow remains separate.
