# CLAUDE.md — règles pour chaque session Claude sur Mycelium

Lis ce fichier en entier avant d'agir, puis le fichier de `docs/` qui correspond à ta tâche
(`workflow.md` pour git/merge, `deploy.md` pour la prod et le staging, `versioning.md` pour les versions).

## Le projet

Mycelium est un jeu incrémental compétitif, web-first et gratuit : chaque joueur fait croître un
mycélium sur une carte hexagonale à conquérir, avec du PvP, 20 à 30 joueurs par forêt (serveur) et un
wipe chaque semaine ; l'objectif est de finir en tête du classement. Les détails de game design se
décident avec le propriétaire (Kromiss) : ne pas inventer de règle de jeu sans lui demander.

## Stack et arborescence

Monorepo TypeScript, pnpm, Node 22.

| Dossier | Contenu |
|---|---|
| `packages/shared` | code partagé client/serveur (grille hexagonale, protocole WebSocket, types) |
| `apps/server` | serveur de jeu Node : HTTP `/api/*`, WebSocket `/ws`, Postgres, Redis |
| `apps/server/migrations` | migrations SQL `NNNN_description.sql`, uniquement vers l'avant |
| `apps/web` | client web (Vite) |
| `deploy/` | Dockerfiles, docker-compose, Caddyfile, scripts de déploiement |
| `.github/workflows/` | CI, déploiement prod, staging, releases |

Commandes : `pnpm install`, `pnpm dev:server`, `pnpm dev:web`, et avant toute livraison
**`pnpm check`** (= typecheck + tests + vérif des migrations + build, exactement comme la CI).

## Conventions

- Code, identifiants, commentaires et messages de commit en **anglais**. Les échanges avec le
  propriétaire se font en français.
- Tout texte affiché au joueur passe par une couche i18n **EN + FR** (à créer avec le premier écran
  qui en a besoin) ; jamais de texte en dur dans l'UI.
- La logique de jeu pure (règles, calculs, grille) va dans `packages/shared` avec des tests ;
  le serveur fait autorité, le client ne fait qu'afficher et prédire.
- Chaque nouvelle fonctionnalité arrive avec ses tests.

## Branches et livraison

- `main` = la prod : chaque push sur `main` déploie. `dev` = branche d'intégration.
- Une branche par fil de travail : `claude/<tâche>`.
- Protocole de livraison (détails dans `docs/workflow.md`) :
  1. `git fetch origin dev` puis rebase sur `origin/dev` ;
  2. si tu ajoutes une migration, renumérote-la après la dernière existante ;
  3. `pnpm check` en local, tout doit être vert ;
  4. `git push origin HEAD:dev` (fast-forward uniquement, jamais de force-push) ;
  5. ouvrir une PR `dev → main`, attendre la CI verte.
- Tu pousses sur `dev` directement (bypass admin du ruleset). **Jamais sur `main`.**
- **Merge `dev → main` et déploiement : pas d'autonomie accordée pour l'instant.** Ouvre la PR et
  demande au propriétaire de merger, sauf s'il t'a donné l'autorisation par écrit dans le fil en cours.
  S'il l'accorde de façon permanente, mets à jour cette ligne.

## Base de données

- Migrations SQL uniquement vers l'avant ; ne jamais modifier une migration déjà mergée.
- La CI refuse `DROP TABLE/COLUMN`, `TRUNCATE`, `DELETE FROM` et les changements de type, sauf
  commentaire `-- allow-destructive` sur la ligne, à ne mettre qu'avec l'accord du propriétaire.

## Versions

Semver à partir de `0.1.0` : `0.x.0` par itération, `0.x.y` pour un correctif. En fin d'itération :
`pnpm version:bump X.Y.Z`, entrée dans `CHANGELOG.md`, livraison normale, puis lancer le workflow
**Release** avec `tag: vX.Y.Z` (les sessions cloud ne peuvent pas pousser de tags). Voir `docs/versioning.md`.

## Limites

- Ne jamais lancer de reset, de suppression de données ou de `down -v` sur la prod.
- Ne jamais écrire de secret dans le repo, un commit, une issue ou le chat. Seuls les **noms** de
  secrets apparaissent dans la doc.
- Aucun accès SSH direct au serveur : tout passe par GitHub Actions. La vérification d'un deploy,
  c'est le healthcheck du workflow.
- Ne jamais merger une PR d'un collaborateur : c'est au propriétaire de la relire.
