# Changelog

Toutes les évolutions notables de Mycelium. Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versions [semver](https://semver.org/lang/fr/).

## [Unreleased]

### Fixed
- Acheter « Croissance des hyphes » pendant une colonisation faisait reculer (voire repartir de zéro)
  l'anneau de progression de la case en cours. Le début de chaque pousse est maintenant enregistré
  (colonne `hex.growth_started_at`) et la progression s'appuie dessus. La durée réelle de la pousse
  en cours n'a jamais changé : seul l'affichage était faux.

## [0.2.0] - 2026-09-29

M1 — Proto solo (GDD §15.1).

### Added
- Générateur de carte hexagonale déterministe à partir d'une graine (rayon 10, 331 cases) : Humus,
  Litière de feuilles et Bois mort en plaques, dans des proportions fixes ; départ toujours sur Humus.
- Règles du proto dans `packages/shared` : colonisation d'une case adjacente au coût
  `base × (1 + 0,05 × dist) × 1,02^cases`, temps de pousse, Nutriments et Biomasse, 5 améliorations
  à coût `base × 1,15^niveau`. Toutes les valeurs à équilibrer sont dans `balance.ts`.
- Serveur autoritaire : simulation par ticks de 5 s, actions validées côté serveur, rattrapage exact
  du temps écoulé au chargement d'une partie.
- Comptes invités avec pseudo (`POST /api/guest`), jeton gardé dans le navigateur (seul son SHA-256
  est stocké) ; authentification et actions de jeu par WebSocket.
- Migration `0002_solo_proto` : tables `worlds` et `hex`, ressources et améliorations du joueur.
  Sans `DATABASE_URL`, le serveur garde les parties en mémoire.
- Client : carte PixiJS avec déplacement, zoom (molette, pincement, boutons), filaments du réseau,
  cases colonisables qui pulsent et progression de la pousse ; panneau de ressources et
  d'améliorations, fiche de case, écran invité, mise en page mobile.
- Couche i18n EN + FR et notation des grands nombres (suffixes K à No, puis scientifique).

## [0.1.0] - 2026-09-29

M0 — Fondations.

### Added
- Monorepo TypeScript (pnpm) : `packages/shared` (grille hexagonale, protocole), `apps/server`
  (HTTP + WebSocket, Postgres, Redis, migrations SQL), `apps/web` (client Vite).
- CI GitHub Actions : typecheck, tests, vérification des migrations, build.
- Déploiement prod (Docker, GHCR, SSH, backup Postgres, healthcheck, rollback automatique),
  staging à la demande et workflow de release.
- `CLAUDE.md` et documentation dans `docs/`.
