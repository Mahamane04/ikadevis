-- ═══════════════════════════════════════════════════════════════════════════
-- LOT 3 : PAIEMENTS, ENCAISSEMENTS, RELANCES ET INVITATIONS (P1/P2)
-- Constats : REL-02 (abonnements stables / idempotents)
--            SEC-01 (encaissements entreprise contrôlés serveur)
--            REL-04 / REL-05 / SEC-06 (invitations, relances réessayables, échappement)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. REL-02 : IDEMPOTENCE ET INTENTIONS STABLES SUR LES ABONNEMENTS
-- ─────────────────────────────────────────────────────────────────────────────

-- Ajout de colonnes d'idempotence et d'empreinte sur subscription_payments si absentes
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'subscription_payments' AND column_name = 'idempotency_key'
    ) THEN
        ALTER TABLE public.subscription_payments ADD COLUMN idempotency_key TEXT;
        CREATE INDEX IF NOT EXISTS idx_sub_payments_idempotency
            ON public.subscription_payments(organization_id, idempotency_key)
            WHERE idempotency_key IS NOT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'subscription_payments' AND column_name = 'expires_at'
    ) THEN
        ALTER TABLE public.subscription_payments ADD COLUMN expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '15 minutes');
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SEC-01 : SOCLE SERVEUR D'ENCAISSEMENT FACTURES (INVOICE_PAYMENTS)
--    Garantit que le montant est dérivé du reste à payer réel en base,
--    et que seul un webhook / preuve serveur valide peut marquer une facture payée.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invoice_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'XOF',
    provider TEXT NOT NULL DEFAULT 'saspay',
    provider_ref TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
    idempotency_key TEXT,
    initiated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '15 minutes'),
    provider_payload JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_org_inv ON public.invoice_payments(organization_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_idempotency ON public.invoice_payments(organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- RLS sur invoice_payments
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Invoice payments read" ON public.invoice_payments;
CREATE POLICY "Invoice payments read" ON public.invoice_payments
    FOR SELECT USING (public.has_org_permission(organization_id, ARRAY['owner', 'admin', 'commercial', 'viewer']));

-- Aucune mutation directe côté client : l'insertion et la confirmation passent par des RPC contrôlées
DROP POLICY IF EXISTS "Invoice payments write" ON public.invoice_payments;
CREATE POLICY "Invoice payments write" ON public.invoice_payments
    FOR ALL USING (false);

-- RPC 1 : Création d'une intention d'encaissement de facture (serveur-calculé)
CREATE OR REPLACE FUNCTION public.create_invoice_payment_intent(
    p_org_id UUID,
    p_invoice_id UUID,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inv RECORD;
    v_paid_sum NUMERIC(15,2);
    v_balance NUMERIC(15,2);
    v_existing RECORD;
    v_payment_id UUID;
BEGIN
    -- 1. Contrôle des autorisations de l'appelant
    IF NOT public.has_org_permission(p_org_id, ARRAY['owner', 'admin', 'commercial']) THEN
        RAISE EXCEPTION 'Access denied: cannot initiate payment for organization %', p_org_id
            USING ERRCODE = '42501';
    END IF;

    -- 2. Récupération et vérification de la facture
    SELECT id, organization_id, invoice_number, total_ttc, status
    INTO v_inv
    FROM public.invoices
    WHERE id = p_invoice_id AND organization_id = p_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice % not found for organization %', p_invoice_id, p_org_id
            USING ERRCODE = 'P0002';
    END IF;

    -- Une facture brouillon ou annulée ne peut pas être encaissée
    IF v_inv.status NOT IN ('issued', 'partially_paid') THEN
        RAISE EXCEPTION 'Invoice status "%" does not permit payment initiation', v_inv.status
            USING ERRCODE = '22023';
    END IF;

    -- 3. Idempotence : vérifier s'il existe déjà une intention pending récente pour cette facture
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, amount, status, expires_at INTO v_existing
        FROM public.invoice_payments
        WHERE organization_id = p_org_id AND invoice_id = p_invoice_id
          AND idempotency_key = p_idempotency_key
          AND status = 'pending'
          AND expires_at > NOW()
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'payment_id', v_existing.id,
                'amount', v_existing.amount,
                'status', v_existing.status,
                'reused_existing', true
            );
        END IF;
    END IF;

    -- 4. Calcul du reste à payer réel en base
    SELECT COALESCE(SUM(amount), 0) INTO v_paid_sum
    FROM public.invoice_payments
    WHERE organization_id = p_org_id AND invoice_id = p_invoice_id AND status = 'paid';

    v_balance := v_inv.total_ttc - v_paid_sum;
    IF v_balance <= 0 THEN
        RAISE EXCEPTION 'Invoice is already fully paid'
            USING ERRCODE = '22023';
    END IF;

    -- 5. Création de l'intention serveur
    INSERT INTO public.invoice_payments (
        organization_id, invoice_id, amount, currency, status, idempotency_key, initiated_by
    ) VALUES (
        p_org_id, p_invoice_id, v_balance, 'XOF', 'pending', p_idempotency_key, auth.uid()
    ) RETURNING id INTO v_payment_id;

    RETURN jsonb_build_object(
        'payment_id', v_payment_id,
        'invoice_id', p_invoice_id,
        'amount', v_balance,
        'currency', 'XOF',
        'status', 'pending',
        'reused_existing', false
    );
END;
$$;

-- RPC 2 : Confirmation atomique d'un règlement de facture (rapprochement comptable)
CREATE OR REPLACE FUNCTION public.confirm_invoice_payment(
    p_payment_id UUID,
    p_provider_ref TEXT,
    p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pay RECORD;
    v_inv RECORD;
    v_paid_sum NUMERIC(15,2);
    v_new_status TEXT;
BEGIN
    SELECT * INTO v_pay
    FROM public.invoice_payments
    WHERE id = p_payment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment % not found', p_payment_id USING ERRCODE = 'P0002';
    END IF;

    -- Si déjà payé : confirmation idempotente sans réapplication
    IF v_pay.status = 'paid' THEN
        RETURN jsonb_build_object('already_confirmed', true, 'payment_id', p_payment_id);
    END IF;

    IF v_pay.status <> 'pending' THEN
        RAISE EXCEPTION 'Payment is in status "%", cannot confirm', v_pay.status USING ERRCODE = '22023';
    END IF;

    -- Validation du règlement
    UPDATE public.invoice_payments
    SET status = 'paid',
        provider_ref = p_provider_ref,
        confirmed_at = NOW(),
        provider_payload = p_payload
    WHERE id = p_payment_id;

    -- Recalcul de l'état de la facture
    SELECT COALESCE(SUM(amount), 0) INTO v_paid_sum
    FROM public.invoice_payments
    WHERE invoice_id = v_pay.invoice_id AND status = 'paid';

    SELECT total_ttc INTO v_inv
    FROM public.invoices
    WHERE id = v_pay.invoice_id;

    IF v_paid_sum >= v_inv.total_ttc THEN
        v_new_status := 'paid';
    ELSE
        v_new_status := 'partially_paid';
    END IF;

    UPDATE public.invoices
    SET status = v_new_status,
        updated_at = NOW()
    WHERE id = v_pay.invoice_id;

    -- Journalisation inaltérable
    PERFORM public.log_audit_event(
        v_pay.organization_id,
        'invoice_payment_confirmed',
        'invoice',
        v_pay.invoice_id::text,
        jsonb_build_object(
            'payment_id', p_payment_id,
            'amount', v_pay.amount,
            'new_invoice_status', v_new_status,
            'provider_ref', p_provider_ref
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', p_payment_id,
        'new_invoice_status', v_new_status,
        'total_paid', v_paid_sum
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_payment_intent(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_payment_intent(UUID, UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.confirm_invoice_payment(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_invoice_payment(UUID, TEXT, JSONB) TO service_role;



-- ─────────────────────────────────────────────────────────────────────────────
-- 3. REL-05 : FILE D'ENVOI ET DE RELANCES RÉESSAYABLE (EMAIL_REMINDERS)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.outbound_reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 3,
    last_error TEXT,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reminders_status ON public.outbound_reminders(status, retry_count);
CREATE INDEX IF NOT EXISTS idx_reminders_idempotency ON public.outbound_reminders(organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.outbound_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Reminders select" ON public.outbound_reminders;
CREATE POLICY "Reminders select" ON public.outbound_reminders
    FOR SELECT USING (public.has_org_permission(organization_id, ARRAY['owner', 'admin', 'commercial']));
