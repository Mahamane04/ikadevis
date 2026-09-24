# Formules et paiement : refonte du 24 septembre 2026

## Résultat publié

La fenêtre d’abonnement utilise désormais un en-tête blanc, une typographie sobre, des bordures fines et un accent bleu limité aux actions. Les formules présentent le tarif, la période et le bouton de choix avant leurs fonctionnalités. La formule courante et son utilisation occupent une ligne compacte ; l’historique des paiements reste accessible sous les formules.

Le choix d’une formule ouvre un écran de règlement dédié. Le récapitulatif affiche le montant à régler aujourd’hui et la durée. Le pays précède les moyens de paiement ; les opérateurs possèdent des logos de marque servis avec l’application. Le bouton porte « Payer par Mobile Money » ou « Payer par carte bancaire », selon le choix. Le nom technique du prestataire n’est plus utilisé pour nommer ces actions.

Sur smartphone, la fenêtre occupe l’écran, les moyens de paiement sont disposés sur deux colonnes et les champs restent lisibles sans défilement horizontal. Le retour aux formules rétablit le focus sur le bouton choisi ; la touche Échap ferme la fenêtre. Les réglages de réduction des animations sont respectés.

Les prix, les codes opérateurs, les contrôles serveur et les règles d’activation de l’abonnement sont conservés. Aucun paiement, invitation, devis ou changement de formule effectif n’a été exécuté pour cette recette.

## Validation

- Compilation complète et vérification des espaces du diff réussies.
- 77 contrôles ciblés réussis : 33 abonnements/SQL, 34 import/rentabilité, 10 protections du proxy avec services simulés.
- Parcours local : périodicités mensuelle/annuelle, changement de pays et d’opérateur, sélection carte, retour aux formules, fermeture et gestion du focus.
- Rendu smartphone vérifié à 360 et 390 px ; contrôle final de l’aperçu hébergé à 360 × 800 : largeur de page 360 px, zone du formulaire sans débordement, bouton Mobile Money accessible.
- Aperçu hébergé : 18 ressources comparées au build. Production : 19 ressources comparées au build, dont les 14 images, les fichiers JS/CSS, la configuration publique et le service worker.
- Compte connecté en production : nouvelles formules affichées, quota existant 3/3, récapitulatif Standard 19 900 FCFA, logos Mali et cartes chargés, bouton Mobile Money confirmé. Aucun clic sur le bouton de paiement.

## Publication

| Environnement | Version Cloudflare |
|---|---|
| Aperçu | `7c328c45-e3ea-450e-a288-8e0f7665fadf` |
| Production | `8f54172e-199c-4730-8046-bcd3972d74af` |

Application : https://app.ikadevis.com/ ; aperçu : https://ikadevis-uiux-preview.officemicro89.workers.dev/.

Version des ressources : JS `7288e2e342`, CSS `1fb71a1385`, service worker `ikadevis-7288e2e342`. Publication depuis un build figé dans `/tmp/ikadevis-design-release-20260924/` ; configuration racine de développement restaurée après préparation. Aucune modification distante des fonctions Supabase ou de la base pendant cette refonte. Le site vitrine est inchangé.

## Logos et limites

[Provenance, empreintes et correspondances de marques](sources-logos.md). Mobi Cash Mali emploie la marque actuelle Moov Money ; les deux codes distincts du prestataire restent conservés. PayDunya et TouchCash restent présentés par leur nom, aucun logo vérifié utilisable n’ayant été retenu. En cas d’échec de chargement d’une image, le nom reste visible.

La recette vérifie le parcours et son rendu dans le navigateur. Elle ne constitue pas une validation d’encaissement réel ni un essai sur des appareils physiques iOS/Android. La présence de la clé SasPay, confirmée lors de la livraison précédente, ne remplace pas un paiement réel validé par le propriétaire.
