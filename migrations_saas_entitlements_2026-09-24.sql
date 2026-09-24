-- Prérequis : v6_schema.sql puis migrations_saas_subscriptions_2026-09-24.sql.
-- À valider sur staging avant production. Ne modifie ni les prix ni les données existantes.
BEGIN;

-- Verrou commun par organisation : deux créations simultanées ne peuvent
-- pas toutes deux consommer la dernière place. Les modifications restent possibles.
CREATE OR REPLACE FUNCTION public.enforce_subscription_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    s public.subscriptions%ROWTYPE;
    n bigint;
    maximum integer;
    existing boolean := false;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
            RAISE EXCEPTION 'Le transfert entre entreprises est interdit.' USING ERRCODE = '42501';
        END IF;
        IF TG_TABLE_NAME <> 'projects' THEN RETURN NEW; END IF;
        IF NEW.status IN ('completed', 'cancelled') OR COALESCE(OLD.status, 'active') NOT IN ('completed', 'cancelled') THEN RETURN NEW; END IF;
    END IF;

    SELECT * INTO s FROM public.subscriptions WHERE organization_id = NEW.organization_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Abonnement indisponible. Réessayez après synchronisation.' USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF TG_TABLE_NAME = 'quotes' THEN
            SELECT EXISTS(SELECT 1 FROM public.quotes WHERE id = NEW.id AND organization_id = NEW.organization_id) INTO existing;
        ELSIF TG_TABLE_NAME = 'projects' THEN
            SELECT EXISTS(SELECT 1 FROM public.projects WHERE id = NEW.id AND organization_id = NEW.organization_id) INTO existing;
        ELSE
            SELECT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id = NEW.organization_id AND user_id = NEW.user_id) INTO existing;
        END IF;
        IF existing THEN RETURN NEW; END IF;
    END IF;
    IF TG_TABLE_NAME = 'projects' THEN
        IF NEW.status IN ('completed', 'cancelled') THEN RETURN NEW; END IF;
    END IF;
    IF NOT ((s.status = 'trial' AND s.plan_id = 'starter' AND s.trial_ends_at > now())
        OR (s.status = 'active' AND s.plan_id IN ('standard', 'entreprise', 'pro', 'business') AND s.current_period_end > now())) THEN
        RAISE EXCEPTION 'Votre abonnement a expiré. Choisissez une formule pour ajouter de nouvelles données.' USING ERRCODE = 'P0001';
    END IF;

    IF TG_TABLE_NAME = 'quotes' THEN
        maximum := CASE WHEN s.plan_id = 'starter' THEN 3 ELSE NULL END;
        SELECT count(*) INTO n FROM public.quotes WHERE organization_id = NEW.organization_id;
    ELSIF TG_TABLE_NAME = 'projects' THEN
        maximum := CASE WHEN s.plan_id = 'starter' THEN 1 ELSE NULL END;
        SELECT count(*) INTO n FROM public.projects WHERE organization_id = NEW.organization_id AND COALESCE(status, 'active') NOT IN ('completed', 'cancelled') AND id <> NEW.id;
    ELSE
        maximum := CASE WHEN s.plan_id = 'starter' THEN 1 WHEN s.plan_id IN ('standard', 'pro') THEN 5 ELSE NULL END;
        SELECT count(*) INTO n FROM public.organization_members WHERE organization_id = NEW.organization_id;
    END IF;
    IF maximum IS NOT NULL AND n >= maximum THEN
        RAISE EXCEPTION 'Limite de la formule atteinte : % % maximum. Choisissez une formule supérieure.', maximum,
            CASE TG_TABLE_NAME WHEN 'quotes' THEN 'devis' WHEN 'projects' THEN 'chantier(s) actif(s)' ELSE 'utilisateur(s)' END
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_subscription_capacity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS subscription_capacity_quotes ON public.quotes;
CREATE TRIGGER subscription_capacity_quotes BEFORE INSERT OR UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_capacity();
DROP TRIGGER IF EXISTS subscription_capacity_projects ON public.projects;
CREATE TRIGGER subscription_capacity_projects BEFORE INSERT OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_capacity();
DROP TRIGGER IF EXISTS subscription_capacity_members ON public.organization_members;
CREATE TRIGGER subscription_capacity_members BEFORE INSERT OR UPDATE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_capacity();

-- Le marqueur de paiement ET l'abonnement sont écrits dans la même transaction.
-- Seul le proxy, après vérification auprès du prestataire, peut appeler cette RPC.
CREATE OR REPLACE FUNCTION public.apply_verified_subscription_payment(
    p_organization_id uuid, p_payment_id uuid, p_amount numeric, p_currency text, p_response jsonb
) RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    s public.subscriptions%ROWTYPE;
    p public.subscription_payments%ROWTYPE;
    start_at timestamptz;
BEGIN
    SELECT * INTO s FROM public.subscriptions WHERE organization_id = p_organization_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Abonnement introuvable.'; END IF;
    SELECT * INTO p FROM public.subscription_payments WHERE id = p_payment_id AND organization_id = p_organization_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Paiement introuvable pour cette entreprise.'; END IF;
    IF p.applied_at IS NOT NULL THEN RETURN s; END IF;
    IF p.provider_payment_id IS NULL OR p_amount IS NULL OR p_amount::text IN ('NaN', 'Infinity', '-Infinity')
       OR p_amount < p.amount OR p_currency IS NULL OR upper(p_currency) <> p.currency THEN
        RAISE EXCEPTION 'Le montant ou la devise du paiement ne sont pas confirmés.';
    END IF;
    IF p.plan_id NOT IN ('standard', 'entreprise', 'pro', 'business') THEN RAISE EXCEPTION 'Formule invalide.'; END IF;
    -- Ne transforme pas une période Standard déjà payée en période Entreprise gratuite.
    IF s.status = 'active' AND s.current_period_end > now()
       AND (CASE s.plan_id WHEN 'pro' THEN 'standard' WHEN 'business' THEN 'entreprise' ELSE s.plan_id END
           <> CASE p.plan_id WHEN 'pro' THEN 'standard' WHEN 'business' THEN 'entreprise' ELSE p.plan_id END) THEN
        RAISE EXCEPTION 'Changement de formule en cours de période : régularisation nécessaire.';
    END IF;
    start_at := CASE WHEN s.status = 'active' AND s.current_period_end > now() THEN s.current_period_end ELSE now() END;
    UPDATE public.subscriptions SET plan_id = p.plan_id, status = 'active', billing_cycle = p.billing_cycle,
        current_period_start = CASE WHEN s.status = 'active' AND s.current_period_end > now() THEN s.current_period_start ELSE now() END,
        current_period_end = start_at + CASE p.billing_cycle WHEN 'yearly' THEN interval '365 days' ELSE interval '30 days' END,
        last_payment_id = p.id, updated_at = now()
        WHERE organization_id = p_organization_id RETURNING * INTO s;
    UPDATE public.subscription_payments SET status = 'paid', paid_at = now(), applied_at = now(), raw_response = p_response WHERE id = p.id;
    RETURN s;
END $$;
REVOKE ALL ON FUNCTION public.apply_verified_subscription_payment(uuid, uuid, numeric, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_verified_subscription_payment(uuid, uuid, numeric, text, jsonb) TO service_role;
COMMIT;
