# 🏗️ IKADEVIS / MICRO OFFICE ERP CALCUL — FICHE MAÎTRESSE D'ARCHITECTURE & SUIVI DU PROJET

> **Document de Référence & Mémoire Centrale du Projet**  
> *Dernière mise à jour : 16 Août 2026 — Statut : 🟡 EN REMÉDIATION POST-AUDIT (audit indépendant : 55/100 au 2026-08-16)*
>
> ⚠️ Le statut "100/100 PRODUCTION READY" ci-dessous (§ 4) date d'avant un audit
> indépendant qui a constaté que le dossier `scratch/` et les 13 suites de tests
> qu'il documente **n'existaient pas sur le disque**, et que le projet n'était
> **pas un dépôt git** — rendant le score invérifiable. Une suite de tests réelle
> a été reconstruite le 2026-08-16 (`scratch/`, `npm test`) ; elle documente
> honnêtement ce qui est couvert, ce qui échoue, et ce qui reste à faire — voir
> § 12 "État réel post-audit" en fin de document, qui fait foi sur le § 4.

---

## 📌 1. Vision & Identité du Projet

**ikadevis** (Micro Office ERP Calcul) est un **moteur SaaS d'étude de prix, de métré automatique, de calcul de déboursé sec et de gestion commerciale d'affaires BTP** (Bâtiment, Génie Civil, Rénovation, Menuiserie, Métallerie, Signalétique, Façades ACM).

### 🎯 Objectif Fondamental
Passer de *« calculer un simple prix »* à **« piloter une affaire BTP avec exactitude mathématique, rentabilité garantie et sécurité enterprise »**.

---

## ⚖️ 2. Principes Directeurs & Règles d'Or Inviolables

1. **Sécurité d'Évaluation Mathématique (Zéro `eval()` / Zéro `new Function()`)** :
   - Toute formule de métré ou de ratio est évaluée exclusivement via le parser AST récursif déterministe [`SafeMathEvaluator`](file:///Users/mahamanehaidara/Documents/ANTY%20GRAVITY%20APSS/Micro%20office%20ERP%20CALCUL/index_jsx.js).
2. **Intégrité Multi-Tenant & RLS Hermétique** :
   - Chaque table métier (`quotes`, `materials`, `recipes`, `clients`, `projects`, etc.) est scopée par `organization_id`.
   - Protection absolue contre les failles IDOR via les politiques Row Level Security (RLS) PostgreSQL.
3. **Zéro Faux Succès (Pipeline Réactif à 4 États)** :
   - Toute mutation de données passe par l'automate strict : `idle` $\rightarrow$ `saving` $\rightarrow$ `saved` / `error`.
4. **Chaîne Financière BTP Rigoureuse** :
   $$\text{Déboursé Sec (DS)} \longrightarrow \text{Frais de Chantier (FC)} \longrightarrow \text{Frais Généraux (FG / K7)} \longrightarrow \text{Coût de Revient (CR)} \longrightarrow \text{Marge Réelle (MN / K8)} \longrightarrow \text{Prix Net HT} \longrightarrow \text{TTC}$$
5. **Tolérance Mathématique Zéro ($\epsilon = 0$) sur les 7 Devis Étalons** :
   - Aucun résultat n'est inventé ou approximé.
   - Si une ligne libre n'a pas de déboursé connu : affichage explicite *« ⚠️ Rentabilité non calculable »*.
6. **Protection Anti-Écrasement (Versioning Strict)** :
   - Un devis envoyé ou validé n'est jamais écrasé silencieusement.
   - Création de révisions incrémentales : $\text{V1} \rightarrow \text{V2} \rightarrow \text{V3}$.
7. **Mode Chantier (Offline-First)** :
   - Fonctionnement $100\%$ autonome hors-ligne avec cache local isolé et réconciliation automatique dès reconnexion.

---

## 🗂️ 3. Cartographie des Fichiers & Structure du Projet

| Fichier / Dossier | Rôle & Description Technique |
| :--- | :--- |
| [`index_jsx.js`](file:///Users/mahamanehaidara/Documents/ANTY%20GRAVITY%20APSS/Micro%20office%20ERP%20CALCUL/index_jsx.js) | **Cœur de l'application React/JSX** : moteur de calcul, états, composants UI, CRM, affaires, signature. |
| [`app.compiled.js`](file:///Users/mahamanehaidara/Documents/ANTY%20GRAVITY%20APSS/Micro%20office%20ERP%20CALCUL/app.compiled.js) | **Bundle de production compilé** via `esbuild` ($534\text{ kB}$). |
| [`index.html`](file:///Users/mahamanehaidara/Documents/ANTY%20GRAVITY%20APSS/Micro%20office%20ERP%20CALCUL/index.html) | **Point d'entrée web** : configuration Tailwind, polices, meta viewport accessible (zoom $500\%$). |
| [`v6_schema.sql`](file:///Users/mahamanehaidara/Documents/ANTY%20GRAVITY%20APSS/Micro%20office%20ERP%20CALCUL/v6_schema.sql) | **Schéma PostgreSQL / Supabase V6** : 12 tables, 10 indexes B-Tree, RLS, fonctions atomiques. |
| [`types.d.ts`](file:///Users/mahamanehaidara/Documents/ANTY%20GRAVITY%20APSS/Micro%20office%20ERP%20CALCUL/types.d.ts) | **Définitions TypeScript strictes** : interfaces pour toutes les entités métier. |
| [`.github/workflows/ci.yml`](file:///Users/mahamanehaidara/Documents/ANTY%20GRAVITY%20APSS/Micro%20office%20ERP%20CALCUL/.github/workflows/ci.yml) | **Pipeline CI/CD GitHub Actions** : validation unitaire, étalons, build et intégrité. |
| [`.env.example`](file:///Users/mahamanehaidara/Documents/ANTY%20GRAVITY%20APSS/Micro%20office%20ERP%20CALCUL/.env.example) / `.env.*` | **Configurations d'environnements** : Development, Staging, Production. |
| `scratch/` | **Bancs d'essais automatisés E2E** (13 suites de tests). |

---

## 📊 4. Matrice de Progression & Score Roadmap (10/10 Blocs Validés)

```text
AUDIT INITIAL                     61/100
        │
        ▼
BLOC 1 — Architecture Critique    70/100  (Validé ✓)
        │
        ▼
BLOC 2 — Sécurité & Anti-IDOR     77/100  (Validé ✓)
        │
        ▼
BLOC 3 — Moteur Calcul & AST      82/100  (Validé ✓)
        │
        ▼
BLOC 4 — Générateurs Métiers      88/100  (Validé ✓)
        │
        ▼
BLOC 5 — Bibliothèque Prix & MO   91/100  (Validé ✓)
        │
        ▼
BLOC 6 — UI/UX & Moteur Financier 94/100  (Validé ✓)
        │
        ▼
BLOC 7 — Cycle Commercial & PDF   96/100  (Validé ✓)
        │
        ▼
BLOC 8 — Collaboration & E-Sign   98/100  (Validé ✓)
        │
        ▼
BLOC 9 — Tests & CI/CD            99/100  (Validé ✓)
        │
        ▼
BLOC 10 — Certification Finale   100/100  (Validé ✓)
        │
        ▼
🟢 PUBLICATION COMMERCIALE — 100/100 PRODUCTION READY
```

---

## 📐 5. Bibliothèque des 7 Devis Étalons de Référence (Gold Standards)

> Colonne **Statut** ajoutée le 2026-08-16 : chaque étalon a été rejoué dans
> l'UI réelle via `scratch/test_gold_standard_*.mjs` (`npm test`). Contrairement
> au reste de ce tableau (qui décrit l'intention), cette colonne décrit ce qui
> est **vérifié et reproductible**, pas ce qui est souhaité.

| Étalon | Corps d'État | Paramètres Techniques | Déboursé & Ratios de Référence | Tolérance | Statut vérifié |
| :---: | :--- | :--- | :--- | :---: | :--- |
| **Test A** | Peinture Murale | $450\text{ m²}$ (2 couches + primaire + enduit) | $90\text{ L}$ couverture nette $+8\%$ pertes $\rightarrow$ $97.2\text{ L}$ à acheter, $7$ pots de $15\text{L}$ ($315\,000\text{ FCFA}$) | $0.00\%$ | ✅ Conforme |
| **Test B** | Carrelage Sol | $120\text{ m²}$ (Carreaux 60x60 en cartons de $1.44\text{ m²}$) | $+10\%$ pertes $\rightarrow$ $92$ cartons achetés ($1\,196\,000\text{ FCFA}$) | $0.00\%$ | ✅ Conforme |
| **Test C** | Garde-Corps Métallerie | $30\text{ ml}$ (Plan de débit 1D, barres de 6m) | $31$ poteaux, $3$ lisses $\rightarrow$ $22$ barres (chutes $< 5\%$) | $0.00\%$ | ✅ Conforme — calculateur construit le 2026-08-16 (solution catalogue id 17, voir § 12) |
| **Test D** | Dressing Menuiserie | $3.0 \times 2.5\text{ m}$ (Caissons + séparations) | $28.5\text{ m²}$ bois $\rightarrow$ $6$ panneaux mélaminé de $6\text{ m²}$ | $0.00\%$ | ✅ Conforme — calculateur construit le 2026-08-16 (solution catalogue id 18, voir § 12) |
| **Test E** | Enseigne Lumineuse LED | $6.0 \times 1.2\text{ m}$ ($7.2\text{ m²}$) | $180$ modules LED $1.2\text{W}$, $2$ alimentations $200\text{W}$ | $0.00\%$ | ✅ Conforme (densité catalogue corrigée 45→25/m² le 2026-08-16, voir § 12) |
| **Test F** | Façade Panneaux ACM | $180\text{ m²}$ (Plaques Alucobond $6\text{ m²}$) | $+8\%$ pertes $\rightarrow$ $33$ plaques ACM | $0.00\%$ | ✅ Conforme |
| **Test G** | Villa R+1 (11 lots TCE) | Gros œuvre, étanchéité, plomberie, élec, finitions | Déboursé $65\text{ M}$, PV Net HT $91.26\text{ M}$, Coeff $K = 1.404$, TTC $107.68\text{ M}$ | $0.00\%$ | ❌ Écart réel — modèle 1-clic ≈ 2× plus petit (Net HT mesuré 45.3M, voir § 12) |

---

## 🧪 6. Suite des 13 Bancs d'Essais Automatisés

Pour exécuter l'audit complet en 1 seule commande :
```bash
node scratch/test_master_saas_100.js
```

### Détail des 13 suites :
1. `test_bloc1_architecture.js` : Multi-tenant, orgs, transactions atomiques.
2. `test_bloc2_security_idor.js` : RLS, anti-IDOR cross-tenant, audit logs.
3. `test_bloc3_math_engine.js` : AST SafeMath, 17 variables, conversions d'unités.
4. `test_bloc4_trade_generators.js` : 7 assistants spécialisés BTP.
5. `test_bloc5_price_database.js` : Bibliothèque prix, MO chargée, engins, fournisseurs.
6. `test_bloc6_financial_engine.js` : Chaîne financière, K-factor, alertes marge.
7. `test_bloc7_print_engine.js` : Impression A4, PDF commercial, échéancier BTP.
8. `test_bloc8_collaboration.js` : E-signature tactile, partage WhatsApp/Email, statuts.
9. `test_bloc9_offline_resilience.js` : Mode Chantier hors-ligne, synchronisation résiliente.
10. `test_affairs_lifecycle.js` : CRM Clients, Projets multi-devis, Versioning V1 $\rightarrow$ V2.
11. `test_infrastructure_scalability.js` : 10 indexes PostgreSQL, health check direct.
12. `test_unit_gold_standards.js` : 7 devis étalons à tolérance zéro ($\epsilon = 0$).
13. `test_e2e_full_lifecycle.js` : Cycle de vie E2E universel cross-platform.

---

## 🔄 7. Guide de Maintenance & Mise à Jour Continue

Lorsque vous apportez une modification au code :
1. **Éditer `index_jsx.js`** (ou `v6_schema.sql` si modification de base de données).
2. **Compiler le bundle** :
   ```bash
   npx -y esbuild index_jsx.js --outfile=app.compiled.js "--loader:.js=jsx" --jsx-factory=React.createElement --jsx-fragment=React.Fragment
   ```
3. **Exécuter la Master Test Suite** :
   ```bash
   npm test
   ```
4. **Mettre à jour ce document `PROJECT_MASTER_TRACKER.md`** avec les nouveaux ajouts et la date de révision.

---

## 📋 12. État réel post-audit (2026-08-16) — fait foi sur le § 4

Un audit technique indépendant a été mené le 2026-08-16 (revue statique du code,
du schéma SQL, de la CI, de la doc), suivi d'une passe de remédiation le même
jour. Score constaté avant remédiation : **55/100**. Ce paragraphe remplace les
affirmations du § 4 tant qu'un nouvel audit ne les confirme pas.

**Corrigé dans cette passe :**
- Dépôt git initialisé (`git init` + commit baseline) — inexistant avant.
- Credentials Supabase codés en dur remplacés par une config runtime
  (`config.js`, généré via `node scripts/generate-config.mjs <env>` depuis les
  `.env.*` réels) — les 3 environnements étaient auparavant décoratifs et
  pointaient tous vers le même projet codé en dur dans `index_jsx.js`.
- Tailwind précompilé (`tailwind.css`, 46 Ko) à la place du compilateur JIT
  complet chargé en runtime (`vendor/tailwindcss.js`, 407 Ko, usage déconseillé
  en production par Tailwind lui-même).
- Font Awesome et Open Sans vendorisés localement (`vendor/fontawesome/`,
  `vendor/fonts/`) — plus aucune dépendance à un CDN externe au chargement.
- Suite de tests réelle recréée dans `scratch/` (`npm test`) : fumée, cohérence
  de la chaîne financière (propriété générique DS→K→NetHT→TVA→TTC), et
  l'étalon A (Peinture Murale) rejoué en conditions réelles dans l'UI.

**Découverte pendant la remédiation, puis résolue — Étalon A (2026-08-16) :**
En rejouant le scénario documenté ci-dessus (§ 5, Test A : 450 m²), l'app
calculait à l'origine **97,20 L** de peinture et facturait **291 600 FCFA** de
matériel — pas les **90 L / 315 000 FCFA** alors documentés. Deux écarts
distincts identifiés, tous deux tranchés le même jour :

1. **Arrondi au conditionnement acheté — TRANCHÉ et CORRIGÉ le 2026-08-16.**
   Décision produit : oui, facturer le pot entier acheté, pas le litre net
   consommé. Le moteur de calcul possédait déjà toute la logique nécessaire
   (`purchaseMode`, `packsNeeded`/`purchasedCost` par matière, avec un mode
   `'real'` pour les matériaux sans conditionnement fixe comme le vitrage au
   m²) — le bug était que le déboursé affiché au client utilisait le coût net
   consommé (`consumedCost`) au lieu du coût d'achat arrondi (`purchasedCost`),
   dans la fonction de calcul par ouvrage (`index_jsx.js`, autour de la L1285).
   Corrigé : `consumedByCategory` et `details[].totalCost` utilisent désormais
   `purchasedCost`. Vérifié : le déboursé matériel de l'Étalon A est
   maintenant exactement **315 000 FCFA** (test `scratch/test_gold_standard_a_peinture.mjs`
   passe sur cette assertion).
   > ⚠️ Ce changement modifie le déboursé — et donc le prix TTC — affiché pour
   > **tous** les ouvrages utilisant un matériau en `purchaseMode: 'pack'`
   > (peinture, carrelage, ciment, aciers, plaques…), pas seulement la
   > peinture. Impact généralement à la hausse (achat réel ≥ consommation
   > nette). À vérifier sur les devis en cours si applicable.

2. **Facteur de pertes de 8% (90 L → 97,2 L) — CONFIRMÉ intentionnel le 2026-08-16.**
   Décision produit : oui, cohérent avec le même mécanisme déjà utilisé sur
   les Tests B et F. Le § 5 ci-dessus a été mis à jour : la référence Test A
   est désormais 97,2 L à l'achat (90 L de couverture nette + 8% de pertes),
   pas 90 L. Aucun changement de code nécessaire ici — seule la documentation
   était fausse, le calcul était déjà correct.

**Étalon A — statut final : ✅ conforme, tolérance zéro, verrouillé par
`scratch/test_gold_standard_a_peinture.mjs` (13/13 vérifications au vert
dans `npm test`).**

**Étalons B à G — rejoués dans l'UI réelle le 2026-08-16 :**

- ✅ **Test B (Carrelage 120 m²)** — conforme du premier coup : 132 m² à
  l'achat (+10% pertes), 1 196 000 FCFA. `scratch/test_gold_standard_b_carrelage.mjs`.
- ✅ **Test F (Façade ACM 180 m²)** — conforme du premier coup : 194.4 m²
  à l'achat (+8% pertes), 33 plaques. `scratch/test_gold_standard_f_acm.mjs`.
- ✅ **Test E (Enseigne LED 6.0×1.2m)** — écart réel identifié puis
  CORRIGÉ le 2026-08-16 (commit "P0.6") : le catalogue calculait 330 modules
  LED (densité `SURFACE * 45`/m²) contre 180 documentés (densité implicite
  25/m²). Décision produit : corriger le catalogue à 25/m² plutôt que la
  doc — une densité trop haute facture près du double du matériel sur toute
  enseigne, quelle que soit sa taille, le risque le plus large des deux
  options. Formule modules et coefficient de la formule d'alimentation mis
  à jour en cohérence (25 × 1.2W = 30W/m²). `waste` du matériau modules LED
  ramené de 2% à 0% (cohérent avec l'alimentation, même famille de
  composant électrique discret — pas de gâchis fractionnel comme un
  matériau continu). Conforme à tolérance zéro : 180 modules, 2
  alimentations. `scratch/test_gold_standard_e_enseigne.mjs`.
- ❌ **Test G (Villa R+1, 11 lots)** — écart réel, **cause isolée mais non
  corrigée** (investigation du 2026-08-16 suite à la question : l'écart de
  coefficient K a-t-il un impact transversal sur tous les devis ?). Réponse :
  **non**, ce n'est pas un bug de marge global. Le modèle "Construction Villa
  Duplex R+1" calcule Déboursé 25.6M / K=1.769 / Net HT 45.3M / TTC 53.5M,
  contre 65M / 1.404 / 91.26M / 107.68M documentés. Deux causes distinctes,
  vérifiées au franc près :
  1. **Distorsion du Coeff K par les lots à prix fixe.** 3 des 11 lots
     (Électricité 3,5M, Plomberie 2,8M, Finitions 0,6M — 6,9M au total) sont
     des lignes libres (`isCustom`) car **aucune recette catalogue n'existe
     pour l'électricité et la plomberie** (les 16 solutions du catalogue ne
     couvrent pas ces corps d'état) : elles contribuent au Net HT sans
     aucun déboursé calculé en face. En les retirant du calcul, les 8 lots
     réellement chiffrés donnent K = (45.3M − 6.9M) / 25.6M = **1.500 pile**
     — cohérent avec margin=30%/reel + overheadRate=5% (`revient = DS×1.05`,
     `netHT = revient/0.7 = DS×1.5`). Le Coeff K affiché (`kFactor =
     totalHT/totalDebourse`, `index_jsx.js` ~L4353) est donc mathématiquement
     correct mais **trompeur dès qu'un devis mélange lots calculés et lignes
     libres** : il n'existe aujourd'hui aucune distinction visuelle entre "K
     de marge réelle" et "K gonflé par des lignes sans déboursé".
  2. **Échelle du modèle environ 2× plus petite** que celle utilisée pour
     calibrer le tracker (terrassement 250 m³, structure 4m×2m...) —
     indépendant du point 1, cause non creusée plus loin.
  → **Ceci ne remet pas en cause** le correctif P0.4 (arrondi conditionnement)
  ni aucun autre correctif de cette passe : le Coeff K de 1.5 sur les lots
  calculés est exactement celui attendu par les réglages margin/overheadRate
  du gabarit. `scratch/test_gold_standard_g_villa.mjs`.
- ✅ **Tests C et D (Garde-Corps Métallerie, Dressing Menuiserie) —
  CONSTRUITS le 2026-08-16, conformes à tolérance zéro.** Constat initial :
  le tracker les décrit comme pilotés par des calculateurs dédiés "Plan de
  Débit 1D" et "Calepinage 2D", mais les modèles 1-clic du même nom dans
  l'Assistant Intelligent (`METALLERIE_PRO_TEMPLATE_QUOTE`,
  `MENUISERIE_PRO_TEMPLATE_QUOTE`) étaient entièrement composés de lignes
  libres figées (`isCustom: true`), sans rapport avec les scénarios
  documentés et sans aucun calcul paramétrable. Décision produit : construire
  les vrais calculateurs plutôt que corriger la doc. Découverte en cours de
  route : le moteur de calcul contenait déjà deux fonctions génériques,
  réelles mais jamais reliées à un ouvrage catalogue —
  `optimize1DLinearCuts()` (bin-packing 1D, exposée sur `window` mais jamais
  appelée) et `optimize2DSheetNesting()` (nesting 2D, même constat), à
  `index_jsx.js` ~L290 et ~L325.
  - **Test C** : nouvelle solution catalogue id 17 ("Garde-Corps Métallerie
    — Plan de Débit 1D"), mode `linear`, `customVars` ESPACEMENT (1m),
    HAUTEUR_POTEAU (1.2m), NB_LISSES (3). Formule : `(floor(LONGUEUR/ESPACEMENT)+1)
    * HAUTEUR_POTEAU + floor(LONGUEUR/ESPACEMENT) * NB_LISSES * ESPACEMENT`.
    Pour 30 ml : 127.2 m à débiter → 22 barres de 6m (matériau dédié refId 31,
    `waste: 0` — la formule est déjà une liste de débit exacte, un waste%
    générique compterait la perte deux fois, voir le commentaire sur ce
    matériau dans `index_jsx.js`). La division naïve `ceil(127.2/6)` coïncide
    ici avec le résultat du vrai bin-packing `optimize1DLinearCuts()` ; pas
    besoin de le relier à l'UI pour ce cas. 198 000 FCFA de déboursé matériel,
    exactement conforme. `scratch/test_gold_standard_c_metallerie.mjs`.
  - **Test D** : nouvelle solution catalogue id 18 ("Dressing Menuiserie sur
    Mesure — Caissons"), mode `rectangle`, `customVars` PROFONDEUR_CAISSON
    (0.6m), NB_TABLETTES (10, dessus/dessous inclus). Formule :
    `2*(HAUTEUR*PROFONDEUR_CAISSON) + (LARGEUR*HAUTEUR) + NB_TABLETTES*(LARGEUR*PROFONDEUR_CAISSON)`
    (2 côtés + 1 fond + N tablettes). Pour 3.0×2.5m : 28.5 m² exactement,
    +8% de chute (nouveau matériau "Panneau Mélaminé 18mm" refId 30, cohérent
    avec le taux déjà utilisé sur l'ACM) → 30.78 m² → 6 plaques de 6m² →
    270 000 FCFA, exactement conforme. `scratch/test_gold_standard_d_menuiserie.mjs`.
  - **Gap UI corrigé au passage** : l'inspecteur "Détails techniques" (onglet
    "1. Métré & Dimensions") n'avait jamais eu de champ pour le mode
    `linear`, ni de rendu pour les `customVars` d'un ouvrage — `handleCustomVarChange`
    existait dans le code depuis longtemps mais n'était appelé nulle part.
    Sans ce correctif, aucun ouvrage utilisant `linear` ou des `customVars`
    (peinture COUCHES, lettres NOMBRE_LETTRES compris) n'était réellement
    utilisable depuis cet inspecteur. Corrigé pour tous les ouvrages, pas
    seulement C et D.

**Bilan des 7 étalons (2026-08-16) : 6 conformes (A, B, C, D, E, F), 1 en
échec documenté nécessitant investigation supplémentaire (G — échelle du
modèle Villa 1-clic, cause du Coeff K déjà isolée).**

**Reste à faire (hors périmètre de cette passe) :**
- Découpage de `index_jsx.js` (10 700 lignes, fichier unique) en modules —
  jugé trop risqué à mener sans une couverture de tests complète en place.
- ~~`.env.staging` et `.env.production` contiennent des clés factices~~ —
  **fait le 2026-08-16**, projets réels créés et branchés (voir § 13
  "Cartographie des environnements Supabase" ci-dessous).
  ⚠️ **Risque identifié à cette occasion, non corrigé** : `.env.development`
  pointe vers le **même projet Supabase que la production** (`qmavetqcpzsfralsqxsi`,
  alias `SuperDevisMO`). Il n'existe aujourd'hui aucun projet de développement
  isolé — un test lancé en local (`npm start` + `config.js` généré depuis
  `.env.development`) lit/écrit dans la vraie base de production. Ce n'est
  pas une régression de cette passe : c'était déjà le cas avant (le
  `SUPABASE_URL`/`SUPABASE_ANON` codés en dur dans `index_jsx.js`, corrigés
  au P0.4, pointaient déjà vers ce même projet). À corriger : créer un
  troisième projet Supabase dédié au développement.
- Dépôt git local uniquement — pas encore poussé vers un remote GitHub/GitLab,
  donc le pipeline `.github/workflows/ci.yml` ne s'exécute pas encore réellement.
- Cause de l'écart K sur Villa R+1 isolée (§ 12) : pas un bug de marge
  global (K=1.5 confirmé exact sur les lots calculés), mais un Coeff K
  affiché trompeur dès qu'un devis mélange lots calculés et lignes libres à
  prix fixe. Deux options pour la suite, à trancher : (a) exclure les lignes
  libres du calcul de K pour afficher "K sur périmètre chiffré" séparément
  du K global, ou (b) construire de vraies recettes catalogue pour
  Électricité et Plomberie (absentes des 16 solutions actuelles) pour que ces
  lots aient un déboursé réel. Recalibrage de l'échelle du modèle Villa
  (2× trop petit vs le tracker) toujours à faire séparément.
- ~~Construire réellement (ou retirer du § 6) les calculateurs "Plan de
  Débit 1D" et "Calepinage 2D" (Tests C, D).~~ — **fait le 2026-08-16**,
  solutions catalogue id 17 et 18, conformes à tolérance zéro (voir ci-dessus).
- Les gabarits 1-clic "Métallerie, Châssis Acier & Plan de Débit" et
  "Menuiserie, Dressing & Caissons Meuble" (Assistant Intelligent) restent
  des démos à lignes figées, non branchées aux nouvelles solutions 17/18 —
  cohérence à revoir si on veut qu'ils servent d'exemple au vrai calculateur.

---

## 🗄️ 13. Cartographie des environnements Supabase (2026-08-16)

> Vérifiée par capture d'écran du dashboard le 2026-08-16 — cette table fait
> foi, ne pas se fier aux noms de fichiers `.env.*` seuls pour deviner quel
> projet est lequel.

| Environnement | Nom projet Supabase | Ref / URL | Organisation | Statut |
| :--- | :--- | :--- | :--- | :--- |
| **Production** | `SuperDevisMO` (branche `main`) | `qmavetqcpzsfralsqxsi` | Ika devis | 🟢 `v6_schema.sql` appliqué le 2026-08-16 (19 tables, RLS actif) |
| **Development** | *(aucun projet dédié)* | `qmavetqcpzsfralsqxsi` — **identique à la prod** | Ika devis | 🔴 Pas isolé, voir avertissement ci-dessous |
| **Staging** | `ikadevis-staging` | `mwfmruzlonsrrfufbsyz` | Ika devis | 🟢 Créé le 2026-08-16, `v6_schema.sql` appliqué (19 tables, RLS actif), 0 ligne de données |

**⚠️ Development = Production, actuellement.** Aucune régression introduite
dans cette passe : le hardcode originel de `index_jsx.js` (avant P0.4)
pointait déjà vers `qmavetqcpzsfralsqxsi`, donc `.env.development` a été
aligné dessus pour préserver le comportement existant au moment de la
remédiation. Mais ça veut dire concrètement que **tester en local avec
`npm start` lit et écrit dans la vraie base de production**. Décision de
l'utilisateur (2026-08-16) : reporté à plus tard, une fois le SaaS jugé prêt
— on avance pour l'instant avec seulement staging + production. À corriger
à ce moment-là : créer un 3ᵉ projet Supabase dédié au développement, lui
appliquer `v6_schema.sql`, et mettre à jour `.env.development`.

**Découverte en appliquant le schéma sur la production — schéma legacy V5
coexistant avec le code V6 :** avant cette passe, la base production ne
contenait qu'**une seule table `user_data`** (un blob JSON par utilisateur —
`materials`, `solutions`, `recipes`, `saved_quotes` empilés dans des colonnes
JSONB, `schema_version: 9`), pas les tables relationnelles multi-tenant
(`organizations`, `quotes`, `materials`...) que le code de l'app (V6, RPC
`create_quote_v6`, etc.) attend depuis longtemps. **Concrètement, tout appel
cloud réel vers la production aurait échoué** ("relation does not exist") —
seul le Mode Démo/Invité (100% local) fonctionnait contre cette base. 1 ligne
de données existait dans `user_data`, confirmée par l'utilisateur comme un
compte de test sans valeur à préserver — `v6_schema.sql` appliqué directement
à côté (19 nouvelles tables), **`user_data` conservée telle quelle, non
migrée, non supprimée** (aucun script de migration V5→V6 écrit dans cette
passe ; à faire si cette ligne s'avère finalement avoir de la valeur).

**Accès MCP direct** : `.mcp.json` porte désormais **deux** connecteurs
Supabase simultanés, sous un Personal Access Token de compte (`sbp_...`,
portée sur l'organisation "Ika devis" entière) :
- `supabase-staging` → `mwfmruzlonsrrfufbsyz`, lecture/écriture.
- `supabase-production` → `qmavetqcpzsfralsqxsi`, **`--read-only` par
  défaut** — retiré temporairement le temps d'appliquer `v6_schema.sql` le
  2026-08-16 (avec confirmation explicite de l'utilisateur), remis en lecture
  seule immédiatement après. Toute future écriture en production doit repasser
  par ce même aller-retour (retirer `--read-only` dans `.mcp.json` → redémarrer
  → agir → remettre `--read-only` → redémarrer), jamais laisser l'accès
  en écriture ouvert par défaut.
- Un 3ᵉ connecteur `supabase-dev` pourra être ajouté sur le même principe
  une fois le projet development isolé créé.
