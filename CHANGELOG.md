# Changelog

Toutes les évolutions notables de Mycelium. Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versions [semver](https://semver.org/lang/fr/).

## [Unreleased]

### Added
- Monorepo TypeScript (pnpm) : `packages/shared` (grille hexagonale, protocole), `apps/server`
  (HTTP + WebSocket, Postgres, Redis, migrations SQL), `apps/web` (client Vite).
- CI GitHub Actions : typecheck, tests, vérification des migrations, build.
- Déploiement prod (Docker, GHCR, SSH, backup Postgres, healthcheck, rollback automatique),
  staging à la demande et workflow de release.
- `CLAUDE.md` et documentation dans `docs/`.
