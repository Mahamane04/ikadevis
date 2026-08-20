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
