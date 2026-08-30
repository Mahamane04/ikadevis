// Banc d'essai — Étalon F (Façade Panneaux ACM), tolérance zéro.
//
// Fix P0-2 (2026-08-30) — l'ancienne formule ('SURFACE') divisait l'aire
// totale par l'aire de plaque (6m²) sans jamais vérifier si la façade tient
// physiquement dans une plaque commerciale 1.22×2.44m. Le mode 'surface'
// (saisie d'une aire agrégée, sans largeur/hauteur individuelles) a été
// retiré du catalogue pour cet ouvrage : le calepinage réel a besoin de ces
// deux dimensions séparément, une aire seule ne suffit pas à savoir si la
// façade rentre dans une plaque. Ce banc est donc réécrit en mode
// 'rectangle' (il utilisait `setFirstOuvrageSurface` — cassé depuis le fix,
// le champ "Surface Directe" n'existe plus pour cet ouvrage).
//
// Dimensions choisies : 18m × 10m = 180m², conservant l'aire de référence du
// tracker d'origine tout en étant un rectangle réaliste de façade (au lieu
// d'une aire abstraite sans forme).
//
// Vérification arithmétique : plaque 1.22×2.44m (aire réelle 2.9768m², les
// 6m² catalogue = 2 plaques physiques/pack). Orientation normale :
// ceil(18/1.22)×ceil(10/2.44) = 15×5 = 75 plaques/face. Orientation tournée :
// ceil(18/2.44)×ceil(10/1.22) = 8×9 = 72 plaques/face (meilleure — retenue
// par min()). packs = ceil(72/2) = 36 plaques (6m²) — PAS 33 (l'ancien calcul
// par simple division surfacique 180×1.08/6=194.4/6→33, qui ne vérifiait pas
// que 18m ou 10m dépassent la plus petite dimension de plaque).
import { pathToFileURL } from 'node:url';
import {
    launchApp, enterGuestMode, addCatalogItemBySearch,
    setFirstOuvrageRectangle, openDecompositionTab, readFirstOuvrageBreakdown
} from './lib/harness.mjs';

const EXPECTED = { plaques: 36, coutAchat: 36 * 65000 };
const TOLERANCE = 0;

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await enterGuestMode(page);
        await addCatalogItemBySearch(page, 'Habillage Façade');
        await setFirstOuvrageRectangle(page, 18, 10);
        await openDecompositionTab(page);

        const breakdown = await readFirstOuvrageBreakdown(page);
        ok('Décomposition du déboursé lisible dans l\'inspecteur', breakdown.found, JSON.stringify(breakdown.raw));

        if (breakdown.found) {
            const acmRow = breakdown.rows.find((row) => /Alucobond|ACM/i.test(row.poste || ''));

            ok(
                `Plaques achetées = ${EXPECTED.plaques} (18×10m, calepinage 1.22×2.44m, orientation tournée retenue, tolérance ${TOLERANCE})`,
                acmRow?.packsNeeded === EXPECTED.plaques,
                `mesuré=${acmRow?.packsNeeded} — ligne source: ${JSON.stringify(acmRow)}`
            );

            ok(
                `Déboursé matériel ACM = ${EXPECTED.coutAchat} FCFA (36 × 65 000 FCFA/plaque, tolérance ${TOLERANCE})`,
                acmRow?.costPurchased === EXPECTED.coutAchat,
                `mesuré=${acmRow?.costPurchased} FCFA`
            );

            ok(
                'Aucun reliquat (waste:0 dédié, calepinage déjà exact — pas de double perte)',
                acmRow?.wastePct === 0,
                `perte mesurée=${acmRow?.wastePct}%`
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
