-- Correctif ciblé : le Super-Admin est déjà reconnu par public.is_platform_admin()
-- et par l'interface/proxy, mais l'ancien trigger des quotas ne consultait que
-- public.subscriptions (souvent encore Starter). Le contrôle serveur bloquait
-- donc le 4e devis malgré l'accès Entreprise affiché.
-- Prérequis : v6_platform_admin.sql et migrations_saas_entitlements_2026-09-24.sql.
-- Pas d'écriture de rôle ni de modification d'abonnement dans cette migration.
BEGIN;

DO $$
BEGIN
    IF to_regprocedure('public.is_platform_admin()') IS NULL THEN
        RAISE EXCEPTION 'Prérequis absent : appliquer et vérifier v6_platform_admin.sql avant ce correctif.';
    END IF;
END $$;

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

    -- Autorité issue de platform_admins, administrée serveur uniquement.
    -- Ne pas remplacer par un email ou un flag envoyé par le navigateur.
    -- Les contrôles d'appartenance et de rôle métier restent appliqués par les
    -- policies/RPC appelantes ; cet override ne désactive que quota/expiration.
    IF public.is_platform_admin() THEN RETURN NEW; END IF;

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
COMMIT;
