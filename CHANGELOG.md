# Changelog

Toutes les évolutions notables de **Mycelium : Last Colony** (version Godot).
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions en [semver](https://semver.org/lang/fr/).
L'historique de l'ancienne version web est dans la branche `archive/web`.

## [Unreleased]

### Ajouté
- G1, étape 1 — Simulation de l'économie (sans affichage) : état de partie en entiers, tick d'une
  seconde, commandes de colonisation (clic direct qui passe devant la file) et de file d'expansion
  (5 places, cases en chaîne, retrait en cascade), pousse selon la zone, réseau relié au Cœur,
  production avec richesse de zone et Cohésion, paliers de colonie (cases poussées), coût de
  colonisation `U × zone × 1,02^(cases − 3)`, départs sur les coins de la forêt.
- Calcul en virgule fixe, aléatoire à graine, empreinte de l'état ; enregistrement des commandes et
  rejeu à l'identique ; transport local et session (pause et vitesse réservées au Bac à sable).
- Données d'équilibrage `data/balance.tres` et `data/tiers.tres`, définitions modifiables par partie
  (`SimDefs`).
- G0 — Fondations : projet Godot 4.6.3 (rendu Compatibilité), dépôt dédié à la version Godot.
- Carte d'hexagones pointe en haut en 6 zones de même épaisseur : forêt de Duel (rayon 11, 397 cases)
  et de FFA (rayon 17, 919 cases), un seul terrain (Humus), rendu « Pastille ronde » en thème clair
  et sombre.
- Caméra : déplacement au clic droit maintenu et par les bords de l'écran, zoom à la molette centré
  sur la souris.
- Menu principal (Duel, FFA, Paramètres, Quitter ; entrées futures grisées) et écran Paramètres
  (thème clair, sombre ou système ; langue français ou anglais ; affichage et taille de fenêtre),
  enregistrés entre deux lancements.
- Traductions français et anglais, polices Fredoka et Nunito, icône provisoire.
- Tests GUT, formatage et style gdtoolkit, workflows CI, Build (version préliminaire avec
  `Mycelium.exe` à chaque fusion sur `main`) et Release.
