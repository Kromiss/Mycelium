# Changelog

Toutes les évolutions notables de **Mycelium : Last Colony** (version Godot).
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions en [semver](https://semver.org/lang/fr/).
L'historique de l'ancienne version web est dans la branche `archive/web`.

## [Unreleased]

### Ajouté
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
