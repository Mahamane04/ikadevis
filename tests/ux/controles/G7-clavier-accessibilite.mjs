#!/usr/bin/env node
// Audit UX 220 — groupe G7 « clavier & accessibilité » (contrôles 123, 124,
// 126, 127, 128, 130, 132, 133, 134, 135, 136, 137, 138, 139, 140).
//
// Mode Démo uniquement, serveur isolé 127.0.0.1 (startServer, port libre),
// config factice (config.example.js), toute requête hors 127.0.0.1 BLOQUÉE,
// téléchargements REFUSÉS, dialogues natifs refusés. Données de démo fictives.
//
// Manipulation « comme un utilisateur » : vraies touches (page.keyboard), vraie
// molette, vrais gestes souris/tactile (page.mouse, page.touchscreen), clics
// par coordonnées quand le recouvrement compte. Les mesures portent sur ce qui
// est PERÇU : styles calculés, rectangles, pixels capturés (indicateur de
// focus = différence de pixels focus / sans focus), arbre d'accessibilité
// calculé par Chromium (pas de lecteur d'écran : le rendu vocal n'est PAS testé).
//
// Seul réglage non-utilisateur : avant un parcours au clavier, le point de
// départ de la tabulation est remis en tête de document (body focalisé puis
// rendu non focalisable), ce qui équivaut à un chargement de page.
//
//   node tests/ux/controles/G7-clavier-accessibilite.mjs [section…]
//   sections : bureau fenetres chiffrage focus mobile signature reflow
//              espacement mouvement
import puppeteer from 'puppeteer';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { decode } from 'fast-png';
import { startServer } from '../../../scratch/lib/server.mjs';

const CONFIG = await readFile(new URL('../../../config.example.js', import.meta.url), 'utf8');
const PREUVES = fileURLToPath(new URL('../../../docs/audit-ux-220/UX_EVIDENCE/G7-clavier-accessibilite/', import.meta.url));
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

const ROUTES = ['#dashboard', '#chantiers', '#clients', '#chiffrage', '#devis', '#factures',
    '#depenses', '#ouvrages', '#materiaux', '#abonnement', '#settings/entreprise'];
const VP = {
    d1440: { width: 1440, height: 900, deviceScaleFactor: 1 },
    d1024: { width: 1024, height: 768, deviceScaleFactor: 1 },
    t768: { width: 768, height: 1024, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
    m390: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
    m360: { width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
    m320: { width: 320, height: 568, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
    // Équivalents zoom navigateur : 1280×1024 à 400 % et 1440×900 à 200 %.
    z400: { width: 320, height: 256, deviceScaleFactor: 1 },
    z200: { width: 720, height: 450, deviceScaleFactor: 1 },
    paysage: { width: 844, height: 390, isMobile: true, hasTouch: true, isLandscape: true, deviceScaleFactor: 1 }
};

// ─── Outils injectés dans la page ───────────────────────────────────────────
const OUTILS = `window.__g7 = (() => {
  const parse = (s) => { const m = (s || '').match(/rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?\\)/); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
  const lum = (c) => { const [r, g, b] = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
  const melange = (fg, bg) => (fg[3] >= 1 ? fg.slice(0, 3) : [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])));
  const fond = (el) => { const pile = []; let e = el; while (e && e.nodeType === 1) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { pile.push(c); if (c[3] >= 1) break; } e = e.parentElement; } let col = [255, 255, 255]; for (let i = pile.length - 1; i >= 0; i--) col = melange(pile[i], col); return col.map(Math.round); };
  const vis = (el) => { if (!el || !el.getClientRects().length) return false; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; if (el.closest('[inert],[aria-hidden="true"]')) return false; return true; };
  const nom = (el) => { const lb = el.getAttribute('aria-labelledby'); if (lb) { const t = lb.split(/\\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').trim(); if (t) return t; } return (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || el.title || '').trim().replace(/\\s+/g, ' '); };
  const desc = (el) => { if (!el || el === document.body) return 'BODY'; const r = el.getAttribute('role'); return el.tagName + (r ? '[' + r + ']' : '') + ' «' + nom(el).slice(0, 48) + '»'; };
  const tabulables = () => [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex],[contenteditable="true"]')].filter((el) => !el.disabled && el.tabIndex >= 0 && vis(el));
  const dialogues = () => [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter(vis);
  const dessus = () => { const d = dialogues(); return d[d.length - 1] || null; };
  return { parse, lum, ratio, melange, fond, vis, nom, desc, tabulables, dialogues, dessus };
})();`;

// ─── Session isolée ─────────────────────────────────────────────────────────
async function ouvrirSession(vp, { reduit = false } = {}) {
    const { url, close } = await startServer();
    const browser = await puppeteer.launch({ headless: true, args: ['--lang=fr-FR'] });
    const page = await browser.newPage();
    const externes = [], erreursPage = [], dialoguesNatifs = [];
    try {
        const s = await browser.target().createCDPSession();
        await s.send('Browser.setDownloadBehavior', { behavior: 'deny' });
    } catch (e) { /* non disponible : aucun export n'est déclenché */ }
    await page.setViewport(vp);
    if (reduit) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.setRequestInterception(true);
    page.on('request', (r) => {
        const u = new URL(r.url());
        if (u.pathname === '/config.js') return r.respond({ contentType: 'application/javascript', body: CONFIG });
        if (/^https?:$/.test(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname)) { externes.push(u.hostname); return r.abort(); }
        r.continue();
    });
    page.on('pageerror', (e) => erreursPage.push(String(e).slice(0, 200)));
    page.on('dialog', async (d) => { dialoguesNatifs.push(d.message()); await d.dismiss(); });
    await page.goto(url + '/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: 'networkidle0', timeout: 60000 });
    await page.addScriptTag({ content: OUTILS });
    return {
        page, browser, externes, erreursPage, dialoguesNatifs, vp,
        fermer: async () => { try { await browser.close(); } finally { await close(); } }
    };
}

async function entrerDemo(page) {
    const ok = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Essayer sans compte');
        b?.click();
        return Boolean(b);
    });
    if (!ok) throw new Error('Bouton « Essayer sans compte » introuvable');
    await page.waitForFunction(() => document.getElementById('main-content') && !document.querySelector('.animate-page-spin'), { timeout: 30000 });
    await attendre(1500);
    await page.evaluate(OUTILS);
}

async function aller(page, hash) {
    // La barre latérale ne met pas l'adresse à jour (UX-P2-06) : on passe par
    // une ancre neutre pour que le changement d'adresse déclenche toujours la route.
    await page.evaluate((h) => { history.replaceState(null, '', '#g7'); window.location.hash = h; }, hash);
    await attendre(1300);
    await page.waitForFunction(() => !document.querySelector('.animate-page-spin'), { timeout: 15000 }).catch(() => {});
}

// Remet le point de départ de la tabulation en tête de document (≈ chargement).
const enTete = (page) => page.evaluate(() => {
    document.activeElement?.blur?.();
    document.body.tabIndex = -1; document.body.focus(); document.body.removeAttribute('tabindex');
});
const actif = (page) => page.evaluate(() => __g7.desc(document.activeElement));
async function shiftTab(page) { await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift'); }
async function capture(page, nom, clip) {
    try {
        await mkdir(PREUVES, { recursive: true });
        await page.screenshot({ path: path.join(PREUVES, nom), ...(clip ? { clip } : {}) });
        return `UX_EVIDENCE/G7-clavier-accessibilite/${nom}`;
    } catch (e) { return `capture impossible (${String(e).slice(0, 60)})`; }
}
// Focalise un élément visible par sélecteur/texte, sans l'activer.
async function focaliser(page, fn) { return page.evaluate(fn); }

// ─── Parcours de tabulation : piège ? ───────────────────────────────────────
async function cycleTab(page, { inverse = false, max } = {}) {
    await enTete(page);
    const n = await page.evaluate(() => {
        window.__g7n = 0;
        document.querySelectorAll('[data-g7]').forEach((e) => e.removeAttribute('data-g7'));
        return __g7.tabulables().length;
    });
    const limite = Math.min(max ?? n + 25, 450);
    let premier = null, precedent = null, repet = 0, boucle = false, vueChangee = false;
    const arrets = [];
    const vueDepart = await page.evaluate(() => (document.querySelector('main h1')?.innerText || '') + '|' + location.hash);
    for (let i = 0; i < limite; i++) {
        if (inverse) await shiftTab(page); else await page.keyboard.press('Tab');
        const s = await page.evaluate(() => {
            const a = document.activeElement;
            if (!a || a === document.body || a === document.documentElement) return { id: 'BODY' };
            if (!a.dataset.g7) a.dataset.g7 = String(++window.__g7n);
            return { id: a.dataset.g7, d: __g7.desc(a) };
        });
        if (s.id === 'BODY') { if (arrets.length) { boucle = true; break; } continue; }
        if (premier === null) premier = s.id;
        else if (s.id === premier) { boucle = true; break; }
        repet = s.id === precedent ? repet + 1 : 0;
        if (repet >= 3) break;
        precedent = s.id;
        arrets.push(s);
    }
    const vueFin = await page.evaluate(() => (document.querySelector('main h1')?.innerText || '') + '|' + location.hash);
    vueChangee = vueFin !== vueDepart;
    return {
        boucle, n, pas: arrets.length, vueChangee, vueDepart, vueFin,
        derniers: arrets.slice(-6).map((x) => x.d).join(' → ')
    };
}

// ─── Indicateur de focus mesuré aux pixels ──────────────────────────────────
function ratioPixels(a, b) {
    const lum = (r, g, bl) => {
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
    };
    const L1 = lum(...a), L2 = lum(...b);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}
function comparerCaptures(bufA, bufB) {
    const A = decode(bufA), B = decode(bufB);
    if (A.width !== B.width || A.height !== B.height) return { faible: 1e9, fort: 1e9 };
    const ca = A.channels, cb = B.channels;
    let faible = 0, fort = 0;
    for (let i = 0, j = 0; i < A.data.length; i += ca, j += cb) {
        const pa = [A.data[i], A.data[i + 1], A.data[i + 2]], pb = [B.data[j], B.data[j + 1], B.data[j + 2]];
        const d = Math.max(Math.abs(pa[0] - pb[0]), Math.abs(pa[1] - pb[1]), Math.abs(pa[2] - pb[2]));
        if (d > 24) { faible++; if (ratioPixels(pa, pb) >= 3) fort++; }
    }
    return { faible, fort };
}

async function parcoursFocus(page, { max = 60, prefixe = 'x', capturesMax = 2 } = {}) {
    await enTete(page);
    await page.mouse.move(1, Math.round(page.viewport().height / 2));
    await page.evaluate(() => { window.__g7n = 0; document.querySelectorAll('[data-g7]').forEach((e) => e.removeAttribute('data-g7')); });
    const vp = page.viewport();
    const res = { arrets: 0, sansIndicateur: [], peuContraste: [], masques: [], partiels: [], captures: [] };
    let premier = null;
    for (let i = 0; i < max; i++) {
        await page.keyboard.press('Tab');
        await attendre(200);
        const s = await page.evaluate(() => {
            const a = document.activeElement;
            if (!a || a === document.body) return { id: 'BODY' };
            if (!a.dataset.g7) a.dataset.g7 = String(++window.__g7n);
            const r = a.getBoundingClientRect();
            const pts = [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]
                .map(([fx, fy]) => [r.left + r.width * fx, r.top + r.height * fy]);
            let vus = 0, dansVue = 0; let couvrant = '';
            for (const [x, y] of pts) {
                if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
                dansVue++;
                const e = document.elementFromPoint(x, y);
                if (e && (a === e || a.contains(e))) vus++;
                else if (e && !couvrant) { const c = e.closest('nav,header,footer,[class*="fixed"],[class*="sticky"],.mobile-bottom-nav,.quote-totals-bar') || e; couvrant = c.tagName + '.' + String(c.className).split(' ').slice(0, 3).join('.'); }
            }
            return { id: a.dataset.g7, d: __g7.desc(a), r: [r.x, r.y, r.width, r.height], vus, dansVue, couvrant };
        });
        if (s.id === 'BODY') { if (res.arrets) break; continue; }
        if (premier === null) premier = s.id; else if (s.id === premier) break;
        res.arrets++;
        if (s.vus === 0) res.masques.push(`${s.d} (${s.dansVue ? 'recouvert par ' + s.couvrant : 'hors de la vue'})`);
        else if (s.vus < 3) res.partiels.push(`${s.d} ${s.vus}/5 (${s.couvrant})`);
        const m = 5;
        const x = Math.max(0, Math.floor(s.r[0] - m)), y = Math.max(0, Math.floor(s.r[1] - m));
        const w = Math.min(vp.width - x, Math.ceil(s.r[2] + 2 * m)), h = Math.min(vp.height - y, Math.ceil(s.r[3] + 2 * m));
        if (w < 4 || h < 4 || s.vus === 0) continue;
        const clip = { x, y, width: w, height: h };
        const avec = await page.screenshot({ clip });
        await page.evaluate(() => { window.__g7el = document.activeElement; window.__g7el.blur(); });
        await attendre(200);
        const sans = await page.screenshot({ clip });
        await page.evaluate(() => { window.__g7el?.focus({ preventScroll: true }); });
        const { faible, fort } = comparerCaptures(avec, sans);
        const perim = 2 * (s.r[2] + s.r[3]);
        if (faible < perim * 0.5) {
            res.sansIndicateur.push(`${s.d} (${faible} px modifiés / périmètre ${Math.round(perim)})`);
            if (res.captures.length < capturesMax) {
                await mkdir(PREUVES, { recursive: true });
                const nom = `${prefixe}-focus-invisible-${res.captures.length + 1}.png`;
                await writeFile(path.join(PREUVES, nom), avec);
                res.captures.push(nom);
            }
        } else if (fort < perim) res.peuContraste.push(`${s.d} (${fort} px à ≥ 3:1 / périmètre ${Math.round(perim)})`);
    }
    return res;
}

// ─── Relevé statique d'un écran ─────────────────────────────────────────────
function releverEcran() {
    const g = window.__g7;
    const out = {};
    const H = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]')].filter(g.vis)
        .map((h) => ({ n: +(h.getAttribute('aria-level') || h.tagName[1] || 2), t: h.innerText.trim().replace(/\s+/g, ' ').slice(0, 40) }));
    out.titres = H;
    out.h1 = H.filter((h) => h.n === 1).map((h) => h.t);
    out.sauts = [];
    for (let i = 1; i < H.length; i++) if (H[i].n - H[i - 1].n > 1) out.sauts.push(`${H[i - 1].t} (h${H[i - 1].n}) → ${H[i].t} (h${H[i].n})`);
    out.mains = [...document.querySelectorAll('main,[role=main]')].filter(g.vis).length;
    out.h1DansMain = H.length ? Boolean([...document.querySelectorAll('main h1')].find(g.vis)) : false;
    out.mainTexte = (document.getElementById('main-content')?.innerText || '').trim().length;
    out.navs = [...document.querySelectorAll('nav,[role=navigation]')].filter(g.vis).map((n) => n.getAttribute('aria-label') || '(sans nom)');
    out.asidesSansNom = [...document.querySelectorAll('aside')].filter((a) => g.vis(a) && !a.getAttribute('aria-label') && !a.getAttribute('aria-labelledby')).length;
    out.titreDocument = document.title;
    // Images
    out.imagesSansAlt = [...document.querySelectorAll('img')].filter((i) => g.vis(i) && !i.hasAttribute('alt')).map((i) => i.getAttribute('src')?.slice(0, 60));
    out.imagesInformatives = [...document.querySelectorAll('img')].filter((i) => g.vis(i) && i.getAttribute('alt')).map((i) => `${i.getAttribute('src')?.split('/').pop()?.slice(0, 30)} → « ${i.getAttribute('alt')} »`);
    out.svgSansStatut = [...document.querySelectorAll('svg')].filter((s) => g.vis(s) && s.getAttribute('aria-hidden') !== 'true' && !s.getAttribute('role') && !s.querySelector('title') && !s.closest('button,a,[role=button]')).length;
    out.canvas = [...document.querySelectorAll('canvas')].filter(g.vis).map((c) => c.getAttribute('aria-label') || c.getAttribute('role') || '(sans nom)');
    // Animations infinies visibles
    out.animations = document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming?.().iterations === Infinity)
        .map((a) => a.effect.target).filter((t) => t && g.vis(t) && t.getBoundingClientRect().bottom > 0 && t.getBoundingClientRect().top < innerHeight)
        .map((t) => `${String(t.className).match(/animate-[\w-]+|fa-spin|fa-pulse|fa-beat/)?.[0] || t.tagName} « ${(t.closest('[title]')?.title || t.closest('button,[role=button]')?.innerText || t.parentElement?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40)} »`);
    out.medias = document.querySelectorAll('video,audio,iframe').length;
    // Contraste non textuel : bordures des champs, icônes seules
    out.champsFaibles = [];
    for (const el of document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]),select,textarea')) {
        if (!g.vis(el) || el.getBoundingClientRect().width < 20) continue;
        const cs = getComputedStyle(el);
        const parent = g.fond(el.parentElement);
        const propre = g.fond(el);
        const bw = Math.max(...['Top', 'Right', 'Bottom', 'Left'].map((s) => parseFloat(cs['border' + s + 'Width']) || 0));
        const bc = g.parse(cs.borderBottomColor) || [0, 0, 0, 0];
        const bord = bw >= 1 && bc[3] > 0 ? g.melange(bc, parent) : null;
        const meilleur = Math.max(bord ? g.ratio(bord, parent) : 1, bord ? g.ratio(bord, propre) : 1, g.ratio(propre, parent));
        if (meilleur < 3) out.champsFaibles.push({ d: g.desc(el), bord: cs.borderBottomColor, fondChamp: `rgb(${propre})`, fondParent: `rgb(${parent})`, ratio: +meilleur.toFixed(2) });
    }
    out.icones = [];
    for (const b of document.querySelectorAll('button,a[href],[role=button]')) {
        if (!g.vis(b) || b.disabled || b.getAttribute('aria-disabled') === 'true' || (b.innerText || '').trim().length > 1) continue;
        const ic = b.querySelector('i,svg');
        if (!ic || !g.vis(ic)) continue;
        const col = g.parse(getComputedStyle(ic).color);
        if (!col) continue;
        const bg = g.fond(ic);
        const r = g.ratio(g.melange(col, bg), bg);
        if (r < 3) out.icones.push({ d: g.desc(b), couleur: getComputedStyle(ic).color, ratio: +r.toFixed(2) });
    }
    // Cibles (2.5.8) — exception d'espacement : cercle de 24 px centré.
    const SEL = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=checkbox],[role=switch],[role=option],[tabindex]:not([tabindex="-1"])';
    const cibles = [...document.querySelectorAll(SEL)].filter((el) => g.vis(el) && !el.disabled)
        .filter((el) => !(el.tagName === 'A' && el.closest('p,li') && getComputedStyle(el).display === 'inline'))
        .map((el) => { const r = el.getBoundingClientRect(); return { el, r, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; })
        .filter((c) => c.r.bottom > 0 && c.r.top < innerHeight && c.r.right > 0 && c.r.left < innerWidth);
    const petites = cibles.filter((c) => c.r.width < 24 || c.r.height < 24);
    const intersecteRect = (cx, cy, rad, r) => { const dx = Math.max(r.left - cx, 0, cx - r.right), dy = Math.max(r.top - cy, 0, cy - r.bottom); return dx * dx + dy * dy < rad * rad; };
    out.ciblesPetites = [];
    for (const p of petites) {
        const conflit = cibles.find((o) => o !== p && !o.el.contains(p.el) && !p.el.contains(o.el) && (intersecteRect(p.cx, p.cy, 12, o.r)
            || (petites.includes(o) && Math.hypot(o.cx - p.cx, o.cy - p.cy) < 24)));
        out.ciblesPetites.push({ d: g.desc(p.el), taille: `${Math.round(p.r.width)}×${Math.round(p.r.height)}`, espacementOk: !conflit, voisin: conflit ? g.desc(conflit.el) : '' });
    }
    // Champs dont le seul libellé visible est l'indication (placeholder)
    out.champsSansLibelleVisible = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea')]
        .filter((el) => g.vis(el) && el.placeholder && el.type !== 'search' && !/^Recherch/i.test(el.getAttribute('aria-label') || el.placeholder) && !(el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) && !el.closest('label'))
        .filter((el) => { const p = el.parentElement?.parentElement; const lab = p?.querySelector('label,span,p'); return !lab || !lab.innerText.trim() || el.parentElement.querySelector('label') === null && !(el.previousElementSibling?.innerText || '').trim(); })
        .map((el) => g.desc(el));
    // Débordement horizontal
    out.debordement = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    out.sortants = [...document.querySelectorAll('main *')].filter((el) => {
        if (!g.vis(el) || el.children.length > 0 && !(el.innerText || '').trim()) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.right <= innerWidth + 1) return false;
        let p = el.parentElement;
        while (p && p !== document.body) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(cs.overflowX) && p.getBoundingClientRect().right <= innerWidth + 1) return false; p = p.parentElement; }
        return true;
    }).slice(0, 8).map((el) => g.desc(el));
    // Couverture verticale des éléments fixes/collants (zoom 400 %)
    const fixes = [...document.querySelectorAll('body *')].filter((el) => { const p = getComputedStyle(el).position; return (p === 'fixed' || p === 'sticky') && g.vis(el) && el.getBoundingClientRect().height > 8 && el.getBoundingClientRect().width > innerWidth * 0.5; })
        .filter((el, i, arr) => !arr.some((o) => o !== el && o.contains(el)));
    const bas = document.querySelector('.mobile-bottom-nav');
    out.fixes = fixes.map((el) => `${el.tagName}.${String(el.className).split(' ')[0]} ${Math.round(el.getBoundingClientRect().height)}px`);
    out.hauteurFixe = fixes.reduce((s, el) => s + Math.min(el.getBoundingClientRect().height, innerHeight), 0) + (bas && g.vis(bas) && !fixes.includes(bas) ? bas.getBoundingClientRect().height : 0);
    const main = document.getElementById('main-content');
    out.hauteurMainVisible = main ? Math.round(Math.max(0, Math.min(main.getBoundingClientRect().bottom, bas && g.vis(bas) ? bas.getBoundingClientRect().top : innerHeight) - Math.max(main.getBoundingClientRect().top, 0))) : 0;
    // Info portée par un title seul sur un élément non focalisable
    out.titleSeul = [...document.querySelectorAll('[title]')].filter((el) => g.vis(el) && el.tabIndex < 0 && !el.closest('button,a,[role=button],[tabindex]')
        && !(el.innerText || '').trim() && !el.getAttribute('aria-label')).map((el) => {
            // Redondant si la valeur figure déjà en texte dans le bloc parent.
            const val = (el.title.match(/[\d][\d\s.,]*/) || [''])[0].trim();
            const bloc = el.closest('section, [class*="rounded-2xl"], [class*="rounded-xl"]');
            const redondant = Boolean(val && bloc && bloc.innerText.includes(val));
            return `${el.tagName} « ${el.title.slice(0, 50)} »${redondant ? ' (valeur aussi en texte)' : ''}`;
        }).slice(0, 10);
    // Aide : présence d'un mécanisme d'aide
    out.aide = [...document.querySelectorAll('a,button')].filter(g.vis).map((b) => g.nom(b)).filter((t) => /aide|support|assistance|whatsapp|centre d.aide|besoin d.aide|\?$/i.test(t)).slice(0, 5);
    // Ordre de la navigation principale
    out.ordreNav = [...document.querySelectorAll('nav[aria-label="Menu principal"] button, nav[aria-label="Barre de navigation rapide"] button')].filter(g.vis).map((b) => g.nom(b).split(' ')[0]).join('>');
    return out;
}

// Noms accessibles (arbre Chromium) : glyphes d'icônes (zone d'usage privé).
async function arbreAccessible(page) {
    const snap = await page.accessibility.snapshot({ interestingOnly: true });
    const titres = [], reperes = [], pua = [], sansNom = [];
    (function parcourir(n) {
        if (!n) return;
        if (n.role === 'heading') titres.push(`h${n.level} ${String(n.name).slice(0, 30)}`);
        if (['main', 'navigation', 'banner', 'complementary', 'contentinfo', 'region', 'search', 'form'].includes(n.role)) reperes.push(`${n.role}${n.name ? '«' + n.name + '»' : ''}`);
        if (/[-]/.test(n.name || '')) pua.push(`${n.role} «${n.name}»`);
        if (['button', 'link', 'textbox', 'combobox', 'checkbox', 'tab', 'menuitem', 'option', 'switch', 'slider', 'spinbutton'].includes(n.role) && !String(n.name || '').trim()) sansNom.push(n.role);
        (n.children || []).forEach(parcourir);
    })(snap);
    return { titres, reperes, pua, sansNom };
}

// ─── Fenêtres / menus au clavier ────────────────────────────────────────────
async function testerFenetre(page, { nom, preparer, declencheur, modale = true }) {
    if (preparer) await preparer(page);
    const trouve = await page.evaluate(declencheur);
    if (!trouve) return { nom, absent: true };
    const decl = await actif(page);
    const boutonsAvant = await page.evaluate(() => [...document.querySelectorAll('button,[role=menuitem],[role=option]')].filter(__g7.vis).length);
    await page.keyboard.press('Enter');
    await attendre(1000);
    const boutonsApres = await page.evaluate(() => [...document.querySelectorAll('button,[role=menuitem],[role=option]')].filter(__g7.vis).length);
    const etat = await page.evaluate(() => {
        const d = __g7.dessus();
        const a = document.activeElement;
        const exp = document.querySelector('[data-g7-decl]')?.getAttribute('aria-expanded');
        return { ouverte: Boolean(d), nom: d ? __g7.nom(d).slice(0, 40) : '', nomPropre: d ? (d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText) || '') : '', focusDedans: Boolean(d && d.contains(a)), modal: d?.getAttribute('aria-modal'), focus: __g7.desc(a), expanded: exp };
    });
    let sorties = 0;
    const vus = new Set();
    if (modale && etat.ouverte) {
        for (let i = 0; i < 22; i++) {
            await page.keyboard.press('Tab');
            const r = await page.evaluate(() => { const d = __g7.dessus(); const a = document.activeElement; if (!a.dataset.g7b) a.dataset.g7b = String(Math.random()); return { dedans: Boolean(d && d.contains(a)), id: a.dataset.g7b }; });
            if (!r.dedans) sorties++;
            vus.add(r.id);
        }
    }
    await page.keyboard.press('Escape');
    await attendre(800);
    const apres = await page.evaluate(() => ({
        restantes: __g7.dialogues().length,
        focus: __g7.desc(document.activeElement),
        surDecl: document.activeElement?.hasAttribute('data-g7-decl'),
        expanded: document.querySelector('[data-g7-decl]')?.getAttribute('aria-expanded')
    }));
    await page.evaluate(() => document.querySelectorAll('[data-g7-decl]').forEach((e) => e.removeAttribute('data-g7-decl')));
    return { nom, decl, etat, sorties, distincts: vus.size, apres, nouveaux: boutonsApres - boutonsAvant };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTIONS
// ═══════════════════════════════════════════════════════════════════════════

// Bureau 1440 : relevés par écran, tabulation, titres, repères, lien
// d'évitement, images, animations, contrastes non textuels, raccourcis.
async function sectionBureau(ok) {
    const S = await ouvrirSession(VP.d1440);
    const { page } = S;
    try {
        // Écran de connexion : authentification accessible (3.3.8), finalité (1.3.5)
        const connexion = await page.evaluate(() => [...document.querySelectorAll('input')].filter(__g7.vis).map((i) => `${i.type}:${i.getAttribute('autocomplete') || '∅'}:${i.getAttribute('aria-label') || i.labels?.[0]?.innerText || i.placeholder}`));
        ok('C140', `Connexion — champs exposant leur finalité (1.3.5 / 3.3.8) : ${connexion.join(' ; ')}`, connexion.every((c) => !/^(email|password|text):∅/.test(c)), '');
        await entrerDemo(page);
        const scans = {};
        for (const route of ROUTES) {
            await aller(page, route);
            const s = await page.evaluate(releverEcran);
            s.ax = await arbreAccessible(page);
            scans[route] = s;
        }
        // C126 — titres et repères
        for (const route of ROUTES) {
            const s = scans[route];
            ok('C126', `1440 ${route} — un seul h1 (${s.h1.join(' / ') || 'aucun'}), pas de saut de niveau${s.sauts.length ? ' (' + s.sauts.join(' ; ') + ')' : ''}`, s.h1.length === 1 && s.sauts.length === 0, `titres : ${s.titres.map((h) => 'h' + h.n).join(' ')}`);
            ok('C126', `1440 ${route} — le contenu de l'écran (h1) est dans le repère « main »`, s.h1DansMain, s.h1DansMain ? '' : `main#main-content vide (${s.mainTexte} car.) ; contenu dans une région hors main`);
            const dupNav = s.navs.filter((n, i) => s.navs.indexOf(n) !== i);
            ok('C126', `1440 ${route} — repères : 1 main, navigations nommées et distinctes`, s.mains === 1 && !s.navs.includes('(sans nom)') && dupNav.length === 0, `navs : ${s.navs.join(' | ')} ; aside sans nom : ${s.asidesSansNom} ; arbre : ${s.ax.reperes.join(' ')}`);
        }
        // Lien d'évitement : vraie touche Tab puis Entrée
        await aller(page, '#devis');
        await enTete(page);
        await page.keyboard.press('Tab');
        await attendre(300);
        const lien = await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return { d: __g7.desc(a), visible: r.width > 50 && r.height > 20 && r.top >= 0 && __g7.vis(a), hash: location.hash }; });
        const preuveLien = await capture(page, 'c126-lien-evitement-1440.png', { x: 0, y: 0, width: 600, height: 120 });
        await page.keyboard.press('Enter');
        await attendre(800);
        const apresLien = await page.evaluate(() => ({ hash: location.hash, focus: __g7.desc(document.activeElement), h1: document.querySelector('main h1')?.innerText }));
        await page.keyboard.press('Tab');
        await attendre(300);
        const suivant = await page.evaluate(() => ({ dansMain: Boolean(document.getElementById('main-content')?.contains(document.activeElement)), d: __g7.desc(document.activeElement) }));
        ok('C126', `Lien d'évitement : 1er arrêt Tab = ${lien.d}, visible au focus`, /Aller au contenu principal/.test(lien.d) && lien.visible, preuveLien);
        ok('C126', `Lien d'évitement : Entrée puis Tab → arrêt dans le contenu (${suivant.d})`, suivant.dansMain, `focus juste après Entrée : ${apresLien.focus}`);
        ok('C126', `Lien d'évitement : l'adresse de l'écran est conservée (avant #devis, après ${apresLien.hash})`, apresLien.hash === '#devis', 'le lien pointe vers #main-content, non focalisable');

        // C123 — tabulation complète, avant et arrière, sur chaque écran
        for (const route of ROUTES) {
            await aller(page, route);
            const c = await cycleTab(page);
            ok('C123', `1440 ${route} — Tab fait le tour sans piège (${c.pas} arrêts / ${c.n} tabulables)`, c.boucle, c.boucle ? '' : `arrêt : ${c.derniers}`);
            ok('C140', `1440 ${route} — parcourir au clavier ne change pas d'écran (3.2.1)`, !c.vueChangee, c.vueChangee ? `${c.vueDepart} → ${c.vueFin}` : '');
        }
        for (const route of ['#dashboard', '#chiffrage', '#devis', '#settings/entreprise']) {
            await aller(page, route);
            const c = await cycleTab(page, { inverse: true });
            ok('C123', `1440 ${route} — Maj+Tab fait le tour sans piège (${c.pas} arrêts)`, c.boucle, c.boucle ? '' : `arrêt : ${c.derniers}`);
        }

        // C137 — images, icônes, graphiques
        const imagesSansAlt = ROUTES.flatMap((r) => scans[r].imagesSansAlt.map((s) => `${r}:${s}`));
        const pua = ROUTES.flatMap((r) => scans[r].ax.pua.map((s) => `${r}:${s}`));
        const sansNom = ROUTES.flatMap((r) => scans[r].ax.sansNom.map((s) => `${r}:${s}`));
        ok('C137', `1440 — images sans attribut alt : ${imagesSansAlt.length}`, imagesSansAlt.length === 0, imagesSansAlt.slice(0, 5).join(' ; '));
        ok('C137', `1440 — glyphes d'icônes (Font Awesome) absents des noms accessibles : ${pua.length} fuite(s)`, pua.length === 0, pua.slice(0, 4).join(' ; '));
        ok('C137', `1440 — contrôles sans nom dans l'arbre d'accessibilité : ${sansNom.length}`, sansNom.length === 0, sansNom.slice(0, 6).join(' ; '));
        const informatives = [...new Set(ROUTES.flatMap((r) => scans[r].imagesInformatives))];
        ok('C137', `1440 — images informatives avec alternative : ${informatives.length}`, true, informatives.slice(0, 6).join(' ; ') || 'aucune image informative visible (icônes de menu en alt="" + aria-hidden)');
        const svg = ROUTES.reduce((s, r) => s + scans[r].svgSansStatut, 0);
        ok('C137', `1440 — SVG hors bouton ni masqués ni nommés : ${svg}`, svg === 0, '');

        // C138 — animations au repos
        const anim = ROUTES.flatMap((r) => scans[r].animations.map((a) => `${r}:${a}`));
        ok('C138', `1440 — animations infinies visibles au repos (11 écrans) : ${anim.length}`, anim.length === 0, anim.slice(0, 5).join(' ; '));
        ok('C138', `Médias (vidéo/audio/iframe) présents : ${ROUTES.reduce((s, r) => s + scans[r].medias, 0)}`, true, '1.2.x et 1.4.2 sans objet si 0');

        // C132 — contraste non textuel
        const champs = ROUTES.flatMap((r) => scans[r].champsFaibles.map((c) => ({ r, ...c })));
        const combos = {};
        for (const c of champs) { const k = `${c.bord} sur ${c.fondParent} (champ ${c.fondChamp}) ${c.ratio}:1`; combos[k] = (combos[k] || 0) + 1; }
        ok('C132', `1440 — champs de saisie dont la limite visible est < 3:1 : ${champs.length} sur 11 écrans`, champs.length === 0, Object.entries(combos).map(([k, n]) => `${n}× ${k}`).slice(0, 4).join(' ; ') + ` — ex. ${champs.slice(0, 3).map((c) => c.r + ' ' + c.d).join(' ; ')}`);
        const icones = ROUTES.flatMap((r) => scans[r].icones.map((c) => ({ r, ...c })));
        const iconesConnues = icones.filter((i) => /143, 156, 168/.test(i.couleur));
        const iconesAutres = icones.filter((i) => !/143, 156, 168/.test(i.couleur));
        ok('C132', `1440 — boutons-icônes < 3:1 hors teinte neutral-400 déjà connue (UX-P2-07 : ${iconesConnues.length}) : ${iconesAutres.length}`, iconesAutres.length === 0, iconesAutres.slice(0, 5).map((i) => `${i.r} ${i.d} ${i.couleur} ${i.ratio}:1`).join(' ; '));

        // C136 — cibles à 1440
        const petites = ROUTES.flatMap((r) => scans[r].ciblesPetites.filter((c) => !c.espacementOk).map((c) => `${r} ${c.d} ${c.taille} (voisin ${c.voisin})`));
        ok('C136', `1440 — cibles < 24 px sans espacement suffisant : ${[...new Set(petites)].length}`, petites.length === 0, [...new Set(petites)].slice(0, 6).join(' ; '));

        // C139 / C140 — aide, title seul, titre de page, navigation cohérente
        const titleSeul = [...new Set(ROUTES.flatMap((r) => scans[r].titleSeul))];
        const titleNonRedondant = titleSeul.filter((t) => !/valeur aussi en texte/.test(t));
        ok('C139', `1440 — informations portées UNIQUEMENT par une infobulle « title » non focalisable : ${titleNonRedondant.length}`, titleNonRedondant.length === 0, titleSeul.slice(0, 5).join(' ; '));
        const aides = ROUTES.map((r) => `${r}:${scans[r].aide.join('/') || '—'}`);
        ok('C139', `1440 — mécanisme d'aide présent et à la même place (3.2.6 si présent)`, true, aides.slice(0, 4).join(' ; '));
        const titres = [...new Set(ROUTES.map((r) => scans[r].titreDocument))];
        ok('C140', `Titre de document propre à chaque écran (2.4.2) : ${titres.length} titre(s) distinct(s) pour 11 écrans`, titres.length > 1, titres.join(' | '));
        const ordres = [...new Set(ROUTES.filter((r) => !/settings|abonnement/.test(r)).map((r) => scans[r].ordreNav))].map((o) => o.split('>'));
        const memeOrdreRelatif = ordres.every((a) => ordres.every((b) => { const communs = a.filter((x) => b.includes(x)); return communs.join('>') === b.filter((x) => a.includes(x)).join('>'); }));
        ok('C140', `Navigation principale : même ordre relatif sur les 9 écrans (3.2.3) — ${ordres.length} variante(s) par ajout d'entrées`, memeOrdreRelatif, ordres.map((o) => o.join('>')).join(' ‖ '));
        // Les étapes de l'échéancier sont des lignes d'un groupe titré « Échéancier de paiement » : exclues.
        const placeholders = [...new Set(ROUTES.flatMap((r) => scans[r].champsSansLibelleVisible.map((d) => `${r} ${d}`)))].filter((d) => !/Intitulé de l'étape/.test(d));
        ok('C140', `Champs dont le seul libellé visible est le texte indicatif (3.3.2) : ${placeholders.length}`, placeholders.length === 0, placeholders.slice(0, 6).join(' ; '));

        // C140 — raccourcis à une seule touche (2.1.4)
        await aller(page, '#dashboard');
        const avant = await page.evaluate(() => location.hash + '|' + document.querySelector('main h1')?.innerText + '|' + __g7.dialogues().length);
        await page.evaluate(() => document.querySelector('main h1')?.focus());
        for (const k of ['n', 'd', 'f', 'c', '?', '/', 'k', 's', '1']) { await page.keyboard.press(k); await attendre(150); }
        await attendre(600);
        const apres = await page.evaluate(() => location.hash + '|' + document.querySelector('main h1')?.innerText + '|' + __g7.dialogues().length);
        ok('C140', `Touches seules n d f c ? / k s 1 hors champ : aucun effet (2.1.4)`, avant === apres, `${avant} → ${apres}`);

        // C127 — région live pendant la transition d'écran
        await aller(page, '#dashboard');
        await page.evaluate(() => {
            window.__g7live = [];
            const noter = () => { for (const el of document.querySelectorAll('[aria-live],[role=status],[role=alert]')) { const t = el.textContent.trim(); const last = window.__g7live[window.__g7live.length - 1]; if (t && (!last || last.t !== t)) window.__g7live.push({ t, role: el.getAttribute('role'), live: el.getAttribute('aria-live'), ms: Math.round(performance.now()) }); } };
            window.__g7obs = new MutationObserver(noter);
            window.__g7obs.observe(document.body, { subtree: true, childList: true, characterData: true });
        });
        await page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Menu principal"] button')].find((b) => /Clients/.test(b.innerText))?.focus());
        await page.keyboard.press('Enter');
        await attendre(1500);
        const live = await page.evaluate(() => { window.__g7obs.disconnect(); return window.__g7live; });
        const transitoires = live.filter((l) => /Chargement/.test(l.t));
        const duree = transitoires.length ? transitoires[transitoires.length - 1].ms - transitoires[0].ms : 0;
        ok('C127', `Changement d'écran : la région live polie change ${transitoires.length} fois en ${duree} ms (chronomètre)`, transitoires.length <= 2, transitoires.slice(0, 4).map((l) => `« ${l.t.slice(-40)} »`).join(' → '));
        const focusApres = await actif(page);
        ok('C127', `Changement d'écran : le focus est amené sur le titre du nouvel écran (${focusApres})`, /^H1/.test(focusApres), 'UX-P2-05 corrigé — non recompté');

        // C133 — états de sélection : la couleur seule ?
        const comparerGroupe = (quoi, motif, portee = 'body') => page.evaluate((quoi, motif, portee) => {
            const re = new RegExp(motif);
            const items = [...document.querySelectorAll(portee + ' button, ' + portee + ' [role=tab], ' + portee + ' [role=button]')]
                .filter((b) => __g7.vis(b) && re.test(b.innerText.trim().replace(/\s+/g, ' ')));
            const uniq = items.filter((b, i) => items.indexOf(b) === i);
            if (uniq.length < 2) return { quoi, absent: true, n: uniq.length };
            const estSel = (e) => e.getAttribute('aria-current') === 'page' || e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-pressed') === 'true';
            let a = uniq.find(estSel);
            if (!a) { const f = uniq.map((e) => getComputedStyle(e).backgroundColor + getComputedStyle(e).color); a = uniq.find((e, i) => f.filter((x) => x === f[i]).length === 1) || uniq[0]; }
            const b = uniq.find((e) => e !== a);
            const ca = getComputedStyle(a), cb = getComputedStyle(b);
            const formes = ['fontWeight', 'borderTopWidth', 'borderBottomWidth', 'textDecorationLine', 'fontStyle'].filter((p) => ca[p] !== cb[p]);
            const ombre = (ca.boxShadow === 'none') !== (cb.boxShadow === 'none');
            const enfants = a.querySelectorAll('i,svg,img').length !== b.querySelectorAll('i,svg,img').length;
            const fa = __g7.fond(a), fb = __g7.fond(b);
            const ta = __g7.melange(__g7.parse(ca.color), fa), tb = __g7.melange(__g7.parse(cb.color), fb);
            return { quoi, n: uniq.length, a: a.innerText.trim().replace(/\s+/g, ' ').slice(0, 24), b: b.innerText.trim().replace(/\s+/g, ' ').slice(0, 24), formes, ombre, enfants,
                ecartFond: +__g7.ratio(fa, fb).toFixed(2), ecartTexte: +__g7.ratio(ta, tb).toFixed(2),
                etatExpose: a.getAttribute('aria-current') || a.getAttribute('aria-selected') || a.getAttribute('aria-pressed') || '∅' };
        }, quoi, motif, portee);
        const etats = [];
        await aller(page, '#dashboard');
        etats.push(await comparerGroupe('barre latérale', '^(Tableau de bord|Chantiers|Clients|Mes devis|Factures|Dépenses)', 'nav[aria-label="Menu principal"]'));
        etats.push(await comparerGroupe('filtre de période du tableau de bord', '^(Tout|Ce mois|Trimestre|Année)$', 'main'));
        await aller(page, '#factures');
        etats.push(await comparerGroupe('filtres de statut des factures', '^(Toutes|Non réglées|Soldées|Brouillons)', 'main'));
        await aller(page, '#depenses');
        etats.push(await comparerGroupe('filtre des dépenses', '^(Toutes|À payer|Payées|Avances)', 'main'));
        await aller(page, '#settings/finances');
        etats.push(await comparerGroupe('rubriques Finances', '^(Comptes|Devises|Taxes|Catégories)', 'body'));
        await aller(page, '#devis/101');
        await attendre(600);
        etats.push(await comparerGroupe('fiche devis : Synthèse / Détaillé', '^(Synthèse|Détaillé)$', 'body'));
        for (const e of etats) {
            if (e.absent) { ok('C133', `${e.quoi} — groupe non trouvé (${e.n})`, false, 'BLOQUÉ'); continue; }
            const indice = e.formes.length > 0 || e.ombre || e.enfants;
            const luminance = e.ecartFond >= 3 || e.ecartTexte >= 3;
            ok('C133', `${e.quoi} — l'élément actif (« ${e.a} ») se distingue autrement que par la teinte`, indice || luminance,
                `indices de forme : ${e.formes.join(',') || 'aucun'}${e.ombre ? ', ombre' : ''}${e.enfants ? ', pictogramme' : ''} ; écart de luminance fond ${e.ecartFond}:1, texte ${e.ecartTexte}:1`);
            ok('C140', `${e.quoi} — l'état actif est exposé aux technologies d'assistance (4.1.2) : ${e.etatExpose}`, e.etatExpose !== '∅', e.etatExpose === '∅' ? `« ${e.a} » sans aria-pressed/selected/current` : '');
        }
    } finally {
        ok('Env', `bureau — aucune requête externe (${S.externes.length}), aucune erreur page (${S.erreursPage.length})`, S.externes.length === 0 && S.erreursPage.length === 0, [...new Set(S.externes)].concat(S.erreursPage).slice(0, 3).join(' ; '));
        await S.fermer();
    }
}

// Fenêtres, menus et popovers au clavier (C123 sortie, C128 modèle dialog).
async function sectionFenetres(ok) {
    const S = await ouvrirSession(VP.d1440);
    const { page } = S;
    try {
        await entrerDemo(page);
        const marquer = (fn) => `(() => { const el = (${fn})(); if (!el) return false; el.setAttribute('data-g7-decl', ''); el.focus(); return document.activeElement === el; })()`;
        const specs = [
            { nom: 'Nouveau Client', preparer: (p) => aller(p, '#clients'), declencheur: marquer(`() => document.querySelector('button[aria-label="Créer un nouveau client"]')`) },
            { nom: 'Personnaliser le tableau de bord', preparer: (p) => aller(p, '#dashboard'), declencheur: marquer(`() => [...document.querySelectorAll('main button')].find((b) => /personnaliser/i.test(b.innerText + b.getAttribute('aria-label')) && __g7.vis(b))`) },
            { nom: 'Offres (Formule Starter)', preparer: (p) => aller(p, '#dashboard'), declencheur: marquer(`() => [...document.querySelectorAll('[role=button]')].find((b) => /Formule Starter/.test(b.getAttribute('aria-label') || '') && __g7.vis(b))`) },
            { nom: 'Signature du devis', preparer: async (p) => { await aller(p, '#devis/101'); await attendre(800); }, declencheur: marquer(`() => [...document.querySelectorAll('button[aria-label="Signer le devis"]')].find(__g7.vis)`) },
            { nom: 'Menu du profil', modale: false, preparer: (p) => aller(p, '#dashboard'), declencheur: marquer(`() => document.querySelector('button[aria-label="Menu du profil utilisateur"]')`) },
            { nom: 'Changer d\'organisation', modale: false, preparer: (p) => aller(p, '#dashboard'), declencheur: marquer(`() => [...document.querySelectorAll('button')].find((b) => /changer d.organisation/i.test(b.getAttribute('aria-label') || '') && __g7.vis(b))`) },
            { nom: 'Plus d\'actions sur le devis (chiffrage)', modale: false, preparer: (p) => aller(p, '#chiffrage'), declencheur: marquer(`() => [...document.querySelectorAll('button[aria-label="Plus d\\'actions sur le devis"]')].find(__g7.vis)`) },
            { nom: 'Statut du devis (chiffrage)', modale: false, preparer: (p) => aller(p, '#chiffrage'), declencheur: marquer(`() => [...document.querySelectorAll('button[aria-label="Statut du devis"]')].find(__g7.vis)`) }
        ];
        for (const spec of specs) {
            const r = await testerFenetre(page, { ...spec, declencheur: spec.declencheur });
            if (r.absent) { ok('C123', `${spec.nom} — déclencheur introuvable`, false, 'BLOQUÉ'); continue; }
            if (spec.modale === false) {
                ok('C128', `${spec.nom} — Entrée ouvre le menu (${r.nouveaux} commande(s) apparue(s)) et l'état est exposé (aria-expanded=${r.etat.expanded ?? '∅'})`, r.nouveaux > 0 && r.etat.expanded === 'true', `focus après ouverture : ${r.etat.focus}`);
                ok('C123', `${spec.nom} — Échap referme et rend le focus au déclencheur`, r.apres.surDecl && r.apres.expanded !== 'true' && r.apres.restantes === 0, `après Échap : focus ${r.apres.focus}, aria-expanded=${r.apres.expanded ?? '∅'}`);
                continue;
            }
            ok('C128', `${spec.nom} — fenêtre ouverte au clavier, nommée « ${r.etat.nomPropre || '—'} », focus placé dedans`, r.etat.ouverte && r.etat.focusDedans && Boolean(r.etat.nomPropre), `focus : ${r.etat.focus} ; aria-modal=${r.etat.modal}`);
            ok('C128', `${spec.nom} — Tab ×22 reste dans la fenêtre (${r.distincts} arrêts distincts)`, r.etat.ouverte && r.sorties === 0 && r.distincts >= 1, `${r.sorties} sortie(s)`);
            ok('C123', `${spec.nom} — Échap referme, focus rendu au déclencheur`, r.apres.restantes === 0 && r.apres.surDecl, `après Échap : ${r.apres.restantes} fenêtre(s), focus ${r.apres.focus}`);
        }
        // Erreur de saisie (3.3.1) : « Nouveau Client » validé vide
        await aller(page, '#clients');
        await page.focus('button[aria-label="Créer un nouveau client"]');
        await page.keyboard.press('Enter');
        await attendre(900);
        await page.evaluate(() => {
            window.__g7live = [];
            window.__g7obs = new MutationObserver(() => { for (const el of document.querySelectorAll('[role=status],[role=alert]')) { const t = el.textContent.trim(); if (t && !window.__g7live.some((x) => x.t === t)) window.__g7live.push({ t, role: el.getAttribute('role'), ms: Math.round(performance.now()) }); } });
            window.__g7obs.observe(document.body, { subtree: true, childList: true, characterData: true });
        });
        const champNom = await page.evaluate(() => { const d = __g7.dessus(); const i = d && [...d.querySelectorAll('input')].find(__g7.vis); i?.focus(); return i ? { d: __g7.desc(i), required: i.required, ariaRequired: i.getAttribute('aria-required') } : null; });
        await page.keyboard.press('Enter');
        await attendre(500);
        const erreur = await page.evaluate(() => { const d = __g7.dessus(); const i = d && [...d.querySelectorAll('input')].find(__g7.vis); return { ouverte: Boolean(d), invalide: i?.getAttribute('aria-invalid'), decrit: i?.getAttribute('aria-describedby'), natif: i?.validationMessage || '', texteDansFenetre: d ? /requis|obligatoire/i.test(d.innerText) : false, live: window.__g7live, focus: __g7.desc(document.activeElement) }; });
        const tErr = Date.now();
        let visibleJusqua = 0;
        for (let i = 0; i < 60; i++) { const v = await page.evaluate(() => [...document.querySelectorAll('[role=alert],[role=status]')].some((e) => __g7.vis(e) && /requis/i.test(e.textContent))); if (!v) break; visibleJusqua = Date.now() - tErr; await attendre(100); }
        ok('C140', `Nouveau Client vide — erreur identifiée en texte (3.3.1) : ${erreur.natif ? 'bulle native « ' + erreur.natif + ' »' : erreur.live.map((l) => `${l.role} « ${l.t} »`).join(' ; ') || 'aucune'}`, Boolean(erreur.natif || erreur.live.length || erreur.texteDansFenetre), `champ ${champNom?.d} required=${champNom?.required} aria-invalid=${erreur.invalide ?? '∅'}`);
        ok('C139', `Nouveau Client vide — l'erreur reste consultable (${erreur.natif ? 'validation native, champ focalisé, réaffichée à chaque essai' : `message visible ${Math.round(visibleJusqua / 100) / 10} s`})`, erreur.natif || erreur.texteDansFenetre || visibleJusqua >= 5000, `focus : ${erreur.focus}`);
        await page.keyboard.press('Escape');
        await attendre(600);
        // Fiche devis ouverte au clavier (ligne du tableau) : où va le focus ?
        await aller(page, '#devis');
        await page.evaluate(() => [...document.querySelectorAll('[aria-label^="Afficher le devis DEV-2026-001"]')].find(__g7.vis)?.focus());
        const ligne = await actif(page);
        await page.keyboard.press('Enter');
        await attendre(1600);
        const fiche = await page.evaluate(() => ({ hash: location.hash, focus: __g7.desc(document.activeElement) }));
        ok('C124', `Fiche devis ouverte au clavier depuis ${ligne} : le focus suit (${fiche.hash}, focus ${fiche.focus})`, fiche.focus !== 'BODY', 'sous-cas « ouverture d\'une fiche devis » de UX-P2-05, non couvert par le correctif (navigation seule)');
        // 3.3.4 + 2.1.1 : « Supprimer le devis » dans la ligne du tableau — clavier vs souris
        const etatListe = () => page.evaluate(() => ({ hash: location.hash, fiche: /Convertir en facture/.test(document.body.innerText), dlg: __g7.dessus() ? __g7.nom(__g7.dessus()).slice(0, 40) : '', focus: __g7.desc(document.activeElement) }));
        const resultats = {};
        for (const touche of ['Enter', 'Space']) {
            await aller(page, '#devis');
            await page.evaluate(() => [...document.querySelectorAll('[aria-label^="Supprimer le devis DEV-2026-001"]')].find(__g7.vis)?.focus());
            await page.keyboard.press(touche);
            await attendre(1400);
            resultats[touche] = await etatListe();
            if (resultats[touche].dlg) { await page.keyboard.press('Escape'); await attendre(600); }
        }
        await aller(page, '#devis');
        const pt = await page.evaluate(() => { const b = [...document.querySelectorAll('[aria-label^="Supprimer le devis DEV-2026-001"]')].find(__g7.vis); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
        await page.mouse.click(pt[0], pt[1]);
        await attendre(1200);
        const souris = await etatListe();
        const preuve = await capture(page, 'c128-suppression-devis-souris-1440.png');
        ok('C140', `Supprimer un devis (souris) : confirmation demandée (3.3.4) — « ${souris.dlg} », focus ${souris.focus}`, Boolean(souris.dlg), preuve);
        if (souris.dlg) { await page.keyboard.press('Escape'); await attendre(600); }
        for (const touche of ['Enter', 'Space']) {
            const r = resultats[touche];
            ok('C128', `1440 « Supprimer le devis DEV-2026-001 » (bouton dans une ligne cliquable) activé par ${touche === 'Space' ? 'Espace' : 'Entrée'} : même effet qu'au clic (confirmation)`, Boolean(r.dlg),
                r.dlg ? '' : `la ligne intercepte la touche : fiche ouverte (${r.hash}, fiche ${r.fiche ? 'affichée' : 'non'}), aucune confirmation, focus ${r.focus}`);
        }
        const reste = await page.evaluate(() => (document.body.innerText.match(/(\d+) résultat/) || [])[1]);
        ok('Env', `aucun devis supprimé pendant l'essai (${reste} résultat)`, reste === '1', '');
    } finally {
        await S.fermer();
    }
}

// Éditeur de chiffrage au clavier : combobox, onglets de lots, raccourcis,
// focus après action, régions live, durée des messages, réordonnancement.
async function sectionChiffrage(ok) {
    const S = await ouvrirSession(VP.d1440);
    const { page } = S;
    try {
        await entrerDemo(page);
        await aller(page, '#chiffrage');
        // C128 — combobox « Rechercher un ouvrage »
        await page.focus('input[aria-label="Rechercher un ouvrage à ajouter"]');
        await page.keyboard.type('peinture', { delay: 40 });
        await attendre(700);
        await page.keyboard.press('ArrowDown');
        await attendre(250);
        const cb = await page.evaluate(() => {
            const i = document.activeElement;
            const opts = [...document.querySelectorAll('[role=option]')].filter(__g7.vis);
            return { role: i.getAttribute('role'), expanded: i.getAttribute('aria-expanded'), ad: i.getAttribute('aria-activedescendant'), controls: i.getAttribute('aria-controls'), ids: opts.filter((o) => o.id).length, n: opts.length, selected: opts.map((o) => o.getAttribute('aria-selected')).join(','), focusDansInput: i.tagName === 'INPUT' };
        });
        ok('C128', `Combobox « Rechercher un ouvrage » — Flèche bas : option active exposée (aria-activedescendant=${cb.ad ?? '∅'}, ${cb.ids}/${cb.n} options avec id)`, Boolean(cb.ad), `aria-selected des options : ${cb.selected} ; aria-expanded=${cb.expanded}`);
        await page.keyboard.press('Escape');
        await attendre(300);
        const apresEchap = await page.evaluate(() => ({ exp: document.activeElement.getAttribute('aria-expanded'), d: __g7.desc(document.activeElement), liste: [...document.querySelectorAll('[role=listbox]')].filter(__g7.vis).length }));
        ok('C128', `Combobox — Échap referme la liste et garde le focus dans le champ`, apresEchap.liste === 0 && /Rechercher un ouvrage/.test(apresEchap.d), `aria-expanded=${apresEchap.exp}, focus ${apresEchap.d}`);
        // Ajout au clavier : Entrée sur la 1re suggestion
        await page.evaluate(() => { const i = document.querySelector('input[aria-label="Rechercher un ouvrage à ajouter"]'); i.focus(); i.select(); });
        await page.keyboard.type('peinture', { delay: 40 });
        await attendre(700);
        await page.keyboard.press('Enter');
        await attendre(1500);
        const apresAjout = await actif(page);
        ok('C124', `Ajout d'un ouvrage au clavier (Entrée) : le focus reste utilisable (${apresAjout})`, apresAjout !== 'BODY', 'UX-P2-05 couvrait ce cas ; le correctif ne traite que la navigation entre écrans');
        // C127 — saisie d'une quantité : régions live sollicitées ?
        await page.evaluate(() => {
            window.__g7live = [];
            window.__g7obs = new MutationObserver(() => { for (const el of document.querySelectorAll('[aria-live],[role=status],[role=alert],[role=log]')) { if (!__g7.vis(el)) continue; const t = el.textContent.trim(); const l = window.__g7live.filter((x) => x.el === el).pop(); if (!l || l.t !== t) window.__g7live.push({ el, t }); } });
            window.__g7obs.observe(document.body, { subtree: true, childList: true, characterData: true });
        });
        await page.focus('input[aria-label="Surface directe (m²)"]');
        await page.keyboard.type('125', { delay: 120 });
        await attendre(600);
        const liveSaisie = await page.evaluate(() => { window.__g7obs.disconnect(); return window.__g7live.map((x) => `${x.el.getAttribute('role') || 'live'} « ${x.t.slice(0, 40)} »`); });
        ok('C127', `Saisie « 125 » dans Surface directe : ${liveSaisie.length} mise(s) à jour de région live (pas de rafale par touche)`, liveSaisie.length <= 3, liveSaisie.slice(0, 4).join(' ; '));
        // Confirmer les quantités au clavier
        await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Confirmer mes quantités/.test(b.innerText) && __g7.vis(b))?.focus());
        const declConf = await actif(page);
        await page.keyboard.press('Enter');
        await attendre(900);
        const apresConf = await actif(page);
        ok('C124', `« Confirmer mes quantités » au clavier : le focus reste utilisable (${declConf} → ${apresConf})`, apresConf !== 'BODY', 'bouton retiré du DOM après usage');
        // C127 / C139 — messages éphémères : enregistrement, durée réelle
        const lireToast = () => page.evaluate(() => { const e = [...document.querySelectorAll('[role=status],[role=alert]')].find((x) => __g7.vis(x) && x.className.includes('fixed')); return e ? { t: e.textContent.trim(), role: e.getAttribute('role'), live: e.getAttribute('aria-live') } : null; });
        const mesurerToast = async (declencher, attenteMax = 7000) => {
            const t0 = Date.now();
            await declencher();
            let vu = null, fin = null, texte = '', role = '', live = '';
            while (Date.now() - t0 < attenteMax) {
                const v = await lireToast();
                if (v && vu === null) { vu = Date.now() - t0; texte = v.t; role = v.role; live = v.live; }
                if (!v && vu !== null) { fin = Date.now() - t0; break; }
                await attendre(80);
            }
            return { vu, duree: vu !== null ? ((fin ?? Date.now() - t0) - vu) : 0, texte, role, live };
        };
        const focusEnregistrer = () => page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^Enregistr/.test(b.innerText.trim()) && __g7.vis(b))?.focus());
        // Le conteneur live existe-t-il AVANT le message ? (insertion avec contenu = annonce incertaine)
        await page.evaluate(() => { window.__g7insert = []; window.__g7obs2 = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) { if (n.nodeType !== 1) continue; const el = n.matches('[role=status],[role=alert]') ? n : n.querySelector?.('[role=status],[role=alert]'); if (el && el.className.includes('fixed')) window.__g7insert.push({ avecTexte: Boolean(el.textContent.trim()) }); } }); window.__g7obs2.observe(document.body, { childList: true, subtree: true }); });
        await focusEnregistrer();
        const t1 = await mesurerToast(() => page.keyboard.press('Enter'));
        const focusSave = await actif(page);
        const insertion = await page.evaluate(() => { window.__g7obs2.disconnect(); return window.__g7insert; });
        ok('C127', `Enregistrer : message d'état exposé (${t1.role || 'aucun rôle'}/${t1.live || '∅'} « ${t1.texte} »)`, /status|alert/.test(t1.role), `focus après : ${focusSave}`);
        ok('C127', `Message d'état : la région live existe avant que le texte n'y arrive`, insertion.length > 0 && insertion.every((x) => !x.avecTexte), `${insertion.length} insertion(s) du conteneur, ${insertion.filter((x) => x.avecTexte).length} déjà remplie(s) — annonce non garantie selon le lecteur d'écran (à confirmer)`);
        ok('C139', `Message « enregistré » visible ${Math.round(t1.duree / 100) / 10} s quand il est seul`, t1.duree >= 3000, 'minuterie prévue : 3,5 s');
        // Deux messages rapprochés : la minuterie du premier efface-t-elle le second ?
        await focusEnregistrer();
        await page.keyboard.press('Enter');
        await attendre(2600);
        await focusEnregistrer();
        const t2 = await mesurerToast(() => page.keyboard.press('Enter'));
        ok('C139', `Second message émis 2,6 s après un premier : visible ${Math.round(t2.duree / 100) / 10} s (« ${t2.texte.slice(0, 40)} »)`, t2.duree >= 3000, 'minuterie de 3,5 s non liée au message qu\'elle efface');
        await attendre(3800);
        // Second lot (au clavier) pour les onglets
        await page.evaluate(() => [...document.querySelectorAll('button[aria-label="Ajouter un lot au devis"]')].find(__g7.vis)?.focus());
        await page.keyboard.press('Enter');
        await attendre(1200);
        await page.keyboard.press('Escape');
        await attendre(400);
        // C128 — onglets de lots (APG : flèches)
        const TL = '[role=tablist][aria-label="Onglets des lots de travaux"]';
        const tabs = await page.evaluate((TL) => { const t = [...document.querySelectorAll(TL + ' [role=tab]')].filter(__g7.vis); const s = t.find((x) => x.getAttribute('aria-selected') === 'true') || t[0]; s?.focus(); return { n: t.length, tabindex: t.map((x) => x.tabIndex).join(','), controls: t.filter((x) => x.getAttribute('aria-controls')).length, panneaux: document.querySelectorAll('[role=tabpanel]').length, autres: [...document.querySelectorAll(TL + ' > :not([role=tab])')].length, focus: __g7.desc(document.activeElement) }; }, TL);
        await page.keyboard.press(tabs.focus.includes('01') ? 'ArrowRight' : 'ArrowLeft');
        await attendre(600);
        const apresFleche = await actif(page);
        ok('C128', `Onglets des lots (${tabs.n} onglets) — une flèche déplace le focus vers l'onglet voisin (modèle APG)`, tabs.n >= 2 && apresFleche !== tabs.focus, `avant ${tabs.focus} → après ${apresFleche} ; tabindex ${tabs.tabindex} ; aria-controls ${tabs.controls}/${tabs.n} ; tabpanel ${tabs.panneaux} ; autres enfants du tablist : ${tabs.autres}`);
        // C128 — Alt+Flèche bas dans un champ : raccourci global de changement de lot
        await page.evaluate((TL) => [...document.querySelectorAll(TL + ' [role=tab]')].filter(__g7.vis)[0]?.click(), TL);
        await attendre(700);
        const champ = await page.evaluate(() => { const i = [...document.querySelectorAll('main input[type=number], main select')].find(__g7.vis); i?.focus(); return i ? __g7.desc(i) : null; });
        const lotAvant = await page.evaluate((TL) => [...document.querySelectorAll(TL + ' [role=tab]')].findIndex((x) => x.getAttribute('aria-selected') === 'true'), TL);
        await page.keyboard.down('Alt'); await page.keyboard.press('ArrowDown'); await page.keyboard.up('Alt');
        await attendre(900);
        const altBas = await page.evaluate((TL) => ({ d: __g7.desc(document.activeElement), lot: [...document.querySelectorAll(TL + ' [role=tab]')].findIndex((x) => x.getAttribute('aria-selected') === 'true') }), TL);
        ok('C128', `Alt+Flèche bas dans ${champ} : le focus reste dans le champ`, champ && altBas.d !== 'BODY', `focus après : ${altBas.d} ; lot actif ${lotAvant} → ${altBas.lot}`);
        // C130 — réordonner les lots sans glisser : menu « Options du lot »
        const ordre = () => page.evaluate((TL) => [...document.querySelectorAll(TL + ' [role=tab]')].map((t) => t.innerText.replace(/\s+/g, ' ').trim().slice(0, 24)).join(' | '), TL);
        await page.evaluate((TL) => [...document.querySelectorAll(TL + ' [role=tab]')].filter(__g7.vis)[0]?.click(), TL);
        await attendre(700);
        const ordreAvant = await ordre();
        const chevrons = await page.evaluate(() => [...document.querySelectorAll('button[aria-label="Descendre le lot"],button[aria-label="Monter le lot"]')].map((b) => getComputedStyle(b.parentElement).display).join(','));
        await page.evaluate(() => [...document.querySelectorAll('button[aria-label="Options du lot"]')].find(__g7.vis)?.focus());
        await page.keyboard.press('Enter');
        await attendre(600);
        const desc = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Descendre le lot' && __g7.vis(x)); b?.focus(); return b ? __g7.desc(b) : null; });
        if (desc) { await page.keyboard.press('Enter'); await attendre(800); }
        const ordreApres = await ordre();
        ok('C130', `Réordonner les lots sans glisser-déposer : « Options du lot » → « Descendre le lot » au clavier`, Boolean(desc) && ordreAvant !== ordreApres, `${ordreAvant} → ${ordreApres} ; flèches de la liste des lots : display ${chevrons || '∅'} (survol seulement)`);
        // C128 — Option/Alt + ← dans le champ « Désignation Ouvrage » de l'inspecteur (2 ouvrages)
        await page.evaluate((TL) => [...document.querySelectorAll(TL + ' [role=tab]')].find((t) => /Travaux/.test(t.innerText))?.click(), TL);
        await attendre(700);
        await page.evaluate(() => { const i = document.querySelector('input[aria-label="Rechercher un ouvrage à ajouter"]'); i?.focus(); i?.select?.(); });
        await page.keyboard.type('carrelage', { delay: 40 });
        await attendre(700);
        await page.keyboard.press('Enter');
        await attendre(1500);
        // Référence : même combinaison dans un champ sans raccourci (recherche globale)
        await page.focus('input[aria-label="Recherche globale dans ikadevis"]');
        await page.keyboard.type('mot autre', { delay: 30 });
        await page.keyboard.down('Alt'); await page.keyboard.press('ArrowLeft'); await page.keyboard.up('Alt');
        const caretRef = await page.evaluate(() => document.activeElement.selectionStart);
        await page.keyboard.press('Escape');
        await page.evaluate(() => { const i = document.querySelector('input[aria-label="Recherche globale dans ikadevis"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); });
        await attendre(400);
        const avantAlt = await page.evaluate(() => { const c = [...document.querySelectorAll('input[aria-label="Désignation Ouvrage"]')].find(__g7.vis); if (!c) return null; c.focus(); c.setSelectionRange(c.value.length, c.value.length); return { pos: c.selectionStart, ouvrage: (document.querySelector('main').innerText.match(/Ouvrage #(\d+)/) || [])[1], d: __g7.desc(c), v: c.value.slice(0, 30) }; });
        if (avantAlt) {
            await page.keyboard.down('Alt'); await page.keyboard.press('ArrowLeft'); await page.keyboard.up('Alt');
            await attendre(700);
            const apresAlt = await page.evaluate(() => ({ pos: document.activeElement.selectionStart ?? null, ouvrage: (document.querySelector('main').innerText.match(/Ouvrage #(\d+)/) || [])[1], d: __g7.desc(document.activeElement) }));
            ok('C128', `Alt/Option+← dans « Désignation Ouvrage » (inspecteur, ouvrage #${avantAlt.ouvrage}) : édition du texte, pas de changement d'ouvrage`, apresAlt.ouvrage === avantAlt.ouvrage && apresAlt.d === avantAlt.d,
                `ouvrage #${avantAlt.ouvrage} → #${apresAlt.ouvrage} ; focus ${apresAlt.d} ; curseur ${avantAlt.pos} → ${apresAlt.pos} ; référence (recherche globale) : curseur 9 → ${caretRef}`);
        } else ok('C128', `Alt/Option+← dans l'inspecteur — champ « Désignation Ouvrage » introuvable`, false, 'BLOQUÉ');
        await capture(page, 'c128-chiffrage-apres-raccourcis-1440.png');
    } finally {
        ok('Env', `chiffrage — aucune requête externe (${S.externes.length}), aucune erreur page (${S.erreursPage.length})`, S.externes.length === 0 && S.erreursPage.length === 0, S.erreursPage.slice(0, 2).join(' ; '));
        await S.fermer();
    }
}

// Indicateur de focus visible et non masqué (C124), bureau puis mobile.
async function sectionFocus(ok) {
    for (const [nomVp, vp, routes] of [
        ['1440', VP.d1440, ['#dashboard', '#clients', '#devis', '#factures', '#chiffrage', '#settings/entreprise']],
        ['390', VP.m390, ['#dashboard', '#devis', '#chiffrage', '#clients']]
    ]) {
        const S = await ouvrirSession(vp);
        try {
            await entrerDemo(S.page);
            for (const route of routes) {
                await aller(S.page, route);
                if (route === '#chiffrage') {
                    await S.page.focus('input[aria-label="Rechercher un ouvrage à ajouter"]').catch(() => {});
                    await S.page.keyboard.type('peinture', { delay: 30 });
                    await attendre(700);
                    await S.page.keyboard.press('Enter');
                    await attendre(1200);
                    await S.page.keyboard.press('Escape');
                    await attendre(500);
                }
                const r = await parcoursFocus(S.page, { max: nomVp === '1440' ? 70 : 45, prefixe: `c124-${nomVp}-${route.replace(/[#/]/g, '')}` });
                ok('C124', `${nomVp} ${route} — focus visible sur chaque arrêt (${r.arrets} arrêts) : ${r.sansIndicateur.length} sans indicateur perceptible`, r.sansIndicateur.length === 0, r.sansIndicateur.slice(0, 4).join(' ; ') + (r.captures.length ? ` — captures : ${r.captures.join(', ')}` : ''));
                ok('C124', `${nomVp} ${route} — focus jamais entièrement masqué (2.4.11) : ${r.masques.length}`, r.masques.length === 0, r.masques.slice(0, 4).join(' ; ') + (r.partiels.length ? ` ; partiellement masqués : ${r.partiels.slice(0, 3).join(' ; ')}` : ''));
                ok('C132', `${nomVp} ${route} — indicateur de focus contrasté (≥ 3:1 sur un périmètre) : ${r.peuContraste.length} faible(s)`, r.peuContraste.length === 0, r.peuContraste.slice(0, 4).join(' ; '));
            }
        } finally { await S.fermer(); }
    }
}

// Mobile 390 : structure, tabulation, menu en feuille, cibles, orientation.
async function sectionMobile(ok) {
    const S = await ouvrirSession(VP.m390);
    const { page } = S;
    try {
        await entrerDemo(page);
        const scans = {};
        for (const route of ROUTES) {
            await aller(page, route);
            scans[route] = await page.evaluate(releverEcran);
        }
        for (const route of ROUTES) {
            const s = scans[route];
            ok('C126', `390 ${route} — un seul h1, pas de saut, navigations nommées`, s.h1.length === 1 && s.sauts.length === 0 && !s.navs.includes('(sans nom)'), `h1 ${s.h1.join('/') || '∅'} ; sauts ${s.sauts.join(';') || '0'} ; navs ${s.navs.join(' | ')}`);
        }
        const petites = [...new Set(ROUTES.flatMap((r) => scans[r].ciblesPetites.filter((c) => !c.espacementOk).map((c) => `${r} ${c.d} ${c.taille}`)))];
        const hors = petites.filter((p) => !/Options du lot/.test(p));
        ok('C136', `390 — cibles < 24 px sans espacement (hors « Options du lot », UX-P3-02 connu) : ${hors.length}`, hors.length === 0, hors.slice(0, 8).join(' ; '));
        const deb = ROUTES.filter((r) => scans[r].debordement > 0).map((r) => `${r}:${scans[r].debordement}px`);
        ok('C135', `390 — aucun défilement horizontal de page (11 écrans)`, deb.length === 0, deb.join(' ; '));
        // Tabulation sur 4 écrans
        for (const route of ['#dashboard', '#chiffrage', '#devis', '#settings/entreprise']) {
            await aller(page, route);
            const c = await cycleTab(page);
            ok('C123', `390 ${route} — Tab fait le tour sans piège (${c.pas} arrêts / ${c.n})`, c.boucle, c.boucle ? '' : `arrêt : ${c.derniers}`);
        }
        // Menu en feuille : clavier, Échap, geste
        await aller(page, '#dashboard');
        const r = await testerFenetre(page, { nom: 'Menu (feuille mobile)', declencheur: `(() => { const b = document.querySelector('button[aria-label="Ouvrir le menu de navigation"]'); if (!b) return false; b.setAttribute('data-g7-decl', ''); b.focus(); return true; })()` });
        if (r.absent) ok('C123', 'Menu mobile — déclencheur introuvable', false, 'BLOQUÉ');
        else {
            ok('C128', `Menu mobile — ouvert au clavier, nommé « ${r.etat.nomPropre} », focus dedans`, r.etat.ouverte && r.etat.focusDedans, `focus ${r.etat.focus}`);
            ok('C123', `Menu mobile — Tab ×22 reste dans la feuille, Échap la ferme et rend le focus`, r.sorties === 0 && r.apres.restantes === 0 && r.apres.surDecl, `${r.sorties} sortie(s) ; après Échap : ${r.apres.restantes} fenêtre(s), focus ${r.apres.focus}`);
        }
        // Poignée de la feuille : glisser vers le bas au doigt ferme-t-il ?
        await page.evaluate(() => document.querySelector('button[aria-label="Ouvrir le menu de navigation"]')?.click());
        await attendre(900);
        const poignee = await page.evaluate(() => { const d = __g7.dessus(); const h = d && [...d.querySelectorAll('div')].find((x) => x.className.includes('w-10 h-1')); if (!h) return null; const r = h.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
        if (poignee) {
            await page.touchscreen.touchStart(poignee[0], poignee[1]);
            for (let i = 1; i <= 8; i++) await page.touchscreen.touchMove(poignee[0], poignee[1] + i * 40);
            await page.touchscreen.touchEnd();
            await attendre(700);
            const encore = await page.evaluate(() => __g7.dialogues().length);
            ok('C130', `Menu mobile — la poignée affichée suggère un glisser : le geste ferme-t-il la feuille ? (${encore ? 'non' : 'oui'})`, true, `bouton « Fermer le menu » disponible ; poignée ${encore ? 'décorative' : 'fonctionnelle'}`);
            if (encore) {
                // 2.5.2 — appui (pointerdown) sur le fond puis glisser hors du fond et relâcher
                const fondPt = [195, 40];
                await page.mouse.move(fondPt[0], fondPt[1]);
                await page.mouse.down();
                await attendre(150);
                const fermeAuDown = await page.evaluate(() => __g7.dialogues().length === 0);
                await page.mouse.move(195, 700);
                await page.mouse.up();
                await attendre(500);
                ok('C140', `Menu mobile — appui sur le fond : fermeture seulement au relâchement (2.5.2)`, !fermeAuDown, fermeAuDown ? 'fermé dès l\'appui (mousedown), impossible d\'annuler en glissant hors du fond' : '');
            }
        }
        // Orientation paysage (1.3.4)
        await page.setViewport(VP.paysage);
        await attendre(800);
        await aller(page, '#devis');
        const pays = await page.evaluate(() => ({ deb: document.documentElement.scrollWidth - document.documentElement.clientWidth, h1: document.querySelector('main h1')?.innerText, mainH: Math.round(document.getElementById('main-content')?.getBoundingClientRect().height || 0), lock: (screen.orientation && screen.orientation.type) || '' }));
        const preuve = await capture(page, 'c140-paysage-844x390-devis.png');
        ok('C140', `Paysage 844×390 : l'application s'affiche et s'utilise (1.3.4) — h1 « ${pays.h1} », zone principale ${pays.mainH}px`, Boolean(pays.h1) && pays.deb <= 0, `${preuve} ; manifeste orientation=any`);
    } finally {
        ok('Env', `mobile — aucune requête externe (${S.externes.length}), aucune erreur page (${S.erreursPage.length})`, S.externes.length === 0 && S.erreursPage.length === 0, S.erreursPage.slice(0, 2).join(' ; '));
        await S.fermer();
    }
}

// Signature (geste de tracé) : précision souris/doigt ; validation sans tracé.
async function sectionSignature(ok) {
    for (const [nomVp, vp] of [['1440', VP.d1440], ['390', VP.m390]]) {
        const S = await ouvrirSession(vp);
        const { page } = S;
        try {
            await entrerDemo(page);
            await aller(page, '#devis/101');
            await attendre(800);
            let ouvert = await page.evaluate(() => { const b = [...document.querySelectorAll('button[aria-label="Signer le devis"]')].find(__g7.vis); b?.click(); return Boolean(b); });
            if (!ouvert) {
                await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Plus d.actions sur le devis/.test(b.getAttribute('aria-label') || '') && __g7.vis(b))?.click());
                await attendre(600);
                ouvert = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Signer le devis/.test(x.innerText) && __g7.vis(x)); b?.click(); return Boolean(b); });
            }
            await attendre(1000);
            const info = await page.evaluate(() => { const c = [...document.querySelectorAll('canvas')].find(__g7.vis); if (!c) return null; const r = c.getBoundingClientRect(); return { r: [r.x, r.y, r.width, r.height], cw: c.width, ch: c.height, nom: c.getAttribute('aria-label') || c.getAttribute('role') || '∅' }; });
            if (!info) { ok('C130', `${nomVp} — fenêtre de signature introuvable`, false, 'BLOQUÉ'); continue; }
            const [x, y, w, h] = info.r;
            const yc = y + h / 2, x0 = x + w * 0.2, x1 = x + w * 0.8;
            if (vp.hasTouch) {
                await page.touchscreen.touchStart(x0, yc);
                for (let i = 1; i <= 12; i++) await page.touchscreen.touchMove(x0 + (x1 - x0) * i / 12, yc);
                await page.touchscreen.touchEnd();
            } else {
                await page.mouse.move(x0, yc); await page.mouse.down();
                for (let i = 1; i <= 12; i++) await page.mouse.move(x0 + (x1 - x0) * i / 12, yc);
                await page.mouse.up();
            }
            await attendre(400);
            const trait = await page.evaluate(() => {
                const c = [...document.querySelectorAll('canvas')].find(__g7.vis);
                const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
                let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1, n = 0;
                for (let yy = 0; yy < c.height; yy++) for (let xx = 0; xx < c.width; xx++) if (d[(yy * c.width + xx) * 4 + 3] > 50) { n++; minx = Math.min(minx, xx); maxx = Math.max(maxx, xx); miny = Math.min(miny, yy); maxy = Math.max(maxy, yy); }
                const r = c.getBoundingClientRect(); const sx = r.width / c.width, sy = r.height / c.height;
                return { n, css: n ? [r.x + minx * sx, r.x + maxx * sx, r.y + ((miny + maxy) / 2) * sy] : null };
            });
            const preuve = await capture(page, `c130-signature-${nomVp}.png`, { x: Math.max(0, x - 10), y: Math.max(0, y - 10), width: Math.min(vp.width - Math.max(0, x - 10), w + 20), height: h + 20 });
            const ecart = trait.css ? Math.max(Math.abs(trait.css[0] - x0), Math.abs(trait.css[1] - x1), Math.abs(trait.css[2] - yc)) : 999;
            ok('C130', `${nomVp} — le trait de signature suit le ${vp.hasTouch ? 'doigt' : 'pointeur'} (écart max ${Math.round(ecart)} px)`, trait.n > 0 && ecart <= 6,
                `geste x ${Math.round(x0)}→${Math.round(x1)}, y ${Math.round(yc)} ; trait dessiné x ${trait.css ? Math.round(trait.css[0]) + '→' + Math.round(trait.css[1]) + ', y ' + Math.round(trait.css[2]) : 'aucun'} ; toile ${info.cw}×${info.ch} affichée ${Math.round(w)}×${Math.round(h)} ; ${preuve}`);
            if (nomVp === '1440') {
                // « Effacer » puis valider sans tracé
                await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Effacer/.test(b.innerText) && __g7.vis(b))?.click());
                await attendre(300);
                const btn = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Valider & Signer/.test(x.innerText) && __g7.vis(x)); return b ? { disabled: b.disabled } : null; });
                if (btn && !btn.disabled) {
                    await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Valider & Signer/.test(x.innerText) && __g7.vis(x))?.focus());
                    await page.keyboard.press('Enter');
                    await attendre(1200);
                }
                const signe = await page.evaluate(() => ({ dlg: __g7.dialogues().map((d) => __g7.nom(d).slice(0, 30)), txt: (document.querySelector('main')?.innerText.match(/Sign[ée][^\n]{0,60}/g) || []).slice(0, 3) }));
                ok('C130', `« Valider & Signer » sans aucun tracé (toile effacée) : refusé ou signalé`, btn ? btn.disabled : false, `bouton ${btn ? (btn.disabled ? 'désactivé' : 'actif') : 'absent'} ; après validation : ${signe.txt.join(' | ') || 'aucune mention'}`);
            }
        } finally { await S.fermer(); }
    }
}

// Reflow (1.4.10) et adaptation : 320, 360, 768, 1024, et 320×256 (400 %).
async function sectionReflow(ok) {
    for (const [nomVp, vp] of [['320×568', VP.m320], ['360×740', VP.m360], ['768×1024', VP.t768], ['1024×768', VP.d1024], ['320×256 (400 %)', VP.z400]]) {
        const S = await ouvrirSession(vp);
        try {
            await entrerDemo(S.page);
            const debs = [], sortants = [], petits = [];
            for (const route of ROUTES) {
                await aller(S.page, route);
                const s = await S.page.evaluate(releverEcran);
                if (s.debordement > 0) debs.push(`${route}:${s.debordement}px`);
                if (s.sortants.length) sortants.push(`${route}: ${s.sortants.slice(0, 2).join(', ')}`);
                if (nomVp.startsWith('320×256')) petits.push(`${route}:${s.hauteurMainVisible}px`);
                if (nomVp.startsWith('320×256') && route === '#chiffrage') await capture(S.page, 'c135-zoom400-320x256-chiffrage.png');
                if (nomVp.startsWith('320×256') && route === '#devis') await capture(S.page, 'c135-zoom400-320x256-devis.png');
            }
            ok('C135', `${nomVp} — pas de défilement horizontal de page`, debs.length === 0, debs.join(' ; '));
            ok('C135', `${nomVp} — aucun contenu coupé hors de l'écran (hors zones à défilement propre)`, sortants.length === 0, sortants.slice(0, 4).join(' ; '));
            if (nomVp.startsWith('320×256')) {
                const min = Math.min(...petits.map((p) => +p.split(':')[1].replace('px', '')));
                ok('C135', `${nomVp} — hauteur utile de la zone de contenu ≥ 120 px sur chaque écran (min ${min}px)`, min >= 120, petits.join(' ; '));
            }
        } finally { await S.fermer(); }
    }
}

// Espacement du texte (1.4.12) et zoom 200 % (1.4.4).
async function sectionEspacement(ok) {
    const ESPACEMENT = '*{line-height:1.5 !important;letter-spacing:0.12em !important;word-spacing:0.16em !important}p{margin-bottom:2em !important}';
    const coupes = () => {
        const g = window.__g7;
        const res = [];
        for (const el of document.querySelectorAll('main *, header *, nav *, [role=dialog] *')) {
            if (!g.vis(el) || !el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
            const cs = getComputedStyle(el);
            const coupeX = el.scrollWidth > el.clientWidth + 1 && /(hidden|clip)/.test(cs.overflowX + cs.overflow);
            const coupeY = el.scrollHeight > el.clientHeight + 2 && /(hidden|clip)/.test(cs.overflowY + cs.overflow);
            if (coupeX || coupeY) res.push(`${el.tagName.toLowerCase()} « ${el.textContent.trim().slice(0, 30)} »${el.title ? ' (title)' : ''}`);
        }
        return res;
    };
    for (const [nomVp, vp] of [['1440', VP.d1440], ['390', VP.m390]]) {
        const S = await ouvrirSession(vp);
        try {
            await entrerDemo(S.page);
            const nouveaux = [], fonctions = [];
            for (const route of ['#dashboard', '#chiffrage', '#devis', '#factures', '#clients', '#settings/entreprise']) {
                await aller(S.page, route);
                const avant = new Set(await S.page.evaluate(coupes));
                const tag = await S.page.addStyleTag({ content: ESPACEMENT });
                await attendre(400);
                const apres = await S.page.evaluate(coupes);
                const neufs = apres.filter((x) => !avant.has(x));
                if (neufs.length) nouveaux.push(`${route} (${neufs.length}) : ${neufs.slice(0, 3).join(', ')}`);
                // Les boutons principaux restent cliquables (rien ne les recouvre)
                const bloques = await S.page.evaluate(() => [...document.querySelectorAll('main button, header button')].filter(__g7.vis).filter((b) => { const r = b.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) return false; const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e && !b.contains(e) && !e.contains(b); }).map((b) => __g7.desc(b)).slice(0, 4));
                if (bloques.length) fonctions.push(`${route}: ${bloques.join(', ')}`);
                if (route === '#chiffrage' || route === '#dashboard') await capture(S.page, `c134-espacement-${nomVp}-${route.replace(/[#/]/g, '')}.png`);
                await S.page.evaluate((el) => el.remove(), tag);
                await attendre(200);
            }
            ok('C134', `${nomVp} — espacement du texte WCAG 1.4.12 : aucun texte nouvellement coupé (6 écrans)`, nouveaux.length === 0, nouveaux.slice(0, 4).join(' ; '));
            ok('C134', `${nomVp} — espacement du texte : boutons visibles toujours cliquables (non recouverts)`, fonctions.length === 0, fonctions.slice(0, 4).join(' ; '));
        } finally { await S.fermer(); }
    }
    // Zoom 200 % (équivalent 720×450) : contenu et fonctions disponibles
    const S = await ouvrirSession(VP.z200);
    try {
        await entrerDemo(S.page);
        const pb = [];
        for (const route of ROUTES) {
            await aller(S.page, route);
            const s = await S.page.evaluate(releverEcran);
            const nav = await S.page.evaluate(() => Boolean([...document.querySelectorAll('nav button, button[aria-label*="menu" i]')].find(__g7.vis)));
            if (s.debordement > 0 || !s.h1.length || !nav) pb.push(`${route}: débordement ${s.debordement}px, h1 ${s.h1.length}, navigation ${nav ? 'oui' : 'non'}`);
        }
        await capture(S.page, 'c134-zoom200-720x450-parametres.png');
        ok('C134', `Zoom 200 % (1440×900 → 720×450) : 11 écrans lisibles, navigation atteignable, sans défilement horizontal`, pb.length === 0, pb.join(' ; '));
        // Taille de police par défaut du navigateur (texte seul) : l'interface suit-elle ?
        const cdp = await S.page.target().createCDPSession();
        await aller(S.page, '#devis');
        const avant = await S.page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('main h1')).fontSize) + '/' + parseFloat(getComputedStyle([...document.querySelectorAll('main td, main p')].find(__g7.vis)).fontSize));
        await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 26 } });
        await attendre(600);
        const apres = await S.page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('main h1')).fontSize) + '/' + parseFloat(getComputedStyle([...document.querySelectorAll('main td, main p')].find(__g7.vis)).fontSize));
        ok('C134', `Préférence « taille de police » du navigateur (16 → 32 px) : le texte suit (titre/corps ${avant} → ${apres} px)`, avant !== apres, 'agrandissement du texte seul, indépendant du zoom');
    } finally { await S.fermer(); }
}

// Mouvement : réduction des animations, indicateurs clignotants.
async function sectionMouvement(ok) {
    const S = await ouvrirSession(VP.d1440, { reduit: true });
    const { page } = S;
    try {
        await entrerDemo(page);
        await aller(page, '#chiffrage');
        await page.focus('input[aria-label="Rechercher un ouvrage à ajouter"]').catch(() => {});
        await page.keyboard.type('peinture', { delay: 30 });
        await attendre(700);
        await page.keyboard.press('Enter');
        await attendre(1200);
        // Un devis en cours, puis un autre écran : indicateur « chiffrage actif »
        await page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Menu principal"] button')].find((b) => /Mes devis/.test(b.innerText))?.click());
        await attendre(6500);
        const repos = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming?.().iterations === Infinity).map((a) => a.effect.target).filter((t) => t && __g7.vis(t))
            .map((t) => `${String(t.className).match(/animate-[\w-]+/)?.[0]} « ${t.title || t.closest('[title]')?.title || ''} » ${Math.round(t.getBoundingClientRect().width)}px`));
        await capture(page, 'c138-indicateur-chiffrage-actif.png', { x: 0, y: 0, width: 1440, height: 200 });
        ok('C138', `Réduction des animations activée, 6,5 s après l'arrivée sur « Mes devis » : animations infinies visibles = ${repos.length}`, repos.length === 0, repos.join(' ; '));
        // Animations pendant une navigation sous « reduce »
        await page.evaluate(() => { window.__g7anims = new Set(); window.__g7t = setInterval(() => { for (const a of document.getAnimations()) if (a.playState === 'running') window.__g7anims.add(String(a.effect?.target?.className).match(/animate-[\w-]+|fa-spin/)?.[0] || a.animationName || 'transition'); }, 30); });
        await page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Menu principal"] button')].find((b) => /Factures/.test(b.innerText))?.click());
        await attendre(1200);
        const nav = await page.evaluate(() => { clearInterval(window.__g7t); return [...window.__g7anims]; });
        ok('C138', `Réduction des animations : animations jouées pendant un changement d'écran = ${nav.filter((n) => !/spin|progress/.test(n)).length} décoratives`, nav.filter((n) => !/spin|progress/.test(n)).length === 0, `observées : ${nav.join(', ') || 'aucune'} (sablier et barre de progression tolérés : porteurs d'information)`);
        // Clignotements : aucune animation de plus de 3 éclats/s
        const rapides = await page.evaluate(() => document.getAnimations().filter((a) => { const d = a.effect?.getTiming?.().duration; return typeof d === 'number' && d > 0 && d < 333 && a.effect.getTiming().iterations === Infinity; }).length);
        ok('C138', `Aucune animation infinie de période < 333 ms (seuil des 3 flashs/s) : ${rapides}`, rapides === 0, '');
    } finally { await S.fermer(); }
}

const SECTIONS = { bureau: sectionBureau, fenetres: sectionFenetres, chiffrage: sectionChiffrage, focus: sectionFocus, mobile: sectionMobile, signature: sectionSignature, reflow: sectionReflow, espacement: sectionEspacement, mouvement: sectionMouvement };

export async function run(choix = Object.keys(SECTIONS)) {
    const results = [];
    const ok = (id, label, pass, detail = '') => results.push({ label: `${id} · ${label}`, pass: Boolean(pass), detail });
    for (const nom of choix) {
        const f = SECTIONS[nom];
        if (!f) continue;
        try { await f(ok); } catch (e) {
            if (/timeout|Timeout|délai|Target closed|Protocol error/.test(String(e))) {
                try { await f(ok); continue; } catch (e2) { ok('Env', `section « ${nom} » interrompue`, false, String(e2).slice(0, 300)); continue; }
            }
            ok('Env', `section « ${nom} » interrompue`, false, String(e).slice(0, 300));
        }
    }
    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const choix = process.argv.slice(2);
    const results = await run(choix.length ? choix : undefined);
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    process.exit(results.every((r) => r.pass) ? 0 : 1);
}
