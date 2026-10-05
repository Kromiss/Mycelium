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
│   ├── defs/                 Classes des ressources de data/ (ZoneDef, TierDef, BalanceDef, UpgradeDef, MutationDef, AbilityDef et leurs tables), SimDefs et les copies SimUpgrade, SimMutation, SimAbility (base SimRecord)
│   ├── state/
│   │   ├── forest_map.gd     Cases, zones, terrains, table des voisines et disques de cases (portée)
│   │   ├── game_state.gd     État complet de la partie (tableaux compacts : propriétaire, PV…)
│   │   └── colony_state.gd   État d'une colonie (ressources, Tourelle, cibles, améliorations, mutations, capacités…)
│   ├── systems/              Un fichier par domaine de règles (G3 : le Sporophore)
│   │   ├── command_system.gd   Validation et application des commandes
│   │   ├── colony_stats.gd     Chiffres dérivés d'une colonie (dégâts, cadence, portée, PV, production, coûts), partagés avec les requêtes
│   │   ├── shot_stats.gd       Chiffres de tir d'une colonie, calculés une fois par tick
│   │   ├── targeting.gd        Cases visables, priorités de tir, cible au clic, cibles gardées
│   │   ├── combat.gd           Dégâts, soin, prises, coupures, élimination, Trophée, Mur
│   │   ├── turret_system.gd    Pas et tirs des Tourelles
│   │   ├── regen_system.gd     Régénération des cases et des Tourelles
│   │   ├── upgrades.gd         Achat des améliorations (×1, ×10, Max)
│   │   ├── abilities.gd        Capacités actives (Salve, Mur, Nuage)
│   │   ├── tier_system.gd      Paliers, lots d'Enzymes, choix de mutations
│   │   ├── economy_system.gd   Production, Biomasse
│   │   ├── event_system.gd     Floraison collective, Arbre mourant (jalon G4)
│   │   └── victory_system.gd   Fin de partie, classement
│   ├── commands/             Une classe par commande + la classe de base
│   ├── hex.gd                Coordonnées axiales, voisins, distances, anneaux
│   ├── map_generator.gd      Génération de la forêt (secteurs, zones) depuis la graine
│   ├── fixed.gd              Calcul en entiers à virgule fixe
│   ├── sim_rng.gd            Aléatoire à graine, propre à la simulation
│   └── state_hash.gd         Empreinte de l'état (vérification de l'hôte, tests)
├── ai/                       Robots Canonnier, Bâtisseur et Conquérant (G3, étape 3)
│   ├── robot.gd              Lit l'état, produit des commandes (mutation, priorité, cible, pas, capacités, achats)
│   ├── robot_profile.gd      Profil d'un robot (poids des améliorations et des mutations, priorités, pas, capacités)
│   ├── robot_catalog.gd      Les trois profils, dans l'ordre d'affichage
│   ├── evaluators/           upgrade_planner.gd (achats au meilleur rapport poids / coût), threats.gd (mes cases visées)
│   └── profiles/             gunner.tres, builder.tres, conqueror.tres (difficultés au jalon G5)
├── net/                      Transport des commandes et des différences
│   ├── transport.gd          Interface commune
│   ├── local_transport.gd    Solo, tutoriel, tests
│   ├── replay_transport.gd   Rejeu d'une partie enregistrée (Replay), en spectateur
│   └── steam_transport.gd    En ligne : hôte ou invité (jalon G6)
├── game/
│   ├── session.gd            Relie simulation, transport, robots et affichage
│   ├── sandbox_screen.tscn   Partie de Bac à sable (carte, colonie, gestes, caméra, HUD)
│   ├── sandbox_config.gd     Réglages d'une partie de Bac à sable (mode, graine, SimDefs, robot de chaque secteur, spectateur)
│   ├── sandbox_recap.gd      Texte du récapitulatif copiable
│   ├── local_view_state.gd   Copie de l'état côté affichage (mise à jour par différences)
│   └── tutorial_director.gd  Étapes du tutoriel
├── view/                     Affichage de la partie (lecture seule)
│   ├── map/                  Cases-bulles (MultiMeshInstance2D), zones (shader)
│   ├── colony/               Colonies (G3 : états des cases des maquettes, Sporophore en trois stades — turret_art.gd —, portée, cibles, spores, pas en cours) ; plus tard taches arrondies
│   ├── effects/              Ondes de palier, particules, Floraison
│   ├── camera/               Caméra 2D (déplacement, zoom)
│   └── input/                Gestes : clic (cible), D + clic (pas de la Tourelle), capacité + clic (Mur, Nuage) -> commandes
├── ui/                       Écrans et HUD (nœuds Control)
│   ├── menus/  hud/  sandbox/  lobby/  settings/  results/  tutorial/  admin/
│   │                         (hud/ en G3 : écran des maquettes — frise, classement, journal, cartes de mutation sur la carte ; ressources, Tourelle, mutations, améliorations, capacités dans le panneau)
│   ├── number_format.gd      Grands nombres (K, M, B, T), multiplicateurs, horloge
│   ├── controls_text.gd      Nom des touches liées aux actions
│   └── theme_factory.gd      Construit le thème de l'interface à partir d'une palette
├── data/                     Équilibrage et contenu (ressources .tres)
│   ├── balance.tres          Constantes générales (économie, cases, Tourelle, partie, Trophée)
│   ├── zones.tres            Les 6 zones (richesse, PV d'une case libre, défense d'une case possédée)
│   ├── tiers.tres            Paliers (seuils, multiplicateurs, lots d'Enzymes)
│   ├── upgrades.tres         Les 12 améliorations du panneau (G3)
│   ├── mutations.tres        Les 15 mutations (G3)
│   ├── abilities.tres        Les 3 capacités actives (G3)
│   ├── events/               Un .tres par événement
│   ├── modes/                Duel, FFA, valeurs par défaut des parties personnalisées
│   ├── palettes/             light.tres et dark.tres : couleurs de l'interface et de la carte
│   └── colors.tres           Les 12 couleurs de colonie (principale et foncée) — jalon G1
├── assets/                   fonts/, icons/, audio/, shaders/
├── i18n/
│   └── translations.csv      Textes FR et EN
├── tools/
│   ├── capture.gd            Captures d'écran d'un écran du jeu (menus, Bac à sable, partie jouée N secondes, menu de partie, fin), pour validation visuelle
│   ├── sim_runner.gd         Lots de parties de robots (compositions de forêt, simples ou balayages), en parallèle
│   ├── simulation/           Une partie mesurée (sim_run), ses mesures (partie, puis chaque secteur), statistiques, tableaux et CSV
│   └── simulation_panel/     Panneau de simulations (éditeur seulement) : compositions, résultats, courbes
├── tests/
│   ├── unit/                 Un fichier de test par système
│   ├── integration/          Parties complètes, déterminisme, scènes
│   └── fixtures/             Outils communs des tests (sim_fixture.gd : parties de Duel, cases données, ticks)
└── addons/                   GUT (tests), GodotSteam (G6)
```

---

## 4. La simulation (`sim/`)

### 4.1 L'état
- `GameState` contient tout ce qui définit la partie à un instant donné : numéro du tick, graine, carte, colonies, classement final.
- La carte est stockée en **tableaux compacts** indexés par numéro de case (`PackedInt32Array`, `PackedInt64Array`) : propriétaire, PV (millièmes), dernière colonie qui a entamé la case, tick de fin de l'arrêt de régénération (Toxique, Nuage), et un rang tiré de la graine pour départager les cases à égalité.
- Les colonies sont des objets `ColonyState` : ressources, palier, Tourelle (case, PV, priorité, cible désignée, cibles gardées, tirs accumulés, pas en cours), niveaux d'amélioration, mutations et choix en attente, recharges et effets des capacités, Trophées, élimination, statistiques. Les PV de la case d'une Tourelle sont ceux de la Tourelle (`turret_hp`).
- **Aucune référence vers un nœud**, aucune dépendance à l'affichage.

### 4.2 Le tick
`Simulation.tick(commands: Array[Command]) -> TickResult`, appelé une fois par seconde de jeu. Ordre **fixe** :

| Ordre | Système | Rôle |
|---|---|---|
| 1 | `CommandSystem` | Trie les commandes (joueur, puis ordre d'arrivée), les valide, applique les valides, refuse les autres avec une raison |
| 2 | `TurretSystem` | Pas des Tourelles en cours, puis tirs : cibles (`Targeting`), dégâts, soin, prises, coupures, éliminations (`Combat`) |
| 3 | `RegenSystem` | Régénération des cases et des Tourelles |
| 4 | `TierSystem` | Paliers, lots d'Enzymes, choix de mutations |
| 5 | `EconomySystem` | Production, nutriments, Biomasse |
| 6 | `EventSystem` | Événements de la frise (jalon G4) |
| 7 | `VictorySystem` | Fin de partie (dernière colonie en vie ou 30:00), classement |
| 8 | `StateHash` | Calcule l'empreinte de l'état |

Dans `TurretSystem`, les colonies jouent l'une après l'autre et la première change à chaque tick (tick modulo nombre de colonies). Une Tourelle accumule ses tirs en millièmes (cadence non entière) ; avant chaque tir, ses cibles sont remises à jour (une par spore ; la cible désignée d'abord ; une cible est gardée tant qu'elle reste visable). Un pas de N secondes commencé au tick t se termine à la fin du tick t + N − 1 ; pendant le pas, la Tourelle ne tire pas et reste sur sa case de départ.

`TickResult` contient les **différences** (cases et colonies modifiées, spores tirées, prises, cases perdues par coupure, éliminations, pas terminés, capacités lancées, paliers, nouveaux choix de mutations, commandes refusées) et l'**empreinte**.

### 4.3 Les commandes
- Classe de base `Command` : `tick`, `colony_id`, `type`. Les commandes qui visent une case héritent de `CellCommand` (case en coordonnées axiales). Une sous-classe par action (G3) : `TargetCommand` (cible au clic), `SetPriorityCommand`, `MoveTurretCommand` (un pas), `BuyUpgradeCommand` (1, 10 ou le maximum), `ChooseMutationCommand`, `UseAbilityCommand`.
- Chaque commande sait se **convertir en dictionnaire et inversement** (`to_dict()`, `from_dict()`), pour le réseau et les replays.
- La validation renvoie un code de refus explicite (`Refusal.Code` : `OUT_OF_RANGE`, `NOT_ADJACENT`, `PROTECTED`, `TIER_LOCKED`, `NOT_ENOUGH_NUTRIENTS`, `COOLDOWN`…) que l'interface traduit en message. L'interface peut demander à l'avance si une commande serait acceptée (`Simulation.check(commande)`), ainsi que les PV max d'une case (`cell_max_hp()`), la portée (`in_range()`, `is_target()`) et le coût d'une amélioration (`upgrade_cost()`, `upgrade_preview()` pour ×10 et Max). Les chiffres d'une colonie (dégâts, cadence, portée, PV, production…) viennent de `ColonyStats`.

### 4.3 bis Le Sporophore *(G3)*
- Une **Tourelle** par colonie, sur une case de la colonie (`ColonyState.turret`) ; ses PV sont à part (`turret_hp`). Les autres cases ont des PV (`GameState.hp`) : une case libre a ceux de sa zone, une case possédée ceux de sa zone × Cohésion × améliorations.
- **Prise** : une case libre ou adverse **collée au territoire** de l'attaquant passe à lui quand ses PV tombent à 0 (libre : à pleine vie ; adverse : à 25 %). Les dégâts sur une case qui ne touche pas le territoire de l'attaquant (Éclaboussure, Rebond, Nuage) la laissent à 1 millième de PV au moins. Après une prise, les cases de l'ancien propriétaire qui ne sont plus reliées à sa Tourelle redeviennent libres (`Combat.cut_off`, sauté quand les voisines de la case prise forment une seule suite, `Combat.may_split`).
- **Élimination** : quand les PV d'une Tourelle tombent à 0 (par un attaquant dont le territoire la touche), toutes les cases de la colonie redeviennent libres et l'attaquant reçoit un Trophée.
- Les données de contenu (`SimUpgrade`, `SimMutation`, `SimAbility`) sont copiées champ par champ (`SimRecord`) ; une mutation est un ensemble de modificateurs (multiplicateurs en pour-mille, ajouts) que `ColonyStats` applique.

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

- Chaque élément de contenu est une **ressource typée** : `ZoneDef`, `TierDef`, `UpgradeDef`, `MutationDef`, `AbilityDef`, `EventDef`, `ModeDef` (classes déclarées dans `sim/defs/`, champs exportés).
- Exemple : une entrée de `data/upgrades.tres` contient l'identifiant, l'onglet, la statistique, l'effet par niveau, le coût de base en U, le facteur de coût, le niveau maximal et le palier de déblocage.
- La simulation reçoit les définitions **au démarrage de la partie**, sous la forme d'un `SimDefs` : une copie en entiers de tous les chiffres (`SimDefs.from_mode()` lit `zones.tres`, `tiers.tres`, `balance.tres`, `upgrades.tres`, `mutations.tres`, `abilities.tres` et le mode). Elle ne charge rien elle-même pendant les ticks. `SimDefs.prepare()` calcule les valeurs dérivées (tables de coût des améliorations) ; `validate()` signale les réglages absurdes ; `to_dict()` / `from_dict()` servent aux replays et au récapitulatif du Bac à sable.
- Les paramètres d'une partie personnalisée ou du **Bac à sable** **surchargent** les valeurs du mode, sans jamais modifier les fichiers.
- Changer un chiffre d'équilibrage = modifier un `.tres`, relancer les tests et le `sim_runner`.

---

## 6. Les robots (`ai/`)

- Un robot reçoit l'état (en lecture seule) et renvoie une liste de commandes, **à la même fréquence et avec les mêmes limites qu'un joueur**.
- `Robot.decide(simulation)` (G3, étape 3) renvoie les commandes du prochain tick ; chacune est d'abord vérifiée par `Simulation.check()`, si bien qu'un robot n'envoie que des commandes acceptées. Ordre : choix de mutation (la plus lourde du profil), priorité de tir (habituelle, ou de défense tant que `Threats.attacked_cells()` trouve des cases visées, gardée `defense_hold_ticks`), cible désignée (Tourelle adverse visable), pas vers le centre (Conquérant), capacités (Enzymes partagées entre elles), achats (`UpgradePlanner.plan()` : meilleur rapport poids / coût du prochain niveau, en entiers, économie pour la meilleure si elle n'est pas payable).
- **Profil** (`RobotProfile`, `ai/profiles/*.tres`) = poids des améliorations et des mutations, priorités, chasse des Tourelles, pas, capacités : Canonnier, Bâtisseur, Conquérant (GDD §2.5). **Difficulté** (G5) = délai de réaction, part d'erreurs, profondeur d'évaluation, qualité des choix.
- Les robots utilisent leur propre `SimRng` dérivé de la graine (`derive(7001 + colonie)`, pour départager les mutations) et ne lisent ni l'heure ni l'aléatoire global : une partie de robots est donc **rejouable à l'identique** (même graine, mêmes réglages).
- Les estimations passent par `ColonyStats`, `Targeting` et les requêtes de `Simulation` : les règles restent dans `sim/`.

---

## 7. Transport et multijoueur (`net/`)

- `Transport` est une interface : `send_command(cmd)`, `advance()` (joue le prochain tick, en local ou chez l'hôte), signal `tick_received(result)`.
- `LocalTransport` : la simulation tourne dans le jeu ; les commandes sont transmises directement et jouées au prochain tick. Il les enregistre dans un `Replay` avec l'empreinte de chaque tick. Utilisé en solo, dans le Bac à sable, le tutoriel et les tests.
- `SteamTransport` (jalon G6) :
  - **Hôte** : fait tourner la simulation, reçoit les commandes des invités par Steam Networking Sockets, envoie les différences et l'empreinte de chaque tick.
  - **Invité** : envoie ses commandes, applique les différences, **rejoue la simulation localement** à partir des commandes et compare l'empreinte ; un écart arrête la partie et la signale.
- `ReplayTransport` : recrée la partie d'un `Replay` (secteurs compris) et lui remet à chaque tick les commandes enregistrées ; les commandes envoyées par le jeu sont ignorées (`Session.start_replay()`, en spectateur).
- Le reste du jeu (`game/`, `view/`, `ui/`) ne sait pas quel transport est utilisé.

---

## 8. Session, scènes et singletons

- `Session` (`game/session.gd`) assemble une partie : crée la simulation et le transport, inscrit les robots, cadence les ticks (1 par seconde, ×2 ou ×4 en Bac à sable), met à jour `LocalViewState` et émet des **signaux** (`ticked`, `paused_changed`, `speed_changed` en G1 ; `cell_changed`, `tier_reached`, `colony_eliminated`… quand l'affichage en aura besoin). `start_local(defs, graine, colonies, time_control, secteurs)` lance une partie locale (« secteurs » : secteur de chaque colonie, vide pour les premiers) ; `add_robot(robot)` inscrit un robot, appelé par `step()` avant chaque tick sur l'état du tick précédent (ses commandes passent par le transport, donc dans le `Replay`). `set_spectator()` (ou `start_replay()`) : plus aucun ordre accepté, vitesses ×1, ×4, ×16, ×64 (jusqu'à 64 ticks par image), et `viewer_colony()` vaut −1 pour que chaque colonie garde le nom de sa couleur ; la pause et la vitesse ne répondent que si `time_control` est vrai (Bac à sable). `send_command()` renvoie faux, sans rien envoyer, pendant la pause ou une fois la partie finie ; `game_finished` est émis quand la simulation atteint sa durée maximale (`VictorySystem`, 30:00), après quoi plus aucun tick n'est joué. `production_history` garde la production de la colonie locale à chaque tick (courbe du HUD). En G1, l'affichage lit directement l'état de la simulation locale ; `LocalViewState` arrive avec le jeu en ligne. `advance_time()` joue les ticks dus (8 au plus par image) et `tick_fraction()` donne l'avancement vers le prochain tick, pour interpoler l'affichage.
- **Singletons limités à trois** : `Settings`, `SceneRouter` et, au jalon G6, `SteamService`. `SteamService` est **facultatif** : les modes locaux (joueur et robots : Bac à sable, Duel et FFA contre robots, tutoriel) sont **isolés des modes en ligne** et fonctionnent sans Steam ni GodotSteam. Aucun code de `sim/`, `ai/`, `game/` ni des écrans des modes locaux ne dépend de `SteamService` ou de `SteamTransport` ; seuls `net/steam_transport.gd` et les écrans du multijoueur (salons, invitations, file d'attente) y touchent. L'état de la partie n'est **jamais** dans un singleton : il appartient à la `Session` en cours.
- Une scène par écran (`ui/menus/main_menu.tscn`, `ui/hud/hud.tscn`…), une scène par élément réutilisable (bouton de bâtiment, ligne de classement).

---

## 9. Affichage et interface (`view/`, `ui/`)

- L'affichage **écoute** les signaux de la `Session` et lit `LocalViewState`. Il ne modifie jamais l'état.
- G3 : écran des maquettes. La carte occupe la partie gauche de l'écran (`Hud.map_rect()`, ~62 %) : `MapCamera.view_rect` y centre, y cadre et y fait glisser la caméra (décalage `offset`). `view/input/map_input.gd` (modes `TARGET`, `MOVE`, `ABILITY`), `view/colony/colony_layer.gd` (états des cases, Sporophores dessinés par `TurretArt`, portée, cibles, soins, spores interpolées), `ui/hud/` : `Hud` assemble des composants construits en code (`TimelineCard`, `RankingCard`, `JournalCard` et `HudJournal`, `MutationOverlay`, `ResourcesCard`, `TurretCard`, `MutationsCard`, `UpgradesCard`, `AbilityBar`), avec `HudStyle` (pastilles et barres aux couleurs de la colonie), `HudIcons` (pictogrammes en trait) et `GameText` (noms des colonies, effets des améliorations). Avant d'envoyer une commande, l'interface demande à la simulation si elle serait acceptée (`Simulation.check()`) ; l'effet « avant → après » d'une amélioration vient de `Simulation.upgrade_values()` (copie des chiffres de la colonie) : les règles restent dans `sim/`.
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
Le `sim_runner` est piloté par le **panneau de simulations** (GDD §18.5), une scène de `tools/simulation_panel/` ouverte depuis le menu principal seulement quand `OS.has_feature("editor")` est vrai (`SceneRouter.has_simulation_panel()`). Le dossier `tools/` est exclu de l'export (`export_presets.cfg`) : le panneau, le `sim_runner` et ses mesures n'existent dans aucun `.exe`. Rien dans les dossiers exportés ne les nomme comme type : le menu ne connaît que le chemin de la scène, et `SceneRouter` garde l'état du panneau dans une variable non typée.
- G3 (étape 3) : une **série** (`SimRunner.Series`) = une composition de forêt (profil du robot de chaque secteur, liste gardée par `CompositionList` dans `user://simulation_compositions.cfg`, une par forêt) et des réglages (valeur balayée). `SimRun` joue une partie avec un `Robot` par secteur occupé et mesure la partie (`SimRunResult`) puis chaque secteur (`SimColonyResult`, dont la production et les cases de chaque minute) ; `SimReport` en tire les tableaux (mesures de la partie, puis une colonne par secteur), les courbes et le CSV (une ligne par série, secteur et mesure).
- Les parties d'un lot tournent sur les fils de travail de Godot (`WorkerThreadPool`), chacune avec ses propres définitions et sa propre simulation (une partie de Duel de 30 min prend une vingtaine de secondes, une partie de FFA environ deux minutes) ; les tests les jouent à la suite (`run_all()`).
- Aucun enregistrement n'est gardé (plusieurs Mo par partie) : pour **regarder** une partie, le panneau relance l'écran de partie en spectateur avec la même graine, les mêmes réglages et les mêmes robots (`SandboxConfig.spectator`), ce qui redonne la même partie ; « Quitter » ramène au panneau (`SceneRouter.leave_game()`).

C'est l'outil qui répond aux questions « À simuler » du GDD.

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
| G2 | Bâtiments (`data/buildings/`), chantiers et file de construction, voisinage, Enzymes, plafond de stock, désactivation ; palette et menu rond ; robots composés (profil d'expansion + profil de bâtisseur + pourcentage) dans le panneau de simulations. Trois étapes : `sim/` et tests (**étape 1 livrée le 4 octobre 2026** : `Buildings`, `BuildCommand`, `DemolishCommand`, `data/buildings/`) ; affichage, HUD et Bac à sable (**étape 2 livrée le 4 octobre 2026** : `BuildingLayer`, `BuildingIcons`, `BuildingPalette`, `RadialMenu`, `BuildingPanel`, `BuildQueueView`, réglages des bâtiments dans `SandboxParam`) ; robots et panneau (**étape 3 livrée le 4 octobre 2026**, version 0.3.0 : `RobotSpec`, `BuilderRobot`, `ColonyRobot`, `RobotList`, `ColonyState.nutrients_lost`) ; city builder revu le même jour (places de bâtiment, effets de zone sans cumul, coût en secondes de production, plus de voisinage ni de Rosace) ; **tout ce code a été supprimé en G3 (étape 1)** |
| G3 | Le Sporophore (refonte du 4 octobre 2026). Trois étapes : 1) `sim/` et tests (**livrée le 4 octobre 2026** : `TurretSystem`, `Targeting`, `Combat`, `RegenSystem`, `Upgrades`, `Abilities`, `ColonyStats`, `ShotStats`, `TierSystem` et `VictorySystem` réécrits, six commandes, `data/upgrades.tres`, `mutations.tres`, `abilities.tres` ; suppression de la colonisation, des bâtiments, des robots de G1 et G2, du panneau de simulations et de leur affichage ; affichage et HUD provisoires, Bac à sable avec tous les réglages) ; 2) écran des maquettes (**livrée le 4 octobre 2026** : composants de `ui/hud/`, `TurretArt`, `MapCamera.view_rect`, gestes des capacités, réglages des mutations dans le Bac à sable, `ColonyState.mutation_tiers` et `pending_tiers`, `Simulation.upgrade_values()`) ; 3) robots et panneau de simulations à plusieurs robots (**livrée le 5 octobre 2026**, version 0.4.0 : `Robot`, `RobotProfile`, `RobotCatalog`, `UpgradePlanner`, `Threats`, `ai/profiles/`, adversaires du Bac à sable, `Session.add_robot()` et spectateur, `ReplayTransport`, `SimRunner`, `SimRun`, `SimReport`, `CompositionList`, `CurvesChart`) |
| G4 | `ai/` (robots complets), `tools/sim_runner.gd` étendu, menus, résultats |
| G5 | Tutoriel, audio, traduction, profil (sans Steam) |
| G6 | `SteamService` et GodotSteam, `SteamTransport`, salons et invitations, partie personnalisée (salon, surcharge des paramètres, préréglages ; ancien G5), vérification par empreinte, interface d'administration. **Première étape : tests entre amis avec l'App ID 480** (Spacewar) : l'App ID est lu depuis la configuration (jamais écrit en dur), les salons portent une clé de métadonnée propre au jeu et à sa version et la recherche filtre dessus (l'App ID 480 est partagé avec d'autres développeurs), et `steam_appid.txt` est réservé aux builds de test, jamais inclus dans l'export final |
