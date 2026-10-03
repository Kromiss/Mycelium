# Mycelium : Last Colony

City builder incrémental compétitif sur une carte d'hexagones : fais grandir ta colonie de
champignons, bâtis ta ville et sois la dernière colonie vivante. Parties de 30 minutes maximum,
en Duel, en FFA ou en partie personnalisée. Jeu Godot, exécutable Windows, distribution Steam.

## Télécharger

Chaque fusion sur `main` publie une version préliminaire avec `Mycelium.exe` dans l'onglet
**Releases** du dépôt. Les versions définitives (`v0.x.0`) sont publiées en fin d'itération.

## Développer

Prérequis : **Godot 4.6.3** (version exacte), Git, et pour le formatage Python avec
`pip install "gdtoolkit==4.5.0"`.

1. Cloner le dépôt.
2. Ouvrir `project.godot` dans Godot 4.6.3 et lancer le projet (F5).

En ligne de commande (`godot` = l'exécutable Godot 4.6.3) :

```bash
godot --headless --import
godot --headless -s addons/gut/gut_cmdln.gd -gconfig=res://.gutconfig.json   # tests
gdformat --check autoload game sim ui view tests tools
gdlint autoload game sim ui view tests tools
godot --headless --export-release "Windows Desktop" build/windows/Mycelium.exe
```

L'export demande les modèles d'export de Godot 4.6.3 (Éditeur > Gérer les modèles d'export).

## Documentation

- [`docs/GDD_Mycelium_Godot.md`](docs/GDD_Mycelium_Godot.md) — le jeu (règles, modes, feuille de route)
- [`docs/Architecture_Mycelium_Godot.md`](docs/Architecture_Mycelium_Godot.md) — organisation du code et normes
- [`docs/workflow.md`](docs/workflow.md) — branches, livraison, réglages GitHub
- [`docs/versioning.md`](docs/versioning.md) — versions et publications
- [`CLAUDE.md`](CLAUDE.md) — règles des sessions Claude

L'ancienne version web du jeu est conservée dans la branche `archive/web`.

## Licences des ressources

Polices Fredoka et Nunito : SIL Open Font License (voir `assets/fonts/`).
GUT (tests) : licence MIT (voir `addons/gut/`).
