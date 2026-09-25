# Fiche de reprise — audit et corrections ikadevis

Dernière mise à jour : 25 septembre 2026  
Dépôt : `Micro office ERP CALCUL`  
Commit de référence de l’audit : `0c1515affcbb9d0e5102dc48a9d955f42d2a30cc`  
État de la copie actuelle : ce même commit avec un premier lot P0 en modifications locales non commitées.

## Objectif et limites

Poursuivre la correction ciblée des constats issus de l’audit approfondi, sans réécriture générale. Le premier lot local traite le confinement de la clé SasPay entreprise et la fiabilité de la synchronisation du catalogue.

**Ne pas déployer, publier, appliquer les migrations à un Supabase distant, tourner/révoquer des clés réelles ni envoyer de paiement/e-mail sans instruction et environnement explicitement autorisés.** Aucun de ces actes n’a été exécuté dans le premier lot. Les prochains lots applicatifs restent des changements locaux, réversibles et testables.

Ne jamais afficher, copier, journaliser ou inscrire dans les rapports des secrets, jetons, sessions ou données personnelles. Une configuration `.env` locale comporte une variable `SASPAY_API_KEY` ; ne pas lire sa valeur. Utiliser les fixtures fictives existantes.

## Documents de référence

L’audit original est conservé à l’extérieur du dépôt :

`/Users/mahamanehaidara/.codex/visualizations/2026/09/25/01a0d5fc-1458-73f3-95b4-be238f9846b6/audit-ikadevis/`

Lire en premier son `README.md`, puis :

- `report/01-synthese.md` : conclusion et blocages ;
- `report/02-couverture.md` : architecture, inventaire, parcours, permissions, contrôles testés et non testés ;
- `report/03-registre.md` : les 22 fiches détaillées avec emplacement, preuve, gravité, reproduction et acceptation ;
- `report/05-plan-correction.md` : ordre original des lots et recette ;
- `report/06-executions.md` : commandes et limites des preuves.

Le premier lot et sa recette se trouvent dans [`CORRECTIONS_P0_2026-09-25.md`](CORRECTIONS_P0_2026-09-25.md). Les sorties des tests ciblés et empreintes des principaux fichiers sont conservées dans le dossier local `audit-ikadevis/corrections-p0/` adjacent aux rapports d’audit.

## État du travail

Les fichiers de code, tests, migrations et artefacts construits du premier lot sont déjà modifiés dans l’arbre de travail. Ils ne sont ni commités ni livrés. Ne pas les écraser ni réinitialiser l’arbre ; commencer par examiner `git status` et les diffs.

Le lot P0 ajoute deux migrations SQL préparées, des RPC de catalogue transactionnel, une file de sauvegarde locale et la suspension temporaire des encaissements SasPay d’entreprise. Des tests ciblés client, SQL et Edge, des tests navigateur sur serveur simulé, la compilation et l’assemblage `dist` ont réussi. Aucun Supabase réel n’a été interrogé. La CI locale a été modifiée pour exécuter ces contrôles.

Limites encore ouvertes au sein du lot P0 : les quatre tables catalogue sont atomiques chacune, mais pas ensemble ; l’écran de fusion de conflits n’existe pas, la copie peut être exportée et comparée manuellement ; les anciennes opérations sans entreprise fiable ne sont pas rejouées ; les paramètres d’entreprise conservent une ancienne file ; la rotation des anciennes clés et l’état distant restent à vérifier. Le canal entreprise SasPay doit demeurer désactivé jusqu’à un parcours serveur sûr.

La suite générale de tests a été signalée dans l’audit à **459/520 assertions et 33/58 suites en échec** sur le commit de référence. Ce lot ciblé n’a pas rendu la suite entière verte. Ne pas supprimer d’assertions ni présenter les contrôles ciblés comme un audit global réussi.

## Feuille de route consolidée — Préalable P0 et 7 Lots d'audit

### Préalable — Terminer la validation du lot P0 (Staging / Environnement isolé)

Les corrections actuelles sont locales : elles ne clôturent pas encore les risques en production.
Ce qui reste à faire :
- Comparer les migrations préparées (`migrations_payment_secret_containment_2026-09-25.sql`, `migrations_catalog_atomic_2026-09-25.sql`) au schéma Supabase réellement utilisé.
- Tester leur application sur une base isolée, notamment avec des factures déjà émises.
- Vérifier la sauvegarde et la restauration avant toute intervention distante.
- Tester deux sessions concurrentes, les anciens onglets et la mise à jour du cache PWA.
- Organiser la révocation des anciennes clés SasPay concernées : leur retrait des données publiques ne rend pas inutilisables les copies déjà récupérées.
- Coordonner migrations, proxy et frontend : publier seulement le frontend serait insuffisant.

**Validation :** aucun secret accessible aux utilisateurs, catalogue intact après échec, conflits explicites et absence de faux succès. Les encaissements entreprise restent suspendus jusqu’au lot dédié aux paiements.

---

### Lot 1 — Autorisations et isolation entre entreprises · P1

**Constats :** SEC-02, SEC-03, SEC-04. Les contournements ont été démontrés sur la base locale de test ; leur présence dans la configuration distante reste à vérifier.  
**Travaux prévus :**
- Empêcher un administrateur de créer directement un propriétaire ou de modifier illicitement le rôle, le compte ou l’entreprise d’un membre.
- Préserver la création du premier propriétaire (bootstrap). Si le transfert de propriété est retenu, le faire passer par une opération serveur dédiée, transactionnelle et journalisée.
- Interdire les relations entre ressources d’entreprises différentes : projet A associé à un client B, ligne A rattachée à un devis B.
- Étendre la vérification aux relations des factures et des écritures financières.
- Diagnostiquer les relations existantes avant d’ajouter les contraintes, sans supprimer automatiquement les données incohérentes.
- Protéger la journalisation : un visiteur ou un membre ne doit pas pouvoir fabriquer un événement pour une autre entreprise (`log_audit_event`).

**Validation :** tester chaque rôle sur deux entreprises fictives, directement via API et via l’interface. Les actions légitimes passent ; les changements de propriétaire non autorisés, relations A→B et événements forgés sont refusés.  
**Effort :** moyen à élevé. C’est le prochain lot prioritaire.

---

### Lot 2 — Persistance, caches et reprise après incident · P1

**Constats :** SEC-05 et complément REL-01. Le catalogue a reçu une première protection ; l’ensemble des données locales n’est pas encore couvert.  
**Travaux prévus :**
- Isoler les caches et brouillons par utilisateur + entreprise, notamment pour les clients, factures et paramètres.
- Empêcher une réponse tardive de l’entreprise A de remplacer l’écran de B.
- Compléter le traitement des paramètres d’entreprise, qui conservent leur ancien mécanisme de file d’attente.
- Préparer une migration conservatrice des anciennes données locales : aucune affectation automatique à une entreprise lorsque leur origine est ambiguë.
- Ajouter un parcours de résolution des conflits : comparaison des versions, choix explicite et confirmation serveur. Aujourd’hui, l’export de récupération existe, mais pas l’écran de rapprochement.
- Définir le comportement à la déconnexion et après retrait d’accès : visibilité des caches, conservation des brouillons et refus de synchronisation.

**Validation :** deux comptes, deux entreprises, plusieurs onglets, coupure réseau, fermeture puis reprise. Aucune écriture vers la mauvaise entreprise, aucune disparition silencieuse et aucun succès annoncé sans confirmation.  
**Effort :** élevé. Dépend des règles d’autorisation du lot 1.

---

### Lot 3 — Paiements, invitations et relances · P1/P2

Ce lot regroupe trois sous-lots indépendants :

| Sous-lot | Corrections | Critère de validation |
|---|---|---|
| **Abonnements** — REL-02, P1 | Donner une identité stable à chaque intention de paiement ; réutiliser son état après un double clic ou une réponse perdue ; empêcher les créations concurrentes équivalentes. | Deux appels identiques produisent au plus une demande prestataire. Un renouvellement volontaire distinct reste possible. |
| **Encaissements entreprise** — SEC-01, préalable à réouverture | Construire le parcours serveur : secret inaccessible au navigateur, contrôle du rôle et de la facture, montant et devise vérifiés, confirmation fournisseur et rapprochement comptable. | Un client ne peut ni imposer arbitrairement le montant ni déclarer une facture payée. Les répétitions ne créent pas de double règlement. |
| **Invitations et relances** — REL-04/05, SEC-06, P2 | Corriger la recherche de comptes au-delà de la première page ; distinguer invitation et modification d’accès ; rendre les relances réessayables ; échapper les données insérées dans les e-mails. | Compte existant retrouvé quelle que soit sa page ; panne d’envoi récupérable ; absence de doublon ; contenu utilisateur rendu comme texte. |

*Note : Le double débit n’a pas été démontré : le défaut identifié concerne la création de demandes distinctes lors de répétitions.*  
**Effort :** élevé au total. Tests avec prestataire simulé, puis sandbox autorisée ; aucun paiement ni e-mail réel pendant la recette.

---

### Lot 4 — Fiabilité des tests et gestion des volumes · P1

**Constats :** QA-01, REL-03.  
**Travaux prévus :**
- Réaligner le harnais sur le parcours actuel : tableau de bord, création explicite du devis, confirmation des quantités et aperçu.
- Calculer le résumé des tests à partir des résultats réels. Le message de réussite des étalons ne doit plus être inconditionnel.
- Examiner les échecs de la suite globale pour distinguer assertions obsolètes et défauts applicatifs.
- Compléter la CI avec les tests d’autorisations, de paiements et de reprise.
- Paginer les devis, factures et autres collections concernées.
- Charger les lignes détaillées à l’ouverture plutôt que toutes les lignes au démarrage.
- Calculer les totaux globaux indépendamment de la page affichée ; conserver une recherche et un export complets.

**Validation :**
- Une régression volontaire fait échouer le test, son résumé et le pipeline.
- Un jeu de 1 501 lignes, avec une API limitée à 1 000, ne produit aucune omission silencieuse.
- Recherche, totaux et exports couvrent toutes les données autorisées.  
**Effort :** moyen à élevé. La réparation du harnais doit commencer tôt, sans attendre la fin des autres lots. La troncature des données distantes reste une hypothèse à confirmer.

---

### Lot 5 — Composants UI et accessibilité · P1/P2

**Constats :** A11Y-01/02, UI-01, UX-01/02/04.  
**Travaux prévus :**
- Corriger les boutons principaux : le blanc sur `#0082FB` mesuré dans l’audit donne environ 3,76:1. Employer le `#0064E0` déjà présent dans la palette donne environ 5,39:1 pour cette combinaison.
- Associer correctement les libellés aux variables personnalisées du métré.
- Agrandir les actions de ligne et revoir leur disposition ; viser 44 × 44 px sur mobile pour les actions importantes.
- Adapter l’inspecteur de détails pour qu’il ne rende pas le tableau inutilisable sur les petites largeurs.
- Uniformiser les modales : titre accessible, navigation clavier, Échap contrôlé et retour du focus au déclencheur.
- Distinguer les notifications de succès, d’information, d’avertissement et d’erreur. Un blocage des quantités ne doit plus afficher une coche de réussite.
- Retirer l’attente artificielle de 350 ms avant l’affichage d’un écran déjà disponible.

**Validation :** parcours prioritaires aux largeurs 320, 390, 768, 1024 et 1440 px ; clavier, zoom, focus, contrastes et captures comparatives. Les calculs métier doivent rester inchangés.  
**Effort :** moyen, à répartir en petites corrections de composants communs.

---

### Lot 6 — Navigation et cohérence visuelle · P2/P3

**Constats :** UX-03, UI-02.  
**Travaux prévus :**
- Donner une URL identifiable aux principales vues et ressources : devis, facture, client, chantier.
- Rendre cohérents Retour, Suivant et rafraîchissement.
- Conserver les filtres pertinents et protéger les saisies lors d’un changement de page.
- Vérifier les autorisations lors de l’ouverture d’un lien direct.
- Rattacher les couleurs, arrondis et états des composants d’abonnement aux tokens communs, en conservant la hiérarchie des offres et l’identité existante.

**Validation :** retrouver la bonne vue après rafraîchissement, revenir à la liste avec ses filtres, protéger les brouillons et refuser un lien vers une ressource non autorisée.  
**Effort :** moyen. À réaliser après la stabilisation des accès et des caches.

---

### Lot 7 — Environnement de développement et exploitation · P1/P2

**Constats :** SEC-07, OPS-01, plus vérifications d’exploitation restées ouvertes.  
**Travaux prévus :**
- Remplacer le serveur de démarrage qui expose la racine du dépôt par un serveur limité aux fichiers publics et à l’adresse locale (loopback 127.0.0.1).
- Refuser l’accès aux fichiers `.env`, `.git` et SQL.
- Réévaluer les alertes de dépendances au moment de l’intervention, puis appliquer des mises à jour ciblées.
- Vérifier séparément les bibliothèques embarquées dans `vendor` et les versions des dépendances Edge.
- Contrôler la séparation des environnements, les permissions des fonctions, les logs et les alertes.
- Démontrer une restauration et définir les objectifs acceptables de perte de données et de délai de reprise.

**Validation :** fichiers privés inaccessibles, build reproductible, alertes traitées ou exceptions justifiées, restauration isolée réussie.  
**Effort :** faible à moyen pour l’outillage, variable pour la validation de l’infrastructure. La correction du serveur local (SEC-07) peut être réalisée immédiatement.

---

## Ordre d'exécution et portes de validation

| **Étape** | **Périmètre** | **Critère de sortie requis avant passage à l'étape suivante** | **État d'avancement** |
|---|---|---|---|
| **0** | **Validation P0 staging** (hors production) | Schéma/privilèges conformes, secrets confinés, sauvegarde restaurable, synchronisation catalogue sans faux succès | **Validé (75/75)** (`npm run test:p0`) |
| **1** | **Lot 1 (SEC-02/03/04)** + **SEC-07** | Élévations de rôle refusées, usurpation de logs bloquée, relations interentreprises étanches ; serveur local confiné au loopback | **Validé (43/43)** (`npm run test:lot1`) |
| **2** | **Lot 2 (SEC-05, REL-01)** | Caches et brouillons isolés par compte et organisation, reprise réseau robuste, pas d'écrasement interentreprises | **Validé (28/28)** (`npm run test:lot2`) |
| **3** | **Lot 3 (REL-02, SEC-01, REL-04/05, SEC-06)** | Intentions stables et sans doublon, encaissements vérifiés côté serveur, invitations et e-mails sécurisés | **Validé (24/24)** (`npm run test:lot3`) |
| **4** | **Lot 4 (QA-01, REL-03)** | Harnais aligné, CI avec comptage strict des échecs, pagination robuste sur grands volumes (1 500+ lignes) | **Validé (17/17)** (`npm run test:lot4`) |
| **5** | **Lot 5 (A11Y-01/02, UI/UX)** | Contrastes WCAG AA (notamment `#0064E0`), modales accessibles, pas d'attente artificielle, notifications sémantiques | **Validé (14/14)** (`npm run test:lot5`) |
| **6** | **Lot 6 (UX-03, UI-02)** | Routage URL universel (#devis/:id, #factures/:id...), popstate/pushState, préservation filtres, harmonisation `--sub-blue` | **Validé (28/28)** (`npm run test:lot6`) |
| **7** | **Lot 7 (OPS-01, Exploitation)** | Confinement loopback 127.0.0.1, blocage .env/.git/.sql, isolation Edge, PRA PGlite multi-tenant (RPO=0) | **Validé (15/15)** (`npm run test:lot7`) |
| **SYNTHÈSE** | **Audit Global Consolidé** | Enchaînement intégral automatisé des 8 suites de tests, 0 régression, exit code strict | **100% VALIDÉ (238/238)** (`npm run test:audit`) |


Les correctifs de SEC-07, la réparation du harnais QA et l’ajout de tests peuvent commencer en parallèle des corrections métier. Une dépendance de code n’implique pas qu’on doive attendre pour documenter ou préparer les tests.

## État de production et critères généraux

La configuration Supabase réellement déployée n’a pas été inspectée. Les défauts P0/P1 constatés sont issus du dépôt, de simulations locales et/ou de PostgreSQL en mémoire. Ne pas transformer une correction locale ou des tests PGlite en preuve que la production est protégée.

Le produit n’est pas prêt à recevoir un feu vert global avant : validations staging du lot P0, contrôles des lots B–F couvrant les fonctions sensibles, état déployé comparé au dépôt, récupération testée et parcours critique métier accepté. Les sujets visuels et d’accessibilité s’ajoutent à ces critères ; ils ne compensent aucun contrôle de sécurité qui échoue.

## Démarrage dans le prochain chat

1. Lire cette fiche puis `docs/CORRECTIONS_P0_2026-09-25.md` et les fiches ciblées du registre original.
2. Vérifier l’état Git et les modifications déjà présentes ; ne pas reset/revert le premier lot.
3. Pour commencer les corrections restantes, prendre le prochain lot P1 **B — SEC-02/03/04**, sauf si l’utilisateur demande explicitement de finir d’abord la recette P0 staging. SEC-07 et QA-01 peuvent avancer en parallèle en local.
4. Commencer par les tests de reproduction et l’inventaire des migrations/règles actuelles ; créer des migrations ciblées compatibles avec le premier lot ; exécuter seulement les tests pertinents et autorisés.
5. Respecter la règle : pas de déploiement ni d’écriture à une base distante dans ce contexte sans autorisation distincte et explicite.

Copier ce message dans le nouveau chat :

> Reprends les corrections de l’audit ikadevis à partir de `docs/FICHE_REPRISE_AUDIT.md`. Lis la fiche, le bilan P0 et le registre original. Préserve les modifications locales déjà présentes. Commence par le lot B (SEC-02/03/04) et avance en local avec des fixtures fictives, tests ciblés et migrations préparées. Ne déploie rien, n’applique aucune migration distante, ne touche pas aux clés réelles et ne révèle aucun secret. Signale les hypothèses et preuves au fur et à mesure.
