-- ===================================================================
-- SUPER-ADMIN PLATEFORME (ÉDITEUR DU SAAS) — FONDATION SÉCURISÉE
-- Migration additive à v6_schema.sql — 2026-08-17
-- ===================================================================
-- Un super-admin contourne par construction l'isolation multi-tenant
-- (RLS par organization_id), c'est-à-dire exactement la protection
-- anti-IDOR sur laquelle repose tout le schéma V6. Trois garde-fous
-- non négociables encadrent donc ce contournement :
--
--   1. LECTURE SEULE sur les données clients. Aucune policy d'écriture
--      cross-tenant n'est créée. Un admin plateforme peut diagnostiquer
--      et produire des statistiques, il ne peut PAS modifier le devis
--      d'un client à son insu. (Choix délibéré : le jour où un besoin
--      d'écriture apparaît — corriger une donnée en support — il devra
--      passer par une RPC dédiée, journalisée et limitée au strict
--      nécessaire, pas par un blanc-seing global.)
--
--   2. AUCUNE AUTO-PROMOTION POSSIBLE. La table platform_admins n'a
--      aucune policy INSERT/UPDATE/DELETE. RLS étant actif, Postgres
--      refuse toute écriture venant de anon/authenticated, même avec un
--      JWT parfaitement valide. L'octroi du rôle se fait exclusivement
--      en SQL direct sous service_role (SQL Editor du dashboard).
--
--   3. TRAÇABILITÉ. Tout accès à la vue plateforme est journalisé dans
--      platform_admin_audit, elle aussi non-écrivable côté client.
--
-- VÉRIFIÉ SUR STAGING LE 2026-08-17 (scénario 2 organisations distinctes) :
--   · utilisateur lambda            → voit 1 org / 1 devis (les siens)
--   · admin plateforme              → voit 2 orgs / 2 devis (tous)
--   · INSERT dans platform_admins depuis "authenticated" → refusé
--   · get_platform_overview() depuis un compte lambda    → refusé
--   · accès admin                   → journalisé dans platform_admin_audit
-- ===================================================================

-- 1. TABLE DES ADMINISTRATEURS PLATEFORME
CREATE TABLE IF NOT EXISTS public.platform_admins (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    note TEXT
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- 2. JOURNAL D'AUDIT DES ACCÈS PLATEFORME
CREATE TABLE IF NOT EXISTS public.platform_admin_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    admin_email TEXT,
    action TEXT NOT NULL,
    target_organization_id UUID,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.platform_admin_audit ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_platform_audit_created
    ON public.platform_admin_audit (created_at DESC);

-- 3. HELPER : l'utilisateur courant est-il admin plateforme ?
-- SECURITY DEFINER (exécuté avec les droits du propriétaire, qui possède
-- la table) : pas de récursion RLS quand on l'utilise dans une policy DE
-- platform_admins elle-même. Même schéma que get_my_organization_ids().
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
    );
$$;

-- 4. POLICIES SUR LES TABLES PLATEFORME (lecture seule, jamais d'écriture API)
DROP POLICY IF EXISTS "Platform admins select" ON public.platform_admins;
CREATE POLICY "Platform admins select" ON public.platform_admins
    FOR SELECT USING (user_id = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS "Platform audit select" ON public.platform_admin_audit;
CREATE POLICY "Platform audit select" ON public.platform_admin_audit
    FOR SELECT USING (public.is_platform_admin());

-- 5. LECTURE CROSS-TENANT POUR LES ADMINS PLATEFORME
-- Policies PERMISSIVES ADDITIONNELLES : en Postgres, plusieurs policies
-- permissives sur une même table/commande se combinent en OR. On ajoute
-- donc l'accès admin SANS toucher aux policies tenant existantes —
-- aucun risque de casser l'isolation déjà en place et déjà testée.
DROP POLICY IF EXISTS "Platform admin read" ON public.organizations;
CREATE POLICY "Platform admin read" ON public.organizations FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admin read" ON public.organization_members;
CREATE POLICY "Platform admin read" ON public.organization_members FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admin read" ON public.company_settings;
CREATE POLICY "Platform admin read" ON public.company_settings FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admin read" ON public.organization_quote_sequences;
CREATE POLICY "Platform admin read" ON public.organization_quote_sequences FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admin read" ON public.clients;
CREATE POLICY "Platform admin read" ON public.clients FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admin read" ON public.projects;
CREATE POLICY "Platform admin read" ON public.projects FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admin read" ON public.materials;
CREATE POLICY "Platform admin read" ON public.materials FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admin read" ON public.labor;
CREATE POLICY "Platform admin read" ON public.labor FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admin read" ON public.solutions;
CREATE POLICY "Platform admin read" ON public.solutions FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admin read" ON public.recipes;
CREATE POLICY "Platform admin read" ON public.recipes FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admin read" ON public.quotes;
CREATE POLICY "Platform admin read" ON public.quotes FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admin read" ON public.quote_lines;
CREATE POLICY "Platform admin read" ON public.quote_lines FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admin read" ON public.quote_comments;
CREATE POLICY "Platform admin read" ON public.quote_comments FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admin read" ON public.audit_logs;
CREATE POLICY "Platform admin read" ON public.audit_logs FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admin read" ON public.suppliers;
CREATE POLICY "Platform admin read" ON public.suppliers FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admin read" ON public.equipment;
CREATE POLICY "Platform admin read" ON public.equipment FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admin read" ON public.subcontractors;
CREATE POLICY "Platform admin read" ON public.subcontractors FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admin read" ON public.material_price_history;
CREATE POLICY "Platform admin read" ON public.material_price_history FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admin read" ON public.async_jobs;
CREATE POLICY "Platform admin read" ON public.async_jobs FOR SELECT USING (public.is_platform_admin());

-- 6. JOURNALISATION D'UN ACCÈS PLATEFORME
CREATE OR REPLACE FUNCTION public.log_platform_admin_action(
    p_action TEXT,
    p_target_org UUID DEFAULT NULL,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
    v_email TEXT;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Accès refusé : réservé aux administrateurs de la plateforme';
    END IF;

    SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

    INSERT INTO public.platform_admin_audit (
        admin_user_id, admin_email, action, target_organization_id, details
    ) VALUES (
        auth.uid(), v_email, p_action, p_target_org, p_details
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- 7. VUE D'ENSEMBLE DE LA PLATEFORME (agrégats + détail par organisation)
CREATE OR REPLACE FUNCTION public.get_platform_overview()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
    v_orgs JSONB;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Accès refusé : réservé aux administrateurs de la plateforme';
    END IF;

    PERFORM public.log_platform_admin_action('PLATFORM_OVERVIEW_VIEWED', NULL, '{}'::jsonb);

    SELECT COALESCE(jsonb_agg(o ORDER BY o->>'created_at' DESC), '[]'::jsonb)
    INTO v_orgs
    FROM (
        SELECT jsonb_build_object(
            'organization_id', org.id,
            'name',            org.name,
            'currency',        org.currency,
            'created_at',      org.created_at,
            'members',         (SELECT COUNT(*) FROM public.organization_members m WHERE m.organization_id = org.id),
            'clients',         (SELECT COUNT(*) FROM public.clients c        WHERE c.organization_id = org.id),
            'projects',        (SELECT COUNT(*) FROM public.projects p       WHERE p.organization_id = org.id),
            'quotes',          (SELECT COUNT(*) FROM public.quotes q         WHERE q.organization_id = org.id),
            'quotes_accepted', (SELECT COUNT(*) FROM public.quotes q         WHERE q.organization_id = org.id AND q.status = 'accepted'),
            'total_ttc',       (SELECT COALESCE(SUM(q.total_ttc_consomme), 0) FROM public.quotes q WHERE q.organization_id = org.id),
            'last_activity',   (SELECT MAX(q.updated_at) FROM public.quotes q WHERE q.organization_id = org.id)
        ) AS o
        FROM public.organizations org
    ) sub;

    SELECT jsonb_build_object(
        'generated_at',        NOW(),
        'total_organizations', (SELECT COUNT(*) FROM public.organizations),
        'total_members',       (SELECT COUNT(*) FROM public.organization_members),
        'total_users',         (SELECT COUNT(*) FROM auth.users),
        'total_clients',       (SELECT COUNT(*) FROM public.clients),
        'total_projects',      (SELECT COUNT(*) FROM public.projects),
        'total_quotes',        (SELECT COUNT(*) FROM public.quotes),
        'total_ttc_all',       (SELECT COALESCE(SUM(total_ttc_consomme), 0) FROM public.quotes),
        'organizations',       v_orgs
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 8. OCTROI DU RÔLE (service_role uniquement — jamais appelable côté client)
-- Volontairement SECURITY INVOKER : appelée avec la clé anon/authenticated,
-- elle échouerait de toute façon sur la RLS de platform_admins (aucune policy
-- INSERT). Le REVOKE ci-dessous ajoute une seconde barrière.
CREATE OR REPLACE FUNCTION public.grant_platform_admin(p_email TEXT, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(trim(p_email));

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Aucun utilisateur avec l''email %s. Il doit d''abord créer son compte dans l''app.', p_email)
        );
    END IF;

    INSERT INTO public.platform_admins (user_id, email, granted_by, note)
    VALUES (v_user_id, lower(trim(p_email)), auth.uid(), p_note)
    ON CONFLICT (user_id) DO UPDATE SET note = EXCLUDED.note;

    RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'email', lower(trim(p_email)));
END;
$$;

-- 9. DURCISSEMENT DES DROITS D'EXÉCUTION
-- Les RPC vérifient déjà is_platform_admin() en interne (défense en
-- profondeur conservée), mais un anonyme n'a aucune raison de pouvoir
-- seulement atteindre l'endpoint /rest/v1/rpc/...
REVOKE EXECUTE ON FUNCTION public.get_platform_overview()                     FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_platform_admin_action(TEXT, UUID, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin()                         FROM anon;
REVOKE EXECUTE ON FUNCTION public.grant_platform_admin(TEXT, TEXT)            FROM anon, authenticated;

-- ===================================================================
-- COMMENT DÉSIGNER LE PREMIER ADMIN PLATEFORME
-- ===================================================================
-- 1. La personne crée d'abord un compte normal dans l'app (email ou Google).
-- 2. Dans le SQL Editor du dashboard Supabase (qui s'exécute en service_role),
--    lancer :
--
--        SELECT public.grant_platform_admin('ton.email@exemple.com',
--                                           'Éditeur du SaaS — compte principal');
--
-- 3. La personne se déconnecte/reconnecte : l'entrée "Administration
--    plateforme" apparaît dans la navigation.
--
-- Pour révoquer :
--        DELETE FROM public.platform_admins WHERE email = 'ton.email@exemple.com';
-- ===================================================================
