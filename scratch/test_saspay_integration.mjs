// OBSOLÈTE depuis le 2026-09-24 — remplacé par test_abonnement_paiement.mjs
//
// Ce script vérifiait que SasPayService savait fabriquer une session de
// paiement, un push SoftPay et une confirmation « SUCCESS » sans aucune clé
// API. Il passait au vert, et c'était précisément le problème : ce qu'il
// mesurait n'était pas une intégration mais une simulation silencieuse,
// celle qui a activé un abonnement STANDARD en production sans qu'un franc
// ne quitte le compte Mobile Money.
//
// Un banc d'essai qui certifie un faux succès est pire qu'un banc absent :
// il donne confiance. Il est donc retiré plutôt que corrigé.
//
// Le contrat en vigueur — ces mêmes appels doivent désormais ÉCHOUER avec
// le code SASPAY_NOT_CONFIGURED — est tenu par :
//
//     scratch/test_abonnement_paiement.mjs   (enregistré dans npm test)
//
// Voir docs/PROJECT_MASTER_TRACKER.md § 73. La version d'origine est
// récupérable dans l'historique git si besoin.

console.log(
    "Ce banc est obsolète. Exécutez à la place :\n" +
    "    node scratch/test_abonnement_paiement.mjs\n"
);
process.exit(0);
