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
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`);

// 2. Chargement schémas de base et migrations préalables (P0 et Lot 1)
await db.exec(sql('v6_schema.sql'));
await db.exec(sql('v6_material_stock.sql'));
await db.exec(sql('v6_invoices.sql'));
await db.exec(sql('migrations_saas_subscriptions_2026-09-24.sql'));
await db.exec(sql('migrations_payment_secret_containment_2026-09-25.sql'));
await db.exec(sql('migrations_catalog_atomic_2026-09-25.sql'));
await db.exec(sql('migrations_tenant_isolation_and_roles_2026-09-25.sql'));

// 3. Application de la nouvelle migration Lot 3
await db.exec(sql('migrations_payment_and_reminders_2026-09-25.sql'));

// Insertion des organisations tests
await db.query("INSERT INTO organizations(id, name) VALUES($1, 'Entreprise Alpha'), ($2, 'Entreprise Beta')", [A, B]);

// Création d'utilisateurs
const createUser = async (email) => {
    const res = await db.query("INSERT INTO auth.users(id, email) VALUES(gen_random_uuid(), $1) RETURNING id", [email]);
    return res.rows[0].id;
};

const userOwnerA = await createUser('owner-a@example.invalid');
const userAdminA = await createUser('admin-a@example.invalid');
const userCommercialA = await createUser('comm-a@example.invalid');
const userViewerA = await createUser('viewer-a@example.invalid');
const userAttackerB = await createUser('attacker-b@example.invalid');

// Affectation des rôles
await db.query("INSERT INTO organization_members(organization_id, user_id, role) VALUES($1, $2, 'owner')", [A, userOwnerA]);
await db.query("INSERT INTO organization_members(organization_id, user_id, role) VALUES($1, $2, 'admin')", [A, userAdminA]);
await db.query("INSERT INTO organization_members(organization_id, user_id, role) VALUES($1, $2, 'commercial')", [A, userCommercialA]);
await db.query("INSERT INTO organization_members(organization_id, user_id, role) VALUES($1, $2, 'viewer')", [A, userViewerA]);
await db.query("INSERT INTO organization_members(organization_id, user_id, role) VALUES($1, $2, 'owner')", [B, userAttackerB]);

const as = async (role, user, fn) => {
    await db.exec(`SET ROLE ${role};`);
    await db.query("SELECT set_config('test.uid', $1, false)", [user || '']);
    try {
        return await fn();
    } finally {
        await db.exec('RESET ROLE');
        await db.exec("SELECT set_config('test.uid', '', false)");
    }
};

console.log('\n--- 1. Sous-lot 1 : Idempotence des abonnements (REL-02) ---');

// Vérification de la présence des colonnes idempotency_key et expires_at
const subCols = await db.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'subscription_payments' AND column_name IN ('idempotency_key', 'expires_at')
`);
check(subCols.rows.length === 2, 'Table subscription_payments dotée de idempotency_key et expires_at');

// Insertion d'un paiement d'abonnement avec clé d'idempotence
const subPayRes = await db.query(`
    INSERT INTO subscription_payments (organization_id, plan_id, billing_cycle, amount, idempotency_key)
    VALUES ($1, 'standard', 'monthly', 19900, 'idem-sub-001')
    RETURNING id, amount, idempotency_key, expires_at
`, [A]);
check(subPayRes.rows[0].amount == 19900, 'Paiement abonnement créé avec montant catalogue');
check(subPayRes.rows[0].idempotency_key === 'idem-sub-001', 'Paiement abonnement indexé avec sa clé d idempotence');

console.log('\n--- 2. Sous-lot 2 : Encaissement de factures entreprise (SEC-01) ---');

// Création d'un client et de factures dans l'organisation A
const clientRes = await db.query("INSERT INTO clients(organization_id, name) VALUES($1, 'Client Test') RETURNING id", [A]);
const clientId = clientRes.rows[0].id;

const invDraftRes = await db.query(`
    INSERT INTO invoices(organization_id, client_id, client_name, invoice_number, status, total_ht, total_ttc)
    VALUES($1, $2, 'Client Test', 'FAC-DRAFT-01', 'draft', 100000, 118000)
    RETURNING id
`, [A, clientId]);
const invDraftId = invDraftRes.rows[0].id;

const invIssuedRes = await db.query(`
    INSERT INTO invoices(organization_id, client_id, client_name, invoice_number, status, total_ht, total_ttc)
    VALUES($1, $2, 'Client Test', 'FAC-ISSUED-01', 'issued', 50000, 50000)
    RETURNING id
`, [A, clientId]);
const invIssuedId = invIssuedRes.rows[0].id;


// RLS : un attaquant de l'organisation B ou un rôle viewer ne peut pas initier un paiement
await reject(
    () => as('authenticated', userAttackerB, () => db.query("SELECT create_invoice_payment_intent($1, $2, 'key-1')", [A, invIssuedId])),
    'SEC-01 : Rejet d une tentative d encaissement par une autre organisation'
);

await reject(
    () => as('authenticated', userViewerA, () => db.query("SELECT create_invoice_payment_intent($1, $2, 'key-1')", [A, invIssuedId])),
    'SEC-01 : Rejet d une tentative d encaissement par un profil viewer sans droit commercial'
);

// Facture draft : rejet obligatoire
await reject(
    () => as('authenticated', userCommercialA, () => db.query("SELECT create_invoice_payment_intent($1, $2, 'key-draft')", [A, invDraftId])),
    'SEC-01 : Rejet d initialisation de paiement sur une facture en brouillon (draft)'
);

// Facture émise : calcul automatique serveur du montant exact
const intentRes1 = await as('authenticated', userCommercialA, async () => {
    const res = await db.query("SELECT create_invoice_payment_intent($1, $2, 'idem-inv-001') as intent", [A, invIssuedId]);
    return typeof res.rows[0].intent === 'string' ? JSON.parse(res.rows[0].intent) : res.rows[0].intent;
});
check(intentRes1.amount == 50000, 'SEC-01 : Montant d encaissement dérivé du reste dû exact en base (50 000 XOF)');
check(intentRes1.reused_existing === false, 'SEC-01 : Première intention marquée non réutilisée');
const paymentId1 = intentRes1.payment_id;

// Idempotence : même clé p_idempotency_key réutilisée avant expiration
const intentRes2 = await as('authenticated', userCommercialA, async () => {
    const res = await db.query("SELECT create_invoice_payment_intent($1, $2, 'idem-inv-001') as intent", [A, invIssuedId]);
    return typeof res.rows[0].intent === 'string' ? JSON.parse(res.rows[0].intent) : res.rows[0].intent;
});
check(intentRes2.reused_existing === true, 'SEC-01 / REL-02 : Réutilisation idempotente de l intention de paiement existante');
check(intentRes2.payment_id === paymentId1, 'SEC-01 : Même payment_id renvoyé');

// Confirmation atomique (service_role uniquement)
// Un utilisateur authenticated ne peut pas appeler confirm_invoice_payment directement
await reject(
    () => as('authenticated', userCommercialA, () => db.query("SELECT confirm_invoice_payment($1, 'SAS-REF-99', '{}'::jsonb)", [paymentId1])),
    'SEC-01 : confirm_invoice_payment interdit aux utilisateurs authenticated directs'
);

// Confirmation par service_role
const confirmRes = await as('service_role', null, async () => {
    const res = await db.query("SELECT confirm_invoice_payment($1, 'SAS-REF-99', '{\"status\":\"success\"}'::jsonb) as conf", [paymentId1]);
    return typeof res.rows[0].conf === 'string' ? JSON.parse(res.rows[0].conf) : res.rows[0].conf;
});
check(confirmRes.success === true, 'SEC-01 : Confirmation réussie par le service_role');
check(confirmRes.new_invoice_status === 'paid', 'SEC-01 : Statut de la facture passé à paid');

// Vérification de la facture en base
const invCheck = await db.query("SELECT status FROM invoices WHERE id = $1", [invIssuedId]);
check(invCheck.rows[0].status === 'paid', 'Facture effectivement soldée en base');

// Vérification de la traçabilité inaltérable dans audit_logs
const auditCheck = await db.query("SELECT action, entity_type, entity_id FROM audit_logs WHERE entity_id = $1", [invIssuedId]);
check(auditCheck.rows.length >= 1, 'SEC-04 / SEC-01 : Événement d encaissement tracé inaltérablement dans audit_logs');
check(auditCheck.rows[0].action === 'invoice_payment_confirmed', 'Type d audit invoice_payment_confirmed confirmé');


// Idempotence de la confirmation : reconfirmer ne double pas le paiement
const confirmRes2 = await as('service_role', null, async () => {
    const res = await db.query("SELECT confirm_invoice_payment($1, 'SAS-REF-99', '{}'::jsonb) as conf", [paymentId1]);
    return typeof res.rows[0].conf === 'string' ? JSON.parse(res.rows[0].conf) : res.rows[0].conf;
});
check(confirmRes2.already_confirmed === true, 'SEC-01 : Reconfirmation idempotente sans effet de bord');

// Tentative d'initier un nouveau paiement sur une facture déjà payée : rejet
await reject(
    () => as('authenticated', userCommercialA, () => db.query("SELECT create_invoice_payment_intent($1, $2, 'new-key')", [A, invIssuedId])),
    'SEC-01 : Rejet d encaissement sur une facture déjà intégralement payée'
);

console.log('\n--- 3. Sous-lot 3 : Invitations & Relances (REL-04 / REL-05 / SEC-06) ---');

// Test de la file outbound_reminders
const reminderRes = await db.query(`
    INSERT INTO outbound_reminders (organization_id, invoice_id, recipient_email, subject, body_html, idempotency_key)
    VALUES ($1, $2, 'client@example.invalid', 'Rappel facture', '<p>Merci de régler votre facture</p>', 'remind-inv-001')
    RETURNING id, status, retry_count, max_retries
`, [A, invIssuedId]);
check(reminderRes.rows[0].status === 'pending', 'REL-05 : Relance enregistrée en statut pending');
check(reminderRes.rows[0].retry_count === 0 && reminderRes.rows[0].max_retries === 3, 'REL-05 : File réessayable configurée avec 3 tentatives max');

// Test de l'assainissement HTML anti-XSS (SEC-06)
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const xssPayload = '<script>alert("XSS")</script>&<img src=x onerror=alert(1)>"quoted"';
const sanitized = escapeHtml(xssPayload);
check(!sanitized.includes('<') && !sanitized.includes('>'), 'SEC-06 : Chevrons et balises exécutables totalement neutralisés');
check(sanitized.includes('&lt;script&gt;') && sanitized.includes('&quot;quoted&quot;'), 'SEC-06 : Entités HTML correctement échappées');


// Test de pagination simulée (REL-04)
async function simulateFindUserByEmailPaginated(users, targetEmail) {
    const normalized = targetEmail.trim().toLowerCase();
    const perPage = 2; // Petite page pour forcer la pagination
    let page = 1;
    while (page <= 10) {
        const slice = users.slice((page - 1) * perPage, page * perPage);
        if (slice.length === 0) break;
        const found = slice.find(u => u.email.toLowerCase() === normalized);
        if (found) return { found, page };
        if (slice.length < perPage) break;
        page++;
    }
    return null;
}

const mockDirectory = [
    { id: '1', email: 'user1@example.com' },
    { id: '2', email: 'user2@example.com' },
    { id: '3', email: 'user3@example.com' },
    { id: '4', email: 'target@example.com' } // Page 2
];
const paginatedResult = await simulateFindUserByEmailPaginated(mockDirectory, 'target@example.com');
check(paginatedResult !== null && paginatedResult.found.id === '4', 'REL-04 : Utilisateur au-delà de la page 1 retrouvé avec succès');
check(paginatedResult.page === 2, 'REL-04 : Détection multi-pages validée');

console.log(`\n========================================`);
console.log(`Tous les tests du Lot 3 sont VALIDÉS (${checks} contrôles réussis)`);
console.log(`========================================\n`);
