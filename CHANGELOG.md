# Changelog

Toutes les évolutions notables de **Mycelium : Last Colony** (version Godot).
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions en [semver](https://semver.org/lang/fr/).
L'historique de l'ancienne version web est dans la branche `archive/web`.

## [Unreleased]

## [0.5.2] - 2026-10-05

Réglages du Sporophore et du panneau, avant l'arrivée des bâtiments.

### Modifié
- Le Sporophore ne bouge plus : plus de pas, plus de touche D, plus de mutation *Rapide*
  (14 mutations) ; les robots ne déplacent plus leur Tourelle.
- Portée de départ 2 (au lieu de 3), amélioration Portée limitée à 2 niveaux (portée 4 au plus).
- Cadence de départ 0,2 tir/s (un tir toutes les 5 s) et 5 dégâts par spore (au lieu de 1 tir/s
  et 10 dégâts). Les cadences s'affichent au centième.
- Panneau : « Mes mutations » tient sur une seule ligne d'icônes (palier sur l'icône, nom et effet
  dans l'info-bulle) ; les lignes d'améliorations sont plus compactes, pour en voir plus.
- Format d'enregistrement des rejeux : 3 (les rejeux plus anciens ne se relisent plus).

## [0.5.1] - 2026-10-05

Correctif — réactivité en partie.

### Modifié
- Les ordres du joueur (achat, priorité, cible, pas, capacité, mutation) prennent effet au clic,
  sans attendre la seconde suivante ; les boutons d'achat, de priorité et de capacité réagissent
  dès l'appui. Les rejeux gardent ces ordres à leur place (format d'enregistrement 2).
- Calcul d'un tick bien plus rapide, pour le même résultat (FFA : ~20 ms au lieu de ~35 ms en
  moyenne, ~60 ms au pire au lieu de ~155 ms ; Duel : ~5 ms au lieu de ~22 ms en comptant le HUD).

### Corrigé
- Le bouton d'achat était recréé à chaque seconde : un clic à cheval sur un tick pouvait être
  perdu. Les lignes d'améliorations, le classement et les mutations sont maintenant mis à jour
  sur place.
- Erreurs « triangulation failed » quand une case était presque entièrement entamée.

## [0.5.0] - 2026-10-05

G4 — Combattre des robots.

### Ajouté
- Duel contre un robot et FFA contre 5 robots : menu Jouer → Duel ou FFA → difficulté (Facile,
  Normal, Difficile, une pour tous les robots) → Lancer ; graine, secteur du joueur et couleurs
  des colonies tirés au hasard ; ni pause ni vitesse.
- Robot de jeu équilibré (dégâts, rendement et portée à parts égales, il déplace sa Tourelle) et
  ses trois difficultés dans `data/robots/` : Difficile agit chaque seconde sans erreur, Normal
  toutes les 2 s, Facile toutes les 3 s avec un achat sur 4 et sa mutation au hasard, sans Mur ni
  Nuage et sans viser la Tourelle adverse.
- Menu de partie contre les robots : Abandonner, avec confirmation. Éliminé, le joueur voit tout
  de suite la fin de partie.
- Fin de partie minimale : « Victoire ! » ou « Rang N sur M », cases prises, Sporophores
  abattus, durée de survie, pic de production ; Rejouer (nouvelle partie) et Menu.
- Bac à sable : le robot de jeu (Facile, Normal, Difficile) au choix sur chaque secteur libre.

### Modifié
- Feuille de route : G4 devient « Combattre des robots » ; les événements et la fin de partie
  complète passent en G5.
- Code : `SandboxConfig` devient `GameConfig` et l'écran de partie `game_screen.tscn` (Bac à
  sable, contre les robots, spectateur).

## [0.4.0] - 2026-10-05

G3 — Le Sporophore et l'affrontement.

### Ajouté
- G3, étape 1 — Simulation du Sporophore : une Tourelle par colonie qui tire toute seule
  (cadence, dégâts, portée, spores par tir), priorités de tir (Plus proche, Plus riche, Soigner
  d'abord, Ennemis d'abord), cible désignée au clic, cibles gardées jusqu'à leur prise ; PV des
  cases (zone, Cohésion, améliorations), régénération, soin ; prise des cases libres (pleine vie)
  et adverses (25 %), cases coupées de la Tourelle rendues libres ; déplacement pas à pas (10 s,
  sans tirer) ; 12 améliorations (coût ×1,15, achat ×1, ×10 ou Max) ; paliers avec lots
  d'Enzymes et choix de mutations empilés (15 mutations) ; capacités Salve, Mur de mycélium et
  Nuage toxique ; Armillaire ; protection de départ ; élimination et Trophée ; fin de partie
  (dernière colonie en vie ou 30:00) et classement. Six commandes, nouveaux refus, données
  `upgrades.tres`, `mutations.tres` et `abilities.tres` ; tests.
- Bac à sable : tous les nouveaux chiffres sont réglables et dans le récapitulatif.
- G3, étape 2 — Écran de partie des maquettes : carte à gauche (frise avec la protection,
  mini-classement, journal, rappel des gestes) et panneau à droite (ressources, Sporophore et
  priorité de tir, mutations prises, améliorations en onglets avec ×1 / ×10 / Max et effet
  avant → après, capacités avec anneau de recharge). Cartes de mutation sur la carte assombrie
  (touches 1 à 3), cachables avec un bouton œil. Sporophore dessiné en trois stades selon le
  palier ; états des cases des maquettes (entamée, visée, cible désignée, blessée, soignée, hors
  de portée). Mur et Nuage : touche ou bouton puis clic sur une case. Touches Q, W, E et 1 à 3
  modifiables. Réglages des mutations dans le Bac à sable.
- G3, étape 3 — Robots Canonnier (dégâts et cadence d'abord), Bâtisseur (rendement et défense
  d'abord) et Conquérant (portée et ennemis d'abord, seul à déplacer sa Tourelle, vers le centre) :
  mêmes règles et mêmes commandes qu'un joueur (améliorations, mutations, priorité de tir et de
  défense, Tourelle adverse désignée, capacités), profils dans `ai/profiles/`, aléatoire dérivé de
  la graine (parties rejouables à l'identique).
- Bac à sable : un robot au choix (Aucun, Canonnier, Bâtisseur, Conquérant) pour chaque secteur
  libre ; adversaires dans le récapitulatif.
- Panneau de simulations (éditeur seulement) : compositions de forêt (un robot par secteur)
  jouées N fois, lancement simple ou balayage d'un réglage, mesures de la partie (éliminations,
  première élimination, parties finies au temps) et de chaque secteur (victoires, rang,
  élimination, Trophées, cases, cases prises par minute, palier, production, zones et paliers
  atteints, niveaux d'amélioration), courbes par minute (production ou cases), export CSV, et
  partie regardée sur la carte en spectateur (×1 à ×64, pause).

### Modifié
- Partie : clic pour viser, D puis clic pour déplacer la Tourelle. La courbe de production
  n'est plus affichée pendant la partie (absente des maquettes).

- Tir des Tourelles un peu plus rapide à calculer (même résultat).

### Supprimé
- Colonisation au clic et file d'expansion, bâtiments et city builder, robots de G1 et G2 (les
  robots et le panneau de simulations sont recréés à l'étape 3).

## [0.3.0] - 2026-10-04

G2 — City builder.

### Ajouté
- G2, étape 1 — Simulation du city builder : Nœud de digestion, Grenier, Pépinière, Glande
  enzymatique et Mycorhize (`data/buildings/`) ; pose et démolition (commandes `BuildCommand` et
  `DemolishCommand`, codes de refus) ; file de construction de 5 places, 2 à 4 chantiers, durée
  selon le palier ; coût ×1,12 par bâtiment du même type ; remboursements 100 % (en file) et
  50 % (chantier ou construit) ; voisinage et Rosace ; Enzymes ; plafond de stock (3 min + 2 min
  par Grenier) ; Pépinière (pousse −30 %, +1 chantier) et Mycorhize (+1 pousse, 3 au plus) ;
  désactivation des bâtiments sous leur palier ; tests.
- Traductions des bâtiments et des nouveaux refus (EN et FR).
- G2, étape 2 — Bâtiments à l'écran : pictogrammes (spirale, jarre, pousse, goutte, racines) et
  leurs états sur la carte (en file avec numéro, chantier avec jauge, actif, désactivé gris avec
  cadenas) ; palette en bas de l'écran (touches 1 à 5 modifiables) avec fantôme et case barrée ;
  menu rond des bâtiments débloqués ; panneau d'un bâtiment avec Démolir ou Annuler ; portée de la
  Pépinière ; HUD : plafond du stock (barre qui passe en alerte), Enzymes, file de construction
  cliquable ; info-bulle des bâtiments ; tous les réglages des bâtiments dans le Bac à sable et le
  récapitulatif.

- G2, étape 3 — Robots du panneau de simulations : chacun combine un profil d'expansion, un
  profil de bâtisseur (Aucun, Producteur, Accélérateur, Hasardeux) et la part de la production
  consacrée à l'expansion (deux bourses) ; liste de robots gardée d'une session à l'autre ;
  balayage de la part d'expansion ; nouvelles mesures (premier bâtiment de chaque type, bâtiments
  à la fin, nutriments perdus au plafond, Enzymes produites, attente d'un chantier).

### Modifié
- Les 4 profils de robot de G1 suivent aussi la règle des bourses : une case n'entre dans la file
  d'expansion que si la bourse d'expansion la paie.
- City builder revu après essai : un bâtiment compte par sa présence, pas par son nombre. Places
  de bâtiment (2 au départ, +1 par palier) ; Nœud de digestion (+30 % de production des cases à
  2 cases ou moins) et Glande enzymatique (+1 Enzyme/min par case à 2 cases ou moins) agissent
  sur une zone, sans cumul ; plus de voisinage ni de Rosace ; coût en secondes de production
  (60, 45, 60, 90 et 90 s, au moins le coût en U) ; la Pépinière ne donne plus de chantier ;
  robots Producteur (une seule Glande) et Accélérateur (une Pépinière) revus.

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
