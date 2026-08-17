# 🏗️ IKADEVIS / MICRO OFFICE ERP CALCUL — FICHE MAÎTRESSE D'ARCHITECTURE & SUIVI DU PROJET

> **Document de Référence & Mémoire Centrale du Projet**  
> *Dernière mise à jour : 17 Août 2026 — Statut : 🟡 PUBLIABLE AVEC RÉSERVES (audit indépendant du 2026-08-17 : 71/100, voir § 17)*
>
> ⚠️ Le statut "100/100 PRODUCTION READY" du § 4 est **obsolète et invérifié**
> (auto-évaluation d'avant l'audit indépendant du 2026-08-16, qui a trouvé un
> dossier de tests inexistant et aucun dépôt git). Les § 12, § 13 et surtout
> § 16/§ 17 (2026-08-17) font foi sur le § 4.
>
> **Repère rapide pour reprendre en nouvelle discussion — état à la fin de
> cette session (2026-08-17) :**
> - Dépôt git initialisé, **travail de cette session pas encore committé** au
>   moment de la rédaction — voir § 17 pour l'état exact avant/après commit.
> - Suite de tests réelle et honnête dans `scratch/` (`npm test`) : **40/40
>   vérifications au vert**, 0 régression inattendue après tous les correctifs
>   ci-dessous.
> - **7/7 étalons métier conformes à tolérance zéro** (A, B, C, D, E, F, G) —
>   dont C et D, des calculateurs réels construits le 2026-08-16 (Plan de
>   Débit 1D métallerie, Calepinage 2D menuiserie) ; et G (Villa R+1),
>   recalibré à l'échelle et reconnecté à de vraies recettes catalogue
>   Élec/Plomberie (§ 14).
> - **`index_jsx.js` partiellement découpé** (§ 15, 2026-08-17) : moteur de
>   calcul, utilitaires et gabarits de devis extraits vers `js/*.js` (~2100
>   lignes) ; le composant `App()` et le catalogue qui y est imbriqué restent
>   en un seul fichier — étape 1 volontairement limitée, voir § 15.
> - **Deux vraies découvertes "Zéro Faux Succès" corrigées** (§ 16,
>   2026-08-17) : `PriceHistoryModal` et `AuditLogViewerModal` affichaient des
>   données inventées. Corrigé + RLS ajoutée sur `material_price_history`.
> - **Bug critique du chemin cloud trouvé et corrigé** (§ 16, 2026-08-17) :
>   matières/MO/recettes/entreprise/chargement initial pointaient encore vers
>   le blob `user_data` (V5) **supprimé de la production** — tout compte
>   cloud réel tombait sur un écran d'erreur recommandant de recréer le
>   schéma legacy. Migré vers les vraies tables V6. `savedQuotes`/
>   `nextQuoteSeq` restent sur l'ancien chemin, hors périmètre, documenté.
> - **3 environnements Supabase cartographiés** (§ 13) : `staging`
>   (`ikadevis-staging`) et `production` (`SuperDevisMO`) ont chacun le schéma
>   V6 appliqué (19 tables, RLS actif) et sont accessibles en direct via MCP
>   (`supabase-staging` en écriture, `supabase-production` en lecture seule
>   par défaut). **`development` n'est PAS isolé — pointe vers la même base
>   que la production**, décision explicite de l'utilisateur de reporter la
>   création d'un 3ᵉ projet dédié à après que le SaaS soit jugé prêt.
> - Prochaines pistes ouvertes : isoler `development`, pousser le dépôt vers
>   un remote, migrer `savedQuotes`/`nextQuoteSeq` vers la vraie table
>   `quotes` (§ 16), appliquer la migration RLS `material_price_history` sur
>   production (SQL fourni, § 16), poursuivre le découpage de `index_jsx.js`.

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
| [`index_jsx.js`](file:///Users/mahamanehaidara/Documents/ANTY%20GRAVITY%20APSS/Micro%20office%20ERP%20CALCUL/index_jsx.js) | **Cœur de l'application React/JSX** (~8800 lignes) : composant `App()`, catalogue par défaut imbriqué, composants UI, CRM, affaires, signature. Le moteur de calcul pur, les utilitaires et les gabarits de devis en ont été extraits le 2026-08-17 (§ 15) — voir `js/`. |
| `js/calc-engine.js`, `js/utils.js`, `js/quote-templates.js` | **Modules non-UI extraits le 2026-08-17** (§ 15) : parser AST (`SafeMathEvaluator`), moteur de calcul par ouvrage/devis, optimiseurs de découpe, `formatMoney`, gabarits 1-clic. Chargés en `<script>` classique avant `app.compiled.js` (pas de bundler, pas d'ES modules — cohérent avec `vendor/`). |
| [`app.compiled.js`](file:///Users/mahamanehaidara/Documents/ANTY%20GRAVITY%20APSS/Micro%20office%20ERP%20CALCUL/app.compiled.js) | **Bundle de production compilé** via `esbuild` (transforme le JSX de `index_jsx.js` uniquement — ne bundle pas `js/*.js`, qui sont déjà du JS pur). |
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
| **Test G** | Villa R+1 (11 lots TCE) | Gros œuvre, étanchéité, plomberie, élec, finitions | Déboursé $59.81\text{ M}$, PV Net HT $90.31\text{ M}$, Coeff $K = 1.51$, TTC $106.56\text{ M}$ | $0.00\%$ | ✅ Conforme — échelle recalibrée + lots Élec/Plomberie reliés à de vraies recettes le 2026-08-16 (voir § 14) |

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
- ✅ **Test G (Villa R+1, 11 lots)** — écart réel identifié, **cause isolée
  puis corrigée le 2026-08-16** (voir § 14 pour le détail complet et les
  nouvelles valeurs de référence). Investigation initiale (suite à la
  question : l'écart de coefficient K a-t-il un impact transversal sur tous
  les devis ?). Réponse : **non**, ce n'est pas un bug de marge global. Le
  modèle "Construction Villa Duplex R+1" calculait Déboursé 25.6M / K=1.769 /
  Net HT 45.3M / TTC 53.5M, contre 65M / 1.404 / 91.26M / 107.68M documentés.
  Deux causes distinctes, vérifiées au franc près :
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

**Bilan des 7 étalons (2026-08-16, fin de session) : 7 conformes à tolérance
zéro (A, B, C, D, E, F, G) — voir § 14 pour le recalibrage de G.**

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
- ~~Cause de l'écart K sur Villa R+1 isolée (§ 12) : ... Recalibrage de
  l'échelle du modèle Villa (2× trop petit vs le tracker) toujours à faire
  séparément.~~ — **fait le 2026-08-16**, voir § 14. L'option (b) envisagée
  ici (construire de vraies recettes catalogue pour Électricité et
  Plomberie) s'est révélée déjà faite : les solutions 15/16 existaient dans
  le catalogue mais n'étaient simplement jamais reliées au modèle 1-clic.
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
| **Production** | `SuperDevisMO` (branche `main`) | `qmavetqcpzsfralsqxsi` | Ika devis | 🟢 `v6_schema.sql` appliqué le 2026-08-16 (19 tables, RLS actif), legacy `user_data` (V5) supprimée |
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
à côté (19 nouvelles tables). **`user_data` supprimée le 2026-08-16**
(`DROP TABLE public.user_data`, migration `drop_legacy_v5_user_data`),
après confirmation explicite de l'utilisateur que la ligne était un compte
de test sans valeur. Production ne porte plus aucune trace du schéma V5 —
uniquement les 19 tables V6.

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

---

## 🏘️ 14. Recalibrage de l'Étalon G — Villa R+1 (2026-08-16)

Suite du § 12 : l'écart Villa R+1 avait deux causes distinctes, l'une isolée
(distorsion du Coeff K) et l'autre non creusée (échelle ~2× trop petite).
Les deux ont été corrigées dans cette passe, avec un résultat important :
**les anciennes valeurs cibles du tracker (Déboursé 65M, K=1.404, Net HT
91.26M, TTC 107.68M) se sont révélées mathématiquement irréconciliables**
avec un modèle où tous les lots ont un déboursé réel calculé.

**Pourquoi K=1.404 était impossible à atteindre proprement.** Avec
`margin=30%/reel` et `overheadRate=5%` appliqués uniformément (les réglages
du gabarit R1), la chaîne financière donne `netHT = débourse × 1.05 / 0.7 =
débourse × 1.5` pour toute ligne dont le déboursé est réellement calculé. Le
Coeff K global (`totalHT / totalDebourse`) ne peut descendre sous 1.5 que si
des lignes contribuent au Net HT **sans** déboursé en face — exactement le
défaut que le § 12 avait identifié (3 lots `isCustom` à prix fixe). Un K
cible de 1.404 ne peut donc être atteint qu'en conservant ce défaut, ce qui
aurait été corriger le symptôme en gardant la cause. Les anciennes valeurs
du tracker n'ont par ailleurs jamais été validées contre le vrai moteur de
calcul (§ 4 était une auto-évaluation d'avant l'audit) — même la TVA ne s'y
retrouve pas exactement (107.68M ≠ 91.26M × 1.18 = 107 686 800). Décision :
comme pour l'Étalon A (arrondi conditionnement) et l'Étalon E (densité LED),
traiter les anciennes valeurs comme une cible aspirationnelle jamais vérifiée
plutôt que comme une vérité à reproduire coûte que coûte, et verrouiller à
la place sur les valeurs réellement mesurées par le moteur de calcul.

**Deux corrections apportées à `R1_TEMPLATE_QUOTE` (`index_jsx.js` ~L952) :**

1. **Lots Électricité et Plomberie reliés à de vraies recettes catalogue.**
   Le § 12 affirmait qu'aucune recette catalogue n'existait pour ces corps
   d'état — **c'était faux** : les solutions 15 (« Installation Électrique
   Basse Tension & Tableaux ») et 16 (« Réseau Plomberie Sanitaire
   Multicouche & Évacuations PVC ») existaient déjà dans le catalogue avec
   de vraies recettes matériaux + main d'œuvre (`index_jsx.js` ~L6671-6679),
   simplement jamais reliées au modèle 1-clic, qui utilisait des lignes
   `isCustom` à prix fixe (3 500 000 FCFA élec, 2 800 000 FCFA plomberie,
   sans aucun coût calculé en face — la cause directe de la distorsion du
   Coeff K). Lot 7 (item_7_1) et lot 8 (item_8_1) utilisent désormais
   `solutionId: 15`/`16` en mode `unit` (90 points électriques, 10 points
   sanitaires — cohérent avec l'échelle recalibrée ci-dessous) au lieu de
   `isCustom: true`.
2. **Échelle doublée sur les lots dimensionnants.** Terrassement (250→500
   m³), fondations (36→72 m³), structure RDC (28→56 m³), plancher haut
   (24→48 m³ / 320 m² de surface), maçonnerie (320→640 m²), baies vitrées
   (6→12 ensembles), carrelage (220→440 m²), peinture (650→1300 m²) — chaque
   volume/surface doublé en agrandissant l'emprise au sol (largeur/longueur),
   jamais l'épaisseur (dosages béton, dalle 0.15-0.20m restent des constantes
   physiques). Le panneau de chantier (lot 1, 4×2m) et le nettoyage de fin de
   chantier (lot 11, forfait) sont restés inchangés — ce ne sont pas des
   grandeurs d'échelle de la villa.

**Résultat mesuré (`scratch/test_gold_standard_g_villa.mjs`, tolérance
zéro, verrouillé sur ces valeurs) :** Déboursé Sec **59 805 084 FCFA**,
Coeff K **1.51**, Total Net HT **90 307 626 FCFA**, Total TTC
**106 562 999 FCFA** — à moins de 2% des anciennes valeurs cibles sur les
montants, et un K structurellement cohérent (≈1.5, l'écart à 1.50 pile venant
des arrondis d'achat par conditionnement sur les lots matériaux) au lieu
d'être artificiellement gonflé par des lignes sans coût.

**Aucune régression** : `npm test` passe à **40/40** (contre 36/40 avant
cette passe), les Étalons A-F restent inchangés et conformes.

**Reste ouvert, non traité ici** : le Coeff K affiché reste un ratio global
sans distinction visuelle entre "K sur lots calculés" et "K gonflé par des
lignes sans déboursé" — non pertinent pour le gabarit R1 recalibré (tous ses
lots ont désormais un déboursé réel), mais toujours vrai pour n'importe quel
autre devis mélangeant lignes `isCustom` et lots calculés. Les gabarits
1-clic Métallerie et Menuiserie (§ 12, non branchés aux solutions 17/18)
restent également hors périmètre.

---

## 🧩 15. Découpage partiel de `index_jsx.js` en modules (2026-08-17)

`index_jsx.js` faisait 10 878 lignes en un seul fichier, avec la quasi-totalité
du catalogue par défaut et de la logique UI imbriqués dans un composant
`App()` de ~4700 lignes (données catalogue déclarées comme constantes
**locales** à l'intérieur du composant, pas au niveau module). Un découpage
complet en une passe aurait été trop risqué pour cette session — décision
utilisateur : ne traiter que l'**étape 1**, le pur non-UI déjà isolé au niveau
module (donc extractible sans toucher à `App()` ni au catalogue imbriqué).

**Extrait vers `js/calc-engine.js` (~1220 lignes)** : `SafeMathEvaluator`
(parser AST), `safeEvaluateMath`, `evaluateDynamicFormula`,
`calculateSingleWorkItem`, `calculateHybridQuote`,
`adaptHybridToSavedQuote`/`adaptSavedQuoteToHybrid`, `calculateQuickEstimate`,
`calculateAcmNesting(Optimal)`, `optimize1DLinearCuts`,
`optimize2DSheetNesting`, `migrateRecipes`, `BTP_UNIT_CATEGORIES`,
`getUnitCategory`, `convertUnit`, `generateNextQuoteNumber`,
`RESERVED_KEYWORDS`, `ALLOWED_VARS_BY_MODE`.

**Extrait vers `js/utils.js`** : `formatMoney`.

**Extrait vers `js/quote-templates.js` (~840 lignes)** : les 8 gabarits de
devis 1-clic (`R1_TEMPLATE_QUOTE`, `EVENT_TEMPLATE_QUOTE`,
`PAINTING_PRO_TEMPLATE_QUOTE`, etc.).

**Non touché, volontairement** : le composant `App()` (~4700 lignes),
tous les composants UI (`QuoteWorkspace`, `WorkItemInspector`, modals...), et
le catalogue par défaut (`initialSolutions`/`initialMaterials`/etc.) qui reste
déclaré en local à l'intérieur de `App()` — le lever au niveau module est le
prérequis du prochain découpage, non fait ici.

**Mécanique de chargement** : pas de bundler pour ces modules (esbuild ne
transforme que le JSX de `index_jsx.js`, sans `--bundle`) — `index.html`
charge `js/calc-engine.js`, `js/utils.js`, `js/quote-templates.js` en
`<script>` classiques, dans cet ordre, **avant** `app.compiled.js`, exactement
comme `vendor/react.production.min.js`. Tout reste en portée globale, aucun
`import`/`export` ES module introduit.

**Vérifié** : `npm test` → 40/40, aucune régression. Rejoué en direct dans le
navigateur (Villa R+1 1-clic) : mêmes montants exacts qu'en test.

---

## 🩹 16. Corrections "Zéro Faux Succès" & chemin cloud réel (2026-08-17)

Suite à un audit demandé par l'utilisateur (§ 17), deux catégories de
problèmes réels ont été trouvées et corrigées — pas seulement documentées.

### 16.1 — Deux violations de la Règle d'Or #3 (Zéro Faux Succès)

**`PriceHistoryModal`** (historique des prix matériaux) : composant jamais
rendu nulle part dans l'app (mort), qui affichait un `mockHistory` codé en
dur (3 lignes inventées) comme si c'était un vrai historique, et appelait une
fonction `formatCurrency` qui **n'existe nulle part ailleurs dans le code** —
preuve qu'il n'avait jamais été exécuté ni testé. La vraie table
`material_price_history` existait en base (schéma V6) mais RLS actif **sans
aucune policy** (donc totalement inaccessible), et rien ne l'alimentait.

Corrigé en construisant la vraie fonctionnalité plutôt qu'en la supprimant :
- Bouton "Historique" ajouté sur chaque matière (catalogue Ressources,
  vues mobile et desktop).
- `PriceHistoryModal` interroge désormais réellement
  `material_price_history` (org-scopée), avec un état vide honnête
  (« Aucun changement de prix enregistré ») en l'absence de données, et un
  message explicite (« disponible uniquement en mode connecté ») en mode
  Invité/local — jamais de données inventées.
- Écriture réelle : toute modification du prix d'achat d'une matière
  existante, en organisation cloud réelle, journalise une ligne dans
  `material_price_history` (`index_jsx.js`, handler `matForm`).
- RLS ajoutée (`v6_schema.sql` + migration) : SELECT et INSERT scopés par
  organisation, appliquées sur **staging**. **Sur production, migration
  fournie mais pas encore appliquée** — `apply_migration` n'est pas exposé
  tant que le connecteur `supabase-production` reste `--read-only` (choix
  délibéré, § 13), et retirer ce flag exige un redémarrage MCP que l'agent ne
  peut pas déclencher lui-même en cours de session. SQL à exécuter dans le
  SQL Editor du dashboard `SuperDevisMO` :
  ```sql
  DROP POLICY IF EXISTS "Material price history select" ON public.material_price_history;
  CREATE POLICY "Material price history select" ON public.material_price_history
      FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

  DROP POLICY IF EXISTS "Material price history insert" ON public.material_price_history;
  CREATE POLICY "Material price history insert" ON public.material_price_history
      FOR INSERT WITH CHECK (public.has_org_permission(organization_id, ARRAY['owner', 'admin', 'estimator']));
  ```

**`AuditLogViewerModal`** (journal de sécurité/traçabilité) : **celui-ci
était bien rendu et accessible dans l'UI** — plus grave que le précédent. En
l'absence de session cloud réelle, ou si la requête Supabase échouait ou
renvoyait 0 ligne, le composant substituait silencieusement 1 à 2 faux
événements d'audit (`officemicro89@gmail.com`, `quote_created`...) présentés
comme un vrai journal de traçabilité. Un état vide honnête existait déjà
dans le rendu (`filteredLogs.length === 0` → « Aucun événement de sécurité
enregistré ») mais n'était jamais atteint à cause du fallback. Corrigé :
suppression des deux blocs de fallback, `setLogs([])` à la place — l'état
vide honnête déjà présent s'en charge désormais réellement.

**Vérifié** : `npm test` → 40/40, aucune régression. `PriceHistoryModal`
rejoué en direct en mode Invité (état vide honnête affiché, aucune erreur
console).

### 16.2 — Chemin cloud réel cassé (découvert en traçant le code, pas juste "non vérifié")

En traçant le `useEffect` d'onboarding (« BLOC 1/10 »), découverte que
**tout ce qui n'est pas la création de devis passait encore par l'ancienne
table `user_data` (V5), supprimée de la production le 2026-08-16** (§ 12) :
- `bootstrap_user_organization` (création d'org) et `create_quote_v6`
  (sauvegarde de devis) utilisent bien les vraies tables V6 — corrects,
  non touchés.
- Mais le chargement initial et la sauvegarde de `companyInfo`, `materials`,
  `labor`, `solutions`, `recipes` faisaient tous `.from('user_data')...`.
  Concrètement, **tout compte réel qui se connectait tombait sur un écran
  d'erreur** : *« La table 'public.user_data' n'existe pas encore... Exécutez
  v5_schema.sql »* — une instruction qui, suivie, aurait recréé le schéma
  legacy qu'on venait délibérément de supprimer.

**Corrigé** (`index_jsx.js`, ~L4865-5185) : chargement initial et sauvegarde
migrés vers les vraies tables relationnelles V6, déjà présentes avec RLS
complète (`materials`, `labor`, `solutions`, `recipes`, `company_settings`) :
- Nouvelles fonctions de mappage camelCase (JS) ↔ snake_case (DB) par table.
- `syncCatalogTable()` : resynchronisation complète (delete + insert) d'une
  table catalogue org-scopée à chaque `updateMateriaux`/`updateLabor`/
  `updateSolutions`/`updateRecipes` — cohérent avec la sémantique historique
  (`newVal` = liste complète faisant autorité). Fenêtre delete→insert non
  atomique, risque accepté et documenté : un échec réseau y laisse au pire
  le catalogue cloud vide jusqu'au prochain enregistrement réussi, le state
  local + `LS.setOutboxKey` restant la source de vérité affichée entre-temps.
- `updateCompanyInfo` : `upsert` simple (clé primaire = `organization_id`).
- Première connexion sur une organisation : amorçage du catalogue de
  démarrage directement dans les tables V6 (remplace l'ancien insert dans
  `user_data`).
- Drainage de l'outbox hors-ligne (reconnexion réseau) redirigé vers ces
  mêmes fonctions pour ces 5 clés.

**Hors périmètre, documenté explicitement** : `savedQuotes` et
`nextQuoteSeq` (la liste "Mes devis" affichée dans l'UI) restent sur l'ancien
chemin `saveToSupabase` → `user_data`, donc **toujours cassés pour un compte
cloud réel** — sans bloquer l'app (l'échec de cette sauvegarde spécifique ne
déclenche pas d'écran d'erreur, contrairement au chargement initial). Ces
devis sont de toute façon déjà persistés réellement via `create_quote_v6`
dans `quotes`/`quote_lines` (table séparée) : la vraie correction propre
serait de faire lire "Mes devis" directement depuis `quotes` au lieu d'un
blob local dupliqué — chantier plus large, non traité ici.

**Écart de schéma connu, non corrigé** : les matières portent des champs
locaux sans colonne V6 (`reference`, `brand`, `supplier`, `stock`,
`purchaseStep`) — conservés en mémoire/local mais ne survivent pas à un
aller-retour cloud tant que le schéma n'est pas étendu.

**Vérification** : tracée au niveau code (lecture exhaustive du flux
d'onboarding et des mutateurs), `npm test` → 40/40 sans régression, et
rejouée en direct en mode Invité (le mode Invité ne passe jamais par ce
chemin — court-circuité dès `sbUser.id === 'guest'` — donc non affecté par
construction). **Non vérifiée avec une vraie session authentifiée contre
Supabase** : l'agent a délibérément nettoyé un jeton d'authentification réel
resté en cache dans le navigateur de test plutôt que de risquer une écriture
involontaire en production pendant la vérification. À faire : un test de
connexion réelle une fois qu'un compte de test dédié est désigné.

---

## 📊 17. Audit de publication (2026-08-17) — Score : 71/100

Audit demandé explicitement par l'utilisateur (« test global du SaaS,
publiable ou non, note sur 100 »), mené par vérifications réelles — suite de
tests, parcours live dans le navigateur, lecture du code source des
fonctions Supabase, audit sécurité/perf de la base de production — pas une
auto-évaluation. Contrairement au 100/100 du § 4, chaque ligne ci-dessous est
sourcée.

| Catégorie | Score | Constat |
| :--- | ---: | :--- |
| Moteur de calcul & étalons métier | 25/25 | 40/40 tests au vert, 7/7 étalons à tolérance zéro |
| Sécurité RLS / anti-IDOR | 17/20 | RLS actif sur 19/19 tables ; code source des fonctions `SECURITY DEFINER` exposées à `anon` lu directement — vérifient bien `auth.uid()`/permissions, pas de faille IDOR réelle. Reste : protection mot de passe compromis désactivée, tables RLS sans policy |
| Fonctionnalités commerciales (vérifiées en direct) | 15/20 | Devis, calcul, sauvegarde locale, PDF : fonctionnels, 0 erreur console. Bug `\n` littéral trouvé dans 2/8 gabarits (notes PDF client) |
| Intégrité "Zéro Faux Succès" | 5/15 → **corrigé depuis, voir § 16** | Violation directe de la Règle d'Or #3 trouvée (§ 16.1) |
| Environnements Supabase | 5/10 | Staging + Production réels, schéma V6 complet. `development` = `production` (risque documenté § 13). **Chemin cloud réel trouvé cassé, corrigé depuis (§ 16.2)** |
| Opérationnel (git/CI) | 4/10 | Dépôt local uniquement, jamais poussé — CI jamais exécutée réellement. Travail de session non committé au moment de l'audit |

**Ce score date d'avant les correctifs du § 16.** Il sera réévalué après
commit/push (§ 18 si créé) pour refléter les corrections de la Règle d'Or #3
et du chemin cloud réel. Les composantes Sécurité, Fonctionnalités et
Environnements sont directement améliorées par le § 16 ; Moteur de calcul et
Opérationnel restent à réévaluer séparément (le second dépend du commit/push
en cours).
