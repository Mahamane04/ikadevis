-- IKADEVIS V6 — statut d'envoi des factures
-- À appliquer sur Supabase avant d'utiliser « Marquer comme envoyée » en cloud.
-- L'émission reste distincte de l'envoi : une facture émise est figée, puis
-- son statut peut passer à sent sans modifier son numéro ni ses montants.

ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

ALTER TABLE public.invoices
    DROP CONSTRAINT IF EXISTS invoices_status_check;

ALTER TABLE public.invoices
    ADD CONSTRAINT invoices_status_check
    CHECK (status IN ('draft','issued','sent','partially_paid','paid','cancelled'));

COMMENT ON COLUMN public.invoices.sent_at IS
    'Date à laquelle la facture a été marquée comme envoyée au client.';
