#!/usr/bin/env node
// Audit UX 220 — groupe G9 « fichiers & facturation » : contrôles C161 à
// C170, C173, C175, C176, C179, C180.
//
// Mode Démo uniquement, serveur isolé 127.0.0.1 (startServer, port libre),
// config factice (config.example.js), toute requête hors 127.0.0.1 BLOQUÉE.
// Les téléchargements produits PAR L'APPLICATION (CSV, PDF, modèles) sont
// autorisés vers un dossier temporaire jetable (os.tmpdir), lus pour
// vérifier nom et contenu, puis supprimés : c'est l'objet même de C168.
// Les fichiers choisis (bordereaux, CSV matières, logos) sont des fixtures
// FICTIVES générées par la sonde dans ce même dossier temporaire et passées
// par le vrai sélecteur de fichiers (page.waitForFileChooser), comme le
// ferait un utilisateur.
//
// Interaction « utilisateur » : clics réels (ElementHandle.click → souris aux
// coordonnées), page.keyboard pour la saisie de texte ; seuls les
// <input type=number> passent par le setter natif + événement input (piège
// connu). Les mesures portent sur ce qui est rendu (rectangles, styles
// calculés, texte visible), le stockage local et les fichiers produits.
//
//   node tests/ux/controles/G9-fichiers-facturation.mjs [section…]
//   sections : bordereau materiaux factures devise logo mobile
import puppeteer from 'puppeteer';
import { readFile, writeFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { startServer } from '../../../scratch/lib/server.mjs';

const CONFIG = await readFile(new URL('../../../config.example.js', import.meta.url), 'utf8');
const MODELE_BORDEREAU = await readFile(new URL('../../../assets/templates/bordereau-ikadevis.csv', import.meta.url));
const PREUVES = fileURLToPath(new URL('../../../docs/audit-ux-220/UX_EVIDENCE/G9-fichiers-facturation/', import.meta.url));
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const AUJOURDHUI = new Date();

// ─── Fixtures fictives ──────────────────────────────────────────────────────
function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let n = 0; n < buf.length; n++) {
        let c = (crc ^ buf[n]) & 0xFF;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunkPng(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
}
// PNG RGBA minimal (aucune dépendance) : fond transparent, rectangle plein.
function png(w, h, [r, g, b]) {
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) {
        raw[y * (w * 4 + 1)] = 0;
        for (let x = 0; x < w; x++) {
            const dedans = x >= w * 0.2 && x < w * 0.8 && y >= h * 0.2 && y < h * 0.8;
            const o = y * (w * 4 + 1) + 1 + x * 4;
            raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = dedans ? 255 : 0;
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunkPng('IHDR', ihdr),
        chunkPng('IDAT', zlib.deflateSync(raw)), chunkPng('IEND', Buffer.alloc(0))]);
}
// Encodage « ANSI » d'Excel FR sous Windows (Windows-1252).
const CP1252 = { '€': 0x80, '’': 0x92, 'œ': 0x9C, 'Œ': 0x8C, '…': 0x85, '«': 0xAB, '»': 0xBB };
function enCp1252(s) {
    return Buffer.from([...s].map((ch) => {
        if (CP1252[ch] !== undefined) return CP1252[ch];
        const c = ch.codePointAt(0);
        if (c < 0x100) return c;
        return 0x3F;
    }));
}
const BOM = '﻿';
const ENTETE_MAT = 'Nom;Catégorie;Unité Achat;Taille Unité;Unité Calcul;Prix Achat;Perte (%)';

async function preparerFixtures(dossier) {
    const f = {};
    const ecrire = async (nom, contenu, sous = '') => {
        const d = path.join(dossier, sous); await mkdir(d, { recursive: true });
        const p = path.join(d, nom); await writeFile(p, contenu); return p;
    };
    f.modeleBordereau = await ecrire('bordereau-ikadevis.csv', MODELE_BORDEREAU);
    f.erreurs = await ecrire('bordereau-erreurs.csv', BOM + [
        'Lot;Désignation;Unité;Quantité;PU HT;Montant HT',
        'Gros œuvre;Béton de propreté;m3;2,5;65000;162500',
        'Gros œuvre;Chape ciment;;40;4500;180000',
        'Gros œuvre;Enduit ciment;m2;abc;3000;',
        'Menuiserie;Porte bois;u;2;85000;200000',
        'Menuiserie;Fenêtre alu;u;3;-12000;'
    ].join('\r\n'));
    f.cp1252 = await ecrire('bordereau-excel-windows.csv', enCp1252([
        'Lot;Désignation;Unité;Quantité;PU HT',
        'Gros œuvre;Béton armé dosé à 350 kg;m³;2;65000',
        'Électricité;Câble électrique 2,5 mm²;ml;120;850'
    ].join('\r\n')));
    const lignes = ['Lot;Désignation;Unité;Quantité;PU HT;Coût unitaire'];
    const lots = ['Terrassement', 'Gros œuvre', 'Charpente & couverture', 'Menuiseries extérieures', 'Finitions intérieures'];
    for (let i = 1; i <= 150; i++) {
        const lot = lots[Math.floor((i - 1) / 30)];
        lignes.push(`${lot};Poste ${String(i).padStart(3, '0')} — fourniture et pose conforme au CCTP, y compris toutes sujétions de mise en œuvre;${i % 3 ? 'm2' : 'u'};${(i % 7) + 1},5;${1000 + i * 37};${700 + i * 20}`);
    }
    f.long = await ecrire('bordereau-long.csv', BOM + lignes.join('\r\n'));
    f.tropGros = await ecrire('bordereau-trop-gros.csv', 'Lot;Désignation;Unité;Quantité;PU HT\r\n' + 'Lot A;Ligne de remplissage pour dépasser la limite;u;1;1000\r\n'.repeat(98000));
    f.pdf = await ecrire('devis-scanne.pdf', '%PDF-1.4\n% fichier fictif\n');
    f.matVide = await ecrire('materiaux.csv', BOM + ENTETE_MAT + '\r\n', 'a');
    f.matPartiel = await ecrire('materiaux.csv', BOM + [ENTETE_MAT,
        'Fer à béton HA 10 (audit);Fer;Barre (12m);12;m;5200;3',
        'Gravier concassé 5/15 (audit);BTP;Tonne;1;t;18000;5',
        'Sable de dune lavé (audit);BTP;Tonne;1;t;9000;5',
        'Ciment CPJ 42.5 pour mortier de pose;BTP;Sac (50kg);50;kg;5200;2',
        'Tuyau PVC 100 (audit);Plomberie;Barre (6m);6;m;0;0',
        'Colle PVC (audit);Plomberie;Pot;1;u;;0',
        'Treillis soudé (audit);Fer;Panneau;1;u;15000;80',
        'A;Divers;Unité;1;u;1000;0'
    ].join('\r\n'), 'b');
    f.matSpeciaux = await ecrire('materiaux-speciaux.csv', BOM + [ENTETE_MAT,
        '"Tube PVC 1/2"" pression (audit)";Plomberie;Barre (4m);4;m;2500;0',
        'Vis TF #8 inox (audit);Quincaillerie;Boîte (100);100;u;3500;0',
        'Joint silicone (audit);Quincaillerie;Cartouche;1;u;2800;0'
    ].join('\r\n'));
    f.mat1252 = await ecrire('materiaux-excel-windows.csv', enCp1252([ENTETE_MAT,
        'Câble électrique 2,5 mm² (audit);Électricité;Rouleau (100m);100;m;45000;2'
    ].join('\r\n')));
    f.matRemplacement = await ecrire('materiaux-remplacement.csv', BOM + [ENTETE_MAT,
        'Peinture façade (audit);Peinture;Pot (20L);20;L;60000;5',
        'Enduit de façade (audit);Peinture;Sac (25kg);25;kg;9000;5'
    ].join('\r\n'));
    f.logoRouge = await ecrire('logo-rouge.png', png(160, 80, [220, 30, 30]));
    f.logoBleu = await ecrire('logo-bleu.png', png(160, 80, [30, 60, 220]));
    f.logoFaux = await ecrire('logo-corrompu.png', 'ceci n’est pas une image');
    return f;
}

// Classeur Excel fictif (première feuille vide, bordereau en seconde) produit
// avec la bibliothèque SheetJS livrée par l'application elle-même.
async function fabriquerXlsx(url, dossier) {
    // Navigateur séparé : sinon la bibliothèque resterait en cache mémoire et
    // l'application ne la rechargerait pas (progression non observable).
    const navigateur = await puppeteer.launch({ headless: true });
    const p = await navigateur.newPage();
    try {
        await p.setContent('<!doctype html><title>fixture</title>');
        await p.addScriptTag({ url: url + '/js/vendor/xlsx-0.20.3.min.js' });
        const b64 = await p.evaluate(() => {
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), 'Couverture');
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
                ['Lot', 'Désignation', 'Unité', 'Quantité', 'PU HT'],
                ['Gros œuvre', 'Béton de propreté', 'm3', 2.5, 65000],
                ['Gros œuvre', 'Maçonnerie agglos', 'm2', 80, 8500]
            ]), 'Bordereau');
            return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
        });
        const chemin = path.join(dossier, 'bordereau-classeur.xlsx');
        await writeFile(chemin, Buffer.from(b64, 'base64'));
        return chemin;
    } finally { await navigateur.close(); }
}

// ─── Session isolée ─────────────────────────────────────────────────────────
async function ouvrirSession({ width = 1440, height = 900, graine = null } = {}) {
    const { url, close } = await startServer();
    const navigateur = await puppeteer.launch({ headless: true, args: ['--lang=fr-FR'], protocolTimeout: 240000 });
    const dossier = await mkdtemp(path.join(os.tmpdir(), 'ikadevis-g9-'));
    const telechargements = path.join(dossier, 'telechargements');
    await mkdir(telechargements, { recursive: true });
    const page = await navigateur.newPage();
    page.setDefaultTimeout(45000);
    // Le service worker de l'app servirait les bibliothèques (xlsx, jsPDF) hors
    // de l'interception : on le contourne pour que blocages et délais simulés
    // s'appliquent, et que la règle « aucune requête hors 127.0.0.1 » couvre tout.
    await page.setBypassServiceWorker(true);
    await page.setViewport({ width, height });
    const cdp = await navigateur.target().createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: telechargements });
    const etat = { bloquer: new Set(), retarder: {}, externes: [], dialoguesNatifs: [] };
    await page.setRequestInterception(true);
    page.on('request', (r) => {
        let u;
        try { u = new URL(r.url()); } catch (e) { return r.continue(); }
        if (u.pathname === '/config.js') return r.respond({ contentType: 'application/javascript', body: CONFIG });
        if (/^https?:$/.test(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname)) { etat.externes.push(u.hostname); return r.abort(); }
        if ([...etat.bloquer].some((p) => u.pathname.endsWith(p))) return r.abort();
        const d = Object.entries(etat.retarder).find(([p]) => u.pathname.endsWith(p));
        if (d) { setTimeout(() => r.continue().catch(() => {}), d[1]); return; }
        r.continue();
    });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));
    page.on('dialog', async (d) => { etat.dialoguesNatifs.push(d.message()); await d.dismiss(); });
    // Mémorise chaque message d'état (toast, alerte) au moment où il apparaît.
    await page.evaluateOnNewDocument(() => {
        window.__messages = [];
        const noter = (n) => {
            if (!n || n.nodeType !== 1) return;
            const cibles = [n, ...n.querySelectorAll('[role=status],[role=alert]')].filter((e) => e.matches('[role=status],[role=alert]'));
            for (const e of cibles) { const t = (e.innerText || e.textContent || '').trim(); if (t) window.__messages.push(t); }
        };
        new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach(noter))).observe(document, { childList: true, subtree: true });
    });
    await page.goto(url + '/index.html', { waitUntil: 'networkidle0', timeout: 90000 });
    await page.evaluate(() => localStorage.clear());
    if (graine) await page.evaluate(graine);
    await page.reload({ waitUntil: 'networkidle0', timeout: 90000 });
    const f = await preparerFixtures(dossier);
    const vus = new Set();
    return {
        url, page, navigateur, dossier, telechargements, etat, erreurs, f, vus,
        fermer: async () => { try { await navigateur.close(); } catch (e) { /* déjà fermé */ } await close(); await rm(dossier, { recursive: true, force: true }); }
    };
}

async function entrerEnDemo(page) {
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Essayer sans compte'), { timeout: 30000 });
    await cliquer(page, /^Essayer sans compte$/, { sel: 'button' });
    await attendre(2800);
    await page.waitForFunction(() => !document.querySelector('.animate-page-spin') && /Tableau de bord|TABLEAU DE BORD/.test(document.body.innerText), { timeout: 30000 });
}
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendre(1500); }

// ─── Interaction ────────────────────────────────────────────────────────────
const SEL = 'button, a, [role="option"], [role="tab"], [role="button"], tbody tr, summary, label';
async function trouver(page, re, { sel = SEL, dans = null } = {}) {
    const h = await page.evaluateHandle((src, flags, sel, dans) => {
        const r = new RegExp(src, flags);
        const racine = dans ? document.querySelector(dans) : document;
        if (!racine) return null;
        return [...racine.querySelectorAll(sel)].filter((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0; })
            .find((x) => r.test((x.getAttribute('aria-label') || '').trim()) || r.test((x.innerText || '').replace(/\s+/g, ' ').trim())) || null;
    }, re.source, re.flags, sel, dans);
    const e = h.asElement();
    if (!e) { await h.dispose(); return null; }
    return e;
}
async function cliquer(page, re, opts = {}) {
    const e = await trouver(page, re, opts);
    if (!e) throw new Error(`Introuvable : ${re}`);
    await e.click();
    await e.dispose();
}
async function cliquerSiPresent(page, re, opts = {}) {
    const e = await trouver(page, re, opts);
    if (!e) return false;
    await e.click(); await e.dispose(); return true;
}
async function saisirNombre(page, selecteur, valeur) {
    await page.evaluate((s, v) => {
        const c = document.querySelector(s);
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(c, String(v));
        c.dispatchEvent(new Event('input', { bubbles: true }));
    }, selecteur, valeur);
}
async function saisirNombreEl(page, el, valeur) {
    await page.evaluate((c, v) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(c, String(v));
        c.dispatchEvent(new Event('input', { bubbles: true }));
    }, el, valeur);
}
async function taper(page, selecteur, texte) {
    const e = await page.waitForSelector(selecteur, { visible: true });
    await e.click({ clickCount: 3 });
    await page.keyboard.type(texte, { delay: 15 });
    await e.dispose();
}
async function choisirFichier(page, cible, chemins) {
    const el = typeof cible === 'string' ? await page.$(cible) : cible;
    if (!el) throw new Error(`Champ fichier introuvable : ${cible}`);
    const [fc] = await Promise.all([page.waitForFileChooser({ timeout: 15000 }), el.click()]);
    await fc.accept(Array.isArray(chemins) ? chemins : [chemins]);
}
async function choisirOption(page, libelleBouton, reOption) {
    await cliquer(page, libelleBouton, { sel: 'button' });
    await attendre(450);
    await cliquer(page, reOption, { sel: '[role="option"]' });
    await attendre(500);
}
const messages = (page) => page.evaluate(() => (window.__messages || []).slice());
const viderMessages = (page) => page.evaluate(() => { window.__messages = []; });
const texteVisible = (page, sel = 'body') => page.evaluate((s) => document.querySelector(s)?.innerText || '', sel);
async function attendreFichier(s, delai = 60000) {
    const fin = Date.now() + delai;
    while (Date.now() < fin) {
        const noms = (await readdir(s.telechargements)).filter((n) => !n.endsWith('.crdownload') && !s.vus.has(n));
        if (noms.length) {
            await attendre(600);
            const nom = noms[0];
            const contenu = await readFile(path.join(s.telechargements, nom));
            // Retiré aussitôt : un 2e export du même nom ne doit pas être confondu.
            await rm(path.join(s.telechargements, nom), { force: true });
            return { nom, contenu };
        }
        await attendre(300);
    }
    return null;
}
async function capture(page, nom) {
    await mkdir(PREUVES, { recursive: true });
    await page.screenshot({ path: path.join(PREUVES, `${nom}.png`) });
    return `UX_EVIDENCE/G9-fichiers-facturation/${nom}.png`;
}
// Analyse CSV « ; » avec guillemets (RFC 4180).
function lireCsv(texte, sep = ';') {
    const src = texte.replace(/^﻿/, ''); const lignes = []; let ligne = [], cel = '', q = false;
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (c === '"') { if (q && src[i + 1] === '"') { cel += '"'; i++; } else q = !q; }
        else if (!q && c === sep) { ligne.push(cel); cel = ''; }
        else if (!q && (c === '\n' || c === '\r')) { if (c === '\r' && src[i + 1] === '\n') i++; ligne.push(cel); lignes.push(ligne); ligne = []; cel = ''; }
        else cel += c;
    }
    if (cel || ligne.length) { ligne.push(cel); lignes.push(ligne); }
    return { lignes, guillemetsOuverts: q };
}
function analyserPdf(donnees) {
    const buf = Buffer.from(donnees);
    const s = buf.toString('latin1');
    // Contenu des flux : en clair (jsPDF) ou compressé (Chrome/Skia).
    const flux = [];
    for (const m of s.matchAll(/stream\r?\n/g)) {
        const debut = m.index + m[0].length; const fin = s.indexOf('endstream', debut);
        if (fin < 0) continue;
        const brut = buf.subarray(debut, fin);
        try { flux.push(zlib.inflateSync(brut).toString('latin1')); } catch (e) { flux.push(brut.toString('latin1')); }
    }
    const blocsTexte = flux.reduce((n, f) => n + (f.match(/\bBT\b/g) || []).length, 0);
    // Chaînes littérales passées à Tj/TJ (lisibles quand la police est standard).
    const chaines = flux.flatMap((f) => [...f.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map((x) => x[1]));
    const compte = [...s.matchAll(/\/Count (\d+)/g)].map((x) => Number(x[1]));
    return {
        entete: s.slice(0, 5), octets: buf.length,
        pages: compte.length ? Math.max(...compte) : (s.match(/\/Type\s*\/Page(?![s\w])/g) || []).length,
        images: (s.match(/\/Subtype\s*\/Image/g) || []).length,
        largeursImages: [...s.matchAll(/\/Width (\d+)/g)].map((x) => Number(x[1])),
        blocsTexte, chaines
    };
}
// Style et position d'un texte rendu (premier élément feuille qui le porte).
async function mesurerTexte(page, re, dans = 'body') {
    return page.evaluate((src, flags, dans) => {
        const r = new RegExp(src, flags);
        const racine = document.querySelector(dans) || document.body;
        const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]]; };
        const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const el = [...racine.querySelectorAll('*')].filter((e) => r.test(e.innerText || '') && ![...e.children].some((c) => r.test(c.innerText || '')))
            .find((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; });
        if (!el) return null;
        const cs = getComputedStyle(el); const fg = parse(cs.color);
        let n = el, bg = null;
        while (n && n.nodeType === 1) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c[3] > 0.9) { bg = c; break; } n = n.parentElement; }
        bg = bg || [255, 255, 255, 1];
        const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
        const b = el.getBoundingClientRect();
        return { texte: el.innerText.trim().slice(0, 160), taille: parseFloat(cs.fontSize), contraste: Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100,
            haut: Math.round(b.top), bas: Math.round(b.bottom), gauche: Math.round(b.left), droite: Math.round(b.right),
            dansFenetre: b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth };
    }, re.source, re.flags, dans);
}
// Branche une sonde sur html2canvas et jsPDF (bibliothèques livrées par l'app)
// pour mesurer la capture et le découpage en pages du PDF généré.
async function brancherSondePdf(page, url) {
    await page.evaluate(async (base) => {
        const charger = (src) => new Promise((ok, ko) => { const sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = ko; document.head.appendChild(sc); });
        if (!window.html2canvas) await charger(base + '/vendor/html2canvas.min.js');
        if (!window.jspdf) await charger(base + '/vendor/jspdf.umd.min.js');
        if (window.__sondePdf) { window.__sondePdf.captures = []; window.__sondePdf.images = []; return; }
        window.__sondePdf = { captures: [], images: [] };
        const h2c = window.html2canvas;
        window.html2canvas = async function (el, opts) {
            const c = await h2c.apply(this, arguments);
            try { window.__sondePdf.captures.push({ w: c.width, h: c.height, elW: el.scrollWidth, elH: el.scrollHeight, echelle: (opts && opts.scale) || 1 }); window.__sondePdf.canvas = c; } catch (e) { /* mesure seule */ }
            return c;
        };
        const api = window.jspdf.jsPDF.API; const ajouter = api.addImage;
        api.addImage = function (img, fmt, x, y, w, h) {
            window.__sondePdf.images.push({ x, y, w, h, pageL: this.internal.pageSize.getWidth(), pageH: this.internal.pageSize.getHeight() });
            return ajouter.apply(this, arguments);
        };
    }, url);
}
async function lireSondePdf(page) {
    return page.evaluate(() => {
        const s = window.__sondePdf; const c = s && s.canvas;
        if (!c || !s.images.length) return null;
        const pxParMm = c.width / s.images[0].w;
        const ctx = c.getContext('2d');
        const inset = Math.max(3, Math.round(c.width * 0.02)); const larg = c.width - inset * 2;
        let y = 0; const coupures = [];
        s.images.forEach((im, i) => {
            y += Math.round(im.h * pxParMm);
            if (i < s.images.length - 1) {
                const d = ctx.getImageData(inset, Math.max(0, y - 1), larg, 1).data;
                let uniforme = true;
                for (let x = 1; x < larg; x++) { const k = x * 4; if (d[k] !== d[0] || d[k + 1] !== d[1] || d[k + 2] !== d[2]) { uniforme = false; break; } }
                coupures.push({ y, uniforme });
            }
        });
        const cap = s.captures[s.captures.length - 1];
        const debordeLargeur = s.images.some((im) => im.x < 0 || im.x + im.w > im.pageL + 0.5);
        const debordeHauteur = s.images.some((im) => im.y < 0 || im.y + im.h > im.pageH + 0.5);
        return { capture: cap, pages: s.images.length, hauteurDecoupee: y, hauteurCanvas: c.height, coupures, debordeLargeur, debordeHauteur };
    });
}

// ════════════════════════════════════════════════════════════════════════════
// Section 1 — Import de bordereau (éditeur de devis), 1440 × 900
// C161, C162, C163, C164, C165, C166, C168, C169, C170
// ════════════════════════════════════════════════════════════════════════════
async function sectionBordereau(ok) {
    const s = await ouvrirSession({ width: 1440, height: 900 });
    const { page } = s;
    const DLG = '[aria-labelledby="quote-import-title"]';
    try {
        await entrerEnDemo(page);
        s.f.xlsx = await fabriquerXlsx(s.url, s.dossier);
        await aller(page, '#chiffrage');
        await cliquer(page, /^Importer Excel \/ CSV$/, { sel: 'button' });
        await page.waitForSelector(DLG, { visible: true });
        await attendre(500);

        // C161 — formats et limites lisibles AVANT de choisir le fichier.
        const libelle = await mesurerTexte(page, /^Fichier Excel ou CSV$/, DLG);
        const limites = await mesurerTexte(page, /5 Mo maximum/, DLG);
        const champ = await page.$eval(`${DLG} input[type=file]`, (i) => ({ accept: i.accept, decrit: i.getAttribute('aria-describedby') }));
        ok('[C161] Bordereau 1440 : « Fichier Excel ou CSV » et « 5 Mo maximum · 1 000 lignes » visibles avant sélection',
            libelle?.dansFenetre && limites?.dansFenetre && /1 000 lignes/.test(limites.texte) && limites.contraste >= 4.5,
            `aide « ${limites?.texte} » ${limites?.taille}px contraste ${limites?.contraste}:1 · accept="${champ.accept}" · aria-describedby=${champ.decrit}`);
        const encodageAnnonce = /UTF|encodage/i.test(await texteVisible(page, DLG));
        ok('[C161] Bordereau : l’encodage attendu d’un CSV (UTF-8) est annoncé avant sélection', encodageAnnonce,
            encodageAnnonce ? 'mentionné' : 'aucune mention d’encodage — conséquence mesurée en C164 (CSV Excel Windows-1252)');
        await capture(page, 'c161-bordereau-avant-selection-1440');

        // C168 — le modèle de bordereau proposé est exploitable et bien nommé.
        await cliquer(page, /^Télécharger un modèle de bordereau$/, { sel: 'a', dans: DLG });
        const modele = await attendreFichier(s, 20000);
        const modeleCsv = modele ? lireCsv(modele.contenu.toString('utf8')) : null;
        ok('[C168] Modèle de bordereau : fichier « bordereau-ikadevis.csv », BOM UTF-8, 7 colonnes sur chaque ligne',
            modele?.nom === 'bordereau-ikadevis.csv' && modele.contenu[0] === 0xEF && modeleCsv.lignes.filter((l) => l.length > 1).every((l) => l.length === 7),
            modele ? `${modele.nom} · ${modele.contenu.length} o · lignes ${modeleCsv.lignes.length}` : 'aucun fichier reçu');

        // C162 — progression et annulation pendant la lecture d'un classeur Excel.
        s.etat.retarder['xlsx-0.20.3.min.js'] = 3000;
        await choisirFichier(page, `${DLG} input[type=file]`, s.f.xlsx);
        await attendre(500);
        const pendant = await page.evaluate((d) => ({
            statut: [...document.querySelectorAll(`${d} [role=status]`)].map((e) => e.innerText.trim()).join(' | '),
            desactive: document.querySelector(`${d} input[type=file]`)?.disabled,
            fermer: !!document.querySelector(`${d} button[aria-label="Fermer l’import"]`)
        }), DLG);
        ok('[C162] Lecture d’un classeur : progression annoncée (role=status) et champ fichier verrouillé',
            /Lecture du fichier/.test(pendant.statut) && pendant.desactive === true, JSON.stringify(pendant));
        await cliquer(page, /^Fermer l’import$/, { sel: 'button', dans: DLG });
        await attendre(3800);
        delete s.etat.retarder['xlsx-0.20.3.min.js'];
        const apresAnnulation = await page.evaluate((d) => ({ ouvert: !!document.querySelector(d), alertes: [...document.querySelectorAll('[role=alert]')].map((e) => e.innerText.trim()) }), DLG);
        await cliquer(page, /^Importer Excel \/ CSV$/, { sel: 'button' });
        await page.waitForSelector(DLG, { visible: true });
        await attendre(500);
        const pied0 = await page.$eval(`${DLG} footer`, (f) => f.innerText.replace(/\s+/g, ' '));
        ok('[C162] Annulation pendant la lecture : fenêtre fermée, aucun résultat tardif, réouverture vierge',
            !apresAnnulation.ouvert && apresAnnulation.alertes.length === 0 && /^0 ligne\(s\)/.test(pied0), `après fermeture ${JSON.stringify(apresAnnulation)} · pied à la réouverture « ${pied0} »`);

        // C164/C165 — classeur dont la 1re feuille est vide : choix de la feuille.
        await choisirFichier(page, `${DLG} input[type=file]`, s.f.xlsx);
        await page.waitForFunction((d) => /Cette feuille est vide|Choisir une autre feuille/.test(document.querySelector(d)?.innerText || ''), { timeout: 20000 }, DLG);
        const feuilleVide = await texteVisible(page, DLG);
        const selectFeuille = await trouver(page, /Choisir une autre feuille/, { sel: 'label', dans: DLG });
        let lignesXlsx = 0;
        if (selectFeuille) {
            const sel = await selectFeuille.$('select'); await sel.select('1'); await attendre(800);
            lignesXlsx = await page.$$eval(`${DLG} input[aria-label^="Inclure la ligne"]`, (l) => l.filter((x) => x.getBoundingClientRect().width > 0).length);
        }
        ok('[C164] Classeur Excel à feuille vide : message « Cette feuille est vide… » et choix d’une autre feuille, puis aperçu des 2 lignes',
            /Cette feuille est vide\. Choisissez une autre feuille/.test(feuilleVide) && lignesXlsx === 2, `lignes affichées après choix de « Bordereau » : ${lignesXlsx}`);

        // C161/C162/C164 — type refusé, puis fichier trop gros, puis nouvelle tentative.
        await choisirFichier(page, `${DLG} input[type=file]`, s.f.pdf);
        await attendre(900);
        const errPdf = await page.$$eval(`${DLG} [role=alert]`, (l) => l.map((e) => e.innerText.trim()).join(' | '));
        await choisirFichier(page, `${DLG} input[type=file]`, s.f.tropGros);
        await attendre(1200);
        const errGros = await page.$$eval(`${DLG} [role=alert]`, (l) => l.map((e) => e.innerText.trim()).join(' | '));
        ok('[C161] Limites annoncées = limites appliquées : PDF refusé (formats acceptés rappelés), fichier de 5,3 Mo refusé (« 5 Mo »)',
            /Excel \(\.xlsx, \.xls\) ou CSV/.test(errPdf) && /5 Mo/.test(errGros), `PDF → « ${errPdf} » · 5,3 Mo → « ${errGros} »`);
        await choisirFichier(page, `${DLG} input[type=file]`, s.f.erreurs);
        await attendre(1200);
        const apresReprise = await page.evaluate((d) => ({ alertes: [...document.querySelectorAll(`${d} p[role=alert]`)].map((e) => e.innerText.trim()), lignes: document.querySelectorAll(`${d} table input[aria-label^="Inclure la ligne"]`).length }), DLG);
        ok('[C162] Nouvelle tentative : choisir un autre fichier efface l’erreur précédente et relance l’analyse',
            apresReprise.alertes.length === 0 && apresReprise.lignes === 5, JSON.stringify(apresReprise));

        // C164 — erreurs par ligne : où, quoi, comment corriger.
        const parLigne = await page.$$eval(`${DLG} table tbody tr`, (trs) => trs.map((tr) => ({
            n: Number(tr.querySelector('input[aria-label^="Inclure la ligne"]')?.getAttribute('aria-label').match(/\d+/)[0]),
            probleme: tr.querySelector('p.text-red-700')?.innerText.trim() || '',
            surligne: getComputedStyle(tr).backgroundColor
        })));
        const attendus = { 3: /Unité manquante/, 4: /Quantité positive requise/, 5: /ne correspond pas à quantité × prix/, 6: /Prix HT invalide/ };
        const toutesNommees = Object.entries(attendus).every(([n, re]) => re.test(parLigne.find((l) => l.n === Number(n))?.probleme || ''));
        ok('[C164] Bordereau : chaque ligne fautive porte son numéro de ligne Excel et la nature du problème',
            toutesNommees && !parLigne.find((l) => l.n === 2).probleme, parLigne.map((l) => `L${l.n} ${l.probleme || 'OK'}`).join(' · '));
        await cliquer(page, /J’ai vérifié les lignes/, { sel: 'label', dans: DLG });
        await attendre(400);
        const blocage = await page.evaluate((d) => {
            const dlg = document.querySelector(d);
            const b = [...dlg.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Ajouter au devis');
            const t = dlg.innerText;
            return { desactive: b.disabled, resume: (t.match(/\d+ ligne\(s\) (?:à corriger|en erreur|invalide|bloquante)[^\n]*/) || [''])[0],
                pied: dlg.querySelector('footer').innerText.replace(/\s+/g, ' '), raisonPresDuBouton: /corrig|erreur|bloqu|décoch/i.test(dlg.querySelector('footer').innerText) };
        }, DLG);
        await capture(page, 'c164-bordereau-erreurs-1440');
        ok('[C164] Bouton « Ajouter au devis » bloqué : la raison et le nombre de lignes à corriger sont dits près du bouton',
            blocage.desactive && (blocage.resume || blocage.raisonPresDuBouton),
            `bouton désactivé=${blocage.desactive} · résumé trouvé « ${blocage.resume} » · pied « ${blocage.pied} »`);

        // C165/C166 — exclure les 4 lignes fautives, valider, appliquer.
        for (const n of [3, 4, 5, 6]) {
            const cb = await page.$(`${DLG} table input[aria-label="Inclure la ligne ${n}"]`);
            await cb.click(); await cb.dispose(); await attendre(250);
        }
        const piedExclu = await page.$eval(`${DLG} footer`, (f) => f.innerText.replace(/\s+/g, ' '));
        const ack = await page.$eval(`${DLG}`, (d) => [...d.querySelectorAll('input[type=checkbox]')].find((c) => /J’ai vérifié/.test(c.parentElement.innerText))?.checked);
        await cliquer(page, /J’ai vérifié les lignes/, { sel: 'label', dans: DLG });
        await attendre(400);
        const nbDevisAvant = await page.evaluate(() => JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]').length);
        await viderMessages(page);
        await cliquer(page, /^Ajouter au devis$/, { sel: 'button', dans: DLG });
        await attendre(1500);
        const apres = await page.evaluate(() => ({
            ouvert: !!document.querySelector('[aria-labelledby="quote-import-title"]'),
            ligne: /Béton de propreté/.test(document.body.innerText) || [...document.querySelectorAll('input, textarea')].some((i) => /Béton de propreté/.test(i.value)),
            nonEnregistre: /non enregistr/i.test(document.body.innerText),
            devis: JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]').length
        }));
        const msgImport = (await messages(page)).join(' | ');
        ok('[C165] Aperçu → validation (case « J’ai vérifié », décochée à chaque changement) → application au devis en cours, sans enregistrement implicite',
            /1 ligne\(s\)/.test(piedExclu) && /4 ligne\(s\) exclue\(s\)/.test(piedExclu) && ack === false && !apres.ouvert && apres.ligne && apres.devis === nbDevisAvant && apres.nonEnregistre,
            `pied avant application « ${piedExclu} » · case remise à zéro=${ack === false} · devis enregistrés ${nbDevisAvant}→${apres.devis} · « non enregistré » affiché=${apres.nonEnregistre}`);
        ok('[C166] Import partiel volontaire : lignes gardées et exclues annoncées AVANT application ; message final = lots seulement',
            /4 ligne\(s\) exclue\(s\)/.test(piedExclu), `message après application : « ${msgImport} »`);

        // Bordereau long (150 lignes) → devis enregistré → PDF, impression.
        await cliquer(page, /^Importer Excel \/ CSV$/, { sel: 'button' });
        await page.waitForSelector(DLG, { visible: true });
        await choisirFichier(page, `${DLG} input[type=file]`, s.f.long);
        await attendre(2000);
        await cliquer(page, /J’ai vérifié les lignes/, { sel: 'label', dans: DLG });
        await attendre(500);
        await cliquer(page, /^Ajouter au devis$/, { sel: 'button', dans: DLG });
        await attendre(2000);
        await taper(page, 'input[aria-label^="Client du devis"]', 'SARL Bordereau Audit');
        await attendre(900);
        await cliquer(page, /^Créer « SARL Bordereau Audit »$/, { sel: '[role="option"]' });
        await attendre(1200);
        await cliquer(page, /^Créer le client$/, { sel: 'button' });
        await attendre(1500);
        await cliquer(page, /^Enregistrer$/, { sel: 'button' });
        await attendre(2500);
        const sauve = await page.evaluate(() => {
            const q = JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]').find((x) => x.clientName === 'SARL Bordereau Audit');
            if (!q) return null;
            const items = (q.hybridQuoteSnapshot?.lots || q.lots || []).flatMap((l) => l.items || []);
            const src = items.filter((i) => i.sourceImport);
            return { numero: q.number, items: items.length, avecSource: src.length,
                fichiers: [...new Set(src.map((i) => i.sourceImport.file))], l150: src.find((i) => /Poste 150/.test(i.name))?.sourceImport };
        });
        ok('[C163] Lignes importées : la provenance (fichier + n° de ligne) reste attachée à chaque ligne du devis enregistré',
            sauve && sauve.avecSource === 151 && sauve.fichiers.includes('bordereau-long.csv') && sauve.l150?.row === 151,
            JSON.stringify(sauve));

        await aller(page, '#devis');
        await cliquer(page, /SARL Bordereau Audit/, { sel: 'tbody tr' });
        await attendre(2200);
        // Zone document affichée : toutes les lignes sont-elles présentes ?
        const docTexte = await page.evaluate(() => [...document.querySelectorAll('[data-zone-impression]')].filter((z) => z.getBoundingClientRect().width > 0).map((z) => z.innerText).join('\n'));
        const postesDansDoc = (docTexte.match(/Poste \d{3}/g) || []).length;

        // C169/C170/C168 — PDF généré (html2canvas + jsPDF) sur un devis long.
        await brancherSondePdf(page, s.url);
        await viderMessages(page);
        const btnPdf = await trouver(page, /^Télécharger le devis en PDF$/, { sel: 'button' });
        await btnPdf.click();
        await attendre(250);
        const etatBouton = await page.evaluate((b) => ({ texte: b.innerText.trim(), desactive: b.disabled }), btnPdf);
        const pdf = await attendreFichier(s, 120000);
        await attendre(800);
        const sonde = await lireSondePdf(page);
        const infoPdf = pdf ? analyserPdf(pdf.contenu) : null;
        const msgPdf = (await messages(page)).join(' | ');
        ok('[C162] Génération PDF : progression visible (« Génération… », bouton désactivé) puis message de fin',
            /Génération/.test(etatBouton.texte) && etatBouton.desactive && /PDF téléchargé/.test(msgPdf), `${JSON.stringify(etatBouton)} · « ${msgPdf} »`);
        ok('[C168] PDF du devis : nom explicite (type, numéro, client) et fichier PDF valide',
            pdf && /^Devis-DEV-2026-\d{3}-SARL-Bordereau-Audit\.pdf$/.test(pdf.nom) && infoPdf.entete === '%PDF-' && infoPdf.pages >= 2,
            pdf ? `${pdf.nom} · ${infoPdf.octets} o · ${infoPdf.pages} pages` : 'aucun fichier');
        const capOk = sonde && sonde.capture && Math.abs(sonde.capture.h / sonde.capture.echelle - sonde.capture.elH) <= 4 && sonde.hauteurDecoupee >= sonde.hauteurCanvas - 2;
        const coupuresSures = sonde ? sonde.coupures.filter((c) => c.uniforme).length : 0;
        ok('[C169] PDF du devis de 151 lignes : capture complète (hauteur et largeur), aucune tranche hors page',
            capOk && !sonde.debordeLargeur && !sonde.debordeHauteur && postesDansDoc === 150,
            sonde ? `capture ${sonde.capture.w}×${sonde.capture.h} px (échelle ${sonde.capture.echelle}) pour un document de ${sonde.capture.elW}×${sonde.capture.elH} px · ${sonde.pages} pages · découpé ${sonde.hauteurDecoupee}/${sonde.hauteurCanvas} px · postes affichés ${postesDansDoc}/150` : 'sonde vide');
        ok('[C169] PDF : chaque saut de page tombe sur une ligne de pixels uniforme (pas de texte tranché)',
            sonde && coupuresSures === sonde.coupures.length, sonde ? `${coupuresSures}/${sonde.coupures.length} coupures sur ligne uniforme · ${JSON.stringify(sonde.coupures.slice(0, 8))}` : '');
        const texteDuPdf = infoPdf ? infoPdf.chaines.join(' ') : '';
        ok('[C170] PDF téléchargé : numéro, client et montants présents en TEXTE (sélectionnable, lisible par une aide technique)',
            /DEV-2026/.test(texteDuPdf) && /SARL Bordereau Audit/.test(texteDuPdf),
            infoPdf ? `${infoPdf.images} image(s) pleine page, ${infoPdf.blocsTexte} bloc(s) texte ; texte réel du PDF : « ${texteDuPdf.slice(0, 160)} »` : '');
        await capture(page, 'c169-devis-long-1440');

        // C169 — impression navigateur (bouton « Imprimer ») : mise en page A4.
        await page.emulateMediaType('print');
        await page.setViewport({ width: 794, height: 1123 });
        await attendre(800);
        const impression = await page.evaluate(() => {
            const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
            const zone = [...document.querySelectorAll('[data-zone-impression]')].find(vis);
            if (!zone) return null;
            const r = zone.getBoundingClientRect();
            const cle = (re) => { const e = [...zone.querySelectorAll('*')].find((x) => re.test(x.innerText || '') && ![...x.children].some((c) => re.test(c.innerText || ''))); if (!e) return null; const b = e.getBoundingClientRect(); return vis(e) && b.left >= 0 && b.right <= innerWidth + 1; };
            // Débordement du CONTENU (le filigrane « DÉMONSTRATION », pivoté, est décoratif et exclu).
            const feuilles = [...zone.querySelectorAll('*')].filter((e) => !e.closest('.document-demo-filigrane, svg') && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && vis(e));
            const droiteMax = Math.max(...feuilles.map((e) => e.getBoundingClientRect().right));
            // Ancêtres qui rognent le document à l'impression (overflow + hauteur fixe).
            const rognent = []; let a = zone.parentElement;
            while (a && a !== document.documentElement) { const cs = getComputedStyle(a); if (cs.overflowY !== 'visible' && a.clientHeight < zone.offsetHeight - 2) rognent.push(`${a.tagName.toLowerCase()}.${String(a.className).split(' ').slice(0, 2).join('.')} h=${a.clientHeight} overflow=${cs.overflowY}`); a = a.parentElement; }
            return { zoneG: Math.round(r.left), zoneD: Math.round(r.right), largeur: innerWidth, debordement: Math.round(droiteMax - r.right), hauteurDoc: Math.round(zone.offsetHeight), rognent: rognent.slice(0, 4),
                nav: vis(document.querySelector('aside[data-nav-principale]')), boutonsVisibles: [...document.querySelectorAll('button')].filter(vis).length,
                numero: cle(/N° : DEV-2026/), client: cle(/SARL Bordereau Audit/), totalTTC: cle(/TOTAL TTC/), dernierPoste: cle(/Poste 150/) };
        });
        const pdfImpression = await page.pdf({ format: 'A4', printBackground: true, timeout: 180000 });
        const infoImpression = analyserPdf(pdfImpression);
        const pagesImpression = `${infoImpression.pages} page(s), ${infoImpression.blocsTexte} bloc(s) texte, ${infoImpression.octets} o`;
        await page.emulateMediaType(null);
        await page.setViewport({ width: 1440, height: 900 });
        ok('[C169] Impression A4 (« Imprimer ») d’un devis de 151 lignes : largeur tenue, interface masquée, et TOUTES les pages imprimées',
            impression && impression.zoneG >= 0 && impression.zoneD <= impression.largeur + 1 && impression.debordement <= 1 && !impression.nav && impression.numero && impression.client && impression.totalTTC && impression.dernierPoste && infoImpression.blocsTexte > 0
                && infoImpression.pages >= Math.ceil(impression.hauteurDoc / 1123),
            `${JSON.stringify(impression)} · PDF d’impression A4 : ${pagesImpression}`);
        ok('[G9] Bordereau 1440 : aucune requête externe, aucune erreur JS', s.etat.externes.length === 0 && s.erreurs.length === 0, `${s.etat.externes.join(',')} ${s.erreurs.join(' | ')}`);
    } finally { await s.fermer(); }
}

// ════════════════════════════════════════════════════════════════════════════
// Section 2 — Catalogue matières : import / export CSV, 1440 × 900
// C161, C162, C164, C165, C166, C167, C168
// ════════════════════════════════════════════════════════════════════════════
const MODALE_MAT = (page) => page.evaluateHandle(() => [...document.querySelectorAll('h3')].find((h) => /Importation CSV/.test(h.textContent))?.closest('.fixed') || null);
async function ouvrirImportMatieres(page) {
    await cliquer(page, /^Importer un fichier CSV$/, { sel: 'button' });
    await attendre(900);
}
async function fichierMatieres(page, chemin) {
    const label = await page.evaluateHandle(() => [...document.querySelectorAll('label')].find((l) => l.querySelector('input[type=file][accept=".csv,text/csv"]')));
    await choisirFichier(page, label.asElement(), chemin);
    await attendre(1200);
}
const nbMatieres = (page) => page.evaluate(() => Number((document.body.innerText.match(/Matières \((\d+)\)/) || [])[1]));

async function sectionMateriaux(ok) {
    const s = await ouvrirSession({ width: 1440, height: 900 });
    const { page } = s;
    try {
        await entrerEnDemo(page);
        await aller(page, '#materiaux');
        const n0 = await nbMatieres(page);

        // C167/C168 — export avec un filtre de recherche actif.
        await taper(page, 'input[aria-label="Rechercher dans les ressources"]', 'Ciment');
        await attendre(800);
        const visibles = await page.$$eval('button[aria-label^="Sélectionner "]', (b) => b.filter((x) => x.getBoundingClientRect().width > 0).length);
        await cliquer(page, /^Exporter au format CSV$/, { sel: 'button' });
        const exp1 = await attendreFichier(s, 20000);
        const csv1 = exp1 ? lireCsv(exp1.contenu.toString('utf8')) : null;
        const donnees1 = csv1 ? csv1.lignes.filter((l) => l.length > 1).length - 1 : -1;
        ok('[C167] Export matières : périmètre = ce qui est affiché (recherche « Ciment » active) ou périmètre annoncé',
            donnees1 === visibles, `${visibles} matière(s) affichée(s) · ${donnees1} exportée(s) · libellé du bouton « Export » sans mention de périmètre`);
        ok('[C168] Export matières : nom daté, colonnes cohérentes, BOM UTF-8 pour Excel',
            exp1 && /^ikadevis_matieres_\d{4}-\d{2}-\d{2}\.csv$/.test(exp1.nom) && exp1.contenu[0] === 0xEF,
            exp1 ? `${exp1.nom} · premier octet 0x${exp1.contenu[0].toString(16)} (BOM ${exp1.contenu[0] === 0xEF ? 'présent' : 'absent'}) · en-tête « ${csv1.lignes[0].join(';')} »` : 'aucun fichier');
        await cliquerSiPresent(page, /^Effacer la recherche des ressources$/, { sel: 'button' });
        await attendre(500);

        // C161 — explications avant sélection.
        await ouvrirImportMatieres(page);
        const modale = await MODALE_MAT(page);
        const texteModale = await page.evaluate((m) => m?.innerText || '', modale);
        const sep = await mesurerTexte(page, /virgules, points-virgules ou tabulations/);
        ok('[C161] Import matières : format (CSV, séparateurs, colonnes) expliqué avant sélection ; limites de taille et encodage non annoncés',
            sep?.dansFenetre && /Colonnes supportées/.test(texteModale) && /\d\s?[MK]o\b|taille maximale|UTF|encodage/i.test(texteModale),
            `« ${sep?.texte} » ${sep?.taille}px contraste ${sep?.contraste}:1 · taille maximale annoncée=${/\d\s?[MK]o\b|taille maximale/i.test(texteModale)} · encodage annoncé=${/UTF|encodage/i.test(texteModale)}`);
        await capture(page, 'c161-import-matieres-avant-selection-1440');

        // C168 — modèle de matières téléchargé depuis la fenêtre.
        await cliquer(page, /Télécharger Modèle/, { sel: 'button' });
        const modele = await attendreFichier(s, 20000);
        const csvModele = modele ? lireCsv(modele.contenu.toString('utf8')) : null;
        ok('[C168] Modèle matières : nommé, 3 exemples, colonnes homogènes, BOM UTF-8',
            modele && modele.nom === 'modele_matieres_ikadevis.csv' && csvModele.lignes.length === 4 && csvModele.lignes.every((l) => l.length === 8) && modele.contenu[0] === 0xEF,
            modele ? `${modele.nom} · ${csvModele.lignes.length} lignes · colonnes ${csvModele.lignes.map((l) => l.length).join('/')} · BOM ${modele.contenu[0] === 0xEF ? 'présent' : 'absent'}` : 'aucun fichier');

        // C162 — fichier vide puis même nom corrigé.
        await fichierMatieres(page, s.f.matVide);
        const errVide = await page.$$eval('[role=alert]', (l) => l.map((e) => e.innerText.trim()).filter(Boolean).join(' | '));
        await fichierMatieres(page, s.f.matPartiel);
        const apresCorrection = await page.evaluate(() => ({ alertes: [...document.querySelectorAll('p[role=alert]')].map((e) => e.innerText.trim()), apercu: (document.body.innerText.match(/Aperçu après association : [^\n]+/) || [''])[0], fichier: (document.body.innerText.match(/Fichier chargé : [^\n]+/) || [''])[0] }));
        ok('[C162] Fichier vide refusé avec raison, puis le MÊME nom de fichier corrigé est relu (nouvelle tentative)',
            /ne contient que l’en-tête/.test(errVide) && apresCorrection.alertes.length === 0 && /8 ligne\(s\) détectée\(s\)/.test(apresCorrection.fichier),
            `erreur « ${errVide} » · puis ${JSON.stringify(apresCorrection)}`);

        // C164 — erreurs par ligne.
        const erreurs = await page.evaluate(() => {
            const bloc = [...document.querySelectorAll('[role=alert]')].find((e) => /demandent une correction/.test(e.innerText));
            const lignes = [...document.querySelectorAll('tbody tr')].filter((tr) => /Erreur/.test(tr.innerText));
            return { titre: bloc?.querySelector('p')?.innerText.trim(), items: bloc ? [...bloc.querySelectorAll('li')].map((li) => li.innerText.trim()) : [],
                lignesErreur: lignes.map((tr) => ({ nom: tr.children[1].innerText.trim(), raisonVisible: tr.children[0].innerText.trim(), title: tr.querySelector('[title]')?.getAttribute('title') || '' })) };
        });
        const raisonA = erreurs.lignesErreur.find((l) => l.nom === 'A');
        ok('[C164] Matières : les 3 premières erreurs nomment la ligne et la correction (« Ligne 6 (Tuyau…) : Prix d’achat invalide ou nul »)',
            erreurs.items.length >= 3 && erreurs.items.slice(0, 3).every((t) => /^Ligne \d+ \(/.test(t)), `${erreurs.titre} · ${erreurs.items.join(' · ')}`);
        ok('[C164] Matières : la raison de CHAQUE ligne rejetée est lisible (pas seulement au survol de « ❌ Erreur »)',
            !!raisonA && !erreurs.items.some((t) => /Ligne 9/.test(t)) ? false : true,
            raisonA ? `ligne « A » : texte visible « ${raisonA.raisonVisible} », raison uniquement dans title=« ${raisonA.title} »` : 'ligne A introuvable');
        await capture(page, 'c164-import-matieres-erreurs-1440');

        // C166/C165 — réussite partielle : 3 nouvelles, 1 doublon, 4 rejetées.
        const avant = await page.evaluate(() => ({
            apercu: (document.body.innerText.match(/Aperçu après association : [^\n]+/) || [''])[0],
            pied: (document.body.innerText.match(/\d+ ressource\(s\) prêtes à être importées/) || [''])[0],
            bouton: [...document.querySelectorAll('button')].map((b) => b.innerText.trim()).find((t) => /^Importer \d+ Matière/.test(t))
        }));
        await viderMessages(page);
        await cliquer(page, /^Importer \d+ Matière\(s\)$/, { sel: 'button' });
        await attendre(1500);
        const n1 = await nbMatieres(page);
        const msg = (await messages(page)).join(' | ');
        await taper(page, 'input[aria-label="Rechercher dans les ressources"]', 'Ciment CPJ');
        await attendre(700);
        const prixCiment = await page.evaluate(() => [...document.querySelectorAll('button[aria-label^="Sélectionner Ciment CPJ"]')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
        await cliquerSiPresent(page, /^Effacer la recherche des ressources$/, { sel: 'button' });
        ok('[C166] Import matières partiel : le message final dit combien ont été ajoutées, ignorées (doublon) et rejetées',
            /3/.test(msg) && /doublon|ignor|rejet|erreur/i.test(msg) && !msg.includes(`${n1} matières`),
            `annoncé avant : « ${avant.apercu} » · « ${avant.pied} » · bouton « ${avant.bouton} » ; après : ${n0}→${n1} matières (+${n1 - n0}) · message « ${msg} » · Ciment existant : ${prixCiment.join(' / ')} (prix du CSV 5 200 non appliqué, sans le dire)`);
        ok('[C165] Import matières : l’aperçu annonce exactement ce qui sera appliqué (le doublon n’est pas compté comme « prêt »)',
            /4 ligne\(s\) valide\(s\) sur 8/.test(avant.apercu) && n1 - n0 === 4, `aperçu « ${avant.apercu} » / effet réel +${n1 - n0}`);

        // C168 — caractères courants en BTP (" pour pouces, #) dans l'export.
        await ouvrirImportMatieres(page);
        await fichierMatieres(page, s.f.matSpeciaux);
        await cliquer(page, /^Importer \d+ Matière\(s\)$/, { sel: 'button' });
        await attendre(1500);
        const n2 = await nbMatieres(page);
        await cliquer(page, /^Exporter au format CSV$/, { sel: 'button' });
        const exp2 = await attendreFichier(s, 20000);
        const texte2 = exp2 ? exp2.contenu.toString('utf8') : '';
        const csv2 = lireCsv(texte2);
        const largeurs = csv2.lignes.filter((l) => l.length > 1).map((l) => l.length);
        const ligneTube = csv2.lignes.find((l) => l.some((c) => /Tube PVC 1\/2/.test(c)));
        const finFichier = texte2.slice(-60).replace(/\s+/g, ' ');
        ok('[C168] Export matières après ajout de « Tube PVC 1/2" … » et « Vis TF #8 … » : fichier complet et colonnes intactes',
            exp2 && csv2.lignes.length - 1 >= n2 && largeurs.every((w) => w === 9) && !csv2.guillemetsOuverts,
            `${n2} matières au catalogue · ${csv2.lignes.length - 1} ligne(s) de données dans le fichier · largeurs de ligne ${[...new Set(largeurs)].join('/')} · ligne Tube : ${JSON.stringify(ligneTube)} · fin du fichier « …${finFichier} »`);

        // C164 — CSV enregistré par Excel FR sous Windows (Windows-1252).
        await ouvrirImportMatieres(page);
        await fichierMatieres(page, s.f.mat1252);
        const ansi = await page.evaluate(() => {
            const t = document.body.innerText;
            return { remplacement: [...document.querySelectorAll('tbody tr td, option')].map((e) => e.innerText.trim()).filter((x) => x.includes('\uFFFD')).slice(0, 3).join(' · '), avertissement: /encodage|UTF|caractères/i.test(t), pret: (t.match(/\d+ ressource\(s\) prêtes à être importées/) || [''])[0] };
        });
        await capture(page, 'c164-import-matieres-windows1252-1440');
        ok('[C164] CSV Excel Windows (accents en Windows-1252) : l’import signale l’encodage au lieu d’accepter des caractères « � »',
            !ansi.remplacement || ansi.avertissement, JSON.stringify(ansi));
        await cliquer(page, /^Annuler$/, { sel: 'button' });
        await attendre(700);

        // C165 — « Remplacer tout » : application effective sans confirmation ?
        const etatOuvrages = async () => {
            await aller(page, '#ouvrages');
            await cliquerSiPresent(page, /^Sélectionner l'ouvrage Maçonnerie en Murs/, { sel: 'button' });
            await attendre(1200);
            return page.evaluate(() => {
                const t = document.body.innerText;
                const sante = (t.match(/Santé du Catalogue :[\s\S]*?Ressources Manquantes : \d+/) || [''])[0].replace(/\s+/g, ' ');
                const lignes = [...document.querySelectorAll('tr')].map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()).filter((x) => /Agglos creux de 15 \(|Ciment mortier de pose/.test(x));
                return { sante, lignes };
            });
        };
        const ouvrageAvant = await etatOuvrages();
        await aller(page, '#materiaux');
        const nAvantRemplacement = await nbMatieres(page);
        await ouvrirImportMatieres(page);
        await fichierMatieres(page, s.f.matRemplacement);
        await cliquer(page, /^Remplacer tout$/, { sel: 'label' });
        await attendre(500);
        const avertissement = await page.evaluate((n) => {
            const m = [...document.querySelectorAll('h3')].find((h) => /Importation CSV/.test(h.textContent))?.closest('.fixed');
            const t = m?.innerText || '';
            return { mentionSuppression: /supprim|écras|seront remplac|perdu|définitiv/i.test(t), bouton: [...m.querySelectorAll('button')].map((b) => b.innerText.trim()).find((x) => /^Importer/.test(x)) };
        }, nAvantRemplacement);
        await viderMessages(page);
        await cliquer(page, /^Importer \d+ Matière\(s\)$/, { sel: 'button' });
        await attendre(1500);
        const confirmation = await page.evaluate(() => [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].map((d) => d.innerText.slice(0, 120)).join(' | '));
        const nApres = await nbMatieres(page);
        const msgRemp = (await messages(page)).join(' | ');
        await capture(page, 'c165-remplacer-tout-1440');
        ok('[C165] « Remplacer tout » : l’application effective (suppression des matières existantes) est annoncée et confirmée avant d’agir',
            (avertissement.mentionSuppression || !!confirmation || s.etat.dialoguesNatifs.length > 0),
            `${nAvantRemplacement} matières → ${nApres} après un clic sur « ${avertissement.bouton} » · confirmation : ${confirmation || 'aucune'} · message « ${msgRemp} » · annulation proposée : ${/annuler|rétablir/i.test(msgRemp)}`);
        const ouvrageApres = await etatOuvrages();
        await capture(page, 'c165-ouvrage-apres-remplacement-1440');
        ok('[C165] Après « Remplacer tout » : les ouvrages qui utilisaient les matières supprimées restent intacts',
            ouvrageApres.sante === ouvrageAvant.sante && JSON.stringify(ouvrageApres.lignes) === JSON.stringify(ouvrageAvant.lignes),
            `avant : ${ouvrageAvant.sante} · ${ouvrageAvant.lignes.join(' | ')} ⟶ après : ${ouvrageApres.sante} · ${ouvrageApres.lignes.join(' | ')}`);
        ok('[G9] Matières 1440 : aucune requête externe, aucune erreur JS', s.etat.externes.length === 0 && s.erreurs.length === 0, `${s.etat.externes.join(',')} ${s.erreurs.join(' | ')}`);
    } finally { await s.fermer(); }
}

// ════════════════════════════════════════════════════════════════════════════
// Section 3 — Facturation : conversion, règlements, PDF, export, historique
// C162, C167, C168, C170, C173, C175, C176, C179, C180 — 1440 × 900
// ════════════════════════════════════════════════════════════════════════════
// Facture HISTORIQUE fictive (même forme que celles produites par l'app),
// émise en août, partiellement réglée : sert aux filtres de période et d'export.
function graineFactureHistorique() {
    localStorage.setItem('costcalc:guest:invoices', JSON.stringify([{
        id: 'inv_hist_g9', numero: 'FACT-2026-900', statut: 'partially_paid', type: 'standard',
        clientName: 'Client Historique Audit', projectRef: 'Chantier Historique Audit', devisNumero: 'DEV-2026-900',
        dateCreation: '2026-08-12T09:00:00.000Z', dateEmission: '2026-08-12T09:05:00.000Z', dateEcheance: '2026-09-11',
        tauxTva: 18, totalHT: 1000000, totalTva: 180000, totalTTC: 1180000, deduitTTC: 0, netAPayerTTC: 1180000, montantRegle: 500000,
        payments: [{ id: 'p_hist', date: '2026-08-20', montant: 500000, mode: 'virement', reference: 'VIR-AUDIT-1' }],
        lignes: [{ ordre: 1, designation: 'Lot 01 — Travaux', unite: 'lot', quantite: 1, prixUnitaireHT: 1000000, totalHT: 1000000 }],
        companyInfoSnapshot: { name: 'IKADEVIS BTP', currency: 'FCFA' }
    }]));
}
const zoneFacture = (page) => page.evaluate(() => [...document.querySelectorAll('[data-zone-impression="1"]')].filter((z) => z.getBoundingClientRect().width > 0).map((z) => z.innerText).join('\n'));
const factures = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('costcalc:guest:invoices') || '[]'));

async function ouvrirFacturerDevis(page) {
    await aller(page, '#devis');
    await cliquer(page, /^Afficher le devis DEV-2026-001/, { sel: '[aria-label^="Afficher le devis"], tbody tr' });
    await attendre(1800);
    if (!await cliquerSiPresent(page, /^Facturer le devis DEV-2026-001$/, { sel: 'button' })) {
        await cliquer(page, /PLUS D’ACTIONS|Plus d’actions|Plus d'actions/i, { sel: 'button, summary' });
        await attendre(500);
        await cliquer(page, /^Facturer le devis DEV-2026-001$|Convertir en facture/, { sel: 'button' });
    }
    await attendre(1300);
}
async function emettreFactureActive(page) {
    await cliquer(page, /^Émettre la facture de /, { sel: 'button' });
    await attendre(1000);
    const texteDialogue = await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].map((d) => d.innerText).join(' | '));
    await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.innerText.trim() === 'Émettre')?.click());
    await attendre(1800);
    return texteDialogue;
}

async function sectionFactures(ok) {
    const s = await ouvrirSession({ width: 1440, height: 900, graine: graineFactureHistorique });
    const { page } = s;
    try {
        await entrerEnDemo(page);

        // C176/C173 — devis → facture d'acompte de 30 %.
        await ouvrirFacturerDevis(page);
        await choisirOption(page, /^Type de facture$/, /^Acompte$/);
        const pctInputs = await page.$$('[role=dialog] input[type=number]');
        for (const i of pctInputs) { await saisirNombreEl(page, i, 30); await attendre(200); }
        await attendre(500);
        const modaleAcompte = await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].map((d) => d.innerText).join('\n'));
        const htAcompte = (modaleAcompte.match(/Total HT de cette facture\s*([\d\s ]+) FCFA/) || [])[1];
        await cliquer(page, /^Créer le brouillon$/, { sel: 'button' });
        await attendre(1800);
        const docBrouillon = await zoneFacture(page);
        ok('[C173] TVA et TTC (net à payer) visibles AVANT émission : la fenêtre « Facturer » ne montre que le HT, le brouillon les détaille',
            /TVA \(18%\)/.test(docBrouillon) && /NET À PAYER/.test(docBrouillon),
            `fenêtre « Facturer » : « Total HT de cette facture ${htAcompte} FCFA », TVA=${/TVA/.test(modaleAcompte)}, TTC=${/TTC/.test(modaleAcompte)} · brouillon : « ${(docBrouillon.match(/TVA \(18%\) :\s*[^\n]+/) || [''])[0]} », « ${(docBrouillon.match(/NET À PAYER :\s*[^\n]+/) || [''])[0]} »`);

        // C162/C168 — PDF d'un brouillon : échec de chargement, puis nouvelle tentative.
        s.etat.bloquer.add('jspdf.umd.min.js');
        await viderMessages(page);
        await cliquer(page, /^Télécharger le brouillon de facture en PDF$/, { sel: 'button' });
        await attendre(3500);
        const echec = await page.evaluate(() => ({ messages: window.__messages.slice(), bouton: [...document.querySelectorAll('button[aria-label="Télécharger le brouillon de facture en PDF"]')].map((b) => ({ texte: b.innerText.trim(), desactive: b.disabled })) }));
        s.etat.bloquer.delete('jspdf.umd.min.js');
        await viderMessages(page);
        await cliquer(page, /^Télécharger le brouillon de facture en PDF$/, { sel: 'button' });
        const pdfBrouillon = await attendreFichier(s, 60000);
        ok('[C162] PDF en échec (bibliothèque indisponible) : message qui propose une alternative, bouton rendu, nouvelle tentative réussie',
            echec.messages.some((m) => /Génération impossible.*Imprimer/.test(m)) && echec.bouton.every((b) => !b.desactive && /Télécharger le PDF/.test(b.texte)) && !!pdfBrouillon,
            `1er essai : ${JSON.stringify(echec)} · 2e essai → ${pdfBrouillon?.nom || 'aucun fichier'}`);
        ok('[C168] PDF du brouillon de facture : produit et nommé « Brouillon facture <client> »',
            pdfBrouillon && /^Brouillon-facture-Societe-Immobiliere-NBB\.pdf$/.test(pdfBrouillon.nom), pdfBrouillon ? `${pdfBrouillon.nom} · ${(await messages(page)).join(' | ')}` : `aucun fichier · ${(await messages(page)).join(' | ')}`);

        const dialogueEmission = await emettreFactureActive(page);
        let liste = await factures(page);
        const acompte = liste.find((f) => f.type === 'acompte');
        const NUM = acompte?.numero || 'FACT-2026-001';
        const echapRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const devis = await page.evaluate(() => JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]').find((q) => q.number === 'DEV-2026-001'));
        ok('[C176] Devis → facture d’acompte : client, chantier, n° de devis, TVA et échéancier conservés',
            acompte && acompte.clientId === devis.clientId && acompte.projectId === devis.projectId && acompte.devisNumero === 'DEV-2026-001' && acompte.tauxTva === 18 && Array.isArray(acompte.paymentSchedule),
            acompte ? `clientId ${acompte.clientId}/${devis.clientId} · projectId ${acompte.projectId}/${devis.projectId} · ${acompte.numero} HT ${acompte.totalHT} TTC ${acompte.totalTTC}` : 'facture absente');
        const docAcompte = await zoneFacture(page);
        const dateDoc = (docAcompte.match(/Émise le ([^\n]+)/) || [])[1] || '';
        ok('[C180] Facture émise : la date d’émission suit le format français du reste de l’app (jj/mm/aaaa)',
            /^\d{2}\/\d{2}\/\d{4}$/.test(dateDoc.trim()), `document de la facture : « Émise le ${dateDoc} » (le document du devis affiche « Date : jj/mm/aaaa »)`);
        ok('[C180] Facture : quantités au format français (virgule décimale)', !/\b\d+\.\d+ lot\b/.test(docAcompte), (docAcompte.match(/[\d.,]+ lot/g) || []).slice(0, 3).join(' · '));
        await capture(page, 'c180-facture-emise-date-1440');

        // C168 — PDF de la facture émise, depuis la fiche.
        await cliquer(page, /^Télécharger la facture en PDF$/, { sel: 'button' });
        const pdfFacture = await attendreFichier(s, 60000);
        const nomDirect = pdfFacture?.nom;

        // C170/C168 — Aperçu : contenu et nom du fichier téléchargé depuis l'aperçu.
        await cliquer(page, /^Aperçu de la facture$/, { sel: 'button' });
        await attendre(1500);
        const apercu = await page.evaluate(() => { const d = document.querySelector('[aria-labelledby="preview_modal_title"]'); return d ? d.innerText : ''; });
        const cles = [NUM, 'Société Immobilière NBB', 'Construction Siège NBB', 'TVA (18%)', 'NET À PAYER'];
        ok('[C170] Aperçu de la facture : numéro, client, chantier, TVA et net à payer présents', cles.every((c) => apercu.includes(c)), cles.filter((c) => !apercu.includes(c)).join(', ') || 'tout présent');
        const btnApercu = await trouver(page, /Télécharger|PDF/, { sel: '[aria-labelledby="preview_modal_title"] button' });
        const libelleBtnApercu = btnApercu ? await page.evaluate((b) => b.innerText.trim(), btnApercu) : '';
        let pdfApercu = null;
        if (btnApercu) { await btnApercu.click(); pdfApercu = await attendreFichier(s, 60000); }
        ok('[C168] Même facture, même nom de fichier quel que soit le bouton (fiche ou aperçu), sans double extension',
            pdfApercu && pdfApercu.nom === nomDirect && !/-pdf\.pdf$/.test(pdfApercu.nom),
            `fiche → « ${nomDirect} » · aperçu (« ${libelleBtnApercu} ») → « ${pdfApercu?.nom} »`);
        await page.keyboard.press('Escape');
        await attendre(600);
        await cliquerSiPresent(page, /^Fermer$/, { sel: '[aria-labelledby="preview_modal_title"] button' });

        // C175 — règlement partiel puis lecture du solde partout.
        await cliquer(page, new RegExp(`^Enregistrer un règlement pour la facture ${NUM}$`), { sel: 'button' });
        await attendre(1200);
        const preRempli = await page.$eval('#reglement_montant_commun', (i) => i.value);
        await saisirNombre(page, '#reglement_montant_commun', 2000000);
        await attendre(300);
        await cliquer(page, /^Valider le règlement$/, { sel: '[role=dialog] button' });
        await attendre(1800);
        liste = await factures(page);
        const a2 = liste.find((f) => f.numero === NUM);
        const reste = a2.netAPayerTTC - 2000000;
        const fmt = (n) => n.toLocaleString('fr-FR').replace(/ /g, ' ');
        const vue = await page.evaluate(() => document.querySelector('main')?.innerText || document.body.innerText);
        const ligneListe = await page.evaluate((n) => [...document.querySelectorAll('[aria-label="Voir la facture de Société Immobilière NBB"], tbody tr')].map((e) => e.innerText.replace(/\s+/g, ' ')).find((t) => t.includes(n)) || '', NUM);
        const docApresReglement = await zoneFacture(page);
        const normal = (t) => t.replace(/[  ]/g, ' ');
        ok('[C175] Règlement partiel : réglé et reste affichés sur la fiche, la liste et les compteurs',
            normal(vue).includes(`Réglé : 2 000 000 FCFA`) && normal(vue).includes(`Reste : ${fmt(reste)} FCFA`) && /Partiel/i.test(ligneListe) && /Partielles\s*2/.test(normal(vue)),
            `prérempli « ${preRempli} » · liste « ${ligneListe.slice(0, 160)} » · reste attendu ${fmt(reste)}`);
        ok('[C175] Le document de la facture (PDF/aperçu) indique le déjà-réglé et le reste à payer',
            /déjà réglé|reste à payer|acompte reçu/i.test(docApresReglement), `document : ${/déjà réglé|reste à payer/i.test(docApresReglement) ? 'oui' : 'aucune mention du règlement — seul « NET À PAYER » ' + ((docApresReglement.match(/NET À PAYER :\s*([^\n]+)/) || [])[1] || '')}`);
        await cliquer(page, new RegExp(`^Enregistrer un règlement pour la facture ${NUM}$`), { sel: 'button' });
        await attendre(1200);
        const preRempli2 = await page.$eval('#reglement_montant_commun', (i) => i.value);
        await saisirNombre(page, '#reglement_montant_commun', reste + 50000);
        await attendre(300);
        await viderMessages(page);
        await cliquer(page, /^Valider le règlement$/, { sel: '[role=dialog] button' });
        await attendre(1200);
        const tropPercu = await page.evaluate(() => ({ dialogue: !!document.querySelector('#reglement_montant_commun'), alertes: [...document.querySelectorAll('[role=dialog] [role=alert], [role=dialog] .text-red-600, [role=dialog] .text-red-700')].map((e) => e.innerText.trim()).filter(Boolean), messages: window.__messages.slice() }));
        const regleApres = (await factures(page)).find((f) => f.numero === NUM).montantRegle;
        ok('[C175] 2e règlement : montant prérempli = reste dû ; un montant supérieur au reste est refusé avec une explication',
            Number(preRempli2) === reste && regleApres === 2000000 && (tropPercu.alertes.length > 0 || tropPercu.messages.length > 0),
            `prérempli ${preRempli2} (reste ${reste}) · saisie ${reste + 50000} → ${JSON.stringify(tropPercu)} · réglé en base ${regleApres}`);
        await cliquerSiPresent(page, /^Annuler$/, { sel: '[role=dialog] button' });
        await attendre(600);

        // C179 — chronologie visible : création, émission, envoi, règlements.
        await cliquerSiPresent(page, /^Règlements & Quittances$/, { sel: 'button, [role=tab]' });
        await attendre(800);
        const historique = await page.evaluate(() => {
            const t = document.querySelector('main')?.innerText || document.body.innerText;
            return { reglement: /2 000 000/.test(t) && /virement|Virement/.test(t), dateReglement: (t.match(/\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/g) || []).slice(0, 4),
                creee: /Créée le|créée le|Brouillon créé/.test(t), emise: /Émise le/.test(t), envoyee: /Envoyée le/.test(t), auteur: /par (vous|[A-Z][a-z]+)/.test(t) };
        });
        await capture(page, 'c179-reglements-1440');
        ok('[C179] Fiche facture : chaque règlement est listé avec date, mode et montant', historique.reglement, JSON.stringify(historique));
        ok('[C179] Fiche facture : une chronologie dit qui a créé, émis, envoyé, réglé et quand', historique.creee && historique.emise && historique.envoyee,
            `créée=${historique.creee} émise=${historique.emise} envoyée=${historique.envoyee} auteur=${historique.auteur}`);
        await aller(page, '#settings/audit');
        const journal = await page.evaluate(() => document.body.innerText.match(/Journal de sécurité[^\n]*\n[^\n]*\n?[^\n]*/)?.[0] || '');
        ok('[C179] Journal d’activité de l’organisation accessible en démo (Paramètres)', !!journal, journal ? journal.replace(/\n/g, ' / ').slice(0, 200) : 'onglet « audit » absent en démo (réservé au compte connecté administrateur)');

        // C176 — 2e facture après l'acompte : relation et avancement repris.
        await ouvrirFacturerDevis(page);
        const modale2 = await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].map((d) => d.innerText).join('\n'));
        await cliquer(page, /^Créer le brouillon$/, { sel: 'button' });
        await attendre(1800);
        const doc2 = await zoneFacture(page);
        const f2 = (await factures(page)).find((f) => f.statut === 'draft');
        ok('[C176] 2e facture : le déjà-facturé (acompte 30 %) est repris lot par lot et seul le reste est facturé',
            !!f2 && Math.abs(f2.totalHT - (17448522 - acompte.totalHT)) <= 3,
            `fenêtre : ${(modale2.match(/Déjà facturé[^\n]*\n?/) || [''])[0].trim()} · HT 2e facture ${f2?.totalHT} = 17 448 522 − ${acompte.totalHT}`);
        const reAcompte = new RegExp(`${echapRe(NUM)}|acompte|déjà factur|cumul|30 ?%`, 'gi');
        ok(`[C176] Le document de la 2e facture rappelle l’acompte déjà facturé (n° ${NUM} ou % cumulé)`,
            reAcompte.test(doc2), `mentions trouvées : ${(doc2.match(reAcompte) || []).join(', ') || 'aucune'}`);
        await aller(page, '#devis');
        await cliquer(page, /^Afficher le devis DEV-2026-001/, { sel: 'tbody tr' });
        await attendre(1800);
        const ficheDevis = await page.evaluate(() => document.querySelector('main')?.innerText || '');
        ok('[C176] Fiche du devis : les factures qui en sont issues sont signalées', new RegExp(`${echapRe(NUM)}|Facturé|factur(e|ée)s? liée`, 'i').test(ficheDevis),
            (ficheDevis.match(/[^\n]*(FACT-2026|Factur)[^\n]*/g) || []).slice(0, 4).join(' / '));

        // C176 — avoir sur la facture d'acompte : relations conservées ?
        await aller(page, '#factures');
        await cliquer(page, new RegExp(echapRe(NUM)), { sel: '[aria-label^="Voir la facture"], tbody tr' });
        await attendre(1500);
        await cliquer(page, new RegExp(`^Émettre un avoir pour la facture ${NUM}$`), { sel: 'button' });
        await attendre(1200);
        await cliquer(page, /Confirmer & Émettre l'Avoir/, { sel: 'button' });
        await attendre(1800);
        liste = await factures(page);
        const avoir = liste.find((f) => f.type === 'avoir');
        const origine = liste.find((f) => f.numero === NUM);
        ok('[C176] Avoir : rattaché à la facture, au client ET au chantier d’origine',
            avoir && avoir.correctsInvoiceNumber === NUM && avoir.clientId === origine.clientId && avoir.projectId === origine.projectId,
            avoir ? `correctsInvoiceNumber ${avoir.correctsInvoiceNumber} · clientId ${avoir.clientId}/${origine.clientId} · projectId ${avoir.projectId}/${origine.projectId} · taux TVA ${avoir.tauxTva ?? avoir.tvaTaux}` : 'avoir absent');

        // C167/C168/C180 — export comptable.
        await aller(page, '#factures');
        const lireExport = async () => {
            await viderMessages(page);
            await cliquer(page, /^Exporter les factures en CSV$/, { sel: 'button' });
            const fichier = await attendreFichier(s, 20000);
            const csv = fichier ? lireCsv(fichier.contenu.toString('utf8')) : { lignes: [] };
            return { fichier, entete: csv.lignes[0] || [], donnees: csv.lignes.slice(1).filter((l) => l.length > 1), message: (await messages(page)).join(' | ') };
        };
        const compteVisible = () => page.evaluate(() => Number((document.body.innerText.match(/(\d+) résultat\(s\)/) || [])[1]));
        const tout = await lireExport();
        const nTout = await compteVisible();
        const col = (e, nom) => e.entete.indexOf(nom);
        const iDate = col(tout, 'Date Facture');
        const vides = tout.donnees.filter((l) => !l[iDate]).map((l) => l[col(tout, 'Numéro')]);
        ok('[C168] Export comptable : nom daté, BOM UTF-8, séparateur « ; », 18 colonnes par ligne',
            tout.fichier && /^journal_des_ventes_\d{4}-\d{2}-\d{2}\.csv$/.test(tout.fichier.nom) && tout.fichier.contenu[0] === 0xEF && tout.donnees.every((l) => l.length === 18),
            tout.fichier ? `${tout.fichier.nom} · ${tout.donnees.length} ligne(s)` : 'aucun fichier');
        ok('[C167] Export « Toutes » : autant de lignes que de factures listées, message cohérent', tout.donnees.length === nTout && new RegExp(`\\(${nTout} factures\\)`).test(tout.message),
            `${nTout} listée(s) · ${tout.donnees.length} exportée(s) · « ${tout.message} »`);
        ok('[C167] Colonne annoncée « Date Facture » renseignée pour chaque facture émise', vides.filter((n) => n !== 'Brouillon').length === 0,
            `vides pour : ${vides.join(', ') || 'aucune'} · valeurs : ${tout.donnees.map((l) => `${l[col(tout, 'Numéro')]}=${l[iDate] || '∅'}`).join(' ; ')}`);
        const iHT = col(tout, 'Montant HT'), iTVA = col(tout, 'TVA'), iTTC = col(tout, 'Montant TTC');
        const incoherents = tout.donnees.filter((l) => Number(l[iHT]) + Number(l[iTVA]) !== Number(l[iTTC])).map((l) => `${l[col(tout, 'Numéro')]} ${l[iHT]}+${l[iTVA]}≠${l[iTTC]}`);
        ok('[C167] Export : HT + TVA = TTC sur chaque ligne', incoherents.length === 0, incoherents.join(' ; ') || 'cohérent');
        const formatsDates = [...new Set(tout.donnees.flatMap((l) => [l[iDate], l[col(tout, 'Date Échéance')], l[col(tout, 'Dernier Règlement Date')]]).filter(Boolean).map((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) ? 'AAAA-MM-JJ' : /T\d{2}:/.test(d) ? 'horodatage ISO' : /^\d{2}\/\d{2}\/\d{4}$/.test(d) ? 'JJ/MM/AAAA' : d))];
        ok('[C180] Export : un seul format de date', formatsDates.length <= 1, formatsDates.join(' · '));
        // Filtre de statut.
        await cliquer(page, /^Partielles\s*\d+$/, { sel: 'button' });
        await attendre(900);
        const nPart = await compteVisible();
        const part = await lireExport();
        const statuts = [...new Set(part.donnees.map((l) => l[col(part, 'Statut')]))];
        ok('[C167] Export avec filtre « Partielles » : seules les factures filtrées', part.donnees.length === nPart && statuts.every((x) => /Partiellement/.test(x)),
            `${nPart} affichée(s) · ${part.donnees.length} exportée(s) · statuts ${statuts.join('/')}`);
        await cliquer(page, /^Toutes\s*\d+$/, { sel: 'button' });
        await attendre(700);
        // Filtre de période.
        await cliquer(page, /^Filtres avancés$/, { sel: 'button' });
        await attendre(600);
        await choisirOption(page, /^Filtrer les factures par période temporelle$/, /^Ce mois-ci$/);
        const nMois = await compteVisible();
        const mois = await lireExport();
        ok('[C167] Export avec période « Ce mois-ci » : la facture d’août est exclue, comme dans la liste',
            mois.donnees.length === nMois && !mois.donnees.some((l) => l[col(mois, 'Numéro')] === 'FACT-2026-900'),
            `${nMois} affichée(s) · ${mois.donnees.length} exportée(s) · ${mois.donnees.map((l) => l[col(mois, 'Numéro')]).join(', ')}`);
        await choisirOption(page, /^Filtrer les factures par période temporelle$/, /^Toutes les dates$/);
        // Sélection.
        const cb = await page.$('input[aria-label="Sélectionner facture FACT-2026-900"]');
        if (cb) { await cb.click(); await attendre(500); }
        await viderMessages(page);
        await cliquer(page, /^Exporter CSV$/, { sel: 'button' });
        const sel = await attendreFichier(s, 20000);
        const selCsv = sel ? lireCsv(sel.contenu.toString('utf8')).lignes.slice(1).filter((l) => l.length > 1) : [];
        ok('[C167] Export de la sélection (1 facture) : une seule ligne', !!cb && selCsv.length === 1 && selCsv[0][1] === 'FACT-2026-900', `case trouvée=${!!cb} · ${selCsv.length} ligne(s) · ${(await messages(page)).join(' | ')}`);
        await capture(page, 'c167-factures-export-1440');
        ok('[G9] Factures 1440 : aucune requête externe, aucune erreur JS', s.etat.externes.length === 0 && s.erreurs.length === 0, `${s.etat.externes.join(',')} ${s.erreurs.join(' | ')}`);
        void dialogueEmission;
    } finally { await s.fermer(); }
}

// ════════════════════════════════════════════════════════════════════════════
// Section 4 — Devise EUR, remise, retenue de garantie : C173, C180 — 1440
// ════════════════════════════════════════════════════════════════════════════
async function sectionDevise(ok) {
    const s = await ouvrirSession({ width: 1440, height: 900 });
    const { page } = s;
    try {
        await entrerEnDemo(page);

        // C173 — remise d'un ouvrage : expliquée au moment de la saisie ?
        await aller(page, '#chiffrage');
        await taper(page, 'input[placeholder*="Rechercher un ouvrage"]', 'maçonnerie');
        await attendre(1000);
        await cliquer(page, /Maçonnerie en Murs/, { sel: '[role="option"]' });
        await attendre(1600);
        await saisirNombre(page, 'input[aria-label="Surface directe (m²)"]', 120);
        await attendre(800);
        await cliquer(page, /^Confirmer mes quantités$/, { sel: 'button' });
        await attendre(800);
        await cliquer(page, /^3\. Prix & Marge$/, { sel: 'button, [role=tab]' });
        await attendre(800);
        const avantRemise = await page.evaluate(() => (document.body.innerText.match(/Prix de Vente Total HT :\s*([^\n]+)/) || [])[1]);
        await saisirNombre(page, 'input[aria-label="Remise Client (%)"]', 10);
        await attendre(900);
        const ligneRemise = await mesurerTexte(page, /Remise Client \(-10%\)/);
        const apresRemise = await page.evaluate(() => ({ remise: (document.body.innerText.match(/Remise Client \(-10%\) :\s*([^\n]+)/) || [])[1], pv: (document.body.innerText.match(/Prix de Vente Total HT :\s*([^\n]+)/) || [])[1] }));
        const num = (t) => Number(String(t || '').replace(/[^\d]/g, ''));
        ok('[C173] Remise sur un ouvrage : montant de la remise affiché aussitôt, avant le prix de vente HT',
            ligneRemise?.dansFenetre !== undefined && num(apresRemise.remise) > 0 && Math.abs(num(avantRemise) - num(apresRemise.remise) - num(apresRemise.pv)) <= 2,
            `PV avant ${avantRemise} · remise ${apresRemise.remise} · PV après ${apresRemise.pv} · ligne visible sans défilement=${ligneRemise?.dansFenetre}`);
        await capture(page, 'c173-remise-inspecteur-1440');
        await page.keyboard.press('Escape');
        await attendre(500);
        await taper(page, 'input[aria-label^="Client du devis"]', 'SARL Remise Audit');
        await attendre(900);
        await cliquer(page, /^Créer « SARL Remise Audit »$/, { sel: '[role="option"]' });
        await attendre(1200);
        await cliquer(page, /^Créer le client$/, { sel: 'button' });
        await attendre(1400);
        await cliquer(page, /^Enregistrer$/, { sel: 'button' });
        await attendre(2200);
        await aller(page, '#devis');
        await cliquer(page, /SARL Remise Audit/, { sel: 'tbody tr' });
        await attendre(2000);
        const docRemise = await page.evaluate(() => [...document.querySelectorAll('[data-zone-impression]')].filter((z) => z.getBoundingClientRect().width > 0).map((z) => z.innerText).join('\n'));
        ok('[C173] Document client d’un devis remisé de 10 % : la remise accordée apparaît (ligne ou mention)', /remise/i.test(docRemise),
            `mention « remise » : ${/remise/i.test(docRemise)} · TVA affichée « ${(docRemise.match(/TVA \(\d+%\)[^\n]*/) || [''])[0]} »`);

        // C173 — retenue de garantie annoncée par le type « Solde ».
        await aller(page, '#settings/facturation');
        const champRetenue = await page.$('#commercial_retention_rate');
        if (champRetenue) { await saisirNombre(page, '#commercial_retention_rate', 5); await attendre(600); }
        await ouvrirFacturerDevis(page);
        await choisirOption(page, /^Type de facture$/, /^Solde/);
        const modaleSolde = await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].map((d) => d.innerText).join('\n'));
        await cliquer(page, /^Créer le brouillon$/, { sel: 'button' });
        await attendre(1800);
        const dlgEmission = await emettreFactureActive(page);
        const solde = (await factures(page)).find((f) => f.type === 'solde');
        const docSolde = await zoneFacture(page);
        ok('[C173] Facture de solde (retenue réglée à 5 %) : montant de la retenue montré avant émission et appliqué',
            /retenue/i.test(modaleSolde + dlgEmission) && /\d/.test((modaleSolde.match(/retenue[^\n]*/i) || [''])[0]) && solde && solde.deduitTTC > 0,
            `réglage trouvé=${!!champRetenue} · fenêtre « Facturer » : « ${(modaleSolde.match(/[^\n]*retenue[^\n]*/i) || [''])[0]} » · dialogue d’émission : « ${dlgEmission.replace(/\s+/g, ' ').slice(0, 150)} » · après émission : TTC ${solde?.totalTTC}, déduit ${solde?.deduitTTC}, net ${solde?.netAPayerTTC} · document mentionne la retenue=${/Retenue de garantie/i.test(docSolde)}`);

        // C180 — devise EUR.
        await aller(page, '#settings/entreprise');
        await choisirOption(page, /^Devise principale$/, /^EUR — Euro/);
        const aide = await mesurerTexte(page, /sans conversion automatique/);
        await aller(page, '#devis');
        await cliquer(page, /^Afficher le devis DEV-2026-001/, { sel: 'tbody tr' });
        await attendre(1800);
        const docEur = await page.evaluate(() => [...document.querySelectorAll('[data-zone-impression]')].filter((z) => z.getBoundingClientRect().width > 0).map((z) => z.innerText).join('\n'));
        const pu = (docEur.match(/[\d  ,.]+ (?:EUR|€|FCFA)/g) || []).slice(0, 8);
        ok('[C180] Devise EUR : le document du devis n’affiche plus « FCFA » et un seul format monétaire (€)',
            !/FCFA/.test(docEur) && !/\d EUR\b/.test(docEur), `aide « ${aide?.texte} » · montants lus : ${pu.join(' | ')}`);
        await capture(page, 'c180-devis-eur-1440');
        await aller(page, '#materiaux');
        const listeMat = await page.evaluate(() => (document.querySelector('main')?.innerText.match(/[\d  ,.]+ (?:EUR|€|FCFA)/g) || []).slice(0, 3));
        await ouvrirImportMatieres(page);
        await fichierMatieres(page, s.f.matRemplacement);
        const apercuMat = await page.evaluate(() => [...document.querySelectorAll('tbody tr')].map((tr) => tr.innerText.replace(/\s+/g, ' ')).filter((t) => /audit/.test(t)).slice(0, 2));
        ok('[C180] Devise EUR : l’aperçu d’import des matières suit la devise réglée',
            !apercuMat.some((t) => /FCFA/.test(t)), `liste des matières : ${listeMat.join(' | ')} · aperçu d’import : ${apercuMat.join(' | ')}`);
        await capture(page, 'c180-import-matieres-eur-1440');
        await cliquer(page, /^Annuler$/, { sel: 'button' });
        ok('[G9] Devise 1440 : aucune requête externe, aucune erreur JS', s.etat.externes.length === 0 && s.erreurs.length === 0, `${s.etat.externes.join(',')} ${s.erreurs.join(' | ')}`);
    } finally { await s.fermer(); }
}

// ════════════════════════════════════════════════════════════════════════════
// Section 5 — Logo de l'entreprise : C161, C162, C163 — 1440 puis 390
// ════════════════════════════════════════════════════════════════════════════
async function sectionLogo(ok) {
    const s = await ouvrirSession({ width: 1440, height: 900 });
    const { page } = s;
    try {
        await entrerEnDemo(page);
        await aller(page, '#settings/entreprise');
        const champLogo = async () => page.evaluateHandle(() => [...document.querySelectorAll('label')].find((l) => l.querySelector('input[type=file][accept="image/*"]') && /Choisir un fichier|Changer le logo/.test(l.innerText)));
        const aide = await mesurerTexte(page, /Redimensionné et compressé automatiquement/);
        const lb = await champLogo();
        await lb.asElement().evaluate((e) => e.scrollIntoView({ block: 'center' }));
        await attendre(400);
        const aideVisible = await mesurerTexte(page, /Redimensionné et compressé automatiquement/);
        ok('[C161] Logo : formats acceptés et taille conseillée expliqués avant sélection',
            !!aideVisible?.dansFenetre && /png|jpe?g|svg|format/i.test(aideVisible.texte) && /Mo/.test(aideVisible.texte),
            `« ${aideVisible?.texte} » ${aideVisible?.taille}px contraste ${aideVisible?.contraste}:1 · formats cités=${/png|jpe?g|svg|format/i.test(aideVisible?.texte || '')} · transparence perdue annoncée=${/transparen|fond blanc/i.test(aideVisible?.texte || '')}`);
        void aide;
        await capture(page, 'c161-logo-avant-selection-1440');
        await viderMessages(page);
        await choisirFichier(page, (await champLogo()).asElement(), s.f.logoFaux);
        await attendre(1200);
        const erreurLogo = await page.evaluate(() => [...document.querySelectorAll('p.text-red-600')].map((p) => p.innerText.trim()).join(' | '));
        await choisirFichier(page, (await champLogo()).asElement(), s.f.logoRouge);
        await attendre(1500);
        const logoA = await page.evaluate(() => JSON.parse(localStorage.getItem('costcalc:guest:companyInfo') || 'null')?.logo || document.querySelector('img[alt="Logo entreprise"]')?.src || '');
        const coin = await page.evaluate(async (src) => { const i = new Image(); i.src = src; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return [...x.getImageData(1, 1, 1, 1).data]; }, logoA);
        const erreurApres = await page.evaluate(() => [...document.querySelectorAll('p.text-red-600')].map((p) => p.innerText.trim()).join(' | '));
        ok('[C162] Logo illisible : erreur nommée, puis un fichier valide remplace l’erreur (nouvelle tentative)',
            /illisible|corromp|pas une image/i.test(erreurLogo) && !erreurApres && logoA.startsWith('data:image/'), `1er essai « ${erreurLogo} » · 2e essai erreur=« ${erreurApres} » · logo ${logoA.slice(0, 22)}… (${Math.round(logoA.length / 1024)} Ko) · coin transparent rendu ${JSON.stringify(coin)}`);
        ok('[C161] Logo PNG transparent : la conversion (fond blanc, JPEG) est annoncée', /transparen|fond blanc/i.test(aideVisible?.texte || ''),
            `format stocké ${logoA.slice(5, 15)} · pixel transparent devenu ${JSON.stringify(coin)}`);

        // C163 — le logo reste attaché au bon document.
        await ouvrirFacturerDevis(page);
        await cliquer(page, /^Créer le brouillon$/, { sel: 'button' });
        await attendre(1800);
        await emettreFactureActive(page);
        const logoFacture = async () => page.evaluate(() => [...document.querySelectorAll('[data-zone-impression="1"] img')].filter((i) => i.getBoundingClientRect().width > 0).map((i) => i.src)[0] || '');
        const lfA = await logoFacture();
        await aller(page, '#settings/entreprise');
        await choisirFichier(page, (await champLogo()).asElement(), s.f.logoBleu);
        await attendre(1500);
        const logoB = await page.evaluate(() => document.querySelector('img[alt="Logo entreprise"]')?.src || '');
        await aller(page, '#factures');
        await cliquer(page, /FACT-2026-001/, { sel: '[aria-label^="Voir la facture"], tbody tr' });
        await attendre(1600);
        const lfApres = await logoFacture();
        await aller(page, '#devis');
        await cliquer(page, /^Afficher le devis DEV-2026-001/, { sel: 'tbody tr' });
        await attendre(1800);
        const logoDevis = await page.evaluate(() => [...document.querySelectorAll('[data-zone-impression] img')].filter((i) => i.getBoundingClientRect().width > 0).map((i) => i.src)[0] || '');
        ok('[C163] Logo : la facture émise garde le logo de son émission, le devis prend le nouveau logo',
            lfA === logoA && lfApres === logoA && logoDevis === logoB && logoA !== logoB,
            `facture à l’émission=${lfA === logoA} · facture après changement=${lfApres === logoA ? 'ancien logo' : lfApres === logoB ? 'NOUVEAU logo' : 'autre/absent'} · devis=${logoDevis === logoB ? 'nouveau logo' : logoDevis === logoA ? 'ancien logo' : 'absent'}`);
        await capture(page, 'c163-logo-devis-apres-changement-1440');

        // 390 px : l'aide du logo est-elle lisible sur téléphone ?
        await page.setViewport({ width: 390, height: 844 });
        await aller(page, '#settings/entreprise');
        const lb390 = await champLogo();
        await lb390.asElement().evaluate((e) => e.scrollIntoView({ block: 'center' }));
        await attendre(500);
        const aide390 = await mesurerTexte(page, /Redimensionné et compressé automatiquement/);
        ok('[C161] Logo à 390 px : explication visible à côté du bouton, sans défilement horizontal',
            aide390?.dansFenetre && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${JSON.stringify(aide390)}`);
        await capture(page, 'c161-logo-390');
        ok('[G9] Logo : aucune requête externe, aucune erreur JS', s.etat.externes.length === 0 && s.erreurs.length === 0, `${s.etat.externes.join(',')} ${s.erreurs.join(' | ')}`);
    } finally { await s.fermer(); }
}

// ════════════════════════════════════════════════════════════════════════════
// Section 6 — Téléphone 390 × 844 : C161, C164, C175 (et 320/360 pour C161)
// ════════════════════════════════════════════════════════════════════════════
async function sectionMobile(ok) {
    const s = await ouvrirSession({ width: 390, height: 844 });
    const { page } = s;
    const DLG = '[aria-labelledby="quote-import-title"]';
    try {
        await entrerEnDemo(page);
        for (const w of [390, 360, 320]) {
            await page.setViewport({ width: w, height: 844 });
            await aller(page, '#chiffrage');
            const ouvert = await cliquerSiPresent(page, /^Importer Excel \/ CSV$/, { sel: 'button' });
            await attendre(900);
            const lim = ouvert ? await mesurerTexte(page, /5 Mo maximum/, DLG) : null;
            const scroll = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
            ok(`[C161] Bordereau à ${w} px : limites lisibles dans la fenêtre d’import, sans défilement horizontal`, lim?.dansFenetre && scroll <= 0,
                ouvert ? `${JSON.stringify(lim)} · débordement horizontal ${scroll}px` : 'bouton « Importer Excel / CSV » introuvable à cette largeur');
            if (ouvert) { await capture(page, `c161-bordereau-${w}`); await cliquer(page, /^Fermer l’import$/, { sel: 'button', dans: DLG }); await attendre(600); }
        }
        await page.setViewport({ width: 390, height: 844 });
        await aller(page, '#chiffrage');
        await cliquer(page, /^Importer Excel \/ CSV$/, { sel: 'button' });
        await page.waitForSelector(DLG, { visible: true });
        await choisirFichier(page, `${DLG} input[type=file]`, s.f.erreurs);
        await attendre(1300);
        const cartes = await page.$$eval(`${DLG} .sm\\:hidden > div`, (ds) => ds.filter((d) => d.getBoundingClientRect().width > 0).map((d) => ({ texte: d.innerText.replace(/\s+/g, ' ').trim(), rouge: getComputedStyle(d).backgroundColor })));
        const fautives = cartes.filter((c) => /manquante|requise|invalide|ne correspond/.test(c.texte));
        ok('[C164] Bordereau à 390 px : chaque carte fautive indique « Ligne N » et le problème', fautives.length === 4 && fautives.every((c) => /Ligne \d+/.test(c.texte)),
            fautives.map((c) => c.texte.slice(0, 90)).join(' ‖ '));
        await capture(page, 'c164-bordereau-erreurs-390');

        // Excel Windows-1252 : en-têtes non reconnus, désignations altérées.
        await choisirFichier(page, `${DLG} input[type=file]`, s.f.cp1252);
        await attendre(1300);
        const ansi = await page.evaluate((d) => {
            const dlg = document.querySelector(d); const t = dlg.innerText;
            return { erreurs: [...dlg.querySelectorAll('ul[role=alert] li')].map((li) => li.innerText.trim()), remplacement: (t.match(/[^\n]*�[^\n]*/) || [''])[0].trim(), encodage: /encodage|UTF|caractères/i.test(t) };
        }, DLG);
        // L'utilisateur associe les colonnes à la main, comme l'y invite le message.
        const selects = await page.$$(`${DLG} label select`);
        const parLibelle = {};
        for (const sel of selects) { const lib = await sel.evaluate((x) => x.parentElement.innerText.split('\n')[0].trim()); parLibelle[lib] = sel; }
        if (parLibelle['Désignation *']) await parLibelle['Désignation *'].select('1');
        if (parLibelle['Unité *']) await parLibelle['Unité *'].select('2');
        if (parLibelle['Quantité *']) await parLibelle['Quantité *'].select('3');
        await attendre(700);
        await cliquerSiPresent(page, /J’ai vérifié les lignes/, { sel: 'label', dans: DLG });
        await attendre(400);
        const ajout = await trouver(page, /^Ajouter au devis$/, { sel: 'button', dans: DLG });
        const ajoutActif = ajout ? await ajout.evaluate((b) => !b.disabled) : false;
        if (ajoutActif) { await ajout.click(); await attendre(1500); }
        const ligneAlteree = await page.evaluate(() => (document.body.innerText.match(/[^\n]*B�ton[^\n]*/) || [''])[0].trim());
        ok('[C164] Bordereau Excel Windows-1252 : l’encodage est signalé ; aucune désignation altérée (« � ») n’entre dans le devis',
            ansi.encodage || (!ligneAlteree && !ansi.remplacement),
            `messages : ${ansi.erreurs.join(' / ')} · aperçu « ${ansi.remplacement} » · après association manuelle, bouton actif=${ajoutActif} · ligne du devis « ${ligneAlteree} »`);
        await capture(page, 'c164-bordereau-windows1252-390');

        // C175 — règlement partiel lu sur téléphone.
        await ouvrirFacturerDevis(page);
        await cliquer(page, /^Créer le brouillon$/, { sel: 'button' });
        await attendre(1800);
        await emettreFactureActive(page);
        await cliquer(page, /^Enregistrer un règlement pour la facture FACT-2026-001$/, { sel: 'button' });
        await attendre(1200);
        await saisirNombre(page, '#reglement_montant_commun', 5000000);
        await cliquer(page, /^Valider le règlement$/, { sel: '[role=dialog] button' });
        await attendre(1800);
        const regle = await mesurerTexte(page, /^Réglé : 5[\s\u202f\u00a0]000[\s\u202f\u00a0]000 FCFA$/);
        const reste = await mesurerTexte(page, /^Reste : 15[\s\u202f\u00a0]589[\s\u202f\u00a0]256 FCFA$/);
        const debord = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        await capture(page, 'c175-reglement-partiel-390');
        ok('[C175] 390 px : « Réglé » et « Reste » lisibles sur la fiche (contraste ≥ 4,5:1), sans défilement horizontal',
            regle && reste && regle.contraste >= 4.5 && reste.contraste >= 4.5 && debord <= 0, `${JSON.stringify(regle)} · ${JSON.stringify(reste)} · débordement ${debord}px`);
        await aller(page, '#factures');
        const carte = await page.evaluate(() => [...document.querySelectorAll('[aria-label^="Voir la facture"]')].map((e) => ({ t: e.innerText.replace(/\s+/g, ' '), w: Math.round(e.getBoundingClientRect().width) }))[0]);
        ok('[C175] 390 px : la carte de la liste montre l’état « partiel » et le pourcentage réglé', /Partiel/i.test(carte?.t || '') && /24 ?%|\d+ ?%/.test(carte?.t || ''), JSON.stringify(carte));
        ok('[G9] Mobile : aucune requête externe, aucune erreur JS', s.etat.externes.length === 0 && s.erreurs.length === 0, `${s.etat.externes.join(',')} ${s.erreurs.join(' | ')}`);
    } finally { await s.fermer(); }
}

export const SECTIONS = { bordereau: sectionBordereau, materiaux: sectionMateriaux, factures: sectionFactures, devise: sectionDevise, logo: sectionLogo, mobile: sectionMobile };

export async function run(choix = Object.keys(SECTIONS)) {
    const results = [];
    const ok = (label, pass, detail = '') => results.push({ label, pass: Boolean(pass), detail: String(detail) });
    for (const nom of choix) {
        const f = SECTIONS[nom];
        if (!f) continue;
        const debut = results.length;
        try { await f(ok); } catch (e) {
            if (/timeout|Timeout|délai/.test(String(e))) {
                results.splice(debut);
                try { await f(ok); continue; } catch (e2) { ok(`section « ${nom} » interrompue (après nouvelle tentative)`, false, String(e2).slice(0, 400)); continue; }
            }
            ok(`section « ${nom} » interrompue`, false, String(e).slice(0, 400));
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
