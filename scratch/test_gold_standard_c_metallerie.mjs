// Banc d'essai — Étalon C (Garde-Corps Métallerie, Plan de Débit 1D), tolérance zéro.
// PROJECT_MASTER_TRACKER.md § 5 : 30 ml, attendu 31 poteaux, 3 lisses → 22
// barres de 6m (chutes < 5%).
//
// Contexte (2026-08-16) : cette fonctionnalité n'existait auparavant que
// comme nom de démo à lignes figées (voir l'historique git avant ce commit).
// Construite ici comme un vrai ouvrage catalogue (solution id 17), sur les
// mêmes hypothèses que le moteur
// optimize1DLinearCuts() déjà présent dans index_jsx.js mais jamais relié à
// une recette : poteaux espacés de 1m (hauteur 1.2m), 3 lisses horizontales
// par intervalle, débitées dans des barres commerciales de 6m.
//
// Vérification arithmétique : 30 spans × 1m = 31 poteaux de 1.2m (37.2m) +
// 90 segments de lisse de 1m (90m) = 127.2m à débiter. ceil(127.2/6) = 22
// barres, chutes = (22×6 − 127.2)/(22×6) = 3.64% < 5%. Le matériau dédié
// (refId 31, waste: 0%) évite de compter la perte deux fois — voir le
// commentaire sur ce matériau dans index_jsx.js (P0.7).
import { pathToFileURL } from 'node:url';
import {
    launchApp, enterGuestMode, addCatalogItemBySearch,
    setFirstOuvrageLinearLength, openDecompositionTab, readFirstOuvrageBreakdown
} from './lib/harness.mjs';

const EXPECTED = { longueurBarres: 127.2, barres: 22, debourseMaterielFcfa: 198000 };
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
        await addCatalogItemBySearch(page, 'Garde-Corps');
        await setFirstOuvrageLinearLength(page, 30);
        await openDecompositionTab(page);

        const breakdown = await readFirstOuvrageBreakdown(page);
        ok('Décomposition du déboursé lisible dans l\'inspecteur', breakdown.found, JSON.stringify(breakdown.raw));

        if (breakdown.found) {
            const barresRow = breakdown.rows.find((row) => /Tube carré|Débit barres/i.test(row.poste || ''));

            const longueur = barresRow?.grossQty;
            ok(
                `Longueur à débiter = ${EXPECTED.longueurBarres} m (31 poteaux × 1.2m + 90 segments × 1m, tolérance ${TOLERANCE})`,
                longueur !== null && Math.abs(longueur - EXPECTED.longueurBarres) <= TOLERANCE,
                `mesuré=${longueur} m — ligne source: ${JSON.stringify(barresRow)}`
            );

            const materielFcfa = barresRow?.costPurchased;
            ok(
                `Déboursé matériel = ${EXPECTED.debourseMaterielFcfa} FCFA (tolérance ${TOLERANCE})`,
                materielFcfa !== null && Math.abs(materielFcfa - EXPECTED.debourseMaterielFcfa) <= TOLERANCE,
                `mesuré=${materielFcfa} FCFA (attendu: arrondi à ${EXPECTED.barres} barres de 6m)`
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
