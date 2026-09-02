// Banc d'essai — signalé par l'utilisateur le 2026-09-02, capture à l'appui :
// « sur la capture il n'y a pas une possibilité de supprimer aussi un devis ».
//
// Il y en avait bien une, mais une seule, et elle venait de devenir invisible :
// la veille (Lot 7 de l'audit UX) j'avais replié par défaut la bande « Actions
// du devis » — cinq boutons sur deux rangs, 117 px pris en permanence dans un
// panneau de 584 px — pour rendre la place au document. Le raisonnement tenait
// pour « Dupliquer » ou « Exporter ». Il ne tenait pas pour « Supprimer » :
// c'était le SEUL chemin de suppression de toute l'application, puisque
// `carteDevis` — l'ancienne vue en cartes qui portait une corbeille par ligne —
// n'est plus appelée nulle part depuis le passage au tableau. Sur un compte
// comptant 22 devis dont une majorité de brouillons répétés, faire le ménage
// demandait donc d'ouvrir chaque devis puis de déplier un panneau fermé.
//
// Ce banc protège la propriété, pas l'implémentation : depuis la liste des
// devis, sans rien déplier, on doit pouvoir en supprimer un.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms));

const allerAuxDevis = async (page) => {
    await page.evaluate(() => {
        const b = [...document.querySelectorAll('aside button')]
            .find((x) => (x.textContent || '').trim().startsWith('Mes devis'));
        if (b) b.click();
    });
    await wait(1600);
};

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page, { demo: true });
        await wait(2000);
        await allerAuxDevis(page);

        const avant = await page.evaluate(() => {
            const lignes = [...document.querySelectorAll('tbody tr')];
            const premiere = lignes[0];
            const corbeille = premiere && premiere.querySelector('button[aria-label^="Supprimer le devis"]');
            const r = corbeille ? corbeille.getBoundingClientRect() : null;
            return {
                nbDevis: lignes.length,
                corbeillePresente: !!corbeille,
                // Le point qui compte : elle est RENDUE, pas seulement présente
                // dans le DOM derrière un dépliant fermé ou une opacité nulle.
                corbeilleVisible: !!r && r.width > 0 && r.height > 0
                    && getComputedStyle(corbeille).opacity !== '0'
                    && getComputedStyle(corbeille).visibility !== 'hidden',
                etiquette: corbeille ? corbeille.getAttribute('aria-label') : null
            };
        });

        ok(`La liste contient des devis à supprimer — ${avant.nbDevis}`, avant.nbDevis > 0);
        ok('Chaque ligne porte une commande de suppression', avant.corbeillePresente);
        ok('Elle est réellement visible, sans survol ni dépliant',
            avant.corbeilleVisible, `aria-label=« ${avant.etiquette} »`);

        // Elle doit ouvrir une confirmation — et ne PAS ouvrir le devis derrière.
        const apresClic = await page.evaluate(() => {
            const avantVue = document.body.innerText.slice(0, 200);
            const b = document.querySelector('tbody tr button[aria-label^="Supprimer le devis"]');
            if (b) b.click();
            return { avantVue };
        });
        await wait(700);
        const dialogue = await page.evaluate(() => {
            const t = document.body.innerText;
            return {
                confirmationOuverte: /Supprimer ce devis/.test(t),
                nommeLeDevis: /DEV-|Devis/.test(t),
                boutonConfirmer: [...document.querySelectorAll('button')]
                    .some((x) => (x.textContent || '').trim() === 'Supprimer')
            };
        });
        ok('Le clic demande confirmation au lieu de supprimer sèchement', dialogue.confirmationOuverte);
        ok('La confirmation propose un bouton « Supprimer »', dialogue.boutonConfirmer);

        // Et la suppression aboutit réellement.
        const nb = avant.nbDevis;
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === 'Supprimer');
            if (b) b.click();
        });
        await wait(1200);
        const apres = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
        ok(`Le devis est bien retiré de la liste — ${nb} → ${apres}`, apres === nb - 1);
        void apresClic;
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
