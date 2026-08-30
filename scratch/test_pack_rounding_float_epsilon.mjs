// Banc d'essai — Fix F2 (2026-08-30), tolérance zéro.
//
// Campagne "stress test" du 2026-08-30 (immeuble R+3 adversarial) : un
// résidu de virgule flottante peut faire commander un conditionnement entier
// de trop. 720 * (1 + 10/100) ne vaut pas 792 en IEEE-754 mais
// 792.0000000000001 — reproductible indépendamment via
// `node -e "console.log(720*1.10)"`. Divisé par la taille de carton
// (1,44 m²) puis passé dans Math.ceil(), ce résidu invisible fait basculer
// 550,000000... cartons en 551 : un carton (13 000 FCFA) commandé sans
// raison. Le même Math.ceil(qté/tailleConditionnement), sans tolérance
// epsilon, encadre TOUT matériau en purchaseMode 'pack' du catalogue —
// défaut systémique, pas un cas isolé du carrelage.
//
// Correctif (js/calc-engine.js) : cleanFloatNoise()/ceilClean() nettoient le
// bruit flottant (tolérance 1e-6, trois ordres de grandeur sous n'importe
// quelle saisie ou taux de perte réels) avant d'arrondir. Ce banc vérifie
// (1) le cas réel qui a révélé le bug, à tolérance zéro ; (2) qu'un
// dépassement RÉEL (pas du bruit) continue bien à déclencher un
// conditionnement supplémentaire — l'epsilon ne doit pas masquer un vrai
// besoin.
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function chargerMoteur() {
    const ctx = { console, Math, JSON, parseFloat, parseInt, isNaN, isFinite, Date, RegExp, Error, Object, Array, String, Number };
    vm.createContext(ctx);
    vm.runInContext(readFileSync(path.join(RACINE, 'js/calc-engine.js'), 'utf-8'), ctx);
    return ctx;
}

const solutions = [{ id: 6, name: 'Carrelage', allowedModes: ['surface'], customVars: [] }];
const materials = [
    { id: 10, name: 'Carrelage Grès Cérame 60x60', unitBuy: 'Carton (1.44m²)', unitSize: 1.44, unitCalc: 'm²', priceBuy: 13000, priceCalc: 9027.78, waste: 10, yieldRate: 0, purchaseMode: 'pack' }
];
const recipes = [{ id: 22, solutionId: 6, type: 'material', refId: 10, formula: 'SURFACE', label: 'Carrelage', costCategory: 'material' }];

function carrelage(ctx, surfaceDirect) {
    const item = {
        id: 'x', solutionId: 6, qty: 1,
        calcForm: {
            solutionId: 6, takeoffMode: 'surface', surfaceDirect, qty: 1, faces: 1,
            customVarValues: {}, margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0
        }
    };
    return ctx.calculateSingleWorkItem(item, solutions, materials, [], recipes, {}).quoteData.details[0];
}

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });
    const ctx = chargerMoteur();

    // Cas réel : 720 m² pile, perte 10% → 792 m² pile → 550 cartons pile.
    const d720 = carrelage(ctx, 720);
    ok(
        '720 m², perte 10% → 792 m² brut (tolérance 0, malgré le bruit flottant)',
        Math.abs(d720.grossQty - 792) < 1e-9,
        `mesuré=${d720.grossQty} m²`
    );
    ok(
        '792 m² ÷ 1,44 m²/carton = 550 cartons EXACTEMENT, pas 551',
        d720.packsNeeded === 550,
        `mesuré=${d720.packsNeeded} cartons`
    );

    // Contrôle : un vrai dépassement (721 m², pas du bruit) doit toujours
    // déclencher le carton supplémentaire — l'epsilon ne doit rien masquer.
    const d721 = carrelage(ctx, 721);
    const expectedGross721 = 721 * 1.10; // 793.1 m²
    const expectedPacks721 = Math.ceil(expectedGross721 / 1.44); // 551
    ok(
        '721 m² (dépassement réel, pas du bruit) déclenche toujours le conditionnement supplémentaire',
        d721.packsNeeded === expectedPacks721 && d721.packsNeeded > d720.packsNeeded,
        `mesuré=${d721.packsNeeded} cartons (attendu ${expectedPacks721})`
    );

    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    run().then((r) => {
        r.forEach((x) => console.log(`${x.pass ? '✅' : '❌'} ${x.label}${x.detail ? ` — ${x.detail}` : ''}`));
        process.exit(r.every((x) => x.pass) ? 0 : 1);
    });
}
