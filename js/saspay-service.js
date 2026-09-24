// IKADEVIS — js/saspay-service.js
// Intégration officielle de la passerelle de paiement SasPay (https://docs.saspay.me/)
// Supporte les paiements Mobile Money (Orange Money, Wave, Moov, MTN, Free, Celtiis...)
// et Carte bancaire en Afrique de l'Ouest et du Centre via SoftPay et Checkout hébergé.

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.SasPayService = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
    'use strict';

    const BASE_URL = 'https://api.saspay.me/api/v1';

    // Référentiel des pays supportés avec opérateurs Mobile Money
    const SASPAY_COUNTRIES = [
        {
            code: 'ML',
            name: 'Mali',
            currency: 'XOF',
            dialCode: '+223',
            flag: '🇲🇱',
            networks: [
                { code: 'orange_ml', name: 'Orange Money Mali', color: '#ff6600', icon: 'fa-mobile-screen-button' },
                { code: 'moov_ml', name: 'Moov Money Mali', color: '#005baa', icon: 'fa-mobile-screen-button' },
                { code: 'mobi_cash_ml', name: 'Mobi Cash Mali (Malitel)', color: '#008542', icon: 'fa-mobile-screen-button' }
            ]
        },
        {
            code: 'CI',
            name: "Côte d'Ivoire",
            currency: 'XOF',
            dialCode: '+225',
            flag: '🇨🇮',
            networks: [
                { code: 'wave_ci', name: 'Wave CI', color: '#1dc3f2', icon: 'fa-wave-square' },
                { code: 'orange_ci', name: 'Orange Money CI', color: '#ff6600', icon: 'fa-mobile-screen-button' },
                { code: 'mtn_ci', name: 'MTN MoMo CI', color: '#ffcc00', icon: 'fa-mobile-screen-button' },
                { code: 'moov_ci', name: 'Moov Money CI', color: '#005baa', icon: 'fa-mobile-screen-button' }
            ]
        },
        {
            code: 'SN',
            name: 'Sénégal',
            currency: 'XOF',
            dialCode: '+221',
            flag: '🇸🇳',
            networks: [
                { code: 'wave_sn', name: 'Wave Sénégal', color: '#1dc3f2', icon: 'fa-wave-square' },
                { code: 'orange_sn', name: 'Orange Money Sénégal', color: '#ff6600', icon: 'fa-mobile-screen-button' },
                { code: 'freemoney_sn', name: 'Free Money Sénégal', color: '#e60000', icon: 'fa-mobile-screen-button' },
                { code: 'wizall_sn', name: 'Wizall Sénégal', color: '#2b2d42', icon: 'fa-mobile-screen-button' }
            ]
        },
        {
            code: 'BJ',
            name: 'Bénin',
            currency: 'XOF',
            dialCode: '+229',
            flag: '🇧🇯',
            networks: [
                { code: 'mtn_bj', name: 'MTN MoMo Bénin', color: '#ffcc00', icon: 'fa-mobile-screen-button' },
                { code: 'moov_bj', name: 'Moov Money Bénin', color: '#005baa', icon: 'fa-mobile-screen-button' },
                { code: 'celtiis_bj', name: 'Celtiis Cash Bénin', color: '#003399', icon: 'fa-mobile-screen-button' }
            ]
        },
        {
            code: 'BF',
            name: 'Burkina Faso',
            currency: 'XOF',
            dialCode: '+226',
            flag: '🇧🇫',
            networks: [
                { code: 'orange_bf', name: 'Orange Burkina Faso', color: '#ff6600', icon: 'fa-mobile-screen-button' },
                { code: 'moov_bf', name: 'Moov Burkina Faso', color: '#005baa', icon: 'fa-mobile-screen-button' }
            ]
        },
        {
            code: 'TG',
            name: 'Togo',
            currency: 'XOF',
            dialCode: '+228',
            flag: '🇹🇬',
            networks: [
                { code: 'togocel', name: 'T-Money (Togocel)', color: '#009639', icon: 'fa-mobile-screen-button' },
                { code: 'moov_tg', name: 'Moov Money Togo', color: '#005baa', icon: 'fa-mobile-screen-button' }
            ]
        },
        {
            code: 'CM',
            name: 'Cameroun',
            currency: 'XAF',
            dialCode: '+237',
            flag: '🇨🇲',
            networks: [
                { code: 'orange_cm', name: 'Orange Money Cameroun', color: '#ff6600', icon: 'fa-mobile-screen-button' },
                { code: 'mtn_cm', name: 'MTN MoMo Cameroun', color: '#ffcc00', icon: 'fa-mobile-screen-button' }
            ]
        },
        {
            code: 'GN',
            name: 'Guinée',
            currency: 'GNF',
            dialCode: '+224',
            flag: '🇬🇳',
            networks: [
                { code: 'mtn_gn', name: 'MTN MoMo Guinée', color: '#ffcc00', icon: 'fa-mobile-screen-button' }
            ]
        }
    ];

    // Réseaux globaux indépendants du pays
    const GLOBAL_NETWORKS = [
        { code: 'card', name: 'Carte bancaire (Visa / Mastercard)', color: '#10b981', icon: 'fa-credit-card' }
    ];

    /**
     * Génère un identifiant idempotent UUID v4
     */
    function generateIdempotencyKey() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Formate un numéro de téléphone pour SasPay
     */
    function normalizePhoneNumber(phone, dialCode = '+223') {
        if (!phone) return '';
        let cleaned = String(phone).replace(/[\s\-\.\(\)]/g, '');
        if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2);
        if (!cleaned.startsWith('+')) {
            const cleanDial = dialCode.replace('+', '');
            if (cleaned.startsWith(cleanDial)) {
                cleaned = '+' + cleaned;
            } else {
                cleaned = dialCode + cleaned;
            }
        }
        return cleaned;
    }

    /**
     * Résout la clé API SasPay (passée en paramètre, ou issue de la config plateforme globale / localStorage)
     */
    function resolveApiKey(providedKey) {
        if (providedKey && typeof providedKey === 'string' && providedKey.trim()) {
            return providedKey.trim();
        }
        if (typeof window !== 'undefined') {
            if (window.SASPAY_PLATFORM_CONFIG && window.SASPAY_PLATFORM_CONFIG.apiKey) {
                return String(window.SASPAY_PLATFORM_CONFIG.apiKey).trim();
            }
            try {
                const stored = window.localStorage.getItem('ikadevis_platform_saspay_key');
                if (stored && stored.trim()) return stored.trim();
            } catch (e) {}
        }
        return '';
    }

    /**
     * Teste la validité d'une clé API SasPay
     */
    async function testConnection(paramsOrKey) {
        const rawKey = typeof paramsOrKey === 'string' ? paramsOrKey : (paramsOrKey?.apiKey || '');
        const key = resolveApiKey(rawKey);
        if (!key) {
            return { ok: false, error: 'Veuillez saisir votre clé API SasPay (sk_live_... ou sk_test_...).' };
        }
        // Mode simulation locale
        if (key.startsWith('sk_test_demo') || key === 'demo' || key.includes('demo')) {
            return { ok: true, mode: 'demo', message: 'Clé de simulation / test SasPay validée avec succès.' };
        }

        try {
            // Interroger le catalogue des réseaux pour valider la clé
            const res = await fetch(`${BASE_URL}/networks/`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Accept': 'application/json'
                }
            });

            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                return {
                    ok: true,
                    mode: key.startsWith('sk_live_') ? 'live' : 'test',
                    message: `Connexion SasPay réussie (${key.startsWith('sk_live_') ? 'Production' : 'Test'}).`
                };
            }

            if (res.status === 401) {
                return { ok: false, error: 'Clé API invalide ou refusée par SasPay (Code 401).' };
            }
            if (res.status === 403) {
                return { ok: false, error: 'Compte SasPay suspendu ou accès non autorisé (Code 403).' };
            }
            return { ok: false, error: `Erreur SasPay HTTP ${res.status}. Vérifiez votre clé.` };
        } catch (err) {
            return { ok: false, error: `Impossible de joindre le serveur SasPay : ${err.message}` };
        }
    }

    /**
     * Crée une session de Checkout hébergé (lien de paiement à partager ou ouvrir)
     * Documentation : https://docs.saspay.me/api-reference/payments/checkout-create
     */
    async function createCheckoutSession({
        apiKey,
        amount,
        currency = 'XOF',
        description,
        country = 'ML',
        customerName,
        customerEmail,
        customerPhone,
        returnUrl,
        feeChargeMode = null,
        metadata = {}
    }) {
        const key = resolveApiKey(apiKey);
        const amtStr = Number(amount).toFixed(2);

        // Simulation démo si aucune clé ou clé de test démo
        if (!key || key.startsWith('sk_test_demo') || key === 'demo' || key.includes('demo')) {
            const fakeSlug = 'demo_' + Date.now();
            return {
                success: true,
                isDemo: true,
                data: {
                    id: 'checkout_' + fakeSlug,
                    slug: fakeSlug,
                    checkout_url: `https://pay.saspay.me/checkout/${fakeSlug}`,
                    amount: amtStr,
                    currency,
                    description: description || 'Règlement facture',
                    status: 'PENDING'
                }
            };
        }

        const payload = {
            amount: amtStr,
            currency: currency === 'FCFA' ? 'XOF' : currency,
            description: description || 'Paiement facture',
            customer_name: customerName || 'Client',
            customer_email: customerEmail || 'contact@client.com'
        };

        if (country) payload.country = country.toUpperCase();
        if (customerPhone) payload.customer_phone = customerPhone;
        if (returnUrl) payload.return_url = returnUrl;
        if (feeChargeMode) payload.fee_charge_mode = feeChargeMode;
        if (metadata && Object.keys(metadata).length > 0) payload.metadata = metadata;

        const res = await fetch(`${BASE_URL}/checkout-sessions/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            const msg = json?.error?.message || json?.message || `Erreur SasPay (${res.status})`;
            throw new Error(msg);
        }

        return json;
    }

    /**
     * Déclenche un paiement SoftPay (Push USSD direct ou redirection selon l'opérateur)
     * Documentation : https://docs.saspay.me/api-reference/payments/softpay
     */
    async function initiateSoftPay({
        apiKey,
        amount,
        currency = 'XOF',
        country = 'ML',
        description,
        network,
        customer,
        returnUrl,
        feeChargeMode = null,
        metadata = {}
    }) {
        const key = resolveApiKey(apiKey);
        const amtStr = Number(amount).toFixed(2);

        // Simulation démo
        if (!key || key.startsWith('sk_test_demo') || key === 'demo' || key.includes('demo')) {
            const fakeId = 'pay_' + Date.now();
            return {
                success: true,
                isDemo: true,
                data: {
                    id: fakeId,
                    amount: amtStr,
                    currency,
                    network,
                    status: 'PENDING',
                    instructions: `Une demande de débit de ${amtStr} ${currency} a été simulée sur le numéro ${customer?.phone}.`,
                    checkout_url: null
                }
            };
        }

        const payload = {
            amount: amtStr,
            currency: currency === 'FCFA' ? 'XOF' : currency,
            country: country.toUpperCase(),
            network,
            description: description || 'Règlement de facture BTP',
            customer: {
                email: customer.email || 'client@example.com',
                first_name: customer.firstName || (customer.name ? customer.name.split(' ')[0] : 'Client'),
                last_name: customer.lastName || (customer.name ? customer.name.split(' ').slice(1).join(' ') : 'BTP'),
                phone: customer.phone
            }
        };

        if (returnUrl) payload.return_url = returnUrl;
        if (feeChargeMode) payload.fee_charge_mode = feeChargeMode;
        if (metadata && Object.keys(metadata).length > 0) payload.metadata = metadata;

        const idempotencyKey = generateIdempotencyKey();

        const res = await fetch(`${BASE_URL}/payments/softpay/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Idempotency-Key': idempotencyKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            const msg = json?.error?.message || json?.message || (typeof json?.error === 'object' ? JSON.stringify(json.error) : `Erreur SoftPay (${res.status})`);
            throw new Error(msg);
        }

        return json;
    }

    /**
     * Vérifie le statut d'un paiement ou d'une session de checkout
     */
    async function verifyPayment(idOrOptions, maybeOptions = {}) {
        let id, apiKey, type;
        if (typeof idOrOptions === 'object' && idOrOptions !== null) {
            id = idOrOptions.id;
            apiKey = idOrOptions.apiKey;
            type = idOrOptions.type || 'payment';
        } else {
            id = idOrOptions;
            apiKey = maybeOptions?.apiKey;
            type = maybeOptions?.type || 'payment';
        }
        const key = resolveApiKey(apiKey);

        // En mode démo, simuler un succès
        if (!key || key.startsWith('sk_test_demo') || key === 'demo' || String(id).startsWith('pay_demo') || String(id).startsWith('checkout_demo') || String(id).startsWith('chk_demo')) {
            return {
                success: true,
                isDemo: true,
                status: 'SUCCESS',
                paid_at: new Date().toISOString()
            };
        }

        const endpoint = type === 'checkout'
            ? `${BASE_URL}/checkout-sessions/${id}/`
            : `${BASE_URL}/payments/${id}/verify/`;

        const res = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Accept': 'application/json'
            }
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            const msg = json?.error?.message || json?.message || `Erreur de vérification (${res.status})`;
            throw new Error(msg);
        }

        const data = json.data || json;
        const status = (data.status || '').toUpperCase();

        return {
            success: true,
            status: status === 'PAID' ? 'SUCCESS' : status,
            data
        };
    }

    return {
        BASE_URL,
        SASPAY_COUNTRIES,
        GLOBAL_NETWORKS,
        normalizePhoneNumber,
        generateIdempotencyKey,
        testConnection,
        createCheckoutSession,
        initiateSoftPay,
        verifyPayment
    };
}));
