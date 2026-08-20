-- ════════════════════════════════════════════════════════════════════
-- MIGRATIONS À APPLIQUER EN PRODUCTION (qmavetqcpzsfralsqxsi)
-- Regroupement des 7 fichiers v6_*.sql dans le seul ordre valable.
-- Généré le 2026-08-20.
--
-- À coller tel quel dans l'éditeur SQL Supabase, puis « Run ».
-- Tout passe en une fois : additif et non destructif (aucun DROP TABLE,
-- TRUNCATE ni DELETE), et idempotent — le relancer ne casse rien.
--
-- Sans ces migrations, le code de la branche main provoque en ligne :
--   - l'échec de tout enregistrement des paramètres d'entreprise
--     (index_jsx.js:5784 envoie 6 colonnes absentes) ;
--   - l'échec de la création d'un nouveau compte (index_jsx.js:5945) ;
--   - l'indisponibilité totale des factures.
-- Les appliquer AVANT de pousser le code : l'application actuellement
-- en ligne ignore les colonnes qu'elle ne connaît pas, il n'y a donc
-- aucune fenêtre de panne dans cet ordre-là.
--
-- Une requête de contrôle est fournie tout en bas.
-- ════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1/7 — v6_material_price_history_rls.sql
-- ─────────────────────────────────────────────────────────────

-- Correctif P1-02 (audit pré-commercial du 19/08/2026) : material_price_history
-- avait RLS activée mais seulement une policy "Platform admin read" en
-- production — aucune policy pour les organisations elles-mêmes, donc la
-- table restait vide pour tout utilisateur normal (PriceHistoryModal
-- n'affiche rien). Corrigé sur staging le 17/08 (§16.1 du tracker) ; jamais
-- porté sur production depuis, signalé sans interruption sur 3 audits.
--
-- Purement additif : ajoute 2 policies, ne touche pas à "Platform admin read"
-- qui existe déjà. Copie exacte de ce qui tourne sur staging depuis le 17/08
-- (vérifié par lecture directe de pg_policies avant d'écrire ce fichier).
--
-- À exécuter sur PRODUCTION (qmavetqcpzsfralsqxsi / SuperDevisMO) via le
-- SQL Editor du dashboard Supabase — l'agent n'a qu'un accès lecture seule
-- à ce projet par convention (voir § 13 du tracker).

DROP POLICY IF EXISTS "Material price history select" ON public.material_price_history;
CREATE POLICY "Material price history select" ON public.material_price_history
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

DROP POLICY IF EXISTS "Material price history insert" ON public.material_price_history;
CREATE POLICY "Material price history insert" ON public.material_price_history
    FOR INSERT WITH CHECK (public.has_org_permission(organization_id, ARRAY['owner', 'admin', 'estimator']));


-- ─────────────────────────────────────────────────────────────
-- 2/7 — v6_material_stock.sql
-- ─────────────────────────────────────────────────────────────

-- Gestion de stock, Phase 1 (2026-08-20, demandé par l'utilisateur) : suivi
-- manuel de la quantité en stock par matière. NULL = matière non suivie
-- (comportement par défaut, aucun avertissement affiché) ; toute valeur
-- numérique, y compris 0, = suivie explicitement.
--
-- Purement additif, idempotent (ADD COLUMN IF NOT EXISTS). Aucune valeur par
-- défaut à 0 volontairement : ça transformerait silencieusement toutes les
-- matières existantes en "suivies avec un stock nul", ce qui déclencherait
-- un avertissement "stock insuffisant" sur le premier devis venu pour des
-- matières que personne n'a jamais suivies.

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS stock_qty NUMERIC(12,3);

COMMENT ON COLUMN public.materials.stock_qty IS
  'Quantité en stock suivie manuellement (unité = unit_calc). NULL = matière non suivie, aucun avertissement. Jamais modifiée automatiquement par un devis.';


-- ─────────────────────────────────────────────────────────────
-- 3/7 — v6_company_logo_footer.sql
-- ─────────────────────────────────────────────────────────────

-- Personnalisation PDF, point de départ (2026-08-20, demandé par l'utilisateur)
-- Constat avant de commencer : le devis PDF affichait systématiquement le
-- logo d'ikadevis (l'éditeur du logiciel), jamais celui de l'entreprise
-- émettrice — index_jsx.js:10892, <LogoSVG> codé en dur. Corrigé côté
-- application ; cette migration ajoute le stockage cloud correspondant.
--
-- logo : image compressée côté navigateur en base64 (voir
-- compressImageToDataUrl, js/utils.js) — pas de bucket Supabase Storage,
-- aucune nouvelle infrastructure, fonctionne aussi en Mode Démo local.
-- TEXT plutôt que VARCHAR borné : un JPEG compressé (~480px de large,
-- qualité 0.85) tient largement sous la limite pratique de TEXT.
--
-- pdf_footer_note : texte libre affiché en bas du devis client (mentions
-- légales, RIB, CGV...).
--
-- Purement additif, idempotent. Pas de défaut SQL — NULL = non renseigné,
-- rien n'est affiché sur le PDF dans ce cas plutôt qu'un bloc vide.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS logo TEXT,
  ADD COLUMN IF NOT EXISTS pdf_footer_note TEXT;

COMMENT ON COLUMN public.company_settings.logo IS
  'Logo entreprise en base64 (data URI), compressé côté navigateur avant enregistrement. NULL = pas de logo, le PDF n''affiche rien (jamais un logo par défaut).';
COMMENT ON COLUMN public.company_settings.pdf_footer_note IS
  'Texte libre affiché en bas du devis PDF client (mentions légales, RIB, CGV...). NULL = rien affiché.';


-- ─────────────────────────────────────────────────────────────
-- 4/7 — v6_internal_doc_roles.sql
-- ─────────────────────────────────────────────────────────────

-- Accès aux documents internes (2026-08-20, demandé par l'utilisateur :
-- « tu peux mettre admin par défaut mais dans le setting l'admin peut
-- paramétrer les rôles qui peuvent voir ou pas »).
--
-- L'étude de prix expose les coûts d'achat, le coefficient de vente et la
-- marge. Jusqu'ici la bascule « Vue Interne » était offerte à TOUS les rôles,
-- y compris 'viewer'. Cette colonne stocke la liste des rôles autorisés.
--
-- 'owner' n'est jamais stocké ici : il a toujours accès et est le seul à
-- pouvoir modifier la liste — l'y inclure permettrait de se verrouiller hors
-- de ses propres documents.
--
-- Purement additif, idempotent. Pas de DEFAULT SQL : NULL = jamais configuré,
-- l'application retombe sur son défaut (['admin']). Un tableau vide est une
-- valeur légitime et distincte (personne hormis le propriétaire).

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS internal_doc_roles jsonb;

COMMENT ON COLUMN public.company_settings.internal_doc_roles IS
  'Rôles autorisés à ouvrir les documents internes (étude de prix : coûts, coefficient, marge). NULL = non configuré, défaut applicatif ["admin"]. ''owner'' a toujours accès et n''est pas stocké ici.';


-- ─────────────────────────────────────────────────────────────
-- 5/7 — v6_client_quote_template.sql
-- ─────────────────────────────────────────────────────────────

-- Gabarit du devis client par défaut (2026-08-20, § 27.5 point 1).
-- 'synthese' = une ligne par ouvrage (comportement historique)
-- 'detaille' = chaque fourniture et main-d'œuvre, au PRIX DE VENTE
--
-- Le gabarit détaillé n'expose jamais coût d'achat, coefficient ni marge :
-- le prix de vente du lot est réparti sur ses lignes au prorata des coûts
-- (distributeLotSalePrice, js/utils.js), la somme retombant exactement sur
-- le total du devis.
--
-- Purement additif, idempotent. Pas de DEFAULT SQL : NULL = non configuré,
-- l'application retombe sur 'synthese'.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS client_quote_template TEXT;

COMMENT ON COLUMN public.company_settings.client_quote_template IS
  'Gabarit du devis client par défaut : ''synthese'' (une ligne par ouvrage) ou ''detaille'' (chaque poste au prix de vente). NULL = non configuré, défaut applicatif ''synthese''.';


-- ─────────────────────────────────────────────────────────────
-- 6/7 — v6_vat_settings.sql
-- ─────────────────────────────────────────────────────────────

-- Réglages de TVA (2026-08-20, demandé par l'utilisateur : « me donner le
-- pouvoir de l'ajouter ou pas et aussi dans le setting choisir les règles qui
-- peuvent varier 18, 10 ou 20% »).
--
-- Constat avant de coder : dans l'éditeur de devis principal, le taux de TVA
-- était LU (`hybridQuote.vatRate || 18`) mais aucun champ ne permettait de le
-- changer — le seul champ TVA vivait dans l'ancien calculateur V5. Un devis
-- exonéré ou à taux réduit était donc impossible à établir.
--
-- vat_rates : taux proposés dans le sélecteur du devis (0 = exonéré).
-- vat_exemption_note : mention légale imprimée sur le document client quand
-- le taux retenu est 0 %.
--
-- Purement additif, idempotent. Pas de DEFAULT SQL : NULL = non configuré,
-- l'application retombe sur [18, 10, 0].

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS vat_rates jsonb,
  ADD COLUMN IF NOT EXISTS vat_exemption_note TEXT;

COMMENT ON COLUMN public.company_settings.vat_rates IS
  'Taux de TVA proposés dans le devis, ex. [18,10,0]. 0 = exonéré. NULL = non configuré, défaut applicatif [18,10,0].';
COMMENT ON COLUMN public.company_settings.vat_exemption_note IS
  'Mention légale imprimée sur le document client lorsque le taux de TVA retenu est 0 %.';


-- ─────────────────────────────────────────────────────────────
-- 7/7 — v6_invoices.sql
-- ─────────────────────────────────────────────────────────────

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


-- ════════════════════════════════════════════════════════════════════
-- CONTRÔLE — à exécuter après coup. Les 4 colonnes doivent afficher
-- le total attendu, sinon une partie n'est pas passée.
-- ════════════════════════════════════════════════════════════════════
select
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='company_settings'
     and column_name in ('logo','pdf_footer_note','internal_doc_roles',
                         'client_quote_template','vat_rates','vat_exemption_note'))
    as colonnes_reglages_attendu_6,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='materials'
     and column_name='stock_qty') as stock_attendu_1,
  (select count(*) from information_schema.tables
     where table_schema='public'
     and table_name in ('invoices','invoice_lines','organization_invoice_sequences'))
    as tables_facturation_attendu_3,
  (select count(*) from information_schema.routines
     where routine_schema='public' and routine_name='issue_invoice_v6')
    as fonction_emission_attendu_1;
