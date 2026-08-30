// Banc d'essai — Fix F1 (2026-08-30), tolérance zéro.
//
// Campagne "stress test" du 2026-08-30 (immeuble R+3 adversarial) : la perte
// en % était forcée à 0 sur TOUTE ressource dénombrable (unitCalc de
// catégorie 'count' — u, forfait, barre, plaque, rouleau, carton, sac, pot…),
// surcharge utilisateur comprise. Raisonnable pour un module LED (on n'en
// pose pas une fraction). Faux pour un parpaing : la casse de manutention
// est une réalité de chantier ordinaire, à laquelle l'utilisateur n'avait
// plus accès dès qu'il tentait de la saisir — confirmé sur un scénario réel
// (1 491,84 m² de maçonnerie, perte 7% saisie mais silencieusement ignorée :
// 18 648 parpaings facturés au lieu des 19 954 attendus).
//
// Correctif (js/calc-engine.js) : la perte s'applique désormais à toute
// matière, dénombrable ou non. Ce qui doit rester vrai : une ressource
// dénombrable ne se consomme pas par fraction d'unité — la quantité facturée
// (nette + perte) est donc arrondie à l'entier supérieur SPÉCIFIQUEMENT pour
// les matières dénombrables, au lieu de supprimer la perte.
//
// Ce banc vérifie : (1) le cas réel qui a révélé le bug, à tolérance zéro ;
// (2) qu'une matière dénombrable à perte catalogue 0% (modules LED,
// alimentations…) n'est pas affectée — pas de régression sur les étalons
// existants qui en dépendent.
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

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });
    const ctx = chargerMoteur();

    // Reproduction fidèle du catalogue réel : Maçonnerie en Murs d'Agglos de
    // 15 (solution 5), matériau Agglos (id 8, unitCalc 'u' → dénombrable).
    const solutions = [{ id: 5, name: 'Maçonnerie', allowedModes: ['surface'], customVars: [] }];
    const materials = [
        { id: 8, name: 'Agglos creux de 15x20x40', unitBuy: 'Unité (pièce)', unitSize: 1, unitCalc: 'u', priceBuy: 350, priceCalc: 350, waste: 5, yieldRate: 0, purchaseMode: 'real' }
    ];
    const recipes = [{ id: 19, solutionId: 5, type: 'material', refId: 8, formula: 'SURFACE * 12.5', label: 'Agglos', costCategory: 'material' }];

    const item = {
        id: 'x', solutionId: 5, qty: 1,
        calcForm: {
            solutionId: 5, takeoffMode: 'surface', surfaceDirect: 1491.84, qty: 1, faces: 1,
            customVarValues: {}, margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0,
            wasteOverrides: { 8: 7 }
        }
    };
    const res = ctx.calculateSingleWorkItem(item, solutions, materials, [], recipes, {}).quoteData;
    const agglos = res.details[0];

    ok(
        'Métré net reste 18 648 u (avant perte — inchangé, ce n\'est pas ce champ qui corrige le bug)',
        agglos.netQty === 18648,
        `mesuré=${agglos.netQty} u`
    );
    ok(
        'Quantité facturée (nette + perte 7%, arrondie à l\'unité) = 19 954 unités (tolérance 0)',
        agglos.grossQty === 19954 && agglos.billedQty === 19954,
        `mesuré=${agglos.grossQty} u (attendu : ceil(18648 × 1,07) = 19 954)`
    );
    ok(
        'La perte saisie (7%) est bien celle appliquée, pas 0% forcé',
        agglos.wastePct === 7,
        `mesuré=${agglos.wastePct}%`
    );
    ok(
        'Coût matière cohérent avec la quantité arrondie (19 954 × 350 FCFA)',
        agglos.costConsumed === 19954 * 350,
        `mesuré=${agglos.costConsumed} FCFA`
    );

    // Non-régression : une ressource dénombrable à perte catalogue 0% (type
    // module LED) ne doit strictement rien changer — ceil(net) doit rester
    // égal à net dès que net est déjà entier, sans phantom rounding.
    const materialsLed = [
        { id: 14, name: 'Module LED', unitBuy: 'Module', unitSize: 1, unitCalc: 'u', priceBuy: 650, priceCalc: 650, waste: 0, yieldRate: 0, purchaseMode: 'real' }
    ];
    const recipesLed = [{ id: 30, solutionId: 8, type: 'material', refId: 14, formula: 'SURFACE * 25', label: 'Modules LED', costCategory: 'material' }];
    const itemLed = {
        id: 'y', solutionId: 8, qty: 1,
        calcForm: {
            solutionId: 8, takeoffMode: 'rectangle', width: 6, height: 3, qty: 1, faces: 1,
            customVarValues: {}, margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0
        }
    };
    const resLed = ctx.calculateSingleWorkItem(
        itemLed, [{ id: 8, name: 'Enseigne', allowedModes: ['rectangle'], customVars: [] }],
        materialsLed, [], recipesLed, {}
    ).quoteData;
    const led = resLed.details[0];
    ok(
        'Modules LED (perte catalogue 0%) restent à 450 u, sans arrondi fantôme',
        led.netQty === 450 && led.wastePct === 0,
        `mesuré=${led.netQty} u, perte=${led.wastePct}%`
    );

    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    run().then((r) => {
        r.forEach((x) => console.log(`${x.pass ? '✅' : '❌'} ${x.label}${x.detail ? ` — ${x.detail}` : ''}`));
        process.exit(r.every((x) => x.pass) ? 0 : 1);
    });
}
