# 🏗️ IKADEVIS / MICRO OFFICE ERP CALCUL — FICHE MAÎTRESSE D'ARCHITECTURE & SUIVI DU PROJET

> **Document de Référence & Mémoire Centrale du Projet**  
> *Dernière mise à jour : 16 Août 2026 — Statut : 🟢 PRODUCTION READY (100/100)*

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

| Étalon | Corps d'État | Paramètres Techniques | Déboursé & Ratios de Référence | Tolérance |
| :---: | :--- | :--- | :--- | :---: |
| **Test A** | Peinture Murale | $450\text{ m²}$ (2 couches + primaire + enduit) | $90\text{ L}$ consommés, $7$ pots achetés de $15\text{L}$ ($315\,000\text{ FCFA}$) | $0.00\%$ |
| **Test B** | Carrelage Sol | $120\text{ m²}$ (Carreaux 60x60 en cartons de $1.44\text{ m²}$) | $+10\%$ pertes $\rightarrow$ $92$ cartons achetés ($1\,196\,000\text{ FCFA}$) | $0.00\%$ |
| **Test C** | Garde-Corps Métallerie | $30\text{ ml}$ (Plan de débit 1D, barres de 6m) | $31$ poteaux, $3$ lisses $\rightarrow$ $22$ barres (chutes $< 5\%$) | $0.00\%$ |
| **Test D** | Dressing Menuiserie | $3.0 \times 2.5\text{ m}$ (Caissons + séparations) | $28.5\text{ m²}$ bois $\rightarrow$ $6$ panneaux mélaminé de $6\text{ m²}$ | $0.00\%$ |
| **Test E** | Enseigne Lumineuse LED | $6.0 \times 1.2\text{ m}$ ($7.2\text{ m²}$) | $180$ modules LED $1.2\text{W}$, $2$ alimentations $200\text{W}$ | $0.00\%$ |
| **Test F** | Façade Panneaux ACM | $180\text{ m²}$ (Plaques Alucobond $6\text{ m²}$) | $+8\%$ pertes $\rightarrow$ $33$ plaques ACM | $0.00\%$ |
| **Test G** | Villa R+1 (11 lots TCE) | Gros œuvre, étanchéité, plomberie, élec, finitions | Déboursé $65\text{ M}$, PV Net HT $91.26\text{ M}$, Coeff $K = 1.404$, TTC $107.68\text{ M}$ | $0.00\%$ |

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
   node scratch/test_master_saas_100.js
   ```
4. **Mettre à jour ce document `PROJECT_MASTER_TRACKER.md`** avec les nouveaux ajouts et la date de révision.
