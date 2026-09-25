import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
process.on('uncaughtException', e => { console.error(e.message); process.exit(1); });
const db = new PGlite();
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; console.log('✓', label); };
const reject = async (fn, label) => { await assert.rejects(fn); checks++; console.log('✓', label); };
const sql = f => readFileSync(f, 'utf8').replace(/^\s*CREATE EXTENSION[^;]*;/gim, '');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;`);
await db.exec(sql('v6_schema.sql'));
await db.exec(sql('v6_material_stock.sql'));
await db.exec(sql('v6_invoices.sql'));
await db.query('INSERT INTO organizations(id,name) VALUES($1,\'Audit A\'),($2,\'Audit B\')', [A, B]);
const users = [];
for (const role of ['owner','viewer']) {
    const u = (await db.query("INSERT INTO auth.users VALUES(gen_random_uuid(),'fiction@example.invalid') RETURNING id")).rows[0].id;
    users.push(u);
    await db.query('INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)', [A,u,role]);
}
await db.query("INSERT INTO company_settings(organization_id,commercial_settings) VALUES($1,$2)", [A,{ saspay: { apiKey: 'FAKE_AUDIT_KEY', enabled: true }, kept: 'conservé' }]);
await db.query("INSERT INTO quotes(organization_id,quote_number,client_name,company_snapshot) VALUES($1,'AUDIT-1','Fictif',$2)", [A,{ nested:[{ apiKey:'FAKE_AUDIT_KEY', name:'Fictif' }] }]);
await db.query("INSERT INTO materials(organization_id,id,name) VALUES($1,1,'Original'),($2,1,'Other')", [A,B]);
await db.query("INSERT INTO invoices(organization_id,client_name,status,invoice_number,total_ttc,company_snapshot) VALUES($1,'Fictif','issued','AUDIT-FACT-1',118,$2)", [A,{saspay:{apiKey:'FAKE_AUDIT_KEY'},name:'Entreprise fictive'}]);
await db.exec(sql('migrations_payment_secret_containment_2026-09-25.sql'));
await db.exec(sql('migrations_payment_secret_containment_2026-09-25.sql'));
check(!JSON.stringify((await db.query('SELECT company_snapshot FROM invoices')).rows).includes('FAKE_AUDIT_KEY'), 'Facture émise : snapshot nettoyé');
check(Number((await db.query('SELECT total_ttc FROM invoices')).rows[0].total_ttc) === 118, 'Facture émise : montant inchangé');
await reject(() => db.query('UPDATE invoices SET total_ttc=999'), 'Trigger financier toujours actif après nettoyage');
check((await db.query('SELECT count(*)::int AS n FROM payment_private.legacy_keys')).rows[0].n === 1, 'Quarantaine privée dédupliquée et migration rejouable');
check((await db.query('SELECT commercial_settings FROM company_settings')).rows[0].commercial_settings.kept === 'conservé', 'Paramètres métier préservés');
check(!JSON.stringify((await db.query('SELECT company_snapshot FROM quotes')).rows).includes('FAKE_AUDIT_KEY'), 'Snapshot imbriqué nettoyé');
await db.exec(sql('migrations_catalog_atomic_2026-09-25.sql'));
await db.exec(sql('migrations_catalog_atomic_2026-09-25.sql'));
const as = async (role, user, fn) => {
    await db.exec(`SET ROLE ${role};`);
    await db.query("SELECT set_config('test.uid',$1,false)", [user || '']);
    try { return await fn(); } finally { await db.exec('RESET ROLE'); }
};
const snapshot = async (org=A, table='materials') => (await db.query('SELECT catalog_snapshot_v1($1,$2) AS s', [org,table])).rows[0].s;
const save = async (expected, rows, org=A, table='materials') => (await db.query('SELECT replace_catalog_v1($1,$2,$3,$4) AS s', [org,table,expected,JSON.stringify(rows)])).rows[0].s;
await as('anon', null, async () => {
    await reject(() => snapshot(), 'Anonyme : lecture RPC refusée');
    await reject(() => save('x', []), 'Anonyme : écriture RPC refusée');
    await reject(() => db.query('SELECT * FROM payment_private.legacy_keys'), 'Anonyme : quarantaine inaccessible');
});
await as('authenticated', users[1], async () => {
    check((await snapshot()).rows.length === 1, 'Lecteur : catalogue autorisé');
    await reject(() => snapshot(B), 'Lecteur A : catalogue B refusé');
    await reject(async () => save((await snapshot()).fingerprint, []), 'Lecteur : mutation refusée');
    await reject(() => db.query('SELECT * FROM payment_private.legacy_keys'), 'Lecteur : secret inaccessible');
    check(!JSON.stringify((await db.query('SELECT commercial_settings FROM company_settings')).rows).includes('FAKE_AUDIT_KEY'), 'Lecteur : paramètres publics sans secret');
});
await as('authenticated', users[0], async () => {
    await reject(() => db.query('DELETE FROM materials WHERE organization_id=$1', [A]), 'Ancien client : DELETE direct refusé');
    await reject(() => db.query("UPDATE company_settings SET commercial_settings=$1 WHERE organization_id=$2", [{ saspay:{ apiKey:'FAKE_NEW_KEY' } },A]), 'Réintroduction d’un secret refusée côté base');
    const before = await snapshot();
    const after = await save(before.fingerprint, [{ id:1, name:'Modifié' },{ id:2, name:'Ajouté' }]);
    check(after.rows.length === 2 && after.rows[0].name === 'Modifié', 'Remplacement autorisé, nouveaux éléments persistés');
    check(after.rows[0].created_at === before.rows[0].created_at, 'Date de création conservée');
    await reject(() => save(before.fingerprint, [{ id:1,name:'Écrasement' }]), 'Éditeur concurrent périmé refusé');
    await reject(() => save(after.fingerprint, [{ id:1,name:null }]), 'Violation NOT NULL : transaction annulée');
    check((await snapshot()).fingerprint === after.fingerprint, 'Catalogue intégral inchangé après insertion invalide');
    await reject(() => save(after.fingerprint, [{ id:1,name:'Cross',organization_id:B }]), 'Entreprise imposée par client refusée');
    await reject(() => save(after.fingerprint, [{ id:1,name:'X',created_at:'2000-01-01' }]), 'Champ système imposé refusé');
    await reject(() => save(after.fingerprint, [{ id:1,name:'X' }], A, 'company_settings'), 'Table arbitraire refusée');
    await reject(() => save(after.fingerprint, [{ id:1,name:'X' }], B), 'Écriture interentreprise refusée');
    await reject(() => save(after.fingerprint, [{ id:1,name:'X' }, { id:1,name:'Y' }]), 'Doublons : transaction refusée');
});
// Failure in the deletion phase must roll back an earlier successful upsert.
await db.exec("CREATE FUNCTION test_catalog_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated deletion outage'; END $$; CREATE TRIGGER test_catalog_failure BEFORE DELETE ON materials FOR EACH ROW EXECUTE FUNCTION test_catalog_failure();");
await as('authenticated', users[0], async () => {
    const before = await snapshot();
    await reject(() => save(before.fingerprint, [{id:1,name:'Never committed'}]), 'Panne après upsert simulée');
    check((await snapshot()).fingerprint === before.fingerprint, 'Rollback inclut aussi la mise à jour précédente');
});
await db.exec('DROP TRIGGER test_catalog_failure ON materials');
await as('authenticated', users[0], async () => {
    const before = await snapshot();
    check((await save(before.fingerprint, [])).rows.length === 0, 'Suppression complète explicite autorisée et atomique');
    for (const [table,row] of [['labor',{id:1,name:'Fictif'}],['solutions',{id:1,name:'Fictif'}],['recipes',{id:1,solution_id:1,type:'material',ref_id:1,label:'Fictif'}]]) {
        const current=await snapshot(A,table);
        check((await save(current.fingerprint,[row],A,table)).rows.length === 1, `Transaction ${table} opérationnelle`);
    }
});
await db.query('DELETE FROM organization_members WHERE user_id=$1',[users[0]]);
await as('authenticated', users[0], async () => {
    await reject(() => snapshot(), 'Accès révoqué : lecture RPC refusée');
    await reject(() => save('unused',[]), 'Accès révoqué : écriture RPC refusée');
});
await db.close();
console.log(`${checks} contrôles P0 SQL réussis, base fictive en mémoire.`);
