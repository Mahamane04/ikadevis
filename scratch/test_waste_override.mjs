// Banc d'essai — Taux de perte ajustable par ouvrage/chantier (2026-08-16).
//
// Suite à la discussion sur l'Étalon A : le taux de perte de 8% de la peinture
// est correct EN MOYENNE, mais reste un taux catalogue fixe qui ne reflète pas
// l'état réel d'un chantier donné (mur neuf lisse vs support très irrégulier).
// Ce test vérifie que l'utilisateur peut désormais ajuster ce taux pour UN
// ouvrage précis, sur UN devis précis, sans modifier le taux catalogue (qui
// reste la valeur par défaut pour tous les autres devis).
import { pathToFileURL } from 'node:url';
import {
    launchApp, enterGuestMode, addCatalogItemBySearch,
    setFirstOuvrageSurface, openDecompositionTab, readFirstOuvrageBreakdown, setWasteOverride
} from './lib/harness.mjs';

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
        await addCatalogItemBySearch(page, 'Peinture Murale');
        await setFirstOuvrageSurface(page, 450);
        await openDecompositionTab(page);

        const before = await readFirstOuvrageBreakdown(page);
        const rowBefore = before.rows?.find((r) => /Peinture Satinée/i.test(r.poste || ''));
        ok('Taux catalogue par défaut = 8% avant toute surcharge', rowBefore?.wastePct === 8, JSON.stringify(rowBefore));
        ok('Coût avant surcharge = 315 000 FCFA (référence)', rowBefore?.costPurchased === 315000, JSON.stringify(rowBefore));

        // Chantier avec un support très irrégulier : on monte le taux de perte à 15%.
        await setWasteOverride(page, 'Peinture Satinée', 15);

        const after = await readFirstOuvrageBreakdown(page);
        const rowAfter = after.rows?.find((r) => /Peinture Satinée/i.test(r.poste || ''));
        ok('Taux surchargé = 15% pris en compte', rowAfter?.wastePct === 15, JSON.stringify(rowAfter));

        // 450 m² × 15% de pertes → 103.5 L nets → 7 pots de 15L (105L, inchangé
        // car 97.2L et 103.5L arrondissent tous deux à 7 pots) → même coût que
        // le cas par défaut. On vérifie donc la quantité nette, plus discriminante
        // que le coût pour ce palier précis.
        const litresAfter = rowAfter?.grossQty;
        ok(
            'Quantité nette recalculée avec le nouveau taux (450m² × 1.15 = 517.5... hors primaire, cf. formule)',
            litresAfter !== null && litresAfter > 97.2,
            `mesuré=${litresAfter} L (doit être > 97.2 L, la valeur à 8%)`
        );

        // Revenir au taux catalogue via le bouton de réinitialisation.
        const reset = await page.evaluate(() => {
            const btn = [...document.querySelectorAll('button[aria-label^="Revenir au taux de perte catalogue"]')][0];
            if (!btn) return false;
            btn.click();
            return true;
        });
        ok('Bouton de réinitialisation au taux catalogue présent et cliqué', reset);
        await new Promise((r) => setTimeout(r, 200));

        const afterReset = await readFirstOuvrageBreakdown(page);
        const rowReset = afterReset.rows?.find((r) => /Peinture Satinée/i.test(r.poste || ''));
        ok('Retour exact au taux catalogue (8%) après réinitialisation', rowReset?.wastePct === 8, JSON.stringify(rowReset));
        ok('Retour exact au coût catalogue (315 000 FCFA) après réinitialisation', rowReset?.costPurchased === 315000, JSON.stringify(rowReset));
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
