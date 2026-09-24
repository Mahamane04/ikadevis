import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../index_jsx.js', import.meta.url), 'utf8');
const engine = readFileSync(new URL('../js/calc-engine.js', import.meta.url), 'utf8');
const context = vm.createContext({ console });
vm.runInContext(engine, context);
// Exercise the actual display adapter against independently expected invoice values.
vm.runInContext(source.slice(source.indexOf('const ligneFacturee ='), source.indexOf('const formatQuantite =')), context);
vm.runInContext(source.match(/^const normaliserStatutDevis = .*$/m)[0], context);
const billed = vm.runInContext('ligneFacturee', context);
const normalizeStatus = vm.runInContext('normaliserStatutDevis', context);
let checks = 0;
const equal = (actual, expected, label) => { assert.equal(actual, expected, label); checks++; };

const excavation = { qty: 1, unitPriceHT: 1638000, totalHT: 1638000, metre: { value: 168, unit: 'm³' } };
equal(billed(excavation).prixUnitaire, 9750, '168 m³ : le PU est 9 750, jamais le total historique');
equal(billed(excavation).quantite, 168, 'La quantité de facturation est le métré');
equal(billed(excavation).unite, 'm³', 'Unité de métré conservée');
equal(billed({ isCustom: true, qty: 3, totalHT: 45000, unit: 'jour' }).prixUnitaire, 15000, 'Ligne libre : prix par jour');
equal(billed({ ...excavation, totalHT: 0 }).prixUnitaire, 0, 'Prix nul conservé');

const solution = [{ id: 1, name: 'Fouilles', allowedModes: ['volume'], customVars: [] }];
const materials = [{ id: 1, name: 'Coût direct', unitCalc: 'm³', unitBuy: 'm³', unitSize: 1, priceBuy: 6500, priceCalc: 6500, waste: 0, purchaseMode: 'real' }];
const recipes = [{ id: 1, solutionId: 1, type: 'material', refId: 1, formula: 'VOLUME', costCategory: 'material', label: 'Coût direct' }];
const item = { id: 'fouilles', solutionId: 1, qty: 1, calcForm: { solutionId: 1, takeoffMode: 'volume', width: 14, height: 20, depth: .6, qty: 1, faces: 1, customVarValues: {}, overheadRate: 5, margin: 30, marginType: 'reel', vatRate: 18, discountRate: 0 } };
const result = context.calculateSingleWorkItem(item, solution, materials, [], recipes, {});
equal(result.quoteData.totalDebourseConsomme, 1092000, 'Coûts directs');
equal(result.quoteData.totalRevientConsomme, 1146600, 'Coût de revient inclut les frais');
equal(result.quoteData.netHTConsomme, 1638000, 'Prix de vente');
equal(result.quoteData.margeValeurConsomme, 491400, 'Marge après frais');
const loss = context.calculateSingleWorkItem({ ...item, calcForm: { ...item.calcForm, discountRate: 50 } }, solution, materials, [], recipes, {});
equal(loss.quoteData.margeValeurConsomme, -327600, 'Une remise qui fait vendre à perte conserve une marge négative');

for (const status of ['approved', 'sent', 'ready', 'draft']) {
    const saved = { id: 101, number: 'DEV-2026-001', status, hybridQuoteSnapshot: { id: 'old', number: 'old', status: 'draft', lots: [], vatRate: 18, overheadRate: 5, margin: 30 } };
    const restored = context.adaptSavedQuoteToHybrid(saved, [], [], [], []);
    equal(restored.status, status, `La fiche enregistrée fait foi pour le statut ${status}`);
    equal(restored.id, 101, 'Identité conservée');
    equal(context.adaptHybridToSavedQuote(restored, {}).status, status, 'Statut conservé dans le nouvel aperçu');
}
equal(normalizeStatus('approved'), 'accepted', 'Ancien statut approuvé reconnu par les sélecteurs');
equal(normalizeStatus('review'), 'to_verify', 'Ancien statut à vérifier reconnu');
console.log(`${checks} vérifications financières et de statut réussies.`);
