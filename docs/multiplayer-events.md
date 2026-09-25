# Audit des événements coop — 24 septembre 2026

L’état persistant vient des snapshots de l’hôte ; les effets ponctuels passent par des actions fiables. Recevoir un état `shattered` ou `DEAD` ne suffit pas à reproduire le son, le point d’impact, les débris ou le texte d’une action. Les clients rejouent donc une liste explicite de méthodes cosmétiques via `PresentationEvents`, sans modifier score, inventaire, dégâts ou géométrie.

## Bugs signalés et couverture

| Signalement | Correction | Régression |
| --- | --- | --- |
| Balles parfois invisibles, notamment sur impacts/kills | Naissances et points de fin fiables, au moins une frame de traceur pour un tir très court, association des prédictions locales et confirmations, rendu de confirmation sans prédiction | `test_multiplayer_events.js` : impact avant naissance/dessin, snapshots vides intercalés, tir local sans prédiction, impact à bout portant ; navigateur : P1/P2/P3 visibles chez les quatre clients |
| Traceurs arrêtés par une vitre traversée par le tir réel | Le raycast cosmétique exclut les véritables `GlassPartition`, même sans flag générique `isGlass` | Test de traversée visuelle, sans mutation de la vitre |
| Pas de débris quand le corps brise du verre | Transmission des vrais appels de débris et de son, à leurs coordonnées d’impact, plutôt qu’un effet simplifié placé à une extrémité de la vitre | Test du vrai `checkGlassCollisions` + réception et rendu dans les quatre navigateurs clients |
| Armes lancées à travers les vitres intactes | Le lanceur reçoit murs, verre, portes et props ; le balayage du lancer casse la vitre puis poursuit le vol | Test du vrai `updateThrownWeapons`, tests physiques à 30/60/144 Hz |
| Textes d’exécution, de ramassage/changement et d’action absents | Transmission fiable des textes Canvas et popups de score ; les labels coop de stun restent aux coordonnées du monde | Tests de replay borné ; navigateur : vrais handlers de pickup et d’exécution, texte, son et gore reçus |
| Un collègue prend toutes les munitions d’une caisse | `claimedMask` accorde une recharge par slot ; un même joueur ne peut pas réclamer deux fois la caisse ; l’arme contenue est libérée une seule fois | Cinq claims, refus du doublon, masque sérialisé ; navigateur : cinq vrais refills, P2 passe en premier |
| Texte AMMO absent côté client | Même fonction de rendu pour l’hôte et tous les clients ; état personnel `RÉCUPÉRÉ` | Vérification des textes dessinés par le renderer réel, côté Node et navigateur |
| Pause hôte par Échap/Start non partagée | La pause hôte et l’onglet caché sont deux raisons distinctes de suspendre la simulation entière | Test des combinaisons options/visibilité et du client sans autorité de pause ; navigateur : horloge figée puis reprise |
| Impossible de quitter depuis la pause | `QUITTER LA PARTIE` en solo, sortie coop immédiate sans attendre `room.leave()` | Navigation Node ; sorties solo/client à la souris et hôte à la manette dans Chrome |
| Pas de pseudo accessible avant création | Champ commun d’identité au-dessus des deux actions | Navigateur : saisie du champ natif, clic CRÉER et vérification du pseudo hôte dans le lobby |

## Autres défauts découverts

- **Bouton A encore maintenu après la sortie** : le reset peut conserver le dernier échantillon des boutons de manette. L’appui qui quitte ne confirme plus automatiquement le titre. Test Node et sortie réelle via Gamepad API simulée.
- **Lancers ignorant une porte fermée** : la méthode `isOpen()` était traitée comme un booléen vrai. Les lancers vérifient maintenant le battant réel, avec test de rebond sur une porte fermée.
- **Traces de sang partagées entre joueurs** : chaque slot utilise son propre identifiant de pas ; les empreintes sont des événements cosmétiques répliqués. Test de trois identifiants distincts.
- **Effets imbriqués en double** : un appel tel qu’une exécution peut lui-même créer gerbes et flaques. Une garde de profondeur transmet seulement l’appel racine et empêche le replay de réémettre un événement. Test de replay sans écho et rejet de méthodes non autorisées/arguments malformés.
- **Exécutions dessinées à 20 Hz chez les clients** : le geste distant est interpolé, et le geste local dispose d’une horloge de rendu séparée. Tests de progression à chaque frame, de fin d’animation et d’absence de modification du timer autoritaire ou du rendu solo.
- **Callbacks tardifs après reconnexion/nouvelle mission** : les anciens canaux rapides et les anciens envois fiables ne peuvent plus retirer un canal de remplacement ni déverrouiller son envoi en cours. Tests de remplacement, fermeture et complétions dans le désordre, pour les frames comme pour les effets/états fiables.
- **Lauriers décentrés et superposés au rang** : les deux écrans de résultats utilisent des branches symétriques, des feuilles pointues attachées aux tiges et un chiffre centré sur ses limites visibles, en tenant compte de la police italique. Le test navigateur `tools/validate_results.cjs` vérifie les pixels de la couronne aux deux tailles (symétrie, centrage et dégagement), puis capture MVP et colonnes à deux/cinq joueurs dans quatre résolutions.

## Inventaire des chemins vérifiés

| Famille | Autorité / état | Présentation et validation |
| --- | --- | --- |
| Mouvement, visée, jambes, recul | Inputs client, simulation hôte, réconciliation | Pose locale préservée, interpolation distante ; test 180–220 ms RTT et 20 % de perte |
| Pistolets, automatiques, pellets, balles ennemies | Naissance, trajectoire, dégâts, pénétration et kill hôte | Traceurs, flashes, douilles locales, sons, impacts et marques de balle ; births manquants rattrapés avant la physique |
| Mêlée, knockdown, exécution | Ennemi et score individuels sur l’hôte ; verrou d’exécution | Sons, sang, gibs, textes, rang et score ; crédit d’exécution unique |
| Lancer / ramassage / échange | Résolution séquentielle des intentions sur l’hôte | Objet volant et arme au sol dans les snapshots ; sons/textes fiables ; course de pickup testée |
| Portes, verre, props | Géométrie officielle immédiate ; auteur du kick conservé | Angle de porte indépendant pour le rendu, débris bois/verre, impacts et sons |
| Caisses et intermission | Claims par slot, bonus individuel, drop de cache unique | AMMO et état personnel communs ; réapparition avec arme de base |
| À terre, réanimation, spectateur, reprise de vague | Saignement 25 s, maintien 2 s arbitré par l’hôte ; défaite si tous à terre/morts ; départs exclus | Reptation, flaque, compteur, anneau, bips, protection 0,8 s, puis caméra spectateur et réapparition |
| Vagues et spawn | Spawner hôte ; sécurité pour chaque joueur vivant | Marqueurs répliqués, réaffectation des entrées occupées, fondu WAVE, sirène de début et fanfare |
| Pings | Validation/rate limit côté hôte | Message temporaire et bip chez les pairs |
| Pause, visibilité et déconnexion | Pause décidée par l’hôte ; absence de migration | Attente explicite, options client locales, sorties immédiates et retour au titre |
| Lobby et résultats | Host/ready/start, epochs et quorum validés | Sept portraits, choix/prêt, MVP puis colonnes, confirmation individuelle et nouvelle mission |

Les sons et particules sont cosmétiques : leur simulation locale et leur aléatoire peuvent différer entre navigateurs. Les événements sont regroupés avec un plafond mémoire ; une congestion prolongée peut éliminer les plus anciens effets en attente sans modifier le résultat de la simulation. Les mesures à cinq joueurs sont dans [multiplayer-performance.md](multiplayer-performance.md).

## Commandes

L’extension de réanimation est couverte par `test_multiplayer_revive.js` (25 secondes complètes simulées, portée/obstacles, relâchement, sauveteurs concurrents, décès du sauveteur, inputs expirés, snapshots et solo). `tools/validate_revive.cjs` est appelé par le parcours WebRTC : il teste la reptation client, l’interruption puis le maintien E côté hôte et A via Gamepad API côté client, la conservation des armes/munitions et les pixels du liseré sur 42 poses. Les anciens scénarios spectateur raccourcissent uniquement le délai de saignement de leur fixture ; la règle de production reste 25 secondes.

`npm test` lance **31 suites**, dont les sept suites multijoueur et le contrôle d’accès du serveur public utilisé par le launcher. Avec Playwright de développement et le serveur statique, `node tools/validate_multiplayer.cjs` lance le parcours complet et appelle `tools/validate_multiplayer_events.cjs` dans la véritable room à cinq. `node tools/validate_menus.cjs` couvre séparément les menus solo aux quatre résolutions. Les commandes de configuration figurent dans [l’architecture](multiplayer-architecture.md#validation-et-reproduction).

Les tests utilisent les relais MQTT publics et de vrais canaux WebRTC, mais tournent sur une machine unique. Ils ne remplacent pas des essais entre plusieurs réseaux NAT ni un contrôleur physique ; la Gamepad API est simulée. Aucun hook de test ni dépendance de validation n’est livré au jeu.
