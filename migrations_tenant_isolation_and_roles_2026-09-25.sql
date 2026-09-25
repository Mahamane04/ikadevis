-- ═══════════════════════════════════════════════════════════════════════════
-- LOT 1 : AUTORISATIONS, ROLES ET ISOLATION INTERENTREPRISES (P1)
-- Date : 25 septembre 2026
-- Constats traités : SEC-02 (création/élévation de propriétaire)
--                    SEC-03 (relations interentreprises A -> B)
--                    SEC-04 (forgerie d'événements d'audit)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SEC-03 : DIAGNOSTIC DES RELATIONS EXISTANTES
--    Consigne les incohérences existantes sans suppression automatique.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_isolation_violations (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    organization_id UUID NOT NULL,
    parent_table TEXT NOT NULL,
    parent_id TEXT NOT NULL,
    parent_org_id UUID,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.tenant_isolation_violations IS
'Journal de diagnostic des anomalies d''isolation interentreprises constatées avant activation des contraintes.';

DO $$
BEGIN
    -- Diagnostic sur les projets rattachés à un client d'une autre organisation
    INSERT INTO public.tenant_isolation_violations (table_name, record_id, organization_id, parent_table, parent_id, parent_org_id)
    SELECT 'projects', p.id::text, p.organization_id, 'clients', c.id::text, c.organization_id
    FROM public.projects p
    JOIN public.clients c ON p.client_id = c.id
    WHERE p.organization_id <> c.organization_id;

    -- Diagnostic sur les devis rattachés à un client d'une autre organisation
    INSERT INTO public.tenant_isolation_violations (table_name, record_id, organization_id, parent_table, parent_id, parent_org_id)
    SELECT 'quotes', q.id::text, q.organization_id, 'clients', c.id::text, c.organization_id
    FROM public.quotes q
    JOIN public.clients c ON q.client_id = c.id
    WHERE q.organization_id <> c.organization_id;

    -- Diagnostic sur les devis rattachés à un projet d'une autre organisation
    INSERT INTO public.tenant_isolation_violations (table_name, record_id, organization_id, parent_table, parent_id, parent_org_id)
    SELECT 'quotes', q.id::text, q.organization_id, 'projects', pr.id::text, pr.organization_id
    FROM public.quotes q
    JOIN public.projects pr ON q.project_id = pr.id
    WHERE q.organization_id <> pr.organization_id;

    -- Diagnostic sur les lignes de devis rattachées à un devis d'une autre organisation
    INSERT INTO public.tenant_isolation_violations (table_name, record_id, organization_id, parent_table, parent_id, parent_org_id)
    SELECT 'quote_lines', ql.id::text, ql.organization_id, 'quotes', q.id::text, q.organization_id
    FROM public.quote_lines ql
    JOIN public.quotes q ON ql.quote_id = q.id
    WHERE ql.organization_id <> q.organization_id;

    -- Diagnostic sur les factures rattachées à un devis d'une autre organisation (si table invoices existe)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoices') THEN
        INSERT INTO public.tenant_isolation_violations (table_name, record_id, organization_id, parent_table, parent_id, parent_org_id)
        SELECT 'invoices', inv.id::text, inv.organization_id, 'quotes', q.id::text, q.organization_id
        FROM public.invoices inv
        JOIN public.quotes q ON inv.quote_id = q.id
        WHERE inv.organization_id <> q.organization_id;

        INSERT INTO public.tenant_isolation_violations (table_name, record_id, organization_id, parent_table, parent_id, parent_org_id)
        SELECT 'invoices', inv.id::text, inv.organization_id, 'clients', c.id::text, c.organization_id
        FROM public.invoices inv
        JOIN public.clients c ON inv.client_id = c.id
        WHERE inv.organization_id <> c.organization_id;

        INSERT INTO public.tenant_isolation_violations (table_name, record_id, organization_id, parent_table, parent_id, parent_org_id)
        SELECT 'invoices', inv.id::text, inv.organization_id, 'projects', pr.id::text, pr.organization_id
        FROM public.invoices inv
        JOIN public.projects pr ON inv.project_id = pr.id
        WHERE inv.organization_id <> pr.organization_id;
    END IF;

    -- Diagnostic sur les lignes de factures (si table invoice_lines existe)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoice_lines') THEN
        INSERT INTO public.tenant_isolation_violations (table_name, record_id, organization_id, parent_table, parent_id, parent_org_id)
        SELECT 'invoice_lines', il.id::text, il.organization_id, 'invoices', inv.id::text, inv.organization_id
        FROM public.invoice_lines il
        JOIN public.invoices inv ON il.invoice_id = inv.id
        WHERE il.organization_id <> inv.organization_id;
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SEC-03 : TRIGGERS STRICTS D'ISOLATION MULTI-TENANT (A -> B INTERDIT)
-- ─────────────────────────────────────────────────────────────────────────────

-- Projets -> Client
CREATE OR REPLACE FUNCTION public.check_project_tenant_isolation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_parent_org UUID;
BEGIN
    IF NEW.client_id IS NOT NULL THEN
        SELECT organization_id INTO v_parent_org FROM public.clients WHERE id = NEW.client_id;
        IF v_parent_org IS NOT NULL AND v_parent_org <> NEW.organization_id THEN
            RAISE EXCEPTION 'Tenant isolation violation: client % belongs to organization %, not %',
                NEW.client_id, v_parent_org, NEW.organization_id
                USING ERRCODE = '23503';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_tenant_isolation ON public.projects;
CREATE TRIGGER trg_project_tenant_isolation
    BEFORE INSERT OR UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.check_project_tenant_isolation();

-- Devis -> Client, Projet, Parent Quote
CREATE OR REPLACE FUNCTION public.check_quote_tenant_isolation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_parent_org UUID;
BEGIN
    IF NEW.client_id IS NOT NULL THEN
        SELECT organization_id INTO v_parent_org FROM public.clients WHERE id = NEW.client_id;
        IF v_parent_org IS NOT NULL AND v_parent_org <> NEW.organization_id THEN
            RAISE EXCEPTION 'Tenant isolation violation: client % belongs to organization %, not %',
                NEW.client_id, v_parent_org, NEW.organization_id
                USING ERRCODE = '23503';
        END IF;
    END IF;

    IF NEW.project_id IS NOT NULL THEN
        SELECT organization_id INTO v_parent_org FROM public.projects WHERE id = NEW.project_id;
        IF v_parent_org IS NOT NULL AND v_parent_org <> NEW.organization_id THEN
            RAISE EXCEPTION 'Tenant isolation violation: project % belongs to organization %, not %',
                NEW.project_id, v_parent_org, NEW.organization_id
                USING ERRCODE = '23503';
        END IF;
    END IF;

    IF NEW.parent_quote_id IS NOT NULL THEN
        SELECT organization_id INTO v_parent_org FROM public.quotes WHERE id = NEW.parent_quote_id;
        IF v_parent_org IS NOT NULL AND v_parent_org <> NEW.organization_id THEN
            RAISE EXCEPTION 'Tenant isolation violation: parent quote % belongs to organization %, not %',
                NEW.parent_quote_id, v_parent_org, NEW.organization_id
                USING ERRCODE = '23503';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_tenant_isolation ON public.quotes;
CREATE TRIGGER trg_quote_tenant_isolation
    BEFORE INSERT OR UPDATE ON public.quotes
    FOR EACH ROW EXECUTE FUNCTION public.check_quote_tenant_isolation();

-- Lignes de devis -> Devis
CREATE OR REPLACE FUNCTION public.check_quote_line_tenant_isolation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_parent_org UUID;
BEGIN
    SELECT organization_id INTO v_parent_org FROM public.quotes WHERE id = NEW.quote_id;
    IF v_parent_org IS NOT NULL AND v_parent_org <> NEW.organization_id THEN
        RAISE EXCEPTION 'Tenant isolation violation: quote % belongs to organization %, not %',
            NEW.quote_id, v_parent_org, NEW.organization_id
            USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_line_tenant_isolation ON public.quote_lines;
CREATE TRIGGER trg_quote_line_tenant_isolation
    BEFORE INSERT OR UPDATE ON public.quote_lines
    FOR EACH ROW EXECUTE FUNCTION public.check_quote_line_tenant_isolation();

-- Commentaires de devis -> Devis
CREATE OR REPLACE FUNCTION public.check_quote_comment_tenant_isolation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_parent_org UUID;
BEGIN
    SELECT organization_id INTO v_parent_org FROM public.quotes WHERE id = NEW.quote_id;
    IF v_parent_org IS NOT NULL AND v_parent_org <> NEW.organization_id THEN
        RAISE EXCEPTION 'Tenant isolation violation: quote % belongs to organization %, not %',
            NEW.quote_id, v_parent_org, NEW.organization_id
            USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_comment_tenant_isolation ON public.quote_comments;
CREATE TRIGGER trg_quote_comment_tenant_isolation
    BEFORE INSERT OR UPDATE ON public.quote_comments
    FOR EACH ROW EXECUTE FUNCTION public.check_quote_comment_tenant_isolation();

-- Factures -> Client, Projet, Devis, Facture rectifiée
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoices') THEN
        CREATE OR REPLACE FUNCTION public.check_invoice_tenant_isolation()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public
        AS $inv$
        DECLARE
            v_parent_org UUID;
        BEGIN
            IF NEW.client_id IS NOT NULL THEN
                SELECT organization_id INTO v_parent_org FROM public.clients WHERE id = NEW.client_id;
                IF v_parent_org IS NOT NULL AND v_parent_org <> NEW.organization_id THEN
                    RAISE EXCEPTION 'Tenant isolation violation: client % belongs to organization %, not %',
                        NEW.client_id, v_parent_org, NEW.organization_id
                        USING ERRCODE = '23503';
                END IF;
            END IF;

            IF NEW.project_id IS NOT NULL THEN
                SELECT organization_id INTO v_parent_org FROM public.projects WHERE id = NEW.project_id;
                IF v_parent_org IS NOT NULL AND v_parent_org <> NEW.organization_id THEN
                    RAISE EXCEPTION 'Tenant isolation violation: project % belongs to organization %, not %',
                        NEW.project_id, v_parent_org, NEW.organization_id
                        USING ERRCODE = '23503';
                END IF;
            END IF;

            IF NEW.quote_id IS NOT NULL THEN
                SELECT organization_id INTO v_parent_org FROM public.quotes WHERE id = NEW.quote_id;
                IF v_parent_org IS NOT NULL AND v_parent_org <> NEW.organization_id THEN
                    RAISE EXCEPTION 'Tenant isolation violation: quote % belongs to organization %, not %',
                        NEW.quote_id, v_parent_org, NEW.organization_id
                        USING ERRCODE = '23503';
                END IF;
            END IF;

            IF NEW.corrects_invoice_id IS NOT NULL THEN
                SELECT organization_id INTO v_parent_org FROM public.invoices WHERE id = NEW.corrects_invoice_id;
                IF v_parent_org IS NOT NULL AND v_parent_org <> NEW.organization_id THEN
                    RAISE EXCEPTION 'Tenant isolation violation: invoice % belongs to organization %, not %',
                        NEW.corrects_invoice_id, v_parent_org, NEW.organization_id
                        USING ERRCODE = '23503';
                END IF;
            END IF;

            RETURN NEW;
        END;
        $inv$;

        DROP TRIGGER IF EXISTS trg_invoice_tenant_isolation ON public.invoices;
        CREATE TRIGGER trg_invoice_tenant_isolation
            BEFORE INSERT OR UPDATE ON public.invoices
            FOR EACH ROW EXECUTE FUNCTION public.check_invoice_tenant_isolation();
    END IF;
END;
$$;

-- Lignes de facture -> Facture
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoice_lines') THEN
        CREATE OR REPLACE FUNCTION public.check_invoice_line_tenant_isolation()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public
        AS $invl$
        DECLARE
            v_parent_org UUID;
        BEGIN
            SELECT organization_id INTO v_parent_org FROM public.invoices WHERE id = NEW.invoice_id;
            IF v_parent_org IS NOT NULL AND v_parent_org <> NEW.organization_id THEN
                RAISE EXCEPTION 'Tenant isolation violation: invoice % belongs to organization %, not %',
                    NEW.invoice_id, v_parent_org, NEW.organization_id
                    USING ERRCODE = '23503';
            END IF;
            RETURN NEW;
        END;
        $invl$;

        DROP TRIGGER IF EXISTS trg_invoice_line_tenant_isolation ON public.invoice_lines;
        CREATE TRIGGER trg_invoice_line_tenant_isolation
            BEFORE INSERT OR UPDATE ON public.invoice_lines
            FOR EACH ROW EXECUTE FUNCTION public.check_invoice_line_tenant_isolation();
    END IF;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SEC-02 : CONTRÔLE DES RÔLES ET EMPÊCHEMENT DE L'ÉLÉVATION OWNER
-- ─────────────────────────────────────────────────────────────────────────────

-- Trigger d'application stricte des règles sur organization_members
CREATE OR REPLACE FUNCTION public.enforce_organization_membership_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_has_members BOOLEAN;
    v_caller_role TEXT;
    v_in_transfer TEXT;
BEGIN
    v_in_transfer := current_setting('app.in_ownership_transfer', true);

    -- 1. CAS INSERTION
    IF TG_OP = 'INSERT' THEN
        -- Vérifier s'il s'agit du tout premier membre de l'organisation (Bootstrap)
        SELECT EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = NEW.organization_id
        ) INTO v_has_members;

        -- Bootstrap initial : si aucun membre n'existe, le premier membre créé PEUT être 'owner'
        IF NOT v_has_members THEN
            IF NEW.role NOT IN ('owner', 'admin') THEN
                -- Permettre 'owner' en priorité lors du bootstrap
                NEW.role := 'owner';
            END IF;
            RETURN NEW;
        END IF;

        -- Organisation déjà initialisée : interdiction formelle d'insérer directement un rôle 'owner'
        IF NEW.role = 'owner' THEN
            RAISE EXCEPTION 'Direct creation of owner is forbidden. An organization already has an owner. Use transfer_organization_ownership.'
                USING ERRCODE = '42501';
        END IF;

        -- Vérifier le rôle de l'appelant
        IF auth.uid() IS NOT NULL THEN
            SELECT role INTO v_caller_role
            FROM public.organization_members
            WHERE organization_id = NEW.organization_id AND user_id = auth.uid();

            IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'admin') THEN
                RAISE EXCEPTION 'Only owner or admin can invite or add members'
                    USING ERRCODE = '42501';
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    -- 2. CAS MISE À JOUR (UPDATE)
    IF TG_OP = 'UPDATE' THEN
        -- Immuabilité de la clé composite (organization_id, user_id)
        IF OLD.organization_id <> NEW.organization_id OR OLD.user_id <> NEW.user_id THEN
            RAISE EXCEPTION 'organization_id and user_id are immutable in organization_members'
                USING ERRCODE = '42501';
        END IF;

        -- Si on est dans une procédure transactionnelle de transfert autorisé
        IF v_in_transfer = 'true' THEN
            RETURN NEW;
        END IF;

        -- Interdiction formelle d'élever un membre en 'owner' via un simple UPDATE
        IF OLD.role <> 'owner' AND NEW.role = 'owner' THEN
            RAISE EXCEPTION 'Elevation to owner role is forbidden. Use transfer_organization_ownership.'
                USING ERRCODE = '42501';
        END IF;

        -- Interdiction de rétrograder un owner via simple UPDATE
        IF OLD.role = 'owner' AND NEW.role <> 'owner' THEN
            RAISE EXCEPTION 'Direct demotion of owner is forbidden. Use transfer_organization_ownership.'
                USING ERRCODE = '42501';
        END IF;

        -- Seul l'actuel owner a le droit de modifier le rôle d'autres membres
        IF auth.uid() IS NOT NULL THEN
            SELECT role INTO v_caller_role
            FROM public.organization_members
            WHERE organization_id = NEW.organization_id AND user_id = auth.uid();

            IF v_caller_role <> 'owner' THEN
                RAISE EXCEPTION 'Only the organization owner can change member roles'
                    USING ERRCODE = '42501';
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    -- 3. CAS SUPPRESSION (DELETE)
    IF TG_OP = 'DELETE' THEN
        -- Interdiction de supprimer le propriétaire
        IF OLD.role = 'owner' THEN
            RAISE EXCEPTION 'The organization owner cannot be removed. Transfer ownership first.'
                USING ERRCODE = '42501';
        END IF;

        -- Seul l'owner ou l'admin peut supprimer un membre (un admin ne peut pas supprimer un autre admin)
        IF auth.uid() IS NOT NULL THEN
            SELECT role INTO v_caller_role
            FROM public.organization_members
            WHERE organization_id = OLD.organization_id AND user_id = auth.uid();

            IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'admin') THEN
                RAISE EXCEPTION 'Permission denied to delete member'
                    USING ERRCODE = '42501';
            END IF;

            IF v_caller_role = 'admin' AND OLD.role = 'admin' AND OLD.user_id <> auth.uid() THEN
                RAISE EXCEPTION 'An administrator cannot remove another administrator'
                    USING ERRCODE = '42501';
            END IF;
        END IF;

        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_organization_membership ON public.organization_members;
CREATE TRIGGER trg_enforce_organization_membership
    BEFORE INSERT OR UPDATE OR DELETE ON public.organization_members
    FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_membership_rules();

-- Helper SECURITY DEFINER pour éviter la récursion de policy RLS
CREATE OR REPLACE FUNCTION public.can_insert_org_member(p_org_id UUID, p_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- S'il n'y a encore aucun membre pour cette organisation (Bootstrap initial)
    IF NOT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = p_org_id) THEN
        RETURN TRUE;
    END IF;

    -- Si l'organisation existe déjà : interdiction formelle d'insérer un 'owner'
    IF p_role = 'owner' THEN
        RETURN FALSE;
    END IF;

    -- Sinon, l'utilisateur connecté doit être owner ou admin
    RETURN public.has_org_permission(p_org_id, ARRAY['owner', 'admin']);
END;
$$;

DROP POLICY IF EXISTS "Org members insert" ON public.organization_members;
CREATE POLICY "Org members insert" ON public.organization_members
    FOR INSERT WITH CHECK (public.can_insert_org_member(organization_id, role));

DROP POLICY IF EXISTS "Org members update" ON public.organization_members;
CREATE POLICY "Org members update" ON public.organization_members
    FOR UPDATE
    USING (public.has_org_permission(organization_id, ARRAY['owner', 'admin']))
    WITH CHECK (
        public.has_org_permission(organization_id, ARRAY['owner'])
        AND role <> 'owner'
    );

DROP POLICY IF EXISTS "Org members delete" ON public.organization_members;
CREATE POLICY "Org members delete" ON public.organization_members
    FOR DELETE USING (
        public.has_org_permission(organization_id, ARRAY['owner', 'admin'])
    );


-- ─────────────────────────────────────────────────────────────────────────────
-- PROCÉDURE SERVEUR SÉCURISÉE : TRANSFERT TRANSACTIONNEL DE PROPRIÉTÉ
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.transfer_organization_ownership(
    p_org_id UUID,
    p_new_owner_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
    v_target_role TEXT;
    v_caller_id UUID;
BEGIN
    v_caller_id := auth.uid();

    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required for ownership transfer'
            USING ERRCODE = '42501';
    END IF;

    -- 1. Vérifier que l'appelant est le propriétaire actuel
    SELECT role INTO v_caller_role
    FROM public.organization_members
    WHERE organization_id = p_org_id AND user_id = v_caller_id;

    IF v_caller_role IS NULL OR v_caller_role <> 'owner' THEN
        RAISE EXCEPTION 'Access denied: only current owner can transfer ownership'
            USING ERRCODE = '42501';
    END IF;

    IF v_caller_id = p_new_owner_user_id THEN
        RAISE EXCEPTION 'Target user is already the owner'
            USING ERRCODE = '22023';
    END IF;

    -- 2. Vérifier que la cible est bien membre de l'organisation
    SELECT role INTO v_target_role
    FROM public.organization_members
    WHERE organization_id = p_org_id AND user_id = p_new_owner_user_id;

    IF v_target_role IS NULL THEN
        RAISE EXCEPTION 'Target user must already be an active member of the organization'
            USING ERRCODE = '22023';
    END IF;

    -- 3. Exécution atomique sous drapeau de session
    PERFORM set_config('app.in_ownership_transfer', 'true', true);

    -- Ancien propriétaire devient 'admin'
    UPDATE public.organization_members
    SET role = 'admin'
    WHERE organization_id = p_org_id AND user_id = v_caller_id;

    -- Nouveau propriétaire devient 'owner'
    UPDATE public.organization_members
    SET role = 'owner'
    WHERE organization_id = p_org_id AND user_id = p_new_owner_user_id;

    PERFORM set_config('app.in_ownership_transfer', 'false', true);

    -- 4. Journalisation inaltérable
    PERFORM public.log_audit_event(
        p_org_id,
        'transfer_ownership',
        'organization',
        p_org_id::text,
        jsonb_build_object(
            'previous_owner_id', v_caller_id,
            'new_owner_id', p_new_owner_user_id,
            'timestamp', NOW()
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'organization_id', p_org_id,
        'previous_owner_id', v_caller_id,
        'new_owner_id', p_new_owner_user_id
    );
END;
$$;

-- Restriction des privilèges d'exécution
REVOKE ALL ON FUNCTION public.transfer_organization_ownership(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_organization_ownership(UUID, UUID) TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SEC-04 : PROTECTION DE LA JOURNALISATION D'AUDIT (log_audit_event)
-- ─────────────────────────────────────────────────────────────────────────────

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
    v_caller_id UUID;
    v_has_access BOOLEAN;
BEGIN
    v_caller_id := auth.uid();

    -- Si l'appelant est le rôle système interne (service_role), autoriser l'écriture système
    IF session_user = 'service_role' 
       OR COALESCE(current_setting('role', true), '') = 'service_role'
       OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
        INSERT INTO public.audit_logs (
            organization_id, user_id, user_email, action, entity_type, entity_id, details
        ) VALUES (
            p_org_id, v_caller_id, COALESCE(v_caller_id::text, 'service_role'), p_action, p_entity_type, p_entity_id, p_details
        ) RETURNING id INTO v_log_id;

        RETURN v_log_id;
    END IF;


    -- Pour tout autre utilisateur, interdiction stricte aux appels non authentifiés
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Anonymous audit logging is forbidden'
            USING ERRCODE = '42501';
    END IF;

    -- Vérification stricte d'appartenance à l'organisation ciblée (anti-forgerie interentreprises)
    SELECT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = p_org_id AND user_id = v_caller_id
    ) INTO v_has_access;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'Cross-tenant audit event forgery forbidden: user % is not a member of organization %',
            v_caller_id, p_org_id
            USING ERRCODE = '42501';
    END IF;

    -- Récupération garantie de l'email depuis auth.users
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_caller_id;


    -- Insertion sécurisée et auditée
    INSERT INTO public.audit_logs (
        organization_id, user_id, user_email, action, entity_type, entity_id, details
    ) VALUES (
        p_org_id, v_caller_id, v_user_email, p_action, p_entity_type, p_entity_id, p_details
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

-- Révocation formelle de l'accès public et anonyme
REVOKE ALL ON FUNCTION public.log_audit_event(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;
