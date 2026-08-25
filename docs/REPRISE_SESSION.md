# ikadevis — fiche de reprise

Point de situation au **2026-08-22**, pour reprendre dans une nouvelle conversation.
Le détail complet est dans `PROJECT_MASTER_TRACKER.md` (§ 32 à 36) ; ce document
ne garde que ce qu'il faut pour repartir sans relire.

> **Mise à jour 2026-08-25** : les sections 1 et 2 ci-dessous sont un instantané
> du **22 août**, périmé — le dépôt est aujourd'hui sur une autre branche
> (`codex/v2-uiux`, distincte de `main`) avec beaucoup de travail non commité.
> Ne pas se fier aux commandes de la section 1 sans vérifier d'abord `git
> status` / `git log --oneline -5` / `git branch`. Pour le chantier actif en
> ce moment (calcul guidé des composants), voir
> `REPRISE_CALCUL_COMPOSANTS_2026-08-24.md` dans ce même dossier — c'est la
> fiche à jour. Les sections 4 (pièges) et 5 (direction visuelle) restent
> valables telles quelles.

---

## 1. À faire en premier, dès la reprise *(périmé — voir note ci-dessus)*

Deux choses étaient en attente le 22 août, dans cet ordre :

```bash
# 1. Pousser le dernier commit (PWA) — 1 commit local non poussé
git push origin main

# 2. Déployer : la version en ligne est v=20260821v, la locale v=20260821y
#    → le PWA n'est PAS encore en production
npm run deploy:build && npx wrangler deploy
node scripts/generate-config.mjs development   # ⚠️ INDISPENSABLE après
```

> ⚠️ `deploy:build` réécrit `config.js` vers la **production**. L'oublier fait
> pointer l'application locale sur la vraie base. Toujours repasser en
> `development` juste après.

Puis vérifier :

```bash
curl -sL https://ikadevis.officemicro89.workers.dev/ | grep -oE 'v=[0-9]{8}[a-z]'
```

---

## 2. Où en est le produit *(état au 22 août — périmé, voir note en tête de fiche)*

| | État au 22 août |
|---|---|
| **En ligne** | https://ikadevis.officemicro89.workers.dev |
| **Migrations production** | ✅ appliquées le 2026-08-21 (contrôle 6 · 1 · 3 · 1) |
| **Domaines `ikadevis.com` / `app.ikadevis.com`** | ❌ ne résolvent pas — à brancher dans Cloudflare |
| **Dépôt** | arbre propre, 1 commit à pousser |
| **Tests** | `npm test` → 40/40, étalons A–G conformes |

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

Restent aussi ouverts, sans urgence :

- Hygiène SQL : `REVOKE EXECUTE ON FUNCTION public.protect_issued_invoice(), public.protect_issued_invoice_lines() FROM anon, authenticated;`
- Fiche UI/UX (`fiche-ui-ux-ikadevis.zip`) : à regénérer après le PWA.
- Colonne « Désignation Ouvrage » à 184 px — élargir davantage impose de rétrécir
  les colonnes chiffrées, arbitrage non tranché.

---

## 4. Les pièges de ce projet — à ne pas redécouvrir

### 4.1 Spécificité CSS — rencontré QUATRE fois

Les classes du `<style>` de `index.html` chargent **après** `tailwind.css` et
gagnent à spécificité égale.

| Classe maison | Ce qu'elle fixe | Utilitaire Tailwind rendu inopérant |
|---|---|---|
| `.app-label` | `margin-bottom`, `display: block` | `mb-0`, `flex` |
| `.btn-primary` | `background-color` | `bg-neutral-900` |
| `.btn-primary` / `.btn-secondary` | `display: inline-flex` | **`hidden`** |

> **Règle** : ne jamais poser une utilitaire de `display`, `background-color` ou
> de marge directement sur ces classes. Passer par un conteneur.

### 4.2 Caches

- Le jeton `?v=AAAAMMJJx` de `index.html` doit être **bumpé à chaque build**.
- Le service worker dérive son nom de cache de ce même jeton — ne pas les désynchroniser.
- Pour tester une modification : `tabs_close` puis `preview_start`, ou naviguer
  avec `?nocache=<jeton>`. Un simple `navigate` sert souvent une version périmée.
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

## 6. Commandes utiles

```bash
npm start                      # serveur local sur :8099
npm test                       # 40 vérifications + 7 étalons métier
npm run build                  # tailwind + esbuild + génération de sw.js
node scratch/capturer_ecrans.mjs <dossier>   # 18 captures pour la fiche UI/UX
```

Après toute modification : bumper le jeton `?v=` dans `index.html`, rebuilder,
puis vérifier dans le navigateur avec `?nocache=<jeton>`.
