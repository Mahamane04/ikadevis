#!/usr/bin/env node
// Audit UX 220 — lot accessibilité (2026-10-03). Joué au clavier réel
// (page.keyboard), pas par événements synthétiques.
//   UX-P2-04 fenêtre nommée par son titre · UX-P2-05 focus amené sur le nouvel
//   écran · UX-P2-08 carte « Formule Starter » atteignable au clavier ·
//   UX-P2-11 Échap ferme la fenêtre et rend le focus au déclencheur.
import puppeteer from 'puppeteer';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { startServer } from '../../scratch/lib/server.mjs';

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const CONFIG_FACTICE = await readFile(new URL('../../config.example.js', import.meta.url), 'utf8');
const focus = (page) => page.evaluate(() => {
    const a = document.activeElement;
    return a === document.body ? 'BODY' : `${a.tagName}:${(a.getAttribute('aria-label') || a.innerText || '').trim().slice(0, 60)}`;
});

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
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'networkidle0' });
        await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Essayer sans compte')?.click());
        await attendre(2500);

        // UX-P2-05 : navigation latérale → focus sur le titre du nouvel écran.
        await page.evaluate(() => [...document.querySelectorAll('.sidebar-item')].find((b) => b.innerText.trim() === 'Clients')?.click());
        await attendre(900);
        const f1 = await focus(page);
        ok(`Après navigation, le focus est sur le titre de l'écran — ${f1}`, /^H[12]:Clients/.test(f1));

        // UX-P2-04 + UX-P2-11
        await page.focus('button[aria-label="Créer un nouveau client"]');
        await page.keyboard.press('Enter');
        await attendre(900);
        const nom = await page.evaluate(() => {
            const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => x.getBoundingClientRect().width > 0);
            const id = d?.getAttribute('aria-labelledby');
            return d?.getAttribute('aria-label') || (id && document.getElementById(id)?.textContent.trim()) || '';
        });
        ok(`La fenêtre est annoncée par son titre — « ${nom} »`, nom === 'Nouveau Client');
        await page.keyboard.press('Escape');
        await attendre(600);
        const ouverte = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].some((x) => x.getBoundingClientRect().width > 0 && /Nouveau Client/.test(x.innerText)));
        ok('Échap ferme la fenêtre', !ouverte);
        const f2 = await focus(page);
        ok(`Le focus revient au bouton déclencheur — ${f2}`, /Créer un nouveau client/.test(f2));

        // UX-P2-08 : la carte de formule s'ouvre au clavier.
        const atteinte = await page.evaluate(() => {
            const c = [...document.querySelectorAll('[role="button"]')].find((x) => /Formule Starter/.test(x.getAttribute('aria-label') || ''));
            c?.focus();
            return Boolean(c) && document.activeElement === c;
        });
        ok('La carte « Formule Starter » prend le focus', atteinte);
        await page.keyboard.press('Enter');
        await attendre(900);
        const offres = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"], .fixed.inset-0')].some((x) => x.getBoundingClientRect().width > 0 && /Starter|formule|Formule/.test(x.innerText)));
        ok('Entrée sur la carte ouvre les offres', offres);
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
