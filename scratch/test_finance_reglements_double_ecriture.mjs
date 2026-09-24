// Temps T3 du socle Finances : la double écriture des règlements.
//
// Exécute le VRAI InvoiceService, tel que compilé dans app.compiled.js et
// chargé par le navigateur, contre un faux client Supabase qui enregistre
// chaque appel. Aucune base réelle n'est touchée.
//
// Ce qu'il prouve :
//   - la source de vérité (notes + amount_paid) est écrite AVANT le miroir ;
//   - le miroir porte la même clé que le marqueur (legacy_payment_key), ce qui
//     rend la reprise serveur idempotente ;
//   - un miroir en échec ne bloque JAMAIS l'enregistrement du règlement ;
//   - si la source de vérité échoue, aucun miroir n'est tenté ;
//   - une imputation ratée ne laisse pas un règlement orphelin ;
//   - les centimes d'un règlement en euros sont conservés, le FCFA inchangé ;
//   - le mode local (invité) ne tente aucun appel réseau.

import { pathToFileURL } from 'node:url';
import { launchApp } from './lib/harness.mjs';

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        const disponible = await page.evaluate(() => typeof InvoiceService === 'object' && typeof arrondiDevise === 'function');
        ok('InvoiceService et le noyau financier sont chargés par la page', disponible);
        if (!disponible) return results;

        const r = await page.evaluate(async () => {
            // Faux client Supabase : chaque appel est journalisé ; `pannes`
            // permet de faire échouer une table donnée.
            const fauxClient = (pannes = {}) => {
                const journal = [];
                const requete = (table) => {
                    const etat = { table, op: null, charge: null, filtres: [] };
                    const fin = () => {
                        journal.push(etat);
                        const err = pannes[`${table}.${etat.op}`];
                        const data = etat.op === 'insert' ? { id: `srv-${table}-${journal.length}` } : null;
                        return Promise.resolve({ data: err ? null : data, error: err ? { message: err } : null });
                    };
                    const api = {
                        insert: (c) => { etat.op = 'insert'; etat.charge = c; return api; },
                        update: (c) => { etat.op = 'update'; etat.charge = c; return api; },
                        delete: () => { etat.op = 'delete'; return api; },
                        select: () => api,
                        eq: (k, v) => { etat.filtres.push([k, v]); return api; },
                        single: () => fin(),
                        then: (ok, ko) => fin().then(ok, ko)
                    };
                    return api;
                };
                return { from: requete, journal };
            };
            const utilisateur = { id: '11111111-1111-1111-1111-111111111111' };
            const org = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
            const factureCloud = (devise, net) => ({
                id: 'inv_1', serverId: '99999999-9999-9999-9999-999999999999', statut: 'issued',
                netAPayerTTC: net, totalTTC: net, payments: [], notes: 'Merci.',
                clientId: 'cli-123-local', projectId: null,
                companyInfoSnapshot: { currency: devise }
            });
            const sortie = {};

            // 1. Cas nominal, FCFA.
            {
                const c = fauxClient();
                const res = await InvoiceService.enregistrerReglement({
                    facture: factureCloud('FCFA', 100000),
                    reglement: { montant: '40000.6', mode: 'wave', date: '2026-09-18', reference: 'W-1', note: 'Acompte' },
                    supabaseClient: c, sbUser: utilisateur, activeOrgId: org
                });
                sortie.nominal = { res, journal: c.journal };
            }
            // 2. Euros : les centimes survivent, deux versements soldent la facture.
            {
                const c = fauxClient();
                const f = factureCloud('EUR', 100.25);
                const r1 = await InvoiceService.enregistrerReglement({
                    facture: f, reglement: { montant: '60.10', mode: 'carte', date: '2026-09-18' },
                    supabaseClient: c, sbUser: utilisateur, activeOrgId: org });
                const r2 = await InvoiceService.enregistrerReglement({
                    facture: { ...f, payments: r1.payments }, reglement: { montant: '40.15', mode: 'virement', date: '2026-09-19' },
                    supabaseClient: c, sbUser: utilisateur, activeOrgId: org });
                sortie.euros = { r1, r2 };
            }
            // 3. La table payments n'existe pas encore : le règlement passe quand même.
            {
                const c = fauxClient({ 'payments.insert': 'relation "public.payments" does not exist' });
                let erreur = null, res = null;
                try {
                    res = await InvoiceService.enregistrerReglement({
                        facture: factureCloud('FCFA', 100000), reglement: { montant: 1000, mode: 'especes' },
                        supabaseClient: c, sbUser: utilisateur, activeOrgId: org });
                } catch (e) { erreur = e.message; }
                sortie.tableAbsente = { erreur, res, journal: c.journal };
            }
            // 4. La source de vérité échoue : aucun miroir ne doit être tenté.
            {
                const c = fauxClient({ 'invoices.update': 'RLS refusée' });
                let erreur = null;
                try {
                    await InvoiceService.enregistrerReglement({
                        facture: factureCloud('FCFA', 100000), reglement: { montant: 1000, mode: 'especes' },
                        supabaseClient: c, sbUser: utilisateur, activeOrgId: org });
                } catch (e) { erreur = e.message; }
                sortie.sourceEnEchec = { erreur, journal: c.journal };
            }
            // 5. L'imputation échoue : le règlement orphelin est retiré.
            {
                const c = fauxClient({ 'payment_allocations.insert': 'contrainte violée' });
                await InvoiceService.enregistrerReglement({
                    facture: factureCloud('FCFA', 100000), reglement: { montant: 1000, mode: 'cheque' },
                    supabaseClient: c, sbUser: utilisateur, activeOrgId: org });
                sortie.imputationEnEchec = { journal: c.journal };
            }
            // 6. Suppression d'un règlement.
            {
                const c = fauxClient();
                const f = { ...factureCloud('FCFA', 100000), payments: [{ id: 'pay_x', montant: 1000 }, { id: 'pay_y', montant: 2000 }] };
                const res = await InvoiceService.supprimerReglement({
                    facture: f, paymentId: 'pay_x', supabaseClient: c, sbUser: utilisateur, activeOrgId: org });
                sortie.suppression = { res, journal: c.journal };
            }
            // 7. Mode invité : aucun appel réseau.
            {
                const c = fauxClient();
                const res = await InvoiceService.enregistrerReglement({
                    facture: factureCloud('FCFA', 100000), reglement: { montant: 500, mode: 'especes' },
                    supabaseClient: c, sbUser: { id: 'guest' }, activeOrgId: org });
                sortie.invite = { res, journal: c.journal };
            }
            return sortie;
        });

        // ── 1. Nominal ────────────────────────────────────────────────────
        {
            const j = r.nominal.journal;
            const ordre = j.map((e) => `${e.table}.${e.op}`);
            ok('Ordre des écritures : notes d\'abord, puis règlement, puis imputation',
                ordre.join(' → ') === 'invoices.update → payments.insert → payment_allocations.insert', ordre.join(' → '));
            const facture = j.find((e) => e.table === 'invoices');
            const idPaiement = r.nominal.res.nouveauPaiement.id;
            ok('La source de vérité garde le marqueur dans les notes',
                facture && /<!--PAYMENTS:/.test(facture.charge.notes) && facture.charge.notes.startsWith('Merci.'),
                facture && facture.charge.notes.slice(0, 40));
            const paiement = j.find((e) => e.table === 'payments');
            ok('Le miroir porte la MÊME clé que le marqueur (reprise idempotente)',
                paiement && paiement.charge.legacy_payment_key === idPaiement, `${paiement && paiement.charge.legacy_payment_key} / ${idPaiement}`);
            ok('Mode « wave » conservé et classé mobile money',
                paiement && paiement.charge.method === 'mobile_money' && paiement.charge.method_detail === 'wave',
                paiement && `${paiement.charge.method} / ${paiement.charge.method_detail}`);
            ok('Devise en code ISO (FCFA → XOF)', paiement && paiement.charge.currency === 'XOF', paiement && paiement.charge.currency);
            ok('Un identifiant client local (non uuid) n\'est pas envoyé — incident du 2026-09-02',
                paiement && paiement.charge.client_id === null, String(paiement && paiement.charge.client_id));
            ok('FCFA : arrondi à l\'unité, comme avant (40 000,6 → 40 001)',
                r.nominal.res.montantRegle === 40001 && paiement.charge.amount === 40001, `${r.nominal.res.montantRegle}`);
            const imputation = j.find((e) => e.table === 'payment_allocations');
            ok('L\'imputation vise la facture serveur', imputation && imputation.charge.invoice_id === '99999999-9999-9999-9999-999999999999');
        }
        // ── 2. Euros ──────────────────────────────────────────────────────
        ok('Euros : un versement de 60,10 € garde ses centimes', r.euros.r1.nouveauPaiement.montant === 60.1,
            String(r.euros.r1.nouveauPaiement.montant));
        ok('Euros : 60,10 + 40,15 solde exactement une facture de 100,25 €',
            r.euros.r2.montantRegle === 100.25 && r.euros.r2.statut === 'paid',
            `réglé=${r.euros.r2.montantRegle}, statut=${r.euros.r2.statut}`);
        // ── 3. Table absente ──────────────────────────────────────────────
        ok('Table payments absente : le règlement est quand même enregistré',
            r.tableAbsente.erreur === null && r.tableAbsente.res && r.tableAbsente.res.statut === 'partially_paid',
            r.tableAbsente.erreur || r.tableAbsente.res.statut);
        ok('…et l\'imputation n\'est pas tentée sans règlement',
            !r.tableAbsente.journal.some((e) => e.table === 'payment_allocations'));
        // ── 4. Source en échec ────────────────────────────────────────────
        ok('Si l\'écriture des notes échoue, l\'erreur remonte à l\'utilisateur',
            r.sourceEnEchec.erreur && /RLS refusée/.test(r.sourceEnEchec.erreur), r.sourceEnEchec.erreur);
        ok('…et AUCUN miroir n\'est écrit',
            !r.sourceEnEchec.journal.some((e) => e.table === 'payments'), r.sourceEnEchec.journal.map((e) => e.table).join(','));
        // ── 5. Imputation en échec ────────────────────────────────────────
        {
            const ordre = r.imputationEnEchec.journal.map((e) => `${e.table}.${e.op}`);
            ok('Imputation ratée : le règlement orphelin est supprimé',
                ordre[ordre.length - 1] === 'payments.delete', ordre.join(' → '));
        }
        // ── 6. Suppression ────────────────────────────────────────────────
        {
            const j = r.suppression.journal;
            const suppr = j.find((e) => e.table === 'payments' && e.op === 'delete');
            ok('Supprimer un règlement retire aussi son miroir, par sa clé',
                suppr && suppr.filtres.some(([k, v]) => k === 'legacy_payment_key' && v === 'pay_x'),
                suppr && JSON.stringify(suppr.filtres));
            ok('Suppression : notes réécrites AVANT le miroir',
                j.map((e) => e.table).join(',') === 'invoices,payments', j.map((e) => e.table).join(','));
            ok('Suppression : le solde restant est recalculé', r.suppression.res.montantRegle === 2000, String(r.suppression.res.montantRegle));
        }
        // ── 7. Invité ─────────────────────────────────────────────────────
        ok('Mode invité : aucun appel réseau, règlement enregistré localement',
            r.invite.journal.length === 0 && r.invite.res.montantRegle === 500, `${r.invite.journal.length} appel(s)`);
    } finally {
        await close();
    }
    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    const echecs = results.filter((r) => !r.pass).length;
    console.log(`\n  ${results.length - echecs}/${results.length} vérifications`);
    process.exit(echecs === 0 ? 0 : 1);
}
