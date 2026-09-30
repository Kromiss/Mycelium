# Changelog

Toutes les évolutions notables de Mycelium. Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versions [semver](https://semver.org/lang/fr/).

## [Unreleased]

## [0.4.0] - 2026-09-30

M3 — Multijoueur minimal (GDD §15.3).

### Added
- **Comptes pseudo + mot de passe** (scrypt), sessions par navigateur, connexion et déconnexion,
  limitation des tentatives de connexion. Les comptes invités de M1–M2 gardent leur accès et sont
  invités à choisir un mot de passe.
- **Forêts partagées** de 12 joueurs (GDD §2.5 validé) : carte ronde découpée en parts
  identiques, une par joueur, qui suivent le même motif ; bord pauvre et sûr, anneau ×1,5,
  centre riche ×3 à ×5 avec plus de bois mort. Un nouvel arrivant rejoint la forêt la plus
  ancienne qui a de la place, loin des parts déjà prises.
- **Brouillard** : on ne voit que son réseau et les cases voisines.
- **Frontières à pression** (§6.1) : la case voisine passe au réseau qui pousse le plus fort
  autour d'elle, en 10 min (Litière) à 2 h (Bois mort) à pleine vitesse ; bonus de conquête en
  biomasse et Trophée ; les cases coupées du Cœur dépérissent.
- **Protections** (§6.4) : Cœur imprenable, zone de départ réservée et imprenable 24 h (et
  réservée tant que la part est libre), captures deux fois plus lentes sur un joueur absent
  depuis plus de 2 h.
- **Classement** en direct par biomasse (§8.1), mini-classement toujours visible, classement
  complet et rang global ; Redis quand il est configuré.
- Toute la forêt est simulée sur le serveur, joueurs connectés ou non ; résumé d'absence avec
  les cases gagnées et perdues.
- Outils de test en local : `BOTS=n` (robots qui jouent seuls) et `TIME_SCALE=n` (temps accéléré),
  refusés en production.
- Migration `0005_forests_accounts`.
- Simulation d'une semaine de forêt (12 robots, moitié actifs, moitié occasionnels) lancée en CI :
  vérifie qu'une forêt se remplit vers le 4ᵉ–5ᵉ jour et que personne ne cesse de progresser ;
  `pnpm --filter @mycelium/shared simulate:forest` pour voir le détail.

### Changed
- **Rythme de début ralenti** : coûts de colonisation de base ×600 (Litière 3 000, Humus 6 000,
  Bois mort 15 000), chaque case rend la suivante 8 % plus chère (au lieu de 2 %), améliorations
  ×300, 10 000 nutriments au départ. Avant, une forêt se remplissait en quelques heures ;
  maintenant environ un tiers le premier jour, 90 % vers le jour 3,5–4,5, presque tout au jour 5.
- Les parties solo de M1–M2 ne sont plus jouées : un compte existant repart de zéro dans une forêt.
- Coloniser une case d'une autre colonie est impossible : les frontières se gagnent par pression.

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
