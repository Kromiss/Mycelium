# MYCÉLIUM : LAST COLONY — Document de conception, portage Godot (v0.2)

> City builder incrémental compétitif, en parties de **30 minutes maximum**. Chaque joueur incarne une colonie de champignons qui bâtit sa ville sur une carte d'hexagones et la regarde **exploser en quantité**. Le centre de la forêt est le plus riche et le plus disputé : **le but est d'être la dernière colonie vivante.** Trois façons de jouer : **Duel**, **FFA** (jusqu'à 6 colonies) et **Partie personnalisée**. Cible : un **projet Godot exporté en .exe (Windows), distribué sur Steam**.

Les valeurs chiffrées de ce document sont des **points de départ à simuler**, pas des décisions.

---

## 1. Pitch

- **Genre** : city builder incrémental compétitif en temps réel, type dernier survivant.
- **Fantasy** : tu es un réseau fongique. Tu bâtis une ville souterraine, tu la regardes **doubler, puis doubler encore**, et tu la défends contre des voisins dont tu vois les filaments approcher, en descendant vers un centre toujours plus riche et plus disputé.
- **Boucle courte (10 à 60 s)** : coloniser une case, poser un bâtiment, atteindre le prochain palier, lancer ou trancher un filament.
- **Boucle moyenne (3 à 5 min)** : changer de zone, bâtir le quartier suivant, rapprocher le Cœur du centre, choisir sa cible.
- **Boucle longue (30 min)** : survivre, éliminer, finir dernier vivant.

### Piliers de design
1. **L'espace est la ressource principale.** Prendre les bonnes cases, puis les rentabiliser.
2. **La colonie explose.** Chaque minute, le joueur doit sentir que ses chiffres et sa taille changent d'échelle.
3. **La ville est l'identité.** C'est le plan de ta ville (où, quoi, dans quel ordre) qui te distingue des autres.
4. **L'attaque se voit et se mérite.** Un geste précis, visible par tous, pas un simple clic.
5. **Départ équitable, centre risqué.** Mêmes chances au départ ; plus on prend de risques, plus on peut gagner.
6. **Lisibilité** : on comprend en 5 secondes qui domine, qui est menacé et ce qui arrive ensuite.

---

## 2. Modes de jeu

### 2.1 Menu principal
**Jouer** (Duel, FFA), **Partie personnalisée**, **Tutoriel**, **Profil**, **Paramètres**, **Quitter**.

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
| Vitesse de jeu (solo uniquement) | ×1 | ×1, ×2, ×4 |

### 2.5 Robots
- Les robots jouent **avec les mêmes règles et les mêmes commandes que les joueurs** : pas de triche. La difficulté joue sur la vitesse de réaction, la qualité du plan de ville et l'usage des attaques.
- **Profils** : bâtisseur, expansionniste, agressif (pour varier les parties).
- Ils servent aussi à compléter les salons, à remplacer un joueur déconnecté (§11.2) et à équilibrer les valeurs par simulation.

### 2.6 Règles communes
- **Durée maximale : 30:00**, tous modes, y compris personnalisés.
- **Solo** : pause possible (si aucun humain adverse). Éliminé, on peut **accélérer la fin de partie** (×4) en spectateur.
- **Résultat** : rang de partie = ordre d'élimination ; statistiques de fin (cases conquises, éliminations, durée de survie, pic de production).

### 2.7 Tutoriel
Une **courte partie scénarisée (~10 min)** contre un robot passif, sur une petite forêt de Duel. **Proposé au premier lancement**, passable, et rejouable depuis le menu. Chaque étape affiche un objectif et ne passe à la suite que lorsqu'il est atteint :

| Étape | Objectif | Ce qu'on apprend |
|---|---|---|
| 1 | Coloniser 2 cases | Expansion, pousse, coût |
| 2 | Former un bloc de cases voisines | Cohésion |
| 3 | Construire un Nœud de digestion | Bâtiments, chantiers |
| 4 | Construire un Réservoir quand l'humidité baisse | Équilibre d'humidité |
| 5 | Atteindre 5 puis 10 cases | Paliers de colonie, production qui double |
| 6 | Construire le Sclérote | Seconde vie du Cœur |
| 7 | Lancer un filament sur une case du robot, réussir une Frappe parfaite | Attaque |
| 8 | Trancher le filament du robot | Défense |
| 9 | Prendre le Cœur du robot | Élimination et butin |

Le robot ne fait qu'attaquer sur commande du script (étape 8) ; le reste du temps, il ne joue pas.

---

## 3. Déroulé d'une partie

### 3.1 Départ
- Chaque colonie démarre avec un **Cœur et 3 cases** au bord de son secteur (zone 1), avec de quoi poser ses premières cases et un bâtiment.
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
- On ne colonise qu'une case **adjacente** à son réseau.
- Coût = `base × (1 + 0,05 × distance_au_cœur) × difficulté_zone × 1,02 ^ nb_cases` (à simuler).
- La colonisation n'est pas instantanée : les hyphes **poussent** (~4 s en zone 1), ce qui laisse une fenêtre de réaction.
- **File d'expansion** : jusqu'à 5 colonisations programmées.
- **Cohésion** : chaque case compte ses voisines possédées (0 à 6). Production **+5 % par voisine** (max +30 %) ; en défense, temps de prise **+15 % par voisine**. Une **Rosace** (6 voisines) ne peut pas être visée par une Coupure.

### 4.5 Le réseau
- Les nutriments remontent vers le **Cœur** ; une case perd **1 % par saut** de distance.
- Un **Rhizomorphe** (§7.2) supprime la perte le long de sa chaîne.
- Une **Coupure** (§9.4) isole une portion du réseau : les cases coupées ne produisent plus (sans dépérir) tant que dure la Coupure.

---

## 5. Ressources

| Ressource | Rôle | Source |
|---|---|---|
| **Nutriments** | Monnaie de base : colonisation, bâtiments, filaments | Toutes les cases |
| **Enzymes** | Bâtiments avancés et actions actives | Glande enzymatique, événements |
| **Humidité** | Santé de la ville : trop peu = production réduite (§7.4) | Réservoirs, Orage |
| **Biomasse** | Total des nutriments produits : sert au départage à 30:00 (production moyenne = biomasse ÷ durée) et aux statistiques | Conversion des nutriments produits |

- **3 ressources visibles au début** (Nutriments, Humidité, Biomasse) ; les Enzymes apparaissent avec la Glande enzymatique.
- **Stock plafonné** : **3 min de production** (+2 min par Grenier). Ce qui dépasse est perdu : on dépense en continu.
- La Biomasse ne se dépense pas et ne débloque rien.

---

## 6. Croissance incrémentale

Le joueur doit sentir que sa colonie **explose**. Rien ne s'achète pour grandir : cela passe par cinq mécanismes automatiques.

### 6.1 Paliers de colonie
Quand le **nombre de cases** franchit un seuil, **la production de la colonie double** :

| Palier | Cases | Production | Débloque |
|---|---|---|---|
| Départ | 3 | ×1 | Nœud de digestion, Réservoir, Rhizomorphe |
| 1 | 5 | ×2 | Grenier, Pépinière |
| 2 | 10 | ×4 | Glande enzymatique, Sclérote |
| 3 | 20 | ×8 | Écorce, Toxinière |
| 4 | 40 | ×16 | Poste d'assaut, Haustorium |
| 5 | 80 | ×32 | Carpophore |
| 6 | 160 | ×64 | (le prestige du conquérant) |

- Le multiplicateur et les déblocages suivent le **nombre de cases actuel** : perdre des cases peut faire perdre un palier, ce qui rend la défense tendue. Les bâtiments liés au palier perdu ne sont **pas détruits, ils sont désactivés** (§7.6), et reprennent du service dès que le palier est de nouveau atteint.
- Rien ne s'achète : on grandit et le palier tombe tout seul.

### 6.2 Multiplicateurs qui se cumulent
Richesse de zone (jusqu'à ×4), Cohésion (jusqu'à +30 %), bâtiments et voisinage (§7.3), équilibre d'humidité (jusqu'à +20 %), souche (jusqu'à +25 %), événements (Floraison, Orage). Ils **se multiplient entre eux** au lieu de s'additionner.

### 6.3 Boucle de réinvestissement
Une case neuve doit se rembourser vite : cible **~20 s au début**, **moins de 60 s en fin de partie** malgré des coûts plus élevés. Chaque palier relance la boucle (nouvelles cases rentables, nouveaux bâtiments).

### 6.4 Ordre de grandeur
Cible : **~10 nutriments/s au départ → 1e5 à 1e6 nutriments/s en fin de partie**, soit un facteur de 10 000 à 100 000 en 30 min (à simuler). Les nombres s'écrivent avec des suffixes (K, M, B, T).

### 6.5 Retour visuel (le « boum »)
- Chaque **palier** déclenche une **onde** qui part du Cœur, fait pulser les cases une à une et lance un petit feu d'artifice de particules, avec un son et le message « Palier ×2 ! ».
- Les **compteurs défilent** (nutriments qui montent à vue d'œil) et une **courbe de production** reste affichée dans le HUD.
- La tache de la colonie **grossit de façon visible** ; la Floraison collective fait « éclore » tout le réseau.

---

## 7. Le city builder

Chaque case possédée peut accueillir **un bâtiment**, posé, déplacé ou démoli par le joueur. Pas de niveaux : on construit, on place, on combine.

### 7.1 Principes
1. **Un bâtiment par case**, sur une case possédée (pas en cours de pousse).
2. **Construction non instantanée** : **3 à 20 s**. **Chantiers simultanés limités** (2 au départ, +1 par Pépinière).
3. **Règles de pose** : certains bâtiments exigent une case frontière ou un voisinage précis.
4. **Voisinage** : des bâtiments adjacents se renforcent (§7.3).
5. **Besoins** : l'équilibre d'humidité (§7.4).
6. **Coût croissant** : `base × 1,12 ^ nb_déjà_construits_du_même_type`.
7. **Démolir** rembourse 50 % ; **déplacer** = démolir + reposer.
8. **Capture** : le bâtiment passe à l'attaquant avec la case (§7.6). L'Incendie et le Sanglier, eux, détruisent tout.
9. **File de construction** : jusqu'à 5 chantiers programmés.

Les coûts sont en multiples de **U**, le coût de colonisation d'une case de zone 1 au départ.

### 7.2 Catalogue
Les déblocages suivent les **paliers de colonie** (§6.1). Un bâtiment dont le palier n'est plus atteint est **désactivé**, pas détruit (§7.6).

| Bâtiment | Débloqué | Coût | Règle de pose | Effet |
|---|---|---|---|---|
| **Nœud de digestion** | Départ | 2 U | Partout | +50 % de rendement de la case |
| **Réservoir** | Départ | 2 U | Partout | +3 Humidité/min ; cases à ≤ 2 : +5 % de production |
| **Rhizomorphe** | Départ | 1 U | Partout | Aucune perte de transport sur sa chaîne ; insensible à la Coupure |
| **Grenier** | Palier 1 | 3 U | Partout | +2 min de plafond de stock |
| **Pépinière** | Palier 1 | 4 U | Partout | Pousse −30 % dans un rayon de 3 ; +1 chantier simultané |
| **Glande enzymatique** | Palier 2 | 5 U | Partout | +20 Enzymes/min |
| **Sclérote** | Palier 2 | 15 U + 50 Enzymes | Case non frontière, **1 seul** | Recueille le Cœur s'il tombe (§9.5) |
| **Écorce** | Palier 3 | 4 U + 10 Enzymes | Partout | Temps de prise ×2 sur sa case, +20 % sur ses voisines |
| **Toxinière** | Palier 3 | 6 U + 20 Enzymes | Case frontière | Filaments ennemis visant ses voisines 15 % plus lents ; **débloque Toxine** |
| **Poste d'assaut** | Palier 4 | 8 U + 40 Enzymes | Case frontière | +1 filament simultané (max 5) ; **débloque Assaut et Coupure** |
| **Haustorium** | Palier 4 | 8 U + 30 Enzymes | Case frontière | **Débloque Siphon** |
| **Carpophore** | Palier 5 | 10 U | Partout | Portée des actions +2 ; montre l'état des Cœurs ennemis ; **visible et ciblé par tous** |

### 7.3 Voisinage (synergies)
- **Nœud de digestion** : +10 % par Nœud adjacent (max +30 %) ; +10 % s'il touche un Réservoir.
- **Glande enzymatique** : +25 % par Réservoir adjacent.
- **Écorce** : +10 % de temps de prise par Écorce voisine (un mur).
- **Rosace** : une case entourée de ses 6 voisines possédées compte **+10 %** sur l'effet de son bâtiment.
- Un **quartier compact** est fort mais plus facile à raser d'un coup (Incendie, Sanglier, attaque) : choisir sa densité est une décision.

### 7.4 Équilibre d'humidité
Chaque bâtiment **consomme** de l'Humidité (0,5/min) ; les **Réservoirs** en produisent (3/min). Le **ratio** est ce que tu produis divisé par ce que tu consommes, et il multiplie la production :
- **ratio < 1** : production réduite (jusqu'à ×0,5) ;
- **ratio 1** : normal ;
- **ratio > 1** : bonus jusqu'à **+20 %**.

Exemple : 12 bâtiments (dont 2 Réservoirs) consomment 6/min et les 2 Réservoirs produisent 6/min : ratio 1, tout va bien. Avec un seul Réservoir, le ratio tombe à 0,5 et ta production est divisée par deux. Règle pratique : **environ 1 Réservoir pour 5 autres bâtiments**.

### 7.5 Le Cœur
- Unique, non démolissable. Il collecte les nutriments et définit la distance de transport.
- **Migration** : on peut le déplacer vers une case adjacente à son réseau (30 s d'immobilisation, recharge 3 min). Utile pour rapprocher le Cœur du centre (moins de pertes de transport) ou l'éloigner d'un front.
- Se prend **4× plus lentement** qu'une case normale.

### 7.6 Désactivation et capture

**Désactivation (perte de palier).** Chaque bâtiment est lié à son palier de déblocage (§7.2). Si le nombre de cases de la colonie repasse **sous** ce seuil, le bâtiment **n'est pas détruit : il est désactivé**. Il reste sur sa case, mais :
- il n'a **aucun effet** : ni production, ni synergie de voisinage (§7.3), ni bonus de Rosace, ni action débloquée, ni filament ou chantier supplémentaire ;
- il **ne consomme plus d'humidité** ;
- on ne peut plus en construire de nouveaux du même type, mais on peut le démolir (remboursement 50 %) ;
- il se **réactive tout seul** dès que la colonie repasse au-dessus du seuil.

Les effets déjà lancés (action en recharge, filament ou chantier en cours) vont à leur terme. Les bâtiments de départ (Nœud de digestion, Réservoir, Rhizomorphe) ne se désactivent jamais. Un **Sclérote désactivé ne peut pas recueillir le Cœur** : tomber sous le palier 2 juste avant de perdre son Cœur est fatal.

**Capture.** Quand une case est prise, **son bâtiment passe à l'attaquant avec la case**, intact et à la couleur du capteur :
- il est **actif** si le capteur a atteint le palier qui le débloque ;
- sinon il reste **désactivé** jusqu'à ce que le capteur l'atteigne : un conquérant qui grossit récupère donc tout ce qu'il a pris ;
- un **Sclérote** capturé devient celui du capteur s'il n'en a pas, sinon il est détruit (la victime perd dans les deux cas sa seconde vie) ;
- un bâtiment **en construction** au moment de la prise est annulé, son coût est perdu.

**Élimination.** Les bâtiments d'une colonie éliminée ne sont pas détruits : ils passent au tueur avec les cases (§9.6), actifs ou désactivés selon son palier, comme pour une capture.

**Destruction.** Seuls l'Incendie et le Sanglier détruisent des bâtiments.

---

## 8. Souche unique

Pour le moment, **une seule souche**, sans écran de choix : l'**Armillaire**. Elle grossit sur la durée : **production ×1,00 au départ → ×1,25 à 30:00** (croissance linéaire).
D'autres souches pourront être ajoutées plus tard ; l'écran de choix arrivera avec la deuxième.

---

## 9. Conflit

Il n'y a **aucune pression automatique** au contact. On ne prend une case qu'avec une **action visuelle précise**, visible par tous.

### 9.1 L'attaque : le Filament d'assaut
1. **Sélectionner** une de ses cases frontière (clic gauche) : les cases ennemies attaquables pulsent.
2. **Glisser** (bouton maintenu) vers une case ennemie adjacente : un **filament** se tend, en direct, avec une trajectoire visible.
3. **Relâcher sur la cible** : l'attaque démarre. Échap ou clic droit annule avant le relâchement.
4. Un **anneau de progression** se remplit sur la case ; **toute la forêt voit le filament** (couleur de l'attaquant).
5. **Frappe parfaite** : un anneau de timing pulse pendant la prise ; cliquer au bon moment fait gagner **30 % du temps restant** (une seule fois par filament, sinon rien).

- **Coût** : 25 % du coût de colonisation de la case visée, perdu si le filament est tranché.
- **Limite** : **2 filaments simultanés** (+1 par Poste d'assaut, max 5).
- **Tracé de front** : en glissant sur plusieurs cases ennemies adjacentes d'affilée, on lance plusieurs filaments (ils occupent plusieurs emplacements).
- **Temps de prise** : voir §12 ; il dépend de la zone, de la Cohésion du défenseur, de l'Écorce et du nombre de cases de l'attaquant qui touchent la cible.

### 9.2 La défense
- **Alerte** visible dès qu'un filament se tend sur son territoire.
- **Trancher le filament** : un **geste de balayage** à travers le filament l'annule et fait perdre son coût à l'attaquant (coût pour le défenseur, recharge 8 s ; l'attaquant ne peut pas relancer sur la même case pendant 4 s).
- **Défense passive** : Cohésion, Écorce, Toxinière.

### 9.3 Cibles
- On n'attaque que des cases **collées à son réseau**.
- Pas d'attaque avant **2:00** (protection de départ).
- Le **Cœur** se prend 4× plus lentement.

### 9.4 Actions actives
Elles coûtent des Enzymes, rechargent et **exigent le bâtiment correspondant**. Chacune a **son propre geste** :

| Action | Bâtiment | Geste | Coût | Recharge | Effet |
|---|---|---|---|---|---|
| **Assaut** | Poste d'assaut | Maintenir sur un filament puis relâcher (charge d'un anneau) | 30 Enzymes | 90 s | Prise 4× plus rapide pendant 20 s |
| **Toxine** | Toxinière | « Arroser » : peindre la zone visée d'un trait | 20 Enzymes | 2 min | La case et ses voisines : production −50 % pendant 60 s |
| **Coupure** | Poste d'assaut | **Trancher** un lien du réseau ennemi d'un balayage | 40 Enzymes | 3 min | La case ne fait plus passer les nutriments pendant 45 s (ni Rhizomorphe, ni Cœur, ni Rosace) |
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
production_case    = rendement × richesse_zone × (1 + bonus_bâtiment + voisinage)
                     × (1 + 0,05 × voisines) × modif_événement
production_totale  = Σ production_case × (1 − perte_transport(distance))
                     × 2 ^ paliers_atteints × facteur_humidité × bonus_souche(t)
paliers_atteints   = nombre de seuils (5, 10, 20, 40, 80, 160 cases) ≤ nb_cases
bonus_souche(t)    = 1,00 + 0,25 × t / 30 min
facteur_humidité   = clamp(production_humidité / consommation_humidité ; 0,5 ; 1,2)
coût_colonisation  = base × (1 + 0,05 × dist_cœur) × difficulté_zone × 1,02 ^ nb_cases
coût_bâtiment      = base_bâtiment × 1,12 ^ nb_déjà_construits_du_même_type
coût_filament      = 0,25 × coût_colonisation(case visée)
stock_max          = production_totale × (3 min + 2 min × nb_greniers)
temps_prise        = base_prise × prise_zone × (1 + 0,15 × voisines_défenseur) × facteur_écorce
                     × facteur_cœur / (1 + 0,25 × voisines_attaquant_adjacentes)
```

Base de prise : **~8 s** pour une case de zone 1 sans voisines ; Cœur ×4 ; Mort subite ÷3.

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
- Une colonie se dessine comme **une seule tache arrondie** ; le **Cœur** est un champignon avec deux petits yeux.
- **Bâtiments** : un pictogramme rond et simple au centre de la case. **États** : bâtiment désactivé = pictogramme grisé avec un petit cadenas (info-bulle : « palier N requis, X cases ») ; bâtiment capturé = pictogramme à la couleur du capteur ; pousse = cercle pointillé ; **en construction** = pictogramme pointillé avec jauge ; prise en cours = anneau de la couleur de l'attaquant ; coupée = barre blanche.
- **Filament d'assaut** : un trait vivant de la couleur de l'attaquant, qui ondule et s'épaissit à mesure que la prise avance.

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
- Le clic gauche reste réservé au jeu (sélection, filaments).

### 13.5 Paramètres
Affichage (plein écran, fenêtré, résolution, **thème clair / sombre / système**), audio, langue (français et anglais), commandes (raccourcis modifiables), accessibilité (taille de l'interface, palette adaptée au daltonisme).

### 13.6 HUD de partie
- **Panneau latéral** : ressources, **courbe de production**, stock, **équilibre d'humidité**, file de construction, chantiers, cooldowns.
- **Palette de bâtiments** (débloqués et coût) et **barre des paliers** (prochain seuil).
- **Mini-classement** : colonies encore en vie, leur taille et leur production moyenne depuis le début (critère de départage à 30:00).
- **Frise de la partie** : prochains événements, temps restant.
- **Journal et alertes** : filament sur mon territoire, Cœur menacé, événement annoncé, élimination d'une colonie.

---

## 14. Aspects techniques (Godot)

### 14.1 Cible et moteur
- **Godot 4.6** (épinglé sur 4.6.3), **GDScript typé** ; la simulation est isolée dans un module pour pouvoir passer plus tard en C# ou GDExtension si le profilage l'exige.
- **Cible : un exécutable Windows (.exe)**, nommé **`Mycelium.exe`**, nom affiché **« Mycelium : Last Colony »**. Préréglage d'export « Windows Desktop » (64 bits). Interface en 1920×1080 de référence, minimum 1280×720, **souris et clavier** (pas de tactile). Les autres plateformes viendront plus tard.
- **Moteur de rendu : Compatibilité** (OpenGL 3), pour tourner sur les PC les plus modestes.
- **Premier lancement** : fenêtre **maximisée** ; langue **du système** (français si Windows est en français, sinon anglais).
- **Icône** : un champignon provisoire dans la DA (le Cœur avec ses deux yeux), à remplacer plus tard.
- **Distribution : Steam** (Steam Direct). Intégration Steamworks via l'extension **GodotSteam** : comptes, amis, invitations, salons, succès.
- Configuration et profil enregistrés dans `user://` (thème, résolution, langue, raccourcis, préréglages de parties).

### 14.2 Architecture
- **Simulation autoritaire intégrée** : une seule simulation fait foi ; les joueurs envoient des **commandes** (coloniser, construire, démolir, lancer un filament, trancher, déplacer le Cœur, action active) qu'elle valide.
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
- Transport : recherche en largeur depuis le Cœur, recalculée de façon incrémentale.
- Cases-bulles en `MultiMeshInstance2D` ; colonies en taches arrondies via `Geometry2D.merge_polygons` et `offset_polygon` (jointures rondes) ; filaments en `Line2D` animés par shader ; thème clair/sombre par deux ressources `Theme` interchangeables.
- Objectif : **60 images/s** sur un PC modeste.

### 14.4 Interface d'administration (lecture seule)
Écran **caché** du jeu, réservé à une liste de **comptes Steam autorisés**. Sans serveur à nous, l'interface lit uniquement ce que Steam expose ; ces données sont publiques ou agrégées, donc le contrôle d'accès dans le client suffit. Elle ne sert **qu'à observer** :
- **Parties en ligne** : la liste des **salons Steam** du jeu. L'hôte tient à jour les métadonnées de son salon (mode, durée écoulée, colonies vivantes sur total, joueurs et robots, prochain événement).
- **Joueurs en ligne** : les membres de ces salons (pseudo, mode, en attente ou en partie). Le nombre total de joueurs en jeu vient de Steam ; un joueur seul dans les menus n'est **pas visible** individuellement.
- **Statistiques du jeu** : **statistiques globales Steam** (valeurs additionnées sur tous les joueurs) : parties jouées par mode, victoires, éliminations, durée de jeu, parties finies par élimination ou au temps, victoires contre robots par difficulté, déconnexions d'hôte. Les moyennes et répartitions fines (rangs, temps d'attente) demanderaient un petit service de collecte, **non prévu** pour l'instant.

Aucune action de modification (pas d'arrêt de partie, pas de ressources, pas de sauts de temps). Pour **équilibrer** le jeu, les simulations accélérées passent par une **commande de développement** du jeu (robots seuls, temps accéléré), pas par cette interface.

---

## 15. Feuille de route

| Jalon | Contenu |
|---|---|
| **G0 : Fondations** | Dépôt transformé pour Godot, vérification automatique et version GitHub avec le .exe à chaque fusion sur main ; carte hex (6 zones, un terrain) en Duel et FFA, rendu « Pastille ronde », caméra ; menu principal minimal (entrées futures grisées) ; écran Paramètres (thème, langue, affichage) |
| **G1 : Solo économie** | Colonisation, Cœur, transport, production, Cohésion, **paliers de colonie** et retours visuels |
| **G2 : City builder** | Bâtiments, chantiers, files, voisinage, humidité, déblocages par palier |
| **G3 : Combat et fin de partie** | Filament d'assaut, trancher, actions actives, Sclérote, élimination, **butin et transfert du territoire**, événements, frise de partie |
| **G4 : Duel et FFA contre robots** | Menus, robots (3 difficultés, profils), pause, accélération, résultats |
| **G5 : Partie personnalisée (local)** | Salon, emplacements, paramètres de forêt, préréglages |
| **G6 : Habillage et bêta solo** | **Tutoriel**, audio, profil et statistiques, traduction, page Steam et succès, essais du jeu contre robots avec de vrais joueurs (Steam Playtest) |
| **G7 : Multijoueur** | Amis, invitations, salons et file d'attente Steam, **hébergement par un joueur** via le relais Steam, vérification par empreinte, FFA entre joueurs, Duel contre un joueur (invitation puis file d'attente, rang éventuel), partie personnalisée avec amis, chat, déconnexion et pilote automatique, **interface d'administration en lecture seule** |

Le jeu est donc complet et jouable en solo avant le multijoueur. Pour ne pas avoir à tout réécrire au G7, la simulation est construite dès le G1 pour ne recevoir que des **commandes** (§14.2) : le passage en ligne consiste surtout à faire tourner cette simulation chez l'hôte et à brancher le réseau Steam.

---

## 16. Décisions à valider et questions ouvertes

### Choix de conception à confirmer
1. **Aucune pression automatique** : la prise de case passe uniquement par le Filament d'assaut.
2. **Trancher un filament** : une défense active ; peut créer des impasses si elle est trop efficace.
3. **Armillaire** gardée comme souche unique (sa croissance sur la durée sert l'aspect incrémental).
4. **Déblocages par palier de colonie** (et non par le temps).
5. **Production et déblocages liés au nombre de cases actuel** : perdre un palier **désactive** les bâtiments concernés (sans les détruire) ; capturer une case donne son bâtiment au capteur, actif ou désactivé selon son propre palier (§7.6).
6. **Pas de pactes** dans la première version.
7. **Tout le multijoueur dans le dernier jalon** (G7), FFA et Duel entre joueurs ensemble.
8. **Plafond de 30 min** y compris en partie personnalisée.
9. **Aucun rétrécissement de la carte** : c'est la richesse du centre, le butin et la Mort subite qui poussent au conflit.
10. **Steam** pour la distribution, les comptes, les amis, les invitations et les salons.
11. **2, 3 ou 6 colonies** seulement, pour des départs strictement équitables.
12. **Élimination** : tout le territoire et les bâtiments de la victime passent au tueur ; les îlots non reliés comptent pour les paliers mais ne produisent pas.
13. **Parties en ligne hébergées par un joueur** (relais Steam), sans serveur à nous ; la partie s'arrête si l'hôte part (migration d'hôte plus tard).
14. **Tutoriel guidé** de ~10 min, proposé au premier lancement.
15. **Modèle économique** (gratuit ou payant) : pas encore décidé.
16. **Départage à 30:00** : production moyenne sur toute la partie, puis nombre de cases.

### Questions ouvertes
- **Triche de l'hôte** : la vérification par empreinte suffit-elle pour un classement du Duel ?
- **Statistiques d'administration** : les statistiques globales Steam suffisent-elles, ou faut-il un petit service de collecte ?

### À simuler
- Contact et rythme : la carte ne rétrécissant pas, rien ne force les colonies à se rencontrer. S'affrontent-elles assez tôt ? Combien de parties finissent au temps plutôt que par élimination ?
- Atteint-on la zone N vers la minute 3,5 × N ?
- Courbe de production : facteur de 10 000 à 100 000 sur 30 min ; temps de remboursement d'une case (20 s à 60 s).
- Seuils des paliers (5, 10, 20, 40, 80, 160) selon la taille de la forêt (Duel ~198 cases par colonie, FFA ~153).
- Taille des zones : la Clairière (zone 6) ne fait que ~7 cases en Duel et ~19 en FFA ; est-ce assez pour une case objectif ?
- Temps de prise et efficacité de « trancher » : peut-on encore éliminer quelqu'un ?
- Butin et transfert du territoire : le tueur gagne d'un coup des cases, des paliers et des bâtiments ; est-ce une boule de neige impossible à rattraper en FFA ?
- Humidité : ratio, consommation (0,5/min) et production des Réservoirs (3/min).
- Bâtiments capturés : la conquête devient-elle une boule de neige (on prend les cases et leurs bâtiments) ? Faut-il un délai de remise en service ?
- Cas limites de §7.6 à trancher : bâtiment en construction annulé, Sclérote capturé détruit si le capteur en a déjà un.
- Nombre d'éliminations avant 26:00 en FFA (cible : 3 à 5 colonies mortes avant la Mort subite).

### Idées pour plus tard
Autres terrains et souches, pactes, population (hyphes) et logements, mode par équipes, forêts thématiques, classement du Duel.
