import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../index_jsx.js', import.meta.url), 'utf8');
const quickAddStart = source.indexOf('/* Ajout rapide depuis la fiche');
const quickAddEnd = source.indexOf('{inlineRecipeDraft &&', quickAddStart);

assert.ok(quickAddStart >= 0, 'Le bloc d’ajout rapide du catalogue doit exister.');
assert.ok(quickAddEnd > quickAddStart, 'Le bloc d’ajout rapide doit être délimité.');

const quickAdd = source.slice(quickAddStart, quickAddEnd);

assert.match(source, /const \[isCatalogResourceSearchOpen, setIsCatalogResourceSearchOpen\] = useState\(false\)/);
assert.match(source, /const getCatalogQuickAddResults = \(\) => \{/);
assert.doesNotMatch(source, /catalogResourceType/);
assert.doesNotMatch(source, /catalogResourceId/);
assert.match(quickAdd, /onFocus=\{\(\) => setIsCatalogResourceSearchOpen\(true\)\}/);
assert.match(quickAdd, /onClick=\{\(\) => addCatalogResourceToSolution\(resource, type\)\}/);
assert.match(quickAdd, /role="listbox"/);
assert.match(quickAdd, /max-h-64 overflow-y-auto/);
assert.doesNotMatch(quickAdd, /Ajouter un composant/);

console.log('✓ Recherche rapide catalogue : liste directe, ajout en un clic et aucun sélecteur redondant.');
