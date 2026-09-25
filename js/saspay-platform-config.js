// Compatibilité des anciens liens : aucune clé secrète côté navigateur.
(function () {
    try { localStorage.removeItem('ikadevis_platform_saspay_key'); } catch (_) {}
    window.SASPAY_PLATFORM_CONFIG = Object.freeze({ environment: 'live', defaultCountry: 'ML', currency: 'XOF', serviceName: 'ikadevis SaaS' });
})();
