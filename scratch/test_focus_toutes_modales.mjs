// Banc d'essai — suite de l'audit du 2026-09-02, point « 17 modales non
// auditées ».
//
// Deux fenêtres avaient été câblées à la main, avec un crochet qui gère aussi
// Échap parce qu'on sait, pour celles-là, comment les fermer. Les dix-sept
// autres relèvent désormais d'un filet générique posé au niveau de
// l'application : il porte le focus dans la fenêtre du dessus à son ouverture,
// l'y enferme, et le rend au déclencheur à la fermeture.
//
// Ce que le filet ne fait PAS, volontairement : Échap. Fermer suppose de
// savoir ce que « fermer » veut dire pour chaque fenêtre — cliquer au hasard
// sur « Annuler » dans un formulaire à moitié rempli détruirait la saisie.
// Échap reste donc câblé sur les deux fenêtres où le geste est connu.
//
// Un seuil de z-index ≥ 100 avait d'abord servi à distinguer une modale du
// reste : il laissait passer l'assistant « Nouveau devis », qui vit en 50.
// Les valeurs vont de 50 à 130 selon les fenêtres ; c'est `.fixed.inset-0`
// — une surface qui couvre tout l'écran — qui fait foi, le z-index ne servant
// plus qu'à départager celle du dessus.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 900) => new Promise((r) => setTimeout(r, ms));

const sonde = (page) => page.evaluate(() => {
    const vis = (e) => {
        const cs = getComputedStyle(e);
        const b = e.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0' && b.width > 1 && b.height > 1;
    };
    const f = [...document.querySelectorAll('.fixed.inset-0')].filter(vis);
    if (!f.length) return { aucune: true };
    const d = f[f.length - 1];
    return {
        z: getComputedStyle(d).zIndex,
        role: d.getAttribute('role'),
        ariaModal: d.getAttribute('aria-modal'),
        focusDedans: d.contains(document.activeElement)
    };
});

const fermer = async (page) => {
    await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].filter((x) => x.getBoundingClientRect().width > 0)
            .find((x) => /Fermer/.test(x.getAttribute('aria-label') || '') || /^Annuler$/.test((x.textContent || '').trim()));
        if (b) b.click();
    });
    await wait(800);
};

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page, { demo: true });
        await wait(2400);

        const eprouver = async (nom, ecran, ouvrir) => {
            await page.evaluate((c) => {
                const b = [...document.querySelectorAll('aside button')].find((x) => (x.textContent || '').trim().startsWith(c));
                if (b) b.click();
            }, ecran);
            await wait(1500);
            await page.evaluate((motif) => {
                const b = [...document.querySelectorAll('button')].filter((x) => x.getBoundingClientRect().width > 0)
                    .find((x) => new RegExp(motif).test(x.textContent || ''));
                if (b) b.click();
            }, ouvrir);
            await wait(1300);

            const r = await sonde(page);
            ok(`${nom} — la fenêtre est détectée`, !r.aucune, r.aucune ? 'aucune surface plein écran visible' : `z-index=${r.z}`);
            if (r.aucune) return;
            ok(`${nom} — annoncée comme dialogue modal`, r.role === 'dialog' && r.ariaModal === 'true',
                `role=${r.role} aria-modal=${r.ariaModal}`);
            ok(`${nom} — le focus entre à l’ouverture`, r.focusDedans);

            let sorties = 0;
            for (let i = 0; i < 10; i++) {
                await page.keyboard.press('Tab');
                sorties += await page.evaluate(() => {
                    const vis = (e) => { const b = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && b.width > 1; };
                    const f = [...document.querySelectorAll('.fixed.inset-0')].filter(vis);
                    return f.length ? (f[f.length - 1].contains(document.activeElement) ? 0 : 1) : 0;
                });
            }
            ok(`${nom} — le focus reste enfermé sur 10 tabulations — ${sorties} sortie(s)`, sorties === 0);
            await fermer(page);
        };

        await eprouver('Assistant « Nouveau devis »', 'Chiffrage', 'Nouveau devis');
        await eprouver('Nouveau client', 'Clients', 'Nouveau Client');
        await eprouver('Nouveau chantier', 'Chantiers', 'Nouveau Chantier');

        // Et le filet doit s'effacer une fois tout refermé : sans fenêtre
        // ouverte, la tabulation doit à nouveau parcourir la page.
        await wait(700);
        const libre = await page.evaluate(() => {
            const vis = (e) => { const b = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && b.width > 1; };
            return [...document.querySelectorAll('.fixed.inset-0')].filter(vis).length;
        });
        ok('Aucune fenêtre ne reste ouverte à la fin du parcours', libre === 0, `${libre} surface(s) visible(s)`);
        await page.keyboard.press('Tab');
        ok('La tabulation circule de nouveau librement dans la page',
            await page.evaluate(() => document.activeElement !== document.body));
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
