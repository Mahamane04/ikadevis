-- ============================================================================
-- Migration additive — échéancier de paiement éditable porté au cloud (F5)
-- ============================================================================
-- Contexte : PROJECT_MASTER_TRACKER.md § 21.4 point 2.
--
-- Jusqu'ici l'échéancier de règlement (tableau de tranches {libellé, %}) ne
-- vivait que dans le localStorage du navigateur. Conséquence : un compte cloud
-- perdait son échéancier personnalisé au prochain rechargement depuis le
-- serveur, et retombait silencieusement sur le défaut applicatif.
--
-- ÉTAT D'APPLICATION
--   staging    (ikadevis-staging) : APPLIQUÉ le 2026-08-19, round-trip vérifié
--                                   (4 tranches, total 100%, libellés préservés,
--                                   données de test supprimées après contrôle).
--   production (SuperDevisMO)     : NON APPLIQUÉ — à exécuter par l'utilisateur.
--
-- SÛRETÉ
--   Purement additive : ADD COLUMN IF NOT EXISTS, nullable, sans valeur par
--   défaut. Aucune ligne existante n'est modifiée, aucune donnée réécrite.
--   Rejouable sans risque (idempotent).
--
--   Production comptait 2 lignes dans company_settings au moment de l'écriture
--   de ce fichier : elles resteront à NULL, ce que l'application interprète
--   comme « utiliser le défaut applicatif » (voir mapCompanyFromDb).
--
-- POURQUOI PAS DE DEFAULT SQL
--   Le défaut métier est défini une seule fois, côté application
--   (defaultPaymentSchedule dans index_jsx.js). Le dupliquer ici créerait deux
--   sources de vérité qui dériveraient à la première évolution.
--
-- RLS : aucune policy à ajouter. company_settings est déjà protégée par
--   organisation ; une colonne supplémentaire hérite de ces policies.
-- ============================================================================

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS payment_schedule jsonb;

COMMENT ON COLUMN public.company_settings.payment_schedule IS
  'Échéancier de règlement du devis : tableau [{label, pct}], total attendu 100%. NULL = utiliser le défaut applicatif.';

-- ---------------------------------------------------------------------------
-- Contrôle post-migration (lecture seule, à exécuter après l'ALTER)
-- ---------------------------------------------------------------------------
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name   = 'company_settings'
--   AND column_name  = 'payment_schedule';
--
-- Attendu : payment_schedule | jsonb | YES
