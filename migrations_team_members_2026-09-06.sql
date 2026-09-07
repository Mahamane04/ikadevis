-- IKADEVIS — Gestion des membres & rôles (item 6 du plan d'enrichissement des
-- Paramètres, 2026-09-06)
--
-- Le client ne peut pas lire auth.users directement (RLS ne s'applique même
-- pas à ce schéma côté anon/authenticated). Cette RPC fait la jointure
-- organization_members <-> auth.users et ne renvoie que les organisations
-- dont l'appelant est réellement membre (via has_org_permission, déjà
-- utilisée pour les policies RLS de organization_members).
--
-- Testé et validé sur staging (ikadevis-staging / mwfmruzlonsrrfufbsyz) le
-- 2026-09-06 : retourne correctement email + rôle + date d'ajout pour un
-- membre existant, lève une exception pour un appelant non-membre.
--
-- ⚠️ À appliquer manuellement en production via le dashboard Supabase (SQL
-- editor) — la connexion MCP de production est en lecture seule. Compléter
-- avec le déploiement de l'Edge Function supabase/functions/invite-member
-- (voir son en-tête pour les instructions `supabase functions deploy`).

CREATE OR REPLACE FUNCTION public.list_org_members(p_org_id UUID)
RETURNS TABLE(user_id UUID, email TEXT, role TEXT, joined_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT public.has_org_permission(p_org_id, ARRAY['owner','admin','estimator','commercial','viewer']) THEN
        RAISE EXCEPTION 'Accès refusé : vous n''êtes pas membre de cette organisation';
    END IF;
    RETURN QUERY
    SELECT om.user_id, u.email::text, om.role, om.created_at
    FROM public.organization_members om JOIN auth.users u ON u.id = om.user_id
    WHERE om.organization_id = p_org_id ORDER BY om.created_at ASC;
END; $$;

REVOKE ALL ON FUNCTION public.list_org_members(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_org_members(UUID) TO authenticated;
