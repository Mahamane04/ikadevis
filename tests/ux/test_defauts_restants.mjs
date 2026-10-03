#!/usr/bin/env node
// Audit UX 220 — défauts restants (UX_AUDIT.md § Défauts restants), corrigés
// par petits lots après la mise en ligne du 2026-10-03. Une section par lot.
//
// LOT A — la fiche devis sur téléphone (fenêtre plein écran sous 1024 px) :
//   - confirmations « Supprimer » / « Dupliquer » ouvertes SOUS la fiche ;
//   - « Voir la facture » qui laissait la fiche par-dessus la facture ;
//   - liste mobile et « Devis récents » : fiche ouverte sans son adresse
//     (Retour quittait « Mes devis ») — C017, C090 ;
//   - menu ⋮ : toucher à l'extérieur, Échap — C118 ;
//   - menu « Plus d'actions » de l'en-tête du chiffrage : Échap — C123 ;
//   - « Modifier client / chantier » qui chevauchait « Statut du devis » — C029.
//
// Mode Démo, données fictives, serveur local isolé : toute requête vers un
// autre hôte que 127.0.0.1 est bloquée.
import puppeteer from 'puppeteer';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { startServer } from '../../scratch/lib/server.mjs';
import { enterGuestMode } from '../../scratch/lib/harness.mjs';

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const CONFIG_FACTICE = await readFile(new URL('../../config.example.js', import.meta.url), 'utf8');

async function preparer(page, url) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const u = new URL(req.url());
        if (u.pathname === '/config.js') return req.respond({ contentType: 'application/javascript', body: CONFIG_FACTICE });
        if (/^https?:$/.test(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname)) return req.abort();
        req.continue();
    });
    await page.goto(url + '/index.html', { waitUntil: 'networkidle0' });
}
// Clique le premier élément visible dont le nom accessible ou le texte
// (insensible à la casse : certains libellés sont en capitales par CSS)
// correspond.
async function cliquer(page, source, racine = 'button, [role="button"]') {
    const ok = await page.evaluate((src, sel) => {
        const r = new RegExp(src, 'i');
        const el = [...document.querySelectorAll(sel)].filter((x) => x.getBoundingClientRect().width > 0)
            .find((x) => r.test((x.getAttribute('aria-label') || x.textContent || '').replace(/\s+/g, ' ').trim()));
        el?.click();
        return Boolean(el);
    }, source, racine);
    if (!ok) throw new Error(`Introuvable : ${source}`);
}
const aller = async (page, ancre, ms = 1500) => { await page.evaluate((a) => { location.hash = a; }, ancre); await attendre(ms); };
// L'élément est-il réellement touchable (celui que reçoit un appui en son centre) ?
const touchable = (page, selecteur) => page.evaluate((sel) => {
    const el = [...document.querySelectorAll(sel)].find((x) => x.getBoundingClientRect().width > 0);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const touche = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!touche && (el === touche || el.contains(touche));
}, selecteur);
const ficheMobileOuverte = (page) => page.evaluate(() => {
    const f = document.querySelector('.saved-quote-detail-modal.fixed');
    return Boolean(f && f.getBoundingClientRect().width > 0);
});

async function ouvrirTelephone(navigateur, url, largeur = 390, hauteur = 844) {
    const page = await navigateur.newPage();
    await page.setViewport({ width: largeur, height: hauteur, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await preparer(page, url);
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('costcalc:guest:demoQuoteOpened', 'true'); });
    await page.reload({ waitUntil: 'networkidle0' });
    await cliquer(page, '^Essayer sans compte$');
    await attendre(2500);
    return page;
}

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: Boolean(cond), detail: String(detail).slice(0, 400) });
    const { url, close: fermerServeur } = await startServer();
    const navigateur = await puppeteer.launch({ headless: true });
    try {
        // ════════════════════════ LOT A — téléphone ════════════════════════
        const tel = await ouvrirTelephone(navigateur, url);
        const devis = await tel.evaluate(() => (JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]')[0]) || null);

        // A · C017 — liste mobile : la fiche s'ouvre à son adresse, Retour la referme.
        await aller(tel, '#devis');
        await tel.evaluate(() => [...document.querySelectorAll('[data-retour-focus^="devis-"]')].find((e) => e.getBoundingClientRect().width > 0)?.click());
        await attendre(1500);
        const ouverte = { hash: await tel.evaluate(() => location.hash), fiche: await ficheMobileOuverte(tel) };
        await tel.evaluate(() => history.back());
        await attendre(1500);
        const apresRetour = { hash: await tel.evaluate(() => location.hash), fiche: await ficheMobileOuverte(tel), titre: await tel.title() };
        ok(`C017 · Téléphone : la fiche ouverte depuis la liste a son adresse, et Retour la referme sur « Mes devis » — ${JSON.stringify({ ouverte, apresRetour })}`,
            ouverte.fiche && ouverte.hash === `#devis/${devis?.id}` && !apresRetour.fiche && apresRetour.hash === '#devis' && /^Mes devis/.test(apresRetour.titre));

        // A · relecture — refermer la fiche par SON bouton « Retour » : l'adresse
        // redevient celle de la liste, et le Retour du navigateur ne rouvre pas
        // la fiche qu'on vient de fermer.
        await tel.evaluate(() => [...document.querySelectorAll('[data-retour-focus^="devis-"]')].find((e) => e.getBoundingClientRect().width > 0)?.click());
        await attendre(1500);
        await cliquer(tel, '^Retour aux devis$', '.saved-quote-detail-modal.fixed button');
        await attendre(1300);
        const fermeeAuBouton = { hash: await tel.evaluate(() => location.hash), fiche: await ficheMobileOuverte(tel) };
        await aller(tel, '#factures');
        await tel.evaluate(() => history.back());
        await attendre(1500);
        const apresFactures = { hash: await tel.evaluate(() => location.hash), fiche: await ficheMobileOuverte(tel) };
        ok(`Fiche refermée par son bouton « Retour » : adresse de la liste, et Retour du navigateur ne la rouvre pas — ${JSON.stringify({ fermeeAuBouton, apresFactures })}`,
            !fermeeAuBouton.fiche && fermeeAuBouton.hash === '#devis' && !apresFactures.fiche && apresFactures.hash === '#devis');

        // A · C119 — confirmation « Supprimer » au-dessus de la fiche.
        await aller(tel, `#devis/${devis?.id}`, 1800);
        // Boutons de la FICHE (la liste, derrière elle, a les siens).
        await cliquer(tel, '^Plus d’actions$', '.saved-quote-detail-modal.fixed button');
        await attendre(400);
        await cliquer(tel, '^Supprimer le devis ', '.saved-quote-detail-modal.fixed button');
        await attendre(700);
        const confirmation = await tel.evaluate(() => {
            const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => /Supprimer Devis/.test(x.textContent) && x.getBoundingClientRect().width > 0);
            if (!d) return null;
            const annuler = [...d.querySelectorAll('button')].find((b) => /^Annuler$/.test(b.textContent.trim()));
            const r = annuler.getBoundingClientRect();
            const touche = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return { z: Number(getComputedStyle(d).zIndex), touchable: !!touche && annuler.contains(touche) };
        });
        ok(`C119 · Téléphone : la confirmation « Supprimer » s'affiche au-dessus de la fiche devis et se touche — ${JSON.stringify(confirmation)}`,
            confirmation && confirmation.touchable === true);
        // Relecture — au clavier, Tab depuis « Annuler » atteint le bouton qui
        // confirme (le filet de focus ramenait le focus dans la fiche).
        const focusApresTab = async () => {
            await tel.keyboard.press('Tab');
            await attendre(250);
            return tel.evaluate(() => {
                const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => /Supprimer Devis/.test(x.textContent) && x.getBoundingClientRect().width > 0);
                const a = document.activeElement;
                return { dansConfirmation: !!d && d.contains(a), texte: (a?.textContent || '').trim().slice(0, 30) };
            });
        };
        const tab1 = await focusApresTab();
        const tab2 = await focusApresTab();
        ok(`Confirmation : Tab circule entre ses boutons, « Supprimer » est atteignable au clavier — ${JSON.stringify([tab1, tab2])}`,
            tab1.dansConfirmation && tab2.dansConfirmation && [tab1.texte, tab2.texte].some((t) => /^(Supprimer|Confirmer)/.test(t)) && tab1.texte !== tab2.texte);
        await cliquer(tel, '^Annuler$', '[role="dialog"] button');
        await attendre(500);
        const toujoursLa = await tel.evaluate((id) => JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]').some((q) => q.id === id), devis?.id);
        ok('C119 · « Annuler » referme la confirmation sans supprimer le devis', toujoursLa && await ficheMobileOuverte(tel));

        // A · C118 — menu ⋮ : toucher à l'extérieur, puis Échap.
        const menuOuvert = () => tel.evaluate(() => Boolean(document.querySelector('.saved-quote-mobile-more-menu')));
        await cliquer(tel, '^Plus d’actions sur le devis$');
        await attendre(400);
        const ouvert1 = await menuOuvert();
        const dehors = await tel.evaluate(() => {
            const zone = [...document.querySelectorAll('.saved-quote-detail-modal.fixed [data-zone-impression]')].find((z) => z.getBoundingClientRect().width > 0);
            const r = zone.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: Math.min(window.innerHeight - 60, Math.max(r.top + 40, 420)) };
        });
        await tel.touchscreen.tap(dehors.x, dehors.y);
        await attendre(500);
        const fermeAuToucher = !(await menuOuvert());
        await cliquer(tel, '^Plus d’actions sur le devis$');
        await attendre(400);
        const ouvert2 = await menuOuvert();
        await tel.evaluate(() => document.activeElement?.blur());
        await tel.keyboard.press('Escape');
        await attendre(500);
        const apresEchap = { menu: await menuOuvert(), fiche: await ficheMobileOuverte(tel) };
        ok(`C118 · Menu ⋮ : se ferme au toucher extérieur ; Échap ferme le menu, pas la fiche — ${JSON.stringify({ ouvert1, fermeAuToucher, ouvert2, apresEchap })}`,
            ouvert1 && fermeAuToucher && ouvert2 && !apresEchap.menu && apresEchap.fiche);
        // Relecture — focus sur un élément du menu, Échap : le focus revient au
        // bouton ⋮ de la FICHE (le panneau de bureau, masqué, a le même balisage).
        await cliquer(tel, '^Plus d’actions sur le devis$', '.saved-quote-detail-modal.fixed button');
        await attendre(400);
        await tel.evaluate(() => document.querySelector('.saved-quote-detail-modal.fixed .saved-quote-mobile-more-menu button')?.focus());
        await tel.keyboard.press('Escape');
        await attendre(500);
        const focusRendu = await tel.evaluate(() => {
            const b = document.querySelector('.saved-quote-detail-modal.fixed .saved-quote-mobile-more > button');
            return { menu: Boolean(document.querySelector('.saved-quote-mobile-more-menu')), surBouton: document.activeElement === b, actif: document.activeElement?.tagName };
        });
        ok(`C118 · Échap depuis un élément du menu ⋮ : le focus revient à son bouton — ${JSON.stringify(focusRendu)}`,
            !focusRendu.menu && focusRendu.surBouton && await ficheMobileOuverte(tel));

        // A · C029 — « Modifier client / chantier » ne recouvre pas « Statut du devis ».
        const chevauchement = async (page) => page.evaluate(() => {
            const fiche = document.querySelector('.saved-quote-detail-modal.fixed') || document;
            const a = [...fiche.querySelectorAll('button')].find((b) => /Modifier client \/ chantier/.test(b.textContent) && b.getBoundingClientRect().width > 0);
            const b = [...fiche.querySelectorAll('[aria-label="Statut du devis"]')].find((x) => x.getBoundingClientRect().width > 0);
            if (!a || !b) return null;
            const r1 = a.getBoundingClientRect(), r2 = b.getBoundingClientRect();
            const l = Math.max(0, Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left));
            const h = Math.max(0, Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top));
            return { largeur: Math.round(l), hauteur: Math.round(h), debordeEcran: r1.right > window.innerWidth + 1 };
        });
        const c390 = await chevauchement(tel);
        await tel.setViewport({ width: 320, height: 568, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
        await attendre(700);
        const c320 = await chevauchement(tel);
        await tel.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
        await attendre(500);
        const hauteurBouton = await tel.evaluate(() => {
            const fiche = document.querySelector('.saved-quote-detail-modal.fixed');
            const a = [...fiche.querySelectorAll('button')].find((b) => /Modifier client \/ chantier/.test(b.textContent) && b.getBoundingClientRect().width > 0);
            return a ? Math.round(a.getBoundingClientRect().height) : null;
        });
        ok(`« Modifier client / chantier » tient sur une ligne à 390 px (action secondaire compacte) — hauteur ${hauteurBouton} px`, hauteurBouton !== null && hauteurBouton <= 36);
        const sansRecouvrement = (c) => c && (c.largeur === 0 || c.hauteur === 0) && !c.debordeEcran;
        ok(`C029 · « Modifier client / chantier » ne chevauche plus « Statut du devis » — 390 px ${JSON.stringify(c390)} ; 320 px ${JSON.stringify(c320)}`,
            sansRecouvrement(c390) && sansRecouvrement(c320));

        // A · « Nouveau client » ouvert depuis la fiche : au-dessus d'elle.
        await cliquer(tel, 'Modifier client / chantier');
        await attendre(600);
        const champClient = await tel.evaluate(() => {
            const fiche = document.querySelector('.saved-quote-detail-modal.fixed');
            const c = [...fiche.querySelectorAll('input[role="combobox"], input')].find((i) => i.getBoundingClientRect().width > 0 && /client/i.test(i.getAttribute('aria-label') || i.placeholder || ''));
            if (!c) return false;
            c.focus();
            c.select();   // le champ porte déjà le client du devis : on le remplace
            return true;
        });
        let nouveauClient = null;
        if (champClient) {
            await tel.keyboard.type('Client créé depuis la fiche');
            await attendre(700);
            const creer = await tel.evaluate(() => {
                const b = [...document.querySelectorAll('button, [role="option"]')].find((x) => x.getBoundingClientRect().width > 0 && /^Créer /.test(x.textContent.trim()));
                b?.click();
                return Boolean(b);
            });
            await attendre(900);
            nouveauClient = creer ? await touchable(tel, '#newClientForm-name') : 'option « Créer » introuvable';
        }
        ok(`Téléphone : « Nouveau client » ouvert depuis la fiche devis est au-dessus d'elle — champ client trouvé=${champClient}, champ « Nom » touchable=${nouveauClient}`,
            champClient && nouveauClient === true);
        // Relecture (P1) — le client créé depuis la fiche va au devis AFFICHÉ ;
        // le devis du chiffrage en cours (un autre devis) n'est pas touché.
        if (nouveauClient === true) {
            await cliquer(tel, '^(Créer le client|Créer)', 'button[form="newClientForm"]');
            await attendre(1200);
        }
        const devisApres = await tel.evaluate((id) => JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]').find((q) => q.id === id)?.clientName, devis?.id);
        await aller(tel, '#chiffrage', 1800);
        const clientChiffrage = await tel.evaluate(() => {
            const c = [...document.querySelectorAll('input[aria-label="Client du devis"]')].find((i) => i.getBoundingClientRect().width > 0) || document.querySelector('input[aria-label="Client du devis"]');
            return c ? c.value : null;
        });
        ok(`Client créé depuis la fiche d'un devis : il va à CE devis, pas au chiffrage en cours — devis affiché « ${devisApres} » ; chiffrage « ${clientChiffrage} »`,
            devisApres === 'Client créé depuis la fiche' && clientChiffrage !== null && clientChiffrage !== 'Client créé depuis la fiche');
        await tel.close();

        // A · « Voir la facture » referme la fiche (brouillon de facture existant).
        const tel2 = await ouvrirTelephone(navigateur, url);
        const d2 = await tel2.evaluate(() => (JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]')[0]) || null);
        await tel2.evaluate((q) => {
            const brouillon = { id: 'f_brouillon_lotA', type: 'facture', statut: 'draft', numero: null, devisId: q.id, devisNumero: q.number, clientName: q.clientName, date: new Date().toLocaleDateString('fr-FR'), totalHT: 100000, totalTva: 18000, totalTTC: 118000, netAPayerTTC: 118000, montantRegle: 0, lignes: [{ designation: 'Lot 01', quantite: 1, unite: 'lot', prixUnitaireHT: 100000, totalHT: 100000 }], companyInfoSnapshot: { currency: 'FCFA', name: 'IKADEVIS BTP' } };
            const v = JSON.stringify([brouillon]);
            localStorage.setItem('costcalc:guest:invoices', v);
            window.dispatchEvent(new StorageEvent('storage', { key: 'costcalc:guest:invoices', newValue: v, storageArea: localStorage }));
        }, d2);
        await attendre(600);
        await aller(tel2, `#devis/${d2?.id}`, 1800);
        await cliquer(tel2, '^Ouvrir la facture du devis ');
        await attendre(1800);
        const apresFacture = { fiche: await ficheMobileOuverte(tel2), titre: await tel2.title(), hash: await tel2.evaluate(() => location.hash) };
        ok(`Téléphone : « Voir la facture » referme la fiche devis et montre la facture — ${JSON.stringify(apresFacture)}`,
            !apresFacture.fiche && /^Factures/.test(apresFacture.titre) && apresFacture.hash === '#factures/f_brouillon_lotA');
        await tel2.close();

        // A · C090 et C123 — écran large.
        const page = await navigateur.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        await preparer(page, url);
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'networkidle0' });
        await enterGuestMode(page, { createQuote: false });
        await attendre(1500);
        const d3 = await page.evaluate(() => (JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]')[0]) || null);
        await aller(page, '#dashboard');
        const recent = await page.evaluate((num) => {
            const b = [...document.querySelectorAll('main button')].find((x) => x.getBoundingClientRect().width > 0 && x.textContent.includes(num) && !x.closest('section[aria-label="Indicateurs clés"]'));
            b?.click();
            return Boolean(b);
        }, d3?.number);
        await attendre(1500);
        const adresseRecent = await page.evaluate(() => location.hash);
        ok(`C090 · « Devis récents » du tableau de bord : la fiche s'ouvre à son adresse — cliqué=${recent} ${adresseRecent}`, recent && adresseRecent === `#devis/${d3?.id}`);
        // Relecture — le devis reste sélectionné ; revenu au tableau de bord
        // par la barre latérale puis rouvert : toujours son adresse, pas #devis.
        await cliquer(page, '^Tableau de bord$', 'aside button');
        await attendre(1300);
        await page.evaluate((num) => [...document.querySelectorAll('main button')].find((x) => x.getBoundingClientRect().width > 0 && x.textContent.includes(num) && !x.closest('section[aria-label="Indicateurs clés"]'))?.click(), d3?.number);
        await attendre(1500);
        const adresseRouvert = await page.evaluate(() => location.hash);
        ok(`Devis déjà sélectionné, rouvert depuis le tableau de bord : son adresse, pas celle de la liste — ${adresseRouvert}`, adresseRouvert === `#devis/${d3?.id}`);

        await aller(page, '#dashboard');
        await cliquer(page, '^Nouveau devis', 'aside button');
        await page.waitForFunction(() => document.body.innerText.includes('LOTS DU DEVIS'), { timeout: 10000 });
        await attendre(600);
        await cliquer(page, "^Plus d'actions sur le devis$");
        await attendre(400);
        const avantEchap = await page.evaluate(() => document.querySelector('button[aria-label="Plus d\'actions sur le devis"]')?.getAttribute('aria-expanded'));
        await page.keyboard.press('Escape');
        await attendre(400);
        const apresEchapChiffrage = await page.evaluate(() => {
            const b = document.querySelector('button[aria-label="Plus d\'actions sur le devis"]');
            return { expanded: b?.getAttribute('aria-expanded'), focus: document.activeElement === b, chiffrage: document.body.innerText.includes('LOTS DU DEVIS') };
        });
        ok(`C123 · Chiffrage, menu « Plus d'actions » : Échap le referme et rend le focus à son bouton — avant ${avantEchap} ; après ${JSON.stringify(apresEchapChiffrage)}`,
            avantEchap === 'true' && apresEchapChiffrage.expanded === 'false' && apresEchapChiffrage.focus && apresEchapChiffrage.chiffrage);
        // Relecture — menu ouvert, le focus part dans le champ client : le menu
        // se referme ; Échap y ferme la liste du champ et ne déplace pas le focus.
        await cliquer(page, "^Plus d'actions sur le devis$");
        await attendre(300);
        await page.focus('input[aria-label="Client du devis"]');
        await attendre(300);
        const menuApresFocus = await page.evaluate(() => document.querySelector('button[aria-label="Plus d\'actions sur le devis"]')?.getAttribute('aria-expanded'));
        await page.keyboard.type('Soc');
        await attendre(500);
        await page.keyboard.press('Escape');
        await attendre(400);
        const apresEchapChamp = await page.evaluate(() => {
            const c = document.querySelector('input[aria-label="Client du devis"]');
            return { focusDansChamp: document.activeElement === c, listeOuverte: c?.getAttribute('aria-expanded') };
        });
        ok(`C123 · Le focus quitte le menu : il se referme ; Échap dans le champ client reste au champ — menu ${menuApresFocus} ; ${JSON.stringify(apresEchapChamp)}`,
            menuApresFocus === 'false' && apresEchapChamp.focusDansChamp && apresEchapChamp.listeOuverte !== 'true');
        await page.close();
    } finally {
        await navigateur.close();
        await fermerServeur();
    }
    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    console.log(`\nDéfauts restants : ${results.filter((r) => r.pass).length}/${results.length} contrôles passés.`);
    process.exit(results.every((r) => r.pass) ? 0 : 1);
}
