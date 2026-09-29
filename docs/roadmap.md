# Roadmap — jalons de développement

Base : les décisions de design déjà prises (voir `CLAUDE.md`). Chaque jalon correspond à une version
`0.x.0` (voir `docs/versioning.md`) et se termine par une release. Les **🔸 décisions** sont des
points de game design à trancher par le propriétaire **avant** de commencer le jalon : Claude ne les
invente pas.

| Jalon | Version | Objectif | Statut |
|---|---|---|---|
| M0 Fondations | 0.1.0 | Monorepo, CI, pipeline de déploiement | ✅ code prêt, VPS à venir |
| M1 Carte | 0.2.0 | Une forêt hexagonale générée par le serveur et affichée | à faire |
| M2 Joueurs & forêts | 0.3.0 | Se connecter, rejoindre une forêt, avoir un point de départ | à faire |
| M3 Boucle incrémentale | 0.4.0 | Produire, investir, s'étendre (sans combat) | à faire |
| M4 PvP | 0.5.0 | Contact, combat et conquête de cases | à faire |
| M5 Social | 0.6.0 | Chat de forêt, messages privés, alliances | à faire |
| M6 Saison | 0.7.0 | Classement et wipe hebdomadaire | à faire |
| M7 Méta-progression | 0.8.0 | Ce qu'on garde d'une saison à l'autre | à faire |
| M8 Bêta fermée | 0.9.0 | Plusieurs forêts, équilibrage, tenue en charge | à faire |
| Lancement | 1.0.0 | Ouverture publique | — |

---

## M0 — Fondations (0.1.0)

- [x] Monorepo TypeScript, grille hexagonale partagée, serveur HTTP + WebSocket, client Vite.
- [x] CI, déploiement prod et staging, releases, `CLAUDE.md`.
- [ ] Rulesets GitHub sur `main` et `dev`.
- [ ] VPS, domaine, secrets, premier déploiement réel (`docs/deploy.md`).

**Terminé quand** : `https://<domaine>/api/health` répond `ok` après un merge sur `main`.

## M1 — Carte (0.2.0)

🔸 Décisions : forme et taille de la carte pour 20–30 joueurs ; types de cases (terrain neutre,
ressources, obstacles…) ; carte symétrique ou procédurale (tu veux des départs équitables).

- Générateur de forêt dans `packages/shared` (déterministe à partir d'une graine, testé : même graine
  = même carte, départs équidistants).
- Stockage de la forêt côté serveur (Postgres) et envoi au client par WebSocket.
- Rendu de la carte dans le client : déplacement, zoom, sélection d'une case.
- Couche i18n EN + FR (premier texte joueur).

**Terminé quand** : on ouvre le jeu et on voit la même carte que le serveur, navigable sur mobile et PC.

## M2 — Joueurs & forêts (0.3.0)

🔸 Décisions : connexion (compte invité + pseudo ? e-mail ? OAuth ?) ; peut-on rejoindre une forêt
en cours de semaine, et avec quel rattrapage ?

- Comptes et sessions (JWT), pseudo unique.
- Rejoindre une forêt (plafond 20–30 joueurs), attribution d'un point de départ équitable.
- Reconnexion : l'état du joueur est persistant et rechargé.

**Terminé quand** : deux navigateurs différents rejoignent la même forêt et se voient sur la carte.

## M3 — Boucle incrémentale (0.4.0)

🔸 Décisions : ressources (nutriments, spores… ?), ce qui les produit, ce qu'on achète avec,
coût d'extension d'une case, progression hors ligne (oui/non, plafond).

- Moteur de production côté serveur (le serveur fait autorité, le client prédit l'affichage).
- Extension sur une case adjacente, améliorations, progression hors ligne.
- Courbe d'équilibrage centralisée dans `packages/shared` + script de simulation d'une semaine.

**Terminé quand** : un joueur seul peut jouer une semaine simulée avec une progression lisible et
sans explosion de chiffres (vérifié par la simulation en CI).

## M4 — PvP (0.5.0)

🔸 Décisions : règles de combat (attaque/défense, simultané ou au tour, visibilité), ce qu'on gagne à
prendre une case, protection des débutants / anti-acharnement, comment « le risque rapporte plus ».

- Détection du contact entre mycéliums, attaque d'une case adverse, résolution côté serveur.
- Récompenses de risque, historique des combats, notifications.
- Simulations d'équilibrage avec plusieurs profils (agressif, défensif, passif).

**Terminé quand** : sur staging, une partie test à plusieurs joueurs voit des conquêtes et aucune
stratégie ne domine dans les simulations.

## M5 — Social (0.6.0)

🔸 Décisions : alliances formelles dans le jeu ou seulement via les messages ? Limites (taille, partage de victoire ?).

- Chat de forêt et messages privés en temps réel, historique.
- Modération minimale : anti-spam (limite de débit), signalement, mise en sourdine.

**Terminé quand** : les joueurs d'une forêt discutent et négocient en jeu, un spam est bloqué.

## M6 — Saison (0.7.0)

🔸 Décisions : critère du classement (cases, ressources, score composite ?), jour et heure du wipe,
ce qui se passe les dernières heures.

- Classement en temps réel (Redis).
- Planificateur de saison : fin de semaine, figement des résultats, archivage, wipe, nouvelle forêt.
- Écran de fin de saison.

**Terminé quand** : sur staging, une saison accélérée (quelques heures) se termine, archive son
classement et redémarre toute seule.

## M7 — Méta-progression (0.8.0)

🔸 Décisions : liste des skins, titres et souches alternatives ; paliers du bonus de départ selon le
classement précédent (petit, pour garder l'équité).

- Inventaire du compte qui survit au wipe (skins, titres, souches alternatives).
- Bonus de départ par palier, appliqué au début de la saison suivante.

**Terminé quand** : un joueur classé la saison précédente commence la suivante avec son bonus et ses cosmétiques.

## M8 — Bêta fermée (0.9.0)

- Plusieurs forêts en parallèle, répartition des joueurs dans les forêts.
- Test de charge (30 joueurs actifs par forêt, plusieurs forêts), métriques et logs exploitables.
- Retours joueurs, correctifs, passes d'équilibrage sur de vraies saisons.

**Terminé quand** : deux saisons complètes jouées par des testeurs sans incident bloquant.

## 1.0 — Lancement public

Page d'accueil, conditions d'utilisation et confidentialité, sauvegardes vérifiées (restauration testée).
