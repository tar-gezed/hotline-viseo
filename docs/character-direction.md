# Sept personnages VISEO

## Références et direction

Dans Hotline Miami, les masques identifient une aptitude (par exemple les poings de Tony ou la vitesse de Brandon). Hotline Miami 2 pousse davantage les styles distincts : Corey et sa roulade, Mark et ses deux armes, Alex/Ash en duo. Sources : [masques](https://hotlinemiami.fandom.com/wiki/Masks), [The Fans](https://hotlinemiami.fandom.com/wiki/The_Fans), [prise en main des personnages](https://www.sidequesting.com/2014/04/pax-east-2014-hotline-miami-2-wrong-number-preview-recent-calls/).

Le comparatif `character_review.html` présente les sprites réels du joueur à taille de jeu et agrandis, avec deux captures de référence : [Hotline Miami 2 / PC Gamer](https://www.pcgamer.com/hotline-miami-2-pushed-back-possibly-to-2015/) et [Hotline Miami / Tony](https://downrightupleft.com/backtracking-hotline-miami/). Les enseignements visuels retenus sont la silhouette compacte, le contraste vêtement/sol, une arme projetée devant les mains et des masques reconnaissables par leur géométrie plutôt que par leur seule couleur.

Les créations VISEO sont des interprétations stylisées des descriptions fournies, avec masques partiels pour garder cheveux, barbes et lunettes visibles. Aucun portrait photographique n'a été fourni. Les tenues, accessoires et formes de masque sont dessinés dans le projet ; aucune texture du jeu commercial n'est utilisée dans le jeu.

## Identités et règles effectivement appliquées

| Personnage | Identité visuelle | Départ de partie | Bonus / malus |
|---|---|---|---|
| Vincent | Lion doré, barbe brune, lunettes rectangulaires, costume bleu nuit | Magnum, 4 cartouches | Exécution en 0,9 s au lieu de 1,2 s ; capacité des armes à feu ×0,75, arrondie à l'entier inférieur |
| Anne | Panthère violette, silhouette fine, boucles brunes aux épaules, veste framboise | Couteau | Vitesse ×1,20 ; capacité des armes à feu ×0,75 |
| Lucas | Loup gris, coupe courte et côtés dégradés, barbe de trois jours, veste verte | Uzi, 20 cartouches | Délai entre les tirs ×0,85 ; dispersion ×1,25 |
| Arnaud | Ours brun, carrure ample, longue barbe grise, lunettes, tenue bordeaux | Fusil à pompe, 6 cartouches | Impacts de porte létaux contre les ennemis ordinaires ; lourds toujours résistants ; vitesse ×0,80 |
| Jade | Cygne ivoire, longs cheveux bruns lisses, robe ample émeraude | Pistolet silencieux, 12 cartouches | Fenêtre de combo ×1,50 ; délai entre les tirs ×1,15 |
| PAP | Grand-duc, cheveux blancs, cardigan sable | Batte | Points par élimination ×1,50 ; vitesse ×0,85 |
| JC | Cobra bleu, crâne dégagé, veste anthracite | M16, 24 cartouches | Dispersion ×0,55 ; délai entre les tirs ×1,20 |

Les descriptions de métier et les noms affichés viennent de `CONFIG.MASKS`, tout comme les couleurs, les silhouettes et les paramètres de gameplay. Les armes sont réinitialisées au début d'une **partie**, pas à chaque vague. Les sept personnages conservent le rayon de collision de 14 unités : les proportions visuelles ne créent pas de pénalité de collision cachée. La létalité en un coup reste commune.

## Critique et vérification

Première passe : sept formes de masque indépendantes, carrures et palettes distinctes, cheveux et accessoires raccords entre portrait et vue du dessus. La comparaison a révélé des portraits trop lissés et des boucles trop carrées. Seconde passe : portraits rasterisés sur une grille commune et agrandis sans interpolation, boucles irrégulières et détails de costume supplémentaires. Les états d'exécution et de mort réutilisent la tenue et la tête du personnage au lieu de revenir à la veste marron et au masque blanc génériques.

Le test de sélection a aussi découvert un tir involontaire en validant le menu avec Entrée. Le jeu attend désormais le relâchement de l'entrée d'attaque avant d'autoriser le premier tir. Les cartouches annoncées restent donc intactes au départ. La limite de munitions est appliquée aux ramassages et aux réapprovisionnements, et le HUD affiche la capacité du personnage.

Validation : `test_character_roster.js` vérifie les sept équipements, vitesses, cadences, dispersions réelles des projectiles, capacités, restauration au redémarrage, points, fenêtres de combo, durée d'exécution et impacts d'Arnaud. `docs/test_character_roster.cjs` sélectionne les sept cartes du menu et vérifie leurs armes et munitions dans la boucle réelle du jeu, sans erreur JavaScript. Les captures incluent les sept menus et les sept apparitions en jeu, ainsi que la planche avec références. La qualité artistique reste une appréciation ; ces tests ne prétendent pas démontrer une égalité avec l'art original ni remplacer l'équilibrage par des parties prolongées.
