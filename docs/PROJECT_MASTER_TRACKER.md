# 🏗️ IKADEVIS / MICRO OFFICE ERP CALCUL — FICHE MAÎTRESSE D'ARCHITECTURE & SUIVI DU PROJET

> **Document de Référence & Mémoire Centrale du Projet**  
> *Dernière mise à jour : 19 Août 2026 — Statut : 🟢 90/100, PUBLIABLE APRÈS VALIDATION DES TARIFS (réévaluation § 22 ; test d'utilisabilité du 2026-08-17 : 19 constats, tous traités — voir § 21)*
>
> ⚠️ Le statut "100/100 PRODUCTION READY" du § 4 est **obsolète et invérifié**
> (auto-évaluation d'avant l'audit indépendant du 2026-08-16, qui a trouvé un
> dossier de tests inexistant et aucun dépôt git). Les § 12, § 13, § 16/§ 17/
> § 18 et surtout **§ 21 (2026-08-19)** font foi sur le § 4.
>
> 🔴 **Décision commerciale en attente avant publication** — les tarifs de
> main-d'œuvre maçonnerie et carrelage ont été corrigés (§ 21.2, B2) sur des
> ordres de grandeur Bamako, pas sur les relevés réels de l'entreprise. Tant
> qu'ils ne sont pas arbitrés, chaque devis émis engage un prix non validé —
> même réserve que pour les 11 prix de prestations déjà signalés. Le
> 2026-08-19, un **choix de mode de rémunération** (à la tâche / à la
> journée, § 21.6) a été ajouté pour rendre le risque visible pendant la
> saisie — cela ne valide toujours pas les montants.
>
> **Repère rapide pour reprendre en nouvelle discussion — état à la fin de
> la session du 2026-08-19 :**
> - **Test d'utilisabilité mené en conditions réelles le 2026-08-17** (§ 21) :
>   parcours complet d'un patron de PME BTP + signalétique à Bamako, en Mode
>   Démo. **19 constats** dont 4 bloquants — tous corrigés sur la branche
>   `fix/test-utilisabilite-0817` (22 commits, **non fusionnée, non poussée**).
> - **Le devis client était inutilisable en l'état** : toutes les quantités
>   sortaient à « 1,00 u » (un mur de 176 m² compris), sous l'en-tête d'une
>   entreprise ivoirienne fictive préremplie. Corrigé (§ 21.1).
> - **La main-d'œuvre maçonnerie/carrelage était sous-chiffrée d'un facteur
>   12 à 15** — un maçon payé 3 500 FCFA/jour. Corrigé, étalon G recalibré en
>   conséquence (§ 21.2).
> - **3 décisions à arbitrer identifiées en fin de test, statut au 2026-08-19**
>   (§ 21.4) :
>   1. Tarifs B2 (12 000/13 000 FCFA/j) — **toujours ouvert**, mais un choix
>      de mode de rémunération avec coût effectif affiché en direct a été
>      livré (§ 21.6) plutôt qu'un chiffre arbitré à l'aveugle.
>   2. `payment_schedule` non synchronisé au cloud — **fermé**, migration
>      appliquée et vérifiée sur staging **et production** (§ 21.4 point 2).
>   3. 11 prix de prestations provisoires — **non commencé**.
> - **Piège découvert et fermé le 2026-08-19 (pas lié au test d'utilisabilité)**
>   (§ 21.4 point 5, § 13) : le `config.js` local pointait sur la base de
>   **production** faute d'environnement de dev isolé. `.env.development`
>   repointé sur **staging**, `config.js` régénéré, build + 40/40 tests
>   revérifiés sans régression. Isolation **partielle** — `development`
>   partage la base de staging, pas un projet dédié — mais le risque
>   production est éliminé.
> - Suite de tests : **40/40 au vert** après les 22 commits, 7/7 étalons
>   conformes. Étalon G recalibré une 2ᵉ fois (valeurs mesurées, § 21.2).
>
> **État à la fin de la session précédente (2026-08-17) :**
> - Dépôt git **publié sur GitHub le 2026-08-17** :
>   `git@github.com:Mahamane04/ikadevis.git`, **privé**, branche `main`,
>   33 commits. Audit de secrets fait avant push (voir § 20).
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
> - **Super-admin plateforme livré, testé et EN PRODUCTION** (§ 19) : écran
>   Administration en lecture seule, auto-promotion impossible, accès
>   journalisés. `v6_platform_admin.sql` appliqué sur staging ET production
>   le 2026-08-17 ; `officemicro89@gmail.com` désigné premier admin.
> - Prochaines pistes ouvertes : isoler `development`, migrer
>   `savedQuotes`/`nextQuoteSeq` vers la vraie table `quotes` (§ 16),
>   appliquer la migration RLS `material_price_history` sur production (SQL
>   fourni, § 16), poursuivre le découpage de `index_jsx.js`, **plus les 4
>   limites ouvertes du § 21.4**.

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
| **Development** | *(aucun projet dédié)* | `mwfmruzlonsrrfufbsyz` — **partagé avec staging depuis le 2026-08-19** | Ika devis | 🟡 Isolé de la prod, pas encore d'un projet dédié — voir ci-dessous |
| **Staging** | `ikadevis-staging` | `mwfmruzlonsrrfufbsyz` | Ika devis | 🟢 Créé le 2026-08-16, `v6_schema.sql` appliqué (19 tables, RLS actif), 0 ligne de données |

**Historique du piège Development = Production.** Le hardcode originel de
`index_jsx.js` (avant P0.4) pointait vers `qmavetqcpzsfralsqxsi` ;
`.env.development` avait été aligné dessus pour préserver le comportement
existant au moment de la remédiation du 2026-08-16, et le risque avait été
sciemment reporté (décision utilisateur du 2026-08-16 : « une fois le SaaS
jugé prêt »). Redécouvert le 2026-08-19 en préparant la migration
`payment_schedule` (§ 21.4 point 5) — **corrigé le jour même** :
`.env.development` pointe maintenant sur **staging**
(`mwfmruzlonsrrfufbsyz`), `config.js` régénéré et vérifié, 40/40 tests au
vert, aucune régression. Ce n'est PAS l'isolation complète envisagée en
août : `development` et `staging` partagent désormais la même base — un
essai local peut donc polluer les données de staging (schéma vide, RLS
active, sans conséquence commerciale, contrairement au piège précédent).
**Reste à faire si l'isolation totale est souhaitée** : créer un 3ᵉ projet
Supabase dédié au développement, lui appliquer `v6_schema.sql`, et y
repointer `.env.development` — toujours reporté, mais le risque qui rendait
ça urgent (écriture accidentelle en production) est levé.

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

**Ce score date d'avant les correctifs du § 16 — voir § 18 pour la
réévaluation finale.**

---

## 📈 18. Réévaluation finale (2026-08-17) — Score : 85/100

Après les correctifs du § 16 (Règle d'Or #3, chemin cloud réel) et le commit
local (dépôt à jour, pas de remote — décision utilisateur). Même méthode que
le § 17 : vérifications réelles, pas d'auto-satisfecit.

| Catégorie | § 17 | § 18 | Évolution |
| :--- | ---: | ---: | :--- |
| Moteur de calcul & étalons métier | 25/25 | **25/25** | Inchangé, toujours parfait |
| Sécurité RLS / anti-IDOR | 17/20 | **18/20** | `material_price_history` a maintenant de vraies policies sur staging (production en attente, SQL fourni au § 16.1) |
| Fonctionnalités commerciales | 15/20 | **17/20** | Persistance cloud matières/MO/recettes/entreprise réellement corrigée (vérifiée par lecture de code + tests + mode Invité live). Le bug `\n` littéral (2/8 gabarits) n'a pas été traité — hors périmètre des 3 tâches demandées |
| Intégrité "Zéro Faux Succès" | 5/15 | **13/15** | Les 2 violations trouvées sont corrigées et vérifiées. Pas 15/15 : la recherche n'a couvert que le motif `mock`/données codées en dur trouvé par grep — pas une garantie qu'il n'en reste aucune ailleurs dans les ~8800 lignes restantes |
| Environnements Supabase | 5/10 | **7/10** | Le bug qui cassait tout compte cloud réel est corrigé pour company/materials/labor/solutions/recipes. Reste : `savedQuotes`/`nextQuoteSeq` toujours cassés (§ 16.2, hors périmètre), `development` = `production` toujours pas isolé, RLS `material_price_history` pas encore appliquée en production, **aucun test avec une vraie session authentifiée** (l'agent a nettoyé un jeton réel resté en cache plutôt que de risquer d'écrire en production pendant la vérification) |
| Opérationnel (git/CI) | 4/10 | **5/10** | Travail committé localement (`37ac2b3`). Toujours pas de remote (décision utilisateur de rester en local), donc la CI GitHub Actions ne s'exécute toujours pas réellement |

**Total : 85/100 — PUBLIABLE AVEC RÉSERVES MINEURES.** Progression réelle de
+14 points depuis le § 17, portée par deux corrections qui comptaient
vraiment (persistance cloud cassée pour de vrai, pas juste "non testée" ;
deux vraies violations de la Règle d'Or #3). Ce qui manque encore avant un
100/100 défendable :
1. Tester une vraie connexion avec un compte cloud authentique (jamais fait
   sur le nouveau chemin V6 — seule la trace de code + les tests + le mode
   Invité le couvrent).
2. Appliquer la migration RLS `material_price_history` sur production (SQL
   prêt, § 16.1).
3. Migrer `savedQuotes`/`nextQuoteSeq` vers la vraie table `quotes` (§ 16.2).
4. Isoler l'environnement `development` de la production (§ 13, reporté par
   l'utilisateur).
5. Pousser vers un remote pour activer la CI (reporté par l'utilisateur).
6. Corriger le bug `\n` littéral dans 2 gabarits sur 8 (cosmétique, mineur).

---

## 🛡️ 19. Super-admin plateforme (éditeur du SaaS) — 2026-08-17

Demande : un compte permettant à l'éditeur de superviser **toutes** les
organisations clientes (support, statistiques), distinct du rôle `owner`
qui n'a de portée que sur sa propre organisation.

### 19.1 Pourquoi c'est le chantier le plus sensible du projet

Un super-admin **contourne par construction l'isolation multi-tenant** (RLS
par `organization_id`) — c'est-à-dire exactement la protection anti-IDOR sur
laquelle repose toute la Règle d'Or #2. Trois garde-fous encadrent donc ce
contournement, et ils ne sont pas négociables :

1. **Lecture seule sur les données clients.** Aucune policy d'écriture
   cross-tenant n'existe. L'éditeur peut diagnostiquer et compter, il ne peut
   pas modifier le devis d'un client à son insu. Si un besoin d'écriture en
   support apparaît un jour, il devra passer par une RPC dédiée, journalisée
   et limitée — jamais par un blanc-seing global.
2. **Auto-promotion impossible.** `platform_admins` n'a **aucune** policy
   INSERT/UPDATE/DELETE. RLS étant actif, Postgres refuse toute écriture
   venant de `anon`/`authenticated`, même avec un JWT valide. L'octroi se
   fait uniquement en SQL sous `service_role`.
3. **Traçabilité.** Chaque consultation passe par une RPC qui journalise dans
   `platform_admin_audit` (table elle aussi non-écrivable côté client).

### 19.2 Ce qui a été livré

- `v6_platform_admin.sql` (migration additive versionnée) : tables
  `platform_admins` + `platform_admin_audit`, helper `is_platform_admin()`,
  19 policies de lecture cross-tenant **ajoutées** (permissives, donc en OR
  avec les policies tenant existantes — celles-ci ne sont pas touchées),
  RPC `get_platform_overview()`, `log_platform_admin_action()`,
  `grant_platform_admin()`, et des `REVOKE EXECUTE` sur `anon`.
- Écran **Administration** dans l'app (`renderPlatformAdmin`), visible
  uniquement si `is_platform_admin()` renvoie vrai : agrégats plateforme +
  tableau par organisation (membres, clients, affaires, devis, volume TTC,
  dernière activité). Bandeau « LECTURE SEULE » explicite.
- Le booléen `isPlatformAdmin` côté React **n'est jamais une source
  d'autorité** : il ne pilote que l'affichage du menu. Le forcer dans la
  console ne donne accès à aucune donnée — la RPC refuserait.

### 19.3 Vérifications réellement effectuées (staging, 2026-08-17)

Scénario monté avec 2 puis 3 organisations distinctes et 2 comptes :

| Test | Attendu | Résultat |
| :--- | :--- | :--- |
| Utilisateur lambda (membre org A) | ne voit que l'org A | ✅ 1 org / 1 devis, org B invisible |
| Admin plateforme | voit tout | ✅ 2 orgs / 2 devis |
| `INSERT` dans `platform_admins` depuis `authenticated` | refusé | ✅ table reste à 0 ligne |
| `get_platform_overview()` depuis compte lambda | refusé | ✅ exception levée |
| Accès admin | journalisé | ✅ entrée dans `platform_admin_audit` |
| Mode Démo/Invité | pas d'entrée de menu | ✅ 6 entrées, aucune "Administration" |
| Connexion admin réelle via l'UI | menu + écran peuplé | ✅ vérifié en navigateur, données cross-tenant affichées |

Toutes les données de test ont été supprimées de staging après vérification
(staging est revenu à 0 organisation / 0 utilisateur).

### 19.4 Mise en production (2026-08-17)

`v6_platform_admin.sql` appliqué sur **production** (`SuperDevisMO`) selon la
procédure du § 13 : `--read-only` retiré de `.mcp.json`, redémarrage,
migration, puis `--read-only` remis immédiatement après. Vérifications
post-migration, identiques à celles de staging :

| Contrôle | Résultat en production |
| :--- | :--- |
| `platform_admins` / `platform_admin_audit` | créées, RLS actif |
| Policies d'écriture sur ces 2 tables | **aucune** (SELECT seul) → auto-promotion impossible |
| Policies tenant existantes | intactes (clients 4, quotes 4, materials 2, organizations 2, audit_logs 1) |
| Policy `Platform admin read` | 1 par table métier, ajoutée sans toucher aux autres |
| Premier admin désigné | `officemicro89@gmail.com` (seul compte de la base, créé le 2026-08-14) |

> L'octroi a été fait via `SELECT public.grant_platform_admin(...)` exécuté en
> `service_role`. La fonction est `SECURITY INVOKER` **et** a un `REVOKE
> EXECUTE ... FROM anon, authenticated` : elle n'est pas appelable depuis le
> navigateur, quel que soit le compte.

### 19.5 Reste à faire

- **Vérifier l'écran en conditions réelles sur la production** : non fait.
  L'écran a été validé de bout en bout sur staging (connexion admin réelle,
  données cross-tenant affichées), mais personne ne s'est encore connecté à
  la production depuis la migration. À faire à la prochaine connexion :
  se déconnecter/reconnecter pour que `is_platform_admin()` soit réévalué,
  puis ouvrir *Plateforme → Administration*.
- Pistes d'extension non faites : détail par organisation (drill-in),
  suspension d'un compte client, métriques d'usage dans le temps.

---

## 🐙 20. Mise en ligne sur GitHub (2026-08-17)

Dépôt : **`git@github.com:Mahamane04/ikadevis.git`** — **privé**, branche
`main`, 33 commits, 52 fichiers, ~1 Mo transférés.

### 20.1 Audit de secrets effectué AVANT le push

Le dépôt avait démarré par un commit baseline (`02e177d`) contenant des
identifiants en dur — d'où un audit complet de **tout l'historique**, pas
seulement des fichiers courants (une fois sur GitHub, l'historique est
difficile à effacer).

| Recherche | Résultat |
| :--- | :--- |
| Clés `service_role` (`sb_secret_…`) | ❌ aucune — le seul match était le préfixe constant de `vendor/supabase.min.js`, sans valeur |
| Personal Access Token (`sbp_…`) | ❌ aucun — le seul match était le texte littéral `` `sbp_...` `` dans la doc |
| JWT Supabase dans l'historique | ✅ présents (`02e177d`, `f5d56b5`) — **tous décodés : `"role":"anon"` uniquement** |
| `.env.development/staging/production` | ❌ jamais committés (exclus dès le baseline via `git rm --cached`) |
| `config.js` | ❌ jamais committé (`.gitignore`) |
| `.env.example`, `config.example.js` | ✅ publiés, mais valeurs factices (`your-project`, `your-anon-key-here`) |

**Conclusion : push sûr.** La clé `anon` est *conçue* pour être publique —
elle est embarquée dans le JS de toute app Supabase et lisible dans les
devtools du site déployé. Sa sécurité repose entièrement sur les RLS, qui
ont été vérifiées en profondeur (§ 19.3 notamment). Aucun secret réel
(service_role, token de compte) n'a jamais touché le dépôt.

> Le dépôt a néanmoins été créé **privé** : rien ne justifie d'exposer la
> logique de calcul, la grille tarifaire et les références de projets Supabase.

### 20.2 Points à connaître

- **Authentification** : SSH déjà configurée sur la machine (compte GitHub
  `Mahamane04`). Aucun token ni mot de passe n'a été manipulé.
- **Le push a été exécuté par l'utilisateur**, pas par l'agent : le garde-fou
  du mode auto bloque les actions qui publient vers l'extérieur. Le remote
  avait été ajouté au préalable ; seul `git push` a nécessité une exécution
  manuelle.
- **Identité des commits** : tous signés `ikadevis <dev@ikadevis.local>`,
  identité de substitution utilisée faute de `user.name`/`user.email` git
  configurés sur la machine. Conséquence : ils **n'apparaissent pas dans le
  graphe de contributions GitHub** de l'utilisateur. Réécrivable, mais cela
  suppose de réécrire tout l'historique (`filter-branch`/`filter-repo`) et
  de forcer le push — à ne faire que si c'est vraiment souhaité.
- **`README.md` créé** à cette occasion (le dépôt n'en avait aucun et se
  serait affiché vide) : démarrage, commandes, structure, cartographie des
  environnements et posture de sécurité. Il renvoie vers ce tracker, qui
  reste la référence.

### 20.3 Conséquence : la CI devient réelle

`.github/workflows/ci.yml` existait depuis le début mais ne pouvait pas
s'exécuter faute de remote. Elle se déclenchera désormais à chaque push sur
`main`. **Non vérifié à ce jour** : le premier run n'a pas encore été observé.
À surveiller — le workflow lance `npm ci` puis `npm test`, lequel démarre
Chromium via puppeteer ; un runner GitHub sans les dépendances système de
Chromium pourrait échouer là où la machine locale réussit.

---

## 🔍 21. Test d'utilisabilité en conditions réelles (2026-08-17 → 19)

Premier test du SaaS **du point de vue d'un client**, pas d'un développeur :
parcours complet d'un patron de PME malienne exerçant à la fois dans le BTP et
la signalétique/branding — chiffrer un mur de clôture de 80 ml pour une usine,
puis l'habillage de façade et l'enseigne du même client. Mené en Mode Démo,
**aucune écriture Supabase** (vérifié : zéro requête réseau vers le projet).

**19 constats** : 4 bloquants, 8 majeurs, 7 frictions. Tous traités sur la
branche `fix/test-utilisabilite-0817` — **17 commits, non fusionnée, non
poussée à ce jour**. Suite de tests à 40/40 après chaque commit.

### 21.1 Chantier 1 — Le document client (B1, B3, F4, F5)

Le seul livrable qui sort de l'outil, et il n'était pas présentable.

| Constat | Défaut | Correctif |
| :--- | :--- | :--- |
| **B1** | La ligne commerciale facturait `calculatedItem.qty` (nombre d'OUVRAGES, souvent 1), jamais le métré. Un mur de 176 m² sortait « 1,00 u » ; un habillage de 36 m² « 1,00 m² à 1 716 600 FCFA/m² », factuellement faux | `calculateSingleWorkItem` expose `metre: {value, unit, summary}`, dérivé des **mêmes variables** que les formules de recette (pas un second calcul parallèle). Le gabarit du PDF testait déjà `item.dimensionSummary` sans que rien ne le remplisse |
| **B3** | Tout compte réel démarrait avec l'identité fictive *IKADEVIS BTP, Abidjan, NIF 2600123A, RCCM CI-ABJ-2026-B-12345*. Les champs paraissant remplis, rien ne signalait qu'il fallait les corriger | `defaultCompany` scindé : `demoCompany` réservé au Mode Invité, `emptyCompany` pour les comptes réels (même garde `estModeDemo` que les données de démo). Imprimer/Partager/Signer bloqués tant que NIF/RCCM/adresse/etc. manquent |
| **F4** | Les lots étaient aplatis en une liste unique, sans intitulé ni sous-total | Groupage par lot + sous-total HT. `lotCode`/`lotName` étaient **déjà** portés par `commercialItems` — le travail était côté rendu seulement |
| **F5** | Deux échéanciers contradictoires sur le même PDF : tableau 40/30/20/10 codé en dur *et* champ libre « 50 % à la commande » | `companyInfo.paymentSchedule` éditable (libellés + %), contrôle « total = 100 % » posé sur `canSend`, doublon retiré du PDF |

> **Piège rencontré (F5)** — bloquer la *sauvegarde* des Paramètres si le total
> ≠ 100 % ne protégeait rien : chaque champ de ce formulaire s'enregistre déjà
> à la frappe. Le blocage n'empêchait que la fermeture propre de la modale. Le
> vrai garde-fou est sur `canSend`, à l'endroit qui décide si le devis part.

### 21.2 Chantier 2 — La justesse du calcul (B2, M4+M5, M6, M7)

**B2 — le plus coûteux.** Les prestations maçonnerie (id 9) et carrelage
(id 10) étaient tarifées en unité `m²` à 3 500 / 4 000 FCFA, mais leurs
recettes (`SURFACE / RENDEMENT_MO`) calculaient déjà un nombre de **jours**
avant de multiplier par ce tarif — exactement le modèle de la peinture (id 5,
`unit: 'j'`, déjà correct). Conséquence : un maçon posant 176 m² touchait
41 067 FCFA pour 11,7 jours de travail, soit **3 500 FCFA/jour**, et la
main-d'œuvre ne pesait que **3,7 % du déboursé** d'un mur en agglos.

Le rendement (15 et 12 m²/jour) était juste depuis le début — seuls le tarif
et l'unité affichée mentaient. Passés à `unit: 'j'`, 12 000 / 13 000 FCFA.

> **Choix de conception retenu** (demande explicite de l'utilisateur d'avoir
> *« le choix par rapport aux besoins »*) : plutôt qu'imposer une règle unique
> à tout le catalogue, **chaque prestation déclare son propre mode de
> tarification** — journalier (avec rendement) ou direct (m², ml, u, forfait).
> `getLaborUnitFormulaMismatch()` vérifie la cohérence unité↔formule à
> l'enregistrement de tout composant de recette, pour **toute prestation
> présente ou future**. Un balayage du catalogue entier ne trouve aucun autre
> cas. Le même garde-fou est proposé à la création d'une prestation à la volée.

**M4+M5 — une seule cause racine.** `calculateSingleWorkItem` et
`systemDiagnostic` construisaient chacun un contexte **complet**
(SURFACE/LARGEUR/HAUTEUR toujours présents) avant d'appeler
`evaluateDynamicFormula` — dont le garde-fou de mode ne rejette une variable
que si elle n'est *pas* « explicite » dans le contexte reçu. Avec un contexte
toujours complet, **le garde-fou ne bloquait jamais rien**. D'où un ouvrage en
mode `unit` avec formule `SURFACE` qui sortait **150 000 FCFA plausibles mais
inventés**, badgé « ✅ Prêt à chiffrer ». `filterVarsForMode()` retire du
contexte les variables que le mode n'autorise pas, branchée aux deux points
d'appel. Le même ouvrage calcule désormais 0 FCFA **et** remonte au diagnostic.

Côté UI, le Mode Simple affichait toujours Largeur/Hauteur quel que soit le
mode réel — et les modifier resynchronisait `surfaceDirect` (BUG-014, pensé
pour `rectangle` seul), donc **éditer un champ fantôme écrasait le métré
réellement utilisé**. Un seul jeu de champs désormais, celui du mode actif.

**M6** — `item.costUnit` était lu par le moteur mais n'avait **aucun champ pour
l'écrire** : toute ligne libre avait `hasKnownCost=false` et se vendait sans
entrer dans le déboursé, gonflant K et la marge affichée. Champ « Coût
d'achat/u » ajouté (desktop + carte mobile), avec astérisque sur Déboursé
Sec/K/Marge tant qu'une ligne libre n'a pas de coût.

**M7** — `handleApplyQuickEstimate` chargeait un gabarit **figé** et ne
reportait la quantité saisie que dans le *libellé* du projet : **6 ml et
600 ml produisaient le même devis**. Le gabarit est désormais mis à l'échelle
du ratio `saisi / défaut de la catégorie` (donc ratio = 1 aux valeurs par
défaut : aucune régression sur les gabarits livrés), en ne touchant que la
dimension qui pilote le métré dans le mode de l'ouvrage.

> L'écart avec la fourchette annoncée **subsiste et s'accroît avec la taille —
> mais il est réel, pas un bug** : l'estimation est un ratio au m²/ml (linéaire
> par construction), le devis détaillé un vrai métré où les forfaits de pose ne
> doublent pas et où les matériaux s'achètent au conditionnement. Vérifié ligne
> à ligne : sur signage 6→12 ml, le caisson suit (3m→6m), les lettres ne
> bougent pas — elles dépendent de `NOMBRE_LETTRES`, un choix métier que le
> logiciel n'a pas à modifier silencieusement. Une note sous l'estimation
> annonce l'écart **avant** que l'utilisateur ne s'engage.

#### Impact chiffré sur l'Étalon G (recalibrage n°2)

| | Avant B2 | Après B2 | Écart |
| :--- | ---: | ---: | ---: |
| Déboursé Sec | 59 805 084 | **60 497 751** | +692 667 |
| Total Net HT | 90 307 626 | **91 346 626** | +1 039 000 |
| Total TTC | 106 562 999 | **107 789 019** | +1 226 020 |
| Coefficient K | 1.51 | **1.51** | inchangé |

Valeurs **mesurées par le test lui-même**, pas recalculées à la main. Le K
inchangé confirme qu'il s'agit d'une propriété structurelle du barème
margin/overhead, indépendante de la ligne de coût qui a varié. L'Étalon B
(Carrelage) n'est pas affecté : ses assertions portent sur le coût matériel.

### 21.3 Chantiers 3 & 4 — Confiance dans l'outil et usage terrain

| Constat | Défaut | Correctif |
| :--- | :--- | :--- |
| **M3** | `setIsLaborModalOpen` / `setIsMatModalOpen` appelés mais **jamais déclarés** (supprimés par le refactor P0.10). Échap levait donc une `ReferenceError` avant d'atteindre les autres modales → **fermeture par Échap morte dans toute l'app** ; « + Nouvelle Prestation » ne faisait rien | Appels orphelins retirés ; bloc de création inline dans la modale de composant (en `<div>`, pas `<form>` — on est déjà dans `#recipeForm`) |
| **M1** | Le bouton « Enregistrer le Devis » du bas enregistrait mais ne remettait jamais l'indicateur à zéro. Cachait un 2ᵉ défaut : l'en-tête remettait l'indicateur à zéro **même quand l'enregistrement était refusé** faute de nom client | État remis à zéro dans `handleSaveQuoteAction`, après le contrôle — un 3ᵉ point d'appel héritera du bon comportement |
| **B4** | L'assistant écrasait le devis en cours **sans un mot**, même avec « Modifications non enregistrées » affiché | `guardUnsavedQuote()` nomme le devis menacé et propose Annuler / Enregistrer d'abord / Continuer |
| **F3** | Cmd+Z capté sur `window` sans regarder le focus : une faute de frappe + Cmd+Z réflexe annulait la dernière action sur le **devis** | Sortie anticipée si la cible est un `input`/`textarea`/`contenteditable` |
| **F2** | Trois indicateurs contradictoires (« Mode Démo », « Cloud Actif », pastille verte « En ligne ») ; deux noms pour la même entreprise | `connectionState` dérivé une fois, consommé aux 3 emplacements ; l'organisation par défaut reprend la raison sociale saisie |
| **M2** | `maconnerie` sans accent → **0 résultat** ; `clôture` ne trouvait jamais la fiche « Maçonnerie en Murs d'Agglos » | `normalizeSearchText` (NFD + suppression des diacritiques) des deux côtés + champ `keywords` par ouvrage, éditable, seedé pour la maçonnerie |
| **M8** | Tableau desktop réutilisé tel quel en mobile : 624 px de contenu dans 337 px, désignations tronquées à un mot | Carte par ouvrage sous `sm` |
| **F1** | La pastille de statut recouvrait 107 px du champ Chantier à 1280 px — on tapait dans le champ Client | `min-w-0` sur chaque **champ** (pas sur le groupe, cf. piège ci-dessous) |
| **F7** | Libellés NIF/RCCM/Validité superposés ; recherche du catalogue persistante entre deux ouvertures | `.app-label--split` ; réinitialisation dans le `useEffect` d'ouverture |

> **Piège rencontré (F1)** — `min-w-0` sur le *groupe* convainc l'algorithme
> flex-wrap qu'il n'y a aucune taille minimale à respecter : il ne fait donc
> **jamais** passer le groupe à la ligne, les champs s'écrasent à ~0 px puis
> débordent quand même de leur taille incompressible. Il faut un `min-width`
> réaliste sur le groupe **et** `min-w-0` sur chaque champ.

> **Piège rencontré (M8)** — `npm run build:js` compile le JSX mais **pas le
> CSS**. Les classes Tailwind inédites (`sm:hidden`, `hidden sm:block`) étaient
> absentes de `tailwind.css` tant que `build:css` n'avait pas tourné : tableau
> et carte s'affichaient superposés à toutes les largeurs. **À surveiller pour
> tout futur ajout de classe Tailwind non encore utilisée dans le projet.**

> **Vérifié plutôt que supposé (F7)** — le constat original signalait des
> boutons sans nom accessible. Audit programmatique exhaustif (toutes les vues,
> tiroir mobile, sélecteur d'organisation, diagnostic, sélecteur de catalogue) :
> **0 bouton sans nom**. Les `aria-label` étaient déjà en place. Aucun
> changement fait — le constat était erroné, pas le code.

### 21.4 Limites connues et assumées

> Points 2 et 5 **fermés le 2026-08-19** (migration appliquée sur staging ET
> production ; `config.js` local ne pointe plus sur la production). Restent
> ouverts : 1 (choix de mode ajouté, § 21.6, mais montants non validés),
> 3, 4, 6.

#### Détail

1. **Tarifs B2 non validés commercialement** — 12 000 / 13 000 FCFA/jour sont
   des ordres de grandeur Bamako, pas les relevés réels de l'entreprise. Même
   réserve que les 11 prix de prestations. **Bloquant pour la publication.**
   Le 2026-08-19, plutôt qu'un arbitrage sur un chiffre, un **choix de mode
   de rémunération** (à la tâche / à la journée) a été ajouté — voir § 21.6.
   Cela ne valide PAS les montants, mais réduit le risque : l'écran affiche
   désormais le coût effectif et l'exposition au risque de rendement pendant
   la saisie, ce qui rend une erreur comme B2 visible avant qu'elle parte
   dans un devis.
2. ~~**`paymentSchedule` non synchronisé au cloud**~~ — **traité le
   2026-08-19**, reste une action à faire sur production. Colonne
   `company_settings.payment_schedule` (jsonb, nullable) ajoutée ;
   `mapCompanyToDb` / `mapCompanyFromDb` la portent désormais, avec repli sur
   le défaut applicatif quand elle est NULL (ligne antérieure à la migration
   ou échéancier jamais personnalisé) — même comportement que le chargement
   local, pour qu'un compte cloud ne se retrouve jamais sans échéancier.
   - **staging** : appliqué et vérifié par round-trip réel (4 tranches,
     total 100 %, libellés préservés ; données de test supprimées ensuite).
   - **production** (`qmavetqcpzsfralsqxsi` / SuperDevisMO) : **APPLIQUÉ le
     2026-08-19 par l'utilisateur** via le SQL Editor du dashboard, à partir
     de `v6_payment_schedule.sql`. Contrôlé ensuite en lecture : colonne
     présente (jsonb, nullable), 2 lignes `company_settings` inchangées,
     2 identités d'entreprise et 2 organisations intactes, `payment_schedule`
     à NULL sur les deux — donc sur le défaut applicatif, comme attendu.
   > Le défaut métier n'est volontairement PAS dupliqué en `DEFAULT` SQL :
   > il reste défini une seule fois côté application, sans quoi les deux
   > valeurs dériveraient à la première évolution.
3. **Boutons « Modifier (V6) » sans garde-fou B4** — ils remplacent le plan de
   travail sans confirmation. Ils vivent dans `App` alors que
   `hasUnsavedChanges` vit dans `QuoteWorkspace` ; les couvrir suppose de
   remonter cet état.
4. **Mode `floor` incomplet dans `calculateSingleWorkItem`** — pas de branche
   dédiée (seuls rectangle/volume/surface/linear sont couverts), contrairement à
   `evaluateDynamicFormula` qui, lui, le gère. Écart architectural entre les
   deux fonctions, **antérieur à cette session**. 3 solutions du catalogue
   autorisent ce mode, toutes avec `surface` en premier donc non actif par
   défaut.
5. ~~⚠️ **`config.js` local pointe vers la PRODUCTION**~~ — constaté puis
   **fermé le 2026-08-19, même session**. `.env.development` pointait sur
   `qmavetqcpzsfralsqxsi` (production) faute d'isolation (§ 13) ; repointé
   sur **staging** (`mwfmruzlonsrrfufbsyz`), `config.js` régénéré et
   vérifié, `npm run build` + suite complète relancés (40/40, 7/7 étalons,
   aucune régression). README et § 13 mis à jour. Les tests du 2026-08-17
   n'avaient de toute façon rien touché (Mode Démo, localStorage, zéro
   requête Supabase vérifiée) — le piège était réel mais jamais déclenché.
   > Isolation **partielle** : `development` partage maintenant la base de
   > **staging**, pas un projet dédié. Suffisant pour éliminer le risque
   > production ; l'isolation complète (3ᵉ projet Supabase) reste une
   > amélioration possible, non urgente, voir § 13.

6. **Catégorie « Peinture & Ravalement » de l'assistant sans gabarit dédié** —
   retombe sur `R1_TEMPLATE_QUOTE` (villa 11 lots). La mise à l'échelle M7
   s'applique donc à un gabarit qui ne correspond pas à la catégorie choisie.
   Défaut de sélection **antérieur** à cette session.

### 21.5 Méthode

Le test a été mené **sans consulter la documentation**, en découvrant l'app
comme le ferait un client. Chaque constat a été reproduit puis remonté jusqu'à
sa cause dans le code avant d'être corrigé — deux diagnostics ont demandé un
second passage après une première correction insuffisante (F1, carte mobile),
dans les deux cas confirmés par **mesure directe des rects** plutôt que par
supposition.

Deux corrections ont été apportées au rapport initial après lecture du code :
M7 était **plus grave** que décrit (entrée utilisateur ignorée, pas un écart
d'arrondi), et M4/M5 n'étaient **pas deux bugs mais un seul** (le `calcForm`
par défaut portant les valeurs de tous les modes à la fois).

Non testés : parcours avec compte cloud réel, « Partager » et « Signer »
(actions sortantes), impression PDF réelle, multi-organisation, écran
d'administration plateforme, module « Affaires & Projets ».

### 21.6 Choix du mode de rémunération de la main-d'œuvre (2026-08-19)

Réponse à la question posée par l'utilisateur sur l'arbitrage des tarifs B2
(§ 21.4 point 1) : au lieu de trancher un chiffre, le logiciel donne
maintenant le choix — ce sont les deux modèles standards du métier BTP, que
les logiciels d'étude de prix séparent systématiquement (déboursé journalier
× temps unitaire d'un côté, sous-traitance à prix ferme de l'autre — le
« tâcheronnage » est la forme locale du second) :

- **À la journée / en régie** — l'entreprise paie un tarif par jour, le
  rendement (unités produites/jour) est une hypothèse ; si le chantier
  rend moins, le surcoût est absorbé par la marge.
- **À la tâche** — l'entreprise paie un tarif par unité produite (m², ml,
  u...) ; le risque de rendement est porté par le tâcheron.

**Ce que fait l'écran (formulaire Main-d'œuvre, Ressources & Prix) :**

1. **Coût effectif affiché en direct pendant la saisie** (commit
   `1fa3651`) — un tarif journalier affiche « 12 000 FCFA/jour ÷ 15/jour =
   800 FCFA par unité réalisée » ; un tarif direct affiche « facturé tel
   quel » ; un tarif journalier sans rendement affiche un avertissement
   (conversion impossible, les formules qui divisent par `RENDEMENT_MO` en
   ont besoin). Un rendement saisi sur un tarif **direct** est signalé comme
   **non utilisé** par le chiffrage plutôt que silencieusement ignoré — 4
   ressources sont dans ce cas (moquette, cloisons, faux-plafond, enduit).
2. **Bascule de mode explicite** (commit `3c2bc77`) — un sélecteur à deux
   boutons (À la tâche / À la journée) change `laborForm.unit`, avec une
   ligne d'exposition au risque : « si le rendement tombe à 12 au lieu de
   15, le coût réel monte à 1 000 FCFA/unité, soit +25 % absorbés par votre
   marge ; en mode à la tâche, ce dépassement serait porté par le
   tâcheron. »
3. **Conversion cohérente à l'enregistrement** (`saveLabor`) — changer de
   mode ajuste ensemble les trois choses qui doivent rester synchronisées,
   avec aperçu avant application (formule et tarif, avant/après) :
   - l'unité (`j`/`j-eq` ↔ `m²`/`ml`/`u`/`forfait`) ;
   - les formules de **toutes** les recettes qui utilisent la prestation
     (ajout/retrait non destructif de `/ RENDEMENT_MO`, `formulaToDaily` /
     `formulaToTask`, testées en aller-retour sur 7 cas dont une formule
     ternaire déjà parenthésée) ;
   - **le tarif lui-même** — `÷` ou `× RENDEMENT_MO`, et seulement si
     l'utilisateur n'a pas lui-même changé le tarif dans la même saisie (sa
     valeur explicite prime toujours).

> **Régression auto-introduite puis corrigée** — la première version
> convertissait l'unité et les formules mais pas le tarif : basculer la
> maçonnerie en « à la tâche » laissait 12 000 FCFA, réinterprété comme
> 12 000 FCFA/m² au lieu de 800, soit un coût × 15. C'était le constat B2
> reproduit à l'envers par la fonctionnalité censée le prévenir — trouvé en
> testant ma propre fonctionnalité (vérification du localStorage après
> enregistrement), pas supposé correct.

**Vérifié en navigateur** depuis les données d'usine : journée → tâche
(12 000 F/j → 800 F/m², `SURFACE / RENDEMENT_MO` → `SURFACE`), puis retour
(800 → 12 000, `SURFACE` → `(SURFACE) / RENDEMENT_MO`). Coût d'un mur de
176 m² : **140 800 FCFA dans les deux modes**, inchangé. 40/40 tests au
vert dans les deux commits.

**Ce que ça ne fait toujours pas** : choisir un montant. Le point 1 du
§ 21.4 reste ouvert — c'est une décision commerciale, pas technique.

---

## 📊 22. Réévaluation (2026-08-19) — Score : 90/100

Même méthode que le § 17/§ 18 : vérifications réelles (suite de tests, git,
lecture de code), pas d'auto-évaluation. Point de départ : le 85/100 du § 18
(2026-08-17). Depuis : le test d'utilisabilité complet (§ 21, 19 constats
corrigés), le choix de mode de rémunération (§ 21.6), la synchro cloud de
l'échéancier (§ 21.4 pt. 2, staging **et** production), l'isolation de
`development` (§ 21.4 pt. 5), et le push réel de 24 commits sur `main`.

| Catégorie | § 17 | § 18 | **§ 22** | Évolution |
| :--- | ---: | ---: | ---: | :--- |
| Moteur de calcul & étalons métier | 25/25 | 25/25 | **25/25** | Inchangé — 40/40 tests, 7/7 étalons, revérifié après le merge sur `main` |
| Sécurité RLS / anti-IDOR | 17/20 | 18/20 | **18/20** | Inchangé — RLS `material_price_history` toujours pas appliquée en production (SQL prêt depuis le 16/08, jamais exécuté) |
| Fonctionnalités commerciales (vérifiées en direct) | 15/20 | 17/20 | **19/20** | +2 — 19 constats réels d'un test client simulé, tous corrigés et vérifiés en navigateur (dont 4 bloquants : devis illisible, coefficient sous-chiffré ×12-15, Échap cassé, indicateurs contradictoires) ; choix tâche/journée avec coût effectif affiché en direct. Reste le bug `\n` littéral (2/8 gabarits PDF), non traité |
| Intégrité "Zéro Faux Succès" | 5/15 | 13/15 | **13/15** | Inchangé — pas de nouvel audit exhaustif du reste du code (qui a grandi de ~1400 lignes depuis). Signal positif : une régression auto-introduite pendant cette session (tarif non converti au changement de mode) a été trouvée et corrigée **avant commit**, en testant la fonctionnalité plutôt qu'en la supposant correcte |
| Environnements Supabase | 5/10 | 7/10 | **8/10** | +1 — le risque le plus grave (`development` = `production`) est éliminé, repointé sur staging. Reste : isolation complète (3ᵉ projet dédié) non faite, `savedQuotes`/`nextQuoteSeq` toujours cassés, RLS `material_price_history` toujours pas en production, aucun test avec une vraie session authentifiée |
| Opérationnel (git/CI) | 4/10 | 5/10 | **7/10** | +2 — `main` porte réellement les 24 commits du travail de session, poussés sur GitHub. **Non vérifié dans cette session** (accès MCP/web indisponibles) : le résultat du run CI déclenché par ce push, et si Cloudflare Pages a effectivement redéployé `app.ikadevis.com` |

**Total : 90/100 — PUBLIABLE, RÉSERVES RÉDUITES.** +5 points depuis le § 18,
portés par des correctifs vérifiés en conditions réelles plutôt que par de
l'auto-satisfecit — cohérent avec la progression 71 → 85 → 90.

**Ce qui manque avant un 100/100 défendable** (ordre de priorité) :
1. **Vérifier réellement** le run CI et le déploiement suite au push
   d'aujourd'hui — non observé, accès indisponible dans cette session.
2. Appliquer la RLS `material_price_history` sur production — SQL isolé le
   2026-08-19 dans `v6_material_price_history_rls.sql` (copie vérifiée des
   policies déjà actives sur staging depuis le 16/08, § 16.1). **Prêt,
   jamais exécuté** : `execute_sql` en production refuse le `DROP POLICY`
   (`cannot execute DROP POLICY in a read-only transaction`, comportement
   attendu — § 13). À exécuter via le SQL Editor du dashboard, comme
   `v6_payment_schedule.sql` le 2026-08-19.
3. Tester une vraie connexion avec un compte cloud authentique sur le
   chemin V6 (jamais fait — seuls le code, les tests et le mode Invité le
   couvrent).
4. Migrer `savedQuotes`/`nextQuoteSeq` vers la vraie table `quotes`
   (§ 16.2).
5. Isoler `development` sur un 3ᵉ projet Supabase dédié (actuellement
   partagé avec staging — le risque production est levé, pas l'isolation
   complète).
6. Corriger le bug `\n` littéral dans 2/8 gabarits PDF (cosmétique).
7. Les 3 limites mineures restantes du § 21.4 (garde-fou B4 sur "Modifier
   V6", mode `floor` incomplet, gabarit Peinture manquant).

> **Séparé de cette note, et volontairement non inclus dedans** — c'est une
> décision commerciale, pas un défaut logiciel : les tarifs de main-d'œuvre
> et les 11 prix de prestations restent provisoires. Le logiciel est prêt à
> les porter (§ 21.6 le rend même plus sûr à ajuster) ; tant qu'ils ne sont
> pas arbitrés, chaque devis réel engage un prix non validé commercialement.

---

## 🛠️ 23. Correctifs post-audit (2026-08-19) — P1-01, P1-06, P1-03 (lecture)

Suite au § 22, trois correctifs demandés et livrés dans l'ordre : Remise
Client exposée, bundle minifié, lecture cloud de "Devis Enregistrés".

### 23.1 — P1-01 : Remise Client exposée dans le bon panneau

Le champ existait (`calc_discount_input`) mais dans le panneau
"Estimation Rapide" de l'assistant, pas dans celui réellement utilisé
depuis "Créer un Devis" (`WorkItemInspector`, onglet "3. Prix & Marge").
Ajouté au bon endroit, avec une ligne "Remise Client (-X%)" qui montre le
montant retranché — pas seulement le prix final.

> **Piège rencontré en vérifiant** : la première tentative affichait
> "-0 FCFA" quel que soit le taux. Cause réelle : `margeValeurConsomme`
> (utilisé dans le premier calcul de la ligne) est déjà net de remise
> (`netHTConsomme - totalRevientConsomme`), donc `Revient + Marge -
> NetHT` vaut structurellement 0 — pas un bug de calcul, une formule mal
> choisie pour l'affichage. Corrigé en exposant `prixVenteConsommeHT`
> (prix **avant** remise) depuis le `useMemo` qui alimente réellement ce
> panneau (`index_jsx.js`, dans `App`) — pas celui de `calc-engine.js`
> qui n'est pas utilisé par cet écran, découvert seulement après un
> premier essai infructueux avec le mauvais champ.
>
> **Deuxième piège, plus bête** : après correction, le navigateur de test
> continuait de servir l'ancien bundle malgré le bump `?v=`. Le Browser
> pane de l'outil garde parfois un onglet "chaud" qui ne relit pas
> `index.html` sur un simple `navigate` — un `tabs_close` puis
> `preview_start` neuf a suffi à forcer un vrai rechargement. À
> reproduire si un correctif vérifié "ne prend pas" alors que le code
> source est correct et le serveur sert la bonne version (confirmé via
> `curl` direct).

Vérifié en direct, bundle propre : 109 706 → 93 250 FCFA à 15% (exact),
Remise Client affichée à -16 456 FCFA (= 109 706 - 93 250), échéancier de
paiement et PDF client recalculés en cohérence. 40/40 tests.

### 23.2 — P1-06 : bundle de production minifié

`--minify` ajouté à `build:js`. 576 Ko → 392 Ko. 40/40 tests inchangés
après reconstruction — aucune dépendance du code ou des tests sur les
noms de variables/la mise en forme du bundle compilé.

### 23.3 — P1-03 (lecture) : "Devis Enregistrés" reconstruit depuis `quotes`

Le vrai chemin d'enregistrement (`handleSaveQuoteAction` →
`adaptHybridToSavedQuote`, `js/calc-engine.js`) construisait déjà un
`hybridQuoteSnapshot` complet et fidèle, envoyé à `create_quote_v6` dans
`p_hybrid_snapshot` → stocké tel quel dans `quotes.hybrid_quote_snapshot`.
Une fonction inverse `adaptSavedQuoteToHybrid` existait même déjà pour le
redéplier. **Rien de tout ça n'était jamais appelé au chargement d'un
compte cloud** — `savedQuotes` restait vide (ou tentait de se charger
depuis le blob `user_data` mort).

Ajouté : requête `quotes` dans le `Promise.all` du chargement cloud
initial (org-scopée, RLS déjà correcte), `mapQuoteFromDb` qui rappelle
`adaptHybridToSavedQuote(row.hybrid_quote_snapshot, row.company_snapshot)`
pour chaque ligne — réutilise la logique déjà éprouvée au lieu de
reconstruire la forme à la main. `nextQuoteSeq` recalculé depuis le
numéro max trouvé. Repli défensif pour une ligne sans snapshot
exploitable (ne devrait plus arriver pour un devis créé après ce
correctif) : résumé minimal depuis les colonnes totalisées, sans détail
des lots.

**Vérification** : colonnes de `quotes` confirmées une à une contre le
schéma staging réel (`information_schema.columns`, pas seulement
`v6_schema.sql`). Round-trip complet rejoué en Node, hors navigateur
(`adaptHybridToSavedQuote` → ligne DB simulée → `mapQuoteFromDb` →
`adaptSavedQuoteToHybrid`) : 6/7 vérifications au vert ; le seul écart
(`totalTTC` recalculé à 0) vient du test lui-même (catalogue vide passé à
`calculateHybridQuote`, qui recalcule bien toujours depuis le catalogue
courant — comportement voulu, pas un défaut).
>
> **Non vérifié en conditions réelles avec un vrai compte cloud** — même
> blocage que pour l'isolation multi-tenant (§ 22, P1-04) : le
> rate-limit anti-spam de Supabase Auth a empêché de créer un compte de
> test pendant cette session. La vérification ci-dessus (schéma réel +
> round-trip logique) est solide mais n'a jamais tourné dans un vrai
> navigateur contre un vrai compte. **À refaire dès qu'un compte de test
> est disponible**, avant de considérer P1-03 totalement clos.

**Reste ouvert, volontairement hors périmètre de ce correctif (Phase B,
non commencée)** : changer le statut d'un devis existant, le renommer ou
le supprimer passe encore par `updateSavedQuotes`/`saveToSupabase`, qui
ciblent toujours le blob `user_data` mort. Sans conséquence dans la
session en cours (l'état local est mis à jour immédiatement, l'écran
reste cohérent), mais l'édition ne survivra pas à un rechargement tant
que ce chemin n'est pas, lui aussi, redirigé vers de vraies écritures
`UPDATE`/`DELETE` sur `quotes`.

---

## 📦 24. Gestion de stock — Phase 1 (2026-08-20)

Demandé par l'utilisateur après avoir buté sur un vrai cas (recette
personnalisée sous-évaluant un cadre métallique, § 23 implicite) : l'app
n'avait **aucune** gestion de stock — un champ `stock: 120` codé en dur sur
une seule matière de démo, jamais affiché, jamais persisté (absent du
schéma V6), jamais utilisé par aucun calcul. Un vestige, pas une
fonctionnalité.

**Conçu comme suivi manuel volontairement simple, pas un vrai ERP de
stock** : un devis ne décrémente jamais le stock, même enregistré — un
brouillon ou une révision non retenue ne doit pas fausser l'inventaire
réel. Seule une saisie explicite dans la fiche matière modifie la valeur.
`NULL` = matière non suivie (défaut, aucun avertissement nulle part) ;
toute valeur y compris 0 = suivie explicitement.

Livré :
- Champ `stockQty` sur la matière (formulaire + fiche "Vue d'ensemble",
  carte verte "Stock Actuel" affichée seulement si suivi).
- Colonne `materials.stock_qty` (NUMERIC, nullable, sans défaut SQL —
  `v6_material_stock.sql`), `mapMaterialToDb`/`FromDb` mis à jour.
  **Appliqué et vérifié par round-trip réel sur staging** (insertion
  12.5, relecture confirmée, données de test supprimées). **Production non
  modifiée** — SQL prêt, à exécuter par l'utilisateur comme les
  précédentes migrations de ce type.
- Avertissement dans le tableau de décomposition (§ 23) : "⚠ Stock
  insuffisant : X <unité> disponible(s)" quand la quantité nette d'une
  ligne dépasse le stock déclaré — **informatif, jamais bloquant**,
  n'empêche pas d'enregistrer le devis.

> **Simplification assumée** : la comparaison se fait ligne par ligne
> contre le stock total de la matière, pas cumulée sur tout le devis. Deux
> recettes qui consomment la même matière sont chacune comparées
> indépendamment au même stock total — un devis qui épuiserait le stock en
> deux lignes cumulées (ex. 2m + 2m contre 3m en stock) ne déclenchera
> l'alerte sur aucune des deux lignes prise isolément. Acceptable pour un
> suivi Phase 1 informatif ; à revoir si un vrai contrôle cumulé devient
> nécessaire.

**Hors périmètre, phases suivantes déjà évoquées avec l'utilisateur** :
historique des mouvements de stock (traçabilité achat/consommation/
ajustement), et le lien avec les chutes (§ 23) — un bouton "ajouter cette
chute au stock" depuis l'écran de décomposition. Aucune des deux n'a été
demandée pour cette itération.

Vérifié en direct : stock à 3 m saisi sur "Tube carré acier 25x25",
avertissement "Stock insuffisant : 3 m disponible(s)" affiché sur la ligne
"Fer du cadre" d'un ouvrage nécessitant 6,30 m. 40/40 npm test.

---

## 🖼️ 25. Logo entreprise & pied de page PDF (2026-08-20)

Point de départ demandé par l'utilisateur pour une refonte plus large des
réglages (inspirée de Zoho Books, montré en exemple) : personnaliser le PDF
en commençant par le logo.

**Découverte avant de coder, qui a changé la priorité** : le devis PDF
affichait `<LogoSVG>` codé en dur (`index_jsx.js:10892`) — **le logo
d'ikadevis, l'éditeur du logiciel, sur le devis de chaque client de chaque
utilisateur**, jamais celui de l'entreprise émettrice. Pas un manque
cosmétique, un vrai défaut : sans y toucher, tout utilisateur qui envoyait
un devis exposait la marque du logiciel au lieu de la sienne.

**Choix technique posé avant de commencer** : aucune infrastructure de
stockage fichier n'existe dans l'app (vérifié par recherche). Plutôt que
d'ajouter un bucket Supabase Storage (nouvelle dépendance, ne fonctionne pas
en Mode Démo local), le logo est stocké en **base64 dans
`company_settings.logo`**, redimensionné (480px de large) et recompressé en
JPEG qualité 0.85 côté navigateur via `<canvas>`
(`compressImageToDataUrl`, `js/utils.js`) avant l'enregistrement — marche
identiquement en local et en cloud, sans nouvelle infrastructure.

Livré :
- Nouvel onglet **"Documents & PDF"** dans Paramètres du Compte : logo
  (aperçu, upload, retrait) + pied de page PDF (texte libre — mentions
  légales, RIB, CGV).
- PDF client : logo de l'entreprise si renseigné, **rien si absent** (pas
  de repli sur le logo ikadevis — perpétuerait le même problème) ; pied de
  page affiché sous la zone de signature, absent si vide.
- `company_settings.logo` / `pdf_footer_note`
  (`v6_company_logo_footer.sql`, TEXT nullable, sans défaut SQL).
  **Appliqué et vérifié par round-trip réel sur staging**
  (logo factice + note RIB, écrits et relus, données de test supprimées).
  **Production non modifiée**, SQL prêt.

Vérifié en direct : logo test injecté via upload réel (canvas → File →
input), aperçu mis à jour immédiatement, **logo visible sur le PDF client à
la place d'ikadevis**, pied de page ("Mentions légales de test / RIB : ...")
affiché en bas du document. 40/40 npm test.

**Suite envisagée avec l'utilisateur, non commencée** : réorganisation plus
large des Paramètres du Compte façon Zoho Books (groupes Entreprise /
Documents & PDF / Sécurité & Données / Compte), déplacement de l'échéancier
de paiement dans l'onglet Documents & PDF.

---

## 🪟 26. Paramètres du Compte : une seule fenêtre, et un faux diagnostic retiré (2026-08-20)

Signalé par l'utilisateur : « une vraie anomalie sur les vues, je voudrais
que tout soit sur une seule page même format, et il y a des options non
utiles présentes ici ».

### 26.1 L'anomalie : des onglets qui n'en étaient pas

« Audit & Sécurité » et « Diagnostic » ne changeaient pas d'onglet : ils
**fermaient** la fenêtre Paramètres (`setIsCompanyModalOpen(false)`) pour en
ouvrir une **autre**, de taille et de structure différentes —
`max-w-4xl` pour l'audit, `max-w-lg` pour le diagnostic, contre `max-w-lg`
pour les Paramètres. D'où les 4 formats visibles sur les captures.

Corrigé : les deux modales sont devenues des **panneaux sans coque**
(`AuditLogPanel`, `SystemDiagnosticPanel`) rendus dans la fenêtre
Paramètres. La coque est passée en `max-w-3xl h-[85dvh] flex flex-col`
(hauteur figée pour qu'aucun onglet ne fasse sauter la fenêtre, contenu
défilant à l'intérieur, pied de page commun à la même position).

`AuditLogViewerModal` et `HealthCheckModal` supprimés, ainsi que les états
`isAuditModalOpen`/`isHealthModalOpen`. La pastille d'état du header, seul
autre point d'entrée du diagnostic, ouvre désormais les Paramètres sur
l'onglet Diagnostic.

**Mesuré en direct** : 768 × 839 px **identiques sur les 5 onglets** (avant,
la fenêtre disparaissait au profit d'une autre). Mobile 375px : 343px de
large, aucun débordement horizontal sur aucun des 5 onglets.

### 26.2 Le Diagnostic affichait de faux résultats (Règle d'Or #3)

Même famille que les violations du § 16.1. Sur les 5 « contrôles »,
**4 étaient des `status: 'OK'` codés en dur**, jamais mesurés :

| Contrôle | Réalité |
| :--- | :--- |
| « v18.2 Production, 0 fuite mémoire » | Rien ne mesure de fuite mémoire ; la version était écrite en dur, pas lue sur React |
| « SafeMathEvaluator actif (zéro eval) » | Affirmation jamais vérifiée à l'exécution |
| « IndexedDB / LocalStorage opérationnel » | **L'app n'utilise IndexedDB nulle part** — cette ligne était la seule occurrence du mot dans tout le code — et rien ne testait que le stockage répondait |
| « Base de Données & Stockage Isolé » | Compteurs réels, mais statut `OK` inconditionnel |
| « Connectivité Cloud » | Le seul réellement mesuré (isOnline / sbUser) |

Les deux contrôles purement techniques ont été **retirés** (sans intérêt
pour un artisan BTP, et faux de surcroît). Les trois restants sont
reformulés en langage métier et **réellement mesurés** — dont la sauvegarde
locale, désormais testée par une vraie écriture/lecture/suppression.

> **Vérifié par sabotage volontaire** : en remplaçant `Storage.prototype.setItem`
> par une fonction qui lève une exception, le contrôle bascule bien sur
> « PROBLÈME — Sauvegarde locale indisponible » ; il repasse à « OK » une fois
> `setItem` restauré. L'ancien code affichait « OK » dans les deux cas.

**Non vérifié en direct** : la pastille d'état du header qui ouvre l'onglet
Diagnostic — elle est masquée en Mode Démo (conséquence voulue du retrait du
badge « Démo locale », § 23), donc non atteignable dans l'environnement de
test. Le câblage est correct par lecture du code mais n'a pas été exercé.

40/40 npm test.

---

## 📄 27. Étude de prix interne imprimable + accès par rôle (2026-08-20)

Demande de l'utilisateur : pouvoir sortir en PDF un document interne complet
(métré, décomposition, prix & marge) **pour valider un devis avant de
l'envoyer au client**, dans un SaaS destiné à plusieurs profils.

### 27.1 Le principe retenu : deux axes, pas une liste de modèles

Plutôt qu'une liste de gabarits ("Standard", "Détaillé"…) où chacun
re-déciderait s'il montre la marge, deux axes croisés :

- **Destinataire** — `client` (jamais de coût, coefficient ni marge) /
  `interne` (tout permis). C'est une **règle de sécurité écrite à un seul
  endroit**, pas répétée dans chaque gabarit : ajouter une mise en page plus
  tard n'ouvre aucun risque de fuite de marge.
- **Niveau de détail** — synthèse (une ligne par ouvrage) / détaillé (chaque
  matière et main-d'œuvre).

| | Synthèse | Détaillé |
| :--- | :--- | :--- |
| **Client** | Devis commercial *(existant)* | Devis détaillé — **à faire** |
| **Interne** | — | **Étude de prix — livrée ici** |

### 27.2 Bug trouvé en préparant : la vue interne imprimait une page blanche

`#printArea` n'existait que sur la branche commerciale, et la feuille de
style d'impression masque tout le reste (`body * { visibility: hidden }`).
En « Vue Interne », le bouton *Imprimer* était bien présent et **sortait une
page blanche**. Vérifié en direct avant correction (`printAreaExiste: false`
avec le bouton visible), puis après (`true`).

### 27.3 Ce qui est livré

La vue interne était un **tableau de bord de cartes**, pas un document. Elle
devient un vrai A4 imprimable :

- Bandeau **DOCUMENT INTERNE — NE PAS TRANSMETTRE AU CLIENT**
- En-tête entreprise / client / chantier / n° de devis
- **Par lot** : le métré réel (via `formatItemMetre`, § 23) puis la
  décomposition ligne à ligne — poste, quantité nette, taux de perte,
  conditionnements achetés, coût unitaire, coût total, sous-total déboursé
- **Prix & marge** : déboursé → frais généraux → prix de revient → marge
  (valeur et %) → **coefficient de vente K**, face aux montants facturés
- **Points à vérifier avant envoi** : vente à perte, stock insuffisant (§ 24),
  ligne libre sans coût d'achat (marge non fiable). Calculés depuis le devis,
  le bloc n'apparaît pas s'il ne se déclenche pas.
- **Double visa** : « Étude vérifiée par » / « Bon pour envoi au client »

Libellés de la bascule clarifiés : « Étude de prix (interne) » / « Devis client ».

### 27.4 Accès par rôle, configurable

L'étude expose coûts, coefficient et marge — or la bascule était offerte à
**tous les rôles, y compris `viewer`**. Désormais réservée aux rôles
autorisés, réglables dans Paramètres → Documents & PDF (défaut : `admin`,
comme demandé).

> `owner` a **toujours** accès et n'est pas listé dans les cases à cocher :
> il est le seul à pouvoir modifier cette liste, l'y inclure permettrait de
> se verrouiller hors de ses propres documents.

Gardé aux **trois** points d'entrée (bascule de l'aperçu, bouton œil de la
liste, bouton de la carte mobile) **plus** un garde-fou au rendu
(`isCommercialMode || !canViewInternalDocs`), pour qu'un état hérité ne
puisse pas afficher l'étude à un rôle non autorisé.

Colonne `company_settings.internal_doc_roles` (jsonb, nullable,
`v6_internal_doc_roles.sql`). NULL = non configuré → défaut applicatif
`['admin']` ; un tableau vide reste une valeur légitime et distincte.
**Appliqué et vérifié par round-trip réel sur staging**, données de test
supprimées. **Production non modifiée**, SQL prêt.

**Vérifié en direct** : document imprimable rendu (`printAreaExiste: true`),
chiffres cohérents (92 190 + 39 510 = 131 700, K = 1.500), alerte de stock
reprise automatiquement, cases à cocher persistées dans les deux sens
(`['admin']` ↔ `['admin','estimator']`). 40/40 npm test.

**Non vérifié** : le blocage réel pour un rôle non autorisé — le Mode Démo
n'expose que le rôle `owner`, qui passe toujours par conception. La logique
est correcte par lecture et gardée à quatre endroits, mais n'a pas été
exercée avec un compte `viewer` ou `commercial` réel.

### 27.5 Suite convenue avec l'utilisateur

1. **Devis détaillé client** (chaque poste au prix de **vente**, marge
   invisible, somme égale au total du devis) + sélecteur de modèle.
2. **Facturation** — chantier à part entière : numérotation distincte des
   devis, mentions légales, statut de paiement. Proposition dédiée à faire
   avant de coder.

---

## 🧾 28. Devis détaillé client + choix du gabarit (2026-08-20)

Point 1 de la suite convenue au § 27.5. Complète la matrice de l'§ 27.1 :
la case **Client × Détaillé** est désormais livrée.

### 28.1 Le point délicat : répartir sans faire dériver le total

Le client doit voir chaque poste **au prix de vente** — jamais un coût
d'achat, un coefficient ni une marge. Le prix de vente du lot est donc
réparti sur ses lignes au prorata de leur coût (`distributeLotSalePrice`,
`js/utils.js`), ce qui revient à appliquer le coefficient de vente du lot
ligne à ligne.

> **Le piège est l'arrondi.** Arrondir chaque ligne indépendamment fait
> dériver la somme de quelques FCFA : un client qui additionne la colonne
> tomberait sur un chiffre différent du total annoncé — et c'est exactement
> le genre de détail qui fait perdre la confiance sur un devis. L'écart
> résiduel est donc reporté sur la ligne la plus importante, où il est
> proportionnellement le plus faible. La somme retombe **exactement** sur le
> prix de vente du lot, par construction.

**Testé isolément avant tout affichage** (`scratch/test_repartition_vente.mjs`,
13/13) : cas réel à 7 lignes, arrondis hostiles (13 lignes, montants premiers,
coefficient irrationnel), ligne unique, vente à perte, cinq cas dégénérés
(déboursé nul, prix nul, aucune ligne, `undefined`, lignes à coût nul → tous
`null`, jamais d'exception), ajustement < 1 FCFA par ligne, entrée non mutée.

### 28.2 Ce qui est livré

- Tableau client détaillé, **groupé par nature** (Fournitures & matériaux /
  Main-d'œuvre / Installation…) plutôt qu'une liste à plat, avec sous-total
  par lot.
- **Sélecteur Synthèse / Détaillé** dans l'aperçu (visible seulement sur le
  devis client — il n'a pas de sens sur l'étude interne, détaillée par nature).
- **Défaut réglable** dans Paramètres → Documents & PDF ; le sélecteur de
  l'aperçu est un choix ponctuel qui ne touche pas au réglage global (même
  logique que Zoho Books).
- Repli silencieux sur la synthèse pour un devis antérieur à l'enregistrement
  du détail, plutôt qu'un tableau vide.
- Colonne `company_settings.client_quote_template`
  (`v6_client_quote_template.sql`, TEXT nullable, sans défaut SQL).
  **Appliquée sur staging.** Production non modifiée, SQL prêt.

### 28.3 Vérifications en direct

| Contrôle | Résultat |
| :--- | :--- |
| Somme des 7 postes affichés = Net HT du devis | **131 700 = 131 700** |
| Somme des sous-totaux de lot = Net HT | 131 700 = 131 700 |
| Les deux gabarits annoncent le même total | Oui |
| Prix de vente ligne à ligne | 18 000 × 1,5 = 27 000 ; 9 000 × 1,5 = 13 500 ; 10 800 × 1,5 = 16 200 ; 21 000 × 1,5 = 31 500 |
| **Aucune fuite de coût** — recherche de « déboursé », « marge », « coefficient », « coût », et des valeurs 87 800 / 39 510 / 92 190 / 1.500 dans le document client | **0 occurrence** |

> **Corrigé au passage** : les titres de lot affichaient « Lot 1 — Lot 01 —
> Installation… », le nom par défaut étant déjà numéroté. `formatLotHeading`
> ne numérote plus que si l'utilisateur a renommé le lot sans reprendre de
> numéro. Corrigé dans les deux documents (client détaillé et étude interne).

### 28.4 Reste au programme

**Facturation** (§ 27.5 point 2) — chantier à part entière : numérotation
distincte des devis, mentions légales, statut de paiement. Proposition dédiée
à faire avant de coder.

---

## 🧮 29. TVA configurable & exonération (2026-08-20)

Prérequis de la facturation (§ 27.5 point 2). Demande de l'utilisateur :
« me donner le pouvoir de l'ajouter ou pas, et aussi dans le setting choisir
les règles qui peuvent varier 18, 10 ou 20 % ».

### 29.1 Constat : la TVA n'était modifiable nulle part

Dans l'éditeur de devis principal (l'écran réellement utilisé),
`hybridQuote.vatRate` était **lu** avec un repli `|| 18`, mais **aucun champ
ne permettait de le changer** — le seul champ TVA vivait dans l'ancien
calculateur V5, hors du parcours courant. Un devis exonéré ou à taux réduit
était donc impossible à établir.

### 29.2 Livré

- **Sélecteur de TVA là où elle s'affiche** — dans la barre de totaux du
  devis, à l'endroit où le montant était déjà présenté. Options « 20% / 18% /
  10% / Exonéré », alimentées par les réglages.
- **Taux réglables** dans Paramètres → Documents & PDF : ajout, retrait, avec
  garde-fou (impossible de descendre à zéro taux, le sélecteur n'aurait plus
  d'option).
- **Mention d'exonération** paramétrable, imprimée sur le document client
  lorsque le taux retenu est 0 % — à la place d'une ligne « TVA (0%) : +0 »
  qui n'informe de rien.
- Colonnes `company_settings.vat_rates` (jsonb) et `vat_exemption_note`
  (`v6_vat_settings.sql`). **Appliquées sur staging.** Production non modifiée.

> **Robustesse du sélecteur** : le taux effectivement porté par un devis est
> toujours ajouté à la liste des options, même s'il a été retiré des réglages
> depuis. Sans ça, le `<select>` afficherait une valeur absente de ses options
> et retomberait silencieusement sur la première — **changeant le total d'un
> devis existant à sa simple ouverture**.

### 29.3 Deux régressions introduites par ce changement, trouvées et corrigées

**a) Le zéro traité comme absent.** Première vérification en direct : le
montant tombait bien à 0, mais l'étiquette affichait encore « TVA (18%) ».
Cause : `vatRate || 18` — un taux à **0 est falsy**, donc silencieusement
remplacé par 18. Le motif était présent **9 fois** (7 dans `calc-engine.js`,
2 dans `index_jsx.js`) ; il ne se voyait pas tant que 0 % n'était pas une
valeur possible. Tous remplacés par un test d'absence explicite
(`!== undefined ? … : 18`). Vérifié après correction : « TVA : Exonéré » suivi
de la mention, plus aucune trace du 18 %.

**b) Le banc d'essai financier.** `readFinancials` (harness) lisait le montant
de TVA sur la **ligne suivant** le libellé ; le sélecteur s'intercalant, il
lisait « 18% » au lieu du montant → 39/40. L'assertion testée
(« TVA affichée ≈ TTC − NetHT ») est légitime et **reste inchangée** : seule
l'extraction a été rendue robuste (recherche du premier montant en devise
après le libellé, au lieu d'un décalage d'une ligne). 40/40 rétabli.

### 29.4 Vérifié en direct

| Contrôle | Résultat |
| :--- | :--- |
| Sélecteur présent avec les taux réglés | 18% / 10% / Exonéré |
| Ajout d'un taux 20 % depuis les réglages | `[18,10,0,20]`, remonte dans le devis |
| Net HT stable quel que soit le taux | 109 706 dans les 3 cas |
| TTC à 18 % | 129 453 (= 109 706 × 1,18) |
| TTC à 10 % | 120 677 (= 109 706 × 1,10) |
| TTC exonéré | 109 706 = Net HT |
| Document client exonéré | « TVA : Exonéré » + mention légale, aucun « 18% » |

### 29.5 Suite

Le socle de facturation (tables `invoices`, numérotation serveur `FACT-AAAA-NNN`
renvoyée au client, conversion depuis un devis accepté, immuabilité à
l'émission) reste à faire — c'est le bloc suivant.

---

## 🧾 30. Socle de facturation — couche données (2026-08-20)

§ 27.5 point 2. **Couche données uniquement** : schéma, garanties légales et
émission. L'interface (conversion depuis un devis, liste, PDF) reste à faire.

Fait avant l'interface délibérément : les garanties légales vivent ici, et
les découvrir après coup aurait imposé de tout reprendre.

### 30.1 Trois contraintes légales, trois décisions de structure

| Contrainte | Décision |
| :--- | :--- |
| Numérotation continue, **sans trou** | Le numéro n'est **pas** attribué à la création mais à l'**émission** (`issue_invoice_v6`), avec verrou de ligne. Un brouillon porte `invoice_number = NULL` ; supprimé, il ne consomme aucun numéro. Plusieurs NULL cohabitent sous la contrainte UNIQUE, deux factures émises jamais. |
| Facture émise **immuable** | Garanti par **trigger en base**, pas par l'interface : une règle écrite seulement côté client se contourne. Montants, numéro, identité, taux et date d'émission figés ; seuls règlement et annulation restent permis. |
| Correction par **avoir** | `invoice_type = 'avoir'` + `corrects_invoice_id` vers la facture rectifiée. |

### 30.2 Le défaut des devis, corrigé ici

`create_quote_v6` génère un numéro serveur mais **ne le renvoie pas** (elle
retourne l'id seul) : le client garde son numéro calculé localement, et les
deux peuvent diverger. Anodin sur un devis, rédhibitoire sur une facture.
`issue_invoice_v6` renvoie donc explicitement `{invoice_id, invoice_number,
issued_at}`.

### 30.3 Livré

`organization_invoice_sequences`, `invoices`, `invoice_lines`, deux triggers
de protection, `issue_invoice_v6`, RLS complète (`v6_invoices.sql`).
Types de facture : `standard`, `acompte`, `situation`, `solde`, `avoir` —
`deducted_ttc` / `net_to_pay_ttc` prévus pour la déduction d'acompte sur le
solde (usage BTP). **Appliqué sur staging. Production non modifiée.**

### 30.4 Vérifié par SQL réel sur staging

Tests exécutés en `service_role`, c'est-à-dire **en attaquant la base
directement, sans passer par l'application** — ce qui prouve que les
protections ne sont pas contournables depuis le client.

| Test | Résultat |
| :--- | :--- |
| Émission sans droit | **Refusée** — « seuls le propriétaire et un administrateur… » |
| Modifier un brouillon | Autorisé |
| Supprimer un brouillon | Autorisé |
| Modifier le **montant** d'une facture émise | **Refusé** par trigger |
| Modifier le **numéro** d'une facture émise | **Refusé** par trigger |
| **Supprimer** une facture émise | **Refusé** — « émettez un avoir » |
| Modifier une **ligne** d'une facture émise | **Refusé** par trigger |
| Enregistrer un **règlement** | Autorisé (seule évolution permise) |
| Numérotation : 3 émissions, un brouillon jeté, puis une émission | **001 → 002 → 003 → 004**, aucun trou |

Données de test supprimées ensuite ; staging revérifié à 0 ligne.

> **Non vérifié : `issue_invoice_v6` de bout en bout.** La fonction exige une
> session authentifiée (`has_org_permission` → `auth.uid()`), et staging ne
> contient aucun utilisateur. Le **garde-fou** a bien été éprouvé (l'appel
> non authentifié est refusé), et le **mécanisme de numérotation** l'a été
> par une reproduction verbatim de son corps ; mais le chemin complet
> « utilisateur admin connecté → émission → numéro renvoyé » ne le sera
> qu'une fois l'interface faite, depuis le navigateur avec un vrai compte.

### 30.5 Reste à faire

Interface : conversion d'un devis accepté en facture, liste des factures,
PDF (entre dans l'architecture du § 27.1 comme document
`destinataire = client`, héritant logo, pied de page et gabarits), puis
acompte/situation et suivi des règlements.

---

## 🖥️ 31. Facturation — interface (2026-08-20)

Suite du § 30 (couche données). L'utilisateur peut désormais facturer.

### 31.1 Livré

- **Entrée « Factures »** dans la navigation (sidebar, rail replié, tiroir mobile).
- **Création depuis un devis enregistré** : reprend client, chantier, lignes
  commerciales et taux de TVA. Un devis déjà facturé disparaît de la liste
  des devis facturables — pas de double facturation par inadvertance.
- **Émission** avec confirmation explicite rappelant l'irréversibilité. Le
  numéro n'est attribué qu'à ce moment (§ 30.1).
- **Document facture** : entre dans l'architecture du § 27.1 comme document
  `destinataire = client`. Il **hérite donc** du logo (§ 25), du pied de page
  et de la mention d'exonération (§ 29) sans rien redéfinir. Aucun coût
  d'achat ni marge n'y figure.
- **Contrôle des mentions légales avant émission** : réutilise
  `getMissingLegalFields`, déjà exigé avant l'envoi d'un devis, plutôt qu'un
  second contrôle qui pourrait diverger. Renvoie l'utilisateur sur l'onglet
  Entreprise si NIF/RCCM manquent.

### 31.2 Deux niveaux de garantie, annoncés à l'utilisateur

| | Cloud | Mode Démo |
| :--- | :--- | :--- |
| Numérotation | Serveur, verrou de ligne, **sans trou** | Calculée sur l'appareil |
| Facture émise | **Figée par trigger** en base | Rien n'est verrouillé |

Le Mode Démo affiche un bandeau explicite : « factures sans valeur légale ».
Prétendre le contraire serait pire que de l'annoncer.

### 31.3 Un brouillon n'est pas imprimable

`id="printArea"` n'est posé que sur une facture **émise**. Un brouillon
n'ayant pas de numéro légal, il ne doit pas pouvoir être imprimé puis
confondu avec une facture réelle. Le bouton *Imprimer* est également absent,
et un bandeau annonce « Brouillon — pas encore une facture ».

### 31.4 Vérifié en direct (Mode Démo)

| Étape | Résultat |
| :--- | :--- |
| Création depuis DEV-2026-002 | Brouillon, `numero: null`, 1 ligne, 131 700 HT / 155 406 TTC — identiques au devis |
| Aperçu du brouillon | Bandeau « Brouillon », **pas de `printArea`**, pas de bouton Imprimer |
| Émission | `FACT-2026-001`, statut `issued`, date d'émission posée |
| Liste après émission | Statut « Émise », **cadenas** à la place d'Émettre/Supprimer |
| Devis d'origine | Retiré de la liste des devis facturables |
| Aperçu après émission | `printArea` présent, bouton Imprimer, « N° : FACT-2026-001 », « Émise le 20/08/2026 » |
| Héritage documentaire | Logo et pied de page (mentions légales + RIB) repris automatiquement |

40/40 npm test, console sans erreur.

### 31.5 Reste à faire

- **Écriture cloud des factures** : aujourd'hui l'état est local (comme
  `savedQuotes`, § 23.3). `InvoiceService.emettre` appelle bien
  `issue_invoice_v6` en mode cloud, mais la facture n'est pas encore
  **créée** côté serveur — il manque l'insertion dans `invoices` /
  `invoice_lines` et la relecture au chargement. Tant que ce n'est pas fait,
  les garanties du § 30 ne s'appliquent pas en pratique.
- Acompte / situation (`invoice_type`, `deducted_ttc` déjà prévus en base).
- Suivi des règlements et avoirs.

---

## 📥 32. Bouton « Télécharger le PDF » (2026-08-20)

Jusqu'ici, obtenir un PDF passait par « Imprimer » → boîte de dialogue du
navigateur → « Enregistrer en PDF » : trois étapes, et un résultat qui dépend du
navigateur de l'utilisateur. Le bouton direct manquait.

### 32.1 Chargement paresseux, et pourquoi

jspdf (410 Ko) + html2canvas (194 Ko) = **604 Ko**, soit **plus que l'application
entière** (434 Ko). Les charger au démarrage aurait ralenti tous les écrans pour une
fonction utilisée sur deux. `chargerLibsPdf()` (`js/utils.js`) les injecte au premier
clic depuis `vendor/` (déjà dans la liste blanche de `scripts/build-dist.mjs`).

Vérifié en direct : `{jspdf: false, html2canvas: false}` au chargement de la page,
`{jspdf: true, html2canvas: true}` après le premier clic.

### 32.2 Le piège de la largeur de capture

html2canvas capture à la **largeur d'affichage**, pas à une largeur de document. Un
`#printArea` affiché à 289 px sur un téléphone donnait un PDF comprimé ; un panneau
navigateur replié (viewport 0×0) a produit un canvas de **132 px de large** — un PDF
valide, mais une bande illisible. Un fichier qui s'ouvre n'est pas un fichier correct :
c'est la mesure du canvas qui l'a révélé, pas l'ouverture du PDF.

Correctif : largeur forcée à **800 px** (~A4 à 96 dpi) dans le `onclone` de html2canvas,
donc **sur le clone hors écran** — rien ne bouge à l'écran pour l'utilisateur. Les
ancêtres du clone sont dé-contraints (`overflow`, `max-height`, `height`) car la modale
défilante tronquait le document à sa seule partie visible.

| Écran | `#printArea` affiché | Canvas produit |
|---|---|---|
| Mobile 375 px | 289 px | **1600×1984** |
| Desktop 898 px | 812 px | **1600×1984** |

Sortie identique : le PDF ne dépend plus de l'appareil.

### 32.3 Vérifié en direct

- Bouton réel cliqué, toast « PDF téléchargé », en-tête `%PDF-` présent.
- Contenu non tronqué (`scrollHeight` = `offsetHeight`).
- Découpage multi-pages exercé sur un document de 710 mm : **3 pages attendues,
  3 obtenues**.
- `npm test` : 40/40, étalons A–G conformes.

### 32.4 « Imprimer » est conservé, volontairement

html2canvas **rastérise** : le PDF téléchargé est une image, son texte n'est pas
sélectionnable et le fichier est plus lourd (≈ 160 Ko pour une facture d'une page,
1,4 Mo pour trois pages denses). L'impression navigateur produit un PDF **vectoriel**,
plus léger et au texte sélectionnable. Les deux voies gardent leur intérêt : le bouton
pour la rapidité, « Imprimer » pour la qualité. C'est un compromis assumé, pas un oubli.

### 32.5 Reste à faire

- PDF vectoriel natif (texte sélectionnable) sans passer par la rastérisation — chantier
  nettement plus lourd : reconstruire chaque document en primitives jspdf.

---

## 🏢 33. Marque et favicon (2026-08-21)

Logo définitif fourni par l'utilisateur : immeubles au trait avec une coche
intégrée, plus le mot-symbole « ikadevis ». Il remplace le logo provisoire
(carré rouge, triangle et cercle) qui n'était pas la marque du produit.

### 33.1 Trois problèmes réglés au passage

**a) L'ancien logo dépendait d'une police jamais chargée.** `LogoSVG` composait
« ikadevis » avec des `<text>` en **Inter**, police absente de l'application :
le navigateur substituait systématiquement. Le logo ne s'est donc **jamais**
affiché comme prévu. Le nouveau mot-symbole est vectorisé — plus aucune
dépendance.

**b) L'écran de connexion n'affichait pas le logo.** Il montrait une icône
décorative (triangle + cercle dans un carré en dégradé rouge) sans rapport avec
la marque, et le nom en texte à côté. Remplacé par le logo, en blanc ; le `<h1>`
disparaît, le mot-symbole étant déjà dans le tracé.

**c) L'application n'avait aucun favicon.** `favicon.ico` existait mais faisait
**0 octet** et n'était référencé nulle part — l'onglet portait l'icône générique
du navigateur. `favicon.svg` s'adapte désormais au thème du navigateur (sombre
sur chrome clair, blanc sur chrome sombre : un favicon noir disparaît dans une
barre d'onglets sombre).

### 33.2 Choix techniques

| Décision | Pourquoi |
|---|---|
| `fill="currentColor"` | Le logo hérite de la couleur de son conteneur. Aucune couleur en dur → blanc à la connexion, `neutral-900` sur fond clair. Le fichier fourni est monochrome ; **aucune bichromie n'a été inventée**. |
| viewBox recadré au plus juste | Le fichier source laisse ~20 % de vide autour du tracé. Sans recadrage (mesuré au `getBBox`), `h-8` n'aurait donné que **25 px** de marque visible au lieu de 32. |
| Commentaires Illustrator retirés | `<!-- Generator: Adobe Illustrator -->` est un commentaire HTML, **invalide en JSX** — le build échouait. |
| `assets/` dans `A_PUBLIER` | Le garde-fou de `build-dist.mjs` refuse tout `index.html` référençant un fichier absent de `dist/`. |

### 33.3 Les trois fichiers reçus

| Fichier | État |
|---|---|
| `Logo ikamovie 1.svg` | ✅ horizontal, propre — source du logo de l'app |
| `Logo ikamovie.svg` | ✅ carré (icône au-dessus du mot-symbole), propre |
| `Logo ikamovie.3.svg` | ⚠️ **export cassé** : contenu de 618×448 dans un `viewBox` de 212×212, débutant à `y = -257`. Il contient deux copies parasites hors du cadre. **Non utilisé.** |

> Les noms de fichiers disent « ikamovie » alors que le tracé dit « ikadevis » —
> simple artefact de nommage, sans conséquence. Les originaux sont conservés
> dans `Logo ikamovie/`, les déclinaisons exploitables dans `assets/`.

### 33.4 Vérifié en direct

| Point d'usage | Rendu mesuré |
|---|---|
| Barre latérale desktop | 103 × 32 |
| Tiroir mobile | 103 × 32 |
| Barre du haut mobile | 90 × 28 |
| Écran de connexion | 154 × 48, en blanc |

`favicon.svg` et les trois assets servis en **HTTP 200**, type `image/svg+xml`.
`build:dist` : 13 références, toutes présentes. `npm test` : 40/40, étalons A–G.

---

## 🔵 34. Passage du thème primaire au bleu (2026-08-21)

Le rouge `#e6222b` cède la place au bleu. Demande utilisateur : logo et
couleurs primaires en bleu.

### 34.1 Le choix du bleu a été mesuré, pas fait à l'œil

Le candidat évident était le bleu déjà présent dans la barre latérale.
Il ne tient pas :

| Candidat | Contraste sur blanc | Verdict |
|---|---|---|
| `#4b8df8` — bleu de la sidebar | 3,25:1 | ❌ sous le seuil AA (4,5:1) |
| `#3b82f6` — blue-500 Tailwind | 3,68:1 | ❌ |
| **`#2563eb`** | **5,17:1** | ✅ retenu |
| `#e6222b` — l'ancien rouge | 4,54:1 | *(tout juste passant)* |

Le seuil AA de 4,5:1 s'applique parce que le texte des boutons fait 14 px en
graisse 700 — trop petit pour bénéficier du seuil « grand texte » (3:1).
**Le bleu retenu contraste donc mieux que le rouge qu'il remplace.**

Sur fond sombre, `brand-500` retombe à 3,45:1 : c'est `brand-400` (`#60a5fa`,
7,02:1) qui porte le logo à l'écran de connexion, et la même règle s'applique
au favicon.

### 34.2 Ce qui a changé, et ce qui n'a pas changé

**Changé** — l'échelle `brand` dans `tailwind.config.js` : les **424** usages de
`brand-*` suivent d'un coup, c'est tout l'intérêt du jeton. Plus les valeurs en
dur : focus des champs, bouton principal et son ombre teintée, liseré de
l'onglet actif, calepinage 2D ACM, dégradés de la connexion et du chargement
(la teinte `#1a0505`, rouge très sombre, devient `#0a1a3a`).

`--sidebar-active` passe de `#4b8df8` à `#2563eb`. Ce bleu à part existait
parce que la marque était rouge ; deux bleus différents côte à côte n'avaient
plus lieu d'être.

**Non changé — les 116 usages de `red-*`.** Vérifiés un par un : erreurs de
formulaire, boutons de suppression, marges en perte (`margin.isLoss`), alertes
de stock, diagnostics en panne. Ce sont des rouges **sémantiques**. Les
repeindre aurait supprimé le signal de danger et les aurait rendus
indiscernables de la nouvelle couleur primaire. `.btn-icon:hover` reste rouge
pour la même raison.

> Règle à retenir pour la suite : `brand-*` = identité, se change d'un bloc ;
> `red-*` = danger, ne se touche pas.

### 34.3 Un reste de l'ancien logo trouvé au passage

Le **rail tablette** (768–1023 px) affichait encore l'ancien logo codé en dur —
un carré rouge avec triangle et cercle — manqué lors du changement de marque
(§ 33). Remplacé par `IconeSVG`, l'icône seule de la vraie marque : le rail fait
72 px de large, trop étroit pour le logo complet.

### 34.4 Vérifié en direct

| Élément | Valeur mesurée |
|---|---|
| Bouton principal | `rgb(37, 99, 235)` |
| Logo | `rgb(37, 99, 235)` |
| Item de barre latérale actif | `rgb(37, 99, 235)` |
| Titre et TOTAL TTC du document | `rgb(29, 78, 216)` |
| Survol de suppression | `rgb(254, 226, 226)` / `rgb(220, 38, 38)` — **toujours rouge** |
| `#e6222b` résiduel dans le DOM | **0** |

`npm test` : 40/40, étalons A–G conformes.

---

## 🎨 35. Passe d'interface du 2026-08-21

Six changements demandés sur captures annotées. Tous mesurés dans le DOM avant
correction — aucun n'a été fait « à l'œil ».

### 35.1 Direction visuelle « Encre »

Le bleu `#2563eb` était jugé trop agressif. Quatre directions ont été maquettées
côte à côte sur un même fragment ; « Encre » a été retenue. **Le problème n'était
pas seulement la teinte** :

| Traitement | Avant | Après |
|---|---|---|
| Ombres des boutons | halo bleu (11 occurrences) | neutres |
| Graisses de police | 93 × `font-black` (900), 114 × `font-extrabold` (800) | 700 et 600 |
| Item de menu actif | aplat bleu plein de 52 px | fond `#eef1f8` + liseré 2 px |
| Action principale | bleu | **encre `#111827`** |

`brand` reste bleu mais devient un **accent** (500 = `#3b5bdb`, 600 = `#2f49b0`).
Les titres de document et les totaux repassent à l'encre : le bleu quitte les
plus gros caractères de l'écran. `font-bold` (700) est conservé — tout aplatir
aurait supprimé la hiérarchie au lieu de l'assainir.

Contrastes : blanc sur encre **17,74:1** · accent 500 **5,67:1** · accent 600
**7,78:1** · menu actif **12,50:1**. Tous meilleurs que l'ancien bleu (5,17:1).

### 35.2 Deux barres d'outils refondues en deux bandes

**Document** — 7 contrôles réclamaient 920 px dans une modale de 896. Le bouton
« Imprimer » (130 px) était poussé **hors du cadre** : `overflow-hidden` le
masquait, la fonction avait disparu sans le moindre signe. Bande 1 = identité +
actions, bande 2 = destinataire / niveau de détail, chacun avec son intitulé.

**Espace de chiffrage** — « Nom du client » et « Chantier » tombaient à **108 px**,
libellés coupés en plein milieu. Bande 2 leur rend **395 px** chacun. L'en-tête
est au passage plus compact : 82 px contre 109 (et 72 contre 215 en mobile).

### 35.3 Redondances supprimées

- La barre de totaux dupliquait « Aperçu » et « Enregistrer ». L'en-tête étant
  `position: sticky` (vérifié : reste à 104 px après défilement complet), ces
  copies ne servaient à rien et forçaient la barre sur deux lignes. Passées en
  `sm:hidden` : la barre tombe de **135 px à 77 px**, de 16 % à 9 % de l'écran.
- « + Nouveau Devis » et « Enregistrer » étaient tous deux primaires. Le second
  demandait `bg-neutral-900` — **code mort**, `.btn-primary` l'écrasait.

### 35.4 Confirmations

Un système `confirmDialog` existait (16 usages). Ajouts :

| Point de sortie | Garde |
|---|---|
| Fermeture d'onglet / rechargement | `beforeunload` |
| Déconnexion | dialogue (3 boutons sur 4 — le 4e est l'écran de blocage) |
| Suppression d'un lot | nomme le lot et le nombre d'ouvrages perdus |
| Duplication d'un lot / d'un devis | annonce la conséquence chiffrée |

> **Vérifié avant d'écrire la garde** : le devis en cours n'est écrit dans
> **aucune** clé de localStorage. Témoin de saisie disparu après rechargement.
> Fermer l'onglet perdait tout le chiffrage, sans un mot.

Le dialogue lui-même avait deux défauts : icône **bleue sur fond rouge** en mode
danger, et bouton de confirmation bleu même pour une suppression — une action
destructrice ressemblait à une action anodine.

Non gardés **volontairement** : la navigation interne (vérifié, ne perd rien),
la suppression d'un ouvrage (annulation de 6 s déjà en place), la duplication
d'une ligne (fréquente et triviale).

### 35.5 Défilement horizontal

`.app-table { min-width: 600px }` s'appliquait à toutes les tables à toutes les
largeurs. Dans un panneau de 560 px, elle forçait une barre de défilement pour
**40 px** — alors que la table tient dans 560 et que son contenu n'a besoin que
de 486. Cantonnée à `@media (max-width: 767px)`, où elle reste utile.

Vérifié sur cinq écrans : plus aucun débordement horizontal.

### 35.6 Le piège qui revient — à ne plus redécouvrir

**Quatre fois en deux jours.** Les classes déclarées dans le `<style>` de
`index.html` chargent **après** `tailwind.css` et gagnent à spécificité égale :

- `.app-label` fixe `margin-bottom` et `display: block` → `mb-0` sans effet ;
- `.btn-primary` fixe `background-color` → `bg-neutral-900` sans effet ;
- `.btn-primary` / `.btn-secondary` fixent `display: inline-flex` → **`hidden`
  posé sur ces boutons ne les masque pas**.

> Règle : ne jamais poser une utilitaire Tailwind de `display`, de
> `background-color` ou de marge **directement** sur `.btn-primary`,
> `.btn-secondary` ou `.app-label`. Passer par un conteneur, ou par des
> utilitaires seuls sans la classe maison.

### 35.7 Reste à faire

- Le tableau des ouvrages du devis n'utilise pas `.app-table` : cinq colonnes
  fixes consomment 560 px et ne laissent que **120 px** à « Désignation
  Ouvrage », d'où les noms tronqués. L'élargir impose de rétrécir les autres,
  sous peine de réintroduire le défilement — arbitrage à trancher.
- La fiche UI/UX livrée décrit l'état d'avant cette passe (§ 3.4 et § 3.6a
  notamment) : à regénérer.

---

## 🚀 36. Déploiement en production (2026-08-21)

**En ligne : https://ikadevis.officemicro89.workers.dev**

### 36.1 Infrastructure — la question laissée ouverte est tranchée

Le tracker notait au § précédent qu'on ignorait « si Cloudflare Pages a
effectivement redéployé ». Réponse : **ce n'est pas Pages, c'est Cloudflare
Workers en mode Static Assets** (`wrangler.jsonc`, worker `ikadevis`, sert
`./dist`). Aucun code Worker, uniquement des fichiers servis — toute la logique
serveur est chez Supabase.

Le déploiement n'est **pas automatique** : `.github/workflows` ne contient
qu'un job de build et de tests, sans étape de publication. Il faut lancer
`wrangler deploy` à la main.

| | |
|---|---|
| Compte Cloudflare | `officemicro89@gmail.com` |
| Droits du jeton | `workers (write)`, `workers_scripts (write)` — suffisants |
| Commande | `npm run deploy:build` puis `npx wrangler deploy` |

> **Les domaines `ikadevis.com` et `app.ikadevis.com` ne résolvent pas.**
> Vérifié avec un domaine de contrôle pour écarter une restriction
> d'environnement. Seule l'URL `workers.dev` est active.

### 36.2 Contrôles avant publication

- `dist/config.js` ne contient **qu'un seul jeton**, de rôle `anon` — publique
  par conception, protégée par les RLS. Aucune trace de `service_role`.
- 13 ressources référencées par `index.html`, toutes présentes dans `dist/`.
- `config.js` local **remis sur staging** juste après le build de production :
  `deploy:build` le réécrit vers la production, et l'oublier ferait pointer
  l'application de développement sur la vraie base.

### 36.3 Vérifié sur le site en ligne, pas seulement en local

| Contrôle | Résultat |
|---|---|
| Ressources servies | 9/9 en HTTP 200 (bundle, CSS, config, favicon, assets, vendor) |
| Version servie | `v=20260821v` — identique à la version locale |
| Erreurs console | aucune |
| Bouton principal | `rgb(17, 24, 39)` — encre |
| Menu actif | fond `rgb(238, 241, 248)` + liseré `rgb(59, 91, 219)` |
| Barre de totaux | 77 px |
| Défilements horizontaux | **0** |
| Traces de l'ancien logo / rouge | **0** |

### 36.4 Migrations appliquées — 2026-08-21, 18 h

Appliquées par l'utilisateur depuis l'éditeur SQL Supabase (la connexion MCP
de production est en lecture seule : `cannot execute ALTER TABLE in a
read-only transaction`). Requête de contrôle : **6 · 1 · 3 · 1**.

Vérification indépendante, au-delà des compteurs :

| Contrôle | Résultat |
|---|---|
| Colonnes `company_settings` | 7/7, types corrects (`jsonb` pour `internal_doc_roles`, `vat_rates`, `payment_schedule`) |
| `materials.stock_qty` | `numeric`, nullable — NULL = matière non suivie, comme prévu |
| Tables de facturation | 3/3, **RLS activé sur les trois** |
| Déclencheurs d'immuabilité | `trg_protect_issued_invoice`, `trg_protect_issued_invoice_lines` |
| `issue_invoice_v6` | `(p_invoice_id uuid)`, SECURITY DEFINER, `search_path=public` |
| Policies RLS | invoices 4 · invoice_lines 2 · sequences 1 · material_price_history 3 |
| **Colonnes envoyées par `mapCompanyToDb`** | **18/18 présentes** — c'est le contrôle qui décide si l'enregistrement des paramètres fonctionne |

### 36.5 Conseillers de sécurité après migration

`get_advisors(security)` : **aucun problème de niveau ERROR**. Que des WARN,
dont la plupart préexistaient. Deux viennent de cette migration, tous deux
analysés et **non exploitables** :

- `protect_issued_invoice` et `protect_issued_invoice_lines` sont signalées
  comme exécutables par `anon`. Elles retournent le type `trigger` :
  **Postgres refuse toute invocation directe** d'une fonction trigger. Faux
  positif du linter.
- `issue_invoice_v6` est réellement appelable en RPC, y compris par `anon`.
  Mais elle vérifie `has_org_permission` en interne et fixe
  `search_path=public` : un appelant sans droit sur l'organisation est rejeté.

> Hygiène possible plus tard, sans urgence :
> `REVOKE EXECUTE ON FUNCTION public.protect_issued_invoice(),`
> `public.protect_issued_invoice_lines() FROM anon, authenticated;`

### 36.6 Vérifications faites depuis l'extérieur, sans compte

Ces contrôles ne demandent aucune authentification et n'écrivent rien. Ils
ont été menés avec la clé `anon` publique, contre la vraie production.

**Cache de schéma PostgREST — le piège classique après un DDL.** Les colonnes
peuvent exister en base sans que l'API les connaisse : les écritures échouent
alors toujours, avec un `PGRST204`. Vérifié : les **6 nouvelles colonnes sont
reconnues** par l'API, le cache s'est bien rechargé.

**Tables et fonction exposées.** `invoices` et `invoice_lines` répondent en
200. `issue_invoice_v6` est bien atteignable et répond « Facture introuvable »
sur un UUID inexistant — elle est vivante et refuse correctement.

**RLS éprouvées de l'extérieur.** Un visiteur non connecté, muni de la clé
publique :

| Table | Lecture anonyme |
|---|---|
| `company_settings`, `quotes`, `invoices`, `invoice_lines` | 0 ligne |
| `clients`, `materials`, `organizations` | 0 ligne |

Et `POST /invoices` renvoie **401**. Rien n'est lisible ni inscriptible sans
session — les RLS font leur travail en production.

### 36.7 Reste à éprouver dans une session connectée

La structure est vérifiée de bout en bout, mais le parcours connecté n'a pas
été exercé : le tester exigerait de créer un compte ou d'écrire des données
dans la vraie base. À faire depuis
**https://ikadevis.officemicro89.workers.dev** :

1. Enregistrer les paramètres d'entreprise (le chemin qui échouait avant).
2. Renseigner un logo et un pied de page PDF.
3. Changer un taux de TVA, vérifier qu'il tient après rechargement.
4. Émettre une facture depuis un devis, puis vérifier qu'elle devient
   immuable et que la numérotation ne saute pas.

---

## 📱 37. Campagne mobile / PWA & calcul mixte (2026-08-25 → 26)

Deux chantiers menés à la suite, tous deux vérifiés en direct dans le
navigateur puis déployés en production.

### 37.1 Calcul mixte des composants — résolu

Un ouvrage combinant plusieurs méthodes de calcul (cadre au périmètre + bâche
à la surface) était bloqué. Cause et correctif détaillés dans la fiche dédiée
**`REPRISE_CALCUL_COMPOSANTS_2026-08-24.md`** (§11), qui fait foi ; en
résumé :

| Verrou | Correctif |
|---|---|
| `getRecipeFormulaCompatibility` exigeait que **tous** les modes autorisés sachent évaluer la formule | Compatible dès qu'**au moins un** mode y arrive |
| Le menu « Mode de calcul » ne proposait que les formules déjà couvertes par l'ouvrage | Les 5 modes métier sont toujours proposés pour une matière |
| Rien ne suggérait « Périmètre » pour un tube/cadre | `inferMaterialRecipeFormula` déduit le mode de l'unité + du nom |
| Ajouter un composant incompatible ouvrait une boîte de dialogue bloquante | `ensureSolutionModesForFormula` élargit l'ouvrage automatiquement |
| `ALLOWED_VARS_BY_MODE.rectangle` ne portait ni volume ni longueur | Le mode rectangle devient le contexte universel (une seule saisie L × H alimente tous les composants) |

Vérifié au franc près sur deux cas : bâche + cadre (32 175 FCFA) et un ouvrage
combinant **les 5 modes à la fois** (128 913 FCFA), chaque fois égal à la somme
des calculs manuels. Catalogue resté 18/18 conforme.

### 37.2 Campagne mobile — 5 correctifs successifs

Audit écran par écran en viewport 375–390 px (Tableau de bord, Projet, Client,
Créer un Devis, Mes devis, Catalogue, Ressources, Facture, Paramètres), puis
trois passes de redesign sur maquettes fournies par l'utilisateur.

| Commit | Objet |
|---|---|
| `c2d3c39` | Barre d'action mobile : boutons empilés pleine largeur (libellés coupés à deux par ligne) |
| `dd5aa08` | Vraie cause du débordement horizontal du panneau catalogue (voir 37.3) |
| `5b0673b` | Fusion liste des lots ↔ détail (`mobileShowLotList`) ; composants du catalogue en liste compacte |
| `b342248` | Client / Projet / Type en colonne ; **tout menu déroulant devient une page plein écran** |
| `76f8480` | Le détail d'un lot devient une vraie page dédiée |

**Menus déroulants en page plein écran.** Le pattern existait pour le seul
choix d'ouvrage (`.solution-picker-*`). Classes renommées en `.picker-*`
(générique, comportement inchangé) puis appliquées à `ClientCombobox`,
`ProjectCombobox` et surtout **`CustomSelect`** — donc à tous les menus de
l'application d'un seul coup. Ajouter un nouveau menu à ce pattern ne demande
que trois classes : `picker-popover`, `picker-mobile-header`, `picker-results`.
Le `<select>` Type d'activité reste natif : iOS/Android ouvrent déjà leur
propre sélecteur plein écran.

**Détail d'un lot en page dédiée.** Le basculement liste↔détail existait déjà
(`mobileShowLotList`, ajouté en `5b0673b`) mais ne se voyait pas : la bande
d'en-tête du devis restait affichée au-dessus et prenait la moitié haute de
l'écran. Elle se replie désormais tant qu'un lot ou un ouvrage est ouvert —
wrapper en `display: contents` pour que le `<header>` reste l'enfant flex
direct de la coque, sinon son `sticky top-0` casse. `lg:contents` garde le
desktop strictement inchangé.

### 37.3 Quatre pièges de mise en page, tous de la même famille

Tous relèvent du principe déjà documenté au § 4.1 de `REPRISE_SESSION.md` :
**une feuille chargée après `tailwind.css` gagne à spécificité égale**, ou une
propriété CSS crée un contexte que le z-index ne peut pas franchir.

| Piège | Ce qui se passait | Remède |
|---|---|---|
| `.btn-icon` fixe `display: inline-flex` | `lg:hidden` posé sur le bouton restait inopérant — 6 boutons « retour » visibles sur desktop | Porter `lg:hidden` sur un conteneur, jamais sur `.btn-icon` |
| Font Awesome fixe `display: inline-block` sur `.fa-solid` | `sm:hidden` sur une icône chevron restait inopérant | Porter `sm:hidden` sur un `<span>` englobant |
| `items-start` + bloc de texte sans largeur propre | Le bloc prenait la largeur **naturelle** de son contenu (511 px mesuré) au lieu de se contraindre à la carte — `min-w-0` seul ne suffit pas, c'est la largeur du parent qui est en cause | `w-full sm:w-auto` sur le bloc titre |
| `position: sticky` crée **toujours** un contexte d'empilement | Le panneau plein écran (z-190), enfant de l'en-tête sticky du devis (z-30), restait prisonnier sous la barre de navigation (z-40) | L'hôte sticky renonce à son contexte le temps de la sélection (`:has`) |

> Le troisième mérite d'être retenu : le premier correctif (`min-w-0` sur
> `app-card`) réduisait le débordement sans l'éliminer, et l'utilisateur l'a
> signalé une seconde fois en conditions réelles. `min-w-0` traite le
> **min-width de l'enfant** ; ici le problème était la **largeur du parent**.

### 37.4 Reste à faire

1. **Usage réellement hors-ligne** (mode avion) et **installation à l'écran
   d'accueil** jamais éprouvés — seuls le rendu et les interactions en ligne
   l'ont été.
2. Le parcours **connecté** reste non exercé (voir § 36.7) : inchangé.
3. `:has()` demande iOS Safari 15.4+. Sans lui, la barre de navigation
   repasse devant le panneau plein écran — dégradation cosmétique, pas une
   panne.

---

## 📅 38. Brief événement : sorti de la hauteur de l'en-tête (2026-08-26)

### 38.1 Le constat

Signalé par l'utilisateur, capture mobile à l'appui : « le brief événementiel
n'est pas à sa place ». Passer le type d'activité à **Événementiel** faisait
apparaître un panneau de cinq champs — nom, lieu, date, participants,
responsable — **à l'intérieur de l'en-tête `sticky top-0`** du devis.

Mesuré sur un téléphone de 375 px : en-tête 420 px + barre de totaux 230 px +
barre d'onglets 90 px = **740 px sur 812**. La liste des lots — l'objet même de
l'écran — n'avait plus un pixel, et le bas de l'en-tête recouvrait le libellé
« DÉBOURSÉ SEC » de la barre de totaux. Sur desktop, la même section tenait sur
une ligne et ne posait pas de problème : c'est bien un défaut de **hauteur**,
pas de placement logique.

### 38.2 Ce qui a été fait

Le panneau devient **repliable**, avec un résumé d'une ligne comme état
replié :

```
📅 BRIEF ÉVÉNEMENT
   Gala annuel Orange · Hôtel Azalaï · 12/09/2026 · 250 pers. · Awa Traoré  ▾
```

- Le résumé ne liste que les champs **renseignés**, dans l'ordre de lecture du
  formulaire (`eventBriefSummary`). Tant que rien n'est saisi, il invite à
  compléter — un panneau replié et muet ne serait jamais ouvert.
- La date de l'`<input type="date">` est reformatée en `JJ/MM/AAAA`
  (`formatBriefDate`) ; une valeur non parsable est renvoyée telle quelle
  plutôt que d'afficher « Invalid Date » en plein en-tête.
- **Déplié d'office à partir de 1024 px**, replié en dessous. L'état est lu une
  seule fois au montage, volontairement : dès que l'utilisateur a ouvert ou
  fermé le panneau, son geste prime sur un simple changement de largeur
  (rotation de l'écran, apparition du clavier virtuel).
- La puce « Paiement conseillé : 50 / 30 / 20 » reste sur la ligne de résumé à
  partir de `sm:`, et passe au-dessus des champs en dessous — sur 375 px elle
  écrasait le résumé.
- Accessibilité : le bandeau est un vrai `<button>` porteur d'`aria-expanded`
  et d'`aria-controls="event-brief-fields"`.

Résultat mesuré à 375 px : l'en-tête retombe à **230 px**, la liste des lots
est de nouveau entièrement visible, et la barre de totaux n'est plus recouverte.
Desktop 1440 px : rendu **strictement identique** à l'avant, au chevron de
repli près.

> **L'intention d'origine est préservée.** Le sous-titre disait « les
> informations utiles restent visibles pendant le chiffrage » — c'est
> précisément ce que fait la ligne de résumé, que le panneau soit ouvert ou non.
> Un déplacement du brief hors de l'en-tête (colonne centrale, ou modale) aurait
> coûté cette visibilité : sur téléphone la colonne centrale est masquée tant
> qu'aucun lot n'est ouvert, et une modale demande un geste de plus.

### 38.3 Constat annexe : `eventDetails` ne sort jamais de l'écran de saisie

Vérifié par recherche sur tout le dépôt : `eventDetails` n'apparaît **que**
dans ce formulaire et dans le gabarit `js/quote-templates.js`. Les cinq champs
sont bien **persistés** (ils voyagent dans `hybridQuoteSnapshot`, § adaptateurs
de `js/calc-engine.js`), mais ne sont repris **ni dans l'aperçu client, ni dans
le PDF, ni dans l'étude de prix interne**. C'est défendable pour un brief
interne ; ça ne l'est plus si l'on attend de retrouver « Gala annuel · 250
personnes » en tête du devis remis au client. À arbitrer.

### 38.4 État de la suite de tests — échec **antérieur** à ce changement

`npm test` s'interrompt en **Phase 2 — Ajout d'ouvrage depuis le tableau**
(`scratch/test_inline_work_item_combobox.mjs:16`), sur
`Node is either not clickable or not an Element` : le test se place en viewport
**690 × 844** et clique `input[aria-label="Rechercher un ouvrage à ajouter"]`,
qui vit dans la colonne centrale — masquée sous `lg:` tant qu'aucun lot n'est
ouvert depuis la campagne mobile du § 37. Le test n'a pas suivi le nouveau
parcours liste↔détail.

**Ce n'est pas une régression du § 38** : la même commande échoue exactement au
même endroit sur `HEAD` sans les modifications (vérifié par `git stash`). Toutes
les phases précédentes — dont les 7 devis étalons à tolérance zéro et les deux
comboboxes — passent à l'identique avant et après. Le crash empêche en revanche
les phases suivantes de s'exécuter : **le test à corriger avant de pouvoir
juger du reste**.

---

## 📜 39. Colonnes défilantes : la barre de totaux ne réservait pas sa hauteur (2026-08-26)

### 39.1 Le constat

Signalé par l'utilisateur, capture à l'appui : « on voit qu'il y a 8 lots
ajoutés mais on ne peut pas défiler vers le bas sur smartphone ». La liste
s'arrêtait visuellement au Lot 03.

Mesuré à 375 px, devis de 8 lots :

| | Avant |
|---|---|
| Hauteur du conteneur défilant | 499 px |
| Hauteur du contenu | 585 px |
| **Course de défilement disponible** | **86 px** |
| Bas du conteneur (viewport) | y = 796 |
| Haut de la barre de totaux | y = 573 |

Le geste n'était donc pas mort — il ne servait simplement à rien : à fond de
course, le bas de la liste arrivait à y = 788, soit **215 px sous la barre de
totaux**. Les lots 05 à 08 restaient définitivement dessous.

### 39.2 La cause

`.quote-totals-bar` est en **`position: fixed` à toutes les largeurs**
(index.html) : sous 768 px elle flotte à `bottom: 4.5rem`, au-dessus de la
barre d'onglets ; au-delà elle est collée en bas. Étant hors flux, elle ne
pousse rien : les colonnes défilantes s'étendent **sous** elle et doivent
réserver sa hauteur elles-mêmes.

La colonne centrale le faisait (`pb-36 sm:pb-24`). **La colonne des lots ne le
faisait pas du tout** — elle n'avait que son `p-2`.

### 39.3 Le correctif, et pourquoi pas un simple `pb-36` de plus

Poser le même `pb-36` sur la liste des lots ne suffisait pas : mesuré après
coup, il restait **79 px** de retard. La convention en place était donc
elle-même fausse — la colonne centrale masquait déjà la dernière ligne du
tableau des ouvrages de ces mêmes 79 px, sans que personne ne l'ait vu. Deux
`pb-*` posés à la main avaient dérivé de la géométrie réelle.

D'où une **source de vérité unique**, `.clear-totals-bar` dans index.html,
appliquée aux deux colonnes :

```css
.clear-totals-bar { padding-bottom: 15rem; }
@media (min-width: 768px) { .clear-totals-bar { padding-bottom: 6rem; } }
```

- **15rem sous 768 px** = 4.5rem (décalage au-dessus de la barre d'onglets)
  + 12rem (`max-height` de la barre, qui grandit quand ses métriques passent à
  la ligne). Couvre le cas le plus haut, pas seulement le cas courant.
- **Le point de rupture est 768 px**, celui des règles de `.quote-totals-bar`,
  et **non le `sm:` de Tailwind (640 px)**. C'est précisément ce décalage qui
  laissait un trou entre 640 et 768 px : la barre y flottait encore au-dessus
  de la barre d'onglets alors que le dégagement était déjà retombé à 96 px.
- La feuille d'index.html est chargée **après** tailwind.css : à spécificité
  égale elle gagne, donc le `p-2` porté par le même `<nav>` n'écrase pas ce
  `padding-bottom`. Même mécanique qu'au § 37.3 — ici elle joue en notre
  faveur, mais elle reste à connaître.

### 39.4 Vérifications

| Largeur | Avant | Après |
|---|---|---|
| 375 px — course de défilement | 86 px | **318 px** |
| 375 px — dégagement du Lot 08 | −215 px (sous la barre) | **+17 px** |
| 375 px — dernière ligne du tableau d'ouvrages | −79 px | **+211 px** |
| 700 px (bande 640–768) | dégagement 96 px, insuffisant | **+107 px** |
| 1440 px — 8 lots, défilement interne de la colonne | ✅ | **+51 px** |
| 375 px, **1 seul lot** | pas de défilement | **pas de défilement** — le dégagement ne crée pas de course inutile |

> Le dernier point méritait d'être vérifié : un `padding-bottom` de 240 px
> aurait pu rendre défilante une liste d'un seul lot, qui tient largement à
> l'écran. Ce n'est pas le cas — la colonne n'a de hauteur propre que sur
> desktop, et sous `lg:` c'est le conteneur parent qui défile, seulement quand
> le contenu déborde réellement.

### 39.5 Le troisième cas : l'inspecteur d'ouvrage

Vérifié dans la foulée plutôt que laissé en suspens — et il était atteint lui
aussi, plus gravement. Sur téléphone, `WorkItemInspector` mesurait **852 px de
haut dans un conteneur de 716**, sans aucun défileur interne : ses deux vues
(`Simple` et le contenu d'onglet du mode `Avancé`) n'avaient que leur `p-5`.
Le dernier champ — **« Description commerciale pour le devis client** » — était
donc hors d'atteinte : le texte que le client lira sur son devis ne pouvait pas
être saisi depuis un téléphone.

Les deux vues portent maintenant la même classe. Après correctif : course de
défilement 356 px, dernier champ dégagé de **202 px** au-dessus de la barre.

**Trois colonnes défilantes, trois fois le même oubli.** C'est ce qui justifie
la classe partagée plutôt qu'un quatrième `pb-*` à la main : le prochain
panneau défilant n'aura qu'à la porter.
