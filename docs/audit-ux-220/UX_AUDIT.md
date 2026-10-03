# ikadevis — audit UX/UI 220 contrôles · constats

Branche `audit/ux-220-2026-10`, base `5422d42` (= production). Environnement :
serveur isolé `127.0.0.1:8299` servant `config.example.js` (URL Supabase
factice), toute requête externe bloquée ; Mode Démo, données fictives.
Navigateur : Chromium (pane intégré + Puppeteer headless). Statut du
document : **clos le 2026-10-03** — corrections faites et testées par bancs ;
rejeu des sondes **partiel** (voir § Retest final : ce qui est validé, ce
qui reste ouvert, ce qui n'a pas été rejoué).

**Déclaration des contextes (C214)** : tous les essais sont faits en
émulation Chromium (1440×900, 1024, 768, 390×844 @3×, 360, 320 ; toucher et
réseau émulés). Aucun appareil physique, aucun Firefox ni Safari/WebKit
(non installés ; aucun téléchargement de navigateur n'a été autorisé dans
cette session). Les comportements propres à iOS Safari (zoom des champs,
`100dvh`, clavier virtuel) et aux lecteurs d'écran réels (VoiceOver, NVDA,
TalkBack) ne sont donc **pas démontrés** : les régions live, rôles et noms
accessibles sont vérifiés dans l'arbre d'accessibilité, pas à l'écoute.

Types : DF défaut fonctionnel reproduit · A11Y non-conformité démontrée ·
UX friction observée · HYP hypothèse à valider · PREF préférence argumentée.
Priorités : P0 perte de données / engagement financier erroné · P1 tâche
essentielle impossible · P2 pénible / incohérent · P3 finition.

## Constats

### UX-P0-01 · Un rechargement fait disparaître clients, chantiers et factures — puis la saisie suivante les écrase définitivement
- **Type** DF · **Priorité P0** · rôle : visiteur en démo (parcours « Essayer sans compte ») · contrôles 064, 096, 097, 155, 174, 176
- **Étapes** : créer un client « SARL Test Audit », un devis, le facturer, émettre FACT-2026-001, enregistrer 2 règlements (500 000 + 966 781 FCFA) → recharger la page → « Essayer sans compte ».
- **Observé** : Factures « Toutes 0 » ; le client n'est plus listé ; le devis propose de nouveau « Facturer ». Créer un client écrase la liste stockée (« SARL Test Audit » effacé du stockage). Refacturer puis émettre attribue **une seconde fois FACT-2026-001** et **écrase la facture réglée** (statut paid → issued, règlements perdus).
- **Attendu** : les données saisies réapparaissent à l'identique ; un devis facturé reste lié à sa facture ; un numéro légal n'est jamais réattribué.
- **Cause** : `LS.get/LS.set(clé, activeOrganizationId)` place l'identifiant d'organisation dans le paramètre *utilisateur* de `TenantPersistence.getKey(clé, userId, orgId)` ; l'organisation est alors lue dans un contexte mutable, posé APRÈS les initialiseurs `useState`. Écriture en session → `costcalc:org_default:org_default:<clé>` ; lecture au démarrage → `costcalc:org_default:global:<clé>`, absente des clés de repli → données de démonstration. Concerne `clients`, `projects`, `invoices` (App) et `finance`, `depenses` (écrans Finances / Dépenses).
- **Corollaire** : l'isolation « utilisateur + organisation » annoncée au lot 2 (SEC-05) n'existe pas pour ces données — la clé ne contient aucun identifiant utilisateur.
- **Périmètre démontré** : Mode Démo. Mode connecté : même code de cache, NON TESTÉ (compte réel requis) — risque plausible hors ligne ; en ligne, le chargement serveur remplace l'état.
- **Preuve** : sondes navigateur consignées dans `UX_FIX_LOG.md` (état du stockage avant/après).

### UX-P2-01 · « Chantier Multi-Lots » : un chantier fictif est créé et imprimé sur le devis client
- **Type** DF · P2 · contrôles 003, 009, 094, 170
- Devis enregistré sans chantier choisi → la liste et le **document client** affichent « Chantier Multi-Lots », et un chantier de ce nom est **créé** dans le stockage. Aucun chantier n'a été demandé. Attendu : champ chantier vide (ou « Chantier non renseigné » côté liste), aucune création implicite.

### UX-P2-02 · Montant de règlement prérempli « 1466781.3 » en FCFA
- **Type** DF · P2 · contrôles 055, 174, 180
- La fenêtre affiche « Reste à payer 1 466 781 FCFA » mais préremplit le champ avec `1466781.3` (décimales et point, devise sans centimes). Le TTC de la facture est stocké avec 0,30 F de fraction. Le solde reste correctement « Réglée » (tolérance), donc pas de solde fantôme. Attendu : montant arrondi selon la devise, identique à l'affichage.

### UX-P2-03 · Compteurs de filtres des factures faux
- **Type** DF · P2 · contrôles 074, 084, 094
- Facture émise et réglée : « Toutes 1 · Non réglées 0 · **Soldées 0** · Brouillons 0 ». La facture réglée n'apparaît dans aucun filtre de statut. (À recontrôler après correction de UX-P0-01.)

### UX-P2-04 · Les fenêtres n'ont pas de nom accessible
- **Type** A11Y (WCAG 4.1.2) · P2 · contrôles 031, 125
- « Nouveau Client », « Facturer DEV-… » : `role="dialog"` sans `aria-label` ni `aria-labelledby`, alors qu'un titre visible existe. À l'inverse « Émettre la facture » et « Enregistrer un règlement » sont nommées — le défaut n'est pas général mais touche plusieurs fenêtres.

### UX-P2-05 · Le focus n'est jamais déplacé après un changement d'écran
- **Type** A11Y (WCAG 2.4.3) / UX · P2 · contrôles 032, 122, 124
- Après « Créer mon premier devis », l'ajout d'un ouvrage (le champ suivant à remplir est « Surface directe »), l'ouverture d'une fiche devis : `document.activeElement` = `<body>`. Le clavier et le lecteur d'écran repartent du haut de page.

### UX-P2-06 · L'adresse ne suit pas certaines navigations
- **Type** DF · P2 · contrôles 015, 016
- « Créer mon premier devis » → éditeur, URL vide. « Facturer » depuis `#devis/<id>` → écran Factures, URL toujours `#devis/<id>` : un rechargement ramène au devis. (Les fiches devis ont bien `#devis/<id>`.)

### UX-P2-07 · Contraste insuffisant : message d'état et teinte secondaire du design system
- **Type** A11Y (WCAG 1.4.3) · P2 · contrôle 131
- « Enregistré sur cet appareil. » 2,56:1 (11 px) ; teinte `#8F9CA8` (« ⌘K », « Menu », « • ») 2,8:1 sur les 12 écrans ; « Actuelle » 4,23:1 (9 px). Mesuré sur les 24 combinaisons écran × largeur.

### UX-P2-08 · Carte « Formule Starter » cliquable à la souris, inatteignable au clavier
- **Type** A11Y (WCAG 2.1.1) · P2 · contrôles 121, 202
- `div` avec `cursor:pointer`, ni rôle ni `tabindex` (barre latérale, 12 écrans desktop). Idem nom de lot « Lot 01 — Travaux » dans l'éditeur.

### UX-P2-09 · Démo : « Envoyer / Partager / Signer » proposés sur un document marqué « À ne pas envoyer à un client »
- **Type** UX · P2 · contrôles 009, 041, 178
- Conséquence d'une décision produit documentée (seule la raison sociale est obligatoire, `CHAMPS_LEGAUX_BLOQUANTS = ['name']`) — décision **respectée**. Reste la contradiction en démo : à arbitrer (masquer l'envoi en démo, ou expliquer).

### UX-P2-10 · Après rechargement, la démo renvoie à l'écran de connexion sans dire que le travail est conservé
- **Type** UX · P2 · contrôles 097, 103
- Seul « Essayer sans compte » est proposé ; rien n'indique « Reprendre ma démonstration ». (Les devis sont bien conservés ; le reste ne l'est pas — voir UX-P0-01.)

### UX-P2-11 · Échap ne ferme pas « Nouveau Client »
- **Type** A11Y (WCAG 2.1.2 / modèle APG dialog) · P2 · contrôles 035, 123
- Vraie touche Échap : fenêtre toujours ouverte, focus sur « Fermer ». La fermeture au clavier était codée fenêtre par fenêtre, et celle-ci manquait — l'affirmation « fermeture des modales par Escape » de l'audit du 25/09 ne vaut pas pour toutes les fenêtres.

### UX-P2-12 · « Confirmez les quantités » sans dire où
- **Type** UX · P2 · contrôles 005, 062
- L'enregistrement est refusé à juste titre, mais le bouton « Confirmer mes quantités » vit dans l'inspecteur, refermé après une navigation. Le message ne mène pas à l'ouvrage concerné. Proposition : R6.

### UX-P3-01 · Nom accessible qui ne contient pas le texte visible
- **Type** A11Y (WCAG 2.5.3) · P3 · contrôle 129
- « IKADEVIS BTP » → « Changer d'organisation » ; « Nouveau » → « Créer une facture depuis un devis ». (Les autres écarts relevés par l'heuristique sont des faux positifs : listes déroulantes, initiales d'avatar.)

### UX-P3-02 · Cible tactile de suppression 14 × 20 px (mobile)
- **Type** A11Y (WCAG 2.5.8) · P3 · contrôle 136 — « Supprimer le devis DEV-2026-001 » à 390 px.

### UX-HYP-01 · Trois appels à l'action concurrents et « Créer mon premier devis » alors qu'un devis existe
- **Type** HYP / UX · contrôles 001, 026, 104 — à confirmer par étude utilisateur.

### UX-HYP-02 · Facture : le détail de l'ouvrage est remplacé par « Lot 01 — Travaux · 1 lot »
- **Type** HYP · contrôle 176 — peut être un choix (facturation par lot). À valider avec l'utilisateur.

### UX-DEC-01 · Attente de 350 ms entre pages et sur les fiches — décision produit à arbitrer
- **Type** décision · contrôle 149
- Ajoutée volontairement le 2026-09-16, retirée par l'audit du 25/09 (UX-04), **rétablie** par `ff40ffe` — qui a aussi changé l'assertion du test lot 5 (`=== 0` → `=== 350`) alors que l'en-tête du test dit toujours « suppression des délais artificiels » : **faux vert**. Non modifié ici ; mesure et arbitrage à présenter.

## Constats du lot 4 — sondes G1–G9 et audit G10

333 échecs bruts des sondes, regroupés en défauts distincts puis vérifiés
dans le code. Détail des causes et corrections : `UX_FIX_LOG.md` § Lot 4.
Seuls les constats confirmés figurent ici ; les faux positifs de sonde sont
listés dans le journal.

| Id | Constat (contrôles) | Type | Prio | Statut |
|---|---|---|---|---|
| UX-P1-01 | Deux onglets : le second efface les créations du premier, numéro de devis attribué deux fois (C158) | DF | P1 | corrigé |
| UX-P1-02 | « Marquer envoyées » en lot : brouillon sans numéro légal passé « envoyé », facture réglée repassée « envoyée » (C066/C070/C078) | DF | P1 | corrigé |
| UX-P1-03 | Import « Remplacer tout » : matières des ouvrages supprimées sans confirmation (C165/C166) | DF | P1 | corrigé |
| UX-P1-04 | Première visite : rechargement en pleine saisie (C143) | DF | P1 | corrigé |
| UX-P1-05 | Démo : une « nouvelle entreprise » montre les données de la précédente (C107) | DF | P1 | corrigé (création refusée en démo, expliquée) |
| UX-P1-06 | Stockage plein : écriture perdue sans avertissement (G8 S4) | DF | P1 | **partiellement corrigé** : l'avertissement s'affiche, mais le message de succès « enregistré en local » aussi (voir § Défauts restants) |
| UX-P1-07 | Le logo « Tableau de bord » ouvre l'écran Factures (C018) | DF | P1 | corrigé |
| UX-P2-13 | Dates jj/mm/aaaa lues comme mm/jj : « Ce mois » vide, brouillons mal classés (C082/C075) | DF | P2 | corrigé |
| UX-P2-14 | Indicateurs du tableau de bord inexacts ou muets (à suivre, 0 %, période, reste à encaisser, retards) (C081–C086) | DF/UX | P2 | corrigé |
| UX-P2-15 | Document de facture : horodatage brut, « 1.00 », quittance au nom d'une autre entreprise (C095/C180) | DF | P2 | corrigé |
| UX-P2-16 | Recherche sensible aux accents, contact non cherchable (C071) | UX | P2 | corrigé |
| UX-P2-17 | Fichiers : CSV Windows altéré en silence, export hors périmètre et sans BOM, deux noms de PDF (C161–C168) | DF | P2 | corrigé |
| UX-P2-18 | Saisie perdue à la fermeture des fenêtres de création (C034) ; dépense perdue via « Ajouter un compte » (C057) | UX | P2 | corrigé (brouillons restaurés) |
| UX-P2-19 | Raccourcis actifs sous une fenêtre ; Échap ferme trop ; focus perdu (C033/C118/C123/C124) | A11Y | P2 | corrigé |
| UX-P2-20 | Annonces : régions live tardives, messages effacés, chronomètre annoncé, glyphes d'icônes dans les noms (C127/C137/C139) | A11Y | P2 | corrigé |
| UX-P2-21 | Focus invisible, limites de champs à 1,2:1, titre d'onglet unique, autocomplete absent (C124/C132/C140/C110) | A11Y | P2 | corrigé |
| UX-P2-22 | Signature : tracé décalé, rien au doigt, signature vide acceptée (C130) | DF | P2 | corrigé |
| UX-P2-23 | Listes rognées sous 1024 px, dernière ligne sous la barre d'onglets, colonnes cachées à 390 px (C029/C080/C113) | UX | P2 | corrigé |
| UX-P2-24 | Impression d'un long devis : une seule page (C169) | DF | P2 | corrigé |
| UX-P2-25 | Démo : promesses de synchronisation fausses (C156/C160/C204) | UX | P2 | corrigé |
| UX-P2-26 | Liens e-mail expirés, fin de session et « Nouveau mot de passe » sans explication ni sortie (C101–C103/C109) | UX | P2 | corrigé — NON TESTÉ en réel (compte requis) |
| UX-P3-03 | Survol rouge sur actions neutres ; interrupteurs hors clavier ; étape du devis non indiquée ; doublon de menu (C050/C089/C093/C010) | A11Y/UX | P3 | corrigé |
| UX-P3-04 | Thème sombre du système : îlot sombre dans le métré (C215) | DF | P3 | corrigé |
| UX-P3-05 | Renouvellement / arrêt d'abonnement non expliqués (C203) | UX | P3 | **ouvert** (R9, politique à fournir) |
| UX-P3-06 | Navigation en boutons, pas en liens (C023) ; plusieurs boutons pleins (C026) | PREF | P3 | décision : différé / conservé (R7, R8) |
| UX-P3-07 | Hiérarchie des titres du chiffrage, badges de statut hétérogènes, regroupement des longs formulaires, aides de format, 320 px (C045/C046/C049/C053/C059/C087/C111/C134) | UX/PREF | P3 | **ouverts** |

## Points positifs vérifiés (à ne pas casser)

- Confirmation d'émission de facture : nommée, conséquence expliquée, focus sur « Annuler ».
- Double activation : « Enregistrer » le devis, « Créer le brouillon » de facture, « Émettre » → **une seule** création à chaque fois.
- Fenêtre « Nouveau client » : nom prérempli depuis la saisie, champs facultatifs repliés, libellés associés, `type=tel/email`.
- Chaîne de calcul instantanée et cohérente (120 m² → DS 828 690, K 1,5, HT 1 243 035, marge 30 %).
- Aucune requête externe, aucune erreur console, aucun débordement horizontal sur 24 combinaisons écran × largeur.

## Suivi

| Constat | Priorité | Statut |
|---|---|---|
| UX-P0-01 rechargement → perte puis écrasement | P0 | **retesté — validé** (6/6) |
| UX-P2-01 chantier fictif « Chantier Multi-Lots » | P2 | **retesté — validé** (navigateur) |
| UX-P2-02 montant prérempli fractionnaire | P2 | **retesté — validé** (4/4, banc commun avec P2-03) |
| UX-P2-03 compteurs de factures | P2 | **retesté — validé** |
| UX-P2-04 fenêtres sans nom | P2 | **retesté — validé** |
| UX-P2-05 focus perdu après navigation | P2 | **retesté — validé** |
| UX-P2-06 adresse qui ne suit pas | P2 | corrigé (adresse de base inscrite par chaque écran) |
| UX-P2-07 contrastes | P2 | **retesté — validé** sur le périmètre inventorié (32 → 0) ; reste R1 |
| UX-P2-08 cliquables hors clavier | P2 | **retesté — validé** (13 → 0) |
| UX-P2-09 envoi proposé en démo | P2 | décision : conservé (découverte de la démo) ; le PDF de démo le dit (filigrane + message) |
| UX-P2-10 reprise de démo non signalée | P2 | corrigé (R3, mention sous le bouton) |
| UX-P2-11 Échap | P2 | **retesté — validé** |
| UX-P2-12 confirmation des quantités | P2 | corrigé (R6) |
| UX-P3-01 nom ≠ texte visible | P3 | corrigé (« Facturer le devis », « Télécharger le PDF du devis », « Modifier client / chantier », filtres) |
| UX-P3-02 cible 14 × 20 px | P3 | corrigé (32 px) ; « Options du lot » 36 px |
| UX-HYP-01 / 02 | — | hypothèses, non appliquées (R2, R4) |
| UX-DEC-01 350 ms | — | décision : conservé (R5), en-tête du test corrigé |
| UX-P1-01 … UX-P3-07 | — | voir § Constats du lot 4 |

## Retest final (2026-10-03, build JS `510af75a66`)

Trois relectures adversariales du diff et un rejeu des sondes ont suivi les
corrections. Détail des causes et des corrections : `UX_FIX_LOG.md` § Lots 5
et 6. **Aucun déploiement** ; mode connecté **non testé** (compte réel requis).

### A. Pages et interactions inventoriées

12 écrans × 2 largeurs (1440 et 390 px) = 24 vues capturées
(`UX_EVIDENCE/inventaire/`), **784 interactions** inventoriées
(`UX_INTERACTION_INVENTORY.csv`). Carte produit : `UX_PRODUCT_MAP.md`.

### B. Interactions rattachées à un scénario

- **784 / 784** mesurées par les balayages systématiques des contrôles C121
  (cliquable focalisable), C129 (nom accessible ↔ texte visible) et C136
  (taille de cible) — colonnes de mesure de l'inventaire.
- **186 / 784** sont en plus citées **nommément** dans le journal d'un
  scénario joué sur le build final (sondes, bancs, suite) — 86 noms
  distincts sur 240. Les noms génériques (« Fermer », « Annuler »…) ne sont
  pas comptés : leur présence dans un journal ne désigne pas une interaction
  précise. Les 598 autres ne sont rattachées qu'aux balayages.

### C. Cas exécutés et résultats

| Passage | Cas | Résultat |
|---|---|---|
| Sondes G1–G9 avant correction | 926 | 571 ✓ / 355 ✗ |
| Sondes G1–G9 après correction (build `27dc426429`) | 827 | 622 ✓ / 205 ✗ — 99 cas de moins : sections de sondes **interrompues** par des libellés que les corrections ont renommés |
| Bancs `tests/ux` (build final) | 71 | **71 ✓** (6, 20, 17, 11, 7, 6, 4) |
| `npm run test:audit` (build final) | lots P0–7 | vert |
| Suite complète `npm test` (build final) | 627 | 539 ✓ — 26/58 suites, 7/7 étalons : **identique à `main`**, 0 échec nouveau (les 88 échecs sont la dette déjà présente sur `main`) |

Matrice des 220 contrôles de base (`UX_TEST_MATRIX.csv`) — un contrôle n'est
PASSÉ que si tous ses cas joués passent et qu'aucun n'est resté non joué :

| Statut | Contrôles |
|---|---|
| PASSÉ | **119** (dont 59 en échec avant correction, rejoués verts) |
| ÉCHEC | **43** (dont 20 partiellement corrigés ; écarts restants ci-dessous) |
| BLOQUÉ | **30** — non rejoués : échecs imputés à la sonde (sélecteur ou lecture périmés), comportement relu dans le code, pas démontré |
| NON APPLICABLE | 25 |
| NON TESTÉ | 3 (C153, C179 : mode connecté ; C213 : autres moteurs) |

Aucun contrôle supplémentaire n'a été ajouté aux 220.

### D. Parcours critiques (dix défis)

| Défi | Résultat | Nature |
|---|---|---|
| 1. Découverte sans explication | **non validé** — hypothèses UX-HYP-01/02 | étude utilisateur requise |
| 2. Clavier seul | **partiel** — fenêtres, Échap, onglets, raccourcis validés ; focus perdu après ajout d'ouvrage et « Confirmer mes quantités » (C124) | test technique |
| 3. Petit écran | **partiel** — premier ouvrage corrigé à 390 et 360 px ; **signature impossible sous 1024 px** ; 320 px ouvert | test technique (émulation) |
| 4. Réseau interrompu | **partiel** — hors ligne : client et devis conservés ; stockage plein : faux succès restant | test technique |
| 5. Double activation | **validé** — devis, brouillon de facture, émission : une seule création | test technique |
| 6. Retour arrière | **partiel** — validé à 1440 px (Retour sur chiffrage non enregistré, Facturer → Précédent → Suivant) ; à 390 px Retour depuis une fiche devis mène au tableau de bord (C017) | test technique |
| 7. Formulaire erroné | **validé** — erreurs désignées, saisie conservée (C061, C063, C065) | test technique |
| 8. Changement de rôle ou d'organisation | **non validé** — démo seulement ; pas de changement d'entreprise sur téléphone (C018) ; rôles réels non testés | test technique + compte réel |
| 9. Données nombreuses | **partiel** — liste de 60 devis défilée ; volumes supérieurs non mesurés (scénario bloqué par le quota de stockage) | test technique |
| 10. Parcours transversal | **validé en démo, 1440 px** — client → devis → facture → règlements → quittance → rechargement | test technique |

### E. Défauts confirmés et corrections retestées

- **Défauts distincts confirmés** : 15 (phase 1, UX-P0-01 à UX-P3-02) + 25
  (lot 4, UX-P1-01 à UX-P3-05 et UX-P3-07 ; la préférence UX-P3-06 n'est
  pas comptée) + 4 régressions introduites par les corrections et trouvées
  par les relectures (plantage de « Signer », données de démo versées dans
  un compte réel, factures recopiées vers la démo, page blanche à
  l'impression d'un devis) + 2 reproduits au rejeu (bouton « Ajouter mon
  premier ouvrage » recouvert sur téléphone, fiche devis restée ouverte en
  coulisse). Classement de découverte : **1er** (au moins 20). Les 47
  constats « restants » ci-dessous sont **relevés**, pas tous confirmés :
  un seul relecteur, 2 contre-vérifiés.
- **Corrections validées par un test rejoué** : 37 défauts distincts
  (59 contrôles repassés au vert ; bancs `tests/ux` 71/71).
  Classement des corrections : **1er** (au moins 20). Les quatre
  régressions sont corrigées et couvertes par un banc.
- **Corrigé mais non rejoué** : les contrôles BLOQUÉ de la matrice dont le
  suivi dit « corrigé » (C010, C046, C069, C077, C167, C169…) restent « à
  retester », pas « validés ».

### F. Contrôles et contextes non vérifiés

- **Mode connecté** (compte réel requis) : organisation mémorisée,
  synchronisation du référentiel, « Marquer envoyées » conditionné côté
  serveur, avoirs relus du serveur, liens e-mail expirés (C101–C103, C109),
  journal d'audit (C179), coupure après soumission (C153).
- **Moteurs et appareils** : Chromium émulé seulement — ni Firefox, ni
  Safari/WebKit, ni appareil physique, ni lecteur d'écran réel (C213, C214,
  seconde moitié de C120).
- **30 contrôles BLOQUÉ** : sondes à réparer avant tout nouveau rejeu
  (sélecteurs « Convertir en facture », « Mon Profil & Compte », « Afficher
  le devis… », lecture des annonces par nœuds ajoutés alors que les régions
  d'annonce sont désormais permanentes).
- **Tri des échecs restants** : 127 constats classés par un relecteur (57
  artefacts de sonde, 53 défauts réels, 16 décisions assumées, 1 non
  vérifiable) ; **10 seulement contre-vérifiés** (9 confirmés, 1 reclassé) ;
  le lot C132/C133 (contraste des limites de champs et du focus) n'a pas
  été trié.

### Défauts restants relevés au rejeu — non corrigés

Classement d'un seul relecteur, sauf mention ; chaque ligne donne la
correction proposée. À traiter par petits lots, test à l'appui.

| Prio | Contrôle | Constat | Correction proposée | Effort | Contre-vérifié |
|---|---|---|---|---|---|
| P1 | C119 | Sous 1024 px, la fenêtre « Signature électronique du devis » (et « Partager ») s'ouvre SOUS la fiche devis : signer au doigt est impossible (aucun trait à 390 px). | Passer QuoteSignatureModal (11703) et QuoteShareModal (11822) de z-[140] à z-[145] — 2 lignes — ou déplacer la ligne 33396 avant 33369. Le filet de focus (20514-20516)… | S | non |
| P1 | C152 | Stockage plein : l'avertissement s'affiche bien (lot 4), mais l'application annonce AUSSI « Devis enregistré en local » — faux succès. | Faire renvoyer à updateSavedQuotes et updateClients le résultat de LS.set ; dans les deux gestionnaires (index_jsx.js:22248 et :31621), si false :… | M | non |
| P2 | C017 | À 390 px, le Retour du navigateur depuis une fiche devis mène au tableau de bord (#dashboard) au lieu de refermer la fiche sur la liste filtrée. | index_jsx.js:28869-28872 : remplacer le corps par `const selectQuote = () => selectSavedQuote(sq);`, comme les trois autres listes (selectSavedQuote fait déjà… | S | non |
| P2 | C018 | À 390, 360 et 320 px, aucun moyen de « changer d'entreprise » n'est visible : ni sélecteur dans la barre du haut, ni entrée dans le menu du profil ou le tiroir « Menu ». | index_jsx.js:31220 : retirer la condition `userOrganizations.length > 1 &&` (la section montre alors l'entreprise active, cochée) et y ajouter un bouton « Nouvelle… | S | non |
| P2 | C029 | #chiffrage vide à 320×568 : « Ajouter mon premier ouvrage » reste recouvert (corrigé à 390 et 360 px) — l'en-tête occupe 345 px, la zone défilante n'a que 18 px visibles. | Application : rendre l'appel à l'intérieur de la zone dégagée, par exemple une prop `pied` de LotNavigator rendue à la fin du `<nav className="… clear-totals-bar">`… | S | non |
| P2 | C034 | « Personnaliser mon Tableau de Bord » : fermer par la croix (1440 et 390 px) ou par Échap (1440 px) après avoir basculé un interrupteur est noté « FERMÉE SANS AVERTISSEMENT, modification perdue », avec un relevé « bascule… | Application (environ 8 lignes, index_jsx.js:23190-23303) : mémoriser la configuration d'ouverture, et si `tempConfig` en diffère, faire passer la croix (donc Échap) par… | S | non |
| P2 | C039 | Chiffrage : l'explication de « Coeff K » n'apparaît pas au focus clavier, celle de « Marge prévue » est hors d'atteinte du clavier, et à 390 px « Coeff K » n'est pas affiché (barre repliée). | Application : remplacer les deux title par une aide affichable — petit composant (bouton `type="button"` portant le libellé, `aria-expanded`, bulle `role="tooltip"`… | M | non |
| P2 | C071 | Défaut masqué par l'interruption de la section « factures » (ligne non rejouée) : chercher un montant tel qu'affiché, « 20 589 256 », ne trouve aucune facture. | Dans le filtre : `const chiffres = invoiceQuery.replace(/[\s ]/g, '');` puis ajouter `// (/^\d+$/.test(chiffres) && [netTTC, f.totalTTC, f.totalHT, regle].some(n =>… | S | non |
| P2 | C115 | « ERREUR DE SONDE — Input.synthesizeScrollGesture : Position out of bounds » : à 320×568 le geste part de y = haut du bouton − 120 = 570 px, hors écran, parce que « Ajouter mon premier ouvrage » est posé à 690 px, sous les… | Application : rendre le bouton DANS le <nav> du LotNavigator, avant son dégagement — prop `children` ajoutée à LotNavigator (l.3763) et rendue juste avant `</nav>`… | S | non |
| P2 | C116 | Aucune ligne propre au journal : les assertions « zones sûres » S1/S2 ont été calculées puis perdues quand la sonde s'est arrêtée en S3 ; les mesures enregistrées montrent des commandes sous l'encoche. | Application, index.html, bloc @media (max-width: 767px) : `padding-top: env(safe-area-inset-top, 0px)` sur .saved-quote-detail-modal, .work-item-sheet:not(.hidden), le… | M | non |
| P2 | C118 | Menu ⋮ ouvert puis Échap : toute la fiche devis se ferme (retour à la liste) au lieu du seul menu. | Application : traiter Échap dans l’effet propre au menu proposé ci-dessus (keydown en capture sur document, preventDefault, quel que soit le focus) — ou retirer la… | S | non |
| P2 | C123 | « Plus d'actions sur le devis » (en-tête du chiffrage) : après Échap le focus est sur le déclencheur mais aria-expanded reste à true, le menu ne se referme pas. | Dans l'en-tête du chiffrage, remplacer l'effet l.3527-3533 par le modèle de QuoteStatusDropdown : effet conditionné à isMenuOpen, écoute `keydown` Escape →… | S | non |
| P2 | C124 | Focus entièrement masqué par « HEADER.global-top-bar » : « Créer un nouveau client » sur #clients (et « Rechercher un client » visible à 2/5), « Annuler la modification » et « Statut du devis » sur #chiffrage. | Aligner sur ClientCombobox (commentaire l.1560-1565) : ouvrir au clic, à la frappe et par ⌘K, pas au simple focus (remplacer onFocus par onClick en l.11088), et… | S | non |
| P2 | C128 | Alt+Flèche bas dans le champ « Prix unitaire » : le focus tombe sur BODY et le lot actif passe de 0 à 1. | Application : laisser la touche native aux `select`, `[role=combobox]`, textarea et contenteditable (remplacer le test de 7427), supprimer le `blur()` et, après… | S | non |
| P2 | C141 | Sur réseau lent, l'écran d'accès dépasse 4000 ms : 4646 ms (Slow 4G mobile cpu×4), 4570 ms (Slow 4G bureau cpu×1), 16306 ms (Slow 3G mobile) ; première mesure disponible, S7 étant bloqué avant correction de la sonde. | Minimal (M), index.html : 1) l.1256, placer dans #root une coquille statique (logo, titre « Le devis BTP juste, en quelques minutes. », « Chargement… » en… | M | non |
| P2 | C148 | « Bundle introuvable — l'échec est annoncé avec une action (réessayer) » : quand app.compiled.js ne peut pas être chargé, la page reste totalement vide à 3 s et à 10 s (texte "", #root sans enfant). | Dans index.html uniquement, sans toucher aux balises <script> (scripts/bump-version.mjs:56-58 et scripts/generer-sw.mjs restent valides) : 1) ligne 1256, mettre un… | S | non |
| P2 | — | Constat incident, aucune ligne en échec (la sonde dit « titre ok ») : sur les Paramètres, le titre « Paramètres du compte » et le bouton « Retour à l'application » de l'en-tête sont cachés sous la barre du haut, à toutes les… | Application, index.html:278 : « .settings-page-shell { left: 0; top: 4rem; } » et, dans le bloc @media (max-width: 767px), « .settings-page-shell { top: calc(3.5rem +… | S | non |
| P3 | C007 | À 1440 px, la garde de sortie du chiffrage annonce « elles seront perdues » mais, après « Ne pas enregistrer », le chiffrage est retrouvé intact (ouvrages 1 → 1, toujours « Modifications non enregistrées »). | Reformuler la seule ligne index_jsx.js:20364, sans changer le comportement, par exemple : « Ce chiffrage contient des modifications qui ne sont pas encore enregistrées… | S | non |
| P3 | C018 | Sept destinations portent deux noms selon la surface : barre latérale (1440 px), barre basse et tiroir « Menu » (390 px) — par ex. « Ressources » / « Prix des Matériaux », « Catalogue » / « Ouvrages », « Clients » / « Clients &… | index_jsx.js:31269-31273 : remplacer les cinq libellés en dur par LIBELLES_NAV.projects / clients / depenses / recipes / materials ; :31160 :… | S | non |
| P3 | C029 | Fiche devis (#devis/101) : le bouton « Modifier client / chantier » chevauche le sélecteur « Statut du devis » de 14×25 px à 390 px et de 84×5 px à 320 px (2e moitié de la ligne 19 et ligne 21). | Application, 1 ligne au choix : index_jsx.js:27714 retirer `shrink-0` (le libellé passe sur deux lignes au lieu de déborder), ou index_jsx.js:27706 remplacer `min-w-0… | S | non |
| P3 | C033 | 390 px : les quatre fenêtres suivantes (Nouveau Chantier, Nouvel Ouvrage, Personnaliser, fiche devis) sont notées « fenêtre non ouverte » parce que « Nouveau Client », ouverte au cas précédent, est toujours affichée et couvre… | Application (2 lignes) : index_jsx.js:20606, accepter aussi le focus perdu : `(courante.contains(e.target) // e.target === document.body // e.target ===… | S | non |
| P3 | C037 | Dépenses, Paramètres › Finances et lots du chiffrage (1440 et 390 px) : aucun onglet n'est relié à un panneau (aria-controls 0/n, role=tabpanel 0). | Application : `id` + `aria-controls` sur chaque onglet et `role="tabpanel"` + `id` + `aria-labelledby` sur le conteneur de contenu — Dépenses : envelopper le bloc 9123…… | S | non |
| P3 | C037 | Dépenses, Finances et lots à 1440 px : la flèche droite change bien d'onglet, mais chaque onglet reste un arrêt de tabulation (4/4, 5/5, 2/2 au lieu de 1). | Application : tabindex itinérant — `tabIndex={filtre === val ? 0 : -1}` (9116), `tabIndex={onglet === o.id ? 0 : -1}` (9659), `tabIndex={isActive ? 0 : -1}` (3935), et… | S | non |
| P3 | C039 | Rail replié à 768 px : l'infobulle de l'engrenage « Paramètres » reste invisible au focus clavier (opacité 0, 1 au survol) et cette 9e entrée n'a pas de libellé visible. | Application : (1) index.html:628, ajouter `.sidebar-item-collapsed-wrap:has(:focus-visible) .sidebar-tooltip { opacity: 1; }` ; (2) index_jsx.js:30898-30900, donner à… | S | non |
| P3 | C041 | Bloc A : deux libellés d'action vagues subsistent — « Options » sur Factures (nom accessible « Filtres avancés ») et « OK » dans Paramètres › Documents & PDF. Avant correctifs la même ligne citait aussi « Nouveau », qui a été… | index_jsx.js:26242-26247 : un seul nom, par exemple title, aria-label et texte visible « Période et tri ». index_jsx.js:32124 et 32148 : remplacer « OK » par «… | S | oui |
| P3 | C045 | Même ligne que le constat précédent, partie Paramètres (9 anomalies sur 11) : saut h1 → h3 sur Facturation & envoi, h1 → h4 sur Finances, et sur Abonnement un h2 (23–25 px) et des h3 (17 px) plus grands que le h1 (16 px à 390… | Sauts de niveau : dans la coque des Paramètres (index_jsx.js:31778, avant les panneaux) ajouter `<h2 className="sr-only">{settingsNavigation.find(t => t.id ===… | S | non |
| P3 | C071 | Recherche globale : pour « sahel », l'en-tête annonce un nombre de devis tronqué à 4 alors que 7 correspondent, sans lien « voir tous ». | Garder la liste complète (`const tousDevis = …filter(…)`, `matchedQuotes = tousDevis.slice(0, 4)`), afficher « Devis (4 sur 7) » et, si tronqué, un bouton « Voir les 7… | S | non |
| P3 | C082 | « Chaque total en argent précise TTC ou HT » échoue encore : les 4 cartes sont désormais conformes (« sans mention : — »), mais le bloc « Pipeline Commercial des Devis » n'affiche aucune mention TTC/HT (« pipeline sans mention… | index_jsx.js:23785 — compléter le sous-titre : « Répartition des propositions et conversion par étape du cycle de vente · montants TTC » (1 ligne ; rien à changer dans… | S | oui |
| P3 | C090 | Depuis « Devis récents » du tableau de bord, la fiche du bon devis s'ouvre (montant identique) mais l'adresse reste « #devis » au lieu de « #devis/<id> » comme depuis la liste. | index_jsx.js:23867 : `onClick={() => { selectSavedQuote(q); setActiveView('savedQuotes'); }}` ; l.23912 : `selectProject(p.id)` à la place de… | S | non |
| P3 | C117 | Aucune ligne propre au journal : les relevés partiels du rejeu montrent que les échecs d'avant correctifs sur les petites cibles de la barre des lots subsistent et ressortiront dès que la sonde ira au bout. | Application : `min-h-[32px] min-w-[32px]` sur les deux boutons de la barre des lots (index_jsx.js:3961 et 3974) et `min-h-[24px]` sur la bascule Simple/Avancé (6054,… | S | non |
| P3 | C118 | Fiche devis à 390 px : le menu ⋮ « Plus d’actions » reste ouvert après un toucher à l’extérieur (texte « Société Immobilière NBB ») et pendant le défilement au doigt. | Ajouter un effet juste après 17716 (≈ 12 lignes) : tant que le menu est ouvert, écouter sur document en capture (1) pointerdown hors « .saved-quote-mobile-more » →… | S | non |
| P3 | C124 | Ajout d'un ouvrage au clavier (Entrée sur la 1re suggestion) dans un lot vide : le focus retombe sur BODY. | À la fin de handleSelectSolutionForLot, après rendu (deux requestAnimationFrame), si document.activeElement est body : focaliser le premier champ de métré de… | S | non |
| P3 | C124 | « Confirmer mes quantités » activé au clavier : le focus passe du bouton à BODY (bouton retiré du DOM après usage). | Dans cet onClick, après onUpdateItem, reporter le focus (requestAnimationFrame) sur un point stable de l'inspecteur : son titre en tabindex="-1" ou le premier champ du… | S | non |
| P3 | C124 | 1440 #factures : le focus s'arrête sur BUTTON « Filtrer les factures par statut », entièrement masqué (« recouvert par SPAN. »). | Sortir ce doublon de l'ordre de tabulation (prop `tabIndex` ajoutée à CustomSelect et passée à -1 ici) ou le révéler quand il reçoit le focus (`sr-only… | S | non |
| P3 | C124 | 1440 #chiffrage : options de la liste « Rechercher un ouvrage à ajouter » focalisées mais recouvertes par la barre de totaux (DIV.quote-totals-bar) — même ligne que les masquages par le header. | Même règle que Client/Chantier : n'ouvrir qu'au clic, à la frappe ou Flèche bas (pas au focus), refermer quand le focus quitte le composant, options en tabIndex={-1} ;… | S | non |
| P3 | C124 | #chiffrage (1440 et 390) : INPUT[combobox] « Client du devis » et « Chantier du devis » sans indicateur de focus perceptible (16 à 22 px modifiés, soit le seul curseur). | Ajouter `[role="combobox"]` à la liste `:where(…)` de tailwind.input.css:155 (1 ligne), ou `focus-visible:border-brand-500 focus-visible:ring-2… | S | non |
| P3 | C124 | 1440 #chiffrage : BUTTON[tab] « 01 Lot 01 — Travaux » sans indicateur perceptible (120 px modifiés pour un périmètre de 445) — même ligne que les combobox. | Donner à l'onglet un anneau intérieur : `focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600` dans son… | S | non |
| P3 | C126 | 1440 #abonnement et #settings/entreprise : le h1 « Paramètres du compte » n'est pas dans le repère main ; main#main-content est vide (0 car.), le contenu vit dans une région hors main. | Rendre la coquille des Paramètres en <main> (l.31711) et poser `inert` sur #main-content tant que vueAffichee === 'settings' (étendre l'effet l.30707-30717) ; dans le… | S | non |
| P3 | C128 | Combobox « Rechercher un ouvrage » : après Flèche bas, aucune option active exposée (aria-activedescendant absent, 0/2 options avec id, aria-selected « false,true »). | Application : sur les options, `id={`quote-solution-option-${index}`}` et `aria-selected={highlightedIndex === index}` (2151), id équivalent sur l'option « Créer »… | S | non |
| P3 | C130 | 1440 : le trait de signature s'écarte de 8 px du pointeur en vertical (geste y 450, trait y 458), tolérance 6 px. | Application : garder la ligne d'aide toujours montée et la masquer sans libérer sa place (`className={… hasDrawn ? 'invisible' : ''}`, `aria-hidden` quand elle est… | S | non |
| P3 | C134 | Zoom 200 % (720×450) : sur #abonnement et #settings/entreprise, « navigation non » (débordement 0, h1 présent). | Masquer la barre haute tant qu'elle est inerte, par exemple `.global-top-bar[inert] { visibility: hidden; }` dans index.html (1 ligne) : la page couvre alors tout… | S | non |
| P3 | C139 | Hors lignes de la sonde : un appel de notification a échappé au correctif C139 — l'enregistrement de la disposition du tableau de bord garde un minuteur non lié à son message. | Lier le minuteur à l'id : `const id = Date.now(); setToast({ …, id }); setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), 3500);` (ou appeler showToast). | S | non |
| P3 | C140 | Ligne « Champs dont le seul libellé visible est le texte indicatif (3.3.2) : 2 » — les deux champs d'en-tête du chiffrage « Client du devis » et « Chantier du devis ». | Ajouter un libellé visible persistant sur chaque champ (<label htmlFor> court « Client » / « Chantier » au-dessus ou en préfixe, avec un id sur l'input) et aligner le… | S | non |
| P3 | C160 | « 1440x900@1x — démo hors ligne : aucune promesse de synchronisation » échoue : le panneau Paramètres → Diagnostic affiche hors ligne « la synchronisation reprendra au retour du réseau » en mode démonstration. | index_jsx.js:12731 — remplacer par : (sbUser && sbUser.id !== 'guest' ? 'Vous travaillez hors connexion, la synchronisation reprendra au retour du réseau.' : 'Hors… | S | non |
| P3 | — | Hors lignes en échec, vu sur la capture de la section « annulation » : le bandeau « Ouvrage … supprimé du lot · Annuler » n'est pas centré, son bord gauche part du milieu de la zone. | index_jsx.js:8213 : remplacer `left-1/2 -translate-x-1/2` par `inset-x-0 mx-auto w-fit max-w-[calc(100%-2rem)]` (centrage sans transform, 1 ligne). Même motif à… | S | non |
| P3 | — | Hors lignes en échec, relevé dans la capture de preuve C039-rail-768-focus-parametres.png : le panneau « Accès rapide » de la recherche reste ouvert alors que le focus clavier est parti sur l'engrenage du rail. | Application : sur le conteneur (index_jsx.js:11078), ajouter `onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsOpen(false); }}`. 1 à 2 lignes. | S | non |
| P3 | — | Constat incident, qu'aucune ligne en échec n'asserte : le détail des lignes C026 montre l'action d'écran rendue en gris neutre (texte rgb(28,43,51), bord rgb(228,233,238)) alors que le code demande l'accent de marque, et le… | 1) index_jsx.js:8046-8050 : faire porter `lg:hidden` par un conteneur (`<div className="lg:hidden">…</div>`) autour du bouton, comme en :3611 et :7062. 2) index.html… | S | non |

Deux priorités ressortent : **la signature au doigt est impossible sous
1024 px** (la fenêtre s'ouvre sous la fiche devis — deux lignes de
`z-index`) et **le faux succès quand le stockage est plein**.

