-- IKADEVIS — Rappels automatiques de paiement (item 7, dernier du plan
-- d'enrichissement des Paramètres). Explicitement sans n8n (décision de
-- l'utilisateur) : tout reste dans l'écosystème Supabase/ikadevis, pour que
-- les rappels d'ikadevis ne dépendent jamais d'une instance n8n externe.
--
-- Trois seuils : j-3 (rappel avant échéance), j+3 et j+7 (relances après
-- échéance). Déclenchés par pg_cron, envoyés par l'Edge Function
-- send-payment-reminders (supabase/functions/send-payment-reminders/index.ts)
-- via l'API Resend.
--
-- ── Ordre d'application ────────────────────────────────────────────────
--   1. Étapes 1-2 ci-dessous : déjà appliquées et validées sur STAGING
--      (ikadevis-staging / mwfmruzlonsrrfufbsyz) le 2026-09-07 — table,
--      extensions, requêtes et déduplication testées avec des données
--      fictives puis nettoyées.
--   2. Déployer l'Edge Function send-payment-reminders sur ce projet
--      (`supabase functions deploy send-payment-reminders --project-ref <ref>`).
--   3. Poser les secrets de la fonction (jamais dans ce fichier, jamais
--      commités) :
--        supabase secrets set RESEND_API_KEY=re_xxx --project-ref <ref>
--        supabase secrets set REMINDER_FROM_EMAIL="ikadevis <rappels@ikadevis.com>" --project-ref <ref>
--      (le domaine d'expédition doit être vérifié dans Resend au préalable)
--   4. Étape 3 ci-dessous, à exécuter MANUELLEMENT dans le SQL editor (pas
--      via un outil automatisé) : remplacer <SERVICE_ROLE_KEY> par la vraie
--      clé service_role du projet (Project Settings → API → service_role
--      secret) juste avant de l'exécuter, puis NE JAMAIS commiter cette
--      ligne avec la vraie clé dans un fichier versionné.
--   5. Étape 4 : programmer le cron (à adapter avec l'URL réelle du projet).

-- ── 1. Extensions ──────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 2. Table de déduplication ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_reminders_sent (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    threshold TEXT NOT NULL CHECK (threshold IN ('j-3','j+3','j+7')),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (invoice_id, threshold)
);

ALTER TABLE public.invoice_reminders_sent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Invoice reminders select" ON public.invoice_reminders_sent;
CREATE POLICY "Invoice reminders select" ON public.invoice_reminders_sent
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

CREATE INDEX IF NOT EXISTS idx_invoice_reminders_sent_invoice ON public.invoice_reminders_sent(invoice_id);

-- ── 3. Secret service_role dans Vault (À FAIRE À LA MAIN, voir note ci-dessus) ──
-- select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key_for_cron');

-- ── 4. Planification quotidienne (8h UTC) ──────────────────────────────
-- Remplacer <PROJECT_REF> par la référence réelle du projet
-- (mwfmruzlonsrrfufbsyz pour staging, qmavetqcpzsfralsqxsi pour production).
select
    cron.schedule(
        'send-payment-reminders-daily',
        '0 8 * * *',
        $cron$
        select net.http_post(
            url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-payment-reminders',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || (
                    select decrypted_secret from vault.decrypted_secrets
                    where name = 'service_role_key_for_cron' limit 1
                )
            ),
            body := jsonb_build_object('triggered_at', now())
        ) as request_id;
        $cron$
    );

-- Pour vérifier après coup : select * from cron.job; puis
-- select * from cron.job_run_details order by start_time desc limit 20;
-- Pour désactiver sans supprimer : select cron.unschedule('send-payment-reminders-daily');
