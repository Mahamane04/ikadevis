# ikadevis — ERP de calcul de devis BTP

Fiche de référence du projet. **À lire en début de session** : elle évite de
ré-explorer la chaîne de build, le déploiement et le harnais de tests à
chaque fois.

> Ce document est un point d'entrée, pas la source de vérité. Pour l'historique
> détaillé (cause, correctif, alternatives rejetées, ce qui est prouvé vs pas)
> voir **[`docs/PROJECT_MASTER_TRACKER.md`](docs/PROJECT_MASTER_TRACKER.md)**
> (~4750 lignes, § 1 à § 68 — voir en particulier **§ 62**, l'enrichissement
> des Paramètres du 2026-09-06/08 : numérotation, paiement mobile, retenue de
> garantie, situations de travaux, gestion d'équipe, rappels automatiques, et
> **§ 62.9** sur l'accès production MCP). Pour repartir sans tout relire, voir
> [`docs/REPRISE_SESSION.md`](docs/REPRISE_SESSION.md) (général) et
> [`docs/REPRISE_CALCUL_COMPOSANTS_2026-08-24.md`](docs/REPRISE_CALCUL_COMPOSANTS_2026-08-24.md)
> (calcul guidé des composants). **Ces trois fichiers peuvent être en avance
> sur cette fiche — en cas de contradiction, ils font foi.**
>
> **§ 73 (2026-09-24)** — **à lire avant toute intervention sur les paiements** :
> un abonnement s'était activé en production sans prélèvement. La règle qui en
> sort : le navigateur ne décide jamais d'un encaissement.
>
> **§ 68 (2026-09-17)** — transitions généralisées à tout le SaaS, et surtout
> réparation du **filet de focus**, qui ignorait toute fenêtre animée depuis sa
> création : dix fenêtres perdaient silencieusement leur piège à focus.

---

## Le produit en une phrase

Moteur SaaS d'étude de prix, de métré automatique et de calcul de déboursé sec
pour le BTP (gros œuvre, métallerie, menuiserie, signalétique, façades ACM) —
devis, factures, et un éditeur de modèles PDF visant la parité avec Zoho Books.

## Architecture en une phrase

**Un seul fichier source React** (`index_jsx.js`, ~29 400 lignes) compilé par
esbuild en `app.compiled.js` ; **aucun serveur applicatif** — toute la logique
métier tourne dans le navigateur, Supabase fait office de backend (Postgres +
RLS multi-tenant + Auth) ; déploiement en site 100 % statique sur Cloudflare
Workers (mode Static Assets).

```
index_jsx.js (source, JSX)  ──esbuild──>  app.compiled.js (servi)
        │
        ├── js/finance-core.js      arrondi par devise, répartition, conversion, règlements (§ 70)
        ├── js/calc-engine.js       moteur de calcul (déboursé sec → K → HT → TVA → TTC)
        ├── js/quote-templates.js   gabarits de contenu devis
        ├── js/utils.js             utilitaires, dont l'export PDF (html2canvas + jsPDF)
        ├── js/saspay-service.js    passerelle de paiement SasPay (§ 73)
        └── js/subscription-service.js  abonnements SaaS — RELAIS du serveur, n'accorde rien (§ 73)

Supabase (Postgres + RLS par organization_id)  <──requêtes──  app (navigateur)
        └── supabase/functions/*    Edge Functions (Deno) — service_role jamais côté client
                                    invite-member, send-payment-reminders (§ 62.6-62.7 du tracker)
                                    saspay-proxy — SEULE autorité sur les abonnements (§ 73)
```

**Composant `Badge`** (déclaré en tête de `index_jsx.js`, juste après
`STATUTS_DEVIS`/`statutDevis`) : tout badge de statut/rôle doit passer par lui
(`<Badge colorClass="bg-emerald-100 text-emerald-800">Payée</Badge>`) — forme,
taille et espacement fixes, seule la couleur varie. Voir tracker § 62.8/63.

---

## Identifiants

| Ressource | Valeur |
|---|---|
| Dépôt GitHub | `github.com:Mahamane04/ikadevis.git` |
| Domaine en ligne | https://app.ikadevis.com (custom domain) et https://ikadevis.officemicro89.workers.dev — `ikadevis.com`/`app.ikadevis.com` branchés sur Cloudflare depuis une session antérieure au § 62 |
| Worker Cloudflare | `ikadevis`, mode Static Assets — pas de champ `main`, sert `./dist` |
| Compte Cloudflare | `officemicro89@gmail.com` — wrangler déjà authentifié en local |
| Supabase **production** | projet `SuperDevisMO` — `qmavetqcpzsfralsqxsi` |
| Supabase **staging** | projet `ikadevis-staging` — `mwfmruzlonsrrfufbsyz` |
| Supabase **development** | *(aucun projet dédié — pointe sur staging depuis le 2026-08-19)* |

**⚠️ Accès MCP Supabase production — changé le 2026-09-07/08 (tracker § 62.9).**
Il existait une seule connexion `mcp__supabase-production__*` en lecture
seule ; l'utilisateur a explicitement demandé et effectué une **reconnexion
avec les droits complets** (un second connecteur, écriture directe possible :
`apply_migration`, `deploy_edge_function`, etc.). **Les deux connexions
coexistent** selon la session — vérifier avant d'agir :
```sql
select current_setting('transaction_read_only');   -- 'on' = lecture seule, 'off' = écriture possible
```
L'élévation de droits ne change pas la méthode de travail établie : le
destructif/expérimental continue d'aller sur **staging d'abord**, par
discipline, même quand l'écriture directe en production est techniquement
possible. Ne jamais émettre de facture sur le vrai compte pour un test
(numéro légal immuable consommé). Ne jamais entrer le mot de passe du user à
sa place, ni lui demander de coller une clé secrète (API/service_role) dans
le chat — la faire coller directement dans le champ du dashboard concerné.

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
| `npm test` | Suite E2E historique Chromium headless (puppeteer) |
| `npm run test:audit` | **Suite d'audit complète consolidée (238/238 contrôles P0 à Lot 7)** |
| `npm run test:p0` ... `test:lot7` | Vérifications unitaires et d'intégration ciblées par lot |
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
curl -sL https://ikadevis.officemicro89.workers.dev/ | grep -oE 'v=[0-9a-f]{10}' | sort -u
```

Le jeton renvoyé doit correspondre à celui de `index.html` en local.

---

## Cache-buster `?v=<empreinte>`

Le jeton n'est **plus une date à bumper à la main** : `scripts/bump-version.mjs`
le **dérive du contenu** à chaque build (sha256 tronqué à 10 caractères hexa,
ex. `96a219cd90`). Deux jetons distincts :

| Jeton | Calculé sur |
|---|---|
| **JS** | les 5 fichiers servis ensemble : `js/finance-core.js`, `js/calc-engine.js`, `js/utils.js`, `js/quote-templates.js`, `app.compiled.js` — **tout nouveau fichier `js/` doit être ajouté à `FICHIERS_JS` de `scripts/bump-version.mjs`**, sinon il n'est jamais rafraîchi chez les utilisateurs |
| **CSS** | `tailwind.css` seul |

⚠️ **`index.html` n'entre dans AUCUN des deux calculs.** Modifier son `<style>`
en ligne ne déplace donc aucun jeton — le CSS part quand même en ligne (le
service worker est *network-first*), mais ne comptez pas sur le jeton pour
savoir si votre feuille a changé. Rencontré le 2026-09-17.

Le service worker dérive son **nom de cache** du jeton JS : ne pas les
désynchroniser.

⚠️ **Un jeton de date subsiste, et il induit en erreur** : `favicon.svg?v=20260910b`
est posé à la main et **n'est jamais réécrit** par `bump-version.mjs`. Un
`grep -oE 'v=[0-9]{8}[a-zA-Z0-9]+'` — la commande de contrôle d'avant le
2026-09-15 — ne trouve donc plus que **lui**, et renvoie une date périmée sans
aucun rapport avec le code déployé. Le lecteur conclut « la production est en
20260910b » alors qu'elle est en `96a219cd90` : une lecture silencieusement
fausse, plus dangereuse qu'un résultat vide. Toujours filtrer sur
`v=[0-9a-f]{10}`.

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

### Deux extensions de ce piège (2026-09-17, § 68)

- **Présence dans le DOM ≠ perception.** Un délai obtenu par
  `animation-delay` + `fill-mode: both` laisse l'élément **dans le DOM** dès le
  clic, à opacité nulle. Chronométrer sa présence renvoie ~20 ms et ne prouve
  rien. Mesurer l'**opacité calculée** au fil du temps.
- **Un vert de la suite peut être un faux vert.** La suite annonçait « Nouveau
  client » au vert alors qu'une sonde directe montrait la fenêtre privée de son
  rôle et de son focus — artefact d'enchaînement du banc. Un compte au vert ne
  dispense pas de mesurer le comportement lui-même.

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
| **Une animation d'entrée rendait le filet de focus AVEUGLE** *(2026-09-17)* | Le filet (`index_jsx.js` ~15515) écartait toute surface à `opacity: 0` — or un fondu vaut 0 pendant ses premières frames. La remontée d'opacité ne modifiant **ni `class` ni `style`**, le `MutationObserver` ne rappelait jamais `reevaluer` : la fenêtre restait **définitivement** sans `role`, sans `aria-modal` et sans piège à focus. Mesuré : rôle toujours absent à 400 ms alors que l'opacité valait déjà 1. Correctif : une animation **en cours** ne vaut plus invisibilité, + rattrapage sur `animationstart`/`animationend`. |
| **Une classe d'animation présente ne prouve RIEN** *(2026-09-17)* | `animate-scale-up` était invoqué **6 fois** dans `index_jsx.js` et **défini 0 fois** (ni `index.html`, ni `tailwind.css`) : six panneaux surgissaient d'un bloc depuis des mois. Vérifier la règle, pas la classe : `getComputedStyle(n).animationName` vaut `none` quand elle n'existe pas. |
| **Une passerelle de paiement non configurée « réussissait »** *(2026-09-24, § 73)* | Sans clé API, `saspay-service.js` fabriquait une session `demo_…` et un `SUCCESS` **sans joindre api.saspay.me**. Un abonnement STANDARD s'est activé en production sans le moindre débit. Règle : une passerelle non configurée est une **panne**, pas un succès — elle lève `SASPAY_NOT_CONFIGURED`. |
| **Le navigateur ne doit JAMAIS accorder une formule** *(2026-09-24, § 73)* | `else if (checks >= maxChecks)` activait l'abonnement après 20 s de sondage infructueux, et `\|\| verify.success` l'activait dès le 1ᵉʳ passage (`success` ne signifiait que « HTTP 200 »). `activatePlan()`/`applyPlanUpgrade()` sont **supprimées** : seule l'Edge Function `saspay-proxy` écrit dans `subscriptions`. Un délai dépassé reste un délai dépassé. |
| **Un `grep` de contrôle retrouve les commentaires du correctif** *(2026-09-24, § 73)* | Chercher `checks >= maxChecks` ou `handleSimulateSuccess` dans le source les retrouve **dans la documentation de leur propre suppression** : cinq faux rouges d'un coup, et le symétrique (faux vert) serait pire. Lire le code amputé de ses lignes de commentaire. |
| **Un référentiel écrit à la main n'est pas une source** *(2026-09-24, § 73.10)* | `SASPAY_COUNTRIES` de `js/saspay-service.js` listait 22 réseaux ; l'API SasPay en expose **77, dont 65 actifs**. J'ai affirmé « Wave n'opère pas au Mali » en me fiant à cette liste — **faux**, `wave_ml` est actif, et le correctif privait les Maliens du moyen de paiement le plus répandu. Six opérateurs actifs manquaient sur les pays déjà couverts. Quand la source est interrogeable (`GET /networks/`), la lire. |
| **staging et production ont DIVERGÉ** *(2026-09-24, § 73.4)* | `public.set_updated_at()` (pourtant dans `v5_schema.sql`) est **présente en production, absente de staging**. Ne jamais supposer qu'une migration ancienne est appliquée des deux côtés : le vérifier avant d'en dépendre. |
| **Sonder la production juste après un déploiement donne de FAUX échecs** *(2026-09-17)* | `index.html` (~ligne 1139) fait `controllerchange` → `window.location.reload()` : à la **première** visite suivant une mise en ligne, le nouveau service worker prend la main et la page se recharge, ce qui détruit l'arbre React et renvoie à l'écran de connexion. Une sonde automatisée conclut alors « production cassée ». Toujours faire une visite d'échauffement, puis mesurer à la seconde. Code antérieur : commit `0a364c4`. |

---

## Schéma Supabase — grandes lignes

20 tables multi-tenant, **RLS par `organization_id`** sur toutes les tables
métier (la 20ᵉ, `invoice_reminders_sent`, ajoutée au § 62.7 pour les rappels
automatiques). Migrations SQL versionnées à la racine (`v5_schema.sql`,
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

## État courant (voir tracker § 62-63 pour le détail à jour)

**Publication du 24 septembre 2026 — § 78 :** les deux migrations SaaS, `saspay-proxy`, `invite-member` et le frontend des priorités sont désormais déployés sur staging et production. L’utilisateur a enregistré `SASPAY_API_KEY` en production ; aucun paiement réel validé ici. Dépenses et paramètres Finances encore locaux. Les anciennes indications « production en attente », « quotas navigateur » et « secret posé nulle part » ci-dessous sont historiques : consulter [l’état de publication](docs/priorites-produit-2026-09-24/publication.md).

- Branche `main` : à jour. `codex/v2-uiux` porte encore ~20 commits d'avance
  sans divergence (refonte UI devis, facturation, import CSV, calcul mixte,
  campagne mobile) — fusion laissée à la décision de l'utilisateur.
- **Enrichissement des Paramètres (§ 62, 2026-09-06/08)** : numérotation
  réconciliée + préfixe personnalisable, paiement mobile (Orange Money/Wave/
  Moov Money), retenue de garantie fonctionnelle, situations de travaux
  (facturation multi-factures par lot), gestion d'équipe (Edge Function
  `invite-member`), rappels de paiement automatiques (`pg_cron` + Edge
  Function `send-payment-reminders` + Resend, explicitement **sans n8n**).
  Les trois migrations SQL et les deux Edge Functions sont **appliquées et
  déployées en production**, cron actif. Composant `Badge` unifié (§ 62.8-63)
  pour tout badge de statut/rôle.
- Le parcours **connecté** de bout en bout a été exercé et vérifié en
  production pendant ce chantier (facturation réelle, invitation d'équipe —
  chemins d'erreur —, envoi d'e-mail de rappel réel). Reste non testé : le
  chemin de succès d'une invitation (réception réelle par un vrai
  destinataire), le mode hors-ligne réel (avion) et l'installation PWA à
  l'écran d'accueil.
- Devis et factures partagent **le même modèle de mise en page par défaut**
  (§ 58) ; l'éditeur de modèles PDF vise ~90 % de parité avec l'onglet Général
  de Zoho Books (§ 45–52, 55).
- Export PDF : pagination par tranches de canvas (§ 56), coupure de page sur
  ligne uniforme (§ 57), bandeau de statut retiré du PDF/impression (§ 52).
- **Transitions et accessibilité des fenêtres (§ 68, 2026-09-17)** : transition
  volontaire de **350 ms entre pages** (avec sablier) et **100 ms sur les
  sous-pages** (fondu seul, sans sablier) ; fenêtres, voiles et prises de plein
  écran animés ; `animate-scale-up` **enfin défini** ; garde
  `prefers-reduced-motion` sur les seules animations d'entrée (le sablier porte
  une information, il reste). Aucun délai n'est ajouté sur ce que l'utilisateur
  manipule activement (recherche, filtres, saisie). Suite : **521/535, 6/52
  suites, 7/7 étalons** — chiffres *et* liste nominative des échecs identiques
  à l'avant-chantier.
- **Système de transition uniforme maître/détail (§ 69, 2026-09-17)** :
  généralisation sur les 6 interfaces maître/détail (Ouvrages `recipes`, Ressources
  `materials`, Clients `clients`, Chantiers `projects`, Mes Devis `savedQuotes` et
  Factures `invoices`). Activation visuelle immédiate de la card au clic,
  conservation stricte du scroll et de la structure liste, affichage d'un
  `DetailPanelSkeleton` ciblé (`recipe`, `resource`, `client`, `project`, `quote`,
  `invoice`) uniquement dans le volet droit, puis transition douce `.animate-detail-enter`
  (200 ms, `translateY(6px)` vers `0`, fade-in sans flash blanc ni décalage de layout).
  Contrôleurs avec séquençage par token (`useRef`) pour ignorer automatiquement
  les requêtes obsolètes en cas de clics rapides successifs (anti-race condition).
  Déployé en ligne (`b584350`, jetons JS `16cbcfb739` · CSS `6fe0f4df12`).
- **Socle Finances (§ 70, 2026-09-18)** : précision monétaire par devise
  (FCFA inchangé octet pour octet, centimes EUR/USD rétablis), échéance posée à
  l'émission, tables `payments`/`payment_allocations` en **double écriture**
  (T3). Cinq migrations écrites et prouvées sur Postgres (PGlite) — **pas encore
  appliquées** sur staging ni production. Ordre et conditions : tracker § 70.2/70.9.
  **Ligne de base des tests corrigée : 510/535 et 8/52 avant ce chantier** (et
  non 521/535, 6/52) ; après : **645/670, 8/55, mêmes échecs, 7/7 étalons**.
  La ligne « Étalons métier : 7/7 » du résumé est un `console.log` inconditionnel :
  lire les suites Étalon elles-mêmes.
- **Paramètres › Finances (§ 71, 2026-09-19)** : comptes (banque, caisse,
  mobile money), devises activées, taxes (normal / zéro / exonéré), catégories.
  Nouvelle section autonome `FinanceSettingsPanel`, aucun écran existant modifié.
  Migration `migrations_finance_settings_accounts_2026-09-19.sql` — **pas encore
  appliquée** ; tant qu'elle ne l'est pas, l'écran bascule en mode local et le dit.
- **Dépenses (§ 72, 2026-09-19)** : nouvel écran `ExpensesScreen`, entrée de
  menu « Dépenses » (+ `#depenses`). Déjà payée / à payer / avance personnelle,
  répartition exacte entre chantiers, règlements partiels. Migration
  `migrations_finance_expenses_2026-09-19.sql` — **pas encore appliquée**.
  Piège de banc : le triple clic ne vide pas un `<input type="number">` —
  utiliser le setter natif + `input`, puis relire la valeur.
- **Abonnements SaaS — incident et correction (§ 73, 2026-09-24)** : un
  abonnement STANDARD s'était activé **en production sans aucun prélèvement**
  (simulation silencieuse faute de clé API + auto-activation du client après
  20 s). Corrigé de fond en comble : `migrations_saas_subscriptions_2026-09-24.sql`
  (tables `subscriptions`/`subscription_payments`, RLS **en lecture seule** —
  aucune policy d'écriture) et `saspay-proxy` réécrite en seule autorité (prix
  fixés côté serveur, contrôle du montant encaissé, application idempotente).
  **Appliquées et déployées sur staging uniquement** ; production en attente.
  ⚠️ **Le secret `SASPAY_API_KEY` n'est posé nulle part** : tant qu'il manque,
  toute souscription est refusée avec `GATEWAY_NOT_CONFIGURED` — c'est voulu.
  **Aucun paiement réel n'a encore été exercé de bout en bout.** La clé SasPay
  existe pourtant et elle est **valide** (dans `.env`, éprouvée contre
  `GET /networks/` → HTTP 200) : il ne manque qu'à la porter en secret Supabase.
  Reste ouvert : les quotas restent vérifiés côté navigateur (§ 73.8), et la clé
  SasPay *par organisation* (facturation) est toujours côté client (§ 73.11).
  Suite après chantier : **818/844, 9/58 suites, 7/7 étalons** — aucun nouvel
  échec par rapport à la liste nominative d'avant.
- Liens légaux `/conditions` et `/confidentialite` sont des espaces réservés
  — à remplacer avant mise en ligne réelle.

---

## Sécurité — garde-fous non négociables (rappel)

- Ne jamais entrer le mot de passe du user à sa place, ni lui demander de
  coller une clé secrète (service_role, API) directement dans le chat.
- Supabase **production** : vérifier `transaction_read_only` avant d'agir
  (§ 62.9 du tracker — l'accès complet a été accordé, mais pas systématique
  selon la session). Même en écriture directe possible, **staging d'abord**
  par discipline pour tout ce qui est destructif/expérimental, avec nettoyage
  après coup.
- Ne jamais émettre de facture sur le compte réel pour un test (numéro légal
  immuable consommé).
- L'email `infos@microofficeml.com` sert à l'identification uniquement —
  jamais transmis à un service tiers sans demande explicite.
