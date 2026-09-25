import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

process.on('uncaughtException', e => { console.error(e.message); process.exit(1); });

const db = new PGlite();
let checks = 0;

const check = (value, label) => {
    assert.ok(value, label);
    checks++;
    console.log('✓', label);
};

const reject = async (fn, label) => {
    await assert.rejects(fn);
    checks++;
    console.log('✓', label);
};

const sql = f => readFileSync(f, 'utf8').replace(/^\s*CREATE EXTENSION[^;]*;/gim, '');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

// 1. Initialisation environnement simulé Supabase
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
`);

// 2. Chargement schémas de référence et migrations préalables (P0)
await db.exec(sql('v6_schema.sql'));
await db.exec(sql('v6_material_stock.sql'));
await db.exec(sql('v6_invoices.sql'));
await db.exec(sql('migrations_payment_secret_containment_2026-09-25.sql'));
await db.exec(sql('migrations_catalog_atomic_2026-09-25.sql'));

// 3. Application de la nouvelle migration Lot 1
await db.exec(sql('migrations_tenant_isolation_and_roles_2026-09-25.sql'));

// Insertion des organisations tests
await db.query("INSERT INTO organizations(id, name) VALUES($1, 'Entreprise Alpha'), ($2, 'Entreprise Beta')", [A, B]);

// Création d'utilisateurs fictifs
const createUser = async (email) => {
    const res = await db.query("INSERT INTO auth.users(id, email) VALUES(gen_random_uuid(), $1) RETURNING id", [email]);
    return res.rows[0].id;
};

const userOwnerA = await createUser('owner-a@example.invalid');
const userAdminA = await createUser('admin-a@example.invalid');
const userViewerA = await createUser('viewer-a@example.invalid');
const userOwnerB = await createUser('owner-b@example.invalid');
const userAdminB = await createUser('admin-b@example.invalid');

const as = async (role, user, fn) => {
    await db.exec(`SET ROLE ${role};`);
    await db.query("SELECT set_config('test.uid', $1, false)", [user || '']);
    try {
        return await fn();
    } finally {
        await db.exec('RESET ROLE');
    }
};

console.log('--- TEST LOT 1 : SEC-02 (Rôles et Propriétaire) ---');

// 1. Bootstrap premier propriétaire : autorisé
await as('authenticated', userOwnerA, async () => {
    await db.query("INSERT INTO organization_members(organization_id, user_id, role) VALUES($1, $2, 'owner')", [A, userOwnerA]);
    check(true, 'Bootstrap : premier propriétaire autorisé pour Org A');
});

await as('authenticated', userOwnerB, async () => {
    await db.query("INSERT INTO organization_members(organization_id, user_id, role) VALUES($1, $2, 'owner')", [B, userOwnerB]);
    check(true, 'Bootstrap : premier propriétaire autorisé pour Org B');
});

// 2. Ajout de membres non-owner par le owner : autorisé
await as('authenticated', userOwnerA, async () => {
    await db.query("INSERT INTO organization_members(organization_id, user_id, role) VALUES($1, $2, 'admin')", [A, userAdminA]);
    await db.query("INSERT INTO organization_members(organization_id, user_id, role) VALUES($1, $2, 'viewer')", [A, userViewerA]);
    check(true, 'Owner A peut inviter des membres admin et viewer');
});

await as('authenticated', userOwnerB, async () => {
    await db.query("INSERT INTO organization_members(organization_id, user_id, role) VALUES($1, $2, 'admin')", [B, userAdminB]);
    check(true, 'Owner B peut inviter admin B');
});

// 3. Tentative par un Admin de créer directement un autre 'owner' : REFUSÉ
const extraUser = await createUser('impostor@example.invalid');
await as('authenticated', userAdminA, async () => {
    await reject(
        () => db.query("INSERT INTO organization_members(organization_id, user_id, role) VALUES($1, $2, 'owner')", [A, extraUser]),
        'Admin A : interdiction de créer directement un propriétaire supplémentaire'
    );
});

// 4. Tentative par un Admin d'élever son propre rôle à 'owner' : REFUSÉ
await as('authenticated', userAdminA, async () => {
    await reject(
        () => db.query("UPDATE organization_members SET role='owner' WHERE organization_id=$1 AND user_id=$2", [A, userAdminA]),
        'Admin A : interdiction d’élévation directe au rôle owner via UPDATE'
    );
});

// 5. Tentative de modifier l’identité (organization_id ou user_id) : REFUSÉ
await as('authenticated', userAdminA, async () => {
    await reject(
        () => db.query("UPDATE organization_members SET organization_id=$1 WHERE organization_id=$2 AND user_id=$3", [B, A, userAdminA]),
        'Immuabilité : interdiction de changer organization_id d’un membre'
    );
});

// 6. Tentative de supprimer le propriétaire de l'organisation : REFUSÉ
await as('authenticated', userAdminA, async () => {
    await reject(
        () => db.query("DELETE FROM organization_members WHERE organization_id=$1 AND user_id=$2", [A, userOwnerA]),
        'Admin A : interdiction de supprimer le propriétaire'
    );
});

// 7. Tentative d'un admin de supprimer un autre admin : REFUSÉ
const admin2 = await createUser('admin2@example.invalid');
await as('authenticated', userOwnerA, async () => {
    await db.query("INSERT INTO organization_members(organization_id, user_id, role) VALUES($1, $2, 'admin')", [A, admin2]);
});
await as('authenticated', userAdminA, async () => {
    await reject(
        () => db.query("DELETE FROM organization_members WHERE organization_id=$1 AND user_id=$2", [A, admin2]),
        'Admin A : interdiction de supprimer un autre administrateur'
    );
});

// 8. Procédure de transfert de propriété sécurisée (transfer_organization_ownership)
await as('authenticated', userAdminA, async () => {
    await reject(
        () => db.query("SELECT transfer_organization_ownership($1, $2)", [A, userAdminA]),
        'Admin A : interdiction d’appeler le transfert de propriété sans être propriétaire'
    );
});

await as('authenticated', userOwnerA, async () => {
    const res = await db.query("SELECT transfer_organization_ownership($1, $2) AS outcome", [A, userAdminA]);
    const outcome = res.rows[0].outcome;
    check(outcome.success === true, 'Owner A : transfert de propriété réussi vers userAdminA');

    // Vérifier les rôles après transfert
    const newOwnerRole = (await db.query("SELECT role FROM organization_members WHERE organization_id=$1 AND user_id=$2", [A, userAdminA])).rows[0].role;
    const oldOwnerRole = (await db.query("SELECT role FROM organization_members WHERE organization_id=$1 AND user_id=$2", [A, userOwnerA])).rows[0].role;
    check(newOwnerRole === 'owner', 'L’ancien admin est devenu propriétaire légitime');
    check(oldOwnerRole === 'admin', 'L’ancien propriétaire a été rétrogradé en administrateur');
});

console.log('--- TEST LOT 1 : SEC-03 (Relations interentreprises A -> B) ---');

// Création de clients dans A et B
const clientA_id = (await db.query("INSERT INTO clients(organization_id, name) VALUES($1, 'Client Alpha') RETURNING id", [A])).rows[0].id;
const clientB_id = (await db.query("INSERT INTO clients(organization_id, name) VALUES($1, 'Client Beta') RETURNING id", [B])).rows[0].id;

// 1. Projet A associé à un client B : REFUSÉ
await reject(
    () => db.query("INSERT INTO projects(organization_id, code, name, client_id) VALUES($1, 'PRJ-ERR', 'Projet Alpha A', $2)", [A, clientB_id]),
    'Projet A rattaché au client B refusé (isolation multi-tenant)'
);

// Projet A associé au client A : AUTORISÉ
const projectA_id = (await db.query("INSERT INTO projects(organization_id, code, name, client_id) VALUES($1, 'PRJ-A1', 'Projet Alpha Valide', $2) RETURNING id", [A, clientA_id])).rows[0].id;
check(Boolean(projectA_id), 'Projet A rattaché au client A autorisé');

const projectB_id = (await db.query("INSERT INTO projects(organization_id, code, name, client_id) VALUES($1, 'PRJ-B1', 'Projet Beta Valide', $2) RETURNING id", [B, clientB_id])).rows[0].id;

// 2. Devis A associé à un client B ou projet B : REFUSÉ
await reject(
    () => db.query("INSERT INTO quotes(organization_id, quote_number, client_name, client_id) VALUES($1, 'DEV-A1', 'Fictif', $2)", [A, clientB_id]),
    'Devis A rattaché à un client B refusé'
);

await reject(
    () => db.query("INSERT INTO quotes(organization_id, quote_number, client_name, project_id) VALUES($1, 'DEV-A2', 'Fictif', $2)", [A, projectB_id]),
    'Devis A rattaché à un projet B refusé'
);

const quoteA_id = (await db.query(
    "INSERT INTO quotes(organization_id, quote_number, client_name, client_id, project_id) VALUES($1, 'DEV-A3', 'Client Alpha', $2, $3) RETURNING id",
    [A, clientA_id, projectA_id]
)).rows[0].id;
check(Boolean(quoteA_id), 'Devis A rattaché aux client A et projet A autorisé');

const quoteB_id = (await db.query(
    "INSERT INTO quotes(organization_id, quote_number, client_name, client_id, project_id) VALUES($1, 'DEV-B1', 'Client Beta', $2, $3) RETURNING id",
    [B, clientB_id, projectB_id]
)).rows[0].id;
check(Boolean(quoteB_id), 'Devis B rattaché aux client B et projet B autorisé');

// 3. Ligne de devis A associée à un devis B : REFUSÉ
await reject(
    () => db.query("INSERT INTO quote_lines(organization_id, quote_id, designation) VALUES($1, $2, 'Ligne pirate')", [A, quoteB_id]),
    'Ligne de devis A rattachée au devis B refusée'
);

// Ligne de devis A associée à devis A : AUTORISÉ
const lineA_id = (await db.query("INSERT INTO quote_lines(organization_id, quote_id, designation) VALUES($1, $2, 'Ligne conforme') RETURNING id", [A, quoteA_id])).rows[0].id;
check(Boolean(lineA_id), 'Ligne de devis A rattachée au devis A autorisée');

// 4. Facture A associée à devis B / client B / projet B : REFUSÉ
await reject(
    () => db.query("INSERT INTO invoices(organization_id, client_name, status, quote_id) VALUES($1, 'Fictif', 'draft', $2)", [A, quoteB_id]),
    'Facture A rattachée au devis B refusée'
);

await reject(
    () => db.query("INSERT INTO invoices(organization_id, client_name, status, client_id) VALUES($1, 'Fictif', 'draft', $2)", [A, clientB_id]),
    'Facture A rattachée au client B refusée'
);

await reject(
    () => db.query("INSERT INTO invoices(organization_id, client_name, status, project_id) VALUES($1, 'Fictif', 'draft', $2)", [A, projectB_id]),
    'Facture A rattachée au projet B refusée'
);

// Facture A associée à devis A / client A / projet A : AUTORISÉ
const invoiceA_id = (await db.query(
    "INSERT INTO invoices(organization_id, client_name, status, quote_id, client_id, project_id) VALUES($1, 'Client Alpha', 'draft', $2, $3, $4) RETURNING id",
    [A, quoteA_id, clientA_id, projectA_id]
)).rows[0].id;
check(Boolean(invoiceA_id), 'Facture A rattachée aux devis A, client A et projet A autorisée');

const invoiceB_id = (await db.query(
    "INSERT INTO invoices(organization_id, client_name, status, quote_id, client_id, project_id) VALUES($1, 'Client Beta', 'draft', $2, $3, $4) RETURNING id",
    [B, quoteB_id, clientB_id, projectB_id]
)).rows[0].id;

// Ligne de facture A associée à facture B : REFUSÉ
await reject(
    () => db.query("INSERT INTO invoice_lines(organization_id, invoice_id, designation, quantity, unit_price_ht) VALUES($1, $2, 'Ligne pirate', 1, 100)", [A, invoiceB_id]),
    'Ligne de facture A rattachée à la facture B refusée'
);

// Ligne de facture A associée à facture A : AUTORISÉ
await db.query("INSERT INTO invoice_lines(organization_id, invoice_id, designation, quantity, unit_price_ht) VALUES($1, $2, 'Ligne valide', 1, 100)", [A, invoiceA_id]);
check(true, 'Ligne de facture A rattachée à la facture A autorisée');

console.log('--- TEST LOT 1 : SEC-04 (Protection log_audit_event) ---');

// 1. Appel anonyme à log_audit_event : REFUSÉ
await as('anon', null, async () => {
    await reject(
        () => db.query("SELECT log_audit_event($1, 'fake_action', 'project', '123')", [A]),
        'Anonyme : appel à log_audit_event formellement refusé'
    );
});

// 2. Appel authentifié d’un membre de B pour créer un événement dans A : REFUSÉ (usurpation interentreprises)
await as('authenticated', userOwnerB, async () => {
    await reject(
        () => db.query("SELECT log_audit_event($1, 'forged_action', 'invoice', '999')", [A]),
        'Membre B : usurpation d’événement pour l’organisation A formellement refusée'
    );
});

// 3. Appel authentifié légitime d’un membre de A pour l'organisation A : AUTORISÉ
await as('authenticated', userAdminA, async () => {
    const res = await db.query(
        "SELECT log_audit_event($1, 'legit_action', 'quote', $2, $3) AS log_id",
        [A, quoteA_id, JSON.stringify({ detail: 'modification autorisée' })]
    );
    const logId = res.rows[0].log_id;
    check(Boolean(logId), 'Membre A : journalisation légitime acceptée');

    // Vérification de l'intégrité des informations dans audit_logs
    const logRow = (await db.query("SELECT * FROM audit_logs WHERE id = $1", [logId])).rows[0];
    check(logRow.organization_id === A, 'Journal : organization_id vérifié');
    check(logRow.user_id === userAdminA, 'Journal : user_id dérivé du contexte d’authentification');
    check(logRow.user_email === 'admin-a@example.invalid', 'Journal : user_email extrait avec intégrité');
    check(logRow.action === 'legit_action', 'Journal : action conforme');
});

await db.close();
console.log(`\n🎉 Réussite totale : ${checks} contrôles Lot 1 (SEC-02, SEC-03, SEC-04) validés avec succès sur PGlite !`);
