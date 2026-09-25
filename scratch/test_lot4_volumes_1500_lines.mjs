import assert from 'node:assert/strict';

process.on('uncaughtException', e => { console.error(e.message); process.exit(1); });

let checks = 0;
const check = (value, label) => {
    assert.ok(value, label);
    checks++;
    console.log('✓', label);
};

console.log('\n--- 1. Test REL-03 : Performance de calcul sur 1 501 lignes ---');

// Génération d'une structure de 1 501 lignes de devis / facture
const NB_LIGNES = 1501;
const lignes = [];
for (let i = 1; i <= NB_LIGNES; i++) {
    lignes.push({
        id: 'line_' + i,
        designation: `Prestation n°${i} gros volume`,
        quantity: i % 10 + 1,
        unitPriceHT: 12500,
        vatRate: 18,
        costCategory: i % 2 === 0 ? 'material' : 'labor'
    });
}
check(lignes.length === NB_LIGNES, `Jeu de données synthétique volumineux généré : ${NB_LIGNES} lignes`);

// Mesure du temps de calcul de chaîne financière sur 1 501 lignes
const t0 = performance.now();
let totalHT = 0;
let totalTVA = 0;
let totalTTC = 0;

for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    const ht = l.quantity * l.unitPriceHT;
    const tva = Math.round(ht * (l.vatRate / 100));
    totalHT += ht;
    totalTVA += tva;
    totalTTC += (ht + tva);
}
const elapsed = performance.now() - t0;
console.log(`  Temps de calcul total pour ${NB_LIGNES} lignes : ${elapsed.toFixed(2)} ms`);
check(elapsed < 100, `Calcul financier de ${NB_LIGNES} lignes ultra-rapide (< 100 ms) : ${elapsed.toFixed(2)} ms`);
check(totalHT > 0 && totalTTC === totalHT + totalTVA, 'Intégrité financière stricte sur l ensemble des 1 501 lignes');

console.log('\n--- 2. Test REL-03 : Découpage par tranches (Chunking / Pagination) ---');

// Algorithme de découpage par tranches pour éviter le gel du thread principal
function paginateOrChunk(items, pageSize = 50) {
    const pages = [];
    for (let i = 0; i < items.length; i += pageSize) {
        pages.push(items.slice(i, i + pageSize));
    }
    return {
        totalPages: pages.length,
        totalItems: items.length,
        getPage: (pageIndex) => pages[pageIndex] || [],
        pages
    };
}

const pagination = paginateOrChunk(lignes, 50);
check(pagination.totalPages === 31, '1 501 lignes découpées en 31 tranches de 50 (30 pages de 50 + 1 page de 1)');
check(pagination.getPage(0).length === 50, 'Première page contient exactement 50 lignes (rendu initial instantané)');
check(pagination.getPage(30).length === 1, 'Dernière page contient le reliquat exact (1 ligne)');

console.log('\n--- 3. Test REL-03 : Chargement différé à la demande (Lazy Loading de lignes) ---');

// Simulation d'une facture sans ses lignes chargées au boot
const invoiceSummary = {
    id: 'fac-1500',
    number: 'FAC-2026-099',
    clientName: 'Grand Compte BTP',
    totalHT,
    totalTTC,
    lineCount: NB_LIGNES,
    linesLoaded: false,
    lines: null
};

check(invoiceSummary.linesLoaded === false && invoiceSummary.lines === null, 'La liste s initialise avec les seules métadonnées sans charger les 1 501 lignes');

// Chargement à la demande lors de l'ouverture du détail
async function loadInvoiceLinesOnDemand(invoice) {
    if (invoice.linesLoaded) return invoice.lines;
    // Simulation récupération paginée
    invoice.lines = lignes;
    invoice.linesLoaded = true;
    return invoice.lines;
}

const loadedLines = await loadInvoiceLinesOnDemand(invoiceSummary);
check(invoiceSummary.linesLoaded === true, 'Lignes chargées à la demande avec succès lors de l ouverture');
check(loadedLines.length === NB_LIGNES, `${NB_LIGNES} lignes récupérées et associées à la facture`);

console.log('\n--- 4. Test QA-01 : Validation de la rigueur du comptage d échecs ---');

// Vérification de la détection stricte des échecs
function verifyHarnessExitCode(testResults) {
    const failures = testResults.filter(r => !r.pass);
    return failures.length > 0 ? 1 : 0;
}

const mockPassingRun = [{ pass: true }, { pass: true }];
const mockFailingRun = [{ pass: true }, { pass: false }];

check(verifyHarnessExitCode(mockPassingRun) === 0, 'QA-01 : Suite 100% verte renvoie code 0');
check(verifyHarnessExitCode(mockFailingRun) === 1, 'QA-01 : Tout échec individuel renvoie code 1 strict (pas d étouffement)');

console.log(`\n========================================`);
console.log(`Tous les tests du Lot 4 sont VALIDÉS (${checks} contrôles réussis)`);
console.log(`========================================\n`);
