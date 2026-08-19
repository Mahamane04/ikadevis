# ikadevis — ERP de calcul de devis BTP

Moteur SaaS d'étude de prix, de métré automatique et de calcul de déboursé sec
pour le BTP (gros œuvre, métallerie, menuiserie, signalétique, façades ACM).

> **Documentation de référence : [`PROJECT_MASTER_TRACKER.md`](PROJECT_MASTER_TRACKER.md)**
> — architecture, historique des décisions, état vérifié de chaque
> fonctionnalité. C'est ce document qui fait foi, pas ce README.

---

## Démarrage rapide

```bash
npm install                              # dépendances (esbuild, tailwind, puppeteer)
node scripts/generate-config.mjs development   # génère config.js depuis .env.development
npm run build                            # compile tailwind.css + app.compiled.js
npm start                                # sert l'app sur http://localhost:8099
```

`config.js` n'est **pas versionné** : il est régénéré depuis le fichier
`.env.<environnement>` correspondant, eux-mêmes hors du dépôt.

## Commandes

| Commande | Rôle |
| :--- | :--- |
| `npm start` | Serveur local sur le port 8099 |
| `npm test` | Suite de tests E2E (Chromium headless via puppeteer) |
| `npm run build` | Compile le CSS Tailwind purgé + le bundle JS |
| `npm run build:js` | Bundle seul (esbuild, JSX → `app.compiled.js`) |
| `npm run config -- <env>` | Génère `config.js` pour `development`/`staging`/`production` |

Après toute modification de `index_jsx.js`, **recompiler** : le navigateur
charge `app.compiled.js`, pas la source.

## Structure

| Chemin | Contenu |
| :--- | :--- |
| `index_jsx.js` | Application React (JSX compilé par esbuild) |
| `js/` | Modules extraits : moteur de calcul, utilitaires, gabarits de devis |
| `app.compiled.js` | Bundle généré — ne pas éditer à la main |
| `v6_schema.sql` | Schéma PostgreSQL multi-tenant (19 tables, RLS par organisation) |
| `v6_platform_admin.sql` | Migration additive : super-admin plateforme (lecture seule) |
| `scratch/` | Suite de tests E2E, dont les 7 devis étalons à tolérance zéro |
| `vendor/` | Dépendances servies localement (React, Supabase, polices, icônes) |

## Environnements Supabase

Trois environnements sont prévus. Depuis le 2026-08-19, `development` pointe
sur le projet **staging** (pas de projet dédié) — tester en local n'atteint
plus jamais la production. Isolation complète (3ᵉ projet Supabase dédié)
reportée par décision utilisateur, voir le § 13 du tracker.

| Environnement | Projet Supabase | Isolé de la production ? |
| :--- | :--- | :---: |
| Production | `SuperDevisMO` | ✅ |
| Staging | `ikadevis-staging` | ✅ |
| Development | *(aucun — partagé avec staging)* | ✅ |

## Tests

```bash
npm test
```

La suite couvre le chargement de l'app, la cohérence de la chaîne financière
(déboursé sec → coefficient K → net HT → TVA → TTC) et les **7 devis étalons**
métier à tolérance zéro. Elle distingue explicitement les échecs réels des
échecs attendus et documentés — un exit code 0 ne signifie pas « 100 %
conforme », lire le résumé de fin.

## Sécurité

- **Zéro `eval()` / `new Function()`** : toute formule de métré passe par un
  parser AST dédié (`SafeMathEvaluator`).
- **Isolation multi-tenant** : RLS PostgreSQL par `organization_id` sur toutes
  les tables métier.
- **Super-admin plateforme** : lecture seule cross-tenant, auto-promotion
  impossible (aucune policy d'écriture sur `platform_admins`), chaque accès
  journalisé. Voir le § 19 du tracker.

Ne jamais committer `.env.*` ni `config.js` — ils sont dans `.gitignore`.
