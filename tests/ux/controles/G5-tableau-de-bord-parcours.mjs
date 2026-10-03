#!/usr/bin/env node
// Audit UX 220 contrôles — groupe G5 « tableau de bord & parcours »
// Contrôles : C081 C082 C083 C084 C085 C086 C087 C088 C089 C090 C092 C093 C095 C098 C099
//
// Environnement : Mode Démo uniquement (données fictives locales), configuration
// factice (config.example.js), réseau externe BLOQUÉ, serveur statique local.
// Chaque session part d'un contexte de navigation neuf (stockage vide).
// Les actions sont jouées comme un utilisateur : clics réels (ElementHandle.click
// = souris aux coordonnées de l'élément), vraies touches (page.keyboard), vraie
// molette (page.mouse.wheel). Les mesures portent sur l'écran rendu (rectangles,
// styles calculés) et sur le stockage local.
//
// Sortie : export async function run() → [{ label, pass, detail }]
// Les libellés commencent par l'identifiant du contrôle (« C082 · … »).
// Exécution directe : node tests/ux/controles/G5-tableau-de-bord-parcours.mjs
import puppeteer from 'puppeteer';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { startServer } from '../../../scratch/lib/server.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const PREUVES = path.resolve(ICI, '../../../docs/audit-ux-220/UX_EVIDENCE/G5-tableau-de-bord-parcours');
const CONFIG = await readFile(new URL('../../../config.example.js', import.meta.url), 'utf8');
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const montant = (s) => { const m = String(s || '').replace(/ | /g, ' ').match(/-?\d[\d ]*/); return m ? Number(m[0].replace(/ /g, '')) : null; };

// ─── Outillage ───────────────────────────────────────────────────────────
async function ouvrirSession(browser, { width = 1440, height = 900, mobile = false } = {}) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width, height, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    const externes = [];
    page.on('request', (r) => {
        const u = new URL(r.url());
        if (u.pathname === '/config.js') return r.respond({ contentType: 'application/javascript', body: CONFIG });
        if (/^https?:$/.test(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname)) { externes.push(u.hostname); return r.abort(); }
        r.continue();
    });
    // Journal des notifications (role=status / role=alert) apparues à l'écran.
    await page.evaluateOnNewDocument(() => {
        window.__notifs = [];
        const noter = () => document.querySelectorAll('[role="status"],[role="alert"]').forEach((n) => {
            const t = (n.innerText || '').replace(/\s+/g, ' ').trim();
            if (t && !window.__notifs.includes(t)) window.__notifs.push(t);
        });
        document.addEventListener('DOMContentLoaded', () => new MutationObserver(noter).observe(document.body, { childList: true, subtree: true, characterData: true }));
    });
    return { ctx, page, externes };
}

async function entrerEnDemo(page, url, { vider = true } = {}) {
    await page.goto(url + '/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
    if (vider) { await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'networkidle0', timeout: 60000 }); }
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Essayer sans compte'), { timeout: 30000 });
    const b = await trouver(page, (x) => x.tagName === 'BUTTON' && x.innerText.trim() === 'Essayer sans compte');
    await b.click();
    await attendre(3000);
    await page.waitForFunction(() => /Tableau de bord de pilotage/i.test(document.body.innerText), { timeout: 30000 }).catch(() => {});
}

// Renvoie le premier élément visible satisfaisant le prédicat (sérialisé).
async function trouver(page, predicat, arg, selecteur = 'button, a, tr, [role="option"], [role="menuitem"], summary, div, span, input, select') {
    const h = await page.evaluateHandle((src, a, sel) => {
        const f = new Function('b', 'a', `return (${src})(b, a);`);
        return [...document.querySelectorAll(sel)].filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).find((x) => f(x, a)) || null;
    }, predicat.toString(), arg, selecteur);
    const el = h.asElement();
    if (!el) throw new Error(`Élément introuvable : ${predicat.toString().slice(0, 100)} ${arg ? JSON.stringify(arg) : ''}`);
    return el;
}
const nomOuTexte = (b, re) => new RegExp(re).test(((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || '')).trim());
async function cliquer(page, re, sel = 'button, a, tr, [role="option"], [role="menuitem"], summary') {
    const el = await trouver(page, (b, a) => new RegExp(a).test((b.getAttribute('aria-label') || b.innerText || '').trim()), re, sel);
    await el.click();
    return el;
}
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendre(1400); }
async function menu(page, libelle) {
    const el = await trouver(page, (b, a) => (b.innerText || '').trim() === a && !!b.closest('aside, nav'), libelle, 'a, button');
    await el.click();
    await attendre(1400);
}
async function saisirNatif(page, selecteur, valeur) {
    await page.evaluate((s, v) => {
        const c = document.querySelector(s);
        const proto = c instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(c, v);
        c.dispatchEvent(new Event('input', { bubbles: true }));
        c.dispatchEvent(new Event('change', { bubbles: true }));
    }, selecteur, valeur);
}
// Vide le champ (valeur native + événement, comme une sélection-suppression), puis frappe réelle au clavier.
async function taper(page, selecteur, texte) {
    await saisirNatif(page, selecteur, '');
    const el = await page.$(selecteur);
    await el.click();
    await page.keyboard.type(texte, { delay: 25 });
    await attendre(200);
}
const texteMain = (page) => page.evaluate(() => (document.querySelector('main') || document.body).innerText);
const notifs = (page) => page.evaluate(() => window.__notifs.filter((t) => !/^Chargement/.test(t)));
const viderNotifs = (page) => page.evaluate(() => { window.__notifs = []; });
async function capture(page, nom) { try { await page.screenshot({ path: path.join(PREUVES, nom + '.png') }); } catch (e) { /* capture facultative */ } }
async function confirmerDialogue(page, libelle) {
    const el = await trouver(page, (b, a) => (b.innerText || '').trim() === a && !!b.closest('[role="dialog"], [role="alertdialog"], .fixed'), libelle, 'button');
    await el.click();
    await attendre(1200);
}
async function etatTableau(page) {
    return page.evaluate(() => {
        const kpi = document.querySelector('section[aria-label="Indicateurs clés"]');
        const cartes = kpi ? [...kpi.children].map((c) => {
            const ps = [...c.querySelectorAll('p')];
            return { label: ps[0]?.innerText.trim(), valeur: ps[1]?.innerText.trim(), detail: ps[2]?.innerText.trim() };
        }) : [];
        const sections = [...document.querySelectorAll('main h2, main h3')].map((h) => h.innerText.trim());
        const pipeline = [...document.querySelectorAll('main section')].find((s) => /Pipeline Commercial/.test(s.innerText));
        return { cartes, sections, pipelineTexte: pipeline ? pipeline.innerText.replace(/\s+/g, ' ') : null, tout: (document.querySelector('main') || document.body).innerText };
    });
}
const carte = (etat, re) => etat.cartes.find((c) => new RegExp(re, 'i').test(c.label || '')) || {};

// Ratio de contraste WCAG entre la couleur du texte et le premier fond opaque.
async function contraste(page, handle) {
    return page.evaluate((el) => {
        const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
        const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const cs = getComputedStyle(el);
        let n = el, fond = null;
        while (n) { const c = getComputedStyle(n).backgroundColor; const v = rgb(c); if (v.length >= 3 && (v[3] === undefined || v[3] > 0.9)) { fond = v; break; } n = n.parentElement; }
        fond = fond || [255, 255, 255];
        const a = lum(rgb(cs.color)), b = lum(fond);
        return { ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100, taille: parseFloat(cs.fontSize), couleur: cs.color };
    }, handle);
}

// Crée un devis complet dans l'éditeur (ouvrage du catalogue + métré + client).
async function chiffrerDevis(page, { client, surface = '120' }) {
    await saisirNatif(page, 'input[placeholder*="Rechercher un ouvrage"]', 'maçonnerie');
    await attendre(900);
    await cliquer(page, 'Maçonnerie en Murs', '[role="option"]');
    await attendre(1500);
    await saisirNatif(page, 'input[aria-label="Surface directe (m²)"]', surface);
    await attendre(800);
    await cliquer(page, '^Confirmer mes quantités$');
    await attendre(700);
    if (client) {
        await saisirNatif(page, 'input[aria-label^="Client du devis"]', client);
        await attendre(800);
        await cliquer(page, `^Créer « ${client} »$`, '[role="option"]');
        await attendre(1000);
        await cliquer(page, '^Créer le client$');
        await attendre(1200);
    }
}

// ─── Résultats ───────────────────────────────────────────────────────────
export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: Boolean(cond), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
    const bloque = (id, etape, e) => results.push({ label: `${id} · BLOQUÉ à l'étape « ${etape} »`, pass: false, detail: String(e && e.message || e).slice(0, 300) });
    await mkdir(PREUVES, { recursive: true });
    const { url, close: fermerServeur } = await startServer();
    const browser = await puppeteer.launch({ headless: true, protocolTimeout: 180000 });
    const externesTous = [];
    try {
        // ════════════════════════════════════════════════════════════════
        // SESSION A — 1440×900 : tableau de bord, période, cartes, parcours
        //             devis → facture → règlement, propagation, notifications
        // ════════════════════════════════════════════════════════════════
        {
            const { ctx, page, externes } = await ouvrirSession(browser, { width: 1440, height: 900 });
            try {
                await entrerEnDemo(page, url);
                await capture(page, 'A01-tableau-de-bord-1440');
                const e0 = await etatTableau(page);
                const devisStockes = await page.evaluate(() => JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]').map((q) => ({ n: q.number, date: q.date, statut: q.status, ttc: q.quoteData?.totalTTCConsomme })));
                const aujourdHui = await page.evaluate(() => { const d = new Date(); return { j: d.getDate(), m: d.getMonth() + 1, a: d.getFullYear() }; });

                // ── C081 : indicateurs vs décisions du propriétaire (rôle de la démo)
                const role = await page.evaluate(() => [...document.querySelectorAll('header button')].map((b) => b.innerText).join(' | '));
                const libelles = e0.cartes.map((c) => c.label);
                ok('C081 · Rôle connecté identifiable en démo (propriétaire)', /IKADEVIS BTP/.test(role), `barre haute : ${norm(role).slice(0, 120)} ; cartes : ${libelles.join(' / ')}`);
                ok('C081 · Décision « quels devis relancer » : un indicateur existe', libelles.some((l) => /suivre/i.test(l)), libelles.join(' / '));
                ok('C081 · Décision « chantiers en cours » : un indicateur existe', libelles.some((l) => /chantier/i.test(l)));

                // ── C082 : unités / TTC-HT
                const monetaires = e0.cartes.filter((c) => /FCFA/.test(c.valeur || ''));
                ok('C082 · Unité monétaire affichée sur chaque total en argent', monetaires.length === 2 && /FCFA/.test(e0.pipelineTexte || ''), e0.cartes.map((c) => `${c.label}=${c.valeur}`).join(' ; '));
                const sansTaxe = e0.cartes.filter((c) => /FCFA/.test(c.valeur || '') && !/TTC|HT/.test(c.label + ' ' + c.detail));
                ok('C082 · Chaque total en argent précise TTC ou HT', sansTaxe.length === 0 && /TTC|HT/.test(e0.pipelineTexte || ''),
                    `sans mention : ${sansTaxe.map((c) => c.label).join(', ') || '—'} ; pipeline sans mention TTC/HT : ${!/TTC|HT/.test(e0.pipelineTexte || '')}`);

                // ── C082 / C088 : filtre de période (clics réels) + date du devis stocké
                const parPeriode = {};
                for (const p of ['Ce mois', 'Trimestre', 'Année', 'Tout']) {
                    const b = await trouver(page, (x, a) => x.tagName === 'BUTTON' && x.innerText.trim() === a && !!x.closest('header'), p, 'button');
                    await b.click();
                    await attendre(700);
                    const e = await etatTableau(page);
                    const etatBouton = await page.evaluate((el) => ({ pressed: el.getAttribute('aria-pressed'), current: el.getAttribute('aria-current'), selected: el.getAttribute('aria-selected'), fond: getComputedStyle(el).backgroundColor }), b);
                    const recents = await page.evaluate(() => { const s = [...document.querySelectorAll('main section')].find((x) => /Devis récents/.test(x.innerText)); return s ? (s.innerText.match(/DEV-\d{4}-\d{3}/g) || []) : []; });
                    parPeriode[p] = { total: carte(e, 'Total des devis').valeur, nb: carte(e, 'Total des devis').detail, chantiers: carte(e, 'Chantiers').valeur, libelles: e.cartes.map((c) => c.label + ' ' + c.detail).join(' | '), recents, etatBouton };
                    if (p === 'Ce mois') await capture(page, 'A02-periode-ce-mois-devis-du-jour-exclu');
                }
                const dateDevis = devisStockes[0]?.date;
                const devisDuJour = dateDevis === `${String(aujourdHui.j).padStart(2, '0')}/${String(aujourdHui.m).padStart(2, '0')}/${aujourdHui.a}`;
                ok(`C082 · « Ce mois » inclut le devis daté d'aujourd'hui (${dateDevis})`, devisDuJour && montant(parPeriode['Ce mois'].total) === devisStockes[0].ttc,
                    `stocké ${dateDevis} ; Ce mois → ${parPeriode['Ce mois'].total} (${parPeriode['Ce mois'].nb}) ; Trimestre → ${parPeriode.Trimestre.total} ; Année → ${parPeriode['Année'].total} ; Tout → ${parPeriode.Tout.total}`);
                ok('C082 · « Trimestre » inclut le devis daté d\'aujourd\'hui', montant(parPeriode.Trimestre.total) === devisStockes[0].ttc, `Trimestre → ${parPeriode.Trimestre.total} (${parPeriode.Trimestre.nb})`);
                ok('C082 · Sur « Ce mois », la liste « Devis récents » et la carte « Total des devis » portent le même périmètre',
                    (parPeriode['Ce mois'].recents.length > 0) === (montant(parPeriode['Ce mois'].total) > 0),
                    `carte : ${parPeriode['Ce mois'].nb} ; liste : ${parPeriode['Ce mois'].recents.join(', ') || 'vide'}`);
                ok('C082 · La période active est rappelée dans les libellés des indicateurs', /mois|octobre|période/i.test(parPeriode['Ce mois'].libelles), parPeriode['Ce mois'].libelles);
                ok('C082 · « Chantiers actifs » signale qu\'il ignore la période (même valeur sur toutes les périodes, sans mention)',
                    !(new Set(Object.values(parPeriode).map((v) => v.chantiers)).size === 1 && !/période|tout l/i.test(parPeriode['Ce mois'].libelles)),
                    Object.entries(parPeriode).map(([k, v]) => `${k}:${v.chantiers}`).join(' '));
                const etatSel = parPeriode.Tout.etatBouton;
                ok('C082/C088 · Bouton de période sélectionné exposé aux technologies d\'assistance (aria-pressed/current/selected)',
                    [etatSel.pressed, etatSel.current, etatSel.selected].some((v) => v === 'true' || v === 'page'), JSON.stringify(etatSel));

                // ── C082 : périmètre « premier devis » vs devis compté
                const quota = await page.evaluate(() => (document.querySelector('aside')?.innerText.match(/\d+\/\d+ devis/) || [''])[0]);
                const cta = await page.evaluate(() => { const s = [...document.querySelectorAll('main section')].find((x) => /prochain chantier commence/.test(x.innerText)); return s?.querySelector('button')?.innerText.trim(); });
                ok('C082 · Périmètre cohérent : l\'appel « premier devis » et les compteurs comptent les mêmes devis',
                    !(/premier devis/i.test(cta || '') && (/^[1-9]/.test(quota) || /[1-9] devis chiffr/.test(carte(e0, 'Total des devis').detail || ''))),
                    `bouton : « ${cta} » ; carte : « ${carte(e0, 'Total des devis').detail} » ; formule : « ${quota} »`);

                // ── C083 : détail d'un indicateur (clic réel au centre de chaque carte)
                const kpis = await page.$$('section[aria-label="Indicateurs clés"] > div');
                const avant = await page.evaluate(() => ({ h: location.hash, t: document.querySelector('main h1')?.innerText }));
                const reactions = [];
                for (const k of kpis) {
                    const info = await page.evaluate((el) => ({ label: el.querySelector('p')?.innerText.trim(), cursor: getComputedStyle(el).cursor, ombre: getComputedStyle(el).boxShadow, title: el.getAttribute('title') || el.querySelector('[title]')?.getAttribute('title') || null, tab: el.tabIndex, role: el.getAttribute('role'), descr: el.getAttribute('aria-describedby') }), k);
                    await k.hover(); await attendre(350);
                    const ombreSurvol = await page.evaluate((el) => getComputedStyle(el).boxShadow, k);
                    await k.click(); await attendre(900);
                    const apres = await page.evaluate(() => ({ h: location.hash, t: document.querySelector('main h1')?.innerText, dlg: !!document.querySelector('[role="dialog"]') }));
                    reactions.push({ ...info, survolChange: ombreSurvol !== info.ombre, reagit: apres.h !== avant.h || apres.t !== avant.t || apres.dlg });
                }
                ok('C083 · Une carte indicateur ouvre le détail de ce qui la compose', reactions.some((r) => r.reagit),
                    reactions.map((r) => `${r.label}: clic→${r.reagit ? 'réaction' : 'rien'}, curseur ${r.cursor}, title ${r.title ? 'oui' : 'non'}, focusable ${r.tab >= 0}`).join(' ; '));
                const survolSupporte = await page.evaluate(() => matchMedia('(hover: hover)').matches);
                if (survolSupporte) ok('C083 · Une carte non interactive ne simule pas l\'interactivité au survol', !reactions.some((r) => r.survolChange && !r.reagit),
                    reactions.map((r) => `${r.label}: ombre au survol ${r.survolChange ? 'change' : 'fixe'}`).join(' ; '));
                const etapesPipeline = await page.evaluate(() => { const s = [...document.querySelectorAll('main section')].find((x) => /Pipeline Commercial/.test(x.innerText)); return s ? [...s.querySelectorAll('button, a, [role="button"]')].length : -1; });
                ok('C083 · Les étapes du pipeline mènent à la liste des devis concernés', etapesPipeline > 0, `${etapesPipeline} élément(s) interactif(s) dans le pipeline`);

                // ── C084 (cas 1) : absence de facture
                const tf = carte(e0, 'Total Factur');
                ok('C084 · Absence de facture dite explicitement (pas un simple 0)', /Aucune facture/i.test(tf.detail || ''), `${tf.valeur} / ${tf.detail}`);

                // ── C085 (cas 1) : barre de répartition du pipeline ↔ texte
                const barre = await page.evaluate(() => {
                    const s = [...document.querySelectorAll('main section')].find((x) => /Pipeline Commercial/.test(x.innerText));
                    const seg = [...s.querySelectorAll('div[title]')].map((d) => ({ title: d.getAttribute('title'), w: d.getBoundingClientRect().width, hidden: d.closest('[aria-hidden="true"]') !== null }));
                    const total = seg.reduce((a, b) => a + b.w, 0);
                    const cellules = [...s.querySelectorAll('.grid > div')].map((c) => c.innerText.replace(/\s+/g, ' ').trim());
                    return { seg: seg.map((x) => ({ ...x, part: Math.round((x.w / total) * 100) })), cellules };
                });
                ok('C085 · Le graphique du pipeline a un équivalent textuel (nombre et montant par étape)', barre.cellules.length === 4 && barre.cellules.every((c) => /\d/.test(c) && /FCFA/.test(c)),
                    `segments : ${barre.seg.map((s) => `${s.title}=${s.part}%`).join(', ')} ; texte : ${barre.cellules.join(' | ')}`);

                // ── C086 (cas 1) : avertissement « données sur cet appareil »
                const avert = await trouver(page, (x) => /conservé sur cet appareil uniquement/.test(x.innerText || '') && x.children.length === 0, null, 'p, span, div');
                const avR = await page.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; }, avert);
                const avC = await contraste(page, avert);
                ok('C086 · Avertissement « démonstration locale » visible sans défilement à 1440, contraste ≥ 4,5:1', avR.bottom <= 900 && avC.ratio >= 4.5, `y=${avR.top}-${avR.bottom}, ${avC.taille}px, contraste ${avC.ratio}:1`);
                const anim = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.getTiming?.().iterations === Infinity).map((a) => a.effect?.target).filter(Boolean).filter((t) => t.closest('main')).map((t) => String(t.className).slice(0, 60)));
                ok('C086 · Aucune animation décorative permanente sur le tableau de bord par défaut', anim.length === 0, anim.join(' ; ') || 'aucune animation en boucle');

                // ── C090 (cas 1) : ligne « Devis récents » → même devis, même montant
                await aller(page, '#dashboard');
                const ligneDevis = await trouver(page, (b) => b.tagName === 'BUTTON' && /DEV-2026-001/.test(b.innerText) && !!b.closest('main'), null, 'button');
                const montantCarte = await page.evaluate((el) => (el.innerText.match(/[\d   ]+FCFA/) || [''])[0], ligneDevis);
                await ligneDevis.click(); await attendre(1500);
                const dest = await page.evaluate(() => ({ h: location.hash, txt: (document.querySelector('main') || document.body).innerText }));
                const ttcDest = (dest.txt.match(/TOTAL TTC :\s*([\d   ]+FCFA)/) || [])[1];
                ok('C090 · « Devis récents » → fiche du même devis, même montant TTC', /DEV-2026-001/.test(dest.txt) && montant(ttcDest) === montant(montantCarte), `carte ${norm(montantCarte)} → fiche ${norm(ttcDest)}`);
                ok('C090 · La destination a une adresse propre (#devis/<id>), comme depuis la liste', /#devis\/\w+/.test(dest.h), `adresse après clic : « ${dest.h || '(vide)'} » (cf. UX-P2-06)`);

                // ── C092 (1440) : prochaine étape sur la fiche d'un devis accepté
                const etapeDevis = await page.evaluate(() => {
                    const b = [...document.querySelectorAll('main button')].find((x) => /Facturer le devis/.test(x.getAttribute('aria-label') || ''));
                    const r = b?.getBoundingClientRect();
                    const prim = [...document.querySelectorAll('main button.btn-primary')].filter((x) => x.getBoundingClientRect().width > 0).map((x) => x.innerText.trim());
                    return { visible: !!r && r.top >= 0 && r.bottom <= innerHeight, texte: b?.innerText.trim(), nom: b?.getAttribute('aria-label'), primaires: prim };
                });
                ok('C092 · Devis accepté (1440) : l\'action suivante (facturer) est visible sans défilement', etapeDevis.visible, `« ${etapeDevis.texte} » ; boutons mis en avant : ${etapeDevis.primaires.join(' / ')}`);
                // Nom accessible contenant le libellé visible (WCAG 2.5.3) sur les actions de transition
                // Les listes déroulantes (aria-haspopup) affichent une VALEUR, pas une étiquette : exclues.
                const etiquettes = await page.evaluate(() => [...document.querySelectorAll('main button')].filter((b) => b.getBoundingClientRect().width > 0 && b.getAttribute('aria-label') && !b.getAttribute('aria-haspopup') && b.innerText.trim().length > 2)
                    .map((b) => ({ vis: b.innerText.replace(/\s+/g, ' ').trim(), nom: b.getAttribute('aria-label') }))
                    .filter((x) => !x.nom.toLowerCase().includes(x.vis.toLowerCase()))
                    .map((x) => ({ ...x, aucunMotCommun: !x.vis.toLowerCase().split(/[^a-zàâçéèêëîïôûùüÿœ]+/).filter((m) => m.length > 3).some((m) => x.nom.toLowerCase().includes(m)) })));
                ok('C092 · Les actions de la fiche devis ont un nom accessible qui contient leur libellé visible (WCAG 2.5.3)', etiquettes.length === 0,
                    etiquettes.map((x) => `« ${x.vis} » → nom « ${x.nom} »${x.aucunMotCommun ? ' [aucun mot commun]' : ' [mots communs, ordre/forme différents]'}`).join(' ; '));

                // ── C099 (cas 1) + C092 + C093 : Facturer → brouillon → émission
                await viderNotifs(page);
                await cliquer(page, '^Facturer le devis DEV-2026-001$'); await attendre(1300);
                await cliquer(page, '^Créer le brouillon$'); await attendre(1800);
                const brouillon = await page.evaluate(() => {
                    const t = (document.querySelector('main') || document.body).innerText;
                    const b = [...document.querySelectorAll('main button')].find((x) => /^Émettre la facture de/.test(x.getAttribute('aria-label') || ''));
                    const r = b?.getBoundingClientRect();
                    return { t, emettreVisible: !!r && r.top >= 0 && r.bottom <= innerHeight, primaire: b?.className.includes('btn-primary') };
                });
                ok('C099 · Facturer reprend client, chantier et devis d\'origine sans ressaisie', /Société Immobilière NBB/.test(brouillon.t) && /Construction Siège NBB/.test(brouillon.t) && /DEV-2026-001/.test(brouillon.t));
                ok('C092 · Brouillon de facture (1440) : « Émettre la facture » mis en avant et visible', brouillon.emettreVisible && brouillon.primaire);
                ok('C093 · Le brouillon explique l\'étape suivante et son effet (numéro légal)', /Aucun numéro légal/.test(brouillon.t) && /Émettre la facture/.test(brouillon.t));
                await capture(page, 'A03-brouillon-facture-1440');
                await cliquer(page, '^Émettre la facture de'); await attendre(900);
                const dlgEmission = await page.evaluate(() => document.querySelector('[role="dialog"]')?.innerText || '');
                ok('C093 · L\'étape irréversible annonce l\'absence de retour et le moyen de corriger (avoir)', /ne peut plus être modifiée/.test(dlgEmission) && /avoir/i.test(dlgEmission), norm(dlgEmission).slice(0, 160));
                await confirmerDialogue(page, 'Émettre'); await attendre(800);
                const factStockee = await page.evaluate(() => JSON.parse(localStorage.getItem('costcalc:guest:invoices') || '[]')[0]);
                const nEmis = await notifs(page);
                ok('C098 · La notification d\'émission désigne la facture émise (numéro stocké)', nEmis.some((n) => n.includes(factStockee?.numero)), `stocké ${factStockee?.numero} ; notifications : ${nEmis.join(' ‖ ')}`);
                const emise = await page.evaluate(() => {
                    const t = (document.querySelector('main') || document.body).innerText;
                    const b = [...document.querySelectorAll('main button')].find((x) => /^Enregistrer un règlement pour la facture/.test(x.getAttribute('aria-label') || ''));
                    const r = b?.getBoundingClientRect();
                    return { t, visible: !!r && r.top >= 0 && r.bottom <= innerHeight, primaire: b?.className.includes('btn-primary'), dateDoc: (t.match(/Émise le ([^\n]+)/) || [])[1] };
                });
                ok('C092 · Facture émise (1440) : « Enregistrer un règlement » mis en avant et visible', emise.visible && emise.primaire);
                ok('C095 · La date d\'émission est affichée au format de la fiche (jj/mm/aaaa), pas en horodatage brut', !/T\d{2}:\d{2}/.test(emise.dateDoc || ''), `document facture : « Émise le ${emise.dateDoc} »`);
                await capture(page, 'A04-facture-emise-date-brute-1440');

                // Règlement partiel de 5 000 000 FCFA
                await cliquer(page, '^Enregistrer un règlement pour la facture FACT-'); await attendre(1100);
                await saisirNatif(page, '#reglement_montant_commun', '5000000'); await attendre(400);
                await cliquer(page, '^Valider le règlement$'); await attendre(1800);
                const quittance = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"], .fixed')].map((d) => d.innerText).find((t) => /Quittance de règlement/.test(t)) || '');
                ok('C095 · La quittance affiche la date d\'émission de la facture au format jj/mm/aaaa', /Émise le : \d{2}\/\d{2}\/\d{4}/.test(quittance), norm((quittance.match(/Émise le[^\n]*/) || [''])[0]));
                ok('C095 · La quittance est éditée au nom de l\'entreprise active (IKADEVIS BTP), sans autre marque', !/Micro Office BTP/.test(quittance), norm((quittance.match(/Édité[^\n]*/) || [''])[0]));
                await capture(page, 'A05a-quittance-reglement');
                await cliquer(page, '^Fermer$', '[role="dialog"] button, .fixed button'); await attendre(900);
                const fac = await page.evaluate(() => (document.querySelector('main') || document.body).innerText);
                const creances = (fac.match(/CRÉANCES CLIENTS\s*([\d   ]+FCFA)/) || [])[1];
                const totalEmis = (fac.match(/TOTAL FACTURÉ ÉMIS\s*([\d   ]+FCFA)/) || [])[1];
                const avancement = await page.evaluate(() => {
                    const m = (document.querySelector('main') || document.body).innerText.match(/Avancement du règlement : (\d+)%/);
                    return m ? Number(m[1]) : null;
                });
                ok('C085 · La jauge de règlement de la facture a un équivalent textuel (pourcentage, réglé, reste)', avancement !== null && /Réglé :/.test(fac) && /Reste :/.test(fac), `Avancement ${avancement}% ; ${norm((fac.match(/Réglé :[^\n]*\n?[^\n]*Reste :[^\n]*/) || [''])[0])}`);

                // Tableau de bord après règlement partiel
                await menu(page, 'Tableau de bord');
                const e1 = await etatTableau(page);
                const factureRecente = await page.evaluate(() => { const s = [...document.querySelectorAll('main section')].find((x) => /Facturation récente/.test(x.innerText)); return s ? s.innerText.replace(/\s+/g, ' ') : ''; });
                ok('C095 · Après règlement partiel, le tableau de bord montre l\'état courant de la facture (Partielle)', /FACT-2026-001/.test(factureRecente) && /Partielle/.test(factureRecente), factureRecente.slice(0, 160));
                ok('C095 · « Total facturé » du tableau de bord = « Total facturé émis » de l\'écran Factures', montant(carte(e1, 'Total Factur').valeur) === montant(totalEmis), `tableau ${carte(e1, 'Total Factur').valeur} / factures ${norm(totalEmis)}`);
                ok('C081 · Décision « que me doit-on ? » : le tableau de bord affiche le reste à encaisser', /créance|reste à (encaisser|percevoir|payer)|encaiss/i.test(e1.tout), `écran Factures : créances ${norm(creances)} ; tableau de bord : ${/créance|reste|encaiss/i.test(e1.tout) ? 'présent' : 'absent'}`);
                await capture(page, 'A05-tableau-apres-reglement-partiel');

                // ── C090 (cas 2-4) : chantier, facture, « Voir tous », action rapide facture
                const ligneFact = await trouver(page, (b) => b.tagName === 'BUTTON' && /FACT-2026-001/.test(b.innerText) && !!b.closest('main'), null, 'button');
                const mtFact = await page.evaluate((el) => (el.innerText.match(/[\d   ]+FCFA/) || [''])[0], ligneFact);
                await ligneFact.click(); await attendre(1500);
                const dFact = await page.evaluate(() => ({ h: location.hash, t: (document.querySelector('main') || document.body).innerText }));
                const montantsFiche = (dFact.t.match(/MONTANT TTC\s*([\d\u202f\u00a0 ]+)FCFA/) || [])[1];
                ok('C090 · « Facturation récente » → fiche de la même facture, même montant', /FACT-2026-001/.test(dFact.t) && montant(montantsFiche) === montant(mtFact), `ligne ${norm(mtFact)} → fiche « MONTANT TTC ${norm(montantsFiche)} FCFA » ; adresse ${dFact.h || '(vide)'}`);
                await menu(page, 'Tableau de bord');
                const ligneChantier = await trouver(page, (b) => b.tagName === 'BUTTON' && /Rénovation Façades ACM/.test(b.innerText) && !!b.closest('main'), null, 'button');
                await ligneChantier.click(); await attendre(1500);
                const dCh = await page.evaluate(() => ({ h: location.hash, t: (document.querySelector('main') || document.body).innerText }));
                ok('C090 · « Chantiers en cours » → fiche du même chantier', /PRJ-2026-002/.test(dCh.t) && /Rénovation Façades ACM/.test(dCh.t) && /Sélectionnez un chantier/.test(dCh.t) === false, `adresse ${dCh.h || '(vide)'}`);
                const voirTous = {};
                for (const [section, attendu] of [['Devis récents', /Mes devis/], ['Chantiers en cours', /Chantiers/], ['Facturation récente', /Factures/]]) {
                    await menu(page, 'Tableau de bord');
                    const b = await trouver(page, (x, a) => /^Voir tou/.test(x.innerText.trim()) && x.closest('section')?.innerText.includes(a), section, 'button');
                    await b.click(); await attendre(1400);
                    const h1 = await page.evaluate(() => document.querySelector('main h1')?.innerText.trim());
                    voirTous[section] = h1;
                    ok(`C090 · « Voir tous » de « ${section} » ouvre la liste correspondante`, attendu.test(h1 || ''), `→ ${h1}`);
                }
                await menu(page, 'Tableau de bord');
                const rapide = await trouver(page, (x) => /Créer facture/.test(x.innerText) && !!x.closest('section[aria-label="Raccourcis rapides"]'), null, 'button');
                const sousTitre = await page.evaluate((el) => el.innerText.replace(/\s+/g, ' '), rapide);
                await rapide.click(); await attendre(1500);
                const dRapide = await page.evaluate(() => ({ h1: document.querySelector('main h1')?.innerText.trim(), dlg: document.querySelector('[role="dialog"]')?.innerText.slice(0, 80) || null, acompte: /acompte/i.test((document.querySelector('[role="dialog"]') || {}).innerText || '') }));
                ok('C090 · Raccourci « Créer facture — Facturer un acompte » mène à la création d\'un acompte', !!dRapide.dlg && dRapide.acompte, `carte « ${sousTitre} » → écran « ${dRapide.h1} », fenêtre ouverte : ${dRapide.dlg ? 'oui' : 'non'}`);
                await capture(page, 'A06-raccourci-facturer-acompte-destination');

                // ── C095 : renommer un client → chantiers, devis, tableau de bord
                await menu(page, 'Clients');
                await cliquer(page, '^Sélectionner Résidence Les Almadies$'); await attendre(1100);
                await cliquer(page, '^Modifier Résidence Les Almadies$'); await attendre(1000);
                await taper(page, '#newClientForm-name', 'Résidence Les Almadies Rénovée');
                await cliquer(page, '^Enregistrer les modifications$'); await attendre(1300);
                await menu(page, 'Chantiers');
                const chTxt = await texteMain(page);
                await menu(page, 'Tableau de bord');
                const tbTxt = await texteMain(page);
                const nomStocke = await page.evaluate(() => JSON.parse(localStorage.getItem('costcalc:guest:clients') || '[]').find((c) => c.id === 'cli-002')?.name);
                const occ = (t) => (t.match(/(^|[^\p{L}])Résidence Les Almadies Rénovée/gu) || []).length;
                ok('C095 · Client renommé : nouveau nom repris dans Chantiers et sur le tableau de bord', nomStocke === 'Résidence Les Almadies Rénovée' && occ(chTxt) > 0 && occ(tbTxt) > 0 && !/Résidence Les Almadies(?! Rénovée)/.test(chTxt + tbTxt),
                    `nom stocké « ${nomStocke} » ; Chantiers ${occ(chTxt)} occurrence(s), tableau de bord ${occ(tbTxt)}`);

                // ── C099 / C098 : « Créer Devis » depuis la fiche client
                await menu(page, 'Clients');
                await cliquer(page, '^Sélectionner Société Immobilière NBB$'); await attendre(1100);
                await viderNotifs(page);
                await cliquer(page, '^Créer un devis pour Société Immobilière NBB$'); await attendre(2000);
                const depuisClient = await page.evaluate(() => ({
                    client: document.querySelector('input[aria-label^="Client du devis"]')?.value,
                    chantier: document.querySelector('input[aria-label^="Chantier du devis"]')?.value,
                    numero: ((document.querySelector('main') || document.body).innerText.match(/DEV-\d{4}-\d{3}/) || [])[0],
                    h: location.hash
                }));
                const nClient = await notifs(page);
                await capture(page, 'A07-creer-devis-depuis-client-champ-vide');
                ok('C099 · « Créer Devis » depuis la fiche client préremplit le client du devis', depuisClient.client === 'Société Immobilière NBB', `champ client : « ${depuisClient.client} » ; chantier : « ${depuisClient.chantier} »`);
                ok('C098 · La notification affichée correspond à l\'état réel de l\'objet ouvert', !nClient.some((n) => /sélectionné pour le devis/.test(n)) || depuisClient.client === 'Société Immobilière NBB',
                    `notification : « ${nClient.join(' ‖ ')} » ; champ client réel : « ${depuisClient.client} »`);

                // Chiffrage d'un devis pour « SARL Alpha G5 », sans l'enregistrer
                const styleEtapes = () => page.evaluate(() => { const n = document.querySelector('nav[aria-label="Progression du devis"]'); return n ? [...n.querySelectorAll('span:not([aria-hidden])')].map((s) => `${s.innerText}:${getComputedStyle(s).fontWeight}/${getComputedStyle(s).color}/${s.getAttribute('aria-current')}`) : null; });
                const etapesAvant = await styleEtapes();
                await chiffrerDevis(page, { client: 'SARL Alpha G5', surface: '120' });
                const etapesApres = await styleEtapes();
                ok('C093 · La progression du devis (Travaux → Quantités → Prix → Vérification) indique l\'étape en cours et évolue',
                    etapesAvant && etapesApres && (JSON.stringify(etapesAvant) !== JSON.stringify(etapesApres) || etapesAvant.some((s) => /:(page|step|true)$/.test(s))),
                    `avant : ${(etapesAvant || []).join(' | ')} ; après ouvrage + quantités confirmées : ${JSON.stringify(etapesAvant) === JSON.stringify(etapesApres) ? 'identique' : (etapesApres || []).join(' | ')}`);
                const sousTotal = () => page.evaluate(() => ((document.querySelector('main') || document.body).innerText.match(/Sous-total HT : ([\d   ]+) FCFA/) || [])[1] || null);
                const stAvantSortie = await sousTotal();
                // Quitter sans enregistrer
                await viderNotifs(page);
                await menu(page, 'Tableau de bord');
                const dlgSortie = await page.evaluate(() => document.querySelector('[role="dialog"], [role="alertdialog"]')?.innerText || '');
                if (dlgSortie) await confirmerDialogue(page, 'Ne pas enregistrer');
                await attendre(800);
                const reprise = await page.evaluate(() => [...document.querySelectorAll('main button')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.innerText.replace(/\s+/g, ' ').trim()).filter((t) => /Reprendre/.test(t)));
                ok('C098 · Message de sortie cohérent : « modifications perdues » ne coexiste pas avec une reprise proposée du même chiffrage',
                    !(/seront perdues/.test(dlgSortie) && reprise.length > 0), `fenêtre : « ${norm(dlgSortie).slice(0, 120)} » ; puis tableau de bord : ${reprise.join(' / ') || 'aucune reprise'}`);
                // « Créer Devis » pour un AUTRE client alors que ce chiffrage est en cours
                await menu(page, 'Clients');
                await cliquer(page, '^Sélectionner Résidence Les Almadies Rénovée$'); await attendre(1100);
                await viderNotifs(page);
                await cliquer(page, '^Créer un devis pour Résidence Les Almadies Rénovée$'); await attendre(2000);
                const autre = await page.evaluate(() => ({ client: document.querySelector('input[aria-label^="Client du devis"]')?.value, txt: (document.querySelector('main') || document.body).innerText }));
                const nAutre = await notifs(page);
                await capture(page, 'A08-creer-devis-pour-B-ouvre-devis-de-A');
                ok('C098/C099 · « Créer un devis pour B » pendant un chiffrage pour A ouvre un devis au nom de B',
                    autre.client === 'Résidence Les Almadies Rénovée', `champ client : « ${autre.client} » ; notification : « ${nAutre.join(' ‖ ')} »`);
                // Reprise du brouillon depuis le tableau de bord (état courant)
                await menu(page, 'Tableau de bord');
                if (await page.evaluate(() => !!document.querySelector('[role="dialog"]'))) await confirmerDialogue(page, 'Ne pas enregistrer');
                const btnReprendre = await trouver(page, (b) => /^Reprendre mon devis/.test(b.innerText.trim()) && !!b.closest('main'), null, 'button');
                await btnReprendre.click(); await attendre(1800);
                const repris = await page.evaluate(() => ({ client: document.querySelector('input[aria-label^="Client du devis"]')?.value, num: ((document.querySelector('main') || document.body).innerText.match(/DEV-\d{4}-\d{3}/) || [])[0] }));
                const stRepris = await sousTotal();
                ok('C098 · « Reprendre mon devis » rouvre le chiffrage en cours dans son dernier état', repris.client === 'SARL Alpha G5' && !!stRepris && montant(stRepris) === montant(stAvantSortie),
                    `${repris.num} client « ${repris.client} » ; sous-total HT avant sortie ${norm(stAvantSortie)} → repris ${norm(stRepris)}`);

                // Enregistrement → notification, tableau de bord, statut
                const totalAvant = montant(carte(await etatTableau(page), 'Total des devis').valeur);
                await viderNotifs(page);
                await cliquer(page, '^Enregistrer$'); await attendre(1800);
                if (await page.evaluate(() => !!document.querySelector('[role="dialog"]'))) { await confirmerDialogue(page, 'Enregistrer').catch(() => {}); }
                const devis2 = await page.evaluate(() => JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]').find((q) => q.clientName === 'SARL Alpha G5'));
                const nSave = await notifs(page);
                ok('C098 · La notification d\'enregistrement désigne le devis enregistré', !!devis2 && nSave.some((n) => n.includes(devis2.number) || /enregistr/i.test(n)), `stocké ${devis2?.number} (${devis2?.status}) ; notifications : ${nSave.join(' ‖ ')}`);
                await menu(page, 'Tableau de bord');
                if (await page.evaluate(() => !!document.querySelector('[role="dialog"]'))) await confirmerDialogue(page, 'Ne pas enregistrer');
                const e2 = await etatTableau(page);
                const ttc2 = devis2?.quoteData?.totalTTCConsomme;
                ok('C095 · Le devis enregistré est reflété dans « Total des devis » et le pipeline (Brouillon)', montant(carte(e2, 'Total des devis').valeur) === (montant(carte(e1, 'Total des devis').valeur) + ttc2) && /1\. Brouillon 1/i.test(e2.pipelineTexte || ''),
                    `${carte(e1, 'Total des devis').valeur} → ${carte(e2, 'Total des devis').valeur} (+${ttc2}) ; ${(e2.pipelineTexte || '').slice(0, 120)}`);
                ok('C082 · « Devis à suivre » ne compte pas un brouillon jamais envoyé', montant(carte(e2, 'suivre').valeur) === 0, `Devis à suivre = ${carte(e2, 'suivre').valeur} (${carte(e2, 'suivre').detail}) pour 1 brouillon et 0 envoyé`);
                // Statut → Envoyé, depuis la fiche du devis
                await menu(page, 'Mes devis');
                await cliquer(page, `^Afficher le devis ${devis2?.number}`, 'tr'); await attendre(1400);
                await cliquer(page, '^Statut du devis$'); await attendre(600);
                await cliquer(page, '^Envoyé$', '[role="option"], button'); await attendre(1000);
                await menu(page, 'Tableau de bord');
                const e3 = await etatTableau(page);
                ok('C095 · Statut passé à « Envoyé » : le pipeline du tableau de bord suit', /3\. Envoyé Client 1/i.test(e3.pipelineTexte || '') && /1\. Brouillon 0/i.test(e3.pipelineTexte || ''), (e3.pipelineTexte || '').slice(0, 200));

                // ── C088 : traitement rapide pour experts
                await page.keyboard.down('Control'); await page.keyboard.press('KeyK'); await page.keyboard.up('Control'); await attendre(600);
                const focusK = await page.evaluate(() => document.activeElement?.getAttribute('placeholder') || document.activeElement?.getAttribute('aria-label'));
                ok('C088 · Ctrl+K place le curseur dans la recherche globale', /Rechercher/.test(focusK || ''), focusK);
                await page.keyboard.type('DEV-2026-001', { delay: 30 }); await attendre(900);
                await page.keyboard.press('ArrowDown'); await attendre(250);
                const apresFleche = await page.evaluate(() => ({ tag: document.activeElement.tagName, txt: (document.activeElement.innerText || '').slice(0, 40), ad: document.activeElement.getAttribute('aria-activedescendant') }));
                let tabs = 0, ouvert = false;
                await page.focus('input[placeholder^="Rechercher dans ikadevis"]');
                for (; tabs < 4 && !ouvert; tabs++) {
                    await page.keyboard.press('Tab'); await attendre(200);
                    const f = await page.evaluate(() => (document.activeElement.innerText || '').includes('DEV-2026-001'));
                    if (f) { await page.keyboard.press('Enter'); await attendre(1500); ouvert = await page.evaluate(() => /DEVIS COMMERCIAL|DEVIS ENREGISTRÉ/.test(document.body.innerText) && /DEV-2026-001/.test(document.body.innerText)); }
                }
                ok('C088 · Recherche globale au clavier : Ctrl+K, saisie, Tab, Entrée ouvrent le devis', ouvert, `${tabs} tabulation(s) ; flèche ↓ dans la recherche → focus ${apresFleche.tag} « ${apresFleche.txt} » (aria-activedescendant ${apresFleche.ad})`);
                await menu(page, 'Mes devis');
                await cliquer(page, '^Trier les devis$'); await attendre(500);
                await cliquer(page, '^Montant décroissant$', '[role="option"], button'); await attendre(800);
                const ordre = await page.evaluate(() => [...document.querySelectorAll('main tbody tr, main [role="row"]')].filter((r) => r.getBoundingClientRect().width > 0).map((r) => { const m = r.innerText.match(/([\d   ]+) FCFA/); return m ? Number(m[1].replace(/\D/g, '')) : null; }).filter((x) => x !== null));
                ok('C088 · Tri « Montant décroissant » de la liste des devis', ordre.length >= 2 && ordre.every((v, i) => i === 0 || ordre[i - 1] >= v), ordre.join(' ≥ '));
                await cliquer(page, '^Filtrer les devis par statut$'); await attendre(500);
                await cliquer(page, '^Envoyé', '[role="option"], button'); await attendre(800);
                const filtres = await lignesListe();
                ok('C088 · Filtre par statut « Envoyé » de la liste des devis', filtres.length === 1 && /SARL Alpha G5/.test(filtres[0]), filtres.join(' ‖ '));
                await cliquer(page, '^Filtrer les devis par statut$'); await attendre(500);
                await cliquer(page, '^Tous les statuts$', '[role="option"], button'); await attendre(800);
                const comparaison = /vs|par rapport|mois précédent|\+\d+ ?%|−\d+ ?%/i.test(e3.tout);
                ok('C088 · Comparaison d\'une période à l\'autre proposée sur le tableau de bord', comparaison, comparaison ? 'présente' : 'aucune variation ni période de référence affichée');

                // ── C095 : même devis, même statut sur tous les écrans (Dépenses › Rentabilité)
                await menu(page, 'Dépenses');
                await cliquer(page, '^Rentabilité du chantier', 'summary'); await attendre(700);
                await page.select('select[aria-label="Chantier à analyser"]', 'prj-001'); await attendre(800);
                const rent = await page.evaluate(() => ({ options: [...document.querySelectorAll('select[aria-label="Devis de référence"] option')].map((o) => o.textContent.trim()), choisi: document.querySelector('select[aria-label="Devis de référence"]')?.value }));
                const sel = rent.options.find((o) => /DEV-2026-001/.test(o));
                if (sel) { const v = await page.evaluate(() => [...document.querySelectorAll('select[aria-label="Devis de référence"] option')].find((o) => /DEV-2026-001/.test(o.textContent))?.value); await page.select('select[aria-label="Devis de référence"]', v); await attendre(800); }
                const avisRent = await page.evaluate(() => [...document.querySelectorAll('[data-project-profitability] p')].map((p) => p.innerText).find((t) => /pas marqué comme accepté/.test(t)) || '');
                await capture(page, 'A09-rentabilite-devis-accepte-dit-non-accepte');
                ok('C095 · Le devis « Accepté » (Mes devis, tableau de bord) porte le même statut dans Dépenses › Rentabilité',
                    !!sel && /Accepté/.test(sel) && !avisRent, `option : « ${sel} » ; présélection auto : ${rent.choisi ? 'oui' : 'non'} ; message : « ${avisRent} »`);

                // ── C093 : prérequis explicité avant une saisie (Dépenses)
                const prerequis = await texteMain(page);
                ok('C093 · Dépenses : le prérequis (déclarer un compte) est expliqué avant l\'action', /Aucun compte n'est encore déclaré/.test(prerequis) && /Ajouter un compte/.test(prerequis));

                // ── C099 : depuis la fiche chantier, créer un devis sans ressaisie
                await menu(page, 'Chantiers');
                await cliquer(page, '^Sélectionner le chantier Construction Siège NBB$'); await attendre(1200);
                const actionsChantier = await page.evaluate(() => [...document.querySelectorAll('main button')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => (b.getAttribute('aria-label') || b.innerText).trim()));
                ok('C099 · La fiche chantier propose « Nouveau devis pour ce chantier »', actionsChantier.some((t) => /(nouveau|créer).*(devis)/i.test(t)), actionsChantier.join(' | '));
                // … et l'éditeur : choisir un chantier remplit le client
                await menu(page, 'Tableau de bord');
                const nvx = await trouver(page, (x) => /^Nouveau devis/.test(x.innerText.trim()) && !!x.closest('section[aria-label="Raccourcis rapides"]'), null, 'button');
                await nvx.click(); await attendre(1600);
                if (await page.evaluate(() => !!document.querySelector('[role="dialog"]'))) await confirmerDialogue(page, 'Nouveau devis');
                await saisirNatif(page, 'input[aria-label^="Chantier du devis"]', 'Construction'); await attendre(900);
                await cliquer(page, 'Construction Siège NBB', '[role="option"]'); await attendre(1000);
                const cliAuto = await page.evaluate(() => document.querySelector('input[aria-label^="Client du devis"]')?.value);
                ok('C099 · Dans le devis, choisir un chantier existant reprend son client', cliAuto === 'Société Immobilière NBB', `client après choix du chantier : « ${cliAuto} »`);

                // ── C095 : nouveau chantier depuis le tableau de bord
                await menu(page, 'Tableau de bord');
                if (await page.evaluate(() => !!document.querySelector('[role="dialog"]'))) await confirmerDialogue(page, 'Ne pas enregistrer');
                const avantCh = await etatTableau(page);
                await viderNotifs(page);
                const nch = await trouver(page, (x) => /^Nouveau chantier/.test(x.innerText.trim()) && !!x.closest('section[aria-label="Raccourcis rapides"]'), null, 'button');
                await nch.click(); await attendre(1000);
                await taper(page, '#newProjectForm-name', 'Chantier Démo G5');
                await cliquer(page, '^Client du chantier'); await attendre(500);
                await cliquer(page, '^Société Immobilière NBB$', '[role="option"]'); await attendre(500);
                await page.evaluate(() => document.querySelector('#newProjectForm').requestSubmit()); await attendre(1500);
                const nCh = await notifs(page);
                const projStock = await page.evaluate(() => JSON.parse(localStorage.getItem('costcalc:guest:projects') || '[]').map((p) => `${p.code}:${p.status}`));
                const ecranQuota = await page.evaluate(() => ({ formOuvert: !!document.querySelector('#newProjectForm'), offres: /Formule|Starter|offre|abonnement/i.test([...document.querySelectorAll('[role="dialog"], .fixed')].map((d) => d.innerText).join(' ')) }));
                await capture(page, 'A10-nouveau-chantier-refuse-limite-formule');
                if (nCh.some((n) => /Limite de \d+ projet/.test(n))) {
                    results.push({ label: 'C095 · BLOQUÉ (cas « chantier créé → tableau de bord ») : création refusée par la limite de la formule en démo', pass: false, detail: `notification « ${nCh.join(' ‖ ')} » ; chantiers stockés : ${projStock.join(', ')}` });
                    ok('C093 · Le prérequis « limite de chantiers de la formule » est annoncé avant de remplir « Nouveau chantier »', false,
                        `refus après saisie : « ${nCh.find((n) => /Limite/.test(n))} » alors que la démo contient déjà ${projStock.length} chantiers actifs (${projStock.join(', ')}) et que la carte affiche « Chantiers actifs ${carte(avantCh, 'Chantiers').valeur} » ; formulaire resté ouvert : ${ecranQuota.formOuvert}, offres affichées : ${ecranQuota.offres}`);
                } else {
                    const apresCh = await etatTableau(page);
                    await menu(page, 'Chantiers');
                    const listeCh = await texteMain(page);
                    ok('C095 · Chantier créé depuis le tableau de bord : présent dans Chantiers', /Chantier Démo G5/.test(listeCh), `stockage : ${projStock.join(', ')}`);
                    ok('C082 · Un chantier créé est compté de façon explicite (actif ou non) sur le tableau de bord', carte(apresCh, 'Chantiers').valeur !== carte(avantCh, 'Chantiers').valeur || /sur \d+ chantiers/.test(carte(apresCh, 'Chantiers').detail || ''), `${carte(apresCh, 'Chantiers').valeur} « ${carte(apresCh, 'Chantiers').detail} »`);
                }
                for (let i = 0; i < 3 && await page.evaluate(() => !!document.querySelector('[role="dialog"]')); i++) { await page.keyboard.press('Escape'); await attendre(600); }

                // ── C093 : retour arrière navigateur depuis une fiche
                await menu(page, 'Mes devis');
                await cliquer(page, '^Afficher le devis DEV-2026-001', 'tr'); await attendre(1300);
                const hFiche = await page.evaluate(() => location.hash);
                await page.goBack({ waitUntil: 'networkidle0' }).catch(() => {}); await attendre(1400);
                const retour = await page.evaluate(() => ({ h: location.hash, h1: document.querySelector('main h1')?.innerText, ficheOuverte: /DEVIS ENREGISTRÉ/.test(document.body.innerText) }));
                ok('C093 · Retour arrière du navigateur depuis une fiche devis : revient à la liste', retour.h === '#devis' && !retour.ficheOuverte, `${hFiche} → ${retour.h} (${retour.h1}), fiche encore ouverte : ${retour.ficheOuverte}`);

                externesTous.push(...externes);
            } catch (e) { bloque('SESSION A', 'parcours principal', e); await capture(page, 'A99-blocage'); }
            finally { await ctx.close(); }
        }

        // ════════════════════════════════════════════════════════════════
        // SESSION B — 1440 : états vides (zéro / absence) — C084
        // ════════════════════════════════════════════════════════════════
        {
            const { ctx, page, externes } = await ouvrirSession(browser, { width: 1440, height: 900 });
            try {
                await entrerEnDemo(page, url);
                // C095 : supprimer un chantier → tableau de bord et fiche client suivent
                const avantSup = carte(await etatTableau(page), 'Chantiers');
                await menu(page, 'Chantiers');
                await cliquer(page, '^Sélectionner le chantier Rénovation Façades ACM & Enseignes LED$'); await attendre(1000);
                await cliquer(page, '^Supprimer le chantier Rénovation Façades ACM & Enseignes LED$'); await attendre(800);
                await confirmerDialogue(page, 'Supprimer');
                await menu(page, 'Tableau de bord');
                const apresSup = carte(await etatTableau(page), 'Chantiers');
                await menu(page, 'Clients');
                await cliquer(page, '^Sélectionner Résidence Les Almadies$'); await attendre(1000);
                const ficheCli = await page.evaluate(() => ((document.querySelector('main') || document.body).innerText.match(/(\d+)\s*CHANTIERS/i) || [])[1]);
                ok('C095 · Chantier supprimé : « Chantiers actifs » et la fiche client suivent', montant(apresSup.valeur) === montant(avantSup.valeur) - 1 && ficheCli === '0',
                    `carte ${avantSup.valeur} → ${apresSup.valeur} ; fiche client « ${ficheCli} chantier(s) »`);
                // Chantier portant un devis : avertissement, puis devis rattaché à un chantier disparu ?
                await menu(page, 'Chantiers');
                await cliquer(page, '^Sélectionner le chantier Construction Siège NBB$'); await attendre(1000);
                await cliquer(page, '^Supprimer le chantier Construction Siège NBB$'); await attendre(800);
                const dlgSup = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].map((d) => d.innerText).join(' ').replace(/\s+/g, ' '));
                await confirmerDialogue(page, 'Supprimer');
                await menu(page, 'Mes devis');
                const ligneOrph = await page.evaluate(() => [...document.querySelectorAll('main [aria-label^="Afficher le devis DEV-2026-001"]')].filter((r) => r.getBoundingClientRect().width > 0).map((r) => r.innerText.replace(/\s+/g, ' '))[0]);
                await capture(page, 'B00-devis-apres-suppression-chantier');
                ok('C095 · Supprimer un chantier qui porte un devis : l\'avertissement le dit, ou le devis ne garde pas un chantier inexistant',
                    /devis/i.test(dlgSup) || !/Construction Siège NBB/.test(ligneOrph || ''), `fenêtre : « ${dlgSup.slice(0, 180)} » ; ligne du devis ensuite : « ${ligneOrph} »`);
                await cliquer(page, '^Supprimer le devis DEV-2026-001$'); await attendre(800);
                await confirmerDialogue(page, 'Supprimer');
                await menu(page, 'Tableau de bord');
                const e = await etatTableau(page);
                const taux = (e.tout.match(/Taux de conversion :\s*([^\n]+)/) || [])[1];
                await capture(page, 'B01-sans-devis-taux-de-conversion');
                ok('C084 · Sans aucun devis, le taux de conversion n\'affiche pas « 0 % » comme une mesure', !/^0\s?%/.test((taux || '').trim()), `stockage devis : ${await page.evaluate(() => localStorage.getItem('costcalc:guest:savedQuotes'))} ; affiché : « ${taux} »`);
                ok('C084 · Sans aucun devis, la liste dit « aucun devis » (absence) ', /Aucun devis enregistré/.test(e.tout));
                const e2 = e;
                const ch = carte(e2, 'Chantiers');
                await capture(page, 'B02-sans-chantier-tous-en-cours');
                ok('C084 · Sans aucun chantier, la carte ne dit pas « Tous en cours »', !(/^0$/.test(ch.valeur || '') && /Tous en cours/.test(ch.detail || '')),
                    `stockage chantiers : ${await page.evaluate(() => localStorage.getItem('costcalc:guest:projects'))} ; carte : ${ch.valeur} « ${ch.detail} »`);
                const chargement = await page.evaluate(() => ({ busy: document.querySelectorAll('[aria-busy="true"]').length, squelettes: document.querySelectorAll('.animate-pulse, [class*="skeleton"]').length }));
                ok('C084 · Mode Démo : aucun état de chargement résiduel affiché à la place des données', chargement.busy === 0 && chargement.squelettes === 0, JSON.stringify(chargement));
                externesTous.push(...externes);
            } catch (e) { bloque('SESSION B', 'états vides', e); await capture(page, 'B99-blocage'); }
            finally { await ctx.close(); }
        }

        // ════════════════════════════════════════════════════════════════
        // SESSION C — 1440 : préférences d'affichage (C089), jauge (C085),
        //             animation (C086), assistant d'organisation (C093)
        // ════════════════════════════════════════════════════════════════
        {
            const { ctx, page, externes } = await ouvrirSession(browser, { width: 1440, height: 900 });
            try {
                await entrerEnDemo(page, url);
                await cliquer(page, '^Modifier et personnaliser le tableau de bord$'); await attendre(1000);
                // Clavier : les interrupteurs de widgets sont-ils atteignables ?
                const vus = [];
                for (let i = 0; i < 14; i++) {
                    await page.keyboard.press('Tab'); await attendre(120);
                    vus.push(await page.evaluate(() => { const a = document.activeElement; return `${a.tagName}:${(a.getAttribute('aria-label') || a.innerText || a.value || '').replace(/\s+/g, ' ').slice(0, 30)}`; }));
                }
                const interrupteurs = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] div.cursor-pointer')].map((d) => ({ t: d.querySelector('p')?.innerText, tab: d.tabIndex, role: d.getAttribute('role'), checked: d.getAttribute('aria-checked') ?? d.getAttribute('aria-pressed') })));
                const atteints = vus.filter((v) => interrupteurs.some((s) => v.includes((s.t || '').slice(0, 20)))).length;
                await capture(page, 'C01-personnaliser-fenetre');
                ok('C089 · Les 7 interrupteurs de widgets sont atteignables au clavier (Tab) — WCAG 2.1.1', atteints === interrupteurs.length && interrupteurs.length > 0,
                    `${interrupteurs.length} interrupteurs (div cliquables, tabIndex ${[...new Set(interrupteurs.map((s) => s.tab))].join('/')}, role ${[...new Set(interrupteurs.map((s) => s.role))].join('/')}, état ${[...new Set(interrupteurs.map((s) => s.checked))].join('/')}) ; parcours Tab : ${[...new Set(vus)].join(' → ')}`);
                // Réglage à la souris : masquer le pipeline, objectif 5 000 000, période par défaut « Ce mois-ci »
                const pip = await trouver(page, (d) => d.classList.contains('cursor-pointer') && /Pipeline Commercial/.test(d.innerText) && !!d.closest('[role="dialog"]'), null, 'div');
                await pip.click(); await attendre(300);
                await saisirNatif(page, '[role="dialog"] input[type="number"]', '5000000'); await attendre(200);
                await page.select('[role="dialog"] select', 'month'); await attendre(300);
                await cliquer(page, '^Appliquer & Enregistrer$'); await attendre(1500);
                const etatReglage = async () => page.evaluate(() => ({
                    pipeline: /Pipeline Commercial/.test(document.body.innerText),
                    objectif: /Objectif mensuel de facturation/i.test(document.body.innerText),
                    periode: [...document.querySelectorAll('header button')].find((b) => /^(Tout|Ce mois|Trimestre|Année)$/.test(b.innerText.trim()) && getComputedStyle(b).backgroundColor === 'rgb(255, 255, 255)')?.innerText.trim(),
                    cle: Object.keys(localStorage).filter((k) => /dashboard/i.test(k))
                }));
                const r1 = await etatReglage();
                // Jauge d'objectif (C085) et animation (C086)
                const jauge = await page.evaluate(() => {
                    const s = [...document.querySelectorAll('main section')].find((x) => /Objectif mensuel/i.test(x.innerText));
                    if (!s) return null;
                    const pct = Number((s.innerText.match(/(\d+)%/) || [])[1]);
                    const barre = [...s.querySelectorAll('div[style*="width"]')][0];
                    const cont = barre?.parentElement;
                    return { pct, largeur: barre && cont ? Math.round((barre.getBoundingClientRect().width / cont.clientWidth) * 100) : null, texte: s.innerText.replace(/\s+/g, ' ').slice(0, 200), role: barre?.getAttribute('role') || cont?.getAttribute('role') };
                });
                ok('C085 · La jauge d\'objectif a un équivalent textuel (réalisé, cible, pourcentage)', !!jauge && /facturés sur/.test(jauge.texte) && Number.isFinite(jauge.pct), jauge ? `texte « ${jauge.texte} » ; barre ${jauge.largeur}% pour ${jauge.pct}% annoncé` : 'jauge absente');
                const anim = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.getTiming?.().iterations === Infinity).map((a) => a.effect?.target).filter(Boolean).filter((t) => t.closest('main')).map((t) => ({ c: String(t.className), dur: getComputedStyle(t).animationIterationCount })));
                await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); await attendre(500);
                const animReduit = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.getTiming?.().iterations === Infinity && a.playState === 'running').map((a) => a.effect?.target).filter(Boolean).filter((t) => t.closest('main')).length);
                await page.emulateMediaFeatures([]);
                ok('C086 · Les animations décoratives s\'arrêtent quand l\'utilisateur demande moins de mouvement', anim.length === 0 || animReduit === 0,
                    `${anim.length} animation(s) : ${anim.map((a) => a.c.slice(0, 50) + ' ×' + a.dur).join(' ; ')} ; avec prefers-reduced-motion : ${animReduit}`);
                await capture(page, 'C02-reglages-appliques');
                // Persistance après rechargement
                await page.reload({ waitUntil: 'networkidle0' });
                await entrerEnDemo(page, url, { vider: false });
                const r2 = await etatReglage();
                ok('C089 · Préférences conservées après rechargement (pipeline masqué, objectif, période « Ce mois »)', !r2.pipeline && r2.objectif && r2.periode === 'Ce mois', `avant : ${JSON.stringify(r1)} ; après : ${JSON.stringify(r2)}`);
                // Réinitialisation
                await cliquer(page, '^Modifier et personnaliser le tableau de bord$'); await attendre(900);
                await cliquer(page, '^Rétablir par défaut$'); await attendre(300);
                await cliquer(page, '^Appliquer & Enregistrer$'); await attendre(1300);
                const r3 = await etatReglage();
                ok('C089 · « Rétablir par défaut » remet l\'affichage d\'origine (pipeline, pas d\'objectif)', r3.pipeline && !r3.objectif, JSON.stringify(r3));
                await page.reload({ waitUntil: 'networkidle0' });
                await entrerEnDemo(page, url, { vider: false });
                const r4 = await etatReglage();
                ok('C089 · La période par défaut revient à « Tout » après réinitialisation et rechargement', r4.periode === 'Tout', JSON.stringify(r4));
                ok('HYP-C089 · Préférences rangées par utilisateur/organisation (clé de stockage dédiée)', r4.cle.some((k) => /guest|org|user/.test(k)), `clé(s) : ${r4.cle.join(', ')}`);

                // ── C093 : assistant « Nouvelle entreprise »
                await cliquer(page, "changer d'organisation"); await attendre(800);
                await cliquer(page, '^Nouvelle entreprise$'); await attendre(1200);
                const assistant = await page.evaluate(() => {
                    const d = [...document.querySelectorAll('div.fixed')].find((x) => /Créer une organisation/.test(x.innerText));
                    const etapes = [...d.querySelectorAll('aside .space-y-5 > div')].map((s) => ({ t: s.innerText.trim(), active: /text-white/.test(s.className) && !/text-neutral/.test(s.className) }));
                    return { annonce: (d.innerText.match(/ÉTAPE \d+ SUR \d+/i) || [])[0], etapes, boutons: [...d.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean) };
                });
                await capture(page, 'C03-assistant-organisation-etape-1-sur-6');
                await taper(page, '#new_org_name', 'Entreprise Fictive G5');
                await cliquer(page, "^Créer l'organisation$"); await attendre(1500);
                const apres = await page.evaluate(() => ({ ouvert: [...document.querySelectorAll('div.fixed')].some((x) => /Créer une organisation/.test(x.innerText)), etape: (document.body.innerText.match(/ÉTAPE \d+ SUR \d+/i) || [])[0] || null }));
                ok('C093 · L\'assistant d\'organisation annonce un nombre d\'étapes conforme au parcours réel',
                    !(assistant.annonce && /SUR 6/i.test(assistant.annonce) && !apres.ouvert),
                    `annonce « ${assistant.annonce} », ${assistant.etapes.length} étapes listées, ${assistant.etapes.filter((s) => s.active).length} marquées actives (${assistant.etapes.filter((s) => s.active).map((s) => s.t).join(' + ')}) ; après « Créer l'organisation » : fenêtre ${apres.ouvert ? 'toujours ouverte' : 'fermée'} — parcours en 1 étape`);
                externesTous.push(...externes);
            } catch (e) { bloque('SESSION C', 'préférences', e); await capture(page, 'C99-blocage'); }
            finally { await ctx.close(); }
        }

        // ════════════════════════════════════════════════════════════════
        // SESSION D — facture échue (état historique, injecté avant l'entrée
        //             en démo comme le fait test_soldes_factures_devise) — C086
        // ════════════════════════════════════════════════════════════════
        for (const largeur of [1440, 390]) {
            const mobile = largeur < 768;
            const { ctx, page, externes } = await ouvrirSession(browser, { width: largeur, height: mobile ? 844 : 900, mobile });
            try {
                await page.goto(url + '/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
                await page.evaluate(() => {
                    localStorage.clear();
                    localStorage.setItem('costcalc:guest:invoices', JSON.stringify([{
                        id: 'inv_echue_g5', numero: 'FACT-2026-007', statut: 'issued', type: 'standard', clientName: 'Client Fictif Échu',
                        dateCreation: '2026-07-01T10:00:00.000Z', dateEmission: '2026-07-01T10:00:00.000Z', dateEcheance: '2026-07-31',
                        tauxTva: 18, totalHT: 1000000, totalTva: 180000, totalTTC: 1180000, deduitTTC: 0, netAPayerTTC: 1180000, montantRegle: 0,
                        payments: [], lignes: [], companyInfoSnapshot: { currency: 'FCFA' }
                    }]));
                });
                await page.reload({ waitUntil: 'networkidle0' });
                await entrerEnDemo(page, url, { vider: false });
                const tb = await texteMain(page);
                await capture(page, `D01-tableau-facture-echue-${largeur}`);
                ok(`C086 · ${largeur}px : une facture échue impayée est signalée sur le tableau de bord`, /retard|échue|échéance dépassée|à relancer/i.test(tb),
                    `tableau de bord : ${/FACT-2026-007/.test(tb) ? 'facture listée « ' + norm((tb.match(/Client Fictif Échu[\s\S]{0,80}/) || [''])[0]) + ' »' : 'facture absente'} ; mention de retard : ${/retard|échue/i.test(tb) ? 'oui' : 'non'}`);
                await aller(page, '#factures');
                const pastille = await page.evaluate(() => { const b = [...document.querySelectorAll('main button')].find((x) => /En retard/.test(x.innerText)); if (!b) return null; const r = b.getBoundingClientRect(); return { t: b.innerText.replace(/\s+/g, ' '), top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight }; });
                ok(`C086 · ${largeur}px : l'écran Factures signale le retard sans défilement`, !!pastille && pastille.bottom <= pastille.vh, JSON.stringify(pastille));
                externesTous.push(...externes);
            } catch (e) { bloque('SESSION D', `facture échue ${largeur}`, e); await capture(page, `D99-blocage-${largeur}`); }
            finally { await ctx.close(); }
        }

        // ════════════════════════════════════════════════════════════════
        // SESSION E — densité et adaptation : 320 / 360 / 390 / 768 / 1024 / 1440
        //             (C087) + prochaine étape sur mobile (C092) + C086 mobile
        // ════════════════════════════════════════════════════════════════
        for (const [w, h] of [[320, 640], [360, 780], [390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
            const mobile = w < 768;
            const { ctx, page, externes } = await ouvrirSession(browser, { width: w, height: h, mobile });
            try {
                await entrerEnDemo(page, url);
                const m = await page.evaluate(() => {
                    const r = (el) => el ? el.getBoundingClientRect() : null;
                    const kpi = document.querySelector('section[aria-label="Indicateurs clés"]');
                    const premiere = kpi?.firstElementChild, derniere = kpi?.lastElementChild;
                    // Conteneur qui défile réellement (document ou élément interne)
                    const defilants = [...document.querySelectorAll('main *, main')].filter((e) => { const cs = getComputedStyle(e); return /(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 4; });
                    const scr = defilants.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] || document.scrollingElement;
                    const valeurs = [...document.querySelectorAll('section[aria-label="Indicateurs clés"] p, main section .tabular-nums')].filter((p) => /\d/.test(p.innerText) && /FCFA/.test(p.innerText));
                    const tronques = valeurs.filter((p) => p.scrollWidth > p.clientWidth + 1).map((p) => `${p.innerText.trim()} (${p.clientWidth}/${p.scrollWidth}px)`);
                    const cta = [...document.querySelectorAll('main section button')].find((b) => /premier devis|Reprendre mon devis|Créer un devis/.test(b.innerText));
                    const avert = [...document.querySelectorAll('main p')].find((p) => /conservé sur cet appareil/.test(p.innerText));
                    const barreBas = [...document.querySelectorAll('nav, div')].filter((n) => /Accueil/.test(n.innerText || '') && /Factures/.test(n.innerText || '') && n.getBoundingClientRect().bottom >= innerHeight - 2 && n.getBoundingClientRect().height > 30 && n.getBoundingClientRect().height < 120).sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)[0];
                    const debordEntete = [...document.querySelectorAll('header button, header a')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).map((b) => `${b.getAttribute('aria-label') || b.innerText.trim()} (${Math.round(b.getBoundingClientRect().left)}→${Math.round(b.getBoundingClientRect().right)}px)`);
                    return {
                        largeurDoc: document.documentElement.scrollWidth, vw: innerWidth, vh: innerHeight,
                        kpiHaut: premiere ? Math.round(r(premiere).top) : null, kpiBasDerniere: derniere ? Math.round(r(derniere).bottom) : null,
                        hauteurContenu: scr ? scr.scrollHeight : null, hauteurVisible: scr ? scr.clientHeight : null, defilantInterne: scr !== document.scrollingElement,
                        tronques, ctaBas: cta ? Math.round(r(cta).bottom) : null, avertBas: avert ? Math.round(r(avert).bottom) : null,
                        barreBasHaut: barreBas ? Math.round(r(barreBas).top) : null, debordEntete
                    };
                });
                await capture(page, `E01-densite-${w}x${h}`);
                if (w <= 390) { await page.evaluate(() => document.querySelector('section[aria-label="Indicateurs clés"]')?.scrollIntoView({ block: 'center' })); await attendre(400); await capture(page, `E01b-indicateurs-${w}`); await page.evaluate(() => document.querySelector('main h1, main header')?.scrollIntoView({ block: 'start' })); await attendre(300); }
                const ecrans = m.hauteurContenu && m.hauteurVisible ? Math.round((m.hauteurContenu / m.hauteurVisible) * 10) / 10 : null;
                ok(`C087 · ${w}px : pas de défilement horizontal de la page`, m.largeurDoc <= m.vw, `${m.largeurDoc}/${m.vw}px`);
                ok(`C087 · ${w}px : aucune commande de la barre haute coupée par le bord de l'écran`, m.debordEntete.length === 0, m.debordEntete.join(' ; ') || 'aucune');
                ok(`C087 · ${w}px : aucun montant d'indicateur tronqué`, m.tronques.length === 0, m.tronques.join(' ; ') || 'aucun');
                const utile = (m.barreBasHaut || m.vh);
                ok(`C087 · ${w}px : le premier indicateur chiffré apparaît dans le premier écran`, m.kpiHaut !== null && m.kpiHaut < utile - 40,
                    `1re carte à y=${m.kpiHaut}px pour ${utile}px utiles ; contenu ${m.hauteurContenu}px = ${ecrans} écran(s)`);
                if (w === 1440) ok('C087 · 1440×900 : les 4 indicateurs sont entièrement visibles sans défilement', m.kpiBasDerniere !== null && m.kpiBasDerniere <= m.vh, `dernière carte bas=${m.kpiBasDerniere}px / ${m.vh}`);
                if (w === 390 || w === 1440) {
                    ok(`C092 · ${w}px : l'appel à l'action principal du tableau de bord est visible sans défilement`, m.ctaBas !== null && m.ctaBas <= utile, `bas du bouton y=${m.ctaBas}px / ${utile}px utiles`);
                    ok(`C086 · ${w}px : l'avertissement « démonstration locale » est visible sans défilement`, m.avertBas !== null && m.avertBas <= utile, `y=${m.avertBas}px / ${utile}px utiles`);
                }
                // Molette réelle jusqu'à « Devis récents » (zone principale)
                const cible = async () => page.evaluate(() => { const h = [...document.querySelectorAll('main h3')].find((x) => /Devis récents/.test(x.innerText)); const r = h?.getBoundingClientRect(); return r ? Math.round(r.top) : null; });
                let crans = 0;
                await page.mouse.move(Math.round(w / 2), Math.round(h / 2));
                while (crans < 40) {
                    const y = await cible();
                    if (y !== null && y >= 0 && y < (m.barreBasHaut || h) - 60) break;
                    await page.mouse.wheel({ deltaY: 100 }); await attendre(120); crans++;
                }
                const yFin = await cible();
                ok(`C087 · ${w}px : « Devis récents » atteint à la molette (crans de 100 px)`, yFin !== null && yFin >= 0 && yFin < (m.barreBasHaut || h), `${crans} cran(s) de molette ; titre à y=${yFin}px`);
                if (w === 390) {
                    // Prochaine étape sur mobile : fiche devis accepté → facturer
                    await aller(page, '#devis');
                    await cliquer(page, '^Afficher le devis DEV-2026-001', '[role="button"], tr, button'); await attendre(1600);
                    const fiche = await page.evaluate(() => { const b = [...document.querySelectorAll('main button, button')].find((x) => /^Facturer le devis/.test(x.getAttribute('aria-label') || '') && x.getBoundingClientRect().width > 0); const r = b?.getBoundingClientRect(); const nav = [...document.querySelectorAll('nav, div')].filter((n) => /Accueil/.test(n.innerText || '') && /Factures/.test(n.innerText || '') && n.getBoundingClientRect().bottom >= innerHeight - 2 && n.getBoundingClientRect().height > 30 && n.getBoundingClientRect().height < 120)[0]; return { libelle: b?.innerText.trim(), top: r ? Math.round(r.top) : null, bottom: r ? Math.round(r.bottom) : null, utile: nav ? Math.round(nav.getBoundingClientRect().top) : innerHeight }; });
                    await capture(page, 'E02-fiche-devis-390');
                    ok('C092 · 390px : sur la fiche d\'un devis accepté, « Convertir en facture » est visible sans défilement', fiche.top !== null && fiche.bottom <= fiche.utile, JSON.stringify(fiche));
                    // Brouillon puis facture émise : action suivante visible
                    await cliquer(page, '^Facturer le devis DEV-2026-001$'); await attendre(1300);
                    await cliquer(page, '^Créer le brouillon$'); await attendre(1800);
                    const mesure = (re) => page.evaluate((src) => { const b = [...document.querySelectorAll('button')].find((x) => new RegExp(src).test(x.getAttribute('aria-label') || '') && x.getBoundingClientRect().width > 0); const r = b?.getBoundingClientRect(); const nav = [...document.querySelectorAll('nav, div')].filter((n) => /Accueil/.test(n.innerText || '') && /Factures/.test(n.innerText || '') && n.getBoundingClientRect().bottom >= innerHeight - 2 && n.getBoundingClientRect().height > 30 && n.getBoundingClientRect().height < 120)[0]; return { top: r ? Math.round(r.top) : null, bottom: r ? Math.round(r.bottom) : null, utile: nav ? Math.round(nav.getBoundingClientRect().top) : innerHeight }; }, re);
                    const em = await mesure('^Émettre la facture de');
                    await capture(page, 'E03-brouillon-facture-390');
                    ok('C092 · 390px : brouillon de facture — « Émettre la facture » visible sans défilement', em.top !== null && em.bottom <= em.utile, JSON.stringify(em));
                    await cliquer(page, '^Émettre la facture de'); await attendre(900);
                    await confirmerDialogue(page, 'Émettre'); await attendre(800);
                    const rg = await mesure('^Enregistrer un règlement pour la facture');
                    await capture(page, 'E04-facture-emise-390');
                    ok('C092 · 390px : facture émise — « Enregistrer un règlement » visible sans défilement', rg.top !== null && rg.bottom <= rg.utile, JSON.stringify(rg));
                }
                externesTous.push(...externes);
            } catch (e) { bloque('SESSION E', `largeur ${w}`, e); await capture(page, `E99-blocage-${w}`); }
            finally { await ctx.close(); }
        }

        ok('Hygiène · Aucune requête vers un service externe (toutes bloquées)', externesTous.length === 0, [...new Set(externesTous)].join(', ') || 'aucune');
    } finally {
        await browser.close();
        await fermerServeur();
    }
    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    const parControle = {};
    for (const r of results) { const id = (r.label.match(/^(C\d{3}(?:\/C\d{3})*|SESSION \w|Hygiène)/) || ['?'])[0]; (parControle[id] ||= []).push(r.pass); }
    console.log('\nSynthèse :', Object.entries(parControle).map(([k, v]) => `${k} ${v.filter(Boolean).length}/${v.length}`).join(' · '));
    process.exit(results.every((r) => r.pass) ? 0 : 1);
}
