# Plan de correction — découverte d’ikadevis

Date : 24 septembre 2026. Statut : corrections C01–C09 implémentées ; recette locale réalisée le 24 septembre. Validation cloud, appareils physiques et pilote en attente. Voir [le compte rendu](corrections-decouverte-2026-09-24/README.md).

Source : [audit de découverte, 17 étapes illustrées](audit-decouverte-2026-09-24/rapport.html).

## Résultat attendu

Un entrepreneur qui découvre ikadevis doit pouvoir produire un premier devis dont il comprend les quantités, les prix et la marge, puis retrouver ce devis et préparer son envoi. Le parcours cible est : **mes travaux → mes quantités → mes prix d’achat → ma marge → mon document**.

On conserve la base visuelle actuelle et les fonctions avancées. Le travail porte sur les défauts observés et les décisions que le premier utilisateur doit prendre. La comparaison avec un vrai téléphone et des entrepreneurs réels reste nécessaire : l’audit a simulé un premier usage, en démonstration locale.

## Ordre des livraisons

| Lot | Priorité | Objectif | Dépendance | Sortie attendue |
|---|---|---|---|---|
| 1. Fiabilité du document et de l’envoi | P0 | Éliminer les défauts observés | Aucune | Devis complet, montants cohérents, envoi mobile accessible |
| 2. Quantités, coûts et marge compréhensibles | P1 | Permettre de vérifier son prix | Lot 1 pour les règles monétaires | L’entrepreneur confirme ses quantités et adapte ses prix |
| 3. Premier devis guidé | P1 | Réduire les hésitations et la saisie initiale | Lot 2 | Parcours court, reprenable, sans données fictives implicites |
| 4. Relecture mobile et passage au compte | P1 | Passer du devis d’essai à un document personnel | Lots 1 et 3 | Document lisible et transition sans perte du devis |
| 5. Recette complète et pilote | Validation | Vérifier le résultat en conditions réelles | Lots 1 à 4 | Preuves de bon fonctionnement avant élargissement commercial |

P0 : à traiter en premier, avant une nouvelle livraison destinée à un usage autonome. P1 : nécessaire pour améliorer l’adoption, sans attendre une refonte esthétique complète.

## Lot 1 — Fiabilité du document et de l’envoi

### C01 — Rendre le panneau d’envoi accessible sur mobile

- [x] Corriger la superposition entre l’aperçu et le panneau d’envoi.
- [x] Vérifier ouverture, fermeture, retour à l’aperçu et navigation au clavier. Le panneau actif doit recevoir le focus ; les contrôles derrière lui ne doivent pas être accessibles.
- [x] Simplifier les consignes : « Téléchargez le PDF, puis joignez-le à votre message. » Ne pas annoncer une pièce jointe déjà présente lorsqu’elle est manuelle.

**Acceptation :** depuis l’aperçu à 360 et 390 px, Envoyer affiche un panneau visible et utilisable. Fermer revient au même devis. Même fonctionnement sur ordinateur. Aucun message réel envoyé pour cette vérification.

Références : étapes 15–16.

### C02 — Conserver la description commerciale dans le document

- [x] Suivre le texte depuis la saisie, la sauvegarde et la réouverture jusqu’aux deux aperçus et au PDF réellement généré.
- [x] En Synthèse, afficher la description sous l’ouvrage. En Détaillé, conserver le lien avec l’ouvrage et sa description avant sa décomposition.
- [x] Vérifier textes longs, accents, retours à la ligne, caractères spéciaux et absence de description.

**Acceptation :** le texte « Mur de clôture… 20 m de long sur 2 m de haut » est présent après sauvegarde/réouverture et dans le PDF, sans perte ni chevauchement. Les coûts internes ne sont pas exposés par cette correction.

Références : étapes 8, 13–14 et 17.

### C03 — Harmoniser les arrondis et les valeurs affichées

- [x] Identifier la règle actuellement utilisée pour quantités, prix unitaires, totaux de ligne, remises et marges. L’audit montre un écart ; il n’établit pas sa cause dans le moteur.
- [x] Définir une règle commune entre éditeur, aperçu et PDF. Conserver la précision de calcul et rendre la précision affichée suffisante pour expliquer le total ; si une régularisation est indispensable, elle doit être explicite.
- [x] Corriger aussi l’écart d’un franc entre la marge du mode simple et celle du mode avancé.
- [x] Ne pas recalculer silencieusement les anciens documents enregistrés. Vérifier leur comportement séparément.

**Acceptation :** le cas 40 m² de l’audit ne présente plus un prix affiché de 9 668 FCFA face à un total inexpliqué de 386 722 FCFA. Les marges simple/avancée concordent. Contrôles couvrant unités, m², m³, quantités décimales, remises, perte, plusieurs lignes et devis existants. Le résultat ne doit pas être une simple retouche visuelle masquant une divergence.

Références : étapes 10, 13 et 17.

## Lot 2 — Quantités, coûts et marge compréhensibles

### C04 — Faire confirmer les valeurs initiales

- [x] Après le choix d’un ouvrage, ouvrir la saisie du métré avant de présenter son prix comme prêt.
- [x] Pour un nouveau devis réel, ne pas valider implicitement les 10 m² d’exemple. Distinguer clairement les données de démonstration, les valeurs du catalogue et les données saisies.
- [x] Donner un accès évident à « Modifier la quantité ». Proposer, lorsque le modèle le permet, dimensions ou surface connue avec résultat visible.
- [x] Identifier les paramètres à vérifier : quantité, prix d’achat, frais, marge et TVA. Ne pas imposer ni recommander un taux fiscal à partir de cet audit.

**Acceptation :** un nouveau mur n’apparaît pas comme un ouvrage chiffré définitif avant confirmation de sa quantité. L’entrepreneur sait quelles valeurs il a saisies et lesquelles viennent du catalogue.

Références : étapes 7–8 et 13.

### C05 — Permettre de vérifier et adapter ses coûts

- [x] Sur mobile, remplacer la table comprimée par des blocs « ressource, quantité, prix d’achat, coût », avec les détails de pertes et conditionnement dépliables. Garder le tableau sur ordinateur.
- [x] Ajouter une action directe « Modifier mes prix » depuis cette étape.
- [x] Par défaut, appliquer une modification au devis courant. Toute mise à jour du catalogue partagé doit être une action distincte et explicite.
- [x] Afficher la marge dans le parcours simple, avec un exemple en FCFA et une explication courte de sa base de calcul. Garder les modes avancés accessibles.

**Acceptation :** je peux remplacer le prix d’un agglo par celui de mon fournisseur, voir le nouveau coût et la nouvelle marge, sauvegarder puis retrouver ces valeurs. Les autres devis et le catalogue restent inchangés si je n’ai pas demandé leur modification. Aucun tableau essentiel ne déborde à 360 px.

Références : étapes 9–10. Ce lot peut nécessiter une évolution de la conservation des prix propres à un devis ; vérifier l’existant avant de l’implémenter.

## Lot 3 — Premier devis guidé

### C06 — Clarifier le point de départ

- [x] Pour un nouvel espace, faire de « Créer mon premier devis » l’action principale, puis « Reprendre mon devis » lorsqu’un travail existe.
- [x] Éviter l’objectif financier arbitraire avant configuration. Afficher durablement « Démonstration » dans l’essai mobile.
- [x] Présenter une progression courte : Travaux → Quantités → Prix et marge → Vérification. Permettre de revenir en arrière et de reprendre plus tard sans perte.
- [x] Conserver un accès rapide au fonctionnement habituel pour les utilisateurs expérimentés.

**Acceptation :** un utilisateur sait par où commencer et quelle est la prochaine étape, sans devoir comprendre l’organisation de tous les modules.

Références : étapes 1–3 et 11.

### C07 — Réduire la saisie initiale et les choix inutiles

- [x] Autoriser le chiffrage avant les coordonnées complètes du client ; demander les informations nécessaires au document au moment opportun.
- [x] Dans les créations rapides, privilégier le nom du client et le nom du chantier. Regrouper les autres champs sous « Informations complémentaires » et préciser ceux qui sont facultatifs.
- [x] Supprimer la ville arbitrairement préremplie. Ne pas classer implicitement un chantier encore en devis comme « En cours » ; vérifier les statuts disponibles avant de fixer ce comportement.
- [x] Ne pas imposer « Installation de chantier » à une ligne de maçonnerie. Proposer un lot neutre ou adapté, modifiable.
- [x] Pour un premier ouvrage, privilégier une seule action Ajouter. Réserver la sélection multiple à une option explicite.
- [x] Employer « chantier » de manière cohérente dans ce parcours et associer correctement les libellés aux champs.

**Acceptation :** créer un devis de mur ne demande ni budget déjà connu, ni NIF, ni coordonnées complètes. L’absence d’informations facultatives ne bloque pas le brouillon. Les étapes de vérification rendent explicites les données nécessaires avant utilisation réelle du document.

Références : étapes 3–6.

## Lot 4 — Relecture mobile et passage au compte

### C08 — Rendre le devis facile à relire

- [x] Sur smartphone, proposer une lecture adaptée des ouvrages, quantités et montants ; conserver une vue du document imprimable avec zoom ou défilement adapté.
- [x] Empêcher les nombres de se casser au milieu des chiffres. Garder le total, la TVA et la description lisibles.
- [x] Réduire l’espace occupé par les réglages avant le document. Faire de PDF/Envoyer les actions principales de ce moment du parcours, et conserver Convertir en facture dans les actions accessibles.

**Acceptation :** à 360 et 390 px, le devis de 40 m² se relit sans reconstituer des nombres coupés. Le PDF exporté conserve sa mise en page et toutes ses informations.

Références : étapes 12–13 et 17.

### C09 — Expliquer la sauvegarde et guider vers le compte

Implémentation locale terminée. Le passage vers l’inscription et son interruption ont été vérifiés ; la récupération après authentification et la synchronisation sur un autre appareil restent à éprouver avec un compte connecté.

- [x] Distinguer durablement sauvegarde locale de démonstration et synchronisation d’un compte connecté.
- [ ] Après le premier devis d’essai, proposer une action claire pour créer un compte et conserver le travail. Vérifier la reprise effective avant de promettre une conservation automatique.
- [x] Préserver le devis lors d’une interruption, d’un échec ou d’une annulation de l’inscription ; éviter les duplications lors de la reprise.
- [x] En démonstration, remplacer l’envoi ambigu par une explication et une action vers le compte personnel. Conserver le PDF d’essai identifié comme tel.
- [x] Guider la personnalisation de l’entreprise avant le premier document réel.

**Acceptation :** l’utilisateur comprend où son devis est enregistré. Le passage à un compte conserve les travaux, quantités, prix, marge et description après connexion, ou expose clairement une étape de récupération sans perte. Les éventuels doublons avec les exemples sont traités.

Références : étapes 11, 14–16. La reprise démo → compte est à vérifier techniquement : elle n’a pas été éprouvée dans l’audit.

## Lot 5 — Recette complète et pilote

- [x] Rejouer le scénario mur de 40 m² sans consulter le code, puis un devis à plusieurs lots incluant volume, surface et ligne libre.
- [x] Inspecter le fichier PDF réel, pas seulement son aperçu ou le message de téléchargement.
- [ ] Vérifier un compte de test connecté : sauvegarder, fermer, rouvrir et retrouver le devis sur un autre appareil.
- [x] Contrôler 360, 390, 768 et 1440 px dans le navigateur.
- [ ] Contrôler un iPhone et un Android réels avec clavier ouvert et connexion dégradée.
- [x] Vérifier le focus et Échap du panneau d’envoi, les intitulés des nouveaux champs, les modales et la récupération après interruption locale.
- [ ] Compléter la vérification au lecteur d’écran et avec zoom système ; ces contrôles ne valent pas certification d’accessibilité globale.
- [ ] Faire tester le premier devis par 3 à 5 entrepreneurs, sans leur expliquer les boutons. Relever réussite sans aide, blocages, temps jusqu’au premier document et compréhension du coût/marge. Le temps cible sera fixé après cette première observation, pas inventé à l’avance.
- [ ] Préparer une version de test isolant les corrections des autres travaux en cours sur le dépôt. Documenter les changements et le retour à la version précédente avant publication.

**Condition de passage au pilote autonome :** aucun défaut bloquant sur création, reprise, relecture et préparation de l’envoi ; descriptions conservées ; montants explicables ; aucun travail perdu lors des retours ou de l’inscription.

**Condition supplémentaire pour faire payer :** valider séparément l’abonnement, les paiements, l’activation de formule et les échecs. Ce plan UI/UX ne constitue pas une validation de ces parcours.

## Suivi des décisions et risques

- Les 56 contrôles précédents ne prouvent pas les nouveaux parcours : compléter les tests ciblés pour les défauts et comportements de ce plan.
- Priorité de réalisation : C01 → C02 → C03 → C04/C05 → C06/C07 → C08/C09 → recette. Livrer et vérifier un lot à la fois.
- Avant le lot 2, fixer la portée des prix personnalisés ; avant le lot 3, vérifier la gestion des brouillons et du statut chantier ; avant le lot 4, vérifier la reprise vers un compte.
- Aucun délai ferme annoncé sans diagnostic de ces trois dépendances. C01 et C02 sont ciblés ; C03 exige une vérification transversale ; C05 et C09 sont les changements les plus sensibles pour la conservation des données.
- L’audit n’a pas validé les recettes de construction, les prix fournisseurs ou la fiscalité. Ne pas présenter les exemples comme des prix garantis.
- La recherche « mur », le calcul interactif, la saisie plein écran et l’enregistrement local observés comme fonctionnels sont à préserver.

## Livraison locale du 24 septembre

92 contrôles automatisés passent ; deux PDF réels de deux pages et quatre largeurs contrôlés. Le diff de cette intervention est isolé dans `corrections-decouverte-2026-09-24/corrections-seules.patch`. La préparation d’une release distincte des changements antérieurs et sa publication restent à faire. Aucun déploiement, message client ou paiement pendant cette intervention.
