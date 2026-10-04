# Changelog

Toutes les évolutions notables de **Mycelium : Last Colony** (version Godot).
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions en [semver](https://semver.org/lang/fr/).
L'historique de l'ancienne version web est dans la branche `archive/web`.

## [Unreleased]

### Ajouté
- G2, étape 1 — Simulation du city builder : Nœud de digestion, Grenier, Pépinière, Glande
  enzymatique et Mycorhize (`data/buildings/`) ; pose et démolition (commandes `BuildCommand` et
  `DemolishCommand`, codes de refus) ; file de construction de 5 places, 2 à 4 chantiers, durée
  selon le palier ; coût ×1,12 par bâtiment du même type ; remboursements 100 % (en file) et
  50 % (chantier ou construit) ; voisinage et Rosace ; Enzymes ; plafond de stock (3 min + 2 min
  par Grenier) ; Pépinière (pousse −30 %, +1 chantier) et Mycorhize (+1 pousse, 3 au plus) ;
  désactivation des bâtiments sous leur palier ; tests.
- Traductions des bâtiments et des nouveaux refus (EN et FR).

## [0.2.0] - 2026-10-04

G1 — Solo économie.

### Ajouté
- G1, étape 3 — Robots d'économie (profils Hasardeux, Rentable, Rapide, Centre) qui gardent leur
  file d'expansion pleine.
- Panneau de simulations (seulement quand le jeu est lancé depuis l'éditeur, absent des exports) :
  réglages du Bac à sable, profils cochés, nombre de parties, durée simulée, lancement simple ou
  balayage d'une valeur ; parties en parallèle avec barre de progression ; tableau (moyenne,
  minimum, maximum, écart type) des minutes d'arrivée par zone et par palier, du remboursement des
  cases par tiers de partie, de ce qui freine et de l'état final ; courbes de production par
  minute ; export CSV ; rejeu d'une partie sur la carte (×1 à ×64, pause).
- G1, étape 2 — Bac à sable jouable : entrée du menu principal (Duel et FFA grisés jusqu'aux
  robots), écran de réglages (forêt, graine, économie, zones, paliers, valeurs par défaut), partie
  seul sur la forêt de Duel ou de FFA en Menthe, arrêt à 30:00 avec panneau de fin.
- Carte : cases de la colonie colorées, Cœur foncé qui saute aux paliers, onde continue vers le
  Cœur, cases colonisables marquées (teinte pâle si payables), numéros de la file, pousse avec
  jauge, info-bulle (zone, coût, pousse, production).
- Gestes : clic pour coloniser, Maj + clic pour la file (ou retirer), Maj + glisser pour tracer.
- HUD : nutriments qui défilent, production, Biomasse, courbe de production (log), barre du
  prochain palier, file, horloge, pause (P), vitesse ×1/×2/×4, récapitulatif copiable, messages,
  menu de partie (Échap).
- Paramètres : section Commandes (Espace, P, Échap, Maj modifiables).
- G1, étape 1 — Simulation de l'économie (sans affichage) : état de partie en entiers, tick d'une
  seconde, commandes de colonisation (clic direct qui passe devant la file) et de file d'expansion
  (5 places, cases en chaîne, retrait en cascade), pousse selon la zone, réseau relié au Cœur,
  production avec richesse de zone et Cohésion, paliers de colonie (cases poussées), coût de
  colonisation `U × zone × 1,02^(cases − 3)`, départs sur les coins de la forêt.
- Calcul en virgule fixe, aléatoire à graine, empreinte de l'état ; enregistrement des commandes et
  rejeu à l'identique ; transport local et session (pause et vitesse réservées au Bac à sable).
- Données d'équilibrage `data/balance.tres` et `data/tiers.tres`, définitions modifiables par partie
  (`SimDefs`).

## [0.1.0] - 2026-10-03

G0 — Fondations (publiée seulement en version préliminaire).

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
