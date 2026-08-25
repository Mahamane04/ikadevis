-- IKADEVIS — migration de fiabilisation de la numérotation des devis
-- À appliquer sur staging, valider, puis appliquer sur production.
-- La RPC v6 reste inchangée ; v7 renvoie le numéro réellement attribué par
-- la séquence transactionnelle afin d'éviter une divergence multi-appareils.

CREATE OR REPLACE FUNCTION public.create_quote_v7(
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
RETURNS TABLE(quote_id UUID, quote_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    quote_id := public.create_quote_v6(
        p_org_id,
        p_client_name,
        p_project_ref,
        p_company_snapshot,
        p_calc_form_snapshot,
        p_lines,
        p_hybrid_snapshot,
        p_client_id,
        p_project_id,
        p_vat_rate,
        p_parent_quote_id
    );

    SELECT q.quote_number
    INTO quote_number
    FROM public.quotes q
    WHERE q.id = quote_id
      AND q.organization_id = p_org_id;

    IF quote_number IS NULL THEN
        RAISE EXCEPTION 'Devis créé mais numéro serveur introuvable';
    END IF;

    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_quote_v7(UUID, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, UUID, UUID, NUMERIC, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_quote_v7(UUID, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, UUID, UUID, NUMERIC, UUID) TO authenticated;
