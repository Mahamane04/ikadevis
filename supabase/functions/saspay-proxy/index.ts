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
    const { action, payload } = body;

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

        const { planId, billingCycle, network, phone, country, mode, idempotencyKey } = payload || {};

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

        // REL-02 : Recherche d'une intention de paiement existante (double clic ou répétition réseau)
        let ligneReglement: any = null;
        if (idempotencyKey) {
          const { data: existingByKey } = await clientService
            .from('subscription_payments')
            .select('*')
            .eq('organization_id', orgId)
            .eq('idempotency_key', idempotencyKey)
            .eq('status', 'pending')
            .gt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
            .maybeSingle();
          if (existingByKey) {
            ligneReglement = existingByKey;
          }
        }

        if (!ligneReglement) {
          const { data: existingEquivalent } = await clientService
            .from('subscription_payments')
            .select('*')
            .eq('organization_id', orgId)
            .eq('plan_id', planId)
            .eq('billing_cycle', cycle)
            .eq('status', 'pending')
            .gt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (existingEquivalent) {
            ligneReglement = existingEquivalent;
          }
        }

        // Si une intention identique existe déjà avec réponse confirmée du prestataire, on la renvoie
        if (ligneReglement && ligneReglement.provider_ref) {
          const payloadData = typeof ligneReglement.provider_payload === 'string'
            ? JSON.parse(ligneReglement.provider_payload)
            : (ligneReglement.provider_payload || {});
          return jsonResponse({
            ok: true,
            paymentRef: ligneReglement.id,
            mode: canal,
            checkoutUrl: payloadData?.checkout_url || null,
            reusedExistingIntent: true
          });
        }

        // Création d'une nouvelle ligne si aucune intention pending valide n'a été réutilisée
        if (!ligneReglement) {
          const { data: nouvelleLigne, error: errInsert } = await clientService
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
              idempotency_key: idempotencyKey || null,
              initiated_by: utilisateur.id
            })
            .select()
            .single();

          if (errInsert || !nouvelleLigne) {
            return jsonResponse({ error: `Impossible d'enregistrer le règlement : ${errInsert?.message}` }, 500);
          }
          ligneReglement = nouvelleLigne;
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

    // ═══════════════════════════════════════════════════════════════════════
    // B — ENCAISSEMENT DES FACTURES ENTREPRISE (SEC-01)
    // ═══════════════════════════════════════════════════════════════════════
    // Le montant n'est JAMAIS fourni par le client : il est calculé par la
    // procédure stockée `create_invoice_payment_intent` sur la base du reste dû.
    // L'activation est scellée par la RPC atomique `confirm_invoice_payment`.

    if (action === 'invoice-payment-initiate') {
      const { invoiceId, idempotencyKey, network, phone, country, mode, customerName } = payload || {};
      if (!invoiceId) {
        return jsonResponse({ error: 'Identifiant de facture (invoiceId) requis.' }, 400);
      }

      if (!['owner', 'admin', 'commercial'].includes(membre.role)) {
        return jsonResponse({ error: 'Permission refusée pour encaisser une facture.' }, 403);
      }

      if (!clePlateforme) {
        return jsonResponse({
          error: 'La passerelle de paiement n\'est pas configurée pour votre organisation.',
          code: 'GATEWAY_NOT_CONFIGURED'
        }, 503);
      }

      // 1. Dérivation serveur du montant via la RPC sécurisée
      const { data: intent, error: intentError } = await clientService.rpc('create_invoice_payment_intent', {
        p_org_id: orgId,
        p_invoice_id: invoiceId,
        p_idempotency_key: idempotencyKey || null
      });

      if (intentError || !intent) {
        return jsonResponse({
          error: intentError?.message || 'Impossible d\'initialiser le paiement pour cette facture.',
          code: 'PAYMENT_INTENT_ERROR'
        }, 400);
      }

      if (intent.reused_existing) {
        return jsonResponse({
          ok: true,
          paymentRef: intent.payment_id,
          amount: intent.amount,
          status: intent.status,
          reusedExistingIntent: true
        });
      }

      const paymentId = intent.payment_id;
      const montant = Number(intent.amount);
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

      const metadata = {
        type: 'invoice_payment',
        payment_id: paymentId,
        invoice_id: invoiceId,
        organization_id: orgId
      };

      let reponseSasPay: any = {};
      let statutHttp = 0;

      try {
        if (canal === 'softpay') {
          const res = await fetch(`${SASPAY_BASE_URL}/payments/softpay/`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${clePlateforme}`,
              'Idempotency-Key': paymentId,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              amount: montant.toFixed(2),
              currency: 'XOF',
              country: String(country || 'ML').toUpperCase(),
              network,
              description: `Règlement facture ${invoiceId}`,
              customer: {
                email: utilisateur.email || 'client@ikadevis.com',
                first_name: (customerName || 'Client').split(' ')[0],
                last_name: (customerName || 'Client').split(' ').slice(1).join(' ') || 'Client',
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
              description: `Règlement facture ${invoiceId}`,
              customer_name: customerName || 'Client ikadevis',
              customer_email: utilisateur.email || 'client@ikadevis.com',
              customer_phone: phone || undefined,
              metadata
            })
          });
          statutHttp = res.status;
          reponseSasPay = await res.json().catch(() => ({}));
        }
      } catch (err: any) {
        await clientService.from('invoice_payments')
          .update({ status: 'failed', provider_payload: { network_error: String(err?.message) } })
          .eq('id', paymentId);
        return jsonResponse({ error: `Passerelle SasPay injoignable : ${err?.message}` }, 502);
      }

      if (statutHttp < 200 || statutHttp >= 300) {
        const msg = reponseSasPay?.error?.message || reponseSasPay?.message || `Erreur SasPay (${statutHttp})`;
        await clientService.from('invoice_payments')
          .update({ status: 'failed', provider_payload: reponseSasPay })
          .eq('id', paymentId);
        return jsonResponse({ error: msg, code: 'GATEWAY_REFUSED' }, 502);
      }

      const idSasPay = extraireIdPaiement(reponseSasPay);
      await clientService.from('invoice_payments')
        .update({ provider_ref: String(idSasPay || paymentId), provider_payload: reponseSasPay })
        .eq('id', paymentId);

      return jsonResponse({
        ok: true,
        paymentRef: paymentId,
        checkoutUrl: extraireUrlCheckout(reponseSasPay),
        instructions: reponseSasPay?.data?.instructions || null,
        amount: montant,
        currency: 'XOF'
      });
    }

    if (action === 'invoice-payment-verify') {
      const { paymentRef } = payload || {};
      if (!paymentRef) {
        return jsonResponse({ error: 'Référence de règlement manquante.' }, 400);
      }

      const { data: ligne } = await clientService
        .from('invoice_payments')
        .select('*')
        .eq('id', paymentRef)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (!ligne) {
        return jsonResponse({ error: 'Règlement de facture introuvable.' }, 404);
      }

      if (ligne.status === 'paid') {
        return jsonResponse({ ok: true, status: 'paid', alreadyConfirmed: true });
      }

      if (!clePlateforme) {
        return jsonResponse({ error: 'Passerelle non configurée.', code: 'GATEWAY_NOT_CONFIGURED' }, 503);
      }

      const idCible = ligne.provider_ref || ligne.id;
      const endpoint = `${SASPAY_BASE_URL}/payments/${idCible}/verify/`;

      const res = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${clePlateforme}`, 'Accept': 'application/json' }
      });
      const donnees = await res.json().catch(() => ({}));

      if (!res.ok) {
        return jsonResponse({ ok: true, status: 'pending', reason: `SasPay a répondu ${res.status}.` });
      }

      const charge = donnees?.data || donnees || {};
      const verdict = verdictPaiement(charge.status);

      if (verdict === 'failed') {
        await clientService.from('invoice_payments')
          .update({ status: 'failed', provider_payload: donnees })
          .eq('id', ligne.id);
        return jsonResponse({ ok: true, status: 'failed', reason: 'Le paiement a été refusé.' });
      }

      if (verdict === 'pending') {
        return jsonResponse({ ok: true, status: 'pending' });
      }

      const montantEncaisse = Number(charge.amount_paid ?? charge.amount ?? NaN);
      if (!Number.isFinite(montantEncaisse) || montantEncaisse < Number(ligne.amount)) {
        return jsonResponse({ ok: true, status: 'pending', reason: 'Montant encaissé insuffisant ou non vérifiable.' });
      }

      // Appel de la procédure atomique de confirmation comptable
      const { data: confirmation, error: errConfirm } = await clientService.rpc('confirm_invoice_payment', {
        p_payment_id: ligne.id,
        p_provider_ref: String(idCible),
        p_payload: donnees
      });

      if (errConfirm || !confirmation) {
        return jsonResponse({ ok: true, status: 'pending', reason: 'Rapprochement comptable en cours.' });
      }

      return jsonResponse({
        ok: true,
        status: 'paid',
        invoiceStatus: confirmation.new_invoice_status,
        totalPaid: confirmation.total_paid
      });
    }

    if (action === 'ping') return jsonResponse({ ok: true });
    return jsonResponse({ error: `Action inconnue : ${action}`, code: 'UNKNOWN_ACTION' }, 400);
  } catch (_err) {
    return jsonResponse({ error: 'La passerelle est indisponible. Réessayez ultérieurement.' }, 500);
  }
});

