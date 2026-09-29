# Roadmap — jalons de développement

Calée sur le document de conception **`GDD_Mycelium.md`** (v0.1, dans le projet Claude « Jeu incremental »),
en particulier sa feuille de route MVP (§15) et ses aspects techniques (§12). Les numéros entre
parenthèses renvoient aux sections du GDD.

Chaque jalon correspond à une version `0.x.0` (voir `docs/versioning.md`) et se termine par une release.
Les **🔸 décisions** sont des points que le GDD laisse ouverts : le propriétaire les tranche **avant**
le début du jalon, Claude ne les invente pas. Les valeurs chiffrées du GDD (coûts, pertes, durées) sont
des points de départ à équilibrer, centralisés dans `packages/shared`.

| Jalon | Version | GDD §15 | Objectif | Statut |
|---|---|---|---|---|
| M0 Fondations | 0.1.0 | — | Dépôt, CI, pipeline de déploiement | ✅ (VPS reporté) |
| M1 Proto solo | 0.2.0 | étape 1 | Une carte, coloniser, produire, s'améliorer | ✅ |
| M2 Réseau & transport | 0.3.0 | étape 2 | Cœur, pertes, épuisement, hors-ligne | ✅ |
| M3 Multijoueur minimal | 0.4.0 | étape 3 | Forêt partagée, frontières, classement | à faire |
| M4 Saison | 0.5.0 | étape 4 | Semaine, phases journalières, wipe | à faire |
| M5 Profondeur : économie | 0.6.0 | étape 5 | Structures, mutations, souches, fructification | à faire |
| M6 Profondeur : conflit & événements | 0.7.0 | étape 5 | Actions actives, événements, world boss | à faire |
| M7 Social | 0.8.0 | étape 6 | Alliances, ligues, récompenses | à faire |
| M8 Bêta fermée | 0.9.0 | — | Plusieurs forêts, équilibrage, charge | à faire |
| Lancement | 1.0.0 | — | Ouverture publique | — |

---

## M0 — Fondations (0.1.0)

- [x] Monorepo TypeScript, grille hexagonale axiale partagée, serveur HTTP + WebSocket, client Vite.
- [x] CI, déploiement prod et staging, releases, `CLAUDE.md`.
- [x] Ruleset sur `main` et `dev` (PR + check `check`), environnements `production` et `staging`.
- [ ] VPS, domaine, `.env`, secrets des environnements, `DEPLOY_ENABLED` (`docs/deploy.md`).
  **Reporté** : on développe et on teste en local dans le navigateur (`pnpm dev:server` + `pnpm dev:web`)
  jusqu'à ce qu'on ait besoin de jouer à plusieurs à distance (au plus tard avant les tests de M3).

**Terminé quand** : `https://<domaine>/api/health` répond `ok` après un merge sur `main`.

## M1 — Proto solo (0.2.0) — GDD §15.1

✅ Décidé : terrains du proto = **Humus, Litière de feuilles, Bois mort** ; améliorations = **Digestion
accrue, Croissance des hyphes, Expansion économe, Conversion en biomasse, Décomposeur de bois**
(détail dans le GDD §14).
✅ Décidé : identité du proto = **compte invité avec un pseudo**, gardé dans le navigateur (pas de mot
de passe ni d'e-mail ; vrais comptes en M3).

- Générateur de carte hexagonale depuis une **graine** (§2.1), déterministe et testé. Pour le proto, une
  carte simple suffit : la forme finale dépend de la décision sur les secteurs (M3).
- Table `hex(q, r, terrain, owner_id, réserve, structure)` (§12) et persistance du joueur.
- **Simulation serveur par ticks** (1 tick / 5 s, §12) : le serveur fait autorité, le client affiche.
- Colonisation d'une case **adjacente**, coût `base × (1 + 0,05 × dist) × 1,02^nb_cases`, **temps de
  pousse** (30 s à quelques minutes) (§2.3).
- Ressources : **Nutriments** et **Biomasse** (§3) ; 5 améliorations à coût `base × 1,15^niveau` (§10).
- Client : carte zoomable en Canvas/WebGL (PixiJS, §12), panneau de ressources, notation des grands
  nombres (suffixes / scientifique), couche i18n EN + FR.

**Terminé quand** : en solo, on colonise, on produit et on achète des améliorations sur une carte
générée ; recharger la page retrouve exactement le même état.

Livré en 0.2.0. Choix de réalisation à valider en équilibrage (tous dans `packages/shared/src/balance.ts`) :
- valeurs provisoires : rendements, coûts de base, temps de pousse et réserves des 3 terrains, carte de
  rayon 10, 10 nutriments de départ, taux de conversion 10 %, coûts de base des améliorations ;
- une seule colonisation en pousse à la fois (la file d'expansion arrive en M2) ;
- la Biomasse s'ajoute en parallèle des Nutriments (`production × taux`), sans les consommer ;
- les réductions (Croissance des hyphes, Expansion économe) se composent (`0,92^niv`, `0,95^niv`),
  les bonus (Digestion, Conversion, Décomposeur) s'additionnent ;
- en l'absence du joueur, la production continue à 100 % jusqu'à son retour ; la règle hors-ligne
  du GDD (100 % pendant 8 h puis décroissance) arrive en M2 ;
- pas de brouillard en solo (prévu en M3).

## M2 — Réseau & transport (0.3.0) — GDD §15.2

✅ Décidé : épuisement complet (90 %) en **2 h** pour la Litière, **8 h** pour l'Humus, **4 h** pour le
Bois mort (qui devient alors de l'Humus) ; régénération au repos **4 fois plus lente** ; file d'expansion
de **10 cases** ; hors-ligne **100 % pendant 8 h puis palier à 25 %** ; **zones humides** ajoutées
(infranchissables, bonus d'humidité aux cases voisines).

- Le **Cœur** : case de départ, déplaçable 1×/jour (§2.4).
- **Graphe de transport** : perte de 1 % par saut jusqu'au Cœur ; cases **déconnectées** qui cessent
  de produire puis dépérissent (§2.4).
- **Épuisement** des cases et régénération lente (§2.3, formule §10).
- **Hors-ligne** : calcul analytique à la reconnexion (100 % pendant 8 h puis décroissance, §9, §12).
- **File d'expansion** exécutée pendant l'absence (§9) ; **Humidité** comme multiplicateur (§3).
- Script de simulation d'une semaine solo lancé en CI : vérifie la courbe (~10 nutriments/s le lundi
  vers ~1e12 le dimanche, §10) et l'absence d'emballement.

**Terminé quand** : un profil « 3 sessions de 10 min/jour » et un profil « 12 h/jour » simulés donnent
des courbes cohérentes avec le pilier 2 du GDD.

Livré en 0.3.0. Choix de réalisation à valider (dans `packages/shared/src/balance.ts`) :
- valeurs provisoires : bonus d'humidité +25 %, 8 % de zones humides, perte plafonnée à 90 %,
  case déconnectée perdue après 1 h ;
- « une fois par jour » pour le Cœur = délai glissant de 24 h ;
- la file se planifie en chemin (une case peut être voisine d'une case déjà en file), et une case qui
  n'est plus atteignable quand vient son tour est retirée ;
- le résumé d'absence est un avant-goût du Journal de la nuit (M6).

Constat de la simulation (`pnpm --filter @mycelium/shared simulate`) : avec l'économie de M1, la carte
solo de 331 cases est remplie dès le premier jour, puis la production plafonne vers 250 nutriments/s
à cause de l'épuisement. On est loin de la courbe visée (~1e12 le dimanche), qui demandera la
fructification et les multiplicateurs de M5 et un rééquilibrage des coûts. Le joueur 3 × 10 min finit
avec ~50 % de la biomasse du joueur 12 h/jour.

## M3 — Multijoueur minimal (0.4.0) — GDD §15.3

🔸 Décisions : **valider ou non la carte en secteurs symétriques, centre riche et dangereux (§2.5)** —
bloquant pour ce jalon ; mode de connexion définitif (compte invité, e-mail, OAuth ?).

- Comptes et sessions ; rejoindre une **forêt de 20 à 30 joueurs** avec départ équitable (§2.1).
- Génération de la carte partagée (800 à 1 800 hexagones) selon la décision §2.5.
- **Brouillard** : on ne voit que les cases adjacentes à son réseau (§2.1).
- **Frontières à pression automatique** : `densité × agression × humidité`, le plus fort grignote le
  plus faible sans être en ligne (§6.1) ; bonus de conquête et Trophées (§2.5).
- Protections : zone de départ protégée 24 h, **bouclier hors-ligne** après 2 h (§6.4).
- **Classement** en temps réel (Redis) sur la **biomasse cumulée**, par forêt et global (§8.1) ;
  mini-classement toujours visible (§11).

**Terminé quand** : sur staging, plusieurs joueurs partagent une forêt, se rencontrent aux frontières,
se prennent des cases et voient le classement bouger en direct.

## M4 — Saison (0.5.0) — GDD §15.4

- Planificateur : classement figé **dimanche 23h59**, **wipe lundi 00h00 Europe/Paris**, nouvelle graine
  publiée après le wipe (§1, §7, §12).
- **Phases journalières** et leurs modificateurs, de Germination (×2, pas de PvP) à Décomposition finale
  (§7).
- Archivage des classements et historique de saison (« Top 3 Forêt #12, Semaine 38 », §8.2).
- **Bonus de départ par palier**, actif le lundi uniquement (+10 % / +5 % / +2 %, §8.2).

**Terminé quand** : sur staging, une saison accélérée (7 « jours » de quelques minutes) enchaîne ses
phases, se fige, archive son classement et redémarre seule.

## M5 — Profondeur : économie (0.6.0) — GDD §15.5

🔸 Décisions : liste et effets chiffrés des mutations ; valeurs des souches.

- **Structures** (une par case) : Nœud de digestion, Glande enzymatique, Réservoir, Rhizomorphe,
  Sclérote, Carpophore (§4.1).
- **Mutations** en 3 branches : Décomposeur, Parasite, Symbiote, dont les mutations clés (§4.2).
- **Souches** au début de saison : Pleurote, Armillaire, Cordyceps, Truffe (+ Moisissure débloquable) (§4.3).
- **Fructification** et **Spores** (prestige intra-saison), sans perte de place au classement (§5).
- Tous les **terrains** du §2.2 et le déblocage progressif des ressources (Enzymes, Spores, puis Signaux) (§3).
- **Automatisations** débloquées par progression (§9).

**Terminé quand** : les simulations montrent qu'aucune branche ni souche ne domine, et qu'une
fructification bien placée est rentable.

## M6 — Profondeur : conflit & événements (0.7.0) — GDD §15.5

- **Actions actives** à Enzymes et cooldown : Assaut, Toxine, Coupure, Siphon (§6.2).
- Anti-frustration complet : Cœur perdu au plus 1×/jour, rebond par Sclérote, surcoût pour attaquer un
  joueur 3× plus petit (§6.4) ; règles de risque du centre (§2.5).
- **Événements aléatoires** (1 à 3 par jour) : orage, incendie, sanglier, invasions PvE (§7).
- **World boss** « Arbre mourant » avec récompense au prorata (§7).
- **Journal de la nuit** à la connexion et notifications en jeu (§11).

**Terminé quand** : sur staging, une saison de test voit des coupures, des retournements et au moins un
world boss partagé, sans qu'un joueur absent perde tout.

## M7 — Social (0.8.0) — GDD §15.6

✅ Décidé : **chat de forêt en jeu + messages privés** (pas de Discord).
🔸 Décision : canal des notifications (navigateur, e-mail…).

- **Pactes de symbiose** à 2-4, rupture avec malus « Réseau tâché », échanges via Signaux chimiques,
  classement d'alliance (§6.3).
- **Classements secondaires** (territoire, conquêtes, world boss, alliance, efficacité, §8.1).
- **Ligues** Bronze → Mycélium Primordial, promotion / relégation hebdomadaire (§8.3).
- **Récompenses conservées** : titres, couleurs de réseau, skins de carpophores, déblocage de souches (§8.2).
- **Chat de forêt** et **messages privés** en temps réel, avec historique et modération minimale
  (anti-spam, signalement, mise en sourdine).

**Terminé quand** : une alliance se forme, se trahit, et les récompenses de fin de saison apparaissent
bien sur le compte après le wipe.

## M8 — Bêta fermée (0.9.0)

- Plusieurs forêts en parallèle, répartition par ligue.
- Test de charge : 30 joueurs actifs par forêt, plusieurs forêts, tick à 5 s tenu.
- Équilibrage sur de vraies saisons ; vérifier l'objectif du §9 (3 × 10 min/jour → top 20 % de la forêt).
- Arrivée en cours de semaine : bonus de rattrapage et zone de friche (§13.8).

**Terminé quand** : deux saisons complètes jouées par des testeurs sans incident bloquant.

## 1.0 — Lancement public

Page d'accueil, conditions d'utilisation et confidentialité, restauration de sauvegarde testée.

## Après 1.0

Les idées « en vrac » du GDD (§13) : Wood Wide Web, spores voyageuses, hybridation, contrats de forêt,
replay en timelapse, enchères de territoire, saisons à thème, vassalité, fin de saison spectaculaire.
