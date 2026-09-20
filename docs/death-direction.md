# Écran de mort — arrêt brutal

Après validation de SCORE, `GAME_OVER` affiche les [résultats After Hours](score-direction.md)
sur une scène Canvas opaque et lance la piste `results` au volume musical choisi.
Le monde masqué n’est plus dessiné derrière cet écran de résultats.

`js/main.js::renderDeathOverlay()` délègue le dessin à `js/ui/death_overlay.js`. Le monde continue d’être rendu sous l’overlay, avec ses particules et sa caméra existantes. Aucun contrôle, hit-stop gameplay, garde d’entrée ou mécanisme de respawn n’est modifié.

## Présentation

- Voile noir neutre constant à **60 %**, avec vignetage elliptique supplémentaire sur les bords (jusqu’à 36 %). Le centre reste moins assombri que les bords, y compris en ultrawide.
- `YOU'RE DEAD!` en **SELINCAH**, rose néon **#ed4e93**, incliné de −2,6°, avec ombre dure, léger décalage coloré et halo fixe. La police locale est chargée avant la boucle ; Impact sert de repli si le fichier est indisponible. Les deux autres polices et leurs déclarations ont été retirées.
- Titre et `[R] RESTART` visibles dès la frame fatale ; le HUD et le viseur disparaissent sur cette même frame. Le titre reste vers le tiers supérieur ; les commandes sont regroupées à 64 % de la hauteur pour laisser davantage d’espace sous le titre.
- Restart et score partagent la couleur **#fff1db**. Le score est plus petit, 36 pixels logiques sous le retry, et apparaît après **400 ms**. Les indications manette sont `[A] RESTART` et `[Y] SCORE`.
- Le titre frappe brièvement (120 ms). Les projections de sang se déploient en moins de 200 ms, avec des départs et des vitesses légèrement différents. Trois familles remplacent les tampons ronds : impacts asymétriques à prolongements courts et courbes, traînées obliques fragmentées et nuages de fines gouttelettes sans noyau central. Les perles se regroupent en faisceaux irréguliers plutôt qu’en anneaux autour des taches. Les grands prolongements en forme de feuille ou de doigt ont été retirés.
- La matière combine des rouges cramoisis de densités différentes, des poches sombres, des zones plus translucides, un grain fin et de petits manques sur les bords. Un reflet discret d’un pixel suit la silhouette exposée et certaines gouttes, sans halo ni contours internes entre les masses fusionnées. La texture est rasterisée à l’échelle logique, puis agrandie sans lissage pour mieux rejoindre le grain du monde.
- Les projections sont réparties sur les bords et dans plusieurs zones intérieures autour du corps et des commandes. Seules certaines taches coulent, avec zéro à trois filets fins, des longueurs et des délais indépendants. Les coulures suivent la gravité même après un impact oblique et s’arrêtent avant 1,3 s. Les formes sont générées et mises en cache une fois à chaque mort, puis restent identiques entre les frames : aucun scintillement, aucune pulsation permanente.
- Le flash rouge de présentation dure 90 ms avec une opacité maximale de 7 %. Les réglages de trauma/caméra et le hit-stop existants restent inchangés.
- Le garde `deathTimer > 0.22` protège toujours toutes les entrées. Le score reste accessible dès ce seuil, même avant l’apparition de son indication. Enter, clic, RT et Select restent utilisables comme avant.
- Les formes et leur matière sont préparées une fois par mort dans deux petites textures par groupe (masse et projection). Les chemins temporaires sont libérés après rasterisation ; le rendu courant utilise ces textures et le temps de mort, sans recalculer les centaines de gouttes à chaque frame. Au respawn, l’état PLAYING supprime l’overlay et restaure immédiatement le HUD ; les effets transitoires du moteur sont réinitialisés par le mécanisme existant. La mort suivante remplace les textures précédentes.

L’échelle utilise le minimum largeur/1280, hauteur/720, avec une largeur typographique plafonnée à 79 % du viewport. Aucun panneau opaque ne remplace le monde.

## Validation optionnelle

Les retouches SELINCAH, néon, espacement, voile à 60 % et la refonte des projections de sang ont fait l’objet de deux passes de rendu et d’inspection visuelle sur plusieurs variantes. L’aperçu artistique est conservé dans `test-results/death-art/` ; les anciennes captures de validation ne représentent pas cette version.

Validation du 19 septembre 2026 : `npm test` passe les 21 suites de régression avec 0 erreur. La validation navigateur optionnelle n’a pas été relancée dans l’environnement courant, car le package Playwright n’y est pas installé ; les 25 captures prévues restent à générer avec l’outil dédié.

Pour une validation ultérieure : lancer `node tools/serve.cjs --port 8094`, puis `node tools/validate_death.cjs` avec Playwright disponible. `PLAYWRIGHT_MODULE` peut pointer vers une installation existante ; `CHROME_PATH` et `DEATH_TEST_URL` permettent de choisir le navigateur et l’URL. Aucune dépendance de production n’est ajoutée.

L’outil avance explicitement la vraie boucle de jeu et utilise les événements clavier/souris et la Gamepad API simulée. Il couvre la première frame, le retrait du HUD, le seuil de 220 ms, l’indication à 400 ms, la priorité des scores, le retry, le respawn, les entrées maintenues et la stabilité après les coulures.

Formats prévus : **1280×720, 1440×900, 1920×1080, 2560×1440 et 3440×1440**. Le script produit 25 captures (monde sans overlay, impact, résultat, manette, respawn), une galerie et `validation.json` dans `test-results/death/`. `npm test` reste la commande des 23 suites de régression existantes.

## Enemy combat and patrol integration

Enemy shots check cover between body and muzzle. Enemies investigate player gunshots at their heard location, while melee and dry fire do not summon them. Each automatic patrol round has a 50% chance of a reachable doorway excursion and return. Wave totals follow 5, 8, 13, 21, 34, 55, 89, 144 and onward, with at most 36 concurrent enemies and validated spawn space. Visual targeting, body clearance and stuck recovery remain active. The current Node regression runner includes 23 suites. See [combat rules and regression coverage](architecture.md#enemy-combat-and-navigation).

## Performance review — 20 September 2026

La campagne de performances du 20 septembre a exécuté avec succès `tools/validate_death.cjs`, y compris ses 25 captures sur cinq formats ; elle complète la validation historique ci-dessus. Le fondu de nettoyage concerne les cadavres ennemis dans le monde, sans changer le tampon de mort, ses coulures, ses délais ni les contrôles. Les 23 suites Node passent. Voir le [rapport de performances](game-performance.md).
