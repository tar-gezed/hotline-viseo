# Vérification finale — 11 septembre 2026

Mise à jour d’intégration du 18 septembre 2026 : depuis les scores, le changement de personnage ouvre toujours la sélection, puis RETOUR mène au nouvel écran titre. Le test navigateur des menus couvre ce parcours et la restauration du volume après la mort. Les résultats ci-dessous décrivent la campagne historique du 11 septembre ; la suite actuelle comprend 21 tests. Voir [validation des menus](menu-direction.md).

## Portes difficiles à pousser et impacts

La poussée est calculée avant que les collisions voisines n'annulent la vitesse du personnage. Sa réponse a été accélérée, tout en restant liée au temps écoulé. Le battant conserve sa géométrie de collision réelle lorsqu'il est ouvert.

Une poussée possède maintenant un acteur responsable et une liste de contributeurs exclus des impacts. Le balayage ne touche qu'une autre cible devant le battant, une seule fois pendant cette poussée. Le retour automatique n'arme aucun impact. Les poussées des ennemis peuvent assommer d'autres ennemis, sans attribuer ces assommements au score du joueur.

## Ouvertures et porte encadrée

La création d'une porte découpe toutes les couches mur/vitre collinéaires, au lieu de s'arrêter au premier hôte. Une nouvelle porte doit mesurer au moins 48 unités. Le chargement d'un ancien JSON enlève les chevauchements dans la copie en mémoire, sans réécrire le fichier.

La porte encadrée correspond à `door_2`, près de la grande table à l'ouest. Les tests couvrent trois points de contact, les deux directions et 30/60/144 FPS, soit 18 traversées. Un test navigateur traverse également cette porte avec le véritable joueur et les touches A/D, sans coup volontaire. Capture : `red-door-passage.png`.

## Ennemis traversant les murs

Les listes d'obstacles des personnages omettaient les cloisons vitrées. Elles sont désormais partagées et comprennent murs, vitres intactes, portes et mobilier solide. Les mouvements sont découpés en pas inférieurs au rayon du personnage, avec résolution répétée des contacts aux angles. Les déplacements ordinaires, assommements et corps utilisent ce même chemin. Les vitres brisées restent traversables.

## Espace après la mort

Espace était reconnu à la fois comme confirmation de menu et comme demande de scores ; le redémarrage était testé en premier. La demande de scores est désormais prioritaire. Test navigateur : même joueur mort après Espace, affichage des scores, puis redémarrage explicite fonctionnel. Capture : `space-shows-scores.png`.

## Résultats

- 15 suites Node réussies, dont murs/vitres/diagonales à 10/30/60/144 FPS et impacts joueur-vers-ennemi / ennemi-vers-ennemi.
- Tests navigateur réussis : traversée réelle de la porte, scores après Espace, redémarrage, mort par porte et vague suivante.
- Régressions de l'éditeur réussies : création/découpe, annulation/rétablissement, export/import, brouillon joué, modification des sols.
- Aucune erreur JavaScript dans les scénarios navigateur. Les scénarios de passage isolent les attaques de l'IA afin de tester la collision ; ils ne constituent pas une simulation prolongée de toutes les configurations de foule.
- SHA-256 du fichier utilisateur inchangé pendant cette correction : `2C20338617D75BD40F5151D425EAD09A40EFF37080F42883B98F896B34857A61`.
