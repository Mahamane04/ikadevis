import re

with open('index_jsx.js', 'r', encoding='utf-8') as f:
    src = f.read()

# 1. Update version strings V5.2 -> V5.3
src = src.replace('V5.2', 'V5.3')

# 2. Update LS helper (P0.1)
old_ls = '''const CC_PREFIX = 'costcalc_';
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
        return ['companyInfo', 'materials', 'labor', 'solutions', 'recipes', 'savedQuotes', 'costcalc_materials', 'costcalc_recipes'].some(k => localStorage.getItem(k) !== null);
    },
    getLegacyData: () => {
        const loadKey = (k) => {
            const val = localStorage.getItem('costcalc_' + k) || localStorage.getItem(k);
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
        Object.keys(localStorage).filter(k => k.startsWith('costcalc_') || ['companyInfo','materials','labor','solutions','recipes','savedQuotes','nextQuoteSeq','calcForm','schemaVersion'].includes(k)).forEach(k => localStorage.removeItem(k));
    },
    clearUser: (userId) => {
        const prefix = userId ? ('costcalc:' + userId + ':') : 'costcalc:guest:';
        Object.keys(localStorage).filter(k => k.startsWith(prefix)).forEach(k => localStorage.removeItem(k));
    }
};
if (typeof window !== 'undefined') window.LS = LS;'''

new_ls = '''const CC_PREFIX = 'costcalc_';
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
if (typeof window !== 'undefined') window.LS = LS;'''

if old_ls in src:
    src = src.replace(old_ls, new_ls)
    print('1. LS helper updated with V5.1 guest detection V5.3')
else:
    print('ℹ️ old_ls pattern not found')

# 3. Fix calcForm residual guest write (P1.3)
old_calcform_effect = "useEffect(() => { if (!isReadOnlyDueToDowngrade) LS.set('calcForm', calcForm); }, [calcForm, isReadOnlyDueToDowngrade]);"
if old_calcform_effect in src:
    src = src.replace(old_calcform_effect, "")
    print('2. Residual calcForm guest effect removed V5.3')

# 4. Fix diagnostic customVars default value test (P2.1)
old_diag_cv = "if (sol.customVars) sol.customVars.forEach(cv => { customVarsDefaults[cv.name] = cv.defaultValue !== undefined && cv.defaultValue !== 0 ? cv.defaultValue : 2; });"
new_diag_cv = "if (sol.customVars) sol.customVars.forEach(cv => { customVarsDefaults[cv.name] = cv.defaultValue !== undefined ? cv.defaultValue : 0; });"
if old_diag_cv in src:
    src = src.replace(old_diag_cv, new_diag_cv)
    print('3. Diagnostic customVars test fixed (P2.1)')

with open('index_jsx.js', 'w', encoding='utf-8') as f:
    f.write(src)

print('Base V5.3 patches done.')
"
