# Publication effectuée — 24 septembre 2026

## État final

La livraison est active sur **https://app.ikadevis.com/**. L’utilisateur a autorisé la publication, s’est connecté au compte Supabase Ika devis puis a enregistré lui-même la clé SasPay dans les secrets de production.

- Production : Worker `ikadevis`, version `8bd0e236-97b8-446b-aae7-9704ae214085`, trafic 100 %.
- Staging : `https://ikadevis-uiux-preview.officemicro89.workers.dev`, version `ba76b4b5-4566-4b70-a4f8-5c9bb9f49676`.
- JS : `bbee429296` ; CSS : `e4e3875d8c` ; service worker : `ikadevis-bbee429296`.
- Version antérieure disponible : `6211d804-da80-4e8e-aed2-7d909dacbe98`. Un retour du frontend ne retire pas les migrations de base.
- Livraisons figées dans `/tmp/ikadevis-release-20260924/staging/` et `/tmp/ikadevis-release-20260924/production/` avec distributions, configurations Wrangler et manifestes SHA-256. Ces dossiers temporaires ne constituent pas une archive durable.
- Configuration racine restaurée en `development` ; `dist/` racine contient la production. Vitrine `ikadevis.com` inchangée pendant cette publication.

## Base et services

Les migrations `migrations_saas_subscriptions_2026-09-24.sql` et `migrations_saas_entitlements_2026-09-24.sql` ont été appliquées ensemble dans une transaction sur staging puis production, via le dashboard du bon compte. Le jeton de gestion local n’a pas accès à ces projets.

- Abonnements et journal de paiements, RLS par entreprise, quotas devis/chantiers/membres, activation transactionnelle idempotente.
- Vue diagnostique `v_abonnements_etat` durcie : `security_invoker = true`, droits retirés à PUBLIC/anon/authenticated, accès réservé au service_role. Deux tests de rôles ajoutés.
- Production après migration : **2 entreprises, 10 devis conservés, 2 abonnements, 0 paiement**, 3 triggers de quota ; RPC privilégiée et vue diagnostique inaccessibles aux clients.
- Les entreprises existantes reçoivent un essai Starter de 14 jours. Les données restent modifiables au plafond ; les nouvelles créations respectent le quota. Aucun ancien abonnement simulé dans le navigateur n’est considéré comme payé.
- `saspay-proxy` et `invite-member` publiées sur les deux projets, protection JWT conservée.
- `SASPAY_API_KEY` enregistrée par l’utilisateur dans SuperDevisMO, présence confirmée après actualisation. Aucune clé de production ajoutée sur staging.

### Incident de point d’entrée résolu

L’éditeur Supabase a initialement choisi le fichier modèle comme point d’entrée du nouveau proxy, malgré la présence du bon code dans un autre fichier. La sonde HTTP a identifié la réponse du modèle `@supabase/server`. Le frontend a été remis temporairement à sa version antérieure, puis le véritable point d’entrée a été remplacé par le code compilé du proxy local. En production ce fichier porte actuellement le nom **`previous-index.ts`** ; le source de référence reste `supabase/functions/saspay-proxy/index.ts`.

Après correction, la sonde anonyme répond **401, `Session invalide ou expirée.`**, message du bon gestionnaire. Le frontend a ensuite été réactivé. Un simple HTTP 401 ne prouve pas l’identité du gestionnaire : vérifier aussi le contenu.

## Vérifications

- **67 contrôles ciblés réussis**, relancés après correction de la vue : 33 abonnements/SQL/RLS et 34 import/rentabilité. Les 89 régressions de la livraison initiale sont documentées dans le README, pas toutes relancées pendant la publication.
- **10 contrôles du gestionnaire proxy réel compilé**, avec services simulés sans réseau : authentification, organisation obligatoire, appartenance, refus sans clé, absence d’écriture et d’appel prestataire dans les scénarios refusés.
- Recette SQL sur le vrai staging, terminée par `ROLLBACK` : deux comptes/entreprises fictifs, isolation, quotas, mise à jour au plafond, refus de la RPC au client, sous-paiement refusé, activation et rejeu idempotent. Résultat **PASS**, zéro entreprise de test restante.
- Builds : 53 fichiers publics par distribution ; références de base adaptées ; aucun `.env`, SQL ou script de construction publié.
- Domaine final : `index.html`, `config.js`, `sw.js`, `app.compiled.js`, `js/quote-import.js`, `js/subscription-service.js` en HTTP 200, identiques octet pour octet au build figé.
- Compte déjà connecté en production : devis et essai Starter chargés, formules et Dépenses / Rentabilité ouverts sans modifier les devis. À 390 × 844 px, capture inspectée, largeur de page 390 px ; viewport rétabli ensuite.
- `git diff --check` réussi.

Le contrôle automatique avait refusé la publication du proxy en l’absence de clé : blocage levé après l’enregistrement confirmé. Il a également refusé une sonde supplémentaire vers `invite-member`, en raison du risque théorique d’envoi ; cette sonde n’a pas été exécutée. Une réponse 400 de validation du corps a été observée, sans invitation réelle.

## Limites restantes

- **Aucun paiement de bout en bout validé.** La présence du secret est confirmée, pas un encaissement réussi. La clé enregistrée diffère de l’ancienne clé locale : la validation antérieure de celle-ci ne prouve donc pas la validité de la nouvelle. Recette prestataire à faire : succès, attente, rejet, interruption et reprise sans nouveau débit.
- **Dépenses et paramètres Finances encore locaux** : `expenses` et `finance_settings` absentes des deux bases. L’interface l’annonce. La chaîne Finances des § 70–72 n’a pas été appliquée implicitement et nécessite sa propre recette.
- Aucun paiement, invitation, e-mail client ou facture réelle émis. Aucun essai sur smartphone physique ni synchronisation des dépenses entre appareils.
- Pas de test de concurrence multi-connexion.

Suite : recette du paiement, synchronisation cloud des dépenses, lien client d’acceptation de devis, validation interne, comparatif fournisseurs et pointages.
