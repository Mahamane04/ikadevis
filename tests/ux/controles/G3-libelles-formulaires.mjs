#!/usr/bin/env node
// Audit UX 220 contrôles (2026-10) — groupe G3 « libellés et formulaires ».
//
// Contrôles couverts : C041 C042 C045 C046 C048 C049 C050 C053 C057 C058 C059.
//
// Environnement isolé : serveur statique local (scratch/lib/server.mjs) qui sert
// config.example.js (URL Supabase factice) ; TOUTE requête hors 127.0.0.1 est
// bloquée et comptée. Mode Démo uniquement (« Essayer sans compte »), données
// fictives, stockage local vidé avant chaque parcours. Aucune écriture ailleurs.
//
// La sonde manipule l'interface comme un utilisateur : clics souris par
// coordonnées (le recouvrement compte), vraies touches clavier (Tab, Échap,
// Cmd/Ctrl+Z, saisie caractère par caractère), survol réel. Elle MESURE les
// styles calculés, les rectangles et le stockage — elle ne lit pas le code.
//
//   node tests/ux/controles/G3-libelles-formulaires.mjs
//
// Sortie : une ligne par cas ([Cxxx] libellé — détail), captures dans
// docs/audit-ux-220/UX_EVIDENCE/G3-libelles-formulaires/.
import puppeteer from 'puppeteer';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from '../../../scratch/lib/server.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '../../..');
const PREUVES = path.join(RACINE, 'docs/audit-ux-220/UX_EVIDENCE/G3-libelles-formulaires');
const CONFIG = await readFile(new URL('../../../config.example.js', import.meta.url), 'utf8');
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

const VP = {
    d1440: { width: 1440, height: 900 },
    t1024: { width: 1024, height: 768 },
    t768: { width: 768, height: 1024, isMobile: true, hasTouch: true },
    m390: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    m360: { width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    m320: { width: 320, height: 640, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
};

// ─── Collecte des résultats ────────────────────────────────────────────────
const resultats = [];
const mesures = {};
function cas(ctrl, label, pass, detail = '') {
    resultats.push({ label: `[${ctrl}] ${label}`, pass: Boolean(pass), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
}
function nonExecute(ctrl, label, raison) {
    resultats.push({ label: `[${ctrl}] ${label}`, pass: false, detail: `NON EXÉCUTÉ — ${raison}` });
}
const noter = (cle, valeur) => { mesures[cle] = valeur; };

// ─── Navigateur ────────────────────────────────────────────────────────────
let URL_BASE = '';
const externesBloquees = [];
const erreursPage = [];

async function nouvellePage(browser, vp) {
    const page = await browser.newPage();
    await page.setViewport(vp);
    page.setDefaultTimeout(30000);
    await page.setRequestInterception(true);
    page.on('request', (r) => {
        const u = new URL(r.url());
        if (u.pathname === '/config.js') return r.respond({ contentType: 'application/javascript', body: CONFIG });
        if (/^https?:$/.test(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname)) {
            externesBloquees.push(u.hostname);
            return r.abort();
        }
        r.continue();
    });
    page.on('pageerror', (e) => erreursPage.push(String(e).slice(0, 200)));
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    return page;
}

async function entrerDemo(page) {
    await page.goto(URL_BASE + '/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* rien */ } });
    await page.reload({ waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').trim() === 'Essayer sans compte'), { timeout: 30000 });
    await cliquer(page, /^Essayer sans compte$/);
    await attendre(2500);
    await page.waitForFunction(() => !!document.querySelector('h1'), { timeout: 30000 });
}

// Une seule nouvelle tentative si un délai expire (machine chargée).
async function avecReprise(nom, fn) {
    try { return await fn(); } catch (e) {
        console.log(`  … reprise de « ${nom} » après : ${String(e.message || e).slice(0, 120)}`);
        await attendre(1500);
        return fn();
    }
}

async function ouvrirDemo(browser, vp) {
    return avecReprise('entrée en démo', async () => {
        const page = await nouvellePage(browser, vp);
        try { await entrerDemo(page); } catch (e) { await page.close().catch(() => {}); throw e; }
        return page;
    });
}

// Navigation par l'adresse. On repasse par une adresse neutre : l'écran peut
// ne pas avoir mis l'adresse à jour (UX-P2-06), et réaffecter la même valeur
// ne déclencherait aucun changement.
async function aller(page, hash) {
    await page.evaluate((h) => { window.location.hash = '#_g3'; window.location.hash = h; }, hash);
    await attendre(1400);
}

// Recherche d'un élément visible par texte visible ou nom accessible, puis vrai
// clic souris à ses coordonnées.
async function trouver(page, motif, { sel = 'button, a[href], [role="button"], [role="tab"], [role="option"], [role="menuitem"], [role="radio"], summary, tbody tr', racine = 'body', dernier = false, parAria = true } = {}) {
    return page.evaluate((src, flags, sel, racine, dernier, parAria) => {
        const re = new RegExp(src, flags);
        const base = document.querySelector(racine) || document.body;
        const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
        const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
        const liste = [...base.querySelectorAll(sel)].filter(vis)
            .filter((el) => re.test(norm(el.innerText)) || (parAria && re.test(norm(el.getAttribute('aria-label')))));
        const el = dernier ? liste[liste.length - 1] : liste[0];
        if (!el) return null;
        document.querySelectorAll('[data-g3-cible]').forEach((x) => x.removeAttribute('data-g3-cible'));
        el.setAttribute('data-g3-cible', '1');
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, texte: norm(el.innerText).slice(0, 90), aria: el.getAttribute('aria-label'), title: el.getAttribute('title') };
    }, motif.source, motif.flags, sel, racine, dernier, parAria);
}
// Avant le clic : la cible est-elle vraiment sous le pointeur ? Si un autre
// élément la recouvre (notification, bandeau), on le consigne et on attend
// qu'il disparaisse (4 s au plus) — c'est ce que ferait l'utilisateur.
const recouvrements = [];
async function attendreDecouverte(page, x, y, quoi) {
    for (let i = 0; i < 8; i += 1) {
        const dessus = await page.evaluate((x, y) => {
            const el = document.elementFromPoint(x, y);
            const cible = document.querySelector('[data-g3-cible]');
            if (!el || !cible || cible === el || cible.contains(el)) return null;
            return `${el.tagName.toLowerCase()} « ${(el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60)} »`;
        }, x, y);
        if (!dessus) return;
        if (i === 0) recouvrements.push(`${quoi} recouvert par ${dessus}`);
        await attendre(500);
    }
}
async function cliquer(page, motif, opts = {}) {
    const c = await trouver(page, motif, opts);
    if (!c) throw new Error(`Introuvable : ${motif}`);
    await attendreDecouverte(page, c.x, c.y, String(motif));
    await page.mouse.click(c.x, c.y);
    return c;
}
async function cliquerSel(page, css) {
    const c = await page.evaluate((s) => {
        const el = [...document.querySelectorAll(s)].find((x) => x.getBoundingClientRect().width > 0);
        if (!el) return null;
        document.querySelectorAll('[data-g3-cible]').forEach((x) => x.removeAttribute('data-g3-cible'));
        el.setAttribute('data-g3-cible', '1');
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, css);
    if (!c) throw new Error(`Introuvable : ${css}`);
    await attendreDecouverte(page, c.x, c.y, css);
    await page.mouse.click(c.x, c.y);
}
// Saisie réelle : clic dans le champ, on le vide (setter natif + « input »,
// seul moyen fiable pour un <input type=number>), puis frappe au clavier.
async function taper(page, css, texte, { vider = true } = {}) {
    await cliquerSel(page, css);
    if (vider) {
        await page.$eval(css, (n) => {
            const proto = n.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(proto, 'value').set.call(n, '');
            n.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }
    await page.keyboard.type(texte, { delay: 12 });
    await attendre(120);
}
const valeur = (page, css) => page.$eval(css, (n) => n.value).catch(() => null);
async function choisirOption(page, ariaLabel, libelle) {
    await cliquerSel(page, `button[aria-label="${ariaLabel}"][aria-haspopup="listbox"]`);
    await attendre(350);
    await cliquer(page, new RegExp(`^${libelle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), { sel: '[role="option"]', parAria: false });
    await attendre(350);
}
async function capture(page, nom) {
    await page.screenshot({ path: path.join(PREUVES, `${nom}.png`) }).catch(() => {});
}
const dialogueVisible = (page) => page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const d = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter(vis).pop();
    if (!d) return null;
    const lb = d.getAttribute('aria-labelledby');
    return (d.getAttribute('aria-label') || (lb && document.getElementById(lb)?.innerText) || d.querySelector('h2,h3')?.innerText || '').replace(/\s+/g, ' ').trim();
});

// ─── Mesures exécutées DANS la page ────────────────────────────────────────
function releverEcran() {
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
    const parse = (s) => { const m = (s || '').match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
    const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
    const fond = (el) => { let e = el; while (e) { const bg = parse(getComputedStyle(e).backgroundColor); if (bg && bg[3] > 0.9) return bg.slice(0, 3); e = e.parentElement; } return [255, 255, 255]; };
    const opaciteEffective = (el) => { let o = 1, e = el; while (e && e !== document.body) { o *= Number(getComputedStyle(e).opacity); e = e.parentElement; } return o; };
    const INTER = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="radio"], summary';
    const titres = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(vis).map((h) => ({ niveau: +h.tagName[1], texte: norm(h.innerText).slice(0, 60), taille: parseFloat(getComputedStyle(h).fontSize), graisse: getComputedStyle(h).fontWeight }));
    const actions = [...document.querySelectorAll(INTER)].filter(vis).map((el) => ({ texte: norm(el.innerText).slice(0, 80), aria: norm(el.getAttribute('aria-label')), title: el.getAttribute('title') || '' }));
    const masquees = [...document.querySelectorAll(INTER)].filter((el) => {
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.display !== 'none' && (opaciteEffective(el) < 0.15 || cs.visibility === 'hidden') && !el.closest('[aria-hidden="true"]') && !el.closest('[inert]');
    }).map((el) => norm(el.innerText || el.getAttribute('aria-label')).slice(0, 60));
    const primaires = [...document.querySelectorAll('.btn-primary')].filter(vis).map((b) => {
        const cs = getComputedStyle(b); const fg = parse(cs.color); const bg = parse(cs.backgroundColor);
        return { texte: norm(b.innerText || b.getAttribute('aria-label')).slice(0, 50), fond: cs.backgroundColor, couleur: cs.color, rayon: cs.borderTopLeftRadius, taille: cs.fontSize, graisse: cs.fontWeight, hauteur: Math.round(b.getBoundingClientRect().height), contraste: fg && bg && bg[3] > 0.5 ? +ratio(fg.slice(0, 3), bg.slice(0, 3)).toFixed(2) : null };
    });
    const pastilles = [...document.querySelectorAll('span')].filter(vis).filter((s) => s.children.length === 0 && /rounded-full/.test(String(s.className)) && /\bbg-/.test(String(s.className)) && norm(s.innerText).length >= 3 && norm(s.innerText).length <= 32 && !/^\d/.test(norm(s.innerText))).map((s) => {
        const cs = getComputedStyle(s);
        return { texte: norm(s.innerText), fond: cs.backgroundColor, couleur: cs.color, taille: cs.fontSize, casse: cs.textTransform, bordure: cs.borderTopWidth !== '0px' ? cs.borderTopColor : 'aucune' };
    });
    const selections = [...document.querySelectorAll('[aria-pressed], [role="tab"][aria-selected], [role="radio"][aria-checked]')].filter(vis).map((el) => {
        const cs = getComputedStyle(el);
        return { texte: norm(el.innerText).slice(0, 40), role: el.getAttribute('role') || (el.hasAttribute('aria-pressed') ? 'bouton-bascule' : ''), choisi: (el.getAttribute('aria-pressed') ?? el.getAttribute('aria-selected') ?? el.getAttribute('aria-checked')) === 'true', fond: cs.backgroundColor, couleur: cs.color, bordure: cs.borderTopColor };
    });
    const champs = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=search]), select, textarea, button[aria-haspopup="listbox"]')].filter(vis).length;
    return {
        h1: norm(document.querySelector('h1')?.innerText || ''),
        nbH1: [...document.querySelectorAll('h1')].filter(vis).length,
        hash: location.hash, titres, actions, masquees, primaires, pastilles, selections, champs,
        debordement: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
}

// Champs d'un formulaire (ou d'une racine) : libellé, type, exemple, aide.
function releverChamps(racineSel) {
    const racine = racineSel ? document.querySelector(racineSel) : document.body;
    if (!racine) return null;
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
    const libelle = (el) => {
        if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) return norm(l.innerText); }
        const l = el.closest('label'); if (l) return norm(l.innerText);
        const al = el.getAttribute('aria-label'); if (al) return norm(al);
        const parent = el.closest('div'); const lab = parent && parent.querySelector('label'); return lab ? norm(lab.innerText) : '';
    };
    const aide = (el) => {
        const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
        const d = ids.map((i) => document.getElementById(i)?.innerText || '').join(' ');
        if (norm(d)) return norm(d);
        // texte d'aide placé juste après le champ, dans le même bloc
        let n = el.nextElementSibling;
        while (n && !/^(P|SPAN|SMALL)$/.test(n.tagName)) n = n.nextElementSibling;
        return n && vis(n) ? norm(n.innerText).slice(0, 120) : '';
    };
    const els = [...racine.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea')].filter(vis)
        .filter((el) => el.type !== 'search' && !/Rechercher/i.test(el.placeholder || ''));
    return els.map((el) => ({ id: el.id || '', libelle: libelle(el).slice(0, 80), type: el.type || el.tagName.toLowerCase(), exemple: el.placeholder || '', aide: aide(el), valeur: el.value || '' }));
}

// Structure d'un formulaire long : champs, titres de groupe et plus longue
// suite de champs sans titre intermédiaire.
function structureFormulaire(racineSel) {
    const racine = document.querySelector(racineSel);
    if (!racine) return null;
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
    const CHAMP = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea, button[aria-haspopup="listbox"], [role="radiogroup"]';
    const TITRE = 'h2, h3, h4, h5, legend, [data-groupe-titre]';
    const noeuds = [...racine.querySelectorAll(`${CHAMP}, ${TITRE}`)].filter(vis).filter((el) => !(el.matches(CHAMP) && el.closest('[role="radiogroup"]') && !el.matches('[role="radiogroup"]')));
    let suite = 0, max = 0; const titres = []; let nbChamps = 0;
    for (const n of noeuds) {
        if (n.matches(TITRE)) { titres.push(`${n.tagName.toLowerCase()}:${norm(n.innerText).slice(0, 50)}`); suite = 0; }
        else { nbChamps += 1; suite += 1; max = Math.max(max, suite); }
    }
    return { nbChamps, titres, plusLongueSuiteSansTitre: max, fieldsets: racine.querySelectorAll('fieldset').length };
}

// Pastilles de statut visibles (texte + couleurs calculées).
function pastillesStatut() {
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('span')].filter(vis).filter((s) => s.children.length === 0 && /rounded-full/.test(String(s.className)) && /\bbg-/.test(String(s.className)))
        .map((s) => { const cs = getComputedStyle(s); return { texte: norm(s.innerText), fond: cs.backgroundColor, couleur: cs.color, taille: cs.fontSize, casse: cs.textTransform }; })
        .filter((p) => p.texte.length >= 3 && p.texte.length <= 32);
}

// Teinte (0-360) d'une couleur rgb(a) — pour comparer des familles de couleur.
function teinte(rgb) {
    const m = String(rgb).match(/([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
    if (!m) return null;
    const [r, g, b] = [+m[1] / 255, +m[2] / 255, +m[3] / 255];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d < 0.02) return 'neutre';
    let h;
    if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h = Math.round(h * 60); if (h < 0) h += 360;
    return h;
}
function saturation(rgb) {
    const m = String(rgb).match(/([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
    if (!m) return 0;
    const [r, g, b] = [+m[1] / 255, +m[2] / 255, +m[3] / 255];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
}
// Famille de couleur d'un TEXTE de pastille (la teinte porteuse de sens) ;
// les gris bleutés (slate, saturation < 0,35) comptent comme neutres.
const famille = (rgb) => {
    const h = teinte(rgb);
    if (h === 'neutre' || h === null || saturation(rgb) < 0.35) return 'neutre';
    if (h < 15 || h >= 330) return 'rouge/rose';
    if (h < 55) return 'ambre/orange';
    if (h < 170) return 'vert';
    if (h < 260) return 'bleu';
    return 'violet';
};

// ════════════════════════════════════════════════════════════════════════════
// BLOC A — Parcours des écrans (C041, C045, C049, C050)
// ════════════════════════════════════════════════════════════════════════════
const ROUTES = ['#dashboard', '#chantiers', '#clients', '#chiffrage', '#devis', '#factures', '#depenses', '#ouvrages', '#materiaux', '#abonnement',
    '#settings/entreprise', '#settings/documents', '#settings/facturation', '#settings/finances'];
const VAGUES = ['ok', 'valider', 'continuer', 'suivant', 'options', 'plus', 'voir', 'cliquez ici', 'ici', 'soumettre', 'nouveau', 'nouvelle', 'appliquer', 'confirmer', 'oui', 'non', 'actions', 'go', 'détails', 'en savoir plus', 'lien'];

async function blocParcours(browser) {
    const releves = {};
    for (const [nomVp, vp] of [['1440', VP.d1440], ['390', VP.m390]]) {
        const page = await ouvrirDemo(browser, vp);
        try {
            for (const route of ROUTES) {
                await aller(page, route);
                const r = await page.evaluate(releverEcran);
                releves[`${nomVp}${route}`] = r;
                if (['#dashboard', '#factures', '#depenses', '#chantiers', '#settings/entreprise', '#settings/facturation'].includes(route)) {
                    await capture(page, `A-${nomVp}-${route.replace(/[#/]/g, '_')}`);
                }
            }
        } finally { await page.close(); }
    }

    // ── C041 : libellés vagues ────────────────────────────────────────────
    const vagues = [];
    for (const [cle, r] of Object.entries(releves)) {
        for (const a of r.actions) {
            const visible = a.texte.toLowerCase();
            if (VAGUES.includes(visible)) vagues.push(`${cle} : « ${a.texte} »${a.aria ? ` (nom accessible « ${a.aria} »)` : ''}`);
        }
    }
    const vaguesUniques = [...new Set(vagues.map((v) => v.replace(/^(1440|390)/, '')))];
    noter('C041.vagues', vaguesUniques);
    const nbActions = Object.values(releves).reduce((s, r) => s + r.actions.length, 0);
    cas('C041', `Libellés d'action vagues sur 14 écrans × 2 largeurs (${nbActions} actions relevées)`, vaguesUniques.length === 0, vaguesUniques.join(' | ') || 'aucun');

    // ── C045 : hiérarchie des titres ──────────────────────────────────────
    const anomaliesTitres = [];
    for (const [cle, r] of Object.entries(releves)) {
        if (r.nbH1 !== 1) anomaliesTitres.push(`${cle} : ${r.nbH1} h1 visibles`);
        for (let i = 1; i < r.titres.length; i += 1) {
            if (r.titres[i].niveau > r.titres[i - 1].niveau + 1) anomaliesTitres.push(`${cle} : saut h${r.titres[i - 1].niveau} « ${r.titres[i - 1].texte} » → h${r.titres[i].niveau} « ${r.titres[i].texte} »`);
        }
        // Un titre de niveau inférieur ne doit pas être plus grand qu'un titre de niveau supérieur.
        for (const a of r.titres) for (const b of r.titres) {
            if (a.niveau < b.niveau && b.taille > a.taille + 0.5) anomaliesTitres.push(`${cle} : h${b.niveau} « ${b.texte} » (${b.taille}px) plus grand que h${a.niveau} « ${a.texte} » (${a.taille}px)`);
        }
    }
    const anomaliesUniques = [...new Set(anomaliesTitres)];
    noter('C045.titres', Object.fromEntries(Object.entries(releves).map(([k, r]) => [k, r.titres.map((t) => `h${t.niveau}(${t.taille}px) ${t.texte}`)])));
    cas('C045', 'Un seul h1 par écran, aucun saut de niveau, taille décroissante avec le niveau (14 écrans × 2 largeurs)', anomaliesUniques.length === 0, anomaliesUniques.slice(0, 14).join(' | ') + (anomaliesUniques.length > 14 ? ` … (+${anomaliesUniques.length - 14})` : ''));

    // ── C049 : bouton principal et pastilles d'un écran à l'autre ─────────
    const signaturesPrimaire = {};
    for (const [cle, r] of Object.entries(releves)) {
        if (!cle.startsWith('1440')) continue;
        for (const p of r.primaires) {
            const sig = `fond ${p.fond} · rayon ${p.rayon}`;
            (signaturesPrimaire[sig] ||= []).push(`${cle.slice(4)} « ${p.texte} »`);
        }
    }
    noter('C049.primaires', signaturesPrimaire);
    cas('C049', `Bouton principal (.btn-primary) : même fond et même rayon sur tous les écrans à 1440 px`, Object.keys(signaturesPrimaire).length <= 1,
        Object.entries(signaturesPrimaire).map(([s, l]) => `${s} → ${[...new Set(l)].slice(0, 4).join(', ')}`).join(' | '));

    const enCours = [];
    for (const [cle, r] of Object.entries(releves)) for (const p of r.pastilles) if (/^en cours$/i.test(p.texte)) enCours.push(`${cle} : ${p.taille} ${p.casse} fond ${p.fond}`);
    const sigEnCours = new Set(enCours.map((e) => e.split(' : ')[1]));
    noter('C049.pastilleEnCours', enCours);
    cas('C049', 'Pastille de statut chantier « En cours » identique entre tableau de bord et liste des chantiers', sigEnCours.size <= 1, [...new Set(enCours)].join(' | '));

    // ── C050 : actions masquées, contraste des boutons principaux ─────────
    const masquees = [];
    for (const [cle, r] of Object.entries(releves)) for (const m of r.masquees) masquees.push(`${cle} : « ${m} »`);
    noter('C050.masquees', masquees);
    cas('C050', 'Aucune action présente mais invisible au repos (opacité < 0,15 ou masquée) — 14 écrans × 2 largeurs', masquees.length === 0, masquees.slice(0, 10).join(' | ') || 'aucune');
    const primairesFaibles = [];
    for (const [cle, r] of Object.entries(releves)) for (const p of r.primaires) if (p.contraste !== null && p.contraste < 4.5) primairesFaibles.push(`${cle} « ${p.texte} » ${p.contraste}:1`);
    cas('C050', 'Texte des boutons principaux lisible sur leur fond (≥ 4,5:1)', primairesFaibles.length === 0, primairesFaibles.join(' | ') || `min ${Math.min(...Object.values(releves).flatMap((r) => r.primaires.map((p) => p.contraste ?? 99)))}:1`);
    return releves;
}

// ════════════════════════════════════════════════════════════════════════════
// BLOC B — Ce que font les libellés de création (C041, C042)
// ════════════════════════════════════════════════════════════════════════════
async function blocCreation(browser) {
    for (const [nomVp, vp] of [['1440', VP.d1440], ['390', VP.m390]]) {
        const page = await ouvrirDemo(browser, vp);
        try {
            await aller(page, '#dashboard');
            const carte = await trouver(page, /^Créer facture/);
            if (!carte) { nonExecute('C041', `${nomVp} px — carte « Créer facture » du tableau de bord`, 'carte absente à cette largeur'); continue; }
            await page.mouse.click(carte.x, carte.y);
            await attendre(1700);
            const apres = await page.evaluate(() => ({
                h1: document.querySelector('h1')?.innerText?.trim(), hash: location.hash,
                champTypeFacture: !!document.querySelector('button[aria-label="Type de facture"]'),
                motAcompteVisible: [...document.querySelectorAll('main *, [role=dialog] *')].some((n) => n.children.length === 0 && /acompte/i.test(n.textContent || '') && n.getBoundingClientRect().width > 0)
            }));
            const dlg = await dialogueVisible(page);
            await capture(page, `B-${nomVp}-creer-facture-acompte`);
            cas('C041', `${nomVp} px — « Créer facture · Facturer un acompte » (tableau de bord) ouvre une création de facture / d'acompte`,
                Boolean(dlg) || apres.champTypeFacture,
                `libellé « ${carte.texte} » → écran « ${apres.h1} », adresse ${apres.hash}, fenêtre : ${dlg || 'aucune'}, choix du type (acompte) : ${apres.champTypeFacture ? 'oui' : 'non'}, mot « acompte » visible : ${apres.motAcompteVisible ? 'oui' : 'non'}`);
        } finally { await page.close(); }
    }

    // Chemins de création de facture et de client à 1440 : libellés comparés.
    const page = await ouvrirDemo(browser, VP.d1440);
    try {
        const chemins = [];
        // 1. Factures › « Nouveau »
        await aller(page, '#factures');
        const nouveau = await cliquer(page, /^Nouveau$/, { parAria: false });
        await attendre(900);
        const choixDevis = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0 && /DEV-2026-001/.test(b.innerText)).map((b) => b.innerText.replace(/\s+/g, ' ').trim())[0] || null);
        let titreFenetre1 = null;
        if (choixDevis) { await cliquer(page, /DEV-2026-001/, { sel: 'button', parAria: false }); await attendre(1300); titreFenetre1 = await dialogueVisible(page); }
        chemins.push(`Factures › bouton « ${nouveau.texte} » (nom accessible « ${nouveau.aria} ») → ${titreFenetre1 ? `fenêtre « ${titreFenetre1} »` : 'aucune fenêtre'}`);
        await capture(page, 'B-1440-factures-nouveau');
        await page.keyboard.press('Escape'); await attendre(700);
        // 2. Devis › fiche › « Convertir en facture »
        await aller(page, '#devis');
        await cliquer(page, /DEV-2026-001/, { sel: 'tbody tr, button', parAria: false });
        await attendre(1500);
        const convertir = await cliquer(page, /^Convertir en facture$/, { parAria: false });
        await attendre(1300);
        const titreFenetre2 = await dialogueVisible(page);
        const typeFacture = await page.evaluate(() => document.querySelector('button[aria-label="Type de facture"]')?.innerText?.trim() || null);
        chemins.push(`Fiche devis › bouton « ${convertir.texte} » (nom accessible « ${convertir.aria} ») → fenêtre « ${titreFenetre2} », type « ${typeFacture} », validation « Créer le brouillon »`);
        await capture(page, 'B-1440-devis-convertir-en-facture');
        noter('C042.cheminsFacture', chemins);
        const libellesFacture = ['Créer facture', nouveau.texte, convertir.texte];
        cas('C042', 'Créer une facture depuis un devis porte le même verbe sur ses trois points d\'entrée (tableau de bord, Factures, fiche devis)',
            new Set(libellesFacture.map((l) => l.toLowerCase())).size === 1, `${libellesFacture.map((l) => `« ${l} »`).join(' / ')} — ${chemins.join(' ; ')}`);
        // « Convertir en facture » : le texte visible doit figurer dans le nom accessible (WCAG 2.5.3).
        cas('C042', 'Le nom accessible de « Convertir en facture » reprend le libellé visible (WCAG 2.5.3)',
            (convertir.aria || '').toLowerCase().includes('convertir en facture'), `visible « ${convertir.texte} » / nom « ${convertir.aria} »`);
        await cliquer(page, /^Annuler$/, { racine: '[role="dialog"]', parAria: false }).catch(() => page.keyboard.press('Escape'));
        await attendre(700);

        // 3. Client : « Ajouter un client » (tableau de bord) vs « Nouveau Client » (Clients)
        await aller(page, '#dashboard');
        const ajouter = await cliquer(page, /^Ajouter un client/, { parAria: false });
        await attendre(900);
        const t1 = await dialogueVisible(page);
        const valider1 = await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button[type=submit]')].filter((b) => b.getBoundingClientRect().width > 0 && b.innerText.trim()).map((b) => b.innerText.trim()).pop());
        await page.keyboard.press('Escape'); await attendre(700);
        await aller(page, '#clients');
        const nouveauClient = await cliquer(page, /^Nouveau Client$/, { parAria: false });
        await attendre(900);
        const t2 = await dialogueVisible(page);
        await page.keyboard.press('Escape'); await attendre(700);
        cas('C042', 'Créer un client : même verbe sur le tableau de bord, la liste et la fenêtre',
            new Set([ajouter.texte.split(' ')[0], nouveauClient.texte.split(' ')[0]]).size === 1,
            `tableau de bord « ${ajouter.texte} » → fenêtre « ${t1} » (validation « ${valider1} ») ; Clients « ${nouveauClient.texte} » → fenêtre « ${t2} »`);
    } finally { await page.close(); }
}

// ════════════════════════════════════════════════════════════════════════════
// BLOC C — « Annuler » : annulation de saisie ou fermeture ? (C042)
// ════════════════════════════════════════════════════════════════════════════
async function blocAnnuler(browser) {
    const page = await ouvrirDemo(browser, VP.d1440);
    try {
        // Référence : le bouton « annuler » de l'éditeur de devis.
        await aller(page, '#chiffrage');
        const undo = await page.evaluate(() => {
            const b = [...document.querySelectorAll('button[aria-label^="Annuler la modification"]')].find((x) => x.getBoundingClientRect().width > 0);
            return b ? { aria: b.getAttribute('aria-label'), title: b.title, texte: b.innerText.trim(), icone: b.querySelector('i')?.className || '' } : null;
        });

        // Fiche « Nouvelle matière » : saisie, puis le raccourci annoncé, puis le bouton.
        await aller(page, '#materiaux');
        const nbAvant = await page.evaluate(() => (document.body.innerText.match(/Matières \((\d+)\)/) || [])[1]);
        await cliquer(page, /^Nouvelle Matière$/, { parAria: false });
        await attendre(1200);
        const champNom = await page.evaluate(() => {
            const i = [...document.querySelectorAll('input[type=text]')].find((x) => x.getBoundingClientRect().width > 0 && /Tube carré/.test(x.placeholder || ''));
            if (!i) return null; i.setAttribute('data-g3-nom', '1'); return true;
        });
        if (!champNom) throw new Error('champ nom de matière introuvable');
        await taper(page, 'input[data-g3-nom]', 'Matière test G3');
        const btnAnnuler = await trouver(page, /^Annuler$/, { sel: 'button', parAria: false, dernier: true });
        // Le titre de la fiche reçoit le clic : le focus quitte le champ texte.
        await cliquer(page, /^Nouvelle matière$/, { sel: 'h2', parAria: false }).catch(() => {});
        await page.keyboard.down('Meta'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Meta');
        await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control');
        await attendre(700);
        const apresRaccourci = { ouverte: await page.evaluate(() => !!document.querySelector('input[data-g3-nom]')), nom: await valeur(page, 'input[data-g3-nom]') };
        await capture(page, 'C-1440-materiere-annuler-raccourci');
        // Coordonnées relues juste avant le clic : le panneau a pu défiler.
        await cliquer(page, /^Annuler$/, { sel: 'button', parAria: false, dernier: true });
        await attendre(900);
        const apresBouton = { ouverte: await page.evaluate(() => !!document.querySelector('input[data-g3-nom]')), nb: await page.evaluate(() => (document.body.innerText.match(/Matières \((\d+)\)/) || [])[1]) };

        // Fenêtre « Nouvel Ouvrage »
        await aller(page, '#ouvrages');
        await cliquer(page, /^Nouvel Ouvrage$/, { parAria: false });
        await attendre(1000);
        const annulerOuvrage = await trouver(page, /^Annuler$/, { sel: '[role="dialog"] button', parAria: false });
        await page.keyboard.press('Escape'); await attendre(600);

        noter('C042.annuler', { undo, btnAnnuler, apresRaccourci, apresBouton, annulerOuvrage, nbAvant });
        cas('C042', '« Annuler » de la fiche matière : son nom accessible et son info-bulle décrivent l\'action réelle (fermer sans enregistrer)',
            !/modification|Cmd\+Z|Ctrl\+Z/i.test(`${btnAnnuler.aria} ${btnAnnuler.title}`),
            `nom « ${btnAnnuler.aria} », info-bulle « ${btnAnnuler.title} » — même nom que le bouton « annuler la dernière modification » de l'éditeur de devis (« ${undo?.aria} », icône ${undo?.icone})`);
        cas('C042', 'Le raccourci annoncé par ce bouton (Cmd/Ctrl+Z) produit la même action que le bouton',
            apresRaccourci.ouverte === apresBouton.ouverte,
            `après Cmd+Z puis Ctrl+Z (focus hors champ) : fiche ${apresRaccourci.ouverte ? 'toujours ouverte' : 'fermée'}, nom « ${apresRaccourci.nom} » ; après clic sur le bouton : fiche ${apresBouton.ouverte ? 'ouverte' : 'fermée'}, matières ${nbAvant} → ${apresBouton.nb}`);
        cas('C042', '« Annuler » de la fenêtre « Nouvel Ouvrage » : nom accessible conforme à l\'action',
            annulerOuvrage && !/modification|Cmd\+Z/i.test(`${annulerOuvrage.aria} ${annulerOuvrage.title}`), annulerOuvrage ? `nom « ${annulerOuvrage.aria} », info-bulle « ${annulerOuvrage.title} »` : 'bouton introuvable');
    } finally { await page.close(); }
}

// ════════════════════════════════════════════════════════════════════════════
// BLOC D — Statuts produits par l'interface, couleurs comparées (C046, C042, C049)
// ════════════════════════════════════════════════════════════════════════════
async function blocStatuts(browser) {
    const page = await ouvrirDemo(browser, VP.d1440);
    const vus = {}; // texte → {fond, couleur, module}
    const garder = (module, liste) => { for (const p of liste) if (!vus[`${module}:${p.texte}`]) vus[`${module}:${p.texte}`] = { ...p, module }; };
    const vocab = {};
    try {
        // 1. Chantiers : un chantier par statut, par la fenêtre « Nouveau Chantier ».
        await aller(page, '#chantiers');
        const crees = [];
        for (const [statut, nom] of [['prospect', 'G3 en devis'], ['on_hold', 'G3 en pause'], ['completed', 'G3 terminé'], ['cancelled', 'G3 annulé']]) {
            try {
                await cliquer(page, /^Nouveau Chantier$/, { parAria: false });
                await attendre(900);
                await taper(page, '#newProjectForm-name', `Chantier ${nom}`);
                await cliquer(page, /^Informations complémentaires/, { sel: 'summary', parAria: false });
                await attendre(300);
                await page.select('#newProject-status', statut);
                await cliquer(page, /^Créer le chantier$/, { sel: 'button', parAria: false });
                await attendre(1200);
                const ouverte = await dialogueVisible(page);
                if (ouverte) {
                    crees.push(`${nom} : refusé (fenêtre « ${ouverte} » ouverte)`);
                    for (let k = 0; k < 3 && await dialogueVisible(page); k += 1) { await page.keyboard.press('Escape'); await attendre(600); }
                }
                else crees.push(`${nom} : créé`);
            } catch (e) { crees.push(`${nom} : ${e.message}`); }
        }
        await attendre(500);
        garder('chantier', await page.evaluate(pastillesStatut));
        await capture(page, 'D-1440-chantiers-statuts');
        noter('C046.chantiersCrees', crees);
        await aller(page, '#dashboard');
        garder('tableau-de-bord', await page.evaluate(pastillesStatut));

        // 2. Facture : brouillon → émise → partiellement réglée → réglée.
        await aller(page, '#devis');
        await cliquer(page, /DEV-2026-001/, { sel: 'tbody tr, button', parAria: false });
        await attendre(1500);
        await cliquer(page, /^Convertir en facture$/, { parAria: false });
        await attendre(1300);
        await cliquer(page, /^Créer le brouillon$/, { sel: 'button', parAria: false });
        await attendre(2000);
        garder('facture', await page.evaluate(pastillesStatut));
        await cliquer(page, /^Émettre la facture/);
        await attendre(1000);
        await cliquer(page, /^Émettre$/, { sel: '[role="dialog"] button, [role="alertdialog"] button', parAria: false });
        await attendre(1800);
        garder('facture', await page.evaluate(pastillesStatut));
        // Pastille du devis dans la liste, facture émise mais non réglée.
        const pastilleDevis = async () => { await aller(page, '#devis'); return page.evaluate(() => { const tr = [...document.querySelectorAll('tbody tr')].find((x) => /DEV-2026-001/.test(x.innerText)); return tr ? [...tr.querySelectorAll('span.rounded-full')].map((s) => s.innerText.trim()).filter(Boolean) : null; }); };
        vocab.devisApresEmission = await pastilleDevis();
        await capture(page, 'D-1440-devis-apres-emission');
        await aller(page, '#factures');
        await cliquer(page, /FACT-2026-001/, { sel: 'tbody tr, button', parAria: false }).catch(() => {});
        await attendre(1200);
        await cliquer(page, /^Enregistrer un règlement pour la facture/);
        await attendre(1100);
        const champsReglement = await page.evaluate(releverChamps, '[role="dialog"]');
        noter('C053.reglementFacture', champsReglement);
        // Montant tapé au format français, espaces de milliers compris (C058).
        await taper(page, '#reglement_montant_commun', '100 000');
        const montantLu = await valeur(page, '#reglement_montant_commun');
        noter('C058.reglementEspaces', montantLu);
        const validerReglement = await cliquer(page, /^Valider le règlement$/, { sel: '[role="dialog"] button', parAria: false });
        vocab.validationReglementFacture = validerReglement.texte;
        await attendre(1800);
        // Une quittance s'ouvre après le règlement : on la referme.
        vocab.apresReglement = await dialogueVisible(page);
        await cliquer(page, /^Fermer la fenêtre$/, { sel: 'button' }).catch(() => page.keyboard.press('Escape'));
        await attendre(800);
        garder('facture', await page.evaluate(pastillesStatut));
        await capture(page, 'D-1440-facture-partielle');
        vocab.filtresFactures = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.innerText.replace(/\s+/g, ' ').trim()).filter((t) => /^(Toutes|Non réglées|Partielles|Soldées|Avoirs|Brouillons)\b/.test(t)));
        vocab.ouvrirReglementFacture = 'Enregistrer un règlement';
        vocab.devisApresReglementPartiel = await pastilleDevis();
        garder('devis', await page.evaluate(pastillesStatut));
        await capture(page, 'D-1440-devis-apres-reglement-partiel');

        // 3. Compte de trésorerie (nécessaire pour payer une dépense).
        await aller(page, '#settings/finances');
        await cliquer(page, /^Ajouter un compte$/, { sel: 'button', parAria: false });
        await attendre(700);
        await taper(page, '#fin_compte_nom', 'Caisse chantier G3');
        await taper(page, '#fin_compte_solde', '500000');
        await cliquerSel(page, 'form[aria-label="Nouveau compte"] button[type="submit"]');
        await attendre(1200);

        // 4. Dépenses : à payer, payée, partiellement payée.
        await aller(page, '#depenses');
        await cliquer(page, /^Nouvelle dépense$/, { sel: 'button', parAria: false });
        await attendre(700);
        await cliquer(page, /^À payer/, { sel: '[role="radio"]', parAria: false });
        await taper(page, '#dep_description', 'Location grue G3');
        await taper(page, '#dep_montant', '100000');
        await cliquerSel(page, 'form[aria-label="Nouvelle dépense"] button[type="submit"]');
        await attendre(1300);
        garder('dépense', await page.evaluate(pastillesStatut));
        await cliquer(page, /^Nouvelle dépense$/, { sel: 'button', parAria: false });
        await attendre(700);
        await taper(page, '#dep_description', 'Ciment G3');
        await taper(page, '#dep_montant', '50000');
        await cliquerSel(page, 'form[aria-label="Nouvelle dépense"] button[type="submit"]');
        await attendre(1300);
        await cliquerSel(page, '[data-depense="Location grue G3"] > button');
        await attendre(500);
        const regler = await cliquer(page, /^Régler$/, { racine: '[data-depense="Location grue G3"]', sel: 'button', parAria: false });
        vocab.ouvrirReglementDepense = regler.texte;
        await attendre(500);
        await taper(page, '#dep_regl_montant', '50000');
        vocab.validationReglementDepense = await page.$eval('form[aria-label="Régler la dépense"] button[type="submit"]', (b) => b.innerText.trim()).catch(() => null);
        await cliquerSel(page, 'form[aria-label="Régler la dépense"] button[type="submit"]');
        await attendre(1300);
        garder('dépense', await page.evaluate(pastillesStatut));
        vocab.filtresDepenses = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.innerText.trim()));
        await capture(page, 'D-1440-depenses-statuts');
    } finally { await page.close(); }

    noter('C046.pastilles', vus);
    noter('C042.vocabulairePaiement', vocab);
    const lire = (module, re) => Object.values(vus).find((p) => p.module === module && re.test(p.texte));
    const sig = (p) => (p ? `« ${p.texte} » fond ${p.fond} texte ${p.couleur} (${famille(p.couleur)})` : 'non produit');

    // Même sens → même couleur.
    const factPartielle = lire('facture', /^Partiellement réglée$/);
    const depPartielle = lire('dépense', /^Partiellement payée$/);
    cas('C046', '« Partiellement réglée » (facture) et « Partiellement payée » (dépense) ont la même couleur',
        factPartielle && depPartielle && famille(factPartielle.couleur) === famille(depPartielle.couleur), `${sig(factPartielle)} / ${sig(depPartielle)}`);
    const factEmise = lire('facture', /^Émise$/);
    const depAPayer = lire('dépense', /^À payer$/);
    cas('C046', 'Rien n\'est encore réglé : « Émise » (facture) et « À payer » (dépense) ont la même couleur',
        factEmise && depAPayer && famille(factEmise.couleur) === famille(depAPayer.couleur), `${sig(factEmise)} / ${sig(depAPayer)}`);
    const depPayee = lire('dépense', /^Payée$/);
    const devisAccepte = lire('devis', /^(Accepté|Facturé)$/);
    cas('C046', 'Soldé / accepté : même couleur (vert) entre devis et dépenses',
        depPayee && devisAccepte && famille(depPayee.couleur) === famille(devisAccepte.couleur), `${sig(devisAccepte)} / ${sig(depPayee)}`);
    // Même couleur → même sens : une famille de couleur ne doit pas porter deux sens opposés.
    const parFamille = {};
    for (const p of Object.values(vus)) {
        if (!/^(Brouillon|Émise|Envoyée|Partiellement réglée|Réglée|Facturé|Accepté|Prêt|À vérifier|Envoyé|À payer|Partiellement payée|Payée|En devis|En cours|En pause|Terminé|Annulé|À rembourser|EN COURS|EN DEVIS|EN PAUSE|TERMINÉ|ANNULÉ)$/i.test(p.texte)) continue;
        (parFamille[famille(p.couleur)] ||= new Set()).add(`${p.module}:${p.texte}`);
    }
    const ambre = [...(parFamille['ambre/orange'] || [])];
    const bleu = [...(parFamille.bleu || [])];
    noter('C046.familles', Object.fromEntries(Object.entries(parFamille).map(([k, v]) => [k, [...v]])));
    cas('C046', 'L\'ambre ne porte qu\'un sens (pas à la fois « rien payé » et « partiellement payé »)',
        !(ambre.some((t) => /dépense:À payer/.test(t)) && ambre.some((t) => /facture:Partiellement/.test(t))), `ambre : ${ambre.join(', ')}`);
    cas('C046', 'Le bleu ne porte qu\'un sens (pas à la fois « en devis » et « partiellement payée »)',
        !(bleu.some((t) => /EN DEVIS|En devis/i.test(t)) && bleu.some((t) => /Partiellement payée/.test(t))), `bleu : ${bleu.join(', ')}`);

    cas('C046', 'Le devis facturé garde son statut « Facturé » dans la liste après un règlement partiel de sa facture',
        JSON.stringify(vocab.devisApresEmission) === JSON.stringify(vocab.devisApresReglementPartiel),
        `liste des devis, ligne DEV-2026-001 : facture émise → ${JSON.stringify(vocab.devisApresEmission)} ; après règlement partiel de 100 000 → ${JSON.stringify(vocab.devisApresReglementPartiel)}`);
    // Vocabulaire du paiement (C042).
    const motsPaiement = [vocab.validationReglementFacture, vocab.validationReglementDepense, vocab.ouvrirReglementFacture, vocab.ouvrirReglementDepense];
    cas('C042', 'Enregistrer un paiement : même verbe côté factures et côté dépenses',
        vocab.validationReglementFacture && vocab.validationReglementDepense && vocab.validationReglementFacture.split(' ')[0] === vocab.validationReglementDepense.split(' ')[0],
        `ouvrir : « ${vocab.ouvrirReglementFacture} » / « ${vocab.ouvrirReglementDepense} » ; valider : « ${vocab.validationReglementFacture} » / « ${vocab.validationReglementDepense} » ; statuts : ${sig(factPartielle)} vs ${sig(depPartielle)} ; filtres factures ${JSON.stringify(vocab.filtresFactures)} / dépenses ${JSON.stringify(vocab.filtresDepenses)}`);
    void motsPaiement;
}

// ════════════════════════════════════════════════════════════════════════════
// BLOC E — États visuels : focus clavier, survol, sélection (C049, C050, C046)
// ════════════════════════════════════════════════════════════════════════════
async function blocEtats(browser) {
    const page = await ouvrirDemo(browser, VP.d1440);
    try {
        // 1. Focus clavier : vraies tabulations depuis le titre de l'écran (le
        //    clic sur le h1 place le point de départ de la navigation séquentielle
        //    dans le contenu, pas dans l'en-tête), style lu après la transition.
        const parFamille = {};
        const sansIndicateur = [];
        for (const route of ['#devis', '#factures', '#depenses', '#clients', '#chantiers', '#materiaux', '#settings/entreprise']) {
            await aller(page, route);
            const h1 = await page.evaluate(() => { const h = document.querySelector('h1'); if (!h) return null; const r = h.getBoundingClientRect(); return { x: r.left + 4, y: r.top + r.height / 2 }; });
            if (h1) await page.mouse.click(h1.x, h1.y); else await page.mouse.click(700, 300);
            for (let i = 0; i < 30; i += 1) {
                await page.keyboard.press('Tab');
                await attendre(260);
                const f = await page.evaluate(() => {
                    const el = document.activeElement;
                    if (!el || el === document.body) return null;
                    if (el.closest('aside, header, nav')) return { horsContenu: true };
                    const cs = getComputedStyle(el);
                    const cls = String(el.className);
                    const fam = cls.includes('btn-primary') ? 'btn-primary' : cls.includes('btn-secondary') ? 'btn-secondary' : cls.includes('app-input') ? 'app-input' : cls.includes('btn-icon') ? 'btn-icon' : null;
                    const contour = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 ? `contour ${cs.outlineStyle} ${cs.outlineWidth}` : '';
                    const ombre = cs.boxShadow && cs.boxShadow !== 'none' && /0px 0px 0px [1-9]/.test(cs.boxShadow) ? `anneau ${cs.boxShadow.match(/rgba?\([^)]*\)/)?.[0]}` : '';
                    const indic = [contour, ombre].filter(Boolean).join(' + ') || 'aucun';
                    return { fam, indic: fam === 'app-input' ? `${indic} · bordure ${cs.borderTopColor}` : indic, texte: (el.innerText || el.getAttribute('aria-label') || el.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 40) };
                });
                if (!f || f.horsContenu || !f.fam) continue;
                (parFamille[f.fam] ||= {});
                (parFamille[f.fam][f.indic] ||= new Set()).add(`${route} « ${f.texte} »`);
                if (/^aucun/.test(f.indic)) sansIndicateur.push(`${route} ${f.fam} « ${f.texte} »`);
            }
        }
        const resume = Object.fromEntries(Object.entries(parFamille).map(([fam, m]) => [fam, Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...v].slice(0, 3)]))]));
        noter('C049.focus', resume);
        const divergents = Object.entries(parFamille).filter(([, m]) => Object.keys(m).length > 1).map(([fam, m]) => `${fam} : ${Object.keys(m).join(' ≠ ')}`);
        cas('C049', 'Indicateur de focus clavier identique pour une même famille de composant, dans le contenu de 7 écrans (30 tabulations par écran)',
            divergents.length === 0, divergents.join(' | ') || Object.entries(resume).map(([f, m]) => `${f} : ${Object.keys(m).join(', ')}`).join(' | '));
        noter('C049.focusSansIndicateur', sansIndicateur);

        // 2. Survol réel : bouton icône non destructif vs suppression.
        await aller(page, '#devis');
        const survol = async (selOuMotif) => {
            const c = typeof selOuMotif === 'string'
                ? await page.evaluate((s) => { const el = [...document.querySelectorAll(s)].find((x) => x.getBoundingClientRect().width > 0); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, selOuMotif)
                : await trouver(page, selOuMotif);
            if (!c) return null;
            await page.mouse.move(c.x, c.y);
            await attendre(350);
            const st = await page.evaluate((x, y) => { let el = document.elementFromPoint(x, y); el = el?.closest('button') || el; const cs = getComputedStyle(el); return { aria: el.getAttribute('aria-label'), fond: cs.backgroundColor, couleur: cs.color }; }, c.x, c.y);
            await page.mouse.move(2, 2); await attendre(200);
            return st;
        };
        const reglages = await survol('button[aria-label="Paramètres du compte"]');
        const supprimer = await survol(/^Supprimer le devis DEV-2026-001$/);
        await cliquer(page, /DEV-2026-001/, { sel: 'tbody tr, button', parAria: false });
        await attendre(1300);
        const fermer = await survol('[role="dialog"] button[aria-label="Fermer la boîte de dialogue"], button[aria-label="Fermer la boîte de dialogue"]');
        await capture(page, 'E-1440-survol-fermer');
        await page.keyboard.press('Escape'); await attendre(600);
        noter('C050.survol', { reglages, fermer, supprimer });
        const rouge = (s) => s && famille(s.couleur) === 'rouge/rose';
        cas('C050', 'Au survol, un bouton non destructif (« Paramètres du compte », « Fermer ») ne prend pas la couleur de la suppression',
            !(rouge(reglages) || rouge(fermer)) || !rouge(supprimer),
            `Paramètres : fond ${reglages?.fond} icône ${reglages?.couleur} (${famille(reglages?.couleur)}) ; Fermer : fond ${fermer?.fond} icône ${fermer?.couleur} (${famille(fermer?.couleur)}) ; Supprimer le devis : fond ${supprimer?.fond} icône ${supprimer?.couleur} (${famille(supprimer?.couleur)})`);

        // 3. Survol du bouton principal (.btn-primary) d'un écran à l'autre.
        const survolsPrimaires = [];
        for (const [route, motif] of [['#settings/entreprise', 'button[aria-label="Enregistrer les paramètres de l\'entreprise"]'], ['#depenses', /^Nouvelle dépense$/], ['#materiaux', /^Nouvelle Matière$/], ['#clients', /^Nouveau Client$/], ['#chantiers', /^Nouveau Chantier$/]]) {
            await aller(page, route);
            const cls = typeof motif === 'string' ? await page.$eval(motif, (b) => String(b.className)).catch(() => '') : await page.evaluate((src) => { const re = new RegExp(src); const b = [...document.querySelectorAll('button')].find((x) => x.getBoundingClientRect().width > 0 && re.test(x.innerText.trim())); return b ? String(b.className) : ''; }, motif.source);
            const repos = typeof motif === 'string' ? await page.$eval(motif, (b) => getComputedStyle(b).backgroundColor).catch(() => null) : await page.evaluate((src) => { const re = new RegExp(src); const b = [...document.querySelectorAll('button')].find((x) => x.getBoundingClientRect().width > 0 && re.test(x.innerText.trim())); return b ? getComputedStyle(b).backgroundColor : null; }, motif.source);
            const st = await survol(motif);
            survolsPrimaires.push({ route, bouton: st?.aria || String(motif), classePrincipale: /btn-primary/.test(cls), repos, survol: st?.fond });
        }
        noter('C049.survolPrimaire', survolsPrimaires);
        const reposDistincts = new Set(survolsPrimaires.map((x) => x.repos));
        const survolsDistincts = new Set(survolsPrimaires.map((x) => x.survol));
        cas('C049', 'Bouton de l\'action principale de l\'écran : même apparence au repos et au survol sur 5 écrans',
            reposDistincts.size <= 1 && survolsDistincts.size <= 1,
            survolsPrimaires.map((x) => `${x.route} « ${x.bouton} » ${x.classePrincipale ? '(.btn-primary)' : '(autre classe)'} repos ${x.repos} → survol ${x.survol}`).join(' | '));

        // 4. État « sélectionné » d'un même motif (choix exclusif) d'un écran à l'autre.
        const selection = {};
        for (const route of ['#factures', '#depenses', '#dashboard', '#settings/finances']) {
            await aller(page, route);
            selection[route] = (await page.evaluate(releverEcran)).selections.filter((s) => s.choisi).map((s) => `${s.role} « ${s.texte} » fond ${s.fond} texte ${s.couleur}`);
        }
        await aller(page, '#factures');
        const pastillesFiltre = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0 && /^(Toutes|Non réglées|Partielles|Soldées|Avoirs|Brouillons)\b/.test(b.innerText.replace(/\s+/g, ' ').trim()))
            .map((b) => ({ texte: b.innerText.replace(/\s+/g, ' ').trim(), fond: getComputedStyle(b).backgroundColor, couleur: getComputedStyle(b).color, etatExpose: b.getAttribute('aria-pressed') ?? b.getAttribute('aria-selected') ?? b.getAttribute('aria-current') ?? null, role: b.getAttribute('role') })));
        await aller(page, '#depenses');
        const ongletsDep = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => ({ texte: b.innerText.trim(), fond: getComputedStyle(b).backgroundColor, etatExpose: b.getAttribute('aria-selected') })));
        noter('C049.filtres', { pastillesFiltre, ongletsDep });
        const choisieVisuelle = pastillesFiltre.find((p) => /28, 43, 51/.test(p.fond));
        cas('C049', 'Filtres de liste : l\'état « choisi » est le même composant et le même état exposé sur Factures et Dépenses',
            Boolean(choisieVisuelle) && choisieVisuelle.etatExpose !== null && ongletsDep.some((o) => o.etatExpose === 'true'),
            `Factures : « ${choisieVisuelle?.texte} » choisi visuellement (fond ${choisieVisuelle?.fond}), état exposé ${choisieVisuelle?.etatExpose ?? 'aucun'} (rôle ${choisieVisuelle?.role ?? 'bouton'}) ; Dépenses : ${ongletsDep.map((o) => `« ${o.texte} » aria-selected=${o.etatExpose}`).join(', ')}`);
        await cliquer(page, /^Nouvelle dépense$/, { sel: 'button', parAria: false });
        await attendre(700);
        const radios = await page.evaluate(() => [...document.querySelectorAll('form [role="radio"]')].filter((r) => r.getBoundingClientRect().width > 0 && r.getAttribute('aria-checked') === 'true')
            .map((r) => { const cs = getComputedStyle(r); return { texte: r.innerText.replace(/\s+/g, ' ').trim().slice(0, 30), groupe: r.closest('[role=radiogroup]')?.getAttribute('aria-label'), fond: cs.backgroundColor, couleur: cs.color, bordure: cs.borderTopColor }; }));
        await capture(page, 'E-1440-depense-radios');
        noter('C049.selection', { selection, radios });
        const fondsRadios = new Set(radios.map((r) => r.fond));
        cas('C049', 'Formulaire dépense : les deux groupes de choix exclusifs (« Nature », « Qui a payé ») montrent la sélection de la même façon',
            fondsRadios.size <= 1, radios.map((r) => `${r.groupe} › « ${r.texte} » fond ${r.fond} texte ${r.couleur}`).join(' | '));
    } finally { await page.close(); }
}

// ════════════════════════════════════════════════════════════════════════════
// BLOC F — Formats et exemples avant l'erreur (C053) + structure (C059)
// ════════════════════════════════════════════════════════════════════════════
const RE_FORMAT = /(e-?mail|t[ée]l[ée]phone|whatsapp|orange money|wave|moov|portefeuille|\bNIF\b|RCCM|\bRIB\b|IBAN|SWIFT|\bBIC\b|taux|%|montant|prix|budget|solde|contenu d.un conditionnement|validit|dur[ée]e|quantit|rendement)/i;
const RE_UNITE = /(FCFA|XOF|%|m²|m³|\(ml\)|\(m\)|jours|mois|\(u\))/i;
function evaluerChamps(nomFormulaire, champs) {
    const manquants = []; const retenus = [];
    for (const c of champs || []) {
        const aFormat = ['email', 'tel', 'number', 'date'].includes(c.type) || RE_FORMAT.test(c.libelle);
        if (!aFormat) continue;
        retenus.push(c);
        const exemple = c.exemple && c.exemple.trim() !== '0' ? c.exemple : '';
        const indice = exemple || c.aide || RE_UNITE.test(c.libelle) || c.type === 'date' || (c.valeur && c.type !== 'text');
        if (!indice) manquants.push(`${nomFormulaire} › « ${c.libelle || c.id} » (${c.type})`);
    }
    return { manquants, nb: retenus.length };
}

async function blocFormats(browser) {
    const page = await ouvrirDemo(browser, VP.d1440);
    const bilan = []; const structures = {}; const exemplesMarche = [];
    try {
        // Nouveau client (champs facultatifs dépliés)
        await aller(page, '#clients');
        await cliquer(page, /^Nouveau Client$/, { parAria: false });
        await attendre(900);
        await cliquer(page, /^Informations complémentaires/, { sel: 'summary', parAria: false });
        await attendre(300);
        const client = await page.evaluate(releverChamps, '#newClientForm');
        bilan.push(evaluerChamps('Nouveau client', client));
        structures['Nouveau client'] = await page.evaluate(structureFormulaire, '#newClientForm');
        // Erreur provoquée : e-mail incomplet, l'exemple était-il visible avant ?
        const exempleEmail = client.find((c) => c.id === 'newClientForm-email')?.exemple;
        await taper(page, '#newClientForm-name', 'Client format G3');
        await taper(page, '#newClientForm-email', 'contact@');
        await cliquer(page, /^Créer le client$/, { sel: 'button', parAria: false });
        await attendre(600);
        const erreurEmail = await page.$eval('#newClientForm-email', (n) => ({ valide: n.validity.valid, message: n.validationMessage }));
        const encoreOuverte = Boolean(await dialogueVisible(page));
        cas('C053', 'Nouveau client : l\'exemple d\'e-mail est visible avant l\'erreur, et l\'erreur bloque l\'envoi',
            Boolean(exempleEmail) && !erreurEmail.valide && encoreOuverte, `exemple avant saisie « ${exempleEmail} » ; après « contact@ » : ${erreurEmail.valide ? 'accepté' : `refusé — « ${erreurEmail.message} »`} ; fenêtre ${encoreOuverte ? 'toujours ouverte' : 'fermée'}`);
        exemplesMarche.push(`client téléphone « ${client.find((c) => c.id === 'newClientForm-phone')?.exemple} »`);
        await page.keyboard.press('Escape'); await attendre(700);

        // Nouveau chantier
        await aller(page, '#chantiers');
        await cliquer(page, /^Nouveau Chantier$/, { parAria: false });
        await attendre(900);
        await cliquer(page, /^Informations complémentaires/, { sel: 'summary', parAria: false });
        await attendre(300);
        const chantier = await page.evaluate(releverChamps, '[role="dialog"]');
        bilan.push(evaluerChamps('Nouveau chantier', chantier));
        structures['Nouveau chantier'] = await page.evaluate(structureFormulaire, '[role="dialog"]');
        await page.keyboard.press('Escape'); await attendre(700);

        // Nouvelle dépense (+ erreur provoquée : envoi à vide)
        await aller(page, '#depenses');
        await cliquer(page, /^Nouvelle dépense$/, { sel: 'button', parAria: false });
        await attendre(700);
        const depense = await page.evaluate(releverChamps, 'form[aria-label="Nouvelle dépense"]');
        bilan.push(evaluerChamps('Nouvelle dépense', depense));
        structures['Nouvelle dépense'] = await page.evaluate(structureFormulaire, 'form[aria-label="Nouvelle dépense"]');
        await cliquerSel(page, 'form[aria-label="Nouvelle dépense"] button[type="submit"]');
        await attendre(500);
        const erreurDep = await page.evaluate(() => document.querySelector('[data-depenses] [role="alert"]')?.innerText?.replace(/\s+/g, ' ').trim() || '');
        const montantDep = depense.find((c) => c.id === 'dep_montant');
        cas('C053', 'Nouvelle dépense : les champs cités par l\'erreur avaient un exemple ou une unité avant l\'envoi',
            /Décrivez|montant/i.test(erreurDep) && Boolean(depense.find((c) => c.id === 'dep_description')?.exemple) && Boolean(montantDep && (montantDep.exemple || montantDep.aide || RE_UNITE.test(montantDep.libelle))),
            `erreur affichée « ${erreurDep.slice(0, 160)} » ; Objet : exemple « ${depense.find((c) => c.id === 'dep_description')?.exemple} » ; Montant : libellé « ${montantDep?.libelle} », exemple « ${montantDep?.exemple || ''} », aide « ${montantDep?.aide || ''} »`);
        await capture(page, 'F-1440-depense-erreur');
        await cliquer(page, /^Annuler$/, { racine: 'form[aria-label="Nouvelle dépense"]', sel: 'button', parAria: false }).catch(() => {});

        // Paramètres : Entreprise, Documents, Facturation & envoi
        for (const [section, nom] of [['entreprise', 'Paramètres › Entreprise'], ['documents', 'Paramètres › Documents & PDF'], ['facturation', 'Paramètres › Facturation & envoi']]) {
            await aller(page, `#settings/${section}`);
            const champs = await page.evaluate(releverChamps, null);
            bilan.push(evaluerChamps(nom, champs));
            structures[nom] = await page.evaluate(structureFormulaire, 'body');
            for (const c of champs) if (/t[ée]l[ée]phone|orange|wave|moov|RIB|TVA/i.test(c.libelle) && c.exemple) exemplesMarche.push(`${nom} › ${c.libelle} « ${c.exemple} »`);
        }
        // Paramètres › Finances : formulaire de compte, type banque puis mobile money
        await aller(page, '#settings/finances');
        await cliquer(page, /^Ajouter un compte$/, { sel: 'button', parAria: false });
        await attendre(700);
        const typesCompte = await page.evaluate(() => { const b = document.querySelector('button[aria-label="Type de compte"]'); return b ? b.innerText.trim() : null; });
        const compte1 = await page.evaluate(releverChamps, 'form[aria-label="Nouveau compte"]');
        bilan.push(evaluerChamps(`Nouveau compte (${typesCompte})`, compte1));
        structures['Nouveau compte'] = await page.evaluate(structureFormulaire, 'form[aria-label="Nouveau compte"]');
        try {
            await choisirOption(page, 'Type de compte', 'Compte bancaire');
            const compteBanque = await page.evaluate(releverChamps, 'form[aria-label="Nouveau compte"]');
            bilan.push(evaluerChamps('Nouveau compte (Compte bancaire)', compteBanque));
            await choisirOption(page, 'Type de compte', 'Mobile money');
            const compteMobile = await page.evaluate(releverChamps, 'form[aria-label="Nouveau compte"]');
            bilan.push(evaluerChamps('Nouveau compte (Mobile money)', compteMobile));
            for (const c of compteMobile) if (c.exemple && /\+\d/.test(c.exemple)) exemplesMarche.push(`Nouveau compte › ${c.libelle} « ${c.exemple} »`);
        } catch (e) { noter('C053.compteTypes', `bascule de type impossible : ${e.message}`); }

        // Nouvelle matière
        await aller(page, '#materiaux');
        await cliquer(page, /^Nouvelle Matière$/, { parAria: false });
        await attendre(1100);
        const matiere = await page.evaluate(releverChamps, 'form');
        bilan.push(evaluerChamps('Nouvelle matière', matiere));
        structures['Nouvelle matière'] = await page.evaluate(structureFormulaire, 'form');
        await capture(page, 'F-1440-nouvelle-matiere');
    } finally { await page.close(); }

    const manquants = bilan.flatMap((b) => b.manquants);
    const total = bilan.reduce((s, b) => s + b.nb, 0);
    noter('C053.manquants', manquants);
    noter('C053.exemplesMarche', exemplesMarche);
    cas('C053', `Champs à format (e-mail, téléphone, NIF/RCCM, RIB/IBAN, montants, taux, dates) : exemple, unité ou aide visible avant toute erreur — ${total} champs dans 10 formulaires`,
        manquants.length === 0, manquants.join(' | ') || 'tous renseignés');
    const indicatifs = [...new Set(exemplesMarche.map((e) => (e.match(/\+(\d{3})/) || [])[1]).filter(Boolean))];
    cas('C053', 'Les exemples de numéro de téléphone suivent un même indicatif (marché de l\'entreprise)', indicatifs.length <= 1, `indicatifs montrés : ${indicatifs.map((i) => '+' + i).join(', ')} — ${exemplesMarche.join(' ; ')}`);

    // C059 — formulaires longs (> 7 champs) : groupés par des titres.
    noter('C059.structures', structures);
    for (const [nom, s] of Object.entries(structures)) {
        if (!s || s.nbChamps <= 7) continue;
        cas('C059', `${nom} : ${s.nbChamps} champs regroupés sous des titres (au plus 7 champs d'affilée sans titre)`,
            s.plusLongueSuiteSansTitre <= 7, `titres ${JSON.stringify(s.titres)} ; plus longue suite sans titre : ${s.plusLongueSuiteSansTitre} champs ; fieldset : ${s.fieldsets}`);
    }
}

// ════════════════════════════════════════════════════════════════════════════
// BLOC G — Champs conditionnels : la saisie survit-elle ? (C057)
// ════════════════════════════════════════════════════════════════════════════
async function blocConditionnels(browser) {
    const page = await ouvrirDemo(browser, VP.d1440);
    try {
        // 1. Nouveau client : replier/déplier les informations complémentaires.
        await aller(page, '#clients');
        await cliquer(page, /^Nouveau Client$/, { parAria: false });
        await attendre(900);
        await taper(page, '#newClientForm-name', 'Client G3 replis');
        await cliquer(page, /^Informations complémentaires/, { sel: 'summary', parAria: false });
        await attendre(300);
        await taper(page, '#newClientForm-phone', '+223 76 12 34 56');
        await taper(page, '#newClientForm-email', 'g3@exemple.ml');
        await cliquer(page, /^Informations complémentaires/, { sel: 'summary', parAria: false }); // replier
        await attendre(300);
        const replie = await page.$eval('#newClientForm-phone', (n) => n.closest('details')?.open === false);
        await cliquer(page, /^Informations complémentaires/, { sel: 'summary', parAria: false }); // déplier
        await attendre(300);
        const tel = await valeur(page, '#newClientForm-phone'); const mel = await valeur(page, '#newClientForm-email');
        cas('C057', 'Nouveau client : replier puis déplier « Informations complémentaires » conserve téléphone et e-mail',
            replie && tel === '+223 76 12 34 56' && mel === 'g3@exemple.ml', `replié : ${replie ? 'oui' : 'non'} ; après dépliage : « ${tel} », « ${mel} »`);
        await page.keyboard.press('Escape'); await attendre(700);

        // 2. Nouveau chantier : créer un client depuis la fenêtre du chantier.
        await aller(page, '#chantiers');
        await cliquer(page, /^Nouveau Chantier$/, { parAria: false });
        await attendre(900);
        await taper(page, '#newProjectForm-name', 'Chantier G3 imbriqué');
        await cliquer(page, /^Informations complémentaires/, { sel: 'summary', parAria: false });
        await attendre(300);
        await taper(page, '#newProjectForm-siteAddress', 'Hamdallaye ACI 2000');
        const boutonCreerClient = await cliquer(page, /^Créer un nouveau client$/, { sel: '[role="dialog"] button' });
        await attendre(900);
        const titreImbrique = await dialogueVisible(page);
        await taper(page, '#newClientForm-name', 'Client G3 imbriqué');
        await cliquer(page, /^Créer le client$/, { sel: 'button', parAria: false });
        await attendre(1200);
        const retour = await page.evaluate(() => ({
            nom: document.querySelector('#newProjectForm-name')?.value ?? null,
            adresse: document.querySelector('#newProjectForm-siteAddress')?.value ?? null,
            client: [...document.querySelectorAll('[role=dialog] button')].map((b) => b.innerText.trim()).find((t) => /G3 imbriqué/.test(t)) || null
        }));
        await capture(page, 'G-1440-chantier-client-imbrique');
        cas('C057', 'Nouveau chantier : créer un client depuis la fenêtre conserve le nom et l\'adresse déjà saisis, et sélectionne le nouveau client',
            retour.nom === 'Chantier G3 imbriqué' && retour.adresse === 'Hamdallaye ACI 2000' && Boolean(retour.client),
            `bouton « ${boutonCreerClient.texte || boutonCreerClient.aria} » → fenêtre intermédiaire « ${titreImbrique} » ; au retour : nom « ${retour.nom} », adresse « ${retour.adresse} », client « ${retour.client} »`);
        await page.keyboard.press('Escape'); await attendre(700);

        // 3. Nouvelle dépense : nature, payeur, répartition.
        await aller(page, '#depenses');
        await cliquer(page, /^Nouvelle dépense$/, { sel: 'button', parAria: false });
        await attendre(700);
        await taper(page, '#dep_description', 'Ciment G3 conditionnel');
        await taper(page, '#dep_fournisseur', 'Quincaillerie Bamako');
        await taper(page, '#dep_montant', '150000');
        await cliquer(page, /^À payer/, { sel: '[role="radio"]', parAria: false });
        await attendre(300);
        const echeanceAuto = await valeur(page, '#dep_echeance');
        await page.$eval('#dep_echeance', (n) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(n, '2026-12-15'); n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); });
        await attendre(200);
        await cliquer(page, /^Déjà payée/, { sel: '[role="radio"]', parAria: false });
        await attendre(300);
        const apresNature = { objet: await valeur(page, '#dep_description'), fournisseur: await valeur(page, '#dep_fournisseur'), montant: await valeur(page, '#dep_montant') };
        await cliquer(page, /^À payer/, { sel: '[role="radio"]', parAria: false });
        await attendre(300);
        const echeanceRetour = await valeur(page, '#dep_echeance');
        cas('C057', 'Dépense : basculer « À payer » ↔ « Déjà payée » conserve objet, fournisseur, montant et l\'échéance modifiée',
            apresNature.objet === 'Ciment G3 conditionnel' && apresNature.fournisseur === 'Quincaillerie Bamako' && apresNature.montant === '150000' && echeanceRetour === '2026-12-15',
            `échéance proposée ${echeanceAuto} → saisie 2026-12-15 ; après aller-retour : ${JSON.stringify(apresNature)}, échéance ${echeanceRetour}`);
        await cliquer(page, /^Déjà payée/, { sel: '[role="radio"]', parAria: false });
        await attendre(300);
        await cliquer(page, /^Avancée par quelqu/, { sel: '[role="radio"]', parAria: false });
        await attendre(300);
        await taper(page, '#dep_avance', 'Moussa Traoré');
        await cliquer(page, /^Payée par l/, { sel: '[role="radio"]', parAria: false });
        await attendre(300);
        await cliquer(page, /^Avancée par quelqu/, { sel: '[role="radio"]', parAria: false });
        await attendre(300);
        const avance = await valeur(page, '#dep_avance');
        cas('C057', 'Dépense : « Avancée par quelqu\'un » → « Payée par l\'entreprise » → retour : le nom saisi est conservé', avance === 'Moussa Traoré', `« ${avance} »`);
        await cliquer(page, /^Payée par l/, { sel: '[role="radio"]', parAria: false });
        await attendre(300);
        // Répartition
        const repartirPresent = await page.$('#dep_repartir');
        if (repartirPresent) {
            await cliquerSel(page, '#dep_repartir');
            await attendre(300);
            await taper(page, 'input[aria-label="Montant de la part 1"]', '100000');
            await taper(page, 'input[aria-label="Montant de la part 2"]', '77000');
            await cliquerSel(page, '#dep_repartir'); await attendre(300);
            const chantierVisible = await page.evaluate(() => !!document.querySelector('button[aria-label="Chantier de la dépense"]'));
            await cliquerSel(page, '#dep_repartir'); await attendre(300);
            const parts = [await valeur(page, 'input[aria-label="Montant de la part 1"]'), await valeur(page, 'input[aria-label="Montant de la part 2"]')];
            cas('C057', 'Dépense : décocher puis recocher « Répartir entre plusieurs chantiers » conserve les montants des parts',
                parts[0] === '100000' && parts[1] === '77000', `parts après aller-retour : ${JSON.stringify(parts)} ; champ « Chantier » réaffiché pendant le décochage : ${chantierVisible ? 'oui' : 'non'}`);
            await cliquerSel(page, '#dep_repartir'); await attendre(300);
        } else nonExecute('C057', 'Dépense : répartition entre chantiers', 'case « Répartir » absente');
        // Lien « Ajouter un compte » DANS le formulaire (aucun compte en démo).
        const lien = await trouver(page, /^Ajouter un compte$/, { racine: 'form[aria-label="Nouvelle dépense"]', sel: 'button', parAria: false });
        if (lien) {
            await page.mouse.click(lien.x, lien.y);
            await attendre(1500);
            const ou = await page.evaluate(() => ({ h1: document.querySelector('h1')?.innerText?.trim(), hash: location.hash }));
            const confirmation = await dialogueVisible(page);
            await capture(page, 'G-1440-depense-lien-ajouter-compte');
            await aller(page, '#depenses');
            const brouillon = await page.evaluate(() => ({ formulaire: !!document.querySelector('form[aria-label="Nouvelle dépense"]'), objet: document.querySelector('#dep_description')?.value ?? null }));
            await capture(page, 'G-1440-depense-retour');
            cas('C057', 'Dépense : le lien « Ajouter un compte » du formulaire ne fait pas perdre la dépense en cours (ou prévient avant)',
                brouillon.objet === 'Ciment G3 conditionnel' || Boolean(confirmation),
                `clic → écran « ${ou.h1} » (${ou.hash}), avertissement : ${confirmation || 'aucun'} ; retour sur Dépenses : formulaire ${brouillon.formulaire ? 'ouvert' : 'fermé'}, objet « ${brouillon.objet ?? '—'} » (saisis : objet, fournisseur, montant 150 000, échéance)`);
        } else nonExecute('C057', 'Dépense : lien « Ajouter un compte » du formulaire', 'lien absent');

        // 4. Compte de trésorerie : type Banque ↔ Mobile money.
        await aller(page, '#settings/finances');
        await cliquer(page, /^Ajouter un compte$/, { sel: 'button', parAria: false });
        await attendre(700);
        try {
            await choisirOption(page, 'Type de compte', 'Compte bancaire');
            await taper(page, '#fin_compte_iban', 'ML016 01201 020400012345 67');
            await choisirOption(page, 'Type de compte', 'Mobile money');
            await taper(page, '#fin_compte_mobile', '+223 76 12 34 56');
            await choisirOption(page, 'Type de compte', 'Compte bancaire');
            const iban = await valeur(page, '#fin_compte_iban');
            await choisirOption(page, 'Type de compte', 'Mobile money');
            const mobile = await valeur(page, '#fin_compte_mobile');
            cas('C057', 'Compte : passer de « Compte bancaire » à « Mobile money » et retour conserve IBAN et numéro de portefeuille', iban === 'ML016 01201 020400012345 67' && mobile === '+223 76 12 34 56', `IBAN « ${iban} », portefeuille « ${mobile} »`);
        } catch (e) { nonExecute('C057', 'Compte : bascule Compte bancaire / Mobile money', e.message); }

        // 5. Facturer : changer le type de facture conserve le % saisi.
        await aller(page, '#devis');
        await cliquer(page, /DEV-2026-001/, { sel: 'tbody tr, button', parAria: false });
        await attendre(1500);
        await cliquer(page, /^Convertir en facture$/, { parAria: false });
        await attendre(1300);
        // Saisie réaliste : on efface au clavier (Fin + Retour arrière) puis on tape 40.
        const pctSel = '[role="dialog"] input[type="number"]';
        const pctInitial = await valeur(page, pctSel);
        await cliquerSel(page, pctSel);
        await page.keyboard.press('End');
        for (let k = 0; k < 4; k += 1) { await page.keyboard.press('Backspace'); await attendre(80); }
        const pctVide = await valeur(page, pctSel);
        await page.keyboard.type('40', { delay: 40 });
        await attendre(300);
        const pctAffiche = await valeur(page, pctSel);
        const totalAvant = await page.evaluate(() => [...document.querySelectorAll('[role=dialog] span')].map((s) => s.innerText).filter((t) => /FCFA/.test(t)).pop());
        await choisirOption(page, 'Type de facture', 'Acompte');
        const pct = await valeur(page, pctSel);
        const totalApres = await page.evaluate(() => [...document.querySelectorAll('[role=dialog] span')].map((s) => s.innerText).filter((t) => /FCFA/.test(t)).pop());
        await capture(page, 'G-1440-facturer-pourcentage');
        noter('C058.pourcentageSituation', { pctInitial, pctVide, pctAffiche, pct, totalAvant, totalApres });
        cas('C057', 'Facturer : passer le type de « Standard » à « Acompte » conserve le pourcentage saisi et le montant',
            Number(pct) === 40 && totalAvant === totalApres, `% affiché après changement « ${pct} » (valeur ${Number(pct)}) ; total ${totalAvant} → ${totalApres}`);
        cas('C058', 'Facturer : effacer le % au clavier puis taper « 40 » affiche « 40 »', pctAffiche === '40',
            `valeur initiale « ${pctInitial} » ; après 4 × Retour arrière : « ${pctVide} » ; après frappe de 4 puis 0 : « ${pctAffiche} »`);
        await cliquer(page, /^Annuler$/, { racine: '[role="dialog"]', sel: 'button', parAria: false }).catch(() => page.keyboard.press('Escape'));
        await attendre(700);

        // 6. Éditeur de devis : mode de métré Rectangle ↔ Surface.
        await aller(page, '#chiffrage');
        await page.$eval('input[aria-label="Rechercher un ouvrage à ajouter"]', (n) => n.scrollIntoView({ block: 'center' }));
        await taper(page, 'input[aria-label="Rechercher un ouvrage à ajouter"]', 'Enduit');
        await attendre(900);
        await cliquer(page, /Enduit Ciment Hydrofuge/, { sel: '[role="option"]', parAria: false });
        await attendre(1800);
        await cliquer(page, /^Mode avancé$/, { sel: 'button' });
        await attendre(900);
        await choisirOption(page, 'Mode de Métré', 'Rectangle');
        await taper(page, 'input[aria-label="Largeur (m)"]', '4');
        await taper(page, 'input[aria-label="Hauteur (m)"]', '3');
        await choisirOption(page, 'Mode de Métré', 'Surface Directe');
        await taper(page, 'input[aria-label="Surface Directe (m²)"]', '50');
        await choisirOption(page, 'Mode de Métré', 'Rectangle');
        const dims = [await valeur(page, 'input[aria-label="Largeur (m)"]'), await valeur(page, 'input[aria-label="Hauteur (m)"]')];
        await choisirOption(page, 'Mode de Métré', 'Surface Directe');
        const surf = await valeur(page, 'input[aria-label="Surface Directe (m²)"]');
        await capture(page, 'G-1440-mode-metre');
        cas('C057', 'Devis : Rectangle (4 × 3) → Surface (50 m²) → Rectangle → Surface : chaque saisie est retrouvée',
            dims[0] === '4' && dims[1] === '3' && surf === '50', `largeur/hauteur au retour ${JSON.stringify(dims)}, surface au retour « ${surf} »`);
    } finally { await page.close(); }
}

// ════════════════════════════════════════════════════════════════════════════
// BLOC H — Formats légitimes du marché (C058)
// ════════════════════════════════════════════════════════════════════════════
async function blocMarche(browser) {
    const page = await ouvrirDemo(browser, VP.d1440);
    try {
        const lang = await page.evaluate(() => navigator.language);
        noter('C058.langueNavigateur', lang);
        // 1. Clients : formats de téléphone maliens et e-mail en .ml
        const essais = [['Client G3 tel international', '+223 76 12 34 56', 'contact@btp-mali.com.ml'], ['Client G3 tel local', '76 12 34 56', 'devis@sahel-construction.ml'], ['Client G3 tel 00', '00223 76123456', 'a.traore@orange.ml']];
        const refus = [];
        for (const [nom, tel, mel] of essais) {
            await aller(page, '#clients');
            await cliquer(page, /^Nouveau Client$/, { parAria: false });
            await attendre(900);
            await taper(page, '#newClientForm-name', nom);
            await cliquer(page, /^Informations complémentaires/, { sel: 'summary', parAria: false });
            await attendre(300);
            await taper(page, '#newClientForm-phone', tel);
            await taper(page, '#newClientForm-email', mel);
            await taper(page, '#newClientForm-taxId', 'NIF 084123456A / RCCM MA.BKO.2024.B.1234');
            await cliquer(page, /^Créer le client$/, { sel: 'button', parAria: false });
            await attendre(1100);
            const fenetre = await dialogueVisible(page);
            if (fenetre) { refus.push(`${nom} : fenêtre restée ouverte`); await page.keyboard.press('Escape'); await attendre(600); }
        }
        const stockes = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('costcalc:guest:clients') || '[]').filter((c) => /G3 tel/.test(c.name)).map((c) => ({ nom: c.name, tel: c.phone, mel: c.email, nif: c.taxId })); } catch (e) { return []; } });
        const tousStockes = essais.every(([nom, tel, mel]) => stockes.some((s) => s.nom === nom && s.tel === tel && s.mel === mel));
        cas('C058', 'Téléphones maliens (+223 …, 8 chiffres, 00223…), e-mails .ml / .com.ml et NIF/RCCM maliens acceptés et enregistrés tels quels',
            refus.length === 0 && tousStockes, `refus : ${refus.join(', ') || 'aucun'} ; stockés : ${JSON.stringify(stockes)}`);

        // 2. Montants avec espaces de milliers (saisie clavier).
        await aller(page, '#depenses');
        await cliquer(page, /^Nouvelle dépense$/, { sel: 'button', parAria: false });
        await attendre(700);
        await taper(page, '#dep_montant', '1 500 000');
        await attendre(300);
        const montant = await valeur(page, '#dep_montant');
        const ttc = await page.$eval('[data-dep-ttc]', (n) => n.textContent.replace(/[\s  ]+/g, ' ').trim()).catch(() => null);
        cas('C058', 'Montant tapé « 1 500 000 » (espaces de milliers) : compris comme 1 500 000', montant === '1500000' && /1 770 000/.test(ttc || ''), `valeur du champ « ${montant} », TTC affiché « ${ttc} »`);
        await cliquer(page, /^Annuler$/, { racine: 'form[aria-label="Nouvelle dépense"]', sel: 'button', parAria: false }).catch(() => {});

        // 3. Virgule décimale française dans un métré (saisie clavier).
        await aller(page, '#chiffrage');
        await taper(page, 'input[aria-label="Rechercher un ouvrage à ajouter"]', 'maçonnerie');
        await attendre(900);
        await cliquer(page, /Maçonnerie en Murs/, { sel: '[role="option"]', parAria: false });
        await attendre(1800);
        await taper(page, 'input[aria-label="Surface directe (m²)"]', '12,5');
        await page.keyboard.press('Tab');
        await attendre(500);
        const surface = await valeur(page, 'input[aria-label="Surface directe (m²)"]');
        cas('C058', `Virgule décimale « 12,5 » dans la surface (navigateur ${lang}) : comprise comme 12,5`, surface === '12.5', `valeur du champ « ${surface} »`);
        // 4. Matière : « Contenu d'un conditionnement » 2,5 (litres, m²…)
        await aller(page, '#materiaux');
        await cliquer(page, /^Nouvelle Matière$/, { parAria: false });
        await attendre(1100);
        const champContenu = await page.evaluate(() => {
            const l = [...document.querySelectorAll('label')].find((x) => /Contenu d.un conditionnement/i.test(x.innerText));
            const i = l && (l.htmlFor ? document.getElementById(l.htmlFor) : l.parentElement.querySelector('input'));
            if (!i) return false; i.setAttribute('data-g3-contenu', '1'); return true;
        });
        if (champContenu) {
            await taper(page, 'input[data-g3-contenu]', '2,5');
            await page.keyboard.press('Tab'); await attendre(300);
            const contenu = await valeur(page, 'input[data-g3-contenu]');
            cas('C058', 'Virgule décimale « 2,5 » dans « Contenu d\'un conditionnement » : comprise comme 2,5', contenu === '2.5', `valeur du champ « ${contenu} »`);
        } else nonExecute('C058', 'Matière : virgule décimale', 'champ « Contenu d\'un conditionnement » introuvable');

        // 5. Paramètres › Entreprise : formats légaux maliens + téléphone fixe.
        await aller(page, '#settings/entreprise');
        await taper(page, '#company_phone', '+223 20 22 33 44');
        await taper(page, '#company_nif', '084123456A');
        await taper(page, '#company_rccm', 'MA.BKO.2024.B.1234');
        await cliquerSel(page, 'button[aria-label="Enregistrer les paramètres de l\'entreprise"]');
        await attendre(1200);
        const invalides = await page.evaluate(() => [...document.querySelectorAll('#company_phone, #company_nif, #company_rccm')].filter((n) => !n.validity.valid).map((n) => n.id));
        const alerte = await page.evaluate(() => [...document.querySelectorAll('[role="alert"]')].filter((a) => a.getBoundingClientRect().width > 0).map((a) => a.innerText.trim()).join(' | '));
        await aller(page, '#dashboard');
        await aller(page, '#settings/entreprise');
        const relus = [await valeur(page, '#company_phone'), await valeur(page, '#company_nif'), await valeur(page, '#company_rccm')];
        cas('C058', 'Paramètres › Entreprise : téléphone fixe malien, NIF et RCCM au format malien acceptés et conservés',
            invalides.length === 0 && relus[0] === '+223 20 22 33 44' && relus[1] === '084123456A' && relus[2] === 'MA.BKO.2024.B.1234',
            `champs invalides : ${invalides.join(', ') || 'aucun'} ; alerte : ${alerte || 'aucune'} ; relus après navigation : ${JSON.stringify(relus)}`);
        const montantRegl = mesures['C058.reglementEspaces'];
        if (montantRegl !== undefined) cas('C058', 'Règlement de facture tapé « 100 000 » : compris comme 100 000', montantRegl === '100000', `valeur du champ « ${montantRegl} »`);
    } finally { await page.close(); }
}

// ════════════════════════════════════════════════════════════════════════════
// BLOC I — Textes longs (C048 : pas de traduction dans le produit)
// ════════════════════════════════════════════════════════════════════════════
async function blocTextesLongs(browser) {
    // Constat préalable : y a-t-il un choix de langue quelque part ?
    const page = await ouvrirDemo(browser, VP.d1440);
    let langue;
    try {
        langue = await page.evaluate(() => ({
            lang: document.documentElement.lang,
            selecteur: [...document.querySelectorAll('button, select, a, [role=option]')].some((b) => /\b(English|Anglais|Langue|Language|EN\b|FR\b)/.test(b.innerText || '') && b.getBoundingClientRect().width > 0)
        }));
        await aller(page, '#settings/entreprise');
        langue.selecteurParametres = await page.evaluate(() => /langue|language/i.test(document.body.innerText));
    } finally { await page.close(); }
    noter('C048.langue', langue);

    // Mesure complémentaire (pseudo-localisation +40 %) : à titre indicatif.
    const resultatsPseudo = [];
    for (const [nomVp, vp] of [['320', VP.m320], ['360', VP.m360], ['390', VP.m390], ['768', VP.t768], ['1024', VP.t1024], ['1440', VP.d1440]]) {
        const p = await ouvrirDemo(browser, vp);
        try {
            for (const route of ['#dashboard', '#factures', '#depenses']) {
                await aller(p, route);
                const r = await p.evaluate(() => {
                    const avant = document.documentElement.scrollWidth - document.documentElement.clientWidth;
                    const cibles = [...document.querySelectorAll('button, h1, h2, h3, label, [role=tab]')].filter((e) => e.getBoundingClientRect().width > 0);
                    for (const el of cibles) {
                        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
                        let n; while ((n = w.nextNode())) { const t = n.nodeValue; if (t.trim().length > 2) n.nodeValue = t + ' ' + 'ÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉ'.slice(0, Math.ceil(t.trim().length * 0.4)); }
                    }
                    const apres = document.documentElement.scrollWidth - document.documentElement.clientWidth;
                    const rognes = cibles.filter((el) => { const cs = getComputedStyle(el); return el.scrollWidth > el.clientWidth + 1 && (cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis' || cs.whiteSpace === 'nowrap'); }).length;
                    const sortants = cibles.filter((el) => { const r = el.getBoundingClientRect(); return r.right > window.innerWidth + 1; }).length;
                    return { avant, apres, rognes, sortants };
                });
                resultatsPseudo.push(`${nomVp}${route} : débordement page ${r.avant}→${r.apres}px, libellés rognés ${r.rognes}, hors écran ${r.sortants}`);
                if (route === '#dashboard' && ['320', '1440'].includes(nomVp)) await capture(p, `I-${nomVp}-pseudo-loc-40`);
            }
        } finally { await p.close(); }
    }
    noter('C048.pseudoLocalisation', resultatsPseudo);
    cas('C048', 'Le produit propose une autre langue que le français (préalable au contrôle)', langue.selecteur || langue.selecteurParametres,
        `html lang="${langue.lang}", sélecteur de langue visible : ${langue.selecteur ? 'oui' : 'non'}, « langue » dans Paramètres › Entreprise : ${langue.selecteurParametres ? 'oui' : 'non'} — mesure indicative +40 % : ${resultatsPseudo.join(' ; ')}`);
}

// ════════════════════════════════════════════════════════════════════════════
// BLOC J — Situation de travaux : saisir un % cumulé au clavier (C058)
// ════════════════════════════════════════════════════════════════════════════
async function blocSituation(browser) {
    const page = await ouvrirDemo(browser, VP.d1440);
    const lireLots = () => page.evaluate(() => [...document.querySelectorAll('[role="dialog"] tbody tr')].filter((tr) => tr.getBoundingClientRect().width > 0)
        .map((tr) => { const td = [...tr.querySelectorAll('td')]; const i = tr.querySelector('input[type=number]'); return { lot: td[0]?.innerText.trim(), deja: td[2]?.innerText.replace(/\s+/g, ' ').trim(), pct: i?.value, min: i?.min, cetteFacture: td[4]?.innerText.replace(/\s+/g, ' ').trim() }; }));
    const total = () => page.evaluate(() => { const d = [...document.querySelectorAll('[role="dialog"] div')].find((x) => /^Total HT de cette facture/.test(x.innerText.trim())); return d ? d.innerText.replace(/\s+/g, ' ').trim() : null; });
    // Effacer au clavier puis taper : ce que fait un utilisateur.
    const saisirPct = async (index, texte) => {
        const sel = `[role="dialog"] tbody tr:nth-child(${index + 1}) input[type="number"]`;
        await cliquerSel(page, sel);
        await page.keyboard.press('End');
        for (let k = 0; k < 4; k += 1) { await page.keyboard.press('Backspace'); await attendre(70); }
        await page.keyboard.type(texte, { delay: 60 });
        await attendre(250);
        return valeur(page, sel);
    };
    try {
        await aller(page, '#devis');
        await cliquer(page, /DEV-2026-001/, { sel: 'tbody tr, button', parAria: false });
        await attendre(1500);
        await cliquer(page, /^Convertir en facture$/, { parAria: false });
        await attendre(1300);
        await choisirOption(page, 'Type de facture', 'Situation de travaux');
        const lots = await lireLots();
        const saisis1 = [];
        for (let i = 0; i < lots.length; i += 1) saisis1.push(await saisirPct(i, '30'));
        const total1 = await total();
        await capture(page, 'J-1440-situation-1-30pc');
        await cliquer(page, /^Créer le brouillon$/, { sel: 'button', parAria: false });
        await attendre(2000);
        await cliquer(page, /^Émettre la facture/);
        await attendre(1000);
        await cliquer(page, /^Émettre$/, { sel: '[role="dialog"] button, [role="alertdialog"] button', parAria: false });
        await attendre(1800);
        // Seconde situation : on veut porter le premier lot à 50 % cumulés.
        await aller(page, '#devis');
        await cliquer(page, /DEV-2026-001/, { sel: 'tbody tr, button', parAria: false });
        await attendre(1500);
        const bouton = await cliquer(page, /^(Nouvelle situation|Convertir en facture)$/, { parAria: false });
        await attendre(1300);
        await choisirOption(page, 'Type de facture', 'Situation de travaux').catch(() => {});
        const avant = await lireLots();
        const affiche = await saisirPct(0, '50');
        const apres = await lireLots();
        const total2 = await total();
        await capture(page, 'J-1440-situation-2-saisie-50');
        noter('C058.situation', { saisis1, total1, bouton: bouton.texte, avant, affiche, apres, total2 });
        cas('C058', 'Situation n° 2 : effacer le % cumulé du lot 1 (30 % déjà facturés) et taper « 50 » donne 50 %',
            affiche === '50', `1re situation : % saisis ${JSON.stringify(saisis1)}, ${total1} ; 2e (« ${bouton.texte} ») lot « ${avant[0]?.lot} » min ${avant[0]?.min} : affiché « ${affiche} » après la frappe ; ligne « Cette facture » ${avant[0]?.cetteFacture} → ${apres[0]?.cetteFacture} ; ${total2}`);
        await cliquer(page, /^Annuler$/, { racine: '[role="dialog"]', sel: 'button', parAria: false }).catch(() => page.keyboard.press('Escape'));
    } finally { await page.close(); }
}

// ════════════════════════════════════════════════════════════════════════════
export async function run() {
    resultats.length = 0;
    await mkdir(PREUVES, { recursive: true });
    const { url, close } = await startServer();
    URL_BASE = url;
    const browser = await puppeteer.launch({ headless: true, protocolTimeout: 120000 });
    const blocs = [['A parcours', blocParcours], ['B création', blocCreation], ['C annuler', blocAnnuler], ['D statuts', blocStatuts],
        ['E états', blocEtats], ['F formats', blocFormats], ['G conditionnels', blocConditionnels], ['H marché', blocMarche], ['J situation', blocSituation], ['I textes longs', blocTextesLongs]];
    const filtre = process.env.G3_BLOCS ? process.env.G3_BLOCS.split(',') : null;
    try {
        for (const [nom, fn] of blocs) {
            if (filtre && !filtre.includes(nom[0])) continue;
            const t0 = Date.now();
            try { await fn(browser); } catch (e) {
                resultats.push({ label: `[bloc ${nom}] interrompu`, pass: false, detail: `BLOQUÉ — ${String(e.message || e).slice(0, 300)}` });
            }
            console.log(`  (bloc ${nom} : ${Math.round((Date.now() - t0) / 1000)} s)`);
        }
    } finally {
        await browser.close();
        await close();
    }
    resultats.push({ label: '[environnement] aucune requête hors 127.0.0.1 n\'a abouti (toutes bloquées)', pass: true, detail: `${externesBloquees.length} tentative(s) bloquée(s) : ${[...new Set(externesBloquees)].join(', ') || 'aucune'}` });
    resultats.push({ label: '[environnement] aucune erreur JavaScript pendant les parcours', pass: erreursPage.length === 0, detail: erreursPage.slice(0, 5).join(' | ') || 'aucune' });
    noter('environnement.recouvrements', [...new Set(recouvrements)]);
    return resultats.slice();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const r = await run();
    for (const x of r) console.log(`  ${x.pass ? '✅' : '❌'} ${x.label}${x.detail ? ' — ' + x.detail : ''}`);
    console.log('\nMESURES ' + JSON.stringify(mesures, (k, v) => (v instanceof Set ? [...v] : v), 1));
    process.exit(0);
}
