// IKADEVIS — supabase/functions/saspay-proxy/index.ts
// Passerelle SasPay (https://docs.saspay.me/) — réécrite le 2026-09-24.
//
// POURQUOI CETTE RÉÉCRITURE
// -------------------------
// Le 2026-09-24, un abonnement STANDARD s'est activé en production sans
// qu'un seul franc ne quitte le compte Mobile Money. Trois défauts
// cumulés, tous du côté navigateur :
//
//   1. Aucune clé API n'étant configurée, `saspay-service.js` basculait en
//      simulation silencieuse : il fabriquait une session `demo_…` sans
//      jamais joindre api.saspay.me, et `verifyPayment` répondait SUCCESS.
//   2. Le sondage acceptait `verify.success`, vrai sur tout HTTP 200, même
//      pour un paiement PENDING.
//   3. Au bout de 20 s sans confirmation, le client s'activait quand même
//      la formule (`checks >= maxChecks` → applyPlanUpgrade).
//
// La leçon : tant que le navigateur décide, il finit toujours par dire oui.
// Cette fonction devient donc la SEULE autorité. Elle seule connaît la clé
// SasPay, elle seule fixe les prix, elle seule écrit dans `subscriptions`.
// Le navigateur ne fait plus que demander et afficher.
//
// DÉPLOIEMENT
//   supabase functions deploy saspay-proxy --project-ref <ref>
//   supabase secrets set SASPAY_API_KEY=sk_live_… --project-ref <ref>
// Staging d'abord, toujours (CLAUDE.md § Sécurité).
//
// SUPABASE_SERVICE_ROLE_KEY est injectée d'office par Supabase pour les
// Edge Functions du même projet : rien à configurer à la main.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

const SASPAY_BASE_URL = 'https://api.saspay.me/api/v1';

// ═══════════════════════════════════════════════════════════════════════
// CATALOGUE DES FORMULES — SOURCE DE VÉRITÉ DES PRIX
// ═══════════════════════════════════════════════════════════════════════
//
// Le montant n'est JAMAIS lu depuis la requête. Un navigateur qui demande
// « Entreprise pour 100 F » se voit facturer 49 000 F, comme tout le
// monde. Toute évolution tarifaire se fait ici, et doit être répercutée
// dans js/subscription-service.js (affichage seul).

const CATALOGUE_FORMULES: Record<string, { monthly: number; yearly: number; nom: string }> = {
  standard:   { monthly: 19900, yearly: 191000, nom: 'Standard' },
  entreprise: { monthly: 49000, yearly: 470000, nom: 'Entreprise' },
  // Alias historiques conservés pour les anciens liens
  pro:        { monthly: 19900, yearly: 191000, nom: 'Pro' },
  business:   { monthly: 49000, yearly: 470000, nom: 'Business' }
};



// Codes réseau acceptés.
//
// La première version figeait ici 22 codes écrits à la main. Recoupement du
// 2026-09-24 avec `GET /networks/` : SasPay en expose **77, dont 65 actifs**.
// Une liste figée refuse donc des opérateurs parfaitement valides — et se
// périme à chaque ajout chez SasPay, silencieusement. Pire, elle refuse
// AVANT d'appeler la passerelle : l'utilisateur voit « Opérateur non pris en
// charge » pour un opérateur que SasPay accepte.
//
// On interroge donc le catalogue en direct, avec un cache d'une heure pour ne
// pas payer un aller-retour à chaque souscription. Le repli statique ne sert
// que si SasPay est injoignable au moment du contrôle.

const RESEAUX_REPLI = new Set([
  'orange_ml', 'wave_ml', 'moov_ml', 'mobi_cash_ml',
  'wave_ci', 'orange_ci', 'mtn_ci', 'moov_ci', 'djamo_ci',
  'wave_sn', 'orange_sn', 'freemoney_sn', 'wizall_sn', 'expresso_sn', 'djamo_sn', 'paydunya_sn',
  'mtn_bj', 'moov_bj', 'celtiis_bj',
  'orange_bf', 'moov_bf', 'touchcash_bf',
  'mixx_tg', 'togocel', 'moov_tg',
  'orange_cm', 'mtn_cm',
  'mtn_gn',
  'card'
]);

const CACHE_RESEAUX_MS = 60 * 60 * 1000;
let cacheReseaux: { codes: Set<string>; pose: number } | null = null;

async function reseauxAcceptes(cle: string): Promise<Set<string>> {
  if (cacheReseaux && Date.now() - cacheReseaux.pose < CACHE_RESEAUX_MS) {
    return cacheReseaux.codes;
  }
  try {
    const codes = new Set<string>();
    let url: string | null = `${SASPAY_BASE_URL}/networks/?page_size=100`;
    // Deux pages au plus : garde-fou contre une pagination qui boucle.
    for (let i = 0; i < 2 && url; i++) {
      const res: Response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${cle}`, 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: any = await res.json();
      const bloc = json?.data || json || {};
      for (const n of (bloc.results || [])) {
        if (n?.code && n?.is_active !== false) codes.add(String(n.code));
      }
      url = bloc.next || null;
    }
    if (codes.size === 0) throw new Error('catalogue vide');
    cacheReseaux = { codes, pose: Date.now() };
    return codes;
  } catch (_err) {
    // Catalogue injoignable : on retombe sur le repli plutôt que de tout
    // refuser ou de tout accepter.
    return RESEAUX_REPLI;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// OUTILS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Normalise le statut renvoyé par SasPay en trois verdicts sans ambiguïté.
 * Tout ce qui n'est pas explicitement payé ou explicitement échoué reste
 * « en attente » : l'indécision ne vaut jamais activation.
 */
function verdictPaiement(statutBrut: unknown): 'paid' | 'failed' | 'pending' {
  const s = String(statutBrut || '').toUpperCase().trim();
  if (s === 'PAID' || s === 'SUCCESS' || s === 'SUCCEEDED' || s === 'COMPLETED') return 'paid';
  if (s === 'FAILED' || s === 'CANCELLED' || s === 'CANCELED' || s === 'EXPIRED' || s === 'REFUSED') return 'failed';
  return 'pending';
}

/** Extrait l'identifiant de paiement, quel que soit l'enrobage de la réponse. */
function extraireIdPaiement(json: any): string | null {
  const d = json?.data || json || {};
  return d.id || d.payment_id || d.reference || d.slug || json?.id || json?.reference || null;
}

/** Extrait l'URL de paiement hébergée, quel que soit l'enrobage. */
function extraireUrlCheckout(json: any): string | null {
  const d = json?.data || json || {};
  return d.checkout_url || d.url || d.payment_url || d.redirect_url || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Authentification requise.' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const { action, apiKey, payload } = body;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const clePlateforme = (Deno.env.get('SASPAY_API_KEY') || '').trim();

    // ── Identification de l'appelant avec SON JWT (jamais le service_role
    //    à ce stade), comme dans invite-member ──────────────────────────
    const clientAppelant = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user: utilisateur }, error: errUtilisateur } = await clientAppelant.auth.getUser();
    if (errUtilisateur || !utilisateur) {
      return jsonResponse({ error: 'Session invalide ou expirée.' }, 401);
    }

    // ═══════════════════════════════════════════════════════════════════
    // A. ACTIONS D'ABONNEMENT SAAS (clé plateforme, écriture privilégiée)
    // ═══════════════════════════════════════════════════════════════════

    const estActionAbonnement = String(action || '').startsWith('subscription-');

    if (estActionAbonnement) {
      const clientService = createClient(supabaseUrl, serviceKey);

      // Super-administrateur plateforme : accès permanent formule Entreprise
      const SUPER_ADMIN_EMAILS = new Set(['officemicro89@gmail.com']);
      const estSuperAdmin = SUPER_ADMIN_EMAILS.has((utilisateur.email || '').toLowerCase().trim());

      // L'entreprise choisie est explicite ET vérifiée dans les adhésions.
      const organizationId = payload?.organizationId;
      if (!organizationId || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(organizationId)) {
        return jsonResponse({ error: 'Sélectionnez votre entreprise puis réessayez.' }, 400);
      }
      const { data: membre, error: errMembre } = await clientService
        .from('organization_members').select('organization_id, role')
        .eq('user_id', utilisateur.id).eq('organization_id', organizationId).maybeSingle();
      if (errMembre || !membre) return jsonResponse({ error: 'Entreprise non autorisée.' }, 403);
      const orgId = membre.organization_id;

      const lireAbonnement = async () => {
        if (estSuperAdmin) {
          return {
            organization_id: orgId,
            plan_id: 'entreprise',
            status: 'active',
            billing_cycle: 'yearly',
            current_period_end: '2099-12-31T23:59:59.000Z'
          };
        }
        const { data, error } = await clientService.from('subscriptions').select('*')
          .eq('organization_id', orgId).single();
        // Une erreur réseau ou une migration manquante n'ouvre jamais un nouvel essai.
        if (error || !data) throw new Error('Abonnement indisponible. Réessayez dans quelques instants.');
        return data;
      };

      // ── A.1 — État courant de l'abonnement ─────────────────────────
      if (action === 'subscription-status') {
        if (estSuperAdmin) {
          const abonnementAdmin = {
            organization_id: orgId,
            plan_id: 'entreprise',
            status: 'active',
            billing_cycle: 'yearly',
            current_period_end: '2099-12-31T23:59:59.000Z',
            updated_at: new Date().toISOString()
          };
          try {
            await clientService.from('subscriptions').upsert(abonnementAdmin, { onConflict: 'organization_id' });
          } catch (_) {}
          return jsonResponse({ ok: true, subscription: abonnementAdmin });
        }
        const abonnement = await lireAbonnement();
        return jsonResponse({ ok: true, subscription: abonnement });
      }

      // ── A.2 — Demande de débit ─────────────────────────────────────
      if (action === 'subscription-initiate') {
        // Seuls les décideurs engagent une dépense.
        if (!['owner', 'admin'].includes(membre.role)) {
          return jsonResponse({
            error: 'Seul le propriétaire ou un administrateur du compte peut souscrire un abonnement.'
          }, 403);
        }

        // Refus franc plutôt que simulation silencieuse : c'est
        // exactement ce qui manquait le 2026-09-24.
        if (!clePlateforme) {
          return jsonResponse({
            error: 'La passerelle de paiement n\'est pas configurée. Aucun abonnement ne peut être souscrit pour le moment.',
            code: 'GATEWAY_NOT_CONFIGURED'
          }, 503);
        }

        const { planId, billingCycle, network, phone, country, mode } = payload || {};

        const formule = CATALOGUE_FORMULES[String(planId || '')];
        if (!formule) {
          return jsonResponse({ error: `Formule inconnue : ${planId}` }, 400);
        }
        const abonnement = await lireAbonnement();
        const canon = (id: string) => (({ pro: 'standard', business: 'entreprise' } as Record<string, string>)[id] || id);
        if (abonnement.status === 'active' && new Date(abonnement.current_period_end) > new Date()
            && canon(abonnement.plan_id) !== canon(planId)) {
          return jsonResponse({ error: 'Le changement de formule sera disponible à la fin de votre période actuelle. Aucun débit effectué.', code: 'PLAN_CHANGE_REQUIRES_REVIEW' }, 409);
        }
        const cycle = billingCycle === 'yearly' ? 'yearly' : 'monthly';
        const montant = formule[cycle];   // ← prix serveur, jamais celui du client

        const canal = mode === 'checkout' ? 'checkout' : 'softpay';

        if (canal === 'softpay') {
          if (!phone) {
            return jsonResponse({ error: 'Le numéro de téléphone Mobile Money est requis.' }, 400);
          }
          const acceptes = await reseauxAcceptes(clePlateforme);
          if (!acceptes.has(String(network))) {
            return jsonResponse({ error: `Opérateur non pris en charge : ${network}` }, 400);
          }
        }

        // La ligne `pending` est créée AVANT l'appel : c'est elle qui lie
        // l'identifiant SasPay à cette organisation et à ce montant. Sans
        // elle, un identifiant de paiement quelconque suffirait à
        // débloquer une formule.
        const { data: ligneReglement, error: errInsert } = await clientService
          .from('subscription_payments')
          .insert({
            organization_id: orgId,
            plan_id: planId,
            billing_cycle: cycle,
            amount: montant,
            currency: 'XOF',
            provider: 'saspay',
            provider_kind: canal,
            status: 'pending',
            customer_phone: phone || null,
            network: network || null,
            country: country || 'ML',
            initiated_by: utilisateur.id
          })
          .select()
          .single();

        if (errInsert || !ligneReglement) {
          return jsonResponse({ error: `Impossible d'enregistrer le règlement : ${errInsert?.message}` }, 500);
        }

        // metadata renvoyée telle quelle par SasPay lors de la
        // vérification : elle permet de recouper la ligne.
        const metadata = {
          type: 'saas_subscription',
          ikadevis_payment_ref: ligneReglement.id,
          organization_id: orgId,
          plan_id: planId,
          billing_cycle: cycle
        };

        const description = `Abonnement ikadevis ${formule.nom} (${cycle === 'yearly' ? '1 an' : '1 mois'})`;

        let reponseSasPay: any = {};
        let statutHttp = 0;

        try {
          if (canal === 'softpay') {
            const res = await fetch(`${SASPAY_BASE_URL}/payments/softpay/`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${clePlateforme}`,
                'Idempotency-Key': ligneReglement.id,   // notre uuid = clé d'idempotence
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                amount: montant.toFixed(2),
                currency: 'XOF',
                country: String(country || 'ML').toUpperCase(),
                network,
                description,
                customer: {
                  email: utilisateur.email || 'client@ikadevis.com',
                  first_name: (payload?.customerName || 'Client').split(' ')[0],
                  last_name: (payload?.customerName || 'ikadevis').split(' ').slice(1).join(' ') || 'ikadevis',
                  phone
                },
                metadata
              })
            });
            statutHttp = res.status;
            reponseSasPay = await res.json().catch(() => ({}));
          } else {
            const res = await fetch(`${SASPAY_BASE_URL}/checkout-sessions/`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${clePlateforme}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                amount: montant.toFixed(2),
                currency: 'XOF',
                country: String(country || 'ML').toUpperCase(),
                description,
                customer_name: payload?.customerName || 'Client ikadevis',
                customer_email: utilisateur.email || 'client@ikadevis.com',
                customer_phone: phone || undefined,
                return_url: payload?.returnUrl || undefined,
                metadata
              })
            });
            statutHttp = res.status;
            reponseSasPay = await res.json().catch(() => ({}));
          }
        } catch (err: any) {
          await clientService.from('subscription_payments')
            .update({ status: 'failed', raw_response: { erreur_reseau: String(err?.message) } })
            .eq('id', ligneReglement.id);
          return jsonResponse({ error: `Passerelle SasPay injoignable : ${err?.message}` }, 502);
        }

        if (statutHttp < 200 || statutHttp >= 300) {
          const msg = reponseSasPay?.error?.message || reponseSasPay?.message || `Erreur SasPay (${statutHttp})`;
          await clientService.from('subscription_payments')
            .update({ status: 'failed', raw_response: reponseSasPay })
            .eq('id', ligneReglement.id);
          return jsonResponse({ error: msg, code: 'GATEWAY_REFUSED' }, 502);
        }

        const idSasPay = extraireIdPaiement(reponseSasPay);
        if (!idSasPay) {
          await clientService.from('subscription_payments')
            .update({ status: 'failed', raw_response: reponseSasPay })
            .eq('id', ligneReglement.id);
          return jsonResponse({
            error: 'SasPay n\'a retourné aucun identifiant de paiement : la demande de débit n\'a pas abouti.',
            code: 'NO_PAYMENT_ID'
          }, 502);
        }

        await clientService.from('subscription_payments')
          .update({ provider_payment_id: String(idSasPay), raw_response: reponseSasPay })
          .eq('id', ligneReglement.id);

        return jsonResponse({
          ok: true,
          // Le client sonde avec NOTRE référence, jamais celle de SasPay :
          // il ne peut donc pas présenter l'identifiant d'un autre paiement.
          paymentRef: ligneReglement.id,
          checkoutUrl: extraireUrlCheckout(reponseSasPay),
          instructions: reponseSasPay?.data?.instructions || null,
          amount: montant,
          currency: 'XOF'
        });
      }

      // ── A.3 — Vérification et activation ───────────────────────────
      if (action === 'subscription-verify') {
        const { paymentRef } = payload || {};
        if (!paymentRef) {
          return jsonResponse({ error: 'Référence de règlement manquante.' }, 400);
        }

        // La ligne doit appartenir à l'organisation de l'appelant.
        const { data: ligne } = await clientService
          .from('subscription_payments')
          .select('*')
          .eq('id', paymentRef)
          .eq('organization_id', orgId)
          .maybeSingle();

        if (!ligne) {
          return jsonResponse({ error: 'Règlement introuvable pour ce compte.' }, 404);
        }

        // Déjà appliqué : on rend l'abonnement sans rappeler SasPay.
        if (ligne.applied_at) {
          return jsonResponse({ ok: true, status: 'paid', subscription: await lireAbonnement() });
        }

        if (!ligne.provider_payment_id) {
          return jsonResponse({ ok: true, status: 'failed', reason: 'Aucun paiement n\'a été créé chez SasPay.' });
        }
        if (!clePlateforme) {
          return jsonResponse({ error: 'Passerelle non configurée.', code: 'GATEWAY_NOT_CONFIGURED' }, 503);
        }

        const endpoint = ligne.provider_kind === 'checkout'
          ? `${SASPAY_BASE_URL}/checkout-sessions/${ligne.provider_payment_id}/`
          : `${SASPAY_BASE_URL}/payments/${ligne.provider_payment_id}/verify/`;

        const res = await fetch(endpoint, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${clePlateforme}`, 'Accept': 'application/json' }
        });
        const donnees = await res.json().catch(() => ({}));

        if (!res.ok) {
          // Une passerelle muette laisse le règlement en attente : elle ne
          // vaut ni confirmation, ni échec.
          return jsonResponse({ ok: true, status: 'pending', reason: `SasPay a répondu ${res.status}.` });
        }

        const charge = donnees?.data || donnees || {};
        const verdict = verdictPaiement(charge.status);

        if (verdict === 'failed') {
          await clientService.from('subscription_payments')
            .update({ status: 'failed', raw_response: donnees })
            .eq('id', ligne.id).is('applied_at', null);
          return jsonResponse({ ok: true, status: 'failed', reason: 'Le paiement a été refusé ou annulé.' });
        }

        if (verdict === 'pending') {
          return jsonResponse({ ok: true, status: 'pending' });
        }

        // PAID sans montant et devise vérifiables reste en attente d'une preuve.
        const montantEncaisse = Number(charge.amount_paid ?? charge.amount ?? NaN);
        const devise = String(charge.currency || '').toUpperCase();
        if (!Number.isFinite(montantEncaisse) || montantEncaisse < Number(ligne.amount) || devise !== ligne.currency) {
          return jsonResponse({ ok: true, status: 'pending', reason: 'Le prestataire n’a pas confirmé le montant et la devise attendus. Aucun abonnement activé.' });
        }
        const { data: abonnementMaj, error: erreurApplication } = await clientService.rpc('apply_verified_subscription_payment', {
          p_organization_id: orgId,
          p_payment_id: ligne.id,
          p_amount: montantEncaisse,
          p_currency: devise,
          p_response: donnees
        });
        if (erreurApplication || !abonnementMaj) {
          // La transaction peut être rejouée : aucun marqueur partiel n'est écrit.
          return jsonResponse({ ok: true, status: 'pending', reason: 'Paiement en cours de rapprochement. Réessayez la vérification, sans effectuer un nouveau paiement.' });
        }
        return jsonResponse({ ok: true, status: 'paid', subscription: abonnementMaj });
      }

      return jsonResponse({ error: `Action d'abonnement inconnue : ${action}` }, 400);
    }

    // ═══════════════════════════════════════════════════════════════════
    // B. ENCAISSEMENTS DE FACTURES (clé SasPay PROPRE à l'organisation)
    // ═══════════════════════════════════════════════════════════════════
    //
    // Ici l'argent va sur le compte SasPay du client d'ikadevis, pas sur
    // celui de la plateforme. La clé plateforme n'est donc JAMAIS un repli
    // possible — l'ancienne version faisait `apiKey || SASPAY_API_KEY`, ce
    // qui aurait détourné les règlements des factures de nos clients vers
    // le compte d'ikadevis.

    const cleOrganisation = String(apiKey || '').trim();

    if (!cleOrganisation && action !== 'ping') {
      return jsonResponse({
        error: 'Clé API SasPay non configurée pour cette organisation (Paramètres › Passerelle SasPay).',
        code: 'ORG_GATEWAY_NOT_CONFIGURED'
      }, 400);
    }

    if (action === 'ping') {
      return jsonResponse({ ok: true });
    }

    if (action === 'test-connection') {
      const res = await fetch(`${SASPAY_BASE_URL}/networks/`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${cleOrganisation}`, 'Accept': 'application/json' }
      });
      const data = await res.json().catch(() => ({}));
      return jsonResponse({ ok: res.ok, status: res.status, data }, res.ok ? 200 : res.status);
    }

    if (action === 'create-checkout') {
      const res = await fetch(`${SASPAY_BASE_URL}/checkout-sessions/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleOrganisation}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      return jsonResponse(data, res.status);
    }

    if (action === 'initiate-softpay') {
      const idempotencyKey = req.headers.get('idempotency-key') || crypto.randomUUID();
      const res = await fetch(`${SASPAY_BASE_URL}/payments/softpay/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleOrganisation}`,
          'Idempotency-Key': idempotencyKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      return jsonResponse(data, res.status);
    }

    if (action === 'verify-payment') {
      const { paymentId, type } = payload || {};
      if (!paymentId) {
        return jsonResponse({ error: 'paymentId requis.' }, 400);
      }
      const endpoint = type === 'checkout'
        ? `${SASPAY_BASE_URL}/checkout-sessions/${paymentId}/`
        : `${SASPAY_BASE_URL}/payments/${paymentId}/verify/`;

      const res = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${cleOrganisation}`, 'Accept': 'application/json' }
      });
      const data = await res.json().catch(() => ({}));

      // Verdict normalisé, pour que le navigateur n'ait plus à
      // interpréter lui-même un statut (source du bug du 2026-09-24).
      const charge = data?.data || data || {};
      return jsonResponse({
        ok: res.ok,
        verdict: res.ok ? verdictPaiement(charge.status) : 'pending',
        data
      }, res.ok ? 200 : res.status);
    }

    return jsonResponse({ error: `Action inconnue : ${action}` }, 400);
  } catch (err: any) {
    return jsonResponse({ error: err?.message || 'Erreur interne du proxy SasPay' }, 500);
  }
});
