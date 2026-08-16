// Banc d'essai — Étalon A (Peinture Murale), tolérance zéro documentée dans
// PROJECT_MASTER_TRACKER.md § 5 : 450 m², attendu 90 L consommés / 7 pots de
// 15 L achetés / 315 000 FCFA de déboursé.
//
// Ce test reproduit le scénario dans l'UI réelle (catalogue → "Peinture Murale
// Satinée BTP" → 450 m² en Surface Directe) et lit le déboursé effectivement
// calculé par l'app, SANS forcer une tolérance large pour le faire passer.
//
// Constat initial (2026-08-16, avant correctif) : l'app calculait 97.20 L
// (= 90 L × 1.08, facteur de pertes de 8% cohérent avec les Tests B/F) et
// facturait au litre net (291 600 FCFA) au lieu d'arrondir à l'achat réel en
// pots entiers de 15 L (315 000 FCFA). Deux écarts distincts, deux décisions
// métier séparées :
//   (a) le facteur de pertes de 8% (90 L → 97.2 L) — TOUJOURS EN ATTENTE,
//       pas tranché, ce test échoue donc encore sur la consommation en litres ;
//   (b) l'arrondi à l'achat en pots entiers — TRANCHÉ le 2026-08-16 (décision
//       produit : oui, arrondir) et CORRIGÉ dans index_jsx.js (le moteur
//       calculait déjà purchasedCost/packsNeeded par matière mais ne s'en
//       servait pas pour le déboursé affiché — voir commit "P0.4"). Le
//       déboursé matériel obtenu est désormais exactement 315 000 FCFA.
// Ce test reste donc partiellement en échec, de façon attendue et documentée,
// tant que (a) n'est pas tranché à son tour.
import { pathToFileURL } from 'node:url';
import {
    launchApp, enterGuestMode, addCatalogItemBySearch,
    setFirstOuvrageSurface, openDecompositionTab, readFirstOuvrageBreakdown
} from './lib/harness.mjs';

const EXPECTED = { consumptionL: 90, potsOf15L: 7, debourseMaterielFcfa: 315000 };
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
    if (!results.every((r) => r.pass)) {
        console.log('\n  ⚠️  Échec attendu et documenté — voir le commentaire en tête de fichier.');
        console.log('     Ce n\'est pas un faux positif : décision produit requise avant de faire passer ce test.');
    }
    process.exit(results.every((r) => r.pass) ? 0 : 1);
}
