# Chiffrage — corrections TVA, marge et disposition

Date : 28 septembre 2026. Base Git : `ff40ffe`, corrections déployées après autorisation explicite ; non commitées. Bundle généré : `e6ad4d65a5`.

## Demande et périmètre

Corriger le taux de 18 % impossible à changer et les difficultés d’utilisation du chiffrage. Sur la capture fournie, 18 % est la **TVA**, alors que 26,21 % est la **marge prévue**. Aucun taux fiscal applicable n’est présumé : le choix reste celui de l’utilisateur parmi les taux configurés.

Cette intervention concerne l’éditeur de devis. Elle ne clôture pas l’audit complet du SaaS. Pendant la correction initiale, aucun déploiement n’avait été effectué. La mise en ligne a ensuite été autorisée et réalisée (voir journal ci-dessous). Aucun changement de compte, appel métier au backend réel, migration distante ou envoi externe n’a été effectué. Les tests utilisent une copie locale, une configuration fictive, le catalogue de démonstration et un navigateur neuf dont le réseau externe et les service workers sont bloqués.

## Constats et corrections

| ID | Preuve | Problème | Correction locale | Priorité |
| --- | --- | --- | --- | --- |
| CHIF-01 | Observé dans la capture et reproduit en Chrome local | Menu TVA ouvert vers le bas, hors écran. Avant correction : haut 877 px, bas 983 px pour une fenêtre de 900 px. | Sélecteur HTML natif, libellé « TVA du devis », focus visible et hauteur 36 px sur ordinateur / 44 px sur mobile. | P1 |
| CHIF-02 | Démontré par le code ; vérifié après correction | TVA masquée sous 768 px ; détail replié sous 768 px mais bouton de dépliage masqué dès 640 px. | Même seuil de 768 px pour le repli et son bouton. TVA et marge présentes dans le détail sur téléphone. | P1 |
| CHIF-03 | Démontré par le code | Marge affichée comme un petit pourcentage sans accès direct aux champs correspondants. | Bouton « Marge » sur les lignes, également pour un coût manquant. Ouvre et focalise les champs existants : marge pour un ouvrage calculé ; prix/coût pour une ligne libre. | P2 |
| CHIF-04 | Démontré par le code ; scénario 18 → 10 % testé | Le panneau affichait la TVA de `item.calcForm`, qui pouvait rester à 18 % après modification de la TVA du devis. | Le panneau reçoit la TVA actuelle du devis. Le texte distingue TVA et marge HT. | P1 |
| CHIF-05 | Observé dans Chrome local | Récapitulatif décalé à droite dans le contexte de positionnement du contenu, donc inutilement étroit sur tablette. Réserve de défilement fixée indépendamment de sa hauteur. | Rendu du récapitulatif par portail dans `document.body` et mesure de sa hauteur avec `ResizeObserver` pour réserver l’espace nécessaire sous la liste. | P2 |
| CHIF-06 | Observé pendant les tests à 320 px | Débordement horizontal des totaux. | Total TTC sur toute la largeur, retour à la ligne des métriques et bouton de détail 44 × 44 px. | P1 |
| CHIF-07 | Observé dans Chrome local | Tableau trop large pour la zone disponible sur tablette ou avec l’inspecteur ouvert ; totaux/actions nécessitant un défilement horizontal. | Passage en cartes lorsque le conteneur fait au plus 680 px, selon sa largeur réelle. | P2 |

La priorité P1 exprime ici un blocage important du parcours de chiffrage, sans implication de faille de sécurité. Les calculs métier n’ont pas été modifiés. Un changement de TVA conserve le HT et la marge ; un changement de marge reste limité à l’ouvrage choisi. Les lignes libres conservent leurs prix explicites.

## Fichiers

- `index_jsx.js` : `WorkItemTable`, `WorkItemInspector`, `QuoteTotalsBar`, transmission des propriétés dans `QuoteWorkspace`.
- `index.html` : styles des contrôles, adaptation selon la largeur du conteneur et réserve sous le récapitulatif.
- `app.compiled.js`, `tailwind.css`, `sw.js` : artefacts régénérés par la compilation existante ; références de cache mises à jour dans `index.html`.
- `scratch/test_quote_pricing_ui.mjs` : régression navigateur ciblée, configuration fictive forcée et trafic externe refusé.

## Vérifications exécutées

| Contrôle | Résultat | Limites |
| --- | --- | --- |
| `npm run build` | Réussi | Avertissement existant : base Browserslist ancienne ; aucune mise à jour de dépendance réalisée. |
| `node scratch/test_priority_features.mjs` | Réussi, 34 contrôles | Calculs, import, restauration des données et rentabilité ; ne teste pas la production. |
| `scratch/test_quote_pricing_ui.mjs` | Réussi, 34 contrôles | Chrome 153.0.8010.53, macOS, headless ; hauteurs de 900 px. |
| Largeurs 320, 390, 700, 768, 1024, 1440 px CSS | Réussi sur les contrôles ciblés | Sélecteur visible dans la fenêtre, choix du taux et absence de débordement horizontal du récapitulatif. Pas de certification de toute la page. |
| TVA 18 → 10 → 0, annuler/rétablir | Réussi | TTC recalculé, HT et marge conservés ; taux nul préservé. |
| Marge d’ouvrage → 25 % | Réussi | Focus direct, recalcul du pourcentage, brouillon conservé sans conversion en ligne libre. |
| Ligne libre : vente 10 000, coût 6 000 | Réussi | Marge 37 % avec les frais de démonstration à 5 % ; l’autre ouvrage reste calculé. |
| Clavier : focus TVA, Tab, focus marge, Échap du panneau mobile | Réussi | Retour au bouton déclencheur vérifié. |
| Choix dans le menu natif par flèches/Entrée | Non validé | Les séquences envoyées en Chrome headless n’ont pas changé la valeur ; choix des options vérifié via l’API navigateur. Contrôle manuel du menu système à faire. |
| `git diff --check` sur les cinq fichiers applicatifs modifiés | Réussi | Aucun commit ni publication. |
| Compte connecté, sauvegarde distante, permissions et quotas | Non testés dans cette intervention | Aucune utilisation d’un compte réel. |
| Safari, Firefox, appareil tactile réel, clavier virtuel, lecteur d’écran | Non testés | À vérifier avant généralisation. |

Les premiers essais de Puppeteer ont échoué sur des lectures de modules (`ETIMEDOUT`). Le runtime Playwright fourni par Codex a été utilisé sans modifier les dépendances du projet. Deux sélecteurs de l’ancien harnais supposaient aussi un parcours obsolète du catalogue ; le nouveau test suit le comportement actuel.

Rejouer le test depuis une copie isolée avec `config.example.js` et les fichiers compilés présents :

```sh
IKADEVIS_PLAYWRIGHT_MODULE=/chemin/vers/playwright/index.mjs \
IKADEVIS_UI_ARTIFACTS=/tmp/ikadevis-pricing-ui \
node scratch/test_quote_pricing_ui.mjs
```

Sur cette machine, le module utilisé est `/Users/mahamanehaidara/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`. La copie de validation est `/private/tmp/ikadevis-pricing-20260928`. Le script remplace systématiquement `config.js` par le gabarit avant son chargement et bloque les requêtes hors de son serveur local.

## Captures et preuves visuelles

Captures fictives conservées hors du dépôt :

`/Users/mahamanehaidara/.codex/visualizations/2026/09/25/01a0d5fc-1458-73f3-95b4-be238f9846b6/audit-ikadevis/updates/pricing-2026-09-28/`

- `before-vat.png` : reproduction du menu coupé avant correction.
- `totals-320.png`, `totals-390.png`, `totals-700.png`, `totals-768.png`, `totals-1024.png`, `totals-1440.png` : récapitulatif corrigé.
- `margin-320.png` : champ de marge focalisé dans le panneau mobile.

## À poursuivre et décision de livraison

1. Vérifier manuellement le menu natif sur Chrome visible et sur Safari/mobile, ainsi que le zoom et le clavier virtuel. Ces essais ne constituent pas une conformité WCAG complète.
2. Valider en préproduction avec un compte autorisé : enregistrer le devis, le rouvrir, vérifier le PDF, puis tester un compte limité. La conservation du brouillon local est démontrée ; la persistance distante n’a pas été exercée ici.
3. Compléter l’audit des autres menus personnalisés : seul le sélecteur de TVA a été remplacé. Ne pas conclure que tous les `CustomSelect` sont corrigés.
4. Revoir séparément la densité de l’en-tête à 320 px et les notifications mobiles qui peuvent masquer temporairement du texte. Ces points restent visibles dans le périmètre général et ne sont pas déclarés résolus par ce lot.
5. Le blocage de quota administrateur signalé auparavant reste un chantier distinct : `migrations_platform_admin_entitlements_2026-09-28.sql` est une proposition locale, son application distante n’est pas confirmée.

**État actualisé : corrections publiées sur https://app.ikadevis.com après autorisation de l’utilisateur. Les vérifications complémentaires ci-dessus restent à effectuer ; le déploiement ne les transforme pas en contrôles réussis.**


## Journal de mise en ligne — 28 septembre 2026

- Autorisation utilisateur : « fait le deploie met en lign ».
- Cible : Worker Cloudflare `ikadevis`, domaine `app.ikadevis.com` ; site vitrine inchangé.
- `npm run deploy:build` réussi. Bundle identique à celui testé : `e6ad4d65a5` ; CSS `0113cfb1b1`.
- Configuration publique comparée avant publication : même URL Supabase et même clé publique `anon` que le site existant ; aucune clé privilégiée dans cette configuration.
- Contrôle du paquet : aucun rapport d’audit, test, migration SQL ou fichier `.env`. Le README public de SheetJS est une notice de dépendance. Ajout d’un filtre `.DS_Store` dans `scripts/build-dist.mjs` pour exclure les métadonnées Finder des prochains paquets.
- Publication effectuée via `wrangler deploy --config wrangler.jsonc`, puis finalisée sans métadonnées Finder : **version Cloudflare `cdf73e1f-3a9c-462a-b4bd-6d0d95310048`**.
- Version précédente relevée pour un éventuel retour arrière : `febe2b76-b103-4f8e-b59b-d0a0041e8bfc` (25 septembre 2026). Version intermédiaire de publication : `ad02353c-b775-434c-93eb-d37fee3d6761`.
- Contrôle après publication : **24 ressources HTTP 200**, contenu SHA-256 identique au paquet local, dont HTML, JavaScript, CSS, configuration publique et service worker.
- Preuves techniques locales : `/private/tmp/ikadevis-deploy-20260928/verification-assets.json`.
- Aucune migration de quota administrateur n’a été appliquée par ce déploiement de l’interface.
- Vérification navigateur après publication : Chrome 153.0.8010.53, écran de connexion chargé avec le nouveau bundle, aucune erreur JavaScript non interceptée. Aucune connexion à un compte réel. Preuve : `/private/tmp/ikadevis-deploy-20260928/verification-browser.json`.
