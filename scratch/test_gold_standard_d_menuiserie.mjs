// Banc d'essai — Étalon D (Dressing Menuiserie, Calepinage 2D), tolérance zéro.
// PROJECT_MASTER_TRACKER.md § 5 : 3.0 × 2.5 m, attendu 28.5 m² de bois →
// 6 panneaux mélaminé de 6m².
//
// Contexte (2026-08-16) : cette fonctionnalité n'existait auparavant que
// comme nom de démo à lignes figées. Construite ici comme un vrai ouvrage
// catalogue (solution id 18) : caisson = 2 côtés (hauteur × profondeur) +
// 1 fond (largeur × hauteur) + N tablettes (largeur × profondeur, dessus/
// dessous inclus). Profondeur 0.6m et 10 tablettes par défaut (hypothèses
// standard menuiserie, ajustables par ouvrage comme le taux de perte P0.5).
//
// Vérification arithmétique : 2×(2.5×0.6) + (3.0×2.5) + 10×(3.0×0.6)
// = 3.0 + 7.5 + 18.0 = 28.5 m² exactement. +8% de chute (cohérent avec le
// même taux déjà utilisé sur l'ACM) → 30.78 m² à acheter, ceil(30.78/6) = 6
// plaques de 6m².
import { pathToFileURL } from 'node:url';
import {
    launchApp, enterGuestMode, addCatalogItemBySearch,
    setFirstOuvrageRectangle, openDecompositionTab, readFirstOuvrageBreakdown
} from './lib/harness.mjs';

const EXPECTED = { surfaceNetteM2: 28.5, plaques: 6, debourseMaterielFcfa: 270000 };
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
        await addCatalogItemBySearch(page, 'Dressing Menuiserie');
        await setFirstOuvrageRectangle(page, 3.0, 2.5);
        await openDecompositionTab(page);

        const breakdown = await readFirstOuvrageBreakdown(page);
        ok('Décomposition du déboursé lisible dans l\'inspecteur', breakdown.found, JSON.stringify(breakdown.raw));

        if (breakdown.found) {
            const panneauRow = breakdown.raw.find((row) => /Panneaux mélaminé/i.test(row[0] || ''));

            // La "Quantité Nette" affichée inclut déjà le +8% de perte (billedQty),
            // comme pour l'Étalon A (peinture). 28.5 × 1.08 = 30.78 m².
            const surfaceBilled = parseNum(panneauRow?.[1]);
            ok(
                `Surface nette à acheter = 30.78 m² (28.5 m² + 8% pertes, tolérance ${TOLERANCE})`,
                surfaceBilled !== null && Math.abs(surfaceBilled - 30.78) <= TOLERANCE,
                `mesuré=${surfaceBilled} m² — ligne source: ${JSON.stringify(panneauRow)}`
            );

            const materielFcfa = parseNum(panneauRow?.[4]);
            ok(
                `Déboursé matériel = ${EXPECTED.debourseMaterielFcfa} FCFA (tolérance ${TOLERANCE})`,
                materielFcfa !== null && Math.abs(materielFcfa - EXPECTED.debourseMaterielFcfa) <= TOLERANCE,
                `mesuré=${materielFcfa} FCFA (attendu: arrondi à ${EXPECTED.plaques} plaques de 6m²)`
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
