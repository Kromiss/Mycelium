# MYCÉLIUM : LAST COLONY — Architecture et normes de code (Godot)

> Document technique de référence pour le développement. Il complète le GDD (`docs/GDD_Mycelium_Godot.md`), qui décrit le jeu ; celui-ci décrit **comment le code est organisé et écrit**. Moteur : **Godot 4.6** (épinglé sur 4.6.3), **GDScript typé**, cible **Windows (.exe)**, distribution **Steam**.

---

## 1. Principes

1. **La simulation est le jeu.** Toutes les règles vivent dans une couche de code pur, sans nœud, sans affichage ni son. Tout le reste (écran, robots, réseau) tourne autour.
2. **Tout passe par des commandes.** Un clic, un geste, une décision de robot ou un message réseau deviennent une **commande** ; seule la simulation modifie l'état.
3. **Déterminisme.** Même graine + mêmes commandes = même partie, au bit près. C'est la base des replays, de la vérification de l'hôte et des simulations d'équilibrage.
4. **Le multijoueur est un branchement.** Le jeu solo utilise déjà le même chemin que le jeu en ligne ; le dernier jalon ne fait que remplacer le transport local par le transport Steam.
5. **Aucun chiffre d'équilibrage dans le code.** Tous les chiffres du GDD vivent dans des ressources de données.
6. **Testable sans écran.** Tout ce qui peut être vérifié par un test l'est, en ligne de commande, sans ouvrir l'éditeur.

---

## 2. Vue d'ensemble

```
 Joueur (souris, clavier)        Robot (ai/)          Script du tutoriel
          │                          │                        │
          ▼                          ▼                        ▼
      ┌───────────────────────── Commande ─────────────────────────┐
      │                                                             │
      ▼                                                             │
  Transport (net/)  ── local : appel direct                         │
                    ── Steam : envoi à l'hôte                       │
      │                                                             │
      ▼                                                             │
  Simulation (sim/)  ── chez l'hôte ou en local, 1 tick par seconde │
      │   valide les commandes, applique les règles                 │
      ▼                                                             │
  Différences du tick (cases changées, ressources, événements)      │
      │                                                             │
      ▼                                                             │
  Session (game/)  ── met à jour l'état local, émet des signaux ────┘
      │
      ├──► Affichage (view/) : carte, colonies, fronts, effets
      └──► Interface (ui/)   : HUD, alertes, frise, classement
```

**Règle d'or** : les flèches ne remontent jamais. L'affichage ne modifie pas l'état ; la simulation ne connaît ni l'affichage, ni le réseau, ni les robots.

---

## 3. Arborescence

```
res://
├── project.godot
├── autoload/                 Singletons (3 maximum)
│   ├── settings.gd           Paramètres du joueur : les applique (thème, langue, fenêtre) et les enregistre
│   ├── settings_store.gd     Valeurs des paramètres et lecture/écriture du fichier (testable seul)
│   ├── steam_service.gd      Accès à GodotSteam (initialisation, identité, amis, salons) — jalon G6
│   └── scene_router.gd       Changement d'écran (menu, partie, résultats)
├── sim/                      Règles du jeu, code pur (RefCounted uniquement)
│   ├── simulation.gd         Point d'entrée : tick(commandes) -> TickResult, requêtes pour l'interface
│   ├── tick_result.gd        Différences d'un tick et empreinte
│   ├── replay.gd             Enregistrement d'une partie (définitions, graine, commandes) et rejeu
│   ├── dict_read.gd          Lecture sûre des dictionnaires venus d'un fichier ou du réseau
│   ├── defs/                 Classes des ressources de data/ (ZoneDef, TierDef, BalanceDef, BuildingDef…), SimDefs et SimBuilding (copie d'un bâtiment)
│   ├── state/
│   │   ├── forest_map.gd     Cases, zones, terrains et table des voisines
│   │   ├── game_state.gd     État complet de la partie (tableaux compacts)
│   │   ├── colony_state.gd   État d'une colonie (ressources, palier, file d'expansion…)
│   │   └── front_state.gd    Fronts en cours
│   ├── systems/              Un fichier par domaine de règles
│   │   ├── command_system.gd   Validation et application des commandes
│   │   ├── expansion.gd        Règles de colonisation et de file, partagées avec les requêtes
│   │   ├── buildings.gd        Règles du city builder (pose, file de construction, chantiers, démolition, activation, effets), partagées avec les requêtes
│   │   ├── growth_system.gd    Pousse des cases, chantiers
│   │   ├── combat_system.gd    Fronts, prises, actions actives, élimination
│   │   ├── economy_system.gd   Production, réseau, stock, Enzymes
│   │   ├── tier_system.gd      Paliers, activation et désactivation des bâtiments
│   │   ├── event_system.gd     Frise, événements aléatoires
│   │   └── victory_system.gd   Fin de partie, départage
│   ├── commands/             Une classe par commande + la classe de base
│   ├── hex.gd                Coordonnées axiales, voisins, distances, anneaux
│   ├── map_generator.gd      Génération de la forêt (secteurs, zones) depuis la graine
│   ├── fixed.gd              Calcul en entiers à virgule fixe
│   ├── sim_rng.gd            Aléatoire à graine, propre à la simulation
│   └── state_hash.gd         Empreinte de l'état (vérification de l'hôte, tests)
├── ai/                       Robots
│   ├── economy_robot.gd      G1 : robot d'économie (4 profils d'expansion), repris en G4
│   ├── robot.gd              Lit l'état, produit des commandes
│   ├── evaluators/           Évaluation par utilité (coloniser, bâtir, attaquer, défendre)
│   └── profiles/             Profils et difficultés (.tres)
├── net/                      Transport des commandes et des différences
│   ├── transport.gd          Interface commune
│   ├── local_transport.gd    Solo, tutoriel, tests
│   ├── replay_transport.gd   Rejeu d'une partie enregistrée (panneau de simulations, replays)
│   └── steam_transport.gd    En ligne : hôte ou invité (jalon G6)
├── game/
│   ├── session.gd            Relie simulation, transport, robots et affichage
│   ├── sandbox_screen.tscn   Partie de Bac à sable (carte, colonie, gestes, caméra, HUD)
│   ├── sandbox_config.gd     Réglages d'une partie de Bac à sable (mode, graine, SimDefs)
│   ├── sandbox_recap.gd      Texte du récapitulatif copiable
│   ├── local_view_state.gd   Copie de l'état côté affichage (mise à jour par différences)
│   └── tutorial_director.gd  Étapes du tutoriel
├── view/                     Affichage de la partie (lecture seule)
│   ├── map/                  Cases-bulles (MultiMeshInstance2D), zones (shader)
│   ├── colony/               Colonie (G1 : cases colorées, Cœur, pousse, colonisables, file, onde) ; bâtiments (G2 : building_layer.gd, building_icons.gd) ; plus tard taches arrondies
│   ├── fronts/               Fronts et jauges de pression (Line2D + shader)
│   ├── effects/              Ondes de palier, particules, Floraison
│   ├── camera/               Caméra 2D (déplacement, zoom)
│   └── input/                Gestes : clic, glisser, balayer -> commandes
├── ui/                       Écrans et HUD (nœuds Control)
│   ├── menus/  hud/  sandbox/  lobby/  settings/  results/  tutorial/  admin/
│   │                         (hud/ en G2 : palette, menu rond, panneau d'un bâtiment, file de construction, textes des bâtiments)
│   ├── number_format.gd      Grands nombres (K, M, B, T), multiplicateurs, horloge
│   ├── controls_text.gd      Nom des touches liées aux actions
│   └── theme_factory.gd      Construit le thème de l'interface à partir d'une palette
├── data/                     Équilibrage et contenu (ressources .tres)
│   ├── balance.tres          Constantes générales (tick, base de coût, butin…)
│   ├── zones.tres            Les 6 zones (richesse, coût, pousse, prise)
│   ├── tiers.tres            Paliers (seuils, multiplicateurs, déblocages)
│   ├── buildings.tres        Liste des bâtiments (G2)
│   ├── buildings/            Un .tres par bâtiment
│   ├── events/               Un .tres par événement
│   ├── modes/                Duel, FFA, valeurs par défaut des parties personnalisées
│   ├── palettes/             light.tres et dark.tres : couleurs de l'interface et de la carte
│   └── colors.tres           Les 12 couleurs de colonie (principale et foncée) — jalon G1
├── assets/                   fonts/, icons/ (dont icons/buildings/ : pictogrammes SVG en trait blanc, teintés à l'affichage), audio/, shaders/
├── i18n/
│   └── translations.csv      Textes FR et EN
├── tools/
│   ├── capture.gd            Captures d'écran d'un écran du jeu (menus, Bac à sable, partie jouée N secondes, menu de partie, fin), pour validation visuelle
│   ├── sim_runner.gd         Lots de parties de robots (simples ou balayages), en parallèle — jalon G1, étendu en G4
│   ├── simulation/           Une partie mesurée (sim_run), ses mesures, statistiques, tableau et CSV
│   └── simulation_panel/     Panneau de simulations (éditeur seulement)
├── tests/
│   ├── unit/                 Un fichier de test par système
│   ├── integration/          Parties complètes, déterminisme, scènes
│   └── fixtures/             Forêts et situations de test
└── addons/                   GUT (tests), GodotSteam (G6)
```

---

## 4. La simulation (`sim/`)

### 4.1 L'état
- `GameState` contient tout ce qui définit la partie à un instant donné : numéro du tick, graine, carte, colonies, fronts, événements en cours.
- La carte est stockée en **tableaux compacts** indexés par numéro de case (`PackedInt32Array`, `PackedInt64Array`) : terrain, zone, propriétaire, bâtiment, état du bâtiment, progression de pousse, de construction et de prise.
- Les colonies sont des objets `ColonyState` (ressources, palier, Cœur, Sclérote, recharges, statistiques).
- **Aucune référence vers un nœud**, aucune dépendance à l'affichage.

### 4.2 Le tick
`Simulation.tick(commands: Array[Command]) -> TickResult`, appelé une fois par seconde de jeu. Ordre **fixe** :

| Ordre | Système | Rôle |
|---|---|---|
| 1 | `CommandSystem` | Trie les commandes (joueur, puis ordre d'arrivée), les valide, applique les valides, refuse les autres avec une raison |
| 2 | `GrowthSystem` | Avance la pousse des cases et les chantiers |
| 3 | `CombatSystem` | Fait avancer les fronts (attaque contre résistance et renfort), applique les actions actives, traite les éliminations et le butin |
| 4 | `TierSystem` | Recalcule les paliers, active ou désactive les bâtiments |
| 5 | `EconomySystem` | Réseau (cases reliées au Cœur), production, plafond de stock, Enzymes, biomasse |
| 6 | `EventSystem` | Déclenche et fait avancer les événements de la frise |
| 7 | `VictorySystem` | Fin de partie, classement, départage à 30:00 |
| 8 | `StateHash` | Calcule l'empreinte de l'état |

Dans `GrowthSystem`, la file d'expansion démarre ce qui peut l'être, **puis** toutes les pousses avancent d'un tick : une pousse de N secondes lancée au tick t (par un clic ou par la file) se termine à la fin du tick t + N − 1, et la case rejoint le réseau pour le tick suivant. Un clic direct est traité à l'étape 1, avant la file : il passe devant elle (GDD §4.4).

`TickResult` contient les **différences** (cases modifiées, ressources des colonies, événements déclenchés, commandes refusées) et l'**empreinte**.

### 4.3 Les commandes
- Classe de base `Command` : `tick`, `colony_id`, `type`. Les commandes qui visent une case héritent de `CellCommand` (case en coordonnées axiales). Une sous-classe par action : `ColonizeCommand` (clic direct), `EnqueueCommand` et `DequeueCommand` (file d'expansion) en G1, puis `BuildCommand`, `DemolishCommand`, `MoveHeartCommand`, `OpenFrontCommand`, `SetFrontRateCommand`, `StopFrontCommand`, `ReinforceCommand`, `ActiveActionCommand`.
- Chaque commande sait se **convertir en dictionnaire et inversement** (`to_dict()`, `from_dict()`), pour le réseau et les replays.
- La validation renvoie un code de refus explicite (`Refusal.Code` : `NOT_ADJACENT`, `NOT_ENOUGH_NUTRIENTS`, `QUEUE_FULL`…, puis `TIER_LOCKED`…) que l'interface traduit en message. L'interface peut demander à l'avance si une commande serait acceptée (`Simulation.check_colonize()`, `check_enqueue()`, `check_build()`, `check_demolish()`), ainsi que le coût, la durée de pousse et la production d'une case, et le coût d'un bâtiment (`building_cost()`).

### 4.3 bis Les bâtiments *(G2)*
- Sur chaque case : `building` (indice du bâtiment dans `SimDefs.buildings`, −1 si aucun), `building_state` (`NONE`, `QUEUED`, `CONSTRUCTING`, `BUILT`), `build_left` (secondes de chantier restantes), `building_paid` et `building_paid_enzymes` (prix payé, pour les remboursements) et `building_active` (construit et palier atteint). Chaque colonie a ses `enzymes`, son `stock_cap`, sa file de construction (`build_queue`) et ses chantiers (`constructing`), dans l'ordre d'ajout.
- `GrowthSystem` démarre ensuite les bâtiments de la file (en sautant ceux dont le palier n'est plus atteint) tant qu'un chantier est libre, puis fait avancer les chantiers : un bâtiment de N secondes posé au tick t est construit à la fin du tick t + N − 1 si un chantier est libre.
- La progression d'une pousse est en **millièmes de seconde** : chaque tick retire la vitesse de pousse de la case (1000, ou 1000 ÷ 0,7 près d'une Pépinière active), recalculée à chaque tick.
- `TierSystem` recalcule `building_active` après les paliers ; `EconomySystem` applique le bonus des bâtiments actifs à la production des cases, ajoute les Enzymes des Glandes reliées au Cœur, puis plafonne le stock de nutriments (la Biomasse compte toute la production, plafond ou pas).

### 4.4 Règles de déterminisme
1. **L'état ne contient que des entiers.** Les quantités sont en **millièmes** (`int` 64 bits) : 12,5 nutriments = `12500`. Les multiplicateurs sont en **pour-mille** (×1,12 = `1120`).
2. Les calculs passent par `Fixed` (`Fixed.mul(a, b)`, `Fixed.pow_table(...)`). Les puissances (`1,12 ^ n`, `1,02 ^ n`) viennent de **tables précalculées** au chargement des données.
3. **Aucun aléatoire global** : jamais `randf()`, `randi()`, `randomize()`. Uniquement `SimRng`, initialisé avec la graine de la partie.
4. **Aucune notion d'heure** : jamais `Time`, `OS.get_ticks_msec()` ni `delta` dans `sim/`. Le temps, c'est `state.tick`.
5. **Ordre de parcours fixe** : on parcourt les tableaux par index ; on ne dépend jamais de l'ordre d'un `Dictionary` construit à partir de données externes.
6. **Aucun nœud** : les classes de `sim/` héritent de `RefCounted`.

### 4.5 Grands nombres
Fin de partie visée : ~1e6 nutriments/s, soit ~1e9 en millièmes par seconde ; sur 30 min, la biomasse cumulée reste sous ~1e13, très loin de la limite d'un entier 64 bits (~9,2e18). Un test vérifie qu'aucune valeur ne dépasse un seuil de sécurité dans les parties de robots.

---

## 5. Les données (`data/`)

- Chaque élément de contenu est une **ressource typée** : `BuildingDef`, `ZoneDef`, `TierDef`, `EventDef`, `ModeDef` (classes déclarées dans `sim/defs/`, champs exportés).
- Exemple : `data/buildings/digestion_node.tres` contient l'identifiant, le coût en U, le palier de déblocage, la règle de pose, les effets et les synergies.
- La simulation reçoit les définitions **au démarrage de la partie**, sous la forme d'un `SimDefs` : une copie en entiers de tous les chiffres (`SimDefs.from_mode()` lit `zones.tres`, `tiers.tres`, `balance.tres` et le mode). Elle ne charge rien elle-même pendant les ticks. `SimDefs.prepare()` calcule les valeurs dérivées (durées de pousse par zone, table de puissances du coût) ; `validate()` signale les réglages absurdes ; `to_dict()` / `from_dict()` servent aux replays et au récapitulatif du Bac à sable.
- Les paramètres d'une partie personnalisée ou du **Bac à sable** **surchargent** les valeurs du mode, sans jamais modifier les fichiers.
- Changer un chiffre d'équilibrage = modifier un `.tres`, relancer les tests et le `sim_runner`.

---

## 6. Les robots (`ai/`)

- Un robot reçoit l'état (en lecture seule) et renvoie une liste de commandes, **à la même fréquence et avec les mêmes limites qu'un joueur**.
- Décision par **utilité** : chaque évaluateur note les actions possibles (coloniser telle case, construire tel bâtiment, ouvrir un front et régler son débit, renforcer, migrer le Cœur) ; le robot choisit les meilleures.
- **Difficulté** = délai de réaction, part d'erreurs, profondeur d'évaluation, qualité du choix des fronts et des débits. **Profil** = poids des évaluateurs (bâtisseur, expansionniste, agressif).
- Les robots utilisent leur propre `SimRng` dérivé de la graine : une partie de robots est donc **rejouable à l'identique**.
- **G1** : premiers robots d'économie (profils Hasardeux, Rentable, Rapide, Centre, GDD §14.5), qui ne font que coloniser ; ils servent au panneau de simulations et seront repris par les robots complets de G4. `EconomyRobot.decide()` renvoie au plus un `EnqueueCommand` par tick (file gardée pleine) ; la « production ajoutée » d'une case vient de `EconomySystem.added_production()`, pour que la règle reste dans `sim/`.

---

## 7. Transport et multijoueur (`net/`)

- `Transport` est une interface : `send_command(cmd)`, `advance()` (joue le prochain tick, en local ou chez l'hôte), signal `tick_received(result)`.
- `LocalTransport` : la simulation tourne dans le jeu ; les commandes sont transmises directement et jouées au prochain tick. Il les enregistre dans un `Replay` avec l'empreinte de chaque tick. Utilisé en solo, dans le Bac à sable, le tutoriel et les tests.
- `SteamTransport` (jalon G6) :
  - **Hôte** : fait tourner la simulation, reçoit les commandes des invités par Steam Networking Sockets, envoie les différences et l'empreinte de chaque tick.
  - **Invité** : envoie ses commandes, applique les différences, **rejoue la simulation localement** à partir des commandes et compare l'empreinte ; un écart arrête la partie et la signale.
- Le reste du jeu (`game/`, `view/`, `ui/`) ne sait pas quel transport est utilisé.

---

## 8. Session, scènes et singletons

- `Session` (`game/session.gd`) assemble une partie : crée la simulation et le transport, inscrit les robots, cadence les ticks (1 par seconde, ×2 ou ×4 en Bac à sable), met à jour `LocalViewState` et émet des **signaux** (`ticked`, `paused_changed`, `speed_changed` en G1 ; `cell_changed`, `tier_reached`, `colony_eliminated`… quand l'affichage en aura besoin). `start_local(defs, graine, colonies, time_control)` lance une partie locale ; la pause et la vitesse ne répondent que si `time_control` est vrai (Bac à sable). `send_command()` renvoie faux, sans rien envoyer, pendant la pause ou une fois la partie finie ; `game_finished` est émis quand la simulation atteint sa durée maximale (`VictorySystem`, 30:00), après quoi plus aucun tick n'est joué. `production_history` garde la production de la colonie locale à chaque tick (courbe du HUD). En G1, l'affichage lit directement l'état de la simulation locale ; `LocalViewState` arrive avec le jeu en ligne. `advance_time()` joue les ticks dus (8 au plus par image) et `tick_fraction()` donne l'avancement vers le prochain tick, pour interpoler l'affichage.
- **Singletons limités à trois** : `Settings`, `SceneRouter` et, au jalon G6, `SteamService`. `SteamService` est **facultatif** : les modes locaux (joueur et robots : Bac à sable, Duel et FFA contre robots, tutoriel) sont **isolés des modes en ligne** et fonctionnent sans Steam ni GodotSteam. Aucun code de `sim/`, `ai/`, `game/` ni des écrans des modes locaux ne dépend de `SteamService` ou de `SteamTransport` ; seuls `net/steam_transport.gd` et les écrans du multijoueur (salons, invitations, file d'attente) y touchent. L'état de la partie n'est **jamais** dans un singleton : il appartient à la `Session` en cours.
- Une scène par écran (`ui/menus/main_menu.tscn`, `ui/hud/hud.tscn`…), une scène par élément réutilisable (bouton de bâtiment, ligne de classement).

---

## 9. Affichage et interface (`view/`, `ui/`)

- L'affichage **écoute** les signaux de la `Session` et lit `LocalViewState`. Il ne modifie jamais l'état.
- G1 : `view/input/map_input.gd` (clic, touche de file + clic, tracé), `view/colony/colony_layer.gd` (dessin de la colonie et onde, couleurs des bulles via `ForestView.set_bubble_color()`), `ui/hud/` (HUD, courbe, info-bulle, menu de partie, panneau de fin). Avant d'envoyer une commande, l'interface demande à la simulation si elle serait acceptée (`check_colonize()`, `check_enqueue()` avec les cases déjà envoyées pour le prochain tick) : les règles restent dans `sim/`.
- `view/input/` transforme les gestes en commandes : clic (sélection, colonisation), glisser (tracer un front), balayer (Coupure), maintenir (Assaut) ; gestes des fronts et des actions à préciser en G3. Les seuils des gestes (distance, durée) sont dans `data/balance.tres`.
- Entre deux ticks, l'affichage **interpole** (jauges qui se remplissent, compteurs qui défilent) pour que le jeu reste fluide à 60 images/s malgré une simulation à 1 tick/s.
- Thèmes : deux palettes (`data/palettes/light.tres` et `dark.tres`, classe `Palette`) ; `ThemeFactory` en construit le thème de l'interface et `Settings` l'applique à la fenêtre. Les contrôles placés dans un `CanvasLayer` n'héritent pas du thème de la fenêtre : l'écran doit le leur appliquer (`Settings.ui_theme`).
- Thème au premier lancement : **Système** (suit le réglage clair ou sombre de Windows).
- Textes : **toujours** par clé de traduction (`tr("HUD_NUTRIENTS")`), jamais de texte affiché écrit en dur.

---

## 10. Normes de codage

### 10.1 Langue
- **Noms en anglais** : fichiers, classes, fonctions, variables, signaux, clés de traduction (cohérent avec l'API de Godot).
- **Commentaires en français**, y compris les commentaires de documentation (`##`).
- Messages de commit en français.

### 10.2 Style (guide officiel de GDScript)
| Élément | Convention | Exemple |
|---|---|---|
| Fichiers | `snake_case` | `economy_system.gd` |
| Classes (`class_name`) | `PascalCase` | `EconomySystem` |
| Fonctions, variables | `snake_case` | `compute_production()` |
| Privé | préfixe `_` | `_cohesion_bonus()` |
| Constantes, énumérations | `CONSTANT_CASE` | `MAX_FRONTS` |
| Signaux | `snake_case`, au passé | `cell_captured` |
| Nœuds dans les scènes | `PascalCase` | `BuildingPalette` |

Ordre dans un fichier : `class_name`, `extends`, commentaire `##` de la classe, signaux, énumérations, constantes, variables exportées, variables publiques, variables privées, méthodes de Godot (`_ready`…), méthodes publiques, méthodes privées.

### 10.3 Typage et avertissements
- **Typage statique partout** : paramètres, retours, variables, tableaux typés (`Array[Command]`).
- Dans les paramètres du projet, les avertissements suivants sont réglés en **erreur** : déclaration non typée, accès non sûr à une propriété ou une méthode, conversion non sûre, variable inutilisée. Le « retour ignoré » reste un simple avertissement : sinon chaque `connect()` devrait stocker un code d'erreur inutile.

### 10.4 Règles de conception
- Une classe par fichier, des fonctions courtes (≈ 40 lignes maximum).
- **On appelle vers le bas, on signale vers le haut** : pas de `get_parent()` en chaîne, pas de chemins de nœuds fragiles ; `%NomUnique` pour les références internes à une scène.
- Pas de nombre magique : constante nommée ou donnée de `data/`.
- Les règles du jeu n'apparaissent **que** dans `sim/` ; si l'interface a besoin d'un calcul (par exemple un coût affiché), elle appelle la fonction de la simulation.

### 10.5 Exemple
```gdscript
class_name EconomySystem
extends RefCounted
## Calcule la production de chaque colonie à chaque tick :
## rendement des cases reliées au Cœur, paliers et plafond de stock.

const PER_MILLE: int = 1000

var _defs: SimDefs


func _init(defs: SimDefs) -> void:
	_defs = defs


## Applique la production d'un tick à toutes les colonies vivantes.
func run(state: GameState, result: TickResult) -> void:
	for colony: ColonyState in state.colonies:
		if not colony.alive:
			continue
		var produced: int = _colony_production(state, colony)
		# Le stock ne dépasse jamais son plafond : l'excédent est perdu.
		colony.nutrients = mini(colony.nutrients + produced, colony.stock_cap)
		colony.biomass += produced
		result.colony_changed(colony.id)


## Production d'une colonie en millièmes de nutriment par tick.
func _colony_production(state: GameState, colony: ColonyState) -> int:
	var total: int = 0
	for cell: int in colony.cells:
		total += _cell_production(state, cell)
	# Chaque palier double la production (table précalculée en pour-mille).
	return Fixed.mul(total, _defs.tier_multiplier(colony.tier))
```

---

## 11. Tests

### 11.1 Outils
- **GUT** (Godot Unit Test), installé dans `addons/gut/`.
- Lancement sans affichage, en ligne de commande :
  `godot --headless -s addons/gut/gut_cmdln.gd -gdir=res://tests -ginclude_subdirs -gexit`

### 11.2 Ce qui est testé
| Niveau | Contenu | Exemples |
|---|---|---|
| **Unitaire** (`tests/unit/`) | Chaque système de `sim/`, `hex.gd`, `fixed.gd`, `map_generator.gd`, la validation de chaque commande | Coût de colonisation par zone ; Cohésion ; un bâtiment se désactive sous son palier et se réactive au-dessus ; un bâtiment capturé passe actif ou désactivé selon le palier du capteur ; le butin d'élimination ; le départage à 30:00 ; les secteurs sont identiques pour 2, 3 et 6 colonies |
| **Intégration** (`tests/integration/`) | Parties complètes de robots, sauvegarde et rejeu | **Déterminisme** : deux exécutions avec la même graine donnent la même empreinte à chaque tick ; un replay redonne la même partie ; aucun nombre ne déborde ; une partie se termine toujours à 30:00 au plus tard |
| **Scènes** | Chargement de chaque scène sans erreur | Chaque `.tscn` s'instancie ; le HUD réagit aux signaux d'une session factice |
| **Données** | Cohérence des `.tres` | Chaque bâtiment a un palier existant ; aucun coût nul ; chaque texte a sa traduction FR et EN |

### 11.3 Simulations d'équilibrage (`tools/sim_runner.gd`)
Dès G1, le `sim_runner` est piloté par le **panneau de simulations** (GDD §14.5), une scène de `tools/simulation_panel/` ouverte depuis le menu principal seulement quand `OS.has_feature("editor")` est vrai. Le dossier `tools/` est exclu de l'export (`export_presets.cfg`) : le panneau, le `sim_runner` et ses mesures n'existent dans aucun `.exe`. Rien dans les dossiers exportés ne les nomme comme type : le menu ne connaît que le chemin de la scène, et `SceneRouter` garde l'état du panneau dans une variable non typée. Les parties d'un lot tournent sur les fils de travail de Godot (`WorkerThreadPool`), chacune avec ses propres définitions et sa propre simulation ; une partie de 30 min prend quelques secondes. Chaque partie garde son enregistrement (`Replay`), que `ReplayTransport` rejoue sur la carte. Les simulations tournent sans affichage, avec une barre de progression ; les résultats (moyenne, min, max, écart type) s'exportent en CSV dans `user://`.

Lance des centaines de parties de robots sans affichage et en temps accéléré, puis écrit un rapport (CSV) : minute d'arrivée dans chaque zone, courbe de production, nombre d'éliminations avant 26:00, parties finies au temps, efficacité des fronts, effet du butin. C'est l'outil qui répond aux questions « À simuler » du GDD.

### 11.4 Ce qui n'est pas couvert par les tests automatiques
Le ressenti (rythme, plaisir des gestes, lisibilité), le rendu visuel, les performances sur un vrai PC, l'exécutable Windows et tout ce qui passe par Steam : ces points se vérifient **en jouant** (G5 et G6).

---

## 12. Dépôt et outils

### 12.1 Dépôt
- **Dépôt : `Kromiss/Mycelium`**, dédié uniquement à la version Godot. L'ancienne version web est conservée dans la branche **`archive/web`** (créée à partir de `dev`, version web 0.10.0) ; les anciennes branches de travail sont supprimées.
- **Git** : `.godot/` et les exports ignorés. Images, polices et sons sont stockés **directement dans git, sans Git LFS** (les sessions Claude n'ont pas accès au stockage LFS de GitHub) ; à reconsidérer si des fichiers lourds arrivent.
- **Messages de commit en français.**

### 12.2 Branches et livraison
- `claude/<tâche>` : une branche par fil de travail.
- `dev` : branche d'intégration. On y pousse après rebase, en avance rapide uniquement.
- `main` : reçoit uniquement des PR `dev → main`, **fusionnées par le propriétaire**.

### 12.3 Vérification automatique (GitHub Actions)
- **Workflow `CI`** (à chaque envoi sur `dev` et chaque PR) : un job nommé **`check`** (nom conservé pour les règles de protection déjà en place sur `main` et `dev`) qui enchaîne formatage (`gdformat --check`), vérification (`gdlint`), import du projet, tests GUT sans affichage et export Windows de contrôle.
- **Workflow de build** (à chaque fusion sur `main`) : exporte `Mycelium.exe` et crée automatiquement une **version GitHub préliminaire** `v<version>-build.<n>` (par exemple `v0.1.0-build.12`) avec le `.exe` joint.
- **Workflow `Release`** (lancé à la main en fin d'itération) : crée la version définitive `v0.x.0` avec le `.exe`.
- Godot et ses modèles d'export sont téléchargés en version **4.6.3** exacte dans les workflows.

### 12.4 Versions
- Numérotation **semver à partir de 0.1.0** ; `0.x.0` par itération, `0.x.y` pour un correctif ; nouveau `CHANGELOG.md` (l'ancien reste dans `archive/web`).
- La version du jeu est celle de `project.godot` (`application/config/version`).

### 12.5 Export
- Préréglage « Windows Desktop » 64 bits, versionné dans `export_presets.cfg` (sans secret) ; fichier **`Mycelium.exe`**, nom affiché « Mycelium : Last Colony », icône provisoire.
- **Moteur de rendu : Compatibilité** (OpenGL 3).
- **Formatage et vérification** : gdtoolkit (`gdformat`, `gdlint`), configurés pour le style du §10.
- **Versions** : Godot épinglé sur **4.6.3** (dernier correctif de la 4.6) ; GUT **9.6.1** (vérifié avec cette version ; GUT 9.7 exige Godot 4.7) ; gdtoolkit **4.5.0**. Tout le monde, la vérification automatique et les exports utilisent exactement la même version. Toute montée de version (correctif 4.6.x ou passage à 4.7) passe par les tests de déterminisme.

---

## 13. Mise en place par jalon

| Jalon | Code concerné |
|---|---|
| G0 | Transformation du dépôt, arborescence, autoloads, thèmes, traductions, `hex.gd`, `map_generator.gd` (zones uniquement), rendu de la carte, caméra, menu principal, écran Paramètres, GUT et workflows |
| G1 | `GameState`, `Simulation`, commandes de colonisation, `GrowthSystem`, `EconomySystem`, `TierSystem`, `fixed.gd`, `sim_rng.gd`, `state_hash.gd`, `LocalTransport`, `Session` ; positions de départ dans `map_generator.gd` ; écran Bac à sable (réglages, valeurs par défaut, récapitulatif copiable), HUD, effets de palier, section Commandes des Paramètres ; enregistrement des commandes et test de rejeu ; robots d'économie (`ai/`), `tools/sim_runner.gd` et panneau de simulations (éditeur seulement). Livré en trois étapes : `sim/` et tests (**étape 1 livrée le 4 octobre 2026**) ; affichage, HUD et Bac à sable (**étape 2 livrée le 4 octobre 2026**) ; robots, simulations et panneau (**étape 3 livrée le 4 octobre 2026**, version 0.2.0) |
| G2 | Bâtiments (`data/buildings/`), chantiers et file de construction, voisinage, Enzymes, plafond de stock, désactivation ; palette et menu rond ; robots composés (profil d'expansion + profil de bâtisseur + pourcentage) dans le panneau de simulations. Trois étapes : `sim/` et tests (**étape 1 livrée le 4 octobre 2026** : `Buildings`, `BuildCommand`, `DemolishCommand`, `data/buildings/`) ; affichage, HUD et Bac à sable (**étape 2 livrée le 4 octobre 2026** : `BuildingLayer`, `BuildingIcons`, `BuildingPalette`, `RadialMenu`, `BuildingPanel`, `BuildQueueView`, réglages des bâtiments dans `SandboxParam`) ; robots et panneau |
| G3 | `CombatSystem`, gestes dans `view/input/`, `EventSystem`, `VictorySystem` |
| G4 | `ai/` (robots complets), `tools/sim_runner.gd` étendu, menus, résultats |
| G5 | Tutoriel, audio, traduction, profil (sans Steam) |
| G6 | `SteamService` et GodotSteam, `SteamTransport`, salons et invitations, partie personnalisée (salon, surcharge des paramètres, préréglages ; ancien G5), vérification par empreinte, interface d'administration. **Première étape : tests entre amis avec l'App ID 480** (Spacewar) : l'App ID est lu depuis la configuration (jamais écrit en dur), les salons portent une clé de métadonnée propre au jeu et à sa version et la recherche filtre dessus (l'App ID 480 est partagé avec d'autres développeurs), et `steam_appid.txt` est réservé aux builds de test, jamais inclus dans l'export final |
