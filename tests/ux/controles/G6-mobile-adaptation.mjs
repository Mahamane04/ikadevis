#!/usr/bin/env node
// Audit UX 220 contrôles (2026-10) — groupe G6 « mobile et adaptation »
// (C111 → C120).
//
// Environnement : Chromium headless (Puppeteer du dépôt), serveur isolé
// 127.0.0.1 (port libre, startServer), config factice (config.example.js),
// toute requête hors 127.0.0.1 BLOQUÉE et consignée, téléchargements refusés.
// Mode Démo, données fictives uniquement. Rien n'est écrit hors du stockage
// local de la page de test.
//
// Gestes réels : toucher (page.touchscreen.tap), molette (page.mouse.wheel),
// glisser au doigt (CDP Input.synthesizeScrollGesture, source « touch »),
// tracé au doigt (CDP Input.dispatchTouchEvent), clavier (page.keyboard :
// Tab, Échap, frappe). Mesures : rectangles, styles calculés, hit-testing
// (document.elementFromPoint), pixels du canevas de signature.
// Émulations : largeur/hauteur (setViewport, isMobile + hasTouch), zones
// sûres (CDP Emulation.setSafeAreaInsetsOverride), clavier virtuel modélisé
// (rétrécissement de la hauteur = comportement « resizes-content »).
//
//   node tests/ux/controles/G6-mobile-adaptation.mjs
//   G6_SEUL=C113,C118 node tests/ux/controles/G6-mobile-adaptation.mjs
import puppeteer from 'puppeteer';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from '../../../scratch/lib/server.mjs';

const CONFIG = await readFile(new URL('../../../config.example.js', import.meta.url), 'utf8');
const PREUVES = fileURLToPath(new URL('../../../docs/audit-ux-220/UX_EVIDENCE/G6-mobile-adaptation/', import.meta.url));
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

const ROUTES = ['#dashboard', '#chantiers', '#clients', '#chiffrage', '#devis', '#factures',
    '#depenses', '#ouvrages', '#materiaux', '#abonnement', '#settings/entreprise'];
const TACTILE = { isMobile: true, hasTouch: true, deviceScaleFactor: 1 };
const BUREAU = { isMobile: false, hasTouch: false, deviceScaleFactor: 1 };
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36';
// Hauteur modélisée d'un clavier virtuel de téléphone (barre de suggestions
// comprise) : 844 → 508 px de zone utile, ordre de grandeur Android / iOS.
const CLAVIER = 336;

const JOURNAL = { externes: new Set(), console: [], captures: [] };

// ─── Bibliothèque injectée dans la page ──────────────────────────────────────
function bibliotheque() {
    if (window.__g6) return;
    const SEL = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], [role="combobox"], [role="option"], [role="radio"], [tabindex]:not([tabindex="-1"])';
    const visible = (el) => {
        if (!el || !el.getBoundingClientRect) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') return false;
        for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
            if (Number(getComputedStyle(e).opacity) < 0.05) return false;
        }
        return true;
    };
    const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
    const nom = (el) => {
        const lb = el.getAttribute && el.getAttribute('aria-labelledby');
        if (lb) {
            const t = norm(lb.split(/\s+/).map((id) => (document.getElementById(id) || {}).textContent || '').join(' '));
            if (t) return t;
        }
        return norm((el.getAttribute && el.getAttribute('aria-label')) || el.innerText || el.placeholder || el.title || el.value || '');
    };
    const dessus = (el, x, y) => {
        const t = document.elementFromPoint(x, y);
        return !!t && (t === el || el.contains(t));
    };
    // Part de la cible réellement « touchable » : grille n×n de points,
    // hit-testing à chaque point situé dans la fenêtre.
    const exposition = (el, n = 5) => {
        const r = el.getBoundingClientRect();
        let tot = 0, vis = 0, horsEcran = 0;
        const couvreurs = {};
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
            const x = r.left + r.width * (i + 0.5) / n, y = r.top + r.height * (j + 0.5) / n;
            tot++;
            if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) { horsEcran++; continue; }
            const t = document.elementFromPoint(x, y);
            if (t && (t === el || el.contains(t))) vis++;
            else if (t) {
                const c = t.closest('nav, header, .quote-totals-bar, [role="dialog"], .fixed, .sticky') || t;
                const k = ((c.getAttribute && c.getAttribute('aria-label')) || String(c.className || c.tagName)).slice(0, 60);
                couvreurs[k] = (couvreurs[k] || 0) + 1;
            }
        }
        return { tot, vis, horsEcran, fraction: +(vis / tot).toFixed(2), couvreurs };
    };
    // Hauteur (px) réellement touchable le long de l'axe vertical central.
    const bandeTouchable = (el) => {
        const r = el.getBoundingClientRect();
        let px = 0;
        const xs = [r.left + r.width * 0.25, r.left + r.width * 0.5, r.left + r.width * 0.75];
        for (let y = Math.ceil(r.top); y < r.bottom; y++) {
            if (y < 0 || y >= innerHeight) continue;
            if (xs.some((x) => x >= 0 && x < innerWidth && dessus(el, x, y))) px++;
        }
        return px;
    };
    const defileur = (el) => {
        for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
            const cs = getComputedStyle(p);
            if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 1) return p;
        }
        return document.scrollingElement;
    };
    const trouver = (src, flags, o = {}) => {
        const re = new RegExp(src, flags);
        const racines = o.dans ? [...document.querySelectorAll(o.dans)].filter(visible) : [document];
        for (const racine of racines) {
            const el = [...racine.querySelectorAll(o.sel || SEL)].filter(visible).find((e) => re.test(nom(e)));
            if (el) return el;
        }
        return null;
    };
    // Plus grand conteneur défilant visible (zone de contenu principale).
    const defileurPrincipal = () => [...document.querySelectorAll('body *')]
        .filter((e) => { const cs = getComputedStyle(e); return /(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 20 && visible(e); })
        .sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0] || null;
    window.__g6 = { SEL, visible, norm, nom, dessus, exposition, bandeTouchable, defileur, trouver, defileurPrincipal };
}
const LIB = `(${bibliotheque.toString()})()`;

// ─── Session ─────────────────────────────────────────────────────────────────
async function toucherOuCliquer(page, x, y) {
    const vp = page.viewport();
    if (vp && vp.hasTouch) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
}

async function entrerEnDemo(page) {
    let pos = null;
    for (let i = 0; i < 30 && !pos; i++) {
        pos = await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Essayer sans compte');
            if (!b) return null;
            b.scrollIntoView({ block: 'center' });
            const r = b.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        if (!pos) await attendre(500);
    }
    if (!pos) throw new Error('Bouton « Essayer sans compte » introuvable');
    await toucherOuCliquer(page, pos.x, pos.y);
    await attendre(2500);
    await page.waitForFunction(() => document.querySelector('h1') && !document.querySelector('.animate-page-spin'), { timeout: 30000 });
    await page.evaluate(LIB);
}

async function nouvellePage(nav, url, vp, { ua } = {}) {
    const page = await nav.newPage();
    page.setDefaultTimeout(30000);
    if (ua) await page.setUserAgent(ua);
    await page.setViewport(vp);
    try {
        const s = await page.createCDPSession();
        await s.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
    } catch (e) { /* sans effet : aucun export n'est déclenché par la sonde */ }
    await page.setRequestInterception(true);
    page.on('request', (r) => {
        const u = new URL(r.url());
        if (u.pathname === '/config.js') return r.respond({ contentType: 'application/javascript', body: CONFIG });
        if (/^https?:$/.test(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname)) { JOURNAL.externes.add(u.hostname); return r.abort(); }
        return r.continue();
    });
    page.on('console', (m) => { if (m.type() === 'error') JOURNAL.console.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => JOURNAL.console.push(`pageerror: ${String(e).slice(0, 200)}`));
    page.on('dialog', (d) => { JOURNAL.console.push(`dialogue natif : ${d.message().slice(0, 80)}`); d.dismiss().catch(() => {}); });
    await page.goto(url + '/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* stockage indisponible */ } });
    await page.reload({ waitUntil: 'networkidle0', timeout: 60000 });
    await entrerEnDemo(page);
    return page;
}

// Navigation par l'adresse. La barre du bas et la barre latérale ne mettent
// pas l'adresse à jour (voir UX-P2-06) : si l'adresse vaut déjà la cible, on
// passe d'abord par un autre écran pour forcer l'affichage demandé.
async function aller(page, hash) {
    const deja = await page.evaluate((h) => location.hash === h, hash);
    if (deja) {
        await page.evaluate((h) => { location.hash = h === '#dashboard' ? '#devis' : '#dashboard'; }, hash);
        await attendre(900);
    }
    await page.evaluate((h) => { location.hash = h; }, hash);
    await attendre(1300);
    await page.waitForFunction(() => !document.querySelector('.animate-page-spin'), { timeout: 15000 }).catch(() => {});
    await page.evaluate(LIB);
}

async function capture(page, nom) {
    const fichier = path.join(PREUVES, `${nom}.png`);
    await page.screenshot({ path: fichier });
    JOURNAL.captures.push(path.relative(fileURLToPath(new URL('../../../', import.meta.url)), fichier));
    return `UX_EVIDENCE/G6-mobile-adaptation/${nom}.png`;
}

async function localiser(page, motif, opts = {}) {
    await page.evaluate(LIB);
    return page.evaluate((src, flags, o) => {
        const g = window.__g6;
        const el = g.trouver(src, flags, o);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const sc = g.defileur(el);
        const sr = (sc === document.scrollingElement || sc === document.body)
            ? { top: 0, bottom: innerHeight, left: 0, right: innerWidth } : sc.getBoundingClientRect();
        let x = r.left + r.width / 2, y = r.top + r.height / 2;
        let ok = g.dessus(el, x, y);
        if (!ok) {
            // Le centre est recouvert : un utilisateur viserait la partie visible.
            outer: for (let j = 1; j < 10; j++) for (let i = 1; i < 6; i++) {
                const px = r.left + r.width * i / 6, py = r.top + r.height * j / 10;
                if (px >= 0 && py >= 0 && px < innerWidth && py < innerHeight && g.dessus(el, px, py)) { x = px; y = py; ok = true; break outer; }
            }
        }
        return {
            x, y, top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height, nom: g.nom(el),
            sc: { top: Math.max(0, sr.top), bottom: Math.min(innerHeight, sr.bottom), left: Math.max(0, sr.left), right: Math.min(innerWidth, sr.right) },
            dessus: ok, desactive: el.disabled === true || el.getAttribute('aria-disabled') === 'true'
        };
    }, motif.source, motif.flags, opts);
}

// Amène l'élément dans sa zone de défilement À LA MOLETTE (pas de scrollIntoView).
async function amenerEnVue(page, motif, opts = {}) {
    let precedent = null;
    for (let i = 0; i < 14; i++) {
        const loc = await localiser(page, motif, opts);
        if (!loc) return null;
        const vh = page.viewport().height, vw = page.viewport().width;
        const dansZone = loc.top >= loc.sc.top - 1 && loc.bottom <= loc.sc.bottom + 1 && loc.y >= 0 && loc.y <= vh;
        if (dansZone && loc.dessus) return loc;
        if (precedent && Math.abs(precedent.top - loc.top) < 1) return loc; // plus rien ne défile
        precedent = loc;
        const milieu = (loc.sc.top + loc.sc.bottom) / 2;
        const delta = Math.max(-450, Math.min(450, (loc.top + loc.h / 2) - milieu));
        if (Math.abs(delta) < 2) return loc;
        await page.mouse.move(Math.min(Math.max(loc.sc.left + 10, (loc.sc.left + loc.sc.right) / 2), vw - 5), Math.min(Math.max(5, milieu), vh - 5));
        await page.mouse.wheel({ deltaY: delta });
        await attendre(380);
    }
    return localiser(page, motif, opts);
}

async function taper(page, motif, opts = {}) {
    const loc = await amenerEnVue(page, motif, opts);
    if (!loc) throw new Error(`introuvable : ${motif}`);
    if (!loc.dessus && !opts.forcer) throw new Error(`recouvert, impossible à toucher : ${loc.nom}`);
    await toucherOuCliquer(page, loc.x, loc.y);
    await attendre(opts.attente ?? 1000);
    await page.evaluate(LIB);
    return loc;
}

const titre = (page) => page.evaluate(() => { const h = document.querySelector('h1'); return h ? h.innerText.replace(/\s+/g, ' ').trim() : ''; });

// Défilement réel du conteneur principal : molette puis glisser au doigt.
async function eprouverDefilement(page) {
    await page.evaluate(LIB);
    const etat = () => page.evaluate(() => {
        const g = window.__g6;
        const sc = g.defileurPrincipal();
        const r = sc ? sc.getBoundingClientRect() : null;
        const pt = r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 220)) } : null;
        const dessus = pt ? document.elementFromPoint(pt.x, pt.y) : null;
        const voile = dessus && dessus.closest('.fixed.inset-0, [role="dialog"], [aria-modal="true"]');
        return {
            defileur: !!sc, pt, scrollTop: sc ? Math.round(sc.scrollTop) : null, max: sc ? sc.scrollHeight - sc.clientHeight : 0,
            body: getComputedStyle(document.body).overflow, html: getComputedStyle(document.documentElement).overflow,
            voile: voile ? (voile.getAttribute('aria-label') || String(voile.className).slice(0, 60)) : null
        };
    });
    const e0 = await etat();
    if (!e0.defileur) return { ...e0, molette: 0, doigt: 0 };
    const sens = e0.scrollTop < e0.max - 320 ? 1 : -1;
    await page.mouse.move(e0.pt.x, e0.pt.y);
    await page.mouse.wheel({ deltaY: 300 * sens });
    await attendre(450);
    const e1 = await etat();
    const cdp = await page.createCDPSession();
    await cdp.send('Input.synthesizeScrollGesture', { x: e0.pt.x, y: e0.pt.y, xDistance: 0, yDistance: -250 * sens, gestureSourceType: 'touch', speed: 1500, preventFling: true });
    await attendre(500);
    const e2 = await etat();
    await cdp.detach().catch(() => {});
    return { ...e0, molette: e1.scrollTop - e0.scrollTop, doigt: e2.scrollTop - e1.scrollTop };
}

// ═════════════════════════════════════════════════════════════════════════════
// C111 — largeurs cibles et intermédiaires
// ═════════════════════════════════════════════════════════════════════════════
function mesurerRupture() {
    const g = window.__g6;
    const vw = document.documentElement.clientWidth, vh = innerHeight;
    const debordement = Math.max(0, document.scrollingElement.scrollWidth - vw);
    const echappes = [];
    for (const el of document.querySelectorAll('body *')) {
        const inter = el.matches(g.SEL);
        const feuille = el.children.length === 0 && g.norm(el.textContent).length > 1;
        if (!inter && !feuille) continue;
        const r = el.getBoundingClientRect();
        if (r.right <= vw + 1 && r.left >= -1) continue;
        if (!g.visible(el) || el.closest('[aria-hidden="true"], [inert], .sr-only')) continue;
        let contenu = false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            if (getComputedStyle(p).overflowX !== 'visible') {
                const pr = p.getBoundingClientRect();
                if (pr.right <= vw + 1 && pr.left >= -1) { contenu = true; break; }
            }
        }
        if (!contenu) echappes.push({ texte: g.nom(el).slice(0, 40) || el.tagName, gauche: Math.round(r.left), droite: Math.round(r.right) });
    }
    const couche = (e) => e.closest('.mobile-bottom-nav, .global-top-bar, .quote-totals-bar, aside, [role="dialog"], .fixed, .sticky');
    const champ = (e) => /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName);
    const inter = [...document.querySelectorAll(g.SEL)]
        .filter((e) => g.visible(e) && !e.closest('.sr-only'))
        .map((e) => ({ e, r: e.getBoundingClientRect(), c: couche(e) }))
        .filter(({ r }) => r.width >= 2 && r.height >= 2 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw);
    const collisions = [];
    for (let i = 0; i < inter.length; i++) for (let j = i + 1; j < inter.length; j++) {
        const a = inter[i], b = inter[j];
        if (a.c !== b.c || a.e.contains(b.e) || b.e.contains(a.e)) continue;
        const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ix <= 3 || iy <= 3) continue;
        const aMin = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
        const part = (ix * iy) / aMin;
        if (part < 0.15) continue;
        const grand = a.r.width * a.r.height >= b.r.width * b.r.height ? a : b;
        if (part > 0.98 && champ(grand.e)) continue; // bouton intégré dans un champ (effacer, loupe…)
        collisions.push({ a: g.nom(a.e).slice(0, 35), b: g.nom(b.e).slice(0, 35), part: +part.toFixed(2) });
    }
    // Commandes rognées par un ancêtre `overflow: hidden` (ni défilable ni visible en entier).
    const rognes = [];
    for (const { e, r } of inter) {
        for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
            const cs = getComputedStyle(p);
            if (/(auto|scroll)/.test(cs.overflowX)) break;
            if (!/(hidden|clip)/.test(cs.overflowX)) continue;
            const pr = p.getBoundingClientRect();
            const part = Math.max(0, Math.min(r.right, pr.right) - Math.max(r.left, pr.left)) / r.width;
            if (part > 0.05 && part < 0.9) rognes.push({ nom: g.nom(e).slice(0, 35) || e.tagName, visible: Math.round(part * 100) + ' %' });
            break;
        }
    }
    const h1 = document.querySelector('h1');
    const rh = h1 && h1.getBoundingClientRect();
    const titreOk = !!h1 && g.visible(h1) && rh.left >= -1 && rh.right <= vw + 1;
    const reglages = !!document.querySelector('.settings-page-shell');
    let navOk, navDetail;
    if (vw < 768) {
        const nav = document.querySelector('.mobile-bottom-nav');
        const boutons = nav ? [...nav.querySelectorAll('button')].filter(g.visible) : [];
        const dedans = boutons.length > 0 && boutons.every((b) => { const r = b.getBoundingClientRect(); return r.left >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1; });
        navOk = (boutons.length >= 5 && dedans) || (reglages && !!g.trouver('Retour|Fermer', 'i'));
        navDetail = `barre du bas ${boutons.length} boutons${dedans ? '' : ' hors écran'}${reglages ? ', écran plein « réglages »' : ''}`;
    } else {
        const aside = [...document.querySelectorAll('aside')].find(g.visible);
        const ra = aside && aside.getBoundingClientRect();
        navOk = (!!aside && ra.right <= vw + 1) || reglages;
        navDetail = aside ? `barre latérale ${Math.round(ra.width)} px` : (reglages ? 'écran plein « réglages »' : 'aucune navigation');
    }
    const main = document.querySelector('#main-content');
    let ellipses = 0;
    const coupes = [];
    for (const el of document.querySelectorAll('body *')) {
        if (el.scrollWidth <= el.clientWidth + 2) continue;
        const cs = getComputedStyle(el);
        if (cs.overflowX === 'visible' || !g.visible(el)) continue;
        if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2)) continue;
        if (cs.textOverflow === 'ellipsis') ellipses++;
        else if (/(hidden|clip)/.test(cs.overflowX)) coupes.push(g.norm(el.textContent).slice(0, 40));
    }
    return {
        vw, vh, hash: location.hash, h1: h1 ? g.norm(h1.innerText).slice(0, 40) : null,
        debordement, nbEchappes: echappes.length, echappes: echappes.slice(0, 6),
        nbCollisions: collisions.length, collisions: collisions.slice(0, 6),
        nbRognes: rognes.length, rognes: rognes.slice(0, 6),
        titreOk, navOk, navDetail, largeurContenu: main ? Math.round(main.getBoundingClientRect().width) : null,
        ellipses, nbCoupes: coupes.length, coupes: coupes.slice(0, 5)
    };
}

async function c111(nav, url, M) {
    const R = [];
    const groupes = [
        { opts: TACTILE, tailles: [[320, 568], [360, 740], [375, 667], [390, 844], [414, 896], [600, 960], [767, 1024], [768, 1024], [820, 1180], [1023, 768]] },
        { opts: BUREAU, tailles: [[1024, 768], [1280, 800], [1440, 900]] }
    ];
    M.combinaisons = [];
    const aCapturer = new Set(['320x568#dashboard', '320x568#chiffrage', '768x1024#dashboard', '1023x768#chiffrage', '600x960#devis']);
    for (const gp of groupes) {
        const [w0, h0] = gp.tailles[0];
        const page = await nouvellePage(nav, url, { width: w0, height: h0, ...gp.opts });
        try {
            for (const [w, h] of gp.tailles) {
                await page.setViewport({ width: w, height: h, ...gp.opts });
                await attendre(600);
                const defauts = [];
                let ellipses = 0, coupes = 0;
                for (const route of ROUTES) {
                    await aller(page, route);
                    const m = await page.evaluate(mesurerRupture);
                    M.combinaisons.push({ taille: `${w}x${h}`, route, ...m });
                    ellipses += m.ellipses; coupes += m.nbCoupes;
                    const ko = m.debordement > 0 || m.nbEchappes > 0 || m.nbCollisions > 0 || m.nbRognes > 0 || !m.titreOk || !m.navOk;
                    if (ko) defauts.push(`${route}: débord ${m.debordement}, échappés ${m.nbEchappes}${m.nbEchappes ? ' ' + JSON.stringify(m.echappes.slice(0, 2)) : ''}, collisions ${m.nbCollisions}${m.nbCollisions ? ' ' + JSON.stringify(m.collisions.slice(0, 2)) : ''}, rognées ${m.nbRognes}${m.nbRognes ? ' ' + JSON.stringify(m.rognes.slice(0, 2)) : ''}, titre ${m.titreOk ? 'ok' : 'KO'}, nav ${m.navOk ? 'ok' : 'KO (' + m.navDetail + ')'}`);
                    const cle = `${w}x${h}${route}`;
                    if (aCapturer.has(cle) || (ko && defauts.length <= 2)) await capture(page, `C111_${w}x${h}_${route.replace(/[#/]/g, '_')}`);
                }
                R.push({ label: `C111 · ${w}×${h} (${gp.opts.isMobile ? 'tactile' : 'bureau'}) · 11 écrans sans rupture (débordement, élément hors cadre, chevauchement, commande rognée, titre, navigation)`, pass: defauts.length === 0, detail: defauts.length ? defauts.join(' | ') : `0 défaut · textes en ellipse ${ellipses} · textes coupés sans ellipse ${coupes}` });
            }
        } finally { await page.close(); }
    }
    return R;
}

// ═════════════════════════════════════════════════════════════════════════════
// C112 — l'affichage étroit réorganise sans supprimer l'essentiel
// ═════════════════════════════════════════════════════════════════════════════
async function c112(nav, url, M) {
    const R = [];
    // A. Inventaire comparé des actions par écran (hors navigation et barre du haut).
    const inventaire = {};
    for (const [cle, vp] of [['1440', { width: 1440, height: 900, ...BUREAU }], ['390', { width: 390, height: 844, ...TACTILE }]]) {
        const page = await nouvellePage(nav, url, vp);
        try {
            for (const route of ROUTES) {
                await aller(page, route);
                inventaire[cle + route] = await page.evaluate(() => {
                    const g = window.__g6;
                    return [...new Set([...document.querySelectorAll(g.SEL)]
                        .filter((e) => g.visible(e) && !e.closest('aside, .global-top-bar, .mobile-bottom-nav, .sr-only'))
                        .map((e) => g.nom(e).slice(0, 60)).filter(Boolean))];
                });
            }
            inventaire[cle + '|entete'] = await page.evaluate(() => {
                const g = window.__g6;
                const h = document.querySelector('.global-top-bar');
                return h ? [...h.querySelectorAll(g.SEL)].filter(g.visible).map((e) => g.nom(e).slice(0, 60)) : [];
            });
        } finally { await page.close(); }
    }
    M.inventaire = inventaire;
    const absents = {};
    for (const route of ROUTES) {
        const b = new Set(inventaire['390' + route].map((s) => s.toLowerCase()));
        absents[route] = inventaire['1440' + route].filter((s) => !b.has(s.toLowerCase()));
    }
    M.absentsA390 = absents;
    const absentsListes = ROUTES.filter((r) => r !== '#chiffrage' && !/settings|abonnement/.test(r)).filter((r) => absents[r].length);
    R.push({ label: 'C112 · Écrans de liste (8) : toute action visible à 1440 existe aussi à 390', pass: absentsListes.length === 0, detail: absentsListes.length ? absentsListes.map((r) => `${r}: ${absents[r].join(' ; ')}`).join(' | ') : 'aucune action de contenu perdue' });
    R.push({ label: 'C112 · Réglages : les 10 sections du menu latéral restent accessibles à 390 (liste déroulante « Section des paramètres »)', pass: inventaire['390#settings/entreprise'].some((s) => /Section des paramètres/.test(s)), detail: `absents à 390 : ${absents['#settings/entreprise'].length} entrées de menu ; remplacées par : ${inventaire['390#settings/entreprise'].filter((s) => /Section/.test(s)).join(', ')}` });

    // B. Atteindre chaque destination au doigt à 390.
    const page = await nouvellePage(nav, url, { width: 390, height: 844, ...TACTILE });
    try {
        const NAVB = { dans: '.mobile-bottom-nav' };
        const MENU = { dans: '[role="dialog"][aria-label="Menu"]' };
        const parcours = [
            ['Accueil', [[/^Accueil$/, NAVB]], /Espace/],
            ['Mes devis', [[/^Devis$/, NAVB]], /Mes devis/],
            ['Chantiers', [[/^Chantiers$/, NAVB]], /^Chantiers/],
            ['Factures', [[/^Factures$/, NAVB]], /^Factures/],
            ['Clients', [[/^Ouvrir le menu de navigation$/, NAVB], [/^Clients & CRM$/, MENU]], /^Clients/],
            ['Dépenses', [[/^Ouvrir le menu de navigation$/, NAVB], [/^Dépenses/, MENU]], /Dépenses/],
            ['Ouvrages', [[/^Ouvrir le menu de navigation$/, NAVB], [/^Ouvrages$/, MENU]], /Catalogue des Ouvrages/],
            ['Matériaux', [[/^Ouvrir le menu de navigation$/, NAVB], [/^Prix des Matériaux$/, MENU]], /Ressources/],
            ['Nouveau devis', [[/^Devis$/, NAVB], [/^Nouveau devis$/, {}]], /Chiffrage/],
            ['Paramètres', [[/^Ouvrir le menu de navigation$/, NAVB], [/^Paramètres/, MENU]], /Paramètres/]
        ];
        const echecs = [];
        for (const [nom, etapes, attendu] of parcours) {
            try {
                await aller(page, '#dashboard');
                for (const [motif, o] of etapes) await taper(page, motif, { ...o, attente: 1500 });
                const t = await titre(page);
                if (!attendu.test(t)) echecs.push(`${nom} → « ${t} »`);
            } catch (e) { echecs.push(`${nom} : ${e.message}`); }
        }
        R.push({ label: 'C112 · 390 px : les 10 destinations principales s’atteignent au doigt (barre du bas ou menu)', pass: echecs.length === 0, detail: echecs.length ? echecs.join(' | ') : '10/10 atteintes (Accueil, Mes devis, Chantiers, Factures, Clients, Dépenses, Ouvrages, Ressources, Nouveau devis, Paramètres)' });

        // Formule / abonnement depuis le menu mobile.
        await aller(page, '#dashboard');
        await taper(page, /^Ouvrir le menu de navigation$/, NAVB);
        const banniere = await localiser(page, /Formule/, { dans: '[role="dialog"][aria-label="Menu"]', sel: 'div.cursor-pointer' });
        let formuleOk = false;
        if (banniere) {
            await toucherOuCliquer(page, banniere.x, banniere.y);
            await attendre(1300);
            formuleOk = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].some((d) => d.getBoundingClientRect().width > 0 && /Formule|offre|Abonnement|Standard/i.test(d.innerText)));
            await page.keyboard.press('Escape');
            await attendre(800);
        }
        R.push({ label: 'C112 · 390 px : formule / abonnement accessible depuis le menu', pass: formuleOk, detail: banniere ? `bannière « ${banniere.nom.slice(0, 50)} »` : 'bannière introuvable' });

        // C. Éditeur de devis : fonctions présentes sur téléphone.
        await aller(page, '#chiffrage');
        const present = async (motif, o = {}) => !!(await localiser(page, motif, o));
        const editeur = {
            'Client du devis': await present(/^Client du devis$/),
            'Chantier du devis': await present(/^Chantier du devis$/),
            'Ajouter un lot': await present(/Ajouter un (nouveau )?lot/),
            'Importer Excel / CSV': await present(/Importer Excel/)
        };
        await taper(page, /^Afficher le détail du chiffrage/);
        editeur['Taux de TVA'] = await present(/^Taux de TVA du devis$/);
        editeur['Aperçu PDF'] = await present(/^Aperçu PDF$/);
        editeur['Enregistrer'] = await present(/^Enregistrer$/);
        await taper(page, /^Masquer le détail du chiffrage/).catch(() => {});
        await taper(page, /^01 Lot 01/, { attente: 1500 });
        for (const [k, m] of [['Ajouter un ouvrage', /^Ajouter un ouvrage au lot$/], ['Ligne libre', /Ajouter une ligne libre/], ['Options du lot', /^Options du lot$/], ['Renommer le lot', /^Renommer le lot/], ['Synthèse des lots', /^Synthèse des lots$/]]) editeur[k] = await present(m);
        const annulerRetablir = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /Annuler la modification|Rétablir la modification/.test(b.getAttribute('aria-label') || '')).map((b) => ({ nom: b.getAttribute('aria-label').slice(0, 30), visible: window.__g6.visible(b), affichage: getComputedStyle(b.parentElement).display })));
        editeur['Annuler / Rétablir (historique)'] = annulerRetablir.some((b) => b.visible);
        M.editeur390 = { editeur, annulerRetablir };
        const manquants = Object.entries(editeur).filter(([, v]) => !v).map(([k]) => k);
        R.push({ label: 'C112 · Éditeur de devis à 390 : client, chantier, lots, ouvrages, TVA, aperçu, enregistrement, annuler/rétablir', pass: manquants.length === 0, detail: manquants.length ? `absents : ${manquants.join(', ')} — boutons d’historique présents dans le DOM mais masqués (${JSON.stringify(annulerRetablir)})` : 'tout présent' });

        // D. Fonctions de la barre du haut (recherche globale, organisation).
        await aller(page, '#dashboard');
        const surfaces = {};
        surfaces.entete = await page.evaluate(() => { const g = window.__g6; return [...document.querySelectorAll('.global-top-bar ' + 'button, a[href], input')].filter(g.visible).map((e) => g.nom(e).slice(0, 50)); });
        await taper(page, /^Menu du profil utilisateur$/);
        surfaces.menuProfil = await page.evaluate(() => { const g = window.__g6; return [...document.querySelectorAll(g.SEL)].filter((e) => g.visible(e) && !e.closest('.mobile-bottom-nav, #main-content')).map((e) => g.nom(e).slice(0, 50)); });
        await page.keyboard.press('Escape'); await attendre(500);
        await taper(page, /^Ouvrir le menu de navigation$/, NAVB);
        surfaces.menuMobile = await page.evaluate(() => { const g = window.__g6; const d = document.querySelector('[role="dialog"][aria-label="Menu"]'); return d ? [...d.querySelectorAll('button, div.cursor-pointer')].filter(g.visible).map((e) => g.nom(e).slice(0, 50)) : []; });
        await taper(page, /^Fermer le menu$/, MENU).catch(() => {});
        M.surfaces390 = surfaces;
        const tout = [...surfaces.entete, ...surfaces.menuProfil, ...surfaces.menuMobile].join(' | ');
        R.push({ label: 'C112 · 390 px : changement d’organisation (présent dans la barre du haut à 1440) reste accessible', pass: /organisation/i.test(tout), detail: `barre du haut 1440 : « ${inventaire['1440|entete'].filter((s) => /organisation/i.test(s)).join('') || '—'} » ; à 390 cherché dans barre du haut, menu du profil, menu mobile : ${/organisation/i.test(tout) ? 'trouvé' : 'absent'} (menu profil : ${surfaces.menuProfil.filter((s) => !/Démonstration|Paramètres du compte|Menu du profil|Tableau de bord/.test(s)).slice(0, 6).join(' · ')})` });
        R.push({ label: 'C112 · 390 px : recherche globale (présente à 1440) ou équivalent', pass: /Recherche globale/i.test(tout), detail: `à 1440 : « ${inventaire['1440|entete'].filter((s) => /Recherche/i.test(s)).join('') || '—'} » ; à 390 : ${/Recherche globale/i.test(tout) ? 'présente' : 'absente (seules les recherches propres à chaque liste existent)'}` });

        // E. Fiche devis à 390 : actions principales et menu « Plus ».
        await aller(page, '#devis');
        await taper(page, /^Afficher le devis DEV-2026-001/, { attente: 1800 });
        const fiche = {};
        for (const [k, m] of [['Statut', /^Statut du devis$/], ['Client / chantier', /^Modifier le client et le chantier$/], ['Envoyer', /^Envoyer le devis/], ['PDF', /^Télécharger le devis en PDF$/], ['Facturer', /^Facturer le devis/], ['Modifier', /^Modifier le devis/], ['Plus d’actions', /^Plus d.actions sur le devis$/]]) fiche[k] = await present(m);
        await taper(page, /^Plus d.actions sur le devis$/);
        fiche['Partager'] = await present(/^Partager le devis$/);
        fiche['Signer'] = await present(/^Signer le devis$/);
        fiche['Imprimer'] = await present(/^Imprimer$/);
        await taper(page, /^Plus d.actions sur le devis$/).catch(() => {});
        const manq = Object.entries(fiche).filter(([, v]) => !v).map(([k]) => k);
        R.push({ label: 'C112 · Fiche devis à 390 : statut, client/chantier, envoyer, PDF, facturer, modifier, partager, signer, imprimer', pass: manq.length === 0, detail: manq.length ? `absents : ${manq.join(', ')}` : '10/10 présentes' });
    } finally { await page.close(); }
    return R;
}

// ═════════════════════════════════════════════════════════════════════════════
// C113 — tableaux à deux dimensions
// ═════════════════════════════════════════════════════════════════════════════
function mesurerListeDevis() {
    const g = window.__g6;
    const vw = document.documentElement.clientWidth;
    const table = [...document.querySelectorAll('table')].find(g.visible);
    const debordementDoc = document.scrollingElement.scrollWidth - vw;
    if (table) {
        let sc = null;
        for (let p = table.parentElement; p; p = p.parentElement) { if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) { sc = p; break; } }
        const zone = sc ? sc.getBoundingClientRect() : { left: 0, right: vw };
        const ths = [...table.querySelectorAll('thead th')].map((th) => { const r = th.getBoundingClientRect(); return { t: g.norm(th.innerText), left: r.left, right: r.right }; });
        const horsZone = ths.filter((t) => t.right > Math.min(zone.right, vw) + 1 || t.left < Math.max(zone.left, 0) - 1).map((t) => t.t);
        return { mode: 'tableau', colonnes: ths.map((t) => t.t), horsZone, defilementH: sc ? sc.scrollWidth - sc.clientWidth : 0, debordementDoc };
    }
    const carte = g.trouver('^Afficher le devis DEV-2026-001', '');
    const t = carte ? g.norm(carte.innerText) : '';
    const r = carte ? carte.getBoundingClientRect() : null;
    return {
        mode: 'cartes', debordementDoc, dansEcran: !!r && r.left >= 0 && r.right <= vw,
        contenu: { client: /Société Immobilière NBB/.test(t), chantier: /Construction Siège NBB/.test(t), numero: /DEV-2026-001/.test(t), date: /\d{2}\/\d{2}\/\d{4}/.test(t), montant: /FCFA/.test(t), statut: /Accepté/.test(t), supprimer: !!g.trouver('^Supprimer le devis DEV-2026-001', '') }
    };
}

function mesurerDocument() {
    const g = window.__g6;
    const vw = document.documentElement.clientWidth;
    const doc = [...document.querySelectorAll('.saved-quote-document')].find(g.visible);
    if (!doc) return null;
    const r = doc.getBoundingClientRect();
    const cellules = [...doc.querySelectorAll('td')].filter((td) => g.visible(td) && g.norm(td.innerText));
    const etiquetees = cellules.filter((td) => td.hasAttribute('data-label') && !/none|normal/.test(getComputedStyle(td, '::before').content));
    const lignes = [...doc.querySelectorAll('tr.commercial-line, .commercial-line')].filter(g.visible).length;
    let sc = null;
    for (let p = doc.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth + 2) { sc = p; break; }
    }
    let minPx = Infinity;
    for (const td of cellules) minPx = Math.min(minPx, parseFloat(getComputedStyle(td).fontSize));
    return {
        mode: doc.classList.contains('document-paper') ? 'papier' : (doc.classList.contains('document-mobile-read') ? 'lecture mobile' : 'autre'),
        largeur: Math.round(r.width), gauche: Math.round(r.left), droite: Math.round(r.right), vw,
        debordementDoc: document.scrollingElement.scrollWidth - vw,
        cellules: cellules.length, etiquetees: etiquetees.length, lignes,
        defileurH: sc ? { clientWidth: sc.clientWidth, scrollWidth: sc.scrollWidth, overflowX: getComputedStyle(sc).overflowX } : null,
        policeMinPx: Number.isFinite(minPx) ? +minPx.toFixed(1) : null,
        aide: /Faites défiler horizontalement/.test(document.body.innerText),
        metaViewport: document.querySelector('meta[name="viewport"]')?.content || ''
    };
}

function mesurerTableFacturer() {
    const g = window.__g6;
    const dlg = [...document.querySelectorAll('.fixed.inset-0, [role="dialog"]')].filter(g.visible).find((d) => /Facturer DEV-/.test(d.innerText));
    const table = dlg && dlg.querySelector('table');
    if (!table) return null;
    let sc = table.parentElement;
    const zr = sc.getBoundingClientRect();
    const part = (el) => { const r = el.getBoundingClientRect(); return +(Math.max(0, Math.min(r.right, zr.right) - Math.max(r.left, zr.left)) / r.width).toFixed(2); };
    const ths = [...table.querySelectorAll('th')].map((th) => ({ t: g.norm(th.innerText), visible: part(th) }));
    const champs = [...table.querySelectorAll('input')].map((i) => ({ visible: part(i), gauche: Math.round(i.getBoundingClientRect().left) }));
    const premiere = table.querySelector('td');
    return {
        overflowX: getComputedStyle(sc).overflowX, clientWidth: sc.clientWidth, scrollWidth: sc.scrollWidth, scrollLeft: Math.round(sc.scrollLeft),
        zone: { gauche: Math.round(zr.left), droite: Math.round(zr.right) }, ths, champs,
        premiereColonneFigee: premiere ? getComputedStyle(premiere).position === 'sticky' : false,
        indiceDefilement: /défil|glisse/i.test(dlg.innerText)
    };
}

async function c113(nav, url, M) {
    const R = [];
    // T1 — Liste des devis : 4 largeurs.
    M.listeDevis = {};
    for (const [opts, tailles] of [[TACTILE, [[390, 844], [768, 1024]]], [BUREAU, [[1024, 768], [1440, 900]]]]) {
        const page = await nouvellePage(nav, url, { width: tailles[0][0], height: tailles[0][1], ...opts });
        try {
            for (const [w, h] of tailles) {
                await page.setViewport({ width: w, height: h, ...opts });
                await aller(page, '#dashboard');
                await aller(page, '#devis');
                const m = await page.evaluate(mesurerListeDevis);
                if (m.mode === 'tableau') {
                    const sup = () => page.evaluate(() => { const g = window.__g6; const b = g.trouver('^Supprimer le devis DEV-2026-001', ''); if (!b) return null; const r = b.getBoundingClientRect(); return { gauche: Math.round(r.left), droite: Math.round(r.right), fraction: g.exposition(b, 4).fraction, x: r.left - 200, y: r.top + r.height / 2 }; });
                    m.supprimer = await sup();
                    if (m.supprimer) {
                        if (opts.hasTouch) {
                            const cdp = await page.createCDPSession();
                            await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(m.supprimer.x), y: Math.round(m.supprimer.y), xDistance: -250, yDistance: 0, gestureSourceType: 'touch', speed: 1200, preventFling: true });
                            await cdp.detach().catch(() => {});
                        } else { await page.mouse.move(m.supprimer.x, m.supprimer.y); await page.mouse.wheel({ deltaX: 250 }); }
                        await attendre(600);
                        m.supprimerApresGlisser = await sup();
                    }
                }
                M.listeDevis[`${w}x${h}`] = m;
                if (w === 390 || w === 768) await capture(page, `C113_liste_devis_${w}`);
                const ok = m.mode === 'tableau'
                    ? m.horsZone.length === 0 && m.debordementDoc <= 0 && (!m.supprimer || m.supprimer.fraction === 1)
                    : m.debordementDoc <= 0 && m.dansEcran && Object.values(m.contenu).every(Boolean);
                R.push({ label: `C113 · Liste des devis ${w}×${h} : ${m.mode === 'tableau' ? 'tableau 6 colonnes entièrement lisible' : 'cartes reprenant les 6 colonnes du tableau'}`, pass: ok, detail: JSON.stringify(m).slice(0, 300) });
            }
        } finally { await page.close(); }
    }

    // T2/T3/T4 — Document du devis et tableau de facturation à 390.
    const page = await nouvellePage(nav, url, { width: 390, height: 844, ...TACTILE });
    try {
        await aller(page, '#devis');
        await taper(page, /^Afficher le devis DEV-2026-001/, { attente: 1800 });
        const lecture = await page.evaluate(mesurerDocument);
        M.documentLecture = lecture;
        R.push({ label: 'C113 · Fiche devis 390 (lecture mobile) : chaque ligne du tableau devient une carte étiquetée, sans défilement horizontal', pass: !!lecture && lecture.mode === 'lecture mobile' && lecture.debordementDoc <= 0 && lecture.droite <= 390 && lecture.etiquetees >= 3, detail: JSON.stringify(lecture) });
        await amenerEnVue(page, /^Voir la mise en page imprimable$/);
        await capture(page, 'C113_document_lecture_mobile_390');
        await taper(page, /^Voir la mise en page imprimable$/, { attente: 1500 });
        const papier = await page.evaluate(mesurerDocument);
        M.documentPapier = papier;
        let defilementPapier = null;
        if (papier && papier.defileurH) {
            const zone = await page.evaluate(() => {
                const doc = [...document.querySelectorAll('.saved-quote-document')].find((d) => d.getBoundingClientRect().width > 0);
                let sc = null;
                for (let p = doc.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth + 2) { sc = p; break; } }
                const r = sc.getBoundingClientRect();
                const y = Math.max(r.top + 40, Math.min(r.bottom - 40, innerHeight / 2));
                return { x: r.left + r.width / 2, y, avant: sc.scrollLeft };
            });
            const cdp = await page.createCDPSession();
            await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(zone.x), y: Math.round(zone.y), xDistance: -220, yDistance: 0, gestureSourceType: 'touch', speed: 1200, preventFling: true });
            await attendre(600);
            await cdp.detach().catch(() => {});
            const apres = await page.evaluate(() => {
                const doc = [...document.querySelectorAll('.saved-quote-document')].find((d) => d.getBoundingClientRect().width > 0);
                for (let p = doc.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth + 2) return p.scrollLeft; }
                return null;
            });
            defilementPapier = { avant: zone.avant, apres };
        }
        await capture(page, 'C113_document_papier_390');
        R.push({ label: 'C113 · Fiche devis 390 (mise en page imprimable) : document A4 dans une zone à défilement horizontal propre, consigne affichée, zoom non bloqué', pass: !!papier && papier.mode === 'papier' && papier.debordementDoc <= 0 && !!papier.defileurH && !!defilementPapier && defilementPapier.apres > defilementPapier.avant && papier.aide && !/user-scalable=no|maximum-scale=1(\.0)?\b/.test(papier.metaViewport), detail: `${JSON.stringify(papier)} · glisser au doigt : scrollLeft ${JSON.stringify(defilementPapier)}` });
        await taper(page, /^Revenir à la lecture mobile$/).catch(() => {});

        // T4 — Fenêtre « Facturer » : tableau des lots (5 colonnes).
        await taper(page, /^Facturer le devis DEV-2026-001$/, { attente: 1600 });
        const f0 = await page.evaluate(mesurerTableFacturer);
        await capture(page, 'C113_facturer_tableau_390_avant');
        let f1 = null;
        if (f0) {
            const pt = await page.evaluate(() => {
                const dlg = [...document.querySelectorAll('.fixed.inset-0, [role="dialog"]')].find((d) => d.getBoundingClientRect().width > 0 && /Facturer DEV-/.test(d.innerText));
                const tr = dlg.querySelector('tbody tr');
                const r = tr.getBoundingClientRect();
                return { x: Math.round(r.left + Math.min(r.width, 300) / 2), y: Math.round(r.top + r.height / 2) };
            });
            const cdp = await page.createCDPSession();
            await cdp.send('Input.synthesizeScrollGesture', { x: pt.x, y: pt.y, xDistance: -300, yDistance: 0, gestureSourceType: 'touch', speed: 1200, preventFling: true });
            await attendre(600);
            await cdp.detach().catch(() => {});
            f1 = await page.evaluate(mesurerTableFacturer);
            await capture(page, 'C113_facturer_tableau_390_apres_glisser');
        }
        M.facturer390 = { avant: f0, apres: f1 };
        const colsCachees = f0 ? f0.ths.filter((t) => t.visible < 0.9).map((t) => `${t.t} (${Math.round(t.visible * 100)} %)`) : [];
        R.push({ label: 'C113 · « Facturer DEV-… » à 390 : le tableau des lots (5 colonnes) reste dans une zone défilante horizontalement', pass: !!f0 && /(auto|scroll)/.test(f0.overflowX) && !!f1 && f1.scrollLeft > 0, detail: f0 ? `zone ${f0.clientWidth} px pour ${f0.scrollWidth} px ; glisser au doigt → scrollLeft ${f1 && f1.scrollLeft}` : 'tableau introuvable' });
        const lotApres = f1 ? f1.ths[0].visible : null;
        const champsVisiblesAvant = f0 ? f0.champs.filter((c) => c.visible >= 0.9).length : 0;
        R.push({ label: 'C113 · « Facturer DEV-… » à 390 : colonnes utiles visibles sans geste caché, et la colonne « Lot » reste lisible pendant le défilement', pass: !!f0 && colsCachees.length === 0 && (lotApres === null || lotApres >= 0.9), detail: f0 ? `au repos : colonnes masquées ${colsCachees.join(', ') || 'aucune'} ; champs « % cumulé » visibles ${champsVisiblesAvant}/${f0.champs.length} ; indice de défilement affiché : ${f0.indiceDefilement ? 'oui' : 'non'} ; après glisser : « Lot » visible à ${lotApres === null ? '?' : Math.round(lotApres * 100)} %, colonne figée : ${f0.premiereColonneFigee ? 'oui' : 'non'}` : '—' });
        await taper(page, /^Annuler$/, { dans: '.fixed.inset-0' }).catch(() => page.keyboard.press('Escape'));
    } finally { await page.close(); }
    return R;
}

// ═════════════════════════════════════════════════════════════════════════════
// C114 — clavier virtuel
// ═════════════════════════════════════════════════════════════════════════════
async function etatChamp(page, motifChamp, motifAction, optsAction = {}) {
    await page.evaluate(LIB);
    return page.evaluate((cs, cf, as, af, ao) => {
        const g = window.__g6;
        const a = document.activeElement;
        const champ = g.trouver(cs, cf, { sel: 'input, textarea' });
        const action = as ? g.trouver(as, af, ao) : null;
        const info = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const ex = g.exposition(el, 4); return { haut: Math.round(r.top), bas: Math.round(r.bottom), fraction: ex.fraction, couvreurs: ex.couvreurs }; };
        return {
            vh: innerHeight, focusSurChamp: !!champ && a === champ, modeClavier: document.documentElement.classList.contains('pwa-keyboard-open'),
            barreBasMasquee: (() => { const n = document.querySelector('.mobile-bottom-nav'); return !n || getComputedStyle(n).visibility === 'hidden'; })(),
            champ: info(champ), action: info(action)
        };
    }, motifChamp.source, motifChamp.flags, motifAction ? motifAction.source : null, motifAction ? motifAction.flags : '', optsAction);
}

// Rétrécit la fenêtre comme un clavier en mode « resizes-content » (WebView
// d'application, Firefox Android), puis reproduit le geste du navigateur qui
// ramène le champ actif dans la zone visible.
async function ouvrirClavierRedimensionne(page) {
    const vp = page.viewport();
    await page.setViewport({ ...vp, height: vp.height - CLAVIER });
    await attendre(700);
    await page.evaluate(() => { const a = document.activeElement; if (a && a !== document.body) a.scrollIntoView({ block: 'nearest' }); });
    await attendre(400);
    return vp;
}

async function c114(nav, url, M) {
    const R = [];
    const page = await nouvellePage(nav, url, { width: 390, height: 844, ...TACTILE });
    M.cas = {};
    try {
        const meta = await page.evaluate(() => ({ viewport: document.querySelector('meta[name="viewport"]')?.content, overlaysContent: navigator.virtualKeyboard ? navigator.virtualKeyboard.overlaysContent : 'API absente', insetCss: (() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;height:env(keyboard-inset-height, 0px)'; document.body.appendChild(d); const h = getComputedStyle(d).height; d.remove(); return h; })() }));
        M.meta = meta;

        // K1 — « Nouveau client » : champ Nom (haut) et action « Créer le client ».
        await aller(page, '#clients');
        await taper(page, /^Créer un nouveau client$/, { attente: 1200 });
        await taper(page, /^Nom du client/, { sel: 'input' });
        const k1a = await etatChamp(page, /^Nom du client/, /^Créer le client$/, { dans: '[role="dialog"]' });
        const vp = await ouvrirClavierRedimensionne(page);
        const k1b = await etatChamp(page, /^Nom du client/, /^Créer le client$/, { dans: '[role="dialog"]' });
        await capture(page, 'C114_nouveau_client_clavier_508');
        await page.keyboard.type('Client Clavier G6', { delay: 15 });
        await page.keyboard.press('Enter');
        await attendre(1200);
        const k1cree = await page.evaluate(() => /Client Clavier G6/.test(document.body.innerText) && ![...document.querySelectorAll('[role="dialog"]')].some((d) => d.getBoundingClientRect().width > 0 && /Nouveau Client/i.test(d.innerText)));
        await page.setViewport(vp); await attendre(700);
        M.cas.nouveauClient = { avantClavier: k1a, clavier508: k1b, creeParEntree: k1cree };
        R.push({ label: 'C114 · « Nouveau client » (390, clavier ouvert) : la saisie masque la barre du bas, le champ Nom reste visible et non recouvert', pass: k1a.modeClavier && k1a.barreBasMasquee && k1b.focusSurChamp && k1b.champ.fraction === 1 && k1b.champ.bas <= k1b.vh, detail: `avant : champ ${k1a.champ.haut}–${k1a.champ.bas} px, mode clavier ${k1a.modeClavier} ; zone utile 508 px : champ ${k1b.champ.haut}–${k1b.champ.bas} px, touchable ${k1b.champ.fraction * 100} %` });
        R.push({ label: 'C114 · « Nouveau client » (zone utile 508 px) : l’action « Créer le client » reste atteignable (visible, ou Entrée valide)', pass: (k1b.action && k1b.action.fraction > 0.5) || k1cree, detail: `bouton ${k1b.action ? `${k1b.action.haut}–${k1b.action.bas} px, touchable ${k1b.action.fraction * 100} %` : 'introuvable'} ; validation par Entrée : ${k1cree ? 'client créé' : 'échec'}` });

        // K2 — Inspecteur d'ouvrage : « Surface directe » + « Confirmer mes quantités ».
        await aller(page, '#chiffrage');
        await taper(page, /^01 Lot 01/, { attente: 1500 });
        await taper(page, /^Ajouter un ouvrage au lot$/, { attente: 1500 });
        await taper(page, /^Rechercher un ouvrage par nom/, { sel: 'input' });
        await page.keyboard.type('Agglos', { delay: 20 });
        await attendre(900);
        const kPicker = await etatChamp(page, /^Rechercher un ouvrage par nom/, /^Ajouter$/);
        const vp2 = await ouvrirClavierRedimensionne(page);
        const kPicker508 = await etatChamp(page, /^Rechercher un ouvrage par nom/, /^Ajouter$/);
        await capture(page, 'C114_bibliotheque_clavier_508');
        await page.setViewport(vp2); await attendre(700);
        M.cas.bibliotheque = { avant: kPicker, clavier508: kPicker508 };
        R.push({ label: 'C114 · Bibliothèque d’ouvrages (zone utile 508 px) : champ de recherche et 1er résultat « Ajouter » visibles ensemble', pass: kPicker508.champ && kPicker508.champ.fraction === 1 && kPicker508.action && kPicker508.action.fraction === 1, detail: `champ ${kPicker508.champ && kPicker508.champ.haut}–${kPicker508.champ && kPicker508.champ.bas} px ; « Ajouter » ${kPicker508.action ? `${kPicker508.action.haut}–${kPicker508.action.bas} px, ${kPicker508.action.fraction * 100} %` : 'introuvable'}` });

        // Ajouter l'ouvrage filtré → l'inspecteur s'ouvre.
        await page.evaluate(() => { const a = document.activeElement; if (a) a.blur(); });
        await attendre(300);
        await taper(page, /^Ajouter$/, { attente: 1600 });
        await taper(page, /^Surface directe/, { sel: 'input' });
        const k2a = await etatChamp(page, /^Surface directe/, /^Confirmer mes quantités$/);
        const vp3 = await ouvrirClavierRedimensionne(page);
        const k2b = await etatChamp(page, /^Surface directe/, /^Confirmer mes quantités$/);
        const k2t = await page.evaluate(() => { const g = window.__g6; const t = g.trouver('^Terminer$', ''); return t ? g.exposition(t, 4).fraction : null; });
        await capture(page, 'C114_inspecteur_surface_clavier_508');
        await page.keyboard.type('120', { delay: 30 });
        await attendre(500);
        const valeur = await page.evaluate(() => { const g = window.__g6; const c = g.trouver('^Surface directe', '', { sel: 'input' }); return c ? c.value : null; });
        await page.setViewport(vp3); await attendre(700);
        M.cas.inspecteur = { avantClavier: k2a, clavier508: k2b, terminer508: k2t, valeurSaisie: valeur };
        R.push({ label: 'C114 · Inspecteur d’ouvrage (zone utile 508 px) : le champ « Surface directe (m²) » reste visible et non recouvert pendant la saisie', pass: k2b.focusSurChamp && k2b.champ.fraction === 1 && valeur === '120', detail: `avant : champ ${k2a.champ.haut}–${k2a.champ.bas} px ; 508 px : champ ${k2b.champ.haut}–${k2b.champ.bas} px, touchable ${k2b.champ.fraction * 100} % ${JSON.stringify(k2b.champ.couvreurs)} ; saisie « ${valeur} »` });
        R.push({ label: 'C114 · Inspecteur d’ouvrage (zone utile 508 px) : l’action requise « Confirmer mes quantités » reste visible au-dessus du clavier', pass: !!k2b.action && k2b.action.fraction === 1, detail: `« Confirmer » ${k2b.action ? `${k2b.action.haut}–${k2b.action.bas} px, ${k2b.action.fraction * 100} %` : 'introuvable'} ; « Terminer » touchable ${k2t === null ? '?' : k2t * 100 + ' %'}` });

        // K3 — Mode « recouvrement » (Chrome Android, iOS) : positions mesurées
        // par rapport au bord d'un clavier modélisé à 844 − 336 = 508 px.
        await aller(page, '#materiaux');
        await taper(page, /^Rechercher une matière/, { sel: 'input' });
        const k3 = await etatChamp(page, /^Rechercher une matière/, null);
        M.cas.materiaux = k3;
        await page.evaluate(() => { const a = document.activeElement; if (a) a.blur(); });
        const bas = [M.cas.nouveauClient.avantClavier, M.cas.inspecteur.avantClavier].map((e) => e.champ.bas);
        M.recouvrement = { bordClavier: 844 - CLAVIER, basDesChamps: { nomClient: bas[0], surfaceDirecte: bas[1], rechercheMatiere: k3.champ && k3.champ.bas } };
        R.push({ label: 'C114 · Mode recouvrement (interactive-widget=overlays-content + virtualKeyboard.overlaysContent=true) : clavier réel non disponible en émulation', pass: false, detail: `NON TESTABLE ici — meta « ${meta.viewport} », overlaysContent=${meta.overlaysContent}, env(keyboard-inset-height) inutilisé (0 occurrence). Bas des champs à 844 px : ${JSON.stringify(M.recouvrement.basDesChamps)} (bord du clavier modélisé : 508 px)` });
    } finally { await page.close(); }
    return R;
}

// ═════════════════════════════════════════════════════════════════════════════
// C115 — en-têtes et barres fixes
// ═════════════════════════════════════════════════════════════════════════════
async function marcheTab(page, n) {
    const vus = [];
    for (let i = 0; i < n; i++) {
        await page.keyboard.press('Tab');
        await attendre(140);
        const m = await page.evaluate(() => {
            const g = window.__g6;
            const a = document.activeElement;
            if (!a || a === document.body) return null;
            const ex = g.exposition(a, 4);
            const r = a.getBoundingClientRect();
            return { nom: g.nom(a).slice(0, 40), fraction: ex.fraction, horsEcran: ex.horsEcran, tot: ex.tot, couvreurs: ex.couvreurs, haut: Math.round(r.top), bas: Math.round(r.bottom) };
        });
        if (m) vus.push(m);
    }
    const masques = vus.filter((v) => v.fraction === 0 && v.horsEcran < v.tot);
    const partiels = vus.filter((v) => v.fraction > 0 && v.fraction < 1 && v.horsEcran === 0);
    const horsEcran = vus.filter((v) => v.horsEcran === v.tot);
    return { n: vus.length, masques, partiels, horsEcran };
}

async function ajouterOuvrage(page, terme = 'Agglos') {
    await taper(page, /^01 Lot 01/, { attente: 1500 });
    await taper(page, /^Ajouter un ouvrage au lot$/, { attente: 1500 });
    await taper(page, /^Rechercher un ouvrage par nom/, { sel: 'input' });
    await page.keyboard.type(terme, { delay: 20 });
    await attendre(1000);
    await page.evaluate(() => { const a = document.activeElement; if (a) a.blur(); });
    await attendre(300);
    await taper(page, /^Ajouter$/, { attente: 1600 });
}

async function c115(nav, url, M) {
    const R = [];
    // F1 — « Ajouter mon premier ouvrage » sous la barre des totaux.
    const page = await nouvellePage(nav, url, { width: 390, height: 844, ...TACTILE });
    try {
        M.ctaPremierOuvrage = {};
        const ko = [];
        for (const [w, h] of [[390, 844], [414, 896], [360, 740], [375, 667], [320, 568]]) {
            await page.setViewport({ width: w, height: h, ...TACTILE });
            await aller(page, '#dashboard');
            await aller(page, '#chiffrage');
            const mesure = () => page.evaluate(() => {
                const g = window.__g6;
                const b = g.trouver('^Ajouter mon premier ouvrage$', '');
                const t = document.querySelector('.quote-totals-bar');
                if (!b) return null;
                const r = b.getBoundingClientRect();
                return { haut: Math.round(r.top), bas: Math.round(r.bottom), hauteur: Math.round(r.height), touchablePx: g.bandeTouchable(b), fraction: g.exposition(b, 5).fraction, barreTotaux: t ? Math.round(t.getBoundingClientRect().top) : null, defileur: g.defileur(b) === document.scrollingElement ? 'aucun' : 'oui' };
            });
            const m0 = await mesure();
            // Essayer de dégager le bouton à la molette et au doigt.
            if (m0) {
                await page.mouse.move(w / 2, Math.max(150, m0.haut - 120));
                await page.mouse.wheel({ deltaY: 400 });
                await attendre(400);
                const cdp = await page.createCDPSession();
                await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(w / 2), y: Math.max(150, m0.haut - 120), xDistance: 0, yDistance: -300, gestureSourceType: 'touch', speed: 1500, preventFling: true });
                await attendre(500);
                await cdp.detach().catch(() => {});
            }
            const m1 = await mesure();
            M.ctaPremierOuvrage[`${w}x${h}`] = { repos: m0, apresDefilement: m1 };
            if (w === 390 || w === 375 || w === 320) await capture(page, `C115_premier_ouvrage_${w}x${h}`);
            if (!m1 || m1.fraction < 1) ko.push(`${w}×${h} : bouton ${m1 ? `${m1.haut}–${m1.bas} px, barre des totaux à ${m1.barreTotaux} px, touchable ${m1.touchablePx}/${m1.hauteur} px (${Math.round(m1.fraction * 100)} %)` : 'absent'}`);
        }
        R.push({ label: 'C115 · Éditeur de devis (téléphone) : « Ajouter mon premier ouvrage » n’est pas recouvert par la barre fixe des totaux', pass: ko.length === 0, detail: ko.join(' | ') || 'dégagé à toutes les tailles' });
    } finally { await page.close(); }

    // F2 — Fin de défilement : le dernier élément de chaque écran passe au-dessus de la barre du bas.
    const p2 = await nouvellePage(nav, url, { width: 390, height: 844, ...TACTILE });
    try {
        const ko = [];
        M.finDeDefilement = {};
        for (const route of ROUTES.filter((r) => !/settings|abonnement/.test(r))) {
            await aller(p2, route);
            const pt = await p2.evaluate(() => { const g = window.__g6; const sc = g.defileurPrincipal(); if (!sc) return null; const r = sc.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(200, r.height / 2) }; });
            if (pt) { await p2.mouse.move(pt.x, pt.y); for (let i = 0; i < 8; i++) { await p2.mouse.wheel({ deltaY: 1200 }); await attendre(150); } await attendre(400); }
            const m = await p2.evaluate(() => {
                const g = window.__g6;
                const nav = document.querySelector('.mobile-bottom-nav');
                const tot = document.querySelector('.quote-totals-bar');
                const plafond = Math.min(nav && g.visible(nav) ? nav.getBoundingClientRect().top : innerHeight, tot && g.visible(tot) ? tot.getBoundingClientRect().top : innerHeight);
                const els = [...document.querySelectorAll(g.SEL)].filter((e) => g.visible(e) && !e.closest('.mobile-bottom-nav, .global-top-bar, .quote-totals-bar, .sr-only'));
                const dernier = els.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
                if (!dernier) return null;
                const r = dernier.getBoundingClientRect();
                return { nom: g.nom(dernier).slice(0, 40), bas: Math.round(r.bottom), plafond: Math.round(plafond), fraction: g.exposition(dernier, 4).fraction };
            });
            M.finDeDefilement[route] = m;
            if (m && m.fraction < 1) ko.push(`${route} : « ${m.nom} » bas ${m.bas} px, barre à ${m.plafond} px, touchable ${Math.round(m.fraction * 100)} %`);
        }
        R.push({ label: 'C115 · 390 px, 9 écrans défilés jusqu’en bas à la molette : le dernier élément interactif n’est pas sous la barre du bas', pass: ko.length === 0, detail: ko.join(' | ') || '9/9 dégagés' });
    } finally { await p2.close(); }

    // F3 — Focus non masqué (WCAG 2.4.11) : marche au clavier sur écrans à barres fixes.
    const p3 = await nouvellePage(nav, url, { width: 390, height: 844, ...TACTILE });
    try {
        M.focus = {};
        await aller(p3, '#materiaux');
        M.focus['390#materiaux'] = await marcheTab(p3, 45);
        await aller(p3, '#chiffrage');
        await ajouterOuvrage(p3);
        // Dans l'inspecteur : remonter en haut puis tabuler.
        M.focus['390 inspecteur'] = await marcheTab(p3, 30);
        await capture(p3, 'C115_inspecteur_focus_390');
        await taper(p3, /^Terminer$/, { attente: 1200 }).catch(() => {});
        M.focus['390 lot avec ouvrage'] = await marcheTab(p3, 30);
        // F4 — Toast « Annuler » après suppression d'un ouvrage.
        await taper(p3, /^Supprimer Maçonnerie/, { attente: 900 });
        await taper(p3, /^Supprimer$/, { dans: '[role="dialog"], [role="alertdialog"]', attente: 900 });
        const toast = await p3.evaluate(() => {
            const g = window.__g6;
            const b = [...document.querySelectorAll('button')].filter(g.visible).find((x) => x.innerText.trim() === 'Annuler' && x.closest('.fixed'));
            if (!b) return null;
            const r = b.getBoundingClientRect();
            const tot = document.querySelector('.quote-totals-bar');
            return { haut: Math.round(r.top), bas: Math.round(r.bottom), fraction: g.exposition(b, 4).fraction, couvreurs: g.exposition(b, 4).couvreurs, barreTotaux: tot ? Math.round(tot.getBoundingClientRect().top) : null };
        });
        await capture(p3, 'C115_toast_annuler_suppression_390');
        M.toastAnnuler = toast;
        R.push({ label: 'C115 · 390 px : après suppression d’un ouvrage, le lien « Annuler » du toast n’est pas recouvert par les barres fixes', pass: !!toast && toast.fraction === 1, detail: toast ? JSON.stringify(toast) : 'toast introuvable' });
    } finally { await p3.close(); }

    const p4 = await nouvellePage(nav, url, { width: 1440, height: 900, ...BUREAU });
    try {
        await aller(p4, '#materiaux');
        M.focus['1440#materiaux'] = await marcheTab(p4, 45);
        await aller(p4, '#devis');
        M.focus['1440#devis'] = await marcheTab(p4, 25);
        await aller(p4, '#chiffrage');
        M.focus['1440#chiffrage'] = await marcheTab(p4, 45);
    } finally { await p4.close(); }
    for (const [cle, f] of Object.entries(M.focus)) {
        R.push({ label: `C115 · Focus clavier jamais entièrement masqué par un en-tête ou une barre fixe (WCAG 2.4.11) — ${cle}`, pass: f.masques.length === 0, detail: `${f.n} arrêts de focus ; entièrement masqués ${f.masques.length}${f.masques.length ? ' ' + JSON.stringify(f.masques.slice(0, 3)) : ''} ; partiellement ${f.partiels.length}${f.partiels.length ? ' ' + JSON.stringify(f.partiels.slice(0, 2)) : ''} ; hors écran ${f.horsEcran.length}${f.horsEcran.length ? ' ' + JSON.stringify(f.horsEcran.slice(0, 2).map((v) => v.nom)) : ''}` });
    }
    return R;
}

// ═════════════════════════════════════════════════════════════════════════════
// C116 — zones sûres, rotation, hauteur
// ═════════════════════════════════════════════════════════════════════════════
async function zonesSures(page, insets) {
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
    await attendre(500);
    const lu = await page.evaluate(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'; document.body.appendChild(d); const cs = getComputedStyle(d); const v = { haut: cs.paddingTop, droite: cs.paddingRight, bas: cs.paddingBottom, gauche: cs.paddingLeft }; d.remove(); return v; });
    return { cdp, lu };
}

function horsZoneSure(insets) {
    const g = window.__g6;
    const vw = innerWidth, vh = innerHeight;
    const lim = { haut: insets.top || 0, bas: vh - (insets.bottom || 0), gauche: insets.left || 0, droite: vw - (insets.right || 0) };
    const fautifs = [];
    for (const el of document.querySelectorAll('body *')) {
        const inter = el.matches(g.SEL);
        const feuille = el.children.length === 0 && g.norm(el.textContent).length > 1;
        if (!inter && !feuille) continue;
        if (!g.visible(el) || el.closest('.sr-only')) continue;
        const r = el.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
        // Seuls les éléments réellement affichés à l'écran (non recouverts) comptent.
        const cx = Math.min(Math.max(r.left + r.width / 2, 0), vw - 1), cy = Math.min(Math.max(r.top + r.height / 2, 0), vh - 1);
        if (!g.dessus(el, cx, cy)) continue;
        const cotes = [];
        if (r.top < lim.haut - 1) cotes.push(`haut ${Math.round(r.top)}<${lim.haut}`);
        if (r.bottom > lim.bas + 1) cotes.push(`bas ${Math.round(r.bottom)}>${lim.bas}`);
        if (r.left < lim.gauche - 1) cotes.push(`gauche ${Math.round(r.left)}<${lim.gauche}`);
        if (r.right > lim.droite + 1) cotes.push(`droite ${Math.round(r.right)}>${lim.droite}`);
        if (cotes.length) fautifs.push(`${g.nom(el).slice(0, 28) || el.tagName} (${cotes.join(', ')})`);
    }
    return [...new Set(fautifs)];
}

async function c116(nav, url, M) {
    const R = [];
    // S1 — Portrait, encoche + barre d'accueil (iPhone 14 : 47 / 34 px).
    const P = { top: 47, bottom: 34, left: 0, right: 0 };
    const page = await nouvellePage(nav, url, { width: 390, height: 844, ...TACTILE });
    try {
        const { cdp, lu } = await zonesSures(page, P);
        M.envPortrait = lu;
        const etats = {};
        const NAVB = { dans: '.mobile-bottom-nav' };
        await aller(page, '#dashboard'); etats['#dashboard'] = await page.evaluate(horsZoneSure, P);
        await capture(page, 'C116_zones_sures_portrait_dashboard');
        await aller(page, '#chiffrage'); etats['#chiffrage'] = await page.evaluate(horsZoneSure, P);
        await capture(page, 'C116_zones_sures_portrait_chiffrage');
        await taper(page, /^Ouvrir le menu de navigation$/, NAVB);
        etats['menu mobile'] = await page.evaluate(horsZoneSure, P);
        await taper(page, /^Fermer le menu$/);
        await aller(page, '#devis');
        await taper(page, /^Afficher le devis DEV-2026-001/, { attente: 1800 });
        etats['fiche devis'] = await page.evaluate(horsZoneSure, P);
        await capture(page, 'C116_zones_sures_portrait_fiche_devis');
        await aller(page, '#chiffrage');
        await taper(page, /^01 Lot 01/, { attente: 1500 });
        await taper(page, /^Ajouter un ouvrage au lot$/, { attente: 1500 });
        etats['bibliothèque d’ouvrages'] = await page.evaluate(horsZoneSure, P);
        await page.evaluate(() => { const a = document.activeElement; if (a) a.blur(); });
        await taper(page, /^Ajouter$/, { attente: 1600 });
        etats['inspecteur'] = await page.evaluate(horsZoneSure, P);
        await capture(page, 'C116_zones_sures_portrait_inspecteur');
        M.zonesSuresPortrait = etats;
        for (const [k, v] of Object.entries(etats)) R.push({ label: `C116 · Zones sûres portrait (encoche 47 px, barre d’accueil 34 px) — ${k} : aucun texte ni commande sous l’encoche ou l’indicateur d’accueil`, pass: v.length === 0, detail: `env() lu : ${JSON.stringify(lu)} ; ${v.length ? v.slice(0, 6).join(' ; ') : 'aucun élément hors zone sûre'}` });
        await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: {} }).catch(() => {});
        await cdp.detach().catch(() => {});
    } finally { await page.close(); }

    // S2 — Paysage 844×390 avec encoche latérale (47 px) + indicateur (21 px).
    const L = { top: 0, bottom: 21, left: 47, right: 47 };
    const p2 = await nouvellePage(nav, url, { width: 844, height: 390, ...TACTILE });
    try {
        const { cdp, lu } = await zonesSures(p2, L);
        M.envPaysage = lu;
        const etats = {};
        for (const route of ['#dashboard', '#devis', '#chiffrage', '#materiaux']) {
            await aller(p2, route);
            etats[route] = await p2.evaluate(horsZoneSure, L);
            if (route === '#dashboard' || route === '#chiffrage') await capture(p2, `C116_zones_sures_paysage_${route.slice(1)}`);
        }
        const usage = await p2.evaluate(() => { const m = document.querySelector('#main-content'); const a = [...document.querySelectorAll('aside')].find((x) => x.getBoundingClientRect().width > 0); return { contenuHaut: m ? Math.round(m.getBoundingClientRect().height) : null, barreLaterale: a ? Math.round(a.getBoundingClientRect().width) : 0, barreLateraleDefile: a ? a.scrollHeight > a.clientHeight : null }; });
        M.zonesSuresPaysage = { etats, usage };
        for (const [k, v] of Object.entries(etats)) R.push({ label: `C116 · Zones sûres paysage 844×390 (encoche latérale 47 px) — ${k} : aucun texte ni commande sous l’encoche`, pass: v.length === 0, detail: `env() lu : ${JSON.stringify(lu)} ; ${v.length ? `${v.length} éléments : ${v.slice(0, 6).join(' ; ')}` : 'aucun'}` });
        await cdp.detach().catch(() => {});
    } finally { await p2.close(); }

    // S3 — Rotation avec saisie en cours (« Nouveau client »).
    const p3 = await nouvellePage(nav, url, { width: 390, height: 844, ...TACTILE });
    try {
        await aller(p3, '#clients');
        await taper(p3, /^Créer un nouveau client$/, { attente: 1200 });
        await taper(p3, /^Nom du client/, { sel: 'input' });
        await p3.keyboard.type('SARL Rotation G6', { delay: 15 });
        await p3.evaluate(() => document.activeElement && document.activeElement.blur());
        const lire = () => p3.evaluate(() => {
            const g = window.__g6;
            const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => g.visible(x) && /Nouveau Client/i.test(x.innerText));
            const champ = document.getElementById('newClientForm-name');
            const creer = g.trouver('^Créer le client$', '', { dans: '[role="dialog"]' });
            return { ouverte: !!d, valeur: champ ? champ.value : null, creer: creer ? g.exposition(creer, 4).fraction : null, debordement: document.scrollingElement.scrollWidth - document.documentElement.clientWidth, vw: innerWidth, vh: innerHeight };
        });
        const portrait = await lire();
        await p3.setViewport({ width: 844, height: 390, ...TACTILE }); await attendre(900); await p3.evaluate(LIB);
        const paysage = await lire();
        await capture(p3, 'C116_rotation_paysage_nouveau_client');
        await p3.setViewport({ width: 390, height: 844, ...TACTILE }); await attendre(900); await p3.evaluate(LIB);
        const retour = await lire();
        M.rotationClient = { portrait, paysage, retour };
        R.push({ label: 'C116 · Rotation portrait → paysage → portrait pendant la saisie « Nouveau client » : fenêtre conservée, saisie conservée, « Créer le client » atteignable, pas de débordement', pass: [portrait, paysage, retour].every((e) => e.ouverte && e.valeur === 'SARL Rotation G6' && e.debordement <= 0) && paysage.creer > 0.5, detail: JSON.stringify(M.rotationClient) });
        await taper(p3, /^Annuler$/, { dans: '[role="dialog"]' }).catch(() => {});

        // S4 — Rotation dans l'éditeur avec un ouvrage chiffré.
        await aller(p3, '#chiffrage');
        await ajouterOuvrage(p3);
        await taper(p3, /^Surface directe/, { sel: 'input' });
        await p3.keyboard.type('120', { delay: 30 });
        await p3.evaluate(() => document.activeElement && document.activeElement.blur());
        await attendre(500);
        const lireEd = () => p3.evaluate(() => {
            const g = window.__g6;
            const c = g.trouver('^Surface directe', '', { sel: 'input' });
            const terminer = g.trouver('^Terminer$', '');
            const confirmer = g.trouver('^Confirmer mes quantités$', '');
            return { surface: c ? c.value : null, terminer: terminer ? g.exposition(terminer, 4).fraction : null, confirmer: confirmer ? g.exposition(confirmer, 4).fraction : null, debordement: document.scrollingElement.scrollWidth - document.documentElement.clientWidth };
        });
        const e0 = await lireEd();
        await p3.setViewport({ width: 844, height: 390, ...TACTILE }); await attendre(1000); await p3.evaluate(LIB);
        const e1 = await lireEd();
        await capture(p3, 'C116_rotation_paysage_inspecteur');
        await p3.setViewport({ width: 390, height: 844, ...TACTILE }); await attendre(1000); await p3.evaluate(LIB);
        const e2 = await lireEd();
        M.rotationEditeur = { portrait: e0, paysage: e1, retour: e2 };
        R.push({ label: 'C116 · Rotation dans l’inspecteur d’ouvrage (surface 120 saisie) : valeur conservée, actions « Confirmer » / « Terminer » atteignables en paysage', pass: [e0, e1, e2].every((e) => e.surface === '120' && e.debordement <= 0) && (e1.confirmer > 0 || e1.terminer > 0), detail: JSON.stringify(M.rotationEditeur) });
    } finally { await p3.close(); }

    // S5 — Changement de hauteur (barre du navigateur, écran partagé).
    const p4 = await nouvellePage(nav, url, { width: 390, height: 844, ...TACTILE });
    try {
        await aller(p4, '#materiaux');
        const pt = await p4.evaluate(() => { const sc = window.__g6.defileurPrincipal(); const r = sc.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 200 }; });
        await p4.mouse.move(pt.x, pt.y); await p4.mouse.wheel({ deltaY: 900 }); await attendre(500);
        const lireH = () => p4.evaluate(() => {
            const g = window.__g6;
            const sc = g.defileurPrincipal();
            const coque = document.querySelector('.mobile-app-shell');
            const nav = document.querySelector('.mobile-bottom-nav');
            const rn = nav.getBoundingClientRect();
            return { vh: innerHeight, coqueBas: coque ? Math.round(coque.getBoundingClientRect().bottom) : null, navHaut: Math.round(rn.top), navBas: Math.round(rn.bottom), scrollTop: sc ? Math.round(sc.scrollTop) : null, debordement: document.scrollingElement.scrollWidth - document.documentElement.clientWidth, defilementDocument: document.scrollingElement.scrollHeight - innerHeight };
        });
        const h844 = await lireH();
        await p4.setViewport({ width: 390, height: 600, ...TACTILE }); await attendre(800);
        const h600 = await lireH();
        await capture(p4, 'C116_hauteur_600_materiaux');
        await p4.setViewport({ width: 390, height: 500, ...TACTILE }); await attendre(800);
        const h500 = await lireH();
        await p4.setViewport({ width: 390, height: 844, ...TACTILE }); await attendre(800);
        const hRetour = await lireH();
        M.hauteur = { h844, h600, h500, hRetour };
        const ok = [h844, h600, h500, hRetour].every((e) => Math.abs(e.coqueBas - e.vh) <= 1 && e.navBas <= e.vh + 1 && e.debordement <= 0);
        R.push({ label: 'C116 · Hauteur 844 → 600 → 500 → 844 px : la coque suit la hauteur, la barre du bas reste entière à l’écran, position de lecture conservée', pass: ok && Math.abs(hRetour.scrollTop - h844.scrollTop) <= 2, detail: JSON.stringify(M.hauteur) });
    } finally { await p4.close(); }
    return R;
}

// ═════════════════════════════════════════════════════════════════════════════
// C117 — cibles tactiles
// ═════════════════════════════════════════════════════════════════════════════
function ciblesTactiles() {
    const g = window.__g6;
    const els = [...document.querySelectorAll(g.SEL)].filter((e) => g.visible(e) && !e.closest('.sr-only'))
        .map((e) => ({ e, r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth);
    const distRect = (x, y, r) => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
    const enLigne = (e) => e.tagName === 'A' && getComputedStyle(e).display === 'inline' && e.closest('p, li');
    const petits = els.filter(({ e, r }) => (r.width < 24 || r.height < 24) && !enLigne(e));
    const echecs = [];
    for (const p of petits) {
        const cx = p.r.left + p.r.width / 2, cy = p.r.top + p.r.height / 2;
        const voisin = els.find((o) => o.e !== p.e && !o.e.contains(p.e) && !p.e.contains(o.e) && distRect(cx, cy, o.r) < 12)
            || petits.find((o) => o.e !== p.e && !o.e.contains(p.e) && !p.e.contains(o.e) && Math.hypot(cx - (o.r.left + o.r.width / 2), cy - (o.r.top + o.r.height / 2)) < 24);
        if (voisin) echecs.push({ nom: g.nom(p.e).slice(0, 40) || p.e.tagName, l: Math.round(p.r.width), h: Math.round(p.r.height), voisin: g.nom(voisin.e).slice(0, 30) });
    }
    // Actions dévoilées au survol : présentes mais effacées sur écran tactile.
    const survol = [...document.querySelectorAll('button, [role="button"]')].filter((e) => {
        const r = e.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || getComputedStyle(e).visibility === 'hidden') return false;
        let o = 1;
        for (let x = e; x && x !== document.documentElement; x = x.parentElement) o *= Number(getComputedStyle(x).opacity);
        return o < 0.5 && /group-hover|hover:opacity/.test([e, e.parentElement].map((x) => String(x && x.className)).join(' '));
    }).map((e) => g.nom(e).slice(0, 40));
    return { nbPetits: petits.length, petits: petits.map((p) => `${g.nom(p.e).slice(0, 30)} ${Math.round(p.r.width)}×${Math.round(p.r.height)}`).slice(0, 12), echecs, survol };
}

async function c117(nav, url, M) {
    const R = [];
    const page = await nouvellePage(nav, url, { width: 390, height: 844, ...TACTILE });
    M.etats = {};
    const releve = async (cle) => { M.etats[cle] = await page.evaluate(ciblesTactiles); };
    try {
        for (const route of ROUTES) { await aller(page, route); await releve(`390${route}`); }
        await aller(page, '#chiffrage');
        await taper(page, /^01 Lot 01/, { attente: 1500 });
        await releve('390 lot vide');
        await taper(page, /^Ajouter un ouvrage au lot$/, { attente: 1500 });
        await releve('390 bibliothèque d’ouvrages');
        await taper(page, /^Ajouter$/, { attente: 1600 });
        await releve('390 inspecteur');
        await taper(page, /^Terminer$/, { attente: 1200 }).catch(() => {});
        await releve('390 lot avec ouvrage');
        await capture(page, 'C117_lot_avec_ouvrage_390');
        await taper(page, /^Ouvrir le menu de navigation$/, { dans: '.mobile-bottom-nav' });
        await releve('390 menu mobile');
        await taper(page, /^Fermer le menu$/);
        await aller(page, '#devis');
        await taper(page, /^Afficher le devis DEV-2026-001/, { attente: 1800 });
        await releve('390 fiche devis');
        await taper(page, /^Plus d.actions sur le devis$/);
        await releve('390 fiche devis, menu ⋮');
        await taper(page, /^Plus d.actions sur le devis$/).catch(() => {});
        await taper(page, /^Facturer le devis DEV-2026-001$/, { attente: 1600 });
        await releve('390 fenêtre Facturer');
        await taper(page, /^Créer le brouillon$/, { attente: 1800 });
        await aller(page, '#dashboard');
        await aller(page, '#factures');
        await releve('390 factures (1 brouillon)');
        await capture(page, 'C117_factures_brouillon_390');
        // 320 px, écrans de liste.
        await page.setViewport({ width: 320, height: 568, ...TACTILE });
        await attendre(600);
        for (const route of ['#dashboard', '#devis', '#factures', '#chiffrage', '#materiaux']) { await aller(page, route); await releve(`320${route}`); }
    } finally { await page.close(); }
    const connus = /^Options du lot/;
    const echecs = [];
    const survol = new Set();
    for (const [cle, m] of Object.entries(M.etats)) {
        for (const e of m.echecs) if (!connus.test(e.nom)) echecs.push(`${cle} : « ${e.nom} » ${e.l}×${e.h} (voisin « ${e.voisin} »)`);
        for (const s of m.survol) survol.add(`${cle} : ${s}`);
    }
    R.push({ label: `C117 · Cibles < 24 px sans espacement suffisant (WCAG 2.5.8), ${Object.keys(M.etats).length} états à 390/320 px — hors « Options du lot » (UX-P3-02 connu)`, pass: echecs.length === 0, detail: echecs.length ? [...new Set(echecs)].slice(0, 12).join(' | ') : 'aucune' });
    R.push({ label: 'C117 · Aucune action rendue quasi invisible sur écran tactile (dévoilée au survol seulement)', pass: survol.size === 0, detail: [...survol].slice(0, 8).join(' | ') || 'aucune' });

    // Actions fréquentes : taille et surface réellement touchable.
    const p2 = await nouvellePage(nav, url, { width: 390, height: 844, ...TACTILE });
    const freq = [];
    try {
        const mesurer = async (libelle, motif, o = {}) => {
            const m = await p2.evaluate((s, f, oo) => { const g = window.__g6; const e = g.trouver(s, f, oo); if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.width), h: Math.round(r.height), touchablePx: g.bandeTouchable(e), fraction: g.exposition(e, 5).fraction }; }, motif.source, motif.flags, o);
            freq.push({ libelle, ...(m || { absent: true }) });
        };
        for (const n of ['Accueil', 'Devis', 'Chantiers', 'Factures']) await mesurer(`barre du bas · ${n}`, new RegExp(`^${n}$`), { dans: '.mobile-bottom-nav' });
        await mesurer('barre du bas · Menu', /^Ouvrir le menu de navigation$/);
        await aller(p2, '#devis');
        await mesurer('Nouveau devis', /^Nouveau devis$/);
        await mesurer('Supprimer le devis', /^Supprimer le devis DEV-2026-001$/);
        await aller(p2, '#chiffrage');
        await mesurer('Ajouter mon premier ouvrage', /^Ajouter mon premier ouvrage$/);
        await mesurer('Ajouter un nouveau lot', /Ajouter un (nouveau )?lot/);
        await mesurer('Enregistrer', /^Enregistrer$/);
        await mesurer('Aperçu PDF', /^Aperçu PDF$/);
        await taper(p2, /^01 Lot 01/, { attente: 1500 });
        await mesurer('Ajouter un lot (barre des lots)', /^Ajouter un lot au devis$/);
        await mesurer('Synthèse des lots', /^Synthèse des lots$/);
        await mesurer('Ajouter un ouvrage au lot', /^Ajouter un ouvrage au lot$/);
        await ajouterOuvrage(p2).catch(() => {});
        await mesurer('Confirmer mes quantités', /^Confirmer mes quantités$/);
        await mesurer('Surface directe (champ)', /^Surface directe/, { sel: 'input' });
        await mesurer('Terminer', /^Terminer$/);
        await taper(p2, /^Terminer$/, { attente: 1200 }).catch(() => {});
        await mesurer('Quantité (ligne)', /^Quantité pour/, { sel: 'input' });
        await mesurer('Dupliquer (ligne)', /^Dupliquer/);
        await mesurer('Supprimer (ligne)', /^Supprimer Maçonnerie/);
    } finally { await p2.close(); }
    M.frequentes = freq;
    const sous24 = freq.filter((f) => !f.absent && (f.l < 24 || f.h < 24 || f.touchablePx < 24));
    const sous44 = freq.filter((f) => !f.absent && (f.l < 44 || f.h < 44) && !sous24.includes(f));
    R.push({ label: 'C117 · Actions fréquentes (21) : surface touchable ≥ 24 px dans les deux dimensions', pass: sous24.length === 0, detail: sous24.map((f) => `${f.libelle} ${f.l}×${f.h}, touchable ${f.touchablePx} px (${Math.round(f.fraction * 100)} %)`).join(' | ') || 'toutes ≥ 24 px' });
    R.push({ label: 'C117 · Actions fréquentes : taille confortable ≥ 44 px (recommandation, WCAG 2.5.5 AAA)', pass: sous44.length === 0, detail: sous44.map((f) => `${f.libelle} ${f.l}×${f.h}`).join(' | ') || 'toutes ≥ 44 px' });
    return R;
}

// ═════════════════════════════════════════════════════════════════════════════
// C118 — fermeture des menus mobiles et défilement ensuite
// ═════════════════════════════════════════════════════════════════════════════
async function c118(nav, url, M) {
    const R = [];
    const page = await nouvellePage(nav, url, { width: 390, height: 844, ...TACTILE });
    const NAVB = { dans: '.mobile-bottom-nav' };
    const MENU = { dans: '[role="dialog"][aria-label="Menu"]' };
    const menuOuvert = () => page.evaluate(() => [...document.querySelectorAll('[role="dialog"][aria-label="Menu"]')].some((d) => d.getBoundingClientRect().height > 0));
    M.fermetures = {};
    try {
        await aller(page, '#dashboard');
        const base = await eprouverDefilement(page);
        M.base = base;
        const fermer = {
            'bouton « Fermer le menu »': async () => taper(page, /^Fermer le menu$/, MENU),
            'toucher le voile au-dessus du panneau': async () => { await page.touchscreen.tap(195, 40); await attendre(900); },
            'touche Échap': async () => { await page.keyboard.press('Escape'); await attendre(900); },
            'choix d’une destination (Clients & CRM)': async () => taper(page, /^Clients & CRM$/, { ...MENU, attente: 1500 })
        };
        for (const [mode, action] of Object.entries(fermer)) {
            await aller(page, '#dashboard');
            await taper(page, /^Ouvrir le menu de navigation$/, NAVB);
            const ouvert = await menuOuvert();
            const focusDansMenu = await page.evaluate(() => { const d = document.querySelector('[role="dialog"][aria-label="Menu"]'); return !!d && d.contains(document.activeElement); });
            let fondPendant = null;
            if (mode === 'touche Échap') {
                // Pendant l'ouverture : le fond défile-t-il sous le voile ?
                const avant = await page.evaluate(() => { const s = window.__g6.defileurPrincipal(); return s ? s.scrollTop : null; });
                await page.mouse.move(195, 40); await page.mouse.wheel({ deltaY: 300 }); await attendre(400);
                const apres = await page.evaluate(() => { const s = window.__g6.defileurPrincipal(); return s ? s.scrollTop : null; });
                fondPendant = apres - avant;
            }
            await action();
            const ferme = !(await menuOuvert());
            let def = await eprouverDefilement(page);
            if (mode.startsWith('choix') && !def.defileur) { await taper(page, /^Ouvrir le menu de navigation$/, NAVB); await taper(page, /^Prix des Matériaux$/, { ...MENU, attente: 1500 }); def = await eprouverDefilement(page); }
            await taper(page, /^Devis$/, { ...NAVB, attente: 1400 });
            const navOk = /Mes devis/.test(await titre(page));
            M.fermetures[mode] = { ouvert, focusDansMenu, ferme, defilement: def, fondPendant, navOk };
            R.push({ label: `C118 · Menu mobile fermé par ${mode} : se ferme, puis le contenu défile (molette + doigt) et la barre du bas répond`, pass: ouvert && ferme && !def.voile && Math.abs(def.molette) > 20 && Math.abs(def.doigt) > 20 && def.body === base.body && navOk, detail: `ouvert ${ouvert}, focus dans le menu ${focusDansMenu}, fermé ${ferme}, molette ${def.molette} px, doigt ${def.doigt} px, body overflow ${def.body} (base ${base.body}), voile restant ${def.voile || 'aucun'}, barre du bas ${navOk ? 'ok' : 'KO'}${fondPendant !== null ? `, fond défilé pendant l’ouverture : ${fondPendant} px` : ''}` });
        }

        // Menu du profil : toucher à l'extérieur, Échap.
        for (const mode of ['toucher à l’extérieur', 'touche Échap']) {
            await aller(page, '#materiaux');
            await taper(page, /^Menu du profil utilisateur$/);
            const ouvert = await page.evaluate(() => /Se déconnecter/.test(document.body.innerText));
            if (mode === 'touche Échap') { await page.keyboard.press('Escape'); await attendre(700); }
            else { await page.touchscreen.tap(60, 85); await attendre(700); }
            const ferme = !(await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => /Se déconnecter/.test(b.innerText) && b.getBoundingClientRect().width > 0)));
            const def = await eprouverDefilement(page);
            M.fermetures[`profil ${mode}`] = { ouvert, ferme, def };
            R.push({ label: `C118 · Menu du profil fermé par ${mode}, puis défilement de la liste des ressources`, pass: ouvert && ferme && Math.abs(def.molette) > 20 && Math.abs(def.doigt) > 20 && !def.voile, detail: `ouvert ${ouvert}, fermé ${ferme}, molette ${def.molette} px, doigt ${def.doigt} px, voile ${def.voile || 'aucun'}` });
        }

        // Fenêtre « Nouveau client » fermée par Échap, puis défilement ailleurs.
        await aller(page, '#clients');
        await taper(page, /^Créer un nouveau client$/, { attente: 1200 });
        await page.keyboard.press('Escape'); await attendre(800);
        const fermeeClient = await page.evaluate(() => ![...document.querySelectorAll('[role="dialog"]')].some((d) => d.getBoundingClientRect().width > 0 && /Nouveau Client/i.test(d.innerText)));
        await aller(page, '#materiaux');
        const defClient = await eprouverDefilement(page);
        R.push({ label: 'C118 · Fenêtre « Nouveau client » fermée par Échap : aucun verrou de défilement ne subsiste (écran suivant défilable)', pass: fermeeClient && Math.abs(defClient.molette) > 20 && Math.abs(defClient.doigt) > 20 && defClient.body === base.body, detail: `fermée ${fermeeClient}, molette ${defClient.molette}, doigt ${defClient.doigt}, body ${defClient.body}` });

        // Menu ⋮ de la fiche devis.
        await aller(page, '#devis');
        await taper(page, /^Afficher le devis DEV-2026-001/, { attente: 1800 });
        await taper(page, /^Plus d.actions sur le devis$/);
        const menuPlus = () => page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find((x) => /^Signer le devis$/.test(x.innerText.trim()) && window.__g6.visible(x));
            const m = b && b.parentElement;
            if (!m) return null;
            const r = m.getBoundingClientRect();
            return r.height > 0 ? { haut: Math.round(r.top), bas: Math.round(r.bottom), classe: String(m.className).slice(0, 40) } : null;
        });
        const ficheOuverte = () => page.evaluate(() => [...document.querySelectorAll('.saved-quote-detail-modal')].some((d) => d.getBoundingClientRect().height > 0));
        const defFiche = () => page.evaluate(() => { const d = [...document.querySelectorAll('.saved-quote-detail-modal')].find((x) => x.getBoundingClientRect().height > 0); return d ? Math.round(d.scrollTop) : null; });
        const m0 = await menuPlus();
        const ptExterieur = await page.evaluate(() => { const t = [...document.querySelectorAll('.saved-quote-detail-modal *')].find((e) => e.children.length === 0 && /^Société Immobilière NBB$/.test((e.textContent || '').trim()) && e.getBoundingClientRect().width > 0); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.left + 10, y: r.top + r.height / 2 }; });
        if (ptExterieur) { await page.touchscreen.tap(ptExterieur.x, ptExterieur.y); await attendre(700); }
        const m1 = await menuPlus();
        // Glisser au doigt dans la fiche, menu toujours ouvert ?
        const st0 = await defFiche();
        const cdp = await page.createCDPSession();
        await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 650, xDistance: 0, yDistance: -300, gestureSourceType: 'touch', speed: 1500, preventFling: true });
        await attendre(600);
        await cdp.detach().catch(() => {});
        const st1 = await defFiche();
        const m3 = await menuPlus();
        await capture(page, 'C118_menu_plus_reste_ouvert_390');
        // Revenir en haut, puis Échap.
        await page.mouse.move(195, 500); await page.mouse.wheel({ deltaY: -2000 }); await attendre(500);
        await page.keyboard.press('Escape'); await attendre(800);
        const m2 = await menuPlus();
        const ficheApresEchap = await ficheOuverte();
        M.menuPlus = { ouvert: m0, apresToucherExterieur: m1, defilementFiche: { avant: st0, apres: st1 }, apresDefilement: m3, apresEchap: m2, ficheApresEchap, pointExterieur: ptExterieur };
        R.push({ label: 'C118 · Menu ⋮ « Plus d’actions » (fiche devis, 390) : se ferme au toucher extérieur', pass: !!m0 && !m1, detail: `ouvert ${JSON.stringify(m0)} ; après toucher sur le texte « Société Immobilière NBB » : ${m1 ? 'TOUJOURS OUVERT' : 'fermé'} ; après glisser au doigt (fiche ${st0} → ${st1} px) : ${m3 ? `toujours ouvert (${m3.haut}–${m3.bas} px)` : 'fermé'}` });
        R.push({ label: 'C118 · Menu ⋮ « Plus d’actions » : Échap ferme le menu sans fermer la fiche devis', pass: !m2 && ficheApresEchap, detail: `après Échap : menu ${m2 ? 'ouvert' : 'fermé'}, fiche devis ${ficheApresEchap ? 'toujours affichée' : 'FERMÉE (retour à la liste)'}` });
        if (m2) await taper(page, /^Plus d.actions sur le devis$/).catch(() => {});

        // Sélecteur plein écran (client du devis).
        await aller(page, '#chiffrage');
        await taper(page, /^Client du devis$/, { attente: 1000 });
        const picker = await page.evaluate(() => { const p = [...document.querySelectorAll('.picker-popover')].find((x) => x.getBoundingClientRect().height > 0); return p ? { plein: Math.round(p.getBoundingClientRect().height) } : null; });
        const retour = await localiser(page, /Retour|Fermer|Annuler/, { dans: '.picker-popover' });
        if (retour) { await toucherOuCliquer(page, retour.x, retour.y); await attendre(900); }
        else { await page.keyboard.press('Escape'); await attendre(900); }
        const apresPicker = await page.evaluate(() => ({ ouvert: [...document.querySelectorAll('.picker-popover')].some((x) => x.getBoundingClientRect().height > 0), entete: getComputedStyle(document.querySelector('.global-top-bar')).position }));
        await taper(page, /^Factures$/, { ...NAVB, attente: 1400 });
        const navApres = /^Factures/.test(await titre(page));
        M.picker = { picker, retour: retour && retour.nom, apresPicker, navApres };
        R.push({ label: 'C118 · Sélecteur plein écran « Client du devis » : se ferme par son bouton retour, l’en-tête retrouve sa position, la navigation répond', pass: !!picker && !apresPicker.ouvert && apresPicker.entete === 'sticky' && navApres, detail: JSON.stringify(M.picker) });
    } finally { await page.close(); }
    return R;
}

// ═════════════════════════════════════════════════════════════════════════════
// C119 — gestes complexes et alternatives
// ═════════════════════════════════════════════════════════════════════════════
async function tracerAuDoigt(page, x0, y0, x1, y1, pas = 12) {
    const cdp = await page.createCDPSession();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= pas; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / pas, y: y0 + (y1 - y0) * i / pas }] });
        await attendre(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach().catch(() => {});
}

function encreDuCanevas() {
    const c = [...document.querySelectorAll('canvas')].find((x) => x.getBoundingClientRect().width > 0);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        if (d[(y * c.width + x) * 4 + 3] > 40) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }
    const kx = r.width / c.width, ky = r.height / c.height;
    return {
        canevas: { attributs: `${c.width}×${c.height}`, affiche: `${Math.round(r.width)}×${Math.round(r.height)}`, gauche: Math.round(r.left), haut: Math.round(r.top) },
        encre: maxX < 0 ? null : { gauche: Math.round(r.left + minX * kx), droite: Math.round(r.left + maxX * kx), haut: Math.round(r.top + minY * ky), bas: Math.round(r.top + maxY * ky) }
    };
}

async function c119(nav, url, M) {
    const R = [];
    // H1 — Inventaire des gestes dans l'interface.
    const page = await nouvellePage(nav, url, { width: 390, height: 844, ...TACTILE });
    try {
        const meta = await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.content || '');
        R.push({ label: 'C119 · Zoom à deux doigts non bloqué (meta viewport sans user-scalable=no ni maximum-scale)', pass: !/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/.test(meta), detail: meta });
        const glisser = await page.evaluate(() => [...document.querySelectorAll('[draggable="true"]')].length);
        M.draggable = glisser;

        // H2 — Réordonner les lots sans survol : menu « Options du lot ».
        await aller(page, '#chiffrage');
        await taper(page, /Ajouter un (nouveau )?lot/, { attente: 1300 });
        const ordre = () => page.evaluate(() => [...document.querySelectorAll('[role="button"], button')].filter((b) => window.__g6.visible(b) && /^\d\d\s*Lot \d\d/.test(window.__g6.nom(b))).map((b) => window.__g6.nom(b).slice(0, 18)));
        const o0 = await ordre();
        const lot2 = await localiser(page, /Lot 02/);
        if (lot2) { await toucherOuCliquer(page, lot2.x, lot2.y); await attendre(1300); }
        const chevrons = await page.evaluate(() => [...document.querySelectorAll('button[aria-label="Monter le lot"]')].map((b) => ({ affiche: getComputedStyle(b.parentElement).display, visible: window.__g6.visible(b) })));
        await taper(page, /^Options du lot$/, { attente: 700 });
        const monter = await localiser(page, /Monter le lot/);
        if (monter) { await toucherOuCliquer(page, monter.x, monter.y); await attendre(1000); }
        await taper(page, /^Retour à la liste des lots$/, { attente: 1200 }).catch(() => {});
        const o1 = await ordre();
        M.reordonner = { avant: o0, apres: o1, chevronsSurvol: chevrons, monter: monter && monter.nom };
        R.push({ label: 'C119 · Réordonner les lots au doigt : alternative « Options du lot → Monter le lot » (les flèches n’apparaissent qu’au survol)', pass: !!monter && o1.length >= 2 && /Lot 02/.test(o1[0] || ''), detail: `ordre avant ${JSON.stringify(o0)} → après ${JSON.stringify(o1)} ; flèches au survol : ${JSON.stringify(chevrons)}` });

        // H3 — Poignée du panneau « Menu » : glisser vers le bas.
        await aller(page, '#dashboard');
        await taper(page, /^Ouvrir le menu de navigation$/, { dans: '.mobile-bottom-nav' });
        const poignee = await page.evaluate(() => { const d = document.querySelector('[role="dialog"][aria-label="Menu"]'); const p = d && d.querySelector('.rounded-full.bg-neutral-300'); if (!p) return null; const r = p.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        if (poignee) await tracerAuDoigt(page, poignee.x, poignee.y, poignee.x, poignee.y + 320);
        await attendre(800);
        const toujoursOuvert = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"][aria-label="Menu"]')].some((d) => d.getBoundingClientRect().height > 0));
        M.poignee = { poignee, toujoursOuvert };
        R.push({ label: 'C119 · Panneau « Menu » : la poignée de glissement affichée n’est pas le seul moyen de fermer (bouton et voile existent)', pass: true, detail: `glisser la poignée de 320 px vers le bas : ${toujoursOuvert ? 'SANS EFFET (poignée purement décorative)' : 'ferme le panneau'} ; alternatives « Fermer le menu » et voile : voir C118` });
        if (toujoursOuvert) await taper(page, /^Fermer le menu$/).catch(() => {});

        // H4 — Filtres de catégories de la bibliothèque (rangée qui déborde).
        await aller(page, '#chiffrage');
        await taper(page, /^01 Lot 01/, { attente: 1500 });
        await taper(page, /^Ajouter un ouvrage au lot$/, { attente: 1500 });
        await page.evaluate(() => { const a = document.activeElement; if (a) a.blur(); });
        const rangee = await page.evaluate(() => { const g = window.__g6; const b = g.trouver('^Signalétique', ''); if (!b) return null; const p = b.parentElement; const r = b.getBoundingClientRect(); const pr = p.getBoundingClientRect(); return { cacheADroite: r.left >= innerWidth, overflowX: getComputedStyle(p).overflowX, x: pr.left + pr.width / 2, y: pr.top + pr.height / 2, avant: p.scrollLeft }; });
        let apres = null;
        if (rangee) {
            const cdp = await page.createCDPSession();
            await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(rangee.x), y: Math.round(rangee.y), xDistance: -400, yDistance: 0, gestureSourceType: 'touch', speed: 1500, preventFling: true });
            await attendre(600);
            await cdp.detach().catch(() => {});
            apres = await page.evaluate(() => { const g = window.__g6; const b = g.trouver('^Signalétique', ''); return { scrollLeft: b.parentElement.scrollLeft, visible: b.getBoundingClientRect().right <= innerWidth, fraction: g.exposition(b, 3).fraction }; });
        }
        M.filtres = { rangee, apres };
        R.push({ label: 'C119 · Filtres de catégories hors écran : atteignables par un simple glissement horizontal (et la recherche texte en alternative)', pass: !!rangee && !!apres && apres.fraction > 0, detail: JSON.stringify(M.filtres) });
    } finally { await page.close(); }

    // H5 — Signature manuscrite au doigt (geste à tracé, jugé essentiel).
    const p2 = await nouvellePage(nav, url, { width: 390, height: 844, ...TACTILE });
    try {
        await aller(p2, '#devis');
        await taper(p2, /^Afficher le devis DEV-2026-001/, { attente: 1800 });
        await taper(p2, /^Plus d.actions sur le devis$/);
        await taper(p2, /^Signer le devis$/, { attente: 1200 });
        const avant = await p2.evaluate(encreDuCanevas);
        const c = avant.canevas;
        const [l, h] = c.affiche.split('×').map(Number);
        const doigt = { x0: Math.round(c.gauche + l * 0.2), x1: Math.round(c.gauche + l * 0.8), y: Math.round(c.haut + h * 0.5) };
        await tracerAuDoigt(p2, doigt.x0, doigt.y, doigt.x1, doigt.y, 20);
        await attendre(400);
        const apres = await p2.evaluate(encreDuCanevas);
        await capture(p2, 'C119_signature_trace_doigt_390');
        const ecartDroite = apres.encre ? doigt.x1 - apres.encre.droite : null;
        M.signature390 = { doigt, ...apres, ecartDroite };
        R.push({ label: 'C119 · Signature au doigt à 390 px : le trait suit le doigt (écart ≤ 6 px)', pass: !!apres.encre && Math.abs(ecartDroite) <= 6 && Math.abs(apres.encre.gauche - doigt.x0) <= 6, detail: `canevas ${c.attributs} affiché ${c.affiche} ; doigt de x=${doigt.x0} à x=${doigt.x1} ; encre de x=${apres.encre && apres.encre.gauche} à x=${apres.encre && apres.encre.droite} → écart en fin de trait ${ecartDroite} px` });
        // Alternative sans tracé ? Effacer puis valider.
        await taper(p2, /Effacer/, { dans: '.fixed.inset-0' });
        const etatValider = await p2.evaluate(() => { const g = window.__g6; const b = g.trouver('Valider & Signer', ''); return b ? { desactive: b.disabled === true, nom: g.nom(b) } : null; });
        let resultat = null;
        if (etatValider && !etatValider.desactive) {
            await taper(p2, /Valider & Signer/, { attente: 1500 });
            resultat = await p2.evaluate(() => ({ signeParDefaut: /Client Signataire/.test(document.body.innerText), signe: /Signé|signé/.test(document.body.innerText) }));
            await capture(p2, 'C119_signature_vide_validee_390');
        }
        M.signatureVide = { etatValider, resultat };
        R.push({ label: 'C119 · Signature : la validation exige un tracé ou propose une alternative explicite (saisie du nom) — pas de signature vide', pass: !!etatValider && etatValider.desactive, detail: `canevas effacé, nom vide : « Valider & Signer » ${etatValider ? (etatValider.desactive ? 'désactivé' : 'ACTIF') : 'introuvable'}${resultat ? ` → devis signé : ${resultat.signe}, signataire « Client Signataire » affiché : ${resultat.signeParDefaut}` : ''}` });
    } finally { await p2.close(); }

    const p3 = await nouvellePage(nav, url, { width: 1440, height: 900, ...BUREAU });
    try {
        await aller(p3, '#devis');
        await taper(p3, /DEV-2026-001/, { sel: 'button, a, [role="button"], tr', attente: 1800 }).catch(() => {});
        await taper(p3, /^Signer le devis$/, { attente: 1200 });
        const avant = await p3.evaluate(encreDuCanevas);
        const c = avant.canevas;
        const [l, h] = c.affiche.split('×').map(Number);
        const souris = { x0: Math.round(c.gauche + l * 0.2), x1: Math.round(c.gauche + l * 0.8), y: Math.round(c.haut + h * 0.5) };
        await p3.mouse.move(souris.x0, souris.y); await p3.mouse.down();
        for (let i = 1; i <= 20; i++) await p3.mouse.move(souris.x0 + (souris.x1 - souris.x0) * i / 20, souris.y);
        await p3.mouse.up(); await attendre(300);
        const apres = await p3.evaluate(encreDuCanevas);
        M.signature1440 = { souris, ...apres, ecartDroite: apres.encre ? souris.x1 - apres.encre.droite : null };
        R.push({ label: 'C119 · Signature à la souris à 1440 px (témoin) : le trait suit le pointeur (écart ≤ 6 px)', pass: !!apres.encre && Math.abs(M.signature1440.ecartDroite) <= 6, detail: `canevas ${c.attributs} affiché ${c.affiche} ; pointeur ${souris.x0}→${souris.x1} ; encre ${apres.encre && apres.encre.gauche}→${apres.encre && apres.encre.droite}` });
    } catch (e) {
        R.push({ label: 'C119 · Signature à la souris à 1440 px (témoin)', pass: false, detail: `ERREUR DE SONDE : ${e.message}` });
    } finally { await p3.close(); }
    return R;
}

// ═════════════════════════════════════════════════════════════════════════════
// C120 — tâches essentielles sur les navigateurs mobiles disponibles
// ═════════════════════════════════════════════════════════════════════════════
async function c120(nav, url, M) {
    const R = [];
    M.moteurs = {
        chromium: await nav.version(),
        puppeteer: JSON.parse(await readFile(new URL('../../../node_modules/puppeteer/package.json', import.meta.url), 'utf8')).version,
        note: 'Émulation mobile Chromium (isMobile, hasTouch, UA Android). WebKit/Mobile Safari et Gecko/Firefox Android non pilotés par cette sonde.'
    };
    const page = await nouvellePage(nav, url, { width: 412, height: 915, ...TACTILE }, { ua: UA_ANDROID });
    const NAVB = { dans: '.mobile-bottom-nav' };
    const etapes = [];
    let devis = null;
    const etape = async (nom, fn) => { try { const v = await fn(); etapes.push({ nom, ok: v !== false, v }); return v; } catch (e) { etapes.push({ nom, ok: false, v: e.message }); return false; } };
    try {
        // T1 — Créer un client.
        await etape('Menu → Clients & CRM', async () => { await taper(page, /^Ouvrir le menu de navigation$/, NAVB); await taper(page, /^Clients & CRM$/, { dans: '[role="dialog"][aria-label="Menu"]', attente: 1500 }); return /^Clients/.test(await titre(page)); });
        await etape('Créer un nouveau client', async () => { await taper(page, /^Créer un nouveau client$/, { attente: 1200 }); await taper(page, /^Nom du client/, { sel: 'input' }); await page.keyboard.type('SARL Mobile G6', { delay: 15 }); await page.evaluate(() => document.activeElement.blur()); await attendre(300); await taper(page, /^Créer le client$/, { dans: '[role="dialog"]', attente: 1300 }); return page.evaluate(() => /SARL Mobile G6/.test(document.body.innerText)); });
        // T2 — Chiffrer et enregistrer un devis.
        await etape('Devis → Nouveau devis', async () => { await taper(page, /^Devis$/, { ...NAVB, attente: 1400 }); await taper(page, /^Nouveau devis$/, { attente: 1600 }); return /Chiffrage/.test(await titre(page)); });
        await etape('Ajouter un ouvrage (Agglos)', async () => { await ajouterOuvrage(page); return !!(await localiser(page, /^Surface directe/, { sel: 'input' })); });
        await etape('Saisir 120 m² et confirmer les quantités', async () => { await taper(page, /^Surface directe/, { sel: 'input' }); await page.keyboard.type('120', { delay: 30 }); await page.evaluate(() => document.activeElement.blur()); await attendre(500); await taper(page, /^Confirmer mes quantités$/, { attente: 1000 }); return !(await localiser(page, /^Confirmer mes quantités$/)); });
        await etape('Terminer puis Enregistrer', async () => { await taper(page, /^Terminer$/, { attente: 1200 }); await taper(page, /^Enregistrer$/, { attente: 2200 }); return true; });
        devis = await etape('Le devis apparaît dans « Mes devis » avec un montant', async () => { await taper(page, /^Devis$/, { ...NAVB, attente: 1500 }); return page.evaluate(() => { const c = [...document.querySelectorAll('[role="button"]')].find((x) => /DEV-2026-002/.test(x.innerText)); return c ? c.innerText.replace(/\s+/g, ' ').slice(0, 120) : false; }); });
        await capture(page, 'C120_devis_enregistre_412');
        // T3 — Facturer.
        await etape('Ouvrir le devis et créer le brouillon de facture', async () => { await taper(page, /^Afficher le devis DEV-2026-002/, { attente: 1800 }); await taper(page, /^Facturer le devis DEV-2026-002$/, { attente: 1600 }); await taper(page, /^Créer le brouillon$/, { attente: 2000 }); return true; });
        await etape('La facture brouillon est listée', async () => { await aller(page, '#dashboard'); await taper(page, /^Factures$/, { ...NAVB, attente: 1500 }); return page.evaluate(() => /Brouillons\s*1/.test(document.body.innerText.replace(/\s+/g, ' ')) || /brouillon/i.test(document.body.innerText)); });
        await capture(page, 'C120_facture_brouillon_412');
    } finally { await page.close(); }
    M.etapes = etapes;
    M.devis = devis;
    const ko = etapes.filter((e) => !e.ok);
    R.push({ label: 'C120 · Chromium 152 (émulation Android 412×915, toucher) : créer un client, chiffrer et enregistrer un devis, le facturer', pass: ko.length === 0, detail: etapes.map((e) => `${e.ok ? '✓' : '✗'} ${e.nom}${e.ok ? '' : ' (' + String(e.v).slice(0, 80) + ')'}`).join(' · ') });
    R.push({ label: 'C120 · Mêmes tâches sur Safari iOS / WebKit, Firefox Android, appareil physique', pass: false, detail: 'NON TESTÉ — aucun moteur WebKit ni Gecko pilotable par la sonde (Puppeteer : Chrome seul en cache), aucun appareil physique ; le simulateur iOS présent sur la machine ne permet pas d’imposer l’isolement réseau exigé (blocage hors 127.0.0.1, config factice)' });
    return R;
}

// ═════════════════════════════════════════════════════════════════════════════
const CONTROLES = [['C111', c111], ['C112', c112], ['C113', c113], ['C114', c114], ['C115', c115], ['C116', c116], ['C117', c117], ['C118', c118], ['C119', c119], ['C120', c120]];

export async function run() {
    const seul = (process.env.G6_SEUL || '').split(',').map((s) => s.trim()).filter(Boolean);
    await mkdir(PREUVES, { recursive: true });
    const { url, close } = await startServer();
    const nav = await puppeteer.launch({ headless: true, protocolTimeout: 240000, args: ['--lang=fr-FR'] });
    const resultats = [];
    const mesures = {};
    try {
        for (const [id, fn] of CONTROLES) {
            if (seul.length && !seul.includes(id)) continue;
            const debut = Date.now();
            let R = null;
            for (let essai = 1; essai <= 2 && !R; essai++) {
                const M = {};
                try {
                    R = await fn(nav, url, M);
                    mesures[id] = { ...M, essai, dureeS: Math.round((Date.now() - debut) / 1000) };
                } catch (e) {
                    const delai = /timeout|timed out/i.test(String(e));
                    if (essai === 1 && delai) continue; // une seule nouvelle tentative si un délai expire
                    R = [{ label: `${id} · ERREUR DE SONDE`, pass: false, detail: String(e && e.stack || e).slice(0, 400) }];
                    mesures[id] = { ...M, erreur: String(e).slice(0, 400), essai };
                }
            }
            resultats.push(...R);
            console.error(`[G6] ${id} terminé en ${Math.round((Date.now() - debut) / 1000)} s`);
        }
    } finally {
        await nav.close();
        await close();
    }
    resultats.push({ label: 'Isolement · aucune requête tentée hors 127.0.0.1', pass: JOURNAL.externes.size === 0, detail: [...JOURNAL.externes].join(', ') || 'aucune tentative' });
    resultats.push({ label: 'Console · aucune erreur JavaScript ni dialogue natif pendant la sonde', pass: JOURNAL.console.length === 0, detail: [...new Set(JOURNAL.console)].slice(0, 4).join(' | ') || 'aucune' });
    const suffixe = seul.length ? `-${seul.join('-')}` : '';
    await writeFile(path.join(PREUVES, `mesures${suffixe}.json`), JSON.stringify({ date: new Date().toISOString(), captures: JOURNAL.captures, mesures, resultats }, null, 2));
    return resultats;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const resultats = await run();
    for (const r of resultats) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    process.exit(resultats.every((r) => r.pass) ? 0 : 1);
}
