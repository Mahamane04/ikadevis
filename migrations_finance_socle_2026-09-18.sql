-- IKADEVIS — socle Finances (1/2) : devises identifiées et triplet de change.
--
-- Contexte
-- --------
-- Aujourd'hui la devise n'est qu'un libellé : organizations.currency et
-- company_settings.currency sont deux colonnes TEXT sans contrainte, valant
-- 'FCFA' par défaut, et js/utils.js:4-5 disait explicitement « aucune
-- conversion ni aucun taux de change n'est appliqué ici ». Aucune table
-- quotes, invoices, quote_lines ou invoice_lines ne porte de devise : un
-- montant n'est JAMAIS accompagné de sa monnaie en base.
--
-- Cette migration pose le minimum pour que la comptabilité à venir ne soit pas
-- fausse dès le premier document en devise étrangère :
--   1. un référentiel de devises avec leur précision réelle (ISO 4217) ;
--   2. des taux datés, par organisation, avec un sens de lecture unique ;
--   3. le triplet gelé (devise, taux, devise de base, contre-valeur) sur les
--      documents, pour qu'un taux qui bouge demain ne réécrive pas le passé.
--
-- Elle ne change AUCUN comportement visible : tous les documents existants
-- sont de fait en devise de base au taux 1, et le backfill les marque comme
-- tels.
--
-- Sens du taux — énoncé une seule fois, et gravé dans fx_rate_on()
-- ----------------------------------------------------------------
--   rate = nombre d'unités de la DEVISE DE BASE pour UNE unité de la devise
--          étrangère.
--   Base XOF, ('XOF','EUR', 655.957)  →  1 EUR = 655,957 FCFA.
-- C'est le sens qu'un utilisateur lit sur un panneau de change. Le stocker à
-- l'envers est l'erreur classique ; le nommage (base_code / quote_code) et ce
-- commentaire sont là pour la rendre difficile.
--
-- Sûreté
-- ------
-- Entièrement additive : CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- CREATE OR REPLACE, DROP POLICY IF EXISTS + CREATE POLICY. Rejouable sans
-- effet de bord. Aucun DROP de table, aucune donnée supprimée.
--
-- État d'application
-- ------------------
--   staging     (mwfmruzlonsrrfufbsyz) : [ ] à appliquer
--   production  (qmavetqcpzsfralsqxsi) : [ ] à appliquer APRÈS validation staging
--
-- Vérifier d'abord le mode de la connexion :
--   select current_setting('transaction_read_only');   -- 'off' = écriture possible


-- ── 1. Référentiel de devises ─────────────────────────────────────────────
-- Table GLOBALE, volontairement non org-scopée : une devise est un fait du
-- monde, pas une donnée de locataire. Lecture pour tout utilisateur connecté,
-- écriture réservée à l'admin plateforme.
CREATE TABLE IF NOT EXISTS public.currencies (
    code        CHAR(3) PRIMARY KEY,
    name        TEXT NOT NULL,
    symbol      TEXT NOT NULL,
    -- Nombre de décimales de la sous-unité. Doit rester synchronisé avec
    -- MINOR_UNITS dans js/finance-core.js — c'est cette valeur qui décide si
    -- un montant porte des centimes.
    minor_unit  SMALLINT NOT NULL DEFAULT 2 CHECK (minor_unit BETWEEN 0 AND 4),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE public.currencies IS
    'Référentiel ISO 4217 global (non multi-tenant). minor_unit doit rester aligné sur MINOR_UNITS de js/finance-core.js.';

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Currencies read" ON public.currencies;
CREATE POLICY "Currencies read" ON public.currencies
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Currencies admin write" ON public.currencies;
CREATE POLICY "Currencies admin write" ON public.currencies
    FOR ALL USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());

-- Le franc CFA n'a pas de sous-unité en circulation : minor_unit = 0. C'est
-- très précisément ce qui permet d'introduire les centimes pour l'euro sans
-- déplacer d'un franc les devis existants.
INSERT INTO public.currencies (code, name, symbol, minor_unit) VALUES
    ('XOF', 'Franc CFA BCEAO',     'FCFA', 0),
    ('XAF', 'Franc CFA BEAC',      'FCFA', 0),
    ('EUR', 'Euro',                '€',    2),
    ('USD', 'Dollar américain',    '$',    2),
    ('MAD', 'Dirham marocain',     'DH',   2),
    ('NGN', 'Naira',               '₦',    2),
    ('GHS', 'Cedi ghanéen',        'GH₵',  2),
    ('CAD', 'Dollar canadien',     '$',    2),
    ('GBP', 'Livre sterling',      '£',    2),
    ('CHF', 'Franc suisse',        'CHF',  2),
    ('TND', 'Dinar tunisien',      'DT',   3)
ON CONFLICT (code) DO NOTHING;


-- ── 2. Taux de change datés, par organisation ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.exchange_rates (
    id               UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    base_code        CHAR(3) NOT NULL REFERENCES public.currencies(code),
    quote_code       CHAR(3) NOT NULL REFERENCES public.currencies(code),
    -- 1 unité de quote_code vaut `rate` unités de base_code.
    -- 8 décimales : suffisant pour une base XOF face à une devise faible.
    rate             NUMERIC(18,8) NOT NULL CHECK (rate > 0),
    rate_date        DATE NOT NULL,
    source           TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import','api')),
    note             TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by       UUID REFERENCES auth.users(id),
    CONSTRAINT exchange_rates_distinct_codes CHECK (base_code <> quote_code),
    CONSTRAINT exchange_rates_unique_day UNIQUE (organization_id, base_code, quote_code, rate_date)
);

COMMENT ON COLUMN public.exchange_rates.rate IS
    'Nombre d''unités de base_code pour UNE unité de quote_code. Base XOF, quote EUR, rate 655.957 => 1 EUR = 655,957 FCFA.';

CREATE INDEX IF NOT EXISTS idx_fx_org_quote_date
    ON public.exchange_rates(organization_id, quote_code, rate_date DESC);

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Exchange rates select" ON public.exchange_rates;
CREATE POLICY "Exchange rates select" ON public.exchange_rates
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

DROP POLICY IF EXISTS "Exchange rates write" ON public.exchange_rates;
CREATE POLICY "Exchange rates write" ON public.exchange_rates
    FOR ALL USING (public.has_org_permission(organization_id, ARRAY['owner','admin']))
    WITH CHECK (public.has_org_permission(organization_id, ARRAY['owner','admin']));


-- ── 3. Taux applicable à une date ─────────────────────────────────────────
-- Renvoie le taux le plus récent à une date INFÉRIEURE OU ÉGALE à p_on :
-- jamais un taux futur, qui antidaterait une facture avec une information que
-- personne n'avait le jour de son émission.
--
-- Renvoie NULL quand aucun taux n'est connu. NULL et non 1 : un taux manquant
-- doit être demandé à l'utilisateur, jamais remplacé silencieusement, sous
-- peine de fabriquer une contre-valeur fausse et invisible.
CREATE OR REPLACE FUNCTION public.fx_rate_on(
    p_org   UUID,
    p_base  CHAR(3),
    p_quote CHAR(3),
    p_on    DATE DEFAULT CURRENT_DATE
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rate NUMERIC;
BEGIN
    IF p_org IS NULL OR p_base IS NULL OR p_quote IS NULL THEN
        RETURN NULL;
    END IF;

    -- Le demandeur doit appartenir à l'organisation : SECURITY DEFINER
    -- contourne la RLS, donc le contrôle est explicite ici.
    IF NOT EXISTS (SELECT 1 FROM public.get_my_organization_ids() g WHERE g = p_org) THEN
        RAISE EXCEPTION 'Accès refusé à cette organisation';
    END IF;

    -- Une devise vers elle-même vaut 1 : ce n'est pas un taux manquant.
    IF p_base = p_quote THEN
        RETURN 1;
    END IF;

    SELECT rate INTO v_rate
    FROM public.exchange_rates
    WHERE organization_id = p_org
      AND base_code = p_base
      AND quote_code = p_quote
      AND rate_date <= p_on
    ORDER BY rate_date DESC
    LIMIT 1;

    RETURN v_rate;   -- NULL si aucun taux connu à cette date
END;
$$;

REVOKE ALL ON FUNCTION public.fx_rate_on(UUID, CHAR(3), CHAR(3), DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fx_rate_on(UUID, CHAR(3), CHAR(3), DATE) TO authenticated;


-- ── 4. Triplet de change sur les documents ────────────────────────────────
-- currency      : la devise du document
-- fx_rate       : le taux du jour de son émission, FIGÉ
-- base_currency : un instantané de la devise de base de l'organisation
-- amount_base   : la contre-valeur, FIGÉE
--
-- base_currency est indispensable : sans lui, une organisation qui change de
-- devise de base rendrait tout son historique ininterprétable.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS currency      CHAR(3) REFERENCES public.currencies(code);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS fx_rate       NUMERIC(18,8) DEFAULT 1;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS base_currency CHAR(3) REFERENCES public.currencies(code);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS amount_base   NUMERIC(15,2);

ALTER TABLE public.quotes   ADD COLUMN IF NOT EXISTS currency      CHAR(3) REFERENCES public.currencies(code);
ALTER TABLE public.quotes   ADD COLUMN IF NOT EXISTS fx_rate       NUMERIC(18,8) DEFAULT 1;
ALTER TABLE public.quotes   ADD COLUMN IF NOT EXISTS base_currency CHAR(3) REFERENCES public.currencies(code);
ALTER TABLE public.quotes   ADD COLUMN IF NOT EXISTS amount_base   NUMERIC(15,2);

COMMENT ON COLUMN public.invoices.fx_rate IS
    'Taux figé à l''émission. Ne jamais recalculer : un document émis garde son taux historique.';

-- Un taux nul ou négatif n'a aucun sens. Contrainte posée séparément et de
-- façon rejouable (ADD COLUMN IF NOT EXISTS ne sait pas ajouter un CHECK
-- idempotent).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_fx_rate_positive') THEN
        ALTER TABLE public.invoices
            ADD CONSTRAINT invoices_fx_rate_positive CHECK (fx_rate IS NULL OR fx_rate > 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_fx_rate_positive') THEN
        ALTER TABLE public.quotes
            ADD CONSTRAINT quotes_fx_rate_positive CHECK (fx_rate IS NULL OR fx_rate > 0);
    END IF;
END $$;


-- ── 5. Refermer le trou d'immuabilité ouvert par le § 4 ───────────────────
-- protect_issued_invoice() (v6_invoices.sql:111) fige une liste EXPLICITE de
-- colonnes. Les quatre colonnes ajoutées ci-dessus n'y figurent évidemment
-- pas : sans cette republication, le triplet de change d'une facture émise
-- resterait modifiable — un trou percé par notre propre ajout.
--
-- Le reste du corps est identique à v6_invoices.sql:111-144. amount_paid,
-- status, deducted_ttc, net_to_pay_ttc, notes, due_date et sent_at restent
-- volontairement modifiables : c'est ce qui permettra au trigger de
-- règlements (socle 2/2) de tenir amount_paid à jour sans se heurter à un
-- verrou.
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
           OR NEW.client_name   IS DISTINCT FROM OLD.client_name
           OR NEW.vat_rate      IS DISTINCT FROM OLD.vat_rate
           OR NEW.total_ht      IS DISTINCT FROM OLD.total_ht
           OR NEW.total_vat     IS DISTINCT FROM OLD.total_vat
           OR NEW.total_ttc     IS DISTINCT FROM OLD.total_ttc
           OR NEW.issued_at     IS DISTINCT FROM OLD.issued_at
           OR NEW.invoice_type  IS DISTINCT FROM OLD.invoice_type
           -- Ajouts du 2026-09-18 : le triplet de change est figé lui aussi.
           OR NEW.currency      IS DISTINCT FROM OLD.currency
           OR NEW.fx_rate       IS DISTINCT FROM OLD.fx_rate
           OR NEW.base_currency IS DISTINCT FROM OLD.base_currency
           OR NEW.amount_base   IS DISTINCT FROM OLD.amount_base
        THEN
            RAISE EXCEPTION 'Facture % déjà émise : montants et identité figés. Seuls le règlement et l''annulation restent possibles.',
                COALESCE(OLD.invoice_number, OLD.id::text);
        END IF;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

-- Republié pour que ce fichier soit autonome et rejouable.
DROP TRIGGER IF EXISTS trg_protect_issued_invoice ON public.invoices;
CREATE TRIGGER trg_protect_issued_invoice
    BEFORE UPDATE OR DELETE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.protect_issued_invoice();


-- ── 6. Backfill des documents existants ───────────────────────────────────
-- Aucun document existant n'est multidevise : tous sont, de fait, en devise de
-- base au taux 1. On le rend explicite plutôt que de laisser des NULL que le
-- code devrait réinterpréter à chaque lecture.
--
-- La devise de référence est celle de company_settings (c'est elle que lit
-- déjà l'Edge Function send-payment-reminders, index.ts:167), traduite en ISO.
-- Le repli final sur 'XOF' correspond au DEFAULT 'FCFA' de la colonne.
--
-- Idempotent : WHERE currency IS NULL. Rejouer ne touche plus rien.
--
-- ⚠️ Le trigger du § 5 fige currency/fx_rate/base_currency/amount_base dès que
-- status <> 'draft'. Or ici OLD vaut NULL et NEW vaut 'XOF' : c'est bien un
-- changement, et le trigger refuserait. On le désactive donc le temps du
-- backfill — l'unique cas légitime de le faire : on ne modifie aucun montant,
-- on écrit pour la première fois une information qui a toujours été implicite.
-- Le § 3 des contrôles ci-dessous vérifie qu'il a bien été réactivé.
ALTER TABLE public.invoices DISABLE TRIGGER trg_protect_issued_invoice;

UPDATE public.invoices i
SET currency      = COALESCE(i.currency,      c.iso),
    fx_rate       = COALESCE(i.fx_rate,       1),
    base_currency = COALESCE(i.base_currency, c.iso),
    amount_base   = COALESCE(i.amount_base,   i.total_ttc)
FROM (
    SELECT o.id AS org_id,
           CASE UPPER(COALESCE(NULLIF(TRIM(cs.currency), ''), 'FCFA'))
               WHEN 'FCFA'   THEN 'XOF'
               WHEN 'F CFA'  THEN 'XOF'
               WHEN 'CFA'    THEN 'XOF'
               WHEN 'EURO'   THEN 'EUR'
               WHEN 'DOLLAR' THEN 'USD'
               ELSE UPPER(COALESCE(NULLIF(TRIM(cs.currency), ''), 'XOF'))
           END AS iso
    FROM public.organizations o
    LEFT JOIN public.company_settings cs ON cs.organization_id = o.id
) c
WHERE c.org_id = i.organization_id
  AND i.currency IS NULL
  -- Ne jamais écrire un code que le référentiel ne connaît pas : mieux vaut
  -- laisser NULL et traiter le cas à la main que de faire échouer la FK.
  AND EXISTS (SELECT 1 FROM public.currencies cur WHERE cur.code = c.iso);

ALTER TABLE public.invoices ENABLE TRIGGER trg_protect_issued_invoice;

UPDATE public.quotes q
SET currency      = COALESCE(q.currency,      c.iso),
    fx_rate       = COALESCE(q.fx_rate,       1),
    base_currency = COALESCE(q.base_currency, c.iso),
    amount_base   = COALESCE(q.amount_base,   q.total_ttc_consomme)
FROM (
    SELECT o.id AS org_id,
           CASE UPPER(COALESCE(NULLIF(TRIM(cs.currency), ''), 'FCFA'))
               WHEN 'FCFA'   THEN 'XOF'
               WHEN 'F CFA'  THEN 'XOF'
               WHEN 'CFA'    THEN 'XOF'
               WHEN 'EURO'   THEN 'EUR'
               WHEN 'DOLLAR' THEN 'USD'
               ELSE UPPER(COALESCE(NULLIF(TRIM(cs.currency), ''), 'XOF'))
           END AS iso
    FROM public.organizations o
    LEFT JOIN public.company_settings cs ON cs.organization_id = o.id
) c
WHERE c.org_id = q.organization_id
  AND q.currency IS NULL
  AND EXISTS (SELECT 1 FROM public.currencies cur WHERE cur.code = c.iso);


-- ── Contrôles post-migration ──────────────────────────────────────────────
-- À exécuter ET À LIRE, pas seulement à lancer.
--
-- 1) Le référentiel est en place, et le franc CFA n'a pas de centimes :
--      select count(*) from public.currencies;                       -- 11
--      select code, minor_unit from public.currencies order by code;
--         -- XOF et XAF DOIVENT valoir 0. Autre valeur = les montants FCFA
--         -- prendront des centimes et les 7 étalons casseront.
--
-- 2) Plus aucun document sans devise :
--      select count(*) from public.invoices where currency is null;  -- 0
--      select count(*) from public.quotes   where currency is null;  -- 0
--      -- Un reliquat > 0 signale une organisation dont
--      -- company_settings.currency porte une valeur hors référentiel.
--      -- La lister et décider à la main :
--      --   select distinct cs.currency
--      --   from public.company_settings cs
--      --   join public.invoices i on i.organization_id = cs.organization_id
--      --   where i.currency is null;
--
-- 3) Le trigger d'immuabilité est bien RÉACTIVÉ (le § 6 le désactive) :
--      select tgenabled from pg_trigger where tgname = 'trg_protect_issued_invoice';
--      -- attendu : 'O'. Si 'D', le backfill s'est interrompu en cours —
--      -- RÉACTIVER IMMÉDIATEMENT :
--      --   alter table public.invoices enable trigger trg_protect_issued_invoice;
--
-- 4) Le triplet est réellement figé sur une facture émise. Cette requête DOIT
--    lever une exception ; si elle passe, le § 5 n'a pas été appliqué :
--      update public.invoices set currency = 'EUR'
--      where status <> 'draft' and id = (select id from public.invoices where status <> 'draft' limit 1);
--      -- attendu : ERROR « montants et identité figés »
--
-- 5) Le sens du taux n'est pas inversé. Après avoir saisi un taux de test sur
--    staging (1 EUR = 655,957 FCFA) :
--      insert into public.exchange_rates (organization_id, base_code, quote_code, rate, rate_date)
--      values ('<org-uuid>', 'XOF', 'EUR', 655.957, CURRENT_DATE);
--      select public.fx_rate_on('<org-uuid>', 'XOF', 'EUR', CURRENT_DATE);
--      -- attendu : 655.957 (et non 0.00152...)
--
-- 6) Aucune nouvelle alerte de sécurité : passer get_advisors (MCP Supabase)
--    et vérifier qu'aucune table nouvellement créée n'est signalée sans RLS.
