// Banc d'essai — Étalon E (Enseigne Lumineuse LED), tolérance zéro.
// PROJECT_MASTER_TRACKER.md § 5 : 6.0 × 1.2 m (7.2 m²), attendu 180 modules
// LED 1.2W et 2 alimentations 200W.
//
// Constat initial (2026-08-16, avant correctif) : la recette catalogue
// (solution id 8) facturait "SURFACE * 45" → 324 modules pour 7.2 m² au lieu
// des 180 documentés (densité implicite 25/m²). Décision produit : corriger
// le catalogue à 25/m² plutôt que la doc à 324 — une densité trop haute
// double quasiment le coût matière facturé sur TOUTE enseigne, quelle que
// soit sa taille, ce qui est le risque le plus large des deux options.
// Corrigé (commit "P0.6") : formule modules "SURFACE * 25", et le
// coefficient de la formule d'alimentation mis en cohérence (25 × 1.2W =
// 30W/m² → "ceil(SURFACE * 30 / 200)", au lieu de 54 qui supposait 45/m²).
// Fix P0-2 (2026-08-30) — la recette "Faces Plexiglas" (id 29) divisait
// l'aire totale par l'aire de plaque (3m²) sans jamais vérifier si la face
// tient physiquement dans une plaque commerciale 1.22×2.44m. Calepinage en
// grille ajouté, meilleure orientation retenue. Ce banc vérifie le cas
// d'origine (non-régression, 6 plaques — coïncide avec l'ancien calcul
// naïf ici, la face 6×1.2m tenant dans une seule bande de plaques) ET un
// cas adversarial (7.2×1.5m, Projet 4 de la campagne de test du
// 2026-08-30) où aucune plaque ne peut couvrir la largeur en une seule
// pièce : l'ancien calcul (23.33÷3→8 plaques) ignorait que la face doit
// être composée de plusieurs plaques mises côte à côte.
import { pathToFileURL } from 'node:url';
import {
    launchApp, enterGuestMode, addCatalogItemBySearch,
    openDecompositionTab, readFirstOuvrageBreakdown
} from './lib/harness.mjs';

const EXPECTED = { modules: 180, alimentations: 2, plaquesOrigine: 6, plaquesAdversarial: 12 };
const TOLERANCE = 0;

const parseNum = (s) => {
    if (s === undefined || s === null) return null;
    const n = parseFloat(String(s).replace(/[^\d.,-]/g, '').replace(/\s/g, ''));
    return Number.isFinite(n) ? n : null;
};

// L'enseigne est en mode "rectangle" (Largeur × Hauteur), pas "surface" comme
// la peinture/le carrelage/l'ACM — on pilote donc width/height directement.
async function setRectangleDimensions(page, widthM, heightM) {
    await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')]
            .find((b) => (b.getAttribute('aria-label') || '').startsWith('Détails techniques de'));
        if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 150));
    await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('⚙️ Avancé'));
        if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 150));

    // On modifie largeur puis hauteur en deux passes séparées (avec un délai
    // entre les deux) : les deux champs sont des composants contrôlés React
    // dépendant du même calcForm — les modifier dans le même tick via deux
    // dispatchEvent consécutifs expose une fermeture (closure) obsolète de
    // calcForm et fait que le second changement écrase silencieusement le
    // premier avant que le re-render n'ait eu lieu.
    const setNth = async (fromEnd, val) => {
        const set = await page.evaluate((fromEnd, val) => {
            const inputs = [...document.querySelectorAll('input[type="number"]')];
            const input = inputs[inputs.length - fromEnd];
            if (!input) return false;
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(input, String(val));
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }, fromEnd, val);
        await new Promise((r) => setTimeout(r, 200));
        return set;
    };
    const setWidth = await setNth(2, widthM);
    const setHeight = await setNth(1, heightM);
    if (!setWidth || !setHeight) throw new Error('Champs largeur/hauteur introuvables.');
}

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await enterGuestMode(page);
        await addCatalogItemBySearch(page, 'Caisson Enseigne Lumineuse');
        await setRectangleDimensions(page, 6.0, 1.2);
        await openDecompositionTab(page);

        const breakdown = await readFirstOuvrageBreakdown(page);
        ok('Décomposition du déboursé lisible dans l\'inspecteur', breakdown.found, JSON.stringify(breakdown.raw));

        if (breakdown.found) {
            const ledRow = breakdown.rows.find((row) => /Modules LED/i.test(row.poste || ''));
            const modules = ledRow?.grossQty;
            ok(
                `Modules LED = ${EXPECTED.modules} (tolérance ${TOLERANCE})`,
                modules !== null && Math.abs(modules - EXPECTED.modules) <= TOLERANCE,
                `mesuré=${modules} — ligne source: ${JSON.stringify(ledRow)} — densité catalogue actuelle 45/m² vs 25/m² implicite au tracker`
            );

            const alimRow = breakdown.rows.find((row) => /Alimentation/i.test(row.poste || ''));
            const alimentations = alimRow?.grossQty;
            ok(
                `Alimentations = ${EXPECTED.alimentations} (tolérance ${TOLERANCE})`,
                alimentations !== null && Math.abs(alimentations - EXPECTED.alimentations) <= TOLERANCE,
                `mesuré=${alimentations} — ligne source: ${JSON.stringify(alimRow)}`
            );

            const plexiRow = breakdown.rows.find((row) => /Plexiglas/i.test(row.poste || ''));
            ok(
                `Plaques Plexiglas (cas d'origine 6×1.2m) = ${EXPECTED.plaquesOrigine} (calepinage 1.22×2.44m ×2 faces, tolérance ${TOLERANCE})`,
                plexiRow?.packsNeeded === EXPECTED.plaquesOrigine,
                `mesuré=${plexiRow?.packsNeeded} — ligne source: ${JSON.stringify(plexiRow)}`
            );
        }
    } finally {
        await close();
    }

    // --- Cas adversarial : 7.2×1.5m, aucune plaque ne couvre la largeur ---
    {
        const { page, close } = await launchApp();
        try {
            await enterGuestMode(page);
            await addCatalogItemBySearch(page, 'Caisson Enseigne Lumineuse');
            await setRectangleDimensions(page, 7.2, 1.5);
            await openDecompositionTab(page);

            const b2 = await readFirstOuvrageBreakdown(page);
            ok('Cas adversarial (7.2×1.5m) — décomposition lisible', b2.found, JSON.stringify(b2.raw));

            if (b2.found) {
                const plexiRow2 = b2.rows.find((row) => /Plexiglas/i.test(row.poste || ''));
                ok(
                    `Plaques Plexiglas (cas adversarial 7.2×1.5m) = ${EXPECTED.plaquesAdversarial} — PAS 8 (ancien calcul surfacique 23.33÷3, tolérance ${TOLERANCE})`,
                    plexiRow2?.packsNeeded === EXPECTED.plaquesAdversarial,
                    `mesuré=${plexiRow2?.packsNeeded} — ligne source: ${JSON.stringify(plexiRow2)}`
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
