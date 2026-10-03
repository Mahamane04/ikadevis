# ikadevis — audit UX/UI 220 contrôles · constats

Branche `audit/ux-220-2026-10`, base `5422d42` (= production). Environnement :
serveur isolé `127.0.0.1:8299` servant `config.example.js` (URL Supabase
factice), toute requête externe bloquée ; Mode Démo, données fictives.
Navigateur : Chromium (pane intégré + Puppeteer headless). Statut du
document : **clos le 2026-10-03** après correction et rejeu (§ Retest final).

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
| UX-P1-06 | Stockage plein : écriture perdue sans avertissement (G8 S4) | DF | P1 | corrigé (message) |
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
