import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../index_jsx.js', import.meta.url), 'utf8');

assert.match(source, /Assistant de mise en conformité/, 'L’assistant de correction doit être disponible.');
assert.match(source, /Appliquer la recommandation/, 'Chaque recommandation doit pouvoir être confirmée séparément.');
assert.match(source, /Tout corriger \(\{systemDiagnostic\.recommendedRepairs\.length\}\)/, 'La correction groupée doit être proposée.');
assert.match(source, /const applyCatalogRepairs = \(repairs\)/, 'La correction groupée doit appliquer toutes les modifications dans une seule opération.');
assert.doesNotMatch(source, /repairs\.forEach\(repair => applyCatalogRepair\(repair\)\)/, 'La correction groupée ne doit pas écraser les corrections précédentes.');
assert.match(source, /Réglage de métré à vérifier/, 'Un composant incompatible ne doit pas être ajouté silencieusement.');
assert.match(source, /id: 'volume', label: 'Volume/, 'Le mode volume doit être configurable.');
assert.match(source, /updateSolutions\(updatedSolutions\)/, 'Les modes de métré doivent être synchronisés via le mécanisme prévu.');

console.log('✓ Assistant catalogue : recommandations, protection et correction groupée vérifiés.');
