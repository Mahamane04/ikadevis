// IKADEVIS — supabase/functions/saspay-proxy/index.ts
// Proxy sécurisé pour l'API SasPay (https://docs.saspay.me/)
// Permet d'effectuer les appels d'encaissement Mobile Money & Carte sans exposer
// la clé API secrète côté client si elle est configurée comme secret d'environnement.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

const SASPAY_BASE_URL = 'https://api.saspay.me/api/v1';

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

    // La clé API peut provenir soit du payload envoyé par l'admin d'organisation,
    // soit du secret d'environnement global SASPAY_API_KEY.
    const resolvedApiKey = (apiKey || Deno.env.get('SASPAY_API_KEY') || '').trim();

    if (!resolvedApiKey && action !== 'ping') {
      return jsonResponse({ error: 'Clé API SasPay non configurée.' }, 400);
    }

    if (action === 'test-connection') {
      const res = await fetch(`${SASPAY_BASE_URL}/networks/`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${resolvedApiKey}`,
          'Accept': 'application/json'
        }
      });
      const data = await res.json().catch(() => ({}));
      return jsonResponse({ ok: res.ok, status: res.status, data }, res.status);
    }

    if (action === 'create-checkout') {
      const res = await fetch(`${SASPAY_BASE_URL}/checkout-sessions/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resolvedApiKey}`,
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
          'Authorization': `Bearer ${resolvedApiKey}`,
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
      const endpoint = type === 'checkout'
        ? `${SASPAY_BASE_URL}/checkout-sessions/${paymentId}/`
        : `${SASPAY_BASE_URL}/payments/${paymentId}/verify/`;

      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${resolvedApiKey}`,
          'Accept': 'application/json'
        }
      });
      const data = await res.json().catch(() => ({}));
      return jsonResponse(data, res.status);
    }

    return jsonResponse({ error: `Action inconnue : ${action}` }, 400);
  } catch (err: any) {
    return jsonResponse({ error: err?.message || 'Erreur interne du proxy SasPay' }, 500);
  }
});
