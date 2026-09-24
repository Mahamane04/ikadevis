-- IKADEVIS — Finances : paramètres (devises, taxes, catégories) et comptes
-- financiers (banques, caisses, portefeuilles mobile money).
--
-- Contexte
-- --------
-- Premier écran visible du module Finances (tracker § 71). Jusqu'ici :
--   - la devise n'était qu'un libellé de company_settings ;
--   - les taxes se résumaient à une liste de taux (company_settings.vat_rates),
--     sans distinction entre « pas de taxe », « exonéré » et « taux zéro »,
--     ni portée achat/vente, ni caractère récupérable ;
--   - aucune catégorie de dépense n'existait ;
--   - la « banque » tenait en six champs texte dans commercial_settings
--     (bankName, bankAccount, bankSwift, orangeMoneyNumber, waveNumber,
--     moovMoneyNumber) : un seul jeu par organisation, aucun solde.
--
-- Dépend de :
--   migrations_finance_socle_2026-09-18.sql    (table currencies)
--   migrations_finance_payments_2026-09-18.sql (table payments : clé
--                                               étrangère account_id et soldes)
--
-- Sûreté
-- ------
-- Additive et rejouable (IF NOT EXISTS, CREATE OR REPLACE, DROP … IF EXISTS).
-- Ne modifie aucune ligne existante. Les champs bancaires de
-- commercial_settings RESTENT en place : le PDF les lit toujours. Ils sont
-- seulement RECOPIÉS en comptes par seed_finance_defaults_v1, à la demande.
--
-- État d'application
-- ------------------
--   staging     (mwfmruzlonsrrfufbsyz) : [ ] à appliquer
--   production  (qmavetqcpzsfralsqxsi) : [ ] à appliquer APRÈS validation staging


-- ── 1. Paramètres financiers de l'organisation ────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_settings (
    organization_id            UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    base_currency              CHAR(3) NOT NULL REFERENCES public.currencies(code),
    -- Devises utilisables sur les documents et les comptes. La devise de base
    -- en fait toujours partie (contrainte ci-dessous).
    enabled_currencies         CHAR(3)[] NOT NULL,
    default_payment_terms_days SMALLINT NOT NULL DEFAULT 30 CHECK (default_payment_terms_days BETWEEN 0 AND 365),
    fiscal_year_start_month    SMALLINT NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by                 UUID REFERENCES auth.users(id),
    CONSTRAINT finance_settings_base_enabled CHECK (base_currency = ANY (enabled_currencies))
);

-- Changer de devise de base après avoir émis des documents rendrait tout
-- l'historique ininterprétable : le cahier des charges exige une migration
-- contrôlée. On le refuse donc ici, et le message dit pourquoi.
CREATE OR REPLACE FUNCTION public.protect_finance_base_currency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := NOW();
    IF NEW.base_currency IS DISTINCT FROM OLD.base_currency AND (
        EXISTS (SELECT 1 FROM public.invoices
                WHERE organization_id = NEW.organization_id AND status <> 'draft')
        OR EXISTS (SELECT 1 FROM public.payments WHERE organization_id = NEW.organization_id)
    ) THEN
        RAISE EXCEPTION 'La devise de base ne peut plus être changée : des factures ou des règlements existent déjà. Ce changement demande une migration contrôlée.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_finance_base_currency ON public.finance_settings;
CREATE TRIGGER trg_protect_finance_base_currency
    BEFORE UPDATE ON public.finance_settings
    FOR EACH ROW EXECUTE FUNCTION public.protect_finance_base_currency();


-- ── 2. Taxes ──────────────────────────────────────────────────────────────
-- Nom libre (« TVA 18 % », « VAT », « GST »…) : aucun référentiel régional
-- n'est imposé. Trois natures distinctes, que la loi distingue elle-même :
--   standard : un taux strictement positif ;
--   zero     : taxable au taux 0 % (ex. certaines exportations) ;
--   exempt   : hors champ ou exonéré — porte généralement une mention légale.
-- « Pas de taxe du tout » est l'absence de taxe sur la ligne, pas une taxe.
CREATE TABLE IF NOT EXISTS public.tax_rates (
    id               UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name             TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
    kind             TEXT NOT NULL DEFAULT 'standard' CHECK (kind IN ('standard','zero','exempt')),
    rate             NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (rate >= 0 AND rate <= 100),
    scope            TEXT NOT NULL DEFAULT 'both' CHECK (scope IN ('sale','purchase','both')),
    -- Prix saisis TTC (taxe incluse) ou HT.
    is_inclusive     BOOLEAN NOT NULL DEFAULT FALSE,
    -- Taxe récupérable sur les achats : elle ne s'ajoute pas au coût. Non
    -- récupérable : elle l'augmente.
    is_recoverable   BOOLEAN NOT NULL DEFAULT TRUE,
    legal_mention    TEXT,
    effective_from   DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to     DATE,
    is_default       BOOLEAN NOT NULL DEFAULT FALSE,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tax_rates_kind_rate CHECK (
        (kind = 'standard' AND rate > 0) OR (kind IN ('zero','exempt') AND rate = 0)),
    CONSTRAINT tax_rates_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS idx_tax_rates_org ON public.tax_rates(organization_id);
-- Une seule taxe par défaut par portée, parmi les taxes actives.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_rates_default
    ON public.tax_rates(organization_id, scope) WHERE is_default AND is_active;


-- ── 3. Catégories de dépenses ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expense_categories (
    id               UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name             TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
    -- Nature comptable, utile aux rapports et au futur moteur d'écritures :
    -- une avance fournisseur, un équipement ou du stock ne sont PAS des
    -- charges du chantier, même quand l'argent sort de la caisse.
    kind             TEXT NOT NULL DEFAULT 'operating' CHECK (kind IN
                     ('material','labor','subcontract','transport','rental','supplies',
                      'rent','subscription','bank_fees','equipment','stock','advance',
                      'operating','other')),
    sort_order       SMALLINT NOT NULL DEFAULT 100,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_categories_name
    ON public.expense_categories(organization_id, lower(btrim(name)));


-- ── 4. Comptes financiers : banques, caisses, portefeuilles ───────────────
-- Seuls le nom, le type, la devise, le solde initial et sa date sont
-- obligatoires. Aucun identifiant bancaire régional n'est exigé : une caisse
-- d'atelier n'a pas d'IBAN.
CREATE TABLE IF NOT EXISTS public.financial_accounts (
    id               UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name             TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
    kind             TEXT NOT NULL CHECK (kind IN ('bank','cash','mobile_money','card','other')),
    currency         CHAR(3) NOT NULL REFERENCES public.currencies(code),
    institution      TEXT,            -- banque, opérateur (Orange Money, Wave…)
    holder           TEXT,            -- titulaire
    account_number   TEXT,            -- numéro ou référence de compte
    iban             TEXT,
    bic              TEXT,
    mobile_number    TEXT,            -- numéro du portefeuille mobile money
    -- Solde au DÉBUT du jour opening_date. C'est une reprise d'historique,
    -- jamais un revenu : il n'entrera dans aucun chiffre d'affaires.
    opening_balance  NUMERIC(15,2) NOT NULL DEFAULT 0,
    opening_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    show_on_documents BOOLEAN NOT NULL DEFAULT FALSE,
    is_default       BOOLEAN NOT NULL DEFAULT FALSE,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    notes            TEXT,
    -- D'où vient le compte quand il a été créé par reprise des anciens
    -- réglages (commercial_settings.bankName, .waveNumber…). Rend la reprise
    -- idempotente.
    legacy_source    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by       UUID REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_financial_accounts_org ON public.financial_accounts(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_accounts_name
    ON public.financial_accounts(organization_id, lower(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_accounts_default
    ON public.financial_accounts(organization_id) WHERE is_default AND is_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_accounts_legacy
    ON public.financial_accounts(organization_id, legacy_source) WHERE legacy_source IS NOT NULL;

-- La devise d'un compte qui porte déjà des mouvements n'est jamais remplacée
-- rétroactivement (cahier des charges § 5) : ses soldes deviendraient faux.
CREATE OR REPLACE FUNCTION public.protect_financial_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := NOW();
    IF NEW.currency IS DISTINCT FROM OLD.currency
       AND EXISTS (SELECT 1 FROM public.payments WHERE account_id = OLD.id) THEN
        RAISE EXCEPTION 'La devise du compte « % » ne peut plus être changée : il porte déjà des mouvements.', OLD.name;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_financial_account ON public.financial_accounts;
CREATE TRIGGER trg_protect_financial_account
    BEFORE UPDATE ON public.financial_accounts
    FOR EACH ROW EXECUTE FUNCTION public.protect_financial_account();


-- ── 5. Rattachement des règlements aux comptes ────────────────────────────
-- ON DELETE RESTRICT : un compte qui porte des mouvements ne peut pas être
-- supprimé — on l'archive (is_active = false). Supprimer effacerait la trace
-- de l'argent.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_account_fk') THEN
        ALTER TABLE public.payments
            ADD CONSTRAINT payments_account_fk FOREIGN KEY (account_id)
            REFERENCES public.financial_accounts(id) ON DELETE RESTRICT;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_payments_account ON public.payments(account_id) WHERE account_id IS NOT NULL;

-- Un mouvement est enregistré dans la devise RÉELLEMENT mouvementée sur le
-- compte. Un paiement en EUR ne peut pas atterrir sur une caisse en XOF sans
-- conversion explicite.
CREATE OR REPLACE FUNCTION public.check_payment_account_currency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_devise  CHAR(3);
    v_org     UUID;
BEGIN
    IF NEW.account_id IS NULL THEN RETURN NEW; END IF;
    SELECT currency, organization_id INTO v_devise, v_org
    FROM public.financial_accounts WHERE id = NEW.account_id;
    IF v_org IS DISTINCT FROM NEW.organization_id THEN
        RAISE EXCEPTION 'Ce compte n''appartient pas à cette organisation.';
    END IF;
    IF v_devise IS DISTINCT FROM NEW.currency THEN
        RAISE EXCEPTION 'Le mouvement est en %, le compte est en % : convertissez le montant dans la devise du compte.', NEW.currency, v_devise;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_payment_account_currency ON public.payments;
CREATE TRIGGER trg_check_payment_account_currency
    BEFORE INSERT OR UPDATE OF account_id, currency ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.check_payment_account_currency();


-- ── 6. Soldes ─────────────────────────────────────────────────────────────
-- Un solde n'est JAMAIS une colonne : elle dériverait au premier mouvement
-- oublié. Solde = solde initial + entrées − sorties, dans la devise du compte,
-- pour les mouvements confirmés à partir de la date du solde initial.
-- Les mouvements antérieurs sont déjà compris dans le solde initial : ils sont
-- comptés à part (anterior_count) pour que l'écran puisse le signaler.
--
-- security_invoker = on : la vue s'exécute avec les droits de celui qui la
-- lit, donc sous la RLS de financial_accounts et de payments. Sans cette
-- option, une vue lirait avec les droits de son propriétaire et exposerait
-- les soldes de TOUTES les organisations.
CREATE OR REPLACE VIEW public.v_financial_account_balances
WITH (security_invoker = on) AS
SELECT
    a.id                AS account_id,
    a.organization_id,
    a.currency,
    a.opening_balance,
    a.opening_date,
    COALESCE(SUM(p.amount) FILTER (WHERE p.direction = 'in'  AND p.payment_date >= a.opening_date), 0) AS total_in,
    COALESCE(SUM(p.amount) FILTER (WHERE p.direction = 'out' AND p.payment_date >= a.opening_date), 0) AS total_out,
    a.opening_balance
      + COALESCE(SUM(p.amount) FILTER (WHERE p.direction = 'in'  AND p.payment_date >= a.opening_date), 0)
      - COALESCE(SUM(p.amount) FILTER (WHERE p.direction = 'out' AND p.payment_date >= a.opening_date), 0) AS balance,
    COUNT(p.id) FILTER (WHERE p.payment_date >= a.opening_date) AS movement_count,
    COUNT(p.id) FILTER (WHERE p.payment_date <  a.opening_date) AS anterior_count
FROM public.financial_accounts a
LEFT JOIN public.payments p ON p.account_id = a.id AND p.status = 'confirmed'
GROUP BY a.id;


-- ── 7. Droits ─────────────────────────────────────────────────────────────
-- Lecture : tout membre. Écriture : propriétaire et administrateurs — ce sont
-- des réglages de l'entreprise, au même titre que ceux des Paramètres.
ALTER TABLE public.finance_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['finance_settings','tax_rates','expense_categories','financial_accounts'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "%s select" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "%s select" ON public.%I FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()))', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "%s write" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "%s write" ON public.%I FOR ALL USING (public.has_org_permission(organization_id, ARRAY[''owner'',''admin''])) WITH CHECK (public.has_org_permission(organization_id, ARRAY[''owner'',''admin'']))', t, t);
    END LOOP;
END $$;


-- ── 8. Valeurs initiales, reprises des réglages existants ─────────────────
-- Appelée par l'application à la première ouverture des Paramètres Finances.
-- Idempotente : chaque bloc ne fait rien si l'organisation a déjà des données
-- de ce type. Même logique que financeDefautsDepuisEntreprise() dans
-- js/finance-core.js (mode local) — les deux doivent rester alignées.
CREATE OR REPLACE FUNCTION public.seed_finance_defaults_v1(p_org UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cs        RECORD;
    v_base      CHAR(3);
    v_taux      NUMERIC;
    v_defaut    NUMERIC;
    v_premier   BOOLEAN := TRUE;
    v_n         INT;
    c_taxes     INT := 0;
    c_cats      INT := 0;
    c_comptes   INT := 0;
    v_cs_json   JSONB;
BEGIN
    IF NOT public.has_org_permission(p_org, ARRAY['owner','admin']) THEN
        RAISE EXCEPTION 'Permission refusée : seuls le propriétaire et un administrateur peuvent initialiser les réglages financiers';
    END IF;

    SELECT currency, vat_rates, vat_exemption_note, commercial_settings
    INTO v_cs
    FROM public.company_settings WHERE organization_id = p_org;

    -- Devise de base : celle déjà choisie dans les réglages de l'entreprise.
    v_base := CASE upper(COALESCE(NULLIF(btrim(v_cs.currency), ''), 'FCFA'))
        WHEN 'FCFA' THEN 'XOF' WHEN 'F CFA' THEN 'XOF' WHEN 'CFA' THEN 'XOF'
        WHEN 'EURO' THEN 'EUR' WHEN '€' THEN 'EUR'
        WHEN 'DOLLAR' THEN 'USD' WHEN '$' THEN 'USD'
        ELSE upper(btrim(v_cs.currency)) END;
    IF v_base IS NULL OR NOT EXISTS (SELECT 1 FROM public.currencies WHERE code = v_base) THEN
        v_base := 'XOF';
    END IF;

    INSERT INTO public.finance_settings (organization_id, base_currency, enabled_currencies, updated_by)
    VALUES (p_org, v_base, ARRAY[v_base]::CHAR(3)[], auth.uid())
    ON CONFLICT (organization_id) DO NOTHING;

    -- Taxes : reprises des taux déjà proposés sur les devis. La taxe par
    -- défaut est 18 % si elle existe (défaut historique de l'application),
    -- sinon le premier taux positif.
    IF NOT EXISTS (SELECT 1 FROM public.tax_rates WHERE organization_id = p_org) THEN
        v_defaut := CASE
            WHEN v_cs.vat_rates IS NULL OR jsonb_typeof(v_cs.vat_rates) <> 'array'
                 OR jsonb_array_length(v_cs.vat_rates) = 0 OR v_cs.vat_rates @> '[18]'::jsonb THEN 18
            ELSE NULL END;
        FOR v_taux IN
            SELECT DISTINCT (e)::numeric AS t
            FROM jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(v_cs.vat_rates) = 'array' AND jsonb_array_length(v_cs.vat_rates) > 0
                     THEN v_cs.vat_rates ELSE '[18, 10, 0]'::jsonb END) AS e
            WHERE e ~ '^[0-9]+(\.[0-9]+)?$' AND (e)::numeric <= 100
            ORDER BY 1 DESC
        LOOP
            IF v_taux > 0 THEN
                INSERT INTO public.tax_rates (organization_id, name, kind, rate, is_default)
                VALUES (p_org, 'TVA ' || to_char(v_taux, 'FM990.###') || ' %', 'standard', v_taux,
                        CASE WHEN v_defaut IS NOT NULL THEN v_taux = v_defaut ELSE v_premier END);
                v_premier := FALSE;
            ELSE
                INSERT INTO public.tax_rates (organization_id, name, kind, rate)
                VALUES (p_org, 'Taux zéro', 'zero', 0);
            END IF;
            c_taxes := c_taxes + 1;
        END LOOP;
        INSERT INTO public.tax_rates (organization_id, name, kind, rate, legal_mention)
        VALUES (p_org, 'Exonéré', 'exempt', 0, NULLIF(btrim(v_cs.vat_exemption_note), ''));
        c_taxes := c_taxes + 1;
    END IF;

    -- Catégories : la liste initiale du cahier des charges, modifiable.
    IF NOT EXISTS (SELECT 1 FROM public.expense_categories WHERE organization_id = p_org) THEN
        INSERT INTO public.expense_categories (organization_id, name, kind, sort_order) VALUES
            (p_org, 'Matériaux',                     'material',     10),
            (p_org, 'Prestations et sous-traitance', 'subcontract',  20),
            (p_org, 'Main-d''œuvre',                 'labor',        30),
            (p_org, 'Transport',                     'transport',    40),
            (p_org, 'Location',                      'rental',       50),
            (p_org, 'Fournitures',                   'supplies',     60),
            (p_org, 'Loyers',                        'rent',         70),
            (p_org, 'Abonnements',                   'subscription', 80),
            (p_org, 'Frais bancaires',               'bank_fees',    90);
        c_cats := 9;
    END IF;

    -- Comptes : recopie des coordonnées déjà saisies dans « Facturation &
    -- envoi ». Chaque source n'est reprise qu'une fois (legacy_source), et un
    -- compte supprimé par l'utilisateur ne revient pas tant qu'il en existe
    -- d'autres (la reprise ne se fait qu'à la toute première initialisation).
    IF NOT EXISTS (SELECT 1 FROM public.financial_accounts WHERE organization_id = p_org) THEN
        v_cs_json := COALESCE(v_cs.commercial_settings, '{}'::jsonb);
        IF NULLIF(btrim(v_cs_json->>'bankName'), '') IS NOT NULL
           OR NULLIF(btrim(v_cs_json->>'bankAccount'), '') IS NOT NULL THEN
            INSERT INTO public.financial_accounts (organization_id, name, kind, currency, institution,
                account_number, bic, show_on_documents, is_default, legacy_source, created_by)
            VALUES (p_org, COALESCE(NULLIF(btrim(v_cs_json->>'bankName'), ''), 'Compte bancaire'), 'bank', v_base,
                NULLIF(btrim(v_cs_json->>'bankName'), ''), NULLIF(btrim(v_cs_json->>'bankAccount'), ''),
                NULLIF(btrim(v_cs_json->>'bankSwift'), ''), TRUE, TRUE,
                'commercial_settings.bank', auth.uid())
            ON CONFLICT DO NOTHING;
            GET DIAGNOSTICS v_n = ROW_COUNT; c_comptes := c_comptes + v_n;
        END IF;
        IF NULLIF(btrim(v_cs_json->>'orangeMoneyNumber'), '') IS NOT NULL THEN
            INSERT INTO public.financial_accounts (organization_id, name, kind, currency, institution, mobile_number, show_on_documents, legacy_source, created_by)
            VALUES (p_org, 'Orange Money', 'mobile_money', v_base, 'Orange Money', btrim(v_cs_json->>'orangeMoneyNumber'), TRUE, 'commercial_settings.orange_money', auth.uid())
            ON CONFLICT DO NOTHING;
            GET DIAGNOSTICS v_n = ROW_COUNT; c_comptes := c_comptes + v_n;
        END IF;
        IF NULLIF(btrim(v_cs_json->>'waveNumber'), '') IS NOT NULL THEN
            INSERT INTO public.financial_accounts (organization_id, name, kind, currency, institution, mobile_number, show_on_documents, legacy_source, created_by)
            VALUES (p_org, 'Wave', 'mobile_money', v_base, 'Wave', btrim(v_cs_json->>'waveNumber'), TRUE, 'commercial_settings.wave', auth.uid())
            ON CONFLICT DO NOTHING;
            GET DIAGNOSTICS v_n = ROW_COUNT; c_comptes := c_comptes + v_n;
        END IF;
        IF NULLIF(btrim(v_cs_json->>'moovMoneyNumber'), '') IS NOT NULL THEN
            INSERT INTO public.financial_accounts (organization_id, name, kind, currency, institution, mobile_number, show_on_documents, legacy_source, created_by)
            VALUES (p_org, 'Moov Money', 'mobile_money', v_base, 'Moov Money', btrim(v_cs_json->>'moovMoneyNumber'), TRUE, 'commercial_settings.moov_money', auth.uid())
            ON CONFLICT DO NOTHING;
            GET DIAGNOSTICS v_n = ROW_COUNT; c_comptes := c_comptes + v_n;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'base_currency',     v_base,
        'taxes_creees',      c_taxes,
        'categories_creees', c_cats,
        'comptes_crees',     c_comptes
    );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_finance_defaults_v1(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_finance_defaults_v1(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.seed_finance_defaults_v1(UUID) TO authenticated;


-- ── Contrôles post-migration ──────────────────────────────────────────────
-- 1) La vue des soldes respecte la RLS (doit contenir 'security_invoker=on') :
--      select reloptions from pg_class where relname = 'v_financial_account_balances';
-- 2) Aucune nouvelle alerte : passer get_advisors (sécurité).
-- 3) Pour une organisation de test, sur staging, en tant qu'owner :
--      select public.seed_finance_defaults_v1('<org-uuid>');
