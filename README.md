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
pnpm --filter @mycelium/shared simulate   # courbe d'une semaine solo (2 profils de joueurs)
pnpm --filter @mycelium/shared simulate:forest   # une semaine de forêt avec 12 robots
pnpm --filter @mycelium/shared simulate:balance  # équilibre des souches et des branches (≈ 5 min)
```

Postgres et Redis sont optionnels en local : sans `DATABASE_URL` / `REDIS_URL`, le serveur démarre et
les signale comme `disabled` dans `/api/health`. Sans Postgres, les parties sont gardées en mémoire et
perdues au redémarrage du serveur (le navigateur redemande alors un pseudo).
Migrations : `DATABASE_URL=... pnpm --filter @mycelium/server migrate`.

Tester à plusieurs en local : chaque navigateur (ou fenêtre privée) crée son compte. Pour remplir la
forêt et accélérer le temps : `BOTS=11 TIME_SCALE=60 pnpm dev:server` (11 robots qui jouent seuls,
1 minute réelle = 1 heure de jeu). Pour voir passer une semaine entière (phases, fin de saison, nouvelle
forêt) : `TIME_SCALE=600`, soit une semaine en 17 minutes environ. Ces deux réglages sont refusés en
production.

Tests du stockage Postgres (ignorés sans base) : `TEST_DATABASE_URL=postgres://.../base_jetable pnpm test`
— la base indiquée est **vidée** au début des tests.

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — règles du projet et des sessions Claude
- [`docs/workflow.md`](docs/workflow.md) — branches, protocole de merge, réglages GitHub
- [`docs/deploy.md`](docs/deploy.md) — prod, staging, mise en place du serveur, secrets
- [`docs/versioning.md`](docs/versioning.md) — versions et releases
- [`docs/roadmap.md`](docs/roadmap.md) — jalons de développement
