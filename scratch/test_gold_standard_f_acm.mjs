// Banc d'essai — Étalon F (Façade Panneaux ACM), tolérance zéro.
// PROJECT_MASTER_TRACKER.md § 5 : 180 m² (plaques Alucobond 6 m²),
// +8% pertes → 33 plaques ACM.
//
// Vérification arithmétique préalable : 180 × 1.08 = 194.4 m² à acheter ;
// ceil(194.4 / 6) = 33 plaques. Le tracker ne documente que le nombre de
// plaques (pas de FCFA de référence pour ce poste) — on vérifie donc la
// quantité de plaques achetées, seule valeur à tolérance zéro disponible.
import { pathToFileURL } from 'node:url';
import {
    launchApp, enterGuestMode, addCatalogItemBySearch,
    setFirstOuvrageSurface, openDecompositionTab, readFirstOuvrageBreakdown
} from './lib/harness.mjs';

const EXPECTED = { surfaceAchat: 194.4, plaques: 33 };
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
        await addCatalogItemBySearch(page, 'Habillage Façade');
        await setFirstOuvrageSurface(page, 180);
        await openDecompositionTab(page);

        const breakdown = await readFirstOuvrageBreakdown(page);
        ok('Décomposition du déboursé lisible dans l\'inspecteur', breakdown.found, JSON.stringify(breakdown.raw));

        if (breakdown.found) {
            const acmRow = breakdown.rows.find((row) => /Alucobond|ACM/i.test(row.poste || ''));

            const surfaceAchat = acmRow?.grossQty;
            ok(
                `Surface nette à acheter = ${EXPECTED.surfaceAchat} m² (180m² + 8% pertes, tolérance ${TOLERANCE})`,
                surfaceAchat !== null && Math.abs(surfaceAchat - EXPECTED.surfaceAchat) <= TOLERANCE,
                `mesuré=${surfaceAchat} m² — ligne source: ${JSON.stringify(acmRow)}`
            );

            // Nombre de plaques = packsNeeded, non affiché directement en colonne mais
            // déductible : coût total / prix d'achat unitaire d'une plaque (65 000 FCFA).
            const coutTotal = acmRow?.costPurchased;
            const plaquesDeduites = coutTotal !== null ? Math.round(coutTotal / 65000) : null;
            ok(
                `Plaques achetées = ${EXPECTED.plaques} (déduit du coût total / 65 000 FCFA)`,
                plaquesDeduites === EXPECTED.plaques,
                `coût total=${coutTotal} FCFA → ${plaquesDeduites} plaques déduites`
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
