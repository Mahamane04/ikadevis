#!/usr/bin/env node
// Audit UX 220 contrôles (2026-10) — groupe G2 « boutons et fenêtres ».
//
// Contrôles couverts : C022 C023 C024 C026 C029 C033 C034 C037 C038 C039 C040.
//
// Environnement isolé : serveur statique local (scratch/lib/server.mjs) qui sert
// config.example.js (URL Supabase factice) ; TOUTE requête hors 127.0.0.1 est
// bloquée et comptée. Mode Démo uniquement (« Essayer sans compte »), données
// fictives, un contexte de navigation neuf (stockage vide) par parcours,
// téléchargements refusés. Aucune écriture ailleurs que dans les captures.
//
// La sonde manipule l'interface comme un utilisateur : clics souris réels
// (ElementHandle.click / page.mouse.click — le recouvrement compte), toucher
// (tap) aux largeurs mobiles, vraies touches (Tab, Maj+Tab, Échap, Entrée,
// flèches, Ctrl/Cmd+K, Alt+3), vraie molette (page.mouse.wheel), historique
// du navigateur (page.goBack). Elle MESURE l'état du DOM, les styles calculés,
// les rectangles et le stockage — elle ne lit pas le code source.
//
//   node tests/ux/controles/G2-boutons-fenetres.mjs
//   G2_SEULEMENT=C033,C034 node tests/ux/controles/G2-boutons-fenetres.mjs
//
// Sortie : une ligne par cas ([Cxxx] libellé — détail), captures dans
// docs/audit-ux-220/UX_EVIDENCE/G2-boutons-fenetres/.
import puppeteer from 'puppeteer';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from '../../../scratch/lib/server.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '../../..');
const PREUVES = path.join(RACINE, 'docs/audit-ux-220/UX_EVIDENCE/G2-boutons-fenetres');
const CONFIG = await readFile(new URL('../../../config.example.js', import.meta.url), 'utf8');
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const SEULEMENT = (process.env.G2_SEULEMENT || '').split(',').map((s) => s.trim()).filter(Boolean);

const VP = {
    d1440: { width: 1440, height: 900 },
    t1024: { width: 1024, height: 768 },
    t768: { width: 768, height: 1024 },
    m390: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
    m360: { width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
    m320: { width: 320, height: 640, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
};
const ROUTES = ['#dashboard', '#chantiers', '#clients', '#chiffrage', '#devis', '#factures',
    '#depenses', '#ouvrages', '#materiaux', '#abonnement', '#settings/entreprise'];

// ─── Collecte des résultats ────────────────────────────────────────────────
const resultats = [];
const mesures = {};
function cas(ctrl, label, pass, detail = '') {
    resultats.push({ label: `[${ctrl}] ${label}`, pass: Boolean(pass), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
}
const noter = (cle, valeur) => { mesures[cle] = valeur; };

// ─── Outils injectés dans chaque document ──────────────────────────────────
function outilsPage() {
    const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
    const vis = (el) => {
        if (!el || !el.getBoundingClientRect) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        // Contenu d'un <details> fermé : mis en page par Chromium
        // (content-visibility) mais ni peint, ni cliquable, ni focalisable.
        if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })) return false;
        const ferme = el.closest('details:not([open])');
        if (ferme && ferme !== el && !el.closest('summary')) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.01;
    };
    // Part de l'élément réellement affichée (ancêtres qui rognent + fenêtre).
    const partVisible = (el) => {
        const r = el.getBoundingClientRect();
        let x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom;
        for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
            const cs = getComputedStyle(a);
            if (/(hidden|auto|scroll|clip)/.test(cs.overflowX + ' ' + cs.overflowY)) { const ra = a.getBoundingClientRect(); x1 = Math.max(x1, ra.left); y1 = Math.max(y1, ra.top); x2 = Math.min(x2, ra.right); y2 = Math.min(y2, ra.bottom); }
        }
        x1 = Math.max(x1, 0); y1 = Math.max(y1, 0); x2 = Math.min(x2, innerWidth); y2 = Math.min(y2, innerHeight);
        return (Math.max(0, x2 - x1) * Math.max(0, y2 - y1)) / Math.max(1, r.width * r.height);
    };
    const nom = (el) => {
        if (!el) return '';
        const lb = el.getAttribute('aria-labelledby');
        if (lb) { const t = norm(lb.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ')); if (t) return t; }
        const al = el.getAttribute('aria-label');
        if (al && al.trim()) return norm(al);
        const t = norm(el.innerText || el.textContent);
        if (t) return t;
        const img = el.querySelector && el.querySelector('img[alt]:not([alt=""]), svg[aria-label]');
        if (img) return norm(img.getAttribute('alt') || img.getAttribute('aria-label'));
        return norm(el.getAttribute('title') || '');
    };
    const dialogues = () => [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].filter(vis).map((d) => ({
        nom: nom(d).slice(0, 60), z: getComputedStyle(d).zIndex, role: d.getAttribute('role')
    }));
    const empreinte = () => { const t = document.body.innerText; let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return h; };
    const titre = () => norm([...document.querySelectorAll('h1')].filter(vis).map((h) => h.innerText)[0] || '');
    const decrire = (el) => (el ? `${el.tagName.toLowerCase()}${el.getAttribute('role') ? '[' + el.getAttribute('role') + ']' : ''}«${nom(el).slice(0, 50)}»` : '∅');
    const etat = () => {
        const c = document.querySelector('[data-g2="cible"]');
        const ouverts = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[role="tooltip"]')].filter(vis).length;
        return {
            hash: location.hash, url: location.href, titre: titre(), texte: empreinte(), nb: document.querySelectorAll('*').length,
            dialogues: ouverts, focus: decrire(document.activeElement),
            cible: c ? ['aria-expanded', 'aria-pressed', 'aria-selected', 'aria-checked', 'aria-current', 'class'].map((k) => c.getAttribute(k)).join('§') : 'DISPARUE'
        };
    };
    window.__g2 = { norm, vis, partVisible, nom, dialogues, empreinte, titre, decrire, etat };
}

// ─── Navigateur ────────────────────────────────────────────────────────────
let URL_BASE = '';
const externesBloquees = [];
const erreursPage = [];

async function session(browser, vp) {
    let ctx;
    try { ctx = await browser.createBrowserContext({ downloadBehavior: { policy: 'deny' } }); }
    catch { ctx = await browser.createBrowserContext(); }
    const page = await ctx.newPage();
    await page.setViewport(vp);
    page.setDefaultTimeout(45000);
    await page.evaluateOnNewDocument(outilsPage);
    await page.setRequestInterception(true);
    page.on('request', (r) => {
        const u = new URL(r.url());
        if (u.pathname === '/config.js') return r.respond({ contentType: 'application/javascript', body: CONFIG });
        if (/^https?:$/.test(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname)) { externesBloquees.push(u.hostname); return r.abort(); }
        r.continue();
    });
    page.on('pageerror', (e) => erreursPage.push(e.message.slice(0, 160)));
    const natifs = [];
    page.on('dialog', async (d) => { natifs.push(`${d.type()}: ${d.message().slice(0, 80)}`); await d.dismiss().catch(() => {}); });
    let onglets = 0;
    ctx.on('targetcreated', () => { onglets += 1; });
    await page.goto(URL_BASE + '/index.html', { waitUntil: 'networkidle0', timeout: 90000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle0', timeout: 90000 });
    const essai = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Essayer sans compte') || null);
    const el = essai.asElement();
    if (!el) throw new Error('bouton « Essayer sans compte » introuvable');
    if (vp.hasTouch) await el.tap(); else await el.click();
    await attendre(2800);
    return { page, ctx, natifs, get onglets() { return onglets; }, fermer: () => ctx.close().catch(() => {}) };
}

async function aller(page, hash) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await attendre(1300);
}

// Trouve le premier élément visible dont le nom accessible (ou le texte)
// correspond. `dans` restreint la recherche (sélecteur CSS de la portée).
async function trouver(page, motif, { dans = 'body', sel = 'button,[role="button"],[role="tab"],a[href],tr[role="button"]', rang = 0, horsDialogue = false } = {}) {
    const h = await page.evaluateHandle((src, flags, dans, sel, rang, horsDialogue) => {
        const re = new RegExp(src, flags);
        const zones = [...document.querySelectorAll(dans)];
        const els = zones.flatMap((z) => [...z.querySelectorAll(sel)]).filter(__g2.vis)
            .filter((e) => !horsDialogue || !e.closest('[role="dialog"],[role="alertdialog"]'))
            .filter((e) => re.test(__g2.nom(e)) || re.test(__g2.norm(e.innerText)));
        return els[rang] || null;
    }, motif.source, motif.flags, dans, sel, rang, horsDialogue);
    return h.asElement();
}
async function activer(page, motif, opts = {}) {
    const el = await trouver(page, motif, opts);
    if (!el) return false;
    if (opts.tap) await el.tap(); else await el.click();
    await attendre(opts.attente ?? 1200);
    return true;
}
const dialogues = (page) => page.evaluate(() => __g2.dialogues());
const titre = (page) => page.evaluate(() => __g2.titre());
const focusActuel = (page) => page.evaluate(() => __g2.decrire(document.activeElement));
async function capture(page, nom) {
    await mkdir(PREUVES, { recursive: true });
    await page.screenshot({ path: path.join(PREUVES, `${nom}.png`) }).catch(() => {});
    return `UX_EVIDENCE/G2-boutons-fenetres/${nom}.png`;
}
async function fermerTout(page) {
    for (let i = 0; i < 3; i++) {
        if ((await dialogues(page)).length === 0) return;
        await page.keyboard.press('Escape'); await attendre(450);
    }
}
// Le panneau visible d'une fenêtre (premier enfant non transparent) : sert à
// viser le voile (hors panneau) et le centre de la fenêtre.
const panneauFenetre = (page, motif) => page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    const d = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].filter(__g2.vis).reverse().find((x) => re.test(__g2.nom(x)));
    if (!d) return null;
    const enfants = [...d.querySelectorAll(':scope > *')].filter(__g2.vis);
    const p = enfants.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0] || d;
    const r = p.getBoundingClientRect(); const rd = d.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, plein: r.width >= rd.width - 2 && r.height >= rd.height - 2, dw: rd.width, dh: rd.height };
}, motif.source);

// ═══════════════════════════════════════════════════════════════════════════
// C022 — aucun bouton visible décoratif ou sans résultat expliqué
// C023 (partie e) réutilise le balayage : boutons qui changent d'écran.
// ═══════════════════════════════════════════════════════════════════════════
const EXCLUS_CLIC = /Google|Supprimer|Retirer|Réinitialiser|Effacer|Vider|Déconnexion|déconnecter|Export|Télécharger|^PDF$|Imprimer|Importer|Partager|Envoyer|Signer|Créer mon compte|Se connecter|Connexion|Récupérer|Choisir Standard|Choisir Entreprise|Payer|abonner|Installer|Aller au contenu/i;
const BALAYAGE = [];

async function balayer(s, route, { portee, tap = false, max = 28, largeur }) {
    const { page } = s;
    const neutre = route === '#clients' ? '#dashboard' : '#clients';
    const reinit = async () => { await fermerTout(page); await aller(page, neutre); await aller(page, route); };
    await reinit();
    const e1 = await page.evaluate(() => __g2.empreinte());
    await attendre(1200);
    const e2 = await page.evaluate(() => __g2.empreinte());
    const texteBruyant = e1 !== e2;
    const candidats = await page.evaluate((portee, max, exclu) => {
        const re = new RegExp(exclu, 'i');
        const exclusZone = (b) => b.closest('[role="dialog"],[role="alertdialog"]');
        const els = [...document.querySelectorAll(portee)].flatMap((z) => [...z.querySelectorAll('button,[role="button"]')])
            .filter((b, i, arr) => arr.indexOf(b) === i).filter(__g2.vis).filter((b) => !exclusZone(b));
        const vus = new Set(); const compte = {}; const out = [];
        for (const b of els) {
            const nom = __g2.nom(b);
            const rang = compte[nom] = (compte[nom] ?? -1) + 1;
            const desactive = b.disabled || b.getAttribute('aria-disabled') === 'true';
            const cle = /^(Sélectionner|Modifier|Dupliquer|Supprimer|Afficher|Renommer|Retirer|Voir)\b/.test(nom) ? nom.split(' ').slice(0, 2).join(' ') : nom;
            if (vus.has(cle)) continue; vus.add(cle);
            out.push({ nom, rang, exclu: re.test(nom), desactive });
            if (out.length >= max) break;
        }
        return out;
    }, portee, max, EXCLUS_CLIC.source);
    const res = [];
    for (const c of candidats) {
        const ligne = { route, largeur, nom: c.nom.slice(0, 70) };
        if (c.desactive) { res.push({ ...ligne, statut: 'désactivé' }); continue; }
        if (c.exclu) { res.push({ ...ligne, statut: 'non cliqué (destructif / sortant / fichier)' }); continue; }
        const propre = await page.evaluate((route) => location.hash === route && __g2.dialogues().length === 0, route);
        if (!propre) await reinit();
        const marquer = () => page.evaluateHandle((portee, nom, rang) => {
            document.querySelectorAll('[data-g2]').forEach((e) => e.removeAttribute('data-g2'));
            const els = [...document.querySelectorAll(portee)].flatMap((z) => [...z.querySelectorAll('button,[role="button"]')])
                .filter((b, i, arr) => arr.indexOf(b) === i).filter(__g2.vis)
                .filter((b) => !b.closest('[role="dialog"],[role="alertdialog"]') && __g2.nom(b) === nom);
            const el = els[rang] || null;
            if (el) { el.setAttribute('data-g2', 'cible'); el.focus({ preventScroll: true }); }
            return el;
        }, portee, c.nom, c.rang);
        let el = (await marquer()).asElement();
        if (!el) { await reinit(); el = (await marquer()).asElement(); }
        if (!el) { res.push({ ...ligne, statut: 'introuvable après réinitialisation' }); continue; }
        await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
        await attendre(150);
        const avant = await page.evaluate(() => __g2.etat());
        const natifs0 = s.natifs.length; const onglets0 = s.onglets;
        try { if (tap) await el.tap(); else await el.click(); }
        catch (e) { res.push({ ...ligne, statut: 'clic impossible : ' + e.message.slice(0, 60) }); continue; }
        await attendre(1200);
        const apres = await page.evaluate(() => __g2.etat()).catch(() => null);
        const effets = [];
        if (!apres) effets.push('page quittée');
        else {
            if (avant.url !== apres.url) effets.push(`adresse ${avant.hash || '∅'}→${apres.hash || '∅'}`);
            if (avant.titre !== apres.titre) effets.push(`écran « ${avant.titre} »→« ${apres.titre} »`);
            if (avant.dialogues !== apres.dialogues) effets.push(`calques ${avant.dialogues}→${apres.dialogues}`);
            if (avant.cible !== apres.cible) effets.push(apres.cible === 'DISPARUE' ? 'bouton remplacé' : 'état du bouton');
            if (avant.focus !== apres.focus) effets.push('focus déplacé');
            if (!texteBruyant && avant.texte !== apres.texte) effets.push('contenu modifié');
            if (avant.nb !== apres.nb) effets.push(`DOM ${avant.nb}→${apres.nb}`);
        }
        if (s.natifs.length > natifs0) effets.push('dialogue natif : ' + s.natifs.at(-1));
        if (s.onglets > onglets0) effets.push('nouvel onglet');
        const navigation = effets.some((x) => x.startsWith('écran') || x.startsWith('adresse')) && !effets.some((x) => x.startsWith('calques'));
        res.push({ ...ligne, statut: effets.length ? 'effet' : 'SANS EFFET OBSERVABLE', effets, navigation, texteBruyant });
        if (!effets.length) await capture(page, `C022-sans-effet-${largeur}-${route.replace(/[#/]/g, '')}-${c.nom.slice(0, 24).replace(/[^\p{L}\p{N}]+/gu, '_')}`);
        await page.keyboard.press('Escape').catch(() => {});
        await attendre(300);
    }
    return res;
}

async function C022(browser) {
    // a) Boutons visibles sans nom (11 écrans × 1440 / 390).
    for (const [cle, vp] of [['1440', VP.d1440], ['390', VP.m390]]) {
        const s = await session(browser, vp);
        try {
            const sansNom = []; const desactives = [];
            for (const r of ROUTES) {
                await aller(s.page, r);
                const x = await s.page.evaluate(() => {
                    const els = [...document.querySelectorAll('button,[role="button"]')].filter(__g2.vis);
                    return {
                        sansNom: els.filter((b) => !__g2.nom(b)).map((b) => b.outerHTML.slice(0, 100)),
                        // Bouton désactivé : la raison doit être dite (title, aria-describedby
                        // ou texte voisin dans le même conteneur).
                        desactives: els.filter((b) => b.disabled || b.getAttribute('aria-disabled') === 'true').map((b) => {
                            const desc = b.getAttribute('aria-describedby');
                            const voisin = __g2.norm(b.parentElement?.innerText || '').replace(__g2.nom(b), '').slice(0, 90);
                            return { nom: __g2.nom(b).slice(0, 50), title: b.getAttribute('title') || '', decrit: desc ? __g2.norm(document.getElementById(desc)?.textContent || '') : '', voisin };
                        })
                    };
                });
                x.sansNom.forEach((h) => sansNom.push(`${r} ${h}`));
                x.desactives.forEach((d) => desactives.push({ route: r, ...d }));
            }
            noter(`C022.desactives.${cle}`, desactives);
            cas('C022', `${cle} px — aucun bouton visible sans nom accessible sur 11 écrans`, sansNom.length === 0, sansNom.length ? sansNom.slice(0, 4).join(' ‖ ') : '0 bouton sans nom');
            const sansRaison = desactives.filter((d) => !d.title && !d.decrit && d.voisin.length < 8);
            cas('C022', `${cle} px — chaque bouton désactivé visible dit pourquoi (title, aria-describedby ou texte voisin)`, sansRaison.length === 0,
                `${desactives.length} désactivé(s) : ${desactives.map((d) => `${d.route} « ${d.nom} »${d.title ? ' title=« ' + d.title.slice(0, 40) + ' »' : ''}`).join(' ; ') || 'aucun'}`);
        } finally { await s.fermer(); }
    }

    // b) Balayage par clic réel : chaque bouton de premier niveau produit un effet observable.
    const plans = [
        { largeur: '1440', vp: VP.d1440, tap: false, routes: ['#dashboard', '#chantiers', '#clients', '#chiffrage', '#devis', '#devis/101', '#factures', '#depenses', '#ouvrages', '#materiaux', '#abonnement', '#settings/entreprise'], portee: '#main-content, [data-g2-settings]' },
        { largeur: '1440-chrome', vp: VP.d1440, tap: false, routes: ['#dashboard'], portee: 'aside[data-nav-principale], body > #root > div > div:first-child' },
        { largeur: '390', vp: VP.m390, tap: true, routes: ['#dashboard', '#chantiers', '#clients', '#devis', '#factures', '#chiffrage'], portee: '#main-content' },
        { largeur: '390-chrome', vp: VP.m390, tap: true, routes: ['#dashboard'], portee: 'nav[aria-label="Barre de navigation rapide"], body > #root > div > div:first-child' }
    ];
    for (const plan of plans) {
        const s = await session(browser, plan.vp);
        try {
            for (const r of plan.routes) {
                // Paramètres : l'écran couvre toute la fenêtre, hors #main-content.
                const portee = r.startsWith('#settings') || r === '#abonnement' ? 'body' : plan.portee;
                const res = await balayer(s, r, { portee, tap: plan.tap, largeur: plan.largeur });
                BALAYAGE.push(...res);
            }
        } finally { await s.fermer(); }
    }
    const cliques = BALAYAGE.filter((b) => b.statut === 'effet' || b.statut === 'SANS EFFET OBSERVABLE');
    const sansEffet = BALAYAGE.filter((b) => b.statut === 'SANS EFFET OBSERVABLE');
    noter('C022.balayage', BALAYAGE.map((b) => `${b.largeur} ${b.route} « ${b.nom} » → ${b.statut}${b.effets ? ' [' + b.effets.join(', ') + ']' : ''}`));
    cas('C022', `balayage par clic réel : ${cliques.length} boutons cliqués (1440 + 390), chacun produit un effet observable`, sansEffet.length === 0,
        sansEffet.length ? sansEffet.map((b) => `${b.largeur} ${b.route} « ${b.nom} »${b.texteBruyant ? ' (écran à contenu changeant : effet de contenu non mesurable)' : ''}`).join(' ‖ ') : 'tous ont un effet');
    const nonCliques = BALAYAGE.filter((b) => !['effet', 'SANS EFFET OBSERVABLE'].includes(b.statut));
    cas('C022', `boutons non cliqués par prudence (destructifs, sortants, fichiers) : ${nonCliques.length} — nommés par un verbe explicite`, nonCliques.every((b) => b.nom.length > 2),
        nonCliques.map((b) => `${b.largeur} ${b.route} « ${b.nom.slice(0, 40)} » (${b.statut})`).slice(0, 30).join(' ; '));

    // c) Le résultat annoncé par le nom du bouton est celui obtenu : « Annuler »
    //    des formulaires Nouvel ouvrage / Nouvelle matière.
    const s = await session(browser, VP.d1440);
    const { page } = s;
    try {
        for (const f of [
            { route: '#ouvrages', ouvrir: /^Créer un nouvel ouvrage au catalogue$/, champ: '[role="dialog"] form input:is(:not([type]),[type="text"])', etiquette: 'Nouvel ouvrage (fenêtre)' },
            { route: '#materiaux', ouvrir: /^Ajouter une nouvelle matière$/, champ: 'form input:is(:not([type]),[type="text"])', etiquette: 'Nouvelle matière (panneau)' }
        ]) {
            await fermerTout(page); await aller(page, '#dashboard'); await aller(page, f.route);
            await activer(page, f.ouvrir);
            const ch = await page.$(f.champ);
            await ch.click(); await page.keyboard.type('Témoin Annuler G2');
            const bouton = await page.evaluate(() => {
                const b = [...document.querySelectorAll('form button, [role="dialog"] button')].filter(__g2.vis).find((x) => __g2.norm(x.innerText) === 'Annuler');
                return b ? { visible: __g2.norm(b.innerText), nom: __g2.nom(b), title: b.getAttribute('title') || '' } : null;
            });
            // Le raccourci annoncé, joué pour de vrai dans le champ.
            const modif = process.platform === 'darwin' ? 'Meta' : 'Control';
            await page.keyboard.down(modif); await page.keyboard.press('z'); await page.keyboard.up(modif);
            await attendre(600);
            const apresRaccourci = await page.evaluate((sel) => ({ ouvert: !!document.querySelector(sel), valeur: document.querySelector(sel)?.value ?? null }), f.champ);
            await activer(page, /^Annuler/, { dans: f.route === '#ouvrages' ? '[role="dialog"]' : 'form' });
            const apresClic = await page.evaluate((sel) => ({ ouvert: !!document.querySelector(sel) && __g2.vis(document.querySelector(sel)), valeur: document.querySelector(sel)?.value ?? null }), f.champ);
            await capture(page, `C022-annuler-${f.route.slice(1)}-apres-clic`);
            const coherent = bouton && !/Cmd\+Z|Ctrl\+Z|modification/i.test(bouton.nom);
            cas('C022', `${f.etiquette} — le nom annoncé de « Annuler » décrit ce que fait le bouton`, coherent,
                bouton ? `texte visible « ${bouton.visible} » ; nom accessible « ${bouton.nom} » ; title « ${bouton.title} » ; ${modif}+Z dans le champ → formulaire ${apresRaccourci.ouvert ? 'toujours ouvert' : 'fermé'} (valeur « ${apresRaccourci.valeur} ») ; clic → formulaire ${apresClic.ouvert ? 'ouvert' : 'FERMÉ, saisie abandonnée'}` : 'bouton introuvable');
        }
    } finally { await s.fermer(); }
}

// ═══════════════════════════════════════════════════════════════════════════
// C023 — les liens servent la navigation, les boutons les actions
// ═══════════════════════════════════════════════════════════════════════════
async function C023(browser) {
    // a) Inventaire des liens : aucun lien utilisé comme bouton (href vide, « # », javascript:).
    for (const [cle, vp] of [['1440', VP.d1440], ['390', VP.m390]]) {
        const s = await session(browser, vp);
        try {
            const liens = []; const liensAction = [];
            for (const r of ROUTES) {
                await aller(s.page, r);
                const x = await s.page.evaluate(() => [...document.querySelectorAll('a')].filter(__g2.vis).map((a) => ({ nom: __g2.nom(a).slice(0, 40), href: a.getAttribute('href') })));
                x.forEach((l) => { liens.push(`${r} ${l.nom}→${l.href}`); if (l.href === null || l.href === '' || l.href === '#' || /^javascript:/i.test(l.href)) liensAction.push(`${r} « ${l.nom} » href=${l.href}`); });
            }
            noter(`C023.liens.${cle}`, [...new Set(liens)]);
            cas('C023', `${cle} px — aucun lien employé comme bouton (href vide, « # », javascript:) sur 11 écrans`, liensAction.length === 0,
                `${new Set(liens.map((l) => l.split(' ').slice(1).join(' '))).size} lien(s) distinct(s) visibles : ${[...new Set(liens.map((l) => l.split(' ').slice(1).join(' ')))].join(' ; ')}${liensAction.length ? ' — en action : ' + liensAction.join(' ; ') : ''}`);
        } finally { await s.fermer(); }
    }

    // b) Menu principal 1440 : nature des entrées + Cmd/Ctrl+clic et clic milieu.
    {
        const s = await session(browser, VP.d1440);
        try {
            const { page } = s;
            const entrees = await page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Menu principal"] button, nav[aria-label="Menu principal"] a')].filter(__g2.vis)
                .map((e) => `${e.tagName.toLowerCase()}${e.getAttribute('href') ? '[href=' + e.getAttribute('href') + ']' : ''}«${__g2.nom(e)}»`));
            noter('C023.menu1440', entrees);
            const t0 = await titre(page); const u0 = page.url(); const o0 = s.onglets;
            const cible = await trouver(page, /^Mes devis$/, { dans: 'nav[aria-label="Menu principal"]' });
            const modif = process.platform === 'darwin' ? 'Meta' : 'Control';
            await page.keyboard.down(modif); await cible.click(); await page.keyboard.up(modif);
            await attendre(1500);
            const t1 = await titre(page); const o1 = s.onglets;
            const cible2 = await trouver(page, /^Factures$/, { dans: 'nav[aria-label="Menu principal"]' });
            await cible2.click({ button: 'middle' }); await attendre(1500);
            const t2 = await titre(page); const o2 = s.onglets;
            const lienDeNav = entrees.filter((e) => e.startsWith('a[')).length;
            cas('C023', `1440 — entrées du menu principal = liens de navigation (${entrees.length} entrées)`, lienDeNav === entrees.length,
                `${entrees.join(', ')} ; adresse inchangée après navigation : ${u0 === page.url() ? 'oui (' + (new URL(page.url()).hash || 'sans fragment') + ')' : 'non'}`);
            cas('C023', `1440 — ${modif}+clic sur « Mes devis » ouvre un nouvel onglet sans quitter l'écran`, o1 > o0 && t1 === t0,
                `onglets créés ${o1 - o0} ; écran « ${t0} » → « ${t1} »`);
            cas('C023', '1440 — clic milieu sur « Factures » ouvre un nouvel onglet', o2 > o1, `onglets créés ${o2 - o1} ; écran → « ${t2} »`);

            // c) Ligne de devis : navigation vers #devis/<id> portée par un bouton.
            await aller(page, '#devis');
            const ligne = await trouver(page, /^Afficher le devis DEV-2026-001/, { sel: '[role="button"],button,a[href],tr' });
            const nature = ligne ? await ligne.evaluate((e) => `${e.tagName.toLowerCase()}[role=${e.getAttribute('role')}] href=${e.getAttribute('href')}`) : '∅';
            const o3 = s.onglets;
            await page.keyboard.down(modif); if (ligne) await ligne.click(); await page.keyboard.up(modif);
            await attendre(1500);
            const h3 = await page.evaluate(() => location.hash);
            cas('C023', '1440 — la ligne « DEV-2026-001 » mène à une adresse propre (#devis/<id>) : elle doit être un lien (nouvel onglet possible)',
                s.onglets > o3, `élément : ${nature} ; ${modif}+clic → onglets créés ${s.onglets - o3}, adresse courante ${h3}`);
            await capture(page, 'C023-ligne-devis-cmd-clic-1440');
        } finally { await s.fermer(); }
    }

    // d) Barre de navigation mobile.
    {
        const s = await session(browser, VP.m390);
        try {
            const entrees = await s.page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Barre de navigation rapide"] button, nav[aria-label="Barre de navigation rapide"] a')].filter(__g2.vis)
                .map((e) => `${e.tagName.toLowerCase()}«${__g2.nom(e)}»`));
            cas('C023', `390 — barre de navigation mobile : entrées de navigation en liens (${entrees.length})`, entrees.every((e) => e.startsWith('a')) || entrees.length === 0,
                entrees.join(', '));
        } finally { await s.fermer(); }
    }

    // e) Boutons qui changent d'écran (relevé du balayage C022).
    if (BALAYAGE.length) {
        const nav = BALAYAGE.filter((b) => b.navigation);
        noter('C023.boutonsNavigation', nav.map((b) => `${b.largeur} ${b.route} « ${b.nom} » [${b.effets.join(', ')}]`));
        const actionTrompeuse = nav.filter((b) => /^(Ajouter|Créer|Nouveau|Nouvelle)/i.test(b.nom) && b.effets.some((e) => e.startsWith('écran')) );
        cas('C023', `boutons dont le clic change d'écran (navigation) : ${nav.length} relevés par le balayage C022`, nav.length === 0,
            nav.slice(0, 14).map((b) => `${b.largeur} ${b.route} « ${b.nom.slice(0, 40)} » ${b.effets.filter((e) => /écran|adresse/.test(e)).join(' ')}`).join(' ; '));
        noter('C023.actionQuiNavigue', actionTrompeuse.map((b) => `${b.route} « ${b.nom} » ${b.effets.join(', ')}`));
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// C024 — boutons de formulaire : submit ou button intentionnel
// ═══════════════════════════════════════════════════════════════════════════
async function C024(browser) {
    const s = await session(browser, VP.d1440);
    const { page } = s;
    try {
        const formulaires = [
            { route: '#clients', ouvrir: /^Créer un nouveau client$/, nom: 'Nouveau client' },
            { route: '#chantiers', ouvrir: /^Créer un nouveau chantier$/, nom: 'Nouveau chantier' },
            { route: '#ouvrages', ouvrir: /^Créer un nouvel ouvrage au catalogue$/, nom: 'Nouvel ouvrage' },
            { route: '#depenses', ouvrir: /^Nouvelle dépense$/, nom: 'Nouvelle dépense' },
            { route: '#materiaux', ouvrir: /^Ajouter une nouvelle matière$/, nom: 'Nouvelle matière' },
            { route: '#settings/entreprise', ouvrir: null, nom: 'Paramètres entreprise' }
        ];
        const implicites = []; const inventaire = [];
        for (const f of formulaires) {
            await fermerTout(page); await aller(page, '#dashboard'); await aller(page, f.route);
            if (f.ouvrir) await activer(page, f.ouvrir);
            const x = await page.evaluate(() => [...document.querySelectorAll('form')].filter(__g2.vis).map((form) => {
                const boutons = [...document.querySelectorAll('button')].filter((b) => b.form === form).filter(__g2.vis);
                return boutons.map((b) => ({ nom: __g2.nom(b).slice(0, 40), attr: b.getAttribute('type'), effectif: b.type }));
            }).flat());
            x.forEach((b) => { inventaire.push(`${f.nom} : [${b.attr ?? '∅'}] ${b.nom}`); if (b.attr === null) implicites.push(`${f.nom} « ${b.nom} » (submit implicite)`); });
            const soumissions = x.filter((b) => b.effectif === 'submit');
            cas('C024', `${f.nom} — un seul bouton de soumission, explicite (« ${soumissions.map((b) => b.nom).join(' / ')} »), ${x.length - soumissions.length} bouton(s) type=button`,
                soumissions.length === 1 && soumissions[0].attr === 'submit' && x.filter((b) => b.attr === null).length === 0, x.map((b) => `[${b.attr ?? '∅'}→${b.effectif}] ${b.nom}`).join(' | '));
        }
        noter('C024.inventaire', inventaire);

        // Comportement 1 — Nouveau client : Entrée champ vide puis Entrée champ rempli.
        await fermerTout(page); await aller(page, '#dashboard'); await aller(page, '#clients');
        await activer(page, /^Créer un nouveau client$/);
        await page.click('#newClientForm-name'); await page.keyboard.press('Enter'); await attendre(900);
        const resteOuvert = (await dialogues(page)).some((d) => /Nouveau Client/i.test(d.nom));
        const msg = await page.evaluate(() => { const i = document.getElementById('newClientForm-name'); return i ? (i.validationMessage || __g2.norm(document.querySelector('[role="dialog"] [role="alert"]')?.innerText || '')) : ''; });
        cas('C024', 'Nouveau client — Entrée dans le nom vide : pas de création, la fenêtre reste ouverte avec un message', resteOuvert && msg.length > 0, `fenêtre ouverte : ${resteOuvert} ; message : « ${msg} »`);
        await page.keyboard.type('Client Entrée G2'); await page.keyboard.press('Enter'); await attendre(1400);
        const cree = await page.evaluate(() => [...document.querySelectorAll('button,[role="button"]')].some((b) => /Client Entrée G2/.test(__g2.nom(b))));
        cas('C024', 'Nouveau client — Entrée avec un nom : soumission intentionnelle, client créé', cree, `client « Client Entrée G2 » dans la liste : ${cree}`);

        // Comportement 2 — Nouveau chantier : le bouton « + » (créer un client) ne soumet pas.
        await fermerTout(page); await aller(page, '#dashboard'); await aller(page, '#chantiers');
        await activer(page, /^Créer un nouveau chantier$/);
        const champChantier = await page.$('#newProjectForm input:is(:not([type]),[type="text"])');
        await champChantier.click(); await page.keyboard.type('Chantier Témoin G2');
        await activer(page, /^Créer un nouveau client$/, { dans: '[role="dialog"]' });
        const apresPlus = await dialogues(page);
        await fermerTout(page); await aller(page, '#dashboard'); await aller(page, '#chantiers');
        const chantierCree = await page.evaluate(() => /Chantier Témoin G2/.test(document.body.innerText));
        cas('C024', 'Nouveau chantier — « + Créer un nouveau client » (type=button) n\'envoie pas le formulaire', !chantierCree,
            `calques après clic : ${apresPlus.map((d) => d.nom).join(' + ')} ; chantier créé à tort : ${chantierCree}`);

        // Comportement 3 — Nouvelle dépense : Entrée dans « Objet » sans montant.
        await fermerTout(page); await aller(page, '#dashboard'); await aller(page, '#depenses');
        await activer(page, /^Nouvelle dépense$/);
        const objet = await page.$('form[aria-label="Nouvelle dépense"] input:is(:not([type]),[type="text"])');
        await objet.click(); await page.keyboard.type('Ciment Entrée G2'); await page.keyboard.press('Enter'); await attendre(1000);
        const formEncore = await page.evaluate(() => !!document.querySelector('form[aria-label="Nouvelle dépense"]'));
        const invalide = await page.evaluate(() => { const f = document.querySelector('form[aria-label="Nouvelle dépense"]'); const i = f && [...f.querySelectorAll('input')].find((x) => !x.checkValidity()); return i ? `${i.id || i.name} : ${i.validationMessage}` : __g2.norm(f?.querySelector('[role="alert"]')?.innerText || ''); });
        // « À payer » (type=button) ne doit pas soumettre.
        await activer(page, /^À payer/, { dans: 'form[aria-label="Nouvelle dépense"]' });
        const toujours = await page.evaluate(() => !!document.querySelector('form[aria-label="Nouvelle dépense"]'));
        cas('C024', 'Nouvelle dépense — Entrée dans « Objet » sans montant : refus expliqué, rien d\'enregistré ; « À payer » ne soumet pas', formEncore && toujours && invalide.length > 0,
            `formulaire toujours ouvert : ${formEncore}/${toujours} ; champ refusé : ${invalide || 'aucun message'}`);
        await capture(page, 'C024-depense-entree-sans-montant');

        // Comportement 4 — Nouvelle matière : un sélecteur (type=button) ne soumet pas.
        await fermerTout(page); await aller(page, '#dashboard'); await aller(page, '#materiaux');
        await activer(page, /^Ajouter une nouvelle matière$/);
        const nomMat = await page.$('form input:is(:not([type]),[type="text"])');
        await nomMat.click(); await page.keyboard.type('Matière Témoin G2');
        await activer(page, /^BTP$/, { dans: 'form' });
        await page.keyboard.press('Escape'); await attendre(400);
        const matCreee = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => /Sélectionner Matière Témoin G2/.test(__g2.nom(b))));
        cas('C024', 'Nouvelle matière — ouvrir la liste « Catégorie » (type=button) n\'enregistre pas la matière', !matCreee, `matière créée à tort : ${matCreee}`);
        noter('C024.implicites', implicites);
    } finally { await s.fermer(); }
}

// ═══════════════════════════════════════════════════════════════════════════
// C026 — l'action principale domine dans son contexte
// ═══════════════════════════════════════════════════════════════════════════
function boutonsPleins() {
    const parse = (s) => { const m = (s || '').match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
    const hsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2; const d = mx - mn; return { s: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l }; };
    const out = [];
    for (const b of document.querySelectorAll('button,[role="button"],a[href]')) {
        if (!__g2.vis(b)) continue;
        const r = b.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
        const bg = parse(getComputedStyle(b).backgroundColor);
        if (!bg || bg[3] < 0.9) continue;
        const { s, l } = hsl(bg);
        if (!(s > 0.45 && l > 0.2 && l < 0.65)) continue;
        // Un onglet ou un segment SÉLECTIONNÉ n'est pas un appel à l'action.
        const bascule = b.getAttribute('role') === 'tab' || b.getAttribute('aria-pressed') !== null || b.getAttribute('aria-selected') !== null || /^Afficher (l'étude|le devis commercial)/.test(__g2.nom(b));
        out.push({ nom: __g2.nom(b).slice(0, 45), zone: b.closest('[role="dialog"]') ? 'fenêtre' : b.closest('aside, nav') ? 'navigation' : 'écran', bascule, surface: Math.round(r.width * r.height), x: Math.round(r.x), y: Math.round(r.y) });
    }
    return out;
}

async function C026(browser) {
    const attendus = {
        '#chantiers': /^Nouveau Chantier$/i, '#clients': /^Nouveau Client$/i, '#devis': /^Nouveau devis$/i,
        '#factures': /^Nouveau( — créer une facture depuis un devis)?$/i, '#depenses': /^Nouvelle dépense$/i, '#ouvrages': /^Nouvel Ouvrage$/i,
        '#materiaux': /^(Nouvelle Matière|Ajouter une nouvelle matière)$/i, '#chiffrage': /^Enregistrer/i, '#settings/entreprise': /^Enregistrer/i
    };
    for (const [cle, vp] of [['1440', VP.d1440], ['390', VP.m390]]) {
        const s = await session(browser, vp);
        const { page } = s;
        try {
            const releve = {};
            for (const r of ['#dashboard', ...Object.keys(attendus)]) {
                await fermerTout(page); await aller(page, '#clients' === r ? '#dashboard' : '#clients'); await aller(page, r);
                const pleins = (await page.evaluate(boutonsPleins)).filter((b) => !b.bascule);
                releve[r] = pleins.map((b) => `${b.nom} (${b.zone}, ${b.surface} px²)`);
                if (r === '#dashboard') continue;
                const ecran = pleins.filter((b) => b.zone !== 'navigation');
                const principal = await trouver(page, attendus[r], { dans: r.startsWith('#settings') ? 'body' : '#main-content' });
                const style = principal ? await principal.evaluate((e) => { const cs = getComputedStyle(e); return `${cs.backgroundColor} / ${cs.color} / bord ${cs.borderTopColor}`; }) : 'introuvable';
                const domine = ecran.length === 1 && attendus[r].test(ecran[0].nom);
                cas('C026', `${cle} px ${r} — l'action principale de l'écran est le seul bouton plein de son contexte`, domine,
                    `boutons pleins visibles : ${pleins.map((b) => `« ${b.nom} » [${b.zone}]`).join(', ') || 'aucun'} ; action attendue : ${style}`);
            }
            noter(`C026.pleins.${cle}`, releve);
            cas('C026', `${cle} px #dashboard — relevé (cf. UX-HYP-01, déjà connu)`, true, (releve['#dashboard'] || []).join(' ; '));

            // Fiche devis enregistré et accepté (DEV-2026-001).
            await fermerTout(page); await aller(page, '#clients'); await aller(page, '#devis/101');
            const pleinsFiche = (await page.evaluate(boutonsPleins)).filter((b) => !b.bascule);
            const fiche = pleinsFiche.filter((b) => cle === '1440' ? b.x > 700 : b.zone === 'fenêtre');
            const convertir = await trouver(page, /^Convertir en facture$/);
            const styleConv = convertir ? await convertir.evaluate((e) => getComputedStyle(e).backgroundColor) : '∅';
            cas('C026', `${cle} px fiche DEV-2026-001 (acceptée) — un seul bouton plein dans la fiche`, fiche.length <= 1,
                `pleins dans la fiche : ${fiche.map((b) => `« ${b.nom} » ${b.surface} px²`).join(', ')} ; « Convertir en facture » fond ${styleConv} ; ailleurs : ${pleinsFiche.filter((b) => !fiche.includes(b)).map((b) => b.nom).join(', ')}`);
            await capture(page, `C026-fiche-devis-${cle}`);

            // Fenêtres de création : un seul bouton plein, celui de validation.
            for (const [route, ouvrir, valide] of [['#clients', /^Créer un nouveau client$/, /Créer le client/], ['#chantiers', /^Créer un nouveau chantier$/, /Créer le chantier/], ['#ouvrages', /^Créer un nouvel ouvrage au catalogue$/, /^Enregistrer/]]) {
                await fermerTout(page); await aller(page, '#dashboard'); await aller(page, route);
                await activer(page, ouvrir, { tap: !!vp.hasTouch });
                const p = (await page.evaluate(boutonsPleins)).filter((b) => b.zone === 'fenêtre' && !b.bascule);
                cas('C026', `${cle} px fenêtre ouverte depuis ${route} — seul « ${valide.source} » est plein`, p.length === 1 && valide.test(p[0].nom), p.map((b) => b.nom).join(', ') || 'aucun');
            }
        } finally { await s.fermer(); }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// C029 — zones cliquables qui ne se chevauchent pas accidentellement
// ═══════════════════════════════════════════════════════════════════════════
function geometrie() {
    const SEL = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], [role="option"], [role="radio"]';
    // Fenêtre modale ouverte : seul son contenu est atteignable (le reste est sous le voile).
    const modales = [...document.querySelectorAll('[role="dialog"][aria-modal="true"],[role="alertdialog"]')].filter(__g2.vis);
    const racine = modales.length ? modales.sort((a, b) => (+getComputedStyle(b).zIndex || 0) - (+getComputedStyle(a).zIndex || 0))[0] : document;
    const els = [...racine.querySelectorAll(SEL)].filter(__g2.vis).filter((e) => !e.closest('[aria-hidden="true"],[inert]') && __g2.partVisible(e) >= 0.5);
    const desc = (e) => `${e.tagName.toLowerCase()}«${__g2.nom(e).slice(0, 34)}»`;
    const fixe = (e) => { let x = e; while (x && x !== document.body) { const p = getComputedStyle(x).position; if (p === 'fixed' || p === 'sticky') return true; x = x.parentElement; } return false; };
    const lie = (a, b) => a.contains(b) || b.contains(a) || (a.tagName === 'LABEL' && a.control === b) || (b.tagName === 'LABEL' && b.control === a);
    const chevauchements = [];
    const R = els.map((e) => e.getBoundingClientRect());
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        if (lie(els[i], els[j])) continue;
        // Contenu défilant sous une barre fixe : vérifié à part, en bas de liste.
        if (fixe(els[i]) !== fixe(els[j])) continue;
        const a = R[i], b = R[j];
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 2 && h > 2) chevauchements.push(`${desc(els[i])} ∩ ${desc(els[j])} ${Math.round(w)}×${Math.round(h)} px`);
    }
    // Recouvrement : le centre de la cible appartient-il à la cible ?
    const recouverts = [];
    els.forEach((e, i) => {
        const r = R[i]; const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return;
        const hit = document.elementFromPoint(cx, cy);
        if (!hit || e === hit || e.contains(hit)) return;
        if (hit.contains(e) && (hit.tagName === 'LABEL' || getComputedStyle(e).pointerEvents === 'none')) return;
        const couvreur = hit.closest(SEL) || hit;
        if (fixe(couvreur) && !fixe(e)) return; // contenu défilant sous une barre fixe : normal en haut de page
        recouverts.push(`${desc(e)} sous ${couvreur.tagName.toLowerCase()}.${String(couvreur.className).split(' ')[0]}«${__g2.nom(couvreur).slice(0, 25)}»`);
    });
    // Interactifs imbriqués dans un interactif (hors label/input).
    const imbriques = els.filter((e) => { const p = e.parentElement?.closest(SEL); return p && p.tagName !== 'LABEL' && els.includes(p); })
        .map((e) => `${desc(e)} dans ${desc(e.parentElement.closest(SEL))}`);
    return { n: els.length, chevauchements, recouverts, imbriques };
}

async function C029(browser) {
    for (const [cle, vp] of [['1440', VP.d1440], ['390', VP.m390], ['320', VP.m320]]) {
        const s = await session(browser, vp);
        const { page } = s;
        try {
            const bilan = {};
            let chev = 0, rec = 0;
            const imbr = new Set();
            for (const r of [...ROUTES, '#devis/101']) {
                await fermerTout(page); await aller(page, r === '#clients' ? '#dashboard' : '#clients'); await aller(page, r);
                const g = await page.evaluate(geometrie);
                bilan[r] = g; chev += g.chevauchements.length; rec += g.recouverts.length; g.imbriques.forEach((x) => imbr.add(`${r} ${x}`));
            }
            noter(`C029.geometrie.${cle}`, Object.fromEntries(Object.entries(bilan).map(([k, v]) => [k, { n: v.n, chevauchements: v.chevauchements.slice(0, 8), recouverts: v.recouverts.slice(0, 8) }])));
            cas('C029', `${cle} px — aucune paire de cibles non imbriquées ne se chevauche (12 écrans)`, chev === 0,
                Object.entries(bilan).filter(([, v]) => v.chevauchements.length).map(([k, v]) => `${k} : ${v.chevauchements.slice(0, 3).join(' ; ')}`).join(' ‖ ') || '0 chevauchement');
            cas('C029', `${cle} px — aucune cible recouverte par un autre élément en son centre`, rec === 0,
                Object.entries(bilan).filter(([, v]) => v.recouverts.length).map(([k, v]) => `${k} : ${v.recouverts.slice(0, 3).join(' ; ')}`).join(' ‖ ') || '0 recouvrement');
            noter(`C029.imbriques.${cle}`, [...imbr]);

            // Cible imbriquée : « Supprimer le devis » dans la ligne cliquable.
            await fermerTout(page); await aller(page, '#clients'); await aller(page, '#devis');
            const h0 = await page.evaluate(() => location.hash);
            const sup = await trouver(page, /^Supprimer le devis DEV-2026-001$/);
            if (sup) {
                const box = await sup.boundingBox();
                if (vp.hasTouch) await sup.tap(); else await sup.click();
                await attendre(1200);
                const d = await dialogues(page);
                const h1 = await page.evaluate(() => location.hash);
                const ficheOuverte = d.some((x) => /Société Immobilière NBB/.test(x.nom)) || h1 !== h0;
                const confirmation = d.some((x) => /Supprimer|supprimer/.test(x.nom));
                await capture(page, `C029-supprimer-dans-ligne-${cle}`);
                cas('C029', `${cle} px — toucher « Supprimer » (${Math.round(box.width)}×${Math.round(box.height)} px) dans la ligne de devis n'ouvre QUE la confirmation`, confirmation && !ficheOuverte,
                    `calques : ${d.map((x) => `${x.role} « ${x.nom} »`).join(' + ') || 'aucun'} ; adresse ${h0} → ${h1}`);
                const annuler = await trouver(page, /^Annuler$/, { dans: '[role="alertdialog"],[role="dialog"]' });
                if (annuler) { if (vp.hasTouch) await annuler.tap(); else await annuler.click(); await attendre(800); }
                await fermerTout(page);
                const encore = await page.evaluate(() => /DEV-2026-001/.test(document.body.innerText));
                cas('C029', `${cle} px — après « Annuler », le devis DEV-2026-001 est toujours là`, encore, '');
            } else cas('C029', `${cle} px — bouton « Supprimer le devis DEV-2026-001 » introuvable`, false, '');

            // Mobile : défilement réel jusqu'au bas des longues listes ; la dernière
            // cible ne doit pas rester sous la barre de navigation fixe.
            if (vp.hasTouch) {
                for (const r of ['#ouvrages', '#materiaux']) {
                    await fermerTout(page); await aller(page, '#clients'); await aller(page, r);
                    await page.mouse.move(vp.width / 2, vp.height / 2);
                    for (let i = 0; i < 25; i++) { await page.mouse.wheel({ deltaY: 900 }); await attendre(60); }
                    await attendre(700);
                    const bas = await page.evaluate(() => {
                        const nav = document.querySelector('nav[aria-label="Barre de navigation rapide"]');
                        const navTop = nav && __g2.vis(nav) ? nav.getBoundingClientRect().top : innerHeight;
                        const cibles = [...document.querySelectorAll('#main-content button,#main-content [role="button"]')].filter(__g2.vis);
                        const derniere = cibles.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
                        if (!derniere) return { ok: false, d: 'aucune cible' };
                        const r = derniere.getBoundingClientRect();
                        const hit = document.elementFromPoint(r.left + r.width / 2, Math.min(r.top + r.height / 2, innerHeight - 1));
                        let c = derniere.parentElement; while (c && !(/(auto|scroll)/.test(getComputedStyle(c).overflowY) && c.scrollHeight > c.clientHeight)) c = c.parentElement;
                        const defil = c ? `défilement ${Math.round(c.scrollTop)}/${c.scrollHeight - c.clientHeight} (butée ${Math.abs(c.scrollTop - (c.scrollHeight - c.clientHeight)) < 2 ? 'atteinte' : 'NON atteinte'})` : 'défilement du document';
                        return { ok: derniere.contains(hit) && r.bottom <= navTop + 1, d: `${defil} ; dernière « ${__g2.nom(derniere).slice(0, 40)} » bas=${Math.round(r.bottom)} ; barre fixe haut=${Math.round(navTop)} ; centre → ${__g2.decrire(hit)}` };
                    });
                    await capture(page, `C029-bas-de-liste-${cle}-${r.slice(1)}`);
                    cas('C029', `${cle} px ${r} — en bas de liste (molette), la dernière cible est dégagée de la barre fixe`, bas.ok, bas.d);
                }
                // Chiffrage vide : l'appel « Ajouter mon premier ouvrage » vs la barre de totaux fixe.
                await fermerTout(page); await aller(page, '#clients'); await aller(page, '#chiffrage');
                await page.mouse.move(vp.width / 2, vp.height / 3);
                for (let i = 0; i < 12; i++) { await page.mouse.wheel({ deltaY: 900 }); await attendre(60); }
                await attendre(700);
                const appel = await page.evaluate(() => {
                    const b = [...document.querySelectorAll('button')].filter(__g2.vis).find((x) => /^Ajouter mon premier ouvrage$/.test(__g2.nom(x)));
                    const barre = document.querySelector('.quote-totals-bar');
                    if (!b) return { ok: false, d: 'appel introuvable' };
                    const r = b.getBoundingClientRect(); const rb = barre && __g2.vis(barre) ? barre.getBoundingClientRect() : null;
                    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                    return { ok: b.contains(hit) && (!rb || r.bottom <= rb.top + 1), d: `appel ${Math.round(r.top)}–${Math.round(r.bottom)} px ; barre de totaux ${rb ? Math.round(rb.top) + '–' + Math.round(rb.bottom) : 'absente'} ; centre → ${__g2.decrire(hit)}` };
                });
                await capture(page, `C029-chiffrage-appel-vs-totaux-${cle}`);
                cas('C029', `${cle} px #chiffrage — après défilement, « Ajouter mon premier ouvrage » n'est pas sous la barre de totaux`, appel.ok, appel.d);
            }
        } finally { await s.fermer(); }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Fenêtres testées (C033, C034, C040)
// ═══════════════════════════════════════════════════════════════════════════
const FENETRES = [
    { route: '#clients', ouvrir: /^Créer un nouveau client$/, nom: /Nouveau Client/, champ: '#newClientForm-name', defile: false },
    { route: '#chantiers', ouvrir: /^Créer un nouveau chantier$/, nom: /Nouveau Chantier/, champ: '#newProjectForm input:is(:not([type]),[type="text"])' },
    { route: '#ouvrages', ouvrir: /^Créer un nouvel ouvrage au catalogue$/, nom: /Nouvel Ouvrage/, champ: '[role="dialog"] form input:is(:not([type]),[type="text"])' },
    { route: '#dashboard', ouvrir: /^Modifier et personnaliser le tableau de bord$/, nom: /Personnaliser/, champ: null }
];

// Conteneur défilant principal de l'arrière-plan (hors fenêtres).
const defilementFond = (page) => page.evaluate(() => {
    const c = [...document.querySelectorAll('#main-content *')].filter((e) => !e.closest('[role="dialog"]'))
        .filter((e) => { const cs = getComputedStyle(e); return /(auto|scroll)/.test(cs.overflowY) && e.scrollHeight - e.clientHeight > 40; })
        .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0];
    const se = document.scrollingElement;
    return { el: c ? c.scrollTop : null, max: c ? c.scrollHeight - c.clientHeight : 0, doc: se.scrollTop };
});

// ═══════════════════════════════════════════════════════════════════════════
// C033 — une modale ne laisse pas interagir avec son arrière-plan
// ═══════════════════════════════════════════════════════════════════════════
async function C033(browser) {
    for (const [cle, vp] of [['1440', VP.d1440], ['390', VP.m390]]) {
        const s = await session(browser, vp);
        const { page } = s;
        const tap = !!vp.hasTouch;
        try {
            const liste = [...FENETRES];
            if (tap) liste.push({ route: '#devis', ouvrir: /^Afficher le devis DEV-2026-001/, nom: /Société Immobilière NBB/, champ: null });
            for (const f of liste) {
                const etiquette = `${cle} px « ${f.nom.source} »`;
                await fermerTout(page); await aller(page, f.route === '#clients' ? '#dashboard' : '#clients'); await aller(page, f.route);
                // Cible d'arrière-plan : « Factures » du menu (1440) ou de la barre mobile (390).
                const fond = await trouver(page, /^Factures$/, { dans: tap ? 'nav[aria-label="Barre de navigation rapide"]' : 'nav[aria-label="Menu principal"]' });
                const fondBox = fond ? await fond.boundingBox() : null;
                // Préparer un arrière-plan défilé à mi-course pour la molette.
                await page.evaluate(() => {
                    const c = [...document.querySelectorAll('#main-content *')].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight - e.clientHeight > 40)[0];
                    if (c) c.scrollTop = Math.min(120, (c.scrollHeight - c.clientHeight) / 2);
                });
                const ouvert = await activer(page, f.ouvrir, { tap, sel: '[role="button"],button,tr' });
                const d0 = await dialogues(page);
                if (!ouvert || !d0.some((d) => f.nom.test(d.nom))) { cas('C033', `${etiquette} — fenêtre non ouverte`, false, JSON.stringify(d0)); continue; }
                const titre0 = await titre(page);

                // a) Piège à focus : 25 Tab puis 25 Maj+Tab.
                let sorties = [];
                for (const touche of ['Tab', 'Shift+Tab']) {
                    for (let i = 0; i < 25; i++) {
                        if (touche === 'Tab') await page.keyboard.press('Tab');
                        else { await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift'); }
                        const dedans = await page.evaluate((src) => { const re = new RegExp(src); const d = document.activeElement?.closest('[role="dialog"],[role="alertdialog"]'); return !!d && re.test(__g2.nom(d)); }, f.nom.source);
                        if (!dedans) sorties.push(`${touche}#${i + 1}→${await focusActuel(page)}`);
                    }
                }
                cas('C033', `${etiquette} — le focus reste dans la fenêtre (25 Tab + 25 Maj+Tab)`, sorties.length === 0, sorties.slice(0, 3).join(' ; ') || '0 sortie');

                // b) Molette sur le voile : l'arrière-plan ne défile pas.
                const p = await panneauFenetre(page, f.nom);
                const avantMol = await defilementFond(page);
                const pointVoile = p && !p.plein ? { x: Math.max(4, p.x / 2), y: vp.height / 2 } : { x: vp.width / 2, y: vp.height / 2 };
                await page.mouse.move(pointVoile.x, pointVoile.y);
                await page.mouse.wheel({ deltaY: 700 }); await attendre(500);
                const apresMol = await defilementFond(page);
                const fondDefile = avantMol.el !== apresMol.el || avantMol.doc !== apresMol.doc;
                cas('C033', `${etiquette} — la molette ${p?.plein ? 'dans la fenêtre plein écran' : 'sur le voile'} ne fait pas défiler l'arrière-plan`, !fondDefile,
                    `défilement fond ${avantMol.el}→${apresMol.el} (max ${avantMol.max}), document ${avantMol.doc}→${apresMol.doc}${avantMol.max === 0 ? ' — fond non défilable sur cet écran' : ''}`);

                // c) Clic / toucher à l'emplacement d'une commande d'arrière-plan.
                if (fondBox) {
                    const x = fondBox.x + fondBox.width / 2, y = fondBox.y + fondBox.height / 2;
                    const touche = await page.evaluate((x, y) => __g2.decrire(document.elementFromPoint(x, y)), x, y);
                    if (tap) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
                    await attendre(1200);
                    const titre1 = await titre(page);
                    const d1 = await dialogues(page);
                    cas('C033', `${etiquette} — ${tap ? 'toucher' : 'clic'} à l'emplacement de « Factures » (arrière-plan) n'y navigue pas`, titre1 === titre0,
                        `point (${Math.round(x)},${Math.round(y)}) reçu par ${touche} ; écran « ${titre0} » → « ${titre1} » ; fenêtre ${d1.some((d) => f.nom.test(d.nom)) ? 'toujours ouverte' : 'fermée'}`);
                }

                // d) Raccourcis clavier globaux (bureau) : Ctrl/Cmd+K et Alt+3.
                if (!tap) {
                    if (!(await dialogues(page)).some((d) => f.nom.test(d.nom))) { await aller(page, f.route); await activer(page, f.ouvrir); }
                    // Focus sur un bouton de la fenêtre (pas un champ) : « Annuler » ou la croix.
                    await page.evaluate((src) => { const re = new RegExp(src); const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => re.test(__g2.nom(x))); const b = d && ([...d.querySelectorAll('button')].find((x) => /^Annuler$/.test(__g2.nom(x))) || d.querySelector('button')); b?.focus(); }, f.nom.source);
                    const modif = process.platform === 'darwin' ? 'Meta' : 'Control';
                    await page.keyboard.down(modif); await page.keyboard.press('k'); await page.keyboard.up(modif);
                    await attendre(700);
                    const apresK = await page.evaluate((src) => {
                        const re = new RegExp(src); const a = document.activeElement;
                        const d = a?.closest('[role="dialog"]');
                        const r = a.getBoundingClientRect();
                        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                        return { dedans: !!d && re.test(__g2.nom(d)), focus: __g2.decrire(a), visible: a === hit || a.contains(hit), recouvrePar: __g2.decrire(hit?.closest('[role="dialog"]') || hit) };
                    }, f.nom.source);
                    await page.keyboard.type('Factures'); await attendre(700);
                    await capture(page, `C033-ctrlK-${cle}-${f.route.slice(1)}`);
                    await page.keyboard.press('Enter'); await attendre(1400);
                    const titreK = await titre(page);
                    const toujoursK = (await dialogues(page)).some((d) => f.nom.test(d.nom));
                    cas('C033', `${etiquette} — ${modif}+K ne sort pas de la fenêtre (focus, saisie, Entrée)`, apresK.dedans && titreK === titre0,
                        `focus → ${apresK.focus} (${apresK.dedans ? 'dans' : 'HORS'} fenêtre, ${apresK.visible ? 'visible' : 'sous ' + apresK.recouvrePar}) ; « Factures » + Entrée : écran « ${titre0} » → « ${titreK} », fenêtre ${toujoursK ? 'toujours ouverte' : 'fermée'}`);
                    await fermerTout(page); await aller(page, f.route === '#clients' ? '#dashboard' : '#clients'); await aller(page, f.route);
                    await activer(page, f.ouvrir);
                    await page.evaluate((src) => { const re = new RegExp(src); const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => re.test(__g2.nom(x))); const b = d && ([...d.querySelectorAll('button')].find((x) => /^Annuler$/.test(__g2.nom(x))) || d.querySelector('button')); b?.focus(); }, f.nom.source);
                    const tA = await titre(page);
                    await page.keyboard.down('Alt'); await page.keyboard.press('Digit3'); await page.keyboard.up('Alt');
                    await attendre(1400);
                    const tB = await titre(page);
                    const toujoursA = (await dialogues(page)).some((d) => f.nom.test(d.nom));
                    if (tA !== tB) await capture(page, `C033-alt3-${cle}-${f.route.slice(1)}`);
                    cas('C033', `${etiquette} — Alt+3 (raccourci « Factures ») ne change pas l'écran sous la fenêtre`, tA === tB,
                        `écran « ${tA} » → « ${tB} » ; fenêtre ${toujoursA ? 'toujours ouverte par-dessus' : 'fermée'}`);
                }

                // e) Arrière-plan exclu de l'arbre (lecteur d'écran) : relevé seulement.
                const fondMasque = await page.evaluate(() => {
                    const shell = document.querySelector('#root > div');
                    const d = document.querySelector('[role="dialog"]');
                    return `aria-modal=${d?.getAttribute('aria-modal')} ; fond inert=${!!shell?.closest('[inert]') || !!document.querySelector('#main-content[inert], #main-content [inert]')} aria-hidden=${shell?.getAttribute('aria-hidden')}`;
                });
                noter(`C033.fond.${cle}.${f.route}`, fondMasque);
                await fermerTout(page);
            }
        } finally { await s.fermer(); }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// C034 — fermer une fenêtre protège ou explique la perte des modifications
// ═══════════════════════════════════════════════════════════════════════════
async function C034(browser) {
    const TEMOIN = 'Témoin G2 non enregistré';
    for (const [cle, vp] of [['1440', VP.d1440], ['390', VP.m390]]) {
        const s = await session(browser, vp);
        const { page } = s;
        const tap = !!vp.hasTouch;
        try {
            const methodes = tap ? ['croix', 'voile', 'annuler'] : ['croix', 'echap', 'voile', 'annuler'];
            for (const f of FENETRES) {
                for (const m of methodes) {
                    await fermerTout(page); await aller(page, f.route === '#clients' ? '#dashboard' : '#clients'); await aller(page, f.route);
                    await activer(page, f.ouvrir, { tap });
                    if (!(await dialogues(page)).some((d) => f.nom.test(d.nom))) { cas('C034', `${cle} px « ${f.nom.source} » — fenêtre non ouverte`, false, ''); continue; }
                    // Modification : texte témoin, ou bascule du premier interrupteur (Personnaliser).
                    let modif = '';
                    if (f.champ) {
                        const ch = await page.$(f.champ);
                        if (tap) await ch.tap(); else await ch.click();
                        await page.keyboard.type(TEMOIN); modif = `saisie « ${TEMOIN} »`;
                    } else {
                        const bascule = await page.evaluateHandle(() => { const d = [...document.querySelectorAll('[role="dialog"]')].filter(__g2.vis).at(-1); return d.querySelector('input[type="checkbox"], [role="switch"], [aria-pressed]') || null; });
                        const b = bascule.asElement();
                        if (b) { const avant = await b.evaluate((x) => x.checked ?? x.getAttribute('aria-pressed')); if (tap) await b.tap(); else await b.click(); const apres = await b.evaluate((x) => x.checked ?? x.getAttribute('aria-pressed')); modif = `bascule ${avant}→${apres}`; }
                    }
                    await attendre(300);
                    const p = await panneauFenetre(page, f.nom);
                    if (m === 'croix') await activer(page, /^Fermer/, { dans: '[role="dialog"]', tap, attente: 900 });
                    else if (m === 'echap') { await page.keyboard.press('Escape'); await attendre(900); }
                    else if (m === 'annuler') await activer(page, /^Annuler$/, { dans: '[role="dialog"]', tap, attente: 900 });
                    else if (m === 'voile') {
                        if (p && !p.plein) {
                            const x = Math.max(6, p.x / 2), y = p.y > 40 ? p.y / 2 : Math.min(vp.height - 6, p.y + p.h + (vp.height - p.y - p.h) / 2);
                            if (tap) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
                            await attendre(900);
                        } else { cas('C034', `${cle} px « ${f.nom.source} » — voile`, true, 'fenêtre plein écran : pas de voile cliquable'); continue; }
                    }
                    const d = await dialogues(page);
                    const toujours = d.some((x) => f.nom.test(x.nom));
                    const avertit = await page.evaluate(() => [...document.querySelectorAll('[role="alertdialog"],[role="dialog"]')].filter(__g2.vis)
                        .some((x) => /perd|abandon|non enregistr|ne seront pas|quitter sans/i.test(x.innerText)));
                    let conserve = null;
                    if (!toujours && !avertit) {
                        await activer(page, f.ouvrir, { tap });
                        if (f.champ) conserve = await page.evaluate((sel, t) => document.querySelector(sel)?.value === t, f.champ, TEMOIN);
                        else conserve = await page.evaluate(() => { const d = [...document.querySelectorAll('[role="dialog"]')].filter(__g2.vis).at(-1); const b = d?.querySelector('input[type="checkbox"], [role="switch"], [aria-pressed]'); return b ? String(b.checked ?? b.getAttribute('aria-pressed')) : null; });
                    }
                    const issue = avertit ? 'avertissement affiché' : toujours ? 'fenêtre restée ouverte (rien perdu)' : conserve === true ? 'brouillon conservé à la réouverture' : 'FERMÉE SANS AVERTISSEMENT, modification perdue';
                    if (issue.startsWith('FERMÉE') && m !== 'annuler') await capture(page, `C034-${cle}-${f.route.slice(1)}-${m}-rouvert`);
                    const libelle = { croix: 'la croix', echap: 'Échap', voile: 'un clic sur le voile', annuler: '« Annuler » (abandon explicite)' }[m];
                    const ok = m === 'annuler' ? true : !issue.startsWith('FERMÉE');
                    cas('C034', `${cle} px « ${f.nom.source} » — fermer par ${libelle} après ${modif || 'modification'}`, ok,
                        `${issue}${conserve === false && f.champ ? ' (champ vide à la réouverture)' : ''}${typeof conserve === 'string' ? ' (état de la bascule à la réouverture : ' + conserve + ')' : ''}`);
                    await fermerTout(page);
                }
            }

            // Témoin positif : chiffrage modifié puis navigation latérale.
            if (!tap) {
                await fermerTout(page); await aller(page, '#clients');
                await activer(page, /^Nouveau devis$/, { dans: 'aside[data-nav-principale]' });
                const ajout = await activer(page, /^Ajouter une ligne libre$/);
                const nav = await activer(page, /^Factures$/, { dans: 'nav[aria-label="Menu principal"]' });
                const d = await dialogues(page);
                const texte = await page.evaluate(() => __g2.norm([...document.querySelectorAll('[role="alertdialog"],[role="dialog"]')].filter(__g2.vis).map((x) => x.innerText).join(' ')).slice(0, 160));
                await capture(page, 'C034-chiffrage-quitter-1440');
                cas('C034', '1440 chiffrage modifié (« Ajouter une ligne libre ») puis « Factures » dans le menu — la perte est annoncée', ajout && nav && /perdu|enregistr/i.test(texte),
                    `calques : ${d.map((x) => x.nom).join(' + ') || 'aucun'} ; texte : « ${texte} » ; écran : ${await titre(page)}`);
                await fermerTout(page);
            }

            // Mobile : geste Retour du téléphone sur la fiche devis ouverte depuis la liste.
            if (tap) {
                await fermerTout(page);
                const nav = await activer(page, /^Devis$/, { dans: 'nav[aria-label="Barre de navigation rapide"]', tap: true });
                const ligne = await activer(page, /^Afficher le devis DEV-2026-001/, { tap: true, sel: '[role="button"],button,tr' });
                const avant = { url: page.url(), d: (await dialogues(page)).map((x) => x.nom) };
                await capture(page, 'C034-390-fiche-avant-retour');
                let apresUrl = '', apresD = [];
                try { await page.goBack({ timeout: 8000 }); } catch (e) { apresUrl = 'goBack impossible : ' + e.message.slice(0, 50); }
                await attendre(1500);
                apresUrl = apresUrl || page.url();
                try { apresD = (await dialogues(page)).map((x) => x.nom); } catch { apresD = ['(page de l\'application déchargée)']; }
                const resteDansApp = apresUrl.startsWith(URL_BASE);
                await capture(page, 'C034-390-apres-retour');
                cas('C034', '390 — geste Retour sur la fiche devis (ouverte depuis « Devis » de la barre mobile) : ferme la fiche sans quitter l\'application',
                    nav && ligne && resteDansApp && !apresD.some((x) => /Société Immobilière NBB/.test(x)),
                    `avant : ${avant.url.replace(URL_BASE, '')} + fenêtre « ${avant.d.join(' + ')} » ; après Retour : ${resteDansApp ? apresUrl.replace(URL_BASE, '') : 'HORS APPLICATION (' + apresUrl + ')'} ; calques ${apresD.join(' + ') || 'aucun'}`);
            }
        } finally { await s.fermer(); }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// C037 — onglets : sélection et contenu associé clairs
// ═══════════════════════════════════════════════════════════════════════════
function analyseOnglets(nomListe) {
    const liste = [...document.querySelectorAll('[role="tablist"]')].filter(__g2.vis).find((t) => (t.getAttribute('aria-label') || '') === nomListe);
    if (!liste) return null;
    const tabs = [...liste.querySelectorAll('[role="tab"]')].filter(__g2.vis);
    const style = (t) => { const cs = getComputedStyle(t); return `${cs.backgroundColor}|${cs.color}|${cs.borderTopColor}|${cs.fontWeight}|${cs.boxShadow !== 'none'}`; };
    const sel = tabs.filter((t) => t.getAttribute('aria-selected') === 'true');
    const non = tabs.filter((t) => t.getAttribute('aria-selected') !== 'true');
    const controles = tabs.map((t) => t.getAttribute('aria-controls')).filter(Boolean);
    const panneaux = [...document.querySelectorAll('[role="tabpanel"]')].filter(__g2.vis);
    const arrets = tabs.filter((t) => t.tabIndex >= 0).length;
    return {
        n: tabs.length, noms: tabs.map((t) => __g2.nom(t).slice(0, 26)), selectionnes: sel.map((t) => __g2.nom(t).slice(0, 26)),
        distinct: sel.length === 1 && non.every((t) => style(t) !== style(sel[0])), styleSel: sel[0] ? style(sel[0]) : '', styleNon: non[0] ? style(non[0]) : '',
        ariaControls: controles.length, panneaux: panneaux.length, arretsTab: arrets
    };
}

async function testerOnglets(page, etiquette, nomListe, { tap = false, contenu = '#main-content, body' } = {}) {
    const a0 = await page.evaluate(analyseOnglets, nomListe);
    if (!a0) { cas('C037', `${etiquette} — liste d'onglets « ${nomListe} » introuvable`, false, ''); return; }
    const texte = () => page.evaluate((sel) => __g2.empreinte.call(null) + '|' + __g2.norm((document.querySelector(sel)?.innerText) || '').length, contenu);
    const t0 = await texte();
    // Clic réel sur un onglet non sélectionné.
    const cibleNom = a0.noms.find((n) => !a0.selectionnes.includes(n));
    const el = await trouver(page, new RegExp('^' + cibleNom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { sel: '[role="tab"]' });
    if (tap) await el.tap(); else await el.click();
    await attendre(900);
    const a1 = await page.evaluate(analyseOnglets, nomListe);
    const t1 = await texte();
    cas('C037', `${etiquette} — une seule sélection, visible (style distinct) et qui suit le clic (${a0.n} onglets)`,
        a0.selectionnes.length === 1 && a0.distinct && a1.selectionnes.length === 1 && a1.selectionnes[0] === cibleNom && a1.distinct,
        `avant « ${a0.selectionnes.join('/')} » → après clic « ${a1.selectionnes.join('/')} » ; sélectionné ${a1.styleSel} vs ${a1.styleNon}`);
    cas('C037', `${etiquette} — le contenu affiché change avec l'onglet`, t0 !== t1, `empreinte ${t0} → ${t1}`);
    cas('C037', `${etiquette} — chaque onglet est relié à son panneau (aria-controls → role=tabpanel)`, a1.ariaControls === a1.n && a1.panneaux >= 1,
        `aria-controls ${a1.ariaControls}/${a1.n} ; role=tabpanel visibles ${a1.panneaux}`);
    // Clavier : flèche droite depuis l'onglet sélectionné (modèle APG).
    if (!tap) {
        await page.evaluate((nomListe) => { const l = [...document.querySelectorAll('[role="tablist"]')].find((t) => t.getAttribute('aria-label') === nomListe); l?.querySelector('[role="tab"][aria-selected="true"]')?.focus(); }, nomListe);
        const f0 = await focusActuel(page);
        await page.keyboard.press('ArrowRight'); await attendre(500);
        const f1 = await focusActuel(page);
        cas('C037', `${etiquette} — flèche droite passe à l'onglet suivant ; un seul arrêt de tabulation`, f0 !== f1 && a1.arretsTab === 1,
            `focus ${f0} → ${f1} ; arrêts Tab dans la liste : ${a1.arretsTab}/${a1.n}`);
    }
}

// Groupes « segmentés » qui se comportent en onglets sans en avoir le rôle.
async function segments(page, etiquette, motifs, { tap = false } = {}) {
    const etats = await page.evaluate((srcs) => srcs.map((src) => {
        const re = new RegExp(src);
        const b = [...document.querySelectorAll('button,[role="button"]')].filter(__g2.vis).find((x) => re.test(__g2.nom(x)));
        if (!b) return { src, absent: true };
        const cs = getComputedStyle(b);
        return { nom: __g2.nom(b).slice(0, 30), aria: ['aria-pressed', 'aria-selected', 'aria-current', 'aria-checked'].map((k) => b.getAttribute(k) !== null ? `${k}=${b.getAttribute(k)}` : '').filter(Boolean).join(' '), style: `${cs.backgroundColor}|${cs.color}|${cs.fontWeight}` };
    }), motifs.map((m) => m.source));
    const presents = etats.filter((e) => !e.absent);
    const styles = new Set(presents.map((e) => e.style));
    const exposes = presents.filter((e) => e.aria);
    cas('C037', `${etiquette} — sélection visible ET annoncée (aria-pressed / aria-selected / aria-current)`, styles.size > 1 && exposes.length === presents.length && presents.length > 1,
        presents.map((e) => `« ${e.nom} » ${e.aria || 'aucun état ARIA'} [${e.style}]`).join(' ; ') + (etats.some((e) => e.absent) ? ' ; absents : ' + etats.filter((e) => e.absent).map((e) => e.src).join(', ') : ''));
}

async function C037(browser) {
    for (const [cle, vp] of [['1440', VP.d1440], ['390', VP.m390]]) {
        const s = await session(browser, vp);
        const { page } = s;
        const tap = !!vp.hasTouch;
        try {
            // Dépenses : une dépense « À payer » d'abord, pour que les onglets aient un contenu différent.
            await aller(page, '#clients'); await aller(page, '#depenses');
            await activer(page, /^Nouvelle dépense$/, { tap });
            await activer(page, /^À payer/, { dans: 'form[aria-label="Nouvelle dépense"]', tap });
            const objet = await page.$('form[aria-label="Nouvelle dépense"] input:is(:not([type]),[type="text"])');
            if (tap) await objet.tap(); else await objet.click();
            await page.keyboard.type('Ciment onglets G2');
            const montant = await page.evaluateHandle(() => { const f = document.querySelector('form[aria-label="Nouvelle dépense"]'); return [...f.querySelectorAll('input')].find((i) => /montant/i.test(__g2.norm(document.querySelector(`label[for="${i.id}"]`)?.innerText || '')) ) || f.querySelector('input[type="number"], input[inputmode="decimal"], input[inputmode="numeric"]'); });
            const m = montant.asElement();
            if (m) { if (tap) await m.tap(); else await m.click(); await page.keyboard.type('10000'); }
            await activer(page, /^Enregistrer$/, { dans: 'form[aria-label="Nouvelle dépense"]', tap, attente: 1500 });
            const enreg = await page.evaluate(() => /Ciment onglets G2/.test(document.body.innerText) && !document.querySelector('form[aria-label="Nouvelle dépense"]'));
            noter(`C037.depenseCreee.${cle}`, enreg);
            await testerOnglets(page, `${cle} px Dépenses`, 'Filtrer les dépenses', { tap });
            await capture(page, `C037-depenses-${cle}`);

            // Paramètres › Finances : rubriques.
            await aller(page, '#clients'); await aller(page, '#settings/finances');
            await testerOnglets(page, `${cle} px Paramètres › Finances`, 'Rubriques Finances', { tap, contenu: 'body' });

            // Chiffrage : onglets de lots (deux lots).
            await aller(page, '#clients'); await aller(page, '#chiffrage');
            const ajoutLot = await activer(page, /^Ajouter un lot au devis$/, { tap, sel: 'button' });
            if (ajoutLot) await testerOnglets(page, `${cle} px Chiffrage (lots)`, 'Onglets des lots de travaux', { tap });
            else cas('C037', `${cle} px Chiffrage — bouton d'ajout de lot introuvable`, false, '');

            // Groupes segmentés sans rôle d'onglet.
            await aller(page, '#clients'); await aller(page, '#factures');
            await segments(page, `${cle} px Factures (filtres de statut)`, [/^Toutes/, /^Non réglées/, /^Soldées/]);
            await aller(page, '#clients'); await aller(page, '#materiaux');
            await segments(page, `${cle} px Ressources (Matières / Main-d'œuvre)`, [/^Voir la liste des matières/, /^Voir la liste de la main/]);
            await aller(page, '#clients'); await aller(page, '#dashboard');
            await segments(page, `${cle} px Tableau de bord (période)`, [/^Tout$/, /^Ce mois$/, /^Trimestre$/, /^Année$/]);
            await aller(page, '#clients'); await aller(page, '#settings/entreprise');
            await segments(page, `${cle} px Paramètres (rubriques)`, [/^Entreprise/, /^Documents & PDF/, /^Finances/]);
        } finally { await s.fermer(); }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// C038 — calendriers : saisie accessible
// ═══════════════════════════════════════════════════════════════════════════
async function C038(browser) {
    for (const [cle, vp] of [['1440', VP.d1440], ['390', VP.m390]]) {
        const s = await session(browser, vp);
        const { page } = s;
        const tap = !!vp.hasTouch;
        try {
            const champs = [];
            await aller(page, '#clients'); await aller(page, '#depenses');
            await activer(page, /^Nouvelle dépense$/, { tap });
            await activer(page, /^À payer/, { dans: 'form[aria-label="Nouvelle dépense"]', tap });
            champs.push(...await page.evaluate(() => [...document.querySelectorAll('input')].filter(__g2.vis).filter((i) => /date|echeance|échéance/i.test(i.id + i.type)).map((i) => i.id)));
            // Saisie clavier réelle dans chaque champ date de la dépense.
            for (const id of champs) {
                const info = await page.evaluate((id) => { const i = document.getElementById(id); return { type: i.type, label: __g2.norm(document.querySelector(`label[for="${id}"]`)?.innerText || ''), ro: i.readOnly, valeur: i.value }; }, id);
                await page.focus('#' + id);
                // Chromium : le premier segment (jour, locale fr) reçoit la frappe.
                await page.keyboard.type('15112026', { delay: 40 });
                await attendre(300);
                const v = await page.evaluate((id) => document.getElementById(id).value, id);
                cas('C038', `${cle} px dépense #${id} — champ date natif, étiqueté, saisissable au clavier (15112026 → 2026-11-15)`,
                    info.type === 'date' && info.label.length > 0 && !info.ro && v === '2026-11-15', `type=${info.type} ; libellé « ${info.label} » ; valeur initiale ${info.valeur || '∅'} → ${v || '∅'}`);
            }
            if (!champs.length) cas('C038', `${cle} px dépense — aucun champ date trouvé`, false, '');
            // Atteignable par Tab depuis le champ précédent (pas seulement à la souris).
            if (!tap && champs[0]) {
                await page.evaluate((id) => { const all = [...document.querySelectorAll('input,select,textarea,button')].filter((e) => __g2.vis(e) && e.tabIndex >= 0); const i = all.indexOf(document.getElementById(id)); all[i - 1]?.focus(); }, champs[0]);
                await page.keyboard.press('Tab'); await attendre(200);
                const f = await page.evaluate(() => document.activeElement?.id);
                cas('C038', `${cle} px — #${champs[0]} atteint par Tab depuis le champ précédent`, f === champs[0], `focus : #${f}`);
            }
            await capture(page, `C038-dates-depense-${cle}`);

            // Inventaire : widgets calendrier non natifs (rôle grid / datepicker) sur les écrans.
            const widgets = [];
            for (const r of ROUTES) {
                await aller(page, r === '#clients' ? '#dashboard' : '#clients'); await aller(page, r);
                const w = await page.evaluate(() => ({
                    natifs: [...document.querySelectorAll('input[type="date"],input[type="month"],input[type="datetime-local"],input[type="week"],input[type="time"]')].filter(__g2.vis).length,
                    custom: [...document.querySelectorAll('[role="grid"],[class*="datepicker"],[class*="calendar"]:not(i)')].filter(__g2.vis).length,
                    texteDate: [...document.querySelectorAll('input:is(:not([type]),[type="text"])')].filter(__g2.vis).filter((i) => /jj\/mm|dd\/mm|date/i.test(i.placeholder + (i.getAttribute('aria-label') || ''))).length
                }));
                widgets.push(`${r} natifs=${w.natifs} personnalisés=${w.custom} texte-date=${w.texteDate}`);
            }
            noter(`C038.inventaire.${cle}`, widgets);
            cas('C038', `${cle} px — aucun calendrier personnalisé (souris seule) sur 11 écrans`, widgets.every((w) => /personnalisés=0/.test(w) && /texte-date=0/.test(w)), widgets.filter((w) => !/natifs=0 personnalisés=0 texte-date=0/.test(w)).join(' ; ') || 'aucun champ date affiché d\'office');
        } finally { await s.fermer(); }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// C039 — infobulles utiles accessibles autrement que par survol
// ═══════════════════════════════════════════════════════════════════════════
async function C039(browser) {
    // a) Inventaire 1440 : informations portées UNIQUEMENT par l'attribut title.
    {
        const s = await session(browser, VP.d1440);
        const { page } = s;
        try {
            const seulsTitle = [];
            for (const r of ROUTES) {
                await aller(page, r === '#clients' ? '#dashboard' : '#clients'); await aller(page, r);
                const x = await page.evaluate(() => [...document.querySelectorAll('[title]')].filter(__g2.vis).map((e) => {
                    const t = __g2.norm(e.getAttribute('title'));
                    const porte = (__g2.norm(e.innerText) + ' ' + (e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('aria-describedby') ? document.getElementById(e.getAttribute('aria-describedby'))?.textContent : '')).toLowerCase();
                    const mots = t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((m) => m.length > 3);
                    const nouveaux = mots.filter((m) => !porte.includes(m));
                    return { t: t.slice(0, 70), focalisable: e.tabIndex >= 0, balise: e.tagName.toLowerCase(), ajout: nouveaux.length >= Math.max(2, mots.length * 0.5) };
                }).filter((e) => e.ajout));
                x.forEach((e) => seulsTitle.push({ route: r, ...e }));
            }
            noter('C039.title1440', seulsTitle.map((e) => `${e.route} ${e.balise}${e.focalisable ? '(focalisable)' : ''} « ${e.t} »`));
            const nonFoc = seulsTitle.filter((e) => !e.focalisable);
            cas('C039', `1440 — informations portées uniquement par un title (survol) : ${seulsTitle.length} relevées sur 11 écrans`, seulsTitle.length === 0,
                seulsTitle.slice(0, 8).map((e) => `${e.route} ${e.balise}${e.focalisable ? '' : ' NON focalisable'} « ${e.t.slice(0, 50)} »`).join(' ; ') + (nonFoc.length ? ` — dont ${nonFoc.length} sur élément non focalisable` : ''));

            // b) « Coeff K » : explication annoncée « au survol comme au clavier ».
            await aller(page, '#clients'); await aller(page, '#chiffrage');
            let atteint = false; let pas = 0;
            await page.evaluate(() => document.querySelector('main h1, #main-content h1, #main-content h2')?.focus());
            for (; pas < 120 && !atteint; pas++) {
                await page.keyboard.press('Tab');
                atteint = await page.evaluate(() => /^Coeff K$/i.test(__g2.norm(document.activeElement?.innerText)));
            }
            const apresFocus = await page.evaluate(() => ({
                texte: /Coefficient de vente/.test(document.body.innerText),
                bulle: [...document.querySelectorAll('[role="tooltip"]')].filter(__g2.vis).map((t) => __g2.norm(t.innerText)).join(' | '),
                decrit: document.activeElement?.getAttribute('aria-describedby') || '',
                title: (document.activeElement?.getAttribute('title') || '').slice(0, 60)
            }));
            await capture(page, 'C039-coeffK-focus-clavier-1440');
            cas('C039', '1440 chiffrage — « Coeff K » atteint au clavier : l\'explication devient visible', atteint && (apresFocus.texte || apresFocus.bulle.length > 0),
                `atteint en ${pas} Tab : ${atteint} ; texte « Coefficient de vente… » visible : ${apresFocus.texte} ; infobulle visible : ${apresFocus.bulle || 'aucune'} ; l'explication n'existe que dans title=« ${apresFocus.title}… »`);
            const marge = await page.evaluate(() => { const e = [...document.querySelectorAll('[title]')].filter(__g2.vis).find((x) => /^Marge calculée/.test(x.getAttribute('title'))); return e ? { foc: e.tabIndex >= 0 || !!e.querySelector('a,button,[tabindex]'), texte: /Marge calculée après frais/.test(document.body.innerText) } : null; });
            cas('C039', '1440 chiffrage — « Marge prévue » : l\'explication (« Marge calculée après frais… ») est accessible au clavier', !!marge && (marge.foc || marge.texte),
                marge ? `bloc focalisable : ${marge.foc} ; texte visible ailleurs : ${marge.texte}` : 'bloc introuvable');
        } finally { await s.fermer(); }
    }
    // c) 390 : toucher « Coeff K ».
    {
        const s = await session(browser, VP.m390);
        const { page } = s;
        try {
            await aller(page, '#clients'); await aller(page, '#chiffrage');
            const k = await trouver(page, /^Coeff K$/i, { sel: 'span,[tabindex]' });
            if (k) {
                await k.tap(); await attendre(800);
                const vu = await page.evaluate(() => /Coefficient de vente/.test(document.body.innerText) || [...document.querySelectorAll('[role="tooltip"]')].some(__g2.vis));
                await capture(page, 'C039-coeffK-toucher-390');
                cas('C039', '390 chiffrage — toucher « Coeff K » affiche l\'explication', vu, `explication visible après toucher : ${vu}`);
            } else cas('C039', '390 chiffrage — « Coeff K » visible', false, 'non affiché à 390 px (barre de totaux repliée) — explication inaccessible au toucher sans dépli');
        } finally { await s.fermer(); }
    }
    // d) Rail replié 768 px : infobulles de la navigation.
    {
        const s = await session(browser, VP.t768);
        const { page } = s;
        try {
            const rail = await page.evaluate(() => {
                const items = [...document.querySelectorAll('.sidebar-item-collapsed-wrap')].filter(__g2.vis);
                return items.map((w) => {
                    const b = w.querySelector('button'); const lab = w.querySelector('.sidebar-item-collapsed-label');
                    return { nom: __g2.nom(b), visible: lab && __g2.vis(lab) ? __g2.norm(lab.innerText) : '', tronque: lab ? lab.scrollWidth > lab.clientWidth + 1 : null };
                });
            });
            noter('C039.rail768', rail);
            // Focus clavier réel sur l'engrenage « Paramètres » du rail.
            let ok = false; let n = 0;
            await page.evaluate(() => document.body.focus());
            for (; n < 60 && !ok; n++) { await page.keyboard.press('Tab'); ok = await page.evaluate(() => !!document.activeElement?.closest('.sidebar-item-collapsed-wrap') && /Paramètres/.test(__g2.nom(document.activeElement)) && !__g2.norm(document.activeElement.innerText)); }
            await attendre(400);
            const auFocus = await page.evaluate(() => { const t = document.activeElement?.closest('.sidebar-item-collapsed-wrap')?.querySelector('[role="tooltip"]'); return t ? getComputedStyle(t).opacity : 'absente'; });
            await capture(page, 'C039-rail-768-focus-parametres');
            const engr = await page.$('.sidebar-item-collapsed-wrap:last-of-type button');
            const btn = await trouver(page, /^Paramètres du compte$/, { dans: '.sidebar-item-collapsed-wrap' });
            if (btn) { await btn.hover(); await attendre(450); }
            const auSurvol = await page.evaluate(() => { const t = [...document.querySelectorAll('.sidebar-item-collapsed-wrap')].find((w) => /Paramètres/.test(__g2.nom(w.querySelector('button'))) && !__g2.norm(w.querySelector('button').innerText))?.querySelector('[role="tooltip"]'); return t ? getComputedStyle(t).opacity : 'absente'; });
            await capture(page, 'C039-rail-768-survol-parametres');
            void engr;
            cas('C039', '768 px rail replié — l\'infobulle « Paramètres » (icône seule) s\'affiche aussi au focus clavier', ok && Number(auFocus) > 0.5,
                `atteint en ${n} Tab : ${ok} ; opacité au focus ${auFocus} ; au survol ${auSurvol}`);
            const tronques = rail.filter((r) => r.tronque || !r.visible);
            cas('C039', `768 px rail replié — les ${rail.length} entrées affichent leur libellé complet sans survol`, tronques.length === 0,
                rail.map((r) => `« ${r.nom} »→« ${r.visible || '—'} »${r.tronque ? ' (tronqué)' : ''}`).join(' ; '));
        } finally { await s.fermer(); }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// C040 — composants superposés : pas de blocage ni d'empilement incohérent
// ═══════════════════════════════════════════════════════════════════════════
async function C040(browser) {
    for (const [cle, vp] of [['1440', VP.d1440], ['390', VP.m390]]) {
        const s = await session(browser, vp);
        const { page } = s;
        const tap = !!vp.hasTouch;
        try {
            // a) Fenêtre dans une fenêtre : Nouveau chantier → « + » Nouveau client.
            await aller(page, '#dashboard'); await aller(page, '#chantiers');
            await activer(page, /^Créer un nouveau chantier$/, { tap });
            const ch = await page.$('#newProjectForm input:is(:not([type]),[type="text"])');
            if (tap) await ch.tap(); else await ch.click();
            await page.keyboard.type('Chantier Pile G2');
            await activer(page, /^Créer un nouveau client$/, { dans: '[role="dialog"]', tap });
            const pile = await page.evaluate(() => {
                const ds = [...document.querySelectorAll('[role="dialog"]')].filter(__g2.vis);
                const haut = ds.find((d) => /Nouveau Client/.test(__g2.nom(d)));
                const panneau = haut && [...haut.querySelectorAll(':scope > *')].filter(__g2.vis)[0];
                const r = panneau?.getBoundingClientRect();
                const hit = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
                return { noms: ds.map((d) => `${__g2.nom(d).slice(0, 20)}@z${getComputedStyle(d).zIndex}`), dessus: !!hit && !!haut && haut.contains(hit), focus: !!haut && haut.contains(document.activeElement) };
            });
            await capture(page, `C040-fenetre-dans-fenetre-${cle}`);
            cas('C040', `${cle} px — « Nouveau client » ouvert depuis « Nouveau chantier » est au-dessus et reçoit le focus`, pile.noms.length === 2 && pile.dessus && pile.focus,
                `pile : ${pile.noms.join(' / ')} ; centre de la fenêtre du haut touché : ${pile.dessus} ; focus dedans : ${pile.focus}`);
            if (!tap) { await page.keyboard.press('Escape'); }
            else { await activer(page, /^Annuler$/, { dans: '[role="dialog"]', tap, rang: 1 }); }
            await attendre(900);
            const apres = await page.evaluate(() => ({ noms: __g2.dialogues().map((d) => d.nom.slice(0, 20)), valeur: document.querySelector('#newProjectForm input:is(:not([type]),[type="text"])')?.value || '', focus: __g2.decrire(document.activeElement) }));
            cas('C040', `${cle} px — ${tap ? '« Annuler »' : 'Échap'} ferme seulement la fenêtre du haut ; « Nouveau chantier » garde sa saisie et le focus`,
                apres.noms.length === 1 && /Nouveau Chantier/.test(apres.noms[0]) && apres.valeur === 'Chantier Pile G2' && /Créer un nouveau client|Nouveau Chantier/i.test(apres.focus + apres.noms[0]),
                `restantes : ${apres.noms.join(' / ') || 'aucune'} ; saisie « ${apres.valeur} » ; focus ${apres.focus}`);
            await fermerTout(page);

            // b) Liste déroulante dans une fenêtre (client du chantier) : au-dessus, non rognée.
            await aller(page, '#dashboard'); await aller(page, '#chantiers');
            await activer(page, /^Créer un nouveau chantier$/, { tap });
            const sel = await page.evaluateHandle(() => { const d = [...document.querySelectorAll('[role="dialog"]')].filter(__g2.vis).at(-1); return [...d.querySelectorAll('button')].find((b) => /Société Immobilière NBB/.test(__g2.nom(b))) || d.querySelector('select'); });
            const selEl = sel.asElement();
            if (selEl) {
                const balise = await selEl.evaluate((e) => e.tagName);
                if (balise === 'SELECT') cas('C040', `${cle} px — liste « Client » de la fenêtre chantier`, true, 'select natif : rendu par le système, hors pile');
                else {
                    if (tap) await selEl.tap(); else await selEl.click();
                    await attendre(700);
                    const lb = await page.evaluate(() => {
                        const l = [...document.querySelectorAll('[role="listbox"],[role="menu"]')].filter(__g2.vis).at(-1);
                        if (!l) return null;
                        const o = [...l.querySelectorAll('[role="option"],button,li')].filter(__g2.vis).at(-1);
                        const r = (o || l).getBoundingClientRect();
                        const hit = document.elementFromPoint(r.left + r.width / 2, Math.min(r.top + r.height / 2, innerHeight - 1));
                        return { dessus: l.contains(hit), dansEcran: r.bottom <= innerHeight && r.top >= 0, z: getComputedStyle(l).zIndex, der: __g2.nom(o || l).slice(0, 30) };
                    });
                    await capture(page, `C040-liste-dans-fenetre-${cle}`);
                    cas('C040', `${cle} px — la liste « Client » ouverte dans la fenêtre chantier est au-dessus et entièrement visible`, !!lb && lb.dessus && lb.dansEcran,
                        lb ? `dernière option « ${lb.der} » touchée : ${lb.dessus} ; dans l'écran : ${lb.dansEcran} ; z=${lb.z}` : 'aucune liste ouverte');
                }
            }
            await fermerTout(page);

            // c) Barre de totaux fixe du chiffrage vs fenêtre ouverte depuis le chiffrage.
            await aller(page, '#dashboard'); await aller(page, '#chiffrage');
            const barre = await page.evaluate(() => { const b = document.querySelector('.quote-totals-bar'); if (!b || !__g2.vis(b)) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 20) }; });
            const ouvert = await activer(page, /^Choisir dans le Catalogue complet$/, { tap });
            const dCat = await dialogues(page);
            if (barre && ouvert && dCat.length) {
                const hit = await page.evaluate((x, y) => { const h = document.elementFromPoint(x, y); return { dansFenetre: !!h?.closest('[role="dialog"]'), barre: !!h?.closest('.quote-totals-bar'), d: __g2.decrire(h) }; }, barre.x, barre.y);
                await capture(page, `C040-catalogue-sur-totaux-${cle}`);
                cas('C040', `${cle} px chiffrage — la fenêtre « ${dCat.at(-1).nom.slice(0, 30)} » recouvre la barre de totaux fixe`, hit.dansFenetre && !hit.barre, `au point de la barre : ${hit.d}`);
            } else cas('C040', `${cle} px chiffrage — barre de totaux / catalogue`, false, `barre visible : ${!!barre} ; catalogue ouvert : ${ouvert} ; calques ${JSON.stringify(dCat)}`);
            await fermerTout(page);

            // d) Raccourci de recherche (bureau) : la recherche s'ouvre-t-elle SOUS la fenêtre ?
            if (!tap) {
                await aller(page, '#dashboard'); await aller(page, '#clients');
                await activer(page, /^Créer un nouveau client$/);
                await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find((b) => /^Annuler$/.test(__g2.nom(b)))?.focus());
                const modif = process.platform === 'darwin' ? 'Meta' : 'Control';
                await page.keyboard.down(modif); await page.keyboard.press('k'); await page.keyboard.up(modif);
                await attendre(800);
                const rech = await page.evaluate(() => {
                    const a = document.activeElement;
                    const pan = [...document.querySelectorAll('*')].filter((e) => __g2.vis(e) && /Accès rapide|ACCÈS RAPIDE/.test(e.innerText || '') && e.children.length > 1 && !e.closest('[role="dialog"]')).sort((x, y) => x.innerText.length - y.innerText.length)[0];
                    const r = pan?.getBoundingClientRect();
                    const hit = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
                    return { focus: __g2.decrire(a), focusDansFenetre: !!a.closest('[role="dialog"]'), panneau: !!pan, panneauSous: !!hit && !!hit.closest('[role="dialog"]') };
                });
                await capture(page, 'C040-recherche-sous-fenetre-1440');
                cas('C040', `1440 — ${modif}+K pendant « Nouveau client » : pas de panneau ouvert sous le voile avec le focus dedans`, rech.focusDansFenetre || !rech.panneau,
                    `focus → ${rech.focus} ; panneau de recherche ouvert : ${rech.panneau} ; recouvert par la fenêtre : ${rech.panneauSous}`);
                await fermerTout(page);
            }

            // e) Fenêtre restée ouverte quand l'écran change (historique du navigateur).
            await aller(page, '#factures');
            await aller(page, '#devis/101');
            const d1 = await dialogues(page);
            await page.goBack(); await attendre(1600);
            const t2 = await titre(page); const h2 = await page.evaluate(() => location.hash);
            const d2 = await dialogues(page);
            const fiche = d2.some((d) => /Société Immobilière NBB/.test(d.nom));
            if (fiche) await capture(page, `C040-fiche-reste-apres-retour-${cle}`);
            cas('C040', `${cle} px — #factures → #devis/101 → Retour du navigateur : aucune fenêtre de la fiche ne reste par-dessus « Factures »`,
                !fiche, `fiche en fenêtre à l'aller : ${d1.map((d) => d.nom.slice(0, 25)).join(' + ') || 'non (panneau)'} ; après Retour : adresse ${h2}, écran « ${t2} », calques ${d2.map((d) => d.nom.slice(0, 25)).join(' + ') || 'aucun'}`);
            await fermerTout(page);

            // f) Mobile : menu « Menu » puis navigation — le tiroir se referme.
            if (tap) {
                await activer(page, /^Menu$/, { dans: 'nav[aria-label="Barre de navigation rapide"]', tap: true });
                const dm = await dialogues(page);
                await activer(page, /^Clients & CRM$/, { dans: '[role="dialog"]', tap: true });
                const dm2 = await dialogues(page);
                cas('C040', '390 — le tiroir « Menu » se referme quand on choisit « Clients & CRM »', dm.some((d) => /Menu/.test(d.nom)) && dm2.length === 0,
                    `ouvert : ${dm.map((d) => d.nom).join(' + ')} ; après choix : ${dm2.map((d) => d.nom).join(' + ') || 'aucun'} ; écran « ${await titre(page)} »`);
            }
        } finally { await s.fermer(); }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
export async function run() {
    resultats.length = 0;
    const { url, close } = await startServer();
    URL_BASE = url;
    const browser = await puppeteer.launch({ headless: true });
    const controles = { C022, C023, C024, C026, C029, C033, C034, C037, C038, C039, C040 };
    try {
        for (const [id, fn] of Object.entries(controles)) {
            if (SEULEMENT.length && !SEULEMENT.includes(id)) continue;
            const t0 = Date.now();
            let essai = 0;
            for (;;) {
                const avant = resultats.length;
                try { await fn(browser); break; }
                catch (e) {
                    resultats.splice(avant);
                    if (essai++ === 0 && /timeout|Timeout|détaché|detached|Target closed|Session closed/i.test(e.message)) { console.error(`  … ${id} : délai dépassé, nouvelle tentative`); continue; }
                    cas(id, 'BLOQUÉ — la sonde n\'a pas pu terminer', false, e.message.slice(0, 200));
                    break;
                }
            }
            console.error(`  ${id} terminé en ${Math.round((Date.now() - t0) / 1000)} s`);
        }
    } finally {
        await browser.close();
        await close();
    }
    resultats.push({ label: '[environnement] aucune requête hors 127.0.0.1 n\'a abouti (toutes bloquées)', pass: true, detail: `${externesBloquees.length} tentative(s) bloquée(s) : ${[...new Set(externesBloquees)].join(', ') || 'aucune'}` });
    resultats.push({ label: '[environnement] aucune erreur JavaScript pendant les parcours', pass: erreursPage.length === 0, detail: [...new Set(erreursPage)].slice(0, 5).join(' | ') || 'aucune' });
    return resultats.slice();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const r = await run();
    for (const x of r) console.log(`  ${x.pass ? '✅' : '❌'} ${x.label}${x.detail ? ' — ' + x.detail : ''}`);
    console.log('\nMESURES ' + JSON.stringify(mesures, null, 1));
    process.exit(0);
}
