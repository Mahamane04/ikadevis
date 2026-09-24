# Corrections de l’audit de découverte — 24 septembre 2026

Statut : corrections implémentées et recette locale réalisée. **Aperçu en ligne publié le 24 septembre 2026** : https://ikadevis-uiux-preview.officemicro89.workers.dev (Worker séparé, base Supabase staging). La production `app.ikadevis.com` n’a pas été modifiée. La validation d’un compte connecté, des appareils réels et du pilote reste ouverte.

## Ce qui a changé

| Référence | Correction | Vérification |
|---|---|---|
| C01 | Envoi au-dessus de l’aperçu, focus dans le panneau et fermeture par Échap. Consigne de pièce jointe manuelle corrigée. La démonstration explique désormais le passage au compte. | Premier plan et focus contrôlés à 390 px puis à 360 px ; sept tabulations restent dans le panneau, Échap rend le focus à Envoyer ; aucun message envoyé. |
| C02 | Descriptions commerciales conservées en Synthèse et Détaillé. Dans le détail, chaque description précède les ressources de son ouvrage ; une ligne libre garde son propre prix. | Texte de 620 caractères, accents, `<cour>`, `&`, sauts de ligne et paragraphes. Deux PDF réels de deux pages, toutes les pages examinées. |
| C03 | Précision suffisante du prix unitaire pour expliquer le total sauvegardé. Marge calculée à partir du prix et du coût affichés. Frais propres aux ouvrages additionnés. | Cas historique : 40 × 9 668,05 = 386 722 FCFA, total conservé. Contrôles de remises, quantités fractionnaires, unités, surfaces et volumes. |
| C04 | Nouvelle surface/dimensions vides, ouverture immédiate du métré, confirmation explicite. L’enregistrement et l’aperçu renvoient au premier ouvrage à confirmer ; le brouillon reste récupérable. | Mur neuf à 0 FCFA, confirmation indisponible tant que la surface est vide ; 40 m² saisis puis confirmés. |
| C05 | Prix d’achat propres à chaque ouvrage, cartes de ressources mobiles, pertes et conditionnements dépliables, marge et frais en mode simple. Les lignes libres ont aussi leur coût et leur prix directement accessibles. | Agglo passé de 350 à 400 FCFA sans changer le catalogue. Coûts et marge recalculés, prix conservé à la réouverture. Ligne libre : 2,5 × 10 000, coût 6 000 par unité. |
| C06 | Point d’entrée « Créer mon premier devis » / « Reprendre mon devis », progression en quatre étapes, badge Démonstration visible sur téléphone. Objectif mensuel non imposé et exemple accessible sans ouverture automatique. | Accueil mobile, reprise du devis sauvegardé et reprise après interruption. |
| C07 | Formulaires centrés sur le nom, coordonnées complémentaires repliées, ville vide, chantier « En devis », lot « Travaux », ajout simple par défaut. Libellés des champs associés. | Client créé avec son seul nom ; chantier créé sans adresse ni budget, statut « En devis » retrouvé dans la liste. |
| C08 | Lecture mobile par ouvrage, montants non cassés, en-tête empilé, réglages repliables, vue imprimable avec défilement horizontal. PDF/Envoyer restent en tête. | 360, 390, 768 et 1440 px : aucun débordement de page ni de cellule de montant. Vue papier 740 px confinée dans le défilement du document. |
| C09 | Sauvegarde locale avant inscription, notice persistante et récupération explicite après connexion. Le devis transporte les ressources nécessaires sans remplacer le catalogue du compte. Identité de reprise stable pour retrouver un même devis. | Parcours inscription interrompu puis retour en démonstration : quantités, prix, marge et description retrouvés. Recalcul après sérialisation avec catalogue cible vide testé automatiquement. **Connexion et synchronisation réelles non testées.** |

Autres défauts rencontrés pendant la recette : « Modifier » laissait l’aperçu mobile au-dessus de l’éditeur ; sa fermeture est maintenant explicite. Une réponse tardive de la session initiale pouvait ramener un visiteur de la démonstration à la connexion ; le choix de démonstration est préservé. Le sélecteur de client d’un nouveau chantier affiche « Choisir un client » au lieu de suggérer faussement la première fiche.

## Recette locale

- Compilation complète réussie, version JS `0bb5c29674` et CSS `b472c2437b`.
- **92 contrôles automatisés réussis** : 36 nouveaux contrôles découverte ; 24 contrôles financiers/statuts ; 16 de propagation des quantités ; 3 de conditionnement ; 13 de répartition des prix de vente.
- Scénario navigateur : mur de 40 m², prix fournisseur modifié, marge 25 %, sauvegarde sans client imposé ; deuxième lot avec 1,5 m³ de béton et une ligne libre de 2,5 unités ; réouverture et modification ; description longue ; exports Synthèse et Détaillé.
- Total de la recette à trois ouvrages : HT **881 546 FCFA**, TVA **158 678 FCFA**, TTC **1 040 224 FCFA**. Les modifications de description et les changements de présentation ne changent pas ces montants.
- Dernier contrôle des journaux de l’interface : aucune erreur capturée dans l’onglet de recette. Cela ne constitue pas un audit global de toutes les pages.
- Deux PDF téléchargés depuis l’application puis rendus et examinés, pas seulement un toast ou un aperçu : [synthèse](devis-synthese.pdf), [détaillé](devis-detaille.pdf). Ce sont des exemples fictifs avec filigrane de démonstration, sans destinataire réel.

## Limites avant publication / pilote

1. Se connecter avec un compte de test autorisé ; récupérer le devis d’essai, personnaliser l’entreprise, enregistrer, fermer puis rouvrir depuis un autre appareil. Vérifier les erreurs réseau et une seconde récupération sans doublon. Le chemin et ses données sont implémentés, mais le test de bout en bout sur le serveur n’a pas été réalisé.
2. Vérifier sur iPhone et Android physiques, clavier ouvert, zoom et réseau dégradé. Les largeurs de navigateur ne remplacent pas ces appareils.
3. Faire le pilote sans aide auprès de 3 à 5 entrepreneurs et noter les blocages réels. Aucun entrepreneur n’a été contacté dans cette intervention.
4. Préparer la publication à partir d’un ensemble de changements revu. Le dépôt contenait déjà des modifications de landing page, abonnement et paiement avant ce travail. Ne pas publier tout le répertoire indistinctement. Le fichier `corrections-seules.patch` isole les changements de source de cette intervention par rapport à son point de départ ; il n’est pas une version de production autonome.
5. Valider séparément abonnement, paiement et activation de formule avant commercialisation payante. Aucun paiement ni envoi client n’a été exécuté.

## Fichiers et retour arrière

Sources concernées : `index_jsx.js`, `index.html`, `js/calc-engine.js`, `js/finance-core.js`, `js/utils.js`. Fichiers reconstruits : `app.compiled.js`, `tailwind.css`, `sw.js`. Nouveau test : `scratch/test_discovery_corrections.mjs`.

Aucune migration SQL nécessaire. Les prix propres à un ouvrage sont dans `calcForm.priceOverrides`, conservés dans l’instantané du devis. La reprise ajoute un `calculationSnapshot` aux ouvrages pour garder les ressources utilisées. Ces objets ne sont pas importés dans le catalogue partagé.

Pour retirer cette intervention d’un checkout correspondant exactement à son état final : vérifier d’abord l’application inverse de `corrections-seules.patch`, appliquer cette inversion après sauvegarde du travail ultérieur, puis reconstruire l’application. Ne pas supprimer les sauvegardes locales de démonstration ou de reprise. **Ne pas rouvrir en modification un devis utilisant ces nouveaux prix ou une reprise avec une ancienne version ne connaissant pas `priceOverrides` et `calculationSnapshot`** : elle pourrait utiliser un autre catalogue ; les PDF et les montants sauvegardés restent les références. Le retour arrière n’a pas été exécuté.
