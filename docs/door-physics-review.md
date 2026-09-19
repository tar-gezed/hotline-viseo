# Portes : diagnostic et corrections

Intégration After Hours : le compteur de portes reste consultable dans les
[résultats](score-direction.md), sous les catégories principales. Les formules
de score et les règles physiques de cette revue sont conservées.

Mise à jour d’intégration du 18 septembre 2026 : l’écran **CONTRÔLES** documente Espace et △/Y pour l’action exécution/porte. La refonte des menus ne modifie pas les règles physiques décrites dans cette revue ; leurs régressions font partie des 21 suites actuelles. Voir [direction des menus](menu-direction.md).

La vitesse angulaire seule armait les dégâts : les poussées normales accumulaient du couple et un rebond pouvait toucher plusieurs fois. La course relançait aussi automatiquement un coup à chaque frame près d'une porte. Enfin, les ennemis assommés glissaient sans collision avec le décor ; ils restaient vivants et comptaient donc toujours dans la vague, même lorsqu'ils paraissaient morts ou devenaient inaccessibles.

La poussée est désormais distincte du combat, limitée et amortie selon le temps écoulé. Elle intervient avant que la collision annule la vitesse de déplacement. Seul un coup volontaire arme brièvement le balayage ; une cible ne peut être frappée qu'une fois par coup. Le coup exige un mouvement réel de la porte vers la cible. Les rebonds dangereux et les coups automatiques pendant la course sont supprimés. Les requêtes de collision utilisées pour vérifier une carte ne modifient plus les portes et n'infligent aucun dégât.

Un coup ordinaire assomme, Don Juan permet de tuer (les lourds gardent leur résistance). Les cibles assommées conservent leurs collisions et se relèvent. Leur silhouette utilise la même anatomie que le corps mort, avec vêtements intacts, respiration, texte « AU SOL » et barre de récupération. Les morts par porte passent par `takeHit` / `die`, produisent le même corps que les armes, lâchent leur arme et déclenchent le retour visuel du combat. `die` est idempotent et conserve l'angle d'impact, même égal à zéro.

Le compteur de vague était déjà synchronisé avec les ennemis vivants : aucune élimination artificielle des ennemis au sol n'a été ajoutée. Les tests vérifient que le dernier ennemi effectivement mort déclenche l'intermission et la vague suivante.

Validation : 14 suites Node, dont traversée avec deux acteurs à 30/60/144 FPS ; test navigateur de la boucle réelle avec IA neutralisée pour isoler le coup létal et la progression des vagues. La planche `door-states-review.png` compare les états au sol à taille de jeu et en agrandissement. Une seconde passe visuelle remplace les corps rectangulaires par des membres pliés et un costume et une tête détaillés. Ce test contrôlé ne remplace pas un long équilibrage des combats en foule.

La carte utilisateur `maps/active.json` n'a pas été modifiée.

## Enemy combat and patrol integration

Enemy shots check cover between body and muzzle. Enemies investigate player gunshots at their heard location, while melee and dry fire do not summon them. Each automatic patrol round has a 50% chance of a reachable doorway excursion and return. Wave totals follow 5, 8, 13, 21, 34, 55, 89, 144 and onward, with at most 36 concurrent enemies and validated spawn space. Visual targeting, body clearance and stuck recovery remain active. The current Node regression runner includes 22 suites. See [combat rules and regression coverage](architecture.md#enemy-combat-and-navigation).
