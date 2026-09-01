# ikadevis — fiche de reprise

Point de situation au **2026-09-01 (soir)**, pour reprendre dans une nouvelle
conversation. Le détail complet est dans `PROJECT_MASTER_TRACKER.md` (§ 32 à
**41**) ; ce document ne garde que ce qu'il faut pour repartir sans relire.

> Le chantier « calcul guidé des composants » est **résolu** — voir
> `REPRISE_CALCUL_COMPOSANTS_2026-08-24.md` (§ 11) dans ce même dossier pour
> le détail et les vérifications chiffrées.

---

## 1. À faire en premier, dès la reprise

**⚠️ Du travail est en attente de relecture** : la campagne de remédiation
UX/UI (§ 40) **et sa reprise de vérification (§ 41)** sont **non commitées** sur
la branche `fix/audit-ux-2026-08`. Rien n'est déployé. Commencer par regarder
l'arbre :

> § 41 (2026-09-01) : les 38 constats de l'audit ont été **rejoués un par un
> dans le navigateur**. 22 étaient effectivement clos, **16 ne l'étaient pas** —
> pour l'essentiel des correctifs posés mais jamais regardés à l'écran (le
> mécanisme en place, son effet absent). Tous corrigés et vérifiés ; suite
> passée à **247 vérifications, 32 suites**.

```bash
git status -sb && git log --oneline -5
```

```bash
curl -sL https://ikadevis.officemicro89.workers.dev/ | grep -oE 'v=[0-9]{8}[a-zA-Z0-9]+' | sort -u
```

Le jeton renvoyé doit correspondre à celui de `index.html` en local. S'ils
diffèrent, le déploiement est en retard sur le code :

```bash
npm run deploy:build && npx wrangler deploy && node scripts/generate-config.mjs development
```

> ⚠️ `deploy:build` réécrit `config.js` vers la **production**. L'oublier fait
> pointer l'application locale sur la vraie base. Toujours repasser en
> `development` juste après — c'est pour ça que la commande ci-dessus les
> enchaîne dans le même `&&`.

---

## 2. Où en est le produit

| | État au 1er septembre |
|---|---|
| **En ligne** | https://ikadevis.officemicro89.workers.dev — jeton `v=20260826lots3` (déployé le 26 août, version `e022ba7e`) — **en retard sur le code** |
| **Branche de travail** | `fix/audit-ux-2026-08`, partie de `codex/v2-uiux` — **non poussée, non commitée** |
| **Dépôt** | ⚠️ **arbre sale** : ~1 500 lignes de remédiation UX/UI en attente de relecture (§ 40 du tracker). Découpage en commits par lot recommandé plutôt qu'un bloc unique. |
| **Jeton de cache local** | `?v=20260901l` — remis dans la convention `?v=AAAAMMJJx` le 2026-09-01 |
| **Migrations production** | ✅ appliquées le 2026-08-21 (contrôle 6 · 1 · 3 · 1) |
| **Domaines `ikadevis.com` / `app.ikadevis.com`** | ❌ ne résolvent pas — à brancher dans Cloudflare |
| **Tests** | ✅ **247/247 au vert, 0 régression, 32 suites** (stable sur 3 passages consécutifs, 1er septembre). Les 7 étalons métier restent conformes à tolérance zéro. 10 bancs ajoutés par la campagne § 40, 1 suite et 21 vérifications par la reprise § 41 ; le harnais est désormais déterministe (il attend que la liste soit filtrée avant de cliquer). |

> `codex/v2-uiux` porte ~20 commits d'avance sur `main` sans divergence : la
> refonte UI des devis, la facturation, l'import CSV, le calcul mixte et toute
> la campagne mobile. La fusion dans `main` n'a pas été faite — décision
> laissée à l'utilisateur.

### Infrastructure

| | |
|---|---|
| Hébergement | **Cloudflare Workers**, mode Static Assets (`wrangler.jsonc`, worker `ikadevis`) |
| Compte Cloudflare | `officemicro89@gmail.com` — wrangler déjà authentifié |
| Déploiement | **manuel** — la CI GitHub ne fait que build + tests, aucune publication |
| Supabase production | `qmavetqcpzsfralsqxsi` (SuperDevisMO) |
| Supabase staging | `mwfmruzlonsrrfufbsyz` — cible du `config.js` de développement |

> **La connexion MCP Supabase production est en LECTURE SEULE.** Toute migration
> passe par l'éditeur SQL du dashboard, à la main. Ne pas perdre de temps à
> chercher un contournement : `ALTER TABLE` y renvoie
> `cannot execute ALTER TABLE in a read-only transaction`.

---

## 3. Ce qui n'a pas été éprouvé

Le parcours **connecté** n'a jamais été testé de bout en bout. La structure est
vérifiée (18/18 colonnes attendues par `mapCompanyToDb` présentes, RLS actives,
cache PostgREST rechargé), mais aucun de ces quatre gestes n'a été exercé :

1. Enregistrer les paramètres d'entreprise *(le chemin qui échouait avant migration)*
2. Poser un logo et un pied de page PDF
3. Changer un taux de TVA et vérifier la persistance
4. Émettre une facture depuis un devis, vérifier immuabilité et numérotation

> Une IA ne peut pas s'en charger seule : cela suppose de créer un compte ou de
> saisir un mot de passe. L'utilisateur doit se connecter lui-même, puis l'assistant
> peut piloter les tests dans sa session.

Le **mode hors-ligne réel** (avion) et l'**installation à l'écran d'accueil**
n'ont pas non plus été éprouvés : la campagne mobile du 25–26 août n'a vérifié
que le rendu et les interactions **en ligne**.

Restent aussi ouverts, sans urgence :

- Hygiène SQL : `REVOKE EXECUTE ON FUNCTION public.protect_issued_invoice(), public.protect_issued_invoice_lines() FROM anon, authenticated;`
- Fiche UI/UX : **captures regénérées le 2026-09-01** dans
  `docs/fiche-ui-ux-2026-09-01/` (17 écrans + `README.md` listant les écarts
  avec le jeu précédent). L'**assemblage du livrable** — mise en page,
  annotations, export du `.zip` de référence Adobe XD — reste manuel.
- Colonne « Désignation Ouvrage » : le cas critique est réglé (elle tombait à
  127 px, et son champ à 0 px, dès l'ouverture du panneau de détail — le tableau
  a désormais une largeur plancher et défile dans son conteneur). L'arbitrage de
  confort — l'élargir encore en rétrécissant les colonnes chiffrées — reste
  ouvert.
- **Liens légaux en espaces réservés** : la case CGU ajoutée à l'inscription
  pointe vers `/conditions` et `/confidentialite`, qui n'existent pas. À
  remplacer avant toute mise en ligne.
- ~~**Devis de démonstration** : forfait d'une seule ligne~~ — **fait le
  2026-09-01** (§ 41.2) : deux ouvrages réellement chiffrés, l'atterrissage
  montre la chaîne complète. Les six totaux du jeu de démo sont **relevés sur le
  moteur**, jamais choisis à la main : changer le métré impose de les relever à
  nouveau, sinon la garde de fidélité de `test_demo_landing` rougit — à raison.

---

## 4. Les pièges de ce projet — à ne pas redécouvrir

### 4.1 Spécificité CSS — rencontré SIX fois

Toute feuille chargée **après** `tailwind.css` gagne à spécificité égale : le
`<style>` de `index.html`, mais aussi **Font Awesome**, dont le `<link>` vient
après lui aussi.

| Règle qui gagne | Ce qu'elle fixe | Utilitaire Tailwind rendu inopérant |
|---|---|---|
| `.app-label` | `margin-bottom`, `display: block` | `mb-0`, `flex` |
| `.btn-primary` | `background-color` | `bg-neutral-900` |
| `.btn-primary` / `.btn-secondary` | `display: inline-flex` | **`hidden`** |
| `.btn-icon` | `display: inline-flex` | **`lg:hidden`** (6 boutons « retour » visibles sur desktop) |
| `.fa-solid` *(Font Awesome)* | `display: inline-block` | **`sm:hidden`** sur une icône |

> **Règle** : ne jamais poser un utilitaire de `display`, `background-color` ou
> de marge directement sur ces classes — **ni sur une icône Font Awesome**.
> Toujours passer par un `<span>` / conteneur.

### 4.1 bis Deux pièges de mise en page voisins (2026-08-26)

- **`min-w-0` ne suffit pas toujours.** Avec `items-start`, un bloc de texte
  sans largeur propre prend la largeur **naturelle** de son contenu (511 px
  mesuré) au lieu de se contraindre à sa carte → débordement horizontal.
  `min-w-0` traite le *min-width de l'enfant* ; ici c'est la *largeur du
  parent* qui est en cause. Remède : `w-full sm:w-auto` sur le bloc.
  Le premier correctif (`min-w-0`) avait réduit le symptôme sans l'éliminer,
  et l'utilisateur l'a signalé une deuxième fois.
- **`position: sticky` crée TOUJOURS un contexte d'empilement**, quel que soit
  son z-index. Un panneau `fixed` z-190 enfant d'un en-tête `sticky z-30`
  reste donc prisonnier sous n'importe quel élément z-40 situé ailleurs dans
  l'arbre. Remède employé : l'hôte sticky renonce à son contexte le temps de
  l'ouverture, via `:has()` (voir le bloc PWA MOBILE d'`index.html`).

### 4.2 Caches

- Le jeton `?v=AAAAMMJJx` de `index.html` doit être **bumpé à chaque build**.
- Le service worker dérive son nom de cache de ce même jeton — ne pas les désynchroniser.
- Pour tester une modification : `tabs_close` puis `preview_start`, ou naviguer
  avec `?nocache=<jeton>`. Un simple `navigate` sert souvent une version périmée.
  **Rencontré de nouveau le 2026-08-26**, et le symptôme trompe : le correctif
  semblait n'avoir aucun effet alors que le code était bon — c'est
  `index.html` lui-même qui sortait du cache, donc les `<script src=…?v=>`
  pointaient encore sur l'ancien jeton. Réflexe de diagnostic :
  `Array.from(document.querySelectorAll('script[src]')).map(s => s.src)` —
  si le jeton affiché n'est pas celui qu'on vient de builder, c'est le cache,
  pas le code.
- Dans le service worker, toute recherche en cache doit porter `ignoreSearch: true` :
  la page demande `app.compiled.js?v=…`, le cache stocke `app.compiled.js`.

### 4.3 Remplacements de code

Plusieurs chaînes se répètent dans `index_jsx.js` (14 000+ lignes). Un
remplacement ancré sur `<div className="px-6 py-4 border-b …">` a supprimé
**1371 lignes** — cette chaîne existe 6 fois.

> Toujours : ancrer sur une chaîne **unique**, vérifier le compte d'occurrences
> par `assert`, et contrôler le contenu du bloc extrait avant d'écrire.

### 4.4 Divers

- `.app-table` a `min-width: 600px` **sous 768 px seulement** — au-dessus elle
  s'adapte, sinon elle force un défilement horizontal dans les panneaux étroits.
- Un `<h2 class="truncate">` dans un flex sans `min-w-0` impose sa largeur au
  lieu de se tronquer, et pousse le bloc hors écran.
- Les commentaires `<!-- … -->` d'Illustrator dans un SVG sont **invalides en JSX**.
- Le devis en cours n'est écrit dans **aucune clé de localStorage** : d'où les
  gardes `beforeunload` et sur la déconnexion.

---

## 5. Direction visuelle « Encre »

Retenue le 2026-08-21 après comparaison de quatre maquettes.

| Rôle | Valeur |
|---|---|
| **Action principale** | `#111827` (encre), survol `#000000` |
| **Accent** `brand-500` | `#3b5bdb` — textes, bordures, fonds pâles, liseré du menu actif |
| `brand-600` | `#2f49b0` |
| **Danger** `red-*` | **inchangé** — 116 usages sémantiques, ne pas repeindre |
| Menu actif | fond `#eef1f8` + liseré `#3b5bdb` de 2 px |

Graisses ramenées de 900/800 à 700/600 ; ombres colorées supprimées.
Contrastes tous vérifiés ≥ 4,5:1.

---

## 5 bis. Conventions mobile (2026-08-25 → 26)

Trois breakpoints coexistent, ne pas les confondre :

| Seuil | Ce qui bascule |
|---|---|
| **480 px** | Couche « PWA MOBILE » du `<style>` d'`index.html` : sélecteurs plein écran, hauteur de coque, `font-size: 16px` sur les champs (iOS zoome en dessous) |
| **640 px** (`sm:`) | Empilements de mise en page (colonnes, boutons pleine largeur) |
| **1024 px** (`lg:`) | Bascules liste ↔ détail (catalogue, lots, inspecteur) |

**Tout menu déroulant s'ouvre en page plein écran sous 480 px.** Le jeu de
classes est générique : ajouter `picker-popover` sur le panneau, un en-tête
`picker-mobile-header` (avec `picker-mobile-back`, et si besoin
`picker-mobile-search` + `picker-mobile-clear`) et marquer la zone défilante
`picker-results`. Déjà appliqué à `SolutionCombobox`, `ClientCombobox`,
`ProjectCombobox` et **`CustomSelect`** — ce dernier étant utilisé partout,
tous les menus de l'application en bénéficient. Les `<select>` natifs sont
laissés tels quels : iOS/Android ouvrent déjà leur propre sélecteur.

> Si le panneau plein écran s'affiche **sous** un autre élément, chercher un
> ancêtre `sticky` / `transform` / `backdrop-filter` : ils créent un contexte
> d'empilement que le z-index ne franchit pas (§ 4.1 bis).

Le focus du champ de recherche de ces pages est forcé par un `setTimeout(…, 30)`
après ouverture : sans ça Safari garde le focus sur le champ resté derrière le
panneau et déclenche un zoom parasite.

---

## 6. Commandes utiles

```bash
npm start                      # serveur local sur :8099
npm test                       # 226 vérifications, 31 suites + 7 étalons métier
npm run build                  # tailwind + esbuild + génération de sw.js
node scratch/capturer_ecrans.mjs <dossier>   # 17 captures pour la fiche UI/UX
```

Après toute modification : bumper le jeton `?v=` dans `index.html`, rebuilder,
puis vérifier dans le navigateur avec `?nocache=<jeton>`.
