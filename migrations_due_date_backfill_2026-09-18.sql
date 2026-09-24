-- IKADEVIS — rattrapage de invoices.due_date, SANS avalanche de rappels.
--
-- Contexte
-- --------
-- invoices.due_date n'a jamais été écrit par l'application (seule occurrence :
-- une lecture, index_jsx.js:14897). L'Edge Function send-payment-reminders,
-- qui sélectionne les factures par .eq('due_date', dateCible), n'a donc jamais
-- rien trouvé : les rappels automatiques n'ont jamais pu partir.
--
-- migrations_fix_issue_invoice_2026-09-17.sql règle le problème pour les
-- factures FUTURES (l'échéance est posée à l'émission). Ce fichier traite les
-- factures DÉJÀ émises, avec la même règle : émission + 30 jours — exactement
-- celle que l'application appliquait déjà pour détecter un retard
-- (isInvoiceOverdue, index_jsx.js:313-331).
--
-- ⚠️ LE RISQUE QUE CE FICHIER NEUTRALISE
-- -------------------------------------
-- Poser une échéance sur tout l'historique rendrait d'un coup éligibles aux
-- rappels des factures pour lesquelles aucun client n'a jamais été relancé.
-- Des e-mails RÉELS partiraient vers des clients RÉELS (Resend), avec des
-- formulations du type « votre facture est en retard de 7 jours » calculées
-- sur une échéance que personne ne leur a jamais annoncée.
--
-- Parade : dans la MÊME transaction, chaque seuil de rappel dont la date de
-- déclenchement est déjà atteinte est marqué comme « déjà envoyé » dans
-- invoice_reminders_sent (table de déduplication que l'Edge Function consulte
-- avant tout envoi, index.ts:154-158). Les seuils encore à venir restent
-- libres : une facture émise il y a 10 jours recevra normalement son rappel
-- J-3 dans 17 jours. Le comportement futur est celui prévu ; seul le passé
-- est éteint.
--
--   seuil  | se déclenche le jour où       | marqué « envoyé » si
--   -------+-------------------------------+-------------------------------
--   j-3    | due_date - 3 = aujourd'hui    | due_date - 3 <= CURRENT_DATE
--   j+3    | due_date + 3 = aujourd'hui    | due_date + 3 <= CURRENT_DATE
--   j+7    | due_date + 7 = aujourd'hui    | due_date + 7 <= CURRENT_DATE
--
-- `<=` et non `<` : le seuil du jour même est éteint aussi. Si ce fichier est
-- appliqué avant 8 h UTC, cela coûte au pire UN rappel légitime ; s'il est
-- appliqué après, ce rappel était de toute façon déjà manqué. On préfère
-- perdre un rappel plutôt qu'en envoyer un faux.
--
-- Sûreté
-- ------
-- - Une seule transaction (BEGIN/COMMIT) : jamais d'échéances posées sans que
--   les seuils passés soient éteints.
-- - Idempotent : WHERE due_date IS NULL, et ON CONFLICT DO NOTHING sur
--   invoice_reminders_sent (UNIQUE(invoice_id, threshold)).
-- - Le trigger protect_issued_invoice laisse due_date modifiable après
--   émission : aucune désactivation de trigger n'est nécessaire.
-- - Ne touche NI aux montants, NI aux numéros, NI aux statuts.
--
-- Ordre d'application : APRÈS migrations_fix_issue_invoice_2026-09-17.sql
-- (sinon une facture émise entre les deux fichiers n'aurait pas d'échéance ;
-- sans gravité, un rejeu de ce fichier la rattrape).
--
-- État d'application
-- ------------------
--   staging     (mwfmruzlonsrrfufbsyz) : [ ] à appliquer
--   production  (qmavetqcpzsfralsqxsi) : [ ] à appliquer APRÈS validation staging
--
-- AVANT — mesurer ce qui va être touché (lecture seule) :
--
--   select count(*) filter (where due_date is null) as sans_echeance,
--          count(*) filter (where due_date is null
--                           and issued_at::date + 30 + 7 >= current_date) as seuils_encore_a_venir
--   from public.invoices
--   where status <> 'draft' and issued_at is not null;

BEGIN;

-- ── 1. Échéance des factures déjà émises ──────────────────────────────────
-- Les brouillons sont exclus : leur échéance sera posée à l'émission. Les
-- avoirs aussi : un avoir ne se relance pas.
UPDATE public.invoices
SET due_date = issued_at::date + 30
WHERE due_date IS NULL
  AND status <> 'draft'
  AND issued_at IS NOT NULL
  AND invoice_type <> 'avoir';

-- ── 2. Extinction des seuils de rappel déjà atteints ──────────────────────
-- Appliquée à TOUTES les factures qui ont une échéance, pas seulement à celles
-- du § 1 : une échéance posée à la main avant ce fichier aurait les mêmes
-- seuils passés, jamais envoyés. sent_at reçoit l'horodatage de la migration,
-- pas une date d'envoi fictive.
INSERT INTO public.invoice_reminders_sent (invoice_id, organization_id, threshold, sent_at)
SELECT i.id, i.organization_id, s.threshold, NOW()
FROM public.invoices i
CROSS JOIN (VALUES ('j-3', -3), ('j+3', 3), ('j+7', 7)) AS s(threshold, decalage)
WHERE i.due_date IS NOT NULL
  AND i.status <> 'draft'
  AND i.due_date + s.decalage <= CURRENT_DATE
ON CONFLICT (invoice_id, threshold) DO NOTHING;

COMMIT;


-- ── Contrôles post-migration ──────────────────────────────────────────────
--
-- 1) Plus aucune facture émise sans échéance (hors avoirs) :
--      select count(*) from public.invoices
--      where due_date is null and status <> 'draft' and invoice_type <> 'avoir';
--      -- attendu : 0
--
-- 2) AUCUN rappel ne partira demain matin pour une facture ancienne. Simuler
--    exactement la sélection de l'Edge Function, pour les 3 seuils de demain :
--      select s.threshold, count(*) as rappels_prevus_demain
--      from (values ('j-3', 3), ('j+3', -3), ('j+7', -7)) as s(threshold, jours)
--      join public.invoices i
--        on i.due_date = current_date + 1 + s.jours
--       and i.status in ('issued', 'partially_paid')
--      where not exists (select 1 from public.invoice_reminders_sent r
--                        where r.invoice_id = i.id and r.threshold = s.threshold)
--      group by s.threshold;
--      -- Ne doivent apparaître que des factures dont le seuil tombe
--      -- réellement demain. Les relire une par une avant 8 h UTC.
--
-- 3) Pour mémoire, deux limites de l'Edge Function, hors du périmètre de ce
--    fichier mais qui réduisent fortement ce qui peut partir :
--    - elle ne relance que les statuts 'issued' et 'partially_paid' : une
--      facture marquée 'sent' (« envoyée au client ») n'est jamais relancée ;
--    - elle lit l'e-mail du client via invoices.client_id, laissé NULL sur la
--      plupart des factures depuis le correctif du 2026-09-02
--      (index_jsx.js:10093) : sans client lié, pas de destinataire.
