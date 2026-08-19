// Moteur de calcul BTP — pur JS, aucune dépendance React/JSX.
// Extrait de index_jsx.js le 2026-08-16 (PROJECT_MASTER_TRACKER.md § 6/§15) :
// parser mathématique sécurisé (SafeMathEvaluator, zéro eval/new Function),
// optimiseurs de découpe 1D/2D, conversions d'unités BTP, moteur de calcul
// par ouvrage/devis (calculateSingleWorkItem, calculateHybridQuote), et
// migrateur de schéma de recettes. Chargé en script classique AVANT
// app.compiled.js (voir index.html) : tout est en portée globale, comme
// dans index_jsx.js d'origine — pas de import/export ES module.
const RESERVED_KEYWORDS = [
    'SURFACE', 'PERIMETRE', 'VOLUME', 'PROFONDEUR', 'EPAISSEUR', 'LONGUEUR', 'LINEAIRE', 'LARGEUR', 'HAUTEUR',
    'QTY', 'FACES', 'L', 'H', 'P', 'Q', 'F', 'RENDEMENT_MO', 'RENDEMENT_MATIERE',
    'TARIF_MO', 'TARIF_MATIERE', 'CEIL', 'FLOOR', 'ROUND', 'MIN', 'MAX', 'ABS', 'SQRT', 'IF'
];


const ALLOWED_VARS_BY_MODE = {
    rectangle: ['SURFACE', 'PERIMETRE', 'LARGEUR', 'HAUTEUR', 'QTY', 'FACES', 'L', 'H', 'Q', 'F', 'RENDEMENT_MO', 'RENDEMENT_MATIERE', 'TARIF_MO', 'TARIF_MATIERE'],
    surface: ['SURFACE', 'QTY', 'FACES', 'Q', 'F', 'RENDEMENT_MO', 'RENDEMENT_MATIERE', 'TARIF_MO', 'TARIF_MATIERE'],
    volume: ['SURFACE', 'VOLUME', 'PERIMETRE', 'LARGEUR', 'HAUTEUR', 'PROFONDEUR', 'EPAISSEUR', 'QTY', 'FACES', 'L', 'H', 'P', 'Q', 'F', 'RENDEMENT_MO', 'RENDEMENT_MATIERE', 'TARIF_MO', 'TARIF_MATIERE'],
    linear: ['LONGUEUR', 'LINEAIRE', 'PERIMETRE', 'QTY', 'FACES', 'Q', 'F', 'RENDEMENT_MO', 'RENDEMENT_MATIERE', 'TARIF_MO', 'TARIF_MATIERE'],
    floor: ['SURFACE', 'PERIMETRE', 'LARGEUR', 'LONGUEUR', 'LINEAIRE', 'QTY', 'FACES', 'L', 'Q', 'F', 'RENDEMENT_MO', 'RENDEMENT_MATIERE', 'TARIF_MO', 'TARIF_MATIERE'],
    unit: ['QTY', 'FACES', 'Q', 'F', 'RENDEMENT_MO', 'RENDEMENT_MATIERE', 'TARIF_MO', 'TARIF_MATIERE']
};


// Optimiseur BTP 1D : Bin-packing pour découpe de profilés (barres fer/alu)
const optimize1DLinearCuts = (cutLengths, barLength = 6.0) => {
    if (!Array.isArray(cutLengths) || cutLengths.length === 0) {
        return { barsNeeded: 0, totalBarLength: 0, wasteLength: 0, efficiencyPercent: 100 };
    }
    for (let i = 0; i < cutLengths.length; i++) {
        const len = cutLengths[i];
        if (typeof len !== 'number' || isNaN(len) || len <= 0) {
            return { error: `Dimension de pièce invalide (${len} m <= 0)`, barsNeeded: 0, totalBarLength: 0, wasteLength: 0, efficiencyPercent: 0 };
        }
        if (len > barLength) {
            return { error: `La pièce de ${len.toFixed(2)} m ne peut pas être obtenue dans une barre commerciale de ${barLength.toFixed(2)} m.`, barsNeeded: 0, totalBarLength: 0, wasteLength: 0, efficiencyPercent: 0 };
        }
    }
    const sorted = [...cutLengths].sort((a, b) => b - a);
    const bars = [];
    sorted.forEach(len => {
        let placed = false;
        for (let i = 0; i < bars.length; i++) {
            if (bars[i] + len <= barLength + 1e-6) {
                bars[i] += len;
                placed = true;
                break;
            }
        }
        if (!placed) bars.push(len);
    });
    const barsNeeded = bars.length;
    const totalBarLength = barsNeeded * barLength;
    const usedLength = cutLengths.reduce((a, b) => a + b, 0);
    const wasteLength = Math.max(0, totalBarLength - usedLength);
    const efficiencyPercent = totalBarLength > 0 ? Math.min(100, Math.max(0, Math.round((usedLength / totalBarLength) * 100))) : 0;
    return { barsNeeded, totalBarLength, wasteLength, efficiencyPercent };
};


// Optimiseur BTP 2D : Nesting & calepinage pour découpe de panneaux (tôles/Alucobond/MDF)
const optimize2DSheetNesting = (pieceWidth, pieceHeight, pieceQty, sheetWidth = 3.0, sheetHeight = 1.0) => {
    if (pieceWidth <= 0 || pieceHeight <= 0 || pieceQty <= 0) {
        return { error: 'Dimensions de panneau ou quantité invalide', sheetsNeeded: 0, totalSheetArea: 0, wasteArea: 0, maxPerSheet: 0, efficiencyPercent: 0 };
    }
    const pieceArea = pieceWidth * pieceHeight * pieceQty;
    const sheetArea = sheetWidth * sheetHeight;
    if (sheetArea <= 0) return { sheetsNeeded: 0, totalSheetArea: 0, wasteArea: 0, maxPerSheet: 0, efficiencyPercent: 0 };

    const perSheetNormal = Math.floor(sheetWidth / pieceWidth) * Math.floor(sheetHeight / pieceHeight);
    const perSheetRotated = Math.floor(sheetWidth / pieceHeight) * Math.floor(sheetHeight / pieceWidth);
    const maxPerSheet = Math.max(perSheetNormal, perSheetRotated);

    if (maxPerSheet === 0) {
        return { error: `La pièce de ${pieceWidth.toFixed(2)} × ${pieceHeight.toFixed(2)} m ne rentre pas dans une plaque commerciale de ${sheetWidth.toFixed(2)} × ${sheetHeight.toFixed(2)} m.`, sheetsNeeded: 0, totalSheetArea: 0, wasteArea: 0, maxPerSheet: 0, efficiencyPercent: 0 };
    }

    const sheetsNeeded = Math.ceil(pieceQty / maxPerSheet);
    const totalSheetArea = sheetsNeeded * sheetArea;
    const wasteArea = Math.max(0, totalSheetArea - pieceArea);
    const efficiencyPercent = totalSheetArea > 0 ? Math.min(100, Math.max(0, Math.round((pieceArea / totalSheetArea) * 100))) : 0;
    return { sheetsNeeded, totalSheetArea, wasteArea, maxPerSheet, efficiencyPercent };
};


// SCHEMA MIGRATOR V5.7 — chaîne de migrations par version
const migrateRecipes = (rawRecipes, fromVersion) => {
    if (!Array.isArray(rawRecipes)) return rawRecipes;
    let result = rawRecipes;
    // migrate7To8: normaliser les alias de formules
    if (fromVersion < 8) {
        result = result.map(r => {
            if (!r || !r.formula) return r;
            const newFormula = r.formula
                .replace(/\bsurface\b/gi, 'SURFACE')
                .replace(/\bperimetre\b/gi, 'PERIMETRE')
                .replace(/\bunite\b/gi, 'QTY')
                .replace(/\bforfait\b/gi, '1')
                .replace(/\brenforts\b/gi, '(HAUTEUR * floor(LARGEUR) * QTY)');
            return { ...r, formula: newFormula };
        });
    }
    // migrate8To9: s'assurer que costCategory est toujours présent
    if (fromVersion < 9) {
        result = result.map(r => ({
            ...r,
            costCategory: r.costCategory || (r.type === 'labor' ? 'labor' : 'material')
        }));
    }
    return result;
};


// 1. SYSTÈME UNIVERSEL D'UNITÉS BTP AVEC CONVERSIONS AUTOMATIQUES
const BTP_UNIT_CATEGORIES = {
    length: {
        base: 'm',
        units: {
            'mm': 0.001,
            'cm': 0.01,
            'dm': 0.1,
            'm': 1,
            'ml': 1,
            'km': 1000
        }
    },
    surface: {
        base: 'm²',
        units: {
            'mm²': 0.000001,
            'cm²': 0.0001,
            'dm²': 0.01,
            'm²': 1,
            'ha': 10000
        }
    },
    volume: {
        base: 'm³',
        units: {
            'mm³': 1e-9,
            'cm³': 0.000001,
            'dm³': 0.001,
            'm³': 1,
            'ml': 0.000001,
            'cl': 0.00001,
            'l': 0.001,
            'L': 0.001,
            'hl': 0.1
        }
    },
    weight: {
        base: 'kg',
        units: {
            'mg': 0.000001,
            'g': 0.001,
            'kg': 1,
            'q': 100,
            't': 1000,
            'tonne': 1000
        }
    },
    time: {
        base: 'h',
        units: {
            'min': 1 / 60,
            'h': 1,
            'heure': 1,
            'j': 8,
            'jour': 8,
            'semaine': 40
        }
    },
    count: {
        base: 'u',
        units: {
            'u': 1,
            'unite': 1,
            'forfait': 1,
            'barre': 1,
            'plaque': 1,
            'rouleau': 1,
            'carton': 1,
            'sac': 1,
            'pot': 1,
            'seau': 1,
            'palette': 1
        }
    }
};


function getUnitCategory(unit) {
    if (!unit) return null;
    const clean = String(unit).trim().toLowerCase();
    for (const [catName, catData] of Object.entries(BTP_UNIT_CATEGORIES)) {
        if (Object.keys(catData.units).map(u => u.toLowerCase()).includes(clean)) {
            return catName;
        }
    }
    return null;
}


function convertUnit(value, fromUnit, toUnit) {
    const val = parseFloat(value);
    if (isNaN(val)) return 0;
    if (!fromUnit || !toUnit || fromUnit === toUnit) return val;

    const fromClean = String(fromUnit).trim();
    const toClean = String(toUnit).trim();
    const catFrom = getUnitCategory(fromClean);
    const catTo = getUnitCategory(toClean);

    if (!catFrom || !catTo || catFrom !== catTo) {
        return val;
    }

    const catUnits = BTP_UNIT_CATEGORIES[catFrom].units;
    const fromFactor = catUnits[fromClean] || catUnits[fromClean.toLowerCase()] || 1;
    const toFactor = catUnits[toClean] || catUnits[toClean.toLowerCase()] || 1;

    return (val * fromFactor) / toFactor;
}


// 2. PARSER MATHÉMATIQUE SÉCURISÉ (AST SANS EVAL NI new Function)
class SafeMathEvaluator {
    static tokenize(expr) {
        const tokens = [];
        let i = 0;
        const s = expr.trim();

        while (i < s.length) {
            const char = s[i];

            if (/\s/.test(char)) {
                i++;
                continue;
            }

            // Nombres décimaux ou entiers
            if (/[0-9]/.test(char) || (char === '.' && i + 1 < s.length && /[0-9]/.test(s[i + 1]))) {
                let numStr = '';
                while (i < s.length && (/[0-9]/.test(s[i]) || s[i] === '.')) {
                    numStr += s[i];
                    i++;
                }
                tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
                continue;
            }

            // Identifiants (Variables ou Fonctions Mathématiques)
            if (/[a-zA-Z_À-ÿ]/.test(char)) {
                let idStr = '';
                while (i < s.length && /[a-zA-Z0-9_À-ÿ]/.test(s[i])) {
                    idStr += s[i];
                    i++;
                }
                tokens.push({ type: 'IDENTIFIER', value: idStr.toUpperCase() });
                continue;
            }

            // Opérateurs de comparaison à 2 caractères
            if (i + 1 < s.length) {
                const twoChar = char + s[i + 1];
                if (['<=', '>=', '==', '!=', '&&', '||'].includes(twoChar)) {
                    tokens.push({ type: 'OPERATOR', value: twoChar });
                    i += 2;
                    continue;
                }
            }

            // Opérateurs arithmétiques & séparateurs 1 caractère
            if (['+', '-', '*', '/', '%', '^', '<', '>', '!', '(', ')', ',', '?', ':'].includes(char)) {
                tokens.push({ type: char === '(' ? 'LPAREN' : char === ')' ? 'RPAREN' : char === ',' ? 'COMMA' : 'OPERATOR', value: char });
                i++;
                continue;
            }

            throw new Error(`Caractère non autorisé dans la formule : "${char}"`);
        }

        return tokens;
    }

    static parseAndEvaluate(expr, scope = {}) {
        if (!expr || typeof expr !== 'string' || !expr.trim()) return 0;
        const tokens = this.tokenize(expr);
        let pos = 0;

        const peek = () => tokens[pos];
        const consume = (expectedType, expectedVal) => {
            const token = tokens[pos];
            if (!token) throw new Error("Fin inattendue de l'expression mathématique");
            if (expectedType && token.type !== expectedType) {
                throw new Error(`Attendu type ${expectedType}, reçu ${token.type} (${token.value})`);
            }
            if (expectedVal && token.value !== expectedVal) {
                throw new Error(`Attendu ${expectedVal}, reçu ${token.value}`);
            }
            pos++;
            return token;
        };

        // Recursive Descent Parser
        const parseExpression = () => parseTernary();

        const parseTernary = () => {
            let left = parseLogicalOr();
            if (peek() && peek().value === '?') {
                consume('OPERATOR', '?');
                const trueBranch = parseExpression();
                consume('OPERATOR', ':');
                const falseBranch = parseExpression();
                return left ? trueBranch : falseBranch;
            }
            return left;
        };

        const parseLogicalOr = () => {
            let left = parseLogicalAnd();
            while (peek() && peek().value === '||') {
                consume('OPERATOR', '||');
                const right = parseLogicalAnd();
                left = (left || right) ? 1 : 0;
            }
            return left;
        };

        const parseLogicalAnd = () => {
            let left = parseComparison();
            while (peek() && peek().value === '&&') {
                consume('OPERATOR', '&&');
                const right = parseComparison();
                left = (left && right) ? 1 : 0;
            }
            return left;
        };

        const parseComparison = () => {
            let left = parseAddSub();
            while (peek() && ['<', '<=', '>', '>=', '==', '!='].includes(peek().value)) {
                const op = consume('OPERATOR').value;
                const right = parseAddSub();
                switch (op) {
                    case '<': left = left < right ? 1 : 0; break;
                    case '<=': left = left <= right ? 1 : 0; break;
                    case '>': left = left > right ? 1 : 0; break;
                    case '>=': left = left >= right ? 1 : 0; break;
                    case '==': left = left === right ? 1 : 0; break;
                    case '!=': left = left !== right ? 1 : 0; break;
                }
            }
            return left;
        };

        const parseAddSub = () => {
            let left = parseMulDiv();
            while (peek() && (peek().value === '+' || peek().value === '-')) {
                const op = consume('OPERATOR').value;
                const right = parseMulDiv();
                left = op === '+' ? left + right : left - right;
            }
            return left;
        };

        const parseMulDiv = () => {
            let left = parsePower();
            while (peek() && (peek().value === '*' || peek().value === '/' || peek().value === '%')) {
                const op = consume('OPERATOR').value;
                const right = parsePower();
                if (op === '/' && right === 0) {
                    throw new Error("Division par zéro dans la formule");
                }
                left = op === '*' ? left * right : op === '/' ? left / right : left % right;
            }
            return left;
        };

        const parsePower = () => {
            let left = parseUnary();
            while (peek() && peek().value === '^') {
                consume('OPERATOR', '^');
                const right = parseUnary();
                left = Math.pow(left, right);
            }
            return left;
        };

        const parseUnary = () => {
            if (peek() && peek().value === '-') {
                consume('OPERATOR', '-');
                return -parseUnary();
            }
            if (peek() && peek().value === '+') {
                consume('OPERATOR', '+');
                return parseUnary();
            }
            if (peek() && peek().value === '!') {
                consume('OPERATOR', '!');
                return !parseUnary() ? 1 : 0;
            }
            return parsePrimary();
        };

        const parsePrimary = () => {
            const token = peek();
            if (!token) throw new Error("Expression incomplète");

            if (token.type === 'NUMBER') {
                consume('NUMBER');
                return token.value;
            }

            if (token.type === 'LPAREN') {
                consume('LPAREN');
                const val = parseExpression();
                consume('RPAREN');
                return val;
            }

            if (token.type === 'IDENTIFIER') {
                const id = consume('IDENTIFIER').value;

                // Appel de fonction mathématique
                if (peek() && peek().type === 'LPAREN') {
                    consume('LPAREN');
                    const args = [];
                    if (!peek() || peek().type !== 'RPAREN') {
                        args.push(parseExpression());
                        while (peek() && peek().type === 'COMMA') {
                            consume('COMMA');
                            args.push(parseExpression());
                        }
                    }
                    consume('RPAREN');

                    switch (id) {
                        case 'CEIL': return Math.ceil(args[0] || 0);
                        case 'FLOOR': return Math.floor(args[0] || 0);
                        case 'ROUND': {
                            const decimals = args[1] !== undefined ? args[1] : 0;
                            const factor = Math.pow(10, decimals);
                            return Math.round((args[0] || 0) * factor) / factor;
                        }
                        case 'MIN': return Math.min(...args);
                        case 'MAX': return Math.max(...args);
                        case 'ABS': return Math.abs(args[0] || 0);
                        case 'SQRT': {
                            if (args[0] < 0) throw new Error("Racine carrée d'un nombre négatif impossible");
                            return Math.sqrt(args[0] || 0);
                        }
                        case 'IF': return args[0] ? (args[1] !== undefined ? args[1] : 1) : (args[2] !== undefined ? args[2] : 0);
                        case 'POW': return Math.pow(args[0] || 0, args[1] || 1);
                        default:
                            throw new Error(`Fonction inconnue : "${id}()"`);
                    }
                }

                // Variable du Scope
                if (scope[id] !== undefined) {
                    const numVal = parseFloat(scope[id]);
                    return isNaN(numVal) ? 0 : numVal;
                }

                // Variable en minuscule fallback
                const lowerId = id.toLowerCase();
                if (scope[lowerId] !== undefined) {
                    const numVal = parseFloat(scope[lowerId]);
                    return isNaN(numVal) ? 0 : numVal;
                }

                // Constantes
                if (['PI'].includes(id)) return Math.PI;
                if (['E'].includes(id)) return Math.E;

                throw new Error(`Variable non définie dans la formule : "${id}"`);
            }

            throw new Error(`Symbole inattendu : "${token.value}"`);
        };

        const result = parseExpression();
        if (pos < tokens.length) {
            throw new Error(`Fin d'expression inattendue après "${tokens[pos - 1]?.value}"`);
        }
        return isNaN(result) || !isFinite(result) ? 0 : result;
    }
}


// BLOC 3 : Safe Math Evaluator V6 (100% AST Parser, ZERO new Function)
const safeEvaluateMath = (expression, scope = {}) => {
    if (!expression || typeof expression !== 'string') return 0;
    try {
        const sanitizedScope = {};
        Object.keys(scope).forEach(k => {
            sanitizedScope[k.toUpperCase()] = parseFloat(scope[k]) || 0;
            sanitizedScope[k.toLowerCase()] = parseFloat(scope[k]) || 0;
        });
        const result = SafeMathEvaluator.parseAndEvaluate(expression, sanitizedScope);
        if (isNaN(result) || !isFinite(result)) {
            throw new Error("Calcul invalide (division par zéro ou valeur indéfinie)");
        }
        if (result < 0) {
            throw new Error(`Le résultat de la formule est négatif (${result}), ce qui est impossible pour une quantité d'ouvrage.`);
        }
        return result;
    } catch (e) {
        throw new Error(e.message || "Erreur de calcul mathématique");
    }
};

if (typeof window !== 'undefined') {
    window.SafeMathEvaluator = SafeMathEvaluator;
    window.convertUnit = convertUnit;
    window.evaluateCustomFormula = safeEvaluateMath;
}


const evaluateDynamicFormula = (formulaStr, vars = {}, extraContext = {}) => {
    if (!formulaStr) return { value: 0, error: null };
    
    const takeoffMode = vars.takeoffMode || 'rectangle';
    const allowedVars = ALLOWED_VARS_BY_MODE[takeoffMode] || ALLOWED_VARS_BY_MODE.rectangle;

    let normalizedFormula = formulaStr
        .replace(/\bsurface\b/gi, 'SURFACE')
        .replace(/\bperimetre\b/gi, 'PERIMETRE')
        .replace(/\bunite\b/gi, 'QTY')
        .replace(/\bforfait\b/gi, '1')
        .replace(/\brenforts\b/gi, '(HAUTEUR * floor(LARGEUR) * QTY)');

    const reservedUsed = RESERVED_KEYWORDS.filter(kw => {
        const regex = new RegExp('(?<![a-zA-Z0-9_])' + kw + '(?![a-zA-Z0-9_])', 'g');
        return regex.test(normalizedFormula);
    });

    for (const kw of reservedUsed) {
        if (['CEIL', 'FLOOR', 'ROUND', 'MIN', 'MAX', 'ABS', 'SQRT', 'IF'].includes(kw)) continue;
        const isExplicitInVars = vars && (vars[kw] !== undefined || vars[kw.toLowerCase()] !== undefined);
        const isExplicitInExtra = extraContext && (extraContext[kw] !== undefined || extraContext[kw.toLowerCase()] !== undefined);
        if (!allowedVars.includes(kw) && !isExplicitInVars && !isExplicitInExtra) {
            return { 
                value: 0, 
                error: `Formule incompatible : la variable "${kw}" n'est pas disponible en mode "${takeoffMode}".` 
            };
        }
    }

    const uppercaseVars = {};
    if (vars && typeof vars === 'object') {
        Object.keys(vars).forEach(k => {
            const num = parseFloat(vars[k]);
            uppercaseVars[k.toUpperCase()] = (!isNaN(num) && typeof vars[k] !== 'boolean') ? num : vars[k];
        });
    }

    const w = Math.max(0, parseFloat(vars.width || vars.LARGEUR || vars.largeur || vars.L) || 0);
    const h = Math.max(0, parseFloat(vars.height || vars.HAUTEUR || vars.hauteur || vars.H) || 0);
    const d = Math.max(0, parseFloat(vars.depth || vars.depthDirect || vars.PROFONDEUR || vars.profondeur || vars.EPAISSEUR || vars.epaisseur || vars.P) || 0);
    const l = Math.max(0, parseFloat(vars.length || vars.LONGUEUR || vars.longueur || vars.LINEAIRE || vars.lineaire) || 0);
    const q = Math.max(1, parseInt(vars.qty || vars.QTY || vars.Q) || 1);
    const f = Math.max(1, parseInt(vars.faces || vars.FACES || vars.F) || 1);

    const directSurf = parseFloat(vars.SURFACE || vars.surface || vars.surfaceDirect);
    let surfaceValue = !isNaN(directSurf) && directSurf > 0 ? directSurf : (w * h * q * f);
    if (takeoffMode === 'surface') surfaceValue = (parseFloat(vars.surfaceDirect) || directSurf || 0) * q;
    else if (takeoffMode === 'floor') surfaceValue = w * (parseFloat(vars.lengthDirect)||l||w) * q;
    else if (takeoffMode === 'volume') surfaceValue = !isNaN(directSurf) && directSurf > 0 ? directSurf : (w * h * q * f);
    else if (takeoffMode === 'linear') surfaceValue = (parseFloat(vars.lengthDirect)||l||w) * q;

    const directVol = parseFloat(vars.VOLUME || vars.volume || vars.volumeDirect);
    const volumeValue = !isNaN(directVol) && directVol > 0 ? directVol : ((takeoffMode === 'volume') ? (surfaceValue * (d || 1)) : (surfaceValue * (d || 1)));

    let perimetreValue = 2 * (w + h) * q;
    if (takeoffMode === 'floor') {
        const floorLen = parseFloat(vars.lengthDirect) || l || w;
        perimetreValue = 2 * (w + floorLen) * q;
    } else if (takeoffMode === 'linear') {
        perimetreValue = (parseFloat(vars.lengthDirect)||l||w) * q;
    }

    const lineaireVal = (takeoffMode === 'linear') ? (parseFloat(vars.lengthDirect)||l||w) * q : l * q;

    const scope = {
        ...vars,
        ...uppercaseVars,
        ...extraContext,
        SURFACE: surfaceValue,
        PERIMETRE: perimetreValue,
        VOLUME: volumeValue,
        PROFONDEUR: d, EPAISSEUR: d,
        LARGEUR: w, HAUTEUR: h, LONGUEUR: lineaireVal, LINEAIRE: lineaireVal, QTY: q, FACES: f,
        L: w, H: h, P: d, Q: q, F: f
    };

    try {
        const val = safeEvaluateMath(normalizedFormula, scope);
        return { value: val, error: null };
    } catch (e) {
        return { value: 0, error: e.message };
    }
};
// M4+M5 (2026-08-18) — Le garde-fou de mode intégré à evaluateDynamicFormula
// (ligne ~544 : rejette une formule si la variable qu'elle utilise n'est PAS
// "explicite" dans vars ET n'est pas listée dans ALLOWED_VARS_BY_MODE) ne
// bloquait jamais rien en pratique : tous les appelants (calculateSingleWorkItem,
// systemDiagnostic) construisaient un contexte complet avec
// SURFACE/LARGEUR/HAUTEUR/... TOUJOURS présents, quel que soit le mode réel —
// rendant ces variables "explicites" et donc jamais rejetées, même en mode
// 'unit' où aucune d'elles n'a de sens. Ce filtre retire du contexte, AVANT
// l'appel, les variables géométriques que le mode courant n'autorise pas —
// seul endroit où appliquer le filtre une fois pour que le garde-fou
// redevienne effectif partout où il est invoqué.
const GEOMETRY_VAR_KEYS = ['SURFACE', 'PERIMETRE', 'VOLUME', 'PROFONDEUR', 'EPAISSEUR', 'LONGUEUR', 'LINEAIRE', 'LARGEUR', 'HAUTEUR', 'L', 'H', 'P'];
const filterVarsForMode = (mode, vars) => {
    const allowed = ALLOWED_VARS_BY_MODE[mode] || ALLOWED_VARS_BY_MODE.rectangle;
    const filtered = {};
    Object.keys(vars).forEach(k => {
        if (GEOMETRY_VAR_KEYS.includes(k) && !allowed.includes(k)) return;
        filtered[k] = vars[k];
    });
    return filtered;
};
if (typeof window !== 'undefined') {
    window.evaluateDynamicFormula = evaluateDynamicFormula;
    window.filterVarsForMode = filterVarsForMode;
    window.optimize1DLinearCuts = optimize1DLinearCuts;
    window.optimize2DSheetNesting = optimize2DSheetNesting;
}


function generateNextQuoteNumber(existingQuotes, currentYear = new Date().getFullYear()) {
    if (!Array.isArray(existingQuotes) || existingQuotes.length === 0) {
        return `DEV-${currentYear}-001`;
    }
    const pattern = new RegExp(`DEV-${currentYear}-(\\d+)`);
    const seqs = existingQuotes
        .map(q => {
            const match = String(q.number || '').match(pattern);
            return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => !isNaN(n) && n > 0);

    const maxSeq = seqs.length > 0 ? Math.max(...seqs) : 0;
    return `DEV-${currentYear}-${String(maxSeq + 1).padStart(3, '0')}`;
}


function calculateSingleWorkItem(item, solutions, materials, labor, recipes, quoteFinancials = {}) {
    if (item.isCustom) {
        const qty = Math.max(1, parseFloat(item.qty) || 1);
        const unitPriceHT = Math.max(0, parseFloat(item.unitPriceHT) || 0);
        const totalHT = Math.round(qty * unitPriceHT);
        const hasKnownCost = parseFloat(item.costUnit) > 0;
        const debourse = hasKnownCost ? Math.round(parseFloat(item.costUnit) * qty) : null;
        const overheadRate = Math.min(50, Math.max(0, parseFloat(quoteFinancials.overheadRate || 5)));
        const vatRate = Math.min(50, Math.max(0, parseFloat(quoteFinancials.vatRate || 18)));
        const fraisGen = hasKnownCost ? Math.round(debourse * (overheadRate / 100)) : null;
        const revient = hasKnownCost ? debourse + fraisGen : null;
        const marge = hasKnownCost ? totalHT - revient : null;
        return {
            ...item,
            name: item.name || 'Ligne Libre',
            qty,
            unit: item.unit || 'u',
            unitPriceHT,
            totalHT,
            quoteData: {
                solutionName: item.name,
                totalDebourseConsomme: debourse,
                totalDebourseAchat: debourse,
                fraisGenerauxConsomme: fraisGen,
                fraisGenerauxAchat: fraisGen,
                totalRevientConsomme: revient,
                totalRevientAchat: revient,
                netHTConsomme: totalHT,
                netHTAchat: totalHT,
                tvaConsomme: Math.round(totalHT * (vatRate / 100)),
                totalTTCConsomme: Math.round(totalHT * (1 + (vatRate / 100))),
                margeValeurConsomme: marge,
                details: []
            }
        };
    }

    const solution = solutions.find(s => s.id === item.solutionId) || solutions[0];
    if (!solution) return { ...item, error: 'Ouvrage non trouvé' };

    const recipeLines = recipes.filter(r => r.solutionId === solution.id);
    const calcForm = item.calcForm || {
        solutionId: solution.id,
        takeoffMode: solution.allowedModes?.[0] || 'rectangle',
        width: 2, height: 1, lengthDirect: 2, surfaceDirect: 10, depth: 0.15,
        qty: item.qty || 1, faces: 1,
        margin: quoteFinancials.margin || 30,
        marginType: quoteFinancials.marginType || 'reel',
        overheadRate: quoteFinancials.overheadRate || 5,
        vatRate: quoteFinancials.vatRate || 18,
        discountRate: quoteFinancials.discountRate || 0,
        includeInstall: true,
        customVarValues: {}
    };

    const widthVal = Math.max(0.01, parseFloat(calcForm.width) || 0);
    const heightVal = Math.max(0.01, parseFloat(calcForm.height) || 0);
    const depthVal = Math.max(0.01, parseFloat(calcForm.depth) || 0.15);
    const lengthDirectVal = Math.max(0.01, parseFloat(calcForm.lengthDirect) || widthVal);
    const surfaceDirectVal = Math.max(0.01, parseFloat(calcForm.surfaceDirect) || (widthVal * heightVal));
    const qtyVal = Math.max(1, parseInt(calcForm.qty || item.qty) || 1);
    const facesVal = Math.max(1, parseInt(calcForm.faces) || 1);
    const marginVal = Math.min(95, Math.max(0, parseFloat(calcForm.margin !== undefined ? calcForm.margin : (quoteFinancials.margin || 30))));

    // Dynamic scope isolated per calculation
    const mode = calcForm.takeoffMode || 'rectangle';
    let calcSurface = surfaceDirectVal;
    let calcPerimeter = 2 * (widthVal + heightVal);
    let calcVolume = widthVal * heightVal * depthVal;

    if (mode === 'rectangle') {
        calcSurface = widthVal * heightVal;
        calcPerimeter = 2 * (widthVal + heightVal);
    } else if (mode === 'volume') {
        calcSurface = widthVal * heightVal;
        calcVolume = widthVal * heightVal * depthVal;
    } else if (mode === 'surface') {
        calcSurface = surfaceDirectVal;
        calcPerimeter = 4 * Math.sqrt(surfaceDirectVal);
    } else if (mode === 'linear') {
        calcSurface = lengthDirectVal;
        calcPerimeter = lengthDirectVal;
    }

    const evalVars = {
        takeoffMode: mode,
        width: widthVal, height: heightVal, depth: depthVal,
        lengthDirect: lengthDirectVal, surfaceDirect: calcSurface,
        qty: qtyVal, faces: facesVal,
        LARGEUR: widthVal, HAUTEUR: heightVal, PROFONDEUR: depthVal, EPAISSEUR: depthVal, P: depthVal, QTY: qtyVal, FACES: facesVal,
        LONGUEUR: lengthDirectVal, LINEAIRE: lengthDirectVal,
        SURFACE: calcSurface, PERIMETRE: calcPerimeter, VOLUME: calcVolume
    };

    if (solution.customVars && solution.customVars.length > 0) {
        solution.customVars.forEach(cv => {
            const rawVal = calcForm.customVarValues && calcForm.customVarValues[cv.name] !== undefined
                ? calcForm.customVarValues[cv.name]
                : (cv.defaultValue !== undefined ? cv.defaultValue : 0);
            evalVars[cv.name] = parseFloat(rawVal) || 0;
        });
    }

    const evaluatedLines = recipeLines.map(line => {
        const costCat = line.costCategory || (line.label.toLowerCase().includes('install') ? 'installation' : line.type);
        let extraCtx = {};
        if (line.type === 'labor') {
            const lab = labor.find(l => l.id === line.refId);
            if (lab) { extraCtx.RENDEMENT_MO = lab.yieldRate || 0; extraCtx.TARIF_MO = lab.rate || 0; }
        } else if (line.type === 'material') {
            const mat = materials.find(m => m.id === line.refId);
            if (mat) { extraCtx.RENDEMENT_MATIERE = mat.yieldRate || 0; extraCtx.TARIF_MATIERE = mat.priceCalc || 0; }
        }
        const evalRes = evaluateDynamicFormula(line.formula, filterVarsForMode(mode, evalVars), extraCtx);
        return { ...line, costCategory: costCat, baseQty: evalRes.value, evalError: evalRes.error };
    });

    const activeLines = evaluatedLines.filter(line => line.baseQty > 0);
    const details = [];
    const consumedByCategory = { material: 0, labor: 0, installation: 0, transport: 0, subcontracting: 0 };
    let totalPurchasedMaterialCost = 0;

    activeLines.forEach(line => {
        const cat = line.costCategory || 'material';
        if (line.type === 'material') {
            const mat = materials.find(m => m.id === line.refId);
            if (mat) {
                // P0.5 — Taux de perte ajustable par devis/chantier : par défaut on
                // reprend mat.waste (taux "catalogue", partagé par toutes les
                // recettes utilisant cette matière), mais calcForm.wasteOverrides
                // permet de le surcharger pour CET ouvrage précis (mur neuf lisse vs
                // support irrégulier n'ont pas le même taux de perte réel), sans
                // toucher au taux catalogue qui reste la référence par défaut.
                const wasteOverride = calcForm.wasteOverrides ? calcForm.wasteOverrides[mat.id] : undefined;
                const wastePct = (wasteOverride !== undefined && wasteOverride !== null && wasteOverride !== '')
                    ? parseFloat(wasteOverride)
                    : (parseFloat(mat.waste) || 0);
                const billedQty = line.baseQty * (1 + (wastePct / 100));
                const consumedCost = billedQty * mat.priceCalc;

                // P0.4 — Pack rounding : on ne peut pas acheter 97.2 L de peinture,
                // on achète des pots entiers. Le déboursé facturé au client doit
                // refléter purchasedCost (conditionnement réellement acheté), pas
                // consumedCost (quantité nette théorique). mat.purchaseMode 'real'
                // = pas de conditionnement fixe (ex: m² de vitrage) → les deux
                // coïncident naturellement.
                const packUnitSize = mat.unitSize || 1;
                const isRealMode = mat.purchaseMode === 'real';
                const packsNeeded = isRealMode
                    ? (packUnitSize > 0 ? billedQty / packUnitSize : billedQty)
                    : Math.ceil(billedQty / packUnitSize);
                const purchasedCost = packsNeeded * (mat.priceBuy || (packUnitSize * mat.priceCalc));
                totalPurchasedMaterialCost += purchasedCost;

                consumedByCategory[cat] = (consumedByCategory[cat] || 0) + purchasedCost;
                details.push({
                    id: line.id, type: 'material', costCategory: cat, label: line.label, name: mat.name,
                    baseQty: line.baseQty, billedQty, unit: mat.unitCalc, unitCost: mat.priceCalc, totalCost: purchasedCost,
                    packsNeeded, packUnitBuy: mat.unitBuy, purchasedCost, consumedCost,
                    matId: mat.id, wastePct, defaultWastePct: parseFloat(mat.waste) || 0, isWasteOverridden: wasteOverride !== undefined && wasteOverride !== null && wasteOverride !== ''
                });
            }
        } else if (line.type === 'labor') {
            const lab = labor.find(l => l.id === line.refId);
            if (lab) {
                const cost = line.baseQty * lab.rate;
                consumedByCategory[cat] = (consumedByCategory[cat] || 0) + cost;
                details.push({
                    id: line.id, type: 'labor', costCategory: cat, label: line.label, name: lab.name,
                    baseQty: line.baseQty, billedQty: line.baseQty, unit: lab.unit || 'u', unitCost: lab.rate, totalCost: cost
                });
            }
        }
    });

    const totalDebourseConsomme = Object.values(consumedByCategory).reduce((a, b) => a + b, 0);
    const overheadRate = Math.min(50, Math.max(0, parseFloat(calcForm.overheadRate !== undefined ? calcForm.overheadRate : (quoteFinancials.overheadRate || 5))));
    const fraisGenerauxConsomme = totalDebourseConsomme * (overheadRate / 100);
    const totalRevientConsomme = totalDebourseConsomme + fraisGenerauxConsomme;

    let prixVenteConsommeHT = 0;
    if (calcForm.marginType === 'reel') {
        const safeDivisor = Math.max(0.05, 1 - (marginVal / 100));
        prixVenteConsommeHT = totalRevientConsomme / safeDivisor;
    } else {
        prixVenteConsommeHT = totalRevientConsomme * (1 + (marginVal / 100));
    }

    const discountRate = Math.min(100, Math.max(0, parseFloat(calcForm.discountRate || quoteFinancials.discountRate || 0)));
    const netHTConsomme = prixVenteConsommeHT * (1 - (discountRate / 100));
    const vatRate = Math.min(50, Math.max(0, parseFloat(calcForm.vatRate !== undefined ? calcForm.vatRate : (quoteFinancials.vatRate || 18))));
    const tvaConsomme = netHTConsomme * (vatRate / 100);
    const totalTTCConsomme = netHTConsomme + tvaConsomme;
    const margeValeurConsomme = netHTConsomme - totalRevientConsomme;

    const unitSellingPriceHT = qtyVal > 0 ? (netHTConsomme / qtyVal) : netHTConsomme;

    // B1 (2026-08-18) — Le métré réellement utilisé par le calcul, exposé pour
    // le devis client. Jusqu'ici la ligne commerciale facturait toujours en
    // « qty » (nombre d'OUVRAGES, souvent 1), jamais en surface/longueur/volume
    // réels : un mur de 176 m² sortait en « 1,00 u ». On reprend ici exactement
    // les mêmes valeurs que celles injectées dans evalVars pour les formules
    // (SURFACE/VOLUME/LONGUEUR), afin que la quantité affichée au client soit
    // la même que celle qui a servi au calcul du déboursé.
    let metreValue = calcSurface;
    let metreUnit = 'm²';
    let metreSummary = null;
    if (mode === 'unit') {
        metreValue = qtyVal;
        metreUnit = 'u';
    } else if (mode === 'volume') {
        metreValue = calcVolume;
        metreUnit = 'm³';
        metreSummary = `${widthVal.toFixed(2)} m × ${heightVal.toFixed(2)} m × ${depthVal.toFixed(2)} m`;
    } else if (mode === 'linear') {
        metreValue = lengthDirectVal;
        metreUnit = 'ml';
    } else if (mode === 'rectangle') {
        metreSummary = `${widthVal.toFixed(2)} m × ${heightVal.toFixed(2)} m`;
    }
    // mode === 'surface' ou 'floor' : métré direct, pas de L × H à afficher.

    return {
        ...item,
        name: item.name || solution.name,
        qty: qtyVal,
        unit: item.unit || (mode === 'surface' ? 'm²' : mode === 'linear' ? 'ml' : mode === 'volume' ? 'm³' : 'u'),
        unitPriceHT: Math.round(unitSellingPriceHT),
        totalHT: Math.round(netHTConsomme),
        calcForm,
        metre: { value: metreValue, unit: metreUnit, summary: metreSummary },
        quoteData: {
            solutionName: solution.name,
            totalDebourseConsomme: Math.round(totalDebourseConsomme),
            totalDebourseAchat: Math.round(totalPurchasedMaterialCost + (consumedByCategory.labor || 0) + (consumedByCategory.installation || 0)),
            fraisGenerauxConsomme: Math.round(fraisGenerauxConsomme),
            totalRevientConsomme: Math.round(totalRevientConsomme),
            prixVenteAvantRemise: Math.round(prixVenteConsommeHT),
            netHTConsomme: Math.round(netHTConsomme),
            tvaConsomme: Math.round(tvaConsomme),
            totalTTCConsomme: Math.round(totalTTCConsomme),
            margeValeurConsomme: Math.round(margeValeurConsomme),
            details
        }
    };
}


function calculateHybridQuote(quote, solutions, materials, labor, recipes) {
    if (!quote) return null;
    const quoteFinancials = {
        margin: quote.margin !== undefined ? quote.margin : 30,
        marginType: quote.marginType || 'reel',
        overheadRate: quote.overheadRate !== undefined ? quote.overheadRate : 5,
        vatRate: quote.vatRate !== undefined ? quote.vatRate : 18,
        discountRate: quote.discountRate !== undefined ? quote.discountRate : 0
    };

    let totalDebourse = 0;
    let totalFraisGen = 0;
    let totalRevient = 0;
    let totalNetHT = 0;
    let totalTVA = 0;
    let totalTTC = 0;
    let totalMargeVal = 0;

    const allCommercialItems = [];
    const aggregatedMaterials = {};

    const calculatedLots = (quote.lots || []).map((lot, idx) => {
        let lotDebourse = 0;
        let lotRevient = 0;
        let lotNetHT = 0;
        let lotMargeVal = 0;

        const calculatedItems = (lot.items || []).map(item => {
            const calculatedItem = calculateSingleWorkItem(item, solutions, materials, labor, recipes, quoteFinancials);
            const qd = calculatedItem.quoteData || {};
            lotDebourse += (qd.totalDebourseConsomme || 0);
            lotRevient += (qd.totalRevientConsomme || 0);
            lotNetHT += (qd.netHTConsomme || 0);
            lotMargeVal += (qd.margeValeurConsomme || 0);

            // Commercial item format for customer preview & PDF
            //
            // B1 (2026-08-18) — billedQty/unit venaient de calculatedItem.qty,
            // le nombre d'OUVRAGES (souvent 1), jamais du métré réel. Les lignes
            // libres (isCustom) n'ont pas de `metre` — elles gardent leur
            // qty/unit saisis tels quels, c'est déjà ce que l'utilisateur veut
            // facturer. sellingUnitHT est recalculé pour que
            // billedQty × sellingUnitHT = sellingTotalHT reste vrai quelle que
            // soit la quantité affichée.
            const billedQty = calculatedItem.metre?.value > 0 ? calculatedItem.metre.value : (calculatedItem.qty || 1);
            const billedUnit = calculatedItem.metre?.unit || calculatedItem.unit || 'u';
            allCommercialItems.push({
                id: calculatedItem.id,
                lotCode: lot.code || String(idx + 1).padStart(2, '0'),
                lotName: lot.name,
                label: calculatedItem.name,
                description: calculatedItem.description || '',
                billedQty,
                unit: billedUnit,
                dimensionSummary: calculatedItem.metre?.summary || null,
                sellingUnitHT: billedQty > 0 ? (calculatedItem.totalHT || 0) / billedQty : (calculatedItem.unitPriceHT || 0),
                sellingTotalHT: calculatedItem.totalHT || 0
            });

            // Material consolidation aggregation
            if (qd.materialConsolidation) {
                Object.keys(qd.materialConsolidation).forEach(matId => {
                    const c = qd.materialConsolidation[matId];
                    if (!aggregatedMaterials[matId]) {
                        aggregatedMaterials[matId] = { mat: c.mat, totalBilledQty: 0 };
                    }
                    aggregatedMaterials[matId].totalBilledQty += c.totalBilledQty;
                });
            }

            return calculatedItem;
        });

        const lotFraisGen = lotDebourse * (quoteFinancials.overheadRate / 100);
        const lotTVA = lotNetHT * (quoteFinancials.vatRate / 100);
        const lotTTC = lotNetHT + lotTVA;
        const lotMarginPct = lotNetHT > 0 ? (lotMargeVal / lotNetHT) * 100 : 0;

        totalDebourse += lotDebourse;
        totalFraisGen += lotFraisGen;
        totalRevient += lotRevient;
        totalNetHT += lotNetHT;
        totalTVA += lotTVA;
        totalTTC += lotTTC;
        totalMargeVal += lotMargeVal;

        return {
            ...lot,
            code: lot.code || String(idx + 1).padStart(2, '0'),
            items: calculatedItems,
            lotTotalHT: Math.round(lotNetHT),
            lotTotalTTC: Math.round(lotTTC),
            lotDebourse: Math.round(lotDebourse),
            lotMarginPct: parseFloat(lotMarginPct.toFixed(2)),
            isComplete: calculatedItems.length > 0 && calculatedItems.every(i => !i.error && i.totalHT > 0)
        };
    });

    const globalMarginPct = totalNetHT > 0 ? (totalMargeVal / totalNetHT) * 100 : 0;
    const salesMultiplierK = totalDebourse > 0 ? parseFloat((totalNetHT / totalDebourse).toFixed(3)) : 1.0;
    const profitabilityStatus = globalMarginPct < 15 ? 'warning' : 'healthy';

    const paymentSchedule = {
        deposit: { pct: 40, label: 'Acompte à la commande (40%)', amount: Math.round(totalTTC * 0.40) },
        midterm: { pct: 30, label: 'Situation intermédiaire / Hors d’eau (30%)', amount: Math.round(totalTTC * 0.30) },
        finishes: { pct: 20, label: 'Second œuvre & Finitions (20%)', amount: Math.round(totalTTC * 0.20) },
        balance: { pct: 10, label: 'Solde à la réception des travaux (10%)', amount: Math.round(totalTTC * 0.10) }
    };

    return {
        ...quote,
        lots: calculatedLots,
        commercialItems: allCommercialItems,
        materialConsolidation: aggregatedMaterials,
        totalDebourse: Math.round(totalDebourse),
        totalFraisGen: Math.round(totalFraisGen),
        totalRevient: Math.round(totalRevient),
        totalNetHT: Math.round(totalNetHT),
        totalTVA: Math.round(totalTVA),
        totalTTC: Math.round(totalTTC),
        totalMargeVal: Math.round(totalMargeVal),
        globalMarginPct: parseFloat(globalMarginPct.toFixed(2)),
        salesMultiplierK,
        profitabilityStatus,
        paymentSchedule
    };
}


function adaptHybridToSavedQuote(hybridQuote, companyInfo) {
    const calc = hybridQuote;
    const currentYear = new Date().getFullYear();
    const quoteNumber = hybridQuote.number || `DEV-${currentYear}-001`;

    const savedLots = (calc.lots || []).map((lot, idx) => ({
        id: lot.id,
        lotNumber: idx + 1,
        lotName: lot.name,
        solutionId: lot.items?.[0]?.solutionId || 1,
        solutionName: lot.items?.[0]?.name || lot.name,
        takeoffMode: lot.items?.[0]?.calcForm?.takeoffMode || 'rectangle',
        dimensions: lot.items?.[0]?.calcForm || {},
        quoteData: {
            solutionName: lot.name,
            totalDebourseConsomme: lot.lotDebourse,
            netHTConsomme: lot.lotTotalHT,
            totalTTCConsomme: lot.lotTotalTTC,
            details: lot.items.flatMap(i => i.quoteData?.details || [])
        }
    }));

    const quoteData = {
        solutionName: hybridQuote.projectRef || `Devis Multi-Lots (${calc.lots?.length || 1} lots)`,
        isMultiLot: true,
        lots: savedLots,
        totalDebourseConsomme: calc.totalDebourse,
        fraisGenerauxConsomme: calc.totalFraisGen,
        totalRevientConsomme: calc.totalRevient,
        margeValeurConsomme: calc.totalMargeVal,
        margePctConsommeReelle: calc.globalMarginPct,
        netHTConsomme: calc.totalNetHT,
        tvaConsomme: calc.totalTVA,
        totalTTCConsomme: calc.totalTTC,
        commercialItems: calc.commercialItems || [],
        vatRate: calc.vatRate || 18
    };

    return {
        id: hybridQuote.id || Date.now(),
        number: quoteNumber,
        date: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        clientName: hybridQuote.clientName?.trim() || 'Client Passage',
        projectRef: hybridQuote.projectRef || 'Chantier Multi-Lots',
        notes: hybridQuote.notes || '',
        vatRate: calc.vatRate || 18,
        isMultiLot: true,
        status: hybridQuote.status || 'draft',
        quoteData,
        companyInfoSnapshot: { ...companyInfo },
        calcFormSnapshot: hybridQuote.lots?.[0]?.items?.[0]?.calcForm || {},
        hybridQuoteSnapshot: JSON.parse(JSON.stringify(hybridQuote))
    };
}


function adaptSavedQuoteToHybrid(savedQuote, solutions, materials, labor, recipes) {
    if (!savedQuote) return null;
    if (savedQuote.hybridQuoteSnapshot) {
        return calculateHybridQuote(savedQuote.hybridQuoteSnapshot, solutions, materials, labor, recipes);
    }
    
    // If it's an existing multi-lot quote from V5.9
    if (savedQuote.isMultiLot && savedQuote.quoteData?.lots && savedQuote.quoteData.lots.length > 0) {
        const hybridQuote = {
            id: savedQuote.id,
            number: savedQuote.number,
            clientName: savedQuote.clientName,
            projectRef: savedQuote.projectRef,
            status: savedQuote.status || 'draft',
            vatRate: savedQuote.vatRate || 18,
            overheadRate: 5,
            margin: 30,
            marginType: 'reel',
            notes: savedQuote.notes || '',
            lots: savedQuote.quoteData.lots.map((l, idx) => ({
                id: l.id || `lot_${idx + 1}`,
                code: String(idx + 1).padStart(2, '0'),
                name: l.lotName || `Lot ${idx + 1}`,
                items: [
                    {
                        id: `item_${l.id || idx + 1}`,
                        solutionId: l.solutionId || 1,
                        name: l.solutionName || l.lotName,
                        qty: l.dimensions?.qty || 1,
                        calcForm: l.dimensions || { solutionId: l.solutionId || 1, takeoffMode: l.takeoffMode || 'rectangle' }
                    }
                ]
            }))
        };
        return calculateHybridQuote(hybridQuote, solutions, materials, labor, recipes);
    }

    // If it's a single calculation quote from V5.9
    const singleQuote = {
        id: savedQuote.id,
        number: savedQuote.number,
        clientName: savedQuote.clientName,
        projectRef: savedQuote.projectRef,
        status: savedQuote.status || 'draft',
        vatRate: savedQuote.vatRate || 18,
        overheadRate: 5,
        margin: 30,
        marginType: 'reel',
        notes: savedQuote.notes || '',
        lots: [
            {
                id: 'lot_1',
                code: '01',
                name: savedQuote.projectRef || 'Lot Principal',
                items: [
                    {
                        id: 'item_1',
                        solutionId: savedQuote.calcFormSnapshot?.solutionId || 1,
                        name: savedQuote.quoteData?.solutionName || 'Ouvrage Principal',
                        qty: savedQuote.calcFormSnapshot?.qty || 1,
                        calcForm: savedQuote.calcFormSnapshot || {}
                    }
                ]
            }
        ]
    };
    return calculateHybridQuote(singleQuote, solutions, materials, labor, recipes);
}


// ═══════════════════════════════════════════════════════════════
// ikadevis V6 HYBRID QUOTE WORKSPACE & SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// ikadevis V6.1 UI/UX AUDIT ENHANCEMENTS — COMPONENTS & WIZARD
// ═══════════════════════════════════════════════════════════════


function calculateQuickEstimate({ category = 'villa_house', surface = 150, quality = 'standard', city = 'Bamako' }) {
    const ratesPerM2 = {
        villa_house: { eco: 180000, standard: 260000, premium: 380000 },
        renovation_paint: { eco: 3500, standard: 6000, premium: 11000 },
        event_stand: { eco: 35000, standard: 65000, premium: 120000 },
        acm_facade: { eco: 45000, standard: 75000, premium: 110000 },
        signage_branding: { eco: 80000, standard: 150000, premium: 280000 }
    };

    const baseRates = ratesPerM2[category] || ratesPerM2.villa_house;
    const baseRate = baseRates[quality] || baseRates.standard;

    const cityMultipliers = {
        'Abidjan': 1.10,
        'Dakar': 1.08,
        'Bamako': 1.00,
        'Ouagadougou': 0.98,
        'Conakry': 1.05,
        'Autre': 1.00
    };
    const cityMult = cityMultipliers[city] || 1.00;

    const estimatedHT = Math.round(surface * baseRate * cityMult);
    const minHT = Math.round(estimatedHT * 0.92);
    const maxHT = Math.round(estimatedHT * 1.12);
    const vat = Math.round(estimatedHT * 0.18);
    const avgTTC = estimatedHT + vat;

    return {
        estimatedHT,
        minHT,
        maxHT,
        avgTTC,
        vat,
        ratePerUnit: Math.round(baseRate * cityMult),
        unit: category === 'signage_branding' ? 'ml' : 'm²'
    };
}


function calculateAcmNesting({ width = 12, height = 6, panelWidth = 1.5, panelHeight = 4.0, jointWidth = 0.015 }) {
    const totalSurface = width * height;
    const singlePanelArea = panelWidth * panelHeight;

    const cols = Math.ceil(width / (panelWidth + jointWidth));
    const rows = Math.ceil(height / (panelHeight + jointWidth));
    const totalRawPanels = cols * rows;
    const totalRawArea = totalRawPanels * singlePanelArea;
    const wasteArea = Math.max(0, totalRawArea - totalSurface);
    const wastePct = parseFloat(((wasteArea / totalRawArea) * 100).toFixed(1));

    const linearRails = (rows + 1) * width;
    const linearStuds = (cols + 1) * height;
    const totalLinearTubes = Math.round((linearRails + linearStuds) * 1.08);

    return {
        totalSurface: parseFloat(totalSurface.toFixed(2)),
        cols,
        rows,
        totalRawPanels,
        singlePanelArea,
        totalRawArea: parseFloat(totalRawArea.toFixed(2)),
        wastePct,
        totalLinearTubes,
        tubesBarCount: Math.ceil(totalLinearTubes / 6)
    };
}

// ═══════════════════════════════════════════════════════════════
// ASSISTANT INTELLIGENT DE DÉMARRAGE (NewQuoteWizardModal)
// ═══════════════════════════════════════════════════════════════


function calculateAcmNestingOptimal({ width = 12, height = 6, panelWidth = 1.5, panelHeight = 4.0, jointWidth = 0.015 }) {
    const totalSurface = width * height;
    const singlePanelArea = panelWidth * panelHeight;

    // Orientation 0° (Normal)
    const cols0 = Math.ceil(width / (panelWidth + jointWidth));
    const rows0 = Math.ceil(height / (panelHeight + jointWidth));
    const panels0 = cols0 * rows0;
    const rawArea0 = panels0 * singlePanelArea;
    const waste0 = Math.max(0, rawArea0 - totalSurface);
    const wastePct0 = (waste0 / rawArea0) * 100;

    // Orientation 90° (Rotated)
    const cols90 = Math.ceil(width / (panelHeight + jointWidth));
    const rows90 = Math.ceil(height / (panelWidth + jointWidth));
    const panels90 = cols90 * rows90;
    const rawArea90 = panels90 * singlePanelArea;
    const waste90 = Math.max(0, rawArea90 - totalSurface);
    const wastePct90 = (waste90 / rawArea90) * 100;

    // Pick optimal orientation
    const isRotated = panels90 < panels0 || (panels90 === panels0 && wastePct90 < wastePct0);
    const cols = isRotated ? cols90 : cols0;
    const rows = isRotated ? rows90 : rows0;
    const totalRawPanels = isRotated ? panels90 : panels0;
    const totalRawArea = isRotated ? rawArea90 : rawArea0;
    const wastePct = parseFloat((isRotated ? wastePct90 : wastePct0).toFixed(1));
    const effPanelW = isRotated ? panelHeight : panelWidth;
    const effPanelH = isRotated ? panelWidth : panelHeight;

    // Structure linéaire (tubes 40x40)
    const linearRails = (rows + 1) * width;
    const linearStuds = (cols + 1) * height;
    const totalLinearTubes = Math.round((linearRails + linearStuds) * 1.08);

    return {
        totalSurface: parseFloat(totalSurface.toFixed(2)),
        isRotated,
        cols,
        rows,
        effPanelW,
        effPanelH,
        totalRawPanels,
        singlePanelArea,
        totalRawArea: parseFloat(totalRawArea.toFixed(2)),
        wastePct,
        totalLinearTubes,
        tubesBarCount: Math.ceil(totalLinearTubes / 6)
    };
}

