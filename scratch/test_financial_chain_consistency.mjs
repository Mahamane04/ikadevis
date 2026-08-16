// Banc d'essai — Cohérence de la chaîne financière (Déboursé Sec → Coeff K →
// Total Net HT → TVA 18% → TTC). Contrairement aux étalons métier (qui exigent
// de connaître la bonne réponse à l'avance), ce test vérifie une propriété
// mathématique qui doit être vraie quel que soit l'ouvrage : c'est un filet de
// sécurité générique contre toute régression de la chaîne DS→FC→FG→CR→MN→TTC.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode, addCatalogItemBySearch, readFinancials } from './lib/harness.mjs';

const EPS_FCFA = 5; // tolérance d'arrondi cumulée sur 3 multiplications en cascade

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await enterGuestMode(page);
        await addCatalogItemBySearch(page, 'Béton Armé');

        const f = await readFinancials(page);
        ok('Déboursé sec > 0 après ajout d\'un ouvrage', f.debourseSec > 0, JSON.stringify(f));
        ok('Coefficient K lisible et ≥ 1', Number.isFinite(f.coeffK) && f.coeffK >= 1, `K=${f.coeffK}`);

        const expectedNetHt = f.debourseSec * f.coeffK;
        ok(
            'Total Net HT ≈ Déboursé Sec × Coeff K',
            Math.abs(f.totalNetHt - expectedNetHt) <= EPS_FCFA,
            `NetHT=${f.totalNetHt} vs DS×K=${expectedNetHt}`
        );

        const expectedTtc = f.totalNetHt * 1.18;
        ok(
            'Total TTC ≈ Total Net HT × 1.18 (TVA 18%)',
            Math.abs(f.totalTtc - expectedTtc) <= EPS_FCFA,
            `TTC=${f.totalTtc} vs NetHT×1.18=${expectedTtc}`
        );

        const expectedTva = f.totalTtc - f.totalNetHt;
        ok(
            'Montant TVA affiché ≈ TTC − NetHT',
            Math.abs(f.tva - expectedTva) <= EPS_FCFA,
            `TVA affichée=${f.tva} vs calculée=${expectedTva}`
        );

        // Note : Marge Réelle ≠ NetHT − DS ici (la chaîne DS→FC→FG→CR→MN a des
        // paliers intermédiaires non exposés en synthèse). Ce qui EST vérifiable
        // depuis l'UI : Marge affichée ≈ (taux % affiché) × Total Net HT.
        const expectedMarge = (f.margePct / 100) * f.totalNetHt;
        ok(
            'Marge réelle ≈ taux affiché × Total Net HT',
            Math.abs(f.marge - expectedMarge) <= EPS_FCFA,
            `Marge affichée=${f.marge} vs ${f.margePct}%×NetHT=${expectedMarge}`
        );
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
