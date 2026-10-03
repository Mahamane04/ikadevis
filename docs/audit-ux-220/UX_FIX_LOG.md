# ikadevis — journal des corrections (audit UX 220 contrôles)

Branche `audit/ux-220-2026-10`. Corrections **commitées sur la branche,
non déployées** (aucune mise en ligne sans autorisation distincte). Un
correctif écrit mais non exécuté est « à retester », jamais « validé ».

## Lot 1 — Pertes de données (P0)

### UX-P0-01 · Rechargement : clients, chantiers et factures perdus puis écrasés

| Étape | Résultat |
|---|---|
| Preuve initiale | Sondes navigateur 2026-10-03 : après rechargement, `costcalc:org_default:org_default:invoices` contient FACT-2026-001 (statut `paid`, 2 règlements) mais l'écran affiche « Toutes 0 » ; création d'un client → la clé `…:clients` passe de [SARL Test Audit, …] à [Client Post Rechargement, …démo] ; refacturation → second FACT-2026-001, statut `issued`, règlements effacés. |
| Cause | `LS.get/LS.set(clé, activeOrganizationId)` → l'organisation occupe le paramètre **utilisateur** de `TenantPersistence.getKey(clé, userId, orgId)` ; l'organisation est lue dans un contexte posé par un `useEffect`, donc APRÈS les initialiseurs `useState`. Écriture : `costcalc:<org>:<org>:<clé>` ; lecture au démarrage : `costcalc:<org>:global:<clé>`, absente des clés de repli. |
| Occurrences | 17 appels : App (`clients`, `projects`, `invoices` — lectures, écritures, rapatriement du référentiel), `ExpensesScreen` (`depenses`), `FinanceSettingsPanel` (`finance`, `depenses`, clé locale). |
| Test détectant le défaut | `tests/ux/test_persistance_rechargement.mjs` — **4 échecs sur 6 avant correction**, pour la bonne raison (client absent, facture absente, devis refacturable, écrasement). |
| Correction | `index_jsx.js` : les 17 appels passent explicitement `(clé, [valeur,] utilisateur, organisation)`. Première version : la clé historique `costcalc:<org>:<org>:<clé>` était relue puis recopiée sous la bonne clé. **Retirée après la seconde revue adversariale (lot 6)** : son propriétaire ne peut pas être établi (la démonstration et un compte réel resté sur `org_default` hors ligne écrivaient la même clé), et la relire faisait passer des données d'un espace à l'autre — jusqu'au serveur d'une vraie organisation. Ces anciennes clés restent **intactes sur l'appareil**, non relues. |
| Défaut lié corrigé | `js/tenant-persistence.js` était absent de `FICHIERS_JS` (`scripts/bump-version.mjs`) : jeton de cache **figé** à `000ddd755e` depuis sa création, donc aucune correction de cette couche n'était garantie d'atteindre un navigateur qui l'avait en cache. Ajouté ; jeton désormais dérivé du contenu. |
| Retest | `tests/ux/test_persistance_rechargement.mjs` **6/6** (rechargement, création, facturation : rien n'est perdu ni écrasé). `npm run test:audit` : exit 0, tous lots verts (lot 2 : 28/28). La migration, vérifiée un temps dans le navigateur, a ensuite été retirée (voir Correction) ; contrôle à part : une clé historique n'est relue ni par un compte réel ni par la démo, et une liste vidée (« [] ») n'est plus ressuscitée par une clé de repli. |
| Faux vert révélé | Les 28 contrôles du lot 2 (persistance) étaient verts **avec** le défaut : ils éprouvent `TenantPersistence` isolément, jamais ses appels réels depuis l'application. |
| Risque résiduel | Mode connecté NON TESTÉ (compte requis) : les mêmes appels y sont corrigés ; en ligne, le chargement serveur remplace l'état. Ce qui avait été saisi en **démonstration** sous la version défectueuse ne réapparaît pas automatiquement (c'était déjà invisible après un rechargement avant correction) : les données restent sur l'appareil, sous leur ancienne clé, récupérables à la main. |

## Lot 2 — Engagement financier : règle unique de « facture soldée » (P2)

### UX-P2-02 + UX-P2-03 · TTC fractionnaire en FCFA, compteurs et filtres faux

| Étape | Résultat |
|---|---|
| Preuve initiale | Observé dans le navigateur le 2026-10-03 : facture FACT-2026-001 de net 1 466 781,30 F ; fenêtre de règlement préremplie « 1466781.3 » pour un reste affiché « 1 466 781 FCFA » ; après règlement complet, fiche « Réglée 100 % » mais compteurs « Soldées 0 » (la facture était classée « partielle »). |
| Cause unique | Deux règles pour la même question. La fiche calcule le solde **arrondi à la devise** (`arrondiDevise(net − réglé)`) ; la liste, ses compteurs, ses filtres, l'export, l'état « en retard », le libellé de fiche et la fenêtre de règlement comparaient les montants **bruts**. En amont, la TVA de la facture n'était jamais arrondie (`HT × taux`). |
| Occurrences | 2 constructeurs de facture ; fenêtre de règlement ; `isInvoiceOverdue` ; compteurs « partielles » et « soldées » ; filtres « partially_paid » et « paid » ; libellé d'export ; ligne de liste ; fiche (solde, « soldée », libellé d'état) — 11 endroits. |
| Correction | Règle unique `resteFactureArrondi(f)` / `estFactureSoldee(f)` (devise lue sur la facture, repli FCFA), employée partout ; TVA, TTC et net arrêtés à la précision de la devise dès la création de la facture. Les factures **déjà stockées** avec une fraction sont reclassées correctement sans migration de données. |
| Test | `tests/ux/test_soldes_factures_devise.mjs` — **4/4** : facture historique fractionnaire réglée → « Soldées 1 », ni partielle ni en retard ; nouvelle facture → TTC 1 466 781, TVA 223 746 (entiers) ; règlement prérempli « 1466781 ». |
| Limite | La preuve « rouge » est l'observation directe consignée ci-dessus, pas une exécution de ce banc sur l'ancien code (qui échouerait d'abord pour la cause UX-P0-01, sans isoler celle-ci). EUR/USD : même règle à 2 décimales, NON TESTÉ en interface. |

## Lot 3 — Accessibilité (P2/P3), corrigée à la source commune

| Constat | Cause commune | Correction | Retest |
|---|---|---|---|
| UX-P2-04 fenêtres sans nom | le filet global pose `role="dialog"` sans relier le titre | le filet relie le premier titre de la fenêtre (`aria-labelledby`) quand aucun nom n'existe | « Nouveau Client » annoncée par son titre ✅ |
| UX-P2-05 focus sur `<body>` après navigation | aucun déplacement de focus au changement de vue | effet sur `activeView` : focus sur le titre de `#main-content` après la transition — jamais si l'utilisateur est déjà dans un champ ou une fenêtre | « Créer mon premier devis » → H1 Chiffrage ; menu Clients → H1 Clients ✅ |
| UX-P2-11 (nouveau) Échap ne ferme pas « Nouveau Client » | fermeture sur Échap codée fenêtre par fenêtre | le filet active le bouton de fermeture de la fenêtre du dessus (même effet qu'un clic) | vraie touche Échap : fenêtre fermée, focus rendu au déclencheur ✅ |
| UX-P2-07 contrastes | jeton `neutral-400` (#8F9CA8, 2,8:1) employé en texte ; `--sub-muted` 4,23:1 | occurrences mesurées passées en `neutral-500` (≥ 4,72:1 sur tous les fonds de la palette) ; étiquette « Actuelle » en `#44515E` | inventaire : **32 → 0** textes sous le seuil sur 24 écrans × largeurs ✅ |
| UX-P2-08 cliquables inatteignables au clavier | `div` + `onClick` sans rôle ni tabindex | carte « Formule Starter » : `role="button"`, `tabIndex`, Entrée/Espace ; renommage de lot : vrai bouton crayon | inventaire : **13 → 0** ; Entrée ouvre les offres ✅ |
| UX-P3-01 nom ≠ texte visible | `aria-label` sans le libellé affiché | « IKADEVIS BTP — changer d'organisation », « Nouveau — créer une facture depuis un devis » | relevé inventaire |
| UX-P3-02 cible 14 × 20 px | bouton supprimer `p-0.5`, `opacity-40` (invisible au toucher) | 32 × 32 px minimum, opacité pleine, focus visible | relevé inventaire |

Test : `tests/ux/test_accessibilite_navigation_fenetres.mjs` **6/6** (vraies touches clavier).
Non fait volontairement : assombrir le jeton `neutral-400` pour toute l'application
(127 usages en texte) — décision de charte, proposée dans `UX_REDESIGN_PLAN.md`.

### Régression introduite puis corrigée pendant le lot 3

La suite historique (`scratch/test_client_combobox.mjs`) est passée de 6/6 à
**4/6** après le lot accessibilité : une recherche client annulée par Échap
restait affichée, tronquée (« Reche »).

- **Cause 1** — le déplacement de focus après navigation (UX-P2-05) traitait
  tout `<header>` comme de la navigation ; or l'en-tête du devis, qui contient
  le champ client, est un `<header>`. Le focus était repris **en pleine
  saisie**. Correctif : on ne reprend jamais le focus d'un champ
  (`input`, `textarea`, `select`, `contenteditable`, `role=combobox`) ; la
  « navigation » se limite à `nav`, `[role=navigation]`, `aside`.
- **Cause 2** — le gestionnaire Échap global (UX-P2-11), en phase de capture,
  passait avant celui du champ client, car le filet prend pour « fenêtre »
  toute zone `.fixed.inset-0`, listes déroulantes comprises. Correctif : il
  n'agit que si le focus est **dans** la fenêtre et hors de toute liste
  déroulante (`combobox`, `listbox`, `option`, `.picker-popover`).
- **Retest** : `test_client_combobox` 6/6 ; `test_accessibilite_navigation_fenetres` 6/6.
- **Leçon** : un comportement global (focus, clavier) doit toujours être
  confronté à la suite complète, pas seulement à son propre banc.

## Lot 4 — Défauts relevés par les sondes G1–G10 (2026-10-03)

Source : 9 scripts de sondes (`tests/ux/controles/G1…G9-*.mjs`, journaux
et captures dans `UX_EVIDENCE/`) : 333 échecs bruts regroupés en 46
défauts candidats, chacun **vérifié dans le code** avant correction (les
faux positifs de sonde sont listés plus bas). G10 (C182, C186, C201–C215),
jamais joué par les sondes, a été audité par lecture de code et essais ciblés.

### P1 — données et engagements

| Constat (contrôles) | Cause | Correction |
|---|---|---|
| Deux onglets : le second efface le client du premier, les deux attribuent DEV-2026-002 (C158) | chaque onglet réécrit TOUTE sa copie en mémoire | écoute de l'évènement `storage` : un onglet adopte la version écrite par l'autre (clients, chantiers, factures, devis, numérotation, catalogue, entreprise), sans la réécrire |
| « Marquer envoyées » en lot : brouillon passé « envoyé » sans numéro légal, facture réglée repassée « envoyée » (C066/C070/C078) | filtre `statut !== 'sent'` | seules les factures **émises sans règlement** passent ; synchronisation serveur comme l'envoi unitaire ; le message dit ce qui est écarté et pourquoi |
| Import matières « Remplacer tout » : 36 matières supprimées sans confirmation, ouvrages cassés (C165/C166) | remplacement brut de la liste | plan d'import calculé une fois (aperçu = bouton = bilan) ; matières utilisées par un ouvrage **conservées** ; même désignation = même identifiant ; case de confirmation listant les suppressions ; bilan exact |
| 1re visite : la page se recharge en pleine saisie (C143) | `controllerchange` rechargeait aussi à la prise de contrôle initiale | plus aucun rechargement d'office : à la 1re visite rien ne se passe ; pour une mise à jour, un avis « nouvelle version disponible » (la revue avant publication a montré qu'un rechargement différé au masquage de l'onglet perdait encore une saisie en cours) |
| Démo : « Nouvelle entreprise » affiche les données de la précédente (C107) | en démo toutes les données vivent sous une seule clé | création refusée en démo, avec l'explication (un compte est requis) |
| Stockage plein : écriture perdue en silence (scénario S4 de G8) | `TenantPersistence.set` renvoie `false`, ignoré | `LS.set` émet un évènement ; l'application prévient (au plus une fois par minute) |
| Le logo « Tableau de bord » ouvre **Factures** (C018) | le logo appelle `onSelectQuote(null)` puis `onSelectInvoice(null)`, qui forçaient chacun leur écran | ces fonctions ne changent d'écran que pour une vraie fiche |

### P2 — exactitude de ce qui est affiché

| Constat | Correction |
|---|---|
| « Ce mois » / « Trimestre » : 0 FCFA avec un devis du jour (C082) | les dates « jj/mm/aaaa » étaient relues à l'américaine (10 mars) : lecteur unique `lireDateDocument` (tableau de bord, filtres et tris de factures, échéances, `formatDate`) |
| « Devis à suivre » comptait les brouillons ; « 0 % accepté » sans devis ; « Tous en cours » pour 0 chantier ; période non rappelée ; ni reste à encaisser ni retards (C081–C086) | à suivre = devis envoyés ; libellés « · ce mois » ; « Reste à encaisser » + nombre en retard ; badge « En retard » ; « Devis récents » au périmètre des cartes |
| Cartes et étapes du pipeline non cliquables (C083) | chaque carte / étape ouvre la liste filtrée correspondante |
| Facture « Émise le 2026-10-03T03:53:27.706Z », « 1.00 lot » (C095/C180) | date jj/mm/aaaa, quantités au format français |
| Quittance « Édité électroniquement par Micro Office BTP » (C095) | nom de l'entreprise émettrice |
| Deux noms de PDF pour une même facture, dont « -pdf.pdf » (C168) | `nomFichierFacture` unique |
| Devis « Facturé » redevenu « Accepté » après un règlement partiel (C046) | `estFactureEmise` : toute facture sortie du brouillon compte |
| Recherche sensible aux accents ; contact affiché non cherchable (C071) | clients et chantiers : `normalizeSearchText` sur tout ce que la liste affiche |
| Tri « Client A→Z » : sans-client en tête (C075) | sans-client en fin de liste |
| Export matières : recherche ignorée, accents cassés dans Excel, ligne coupée par un guillemet (C167/C168) | export du périmètre affiché (annoncé), BOM UTF-8, guillemets doublés ; modèle CSV avec BOM |
| CSV Windows-1252 : « D�signation » entre dans le devis ; raison de rejet au survol seulement (C161/C164) | UTF-8 strict puis Windows-1252 **signalé** (matières et bordereau) ; raison sous chaque ligne ; 5 Mo et encodage annoncés ; bouton grisé → raison et nombre de lignes à corriger |
| « Créer Devis » depuis un client : champ vide, notification mensongère (C098/C099) | vrai nouveau devis au nom du client (garde « chiffrage non enregistré » comprise) |
| Démo : « synchronisation automatique active » (C156/C160) ; « Synchronisation en temps réel » dans les Paramètres (C204) | messages vrais en démo ; « Chaque modification est enregistrée… » seulement là où c'est le cas |
| « Facturer un acompte » n'ouvrait que la liste ; trois verbes pour une action (C041/C042/C090) | « Facturer un devis » ouvre le choix du devis ; « Facturer le devis » sur la fiche |
| % de facturation : « 040 » (C058) | saisie libre pendant la frappe, bornage à la sortie du champ |
| Limite Starter : « passez à l'offre Standard ou Pro » (C202) | l'offre « Pro » n'existe pas : « Standard ou Entreprise » |

### P2 — fenêtres, saisie, clavier, accessibilité

| Constat | Correction |
|---|---|
| Fermer Nouveau client / chantier / ouvrage après saisie = saisie perdue (C034) | `useBrouillonCreation` : la saisie abandonnée est **restaurée** à la réouverture (« Repartir de zéro ») ; effacée à l'enregistrement |
| ⌘K et Alt+1…5 agissaient sous une fenêtre ouverte (C033) | suspendus tant qu'une fenêtre modale est visible |
| Échap dans « Plus d'actions » refermait la fiche ; fermer « Signature » laissait le focus sur la page (C118/C123) | Échap ferme d'abord le menu ouvert ; la fiche ignore un Échap déjà traité ; **pile** de fenêtres avec leur déclencheur |
| Entrée / Espace sur « Supprimer le devis » ouvraient la ligne (C128) | la ligne ne réagit qu'à ses propres touches |
| Onglets sans flèches (C128) | ← → Début Fin pour tout `role="tablist"` |
| Région live créée avec son texte ; 2e message effacé aussitôt (C127/C139) | deux régions permanentes (polie / assertive) ; chaque minuteur n'efface que son message ; durée selon la longueur |
| Chronomètre de chargement annoncé 22 fois (C127) | seule « Chargement de la page… » est annoncée |
| Glyphes Font Awesome dans 64 noms accessibles (C137) | icônes sans nom masquées aux aides (observateur DOM) |
| Focus invisible sur plusieurs commandes ; limites de champs à 1,2:1 (C124/C132) | anneau par défaut pour tout interactif sans anneau propre ; bordures `#7f8c9a` (3,4:1) |
| Titre d'onglet identique partout (C140) | « Factures · ikadevis », etc. |
| Champs d'identification sans `autocomplete` (C110/C140) | email, current-password, new-password, organization, tel, street-address |
| Lien d'évitement changeant l'adresse (C126) | focus sans changer l'adresse |
| Signature : trait décalé, rien au doigt, signature vide acceptée (C130) | coordonnées à l'échelle de la toile, évènements *pointer*, validation exigeant un tracé |
| Dépense : erreurs non reliées, résumé hors écran ; « Ajouter un compte » perdait la saisie (C061/C065/C057) | `aria-invalid` + liens vers chaque champ, focus sur le résumé ; dépense mise de côté puis rouverte |
| E-mail invalide dans une section repliée (C065) | la section s'ouvre, le champ reçoit le focus |
| Listes ≤ 1024 px rognées ; dernière ligne sous la barre d'onglets (C080/C029) | défilement horizontal des tableaux ; marge basse réservée sous 768 px |
| « Facturer » à 390 px : colonnes cachées (C113) | montants placés sous le nom du lot |
| Retour d'une fiche : position et ligne perdues (C017/C079/C124) | le focus revient sur la ligne quittée |
| « Annuler » d'une suppression : 0,8 s au lieu de 6 s, recouvert à 390 px, non annoncé (C069) | minuteur propre, position au-dessus des barres, région d'état |
| Survol rouge de « Paramètres », « Fermer » (C050) | survol neutre par défaut, rouge réservé aux destructeurs |
| Interrupteurs « Personnaliser » hors clavier (C089) | `button role="switch"` + `aria-checked` |
| Progression du devis sans étape courante (C093) | étape déduite du devis, `aria-current="step"` |
| « Mon Profil & Compte » = même page que « Paramètres Entreprise » (C010) | entrée retirée |
| Changer d'entreprise impossible sous 640 px (C018) | entrée « Entreprise » dans le menu mobile |
| Adresse inconnue : rien ne se passe (C019) | message + retour au tableau de bord ; fragments d'authentification ignorés |
| Lien e-mail expiré, session terminée sans explication, « Nouveau mot de passe » sans sortie, focus perdu (C101–C103/C109) | messages explicites, « Annuler et revenir à la connexion », focus sur le premier champ |
| PDF : rien au-delà de 5 s ; échec hors ligne non expliqué (C148) | message de patience à 5 s ; échec hors ligne nommé |
| Impression d'un devis de 151 lignes : 1 page (C169) | ancêtres de la zone libérés à l'impression (`*:has([data-zone-impression])`) |
| Rôle d'un invité choisi sans savoir ce qu'il permet (C210) | description dérivée de `ROLE_PERMISSIONS` |
| Thème sombre du système : îlot sombre dans le métré (C215) | `darkMode: 'class'` (un seul thème, clair) |
| Créer depuis un contexte (C182) | « Nouveau chantier pour ce client » ; plus de premier client présélectionné au hasard |

### Décisions prises (détail dans `UX_REDESIGN_PLAN.md`)

R1 contraste du texte secondaire (111 occurrences) · R3 reprise de
démonstration annoncée · R5 350 ms conservés, en-tête du test corrigé · R6
quantités à confirmer : ouvrage nommé, bouton focalisé · UX-P2-06 adresse
de base inscrite par chaque écran · « Options du lot » 36 px.

### Faux positifs de sondes (aucun défaut applicatif)

C088 (la sonde n'a pas sélectionné l'option de tri), C175 (le document
montre bien règlements et solde ; la sonde n'avait pas pu enregistrer de
paiement), scénarios S3/S5/S8/S9/S10 de G8 et sections « factures »,
« devise », « logo » de G9 (sélecteurs de sonde obsolètes), S7 (option
Playwright `waitUntil: 'commit'` passée à Puppeteer — sonde corrigée).

### Vérification

- `tests/ux/test_audit220_lot5.mjs` (nouveau, vrai navigateur) **17/17** ;
  bancs des lots précédents **6/6, 4/4, 6/6** ; `npm run test:audit` vert.
- Suite complète `npm test` sur le build final : **539/627, 26/58 suites,
  7/7 étalons — identique à `main`** (même score, même liste nominative
  d'échecs, comparée suite par suite : 0 nouveau, 0 disparu). Les 80
  échecs restants sont la dette déjà présente sur `main`, hors périmètre.
- Tests historiques adaptés au nouveau contrat, sans en affaiblir la
  promesse : `test_error_feedback` et `test_lot5_a11y_ui` (annonce par
  région permanente) ; `test_pdf_onglet_masque` (nom « Télécharger le PDF
  du devis ») ; `test_unsaved_changes_guard` (le bandeau d'annulation nomme
  l'ouvrage : on vérifie la liste du lot) ; `test_pdf_zone_visible` — **faux
  vert révélé** : le montage masquait la seule zone visible et le test ne
  passait que parce que la notification d'échec disparaissait à 3,5 s, avant
  sa lecture à 6 s ; il reproduit maintenant le piège visé et constate un
  vrai « PDF téléchargé ».

## Lot 5 — Revue adversariale du diff avant publication (2026-10-03)

Quatre relecteurs indépendants (données, navigation/clavier, affichage,
CSS/HTML) ont relu tout le diff en lecture seule ; chaque constat grave a été
soumis à un relecteur chargé de le **réfuter**. 23 constats, dont 3 graves
confirmés — **trois régressions introduites par le lot 4 lui-même**, que les
bancs et la suite complète n'avaient pas vues :

| Constat | Gravité | Correction |
|---|---|---|
| « Signer » faisait planter toute l'application : trois `useRef` ajoutés APRÈS le `return null` de `QuoteSignatureModal` (toujours montée) → « Rendered more hooks than during the previous render » | P0 (régression) | hooks remontés avant le retour anticipé ; tracé remis à zéro à chaque ouverture. Les autres composants modifiés ont été passés au crible : aucun autre hook après un retour anticipé |
| Clé de migration `costcalc:<org>:<org>` : à la 1re connexion d'un compte sur l'appareil (organisation encore `org_default`), les données de **démo** étaient relues puis poussées dans la vraie organisation sur le serveur | P0 (régression) | d'abord restreinte à un « propriétaire légitime » ; la seconde revue (lot 6) a montré que ce propriétaire ne peut pas être établi : la migration est **retirée** — clé historique jamais relue |
| Écran de connexion : `LS.get(…, 'guest')` héritait du contexte de l'utilisateur déconnecté et recopiait ses factures réelles dans l'espace de démo | P1 (régression) | lecture directe des clés de démonstration ; contexte de stockage remis à zéro à toute fin de session |

Corrigés aussi (constats non contre-vérifiés mais reproduits à la lecture) :
brouillon de chantier qui écrasait le client prérempli et perdu sur refus de
quota ; « Marquer envoyées » qui réécrivait une liste périmée après les
appels réseau ; pile de fenêtres qui perdait le déclencheur quand une
fenêtre en remplace une autre ; Retour vers l'adresse d'entrée qui ne
faisait rien ; « Reste à encaisser » et « en retard » sans déduire les
avoirs (règle unique `resteARecouvrerGlobal`, partagée avec l'écran
Factures) ; étape « Prêt / Vérifié » et cartes cliquables qui ouvraient une
liste ne correspondant pas au chiffre (filtre de période et statut groupé
dans « Mes devis ») ; texte vide de « Devis récents » selon la période ;
homonymes de matières supprimés sans être annoncés à l'import et
confirmation restée cochée après un changement de fichier ; focus posé sur
un `<main>` caché à l'ouverture des Paramètres ; focus repris à chaque
modification du devis affiché ; pages blanches à l'impression ; rechargement
différé du service worker remplacé par un avis « nouvelle version » ; survol
rouge rendu à « Retirer l'étape ».

**Leçon** : la suite complète était identique à `main` alors que « Signer »
plantait — aucun banc n'ouvre la fenêtre de signature. Une relecture
adversariale par domaine est indispensable avant toute publication d'un
diff de cette taille.

## Lot 6 — Seconde revue adversariale, puis rejeu complet (2026-10-03)

Une seconde relecture adversariale a porté sur les correctifs du lot 5
eux-mêmes. Ce qu'elle a fait corriger :

| Constat | Gravité | Correction | Retest |
|---|---|---|---|
| La migration des clés `costcalc:<org>:<org>`, même restreinte, ne pouvait pas établir le propriétaire des données (démo et compte réel hors ligne sur `org_default` écrivaient la même clé) ; une liste vidée pouvait être « complétée » par une clé de repli | P0 | migration **retirée** ; repli seulement si rien n'est stocké ; un compte réel ne relit jamais une clé de démo ni d'organisation provisoire (`org_default`, `org_local_*`) ; même règle dans le repli de `LS.get` hors `TenantPersistence` | `tests/ux/test_persistance_cles_historiques.mjs` **7/7** (nouveau) ; `test_persistance_rechargement` 6/6 |
| Mode connecté : au chargement, les listes clients/chantiers en mémoire (éventuellement celles d'une autre organisation) étaient envoyées à `synchroniserReferentiel` de l'organisation chargée | P1 | listes lues sous la clé de l'organisation résolue ; la mémoire n'est utilisée que s'il s'agit de la même organisation | **NON TESTÉ en réel** (compte requis) — relu |
| Organisation choisie non mémorisée après vérification de l'appartenance | P2 | `ikadevis_active_org_<utilisateur>` écrit après vérification | **NON TESTÉ en réel** |
| Avoirs en mode connecté : la facture corrigée (`corrects_invoice_id`) n'était pas relue, donc « reste à encaisser » et « en retard » ne déduisaient pas l'avoir | P2 | `mapInvoiceFromDb` relit `correctsInvoiceId` | règle de déduction : banc lot 6 (avoir total → plus rien à encaisser ; témoin sans avoir : 177 000 dus) ; relecture serveur **NON TESTÉE** |
| Import CSV de matières : identifiants en collision, homonymes, fusion qui écrasait les champs absents du fichier, prix calculé non recalculé ; confirmation « Remplacer tout » restée valable après changement de fichier ; import refusé (quota) annoncé comme réussi | P1 | plan d'import (`nouvelleMatiere`, `cibleParNom`, `champsFournis`) ; confirmation liée à la liste exacte des suppressions ; `updateMaterials` renvoie `false` sur refus | `test_material_csv_mapping` 9/9 |
| « Marquer envoyées » : une facture réglée entre-temps (autre poste) pouvait repasser « envoyée » | P1 | mise à jour serveur conditionnée à `status = 'issued'`, lignes réellement changées comptées, liste locale relue au moment d'écrire | partie locale : banc lot 5 (brouillon et réglée écartés, émise → envoyée) ; condition serveur **NON TESTÉE en réel** |
| Brouillons de création : restaurés par-dessus un contexte prérempli, effacés en mode édition, perdus sur refus de quota | P2 | brouillon restauré seulement sans contexte, touché seulement en création, effacé après le contrôle de quota | banc lot 5 (fermer → rouvrir → saisie restaurée ; « Repartir de zéro ») ; cas contexte prérempli / édition / quota : **relus, non joués** |
| Carte du tableau de bord → « Mes devis » : un filtre client ou une recherche restés actifs montraient une liste ≠ chiffre | P2 | filtre client et recherche remis à zéro | banc lot 6 (recherche laissée dans « Mes devis » → carte « Devis à suivre » → recherche vide) |
| Signature : nom du signataire du devis précédent conservé | P3 | nom repris du client du devis à chaque ouverture | banc lot 6 (devis A, nom modifié, fermé → devis B : nom du client de B) |
| **E10** « Retour » du navigateur : chiffrage non enregistré quitté sans la question posée par la barre latérale | P1 | le routeur remet `#chiffrage`, pose la même question (`proposerEnregistrement`), ne repart vers l'adresse demandée que sur « Ne pas enregistrer » ou enregistrement réussi | `tests/ux/test_audit220_lot6.mjs` (Retour → question ; Annuler → reste ; Ne pas enregistrer → tableau de bord ; Retour libre sans modification) |
| **E11** Cartes d'indicateurs déclarées comme composant à l'intérieur du rendu : remontées à chaque rendu, focus clavier perdu | P2 | appelées comme fonction (`carteIndicateur`), clé stable | banc lot 6 (focus conservé après un rendu provoqué) |
| **E3** Quittance ouverte sur la facture : les deux documents imprimés l'un sur l'autre | P2 | `beforeprint` repère le document au premier plan et **écarte** les autres (`data-impression-exclue`) ; une copie masquée à l'écran n'est gardée que si elle est la jumelle du document visé (même `data-document-cle`) ; marquage levé à `afterprint` | banc lot 6, mesuré à la **largeur A4 (794 px)** en média print, **avec témoin** (sans marquage, facture et quittance sortent ensemble) |
| Fiche devis restée montée « en coulisse » après une navigation par l'adresse (Retour, adresse saisie) : sur téléphone elle recouvrait l'écran Factures ; à l'impression elle serait sortie avec la facture | P2 (antérieur à l'audit) | le routeur ferme la fiche devis quand l'adresse mène ailleurs (seuls les gestes de navigation passent par lui) | banc lot 6 ; constaté avant correction : `#devis/101` → `#factures` à 390 px, fenêtre devis de 390 px de large toujours affichée |

**Contrôles corrigés mais jamais rejoués.** Plusieurs contrôles étaient
notés « corrigé » sans qu'aucune sonde ne les rejoue : la règle de l'audit
(PASSÉ seulement si tous les cas passent) les laissait en ÉCHEC. Ils sont
rejoués par `tests/ux/test_audit220_rejeu_corriges.mjs` ; deux restaient
réellement ouverts et sont corrigés ici :

| Contrôle | Constat | Correction |
|---|---|---|
| C003 | « Projet non renseigné » sur la fiche devis et au tableau de bord, « Chantier non renseigné » dans les listes : deux noms pour un même objet | « Chantier non renseigné » partout |
| C056 | Fiche « Nouveau client » (un **tiers**) : le navigateur y proposait l'identité, le téléphone et l'adresse de l'utilisateur | `autoComplete="off"` sur les 7 champs ; collage non bloqué (vérifié) |
| C015, C016 | corrigés au lot 4 (UX-P2-06), jamais rejoués | rejoués : lien direct, Facturer → Précédent → Suivant |
| C182, C202, C204, C215 | corrigés au lot 4, jamais rejoués | rejoués |

Restent en échec, assumés : C005 (l'échec mène désormais à l'ouvrage et à
son bouton, R6, mais le prérequis n'est pas visible AVANT la tentative),
C149 (350 ms conservés, décision R5), C203 (politique de renouvellement à
fournir, R9), C210 (effets TVA / numérotation sur l'équipe non revus).

**Troisième relecture (correctifs E3/E10/E11).** Un défaut grave dans le
premier E3 : la zone retenue était celle vue à l'écran, or Chrome imprime à
la largeur de la feuille, où le panneau de bureau du devis (`hidden lg:flex`)
disparaît au profit de sa copie jumelle (`lg:hidden`) — que la règle
masquait. **Imprimer un devis depuis un écran large donnait une page
blanche** (reproduit : à 794 px en média print, aucune des deux copies
n'avait de boîte). Le banc E3 ne l'avait pas vu : il mesurait à 1440 px.
D'où l'inversion (écarter plutôt que désigner), la clé de document, et un
banc qui mesure à la largeur de la feuille. E10 et E11 : rien de grave.
Écarts mineurs assumés : « Annuler » après plusieurs Retour d'un coup efface
les entrées « Suivant » (l'adresse du chiffrage est réinscrite) ; si
l'enregistrement demande une confirmation (« Mettre à jour ce devis ? »), on
reste sur le chiffrage après l'enregistrement — même comportement que la
barre latérale ; un marquage d'impression resté en place parce qu'un
navigateur n'émettrait pas `afterprint` est effacé au `beforeprint` suivant.

Restent ouverts, antérieurs à l'audit et hors de son périmètre :
`emettreAvoirFacture` insère côté serveur des colonnes probablement absentes
du schéma (**non vérifié** : compte requis) ; d'autres replis sur
`org_default` subsistent hors de la couche de persistance.

### Dernière correction : premier ouvrage sur téléphone

Relevé au rejeu des sondes puis reproduit : sur téléphone, le bouton
« Ajouter mon premier ouvrage » d'un devis vide restait sous la barre de
totaux (390 px) ou sous la barre d'onglets (360 et 320 px) — un appui en son
centre ouvrait « Aperçu PDF » ou changeait d'écran. Le lot 4 avait classé
ces scénarios en « sonde périmée » : **à tort**. Le bouton réserve
maintenant la hauteur des deux barres (`.clear-totals-bar`). Retest : appui
réel au centre du bouton à 390×844 et 360×740 → la bibliothèque d'ouvrages
s'ouvre (banc lot 6). **320×568 reste ouvert** : l'en-tête du chiffrage y
occupe 345 px et la zone défilante n'a que 18 px visibles.

### Vérification finale (build JS `510af75a66`)

- Bancs `tests/ux` : accessibilité 6/6, lot 5 20/20, **lot 6 17/17**,
  **rejeu des contrôles corrigés 11/11**, **clés historiques 7/7**,
  persistance 6/6, soldes 4/4 — 71/71. `npm run test:audit` vert.
- Suite complète `npm test` : **539/627, 26/58 suites, 7/7 étalons —
  identique à `main`** (0 échec nouveau, 0 disparu, comparaison nominative).
- Sondes G1–G9 rejouées sur le build `27dc426429` (le build final n'en
  diffère que par un libellé, des attributs `autocomplete` et le dégagement
  du bouton mobile) : 622 ✓ / 205 ✗ contre 571 ✓ / 355 ✗ avant correction.
  **Ce n'est pas un rejeu complet** : plusieurs sections sont interrompues
  par des sélecteurs que les corrections ont rendus périmés. La réparation
  des sondes n'a pas été faite ; les contrôles concernés sont notés BLOQUÉ
  dans la matrice, pas PASSÉ.
- Tri des 205 échecs (un relecteur par lot, 10 constats contre-vérifiés) :
  57 artefacts de sonde, 53 défauts réels, 16 décisions assumées, 1 non
  vérifiable. Les défauts réels non corrigés sont listés, avec leur
  correction proposée, dans `UX_AUDIT.md` § Défauts restants.
- Matrice finale des 220 contrôles : **119 PASSÉ, 43 ÉCHEC, 30 BLOQUÉ,
  25 NON APPLICABLE, 3 NON TESTÉ**.

## Lot 7 — Les deux défauts prioritaires (2026-10-03)

| Défaut | Cause | Correction | Retest (banc lot 6) |
|---|---|---|---|
| **Signature impossible sous 1024 px** (C119/C130) | « Signer » et « Partager » avaient le niveau d'empilement de la fiche devis mobile (z-140), montée APRÈS elles : la fenêtre s'ouvrait sous la fiche | fenêtres passées à z-[145] | 390×844 : la toile est l'élément au premier plan, un tracé au doigt active « Valider & Signer » ; **témoin** : ramenée à z-140, la toile est recouverte |
| **Faux succès quand le stockage est plein** (C152, UX-P1-06) | l'enregistrement local annonçait « Devis enregistré en local » sans lire le résultat de l'écriture, et l'atelier effaçait « Modifications non enregistrées » | `updateSavedQuotes` renvoie le résultat ; en cas d'échec : liste remise à son état réel, bouton en erreur, message « NON enregistré », brouillon de secours conservé, l'atelier reste « non enregistré » | écriture de `savedQuotes` refusée : aucun « enregistré », échec annoncé, rien d'écrit ; quitter pose la question et « Enregistrer » ne laisse pas partir ; place retrouvée → enregistré et annoncé |

**Relecture adversariale des deux corrections** (un relecteur par
correction, chaque constat soumis à réfutation — 10 constats, tous
confirmés). Ce qui relevait des deux corrections a été corrigé et testé :

| Constat | Nature | Correction | Retest |
|---|---|---|---|
| La notification (z-140) passait SOUS « Signer » / « Partager » relevées à z-145 : « Lien copié » illisible | **régression** de la correction 1 | notification à z-[230], au-dessus de toutes les fenêtres (elle ne capte aucun clic) | « Partager » → « Copier » : notification 230 > fenêtre 145 |
| L'état « fenêtre de signature ouverte » survivait à la fermeture du devis : elle ressurgissait sur le devis suivant (rendu visible par la correction 1) | effet de bord | état remis à zéro quand le devis affiché change | Signer → Retour → rouvrir : pas de fenêtre |
| Téléphone en paysage ou petit écran : la carte dépassait l'écran, « Valider » hors d'atteinte | correction 1 incomplète | carte défilante (`max-h` + défilement), idem « Partager » | 844×390 : « Valider & Signer » et « Annuler » atteignables |
| « Enregistrer d'abord » (avant de remplacer le devis par un vierge ou un modèle) ignorait l'échec : le devis était remplacé sans avoir été sauvé | **P1**, trou de la correction 2 | l'action n'a lieu que si l'enregistrement n'est pas refusé | stockage plein → « Initialiser le Devis Vierge » → « Enregistrer d'abord » : le devis reste |
| Après un échec, un atelier non marqué « modifié » restait « Enregistré localement » | correction 2 incomplète | l'échec force « non enregistré » | couvert par le cas ci-dessus |
| Même faux succès pour un client, une duplication, une révision, une signature | correction 2 incomplète | en démonstration, aucun succès n'est annoncé dans le geste où une écriture locale vient d'être refusée : l'échec est dit à la place | liste des clients non inscriptible → créer un client : pas de « Fiche client créée ! » |

Limite assumée de ce dernier point : la fenêtre se ferme et l'élément
reste visible en mémoire jusqu'au rechargement ; seul le message est
véridique. Les quatre défauts antérieurs relevés au passage (confirmations
et fenêtres sous la fiche devis mobile, « Voir la facture », échec serveur
en mode connecté) sont consignés dans `UX_AUDIT.md` § Défauts restants.

### Vérification (build JS `d0b6781e24`)

- Bancs `tests/ux` : **81/81** (lot 6 : 27/27). `npm run test:audit` vert.
- Suite complète `npm test` : **539/627, 26/58 suites, 7/7 étalons —
  identique à `main`** (0 échec nouveau, 0 disparu, comparaison nominative).
- Matrice : **119 PASSÉ, 41 ÉCHEC, 32 BLOQUÉ, 25 NON APPLICABLE, 3 NON
  TESTÉ** (C119 et C152 passent d'ÉCHEC à BLOQUÉ : défaut corrigé, cas de
  la sonde non rejoués).

## Mise en ligne (2026-10-03)

Le commit `c555d60` (PR n° 2) est servi sur `app.ikadevis.com` et
`ikadevis.officemicro89.workers.dev` : version Cloudflare
`4da31b5f-8c23-4e55-9e6b-8f212349f066`, jeton JS `d0b6781e24`, fichier servi
identique octet pour octet au build testé, `config.js` en ligne sur la base de
production, configuration locale remise en développement. Contrôle de fumée en
ligne en mode démo (tableau de bord, fiche devis, « Signer », aucune erreur
console). Retour arrière : `npx wrangler rollback
cdf73e1f-3a9c-462a-b4bd-6d0d95310048`. **Le mode connecté n'a pas été
vérifié** (aucune connexion à un compte).

## Lot 8 — Défauts restants, lot A : la fiche devis sur téléphone (2026-10-03)

Branche `fix/ux-defauts-restants-2026-10`, **non déployée**. Banc :
`tests/ux/test_defauts_restants.mjs`.

| Défaut | Correction | Retest |
|---|---|---|
| Confirmations « Supprimer » / « Dupliquer » ouvertes SOUS la fiche devis (C119) | dialogue de confirmation à z-[225] | 390 px : « Annuler » de la confirmation est l'élément touché ; le devis n'est pas supprimé |
| « Nouveau client » / « Nouveau chantier » ouverts sous la fiche (C119) | fenêtres à z-[145] | champ « Nom » touchable depuis la fiche |
| « Voir la facture » laissait la fiche par-dessus la facture | la fiche est refermée ; la facture s'ouvre à son adresse `#factures/<id>` | fiche fermée, titre « Factures », adresse de la facture |
| Liste mobile : fiche ouverte sans son adresse, Retour quittait « Mes devis » (C017) | même ouverture que les autres listes (`selectSavedQuote`) | adresse `#devis/<id>`, Retour → liste |
| « Devis récents » du tableau de bord sous l'adresse de la liste (C090) | `selectSavedQuote` / `selectProject` / `selectInvoiceItem` | adresse de la fiche, y compris élément déjà sélectionné |
| Menu ⋮ : restait ouvert au toucher extérieur, Échap fermait toute la fiche (C118) | fermeture au toucher extérieur, au défilement, à la sortie du focus ; Échap ferme le menu seul | menu fermé, fiche ouverte, focus rendu au bouton ⋮ |
| Menu « Plus d'actions » du chiffrage : Échap sans effet (C123) | Échap referme et rend le focus | `aria-expanded=false`, focus sur le bouton |
| « Modifier client / chantier » chevauchait « Statut du devis » (C029) | bouton compact réel (`button.btn-compact`), sans `shrink-0` | aucun recouvrement à 390 et 320 px, 24 px de haut |

**Relecture adversariale du lot** (deux relecteurs, 8 constats, tous confirmés
par réfutation), corrigée et testée avant le commit :

| Constat | Nature | Correction |
|---|---|---|
| Client ou chantier créé depuis la fiche d'un devis affecté au devis **du chiffrage en cours**, pas au devis affiché | **P1**, ancien, rendu atteignable sur téléphone par ce lot | origine `savedQuote` : le devis affiché et sa copie enregistrée sont mis à jour (`majDevisAffiche`) ; le chiffrage seulement s'il s'agit du même devis. Même garde pour la sélection d'un client ou d'un chantier existant (la condition « aucun des deux n'a d'identifiant serveur » était toujours vraie en démo) |
| Fiche refermée par son bouton « Retour » : l'adresse `#devis/<id>` restait, le Retour du navigateur la rouvrait | **régression** (P2) | `closeQuotePreview` suit l'adresse : retour en arrière si la fiche vient de la liste, sinon l'entrée devient `#devis` ; suppression d'un devis : même chose |
| Tab bloqué sur « Annuler » dans une confirmation ouverte au-dessus d'une fenêtre | P2, ancien, rendu visible | le filet de focus laisse Tab aux fenêtres qui gèrent leur focus |
| Échap rendait le focus au bouton ⋮ du panneau de bureau masqué | régression (P3) | le menu réellement affiché est visé |
| Échap avalé quand le focus avait quitté le menu | régression (P3) | la touche n'est prise que si elle revient au menu (`echapAppartientAilleurs`) ; le menu se referme quand le focus le quitte |
| Élément déjà sélectionné rouvert depuis le tableau de bord : adresse de la liste | P3 | `inscrireAdresseFiche`, appelée aussi quand la fiche est déjà sélectionnée |
| « Voir la facture » sous `#factures` | P3 | `selectInvoiceItem` |
| Bouton « Modifier client / chantier » sur trois lignes | P3 | `button.btn-compact` |

### Vérification (build JS `cd3d4c4e14`)

- `tests/ux/test_defauts_restants.mjs` : **16/16**.
- Bancs `tests/ux` : **97/97** (8 bancs). `npm run test:audit` vert — quatre
  vérifications du lot 6 lisaient le TEXTE du code d'inscription des
  adresses ; elles sont adaptées à `inscrireAdresseFiche` (le comportement
  est vérifié en navigateur par le banc du lot).
- Suite complète `npm test` : **539/627, 26/58 suites, 7/7 étalons —
  identique à `main`** (0 échec nouveau, 0 disparu).
- Matrice : **123 PASSÉ, 37 ÉCHEC, 32 BLOQUÉ, 25 NON APPLICABLE, 3 NON
  TESTÉ** (C017, C090, C118, C123 passent d'ÉCHEC à PASSÉ).

