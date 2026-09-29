# Changelog

Toutes les évolutions notables de Mycelium. Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versions [semver](https://semver.org/lang/fr/).

## [Unreleased]

## [0.3.0] - 2026-09-29

M2 — Réseau & transport (GDD §15.2).

### Added
- **Cœur** et graphe de transport : les nutriments remontent au Cœur avec 1 % de perte par saut ;
  le Cœur se déplace sur une case reliée, une fois par 24 h.
- Cases **déconnectées** : elles cessent de produire, puis sont perdues au bout d'une heure.
- **Épuisement** des cases (`min(0,9 ; temps occupé / durée de vie)`) : Litière 2 h, Humus 8 h,
  Bois mort 4 h puis il devient de l'Humus ; une case au repos se régénère 4 fois plus lentement.
- **File d'expansion** de 10 cases, planifiable en chemin, qui continue pendant l'absence.
- **Hors-ligne** : production à 100 % pendant 8 h puis à 25 %, rattrapée exactement au retour,
  avec un résumé « Pendant ton absence ».
- **Zones humides** sur la carte : infranchissables, +25 % de production pour les cases voisines ;
  la carte ne coupe jamais de terres du départ.
- Simulation d'une semaine solo (profils 3 × 10 min/jour et 12 h/jour) lancée en CI,
  et `pnpm --filter @mycelium/shared simulate` pour afficher les courbes.
- Migration `0004_network_transport`.

### Changed
- Coloniser ajoute la case à la file ; elle démarre tout de suite si rien ne pousse.

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
