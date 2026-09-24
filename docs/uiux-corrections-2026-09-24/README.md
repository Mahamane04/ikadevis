# Corrections UI/UX ikadevis — 24 septembre 2026

Version de travail locale, non déployée. Cette passe traite les principaux problèmes du parcours de chiffrage relevés dans l’audit, avec priorité au smartphone.

## Changements livrés

- **Chiffrage fiable à lire** : la colonne P.U. affiche le prix par unité facturée, et non le montant total de l’ouvrage. Les ouvrages calculés ouvrent leur fiche technique lorsqu’on clique sur leur prix ; les lignes libres restent directement éditables.
- **Marge cohérente** : les modes simple et avancé utilisent le même coût de revient, frais généraux inclus. Une perte reste négative et visible. Exemple vérifié : 168 m³ × 9 750 FCFA = 1 638 000 FCFA HT ; coût de revient 1 146 600 FCFA ; marge 491 400 FCFA, soit 30 %.
- **Statuts cohérents** : les anciens statuts `approved` et `review` sont harmonisés avec `accepted` et `to_verify`. L’ouverture d’un devis reprend son statut enregistré plutôt qu’un ancien statut contenu dans son instantané. L’aperçu signale les modifications non enregistrées.
- **Smartphone** : une seule navigation rapide, fiche d’ouvrage en plein écran, bouton Terminer accessible, champs tactiles agrandis, libellés accessibles, navigation clavier dans la fiche. Les boutons d’ajout sont intégrés au lot et ne flottent plus au-dessus des actions d’une ligne. La barre des totaux est plus compacte.
- **Ordinateur** : panneau de détail et tableau se partagent la largeur. La colonne de prix conserve une largeur lisible ; le tableau peut défiler horizontalement dans les espaces étroits.
- **Catalogue BTP** : terrassement, béton et maçonnerie apparaissent en premier. Filtres par famille corrigés ; menuiserie, façade et signalétique restent accessibles. Les cases de sélection portent le nom de l’ouvrage.
- **Premier devis** : bouton direct « Ajouter mon premier ouvrage » depuis un devis vide et raccourci de reprise du devis en cours sur le tableau de bord.
- **Tableau de bord** : l’objectif mensuel mesure uniquement le montant facturé. Les montants des devis sont explicitement distingués de la facturation. Les raccourcis de travail précèdent les indicateurs.
- **Aperçu** : actions secondaires repliées sur mobile, options de destinataire et de détail lisibles, accès direct à Envoyer et PDF. La fermeture d’un aperçu ouvert depuis le chiffrage ramène au chiffrage ; celle d’un devis consulté depuis la liste reste dans la liste.
- **Libellés** : menus simplifiés, catégories de coûts en français, distinction entre nombre d’ouvrages identiques et quantité issue du métré.

## Validation

56 assertions automatisées réussies dans quatre suites :

| Suite | Assertions |
|---|---:|
| Régressions financières et statuts ajoutées pour cet audit | 24 |
| Propagation des quantités | 16 |
| Arrondis de conditionnement | 3 |
| Répartition du prix de vente | 13 |

Compilation complète réussie, versions des ressources et cache applicatif régénérés, vérification des différences sans erreur d’espacement.

Parcours vérifiés dans le navigateur local avec données de démonstration : 360 × 800, 390 × 844 et 1440 × 1000 ; reprise d’un devis, fiche simple/avancée, modification du métré, remise conduisant à une perte, retour au lot, catalogue et filtre Gros œuvre, aperçu client, actions secondaires, démarrage d’un devis vide et ouverture du catalogue depuis le premier ouvrage. Aucune erreur JavaScript signalée pendant les vérifications finales.

Les captures de ce dossier illustrent les écrans contrôlés. L’audit initial est conservé dans `../audit-uiux-2026-09-24/`.

## Limites et suites

Les dimensions mobiles ont été simulées dans un navigateur : le clavier natif iOS/Android et un téléphone physique restent à vérifier. Cette passe ne certifie pas tous les parcours du SaaS : synchronisation authentifiée, paiement, envoi réel de documents et téléchargement PDF n’ont pas été exécutés. Aucun document client ni paiement réel n’a été créé ou envoyé.

La catégorisation des ouvrages repose sur leur nom ; une famille explicite en base serait préférable pour les catalogues personnalisés. Le document commercial conserve sa mise en page imprimable dans l’aperçu mobile. Le tableau desktop peut demander un défilement horizontal lorsque l’inspecteur est ouvert.

Le dépôt comportait déjà des modifications sur la facturation, les abonnements, SasPay et la landing page. Elles ont été préservées. Aucun déploiement global n’a été effectué depuis cet état de travail partagé.
