// Utilitaires de formatage — pur JS, aucune dépendance React/JSX.
// Extrait de index_jsx.js le 2026-08-16 (PROJECT_MASTER_TRACKER.md § 15).
// Chargé en script classique AVANT app.compiled.js (voir index.html).
const formatMoney = (amount, currency = 'FCFA') => {
    if (isNaN(amount) || amount === null || amount === undefined) return `0 ${currency}`;
    const rounded = Math.round(amount);
    return `${rounded.toLocaleString('fr-FR')} ${currency}`;
};

