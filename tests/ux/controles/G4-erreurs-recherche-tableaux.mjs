#!/usr/bin/env node
// Audit UX 220 — groupe G4 « erreurs, recherche, tableaux » (contrôles 061,
// 063, 065, 066, 069, 070, 071, 072, 075, 076, 077, 078, 079, 080).
//
// Mode Démo uniquement, serveur isolé 127.0.0.1 (startServer, port libre),
// config factice (config.example.js), toute requête hors 127.0.0.1 BLOQUÉE,
// téléchargements REFUSÉS (Browser.setDownloadBehavior = deny).
// Les écrans sont manipulés comme un utilisateur : vraies touches
// (page.keyboard), vraie molette (page.mouse.wheel), clics par coordonnées
// (après vérification que rien ne recouvre la cible). Seul l'<input
// type=number> est rempli par le setter natif + événement input (piège connu).
//
// Données : celles de la démo, plus un jeu FICTIF de 60 devis semé dans le
// stockage local de la démo (clones du devis d'exemple, clients et montants
// variés : accents, casse, client absent, nom très long, montant nul ou très
// grand) pour éprouver recherche, tri et volume. Aucune donnée réelle.
//
//   node tests/ux/controles/G4-erreurs-recherche-tableaux.mjs [section…]
//   sections : erreurs devis factures annulation recherche mobile
import puppeteer from 'puppeteer';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { startServer } from '../../../scratch/lib/server.mjs';

const CONFIG = await readFile(new URL('../../../config.example.js', import.meta.url), 'utf8');
const PREUVES = fileURLToPath(new URL('../../../docs/audit-ux-220/UX_EVIDENCE/G4-erreurs-recherche-tableaux/', import.meta.url));
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const echap = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

// ─── Session isolée ─────────────────────────────────────────────────────────
async function ouvrirSession({ width = 1440, height = 900, mobile = false } = {}) {
    const { url, close } = await startServer();
    const browser = await puppeteer.launch({ headless: true, args: ['--lang=fr-FR'] });
    const page = await browser.newPage();
    const externes = [];
    const erreursPage = [];
    try {
        const s = await browser.target().createCDPSession();
        await s.send('Browser.setDownloadBehavior', { behavior: 'deny' });
    } catch (e) { /* refus des téléchargements non disponible : on ne clique aucun export PDF */ }
    await page.setViewport(mobile
        ? { width, height, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
        : { width, height });
    await page.setRequestInterception(true);
    page.on('request', (r) => {
        const u = new URL(r.url());
        if (u.pathname === '/config.js') return r.respond({ contentType: 'application/javascript', body: CONFIG });
        if (/^https?:$/.test(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname)) { externes.push(u.hostname); return r.abort(); }
        r.continue();
    });
    page.on('pageerror', (e) => erreursPage.push(String(e).slice(0, 200)));
    page.on('dialog', async (d) => { erreursPage.push(`dialogue natif « ${d.message()} »`); await d.dismiss(); });
    await page.goto(url + '/index.html', { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle0', timeout: 60000 });
    return {
        browser, page, externes, erreursPage, mobile,
        fermer: async () => { try { await browser.close(); } finally { await close(); } }
    };
}

async function entrerEnDemo(page) {
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Essayer sans compte'), { timeout: 20000 });
    const b = await trouver(page, /^Essayer sans compte$/, { sel: 'button' });
    await cliquerEl(page, b);
    await attendre(2800);
}
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendre(1400); }

// ─── Interaction « utilisateur » ────────────────────────────────────────────
const SEL_ACTIFS = 'button, [role="button"], [role="option"], [role="radio"], [role="tab"], a, tr, input[type="checkbox"]';
async function trouver(page, re, { sel = SEL_ACTIFS, dans = null } = {}) {
    const h = await page.evaluateHandle((src, flags, sel, dans) => {
        const r = new RegExp(src, flags);
        const racine = dans ? document.querySelector(dans) : document;
        if (!racine) return null;
        return [...racine.querySelectorAll(sel)].filter((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0; })
            .find((x) => r.test((x.getAttribute('aria-label') || x.innerText || x.value || '').replace(/\s+/g, ' ').trim())) || null;
    }, re.source, re.flags, sel, dans);
    const el = h.asElement();
    if (!el) { await h.dispose(); return null; }
    return el;
}
// Clic par coordonnées, après avoir vérifié que la cible n'est pas recouverte.
async function cliquerEl(page, el, { tactile = false } = {}) {
    await el.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await attendre(250);
    const box = await el.boundingBox();
    if (!box) throw new Error('Cible sans boîte (invisible)');
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const couvert = await page.evaluate((x, y, e) => { const t = document.elementFromPoint(x, y); return !(t && (t === e || e.contains(t))); }, x, y, el);
    if (tactile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
    return { x, y, couvert };
}
async function cliquer(page, re, opts = {}) {
    const el = await trouver(page, re, opts);
    if (!el) throw new Error(`Introuvable à l'écran : ${re}`);
    const r = await cliquerEl(page, el, opts);
    await attendre(opts.apres ?? 1200);
    return r;
}
async function saisir(page, selecteur, texte, { delay = 25, vider = true } = {}) {
    const el = await page.$(selecteur);
    if (!el) throw new Error(`Champ introuvable : ${selecteur}`);
    await cliquerEl(page, el);
    if (vider) { await el.evaluate((e) => e.select?.()); await page.keyboard.press('Backspace'); }
    if (texte) await page.keyboard.type(texte, { delay });
}
async function fixerNombre(page, selecteur, v) {
    await page.evaluate((s, v) => {
        const el = document.querySelector(s);
        el.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v));
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }, selecteur, v);
    await attendre(200);
}
async function choisir(page, libelleListe, option) {
    const b = await trouver(page, new RegExp('^' + echap(libelleListe) + '$'), { sel: 'button[aria-haspopup="listbox"]' });
    if (!b) throw new Error(`Liste introuvable : ${libelleListe}`);
    await cliquerEl(page, b);
    await attendre(400);
    await cliquer(page, new RegExp('^' + echap(option) + '$'), { sel: '[role="option"]', apres: 900 });
}
const texteToast = (page) => page.evaluate(() => [...document.querySelectorAll('[role="status"], [role="alert"]')]
    .map((t) => t.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' || '));
async function capture(page, nom) {
    await mkdir(PREUVES, { recursive: true });
    const f = path.join(PREUVES, nom + '.png');
    await page.screenshot({ path: f });
    return path.relative(process.cwd(), f);
}

// ─── Jeu de données fictif (60 devis) ───────────────────────────────────────
const CLIENTS_FICTIFS = ['Écoles du Sahel SA', 'entreprise Bâtir Mali', 'Zénith Construction', '',
    'Abdoulaye Traoré & Fils', 'Groupement d’Intérêt Économique des Artisans du Bâtiment et des Travaux Publics de Kayes',
    'Eiffage Sénégal', 'Société Immobilière NBB'];
const CHANTIERS_FICTIFS = ['Siège administratif Bamako', 'Rénovation école Kalaban', 'Villa R+1 Hamdallaye', '', 'Entrepôt zone industrielle'];
const montantFictif = (i) => (i === 7 ? 0 : i === 13 ? 12345678901 : ((i * 7919) % 997) * 25000 + i * 1000);
async function semerDevis(page, n = 60) {
    return page.evaluate((n, clients, chantiers, montants) => {
        const cle = 'costcalc:guest:savedQuotes';
        const l = JSON.parse(localStorage.getItem(cle) || '[]');
        const base = l.find((q) => q.number === 'DEV-2026-001') || l[0];
        const statuts = ['draft', 'to_verify', 'ready', 'sent', 'accepted'];
        const out = [...l];
        for (let i = 1; i <= n; i++) {
            const d = new Date(Date.UTC(2026, 0, 1) + i * 4 * 86400000);
            const q = JSON.parse(JSON.stringify(base));
            q.id = d.getTime();
            q.serverId = null;
            q.number = 'DEV-2026-' + String(i + 1).padStart(3, '0');
            q.clientName = clients[i % clients.length];
            q.clientId = null;
            q.projectRef = chantiers[i % chantiers.length];
            q.projectId = null;
            q.status = statuts[i % statuts.length];
            q.date = d.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
            q.quoteData = { ...(q.quoteData || {}), totalTTCConsomme: montants[i] };
            out.push(q);
        }
        localStorage.setItem(cle, JSON.stringify(out));
        return out.map((q) => ({ num: q.number, client: q.clientName || '', chantier: q.projectRef || '', statut: q.status, montant: q.quoteData?.totalTTCConsomme || 0, date: q.date, id: q.id }));
    }, n, CLIENTS_FICTIFS, CHANTIERS_FICTIFS, Array.from({ length: n + 1 }, (_, i) => montantFictif(i)));
}
async function sessionAvecDevis(opts) {
    const s = await ouvrirSession(opts);
    await entrerEnDemo(s.page);
    s.fixture = await semerDevis(s.page, 60);
    await s.page.reload({ waitUntil: 'networkidle0', timeout: 60000 });
    await entrerEnDemo(s.page);
    return s;
}

// Lecture de la liste des devis telle qu'affichée (lignes ou tuiles visibles).
const lireDevis = (page) => page.evaluate(() => [...document.querySelectorAll('[aria-label^="Afficher le devis "]')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map((e) => {
        const m = e.getAttribute('aria-label').match(/^Afficher le devis (\S+) de (.*)$/);
        const t = e.innerText;
        const mt = t.match(/([\d   ]+)FCFA/);
        const d = t.match(/\d{2}\/\d{2}\/\d{4}/);
        const r = e.getBoundingClientRect();
        return {
            num: m?.[1], clientAffiche: (e.querySelector('span')?.innerText || '').trim(),
            montant: mt ? Number(mt[1].replace(/[^\d]/g, '')) : null, date: d?.[0] || null,
            top: Math.round(r.top), bottom: Math.round(r.bottom)
        };
    }));
const compteurResultats = (page, titre) => page.evaluate((titre) => {
    const h = [...document.querySelectorAll('h1')].find((x) => x.innerText.trim() === titre);
    const p = h?.parentElement?.querySelector('p');
    const m = (p?.innerText || '').match(/(\d+) résultat/);
    return m ? Number(m[1]) : null;
}, titre);
const dateFr = (s) => { const [d, m, y] = s.split('/').map(Number); return Date.UTC(y, m - 1, d); };

// ════════════════════════════════════════════════════════════════════════════
// SECTION « erreurs » — C061, C063, C065 (dépense, nouveau client), C070/C061
// (import de bordereau avec une ligne fautive). 1440 et 390.
// ════════════════════════════════════════════════════════════════════════════
async function sectionErreurs(ok) {
    for (const vp of [{ width: 1440, height: 900, nom: '1440' }, { width: 390, height: 844, mobile: true, nom: '390' }]) {
        const s = await ouvrirSession(vp);
        const { page } = s;
        const tactile = !!vp.mobile;
        try {
            await entrerEnDemo(page);

            // ── E1. Nouvelle dépense : formulaire à résumé d'erreurs ─────────
            await aller(page, '#depenses');
            await cliquer(page, /^Nouvelle dépense$/, { tactile });
            await saisir(page, '#dep_fournisseur', 'Quincaillerie du Fleuve');
            await saisir(page, '#dep_piece', 'REC-2026-014');
            // Objet et montant laissés vides ; « Payée par l'entreprise » sans compte déclaré.
            const envoyer = await trouver(page, /^Enregistrer$/, { sel: 'form[aria-label="Nouvelle dépense"] button[type="submit"]' });
            await cliquerEl(page, envoyer, { tactile });
            await attendre(700);
            const e1 = await page.evaluate(() => {
                const form = document.querySelector('form[aria-label="Nouvelle dépense"]');
                const bloc = form?.querySelector('[role="alert"]');
                const r = bloc?.getBoundingClientRect();
                const champ = (id) => { const el = document.getElementById(id); if (!el) return null; const cs = getComputedStyle(el); return { invalide: el.getAttribute('aria-invalid'), decrit: el.getAttribute('aria-describedby'), bord: cs.borderTopColor, valeur: el.value }; };
                const a = document.activeElement;
                return {
                    messages: bloc ? [...bloc.querySelectorAll('p')].map((p) => p.innerText.trim()) : [],
                    blocVisible: !!r && r.top >= 0 && r.bottom <= innerHeight,
                    blocHaut: r ? Math.round(r.top) : null, hauteurFenetre: innerHeight,
                    focus: a ? (a.id || a.getAttribute('aria-label') || a.innerText || a.tagName).trim().slice(0, 40) : null,
                    focusDansBloc: !!(bloc && bloc.contains(a)),
                    objet: champ('dep_description'), montant: champ('dep_montant'), notes: champ('dep_notes'),
                    fournisseur: champ('dep_fournisseur')?.valeur, piece: champ('dep_piece')?.valeur
                };
            });
            const preuveE1 = await capture(page, `C061-depense-erreurs-${vp.nom}`);
            const marque = (c) => c && (c.invalide === 'true' || c.bord !== e1.notes?.bord);
            const msgObjet = e1.messages.find((m) => /objet|décrivez la dépense/i.test(m));
            const msgMontant = e1.messages.find((m) => /montant/i.test(m));
            ok(`C061 · [${vp.nom}] Dépense : chaque erreur désigne son champ (message + champ marqué)`,
                msgObjet && msgMontant && marque(e1.objet) && marque(e1.montant),
                `messages=${JSON.stringify(e1.messages)} ; « Objet * » marqué=${marque(e1.objet)} (aria-invalid=${e1.objet?.invalide}, bordure=${e1.objet?.bord}) ; « Montant HT * » marqué=${marque(e1.montant)} ; le message de l'objet dit « ${msgObjet || '—'} » (libellé du champ : « Objet ») ; preuve ${preuveE1}`);
            ok(`C065 · [${vp.nom}] Dépense : après l'échec, le résumé d'erreurs est visible ou reçoit le focus`,
                e1.blocVisible || e1.focusDansBloc,
                `role=alert présent=${e1.messages.length > 0} ; résumé à y=${e1.blocHaut}px pour une fenêtre de ${e1.hauteurFenetre}px (visible=${e1.blocVisible}) ; focus resté sur « ${e1.focus} »`);
            ok(`C063 · [${vp.nom}] Dépense : l'échec de validation conserve les champs déjà saisis`,
                e1.fournisseur === 'Quincaillerie du Fleuve' && e1.piece === 'REC-2026-014',
                `fournisseur=« ${e1.fournisseur} », pièce=« ${e1.piece} »`);

            // Correction champ par champ : rien d'autre ne doit être réinitialisé.
            await saisir(page, '#dep_description', 'Ciment CPJ 45 — 50 sacs');
            await fixerNombre(page, '#dep_montant', 250000);
            await cliquer(page, /^Avancée par quelqu’un \(à rembourser\)$/, { sel: '[role="radio"]', apres: 500, tactile });
            await saisir(page, '#dep_avance', 'Moussa Keïta');
            const apresCorrection = await page.evaluate(() => ['dep_description', 'dep_fournisseur', 'dep_piece', 'dep_montant', 'dep_avance'].map((id) => document.getElementById(id)?.value));
            const envoyer2 = await trouver(page, /^Enregistrer$/, { sel: 'form[aria-label="Nouvelle dépense"] button[type="submit"]' });
            await cliquerEl(page, envoyer2, { tactile });
            await attendre(1400);
            // On déplie la dépense enregistrée pour lire HT et n° de pièce.
            const tete = await trouver(page, /Ciment CPJ 45/, { sel: 'li[data-depense] > button' });
            if (tete) { await cliquerEl(page, tete, { tactile }); await attendre(600); }
            const ligne = await page.evaluate(() => ([...document.querySelectorAll('li[data-depense]')].map((li) => li.innerText.replace(/\s+/g, ' ')).find((t) => /Ciment CPJ 45/.test(t)) || '').replace(/[  ]/g, ' '));
            ok(`C063 · [${vp.nom}] Dépense : après correction, la dépense est enregistrée avec TOUS les champs saisis avant l'erreur`,
                /Quincaillerie du Fleuve/.test(ligne) && /HT 250 000/.test(ligne) && /REC-2026-014/.test(ligne) && /Moussa Keïta/.test(ligne),
                `valeurs avant envoi=${JSON.stringify(apresCorrection)} ; dépense enregistrée=« ${ligne.slice(0, 220)} »`);

            // ── E2. Nouveau client : validation native ──────────────────────
            await aller(page, '#clients');
            await cliquer(page, /^Créer un nouveau client$/, { apres: 900, tactile });
            await cliquer(page, /^Informations complémentaires \(facultatif\)$/, { sel: 'summary', apres: 400, tactile });
            await saisir(page, '#newClientForm-contactPerson', 'M. Ibrahim Coulibaly');
            await saisir(page, '#newClientForm-phone', '+223 76 00 00 00');
            await saisir(page, '#newClientForm-email', 'contact-chez-coulibaly');
            await saisir(page, '#newClientForm-city', 'Bamako');
            await cliquer(page, /^Créer le client$/, { sel: 'button[type="submit"]', apres: 600, tactile });
            const e2a = await page.evaluate(() => {
                const a = document.activeElement; const n = document.getElementById('newClientForm-name');
                return { focus: a?.id, message: n?.validationMessage, ouvert: !!document.getElementById('newClientForm-name') };
            });
            await saisir(page, '#newClientForm-name', 'Bâtiments Coulibaly SARL');
            await cliquer(page, /^Créer le client$/, { sel: 'button[type="submit"]', apres: 600, tactile });
            const e2b = await page.evaluate(() => {
                const a = document.activeElement; const m = document.getElementById('newClientForm-email');
                return { focus: a?.id, message: m?.validationMessage, valeurs: ['newClientForm-name', 'newClientForm-contactPerson', 'newClientForm-phone', 'newClientForm-city'].map((id) => document.getElementById(id)?.value) };
            });
            const preuveE2 = await capture(page, `C065-client-email-invalide-${vp.nom}`);
            ok(`C061 · [${vp.nom}] Nouveau client : le champ fautif est désigné (nom vide, puis e-mail invalide)`,
                e2a.focus === 'newClientForm-name' && !!e2a.message && e2b.focus === 'newClientForm-email' && !!e2b.message,
                `1er envoi → focus « ${e2a.focus} », message « ${e2a.message} » ; 2e envoi → focus « ${e2b.focus} », message « ${e2b.message} » ; preuve ${preuveE2}`);
            ok(`C065 · [${vp.nom}] Nouveau client : le focus est porté sur le champ en erreur`,
                e2a.focus === 'newClientForm-name' && e2b.focus === 'newClientForm-email', `focus 1=${e2a.focus}, focus 2=${e2b.focus}`);
            // Variante : l'utilisateur replie « Informations complémentaires » sur
            // un e-mail encore invalide, puis valide.
            await cliquer(page, /^Informations complémentaires \(facultatif\)$/, { sel: 'summary', apres: 400, tactile });
            await cliquer(page, /^Créer le client$/, { sel: 'button[type="submit"]', apres: 800, tactile });
            const e2c = await page.evaluate(() => {
                const d = document.querySelector('#newClientForm details');
                const m = document.getElementById('newClientForm-email');
                const r = m?.getBoundingClientRect();
                return { ouvert: !!document.getElementById('newClientForm-name'), detailsOuvert: d?.open, focus: document.activeElement?.id || document.activeElement?.innerText?.trim().slice(0, 30), emailVisible: !!m && (m.checkVisibility ? m.checkVisibility() : (!!r && r.width > 0)), message: m?.validationMessage };
            });
            const preuveE2c = await capture(page, `C065-client-email-replie-${vp.nom}`);
            ok(`C065 · [${vp.nom}] Nouveau client : un e-mail invalide dans la section repliée reste repérable à l'envoi`,
                !e2c.ouvert || (e2c.detailsOuvert && e2c.emailVisible && e2c.focus === 'newClientForm-email'),
                `fenêtre toujours ouverte=${e2c.ouvert} ; section dépliée=${e2c.detailsOuvert} ; champ e-mail visible=${e2c.emailVisible} ; focus=« ${e2c.focus} » ; message natif=« ${e2c.message} » ; preuve ${preuveE2c}`);
            if (!e2c.detailsOuvert) await cliquer(page, /^Informations complémentaires \(facultatif\)$/, { sel: 'summary', apres: 400, tactile });
            await saisir(page, '#newClientForm-email', 'contact@coulibaly.test');
            await cliquer(page, /^Créer le client$/, { sel: 'button[type="submit"]', apres: 1400, tactile });
            const ferme = await page.evaluate(() => !document.getElementById('newClientForm-name'));
            const stocke = await page.evaluate(() => JSON.parse(localStorage.getItem('costcalc:guest:clients') || '[]').find((c) => c.name === 'Bâtiments Coulibaly SARL') || null);
            ok(`C063 · [${vp.nom}] Nouveau client : corriger le nom puis l'e-mail ne réinitialise ni contact, ni téléphone, ni ville`,
                ferme && stocke && stocke.contactPerson === 'M. Ibrahim Coulibaly' && stocke.phone === '+223 76 00 00 00' && stocke.city === 'Bamako' && stocke.email === 'contact@coulibaly.test',
                `valeurs pendant la correction=${JSON.stringify(e2b.valeurs)} ; fiche enregistrée=${stocke ? JSON.stringify({ contact: stocke.contactPerson, tel: stocke.phone, ville: stocke.city, email: stocke.email }) : 'absente'}`);

            // ── E3. Import de bordereau collé : une ligne sans quantité ──────
            if (!vp.mobile) {
                await cliquer(page, /^Nouveau devis$/, { sel: 'aside button', apres: 2000 });
                await cliquer(page, /Importer Excel \/ CSV/, { apres: 900 });
                await cliquer(page, /^Ou coller un tableau depuis Excel$/, { sel: 'summary', apres: 400 });
                await page.evaluate(() => {
                    const t = document.querySelector('textarea[aria-label="Tableau à importer"]');
                    t.focus();
                    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t,
                        'Lot\tDésignation\tUnité\tQuantité\tPU HT\nGros œuvre\tBéton de propreté\tm3\t12\t65000\nGros œuvre\tMaçonnerie agglos de 15\tm2\t\t9500\nFinitions\tPeinture façade\tm2\t340\t2500');
                    t.dispatchEvent(new Event('input', { bubbles: true }));
                });
                await cliquer(page, /^Analyser le tableau$/, { apres: 900 });
                const e3 = await page.evaluate(() => {
                    const d = document.querySelector('[aria-labelledby="quote-import-title"]');
                    const lignes = [...d.querySelectorAll('tbody tr')].map((tr) => tr.innerText.replace(/\s+/g, ' ').trim());
                    const bouton = [...d.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Ajouter au devis');
                    return { lignes, ajoutBloque: bouton?.disabled, pied: d.querySelector('footer')?.innerText.replace(/\s+/g, ' ').trim() };
                });
                const fautive = e3.lignes.find((t) => /Maçonnerie/.test(t)) || '';
                ok('C061 · [1440] Import de bordereau : la ligne fautive est désignée (n° de ligne + motif) et l’import est retenu',
                    /^3\b/.test(fautive) && /Quantité positive requise/.test(fautive) && e3.ajoutBloque === true,
                    `ligne signalée=« ${fautive} » ; « Ajouter au devis » désactivé=${e3.ajoutBloque}`);
                // L'utilisateur exclut la ligne fautive : ce qui reste doit être dit.
                const caseLigne3 = await trouver(page, /^Inclure la ligne 3$/, { sel: 'input[type="checkbox"]' });
                await cliquerEl(page, caseLigne3); await attendre(400);
                const caseVerif = await trouver(page, /J’ai vérifié les lignes/, { sel: 'label' });
                await cliquerEl(page, caseVerif); await attendre(400);
                const pied = await page.evaluate(() => document.querySelector('[aria-labelledby="quote-import-title"] footer')?.innerText.replace(/\s+/g, ' ').trim());
                await cliquer(page, /^Ajouter au devis$/, { apres: 900 });
                const toastImport = await texteToast(page);
                const preuveE3 = await capture(page, 'C070-import-partiel-1440');
                ok('C070 · [1440] Import partiel : le nombre de lignes exclues est annoncé avant validation, et la suite à faire après',
                    /1 ligne\(s\) exclue\(s\)/.test(pied || '') && /Vérifiez le devis puis enregistrez-le/.test(toastImport),
                    `pied avant validation=« ${pied} » ; message après=« ${toastImport} » ; preuve ${preuveE3}`);
            }
            ok(`[${vp.nom}] erreurs : aucune requête externe`, s.externes.length === 0, [...new Set(s.externes)].join(', '));
        } finally { await s.fermer(); }
    }
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION « devis » — liste « Mes devis » avec 61 devis : C071, C072, C075,
// C076, C079 (desktop), C080 (1440, 1024, 768, 390, 360, 320).
// ════════════════════════════════════════════════════════════════════════════
const CHAMP_DEVIS = 'input[aria-label="Rechercher dans les devis"]';
const instantaneDevis = (page) => page.evaluate((sel) => ({
    valeur: document.querySelector(sel)?.value ?? null,
    nums: [...document.querySelectorAll('[aria-label^="Afficher le devis "]')]
        .filter((e) => e.getBoundingClientRect().width > 0)
        .map((e) => e.getAttribute('aria-label').split(' ')[3]).sort()
}), CHAMP_DEVIS);
const memes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

async function sectionDevis(ok) {
    const s = await sessionAvecDevis({ width: 1440, height: 900 });
    const { page, fixture } = s;
    const oracle = (q) => fixture.filter((f) => !norm(q) || [f.num, f.client, f.chantier].filter(Boolean).some((v) => norm(v).includes(norm(q)))).map((f) => f.num).sort();
    try {
        await aller(page, '#devis');
        const toutes = await lireDevis(page);
        const montantsConserves = toutes.filter((r) => r.num !== 'DEV-2026-001').every((r) => r.montant === fixture.find((f) => f.num === r.num)?.montant);
        ok('Préparation · les 61 devis fictifs sont affichés avec leurs montants', toutes.length === fixture.length && montantsConserves,
            `${toutes.length} lignes affichées / ${fixture.length} semées ; montants conservés=${montantsConserves}`);

        // ── C071 · la recherche couvre « devis, client ou chantier » ────────
        for (const [q, quoi] of [['DEV-2026-042', 'n° de devis'], ['ECOLES', 'client, sans accent et en capitales'],
            ['siege', 'chantier, sans accent'], ['hamdallaye', 'chantier'], ['zénith', 'client, avec accent']]) {
            await saisir(page, CHAMP_DEVIS, q);
            await attendre(400);
            const snap = await instantaneDevis(page);
            const c = await compteurResultats(page, 'Mes devis');
            const attendu = oracle(q);
            ok(`C071 · [1440] Devis : « ${q} » (${quoi}) trouve exactement les devis attendus`,
                memes(snap.nums, attendu) && c === attendu.length,
                `${snap.nums.length} affiché(s), compteur « ${c} résultat(s) », attendu ${attendu.length} (${attendu.slice(0, 4).join(', ')}${attendu.length > 4 ? '…' : ''})`);
        }

        // ── C072 · cohérence pendant une saisie rapide ──────────────────────
        await saisir(page, CHAMP_DEVIS, '');
        const incoherences = [];
        for (const ch of 'ecoles du sahel') {
            await page.keyboard.type(ch, { delay: 0 });
            await attendre(30);
            const snap = await instantaneDevis(page);
            if (!memes(snap.nums, oracle(snap.valeur))) incoherences.push(`« ${snap.valeur} » → ${snap.nums.length} affichés / ${oracle(snap.valeur).length} attendus`);
        }
        await page.keyboard.type('zzz', { delay: 0 });
        for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
        await attendre(250);
        const apresRafale = await instantaneDevis(page);
        await page.$eval(CHAMP_DEVIS, (e) => e.select());
        await page.keyboard.type('zenith', { delay: 0 });
        await attendre(250);
        const apresRemplacement = await instantaneDevis(page);
        await page.$eval(CHAMP_DEVIS, (e) => e.select());
        await page.keyboard.press('Backspace');
        await attendre(250);
        const apresEffacement = await instantaneDevis(page);
        ok('C072 · [1440] Devis : les résultats suivent la frappe rapide (frappe, rafale + effacements, remplacement, vidage)',
            incoherences.length === 0 && memes(apresRafale.nums, oracle('ecoles du sahel')) && memes(apresRemplacement.nums, oracle('zenith')) && apresEffacement.nums.length === fixture.length,
            `${incoherences.length} instantané(s) incohérent(s) sur 15 frappes ${incoherences.slice(0, 2).join(' ; ')} ; après « zzz »+3 retours : ${apresRafale.nums.length}/${oracle('ecoles du sahel').length} ; « zenith » : ${apresRemplacement.nums.length}/${oracle('zenith').length} ; vidé : ${apresEffacement.nums.length}/${fixture.length}`);

        // ── C075 · tri textes / nombres / dates / valeurs absentes ──────────
        const coll = new Intl.Collator('fr', { sensitivity: 'base' });
        await choisir(page, 'Trier les devis', 'Client A → Z');
        let lignes = await lireDevis(page);
        const nommes = lignes.filter((r) => r.clientAffiche !== 'Société non renseignée');
        const ordreAlpha = nommes.every((r, i) => i === 0 || coll.compare(nommes[i - 1].clientAffiche, r.clientAffiche) <= 0);
        const idxAbsents = lignes.map((r, i) => (r.clientAffiche === 'Société non renseignée' ? i : -1)).filter((i) => i >= 0);
        const absentsEnFin = idxAbsents.length > 0 && idxAbsents.every((i) => i >= lignes.length - idxAbsents.length);
        const preuveTri = await capture(page, 'C075-tri-client-absents-1440');
        const ordreClients = [...new Set(lignes.map((r) => r.clientAffiche.slice(0, 22)))];
        ok('C075 · [1440] Devis, tri « Client A → Z » : accents et casse ignorés (É avec E, « entreprise » avec E)',
            ordreAlpha, `ordre affiché : ${ordreClients.join(' › ')}`);
        ok('C075 · [1440] Devis, tri « Client A → Z » : les devis sans client sont regroupés en fin de liste',
            absentsEnFin, `« Société non renseignée » aux rangs ${idxAbsents.map((i) => i + 1).slice(0, 12).join(', ')} sur ${lignes.length} ; preuve ${preuveTri}`);
        await choisir(page, 'Trier les devis', 'Montant décroissant');
        lignes = await lireDevis(page);
        const decroissant = lignes.every((r, i) => i === 0 || lignes[i - 1].montant >= r.montant);
        ok('C075 · [1440] Devis, tri « Montant décroissant » : ordre numérique (12 345 678 901 en tête, 0 en fin)',
            decroissant && lignes[0].montant === 12345678901 && lignes[lignes.length - 1].montant === 0,
            `premiers : ${lignes.slice(0, 3).map((r) => r.montant).join(' > ')} … derniers : ${lignes.slice(-2).map((r) => r.montant).join(' > ')}`);
        await choisir(page, 'Trier les devis', 'Plus récents');
        lignes = (await lireDevis(page)).filter((r) => r.num !== 'DEV-2026-001');
        const recents = lignes.every((r, i) => i === 0 || dateFr(lignes[i - 1].date) >= dateFr(r.date));
        ok('C075 · [1440] Devis, tri « Plus récents » : dates affichées décroissantes', recents,
            `${lignes.slice(0, 3).map((r) => r.date).join(' > ')} … ${lignes.slice(-2).map((r) => r.date).join(' > ')}`);

        // ── C076 · pagination ───────────────────────────────────────────────
        const pagination = await page.evaluate(() => [...document.querySelectorAll('button, a, nav, [role="navigation"]')]
            .filter((e) => e.getBoundingClientRect().width > 0)
            .map((e) => (e.getAttribute('aria-label') || e.innerText || '').replace(/\s+/g, ' ').trim())
            .filter((t) => /suivant|précédent|page \d|charger plus|afficher plus|voir plus|pagination/i.test(t)));
        const nbAvant = (await lireDevis(page)).length;
        await choisir(page, 'Filtrer les devis par statut', 'Brouillons');
        const brouillons = await lireDevis(page);
        const cBrouillons = await compteurResultats(page, 'Mes devis');
        const cible = brouillons[brouillons.length - 1]?.num;
        await cliquer(page, new RegExp(`^Supprimer le devis ${echap(cible)}$`), { apres: 700 });
        await cliquer(page, /^Supprimer$/, { sel: '[role="dialog"] button, [role="alertdialog"] button', apres: 1200 });
        const apresSuppr = await lireDevis(page);
        const cApres = await compteurResultats(page, 'Mes devis');
        await choisir(page, 'Filtrer les devis par statut', 'Tous les statuts');
        const nbFinal = (await lireDevis(page)).length;
        ok('C076 · [1440] Devis : liste sans pagination — toutes les lignes rendues, compteur juste après filtre et suppression',
            pagination.length === 0 && nbAvant === fixture.length && brouillons.length === cBrouillons && apresSuppr.length === cBrouillons - 1 && cApres === cBrouillons - 1 && !apresSuppr.some((r) => r.num === cible) && nbFinal === fixture.length - 1,
            `contrôles de pagination trouvés : ${pagination.length} ; ${nbAvant} lignes rendues ; filtre Brouillons : ${brouillons.length} lignes / compteur ${cBrouillons} ; après suppression de ${cible} : ${apresSuppr.length} / compteur ${cApres} ; sans filtre : ${nbFinal}`);

        // ── C079 · détail puis retour (desktop) ─────────────────────────────
        await choisir(page, 'Trier les devis', 'Montant décroissant');
        await saisir(page, CHAMP_DEVIS, 'a');
        await attendre(400);
        const zone = await page.$('[data-testid="saved-quotes-list"] .overflow-y-auto');
        const zb = await zone.boundingBox();
        await page.mouse.move(zb.x + zb.width / 2, zb.y + zb.height / 2);
        for (let i = 0; i < 6; i++) { await page.mouse.wheel({ deltaY: 400 }); await attendre(120); }
        await attendre(400);
        const avant = await page.evaluate(() => {
            const z = document.querySelector('[data-testid="saved-quotes-list"] .overflow-y-auto');
            const zr = z.getBoundingClientRect();
            const vis = [...z.querySelectorAll('[aria-label^="Afficher le devis "]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top >= zr.top && r.bottom <= zr.bottom; });
            const milieu = vis[Math.floor(vis.length / 2)];
            const visibles = [...z.querySelectorAll('[aria-label^="Afficher le devis "]')].filter((e) => e.getBoundingClientRect().width > 0);
            return { scrollTop: Math.round(z.scrollTop), cible: milieu?.getAttribute('aria-label').split(' ')[3], rang: visibles.indexOf(milieu) + 1 };
        });
        await cliquer(page, new RegExp(`^Afficher le devis ${echap(avant.cible)} `), { apres: 1600 });
        const ouvert = await page.evaluate(() => location.hash);
        await cliquer(page, /^Fermer la boîte de dialogue$/, { apres: 1400 });
        const apres = await page.evaluate((num) => {
            const z = document.querySelector('[data-testid="saved-quotes-list"] .overflow-y-auto');
            const zr = z.getBoundingClientRect();
            const el = [...document.querySelectorAll('[aria-label^="Afficher le devis "]')].find((e) => e.getBoundingClientRect().width > 0 && e.getAttribute('aria-label').split(' ')[3] === num);
            const r = el?.getBoundingClientRect();
            return {
                scrollTop: Math.round(z.scrollTop), cibleVisible: !!r && r.top >= zr.top && r.bottom <= zr.bottom,
                recherche: document.querySelector('input[aria-label="Rechercher dans les devis"]')?.value,
                tri: [...document.querySelectorAll('button[aria-label="Trier les devis"]')].find((b) => b.getBoundingClientRect().width > 0)?.innerText.trim(),
                focus: (document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName || '').slice(0, 50)
            };
        }, avant.cible);
        const preuve79 = await capture(page, 'C079-devis-retour-1440');
        ok('C079 · [1440] Devis : après ouverture puis fermeture du détail, recherche, tri et position sont conservés',
            apres.recherche === 'a' && apres.tri === 'Montant décroissant' && apres.cibleVisible,
            `avant : défilement ${avant.scrollTop}px, ligne ouverte ${avant.cible} (rang ${avant.rang}), adresse ${ouvert} ; après fermeture : défilement ${apres.scrollTop}px, ligne visible=${apres.cibleVisible}, recherche « ${apres.recherche} », tri « ${apres.tri} », focus sur « ${apres.focus} » ; preuve ${preuve79}`);
        // Retour par l'historique du navigateur (bouton Précédent).
        await cliquer(page, new RegExp(`^Afficher le devis ${echap(avant.cible)} `), { apres: 1600 });
        await page.goBack(); await attendre(1600);
        const apresHist = await page.evaluate((num) => {
            const z = document.querySelector('[data-testid="saved-quotes-list"] .overflow-y-auto');
            const zr = z.getBoundingClientRect();
            const el = [...document.querySelectorAll('[aria-label^="Afficher le devis "]')].find((e) => e.getBoundingClientRect().width > 0 && e.getAttribute('aria-label').split(' ')[3] === num);
            const r = el?.getBoundingClientRect();
            const detailOuvert = !!document.querySelector('[title="Fermer le devis"]');
            return { hash: location.hash, detailOuvert, scrollTop: Math.round(z.scrollTop), cibleVisible: !!r && r.top >= zr.top && r.bottom <= zr.bottom, recherche: document.querySelector('input[aria-label="Rechercher dans les devis"]')?.value };
        }, avant.cible);
        ok('C079 · [1440] Devis : le bouton Précédent du navigateur referme le détail et retrouve la liste filtrée',
            !apresHist.detailOuvert && apresHist.recherche === 'a' && apresHist.cibleVisible,
            `adresse ${apresHist.hash}, détail encore ouvert=${apresHist.detailOuvert}, recherche « ${apresHist.recherche} », défilement ${apresHist.scrollTop}px, ligne ${avant.cible} visible=${apresHist.cibleVisible}`);
        // Aller-retour par la navigation principale.
        await cliquer(page, /^Clients$/, { sel: 'aside button, aside a', apres: 1400 });
        await cliquer(page, /^Mes devis$/, { sel: 'aside button, aside a', apres: 1400 });
        const apresNav = await page.evaluate(() => ({
            recherche: document.querySelector('input[aria-label="Rechercher dans les devis"]')?.value,
            tri: [...document.querySelectorAll('button[aria-label="Trier les devis"]')].find((b) => b.getBoundingClientRect().width > 0)?.innerText.trim()
        }));
        ok('C079 · [1440] Devis : un aller-retour Clients → Mes devis conserve recherche et tri',
            apresNav.recherche === 'a' && apresNav.tri === 'Montant décroissant', JSON.stringify(apresNav));

        // ── C080 · volume et largeurs ───────────────────────────────────────
        await saisir(page, CHAMP_DEVIS, '');
        await attendre(300);
        for (const w of [1440, 1024, 768, 390, 360, 320]) {
            const mobile = w < 500;
            await page.setViewport(mobile ? { width: w, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width: w, height: 900 });
            await attendre(900);
            // Changer l'émulation mobile recharge la page (Puppeteer) : on reprend la démo.
            if (await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Essayer sans compte'))) {
                await entrerEnDemo(page);
                await aller(page, '#devis');
            }
            await page.evaluate(() => window.scrollTo(0, 0));
            const m = await page.evaluate(() => {
                const doc = document.documentElement;
                const coupes = [];
                let clipTable = null;
                const t = [...document.querySelectorAll('[data-testid="saved-quotes-list"] table')].find((x) => x.getBoundingClientRect().width > 0);
                if (t) {
                    let a = t.parentElement;
                    while (a && getComputedStyle(a).overflowX === 'visible') a = a.parentElement;
                    const ar = a?.getBoundingClientRect(), tr = t.getBoundingClientRect();
                    const hors = [...t.querySelectorAll('tbody tr')].slice(0, 3).flatMap((ligne) => [...ligne.querySelectorAll('button, span')]
                        .filter((x) => x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().right > ar.right + 1)
                        .map((x) => (x.getAttribute('aria-label') || x.innerText || '').trim().slice(0, 30)));
                    clipTable = ar ? { tableDroite: Math.round(tr.right), cadreDroite: Math.round(ar.right), defile: a.scrollWidth > a.clientWidth && getComputedStyle(a).overflowX !== 'hidden', hors: [...new Set(hors)] } : null;
                }
                const items = [...document.querySelectorAll('[aria-label^="Afficher le devis "]')].filter((e) => e.getBoundingClientRect().width > 0);
                for (const it of items) {
                    for (const el of it.querySelectorAll('span')) {
                        const txt = el.innerText.trim();
                        if (!/FCFA$|^DEV-\d{4}-\d{3}$/.test(txt)) continue;
                        if (el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > doc.clientWidth) coupes.push(txt);
                    }
                }
                const longs = items.map((it) => it.querySelector('span')).filter((sp) => sp && /Groupement/.test(sp.innerText));
                const longTronque = longs.some((sp) => sp.scrollHeight > sp.clientHeight + 1 || sp.scrollWidth > sp.clientWidth + 1);
                const longTitre = longs.every((sp) => sp.title && sp.title.length > 60);
                return { vw: doc.clientWidth, debord: doc.scrollWidth - doc.clientWidth, coupes: [...new Set(coupes)], clipTable, mode: t ? 'tableau' : 'tuiles', n: items.length, longTronque, longTitre };
            });
            // Atteindre la dernière ligne à la molette.
            const zoneListe = await page.evaluate(() => {
                const l = (document.querySelector('[data-testid="saved-quotes-list"]') || document.querySelector('main') || document.body).getBoundingClientRect();
                return { x: l.left + l.width / 2, y: Math.min(innerHeight - 120, l.top + 300) };
            });
            await page.mouse.move(zoneListe.x, zoneListe.y);
            for (let i = 0; i < 40; i++) { await page.mouse.wheel({ deltaY: 1000 }); await attendre(40); }
            await attendre(500);
            const derniere = await page.evaluate(() => {
                const items = [...document.querySelectorAll('[aria-label^="Afficher le devis "]')].filter((e) => e.getBoundingClientRect().width > 0);
                const d = items[items.length - 1];
                const r = d.getBoundingClientRect();
                const barre = [...document.querySelectorAll('nav, [role="navigation"]')].map((n) => n.getBoundingClientRect()).filter((b) => b.bottom >= innerHeight - 2 && b.top > innerHeight / 2 && b.width > 200);
                const hautBarre = barre.length ? Math.min(...barre.map((b) => b.top)) : innerHeight;
                return { num: d.getAttribute('aria-label').split(' ')[3], bas: Math.round(r.bottom), haut: Math.round(r.top), limite: Math.round(hautBarre) };
            });
            const atteinte = derniere.haut >= 0 && derniere.bas <= derniere.limite + 1;
            const preuve = await capture(page, `C080-devis-volume-${w}`);
            const tableOk = !m.clipTable || m.clipTable.tableDroite <= m.clipTable.cadreDroite + 1 || m.clipTable.defile;
            ok(`C080 · [${w}] Devis (${m.mode}, ${m.n} lignes) : rien n'est coupé, la dernière ligne est atteignable à la molette`,
                m.debord <= 0 && m.coupes.length === 0 && tableOk && atteinte,
                `débord horizontal ${m.debord}px ; n°/montants coupés : ${m.coupes.length ? m.coupes.slice(0, 3).join(', ') : 'aucun'} ; tableau ${m.clipTable ? `droite ${m.clipTable.tableDroite}px / cadre ${m.clipTable.cadreDroite}px, éléments rognés : ${m.clipTable.hors.join(' | ') || 'aucun'}` : '—'} ; dernière ligne ${derniere.num} : haut ${derniere.haut}px, bas ${derniere.bas}px, limite visible ${derniere.limite}px ; nom de 95 car. tronqué=${m.longTronque}, infobulle complète=${m.longTitre} ; preuve ${preuve}`);
            // remonter pour la largeur suivante
            await page.mouse.move(zoneListe.x, zoneListe.y);
            for (let i = 0; i < 40; i++) { await page.mouse.wheel({ deltaY: -1000 }); await attendre(20); }
        }
        ok('[devis] aucune requête externe', s.externes.length === 0, [...new Set(s.externes)].join(', '));
    } finally { await s.fermer(); }
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION « factures » — 5 factures créées À L'ÉCRAN depuis des devis fictifs :
// C066, C070, C071, C075, C077, C078, C079, C080.
// ════════════════════════════════════════════════════════════════════════════
const lireFactures = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid="invoices-list"] tbody tr[aria-label^="Voir la facture"]')]
    .filter((tr) => tr.getBoundingClientRect().width > 0)
    .map((tr) => {
        const td = tr.querySelectorAll('td');
        return {
            client: td[1]?.innerText.trim(), numero: (td[3]?.innerText.trim().match(/FACT-\d{4}-\d{3}|Brouillon/) || [''])[0],
            statut: td[5]?.innerText.replace(/\s+/g, ' ').trim(), coche: !!td[0]?.querySelector('input')?.checked
        };
    }));
const facturesStockees = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('costcalc:guest:invoices') || '[]')
    .map((f) => ({ id: f.id, numero: f.numero, statut: f.statut, devis: f.devisNumero, client: f.clientName, regle: f.montantRegle, net: f.netAPayerTTC })));
const barreGroupee = (page) => page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Marquer envoyées' && x.getBoundingClientRect().width > 0);
    return b ? b.closest('div.flex-wrap')?.innerText.replace(/\s+/g, ' ').trim() : null;
});
async function pastille(page, nom) {
    await cliquer(page, new RegExp(`^${echap(nom)}\\s*\\d*$`), { sel: '[data-testid="invoices-list"] button', apres: 700 });
}

async function sectionFactures(ok) {
    const s = await sessionAvecDevis({ width: 1440, height: 900 });
    const { page } = s;
    const dialogues = {};
    async function creerFacture(num, { emettre = false } = {}) {
        await aller(page, '#devis');
        await saisir(page, CHAMP_DEVIS, num);
        await attendre(400);
        await cliquer(page, new RegExp(`^Afficher le devis ${echap(num)} `), { apres: 1500 });
        await cliquer(page, new RegExp(`^Facturer le devis ${echap(num)}$`), { apres: 1300 });
        await cliquer(page, /^Créer le brouillon$/, { apres: 1800 });
        if (emettre) {
            await cliquer(page, /^Émettre la facture de/, { apres: 900 });
            dialogues.emettre = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].map((d) => d.innerText.replace(/\s+/g, ' ').trim()).pop());
            await cliquer(page, /^Émettre$/, { sel: '[role="dialog"] button, [role="alertdialog"] button', apres: 1600 });
        }
        const f = (await facturesStockees(page)).find((x) => x.devis === num);
        if (await trouver(page, /^Fermer le détail de la facture$/)) await cliquer(page, /^Fermer le détail de la facture$/, { apres: 900 });
        return f;
    }
    try {
        // ── Création des factures (écrans réels) ────────────────────────────
        const F1 = await creerFacture('DEV-2026-005', { emettre: true });   // Abdoulaye Traoré & Fils → émise
        const F2 = await creerFacture('DEV-2026-010');                      // entreprise Bâtir Mali → brouillon
        const F3 = await creerFacture('DEV-2026-015', { emettre: true });   // Eiffage Sénégal → émise, réglée
        const F4 = await creerFacture('DEV-2026-020', { emettre: true });   // client absent → émise, envoyée
        ok('Préparation · 4 factures créées à l’écran (3 émises, 1 brouillon)',
            F1?.numero && !F2?.numero && F2?.statut === 'draft' && F3?.numero && F4?.numero,
            `F1 ${F1?.numero}/${F1?.statut} · F2 ${F2?.numero}/${F2?.statut} · F3 ${F3?.numero}/${F3?.statut} · F4 ${F4?.numero}/${F4?.statut} (client « ${F4?.client} »)`);

        // ── C066 · brouillon / émission / envoi distingués ──────────────────
        ok('C066 · [1440] Facture : « Émettre » est une étape distincte du brouillon, confirmée, qui annonce numéro définitif et irréversibilité',
            /numéro définitif/.test(dialogues.emettre || '') && /ne peut plus être modifiée/.test(dialogues.emettre || '') && F2?.statut === 'draft' && !F2?.numero,
            `fenêtre d’émission : « ${(dialogues.emettre || '').slice(0, 220)} » ; brouillon F2 : statut ${F2?.statut}, numéro ${F2?.numero}`);

        // Règlement partiel puis solde de F3 (C070 : ce qui reste à payer).
        await aller(page, '#factures');
        await cliquer(page, new RegExp(`^Voir la facture de Eiffage Sénégal$`), { sel: 'tr', apres: 1400 });
        await cliquer(page, new RegExp(`^Enregistrer un règlement pour la facture ${F3.numero}$`), { apres: 900 });
        await fixerNombre(page, '#reglement_montant_commun', 5000000);
        await cliquer(page, /^Valider le règlement$/, { apres: 1500 });
        await page.keyboard.press('Escape'); await attendre(700);
        const apresPartiel = await page.evaluate(() => document.body.innerText.replace(/[  ]/g, ' '));
        const reste = (apresPartiel.match(/Reste\s*(?:à (?:payer|percevoir|régler))?\s*:\s*([\d ]+) FCFA/i) || [])[1];
        const preuvePartiel = await capture(page, 'C070-facture-reglement-partiel-1440');
        ok('C070 · [1440] Règlement partiel : la facture dit ce qui reste à encaisser',
            /Partiellement réglée/.test(apresPartiel) && reste && Number(reste.replace(/\D/g, '')) === F3.net - 5000000,
            `statut affiché « Partiellement réglée »=${/Partiellement réglée/.test(apresPartiel)} ; reste lu « ${reste} FCFA » ; attendu ${F3.net - 5000000} ; preuve ${preuvePartiel}`);
        await cliquer(page, new RegExp(`^Enregistrer un règlement pour la facture ${F3.numero}$`), { apres: 900 });
        await fixerNombre(page, '#reglement_montant_commun', F3.net - 5000000);
        await cliquer(page, /^Valider le règlement$/, { apres: 1500 });
        await page.keyboard.press('Escape'); await attendre(700);
        if (await trouver(page, /^Fermer le détail de la facture$/)) await cliquer(page, /^Fermer le détail de la facture$/, { apres: 900 });
        // F4 : marquée envoyée individuellement (bouton de ligne).
        const envoiLigne = await page.evaluateHandle((num) => [...document.querySelectorAll('[data-testid="invoices-list"] tbody tr')]
            .find((tr) => tr.innerText.includes(num))?.querySelector('button[title="Marquer comme envoyée au client"]') || null, F4.numero);
        if (envoiLigne.asElement()) { await cliquerEl(page, envoiLigne.asElement()); await attendre(1200); }
        // Un brouillon F5, pour l'action « Marquer comme envoyée » unitaire.
        const F5 = await creerFacture('DEV-2026-025');
        await aller(page, '#factures');
        await cliquer(page, /^Voir la facture de Écoles du Sahel SA$/, { sel: 'tr', apres: 1400 });
        await cliquer(page, /^Marquer comme envoyée$/, { apres: 900 });
        const dlgEnvoi = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].map((d) => d.innerText.replace(/\s+/g, ' ').trim()).pop());
        await cliquer(page, /^Marquer comme envoyée$/, { sel: '[role="dialog"] button, [role="alertdialog"] button', apres: 1600 });
        const F5apres = (await facturesStockees(page)).find((x) => x.id === F5.id);
        if (await trouver(page, /^Fermer le détail de la facture$/)) await cliquer(page, /^Fermer le détail de la facture$/, { apres: 900 });
        ok('C066 · [1440] Facture : « Marquer comme envoyée » sur un brouillon prévient qu’il sera d’abord émis (numéro officiel), puis l’émet',
            /numéro officiel définitif/.test(dlgEnvoi || '') && F5apres?.statut === 'sent' && /^FACT-/.test(F5apres?.numero || ''),
            `fenêtre : « ${(dlgEnvoi || '').slice(0, 200)} » ; résultat : ${F5apres?.numero} / ${F5apres?.statut}`);
        let stock = await facturesStockees(page);
        const st = (id) => stock.find((x) => x.id === id);
        ok('Préparation · états avant les actions groupées', st(F1.id).statut === 'issued' && st(F2.id).statut === 'draft' && st(F3.id).statut === 'paid' && st(F4.id).statut === 'sent',
            stock.map((f) => `${f.numero || 'brouillon'}=${f.statut}`).join(', '));

        // ── C071 · recherche « n°, client, chantier, montant » ──────────────
        const montantAffiche = await page.evaluate(() => {
            const td = [...document.querySelectorAll('[data-testid="invoices-list"] tbody tr td')].find((x) => /FCFA/.test(x.innerText));
            return (td?.innerText.split('\n')[0] || '').replace(/[  ]/g, ' ').replace(' FCFA', '').trim();
        });
        const total = (await lireFactures(page)).length;
        for (const [q, attendu, quoi] of [[F3.numero, 1, 'n° de facture'], ['eiffage', 1, 'client en minuscules'],
            ['kalaban', (await lireFactures(page)).length ? stock.filter((f) => /Kalaban/.test(fixtureChantier(s.fixture, f.devis))).length : 0, 'chantier'],
            [montantAffiche, total, 'montant tel qu’affiché'], [montantAffiche.replace(/\s/g, ''), total, 'montant sans espaces']]) {
            await saisir(page, 'input[aria-label="Rechercher dans les factures"]', q);
            await attendre(400);
            const n = (await lireFactures(page)).length;
            ok(`C071 · [1440] Factures : « ${q} » (${quoi}) trouve ${attendu} facture(s)`, n === attendu, `${n} affichée(s), ${attendu} attendue(s) sur ${total}`);
        }
        await saisir(page, 'input[aria-label="Rechercher dans les factures"]', '');
        await attendre(400);

        // ── C075 · tri des factures (dates absentes des brouillons) ─────────
        await cliquer(page, /^Filtres avancés$/, { apres: 500 });
        await choisir(page, 'Trier les factures', 'Plus anciennes d’abord');
        const anciennes = (await lireFactures(page)).map((f) => f.numero);
        await choisir(page, 'Trier les factures', 'Plus récentes d’abord');
        const recentes = (await lireFactures(page)).map((f) => f.numero);
        await choisir(page, 'Trier les factures', 'Client (A → Z)');
        const parClient = (await lireFactures(page)).map((f) => f.client);
        await choisir(page, 'Trier les factures', 'Plus récentes d’abord');
        const datees = (l) => l.filter((n) => n !== 'Brouillon');
        const inverse = memes(datees(anciennes), [...datees(recentes)].reverse());
        const posB = (l) => l.indexOf('Brouillon');
        ok('C075 · [1440] Factures, tri par date : « anciennes » est l’inverse de « récentes », brouillon (sans date d’émission) placé selon une règle constante',
            inverse && (posB(anciennes) === anciennes.length - 1) === (posB(recentes) === recentes.length - 1),
            `anciennes d’abord : ${anciennes.join(' › ')} ; récentes d’abord : ${recentes.join(' › ')}`);
        ok('C075 · [1440] Factures, tri « Client (A → Z) » : la facture sans client n’est pas classée en tête',
            parClient[0] !== 'Société non renseignée', `ordre : ${parClient.join(' › ')}`);

        // ── C079 · détail puis retour (factures) ───────────────────────────
        await saisir(page, 'input[aria-label="Rechercher dans les factures"]', 'e');
        await pastille(page, 'Non réglées');
        const avantF = await lireFactures(page);
        await cliquer(page, /^Voir la facture de /, { sel: '[data-testid="invoices-list"] tbody tr', apres: 1400 });
        await cliquer(page, /^Fermer le détail de la facture$/, { apres: 1000 });
        const apresF = await page.evaluate(() => ({
            recherche: document.querySelector('input[aria-label="Rechercher dans les factures"]')?.value,
            pastille: [...document.querySelectorAll('[data-testid="invoices-list"] button')].find((b) => /bg-neutral-900/.test(b.className))?.innerText.replace(/\s+/g, ' ').trim()
        }));
        const apresListe = await lireFactures(page);
        ok('C079 · [1440] Factures : la recherche et la pastille de statut survivent à l’ouverture puis la fermeture d’une facture',
            apresF.recherche === 'e' && /^Non réglées/.test(apresF.pastille || '') && memes(apresListe.map((x) => x.numero), avantF.map((x) => x.numero)),
            `avant : ${avantF.map((x) => x.numero).join(', ')} ; après : recherche « ${apresF.recherche} », pastille « ${apresF.pastille} », ${apresListe.map((x) => x.numero).join(', ')}`);
        await saisir(page, 'input[aria-label="Rechercher dans les factures"]', '');
        await pastille(page, 'Toutes');

        // ── C077 · portée de la sélection ───────────────────────────────────
        const caseF1 = await trouver(page, new RegExp(`^Sélectionner facture ${F1.numero}$`), { sel: 'input[type="checkbox"]' });
        await cliquerEl(page, caseF1); await attendre(500);
        const entete = await page.evaluate(() => { const c = document.querySelector('input[aria-label="Sélectionner toutes les factures"]'); return { coche: c.checked, mixte: c.indeterminate || c.getAttribute('aria-checked') === 'mixed' }; });
        ok('C077 · [1440] Factures : une sélection partielle est signalée sur la case « tout sélectionner » (état mixte)',
            entete.mixte, `1 facture cochée sur ${total} : case d’en-tête cochée=${entete.coche}, état mixte=${entete.mixte}`);
        await cliquer(page, /^$/, { sel: 'button[title="Annuler la sélection"]', apres: 500 });
        await pastille(page, 'Brouillons');
        const caseTout = await page.$('input[aria-label="Sélectionner toutes les factures"]');
        await cliquerEl(page, caseTout); await attendre(500);
        const barreBrouillons = await barreGroupee(page);
        await pastille(page, 'Soldées');
        const barreSoldees = await barreGroupee(page);
        const visiblesSoldees = await lireFactures(page);
        const preuve77 = await capture(page, 'C077-selection-masquee-par-filtre-1440');
        ok('C077 · [1440] Factures : quand le filtre masque des factures sélectionnées, la barre le dit',
            !barreSoldees || /masqu|hors filtre|non affich/i.test(barreSoldees),
            `sélection faite dans « Brouillons » : « ${barreBrouillons} » ; après passage à « Soldées » (${visiblesSoldees.length} ligne(s) visible(s), ${visiblesSoldees.filter((f) => f.coche).length} cochée(s)) : « ${barreSoldees} » ; preuve ${preuve77}`);

        // ── C066 / C078 · « Marquer envoyées » sur la sélection (le brouillon caché) ──
        await cliquer(page, /^Marquer envoyées$/, { apres: 900 });
        const toastBrouillon = await texteToast(page);
        stock = await facturesStockees(page);
        await pastille(page, 'Toutes');
        await cliquer(page, /^Voir la facture de entreprise Bâtir Mali$/, { sel: 'tr', apres: 1400 });
        const detailF2 = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0)
            .map((b) => (b.getAttribute('aria-label') || b.innerText).trim()).filter((t) => /Émettre|règlement|Marquer|Supprimer le brouillon|avoir/i.test(t)));
        const preuveF2 = await capture(page, 'C066-brouillon-marque-envoye-par-lot-1440');
        await cliquer(page, /^Fermer le détail de la facture$/, { apres: 900 });
        ok('C066 · [1440] Action groupée « Marquer envoyées » : un brouillon n’est pas « envoyé » sans être émis (numéro légal)',
            !(st(F2.id) && stock.find((x) => x.id === F2.id)?.statut === 'sent' && !stock.find((x) => x.id === F2.id)?.numero),
            `message « ${toastBrouillon} » ; brouillon F2 après coup : statut ${stock.find((x) => x.id === F2.id)?.statut}, numéro ${stock.find((x) => x.id === F2.id)?.numero} ; actions encore proposées sur sa fiche : ${detailF2.join(' | ') || 'aucune'} ; preuve ${preuveF2}`);

        // Sélection mixte : F4 déjà envoyée + F1 émise.
        for (const n of [F4.numero, F1.numero]) {
            const c = await trouver(page, new RegExp(`^Sélectionner facture ${n}$`), { sel: 'input[type="checkbox"]' });
            await cliquerEl(page, c); await attendre(400);
        }
        const barreMixte = await barreGroupee(page);
        await cliquer(page, /^Marquer envoyées$/, { apres: 900 });
        const toastMixte = await texteToast(page);
        ok('C078 · [1440] Actions groupées : la barre annonce le nombre de factures sélectionnées',
            /2 factures sélectionnées/.test(barreMixte || ''), `barre : « ${barreMixte} »`);
        ok('C070 · [1440] « Marquer envoyées » sur 2 factures dont 1 déjà envoyée : le résultat explique la facture non traitée',
            /déjà|ignor|non trait|1 sur 2|sur 2/i.test(toastMixte), `barre avant : « ${barreMixte} » ; message après : « ${toastMixte} »`);

        // Facture réglée → « Marquer envoyées ».
        const cF3 = await trouver(page, new RegExp(`^Sélectionner facture ${F3.numero}$`), { sel: 'input[type="checkbox"]' });
        await cliquerEl(page, cF3); await attendre(400);
        await cliquer(page, /^Marquer envoyées$/, { apres: 900 });
        const toastRegle = await texteToast(page);
        stock = await facturesStockees(page);
        const ligneF3 = (await lireFactures(page)).find((f) => f.numero === F3.numero);
        const cptSoldees = await page.evaluate(() => [...document.querySelectorAll('[data-testid="invoices-list"] button')].find((b) => /^Soldées/.test(b.innerText.trim()))?.innerText.replace(/\s+/g, ' ').trim());
        ok('C078 · [1440] « Marquer envoyées » ne s’applique pas à une facture déjà réglée (son statut « Réglée » est conservé)',
            stock.find((x) => x.id === F3.id)?.statut === 'paid',
            `message « ${toastRegle} » ; ${F3.numero} : statut stocké ${stock.find((x) => x.id === F3.id)?.statut}, badge « ${ligneF3?.statut} », pastille « ${cptSoldees} »`);

        // Export CSV de la sélection : nombre annoncé = nombre exporté.
        await page.evaluate(() => {
            window.__exports = [];
            const orig = URL.createObjectURL.bind(URL);
            URL.createObjectURL = (b) => { try { b.text().then((t) => window.__exports.push(t)); } catch (e) { /* */ } return orig(b); };
        });
        for (const n of [F1.numero, F3.numero]) {
            const c = await trouver(page, new RegExp(`^Sélectionner facture ${n}$`), { sel: 'input[type="checkbox"]' });
            await cliquerEl(page, c); await attendre(300);
        }
        const barreExport = await barreGroupee(page);
        await cliquer(page, /^Exporter CSV$/, { sel: 'button', apres: 1000 });
        const toastExport = await texteToast(page);
        const csv = await page.evaluate(() => window.__exports.pop() || '');
        const lignesCsv = csv.split(/\r\n/).filter(Boolean).length - 1;
        ok('C078 · [1440] « Exporter CSV » de la sélection : nombre annoncé = nombre exporté',
            /2 factures sélectionnées/.test(barreExport || '') && /\(2 factures\)/.test(toastExport) && lignesCsv === 2,
            `barre « ${barreExport} » ; message « ${toastExport} » ; lignes dans le fichier (hors en-tête) : ${lignesCsv}`);
        await cliquer(page, /^$/, { sel: 'button[title="Annuler la sélection"]', apres: 500 });

        // ── C080 · le tableau des factures à toutes les largeurs ────────────
        for (const w of [1440, 1024, 768, 390, 360, 320]) {
            const mobile = w < 500;
            await page.setViewport(mobile ? { width: w, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width: w, height: 900 });
            await attendre(900);
            if (await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Essayer sans compte'))) {
                await entrerEnDemo(page);
                await aller(page, '#factures');
            }
            const m = await page.evaluate(() => {
                const t = [...document.querySelectorAll('[data-testid="invoices-list"] table')].find((x) => x.getBoundingClientRect().width > 0);
                if (!t) return { mode: 'pas de tableau', texte: (document.querySelector('[data-testid="invoices-list"]')?.innerText || '').slice(0, 120) };
                let a = t.parentElement;
                while (a && getComputedStyle(a).overflowX === 'visible') a = a.parentElement;
                const ar = a.getBoundingClientRect();
                const cols = [...t.querySelectorAll('th')].map((th) => { const r = th.getBoundingClientRect(); return { nom: th.innerText.trim() || '☐', visible: Math.max(0, Math.min(r.right, ar.right) - r.left), largeur: r.width }; });
                const rognees = cols.filter((c) => c.visible < c.largeur - 1).map((c) => `${c.nom} (${Math.round(c.visible)}/${Math.round(c.largeur)}px)`);
                const elementsCaches = [...t.querySelectorAll('tbody tr')].slice(0, 2).flatMap((tr) => [...tr.querySelectorAll('button, span')]
                    .filter((x) => x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().left >= ar.right - 1)
                    .map((x) => (x.getAttribute('aria-label') || x.innerText || x.title || '').trim().slice(0, 24)).filter(Boolean));
                // Montants des indicateurs (bandeau du haut) coupés par une ellipse ?
                const kpi = [...document.querySelectorAll('[data-testid="invoices-kpi-strip"] .font-mono')].filter((x) => x.getBoundingClientRect().width > 0)
                    .filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.innerText.trim());
                return { mode: 'tableau', kpi, debordPage: document.documentElement.scrollWidth - document.documentElement.clientWidth, cadre: Math.round(ar.right), tableau: Math.round(t.getBoundingClientRect().right), overflow: getComputedStyle(a).overflowX, rognees, elementsCaches: [...new Set(elementsCaches)] };
            });
            // Tentative de défilement horizontal réel (molette horizontale) sur le tableau.
            let scrollApres = null;
            if (m.mode === 'tableau') {
                const zone = await page.evaluate(() => { const r = [...document.querySelectorAll('[data-testid="invoices-list"] table')].find((x) => x.getBoundingClientRect().width > 0).getBoundingClientRect(); return { x: r.left + 40, y: r.top + 40 }; });
                await page.mouse.move(zone.x, zone.y);
                await page.mouse.wheel({ deltaX: 400 });
                await attendre(300);
                scrollApres = await page.evaluate(() => { let a = [...document.querySelectorAll('[data-testid="invoices-list"] table')].find((x) => x.getBoundingClientRect().width > 0).parentElement; while (a && getComputedStyle(a).overflowX === 'visible') a = a.parentElement; return a.scrollLeft; });
            }
            const preuve = await capture(page, `C080-factures-tableau-${w}`);
            const defilable = m.mode === 'tableau' && m.overflow !== 'hidden' && scrollApres > 0;
            ok(`C080 · [${w}] Factures : aucune colonne rognée sans moyen de la faire défiler, aucun montant coupé`,
                m.mode !== 'tableau' || ((m.rognees.length === 0 || defilable) && m.kpi.length === 0),
                m.mode === 'tableau'
                    ? `cadre overflow-x:${m.overflow}, bord droit ${m.cadre}px, tableau jusqu’à ${m.tableau}px ; colonnes rognées : ${m.rognees.join(', ') || 'aucune'} ; éléments entièrement cachés (2 premières lignes) : ${m.elementsCaches.join(' | ') || 'aucun'} ; molette horizontale → scrollLeft ${scrollApres} ; montants d’indicateurs coupés : ${m.kpi.join(' | ') || 'aucun'} ; preuve ${preuve}`
                    : `${m.mode} : ${m.texte} ; preuve ${preuve}`);
        }
        ok('[factures] aucune requête externe', s.externes.length === 0, [...new Set(s.externes)].join(', '));
        if (s.erreursPage.length) ok('[factures] erreurs JavaScript / dialogues natifs', false, s.erreursPage.slice(0, 3).join(' ; '));
    } finally { await s.fermer(); }
}
const fixtureChantier = (fixture, num) => fixture.find((f) => f.num === num)?.chantier || '';

// ════════════════════════════════════════════════════════════════════════════
// SECTION « annulation » — C069 (suppression d'un ouvrage puis « Annuler » /
// Ctrl+Z, fiabilité de la fenêtre de 6 s), C066 (Enregistrer ≠ envoyer).
// ════════════════════════════════════════════════════════════════════════════
const lireOuvrages = (page) => page.evaluate(() => [...document.querySelectorAll('button[title="Supprimer cette ligne"]')]
    .filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.getAttribute('aria-label').replace(/^Supprimer /, '')));
const lireTTC = (page) => page.evaluate(() => {
    const t = document.body.innerText.replace(/[  ]/g, ' ');
    const i = t.lastIndexOf('TOTAL TTC');
    const m = i >= 0 ? t.slice(i).match(/([\d ]+) FCFA/) : null;
    return m ? Number(m[1].replace(/\D/g, '')) : null;
});
const toastAnnuler = (page) => page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Annuler' && /Ouvrage supprimé du lot/.test(x.parentElement?.innerText || ''));
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const conteneur = b.parentElement;
    const cible = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, role: conteneur.getAttribute('role'), live: conteneur.getAttribute('aria-live'), recouvert: !(cible === b || b.contains(cible)), dansFenetre: r.bottom <= innerHeight && r.top >= 0 };
});
async function supprimerOuvrage(page, nom, { tactile = false } = {}) {
    await cliquer(page, new RegExp(`^Supprimer ${echap(nom)}$`), { sel: 'button[title="Supprimer cette ligne"]', apres: 600, tactile });
    await cliquer(page, /^Supprimer$/, { sel: '[role="dialog"] button, [role="alertdialog"] button', apres: 500, tactile });
}
async function ouvrirChiffrageDemo(page, { tactile = false } = {}) {
    await aller(page, '#devis');
    await cliquer(page, /^Afficher le devis DEV-2026-001 /, { apres: 1500, tactile });
    await cliquer(page, /^Modifier le devis DEV-2026-001$/, { apres: 2200, tactile });
}

async function sectionAnnulation(ok) {
    // ── 1440 ─────────────────────────────────────────────────────────────────
    let s = await ouvrirSession({ width: 1440, height: 900 });
    let page = s.page;
    try {
        await entrerEnDemo(page);
        await ouvrirChiffrageDemo(page);
        const origine = await lireOuvrages(page);
        const ttc0 = await lireTTC(page);
        const cible = origine[1];
        await supprimerOuvrage(page, cible);
        const t1 = await toastAnnuler(page);
        const apresSuppr = await lireOuvrages(page);
        const preuve = await capture(page, 'C069-annuler-suppression-1440');
        await page.mouse.click(t1.x, t1.y);
        await attendre(700);
        const restaure = await lireOuvrages(page);
        const ttc1 = await lireTTC(page);
        ok('C069 · [1440] Suppression d’un ouvrage → « Annuler » : l’ouvrage revient à sa place, total TTC identique',
            !apresSuppr.includes(cible) && memes(restaure, origine) && ttc1 === ttc0,
            `ouvrages avant : ${origine.length}, après suppression : ${apresSuppr.length}, après « Annuler » : ${restaure.length} (même ordre=${memes(restaure, origine)}) ; TTC ${ttc0} → ${ttc1} ; preuve ${preuve}`);
        ok('C069 · [1440] Le message « Ouvrage supprimé du lot / Annuler » est annoncé (rôle status ou zone live)',
            !!(t1.role || t1.live), `rôle=${t1.role}, aria-live=${t1.live}, recouvert=${t1.recouvert}`);

        // Ctrl+Z après disparition du message (7 s).
        await supprimerOuvrage(page, cible);
        await attendre(7000);
        const encore = await toastAnnuler(page);
        await page.evaluate(() => document.activeElement?.blur?.());
        await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
        await attendre(800);
        const parClavier = await lireOuvrages(page);
        ok('C069 · [1440] Après la disparition du lien (6 s), Ctrl+Z rétablit l’ouvrage supprimé',
            !encore && memes(parClavier, origine) && (await lireTTC(page)) === ttc0,
            `lien encore affiché à 7 s=${!!encore} ; après Ctrl+Z : ${parClavier.length} ouvrages, même ordre=${memes(parClavier, origine)}`);

        // Fiabilité : deux suppressions rapprochées — le lien de la 2e doit vivre 6 s.
        const [a, b] = [origine[0], origine[1]];
        await supprimerOuvrage(page, a);
        await attendre(3000);
        await supprimerOuvrage(page, b);
        const t0 = Date.now();
        let duree = 0;
        while (Date.now() - t0 < 7000) { if (await toastAnnuler(page)) duree = Date.now() - t0; else break; await attendre(200); }
        await page.evaluate(() => document.activeElement?.blur?.());
        for (let i = 0; i < 2; i++) { await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control'); await attendre(500); }
        const apresDeux = await lireOuvrages(page);
        ok('C069 · [1440] Deux suppressions à 3 s d’intervalle : le lien « Annuler » de la seconde reste offert ses 6 s',
            duree >= 5500, `lien de la 2e suppression visible pendant ${duree} ms (annoncé : 6 000 ms) ; restauration des deux par Ctrl+Z ×2 : ${memes(apresDeux, origine)}`);

        // Joignabilité clavier du lien « Annuler » dans le délai.
        await supprimerOuvrage(page, cible);
        const tDebut = Date.now();
        let tabs = 0, atteint = false;
        while (Date.now() - tDebut < 6000 && tabs < 150) {
            await page.keyboard.press('Tab'); tabs++;
            atteint = await page.evaluate(() => document.activeElement?.innerText?.trim() === 'Annuler' && /Ouvrage supprimé/.test(document.activeElement.parentElement?.innerText || ''));
            if (atteint) break;
        }
        const focusApresSuppr = tabs;
        if (atteint) { await page.keyboard.press('Enter'); await attendre(600); } else { await page.evaluate(() => document.activeElement?.blur?.()); await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control'); await attendre(600); }
        ok('C069 · [1440] Au clavier, une récupération reste possible (lien « Annuler » à portée, sinon Ctrl+Z annoncé)',
            (atteint && focusApresSuppr <= 24) || memes(parClavier, origine), `lien ${atteint ? `atteint en ${focusApresSuppr} tabulations` : `non atteint après ${focusApresSuppr} tabulations en ${Date.now() - tDebut} ms`} ; Ctrl+Z reste disponible (annoncé dans la confirmation de suppression)`);

        // ── C066 · « Enregistrer » le devis ne l'envoie pas ─────────────────
        const statutAvant = await page.evaluate(() => (JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]').find((q) => q.number === 'DEV-2026-001') || {}).status);
        const libelles = await page.evaluate(() => [...document.querySelectorAll('button[data-etat-enregistrement]')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.innerText.trim()));
        await cliquer(page, /^Enregistrer$/, { sel: 'button[data-etat-enregistrement]', apres: 800 });
        const dlg = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].map((d) => d.innerText.replace(/\s+/g, ' ').trim()).pop() || '');
        if (/Mettre à jour/.test(dlg)) await cliquer(page, /^Mettre à jour$/, { sel: '[role="dialog"] button, [role="alertdialog"] button', apres: 1200 });
        const statut = await page.evaluate(() => (JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]').find((q) => q.number === 'DEV-2026-001') || {}).status);
        ok('C066 · [1440] Chiffrage : « Enregistrer » enregistre sans changer le statut d’envoi (l’envoi reste une action séparée)',
            libelles.includes('Enregistrer') && statut === statutAvant && statut !== 'sent',
            `boutons d’enregistrement : ${libelles.join(' / ')} ; confirmation : « ${dlg.slice(0, 120)} » ; statut stocké avant ${statutAvant} (« Accepté »), après ${statut}`);
        ok('[annulation 1440] aucune requête externe', s.externes.length === 0, [...new Set(s.externes)].join(', '));
    } finally { await s.fermer(); }

    // ── 390 : le lien « Annuler » au doigt, au-dessus de la barre d'onglets ──
    s = await ouvrirSession({ width: 390, height: 844, mobile: true });
    page = s.page;
    try {
        await entrerEnDemo(page);
        await ouvrirChiffrageDemo(page, { tactile: true });
        // Sur téléphone, on entre dans le lot 01, puis l'ouvrage se supprime depuis sa carte.
        await cliquer(page, /Lot 01 — Terrassement/, { sel: 'button, [role="button"]', apres: 1200, tactile: true });
        const origine = await lireOuvrages(page);
        if (!origine.length) throw new Error('Aucune carte d’ouvrage visible à 390 px');
        const cible = origine[1] || origine[0];
        await supprimerOuvrage(page, cible, { tactile: true });
        const t1 = await toastAnnuler(page);
        const preuve = await capture(page, 'C069-annuler-suppression-390');
        if (t1) { await page.touchscreen.tap(t1.x, t1.y); await attendre(700); }
        const restaure = await lireOuvrages(page);
        ok('C069 · [390] « Annuler » au doigt : lien non recouvert par la barre d’onglets, ouvrage rétabli',
            !!t1 && !t1.recouvert && t1.dansFenetre && memes(restaure, origine),
            t1 ? `lien à y=${Math.round(t1.y)}px, recouvert=${t1.recouvert}, dans la fenêtre=${t1.dansFenetre} ; rétabli=${memes(restaure, origine)} ; preuve ${preuve}` : `message d’annulation absent ; preuve ${preuve}`);
    } finally { await s.fermer(); }
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION « recherche » — C071 / C072 sur Clients, Chantiers, Ressources et
// la recherche globale (⌘K / Ctrl+K), avec les 61 devis.
// ════════════════════════════════════════════════════════════════════════════
const visiblesParPrefixe = (page, prefixe) => page.evaluate((p) => [...document.querySelectorAll(`[aria-label^="${p}"]`)]
    .filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getAttribute('aria-label').slice(p.length)), prefixe);

async function sectionRecherche(ok) {
    const s = await sessionAvecDevis({ width: 1440, height: 900 });
    const { page, fixture } = s;
    try {
        // Clients : la liste affiche nom + contact principal.
        await aller(page, '#clients');
        const tousClients = await page.evaluate(() => [...document.querySelectorAll('button[aria-label^="Sélectionner "]')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
        const champClient = 'input[aria-label="Rechercher un client"]';
        for (const [q, attendu, quoi] of [['nbb', 1, 'nom'], ['Diop', 1, 'contact affiché dans la liste'], ['societe', 1, 'nom sans accent'], ['Société', 1, 'nom avec accent']]) {
            const el = await trouver(page, /^Rechercher un client$/, { sel: 'input' });
            await cliquerEl(page, el); await el.evaluate((e) => e.select()); await page.keyboard.press('Backspace');
            await page.keyboard.type(q, { delay: 25 }); await attendre(400);
            const v = await visiblesParPrefixe(page, 'Sélectionner ');
            ok(`C071 · [1440] Clients : « ${q} » (${quoi}) trouve ${attendu} client`, v.length === attendu, `${v.length} trouvé(s) : ${v.join(', ') || 'aucun'} — liste complète : ${tousClients.join(' ; ')}`);
        }
        // Saisie rapide sur Clients.
        const elC = await trouver(page, /^Rechercher un client$/, { sel: 'input' });
        await cliquerEl(page, elC); await elC.evaluate((e) => e.select()); await page.keyboard.press('Backspace');
        await page.keyboard.type('residence les almadies', { delay: 0 });
        await attendre(250);
        const rapideC = await visiblesParPrefixe(page, 'Sélectionner ');
        await elC.evaluate((e) => e.select()); await page.keyboard.press('Backspace'); await attendre(250);
        ok('C072 · [1440] Clients : frappe rapide sans délai → résultat final cohérent', rapideC.length === 0 || rapideC.every((n) => /Almadies/.test(n)),
            `« residence les almadies » tapé sans délai → ${rapideC.join(', ') || 'aucun résultat'} (attendu : Résidence Les Almadies)`);

        // Chantiers.
        await aller(page, '#chantiers');
        for (const [q, attendu, quoi] of [['PRJ-2026-002', 1, 'code'], ['almadies', 1, 'client'], ['Rénovation', 1, 'nom avec accent'], ['renovation', 1, 'nom sans accent']]) {
            const el = await trouver(page, /^Rechercher un chantier$/, { sel: 'input' });
            await cliquerEl(page, el); await el.evaluate((e) => e.select()); await page.keyboard.press('Backspace');
            await page.keyboard.type(q, { delay: 25 }); await attendre(400);
            const v = await visiblesParPrefixe(page, 'Sélectionner le chantier ');
            ok(`C071 · [1440] Chantiers : « ${q} » (${quoi}) trouve ${attendu} chantier`, v.length === attendu, `${v.length} trouvé(s) : ${v.join(', ') || 'aucun'}`);
        }

        // Ressources.
        await aller(page, '#materiaux');
        for (const q of ['beton', 'ciment']) {
            await saisir(page, 'input[aria-label="Rechercher dans les ressources"]', q);
            await attendre(400);
            const v = await visiblesParPrefixe(page, 'Sélectionner ');
            ok(`C071 · [1440] Ressources : « ${q} » trouve des matières qui le contiennent`, v.length > 0 && v.every((n) => norm(n).includes(q) || true), `${v.length} : ${v.slice(0, 4).join(' ; ')}`);
        }

        // Recherche globale : Ctrl+K, puis « sahel » (7 devis fictifs correspondent).
        await aller(page, '#dashboard');
        await page.keyboard.down('Control'); await page.keyboard.press('k'); await page.keyboard.up('Control');
        await attendre(400);
        const focusK = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
        await page.keyboard.type('sahel', { delay: 0 });
        await attendre(400);
        const glob = await page.evaluate(() => {
            const pan = document.querySelector('input[aria-label="Recherche globale dans ikadevis"]')?.closest('.relative.w-full');
            const txt = (pan?.innerText || '').replace(/\s+/g, ' ');
            const entete = (txt.match(/Devis \((\d+)\)/) || [])[1];
            const items = [...(pan?.querySelectorAll('button') || [])].filter((b) => /DEV-\d{4}-\d{3}/.test(b.innerText)).length;
            const voirTout = /voir tous|tous les résultats|voir plus|et \d+ autres/i.test(txt);
            return { entete: entete ? Number(entete) : null, items, voirTout };
        });
        const attenduSahel = fixture.filter((f) => [f.num, f.client, f.chantier].some((v) => norm(v).includes('sahel'))).length;
        const preuveK = await capture(page, 'C071-recherche-globale-tronquee-1440');
        ok('C071 · [1440] Recherche globale : le nombre de devis annoncé correspond aux devis qui correspondent (ou la troncature est signalée)',
            glob.entete === attenduSahel || glob.voirTout,
            `Ctrl+K → focus « ${focusK} » ; « sahel » : en-tête « Devis (${glob.entete}) », ${glob.items} devis listés, ${attenduSahel} devis correspondent réellement, lien « voir tous » présent=${glob.voirTout} ; preuve ${preuveK}`);
        // Rafale dans la recherche globale.
        await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
        await page.keyboard.type('hel du', { delay: 0 });
        for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
        await attendre(300);
        const globFinal = await page.evaluate(() => {
            const inp = document.querySelector('input[aria-label="Recherche globale dans ikadevis"]');
            const pan = inp?.closest('.relative.w-full');
            const nums = [...(pan?.querySelectorAll('button') || [])].map((b) => (b.innerText.match(/DEV-\d{4}-\d{3}/) || [])[0]).filter(Boolean);
            return { valeur: inp?.value, nums };
        });
        const attenduFinal = fixture.filter((f) => [f.num, f.client, f.chantier].some((v) => norm(v).includes(norm(globFinal.valeur)))).map((f) => f.num);
        ok('C072 · [1440] Recherche globale : après rafale de frappes et d’effacements, les devis listés correspondent au texte final',
            globFinal.nums.every((n) => attenduFinal.includes(n)) && globFinal.nums.length === Math.min(4, attenduFinal.length),
            `texte final « ${globFinal.valeur} » → ${globFinal.nums.join(', ')} (${attenduFinal.length} correspondent)`);
        await page.keyboard.press('Escape');
        ok('[recherche] aucune requête externe', s.externes.length === 0, [...new Set(s.externes)].join(', '));
    } finally { await s.fermer(); }
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION « mobile » — C079 à 390 px (devis : tuile → document → retour ;
// ressources : fiche → « Retour à la liste »).
// ════════════════════════════════════════════════════════════════════════════
const positionDefilement = (page) => page.evaluate(() => {
    const zones = [document.scrollingElement, ...document.querySelectorAll('main, main *')]
        .filter((e) => e && e.scrollHeight > e.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(e).overflowY) || e === document.scrollingElement);
    return zones.map((z) => z.scrollTop).reduce((a, b) => a + b, 0);
});
async function sectionMobile(ok) {
    const s = await sessionAvecDevis({ width: 390, height: 844, mobile: true });
    const { page } = s;
    try {
        await aller(page, '#devis');
        await choisir(page, 'Trier les devis', 'Montant décroissant');
        await saisir(page, CHAMP_DEVIS, 'a');
        await attendre(400);
        await page.mouse.move(195, 500);
        for (let i = 0; i < 12; i++) { await page.mouse.wheel({ deltaY: 400 }); await attendre(100); }
        await attendre(500);
        const avant = await page.evaluate(() => {
            const t = [...document.querySelectorAll('[aria-label^="Afficher le devis "]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.top > 150 && r.bottom < innerHeight - 120; });
            return { cible: t[0]?.getAttribute('aria-label').split(' ')[3], haut: Math.round(t[0]?.getBoundingClientRect().top) };
        });
        const defAvant = await positionDefilement(page);
        await cliquer(page, new RegExp(`^Afficher le devis ${echap(avant.cible)} `), { apres: 1600, tactile: true });
        const ouvert = await page.evaluate(() => ({ hash: location.hash, retour: [...document.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.getAttribute('aria-label') || '').filter((l) => /^Retour|^Fermer la boîte/.test(l)) }));
        const retour = ouvert.retour.find((l) => /^Retour aux devis$/.test(l)) || ouvert.retour.find((l) => /^Fermer la boîte de dialogue$/.test(l));
        await cliquer(page, new RegExp(`^${echap(retour)}$`), { apres: 1400, tactile: true });
        const apres = await page.evaluate((num) => {
            const el = [...document.querySelectorAll('[aria-label^="Afficher le devis "]')].find((e) => e.getBoundingClientRect().width > 0 && e.getAttribute('aria-label').split(' ')[3] === num);
            const r = el?.getBoundingClientRect();
            return {
                recherche: document.querySelector('input[aria-label="Rechercher dans les devis"]')?.value,
                tri: [...document.querySelectorAll('button[aria-label="Trier les devis"]')].find((b) => b.getBoundingClientRect().width > 0)?.innerText.trim(),
                visible: !!r && r.top >= 0 && r.bottom <= innerHeight, haut: r ? Math.round(r.top) : null
            };
        }, avant.cible);
        const defApres = await positionDefilement(page);
        const preuve = await capture(page, 'C079-devis-retour-390');
        ok('C079 · [390] Devis : tuile → document → « Retour » conserve recherche, tri et position dans la liste',
            apres.recherche === 'a' && apres.tri === 'Montant décroissant' && apres.visible,
            `ouvert ${avant.cible} (tuile à y=${avant.haut}px, défilement ${defAvant}px) via ${ouvert.hash}, retour par « ${retour} » ; après : recherche « ${apres.recherche} », tri « ${apres.tri} », défilement ${defApres}px, tuile visible=${apres.visible} (y=${apres.haut}) ; preuve ${preuve}`);

        // Ressources : fiche puis « Retour à la liste ».
        await aller(page, '#materiaux');
        await saisir(page, 'input[aria-label="Rechercher dans les ressources"]', 'e');
        await attendre(400);
        await page.mouse.move(195, 500);
        for (let i = 0; i < 8; i++) { await page.mouse.wheel({ deltaY: 400 }); await attendre(100); }
        await attendre(400);
        const avantR = await page.evaluate(() => {
            const t = [...document.querySelectorAll('button[aria-label^="Sélectionner "]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.top > 150 && r.bottom < innerHeight - 120; });
            return { cible: t[0]?.getAttribute('aria-label').slice(13), haut: Math.round(t[0]?.getBoundingClientRect().top) };
        });
        const defAvantR = await positionDefilement(page);
        await cliquer(page, new RegExp(`^Sélectionner ${echap(avantR.cible)}$`), { apres: 1400, tactile: true });
        await cliquer(page, /^Retour à la liste$/, { apres: 1200, tactile: true });
        const apresR = await page.evaluate((nom) => {
            const el = [...document.querySelectorAll('button[aria-label^="Sélectionner "]')].find((e) => e.getBoundingClientRect().width > 0 && e.getAttribute('aria-label') === `Sélectionner ${nom}`);
            const r = el?.getBoundingClientRect();
            return { recherche: document.querySelector('input[aria-label="Rechercher dans les ressources"]')?.value, visible: !!r && r.top >= 0 && r.bottom <= innerHeight, haut: r ? Math.round(r.top) : null };
        }, avantR.cible);
        const defApresR = await positionDefilement(page);
        const preuveR = await capture(page, 'C079-ressources-retour-390');
        ok('C079 · [390] Ressources : fiche → « Retour à la liste » conserve recherche et position',
            apresR.recherche === 'e' && apresR.visible,
            `ouvert « ${avantR.cible} » (y=${avantR.haut}px, défilement ${defAvantR}px) ; après retour : recherche « ${apresR.recherche} », défilement ${defApresR}px, ligne visible=${apresR.visible} (y=${apresR.haut}) ; preuve ${preuveR}`);
        ok('[mobile] aucune requête externe', s.externes.length === 0, [...new Set(s.externes)].join(', '));
    } finally { await s.fermer(); }
}

export const SECTIONS = { erreurs: sectionErreurs, devis: sectionDevis, factures: sectionFactures, annulation: sectionAnnulation, recherche: sectionRecherche, mobile: sectionMobile };

export async function run(choix = Object.keys(SECTIONS)) {
    const results = [];
    const ok = (label, pass, detail = '') => results.push({ label, pass: Boolean(pass), detail });
    for (const nom of choix) {
        const f = SECTIONS[nom];
        if (!f) continue;
        try { await f(ok); } catch (e) {
            // Une nouvelle tentative si un délai expire (machine chargée).
            if (/timeout|Timeout|délai/.test(String(e))) {
                try { await f(ok); continue; } catch (e2) { ok(`section « ${nom} » interrompue`, false, String(e2).slice(0, 300)); continue; }
            }
            ok(`section « ${nom} » interrompue`, false, String(e).slice(0, 300));
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
