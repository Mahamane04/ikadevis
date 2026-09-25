// Aucun secret de passerelle dans les paramètres publics, snapshots ou caches.
(function (root) {
    function withoutPaymentSecrets(value) {
        if (Array.isArray(value)) return value.map(withoutPaymentSecrets);
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(Object.entries(value)
            .filter(([key]) => !['apiKey', 'api_key', 'secretKey', 'secret_key'].includes(key))
            .map(([key, item]) => [key, withoutPaymentSecrets(item)]));
    }
    function cleanLegacyPaymentCaches(storage) {
        storage.removeItem('ikadevis_platform_saspay_key');
        for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (!key || !(key.startsWith('costcalc:') || key.startsWith('costcalc_'))) continue;
            const raw = storage.getItem(key);
            let data;
            try { data = JSON.parse(raw); } catch (_) { continue; }
            const cleaned = JSON.stringify(withoutPaymentSecrets(data));
            if (cleaned !== raw) storage.setItem(key, cleaned);
        }
    }
    root.PaymentDataSafety = { withoutPaymentSecrets, cleanObject: withoutPaymentSecrets, cleanLegacyPaymentCaches };
})(typeof globalThis === 'undefined' ? window : globalThis);

