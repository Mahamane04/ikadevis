// Banc d'essai — audit approfondi du 2026-09-02, défaut systémique mesuré sur
// la production : AUCUNE des 19 fenêtres modales ne gérait le focus.
//
// Mesures d'origine, boîte « Supprimer ce devis ? » ouverte :
//   • focus resté sur le lien d'évitement, tout en haut de la page ;
//   • 14 tabulations sans jamais entrer dans la fenêtre ;
//   • Échap sans effet ;
//   • ni role="dialog" ni aria-modal, donc rien d'annoncé au lecteur d'écran.
//
// Concrètement : un utilisateur au clavier ouvrait une confirmation de
// suppression et devait traverser toute l'interface pour atteindre « Annuler ».
//
// Ce banc protège le motif attendu (WAI-ARIA APG, Dialog) sur les deux
// fenêtres corrigées : la confirmation, et l'envoi d'un document.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms));

const etatFenetre = (page, selecteur) => page.evaluate((sel) => {
    const d = document.querySelector(sel);
    if (!d) return { ouverte: false };
    return {
        ouverte: true,
        role: d.getAttribute('role'),
        ariaModal: d.getAttribute('aria-modal'),
        focusDedans: d.contains(document.activeElement),
        focusSur: (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent || document.activeElement.tagName).trim().slice(0, 40)
    };
}, selecteur);

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page, { demo: true });
        await wait(2200);
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('aside button')].find((x) => (x.textContent || '').trim().startsWith('Mes devis'));
            if (b) b.click();
        });
        await wait(1800);
        await page.evaluate(() => { const tr = document.querySelector('tbody tr'); if (tr) tr.click(); });
        await wait(2200);

        // ── Fenêtre d'envoi ───────────────────────────────────────────────
        // On ACTIVE au clavier plutôt qu'avec un el.click() : appelé depuis
        // JavaScript, click() ne déplace pas le focus. Le premier jet de ce
        // banc s'y est fait prendre — il concluait que le focus ne revenait
        // pas au déclencheur, alors que le déclencheur n'avait jamais eu le
        // focus. Un vrai utilisateur, souris ou clavier, l'a toujours.
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find((x) => /^Envoyer le devis /.test(x.getAttribute('aria-label') || ''));
            if (b) b.focus();
        });
        await page.keyboard.press('Enter');
        await wait(900);
        const SEL_ENVOI = '[role="dialog"][aria-label^="Envoyer"]';
        const envoi = await etatFenetre(page, SEL_ENVOI);
        ok('Envoi — la fenêtre s’annonce comme dialogue modal',
            envoi.role === 'dialog' && envoi.ariaModal === 'true');
        ok(`Envoi — le focus entre dans la fenêtre à l’ouverture — « ${envoi.focusSur} »`, envoi.focusDedans);

        let sorties = 0;
        for (let i = 0; i < 16; i++) {
            await page.keyboard.press('Tab');
            const dedans = await page.evaluate((sel) => {
                const d = document.querySelector(sel);
                return d ? d.contains(document.activeElement) : false;
            }, SEL_ENVOI);
            if (!dedans) sorties++;
        }
        ok(`Envoi — le focus reste enfermé sur 16 tabulations — ${sorties} sortie(s)`, sorties === 0);

        await page.keyboard.press('Escape');
        await wait(600);
        ok('Envoi — Échap ferme la fenêtre',
            await page.evaluate((sel) => !document.querySelector(sel), SEL_ENVOI));
        // Le focus doit revenir au déclencheur, pas repartir en haut de page.
        ok('Envoi — le focus revient sur le bouton qui l’avait ouverte',
            await page.evaluate(() => /^Envoyer le devis /.test(document.activeElement.getAttribute('aria-label') || '')),
            await page.evaluate(() => (document.activeElement.getAttribute('aria-label') || document.activeElement.tagName).slice(0, 40)));

        // ── Boîte de confirmation ─────────────────────────────────────────
        await page.evaluate(() => {
            const b = document.querySelector('tbody tr button[aria-label^="Supprimer le devis"]');
            if (b) b.click();
        });
        await wait(800);
        const SEL_CONF = '[role="dialog"][aria-modal="true"]';
        const conf = await etatFenetre(page, SEL_CONF);
        ok('Confirmation — la boîte s’annonce comme dialogue modal',
            conf.role === 'dialog' && conf.ariaModal === 'true');
        ok(`Confirmation — le focus entre dans la boîte — « ${conf.focusSur} »`, conf.focusDedans);

        let sorties2 = 0;
        for (let i = 0; i < 10; i++) {
            await page.keyboard.press('Tab');
            const dedans = await page.evaluate((sel) => {
                const d = document.querySelector(sel);
                return d ? d.contains(document.activeElement) : false;
            }, SEL_CONF);
            if (!dedans) sorties2++;
        }
        ok(`Confirmation — le focus reste enfermé sur 10 tabulations — ${sorties2} sortie(s)`, sorties2 === 0);

        await page.keyboard.press('Escape');
        await wait(600);
        ok('Confirmation — Échap annule sans supprimer',
            await page.evaluate((sel) => !document.querySelector(sel), SEL_CONF));
        ok('Confirmation — Échap n’a rien supprimé',
            await page.evaluate(() => document.querySelectorAll('tbody tr').length > 0));
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
