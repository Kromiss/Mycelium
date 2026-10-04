# MYCÉLIUM : LAST COLONY — Document de conception, portage Godot (v0.2)

> City builder incrémental compétitif, en parties de **30 minutes maximum**. Chaque joueur incarne une colonie de champignons qui bâtit sa ville sur une carte d'hexagones et la regarde **exploser en quantité**. Le centre de la forêt est le plus riche et le plus disputé : **le but est d'être la dernière colonie vivante.** Trois façons de jouer : **Duel**, **FFA** (jusqu'à 6 colonies) et **Partie personnalisée**. Cible : un **projet Godot exporté en .exe (Windows), distribué sur Steam**.

Les valeurs chiffrées de ce document sont des **points de départ à simuler**, pas des décisions.

---

## 1. Pitch

- **Genre** : city builder incrémental compétitif en temps réel, type dernier survivant.
- **Fantasy** : tu es un réseau fongique. Tu bâtis une ville souterraine, tu la regardes **doubler, puis doubler encore**, et tu la défends contre des voisins dont tu vois les fronts avancer, en descendant vers un centre toujours plus riche et plus disputé.
- **Boucle courte (10 à 60 s)** : coloniser une case, poser un bâtiment, atteindre le prochain palier, ouvrir un front ou renforcer sa défense.
- **Boucle moyenne (3 à 5 min)** : changer de zone, bâtir le quartier suivant, rapprocher le Cœur du centre, choisir sa cible.
- **Boucle longue (30 min)** : survivre, éliminer, finir dernier vivant.

### Piliers de design
1. **L'espace est la ressource principale.** Prendre les bonnes cases, puis les rentabiliser.
2. **La colonie explose.** Chaque minute, le joueur doit sentir que ses chiffres et sa taille changent d'échelle.
3. **La ville est l'identité.** C'est le plan de ta ville (où, quoi, dans quel ordre) qui te distingue des autres.
4. **L'attaque se voit et laisse réagir.** Un choix stratégique visible par tous (où ouvrir un front, combien y investir), pas un simple clic ; le défenseur a le temps de répondre.
5. **Départ équitable, centre risqué.** Mêmes chances au départ ; plus on prend de risques, plus on peut gagner.
6. **Lisibilité** : on comprend en 5 secondes qui domine, qui est menacé et ce qui arrive ensuite.

---

## 2. Modes de jeu

### 2.1 Menu principal
**Jouer** (Duel, FFA), **Bac à sable** (§2.1 bis), **Partie personnalisée**, **Tutoriel**, **Profil**, **Paramètres**, **Quitter**.

### 2.1 bis Bac à sable *(décidé le 4 octobre 2026)*
- Entrée du menu principal, **visible par tous les joueurs**, **gardée après G4**. Mode distinct de la partie personnalisée : en Bac à sable, il n'y a **que le joueur et des robots** (robots à partir de G4) ; la partie personnalisée sert à jouer avec ses amis. Il sert notamment aux tests d'équilibrage du propriétaire.
- **Purement local** : le Bac à sable fonctionne **sans Steam ni GodotSteam** (décidé le 4 octobre 2026).
- **En G1** : il lance la partie d'économie ; le joueur est **seul** sur une forêt de **Duel ou de FFA, au choix**, avec la couleur **Menthe**. Duel et FFA restent grisés jusqu'aux robots (G4).
- **Pause et vitesse uniquement en Bac à sable** : pause par la touche **P** ou un bouton du HUD ; vitesse par un **bouton du HUD** qui passe de ×1 à ×2 puis ×4 (sans raccourci clavier).
- **Le plus paramétrable possible** : un écran de réglages avant de lancer, présent **dès G1** et enrichi à chaque jalon de ce qu'il apporte (bâtiments, combat, robots…). En G1 : forêt et graine, stock de départ, chiffres d'économie (U, rendement, durée de pousse, pousses simultanées, paliers…), multiplicateurs des zones, et **le plus de paramètres possibles**. Un bouton **remet les valeurs par défaut**.
- Les réglages **ne sont pas gardés** d'une partie à l'autre : chaque lancement repart des valeurs par défaut.
- **Récapitulatif à tout moment** : un bouton du HUD copie dans le presse-papiers un texte lisible avec les **réglages** de la partie et ses **résultats** (durée, cases, paliers et production atteints), pour les transmettre après un test. Préréglages nommés : plus tard.
- *Décidé le 4 octobre 2026 (G1, étape 2)* :
  - la partie **s'arrête à 30:00** : la carte reste visible et un **panneau de fin** montre les résultats avec trois boutons, **Copier le récapitulatif**, **Rejouer avec les mêmes réglages** et **Menu** ;
  - **Échap** met en pause et ouvre un **menu de partie** : Reprendre, Copier le récapitulatif, Recommencer (mêmes réglages), Quitter vers le menu ;
  - **pendant la pause, aucun ordre** : clics et file d'expansion sont refusés (message) jusqu'à la reprise ;
  - l'**horloge** affiche le temps écoulé sur le total (« 12:34 / 30:00 ») ;
  - la **courbe de production** couvre toute la partie, en **échelle logarithmique** ;
  - réglages proposés en G1 : forêt (Duel ou FFA) et graine ; U, rendement d'une case de zone 1, durée de pousse en zone 1, stock de départ (en U), hausse du coût par case, Cohésion par voisine, pousses simultanées, taille de la file ; richesse, coût et pousse de chaque zone ; seuil et multiplicateur de chaque palier. La durée (30 min) n'est pas réglable.
  - réglages ajoutés en G2 (décidé le 4 octobre 2026 : **tous**) : plafond du stock, maximum de pousses simultanées, chantiers au départ et au maximum, taille de la file de construction, hausse du coût par bâtiment du même type, remboursement à la démolition, durée d'un chantier selon le palier de déblocage ; et pour **chaque bâtiment** : coût (U et Enzymes), palier de déblocage, nombre maximal, bonus de rendement, Enzymes par minute, bonus de voisinage et son maximum, bonus de Rosace, minutes de plafond, réduction de la pousse, portée, chantiers et pousses en plus. La règle de pose n'est pas réglable (partout en G2). Le récapitulatif reprend ces réglages, les Enzymes, le plafond et les bâtiments construits.

### 2.2 Duel (1 contre 1)
- **Contre un robot** : disponible dès le départ. Choix de la difficulté (Facile, Normal, Difficile).
- **Contre un joueur** : **à long terme** (§15). D'abord par invitation d'un ami Steam, puis par file d'attente.
- **Forêt** : deux secteurs symétriques (symétrie centrale), rayon **11** (397 cases, ~198 par joueur).
- **Victoire** : éliminer l'adversaire. À 30:00, départage à la **production moyenne sur toute la partie** (§3.3).

### 2.3 FFA (jusqu'à 6 colonies sur la même forêt)
- **Contre des robots** : 1 joueur + 5 robots (difficulté au choix, ou mélange).
- **Entre joueurs** : jusqu'à 6 joueurs en ligne. La partie démarre à 6, ou après 2 min d'attente avec au moins 4 joueurs ; les places libres sont **complétées par des robots signalés comme tels**.
- **Forêt** : six secteurs identiques, rayon **17** (919 cases, ~153 par colonie).
- **Victoire** : dernier vivant ; à 30:00, départage à la **production moyenne sur toute la partie** (§3.3).

### 2.4 Partie personnalisée
Permet de créer **tout type de partie** : le type (Duel ou FFA, d'autres plus tard), les joueurs, les robots et les paramètres de la forêt.

**Salon**
- **Type de partie** : Duel, FFA.
- **Nombre de colonies** : **2** (Duel), **3 ou 6** (FFA). Seuls ces nombres donnent des départs strictement équitables (§4.1).
- **Emplacements** : chacun est **Humain** ou **Robot** (Facile / Normal / Difficile / profil). L'hôte choisit les couleurs.
- **Inviter des amis** : par la **liste d'amis Steam** (invitation Steam) ; un **code de salon** (6 caractères) sert de secours. Un invité absent peut être remplacé par un robot.
- **Préréglages** : enregistrer, charger, partager un réglage (fichier local ; code partageable plus tard).
- Une partie personnalisée **n'est pas classée**.

**Paramètres de la forêt** (valeurs par défaut du mode choisi, plages à valider)

| Paramètre | Défaut | Plage |
|---|---|---|
| Taille de la forêt (rayon) | 11 (Duel) / 17 (FFA) | 5, 11, 17 ou 23 (seuls rayons donnant 6 zones d'épaisseur égale ; à confirmer) |
| Graine | aléatoire | saisie libre |
| Richesse du centre par rapport au bord | ×4 | ×1 à ×8 |
| Difficulté vers le centre (coût, pousse, prise) | normale | faible, normale, forte |
| Vitesse de croissance (production) | ×1 | ×0,5 à ×3 |
| Ressources de départ | normales | peu, normales, beaucoup |
| Protection de départ | 2 min | 0 à 5 min |
| Événements | normaux | aucun, rares, normaux, fréquents ; choix de ceux autorisés |
| Butin d'élimination | 100 % | 0 à 200 % |
| Durée maximale | 30 min | 5 à **30 min** (plafond fixe) |

### 2.5 Robots
- Les robots jouent **avec les mêmes règles et les mêmes commandes que les joueurs** : pas de triche. La difficulté joue sur la vitesse de réaction, la qualité du plan de ville et l'usage des attaques.
- **Profils** : bâtisseur, expansionniste, agressif (pour varier les parties).
- Ils servent aussi à compléter les salons, à remplacer un joueur déconnecté (§11.2) et à équilibrer les valeurs par simulation (dès G1, robots d'économie du panneau de simulations, §14.5).

### 2.6 Règles communes
- **Modes locaux et modes en ligne isolés** *(décidé le 4 octobre 2026)* : tous les modes locaux, où il n'y a que le joueur et des robots (Bac à sable, Duel et FFA contre robots, tutoriel), fonctionnent **sans Steam ni GodotSteam**. Steam ne sert qu'aux modes multijoueur (Duel et FFA entre joueurs, partie personnalisée avec des amis). **Les parties locales ne comptent pas** : elles servent d'entraînement et n'alimentent ni les statistiques ni les succès Steam, et **ne donnent aucune récompense cosmétique**. Le **profil local** les enregistre quand même (statistiques et historique).
- **Durée maximale : 30:00**, tous modes, y compris personnalisés.
- **Pause et vitesse** : uniquement en Bac à sable (§2.1 bis), ni en Duel, ni en FFA, ni en partie personnalisée, y compris en spectateur.
- **Résultat** : rang de partie = ordre d'élimination ; statistiques de fin (cases conquises, éliminations, durée de survie, pic de production).

### 2.7 Tutoriel
Une **courte partie scénarisée (~10 min)** contre un robot passif, sur une petite forêt de Duel. **Proposé au premier lancement**, passable, et rejouable depuis le menu. Chaque étape affiche un objectif et ne passe à la suite que lorsqu'il est atteint :

| Étape | Objectif | Ce qu'on apprend |
|---|---|---|
| 1 | Coloniser 2 cases | Expansion, pousse, coût |
| 2 | Former un bloc de cases voisines | Cohésion |
| 3 | Construire un Nœud de digestion | Bâtiments, chantiers |
| 4 | Atteindre 5 puis 10 cases | Paliers de colonie, production qui double |
| 5 | Construire le Sclérote | Seconde vie du Cœur |
| 6 | Ouvrir un front sur le robot et prendre des cases | Attaque (fronts) |
| 7 | Renforcer un front ouvert par le robot | Défense |
| 8 | Prendre le Cœur du robot | Élimination et butin |

Le robot ne fait qu'attaquer sur commande du script (étape 7) ; le reste du temps, il ne joue pas.

---

## 3. Déroulé d'une partie

### 3.1 Départ
- Chaque colonie démarre avec **3 cases, Cœur compris** *(décidé le 4 octobre 2026)* : le Cœur sur un **coin de la forêt** (le milieu exact de son secteur, zone 1), la case collée à lui **vers le centre**, et une case collée à lui **sur le bord** (au-dessus du Cœur pour le coin de droite). Les départs des autres colonies s'en déduisent par rotation, donc tous identiques ; en Duel, coin gauche contre coin droit.
- **Stock de départ : 6 U** (180 nutriments), de quoi poser ses premières cases et un bâtiment.
- **Protection de départ : aucune attaque avant 2:00.**

### 3.2 Frise de la partie
La partie est rythmée par des **événements**. Certains sont **scriptés** (même heure à chaque partie), d'autres **aléatoires** (tirés de la graine, §10).

| Temps | Événement |
|---|---|
| 2:00 | Fin de la protection de départ |
| 8:00 | **Floraison collective** |
| 12:00 | **Arbre mourant** (n° 1) |
| 16:00 | **Floraison collective** |
| 20:00 | **Arbre mourant** (n° 2) |
| 24:00 | **Floraison collective** |
| 26:00 | **Mort subite** : les prises vont 3× plus vite |
| 30:00 | Fin de la partie |

Entre ces rendez-vous, **un événement aléatoire toutes les 2 min environ** à partir de 3:00.

### 3.3 Victoire et élimination
- **Éliminé** : on perd son **Cœur** et on n'a pas de Sclérote pour le recueillir (§9.5). **Toutes ses cases et tous ses bâtiments passent à la colonie qui l'a éliminée** (§9.6).
- **Gagnant** : la dernière colonie en vie. Si deux colonies tombent en même temps, la dernière à avoir perdu son Cœur gagne.
- **Mort subite (26:00)** : les prises sont 3× plus rapides, pour trancher avant la limite de 30 min.
- **Fin à 30:00** : les colonies encore en vie sont classées par **production moyenne sur toute la partie**, c'est-à-dire le total des nutriments produits par leurs cases divisé par 30 min. Le butin et les récompenses d'événements ne comptent pas : seule la production compte. En cas d'égalité, le nombre de cases départage. Cette moyenne est affichée en direct dans le mini-classement.

---

## 4. La carte

### 4.1 Structure
- Grille d'hexagones **pointe en haut** (coordonnées axiales `q, r`), générée à partir d'une **graine de partie** (publiée à la fin).
- **Secteurs identiques** (comme une pizza), un par colonie : personne n'a un meilleur départ. Une forêt hexagonale n'est parfaitement symétrique qu'à **2, 3 ou 6 colonies** : ce sont les seuls nombres proposés, dans tous les modes.
- **Pas de brouillard** : toute la forêt est visible.

| Mode | Rayon | Cases | Cases par colonie |
|---|---|---|---|
| Duel | 11 | 397 | ~198 |
| FFA 6 | 17 | 919 | ~153 |

### 4.2 Un seul terrain : l'Humus
Pour le moment, **toutes les cases sont de l'Humus**. Elles ne diffèrent que par leur **zone** (richesse, coût, temps de pousse, temps de prise). Une case peut être dans un des **états** suivants : libre, possédée, en pousse, en construction, en cours de prise.
D'autres terrains pourront être ajoutés plus tard.

### 4.3 Les 6 zones et la difficulté vers le centre
Six anneaux concentriques de **même épaisseur** : **2 anneaux d'hexagones par zone en Duel, 3 en FFA** (d'où les rayons 11 et 17). La zone 6 contient la case centrale. Plus on va vers le centre, **plus la case est riche, mais plus elle est difficile à prendre**.

| Zone | Richesse | Coût de colonisation | Temps de pousse | Temps de prise adverse |
|---|---|---|---|---|
| 1 (bord) | ×1,0 | ×1,0 | ×1,0 | ×1,0 |
| 2 | ×1,5 | ×1,4 | ×1,2 | ×1,2 |
| 3 | ×2,0 | ×2,0 | ×1,5 | ×1,5 |
| 4 | ×2,6 | ×2,8 | ×1,9 | ×1,8 |
| 5 | ×3,3 | ×3,8 | ×2,4 | ×2,1 |
| 6 (Clairière) | ×4,0 | ×5,0 | ×3,0 | ×2,5 |

Cible : une colonie moyenne atteint la zone N vers la minute 3,5 × N. La limitation vient **des ressources**, pas d'un verrou.

### 4.4 Règles d'expansion
- On ne colonise qu'une case **adjacente** à son réseau. Une case **en pousse ne fait pas encore partie du réseau** : on ne peut pas coloniser sa voisine avant la fin de la pousse.
- Coût = `base × (1 + 0,05 × distance_au_cœur) × difficulté_zone × 1,02 ^ (nb_cases − 3)` (à simuler), avec `base` = **U = 30** nutriments. `nb_cases` ne compte que les **cases poussées** (pas les cases en pousse) ; on retire les **3 cases de départ** pour que la première case de zone 1 coûte exactement U (décidé le 4 octobre 2026). Le terme `0,05 × distance_au_cœur` est **à décider plus tard** (absent en G1, à trancher avec la migration du Cœur) ; s'il est gardé, la distance se mesure **par le réseau** (plus court chemin à travers ses propres cases).
- La colonisation n'est pas instantanée : les hyphes **poussent** (~4 s en zone 1), ce qui laisse une fenêtre de réaction. Les durées sont en **secondes entières** (1 tick par seconde) : 4 s en zone 1, **arrondies au plus proche** dans les autres zones (4 × 1,2 = 4,8 → 5 s).
- **Pousses simultanées** : **une seule** au départ ; chaque **Mycorhize** (§7.2) en ajoute une, **3 au plus**.
- **File d'expansion** : jusqu'à **5 cases, pousse en cours comprise** (1 en pousse + 4 en attente). Elles poussent **dans l'ordre où elles ont été ajoutées**. Le coût est payé **au démarrage de la pousse**, au prix du moment : une case attend en file d'avoir les nutriments.
  - **En chaîne** : une case collée seulement à une case déjà en file peut y entrer ; elle attend que la précédente ait poussé.
  - **Retirer** une case de la file la retire **avec toutes les cases qui en dépendent** en chaîne. Une pousse lancée va à son terme.
  - **Clic direct et file** *(décidé le 4 octobre 2026)* : un clic direct sur une case payable, quand une place de pousse est libre, **passe devant** une file qui attend (la file continue d'attendre derrière). Il compte dans les 5 places de la file ; un clic sur une case déjà en file la lance et la retire de la file.
- **Cohésion** : chaque case compte ses voisines possédées (0 à 6), **cases poussées seulement**. Production **+5 % par voisine** (max +30 %) ; en défense, temps de prise **+15 % par voisine**. Une **Rosace** (6 voisines) ne peut pas être visée par une Coupure.

### 4.5 Le réseau
- Les nutriments remontent vers le **Cœur**. **Pas de perte de transport** (la perte de 1 % par saut et le Rhizomorphe ont été retirés le 4 octobre 2026).
- Une **Coupure** (§9.4) isole une portion du réseau : les cases coupées ne produisent plus (sans dépérir) tant que dure la Coupure.

---

## 5. Ressources

| Ressource | Rôle | Source |
|---|---|---|
| **Nutriments** | Monnaie de base : colonisation, bâtiments, fronts | Toutes les cases |
| **Enzymes** | Bâtiments avancés et actions actives | Glande enzymatique, événements |
| **Biomasse** | Total des nutriments produits : sert au départage à 30:00 (production moyenne = biomasse ÷ durée) et aux statistiques | Conversion des nutriments produits |

- **2 ressources visibles au début** (Nutriments, Biomasse) ; les Enzymes apparaissent avec la première Glande enzymatique. **L'Humidité a été retirée** le 4 octobre 2026 (avec le Réservoir), pour garder le jeu simple et centré sur l'incrémental.
- Les **Enzymes n'ont pas de plafond** de stock.
- **Stock plafonné** : **3 min de production** (+2 min par Grenier). Ce qui dépasse est perdu : on dépense en continu. *Pas de plafond en G1 : il arrive en G2 avec le Grenier.*
- La Biomasse ne se dépense pas et ne débloque rien.

---

## 6. Croissance incrémentale

Le joueur doit sentir que sa colonie **explose**. Rien ne s'achète pour grandir : cela passe par cinq mécanismes automatiques.

### 6.1 Paliers de colonie
Quand le **nombre de cases** franchit un seuil, **la production de la colonie double** :

| Palier | Cases | Production | Débloque |
|---|---|---|---|
| Départ | 3 | ×1 | Nœud de digestion |
| 1 | 5 | ×2 | Grenier, Pépinière |
| 2 | 10 | ×4 | Glande enzymatique, Sclérote |
| 3 | 20 | ×8 | Mycorhize, Écorce, Toxinière |
| 4 | 40 | ×16 | Poste d'assaut, Haustorium |
| 5 | 80 | ×32 | Carpophore |
| 6 | 160 | ×64 | (le prestige du conquérant) |

- Seules les **cases poussées** comptent, Cœur compris : une case en pousse ne compte qu'à la fin de sa pousse (décidé le 4 octobre 2026).
- Le multiplicateur et les déblocages suivent le **nombre de cases actuel** : perdre des cases peut faire perdre un palier, ce qui rend la défense tendue. Les bâtiments liés au palier perdu ne sont **pas détruits, ils sont désactivés** (§7.6), et reprennent du service dès que le palier est de nouveau atteint.
- Rien ne s'achète : on grandit et le palier tombe tout seul.

### 6.2 Multiplicateurs qui se cumulent
Richesse de zone (jusqu'à ×4), Cohésion (jusqu'à +30 %), bâtiments et voisinage (§7.3), souche (jusqu'à +25 %), événements (Floraison, Orage). Ils **se multiplient entre eux** au lieu de s'additionner.

### 6.3 Boucle de réinvestissement
Une case neuve doit se rembourser vite : cible **~10 s au début** (décidé le 4 octobre 2026, au lieu de ~20 s), **moins de 60 s en fin de partie** malgré des coûts plus élevés. Chaque palier relance la boucle (nouvelles cases rentables, nouveaux bâtiments).

Valeurs de départ (à simuler) : une case d'Humus de zone 1 rapporte **≈ 3,33 nutriments/s** (10/s pour la colonie de départ de 3 cases) ; le **Cœur produit comme une case normale** ; **U = 30** nutriments (≈ 9 s de production d'une case).

### 6.4 Ordre de grandeur
Cible : **~10 nutriments/s pour la colonie au départ → 1e5 à 1e6 nutriments/s en fin de partie**, soit un facteur de 10 000 à 100 000 en 30 min (à simuler). Les nombres s'écrivent avec des suffixes (K, M, B, T).

### 6.5 Retour visuel (le « boum »)
- **La colonie vit dans son entièreté** : une **onde continue** parcourt la colonie de ses bords **vers le Cœur**, comme les nutriments qui remontent. À chaque palier, elle devient **plus fréquente et plus intense**.
- Au franchissement d'un **palier** : message « Palier ×2 ! » et le **Cœur qui saute** un instant. Les particules et le son viendront avec l'audio (G5).
- Les **compteurs défilent** (nutriments qui montent à vue d'œil) et une **courbe de production** reste affichée dans le HUD.
- La tache de la colonie **grossit de façon visible** ; la Floraison collective fait « éclore » tout le réseau.

---

## 7. Le city builder

Chaque case possédée peut accueillir **un bâtiment**, posé, déplacé ou démoli par le joueur. Pas de niveaux : on construit, on place, on combine.

### 7.1 Principes
1. **Un bâtiment par case**, sur une case possédée (pas en cours de pousse).
2. **Construction non instantanée** : **3 à 20 s**, selon le palier de déblocage du bâtiment (départ 3 s, palier 1 : 5 s, palier 2 : 8 s, palier 3 : 11 s, palier 4 : 15 s, palier 5 : 20 s). **Chantiers simultanés limités** : 2 au départ, +1 par Pépinière, **4 au plus**.
3. **Règles de pose** : certains bâtiments exigent une case frontière ou un voisinage précis.
4. **Voisinage** : des bâtiments adjacents se renforcent (§7.3).
5. **Coût croissant** : `base × 1,12 ^ nb_du_même_type`, où l'on compte les bâtiments **terminés, en chantier et en file** de ce type (démolir fait donc baisser le prix suivant).
6. **Démolir** est **instantané** et rembourse **50 % du prix payé** ; **déplacer** = démolir + reposer (pas de geste dédié).
7. **Le Cœur est un bâtiment** : il occupe sa case (aucun autre bâtiment ne s'y pose) et n'apporte aucun bonus ; sa case produit comme les autres. S'il tombe sans Sclérote, la colonie est éliminée.
8. **Capture** : le bâtiment passe à l'attaquant avec la case (§7.6). L'Incendie et le Sanglier, eux, détruisent tout.
9. **File de construction**, distincte de la file d'expansion : **5 places, chantiers en cours compris**. **Toute pose entre dans la file** et démarre dès qu'un chantier se libère, dans l'ordre d'ajout. Le coût est payé **à la mise en file**. Annuler un bâtiment **en file** le rembourse à **100 %** ; annuler un **chantier** lancé le rembourse à **50 %**. Un bâtiment en file dont le palier de déblocage n'est plus atteint **attend dans la file** (il garde sa place) **sans bloquer les suivants**, et démarre quand la colonie retrouve le palier *(décidé le 4 octobre 2026)*.

Les coûts sont en multiples de **U**, le coût de colonisation d'une case de zone 1 au départ.

### 7.2 Catalogue
Les déblocages suivent les **paliers de colonie** (§6.1). Un bâtiment dont le palier n'est plus atteint est **désactivé**, pas détruit (§7.6).

**En G2** : Nœud de digestion, Grenier, Pépinière, Glande enzymatique et Mycorhize. Les bâtiments liés au combat (Sclérote, Écorce, Toxinière, Poste d'assaut, Haustorium, Carpophore) arrivent **tous en G3**.

| Bâtiment | Débloqué | Coût | Règle de pose | Effet |
|---|---|---|---|---|
| **Nœud de digestion** | Départ | 2 U | Partout | +50 % de rendement de la case |
| **Grenier** | Palier 1 | 3 U | Partout | +2 min de plafond de stock |
| **Pépinière** | Palier 1 | 4 U | Partout | Pousse −30 % dans un rayon de 3 (plusieurs Pépinières ne se cumulent pas ; la vitesse d'une pousse est **recalculée à chaque seconde** : une Pépinière qui apparaît ou disparaît en cours de pousse change tout de suite sa vitesse, décidé le 4 octobre 2026) ; +1 chantier simultané (4 au plus) |
| **Glande enzymatique** | Palier 2 | 5 U | Partout | +20 Enzymes/min |
| **Sclérote** | Palier 2 | 15 U + 50 Enzymes | Case non frontière, **1 seul** | Recueille le Cœur s'il tombe (§9.5) |
| **Mycorhize** | Palier 3 | 6 U | Partout | +1 pousse simultanée (3 au plus en tout) |
| **Écorce** | Palier 3 | 4 U + 10 Enzymes | Partout | Temps de prise ×2 sur sa case, +20 % sur ses voisines |
| **Toxinière** | Palier 3 | 6 U + 20 Enzymes | Case frontière | Ralentit les fronts ennemis sur ses voisines (effet à adapter aux fronts en G3) ; **débloque Toxine** |
| **Poste d'assaut** | Palier 4 | 8 U + 40 Enzymes | Case frontière | +1 front simultané (à confirmer en G3) ; **débloque Assaut et Coupure** |
| **Haustorium** | Palier 4 | 8 U + 30 Enzymes | Case frontière | **Débloque Siphon** |
| **Carpophore** | Palier 5 | 10 U | Partout | Portée des actions +2 ; montre l'état des Cœurs ennemis ; **visible et ciblé par tous** |

### 7.3 Voisinage (synergies)
- **Nœud de digestion** : +10 % par Nœud adjacent (max +30 %). Le Nœud ne se renforce **qu'avec d'autres Nœuds** : l'ancien bonus au contact d'un Réservoir n'est pas remplacé *(décidé le 4 octobre 2026)*.
- **Glande enzymatique** : +10 % par Glande adjacente (max +30 %).
- Ces bonus **se multiplient** avec l'effet du bâtiment : un Nœud entouré de 3 Nœuds donne ×1,5 × 1,3 = ×1,95.
- **Écorce** : +10 % de temps de prise par Écorce voisine (un mur).
- **Rosace** : une case entourée de ses 6 voisines possédées compte **+10 %** sur l'effet de son bâtiment, **pour les bâtiments qui produisent** (Nœud de digestion, Glande enzymatique). Ce ×1,1 **multiplie tout l'effet**, voisinage compris : un Nœud en Rosace entouré de 3 Nœuds donne ×1,5 × 1,3 × 1,1 *(décidé le 4 octobre 2026)*.
- Seuls les bâtiments **actifs** (construits et palier atteint) comptent comme voisins.
- Un **quartier compact** est fort mais plus facile à raser d'un coup (Incendie, Sanglier, attaque) : choisir sa densité est une décision.

### 7.4 Poser et démolir *(décidé le 4 octobre 2026, jalon G2)*
- **Poser** : on choisit un bâtiment dans la **palette** puis on clique sur les cases (Échap ou un clic droit court quitte ce mode) ; ou on **clique sur une case possédée** : un **menu rond** propose les bâtiments possibles.
- Chaque pose entre dans la file de construction (§7.1).
- **Démolir** : un bouton « Démolir » sur la case sélectionnée.
- **Case frontière** (règle de pose) : une case qui **touche au moins une case non possédée** (libre ou ennemie). Ce que devient un bâtiment de frontière dont la case cesse d'être au bord se tranche en G3.
- *L'équilibre d'humidité a été retiré le 4 octobre 2026.*
- *Décidé le 4 octobre 2026 (G2, étape 2)* :
  - **palette** en barre en bas de l'écran : un bouton par bâtiment avec son coût (en couleur d'alerte s'il est trop cher), un cadenas s'il n'est pas débloqué (info-bulle : effets, « palier N requis, X cases ») et sa touche ; touches **1 à 5**, modifiables dans les Paramètres ; choisir un bâtiment non débloqué est refusé (message) ; rechoisir le bâtiment choisi quitte le mode palette ;
  - en **mode palette**, la case survolée montre le **fantôme** du bâtiment et son coût si la pose est possible, sinon elle est **barrée** et l'info-bulle donne la raison ; chaque clic pose le bâtiment ; Échap ou un clic droit court quitte le mode ;
  - le **menu rond** d'une case libre de la colonie ne propose que les bâtiments **débloqués** ; ceux trop chers sont grisés ;
  - un clic sur une case qui a un bâtiment ouvre le **panneau du bâtiment** (nom, état, effet, bouton **Démolir** avec le montant rendu, ou **Annuler** s'il est en file ou en chantier) ; un clic ailleurs sur la carte ou Échap ferme le menu rond et le panneau ; un clic sur le Cœur n'ouvre rien ;
  - la **portée de la Pépinière** (rayon 3) est montrée quand on la place et au survol d'une Pépinière posée.

### 7.5 Le Cœur
- Unique, non démolissable. Il collecte les nutriments ; le réseau se mesure à partir de lui.
- **Migration** : on peut le déplacer vers une case adjacente à son réseau (30 s d'immobilisation, recharge 3 min). Utile pour rapprocher le Cœur du centre ou l'éloigner d'un front. *Reportée après G1.*
- Se prend **4× plus lentement** qu'une case normale.

### 7.6 Désactivation et capture

**Désactivation (perte de palier).** Chaque bâtiment est lié à son palier de déblocage (§7.2). Si le nombre de cases de la colonie repasse **sous** ce seuil, le bâtiment **n'est pas détruit : il est désactivé**. Il reste sur sa case, mais :
- il n'a **aucun effet** : ni production, ni synergie de voisinage (§7.3), ni bonus de Rosace, ni action débloquée, ni front ou chantier supplémentaire ;
- on ne peut plus en construire de nouveaux du même type, mais on peut le démolir (remboursement 50 %) ;
- il se **réactive tout seul** dès que la colonie repasse au-dessus du seuil.

Les effets déjà lancés (action en recharge, front ou chantier en cours) vont à leur terme. Les bâtiments de départ (Nœud de digestion) ne se désactivent jamais. Un **Sclérote désactivé ne peut pas recueillir le Cœur** : tomber sous le palier 2 juste avant de perdre son Cœur est fatal.

**Capture.** Quand une case est prise, **son bâtiment passe à l'attaquant avec la case**, intact et à la couleur du capteur :
- il est **actif** si le capteur a atteint le palier qui le débloque ;
- sinon il reste **désactivé** jusqu'à ce que le capteur l'atteigne : un conquérant qui grossit récupère donc tout ce qu'il a pris ;
- un **Sclérote** capturé devient celui du capteur s'il n'en a pas, sinon il est détruit (la victime perd dans les deux cas sa seconde vie) ;
- un bâtiment **en construction** au moment de la prise est annulé, son coût est perdu.

**Élimination.** Les bâtiments d'une colonie éliminée ne sont pas détruits : ils passent au tueur avec les cases (§9.6), actifs ou désactivés selon son palier, comme pour une capture.

**Destruction.** Seuls l'Incendie et le Sanglier détruisent des bâtiments.

---

## 8. Souche unique

Pour le moment, **une seule souche**, sans écran de choix : l'**Armillaire**. Elle grossit sur la durée : **production ×1,00 au départ → ×1,25 à 30:00** (croissance linéaire). *Arrive en G3, avec la fin de partie à 30:00.*
D'autres souches pourront être ajoutées plus tard ; l'écran de choix arrivera avec la deuxième.

---

## 9. Conflit

Il n'y a **aucune pression automatique** au contact. On prend des cases en **ouvrant un front** : une décision stratégique, visible de tous, qui laisse au défenseur le temps de réagir. *(Décidé le 4 octobre 2026 : les fronts remplacent le Filament d'assaut, la Frappe parfaite et « trancher ».)*

### 9.1 L'attaque : ouvrir un front
- **Tracer un tronçon** : l'attaquant trace, le long de sa frontière avec une colonie voisine, un **tronçon** de cases ennemies collées à son réseau. Plus le tronçon est large, plus l'investissement est dilué.
- **Investir** : il y consacre un **débit de nutriments par seconde**, modifiable à tout moment et consommé en continu.
- **Avancée** : toutes les cases du tronçon progressent **ensemble**, l'investissement étant réparti entre elles. Le front avance si l'attaque dépasse la **résistance + le renfort** du défenseur, d'autant plus vite que l'**écart** est grand ; sinon il est bloqué.
- **Fin** : quand les cases du tronçon sont prises, le front **s'arrête** ; pour aller plus loin, on trace un nouveau front. L'attaquant peut aussi arrêter son front à tout moment.
- **Nombre** : **1 front à la fois** au départ, **+1 par bâtiment** (lequel, et jusqu'où : à préciser en G3).
- **Visibilité** : le tronçon et sa jauge de pression (attaque contre défense) sont visibles de toute la forêt.

### 9.2 La défense
- **Alerte** dès qu'un front s'ouvre sur son territoire.
- **Résistance** : chaque case résiste seule, selon sa zone, sa Cohésion, l'Écorce et le Cœur (×4).
- **Renfort** : le défenseur peut mettre sur le front attaqué un **débit de nutriments par seconde**, qui s'ajoute à la résistance.
- **Il bloque seulement** : un défenseur plus fort arrête le front mais ne le repousse pas chez l'attaquant ; pour reprendre du terrain, il ouvre son propre front.
- **Défense passive** : Cohésion, Écorce, Toxinière (effets à adapter aux fronts en G3).

### 9.3 Cibles
- On n'attaque que des cases **collées à son réseau**.
- Pas d'attaque avant **2:00** (protection de départ).
- Le **Cœur** se prend 4× plus lentement.

### 9.4 Actions actives
Elles coûtent des Enzymes, rechargent et **exigent le bâtiment correspondant**. Chacune a **son propre geste**. *Toutes sont à revoir en G3 pour les adapter aux fronts : les gestes et effets ci-dessous datent du Filament d'assaut.*

| Action | Bâtiment | Geste | Coût | Recharge | Effet |
|---|---|---|---|---|---|
| **Assaut** | Poste d'assaut | Maintenir sur un front puis relâcher (charge d'un anneau) | 30 Enzymes | 90 s | Prise 4× plus rapide pendant 20 s |
| **Toxine** | Toxinière | « Arroser » : peindre la zone visée d'un trait | 20 Enzymes | 2 min | La case et ses voisines : production −50 % pendant 60 s |
| **Coupure** | Poste d'assaut | **Trancher** un lien du réseau ennemi d'un balayage | 40 Enzymes | 3 min | La case ne fait plus passer les nutriments pendant 45 s (ni Cœur, ni Rosace) |
| **Siphon** | Haustorium | Tirer un tuyau d'une case ennemie vers une des siennes | 25 Enzymes | 90 s | Vole 20 % de la production des cases à ≤ 2 pendant 60 s |

### 9.5 Cœur, Sclérote, élimination
- Le Cœur perdu **renaît sur le Sclérote** (60 s de protection), **une seule fois** : le Sclérote est consommé.
- Sans Sclérote en vie, la perte du Cœur **élimine la colonie**. Un Sclérote désactivé ou capturé ne compte pas (§7.6).

### 9.6 Butin d'élimination
La colonie qui **élimine** une autre en tire un gain :
- **50 % du stock de nutriments** de la victime, plus **2 min de sa production** au moment de sa chute ;
- **+100 Enzymes** ;
- **Frénésie** : production +25 % pendant 2 min ;
- un **Trophée** (statistiques et récompenses de profil) ;
- **tout son territoire** : toutes les cases restantes de la victime et leurs bâtiments passent au tueur (bâtiments actifs ou désactivés selon son palier, §7.6). Les cases qui ne touchent pas son réseau forment des **îlots** : elles comptent pour les paliers mais ne produisent rien tant qu'il ne les a pas reliées à son réseau.

La colonie qui **prend le Cœur** est celle qui élimine. Si la victime **renaît sur son Sclérote**, le capteur reçoit **la moitié du butin en ressources** (sans Frénésie ni territoire).

### 9.7 Protections
- **Protection de départ** de 2 min (réglable).
- Pas de plancher de cases ni de protection contre un joueur plus petit : on peut éliminer, c'est le but.

---

## 10. Événements

Ils rythment la partie. Annoncés **20 s avant** (les scriptés figurent sur la frise). Un événement ne prend jamais plus de **10 %** des cases d'une colonie, ni son Cœur ou son Sclérote. Chacun peut être activé ou non dans une partie personnalisée.

- **Floraison collective** (scripté : 8:00, 16:00, 24:00) : production **×2 pendant 30 s** pour toutes les colonies. Un pic d'explosion, visible dans les nombres.
- **Arbre mourant** (scripté : 12:00 et 20:00) : 7 cases dans la zone du moment, digérées par la production des colonies qui les touchent ; récompense en nutriments (≈ 2 min de production moyenne) et 100 Enzymes **au prorata** de la contribution, bonus au meilleur.
- **Orage** : production +50 % dans un rayon de 3 pendant 60 s.
- **Incendie** : une zone de rayon 2 est libérée, puis les **Cendres** donnent une production ×2 pendant 2 min.
- **Sanglier** : une ligne de 5 cases est arrachée et redevient libre.
- **Festin** : une case très riche apparaît pendant 90 s dans la zone la plus peuplée ; la première colonie qui la fait pousser la récupère.
- **Nématodes** : une case mangée toutes les 10 s à la lisière d'une colonie ; les cases voisines les digèrent en 30 s (plus vite avec la Cohésion), ce qui rapporte de la biomasse.

**Zone du moment** : pour les événements « du centre », c'est la zone où se trouve la majorité des colonies.

---

## 11. Social, déconnexion, récompenses

### 11.1 Chat
Chat de partie (en ligne) ; amis et messages privés via Steam ; sourdine et signalement, modération minimale.

### 11.2 Déconnexion et abandon
- **Un joueur se déconnecte** : **pilote automatique** (la colonie continue de coloniser, de construire et de se défendre, sans attaquer), reprise possible à tout moment ; après 3 min sans retour, un robot en prend le contrôle.
- **L'hôte se déconnecte** (§14.2) : dans la première version, **la partie s'arrête** pour tout le monde ; elle n'est pas comptée dans les statistiques des autres joueurs, et l'hôte qui quitte volontairement prend une défaite. La **migration d'hôte** (un autre joueur reprend la partie, l'état ne faisant que quelques centaines de cases) est prévue plus tard.

### 11.3 Pactes (idée pour plus tard)
Les pactes de non-agression pourraient être étudiés **après** la version en ligne, avec dissolution automatique avant la fin pour qu'il n'y ait qu'un vainqueur.

### 11.4 Spectateur et replay
Un éliminé peut **suivre n'importe quelle colonie** ; la partie est enregistrée (graine et commandes) et se rejoue en **timelapse**.

### 11.5 Récompenses
Cosmétiques gagnés en jouant (titres, couleurs de réseau, effets de particules), historique des parties, statistiques par mode (victoires, éliminations, durée de survie). **Aucune boutique** en jeu ; le modèle économique sur Steam (gratuit ou payant) **n'est pas encore décidé**. Trophées et paliers peuvent devenir des **succès Steam**. Un classement compétitif est à étudier pour le Duel en ligne (classements Steam).

---

## 12. Formules de base (à équilibrer)

```
production_case    = rendement × richesse_zone × (1 + bonus_bâtiment) × (1 + voisinage)
                     × (1 + 0,05 × voisines) × modif_événement
production_totale  = Σ production_case (cases reliées au Cœur)
                     × 2 ^ paliers_atteints × bonus_souche(t)
paliers_atteints   = nombre de seuils (5, 10, 20, 40, 80, 160 cases) ≤ nb_cases (cases poussées)
bonus_souche(t)    = 1,00 + 0,25 × t / 30 min
coût_colonisation  = base × (1 + 0,05 × dist_cœur) × difficulté_zone × 1,02 ^ (nb_cases − 3)
                     (base = U = 30 ; terme dist_cœur à décider, absent en G1 ; nb_cases = cases poussées)
coût_bâtiment      = base_bâtiment × 1,12 ^ nb_du_même_type   (terminés, en chantier et en file)
durée_chantier     = 3 / 5 / 8 / 11 / 15 / 20 s selon le palier de déblocage (départ → palier 5)
stock_max          = production_totale × (3 min + 2 min × nb_greniers)
résistance_case    = base_résistance × prise_zone × (1 + 0,15 × voisines_défenseur) × facteur_écorce × facteur_cœur
vitesse_front      = f(débit_attaque ÷ nb_cases_tronçon − (résistance_case + renfort))   (bloqué si ≤ 0)
```

Valeurs de la résistance et de la vitesse d'avancée des fronts : à définir en G3 ; Cœur ×4 ; Mort subite : fronts 3× plus rapides.

---

## 13. Interface et direction artistique

### 13.1 Écrans
Menu principal, **mode Duel**, **mode FFA**, **salon de partie personnalisée**, **partie** (carte + HUD), spectateur, résultats, profil, **paramètres**, et l'**interface d'administration** cachée (§14.4).

### 13.2 Direction artistique « Pastille ronde »
- **Thème clair** : fond crème `#FBF6EE`, cartes `#FFFDF8`, texte prune `#3B3340`, texte secondaire `#6E6475`, filets `#EADFD0`. Polices **Fredoka** (titres) et **Nunito** (texte).
- **Un seul terrain** : l'Humus, une bulle ronde. En thème clair, chaque bulle prend la couleur du fond de sa zone assombrie de 12 % (contraste identique dans toutes les zones) ; en thème sombre, `#6F5E50`. Zones teintées de `#F6EEE2` (bord) à `#E0C7AE` (centre), chacune entourée d'un trait noir net `#2B2430`, estompé sur les colonies.
- **12 couleurs de colonie** (Lavande, Corail, Menthe, Ciel, Bonbon, Citron, Pomme, Abricot, Prune, Lagon, Framboise, Indigo) ; en Duel et FFA, on garde des couleurs **très différentes entre voisines** (ordre à valider pour 2 et 6 colonies). Chaque couleur a une teinte principale (cases) et une teinte foncée (Cœur, contours) :

| Couleur | Principale | Foncée | Couleur | Principale | Foncée |
|---|---|---|---|---|---|
| Lavande | `#8F7CF2` | `#563BE1` | Pomme | `#6FBC46` | `#4D7D33` |
| Corail | `#F58C85` | `#E64D43` | Abricot | `#F5C983` | `#E6A641` |
| Menthe | `#5ACEA8` | `#379F7D` | Prune | `#A35DA8` | `#6F4172` |
| Ciel | `#78BCF1` | `#3796E0` | Lagon | `#3EA8A7` | `#2B6968` |
| Bonbon | `#F691C3` | `#E74E9A` | Framboise | `#E0516C` | `#B62A44` |
| Citron | `#E7DF39` | `#B0A91E` | Indigo | `#4042D4` | `#2A2B99` |
- Une colonie se dessine comme **une seule tache arrondie** ; le **Cœur** est un champignon avec deux petits yeux. *G1 : version simple d'abord* : cases colorées une par une, Cœur dans la teinte foncée de la colonie, case en pousse avec une jauge qui se remplit ; la tache arrondie vient plus tard.
- **Bâtiments** : un pictogramme rond et simple au centre de la case ; un bâtiment **en file** (payé, chantier pas commencé) est en pointillé, sans jauge, avec son **numéro** dans la file de construction (décidé le 4 octobre 2026). *Maquettes validées le 4 octobre 2026* : spirale (Nœud de digestion), jarre (Grenier), pousse (Pépinière), goutte (Glande enzymatique), racines (Mycorhize), dans un disque crème cerclé d'une teinte foncée de la colonie. **États** : bâtiment désactivé = disque et pictogramme gris neutre à **45 % d'opacité**, avec un petit cadenas **opaque** (info-bulle : « palier N requis, X cases ») ; bâtiment capturé = pictogramme à la couleur du capteur ; pousse = cercle pointillé ; **en construction** = pictogramme pointillé avec jauge ; prise en cours = anneau de la couleur de l'attaquant ; coupée = barre blanche.
- **Front** : le tronçon est bordé de la couleur de l'attaquant et porte une **jauge de pression** (attaque contre défense) ; les cases qui basculent se teintent peu à peu (visuel à valider sur maquettes en G3).

### 13.3 Mode sombre
Un réglage **Thème : Clair / Sombre / Système** dans les **Paramètres** (appliqué à toute l'interface et à la carte). **Au premier lancement : Système.**

| Élément | Clair | Sombre |
|---|---|---|
| Fond | `#FBF6EE` | `#1F1B26` |
| Cartes | `#FFFDF8` | `#2A2532` |
| Texte | `#3B3340` | `#F2ECF7` |
| Texte secondaire | `#6E6475` | `#B9AFC4` |
| Filets | `#EADFD0` | `#3A3345` |
| Humus (bulle) | fond de la zone assombri de 12 % | `#6F5E50` |
| Fond des zones (bord → centre) | `#F6EEE2` → `#E0C7AE` | `#2A2530` → `#4A3B36` |
| Trait de zone | `#2B2430` | `#F2ECF7` |

Les couleurs de colonie sont **éclaircies si besoin** en mode sombre pour garder le contraste (Indigo et Prune en particulier), à vérifier y compris pour le daltonisme. Le choix est enregistré dans la configuration locale du joueur.

### 13.4 Caméra
- **Déplacement** : clic droit maintenu (on fait glisser la carte) et souris contre les **bords de l'écran**.
- **Zoom** : molette, **centré sur la position de la souris**.
- Le clic gauche reste réservé au jeu (sélection, fronts).
- **Coloniser** : clic gauche sur une case libre collée à la colonie = la pousse démarre tout de suite (sinon la commande est refusée) ; il passe devant une file qui attend (§4.4).
- **Marquage (G1, décidé le 4 octobre 2026)** : chaque case colonisable a un **contour** de la couleur de la colonie, avec en plus une **teinte pâle** si elle est payable tout de suite ; chaque case en attente dans la file porte son **numéro d'ordre** ; une case en pousse a un cercle pointillé et une jauge qui se remplit.
- **File d'expansion** : **Maj + clic gauche** ajoute une case à la file, ou la retire si elle y est déjà. **Maj + clic gauche glissé** sur plusieurs cases les ajoute dans l'ordre du tracé ; le tracé **s'arrête** à la première case qui ne peut pas entrer en file ou quand la file est pleine (message), et repasser sur une case déjà en file ne change rien.

### 13.5 Paramètres
Affichage (plein écran, fenêtré, résolution, **thème clair / sombre / système**), audio, langue (français et anglais), commandes (raccourcis modifiables, **dès G1**), accessibilité (taille de l'interface, palette adaptée au daltonisme).

Raccourcis par défaut : **Espace** recentre la caméra sur le Cœur ; **P** met en pause (Bac à sable seulement) ; **Échap** ouvre le menu de partie (ou revient en arrière dans les menus ; en partie, il ferme d'abord le menu rond ou le panneau d'un bâtiment, puis quitte le mode palette) ; **Maj** est la touche de la file d'expansion ; **1 à 5** choisissent un bâtiment de la palette (G2, modifiables). En G1, ces **quatre touches** sont modifiables (décidé le 4 octobre 2026) ; la souris de la caméra ne l'est pas. Une touche ne peut servir qu'à une action ; un bouton remet les touches par défaut.

### 13.6 HUD de partie
- **Panneau latéral** : ressources, **courbe de production**, stock et son plafond, Enzymes, file de construction et chantiers, cooldowns.
- *Décidé le 4 octobre 2026 (G2, étape 2)* : le **plafond du stock** s'affiche en chiffre avec une barre fine qui se remplit et passe en **couleur d'alerte** quand le stock est plein ; les **Enzymes** (stock et production par minute) sont **toujours visibles**, dès le début de la partie ; la **file de construction** montre « Chantiers N / M · File N / 5 » puis une rangée de pictogrammes (chantiers avec leur jauge, puis bâtiments en file avec leur numéro) : un clic sur l'un d'eux l'**annule** ; l'**info-bulle** d'une case qui a un bâtiment ajoute son nom, son état (en file n° N, en construction encore X s, actif, désactivé : palier N requis, X cases) et son effet actuel (multiplicateur réel de production, Enzymes réellement produites).
- **Palette de bâtiments** (débloqués et coût) et **barre des paliers** (prochain seuil).
- **Mini-classement** : colonies encore en vie, leur taille et leur production moyenne depuis le début (critère de départage à 30:00).
- **Frise de la partie** : prochains événements, temps restant.
- **Journal et alertes** : front ouvert sur mon territoire, Cœur menacé, événement annoncé, élimination d'une colonie.

---

## 14. Aspects techniques (Godot)

### 14.1 Cible et moteur
- **Godot 4.6** (épinglé sur 4.6.3), **GDScript typé** ; la simulation est isolée dans un module pour pouvoir passer plus tard en C# ou GDExtension si le profilage l'exige.
- **Cible : un exécutable Windows (.exe)**, nommé **`Mycelium.exe`**, nom affiché **« Mycelium : Last Colony »**. Préréglage d'export « Windows Desktop » (64 bits). Interface en 1920×1080 de référence, minimum 1280×720, **souris et clavier** (pas de tactile). Les autres plateformes viendront plus tard.
- **Moteur de rendu : Compatibilité** (OpenGL 3), pour tourner sur les PC les plus modestes.
- **Premier lancement** : fenêtre **maximisée** ; langue **du système** (français si Windows est en français, sinon anglais).
- **Icône** : un champignon provisoire dans la DA (le Cœur avec ses deux yeux), à remplacer plus tard.
- **Distribution : Steam** (Steam Direct). Intégration Steamworks via l'extension **GodotSteam** : comptes, amis, invitations, salons, succès.
- **Tests multijoueur avant la sortie** : GodotSteam est utilisé avec l'**App ID 480 (« Spacewar »)**, l'application de test de Valve, pour tester le jeu en ligne entre amis sans payer le Steam Direct Fee (100 $ par jeu) ni créer de page Steam. Chaque testeur lance Steam puis le `.exe` de la version GitHub ; un fichier `steam_appid.txt` contenant `480` est placé à côté de l'exécutable de test (jamais dans l'export final).
  - **Limites** : tout le monde apparaît « en train de jouer à Spacewar » ; pas de succès ni de statistiques globales Steam (l'écran de statistiques de l'interface d'administration ne peut donc pas être validé avec 480) ; les salons de l'App ID 480 sont partagés avec d'autres développeurs, donc chaque salon porte une **clé de métadonnée propre au jeu et à sa version**, et la recherche de salons filtre dessus.
  - **App ID réel** : il remplace 480 dès que la page Steam existe. L'App ID est une **valeur de configuration**, jamais écrite en dur dans le code.
- Configuration et profil enregistrés dans `user://` (thème, résolution, langue, raccourcis, préréglages de parties).

### 14.2 Architecture
- **Simulation autoritaire intégrée** : une seule simulation fait foi ; les joueurs envoient des **commandes** (coloniser, construire, démolir, ouvrir, régler ou arrêter un front, renforcer, déplacer le Cœur, action active) qu'elle valide.
- **Solo (robots)** : la simulation tourne **dans l'exécutable**, sans réseau.
- **En ligne : hébergé par un joueur.** Pas de serveur à nous : l'**hôte** fait tourner la simulation dans son jeu, les autres s'y connectent. Transport par **Steam Networking Sockets** (relais Steam : pas de ports à ouvrir, adresses IP masquées), via le `MultiplayerPeer` de GodotSteam.
- **Qui héberge** : le créateur du salon en partie personnalisée ; pour le Duel et le FFA publics, le propriétaire du salon Steam formé par la file d'attente.
- **Simulation à pas fixe : 1 tick par seconde** ; interpolation côté client pour l'animation. L'hôte envoie les **différences** par tick.
- **Steam** fournit l'identité des joueurs (compte et pseudo Steam), la liste d'amis, les invitations, les salons et la file d'attente (Steam Lobbies). Aucun système de comptes à développer.
- **Triche de l'hôte** : l'hôte a la main sur la simulation. Comme elle est **déterministe**, chaque client peut la rejouer à partir des commandes et comparer une **empreinte de l'état** à chaque tick ; un écart arrête la partie et la signale. À valider avant tout classement.
- **Latence** : l'hôte a un léger avantage (pas de délai pour ses commandes) ; acceptable à 1 tick par seconde.
- **Replay** : l'hôte enregistre la graine et les commandes et les partage en fin de partie ; rejeu déterministe.

### 14.3 Données et rendu
- État de la carte en **tableaux compacts** (`PackedInt32Array` : propriétaire, bâtiment, progression de pousse, de prise et de construction, zone, intégrité). Quelques centaines de cases : coût négligeable.
- Réseau : recherche en largeur depuis le Cœur (cases reliées, îlots, Coupure), recalculée de façon incrémentale.
- Cases-bulles en `MultiMeshInstance2D` ; colonies en taches arrondies via `Geometry2D.merge_polygons` et `offset_polygon` (jointures rondes) ; fronts en `Line2D` animés par shader ; thème clair/sombre par deux ressources `Theme` interchangeables.
- Objectif : **60 images/s** sur un PC modeste.

### 14.4 Interface d'administration (lecture seule)
Écran **caché** du jeu, réservé à une liste de **comptes Steam autorisés**. Sans serveur à nous, l'interface lit uniquement ce que Steam expose ; ces données sont publiques ou agrégées, donc le contrôle d'accès dans le client suffit. Elle ne sert **qu'à observer** :
- **Parties en ligne** : la liste des **salons Steam** du jeu. L'hôte tient à jour les métadonnées de son salon (mode, durée écoulée, colonies vivantes sur total, joueurs et robots, prochain événement).
- **Joueurs en ligne** : les membres de ces salons (pseudo, mode, en attente ou en partie). Le nombre total de joueurs en jeu vient de Steam ; un joueur seul dans les menus n'est **pas visible** individuellement.
- **Statistiques du jeu** : **statistiques globales Steam** (valeurs additionnées sur tous les joueurs) : parties jouées par mode, victoires, éliminations, durée de jeu, parties finies par élimination ou au temps, victoires contre robots par difficulté, déconnexions d'hôte. Les moyennes et répartitions fines (rangs, temps d'attente) demanderaient un petit service de collecte, **non prévu** pour l'instant.

Aucune action de modification (pas d'arrêt de partie, pas de ressources, pas de sauts de temps). Pour **équilibrer** le jeu, les simulations accélérées passent par le **panneau de simulations** (§14.5), pas par cette interface.

### 14.5 Panneau de simulations (développement) *(décidé le 4 octobre 2026, jalon G1)*
Outil d'équilibrage **séparé** de l'interface d'administration, disponible **uniquement quand le jeu est lancé depuis l'éditeur Godot** : il n'existe dans aucun `.exe` livré.
- **Lancement** : les **réglages du Bac à sable** (§2.1 bis), plus le **nombre de simulations** et la **durée simulée** (30 min par défaut). Deux façons : un **lancement simple** (N simulations par profil coché) ou un **balayage** (une valeur, son minimum, son maximum et son pas ; une série par valeur).
- **Robots** *(G2)* : on compose une **liste de robots** ; chacun a **un profil d'expansion** (ci-dessous), **un profil de bâtisseur** (Aucun, Producteur : Nœuds puis Glandes en grappes ; Accélérateur : Pépinières et Mycorhizes d'abord ; Hasardeux : un bâtiment au hasard parmi les meilleurs choix) et **un pourcentage réglable** des nutriments consacré à l'expansion (le reste à la construction). La liste est **gardée d'une session à l'autre**.
- **Profils d'expansion**, à comparer côte à côte :
  - **Hasardeux** : une case tirée au hasard parmi les 3 plus rentables (aléatoire tiré de la graine de chaque simulation) ;
  - **Rentable** : le meilleur rapport production ajoutée (zone, Cohésion) / coût ;
  - **Rapide** : le remboursement le plus court, durée de pousse comprise ;
  - **Centre** : la case la plus riche qu'il peut payer.
- **Mesures** : minute d'arrivée dans chaque zone et à chaque palier, production par minute, temps de remboursement d'une case (début, milieu, fin) et ce qui freine (part du temps à attendre les nutriments ou la pousse). Pour chacune : **moyenne, minimum, maximum et écart type**.
- **Résultats** : tableaux (une colonne par profil) et courbes de production par minute (une par profil) ; export en **fichier CSV**. On peut **rejouer une simulation** sur la carte, en accéléré.
- *Décidé le 4 octobre 2026 (G1, étape 3)* :
  - un robot d'économie **garde sa file d'expansion pleine** : à chaque tick où il reste une place, il ajoute la case choisie par son profil (parmi celles qui peuvent entrer dans la file), et la file attend les nutriments si besoin ; Centre n'ajoute que la case la plus riche qu'il peut payer tout de suite ;
  - **production ajoutée** d'une case = sa propre production une fois poussée (zone, Cohésion, palier actuel) + les +5 % de Cohésion qu'elle donne à ses voisines déjà poussées ;
  - **remboursement d'une case** = temps réel entre le paiement et le moment où la case a produit son coût, pousse comprise ; moyenne des cases payées dans chaque tiers de la partie (début, milieu, fin), avec le nombre de cases non remboursées à la fin ;
  - **ce qui freine** : chaque seconde compte comme attente de la pousse (toutes les places de pousse prises), attente des nutriments (une place libre mais la file attend, ou Centre ne peut rien payer) ou rien à coloniser ;
  - toutes les valeurs chiffrées des réglages du Bac à sable peuvent être balayées ; chaque partie d'une série a sa propre graine (graine des réglages + numéro de la partie), la même d'une série à l'autre ;
  - le **rejeu** sur la carte se fait aux vitesses **×1, ×4, ×16 et ×64**, avec pause ; on y voit la partie telle qu'elle a été jouée, sans pouvoir donner d'ordres.


---

## 15. Feuille de route

| Jalon | Contenu |
|---|---|
| **G0 : Fondations** | Dépôt transformé pour Godot, vérification automatique et version GitHub avec le .exe à chaque fusion sur main ; carte hex (6 zones, un terrain) en Duel et FFA, rendu « Pastille ronde », caméra ; menu principal minimal (entrées futures grisées) ; écran Paramètres (thème, langue, affichage) |
| **G1 : Solo économie** | Colonisation (pousse, file d'expansion), Cœur, réseau, production, Cohésion, **paliers de colonie** et retours visuels (onde continue, palier). Entrée **Bac à sable** : joueur seul sur une forêt de Duel ou de FFA au choix. Horloge de partie affichée (le bonus de l'Armillaire arrive en G3), pause (P + bouton) et vitesse (bouton ×1 / ×2 / ×4), réglages du Bac à sable avec retour aux valeurs par défaut et récapitulatif copiable (§2.1 bis). HUD : nutriments qui défilent, courbe de production, Biomasse, barre du prochain palier, grands nombres avec suffixes (K, M, B, T). Carte : cases colonisables **toujours marquées** (teinte à part pour celles payables tout de suite), **info-bulle au survol** d'une case (zone, coût, durée de pousse, production). Raccourcis modifiables dans les Paramètres (Espace = recentrer sur le Cœur, P = pause). Tests : enregistrement des commandes d'une partie et **rejeu à l'identique** (même empreinte). **Panneau de simulations** (§14.5) avec 4 profils de robot d'économie. Livré en **trois étapes** : 1) simulation et tests ; 2) affichage, HUD et Bac à sable ; 3) robots d'économie, simulations et panneau ; version **0.2.0** |
| **G2 : City builder** | Bâtiments (Nœud de digestion, Grenier, Pépinière, Glande enzymatique, Mycorhize), chantiers, file de construction, voisinage, Enzymes, plafond de stock, déblocages et désactivation par palier ; pose (palette ou menu rond), démolition ; HUD (palette, file et chantiers, Enzymes, stock et plafond) ; pictogrammes validés sur maquettes ; réglages du Bac à sable pour les bâtiments ; robots du panneau de simulations (§14.5) avec profil de bâtisseur. Livré en **trois étapes** (simulation et tests ; affichage, HUD et Bac à sable ; robots et panneau) ; version **0.3.0** |
| **G3 : Combat et fin de partie** | **Fronts** (tracer, investir, renforcer), actions actives (à adapter aux fronts), Sclérote, élimination, **butin et transfert du territoire**, événements, frise de partie |
| **G4 : Duel et FFA contre robots** | Menus, robots (3 difficultés, profils), robots dans le Bac à sable, résultats (pause et vitesse réservées au Bac à sable depuis le 4 octobre 2026) |
| **G5 : Habillage et bêta solo** | **Tutoriel**, audio, profil et statistiques, traduction, essais du jeu contre robots avec de vrais joueurs (sans Steam) |
| **G6 : Multijoueur** | **Étape 1, tests entre amis avec l'App ID 480** (GodotSteam, sans page Steam ni frais, §14.1) : initialisation de Steam, identité, salons et invitations d'amis, relais Steam, hébergement par un joueur, vérification par empreinte, déconnexion et pilote automatique, arrêt de la partie si l'hôte part. **Étape 2, version complète** : file d'attente Steam, FFA entre joueurs, Duel contre un joueur (invitation puis file d'attente, rang éventuel), **partie personnalisée** complète (salon, emplacements, paramètres de forêt, préréglages, invitations d'amis ; l'ancien jalon G5 « Partie personnalisée (local) » y a été fusionné le 4 octobre 2026), chat, **interface d'administration en lecture seule** |

**Hors feuille de route** : la **page Steam**, l'**App ID réel** (Steam Direct, 100 $), les **succès** et **Steam Playtest** se font dès que le propriétaire décide de payer, quel que soit le jalon en cours.

Le jeu est donc complet et jouable en solo avant le multijoueur. Pour ne pas avoir à tout réécrire au G6, la simulation est construite dès le G1 pour ne recevoir que des **commandes** (§14.2) : le passage en ligne consiste surtout à faire tourner cette simulation chez l'hôte et à brancher le réseau Steam.

---

## 16. Décisions à valider et questions ouvertes

### Choix de conception à confirmer
1. **Aucune pression automatique** : la prise de case passe uniquement par les **fronts** (§9), qui remplacent le Filament d'assaut, la Frappe parfaite et « trancher » (4 octobre 2026).
2. **Défense** : résistance des cases plus renfort en nutriments/s ; le défenseur bloque un front mais ne le repousse pas.
3. **Armillaire** gardée comme souche unique (sa croissance sur la durée sert l'aspect incrémental).
4. **Déblocages par palier de colonie** (et non par le temps).
5. **Production et déblocages liés au nombre de cases actuel** : perdre un palier **désactive** les bâtiments concernés (sans les détruire) ; capturer une case donne son bâtiment au capteur, actif ou désactivé selon son propre palier (§7.6).
6. **Pas de pactes** dans la première version.
7. **Tout le multijoueur dans le dernier jalon** (G6), FFA et Duel entre joueurs ensemble, avec GodotSteam.
8. **Plafond de 30 min** y compris en partie personnalisée.
9. **Aucun rétrécissement de la carte** : c'est la richesse du centre, le butin et la Mort subite qui poussent au conflit.
10. **Steam** pour la distribution, les comptes, les amis, les invitations et les salons.
11. **2, 3 ou 6 colonies** seulement, pour des départs strictement équitables.
12. **Élimination** : tout le territoire et les bâtiments de la victime passent au tueur ; les îlots non reliés comptent pour les paliers mais ne produisent pas.
13. **Parties en ligne hébergées par un joueur** (relais Steam), sans serveur à nous ; la partie s'arrête si l'hôte part (migration d'hôte plus tard).
14. **Tutoriel guidé** de ~10 min, proposé au premier lancement.
15. **Modèle économique** (gratuit ou payant) : pas encore décidé.
16. **Départage à 30:00** : production moyenne sur toute la partie, puis nombre de cases.
17. **Tests multijoueur entre amis avec l'App ID 480** (Spacewar) avant d'avoir un App ID réel, puis passage à l'App ID du jeu une fois la page Steam créée.
18. **Perte de transport et Rhizomorphe retirés** (4 octobre 2026).
19. **Économie de départ** : 3 cases Cœur compris, U = 30, ≈ 3,33 nutriments/s par case, stock de départ 6 U, remboursement d'une case en ~10 s au début.
20. **Une pousse à la fois** au départ ; chaque Mycorhize (palier 3) en ajoute une, 3 au plus.
21. **Humidité et Réservoir retirés** (4 octobre 2026), pour ne pas complexifier le jeu au détriment de l'incrémental. **Enzymes gardées** comme monnaie du combat et de la défense.

### Questions ouvertes
- **Triche de l'hôte** : la vérification par empreinte suffit-elle pour un classement du Duel ?
- **Coût et distance au Cœur** : garder ou non le terme `0,05 × distance` du coût de colonisation (à trancher avec la migration du Cœur).
- **Bâtiments de frontière** : actifs ou désactivés quand leur case cesse d'être au bord (G3) ?
- **Statistiques d'administration** : les statistiques globales Steam suffisent-elles, ou faut-il un petit service de collecte ?

### À simuler
- Contact et rythme : la carte ne rétrécissant pas, rien ne force les colonies à se rencontrer. S'affrontent-elles assez tôt ? Combien de parties finissent au temps plutôt que par élimination ?
- Atteint-on la zone N vers la minute 3,5 × N ?
- Courbe de production : facteur de 10 000 à 100 000 sur 30 min ; temps de remboursement d'une case (~10 s au début, moins de 60 s en fin de partie).
- Seuils des paliers (5, 10, 20, 40, 80, 160) selon la taille de la forêt (Duel ~198 cases par colonie, FFA ~153).
- Taille des zones : la Clairière (zone 6) ne fait que ~7 cases en Duel et ~19 en FFA ; est-ce assez pour une case objectif ?
- Fronts : rapport entre débit d'attaque, résistance et renfort ; peut-on encore éliminer quelqu'un, ou tous les fronts finissent-ils bloqués ?
- Butin et transfert du territoire : le tueur gagne d'un coup des cases, des paliers et des bâtiments ; est-ce une boule de neige impossible à rattraper en FFA ?
- Bâtiments capturés : la conquête devient-elle une boule de neige (on prend les cases et leurs bâtiments) ? Faut-il un délai de remise en service ?
- Cas limites de §7.6 à trancher : bâtiment en construction annulé, Sclérote capturé détruit si le capteur en a déjà un.
- Nombre d'éliminations avant 26:00 en FFA (cible : 3 à 5 colonies mortes avant la Mort subite).

### Idées pour plus tard
Autres terrains et souches, pactes, population (hyphes) et logements, mode par équipes, forêts thématiques, classement du Duel.

---

## 17. Questions en attente *(relevées le 4 octobre 2026)*

Questions relevées en relisant chaque jalon. Elles seront posées sous forme de QCM au début du jalon concerné, avant d'écrire le code ; les réponses remplaceront ces lignes dans les sections du document.

### G3 : Combat et fin de partie

**Contre qui se battre**
1. Les robots n'arrivent qu'en G4 : face à qui teste-t-on le combat en G3 (colonie adverse inerte, robots d'économie de G1–G2 comme adversaires, second joueur sur le même PC) ?
2. Peut-on ajouter des adversaires dans le Bac à sable dès G3 ?
3. Panneau de simulations : les robots attaquent-ils dès G3 et mesure-t-on les éliminations, ou est-ce pour G4 ?

**Fronts**
4. Valeurs : résistance de base d'une case par zone, et vitesse d'avancée selon l'écart entre attaque et défense.
5. Tronçon : longueur maximale ? Doit-il être d'un seul tenant ? Peut-il toucher plusieurs voisins à la fois ?
6. Ouvrir un front coûte-t-il quelque chose en plus du débit (Enzymes, nutriments d'un coup) ?
7. Si l'attaquant n'a plus de quoi payer son débit : le front s'arrête-t-il ou ralentit-il ?
8. Front bloqué ou arrêté : les cases à moitié prises gardent-elles leur progression, ou reviennent-elles au défenseur ?
9. Pendant une prise, la case produit-elle encore pour le défenseur ? Peut-on y construire ?
10. Deux fronts de deux attaquants sur la même case : possible, et qui la prend ?
11. Cases en pousse ou en chantier dans un tronçon ; deux colonies qui colonisent la même case libre au même tick : qui l'obtient ?
12. Renfort du défenseur : pour tout le front ou réparti par case ? Peut-on renforcer à l'avance une frontière avant d'être attaqué ?
13. Quel bâtiment ajoute un front, et jusqu'à combien ?
14. Gestes : tracer le tronçon (glisser ?), régler le débit (curseur ?), renforcer, arrêter.
15. En FFA, les autres colonies voient-elles les débits engagés, ou seulement la jauge ?
16. Mort subite : les fronts vont-ils 3× plus vite, comme les prises ?

**Actions actives**
17. Avec les fronts, garde-t-on les quatre actions actives telles quelles, les adapte-t-on, en retire-t-on ? Portée de base des actions (le Carpophore donne +2) : collée au réseau, ou quelques cases ?
18. Assaut : durée de la charge ; effet sur un front ou sur tous ?
19. Toxine (« peindre la zone ») : combien de cases ; effet centré sur une case ou sur chaque case peinte ?
20. Coupure : vise-t-on une case ou le lien entre deux cases ? Les cases isolées deviennent-elles des îlots pendant 45 s ?
21. Siphon : « cases à ≤ 2 » de la case ennemie visée ou de la case de l'attaquant ?
22. Recharges par colonie et par action ? Un second Poste d'assaut donne-t-il une charge de plus ?

**Cœur, Sclérote, élimination**
23. Bâtiments de frontière (et Sclérote, « case non frontière ») dont la case change de statut : actifs ou désactivés ?
24. Renaissance sur le Sclérote : les 60 s de protection couvrent-elles le nouveau Cœur seul ou toute la colonie ?
25. Deux colonies qui perdent leur Cœur au même tick : laquelle gagne ?
26. Butin : les « 2 min de production » de la victime se calculent-elles avant ou après les pertes qui précèdent sa chute ?
27. Migration du Cœur (reportée après G1) : arrive-t-elle en G3 ? Elle conditionne le terme de distance du coût de colonisation.

**Événements**
28. Tirage de l'événement aléatoire (toutes les 2 min environ) : mêmes chances pour tous ou des poids ? Comment choisir les cases touchées ?
29. Arbre mourant : sa « vie », ses règles exactes, ce que deviennent ses 7 cases ; en Duel il remplit toute la Clairière (~7 cases), est-ce voulu ?
30. Incendie : à qui profitent les Cendres (×2 pendant 2 min), et si personne ne recolonise ?
31. Festin : combien rapporte la case très riche, et que devient-elle après 90 s ?
32. Nématodes : nombre maximal de cases mangées, ce qu'elles deviennent, ce qui se passe si personne ne les digère.
33. « Zone du moment » : comment la calculer quand une colonie couvre plusieurs zones, et en Bac à sable avec une seule colonie ?
34. Réglages du Bac à sable pour les événements (lesquels, fréquence) dès G3 ?

**Fin de partie et interface**
35. À 30:00 en G3 : écran de résultats simple, ou l'écran complet prévu en G4 ?
36. Mode spectateur après élimination : G3 ou G4 ?
37. HUD de G3 : frise, temps restant, alertes, annonce des événements, journal, mini-classement : tout en G3 ?
38. Pictogrammes des bâtiments de combat et visuel des fronts : maquettes à valider d'abord, comme en G2 ?
39. Livraison : trois étapes et version 0.4.0, ou découper davantage (combat, puis événements) ?
40. Bâtiments sur une case coupée du Cœur : en G2, comme la case, ils ne produisent rien (ni bonus de rendement, ni Enzymes) mais gardent leurs autres effets (plafond de stock, chantiers, pousses, Pépinière). À confirmer quand les coupures arrivent avec le combat.

### G4 : Duel et FFA contre robots
1. Profils des robots : le §2.5 parle de bâtisseur, expansionniste et agressif, alors que les robots du panneau combinent un profil d'expansion, un profil de bâtisseur et un pourcentage. Les robots de jeu reprennent-ils cette composition, avec un profil de combat en plus ?
2. Valeurs des difficultés Facile, Normal, Difficile (délai de réaction, part d'erreurs, profondeur d'évaluation, qualité du choix des fronts et des débits).
3. « Mêmes limites qu'un joueur » : nombre maximal de commandes par seconde pour un robot ?
4. FFA contre robots : une difficulté pour tous ou une par robot (« mélange ») ? Profils choisis ou tirés au hasard ?
5. Secteur et couleur du joueur en Duel et en FFA : choisis ou tirés au hasard ? Ordre des couleurs pour 2 et 6 colonies (daltonisme compris) ?
6. Quitter une partie en cours : défaite enregistrée ? Confirmation demandée ?
7. Éliminé en FFA contre robots, sans accélération possible : on attend la fin en spectateur ou on quitte avec son rang ?
8. Écran de résultats : contenu exact (rang, statistiques, courbe de production, graine publiée) et boutons (rejouer, menu, revoir la partie).
9. Replay en timelapse (§11.4) : dans quel jalon ?
10. Robots dans le Bac à sable : choisis comme dans le panneau (paire de profils et pourcentage), avec une difficulté ?
11. Panneau de simulations : ajoute-t-on les mesures de combat (éliminations avant 26:00, parties finies au temps, efficacité des fronts, effet du butin) ?

### G5 : Habillage et bêta solo
1. Tutoriel : quelle forêt (« petite forêt de Duel » : rayon 5 ?) ? Faut-il ajouter des étapes pour la file d'expansion, la Mycorhize ou les Enzymes ?
2. Audio : style de la musique et des bruitages ; qui les produit (banques libres de droits, compositeur, autre) et sous quelle licence ?
3. Profil et statistiques : enregistrés sur le PC (`user://`), liés au compte Steam ? Sauvegarde Steam Cloud ?
4. Langues : français et anglais seulement ?
5. Paramètres audio et accessibilité (taille de l'interface, palette adaptée au daltonisme, §13.5) : quel jalon ?
6. Icône définitive et logo : qui les fait ?
7. Numéro de version de la bêta solo.

### G6 : Multijoueur
1. File d'attente : en Duel, au bout de combien de temps proposer un robot s'il n'y a personne ? En FFA, que faire avec moins de 4 joueurs après 2 min ?
2. Classement du Duel (rang, classements Steam) : le fait-on ? Il dépend de la question sur la triche de l'hôte (§16).
3. Hôte en file d'attente : le propriétaire du salon Steam, ou le joueur qui a la meilleure connexion ?
4. Chat : où va un signalement sans serveur à nous ? La sourdine est-elle seulement locale ?
5. Pilote automatique et robot de remplacement (après 3 min) : quel profil et quelle difficulté ?
6. Hôte qui quitte volontairement : où la défaite est-elle enregistrée ?
7. Replay partagé en fin de partie : sous quelle forme (fichier, Steam) ?
8. Interface d'administration : où est stockée la liste des comptes autorisés ? Les statistiques globales Steam ne fonctionnent pas avec l'App ID 480 : l'écran attend-il l'App ID réel ?
9. Spectateurs en ligne : les éliminés restent-ils dans la partie et dans le chat ?
10. Versions différentes entre l'hôte et un invité : on bloque la connexion ?
11. Numéro de version des étapes 1 et 2.
11 bis. Récompenses cosmétiques (§11.5 : titres, couleurs de réseau, effets de particules) : seules les parties en ligne en donnent (§2.6). Lesquelles, à quelles conditions, et dans ce jalon ou plus tard ?

**Partie personnalisée** (ancien jalon G5)
12. Réglages : la partie personnalisée garde-t-elle la liste courte du §2.4, ou reprend-elle les réglages complets du Bac à sable ?
13. Partie à 3 colonies : quel rayon par défaut ?
14. Rayons 5, 11, 17, 23 « à confirmer » ; peut-on combiner n'importe quel nombre de colonies avec n'importe quel rayon (6 colonies sur un rayon 5) ?
15. Valeurs des plages « à valider » : richesse ×1 à ×8, difficulté faible / normale / forte, ressources peu / normales / beaucoup, événements rares / normaux / fréquents.
16. Préréglages : quand arrive le code partageable ? Le Bac à sable aura-t-il les mêmes préréglages (« plus tard ») ?
17. Une partie personnalisée compte-t-elle dans les statistiques du profil ?
18. Un invité absent est-il remplacé par un robot au lancement seulement, ou aussi en cours de partie ?

### Hors feuille de route : sortie Steam
1. Modèle économique (gratuit ou payant) : à décider avant la page Steam ?
2. Visuels de la page Steam (capsules, captures, bande-annonce) : qui les fait ?
3. Numéro de version de la sortie (1.0.0 ?).

### Questions communes à plusieurs jalons
1. Peut-on quitter une partie solo et la reprendre plus tard (sauvegarde de partie en cours) ?
2. Les robots de jeu et ceux du panneau de simulations sont-ils les mêmes (même code, mêmes profils) ?
3. Le panneau de simulations doit-il pouvoir comparer des robots de difficultés différentes à partir de G4 ?
