# Workflow git et réglages GitHub

```
claude/<tâche> ──► dev ──(PR dev → main)──► main ──► Deploy : CI ─► images Docker ─► SSH ─► prod
                    │                                             backup Postgres, migrations, healthcheck
                    └─► staging (à la demande, workflow « Deploy staging »)
```

## Branches

| Branche | Rôle |
|---|---|
| `main` | la prod. Chaque push déclenche `deploy.yml`. |
| `dev` | branche d'intégration, la « vérité ». Chaque push lance la CI. |
| `claude/<tâche>` | une branche par fil de travail. |

## Protocole de livraison

1. `git fetch origin dev` puis `git rebase origin/dev`.
2. Si la tâche ajoute une migration, la renuméroter après la dernière de `apps/server/migrations`
   (deux fils en parallèle en créent souvent une chacun ; la CI refuse les trous et les doublons).
3. `pnpm check` en local.
4. `git push origin HEAD:dev` — fast-forward uniquement. Si le push est refusé, recommencer à l'étape 1.
5. Ouvrir une PR `dev → main`, attendre le check `check` vert, merger (propriétaire, ou Claude s'il y
   est autorisé par écrit). Le merge déclenche le déploiement.
6. Un seul déploiement à la fois : `deploy.yml` est sérialisé et n'est jamais annulé en cours.

## Réglages GitHub à faire une fois (Settings du dépôt)

**Rulesets** (Settings → Rules → Rulesets), un pour `main` et un pour `dev` :
- *Require a pull request before merging* ;
- *Require status checks to pass* → ajouter le check `check` ;
- *Block force pushes* et *Restrict deletions* ;
- *Bypass list* : le propriétaire (Kromiss), pour pouvoir pousser en urgence.

Avec ce ruleset sur `dev`, le `git push origin HEAD:dev` de l'étape 4 n'est possible que pour les
comptes en bypass. Si tu veux que Claude puisse pousser sur `dev` directement, ajoute l'app GitHub
Claude au bypass du ruleset `dev` ; sinon Claude ouvre une PR `claude/<tâche> → dev`.

**Environments** (Settings → Environments) :
- `production`, restreint à la branche `main` (*Deployment branches → Selected branches → main*).
  Les secrets de prod vivent ici, pas au niveau du dépôt.
- `staging`, sans restriction de branche, avec les mêmes secrets SSH.

**Variables** (Settings → Secrets and variables → Actions → Variables) :
- `DEPLOY_ENABLED` = `true` une fois le serveur prêt. Tant qu'elle n'existe pas, les workflows
  construisent et publient les images mais ne se connectent pas au serveur.
- `PRODUCTION_URL` (optionnel) = `https://ton-domaine`, affiché dans l'onglet Deployments.

**Actions** (Settings → Actions → General) : *Workflow permissions* peut rester en lecture seule ;
chaque workflow demande les droits dont il a besoin (`packages: write` pour GHCR, `contents: write`
pour les releases).

## Claude dans la boucle

- Un fil par tâche dans le projet Claude « Jeu incremental », chacun sur sa branche `claude/...`.
- Les sessions cloud n'ont accès au serveur qu'à travers GitHub Actions.
- L'app GitHub Claude doit être installée sur le dépôt pour pousser, ouvrir des PR et lancer des workflows.
