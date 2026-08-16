import re

with open('index_jsx.js', 'r', encoding='utf-8') as f:
    src = f.read()

# 1. Replace LS helper with V5.5 Outbox helper
old_ls = '''// P0.1 V5.3 — Cache local strictly isolé par user_id + détection guest V5.1
const CC_PREFIX = 'costcalc_';
const LS = {
    getKey: (key, userId) => userId ? ('costcalc:' + userId + ':' + key) : ('costcalc:guest:' + key),
    get: (key, userId) => {
        try {
            const k = LS.getKey(key, userId);
            const v = localStorage.getItem(k);
            if (v !== null) return JSON.parse(v);
            return null;
        } catch(e) { return null; }
    },
    set: (key, val, userId) => {
        try {
            const k = LS.getKey(key, userId);
            localStorage.setItem(k, JSON.stringify(val));
        } catch(e) {}
    },
    hasLegacyUnnamespacedData: () => {
        return ['companyInfo', 'materials', 'labor', 'solutions', 'recipes', 'savedQuotes',
                'costcalc_materials', 'costcalc_recipes',
                'costcalc:guest:materials', 'costcalc:guest:recipes', 'costcalc:guest:savedQuotes'].some(k => localStorage.getItem(k) !== null);
    },
    getLegacyData: () => {
        const loadKey = (k) => {
            const val = localStorage.getItem('costcalc:guest:' + k) || localStorage.getItem('costcalc_' + k) || localStorage.getItem(k);
            try { return val ? JSON.parse(val) : null; } catch(e) { return null; }
        };
        return {
            companyInfo: loadKey('companyInfo'),
            materials: loadKey('materials'),
            labor: loadKey('labor'),
            solutions: loadKey('solutions'),
            recipes: loadKey('recipes'),
            savedQuotes: loadKey('savedQuotes'),
            nextQuoteSeq: loadKey('nextQuoteSeq')
        };
    },
    clearLegacyData: () => {
        Object.keys(localStorage).filter(k => k.startsWith('costcalc_') || k.startsWith('costcalc:guest:') || ['companyInfo','materials','labor','solutions','recipes','savedQuotes','nextQuoteSeq','calcForm','schemaVersion'].includes(k)).forEach(k => localStorage.removeItem(k));
    },
    clearUser: (userId) => {
        const prefix = userId ? ('costcalc:' + userId + ':') : 'costcalc:guest:';
        Object.keys(localStorage).filter(k => k.startsWith(prefix)).forEach(k => localStorage.removeItem(k));
    }
};
if (typeof window !== 'undefined') window.LS = LS;
if (typeof window !== 'undefined') window.LS = LS;'''

new_ls = '''// P0.1 V5.5 — Cache local isolé par user_id + Outbox persistant & détection guest V5.1
const CC_PREFIX = 'costcalc_';
const LS = {
    getKey: (key, userId) => userId ? ('costcalc:' + userId + ':' + key) : ('costcalc:guest:' + key),
    get: (key, userId) => {
        try {
            const k = LS.getKey(key, userId);
            const v = localStorage.getItem(k);
            if (v !== null) return JSON.parse(v);
            return null;
        } catch(e) { return null; }
    },
    set: (key, val, userId) => {
        try {
            const k = LS.getKey(key, userId);
            localStorage.setItem(k, JSON.stringify(val));
        } catch(e) {}
    },
    getOutbox: (userId) => {
        if (!userId) return {};
        try {
            const v = localStorage.getItem('costcalc:' + userId + ':outbox');
            return v ? JSON.parse(v) : {};
        } catch(e) { return {}; }
    },
    setOutboxKey: (key, val, userId) => {
        if (!userId) return;
        try {
            const outbox = LS.getOutbox(userId);
            outbox[key] = val;
            localStorage.setItem('costcalc:' + userId + ':outbox', JSON.stringify(outbox));
        } catch(e) {}
    },
    clearOutboxKey: (key, userId) => {
        if (!userId) return;
        try {
            const outbox = LS.getOutbox(userId);
            delete outbox[key];
            if (Object.keys(outbox).length === 0) {
                localStorage.removeItem('costcalc:' + userId + ':outbox');
            } else {
                localStorage.setItem('costcalc:' + userId + ':outbox', JSON.stringify(outbox));
            }
        } catch(e) {}
    },
    clearOutbox: (userId) => {
        if (!userId) return;
        localStorage.removeItem('costcalc:' + userId + ':outbox');
    },
    hasLegacyUnnamespacedData: () => {
        return ['companyInfo', 'materials', 'labor', 'solutions', 'recipes', 'savedQuotes',
                'costcalc_materials', 'costcalc_recipes',
                'costcalc:guest:materials', 'costcalc:guest:recipes', 'costcalc:guest:savedQuotes'].some(k => localStorage.getItem(k) !== null);
    },
    getLegacyData: () => {
        const loadKey = (k) => {
            const val = localStorage.getItem('costcalc:guest:' + k) || localStorage.getItem('costcalc_' + k) || localStorage.getItem(k);
            try { return val ? JSON.parse(val) : null; } catch(e) { return null; }
        };
        const rawSchema = localStorage.getItem('costcalc:guest:schemaVersion') || localStorage.getItem('schemaVersion');
        return {
            companyInfo: loadKey('companyInfo'),
            materials: loadKey('materials'),
            labor: loadKey('labor'),
            solutions: loadKey('solutions'),
            recipes: loadKey('recipes'),
            savedQuotes: loadKey('savedQuotes'),
            nextQuoteSeq: loadKey('nextQuoteSeq'),
            schemaVersion: rawSchema ? parseInt(rawSchema, 10) : 8
        };
    },
    clearLegacyData: () => {
        Object.keys(localStorage).filter(k => k.startsWith('costcalc_') || k.startsWith('costcalc:guest:') || ['companyInfo','materials','labor','solutions','recipes','savedQuotes','nextQuoteSeq','calcForm','schemaVersion'].includes(k)).forEach(k => localStorage.removeItem(k));
    },
    clearUser: (userId) => {
        const prefix = userId ? ('costcalc:' + userId + ':') : 'costcalc:guest:';
        Object.keys(localStorage).filter(k => k.startsWith(prefix)).forEach(k => localStorage.removeItem(k));
    }
};
if (typeof window !== 'undefined') window.LS = LS;'''

if old_ls in src:
    src = src.replace(old_ls, new_ls)
    print("1. LS Helper updated with Outbox methods V5.5")
else:
    print("ℹ️ old_ls pattern match failed, checking fallback")

# 2. Remove module-level _schemaCheck (P0.2)
old_schema_check = '''const _schemaCheck = (() => {
    const storedRaw = localStorage.getItem(CC_PREFIX + 'schemaVersion') || localStorage.getItem('schemaVersion');
    const storedInt = storedRaw ? parseInt(storedRaw) : 0;
    const isDowngrade = storedInt > CURRENT_SCHEMA_INT;
    if (isDowngrade) console.warn(`[COSTCALC V5.2] Anti-downgrade: DB schema V${storedInt} > V${CURRENT_SCHEMA_INT}.`);
    return { isDowngrade, storedInt, storedRaw };
})();'''

new_schema_check = '''// P0.2 V5.5 — Contrôle de schéma post-Auth utilisateur (suppression du _schemaCheck pré-Auth global)'''

if old_schema_check in src:
    src = src.replace(old_schema_check, new_schema_check)
    print("2. Module-level _schemaCheck replaced with Post-Auth logic V5.5")

# 3. Diagnostic customVars defaultValue test fix (P1.2)
old_cv = "if (sol.customVars) sol.customVars.forEach(cv => { customVarsDefaults[cv.name] = cv.defaultValue !== undefined && cv.defaultValue !== 0 ? cv.defaultValue : 2; });"
new_cv = "if (sol.customVars) sol.customVars.forEach(cv => { customVarsDefaults[cv.name] = cv.defaultValue !== undefined ? cv.defaultValue : 0; });"
if old_cv in src:
    src = src.replace(old_cv, new_cv)
    print("3. Catalog diagnostic defaultValue=0 test fixed V5.5")

with open('index_jsx.js', 'w', encoding='utf-8') as f:
    f.write(src)

print("Base script done.")
"
