# Sols éditables et sprites — revue du 9 septembre 2026

Travail réalisé directement, sans sous-agents. Comparaison visuelle dans `sprite_review.html`, avec captures Hotline Miami 2 de [PC Gamer](https://www.pcgamer.com/hotline-miami-2-wrong-number-review/) et du [guide Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=419037574).

## Sols

Les anciens sols venaient de trois sources : zones, surfaces des bureaux vitrés et pièces techniques centrales. Le nouveau champ optionnel `floorLayers` les expose dans un ordre unique. Le renderer utilise ces couches à la place des anciennes passes lorsque le champ existe, y compris si la liste est vide. Les anciennes cartes sont migrées sans modifier leurs murs, meubles ou fichiers source.

L'éditeur permet de dessiner un polygone ou un rectangle, déplacer une zone, tirer ses sommets, ajouter un sommet sur un bord, retirer un sommet, changer le matériau, réordonner, dupliquer et supprimer. Les opérations entrent dans l'historique. Les polygones qui se croisent ou ont une surface nulle sont refusés. Le revêtement reste découpé par l'enveloppe du bâtiment : les matériaux ne modifient pas la physique ou les murs.

Le test navigateur étend la pièce centrale 2, change son matériau, ajoute et retire un sommet sur un bord, teste l'ordre, annule/rétablit les changements, crée polygone et rectangle, supprime/rétablit une zone, puis vérifie les coordonnées et matériaux après chargement dans le jeu. Le double-clic a nécessité une correction : une tolérance sur le bord sélectionné empêche le clic de sélectionner la couche située dessous.

## Sprites : critique et corrections

Les anciens fauteuils/poufs étaient de simples disques, les plantes des rectangles verts, et les imprimantes des rectangles blancs avec une fente. Les façades d'ascenseur étaient incompatibles avec une vue verticale.

Une bibliothèque de sprites originaux remplace ces formes. Elle partage les mêmes contours sombres, une lumière supérieure gauche, des palettes limitées et des pixels de deux unités avec le reste du jeu. Les sprites sont mis en cache, sans animation aléatoire ou scintillement. Le jeu, l'éditeur et la galerie emploient les mêmes dessins.

| Élément | Critique du premier passage | Correction vérifiée |
|---|---|---|
| Canapé, fauteuil | Les coussins avaient l'air de panneaux rigides | Bords rembourrés, coutures fines, accoudoirs, dossier et creux distincts |
| Poufs | La couture droite évoquait une bouche | Couture déplacée vers le bord et bouton central discret |
| Plantes, jardinières | Feuillage trop clairsemé | Couronne sombre, feuilles superposées plus larges, nervures et pots |
| Meuble végétalisé | Des poignées suggéraient une vue frontale | Plateau supérieur en bois, bac planté, petit document posé dessus |
| Imprimante | Silhouette trop abstraite | Vitre du scanner, capot, commandes et papier vus du dessus |
| Cabine acoustique | Grande boîte uniforme | Parois en U, entrée ouverte, assises opposées et table centrale |
| Ascenseur | Portes verticales dessinées sur le sol | Façade supprimée ; petit repère d'arrivée à plat, données des vagues conservées |
| Café et eau | Dessins sans relief | Même palette de contours et détails supérieurs que l'imprimante |

La seconde revue a corrigé les défauts ci-dessus. Les références commerciales ont encore une variété de dessins et une patine manuelle plus importantes ; cette revue ne prétend pas prouver une égalité artistique objective. Les silhouettes et matériaux sont maintenant cohérents à l'échelle du jeu, pas seulement en agrandissement.

## Vérification

- `test_floor_layers.js` : migration, aller-retour JSON, rejet de polygones invalides, priorité de rendu et suppression sans retour des anciennes surfaces.
- `docs/test_floor_editor.cjs` : actions réelles de l'éditeur puis chargement dans le jeu.
- `docs/test_editor_palette.cjs` : création, rendu, suppression et historique des 19 types de mobilier ; coordonnées de dessin finies.
- `docs/test_map_workflow.cjs` et `docs/final_review.cjs` : compatibilité des workflows existants et absence d'erreurs JavaScript.
- Galerie finale : `docs/sprites-review-final.png`. Extension centrale : `docs/floor-editor-extension.png`.
