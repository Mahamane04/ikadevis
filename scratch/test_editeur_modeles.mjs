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
