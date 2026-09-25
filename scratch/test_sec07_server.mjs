import http from 'node:http';
import assert from 'node:assert/strict';
import { server, HOST, PORT } from '../scripts/dev-server.mjs';

let checks = 0;
const check = (val, msg) => { assert.ok(val, msg); checks++; console.log('✓', msg); };

await new Promise(resolve => server.listen(8199, '127.0.0.1', resolve));

const fetchPath = (p) => new Promise((resolve) => {
    http.get(`http://127.0.0.1:8199${p}`, (res) => {
        resolve(res.statusCode);
    }).on('error', (err) => {
        resolve(500);
    });
});

console.log('--- TEST SEC-07 : Serveur de développement sécurisé ---');

// 1. Accès à index.html : 200 OK
check((await fetchPath('/index.html')) === 200, 'index.html servi avec succès (200)');

// 2. Accès aux dotfiles (.env, .gitignore, .git) : 403 Forbidden
check((await fetchPath('/.env')) === 403, '.env strictement bloqué (403)');
check((await fetchPath('/.env.local')) === 403, '.env.local strictement bloqué (403)');
check((await fetchPath('/.git/config')) === 403, '.git/config strictement bloqué (403)');
check((await fetchPath('/.gitignore')) === 403, '.gitignore bloqué (403)');

// 3. Accès aux fichiers SQL sensibles : 403 Forbidden
check((await fetchPath('/v6_schema.sql')) === 403, 'v6_schema.sql bloqué (403)');
check((await fetchPath('/migrations_tenant_isolation_and_roles_2026-09-25.sql')) === 403, 'Fichier de migration SQL bloqué (403)');

// 4. Dossier interne Supabase : 403 Forbidden
check((await fetchPath('/supabase/functions/saspay-proxy/index.ts')) === 403, 'Code source Edge Supabase bloqué (403)');

// 5. Tentative de Directory Traversal : 403 Forbidden ou 404
check([403, 404].includes(await fetchPath('/../../etc/passwd')), 'Path traversal neutralisé');

await new Promise(resolve => server.close(resolve));
console.log(`\n🎉 Réussite : ${checks} contrôles SEC-07 validés avec succès !`);
