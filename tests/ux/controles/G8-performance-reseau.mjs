#!/usr/bin/env node
// Audit UX 220 contrôles (2026-10) — groupe G8 « performance & réseau ».
// Contrôles : C141 C142 C143 C144 C145 C146 C147 C148 C150 C151 C152 C153
//             C154 C156 C157 C158 C160.
//
// Tout se joue en MODE DÉMO, données fictives, comme un utilisateur : vrais
// clics (ElementHandle.click / page.click = coordonnées), vraies touches
// (page.keyboard), vraie molette (page.mouse.wheel). Les mesures viennent du
// navigateur lui-même : Event Timing (durée d'une interaction jusqu'à
// l'affichage suivant), Long Tasks, Layout Shift, LCP/FCP, Resource Timing,
// métriques CDP, et l'état réel du localStorage.
//
// ENVIRONNEMENT ISOLÉ
//   - serveur statique scratch/lib/server.mjs (127.0.0.1, port libre) ;
//   - devant lui, un petit relais local (127.0.0.1 aussi) qui : sert
//     config.example.js (URL Supabase factice) à la page ET au service worker,
//     compresse en gzip comme le ferait l'hébergeur, et permet d'injecter un
//     retard ou une coupure sur un fichier précis (lenteur / échec / hors ligne) ;
//   - interception Puppeteer : toute requête vers un autre hôte que
//     127.0.0.1/localhost est BLOQUÉE et consignée ;
//   - téléchargements refusés (Browser.setDownloadBehavior = deny) : le PDF
//     généré n'est jamais écrit sur disque ;
//   - chaque scénario part d'un contexte de navigation NEUF (stockage, cache et
//     service worker vierges) — mêmes conditions d'un essai à l'autre (C150).
//
// Lancer :  node tests/ux/controles/G8-performance-reseau.mjs            (tout)
//           node tests/ux/controles/G8-performance-reseau.mjs S6 S11     (scénarios choisis)
// Sorties : lignes PASS/FAIL sur la console, captures + mesures.json dans
//           docs/audit-ux-220/UX_EVIDENCE/G8-performance-reseau/.
import puppeteer, { PredefinedNetworkConditions } from 'puppeteer';
import http from 'node:http';
import zlib from 'node:zlib';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from '../../../scratch/lib/server.mjs';

const RACINE = fileURLToPath(new URL('../../../', import.meta.url));
const CONFIG = await readFile(new URL('../../../config.example.js', import.meta.url), 'utf8');
const PREUVES = path.join(RACINE, 'docs/audit-ux-220/UX_EVIDENCE/G8-performance-reseau');
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

const ROUTES = ['#dashboard', '#chantiers', '#clients', '#chiffrage', '#devis', '#factures',
    '#depenses', '#ouvrages', '#materiaux', '#abonnement', '#settings/entreprise'];

const vue = (w, h, dpr) => ({ nom: `${w}x${h}@${dpr}x`, width: w, height: h, deviceScaleFactor: dpr, isMobile: w < 768, hasTouch: w < 768 });
const BUREAU = vue(1440, 900, 1);
const MOBILE = vue(390, 844, 3);

// Seuils retenus (consignés dans mesures.json) — repères publics, pas des
// préférences : Core Web Vitals (LCP ≤ 2,5 s « bon », > 4 s « mauvais » ;
// INP ≤ 200 ms ; CLS ≤ 0,1) et limites de Nielsen (0,1 s : réponse
// instantanée ; 1 s : le fil de la pensée n'est pas rompu).
const SEUILS = {
    lcpBonMs: 2500, lcpMauvaisMs: 4000, inpMs: 200, retourVisibleMs: 100, ecranMs: 1000,
    cls: 0.1, figementMs: 200, ecartRepetabilite: 0.30, ecartRepetabiliteAbsMs: 120
};

// ─── Instrumentation injectée dans chaque document ───────────────────────
function INSTRUMENTATION() {
    const P = window.__perf = { ls: [], lt: [], ev: [], lcp: [], paint: [], mut: [], toasts: [], marques: {} };
    const obs = (type, fn, extra) => {
        try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe(Object.assign({ type, buffered: true }, extra || {})); } catch (e) { /* type non géré */ }
    };
    const decrire = (n) => {
        if (!n) return '';
        const el = n.nodeType === 1 ? n : n.parentElement;
        if (!el) return String(n.nodeName);
        return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').split(/\s+/).slice(0, 3).join('.')} «${(el.innerText || '').replace(/\s+/g, ' ').slice(0, 40)}»`;
    };
    obs('layout-shift', (e) => P.ls.push({ t: e.startTime, v: e.value, input: e.hadRecentInput, src: (e.sources || []).slice(0, 3).map((s) => decrire(s.node)) }));
    obs('longtask', (e) => P.lt.push({ t: e.startTime, d: e.duration }));
    obs('event', (e) => P.ev.push({ n: e.name, t: e.startTime, d: e.duration, attente: e.processingStart - e.startTime, id: e.interactionId || 0 }), { durationThreshold: 16 });
    obs('largest-contentful-paint', (e) => P.lcp.push({ t: e.startTime, taille: e.size, el: decrire(e.element) }));
    obs('paint', (e) => P.paint.push({ n: e.name, t: e.startTime }));
    addEventListener('pointerdown', (e) => { P.dernierPointer = e.timeStamp; }, true);
    addEventListener('keydown', (e) => { P.dernierClavier = e.timeStamp; }, true);
    const surveiller = () => new MutationObserver((liste) => {
        const t = performance.now();
        if (P.mut.length < 50000) P.mut.push(t);
        if (!P.marques.connexion) {
            const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Essayer sans compte');
            if (b) P.marques.connexion = t;
        }
        for (const m of liste) for (const n of m.addedNodes) {
            if (n.nodeType === 1 && /animate-slide-up/.test(String(n.className)) && n.getAttribute('role')) {
                P.toasts.push({ t, role: n.getAttribute('role'), texte: (n.innerText || '').replace(/\s+/g, ' ').trim() });
            }
        }
    }).observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
    // Observé sur le Document lui-même : à l'injection, <html> n'existe pas encore.
    surveiller();
    // Long Animation Frames (tamponnés) : relevé de secours des blocages, y
    // compris ceux du démarrage, enregistré une fois le document en place.
    P.loaf = [];
    addEventListener('DOMContentLoaded', () => obs('long-animation-frame', (e) => P.loaf.push({ t: e.startTime, d: e.duration, bloquant: e.blockingDuration })));
}

// ─── Relais local : compression, retards, coupures, hors ligne ────────────
function demarrerRelais(origine) {
    const regles = { retards: [], coupures: [], horsLigne: false, swAbsent: true };
    const journal = [];
    const cacheGzip = new Map();
    const TEXTE = /\.(html|js|mjs|css|json|svg|webmanifest)$/;
    const serveur = http.createServer((req, res) => {
        const chemin = decodeURIComponent(req.url.split('?')[0]);
        const dest = req.headers['sec-fetch-dest'] || '';
        const entree = { t: Date.now(), chemin, dest, sw: Boolean(req.headers['service-worker']) };
        journal.push(entree);
        const repondre = () => {
            if (regles.horsLigne || regles.coupures.some((f) => f(chemin, dest))) { entree.statut = 'coupé'; req.socket.destroy(); return; }
            if (chemin === '/config.js') {
                res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
                res.end(CONFIG); entree.statut = 200; entree.octets = CONFIG.length; return;
            }
            if (chemin === '/sw.js' && regles.swAbsent) { res.writeHead(404); res.end(); entree.statut = 404; return; }
            http.get(origine + req.url, (amont) => {
                const morceaux = [];
                amont.on('data', (c) => morceaux.push(c));
                amont.on('end', () => {
                    let corps = Buffer.concat(morceaux);
                    const entetes = { 'Content-Type': amont.headers['content-type'] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
                    if (amont.statusCode === 200 && TEXTE.test(chemin) && /gzip/.test(req.headers['accept-encoding'] || '')) {
                        const cle = chemin + ':' + corps.length;
                        if (!cacheGzip.has(cle)) cacheGzip.set(cle, zlib.gzipSync(corps, { level: 6 }));
                        corps = cacheGzip.get(cle);
                        entetes['Content-Encoding'] = 'gzip';
                    }
                    entetes['Content-Length'] = corps.length;
                    res.writeHead(amont.statusCode, entetes);
                    res.end(corps);
                    entree.statut = amont.statusCode; entree.octets = corps.length;
                });
            }).on('error', () => { res.writeHead(502); res.end(); entree.statut = 502; });
        };
        const delai = regles.retards.reduce((m, r) => Math.max(m, r(chemin, dest) || 0), 0);
        entree.retard = delai;
        if (delai) setTimeout(repondre, delai); else repondre();
    });
    return new Promise((resolve) => serveur.listen(0, '127.0.0.1', () => resolve({
        url: `http://127.0.0.1:${serveur.address().port}`, regles, journal,
        reinitialiser() { regles.retards = []; regles.coupures = []; regles.horsLigne = false; regles.swAbsent = true; },
        fermer: () => new Promise((r) => { serveur.closeAllConnections?.(); serveur.close(r); })
    })));
}

// ─── Pages et gestes ─────────────────────────────────────────────────────
async function ouvrirPage(env, vp, { cpu = 1, reseau = null, contexte = null } = {}) {
    const ctx = contexte || await env.nav.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport(vp);
    if (cpu > 1) await page.emulateCPUThrottling(cpu);
    if (reseau) await page.emulateNetworkConditions(reseau);
    await page.evaluateOnNewDocument(INSTRUMENTATION);
    const suivi = { externes: [], requetes: [], erreurs: [], navigations: [] };
    await page.setRequestInterception(true);
    page.on('request', (r) => {
        const u = new URL(r.url());
        suivi.requetes.push({ t: Date.now(), chemin: u.pathname, hote: u.hostname, type: r.resourceType() });
        if (u.pathname === '/config.js') return r.respond({ contentType: 'application/javascript', body: CONFIG });
        if (/^https?:$/.test(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname)) { suivi.externes.push(u.hostname); return r.abort(); }
        return r.continue();
    });
    page.on('console', (m) => { if (m.type() === 'error') suivi.erreurs.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => suivi.erreurs.push('pageerror: ' + String(e).slice(0, 200)));
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) suivi.navigations.push({ t: Date.now(), url: f.url() }); });
    try {
        const cdp = await env.nav.target().createCDPSession();
        await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny', ...(ctx.id ? { browserContextId: ctx.id } : {}) });
        await cdp.detach();
    } catch (e) { /* pas de contexte dédié */ }
    return { page, ctx, suivi };
}

const boutonVisible = (page, predicat, arg) => page.evaluateHandle((src, a) => {
    const f = new Function('b', 'a', `return (${src})(b, a);`);
    return [...document.querySelectorAll('button, [role="button"], [role="option"], a, tbody tr, label')]
        .filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
        .find((x) => f(x, a)) || null;
}, predicat.toString(), arg);

async function cliquer(page, predicat, arg) {
    const h = await boutonVisible(page, predicat, arg);
    const el = h.asElement();
    if (!el) throw new Error(`Élément introuvable : ${predicat.toString().slice(0, 100)} ${arg ?? ''}`);
    await el.click();
    return el;
}
const parNom = (b, re) => [b.getAttribute('aria-label') || '', b.innerText || ''].some((t) => new RegExp(re).test(t.replace(/\s+/g, ' ').trim()));
let ETAPE = '';
const pas = (nom) => { ETAPE = nom; };
const texteExact = (b, t) => (b.innerText || '').trim() === t;

async function allerA(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendre(1300); }

async function entrerEnDemo(page, { delaiMax = 30000 } = {}) {
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Essayer sans compte'), { timeout: delaiMax });
    await cliquer(page, texteExact, 'Essayer sans compte');
    const r = await mesurerJusqua(page, () => { const h = document.querySelector('h1'); return h && /Espace|Tableau de bord/.test(h.innerText) && !document.querySelector('.animate-page-spin'); }, { depuis: 'pointer', delaiMax });
    await attendre(1000);
    return r;
}

// Attend une condition DANS la page et renvoie le délai depuis le dernier
// geste réel (pointerdown/keydown capturés) ou depuis maintenant.
async function mesurerJusqua(page, condition, { depuis = 'maintenant', delaiMax = 15000 } = {}) {
    return page.evaluate(async (src, origine, max) => {
        const cond = new Function(`return (${src})();`);
        const P = window.__perf;
        const debut = origine === 'pointer' ? (P.dernierPointer ?? performance.now())
            : origine === 'clavier' ? (P.dernierClavier ?? performance.now()) : performance.now();
        const limite = performance.now() + max;
        while (performance.now() < limite) {
            let ok = false;
            try { ok = cond(); } catch (e) { ok = false; }
            if (ok) return { ok: true, ms: Math.round(performance.now() - debut) };
            await new Promise((r) => setTimeout(r, 8));
        }
        return { ok: false, ms: Math.round(performance.now() - debut) };
    }, condition.toString(), depuis, delaiMax);
}

async function allerMesure(page, hash, fenetre = 1500) {
    return page.evaluate(async (h, fen) => {
        const P = window.__perf;
        const t0 = performance.now();
        const nLs = P.ls.length, nLt = P.lt.length;
        location.hash = h;
        let vuSpinner = false, tContenu = null;
        while (performance.now() - t0 < 10000) {
            const sp = document.querySelector('.animate-page-spin');
            if (sp) vuSpinner = true;
            if ((vuSpinner || performance.now() - t0 > 700) && !sp && document.querySelector('.animate-page-enter')) { tContenu = performance.now(); break; }
            await new Promise((r) => requestAnimationFrame(r));
        }
        await new Promise((r) => setTimeout(r, fen));
        const ls = P.ls.slice(nLs).filter((x) => !x.input && x.t >= t0);
        return {
            ms: tContenu === null ? null : Math.round(tContenu - t0), spinner: vuSpinner,
            cls: +ls.reduce((s, x) => s + x.v, 0).toFixed(4),
            decalages: ls.sort((a, b) => b.v - a.v).slice(0, 3).map((x) => ({ v: +x.v.toFixed(4), src: x.src })),
            longues: P.lt.slice(nLt).filter((x) => x.t >= t0 - 1).map((x) => Math.round(x.d)),
            h1: (document.querySelector('h1')?.innerText || '').slice(0, 40)
        };
    }, hash, fenetre);
}

const marque = (page) => page.evaluate(() => {
    const P = window.__perf;
    return { t: performance.now(), ev: P.ev.length, lt: P.lt.length, mut: P.mut.length, ls: P.ls.length, toasts: P.toasts.length };
});
const bilan = (page, m) => page.evaluate((m0) => {
    const P = window.__perf;
    const ev = P.ev.slice(m0.ev);
    const parId = {};
    for (const e of ev) if (e.id) parId[e.id] = Math.max(parId[e.id] || 0, e.d);
    const durees = Object.values(parId);
    return {
        inpMax: durees.length ? Math.round(Math.max(...durees)) : 0, // 0 = toutes < 16 ms (seuil Event Timing)
        interactionsMesurees: durees.length,
        attenteMax: ev.length ? Math.round(Math.max(...ev.map((e) => e.attente))) : 0,
        longues: P.lt.slice(m0.lt).map((l) => Math.round(l.d)),
        cls: +P.ls.slice(m0.ls).filter((x) => !x.input).reduce((s, x) => s + x.v, 0).toFixed(4),
        toasts: P.toasts.slice(m0.toasts)
    };
}, m);
// Premier changement du DOM après le dernier geste réel.
const retourVisible = (page, origine = 'pointer') => page.evaluate((o) => {
    const P = window.__perf;
    const t = o === 'pointer' ? P.dernierPointer : P.dernierClavier;
    const m = P.mut.find((x) => x > t);
    return m === undefined ? null : Math.round(m - t);
}, origine);

async function demarrerImages(page) {
    await page.evaluate(() => {
        window.__frames = []; window.__framesOn = true;
        const boucle = (t) => { if (!window.__framesOn) return; window.__frames.push(t); requestAnimationFrame(boucle); };
        requestAnimationFrame(boucle);
    });
}
async function arreterImages(page) {
    return page.evaluate(() => {
        window.__framesOn = false;
        const f = window.__frames;
        const ecarts = f.slice(1).map((t, i) => t - f[i]).sort((a, b) => a - b);
        return {
            images: f.length, ecartMax: Math.round(ecarts.at(-1) || 0),
            ecartP95: Math.round(ecarts[Math.floor(ecarts.length * 0.95)] || 0)
        };
    });
}

async function capture(page, nom) {
    const fichier = path.join(PREUVES, nom + '.png');
    try { await page.screenshot({ path: fichier }); } catch (e) { return null; }
    return path.relative(RACINE, fichier);
}

// Champs : saisie au clavier réel après un vrai clic.
async function taper(page, selecteur, texte, delai = 70) {
    const el = await page.waitForSelector(selecteur, { visible: true, timeout: 10000 });
    await el.click({ count: 3 });
    await page.keyboard.press('Backspace');
    await page.keyboard.type(texte, { delay: delai });
    return el;
}

async function creerClient(page, nom) {
    await allerA(page, '#clients');
    await cliquer(page, parNom, '^(Créer un nouveau client|Nouveau client)');
    await page.waitForSelector('#newClientForm-name', { visible: true, timeout: 8000 });
    await page.click('#newClientForm-name');
    await page.keyboard.type(nom, { delay: 20 });
    await cliquer(page, parNom, '^Créer le client');
    await attendre(1200);
}

// Ajoute l'ouvrage « Peinture Murale » au devis ouvert, au clavier et à la
// souris, quelle que soit la mise en page (barre de recherche sur ordinateur,
// feuille catalogue sur téléphone). Renvoie les délais mesurés.
async function ajouterOuvrage(page, delai = 90) {
    const champBureau = 'input[aria-label="Rechercher un ouvrage à ajouter"]';
    const bureau = await page.evaluate((sel) => (document.querySelector(sel)?.getBoundingClientRect().width || 0) > 0, champBureau);
    let suggestions;
    if (bureau) {
        await page.click(champBureau, { count: 3 });
        await page.keyboard.press('Backspace');
        await page.keyboard.type('Peinture', { delay: delai });
        suggestions = await mesurerJusqua(page, () => [...document.querySelectorAll('[role="option"]')].some((o) => /Peinture/.test(o.innerText)), { depuis: 'clavier' });
        await page.keyboard.press('Enter');
    } else {
        await cliquer(page, parNom, '^(Ajouter mon premier ouvrage|Ajouter un ouvrage au lot|Ajouter un ouvrage)$');
        const champ = 'input[placeholder^="Rechercher un ouvrage par nom, matériau"]';
        await page.waitForSelector(champ, { visible: true, timeout: 8000 });
        await page.click(champ);
        await page.keyboard.type('Peinture', { delay: delai });
        suggestions = await mesurerJusqua(page, () => {
            const b = [...document.querySelectorAll('button')].filter((x) => x.innerText.trim() === 'Ajouter' && x.getBoundingClientRect().width > 0);
            return b.length > 0 && b.every((x) => /Peinture/.test(x.closest('div')?.parentElement?.innerText || ''));
        }, { depuis: 'clavier' });
        await cliquer(page, (b) => b.innerText.trim() === 'Ajouter' && /Peinture Murale/.test(b.closest('div')?.parentElement?.innerText || ''));
    }
    const ajout = await mesurerJusqua(page, () => (document.querySelector('input[aria-label="Surface directe (m²)"]')?.getBoundingClientRect().width || 0) > 0, { depuis: bureau ? 'clavier' : 'pointer' });
    return { bureau, suggestionsMs: suggestions.ms, ajoutMs: ajout.ms, ajoutOk: ajout.ok };
}
const PRIX_HT = /Prix de Vente Total HT :\s*([\d\s\u00a0\u202f]+)\s*FCFA/;
const lirePrixHT = (page) => page.evaluate((src) => {
    const m = document.body.innerText.match(new RegExp(src));
    return m ? Number(m[1].replace(/[^\d]/g, '')) : null;
}, PRIX_HT.source);

// Nouveau devis : un ouvrage « Peinture », métré 120 m², quantités confirmées, enregistré.
async function creerDevis(page, { surface = '120' } = {}) {
    const surBureau = await page.evaluate(() => innerWidth >= 1024);
    if (surBureau) {
        await cliquer(page, (b) => b.closest('aside') && (b.innerText || '').trim().startsWith('Nouveau devis'));
        await attendre(1300);
    } else {
        await allerA(page, '#chiffrage');
    }
    const a = await ajouterOuvrage(page, 30);
    if (!a.ajoutOk) throw new Error('Ouvrage non ajouté (champ « Surface directe » absent)');
    await taper(page, 'input[aria-label="Surface directe (m²)"]', surface, 30);
    await attendre(400);
    await cliquer(page, parNom, '^Confirmer mes quantités');
    await attendre(500);
    await cliquer(page, (b) => /^Enregistrer/.test((b.innerText || '').trim()) && !/règlement/i.test(b.innerText));
    await attendre(1500);
}

const lireLS = (page, cle) => page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return 'illisible'; } }, cle);
const toastsDepuis = (page, n = 0) => page.evaluate((i) => window.__perf.toasts.slice(i), n);

// ═══ S1 — Chargement, entrée en démo, changement d'écran (C141, C143, C146, C150)
async function sChargement(env, vp, cpu, rep) {
    const { page, ctx, suivi } = await ouvrirPage(env, vp, { cpu });
    try {
        await page.goto(env.base + '/index.html', { waitUntil: 'load', timeout: 60000 });
        await page.waitForFunction(() => window.__perf.marques.connexion, { timeout: 30000 });
        await attendre(800);
        const boot = await page.evaluate(() => {
            const P = window.__perf;
            const nav = performance.getEntriesByType('navigation')[0];
            const res = performance.getEntriesByType('resource');
            const tc = P.marques.connexion;
            return {
                fcp: Math.round(P.paint.find((p) => p.n === 'first-contentful-paint')?.t ?? -1),
                lcp: Math.round(P.lcp.at(-1)?.t ?? -1), lcpEl: P.lcp.at(-1)?.el,
                ecranAcces: Math.round(tc), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd),
                tbt: Math.round(P.lt.filter((l) => l.t < tc + 50).reduce((s, l) => s + Math.max(0, l.d - 50), 0)),
                longues: P.lt.filter((l) => l.t < tc + 50).map((l) => Math.round(l.d)),
                loafBloquantMs: Math.round((P.loaf || []).filter((l) => l.t < tc + 50).reduce((s, l) => s + l.bloquant, 0)),
                loaf: (P.loaf || []).filter((l) => l.t < tc + 50).map((l) => `${Math.round(l.d)}/${Math.round(l.bloquant)}`),
                cls: +P.ls.filter((x) => !x.input).reduce((s, x) => s + x.v, 0).toFixed(4),
                octetsTransferes: res.reduce((s, r) => s + (r.transferSize || 0), 0) + (nav.transferSize || 0),
                octetsDecodes: res.reduce((s, r) => s + (r.decodedBodySize || 0), 0) + (nav.decodedBodySize || 0),
                bloquantsTete: res.filter((r) => r.renderBlockingStatus === 'blocking').map((r) => r.name.split('/').pop().split('?')[0])
            };
        });
        const entree = await entrerEnDemo(page);
        const routes = [];
        for (const r of ROUTES) routes.push({ route: r, ...(await allerMesure(page, r)) });
        if (rep === 1) await capture(page, `S1_${vp.nom}_settings`);
        return {
            vp: vp.nom, cpu, rep, boot, entreeDemoMs: entree.ms, routes, documentsCharges: suivi.navigations.length,
            libsPdfDemandees: suivi.requetes.filter((q) => /html2canvas|jspdf/.test(q.chemin)).map((q) => q.chemin),
            externes: [...new Set(suivi.externes)],
            erreurs: suivi.erreurs.filter((e) => !/sw\.js|ServiceWorker|service worker|404/.test(e))
        };
    } finally { await ctx.close(); }
}

// ═══ S2 — Stabilité de la mise en page aux autres largeurs (C143)
async function sLargeurs(env, vp) {
    const { page, ctx } = await ouvrirPage(env, vp);
    try {
        await page.goto(env.base + '/index.html', { waitUntil: 'load', timeout: 60000 });
        await page.waitForFunction(() => window.__perf.marques.connexion, { timeout: 30000 });
        await attendre(600);
        const clsAcces = await page.evaluate(() => +window.__perf.ls.filter((x) => !x.input).reduce((s, x) => s + x.v, 0).toFixed(4));
        await entrerEnDemo(page);
        const routes = [];
        for (const r of ROUTES) routes.push({ route: r, ...(await allerMesure(page, r)) });
        return { vp: vp.nom, clsAcces, routes: routes.map((r) => ({ route: r.route, cls: r.cls, decalages: r.decalages, ms: r.ms })) };
    } finally { await ctx.close(); }
}

// ═══ S3 — Réactivité des interactions et stabilité des contrôles (C142, C143)
async function sInteractions(env, vp, cpu) {
    const { page, ctx } = await ouvrirPage(env, vp, { cpu });
    const out = { vp: vp.nom, cpu };
    try {
        await page.goto(env.base + '/index.html', { waitUntil: 'load', timeout: 60000 });
        await entrerEnDemo(page);
        const bureau = vp.width >= 1024;

        // 1) Clic de navigation : retour visible et écran affiché.
        pas('S3 navigation');
        let m = await marque(page);
        if (bureau) await cliquer(page, (b) => b.closest('aside') && (b.innerText || '').trim() === 'Clients');
        else await cliquer(page, (b) => b.closest('.mobile-bottom-nav, nav') && (b.innerText || '').trim() === 'Devis' && b.getBoundingClientRect().top > innerHeight - 120);
        const ecran = await mesurerJusqua(page, () => !document.querySelector('.animate-page-spin') && /Clients|Mes devis/.test(document.querySelector('h1')?.innerText || ''), { depuis: 'pointer' });
        out.navigation = { retourMs: await retourVisible(page), ecranMs: ecran.ms, ...(await bilan(page, m)) };
        await attendre(800);
        if (!bureau) await allerA(page, '#clients');

        // 2) Recherche client : frappe réelle, position des contrôles avant/après.
        pas('S3 recherche client');
        const rects = () => page.evaluate(() => {
            const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
            const champ = document.querySelector('input[aria-label="Rechercher un client"], input[placeholder^="Rechercher un client"]');
            const bouton = [...document.querySelectorAll('button')].find((b) => /^(Créer un nouveau client|Nouveau client)/.test(b.getAttribute('aria-label') || b.innerText.trim()));
            return { champ: r(champ), bouton: r(bouton) };
        });
        const avant = await rects();
        m = await marque(page);
        await page.click('input[aria-label="Rechercher un client"], input[placeholder^="Rechercher un client"]');
        await page.keyboard.type('Société', { delay: 90 });
        await attendre(400);
        const pendant = await rects();
        await page.keyboard.type(' zzz', { delay: 90 }); // aucun résultat : liste vidée
        await attendre(400);
        const vide = await rects();
        out.rechercheClient = { ...(await bilan(page, m)), avant, pendant, vide };
        await page.click('input[aria-label="Rechercher un client"], input[placeholder^="Rechercher un client"]', { count: 3 });
        await page.keyboard.press('Backspace');
        await attendre(400);

        // 3) Ouverture de « Nouveau client » et saisie du nom.
        pas('S3 nouveau client');
        m = await marque(page);
        await cliquer(page, parNom, '^(Créer un nouveau client|Nouveau client)');
        const dialogue = await mesurerJusqua(page, () => document.querySelector('#newClientForm-name')?.getBoundingClientRect().width > 0, { depuis: 'pointer' });
        const retourDialogue = await retourVisible(page);
        await page.click('#newClientForm-name');
        await page.keyboard.type('Client Réactivité', { delay: 90 });
        out.nouveauClient = { dialogueMs: dialogue.ms, retourMs: retourDialogue, ...(await bilan(page, m)) };
        await page.keyboard.press('Escape');
        await attendre(800);

        // 4) Chiffrage : recherche d'ouvrage, ajout, métré → totaux.
        pas('S3 chiffrage');
        if (bureau) await cliquer(page, (b) => b.closest('aside') && (b.innerText || '').trim().startsWith('Nouveau devis'));
        else await allerA(page, '#chiffrage');
        await attendre(1400);
        m = await marque(page);
        const ajoutO = await ajouterOuvrage(page);
        out.ajoutOuvrage = { ...ajoutO, ...(await bilan(page, m)) };
        await attendre(600);

        const boutonEnregistrer = () => page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].filter((x) => x.getBoundingClientRect().width > 0)
                .find((x) => /^Enregistrer/.test((x.innerText || '').trim()) && !/règlement/i.test(x.innerText));
            if (!b) return null;
            const r = b.getBoundingClientRect();
            return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
        });
        const enregAvant = await boutonEnregistrer();
        const htAvant = await lirePrixHT(page);
        m = await marque(page);
        await page.click('input[aria-label="Surface directe (m²)"]');
        await page.keyboard.type('1');
        // Délai entre UNE touche et l'affichage du prix recalculé.
        const recalcul = await page.evaluate(async (src) => {
            const P = window.__perf; const r = new RegExp(src); const t0 = P.dernierClavier;
            while (performance.now() - t0 < 3000) {
                const x = document.body.innerText.match(r);
                if (x && Number(x[1].replace(/[^\d]/g, '')) > 0) return Math.round(performance.now() - t0);
                await new Promise((res) => setTimeout(res, 5));
            }
            return null;
        }, PRIX_HT.source);
        await page.keyboard.type('20', { delay: 90 });
        await attendre(400);
        const enreg120 = await boutonEnregistrer();
        await page.keyboard.type('0000', { delay: 90 }); // 1 200 000 m² : montants beaucoup plus longs
        await attendre(500);
        const enregGrand = await boutonEnregistrer();
        out.metre = { totalApresDerniereToucheMs: recalcul, htAvant, htApres: await lirePrixHT(page), enregAvant, enreg120, enregGrand, ...(await bilan(page, m)) };
        await capture(page, `S3_${vp.nom}_chiffrage_1200000m2`);

        // 5) Confirmer puis Enregistrer : retour visible.
        pas('S3 enregistrer');
        await page.click('input[aria-label="Surface directe (m²)"]', { count: 3 });
        await page.keyboard.type('120', { delay: 40 });
        await attendre(400);
        await cliquer(page, parNom, '^Confirmer mes quantités');
        await attendre(600);
        m = await marque(page);
        await cliquer(page, (b) => /^Enregistrer/.test((b.innerText || '').trim()) && !/règlement/i.test(b.innerText));
        const toast = await mesurerJusqua(page, () => window.__perf.toasts.some((x) => /enregistr/i.test(x.texte)), { depuis: 'pointer' });
        out.enregistrer = { toastMs: toast.ms, retourMs: await retourVisible(page), ...(await bilan(page, m)) };
        out.toastPosition = await page.evaluate(() => {
            const t = document.querySelector('.animate-slide-up[role]');
            return t ? getComputedStyle(t).position : null;
        });
        return out;
    } finally { await ctx.close(); }
}

// ═══ S4 — Listes longues, recherches, ordre des résultats (C144, C147, C157)
const NB_DEVIS = 600, NB_CLIENTS = 800;
async function semerVolume(page) {
    await page.evaluate((nq, nc) => {
        const devis = JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]');
        const clients = JSON.parse(localStorage.getItem('costcalc:guest:clients') || '[]');
        const gabaritD = devis[0], gabaritC = clients[0];
        const outD = [...devis];
        for (let i = 1; i <= nq; i++) {
            const q = JSON.parse(JSON.stringify(gabaritD));
            q.id = 'vol_q' + i; q.number = 'DEV-2025-' + String(i).padStart(3, '0');
            q.clientName = 'Client Volume ' + i; q.projectRef = 'Chantier Volume ' + i;
            outD.push(q);
        }
        const outC = [...clients];
        for (let i = 1; i <= nc; i++) outC.push({ ...gabaritC, id: 'vol_c' + i, name: 'Client Volume ' + i, email: '', phone: '' });
        localStorage.setItem('costcalc:guest:savedQuotes', JSON.stringify(outD));
        localStorage.setItem('costcalc:guest:clients', JSON.stringify(outC));
    }, NB_DEVIS, NB_CLIENTS);
}
async function compteurs(page) {
    await page.evaluate(() => {
        window.__appels = { calculateHybridQuote: 0, finance: 0 };
        const orig = window.calculateHybridQuote;
        if (typeof orig === 'function' && !orig.__compte) {
            const w = function (...a) { window.__appels.calculateHybridQuote++; return orig.apply(this, a); };
            w.__compte = true; window.calculateHybridQuote = w;
        }
        const F = window.FinanceCore;
        if (F && !F.__compte) {
            for (const k of Object.keys(F)) if (typeof F[k] === 'function') { const o = F[k]; F[k] = function (...a) { window.__appels.finance++; return o.apply(this, a); }; }
            F.__compte = true;
        }
    });
}
const lireAppels = (page) => page.evaluate(() => ({ ...window.__appels }));
async function zoneDefilante(page, selecteurLigne) {
    return page.evaluateHandle((sel) => {
        let el = document.querySelector(sel);
        while (el && el !== document.body) {
            const cs = getComputedStyle(el);
            if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) return el;
            el = el.parentElement;
        }
        return document.scrollingElement;
    }, selecteurLigne);
}
async function essaiDefilement(page, selecteurLigne) {
    const zone = (await zoneDefilante(page, selecteurLigne)).asElement();
    const box = await zone.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 300));
    const m = await marque(page);
    const avant = await zone.evaluate((z) => ({ top: z.scrollTop, max: z.scrollHeight - z.clientHeight }));
    await demarrerImages(page);
    for (let i = 0; i < 14; i++) { await page.mouse.wheel({ deltaY: 600 }); await attendre(60); }
    await attendre(700);
    const images = await arreterImages(page);
    const apres = await zone.evaluate((z) => ({ top: z.scrollTop, max: z.scrollHeight - z.clientHeight }));
    const b = await bilan(page, m);
    return { avant, apres, ...images, longues: b.longues };
}
async function essaiRecherche(page, selecteurChamp, requete, verifier, env) {
    const nReq = env.relais.journal.length;
    const nReqPage = 0;
    const metA = await page.metrics();
    const appelsA = await lireAppels(page);
    const m = await marque(page);
    await page.click(selecteurChamp, { count: 3 });
    await page.keyboard.press('Backspace');
    await page.keyboard.type(requete, { delay: 70 });
    await attendre(900);
    const b = await bilan(page, m);
    const metB = await page.metrics();
    const appelsB = await lireAppels(page);
    const coherent = verifier ? await page.evaluate(verifier, requete) : null;
    return {
        requete, inpMax: b.inpMax, interactionsLentes: b.interactionsMesurees, longues: b.longues,
        requetesReseau: env.relais.journal.slice(nReq).map((j) => j.chemin), nReqPage,
        scriptMsParTouche: Math.round(((metB.ScriptDuration - metA.ScriptDuration) * 1000) / requete.length),
        calculsDevis: appelsB.calculateHybridQuote - appelsA.calculateHybridQuote,
        appelsFinance: appelsB.finance - appelsA.finance,
        coherent
    };
}
async function sVolume(env, vp, cpu) {
    const { page, ctx, suivi } = await ouvrirPage(env, vp, { cpu });
    const out = { vp: vp.nom, cpu, nbDevis: NB_DEVIS, nbClients: NB_CLIENTS };
    try {
        await page.goto(env.base + '/index.html', { waitUntil: 'load', timeout: 60000 });
        await entrerEnDemo(page);
        await semerVolume(page);
        await page.reload({ waitUntil: 'load' });
        await entrerEnDemo(page);
        await compteurs(page);
        const nReqPageDebut = suivi.requetes.length;

        out.ecranDevis = await allerMesure(page, '#devis');
        out.lignesDevis = await page.evaluate(() => document.querySelectorAll('tbody tr, [data-testid="saved-quotes-list"] li').length);
        out.defilementDevis = await essaiDefilement(page, 'tbody tr, [data-testid="saved-quotes-list"] li');
        const champDevis = 'input[aria-label="Rechercher dans les devis"]';
        const lignesCorrespondent = (req) => {
            const lignes = [...document.querySelectorAll('tbody tr')].filter((r) => r.getBoundingClientRect().height > 0);
            const norm = (s) => s.toLowerCase();
            return { n: lignes.length, toutes: lignes.length > 0 && lignes.every((r) => norm(r.innerText).includes(norm(req))) };
        };
        out.rechercheDevis = await essaiRecherche(page, champDevis, 'Volume 59', lignesCorrespondent, env);
        // C157 (analogue local) : saisie rapide puis correction immédiate.
        await page.click(champDevis, { count: 3 });
        await page.keyboard.type('DEV-2025-3', { delay: 5 });
        await page.keyboard.press('Backspace');
        await page.keyboard.type('41', { delay: 5 });
        await attendre(900);
        out.correctionRapideDevis = { valeur: await page.$eval(champDevis, (e) => e.value), ...(await page.evaluate(lignesCorrespondent, 'DEV-2025-41')) };
        await page.click(champDevis, { count: 3 });
        await page.keyboard.press('Backspace');
        await attendre(600);

        out.ecranClients = await allerMesure(page, '#clients');
        out.lignesClients = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /^Sélectionner /.test(b.getAttribute('aria-label') || '')).length);
        out.defilementClients = await essaiDefilement(page, 'button[aria-label^="Sélectionner "]');
        const champClients = 'input[aria-label="Rechercher un client"], input[placeholder^="Rechercher un client"]';
        const clientsCorrespondent = (req) => {
            const l = [...document.querySelectorAll('button')].filter((b) => /^Sélectionner /.test(b.getAttribute('aria-label') || '') && b.getBoundingClientRect().height > 0);
            return { n: l.length, toutes: l.length > 0 && l.every((b) => b.getAttribute('aria-label').toLowerCase().includes(req.toLowerCase())) };
        };
        out.rechercheClients = await essaiRecherche(page, champClients, 'Volume 77', clientsCorrespondent, env);
        await page.click(champClients, { count: 3 });
        await page.keyboard.type('Volume 1', { delay: 5 });
        await page.keyboard.press('Backspace');
        await page.keyboard.type('2', { delay: 5 });
        await attendre(900);
        out.correctionRapideClients = { valeur: await page.$eval(champClients, (e) => e.value), ...(await page.evaluate(clientsCorrespondent, 'Volume 2')) };

        if (vp.width >= 1024) {
            out.rechercheGlobale = await essaiRecherche(page, 'input[aria-label="Recherche globale dans ikadevis"]', 'Volume 12', (req) => {
                const t = document.body.innerText; return { contient: t.includes('Client Volume 12') || t.includes(req) };
            }, env);
            await page.keyboard.press('Escape');
            await attendre(500);
        }
        await allerA(page, '#ouvrages');
        const champOuvrage = await page.evaluate(() => {
            const i = [...document.querySelectorAll('input')].find((x) => x.getBoundingClientRect().width > 0 && /Rechercher/.test(x.placeholder || '') && !/ikadevis/.test(x.placeholder));
            if (!i) return null; i.setAttribute('data-sonde-g8', 'ouvrage'); return i.placeholder;
        });
        if (champOuvrage) out.rechercheOuvrages = { placeholder: champOuvrage, ...(await essaiRecherche(page, 'input[data-sonde-g8="ouvrage"]', 'Béton', null, env)) };
        out.requetesPageHorsDemarrage = suivi.requetes.slice(nReqPageDebut).map((q) => q.chemin).filter((c) => !/\.(woff2|png|svg)$/.test(c));
        out.externes = [...new Set(suivi.externes)];
        await capture(page, `S4_${vp.nom}_ouvrages_recherche`);
        return out;
    } finally { await ctx.close(); }
}

// ═══ S5 — Images : dimension et poids selon l'usage (C145)
function inventaireImages() {
    const dpr = devicePixelRatio;
    const ressources = Object.fromEntries(performance.getEntriesByType('resource').map((r) => [r.name, r]));
    const imgs = [...document.querySelectorAll('img')].filter((i) => i.getBoundingClientRect().width > 0).map((i) => {
        const r = i.getBoundingClientRect();
        const src = i.currentSrc || i.src;
        const res = ressources[src];
        const octets = src.startsWith('data:') ? Math.round((src.length - src.indexOf(',') - 1) * 0.75) : (res ? res.encodedBodySize : null);
        return {
            src: src.startsWith('data:') ? src.slice(0, 30) + '…' : src.split('/').pop(), naturel: [i.naturalWidth, i.naturalHeight],
            affiche: [Math.round(r.width), Math.round(r.height)], dpr,
            surdimension: +(i.naturalWidth / Math.max(1, r.width * dpr)).toFixed(2), octets,
            attrDimensions: i.hasAttribute('width') && i.hasAttribute('height'), loading: i.getAttribute('loading') || '', alt: i.getAttribute('alt')
        };
    });
    const fonds = [];
    for (const el of document.querySelectorAll('body *')) {
        const bg = getComputedStyle(el).backgroundImage;
        if (bg && bg !== 'none' && /url\(/.test(bg) && el.getBoundingClientRect().width > 0) fonds.push({ el: el.tagName.toLowerCase(), url: bg.slice(0, 60) });
    }
    return { imgs, fonds: fonds.slice(0, 10) };
}
async function sImages(env, vp, avecLogo) {
    const { page, ctx, suivi } = await ouvrirPage(env, vp);
    const out = { vp: vp.nom, ecrans: {} };
    try {
        await page.goto(env.base + '/index.html', { waitUntil: 'load', timeout: 60000 });
        await page.waitForFunction(() => window.__perf.marques.connexion, { timeout: 30000 });
        out.ecrans.acces = await page.evaluate(inventaireImages);
        await entrerEnDemo(page);
        out.ecrans.dashboard = await page.evaluate(inventaireImages);
        if (avecLogo) {
            await allerA(page, '#settings/entreprise');
            // Fichier image réaliste (photo de logo 4000 × 3000) construit dans la
            // page puis remis au vrai champ de fichier, comme un dépôt utilisateur.
            const depot = await page.evaluate(async () => {
                const c = document.createElement('canvas'); c.width = 4000; c.height = 3000;
                const g = c.getContext('2d');
                for (let i = 0; i < 400; i++) { g.fillStyle = `hsl(${(i * 37) % 360},70%,${30 + (i % 40)}%)`; g.fillRect((i * 97) % 4000, (i * 53) % 3000, 300, 200); }
                g.fillStyle = '#0b3d91'; g.font = 'bold 600px sans-serif'; g.fillText('LOGO', 600, 1800);
                const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
                const input = [...document.querySelectorAll('input[type="file"][accept="image/*"]')][0];
                if (!input) return { ok: false };
                const dt = new DataTransfer(); dt.items.add(new File([blob], 'logo-chantier-4000x3000.png', { type: 'image/png' }));
                input.files = dt.files;
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return { ok: true, octetsSource: blob.size };
            });
            await page.waitForFunction(() => window.__perf.toasts.some((t) => /Logo mis à jour/.test(t.texte)), { timeout: 15000 }).catch(() => {});
            await attendre(800);
            out.depotLogo = depot;
            out.logoStocke = await page.evaluate(async () => {
                const k = Object.keys(localStorage).find((x) => { try { return /data:image/.test(localStorage.getItem(x)) && /companyInfo|company/i.test(x); } catch (e) { return false; } })
                    || Object.keys(localStorage).find((x) => /data:image/.test(localStorage.getItem(x) || ''));
                if (!k) return null;
                const m = localStorage.getItem(k).match(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/);
                if (!m) return { cle: k };
                const img = new Image(); img.src = m[0]; await img.decode().catch(() => {});
                return { cle: k, format: m[0].slice(5, 15), naturel: [img.naturalWidth, img.naturalHeight], octets: Math.round((m[0].length - 23) * 0.75) };
            });
            out.ecrans.parametres = await page.evaluate(inventaireImages);
        }
        await allerA(page, '#devis');
        await cliquer(page, (b) => b.tagName === 'TR' && /DEV-2026-001/.test(b.innerText));
        await attendre(1600);
        out.ecrans.documentDevis = await page.evaluate(inventaireImages);
        await capture(page, `S5_${vp.nom}_document_devis`);
        out.requetesImages = suivi.requetes.filter((q) => q.type === 'image').map((q) => q.chemin);
        return out;
    } finally { await ctx.close(); }
}

// ═══ S6 — PDF : composant lourd, lenteur, échec hors ligne, reprise (C146, C148, C152, C156)
async function ouvrirDevisExemple(page) {
    await allerA(page, '#devis');
    await cliquer(page, (b) => b.tagName === 'TR' && /DEV-2026-001/.test(b.innerText));
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.getAttribute('aria-label') === 'Télécharger le devis en PDF' && b.getBoundingClientRect().width > 0), { timeout: 10000 });
    await attendre(600);
}
async function sPdf(env) {
    const out = {};
    // A — génération normale : le reste de l'interface répond-il pendant ce temps ?
    {
        const { page, ctx, suivi } = await ouvrirPage(env, BUREAU);
        try {
            await page.goto(env.base + '/index.html', { waitUntil: 'load', timeout: 60000 });
            await entrerEnDemo(page);
            await ouvrirDevisExemple(page);
            out.libsAvantClic = suivi.requetes.filter((q) => /html2canvas|jspdf/.test(q.chemin)).length;
            const m = await marque(page);
            await demarrerImages(page);
            const t0 = Date.now();
            await cliquer(page, parNom, '^Télécharger le devis en PDF');
            await attendre(250);
            // Geste indépendant pendant la génération : ouvrir « Factures » au clic réel.
            const mClic = await marque(page);
            await cliquer(page, (b) => b.closest('aside') && (b.innerText || '').trim() === 'Factures');
            const fin = await mesurerJusqua(page, () => window.__perf.toasts.some((t) => /PDF|Génération impossible/.test(t.texte)), { delaiMax: 30000 });
            const ecranFactures = await mesurerJusqua(page, () => /Factures/.test(document.querySelector('h1')?.innerText || '') && !document.querySelector('.animate-page-spin'), { delaiMax: 15000 });
            const images = await arreterImages(page);
            const evClic = await page.evaluate((m0) => window.__perf.ev.slice(m0.ev).filter((e) => /pointer|click|mouse/.test(e.n)).map((e) => ({ n: e.n, d: Math.round(e.d), attente: Math.round(e.attente) })), mClic);
            out.normal = {
                dureeTotaleMs: Date.now() - t0, libsApresClic: suivi.requetes.filter((q) => /html2canvas|jspdf/.test(q.chemin)).map((q) => q.chemin),
                toast: (await toastsDepuis(page, m.toasts)).map((t) => t.texte), ...images, longues: (await bilan(page, m)).longues,
                clicFacturesPendantPdf: evClic, ecranFacturesApresClicMs: ecranFactures.ms, finOk: fin.ok
            };
        } finally { await ctx.close(); }
    }
    // B — bibliothèques PDF lentes (8 s) : l'attente est-elle signalée, puis la lenteur ?
    {
        env.relais.regles.retards.push((c) => (/vendor\/(html2canvas|jspdf)/.test(c) ? 8000 : 0));
        const { page, ctx } = await ouvrirPage(env, BUREAU);
        try {
            await page.goto(env.base + '/index.html', { waitUntil: 'load', timeout: 60000 });
            await entrerEnDemo(page);
            await ouvrirDevisExemple(page);
            const m = await marque(page);
            await cliquer(page, parNom, '^Télécharger le devis en PDF');
            const etat = async () => page.evaluate(() => {
                const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Télécharger le devis en PDF');
                return { libelle: b?.innerText.trim(), desactive: b?.disabled, ariaBusy: b?.getAttribute('aria-busy'), statut: [...document.querySelectorAll('[role="status"],[role="alert"]')].map((s) => s.innerText.trim()).filter(Boolean).slice(0, 3) };
            });
            await attendre(1000); const a1 = await etat();
            await attendre(4000); const a5 = await etat();
            await capture(page, 'S6_pdf_bibliotheques_lentes_5s');
            await page.waitForFunction(() => window.__perf.toasts.some((t) => /PDF|Génération impossible/.test(t.texte)), { timeout: 30000 }).catch(() => {});
            out.lent = { a1s: a1, a5s: a5, toasts: (await toastsDepuis(page, m.toasts)).map((t) => t.texte) };
        } finally { await ctx.close(); env.relais.reinitialiser(); }
    }
    // C/D — hors ligne puis retour du réseau (bibliothèques jamais chargées).
    {
        const { page, ctx } = await ouvrirPage(env, BUREAU);
        try {
            await page.goto(env.base + '/index.html', { waitUntil: 'load', timeout: 60000 });
            await entrerEnDemo(page);
            await ouvrirDevisExemple(page);
            let m = await marque(page);
            await page.setOfflineMode(true);
            await attendre(800);
            const toastCoupure = (await toastsDepuis(page, m.toasts)).map((t) => t.texte);
            m = await marque(page);
            await cliquer(page, parNom, '^Télécharger le devis en PDF');
            await page.waitForFunction((n) => window.__perf.toasts.length > n, { timeout: 15000 }, m.toasts).catch(() => {});
            await attendre(300);
            out.horsLigne = { toastCoupure, toastsPdf: await toastsDepuis(page, m.toasts) };
            await capture(page, 'S6_pdf_hors_ligne');
            m = await marque(page);
            await page.setOfflineMode(false);
            await attendre(1000);
            const toastRetour = (await toastsDepuis(page, m.toasts)).map((t) => t.texte);
            const puce = await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^État de connexion/.test(b.getAttribute('aria-label') || ''))?.getAttribute('title'));
            m = await marque(page);
            await attendre(3000); // laisser disparaître la notification précédente
            m = await marque(page);
            await cliquer(page, parNom, '^Télécharger le devis en PDF');
            await page.waitForFunction((n) => window.__perf.toasts.some((t, i) => i >= n && /PDF|Génération impossible/.test(t.texte)), { timeout: 30000 }, m.toasts).catch(() => {});
            out.retour = { toastRetour, puceConnexion: puce, toastsPdf: (await toastsDepuis(page, m.toasts)).map((t) => t.texte) };
        } finally { await ctx.close(); }
    }
    return out;
}

// ═══ S7 — Démarrage lent, démarrage en échec, connexion lente consignée (C148, C151)
async function echantillonner(page, instants, prefixe) {
    const t0 = Date.now();
    const vues = [];
    for (const s of instants) {
        const reste = s * 1000 - (Date.now() - t0);
        if (reste > 0) await attendre(reste);
        const etat = await page.evaluate(() => ({
            texte: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 140),
            enfantsRoot: document.getElementById('root')?.childElementCount ?? null,
            indicateur: Boolean(document.querySelector('[role="progressbar"], [aria-busy="true"], .animate-spin, .animate-page-spin'))
        })).catch((e) => ({ erreur: String(e).slice(0, 80) }));
        vues.push({ s, ...etat, capture: await capture(page, `${prefixe}_${s}s`) });
    }
    return vues;
}
async function sDemarrage(env) {
    const out = { profils: [] };
    const profils = [
        { nom: 'Slow 4G', vp: MOBILE, cpu: 4 },
        { nom: 'Slow 3G', vp: MOBILE, cpu: 4 },
        { nom: 'Slow 4G', vp: BUREAU, cpu: 1 }
    ];
    for (const p of profils) {
        const reseau = PredefinedNetworkConditions[p.nom];
        const { page, ctx, suivi } = await ouvrirPage(env, p.vp, { cpu: p.cpu, reseau });
        try {
            const t0 = Date.now();
            await page.goto(env.base + '/index.html', { waitUntil: 'domcontentloaded', timeout: 120000 });
            const vues = await echantillonner(page, [1, 3], `S7_${p.nom.replace(/\s/g, '')}_${p.vp.nom}`);
            await page.waitForFunction(() => window.__perf && window.__perf.marques.connexion, { timeout: 120000 });
            const boot = await page.evaluate(() => ({
                fcp: Math.round(window.__perf.paint.find((x) => x.n === 'first-contentful-paint')?.t ?? -1),
                ecranAcces: Math.round(window.__perf.marques.connexion),
                octets: performance.getEntriesByType('resource').reduce((s, r) => s + (r.transferSize || 0), 0) + (performance.getEntriesByType('navigation')[0]?.transferSize || 0)
            }));
            const entree = await entrerEnDemo(page, { delaiMax: 60000 });
            await creerClient(page, `Client ${p.nom}`);
            const clients = await lireLS(page, 'costcalc:guest:clients');
            out.profils.push({
                profil: p.nom, parametres: reseau, vp: p.vp.nom, cpu: p.cpu, murMs: Date.now() - t0, vues, boot,
                entreeDemoMs: entree.ms, clientCree: Array.isArray(clients) && clients.some((c) => c.name === `Client ${p.nom}`),
                externes: [...new Set(suivi.externes)]
            });
        } finally { await ctx.close(); }
    }
    // Lenteur : le bundle applicatif met 20 s à arriver.
    {
        env.relais.regles.retards.push((c) => (c === '/app.compiled.js' ? 20000 : 0));
        const { page, ctx } = await ouvrirPage(env, MOBILE);
        try {
            await page.goto(env.base + '/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
            out.lenteur = await echantillonner(page, [2, 6, 12, 18], 'S7_bundle_lent');
            await page.waitForFunction(() => window.__perf && window.__perf.marques.connexion, { timeout: 40000 }).catch(() => {});
            out.lenteurFinale = await page.evaluate(() => Boolean(window.__perf?.marques.connexion));
        } finally { await ctx.close(); env.relais.reinitialiser(); }
    }
    // Échec : le bundle applicatif ne peut pas être chargé.
    {
        env.relais.regles.coupures.push((c) => c === '/app.compiled.js');
        const { page, ctx } = await ouvrirPage(env, MOBILE);
        try {
            await page.goto(env.base + '/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
            out.echec = await echantillonner(page, [3, 10], 'S7_bundle_echec');
        } finally { await ctx.close(); env.relais.reinitialiser(); }
    }
    return out;
}

// ═══ S8 — Démo hors ligne : enregistrements, messages, retour du réseau (C152, C156, C160)
async function sHorsLigneDemo(env, vp) {
    const { page, ctx } = await ouvrirPage(env, vp);
    const out = { vp: vp.nom };
    try {
        await page.goto(env.base + '/index.html', { waitUntil: 'load', timeout: 60000 });
        await entrerEnDemo(page);
        let m = await marque(page);
        await page.setOfflineMode(true);
        await attendre(1000);
        out.toastCoupure = (await toastsDepuis(page, m.toasts)).map((t) => t.texte);
        out.puceHorsLigne = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^État de connexion/.test(x.getAttribute('aria-label') || '')); return b ? { libelle: b.innerText.trim(), titre: b.title } : null; });
        await capture(page, `S8_${vp.nom}_coupure`);
        m = await marque(page);
        await creerClient(page, 'Client Hors Ligne');
        out.clientHorsLigne = { toasts: (await toastsDepuis(page, m.toasts)).map((t) => t.texte), stocke: ((await lireLS(page, 'costcalc:guest:clients')) || []).some((c) => c.name === 'Client Hors Ligne') };
        const avant = ((await lireLS(page, 'costcalc:guest:savedQuotes')) || []).map((q) => q.number);
        m = await marque(page);
        await creerDevis(page);
        const apres = ((await lireLS(page, 'costcalc:guest:savedQuotes')) || []).map((q) => q.number);
        out.devisHorsLigne = { toasts: (await toastsDepuis(page, m.toasts)).map((t) => t.texte), avant, apres };
        await allerA(page, '#settings/diagnostic');
        out.diagnosticHorsLigne = await page.evaluate(() => {
            const t = document.body.innerText;
            const i = t.indexOf('Connexion au cloud');
            return i < 0 ? null : t.slice(i, i + 160).replace(/\s+/g, ' ');
        });
        await capture(page, `S8_${vp.nom}_diagnostic_hors_ligne`);
        m = await marque(page);
        await page.setOfflineMode(false);
        await attendre(1000);
        out.toastRetour = (await toastsDepuis(page, m.toasts)).map((t) => t.texte);
        out.puceRetour = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^État de connexion/.test(x.getAttribute('aria-label') || '')); return b ? { libelle: b.innerText.trim(), titre: b.title } : null; });
        await capture(page, `S8_${vp.nom}_retour_reseau`);
        await page.reload({ waitUntil: 'load' });
        await entrerEnDemo(page);
        out.apresRechargement = {
            client: ((await lireLS(page, 'costcalc:guest:clients')) || []).some((c) => c.name === 'Client Hors Ligne'),
            devis: ((await lireLS(page, 'costcalc:guest:savedQuotes')) || []).map((q) => q.number)
        };
        return out;
    } finally { await ctx.close(); }
}

// ═══ S9 — Écriture locale refusée (stockage plein) puis nouvel essai (C152, C154)
async function remplirStockage(page) {
    return page.evaluate(() => {
        const cle = 'zz_remplissage_sonde_g8';
        localStorage.removeItem(cle);
        let bas = 0, haut = 1;
        const essai = (n) => { try { localStorage.setItem(cle, 'x'.repeat(n)); return true; } catch (e) { return false; } };
        while (essai(haut * 1024 * 1024)) { bas = haut * 1024 * 1024; haut *= 2; if (haut > 64) break; }
        let b = bas, h = haut * 1024 * 1024;
        while (h - b > 1) { const mid = Math.floor((b + h) / 2); if (essai(mid)) b = mid; else h = mid; }
        essai(b);
        return { cle, caracteres: b };
    });
}
async function sQuota(env) {
    const { page, ctx } = await ouvrirPage(env, BUREAU);
    const out = {};
    try {
        await page.goto(env.base + '/index.html', { waitUntil: 'load', timeout: 60000 });
        await entrerEnDemo(page);
        out.remplissage = await remplirStockage(page);
        let m = await marque(page);
        await creerClient(page, 'Client Stockage Plein');
        out.client = {
            toasts: (await toastsDepuis(page, m.toasts)).map((t) => ({ role: t.role, texte: t.texte })),
            affiche: await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => /Client Stockage Plein/.test(b.getAttribute('aria-label') || b.innerText))),
            stocke: ((await lireLS(page, 'costcalc:guest:clients')) || []).some((c) => c.name === 'Client Stockage Plein')
        };
        const devisAvant = ((await lireLS(page, 'costcalc:guest:savedQuotes')) || []).map((q) => q.number);
        m = await marque(page);
        await creerDevis(page);
        out.devis = {
            toasts: (await toastsDepuis(page, m.toasts)).map((t) => ({ role: t.role, texte: t.texte })),
            stockes: ((await lireLS(page, 'costcalc:guest:savedQuotes')) || []).map((q) => q.number), devisAvant
        };
        await capture(page, 'S9_stockage_plein_enregistrer');
        // Nouvel essai : l'utilisateur clique de nouveau « Enregistrer » (toujours plein),
        // puis une fois de la place libérée.
        m = await marque(page);
        await cliquer(page, (b) => /^Enregistrer/.test((b.innerText || '').trim()) && !/règlement/i.test(b.innerText));
        await attendre(1500);
        out.secondEssaiPlein = (await toastsDepuis(page, m.toasts)).map((t) => t.texte);
        await page.evaluate(() => localStorage.removeItem('zz_remplissage_sonde_g8'));
        m = await marque(page);
        await cliquer(page, (b) => /^Enregistrer/.test((b.innerText || '').trim()) && !/règlement/i.test(b.innerText));
        await attendre(1500);
        const final = (await lireLS(page, 'costcalc:guest:savedQuotes')) || [];
        const numeros = final.map((q) => q.number);
        out.essaiApresLiberation = {
            toasts: (await toastsDepuis(page, m.toasts)).map((t) => t.texte), numeros,
            doublons: numeros.filter((n, i) => numeros.indexOf(n) !== i)
        };
        await page.reload({ waitUntil: 'load' });
        await entrerEnDemo(page);
        out.apresRechargement = {
            client: ((await lireLS(page, 'costcalc:guest:clients')) || []).some((c) => c.name === 'Client Stockage Plein'),
            devis: ((await lireLS(page, 'costcalc:guest:savedQuotes')) || []).map((q) => q.number)
        };
        return out;
    } finally { await ctx.close(); }
}

// ═══ S10 — Activation répétée (impatience) : aucune opération dupliquée (C154)
async function sRepetition(env, vp) {
    const { page, ctx } = await ouvrirPage(env, vp);
    const out = { vp: vp.nom };
    try {
        await page.goto(env.base + '/index.html', { waitUntil: 'load', timeout: 60000 });
        await entrerEnDemo(page);
        // Double clic sur « Créer le client ».
        await allerA(page, '#clients');
        await cliquer(page, parNom, '^(Créer un nouveau client|Nouveau client)');
        await page.waitForSelector('#newClientForm-name', { visible: true });
        await page.click('#newClientForm-name');
        await page.keyboard.type('Client Double Clic', { delay: 20 });
        const btn = (await boutonVisible(page, parNom, '^Créer le client')).asElement();
        await btn.click({ count: 2 });
        await attendre(1500);
        // Entrée répétée dans le formulaire.
        await cliquer(page, parNom, '^(Créer un nouveau client|Nouveau client)');
        await page.waitForSelector('#newClientForm-name', { visible: true });
        await page.click('#newClientForm-name');
        await page.keyboard.type('Client Entrée Répétée', { delay: 20 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await attendre(1500);
        const clients = ((await lireLS(page, 'costcalc:guest:clients')) || []).map((c) => c.name);
        out.clients = { doubleClic: clients.filter((n) => n === 'Client Double Clic').length, entree: clients.filter((n) => n === 'Client Entrée Répétée').length };
        // Double clic sur « Enregistrer » d'un nouveau devis.
        const seqAvant = ((await lireLS(page, 'costcalc:guest:savedQuotes')) || []).length;
        const surBureau = vp.width >= 1024;
        if (surBureau) await cliquer(page, (b) => b.closest('aside') && (b.innerText || '').trim().startsWith('Nouveau devis'));
        else await allerA(page, '#chiffrage');
        await attendre(1300);
        await ajouterOuvrage(page, 30);
        await taper(page, 'input[aria-label="Surface directe (m²)"]', '80', 30);
        await attendre(300);
        await cliquer(page, parNom, '^Confirmer mes quantités');
        await attendre(500);
        const enr = (await boutonVisible(page, (b) => /^Enregistrer/.test((b.innerText || '').trim()) && !/règlement/i.test(b.innerText))).asElement();
        await enr.click({ count: 2 });
        await enr.click().catch(() => {});
        await attendre(1500);
        const devis = ((await lireLS(page, 'costcalc:guest:savedQuotes')) || []).map((q) => q.number);
        out.devis = { avant: seqAvant, apres: devis.length, numeros: devis, doublons: devis.filter((n, i) => devis.indexOf(n) !== i) };
        return out;
    } finally { await ctx.close(); }
}

// ═══ S11 — Deux onglets ouverts sur la même démo (C158)
async function sDeuxOnglets(env) {
    const ctx = await env.nav.createBrowserContext();
    const out = {};
    try {
        const A = await ouvrirPage(env, BUREAU, { contexte: ctx });
        const B = await ouvrirPage(env, BUREAU, { contexte: ctx });
        await A.page.bringToFront();
        await A.page.goto(env.base + '/index.html', { waitUntil: 'load', timeout: 60000 });
        await entrerEnDemo(A.page);
        await B.page.bringToFront();
        await B.page.goto(env.base + '/index.html', { waitUntil: 'load', timeout: 60000 });
        await entrerEnDemo(B.page);
        const noms = async (p) => ((await lireLS(p, 'costcalc:guest:clients')) || []).map((c) => c.name);

        await A.page.bringToFront();
        await creerClient(A.page, 'Client Onglet A');
        out.apresA = await noms(A.page);
        await B.page.bringToFront();
        const mB = await marque(B.page);
        await creerClient(B.page, 'Client Onglet B');
        out.apresB = await noms(B.page);
        out.avertissementB = (await toastsDepuis(B.page, mB.toasts)).map((t) => t.texte);
        out.listeAfficheeB = await B.page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || '').filter((l) => /^Sélectionner /.test(l)).map((l) => l.replace('Sélectionner ', '')));
        await capture(B.page, 'S11_onglet_B_apres_creation');

        // Devis : chaque onglet crée le sien.
        await A.page.bringToFront();
        await creerDevis(A.page);
        const devisA = ((await lireLS(A.page, 'costcalc:guest:savedQuotes')) || []).map((q) => q.number);
        await B.page.bringToFront();
        await creerDevis(B.page);
        const devisB = ((await lireLS(B.page, 'costcalc:guest:savedQuotes')) || []).map((q) => q.number);
        out.devis = { apresA: devisA, apresB: devisB };

        // Rechargement de l'onglet A : ce que l'utilisateur A retrouve.
        await A.page.bringToFront();
        await A.page.reload({ waitUntil: 'load' });
        await entrerEnDemo(A.page);
        await allerA(A.page, '#clients');
        out.rechargementA = await A.page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || '').filter((l) => /^Sélectionner /.test(l)).map((l) => l.replace('Sélectionner ', '')));
        await capture(A.page, 'S11_onglet_A_apres_rechargement');
        out.externes = [...new Set([...A.suivi.externes, ...B.suivi.externes])];
        return out;
    } finally { await ctx.close(); }
}

// ═══ S12 — Service worker : 1re visite pendant l'usage, démarrage hors ligne (C143, C160, C156)
async function sServiceWorker(env) {
    const out = {};
    // A — 1re visite : l'installation du service worker finit pendant que
    // l'utilisateur travaille (réseau lent pour les fichiers qu'il met en cache).
    env.relais.regles.swAbsent = false;
    env.relais.regles.retards.push((c, dest) => (dest === 'empty' ? 7000 : 0));
    {
        const { page, ctx, suivi } = await ouvrirPage(env, BUREAU);
        try {
            const t0 = Date.now();
            await page.goto(env.base + '/index.html', { waitUntil: 'load', timeout: 60000 });
            await entrerEnDemo(page);
            await allerA(page, '#clients');
            await cliquer(page, parNom, '^(Créer un nouveau client|Nouveau client)');
            await page.waitForSelector('#newClientForm-name', { visible: true });
            await page.click('#newClientForm-name');
            await page.keyboard.type('Saisie en cours de mon client', { delay: 60 });
            const tSaisie = Date.now() - t0;
            await attendre(Math.max(0, 13000 - (Date.now() - t0)));
            out.premiereVisite = {
                navigations: suivi.navigations.map((n) => ({ ms: n.t - t0, url: n.url.replace(env.base, '') })),
                saisieTermineeA: tSaisie,
                champEncorePresent: await page.evaluate(() => document.querySelector('#newClientForm-name')?.value || null).catch(() => null),
                ecran: await page.evaluate(() => (document.querySelector('h1')?.innerText || document.body.innerText.slice(0, 60)).replace(/\s+/g, ' ')).catch(() => null),
                controle: await page.evaluate(() => Boolean(navigator.serviceWorker.controller)).catch(() => null)
            };
            await capture(page, 'S12_premiere_visite_apres_installation_sw');
        } finally { await ctx.close(); env.relais.regles.retards = []; }
    }
    // B — sans retard artificiel : instant du rechargement automatique.
    {
        const { page, ctx, suivi } = await ouvrirPage(env, BUREAU);
        try {
            const t0 = Date.now();
            await page.goto(env.base + '/index.html', { waitUntil: 'load', timeout: 60000 });
            await attendre(4000);
            out.rechargementSansRetard = suivi.navigations.map((n) => n.t - t0);
            out.swControle = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
            // C — même profil, réseau coupé : l'application démarre-t-elle ?
            const cache = await page.evaluate(async () => { const n = await caches.keys(); const c = n.length ? await caches.open(n[0]) : null; return c ? (await c.keys()).map((r) => new URL(r.url).pathname) : []; });
            env.relais.regles.horsLigne = true;
            await page.setOfflineMode(true);
            const t1 = Date.now();
            await page.reload({ waitUntil: 'load', timeout: 30000 }).catch((e) => { out.rechargementHorsLigneErreur = String(e).slice(0, 120); });
            const acces = await page.waitForFunction(() => window.__perf?.marques.connexion, { timeout: 20000 }).then(() => true).catch(() => false);
            out.demarrageHorsLigne = { ecranAcces: acces, ms: Date.now() - t1, fichiersEnCache: cache.length, libsPdfEnCache: cache.filter((c) => /html2canvas|jspdf/.test(c)) };
            await capture(page, 'S12_demarrage_hors_ligne');
            if (acces) {
                await entrerEnDemo(page);
                await creerClient(page, 'Client Démarrage Hors Ligne');
                out.demarrageHorsLigne.clientCree = ((await lireLS(page, 'costcalc:guest:clients')) || []).some((c) => c.name === 'Client Démarrage Hors Ligne');
                out.demarrageHorsLigne.iconesChargees = await page.evaluate(() => document.fonts.check('900 16px "Font Awesome 6 Free"'));
                await ouvrirDevisExemple(page);
                const m = await marque(page);
                await cliquer(page, parNom, '^Télécharger le devis en PDF');
                await page.waitForFunction((n) => window.__perf.toasts.length > n, { timeout: 15000 }, m.toasts).catch(() => {});
                out.demarrageHorsLigne.pdf = (await toastsDepuis(page, m.toasts)).map((t) => t.texte);
                await capture(page, 'S12_hors_ligne_pdf');
            }
        } finally { await ctx.close(); env.relais.reinitialiser(); }
    }
    return out;
}

// ═══ Exécution et verdicts ═══════════════════════════════════════════════
const mediane = (l) => { const s = [...l].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const resume = (l) => ({ min: Math.min(...l), mediane: mediane(l), max: Math.max(...l) });

export async function run({ scenarios = null } = {}) {
    await mkdir(PREUVES, { recursive: true });
    const { url: origine, close: fermerServeur } = await startServer();
    const relais = await demarrerRelais(origine);
    const nav = await puppeteer.launch({ headless: true, protocolTimeout: 240000 });
    const env = { nav, relais, base: relais.url };
    const resultats = [];
    const ok = (id, label, cond, detail = '') => resultats.push({ label: `${id} · ${label}`, pass: Boolean(cond), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
    const mesures = {
        date: new Date().toISOString(), seuils: SEUILS,
        conditions: {
            navigateur: await nav.version(), moteur: 'Chromium headless (Puppeteer ' + (await import('puppeteer/package.json', { with: { type: 'json' } }).then((m) => m.default.version).catch(() => '?')) + ')',
            serveur: 'scratch/lib/server.mjs + relais local gzip (HTTP/1.1, pas de HTTP/2)', machine: `${process.platform} ${process.arch}, autres agents en parallèle (charge non maîtrisée)`,
            vues: { BUREAU, MOBILE }, cpuMobile: '4× (emulateCPUThrottling)', serviceWorker: 'bloqué (404) sauf scénario S12', donnees: 'démo vierge (localStorage vidé par contexte neuf)'
        },
        scenarios: {}
    };
    const veut = (s) => !scenarios || scenarios.includes(s);
    const essayer = async (nom, f) => {
        try { const r = await f(); mesures.scenarios[nom] = r; return r; } catch (e) {
            // Charge machine : une seule nouvelle tentative.
            try { const r = await f(); mesures.scenarios[nom] = { ...r, nouvelleTentative: String(e).slice(0, 200) }; return r; } catch (e2) {
                mesures.scenarios[nom] = { erreur: String(e2).slice(0, 400), etape: ETAPE, premiereErreur: String(e).slice(0, 200) };
                resultats.push({ label: `${nom} · scénario BLOQUÉ`, pass: false, detail: `[étape : ${ETAPE}] ${String(e2).slice(0, 300)}` });
                return null;
            }
        }
    };
    try {
        // S1 ×3 par vue (C141, C143, C146, C150)
        if (veut('S1')) {
            const runs = { bureau: [], mobile: [] };
            for (let i = 1; i <= 3; i++) {
                const a = await essayer(`S1_bureau_${i}`, () => sChargement(env, BUREAU, 1, i)); if (a) runs.bureau.push(a);
                const b = await essayer(`S1_mobile_${i}`, () => sChargement(env, MOBILE, 4, i)); if (b) runs.mobile.push(b);
            }
            for (const [nomVue, liste] of Object.entries(runs)) {
                if (!liste.length) continue;
                const lcp = liste.map((r) => r.boot.lcp), acces = liste.map((r) => r.boot.ecranAcces);
                const entree = liste.map((r) => r.entreeDemoMs);
                const routesMs = liste.flatMap((r) => r.routes.map((x) => x.ms ?? 99999));
                ok('C141', `${nomVue} — écran d'accès affiché (LCP) ≤ ${SEUILS.lcpBonMs} ms (local, 3 essais)`, Math.max(...lcp) <= SEUILS.lcpBonMs, { lcp: resume(lcp), ecranAcces: resume(acces), fcp: resume(liste.map((r) => r.boot.fcp)), octetsTransferes: liste[0].boot.octetsTransferes, octetsDecodes: liste[0].boot.octetsDecodes, bloquantsTete: liste[0].boot.bloquantsTete });
                ok('C141', `${nomVue} — entrée en démo → tableau de bord ≤ ${SEUILS.ecranMs} ms`, Math.max(...entree) <= SEUILS.ecranMs, resume(entree));
                ok('C141', `${nomVue} — 11 écrans affichés ≤ ${SEUILS.ecranMs} ms après navigation (350 ms voulus inclus, UX-DEC-01)`, Math.max(...routesMs) <= SEUILS.ecranMs, { ...resume(routesMs), parEcran: liste[0].routes.map((r) => `${r.route}:${r.ms}`) });
                const clsMax = Math.max(...liste.flatMap((r) => [r.boot.cls, ...r.routes.map((x) => x.cls)]));
                const pires = liste[0].routes.filter((r) => r.cls > 0.01).map((r) => ({ route: r.route, cls: r.cls, src: r.decalages }));
                ok('C143', `${nomVue} — décalage de mise en page (CLS) ≤ ${SEUILS.cls} au démarrage et sur 11 écrans`, clsMax <= SEUILS.cls, { clsMax, pires, demarrage: liste.map((r) => r.boot.cls) });
                const tbt = liste.map((r) => Math.max(r.boot.tbt, r.boot.loafBloquantMs));
                ok('C146', `${nomVue} — bibliothèques PDF (jsPDF + html2canvas) jamais chargées au démarrage ni en navigation`, liste.every((r) => r.libsPdfDemandees.length === 0), liste.map((r) => r.libsPdfDemandees));
                mesures.scenarios[`S1_${nomVue}_synthese`] = { tbtAvantEcranAcces: resume(tbt), longuesBoot: liste.map((r) => r.boot.longues), longuesRoutes: liste[0].routes.map((r) => `${r.route}:${r.longues.join('/')}`) };
                ok('C146', `${nomVue} — temps de blocage avant l'écran d'accès (TBT / LoAF) ≤ 300 ms`, Math.max(...tbt) <= 300, { tbt: resume(tbt), longues: liste.map((r) => r.boot.longues), loaf: liste.map((r) => r.boot.loaf) });
                ok('C150', `${nomVue} — un seul document chargé par essai (aucun rechargement parasite pendant la mesure)`, liste.every((r) => r.documentsCharges === 1), liste.map((r) => r.documentsCharges));
                // C150 — mêmes conditions, même scénario, répétabilité.
                const ecart = (l) => (Math.max(...l) - Math.min(...l));
                const repetable = (l) => ecart(l) <= Math.max(SEUILS.ecartRepetabiliteAbsMs, SEUILS.ecartRepetabilite * mediane(l));
                const parRoute = ROUTES.map((r, i) => liste.map((x) => x.routes[i].ms ?? 0));
                ok('C150', `${nomVue} — 3 mesures, conditions identiques consignées, écart ≤ max(${SEUILS.ecartRepetabiliteAbsMs} ms, ${SEUILS.ecartRepetabilite * 100} %)`,
                    liste.length === 3 && repetable(acces) && repetable(entree) && parRoute.every(repetable),
                    { ecranAcces: acces, entree, routesNonRepetables: parRoute.map((l, i) => ({ r: ROUTES[i], l })).filter((x) => !repetable(x.l)) });
                ok('C150', `${nomVue} — aucune requête externe, aucune erreur console`, liste.every((r) => r.externes.length === 0 && r.erreurs.length === 0), liste.map((r) => ({ ext: r.externes, err: r.erreurs })));
            }
        }
        if (veut('S2')) {
            for (const vp of [vue(1024, 768, 2), vue(768, 1024, 2), vue(360, 740, 3), vue(320, 640, 2)]) {
                const r = await essayer(`S2_${vp.nom}`, () => sLargeurs(env, vp));
                if (!r) continue;
                const clsMax = Math.max(r.clsAcces, ...r.routes.map((x) => x.cls));
                ok('C143', `${vp.nom} — CLS ≤ ${SEUILS.cls} sur l'écran d'accès et 11 écrans`, clsMax <= SEUILS.cls, { clsMax, pires: r.routes.filter((x) => x.cls > 0.01) });
            }
        }
        if (veut('S3')) {
            for (const [vp, cpu] of [[BUREAU, 1], [MOBILE, 4]]) {
                const r = await essayer(`S3_${vp.nom}`, () => sInteractions(env, vp, cpu));
                if (!r) continue;
                const inp = Math.max(r.navigation.inpMax, r.rechercheClient.inpMax, r.nouveauClient.inpMax, r.ajoutOuvrage.inpMax, r.metre.inpMax, r.enregistrer.inpMax);
                ok('C142', `${vp.nom} cpu×${cpu} — durée d'interaction max (Event Timing) ≤ ${SEUILS.inpMs} ms sur 6 gestes`, inp <= SEUILS.inpMs,
                    { navigation: r.navigation.inpMax, recherche: r.rechercheClient.inpMax, nouveauClient: r.nouveauClient.inpMax, ajoutOuvrage: r.ajoutOuvrage.inpMax, metre: r.metre.inpMax, enregistrer: r.enregistrer.inpMax });
                const retours = [r.navigation.retourMs, r.nouveauClient.retourMs, r.enregistrer.retourMs];
                ok('C142', `${vp.nom} cpu×${cpu} — premier changement visible ≤ ${SEUILS.retourVisibleMs} ms après le geste (nav, fenêtre, enregistrer)`, retours.every((x) => x !== null && x <= SEUILS.retourVisibleMs), { retours, ecranNav: r.navigation.ecranMs, dialogue: r.nouveauClient.dialogueMs, toastEnregistrer: r.enregistrer.toastMs });
                ok('C142', `${vp.nom} cpu×${cpu} — totaux recalculés ≤ ${SEUILS.inpMs} ms après la dernière touche du métré`, r.metre.totalApresDerniereToucheMs <= SEUILS.inpMs && r.metre.htApres > 0, { ms: r.metre.totalApresDerniereToucheMs, ht: [r.metre.htAvant, r.metre.htApres], suggestionsMs: r.ajoutOuvrage.suggestionsMs, ajoutMs: r.ajoutOuvrage.ajoutMs });
                const memeRect = (a, b) => JSON.stringify(a) === JSON.stringify(b);
                ok('C143', `${vp.nom} — le champ de recherche et « Nouveau client » ne bougent pas pendant la frappe`, memeRect(r.rechercheClient.avant, r.rechercheClient.pendant) && memeRect(r.rechercheClient.avant, r.rechercheClient.vide), { avant: r.rechercheClient.avant, pendant: r.rechercheClient.pendant, vide: r.rechercheClient.vide });
                ok('C143', `${vp.nom} — « Enregistrer » reste en place quand les montants s'allongent (0 → 120 → 1 200 000 m²)`, memeRect(r.metre.enregAvant, r.metre.enreg120) && memeRect(r.metre.enreg120, r.metre.enregGrand), { avant: r.metre.enregAvant, a120: r.metre.enreg120, grand: r.metre.enregGrand });
                ok('C143', `${vp.nom} — notification superposée (position fixe), aucun décalage pendant la saisie`, r.toastPosition === 'fixed' && r.metre.cls <= SEUILS.cls && r.rechercheClient.cls <= SEUILS.cls, { toast: r.toastPosition, clsMetre: r.metre.cls, clsRecherche: r.rechercheClient.cls });
            }
        }
        if (veut('S4')) {
            for (const [vp, cpu] of [[BUREAU, 1], [MOBILE, 4]]) {
                const r = await essayer(`S4_${vp.nom}`, () => sVolume(env, vp, cpu));
                if (!r) continue;
                for (const [nom, d] of [['devis', r.defilementDevis], ['clients', r.defilementClients]]) {
                    ok('C144', `${vp.nom} cpu×${cpu} — molette sur ${nom === 'devis' ? NB_DEVIS + ' devis' : NB_CLIENTS + ' clients'} : défilement effectif, aucune image figée > ${SEUILS.figementMs} ms`,
                        d.apres.top > d.avant.top + 500 && d.ecartMax <= SEUILS.figementMs, { ...d, lignesRendues: nom === 'devis' ? r.lignesDevis : r.lignesClients });
                }
                for (const [nom, d] of [['devis', r.rechercheDevis], ['clients', r.rechercheClients]]) {
                    ok('C144', `${vp.nom} cpu×${cpu} — frappe dans la recherche ${nom} (liste longue) : chaque touche ≤ ${SEUILS.inpMs} ms`, d.inpMax <= SEUILS.inpMs && d.longues.every((x) => x <= SEUILS.figementMs), d);
                }
                const recherches = [r.rechercheDevis, r.rechercheClients, r.rechercheGlobale, r.rechercheOuvrages].filter(Boolean);
                ok('C147', `${vp.nom} — ${recherches.length} recherches : aucune requête réseau pendant la frappe`, recherches.every((d) => d.requetesReseau.length === 0) && r.requetesPageHorsDemarrage.length === 0, { parRecherche: recherches.map((d) => `${d.requete}:${d.requetesReseau.length}`), page: r.requetesPageHorsDemarrage });
                ok('C147', `${vp.nom} — rechercher dans une liste ne relance pas le moteur de calcul des devis`, recherches.every((d) => d.calculsDevis === 0), recherches.map((d) => ({ q: d.requete, calculsDevis: d.calculsDevis, appelsFinance: d.appelsFinance, scriptMsParTouche: d.scriptMsParTouche })));
                ok('C157', `${vp.nom} — saisie rapide corrigée : la liste reflète la DERNIÈRE saisie (devis, clients)`, r.correctionRapideDevis.toutes && r.correctionRapideClients.toutes && r.correctionRapideDevis.valeur === 'DEV-2025-41' && r.correctionRapideClients.valeur === 'Volume 2', { devis: r.correctionRapideDevis, clients: r.correctionRapideClients });
                ok('C157', `${vp.nom} — résultats affichés cohérents avec la requête (devis, clients)`, r.rechercheDevis.coherent?.toutes && r.rechercheClients.coherent?.toutes, { devis: r.rechercheDevis.coherent, clients: r.rechercheClients.coherent });
            }
        }
        if (veut('S5')) {
            for (const [vp, logo] of [[vue(1440, 900, 2), true], [MOBILE, false]]) {
                const r = await essayer(`S5_${vp.nom}`, () => sImages(env, vp, logo));
                if (!r) continue;
                const toutes = Object.entries(r.ecrans).flatMap(([e, x]) => x.imgs.map((i) => ({ e, ...i })));
                ok('C145', `${vp.nom} — images affichées : pas plus de 2× les pixels utiles, ≤ 200 Ko chacune`, toutes.every((i) => i.surdimension <= 2 && (i.octets ?? 0) <= 200 * 1024), toutes);
                if (logo) {
                    ok('C145', `${vp.nom} — logo déposé en 4000×3000 : réduit à l'usage (≤ 480 px de large, ≤ 100 Ko) avant stockage`, r.logoStocke && r.logoStocke.naturel?.[0] <= 480 && r.logoStocke.octets <= 100 * 1024, { depot: r.depotLogo, stocke: r.logoStocke });
                }
            }
        }
        if (veut('S6')) {
            const r = await essayer('S6', () => sPdf(env));
            if (r) {
                ok('C146', 'PDF — bibliothèques chargées au clic seulement', r.libsAvantClic === 0 && r.normal.libsApresClic.length >= 2, { avant: r.libsAvantClic, apres: r.normal.libsApresClic });
                const clic = r.normal.clicFacturesPendantPdf;
                const attenteClic = clic.length ? Math.max(...clic.map((e) => e.attente)) : 0;
                ok('C146', `PDF en cours — un clic sur « Factures » est traité sans attendre > ${SEUILS.inpMs} ms, aucune tâche > 500 ms`, attenteClic <= SEUILS.inpMs && r.normal.longues.every((x) => x <= 500), { attenteClic, clic, longues: r.normal.longues, ecartImageMax: r.normal.ecartMax, ecranFacturesMs: r.normal.ecranFacturesApresClicMs, dureePdfMs: r.normal.dureeTotaleMs, toast: r.normal.toast });
                ok('C148', 'PDF lent (bibliothèques à 8 s) — attente signalée sur le bouton pendant le chargement', /Génération/.test(r.lent.a1s.libelle || '') && /Génération/.test(r.lent.a5s.libelle || ''), r.lent);
                ok('C148', 'PDF lent — au-delà de 5 s, un message distingue la lenteur de l\'attente normale', r.lent.a5s.statut.some((s) => /long|lent|patienter|réseau|connexion/i.test(s)), r.lent.a5s);
                const pdfHL = r.horsLigne.toastsPdf.map((t) => t.texte);
                ok('C152', 'Hors ligne — « Télécharger le PDF » ne produit pas de faux succès', pdfHL.length > 0 && pdfHL.every((t) => !/PDF téléchargé/.test(t)), r.horsLigne);
                ok('C148', 'Hors ligne — l\'échec du PDF est signalé en erreur et nomme la cause (connexion)', r.horsLigne.toastsPdf.some((t) => t.role === 'alert') && pdfHL.some((t) => /connexion|réseau|hors ligne/i.test(t)), pdfHL);
                ok('C156', 'Retour du réseau — le PDF refonctionne au clic suivant', r.retour.toastsPdf.some((t) => /PDF téléchargé/.test(t)), r.retour);
                ok('C156', 'Retour du réseau en démo — le message ne promet pas une synchronisation inexistante', r.retour.toastRetour.every((t) => !/synchroni/i.test(t)), { toast: r.retour.toastRetour, puce: r.retour.puceConnexion });
            }
        }
        if (veut('S7')) {
            const r = await essayer('S7', () => sDemarrage(env));
            if (r) {
                for (const p of r.profils) {
                    ok('C151', `${p.profil} (${p.vp}, cpu×${p.cpu}) — paramètres consignés, démarrage puis démo et création client fonctionnels`, p.clientCree && p.externes.length === 0, { parametres: p.parametres, boot: p.boot, entreeDemoMs: p.entreeDemoMs, murMs: p.murMs });
                    ok('C141', `${p.profil} (${p.vp}) — écran d'accès ≤ ${SEUILS.lcpMauvaisMs} ms (seuil « mauvais » LCP)`, p.boot.ecranAcces <= SEUILS.lcpMauvaisMs, { ecranAcces: p.boot.ecranAcces, fcp: p.boot.fcp, octets: p.boot.octets });
                    const vide = p.vues.filter((v) => !v.texte && !v.indicateur).map((v) => v.s);
                    ok('C148', `${p.profil} (${p.vp}) — pendant le démarrage, un indicateur de chargement est visible (pas d'écran vide)`, vide.length === 0, { secondesSansRienAfficher: vide, vues: p.vues.map((v) => ({ s: v.s, texte: v.texte.slice(0, 50), ind: v.indicateur, capture: v.capture })) });
                }
                const l = r.lenteur;
                ok('C148', 'Bundle à 20 s — attente signalée, puis lenteur expliquée', l.some((v) => v.texte || v.indicateur) && l.some((v) => /long|lent|connexion|réseau/i.test(v.texte)), l.map((v) => ({ s: v.s, texte: v.texte.slice(0, 80), ind: v.indicateur, capture: v.capture })));
                ok('C148', 'Bundle introuvable — l\'échec est annoncé avec une action (réessayer)', r.echec.some((v) => /impossible|erreur|échec|réessayer|recharger/i.test(v.texte)), r.echec.map((v) => ({ s: v.s, texte: v.texte, capture: v.capture })));
            }
        }
        if (veut('S8')) {
            for (const vp of [BUREAU, MOBILE]) {
                const r = await essayer(`S8_${vp.nom}`, () => sHorsLigneDemo(env, vp));
                if (!r) continue;
                const nouveau = r.devisHorsLigne.apres.filter((n) => !r.devisHorsLigne.avant.includes(n));
                ok('C152', `${vp.nom} — hors ligne : client et devis réellement conservés là où le message l'annonce (cet appareil)`, r.clientHorsLigne.stocke && nouveau.length === 1 && r.devisHorsLigne.toasts.some((t) => /en local/.test(t)) && r.apresRechargement.client && r.apresRechargement.devis.includes(nouveau[0]), { client: r.clientHorsLigne, devis: { ...r.devisHorsLigne, nouveau }, apresRechargement: r.apresRechargement });
                ok('C160', `${vp.nom} — démo hors ligne : aucune promesse de synchronisation (rien n'est synchronisé en démo)`, ![...r.toastCoupure, ...r.toastRetour, r.diagnosticHorsLigne || ''].some((t) => /synchroni/i.test(t)), { coupure: r.toastCoupure, retour: r.toastRetour, diagnostic: r.diagnosticHorsLigne, puce: [r.puceHorsLigne, r.puceRetour] });
                ok('C160', `${vp.nom} — le « Mode Chantier (Hors-Ligne) » annoncé existe ailleurs dans l'interface`, !r.toastCoupure.some((t) => /Mode Chantier/.test(t)), r.toastCoupure);
                ok('C156', `${vp.nom} — retour du réseau : message cohérent avec l'état affiché (démonstration, données locales)`, r.toastRetour.every((t) => !/synchroni/i.test(t)), { toast: r.toastRetour, puce: r.puceRetour });
            }
        }
        if (veut('S9')) {
            const r = await essayer('S9', () => sQuota(env));
            if (r) {
                const succesAnnonce = r.devis.toasts.some((t) => /enregistré en local/.test(t.texte));
                const nouveaux = r.devis.stockes.filter((n) => !r.devis.devisAvant.includes(n));
                ok('C152', 'Stockage local refusé (plein) — enregistrer un devis n\'annonce pas « enregistré » si rien n\'est écrit', !(succesAnnonce && nouveaux.length === 0), r.devis);
                ok('C152', 'Stockage local refusé — créer un client n\'affiche pas un succès non écrit', !(r.client.affiche && !r.client.stocke && !r.client.toasts.some((t) => t.role === 'alert')), r.client);
                ok('C154', 'Nouvel essai après échec d\'écriture — un seul devis, aucun numéro en double', r.essaiApresLiberation.doublons.length === 0, r.essaiApresLiberation);
                ok('C152', 'Après rechargement — ce qui a été annoncé enregistré est bien là', r.apresRechargement.client || !r.client.affiche, r.apresRechargement);
            }
        }
        if (veut('S10')) {
            for (const vp of [BUREAU, MOBILE]) {
                const r = await essayer(`S10_${vp.nom}`, () => sRepetition(env, vp));
                if (!r) continue;
                ok('C154', `${vp.nom} — double clic « Créer le client » et Entrée ×3 : une seule fiche`, r.clients.doubleClic === 1 && r.clients.entree === 1, r.clients);
                ok('C154', `${vp.nom} — triple activation « Enregistrer » d'un nouveau devis : un seul devis, numéro unique`, r.devis.apres === r.devis.avant + 1 && r.devis.doublons.length === 0, r.devis);
            }
        }
        if (veut('S11')) {
            const r = await essayer('S11', () => sDeuxOnglets(env));
            if (r) {
                ok('C158', 'Deux onglets — le client créé dans l\'onglet A survit à la création d\'un client dans l\'onglet B', r.apresB.includes('Client Onglet A') && r.apresB.includes('Client Onglet B'), { apresA: r.apresA, apresB: r.apresB });
                ok('C158', 'Deux onglets — un écrasement est au moins signalé', r.apresB.includes('Client Onglet A') || r.avertissementB.length > 0, r.avertissementB);
                const nA = r.devis.apresA.filter((n) => /DEV-2026-00[2-9]/.test(n)), nB = r.devis.apresB.filter((n) => /DEV-2026-00[2-9]/.test(n));
                ok('C158', 'Deux onglets — deux devis créés : tous deux conservés, numéros distincts', nB.length === 2 && new Set(nB).size === 2, { apresA: r.devis.apresA, apresB: r.devis.apresB });
                ok('C158', 'Onglet A rechargé — retrouve son client', r.rechargementA.includes('Client Onglet A'), r.rechargementA);
            }
        }
        if (veut('S12')) {
            const r = await essayer('S12', () => sServiceWorker(env));
            if (r) {
                const rech = r.premiereVisite.navigations.length > 1;
                ok('C143', '1re visite — l\'activation du service worker ne recharge pas la page pendant une saisie', !rech && Boolean(r.premiereVisite.champEncorePresent), r.premiereVisite);
                ok('C160', 'Hors ligne après une 1re visite — l\'application démarre (écran d\'accès)', r.demarrageHorsLigne?.ecranAcces, { ...r.demarrageHorsLigne, rechargementSansRetardMs: r.rechargementSansRetard });
                if (r.demarrageHorsLigne?.ecranAcces) {
                    ok('C160', 'Hors ligne — démo utilisable : client créé, icônes affichées', r.demarrageHorsLigne.clientCree && r.demarrageHorsLigne.iconesChargees, r.demarrageHorsLigne);
                    ok('C160', 'Hors ligne — le PDF (non mis en cache) échoue franchement, sans faux succès', (r.demarrageHorsLigne.pdf || []).length > 0 && r.demarrageHorsLigne.pdf.every((t) => !/PDF téléchargé/.test(t)), r.demarrageHorsLigne.pdf);
                }
            }
        }
    } finally {
        await nav.close();
        await relais.fermer();
        await fermerServeur();
        mesures.resultats = resultats;
        await writeFile(path.join(PREUVES, scenarios ? `mesures-${scenarios.join('-')}.json` : 'mesures.json'), JSON.stringify(mesures, null, 2));
    }
    return resultats;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const choix = process.argv.slice(2).filter((a) => /^S\d+$/.test(a));
    const resultats = await run({ scenarios: choix.length ? choix : null });
    let echecs = 0;
    for (const r of resultats) {
        if (!r.pass) echecs++;
        console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.label}`);
        console.log(`      ${r.detail.slice(0, 1600)}`);
    }
    console.log(`\n${resultats.length - echecs}/${resultats.length} vérifications réussies.`);
    process.exitCode = echecs ? 1 : 0;
}
