// Banc d'essai — Étalon A (Peinture Murale), tolérance zéro.
// Valeurs de référence mises à jour le 2026-08-16 suite à deux décisions
// produit qui corrigent PROJECT_MASTER_TRACKER.md § 5 (qui documentait à
// l'origine 90 L / 315 000 FCFA, sans le facteur de pertes) :
//
//   (a) Facteur de pertes de 8% sur la peinture — CONFIRMÉ intentionnel,
//       cohérent avec le même mécanisme déjà utilisé sur les Tests B et F.
//       90 L de couverture nette murale → 97.20 L à acheter (90 × 1.08).
//   (b) Arrondi à l'achat en conditionnement entier — CONFIRMÉ le 2026-08-16,
//       corrigé dans index_jsx.js (commit "P0.4") : le déboursé facturé est
//       désormais basé sur purchasedCost (pots entiers réellement achetés),
//       pas sur consumedCost (litre net). 97.20 L → 7 pots de 15 L → 315 000 FCFA.
//
// Ce test reproduit le scénario dans l'UI réelle (catalogue → "Peinture Murale
// Satinée BTP" → 450 m² en Surface Directe) et lit le déboursé effectivement
// calculé par l'app, sans tolérance, pour verrouiller ce comportement contre
// toute régression future.
import { pathToFileURL } from 'node:url';
import {
    launchApp, enterGuestMode, addCatalogItemBySearch,
    setFirstOuvrageSurface, openDecompositionTab, readFirstOuvrageBreakdown
} from './lib/harness.mjs';

const EXPECTED = { consumptionL: 97.2, potsOf15L: 7, debourseMaterielFcfa: 315000 };
const TOLERANCE = 0; // étalon "tolérance zéro" — volontairement strict

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await enterGuestMode(page);
        await addCatalogItemBySearch(page, 'Peinture Murale');
        await setFirstOuvrageSurface(page, 450);
        await openDecompositionTab(page);

        const breakdown = await readFirstOuvrageBreakdown(page);
        ok('Décomposition du déboursé lisible dans l\'inspecteur', breakdown.found, JSON.stringify(breakdown.raw));

        if (breakdown.found) {
            const peintureLine = breakdown.raw.find((l) => /Pot Peinture|Peinture Satinée/i.test(l));
            const litresMatch = peintureLine?.match(/([\d.]+)\s*L/);
            const litres = litresMatch ? parseFloat(litresMatch[1]) : null;

            ok(
                `Consommation peinture = ${EXPECTED.consumptionL} L (tolérance ${TOLERANCE})`,
                litres !== null && Math.abs(litres - EXPECTED.consumptionL) <= TOLERANCE,
                `mesuré=${litres} L — ligne source: "${peintureLine}"`
            );

            const costMatch = peintureLine?.match(/([\d\s]+)\s*FCFA\s*$/);
            const materielFcfa = costMatch ? parseFloat(costMatch[1].replace(/\s/g, '')) : null;
            ok(
                `Déboursé matériel peinture = ${EXPECTED.debourseMaterielFcfa} FCFA (tolérance ${TOLERANCE})`,
                materielFcfa !== null && Math.abs(materielFcfa - EXPECTED.debourseMaterielFcfa) <= TOLERANCE,
                `mesuré=${materielFcfa} FCFA (attendu: arrondi à ${EXPECTED.potsOf15L} pots de 15L)`
            );
        }
    } finally {
        await close();
    }
    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    process.exit(results.every((r) => r.pass) ? 0 : 1);
}
