-- IKADEVIS V6 — réglages commerciaux par organisation
-- Les réglages sont regroupés dans un JSONB pour permettre d'ajouter des
-- options sans nouvelle migration à chaque champ, tout en restant isolés par
-- organisation et couverts par les policies RLS existantes.

ALTER TABLE public.company_settings
    ADD COLUMN IF NOT EXISTS commercial_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.company_settings.commercial_settings IS
    'Réglages commerciaux : coordonnées bancaires, règles BTP et modèles de messages.';
