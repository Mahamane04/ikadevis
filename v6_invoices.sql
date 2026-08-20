-- ═══════════════════════════════════════════════════════════════════════════
-- SOCLE DE FACTURATION (2026-08-20) — § 27.5 point 2
-- ═══════════════════════════════════════════════════════════════════════════
-- Trois contraintes légales dictent cette structure, et expliquent pourquoi
-- une facture ne peut pas être « un devis avec un autre titre » :
--
--   1. NUMÉROTATION continue, chronologique, SANS TROU.
--      → Le numéro n'est PAS attribué à la création (un brouillon supprimé
--        laisserait un trou) mais à l'ÉMISSION, atomiquement, avec verrou de
--        ligne. Tant que la facture est en brouillon, invoice_number est NULL.
--
--   2. IMMUABILITÉ : une facture émise ne se modifie ni ne se supprime.
--      → Garanti par TRIGGER en base, pas par l'interface : une règle
--        seulement écrite côté client se contourne. Seuls le suivi de
--        règlement et l'annulation restent permis après émission.
--
--   3. CORRECTION PAR AVOIR uniquement (invoice_type = 'avoir'), qui pointe
--      vers la facture rectifiée.
--
-- Le défaut relevé sur les devis est corrigé ici : `create_quote_v6` génère un
-- numéro serveur mais ne le renvoie PAS (elle retourne l'id seul), si bien que
-- le client garde son propre numéro calculé localement — les deux peuvent
-- diverger. Pour une facture ce serait rédhibitoire : `issue_invoice_v6`
-- renvoie donc explicitement le numéro attribué.

-- ── Séquence de numérotation, une par organisation ────────────────────────
CREATE TABLE IF NOT EXISTS public.organization_invoice_sequences (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    last_seq INT NOT NULL DEFAULT 0,
    prefix TEXT NOT NULL DEFAULT 'FACT-',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Factures ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- NULL tant que la facture est en brouillon : le numéro n'est attribué
    -- qu'à l'émission, pour garantir une séquence sans trou.
    invoice_number TEXT,

    quote_id   UUID REFERENCES public.quotes(id)   ON DELETE SET NULL,
    client_id  UUID REFERENCES public.clients(id)  ON DELETE SET NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    created_by UUID REFERENCES auth.users(id)      ON DELETE SET NULL,

    client_name TEXT NOT NULL,
    project_ref TEXT,

    -- 'acompte'  : appel de fonds au démarrage
    -- 'situation': facturation d'avancement (usage BTP courant)
    -- 'solde'    : dernière facture, déduit les acomptes déjà émis
    -- 'standard' : facture unique, sans découpage
    -- 'avoir'    : annule/corrige une facture déjà émise
    invoice_type TEXT NOT NULL DEFAULT 'standard'
        CHECK (invoice_type IN ('standard','acompte','situation','solde','avoir')),
    corrects_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','issued','partially_paid','paid','cancelled')),

    issued_at TIMESTAMPTZ,
    due_date  DATE,

    vat_rate NUMERIC(5,2) NOT NULL DEFAULT 18,
    total_ht  NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_vat NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_ttc NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- Acomptes déjà facturés, déduits sur la facture de solde.
    deducted_ttc   NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_to_pay_ttc NUMERIC(15,2) NOT NULL DEFAULT 0,
    amount_paid    NUMERIC(15,2) NOT NULL DEFAULT 0,

    company_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Plusieurs NULL sont autorisés par une contrainte UNIQUE en PostgreSQL :
    -- les brouillons (sans numéro) coexistent donc sans conflit, tandis que
    -- deux factures émises ne peuvent jamais porter le même numéro.
    CONSTRAINT unique_org_invoice_number UNIQUE (organization_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_org_status ON public.invoices(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_quote      ON public.invoices(quote_id);

-- ── Lignes de facture ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    line_order INT NOT NULL DEFAULT 1,
    designation TEXT NOT NULL,
    unit TEXT DEFAULT 'u',
    quantity      NUMERIC(12,3) DEFAULT 1,
    unit_price_ht NUMERIC(15,2) DEFAULT 0,
    total_ht      NUMERIC(15,2) DEFAULT 0,
    cost_category TEXT DEFAULT 'material',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON public.invoice_lines(invoice_id);

-- ── Immuabilité après émission (garantie en base, pas dans l'interface) ───
CREATE OR REPLACE FUNCTION public.protect_issued_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Facture % déjà émise : elle ne peut pas être supprimée. Émettez un avoir pour la corriger.',
                COALESCE(OLD.invoice_number, OLD.id::text);
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.status <> 'draft' THEN
        IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
           OR NEW.client_name  IS DISTINCT FROM OLD.client_name
           OR NEW.vat_rate     IS DISTINCT FROM OLD.vat_rate
           OR NEW.total_ht     IS DISTINCT FROM OLD.total_ht
           OR NEW.total_vat    IS DISTINCT FROM OLD.total_vat
           OR NEW.total_ttc    IS DISTINCT FROM OLD.total_ttc
           OR NEW.issued_at    IS DISTINCT FROM OLD.issued_at
           OR NEW.invoice_type IS DISTINCT FROM OLD.invoice_type
        THEN
            RAISE EXCEPTION 'Facture % déjà émise : montants et identité figés. Seuls le règlement et l''annulation restent possibles.',
                COALESCE(OLD.invoice_number, OLD.id::text);
        END IF;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_issued_invoice ON public.invoices;
CREATE TRIGGER trg_protect_issued_invoice
    BEFORE UPDATE OR DELETE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.protect_issued_invoice();

-- Les lignes d'une facture émise sont figées elles aussi : sans ça, on
-- pourrait altérer le détail sans toucher aux totaux de l'en-tête.
CREATE OR REPLACE FUNCTION public.protect_issued_invoice_lines()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status TEXT;
    v_invoice UUID;
BEGIN
    v_invoice := COALESCE(NEW.invoice_id, OLD.invoice_id);
    SELECT status INTO v_status FROM public.invoices WHERE id = v_invoice;
    IF v_status IS NOT NULL AND v_status <> 'draft' THEN
        RAISE EXCEPTION 'Les lignes d''une facture émise ne peuvent plus être modifiées.';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_issued_invoice_lines ON public.invoice_lines;
CREATE TRIGGER trg_protect_issued_invoice_lines
    BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_lines
    FOR EACH ROW EXECUTE FUNCTION public.protect_issued_invoice_lines();

-- ── Émission : attribue le numéro atomiquement ET le renvoie ──────────────
CREATE OR REPLACE FUNCTION public.issue_invoice_v6(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID;
    v_status TEXT;
    v_next_seq INT;
    v_number TEXT;
BEGIN
    SELECT organization_id, status INTO v_org, v_status
    FROM public.invoices WHERE id = p_invoice_id;

    IF v_org IS NULL THEN
        RAISE EXCEPTION 'Facture introuvable';
    END IF;
    IF NOT public.has_org_permission(v_org, ARRAY['owner','admin']) THEN
        RAISE EXCEPTION 'Permission refusée : seuls le propriétaire et un administrateur peuvent émettre une facture';
    END IF;
    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'Cette facture est déjà émise';
    END IF;

    -- Verrou de ligne : deux émissions simultanées ne peuvent pas obtenir le
    -- même numéro (le second attend que le premier ait incrémenté).
    INSERT INTO public.organization_invoice_sequences (organization_id, last_seq, prefix)
    VALUES (v_org, 0, 'FACT-')
    ON CONFLICT (organization_id) DO NOTHING;

    SELECT last_seq + 1 INTO v_next_seq
    FROM public.organization_invoice_sequences
    WHERE organization_id = v_org
    FOR UPDATE;

    UPDATE public.organization_invoice_sequences
    SET last_seq = v_next_seq, updated_at = NOW()
    WHERE organization_id = v_org;

    v_number := 'FACT-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(v_next_seq::text, 3, '0');

    UPDATE public.invoices
    SET invoice_number = v_number,
        status = 'issued',
        issued_at = NOW()
    WHERE id = p_invoice_id;

    RETURN jsonb_build_object(
        'invoice_id', p_invoice_id,
        'invoice_number', v_number,
        'issued_at', NOW()
    );
END;
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.invoices                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invoice_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Invoices select" ON public.invoices;
CREATE POLICY "Invoices select" ON public.invoices
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

DROP POLICY IF EXISTS "Invoices insert" ON public.invoices;
CREATE POLICY "Invoices insert" ON public.invoices
    FOR INSERT WITH CHECK (public.has_org_permission(organization_id, ARRAY['owner','admin','estimator','commercial']));

DROP POLICY IF EXISTS "Invoices update" ON public.invoices;
CREATE POLICY "Invoices update" ON public.invoices
    FOR UPDATE USING (public.has_org_permission(organization_id, ARRAY['owner','admin','estimator','commercial']));

DROP POLICY IF EXISTS "Invoices delete" ON public.invoices;
CREATE POLICY "Invoices delete" ON public.invoices
    FOR DELETE USING (public.has_org_permission(organization_id, ARRAY['owner','admin']));

DROP POLICY IF EXISTS "Invoice lines select" ON public.invoice_lines;
CREATE POLICY "Invoice lines select" ON public.invoice_lines
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

DROP POLICY IF EXISTS "Invoice lines write" ON public.invoice_lines;
CREATE POLICY "Invoice lines write" ON public.invoice_lines
    FOR ALL USING (public.has_org_permission(organization_id, ARRAY['owner','admin','estimator','commercial']));

DROP POLICY IF EXISTS "Invoice sequences select" ON public.organization_invoice_sequences;
CREATE POLICY "Invoice sequences select" ON public.organization_invoice_sequences
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

COMMENT ON TABLE public.invoices IS
  'Factures. Le numéro n''est attribué qu''à l''émission (issue_invoice_v6), pour garantir une séquence sans trou. Une facture émise est figée par trigger : correction par avoir uniquement.';
