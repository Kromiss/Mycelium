# Versions et releases

- Semver dès `0.1.0` : `0.x.0` par itération, `0.x.y` pour les correctifs.
- La version est la même dans tous les `package.json` ; le client et le serveur l'affichent
  (lue dans `package.json` au build, visible dans `/api/health` et en bas de l'écran).

## Fin d'itération

1. `pnpm version:bump X.Y.Z` (met à jour tous les `package.json`).
2. Dans `CHANGELOG.md`, renommer `## [Unreleased]` en `## [X.Y.Z] - AAAA-MM-JJ` et rouvrir une
   section `## [Unreleased]` vide au-dessus.
3. Livraison normale (dev → PR → main → deploy).
4. Onglet Actions → **Release** → *Run workflow* sur `main` avec `tag: vX.Y.Z`. Le workflow vérifie
   que `package.json` et le CHANGELOG correspondent, crée le tag et la GitHub Release avec l'entrée
   du CHANGELOG.

Pourquoi un workflow pour le tag : les sessions Claude cloud ne peuvent pas pousser de tags, elles
déclenchent donc ce workflow (ou demandent au propriétaire de le lancer).
