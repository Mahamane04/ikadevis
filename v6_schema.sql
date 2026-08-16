-- ===================================================================
-- IKADEVIS / MICROOFFICE ERP CALCUL — SCHÉMA RELATIONNEL V6 & SÉCURITÉ RENFORCÉE
-- REVISION FINALE : Multi-Tenant Hermétique, RLS Exhaustif & Intégrité Référentielle
-- ===================================================================

-- 1. EXTENSIONS POSTGRESQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ORGANISATIONS (TENANTS MULTI-ENTREPRISE)
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    currency TEXT DEFAULT 'FCFA',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. MEMBRES D'ORGANISATIONS & MATRICE DES RÔLES
CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'commercial', 'estimator', 'viewer')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (organization_id, user_id)
);

-- 4. PARAMÈTRES D'ENTREPRISE SCOPÉS PAR ORGANISATION
CREATE TABLE IF NOT EXISTS public.company_settings (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Mon Entreprise BTP',
    tagline TEXT DEFAULT 'Études de Prix & Chiffrages BTP',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    address TEXT DEFAULT '',
    nif TEXT DEFAULT '',
    rccm TEXT DEFAULT '',
    currency TEXT DEFAULT 'FCFA',
    quote_validity TEXT DEFAULT '30 jours',
    payment_terms TEXT DEFAULT '40% à la commande, 30% à l''approvisionnement, 20% à l''avancement, 10% à la réception.',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. SÉQUENCES TRANSACTIONNELLES DE NUMÉROTATION DEVIS
CREATE TABLE IF NOT EXISTS public.organization_quote_sequences (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    last_seq INT NOT NULL DEFAULT 0,
    prefix TEXT NOT NULL DEFAULT 'DEV-',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. GESTION DES AFFAIRES & CRM BTP (CLIENTS & PROJETS)
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    company_name TEXT,
    tax_id TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    site_address TEXT,
    city TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('prospect', 'active', 'in_progress', 'completed', 'cancelled')),
    budget_estimated NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. MATIÈRES PREMIÈRES & MATÉRIAUX SCOPÉS PAR ORGANISATION
CREATE TABLE IF NOT EXISTS public.materials (
    id BIGINT NOT NULL,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'Divers',
    unit_buy TEXT DEFAULT 'Unité',
    unit_size NUMERIC(12,3) DEFAULT 1,
    unit_calc TEXT DEFAULT 'u',
    price_buy NUMERIC(15,2) DEFAULT 0,
    price_calc NUMERIC(15,2) DEFAULT 0,
    waste NUMERIC(5,2) DEFAULT 5,
    yield_rate NUMERIC(12,3) DEFAULT 0,
    purchase_mode TEXT DEFAULT 'pack',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (organization_id, id)
);

-- 8. MAIN D'ŒUVRE & PRESTATIONS SCOPÉES PAR ORGANISATION
CREATE TABLE IF NOT EXISTS public.labor (
    id BIGINT NOT NULL,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    calc_mode TEXT DEFAULT 'surface',
    unit TEXT DEFAULT 'm²',
    rate NUMERIC(15,2) DEFAULT 0,
    yield_rate NUMERIC(12,3) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (organization_id, id)
);

-- 9. OUVRAGES / SOLUTIONS DU CATALOGUE SCOPÉS PAR ORGANISATION
CREATE TABLE IF NOT EXISTS public.solutions (
    id BIGINT NOT NULL,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT DEFAULT 'fa-cube',
    allowed_modes JSONB DEFAULT '["rectangle", "surface", "linear"]'::jsonb,
    custom_vars JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (organization_id, id)
);

-- 10. RECETTES / COMPOSANTS D'OUVRAGES SCOPÉS PAR ORGANISATION
CREATE TABLE IF NOT EXISTS public.recipes (
    id BIGINT NOT NULL,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    solution_id BIGINT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('material', 'labor')),
    ref_id BIGINT NOT NULL,
    formula TEXT NOT NULL DEFAULT 'SURFACE',
    cost_category TEXT DEFAULT 'material',
    label TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (organization_id, id)
);

-- 11. DEVIS (QUOTES) SCOPÉS PAR ORGANISATION AVEC CLIENT_ID ET PROJECT_ID
CREATE TABLE IF NOT EXISTS public.quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    quote_number TEXT NOT NULL,
    version_number INT DEFAULT 1,
    parent_quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    project_ref TEXT,
    date_created TIMESTAMPTZ DEFAULT NOW(),
    validity_days INT DEFAULT 30,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'to_verify', 'approved', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'cancelled', 'archived')),
    
    total_ht_consomme NUMERIC(15,2) DEFAULT 0 CHECK (total_ht_consomme >= 0),
    total_ttc_consomme NUMERIC(15,2) DEFAULT 0 CHECK (total_ttc_consomme >= 0),
    total_marge_consomme NUMERIC(15,2) DEFAULT 0,
    
    total_ht_achat NUMERIC(15,2) DEFAULT 0 CHECK (total_ht_achat >= 0),
    total_ttc_achat NUMERIC(15,2) DEFAULT 0 CHECK (total_ttc_achat >= 0),
    total_marge_achat NUMERIC(15,2) DEFAULT 0,
    
    company_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    calc_form_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    hybrid_quote_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_org_quote_number UNIQUE (organization_id, quote_number)
);

-- 12. LIGNES DE DEVIS (QUOTE_LINES)
CREATE TABLE IF NOT EXISTS public.quote_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
    line_order INT NOT NULL DEFAULT 1,
    designation TEXT NOT NULL,
    unit TEXT DEFAULT 'u',
    quantity NUMERIC(12,3) DEFAULT 1 CHECK (quantity >= 0),
    unit_price_ht NUMERIC(15,2) DEFAULT 0 CHECK (unit_price_ht >= 0),
    total_ht NUMERIC(15,2) DEFAULT 0 CHECK (total_ht >= 0),
    cost_category TEXT DEFAULT 'material',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. TABLE AUDIT_LOGS (TRAÇABILITÉ INALTÉRABLE)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. HISTORIQUE DES PRIX DES MATÉRIAUX
CREATE TABLE IF NOT EXISTS public.material_price_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    material_id BIGINT NOT NULL,
    price NUMERIC(15,2) NOT NULL,
    previous_price NUMERIC(15,2),
    supplier_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. FOURNISSEURS AGRÉÉS
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    address TEXT DEFAULT '',
    rating INT DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. ENGINS & ÉQUIPEMENTS DE CHANTIER
CREATE TABLE IF NOT EXISTS public.equipment (
    id BIGINT NOT NULL,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'Engin',
    hourly_cost NUMERIC(15,2) DEFAULT 0,
    daily_cost NUMERIC(15,2) DEFAULT 0,
    transport_cost NUMERIC(15,2) DEFAULT 0,
    fuel_consumption NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (organization_id, id)
);

-- 17. SOUS-TRAITANTS BTP
CREATE TABLE IF NOT EXISTS public.subcontractors (
    id BIGINT NOT NULL,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    trade TEXT DEFAULT 'Tous corps d''état',
    phone TEXT DEFAULT '',
    default_markup NUMERIC(5,2) DEFAULT 15,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (organization_id, id)
);

-- 18. COMMENTAIRES SUR LES DEVIS
CREATE TABLE IF NOT EXISTS public.quote_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19. FILE DE TÂCHES ASYNCHRONES (ASYNC_JOBS)
CREATE TABLE IF NOT EXISTS public.async_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retrying')),
    payload JSONB DEFAULT '{}'::jsonb,
    result JSONB DEFAULT '{}'::jsonb,
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================================================================
-- FONCTIONS D'AUTORISATION & RPC SÉCURISÉES (SECURITY DEFINER)
-- ===================================================================

-- HELPER 1 : Liste des IDs d'organisations de l'utilisateur connecté
CREATE OR REPLACE FUNCTION public.get_my_organization_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid();
$$;

-- HELPER 2 : Vérification granulaire des rôles au sein d'une organisation
CREATE OR REPLACE FUNCTION public.has_org_permission(p_org_id UUID, p_required_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR p_org_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = p_org_id
          AND user_id = auth.uid()
          AND role = ANY(p_required_roles)
    );
END;
$$;

-- HELPER 3 : Journalisation automatique des événements de sécurité dans audit_logs
CREATE OR REPLACE FUNCTION public.log_audit_event(
    p_org_id UUID,
    p_action TEXT,
    p_entity_type TEXT,
    p_entity_id TEXT,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_log_id UUID;
    v_user_email TEXT;
BEGIN
    IF auth.uid() IS NOT NULL THEN
        SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
    END IF;

    INSERT INTO public.audit_logs (
        organization_id, user_id, user_email, action, entity_type, entity_id, details
    ) VALUES (
        p_org_id, auth.uid(), v_user_email, p_action, p_entity_type, p_entity_id, p_details
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;


-- ===================================================================
-- RPC CRITIQUES REPRODUCTIBLES (BLOC 5 & 6)
-- ===================================================================

-- RPC 2 : bootstrap_user_organization (Onboarding automatique, transactionnel & idempotent)
CREATE OR REPLACE FUNCTION public.bootstrap_user_organization(
    p_org_name TEXT DEFAULT 'Mon Entreprise BTP',
    p_currency TEXT DEFAULT 'FCFA'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_org_id UUID;
    v_org_name TEXT;
    v_currency TEXT;
    v_role TEXT;
    v_existing_membership RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentification requise pour bootstrap_user_organization';
    END IF;

    -- Vérifier si l'utilisateur possède déjà une organisation
    SELECT om.organization_id, om.role, o.name, o.currency 
    INTO v_existing_membership
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE om.user_id = v_user_id
    ORDER BY om.created_at ASC
    LIMIT 1;

    IF v_existing_membership.organization_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'organization_id', v_existing_membership.organization_id,
            'organization_name', v_existing_membership.name,
            'currency', v_existing_membership.currency,
            'role', v_existing_membership.role,
            'is_new', false
        );
    END IF;

    -- Créer une nouvelle organisation avec rôle owner
    v_org_name := COALESCE(NULLIF(TRIM(p_org_name), ''), 'Mon Entreprise BTP');
    v_currency := COALESCE(NULLIF(TRIM(p_currency), ''), 'FCFA');

    INSERT INTO public.organizations (name, currency)
    VALUES (v_org_name, v_currency)
    RETURNING id INTO v_org_id;

    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_org_id, v_user_id, 'owner');

    INSERT INTO public.organization_quote_sequences (organization_id, last_seq, prefix)
    VALUES (v_org_id, 0, 'DEV-')
    ON CONFLICT (organization_id) DO NOTHING;

    INSERT INTO public.company_settings (organization_id, name, currency)
    VALUES (v_org_id, v_org_name, v_currency)
    ON CONFLICT (organization_id) DO NOTHING;

    PERFORM public.log_audit_event(
        v_org_id, 'ORG_BOOTSTRAPPED', 'organizations', v_org_id::text,
        jsonb_build_object('name', v_org_name, 'currency', v_currency, 'user_id', v_user_id)
    );

    RETURN jsonb_build_object(
        'organization_id', v_org_id,
        'organization_name', v_org_name,
        'currency', v_currency,
        'role', 'owner',
        'is_new', true
    );
END;
$$;

-- RPC 3 : create_quote_v6 (Création atomique transactionnelle d'un devis avec ses lignes)
CREATE OR REPLACE FUNCTION public.create_quote_v6(
    p_org_id UUID,
    p_client_name TEXT,
    p_project_ref TEXT,
    p_company_snapshot JSONB DEFAULT '{}'::jsonb,
    p_calc_form_snapshot JSONB DEFAULT '{}'::jsonb,
    p_lines JSONB DEFAULT '[]'::jsonb,
    p_hybrid_snapshot JSONB DEFAULT '{}'::jsonb,
    p_client_id UUID DEFAULT NULL,
    p_project_id UUID DEFAULT NULL,
    p_vat_rate NUMERIC DEFAULT 18,
    p_parent_quote_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_quote_id UUID;
    v_next_seq INT;
    v_quote_number TEXT;
    v_line JSONB;
    v_tot_ht NUMERIC(15,2) := 0;
    v_tot_ttc NUMERIC(15,2) := 0;
    v_current_year TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentification requise pour créer un devis';
    END IF;

    -- Vérifier l'appartenance et les permissions de l'utilisateur sur l'organisation
    IF NOT public.has_org_permission(p_org_id, ARRAY['owner', 'admin', 'estimator', 'commercial']) THEN
        RAISE EXCEPTION 'Accès refusé : permissions insuffisantes pour créer un devis dans cette organisation';
    END IF;

    -- Vérifier l'appartenance du client et du projet si fournis
    IF p_client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_client_id AND organization_id = p_org_id) THEN
        RAISE EXCEPTION 'Client invalide ou n''appartenant pas à cette organisation';
    END IF;

    IF p_project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND organization_id = p_org_id) THEN
        RAISE EXCEPTION 'Projet invalide ou n''appartenant pas à cette organisation';
    END IF;

    -- Obtenir atomiquement la séquence de numérotation avec verrou ligne
    INSERT INTO public.organization_quote_sequences (organization_id, last_seq, prefix)
    VALUES (p_org_id, 0, 'DEV-')
    ON CONFLICT (organization_id) DO NOTHING;

    SELECT last_seq + 1 INTO v_next_seq
    FROM public.organization_quote_sequences
    WHERE organization_id = p_org_id
    FOR UPDATE;

    UPDATE public.organization_quote_sequences
    SET last_seq = v_next_seq, updated_at = NOW()
    WHERE organization_id = p_org_id;

    v_current_year := TO_CHAR(NOW(), 'YYYY');
    v_quote_number := 'DEV-' || v_current_year || '-' || LPAD(v_next_seq::text, 3, '0');

    -- Calculer les totaux à partir des lignes fournies
    IF jsonb_typeof(p_lines) = 'array' THEN
        FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
        LOOP
            v_tot_ht := v_tot_ht + COALESCE((v_line->>'total_ht')::numeric, 0);
        END LOOP;
    END IF;
    v_tot_ttc := v_tot_ht * (1 + (COALESCE(p_vat_rate, 18) / 100));

    -- Insérer le devis dans public.quotes
    INSERT INTO public.quotes (
        organization_id, client_id, project_id, created_by, user_id,
        quote_number, parent_quote_id, client_name, project_ref,
        total_ht_consomme, total_ttc_consomme, total_marge_consomme,
        company_snapshot, calc_form_snapshot, hybrid_quote_snapshot,
        status
    ) VALUES (
        p_org_id, p_client_id, p_project_id, v_user_id, v_user_id,
        v_quote_number, p_parent_quote_id, COALESCE(NULLIF(TRIM(p_client_name), ''), 'Client Passage'),
        COALESCE(NULLIF(TRIM(p_project_ref), ''), 'Chantier BTP'),
        v_tot_ht, v_tot_ttc, 0,
        p_company_snapshot, p_calc_form_snapshot, p_hybrid_snapshot,
        'draft'
    ) RETURNING id INTO v_quote_id;

    -- Insérer les lignes dans public.quote_lines
    IF jsonb_typeof(p_lines) = 'array' THEN
        FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
        LOOP
            INSERT INTO public.quote_lines (
                organization_id, quote_id, line_order, designation,
                unit, quantity, unit_price_ht, total_ht, cost_category, metadata
            ) VALUES (
                p_org_id, v_quote_id,
                COALESCE((v_line->>'line_order')::int, 1),
                COALESCE(v_line->>'designation', 'Ligne de devis'),
                COALESCE(v_line->>'unit', 'u'),
                COALESCE((v_line->>'quantity')::numeric, 1),
                COALESCE((v_line->>'unit_price_ht')::numeric, 0),
                COALESCE((v_line->>'total_ht')::numeric, 0),
                COALESCE(v_line->>'cost_category', 'material'),
                COALESCE(v_line->'metadata', '{}'::jsonb)
            );
        END LOOP;
    END IF;

    -- Journaliser dans audit_logs
    PERFORM public.log_audit_event(
        p_org_id, 'QUOTE_CREATED', 'quotes', v_quote_id::text,
        jsonb_build_object('quote_number', v_quote_number, 'total_ttc', v_tot_ttc, 'user_id', v_user_id)
    );

    RETURN v_quote_id;
END;
$$;


-- ===================================================================
-- ACTIVATION EXHAUSTIVE DE ROW LEVEL SECURITY (RLS) SUR TOUTES LES TABLES
-- ===================================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_quote_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.async_jobs ENABLE ROW LEVEL SECURITY;

-- 1. Organizations
DROP POLICY IF EXISTS "Organizations select" ON public.organizations;
CREATE POLICY "Organizations select" ON public.organizations
    FOR SELECT USING (id IN (SELECT public.get_my_organization_ids()));

DROP POLICY IF EXISTS "Organizations update" ON public.organizations;
CREATE POLICY "Organizations update" ON public.organizations
    FOR UPDATE USING (public.has_org_permission(id, ARRAY['owner', 'admin']));

-- 2. Organization Members
DROP POLICY IF EXISTS "Org members select" ON public.organization_members;
CREATE POLICY "Org members select" ON public.organization_members
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()) OR user_id = auth.uid());

DROP POLICY IF EXISTS "Org members insert" ON public.organization_members;
CREATE POLICY "Org members insert" ON public.organization_members
    FOR INSERT WITH CHECK (public.has_org_permission(organization_id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS "Org members update" ON public.organization_members;
CREATE POLICY "Org members update" ON public.organization_members
    FOR UPDATE USING (public.has_org_permission(organization_id, ARRAY['owner']));

DROP POLICY IF EXISTS "Org members delete" ON public.organization_members;
CREATE POLICY "Org members delete" ON public.organization_members
    FOR DELETE USING (public.has_org_permission(organization_id, ARRAY['owner']));

-- 3. Company Settings
DROP POLICY IF EXISTS "Company settings select" ON public.company_settings;
CREATE POLICY "Company settings select" ON public.company_settings
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

DROP POLICY IF EXISTS "Company settings write" ON public.company_settings;
CREATE POLICY "Company settings write" ON public.company_settings
    FOR ALL USING (public.has_org_permission(organization_id, ARRAY['owner', 'admin']));

-- 4. Clients (Owner, Admin, Estimator, Commercial)
DROP POLICY IF EXISTS "Clients select" ON public.clients;
CREATE POLICY "Clients select" ON public.clients
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

DROP POLICY IF EXISTS "Clients insert" ON public.clients;
CREATE POLICY "Clients insert" ON public.clients
    FOR INSERT WITH CHECK (public.has_org_permission(organization_id, ARRAY['owner', 'admin', 'estimator', 'commercial']));

DROP POLICY IF EXISTS "Clients update" ON public.clients;
CREATE POLICY "Clients update" ON public.clients
    FOR UPDATE USING (public.has_org_permission(organization_id, ARRAY['owner', 'admin', 'estimator', 'commercial']));

DROP POLICY IF EXISTS "Clients delete" ON public.clients;
CREATE POLICY "Clients delete" ON public.clients
    FOR DELETE USING (public.has_org_permission(organization_id, ARRAY['owner', 'admin']));

-- 5. Projects (Owner, Admin, Estimator, Commercial)
DROP POLICY IF EXISTS "Projects select" ON public.projects;
CREATE POLICY "Projects select" ON public.projects
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

DROP POLICY IF EXISTS "Projects insert" ON public.projects;
CREATE POLICY "Projects insert" ON public.projects
    FOR INSERT WITH CHECK (public.has_org_permission(organization_id, ARRAY['owner', 'admin', 'estimator', 'commercial']));

DROP POLICY IF EXISTS "Projects update" ON public.projects;
CREATE POLICY "Projects update" ON public.projects
    FOR UPDATE USING (public.has_org_permission(organization_id, ARRAY['owner', 'admin', 'estimator', 'commercial']));

DROP POLICY IF EXISTS "Projects delete" ON public.projects;
CREATE POLICY "Projects delete" ON public.projects
    FOR DELETE USING (public.has_org_permission(organization_id, ARRAY['owner', 'admin']));

-- 6. Materials
DROP POLICY IF EXISTS "Materials select" ON public.materials;
CREATE POLICY "Materials select" ON public.materials
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

DROP POLICY IF EXISTS "Materials write" ON public.materials;
CREATE POLICY "Materials write" ON public.materials
    FOR ALL USING (public.has_org_permission(organization_id, ARRAY['owner', 'admin', 'estimator']));

-- 7. Labor
DROP POLICY IF EXISTS "Labor select" ON public.labor;
CREATE POLICY "Labor select" ON public.labor
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

DROP POLICY IF EXISTS "Labor write" ON public.labor;
CREATE POLICY "Labor write" ON public.labor
    FOR ALL USING (public.has_org_permission(organization_id, ARRAY['owner', 'admin', 'estimator']));

-- 8. Solutions
DROP POLICY IF EXISTS "Solutions select" ON public.solutions;
CREATE POLICY "Solutions select" ON public.solutions
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

DROP POLICY IF EXISTS "Solutions write" ON public.solutions;
CREATE POLICY "Solutions write" ON public.solutions
    FOR ALL USING (public.has_org_permission(organization_id, ARRAY['owner', 'admin', 'estimator']));

-- 9. Recipes
DROP POLICY IF EXISTS "Recipes select" ON public.recipes;
CREATE POLICY "Recipes select" ON public.recipes
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

DROP POLICY IF EXISTS "Recipes write" ON public.recipes;
CREATE POLICY "Recipes write" ON public.recipes
    FOR ALL USING (public.has_org_permission(organization_id, ARRAY['owner', 'admin', 'estimator']));

-- 10. Quotes (Owner, Admin, Estimator, Commercial: CRUD; Viewer: Read-only)
DROP POLICY IF EXISTS "Quotes select" ON public.quotes;
CREATE POLICY "Quotes select" ON public.quotes
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

DROP POLICY IF EXISTS "Quotes insert" ON public.quotes;
CREATE POLICY "Quotes insert" ON public.quotes
    FOR INSERT WITH CHECK (public.has_org_permission(organization_id, ARRAY['owner', 'admin', 'estimator', 'commercial']));

DROP POLICY IF EXISTS "Quotes update" ON public.quotes;
CREATE POLICY "Quotes update" ON public.quotes
    FOR UPDATE USING (public.has_org_permission(organization_id, ARRAY['owner', 'admin', 'estimator', 'commercial']));

DROP POLICY IF EXISTS "Quotes delete" ON public.quotes;
CREATE POLICY "Quotes delete" ON public.quotes
    FOR DELETE USING (public.has_org_permission(organization_id, ARRAY['owner', 'admin']));

-- 11. Quote Lines
DROP POLICY IF EXISTS "Quote lines select" ON public.quote_lines;
CREATE POLICY "Quote lines select" ON public.quote_lines
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

DROP POLICY IF EXISTS "Quote lines write" ON public.quote_lines;
CREATE POLICY "Quote lines write" ON public.quote_lines
    FOR ALL USING (public.has_org_permission(organization_id, ARRAY['owner', 'admin', 'estimator', 'commercial']));

-- 12. Audit Logs
DROP POLICY IF EXISTS "Audit logs select" ON public.audit_logs;
CREATE POLICY "Audit logs select" ON public.audit_logs
    FOR SELECT USING (public.has_org_permission(organization_id, ARRAY['owner', 'admin']));

-- 13. Suppliers
DROP POLICY IF EXISTS "Suppliers select" ON public.suppliers;
CREATE POLICY "Suppliers select" ON public.suppliers
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

DROP POLICY IF EXISTS "Suppliers write" ON public.suppliers;
CREATE POLICY "Suppliers write" ON public.suppliers
    FOR ALL USING (public.has_org_permission(organization_id, ARRAY['owner', 'admin', 'estimator']));

-- 14. Equipment
DROP POLICY IF EXISTS "Equipment select" ON public.equipment;
CREATE POLICY "Equipment select" ON public.equipment
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

DROP POLICY IF EXISTS "Equipment write" ON public.equipment;
CREATE POLICY "Equipment write" ON public.equipment
    FOR ALL USING (public.has_org_permission(organization_id, ARRAY['owner', 'admin', 'estimator']));

-- 15. Subcontractors
DROP POLICY IF EXISTS "Subcontractors select" ON public.subcontractors;
CREATE POLICY "Subcontractors select" ON public.subcontractors
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

DROP POLICY IF EXISTS "Subcontractors write" ON public.subcontractors;
CREATE POLICY "Subcontractors write" ON public.subcontractors
    FOR ALL USING (public.has_org_permission(organization_id, ARRAY['owner', 'admin', 'estimator']));

-- 16. Quote Comments
DROP POLICY IF EXISTS "Quote comments select" ON public.quote_comments;
CREATE POLICY "Quote comments select" ON public.quote_comments
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

DROP POLICY IF EXISTS "Quote comments write" ON public.quote_comments;
CREATE POLICY "Quote comments write" ON public.quote_comments
    FOR ALL USING (public.has_org_permission(organization_id, ARRAY['owner', 'admin', 'estimator', 'commercial']));

-- 17. Async Jobs
DROP POLICY IF EXISTS "Async jobs select" ON public.async_jobs;
CREATE POLICY "Async jobs select" ON public.async_jobs
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

DROP POLICY IF EXISTS "Async jobs write" ON public.async_jobs;
CREATE POLICY "Async jobs write" ON public.async_jobs
    FOR ALL USING (public.has_org_permission(organization_id, ARRAY['owner', 'admin', 'estimator']));

-- ===================================================================
-- INDEXES POSTGRESQL HAUTE PERFORMANCE & SCALABILITÉ
-- ===================================================================
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_quotes_org_created_at ON public.quotes (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_org_status ON public.quotes (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_quotes_org_client ON public.quotes (organization_id, client_id);
CREATE INDEX IF NOT EXISTS idx_quotes_org_project ON public.quotes (organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_materials_org_category ON public.materials (organization_id, category);
CREATE INDEX IF NOT EXISTS idx_materials_org_name ON public.materials (organization_id, name);
CREATE INDEX IF NOT EXISTS idx_recipes_org_solution ON public.recipes (organization_id, solution_id);
CREATE INDEX IF NOT EXISTS idx_quote_lines_org_quote ON public.quote_lines (organization_id, quote_id);
CREATE INDEX IF NOT EXISTS idx_projects_org_client ON public.projects (organization_id, client_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_timestamp ON public.audit_logs (organization_id, created_at DESC);
