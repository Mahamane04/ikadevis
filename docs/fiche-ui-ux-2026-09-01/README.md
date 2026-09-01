# Fiche UI/UX ikadevis — jeu de captures du 2026-09-01

Regénéré après la campagne de remédiation UX/UI (§ 40 du
`PROJECT_MASTER_TRACKER.md`). **Remplace le jeu livré précédemment**, qui
décrivait l'état d'avant la passe d'interface du 21 août et que le tracker
signalait « à regénérer » depuis (§ 35.7).

```bash
node scratch/capturer_ecrans.mjs <dossier>
```

17 captures, 2880×1800 (desktop) et 390×844 (mobile), Mode Démo, aucun Supabase
requis. Le script est déterministe : même jeu de données, mêmes écrans.

## Ce que ce jeu montre de nouveau

Les captures **antérieures ne sont plus utilisables comme référence** : la
campagne a changé le vocabulaire de navigation et la structure de plusieurs
écrans. Les écarts visibles, capture par capture :

| Capture | Ce qui a changé |
| :--- | :--- |
| `00-connexion` | Le dégradé couvre toute la hauteur : la bande claire et le logo hors champ sous 720 px ont disparu. Case d'acceptation des CGU à l'inscription. |
| `01-creer-devis` | Écran renommé **Chiffrage**. Colonnes du tableau alignées sur le document client : la quantité est le métré réel (120 m²) et le P.U. le prix au m² (1 535 F), au lieu de « 1 m² » à 184 140 F. Textes secondaires assombris. |
| `02` → `05` (inspecteur) | Le sélecteur « Mode de Métré » ne propose plus que les modes que la recette sait calculer. Bandeau rouge si une dimension est négative. |
| `06-apercu-document` | Filigrane **DÉMONSTRATION** et mention « coordonnées et identifiants fiscaux fictifs ». Badge d'état honnête (« Brouillon non enregistré » tant que le devis ne l'est pas). |
| `07-projet` | Vocabulaire **Chantier** partout (« Affaire » a disparu de l'interface). |
| `09-devis` | Colonnes **Montant TTC** et **Statut** ajoutées ; titre « Mes devis », comme la navigation. |
| `11-catalogue-technique` | Sous-entrées **Catalogue** et **Ressources** (au lieu de « Catégorie Ouvrage » / « Ressource »), désormais atteignables : la barre latérale signale son défilement. |
| `16` / `17` (mobile) | Barre des totaux repliable : 122 px au lieu de 191, sans défilement interne, avertissement lisible en entier. Barre d'onglets et tiroir portent le même vocabulaire. |

## Ce qui reste à faire pour livrer la fiche

Ces captures sont la **matière première**. Le livrable historique était un
`fiche-ui-ux-ikadevis.zip` (référence Adobe XD) : son assemblage — mise en page,
annotations, export — n'est pas automatisé et reste manuel.

Deux écrans méritent une note dans la fiche assemblée :

1. Le devis de démonstration est un **forfait d'une seule ligne** : sur
   `01-creer-devis` et `06-apercu-document`, le déboursé est à 0 et la marge à
   0 %. C'est le jeu de données, pas un défaut d'interface.
2. Les identifiants fiscaux visibles sur `06-apercu-document` et
   `13-parametres-compte` sont **fictifs**, et désormais marqués comme tels.
