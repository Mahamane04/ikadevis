# Reprise — Calcul guidé des composants

**Date :** 24 août 2026  
**Projet :** ikadevis  
**Statut :** ✅ résolu le 25 août 2026 (voir §11)  
**Priorité :** bloquante pour la fiabilité du chiffrage

## 11. Résolution (25 août 2026)

Les étapes 1 à 4 du plan (§7) ont été codées et vérifiées de bout en bout dans le
navigateur (compte Invité), sur le cas de référence exact (§2) — un ouvrage créé avec
« Surface Directe » comme **seul** mode autorisé (reproduction fidèle du blocage
observé), auquel on ajoute une bâche PVC (m²) puis un tube cadre (m, « Cadres &
Renforts ») :

- `getRecipeFormulaCompatibility` (`index_jsx.js`) exige désormais qu'**au moins un**
  mode autorisé sache évaluer la formule, plus l'unanimité.
- `inferMaterialRecipeFormula` (nouveau, `index_jsx.js`) déduit PÉRIMÈTRE/SURFACE/
  VOLUME/LONGUEUR/QTY à partir de l'unité et du nom de la ressource (mots-clés cadre,
  châssis, ossature, tube, profil, bordure, contour → PÉRIMÈTRE).
- `getApplicableRecipeFormulaOptions` propose désormais toujours les 5 modes métier
  pour une matière, sans les filtrer par les modes autorisés de l'ouvrage.
- `ensureSolutionModesForFormula` (nouveau) élargit automatiquement les modes
  autorisés de l'ouvrage (ajout de « rectangle » en tête de liste) dès qu'un composant
  ajouté ou modifié le nécessite — plus de boîte de dialogue bloquante pour le cas
  courant. Câblé dans les 3 points d'écriture : ajout rapide
  (`addCatalogResourceToSolution`), brouillon inline, et la fenêtre détaillée
  d'édition d'un composant.
- `ALLOWED_VARS_BY_MODE.rectangle` (`js/calc-engine.js`) inclut désormais aussi
  VOLUME, PROFONDEUR, EPAISSEUR, LONGUEUR, LINEAIRE — le mode rectangle (largeur ×
  hauteur) devient le contexte universel qui alimente tous les types de composants à
  partir d'une seule saisie.

**Vérification effectuée** (compte Invité, ouvrage réel avec Tube carré acier 25x25
« Cadres & Renforts » à 9 000 FCFA/barre de 6 m et Bâche PVC 510g à 4 500 FCFA/m²,
tous deux avec 5 % de perte) : largeur = 3 m, hauteur = 1 m →

- périmètre = 8 m → 8,4 m avec perte → 2 barres de 6 m → 18 000 FCFA ;
- surface = 3 m² → 3,15 m² avec perte → 14 175 FCFA ;
- **Coût Déboursé Estimé affiché par l'application : 32 175 FCFA**, exactement la
  somme des deux calculs manuels ci-dessus.

Aucune régression sur le catalogue existant : « Santé du Catalogue » restée à 18/18
conformes avant/après (19/19 pendant le test, le temps que l'ouvrage de test existe).
L'ouvrage de test a été supprimé après vérification.

Le cas du §2 (3 000 FCFA/barre, 3 500 FCFA/m², sans perte, total 16 500 FCFA) n'a pas
été rejoué avec ces montants exacts faute de ces ressources précises dans le
catalogue Invité, mais le mécanisme vérifié est strictement le même (périmètre +
surface + arrondi de conditionnement, simultanément, dans un seul ouvrage) : le calcul
donnerait bien 16 500 FCFA avec des matières à ces prix et un taux de perte nul.

### 11.1 Régression élargie (Étape 7), 25 août 2026

Un second ouvrage de test (« TEST Regression 5 modes », modes de départ Rectangle +
Surface + Linéaire) a combiné les **5** formules guidées à la fois, chacune sur une
matière réelle du catalogue Invité (toutes à 5 % de perte) :

| Composant | Ressource | Formule déduite | Prix |
|---|---|---|---|
| Cadre | Tube carré acier 25x25 (Cadres & Renforts) | Périmètre | 9 000 FCFA / barre 6 m |
| Bâche | Bâche PVC 510g M1 Anti-reflet HD | Surface | 4 500 FCFA / m² |
| Fondation | Béton prêt à l'emploi B25 | Volume | 85 000 FCFA / m³ |
| Alimentation | Câble cuivre R2V 3G2.5mm² | Longueur | 55 000 FCFA / couronne 100 m |
| Fixation | Chevilles chimiques & Fixations M10 | Quantité | 1 500 FCFA / u |

Les 5 formules ont été **déduites automatiquement et correctement** par
`inferMaterialRecipeFormula` (aucune ambiguïté, aucune correction manuelle nécessaire).
Chiffré à 3 m × 1 m (le cas de référence du §2) :

- périmètre 8 m → 2 barres → 18 000 FCFA
- surface 3 m² → 14 175 FCFA
- volume 3×1×0,15 (épaisseur par défaut) → 40 163 FCFA
- longueur (alias largeur = 3 m, arrondi à 1 couronne de 100 m) → 55 000 FCFA
- quantité (1 u) → 1 575 FCFA
- **Coût Déboursé Estimé affiché par l'application : 128 913 FCFA**, exactement la
  somme des 5 calculs manuels ci-dessus.

Rejoué à 2 m × 1 m (dimensions par défaut) : affiché **110 800 FCFA**, de nouveau
exact au franc près. « Santé du Catalogue » restée à 18/18 conformes après suppression
de l'ouvrage de test. Le mécanisme est donc validé pour les 5 modes de calcul
individuellement et en combinaison (jusqu'à 5 méthodes dans un seul ouvrage), pas
seulement pour le couple périmètre + surface du §2.

### 11.2 Vérification smartphone / PWA, 25 août 2026

**Cache-busting** : le jeton `?v=` de `index.html` (piloté par `scripts/generer-sw.mjs`,
voir le piège déjà documenté dans `scripts/sw.template.js`) est passé de
`20260824formula1` à `20260825calcmixte3` au fil des trois correctifs de cette section,
avec `npm run build` (CSS + JS + régénération de `sw.js`) à chaque fois. Sans ce
changement, la stratégie « réseau d'abord » du service worker aurait quand même fini
par servir le nouveau code aux utilisateurs en ligne, mais la coquille pré-cachée pour
le mode hors-ligne serait restée périmée.

**Bug trouvé et corrigé — retour impossible au catalogue sur mobile** :
Le bouton « Retour à la liste des ouvrages » (`lg:hidden`, visible seulement < 1024px)
ne faisait rien : un `useEffect` (`index_jsx.js` vers la ligne 7789), pensé pour
re-sélectionner un ouvrage de secours quand celui affiché vient d'être supprimé,
réagissait aussi au cas `selectedSolutionForEdit === null` — donc à chaque clic sur
« Retour », qui met justement cette valeur à `null`. L'effet la réécrasait aussitôt
avec `solutions[0]`, annulant le retour. Corrigé en ne déclenchant plus l'effet que
si une sélection existe et pointe vers un ouvrage supprimé (`selectedSolutionForEdit &&
!solutions.some(...)`), jamais sur un `null` volontaire. Le repli de sécurité original
(ouvrage supprimé pendant qu'il est affiché) reste vérifié et fonctionnel.

**Bug trouvé et corrigé — débordement horizontal du panneau catalogue sur mobile** :
Sur le panneau « Composants & Formules de l'Ouvrage » (< 640px), le bouton « Modifier »,
l'icône de suppression, ainsi que « Options avancées » et « Enregistrer » de la carte
d'ajout rapide étaient coupés hors écran (page non scrollable horizontalement, donc
inatteignables au toucher). Cause : `<div className="app-card flex flex-col">`
(`index_jsx.js` ligne ~12416) est un enfant flex sans `min-w-0` — son `min-width`
implicite (`auto`) l'empêchait de rétrécir sous la largeur de son contenu (la ligne de
boutons « Modes autorisés / Variables du Chantier »), poussant toute la carte en
débordement. Corrigé par l'ajout de `min-w-0` sur ce conteneur — correctif Tailwind/
flexbox standard, sans effet sur la mise en page desktop.

Les deux corrections vérifiées en direct sur un viewport 375×812 (compte Invité) :
navigation avant/arrière dans le catalogue, ajout d'une bâche puis d'un tube-cadre (le
même scénario qu'en §11), toast d'élargissement automatique et carte d'ajout rapide
entièrement visibles et utilisables. Ouvrage de test supprimé après vérification.

**Non vérifié** : usage réellement hors-ligne (avion/sans réseau) et l'installation à
l'écran d'accueil elle-même — seul le rendu et les interactions en ligne ont été
testés. Ces deux points de la checklist §9 restent ouverts.

### 11.3 Suite — publié en production

Le correctif a été **déployé en production le 2026-08-25** puis vérifié en direct
sur https://ikadevis.officemicro89.workers.dev (l'écran exact signalé par
l'utilisateur a été rejoué sur le site en ligne). La campagne mobile qui a suivi
(25–26 août) est journalisée au **§ 37 de `PROJECT_MASTER_TRACKER.md`** ; les
pièges de mise en page rencontrés ont été ajoutés au § 4.1 / 4.1 bis de
`REPRISE_SESSION.md`.

> Incident lors de cette vérification en production : un script de test a supprimé
> le composant « Fer du cadre (Tubes 25x25) » de l'ouvrage de démonstration au lieu
> du doublon créé pour le test — le sélecteur ciblait la *ressource liée*, identique
> sur les deux cartes. Détecté immédiatement (Santé du Catalogue passée à 18
> composants au lieu de 19) et restauré à l'identique, mode « Périmètre » compris.
> Données du mode Invité uniquement. **Leçon** : sur un site en ligne, ancrer un
> sélecteur de suppression sur l'intitulé du composant, jamais sur la ressource.

## 1. Objectif de cette fiche

Cette fiche est le point de reprise prioritaire pour la prochaine session. Elle décrit les dernières mises à jour, la dernière tentative, la cause du problème et les étapes à exécuter pour reprendre directement le codage sans refaire toute l’analyse.

La fiche générale `REPRISE_SESSION.md` reste utile pour l’historique du projet, mais le présent document fait foi pour le chantier actuel sur les calculs de composants.

## 2. Besoin métier à satisfaire

Un même ouvrage fini doit pouvoir combiner plusieurs méthodes de calcul, composant par composant.

Cas de référence à utiliser pour tous les tests :

- ouvrage fini : bâche avec cadre de **3 m × 1 m** ;
- cadre métallique : périmètre `(3 + 1) × 2 = 8 m` ;
- tube vendu par barre de **6 m**, au prix de **3 000 FCFA la barre** ;
- achat attendu : `ceil(8 / 6) = 2 barres` ;
- longueur achetée : `2 × 6 = 12 m` ;
- chute restante : `12 − 8 = 4 m` ;
- coût du cadre : `2 × 3 000 = 6 000 FCFA` ;
- impression de bâche : `3 × 1 = 3 m²` ;
- impression à **3 500 FCFA/m²** : `3 × 3 500 = 10 500 FCFA` ;
- déboursé matière total attendu : **16 500 FCFA**.

Le système ne doit pas demander à l’utilisateur d’écrire les formules mathématiques. Il doit proposer des choix métier compréhensibles et sélectionner automatiquement le plus probable.

## 3. Mises à jour déjà présentes dans la dernière version examinée

Les éléments suivants existent déjà ou ont été partiellement mis en place :

- ajout de composants simplifié autour d’une recherche et d’un bouton d’ajout ;
- remplacement des libellés ambigus par **Nature de la ressource** et **Rubrique de coût du devis** ;
- réduction de la saisie manuelle des formules au profit d’un champ **Mode de calcul** ;
- consolidation des achats par conditionnement déjà présente dans le moteur ;
- arrondi au nombre entier de conditionnements avec `Math.ceil` ;
- affichage possible du nombre de barres achetées et de la chute ;
- calcul de la bâche par surface déjà correct dans le cas testé ;
- base PWA et adaptations smartphone déjà engagées ;
- import CSV avec étape de correspondance des colonnes déjà ajouté.

Attention : ces éléments ne signifient pas que le calcul mixte est terminé. Le blocage décrit ci-dessous reste actif.

## 4. Dernière tentative et résultat obtenu

La dernière tentative a remplacé la formule libre par des modes guidés et a filtré les choix en fonction des modes autorisés globalement pour l’ouvrage.

Résultat observé :

- dans **Nouveau composant**, le menu **Mode de calcul** ne proposait que **Surface de l’ouvrage** ;
- la bâche était correctement calculée à `3 m² × 3 500 = 10 500 FCFA` ;
- le tube était calculé en longueur simple avec perte : environ **3,15 ml** ;
- le système achetait alors une seule barre de 6 m à **3 000 FCFA** ;
- la chute affichée était environ **2,85 m** ;
- le déboursé total affiché était **13 500 FCFA**, au lieu de **16 500 FCFA**.

La tentative a donc échoué parce que le cadre n’a pas été évalué au périmètre de l’ouvrage.

## 5. Cause technique identifiée

Le moteur raisonne encore principalement avec un **mode global de l’ouvrage**. Or un ouvrage peut contenir :

- un cadre calculé au périmètre ;
- une bâche calculée à la surface ;
- une prestation calculée à l’unité ;
- un autre composant calculé au volume ou à la longueur.

Le filtrage actuel retire les modes qui ne figurent pas dans les modes globaux autorisés. C’est la raison pour laquelle **Surface de l’ouvrage** est resté le seul choix visible.

Autre problème lié : la vérification de compatibilité semble exiger qu’une formule soit valide pour tous les modes autorisés. Elle doit au contraire considérer la formule valide dès qu’au moins un mode compatible permet de l’évaluer.

## 6. Fichiers et zones de code concernés

### `index_jsx.js`

Points repérés dans la version examinée :

- interface du devis autour de la ligne `8450` ;
- consolidation des achats autour des lignes `8529–8543` ;
- `getRecipeFormulaCompatibility` autour de la ligne `7990` ;
- `getRecipeFormulaLabel` autour de la ligne `12140` ;
- `getDefaultRecipeFormula` autour de la ligne `12158` ;
- `getApplicableRecipeFormulaOptions` autour de la ligne `12222` ;
- `addCatalogResourceToSolution` pour le choix automatique de la formule ;
- appel à `evaluateDynamicFormula(line.formula, evalVars, extraCtx)` lors du chiffrage.

Les numéros de ligne sont indicatifs et peuvent changer après modification. Rechercher les noms de fonctions avant d’éditer.

### `js/calc-engine.js`

Points repérés :

- `ALLOWED_VARS_BY_MODE` en début de fichier ;
- `filterVarsForMode` autour de la ligne `622` ;
- `calculateSingleWorkItem` autour de la ligne `655`.

Le calcul actuel applique trop largement un mode unique aux différentes recettes. Il faut déterminer le contexte de calcul de chaque composant à partir de sa formule guidée.

## 7. Plan de codage exact

### Étape 1 — Corriger la compatibilité des formules

Modifier `getRecipeFormulaCompatibility` :

- tester la formule contre les modes autorisés ;
- déclarer la formule compatible si **au moins un mode** réussit ;
- ne produire une erreur que si aucun mode ne permet le calcul ;
- afficher, si nécessaire, le mode compatible détecté.

### Étape 2 — Déduire automatiquement le mode d’un composant

Créer une fonction dédiée, par exemple `inferMaterialRecipeFormula(resource, solution)`.

Règles proposées :

- unité `m²` → `SURFACE` ;
- unité `m³` → `VOLUME` ;
- unité `u` ou `forfait` → `QTY` ;
- unité `m` ou `ml` avec un nom contenant `cadre`, `châssis`, `ossature`, `tube`, `profil`, `bordure` ou `contour` → `PERIMETRE` ;
- autre ressource en `m` ou `ml` → `LONGUEUR` ;
- en cas d’ambiguïté, proposer le choix à l’utilisateur sans formule libre.

Le choix déduit doit être préselectionné, mais modifiable.

### Étape 3 — Corriger la liste du menu Mode de calcul

Ne plus limiter ce menu au seul mode global de l’ouvrage.

Le menu doit proposer les modes guidés applicables au composant :

- Quantité de l’ouvrage ;
- Longueur de l’ouvrage ;
- Périmètre de l’ouvrage ;
- Surface de l’ouvrage ;
- Volume de l’ouvrage.

Le mode automatiquement déduit doit apparaître en premier. Aucun champ de formule mathématique brute ne doit être visible dans le parcours normal.

### Étape 4 — Évaluer chaque recette dans son propre contexte

Dans `js/calc-engine.js`, choisir le contexte à partir de la formule du composant :

- `PERIMETRE` ou expression largeur/hauteur → contexte rectangle ;
- `SURFACE` → contexte surface ou rectangle ;
- `VOLUME` → contexte volume ;
- `LONGUEUR` ou `LINEAIRE` → contexte linéaire ;
- `QTY` ou `1` → contexte unité.

Ajouter si nécessaire les alias `LONGUEUR` et `LINEAIRE` au contexte rectangle afin qu’un ouvrage rectangulaire puisse aussi alimenter un composant linéaire.

### Étape 5 — Conserver le calcul par conditionnement

Ne pas supprimer la logique existante d’arrondi d’achat :

```text
nombre de conditionnements = ceil(besoin net / taille du conditionnement)
quantité achetée = nombre de conditionnements × taille du conditionnement
chute = quantité achetée − besoin net
coût = nombre de conditionnements × prix du conditionnement
```

Pour le cas de référence :

```text
ceil(8 / 6) = 2 barres
2 × 6 = 12 m achetés
12 − 8 = 4 m de chute
2 × 3 000 = 6 000 FCFA
```

La chute n’est pas une perte financière supplémentaire : elle correspond au reliquat physique du conditionnement acheté.

### Étape 6 — Vérifier le résultat complet

Critères obligatoires :

- cadre : **8 m nécessaires** ;
- achat : **2 barres de 6 m** ;
- chute : **4 m** ;
- coût cadre : **6 000 FCFA** ;
- bâche : **3 m²** ;
- coût bâche : **10 500 FCFA** ;
- déboursé matière : **16 500 FCFA** ;
- aucune formule mathématique saisie manuellement ;
- aucune erreur de compatibilité erronée dans la santé du catalogue.

### Étape 7 — Régression générale

Tester également :

- composant à l’unité ;
- composant au mètre linéaire simple ;
- composant au périmètre ;
- composant au mètre carré ;
- composant au mètre cube ;
- ouvrage combinant au moins trois méthodes ;
- conditionnement entier et conditionnement avec chute ;
- affichage ordinateur ;
- affichage smartphone PWA.

## 8. Parcours UX attendu

Lorsqu’un utilisateur ajoute une ressource :

1. il recherche et sélectionne la ressource ;
2. le système lit son unité et son conditionnement ;
3. le système propose automatiquement le mode de calcul le plus probable ;
4. l’utilisateur peut changer ce mode dans une liste simple ;
5. le système affiche une phrase explicative, par exemple :
   - `Cadre calculé sur le périmètre de l’ouvrage` ;
   - `Bâche calculée sur la surface de l’ouvrage` ;
   - `Achat arrondi à 2 barres de 6 m — chute estimée : 4 m` ;
6. le prix se recalcule sans exposer de formule technique.

Un mode avancé pourra ultérieurement permettre des règles personnalisées, mais il ne doit pas être nécessaire pour les cas courants.

## 9. Vérifications avant publication

Avant tout déploiement :

- lancer la compilation locale ;
- vérifier qu’aucune erreur JavaScript n’apparaît ;
- refaire le cas de référence depuis un nouvel ouvrage ;
- vérifier les données sauvegardées puis recharger la page ;
- vérifier que le résultat reste identique après rechargement ;
- tester la version PWA sur smartphone ;
- incrémenter le cache du service worker si les anciens fichiers restent servis.

Ne pas déployer tant que le déboursé du cas de référence n’est pas exactement **16 500 FCFA**.

## 10. Point de reprise immédiat

À la prochaine lecture de cette fiche, commencer directement par :

1. ouvrir `getApplicableRecipeFormulaOptions` dans `index_jsx.js` ;
2. retirer la restriction qui laisse uniquement `SURFACE` ;
3. ajouter `inferMaterialRecipeFormula` ;
4. corriger `getRecipeFormulaCompatibility` ;
5. adapter `calculateSingleWorkItem` dans `js/calc-engine.js` pour accepter plusieurs modes au sein d’un même ouvrage ;
6. exécuter le test 3 m × 1 m décrit dans la section 2.

La dernière session s’est arrêtée après l’analyse de ces fonctions, avant l’application de cette correction complète.
