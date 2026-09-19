# Résultats — After Hours

`js/ui/score_screen.js` dessine un écran Canvas opaque original : ciel prune et rose,
soleil strié, montagnes angulaires, bureaux et reflets horizontaux inspirés de Grenoble.
La scène couvre tout le viewport ; les informations utilisent une zone sûre centrée
de 1280×720, uniformément mise à l’échelle, y compris en 16:10 et ultralarge.
Aucun asset externe ni dépendance de production n’est ajouté.

Les huit catégories forment une grille de deux colonnes : éliminations, mêlée,
exécutions, combo, flexibilité, audace, carnage et temps. Elles apparaissent toutes
les 140 ms à partir de 180 ms, avec comptage de 240 ms et tick UI. Le total compte
de 1,22 à 1,56 s ; le grade arrive à 1,58 s à 142 % de sa taille, frappe à 1,74 s
avec un son grave, des éclats radiaux et une courte secousse locale, puis rebondit
jusqu’à 1,85 s. Le commentaire apparaît au contact, centré sur le même axe que la lettre.
Le grade et son commentaire gardent les six couleurs et intitulés du scoring existant.
Le score de base, les tirs, les lancers, les portes, la variété d’armes, le personnage,
la durée et les vagues restent consultables. Les grandes valeurs réduisent leur
taille de police selon la largeur disponible, sans étirement du texte.

Entrée/Espace/R ou A/× passent d’abord le décompte ; une nouvelle pression relance
la partie (ou passe à la vague suivante pour `WAVE_CLEAR`). M ou Y/△ ouvrent les
personnages. Tab/L ou X/□ remplacent les catégories par le classement local ;
Échap/B/○ ferme ce classement, puis retourne au titre. Les quatre actions texte
du pied de page sont cliquables, avec survol rose et curseur main. Le pointeur est
converti depuis le rectangle CSS du Canvas avant d’appliquer le repère de rendu,
même si le Canvas est décalé ou redimensionné. Les événements clavier utilisent
la touche imprimée (notamment M sur AZERTY) et mettent les actions de navigation
en attente pour une consommation unique dans `update`.

**Partager**, après Classement, copie le score final, la vague atteinte, le grade
et son commentaire, des emojis et le lien `https://tar-gezed.github.io/hotline-viseo/`.
Accès par clic, S ou RB/R1. La copie au clavier et à la souris démarre directement
pendant le geste utilisateur pour respecter les règles du presse-papier du navigateur.
Le libellé devient « COPIÉ ! » seulement après succès ; en cas de refus des deux
méthodes de copie, « RÉESSAYER » permet une nouvelle tentative. Aucun message n’est
envoyé à Slack ou à un autre service.

Le classement garde sa clé, son format, sa limite de huit entrées, son tri et sa
déduplication. Seul le `runId` courant reçoit une surbrillance, quelle que soit sa
place ; une partie hors du top 8 est signalée. Les entrées présentent aussi la date
et le combo sauvegardés. Aucune formule, aucun seuil ni stockage de scoring ne change.

La piste procédurale originale `results` joue à 84 BPM : huit mesures, accords
Dm9 / Bbmaj7 / Fmaj7 / Cadd9, nappes douces, basse espacée, percussion lente et
petite mélodie de synthétiseur. Elle utilise le volume/mute musical partagé ;
l’écran restaure le volume choisi après l’atténuation de mort. Les ticks utilisent
le volume SFX partagé. La sortie de l’écran reprend les pistes existantes.

## Validation

`npm test` : 21 suites, incluant les formules exactes, le stockage, les six grades,
le skip, les actions clavier/manette et les coordonnées souris des cinq résolutions.
La suite musicale exécute aussi les 128 pas de la nouvelle piste et les contrôles
de volume/mute existants.

`node tools/validate_scores.cjs` (serveur sur 8087) utilise Playwright et Edge
uniquement en développement. Variables : `PLAYWRIGHT_MODULE`, `CHROME_PATH`,
`SCORE_TEST_URL`. Il produit 30 captures de grades, les classements des cinq formats,
une partie classée deuxième, la manette et un total à neuf chiffres dans
`test-results/scores/`. Les cinq formats sont 1280×720, 1440×900, 1920×1080,
2560×1440 et 3440×1440. Il contrôle les boîtes de texte transformées (limites et
chevauchements), les vraies entrées clavier/souris et une Gamepad API simulée.
Le test couvre aussi M physique et M AZERTY, les quatre clics sur les cinq formats,
un Canvas décalé/redimensionné et le contenu partagé avec un presse-papier simulé
(succès, refus, repli), sans modifier le presse-papier système. Quatre captures
supplémentaires inspectent l’arrivée, la frappe et la stabilisation du grade.
Une manette physique n’a pas été utilisée.

L’outil rend également la piste et son raccord de boucle via `OfflineAudioContext`
en WAV stéréo, avec vérification de signal fini, audible et sans échantillon saturé.
Le WAV et les mesures figurent dans `test-results/scores/after-hours.wav` et
`validation.json`. Cette vérification technique ne remplace pas une écoute humaine.

Revue visuelle demandée : GPT‑5.6 Luna Max a examiné les captures D, B, A+, S,
le classement et les contrôles manette. Verdict conforme, aucun défaut bloquant ;
le soleil conserve volontairement une ambiance de fin de nuit/crépuscule synthétique.

## Enemy combat and patrol integration

Enemy shots check cover between body and muzzle. Enemies investigate player gunshots at their heard location, while melee and dry fire do not summon them. Each automatic patrol round has a 50% chance of a reachable doorway excursion and return. Wave totals follow 5, 8, 13, 21, 34, 55, 89, 144 and onward, with at most 36 concurrent enemies and validated spawn space. Visual targeting, body clearance and stuck recovery remain active. The current Node regression runner includes 22 suites. See [combat rules and regression coverage](architecture.md#enemy-combat-and-navigation).
