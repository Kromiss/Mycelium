# Changelog

Toutes les évolutions notables de Mycelium. Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versions [semver](https://semver.org/lang/fr/).

## [Unreleased]

### Added
- **Actions actives** (GDD §6.2), payées en Enzymes, avec une recharge par action, interdites le
  lundi, sur une case ennemie collée à son réseau : **Assaut** (30, 4 h : prise 4× plus rapide pendant
  30 min, dès qu'on pousse plus fort que le défenseur), **Toxine** (20, 3 h : la case et ses voisines
  −50 % pendant 1 h), **Coupure** (40, 6 h : la case ne fait plus passer les nutriments pendant 45 min,
  sans dépérissement derrière ; pas sur un Rhizomorphe ni sur un Cœur), **Siphon** (25, 4 h : 20 % de
  la production des cases à 2 ou moins pendant 2 h).
- **Anti-frustration** (§6.4) : le Cœur est prenable, 4× plus lentement ; il renaît sur le Sclérote,
  sinon sur la case la plus proche, puis reste protégé 24 h. Contre un joueur 3× plus petit : prises
  4× plus lentes, actions 3× plus chères. **Plancher** : un joueur à 7 cases ne peut plus en perdre.
- **Risque du centre** (§2.5) : biomasse ×1,5, bouclier hors ligne réduit à −25 %, Coupures 2× moins chères.
- Client : section « Attaquer » dans le panneau d'une case ennemie, effets en cours sur les cases et
  sur la carte, Cœur protégé, alertes de Cœur pris (EN + FR).
- Migration `0010_active_actions`.
- Robots de test : option **`aim`** dans le plan d'un robot (`BotPlan`) : `"centre"` fonce vers le
  centre riche, `"home"` reste dans sa part (bord et anneau, jamais le centre) et évite les cases
  collées à un voisin. Sans `aim`, rien ne change.
- Simulation **`simulate:profiles`** : robots connectés 24 h/24 ou une action toutes les 3 h, qui jouent
  le centre ou leur base ; les profils tournent sur les places pour neutraliser la carte, `--out`
  écrit les données et les cartes jour par jour.

## [0.6.0] - 2026-09-30

M5 — Profondeur : économie (GDD §15.5).

### Added
- **Nouveaux terrains** (§2.2) : Souche (très riche, au centre), Racines d'arbre (+3 % de production
  pour tout le réseau par case), Roche (se paie en Enzymes, rempart : les cases voisines du même
  joueur sont prises deux fois moins vite), Sol acide (riche, s'use en 2 h). Roche et Racines restent
  hors des zones de départ, de la même façon dans chaque part.
- **Structures** (§4.1), une par case, prix × 1,5 à chaque structure possédée : Nœud de digestion
  (+50 %), Glande enzymatique (Enzymes, case −50 %), Réservoir (humidité pour ses cases voisines),
  Rhizomorphe (pas de perte de transport, prise ×0,5), Sclérote (imprenable, un seul), Carpophore
  (vision 3, visible de tous, nécessaire pour fructifier). Perdues avec la case.
- **Enzymes** (§3), débloquées à la 15ᵉ case ou le mardi.
- **Mutations** (§4.2) : un point à 20 k, 60 k, 180 k… de biomasse ; 15 mutations en trois branches
  (Décomposeur, Parasite, Symbiote), prises dans l'ordre, sans retour en arrière.
- **Souches** (§4.3), choisies avant la première case : Pleurote, Armillaire, Cordyceps, Truffe.
- **Fructification** (§5) : on garde les cases à une distance choisie du Cœur (2 ou plus) et on libère
  le reste contre des Spores ; il faut un Carpophore. **Boutique de Spores** : Vigueur, Propagation
  rapide, Fructifications, Dérive génétique.
- **Automatisations** (§9) : colonisation automatique (terrain préféré) à 100 k de biomasse, achat
  automatique des améliorations à 1 M ; elles tournent aussi hors ligne.
- Client : Enzymes dans la barre du haut, liste de construction dans le panneau de case, onglets
  Mutations et Spores, choix de la souche en début de saison, cases libérées par une fructification
  surlignées sur la carte (EN + FR).
- Simulation d'équilibre (`pnpm --filter @mycelium/shared simulate:balance`) : les 12 combinaisons
  souche × branche jouent chaque place d'une même carte ; lancée en CI avec le test de fructification.
- Migrations `0007_structures_enzymes`, `0008_mutations_strains`, `0009_fruiting_automation`.

### Changed
- Coûts de colonisation +10 % (Litière 4 000, Humus 8 000, Bois mort 20 000) pour garder le rythme
  de remplissage malgré les structures : 90 % de la forêt vers le jour 3,8.
- Robots de test : souche, mutations, structures, et fructification pour la moitié d'entre eux.

## [0.5.0] - 2026-09-30

M4 — Saison (GDD §15.4).

### Added
- **Saisons d'une semaine**, calées sur l'heure de Paris (heure d'été comprise) : une forêt appartient
  à une semaine, son classement se fige le **dimanche à 23 h 59** et elle est archivée puis effacée le
  **lundi à 0 h**. Les comptes sont gardés : chaque joueur rejoint une nouvelle forêt (nouvelle carte)
  à sa première connexion de la semaine.
- **Phases journalières** (§7, paquet validé) : lundi Germination (pousse 2× plus rapide, aucune
  capture), mardi Printemps (production +20 %), mercredi Été (−25 %, sauf près des zones humides),
  jeudi Chute (captures 2× plus rapides), vendredi Automne (colonisation −30 %, Bois mort +50 %),
  samedi Gel (production −30 %, captures 2× plus lentes), dimanche Décomposition finale (biomasse ×1,5,
  captures 1,5× plus rapides). Le changement de phase est intégré exactement, même hors ligne.
- Bandeau de phase avec ses effets et le compte à rebours jusqu'à la fin de saison.
- **Fin de saison** : écran « La semaine N est terminée » avec le rang, la biomasse, les cases, les
  Trophées et la **graine de la carte, désormais publique** ; bouton pour rejoindre la nouvelle saison.
- **Historique des saisons** (semaine, forêt, rang, biomasse, graine) dans le classement complet.
- **Bonus de départ du lundi** selon le rang de la saison précédente : +10 % (top 10 %), +5 % (top 50 %),
  +2 % (participant), sur la production du lundi uniquement.
- Classements Redis séparés par saison (`lb:<saison>:…`, gardés deux semaines).
- Migration `0006_seasons` (semaine des forêts, résultats de saison, bonus du lundi).

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
  maintenant environ un tiers le premier jour, 90 % vers le jour 3,5–5, presque tout au jour 5 ;
  valeurs finales : coûts de base Litière 3 600, Humus 7 200, Bois mort 18 000, `1,13 ^ nb_cases`.
- **Usure plafonnée à 40 %, sans régénération** : une case usée garde 60 % de sa production (au lieu
  de 10 %). L'usure atteint son plafond au bout de la même durée qu'avant (Litière 2 h, Humus 8 h, Bois
  mort 4 h, qui devient alors de l'Humus) et ne redescend jamais, même si la case change de mains.
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
