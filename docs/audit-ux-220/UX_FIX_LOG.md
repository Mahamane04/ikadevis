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
| Correction | `index_jsx.js` : les 17 appels passent explicitement `(clé, [valeur,] utilisateur, organisation)`. `js/tenant-persistence.js` : la clé historique `costcalc:<org>:<org>:<clé>` est relue une fois puis recopiée sous la bonne clé — les données déjà saisies **réapparaissent** au lieu d'être abandonnées. |
| Défaut lié corrigé | `js/tenant-persistence.js` était absent de `FICHIERS_JS` (`scripts/bump-version.mjs`) : jeton de cache **figé** à `000ddd755e` depuis sa création, donc aucune correction de cette couche n'était garantie d'atteindre un navigateur qui l'avait en cache. Ajouté ; jeton désormais dérivé du contenu. |
| Retest | `tests/ux/test_persistance_rechargement.mjs` **6/6**. Migration réelle vérifiée dans le navigateur : un profil contenant des données à l'ancien format retrouve ses 3 clients et FACT-2026-001, recopiés sous `costcalc:guest:*`. `npm run test:audit` : exit 0, tous lots verts (lot 2 : 28/28). |
| Faux vert révélé | Les 28 contrôles du lot 2 (persistance) étaient verts **avec** le défaut : ils éprouvent `TenantPersistence` isolément, jamais ses appels réels depuis l'application. |
| Risque résiduel | Mode connecté NON TESTÉ (compte requis) : les mêmes appels y sont corrigés ; en ligne, le chargement serveur remplaçait déjà l'état. Les données écrites sous l'ancienne clé pour un **autre** utilisateur de la même organisation sur le même appareil seront relues par le premier qui ouvre l'app (l'ancienne clé ne portait pas d'identifiant utilisateur) — même exposition qu'avant correction, pas pire. |

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
| Clé de migration `costcalc:<org>:<org>` : à la 1re connexion d'un compte sur l'appareil (organisation encore `org_default`), les données de **démo** étaient relues puis poussées dans la vraie organisation sur le serveur | P0 (régression) | clé relue seulement si rien n'est stocké, seulement par son propriétaire légitime (invité ↔ `org_default`, compte réel ↔ vraie organisation, jamais `org_default`/`org_local_*`), puis **supprimée** après recopie (migration unique, plus de résurrection d'une liste vidée) |
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
