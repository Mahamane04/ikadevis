// Banc d'essai — Étalon C (Garde-Corps Métallerie, Plan de Débit 1D), tolérance zéro.
// PROJECT_MASTER_TRACKER.md § 5 : 30 ml, attendu 31 poteaux, 3 lisses → 22
// barres de 6m (chutes < 5%).
//
// Fix P0-1 (2026-08-30) — la recette d'origine (id 61 seule) additionnait
// poteaux et lisses en un seul mètre linéaire avant un ceil(total/6) unique.
// Ça ne coïncidait avec le vrai bin-packing que par hasard, quand la longueur
// de poteau divise exactement 6m (1.2m → 5 pièces/barre, 0 chute — le cas
// ORIGINAL testé ici). Dès que la longueur de poteau ne divise pas 6m
// exactement (1.10m, cas réel du scénario métallerie testé le 2026-08-30),
// la coïncidence casse : ceil((21×1.10+90)/6)=19 barres au lieu des 20
// réellement nécessaires (5 pour les poteaux, calepinés séparément puisque
// 21 pièces de 1.10m ne tiennent qu'à 5/barre — 4 barres ne suffiraient qu'à
// 20 pièces — + 15 pour les lisses, coupe continue où la division simple
// est déjà exacte). La recette est maintenant scindée en deux lignes (id 61
// poteaux, id 66 lisses), chacune avec sa propre formule de calepinage
// fermée. Ce banc vérifie les DEUX cas : le cas d'origine (non-régression)
// et le cas adversarial 1.10m (celui qui aurait dû faire échouer l'étalon
// depuis le début).
import { pathToFileURL } from 'node:url';
import {
    launchApp, enterGuestMode, addCatalogItemBySearch,
    setFirstOuvrageLinearLength, setFirstOuvrageCustomVar,
    openDecompositionTab, readFirstOuvrageBreakdown
} from './lib/harness.mjs';

const TOLERANCE = 0;
const BAR_PRICE_FCFA = 9000; // refId 31 : Tube carré acier 25x25, Barre (6m), priceBuy 9000

const sumBarPosts = (rows) => rows.filter((row) => /Débit barres/i.test(row.poste || ''));

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    // --- Cas 1 : paramètres d'origine (non-régression) ---
    // espacement 1m (défaut), hauteur poteau 1.2m (défaut, divise 6m
    // exactement) → 31 poteaux × 1.2m = 37.2m (7 barres, ceil(31/5)) +
    // 90m de lisses (15 barres, exact) = 22 barres, 198 000 FCFA.
    {
        const { page, close } = await launchApp();
        try {
            await enterGuestMode(page);
            await addCatalogItemBySearch(page, 'Garde-Corps');
            await setFirstOuvrageLinearLength(page, 30);
            await openDecompositionTab(page);

            const b1 = await readFirstOuvrageBreakdown(page);
            ok('Cas 1 (1.2m/défaut) — décomposition lisible', b1.found, JSON.stringify(b1.raw));

            if (b1.found) {
                const barRows1 = sumBarPosts(b1.rows);
                ok('Cas 1 — deux lignes de débit distinctes (poteaux + lisses)', barRows1.length === 2, JSON.stringify(barRows1.map(r => r.poste)));

                const totalBarres1 = barRows1.reduce((sum, r) => sum + (r.packsNeeded || 0), 0);
                ok(
                    `Cas 1 — total barres = 22 (7 poteaux + 15 lisses, tolérance ${TOLERANCE})`,
                    totalBarres1 === 22,
                    `mesuré=${totalBarres1} — lignes: ${JSON.stringify(barRows1.map(r => ({ poste: r.poste, packsNeeded: r.packsNeeded })))}`
                );

                const totalCoutAchat1 = barRows1.reduce((sum, r) => sum + (r.costPurchased || 0), 0);
                const expectedCout1 = 22 * BAR_PRICE_FCFA;
                ok(
                    `Cas 1 — déboursé matériel total = ${expectedCout1} FCFA (tolérance ${TOLERANCE})`,
                    Math.abs(totalCoutAchat1 - expectedCout1) <= TOLERANCE,
                    `mesuré=${totalCoutAchat1} FCFA`
                );
            }
        } finally {
            await close();
        }
    }

    // --- Cas 2 : adversarial — hauteur poteau 1.10m, espacement 1.5m ---
    // Ne divise PAS 6m exactement (floor(6/1.10)=5 pièces/barre, 0.5m de
    // chute/barre). 21 poteaux × 1.10m = 23.10m ; naïvement ceil(23.10/6)
    // = 4 barres, mais 4 barres × 5 pièces = 20 places < 21 poteaux
    // requis → il en faut réellement 5. Lisses : 90m → 15 barres exactes.
    // Total réel = 20 barres, 180 000 FCFA. C'est le cas que l'ancienne
    // formule à une seule ligne aurait sous-compté à 19 barres.
    {
        const { page, close } = await launchApp();
        try {
            await enterGuestMode(page);
            await addCatalogItemBySearch(page, 'Garde-Corps');
            await setFirstOuvrageLinearLength(page, 30);
            await setFirstOuvrageCustomVar(page, 'Espacement des poteaux (m)', 1.5);
            await setFirstOuvrageCustomVar(page, 'Hauteur des poteaux (m)', 1.10);
            await openDecompositionTab(page);

            const b2 = await readFirstOuvrageBreakdown(page);
            ok('Cas 2 (1.10m adversarial) — décomposition lisible', b2.found, JSON.stringify(b2.raw));

            if (b2.found) {
                const barRows2 = sumBarPosts(b2.rows);
                const totalBarres2 = barRows2.reduce((sum, r) => sum + (r.packsNeeded || 0), 0);
                ok(
                    `Cas 2 — total barres = 20 (5 poteaux calepinés + 15 lisses, PAS 19 — régression du bug P0-1, tolérance ${TOLERANCE})`,
                    totalBarres2 === 20,
                    `mesuré=${totalBarres2} — lignes: ${JSON.stringify(barRows2.map(r => ({ poste: r.poste, packsNeeded: r.packsNeeded })))}`
                );

                const totalCoutAchat2 = barRows2.reduce((sum, r) => sum + (r.costPurchased || 0), 0);
                const expectedCout2 = 20 * BAR_PRICE_FCFA;
                ok(
                    `Cas 2 — déboursé matériel total = ${expectedCout2} FCFA (tolérance ${TOLERANCE})`,
                    Math.abs(totalCoutAchat2 - expectedCout2) <= TOLERANCE,
                    `mesuré=${totalCoutAchat2} FCFA`
                );
            }
        } finally {
            await close();
        }
    }

    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    process.exit(results.every((r) => r.pass) ? 0 : 1);
}
