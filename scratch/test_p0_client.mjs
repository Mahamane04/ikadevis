// Unit tests on the delivered browser modules. In-memory storage, no network.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
const context = { crypto: webcrypto, console };
vm.createContext(context);
for (const file of ['catalog-persistence','payment-data-safety','saspay-service']) {
    vm.runInContext(readFileSync(`js/${file}.js`, 'utf8'), context);
}
class Storage {
    data = new Map();
    get length() { return this.data.size; }
    key(i) { return [...this.data.keys()][i]; }
    getItem(k) { return this.data.get(k) ?? null; }
    setItem(k, v) { this.data.set(k, String(v)); }
    removeItem(k) { this.data.delete(k); }
}
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; console.log('✓', label); };
const fails = async (fn,label) => { await assert.rejects(fn); checks++; console.log('✓',label); };
const storage = new Storage();
let calls = [], failure = null, version = 'v1', gate = null;
const client = { async rpc(name,args) {
    if (name === 'catalog_snapshot_v1') return { data:{rows:[{id:1,name:'server'}],fingerprint:version} };
    calls.push(args);
    if (gate) { const g=gate; gate=null; await g; }
    if (failure) return {error:failure};
    version += 'x'; return {data:{fingerprint:version}};
} };
const p = new context.CatalogPersistence(client,storage,'alice');
assert.throws(() => p.stage('A','materials',[])); checks++;
await p.read('A','materials');
p.stage('A','materials',[{id:1,name:'local'}]);
failure = {code:'40001'};
await fails(() => p.flush('A','materials'),'Conflit propagé à l’interface');
check(p.pending('A','materials').rows[0].name === 'local','Conflit : données locales conservées');
failure = {message:'network unavailable'};
await fails(() => p.flush('A','materials'),'Erreur réseau propagée');
check(p.pending('A','materials').expected === 'v1','Erreur : version d’origine conservée');
failure = null;
await p.flush('A','materials');
check(p.pending('A','materials') === null,'Succès seul acquitte l’opération');
check(calls.at(-1).p_org_id === 'A' && calls.at(-1).p_expected === 'v1','Destination et version envoyées au serveur');
p.stage('A','materials',[{id:2}]);
let release;
gate = new Promise(r => release=r);
const priorCount = calls.length;
const first = p.flush('A','materials');
const duplicate = p.flush('A','materials');
await Promise.resolve();
p.stage('A','materials',[{id:3}]);
release(); await Promise.all([first,duplicate]);
check(calls.length === priorCount+2,'Deux flush simultanés partagent le même envoi');
check(calls.at(-1).p_rows[0].id === 3 && calls.at(-1).p_expected !== calls.at(-2).p_expected,'Nouvelle saisie reprise avec la version confirmée');
check(!p.pending('A','materials'),'Deuxième saisie acquittée après confirmation');
p.stage('A','materials',[{id:4}]);
const secondTab = new context.CatalogPersistence(client,storage,'alice');
await secondTab.read('A','materials');
secondTab.stage('A','materials',[{id:5}]);
check(p.pending('A','materials').rows[0].id===4 && secondTab.pending('A','materials').rows[0].id===5,'Deux onglets : aucune opération locale écrasée');
check(p.otherPending('A').length===1,'Autre onglet détecté pour récupération sans rejeu');
const reloaded = new context.CatalogPersistence(client,storage,'alice',p.writerId);
check(reloaded.pending('A','materials').rows[0].id===4,'Rechargement : identité d’onglet conservée');
const bob = new context.CatalogPersistence(client,storage,'bob');
check(!bob.pending('A','materials') && !p.pending('B','materials'),'Outbox isolée par compte et entreprise');
storage.setItem(p.key('B','materials'),storage.getItem(p.key('A','materials')));
const before=calls.length;
await fails(() => p.flush('B','materials'),'Opération déplacée vers une autre entreprise refusée');
check(calls.length===before,'Aucun appel serveur pour une destination incohérente');
storage.setItem(p.key('A','labor'),'{');
await fails(() => p.flush('A','labor'),'Outbox corrompue refusée sans acquittement');
check(storage.getItem(p.key('A','labor')) === '{','Outbox corrompue préservée');
const quota = new context.CatalogPersistence(client,{getItem:()=>null,setItem:()=>{throw new Error('quota');}},'alice');
await quota.read('A','materials');
assert.throws(() => quota.stage('A','materials',[])); checks++;
const uncertain = new context.CatalogPersistence({rpc:async()=>({data:{}})},storage,'alice',p.writerId);
await fails(()=>uncertain.flush('A','materials'),'Réponse sans confirmation refusée');
check(!!p.pending('A','materials'),'Réponse invalide : opération conservée');
const fake={company:{apiKey:'FAKE',enabled:true},array:[{api_key:'FAKE',amount:200}],secret_key:'FAKE'};
const cleaned=context.PaymentDataSafety.withoutPaymentSecrets(fake);
check(!JSON.stringify(cleaned).includes('FAKE') && cleaned.array[0].amount === 200 && cleaned.company.enabled,'Nettoyage récursif sans altérer les données métier');
check(fake.company.apiKey==='FAKE','Nettoyage sans mutation de l’objet d’origine');
storage.setItem('costcalc:alice:companyInfo',JSON.stringify(fake));
storage.setItem('costcalc_alice',JSON.stringify(fake));
storage.setItem('ikadevis_platform_saspay_key','FAKE');
storage.setItem('sb-test-auth-token','FAKE_SESSION');
context.PaymentDataSafety.cleanLegacyPaymentCaches(storage);
check(!storage.getItem('costcalc:alice:companyInfo').includes('FAKE') && !storage.getItem('costcalc_alice').includes('FAKE'),'Caches historiques nettoyés');
check(!storage.getItem('ikadevis_platform_saspay_key'),'Ancienne clé de plateforme supprimée');
check(storage.getItem('sb-test-auth-token')==='FAKE_SESSION','Session Supabase intacte');
check(context.SasPayService.estConfiguree({apiKey:'FAKE',enabled:true})===false,'Encaissement entreprise annoncé indisponible');
for (const action of ['createCheckoutSession','initiateSoftPay','verifyPayment']) {
    await fails(()=>context.SasPayService[action]({apiKey:'FAKE'}),`${action} refusé sans API réseau disponible`);
}
check(!(await context.SasPayService.testConnection({apiKey:'FAKE'})).ok,'Test de passerelle ne simule pas un succès');
console.log(`${checks} contrôles P0 client réussis.`);
