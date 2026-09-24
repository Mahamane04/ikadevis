// Banc SQL des migrations du socle Finances.
//
// Rejoue, sur un VRAI Postgres (PGlite : Postgres 16 compilé en WebAssembly,
// sans serveur ni Docker), la chaîne de migrations dans l'ordre où elle sera
// appliquée sur staging puis en production, avec un environnement qui imite
// Supabase : schéma auth, auth.uid(), rôle `authenticated`, RLS active.
//
// Ce qu'il prouve réellement — et qu'aucune relecture ne peut prouver :
//   - que chaque fichier COMPILE (PL/pgSQL valide le corps à la création) ;
//   - que la migration du 2026-09-06 échoue bien, pour la raison annoncée ;
//   - que l'émission pose l'échéance à +30 jours ;
//   - que le rattrapage des échéances n'arme AUCUN rappel rétroactif ;
//   - que la reprise des règlements lit les accents, rejette le JSON tronqué,
//     ne lit que le premier marqueur, et est idempotente ;
//   - que la RLS isole réellement deux organisations.
//
// Ce qu'il ne prouve PAS : l'état réel de staging et de la production, qui
// peut différer de la chaîne de fichiers du dépôt. D'où les requêtes de
// contrôle en tête de chaque migration, à passer AVANT d'appliquer.

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFile(path.join(racine, f), 'utf-8');

// Environnement Supabase minimal. auth.uid() lit un réglage de session, que
// le banc positionne pour « se connecter » en tant qu'un utilisateur donné.
const AMORCE_SUPABASE = `
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE service_role NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT);
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS
        $$ SELECT NULLIF(current_setting('banc.uid', true), '')::uuid $$;
    CREATE SCHEMA extensions;
    CREATE FUNCTION extensions.uuid_generate_v4() RETURNS UUID LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
    CREATE FUNCTION public.uuid_generate_v4()     RETURNS UUID LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
    GRANT USAGE ON SCHEMA public, auth, extensions TO authenticated, anon;
    -- Les privilèges PAR DÉFAUT d'un projet Supabase : toute table et toute
    -- fonction créées ensuite dans public sont exécutables par anon et
    -- authenticated. Les reproduire est indispensable — c'est précisément ce
    -- qui rend un simple « REVOKE … FROM PUBLIC » insuffisant.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
`;

// Supabase accorde par défaut les droits de table au rôle authenticated ; la
// RLS fait ensuite le tri. On reproduit ce comportement.
const DROITS_SUPABASE = `
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
`;

// Les lignes propres à une extension absente de PGlite (uuid-ossp : remplacée
// par l'amorce ; pg_cron/pg_net : planification des rappels, hors sujet ici).
const sansExtensions = (sql) => sql.replace(/^\s*CREATE EXTENSION[^;]*;/gim, '');

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    let PGlite;
    try {
        ({ PGlite } = await import('@electric-sql/pglite'));
    } catch (e) {
        return [{ label: 'PGlite disponible (npm install)', pass: false, detail: e.message }];
    }

    const db = new PGlite();
    const executer = async (label, sql) => {
        try { await db.exec(sql); return null; } catch (e) { return e.message; }
    };
    const valeur = async (sql, params = []) => (await db.query(sql, params)).rows[0];
    const lignes = async (sql, params = []) => (await db.query(sql, params)).rows;
    const commeUtilisateur = async (uid, fn) => {
        await db.exec(`SET ROLE authenticated; SELECT set_config('banc.uid', '${uid}', false);`);
        try { return await fn(); } finally { await db.exec(`RESET ROLE; SELECT set_config('banc.uid', '', false);`); }
    };

    // ── Schéma existant, tel que versionné ────────────────────────────────
    await db.exec(AMORCE_SUPABASE);
    for (const f of ['v6_schema.sql', 'v6_platform_admin.sql', 'v6_invoices.sql', 'v6_invoice_sent_status.sql', 'v6_vat_settings.sql', 'v6_commercial_settings.sql']) {
        const err = await executer(f, sansExtensions(await lire(f)));
        ok(`Schéma existant rejoué : ${f}`, !err, err || '');
        if (err) return results;
    }
    // Table de déduplication des rappels : seule la partie table du fichier du
    // 2026-09-07, sans pg_cron ni appel HTTP.
    {
        const src = await lire('migrations_payment_reminders_2026-09-07.sql');
        const debut = src.indexOf('CREATE TABLE IF NOT EXISTS public.invoice_reminders_sent');
        const fin = src.indexOf('CREATE INDEX IF NOT EXISTS idx_invoice_reminders_sent_invoice');
        const bloc = src.slice(debut, src.indexOf(';', fin) + 1);
        const err = await executer('rappels', bloc);
        ok('Table invoice_reminders_sent rejouée', !err, err || '');
    }
    await db.exec(DROITS_SUPABASE);

    // ── Le défaut annoncé : la migration du 2026-09-06 ne compile pas ─────
    {
        const err = await executer('numerotation 09-06', await lire('migrations_document_numbering_2026-09-06.sql'));
        ok('La migration du 2026-09-06 échoue bien, sur v_max_existing',
            err && /v_max_existing/.test(err), err || 'AUCUNE ERREUR — le diagnostic était faux');
        const col = await valeur(`SELECT count(*)::int AS n FROM information_schema.columns
                                  WHERE table_name = 'organization_invoice_sequences' AND column_name = 'seq_year'`);
        ok('…et son échec a annulé TOUT le fichier (seq_year absent) — d\'où le § 0 du correctif',
            col.n === 0, `seq_year présent : ${col.n}`);
    }

    // ── Jeu d'essai ───────────────────────────────────────────────────────
    const U1 = '11111111-1111-1111-1111-111111111111';
    const U2 = '22222222-2222-2222-2222-222222222222';
    const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const marqueur = (objets) => `<!--PAYMENTS:${encodeURIComponent(JSON.stringify(objets))}-->`;

    await db.exec(`
        INSERT INTO auth.users VALUES ('${U1}', 'a@test.local'), ('${U2}', 'b@test.local');
        INSERT INTO public.organizations (id, name) VALUES ('${ORG_A}', 'Org A'), ('${ORG_B}', 'Org B');
        INSERT INTO public.organization_members (organization_id, user_id, role)
            VALUES ('${ORG_A}', '${U1}', 'owner'), ('${ORG_B}', '${U2}', 'owner');
        INSERT INTO public.company_settings (organization_id, name, currency)
            VALUES ('${ORG_A}', 'Org A', 'FCFA'), ('${ORG_B}', 'Org B', 'EUR');
    `);

    const facture = async (org, { numero, statut = 'issued', type = 'standard', emisIlYa = 0, paye = 0, notes = null, ttc = 1000000 }) => {
        const r = await valeur(`
            INSERT INTO public.invoices (organization_id, invoice_number, client_name, invoice_type, status,
                issued_at, total_ht, total_vat, total_ttc, net_to_pay_ttc, amount_paid, notes)
            VALUES ($1, $2, 'Client', $3, $4,
                CASE WHEN $4 = 'draft' THEN NULL ELSE NOW() - ($5 || ' days')::interval END,
                $6, 0, $6, $6, $7, $8)
            RETURNING id`, [org, numero, type, statut, String(emisIlYa), ttc, paye, notes]);
        return r.id;
    };

    const accents = 'Règlement à réception — chèque de l’entreprise';
    const ids = {
        brouillon: await facture(ORG_A, { numero: null, statut: 'draft' }),
        ancienne:  await facture(ORG_A, { numero: 'FACT-2026-001', emisIlYa: 40, paye: 375000,
            notes: 'Merci.\n' + marqueur([
                { id: 'pay_1', date: '2026-08-10', montant: 250000, mode: 'wave', note: accents, createdAt: '2026-08-10T09:00:00Z' },
                { id: 'pay_2', date: '2026-08-20', montant: 125000, mode: 'especes', createdAt: '2026-08-20T09:00:00Z' }]) }),
        recente:   await facture(ORG_A, { numero: 'FACT-2026-002', emisIlYa: 5, paye: 999,
            notes: marqueur([{ id: 'pay_3', montant: 100000, mode: 'virement' }]) }),
        tronquee:  await facture(ORG_A, { numero: 'FACT-2026-003', emisIlYa: 3, paye: 50000,
            notes: '<!--PAYMENTS:%5B%7B%22id%22%3A%22pay_4%22%2C%22mont-->' }),
        double:    await facture(ORG_A, { numero: 'FACT-2026-004', emisIlYa: 2, paye: 100,
            notes: marqueur([{ id: 'pay_5', montant: 100 }]) + '\n' + marqueur([{ id: 'pay_6', montant: 999 }]) }),
        avoir:     await facture(ORG_A, { numero: 'AV-2026-001', type: 'avoir', emisIlYa: 1, ttc: 5000 }),
        euros:     await facture(ORG_B, { numero: 'FACT-2026-001', emisIlYa: 60, paye: 100.25, ttc: 100.25,
            notes: marqueur([{ id: 'pay_e1', montant: 60.10, mode: 'carte' }, { id: 'pay_e2', montant: 40.15, mode: 'virement' }]) })
    };

    // ── 1. Correctif de l'émission ────────────────────────────────────────
    {
        const err = await executer('fix', await lire('migrations_fix_issue_invoice_2026-09-17.sql'));
        ok('migrations_fix_issue_invoice_2026-09-17.sql s\'applique', !err, err || '');

        const res = await commeUtilisateur(U1, () =>
            valeur(`SELECT public.issue_invoice_v6($1) AS r`, [ids.brouillon]));
        const r = res && res.r;
        ok('L\'émission attribue un numéro', r && /^FACT-\d{4}-\d{3}$/.test(r.invoice_number), JSON.stringify(r));
        // FACT-2026-001..004 existent déjà : l'anti-collision doit sauter à 005.
        ok('L\'anti-collision saute les numéros déjà présents en base',
            r && r.invoice_number === `FACT-${new Date().getFullYear()}-005`, r && r.invoice_number);

        const due = await valeur(`SELECT due_date, (due_date - CURRENT_DATE) AS jours FROM public.invoices WHERE id = $1`, [ids.brouillon]);
        ok('L\'émission pose l\'échéance à +30 jours', due.jours === 30, `écart = ${due.jours} j`);
        ok('…et la renvoie à l\'application', r && r.due_date, `due_date=${r && r.due_date}`);

        const intrus = await commeUtilisateur(U2, async () => {
            try { await db.query(`SELECT public.issue_invoice_v6($1)`, [ids.recente]); return 'accepté'; }
            catch (e) { return e.message; }
        });
        ok('Un utilisateur d\'une autre organisation ne peut pas émettre', /Permission refusée/.test(intrus), intrus);

        // Le correctif rejoue aussi le reste du fichier du 2026-09-06 : le
        // préfixe personnalisable des Paramètres doit fonctionner, et la
        // numérotation des devis doit en tenir compte.
        const prefixe = await commeUtilisateur(U1, async () => {
            try { await db.query(`SELECT public.set_document_prefix($1, 'quote', 'DV-')`, [ORG_A]); return 'ok'; }
            catch (e) { return e.message; }
        });
        ok('set_document_prefix rétabli et utilisable', prefixe === 'ok', prefixe);
        const devis = await commeUtilisateur(U1, async () => {
            try {
                const q = await valeur(`SELECT public.create_quote_v6($1, 'Client', 'Chantier') AS id`, [ORG_A]);
                return (await valeur(`SELECT quote_number FROM public.quotes WHERE id = $1`, [q.id])).quote_number;
            } catch (e) { return e.message; }
        });
        ok('create_quote_v6 réconciliée : le devis prend le préfixe personnalisé',
            /^DV-\d{4}-001$/.test(devis), devis);
    }

    // ── 2. Socle devises ──────────────────────────────────────────────────
    {
        const err = await executer('socle', await lire('migrations_finance_socle_2026-09-18.sql'));
        ok('migrations_finance_socle_2026-09-18.sql s\'applique', !err, err || '');
        if (err) return results;

        const n = await valeur(`SELECT count(*)::int AS n FROM public.currencies`);
        ok('11 devises au référentiel', n.n === 11, `${n.n}`);
        const cfa = await lignes(`SELECT code, minor_unit FROM public.currencies WHERE code IN ('XOF','XAF') ORDER BY code`);
        ok('XOF et XAF sans sous-unité (condition de non-régression des étalons)',
            cfa.every((c) => c.minor_unit === 0), JSON.stringify(cfa));

        const nulls = await valeur(`SELECT count(*)::int AS n FROM public.invoices WHERE currency IS NULL`);
        ok('Plus aucune facture sans devise', nulls.n === 0, `${nulls.n}`);
        const devA = await valeur(`SELECT currency FROM public.invoices WHERE id = $1`, [ids.ancienne]);
        const devB = await valeur(`SELECT currency, amount_base FROM public.invoices WHERE id = $1`, [ids.euros]);
        ok('« FCFA » des réglages traduit en XOF', devA.currency === 'XOF', devA.currency);
        ok('Organisation en euros : EUR, contre-valeur au centime', devB.currency === 'EUR' && Number(devB.amount_base) === 100.25,
            JSON.stringify(devB));

        const trig = await valeur(`SELECT tgenabled FROM pg_trigger WHERE tgname = 'trg_protect_issued_invoice'`);
        ok('Le trigger d\'immuabilité est RÉACTIVÉ après le backfill', trig.tgenabled === 'O', `tgenabled=${trig.tgenabled}`);

        let figee;
        try { await db.query(`UPDATE public.invoices SET currency = 'EUR' WHERE id = $1`, [ids.ancienne]); figee = 'modification acceptée'; }
        catch (e) { figee = e.message; }
        ok('La devise d\'une facture émise est figée', /figés/.test(figee), figee);

        let montant;
        try { await db.query(`UPDATE public.invoices SET total_ttc = 1 WHERE id = $1`, [ids.ancienne]); montant = 'modification acceptée'; }
        catch (e) { montant = e.message; }
        ok('Les montants d\'une facture émise restent figés (trigger republié sans régression)', /figés/.test(montant), montant);

        let paiementOk;
        try { await db.query(`UPDATE public.invoices SET amount_paid = amount_paid WHERE id = $1`, [ids.ancienne]); paiementOk = true; }
        catch (e) { paiementOk = e.message; }
        ok('Le règlement d\'une facture émise reste possible', paiementOk === true, String(paiementOk));

        await db.query(`INSERT INTO public.exchange_rates (organization_id, base_code, quote_code, rate, rate_date)
                        VALUES ($1, 'XOF', 'EUR', 655.957, CURRENT_DATE - 1)`, [ORG_A]);
        const taux = await commeUtilisateur(U1, () =>
            valeur(`SELECT public.fx_rate_on($1, 'XOF', 'EUR', CURRENT_DATE) AS t`, [ORG_A]));
        ok('fx_rate_on : 1 EUR = 655,957 FCFA (sens non inversé)', Number(taux.t) === 655.957, String(taux.t));
        const futur = await commeUtilisateur(U1, () =>
            valeur(`SELECT public.fx_rate_on($1, 'XOF', 'EUR', CURRENT_DATE - 2) AS t`, [ORG_A]));
        ok('fx_rate_on ne renvoie jamais un taux postérieur à la date demandée', futur.t === null, String(futur.t));
        const manquant = await commeUtilisateur(U1, () =>
            valeur(`SELECT public.fx_rate_on($1, 'XOF', 'USD', CURRENT_DATE) AS t`, [ORG_A]));
        ok('Un taux manquant vaut NULL, jamais 1', manquant.t === null, String(manquant.t));
        const fuite = await commeUtilisateur(U2, async () => {
            try { await db.query(`SELECT public.fx_rate_on($1, 'XOF', 'EUR', CURRENT_DATE)`, [ORG_A]); return 'accepté'; }
            catch (e) { return e.message; }
        });
        ok('fx_rate_on refuse une organisation dont on n\'est pas membre', /refusé/.test(fuite), fuite);

        const rejeu = await executer('socle bis', await lire('migrations_finance_socle_2026-09-18.sql'));
        ok('Le socle est rejouable sans erreur', !rejeu, rejeu || '');
    }

    // ── 3. Rattrapage des échéances ───────────────────────────────────────
    {
        const err = await executer('due_date', await lire('migrations_due_date_backfill_2026-09-18.sql'));
        ok('migrations_due_date_backfill_2026-09-18.sql s\'applique', !err, err || '');

        const sans = await valeur(`SELECT count(*)::int AS n FROM public.invoices
                                   WHERE due_date IS NULL AND status <> 'draft' AND invoice_type <> 'avoir'`);
        ok('Plus aucune facture émise sans échéance', sans.n === 0, `${sans.n}`);
        const av = await valeur(`SELECT due_date FROM public.invoices WHERE id = $1`, [ids.avoir]);
        ok('Un avoir ne reçoit pas d\'échéance (il ne se relance pas)', av.due_date === null, String(av.due_date));

        // Émise il y a 40 jours → échue il y a 10 jours : les 3 seuils sont passés.
        const s1 = await lignes(`SELECT threshold FROM public.invoice_reminders_sent WHERE invoice_id = $1 ORDER BY 1`, [ids.ancienne]);
        ok('Facture ancienne : les 3 rappels passés sont éteints', s1.length === 3, s1.map((x) => x.threshold).join(','));
        // Émise il y a 5 jours → échue dans 25 jours : aucun seuil atteint.
        const s2 = await lignes(`SELECT threshold FROM public.invoice_reminders_sent WHERE invoice_id = $1`, [ids.recente]);
        ok('Facture récente : ses rappels à venir restent armés', s2.length === 0, `${s2.length} éteint(s)`);

        // LA vérification qui compte : simuler la sélection de l'Edge Function
        // sur les 60 derniers jours jusqu'à aujourd'hui. Aucune facture dont le
        // seuil est déjà passé ne doit rester éligible.
        const retroactifs = await lignes(`
            SELECT d::date AS jour, s.threshold, i.invoice_number
            FROM generate_series(CURRENT_DATE - 60, CURRENT_DATE, '1 day') d
            CROSS JOIN (VALUES ('j-3', 3), ('j+3', -3), ('j+7', -7)) AS s(threshold, jours)
            JOIN public.invoices i ON i.due_date = d::date + s.jours
             AND i.status IN ('issued','partially_paid')
            WHERE NOT EXISTS (SELECT 1 FROM public.invoice_reminders_sent r
                              WHERE r.invoice_id = i.id AND r.threshold = s.threshold)`);
        ok('Aucun rappel ne peut partir pour un seuil déjà passé (avalanche neutralisée)',
            retroactifs.length === 0, retroactifs.length ? JSON.stringify(retroactifs) : '0 rappel rétroactif');

        const rejeu = await executer('due_date bis', await lire('migrations_due_date_backfill_2026-09-18.sql'));
        const n2 = await valeur(`SELECT count(*)::int AS n FROM public.invoice_reminders_sent`);
        ok('Le rattrapage est rejouable (idempotent)', !rejeu, rejeu || `${n2.n} lignes de déduplication`);
    }

    // ── 4. Règlements ─────────────────────────────────────────────────────
    {
        const err = await executer('payments', await lire('migrations_finance_payments_2026-09-18.sql'));
        ok('migrations_finance_payments_2026-09-18.sql s\'applique', !err, err || '');
        if (err) return results;
        // Pas de nouveau GRANT ici : dans Supabase, ce sont les privilèges
        // PAR DÉFAUT (amorce) qui s'appliquent aux objets créés ensuite.

        const decode = await valeur(`SELECT public.url_decode($1) AS t`, [encodeURIComponent(accents)]);
        ok('url_decode restitue accents et apostrophe typographique', decode.t === accents, decode.t);

        const blanc = (await valeur(`SELECT public.backfill_payments_from_notes_v1(NULL, TRUE) AS r`)).r;
        const avant = await valeur(`SELECT count(*)::int AS n FROM public.payments`);
        ok('Contrôle à blanc : RIEN n\'est écrit', avant.n === 0 && blanc.paiements_crees === 0, `${avant.n} ligne(s)`);
        ok('Contrôle à blanc : 5 factures à marqueur scannées', blanc.factures_scannees === 5, JSON.stringify(blanc.factures_scannees));
        ok('Contrôle à blanc : le JSON tronqué est compté illisible', blanc.paiements_illisibles === 1, `${blanc.paiements_illisibles}`);
        ok('Contrôle à blanc : le marqueur double est signalé', blanc.factures_multi_marqueurs === 1, `${blanc.factures_multi_marqueurs}`);
        // « recente » : marqueur 100 000 mais amount_paid 999 ; « tronquee » :
        // illisible, donc non comptée dans les écarts (elle est déjà rapportée).
        ok('Contrôle à blanc : l\'écart marqueur ≠ amount_paid est détecté', blanc.factures_en_ecart === 1,
            JSON.stringify(blanc.detail_ecarts));

        const reel = (await valeur(`SELECT public.backfill_payments_from_notes_v1(NULL, FALSE) AS r`)).r;
        ok('Reprise réelle : 6 règlements créés (2+1+1 premier marqueur seulement +2 euros)',
            reel.paiements_crees === 6, `${reel.paiements_crees}`);
        const rejeu = (await valeur(`SELECT public.backfill_payments_from_notes_v1(NULL, FALSE) AS r`)).r;
        const apres = await valeur(`SELECT count(*)::int AS n FROM public.payments`);
        ok('Reprise rejouée : aucun doublon', rejeu.paiements_crees === 0 && apres.n === 6, `${apres.n} lignes`);

        const second = await valeur(`SELECT count(*)::int AS n FROM public.payments WHERE legacy_payment_key = 'pay_6'`);
        ok('Seul le premier marqueur est repris, comme l\'application le lit', second.n === 0, `${second.n}`);

        const noteLue = await valeur(`SELECT note, method, method_detail FROM public.payments WHERE legacy_payment_key = 'pay_1'`);
        ok('La note accentuée arrive intacte en base', noteLue.note === accents, noteLue.note);
        ok('Le mode « wave » est conservé et classé mobile money',
            noteLue.method === 'mobile_money' && noteLue.method_detail === 'wave', JSON.stringify(noteLue));

        const eur = await lignes(`SELECT amount::text FROM public.payments WHERE legacy_payment_key IN ('pay_e1','pay_e2') ORDER BY 1`);
        ok('Les centimes des règlements en euros sont exacts', eur.map((x) => x.amount).join('+') === '40.15+60.10',
            eur.map((x) => x.amount).join('+'));

        const miroir = (await valeur(`SELECT public.controle_payments_miroir_v1(NULL) AS r`)).r;
        // Écarts attendus : « recente » (999 ≠ 100 000), « tronquee » (illisible).
        // « double » : 100 = 100, pas d'écart. Le brouillon émis au § 1 n'a rien.
        ok('Le contrôle du miroir désigne exactement les factures à traiter à la main',
            miroir.factures_en_ecart === 2, JSON.stringify(miroir.detail));

        const inchangees = await valeur(`SELECT amount_paid::text AS p, status FROM public.invoices WHERE id = $1`, [ids.recente]);
        ok('La reprise ne touche NI amount_paid NI le statut des factures',
            inchangees.p === '999.00' && inchangees.status === 'issued', JSON.stringify(inchangees));

        // Isolation entre organisations, sous RLS réelle.
        const vuA = await commeUtilisateur(U1, () => lignes(`SELECT DISTINCT organization_id FROM public.payments`));
        const vuB = await commeUtilisateur(U2, () => lignes(`SELECT DISTINCT organization_id FROM public.payments`));
        ok('RLS : l\'organisation A ne voit que ses règlements',
            vuA.length === 1 && vuA[0].organization_id === ORG_A, JSON.stringify(vuA));
        ok('RLS : l\'organisation B ne voit que les siens',
            vuB.length === 1 && vuB[0].organization_id === ORG_B, JSON.stringify(vuB));

        // Double écriture applicative (T3) : même clé que le marqueur → aucun doublon.
        const doublon = await commeUtilisateur(U1, async () => {
            try {
                await db.query(`INSERT INTO public.payments (organization_id, amount, currency, base_currency, amount_base, legacy_payment_key)
                                VALUES ($1, 250000, 'XOF', 'XOF', 250000, 'pay_1')`, [ORG_A]);
                return 'accepté';
            } catch (e) { return e.message; }
        });
        ok('Un règlement déjà repris ne peut pas être inséré une 2e fois', /unique|duplicate/i.test(doublon), doublon);

        const intrusion = await commeUtilisateur(U2, async () => {
            try {
                await db.query(`INSERT INTO public.payments (organization_id, amount, currency, base_currency, amount_base)
                                VALUES ($1, 1, 'XOF', 'XOF', 1)`, [ORG_A]);
                return 'accepté';
            } catch (e) { return e.message; }
        });
        ok('RLS : impossible d\'écrire un règlement dans une autre organisation', /row-level security/i.test(intrusion), intrusion);

        // Aucun retrait de droit à la main ici : ce sont les REVOKE du fichier,
        // appliqués par-dessus les privilèges par défaut de Supabase, qui
        // doivent suffire.
        const refuse = await commeUtilisateur(U1, async () => {
            try { await db.query(`SELECT public.backfill_payments_from_notes_v1(NULL, TRUE)`); return 'accepté'; }
            catch (e) { return e.message; }
        });
        ok('L\'outil de reprise n\'est pas appelable depuis l\'application', /permission denied/i.test(refuse), refuse);
        const refuseMiroir = await commeUtilisateur(U1, async () => {
            try { await db.query(`SELECT public.controle_payments_miroir_v1(NULL)`); return 'accepté'; }
            catch (e) { return e.message; }
        });
        ok('Le contrôle inter-organisations n\'est pas appelable depuis l\'application',
            /permission denied/i.test(refuseMiroir), refuseMiroir);
        // Seconde couche : même si un GRANT était rétabli par erreur, la garde
        // interne refuse un utilisateur connecté qui n'est pas admin plateforme.
        await db.exec(`GRANT EXECUTE ON FUNCTION public.backfill_payments_from_notes_v1(UUID, BOOLEAN) TO authenticated;`);
        const garde = await commeUtilisateur(U1, async () => {
            try { await db.query(`SELECT public.backfill_payments_from_notes_v1(NULL, TRUE)`); return 'accepté'; }
            catch (e) { return e.message; }
        });
        await db.exec(`REVOKE EXECUTE ON FUNCTION public.backfill_payments_from_notes_v1(UUID, BOOLEAN) FROM authenticated;`);
        ok('Garde interne : refus même si le droit d\'exécution était rétabli par erreur',
            /Réservé à l'administration/.test(garde), garde);

        const rejeuFichier = await executer('payments bis', await lire('migrations_finance_payments_2026-09-18.sql'));
        ok('La migration des règlements est rejouable sans erreur', !rejeuFichier, rejeuFichier || '');
    }

    // ── 5. Gel T5 ─────────────────────────────────────────────────────────
    {
        const T5 = await lire('migrations_finance_payments_gel_T5.sql');
        const ecarts = (await valeur(`SELECT public.controle_payments_miroir_v1(NULL) AS r`)).r.factures_en_ecart;

        const refus = await executer('T5 prématuré', T5);
        ok(`T5 refuse de s'exécuter tant qu'il reste des écarts (${ecarts})`, refus && /T5 REFUSÉ/.test(refus), refus || 'ACCEPTÉ — le garde-fou ne tient pas');
        await db.exec('ROLLBACK;').catch(() => {});
        const intact = await valeur(`SELECT count(*)::int AS n FROM public.invoices WHERE notes LIKE '%<!--PAYMENTS:%'`);
        const trig = await valeur(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'trg_payment_allocations_sync'`);
        ok('…et un refus ne laisse RIEN derrière lui (notes intactes, aucun trigger)', intact.n === 5 && trig.n === 0,
            `marqueurs=${intact.n}, trigger=${trig.n}`);

        // Traitement « à la main » des deux écarts, comme l'exploitant le ferait :
        // « recente » : le marqueur (100 000) avait raison, amount_paid était faux.
        // « tronquee » : marqueur illisible, règlement ressaisi à partir de la pièce.
        await db.query(`UPDATE public.invoices SET amount_paid = 100000 WHERE id = $1`, [ids.recente]);
        const p = await valeur(`INSERT INTO public.payments (organization_id, amount, currency, base_currency, amount_base, legacy_payment_key, source)
                                VALUES ($1, 50000, 'XOF', 'XOF', 50000, 'ressaisie_003', 'backfill') RETURNING id`, [ORG_A]);
        await db.query(`INSERT INTO public.payment_allocations (organization_id, payment_id, invoice_id, amount, amount_base)
                        VALUES ($1, $2, $3, 50000, 50000)`, [ORG_A, p.id, ids.tronquee]);

        const err = await executer('T5', T5);
        ok('T5 s\'applique une fois le miroir parfait', !err, err || '');

        const restants = await valeur(`SELECT count(*)::int AS n FROM public.invoices WHERE notes LIKE '%<!--PAYMENTS:%'`);
        const sauvegardes = await valeur(`SELECT count(*)::int AS n FROM public.invoices_notes_backup_t5`);
        ok('Tous les marqueurs ont quitté les notes', restants.n === 0, `${restants.n} restant(s)`);
        ok('…après une sauvegarde intégrale des 5 notes concernées', sauvegardes.n === 5, `${sauvegardes.n}`);
        const texteLibre = await valeur(`SELECT notes FROM public.invoices WHERE id = $1`, [ids.ancienne]);
        ok('Le texte libre de l\'utilisateur est conservé', texteLibre.notes === 'Merci.', JSON.stringify(texteLibre.notes));
        const vide = await valeur(`SELECT notes FROM public.invoices WHERE id = $1`, [ids.recente]);
        ok('Une note qui ne contenait que le marqueur devient vide (NULL)', vide.notes === null, JSON.stringify(vide.notes));

        // Le trigger tient désormais amount_paid et le statut.
        const p2 = await valeur(`INSERT INTO public.payments (organization_id, amount, currency, base_currency, amount_base)
                                 VALUES ($1, 900000, 'XOF', 'XOF', 900000) RETURNING id`, [ORG_A]);
        await db.query(`INSERT INTO public.payment_allocations (organization_id, payment_id, invoice_id, amount, amount_base)
                        VALUES ($1, $2, $3, 900000, 900000)`, [ORG_A, p2.id, ids.recente]);
        const solde = await valeur(`SELECT amount_paid::text AS p, status FROM public.invoices WHERE id = $1`, [ids.recente]);
        ok('Trigger : un règlement qui complète la facture la passe à « payée »',
            solde.p === '1000000.00' && solde.status === 'paid', JSON.stringify(solde));

        await db.query(`UPDATE public.payments SET status = 'bounced' WHERE id = $1`, [p2.id]);
        const rouvert = await valeur(`SELECT amount_paid::text AS p, status FROM public.invoices WHERE id = $1`, [ids.recente]);
        ok('Trigger : un chèque rejeté rouvre la facture',
            rouvert.p === '100000.00' && rouvert.status === 'partially_paid', JSON.stringify(rouvert));

        await db.query(`DELETE FROM public.payment_allocations WHERE invoice_id = $1`, [ids.recente]);
        const retour = await valeur(`SELECT amount_paid::text AS p, status FROM public.invoices WHERE id = $1`, [ids.recente]);
        ok('Trigger : sans aucun règlement, la facture redevient « émise »',
            retour.p === '0.00' && retour.status === 'issued', JSON.stringify(retour));

        const avoirIntact = await valeur(`SELECT status FROM public.invoices WHERE id = $1`, [ids.avoir]);
        ok('Trigger : un avoir n\'est jamais recalculé', avoirIntact.status === 'issued', avoirIntact.status);

        // Retour arrière documenté en tête du fichier.
        await db.exec(`UPDATE public.invoices i SET notes = b.notes FROM public.invoices_notes_backup_t5 b WHERE b.invoice_id = i.id;`);
        const restaures = await valeur(`SELECT count(*)::int AS n FROM public.invoices WHERE notes LIKE '%<!--PAYMENTS:%'`);
        ok('Le retour arrière restaure les 5 marqueurs', restaures.n === 5, `${restaures.n}`);
    }

    // ── 6. Paramètres Finances et comptes (§ 71) ──────────────────────────
    {
        const err = await executer('parametres', await lire('migrations_finance_settings_accounts_2026-09-19.sql'));
        ok('migrations_finance_settings_accounts_2026-09-19.sql s\'applique', !err, err || '');
        if (err) { await db.close(); return results; }

        // Réglages existants de l'org A : taux proposés sur les devis, mention
        // d'exonération, banque et deux portefeuilles mobile money.
        await db.query(`UPDATE public.company_settings SET vat_rates = '[18, 9, 0]'::jsonb,
                            vat_exemption_note = 'Exonéré — art. 355 CGI',
                            commercial_settings = '{"bankName":"Ecobank","bankAccount":"CI059 01001","bankSwift":"ECOCCIAB","waveNumber":"+225 07 00 00 00","orangeMoneyNumber":"  ","moovMoneyNumber":"+225 01 11 11 11"}'::jsonb
                        WHERE organization_id = $1`, [ORG_A]);

        const refus = await commeUtilisateur(U2, async () => {
            try { await db.query(`SELECT public.seed_finance_defaults_v1($1)`, [ORG_A]); return 'accepté'; }
            catch (e) { return e.message; }
        });
        ok('Initialisation refusée à un utilisateur d\'une autre organisation', /Permission refusée/.test(refus), refus);

        const seed = (await commeUtilisateur(U1, () => valeur(`SELECT public.seed_finance_defaults_v1($1) AS r`, [ORG_A]))).r;
        ok('Initialisation : devise de base reprise des réglages (FCFA → XOF)', seed.base_currency === 'XOF', JSON.stringify(seed));

        const taxes = await lignes(`SELECT name, kind, rate::float AS rate, is_default, legal_mention FROM public.tax_rates
                                    WHERE organization_id = $1 ORDER BY rate DESC, name`, [ORG_A]);
        ok('Taxes reprises des taux existants : 18 %, 9 %, taux zéro, exonéré',
            taxes.map((x) => x.name).join(' | ') === 'TVA 18 % | TVA 9 % | Exonéré | Taux zéro', taxes.map((x) => x.name).join(' | '));
        ok('« Taux zéro » et « Exonéré » sont deux natures distinctes',
            taxes.find((x) => x.name === 'Taux zéro')?.kind === 'zero' && taxes.find((x) => x.name === 'Exonéré')?.kind === 'exempt');
        ok('La mention légale d\'exonération est reprise', taxes.find((x) => x.kind === 'exempt')?.legal_mention === 'Exonéré — art. 355 CGI');
        ok('Une seule taxe par défaut, et c\'est 18 %', taxes.filter((x) => x.is_default).map((x) => x.rate).join() === '18',
            taxes.filter((x) => x.is_default).map((x) => x.name).join());

        const cats = await valeur(`SELECT count(*)::int AS n FROM public.expense_categories WHERE organization_id = $1`, [ORG_A]);
        ok('Les 9 catégories initiales sont créées', cats.n === 9, `${cats.n}`);

        const comptes = await lignes(`SELECT name, kind, currency, account_number, bic, mobile_number, is_default, legacy_source
                                      FROM public.financial_accounts WHERE organization_id = $1 ORDER BY name`, [ORG_A]);
        ok('Comptes repris : la banque et les deux portefeuilles renseignés (pas l\'Orange Money vide)',
            comptes.map((x) => x.name).join(', ') === 'Ecobank, Moov Money, Wave', comptes.map((x) => x.name).join(', '));
        const banque = comptes.find((x) => x.kind === 'bank');
        ok('Le compte bancaire reprend numéro et BIC, et devient le compte par défaut',
            banque && banque.account_number === 'CI059 01001' && banque.bic === 'ECOCCIAB' && banque.is_default === true, JSON.stringify(banque));

        const seed2 = (await commeUtilisateur(U1, () => valeur(`SELECT public.seed_finance_defaults_v1($1) AS r`, [ORG_A]))).r;
        const n2 = await valeur(`SELECT (SELECT count(*) FROM public.tax_rates WHERE organization_id = $1)::int AS t,
                                        (SELECT count(*) FROM public.financial_accounts WHERE organization_id = $1)::int AS c`, [ORG_A]);
        ok('Initialisation rejouée : rien n\'est dupliqué', n2.t === 4 && n2.c === 3 && seed2.comptes_crees === 0, JSON.stringify(n2));

        // Contraintes métier.
        const essai = async (sql, params) => commeUtilisateur(U1, async () => {
            try { await db.query(sql, params); return 'accepté'; } catch (e) { return e.message; }
        });
        ok('Une taxe « standard » à 0 % est refusée (c\'est un taux zéro)',
            /tax_rates_kind_rate/.test(await essai(`INSERT INTO public.tax_rates (organization_id, name, kind, rate) VALUES ($1, 'X', 'standard', 0)`, [ORG_A])));
        ok('Une exonération ne peut pas porter de taux',
            /tax_rates_kind_rate/.test(await essai(`INSERT INTO public.tax_rates (organization_id, name, kind, rate) VALUES ($1, 'X', 'exempt', 5)`, [ORG_A])));
        ok('Deux taxes par défaut sur la même portée sont refusées',
            /uq_tax_rates_default/.test(await essai(`INSERT INTO public.tax_rates (organization_id, name, kind, rate, is_default) VALUES ($1, 'TVA bis', 'standard', 5, true)`, [ORG_A])));
        ok('Deux catégories au même nom (casse ignorée) sont refusées',
            /uq_expense_categories_name/.test(await essai(`INSERT INTO public.expense_categories (organization_id, name) VALUES ($1, '  matériaux ')`, [ORG_A])));
        ok('La devise de base doit faire partie des devises activées',
            /finance_settings_base_enabled/.test(await essai(`UPDATE public.finance_settings SET enabled_currencies = ARRAY['EUR']::char(3)[] WHERE organization_id = $1`, [ORG_A])));
        ok('Activer l\'euro à côté du franc CFA est accepté',
            (await essai(`UPDATE public.finance_settings SET enabled_currencies = ARRAY['XOF','EUR']::char(3)[] WHERE organization_id = $1`, [ORG_A])) === 'accepté');
        ok('Changer la devise de base est refusé : des factures existent déjà',
            /devise de base ne peut plus/.test(await essai(`UPDATE public.finance_settings SET base_currency = 'EUR' WHERE organization_id = $1`, [ORG_A])));

        // Un compte caisse, sans aucun identifiant bancaire, avec un solde initial.
        const caisse = await commeUtilisateur(U1, () => valeur(`
            INSERT INTO public.financial_accounts (organization_id, name, kind, currency, opening_balance, opening_date)
            VALUES ($1, 'Caisse atelier', 'cash', 'XOF', 150000, CURRENT_DATE - 10) RETURNING id`, [ORG_A]));
        ok('Une caisse se crée sans identifiant bancaire', !!caisse.id);
        ok('Deux comptes par défaut sont refusés',
            /uq_financial_accounts_default/.test(await essai(`UPDATE public.financial_accounts SET is_default = true WHERE id = $1`, [caisse.id])));
        ok('Un intrus ne peut pas créer de compte dans l\'organisation A',
            /row-level security/i.test(await commeUtilisateur(U2, async () => {
                try { await db.query(`INSERT INTO public.financial_accounts (organization_id, name, kind, currency) VALUES ($1, 'Pirate', 'cash', 'XOF')`, [ORG_A]); return 'accepté'; }
                catch (e) { return e.message; } })));

        // Mouvements : une entrée, une sortie, et un mouvement antérieur au solde initial.
        const mvt = (dir, montant, jours, devise = 'XOF') => db.query(`
            INSERT INTO public.payments (organization_id, direction, amount, currency, base_currency, amount_base, account_id, payment_date)
            VALUES ($1, $2, $3, $4, 'XOF', $3, $5, CURRENT_DATE - $6::int)`, [ORG_A, dir, montant, devise, caisse.id, jours]);
        await mvt('in', 50000, 2);
        await mvt('out', 20000, 1);
        await mvt('in', 999999, 30);   // antérieur : déjà compris dans le solde initial
        const solde = await commeUtilisateur(U1, () => valeur(`SELECT balance::float AS b, total_in::float AS i, total_out::float AS o, anterior_count::int AS a
                                                              FROM public.v_financial_account_balances WHERE account_id = $1`, [caisse.id]));
        ok('Solde = initial + entrées − sorties (150 000 + 50 000 − 20 000 = 180 000)',
            solde.b === 180000 && solde.i === 50000 && solde.o === 20000, JSON.stringify(solde));
        ok('Un mouvement antérieur au solde initial n\'est pas recompté, mais il est signalé', solde.a === 1, `${solde.a}`);

        let devise;
        try { await mvt('in', 10, 0, 'EUR'); devise = 'accepté'; } catch (e) { devise = e.message; }
        ok('Un mouvement en EUR sur une caisse en XOF est refusé', /convertissez/.test(devise), devise);

        ok('La devise d\'un compte qui a des mouvements ne peut plus changer',
            /ne peut plus être changée/.test(await essai(`UPDATE public.financial_accounts SET currency = 'EUR' WHERE id = $1`, [caisse.id])));
        const suppression = await essai(`DELETE FROM public.financial_accounts WHERE id = $1`, [caisse.id]);
        ok('Un compte qui a des mouvements ne peut pas être supprimé (il s\'archive)',
            /payments_account_fk|foreign key/i.test(suppression), suppression);
        ok('…mais il peut être archivé',
            (await essai(`UPDATE public.financial_accounts SET is_active = false WHERE id = $1`, [caisse.id])) === 'accepté');

        const vuB = await commeUtilisateur(U2, () => lignes(`SELECT account_id FROM public.v_financial_account_balances`));
        ok('La vue des soldes n\'expose AUCUN compte d\'une autre organisation (security_invoker)', vuB.length === 0, `${vuB.length} ligne(s)`);
        const opts = await valeur(`SELECT reloptions FROM pg_class WHERE relname = 'v_financial_account_balances'`);
        ok('La vue porte bien security_invoker=on', String(opts.reloptions).includes('security_invoker=on'), String(opts.reloptions));

        const rejeu = await executer('parametres bis', await lire('migrations_finance_settings_accounts_2026-09-19.sql'));
        ok('La migration Paramètres & comptes est rejouable', !rejeu, rejeu || '');
    }

    // ── 7. Dépenses et factures fournisseurs (§ 72) ───────────────────────
    {
        const err = await executer('depenses', await lire('migrations_finance_expenses_2026-09-19.sql'));
        ok('migrations_finance_expenses_2026-09-19.sql s\'applique', !err, err || '');
        if (err) { await db.close(); return results; }

        const banque = await commeUtilisateur(U1, () => valeur(`
            INSERT INTO public.financial_accounts (organization_id, name, kind, currency, opening_balance, opening_date)
            VALUES ($1, 'Banque dépenses', 'bank', 'XOF', 1000000, CURRENT_DATE - 30) RETURNING id`, [ORG_A]));
        const chantiers = await lignes(`INSERT INTO public.projects (organization_id, code, name) VALUES ($1, 'CH-001', 'Villa Cocody'), ($1, 'CH-002', 'Immeuble Plateau') RETURNING id`, [ORG_A]);
        const [P1, P2] = chantiers.map((c) => c.id);
        const solde = async () => Number((await commeUtilisateur(U1, () => valeur(
            `SELECT balance FROM public.v_financial_account_balances WHERE account_id = $1`, [banque.id]))).balance);
        const etat = async (id) => valeur(`SELECT status, amount_paid::float AS paye FROM public.expenses WHERE id = $1`, [id]);
        const depense = (p) => commeUtilisateur(U1, async () => {
            try {
                const r = await valeur(`SELECT public.enregistrer_depense_v1($1::jsonb) AS id`, [JSON.stringify(p)]);
                return { id: r.id };
            } catch (e) { return { erreur: e.message }; }
        });
        const regler = (id, montant, compte = banque.id) => commeUtilisateur(U1, async () => {
            try { return (await valeur(`SELECT public.regler_depense_v1($1, $2, CURRENT_DATE, $3, 'bank_transfer', 'VIR-1') AS id`, [id, compte, montant])).id; }
            catch (e) { return { erreur: e.message }; }
        });
        const base = (champs) => ({
            organization_id: ORG_A, kind: 'expense', description: 'Ciment 50 sacs', expense_date: new Date().toISOString().slice(0, 10),
            currency: 'XOF', base_currency: 'XOF', fx_rate: 1, amount_ht: 100000, tax_rate: 18, tax_recoverable: true,
            tax_amount: 18000, amount_ttc: 118000, amount_base: 118000, ...champs
        });

        // Dépense payée immédiatement.
        const s0 = await solde();
        const d1 = await depense(base({ account_id: banque.id, method: 'cash', supplier_name: 'Quincaillerie Koné' }));
        ok('Dépense « déjà payée » enregistrée', !!d1.id, d1.erreur || '');
        const e1 = await etat(d1.id);
        ok('…statut « payée », montant réglé = TTC', e1.status === 'paid' && e1.paye === 118000, JSON.stringify(e1));
        ok('…et le solde du compte baisse de 118 000', (await solde()) === s0 - 118000, `${s0} → ${await solde()}`);
        const sansCompte = await depense(base({}));
        ok('Une dépense « déjà payée » sans compte est refusée', /compte d.où l.argent est sorti/.test(sansCompte.erreur || ''), sansCompte.erreur);

        // Facture fournisseur à payer.
        const avecCompte = await depense(base({ kind: 'supplier_invoice', due_date: '2099-01-01', account_id: banque.id }));
        ok('Une facture à payer ne prend pas de compte', /pas encore de compte/.test(avecCompte.erreur || ''), avecCompte.erreur);
        const sansEcheance = await depense(base({ kind: 'supplier_invoice' }));
        ok('Une facture à payer sans échéance est refusée', /expenses_due_for_invoice/.test(sansEcheance.erreur || ''), sansEcheance.erreur);
        const s1 = await solde();
        const f1 = await depense(base({ kind: 'supplier_invoice', due_date: '2099-01-01', description: 'Facture fer à béton', document_ref: 'FA-778' }));
        ok('Facture fournisseur enregistrée « à payer », solde inchangé',
            (await etat(f1.id)).status === 'to_pay' && (await solde()) === s1, JSON.stringify(await etat(f1.id)));
        await regler(f1.id, 50000);
        ok('Règlement partiel : « partiellement payée »', (await etat(f1.id)).status === 'partially_paid');
        const trop = await regler(f1.id, 100000);
        ok('Un règlement supérieur au reste à payer est refusé', /dépasse le reste/.test(trop.erreur || ''), trop.erreur);
        const dernier = await regler(f1.id, 68000);
        const ef = await etat(f1.id);
        ok('Le solde exact (68 000) termine le paiement : « payée »', ef.status === 'paid' && ef.paye === 118000, JSON.stringify(ef));
        ok('La banque a bien décaissé 118 000 en deux fois', (await solde()) === s1 - 118000);

        // Annuler un règlement rouvre la facture.
        await commeUtilisateur(U1, () => db.query(`SELECT public.annuler_reglement_depense_v1($1)`, [dernier]));
        ok('Annuler le dernier règlement rouvre la facture', (await etat(f1.id)).status === 'partially_paid');

        // Avance personnelle.
        const s2 = await solde();
        const a1 = await depense(base({ description: 'Carburant groupe électrogène', advanced_by: 'Moussa Traoré', amount_ht: 25000, tax_rate: 0, tax_amount: 0, amount_ttc: 25000, amount_base: 25000 }));
        ok('Dépense avancée personnellement : « à rembourser », aucun compte touché',
            (await etat(a1.id)).status === 'to_pay' && (await solde()) === s2, JSON.stringify(await etat(a1.id)));
        const avanceEtCompte = await depense(base({ advanced_by: 'X', account_id: banque.id }));
        ok('Une avance personnelle ne peut pas sortir d\'un compte de l\'entreprise', /ne sort d.aucun compte/.test(avanceEtCompte.erreur || ''), avanceEtCompte.erreur);
        await regler(a1.id, 25000);
        const remb = await valeur(`SELECT note FROM public.payments p JOIN public.payment_allocations a ON a.payment_id = p.id WHERE a.expense_id = $1`, [a1.id]);
        ok('Le remboursement est libellé « Remboursement à Moussa Traoré »', remb.note === 'Remboursement à Moussa Traoré', remb.note);

        // Répartition entre deux chantiers.
        const r1 = await depense(base({ kind: 'supplier_invoice', due_date: '2099-01-01', description: 'Location grue',
            splits: [{ project_id: P1, amount: 60000 }, { project_id: P2, amount: 40000 }] }));
        const parts = await lignes(`SELECT amount::float AS a FROM public.expense_splits WHERE expense_id = $1 ORDER BY 1 DESC`, [r1.id]);
        ok('Répartition 60 000 + 40 000 sur un HT de 100 000 acceptée', parts.map((p) => p.a).join('+') === '60000+40000', r1.erreur || JSON.stringify(parts));
        const avant = await valeur(`SELECT count(*)::int AS n FROM public.expenses`);
        const r2 = await depense(base({ kind: 'supplier_invoice', due_date: '2099-01-01', description: 'Location nacelle',
            splits: [{ project_id: P1, amount: 60000 }, { project_id: P2, amount: 30000 }] }));
        const apres = await valeur(`SELECT count(*)::int AS n FROM public.expenses`);
        ok('Une répartition qui ne retombe pas sur le total est refusée', /ne retombe pas/.test(r2.erreur || ''), r2.erreur);
        ok('…et RIEN n\'est enregistré (transaction annulée en bloc)', apres.n === avant.n, `${avant.n} → ${apres.n}`);
        const r3 = await depense(base({ kind: 'supplier_invoice', due_date: '2099-01-01', description: 'Gardiennage', tax_recoverable: false,
            splits: [{ project_id: P1, amount: 100000 }, { project_id: P2, amount: 18000 }] }));
        ok('Taxe non récupérable : la répartition porte sur le TTC (coût réel)', !!r3.id, r3.erreur || '');

        // Cohérence et modifications.
        const faux = await depense(base({ account_id: banque.id, amount_ttc: 120000, amount_base: 120000 }));
        ok('HT + taxe ≠ TTC est refusé', /expenses_ttc_coherent/.test(faux.erreur || ''), faux.erreur);
        const modifMontant = await depense({ ...base({ account_id: banque.id }), id: d1.id, amount_ht: 50000, tax_amount: 9000, amount_ttc: 59000, amount_base: 59000 });
        ok('Changer le montant d\'une dépense déjà réglée est refusé', /annulez-le/.test(modifMontant.erreur || ''), modifMontant.erreur);
        const modifTexte = await depense({ ...base({}), id: d1.id, description: 'Ciment 50 sacs CPJ 45', category_id: null });
        ok('…mais corriger sa description est accepté', !!modifTexte.id, modifTexte.erreur || '');
        const nbPaiements = await valeur(`SELECT count(*)::int AS n FROM public.payment_allocations WHERE expense_id = $1`, [d1.id]);
        ok('…sans créer de second décaissement', nbPaiements.n === 1, `${nbPaiements.n}`);

        // Devise.
        const euro = await depense(base({ account_id: banque.id, currency: 'EUR', amount_ht: 100, tax_amount: 18, amount_ttc: 118, fx_rate: 655.957, amount_base: 77403 }));
        ok('Une dépense en EUR payée depuis un compte en XOF est refusée', /convertissez/.test(euro.erreur || ''), euro.erreur);

        // Suppression : l'argent revient au solde.
        const s3 = await solde();
        await commeUtilisateur(U1, () => db.query(`SELECT public.supprimer_depense_v1($1)`, [d1.id]));
        ok('Supprimer une dépense payée supprime aussi son décaissement (solde +118 000)', (await solde()) === s3 + 118000, `${s3} → ${await solde()}`);
        ok('…et la dépense a disparu', !(await valeur(`SELECT id FROM public.expenses WHERE id = $1`, [d1.id])));

        // Isolation.
        const intrus = await commeUtilisateur(U2, async () => {
            try { await db.query(`SELECT public.enregistrer_depense_v1($1::jsonb)`, [JSON.stringify(base({ kind: 'supplier_invoice', due_date: '2099-01-01' }))]); return 'accepté'; }
            catch (e) { return e.message; }
        });
        ok('Un intrus ne peut pas saisir de dépense dans l\'organisation A', /row-level security/i.test(intrus), intrus);
        const vuB = await commeUtilisateur(U2, () => lignes(`SELECT id FROM public.expenses`));
        ok('Un intrus ne voit aucune dépense de l\'organisation A', vuB.length === 0, `${vuB.length}`);

        const rejeu = await executer('depenses bis', await lire('migrations_finance_expenses_2026-09-19.sql'));
        ok('La migration des dépenses est rejouable', !rejeu, rejeu || '');
    }

    await db.close();
    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    const echecs = results.filter((r) => !r.pass).length;
    console.log(`\n  ${results.length - echecs}/${results.length} vérifications`);
    process.exit(echecs === 0 ? 0 : 1);
}
