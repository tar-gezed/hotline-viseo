# Performance coop — 23 septembre 2026

## Ce qui a changé

Les clients recevaient l’état du monde à 20 Hz et certaines entités étaient dessinées directement à cette cadence. Les corrections séparent maintenant l’autorité réseau de la présentation :

- Les traceurs de balles avancent à chaque frame, avec retour local immédiat et événements de naissance pour les tirs plus courts qu’un intervalle de snapshot. Les tirs de l’hôte ne doublent pas les traceurs du joueur local.
- Les portes ont un angle de dessin animé indépendamment de l’angle de collision, appliqué immédiatement. La prédiction ne modifie aucune physique de porte.
- La réconciliation du joueur conserve jambes, recul et balancement ; les autres acteurs interpolent positions et angles sur 100 ms.
- Les naissances et impacts sont regroupés à 20 Hz, avec 96 effets en attente au maximum et un seul envoi fiable en vol. Les traceurs sont plafonnés à 128 ; leur raycast de décor n’est effectué qu’à la naissance. Les projectiles hors champ ne sont pas dessinés en coop, mais restent simulés par l’hôte.
- La sélection coop parmi cinq cibles est réévaluée toutes les 100–120 ms. Le déplacement, les attaques et la vision de la cible retenue continuent à chaque pas ; mort/départ invalident immédiatement la cible.

Les dégâts, ramassages, interactions, scores, IA et vagues restent exclusivement simulés par l’hôte. Le mode solo conserve son chemin d’exécution.

## Vérifications fonctionnelles

Les tests Node imposent des snapshots à 20 Hz et échantillonnent la présentation à 60 Hz : les positions de balles et angles de portes doivent progresser à chaque frame. Ils vérifient l’absence de double tir local, le rejet d’une naissance tardive après impact, l’expiration sans nouveau paquet, le plafond mémoire et la mise à jour immédiate de la collision des portes.

Le parcours Chrome utilise de vrais canaux WebRTC et la découverte publique MQTT, de deux à cinq pairs. Il ajoute 180–220 ms d’aller-retour et perd un paquet temps réel sur cinq pendant un tir client et son déplacement : apparition locale du traceur, kill arbitré par l’hôte, absence de friendly fire et réconciliation sont vérifiés. Le repli sur le transport fiable est ensuite testé en fermant volontairement un canal rapide. L’ensemble du parcours se termine sans erreur JavaScript et revient au solo, dont la pause est vérifiée.

## Charge de cinq pairs

`tools/measure_multiplayer.cjs` intervient uniquement dans les pages de test : cinq joueurs invulnérables avec Uzi, 36 ennemis actifs, patrouilles et collisions réelles, porte animée et tirs continus. Les fixtures et instruments ne sont pas importés par le jeu livré. Les mesures utilisent Chrome headless sous Windows sur un Ryzen 7 5700X, en 1280 × 720 par vue. Elles ne constituent pas une certification sur tout matériel.

| Mesure | Résultat observé |
| --- | --- |
| Cinq vues dessinées simultanément sur cette machine | Environ 15–19 FPS par vue selon le passage |
| Travail JS client, cinq vues actives, p95 | 5,6–6,3 ms par frame après l’audit des événements |
| Application/interpolation client des snapshots, p95 | 0,6–0,7 ms par frame |
| Snapshot de stress, taille moyenne / maximale | Environ 22,1 Ko / 23,7 Ko |
| Une seule vue hôte dessinée, cinq pairs toujours actifs | 87,5 FPS moyens ; travail JS p95 12,4 ms |
| Une seule vue client dessinée, cinq pairs toujours actifs | 95,2 FPS moyens ; travail JS p95 4,3 ms |

Les deux dernières lignes proviennent de passages successifs de cinq secondes dans la même fixture : les quatre autres vues cessent seulement de dessiner, tandis que leurs boucles, inputs et connexions continuent. La hausse observée indique une contention importante liée au rendu des cinq vues sur une machine. Ce test ne simule pas cinq ordinateurs indépendants ; les acteurs continuent d’évoluer entre les passages et les FPS moyens ne garantissent pas l’absence de frames longues. Les captures de tous les clients simultanément restent un test de surcharge utile, pas une mesure de l’expérience attendue sur chaque ordinateur.

Les chiffres ci-dessus ont été repris après l’ajout des effets/textes fiables et de la conservation des tirs très courts (`performance-events.json`). Ils ne représentent pas un gain comparatif isolé : la fixture et la charge machine évoluent.

Aucune frame de porte inchangée n’a été mesurée pendant son mouvement dans ces passages. Des traceurs distants peuvent s’arrêter après 100 ms sans nouvel état : l’extrapolation est volontairement bornée. Leur échantillonnage en stress est limité par leur durée de vie très courte ; le test déterministe à 60 Hz est la vérification directe de l’absence de palier artificiel à 20 Hz.

À 20 snapshots/s vers quatre clients, un snapshot de 22 Ko représente environ 1,76 Mo/s (14 Mbit/s) de charge utile sortante pour l’hôte, avant surcoût du transport. C’est la fixture de stress, pas une mesure moyenne de toutes les parties. `bufferedAmount` élimine les snapshots obsolètes plutôt que d’accumuler du retard ; les gros messages utilisent le repli fiable borné. Une connexion montante insuffisante peut donc réduire la fraîcheur de l’état reçu. Le débit et les routes NAT restent à vérifier sur les réseaux visés.

## Reproduction

Extension du 24 septembre : les liserés utilisent deux surfaces 160×160 réutilisées pour toute l’escouade, sans allocation de canvas à chaque frame ni lecture de pixels en production. La réanimation ajoute au plus cinq cibles, avec portée vérifiée avant tout test de géométrie. Les chiffres ci-dessus précèdent cette extension et ne constituent pas une nouvelle mesure de sa charge.

```powershell
# Premier terminal
node tools/serve.cjs --port 8087 --prefix /hotline-viseo/

# Autre terminal ; installation de développement uniquement si nécessaire
npm install --prefix .cache/browser --no-save playwright
$env:PLAYWRIGHT_MODULE = (Resolve-Path '.cache/browser/node_modules/playwright').Path
$env:MP_MEASURE = 'current'
$env:MP_ISOLATE = '1'
node tools/validate_multiplayer.cjs
```

`MP_MEASURE` active la fixture ; `MP_ISOLATE` ajoute les deux passages à une seule vue. `MP_PROFILE=1` enregistre facultativement le profil CPU hôte. Les rapports `performance-*.json`, `host.cpuprofile`, le rapport d’acceptation et les captures vont dans `test-results/multiplayer/`, ignoré par Git. Omettre ces variables conserve seulement l’acceptation fonctionnelle. Les seuils de performance ne font pas échouer la CI : ils dépendent du matériel et de la charge extérieure.

Le parcours manette utilise une Gamepad API simulée avec le véritable `InputManager`. Un contrôleur physique, cinq ordinateurs distincts et les combinaisons de NAT/pare-feu ne sont pas couverts par cette validation automatisée. Les règles de réseau, de déploiement et de version sont dans [l’architecture multijoueur](multiplayer-architecture.md).
