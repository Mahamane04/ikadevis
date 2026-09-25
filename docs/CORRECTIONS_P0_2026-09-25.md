# Premier lot de corrections — 25 septembre 2026

Base : commit `0c1515affcbb9d0e5102dc48a9d955f42d2a30cc`, modifications locales non déployées.
Périmètre : SEC-01 (secrets SasPay) et REL-01 (remplacement du catalogue), issus de l’audit local.
Aucune connexion à la base distante, rotation de clé, migration distante, publication ou transaction de paiement n’a été effectuée.

## Comportement livré

### SEC-01 — containment, pas réouverture des encaissements

- Le formulaire de clé entreprise est remplacé par un avis d’indisponibilité. La saisie manuelle des règlements demeure disponible. L’onglet SasPay des factures explique la suspension sans proposer une fausse démo.
- Le service navigateur refuse connexion, initiation et vérification des encaissements. La branche entreprise de `saspay-proxy` retourne 503, même si le client fournit sa propre clé. Les routes d’abonnement restent distinctes et conservent leurs contrôles existants.
- L’ancien assistant `set-saspay-key` est désactivé : il imprimait une clé et demandait son stockage dans le navigateur. L’ancien script de configuration n’est plus chargé par la page.
- Nettoyage récursif des quatre propriétés `apiKey`, `api_key`, `secretKey`, `secret_key` dans les caches applicatifs historiques. Les sessions Supabase ne sont pas nettoyées. Les nouvelles écritures de paramètres et snapshots sont expurgées.
- `migrations_payment_secret_containment_2026-09-25.sql` prépare une quarantaine privée dédupliquée des anciennes valeurs et leur retrait des colonnes JSON de `company_settings`, `quotes`, `invoices` et `document_templates` lorsqu’elles existent. Un trigger interdit leur réintroduction. Le nettoyage reste transactionnel, avec les triggers financiers actifs. Les tables sont verrouillées pendant la migration ; attente de verrou limitée à 5 secondes.
- La quarantaine n’est pas un nouveau coffre d’exécution des paiements : elle contient des valeurs en clair, réservées à l’administration serveur. Ne pas exposer le schéma `payment_private` à PostgREST. Rotation des anciennes clés et purge administrée restent nécessaires après investigation et validation. Ne jamais les copier dans un rapport ou un terminal partagé.

**Limite :** supprimer une clé des paramètres ne révoque pas les copies qui ont pu être lues précédemment. Tant que le lot n’est pas validé puis mis en place et les clés concernées révoquées, le risque distant n’est pas clos. Le nettoyage vise des propriétés structurées connues, pas un détecteur de secrets enfouis arbitrairement dans du texte libre.

### REL-01 — sauvegarde contrôlée du catalogue

- Les quatre tables `materials`, `labor`, `solutions`, `recipes` passent par deux RPC : lecture avec empreinte et remplacement transactionnel. Une erreur d’insertion ou de suppression annule l’opération entière sur la table. Les dates de création des lignes conservées ne sont pas réinitialisées.
- Le serveur vérifie membership, rôle, entreprise, table, champs et forme du contenu. Écriture : owner/admin/estimator ; lecture : ces rôles plus commercial/viewer. Les rôles anonymes et les accès retirés sont refusés.
- Verrou par entreprise et table ; comparaison de l’empreinte de la version lue avant écriture. Une version périmée provoque une erreur 40001, sans écrasement silencieux. Les anciens clients n’ont plus les droits de mutation directe sur ces quatre tables après la migration.
- Outbox durable liée au compte, à l’entreprise, à la table et à l’onglet. Un verrou navigateur empêche un onglet dupliqué de réutiliser la file d’un document encore ouvert. Sans Web Locks, une nouvelle identité est utilisée à chaque chargement : les anciennes copies restent exportables pour récupération manuelle. Les erreurs ne l’acquittent pas. Une saisie supplémentaire pendant un envoi est conservée puis envoyée avec l’empreinte confirmée. Une réponse sans confirmation n’est pas traitée comme un succès.
- Au rechargement, les changements en attente sont restaurés dans l’interface. Une alerte persistante permet d’exporter la copie locale et de réessayer le catalogue. Aucun retry ne force l’écrasement d’une version concurrente.
- Les anciennes opérations sans destination entreprise fiable et les opérations d’autres onglets restent conservées, sans rejeu automatique. Elles demandent une réconciliation manuelle. Le changement d’entreprise recharge le contexte et est bloqué pendant un travail non sauvegardé ou une erreur de synchronisation.

**Limites :** atomicité par table, pas sur les quatre tables ensemble. Un conflit ne dispose pas encore d’un écran de fusion : exporter les changements, comparer avec la version serveur, puis réconcilier avec contrôle humain ; ne pas effacer l’outbox pour faire disparaître l’alerte. Les paramètres d’entreprise conservent leur ancien mécanisme de file d’attente, dont le rejeu automatique ambigu est neutralisé. Les autres caches et ressources ne sont pas déclarés entièrement isolés par ce lot. Des écritures administrateur/service_role peuvent contourner le protocole RPC : ne pas modifier les catalogues en parallèle d’une session applicative.

## Preuves locales

Environnement : Node 22.18.0, PGlite 0.2.17, Chromium fourni par Puppeteer 25.7.0, données fictives. Aucun envoi externe.

| Exécution | Résultat | Portée / limites |
|---|---|---|
| `npm run test:p0` | 79 contrôles réussis : 31 client, 34 SQL, 14 Edge | Modules livrés, migrations rejouées sur base en mémoire, handler Edge exécuté avec doublures réseau ; pas un Supabase déployé |
| `node scratch/test_subscription_entitlements.mjs` | 33 contrôles réussis | Non-régression des quotas, droits et application atomique des paiements d’abonnement, sans fournisseur réel |
| `node scratch/test_finance_sql_migrations.mjs` | 134/134 | Socle financier existant ; ne prouve pas l’état des migrations distantes |
| `npm run build` | Réussi | Bundle JS, CSS, jetons de cache et service worker régénérés ; avertissement Browserslist préexistant, aucune mise à jour de dépendance |
| `node scripts/build-dist.mjs` dans la copie isolée | Réussi | Toutes les 21 ressources référencées présentes ; artefact fictif, non déployable tel quel |
| `node scratch/test_p0_browser.mjs` dans la copie isolée | Réussi | Démarrage invité, modules P0, rendu 390 et 1440 px, zéro erreur JS ; contrôle de fumée, pas audit responsive complet |
| `node scratch/test_p0_connected.mjs` dans la copie isolée | Réussi | Application réelle avec Supabase simulé : conflit, alerte persistante, aucun faux succès, restauration des valeurs locales, export ; zéro appel externe |
| `node scratch/test_priority_features.mjs` | 34 contrôles réussis | Import de bordereaux et rentabilité, sans backend |
| `git diff --check` | Réussi | Contrôle de forme du diff |

Les tests navigateur exigent un `config.js` strictement identique à `config.example.js` et bloquent toute requête externe. Ils ont été exécutés dans `/private/tmp/ikadevis-p0-validation-20260925`, sans copie des `.env` ni de la configuration réelle. Le bypass du service worker dans ces tests stabilise la doublure serveur : le cycle complet de mise à jour PWA reste à éprouver séparément.

La CI inclut désormais les contrôles P0 avant la suite E2E existante. La suite globale n’a pas été déclarée verte : l’audit de référence avait relevé **459/520 assertions, 33/58 suites en échec**. Elle n’a pas été relancée intégralement pour ce lot ; ses écarts doivent être traités et reproduits dans le lot QA, sans affaiblir les assertions pour obtenir un vert artificiel.

## Validation de mise en place — à effectuer sur staging isolé

1. Vérifier le schéma réel et les prérequis (`v6_schema`, stock matière, colonnes métier et politiques), les privilèges et fonctions déjà déployés. Ne pas rejouer aveuglément les anciennes migrations du dépôt.
2. Préparer une sauvegarde et démontrer sa restauration sur une base fictive. Répéter les deux nouvelles migrations avec des factures émises, modèles de document, jeux volumineux représentatifs et tentatives concurrentes réelles.
3. Prévoir une fenêtre coordonnée pour les clients : les anciennes versions ne sauront plus écrire le catalogue et leurs snapshots contenant une propriété de clé seront refusés. Préparer proxy, migrations et frontend ensemble. Ne pas publier uniquement le frontend : il requiert les nouvelles RPC.
4. Suspendre le chemin entreprise du proxy, appliquer le nettoyage et les protections SQL, puis livrer le frontend compatible pendant cette fenêtre. Vérifier le cache PWA, les anciens onglets et leur mise à jour. Ces actions restent à autoriser/exécuter dans un environnement identifié ; elles n’ont pas été lancées ici.
5. Avec deux entreprises fictives : tests autorisés/refusés de lecture/écriture, accès révoqué, concurrence de deux sessions, panne réseau après commit, stockage saturé, reprise après fermeture, rejet des anciens clients. Vérifier côté base et écran qu’aucun échec n’efface les lignes ni n’annonce une sauvegarde.
6. Confirmer l’inaccessibilité du schéma privé, des secrets et des snapshots historiques via REST et avec tous les rôles utilisateurs. Organiser révocation/rotation des clés concernées hors navigateur. Ne réactiver les encaissements qu’après un parcours serveur complet : identité/entreprise, montant calculé serveur, référence facture, idempotence et confirmation fournisseur.

**Retour arrière :** conserver la suspension SasPay, les protections et la révocation des anciennes écritures. Ne pas rétablir une version exposant les clés ou le DELETE/INSERT client. En cas d’échec de migration, son bloc transactionnel est annulé ; après succès, privilégier une correction ciblée ou une restauration validée préservant ces protections. Aucun script de retour arrière destructif n’est fourni.

## Décision et suite

Le premier lot est implémenté et vérifié localement. **La mise en production reste conditionnée aux validations ci-dessus** et aux autres risques de l’audit ; aucun feu vert global n’est donné.

Lot suivant proposé : contraintes d’isolation interentreprises sur les relations métier, contrôle des changements de rôle/propriétaire, puis séparation des caches et réconciliation des anciennes opérations. Ensuite seulement : fiabilisation des parcours et des tests globaux, accessibilité, composants UI et ajustements visuels ciblés. Les constats non traités restent ouverts.
