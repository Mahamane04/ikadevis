#!/usr/bin/env node
// Audit UX 220 — rejeu des contrôles trouvés en échec puis corrigés, qu'aucune
// sonde ne rejouait (phase 1 et passe G10) :
//   C003  un même objet, un même nom : « Chantier non renseigné » partout.
//   C015  lien direct vers une fiche ; adresse du chiffrage inscrite.
//   C016  Précédent / Suivant autour de « Facturer le devis ».
//   C056  fiche client (un tiers) : pas de remplissage automatique avec
//         l'identité de l'utilisateur ; collage libre.
//   C182  client → devis / client → chantier : le client suit ; aucun client
//         présélectionné quand rien ne le demande.
//   C202  limite Starter : le message cite des offres qui existent.
//   C204  Paramètres : plus de « synchronisation en temps réel » ; ce qui
//         s'enregistre seul le dit, et dit où en démonstration.
//   C215  thème sombre du système : l'application reste en thème clair
//         (aucun îlot sombre).
// Mode Démo, données fictives, serveur local isolé : toute requête vers un
// autre hôte que 127.0.0.1 est bloquée.
import puppeteer from 'puppeteer';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { startServer } from '../../scratch/lib/server.mjs';
import { enterGuestMode, addCatalogItemBySearch, setFirstOuvrageSurface } from '../../scratch/lib/harness.mjs';

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
async function cliquer(page, re, racine = 'button, [role="button"]') {
    const ok = await page.evaluate((src, sel) => {
        const r = new RegExp(src);
        const el = [...document.querySelectorAll(sel)].filter((x) => x.getBoundingClientRect().width > 0)
            .find((x) => r.test((x.getAttribute('aria-label') || x.innerText || '').replace(/\s+/g, ' ').trim()));
        el?.click();
        return Boolean(el);
    }, re, racine);
    if (!ok) throw new Error(`Introuvable : ${re}`);
}
const annonces = (page) => page.evaluate(() => [...document.querySelectorAll('[role="status"], [role="alert"]')]
    .map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '));
const fermerFenetre = async (page) => { await page.keyboard.press('Escape'); await attendre(500); };

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: Boolean(cond), detail: String(detail).slice(0, 400) });
    const { url, close: fermerServeur } = await startServer();
    const navigateur = await puppeteer.launch({ headless: true });
    try {
        const page = await navigateur.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        await preparer(page, url);
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'networkidle0' });
        await enterGuestMode(page, { createQuote: false });
        await attendre(1500);

        // ── C015 : lien direct vers une fiche devis, ouvert avant l'entrée.
        //    « Fiche ouverte » = le document du devis est affiché et porte son
        //    numéro (le titre de la fiche est le nom du client).
        const devisDemo = await page.evaluate(() => (JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]')[0]) || null);
        await page.evaluate((id) => { location.hash = `#devis/${id}`; }, devisDemo?.id);
        await page.reload({ waitUntil: 'networkidle0' });
        await enterGuestMode(page, { createQuote: false });
        await attendre(1800);
        const lienDirect = await page.evaluate((num) => ({ hash: location.hash, fiche: [...document.querySelectorAll('[data-zone-impression]')].some((z) => z.getBoundingClientRect().width > 0 && z.innerText.includes(num)) }), devisDemo?.number);
        ok(`C015 · Lien direct #devis/<id> : la fiche s'ouvre après l'entrée — ${JSON.stringify(lienDirect)}`, lienDirect.fiche && lienDirect.hash === `#devis/${devisDemo?.id}`);

        // ── C003 : devis sans chantier — même libellé que dans les listes.
        await page.evaluate(() => {
            const liste = JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]');
            const sans = liste.map((q, i) => (i === 0 ? { ...q, projectId: null, projectRef: '' } : q));
            const valeur = JSON.stringify(sans);
            localStorage.setItem('costcalc:guest:savedQuotes', valeur);
            window.dispatchEvent(new StorageEvent('storage', { key: 'costcalc:guest:savedQuotes', newValue: valeur, storageArea: localStorage }));
        });
        await attendre(800);
        const libelles = {};
        for (const [ecran, ancre] of [['fiche', `#devis/${devisDemo?.id}`], ['tableau de bord', '#dashboard']]) {
            await page.evaluate((a) => { location.hash = a; }, ancre);
            await attendre(1400);
            libelles[ecran] = await page.evaluate(() => ({ chantier: /Chantier non renseigné/.test(document.body.innerText), projet: /Projet non renseigné/.test(document.body.innerText) }));
        }
        ok(`C003 · Devis sans chantier : « Chantier non renseigné » sur la fiche et au tableau de bord, jamais « Projet » — ${JSON.stringify(libelles)}`,
            Object.values(libelles).every((l) => l.chantier && !l.projet));

        // ── C016 : Facturer depuis la fiche, puis Précédent / Suivant.
        await page.evaluate((id) => { location.hash = `#devis/${id}`; }, devisDemo?.id);
        await attendre(1500);
        await cliquer(page, '^(Facturer le devis|Ouvrir la facture du devis) ');
        await attendre(1200);
        // Une fenêtre de création peut s'interposer (brouillon de facture).
        const brouillon = await page.evaluate(() => {
            const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.getBoundingClientRect().width > 0 && /^Créer le brouillon/.test(x.textContent.trim()));
            b?.click();
            return Boolean(b);
        });
        await attendre(1500);
        const apresFacturer = await page.evaluate(() => ({ hash: location.hash, titre: document.title }));
        await page.evaluate(() => history.back());
        await attendre(1500);
        const apresRetour = await page.evaluate((num) => ({ hash: location.hash, fiche: [...document.querySelectorAll('[data-zone-impression]')].some((z) => z.getBoundingClientRect().width > 0 && z.innerText.includes(num)) }), devisDemo?.number);
        await page.evaluate(() => history.forward());
        await attendre(1500);
        const apresSuivant = await page.evaluate(() => ({ hash: location.hash, titre: document.title }));
        ok(`C016 · Facturer → adresse des factures ; Précédent → la fiche devis ; Suivant → les factures — brouillon=${brouillon} ${JSON.stringify({ apresFacturer, apresRetour, apresSuivant })}`,
            /^#factures/.test(apresFacturer.hash) && apresRetour.hash === `#devis/${devisDemo?.id}` && apresRetour.fiche && /^#factures/.test(apresSuivant.hash) && /^Factures/.test(apresSuivant.titre));

        // ── C056 : fiche « Nouveau client ».
        await page.evaluate(() => { location.hash = '#clients'; });
        await attendre(1300);
        await cliquer(page, '^Créer un nouveau client$', 'button');
        await attendre(700);
        const champsClient = await page.evaluate(() => [...document.querySelectorAll('input[id^="newClientForm-"]')].map((i) => ({ id: i.id, auto: i.getAttribute('autocomplete') })));
        await page.focus('#newClientForm-email');
        await page.evaluate(() => {
            const champ = document.getElementById('newClientForm-email');
            const dt = new DataTransfer();
            dt.setData('text/plain', 'contact@client-colle.ml');
            const evt = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
            champ.dispatchEvent(evt);
            window.__collageBloque = evt.defaultPrevented;
        });
        const collageBloque = await page.evaluate(() => window.__collageBloque);
        ok(`C056 · Fiche client : remplissage automatique coupé sur les ${champsClient.length} champs d'un tiers, collage non bloqué — ${JSON.stringify(champsClient.map((c) => c.auto))} collage bloqué=${collageBloque}`,
            champsClient.length >= 7 && champsClient.every((c) => c.auto === 'off') && collageBloque === false);
        await fermerFenetre(page);

        // ── C182 : depuis la fiche d'un client.
        const client = await page.evaluate(() => (JSON.parse(localStorage.getItem('costcalc:guest:clients') || '[]')[0]) || null);
        await page.evaluate((id) => { location.hash = `#clients/${id}`; }, client?.id);
        await attendre(1500);
        await cliquer(page, '^Nouveau chantier pour ce client$');
        await attendre(700);
        const clientChantier = await page.evaluate(() => document.querySelector('[aria-label="Client du chantier"]')?.textContent.replace(/\s+/g, ' ').trim());
        ok(`C182 · « Nouveau chantier pour ce client » : client prérempli — « ${clientChantier} » (attendu « ${client?.name} »)`,
            client && clientChantier && clientChantier.includes(client.name));
        await fermerFenetre(page);

        await page.evaluate(() => { location.hash = '#chantiers'; });
        await attendre(1300);
        await cliquer(page, '^Créer un nouveau chantier$');
        await attendre(700);
        const clientParDefaut = await page.evaluate(() => document.querySelector('[aria-label="Client du chantier"]')?.textContent.replace(/\s+/g, ' ').trim());
        // Règle du code : un client UNIQUE est présélectionné (aucune
        // ambiguïté) ; à partir de deux, aucun ne l'est.
        const nbClients = await page.evaluate(() => JSON.parse(localStorage.getItem('costcalc:guest:clients') || '[]').length);
        ok(`C182 · « Nouveau chantier » depuis la liste (${nbClients} clients) : ${nbClients > 1 ? 'aucun client présélectionné' : 'le client unique présélectionné'} — « ${clientParDefaut} »`,
            nbClients > 1 ? /Choisir un client/.test(clientParDefaut || '') : (clientParDefaut || '').includes(client?.name || '§'));
        await fermerFenetre(page);

        await page.evaluate((id) => { location.hash = `#clients/${id}`; }, client?.id);
        await attendre(1500);
        await cliquer(page, `^Créer Devis pour `);
        await page.waitForFunction(() => document.body.innerText.includes('LOTS DU DEVIS'), { timeout: 10000 }).catch(() => {});
        await attendre(800);
        const clientDevis = await page.evaluate(() => {
            const champs = [...document.querySelectorAll('input, [role="combobox"], button')].filter((e) => e.getBoundingClientRect().width > 0);
            return champs.map((e) => e.value || e.textContent || '').map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
        });
        ok(`C182 · « Créer Devis » depuis le client : le devis neuf porte ce client`, client && clientDevis.some((t) => t.includes(client.name)),
            clientDevis.filter((t) => t.length < 80).slice(0, 12).join(' / '));

        // ── C202 : quatrième devis en offre Starter (essai).
        await page.evaluate(() => {
            const liste = JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]');
            const modele = liste[0];
            if (!modele) return;
            const copies = [1, 2, 3].map((i) => ({ ...modele, id: 7000 + i, serverId: null, number: `DEV-2026-70${i}` }));
            const valeur = JSON.stringify([modele, ...copies]);
            localStorage.setItem('costcalc:guest:savedQuotes', valeur);
            window.dispatchEvent(new StorageEvent('storage', { key: 'costcalc:guest:savedQuotes', newValue: valeur, storageArea: localStorage }));
        });
        await attendre(600);
        // Le chiffrage ouvert ci-dessus n'a pas été modifié : quitter ne pose pas de question.
        await page.evaluate(() => { location.hash = '#dashboard'; });
        await attendre(1300);
        await cliquer(page, '^Nouveau devis', 'aside button');
        await attendre(900);
        const msgQuota = await annonces(page);
        ok(`C202 · 4e devis en Starter : le message cite des offres qui existent — « ${msgQuota} »`,
            /Standard ou Entreprise/.test(msgQuota) && !/\bPro\b/.test(msgQuota));
        await fermerFenetre(page);

        // ── C204 : Paramètres, sans « temps réel », enregistrement dit.
        const textes = {};
        for (const rubrique of ['entreprise', 'documents', 'facturation']) {
            await page.evaluate((r) => { location.hash = `#settings/${r}`; }, rubrique);
            await attendre(1300);
            textes[rubrique] = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
        }
        const tempsReel = Object.entries(textes).filter(([, t]) => /temps réel/i.test(t)).map(([r]) => r);
        ok(`C204 · Paramètres : plus de « temps réel » annoncé — rubriques fautives : ${JSON.stringify(tempsReel)}`, tempsReel.length === 0);
        ok('C204 · Documents et Facturation (démo) : « enregistrée sur cet appareil »',
            /enregistrée sur cet appareil/.test(textes.documents) && /enregistrée sur cet appareil/.test(textes.facturation));

        // ── C215 : préférence système sombre → le panneau de métré (seul
        //    endroit qui porte des classes `dark:`) garde ses couleurs claires.
        //    On compare ces éléments-là, un par un : un relevé de toute la
        //    page capterait aussi les notifications qui s'effacent.
        await page.evaluate(() => { location.hash = '#chiffrage'; });
        await attendre(1500);
        await addCatalogItemBySearch(page, 'Peinture Murale');
        await setFirstOuvrageSurface(page, 25);
        await attendre(800);
        const releve = () => page.evaluate(() => ({
            fond: getComputedStyle(document.body).backgroundColor,
            sombres: [...document.querySelectorAll('[class*="dark:"]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => {
                const cs = getComputedStyle(e);
                return `${cs.backgroundColor}|${cs.color}|${cs.borderTopColor}`;
            })
        }));
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
        await attendre(400);
        const clair = await releve();
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
        await attendre(400);
        const sombre = await releve();
        await page.emulateMediaFeatures([]);
        const ecarts = clair.sombres.length === sombre.sombres.length
            ? clair.sombres.reduce((n, v, i) => n + (v !== sombre.sombres[i] ? 1 : 0), 0) : -1;
        ok(`C215 · Système en thème sombre : le panneau de métré garde ses couleurs (${clair.sombres.length} éléments à classes « dark: », ${ecarts} écart(s) ; fond ${clair.fond} → ${sombre.fond})`,
            clair.sombres.length > 0 && ecarts === 0 && clair.fond === sombre.fond);
    } finally {
        await navigateur.close();
        await fermerServeur();
    }
    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    console.log(`\nRejeu des contrôles corrigés : ${results.filter((r) => r.pass).length}/${results.length} contrôles passés.`);
    process.exit(results.every((r) => r.pass) ? 0 : 1);
}
