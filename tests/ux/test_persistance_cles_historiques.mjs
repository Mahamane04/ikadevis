#!/usr/bin/env node
// Audit UX 220 — UX-P0-01, après la seconde revue adversariale.
// La version défectueuse écrivait `costcalc:<org>:<org>:<clé>`. Une migration
// relisait ces clés ; elle a été retirée, car leur propriétaire ne peut pas
// être établi (démonstration et compte réel hors ligne sur `org_default`
// écrivaient la même clé) et la relecture faisait passer des données d'un
// espace à l'autre. Ce banc fixe le contrat qui reste :
//   - aucune clé historique n'est relue, ni par un compte réel ni par la démo ;
//   - elle reste intacte sur l'appareil ;
//   - une liste vidée (« [] ») n'est jamais « complétée » par une clé de repli ;
//   - un compte réel ne relit jamais une clé de démonstration ou d'une
//     organisation provisoire (`org_default`, `org_local_*`).
// Pur Node : `localStorage` simulé, données fictives.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

class StockageSimule {
    constructor() { this.m = new Map(); }
    get length() { return this.m.size; }
    key(i) { return [...this.m.keys()][i] ?? null; }
    getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
    setItem(k, v) { this.m.set(k, String(v)); }
    removeItem(k) { this.m.delete(k); }
}

function charger() {
    const racine = new URL('../../', import.meta.url);
    const portee = {};
    new Function('window', readFileSync(new URL('js/payment-data-safety.js', racine), 'utf8'))(portee);
    if (portee.PaymentDataSafety && !globalThis.PaymentDataSafety) globalThis.PaymentDataSafety = portee.PaymentDataSafety;
    new Function('window', readFileSync(new URL('js/tenant-persistence.js', racine), 'utf8'))(portee);
    return globalThis.TenantPersistence || portee.TenantPersistence;
}

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: Boolean(cond), detail: String(detail).slice(0, 300) });
    const TenantPersistence = charger();
    const clientsDemo = JSON.stringify([{ id: 'c-demo', name: 'Client saisi en démonstration' }]);
    const UID = 'usr_11111111-1111-4111-8111-111111111111';
    const ORG = 'org_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    // 1. Compte réel encore sur l'organisation provisoire `org_default`.
    {
        const st = new StockageSimule();
        st.setItem('costcalc:org_default:org_default:clients', clientsDemo);
        st.setItem('costcalc:guest:clients', clientsDemo);
        const tp = new TenantPersistence(st, UID, 'org_default');
        const lu = tp.get('clients');
        ok(`Compte réel sur org_default : ni clé historique ni clé de démo relue — ${JSON.stringify(lu)}`, lu === null);
        ok('La clé historique reste intacte sur l\'appareil', st.getItem('costcalc:org_default:org_default:clients') === clientsDemo);
    }
    // 2. Compte réel dans sa vraie organisation : la clé historique à son nom
    //    d'organisation n'est pas relue non plus.
    {
        const st = new StockageSimule();
        st.setItem(`costcalc:${ORG}:${ORG}:clients`, clientsDemo);
        const tp = new TenantPersistence(st, UID, ORG);
        ok('Compte réel dans sa vraie organisation : clé historique non relue', tp.get('clients') === null);
    }
    // 3. Démonstration : la clé historique n'est pas relue.
    {
        const st = new StockageSimule();
        st.setItem('costcalc:org_default:org_default:clients', clientsDemo);
        const tp = new TenantPersistence(st, 'guest', null);
        ok('Démonstration : clé historique non relue', tp.get('clients') === null);
    }
    // 4. Liste vidée par l'utilisateur : rien ne la « complète ».
    {
        const st = new StockageSimule();
        st.setItem(`costcalc:${UID}:${ORG}:clients`, '[]');
        st.setItem(`costcalc:${UID}:clients`, clientsDemo);
        const tp = new TenantPersistence(st, UID, ORG);
        const lu = tp.get('clients');
        ok(`Liste vidée : reste vide malgré une clé de repli remplie — ${JSON.stringify(lu)}`, Array.isArray(lu) && lu.length === 0);
    }
    // 5. Organisation locale provisoire : aucune clé `costcalc:org_local_…` relue.
    {
        const st = new StockageSimule();
        st.setItem('costcalc:org_local_123:clients', clientsDemo);
        const tp = new TenantPersistence(st, UID, 'org_local_123');
        ok('Compte réel sur org_local_* : clé d\'organisation provisoire non relue', tp.get('clients') === null);
    }
    // 6. Formats plus anciens propres à la démonstration : toujours relus pour l'invité.
    {
        const st = new StockageSimule();
        st.setItem('costcalc:guest:guest:clients', clientsDemo);
        const tp = new TenantPersistence(st, 'guest', null);
        const lu = tp.get('clients');
        ok(`Démonstration : l'ancien format invité reste relu — ${JSON.stringify(lu)}`, Array.isArray(lu) && lu[0]?.id === 'c-demo');
    }
    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    console.log(`\nClés historiques : ${results.filter((r) => r.pass).length}/${results.length} contrôles passés.`);
    process.exit(results.every((r) => r.pass) ? 0 : 1);
}
