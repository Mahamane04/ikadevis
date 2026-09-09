# Plan d'implémentation : Optimisation UI/UX du Chiffrage (Navigation, Épure & Accélération Métier)

**Date :** 2026-09-09  
**But :** Optimiser l'ergonomie, la fluidité et la vitesse de travail sur l'écran central de Chiffrage sans modifier le backend ni la base de données : navigation instantanée entre lots (y compris quand l'inspecteur est ouvert), épure visuelle des actions secondaires et outils d'accélération métier (déplacement d'ouvrage inter-lots, vue d'ensemble).  
**Architecture :** Tout s'exécute côté client dans `index_jsx.js` (React / Tailwind). Zéro altération du schéma Supabase ni du moteur de calcul financier (`calculateHybridQuote`). Préservation absolue des 523 tests E2E et des 7 étalons métier BTP.

---

### Axe 1 : Navigation fluide et immédiate entre les lots

#### Tâche 1.1 : Composant `LotTabsBar` (Onglets horizontaux de lots)
- **Fichier :** `index_jsx.js`
- **Description :** 
  - Créer un composant `LotTabsBar` placé au sommet de la section d'ouvrages (`section aria-label="Ouvrages du lot sélectionné"`).
  - Affiche chaque lot sous forme d'onglet/pilule : Code (`01`, `02`), Nom tronqué, Montant HT compact, et indicateur de complétude.
  - Onglet actif distinctif (fond blanc ou brand, bordure brand, ombre subtile).
  - Bouton `+` discret en fin de liste pour créer un nouveau lot directement.
  - Bouton `Vue d'ensemble` (mini-dashboard de synthèse de tous les lots).
  - Défilement horizontal fluide avec molette ou toucher (`overflow-x-auto custom-scroll`).
  - **Avantage clé :** Reste affiché même lorsque l'inspecteur d'ouvrage (`WorkItemInspector`) est ouvert à droite (résout le problème historique où `LotNavigator` disparaissait).

#### Tâche 1.2 : Boutons « Précédent / Suivant » dans `ActiveLotHeader` et raccourcis clavier
- **Fichier :** `index_jsx.js`
- **Description :**
  - Dans `ActiveLotHeader`, insérer à côté du badge de code lot deux flèches discrètes `‹` et `›` permettant de passer au lot précédent (`onSelectLot(lotIndex - 1)`) ou au lot suivant (`onSelectLot(lotIndex + 1)`).
  - Grisées/désactivées aux extrémités (`lotIndex === 0` et `lotIndex === lotsCount - 1`).
  - Gestionnaire d'événement global au clavier pour écouter `Alt + ArrowUp` / `Alt + ArrowDown` (ou `Alt + PageUp` / `Alt + PageDown`) pour cycler entre les lots sans toucher la souris, sauf lorsqu'un champ de saisie est actif.

---

### Axe 2 : Épure visuelle et masquage des boutons inutiles (Focus Mode)

#### Tâche 2.1 : Menu contextuel d'actions du lot `LotOptionsMenu`
- **Fichier :** `index_jsx.js`
- **Description :**
  - Dans `ActiveLotHeader`, remplacer les boutons séparés "Dupliquer" et "Supprimer" par un bouton d'options discret `•••` ouvrant un menu popover design-system :
    - « Renommer le lot » (active le mode édition inline du titre)
    - « Dupliquer ce lot » (avec duplication de tous ses ouvrages)
    - « Monter le lot » / « Descendre le lot »
    - Séparateur
    - « Supprimer ce lot » (texte rouge, icône corbeille, avec boîte de confirmation)
  - Allège la barre de titre du lot qui se concentre sur l'essentiel : Titre, Montant HT, Marge réelle, Nombre d'articles.

#### Tâche 2.2 : Épure de la barre supérieure `QuoteHeader`
- **Fichier :** `index_jsx.js`
- **Description :**
  - Dans le menu secondaire `⋮` de `QuoteHeader`, retirer l'option dupliquée « Assistant Nouveau Devis » (déjà présente en bouton proéminent juste à côté).
  - Garder le menu épuré pour les actions globales réelles (Imprimer/Exporter PDF).

#### Tâche 2.3 : Adoucissement visuel des boutons de ligne du tableau
- **Fichier :** `index_jsx.js`
- **Description :**
  - Dans `WorkItemTable` (desktop), adoucir les boutons d'actions (Inspecteur, Dupliquer, Supprimer) : opacité 40% au repos, 100% au survol de la ligne (`group-hover:opacity-100 transition-opacity`), ou 100% si l'ouvrage est sélectionné (`isActive`).
  - Évite le « bruit visuel » de 30 icônes d'actions bleues/grises/rouges visibles en permanence quand on lit le devis.

---

### Axe 3 : Nouvelles fonctionnalités d'accélération métier

#### Tâche 3.1 : Déplacement d'ouvrage vers un autre lot (« Déplacer vers... »)
- **Fichier :** `index_jsx.js`
- **Description :**
  - Dans `WorkItemInspector` (et/ou dans les actions d'un ouvrage du tableau), si le devis compte plus d'un lot, ajouter une commande « Déplacer vers un autre lot » avec menu déroulant des autres lots.
  - Au choix du lot de destination : l'ouvrage est retiré du lot source et ajouté au lot cible avec recalcul automatique instantané des déboursés et marges des deux lots.
  - Notification toast confirmant le transfert : *« Ouvrage déplacé vers [Nom du lot] »*.

#### Tâche 3.2 : Insertion de ligne dupliquée immédiatement après l'original
- **Fichier :** `index_jsx.js`
- **Description :**
  - Dans `handleDuplicateItem`, insérer la copie immédiatement à l'index `idx + 1` plutôt qu'à la fin de la liste des items du lot.
  - Sélectionner ou focaliser la nouvelle ligne pour un confort de saisie immédiat.

#### Tâche 3.3 : Modale de synthèse rapide de tous les lots (Mini-Dashboard)
- **Fichier :** `index_jsx.js`
- **Description :**
  - Ajouter une modale légère `LotsOverviewModal` accessible depuis la barre d'onglets de lots via une icône dédiée (`fa-chart-pie` ou `fa-table-cells-large`).
  - Affiche un tableau récapitulatif clair :
    - N° & Nom du lot
    - Nombre d'ouvrages
    - Sous-total HT
    - Part dans le devis (%) avec barre de progression
    - Marge du lot (%) avec pastille colorée (vert si saine, orange si faible, rouge si perte)
    - Clic sur une ligne = fermeture de la modale et saut direct au lot concerné.

---

### Vérification & Tests
1. **Compilation locale :** `npm run build:js` (validation syntaxique esbuild sans erreur JSX).
2. **Suite de tests automatisés :** `npm test` (523 tests vérifiés, 0 régression, 7 étalons métier BTP A à G stricts).
3. **Validation visuelle :** Vérification sur navigateur local en mode desktop et mobile.
