-- ============================================================================
-- Personnalisation visuelle des documents PDF (2026-08-23)
-- ============================================================================
-- Ajoute l'identité visuelle propre à chaque organisation : couleur de marque,
-- famille typographique et placement de l'en-tête sur les devis et factures.
--
-- SÛRETÉ
-- - migration strictement additive et rejouable (IF NOT EXISTS) ;
-- - aucune donnée existante n'est modifiée ;
-- - NULL est volontaire : l'application applique ses valeurs professionnelles
--   par défaut (bleu ikadevis, police moderne, en-tête à gauche).
-- - les policies RLS de company_settings couvrent automatiquement ces colonnes.
-- ============================================================================

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS brand_color TEXT,
  ADD COLUMN IF NOT EXISTS pdf_font TEXT,
  ADD COLUMN IF NOT EXISTS pdf_header_alignment TEXT;

COMMENT ON COLUMN public.company_settings.brand_color IS
  'Couleur hexadécimale principale des documents PDF client, par exemple #3B5BDB. NULL = couleur par défaut de l''application.';
COMMENT ON COLUMN public.company_settings.pdf_font IS
  'Police du document client : modern, classic, technical ou editorial. NULL = modern.';
COMMENT ON COLUMN public.company_settings.pdf_header_alignment IS
  'Placement de l''identité dans l''en-tête PDF : left, center ou right. NULL = left.';

-- Contrôle post-migration (lecture seule) :
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'company_settings'
--   AND column_name IN ('brand_color', 'pdf_font', 'pdf_header_alignment');
