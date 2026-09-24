-- IKADEVIS — socle Finances, TEMPS 5 : la table payments devient la source
-- de vérité, le marqueur <!--PAYMENTS:…--> quitte invoices.notes.
--
-- ⛔ NE PAS APPLIQUER AVANT D'AVOIR RÉUNI LES QUATRE CONDITIONS CI-DESSOUS ⛔
-- -------------------------------------------------------------------------
--   1. La double écriture (T3) est en ligne depuis 3 à 4 semaines — délai
--      convenu avec l'utilisateur pour qu'aucun navigateur ne serve plus
--      l'ancien app.compiled.js (service worker).
--   2. La lecture depuis la table (T4) est activée et en ligne :
--      LECTURE_REGLEMENTS_DEPUIS_TABLE = true dans index_jsx.js.
--   3. select public.controle_payments_miroir_v1(null) renvoie
--      factures_en_ecart = 0. CE FICHIER LE REVÉRIFIE ET REFUSE DE
--      S'EXÉCUTER SINON (§ 0) : impossible de l'appliquer trop tôt par erreur.
--   4. La version suivante de l'application, qui n'écrit PLUS le marqueur
--      dans notes, est prête à partir juste après (voir § « Et côté
--      application » en fin de fichier).
--
-- Pas de date dans le nom de ce fichier, contrairement à la convention : sa
-- date d'application n'est pas connue, et un nom daté d'aujourd'hui laisserait
-- croire qu'il doit passer aujourd'hui.
--
-- Ce que fait ce fichier
-- ----------------------
--   § 0  garde-fou : refuse si le miroir n'est pas parfait ;
--   § 1  sauvegarde intégrale des notes qui portent un marqueur ;
--   § 2  pose le trigger qui recalcule amount_paid et le statut depuis la
--        table — impossible avant, voir l'explication dans
--        migrations_finance_payments_2026-09-18.sql ;
--   § 3  retire le marqueur des notes.
--
-- Réversibilité
-- -------------
-- Le § 3 est la seule opération destructive du chantier, d'où la sauvegarde
-- du § 1. Pour revenir en arrière :
--     UPDATE public.invoices i SET notes = b.notes
--     FROM public.invoices_notes_backup_t5 b WHERE b.invoice_id = i.id;
--     DROP TRIGGER IF EXISTS trg_payment_allocations_sync ON public.payment_allocations;
--     DROP TRIGGER IF EXISTS trg_payments_status_sync ON public.payments;
--
-- État d'application
-- ------------------
--   staging     (mwfmruzlonsrrfufbsyz) : [ ] conditions 1-4 non réunies
--   production  (qmavetqcpzsfralsqxsi) : [ ] conditions 1-4 non réunies

BEGIN;

-- ── 0. Garde-fou ──────────────────────────────────────────────────────────
DO $$
DECLARE
    v_controle JSONB;
BEGIN
    v_controle := public.controle_payments_miroir_v1(NULL);
    IF (v_controle->>'factures_en_ecart')::int > 0 THEN
        RAISE EXCEPTION 'T5 REFUSÉ : % facture(s) où amount_paid diffère de la table payments. Rejouer backfill_payments_from_notes_v1(null, false), traiter les écarts restants à la main, puis recommencer. Détail : %',
            v_controle->>'factures_en_ecart', v_controle->'detail';
    END IF;
END $$;

-- ── 1. Sauvegarde des notes ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices_notes_backup_t5 (
    invoice_id       UUID PRIMARY KEY REFERENCES public.invoices(id) ON DELETE CASCADE,
    organization_id  UUID NOT NULL,
    notes            TEXT NOT NULL,
    saved_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Données internes de migration : aucun accès depuis l'application (RLS
-- active sans aucune policy, et droits retirés explicitement — les
-- privilèges par défaut de Supabase les accorderaient sinon).
ALTER TABLE public.invoices_notes_backup_t5 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoices_notes_backup_t5 FROM anon, authenticated;

INSERT INTO public.invoices_notes_backup_t5 (invoice_id, organization_id, notes)
SELECT id, organization_id, notes
FROM public.invoices
WHERE notes LIKE '%<!--PAYMENTS:%'
ON CONFLICT (invoice_id) DO NOTHING;   -- un rejeu ne remplace jamais l'original

-- ── 2. amount_paid et statut dérivés de la table ──────────────────────────
-- Même règle que etatReglement() (js/finance-core.js) : le statut découle des
-- MONTANTS. Seuls les règlements confirmés comptent. Brouillons, annulées et
-- avoirs ne sont jamais touchés. Une facture sans règlement revient à 'sent'
-- si elle a été envoyée, sinon à 'issued' — la règle de supprimerReglement.
CREATE OR REPLACE FUNCTION public.recalculer_reglement_facture(p_invoice_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_regle NUMERIC;
BEGIN
    IF p_invoice_id IS NULL THEN RETURN; END IF;

    SELECT COALESCE(sum(a.amount), 0) INTO v_regle
    FROM public.payment_allocations a
    JOIN public.payments p ON p.id = a.payment_id
    WHERE a.invoice_id = p_invoice_id AND p.status = 'confirmed';

    UPDATE public.invoices i
    SET amount_paid = v_regle,
        status = CASE
            WHEN v_regle <= 0 THEN CASE WHEN i.sent_at IS NOT NULL THEN 'sent' ELSE 'issued' END
            WHEN v_regle >= i.net_to_pay_ttc THEN 'paid'
            ELSE 'partially_paid'
        END
    WHERE i.id = p_invoice_id
      AND i.status NOT IN ('draft', 'cancelled')
      AND i.invoice_type <> 'avoir';
END;
$$;
REVOKE ALL ON FUNCTION public.recalculer_reglement_facture(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalculer_reglement_facture(UUID) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_sync_reglement_depuis_imputation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- La facture quittée (modification ou suppression)…
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        PERFORM public.recalculer_reglement_facture(OLD.invoice_id);
    END IF;
    -- …et la facture visée, si elle est nouvelle.
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id) THEN
        PERFORM public.recalculer_reglement_facture(NEW.invoice_id);
    END IF;
    RETURN NULL;
END;
$$;

-- Un chèque qui passe à 'bounced' doit rouvrir la facture qu'il réglait.
CREATE OR REPLACE FUNCTION public.trg_sync_reglement_depuis_statut()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_facture UUID;
BEGIN
    FOR v_facture IN
        SELECT DISTINCT invoice_id FROM public.payment_allocations
        WHERE payment_id = NEW.id AND invoice_id IS NOT NULL
    LOOP
        PERFORM public.recalculer_reglement_facture(v_facture);
    END LOOP;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_allocations_sync ON public.payment_allocations;
CREATE TRIGGER trg_payment_allocations_sync
    AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations
    FOR EACH ROW EXECUTE FUNCTION public.trg_sync_reglement_depuis_imputation();

DROP TRIGGER IF EXISTS trg_payments_status_sync ON public.payments;
CREATE TRIGGER trg_payments_status_sync
    AFTER UPDATE OF status ON public.payments
    FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.trg_sync_reglement_depuis_statut();

-- ── 3. Retrait du marqueur ────────────────────────────────────────────────
-- protect_issued_invoice laisse `notes` modifiable après émission. Le texte
-- libre de l'utilisateur est conservé ; seul le marqueur part.
UPDATE public.invoices
SET notes = NULLIF(btrim(regexp_replace(notes, '\n?<!--PAYMENTS:.*?-->', '', 'g')), '')
WHERE notes LIKE '%<!--PAYMENTS:%';

COMMIT;

-- ── Contrôles post-migration ──────────────────────────────────────────────
--   select count(*) from public.invoices where notes like '%<!--PAYMENTS:%';   -- 0
--   select count(*) from public.invoices_notes_backup_t5;                       -- = factures qui avaient un marqueur
--   select public.controle_payments_miroir_v1(null);                            -- factures_en_ecart = 0
--
-- ── Et côté application ───────────────────────────────────────────────────
-- Juste après ce fichier, publier la version de l'application où
-- InvoiceService.enregistrerReglement / supprimerReglement n'écrivent PLUS
-- `notes` ni `amount_paid` : ils écrivent seulement payments /
-- payment_allocations, et le trigger du § 2 tient le reste à jour.
