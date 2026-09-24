-- IKADEVIS — Abonnements SaaS : source de vérité côté serveur
-- 2026-09-24
--
-- POURQUOI CETTE MIGRATION
-- ------------------------
-- Jusqu'ici l'abonnement d'une organisation vivait dans la seule clé
-- localStorage `ikadevis_subscription`, écrite par le navigateur. Deux
-- conséquences, constatées en production le 2026-09-24 :
--
--   1. Le client s'accordait lui-même la formule STANDARD au bout de 20 s
--      de sondage infructueux (`checks >= maxChecks` → applyPlanUpgrade),
--      sans qu'aucun franc n'ait quitté le compte Mobile Money. La
--      passerelle SasPay n'avait même jamais été appelée : faute de clé
--      API, tout le service basculait en simulation silencieuse.
--   2. Même une fois (1) corrigé, n'importe qui pouvait ouvrir la console
--      et écrire `{"planId":"entreprise","status":"active"}` dans
--      localStorage pour débloquer la formule la plus chère.
--
-- La correction structurelle : l'abonnement devient une ligne Postgres que
-- le navigateur ne peut que LIRE. Seule l'Edge Function `saspay-proxy`,
-- porteuse du service_role, l'écrit — et uniquement après que SasPay a
-- répondu PAID sur un identifiant de paiement qu'elle a elle-même créé.
--
-- Additive, sans réécriture destructive (cf. CLAUDE.md § Schéma Supabase).
-- Ordre d'application : staging d'abord, production ensuite.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. ABONNEMENT COURANT (une ligne par organisation)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.subscriptions (
    organization_id      UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    plan_id              TEXT NOT NULL DEFAULT 'starter',
    status               TEXT NOT NULL DEFAULT 'trial'
                         CHECK (status IN ('trial', 'active', 'expired', 'cancelled')),
    billing_cycle        TEXT CHECK (billing_cycle IN ('monthly', 'yearly')),

    -- Essai Starter : 14 jours, posés à la création de la ligne
    trial_started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trial_ends_at        TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),

    -- Période payée en cours
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,

    -- Dernier règlement ayant ouvert ou prolongé la période
    last_payment_id      UUID,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.subscriptions IS
    'Abonnement SaaS par organisation. Lecture seule pour le client : aucune policy d''écriture n''existe, seul le service_role (Edge Function saspay-proxy) peut insérer ou mettre à jour.';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. JOURNAL DES RÈGLEMENTS D'ABONNEMENT
-- ═══════════════════════════════════════════════════════════════════════
--
-- Une ligne est créée en `pending` au moment où l'Edge Function demande le
-- débit à SasPay, AVANT toute redirection. C'est elle qui lie un
-- identifiant de paiement SasPay à une organisation et à un montant :
-- sans elle, un client pourrait présenter l'identifiant d'un paiement de
-- 100 F pour débloquer une formule à 49 000 F.

CREATE TABLE IF NOT EXISTS public.subscription_payments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    plan_id             TEXT NOT NULL,
    billing_cycle       TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),

    -- Montant arrêté par le SERVEUR d'après son propre catalogue, jamais
    -- d'après ce que le navigateur a envoyé.
    amount              NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    currency            TEXT NOT NULL DEFAULT 'XOF',

    provider            TEXT NOT NULL DEFAULT 'saspay',
    provider_kind       TEXT NOT NULL DEFAULT 'softpay'
                        CHECK (provider_kind IN ('softpay', 'checkout')),
    provider_payment_id TEXT,

    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'expired')),

    customer_phone      TEXT,
    network             TEXT,
    country             TEXT,

    initiated_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    raw_response        JSONB,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at             TIMESTAMPTZ,
    applied_at          TIMESTAMPTZ,   -- horodatage de l'extension d'abonnement

    -- Garde-fou d'idempotence : un même paiement SasPay ne peut jamais
    -- créditer deux fois la même organisation.
    UNIQUE (provider, provider_payment_id)
);

COMMENT ON TABLE public.subscription_payments IS
    'Journal des règlements d''abonnement SaaS. Créé en pending par l''Edge Function avant l''appel SasPay, passé à paid uniquement sur confirmation PAID de la passerelle. applied_at garantit qu''un paiement ne prolonge l''abonnement qu''une seule fois.';

CREATE INDEX IF NOT EXISTS idx_subscription_payments_org
    ON public.subscription_payments (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_provider_id
    ON public.subscription_payments (provider_payment_id)
    WHERE provider_payment_id IS NOT NULL;

-- Lien du dernier règlement appliqué (posé après coup pour éviter une
-- dépendance circulaire entre les deux CREATE TABLE).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_last_payment_fk'
    ) THEN
        ALTER TABLE public.subscriptions
            ADD CONSTRAINT subscriptions_last_payment_fk
            FOREIGN KEY (last_payment_id)
            REFERENCES public.subscription_payments(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. TRIGGER updated_at
-- ═══════════════════════════════════════════════════════════════════════

-- set_updated_at() est déclarée dans v5_schema.sql, mais un contrôle du
-- 2026-09-24 l'a trouvée ABSENTE de staging (présente en production) : les
-- deux bases ont divergé. La recréer ici rend cette migration autonome, et
-- l'opération est sans effet là où elle existe déjà — le corps est identique.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════
-- 4. RLS — LECTURE SEULE POUR LE CLIENT
-- ═══════════════════════════════════════════════════════════════════════
--
-- Point central de cette migration : AUCUNE policy INSERT / UPDATE /
-- DELETE n'est créée. Le service_role contourne la RLS, le client non.
-- Un `supabase.from('subscriptions').update(...)` depuis le navigateur
-- échoue donc toujours, quel que soit le rôle de l'utilisateur.

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_select_membres" ON public.subscriptions;
CREATE POLICY "subscriptions_select_membres" ON public.subscriptions
    FOR SELECT USING (
        public.has_org_permission(organization_id, ARRAY['owner', 'admin', 'commercial', 'estimator', 'viewer'])
    );

-- Le détail financier des règlements reste réservé aux décideurs.
DROP POLICY IF EXISTS "subscription_payments_select_admins" ON public.subscription_payments;
CREATE POLICY "subscription_payments_select_admins" ON public.subscription_payments
    FOR SELECT USING (
        public.has_org_permission(organization_id, ARRAY['owner', 'admin'])
    );

-- ═══════════════════════════════════════════════════════════════════════
-- 5. PRIVILÈGES (moindre privilège, cohérent avec v5_schema.sql § 4)
-- ═══════════════════════════════════════════════════════════════════════

REVOKE ALL ON public.subscriptions FROM anon, authenticated;
REVOKE ALL ON public.subscription_payments FROM anon, authenticated;

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT SELECT ON public.subscription_payments TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. AMORÇAGE DES ORGANISATIONS EXISTANTES
-- ═══════════════════════════════════════════════════════════════════════
--
-- Les comptes déjà créés n'ont pas de ligne d'abonnement. On leur ouvre un
-- essai Starter de 14 jours à compter de MAINTENANT (et non de leur date
-- d'inscription) : personne ne doit se retrouver expiré du seul fait de
-- cette migration.

INSERT INTO public.subscriptions (organization_id, plan_id, status, trial_started_at, trial_ends_at)
SELECT o.id, 'starter', 'trial', NOW(), NOW() + INTERVAL '14 days'
FROM public.organizations o
WHERE NOT EXISTS (
    SELECT 1 FROM public.subscriptions s WHERE s.organization_id = o.id
);

-- ═══════════════════════════════════════════════════════════════════════
-- 7. CRÉATION AUTOMATIQUE POUR LES NOUVELLES ORGANISATIONS
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.creer_abonnement_essai()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.subscriptions (organization_id, plan_id, status, trial_started_at, trial_ends_at)
    VALUES (NEW.id, 'starter', 'trial', NOW(), NOW() + INTERVAL '14 days')
    ON CONFLICT (organization_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organisation_abonnement_essai ON public.organizations;
CREATE TRIGGER trg_organisation_abonnement_essai
    AFTER INSERT ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.creer_abonnement_essai();

-- ═══════════════════════════════════════════════════════════════════════
-- 8. VUE DE CONTRÔLE (diagnostic manuel, pas d'usage applicatif)
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_abonnements_etat WITH (security_invoker = true) AS
SELECT
    s.organization_id,
    o.name AS organisation,
    s.plan_id,
    s.status,
    s.billing_cycle,
    s.trial_ends_at,
    s.current_period_end,
    CASE
        WHEN s.status = 'active'  AND s.current_period_end > NOW() THEN 'actif'
        WHEN s.status = 'trial'   AND s.trial_ends_at       > NOW() THEN 'essai'
        ELSE 'expiré'
    END AS etat_effectif,
    (SELECT COUNT(*) FROM public.subscription_payments p
      WHERE p.organization_id = s.organization_id AND p.status = 'paid') AS reglements_payes
FROM public.subscriptions s
JOIN public.organizations o ON o.id = s.organization_id;

-- Diagnostic administratif uniquement : les droits par défaut Supabase
-- ne doivent pas rendre cette vue lisible par les clients ou les anonymes.
REVOKE ALL ON public.v_abonnements_etat FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_abonnements_etat TO service_role;
