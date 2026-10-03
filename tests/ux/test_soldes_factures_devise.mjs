#!/usr/bin/env node
// Audit UX 220 — UX-P2-02 / UX-P2-03 : une seule règle pour « soldée ».
//
// Constaté le 2026-10-03 : un devis à 1 243 035 F HT (TVA 18 %) donnait une
// facture de 1 466 781,30 F — fraction impossible en FCFA. La fiche la
// déclarait « Réglée » (solde arrondi), mais la liste la comptait « partielle »,
// absente de « Soldées », et la fenêtre de règlement préremplissait
// « 1466781.3 ». Une facture échue dans cet état passait « en retard ».
import puppeteer from 'puppeteer';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { startServer } from '../../scratch/lib/server.mjs';

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const CONFIG_FACTICE = await readFile(new URL('../../config.example.js', import.meta.url), 'utf8');

async function cliquer(page, re, racine = 'button, [role="option"], tbody tr') {
    const ok = await page.evaluate((src, sel) => {
        const r = new RegExp(src);
        const el = [...document.querySelectorAll(sel)].filter((x) => x.getBoundingClientRect().width > 0)
            .find((x) => r.test((x.getAttribute('aria-label') || x.innerText || '').trim()));
        el?.click();
        return Boolean(el);
    }, re, racine);
    if (!ok) throw new Error(`Introuvable : ${re}`);
}
const saisir = (page, selecteur, valeur) => page.evaluate((s, v) => {
    const c = typeof s === 'string' ? document.querySelector(s) : null;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(c, v);
    c.dispatchEvent(new Event('input', { bubbles: true }));
}, selecteur, valeur);
const compteurs = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('button')]
    .map((b) => b.innerText.replace(/\s+/g, ' ').trim())
    .map((t) => t.match(/^(Toutes|Non réglées|Partielles|Partiellement réglées|Soldées|En retard)\s+(\d+)$/))
    .filter(Boolean).map((m) => [m[1], Number(m[2])])));

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: Boolean(cond), detail });
    const { url, close: fermerServeur } = await startServer();
    const navigateur = await puppeteer.launch({ headless: true });
    try {
        const page = await navigateur.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const u = new URL(req.url());
            if (u.pathname === '/config.js') return req.respond({ contentType: 'application/javascript', body: CONFIG_FACTICE });
            if (/^https?:$/.test(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname)) return req.abort();
            req.continue();
        });
        await page.goto(url + '/index.html', { waitUntil: 'networkidle0' });

        // A) Facture HISTORIQUE (créée avant correction) : net fractionnaire,
        //    entièrement réglée, échéance dépassée.
        await page.evaluate(() => {
            localStorage.clear();
            localStorage.setItem('costcalc:guest:demoQuoteOpened', 'true');
            localStorage.setItem('costcalc:guest:invoices', JSON.stringify([{
                id: 'inv_historique', numero: 'FACT-2026-009', statut: 'paid', type: 'facture',
                clientName: 'Client Historique', dateCreation: '2026-08-01T10:00:00.000Z', dateEmission: '2026-08-01T10:00:00.000Z',
                dateEcheance: '2026-08-31', tauxTva: 18, totalHT: 1243035, totalTva: 223746.3, totalTTC: 1466781.3,
                deduitTTC: 0, netAPayerTTC: 1466781.3, montantRegle: 1466781,
                payments: [{ id: 'p1', date: '2026-08-10', montant: 1466781, mode: 'virement' }], lignes: [],
                companyInfoSnapshot: { currency: 'FCFA' }
            }]));
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await cliquer(page, '^Essayer sans compte$');
        await attendre(2500);
        await page.evaluate(() => { location.hash = '#factures'; });
        await attendre(1300);
        const c = await compteurs(page);
        ok(`Facture historique réglée à 0,30 F près : comptée « Soldées » — ${JSON.stringify(c)}`, c['Soldées'] === 1);
        ok('… et ni « partielle » ni « en retard »', !(c['Partielles'] || c['Partiellement réglées']) && !c['En retard']);

        // B) Nouvelle facture depuis un devis fractionnaire (120 m² de maçonnerie).
        await page.evaluate(() => { location.hash = '#chiffrage'; });
        await attendre(1500);
        await saisir(page, 'input[placeholder*="Rechercher un ouvrage"]', 'maçonnerie');
        await attendre(900);
        await cliquer(page, 'Maçonnerie en Murs', '[role="option"]');
        await attendre(1500);
        await saisir(page, 'input[aria-label="Surface directe (m²)"]', '120');
        await attendre(800);
        await cliquer(page, '^Confirmer mes quantités$');
        await attendre(600);
        await saisir(page, 'input[aria-label^="Client du devis"]', 'SARL Arrondi');
        await attendre(700);
        await cliquer(page, '^Créer « SARL Arrondi »$', '[role="option"]');
        await attendre(1000);
        await cliquer(page, '^Créer le client$');
        await attendre(1200);
        await cliquer(page, '^Enregistrer$');
        await attendre(1500);
        await page.evaluate(() => { location.hash = '#devis'; });
        await attendre(1300);
        await cliquer(page, 'SARL Arrondi', 'tbody tr');
        await attendre(1200);
        await cliquer(page, '^Facturer le devis DEV-');
        await attendre(1200);
        await cliquer(page, '^Créer le brouillon$');
        await attendre(1500);
        const stocke = await page.evaluate(() => JSON.parse(localStorage.getItem('costcalc:guest:invoices') || '[]')
            .filter((f) => f.clientName === 'SARL Arrondi').map((f) => ({ ttc: f.totalTTC, net: f.netAPayerTTC, tva: f.totalTva })));
        ok(`Le brouillon stocke des montants entiers en FCFA — ${JSON.stringify(stocke)}`,
            stocke.length === 1 && Number.isInteger(stocke[0].ttc) && Number.isInteger(stocke[0].net) && Number.isInteger(stocke[0].tva));
        await cliquer(page, '^Émettre la facture de SARL Arrondi');
        await attendre(900);
        await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.innerText.trim() === 'Émettre')?.click());
        await attendre(1500);
        await cliquer(page, '^Enregistrer un règlement pour la facture FACT-');
        await attendre(1000);
        const prerempli = await page.evaluate(() => document.querySelector('#reglement_montant_commun')?.value);
        ok(`Le règlement est prérempli sans décimale — « ${prerempli} »`, /^\d+$/.test(prerempli || ''));
    } finally {
        await navigateur.close();
        await fermerServeur();
    }
    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    process.exit(results.every((r) => r.pass) ? 0 : 1);
}
