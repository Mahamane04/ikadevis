// Banc d'essai — la quantité de l'ouvrage doit atteindre TOUS les métrés.
//
// Ajouté le 2026-08-26 après un bug signalé par l'utilisateur et présent depuis
// l'origine du moteur (02e177d, 2026-08-16) : en modes 'rectangle' et 'volume',
// SURFACE et VOLUME ne comptaient qu'UN exemplaire de l'ouvrage. Sept lettres de
// 0,60 × 0,50 m consommaient 0,30 m² de plexi au lieu de 2,10 m² ; sur l'étalon
// G, douze baies vitrées étaient chiffrées comme une seule (−34 % de déboursé).
//
// Les sept étalons métier n'ont jamais vu l'anomalie : ils ne vérifient que des
// totaux, avec des ouvrages en quantité 1 ou dans les modes 'surface', 'floor'
// et 'linear' — les trois qui appliquaient correctement la quantité. Ce banc
// d'essai attaque donc l'invariant directement, mode par mode, plutôt qu'à
// travers un devis complet.
//
// Il s'exécute sur le moteur seul (js/calc-engine.js chargé dans un contexte
// Node), sans navigateur : le calcul est vérifiable sans passer par l'interface,
// et l'échec désigne alors le moteur sans ambiguïté.
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

// fileURLToPath, et non `new URL(...).pathname` : le projet vit sous un chemin
// contenant des espaces, que pathname laisse encodés en %20 — readFileSync
// échouerait alors avec un ENOENT trompeur.
const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function chargerMoteur() {
    const ctx = { console, Math, JSON, parseFloat, parseInt, isNaN, isFinite, Date, RegExp, Error, Object, Array, String, Number };
    vm.createContext(ctx);
    vm.runInContext(readFileSync(path.join(RACINE, 'js/calc-engine.js'), 'utf-8'), ctx);
    return ctx;
}

// Matière neutre : prix 1 par unité de calcul, aucune perte, achat « au réel »
// — la quantité nette lue est donc exactement le métré, sans arrondi parasite.
const matiere = (id, unitCalc) => ({
    id, name: `M${id}`, unitCalc, unitBuy: 'x', unitSize: 1000,
    priceBuy: 1000, priceCalc: 1, waste: 0, purchaseMode: 'real'
});

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });
    const ctx = chargerMoteur();

    // Chaque cas : un métré unitaire connu, une quantité de 3, et la valeur
    // attendue = métré unitaire × 3.
    const cas = [
        { mode: 'rectangle', formule: 'SURFACE',   cf: { width: 2, height: 1, qty: 3 },                unite: 'm²', attendu: 6 },
        { mode: 'rectangle', formule: 'PERIMETRE', cf: { width: 2, height: 1, qty: 3 },                unite: 'm',  attendu: 18 },
        { mode: 'volume',    formule: 'VOLUME',    cf: { width: 2, height: 1, depth: 0.5, qty: 3 },    unite: 'm³', attendu: 3 },
        { mode: 'surface',   formule: 'SURFACE',   cf: { surfaceDirect: 2, qty: 3 },                   unite: 'm²', attendu: 6 },
        { mode: 'floor',     formule: 'SURFACE',   cf: { width: 2, height: 1, lengthDirect: 1, qty: 3 }, unite: 'm²', attendu: 6 },
        { mode: 'linear',    formule: 'LONGUEUR',  cf: { lengthDirect: 2, qty: 3 },                    unite: 'm',  attendu: 6 },
        { mode: 'unit',      formule: 'QTY',       cf: { qty: 3 },                                     unite: 'u',  attendu: 3 }
    ];

    for (const { mode, formule, cf, unite, attendu } of cas) {
        const solutions = [{ id: 10, name: 'Ouvrage test', allowedModes: [mode], customVars: [] }];
        const materials = [matiere(1, unite)];
        const recipes = [{ id: 1, solutionId: 10, type: 'material', refId: 1, formula: formule, costCategory: 'material', label: formule }];
        const item = {
            id: 'i', solutionId: 10, qty: cf.qty,
            calcForm: {
                solutionId: 10, takeoffMode: mode, faces: 1, customVarValues: {},
                margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0, ...cf
            }
        };
        const res = ctx.calculateSingleWorkItem(item, solutions, materials, [], recipes, {});
        const mesure = res.quoteData.details[0]?.netQty;

        ok(
            `${mode} · ${formule} × quantité 3 = ${attendu} ${unite}`,
            mesure !== undefined && Math.abs(mesure - attendu) < 0.001,
            `mesuré=${mesure} ${unite} (métré unitaire × 3 attendu)`
        );

        // Le métré exposé au devis client doit couvrir la même quantité que le
        // coût : sinon le total est juste mais le prix unitaire affiché est faux.
        const metre = res.metre?.value;
        ok(
            `${mode} · le métré présenté au client couvre les 3 exemplaires`,
            metre !== undefined && Math.abs(metre - (mode === 'volume' ? 3 : mode === 'unit' ? 3 : mode === 'rectangle' && formule === 'PERIMETRE' ? 6 : attendu)) < 0.001,
            `métré=${metre} ${res.metre?.unit}`
        );
    }

    // Contrôle anti-double-comptage : à quantité 1, rien ne doit bouger.
    const solutions = [{ id: 10, name: 'T', allowedModes: ['rectangle'], customVars: [] }];
    const materials = [matiere(1, 'm²')];
    const recipes = [{ id: 1, solutionId: 10, type: 'material', refId: 1, formula: 'SURFACE', costCategory: 'material', label: 'S' }];
    const mk = (qty) => ctx.calculateSingleWorkItem(
        { id: 'i', solutionId: 10, qty, calcForm: { solutionId: 10, takeoffMode: 'rectangle', width: 2, height: 1, qty, faces: 1, customVarValues: {}, margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0 } },
        solutions, materials, [], recipes, {}
    ).quoteData.details[0].netQty;

    ok('Quantité 1 : la surface reste le métré unitaire (pas de double comptage)', Math.abs(mk(1) - 2) < 0.001, `mesuré=${mk(1)} m²`);
    ok('La surface croît proportionnellement à la quantité', Math.abs(mk(5) - 10) < 0.001, `qty 5 → ${mk(5)} m² (attendu 10)`);

    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    run().then((r) => {
        r.forEach((x) => console.log(`${x.pass ? '✅' : '❌'} ${x.label}${x.detail ? ` — ${x.detail}` : ''}`));
        process.exit(r.every((x) => x.pass) ? 0 : 1);
    });
}
