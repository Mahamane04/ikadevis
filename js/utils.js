// Utilitaires de formatage — pur JS, aucune dépendance React/JSX.
// Extrait de index_jsx.js le 2026-08-16 (PROJECT_MASTER_TRACKER.md § 15).
// Chargé en script classique AVANT app.compiled.js (voir index.html).
const formatMoney = (amount, currency = 'FCFA') => {
    if (isNaN(amount) || amount === null || amount === undefined) return `0 ${currency}`;
    const rounded = Math.round(amount);
    return `${rounded.toLocaleString('fr-FR')} ${currency}`;
};


// M2 (2026-08-18) — Recherche insensible aux accents. Un prospect qui tape
// "maconnerie" ou "etiquette" sans accent (courant sur clavier de téléphone)
// n'obtenait AUCUN résultat, même si l'ouvrage cherché existait — la
// comparaison ne normalisait ni le terme tapé ni le nom du catalogue.
// \p{Diacritic} nécessite le flag /u ; normalize('NFD') décompose d'abord
// chaque caractère accentué en lettre de base + diacritique séparé.
const normalizeSearchText = (s) => (s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
