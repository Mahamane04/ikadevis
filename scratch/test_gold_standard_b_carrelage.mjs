// Banc d'essai — Étalon B (Carrelage Sol), tolérance zéro.
// PROJECT_MASTER_TRACKER.md § 5 : 120 m² (carreaux 60x60, cartons de 1.44 m²),
// +10% pertes → 92 cartons achetés (1 196 000 FCFA).
//
// Vérification arithmétique préalable : 120 × 1.10 = 132 m² à acheter ;
// ceil(132 / 1.44) = 92 cartons ; 92 × 13 000 FCFA/carton = 1 196 000 FCFA.
// Correspond exactement à la doc — ce test vérifie que l'app le reproduit
// réellement dans l'UI, avec l'arrondi au conditionnement acheté (P0.4).
import { pathToFileURL } from 'node:url';
import {
    launchApp, enterGuestMode, addCatalogItemBySearch,
    setFirstOuvrageSurface, openDecompositionTab, readFirstOuvrageBreakdown
} from './lib/harness.mjs';

const EXPECTED = { surfaceAchat: 132, cartons: 92, debourseMaterielFcfa: 1196000 };
const TOLERANCE = 0;

const parseNum = (s) => {
    if (s === undefined || s === null) return null;
    const n = parseFloat(String(s).replace(/[^\d.,-]/g, '').replace(/\s/g, ''));
    return Number.isFinite(n) ? n : null;
};

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await enterGuestMode(page);
        await addCatalogItemBySearch(page, 'Carrelage Grès Cérame');
        await setFirstOuvrageSurface(page, 120);
        await openDecompositionTab(page);

        const breakdown = await readFirstOuvrageBreakdown(page);
        ok('Décomposition du déboursé lisible dans l\'inspecteur', breakdown.found, JSON.stringify(breakdown.raw));

        if (breakdown.found) {
            const carrelageRow = breakdown.raw.find((row) => /Carrelage/i.test(row[0] || ''));

            const surfaceAchat = parseNum(carrelageRow?.[1]);
            ok(
                `Surface nette à acheter = ${EXPECTED.surfaceAchat} m² (120m² + 10% pertes, tolérance ${TOLERANCE})`,
                surfaceAchat !== null && Math.abs(surfaceAchat - EXPECTED.surfaceAchat) <= TOLERANCE,
                `mesuré=${surfaceAchat} m² — ligne source: ${JSON.stringify(carrelageRow)}`
            );

            const materielFcfa = parseNum(carrelageRow?.[4]);
            ok(
                `Déboursé matériel carrelage = ${EXPECTED.debourseMaterielFcfa} FCFA (tolérance ${TOLERANCE})`,
                materielFcfa !== null && Math.abs(materielFcfa - EXPECTED.debourseMaterielFcfa) <= TOLERANCE,
                `mesuré=${materielFcfa} FCFA (attendu: arrondi à ${EXPECTED.cartons} cartons de 1.44m²)`
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
