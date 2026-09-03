// Banc d'essai — éditeur de modèles de document, étape 1 (2026-09-03).
//
// L'éditeur reprend la structure de Zoho Books — rail de sections, contrôles à
// gauche, document à droite — avec une différence assumée : l'aperçu est
// CONTINU. Zoho impose un bouton « Actualiser l'aperçu » parce qu'il rend le
// document côté serveur ; ikadevis le rend dans la page, rien n'oblige à
// l'aller-retour.
//
// Deux propriétés comptent plus que le reste, et ce banc les protège :
//
//  1. L'aperçu appelle le MÊME composant que le panneau de détail
//     (`DocumentDevisClient`). Un rendu séparé « pour l'aperçu » recréerait le
//     défaut relevé pendant l'audit : deux sources de vérité qui divergent, et
//     un aperçu qui promet autre chose que le PDF envoyé au client.
//
//  2. Enregistrer change RÉELLEMENT le document. Un éditeur dont on ressort
//     sans effet visible est pire qu'une absence d'éditeur.
//
// Ce que le banc ne couvre pas, et qui est volontaire : les réglages absents de
// l'étape 1 (titres, masquage des blocs, colonnes du tableau). Ils ne sont pas
// exposés comme des interrupteurs sans effet — chaque section le dit en clair.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 900) => new Promise((r) => setTimeout(r, ms));
const SEL = '[role="dialog"][aria-label*="modèle"]';

const cliquer = (page, motif) => page.evaluate((t) => {
    const b = [...document.querySelectorAll('button')]
        .filter((x) => x.getBoundingClientRect().width > 0)
        .find((x) => new RegExp(t, 'i').test(x.textContent || ''));
    if (b) b.click();
    return !!b;
}, motif);

const couleurTitreDocument = (page, dansEditeur) => page.evaluate((sel) => {
    const racine = sel ? document.querySelector(sel) : document;
    if (!racine) return null;
    const t = [...racine.querySelectorAll('h2')].find((h) => /DEVIS|ÉTUDE/.test(h.textContent || ''));
    return t ? getComputedStyle(t).color : null;
}, dansEditeur ? SEL : null);

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1600, height: 960 });
        await enterGuestMode(page, { demo: true });
        await wait(2400);

        ok('Les paramètres s’ouvrent', await cliquer(page, 'Paramètres du Compte'));
        await wait(1700);
        ok('L’onglet Documents existe', await cliquer(page, 'Documents'));
        await wait(1700);
        ok('L’éditeur de modèles est proposé', await cliquer(page, 'Éditeur de modèles'));
        await wait(2200);

        // Depuis l'étape 3, ce bouton ouvre la GALERIE : atterrir directement
        // dans un modèle cacherait les autres. On y entre par « Nouveau ».
        const entrerDansLEditeur = async () => {
            const dejaOuvert = await page.evaluate((sel) => !!document.querySelector(sel), SEL);
            if (dejaOuvert) return true;
            const clique = await page.evaluate(() => {
                const g = document.querySelector('[role="dialog"][aria-label*="Modèles"]');
                if (!g) return false;
                const b = [...g.querySelectorAll('button')]
                    .find((x) => /Nouveau modèle|Créer un premier modèle/.test(x.textContent || ''));
                if (b) { b.click(); return true; }
                return false;
            });
            await wait(2000);
            return clique;
        };
        ok('La galerie mène à l’éditeur', await entrerDansLEditeur());
        await wait(1200);

        const ouverture = await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            if (!d) return { ouvert: false };
            return {
                ouvert: true,
                sections: [...d.querySelectorAll('nav button')].map((b) => b.innerText.trim()),
                documentRendu: !!d.querySelector('[data-zone-impression]'),
                aBoutonActualiser: /Actualiser l’aperçu|Actualiser l'aperçu/i.test(d.innerText)
            };
        }, SEL);

        ok('L’éditeur s’ouvre en plein écran', ouverture.ouvert);
        ok(`Le rail porte les six sections — ${JSON.stringify(ouverture.sections)}`,
            (ouverture.sections || []).length === 6);
        ok('L’aperçu rend le VRAI document, pas une vignette', ouverture.documentRendu);
        ok('Aucun bouton « Actualiser l’aperçu » : le rendu est continu', !ouverture.aBoutonActualiser);

        // ── Continuité : le document suit la frappe ───────────────────────
        const avant = await couleurTitreDocument(page, true);
        await page.evaluate((sel) => {
            // Le sélecteur DOIT être celui de l'éditeur : un autre existe dans
            // les paramètres, derrière l'overlay — s'y tromper fait conclure à
            // tort que l'aperçu est inerte.
            const d = document.querySelector(sel);
            const i = [...d.querySelectorAll('input[type="color"]')][0];
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(i, '#0f766e');
            i.dispatchEvent(new Event('input', { bubbles: true }));
        }, SEL);
        await wait(900);
        const apres = await couleurTitreDocument(page, true);
        ok(`L’aperçu suit la couleur sans bouton — ${avant} → ${apres}`,
            apres === 'rgb(15, 118, 110)' && apres !== avant);

        // ── L'enregistrement change le document réel ──────────────────────
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const b = [...d.querySelectorAll('button')].find((x) => /^Enregistrer$/.test(x.textContent.trim()));
            if (b) b.click();
        }, SEL);
        await wait(2500);
        ok('L’éditeur se ferme après enregistrement',
            await page.evaluate((sel) => !document.querySelector(sel), SEL));

        await cliquer(page, 'Fermer');
        await wait(1200);
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('aside button')].find((x) => (x.textContent || '').trim().startsWith('Mes devis'));
            if (b) b.click();
        });
        await wait(1800);
        await page.evaluate(() => { const tr = document.querySelector('tbody tr'); if (tr) tr.click(); });
        await wait(2500);

        const reel = await couleurTitreDocument(page, false);
        ok(`Le document réel a pris la couleur enregistrée — ${reel}`, reel === 'rgb(15, 118, 110)');

        // ── Étape 2 : le document LIT le modèle ───────────────────────────
        await cliquer(page, 'Paramètres du Compte');
        await wait(1700);
        await cliquer(page, 'Documents');
        await wait(1700);
        await cliquer(page, 'Éditeur de modèles');
        await wait(2200);
        await entrerDansLEditeur();
        await wait(1200);
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const b = [...d.querySelectorAll('nav button')].find((x) => /Tableau/.test(x.innerText));
            if (b) b.click();
        }, SEL);
        await wait(1500);

        const lireTableau = () => page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const t = d.querySelector('[data-zone-impression] table');
            if (!t) return { absent: true };
            return {
                entetes: [...t.querySelectorAll('thead th')].map((h) => h.textContent.trim()),
                colSpans: [...new Set([...t.querySelectorAll('tbody td[colspan]')].map((c) => +c.getAttribute('colspan')))].sort()
            };
        }, SEL);

        const avantColonne = await lireTableau();
        ok(`Le tableau part de quatre colonnes — ${JSON.stringify(avantColonne.entetes)}`,
            (avantColonne.entetes || []).length === 4);

        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const cb = [...d.querySelectorAll('input[type="checkbox"]')]
                .find((x) => /Prix Unitaire/i.test(x.getAttribute('aria-label') || ''));
            if (cb) cb.click();
        }, SEL);
        await wait(1200);
        const apresColonne = await lireTableau();
        ok(`Masquer une colonne la retire du document — ${(apresColonne.entetes || []).length} colonnes`,
            (apresColonne.entetes || []).length === 3);
        // Le point qui casse en silence : les lignes pleine largeur (en-tête de
        // lot, sous-total) portent un colSpan. Figé à 4, il déborde du tableau
        // dès qu'une colonne disparaît.
        ok(`Les colSpan suivent — ${JSON.stringify(avantColonne.colSpans)} → ${JSON.stringify(apresColonne.colSpans)}`,
            JSON.stringify(apresColonne.colSpans) === JSON.stringify([2, 3]));

        // ── Le focus ne doit pas sauter à chaque frappe ───────────────────
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const b = [...d.querySelectorAll('nav button')].find((x) => /Document/.test(x.innerText));
            if (b) b.click();
        }, SEL);
        await wait(1400);
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const i = [...d.querySelectorAll('input[type="text"]')].find((x) => /DEVIS COMMERCIAL/.test(x.placeholder || ''));
            if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
        }, SEL);
        await page.keyboard.type(' MODIFIÉ', { delay: 80 });
        await wait(700);
        const saisie = await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const i = [...d.querySelectorAll('input[type="text"]')].find((x) => /DEVIS COMMERCIAL/.test(x.placeholder || ''));
            return { champ: i.value, focusConserve: document.activeElement === i,
                     apercu: (d.querySelector('[data-zone-impression] h2') || {}).textContent };
        }, SEL);
        // Avant correction, taper « ABC » ne laissait que « A » : les fabriques
        // Bascule/Texte étaient déclarées dans le rendu, donc React créait un
        // TYPE de composant neuf à chaque frappe et remontait le champ.
        ok(`La saisie n’est pas coupée au premier caractère — « ${saisie.champ} »`,
            saisie.champ === 'DEVIS COMMERCIAL MODIFIÉ');
        ok('Le champ garde le focus pendant la frappe', saisie.focusConserve);
        ok(`Le titre saisi apparaît dans le document — « ${saisie.apercu} »`,
            saisie.apercu === 'DEVIS COMMERCIAL MODIFIÉ');

        // ── Étape 3 : galerie et filigrane de statut ──────────────────────
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const b = [...d.querySelectorAll('button')].find((x) => /^Fermer$/.test(x.textContent.trim()));
            if (b) b.click();
        }, SEL);
        await wait(1600);

        const galerie = await page.evaluate(() => {
            const d = document.querySelector('[role="dialog"][aria-label*="Modèles"]');
            if (!d) return { ouverte: false };
            return {
                ouverte: true,
                titre: /Modèles de devis/.test(d.innerText),
                nouveau: [...d.querySelectorAll('button')].some((b) => /Nouveau modèle/.test(b.textContent))
            };
        });
        ok('Fermer l’éditeur ramène à la galerie, pas au néant', galerie.ouverte);
        ok('La galerie annonce les modèles de devis', galerie.titre && galerie.nouveau);

        await page.evaluate(() => {
            const d = document.querySelector('[role="dialog"][aria-label*="Modèles"]');
            const b = [...d.querySelectorAll('button')].find((x) => /^Fermer$/.test(x.textContent.trim()));
            if (b) b.click();
        });
        await wait(1200);

        // Le filigrane : rien sur un devis approuvé, un bandeau sur un brouillon.
        // C'est la règle qui compte — un tampon décoratif sur tous les documents
        // n'alerterait plus personne.
        const tampon = (page) => page.evaluate(() => {
            const z = document.querySelector('[data-zone-impression]');
            const t = z && z.querySelector('.fa-stamp');
            return { present: !!t, libelle: t ? t.parentElement.innerText.trim() : null };
        });

        const ouvrirPremierDevis = async () => {
            await page.evaluate(() => {
                const b = [...document.querySelectorAll('aside button')].find((x) => (x.textContent || '').trim().startsWith('Mes devis'));
                if (b) b.click();
            });
            await wait(1800);
            await page.evaluate(() => { const tr = document.querySelector('tbody tr'); if (tr) tr.click(); });
            await wait(2400);
        };

        await ouvrirPremierDevis();
        const approuve = await tampon(page);
        ok('Un devis approuvé ne porte aucun filigrane', !approuve.present);

        await page.evaluate(() => {
            const l = JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]');
            if (l[0]) { l[0].status = 'draft'; localStorage.setItem('costcalc:guest:savedQuotes', JSON.stringify(l)); }
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await wait(1500);
        await enterGuestMode(page, { demo: false });
        await wait(2400);
        await ouvrirPremierDevis();
        const brouillon = await tampon(page);
        ok(`Un brouillon porte son statut — « ${brouillon.libelle} »`,
            brouillon.present && brouillon.libelle === 'BROUILLON');
    } finally {
        await close();
    }

    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    process.exit(results.every((r) => r.pass) ? 0 : 1);
}
