// Banc d'essai — la page Paramètres occupe tout l'écran (2026-09-04).
//
// Elle laissait le menu principal visible à sa gauche sur ordinateur. Trois
// signaux se contredisaient alors :
//
//  1. le bouton annonçait « Retour à l'application » alors que l'application
//     était toujours affichée à côté ;
//  2. le menu de gauche n'allumait AUCUN élément pendant tout le séjour dans
//     les réglages — la surbrillance vient de `activeView === id` et aucun
//     élément ne porte l'identifiant `settings` ;
//  3. son bouton « Paramètres du Compte » menait à l'écran déjà ouvert.
//
// Un seul menu à la fois règle les trois. Mais couvrir n'est pas retirer : ce
// banc vérifie surtout ce qui ne se voit pas — la navigation cachée derrière
// la page ne doit plus être atteignable à la tabulation, sans quoi un
// utilisateur au clavier parcourt un menu invisible.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 900) => new Promise((r) => setTimeout(r, ms));

const cliquer = (page, motif) => page.evaluate((t) => {
    const b = [...document.querySelectorAll('button')]
        .filter((x) => x.getBoundingClientRect().width > 0)
        .find((x) => new RegExp(t, 'i').test(x.textContent || ''));
    if (b) b.click();
    return !!b;
}, motif);

// Ce qui occupe réellement le pixel : `elementFromPoint` dit qui reçoit le
// clic, là où une mesure de position dirait seulement qui se superpose.
const mesurer = (page) => page.evaluate(() => {
    const page_ = document.querySelector('.settings-page-shell');
    const navs = [...document.querySelectorAll('[data-nav-principale]')]
        .filter((n) => n.getClientRects().length > 0);
    const sousLeMenu = navs.map((n) => {
        const r = n.getBoundingClientRect();
        const cible = document.elementFromPoint(
            Math.round(r.left + Math.min(r.width, 120) / 2),
            Math.round(r.top + Math.min(r.height, 400) / 2)
        );
        return !!(cible && page_ && page_.contains(cible));
    });
    return {
        ouverte: !!page_,
        bordGauche: page_ ? Math.round(page_.getBoundingClientRect().left) : null,
        navsVisibles: navs.length,
        navsCouvertes: sousLeMenu.filter(Boolean).length,
        navsInertes: [...document.querySelectorAll('[data-nav-principale]')]
            .filter((n) => n.hasAttribute('inert')).length,
        navsTotal: document.querySelectorAll('[data-nav-principale]').length
    };
});

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1600, height: 950 });
        await enterGuestMode(page, { demo: true });
        await wait(2400);

        ok('Les paramètres s’ouvrent', await cliquer(page, 'Paramètres du Compte'));
        await wait(1800);

        const bureau = await mesurer(page);
        ok('La page Paramètres est rendue', bureau.ouverte);
        ok(`Elle part du bord gauche sur ordinateur — left=${bureau.bordGauche}px`,
            bureau.bordGauche === 0);
        ok(`Aucune navigation principale ne dépasse — ${bureau.navsCouvertes}/${bureau.navsVisibles} couverte(s)`,
            bureau.navsVisibles > 0 && bureau.navsCouvertes === bureau.navsVisibles);
        ok(`Les navigations couvertes sont neutralisées — ${bureau.navsInertes}/${bureau.navsTotal}`,
            bureau.navsTotal > 0 && bureau.navsInertes === bureau.navsTotal);

        // Couvrir ne suffit pas : sans `inert`, la tabulation continue de
        // traverser le menu caché.
        await page.evaluate(() => {
            const p = document.querySelector('.settings-page-shell');
            const premier = p && p.querySelector('button, [href], input, select, textarea');
            if (premier) premier.focus();
        });
        const evasions = await (async () => {
            let sorties = 0;
            for (let i = 0; i < 25; i++) {
                await page.keyboard.press('Tab');
                const dehors = await page.evaluate(() => {
                    const a = document.activeElement;
                    if (!a || a === document.body) return false;
                    return !!a.closest('[data-nav-principale]');
                });
                if (dehors) sorties++;
            }
            return sorties;
        })();
        ok(`La tabulation n’atteint plus le menu caché — ${evasions} évasion(s) sur 25`,
            evasions === 0);

        // ── Sortir rend la navigation ─────────────────────────────────────
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')]
                .find((x) => /Retour à l’application|Retour à l'application/.test(x.textContent || ''));
            if (b) b.click();
        });
        await wait(1800);
        const apres = await page.evaluate(() => ({
            pageFermee: !document.querySelector('.settings-page-shell'),
            navsInertes: [...document.querySelectorAll('[data-nav-principale]')]
                .filter((n) => n.hasAttribute('inert')).length,
            navVisible: [...document.querySelectorAll('[data-nav-principale]')]
                .some((n) => n.getClientRects().length > 0)
        }));
        ok('« Retour à l’application » referme les réglages', apres.pageFermee);
        ok('Le menu principal redevient utilisable', apres.navsInertes === 0 && apres.navVisible);

        // Quitter par un autre chemin que le bouton ne doit rien laisser figé.
        await cliquer(page, 'Paramètres du Compte');
        await wait(1600);
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')]
                .find((x) => /Retour à l’application|Retour à l'application/.test(x.textContent || ''));
            if (b) b.click();
        });
        await wait(1400);
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('aside button')]
                .find((x) => (x.textContent || '').trim().startsWith('Mes devis'));
            if (b) b.click();
        });
        await wait(1600);
        ok('Rien ne reste neutralisé après un autre chemin de sortie',
            await page.evaluate(() => [...document.querySelectorAll('[data-nav-principale]')]
                .every((n) => !n.hasAttribute('inert'))));

        // ── Sur téléphone, le comportement était déjà celui-là ────────────
        await page.setViewport({ width: 390, height: 844 });
        await wait(1200);
        // Sur téléphone, le bouton de la barre latérale n'existe pas : l'entrée
        // se fait par l'icône de l'en-tête, repérée par son libellé accessible.
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')]
                .filter((x) => x.getBoundingClientRect().width > 0)
                .find((x) => /param.tres du compte/i.test(x.getAttribute('aria-label') || ''));
            if (b) b.click();
        });
        await wait(1800);
        const mobile = await mesurer(page);
        ok(`Sur téléphone aussi, la page part du bord — left=${mobile.bordGauche}px`,
            mobile.ouverte && mobile.bordGauche === 0);
        ok(`La barre du bas est neutralisée elle aussi — ${mobile.navsInertes}/${mobile.navsTotal}`,
            mobile.navsTotal > 0 && mobile.navsInertes === mobile.navsTotal);
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
