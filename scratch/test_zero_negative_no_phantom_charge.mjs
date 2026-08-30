// Banc d'essai — Fix P0-3 / P1 (2026-08-30), tolérance zéro.
//
// Campagne de test QA externe du 2026-08-29/30 (10 projets réels) : une
// surface mise à 0 dans l'inspecteur avancé facturait quand même un montant
// non nul (ex. 36 507 FCFA TTC sur du carrelage), et une valeur négative
// n'était ni rejetée ni traitée comme une déduction — elle retombait sur un
// plancher résiduel positif. Cause racine (js/calc-engine.js) : le pattern
// `parseFloat(x) || fallback` traite un 0 explicitement saisi comme "non
// renseigné" (0 est falsy en JS) et retombe sur widthVal*heightVal, qui peut
// contenir un résidu d'un autre mode de métré déjà visité par l'utilisateur
// dans la même session d'édition (ex. width=2/height=1 par défaut).
//
// Ce banc vérifie qu'une surface à 0 facture bien 0 FCFA, et qu'une surface
// négative ne facture jamais un montant positif résiduel.
import { pathToFileURL } from 'node:url';
import {
    launchApp, enterGuestMode, addCatalogItemBySearch,
    setFirstOuvrageSurface, readFinancials
} from './lib/harness.mjs';

const TOLERANCE = 0;

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    // --- Cas 1 : surface = 0 → doit facturer exactement 0 FCFA ---
    {
        const { page, close } = await launchApp();
        try {
            await enterGuestMode(page);
            await addCatalogItemBySearch(page, 'Carrelage');
            await setFirstOuvrageSurface(page, 0);

            const f = await readFinancials(page);
            ok(
                `Surface = 0 → Total Net HT = 0 FCFA (pas de montant fantôme, tolérance ${TOLERANCE})`,
                Math.abs((f.totalNetHt || 0) - 0) <= TOLERANCE,
                `mesuré=${f.totalNetHt} FCFA — ${JSON.stringify(f.raw)}`
            );
            ok(
                `Surface = 0 → Déboursé Sec = 0 FCFA (tolérance ${TOLERANCE})`,
                Math.abs((f.debourseSec || 0) - 0) <= TOLERANCE,
                `mesuré=${f.debourseSec} FCFA`
            );
        } finally {
            await close();
        }
    }

    // --- Cas 2 : surface négative → jamais de montant positif résiduel ---
    // Le contrat exact n'est pas "rejeter" (pas de validation bloquante côté
    // UI à ce jour) mais "ne jamais facturer plus que le cas surface=0" —
    // avant le fix, -15 facturait 183 FCFA (positif, non nul) au lieu de 0.
    {
        const { page, close } = await launchApp();
        try {
            await enterGuestMode(page);
            await addCatalogItemBySearch(page, 'Carrelage');
            await setFirstOuvrageSurface(page, -15);

            const f = await readFinancials(page);
            ok(
                `Surface = -15 → Total Net HT = 0 FCFA (jamais un montant positif résiduel, tolérance ${TOLERANCE})`,
                Math.abs((f.totalNetHt || 0) - 0) <= TOLERANCE,
                `mesuré=${f.totalNetHt} FCFA — ${JSON.stringify(f.raw)}`
            );
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
