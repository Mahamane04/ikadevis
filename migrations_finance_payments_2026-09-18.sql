-- IKADEVIS — socle Finances (2/2) : les règlements deviennent des données.
--
-- Contexte
-- --------
-- Il n'existe aucune table de règlements. Depuis le 2026-09-10, le détail des
-- paiements d'une facture est sérialisé dans un commentaire HTML À L'INTÉRIEUR
-- de invoices.notes (index_jsx.js:10196-10198) :
--
--     <!--PAYMENTS:{encodeURIComponent(JSON.stringify(tableau))}-->
--
-- chaque entrée ayant la forme {id, date, montant, mode, reference, note,
-- createdAt}. Seul l'agrégat amount_paid est une vraie colonne. Conséquence :
-- aucune requête SQL ne peut répondre à « combien ai-je encaissé en août, et
-- par quel moyen ? », aucun rapprochement bancaire n'est possible, et une
-- note éditée à la main peut corrompre des règlements.
--
-- Ce fichier porte les TEMPS 1 et 2 de la migration décidée avec
-- l'utilisateur (« double écriture sur 3 à 4 semaines ») :
--
--   T1  ce fichier   tables + outil de reprise, contrôle à blanc   ancien code intact
--   T2  ce fichier   reprise réelle, idempotente                   ancien code intact
--   T3  application  double écriture : notes ET table              ancien code intact
--   T4  application  lecture depuis la table                       (plus tard)
--   T5  migrations_finance_payments_gel_T5.sql                     (plus tard)
--
-- Pourquoi PAS de trigger qui recalcule amount_paid à ce stade
-- ------------------------------------------------------------
-- Le service worker peut servir un app.compiled.js périmé pendant des jours.
-- Un navigateur resté sur l'ancien code continue d'écrire amount_paid et le
-- marqueur dans notes, SANS toucher à cette table. Un trigger qui recalculerait
-- amount_paid à partir de la table écraserait alors silencieusement ce
-- règlement-là au prochain paiement saisi ailleurs : un encaissement réel
-- disparaîtrait du solde. Pendant la transition, notes + amount_paid restent
-- donc la source de vérité, et cette table en est le miroir. Le trigger est
-- posé au T5, quand plus aucun client n'écrit dans notes.
--
-- Un miroir peut rater une écriture (réseau, ancien client). Ce n'est pas
-- grave : backfill_payments_from_notes_v1 est idempotente et se rejoue autant
-- de fois que nécessaire pour rattraper l'écart. controle_payments_miroir_v1
-- mesure cet écart à tout moment.
--
-- Dépendance : migrations_finance_socle_2026-09-18.sql (table currencies,
-- colonnes invoices.currency / fx_rate / base_currency).
--
-- Sûreté
-- ------
-- Additive. Aucune ligne de invoices n'est modifiée par ce fichier : ni
-- amount_paid, ni status, ni notes. Rollback complet à tout moment :
--     DELETE FROM public.payments WHERE legacy_payment_key IS NOT NULL;
-- (les imputations suivent par ON DELETE CASCADE).
--
-- État d'application
-- ------------------
--   staging     (mwfmruzlonsrrfufbsyz) : [ ] à appliquer
--   production  (qmavetqcpzsfralsqxsi) : [ ] à appliquer APRÈS validation staging
--
-- Mode d'emploi, dans l'ordre, SANS sauter d'étape :
--   1. appliquer ce fichier ;
--   2. select public.backfill_payments_from_notes_v1(null, true);   -- à blanc
--        → lire le rapport. paiements_illisibles = 0 ET
--          factures_en_ecart = 0 sont les conditions pour continuer.
--   3. select public.backfill_payments_from_notes_v1(null, false);  -- réel
--   4. select public.controle_payments_miroir_v1(null);             -- écart = 0


-- ── 1. Les règlements ─────────────────────────────────────────────────────
-- Un règlement est un MOUVEMENT d'argent. Il n'est pas forcément « le paiement
-- d'une facture » : un acompte reçu avant facture, un remboursement ou un
-- trop-perçu n'en sont pas. D'où la séparation mouvement / imputation.
CREATE TABLE IF NOT EXISTS public.payments (
    id                 UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    organization_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    direction          TEXT NOT NULL DEFAULT 'in' CHECK (direction IN ('in','out')),
    payment_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    amount             NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    currency           CHAR(3) NOT NULL REFERENCES public.currencies(code),
    fx_rate            NUMERIC(18,8) NOT NULL DEFAULT 1 CHECK (fx_rate > 0),
    base_currency      CHAR(3) NOT NULL REFERENCES public.currencies(code),
    amount_base        NUMERIC(15,2) NOT NULL,
    -- Famille normalisée, pour les rapports…
    method             TEXT NOT NULL DEFAULT 'other' CHECK (method IN
                       ('cash','bank_transfer','check','card','mobile_money','compensation','other')),
    -- …et le mode exact saisi dans l'application (wave, orange_money,
    -- moov_money…), pour ne rien perdre de ce que l'utilisateur a choisi.
    method_detail      TEXT,
    -- Compte d'encaissement. La table des comptes financiers arrive à l'étape
    -- suivante du chantier ; la clé étrangère sera posée à ce moment-là.
    account_id         UUID,
    client_id          UUID REFERENCES public.clients(id)  ON DELETE SET NULL,
    project_id         UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    reference          TEXT,
    note               TEXT,
    status             TEXT NOT NULL DEFAULT 'confirmed'
                       CHECK (status IN ('pending','confirmed','bounced','cancelled')),
    -- L'identifiant du règlement tel qu'il vivait dans invoices.notes
    -- (« pay_<horodatage>_<aléa> »). C'est lui qui rend la reprise et la
    -- double écriture idempotentes : un même règlement ne peut exister deux
    -- fois, qu'il vienne de la reprise ou de l'application.
    legacy_payment_key TEXT,
    source             TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app','backfill')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by         UUID REFERENCES auth.users(id),
    CONSTRAINT payments_legacy_key_unique UNIQUE (organization_id, legacy_payment_key)
);

COMMENT ON TABLE public.payments IS
    'Mouvements d''argent. Pendant la transition (jusqu''au T5), miroir de invoices.notes : amount_paid reste calculé par l''application.';

CREATE INDEX IF NOT EXISTS idx_payments_org_date ON public.payments(organization_id, payment_date DESC);


-- ── 2. Les imputations ────────────────────────────────────────────────────
-- Ce qu'un règlement solde. Un règlement peut couvrir plusieurs factures ;
-- une facture peut recevoir plusieurs règlements. Un règlement sans imputation
-- est un acompte reçu, encore à imputer.
CREATE TABLE IF NOT EXISTS public.payment_allocations (
    id               UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    payment_id       UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
    invoice_id       UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
    -- Réservé aux factures fournisseurs (étape Dépenses) ; FK posée alors.
    expense_id       UUID,
    amount           NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    amount_base      NUMERIC(15,2) NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT payment_allocations_one_target CHECK (num_nonnulls(invoice_id, expense_id) = 1)
);

CREATE INDEX IF NOT EXISTS idx_alloc_invoice ON public.payment_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_alloc_payment ON public.payment_allocations(payment_id);


-- ── 3. Droits ─────────────────────────────────────────────────────────────
-- Mêmes rôles que la mise à jour d'une facture (v6_invoices.sql:249) : qui
-- peut enregistrer un règlement sur une facture peut écrire son miroir.
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payments select" ON public.payments;
CREATE POLICY "Payments select" ON public.payments
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

DROP POLICY IF EXISTS "Payments write" ON public.payments;
CREATE POLICY "Payments write" ON public.payments
    FOR ALL USING (public.has_org_permission(organization_id, ARRAY['owner','admin','estimator','commercial']))
    WITH CHECK (public.has_org_permission(organization_id, ARRAY['owner','admin','estimator','commercial']));

DROP POLICY IF EXISTS "Payment allocations select" ON public.payment_allocations;
CREATE POLICY "Payment allocations select" ON public.payment_allocations
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

DROP POLICY IF EXISTS "Payment allocations write" ON public.payment_allocations;
CREATE POLICY "Payment allocations write" ON public.payment_allocations
    FOR ALL USING (public.has_org_permission(organization_id, ARRAY['owner','admin','estimator','commercial']))
    WITH CHECK (public.has_org_permission(organization_id, ARRAY['owner','admin','estimator','commercial']));


-- ── 4. Décodage d'encodeURIComponent ──────────────────────────────────────
-- Postgres n'a pas de urldecode. Les séquences %XX sont assemblées en OCTETS,
-- puis le tout est interprété en UTF-8 : c'est ce qui fait survivre « é »
-- (%C3%A9) et l'apostrophe typographique « ’ » (%E2%80%99), le cas nominal du
-- parc (« Règlement à réception »). Une séquence invalide lève une exception,
-- que l'appelant rattrape et compte comme illisible.
CREATE OR REPLACE FUNCTION public.url_decode(p_in TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
    v_octets BYTEA := ''::bytea;
    v_i INT := 1;
    v_n INT := length(p_in);
    v_c TEXT;
BEGIN
    WHILE v_i <= v_n LOOP
        v_c := substr(p_in, v_i, 1);
        IF v_c = '%' AND v_i + 2 <= v_n AND substr(p_in, v_i + 1, 2) ~ '^[0-9A-Fa-f]{2}$' THEN
            v_octets := v_octets || decode(substr(p_in, v_i + 1, 2), 'hex');
            v_i := v_i + 3;
        ELSE
            v_octets := v_octets || convert_to(v_c, 'UTF8');
            v_i := v_i + 1;
        END IF;
    END LOOP;
    RETURN convert_from(v_octets, 'UTF8');
END;
$$;


-- ── 5. Mode de règlement applicatif → famille normalisée ──────────────────
-- Vocabulaire de MODES_PAIEMENT_BTP (index_jsx.js:274-282). Doit rester
-- aligné sur familleModePaiement() dans index_jsx.js (double écriture T3).
CREATE OR REPLACE FUNCTION public.payment_method_from_app(p_mode TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE lower(coalesce(p_mode, ''))
        WHEN 'virement'     THEN 'bank_transfer'
        WHEN 'especes'      THEN 'cash'
        WHEN 'cheque'       THEN 'check'
        WHEN 'carte'        THEN 'card'
        WHEN 'wave'         THEN 'mobile_money'
        WHEN 'orange_money' THEN 'mobile_money'
        WHEN 'moov_money'   THEN 'mobile_money'
        ELSE 'other'
    END;
$$;


-- ── 6. Reprise des règlements enfouis dans invoices.notes ─────────────────
-- p_org     : une organisation, ou NULL pour toutes.
-- p_dry_run : TRUE (défaut) = compte et rapporte SANS RIEN ÉCRIRE.
--
-- Reproduit à l'identique la lecture de l'application (index_jsx.js:14906) :
-- seul le PREMIER marqueur d'une note est lu, parce que c'est le seul que
-- l'utilisateur a jamais vu. Les marqueurs suivants sont comptés, pas repris.
--
-- Idempotente : un règlement déjà présent (même legacy_payment_key) est
-- ignoré. Rejouer dix fois donne le même état.
--
-- Réservée à l'exécution depuis l'éditeur SQL (rôle postgres) : aucun GRANT
-- à authenticated. Un utilisateur de l'application ne peut pas l'appeler.
CREATE OR REPLACE FUNCTION public.backfill_payments_from_notes_v1(
    p_org     UUID    DEFAULT NULL,
    p_dry_run BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r               RECORD;
    v_charge        TEXT;
    v_json          JSONB;
    v_elem          JSONB;
    v_ord           INT;
    v_montant       NUMERIC;
    v_cle           TEXT;
    v_date          DATE;
    v_payment_id    UUID;
    v_somme         NUMERIC;
    v_nb_marqueurs  INT;

    c_factures        INT := 0;
    c_trouves         INT := 0;
    c_crees           INT := 0;
    c_deja            INT := 0;
    c_illisibles      INT := 0;
    c_entrees_rejet   INT := 0;
    c_multi           INT := 0;
    c_ecarts          INT := 0;
    v_somme_totale    NUMERIC := 0;
    v_detail_ecarts   JSONB := '[]'::jsonb;
    v_detail_illis    JSONB := '[]'::jsonb;
BEGIN
    -- Garde interne, en plus du REVOKE ci-dessous : cette fonction parcourt
    -- TOUTES les organisations. Appelée depuis l'application, elle ferait
    -- fuiter numéros de facture et montants d'un locataire à l'autre.
    -- Depuis l'éditeur SQL, auth.uid() est NULL : l'appel est autorisé.
    IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Réservé à l''administration de la plateforme (éditeur SQL)';
    END IF;

    FOR r IN
        SELECT i.id, i.organization_id, i.notes, i.amount_paid, i.client_id, i.project_id,
               i.issued_at, i.created_at, i.invoice_number,
               COALESCE(i.currency, 'XOF')                            AS currency,
               COALESCE(i.base_currency, COALESCE(i.currency, 'XOF')) AS base_currency,
               COALESCE(i.fx_rate, 1)                                 AS fx_rate
        FROM public.invoices i
        WHERE i.notes LIKE '%<!--PAYMENTS:%'
          AND (p_org IS NULL OR i.organization_id = p_org)
        ORDER BY i.organization_id, i.created_at
    LOOP
        c_factures := c_factures + 1;
        v_somme := 0;

        SELECT count(*) INTO v_nb_marqueurs
        FROM regexp_matches(r.notes, '<!--PAYMENTS:(.*?)-->', 'g');
        IF v_nb_marqueurs > 1 THEN c_multi := c_multi + 1; END IF;

        v_charge := substring(r.notes FROM '<!--PAYMENTS:(.*?)-->');

        BEGIN
            v_json := public.url_decode(v_charge)::jsonb;
        EXCEPTION WHEN OTHERS THEN
            c_illisibles := c_illisibles + 1;
            v_detail_illis := v_detail_illis || jsonb_build_object(
                'invoice_id', r.id, 'numero', r.invoice_number, 'erreur', SQLERRM);
            CONTINUE;
        END;

        IF v_json IS NULL OR jsonb_typeof(v_json) <> 'array' THEN
            c_illisibles := c_illisibles + 1;
            v_detail_illis := v_detail_illis || jsonb_build_object(
                'invoice_id', r.id, 'numero', r.invoice_number, 'erreur', 'charge non tableau');
            CONTINUE;
        END IF;

        FOR v_elem, v_ord IN
            SELECT t.e, t.o::int FROM jsonb_array_elements(v_json) WITH ORDINALITY AS t(e, o)
        LOOP
            IF jsonb_typeof(v_elem) <> 'object' THEN
                c_entrees_rejet := c_entrees_rejet + 1;
                CONTINUE;
            END IF;

            -- Montant : nombre ou chaîne numérique ; tout le reste est rejeté.
            v_montant := NULL;
            IF jsonb_typeof(v_elem->'montant') = 'number' THEN
                v_montant := (v_elem->>'montant')::numeric;
            ELSIF (v_elem->>'montant') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' THEN
                v_montant := trim(v_elem->>'montant')::numeric;
            END IF;
            IF v_montant IS NULL OR v_montant <= 0 THEN
                c_entrees_rejet := c_entrees_rejet + 1;
                CONTINUE;
            END IF;

            c_trouves := c_trouves + 1;
            v_somme := v_somme + v_montant;

            -- Clé : l'identifiant d'origine. Une entrée sans identifiant (les
            -- toutes premières versions) reçoit une clé déterministe, pour que
            -- la reprise reste idempotente.
            v_cle := COALESCE(NULLIF(v_elem->>'id', ''), r.id::text || ':' || v_ord::text);

            -- Date : champ `date` (AAAA-MM-JJ), sinon createdAt, sinon la
            -- date d'émission. Jamais de cast aveugle qui ferait échouer tout
            -- le lot sur une seule date mal formée.
            v_date := CASE
                WHEN (v_elem->>'date') ~ '^\d{4}-\d{2}-\d{2}' THEN substr(v_elem->>'date', 1, 10)::date
                WHEN (v_elem->>'createdAt') ~ '^\d{4}-\d{2}-\d{2}' THEN substr(v_elem->>'createdAt', 1, 10)::date
                ELSE COALESCE(r.issued_at::date, r.created_at::date, CURRENT_DATE)
            END;

            IF EXISTS (SELECT 1 FROM public.payments p
                       WHERE p.organization_id = r.organization_id AND p.legacy_payment_key = v_cle) THEN
                c_deja := c_deja + 1;
                CONTINUE;
            END IF;

            IF NOT p_dry_run THEN
                v_payment_id := NULL;
                INSERT INTO public.payments (
                    organization_id, direction, payment_date, amount, currency, fx_rate,
                    base_currency, amount_base, method, method_detail, client_id, project_id,
                    reference, note, legacy_payment_key, source
                ) VALUES (
                    r.organization_id, 'in', v_date, v_montant, r.currency, r.fx_rate,
                    r.base_currency, round(v_montant * r.fx_rate, 2),
                    public.payment_method_from_app(v_elem->>'mode'), NULLIF(v_elem->>'mode', ''),
                    r.client_id, r.project_id,
                    NULLIF(v_elem->>'reference', ''), NULLIF(v_elem->>'note', ''),
                    v_cle, 'backfill'
                )
                ON CONFLICT (organization_id, legacy_payment_key) DO NOTHING
                RETURNING id INTO v_payment_id;

                IF v_payment_id IS NOT NULL THEN
                    INSERT INTO public.payment_allocations (organization_id, payment_id, invoice_id, amount, amount_base)
                    VALUES (r.organization_id, v_payment_id, r.id, v_montant, round(v_montant * r.fx_rate, 2));
                    c_crees := c_crees + 1;
                ELSE
                    c_deja := c_deja + 1;
                END IF;
            END IF;
        END LOOP;

        v_somme_totale := v_somme_totale + v_somme;

        -- Le contrôle qui compte : la somme lue dans le marqueur doit égaler
        -- amount_paid. Un écart signifie que le parseur et l'application ne
        -- lisent pas la même chose — il faut comprendre avant de reprendre.
        IF round(v_somme, 2) <> round(COALESCE(r.amount_paid, 0), 2) THEN
            c_ecarts := c_ecarts + 1;
            IF jsonb_array_length(v_detail_ecarts) < 50 THEN
                v_detail_ecarts := v_detail_ecarts || jsonb_build_object(
                    'invoice_id', r.id, 'numero', r.invoice_number,
                    'somme_marqueur', v_somme, 'amount_paid', r.amount_paid);
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'mode',                     CASE WHEN p_dry_run THEN 'a_blanc' ELSE 'reel' END,
        'factures_scannees',        c_factures,
        'paiements_trouves',        c_trouves,
        'paiements_crees',          c_crees,
        'paiements_deja_presents',  c_deja,
        'paiements_illisibles',     c_illisibles,
        'entrees_rejetees',         c_entrees_rejet,
        'factures_multi_marqueurs', c_multi,
        'somme_parsee',             v_somme_totale,
        'factures_en_ecart',        c_ecarts,
        'detail_ecarts',            v_detail_ecarts,
        'detail_illisibles',        v_detail_illis
    );
END;
$$;

-- ⚠️ REVOKE FROM PUBLIC NE SUFFIT PAS sur Supabase : les privilèges par
-- défaut du projet accordent EXECUTE à anon et authenticated sur TOUTE
-- nouvelle fonction du schéma public. Sans le second REVOKE, n'importe quel
-- utilisateur connecté pourrait l'appeler par supabase.rpc(). Mis en évidence
-- par scratch/test_finance_sql_migrations.mjs, qui reproduit ces défauts.
REVOKE ALL ON FUNCTION public.backfill_payments_from_notes_v1(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_payments_from_notes_v1(UUID, BOOLEAN) FROM anon, authenticated;


-- ── 7. Contrôle du miroir ─────────────────────────────────────────────────
-- Pour chaque facture émise : amount_paid (la vérité pendant la transition)
-- comparé à la somme des imputations de la table. Tant que l'écart n'est pas
-- nul partout, le T4 (bascule en lecture) est interdit.
CREATE OR REPLACE FUNCTION public.controle_payments_miroir_v1(p_org UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_resultat JSONB;
BEGIN
    -- Même garde que la reprise : lecture inter-organisations.
    IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Réservé à l''administration de la plateforme (éditeur SQL)';
    END IF;

    WITH par_facture AS (
        SELECT i.id, i.invoice_number, i.amount_paid,
               COALESCE((SELECT sum(a.amount) FROM public.payment_allocations a
                         JOIN public.payments p ON p.id = a.payment_id
                         WHERE a.invoice_id = i.id AND p.status = 'confirmed'), 0) AS somme_table
        FROM public.invoices i
        WHERE i.status <> 'draft'
          AND (p_org IS NULL OR i.organization_id = p_org)
    )
    SELECT jsonb_build_object(
        'factures_controlees', count(*),
        'factures_en_ecart',   count(*) FILTER (WHERE round(amount_paid, 2) <> round(somme_table, 2)),
        'detail', COALESCE(jsonb_agg(jsonb_build_object(
                      'numero', invoice_number, 'amount_paid', amount_paid, 'somme_table', somme_table))
                  FILTER (WHERE round(amount_paid, 2) <> round(somme_table, 2)), '[]'::jsonb)
    )
    INTO v_resultat
    FROM par_facture;

    RETURN v_resultat;
END;
$$;

REVOKE ALL ON FUNCTION public.controle_payments_miroir_v1(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.controle_payments_miroir_v1(UUID) FROM anon, authenticated;
