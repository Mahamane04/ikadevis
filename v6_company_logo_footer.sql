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
