-- Correctif P1-02 (audit pré-commercial du 19/08/2026) : material_price_history
-- avait RLS activée mais seulement une policy "Platform admin read" en
-- production — aucune policy pour les organisations elles-mêmes, donc la
-- table restait vide pour tout utilisateur normal (PriceHistoryModal
-- n'affiche rien). Corrigé sur staging le 17/08 (§16.1 du tracker) ; jamais
-- porté sur production depuis, signalé sans interruption sur 3 audits.
--
-- Purement additif : ajoute 2 policies, ne touche pas à "Platform admin read"
-- qui existe déjà. Copie exacte de ce qui tourne sur staging depuis le 17/08
-- (vérifié par lecture directe de pg_policies avant d'écrire ce fichier).
--
-- À exécuter sur PRODUCTION (qmavetqcpzsfralsqxsi / SuperDevisMO) via le
-- SQL Editor du dashboard Supabase — l'agent n'a qu'un accès lecture seule
-- à ce projet par convention (voir § 13 du tracker).

DROP POLICY IF EXISTS "Material price history select" ON public.material_price_history;
CREATE POLICY "Material price history select" ON public.material_price_history
    FOR SELECT USING (organization_id IN (SELECT public.get_my_organization_ids()));

DROP POLICY IF EXISTS "Material price history insert" ON public.material_price_history;
CREATE POLICY "Material price history insert" ON public.material_price_history
    FOR INSERT WITH CHECK (public.has_org_permission(organization_id, ARRAY['owner', 'admin', 'estimator']));
