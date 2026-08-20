-- Gestion de stock, Phase 1 (2026-08-20, demandé par l'utilisateur) : suivi
-- manuel de la quantité en stock par matière. NULL = matière non suivie
-- (comportement par défaut, aucun avertissement affiché) ; toute valeur
-- numérique, y compris 0, = suivie explicitement.
--
-- Purement additif, idempotent (ADD COLUMN IF NOT EXISTS). Aucune valeur par
-- défaut à 0 volontairement : ça transformerait silencieusement toutes les
-- matières existantes en "suivies avec un stock nul", ce qui déclencherait
-- un avertissement "stock insuffisant" sur le premier devis venu pour des
-- matières que personne n'a jamais suivies.

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS stock_qty NUMERIC(12,3);

COMMENT ON COLUMN public.materials.stock_qty IS
  'Quantité en stock suivie manuellement (unité = unit_calc). NULL = matière non suivie, aucun avertissement. Jamais modifiée automatiquement par un devis.';
