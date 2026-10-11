# MYCÉLIUM : LAST COLONY — Document de conception, portage Godot (v0.7.0 : propagation automatique)

> Jeu incrémental compétitif en parties de **30 minutes maximum**. Chaque joueur incarne une colonie de champignons qui **se propage toute seule** sur une carte d'hexagones : toute la bordure de son territoire pousse sur les cases voisines. Plus la colonie a de cases, plus elle produit ; ce qu'elle produit sert à **améliorer sa propagation** (poussée, plafond…), qui prend alors encore plus de cases. Le joueur **oriente** la croissance en posant jusqu'à **3 points chauds**. Son cœur, le **Sporophore**, est la case à protéger : s'il tombe, la colonie est éliminée. Le centre de la forêt est le plus riche et le plus disputé : **le but est d'être la dernière colonie vivante.** Trois façons de jouer : **Duel**, **FFA** (jusqu'à 6 colonies) et **Partie personnalisée**. Cible : un **projet Godot exporté en .exe (Windows), distribué sur Steam**.

**Vocabulaire.** Dans le jeu, le cœur de la colonie s'appelle **le Sporophore** ; ce document dit aussi « la Tourelle » (nom historique : depuis le 11 octobre 2026, il ne tire plus). Les valeurs chiffrées sont des **points de départ à simuler**. Les décisions ont été prises avec le propriétaire le 4 octobre 2026 (questions en QCM, maquettes validées).

---

## 1. Pitch

- **Genre** : jeu incrémental compétitif en temps réel (« tower idle »), type dernier survivant.
- **Fantasy** : tu es un réseau fongique qui envahit la forêt. Tu le regardes déborder case après case, tu le rends de plus en plus vigoureux, tu le guides vers les endroits qui t'intéressent et tu le mesures aux champignons voisins.
- **Boucle courte (5 à 30 s)** : acheter une amélioration, poser ou déplacer un point chaud.
- **Boucle moyenne (2 à 5 min)** : atteindre un palier (et une mutation tous les deux paliers), choisir où porter la croissance et quel voisin attaquer.
- **Boucle longue (30 min)** : survivre, abattre les Sporophores adverses, finir dernier vivant.

### Piliers de design
1. **L'espace est la ressource principale.** Plus de cases = plus de production = une propagation plus forte.
2. **La colonie explose.** Chaque minute, le joueur doit sentir que ses chiffres changent d'échelle.
3. **La colonie est l'identité.** Ses améliorations, ses mutations et ses points chauds font ta façon de jouer.
4. **L'affrontement, c'est la meilleure colonie.** Pas de micro-gestion : la propagation est automatique, on gagne par ses choix d'améliorations et de points chauds.
5. **Départ équitable, centre risqué.** Mêmes chances au départ ; plus on avance vers le centre, plus on gagne et plus on s'expose.
6. **Lisibilité** : on comprend en 5 secondes qui domine, qui est menacé et ce qui arrive ensuite.

---

## 2. Modes de jeu

### 2.1 Menu principal
**Jouer** (Duel, FFA : chacun ouvre le choix de la difficulté des robots, puis la partie, G4), **Bac à sable** (§2.1 bis), **Partie personnalisée**, **Tutoriel**, **Profil**, **Paramètres**, **Quitter**.

### 2.1 bis Bac à sable
- Entrée du menu principal, **visible par tous les joueurs**. Il n'y a **que le joueur et des robots** ; la partie personnalisée sert à jouer avec ses amis. Il sert notamment aux tests d'équilibrage du propriétaire.
- **Purement local** : fonctionne **sans Steam ni GodotSteam**.
- Le joueur est sur une forêt de **Duel ou de FFA, au choix**, avec la couleur **Menthe**, seul ou avec des **adversaires robots** : l'écran de réglages propose, pour **chaque secteur libre** (1 en Duel, 5 en FFA), un robot **Canonnier**, **Bâtisseur** ou **Conquérant**, le **robot de jeu** en **Facile**, **Normal** ou **Difficile** (G4), ou **Aucun** (par défaut) ; le récapitulatif liste les adversaires et leur résultat (décidé le 4 octobre 2026, étape 3 de G3).
- **Pause et vitesse uniquement en Bac à sable** : pause par la touche **P** ou un bouton du HUD ; vitesse par un **bouton du HUD** qui passe de ×1 à ×2 puis ×4.
- **Le plus paramétrable possible** : un écran de réglages avant de lancer (forêt et graine, adversaires, et **tous les chiffres** du jeu : poussée et plafond de départ, part des points chauds, PV des cases, régénération, améliorations, paliers, Enzymes, événements, protection de départ, Trophée). Un bouton **remet les valeurs par défaut** ; les réglages **ne sont pas gardés** d'une partie à l'autre.
- **Récapitulatif à tout moment** : un bouton copie dans le presse-papiers un texte lisible avec les **réglages** et les **résultats** de la partie.
- La partie **s'arrête à 30:00** : la carte reste visible et un **panneau de fin** propose **Copier le récapitulatif**, **Rejouer avec les mêmes réglages** et **Menu**. **Échap** met en pause et ouvre le **menu de partie** (Reprendre, Copier le récapitulatif, Recommencer, Quitter vers le menu) ; pendant la pause, **aucun ordre** n'est accepté.
- Éliminé en Bac à sable : **spectateur** (vitesse et pause possibles), avec un bouton vers l'écran de fin.

### 2.2 Duel (1 contre 1)
- **Contre un robot** : choix de la difficulté (Facile, Normal, Difficile) ; le robot de jeu n'a pas de profil visible (§2.5). Graine, secteur du joueur et couleurs des colonies sont tirés au hasard ; ni pause ni vitesse ; **Échap** ouvre le menu de partie (Reprendre, **Abandonner** avec confirmation), sans arrêter le temps. **Fin de partie minimale** (G4) : « Victoire ! » ou « Rang N sur M », cases prises, Sporophores abattus, durée de survie, pic de production ; **Rejouer** (nouvelle partie, même mode et même difficulté) et **Menu**.
- **Contre un joueur** : d'abord par invitation d'un ami Steam, puis par file d'attente (§19, dernier jalon).
- **Forêt** : deux secteurs symétriques (symétrie centrale), rayon **11** (397 cases, ~198 par joueur).
- **Victoire** : abattre la Tourelle adverse. À 30:00, départage par les **éliminations**, puis la **production moyenne sur toute la partie** (§3.3).

### 2.3 FFA (jusqu'à 6 colonies sur la même forêt)
- **Contre des robots** : 1 joueur + 5 robots, **une seule difficulté pour tous**, choisie par le joueur (décidé le 5 octobre 2026). Comme en Duel contre un robot ; **éliminé**, le joueur voit tout de suite la fin de partie avec son rang.
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
- Les robots jouent **avec les mêmes règles et les mêmes commandes que les joueurs** : pas de triche. Ils choisissent leurs **améliorations**, leurs **mutations** et leurs **points chauds** (décidé le 11 octobre 2026 : plus de priorité de tir, de capacités ni de bâtiments).
- **Profils** (panneau de simulations et Bac à sable) et **points chauds** *(décidé le 11 octobre 2026, QCM)* :
  - *Canonnier* : Poussée d'abord ; ses points chauds visent **le Sporophore adverse le plus proche** (dès la fin de la protection), puis les cases adverses sur le chemin.
  - *Bâtisseur* : Rendement et défense d'abord ; ses points chauds visent les **cases libres les plus riches** (zone la plus centrale à 2 cases au plus de son territoire, la plus proche).
  - *Conquérant* : Vigueur et Poussée d'abord ; ses points chauds visent **le centre**, puis l'ennemi le plus proche une fois la zone 5 atteinte.
- **Comportement** : à chaque action, un robot prend la mutation la plus lourde pour son profil, repose un point chaud dès qu'un des siens est pris ou disparaît, et achète l'amélioration au meilleur rapport poids / coût (en économisant pour elle si elle n'est pas encore payable). Les poids sont dans `ai/profiles/`.
- **Robot de jeu** *(G4, décidé le 5 octobre 2026)* : en Duel et en FFA, les adversaires sont des **robots de jeu**, sans profil visible : un réglage interne **équilibré** ; ses points chauds sont **un mélange** des trois profils (un de chaque quand il en a trois). Trois difficultés, dont les valeurs sont dans `data/` :
  - **Difficile** : il agit chaque seconde, sans erreur ;
  - **Normal** : le même, mais il n'agit que toutes les **2 s** ;
  - **Facile** : il agit toutes les **3 s**, fait **1 achat sur 4 au hasard**, prend sa **mutation au hasard** et **ne vise pas le Sporophore adverse** avec ses points chauds.
  Le nombre d'ordres d'un robot dépend donc de sa difficulté (« mêmes limites qu'un joueur »).
- Ils servent aussi à compléter les salons, à remplacer un joueur déconnecté et à équilibrer les valeurs par simulation (§18.5).

### 2.6 Règles communes
- **Modes locaux et modes en ligne isolés** : tous les modes où il n'y a que le joueur et des robots (Bac à sable, Duel et FFA contre robots, tutoriel) fonctionnent **sans Steam ni GodotSteam**. Steam ne sert qu'aux modes multijoueur. **Les parties locales ne comptent pas** : elles n'alimentent ni les statistiques ni les succès Steam et ne donnent aucune récompense cosmétique ; le **profil local** les enregistre quand même.
- **Durée maximale : 30:00**, tous modes.
- **Pause et vitesse** : uniquement en Bac à sable.
- **Résultat** : rang de partie = ordre d'élimination ; statistiques de fin (cases conquises, tourelles abattues, durée de survie, pic de production).

### 2.7 Tutoriel
Une **courte partie scénarisée (~10 min)** contre un robot passif, sur une petite forêt de Duel ; **proposée au premier lancement**, passable et rejouable (jalon G8). Étapes *(revues et validées le 11 octobre 2026)* :

| Étape | Objectif | Ce qu'on apprend |
|---|---|---|
| 1 | Regarder la colonie prendre 5 cases | Propagation automatique, PV des cases |
| 2 | Acheter 2 améliorations | Panneau, coûts qui montent |
| 3 | Poser un point chaud et le voir attirer la croissance | Points chauds |
| 4 | Atteindre 10 cases et choisir une mutation | Paliers, production qui monte, mutations |
| 5 | Tenir une frontière attaquée par le robot | Défense (PV, régénération) |
| 6 | Abattre le Sporophore du robot | Point chaud sur un Sporophore, élimination et trophée |

---

## 3. Déroulé d'une partie

### 3.1 Départ
- Chaque colonie démarre avec **3 cases, Tourelle comprise** : la Tourelle sur un **coin de la forêt** (le milieu exact de son secteur, zone 1), la case collée à elle **vers le centre**, et une case collée à elle **sur le bord**. Les départs des autres colonies s'en déduisent par rotation, donc tous identiques.
- **Stock de départ** : 0 (la colonie pousse tout de suite ; les premières améliorations se paient avec la production).
- **Protection de départ : 2:00.** Pendant la protection, la propagation **ne pousse pas sur les cases adverses** ; la part qui leur reviendrait va aux voisines libres de la même case de bordure (s'il n'y en a pas, elle est perdue ; validé le 11 octobre 2026).

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
| 1 (bord) | ×1,0 | ×1 | ×2,5 |
| 2 | ×1,5 | ×5 | ×2,5 |
| 3 | ×2,0 | ×20 | ×2,5 |
| 4 | ×2,6 | ×60 | ×2,5 |
| 5 | ×3,3 | ×150 | ×2,5 |
| 6 (Clairière) | ×4,0 | ×400 | ×2,7 |

*(Valeurs de l'équilibrage de G6, 11 octobre 2026, §5 quater : avant, PV des cases libres ×1 ; 5 ; 25 ; 100 ; 350 ; 1 000 et défense ×1,5 à ×3,75. La défense des cases possédées est désormais la même partout, sauf la Clairière.)*

Cible : une colonie moyenne atteint la zone N vers la minute 3,5 × N.

---

## 5. Le Sporophore *(revu le 11 octobre 2026 : cœur seulement)*

### 5.1 Principe
- Le Sporophore est le **cœur de la colonie** : il occupe sa case de départ (§3.1) et **ne bouge pas**. Il y en a **un seul** par colonie.
- **Il ne tire plus** *(décidé le 11 octobre 2026)* : plus de spores, de portée, de cercle de portée, de priorité de tir, de cible au clic ni de soin. C'est la **propagation** de toute la colonie qui prend les cases (§5 bis).
- Il a ses propres **PV** (§7.4) : s'il tombe, la colonie est éliminée (§3.3).
- Il est **une case de mon territoire** comme les autres : il compte pour les paliers, produit, et **pousse s'il est sur la bordure**, comme une case (validé le 11 octobre 2026).
- Il prend des dégâts **comme une case** quand une colonie voisine pousse sur lui (§5 bis.5).
- *Supprimé le 11 octobre 2026, pour mémoire :* tir automatique, portée 2 à 4, priorités Plus proche / Plus riche / Soigner d'abord / Ennemis d'abord, cible désignée au clic, soin des cases (§5.2 à §5.4 et §7.3 de la v0.6).

---

## 5 bis. La propagation automatique *(décidé le 11 octobre 2026, QCM ; jalon G6)*

> Remplace les **bâtiments** (Essaimeur, Avant-poste, Mortier) de la v0.6 et le tir du Sporophore. **Toute la bordure pousse**, sa force dépend du niveau de la colonie (améliorations, paliers), et le joueur oriente la croissance avec **3 points chauds**. Toutes les valeurs chiffrées sont des points de départ à simuler.

### 5 bis.1 La bordure
- Une **case de bordure** est une de mes cases qui a **au moins une voisine qui n'est pas à moi** (libre ou adverse).
- Chaque seconde (1 tick), chaque case de bordure **pousse** sur ses voisines qui ne sont pas à moi : elle leur retire des PV, **à parts égales entre toutes ces voisines, libres ou adverses** (pas de priorité).
- Une case visée par plusieurs de mes cases de bordure **additionne** les poussées reçues.
- Pas de portée : on ne pousse **que sur une case collée** à mon territoire. Le territoire reste d'un seul tenant.

### 5 bis.2 Force : poussée par case et plafond global (« mixte »)
- **Poussée par case** : chaque case de bordure pousse avec **3 PV/s** de base (1 avant l'équilibrage de G6) × amélioration **Poussée** × mutations.
- **Plafond global** : la colonie ne peut pas dépasser une **force totale** = **8 PV/s** de base × multiplicateur de **palier** × amélioration **Vigueur**.
- **Force totale** = somme des poussées de toutes les cases de bordure, **ramenée au plafond** si elle le dépasse (toutes les poussées sont alors réduites dans la même proportion).
- Effet voulu : grandir accélère la conquête (plus de bordure), mais le plafond, qui suit le niveau, empêche l'emballement ; c'est en montant Vigueur et les paliers qu'on relève la limite.

### 5 bis.3 Points chauds
- Le joueur peut poser **jusqu'à 3 points chauds** (**1 au départ, 2 au palier 1, 3 au palier 2**, §8.3).
- **Sur n'importe quelle tuile** qui n'est pas à moi : libre ou adverse, **Sporophore adverse compris**, **même loin** de mon territoire ; un clic sur **une de mes cases est refusé** (validé le 11 octobre 2026).
- **Bonus en plus de la force** *(décidé le 11 octobre 2026, QCM, pendant l'équilibrage)* : toute la force va à la bordure comme au §5 bis.1, et les points chauds reçoivent **en plus** un bonus de **30 % de la force**, **partagé à parts égales entre les points chauds posés** (1 point chaud = 30 % ; 2 = 15 % chacun ; 3 = 10 % chacun). Ce bonus dépasse le plafond. *Avant : les 30 % étaient pris sur la force ; en simulation, un robot qui posait des points chauds perdait alors 23 parties sur 24 contre un robot identique qui n'en posait jamais.*
- **Attraction, « bordure orientée »** : le bonus d'un point chaud est répartie à parts égales entre mes cases de bordure **tournées vers lui**, c'est-à-dire celles qui ont au moins une voisine pas à moi **plus proche du point chaud** (distance en cases) qu'elles-mêmes. Chacune pousse ce bonus, à parts égales, sur ces voisines-là seulement ; sans case tournée vers lui, le bonus est perdu.
- **Fin d'un point chaud** : quand sa case est **prise**, il **disparaît** tout seul ; son bonus revient aux autres points chauds.
- Un point chaud **ne coûte rien** (les Enzymes n'ont pas d'usage, §8.1).

### 5 bis.4 Prendre une case
- **Case libre** : PV = base **40** × PV de sa zone (§4.3). À **0 PV**, elle devient mienne **à pleine vie**. Entamée puis plus poussée, elle **reprend ses PV** peu à peu (même régénération que les cases possédées).
- **Case adverse** : ses PV dépendent de son propriétaire (§7). À 0 PV, elle passe à moi **avec 25 % de ses PV max**. Elle **se régénère** seule ; la prise est une **course** entre ma poussée et sa défense (PV, régénération).
- Si deux colonies poussent sur la même case libre, celle qui la fait tomber à 0 la prend ; les colonies sont traitées l'une après l'autre et la première change à chaque tick (règle reprise de la v0.6) ; le tour de départ est tiré de la graine, pour qu'aucun secteur ne soit avantagé d'une partie à l'autre (11 octobre 2026 : sinon, entre deux robots identiques, le secteur 1 gagnait ~70 % des parties).
- **Territoire coupé** : mes cases qui ne sont plus reliées à mon Sporophore **redeviennent libres** tout de suite (§12). Sans bâtiments, il n'y a plus d'îlots.

### 5 bis.5 Le Sporophore adverse
- Une case de bordure qui touche un Sporophore adverse **pousse sur lui comme sur une case** : il perd des PV. À 0 PV, sa colonie est éliminée et le **Trophée** va à la colonie dont la poussée l'a fait tomber (§12).
- Un point chaud posé sur un Sporophore adverse oriente la croissance jusqu'à lui ; il ne disparaît que quand le Sporophore tombe.

### 5 bis.6 Gestes
- **Clic gauche** sur une tuile qui n'est pas à moi : **pose** un point chaud. S'il y en a déjà le maximum, le **plus ancien** est remplacé.
- **Clic gauche sur un point chaud** : il est **retiré**.
- **Clic droit sur un point chaud** : il est aussi **retiré** (validé le 11 octobre 2026) ; la carte glisse toujours au clic du milieu et par les bords.

### 5 bis.7 Affichage *(provisoire, dans le style actuel ; l'habillage viendra en G8)*
- **Point chaud** : un marqueur à la couleur de la colonie sur sa tuile, numéroté 1 à 3, avec un trait léger vers la bordure orientée.
- **Bordure** : les cases de bordure **pulsent** doucement ; une case poussée se remplit de la couleur de l'attaquant comme une jauge circulaire (état « entamée » des maquettes).
- Plus de spores en vol, de cercle de portée ni de cible désignée.

### 5 bis.8 Ce qui est supprimé *(décidé le 11 octobre 2026)*
- **Bâtiments** : Essaimeur, Avant-poste, Mortier, places, chantiers, roue au clic droit, sommeil de 60 s, îlots (§5 bis de la v0.6).
- **Tir du Sporophore** : portée, priorités, cible au clic, soin.
- **Capacités** : Salve, Mur de mycélium, Nuage toxique (§11).
- **Revenu lent d'Enzymes** (retour à avant G5).
- **Améliorations** et **mutations** liées au tir (§9.2, §10).

### 5 ter. Équilibrage de G5 *(attendus décidés le 5 octobre 2026, QCM ; historique : mesuré avec les bâtiments, à refaire en G6)*

G5 inclut un **équilibrage** du jeu (le choix du 4 octobre de ne pas équilibrer tout de suite est levé).

- **Méthode** : des centaines de parties **robot contre robot** jouées par le panneau de simulations ; Claude mesure, ajuste les valeurs de `data/` et recommence jusqu'à atteindre les cibles.
- **Périmètre** : **tout le jeu** peut bouger (bâtiments, Sporophore, y compris portée, cadence, dégâts et prix décidés le 5 octobre, économie, paliers, améliorations, mutations, capacités, PV des zones).
- **Robots** : les cibles valent pour le **robot de jeu Difficile contre Difficile** et aussi en **Normal** ; **Facile perd contre Normal dans 80 % des parties** au moins. Pas de cible d'équilibre entre profils (ils servent aux tests).
- **Cibles**, dans l'ordre de priorité (en cas de conflit, **la durée des parties passe d'abord**) :
  1. **Duel** : la plupart des parties finissent par une **élimination entre 12 et 20 min**.
  2. **FFA (6)** : en priorité, **première élimination vers 8-12 min** et un **dernier survivant avant 30:00** dans au moins la moitié des parties (le plus souvent possible) ; avoir 2-3 survivants à 30:00 reste acceptable selon l'effet boule de neige.
  3. **Début** : le **premier bâtiment vers 1:00**.
  4. **Bâtiments décisifs** : une colonie qui n'utilise qu'un type perd nettement contre une qui mélange ; chaque type fait **au moins 20 %** des bâtiments des gagnants.
  5. **Boule de neige** : avantage fort assumé, le **meneur à 10 min gagne 80-90 %** des parties.
  6. **Rythme** : zone N atteinte vers **3,5 × N min** ; production ×10 000 à ×100 000 sur la partie (~10 → 1e5-1e6 nutriments/s).
  7. **Actions** : **8 à 10 actions par minute** pour un joueur actif (achats, bâtiments, capacités, cibles).
- **Rendu** : les nouvelles valeurs appliquées dans `data/`, et dans le GDD un tableau **avant / après** avec les **mesures pour chaque cible**.

#### Résultat de l'équilibrage *(6 octobre 2026, version 0.6.0)*

Mesures avec `tools/balance_report.gd` (robot de jeu, graines 1 à 20 ; 1 tick = 1 s, sans affichage). « Avant » = valeurs du 5 octobre avec les bâtiments ; « après » = valeurs livrées.

**Règles décidées pendant l'équilibrage (QCM du 6 octobre 2026)** : revenu lent d'Enzymes ; l'Avant-poste ne vise plus que les cases adverses ; ~30 % de FFA à un seul survivant aurait été accepté (le résultat final est bien meilleur).

| Valeur (`data/`) | Avant | Après |
|---|---|---|
| Facteur de coût des améliorations | ×1,15 | **×1,35** |
| PV des cases libres, zones 1 → 6 | ×1 ; 1,4 ; 2 ; 2,8 ; 3,8 ; 5 | **×1 ; 5 ; 25 ; 100 ; 350 ; 1 000** |
| Défense des cases possédées, zones 1 → 6 | ×1 ; 1,2 ; 1,5 ; 1,8 ; 2,1 ; 2,5 | **×1,5 ; 1,8 ; 2,25 ; 2,7 ; 3,15 ; 3,75** |
| Production des paliers 1 → 6 | ×2 ; 4 ; 8 ; 16 ; 32 ; 64 | **×1,3 ; 1,7 ; 2,2 ; 2,85 ; 3,7 ; 4,8** |
| Lots d'Enzymes des paliers 1 → 6 | 20 ; 40 ; 60 ; 80 ; 100 ; 120 | **40 ; 80 ; 120 ; 160 ; 200 ; 240** |
| Revenu d'Enzymes | aucun | **1 toutes les 3 s** |
| Prix Essaimeur / Avant-poste / Mortier | 10 / 20 / 40 Enz. | **5 / 10 / 20 Enz.** |
| Niveaux max : Régénération, Soin, PV des cases, Écorce, Éclaboussure, Rebond | sans limite | **3, 8, 10, 10, 5, 3** |
| Robot de jeu : priorité, poids des bâtiments | Plus riche ; — | **Plus proche ; Essaimeur 4, Avant-poste 3, Mortier 2** |
| Robot Facile : délai entre deux ordres de bâtiment | — | **30 s** |

Inchangés : Sporophore (5 dégâts, 0,2 tir/s, portée 2, 400 PV), protection 2:00, capacités, mutations, Trophée, chantiers, portées, dégâts et PV des bâtiments.

| Cible | Mesure avant | Mesure après | |
|---|---|---|---|
| 1. Duel Difficile : élimination entre 12 et 20 min | 1 partie sur 10 ; 4 éliminations sur 10 (3 avant 5:15), sinon blocage jusqu'à 30:00 | **12 sur 20** (médiane 13:00 ; toutes finies par élimination, de 8:12 à 16:36) | atteinte de justesse |
| 1 bis. Duel Normal | 0 sur 10 | **12 sur 20** (médiane 13:42) | atteinte de justesse |
| 2. FFA (6) : 1re élimination 8-12 min | aucune élimination (4 parties) | **5:48** en médiane (4:48 à 7:42) | **trop tôt** |
| 2 bis. FFA : un seul survivant avant 30:00 | 0 sur 4 (6 survivants) | **18 sur 20** (médiane 16:06) | atteinte |
| 3. Premier bâtiment vers 1:00 | 1:03 | **0:59** | atteinte |
| 4. Une colonie à un seul type perd | non mesuré | Essaimeurs seuls 0/40, Avant-postes seuls 1/40, Mortiers seuls 0/40 victoires | atteinte |
| 4 bis. Chaque type ≥ 20 % des bâtiments des gagnants | Mortier 4 % | Duel : Essaimeur 46 %, Avant-poste 34 %, Mortier 20 % ; FFA : 35 / 43 / 23 % | atteinte (Mortier à la limite en Duel) |
| 5. Le meneur à 10:00 gagne 80-90 % | 7/7 | Duel Difficile : 79 % (production), 89 % (cases) ; Normal : 63 % / 74 % ; FFA : 65 % / 80 % | à peu près |
| 6. Zone N vers 3,5 × N min | zone 6 à 2:36 | zones 2 à 6 : 2:00, 4:00, 7:12, 10:06, 14:06 (Duel) | trop rapide au début, proche ensuite |
| 6 bis. Production ×10 000 à ×100 000 | pic 1,4e6/s | pic médian **3,5e4/s** (×3 500), max 1,2e5/s | un peu bas |
| 7. 8 à 10 actions par minute | 27 | robots : **20** ordres par minute (un achat = un niveau) | non mesurable sur un joueur ; à vérifier en jouant |
| Facile perd contre Normal ≥ 80 % | non mesuré | **95 %** (38 sur 40) | atteinte |

À reprendre plus tard : la 1re élimination trop tôt en FFA (les Écorce, PV de la Tourelle et paliers du Mortier n'y changent presque rien), le rythme des zones 2 et 3, et la production de fin de partie.

---

### 5 quater. Équilibrage de G6 *(11 octobre 2026, version 0.7.0)*

Mêmes cibles que le §5 ter, sauf « premier bâtiment vers 1:00 » et « bâtiments décisifs », remplacées par **premier point chaud atteint vers 1:00** et **points chauds décisifs** (un robot qui n'en pose jamais perd nettement contre un qui en pose). Mesures avec `tools/balance_report.gd` (robot de jeu, graines 1 à 20 en Duel, 1 à 10 en FFA ; 1 tick = 1 s, sans affichage).

**Décisions prises pendant l'équilibrage (QCM du 11 octobre 2026)** : le bonus des points chauds s'ajoute à la force au lieu d'être pris dessus (§5 bis.3). Sans QCM, faute de règle : le tour de départ de la propagation est tiré de la graine (§5 bis.4).

| Valeur (`data/`) | Spécifiée | Après |
|---|---|---|
| Poussée de base par case | 1 PV/s | **3 PV/s** |
| Plafond des paliers 1 → 6 | ×1,5 ; 2,25 ; 3,4 ; 5 ; 7,5 ; 11 | **×1,3 ; 1,8 ; 2,5 ; 4 ; 10 ; 18** |
| Vigueur, par niveau | +20 % | **+25 %** |
| Régénération de base / amélioration Régénération | 2 % / +1 % par niveau | **0,5 % / +0,5 %** |
| PV des cases (amélioration) : niveaux au plus | 10 | **5** |
| Cohésion : PV par voisine | +15 % | **+10 %** |
| PV des cases libres, zones 1 → 6 | ×1 ; 5 ; 25 ; 100 ; 350 ; 1 000 | **×1 ; 5 ; 20 ; 60 ; 150 ; 400** |
| Défense des cases possédées, zones 1 → 6 | ×1,5 ; 1,8 ; 2,25 ; 2,7 ; 3,15 ; 3,75 | **×2,5 partout, ×2,7 en Clairière** |
| Robot de jeu et Bâtisseur : portée du but « cases riches » | 3 cases | **2 cases** |

Inchangés : 30 % de bonus aux points chauds, plafond de départ 8 PV/s, PV du Sporophore (400), protection 2:00, paliers (seuils, production, Enzymes), mutations, Trophée.

| Cible | Mesure | |
|---|---|---|
| 1. Duel Difficile : élimination entre 12 et 20 min | **11 sur 20** (médiane 13:30, toutes entre 12:06 et 15:06) ; 9 parties sans élimination à 30:00 | atteinte de justesse |
| 1 bis. Duel Normal | **10 sur 20** (médiane 13:36, de 12:12 à 15:06) | atteinte de justesse |
| 2. FFA (6) : 1re élimination 8-12 min | **7:36** en médiane (5:18 à 9:36) | un peu tôt |
| 2 bis. FFA : un seul survivant avant 30:00 | 3 sur 10 ; 2 survivants dans 6 parties, 3 dans 1 | 2-3 survivants acceptés |
| 3. Premier point chaud atteint vers 1:00 | **0:42** (Duel), 0:48 (FFA) | atteinte |
| 4. Points chauds décisifs | robot de jeu contre le même sans point chaud : **20 victoires sur 20** | atteinte |
| 5. Le meneur à 10:00 gagne 80-90 % | Duel Difficile 90 %, Normal 75 %, FFA 90 % | atteinte |
| 6. Zone N vers 3,5 × N min | zones 2 à 6 : 0:42, 2:12, 4:00, 8:00, 27:36 (Duel) | trop rapide au début, Clairière rarement prise |
| 6 bis. Production ×10 000 à ×100 000 | pic médian **6e4/s** (×6 000), max 1,2e5/s | un peu bas |
| 7. 8 à 10 actions par minute | robots : 9 (Difficile), 7 (Normal) | à vérifier en jouant |
| Facile perd contre Normal ≥ 80 % | **60 %** (12 sur 20) | **non atteinte** |

À reprendre : Facile trop proche de Normal (ses points chauds le rendent presque aussi fort ; jouer sur son rythme ou ses achats au hasard n'a rien changé), la Clairière presque jamais prise, la 1re élimination un peu tôt en FFA, et environ la moitié des Duels qui se figent jusqu'à 30:00.

---

## 6. Prendre une case
*Depuis le 11 octobre 2026, voir §5 bis.4 (propagation automatique).*

### 6.1 Rythme de la simulation
La simulation avance d'**1 tick par seconde** ; les poussées sont continues (PV par seconde) et calculées de façon déterministe. L'animation des cases entamées est interpolée à l'écran.

---

## 7. Défense

### 7.1 PV d'une case possédée
PV max = base **40** × défense de la zone (§4.3) × (1 + **10 %** par voisine possédée, la Cohésion ; 15 % avant G6) × améliorations de défense × mutations.

### 7.2 Régénération
Chaque case **regagne ses PV** seule : **0,5 %** de ses PV max par seconde (2 % avant G6), plus l'amélioration **Régénération** pour une case possédée.

### 7.3 Soin
*Supprimé le 11 octobre 2026* : le Sporophore ne soigne plus. La défense passe par les PV (Cohésion, PV des cases), la régénération et la mutation *Mycélium tenace*.

### 7.4 La Tourelle
PV du Sporophore = **400** (10 × les PV de base d'une case, 40) : seules l'amélioration **Écorce du Sporophore** et la mutation *Blindé* les augmentent (décidé le 4 octobre 2026 : ni la Cohésion ni l'amélioration PV des cases). Il se régénère comme une case. Il ne prend des dégâts que d'une colonie dont le territoire **le touche** (§5 bis.5).

---

## 8. Ressources et croissance incrémentale

### 8.1 Ressources
| Ressource | Rôle | Source |
|---|---|---|
| **Nutriments** | Achat des améliorations | Toutes mes cases |
| **Enzymes** | **Aucun usage pour le moment** (décidé le 11 octobre 2026 : on les garde pour plus tard ; capacités et bâtiments supprimés) | **Paliers de colonie** (un lot à chaque palier atteint) et **Trophées** ; **plus de revenu lent** (retour à avant G5) |
| **Biomasse** | Total des nutriments produits : départage à 30:00 et statistiques | Production |

- **Pas de plafond de stock** : tout se dépense en améliorations.
- Lots d'Enzymes : 40 au palier 1, puis 80, 120, 160, 200 et 240. Un palier perdu puis retrouvé ne redonne pas son lot. Le compteur **reste affiché** dans le panneau (validé le 11 octobre 2026).

### 8.2 Production
Une case de zone 1 rapporte **≈ 3,33 nutriments/s**, multipliée par la **richesse de sa zone**, la **Cohésion** (+5 % par voisine possédée, +30 % au plus), les **paliers**, l'**Armillaire** (×1,00 → ×1,25 sur 30 min) et les événements. Les multiplicateurs se **multiplient** entre eux.

### 8.3 Paliers de colonie
Quand le **nombre de cases** franchit un seuil, **la production de la colonie monte**, le **plafond de propagation** est multiplié, la colonie reçoit son **lot d'Enzymes** et débloque des améliorations ou des points chauds. **Une mutation tous les deux paliers** : paliers 2, 4 et 6 (décidé le 11 octobre 2026, QCM).

**Répartition validée le 11 octobre 2026 (QCM)** ; plafonds de l'équilibrage de G6 (§5 quater) :

| Palier | Cases | Production | Plafond | Débloque | Mutation |
|---|---|---|---|---|---|
| Départ | 3 | ×1 | ×1 | Poussée, Vigueur, Rendement ; **1 point chaud** | — |
| 1 | 5 | ×1,3 | ×1,3 | Régénération ; **2e point chaud** | — |
| 2 | 10 | ×1,7 | ×1,8 | PV des cases ; **3e point chaud** | oui |
| 3 | 20 | ×2,2 | ×2,5 | — | — |
| 4 | 40 | ×2,85 | ×4 | Écorce du Sporophore | oui |
| 5 | 80 | ×3,7 | ×10 | — | — |
| 6 | 160 | ×4,8 | ×18 | (le prestige du conquérant) | oui |

- Seules les cases possédées comptent, Sporophore compris.
- Le multiplicateur suit le **nombre de cases actuel** : perdre des cases peut faire perdre un palier (production, plafond et points chauds débloqués). Un point chaud en trop après un palier perdu disparaît (le plus ancien). Les niveaux déjà achetés d'une amélioration dont le palier est perdu **restent actifs**.

### 8.4 Ordre de grandeur
Cible : **~10 nutriments/s au départ → 1e5 à 1e6 nutriments/s en fin de partie**. Les nombres s'écrivent avec des suffixes (K, M, B, T).

### 8.5 Retour visuel (le « boum »)
- Les cases de bordure **pulsent** ; une case poussée se remplit de la couleur de l'attaquant ; une case prise **éclot** à la couleur de la colonie.
- Au franchissement d'un **palier** : message « Palier ! », le Sporophore grossit un instant, puis (paliers 2, 4 et 6) la carte des mutations s'ouvre.
- Les **compteurs défilent**. La **courbe de production**, absente des maquettes validées, n'est plus affichée dans le panneau depuis l'étape 2 de G3 (place des améliorations) : elle reviendra sur l'écran de résultats (G7), à confirmer.
- Le Sporophore **change d'aspect** avec le palier, pour que la puissance de la colonie se lise sur la carte.

---

## 9. Le panneau d'améliorations *(décidé le 4 octobre 2026)*

### 9.1 Principe
- Le côté incrémental est un **panneau à droite de l'écran** ; la **carte est à gauche**.
- On y achète des **améliorations à niveaux** avec les nutriments : poussée, plafond, rendement, défense.
- Coût d'un niveau = coût de base × **1,35 ^ niveau** (1,15 avant l'équilibrage du 6 octobre 2026) ; chaque niveau ajoute le même effet (pas de jalons tous les 25 niveaux, idée non retenue). Bouton **×1 / ×10 / Max** pour acheter plusieurs niveaux d'un coup.

### 9.2 Catalogue *(revu le 11 octobre 2026, QCM)*

| Amélioration | Effet par niveau | Coût de base | Palier |
|---|---|---|---|
| **Poussée** *(fusion de Dégâts et Cadence)* | +25 % de poussée par case de bordure | 1 U | Départ |
| **Vigueur** *(nouvelle)* | +25 % du plafond global de propagation | 2 U | Départ |
| **Rendement** | +10 % de production de mes cases | 2 U | Départ |
| **Régénération** | +0,5 % des PV max par seconde (**3 niveaux au plus**) | 5 U | 1 |
| **PV des cases** | +20 % des PV max de mes cases (**5 niveaux au plus**) | 20 U | 2 |
| **Écorce du Sporophore** | +25 % des PV du Sporophore (**10 niveaux au plus**) | 300 U | 4 |

U = 30 nutriments, comme avant. Paliers de déblocage : §8.3.

**Supprimées le 11 octobre 2026** : Dégâts et Cadence (fusionnées dans Poussée), Portée, Soin, Spores par tir, Éclaboussure, Critique, Rebond.

**Onglets** : Attaque (Poussée, Vigueur), Défense (Régénération, PV des cases, Écorce), Économie (Rendement).

---

## 10. Mutations au palier *(revu le 11 octobre 2026)*

Aux paliers **2, 4 et 6** atteints pour la première fois, le joueur **choisit 1 mutation parmi 3** tirées au hasard (graine), sans remise parmi celles pas encore prises. Elles sont permanentes pour la partie. **La partie continue pendant le choix**, sans limite de temps ; si un nouveau palier à mutation arrive avant le choix, **les choix s'empilent**.

Liste (5 mutations tirables ; *Glande* retirée du tirage le 11 octobre 2026 tant que les Enzymes ne servent à rien) :
- *Cohésion* : la Cohésion compte double (production et PV).
- *Mycélium tenace* : régénération ×2.
- *Racines profondes* : production des zones 4 à 6 ×1,3.
- *Blindé* : PV du Sporophore ×2.
- *Avare* : améliorations −15 % de coût.

Avec 5 mutations, les 3 tirages (paliers 2, 4, 6) ont toujours 3 cartes.

**Retirées le 11 octobre 2026** : *Glande* (reviendra avec un usage des Enzymes) ; supprimées : Spores lourdes, Spores légères, Hyphes longues, Guérisseur, Sporée, Pionnier, Prédateur, Toxique (et *Rapide* le 5 octobre 2026).

---

## 11. Capacités actives
*Supprimées le 11 octobre 2026 (QCM)* : Salve, Mur de mycélium et Nuage toxique n'existent plus. Les touches Q, W, E sont libérées.

---

## 12. Conflit

- **Pression automatique au contact** *(11 octobre 2026)* : une case de bordure qui touche une case adverse pousse sur elle (§5 bis.1) ; les points chauds concentrent la poussée sur une colonie choisie. On garde ses cases grâce à leur défense (PV, Cohésion, régénération).
- **Territoire coupé** : quand une prise adverse coupe mon territoire, mes cases qui ne sont plus reliées à mon Sporophore **redeviennent libres** tout de suite (décidé le 4 octobre 2026).
- On ne pousse que sur des cases **collées à son territoire**.
- Pas de poussée sur les cases adverses avant **2:00**.
- **Élimination** *(décidé le 4 octobre 2026)* : quand un Sporophore tombe, **toutes les cases de la colonie redeviennent libres**. La colonie qui l'a abattu reçoit un **Trophée** :
  - **production de nutriments +25 %** jusqu'à la fin de la partie, **cumulable** (2 Trophées = +50 %) ; cette production compte dans la production moyenne ;
  - **+100 Enzymes** d'un coup (sans usage pour le moment) ;
  - une ligne dans les statistiques et le profil.
- **Départage à 30:00** : les éliminations comptent **avant** la production moyenne (§3.3).
- La colonie qui abat le Sporophore est celle dont la poussée le fait tomber à 0 PV.
- **Pas de seconde vie** : un Sporophore abattu élimine la colonie.
- Pas de plancher de cases ni de protection contre un joueur plus petit.

---

## 13. Événements

*Décidé le 4 octobre 2026 : seulement les deux événements scriptés ; les événements aléatoires sont des idées pour plus tard (§17).* Ils sont annoncés **20 s avant** et figurent sur la frise. Chacun peut être activé ou non dans une partie personnalisée et dans le Bac à sable.

- **Floraison collective** (8:00, 16:00, 24:00) : production **×2** pendant 30 s pour toutes les colonies.
- **Arbre mourant** (12:00 et 20:00) : 7 cases libres d'un tenant dans la zone du moment, avec **beaucoup de PV** (valeur à fixer en G7) ; chaque colonie qui pousse dessus y inflige ses dégâts. Quand il tombe, récompense en nutriments (≈ 2 min de production moyenne) et 100 Enzymes **au prorata des dégâts**, +25 % au meilleur ; ses 7 cases redeviennent libres. Disparaît au bout de 3 min.

**Zone du moment** : pour chaque colonie, sa zone la plus au centre ; on prend la plus fréquente (à égalité, la plus centrale) ; seul en Bac à sable, sa zone la plus avancée.

---

## 14. Social, déconnexion, récompenses

### 14.1 Chat
Chat de partie (en ligne) ; amis et messages privés via Steam ; sourdine et signalement, modération minimale.

### 14.2 Déconnexion et abandon
- **Un joueur se déconnecte** : **pilote automatique** (sa colonie continue de se propager avec ses points chauds, sans achat), reprise possible à tout moment ; après 3 min sans retour, un robot en prend le contrôle.
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
production_totale  = Σ production_case (cases reliées) × mult_palier × bonus_souche(t)
                     × (1 + 0,10 × niveau_Rendement) × (1 + 0,25 × trophées) × mutations
bonus_souche(t)    = 1,00 + 0,25 × t / 30 min
pv_case_libre      = 40 × pv_zone
pv_case_possédée   = 40 × défense_zone × (1 + 0,10 × voisines) × (1 + 0,20 × niveau_PV) × mutations
régénération       = pv_max × (0,5 % + 0,5 % × niveau_Régénération) par seconde

poussée_case       = 3 PV/s × (1 + 0,25 × niveau_Poussée)
plafond            = 8 PV/s × mult_plafond_palier × (1 + 0,25 × niveau_Vigueur)
force              = min(Σ poussée_case (cases de bordure), plafond)
bordure            = force   (à parts égales entre cases de bordure,
                     puis à parts égales entre leurs voisines pas à moi)
bonus_point_chaud  = 30 % de force ÷ nombre de points chauds   (en plus, par la bordure orientée)
coût_niveau        = coût_base × 1,35 ^ niveau
```
Valeurs après l'équilibrage de G6 (11 octobre 2026, §5 quater).

---

## 16. Interface et direction artistique

### 16.1 Écrans
Menu principal, **mode Duel**, **mode FFA**, **salon de partie personnalisée**, **partie** (carte à gauche, panneau à droite), spectateur, résultats, profil, **paramètres**, et l'**interface d'administration** cachée (§18.4).

### 16.2 Écran de partie *(maquettes validées le 4 octobre 2026 : canevas « Mycélium — maquettes de la Tourelle (G3) »)*
- **Carte (à gauche, ~62 % de la largeur)** : la forêt, mes points chauds (marqueurs numérotés), la bordure qui pulse et les cases entamées ; en haut à gauche, la **frise** (horloge, prochains événements ; jusqu'à G7, horloge et fin de la protection de départ seulement, décidé le 4 octobre 2026 ; en Bac à sable, boutons pause, vitesse et récapitulatif) ; en haut à droite, le **mini-classement** (colonies en vie, cases, éliminations, production moyenne) ; en bas à gauche, le **journal et les alertes**, avec un rappel du geste (clic : poser / retirer un point chaud).
- **Panneau (à droite, ~38 %)**, de haut en bas :
  1. **Ressources** : nutriments (qui défilent) et production, Enzymes, Biomasse, barre du prochain palier ;
  2. **Propagation** *(11 octobre 2026)* : PV du Sporophore, poussée par case, **force utilisée / plafond** (une barre), nombre de cases de bordure, points chauds posés (x / 3) ;
  3. **Mes mutations** : une **seule ligne** d'icônes, une par mutation prise, avec son palier ; nom et effet dans l'info-bulle (décidé le 5 octobre 2026 : le cadre ne grandit plus) ;
  4. **Améliorations**, en onglets *Attaque*, *Défense*, *Économie*, avec le niveau, l'effet (avant → après), le coût et le choix ×1 / ×10 / Max ; une amélioration verrouillée indique le palier requis. Elles prennent toute la hauteur restante, en **lignes compactes** (54 px, décidé le 5 octobre 2026) ; les cadences s'écrivent au centième (0,22 tir/s) ;
- **Mutation** : aux paliers 2, 4 et 6, trois cartes s'affichent sur la carte assombrie (touches 1 à 3) ; la partie **ne s'arrête pas** pendant le choix ; les mutations prises sont listées dans le panneau (une icône par mutation, palier et effet dans l'info-bulle). Un **bouton avec un œil** cache les cartes pour voir la carte ; un bouton du panneau (« Choisir une mutation ») les rouvre (décidé le 4 octobre 2026).

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
- **Spores** : *supprimées le 11 octobre 2026* (plus de tir) ; remplacées par la pulsation de la bordure et le marqueur des points chauds (§5 bis.7).

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
- **Déplacement** : **clic du milieu** maintenu et souris contre les **bords de l'écran** ; **zoom** à la molette, centré sur la souris.
- **Clic gauche** : pose un point chaud sur une tuile qui n'est pas à moi, ou retire un point chaud (§5 bis.6).
- **Clic droit** sur un point chaud : le retire.
- **Raccourcis par défaut** : **Espace** recentre sur le Sporophore ; **P** pause (Bac à sable) ; **Échap** ouvre le menu de partie ; **1 à 3** choisissent une mutation quand les cartes sont affichées. Plus de touches de capacités (Q, W, E) depuis le 11 octobre 2026. Tous modifiables dans les Paramètres ; une touche ne sert qu'à une action ; un bouton remet les touches par défaut.

### 16.6 Paramètres
Affichage (plein écran, fenêtré, résolution, **thème clair / sombre / système**), audio, langue (français et anglais), commandes (raccourcis modifiables), accessibilité (taille de l'interface, palette adaptée au daltonisme).

---

## 17. Décisions du 4 octobre 2026

Toutes les propositions du brouillon ont été tranchées en QCM avec le propriétaire le 4 octobre 2026 et sont écrites plus haut. En résumé, ce qui diffère des propositions : à l'**élimination**, les cases de l'éliminé **redeviennent libres** (pas de transfert du territoire, pas de butin ni d'îlots) et le tueur reçoit un **Trophée** (+25 % de production cumulable, +100 Enzymes) ; à 30:00, **les éliminations départagent avant la production moyenne** ; seuls les **événements scriptés** restent (Floraison, Arbre mourant) ; l'**affrontement** arrive **dès G3**.

Deux petits points repris du brouillon sans question dédiée, à signaler si besoin : un nouveau clic remplace la cible désignée ; la colonie qui abat une Tourelle est celle dont le tir la fait tomber à 0 PV.

### Décisions de l'étape 1 de G3 (4 octobre 2026, QCM)
Le code de G1 et G2 qui ne sert plus est supprimé dès l'étape 1, avec un affichage provisoire du Bac à sable jusqu'à l'étape 2 ; cases coupées de la Tourelle : libres (§12) ; case libre prise : pleine vie (§6.1) ; la Tourelle finit sa prise avant de changer de cible (§5.3) ; spores en plus : d'autres cases (§9.2) ; pendant un pas, la Tourelle est visée sur sa case de départ (§5.5) ; choix de mutations empilés (§10) ; PV de la Tourelle : 400 fixes (§7.4).

### Décisions de l'étape 2 de G3 (4 octobre 2026, QCM)
Pas de touches pour les priorités de tir, 1 à 3 pour les cartes de mutation (§16.5) ; cartes de mutation cachées par un bouton œil et rouvertes depuis le panneau (§16.2) ; frise : horloge et fin de la protection jusqu'à G7 (§16.2) ; stades de la Tourelle liés au palier (§16.3).

### Réactivité (5 octobre 2026, QCM)
En partie locale, un ordre du joueur (achat, priorité, cible, pas, capacité, mutation) prend effet **au clic**, sans attendre le tick suivant ; les boutons d'action réagissent dès l'appui. Les à-coups de l'affichage à chaque tick sont réduits (calcul du tir et rafraîchissement du HUD plus rapides). En ligne (G9), la façon de faire sera revue.

### Décisions de G4 « Combattre des robots » (5 octobre 2026, QCM)
Prochain jalon limité au combat contre les robots, les événements passent en G5 (§19) ; robot de jeu à part, sans profil visible, équilibré, avec trois difficultés dans `data/` (Difficile = robots actuels, Normal agit toutes les 2 s, Facile toutes les 3 s et maladroit) (§2.5) ; en FFA, une difficulté pour les 5 robots, les profils sont réservés à la simulation (§2.3) ; secteur du joueur et couleurs de toutes les colonies tirés au hasard (graine) ; écrans dans le style actuel, sans maquette ; livraison en une fois ; menu Jouer → Duel ou FFA → difficulté, graine tirée au hasard ; quitter une partie en cours demande une confirmation ; éliminé en FFA : fin tout de suite avec son rang ; fin de partie minimale : rang, cases, Tourelles abattues, durée de survie, pic de production, boutons Rejouer (nouvelle partie, mêmes choix) et Menu ; Bac à sable : profils et robot de jeu (Facile, Normal, Difficile) au choix sur chaque secteur libre.

### Décisions de l'étape 3 de G3 (4 octobre 2026, QCM)
Bac à sable : un profil de robot par secteur libre (§2.1 bis) ; seul le Conquérant déplace sa Tourelle (§2.5, caduc depuis le 5 octobre 2026 : la Tourelle est fixe) ; panneau de simulations : une série = une composition de forêt (un robot par secteur), mesures par secteur (§18.5).

### Choix de l'étape 3 de G3, à confirmer
Points de comportement des robots et du panneau tranchés pour écrire le code, sans question dédiée (tous réglables dans `ai/profiles/` ou faciles à changer) :
1. Priorités de tir : Canonnier *Plus riche*, puis *Ennemis d'abord* quand ses cases sont visées ; Bâtisseur *Plus riche*, puis *Soigner d'abord* quand ses cases sont visées ; Conquérant toujours *Ennemis d'abord*. La priorité de défense est gardée au moins 10 s.
2. Canonnier et Conquérant désignent la Tourelle adverse la plus proche dès qu'elle est visable ; le Bâtisseur ne désigne jamais de cible.
3. *(Caduc depuis le 5 octobre 2026 : la Tourelle est fixe.)* Le Conquérant ne fait un pas que vers une de ses cases plus proche du centre, entourée d'au moins 4 de ses cases, avec 20 s d'attente entre deux pas.
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
5. *(Caduc depuis le 5 octobre 2026.)* Un pas est annulé si la case d'arrivée n'est plus à moi ; à l'arrivée, la case de départ est à pleine vie.
6. Les colonies tirent l'une après l'autre ; la première change à chaque tick, pour qu'aucune ne soit avantagée sur une case disputée.
7. Le Mur de mycélium protège mes cases (Tourelle comprise) autour de n'importe quelle case choisie ; le Nuage toxique vise une case à portée, même sans toucher mon territoire.
8. ×10 achète jusqu'à 10 niveaux tant qu'ils sont payables (refusé seulement si aucun ne l'est).
9. La mutation *Cohésion* double le bonus par voisine et son plafond (production +60 % au plus).
10. Améliorations et capacités suivent le palier actuel (comme les améliorations, §8.3).
11. Onglets du panneau : Attaque (Dégâts, Cadence, Portée, Spores, Éclaboussure, Critique, Rebond), Défense (Régénération, Soin, PV des cases, Écorce), Économie (Rendement).

### Réglages du Sporophore et bâtiments (5 octobre 2026, QCM)
Sporophore **fixe** : plus de déplacement, de touche D, de mutation *Rapide* (14 mutations) ni de pas des robots (§5.5) ; portée **2**, amélioration Portée limitée à **2 niveaux** (portée 4) ; **0,2 tir/s et 5 dégâts** (§6.3), sans compenser la régénération : prendre une case adverse demande des améliorations ou des bâtiments ; cadre « Mes mutations » réduit à **une ligne d'icônes** et lignes d'améliorations **compactes** (§16.2). **Bâtiments** (jalon G5, sans maquettes) : Essaimeur, Avant-poste, Mortier ; places par palier ; améliorations partagées ; cibles fixes par type ; PV propres ; bâtiment tombé endormi 60 s (intouchable) puis à la colonie qui tient sa case, réveillé à pleine vie et gardé même sans place ; bâtiment coupé du Sporophore : reste actif (§5 bis). Ensuite : Essaimeur qui tire sur les cases libres les plus proches ; pose par roue au clic droit ou bouton puis clic, glisser la carte au clic du milieu ; prix 10 / 20 / 40 Enzymes ; chantier 5 / 15 / 30 s ; « petits bâtiments » ; Mortier par-dessus le territoire, contre bâtiments et Sporophores seulement ; démolition (place rendue) ; Hyphes longues pour les bâtiments seulement ; améliorations de tir partagées ; régénération sans soin ; cible au clic partagée ; robots selon leur profil ; pictogrammes ; livraison en une fois (0.6.0).

### Décisions de G5 (6 octobre 2026, QCM)
Le Mortier peut abattre de loin un Sporophore ou un bâtiment ; un bâtiment coupé du Sporophore tient son îlot, qui grandit et reste à moi tant qu'il est relié à un de mes bâtiments ; les bâtiments d'une colonie éliminée s'endorment 60 s ; mutations de tir pour les bâtiments, sans la Salve ; chantier à 10 % de ses PV ; PV des bâtiments × amélioration PV des cases ; Mortier sans Éclaboussure ni Rebond ; revenu lent d'Enzymes ; Avant-poste sur les cases adverses seulement ; FFA à 2-3 survivants accepté (§5 bis, §5 ter, §8.1).

### Décisions du 11 octobre 2026 : propagation automatique (QCM ; jalon G6, rien de codé)
Les **bâtiments** sont supprimés et le Sporophore **ne tire plus** : c'est **toute la bordure qui pousse**, automatiquement (§5 bis). Force **mixte** : chaque case de bordure pousse seule, avec un **plafond global** qui monte avec l'amélioration *Vigueur* et les paliers ; le niveau de l'incrémental passe par les améliorations, les paliers et la nouvelle amélioration. Une case de bordure répartit sa poussée **à parts égales** entre ses voisines libres et adverses. **3 points chauds** posés au clic gauche (un 4e remplace le plus ancien, clic sur un point chaud pour le retirer, un point chaud pris disparaît), sur **toute tuile** (Sporophore adverse compris) ; ils reçoivent une **part fixe de 30 %** de la force, partagée entre les points chauds posés, et l'appliquent par la **bordure orientée** vers eux. Le Sporophore devient **un cœur seulement** et prend des dégâts **comme une case**. Améliorations : Dégâts et Cadence **fusionnées** en *Poussée* ; Portée, Soin, Spores par tir, Éclaboussure, Critique et Rebond **supprimées**. Mutations : Spores lourdes et légères, Hyphes longues, Guérisseur, Sporée, Pionnier, Prédateur et Toxique **supprimées** ; **une mutation tous les deux paliers**. **Toutes les capacités** supprimées. Enzymes **gardées sans usage** pour le moment, sans revenu lent. Robots : points chauds **selon leur profil**. Spécification dans le GDD, **nouveau jalon G6** (événements G7, habillage G8, multijoueur G9), équilibrage inclus.

### Décisions de G6 (11 octobre 2026, QCM)
Le Sporophore **pousse** comme une case de bordure (§5.1) ; points chauds **1 au départ, 2 au palier 1, 3 au palier 2**, et répartition des paliers **validée** telle que proposée (§8.3) ; valeurs de départ **validées** : poussée 1 PV/s par case, plafond 8 PV/s, Vigueur +20 % par niveau pour 2 U (§5 bis.2, §9.2) ; point chaud **refusé sur une de mes cases** ; pendant la protection, la part vers l'adversaire va **aux voisines libres** de la case de bordure (§3.1) ; *Glande* **retirée du tirage**, compteur d'Enzymes **affiché** ; **clic droit sur un point chaud** : le retire (§5 bis.6) ; tutoriel en 6 étapes **validé** (§2.7) ; cibles d'équilibrage : celles du §5 ter sauf « premier bâtiment » et « bâtiments décisifs », **plus** « **premier point chaud atteint vers 1:00** » et « **points chauds décisifs** » (un robot qui n'en pose jamais perd nettement contre un qui en pose) ; G6 **livré en une fois** (0.7.0). Pendant l'équilibrage (QCM) : le bonus des points chauds **s'ajoute** à la force au lieu d'être pris dessus (§5 bis.3) ; valeurs au §5 quater.

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
Autres terrains et souches, pactes, mode par équipes, forêts thématiques, classement du Duel, jalons d'amélioration tous les 25 niveaux, spore errante (îlots lointains), **événements aléatoires** (Orage, Incendie, Sanglier, Festin, Nématodes : repoussés le 4 octobre 2026).

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
- **Simulation autoritaire intégrée** : une seule simulation fait foi ; les joueurs envoient des **commandes** qu'elle valide : **acheter une amélioration**, **poser ou retirer un point chaud**, **choisir une mutation** (11 octobre 2026).
- **Solo (robots)** : la simulation tourne **dans l'exécutable**, sans réseau.
- **En ligne : hébergé par un joueur.** Pas de serveur à nous : l'**hôte** fait tourner la simulation, les autres s'y connectent par **Steam Networking Sockets** (relais Steam), via le `MultiplayerPeer` de GodotSteam. Hôte : le créateur du salon en partie personnalisée ; pour le Duel et le FFA publics, le propriétaire du salon Steam formé par la file d'attente.
- **Simulation à pas fixe : 1 tick par seconde** ; interpolation côté client pour l'animation (cases entamées, pulsation de la bordure). L'hôte envoie les **différences** par tick.
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
| **G4 : Combattre des robots** *(décidé le 5 octobre 2026 : uniquement le combat contre les robots ; livré le 5 octobre 2026, 0.5.0)* | Duel et FFA contre robots : menus Jouer, robots de jeu (3 difficultés, profils), **fin de partie minimale** (rang, statistiques de base, retour au menu) ; version **0.5.0** |
| **G5 : Bâtiments** *(décidé le 5 octobre 2026, sans maquettes ; livré le 6 octobre 2026, 0.6.0)* | Essaimeur, Avant-poste, Mortier (§5 bis) : simulation et tests, affichage et gestes de construction dans le style actuel, robots qui construisent ; version **0.6.0** |
| **G6 : Propagation automatique** *(décidée le 11 octobre 2026, livrée le même jour en une fois, 0.7.0)* | **Suppression** des bâtiments, du tir du Sporophore, des capacités et des améliorations et mutations liées au tir ; propagation par la bordure (poussée par case, plafond global), **3 points chauds**, panneau Propagation, robots qui posent des points chauds selon leur profil ; **équilibrage** par simulations ; version **0.7.0** |
| **G7 : Événements et fin de partie** | Floraison collective et Arbre mourant, frise, journal et alertes complets, écran de résultats complet, spectateur après élimination ; version **0.8.0** |
| **G8 : Habillage et bêta solo** | Tutoriel (8 étapes, §2.7), audio, profil et statistiques, traduction, essais avec de vrais joueurs (sans Steam) |
| **G9 : Multijoueur** | Étape 1 : tests entre amis avec l'App ID 480 (Steam, salons, invitations, relais, hébergement par un joueur, empreinte, déconnexion). Étape 2 : file d'attente, FFA et Duel entre joueurs, partie personnalisée complète, chat, interface d'administration |

**Hors feuille de route** : page Steam, App ID réel (Steam Direct, 100 $), succès et Steam Playtest, dès que le propriétaire décide de payer.

La simulation ne reçoit que des **commandes** depuis G1 : le passage en ligne consiste surtout à la faire tourner chez l'hôte et à brancher le réseau Steam.

Le 5 octobre 2026, les **bâtiments** deviennent **G5** ; les jalons suivants sont décalés d'un cran (événements G6, habillage G7, multijoueur G8).

Le 11 octobre 2026, la **propagation automatique** devient **G6** (elle remplace les bâtiments) ; les jalons suivants sont à nouveau décalés d'un cran (événements G7, habillage G8, multijoueur G9).

---

## 20. Questions en attente des jalons suivants

Elles seront posées sous forme de QCM au début du jalon concerné.

### G6 : Propagation automatique (§5 bis)
*Toutes tranchées le 11 octobre 2026 (QCM), voir §17 « Décisions de G6 ».* Restent, après l'équilibrage (§5 quater) :
1. Le robot Facile gagne 40 % de ses Duels contre Normal (cible : 20 % au plus) : comment l'affaiblir (moins de points chauds, points chauds au hasard, autre chose) ?
2. La Clairière (zone 6) n'est presque jamais prise : est-ce voulu ?

### G5 : Bâtiments
*Caduc depuis le 11 octobre 2026 : les bâtiments sont supprimés.*

### G4 : Combattre des robots
*Questions 1 à 8 et 10 tranchées le 5 octobre 2026 (§17, « Décisions de G4 ») ; restent 9 et 11.*
1. Profils des robots : les robots de jeu reprennent-ils les profils Canonnier, Bâtisseur et Conquérant du panneau de simulations (§2.5, §18.5) ?
2. Valeurs des difficultés Facile, Normal, Difficile (délai de réaction, part d'erreurs, profondeur d'évaluation, qualité du choix des améliorations, des priorités et des cibles).
3. « Mêmes limites qu'un joueur » : nombre maximal de commandes par seconde pour un robot ?
4. FFA contre robots : une difficulté pour tous ou une par robot (« mélange ») ? Profils choisis ou tirés au hasard ?
5. Secteur et couleur du joueur en Duel et en FFA : choisis ou tirés au hasard ? Ordre des couleurs pour 2 et 6 colonies (daltonisme compris) ?
6. Quitter une partie en cours : défaite enregistrée ? Confirmation demandée ?
7. Éliminé en FFA contre robots, sans accélération possible : on attend la fin en spectateur ou on quitte avec son rang (le spectateur complet arrive en G7) ?
8. Fin de partie minimale : quelles statistiques de base (cases, Tourelles abattues, durée de survie, pic de production) et quels boutons (rejouer, menu) ? L'écran de résultats complet arrive en G7.
9. Replay en timelapse (§14.4) : dans quel jalon ?
10. Robots dans le Bac à sable : leur ajoute-t-on une difficulté ?
11. Panneau de simulations : ajoute-t-on d'autres mesures de combat (éliminations avant 26:00, effet des Trophées, mutations prises) ?

### G8 : Habillage et bêta solo
1. Tutoriel : quelle forêt (« petite forêt de Duel » : rayon 5 ?) ? Faut-il d'autres étapes que les 8 du §2.7 ?
2. Audio : style de la musique et des bruitages ; qui les produit (banques libres de droits, compositeur, autre) et sous quelle licence ?
3. Profil et statistiques : enregistrés sur le PC (`user://`), liés au compte Steam ? Sauvegarde Steam Cloud ?
4. Langues : français et anglais seulement ?
5. Paramètres audio et accessibilité (taille de l'interface, palette adaptée au daltonisme, §16.6) : quel jalon ?
6. Icône définitive et logo : qui les fait ?
7. Numéro de version de la bêta solo.

### G9 : Multijoueur
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
3. Le panneau de simulations doit-il pouvoir comparer des robots de difficultés différentes à partir de G4 ?
