# Workflow git et réglages GitHub

```
claude/<tâche> ──► dev ──(PR dev → main, fusionnée par le propriétaire)──► main ──► Build : version préliminaire + Mycelium.exe
                    │
                    └─► CI (check) à chaque envoi et chaque PR
Fin d'itération : workflow Release (à la main, depuis main) ──► version définitive vX.Y.Z + Mycelium.exe
```

## Branches

| Branche | Rôle |
|---|---|
| `main` | versions jouables. Chaque fusion déclenche `build.yml`. |
| `dev` | branche d'intégration, la « vérité ». Chaque envoi lance la CI. |
| `claude/<tâche>` | une branche par fil de travail. |
| `archive/web` | l'ancienne version web, figée. |

## Protocole de livraison

1. `git fetch origin dev` puis `git rebase origin/dev`.
2. En local : import, tests GUT, `gdformat --check`, `gdlint` (commandes dans `CLAUDE.md`).
3. `git push origin HEAD:dev` — avance rapide uniquement. Si l'envoi est refusé, recommencer à l'étape 1.
4. Ouvrir une PR `dev → main`, attendre le check `check` vert, puis fusion par le propriétaire
   (ou par Claude s'il y est autorisé par écrit). La fusion publie une version préliminaire.

## Workflows

| Workflow | Déclencheur | Rôle |
|---|---|---|
| `CI` (`ci.yml`) | envoi sur `dev`, PR vers `main` ou `dev` | job `check` : formatage, style, import, tests, export Windows de contrôle |
| `Build` (`build.yml`) | envoi (fusion) sur `main` | tests, export, version préliminaire `v<version>-build.<n>` avec `Mycelium.exe` |
| `Release` (`release.yml`) | à la main, depuis `main` | version définitive `vX.Y.Z` avec `Mycelium.exe` et l'entrée du CHANGELOG |

Godot 4.6.3 et ses modèles d'export Windows sont téléchargés puis mis en cache par l'action
`.github/actions/setup-godot`.

## Réglages GitHub

**Rulesets** (Settings → Rules → Rulesets), un pour `main` et un pour `dev` :
- *Require a pull request before merging* ;
- *Require status checks to pass* → le check `check` (nom conservé de la version web) ;
- *Block force pushes* et *Restrict deletions* ;
- *Bypass list* : le rôle **Repository admin**, pour que les sessions Claude puissent pousser sur `dev`.

**Actions** (Settings → Actions → General) : *Workflow permissions* peut rester en lecture seule ;
`build.yml` et `release.yml` demandent `contents: write` pour publier les versions.

**Fichiers binaires** : polices, images et sons sont stockés directement dans git, **sans Git LFS** :
les sessions Claude n'ont pas accès au stockage LFS de GitHub.

## Claude dans la boucle

- Un fil par tâche dans le projet Claude « Jeu incremental », chacun sur sa branche `claude/...`.
- L'app GitHub Claude doit être installée sur le dépôt pour pousser, ouvrir des PR et lancer des workflows.
