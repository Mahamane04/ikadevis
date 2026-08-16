#!/usr/bin/env node
// Point d'entrée unique de la suite de tests — remplace le fichier du même nom
// référencé par PROJECT_MASTER_TRACKER.md et .github/workflows/ci.yml, qui
// n'existait pas avant cette passe de remédiation (2026-08-16).
//
// État honnête de la couverture à ce jour :
//   ✅ Fumée (chargement app, mode invité)
//   ✅ Cohérence de la chaîne financière (propriété générique, tous ouvrages)
//   ✅ Étalon A — Peinture Murale : conforme (pertes 8% + arrondi conditionnement tranchés)
//   ✅ Taux de perte ajustable par ouvrage
//   ✅ Étalon B — Carrelage Sol : conforme du premier coup
//   ⚠️  Étalon E — Enseigne LED : ÉCHOUE (densité LED catalogue 45/m² vs 25/m² tracker)
//   ✅ Étalon F — Façade ACM : conforme du premier coup
//   ⚠️  Étalon G — Villa R+1 : ÉCHOUE (modèle 1-clic ~2× plus petit que le tracker)
//   ⏳ Étalons C, D : non testables (calculateurs "Plan de Débit"/"Calepinage"
//       décrits au tracker mais absents de l'app — seule une démo à lignes
//       figées existe sous le même nom, voir test_gold_standards_pending.mjs)
//
// Ne PAS interpréter un exit code 0 global comme "100% conforme" : ce script
// distingue explicitement échecs réels, échecs attendus/documentés et tests
// non exécutables dans son résumé final.
import * as smoke from './test_smoke.mjs';
import * as financialChain from './test_financial_chain_consistency.mjs';
import * as goldA from './test_gold_standard_a_peinture.mjs';
import * as wasteOverride from './test_waste_override.mjs';
import * as goldB from './test_gold_standard_b_carrelage.mjs';
import * as goldE from './test_gold_standard_e_enseigne.mjs';
import * as goldF from './test_gold_standard_f_acm.mjs';
import * as goldG from './test_gold_standard_g_villa.mjs';
import * as pending from './test_gold_standards_pending.mjs';

const SUITES = [
    { name: 'Fumée', mod: smoke, expectedToFail: false },
    { name: 'Cohérence chaîne financière', mod: financialChain, expectedToFail: false },
    { name: 'Étalon A — Peinture Murale (tolérance zéro)', mod: goldA, expectedToFail: false },
    { name: 'Taux de perte ajustable par ouvrage', mod: wasteOverride, expectedToFail: false },
    { name: 'Étalon B — Carrelage Sol (tolérance zéro)', mod: goldB, expectedToFail: false },
    { name: 'Étalon E — Enseigne Lumineuse LED (tolérance zéro)', mod: goldE, expectedToFail: true },
    { name: 'Étalon F — Façade Panneaux ACM (tolérance zéro)', mod: goldF, expectedToFail: false },
    { name: 'Étalon G — Villa R+1, 11 lots (tolérance zéro)', mod: goldG, expectedToFail: true },
];

let unexpectedFailures = 0;
let totalChecks = 0;
let passedChecks = 0;

for (const suite of SUITES) {
    console.log(`\n▶ ${suite.name}`);
    const results = await suite.mod.run();
    for (const r of results) {
        totalChecks++;
        if (r.pass) passedChecks++;
        console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    }
    const suitePassed = results.every((r) => r.pass);
    if (!suitePassed && !suite.expectedToFail) unexpectedFailures++;
    if (!suitePassed && suite.expectedToFail) {
        console.log('  ⚠️  Échec attendu (documenté) — ne compte pas comme régression.');
    }
}

console.log('\n▶ Étalons C, D (non testables — voir commentaire du fichier)');
const pendingResults = await pending.run();
for (const r of pendingResults) console.log(`  ⏳ ${r.label} — ${r.detail}`);

console.log('\n' + '─'.repeat(60));
console.log(`Vérifications individuelles : ${passedChecks}/${totalChecks} au vert`);
console.log(`Suites en régression inattendue : ${unexpectedFailures}/${SUITES.length}`);
console.log(`Étalons métier : A,B,F conformes · E,G en échec documenté · C,D non testables (${pendingResults.length}/7 non couverts)`);
console.log('─'.repeat(60));

process.exit(unexpectedFailures > 0 ? 1 : 0);
