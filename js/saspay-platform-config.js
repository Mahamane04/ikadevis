/**
 * SasPay Platform Gateway Configuration
 * Micro Office / ikadevis SaaS Subscriptions
 * 
 * Cette configuration gère les encaissements des abonnements SaaS ikadevis
 * (Starter 14j, Standard 9 900 F, Pro 14 500 F, Business 29 500 F).
 */

(function () {
    'use strict';

    // Clé par défaut (peut être surchargée via localStorage ou injectée par le serveur)
    const STORAGE_KEY = 'ikadevis_platform_saspay_key';
    const savedKey = (typeof window !== 'undefined' && window.localStorage)
        ? window.localStorage.getItem(STORAGE_KEY)
        : '';

    window.SASPAY_PLATFORM_CONFIG = {
        // Clé API Secrète de la plateforme pour encaisser les abonnements
        // Remplacer par la clé réelle fournie par le propriétaire de la plateforme (ou stockée dans localStorage / config)
        apiKey: savedKey || '',
        
        // Environnement par défaut ('live' ou 'test')
        environment: 'live',
        
        // Pays par défaut pour le SaaS
        defaultCountry: 'ML', // Mali
        
        // Devise
        currency: 'XOF',
        
        // Nom commercial du service
        serviceName: 'ikadevis SaaS - Abonnements',

        // Méthode pour mettre à jour la clé API dynamiquement
        setApiKey: function (newKey) {
            this.apiKey = (newKey || '').trim();
            if (typeof window !== 'undefined' && window.localStorage) {
                if (this.apiKey) {
                    window.localStorage.setItem(STORAGE_KEY, this.apiKey);
                } else {
                    window.localStorage.removeItem(STORAGE_KEY);
                }
            }
        },

        getApiKey: function () {
            return this.apiKey;
        }
    };
})();
