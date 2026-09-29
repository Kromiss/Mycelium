# Déploiement : prod et staging

Personne ne se connecte au serveur pour déployer : tout passe par GitHub Actions.

## Stack

Un seul VPS Ubuntu avec Docker Compose (`deploy/docker-compose.yml` + `docker-compose.prod.yml`) :

| Service | Rôle |
|---|---|
| `web` | Caddy : HTTPS automatique (Let's Encrypt), sert le client, proxy `/api` et `/ws` vers `server` |
| `server` | serveur de jeu Node, non exposé ; healthcheck sur `/api/health` |
| `postgres` | données joueurs (volume) |
| `redis` | classements (volume, persistance AOF) |

Seuls les ports 80 et 443 sont ouverts. Les images sont publiées sur GHCR
(`ghcr.io/kromiss/mycelium/server` et `/web`), taguées avec le SHA du commit.

## Ce que fait un déploiement prod

`deploy.yml` (push sur `main` ou lancement manuel) : CI → build et push des deux images → copie des
fichiers de `deploy/` sur le serveur → `deploy.sh <sha> <préfixe>` qui :

1. tire les nouvelles images ;
2. **sauvegarde Postgres** dans `backups/` (garde les 14 dernières) ;
3. applique les migrations en attente ;
4. redémarre la stack et **attend les healthchecks** ;
5. si la nouvelle version n'est pas saine : relance la version précédente, affiche les logs et fait
   échouer le workflow — la prod n'est jamais laissée cassée ;
6. note le tag courant dans `.current_tag` et le précédent dans `.previous_tag`.

**Rollback manuel** : relancer le workflow sur un ancien commit, ou sur le serveur
`./deploy.sh "$(cat .previous_tag)" "$(cat .image_prefix)"`. Les migrations ne sont pas annulées
(elles sont uniquement vers l'avant et la CI bloque les migrations destructives), donc l'ancienne
version tourne sur le nouveau schéma.

## Mise en place du serveur (une fois)

```bash
# en root sur un VPS Ubuntu 24.04, 2 Go de RAM minimum
adduser --disabled-password --gecos "" deploy
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
mkdir -p /opt/mycelium && chown deploy:deploy /opt/mycelium
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443 && ufw --force enable
```

- **DNS** : un enregistrement `A` du domaine vers l'IP du VPS.
- **`.env`** dans `/opt/mycelium` (modèle : `deploy/.env.example`), `chmod 600`, propriétaire `deploy` :
  `DOMAIN`, `POSTGRES_PASSWORD` (`openssl rand -hex 24`), `JWT_SECRET` (`openssl rand -hex 32`),
  et optionnellement `STAGING_BASE_DOMAIN`. **Ces secrets ne vont jamais dans GitHub ni dans le repo** ;
  en garder une copie en lieu sûr.
- **Clé SSH de déploiement** (sur ta machine) :
  ```bash
  ssh-keygen -t ed25519 -f deploy_key -C mycelium-deploy -N ""
  ssh-keyscan -H <ip-du-vps>          # → secret SSH_KNOWN_HOSTS
  ```
  Mettre `deploy_key.pub` dans `/home/deploy/.ssh/authorized_keys` sur le serveur.

## Secrets GitHub

À créer dans l'environnement `production` **et** dans l'environnement `staging` :

| Secret | Contenu |
|---|---|
| `SSH_PRIVATE_KEY` | contenu de `deploy_key` (la clé privée) |
| `SSH_KNOWN_HOSTS` | sortie de `ssh-keyscan -H <hôte>` |
| `DEPLOY_HOST` | IP ou nom du serveur |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_PATH` | `/opt/mycelium` |
| `DEPLOY_PORT` | optionnel (22 par défaut) |

Les images sont tirées avec le `GITHUB_TOKEN` éphémère du workflow : aucun token de registre stocké.
Enfin, créer la variable de dépôt `DEPLOY_ENABLED` = `true`.

## Staging

- Workflow **Deploy staging** (manuel) : `ref` (branche, tag ou SHA), `slot` (`a` ou `b`),
  `reset_db` (repartir d'une base vide quand les migrations se contredisent). Le dernier déploiement
  sur un slot gagne.
- Chaque slot est un projet Compose séparé sur le même VPS (`mycelium-staging-<slot>`) avec sa propre
  base, son Redis et ses secrets, générés sur le serveur au premier déploiement (rien n'est copié de la prod).
- Le Caddy de prod le sert sur `<slot>.<STAGING_BASE_DOMAIN>`. Sans nom de domaine dédié, utiliser
  `sslip.io` : `STAGING_BASE_DOMAIN=staging.203-0-113-10.sslip.io` (avec l'IP du VPS) donne
  `a.staging.203-0-113-10.sslip.io`. La prod doit avoir été déployée au moins une fois.
- Usage : toute grosse fonctionnalité passe d'abord sur staging, la prod attend la validation.

## Première mise en service (checklist)

1. Louer le VPS, faire la mise en place ci-dessus, DNS, `.env`.
2. Créer les environnements `production` et `staging` et leurs secrets.
3. Créer la variable `DEPLOY_ENABLED` = `true`.
4. Lancer **Deploy** à la main (onglet Actions) sur `main` et vérifier : backup (sauté la première
   fois), migrations, healthcheck, puis le site sur `https://<DOMAIN>`.
5. Lancer **Deploy staging** avec `ref: dev`, `slot: a`.
