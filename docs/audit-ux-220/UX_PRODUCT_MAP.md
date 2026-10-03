# ikadevis — carte produit (audit UX 220 contrôles)

Établie le 2026-10-03 sur la branche `audit/ux-220-2026-10`, partie de
`5422d42` (PR #1 = ce qui est servi sur app.ikadevis.com, vérifié octet pour
octet). Chaque affirmation porte sa source ; **[F]** = fait vérifié (code
lu ou écran manipulé), **[H]** = hypothèse à valider.

## Problème résolu

Un entrepreneur du BTP en Afrique de l'Ouest (FCFA, Mali / Côte d'Ivoire /
Sénégal) doit chiffrer juste et vite : métré → quantités de matières et de
main-d'œuvre (pertes, conditionnements) → déboursé sec → coefficient K →
prix HT → TVA → TTC, puis produire un devis client présentable, le
transformer en facture et suivre les paiements. **[F]** `CLAUDE.md`, écran
d'accès (« Le devis BTP juste, en quelques minutes »).

Résultat attendu pour l'utilisateur : un devis dont il est sûr (pas de vente
à perte, pas d'oubli de matière), envoyé au client avec une identité légale
correcte, puis encaissé.

## Rôles, organisations, abonnements

| Élément | Constat | Source |
|---|---|---|
| Visiteur sans compte | « Essayer sans compte » → Mode Démo **local**, propriétaire d'une entreprise fictive « IKADEVIS BTP », données sur l'appareil seulement | **[F]** écran |
| Rôles d'organisation | `owner` vérifié ; `admin` / `viewer` cités par le code (accès étude de prix interne, Paramètres réservés) — matrice complète non vérifiée en interface | **[F]** code, **[H]** comportement |
| Super-admin plateforme | lecture cross-tenant, écran « Administration » (`#platform-admin`) | **[F]** code |
| Multi-organisation | sélecteur « Changer d'organisation », création d'organisation en étapes | **[F]** écran |
| Formules | starter (essai 14 j, **3 devis**, 1 chantier actif, 1 utilisateur), standard/pro (5 utilisateurs), entreprise/business (illimité). Contrôle serveur : trigger `enforce_subscription_capacity` | **[F]** migration 09-24 |
| Paiement d'abonnement | SasPay, autorité serveur `saspay-proxy` uniquement | **[F]** `CLAUDE.md` § 73 |

## Objets métier et états

| Objet | États / relations | Source |
|---|---|---|
| Devis | Brouillon · À vérifier · Prêt · Envoyé · Accepté ; lots → ouvrages (calculés au métré ou « lignes libres ») ; client + chantier ; révisions `-V2` ; duplication | **[F]** `STATUTS_DEVIS` |
| Ouvrage (recette) | composants matières + main-d'œuvre, formule de métré (surface, volume, rectangle, linéaire…), perte, conditionnement | **[F]** |
| Ressource | matière (prix d'achat, conditionnement, perte, stock) ou main-d'œuvre (régie / tâche) | **[F]** |
| Client | NIF, contact ; ↔ chantiers, devis, factures | **[F]** |
| Chantier | code `PRJ-AAAA-NNN`, statut, client ; ↔ devis, dépenses | **[F]** écran |
| Facture | brouillon (non numéroté) → émise (numéro légal **immuable**) → payée / partiellement payée ; avoir pour corriger ; situations de travaux ; retenue de garantie | **[F]** `CLAUDE.md` § 62 |
| Paiement | `payments` / `payment_allocations`, Orange Money / Wave / Moov | **[F]** § 70 |
| Dépense | déjà payée / à payer / avance perso ; répartition entre chantiers | **[F]** § 72 |

## Tâches

**Quotidiennes** : chiffrer un devis ; ajuster quantités, marge, TVA ;
produire le PDF ; retrouver un devis ; le passer en facture ; enregistrer un
paiement ; saisir une dépense.

**Rares mais critiques** : émettre une facture (irréversible), faire un
avoir, régler l'identité légale (NIF, RCCM), la numérotation, les taux de
TVA, inviter un membre, changer de formule, restaurer des données locales.

## Flux

- **Données** : navigateur ↔ Supabase (RLS par `organization_id`) ; en démo,
  tout reste en `localStorage` sous une clé `userId:orgId`. **[F]**
- **Argent** : devis → facture → paiement(s) → solde ; abonnement SaaS
  séparé, encaissé et confirmé **côté serveur** seulement. **[F]**
- **Validation** : facture émise = immuable ; devis non envoyable sans
  identité légale complète (Partager / Signer bloqués). **[F]**

## Contexte d'usage

Appareils : ordinateur et **téléphone sur chantier** (PWA installable,
barre d'onglets mobile). Langue : français. Réseau : instable par hypothèse
(**[H]**, aucune donnée terrain) — d'où un mode local et une file de
synchronisation. Accessibilité : aucun besoin spécifique documenté ; cible
de travail WCAG 2.2 AA.

## Parcours réellement présents

| # | Parcours | Acteur | Déclencheur | Résultat | Priorité d'audit |
|---|---|---|---|---|---|
| P1 | Découverte → première valeur | visiteur | page d'accès | un devis chiffré visible | critique |
| P2 | Chiffrer et produire un devis | artisan | nouveau chantier | PDF client correct | critique |
| P3 | Devis → facture → paiement → solde | artisan | devis accepté | facture émise, encaissement suivi | critique |
| P4 | Client / chantier | artisan | nouveau client | dossier rattaché aux devis | haute |
| P5 | Catalogue (ouvrages, ressources, import CSV) | artisan expert | prix fournisseurs | prix à jour | haute |
| P6 | Dépenses et rentabilité chantier | gérant | achat | marge réelle du chantier | moyenne |
| P7 | Paramètres (identité, TVA, numérotation, équipe) | propriétaire | premier usage | documents conformes | haute |
| P8 | Abonnement et limites | propriétaire | limite atteinte | choix éclairé | moyenne |
| P9 | Inscription / connexion / récupération | visiteur | compte | accès | **non exécutable** ici (compte réel requis) |

Absents du produit (sections du prompt non applicables) : panier,
marketplace, commissions, retraits (contrôles 191–200) ; pipeline CRM
complet avec opportunités (contrôles 181–190 partiellement : clients +
statuts de devis seulement). **[F]** inventaire.
