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
//   ⚠️ RÉVISION 2026-08-26 — le volet « facturé » de (b) est SUPERSÉDÉ. Le devis
//   impute désormais le CONSOMMÉ, pas le conditionnement entier : un reliquat
//   (ici 7,80 L de peinture, ailleurs 199 modules LED) est du stock réutilisable,
//   et le faire payer au premier chantier gonflait son prix — l'effet le plus
//   visible était un prix identique de 0,25 à 1,44 m² sur une même plaque.
//   Ce que (b) verrouille reste ENTIÈREMENT valable et vérifié ci-dessous : le
//   calcul du besoin d'achat (97,20 L → 7 pots → 315 000 FCFA) est inchangé.
//   Seule la colonne lue a changé — le test pointe explicitement le coût d'ACHAT
//   (`costPurchased`), là où il lisait un index de colonne qui portait alors la
//   même valeur. Aucune valeur de référence n'a été modifiée.
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

const EXPECTED = { consumptionL: 97.2, wastePct: 8, potsOf15L: 7, debourseMaterielFcfa: 315000 };
const TOLERANCE = 0; // étalon "tolérance zéro" — volontairement strict

const parseNum = (s) => {
    if (s === undefined || s === null) return null;
    const cleaned = String(s).replace(/[^\d.,-]/g, '').replace(/\s/g, '');
    const n = parseFloat(cleaned);
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

        const breakdown = await readFirstOuvrageBreakdown(page);
        ok('Décomposition du déboursé lisible dans l\'inspecteur', breakdown.found, JSON.stringify(breakdown.raw));

        if (breakdown.found) {
            // Colonnes attendues : [Poste, Quantité Nette, Perte %, Coût Unitaire, Coût Total]
            const peintureRow = breakdown.rows.find((row) => /Pot Peinture|Peinture Satinée/i.test(row.poste || ''));

            const litres = peintureRow?.grossQty;
            ok(
                `Consommation peinture = ${EXPECTED.consumptionL} L (tolérance ${TOLERANCE})`,
                litres !== null && Math.abs(litres - EXPECTED.consumptionL) <= TOLERANCE,
                `mesuré=${litres} L — ligne source: ${JSON.stringify(peintureRow)}`
            );

            const wastePct = peintureRow?.wastePct;
            ok(
                `Taux de perte par défaut = ${EXPECTED.wastePct}% (éditable par ouvrage, non surchargé ici)`,
                wastePct !== null && Math.abs(wastePct - EXPECTED.wastePct) <= TOLERANCE,
                `mesuré=${wastePct}%`
            );

            const materielFcfa = peintureRow?.costPurchased;
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
