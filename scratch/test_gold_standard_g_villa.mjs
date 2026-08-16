// Banc d'essai — Étalon G (Villa R+1, 11 lots TCE), tolérance zéro.
// PROJECT_MASTER_TRACKER.md § 5 : Déboursé 65 M, PV Net HT 91.26 M,
// Coeff K = 1.404, TTC 107.68 M.
//
// Contrairement aux Étalons C et D (voir test_gold_standards_pending.mjs),
// le modèle "Construction Villa Duplex R+1" chargeable en 1-clic EST piloté
// par le vrai moteur de calcul (solutionId + calcForm réels sur chaque ligne,
// pas des lignes libres figées) — donc testable comme un étalon normal.
//
// Constat au 2026-08-16 (état invité propre, sans devis résiduel en cache) :
// le modèle chargé calcule Déboursé 25 621 142 FCFA, K=1.769, Net HT
// 45 331 713 FCFA, TTC 53 491 421 FCFA — environ 2× plus petit que les
// 65 M / 91.26 M / 107.68 M documentés. Piste la plus probable : les
// quantités/dimensions du modèle 1-clic (ex. terrassement 250 m³, structure
// 4m×2m...) correspondent à une villa plus modeste que celle utilisée pour
// calibrer les chiffres du tracker, ou le tracker date d'une configuration
// de prix/coefficients différente. Non creusé plus loin dans cette passe
// (11 lots, ~20 lignes de calcul : isoler la cause exacte demanderait de
// rejouer chaque lot un par un).
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode, loadOneClickTemplate, readFinancials } from './lib/harness.mjs';

const EXPECTED = { debourseSec: 65000000, coeffK: 1.404, netHT: 91260000, totalTTC: 107680000 };
const TOLERANCE = 0;

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await enterGuestMode(page);
        await loadOneClickTemplate(page, 'Construction Villa Duplex R+1');

        const f = await readFinancials(page);

        ok(
            `Déboursé Sec = ${EXPECTED.debourseSec.toLocaleString('fr-FR')} FCFA (tolérance ${TOLERANCE})`,
            f.debourseSec === EXPECTED.debourseSec,
            `mesuré=${f.debourseSec} FCFA`
        );
        ok(
            `Coefficient K = ${EXPECTED.coeffK}`,
            f.coeffK === EXPECTED.coeffK,
            `mesuré=K${f.coeffK}`
        );
        ok(
            `Total Net HT = ${EXPECTED.netHT.toLocaleString('fr-FR')} FCFA (tolérance ${TOLERANCE})`,
            f.totalNetHt === EXPECTED.netHT,
            `mesuré=${f.totalNetHt} FCFA`
        );
        ok(
            `Total TTC = ${EXPECTED.totalTTC.toLocaleString('fr-FR')} FCFA (tolérance ${TOLERANCE})`,
            f.totalTtc === EXPECTED.totalTTC,
            `mesuré=${f.totalTtc} FCFA`
        );
    } finally {
        await close();
    }
    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    if (!results.every((r) => r.pass)) {
        console.log('\n  ⚠️  Échec attendu et documenté — écart réel entre le modèle 1-clic et le tracker, non résolu.');
        console.log('     Voir le commentaire en tête de fichier pour la piste probable.');
    }
    process.exit(results.every((r) => r.pass) ? 0 : 1);
}
