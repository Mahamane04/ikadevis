// SasPay : référentiel partagé avec les abonnements ; encaissements entreprise suspendus.
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

    // Référentiel des pays supportés avec opérateurs Mobile Money.
    //
    // 2026-09-24 — liste RECOUPÉE avec l'API SasPay (GET /networks/, 77
    // réseaux dont 65 actifs). Six opérateurs actifs manquaient sur les pays
    // déjà couverts, dont **wave_ml** : Wave opère bel et bien au Mali, et
    // son absence ici privait les clients maliens du moyen de paiement le
    // plus répandu du pays. À recouper de nouveau si SasPay élargit son
    // catalogue — l'Edge Function, elle, interroge la liste en direct.
    const SASPAY_COUNTRIES = [
        {
            code: 'ML',
            name: 'Mali',
            currency: 'XOF',
            dialCode: '+223',
            flag: '🇲🇱',
            networks: [
                { code: 'orange_ml', name: 'Orange Money Mali', color: '#ff6600', icon: 'fa-mobile-screen-button' },
                { code: 'wave_ml', name: 'Wave Mali', color: '#1dc3f2', icon: 'fa-wave-square' },
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
                { code: 'moov_ci', name: 'Moov Money CI', color: '#005baa', icon: 'fa-mobile-screen-button' },
                { code: 'djamo_ci', name: 'Djamo CI', color: '#1a4ed8', icon: 'fa-credit-card' }
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
                { code: 'wizall_sn', name: 'Wizall Sénégal', color: '#2b2d42', icon: 'fa-mobile-screen-button' },
                { code: 'expresso_sn', name: 'Expresso Sénégal', color: '#e8112d', icon: 'fa-mobile-screen-button' },
                { code: 'djamo_sn', name: 'Djamo Sénégal', color: '#1a4ed8', icon: 'fa-credit-card' },
                { code: 'paydunya_sn', name: 'PayDunya Sénégal', color: '#00a4e4', icon: 'fa-wallet' }
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
                { code: 'moov_bf', name: 'Moov Burkina Faso', color: '#005baa', icon: 'fa-mobile-screen-button' },
                { code: 'touchcash_bf', name: 'TouchCash Burkina Faso', color: '#f59e0b', icon: 'fa-mobile-screen-button' }
            ]
        },
        {
            code: 'TG',
            name: 'Togo',
            currency: 'XOF',
            dialCode: '+228',
            flag: '🇹🇬',
            networks: [
                { code: 'mixx_tg', name: 'Mixx by Yas (Togo)', color: '#00a0df', icon: 'fa-mobile-screen-button' },
                { code: 'togocel', name: 'Togocel Money', color: '#009639', icon: 'fa-mobile-screen-button' },
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
     * Traduit le statut renvoyé par SasPay en trois verdicts sans
     * ambiguïté. Tout ce qui n'est pas explicitement payé ou explicitement
     * échoué reste « en attente » : l'indécision ne vaut jamais
     * encaissement.
     */
    function verdictPaiement(statutBrut) {
        const s = String(statutBrut || '').toUpperCase().trim();
        if (s === 'PAID' || s === 'SUCCESS' || s === 'SUCCEEDED' || s === 'COMPLETED') return 'paid';
        if (s === 'FAILED' || s === 'CANCELLED' || s === 'CANCELED' || s === 'EXPIRED' || s === 'REFUSED') return 'failed';
        return 'pending';
    }

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

    const disabledMessage = 'Les encaissements SasPay sont temporairement indisponibles. Aucun paiement n’a été déclenché.';
    async function testConnection() { return { ok: false, success: false, message: disabledMessage, error: disabledMessage }; }
    async function paymentUnavailable() { throw new Error(disabledMessage); }
    const createCheckoutSession = paymentUnavailable;
    const initiateSoftPay = paymentUnavailable;
    const verifyPayment = paymentUnavailable;
    return {
        BASE_URL,
        SASPAY_COUNTRIES,
        GLOBAL_NETWORKS,
        normalizePhoneNumber,
        generateIdempotencyKey,
        verdictPaiement,
        estConfiguree: function () { return false; },
        testConnection,
        createCheckoutSession,
        initiateSoftPay,
        verifyPayment
    };
}));
