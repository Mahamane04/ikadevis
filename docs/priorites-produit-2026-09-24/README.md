# Première livraison des priorités produit — 24 septembre 2026

**État : publiée sur https://app.ikadevis.com/ le 24 septembre 2026 après recette sur staging. Protections serveur actives, clé SasPay enregistrée par l’utilisateur. Paiement réel non testé ; dépenses encore locales.** Voir le [point de publication](publication.md).

## Ce qui est disponible en ligne

### Importer un bordereau dans un devis

Dans **Chiffrage → Importer Excel / CSV**, sélectionner un fichier `.xlsx`, `.xls`, `.csv`, `.tsv` ou coller un tableau.

- Choix de la feuille et de la ligne des en-têtes, association des colonnes.
- Désignations, unités, quantités, prix de vente HT et lots conservés. Coût unitaire facultatif.
- Aperçu avec montants recalculés et contrôle d’un montant HT fourni. Les lignes invalides empêchent l’import jusqu’à correction de la source ou exclusion explicite.
- Sous-totaux et titres exclus par l’utilisateur, sans suppression silencieuse des lignes répétées.
- Ajout au devis en cours, sans écraser les lots déjà renseignés, le client ou le chantier. Annulation par l’action habituelle du devis.
- Tableau sur ordinateur, cartes lisibles sur smartphone. Fenêtre au premier plan, bouton de validation visible.
- Coûts absents signalés. La marge est à compléter, jamais présentée comme connue pour un lot incomplet. Un coût explicitement nul est distingué d’un coût absent.
- Exemple téléchargeable : `assets/templates/bordereau-ikadevis.csv`.

Limites de cette première version : 5 Mo, 1 000 lignes de travaux par import, prix HT dans la devise du devis. Un BPU doit avoir ses quantités renseignées avant l’import. Les formules Excel utilisent les valeurs déjà enregistrées dans le fichier ; elles ne sont pas recalculées. Les ouvrages importés sont des lignes libres, sans recette technique inventée. Les anciens fichiers CSV non UTF-8 doivent être réexportés en UTF-8. La bibliothèque Excel est chargée à la demande ; une première lecture Excel hors connexion n’est pas garantie.

### Comparer le prévu et les coûts du chantier

Dans **Dépenses → Rentabilité du chantier**, choisir le chantier et le devis de référence.

- Comparaison d’un seul devis retenu : les versions ou propositions concurrentes ne s’additionnent pas.
- Budget de coûts directs, frais généraux prévus, dépenses réellement saisies et dépassement du budget.
- Factures fournisseurs impayées incluses dans les coûts. Paiements et remboursements non additionnés une deuxième fois.
- TVA récupérable exclue du coût, TVA non récupérable incluse, répartition entre chantiers et taux de conversion enregistrés respectés.
- Liste des dépenses retenues, alertes sur les affectations ambiguës, conversions absentes ou coûts prévus incomplets.
- Saisie d’un reste à dépenser pour simuler la marge de fin de chantier. Cette simulation n’est pas enregistrée.

Le résultat est **provisoire** : il dépend des coûts renseignés et affectés au chantier. Le suivi par lot, les stocks consommés, les pointages et la clôture définitive du chantier restent à développer. Le composant utilise les dépenses existantes : en cas de base Finances non migrée, le mode local est clairement annoncé.

## Protections serveur déployées

- Quotas en base pour devis, chantiers actifs et membres : essai 3 / 1 / 1 ; Standard devis et chantiers illimités, 5 membres ; Entreprise illimitée. Tarifs inchangés.
- Verrou par entreprise pour sérialiser les créations. Mise à jour des données existantes conservée au plafond ou après expiration ; réouverture d’un chantier soumise au quota.
- Organisation explicitement choisie et adhésion vérifiée pour toute action d’abonnement.
- Cache d’abonnement séparé par utilisateur et entreprise, réponses tardives d’une ancienne entreprise ignorées.
- Activation et marqueur de paiement dans une même transaction. Rejeu idempotent et reprise après panne.
- Montant et devise confirmés obligatoires. Aucun succès supposé à l’expiration du délai.
- Historique dans les formules avec vérification manuelle d’un paiement sans demander un nouveau débit. Affichage d’un abonnement expiré corrigé ; renouvellement de la même formule possible.
- Invitations : contrôle de l’abonnement et des places avant l’envoi ; limite finale appliquée par le trigger. Une réinvitation ne modifie pas le rôle du propriétaire.

Un changement de formule pendant une période payée est refusé **avant débit**, jusqu’à définition d’une règle de prorata. Renouveler la même formule prolonge la période. Deux paiements de formules différentes initiés avant une première activation peuvent nécessiter un rapprochement manuel. Pour les invitations simultanées, le quota en base reste garanti, mais l’envoi d’un e-mail et l’ajout du membre ne sont pas une transaction commune.

### Ordre d’activation sur staging

1. Vérifier le schéma en place et l’application de `migrations_saas_subscriptions_2026-09-24.sql`.
2. Appliquer `migrations_saas_entitlements_2026-09-24.sql` dans une transaction.
3. Déployer ensemble les nouvelles versions de `saspay-proxy` et `invite-member`, puis le frontend.
4. Vérifier avec deux comptes de test et deux entreprises : permissions, quotas, mise à jour au plafond, historique et changement d’organisation.
5. Valider le paiement avec un environnement de test du prestataire : succès, attente, rejet, interruption puis reprise. Aucun paiement réel effectué ici.
6. Publier ensuite la version validée. Ne pas publier seulement le frontend ou seulement le proxy : le nouveau contrat inclut l’organisation active et une RPC d’activation.

La publication suivante a activé ces protections sur les deux bases et confirmé la présence du secret SasPay ajouté par l’utilisateur en production. La recette SQL réelle sur staging a réussi ; la recette de paiement prestataire reste à effectuer. Voir [publication.md](publication.md).

## Vérifications réalisées

**154 contrôles automatisés réussis** :

| Suite | Contrôles |
|---|---:|
| Abonnements, quotas SQL, RLS, transaction et caches | 31 |
| Import CSV/Excel, reprise des devis et coûts chantier | 34 |
| Régressions du parcours de découverte | 36 |
| Régressions financières et statuts | 24 |
| Propagation des quantités | 16 |
| Répartition des prix de vente | 13 |

Le banc SQL utilise PGlite, un moteur Postgres local. Il valide notamment le refus d’écriture de l’abonnement par un utilisateur, l’impossibilité d’appeler la RPC privilégiée, les limites, l’isolation des lectures, le rollback complet après une panne simulée et le rejeu. Il ne remplace pas une recette réseau sur Supabase ; aucun test de concurrence multi-connexion n’a été réalisé.

Parcours réels dans le navigateur, sur l’origine de test isolée `http://127.0.0.1:8122/` :

- Fichier XLSX : 3 ouvrages, 2 lots, **1 217 500 FCFA HT / 1 436 650 FCFA TTC**. Enregistrement local puis reprise après actualisation.
- Import complémentaire avec sous-total invalide : blocage puis exclusion explicite, ajout conservant les deux lots existants, annulation restaurant ces deux lots.
- Unité m³ conservée et visible dans l’éditeur.
- Facture fournisseur fictive de **100 000 FCFA HT / 118 000 FCFA TTC**, affectée au chantier : coût réel retenu de 100 000. Avec 800 000 restant à dépenser, projection **317 500 FCFA**.
- Contrôles visuels à 360 et 390 px ; bureau à 1440 px. Pas de débordement de page à 360 px ; validation de l’import visible au-dessus de la navigation. Aucune erreur de console observée.
- Compilation et assemblage `dist/` réussis, ressources présentes, vérification des espaces de diff réussie.

Aucun envoi client, invitation réelle, paiement, essai sur téléphone physique ou synchronisation entre appareils effectué.

Lancer les nouveaux bancs : `npm run test:priorities`. Les dépendances et le parser Excel ont été conservés localement ; provenance et licence dans `js/vendor/README.md`.

## Suite proposée

1. Recette du paiement prestataire et synchronisation cloud des dépenses ; la publication coordonnée des protections est effectuée.
2. Lien client pour consulter/accepter un devis, avec historique et preuve d’acceptation.
3. Validation interne des devis en équipe.
4. Comparatif fournisseurs, pointages et rentabilité détaillée par lot.

Les travaux antérieurs du dépôt ont été conservés. Les copies des fichiers existants touchés au démarrage de cette intervention sont dans `/tmp/ikadevis-priorities-before`.
