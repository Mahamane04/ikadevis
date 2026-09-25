import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const check = (val, msg) => { assert.ok(val, msg); checks++; console.log('✓', msg); };
const reject = async (fn, msg) => { await assert.rejects(fn); checks++; console.log('✓', msg); };

// Simulation d'un localStorage propre en mémoire
class MockLocalStorage {
    constructor() {
        this.store = new Map();
    }
    get length() { return this.store.size; }
    key(i) { return Array.from(this.store.keys())[i] || null; }
    getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
    setItem(k, v) { this.store.set(k, String(v)); }
    removeItem(k) { this.store.delete(k); }
    clear() { this.store.clear(); }
}

const mockStorage = new MockLocalStorage();

// Import des modules PaymentDataSafety et TenantPersistence
const safetyCode = readFileSync('./js/payment-data-safety.js', 'utf8');
const code = readFileSync('./js/tenant-persistence.js', 'utf8');
const scope = { localStorage: mockStorage };
new Function('window', safetyCode)(scope);
if (scope.PaymentDataSafety && !globalThis.PaymentDataSafety) globalThis.PaymentDataSafety = scope.PaymentDataSafety;
new Function('window', code)(scope);
const TenantPersistence = globalThis.TenantPersistence || scope.TenantPersistence;

console.log('--- TEST LOT 2 : PERSISTANCE ET CACHES MULTI-TENANT (SEC-05 / REL-01) ---');

const user1 = 'usr_11111111-1111-4111-8111-111111111111';
const user2 = 'usr_22222222-2222-4222-8222-222222222222';
const orgA = 'org_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const orgB = 'org_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const tp = new TenantPersistence(mockStorage, user1, orgA);

// 1. ISOLATION DES CLÉS ENTRE DEUX ENTREPRISES POUR UN MÊME UTILISATEUR
const keyA = tp.getKey('clients', user1, orgA);
const keyB = tp.getKey('clients', user1, orgB);
check(keyA !== keyB, 'Clés distinctes entre entreprise A et B');
check(keyA.includes(orgA), 'La clé porte explicitement l’ID de l’entreprise A');
check(keyB.includes(orgB), 'La clé porte explicitement l’ID de l’entreprise B');

// Sauvegarde dans entreprise A
tp.set('clients', [{ id: 'cli_1', name: 'Client A' }], user1, orgA);
check(tp.get('clients', user1, orgA).length === 1, 'Données de l’entreprise A présentes');
check(tp.get('clients', user1, orgB) === null, 'Données de l’entreprise B étanches (null)');

// Sauvegarde dans entreprise B
tp.set('clients', [{ id: 'cli_2', name: 'Client B' }], user1, orgB);
check(tp.get('clients', user1, orgB)[0].name === 'Client B', 'Données de l’entreprise B enregistrées sans conflit');
check(tp.get('clients', user1, orgA)[0].name === 'Client A', 'Données de l’entreprise A intactes');

// 2. ISOLATION DES BROUILLONS ENTRE DEUX UTILISATEURS SUR LA MÊME ENTREPRISE
const draftU1 = tp.getKey('draft_quote', user1, orgA);
const draftU2 = tp.getKey('draft_quote', user2, orgA);
check(draftU1 !== draftU2, 'Brouillons isolés entre comptes pour une même entreprise');

tp.set('draft_quote', { quoteNumber: 'DEV-U1', total: 1000 }, user1, orgA);
tp.set('draft_quote', { quoteNumber: 'DEV-U2', total: 5000 }, user2, orgA);
check(tp.get('draft_quote', user1, orgA).quoteNumber === 'DEV-U1', 'Brouillon utilisateur 1 préservé');
check(tp.get('draft_quote', user2, orgA).quoteNumber === 'DEV-U2', 'Brouillon utilisateur 2 préservé');

// 3. ISOLATION DU MODE INVITÉ (GUEST)
check(tp.getKey('materials', 'guest') === 'costcalc:guest:materials', 'Clé invité isolée');
tp.set('materials', [{ id: 1, name: 'Sable invité' }], 'guest');
check(tp.get('materials', 'guest')[0].name === 'Sable invité', 'Données invitées enregistrées');
check(tp.get('materials', user1, orgA) === null, 'Données invitées absentes du compte connecté');

// 4. OUTBOX TRANSACTIONNELLE MULTI-TENANT AVEC VÉRIFICATION DE DESTINATION
tp.setContext(user1, orgA);
const opId = tp.stageOutbox('company_settings', { companyName: 'Entreprise Alpha SARL' }, 'rev_1', user1, orgA);
check(Boolean(opId), 'Opération mise en file d’attente dans l’outbox de l’organisation A');

const outboxA = tp.getOutbox(user1, orgA);
check(outboxA['company_settings']?.organizationId === orgA, 'L’entrée d’outbox porte l’ID certifié de l’organisation A');
check(Object.keys(tp.getOutbox(user1, orgB)).length === 0, 'L’outbox de l’organisation B reste vide');

// Tentative de rejeu vers une mauvaise organisation : REFUSÉ
assert.throws(() => {
    tp.assertOutboxIntegrity(outboxA['company_settings'], orgB);
}, /Violation d’isolation/, 'Tentative de rejouer l’outbox A vers l’entreprise B formellement rejetée');

// Acquittement de l'outbox avec confirmation de l'ID d'opération
tp.acknowledgeOutbox('company_settings', opId, user1, orgA);
check(Object.keys(tp.getOutbox(user1, orgA)).length === 0, 'Outbox correctement acquittée après synchronisation confirmée');

// 5. GARDE ANTI-COURSE (RACE CONDITION GUARD LORS D'UN CHANGEMENT D'ENTREPRISE)
tp.setContext(user1, orgA);
const guardA = tp.createRequestGuard('catalog', orgA);
check(guardA.isValid() === true, 'Garde actif et valide pour orgA en cours');

// Simulation : l'utilisateur bascule sur l'entreprise B avant que la requête de A ne réponde
tp.setContext(user1, orgB);
check(guardA.isValid() === false, 'Réponse retardée de l’entreprise A invalidée : écrasement de B neutralisé');

// Nouvelle requête sur B
const guardB = tp.createRequestGuard('catalog', orgB);
check(guardB.isValid() === true, 'Nouvelle requête sur entreprise B valide');

// 6. MIGRATION CONSERVATRICE DES ANCIENNES DONNÉES LOCALES
mockStorage.setItem(`costcalc:${user1}:savedQuotes`, JSON.stringify([{ id: 'legacy_1' }]));
const legacyItems = tp.detectLegacyData();
check(legacyItems.length === 1, 'Données historiques non scopées par organisation détectées');
check(legacyItems[0].isAmbiguous === true, 'Données anciennes marquées ambiguës sans assignation aveugle');

// Quarantaine sécurisée
const qKey = tp.quarantineLegacyEntry(legacyItems[0].originalKey);
check(Boolean(qKey), 'Donnée historique déplacée en quarantaine de sécurité');
check(mockStorage.getItem(legacyItems[0].originalKey) === null, 'Ancienne clé orpheline retirée de l’espace actif');
check(mockStorage.getItem(qKey) !== null, 'Donnée conservée et exportable dans la quarantaine');

// 7. PLAN DE RÉSOLUTION DES CONFLITS
const conflictPlan = tp.buildConflictResolutionPlan(
    'materials',
    [{ id: 1, name: 'Local modifié' }, { id: 2, name: 'Local ajouté' }],
    [{ id: 1, name: 'Serveur officiel' }],
    'fp_expected_v1',
    'fp_server_current_v2'
);
check(conflictPlan.localSummary.itemCount === 2, 'Rapprochement : 2 éléments locaux en attente');
check(conflictPlan.serverSummary.itemCount === 1, 'Rapprochement : 1 élément distant constaté');
check(conflictPlan.options.length === 3, 'Options de réconciliation claires fournies à l’utilisateur');

console.log(`\n🎉 Réussite totale : ${checks} contrôles Lot 2 (Persistance, Caches et Reprise) validés avec succès !`);
