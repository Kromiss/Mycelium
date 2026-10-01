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
| M3 Multijoueur minimal | 0.4.0 | étape 3 | Forêt partagée, frontières, classement | ✅ (testé en local) |
| M4 Saison | 0.5.0 | étape 4 | Semaine, phases journalières, wipe | ✅ (testé en local) |
| M5 Profondeur : économie | 0.6.0 | étape 5 | Structures, mutations, souches, fructification | ✅ (testé en local) |
| M6 Profondeur : conflit & événements | 0.7.0 | étape 5 | Actions actives, événements, world boss | ✅ (testé en local) |
| M7 Social | 0.8.0 | étape 6 | Alliances, ligues, récompenses | ✅ (testé en local) |
| M8 Incrémental : enrichissement & cohésion | 0.9.0 | — | Niveaux de case, Bourgeons, bonus des cases collées, nouveau visuel | ✅ (testé en local) |
| M9 Refonte : rythme, centre & souches | 0.10.0 | étape 8 | Forêt remplie au 6ᵉ–7ᵉ jour, cases ×3, usure retirée, 7 zones, 2 souches, visuel, admin de test | à faire |
| M10 Bêta fermée | 0.11.0 | — | Plusieurs forêts, équilibrage, charge | à faire |
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
Bois mort (qui devient alors de l'Humus) ; régénération au repos **4 fois plus lente** *(remplacé en M3 :
usure plafonnée à 40 %, sans régénération)* ; file d'expansion
de **10 cases** ; hors-ligne **100 % pendant 8 h puis palier à 25 %** ; **zones humides** ajoutées
(infranchissables, bonus d'humidité aux cases voisines).

- Le **Cœur** : case de départ, déplaçable 1×/jour (§2.4).
- **Graphe de transport** : perte de 1 % par saut jusqu'au Cœur ; cases **déconnectées** qui cessent
  de produire puis dépérissent (§2.4).
- **Épuisement** des cases (§2.3, formule §10).
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

✅ Décidé : carte du **§2.5 validée** (parts symétriques, bord sûr, centre riche), forêts de **12 joueurs** ;
rythme : une forêt doit être **pleine vers le 4ᵉ–5ᵉ jour**, réglé uniquement par les chiffres ; **usure
plafonnée à 40 %, sans régénération** (une case usée garde 60 % de sa production) ; connexion par
**pseudo + mot de passe** ; temps de prise d'une case **selon le terrain, de 10 min à 2 h** ; tests
**en local avec des robots** (le VPS attendra).

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

Livré en 0.4.0, validé en local (`BOTS=11 TIME_SCALE=60`) plutôt que sur staging. Choix de réalisation
à valider (dans `packages/shared/src/balance.ts`) :
- ~50 cases par joueur, départs à 85 % du rayon, anneaux à 1/3 et 2/3 du rayon ;
- rythme réglé avec `simulate:forest` : coûts de base Litière 3 600 / Humus 7 200 / Bois mort 18 000,
  `1,13 ^ nb_cases` au lieu de `1,02`, améliorations de 7 500 à 18 000, 10 000 nutriments au départ ;
- mélange de terrains par anneau, bord qui s'épuise 1,5× moins vite, 6 % de zones humides ;
- `densité_réseau_local` = cases du joueur à 2 cases ou moins (pondérées par l'humidité) ; prise à
  pleine vitesse dès que l'attaquant pousse 2× plus fort, rien sous l'égalité ; captures : Litière
  10 min, Humus 45 min, Bois mort 2 h ; bonus de conquête = 1 h de production de la case en biomasse ;
- les Trophées sont comptés et affichés mais ne s'ajoutent pas au score ;
- le Cœur est imprenable (la perte du Cœur et le Sclérote viennent en M6) ;
- la zone de départ (rayon 2) est réservée à son joueur pendant 24 h, et tant que la part est libre ;
- « biomasse qui compte double au centre » et le reste des risques du centre sont laissés à M6.

Constat avec 12 robots sur une semaine (6 actifs, 6 occasionnels), sur trois cartes : 25 à 33 % de la
forêt occupée le premier jour, 90 % entre le jour 3,6 et le jour 5, 89 à 98 % au jour 5. Point ouvert :
le premier joueur au centre prend beaucoup d'avance, et un joueur coincé entre deux voisins sur le bord
pauvre stagne à partir du 3ᵉ jour (réponses prévues en M5–M6).

## M4 — Saison (0.5.0) — GDD §15.4

- Planificateur : classement figé **dimanche 23h59**, **wipe lundi 00h00 Europe/Paris**, nouvelle graine
  publiée après le wipe (§1, §7, §12).
- **Phases journalières** et leurs modificateurs, de Germination (×2, pas de PvP) à Décomposition finale
  (§7).
- Archivage des classements et historique de saison (« Top 3 Forêt #12, Semaine 38 », §8.2).
- **Bonus de départ par palier**, actif le lundi uniquement (+10 % / +5 % / +2 %, §8.2).

**Terminé quand** : sur staging, une saison accélérée (7 « jours » de quelques minutes) enchaîne ses
phases, se fige, archive son classement et redémarre seule.

✅ Décidé : **paquet de phases proposé** — Germination (pousse ×2, pas de capture), Printemps
(production +20 %), Été (−25 % sauf près des zones humides), Chute (captures ×2), Automne
(colonisation −30 %, Bois mort +50 %), Gel (production −30 %, captures ×0,5), Décomposition finale
(biomasse ×1,5, captures ×1,5).
✅ Décidé : **wipe = nouvelles forêts** : les comptes sont gardés, la forêt de la semaine est archivée
puis effacée, chaque joueur rejoint une nouvelle forêt à sa première connexion de la semaine.

Livré en 0.5.0, validé en local (`BOTS=11 TIME_SCALE=1200` : une fin de semaine en 5 minutes, phases,
fin de saison, historique, bonus du lundi et nouvelle forêt) plutôt que sur staging. Choix de
réalisation à valider (dans `packages/shared/src/season.ts`) :
- les phases changent à minuit, heure de Paris ; après le gel du dimanche 23 h 59, plus rien ne compte
  (biomasse et captures arrêtées) jusqu'au wipe ;
- le bonus du lundi s'applique à la production (donc aussi à la biomasse), seulement le lundi ;
- les paliers se calculent sur le rang dans la forêt (« top 10 % » = rang ≤ 10 % des joueurs) ;
- un joueur sans forêt la semaine précédente n'a pas de bonus ;
- l'historique garde les 5 dernières saisons à l'écran (toutes en base).

Le rythme de la forêt reste dans la cible avec les phases : 90 % occupée entre le jour 3,2 et le
jour 4,9 selon la carte.

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

✅ Décidé : **paquets proposés** pour les mutations (15, en trois branches, points par paliers de
biomasse ×3, sans retour en arrière), les souches (Pleurote, Armillaire, Cordyceps, Truffe ; la
Moisissure vient avec les récompenses en M7) et les structures / la fructification (Carpophore
obligatoire, valeur = coût de colonisation actuel des cases libérées). Livraison en trois étapes.

Livré en 0.6.0, validé en local. Équilibrage par `simulate:balance` (une carte jouée 12 fois, les 12
combinaisons souche × branche tournant sur les parts) : rang moyen de 5,8 à 7,2 par souche et de 6,0
à 6,8 par branche sur deux cartes (6,5 = milieu). Une fructification au jour 3 (rayon 3) finit la
semaine avec +18 % de biomasse. Chiffres changés par rapport au paquet validé, **à valider** :
- Armillaire ×0,95 le lundi (au lieu de ×0,85), +0,05 par jour, donc ×1,25 le dimanche ;
- Pleurote : cases prises +15 % plus vite (au lieu de +25 %) ; Truffe : Racines +30 % (au lieu de +50 %) ;
- Mycorhize : Racines ×4 (au lieu de ×2) ; Cordons mycéliens : plus aucune perte (au lieu de −50 %) ;
- Usure lente : l'usure s'arrête à 30 % (au lieu de 25 %).
Choix de réalisation (dans `balance.ts`) : Racines +3 % de production du réseau par case, Glande
0,01 Enzyme/s (×2 sur bois mort), Roche 40 Enzymes, structures 36 k à 90 k × 1,5 par structure,
boutique de Spores 10 à 25 Spores × 1,5 par niveau, Hyphes aquatiques = zone humide colonisable
comme de l'Humus pauvre (0,5/s), la Truffe cache ses cases de la vision lointaine (Carpophore,
Bioluminescence), Toxines/Témérité recalculées à chaque tick.

Points ouverts :
- environ 10 % des robots finissent avec 3 cases ou moins : les protections contre l'acharnement
  (§6.4 : coût d'attaque contre plus petit, perte du Cœur) arrivent en M6 ;
- les écarts de score restent énormes (le premier au centre), comme avant M5 ;
- Bioluminescence et Résilience n'ont presque pas de valeur pour les robots : la branche Symbiote
  prendra plus de sens avec les alliances (M7) et les événements (M6).

## M6 — Profondeur : conflit & événements (0.7.0) — GDD §15.5

- **Actions actives** à Enzymes et cooldown : Assaut, Toxine, Coupure, Siphon (§6.2).
- Anti-frustration complet : Cœur perdu au plus 1×/jour, rebond par Sclérote, surcoût pour attaquer un
  joueur 3× plus petit (§6.4) ; règles de risque du centre (§2.5).
- **Événements aléatoires** (1 à 3 par jour) : orage, incendie, sanglier, invasions PvE (§7).
- **World boss** « Arbre mourant » avec récompense au prorata (§7).
- **Journal de la nuit** à la connexion et notifications en jeu (§11).

**Terminé quand** : sur staging, une saison de test voit des coupures, des retournements et au moins un
world boss partagé, sans qu'un joueur absent perde tout.

✅ Décidé : **paquet proposé validé**, avec deux changements (biomasse ×1,5 au centre, plancher à 7 cases) ;
les chiffres d'équilibrage de M5 marqués « à valider » sont acquis. Livraison en trois étapes.
- **Actions actives** (Enzymes, recharge par action, interdites le lundi, sur une case ennemie collée à
  son réseau) : Assaut (30, recharge 4 h : prise 4× plus rapide pendant 30 min, dès que l'on dépasse
  l'égalité), Toxine (20, 3 h : la case et ses voisines du même joueur −50 % pendant 1 h), Coupure (40,
  6 h : la case ne fait plus passer les nutriments pendant 45 min, sans dépérissement des cases coupées ;
  un Rhizomorphe ne peut pas être coupé), Siphon (25, 4 h : 20 % de la production de la case et des cases
  du même joueur à 2 cases ou moins, pendant 2 h).
- **Anti-frustration** : Cœur prenable 4× plus lentement ; il renaît sur le Sclérote, sinon sur la case
  la plus proche de l'ancien Cœur, puis reste imprenable 24 h. Contre un joueur 3× plus petit : prises
  4× plus lentes, actions 3× plus chères. **Plancher : un joueur à 7 cases ne peut plus en perdre.**
- **Risque du centre** : bouclier hors ligne réduit (prises −25 % au lieu de −50 %), Coupures 2× moins
  chères, événements plus forts, **biomasse ×1,5**.
- **Événements** (1 à 3 par jour du mardi au dimanche, annoncés 1 h avant, au plus 10 % des cases d'un
  joueur par événement, jamais le Cœur ni le Sclérote) : Orage, Incendie (puis Cendres ×2 pendant 24 h),
  Sanglier, Chute d'arbre (le jeudi), Carcasse (12 h), Nématodes (PvE). Ruine reportée à M7.
- **Arbre mourant** (world boss) jeudi et dimanche après-midi, au centre, 7 cases ; digéré au prorata de
  la production, PV ≈ 2 h de production de la forêt, 6 h au plus ; biomasse et Enzymes au prorata,
  Trophée au meilleur contributeur.
- **Journal de la nuit** et alertes en jeu (navigateur / e-mail : décision de M7).

Livré en 0.7.0, validé en local (`BOTS=11 TIME_SCALE=120` : annonces, Chute d'arbres, Nématodes, Arbre
mourant digéré par les robots) et par simulation. Choix de réalisation à valider (dans `balance.ts`) :
- Coupure : aussi interdite sur un Cœur ; les cases coupées ne produisent plus mais ne dépérissent pas.
  Toxine et Siphon touchent seulement les cases du même propriétaire ; le Siphon donne au lanceur des
  nutriments et la biomasse qu'ils lui auraient rapportée.
- **Le plancher de 7 cases arrête aussi le dépérissement** des cases déconnectées (sinon une coupure
  faisait passer sous le plancher).
- Événements tirés de la graine à l'ouverture de la forêt (heure et type), placés à l'annonce ; entre
  8 h et 20 h ; plus forts au centre = Orage +75 %, Incendie de rayon 3, Sanglier ×1,5, Nématodes plus
  résistants et plus voraces. Carcasse : 12 nutriments/s, 6 000 de coût. Nématodes : vie = 1,5 h de
  production des cases de la zone (50 k au moins), une case toutes les 30 min, prime = ½ de ce qu'on a
  digéré. Arbre mourant : 2 h de production de la forêt (200 k au moins), digéré par **toute** la
  production des colonies qui le touchent ; biomasse = ¼ de ce qu'on a digéré, 300 Enzymes au prorata,
  Trophée au meilleur ; placé sur l'amas du centre qui a le moins de cases prises ; il laisse 7 Souches.
- Journal de la nuit et alertes gardés en mémoire (perdus au redémarrage du serveur) ; une alerte de
  frontière au plus toutes les 30 min par voisin ; alerte « fin de saison dans 1 h » côté client.
- Robots : une Glande à 20 cases, puis au plus une action par décision (Assaut, Coupure, Siphon, Toxine).

Constats des simulations :
- Rythme inchangé : la forêt se remplit au même jour qu'avant M6 avec la même configuration.
- Équilibre des souches et des branches tenu : rang moyen de 6,3 à 6,7 sur 12 forêts (6,5 = milieu) ;
  une fructification au jour 3 rapporte +29 %.
- Semaine test : des coupures, des retournements au classement, chaque Arbre mourant partagé par 2 à 4
  colonies, personne sous 7 cases. Les Cœurs ne tombent presque jamais (0 dans les simulations).
- **Point ouvert** : quand les robots utilisent les actions, la colonie la plus faible finit en général
  au plancher de 7 cases (23 sans les actions). L'écart de biomasse entre premier et dernier s'élargit
  aussi (×130 à ×220 sur une semaine simulée, contre ×54 avant M6), mais aucune règle ne l'explique à
  elle seule d'après les variantes testées, et une seule semaine varie beaucoup. Leviers possibles :
  ligues (M7), rattrapage (M9), anti-acharnement plus fort ; à trancher avec de vrais joueurs.

## M7 — Social (0.8.0) — GDD §15.6

✅ Décidé : **chat de forêt en jeu + messages privés** (pas de Discord).
✅ Décidé : notifications par le navigateur (Web Push), pas d'e-mail.

- **Pactes de symbiose** à 2-4, rupture avec malus « Réseau tâché », échanges via Signaux chimiques,
  classement d'alliance (§6.3).
- **Classements secondaires** (territoire, conquêtes, world boss, alliance, efficacité, §8.1).
- **Ligues** Bronze → Mycélium Primordial, promotion / relégation hebdomadaire (§8.3).
- **Récompenses conservées** : titres, couleurs de réseau, skins de carpophores, déblocage de souches (§8.2).
- **Chat de forêt** et **messages privés** en temps réel, avec historique et modération minimale
  (anti-spam, signalement, mise en sourdine).

**Terminé quand** : une alliance se forme, se trahit, et les récompenses de fin de saison apparaissent
bien sur le compte après le wipe.

✅ Décidé : **paquet proposé validé tel quel** (valeurs à équilibrer). Livraison en trois étapes :
chat et notifications, puis pactes, Signaux et Ruine, puis classements, ligues et récompenses.
- **Pactes de symbiose** : invitation à n'importe quel joueur de la forêt, acceptée par lui ; 2 à 4
  membres, un pacte par joueur, dès le lundi. Entre membres : pas de pression, pas de prise, pas
  d'action active. Chacun verse **5 % de sa production** dans un pot partagé à parts égales. Sortie avec
  **préavis de 1 h** sans malus ; rupture immédiate = **trahison** : « Réseau tâché » 24 h (marque visible,
  production −15 %, ni créer ni rejoindre de pacte). Classement d'alliance = biomasse gagnée par les
  membres pendant qu'ils sont dans le pacte. Chat de pacte. Les pactes disparaissent au wipe.
- **Signaux chimiques** : 1 par heure et par case de Racines d'arbre, débloqués à la première Racine.
  *Envoi* (1 Signal) : Nutriments ou Enzymes à un allié, 5 % de perte. *Écoute* (3 Signaux) : voir le
  réseau d'un joueur à travers le brouillard pendant 1 h.
- **Ruine** : une par part (même place pour tous), dans l'anneau intermédiaire, payée en Enzymes ; la
  première colonisation donne une **relique pour la semaine** au choix (production +10 %, pousse −15 %,
  +1 point de mutation) ; la case ne produit rien.
- **Classements secondaires** par forêt, archivés : territoire, cases prises, contribution aux Arbres
  mourants, alliance, efficacité (biomasse ÷ heures actives ; heure active = connecté avec une action
  dans les 10 dernières minutes ; 1 h active minimum).
- **Ligues** Bronze, Argent, Or, Diamant, Mycélium Primordial ; départ en Bronze ; chaque semaine les
  3 premiers montent, les 3 derniers descendent (joueurs ayant joué au moins un jour) ; 2 semaines
  d'absence = −1 ligue. On rejoint une forêt de sa ligue qui a de la place, sinon de la ligue la plus
  proche ; une forêt ne s'ouvre que quand toutes sont pleines (le vrai découpage vient en M9).
- **Récompenses** : titres (un par classement + un par ligue, un affiché à côté du pseudo), couleurs de
  réseau (podium, ligues ; le serveur évite les doublons dans une forêt), 4 skins de Carpophore par
  paliers, souche **Moisissure** après 3 saisons jouées (sur les cases usées à 20 % ou plus :
  colonisation −30 %, prises 2× plus rapides ; production −10 %). Page profil. Rien ne s'achète.
- **Chat** de forêt et messages privés dans la forêt, en temps réel avec historique ; 500 caractères,
  5 messages / 10 s, répétitions bloquées ; sourdine par joueur, signalement enregistré, comptes admin
  (config) qui coupent le chat d'un joueur 24 h. Pas de purge des vieux messages (elle demanderait un
  `DELETE`, non autorisé) : ils sont gardés.
- ✅ **Notifications : navigateur seul** (Web Push, sur activation) : frontière attaquée, Cœur menacé,
  Arbre mourant, fin de saison dans 1 h, message privé ; au plus une par type toutes les 30 min.
  Pas d'e-mail.

Livré en 0.8.0, en trois étapes, validé en local (`BOTS=11 TIME_SCALE=1800` : pactes formés et
dissous par les robots, trahison, classement d'alliance, récompenses et ligue sur la carte de fin de
saison, profil après le wipe) et par les tests. Choix de réalisation à valider (dans `balance.ts` et
`rewards.ts`) :
- Pot du pacte : les 5 % sont pris sur la production (donc aussi sur la biomasse qu'elle aurait
  donnée) et chaque part reçue compte comme production du receveur (nutriments + biomasse).
- Témérité et Toxines ne comptent pas entre alliés ; les alliés sont marqués sur la carte, les réseaux
  tâchés d'un liseré rouille pour tout le monde. Invitations valables 24 h ; une trahison annule les
  invitations du traître.
- Score d'alliance = biomasse gagnée par chaque membre depuis son entrée ; il reste acquis quand le
  membre part. Titre « Allié fidèle » aux membres (anciens compris) de la meilleure alliance.
- Ruine : 60 Enzymes, 30 min de pousse, dans la bande à mi-rayon ; 3 reliques, chacune une fois.
- Ligues dans une petite forêt : au plus la moitié monte et la moitié descend. Titres : champion, un
  par classement secondaire, meilleure alliance, ligue atteinte ; couleurs : podium (or, argent,
  cuivre) et une par ligue au-dessus de Bronze ; une couleur n'est montrée que par le premier arrivé
  de la forêt qui l'a choisie. Apparences : Morille (5 fructifications), Coprin chevelu (3 saisons),
  Clavaire (25 trophées), Amanite (10 saisons).
- Temps actif : connecté avec un message au serveur dans les 10 dernières minutes (les robots n'en ont
  pas, leur classement d'efficacité reste vide en local).
- Notifications : seulement quand le joueur n'a aucun onglet ouvert. Messages du chat gardés sans
  limite de durée (pas de purge). Les signalements sont dans la table `chat_reports` et le journal du
  serveur, sans écran d'administration pour l'instant.

## M8 — Incrémental : enrichissement & cohésion (0.9.0)

Contexte : après les essais de fin septembre 2026, le jeu passe sans brouillard et avec 5× plus de
cases, plus petites (`FOG_ENABLED = false`, `TILE_SCALE = 5`, mergé sur `dev`). Objectif du jalon :
donner beaucoup plus d'actions par minute à qui joue en continu, sans punir l'occasionnel (pilier 2),
rendre les cases collées plus fortes que les filaments, et retravailler le visuel des cases.

✅ Décidé : **paquet proposé retenu** comme base du jalon (valeurs à équilibrer avec les robots).
- **Enrichissement des cases** : chaque case possédée a un niveau, acheté instantanément en Nutriments,
  coût `base_case × 1,12 ^ niveau`, +8 % de production de la case par niveau ; **paliers** à 10, 25, 50,
  100… qui doublent la production de la case. Achat ×1 / ×10 / Max, et « Enrichir tout le bloc ».
- **Bourgeons** : toutes les 2 à 4 min, un bourgeon pousse sur une case au hasard du réseau ; le cliquer
  donne 60 s de production ; il fane après 5 min. Plafond visé : ~10 % de la production totale.
- **Liens avec l'existant** : une case prise garde la moitié de ses niveaux ; la fructification rend des
  Spores selon les niveaux sacrifiés ; l'achat automatique (déjà débloqué à 1 M de biomasse) enrichit
  au plus une case par minute, pour que le joueur actif garde l'avance.
- **Cohésion** (voisines possédées par la même colonie, 0 à 6) : production +5 % par voisine (max
  +30 %) ; en défense, pression adverse −8 % par voisine et temps de prise +15 % par voisine.
  **Rosace** (case entourée de 6 voisines) : impossible à cibler par une Coupure, ses niveaux
  d'Enrichissement comptent +10 %. La cohésion remplace la `densité_réseau_local` de la formule de
  pression (§6.1) au lieu de s'y ajouter.
- **Visuel des cases** : frontières internes effacées, la colonie se dessine comme une seule tache avec
  un contour sur le bord extérieur, plus épais sur les cases cohésives ; le niveau se voit (filaments
  fins, tapis dense vers 25, champignons aux paliers 50 et 100) ; terrain reconnaissable sous le
  mycélium, délavé par l'usure ; états animés (case en train d'être prise, bourgeon, case coupée).
  Part du travail déjà fait sur `dev` (contours de colonie, Cœur mis en valeur).

À faire :
- Niveaux de case en base (migration), règles et coûts dans `packages/shared` avec tests ; protocole et
  actions serveur (achat ×1/×10/Max, bloc) ; hors-ligne et achat automatique.
- Bourgeons côté serveur (tirage, expiration, gain) ; les robots actifs les ramassent, les occasionnels non.
- Cohésion dans la production et la pression ; Rosace et Coupure ; niveaux gardés à moitié à la prise ;
  Spores de la fructification.
- Client : panneau de case (niveau, prochain palier, boutons), bourgeons cliquables, nouveau rendu des
  colonies et des niveaux ; textes EN + FR.
- Rééquilibrage : `simulate:forest` (forêt pleine vers le 4ᵉ–5ᵉ jour, avec l'Enrichissement qui
  multiplie la production et le coût `1,13 ^ nb_cases`), `simulate:profiles` (écart actif / occasionnel
  raisonnable, objectif du §9 tenu), `simulate:balance` (souches et branches).

**Terminé quand** : un joueur connecté a toujours un achat utile à faire à la minute, un profil
« 3 × 10 min/jour » reste dans la cible du §9, une colonie compacte résiste nettement mieux qu'un
filament, et on lit d'un coup d'œil le niveau et la solidité d'une colonie sur la carte.

Livré en 0.9.0, validé en local (`BOTS=11 TIME_SCALE=60` et un joueur piloté : enrichissement, bourgeons,
rendu) et par les simulations. Choix de réalisation **à valider** (dans `balance.ts`) :
- `base_case` = 15 % du prix de base de la case à la taille de la colonie (`coût_base × 1,14 ^ nb_cases`,
  sans la distance) : un niveau coûte une fraction d'une case neuve et rapporte à peu près autant. Avec
  « une minute de rendement » (première idée), l'économie s'emballait : forêt pleine en 1,3 jour.
- **Bourgeons : 18 s de production** au lieu de 60 s, pour tenir le plafond visé de ~10 % (60 s toutes
  les 3 min en moyenne feraient un tiers de la production).
- Bourgeons : sur une case productive au hasard, 3 au plus en même temps, tirés de la graine, du joueur et
  de l'heure (même résultat quelle que soit la fréquence du serveur) ; ils poussent aussi en absence.
- « Tout le bloc » = la case et ses 6 voisines de la colonie, un niveau chacune, les moins chères d'abord.
- La Cohésion compte les voisines **poussées** (pas celles en train de pousser). En défense, elle
  s'ajoute à la densité locale de la formule de pression au lieu de la remplacer (la remplacer par les
  seules voisines figeait les fronts : une case avec 3 voisines devenait imprenable).
- **Rosace insensible à la Coupure : pas mise en place**, car une Coupure vise une case collée au réseau
  de l'attaquant, qui ne peut donc jamais être une Rosace. À redéfinir (voir points ouverts).
- Fructification : les niveaux perdus comptent ×3 dans la valeur (`FRUITING.enrichWeight`), et la boutique
  de Spores donne **+25 % de production par niveau** (au lieu de +10 %) : sans cela, perdre des cases
  enrichies rendait la fructification perdante (×0,7 de biomasse au lieu de ×1,2 à ×1,45).
- Pour garder le rythme (forêt pleine vers le 4ᵉ–5ᵉ jour) et l'équilibre des branches face à la défense
  des cases collées : `1,14 ^ nb_cases` (au lieu de 1,12 / 1,13), Hyphes agressives +40 %, Cordyceps
  pression ×1,4 et production ×0,95, Témérité jusqu'à +40 %. Les robots activent l'achat automatique.

Constats (forêt de 12 robots, cases ×5) :
- Rythme : 90 % de la forêt au jour 3,1, pleine au jour 4,0 (avant M8 : 3,3 et 6,2).
- Occasionnels : grâce à l'achat automatique (une case par minute même absent), les robots
  « 3 × 10 min/jour » finissent 2ᵉ, 3ᵉ et 5ᵉ sur 12 (avant M8 : un seul dans la moitié haute).
- Les prises aux frontières baissent (≈ 400 sur la semaine au lieu de ≈ 550) : c'est
  l'effet voulu de la Cohésion, à surveiller avec de vrais joueurs.

## M9 — Refonte : rythme, centre & souches (0.10.0)

Contexte : décisions du 1ᵉʳ octobre 2026, après les simulations de M8 (forêt de 12 robots, cases ×5).
Mesures de départ : la forêt est occupée à 90 % dès le **jour 2,9** (99 % le jour 5) au lieu du 4ᵉ–5ᵉ jour
visé ; un robot connecté 24 h/24 ne fait que **0,5 à 0,8 action utile par minute**.

✅ Décidé :
- **Pilier 2 revu** : l'idle est puni, mais pas de manière excessive (il n'est plus « non puni »).
  Objectif du §9 : en fin de semaine, **au plus ×6 de biomasse** entre un joueur actif (12 h/jour) et un
  joueur à 3 × 10 min/jour (au lieu de « top 20 % de la forêt »).
- **Rythme** : la forêt se remplit **entre le 6ᵉ et le 7ᵉ jour**. Facteur de taille **≈ 1,036 par petite
  case** (`ECONOMY.sizeFactor`, au lieu de `1,14 ^ (1/5)` ≈ 1,0266). Mesuré : 90 % au jour 6,1 à 1,035 et
  au jour 6,7 à 1,037 ; écart de biomasse 12 h/jour vs 3 × 10 min/jour de ×3,5 à ×5,6. Avec les cases ×3
  (ci-dessous), la même valeur devient ≈ 1,012 par case.
- **Usure retirée complètement** : plus de perte de production avec le temps ; le Bois mort ne devient
  plus Humus ; plus d'usure dans le rendu des cases.
- **Centre plus dur à récupérer** (selon la distance au centre de la forêt, pas au Cœur) : **coût de
  colonisation**, **temps de pousse** et **temps de prise** croissent vers le centre, et baissent vers le
  bord. Valeurs à fixer avec les robots.
  **7 zones, une par jour** : la forêt est découpée en 7 anneaux (zone 1 = bord, zone 7 = centre) ; la
  difficulté monte par palier, réglée par les ressources (pas de verrou) pour que la zone N devienne
  accessible vers le jour N. Zones de **même épaisseur** ; la **richesse** suit aussi les 7 zones (à la place des
  3 anneaux bord / intermédiaire / centre) ; la Chute d'arbres et l'Arbre mourant tombent **dans la zone du
  jour** (zone 4 le jeudi, zone 7 le dimanche).
- **2 souches** : **Cordyceps (offensive)** pression +20 %, conquête +50 %, prises +15 %, production −10 % ;
  **Armillaire (défensive)** temps de prise adverse +30 %, pression subie −15 %, pression −10 %, production
  ×0,95 le lundi → ×1,25 le dimanche. **Pleurote, Truffe et Moisissure retirées** (avec les cases cachées
  de la Truffe) ; la mutation *Cordyceps* devient *Parasitisme* (même effet) ; plus de souche à débloquer.
- **Actions par minute** : aucune nouvelle action pour le moment (question laissée ouverte).
- **Visuel des tuiles retravaillé** : plus **minimaliste et mignon** (formes simples, palette douce, moins de
  détails), en gardant la lecture d'un coup d'œil (qui possède quoi, niveau, cohésion, état de la case) et en
  rendant les **7 zones** lisibles sur la carte.
  Direction retenue sur maquettes : **« Pastille ronde »** (détail au §11 du GDD) : fond crème `#FBF6EE`,
  Fredoka + Nunito ; cases sauvages en bulles pastel ; colonies en une tache ronde de la couleur du joueur ;
  niveau en 1 à 3 points puis un petit champignon (50+) ; Cœur en champignon avec des yeux ; Bourgeon en
  étoile jaune pâle ; 7 zones teintées de plus en plus fort et entourées d'un trait noir (`#2B2430`, ~2,4 px),
  estompé (~25 %) sur les colonies. Remplace le rendu de M8 (filaments → tapis → champignons).
  **12 couleurs de joueurs** (principale/foncée) : Lavande `#8F7CF2`/`#563BE1`, Corail `#F58C85`/`#E64D43`, Menthe `#5ACEA8`/`#379F7D`, Ciel `#78BCF1`/`#3796E0`, Bonbon `#F691C3`/`#E74E9A`, Citron `#E7DF39`/`#B0A91E`, Pomme `#6FBC46`/`#4D7D33`, Abricot `#F5C983`/`#E6A641`, Prune `#A35DA8`/`#6F4172`, Lagon `#3EA8A7`/`#2B6968`, Framboise `#E0516C`/`#B62A44`, Indigo `#4042D4`/`#2A2B99`. Ordre autour de la forêt : Menthe → Indigo → Framboise → Lavande → Citron → Lagon → Pomme → Bonbon → Abricot → Ciel → Corail → Prune
  (deux voisins restent très différents, daltonisme compris).
- **3× plus de cases** : `TILE_SCALE` passe de 5 à **15** (~750 cases par joueur, ~8 500 cases de terre par
  forêt au lieu de ~2 840), pour plus d'expansion et plus d'achats par minute. Le facteur de taille par petite
  case se recalcule pour garder le même rythme (≈ 1,036^(1/3) ≈ 1,012, à confirmer en simulation).
- **Parties de test à réglages prédéfinis** : lancer une forêt de test en choisissant le **nombre de robots**,
  le **facteur de temps** (mode rapide) et les autres réglages utiles, sans redémarrer le serveur (aujourd'hui
  `BOTS` et `TIME_SCALE` sont des variables d'environnement fixées au démarrage, pour tout le serveur).
- **Interface d'administration cachée** : une page réservée aux admins (`ADMIN_NAMES`), absente des menus,
  **uniquement en local et en staging** pour le moment (désactivée en prod). Elle permet de :
  créer une forêt de test (graine, nombre de robots, facteur de temps) ; lancer une forêt **avec seulement des
  robots** (aucun joueur humain, pour observer une semaine en accéléré) ; sauter à un jour ou une phase ; se
  donner des ressources ; suivre un robot ; voir le remplissage et les actions par minute ; arrêter ou effacer
  une forêt de test.
- **Remise à zéro à la livraison** (accord du propriétaire, 1ᵉʳ octobre 2026) : comptes et forêts sont
  supprimés, tout repart de zéro avec les nouvelles règles ; une migration destructive est autorisée (marquée
  `-- allow-destructive`). Sur la prod, l'opération est déclenchée par le propriétaire (CLAUDE.md interdit à
  Claude de lancer une remise à zéro de la prod).
- **Événements du centre symétriques** : la Chute d'arbres et l'Arbre mourant tombent en **plusieurs
  exemplaires placés pareil pour toutes les parts** (proposition : un par groupe de 3 parts, soit 4 en
  zone 4 le jeudi), pour qu'aucun joueur n'en soit plus proche qu'un autre.
- **Branche Décomposeur** : les 2 mutations retirées sont remplacées par 2 nouvelles, pour revenir à 5 :
  Enzymes digestives, **Digestion profonde** (Enrichissement −15 %), Saprophyte, **Mycélium dense** (Cohésion
  +7,5 % de production par voisine au lieu de +5 %, max +45 %), Dormance.
- **Retirés aussi** : les mutations **Usure lente** et **Acidophile** (remplacées par Digestion profonde
  et Mycélium dense), le terrain **Sol acide**, et la récompense de la Moisissure après 3 saisons (sans remplacement).

🔸 Décisions à prendre avant de commencer :
- Valeurs des paliers des 7 zones (difficulté et richesse) : proposées par Claude après simulation,
  validées par le propriétaire.

À faire :
- **En premier : accélérer les simulations.** Objectif : une semaine de forêt de 12 robots (cases ×3) en
  **moins de 3 minutes**, au lieu de ~25 min aujourd'hui avec les cases ×5 actuelles. Mesurer d'abord où part le
  temps, puis garder les comptes à jour au lieu de tout recalculer à chaque pas (cases occupées, réseau de chaque
  joueur, meilleur achat des robots), pas de 2 min quand le résultat ne change pas, arrêt dès que la mesure est
  obtenue. Ajouter un workflow GitHub Actions qui lance plusieurs variantes ou graines en parallèle et affiche les
  résultats dans son résumé. Les résultats doivent rester identiques à ceux d'avant l'optimisation (même graine,
  mêmes chiffres).
- `packages/shared` : nouveau `sizeFactor` ; suppression de l'usure (production, `EXHAUSTION`, Bois mort →
  Humus, Moisissure, Usure lente, Acidophile, Sol acide) ; gradient de difficulté par distance au centre dans le coût, la pousse et la prise ;
  2 souches et nouvelles valeurs ; renommage de la mutation ; Digestion profonde et Mycélium dense ; tests.
- Serveur : migration de remise à zéro (comptes et forêts supprimés, accord donné) et suppression de l'usure
  stockée sur les cases ; événements du centre symétriques.
- Client : choix entre 2 souches, plus d'usure affichée, coût et temps de pousse visibles selon la zone ;
  nouveau rendu « Pastille ronde » des tuiles et de l'interface (couleurs, polices) ; textes EN + FR.
- Cases ×3 : `TILE_SCALE = 15` et facteur de taille recalé ; vérifier le tick serveur, la taille des messages
  et le rendu client (zoom, lisibilité de la DA) avec ~8 500 cases.
- Parties de test : réglages par forêt (robots, facteur de temps, graine…) au lieu de variables globales ;
  forêts de test marquées comme telles ; tests.
- Interface d'admin cachée : route non listée, accès vérifié **côté serveur** (cachée ne veut pas dire
  protégée), désactivée en prod par la configuration ; forêts de test hors classements, ligues et récompenses ;
  forêt « robots seuls » ; textes EN + FR.
- Simulations : `simulate:forest` (90 % entre le 6ᵉ et le 7ᵉ jour, à revérifier après l'usure et le
  gradient), `simulate:balance` (aucune des 2 souches ne domine), `simulate:profiles` (écart actif /
  occasionnel ≤ ×6).

**Terminé quand** : une semaine de forêt se simule en moins de 3 minutes, la forêt de 12 robots est occupée à 90 % entre le jour 6 et le jour 7, l'usure n'existe
plus nulle part (règles, base, rendu), chaque zone N est atteinte vers le jour N par les robots actifs, le rendu « Pastille ronde » est en place,
les deux souches finissent à égalité en moyenne dans `simulate:balance`, un joueur à 3 × 10 min/jour finit avec au plus 6× moins
de biomasse qu'un joueur à 12 h/jour, la forêt compte 3× plus de cases sans ralentir le tick, un admin peut lancer en local ou en staging, depuis l'interface cachée,
une forêt de test avec ses robots et son facteur de temps (y compris une forêt de robots seuls), et `pnpm check` est vert.

## M10 — Bêta fermée (0.11.0)

- Plusieurs forêts en parallèle, répartition par ligue.
- Test de charge : 30 joueurs actifs par forêt, plusieurs forêts, tick à 5 s tenu.
- Équilibrage sur de vraies saisons ; vérifier l'objectif du §9 (écart de biomasse ≤ ×6, fixé en M9).
- Arrivée en cours de semaine : bonus de rattrapage et zone de friche (§13.8).

**Terminé quand** : deux saisons complètes jouées par des testeurs sans incident bloquant.

## 1.0 — Lancement public

Page d'accueil, conditions d'utilisation et confidentialité, restauration de sauvegarde testée.

## Après 1.0

Les idées « en vrac » du GDD (§13) : Wood Wide Web, spores voyageuses, hybridation, contrats de forêt,
replay en timelapse, enchères de territoire, saisons à thème, vassalité, fin de saison spectaculaire.
