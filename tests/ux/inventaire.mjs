#!/usr/bin/env node
// Audit UX 220 contrôles (2026-10) — robot d'inventaire.
//
// Parcourt chaque écran accessible en Mode Démo, à plusieurs largeurs, et
// relève chaque élément interactif : rôle, libellé visible, nom accessible,
// état d'activation, taille de cible, contraste. Produit l'inventaire CSV et
// un JSON de mesures (débordements, contrastes, cibles, éléments cliquables
// non focalisables, erreurs console, requêtes externes tentées).
//
// Environnement : serveur isolé sur 127.0.0.1:8299 (config factice). Toute
// requête vers un autre hôte est BLOQUÉE et consignée — l'inventaire ne peut
// donc rien écrire nulle part, ni staging ni production.
//
//   UX_BASE=http://127.0.0.1:8299/  UX_OUT=docs/audit-ux-220  node tests/ux/inventaire.mjs
import puppeteer from 'puppeteer';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.UX_BASE || 'http://127.0.0.1:8299/';
const OUT = process.env.UX_OUT || 'docs/audit-ux-220';
const PREUVES = path.join(OUT, 'UX_EVIDENCE', 'inventaire');
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

const LARGEURS = [
    { nom: 'desktop-1440', width: 1440, height: 900 },
    { nom: 'mobile-390', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
];

// Routes connues du code (index_jsx.js, syncFromUrl).
const ROUTES = ['#dashboard', '#chantiers', '#clients', '#chiffrage', '#devis', '#factures',
    '#depenses', '#ouvrages', '#materiaux', '#abonnement', '#settings/entreprise'];

// --- Mesures exécutées DANS la page ----------------------------------------
function relever() {
    const SELECTEUR = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], [role="combobox"], [role="option"], [role="radio"], [tabindex]:not([tabindex="-1"])';
    const visible = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.01;
    };
    const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
    const nomAccessible = (el) => {
        const lb = el.getAttribute('aria-labelledby');
        if (lb) return { nom: norm(lb.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ')), source: 'aria-labelledby' };
        const al = el.getAttribute('aria-label');
        if (al && al.trim()) return { nom: norm(al), source: 'aria-label' };
        if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
            if (el.id) {
                const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
                if (l && norm(l.textContent)) return { nom: norm(l.textContent), source: 'label[for]' };
            }
            const parent = el.closest('label');
            if (parent && norm(parent.textContent)) return { nom: norm(parent.textContent), source: 'label parent' };
            if (el.title) return { nom: norm(el.title), source: 'title' };
            if (el.placeholder) return { nom: norm(el.placeholder), source: 'placeholder' };
            return { nom: '', source: 'aucune' };
        }
        const t = norm(el.innerText || el.textContent);
        if (t) return { nom: t, source: 'contenu' };
        const img = el.querySelector('img[alt], svg[aria-label]');
        if (img) return { nom: norm(img.getAttribute('alt') || img.getAttribute('aria-label')), source: 'image' };
        if (el.title) return { nom: norm(el.title), source: 'title' };
        return { nom: '', source: 'aucune' };
    };
    const lum = (c) => {
        const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const parse = (s) => {
        const m = (s || '').match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
        return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
    };
    const fond = (el) => {
        let e = el;
        while (e) {
            const bg = parse(getComputedStyle(e).backgroundColor);
            if (bg && bg[3] > 0.9) return bg.slice(0, 3);
            e = e.parentElement;
        }
        return [255, 255, 255];
    };
    const ratio = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };

    const elements = [...document.querySelectorAll(SELECTEUR)].filter(visible);
    const interactions = elements.map((el) => {
        const r = el.getBoundingClientRect();
        const { nom, source } = nomAccessible(el);
        const libelle = norm(el.innerText || el.value || '').slice(0, 80);
        const role = el.getAttribute('role') || ({ A: 'link', BUTTON: 'button', SELECT: 'combobox', TEXTAREA: 'textbox', SUMMARY: 'button' }[el.tagName])
            || (el.tagName === 'INPUT' ? `input:${el.type}` : el.tagName.toLowerCase());
        const ariaLabel = el.getAttribute('aria-label');
        // 2.5.3 Label in Name : le texte visible doit se retrouver dans le nom.
        const labelDansNom = !(ariaLabel && libelle && libelle.length > 2 && !norm(ariaLabel).toLowerCase().includes(libelle.toLowerCase().slice(0, 40)));
        // Lien en ligne dans une phrase : exception du critère 2.5.8.
        const enLigne = el.tagName === 'A' && el.closest('p, li') && getComputedStyle(el).display === 'inline';
        return {
            role, nom, sourceNom: source, libelle,
            desactive: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
            largeur: Math.round(r.width), hauteur: Math.round(r.height),
            cibleSous24: !enLigne && (r.width < 24 || r.height < 24),
            nomParPlaceholder: source === 'placeholder',
            labelDansNom,
            href: el.tagName === 'A' ? el.getAttribute('href') : null
        };
    });

    // Cliquable à la souris mais pas au clavier : cursor:pointer sur un
    // élément non focalisable, sans ancêtre ni descendant interactif.
    const cliquablesNonFocalisables = [...document.querySelectorAll('div, span, li, tr, td, img, svg, p, i')]
        .filter((el) => visible(el) && getComputedStyle(el).cursor === 'pointer'
            && !el.closest(SELECTEUR) && !el.querySelector(SELECTEUR)
            && (el.parentElement ? getComputedStyle(el.parentElement).cursor !== 'pointer' : true))
        .slice(0, 40)
        .map((el) => ({ balise: el.tagName.toLowerCase(), texte: norm(el.innerText).slice(0, 60), classe: String(el.className).slice(0, 60) }));

    const contrastes = [];
    for (const el of document.querySelectorAll('body *')) {
        if (el.children.length || !norm(el.textContent) || !visible(el) || el.closest('[aria-hidden="true"]')) continue;
        const cs = getComputedStyle(el);
        const fg = parse(cs.color);
        if (!fg) continue;
        const rt = ratio(fg.slice(0, 3), fond(el));
        const px = parseFloat(cs.fontSize), gras = parseInt(cs.fontWeight, 10) >= 700;
        const seuil = (px >= 24 || (px >= 18.66 && gras)) ? 3 : 4.5;
        if (rt < seuil - 0.01) contrastes.push({ texte: norm(el.textContent).slice(0, 40), couleur: cs.color, ratio: +rt.toFixed(2), seuil, px });
    }

    const ids = {};
    for (const el of document.querySelectorAll('[id]')) ids[el.id] = (ids[el.id] || 0) + 1;

    return {
        h1: norm(document.querySelector('h1')?.innerText || ''),
        hash: location.hash,
        debordementHorizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        interactions,
        cliquablesNonFocalisables,
        contrastes: contrastes.slice(0, 40),
        nbContrastes: contrastes.length,
        idsEnDouble: Object.entries(ids).filter(([, n]) => n > 1).map(([id, n]) => `${id}×${n}`),
        imagesSansAlt: [...document.querySelectorAll('img')].filter((i) => visible(i) && !i.hasAttribute('alt')).length
    };
}

async function entrerEnDemo(page) {
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
    await page.reload({ waitUntil: 'networkidle0' });
    const ok = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) => /Essayer sans compte|Mode Démo/i.test(x.textContent || ''));
        b?.click();
        return Boolean(b);
    });
    if (!ok) throw new Error('Entrée en démo introuvable');
    await attendre(2500);
}

const lignesCsv = [];
const mesures = [];
let compteur = 0;
const echapper = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

await mkdir(PREUVES, { recursive: true });
const navigateur = await puppeteer.launch({ headless: true });
try {
    for (const vp of LARGEURS) {
        const page = await navigateur.newPage();
        await page.setViewport(vp);
        const externes = [];
        const consoleErreurs = [];
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const u = new URL(req.url());
            if (/^https?:$/.test(u.protocol) && u.hostname !== '127.0.0.1') {
                externes.push(u.hostname);
                return req.abort();
            }
            req.continue();
        });
        page.on('console', (m) => { if (m.type() === 'error') consoleErreurs.push(m.text().slice(0, 160)); });
        page.on('pageerror', (e) => consoleErreurs.push(`pageerror: ${String(e).slice(0, 160)}`));

        await entrerEnDemo(page);
        const etapes = [{ route: '(atterrissage)', aller: null }, ...ROUTES.map((r) => ({ route: r, aller: r }))];

        for (const etape of etapes) {
            if (etape.aller) {
                await page.evaluate((h) => { window.location.hash = h; }, etape.aller);
                await attendre(1200);
            }
            const capture = path.join(PREUVES, `${vp.nom}_${etape.route.replace(/[#/()]/g, '_')}.png`);
            await page.screenshot({ path: capture, fullPage: false });
            const m = await page.evaluate(relever);
            mesures.push({ largeur: vp.nom, route: etape.route, ...m, interactions: undefined, nbInteractions: m.interactions.length });
            for (const it of m.interactions) {
                compteur += 1;
                lignesCsv.push([
                    `INT-${String(compteur).padStart(4, '0')}`, etape.route, 'Invité (démo, propriétaire)', vp.nom,
                    it.role, it.libelle, it.nom,
                    it.desactive ? 'désactivé' : 'actif', '', '', path.relative(OUT, capture), 'INVENTORIÉ',
                    it.largeur, it.hauteur, it.cibleSous24 ? 'oui' : '', it.sourceNom, it.nomParPlaceholder ? 'oui' : '',
                    it.labelDansNom ? '' : 'non', it.href || ''
                ].map(echapper).join(';'));
            }
        }
        mesures.push({ largeur: vp.nom, route: '(bilan)', requetesExternesBloquees: [...new Set(externes)], consoleErreurs: [...new Set(consoleErreurs)].slice(0, 30) });
        await page.close();
    }
} finally {
    await navigateur.close();
}

const entete = 'ID;route;rôle;état;élément;libellé visible;nom accessible;condition d’activation;résultat attendu;scénario;preuve;statut;largeur px;hauteur px;cible < 24 px;source du nom;nom par placeholder;libellé absent du nom;href';
await writeFile(path.join(OUT, 'UX_INTERACTION_INVENTORY.csv'), '﻿' + [entete, ...lignesCsv].join('\n'));
await writeFile(path.join(OUT, 'UX_EVIDENCE', 'inventaire-mesures.json'), JSON.stringify(mesures, null, 2));
console.log(`${compteur} interactions relevées sur ${mesures.filter((m) => m.route !== '(bilan)').length} écrans×largeurs.`);
for (const m of mesures) {
    if (m.route === '(bilan)') { console.log(`[${m.largeur}] externes bloquées: ${m.requetesExternesBloquees.join(', ') || 'aucune'} · erreurs console: ${m.consoleErreurs.length}`); continue; }
    console.log(`[${m.largeur}] ${m.route.padEnd(20)} h1="${m.h1}" hash=${m.hash} interactions=${m.nbInteractions} débord=${m.debordementHorizontal} contrastes=${m.nbContrastes} cliquables-non-focalisables=${m.cliquablesNonFocalisables.length} ids-doubles=${m.idsEnDouble.length}`);
}
