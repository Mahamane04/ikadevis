-- IKADEVIS — correctif "Enregistrer crée un doublon à chaque clic"
--
-- ✅ APPLIQUÉE ET VALIDÉE SUR STAGING (mwfmruzlonsrrfufbsyz) le 2026-08-31.
--    Reste à coller à la main dans l'éditeur SQL du dashboard PRODUCTION
--    (qmavetqcpzsfralsqxsi) — connexion MCP production en lecture seule,
--    voir CLAUDE.md.
--
-- Tests réels exécutés sur staging (scénario complet en transaction annulée :
-- utilisateur + organisation + devis créés, mise à jour appelée, tout annulé) :
--   · garde "Authentification requise"            → levé (ligne 11)
--   · garde "Accès refusé : permissions"          → levé (ligne 15)
--   · nombre de devis          : 1 → 1            (aucun doublon créé)
--   · numéro du devis          : DEV-2026-001 → DEV-2026-001 (inchangé)
--   · séquence de numérotation : 1 → 1            (AUCUN numéro consommé)
--   · lignes du devis          : 1 → 2            (remplacées correctement)
--   · total_ht recalculé       : 15 500           (conforme aux lignes envoyées)
--   · champs mis à jour        : client_name bien remplacé
--   · retour RPC               : quote_id + quote_number corrects
--
-- Cause racine : create_quote_v6/v7 sont des fonctions UNIQUEMENT INSERT —
-- aucune fonction de mise à jour n'existait pour un devis déjà sauvegardé.
-- Chaque clic sur "Enregistrer" créait donc une nouvelle ligne dans `quotes`
-- avec un nouveau quote_number, jamais une mise à jour de la ligne existante.
--
-- update_quote_v1 met à jour une ligne EXISTANTE, identifiée par p_quote_id :
-- ne touche ni à quote_number ni à organization_quote_sequences (aucun
-- numéro n'est consommé pour une mise à jour), remplace les quote_lines à
-- l'identique du contenu envoyé. Mêmes contrôles de permission et
-- d'appartenance que create_quote_v6, plus une vérification que le devis
-- appartient bien à l'organisation avant de le modifier.

CREATE OR REPLACE FUNCTION public.update_quote_v1(
    p_quote_id UUID,
    p_org_id UUID,
    p_client_name TEXT,
    p_project_ref TEXT,
    p_company_snapshot JSONB DEFAULT '{}'::jsonb,
    p_calc_form_snapshot JSONB DEFAULT '{}'::jsonb,
    p_lines JSONB DEFAULT '[]'::jsonb,
    p_hybrid_snapshot JSONB DEFAULT '{}'::jsonb,
    p_client_id UUID DEFAULT NULL,
    p_project_id UUID DEFAULT NULL,
    p_vat_rate NUMERIC DEFAULT 18
)
RETURNS TABLE(quote_id UUID, quote_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_line JSONB;
    v_tot_ht NUMERIC(15,2) := 0;
    v_tot_ttc NUMERIC(15,2) := 0;
    v_existing_number TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentification requise pour modifier un devis';
    END IF;

    IF NOT public.has_org_permission(p_org_id, ARRAY['owner', 'admin', 'estimator', 'commercial']) THEN
        RAISE EXCEPTION 'Accès refusé : permissions insuffisantes pour modifier un devis dans cette organisation';
    END IF;

    -- Le devis doit exister et appartenir à cette organisation — sinon on
    -- modifierait silencieusement le devis d'une autre organisation à partir
    -- d'un ID deviné ou périmé.
    SELECT quote_number INTO v_existing_number
    FROM public.quotes
    WHERE id = p_quote_id AND organization_id = p_org_id;

    IF v_existing_number IS NULL THEN
        RAISE EXCEPTION 'Devis introuvable pour cette organisation — impossible de le mettre à jour';
    END IF;

    IF p_client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_client_id AND organization_id = p_org_id) THEN
        RAISE EXCEPTION 'Client invalide ou n''appartenant pas à cette organisation';
    END IF;

    IF p_project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND organization_id = p_org_id) THEN
        RAISE EXCEPTION 'Projet invalide ou n''appartenant pas à cette organisation';
    END IF;

    IF jsonb_typeof(p_lines) = 'array' THEN
        FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
        LOOP
            v_tot_ht := v_tot_ht + COALESCE((v_line->>'total_ht')::numeric, 0);
        END LOOP;
    END IF;
    v_tot_ttc := v_tot_ht * (1 + (COALESCE(p_vat_rate, 18) / 100));

    -- Met à jour la ligne existante — quote_number, organization_id et
    -- parent_quote_id ne changent jamais ici (contrairement à create_quote_v6,
    -- aucun numéro n'est consommé pour une mise à jour).
    UPDATE public.quotes SET
        client_id = p_client_id,
        project_id = p_project_id,
        client_name = COALESCE(NULLIF(TRIM(p_client_name), ''), 'Client Passage'),
        project_ref = COALESCE(NULLIF(TRIM(p_project_ref), ''), 'Chantier BTP'),
        total_ht_consomme = v_tot_ht,
        total_ttc_consomme = v_tot_ttc,
        company_snapshot = p_company_snapshot,
        calc_form_snapshot = p_calc_form_snapshot,
        hybrid_quote_snapshot = p_hybrid_snapshot,
        updated_at = NOW()
    WHERE id = p_quote_id AND organization_id = p_org_id;

    -- Remplace les lignes du devis à l'identique du contenu envoyé, plutôt
    -- que de tenter un diff ligne à ligne — le client envoie toujours l'état
    -- complet du devis (comme pour create_quote_v6).
    DELETE FROM public.quote_lines WHERE quote_lines.quote_id = p_quote_id AND organization_id = p_org_id;

    IF jsonb_typeof(p_lines) = 'array' THEN
        FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
        LOOP
            INSERT INTO public.quote_lines (
                organization_id, quote_id, line_order, designation,
                unit, quantity, unit_price_ht, total_ht, cost_category, metadata
            ) VALUES (
                p_org_id, p_quote_id,
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

    quote_id := p_quote_id;
    quote_number := v_existing_number;
    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.update_quote_v1(UUID, UUID, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, UUID, UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_quote_v1(UUID, UUID, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, UUID, UUID, NUMERIC) TO authenticated;
