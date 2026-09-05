# ikadevis — ERP de calcul de devis BTP

Fiche de référence du projet. **À lire en début de session** : elle évite de
ré-explorer la chaîne de build, le déploiement et le harnais de tests à
chaque fois.

> Ce document est un point d'entrée, pas la source de vérité. Pour l'historique
> détaillé (cause, correctif, alternatives rejetées, ce qui est prouvé vs pas)
> voir **[`docs/PROJECT_MASTER_TRACKER.md`](docs/PROJECT_MASTER_TRACKER.md)**
> (~3900 lignes, § 1 à § 59+). Pour repartir sans tout relire, voir
> [`docs/REPRISE_SESSION.md`](docs/REPRISE_SESSION.md) (général) et
> [`docs/REPRISE_CALCUL_COMPOSANTS_2026-08-24.md`](docs/REPRISE_CALCUL_COMPOSANTS_2026-08-24.md)
> (calcul guidé des composants). **Ces trois fichiers peuvent être en avance
> sur cette fiche — en cas de contradiction, ils font foi.**

---

## Le produit en une phrase

Moteur SaaS d'étude de prix, de métré automatique et de calcul de déboursé sec
pour le BTP (gros œuvre, métallerie, menuiserie, signalétique, façades ACM) —
devis, factures, et un éditeur de modèles PDF visant la parité avec Zoho Books.

## Architecture en une phrase

**Un seul fichier source React** (`index_jsx.js`, ~20 000 lignes) compilé par
esbuild en `app.compiled.js` ; **aucun serveur applicatif** — toute la logique
métier tourne dans le navigateur, Supabase fait office de backend (Postgres +
RLS multi-tenant + Auth) ; déploiement en site 100 % statique sur Cloudflare
Workers (mode Static Assets).

```
index_jsx.js (source, JSX)  ──esbuild──>  app.compiled.js (servi)
        │
        ├── js/calc-engine.js       moteur de calcul (déboursé sec → K → HT → TVA → TTC)
        ├── js/quote-templates.js   gabarits de contenu devis
        └── js/utils.js             utilitaires, dont l'export PDF (html2canvas + jsPDF)

Supabase (Postgres + RLS par organization_id)  <──requêtes──  app (navigateur)
```

---

## Identifiants

| Ressource | Valeur |
|---|---|
| Dépôt GitHub | `github.com:Mahamane04/ikadevis.git` |
| Domaine en ligne | https://ikadevis.officemicro89.workers.dev (domaines `ikadevis.com` / `app.ikadevis.com` non branchés) |
| Worker Cloudflare | `ikadevis`, mode Static Assets — pas de champ `main`, sert `./dist` |
| Compte Cloudflare | `officemicro89@gmail.com` — wrangler déjà authentifié en local |
| Supabase **production** | projet `SuperDevisMO` — `qmavetqcpzsfralsqxsi` |
| Supabase **staging** | projet `ikadevis-staging` — `mwfmruzlonsrrfufbsyz` |
| Supabase **development** | *(aucun projet dédié — pointe sur staging depuis le 2026-08-19)* |

**⚠️ La connexion MCP Supabase production est en LECTURE SEULE**
(`transaction_read_only = on`) — un garde-fou à ne pas contourner. Toute DDL/
migration production passe par l'éditeur SQL du dashboard, à la main. Le
destructif/expérimental va sur **staging uniquement**, avec nettoyage. Ne
jamais émettre de facture sur le vrai compte (numéro légal immuable
consommé). Ne jamais entrer le mot de passe du user à sa place.

---

## Démarrage rapide

```bash
npm install
node scripts/generate-config.mjs development   # génère config.js depuis .env.development (hors dépôt)
npm run build                                    # tailwind.css + app.compiled.js + sw.js
npm start                                        # sert l'app sur http://localhost:8099
```

`config.js` et les `.env.*` ne sont **pas versionnés** (`.gitignore`) — ils
portent les identifiants Supabase. `config.example.js` / `.env.example` sont
les gabarits.

## Commandes

| Commande | Rôle |
|---|---|
| `npm start` | Serveur local, port 8099 |
| `npm test` | Suite E2E Chromium headless (puppeteer) — voir § Tests |
| `npm run build` | `build:css` + `build:js` + génération du service worker |
| `npm run build:js` | esbuild seul : `index_jsx.js` → `app.compiled.js` (JSX, minifié) |
| `npm run config -- <env>` | Génère `config.js` pour `development` / `staging` / `production` |
| `npm run deploy:build` | `generate-config.mjs production` + `build:dist` → assemble `dist/` |

**Après toute modification de `index_jsx.js`, recompiler** (`npm run build:js`
ou `npm run build`) : le navigateur charge `app.compiled.js`, jamais la source
directement.

## Déploiement

```bash
npm run deploy:build && npx wrangler deploy && node scripts/generate-config.mjs development
```

Les trois étapes sont **enchaînées dans le même `&&` volontairement** :
`deploy:build` réécrit `config.js` vers la **production** — l'oublier fait
pointer l'app locale sur la vraie base ; la dernière étape restaure
`development` immédiatement après. Le déploiement est **manuel** — la CI
GitHub ne fait que build + tests, aucune publication.

Vérifier que le déploiement a bien pris (le cache Cloudflare peut servir une
version périmée même avec un paramètre aléatoire — `cf-cache-status: HIT`) :

```bash
curl -sL https://ikadevis.officemicro89.workers.dev/ | grep -oE 'v=[0-9]{8}[a-zA-Z0-9]+' | sort -u
```

Le jeton renvoyé doit correspondre à celui de `index.html` en local.

---

## Cache-buster `?v=AAAAMMJJx`

`index.html` référence ses scripts avec `?v=AAAAMMJJx` (année-mois-jour +
lettre de version du jour) — **à bumper à chaque build**. Le service worker
dérive son **nom de cache** de ce même jeton : ne pas les désynchroniser.

Pour tester une modification sans faux négatif : `tabs_close` puis
`preview_start`, ou naviguer avec `?nocache=<jeton>` — un simple `navigate`
sert souvent une version en cache. Diagnostic rapide si un correctif semble
sans effet :

```js
Array.from(document.querySelectorAll('script[src]')).map(s => s.src)
```

Si le jeton affiché n'est pas celui qu'on vient de builder, c'est le cache, pas
le code. Dans le service worker, toute recherche en cache doit porter
`ignoreSearch: true` (la page demande `app.compiled.js?v=…`, le cache stocke
`app.compiled.js`).

---

## Tests

```bash
npm test                                          # suite complète
node scratch/capturer_ecrans.mjs <dossier>        # captures pour fiches UI/UX
```

Point d'entrée unique : `scratch/test_master_saas_100.mjs`, qui importe une
suite par fichier `scratch/test_*.mjs` (chacun exporte `run()` →
`[{label, pass, detail}]`). Harnais commun : `scratch/lib/harness.mjs`
(`launchApp`, `enterGuestMode`) — lance Chromium headless (puppeteer) servant
l'app en **Mode Démo/Invité**, sans Supabase réel.

La suite couvre le chargement de l'app, la cohérence de la chaîne financière
(déboursé sec → coefficient K → net HT → TVA → TTC) et **7 devis étalons**
métier à tolérance zéro (A à G — peinture, carrelage, garde-corps métallerie,
dressing menuiserie, enseigne LED, façade ACM, villa R+1).

**Un exit code 0 ne veut pas dire « 100 % conforme »** — le script distingue
explicitement échecs réels et échecs attendus/documentés ; lire le résumé de
fin (`Vérifications individuelles`, `Suites en régression inattendue`,
`Étalons métier`).

### Piège de banc d'essai le plus coûteux à ce jour

**`scrollHeight > clientHeight` ou écrire `scrollTop` en JS ne prouvent rien**
sur le défilement réel : les deux réussissent même avec `overflow: hidden`.
Seul un vrai événement de molette (`page.mouse.wheel({ deltaY: … })`) prouve
qu'un utilisateur atteint le bas d'une page. Voir § 59 du tracker
(`test_ecran_connexion.mjs`).

---

## Pièges déjà rencontrés (ne pas les redécouvrir)

| Piège | Réalité |
|---|---|
| **Spécificité CSS — rencontré 6 fois** | Toute feuille chargée après `tailwind.css` gagne à spécificité égale : le `<style>` d'`index.html`, mais aussi Font Awesome. `.btn-primary`/`.btn-secondary`/`.btn-icon`/`.fa-solid` neutralisent silencieusement `hidden`, `lg:hidden`, `sm:hidden`, `bg-*`, `mb-*`. Ne jamais poser un utilitaire `display`/`background-color`/marge directement sur ces classes — toujours passer par un `<span>`/conteneur enfant. |
| **`min-w-0` ne suffit pas toujours** | Avec `items-start`, un bloc sans largeur propre prend la largeur naturelle de son contenu (débordement horizontal) — c'est la largeur du *parent* qui est en cause, pas le min-width de l'enfant. Remède : `w-full sm:w-auto`. |
| **`position: sticky` crée TOUJOURS un contexte d'empilement**, quel que soit son z-index | Un panneau `fixed` z-190 enfant d'un en-tête `sticky z-30` reste prisonnier sous un z-40 situé ailleurs dans l'arbre. Remède : l'hôte sticky renonce à son contexte le temps de l'ouverture, via `:has()`. |
| **`em` compoundent, les variables CSS non** | `text-[11px]` imbriqué dans `text-xs` rend à 8,25 px au lieu de 11. Utiliser une custom property (`--corps-doc`) lue identiquement à toute profondeur. |
| **`overflow: hidden` sur `body` se propage à la fenêtre** tant que `html` reste `visible` | Posé pour la coquille app (100dvh, défilement dans des conteneurs internes), ça bloque le défilement de tout écran sans conteneur dédié (ex. connexion). Scoper avec `:has()` plutôt que retirer globalement. |
| **html2canvas ignore `@media print`** | `print:hidden` ne suffit pas à exclure un élément d'un PDF généré — il faut le retirer du DOM cloné (`data-hors-pdf` + suppression explicite). |
| **jsPDF `addImage` clippe au bord du papier**, jamais à une zone de contenu | Un export PDF paginé doit découper le **canvas** en tranches avant l'appel, pas compter sur jsPDF pour couper. |
| **jsPDF UMD assigne `window.jspdf = {}` avant de le peupler** | Un intercepteur par setter posé trop tôt enveloppe un objet vide. Charger les libs explicitement, puis remplacer `window.jspdf.jsPDF`. |
| **Chercher une coupure de page "blanche" échoue avec le zébrage** | Une ligne alternée n'a jamais de bande blanche. Chercher une ligne **uniforme** (pas blanche), avec une marge horizontale de 2 % (la bordure du document sinon empêche toute uniformité). |
| **Remplacement de code ancré sur une chaîne non unique** | `index_jsx.js` fait 20 000+ lignes ; une chaîne comme `<div className="px-6 py-4 border-b …">` peut apparaître 6 fois. Toujours ancrer sur une chaîne unique, vérifier le compte d'occurrences, contrôler le bloc extrait avant d'écrire. Un remplacement mal ancré a déjà supprimé 1371 lignes. |
| **`.app-table` a `min-width: 600px` sous 768 px seulement** | Au-dessus elle s'adapte ; en dessous elle force un défilement horizontal dans les panneaux étroits. |
| **`<h2 class="truncate">` dans un flex sans `min-w-0`** | Impose sa largeur naturelle au lieu de se tronquer, pousse le bloc hors écran. |
| **Commentaires `<!-- … -->` d'Illustrator dans un SVG collé** | Invalides en JSX — les retirer avant d'intégrer un SVG exporté. |
| **Le devis en cours n'est dans aucune clé localStorage** | D'où les gardes `beforeunload` et à la déconnexion — ne pas les retirer sans remplacer la protection contre la perte de saisie. |
| **`scrollHeight > clientHeight` / écrire `scrollTop`** | Ne prouvent pas qu'un utilisateur peut défiler (voir § Tests ci-dessus) — seul un événement de molette réel le prouve. |
| **Cloudflare peut servir un `index.html` périmé même avec un paramètre aléatoire** | `cf-cache-status: HIT` malgré un cache-buster changé — revalider avant de conclure qu'un déploiement a échoué. |

---

## Schéma Supabase — grandes lignes

19 tables multi-tenant, **RLS par `organization_id`** sur toutes les tables
métier. Migrations SQL versionnées à la racine (`v5_schema.sql`,
`v6_schema.sql`, `v6_*.sql`, `migrations_*.sql`) — additives, jamais de
réécriture destructive sur un schéma déjà en production.

Point notable : **super-admin plateforme** en lecture seule cross-tenant
(`v6_platform_admin.sql`) — auto-promotion impossible (aucune policy d'écriture
sur `platform_admins`), chaque accès journalisé. Détail : § 19 du tracker.

## Sécurité

- **Zéro `eval()` / `new Function()`** — toute formule de métré passe par un
  parser AST dédié (`SafeMathEvaluator`).
- Isolation multi-tenant par RLS Postgres (`organization_id`).
- Ne jamais committer `.env.*` ni `config.js`.

---

## État courant (voir tracker § 59 pour le détail à jour)

- Branche `main` : à jour, arbre propre. `codex/v2-uiux` porte encore ~20
  commits d'avance sans divergence (refonte UI devis, facturation, import
  CSV, calcul mixte, campagne mobile) — fusion laissée à la décision de
  l'utilisateur, ne pas fusionner sans lui demander.
- Devis et factures partagent désormais **le même modèle de mise en page par
  défaut** (§ 58) ; l'éditeur de modèles PDF vise ~90 % de parité avec l'onglet
  Général de Zoho Books (§ 45–52, 55).
- Export PDF : pagination par tranches de canvas (§ 56), coupure de page sur
  ligne uniforme (§ 57), bandeau de statut retiré du PDF/impression (§ 52).
- Non éprouvé à ce jour : le parcours **connecté** de bout en bout (paramètres
  entreprise, logo/pied de page PDF, changement de taux de TVA, émission de
  facture depuis un devis) — nécessite que l'utilisateur se connecte
  lui-même, une IA ne peut pas créer de compte ni saisir un mot de passe à sa
  place. Mode hors-ligne réel (avion) et installation PWA à l'écran d'accueil
  également non éprouvés.
- Liens légaux `/conditions` et `/confidentialite` sont des espaces réservés
  — à remplacer avant mise en ligne réelle.

---

## Sécurité — garde-fous non négociables (rappel)

- Ne jamais entrer le mot de passe du user à sa place.
- Supabase **production** : lecture seule via MCP, aucun contournement.
- Destructif/expérimental → **staging uniquement**, avec nettoyage après coup.
- Ne jamais émettre de facture sur le compte réel (numéro légal immuable).
- L'email `infos@microofficeml.com` sert à l'identification uniquement —
  jamais transmis à un service tiers sans demande explicite.
