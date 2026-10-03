#!/usr/bin/env node
// Audit UX 220 — UX-P0-01 : un rechargement ne doit RIEN faire disparaître.
//
// Défaut reproduit le 2026-10-03 (Mode Démo) : après un rechargement, clients,
// chantiers et factures disparaissaient de l'écran ; la saisie suivante
// écrasait la liste stockée ; un devis déjà facturé se laissait refacturer et
// la nouvelle facture reprenait le MÊME numéro légal en écrasant la facture
// réglée (règlements perdus). Cause : lecture et écriture du cache ne visaient
// pas la même clé (contexte de stockage posé après les initialiseurs useState).
//
// Parcours joués comme un utilisateur : boutons et champs par leur libellé.
// Configuration factice (config.example.js) et réseau externe BLOQUÉ.
import puppeteer from 'puppeteer';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { startServer } from '../../scratch/lib/server.mjs';

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const CONFIG_FACTICE = await readFile(new URL('../../config.example.js', import.meta.url), 'utf8');

async function cliquer(page, predicat, arg) {
    const ok = await page.evaluate((src, a) => {
        const f = new Function('b', 'a', `return (${src})(b, a);`);
        const b = [...document.querySelectorAll('button, [role="option"], tbody tr')]
            .filter((x) => x.getBoundingClientRect().width > 0)
            .find((x) => f(x, a));
        b?.click();
        return Boolean(b);
    }, predicat.toString(), arg);
    if (!ok) throw new Error(`Élément introuvable : ${predicat.toString().slice(0, 90)}`);
}
const parLibelle = (b, re) => new RegExp(re).test((b.getAttribute('aria-label') || b.innerText || '').trim());

async function entrerEnDemo(page) {
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Essayer sans compte'), { timeout: 10000 });
    await cliquer(page, (b) => b.innerText.trim() === 'Essayer sans compte');
    await attendre(2500);
}
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendre(1300); }
async function creerClient(page, nom) {
    await aller(page, '#clients');
    await cliquer(page, parLibelle, '^(Créer un nouveau client|Nouveau client)$');
    await attendre(800);
    await page.evaluate((n) => {
        const champ = document.querySelector('#newClientForm-name');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(champ, n);
        champ.dispatchEvent(new Event('input', { bubbles: true }));
    }, nom);
    await attendre(300);
    await cliquer(page, parLibelle, '^Créer le client$');
    await attendre(1200);
}
const clientsAffiches = (page) => page.evaluate(() => [...document.querySelectorAll('button')]
    .filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.innerText.replace(/\s+/g, ' ')).join(' | '));

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: Boolean(cond), detail });
    const { url, close: fermerServeur } = await startServer();
    const navigateur = await puppeteer.launch({ headless: true });
    const externes = [];
    try {
        const page = await navigateur.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const u = new URL(req.url());
            if (u.pathname === '/config.js') return req.respond({ contentType: 'application/javascript', body: CONFIG_FACTICE });
            if (/^https?:$/.test(u.protocol) && u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') { externes.push(u.hostname); return req.abort(); }
            req.continue();
        });
        await page.goto(url + '/index.html', { waitUntil: 'networkidle0' });
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'networkidle0' });
        await entrerEnDemo(page);

        // 1) Un client créé doit survivre au rechargement.
        await creerClient(page, 'Client Avant Rechargement');
        // 2) Une facture émise doit survivre, et rester liée à son devis.
        await aller(page, '#devis');
        await cliquer(page, (b) => b.tagName === 'TR' && /DEV-2026-001/.test(b.innerText));
        await attendre(1200);
        await cliquer(page, parLibelle, '^Facturer le devis DEV-2026-001$');
        await attendre(1200);
        await cliquer(page, parLibelle, '^Créer le brouillon$');
        await attendre(1500);
        await cliquer(page, parLibelle, '^Émettre la facture de');
        await attendre(900);
        await cliquer(page, (b) => b.innerText.trim() === 'Émettre' && b.closest('[role="dialog"]'));
        await attendre(1500);
        const numeroEmis = await page.evaluate(() => (document.body.innerText.match(/FACT-\d{4}-\d{3}/) || [])[0]);
        ok('Une facture est émise depuis le devis d’exemple', Boolean(numeroEmis), numeroEmis);

        await page.reload({ waitUntil: 'networkidle0' });
        await entrerEnDemo(page);

        await aller(page, '#clients');
        const apresRechargement = await clientsAffiches(page);
        ok('Le client créé avant le rechargement est toujours affiché', /Client Avant Rechargement/.test(apresRechargement));

        await aller(page, '#factures');
        const factures = await page.evaluate(() => document.body.innerText);
        ok(`La facture émise est toujours affichée après rechargement — ${numeroEmis}`, numeroEmis && factures.includes(numeroEmis));

        await aller(page, '#devis');
        await cliquer(page, (b) => b.tagName === 'TR' && /DEV-2026-001/.test(b.innerText));
        await attendre(1200);
        const refacturable = await page.evaluate(() => [...document.querySelectorAll('button')]
            .some((b) => b.getAttribute('aria-label') === 'Facturer le devis DEV-2026-001' && b.getBoundingClientRect().width > 0));
        ok('Le devis déjà facturé reste lié à sa facture (pas de « Facturer » proposé à nouveau)', !refacturable);

        // 3) Une saisie après rechargement ne doit rien écraser.
        await creerClient(page, 'Client Après Rechargement');
        await aller(page, '#clients');
        const final = await clientsAffiches(page);
        ok('Créer un client après rechargement conserve le client précédent',
            /Client Avant Rechargement/.test(final) && /Client Après Rechargement/.test(final));

        ok('Aucune requête vers un service externe', externes.length === 0, [...new Set(externes)].join(', '));
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
