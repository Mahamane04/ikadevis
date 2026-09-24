-- IKADEVIS — correctif : issue_invoice_v6 ne compilait pas.
--
-- Contexte
-- --------
-- migrations_document_numbering_2026-09-06.sql a réécrit issue_invoice_v6 pour
-- (a) lire réellement le préfixe de organization_invoice_sequences, (b) remettre
-- la séquence à zéro au changement d'année, et (c) ne jamais entrer en collision
-- avec un numéro déjà présent en base (GREATEST(last_seq, max_existing)).
--
-- Mais la variable v_max_existing y est utilisée trois fois (lignes 216, 222 et
-- 224 de ce fichier) sans figurer dans le bloc DECLARE (lignes 172-179).
-- PL/pgSQL valide le corps à la création : la fonction est donc REFUSÉE, et
-- l'environnement continue de tourner sur la version d'origine
-- (v6_invoices.sql:183), où 'FACT-' est codé en dur et où la remise à zéro
-- annuelle n'existe pas.
--
-- Ce fichier republie la fonction complète avec la déclaration manquante.
--
-- Il en profite pour réparer un second défaut, voisin : invoices.due_date
-- n'était JAMAIS écrit (seule occurrence côté application : une lecture,
-- index_jsx.js:14897). Or l'Edge Function send-payment-reminders sélectionne
-- les factures par .eq('due_date', dateCible) : elle ne trouvait donc jamais
-- rien, et les rappels automatiques n'ont jamais pu partir.
--
-- L'échéance est désormais posée ICI, à l'émission, dans la même transaction
-- que l'attribution du numéro : émission + 30 jours, soit exactement la règle
-- que l'application appliquait déjà implicitement pour détecter un retard
-- (isInvoiceOverdue, index_jsx.js:313-331). Aucun changement de comportement
-- perçu ; le délai deviendra paramétrable avec les réglages Finances.
-- COALESCE : une échéance déjà renseignée n'est jamais écrasée.
--
-- Les factures DÉJÀ émises sont traitées à part, par
-- migrations_due_date_backfill_2026-09-18.sql — qui neutralise aussi les
-- rappels rétroactifs. Les deux fichiers vont ensemble.
--
-- Sûreté
-- ------
-- CREATE OR REPLACE : rejouable, non destructif. Ne touche aucune donnée, ne
-- consomme aucun numéro. La signature est inchangée, donc les GRANT existants
-- sont conservés.
--
-- État d'application
-- ------------------
--   staging     (mwfmruzlonsrrfufbsyz) : [ ] à appliquer
--   production  (qmavetqcpzsfralsqxsi) : [ ] à appliquer APRÈS validation staging
--
-- AVANT d'appliquer — savoir ce qui tourne réellement, prod et staging
-- pouvant diverger :
--
--   select proname,
--          prosrc like '%v_max_existing%' as version_reconciliee
--   from pg_proc
--   where proname in ('issue_invoice_v6', 'create_quote_v6', 'set_document_prefix');
--   -- set_document_prefix ABSENT = le fichier du 2026-09-06 n'est jamais
--   -- passé du tout : le préfixe personnalisable des Paramètres échoue
--   -- aujourd'hui en silence. Ce fichier le rétablit.
--
--   -- version_reconciliee = false  → la migration du 2026-09-06 n'est jamais
--   --                                passée : ce fichier la fait enfin passer.
--   -- version_reconciliee = true   → quelqu'un a déjà corrigé à la main ;
--   --                                comparer avant de rejouer.
--
-- APRÈS application — la fonction existe et compile :
--
--   select prosrc like '%v_max_existing%' as version_reconciliee,
--          prosrc like '%due_date%'       as pose_echeance
--   from pg_proc where proname = 'issue_invoice_v6';   -- attendu : true, true
--
-- Puis, sur staging UNIQUEMENT (jamais en production : un numéro de facture
-- légal consommé est immuable), émettre une facture brouillon de test :
--
--   select public.issue_invoice_v6('<uuid-d-un-brouillon>');

-- ══ Sections 1 à 3 du fichier du 2026-09-06, reprises À L'IDENTIQUE ══════
-- Le banc scratch/test_finance_sql_migrations.mjs l'a mesuré : exécuté d'un
-- bloc, l'échec du fichier du 2026-09-06 annule TOUTE sa transaction. Si
-- c'est ce qui s'est produit, seq_year, la lecture des séquences de devis,
-- create_quote_v6 réconciliée et set_document_prefix n'existent pas non
-- plus. Ce correctif rejoue donc le fichier entier, corrigé. Tout y est
-- IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS : sans effet si
-- ces objets sont déjà en place.

-- ── 1. Colonne de suivi de l'année pour la remise à zéro ──────────────────
ALTER TABLE public.organization_quote_sequences
    ADD COLUMN IF NOT EXISTS seq_year INT;

ALTER TABLE public.organization_invoice_sequences
    ADD COLUMN IF NOT EXISTS seq_year INT;

-- ── 2. Lecture directe du préfixe côté client (pour l'afficher dans les
--       Paramètres) — organization_invoice_sequences avait déjà cette policy,
--       organization_quote_sequences ne l'a jamais eue (RLS activé, aucune
--       policy = personne ne pouvait la lire, y compris son propre owner).
ALTER TABLE public.organization_quote_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Quote sequences select" ON public.organization_quote_sequences;
CREATE POLICY "Quote sequences select" ON public.organization_quote_sequences
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

-- ── 3. create_quote_v6 — préfixe réellement lu, remise à zéro annuelle ────
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
    v_last_seq INT;
    v_prefix TEXT;
    v_seq_year INT;
    v_next_seq INT;
    v_quote_number TEXT;
    v_line JSONB;
    v_tot_ht NUMERIC(15,2) := 0;
    v_tot_ttc NUMERIC(15,2) := 0;
    v_current_year TEXT;
    v_year_now INT;
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

    v_year_now := EXTRACT(YEAR FROM NOW())::int;

    -- Obtenir atomiquement la séquence de numérotation avec verrou ligne.
    INSERT INTO public.organization_quote_sequences (organization_id, last_seq, prefix, seq_year)
    VALUES (p_org_id, 0, 'DEV-', v_year_now)
    ON CONFLICT (organization_id) DO NOTHING;

    SELECT last_seq, prefix, seq_year INTO v_last_seq, v_prefix, v_seq_year
    FROM public.organization_quote_sequences
    WHERE organization_id = p_org_id
    FOR UPDATE;

    -- Remise à zéro automatique au changement d'année civile : le format
    -- DEV-2026-001 l'implique déjà pour l'utilisateur, on le rend réel.
    IF v_seq_year IS DISTINCT FROM v_year_now THEN
        v_next_seq := 1;
    ELSE
        v_next_seq := v_last_seq + 1;
    END IF;

    UPDATE public.organization_quote_sequences
    SET last_seq = v_next_seq, seq_year = v_year_now, updated_at = NOW()
    WHERE organization_id = p_org_id;

    v_current_year := TO_CHAR(NOW(), 'YYYY');
    v_quote_number := COALESCE(v_prefix, 'DEV-') || v_current_year || '-' || LPAD(v_next_seq::text, 3, '0');

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

-- ── issue_invoice_v6 — préfixe lu, remise à zéro annuelle, anti-collision ──
CREATE OR REPLACE FUNCTION public.issue_invoice_v6(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID;
    v_status TEXT;
    v_last_seq INT;
    v_prefix TEXT;
    v_seq_year INT;
    v_next_seq INT;
    v_max_existing INT;   -- ← la déclaration manquante : tout le correctif est là
    v_number TEXT;
    v_year_now INT;
    v_due DATE;
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

    v_year_now := EXTRACT(YEAR FROM NOW())::int;

    -- Verrou de ligne : deux émissions simultanées ne peuvent pas obtenir le
    -- même numéro (le second attend que le premier ait incrémenté).
    INSERT INTO public.organization_invoice_sequences (organization_id, last_seq, prefix, seq_year)
    VALUES (v_org, 0, 'FACT-', v_year_now)
    ON CONFLICT (organization_id) DO NOTHING;

    SELECT last_seq, prefix, seq_year INTO v_last_seq, v_prefix, v_seq_year
    FROM public.organization_invoice_sequences
    WHERE organization_id = v_org
    FOR UPDATE;

    -- Trouver le numéro de séquence maximal déjà utilisé sur les factures de l'organisation pour cette année
    SELECT COALESCE(MAX(
        CASE
            WHEN invoice_number ~ ('^' || COALESCE(v_prefix, 'FACT-') || v_year_now::text || '-[0-9]+$')
            THEN SUBSTRING(invoice_number FROM '[0-9]+$')::int
            ELSE 0
        END
    ), 0)
    INTO v_max_existing
    FROM public.invoices
    WHERE organization_id = v_org;

    -- Calculer le numéro suivant sans jamais entrer en collision avec l'existant
    IF v_seq_year IS DISTINCT FROM v_year_now THEN
        v_next_seq := v_max_existing + 1;
    ELSE
        v_next_seq := GREATEST(COALESCE(v_last_seq, 0), v_max_existing) + 1;
    END IF;

    UPDATE public.organization_invoice_sequences
    SET last_seq = v_next_seq, seq_year = v_year_now, updated_at = NOW()
    WHERE organization_id = v_org;

    v_number := COALESCE(v_prefix, 'FACT-') || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(v_next_seq::text, 3, '0');

    -- Échéance = émission + 30 jours, sauf si elle était déjà renseignée.
    UPDATE public.invoices
    SET invoice_number = v_number,
        status = 'issued',
        issued_at = NOW(),
        due_date = COALESCE(due_date, CURRENT_DATE + 30)
    WHERE id = p_invoice_id
    RETURNING due_date INTO v_due;

    RETURN jsonb_build_object(
        'invoice_id', p_invoice_id,
        'invoice_number', v_number,
        'issued_at', NOW(),
        'due_date', v_due
    );
END;
$$;

-- ══ Section 5 du fichier du 2026-09-06, reprise À L'IDENTIQUE ═══════════
-- ── 5. set_document_prefix — permet à l'owner/admin de personnaliser le
--       préfixe depuis les Paramètres (Documents & PDF).
CREATE OR REPLACE FUNCTION public.set_document_prefix(p_org_id UUID, p_kind TEXT, p_prefix TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.has_org_permission(p_org_id, ARRAY['owner','admin']) THEN
        RAISE EXCEPTION 'Permission refusée : seuls le propriétaire et un administrateur peuvent modifier la numérotation';
    END IF;
    IF p_kind NOT IN ('quote','invoice') THEN
        RAISE EXCEPTION 'Type de document invalide : % (attendu quote ou invoice)', p_kind;
    END IF;
    IF p_prefix IS NULL OR LENGTH(TRIM(p_prefix)) = 0 OR LENGTH(p_prefix) > 12 THEN
        RAISE EXCEPTION 'Préfixe invalide : doit faire entre 1 et 12 caractères';
    END IF;

    IF p_kind = 'quote' THEN
        INSERT INTO public.organization_quote_sequences (organization_id, last_seq, prefix, seq_year)
        VALUES (p_org_id, 0, p_prefix, EXTRACT(YEAR FROM NOW())::int)
        ON CONFLICT (organization_id) DO UPDATE SET prefix = EXCLUDED.prefix, updated_at = NOW();
    ELSE
        INSERT INTO public.organization_invoice_sequences (organization_id, last_seq, prefix, seq_year)
        VALUES (p_org_id, 0, p_prefix, EXTRACT(YEAR FROM NOW())::int)
        ON CONFLICT (organization_id) DO UPDATE SET prefix = EXCLUDED.prefix, updated_at = NOW();
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_document_prefix(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_document_prefix(UUID, TEXT, TEXT) TO authenticated;
