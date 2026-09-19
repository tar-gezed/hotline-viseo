# Carte chargée automatiquement

L’onglet du jeu affiche **Hotline Viseo: After Hours**. Le décor des
[résultats](../docs/score-direction.md) est généré séparément des cartes ; aucun
champ ni asset supplémentaire n’est nécessaire dans les exports JSON.

Déposer ici le JSON exporté par l'éditeur et le nommer **active.json**.
Lancer le jeu via `npm start` ou `Lancer-le-jeu.cmd`, pas en ouvrant directement index.html. Sur GitHub Pages, publier ce fichier avec le jeu : aucune étape serveur supplémentaire.
Au prochain lancement/rechargement, le jeu le charge avant de créer la physique et les vagues.
Les anciens exports `hotline-viseo-map-edits.json` sont également acceptés : les renommer `active.json`.

Priorité au lancement normal : `maps/active.json`, carte importée dans le navigateur, carte originale.
Les boutons « Jouer cette carte » et « Jouer la carte importée » sélectionnent explicitement leur carte.
Une carte invalide affiche une erreur ; elle n'est pas remplacée silencieusement par l'originale.
Retirer ou renommer active.json pour désactiver ce chargement. Conserver des copies de sauvegarde avant de remplacer le fichier.


Depuis le jeu, ouvrir **TOOLS / MAPS** sur l’écran titre pour choisir/importer une carte ou ouvrir l’éditeur. Le démarrage et les aperçus de carte passent par le titre, puis par la sélection du personnage ; la résolution de `active.json`, des imports et des brouillons reste inchangée.

## Enemy combat and patrol integration

Enemy shots check cover between body and muzzle. Enemies investigate player gunshots at their heard location, while melee and dry fire do not summon them. Each automatic patrol round has a 50% chance of a reachable doorway excursion and return. Wave totals follow 5, 8, 13, 21, 34, 55, 89, 144 and onward, with at most 36 concurrent enemies and validated spawn space. Visual targeting, body clearance and stuck recovery remain active. The current Node regression runner includes 22 suites. See [combat rules and regression coverage](../docs/architecture.md#enemy-combat-and-navigation).
