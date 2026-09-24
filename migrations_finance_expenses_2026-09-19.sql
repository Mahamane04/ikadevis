-- IKADEVIS — Finances : dépenses et factures fournisseurs (§ 72).
--
-- Contexte
-- --------
-- Ce qui sort de la caisse n'était saisi nulle part. Ce fichier ajoute :
--   - expenses        : une dépense, « déjà payée » ou « à payer » ;
--   - expense_splits  : sa répartition entre plusieurs chantiers ;
--   - des fonctions qui enregistrent, règlent et suppriment une dépense en
--     UNE transaction (la dépense, son règlement et son imputation
--     réussissent ou échouent ensemble).
--
-- Règles du cahier des charges (§ 8), garanties ici et non seulement à l'écran :
--   - « Déjà payé » exige un compte de sortie ; « À payer » exige une échéance
--     et ne demande PAS de compte : il sera choisi au règlement.
--   - Une dépense avancée personnellement (advanced_by) ne fait sortir aucun
--     argent d'un compte de l'entreprise : elle crée un montant à rembourser.
--   - Une facture répartie entre plusieurs chantiers : la somme des parts
--     retombe EXACTEMENT sur le montant à répartir (contrainte différée).
--   - Montant à répartir = coût réel : HT si la taxe est récupérable, TTC
--     sinon (une taxe non récupérable augmente le coût).
--   - Le statut (à payer / partiellement payée / payée) découle des
--     règlements, jamais d'une case cochée.
--
-- Dépend de : migrations_finance_socle_2026-09-18.sql (currencies),
--   migrations_finance_payments_2026-09-18.sql (payments, payment_allocations),
--   migrations_finance_settings_accounts_2026-09-19.sql (comptes, taxes,
--   catégories).
--
-- Sûreté : additive et rejouable. Aucune donnée existante modifiée.
--
-- État d'application
-- ------------------
--   staging     (mwfmruzlonsrrfufbsyz) : [ ] à appliquer
--   production  (qmavetqcpzsfralsqxsi) : [ ] à appliquer APRÈS validation staging


-- ── 1. Dépenses ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expenses (
    id               UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- expense : payée immédiatement ; supplier_invoice : facture à payer.
    kind             TEXT NOT NULL CHECK (kind IN ('expense','supplier_invoice')),
    description      TEXT NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 200),
    supplier_id      UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    -- Dénormalisé à dessein : c'est ce qui a sauvé les factures lors de
    -- l'incident du 2026-09-02 (identifiants locaux non uuid).
    supplier_name    TEXT,
    document_ref     TEXT,            -- n° de facture ou de reçu du fournisseur
    expense_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date         DATE,
    category_id      UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
    project_id       UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    project_ref      TEXT,            -- libellé du chantier, dénormalisé
    lot_code         TEXT,
    currency         CHAR(3) NOT NULL REFERENCES public.currencies(code),
    fx_rate          NUMERIC(18,8) NOT NULL DEFAULT 1 CHECK (fx_rate > 0),
    base_currency    CHAR(3) NOT NULL REFERENCES public.currencies(code),
    amount_ht        NUMERIC(15,2) NOT NULL CHECK (amount_ht >= 0),
    tax_rate_id      UUID REFERENCES public.tax_rates(id) ON DELETE SET NULL,
    -- Instantanés : le taux d'une dépense saisie ne change jamais, même si
    -- la taxe est modifiée ensuite.
    tax_rate         NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
    tax_recoverable  BOOLEAN NOT NULL DEFAULT TRUE,
    tax_amount       NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    amount_ttc       NUMERIC(15,2) NOT NULL CHECK (amount_ttc > 0),
    amount_base      NUMERIC(15,2) NOT NULL,
    -- Personne qui a avancé la dépense de sa poche : l'entreprise lui doit
    -- ce montant. Aucun compte de l'entreprise n'est mouvementé.
    advanced_by      TEXT,
    amount_paid      NUMERIC(15,2) NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'to_pay'
                     CHECK (status IN ('to_pay','partially_paid','paid','cancelled')),
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by       UUID REFERENCES auth.users(id),
    CONSTRAINT expenses_ttc_coherent CHECK (amount_ht + tax_amount = amount_ttc),
    CONSTRAINT expenses_due_for_invoice CHECK (kind <> 'supplier_invoice' OR due_date IS NOT NULL),
    CONSTRAINT expenses_due_after CHECK (due_date IS NULL OR due_date >= expense_date)
);
CREATE INDEX IF NOT EXISTS idx_expenses_org_date ON public.expenses(organization_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_project ON public.expenses(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_unpaid ON public.expenses(organization_id, due_date)
    WHERE status IN ('to_pay','partially_paid');

-- La clé étrangère des imputations vers les dépenses, réservée depuis le § 70.
-- RESTRICT : une dépense réglée ne disparaît pas en laissant un décaissement
-- orphelin — on passe par supprimer_depense_v1, qui retire aussi le règlement.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_allocations_expense_fk') THEN
        ALTER TABLE public.payment_allocations
            ADD CONSTRAINT payment_allocations_expense_fk FOREIGN KEY (expense_id)
            REFERENCES public.expenses(id) ON DELETE RESTRICT;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_alloc_expense ON public.payment_allocations(expense_id) WHERE expense_id IS NOT NULL;


-- ── 2. Répartition entre chantiers ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expense_splits (
    id               UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    expense_id       UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
    project_id       UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    project_ref      TEXT,
    lot_code         TEXT,
    amount           NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    CONSTRAINT expense_splits_target CHECK (project_id IS NOT NULL OR NULLIF(btrim(project_ref), '') IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_expense_splits_expense ON public.expense_splits(expense_id);

-- Montant à répartir = coût réel de la dépense.
CREATE OR REPLACE FUNCTION public.expense_cost_amount(p_expense_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT CASE WHEN tax_recoverable THEN amount_ht ELSE amount_ttc END
    FROM public.expenses WHERE id = p_expense_id;
$$;

-- Vérifiée en fin de transaction : on peut remplacer toutes les parts d'une
-- dépense sans que l'état intermédiaire soit refusé.
CREATE OR REPLACE FUNCTION public.check_expense_splits_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id      UUID;
    v_parts   NUMERIC;
    v_nombre  INT;
    v_cout    NUMERIC;
BEGIN
    IF TG_TABLE_NAME = 'expenses' THEN
        v_id := COALESCE(NEW.id, OLD.id);
    ELSE
        v_id := COALESCE(NEW.expense_id, OLD.expense_id);
    END IF;
    SELECT COALESCE(sum(amount), 0), count(*) INTO v_parts, v_nombre
    FROM public.expense_splits WHERE expense_id = v_id;
    IF v_nombre = 0 THEN RETURN NULL; END IF;
    v_cout := public.expense_cost_amount(v_id);
    IF v_cout IS NULL THEN RETURN NULL; END IF;   -- dépense supprimée
    IF v_parts <> v_cout THEN
        RAISE EXCEPTION 'La répartition entre chantiers (%) ne retombe pas sur le montant à répartir (%).', v_parts, v_cout;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_expense_splits_total ON public.expense_splits;
CREATE CONSTRAINT TRIGGER trg_expense_splits_total
    AFTER INSERT OR UPDATE OR DELETE ON public.expense_splits
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.check_expense_splits_total();

DROP TRIGGER IF EXISTS trg_expense_amount_vs_splits ON public.expenses;
CREATE CONSTRAINT TRIGGER trg_expense_amount_vs_splits
    AFTER UPDATE OF amount_ht, amount_ttc, tax_recoverable ON public.expenses
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.check_expense_splits_total();


-- ── 3. Montant réglé et statut, dérivés des règlements ────────────────────
-- Contrairement aux factures (§ 70.3), aucun ancien code n'écrit amount_paid
-- sur les dépenses : le trigger peut en être la seule source dès maintenant.
CREATE OR REPLACE FUNCTION public.recalculer_reglement_depense(p_expense_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_regle NUMERIC;
BEGIN
    IF p_expense_id IS NULL THEN RETURN; END IF;
    SELECT COALESCE(sum(a.amount), 0) INTO v_regle
    FROM public.payment_allocations a
    JOIN public.payments p ON p.id = a.payment_id
    WHERE a.expense_id = p_expense_id AND p.status = 'confirmed';

    UPDATE public.expenses e
    SET amount_paid = v_regle,
        status = CASE
            WHEN e.status = 'cancelled' THEN 'cancelled'
            WHEN v_regle <= 0 THEN 'to_pay'
            WHEN v_regle >= e.amount_ttc THEN 'paid'
            ELSE 'partially_paid' END,
        updated_at = NOW()
    WHERE e.id = p_expense_id;
END;
$$;
REVOKE ALL ON FUNCTION public.recalculer_reglement_depense(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalculer_reglement_depense(UUID) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_sync_depense_depuis_imputation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP IN ('UPDATE','DELETE') THEN PERFORM public.recalculer_reglement_depense(OLD.expense_id); END IF;
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.expense_id IS DISTINCT FROM OLD.expense_id) THEN
        PERFORM public.recalculer_reglement_depense(NEW.expense_id);
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_expense_allocations_sync ON public.payment_allocations;
CREATE TRIGGER trg_expense_allocations_sync
    AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations
    FOR EACH ROW EXECUTE FUNCTION public.trg_sync_depense_depuis_imputation();

-- Un chèque fournisseur rejeté rouvre la dépense.
CREATE OR REPLACE FUNCTION public.trg_sync_depense_depuis_statut()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v UUID;
BEGIN
    FOR v IN SELECT DISTINCT expense_id FROM public.payment_allocations
             WHERE payment_id = NEW.id AND expense_id IS NOT NULL LOOP
        PERFORM public.recalculer_reglement_depense(v);
    END LOOP;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_status_sync_depense ON public.payments;
CREATE TRIGGER trg_payments_status_sync_depense
    AFTER UPDATE OF status ON public.payments
    FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.trg_sync_depense_depuis_statut();


-- ── 4. Droits ─────────────────────────────────────────────────────────────
-- Mêmes rôles que la saisie d'une facture : un conducteur de travaux
-- « commercial » ou « estimator » doit pouvoir saisir la dépense qu'il fait.
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['expenses','expense_splits'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "%s select" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "%s select" ON public.%I FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()))', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "%s write" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "%s write" ON public.%I FOR ALL USING (public.has_org_permission(organization_id, ARRAY[''owner'',''admin'',''estimator'',''commercial''])) WITH CHECK (public.has_org_permission(organization_id, ARRAY[''owner'',''admin'',''estimator'',''commercial'']))', t, t);
    END LOOP;
END $$;


-- ── 5. Enregistrer une dépense (création ou modification) ─────────────────
-- SECURITY INVOKER : s'exécute avec les droits de l'appelant, donc sous la
-- RLS. Son seul rôle est l'ATOMICITÉ : dépense + répartition + règlement
-- immédiat réussissent ou échouent ensemble.
--
-- p est un objet JSON reprenant les colonnes de expenses, plus :
--   splits     : [{project_id?, project_ref?, lot_code?, amount}] (facultatif)
--   account_id : compte de sortie, obligatoire pour une dépense « déjà payée »
--                par l'entreprise (kind = 'expense', advanced_by vide)
--   method     : mode de paiement de ce règlement immédiat
CREATE OR REPLACE FUNCTION public.enregistrer_depense_v1(p JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_id          UUID := NULLIF(p->>'id', '')::uuid;
    v_org         UUID := (p->>'organization_id')::uuid;
    v_existe      public.expenses%ROWTYPE;
    v_regle       NUMERIC := 0;
    v_compte      UUID := NULLIF(p->>'account_id', '')::uuid;
    v_avance      TEXT := NULLIF(btrim(p->>'advanced_by'), '');
    v_kind        TEXT := p->>'kind';
    v_ttc         NUMERIC := (p->>'amount_ttc')::numeric;
    v_devise      CHAR(3) := p->>'currency';
    v_paiement    UUID;
    v_split       JSONB;
    v_nouveau     BOOLEAN := FALSE;
BEGIN
    IF v_kind = 'supplier_invoice' AND v_compte IS NOT NULL THEN
        RAISE EXCEPTION 'Une facture à payer n''a pas encore de compte : il sera choisi au règlement.';
    END IF;
    IF v_kind = 'expense' AND v_avance IS NOT NULL AND v_compte IS NOT NULL THEN
        RAISE EXCEPTION 'Une dépense avancée personnellement ne sort d''aucun compte de l''entreprise.';
    END IF;

    IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.expenses WHERE id = v_id) THEN
        SELECT * INTO v_existe FROM public.expenses WHERE id = v_id AND organization_id = v_org;
        IF NOT FOUND THEN RAISE EXCEPTION 'Dépense introuvable.'; END IF;
        SELECT COALESCE(sum(a.amount), 0) INTO v_regle FROM public.payment_allocations a WHERE a.expense_id = v_id;
        -- Une dépense déjà réglée garde ses montants : on annule d'abord le
        -- règlement. Sinon le décaissement enregistré mentirait.
        IF v_regle > 0 AND (v_ttc IS DISTINCT FROM v_existe.amount_ttc OR v_devise IS DISTINCT FROM v_existe.currency
                            OR v_kind IS DISTINCT FROM v_existe.kind
                            OR v_avance IS DISTINCT FROM v_existe.advanced_by) THEN
            RAISE EXCEPTION 'Cette dépense a déjà un règlement : annulez-le avant de changer son montant, sa devise ou sa nature.';
        END IF;
        UPDATE public.expenses SET
            description = p->>'description', supplier_name = NULLIF(btrim(p->>'supplier_name'), ''),
            document_ref = NULLIF(btrim(p->>'document_ref'), ''), expense_date = (p->>'expense_date')::date,
            due_date = NULLIF(p->>'due_date', '')::date, category_id = NULLIF(p->>'category_id', '')::uuid,
            project_id = NULLIF(p->>'project_id', '')::uuid, project_ref = NULLIF(btrim(p->>'project_ref'), ''),
            lot_code = NULLIF(btrim(p->>'lot_code'), ''), currency = v_devise,
            fx_rate = COALESCE((p->>'fx_rate')::numeric, 1), base_currency = p->>'base_currency',
            amount_ht = (p->>'amount_ht')::numeric, tax_rate_id = NULLIF(p->>'tax_rate_id', '')::uuid,
            tax_rate = COALESCE((p->>'tax_rate')::numeric, 0), tax_recoverable = COALESCE((p->>'tax_recoverable')::boolean, true),
            tax_amount = COALESCE((p->>'tax_amount')::numeric, 0), amount_ttc = v_ttc,
            amount_base = (p->>'amount_base')::numeric, advanced_by = v_avance, kind = v_kind,
            notes = NULLIF(btrim(p->>'notes'), ''), updated_at = NOW()
        WHERE id = v_id;
    ELSE
        -- Une dépense déjà payée par l'entreprise doit dire d'où l'argent est sorti.
        IF v_kind = 'expense' AND v_avance IS NULL AND v_compte IS NULL THEN
            RAISE EXCEPTION 'Une dépense déjà payée doit indiquer le compte d''où l''argent est sorti.';
        END IF;
        v_nouveau := TRUE;
        INSERT INTO public.expenses (id, organization_id, kind, description, supplier_name, document_ref, expense_date,
            due_date, category_id, project_id, project_ref, lot_code, currency, fx_rate, base_currency, amount_ht,
            tax_rate_id, tax_rate, tax_recoverable, tax_amount, amount_ttc, amount_base, advanced_by, notes, created_by)
        VALUES (COALESCE(v_id, extensions.uuid_generate_v4()), v_org, v_kind, p->>'description',
            NULLIF(btrim(p->>'supplier_name'), ''), NULLIF(btrim(p->>'document_ref'), ''),
            (p->>'expense_date')::date, NULLIF(p->>'due_date', '')::date, NULLIF(p->>'category_id', '')::uuid,
            NULLIF(p->>'project_id', '')::uuid, NULLIF(btrim(p->>'project_ref'), ''), NULLIF(btrim(p->>'lot_code'), ''),
            v_devise, COALESCE((p->>'fx_rate')::numeric, 1), p->>'base_currency', (p->>'amount_ht')::numeric,
            NULLIF(p->>'tax_rate_id', '')::uuid, COALESCE((p->>'tax_rate')::numeric, 0),
            COALESCE((p->>'tax_recoverable')::boolean, true), COALESCE((p->>'tax_amount')::numeric, 0), v_ttc,
            (p->>'amount_base')::numeric, v_avance, NULLIF(btrim(p->>'notes'), ''), auth.uid())
        RETURNING id INTO v_id;
    END IF;

    -- Répartition : remplacée en bloc ; la contrainte différée vérifie le
    -- total à la fin de la transaction.
    DELETE FROM public.expense_splits WHERE expense_id = v_id;
    IF jsonb_typeof(p->'splits') = 'array' AND jsonb_array_length(p->'splits') > 0 THEN
        FOR v_split IN SELECT * FROM jsonb_array_elements(p->'splits') LOOP
            INSERT INTO public.expense_splits (organization_id, expense_id, project_id, project_ref, lot_code, amount)
            VALUES (v_org, v_id, NULLIF(v_split->>'project_id', '')::uuid, NULLIF(btrim(v_split->>'project_ref'), ''),
                    NULLIF(btrim(v_split->>'lot_code'), ''), (v_split->>'amount')::numeric);
        END LOOP;
        -- Répartie : la dépense ne porte plus un chantier unique.
        UPDATE public.expenses SET project_id = NULL, project_ref = NULL, lot_code = NULL WHERE id = v_id;
    END IF;

    -- Règlement immédiat d'une dépense « déjà payée » par l'entreprise.
    IF v_nouveau AND v_kind = 'expense' AND v_avance IS NULL THEN
        INSERT INTO public.payments (organization_id, direction, payment_date, amount, currency, fx_rate,
            base_currency, amount_base, method, account_id, reference, note, source, created_by)
        VALUES (v_org, 'out', (p->>'expense_date')::date, v_ttc, v_devise, COALESCE((p->>'fx_rate')::numeric, 1),
            p->>'base_currency', (p->>'amount_base')::numeric, COALESCE(NULLIF(p->>'method', ''), 'other'),
            v_compte, NULLIF(btrim(p->>'document_ref'), ''), p->>'description', 'app', auth.uid())
        RETURNING id INTO v_paiement;
        INSERT INTO public.payment_allocations (organization_id, payment_id, expense_id, amount, amount_base)
        VALUES (v_org, v_paiement, v_id, v_ttc, (p->>'amount_base')::numeric);
    END IF;

    RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.enregistrer_depense_v1(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enregistrer_depense_v1(JSONB) TO authenticated;


-- ── 6. Régler une dépense (partiellement ou en totalité) ──────────────────
-- Sert aussi à rembourser une dépense avancée personnellement.
CREATE OR REPLACE FUNCTION public.regler_depense_v1(
    p_expense_id UUID, p_account_id UUID, p_date DATE, p_amount NUMERIC,
    p_method TEXT DEFAULT 'other', p_reference TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_e       public.expenses%ROWTYPE;
    v_regle   NUMERIC;
    v_id      UUID;
BEGIN
    SELECT * INTO v_e FROM public.expenses WHERE id = p_expense_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Dépense introuvable.'; END IF;
    IF v_e.status = 'cancelled' THEN RAISE EXCEPTION 'Cette dépense est annulée.'; END IF;
    IF p_account_id IS NULL THEN RAISE EXCEPTION 'Choisissez le compte d''où part le règlement.'; END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Le montant du règlement doit être positif.'; END IF;
    SELECT COALESCE(sum(amount), 0) INTO v_regle FROM public.payment_allocations WHERE expense_id = p_expense_id;
    IF p_amount > v_e.amount_ttc - v_regle THEN
        RAISE EXCEPTION 'Le règlement (%) dépasse le reste à payer (%).', p_amount, v_e.amount_ttc - v_regle;
    END IF;

    INSERT INTO public.payments (organization_id, direction, payment_date, amount, currency, fx_rate, base_currency,
        amount_base, method, account_id, reference, note, source, created_by)
    VALUES (v_e.organization_id, 'out', COALESCE(p_date, CURRENT_DATE), p_amount, v_e.currency, v_e.fx_rate,
        v_e.base_currency, round(p_amount * v_e.fx_rate, 2), COALESCE(NULLIF(p_method, ''), 'other'),
        p_account_id, NULLIF(btrim(p_reference), ''),
        CASE WHEN v_e.advanced_by IS NOT NULL THEN 'Remboursement à ' || v_e.advanced_by ELSE v_e.description END,
        'app', auth.uid())
    RETURNING id INTO v_id;
    INSERT INTO public.payment_allocations (organization_id, payment_id, expense_id, amount, amount_base)
    VALUES (v_e.organization_id, v_id, p_expense_id, p_amount, round(p_amount * v_e.fx_rate, 2));
    RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.regler_depense_v1(UUID, UUID, DATE, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regler_depense_v1(UUID, UUID, DATE, NUMERIC, TEXT, TEXT) TO authenticated;


-- ── 7. Annuler un règlement / supprimer une dépense ───────────────────────
CREATE OR REPLACE FUNCTION public.annuler_reglement_depense_v1(p_payment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.payment_allocations WHERE payment_id = p_payment_id AND expense_id IS NULL) THEN
        RAISE EXCEPTION 'Ce règlement ne concerne pas seulement des dépenses.';
    END IF;
    DELETE FROM public.payment_allocations WHERE payment_id = p_payment_id;
    DELETE FROM public.payments WHERE id = p_payment_id AND direction = 'out';
END;
$$;
REVOKE ALL ON FUNCTION public.annuler_reglement_depense_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.annuler_reglement_depense_v1(UUID) TO authenticated;

-- Supprime la dépense ET ses décaissements : sans cela, l'argent sorti
-- resterait dans le solde du compte sans aucune justification.
CREATE OR REPLACE FUNCTION public.supprimer_depense_v1(p_expense_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_paiements UUID[];
BEGIN
    SELECT array_agg(DISTINCT payment_id) INTO v_paiements
    FROM public.payment_allocations WHERE expense_id = p_expense_id;
    IF v_paiements IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.payment_allocations
        WHERE payment_id = ANY (v_paiements) AND (expense_id IS DISTINCT FROM p_expense_id)) THEN
        RAISE EXCEPTION 'Un règlement de cette dépense en couvre aussi d''autres : annulez-le d''abord.';
    END IF;
    DELETE FROM public.payment_allocations WHERE expense_id = p_expense_id;
    IF v_paiements IS NOT NULL THEN
        DELETE FROM public.payments WHERE id = ANY (v_paiements);
    END IF;
    DELETE FROM public.expenses WHERE id = p_expense_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Dépense introuvable ou droits insuffisants.'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.supprimer_depense_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supprimer_depense_v1(UUID) TO authenticated;


-- ── Contrôles post-migration ──────────────────────────────────────────────
--   select count(*) from public.expenses;             -- 0 au départ
--   passer get_advisors (sécurité) : aucune table sans RLS.
