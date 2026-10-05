# MYCÉLIUM : LAST COLONY — Document de conception, portage Godot (v0.4 : le Sporophore)

> Jeu incrémental compétitif en parties de **30 minutes maximum**. Chaque joueur incarne une colonie de champignons dont le **cœur est une tourelle** : elle lance des spores qui colorent les cases d'une carte d'hexagones. Plus la colonie a de cases, plus elle produit ; ce qu'elle produit sert à **améliorer sa tourelle** (dégâts, cadence, portée…), qui prend alors encore plus de cases. Le centre de la forêt est le plus riche et le plus disputé : **le but est d'être la dernière colonie vivante.** Trois façons de jouer : **Duel**, **FFA** (jusqu'à 6 colonies) et **Partie personnalisée**. Cible : un **projet Godot exporté en .exe (Windows), distribué sur Steam**.

**Vocabulaire.** Dans le jeu, la tourelle s'appelle **le Sporophore** ; ce document dit « la Tourelle ». Les valeurs chiffrées sont des **points de départ à simuler**. Les décisions ont été prises avec le propriétaire le 4 octobre 2026 (questions en QCM, maquettes validées).

---

## 1. Pitch

- **Genre** : jeu incrémental compétitif en temps réel (« tower idle »), type dernier survivant.
- **Fantasy** : tu es un réseau fongique dont le cœur est un champignon qui crache des spores. Tu le regardes conquérir la forêt case après case, tu le rends de plus en plus puissant et tu le mesures aux champignons voisins.
- **Boucle courte (5 à 30 s)** : acheter une amélioration, changer la priorité de tir, désigner une case à prendre, lancer une capacité.
- **Boucle moyenne (2 à 5 min)** : atteindre un palier et choisir une mutation, déplacer la tourelle vers le centre, choisir sa cible parmi les voisins.
- **Boucle longue (30 min)** : survivre, abattre les tourelles adverses, finir dernier vivant.

### Piliers de design
1. **L'espace est la ressource principale.** Plus de cases = plus de production = une meilleure tourelle.
2. **La colonie explose.** Chaque minute, le joueur doit sentir que ses chiffres changent d'échelle.
3. **La tourelle est l'identité.** Ses améliorations et ses mutations font ta façon de jouer.
4. **L'affrontement, c'est la meilleure tourelle.** Pas de micro-gestion : on gagne par ses choix d'améliorations, de priorités et de placement.
5. **Départ équitable, centre risqué.** Mêmes chances au départ ; plus on avance vers le centre, plus on gagne et plus on s'expose.
6. **Lisibilité** : on comprend en 5 secondes qui domine, qui est menacé et ce qui arrive ensuite.

---

## 2. Modes de jeu

### 2.1 Menu principal
**Jouer** (Duel, FFA), **Bac à sable** (§2.1 bis), **Partie personnalisée**, **Tutoriel**, **Profil**, **Paramètres**, **Quitter**.

### 2.1 bis Bac à sable
- Entrée du menu principal, **visible par tous les joueurs**. Il n'y a **que le joueur et des robots** ; la partie personnalisée sert à jouer avec ses amis. Il sert notamment aux tests d'équilibrage du propriétaire.
- **Purement local** : fonctionne **sans Steam ni GodotSteam**.
- Le joueur est sur une forêt de **Duel ou de FFA, au choix**, avec la couleur **Menthe**, seul ou avec des **adversaires robots** : l'écran de réglages propose, pour **chaque secteur libre** (1 en Duel, 5 en FFA), un robot **Canonnier**, **Bâtisseur** ou **Conquérant**, ou **Aucun** (par défaut) ; le récapitulatif liste les adversaires et leur résultat (décidé le 4 octobre 2026, étape 3 de G3).
- **Pause et vitesse uniquement en Bac à sable** : pause par la touche **P** ou un bouton du HUD ; vitesse par un **bouton du HUD** qui passe de ×1 à ×2 puis ×4.
- **Le plus paramétrable possible** : un écran de réglages avant de lancer (forêt et graine, adversaires, et **tous les chiffres** du jeu : tourelle de départ, PV des cases, régénération, améliorations, paliers, Enzymes, capacités, événements, protection de départ, Trophée). Un bouton **remet les valeurs par défaut** ; les réglages **ne sont pas gardés** d'une partie à l'autre.
- **Récapitulatif à tout moment** : un bouton copie dans le presse-papiers un texte lisible avec les **réglages** et les **résultats** de la partie.
- La partie **s'arrête à 30:00** : la carte reste visible et un **panneau de fin** propose **Copier le récapitulatif**, **Rejouer avec les mêmes réglages** et **Menu**. **Échap** met en pause et ouvre le **menu de partie** (Reprendre, Copier le récapitulatif, Recommencer, Quitter vers le menu) ; pendant la pause, **aucun ordre** n'est accepté.
- Éliminé en Bac à sable : **spectateur** (vitesse et pause possibles), avec un bouton vers l'écran de fin.

### 2.2 Duel (1 contre 1)
- **Contre un robot** : choix de la difficulté (Facile, Normal, Difficile).
- **Contre un joueur** : d'abord par invitation d'un ami Steam, puis par file d'attente (§19, dernier jalon).
- **Forêt** : deux secteurs symétriques (symétrie centrale), rayon **11** (397 cases, ~198 par joueur).
- **Victoire** : abattre la Tourelle adverse. À 30:00, départage par les **éliminations**, puis la **production moyenne sur toute la partie** (§3.3).

### 2.3 FFA (jusqu'à 6 colonies sur la même forêt)
- **Contre des robots** : 1 joueur + 5 robots.
- **Entre joueurs** : jusqu'à 6 joueurs en ligne. La partie démarre à 6, ou après 2 min d'attente avec au moins 4 joueurs ; les places libres sont **complétées par des robots signalés comme tels**.
- **Forêt** : six secteurs identiques, rayon **17** (919 cases, ~153 par colonie).
- **Victoire** : dernier vivant ; à 30:00, départage par les **éliminations**, puis la **production moyenne sur toute la partie** (§3.3).

### 2.4 Partie personnalisée
Permet de créer **tout type de partie** : le type (Duel ou FFA), les joueurs, les robots et les paramètres de la forêt. **2** colonies (Duel), **3 ou 6** (FFA) : seuls ces nombres donnent des départs strictement équitables. Emplacements **Humain** ou **Robot** ; invitations par la **liste d'amis Steam**, avec un **code de salon** de secours. Une partie personnalisée **n'est pas classée**.

| Paramètre | Défaut | Plage |
|---|---|---|
| Taille de la forêt (rayon) | 11 (Duel) / 17 (FFA) | 5, 11, 17 ou 23 (à confirmer) |
| Graine | aléatoire | saisie libre |
| Richesse du centre par rapport au bord | ×4 | ×1 à ×8 |
| Difficulté vers le centre (PV des cases libres) | normale | faible, normale, forte |
| Vitesse de croissance (production) | ×1 | ×0,5 à ×3 |
| Ressources de départ | normales | peu, normales, beaucoup |
| Protection de départ | 2 min | 0 à 5 min |
| Événements | activés | activés ou non, un par un (Floraison, Arbre mourant) |
| Bonus du trophée | 100 % | 0 à 200 % |
| Durée maximale | 30 min | 5 à **30 min** (plafond fixe) |

### 2.5 Robots
- Les robots jouent **avec les mêmes règles et les mêmes commandes que les joueurs** : pas de triche. Ils choisissent leurs **améliorations**, leur **priorité de tir**, leurs **mutations**, leurs **capacités** et les **déplacements** de leur tourelle.
- **Profils** : *Canonnier* (dégâts et cadence d'abord), *Bâtisseur* (rendement et défense d'abord), *Conquérant* (portée et ennemis d'abord). **Seul le Conquérant déplace sa Tourelle**, vers le centre de la forêt (décidé le 4 octobre 2026). **Difficultés** : à définir au jalon G5.
- **Comportement (G3, étape 3)** : à chaque seconde, un robot prend la mutation la plus lourde pour son profil, garde sa priorité de tir habituelle ou passe à sa priorité de défense quand ses cases sont visées, désigne la Tourelle adverse dès qu'il peut la viser (Canonnier et Conquérant), lance la Salve quand il tire, le Mur sur une case attaquée et le Nuage sur les cases adverses, et achète l'amélioration au meilleur rapport poids / coût (en économisant pour elle si elle n'est pas encore payable). Les poids de chaque profil sont dans `ai/profiles/` (voir « Choix de l'étape 3 de G3, à confirmer », §17).
- Ils servent aussi à compléter les salons, à remplacer un joueur déconnecté et à équilibrer les valeurs par simulation (§18.5).

### 2.6 Règles communes
- **Modes locaux et modes en ligne isolés** : tous les modes où il n'y a que le joueur et des robots (Bac à sable, Duel et FFA contre robots, tutoriel) fonctionnent **sans Steam ni GodotSteam**. Steam ne sert qu'aux modes multijoueur. **Les parties locales ne comptent pas** : elles n'alimentent ni les statistiques ni les succès Steam et ne donnent aucune récompense cosmétique ; le **profil local** les enregistre quand même.
- **Durée maximale : 30:00**, tous modes.
- **Pause et vitesse** : uniquement en Bac à sable.
- **Résultat** : rang de partie = ordre d'élimination ; statistiques de fin (cases conquises, tourelles abattues, durée de survie, pic de production).

### 2.7 Tutoriel
Une **courte partie scénarisée (~10 min)** contre un robot passif, sur une petite forêt de Duel ; **proposée au premier lancement**, passable et rejouable (jalon G6). Étapes :

| Étape | Objectif | Ce qu'on apprend |
|---|---|---|
| 1 | Regarder la tourelle prendre 5 cases | Tir automatique, PV des cases |
| 2 | Acheter 2 améliorations | Panneau, coûts qui montent |
| 3 | Changer la priorité de tir | Priorités |
| 4 | Désigner une case à prendre | Cible prioritaire au clic |
| 5 | Atteindre 10 cases et choisir une mutation | Paliers, production qui double, mutations |
| 6 | Déplacer la tourelle d'une case | Déplacement |
| 7 | Soigner une case attaquée par le robot | Défense, soin |
| 8 | Abattre la Tourelle du robot | Élimination et trophée |

---

## 3. Déroulé d'une partie

### 3.1 Départ
- Chaque colonie démarre avec **3 cases, Tourelle comprise** : la Tourelle sur un **coin de la forêt** (le milieu exact de son secteur, zone 1), la case collée à elle **vers le centre**, et une case collée à elle **sur le bord**. Les départs des autres colonies s'en déduisent par rotation, donc tous identiques.
- **Stock de départ** : 0 (la Tourelle commence à tirer tout de suite ; les premières améliorations se paient avec la production).
- **Protection de départ : 2:00.** Pendant la protection, **aucune case adverse ne peut être visée et aucune capacité ne peut être lancée** (décision du 4 octobre 2026 pour les actions, reprise ici).

### 3.2 Frise de la partie
La partie est rythmée par des **événements scriptés** (§13), à la même heure à chaque partie.

| Temps | Événement |
|---|---|
| 2:00 | Fin de la protection de départ |
| 8:00 | **Floraison collective** |
| 12:00 | **Arbre mourant** (n° 1) |
| 16:00 | **Floraison collective** |
| 20:00 | **Arbre mourant** (n° 2) |
| 24:00 | **Floraison collective** |
| 30:00 | Fin de la partie |

Les **événements aléatoires** (Orage, Incendie, Sanglier, Festin, Nématodes) sont repoussés à plus tard (décidé le 4 octobre 2026, §17).

### 3.3 Victoire et élimination
- **Éliminé** : sa **Tourelle tombe** (PV à 0, §7.4). **Toutes ses cases redeviennent libres** (avec les PV d'une case libre de leur zone) ; la colonie qui a abattu la Tourelle reçoit un **Trophée** (§12). *Décidé le 4 octobre 2026 : remplace le transfert du territoire au tueur.*
- **Gagnant** : la dernière colonie en vie. Si deux tourelles tombent au même tick, les deux colonies sont classées entre elles par production moyenne depuis le début, puis par nombre de cases.
- **Pas de Mort subite** : la partie va jusqu'à 30:00 sans changement de règle.
- **Fin à 30:00** : les colonies encore en vie sont classées **d'abord par nombre d'éliminations**, puis par **production moyenne sur toute la partie** (total produit par leurs cases ÷ 30 min, bonus des Trophées compris), puis par nombre de cases (décidé le 4 octobre 2026 : avoir éliminé compte plus que la production). Les récompenses d'événements ne comptent pas dans la production moyenne. Éliminations et production moyenne sont affichées en direct dans le mini-classement.

---

## 4. La carte

### 4.1 Structure
- Grille d'hexagones **pointe en haut** (coordonnées axiales `q, r`), générée à partir d'une **graine de partie**.
- **Secteurs identiques**, un par colonie. Une forêt hexagonale n'est parfaitement symétrique qu'à **2, 3 ou 6 colonies** : ce sont les seuls nombres proposés.
- **Pas de brouillard** : toute la forêt est visible.

| Mode | Rayon | Cases | Cases par colonie |
|---|---|---|---|
| Duel | 11 | 397 | ~198 |
| FFA 6 | 17 | 919 | ~153 |

### 4.2 Un seul terrain : l'Humus
Toutes les cases sont de l'Humus. Elles ne diffèrent que par leur **zone**. Une case peut être **libre**, **possédée** (avec ses PV) ou **occupée par une Tourelle**.

### 4.3 Les 6 zones et la difficulté vers le centre
Six anneaux concentriques de **même épaisseur** : **2 anneaux d'hexagones par zone en Duel, 3 en FFA**. La zone 6 contient la case centrale. Plus on va vers le centre, **plus la case est riche, mais plus elle est dure à prendre**.

| Zone | Richesse | PV d'une case libre | Défense d'une case possédée |
|---|---|---|---|
| 1 (bord) | ×1,0 | ×1,0 | ×1,0 |
| 2 | ×1,5 | ×1,4 | ×1,2 |
| 3 | ×2,0 | ×2,0 | ×1,5 |
| 4 | ×2,6 | ×2,8 | ×1,8 |
| 5 | ×3,3 | ×3,8 | ×2,1 |
| 6 (Clairière) | ×4,0 | ×5,0 | ×2,5 |

Cible : une colonie moyenne atteint la zone N vers la minute 3,5 × N.

---

## 5. La Tourelle *(décidé le 4 octobre 2026)*

### 5.1 Principe
- La Tourelle est le **cœur de la colonie** : elle occupe sa case de départ (§3.1). C'est un champignon qui lance des spores, appelé **le Sporophore** dans le jeu.
- Elle **tire toute seule**, en continu. Chaque spore inflige des **dégâts** à la case visée (§6).
- Elle a ses propres **PV** : si elle tombe, la colonie est éliminée (§3.3).
- Il y a **une seule Tourelle** par colonie.

### 5.2 Portée et cibles
- La Tourelle a une **portée** : un **cercle de N cases** autour d'elle. Elle ne vise que des cases dans ce cercle.
- Dans le cercle, elle ne peut viser qu'une **case collée à mon territoire** (libre ou adverse) : le territoire reste d'un seul tenant. Elle peut aussi viser **une de mes cases blessées pour la soigner** (§7.3).
- L'amélioration **Portée** agrandit le cercle.

### 5.3 Priorité de tir
La Tourelle choisit seule sa cible selon une **priorité** que le joueur règle dans le panneau :

| Priorité | La Tourelle vise d'abord… |
|---|---|
| **Plus proche** (par défaut) | la case visable la plus proche d'elle |
| **Plus riche** | la case visable de la zone la plus riche |
| **Soigner d'abord** | mes cases blessées, puis la case la plus proche |
| **Ennemis d'abord** | les cases adverses, puis la case la plus proche |

Départage entre cases à égalité : la plus proche de la Tourelle, puis un tirage tiré de la graine. Une cible est **gardée jusqu'à sa prise** (ou jusqu'à ce qu'elle ne soit plus visable) : la Tourelle ne papillonne pas. C'est vrai aussi pour **Soigner d'abord** et **Ennemis d'abord** : si une case qui passe avant apparaît pendant une prise, la Tourelle **finit sa prise d'abord** (décidé le 4 octobre 2026).

### 5.4 Cible désignée au clic
Un **clic gauche** sur une case visable en fait la **cible prioritaire** : la Tourelle la vise **jusqu'à ce qu'elle soit prise**, puis reprend la priorité choisie. Un nouveau clic remplace la cible désignée ; un clic sur une de mes cases blessées la désigne pour le soin, jusqu'à ce qu'elle soit à pleine vie.

### 5.5 Déplacement
- La Tourelle peut **se déplacer pas à pas** : une case à la fois, vers **une de mes cases voisines** de la sienne.
- Chaque pas dure **10 s**, pendant lesquelles elle **ne tire pas**. **Pas de recharge** entre deux pas.
- Geste : touche de déplacement (**D**, modifiable) puis clic sur une de mes cases voisines ; on peut enchaîner les pas. Pendant un pas, la Tourelle garde ses PV et **reste sur sa case de départ** jusqu'à l'arrivée : c'est là qu'elle peut être visée (décidé le 4 octobre 2026). À l'arrivée, sa case de départ redevient une case normale.

---

## 6. Prendre une case

### 6.1 Cases libres
- Chaque case libre a des **PV** : base **40** × PV de sa zone (§4.3).
- Chaque spore lui retire les **dégâts** de la Tourelle. À **0 PV**, la case devient mienne, **à pleine vie** (décidé le 4 octobre 2026 ; une case adverse prise arrive à 25 %, §6.2).
- Une case libre entamée puis abandonnée **reprend ses PV** peu à peu (même régénération que les cases possédées).

### 6.2 Cases adverses
- Une case possédée a des **PV** qui dépendent de son propriétaire (§7). Mes spores lui retirent mes dégâts ; à 0 PV, elle passe à moi, **avec 25 % de ses PV max**.
- Son propriétaire peut la **soigner** en la visant avec sa propre Tourelle (§7.3), et elle **se régénère** seule.
- La prise est donc une **course** entre mes dégâts et sa défense (PV, régénération, soin).

### 6.3 Cadence et dégâts
- **Tourelle de départ** : 1 spore par seconde, **10 dégâts**, portée **3**.
- La simulation avance d'**1 tick par seconde** : une cadence de 2,5 tirs/s donne 2 ou 3 tirs selon le tick (reste cumulé), toujours de façon déterministe. L'animation des spores est interpolée à l'écran.

---

## 7. Défense

### 7.1 PV d'une case possédée
PV max = base **40** × défense de la zone (§4.3) × (1 + **15 %** par voisine possédée, la Cohésion) × améliorations de défense × mutations.

### 7.2 Régénération
Chaque case possédée **regagne ses PV** seule : 2 % de ses PV max par seconde, plus l'amélioration **Régénération**.

### 7.3 Soin par la Tourelle
Ma Tourelle peut **tirer sur une de mes cases** (à portée) pour la **soigner** : chaque spore lui rend **50 %** de mes dégâts, plus l'amélioration **Soin**. C'est la priorité **Soigner d'abord** ou un clic qui l'y envoie.

### 7.4 La Tourelle
PV de la Tourelle = **400** (10 × les PV de base d'une case, 40) : seules l'amélioration **Écorce du Sporophore** et la mutation *Blindé* les augmentent (décidé le 4 octobre 2026 : ni la Cohésion ni l'amélioration PV des cases). Elle se régénère comme une case. Une Tourelle ne peut être visée que si elle est **collée au territoire** de l'attaquant et **à sa portée**, comme toute case.

---

## 8. Ressources et croissance incrémentale

### 8.1 Ressources
| Ressource | Rôle | Source |
|---|---|---|
| **Nutriments** | Achat des améliorations | Toutes mes cases |
| **Enzymes** | Capacités actives (§11) | **Paliers de colonie** (un lot à chaque palier atteint, décidé le 4 octobre 2026) |
| **Biomasse** | Total des nutriments produits : départage à 30:00 et statistiques | Production |

- **Pas de plafond de stock** : tout se dépense en améliorations.
- Lots d'Enzymes : 20 au palier 1, puis 40, 60, 80, 100 et 120. Un palier perdu puis retrouvé ne redonne pas son lot.

### 8.2 Production
Une case de zone 1 rapporte **≈ 3,33 nutriments/s**, multipliée par la **richesse de sa zone**, la **Cohésion** (+5 % par voisine possédée, +30 % au plus), les **paliers**, l'**Armillaire** (×1,00 → ×1,25 sur 30 min) et les événements. Les multiplicateurs se **multiplient** entre eux.

### 8.3 Paliers de colonie
Quand le **nombre de cases** franchit un seuil, **la production de la colonie double**, la colonie reçoit son **lot d'Enzymes** et le joueur **choisit une mutation** (§10) :

| Palier | Cases | Production | Débloque |
|---|---|---|---|
| Départ | 3 | ×1 | Dégâts, Cadence, Portée, Rendement |
| 1 | 5 | ×2 | Régénération, Soin, capacité **Salve** |
| 2 | 10 | ×4 | Spores par tir, PV des cases |
| 3 | 20 | ×8 | Éclaboussure, capacité **Mur de mycélium** |
| 4 | 40 | ×16 | Critique, Écorce du Sporophore |
| 5 | 80 | ×32 | Rebond, capacité **Nuage toxique** |
| 6 | 160 | ×64 | (le prestige du conquérant) |

- Seules les cases possédées comptent, Tourelle comprise.
- Le multiplicateur suit le **nombre de cases actuel** : perdre des cases peut faire perdre un palier. Les niveaux déjà achetés d'une amélioration dont le palier est perdu **restent actifs** ; on ne peut simplement plus en acheter avant de retrouver le palier.

### 8.4 Ordre de grandeur
Cible : **~10 nutriments/s au départ → 1e5 à 1e6 nutriments/s en fin de partie**. Les nombres s'écrivent avec des suffixes (K, M, B, T).

### 8.5 Retour visuel (le « boum »)
- La Tourelle **pulse à chaque tir** ; les spores volent jusqu'à leur case ; une case prise **éclot** à la couleur de la colonie.
- Au franchissement d'un **palier** : message « Palier ×2 ! », la Tourelle grossit un instant, puis la carte des mutations s'ouvre.
- Les **compteurs défilent**. La **courbe de production**, absente des maquettes validées, n'est plus affichée dans le panneau depuis l'étape 2 de G3 (place des améliorations) : elle reviendra sur l'écran de résultats (G4), à confirmer.
- La Tourelle **change d'aspect** avec ses améliorations (plus grande, plus de chapeaux, plus de spores), pour que sa puissance se lise sur la carte.

---

## 9. Le panneau d'améliorations *(décidé le 4 octobre 2026)*

### 9.1 Principe
- Le côté incrémental est un **panneau à droite de l'écran** ; la **carte est à gauche**.
- On y achète des **améliorations à niveaux** avec les nutriments : dégâts de la tourelle, vitesse d'attaque, etc.
- Coût d'un niveau = coût de base × **1,15 ^ niveau** ; chaque niveau ajoute le même effet (pas de jalons tous les 25 niveaux, idée non retenue). Bouton **×1 / ×10 / Max** pour acheter plusieurs niveaux d'un coup.

### 9.2 Catalogue

| Amélioration | Effet par niveau | Coût de base | Palier |
|---|---|---|---|
| **Dégâts** | +25 % des dégâts de base | 1 U | Départ |
| **Cadence** | +10 % de tirs par seconde | 2 U | Départ |
| **Portée** | +1 case de rayon (10 niveaux au plus) | 10 U, ×3 par niveau | Départ |
| **Rendement** | +10 % de production de mes cases | 2 U | Départ |
| **Régénération** | +1 % des PV max par seconde | 5 U | 1 |
| **Soin** | +25 % de soin par spore | 5 U | 1 |
| **Spores par tir** | +1 cible visée à chaque tir (5 au plus) : les spores en plus visent **d'autres cases**, dans l'ordre de la priorité, chacune gardée jusqu'à sa prise (décidé le 4 octobre 2026) | 50 U, ×4 par niveau | 2 |
| **PV des cases** | +20 % des PV max de mes cases | 20 U | 2 |
| **Éclaboussure** | +10 % des dégâts aussi infligés aux voisines de la case touchée | 100 U | 3 |
| **Critique** | +5 % de chance de dégâts ×3 (50 % au plus) | 300 U | 4 |
| **Écorce du Sporophore** | +25 % des PV de la Tourelle | 300 U | 4 |
| **Rebond** | quand une spore prend une case, +1 case voisine touchée avec le reste des dégâts | 1 000 U | 5 |

U = 30 nutriments, comme avant.

---

## 10. Mutations au palier *(décidé le 4 octobre 2026)*

À chaque **palier atteint pour la première fois**, le joueur **choisit 1 mutation parmi 3** tirées au hasard (graine). Elles sont permanentes pour la partie.

Liste (15 mutations ; les 3 proposées sont tirées sans remise parmi celles pas encore prises). **La partie continue pendant le choix**, sans limite de temps. Si un nouveau palier arrive avant le choix, **les choix s'empilent** : on choisit le premier, puis les 3 cartes du suivant s'affichent (décidé le 4 octobre 2026).
- *Spores lourdes* : dégâts ×1,5, cadence ×0,8.
- *Spores légères* : cadence ×1,4, dégâts ×0,8.
- *Hyphes longues* : portée +1.
- *Cohésion* : la Cohésion compte double (production et PV).
- *Mycélium tenace* : régénération ×2.
- *Racines profondes* : production des zones 4 à 6 ×1,3.
- *Pionnier* : les cases libres prennent ×1,5 dégâts.
- *Prédateur* : les cases adverses prennent ×1,3 dégâts.
- *Guérisseur* : soin ×2.
- *Sporée* : +1 spore par tir.
- *Glande* : +50 % d'Enzymes aux prochains paliers.
- *Rapide* : un pas de la Tourelle dure 5 s.
- *Blindé* : PV de la Tourelle ×2.
- *Toxique* : les cases touchées perdent leur régénération pendant 5 s.
- *Avare* : améliorations −15 % de coût.

---

## 11. Capacités actives *(décidé le 4 octobre 2026)*

Boutons à **recharge**, payés en **Enzymes**, débloqués par les paliers (§8.3). Aucune n'est utilisable pendant la protection de départ.

| Capacité | Coût | Recharge | Effet |
|---|---|---|---|
| **Salve** | 20 Enzymes | 90 s | Cadence ×5 pendant 10 s |
| **Mur de mycélium** | 40 Enzymes | 3 min | Mes cases à 3 cases ou moins d'une case choisie ne perdent aucun PV pendant 15 s |
| **Nuage toxique** | 60 Enzymes | 3 min | Une case choisie à portée et ses voisines : dégâts égaux à 20 tirs, et plus de régénération pendant 30 s |

---

## 12. Conflit

- **Aucune pression automatique** au contact : on prend une case adverse en la visant (priorité ou clic), on la garde en la soignant et grâce à sa défense.
- **Territoire coupé** : quand une prise adverse coupe mon territoire, mes cases qui ne sont plus reliées à ma Tourelle **redeviennent libres** tout de suite (décidé le 4 octobre 2026). Toutes les cases d'une colonie produisent donc.
- On ne vise que des cases **collées à son territoire** et **à portée**.
- Pas d'attaque avant **2:00**.
- **Élimination** *(décidé le 4 octobre 2026)* : quand une Tourelle tombe, **toutes les cases de la colonie redeviennent libres**. La colonie qui l'a abattue reçoit un **Trophée** :
  - **production de nutriments +25 %** jusqu'à la fin de la partie, **cumulable** (2 Trophées = +50 %) ; cette production compte dans la production moyenne ;
  - **+100 Enzymes** d'un coup ;
  - une ligne dans les statistiques et le profil.
- **Départage à 30:00** : les éliminations comptent **avant** la production moyenne (§3.3).
- La colonie qui abat la Tourelle est celle dont le tir la fait tomber à 0 PV.
- **Pas de seconde vie** : une Tourelle abattue élimine la colonie.
- Pas de plancher de cases ni de protection contre un joueur plus petit.

---

## 13. Événements

*Décidé le 4 octobre 2026 : seulement les deux événements scriptés ; les événements aléatoires sont des idées pour plus tard (§17).* Ils sont annoncés **20 s avant** et figurent sur la frise. Chacun peut être activé ou non dans une partie personnalisée et dans le Bac à sable.

- **Floraison collective** (8:00, 16:00, 24:00) : production **×2** pendant 30 s pour toutes les colonies.
- **Arbre mourant** (12:00 et 20:00) : 7 cases libres d'un tenant dans la zone du moment, avec **beaucoup de PV** (valeur à fixer en G4) ; chaque colonie qui le vise y inflige ses dégâts. Quand il tombe, récompense en nutriments (≈ 2 min de production moyenne) et 100 Enzymes **au prorata des dégâts**, +25 % au meilleur ; ses 7 cases redeviennent libres. Disparaît au bout de 3 min.

**Zone du moment** : pour chaque colonie, sa zone la plus au centre ; on prend la plus fréquente (à égalité, la plus centrale) ; seul en Bac à sable, sa zone la plus avancée.

---

## 14. Social, déconnexion, récompenses

### 14.1 Chat
Chat de partie (en ligne) ; amis et messages privés via Steam ; sourdine et signalement, modération minimale.

### 14.2 Déconnexion et abandon
- **Un joueur se déconnecte** : **pilote automatique** (sa Tourelle continue de tirer avec sa priorité, sans achat), reprise possible à tout moment ; après 3 min sans retour, un robot en prend le contrôle.
- **L'hôte se déconnecte** : dans la première version, **la partie s'arrête** pour tout le monde ; elle n'est pas comptée dans les statistiques des autres joueurs, et l'hôte qui quitte volontairement prend une défaite. **Migration d'hôte** prévue plus tard.

### 14.3 Pactes (idée pour plus tard)
À étudier **après** la version en ligne.

### 14.4 Spectateur et replay
Un éliminé peut **suivre n'importe quelle colonie** ; la partie est enregistrée (graine et commandes) et se rejoue en **timelapse**.

### 14.5 Récompenses
Cosmétiques gagnés en jouant (titres, couleurs de réseau, apparences de Tourelle, effets de spores), historique des parties, statistiques par mode. **Aucune boutique** en jeu ; modèle économique sur Steam (gratuit ou payant) **pas encore décidé**. Trophées et paliers peuvent devenir des **succès Steam**.

---

## 15. Formules de base (à équilibrer)

```
production_case    = rendement × richesse_zone × (1 + 0,05 × voisines) × modif_événement
production_totale  = Σ production_case (cases reliées) × 2 ^ paliers × bonus_souche(t)
                     × (1 + 0,10 × niveau_Rendement) × (1 + 0,25 × trophées) × mutations
bonus_souche(t)    = 1,00 + 0,25 × t / 30 min
pv_case_libre      = 40 × pv_zone
pv_case_possédée   = 40 × défense_zone × (1 + 0,15 × voisines) × (1 + 0,20 × niveau_PV) × mutations
régénération       = pv_max × (2 % + 1 % × niveau_Régénération) par seconde
dégâts_tir         = 10 × (1 + 0,25 × niveau_Dégâts) × mutations (× 3 si critique)
tirs_par_seconde   = 1 × (1 + 0,10 × niveau_Cadence) × mutations
soin_tir           = dégâts_tir × 50 % × (1 + 0,25 × niveau_Soin)
coût_niveau        = coût_base × 1,15 ^ niveau
```
Chiffres décidés le 4 octobre 2026, comme points de départ à simuler.

---

## 16. Interface et direction artistique

### 16.1 Écrans
Menu principal, **mode Duel**, **mode FFA**, **salon de partie personnalisée**, **partie** (carte à gauche, panneau à droite), spectateur, résultats, profil, **paramètres**, et l'**interface d'administration** cachée (§18.4).

### 16.2 Écran de partie *(maquettes validées le 4 octobre 2026 : canevas « Mycélium — maquettes de la Tourelle (G3) »)*
- **Carte (à gauche, ~62 % de la largeur)** : la forêt, le cercle de portée de ma Tourelle (pointillé), les spores en vol, la cible en cours ; en haut à gauche, la **frise** (horloge, prochains événements ; jusqu'à G4, horloge et fin de la protection de départ seulement, décidé le 4 octobre 2026 ; en Bac à sable, boutons pause, vitesse et récapitulatif) ; en haut à droite, le **mini-classement** (colonies en vie, cases, éliminations, production moyenne) ; en bas à gauche, le **journal et les alertes**, avec un rappel des gestes (clic : viser, D : déplacer).
- **Panneau (à droite, ~38 %)**, de haut en bas :
  1. **Ressources** : nutriments (qui défilent) et production, Enzymes, Biomasse, barre du prochain palier ;
  2. **Tourelle** : PV, dégâts, cadence, portée, spores par tir, et les 4 boutons de **priorité de tir** ;
  3. **Améliorations**, en onglets *Attaque*, *Défense*, *Économie*, avec le niveau, l'effet (avant → après), le coût et le choix ×1 / ×10 / Max ; une amélioration verrouillée indique le palier requis ;
  4. **Capacités** : boutons ronds avec recharge, coût et touche.
- **Mutation** : au palier, trois cartes s'affichent sur la carte assombrie (touches 1 à 3) ; la partie **ne s'arrête pas** pendant le choix ; les mutations prises sont listées dans le panneau (une pastille par mutation, palier et effet dans l'info-bulle). Un **bouton avec un œil** cache les cartes pour voir la carte ; un bouton du panneau (« Choisir une mutation ») les rouvre (décidé le 4 octobre 2026).
- **Gestes des capacités** : la Salve part tout de suite ; le Mur et le Nuage attendent un clic sur une case (touche ou bouton, puis clic), Échap ou clic droit annulent.

### 16.3 Direction artistique « Pastille ronde »
- **Thème clair** : fond crème `#FBF6EE`, cartes `#FFFDF8`, texte prune `#3B3340`, texte secondaire `#6E6475`, filets `#EADFD0`. Polices **Fredoka** (titres) et **Nunito** (texte).
- **Un seul terrain** : l'Humus, une bulle ronde. En thème clair, chaque bulle prend la couleur du fond de sa zone assombrie de 12 % (contraste identique dans toutes les zones) ; en thème sombre, `#6F5E50`. Zones teintées de `#F6EEE2` (bord) à `#E0C7AE` (centre), chacune entourée d'un trait noir net `#2B2430`, estompé sur les colonies.
- **12 couleurs de colonie** (Lavande, Corail, Menthe, Ciel, Bonbon, Citron, Pomme, Abricot, Prune, Lagon, Framboise, Indigo) ; en Duel et FFA, on garde des couleurs **très différentes entre voisines** (ordre à valider pour 2 et 6 colonies). Chaque couleur a une teinte principale (cases) et une teinte foncée (Tourelle, contours) :

| Couleur | Principale | Foncée | Couleur | Principale | Foncée |
|---|---|---|---|---|---|
| Lavande | `#8F7CF2` | `#563BE1` | Pomme | `#6FBC46` | `#4D7D33` |
| Corail | `#F58C85` | `#E64D43` | Abricot | `#F5C983` | `#E6A641` |
| Menthe | `#5ACEA8` | `#379F7D` | Prune | `#A35DA8` | `#6F4172` |
| Ciel | `#78BCF1` | `#3796E0` | Lagon | `#3EA8A7` | `#2B6968` |
| Bonbon | `#F691C3` | `#E74E9A` | Framboise | `#E0516C` | `#B62A44` |
| Citron | `#E7DF39` | `#B0A91E` | Indigo | `#4042D4` | `#2A2B99` |
- Une colonie se dessine comme **une seule tache arrondie**. *Version simple d'abord* : cases colorées une par une.
- **La Tourelle** : un champignon avec deux petits yeux, dans la teinte foncée de la colonie, qui grossit et se pare en trois stades **selon le palier** (décidé le 4 octobre 2026) : chapeau uni (paliers 0 à 2), chapeau tacheté (paliers 3 et 4), petits chapeaux au pied (paliers 5 et 6).
- **États d'une case** (maquettes validées) : libre (couleur de la zone) ; entamée (se remplit de la couleur de l'attaquant, comme une jauge circulaire) ; visée (contour plein) ; cible désignée (contour pointillé et halo) ; à moi ; blessée (pâlit, contour de la couleur de l'attaquant) ; soignée (halo de ma couleur) ; hors de ma portée (atténuée).
- **Spores** : petites boules de la couleur de la colonie, en arc de la Tourelle à la case visée.

### 16.4 Mode sombre
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

### 16.5 Caméra et commandes
- **Déplacement** : clic droit maintenu et souris contre les **bords de l'écran** ; **zoom** à la molette, centré sur la souris.
- **Clic gauche** : désigne une case comme cible prioritaire (§5.4) ; avec la touche de déplacement, choisit le pas de la Tourelle (§5.5).
- **Raccourcis par défaut** : **Espace** recentre sur la Tourelle ; **P** pause (Bac à sable) ; **Échap** annule le geste en cours ou ouvre le menu de partie ; **D** déplacer la Tourelle ; **Q, W, E** capacités ; **1 à 3** choisissent une mutation quand les cartes sont affichées. **Pas de touches pour les priorités de tir** (souris seulement, décidé le 4 octobre 2026). Tous modifiables dans les Paramètres ; une touche ne sert qu'à une action ; un bouton remet les touches par défaut.

### 16.6 Paramètres
Affichage (plein écran, fenêtré, résolution, **thème clair / sombre / système**), audio, langue (français et anglais), commandes (raccourcis modifiables), accessibilité (taille de l'interface, palette adaptée au daltonisme).

---

## 17. Décisions du 4 octobre 2026

Toutes les propositions du brouillon ont été tranchées en QCM avec le propriétaire le 4 octobre 2026 et sont écrites plus haut. En résumé, ce qui diffère des propositions : à l'**élimination**, les cases de l'éliminé **redeviennent libres** (pas de transfert du territoire, pas de butin ni d'îlots) et le tueur reçoit un **Trophée** (+25 % de production cumulable, +100 Enzymes) ; à 30:00, **les éliminations départagent avant la production moyenne** ; seuls les **événements scriptés** restent (Floraison, Arbre mourant) ; l'**affrontement** arrive **dès G3**.

Deux petits points repris du brouillon sans question dédiée, à signaler si besoin : un nouveau clic remplace la cible désignée ; la colonie qui abat une Tourelle est celle dont le tir la fait tomber à 0 PV.

### Décisions de l'étape 1 de G3 (4 octobre 2026, QCM)
Le code de G1 et G2 qui ne sert plus est supprimé dès l'étape 1, avec un affichage provisoire du Bac à sable jusqu'à l'étape 2 ; cases coupées de la Tourelle : libres (§12) ; case libre prise : pleine vie (§6.1) ; la Tourelle finit sa prise avant de changer de cible (§5.3) ; spores en plus : d'autres cases (§9.2) ; pendant un pas, la Tourelle est visée sur sa case de départ (§5.5) ; choix de mutations empilés (§10) ; PV de la Tourelle : 400 fixes (§7.4).

### Décisions de l'étape 2 de G3 (4 octobre 2026, QCM)
Pas de touches pour les priorités de tir, 1 à 3 pour les cartes de mutation (§16.5) ; cartes de mutation cachées par un bouton œil et rouvertes depuis le panneau (§16.2) ; frise : horloge et fin de la protection jusqu'à G4 (§16.2) ; stades de la Tourelle liés au palier (§16.3).

### Décisions de l'étape 3 de G3 (4 octobre 2026, QCM)
Bac à sable : un profil de robot par secteur libre (§2.1 bis) ; seul le Conquérant déplace sa Tourelle (§2.5) ; panneau de simulations : une série = une composition de forêt (un robot par secteur), mesures par secteur (§18.5).

### Choix de l'étape 3 de G3, à confirmer
Points de comportement des robots et du panneau tranchés pour écrire le code, sans question dédiée (tous réglables dans `ai/profiles/` ou faciles à changer) :
1. Priorités de tir : Canonnier *Plus riche*, puis *Ennemis d'abord* quand ses cases sont visées ; Bâtisseur *Plus riche*, puis *Soigner d'abord* quand ses cases sont visées ; Conquérant toujours *Ennemis d'abord*. La priorité de défense est gardée au moins 10 s.
2. Canonnier et Conquérant désignent la Tourelle adverse la plus proche dès qu'elle est visable ; le Bâtisseur ne désigne jamais de cible.
3. Le Conquérant ne fait un pas que vers une de ses cases plus proche du centre, entourée d'au moins 4 de ses cases, avec 20 s d'attente entre deux pas.
4. Capacités, pour les trois profils : Salve dès qu'elle est prête et que la Tourelle a une cible ; Mur sur la case attaquée la plus proche de la Tourelle ; Nuage sur la case adverse à portée dont la zone touche une Tourelle adverse, sinon le plus de cases adverses (jamais sur des cases libres).
5. Améliorations : poids par amélioration (Canonnier : Dégâts et Cadence 10 ; Bâtisseur : Rendement 10, défense 5–6 ; Conquérant : Portée 10, Dégâts et Cadence 6) ; mutations : poids par mutation (par exemple Spores lourdes et légères pour le Canonnier, Cohésion pour le Bâtisseur, Hyphes longues et Prédateur pour le Conquérant).
6. Bac à sable : aucun adversaire par défaut.
7. Panneau : la partie est regardée sur la carte en rejouant les robots (même graine, mêmes réglages : la partie est identique), sans enregistrement gardé en mémoire ; en spectateur, pas de « Toi » : chaque colonie garde le nom de sa couleur.

### Choix de l'étape 1 de G3, à confirmer
Points de règle que l'étape 1 a dû trancher pour écrire le code, sans question dédiée :
1. S'il y a moins de cibles visables que de spores, les spores en trop frappent la première cible.
2. Changer de priorité lâche les cibles gardées (la cible désignée au clic reste).
3. La Tourelle ne vise jamais sa propre case (pas de soin de la Tourelle par elle-même).
4. Éclaboussure, Rebond et Nuage toxique abîment aussi les cases qui ne touchent pas mon territoire, mais ne peuvent pas les prendre (elles restent à 1 PV au moins) ; de même, une Tourelle qui ne touche pas mon territoire ne peut pas tomber.
5. Un pas est annulé si la case d'arrivée n'est plus à moi ; à l'arrivée, la case de départ est à pleine vie.
6. Les colonies tirent l'une après l'autre ; la première change à chaque tick, pour qu'aucune ne soit avantagée sur une case disputée.
7. Le Mur de mycélium protège mes cases (Tourelle comprise) autour de n'importe quelle case choisie ; le Nuage toxique vise une case à portée, même sans toucher mon territoire.
8. ×10 achète jusqu'à 10 niveaux tant qu'ils sont payables (refusé seulement si aucun ne l'est).
9. La mutation *Cohésion* double le bonus par voisine et son plafond (production +60 % au plus).
10. Améliorations et capacités suivent le palier actuel (comme les améliorations, §8.3).
11. Onglets du panneau : Attaque (Dégâts, Cadence, Portée, Spores, Éclaboussure, Critique, Rebond), Défense (Régénération, Soin, PV des cases, Écorce), Économie (Rendement).

### Questions ouvertes
- **Triche de l'hôte** : la vérification par empreinte suffit-elle pour un classement du Duel ?
- **Statistiques d'administration** : statistiques globales Steam, ou petit service de collecte ?

### À simuler
- Atteint-on la zone N vers la minute 3,5 × N ? Combien de cases par minute en début, milieu et fin de partie ?
- Courbe de production : facteur de 10 000 à 100 000 sur 30 min.
- Équilibre attaque / défense : peut-on abattre une Tourelle, ou tout se fige-t-il à la frontière ?
- Le soin rend-il toute prise impossible entre deux colonies de même niveau ?
- Trophées : boule de neige en FFA ? Les cases libérées par une élimination profitent-elles surtout au tueur ?
- Nombre d'éliminations avant 30:00 en Duel et en FFA.

### Idées pour plus tard
Autres terrains et souches, pactes, mode par équipes, forêts thématiques, classement du Duel, jalons d'amélioration tous les 25 niveaux, spore errante (îlots lointains), tourelles-relais, **événements aléatoires** (Orage, Incendie, Sanglier, Festin, Nématodes : repoussés le 4 octobre 2026).

---

## 18. Aspects techniques (Godot)

### 18.1 Cible et moteur
- **Godot 4.6** (épinglé sur 4.6.3), **GDScript typé** ; la simulation est isolée dans un module pour pouvoir passer plus tard en C# ou GDExtension si le profilage l'exige.
- **Cible : un exécutable Windows (.exe)**, nommé **`Mycelium.exe`**, nom affiché **« Mycelium : Last Colony »**. Préréglage d'export « Windows Desktop » (64 bits). Interface en 1920×1080 de référence, minimum 1280×720, **souris et clavier** (pas de tactile). Les autres plateformes viendront plus tard.
- **Moteur de rendu : Compatibilité** (OpenGL 3), pour tourner sur les PC les plus modestes.
- **Premier lancement** : fenêtre **maximisée** ; langue **du système** (français si Windows est en français, sinon anglais).
- **Icône** : un champignon provisoire dans la DA (la Tourelle avec ses deux yeux), à remplacer plus tard.
- **Distribution : Steam** (Steam Direct). Intégration Steamworks via l'extension **GodotSteam** : comptes, amis, invitations, salons, succès.
- **Tests multijoueur avant la sortie** : GodotSteam est utilisé avec l'**App ID 480 (« Spacewar »)**, l'application de test de Valve, pour tester le jeu en ligne entre amis sans payer le Steam Direct Fee (100 $ par jeu) ni créer de page Steam. Chaque testeur lance Steam puis le `.exe` de la version GitHub ; un fichier `steam_appid.txt` contenant `480` est placé à côté de l'exécutable de test (jamais dans l'export final).
  - **Limites** : tout le monde apparaît « en train de jouer à Spacewar » ; pas de succès ni de statistiques globales Steam (l'écran de statistiques de l'interface d'administration ne peut donc pas être validé avec 480) ; les salons de l'App ID 480 sont partagés avec d'autres développeurs, donc chaque salon porte une **clé de métadonnée propre au jeu et à sa version**, et la recherche de salons filtre dessus.
  - **App ID réel** : il remplace 480 dès que la page Steam existe. L'App ID est une **valeur de configuration**, jamais écrite en dur dans le code.
- Configuration et profil enregistrés dans `user://` (thème, résolution, langue, raccourcis, préréglages de parties).

### 18.2 Architecture
- **Simulation autoritaire intégrée** : une seule simulation fait foi ; les joueurs envoient des **commandes** qu'elle valide : **acheter une amélioration**, **régler la priorité de tir**, **désigner une cible**, **déplacer la Tourelle**, **choisir une mutation**, **lancer une capacité**.
- **Solo (robots)** : la simulation tourne **dans l'exécutable**, sans réseau.
- **En ligne : hébergé par un joueur.** Pas de serveur à nous : l'**hôte** fait tourner la simulation, les autres s'y connectent par **Steam Networking Sockets** (relais Steam), via le `MultiplayerPeer` de GodotSteam. Hôte : le créateur du salon en partie personnalisée ; pour le Duel et le FFA publics, le propriétaire du salon Steam formé par la file d'attente.
- **Simulation à pas fixe : 1 tick par seconde** ; interpolation côté client pour l'animation (dont le vol des spores). L'hôte envoie les **différences** par tick.
- **Steam** fournit l'identité des joueurs, la liste d'amis, les invitations, les salons et la file d'attente. Aucun système de comptes à développer.
- **Triche de l'hôte** : la simulation est **déterministe** ; chaque client la rejoue à partir des commandes et compare une **empreinte de l'état** à chaque tick ; un écart arrête la partie.
- **Replay** : graine + commandes, rejeu déterministe.
- Le document d'architecture sera mis à jour avec le premier jalon de la Tourelle (systèmes, commandes, robots).

### 18.3 Données et rendu
- État de la carte en **tableaux compacts** (propriétaire, PV, zone, cible en cours…). Quelques centaines de cases : coût négligeable.
- Cases-bulles en `MultiMeshInstance2D` ; spores en particules ou en `MultiMesh` interpolés ; thème clair/sombre par deux ressources `Theme`.
- Objectif : **60 images/s** sur un PC modeste.

### 18.4 Interface d'administration (lecture seule)
Écran **caché** du jeu, réservé à une liste de **comptes Steam autorisés**. Sans serveur à nous, l'interface lit uniquement ce que Steam expose ; ces données sont publiques ou agrégées, donc le contrôle d'accès dans le client suffit. Elle ne sert **qu'à observer** :
- **Parties en ligne** : la liste des **salons Steam** du jeu. L'hôte tient à jour les métadonnées de son salon (mode, durée écoulée, colonies vivantes sur total, joueurs et robots, prochain événement).
- **Joueurs en ligne** : les membres de ces salons (pseudo, mode, en attente ou en partie). Le nombre total de joueurs en jeu vient de Steam ; un joueur seul dans les menus n'est **pas visible** individuellement.
- **Statistiques du jeu** : **statistiques globales Steam** (valeurs additionnées sur tous les joueurs) : parties jouées par mode, victoires, éliminations, durée de jeu, parties finies par élimination ou au temps, victoires contre robots par difficulté, déconnexions d'hôte. Les moyennes et répartitions fines (rangs, temps d'attente) demanderaient un petit service de collecte, **non prévu** pour l'instant.

Aucune action de modification (pas d'arrêt de partie, pas de ressources, pas de sauts de temps). Pour **équilibrer** le jeu, les simulations accélérées passent par le **panneau de simulations** (§18.5), pas par cette interface.

### 18.5 Panneau de simulations (développement)
Outil d'équilibrage disponible **uniquement quand le jeu est lancé depuis l'éditeur Godot** : il n'existe dans aucun `.exe` livré. Il lance des lots de parties de robots sans affichage, en temps accéléré (lancement simple ou **balayage** d'une valeur), avec les **réglages du Bac à sable**. Ses robots sont **Canonnier**, **Bâtisseur** et **Conquérant** (§2.5), qui servent aussi d'adversaires dans le Bac à sable ; le panneau joue des parties à **plusieurs robots** sur la même forêt.
- **Séries** *(décidé le 4 octobre 2026)* : une série = une **composition de forêt** (le robot de chaque secteur, ou aucun), jouée N fois avec des graines qui se suivent ; un balayage fait une série par valeur et par composition. Les compositions sont gardées d'une session à l'autre, une liste pour le Duel et une pour le FFA.
- **Mesures** *(par secteur, décidé le 4 octobre 2026)* : pour la partie, éliminations, minute de la première, parties finies au temps et minute de fin ; pour **chaque secteur**, victoires, rang final, élimination et sa minute, Trophées, cases à la fin, cases prises (au total et par minute), palier, production finale et record, Biomasse, minute d'arrivée dans chaque zone et à chaque palier, niveau de chaque amélioration. Chaque case donne moyenne, minimum, maximum et écart type.
- **Résultats** : un tableau par série (une colonne par secteur), courbes par minute (production en échelle log, ou cases), export **CSV** (une ligne par série, secteur et mesure, avec la production et les cases de chaque minute), et une partie **regardée sur la carte** en spectateur (×1, ×4, ×16, ×64, pause), puis retour au panneau.

---

## 19. Feuille de route *(décidée le 4 octobre 2026)*

| Jalon | Contenu |
|---|---|
| **G0 : Fondations** *(livré, 0.1.0)* | Dépôt Godot, vérification automatique, versions GitHub ; carte hex (6 zones) en Duel et FFA, rendu, caméra ; menu principal ; Paramètres |
| **G1 : Solo économie** *(livré, 0.2.0)* | Production, Cohésion, paliers, retours visuels, Bac à sable (réglages, récapitulatif, pause, vitesse), HUD, rejeu, panneau de simulations |
| **G2** *(livré, 0.3.0)* | Remplacé par G3 |
| **G3 : Le Sporophore et l'affrontement** *(livré, 0.4.0 : étapes 1 et 2 le 4 octobre 2026, étape 3 le 5 octobre 2026)* | **Suppression** du code de G1 et G2 qui ne sert plus ; Tourelle (tir automatique, portée, priorités, cible au clic, déplacement pas à pas) ; PV, régénération et soin ; panneau d'améliorations à droite ; paliers avec Enzymes et mutations ; capacités ; Armillaire ; **affrontement entre Tourelles, élimination et Trophée** ; écran carte + panneau ; Bac à sable avec adversaires robots. Maquettes **validées le 4 octobre 2026**. Livré en **trois étapes** : 1) simulation et tests ; 2) affichage, panneau et Bac à sable ; 3) robots Canonnier, Bâtisseur et Conquérant (adversaires du Bac à sable et panneau de simulations à plusieurs robots) ; version **0.4.0** |
| **G4 : Événements et fin de partie** | Floraison collective et Arbre mourant, frise, journal et alertes complets, écran de résultats, spectateur après élimination ; version **0.5.0** |
| **G5 : Duel et FFA contre robots** | Menus, robots de jeu (3 difficultés, profils), résultats |
| **G6 : Habillage et bêta solo** | Tutoriel (8 étapes, §2.7), audio, profil et statistiques, traduction, essais avec de vrais joueurs (sans Steam) |
| **G7 : Multijoueur** | Étape 1 : tests entre amis avec l'App ID 480 (Steam, salons, invitations, relais, hébergement par un joueur, empreinte, déconnexion). Étape 2 : file d'attente, FFA et Duel entre joueurs, partie personnalisée complète, chat, interface d'administration |

**Hors feuille de route** : page Steam, App ID réel (Steam Direct, 100 $), succès et Steam Playtest, dès que le propriétaire décide de payer.

La simulation ne reçoit que des **commandes** depuis G1 : le passage en ligne consiste surtout à la faire tourner chez l'hôte et à brancher le réseau Steam.

---

## 20. Questions en attente des jalons suivants

Elles seront posées sous forme de QCM au début du jalon concerné.

### G5 : Duel et FFA contre robots
1. Profils des robots : les robots de jeu reprennent-ils les profils Canonnier, Bâtisseur et Conquérant du panneau de simulations (§2.5, §18.5) ?
2. Valeurs des difficultés Facile, Normal, Difficile (délai de réaction, part d'erreurs, profondeur d'évaluation, qualité du choix des améliorations, des priorités et des cibles).
3. « Mêmes limites qu'un joueur » : nombre maximal de commandes par seconde pour un robot ?
4. FFA contre robots : une difficulté pour tous ou une par robot (« mélange ») ? Profils choisis ou tirés au hasard ?
5. Secteur et couleur du joueur en Duel et en FFA : choisis ou tirés au hasard ? Ordre des couleurs pour 2 et 6 colonies (daltonisme compris) ?
6. Quitter une partie en cours : défaite enregistrée ? Confirmation demandée ?
7. Éliminé en FFA contre robots, sans accélération possible : on attend la fin en spectateur ou on quitte avec son rang ?
8. Écran de résultats : contenu exact (rang, statistiques, courbe de production, graine publiée) et boutons (rejouer, menu, revoir la partie).
9. Replay en timelapse (§14.4) : dans quel jalon ?
10. Robots dans le Bac à sable : leur ajoute-t-on une difficulté ?
11. Panneau de simulations : ajoute-t-on d'autres mesures de combat (éliminations avant 26:00, effet des Trophées, mutations prises) ?

### G6 : Habillage et bêta solo
1. Tutoriel : quelle forêt (« petite forêt de Duel » : rayon 5 ?) ? Faut-il d'autres étapes que les 8 du §2.7 ?
2. Audio : style de la musique et des bruitages ; qui les produit (banques libres de droits, compositeur, autre) et sous quelle licence ?
3. Profil et statistiques : enregistrés sur le PC (`user://`), liés au compte Steam ? Sauvegarde Steam Cloud ?
4. Langues : français et anglais seulement ?
5. Paramètres audio et accessibilité (taille de l'interface, palette adaptée au daltonisme, §16.6) : quel jalon ?
6. Icône définitive et logo : qui les fait ?
7. Numéro de version de la bêta solo.

### G7 : Multijoueur
1. File d'attente : en Duel, au bout de combien de temps proposer un robot s'il n'y a personne ? En FFA, que faire avec moins de 4 joueurs après 2 min ?
2. Classement du Duel (rang, classements Steam) : le fait-on ? Il dépend de la question sur la triche de l'hôte (§17).
3. Hôte en file d'attente : le propriétaire du salon Steam, ou le joueur qui a la meilleure connexion ?
4. Chat : où va un signalement sans serveur à nous ? La sourdine est-elle seulement locale ?
5. Pilote automatique et robot de remplacement (après 3 min) : quel profil et quelle difficulté ?
6. Hôte qui quitte volontairement : où la défaite est-elle enregistrée ?
7. Replay partagé en fin de partie : sous quelle forme (fichier, Steam) ?
8. Interface d'administration : où est stockée la liste des comptes autorisés ? Les statistiques globales Steam ne fonctionnent pas avec l'App ID 480 : l'écran attend-il l'App ID réel ?
9. Spectateurs en ligne : les éliminés restent-ils dans la partie et dans le chat ?
10. Versions différentes entre l'hôte et un invité : on bloque la connexion ?
11. Numéro de version des étapes 1 et 2.
11 bis. Récompenses cosmétiques (§14.5 : titres, couleurs de réseau, effets de particules) : seules les parties en ligne en donnent (§2.6). Lesquelles, à quelles conditions, et dans ce jalon ou plus tard ?

**Partie personnalisée**
12. Réglages : la partie personnalisée garde-t-elle la liste courte du §2.4, ou reprend-elle les réglages complets du Bac à sable ?
13. Partie à 3 colonies : quel rayon par défaut ?
14. Rayons 5, 11, 17, 23 « à confirmer » ; peut-on combiner n'importe quel nombre de colonies avec n'importe quel rayon (6 colonies sur un rayon 5) ?
15. Valeurs des plages « à valider » : richesse ×1 à ×8, difficulté faible / normale / forte, ressources peu / normales / beaucoup.
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
3. Le panneau de simulations doit-il pouvoir comparer des robots de difficultés différentes à partir de G5 ?
