#!/usr/bin/env node
// Audit UX 220 — Lot 5 : vérification des corrections issues des sondes
// G1–G9 (contrôles C033, C034, C066/C070/C078, C071, C082, C095/C180,
// C140, C158). Mode Démo, données fictives, serveur local isolé : toute
// requête vers un autre hôte que 127.0.0.1 est bloquée.
import puppeteer from 'puppeteer';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { startServer } from '../../scratch/lib/server.mjs';

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const CONFIG_FACTICE = await readFile(new URL('../../config.example.js', import.meta.url), 'utf8');

async function preparer(page, url) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const u = new URL(req.url());
        if (u.pathname === '/config.js') return req.respond({ contentType: 'application/javascript', body: CONFIG_FACTICE });
        if (/^https?:$/.test(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname)) return req.abort();
        req.continue();
    });
    await page.goto(url + '/index.html', { waitUntil: 'networkidle0' });
}
async function cliquer(page, re, racine = 'button, [role="button"], [role="option"]') {
    const ok = await page.evaluate((src, sel) => {
        const r = new RegExp(src);
        const el = [...document.querySelectorAll(sel)].filter((x) => x.getBoundingClientRect().width > 0)
            .find((x) => r.test((x.getAttribute('aria-label') || x.innerText || '').replace(/\s+/g, ' ').trim()));
        el?.click();
        return Boolean(el);
    }, re, racine);
    if (!ok) throw new Error(`Introuvable : ${re}`);
}
const entrerEnDemo = async (page) => { await cliquer(page, '^Essayer sans compte$'); await attendre(2500); };
const aller = async (page, ancre) => { await page.evaluate((a) => { location.hash = a; }, ancre); await attendre(1300); };
const annonces = (page) => page.evaluate(() => [...document.querySelectorAll('[role="status"], [role="alert"]')]
    .map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '));
const lireLS = (page, cle) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), cle);
// Le champ est vidé par une vraie sélection puis Retour arrière (un triple
// clic ne sélectionne pas toujours tout le texte saisi).
const saisirDans = async (page, selecteur, texte) => {
    await page.focus(selecteur);
    await page.$eval(selecteur, (el) => el.select());
    await page.keyboard.press('Backspace');
    if (texte) await page.type(selecteur, texte);
};

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: Boolean(cond), detail: String(detail).slice(0, 400) });
    const { url, close: fermerServeur } = await startServer();
    const navigateur = await puppeteer.launch({ headless: true });
    try {
        const page = await navigateur.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        await preparer(page, url);

        // ── C140 : finalité des champs de connexion (avant la démo).
        const auto = await page.evaluate(() => ({
            email: document.getElementById('auth-email')?.getAttribute('autocomplete'),
            mdp: document.getElementById('auth-password')?.getAttribute('autocomplete')
        }));
        ok(`Connexion : autocomplete email / current-password — ${JSON.stringify(auto)}`, auto.email === 'email' && auto.mdp === 'current-password');

        // Jeu de données fictif : un devis daté d'aujourd'hui au format
        // affiché (jj/mm/aaaa), un brouillon, une émise, une réglée.
        await page.evaluate(() => {
            localStorage.clear();
            localStorage.setItem('costcalc:guest:demoQuoteOpened', 'true');
            const aujourdhui = new Date().toLocaleDateString('fr-FR');
            localStorage.setItem('costcalc:guest:savedQuotes', JSON.stringify([
                { id: 9001, number: 'DEV-2026-091', clientName: 'Société Générale du Bâtiment', projectRef: 'Siège', status: 'sent', date: aujourdhui, quoteData: { totalTTCConsomme: 1000000 } },
                { id: 9002, number: 'DEV-2026-092', clientName: 'Atelier Diallo', projectRef: '', status: 'draft', date: '15/01/2025', quoteData: { totalTTCConsomme: 250000 } }
            ]));
            localStorage.setItem('costcalc:guest:nextQuoteSeq', '93');
            localStorage.setItem('costcalc:guest:clients', JSON.stringify([
                { id: 'c1', name: 'Société Générale du Bâtiment', contactPerson: 'Amadou Diop', phone: '+223 70 00 00 01' },
                { id: 'c2', name: 'Atelier Diallo', contactPerson: '', phone: '' }
            ]));
            const base = { type: 'facture', tauxTva: 18, deduitTTC: 0, lignes: [{ designation: 'Maçonnerie', quantite: 1.5, unite: 'm³', prixUnitaireHT: 100000, totalHT: 150000 }], companyInfoSnapshot: { currency: 'FCFA', name: 'IKADEVIS BTP' } };
            localStorage.setItem('costcalc:guest:invoices', JSON.stringify([
                { ...base, id: 'f_brouillon', numero: null, statut: 'draft', clientName: 'Atelier Diallo', date: aujourdhui, totalHT: 150000, totalTva: 27000, totalTTC: 177000, netAPayerTTC: 177000, montantRegle: 0 },
                { ...base, id: 'f_emise', numero: 'FACT-2026-091', statut: 'issued', clientName: 'Société Générale du Bâtiment', dateEmission: new Date().toISOString(), totalHT: 150000, totalTva: 27000, totalTTC: 177000, netAPayerTTC: 177000, montantRegle: 0 },
                { ...base, id: 'f_reglee', numero: 'FACT-2026-090', statut: 'paid', clientName: 'Société Générale du Bâtiment', dateEmission: '2026-09-01T10:00:00.000Z', totalHT: 150000, totalTva: 27000, totalTTC: 177000, netAPayerTTC: 177000, montantRegle: 177000, payments: [{ id: 'p1', date: '2026-09-02', montant: 177000, mode: 'virement' }] }
            ]));
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await entrerEnDemo(page);

        // ── C082 : « Ce mois » compte le devis du jour ; périmètre rappelé.
        await aller(page, '#dashboard');
        await cliquer(page, '^Ce mois$');
        await attendre(500);
        const tdb = await page.evaluate(() => {
            const carte = [...document.querySelectorAll('section[aria-label="Indicateurs clés"] > *')].map((c) => c.innerText.replace(/\s+/g, ' ').trim());
            const bouton = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Ce mois');
            return { carte, presse: bouton?.getAttribute('aria-pressed') };
        });
        ok(`Tableau de bord « Ce mois » : devis du jour compté (1 000 000) — ${tdb.carte[0]}`, /1\s?000\s?000/.test(tdb.carte[0] || '') && /ce mois/.test(tdb.carte[0] || ''));
        ok(`« Devis à suivre » = devis envoyés seulement (1) — ${tdb.carte[1]}`, /^DEVIS À SUIVRE 1 /i.test(tdb.carte[1] || ''));
        ok(`Bouton de période sélectionné exposé (aria-pressed) — ${tdb.presse}`, tdb.presse === 'true');
        ok(`Reste à encaisser affiché — ${tdb.carte[3]}`, /Reste à encaisser/.test(tdb.carte[3] || ''));

        // ── C140 : titre de document propre à l'écran.
        await aller(page, '#factures');
        ok(`Titre d'onglet de l'écran Factures — « ${await page.title()} »`, (await page.title()) === 'Factures · ikadevis');

        // ── C066/C070/C078 : « Marquer envoyées » n'émet pas un brouillon et
        //    n'écrase pas une facture réglée ; le message dit pourquoi.
        await page.click('input[aria-label="Sélectionner toutes les factures"]');
        await attendre(300);
        await cliquer(page, '^Marquer envoyées$');
        await attendre(400);
        const msgLot = await annonces(page);
        const apres = await lireLS(page, 'costcalc:guest:invoices');
        const statut = (id) => apres.find((f) => f.id === id)?.statut;
        ok(`Lot : brouillon reste brouillon, réglée reste réglée, émise → envoyée — ${statut('f_brouillon')}/${statut('f_reglee')}/${statut('f_emise')}`,
            statut('f_brouillon') === 'draft' && statut('f_reglee') === 'paid' && statut('f_emise') === 'sent');
        ok(`Lot : le message nomme ce qui est écarté — « ${msgLot} »`, /1 facture\(s\) marquée\(s\)/.test(msgLot) && /brouillon/.test(msgLot) && /réglée/.test(msgLot));

        // ── C095/C180 : document de facture — date jj/mm/aaaa, quantité « 1,5 ».
        await cliquer(page, '^Voir la facture FACT-2026-091 ', '[role="button"]');
        await attendre(1200);
        const doc = await page.evaluate(() => {
            const zone = [...document.querySelectorAll('[data-zone-impression]')].find((z) => z.getClientRects().length > 0);
            return zone ? zone.innerText.replace(/\s+/g, ' ') : '';
        });
        ok(`Document facture : « Émise le jj/mm/aaaa », pas d'horodatage brut — ${(doc.match(/Émise le [^ ]+/) || [''])[0]}`, /Émise le \d{2}\/\d{2}\/\d{4}/.test(doc) && !/\d{4}-\d{2}-\d{2}T/.test(doc));
        ok('Document facture : quantité au format français (1,5)', /1,5 m³/.test(doc), (doc.match(/1[.,]5\d* m³/) || [''])[0]);

        // ── C071 : recherche clients sans accents et sur le contact affiché.
        await aller(page, '#clients');
        const chercher = async (texte) => {
            await saisirDans(page, 'input[placeholder^="Rechercher un client"]', texte);
            await attendre(300);
            return page.evaluate(() => [...document.querySelectorAll('button[aria-label^="Sélectionner "]')]
                .filter((b) => b.getClientRects().length > 0).map((b) => b.getAttribute('aria-label').replace('Sélectionner ', '')));
        };
        const r1 = await chercher('societe generale');
        ok(`Clients : « societe generale » trouve la Société Générale — ${JSON.stringify(r1)}`, r1.some((n) => /Société Générale/.test(n)));
        const r2 = await chercher('Diop');
        ok(`Clients : « Diop » (contact affiché) trouve son client — ${JSON.stringify(r2)}`, r2.length === 1 && /Société Générale/.test(r2[0]));
        await saisirDans(page, 'input[placeholder^="Rechercher un client"]', '');

        // ── C034 : la saisie abandonnée de « Nouveau client » est restaurée.
        await cliquer(page, '^(Nouveau Client|Créer un nouveau client)$');
        await attendre(700);
        await page.type('#newClientForm-name', 'Témoin brouillon');
        // ── C033 : Alt+3 sous la fenêtre ne change pas d'écran.
        await page.keyboard.down('Alt'); await page.keyboard.press('Digit3'); await page.keyboard.up('Alt');
        await attendre(700);
        ok(`Alt+3 sous une fenêtre ouverte : l'écran ne change pas — « ${await page.title()} »`, (await page.title()) === 'Clients · ikadevis');
        await page.keyboard.press('Escape');
        await attendre(700);
        const fermee = await page.evaluate(() => !document.getElementById('newClientForm-name'));
        await cliquer(page, '^(Nouveau Client|Créer un nouveau client)$');
        await attendre(700);
        const restaure = await page.evaluate(() => ({
            valeur: document.getElementById('newClientForm-name')?.value,
            avis: /saisie précédente, non enregistrée, a été restaurée/.test(document.body.innerText)
        }));
        ok(`Nouveau client : fermé par Échap puis rouvert → saisie restaurée et signalée — ${JSON.stringify({ fermee, ...restaure })}`, fermee && restaure.valeur === 'Témoin brouillon' && restaure.avis);
        await cliquer(page, '^Repartir de zéro$');
        await attendre(200);
        ok('« Repartir de zéro » vide le formulaire', (await page.evaluate(() => document.getElementById('newClientForm-name')?.value)) === '');
        await page.keyboard.press('Escape');
        await attendre(500);

        // ── C158 : deux onglets — l'écriture de l'un est adoptée par l'autre.
        const pageB = await navigateur.newPage();
        await pageB.setViewport({ width: 1440, height: 900 });
        await preparer(pageB, url);
        await entrerEnDemo(pageB);
        await aller(pageB, '#clients');
        await page.bringToFront();
        await page.evaluate(() => {
            const liste = JSON.parse(localStorage.getItem('costcalc:guest:clients') || '[]');
            liste.unshift({ id: 'c_ongletA', name: 'Client Onglet A', contactPerson: '', phone: '' });
            localStorage.setItem('costcalc:guest:clients', JSON.stringify(liste));
        });
        await attendre(600);
        const vuDansB = await pageB.evaluate(() => [...document.querySelectorAll('button[aria-label^="Sélectionner "]')].some((b) => /Client Onglet A/.test(b.getAttribute('aria-label'))));
        ok('Deux onglets : le client écrit par l\'onglet A apparaît dans l\'onglet B sans rechargement', vuDansB);
        await pageB.bringToFront();
        await cliquer(pageB, '^(Nouveau Client|Créer un nouveau client)$');
        await attendre(700);
        await pageB.type('#newClientForm-name', 'Client Onglet B');
        await cliquer(pageB, '^Créer le client$');
        await attendre(800);
        const finalLS = (await lireLS(pageB, 'costcalc:guest:clients') || []).map((c) => c.name);
        ok(`Deux onglets : l'onglet B ne fait plus disparaître le client de l'onglet A — ${JSON.stringify(finalLS)}`, finalLS.includes('Client Onglet A') && finalLS.includes('Client Onglet B'));
        await pageB.close();

        // ── C130 + revue avant publication : la fenêtre « Signer » s'ouvre
        //    (des hooks placés après un retour anticipé la faisaient planter),
        //    refuse une toile vide, accepte un vrai tracé à la souris.
        const pageS = await navigateur.newPage();
        await pageS.setViewport({ width: 1440, height: 900 });
        const erreursS = [];
        pageS.on('pageerror', (e) => erreursS.push(e.message));
        await preparer(pageS, url);
        await pageS.evaluate(() => localStorage.clear());
        await pageS.reload({ waitUntil: 'networkidle0' });
        await entrerEnDemo(pageS);
        await aller(pageS, '#devis');
        await pageS.evaluate(() => [...document.querySelectorAll('[data-retour-focus^="devis-"]')].find((e) => e.getClientRects().length > 0)?.click());
        await attendre(1200);
        await cliquer(pageS, '^Signer le devis$');
        await attendre(800);
        const sig = await pageS.evaluate(() => {
            const toile = document.querySelector('canvas[aria-label="Zone de signature manuscrite"]');
            const valider = [...document.querySelectorAll('button')].find((b) => /Valider & Signer/.test(b.textContent));
            const r = toile ? toile.getBoundingClientRect() : null;
            return { toile: !!toile, valideDesactive: valider ? valider.disabled : null, r: r && { x: r.x, y: r.y, w: r.width, h: r.height } };
        });
        ok(`« Signer » ouvre la fenêtre sans planter — ${JSON.stringify({ toile: sig.toile, erreurs: erreursS.slice(0, 2) })}`, sig.toile && erreursS.length === 0);
        ok('Toile vide : « Valider & Signer » est désactivé', sig.valideDesactive === true);
        if (sig.r) {
            await pageS.mouse.move(sig.r.x + 40, sig.r.y + 60);
            await pageS.mouse.down();
            for (let i = 1; i <= 12; i++) await pageS.mouse.move(sig.r.x + 40 + i * 20, sig.r.y + 60 + (i % 2) * 25, { steps: 2 });
            await pageS.mouse.up();
            await attendre(200);
        }
        const apresTrace = await pageS.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Valider & Signer/.test(b.textContent))?.disabled);
        ok('Après un vrai tracé : « Valider & Signer » devient actif', apresTrace === false);
        await pageS.close();
    } finally {
        await navigateur.close();
        await fermerServeur();
    }
    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    console.log(`\n${results.filter((r) => r.pass).length}/${results.length}`);
    process.exit(results.every((r) => r.pass) ? 0 : 1);
}
