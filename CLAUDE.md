# CLAUDE.md — règles pour chaque session Claude sur Mycelium

Lis ce fichier en entier avant d'agir, puis le document de `docs/` qui correspond à ta tâche :
`GDD_Mycelium_Godot.md` (le jeu), `Architecture_Mycelium_Godot.md` (le code),
`workflow.md` (git et livraison), `versioning.md` (versions).

## Le projet

**Mycelium : Last Colony** est un jeu incrémental compétitif, en parties de 30 minutes maximum :
chaque colonie de champignons a pour cœur une tourelle, le Sporophore, qui lance des spores et prend
les cases d'une carte d'hexagones ; la production des cases paie les améliorations de la tourelle, et
le but est d'être la dernière colonie vivante (refonte du 4 octobre 2026 : plus de colonisation au
clic ni de bâtiments). Modes Duel, FFA (jusqu'à 6) et Partie personnalisée, contre
des robots puis en ligne. Cible : un exécutable Windows, distribué sur Steam.

Les détails de game design se décident avec le propriétaire (Kromiss) : **ne jamais inventer de règle
de jeu, et poser la question au moindre doute**. La référence est `docs/GDD_Mycelium_Godot.md` (aussi
dans les documents du projet Claude « Jeu incremental ») ; les jalons sont dans son §19.

L'ancienne version web est archivée dans la branche `archive/web` : ne pas la modifier.

## Stack et arborescence

Godot **4.6.3** (épinglé), GDScript typé, moteur de rendu Compatibilité, tests GUT 9.6.1,
formatage et style avec gdtoolkit 4.5.0. Le détail de l'arborescence est dans
`docs/Architecture_Mycelium_Godot.md` §3 ; en bref :

| Dossier | Contenu |
|---|---|
| `sim/` | règles du jeu, code pur sans nœud, déterministe |
| `data/` | équilibrage et contenu (ressources `.tres`) |
| `view/` | affichage de la carte (lecture seule) |
| `ui/` | écrans et thème de l'interface |
| `game/` | assemblage d'une partie (`Session`) |
| `net/` | transport des commandes (local ; Steam au G7) |
| `ai/` | robots (recréés à l'étape 3 de G3) |
| `autoload/` | singletons `Settings` et `SceneRouter` |
| `tests/` | tests GUT (`unit/`, `integration/`) |
| `tools/` | outils de développement, exclus de l'export (captures d'écran, simulations…) |
| `.github/workflows/` | CI, build de main, Release |

Commandes (avec `godot` = l'exécutable Godot 4.6.3) :

```bash
godot --headless --import                                              # importer le projet
godot --headless -s addons/gut/gut_cmdln.gd -gconfig=res://.gutconfig.json   # tests
gdformat --check ai autoload game net sim ui view tests tools                 # formatage
gdlint ai autoload game net sim ui view tests tools                           # style
godot --headless --export-release "Windows Desktop" build/windows/Mycelium.exe   # export
```

Avant toute livraison : import, tests, formatage et style doivent être verts, exactement comme la CI.

## Conventions

- Noms (fichiers, classes, fonctions, variables, signaux, clés de traduction) en **anglais** ;
  **commentaires en français** ; **messages de commit en français**. Les échanges avec le
  propriétaire se font en français.
- Tout texte affiché au joueur passe par `i18n/translations.csv` (**EN + FR**) ; jamais de texte en dur.
- Les règles du jeu vivent uniquement dans `sim/`, sans nœud ni aléatoire global ni lecture de l'heure
  (voir `docs/Architecture_Mycelium_Godot.md` §4). Aucun chiffre d'équilibrage dans le code : il va dans `data/`.
- Chaque nouvelle fonctionnalité arrive avec ses tests.
- Toute nouvelle décision prise avec le propriétaire est reportée dans le GDD ou le document d'architecture.

## Branches et livraison

- `main` reçoit uniquement des PR `dev → main`. Chaque fusion sur `main` publie une version
  préliminaire avec `Mycelium.exe` (workflow **Build**). `dev` = branche d'intégration.
- Une branche par fil de travail : `claude/<tâche>`.
- Protocole de livraison (détails dans `docs/workflow.md`) :
  1. `git fetch origin dev` puis rebase sur `origin/dev` ;
  2. import, tests, formatage et style en local, tout doit être vert ;
  3. `git push origin HEAD:dev` (avance rapide uniquement, jamais de force-push) ;
  4. ouvrir une PR `dev → main`, attendre le check `check` vert.
- Tu pousses sur `dev` directement (contournement admin des règles). **Jamais sur `main`.**
- **Fusion `dev → main` : pas d'autonomie accordée.** Ouvre la PR et demande au propriétaire de la
  fusionner, sauf autorisation écrite dans le fil en cours. S'il l'accorde de façon permanente,
  mets à jour cette ligne.

## Versions

Semver à partir de `0.1.0` : `0.x.0` par itération, `0.x.y` pour un correctif. La version est
`application/config/version` dans `project.godot`. Voir `docs/versioning.md`.

## Limites

- Ne jamais écrire de secret dans le dépôt, un commit, une issue ou le chat.
- Ne jamais fusionner une PR d'un collaborateur : c'est au propriétaire de la relire.
