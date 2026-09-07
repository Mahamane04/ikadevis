// IKADEVIS — invite-member (2026-09-06)
//
// Première Edge Function du projet : le client React n'a jamais accès à la
// clé service_role, et l'inviter par e-mail (auth.admin.inviteUserByEmail)
// ou lui créer un compte exige cette clé. Cette fonction fait le pont, en
// deux temps bien séparés :
//
//   1. Vérification des permissions avec le JWT de L'APPELANT (jamais le
//      service_role à ce stade) — has_org_permission côté base, la même RPC
//      que celle qui protège déjà organization_members en RLS.
//   2. Actions privilégiées (créer/retrouver le compte, l'ajouter comme
//      membre) avec le client service_role, uniquement après ce contrôle.
//
// Déploiement : `supabase functions deploy invite-member --project-ref <ref>`
// (staging d'abord, toujours). Nécessite que SUPABASE_SERVICE_ROLE_KEY soit
// disponible dans les secrets de la fonction (Supabase l'injecte par défaut
// pour les Edge Functions du même projet — rien à configurer à la main).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ROLES_INVITABLES = ['admin', 'estimator', 'commercial', 'viewer'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const jsonResponse = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const { organizationId, email, role } = await req.json();

    if (!organizationId || !email || !role) {
      return jsonResponse({ error: 'organizationId, email et role sont requis.' }, 400);
    }
    if (!ROLES_INVITABLES.includes(role)) {
      return jsonResponse({ error: `Rôle invalide : ${role} (attendu : ${ROLES_INVITABLES.join(', ')})` }, 400);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Authentification requise.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // ── 1. Vérification avec le JWT de l'appelant ─────────────────────────
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !callerUser) {
      return jsonResponse({ error: 'Session invalide ou expirée.' }, 401);
    }

    const { data: aLaPermission, error: permErr } = await callerClient.rpc('has_org_permission', {
      p_org_id: organizationId,
      p_required_roles: ['owner', 'admin'],
    });
    if (permErr) {
      return jsonResponse({ error: `Vérification des permissions impossible : ${permErr.message}` }, 500);
    }
    if (!aLaPermission) {
      return jsonResponse({ error: 'Permission refusée : seuls le propriétaire et un administrateur peuvent inviter un membre.' }, 403);
    }

    // ── 2. Actions privilégiées, service_role uniquement à partir d'ici ───
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Réutilise le compte s'il existe déjà (ex. déjà membre d'une autre
    // organisation ikadevis) plutôt que d'échouer sur "déjà inscrit".
    const { data: existingUsers, error: listErr } = await adminClient.auth.admin.listUsers();
    if (listErr) {
      return jsonResponse({ error: `Recherche du compte impossible : ${listErr.message}` }, 500);
    }
    let targetUserId = existingUsers?.users?.find(
      (u) => (u.email || '').toLowerCase() === email.toLowerCase()
    )?.id;

    if (!targetUserId) {
      const { data: invited, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email);
      if (inviteErr || !invited?.user) {
        return jsonResponse({ error: `Invitation impossible : ${inviteErr?.message || 'erreur inconnue'}` }, 500);
      }
      targetUserId = invited.user.id;
    }

    // upsert plutôt qu'insert : ré-inviter quelqu'un déjà membre met juste
    // son rôle à jour, sans erreur de doublon (unique_org_user déjà en base).
    const { error: memberErr } = await adminClient
      .from('organization_members')
      .upsert(
        { organization_id: organizationId, user_id: targetUserId, role },
        { onConflict: 'organization_id,user_id' }
      );

    if (memberErr) {
      return jsonResponse({ error: `Membre non ajouté : ${memberErr.message}` }, 500);
    }

    return jsonResponse({ success: true, userId: targetUserId, email, role });
  } catch (err) {
    return jsonResponse({ error: err?.message || 'Erreur inattendue.' }, 500);
  }
});
