#!/usr/bin/env node
// Audit UX 220 — Lot 6 : défauts relevés par la seconde revue adversariale et
// corrigés après coup.
//   E10  « Retour » du navigateur quittait un chiffrage non enregistré sans
//        poser la question de la barre latérale.
//   E11  Les cartes d'indicateurs du tableau de bord étaient remontées à
//        chaque rendu : le focus clavier retombait sur <body>.
//   E3   Quittance ouverte par-dessus la facture : les deux documents
//        sortaient superposés à l'impression.
// Mode Démo, données fictives, serveur local isolé : toute requête vers un
// autre hôte que 127.0.0.1 est bloquée.
import puppeteer from 'puppeteer';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { startServer } from '../../scratch/lib/server.mjs';
import { enterGuestMode, addCatalogItemBySearch } from '../../scratch/lib/harness.mjs';

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
async function cliquer(page, re, racine = 'button, [role="button"]') {
    const ok = await page.evaluate((src, sel) => {
        const r = new RegExp(src);
        const el = [...document.querySelectorAll(sel)].filter((x) => x.getBoundingClientRect().width > 0)
            .find((x) => r.test((x.getAttribute('aria-label') || x.innerText || '').replace(/\s+/g, ' ').trim()));
        el?.click();
        return Boolean(el);
    }, re, racine);
    if (!ok) throw new Error(`Introuvable : ${re}`);
}
const questionOuverte = (page) => page.evaluate(() => [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
    .some((d) => d.getBoundingClientRect().width > 0 && /Enregistrer le devis en cours/.test(d.innerText)));
const surLeChiffrage = (page) => page.evaluate(() => document.body.innerText.includes('LOTS DU DEVIS'));

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: Boolean(cond), detail: String(detail).slice(0, 400) });
    const { url, close: fermerServeur } = await startServer();
    const navigateur = await puppeteer.launch({ headless: true });
    try {
        const page = await navigateur.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        await preparer(page, url);

        // ── E10 : Retour depuis un chiffrage non enregistré.
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'networkidle0' });
        // Le chiffrage est ouvert comme le ferait une personne (pas dans les
        // 50 ms qui suivent l'entrée) : son adresse #chiffrage est alors
        // inscrite après #dashboard, et « Retour » reste dans l'application.
        await enterGuestMode(page, { createQuote: false });
        await attendre(1500);
        await cliquer(page, '^Nouveau devis', 'aside button');
        await page.waitForFunction(() => document.body.innerText.includes('LOTS DU DEVIS'), { timeout: 10000 });
        await attendre(500);
        await addCatalogItemBySearch(page, 'Peinture Murale');
        await attendre(400);
        const avant = await page.evaluate(() => ({ hash: location.hash, sale: document.body.innerText.includes('Modifications non enregistrées') }));
        ok(`Chiffrage modifié, adresse #chiffrage — ${JSON.stringify(avant)}`, avant.hash === '#chiffrage' && avant.sale);

        await page.evaluate(() => history.back());
        await attendre(900);
        const r1 = { question: await questionOuverte(page), chiffrage: await surLeChiffrage(page), hash: await page.evaluate(() => location.hash) };
        ok(`Retour : la question « Enregistrer le devis en cours ? » est posée, on reste sur le chiffrage — ${JSON.stringify(r1)}`,
            r1.question && r1.chiffrage && r1.hash === '#chiffrage');

        await cliquer(page, '^Annuler$');
        await attendre(600);
        const r2 = { question: await questionOuverte(page), chiffrage: await surLeChiffrage(page), hash: await page.evaluate(() => location.hash) };
        ok(`Annuler : le chiffrage et son adresse restent — ${JSON.stringify(r2)}`, !r2.question && r2.chiffrage && r2.hash === '#chiffrage');

        await page.evaluate(() => history.back());
        await attendre(900);
        const r3 = await questionOuverte(page);
        await cliquer(page, '^Ne pas enregistrer$');
        await attendre(1300);
        const r4 = await page.evaluate(() => ({ hash: location.hash, tdb: Boolean(document.querySelector('section[aria-label="Indicateurs clés"]')) }));
        ok(`Second Retour puis « Ne pas enregistrer » : tableau de bord — question=${r3} ${JSON.stringify(r4)}`, r3 && r4.hash === '#dashboard' && r4.tdb);

        // Sans modification en attente, Retour ne pose aucune question.
        await page.evaluate(() => { location.hash = '#clients'; });
        await attendre(900);
        await page.evaluate(() => history.back());
        await attendre(900);
        const r5 = await page.evaluate(() => location.hash);
        ok(`Hors chiffrage modifié, Retour reste libre — ${r5}`, r5 === '#dashboard' && !(await questionOuverte(page)));

        // ── E11 : le focus clavier reste sur la carte d'indicateur après un rendu.
        const marque = await page.evaluate(() => {
            const b = document.querySelector('section[aria-label="Indicateurs clés"] button');
            if (!b) return false;
            b.focus();
            b.dataset.sondeFocus = '1';
            return document.activeElement === b;
        });
        // Un autre onglet écrit la liste des clients : l'application l'adopte
        // et le tableau de bord est rendu de nouveau.
        await page.evaluate(() => {
            const cle = 'costcalc:guest:clients';
            const valeur = JSON.stringify([{ id: 'c-onglet', name: 'Client écrit par un autre onglet' }]);
            localStorage.setItem(cle, valeur);
            window.dispatchEvent(new StorageEvent('storage', { key: cle, newValue: valeur, storageArea: localStorage }));
        });
        await attendre(500);
        const focus = await page.evaluate(() => ({
            garde: document.activeElement?.dataset?.sondeFocus === '1',
            balise: document.activeElement?.tagName
        }));
        ok(`Carte d'indicateur : le focus survit à un nouveau rendu — ${JSON.stringify({ marque, ...focus })}`, marque && focus.garde);

        // Écrit une liste comme le ferait un autre onglet : l'application
        // l'adopte sans rechargement (C158), ce qui évite de rejouer l'entrée.
        const ecrireCommeAutreOnglet = (cle, valeur) => page.evaluate((k, v) => {
            localStorage.setItem(k, v);
            window.dispatchEvent(new StorageEvent('storage', { key: k, newValue: v, storageArea: localStorage }));
        }, cle, JSON.stringify(valeur));
        const carteFacture = () => page.evaluate(() => {
            const cartes = [...document.querySelectorAll('section[aria-label="Indicateurs clés"] > *')];
            return (cartes.find((c) => /Total facturé/i.test(c.textContent)) || {}).textContent || '';
        });

        // ── Avoir : « Reste à encaisser » déduit l'avoir émis sur la facture.
        const factureEmise = { type: 'facture', id: 'f_emise', numero: 'FACT-2026-091', statut: 'issued', clientName: 'Atelier Diallo', dateEmission: new Date().toISOString(), totalHT: 150000, totalTva: 27000, totalTTC: 177000, netAPayerTTC: 177000, montantRegle: 0, lignes: [], companyInfoSnapshot: { currency: 'FCFA' } };
        await ecrireCommeAutreOnglet('costcalc:guest:invoices', [factureEmise]);
        await attendre(500);
        const sansAvoir = await carteFacture();
        await ecrireCommeAutreOnglet('costcalc:guest:invoices', [factureEmise, { type: 'avoir', id: 'a_1', numero: 'AV-2026-001', statut: 'issued', clientName: 'Atelier Diallo', correctsInvoiceId: 'f_emise', correctsInvoiceNumber: 'FACT-2026-091', totalTTC: 177000, netAPayerTTC: 177000, montantRegle: 0, lignes: [] }]);
        await attendre(500);
        const avecAvoir = await carteFacture();
        ok(`Avoir total : plus rien à encaisser (témoin sans avoir : 177 000 dus) — sans « ${sansAvoir} » / avec « ${avecAvoir} »`,
            /Reste à encaisser\s*:\s*177/.test(sansAvoir) && !/Reste à encaisser/.test(avecAvoir));

        // ── Carte « Devis à suivre » : la liste ouverte n'hérite pas d'une
        //    recherche restée active dans « Mes devis ».
        await page.evaluate(() => { location.hash = '#devis'; });
        await attendre(1200);
        const champRecherche = 'input[placeholder="Rechercher un devis, client ou chantier…"]';
        await page.type(champRecherche, 'zzz-introuvable');
        await attendre(300);
        await page.evaluate(() => { location.hash = '#dashboard'; });
        await attendre(1200);
        await page.evaluate(() => [...document.querySelectorAll('section[aria-label="Indicateurs clés"] button')]
            .find((b) => /Devis à suivre/i.test(b.textContent))?.click());
        await attendre(1200);
        const apresCarte = await page.evaluate((sel) => ({ hash: location.hash, recherche: document.querySelector(sel)?.value }), champRecherche);
        ok(`Carte « Devis à suivre » : « Mes devis » ouvert sans la recherche précédente — ${JSON.stringify(apresCarte)}`,
            /^#devis/.test(apresCarte.hash) && apresCarte.recherche === '');

        // ── Signature : le nom proposé est celui du client du devis ouvert,
        //    pas celui saisi pour le devis précédent.
        const devis = await page.evaluate(() => JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]'));
        if (devis[0]) {
            await ecrireCommeAutreOnglet('costcalc:guest:savedQuotes', [devis[0], { ...devis[0], id: 902, serverId: null, number: 'DEV-2026-902', clientId: null, clientName: 'Atelier Diallo' }]);
            await attendre(400);
        }
        const nomSignataire = async (id) => {
            await page.evaluate((i) => { location.hash = `#devis/${i}`; }, id);
            await attendre(1300);
            await cliquer(page, '^Signer le devis$');
            await attendre(700);
            return page.evaluate(() => document.getElementById('signataire-nom')?.value);
        };
        const nomA = await nomSignataire(devis[0]?.id);
        await page.focus('#signataire-nom');
        await page.keyboard.type(' — Témoin');
        await page.keyboard.press('Escape');
        await attendre(600);
        const nomB = await nomSignataire(902);
        await page.keyboard.press('Escape');
        await attendre(400);
        ok(`Signer : nom repris du client de chaque devis — A « ${nomA} », B « ${nomB} »`,
            nomA === devis[0]?.clientName && nomB === 'Atelier Diallo');

        // ── E3 : impression. Chrome imprime à la largeur de la FEUILLE
        //    (~794 px en A4) : les règles responsives y basculent (le panneau
        //    de bureau d'un devis disparaît, sa copie jumelle apparaît). On
        //    marque donc à 1440 px (`beforeprint`, comme le navigateur), puis
        //    on mesure à 794 px en média « print » : une zone est imprimée si
        //    elle est affichée ET a une boîte.
        const imprimerA4 = async ({ marquer = true } = {}) => {
            if (marquer) await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
            await page.setViewport({ width: 794, height: 1123 });
            await page.emulateMediaType('print');
            await attendre(400);
            const zones = await page.evaluate(() => [...document.querySelectorAll('[data-zone-impression]')].map((z) => {
                const r = z.getBoundingClientRect();
                return { zone: z.getAttribute('data-zone-impression'), cle: z.getAttribute('data-document-cle'), imprimee: getComputedStyle(z).display !== 'none' && r.width > 0 && r.height > 0 };
            }));
            await page.emulateMediaType('screen');
            await page.setViewport({ width: 1440, height: 900 });
            if (marquer) await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
            await attendre(400);
            return { zones, imprimees: zones.filter((z) => z.imprimee).map((z) => z.cle) };
        };

        await page.evaluate(() => {
            const base = { type: 'facture', tauxTva: 18, deduitTTC: 0, lignes: [{ designation: 'Maçonnerie', quantite: 1, unite: 'm³', prixUnitaireHT: 150000, totalHT: 150000 }], companyInfoSnapshot: { currency: 'FCFA', name: 'IKADEVIS BTP' } };
            localStorage.setItem('costcalc:guest:invoices', JSON.stringify([
                { ...base, id: 'f_reglee', numero: 'FACT-2026-090', statut: 'paid', clientName: 'Atelier Diallo', dateEmission: '2026-09-01T10:00:00.000Z', totalHT: 150000, totalTva: 27000, totalTTC: 177000, netAPayerTTC: 177000, montantRegle: 177000, payments: [{ id: 'p1', date: '2026-09-02', montant: 177000, mode: 'virement' }] }
            ]));
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await enterGuestMode(page, { createQuote: false });
        await attendre(1500);

        // Devis ouvert sur écran large : deux copies dans le DOM (panneau de
        // bureau + fenêtre mobile). Le défaut relevé par la troisième revue :
        // page blanche, aucune des deux ne gardait de boîte à 794 px.
        const idDevis = devis[0]?.id;
        await page.evaluate((i) => { location.hash = `#devis/${i}`; }, idDevis);
        await attendre(1500);
        const devisA4 = await imprimerA4();
        ok(`Devis ouvert sur écran large, imprimé en A4 : une page, le devis — ${JSON.stringify(devisA4.imprimees)}`,
            devisA4.imprimees.length === 1 && devisA4.imprimees[0] === `devis:${idDevis}`);

        // Retour/adresse vers les factures : la fiche devis ne reste pas
        // ouverte en coulisse (elle recouvrait l'écran sur téléphone).
        await page.evaluate(() => { location.hash = '#factures/f_reglee'; });
        await attendre(1500);
        const ficheRestee = await page.evaluate(() => Boolean(document.querySelector('.saved-quote-detail-modal.fixed')));
        ok(`Adresse vers une facture : la fiche devis n'est plus montée en coulisse — ${ficheRestee}`, !ficheRestee);

        const factureA4 = await imprimerA4();
        ok(`Facture seule, imprimée en A4 : la facture — ${JSON.stringify(factureA4.imprimees)}`,
            factureA4.imprimees.length === 1 && factureA4.imprimees[0] === 'facture:f_reglee');

        const ouverte = await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('title') === 'Imprimer / Télécharger la quittance de règlement' && x.getBoundingClientRect().width > 0);
            b?.click();
            return Boolean(b);
        });
        await attendre(800);
        const quittanceA4 = await imprimerA4();
        ok(`Quittance au premier plan, imprimée en A4 : la quittance seule — ouverte=${ouverte} ${JSON.stringify(quittanceA4.imprimees)}`,
            ouverte && quittanceA4.imprimees.length === 1 && quittanceA4.imprimees[0] === 'quittance');

        // Témoin : sans le marquage de `beforeprint`, la facture sortait aussi.
        const temoin = await imprimerA4({ marquer: false });
        ok(`Témoin sans marquage : facture et quittance s'imprimeraient ensemble — ${JSON.stringify(temoin.imprimees)}`,
            temoin.imprimees.includes('quittance') && temoin.imprimees.includes('facture:f_reglee'));

        const leve = await page.evaluate(() => !document.querySelector('[data-impression-cible], [data-impression-exclue]'));
        ok('Après impression, le marquage est levé', leve);

        // ── Téléphone : « Ajouter mon premier ouvrage » (devis vide) se
        //    touche vraiment. Constaté au rejeu des sondes : à 390 px le bouton
        //    restait sous la barre de totaux, à 360 et 320 px sous la barre
        //    d'onglets — un appui en son centre ouvrait « Aperçu PDF » ou
        //    changeait d'écran.
        //    320×568 n'est PAS vérifié ici : l'en-tête du chiffrage y occupe
        //    345 px et la zone défilante n'a que 18 px visibles entre lui et
        //    les deux barres fixes — défaut de mise en page consigné ouvert
        //    (UX-P3-07, « 320 px »), pas un simple recouvrement.
        for (const [largeur, hauteur] of [[390, 844], [360, 740]]) {
            const mobile = await navigateur.newPage();
            await mobile.setViewport({ width: largeur, height: hauteur, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
            await preparer(mobile, url);
            await mobile.evaluate(() => { localStorage.clear(); localStorage.setItem('costcalc:guest:demoQuoteOpened', 'true'); });
            await mobile.reload({ waitUntil: 'networkidle0' });
            await cliquer(mobile, '^Essayer sans compte$');
            await attendre(2500);
            await mobile.evaluate(() => { location.hash = '#chiffrage'; });
            await attendre(1800);
            const cible = await mobile.evaluate(() => {
                const b = [...document.querySelectorAll('button')].find((x) => /Ajouter mon premier ouvrage/.test(x.textContent) && x.getBoundingClientRect().width > 0);
                if (!b) return null;
                b.scrollIntoView({ block: 'center' });
                const r = b.getBoundingClientRect();
                const touche = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                return { x: r.left + r.width / 2, y: r.top + r.height / 2, haut: Math.round(r.top), bas: Math.round(r.bottom), libre: !!touche && b.contains(touche), recouvertPar: touche && !b.contains(touche) ? (touche.closest('button')?.textContent.trim().slice(0, 30) || touche.tagName) : null };
            });
            let bibliotheque = false;
            if (cible) {
                await mobile.touchscreen.tap(cible.x, cible.y);
                await attendre(1200);
                bibliotheque = await mobile.evaluate(() => Boolean(document.querySelector('input[placeholder*="Rechercher un ouvrage"]')));
            }
            ok(`Téléphone ${largeur}×${hauteur} : « Ajouter mon premier ouvrage » n'est pas recouvert, l'appui ouvre la bibliothèque — ${JSON.stringify({ ...cible, bibliotheque })}`,
                cible && cible.libre && bibliotheque);
            await mobile.close();
        }
    } finally {
        await navigateur.close();
        await fermerServeur();
    }
    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    console.log(`\nRésultats Lot 6 (revue 2) : ${results.filter((r) => r.pass).length}/${results.length} contrôles passés.`);
    process.exit(results.every((r) => r.pass) ? 0 : 1);
}
