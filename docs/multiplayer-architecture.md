# Architecture multijoueur — Hotline Viseo: After Hours

## Périmètre V1

Coop Internet pour 2 à 5 navigateurs, sans serveur de jeu ni build au déploiement. Le créateur reste l’hôte (P1, slot 0). Les quatre clients au maximum communiquent uniquement avec lui. Trystero MQTT 0.25.4 assure la découverte via ses relais publics ; les données de jeu circulent en WebRTC. Les connexions client–client sont refusées dès le handshake.

Le solo conserve son chemin de simulation, sa pause, son scoring et son leaderboard. `main.js` importe `coop_session.js` seulement à l’ouverture de MULTIJOUEUR ou d’une invitation `?room=…`. Le bundle est préchauffé par `requestIdleCallback` dans le menu multijoueur. Aucun module réseau ni hash de carte n’est chargé/calculé au démarrage solo. Tous les modules et le bundle sont servis localement avec des URL relatives, y compris sous `/hotline-viseo/`.

Depuis l’extension du 24 septembre, cette V1 utilise l’état `DOWNED`, le saignement et la réanimation entre collègues, puis le spectateur et la réapparition à l’intermission. Le solo reste à mort immédiate. Il n’y a toujours pas de migration d’hôte : sa fermeture termine explicitement la session.

## Modules et propriété des données

| Fichier | Responsabilité |
| --- | --- |
| `js/network/room_code.js` | Codes cryptographiques de 5 caractères, alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, normalisation et liens conservant le préfixe du site |
| `js/network/protocol.js` | Version 1, canonisation SHA-256, schémas bornés, codecs et interpolation angulaire |
| `js/network/network_manager.js` | Admission, topologie étoile, canaux, heartbeat, état du lobby, epochs de mission et quorum des résultats |
| `js/network/remote_input.js` | Capture des intentions et adaptateur de commandes utilisé par la simulation hôte |
| `js/network/world_sync.js` | Sérialisation explicite des entités et rendu des snapshots clients |
| `js/network/projectile_presentation.js` | Traceurs cosmétiques locaux, naissances fiables et trajectoires entre snapshots, sans dégâts ni mutation du monde |
| `js/network/presentation_events.js` | Liste explicite des effets/textes/sons fiables, validation des arguments et garde contre les doubles événements imbriqués |
| `js/network/coop_logic.js` | Départs sûrs, score individuel, classement, défaite et réapparition |
| `js/network/player_presentation.js` | Liseré de silhouette produit depuis l’alpha du sprite, avec deux petits canvas réutilisés pour toute l’escouade |
| `js/network/coop_session.js` | Orchestration lobby/mission/résultats, simulation fixe, prédiction, spectateur et options locales |
| `js/ui/coop_ui.js` | Composants Canvas opt-in, texte ajusté aux cartes et navigation souris/clavier/manette |
| `js/ui/multiplayer_menu.js`, `lobby_menu.js`, `multi_score_screen.js` | Saisie native/pavé virtuel, grille du roster, MVP et colonnes de résultats |

`players` est une `Map` de slots 0–4 ; `player` désigne toujours le personnage local. Les `RemotePlayer` réutilisent `Player.render` et `CharacterArt`. Leurs collisions mutuelles sont désactivées ; murs, props, portes et vitres restent actifs.

L’hôte exécute seul IA, projectiles, dégâts, portes, caisses, ramassages, vagues et attribution de score. Il met chaque joueur à jour avec un `RemoteInputSource`, puis simule le monde une fois à 60 Hz. Deux intentions simultanées de ramassage sont arbitrées en séquence dans ce même monde. Les tirs alliés ne touchent pas les collègues ; les tirs ennemis choisissent leur première cible vivante sur le segment.

## Transport, admission et horloges

Namespace de découverte : `hotline-viseo:mp:v1:<CODE>` ; appId `hotline-viseo:mp:v1`.

Le handshake asynchrone échange version, règle de jeu `downed-revive-v1`, rôle, nonce de session et fingerprint SHA-256 de la carte canonique. Les anciennes versions à mort immédiate, cartes/versions incompatibles, salons complets et missions en cours sont refusés. Les places sont réservées avant la fin du handshake pour éviter les admissions concurrentes au-delà de cinq joueurs. Une collision entre créateurs fait régénérer le code d’un seul créateur, selon l’ordre des peer IDs. Le fingerprint exclut les états transitoires de portes/vitres et leur attribution de coups.

| Flux | Fréquence / garantie |
| --- | --- |
| Inputs | Capture à chaque frame, envoi 40 Hz, séquence monotone, vecteur borné, angle et compteurs d’actions critiques |
| Snapshots hôte | 20 Hz ; tampon d’interpolation client de 100 ms, avec wrap sur ±π |
| `hv-fast-v1` | Canal RTC négocié, ID 12, `ordered:false`, `maxRetransmits:0` ; abandon des frames si `bufferedAmount > 65536` |
| `hv-realtime` | Repli Trystero fiable si le canal rapide échoue ou si le snapshot dépasse 60 000 caractères ; au plus un envoi en vol par pair |
| `hv-control` | Lobby, ready/start, résultats, départs, interactions, états importants, pings et visibilité fiables |
| Heartbeat | Une seconde ; délai de connexion 35 s, expiration active 20 s, grâce 120 s pour onglet caché |

Les messages portent nonce et numéro de mission. Un nouveau joueur arrivant entre deux missions adopte le numéro de l’hôte dans `welcome`. Les callbacks d’une ancienne connexion sont invalidés par une génération locale et l’identité du canal ; chaque envoi en vol a son propre jeton, afin qu’une ancienne complétion ne libère pas un nouvel envoi. Les lots d’effets et d’états fiables sont également isolés entre missions. Les inputs périmés deviennent neutres après 250 ms. Les compteurs de tir/lancer/exécution sont répétés dans les frames suivantes puis dédoublonnés, ce qui récupère un déclenchement perdu sans rejouer une action déjà consommée.

Les codecs binaires d’input et UTF-8 de snapshot sont testés sous Node. Le transport de cette V1 utilise des enveloppes JSON validées pour les deux canaux. Aucune position, aucun dégât ni kill envoyé par un client n’est accepté comme autorité. Les tableaux, champs et cadences sont bornés ; seuls les champs explicitement autorisés sont copiés dans les entités.

Le client prédit son déplacement via `Player.update(..., processActions=false)`, applique la position acquittée et rejoue les mouvements non acquittés. La réconciliation conserve la phase visuelle des jambes et du recul : rejouer les déplacements ne rejoue pas les animations. Le HUD utilise son propre `dt` de présentation : les snapshots ne doivent jamais figer le bandeau WAVE. Les réticules d’apparition sont inclus dans les snapshots.

### Présentation fluide chez les clients

La cadence réseau de 20 Hz ne détermine pas la cadence de dessin. Coéquipiers et ennemis utilisent un tampon de 100 ms avec interpolation des positions, angles, jambes et animations d’exécution. Le joueur local anime son exécution avec une horloge cosmétique séparée, extrapolée au plus 100 ms, sans déclencher de dégâts. Les balles utilisent des traceurs dédiés avançant à chaque frame, car une balle peut naître et toucher un mur entre deux snapshots. Les événements fiables de naissance complètent les snapshots ; un identifiant stable et une liste bornée d’identifiants retirés empêchent les doublons et les résurrections de tirs arrivés tard.

Un tir local produit immédiatement traceur, son, recul, flash, douille et vibration. Les trajectoires visuelles sont bornées dans le temps (extrapolation distante maximale 100 ms) et en nombre (128 traceurs). Un raycast de lecture à la naissance borne leur parcours contre le décor en excluant les partitions de verre traversables par les balles ; ces objets n’appellent jamais la simulation de dégâts. Les points de fin fiables clipsent les tirs très courts, qui conservent au moins une frame visible même si l’impact précède le dessin. Les tirs locaux confirmés sont associés à leur prédiction ; une confirmation sans prédiction possède son propre rendu. La décision de toucher un ennemi, d’ouvrir une porte, de briser du verre ou de marquer des points reste exclusivement chez l’hôte.

Les portes ont un `renderAngle` distinct de leur angle physique. Le premier converge à chaque frame vers l’angle reçu et une courte projection de la vitesse angulaire ; le second est mis à jour immédiatement pour les collisions. Le battant et son ouverture utilisent le même angle de dessin. La prédiction des clients ne pousse pas physiquement les portes. Les sons/impacts et naissances de projectiles sont regroupés à 20 Hz, avec une file maximale de 96 effets et un seul envoi fiable en vol, pour garder le transport borné pendant les fusillades.

Voir les [mesures et limites de performance](multiplayer-performance.md) pour distinguer fluidité entre paquets, coût de présentation et charge cumulée de cinq navigateurs.

## Vagues, morts et score

Chaque caisse coop conserve un masque de claims par slot : elle reste utilisable pour les collègues non servis, tandis que l’arme du cache n’est libérée qu’une fois. Hôte et clients emploient le même renderer avec `AMMO` et `RÉCUPÉRÉ`. Les bris de verre, sons, textes, impacts, sang et empreintes sont rejoués par une liste de méthodes cosmétiques bornée ; les appels imbriqués sont dédoublonnés. L’[audit des événements](multiplayer-events.md) associe chaque bug à son test.

Les vagues coop comptent `ceil(base * (1 + (joueurs - 1) * 0.35))` ennemis. Le solo garde les totaux Fibonacci historiques. La limite simultanée de 36 ennemis reste active.

Le spawner vérifie la géométrie et une distance de sécurité de 260 unités à chaque joueur vivant. Une entrée occupée est déplacée vers une entrée sûre ou un décalage validé ; son nouveau point est annoncé pendant au moins 1,2 s. Un élément bloqué passe derrière les autres renforts au lieu de bloquer la file entière. Si aucun emplacement sûr n’existe, l’annonce indique `ZONE OCCUPÉE` et le spawner attend un espace valide. Aucune apparition forcée dans un collègue ou un mur.

L’IA privilégie une cible visible (cône + LoS) et tient compte des tirs récents. En coop, l’acquisition parmi les cinq joueurs est répartie toutes les 100–120 ms ; une cible morte ou déconnectée est invalidée immédiatement. La vision, les attaques et les déplacements de la cible retenue restent vérifiés à chaque pas de simulation. Le comportement acoustique existant continue d’enquêter à la position entendue. Le perk TED est évalué séparément pour chaque cible de chien. Cinq départs coop sont validés autour du départ principal.

En coop, un impact fait passer le joueur en `DOWNED` (`isAlive=true`, `isDowned=true`) pour 25 s. Il rampe à 22 % de sa vitesse, sans tir, lancer, ramassage, exécution ou ravitaillement ; l’IA et les balles ennemies ignorent les joueurs à terre. Une flaque grandit au lieu de chute et des traces suivent la reptation. Le client prédit seulement le déplacement : l’hôte décide du saignement et des réanimations.

Un joueur debout à 58 unités au maximum maintient E/ESPACE ou A/X pendant 2 s. Un balayage de géométrie vérifie murs, props, verre et battants à chaque pas. Le bit maintenu `INTERACT` des inputs transporte l’intention ; les inputs périmés sont relâchés après 250 ms. Ce contexte réserve les actions, pour éviter un lancer sur E ou une exécution/coup de porte sur ESPACE. Un seul sauveteur fait progresser chaque cible ; relâchement, éloignement, obstacle, changement de sauveteur, mise à terre ou déconnexion annulent la progression. Le saignement continue pendant le soin et gagne si les deux délais expirent au même pas. La réanimation conserve arme/munitions et accorde 0,8 s d’invulnérabilité. Anneau horaire, bips synthétiques et retour visuel de réussite accompagnent le soin.

Après 25 s sans secours, le joueur meurt, observe le collègue debout le plus proche et peut changer de cible. Une vague terminée remet morts et joueurs à terre à leur point de départ, arme de base et 0,8 s d’invulnérabilité. Une escouade entièrement à terre ou morte perd avant toute réanimation/réapparition. Les déconnexions sont retirées du registre de simulation et du quorum des résultats. `falls` compte chaque chute une seule fois ; le saignement final ne la recompte pas. Les écrans de résultats et de classement conservent leur présentation.

Kills, coups de porte, lancers et bonus de ravitaillement sont attribués à leur auteur. Le score individuel applique les multiplicateurs de combo et du personnage. Le score d’équipe comprend également les bonus de fin de vague. Le classement MVP utilise `kills * 500 + score + survieEnSecondes - morts * 300`, puis le slot comme départage déterministe.

Seul l’hôte conserve les 20 meilleurs runs d’équipe dans `localStorage['hotline-viseo-coop-leaderboard-v1']`. Le classement solo utilise toujours sa propre clé. Les résultats affichent rang, nom/pseudo, survie, kills, morts, arme favorite et score. Chaque collègue valide sa propre colonne ; tous les connectés doivent valider pour rouvrir le lobby.

## Interactions et UI

Le lobby montre cinq cartes d’escouade et les sept portraits du roster. Le survol/focus permet de comparer métier, équipement et bonus ; clic ou A confirme le choix. Le statut prêt verrouille le choix jusqu’à annulation, puis l’hôte lance lorsque tous les joueurs sont prêts (minimum deux).

| Écran/action | Clavier / souris | Manette standard |
| --- | --- | --- |
| Code | Champ natif et collage ; pavé virtuel cliquable | Croix/stick puis A ; X efface ; B revient |
| Roster | Clic portrait, 1–7 ou flèches + Entrée | Croix/stick ou LB/RB puis A |
| Prêt / lancement | Boutons ; Tab pour changer de zone | X prêt ; Start lance côté hôte |
| Mission | Contrôles solo conservés | Deux sticks ; RT tir ; X ramasser/lancer ; Y exécution/porte |
| Réanimation | Maintenir E ou ESPACE près du collègue | Maintenir A ou X |
| Pings | 1 aide, 2 par ici, 3 attention, 4 merci | Croix haut/droite/bas/gauche |
| Spectateur | Q/D ou clic droit/gauche | LB/RB |
| Options locales | Échap ; clic curseurs ou gauche/droite | Start ; stick/croix ; B revient |
| Résultats | Espace/Entrée ou bouton visible | A |

L’appui Start du lobby attend le relâchement avant d’être considéré comme une pause en jeu. Selon la règle demandée lors de la correction du 23 septembre, **Échap/Start chez l’hôte suspend le monde coop pour toute l’escouade**. Ses options ouvertes et son onglet caché sont deux raisons indépendantes : revenir sur l’onglet ne reprend pas une partie dont le menu reste ouvert. Chez un client, les options n’arrêtent pas l’hôte. La simulation et les snapshots sont suspendus ensemble ; les clients affichent `HÔTE EN PAUSE / EN ATTENTE`. Quitter revient immédiatement au titre, sans attendre la fermeture du transport. La reconnexion WebRTC en cours est gérée par le transport ; une session expirée revient au menu et peut être rejointe tant que le salon est au lobby. Il n’y a pas de migration d’hôte.

Direction visuelle : portraits sélectionnables et distinction focus/choix/prêt inspirés des écrans de sélection fournis et de [Party Animals](https://www.gamereactor.de/party-animals-1134873/), MVP puis rangs et colonnes inspirés de [Super Smash Bros. Ultimate](https://www.smashbros.com/en_US/howtoplay/mode.html). Les illustrations, composants, couleurs et polices restent ceux du jeu. Une zone logique 1280 × 720 uniforme conserve les hitboxes et les marges en 4:3, 16:9 et ultrawide. Le MVP possède un seul grand rang ; les cartes secondaires sont plafonnées en largeur, même à deux joueurs. Les colonnes de bilan affichent des noms d’armes lisibles et ajustent les textes sans débordement.

## Validation et reproduction

`npm test` exécute les 23 suites historiques, sept suites coop et la suite du serveur site-only (31/31) : room code, protocol, network, logic, presentation, events et revive. Elles couvrent les entrées malformées, retransmissions/edges, SHA-256, admission simultanée, autorité, epochs, congestion, quorum/départ, IA multi-cibles, départs sûrs, réapparition, attribution unique du score, file de spawn bloquée, fondu du HUD et navigation/résultats à 2–5. Les tests de présentation vérifient aussi qu’un projectile reçu à 20 Hz et une porte avancent à chacune des frames à 60 Hz, sans retarder l’angle de collision ni doubler un tir local.

Test navigateur facultatif avec une installation Playwright de développement et Chrome :

```powershell
node tools/serve.cjs --port 8087 --prefix /hotline-viseo/
# Dans un autre terminal :
$env:PLAYWRIGHT_MODULE = (Resolve-Path '.cache/browser/node_modules/playwright').Path
node tools/validate_multiplayer.cjs
```

Au besoin, installer uniquement l’outil de développement avec `npm install --prefix .cache/browser --no-save playwright`. `CHROME_PATH` et `MULTIPLAYER_TEST_URL` permettent de changer le navigateur/l’URL. Aucun de ces outils n’est importé par la production.

Le runner ouvre réellement cinq contextes Chrome indépendants, utilise les relais publics MQTT et de vrais canaux WebRTC. Il vérifie admission/refus d’un sixième, étoiles de 4+1 liens, prédiction, kills distants sans friendly fire, ramassage concurrent, repli fiable, portes/vitres, mort/spectateur/réapparition, deux résultats successifs, arrivée entre missions, déconnexion, absence d’import réseau en solo et pause solo après sortie. Le combat distant et la réconciliation sont également testés avec 180–220 ms d’aller-retour et 20 % de perte des paquets temps réel injectés. Il reproduit les entrées occupées en vague 2, le bandeau client, les raccourcis manette, le changement de cible spectateur avec LB/RB, les curseurs audio à la souris, le pavé de code et les résultats à plusieurs résolutions. Les fixtures sont injectées par interception du script dans Playwright ; aucun hook de test n’est exposé par le jeu livré. Captures et rapport vont dans `test-results/multiplayer/` (ignoré par Git).

La validation manette utilise l’API Gamepad standard simulée dans Chrome et le vrai InputManager ; elle ne constitue pas un essai de matériel physique. Les contextes du test tournent sur une même machine : la découverte Internet est réelle, mais les routes entre réseaux domestiques distincts, NAT symétriques et pare-feu d’entreprise ne sont pas garanties par ce test. Les relais de signalisation ne sont pas un serveur de jeu ni un service TURN ; certains réseaux nécessitent un relais TURN configuré par l’opérateur. HTTPS (ou localhost) est requis pour WebRTC, le hash et les API de navigateur.

## Bundle et publication

Voir [`vendor/README.md`](../vendor/README.md) pour la version, les licences, le hash et la reconstruction reproductible. Le déploiement Pages sert `vendor/` avec `js/` et les autres assets. Aucun import ESM depuis un CDN, aucun serveur applicatif ni clé d’API n’est nécessaire au jeu.

Pour tester une partie Internet depuis Windows, `Lancer-avec-des-amis.cmd` démarre `tools/serve.cjs --site-only` sur `127.0.0.1:8787` et expose ce serveur par un Cloudflare Quick Tunnel. Il faut `cloudflared` dans le PATH ou dans `.cache/cloudflared/cloudflared.exe` ; le binaire reste local et n’est pas commité. L’URL HTTPS temporaire permet aux amis d’ouvrir la même version locale du jeu et change à chaque lancement. Le tunnel s’arrête avec Ctrl+C ; il ne sert pas à l’hébergement permanent. Voir les étapes d’installation dans le [README](../README.md#running-and-inspecting-the-game).
