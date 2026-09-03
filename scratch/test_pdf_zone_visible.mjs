// Banc d'essai — signalé en production le 2026-09-02 : « Télécharger le PDF »
// échouait avec « Génération impossible : Le document n'a pas pu être rendu
// pour le PDF ».
//
// Cause : quand un devis est ouvert, DEUX éléments portent data-zone-impression — le
// panneau de détail desktop, et la copie mobile de la modale, cachée par
// `lg:hidden` mais bien présente dans le DOM. `getElementById` renvoie la
// PREMIÈRE, et c'est l'invisible. Mesuré sur la production au moment du
// signalement : 0 × 0 px pour celle que le code prenait, 662 × 640 px pour la
// bonne. html2canvas capturait donc un élément de taille nulle et la
// validation du canvas rejetait le résultat — l'utilisateur ne pouvait pas
// sortir son devis.
//
// Le défaut n'apparaît qu'au-dessus de 1024 px (en dessous, la modale EST la
// vue affichée, donc la première zone est la bonne) et seulement depuis
// l'écran « Mes devis » — c'est pourquoi l'audit ne l'avait pas vu : il avait
// éprouvé l'aperçu depuis l'éditeur, pas depuis la liste.
//
// Ce banc vérifie la propriété qui compte : la zone retenue pour le PDF est
// celle qui a réellement une boîte à l'écran, quel que soit l'ordre du DOM.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms));

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        // ≥ 1024 px : c'est là que la copie mobile devient invisible tout en
        // restant dans le DOM.
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page, { demo: true });
        await wait(2000);

        // Depuis « Mes devis », ouvrir le devis d'exemple.
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('aside button')].find((x) => (x.textContent || '').trim().startsWith('Mes devis'));
            if (b) b.click();
        });
        await wait(1800);
        await page.evaluate(() => {
            const tr = document.querySelectorAll('tbody tr')[0];
            if (tr) tr.click();
        });
        await wait(2200);

        const zones = await page.evaluate(() => [...document.querySelectorAll('[data-zone-impression]')].map((z) => {
            const r = z.getBoundingClientRect();
            return { largeur: Math.round(r.width), hauteur: Math.round(r.height) };
        }));
        ok('Le devis est ouvert et expose au moins une zone imprimable', zones.length >= 1,
            `zones=${JSON.stringify(zones)}`);

        // La propriété centrale : la zone retenue est visible. Le test vaut que
        // le doublon existe encore ou qu'il ait été supprimé depuis.
        const retenue = await page.evaluate(() => {
            const toutes = [...document.querySelectorAll('[data-zone-impression]')];
            const visible = toutes.find((z) => {
                const r = z.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
            });
            const premiere = document.querySelector('[data-zone-impression]');
            const r = visible ? visible.getBoundingClientRect() : null;
            const rp = premiere ? premiere.getBoundingClientRect() : null;
            return {
                visibleTrouvee: !!visible,
                dimensionsVisible: r ? { l: Math.round(r.width), h: Math.round(r.height) } : null,
                premiereEstInvisible: !!rp && (rp.width === 0 || rp.height === 0),
                nbZones: toutes.length
            };
        });
        ok('Une zone imprimable réellement rendue existe',
            retenue.visibleTrouvee && retenue.dimensionsVisible.l > 0 && retenue.dimensionsVisible.h > 0,
            `dimensions=${JSON.stringify(retenue.dimensionsVisible)}`);

        if (retenue.nbZones > 1 && retenue.premiereEstInvisible) {
            ok('Le piège d\'origine est bien présent : la PREMIÈRE zone du DOM est invisible',
                true, `${retenue.nbZones} zones, la première mesure 0 px`);
        }

        // L'ordre du DOM dépend de la vue et de la configuration : en local, la
        // zone visible arrive parfois en premier, et le piège ne se déclenche
        // pas. On force donc l'état exact observé en production — première zone
        // présente mais de taille nulle — pour éprouver réellement le correctif
        // plutôt que de compter sur un ordre favorable.
        if (retenue.nbZones > 1) {
            await page.evaluate(() => {
                const premiere = document.querySelector('[data-zone-impression]');
                if (premiere) { premiere.dataset.testMasque = '1'; premiere.style.display = 'none'; }
            });
            await wait(300);
            const forcee = await page.evaluate(async () => {
                const b = [...document.querySelectorAll('button')].find((x) => /Télécharger le PDF/.test(x.textContent || ''));
                if (!b) return 'bouton introuvable';
                b.click();
                await new Promise((r) => setTimeout(r, 6000));
                return [...document.querySelectorAll('[role="alert"], [role="status"]')]
                    .map((e) => e.innerText).filter(Boolean).join(' | ') || 'aucun message';
            });
            ok('Première zone du DOM rendue invisible : le PDF sort quand même',
                !/Génération impossible|pas pu être rendu/.test(forcee),
                `message=« ${forcee.slice(0, 90)} »`);
            await page.evaluate(() => {
                const e = document.querySelector('[data-test-masque="1"]');
                if (e) { e.style.display = ''; delete e.dataset.testMasque; }
            });
            await wait(300);
        }

        // Et le téléchargement aboutit, sans message d'échec.
        const message = await page.evaluate(async () => {
            const b = [...document.querySelectorAll('button')].find((x) => /Télécharger le PDF/.test(x.textContent || ''));
            if (!b) return 'bouton introuvable';
            b.click();
            await new Promise((r) => setTimeout(r, 6000));
            const t = [...document.querySelectorAll('[role="alert"], [role="status"]')]
                .map((e) => e.innerText).filter(Boolean).join(' | ');
            return t || 'aucun message';
        });
        ok('Le téléchargement n\'échoue pas', !/Génération impossible|pas pu être rendu/.test(message),
            `message=« ${message.slice(0, 90)} »`);
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
