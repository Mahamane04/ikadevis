#!/usr/bin/env node
// Audit UX 220 contrôles (2026-10) — groupe G1 « compréhension, navigation, compte ».
//
// Contrôles couverts : C002 C007 C010 C011 C017 C018 C019 C020
//                      C101 C102 C103 C104 C105 C107 C108 C109 C110.
//
// Environnement isolé : serveur statique local (scratch/lib/server.mjs) qui sert
// config.example.js (URL Supabase factice) ; TOUTE requête hors 127.0.0.1 est
// bloquée et comptée. Mode Démo uniquement (« Essayer sans compte »), données
// fictives, un contexte de navigation neuf (stockage vide) par parcours.
// Aucun compte réel, aucun mot de passe saisi, aucun clic sur Google.
//
// Comme un utilisateur : clics souris réels (ElementHandle.click — le
// recouvrement compte), vraies touches (Tab, Entrée, Échap, Alt+2, Cmd+K),
// vraie molette (page.mouse.wheel), historique du navigateur (page.goBack).
// La sonde MESURE le DOM, les rectangles, les images successives (rAF) et le
// stockage — elle ne lit pas le code source.
//
// Deux déclencheurs ne peuvent pas venir d'un vrai serveur ici et sont SIMULÉS,
// ce que chaque cas concerné indique :
//   - l'arrivée par un lien e-mail périmé : on ouvre l'adresse exacte vers
//     laquelle Supabase redirige (#error=access_denied&error_code=otp_expired…) ;
//   - l'expiration de session / le retour d'un lien de réinitialisation : on
//     émet, dans la page, l'événement que le client Supabase émet lui-même
//     (SIGNED_OUT / PASSWORD_RECOVERY) via son notificateur interne. Aucune
//     requête réseau n'est faite ; l'écran qui suit est le vrai.
//
//   node tests/ux/controles/G1-comprehension-navigation-compte.mjs
//   G1_SEULEMENT=C019,C107 node tests/ux/controles/G1-comprehension-navigation-compte.mjs
//
// Sortie : une ligne par cas ([Cxxx] libellé — détail), captures dans
// docs/audit-ux-220/UX_EVIDENCE/G1-comprehension-navigation-compte/.
import puppeteer from 'puppeteer';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from '../../../scratch/lib/server.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '../../..');
const PREUVES = path.join(RACINE, 'docs/audit-ux-220/UX_EVIDENCE/G1-comprehension-navigation-compte');
const CONFIG = await readFile(new URL('../../../config.example.js', import.meta.url), 'utf8');
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const SEULEMENT = (process.env.G1_SEULEMENT || '').split(',').map((s) => s.trim()).filter(Boolean);

const VP = {
    d1440: { width: 1440, height: 900 },
    d1024: { width: 1024, height: 768 },
    t768: { width: 768, height: 1024, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
    m390: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
    m360: { width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
    m320: { width: 320, height: 640, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
};

// ─── Collecte ───────────────────────────────────────────────────────────────
const resultats = [];
const mesures = {};
const cas = (ctrl, label, pass, detail = '') => resultats.push({
    label: `[${ctrl}] ${label}`, pass: Boolean(pass),
    detail: typeof detail === 'string' ? detail : JSON.stringify(detail)
});
const noter = (cle, valeur) => { mesures[cle] = valeur; };
const externesBloquees = [];
const erreursPage = [];

// ─── Outils injectés dans chaque document ──────────────────────────────────
function outilsPage() {
    const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
    const vis = (el) => {
        if (!el || !el.getBoundingClientRect) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.01;
    };
    const texte = (el) => norm(el && (el.innerText || el.textContent));
    const trouver = (sel, src, attr) => {
        const re = new RegExp(src);
        return [...document.querySelectorAll(sel)].find((e) => vis(e) && re.test(attr ? (e.getAttribute(attr) || '') : texte(e))) || null;
    };
    // Messages éphémères (toasts, alertes) : on garde tout ce qui passe, sauf
    // le compteur de la transition volontaire de 350 ms (UX-DEC-01).
    const messages = [];
    const observer = () => {
        const mo = new MutationObserver(() => {
            document.querySelectorAll('[role="status"],[role="alert"]').forEach((n) => {
                const t = texte(n);
                if (t && !/^Chargement en cours/.test(t) && !messages.includes(t)) messages.push(t);
            });
        });
        mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observer); else observer();
    const etat = () => ({
        hash: location.hash,
        h1: [...document.querySelectorAll('h1')].filter(vis).map(texte).join(' | '),
        h2: [...document.querySelectorAll('h2')].filter(vis).map(texte).slice(0, 3).join(' | '),
        courant: [...document.querySelectorAll('[aria-current="page"]')].filter(vis).map(texte).join(', '),
        dialogues: [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].filter(vis)
            .map((d) => norm(d.getAttribute('aria-label') || document.getElementById(d.getAttribute('aria-labelledby') || '')?.textContent || texte(d).slice(0, 60)))
    });
    const focus = () => {
        const a = document.activeElement;
        if (!a || a === document.body) return 'BODY';
        return `${a.tagName}:${norm(a.getAttribute('aria-label') || a.id || a.innerText || '').slice(0, 50)}`;
    };
    window.__g1 = { norm, vis, texte, trouver, messages, etat, focus };
}

// ─── Ouverture d'un contexte neuf ──────────────────────────────────────────
async function ouvrir(browser, url, vp = VP.d1440, { hash = '', vider = true } = {}) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport(vp);
    await page.evaluateOnNewDocument(outilsPage);
    await page.setRequestInterception(true);
    page.on('request', (r) => {
        const u = new URL(r.url());
        if (u.pathname === '/config.js') return r.respond({ contentType: 'application/javascript', body: CONFIG });
        if (/^https?:$/.test(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname)) { externesBloquees.push(u.hostname); return r.abort(); }
        r.continue();
    });
    page.on('pageerror', (e) => erreursPage.push(String(e.message).slice(0, 160)));
    // Garde « quitter la page ? » (beforeunload) : acceptée et consignée.
    page.dialogsVus = [];
    page.on('dialog', async (d) => { page.dialogsVus.push(d.type()); try { await d.accept(); } catch (_) {} });
    await page.goto(url + '/index.html', { waitUntil: 'networkidle0', timeout: 45000 });
    if (vider) {
        await page.evaluate(() => localStorage.clear());
        await page.goto(url + '/index.html' + hash, { waitUntil: 'networkidle0', timeout: 45000 });
    }
    await attendre(600);
    return { ctx, page };
}

// Handle d'élément visible → clic souris réel au centre (après défilement).
async function element(page, sel, src = '.*', attr = null) {
    const h = await page.evaluateHandle((s, x, a) => window.__g1.trouver(s, x, a), sel, src, attr);
    const e = h.asElement();
    if (!e) throw new Error(`élément introuvable : ${sel} /${src}/${attr ? ' @' + attr : ''}`);
    return e;
}
async function cliquer(page, sel, src = '.*', attr = null, pause = 1300) {
    const e = await element(page, sel, src, attr);
    await e.evaluate((n) => n.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await attendre(120);
    await e.click();
    await attendre(pause);
}
const etat = (page) => page.evaluate(() => window.__g1.etat());
const messages = (page) => page.evaluate(() => window.__g1.messages.slice());
const viderMessages = (page) => page.evaluate(() => { window.__g1.messages.length = 0; });
const capture = async (page, nom) => { try { await page.screenshot({ path: path.join(PREUVES, nom + '.png') }); } catch (_) {} };
const allerA = async (page, hash, pause = 1500) => { await page.evaluate((h) => { location.hash = h; }, hash); await attendre(pause); };
const mainTexte = (page) => page.evaluate(() => window.__g1.texte(document.querySelector('main')));
const estMobile = (vp) => vp.width < 768;

async function entrerDemo(page) {
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Essayer sans compte'), { timeout: 30000 });
    await cliquer(page, 'button', '^Essayer sans compte$', null, 400);
    await page.waitForFunction(() => /Espace|Tableau de bord|Mes devis|Factures|Chantiers|Clients/.test([...document.querySelectorAll('h1')].map((h) => h.innerText).join(' ')), { timeout: 30000 });
    await attendre(1600);
}

// Navigation principale, quelle que soit la largeur.
async function naviguer(page, vp, libelleBureau, libelleMobile = libelleBureau) {
    if (estMobile(vp)) await cliquer(page, 'nav[aria-label="Barre de navigation rapide"] button', `^${libelleMobile}$`);
    else await cliquer(page, 'aside nav button', `^${libelleBureau}$`);
}

// Ajoute un ouvrage (« Peinture ») au chiffrage ouvert : c'est « le travail ».
async function ajouterOuvrage(page, vp) {
    if (estMobile(vp)) {
        await cliquer(page, 'main button', 'Ajouter mon premier ouvrage', null, 1200);
        await page.keyboard.type('Peinture', { delay: 25 });
        await attendre(1000);
        await cliquer(page, '[role="dialog"] button', '^Ajouter$', null, 1600);
    } else {
        await cliquer(page, 'input[aria-label="Rechercher un ouvrage à ajouter"]', '.*', null, 300);
        await page.keyboard.type('Peinture', { delay: 25 });
        await attendre(1000);
        await page.keyboard.press('Enter');
        await attendre(1600);
    }
}
const etatChiffrage = (page) => page.evaluate(() => {
    const t = window.__g1.texte(document.body);
    return {
        ouvrages: (window.__g1.texte(document.querySelector('main')).match(/(\d+) ouvrage/) || [])[1] || null,
        nonEnregistre: /Modifications non enregistrées/.test(t),
        entreeSidebar: !!window.__g1.trouver('aside nav button', 'Chiffrage en cours')
    };
});
async function ouvrirChiffrageDepuisAccueil(page) {
    await cliquer(page, 'main section button', '^(Créer mon premier devis|Créer un devis|Reprendre mon devis)$', null, 1800);
}
async function revenirAuChiffrage(page, vp) {
    if (!estMobile(vp)) {
        const e = await page.evaluate(() => !!window.__g1.trouver('aside nav button', 'Chiffrage en cours'));
        if (!e) return false;
        await cliquer(page, 'aside nav button', 'Chiffrage en cours', null, 1600);
        return true;
    }
    await naviguer(page, vp, 'Tableau de bord', 'Accueil');
    const b = await page.evaluate(() => !!window.__g1.trouver('main button', '^Reprendre mon devis'));
    if (!b) return false;
    await cliquer(page, 'main button', '^Reprendre mon devis', null, 1600);
    return true;
}

// ════════════════════════════════════════════════════════════════════════════
// C002 · C104 · C105 — première action, première valeur, conseils de démarrage
// ════════════════════════════════════════════════════════════════════════════
async function premiereValeur(browser, url) {
    for (const [nomVp, vp] of [['1440', VP.d1440], ['390', VP.m390]]) {
        const { ctx, page } = await ouvrir(browser, url, vp);
        try {
            await entrerDemo(page);
            const accueil = await page.evaluate(() => {
                const g = window.__g1;
                const section = [...document.querySelectorAll('main section')].find((s) => /Votre prochain chantier commence par un devis/.test(s.innerText));
                const b = section && section.querySelector('button');
                if (!b) return null;
                const r = b.getBoundingClientRect();
                const nav = document.querySelector('.mobile-bottom-nav');
                const limite = nav && g.vis(nav) ? nav.getBoundingClientRect().top : innerHeight;
                const dessus = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                const primaires = [...document.querySelectorAll('main .btn-primary')].filter(g.vis);
                const appelsDevis = [...document.querySelectorAll('main button, aside button')].filter(g.vis)
                    .map(g.texte).filter((t) => /(nouveau devis|créer (mon premier |un )?devis)/i.test(t));
                return {
                    texte: g.texte(b), primaire: b.classList.contains('btn-primary'), premierPrimaire: primaires[0] === b,
                    bas: Math.round(r.bottom), limite: Math.round(limite), atteignable: dessus === b || b.contains(dessus),
                    consigne: g.texte(section).slice(0, 160),
                    bloquants: [...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')].filter(g.vis).length,
                    appelsDevis
                };
            });
            noter(`C002_accueil_${nomVp}`, accueil);
            await capture(page, `C002-accueil-${nomVp}`);
            cas('C002', `${nomVp} px — l'appel principal de l'accueil porte sur le devis, est le premier bouton principal et visible sans défiler`,
                accueil && /devis/i.test(accueil.texte) && accueil.primaire && accueil.premierPrimaire && accueil.bas <= accueil.limite && accueil.atteignable,
                accueil ? `« ${accueil.texte} » · bas ${accueil.bas} px ≤ limite ${accueil.limite} px · premier .btn-primary : ${accueil.premierPrimaire} · non recouvert : ${accueil.atteignable} · appels « devis » visibles : ${accueil.appelsDevis.length} (${accueil.appelsDevis.join(' / ')}) — voir UX-HYP-01` : 'carte d’accueil absente');
            cas('C105', `${nomVp} px — à l'entrée, aucun guide ni fenêtre n'impose un passage obligé`,
                accueil && accueil.bloquants === 0 && accueil.atteignable,
                accueil ? `fenêtres modales ouvertes : ${accueil.bloquants} · consigne en place : « ${accueil.consigne} »` : '');

            // Les conseils restent accessibles : on part, on revient, ils sont là.
            await naviguer(page, vp, 'Clients', 'Devis');
            await naviguer(page, vp, 'Tableau de bord', 'Accueil');
            const toujours = await page.evaluate(() => !!window.__g1.trouver('main section', 'Votre prochain chantier commence par un devis'));
            cas('C105', `${nomVp} px — la consigne de démarrage est toujours là après un aller-retour dans l'application`, toujours, `présente : ${toujours}`);

            await ouvrirChiffrageDepuisAccueil(page);
            const ch = await etat(page);
            const texteCh = await mainTexte(page);
            const numero = (texteCh.match(/DEV-\d{4}-\d{3}/) || [])[0];
            cas('C002', `${nomVp} px — un clic sur l'appel principal ouvre le chiffrage d'un devis vierge`, /Chiffrage/.test(ch.h1) && !!numero,
                `h1 « ${ch.h1} » · ${numero || 'aucun numéro'} · adresse « ${ch.hash} » (adresse non mise à jour : UX-P2-06, connu)`);
            const guide = /1\. Travaux/.test(texteCh) && /2\. Quantités/.test(texteCh) && /(Ajouter mon premier ouvrage|Commencez directement)/.test(texteCh);
            cas('C104', `${nomVp} px — le chiffrage vide dit quoi faire ensuite (étapes + premier geste)`, guide,
                `étapes 1→4 : ${/1\. Travaux[\s\S]*4\. Vérification/.test(texteCh)} · « Ajouter mon premier ouvrage » : ${/Ajouter mon premier ouvrage/.test(texteCh)} · « Commencez directement… » : ${/Commencez directement/.test(texteCh)}`);
            await capture(page, `C104-chiffrage-vide-${nomVp}`);

            if (!estMobile(vp)) {
                // Première valeur réelle : un ouvrage chiffré, montant > 0.
                await ajouterOuvrage(page, vp);
                const t2 = await mainTexte(page);
                cas('C104', '1440 px — après l\'ajout d\'un ouvrage, l\'écran dit ce qui reste à faire (métré à confirmer)',
                    /Quantités à confirmer/.test(t2) && /Renseignez votre métré/.test(t2), `« Quantités à confirmer » : ${/Quantités à confirmer/.test(t2)} · « Renseignez votre métré » : ${/Renseignez votre métré/.test(t2)}`);
                const saisie = await page.evaluate(() => {
                    const champ = [...document.querySelectorAll('main input[type="number"]')].filter(window.__g1.vis)
                        .find((i) => /^Surface directe/i.test(i.getAttribute('aria-label') || ''));
                    if (!champ) return 'champ introuvable';
                    champ.focus();
                    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(champ, '100');
                    champ.dispatchEvent(new Event('input', { bubbles: true }));
                    champ.dispatchEvent(new Event('change', { bubbles: true }));
                    return 'ok';
                });
                await attendre(800);
                await cliquer(page, 'main button', '^Confirmer mes quantités$', null, 1500);
                const t3 = await mainTexte(page);
                const montant = Number(((t3.match(/Prix de Vente Total HT\s*:?\s*([\d\s ]+)\s*FCFA/) || [])[1] || '0').replace(/\D/g, ''));
                noter('C104_premiere_valeur', { saisie, montant });
                await capture(page, 'C104-premiere-valeur-1440');
                cas('C104', '1440 px — première valeur utile atteinte : un ouvrage chiffré (> 0 FCFA) en 5 gestes depuis l\'accueil',
                    montant > 0, `saisie surface : ${saisie} · Prix de vente total HT = ${montant.toLocaleString('fr-FR')} FCFA · gestes : appel principal, recherche « Peinture », Entrée, surface 100 m², « Confirmer mes quantités »`);
            }
        } finally { await ctx.close(); }
    }

    // C105 — l'aide du devis d'exemple (bandeau « 3 gestes ») apparaît-elle
    // quand on ouvre le devis d'exemple ?
    const { ctx, page } = await ouvrir(browser, url, VP.d1440);
    try {
        await entrerDemo(page);
        await allerA(page, '#devis/101', 1800);
        await cliquer(page, 'button', '^Modifier le devis DEV-2026-001$', 'aria-label', 1800);
        const t = await page.evaluate(() => window.__g1.texte(document.body));
        const h1 = (await etat(page)).h1;
        noter('C105_bandeau_exemple', { h1, bandeau: /devis d’exemple|devis d'exemple|Mode exemple interactif/.test(t) });
        cas('C105', '1440 px — (information) le devis d\'exemple ouvert dans le chiffrage affiche-t-il des conseils de découverte ?',
            true, `h1 « ${h1} » · bandeau « Vous explorez un devis d’exemple… / Déplier l'aide » affiché : ${/devis d’exemple|devis d'exemple|Mode exemple interactif/.test(t)} (voir HYP dans le rapport)`);
    } finally { await ctx.close(); }
}

// ════════════════════════════════════════════════════════════════════════════
// C007 — informations présentes au moment de décider
// ════════════════════════════════════════════════════════════════════════════
async function informationsDecision(browser, url) {
    for (const [nomVp, vp] of [['1440', VP.d1440], ['390', VP.m390]]) {
        const { ctx, page } = await ouvrir(browser, url, vp);
        try {
            await entrerDemo(page);
            // a) Supprimer un devis
            await allerA(page, '#devis', 1500);
            await cliquer(page, 'main button', '^Supprimer le devis DEV-2026-001$', 'aria-label', 900);
            const sup = await page.evaluate(() => { const d = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].find(window.__g1.vis); return d ? window.__g1.texte(d) : ''; });
            cas('C007', `${nomVp} px — « Supprimer » nomme le devis, le client et l'irréversibilité avant de confirmer`,
                /DEV-2026-001/.test(sup) && /Société Immobilière NBB/.test(sup) && /(sans retour|définitivement|irréversible)/i.test(sup), `« ${sup.slice(0, 170)} »`);
            await capture(page, `C007-supprimer-${nomVp}`);
            await page.keyboard.press('Escape'); await attendre(700);

            // b) Facturer : montants visibles et action atteignable
            await allerA(page, '#devis/101', 1800);
            await cliquer(page, 'button', '^Facturer le devis DEV-2026-001$', 'aria-label', 1300);
            const fac = await page.evaluate(() => {
                const g = window.__g1;
                const d = [...document.querySelectorAll('[role="dialog"]')].filter(g.vis).find((x) => /Facturer DEV/.test(g.texte(x)));
                if (!d) return null;
                const b = [...d.querySelectorAll('button')].find((x) => /Créer le brouillon/.test(g.texte(x)));
                const r = b ? b.getBoundingClientRect() : null;
                let p = b; let defile = false;
                while (p && p !== d.parentElement) { if (p.scrollHeight > p.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(p).overflowY)) { defile = true; break; } p = p.parentElement; }
                return { t: g.texte(d), bouton: !!b, dansEcran: r ? r.bottom <= innerHeight && r.top >= 0 : false, defile, bas: r ? Math.round(r.bottom) : null };
            });
            cas('C007', `${nomVp} px — « Facturer » montre les lots, les montants et le total avant « Créer le brouillon »`,
                fac && /Total HT de cette facture/.test(fac.t) && /\d[\d\s ]* FCFA/.test(fac.t) && fac.bouton && (fac.dansEcran || fac.defile),
                fac ? `total affiché : ${(fac.t.match(/Total HT de cette facture\s*([\d\s ]+FCFA)/) || [])[1] || '—'} · bouton visible : ${fac.dansEcran} (bas ${fac.bas} px / ${vp.height}) · atteignable par défilement : ${fac.defile}` : 'fenêtre absente');
            await capture(page, `C007-facturer-${nomVp}`);
            await page.keyboard.press('Escape'); await attendre(700);
        } finally { await ctx.close(); }

        // c) Garde de sortie du chiffrage : le message dit-il vrai ?
        const s = await ouvrir(browser, url, vp);
        try {
            await entrerDemo(s.page);
            await ouvrirChiffrageDepuisAccueil(s.page);
            await ajouterOuvrage(s.page, vp);
            const avant = await etatChiffrage(s.page);
            await naviguer(s.page, vp, 'Clients', 'Devis');
            const garde = await s.page.evaluate(() => { const d = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].find(window.__g1.vis); return d ? window.__g1.texte(d) : ''; });
            await capture(s.page, `C007-garde-sortie-${nomVp}`);
            const annonce = /seront perdues/.test(garde);
            if (garde) await cliquer(s.page, '[role="dialog"] button, [role="alertdialog"] button', '^Ne pas enregistrer$', null, 1500);
            const retour = await revenirAuChiffrage(s.page, vp);
            const apres = await etatChiffrage(s.page);
            cas('C007', `${nomVp} px — la garde de sortie annonce une perte ; après « Ne pas enregistrer », le travail est-il réellement abandonné ?`,
                !annonce || !(retour && apres.ouvrages === avant.ouvrages && apres.nonEnregistre),
                `message : « ${garde.slice(0, 150)} » · après « Ne pas enregistrer » : chemin de retour présent = ${retour}, ouvrages ${avant.ouvrages} → ${apres.ouvrages}, « Modifications non enregistrées » = ${apres.nonEnregistre}`);
        } finally { await s.ctx.close(); }
    }
}

// ════════════════════════════════════════════════════════════════════════════
// C010 — redondances distinguées des fonctions complémentaires
// ════════════════════════════════════════════════════════════════════════════
async function redondances(browser, url) {
    const destinations = {};
    for (const item of ['Mon Profil & Compte', 'Paramètres Entreprise', 'Formule & Facturation']) {
        const { ctx, page } = await ouvrir(browser, url, VP.d1440);
        try {
            await entrerDemo(page);
            await cliquer(page, 'button', '^Menu du profil utilisateur$', 'aria-label', 700);
            await cliquer(page, 'button', item.replace(/[&]/g, '\\&'), null, 1500);
            const e = await etat(page);
            const contenu = await page.evaluate(() => window.__g1.texte(document.body));
            destinations[item] = { hash: e.hash, h1: e.h1, section: e.courant, dialogues: e.dialogues, profil: /invite@local\.app|Mot de passe|Adresse e-mail de connexion|Mon profil/i.test(contenu.replace(/Mon Profil & Compte/g, '')) };
            if (item === 'Mon Profil & Compte') await capture(page, 'C010-mon-profil-1440');
        } finally { await ctx.close(); }
    }
    noter('C010_menu_profil', destinations);
    const a = destinations['Mon Profil & Compte']; const b = destinations['Paramètres Entreprise'];
    cas('C010', '1440 px — « Mon Profil & Compte » et « Paramètres Entreprise » (menu du profil) mènent à des contenus distincts',
        !(a.hash === b.hash && a.section === b.section) || a.profil,
        `Mon Profil & Compte → ${a.hash} « ${a.section} » · Paramètres Entreprise → ${b.hash} « ${b.section} » · contenu « profil » (e-mail, mot de passe) trouvé : ${a.profil}`);
    const f = destinations['Formule & Facturation'];
    cas('C010', '1440 px — « Formule & Facturation » ouvre la même fenêtre que la carte « Formule Starter » (même fonction, même destination : redondance assumée)',
        f.dialogues.length === 1, `fenêtre : ${JSON.stringify(f.dialogues)}`);

    const { ctx, page } = await ouvrir(browser, url, VP.d1440);
    try {
        await entrerDemo(page);
        await cliquer(page, 'main button', '^Créer facture', null, 1500);
        const e = await etat(page);
        const panneau = await page.evaluate(() => !!window.__g1.trouver('main *', '^CRÉER UNE FACTURE DEPUIS UN DEVIS$') || !!window.__g1.trouver('main *', '^Créer une facture depuis un devis$'));
        await capture(page, 'C010-raccourci-creer-facture-1440');
        cas('C010', '1440 px — le raccourci « Créer facture · Facturer un acompte » fait autre chose que l\'entrée « Factures » du menu',
            !/^Factures$/.test(e.h1) || panneau,
            `après clic : h1 « ${e.h1} », menu actif « ${e.courant} », choix du devis à facturer ouvert : ${panneau}, adresse « ${e.hash} »`);
    } finally { await ctx.close(); }
}

// ════════════════════════════════════════════════════════════════════════════
// C011 · C018 — regroupement des menus, menus secondaires
// ════════════════════════════════════════════════════════════════════════════
async function menus(browser, url) {
    const RE_CODE = /\b(savedQuotes|recipes|materials|platformAdmin|calculator|projects|undefined|null|NaN)\b|[a-z][A-Z]/;
    const libellesParDestination = {};
    const ajouter = (surface, libelle, dest) => {
        if (!dest) return;
        (libellesParDestination[dest] ||= new Set()).add(libelle);
        noter(`C018_carte_${surface}_${libelle}`, dest);
    };
    for (const [nomVp, vp] of Object.entries(VP)) {
        const { ctx, page } = await ouvrir(browser, url, vp);
        try {
            await entrerDemo(page);
            // Structure visible
            const struct = await page.evaluate(() => {
                const g = window.__g1;
                const side = document.querySelector('nav[aria-label="Menu principal"]');
                const rail = document.querySelector('nav[aria-label="Menu principal (replié)"]');
                const bas = document.querySelector('nav[aria-label="Barre de navigation rapide"]');
                const lire = (n) => n && g.vis(n) ? [...n.querySelectorAll('p.sidebar-section-label, button')].filter(g.vis).map((x) => (x.tagName === 'P' ? '§' : '') + (x.getAttribute('aria-label') || g.texte(x))) : null;
                return { sidebar: lire(side), rail: lire(rail), barreBas: lire(bas) };
            });
            if (struct.sidebar) {
                // déplier le groupe « Ouvrages et ressources »
                const ouvert = await page.evaluate(() => window.__g1.trouver('nav[aria-label="Menu principal"] button[aria-expanded]', '.*')?.getAttribute('aria-expanded'));
                if (ouvert === 'false') await cliquer(page, 'nav[aria-label="Menu principal"] button[aria-expanded]', '.*', null, 500);
                struct.sidebar = await page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Menu principal"] p.sidebar-section-label, nav[aria-label="Menu principal"] button')].filter(window.__g1.vis).map((x) => (x.tagName === 'P' ? '§' : '') + window.__g1.texte(x)));
            }
            if (struct.barreBas) {
                await cliquer(page, 'button', '^Ouvrir le menu de navigation$', 'aria-label', 1000);
                struct.tiroir = await page.evaluate(() => {
                    const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => window.__g1.vis(x) && x.getAttribute('aria-label') === 'Menu');
                    if (!d) return null;
                    return [...d.querySelectorAll('h2, h3, h4, p, button')].filter(window.__g1.vis)
                        .filter((x) => x.tagName === 'BUTTON' || /^[A-ZÉÈ &]+$/.test(window.__g1.texte(x)))
                        .map((x) => (x.tagName === 'BUTTON' ? '' : '§') + window.__g1.texte(x));
                });
                await capture(page, `C018-tiroir-${nomVp}`);
                await page.keyboard.press('Escape'); await attendre(700);
            }
            // Changer d'entreprise : le sélecteur est-il atteignable à cette largeur ?
            struct.selecteurEntreprise = await page.evaluate(() => window.__g1.vis(document.querySelector('button[aria-label*="changer d\'organisation"]')));
            await cliquer(page, 'button', '^Menu du profil utilisateur$', 'aria-label', 700);
            struct.profil = await page.evaluate(() => {
                const btn = document.querySelector('button[aria-label="Menu du profil utilisateur"]');
                const zone = btn.parentElement;
                return [...zone.querySelectorAll('button')].filter((b) => b !== btn && window.__g1.vis(b)).map(window.__g1.texte);
            });
            await page.keyboard.press('Escape'); await attendre(500);
            noter(`C011_structure_${nomVp}`, struct);

            const tous = [...(struct.sidebar || []), ...(struct.rail || []), ...(struct.barreBas || []), ...(struct.tiroir || []), ...(struct.profil || [])];
            const codeTrouve = tous.filter((l) => RE_CODE.test(l.replace(/^§/, '')));
            const groupes = tous.filter((l) => l.startsWith('§'));
            cas('C011', `${nomVp} px — les menus parlent métier (aucun identifiant technique) et sont groupés par tâche`,
                codeTrouve.length === 0 && (groupes.length >= 2 || struct.rail),
                `groupes : ${groupes.join(' · ') || '(rail replié sans groupes)'} · libellés techniques : ${codeTrouve.join(', ') || 'aucun'} · ${struct.sidebar ? 'barre latérale : ' + struct.sidebar.filter((x) => !x.startsWith('§')).join(', ') : struct.rail ? 'rail : ' + struct.rail.join(', ') : 'barre basse : ' + (struct.barreBas || []).join(', ') + ' | tiroir : ' + (struct.tiroir || []).join(', ')}`);

            const ailleurs = [...(struct.profil || []), ...(struct.tiroir || [])].some((l) => /entreprise|organisation/i.test(l) && !/Paramètres Entreprise|Entreprise & compte/.test(l));
            cas('C018', `${nomVp} px — « changer d'entreprise » est atteignable (barre du haut, menu du profil ou tiroir)`,
                struct.selecteurEntreprise || ailleurs, `sélecteur visible : ${struct.selecteurEntreprise} · entrée équivalente ailleurs : ${ailleurs}`);

            // Le logo « ikadevis - Tableau de bord » : là où il dit qu'il mène ?
            if (['d1440', 'm390', 't768'].includes(nomVp)) {
                await allerA(page, '#clients', 1500);
                await cliquer(page, 'button', '^ikadevis - Tableau de bord$', 'aria-label', 1500);
                const e = await etat(page);
                cas('C018', `${nomVp} px — le logo (« ikadevis - Tableau de bord ») mène au tableau de bord`,
                    /Espace|Tableau de bord/.test(e.h1), `depuis Clients → h1 « ${e.h1} », menu actif « ${e.courant} », adresse « ${e.hash} »`);
                if (nomVp === 'd1440') await capture(page, 'C018-logo-mene-a-factures-1440');
            }

            // Carte libellé → destination (bureau et mobile)
            if (nomVp === 'd1440') {
                for (const lib of (struct.sidebar || []).filter((x) => !x.startsWith('§') && !/^Nouveau devis$|^Ouvrages et ressources$/.test(x))) {
                    await cliquer(page, 'nav[aria-label="Menu principal"] button', `^${lib.replace(/[()&]/g, '\\$&')}$`, null, 1400);
                    ajouter('barre-laterale', lib, (await etat(page)).h1);
                }
            }
            if (nomVp === 'm390') {
                for (const lib of (struct.barreBas || []).filter((x) => x !== 'Menu' && !/menu/i.test(x))) {
                    await cliquer(page, 'nav[aria-label="Barre de navigation rapide"] button', `^${lib}$`, null, 1400);
                    ajouter('barre-basse', lib, (await etat(page)).h1);
                }
                for (const lib of (struct.tiroir || []).filter((x) => !x.startsWith('§') && /^(Chantiers|Clients|Dépenses|Ouvrages|Prix|Paramètres)/.test(x))) {
                    await cliquer(page, 'button', '^Ouvrir le menu de navigation$', 'aria-label', 900);
                    await cliquer(page, '[role="dialog"] button', `^${lib.replace(/[()&]/g, '\\$&')}$`, null, 1500);
                    ajouter('tiroir', lib, (await etat(page)).h1);
                    if ((await etat(page)).h1 === 'Paramètres du compte') await cliquer(page, 'button', 'Retour à l.application', null, 1300);
                }
            }
        } finally { await ctx.close(); }
    }
    const doublons = Object.entries(libellesParDestination).filter(([, s]) => s.size > 1).map(([d, s]) => `${d} ← ${[...s].map((x) => `« ${x} »`).join(' / ')}`);
    noter('C018_libelles_par_destination', Object.fromEntries(Object.entries(libellesParDestination).map(([d, s]) => [d, [...s]])));
    cas('C018', '1440 + 390 px — une même destination porte le même nom dans la barre latérale, la barre basse et le tiroir « Menu »',
        doublons.length === 0, doublons.join(' ; ') || 'aucun écart');
}

// ════════════════════════════════════════════════════════════════════════════
// C017 — le retour à une liste conserve le contexte utile
// ════════════════════════════════════════════════════════════════════════════
async function contexteListes(browser, url) {
    const lireListe = (page) => page.evaluate(() => ({
        recherche: document.querySelector('input[aria-label="Rechercher dans les devis"]')?.value,
        statut: window.__g1.texte(document.querySelector('button[aria-label="Filtrer les devis par statut"]')),
        tri: window.__g1.texte(document.querySelector('button[aria-label="Trier les devis"]')),
        hash: location.hash,
        detailOuvert: [...document.querySelectorAll('[role="dialog"]')].filter(window.__g1.vis).length
    }));
    for (const [nomVp, vp] of [['1440', VP.d1440], ['390', VP.m390]]) {
        const { ctx, page } = await ouvrir(browser, url, vp);
        try {
            await entrerDemo(page);
            await naviguer(page, vp, 'Mes devis', 'Devis');
            await cliquer(page, 'input[aria-label="Rechercher dans les devis"]', '.*', null, 200);
            await page.keyboard.type('NBB', { delay: 30 }); await attendre(600);
            await cliquer(page, 'button', '^Filtrer les devis par statut$', 'aria-label', 600);
            await cliquer(page, 'button', '^Acceptés$', null, 600);
            await cliquer(page, 'button', '^Trier les devis$', 'aria-label', 600);
            await cliquer(page, 'button', '^Client A → Z$', null, 600);
            const ctx0 = await lireListe(page);
            const ouvrirDevis = () => cliquer(page, 'main [role="button"]', '^Afficher le devis DEV-2026-001', 'aria-label', 1800);
            await ouvrirDevis();
            const fermer = await page.evaluate(() => {
                const b = window.__g1.trouver('button', '^(Retour aux devis|Fermer la boîte de dialogue)$', 'aria-label');
                return b ? b.getAttribute('aria-label') : null;
            });
            await capture(page, `C017-devis-detail-${nomVp}`);
            await cliquer(page, 'button', `^${fermer}$`, 'aria-label', 1500);
            const ctx1 = await lireListe(page);
            cas('C017', `${nomVp} px — Mes devis : recherche, filtre et tri conservés après « ${fermer} »`,
                ctx1.recherche === ctx0.recherche && ctx1.statut === ctx0.statut && ctx1.tri === ctx0.tri && ctx1.detailOuvert === 0,
                `avant ${JSON.stringify(ctx0)} → après ${JSON.stringify(ctx1)}${/\/\d+/.test(ctx1.hash) ? ' — l\'adresse désigne encore la fiche fermée (extension de UX-P2-06)' : ''}`);
            await ouvrirDevis();
            await page.goBack(); await attendre(1600);
            const ctx2 = await lireListe(page);
            cas('C017', `${nomVp} px — Mes devis : le bouton Retour du navigateur referme la fiche et rend la liste filtrée`,
                ctx2.detailOuvert === 0 && ctx2.recherche === ctx0.recherche && ctx2.statut === ctx0.statut,
                `après Retour : ${JSON.stringify(ctx2)}`);
            if (ctx2.detailOuvert) await capture(page, `C017-retour-navigateur-fiche-reste-${nomVp}`);
        } finally { await ctx.close(); }
    }

    // Clients (390) : recherche conservée ; Ouvrages et Ressources (390) : position de défilement.
    const { ctx, page } = await ouvrir(browser, url, VP.m390);
    try {
        await entrerDemo(page);
        await allerA(page, '#clients', 1500);
        await cliquer(page, 'input[aria-label="Rechercher un client"]', '.*', null, 200);
        await page.keyboard.type('Rés', { delay: 30 }); await attendre(600);
        await cliquer(page, 'main button', '^Sélectionner ', 'aria-label', 1500);
        await cliquer(page, 'main button', '^Retour à la liste$', 'aria-label', 1500);
        const rech = await page.evaluate(() => document.querySelector('input[aria-label="Rechercher un client"]')?.value);
        cas('C017', '390 px — Clients : la recherche « Rés » est conservée au retour de la fiche', rech === 'Rés', `valeur au retour : « ${rech} »`);

        for (const [route, nom] of [['#ouvrages', 'Ouvrages'], ['#materiaux', 'Ressources']]) {
            await allerA(page, route, 1700);
            const SEL = 'main button[aria-label^="Sélectionner"]';
            const depart = await page.evaluate((s) => {
                const items = [...document.querySelectorAll(s)].filter(window.__g1.vis);
                const r = items[0]?.getBoundingClientRect();
                return r ? { x: Math.round(r.x + 30), y: Math.round(r.y + r.height / 2), n: items.length } : null;
            }, SEL);
            if (!depart) { cas('C017', `390 px — ${nom} : liste introuvable`, false, route); continue; }
            await page.mouse.move(depart.x, depart.y);
            for (let i = 0; i < 6; i += 1) { await page.mouse.wheel({ deltaY: 400 }); await attendre(120); }
            await attendre(700);
            const defile = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('main, main *')].map((e) => e.scrollTop)));
            // Un élément du bas de l'écran, ouvert d'un vrai clic (doigt/souris).
            const cible = await page.evaluate((s) => {
                const cand = [...document.querySelectorAll(s)].filter((b) => {
                    const r = b.getBoundingClientRect();
                    return window.__g1.vis(b) && r.top > 160 && r.bottom < innerHeight - 140;
                });
                const t = cand[cand.length - 1];
                if (!t) return null;
                const r = t.getBoundingClientRect();
                return { nom: t.getAttribute('aria-label'), x: Math.round(r.x + Math.min(40, r.width / 2)), y: Math.round(r.y + r.height / 2) };
            }, SEL);
            if (!cible) { cas('C017', `390 px — ${nom} : aucun élément visible à ouvrir après défilement`, false, `défilement ${defile} px`); continue; }
            await page.mouse.click(cible.x, cible.y); await attendre(1600);
            const ouvert = await etat(page);
            const btnRetour = await page.evaluate(() => {
                const b = window.__g1.trouver('main button, [role="dialog"] button', '^Retour', 'aria-label');
                return b ? b.getAttribute('aria-label') : null;
            });
            if (btnRetour) await cliquer(page, 'main button, [role="dialog"] button', `^${btnRetour.replace(/[()]/g, '\\$&')}$`, 'aria-label', 1600);
            else { await page.goBack(); await attendre(1600); }
            const apres = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('main, main *')].map((e) => e.scrollTop)));
            const cibleVisible = await page.evaluate((n) => {
                const el = [...document.querySelectorAll('main button')].find((e) => e.getAttribute('aria-label') === n);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { top: Math.round(r.top), dansEcran: r.top >= 0 && r.bottom <= innerHeight };
            }, cible.nom);
            noter(`C017_defilement_${nom}`, { defile, cible: cible.nom, ouvert: ouvert.h1 || ouvert.dialogues, retour: btnRetour, apres, cibleVisible });
            await capture(page, `C017-${nom.toLowerCase()}-apres-retour-390`);
            cas('C017', `390 px — ${nom} : après avoir ouvert « ${String(cible.nom).replace(/^Sélectionner (l'ouvrage )?/, '').slice(0, 40)} » (liste défilée de ${defile} px), le retour rend la même position`,
                defile > 0 && apres >= defile * 0.8 && cibleVisible && cibleVisible.dansEcran,
                `défilement avant ${defile} px → après « ${btnRetour || 'Retour navigateur'} » ${apres} px · élément ouvert ${cibleVisible ? (cibleVisible.dansEcran ? 'visible' : `hors écran (top ${cibleVisible.top} px)`) : 'introuvable'}`);
        }
    } finally { await ctx.close(); }
}

// ════════════════════════════════════════════════════════════════════════════
// C108 (+ C010) — restrictions : quota Starter de 3 devis
// ════════════════════════════════════════════════════════════════════════════
async function restrictions(browser, url) {
    const { ctx, page } = await ouvrir(browser, url, VP.d1440);
    try {
        await entrerDemo(page);
        const compteur = () => page.evaluate(() => document.querySelector('[aria-label^="Formule Starter"]')?.getAttribute('aria-label'));
        const dupliquer = async () => {
            await allerA(page, '#devis/101', 1900);
            await cliquer(page, 'button', '^Dupliquer le devis DEV-2026-001$', 'aria-label', 900);
            await cliquer(page, '[role="dialog"] button, [role="alertdialog"] button', '^Dupliquer$', null, 1300);
            await allerA(page, '#dashboard', 1300);
        };
        const c0 = await compteur();
        await dupliquer(); await dupliquer();
        const c1 = await compteur();
        await viderMessages(page);
        await cliquer(page, 'aside nav button', '^Nouveau devis$', null, 1500);
        const blocage = { msgs: await messages(page), e: await etat(page) };
        await capture(page, 'C108-quota-atteint-1440');
        const msg = blocage.msgs.find((m) => /limite/.test(m)) || '';
        cas('C108', '1440 px — à 3/3 devis, « Nouveau devis » refuse en disant pourquoi et quoi faire (formule supérieure)',
            /limite de 3 devis/.test(msg) && /(Passez|Choisissez|formule|offre)/i.test(msg) && blocage.e.dialogues.length > 0,
            `compteur ${c0} → ${c1} · message : « ${msg} » · fenêtre ouverte : ${blocage.e.dialogues.join(' / ')}`);
        cas('C108', '1440 px — le message de restriction n\'invite à aucun contournement (supprimer, dupliquer, autre compte)',
            msg && !/(supprim|dupliqu|autre compte|nouveau compte|effacez)/i.test(msg), `« ${msg} »`);
        // Parcours proposé à un visiteur de démo : la formule mène-t-elle à « créer un compte » ?
        await cliquer(page, '[role="dialog"] button', '^Choisir Standard$', null, 1500);
        const paiement = await page.evaluate(() => window.__g1.texte([...document.querySelectorAll('[role="dialog"]')].find(window.__g1.vis)));
        await capture(page, 'C108-demo-vers-paiement-1440');
        const avantCompte = /(compte|connect)/i.test(paiement);
        const ext0 = externesBloquees.length;
        let refus = '';
        if (!avantCompte) {
            // Moyen « Carte bancaire » : aucun numéro saisi, aucune donnée de paiement.
            await cliquer(page, '[role="dialog"] button, [role="dialog"] label, [role="dialog"] [role="radio"]', '^Carte bancaire$', null, 600);
            await viderMessages(page);
            await cliquer(page, '[role="dialog"] button', '^Payer par carte bancaire$', null, 2000);
            refus = await page.evaluate(() => { const d = [...document.querySelectorAll('[role="dialog"]')].find(window.__g1.vis); const t = window.__g1.texte(d); return (t.match(/[^.]*connecté[^.]*\./) || [''])[0]; });
        }
        cas('C108', '1440 px — en démo, le chemin proposé par la restriction dit dès le choix de formule qu\'un compte est nécessaire',
            avantCompte, `écran de paiement (Mobile Money / carte) affiché sans mention de compte : ${!avantCompte} · l'exigence apparaît après « Payer » : « ${refus} » · requêtes externes tentées pendant ce geste : ${externesBloquees.length - ext0}`);
        await page.keyboard.press('Escape'); await attendre(800);
        // Contournements de fait
        await dupliquer();
        const c2 = await compteur();
        cas('C108', '1440 px — à 3/3, « Dupliquer » respecte la même limite que « Nouveau devis »',
            !/4 devis sur 3/.test(c2 || ''), `compteur après duplication : « ${c2} »`);
        await capture(page, 'C108-4-devis-sur-3-1440');
        await ouvrirChiffrageDepuisAccueil(page);
        const e = await etat(page);
        const num = ((await mainTexte(page)).match(/DEV-\d{4}-\d{3}/) || [])[0];
        cas('C108', '1440 px — au-delà du quota, l\'appel « Créer un devis » de l\'accueil applique la même limite',
            !/Chiffrage/.test(e.h1), `h1 « ${e.h1} » · numéro proposé ${num || '—'}`);
        cas('C010', '1440 px — « Créer un devis » (accueil) et « Nouveau devis » (menu) : même promesse, même règle',
            !/Chiffrage/.test(e.h1), `à quota atteint : « Nouveau devis » → refus + offres ; « Créer un devis » → h1 « ${e.h1} » (${num || '—'})`);
    } finally { await ctx.close(); }
}

// ════════════════════════════════════════════════════════════════════════════
// C019 — page introuvable ou interdite
// ════════════════════════════════════════════════════════════════════════════
async function introuvables(browser, url) {
    for (const [nomVp, vp] of [['1440', VP.d1440], ['390', VP.m390]]) {
        const { ctx, page } = await ouvrir(browser, url, vp);
        try {
            await entrerDemo(page);
            const essais = nomVp === '1440'
                ? ['#devis/999999', '#factures/FACT-0000', '#clients/inconnu', '#chantiers/inconnu', '#page-inexistante', '#settings/inexistant', '#platform-admin']
                : ['#devis/999999', '#page-inexistante', '#platform-admin'];
            for (const h of essais) {
                await allerA(page, '#clients', 1400);
                await viderMessages(page);
                await allerA(page, h, 1700);
                const e = await etat(page);
                const msgs = await messages(page);
                const contenu = (await page.evaluate(() => window.__g1.texte(document.querySelector('main') || document.body))).slice(0, 160);
                const sortie = await page.evaluate(() => [...document.querySelectorAll('main button, main a[href]')].filter(window.__g1.vis).map(window.__g1.texte).filter(Boolean).slice(0, 4));
                let pass; let attendu;
                if (/\/(999999|FACT-0000|inconnu)$/.test(h)) {
                    attendu = 'message « introuvable » + retour à la liste';
                    pass = msgs.some((m) => /introuvable/i.test(m)) && !/\/(999999|FACT-0000|inconnu)$/.test(e.hash);
                } else if (h === '#platform-admin') {
                    attendu = 'explication « accès réservé » + navigation pour repartir';
                    const navVisible = await page.evaluate(() => window.__g1.vis(document.querySelector('nav[aria-label="Menu principal"]')) || window.__g1.vis(document.querySelector('nav[aria-label="Barre de navigation rapide"]')));
                    pass = /Accès réservé/.test(contenu) && navVisible;
                } else {
                    attendu = 'message « page introuvable » + lien de sortie';
                    pass = msgs.some((m) => /introuvable|n'existe pas|inexistant/i.test(m)) || /introuvable|n'existe pas/i.test(contenu);
                }
                cas('C019', `${nomVp} px — ${h} (depuis Clients) : ${attendu}`, pass,
                    `adresse finale « ${e.hash} » · h1 « ${e.h1} » · messages ${JSON.stringify(msgs)} · contenu « ${contenu.slice(0, 110)} » · actions dans la page : ${sortie.join(' / ') || 'aucune'}`);
                if (h === '#settings/inexistant') await capture(page, 'C019-section-parametres-inexistante-1440');
                if (h === '#page-inexistante') await capture(page, `C019-route-inexistante-${nomVp}`);
                if (h === '#platform-admin' && nomVp === '1440') await capture(page, 'C019-acces-reserve-1440');
                if (h === '#settings/inexistant') await cliquer(page, 'button', 'Retour à l.application', null, 1200);
            }
        } finally { await ctx.close(); }
    }
}

// ════════════════════════════════════════════════════════════════════════════
// C020 — changer de module ne perd pas silencieusement un travail
// ════════════════════════════════════════════════════════════════════════════
async function sortiesChiffrage(browser, url) {
    const sorties = [
        ['1440', VP.d1440, 'barre latérale « Clients »', async (p) => cliquer(p, 'aside nav button', '^Clients$', null, 1200)],
        ['1440', VP.d1440, 'raccourci Alt+2', async (p) => { await p.keyboard.down('Alt'); await p.keyboard.press('Digit2'); await p.keyboard.up('Alt'); await attendre(1200); }],
        ['1440', VP.d1440, 'roue « Paramètres du compte » (barre du haut)', async (p) => cliquer(p, '[role="banner"] button', '^Paramètres du compte$', 'aria-label', 1500)],
        ['1440', VP.d1440, 'logo « ikadevis - Tableau de bord »', async (p) => cliquer(p, 'button', '^ikadevis - Tableau de bord$', 'aria-label', 1500)],
        ['1440', VP.d1440, 'recherche globale ⌘K → un devis', async (p) => {
            await p.keyboard.down('Meta'); await p.keyboard.press('KeyK'); await p.keyboard.up('Meta'); await attendre(600);
            await p.keyboard.type('NBB', { delay: 30 }); await attendre(900);
            await cliquer(p, '[role="banner"] button', '^DEV-2026-001', null, 1500);
        }],
        ['1440', VP.d1440, 'bouton Retour du navigateur', async (p) => { await p.goBack(); await attendre(1600); }],
        ['390', VP.m390, 'barre basse « Devis »', async (p) => cliquer(p, 'nav[aria-label="Barre de navigation rapide"] button', '^Devis$', null, 1200)],
        ['390', VP.m390, 'tiroir « Menu » → « Clients & CRM »', async (p) => {
            await cliquer(p, 'button', '^Ouvrir le menu de navigation$', 'aria-label', 1000);
            await cliquer(p, '[role="dialog"] button', '^Clients & CRM', null, 1500);
        }]
    ];
    for (const [nomVp, vp, nom, sortir] of sorties) {
        const { ctx, page } = await ouvrir(browser, url, vp);
        try {
            await entrerDemo(page);
            if (/Retour du navigateur/.test(nom)) { await allerA(page, '#devis', 1400); await allerA(page, '#factures', 1400); await cliquer(page, 'aside nav button', '^Nouveau devis$', null, 1800); }
            else await ouvrirChiffrageDepuisAccueil(page);
            await ajouterOuvrage(page, vp);
            const avant = await etatChiffrage(page);
            await sortir(page);
            const e = await etat(page);
            const garde = e.dialogues.find((d) => /Enregistrer le devis en cours/.test(d));
            let retrouve = null;
            if (garde) {
                await cliquer(page, '[role="dialog"] button, [role="alertdialog"] button', '^Annuler$', null, 900);
                retrouve = await etatChiffrage(page);
            } else {
                if (e.dialogues.length) { await page.keyboard.press('Escape'); await attendre(700); }
                if (/Paramètres/.test(e.h1)) await cliquer(page, 'button', 'Retour à l.application', null, 1300);
                const ok = await revenirAuChiffrage(page, vp);
                retrouve = ok ? await etatChiffrage(page) : { ouvrages: null };
            }
            const conserve = retrouve && retrouve.ouvrages === avant.ouvrages;
            cas('C020', `${nomVp} px — sortie par ${nom} avec un ouvrage non enregistré : avertissement, ou travail retrouvé intact`,
                !!garde || conserve,
                `avant : ${avant.ouvrages} ouvrage, non enregistré=${avant.nonEnregistre} · après la sortie : h1 « ${e.h1} », avertissement ${garde ? 'OUI' : 'non'} · retour au chiffrage : ${retrouve ? `${retrouve.ouvrages} ouvrage, non enregistré=${retrouve.nonEnregistre}` : '—'}`);
            if (/tiroir/.test(nom)) await capture(page, 'C020-tiroir-sans-avertissement-390');
        } catch (err) {
            if (/délai|timeout|Timeout/i.test(err.message)) throw err;
            cas('C020', `${nomVp} px — sortie par ${nom} : la sonde n'a pas pu jouer le geste`, false, err.message.slice(0, 160));
        } finally { await ctx.close(); }
    }

    // Réglages : une saisie sans « Enregistrer les modifications », puis départ.
    {
        const { ctx, page } = await ouvrir(browser, url, VP.d1440);
        try {
            await entrerDemo(page);
            await allerA(page, '#settings/entreprise', 1600);
            await cliquer(page, '#company_tagline', '.*', null, 200);
            await page.keyboard.press('End');
            await page.keyboard.type(' — sonde G1', { delay: 15 });
            await attendre(500);
            await cliquer(page, 'button', 'Retour à l.application', null, 1400);
            const d = (await etat(page)).dialogues;
            await allerA(page, '#settings/entreprise', 1600);
            const v = await page.$eval('#company_tagline', (i) => i.value);
            cas('C020', '1440 px — Paramètres › Entreprise : une saisie quittée sans « Enregistrer » est conservée (ou un avertissement le dit)',
                /sonde G1/.test(v) || d.length > 0, `avertissement au départ : ${d.length ? d.join('/') : 'aucun'} · valeur au retour : « ${v} »`);
        } finally { await ctx.close(); }
    }

    // Changer d'entreprise : avec travail en cours (refus attendu), puis sans.
    {
        const { ctx, page } = await ouvrir(browser, url, VP.d1440);
        try {
            await entrerDemo(page);
            await cliquer(page, 'button', "changer d'organisation$", 'aria-label', 800);
            await cliquer(page, 'button', '^Nouvelle entreprise$', null, 1200);
            await cliquer(page, '#new_org_name', '.*', null, 200);
            await page.keyboard.type('Entreprise Sonde G1', { delay: 15 });
            await cliquer(page, '[role="dialog"] button', "^Créer l.organisation$", null, 2000);
            await ouvrirChiffrageDepuisAccueil(page);
            await ajouterOuvrage(page, VP.d1440);
            await viderMessages(page);
            await cliquer(page, 'button', "changer d'organisation$", 'aria-label', 800);
            await cliquer(page, 'button', '^IKADEVIS BTP.*Propriétaire', null, 1800);
            const msgs = await messages(page);
            const toujours = await etatChiffrage(page);
            cas('C020', '1440 px — changer d\'entreprise avec un chiffrage non enregistré est refusé avec une explication',
                msgs.some((m) => /Enregistrez votre travail/.test(m)) && toujours.ouvrages === '1',
                `message : ${JSON.stringify(msgs)} · chiffrage toujours là : ${toujours.ouvrages} ouvrage`);
        } finally { await ctx.close(); }
    }
    {
        const { ctx, page } = await ouvrir(browser, url, VP.d1440);
        try {
            await entrerDemo(page);
            await cliquer(page, 'button', "changer d'organisation$", 'aria-label', 800);
            await cliquer(page, 'button', '^Nouvelle entreprise$', null, 1200);
            await cliquer(page, '#new_org_name', '.*', null, 200);
            await page.keyboard.type('Entreprise Sonde G1', { delay: 15 });
            await cliquer(page, '[role="dialog"] button', "^Créer l.organisation$", null, 2000);
            await cliquer(page, 'button', "changer d'organisation$", 'aria-label', 800);
            const navigation = page.waitForNavigation({ timeout: 10000 }).catch(() => null);
            await cliquer(page, 'button', '^IKADEVIS BTP.*Propriétaire', null, 200);
            await navigation; await attendre(2500);
            const ecran = await page.evaluate(() => ({ h2: [...document.querySelectorAll('h2')].filter(window.__g1.vis).map(window.__g1.texte).join(' | '), demo: [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Essayer sans compte') }));
            await capture(page, 'C020-changement-entreprise-demo-1440');
            let orgs = [];
            if (ecran.demo) {
                await entrerDemo(page);
                await cliquer(page, 'button', "changer d'organisation$", 'aria-label', 800);
                orgs = await page.evaluate(() => [...document.querySelectorAll('button')].filter(window.__g1.vis).map(window.__g1.texte).filter((t) => /Propriétaire/.test(t)));
            }
            cas('C020', '1440 px — démo : revenir à l\'entreprise d\'origine ne fait pas disparaître sans prévenir la session ni l\'entreprise créée',
                !ecran.demo && orgs.length !== 1, `après le choix : écran « ${ecran.h2} » (UX-P2-10) · entreprises après « Essayer sans compte » : ${JSON.stringify(orgs)}`);
        } finally { await ctx.close(); }
    }
}

// ════════════════════════════════════════════════════════════════════════════
// C107 — changement de contexte sans données précédentes
// ════════════════════════════════════════════════════════════════════════════
async function changementContexte(browser, url) {
    const echantillonner = (page, ms) => page.evaluate((duree) => {
        window.__images = []; window.__clic = null;
        document.addEventListener('pointerdown', () => { if (window.__clic === null) window.__clic = performance.now(); }, { once: true, capture: true });
        const t0 = performance.now();
        const boucle = () => {
            const m = document.querySelector('main');
            window.__images.push({ t: performance.now(), texte: m ? m.innerText : '', h1: [...document.querySelectorAll('h1')].filter(window.__g1.vis).map(window.__g1.texte).join('|'), courant: [...document.querySelectorAll('[aria-current="page"]')].filter(window.__g1.vis).map(window.__g1.texte).join(',') });
            if (performance.now() - t0 < duree) requestAnimationFrame(boucle);
        };
        requestAnimationFrame(boucle);
    }, ms);
    for (const [nomVp, vp] of [['1440', VP.d1440], ['390', VP.m390]]) {
        for (const [route, listeSel, A, B, retour] of [
            ['#clients', 'main button[aria-label^="Sélectionner "]', 'Société Immobilière NBB', 'Résidence Les Almadies', '^Retour à la liste$'],
            ['#chantiers', 'main button[aria-label^="Sélectionner le chantier"]', 'Construction Siège NBB', 'Rénovation Façades ACM', '^Retour à la liste$']
        ]) {
            const { ctx, page } = await ouvrir(browser, url, vp);
            try {
                await entrerDemo(page);
                await allerA(page, route, 1500);
                const tListe = await mainTexte(page);
                const lignesDe = async (nom) => {
                    await cliquer(page, listeSel, nom, 'aria-label', 1500);
                    const t = (await mainTexte(page));
                    if (estMobile(vp)) await cliquer(page, 'main button', retour, 'aria-label', 1300);
                    return t;
                };
                const tA = await lignesDe(A);
                const tB = await lignesDe(B);
                const propresA = [...new Set(tA.split(/\s{2,}|\n|·/).map((l) => l.trim()))]
                    .filter((l) => l.length > 5 && !tB.includes(l) && !tListe.includes(l));
                await lignesDe(A);
                await echantillonner(page, 1600);
                await cliquer(page, listeSel, B, 'aria-label', 1700);
                const images = await page.evaluate(() => ({ clic: window.__clic, images: window.__images }));
                const apres = images.images.filter((f) => images.clic !== null && f.t > images.clic + 100);
                const perimees = apres.filter((f) => propresA.some((l) => f.texte.includes(l)));
                const squelette = apres.some((f) => !propresA.some((l) => f.texte.includes(l)) && !f.texte.includes(B.split(' ')[0]));
                noter(`C107_${route}_${nomVp}`, { propresA: propresA.slice(0, 5), images: apres.length, perimees: perimees.length });
                cas('C107', `${nomVp} px — ${route.slice(1)} : passer de « ${A} » à « ${B} » n'affiche aucune image avec les données de « ${A} »`,
                    propresA.length > 0 && perimees.length === 0,
                    `${apres.length} images analysées après le clic (+100 ms) · images périmées : ${perimees.length}${perimees.length ? ` (de ${Math.round(perimees[0].t - images.clic)} à ${Math.round(perimees[perimees.length - 1].t - images.clic)} ms)` : ''} · lignes propres à A suivies : ${propresA.slice(0, 3).join(' | ')} · état intermédiaire neutre (squelette) vu : ${squelette}`);
            } finally { await ctx.close(); }
        }
    }

    // Changement d'écran (Factures → Clients) : que montre-t-on pendant 350 ms ?
    {
        const { ctx, page } = await ouvrir(browser, url, VP.d1440);
        try {
            await entrerDemo(page);
            await cliquer(page, 'aside nav button', '^Factures$', null, 1500);
            await echantillonner(page, 1200);
            await cliquer(page, 'aside nav button', '^Clients$', null, 1400);
            const images = await page.evaluate(() => ({ clic: window.__clic, images: window.__images }));
            const ap = images.images.filter((f) => f.t > images.clic + 50);
            const ancien = ap.filter((f) => /Clients/.test(f.courant) && /Factures/.test(f.h1));
            const premierClients = ap.find((f) => /Clients/.test(f.h1));
            noter('C107_ecran_350ms', { images: ap.length, ancienSousNouveauMenu: ancien.length, premierClientsMs: premierClients ? Math.round(premierClients.t - images.clic) : null });
            cas('C107', '1440 px — (information, UX-DEC-01) Factures → Clients : l\'ancien écran reste-t-il affiché sous le menu « Clients » ?',
                true, `${ancien.length} images où le menu indique « Clients » et l'écran montre encore « Factures » · écran Clients affiché à ${premierClients ? Math.round(premierClients.t - images.clic) : '—'} ms`);
        } finally { await ctx.close(); }
    }

    // Création d'une entreprise (démo) : les données de l'ancienne restent-elles ?
    // (1440 seulement : sous 768 px le sélecteur d'entreprise n'est pas affiché —
    // mesuré dans le parcours des menus.)
    for (const [nomVp, vp] of [['1440', VP.d1440]]) {
        const { ctx, page } = await ouvrir(browser, url, vp);
        try {
            await entrerDemo(page);
            await cliquer(page, 'button', "changer d'organisation$", 'aria-label', 800);
            await cliquer(page, 'button', '^Nouvelle entreprise$', null, 1200);
            await cliquer(page, '#new_org_name', '.*', null, 200);
            await page.keyboard.type('Entreprise Sonde G1', { delay: 15 });
            await cliquer(page, '[role="dialog"] button', "^Créer l.organisation$", null, 2200);
            const org = await page.evaluate(() => window.__g1.texte(document.querySelector('button[aria-label*="changer d\'organisation"]')));
            const accueil = await etat(page);
            await capture(page, `C107-nouvelle-entreprise-accueil-${nomVp}`);
            await allerA(page, '#devis', 1500);
            const devis = (await mainTexte(page)).match(/DEV-2026-001[^\n]*/)?.[0] || null;
            const clients = await (async () => { await allerA(page, '#clients', 1500); return (await mainTexte(page)).includes('Société Immobilière NBB'); })();
            cas('C107', `${nomVp} px — démo : après « Créer l'organisation », la nouvelle entreprise n'affiche pas les données de l'ancienne`,
                !(/IKADEVIS BTP/.test(accueil.h1) || devis || clients),
                `sélecteur : « ${org} » · h1 de l'accueil : « ${accueil.h1} » · Mes devis montre DEV-2026-001 : ${!!devis} · Clients montre « Société Immobilière NBB » : ${clients}`);
        } finally { await ctx.close(); }
    }
}

// ════════════════════════════════════════════════════════════════════════════
// C101 · C102 · C110 — écran d'accès (sans compte, sans mot de passe)
// ════════════════════════════════════════════════════════════════════════════
async function ecranAcces(browser, url) {
    for (const [nomVp, vp] of [['1440', VP.d1440], ['390', VP.m390]]) {
        const { ctx, page } = await ouvrir(browser, url, vp);
        try {
            let navigations = 0;
            page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations += 1; });
            await page.waitForSelector('#auth-email', { timeout: 30000 });
            const champs = () => page.evaluate(() => [...document.querySelectorAll('input')].filter(window.__g1.vis).map((i) => ({
                id: i.id || '(sans id)', type: i.type, autocomplete: i.getAttribute('autocomplete'), name: i.getAttribute('name'),
                libelle: [...(i.labels || [])].map(window.__g1.texte).join(' '), dansForm: !!i.form
            })));
            const ecran = () => page.evaluate(() => ({
                h2: [...document.querySelectorAll('h2')].filter(window.__g1.vis).map(window.__g1.texte).join(' | '),
                soumettre: window.__g1.texte(document.querySelector('form button[type="submit"]')),
                google: window.__g1.texte(window.__g1.trouver('button', 'Google')),
                focus: window.__g1.focus(), url: location.href.replace(location.origin, '')
            }));
            const connexion = { ...(await ecran()), champs: await champs() };
            await capture(page, `C110-connexion-${nomVp}`);
            // C110 — gestionnaires de mots de passe
            const email = connexion.champs.find((c) => c.id === 'auth-email');
            const mdp = connexion.champs.find((c) => c.id === 'auth-password');
            cas('C110', `${nomVp} px — connexion : e-mail et mot de passe déclarent leur rôle (autocomplete « email/username » et « current-password », WCAG 1.3.5)`,
                /^(email|username)/.test(email?.autocomplete || '') && /current-password/.test(mdp?.autocomplete || ''),
                `e-mail : type=${email?.type} autocomplete=${email?.autocomplete} name=${email?.name} · mot de passe : type=${mdp?.type} autocomplete=${mdp?.autocomplete} name=${mdp?.name} · libellés associés : ${email?.libelle}/${mdp?.libelle} · dans un <form> : ${email?.dansForm && mdp?.dansForm}`);
            const collage = await page.evaluate(() => ['auth-email', 'auth-password'].map((id) => {
                const el = document.getElementById(id);
                const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
                el.dispatchEvent(ev);
                return `${id}:${ev.defaultPrevented ? 'bloqué' : 'autorisé'}`;
            }));
            cas('C110', `${nomVp} px — le collage n'est pas bloqué (e-mail, mot de passe)`, collage.every((c) => /autorisé/.test(c)), collage.join(' · '));
            const alt = await page.evaluate(() => ({ google: !!window.__g1.trouver('button', 'Google'), demo: !!window.__g1.trouver('button', '^Essayer sans compte$'), voir: !!window.__g1.trouver('button', '(Afficher|Voir|Masquer) le mot de passe', 'aria-label') }));
            cas('C110', `${nomVp} px — une alternative au mot de passe est offerte (Google, essai sans compte)`, alt.google && alt.demo,
                `Google : ${alt.google} · Essayer sans compte : ${alt.demo} · bouton « afficher le mot de passe » : ${alt.voir}`);

            // C101 — modes distincts, au clavier
            await page.focus('#auth-email');
            await page.keyboard.type('sonde@exemple.test', { delay: 10 });
            const versInscription = await element(page, 'button', 'Créer un compte');
            await versInscription.focus();
            await page.keyboard.press('Enter'); await attendre(700);
            const inscription = { ...(await ecran()), champs: await champs() };
            await capture(page, `C101-inscription-${nomVp}`);
            cas('C101', `${nomVp} px — l'inscription se distingue de la connexion (titre, bouton, champs, consentement)`,
                /Connexion/.test(connexion.h2) && /Se connecter/.test(connexion.soumettre) && /Créer un compte/.test(inscription.h2) && /Créer mon compte/.test(inscription.soumettre)
                && inscription.champs.some((c) => c.id === 'auth-org') && inscription.champs.some((c) => c.type === 'checkbox'),
                `connexion : « ${connexion.h2} » / « ${connexion.soumettre} » / « ${connexion.google} » · inscription : « ${inscription.h2} » / « ${inscription.soumettre} » / « ${inscription.google} » · champs inscription : ${inscription.champs.map((c) => c.id).join(', ')}`);
            cas('C101', `${nomVp} px — au clavier, après « Créer un compte », le focus est placé dans le nouveau formulaire (WCAG 2.4.3)`,
                inscription.focus !== 'BODY', `focus après Entrée : ${inscription.focus}`);
            const mdpInscription = inscription.champs.find((c) => c.id === 'auth-password');
            const orgInscription = inscription.champs.find((c) => c.id === 'auth-org');
            cas('C110', `${nomVp} px — inscription : le mot de passe est déclaré « new-password » (génération par le gestionnaire), l'organisation « organization »`,
                /new-password/.test(mdpInscription?.autocomplete || '') && /organization/.test(orgInscription?.autocomplete || ''),
                `mot de passe : autocomplete=${mdpInscription?.autocomplete} minLength=8 · organisation : autocomplete=${orgInscription?.autocomplete}`);
            await (await element(page, 'button', 'Retour à la connexion')).focus();
            await page.keyboard.press('Enter'); await attendre(700);
            await (await element(page, 'button', '^Mot de passe oublié')).focus();
            await page.keyboard.press('Enter'); await attendre(700);
            const reinit = { ...(await ecran()), champs: await champs(), email: await page.$eval('#auth-email', (i) => i.value) };
            const sorties = await page.evaluate(() => [...document.querySelectorAll('button')].filter(window.__g1.vis).map(window.__g1.texte));
            await capture(page, `C102-reinitialisation-${nomVp}`);
            cas('C102', `${nomVp} px — « Mot de passe oublié » : e-mail conservé, retour à la connexion et essai sans compte proposés`,
                /Réinitialiser/.test(reinit.h2) && reinit.email === 'sonde@exemple.test' && sorties.some((s) => /Retour à la connexion/.test(s)) && sorties.some((s) => /Essayer sans compte/.test(s)),
                `« ${reinit.h2} » · e-mail conservé : « ${reinit.email} » · champs : ${reinit.champs.map((c) => c.id).join(', ')} · actions : ${sorties.join(' / ')} · focus : ${reinit.focus}`);
            await (await element(page, 'button', 'Retour à la connexion')).focus();
            await page.keyboard.press('Enter'); await attendre(700);
            const fin = await ecran();
            cas('C101', `${nomVp} px — passer connexion ↔ inscription ↔ réinitialisation ne recharge rien et ne boucle pas`,
                navigations === 0 && /Connexion/.test(fin.h2), `navigations de page : ${navigations} · adresse : ${fin.url} · écran final « ${fin.h2} »`);
        } finally { await ctx.close(); }
    }

    // Sortie de la démo et retours (pas de boucle), « Créer mon compte et conserver ce devis ».
    {
        const { ctx, page } = await ouvrir(browser, url, VP.d1440);
        try {
            await entrerDemo(page);
            await cliquer(page, 'button', '^Menu du profil utilisateur$', 'aria-label', 700);
            await cliquer(page, 'button', '^Se déconnecter$', null, 1500);
            const e1 = await etat(page);
            await entrerDemo(page);
            const e2 = await etat(page);
            await allerA(page, '#devis/101', 1900);
            await cliquer(page, 'button', '^Créer mon compte et conserver ce devis$', null, 1500);
            const e3 = await etat(page);
            const note = await page.evaluate(() => (window.__g1.texte(document.body).match(/Votre devis d’essai est conservé[^.]*\./) || [''])[0]);
            await capture(page, 'C101-demo-vers-inscription-1440');
            cas('C101', '1440 px — démo → « Se déconnecter » → connexion → « Essayer sans compte » → démo, sans boucle',
                /Connexion/.test(e1.h2) && /Espace/.test(e2.h1), `après déconnexion : « ${e1.h2} » · après « Essayer sans compte » : « ${e2.h1} »`);
            cas('C101', '1440 px — « Créer mon compte et conserver ce devis » ouvre bien l\'inscription (pas la connexion) et dit que le devis est gardé',
                /Créer un compte/.test(e3.h2) && !!note, `écran : « ${e3.h2} » · mention : « ${note} »`);
        } finally { await ctx.close(); }
    }

    // Retour au parcours initial : un lien profond (#factures) avant l'accès.
    {
        const { ctx, page } = await ouvrir(browser, url, VP.d1440, { hash: '#factures' });
        try {
            const avant = await page.evaluate(() => location.hash);
            await entrerDemo(page);
            const e = await etat(page);
            cas('C102', '1440 px — arrivé par un lien profond (#factures), l\'utilisateur y est ramené après l\'écran d\'accès',
                /Factures/.test(e.h1), `adresse avant accès « ${avant} » → après « Essayer sans compte » : h1 « ${e.h1} », adresse « ${e.hash} »`);
        } finally { await ctx.close(); }
    }

    // Lien e-mail périmé (invitation, réinitialisation, confirmation) — adresse de retour Supabase.
    for (const [nomVp, vp] of [['1440', VP.d1440], ['390', VP.m390]]) {
        const lien = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
        const { ctx, page } = await ouvrir(browser, url, vp, { hash: lien });
        try {
            await page.waitForSelector('#auth-email', { timeout: 30000 });
            await attendre(1200);
            const r = await page.evaluate(() => ({
                h2: [...document.querySelectorAll('h2')].filter(window.__g1.vis).map(window.__g1.texte).join(' | '),
                alertes: [...document.querySelectorAll('[role="alert"],[role="status"]')].filter(window.__g1.vis).map(window.__g1.texte),
                explique: /(lien|invitation)[^.]{0,60}(expir|invalide|plus valable|périm)|(expir|périm)[^.]{0,40}lien/i.test(window.__g1.texte(document.body)),
                hash: location.hash
            }));
            await capture(page, `C109-lien-perime-${nomVp}`);
            const libelle = `${nomVp} px — (simulé : adresse de retour Supabase « otp_expired ») un lien e-mail périmé est expliqué, avec la marche à suivre`;
            const detail = `écran : « ${r.h2} » · alertes : ${JSON.stringify(r.alertes)} · explication trouvée : ${r.explique} · l'adresse garde « ${r.hash.slice(0, 40)}… »`;
            cas('C109', libelle + ' — invitation', r.explique || r.alertes.length > 0, detail);
            cas('C102', libelle + ' — réinitialisation', r.explique || r.alertes.length > 0, detail);
        } finally { await ctx.close(); }
    }

    // Écran « Nouveau mot de passe » (événement PASSWORD_RECOVERY simulé, sans réseau).
    {
        const { ctx, page } = await ouvrir(browser, url, VP.d1440);
        try {
            await page.waitForSelector('#auth-email', { timeout: 30000 });
            const emis = await page.evaluate(async () => { const c = window.ikadevisSupabase; if (!c?.auth?._notifyAllSubscribers) return false; await c.auth._notifyAllSubscribers('PASSWORD_RECOVERY', null); return true; });
            await attendre(1200);
            const r = await page.evaluate(() => {
                const i = [...document.querySelectorAll('input')].find(window.__g1.vis);
                return {
                    h2: [...document.querySelectorAll('h2')].filter(window.__g1.vis).map(window.__g1.texte).join(' | '),
                    champ: i ? { type: i.type, autocomplete: i.getAttribute('autocomplete'), libelles: (i.labels || []).length, ariaLabel: i.getAttribute('aria-label'), placeholder: i.placeholder } : null,
                    actions: [...document.querySelectorAll('button, a[href]')].filter(window.__g1.vis).map(window.__g1.texte)
                };
            });
            await capture(page, 'C102-nouveau-mot-de-passe-1440');
            cas('C102', '1440 px — (simulé : retour d\'un lien de réinitialisation) l\'écran « Nouveau mot de passe » offre une sortie (annuler / retour)',
                emis && r.actions.length > 1, `événement émis : ${emis} · titre « ${r.h2} » · actions : ${r.actions.join(' / ')}`);
            cas('C110', '1440 px — (simulé) « Nouveau mot de passe » : champ libellé et déclaré « new-password » (WCAG 1.3.5, 3.3.2)',
                r.champ && r.champ.autocomplete === 'new-password' && (r.champ.libelles > 0 || r.champ.ariaLabel),
                `champ : ${JSON.stringify(r.champ)}`);
        } finally { await ctx.close(); }
    }
}

// ════════════════════════════════════════════════════════════════════════════
// C103 — session expirée ; C109 — équipe en démo
// ════════════════════════════════════════════════════════════════════════════
async function sessionEtEquipe(browser, url) {
    {
        const { ctx, page } = await ouvrir(browser, url, VP.d1440);
        try {
            await entrerDemo(page);
            await ouvrirChiffrageDepuisAccueil(page);
            await ajouterOuvrage(page, VP.d1440);
            await page.waitForFunction(() => Object.keys(localStorage).some((k) => /draftQuote/.test(k)), { timeout: 10000 }).catch(() => null);
            await viderMessages(page);
            const emis = await page.evaluate(async () => { const c = window.ikadevisSupabase; if (!c?.auth?._notifyAllSubscribers) return false; await c.auth._notifyAllSubscribers('SIGNED_OUT', null); return true; });
            await attendre(2500);
            const ecran = await page.evaluate(() => ({
                h2: [...document.querySelectorAll('h2')].filter(window.__g1.vis).map(window.__g1.texte).join(' | '),
                explique: /(session|connexion)[^.]{0,40}(expir|fermée|terminée)/i.test(window.__g1.texte(document.body))
            }));
            const msgs = await messages(page);
            await capture(page, 'C103-session-expiree-1440');
            cas('C103', '1440 px — (simulé : événement SIGNED_OUT du client Supabase) la fin de session est expliquée à l\'écran',
                emis && (ecran.explique || msgs.some((m) => /expir|fermée/i.test(m))),
                `événement émis : ${emis} · écran : « ${ecran.h2} » · explication visible : ${ecran.explique} · messages vus : ${JSON.stringify(msgs)}`);
            await entrerDemo(page);
            const repris = await page.evaluate(() => (window.__g1.texte(document.body).match(/Un devis non enregistré[^.]*\./) || [''])[0]);
            const bouton = await page.evaluate(() => !!window.__g1.trouver('button', '^Reprendre ce devis$'));
            await capture(page, 'C103-brouillon-retrouve-1440');
            cas('C103', '1440 px — après la reconnexion, le chiffrage non enregistré est proposé à la reprise (pas de perte silencieuse)',
                !!repris && bouton, `« ${repris} » · bouton « Reprendre ce devis » : ${bouton}`);
        } finally { await ctx.close(); }
    }
    {
        const { ctx, page } = await ouvrir(browser, url, VP.d1440);
        try {
            await entrerDemo(page);
            await allerA(page, '#settings/equipe', 1700);
            const t = await page.evaluate(() => window.__g1.texte(document.body));
            const m = (t.match(/Créez ou rejoignez une organisation cloud[^.]*\.?[^.]*\./) || [''])[0];
            await capture(page, 'C109-equipe-demo-1440');
            cas('C109', '1440 px — démo : Paramètres › Équipe explique pourquoi on ne peut pas inviter et comment y arriver',
                /Créez ou rejoignez une organisation cloud/.test(t) && /connecté/.test(t), `« ${m.slice(0, 200)} »`);
        } finally { await ctx.close(); }
    }
}

// ─── Orchestration ─────────────────────────────────────────────────────────
const PARCOURS = [
    ['C002', premiereValeur], ['C007', informationsDecision], ['C010', redondances],
    ['C011', menus], ['C017', contexteListes], ['C108', restrictions],
    ['C019', introuvables], ['C020', sortiesChiffrage], ['C107', changementContexte],
    ['C101', ecranAcces], ['C103', sessionEtEquipe]
];
// Contrôles traités ensemble (pour G1_SEULEMENT).
const LIES = { C002: ['C104', 'C105'], C011: ['C018'], C101: ['C102', 'C110', 'C109'], C103: ['C109'], C108: ['C010'] };

export async function run() {
    resultats.length = 0;
    await mkdir(PREUVES, { recursive: true });
    const { url, close } = await startServer();
    const browser = await puppeteer.launch({ headless: true, protocolTimeout: 180000 });
    try {
        for (const [id, fn] of PARCOURS) {
            if (SEULEMENT.length && !SEULEMENT.includes(id) && !(LIES[id] || []).some((x) => SEULEMENT.includes(x))) continue;
            const t0 = Date.now();
            let essai = 0;
            for (;;) {
                const avant = resultats.length;
                try { await fn(browser, url); break; }
                catch (e) {
                    if (essai++ === 0 && /timeout|Timeout|détaché|detached|Target closed|Session closed|introuvable/i.test(e.message)) {
                        resultats.splice(avant);
                        console.error(`  … ${id} : ${e.message.slice(0, 90)} — nouvelle tentative`);
                        continue;
                    }
                    cas(id, 'BLOQUÉ — la sonde n\'a pas pu terminer ce parcours', false, e.message.slice(0, 220));
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
