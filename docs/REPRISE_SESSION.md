# ikadevis — fiche de reprise

Point de situation au **2026-09-08**, pour reprendre dans une nouvelle
conversation. Le détail complet est dans `PROJECT_MASTER_TRACKER.md`
(voir en particulier **§ 62-63**, l'enrichissement des Paramètres) ; ce
document ne garde que ce qu'il faut pour repartir sans relire.

> Le chantier « calcul guidé des composants » est **résolu** — voir
> `REPRISE_CALCUL_COMPOSANTS_2026-08-24.md` (§ 11) dans ce même dossier pour
> le détail et les vérifications chiffrées.

---

## 1. À faire en premier, dès la reprise

Le dépôt est propre et déployé — pas de reprise d'urgence en attente. Réflexe
de contrôle avant toute chose :

```bash
git status -sb && git log --oneline -5
```

```bash
curl -sL https://app.ikadevis.com/ | grep -oE 'v=[0-9]{8}[a-zA-Z0-9]+' | sort -u
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

**Avant de rebuilder pendant qu'une suite `npm test` tourne encore en fond** :
la tuer et en relancer une propre. Un build qui change `app.compiled.js`
pendant qu'une suite est en vol invalide son résultat (elle peut charger un
mélange de code ancien/neuf et retourner un faux vert) — piège rencontré deux
fois pendant le chantier § 62.

---

## 2. Où en est le produit

| | État au 8 septembre |
|---|---|
| **En ligne** | https://app.ikadevis.com (domaine personnalisé) et https://ikadevis.officemicro89.workers.dev — jeton `v=20260908b` |
| **Branche** | `main`, à jour, arbre propre |
| **Migrations production** | ✅ à jour, y compris les 3 du § 62 (numérotation, équipe, rappels de paiement) |
| **Tests** | ✅ **523/523 au vert, 0 régression, 51 suites, 7/7 étalons métier** |
| **Cron actif** | `send-payment-reminders-daily` (`0 8 * * *`) sur staging et production |

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
| E-mail transactionnel | **Resend** — domaine `ikadevis.com` vérifié (DKIM, SPF, DMARC), utilisé par `send-payment-reminders` |

> **⚠️ Accès MCP Supabase production changé le 2026-09-07/08 (tracker § 62.9).**
> Une connexion en écriture complète a été ajoutée en plus de l'ancienne
> connexion lecture seule — les deux peuvent coexister selon la session.
> Vérifier avant d'agir : `select current_setting('transaction_read_only');`
> (`on` = lecture seule, `off` = écriture possible). Même en écriture
> possible, **staging d'abord** par discipline pour le destructif/expérimental.

---

## 3. Ce qui n'a pas été éprouvé

Le parcours **connecté** a été exercé et vérifié en production pendant le
chantier § 62 (paramètres d'entreprise, facturation réelle par situations,
émission de facture, rappels de paiement réels). Restent non éprouvés :

1. **Chemin de succès d'une invitation d'équipe** — les chemins d'erreur de
   `invite-member` sont testés (401/400/403/500 attendus), mais recevoir
   effectivement une invitation exige d'inviter une vraie personne
   consentante, hors périmètre d'une vérification autonome.
2. **Mode hors-ligne réel** (avion) et **installation PWA à l'écran
   d'accueil** — jamais éprouvés au-delà du rendu/interactions en ligne.

> Une IA ne peut pas créer de compte ni saisir un mot de passe à la place de
> l'utilisateur — ces deux points nécessitent son intervention directe.

Restent aussi ouverts, sans urgence :

- Hygiène SQL : `REVOKE EXECUTE ON FUNCTION public.protect_issued_invoice(), public.protect_issued_invoice_lines() FROM anon, authenticated;`
- **Liens légaux en espaces réservés** : `/conditions` et `/confidentialite`
  n'existent pas encore. À remplacer avant toute mise en ligne commerciale
  réelle (le site est déjà en ligne, mais ces pages restent des maquettes).
- Colonne « Désignation Ouvrage » : arbitrage de confort (l'élargir encore en
  rétrécissant les colonnes chiffrées) resté ouvert, non bloquant.

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

Plusieurs chaînes se répètent dans `index_jsx.js` (20 000+ lignes). Un
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
- Tout badge de statut/rôle doit utiliser le composant `Badge` (tracker
  § 62.8/63) — jamais un `<span>` avec des classes écrites à la main.

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
npm test                       # 523 vérifications, 51 suites + 7 étalons métier
npm run build                  # tailwind + esbuild + génération de sw.js
node scratch/capturer_ecrans.mjs <dossier>   # captures pour fiche UI/UX
```

Après toute modification : bumper le jeton `?v=` dans `index.html`, rebuilder,
puis vérifier dans le navigateur avec `?nocache=<jeton>`.
