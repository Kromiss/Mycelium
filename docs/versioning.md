# Versions et publications

- Semver à partir de `0.1.0` : `0.x.0` par itération, `0.x.y` pour les correctifs.
- La version du jeu est `application/config/version` dans `project.godot` ; le menu principal l'affiche.

## Versions préliminaires (automatiques)

Chaque fusion sur `main` lance le workflow **Build**, qui publie une version préliminaire
`v<version>-build.<n>` (par exemple `v0.1.0-build.12`, où `n` est le numéro d'exécution du workflow)
avec `Mycelium.exe` joint. Rien à faire à la main.

## Fin d'itération (version définitive)

1. Mettre à jour `application/config/version` dans `project.godot` (par exemple `0.2.0`).
2. Dans `CHANGELOG.md`, renommer `## [Unreleased]` en `## [X.Y.Z] - AAAA-MM-JJ` et rouvrir une
   section `## [Unreleased]` vide au-dessus.
3. Livraison normale (dev → PR → main).
4. Onglet Actions → **Release** → *Run workflow* sur `main` avec `tag: vX.Y.Z`. Le workflow vérifie
   que `project.godot` et le CHANGELOG correspondent, exporte `Mycelium.exe`, crée le tag et la
   version GitHub avec l'entrée du CHANGELOG.

Pourquoi un workflow pour le tag : les sessions Claude cloud ne peuvent pas pousser de tags ; elles
déclenchent donc ce workflow (ou demandent au propriétaire de le lancer).
