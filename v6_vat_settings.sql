-- Réglages de TVA (2026-08-20, demandé par l'utilisateur : « me donner le
-- pouvoir de l'ajouter ou pas et aussi dans le setting choisir les règles qui
-- peuvent varier 18, 10 ou 20% »).
--
-- Constat avant de coder : dans l'éditeur de devis principal, le taux de TVA
-- était LU (`hybridQuote.vatRate || 18`) mais aucun champ ne permettait de le
-- changer — le seul champ TVA vivait dans l'ancien calculateur V5. Un devis
-- exonéré ou à taux réduit était donc impossible à établir.
--
-- vat_rates : taux proposés dans le sélecteur du devis (0 = exonéré).
-- vat_exemption_note : mention légale imprimée sur le document client quand
-- le taux retenu est 0 %.
--
-- Purement additif, idempotent. Pas de DEFAULT SQL : NULL = non configuré,
-- l'application retombe sur [18, 10, 0].

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS vat_rates jsonb,
  ADD COLUMN IF NOT EXISTS vat_exemption_note TEXT;

COMMENT ON COLUMN public.company_settings.vat_rates IS
  'Taux de TVA proposés dans le devis, ex. [18,10,0]. 0 = exonéré. NULL = non configuré, défaut applicatif [18,10,0].';
COMMENT ON COLUMN public.company_settings.vat_exemption_note IS
  'Mention légale imprimée sur le document client lorsque le taux de TVA retenu est 0 %.';
