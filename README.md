# Mycelium

Jeu incrémental compétitif sur une carte hexagonale : fais croître ton mycélium, conquiers la forêt
et termine la semaine en tête du classement. Web, gratuit, wipe hebdomadaire.

## Démarrer en local

Prérequis : Node 22 et pnpm (`corepack enable`).

```bash
pnpm install
pnpm dev:server   # http://localhost:3000/api/health
pnpm dev:web      # http://localhost:5173
pnpm check        # typecheck + tests + migrations + build, comme la CI
```

Postgres et Redis sont optionnels en local : sans `DATABASE_URL` / `REDIS_URL`, le serveur démarre et
les signale comme `disabled` dans `/api/health`. Migrations : `DATABASE_URL=... pnpm --filter @mycelium/server migrate`.

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — règles du projet et des sessions Claude
- [`docs/workflow.md`](docs/workflow.md) — branches, protocole de merge, réglages GitHub
- [`docs/deploy.md`](docs/deploy.md) — prod, staging, mise en place du serveur, secrets
- [`docs/versioning.md`](docs/versioning.md) — versions et releases
