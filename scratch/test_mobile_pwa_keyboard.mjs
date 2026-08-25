// Contrôle ciblé : le clavier smartphone doit recouvrir l'app sans la pousser.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 160) => new Promise(resolve => setTimeout(resolve, ms));

export async function run() {
    const results = [];
    const ok = (label, condition, detail = '') => results.push({ label, pass: !!condition, detail });
    const { page, close, consoleErrors } = await launchApp();

    try {
        await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true });
        await enterGuestMode(page);

        const beforeFocus = await page.evaluate(() => {
            const shell = document.querySelector('.mobile-app-shell');
            const nav = document.querySelector('.mobile-bottom-nav');
            const totals = document.querySelector('.quote-totals-bar');
            return {
                shell: Boolean(shell),
                nav: Boolean(nav),
                totals: Boolean(totals),
                viewportMeta: document.querySelector('meta[name="viewport"]')?.content || '',
                shellHeight: shell?.getBoundingClientRect().height || 0
            };
        });
        ok('La coque PWA mobile est dédiée', beforeFocus.shell && beforeFocus.nav && beforeFocus.totals);
        ok('Le clavier est configuré pour recouvrir le contenu', beforeFocus.viewportMeta.includes('interactive-widget=overlays-content'));

        // Le sélecteur client ne déplace pas automatiquement le focus vers
        // une autre vue, ce qui permet de mesurer proprement l'entrée/sortie
        // du mode clavier.
        const inputSelector = 'input[aria-label="Client du devis"]';
        await page.$eval(inputSelector, node => node.focus());
        await wait();

        const whileFocused = await page.evaluate(() => {
            const shell = document.querySelector('.mobile-app-shell');
            const nav = document.querySelector('.mobile-bottom-nav');
            const totals = document.querySelector('.quote-totals-bar');
            return {
                keyboardMode: document.documentElement.classList.contains('pwa-keyboard-open'),
                navHidden: getComputedStyle(nav).visibility === 'hidden' && Number(getComputedStyle(nav).opacity) === 0,
                totalsHidden: getComputedStyle(totals).visibility === 'hidden' && Number(getComputedStyle(totals).opacity) === 0,
                shellHeight: shell?.getBoundingClientRect().height || 0
            };
        });
        ok('La saisie active le mode clavier mobile', whileFocused.keyboardMode);
        ok('Les barres fixes se masquent sans déplacer la page', whileFocused.navHidden && whileFocused.totalsHidden);
        ok('La coque conserve sa hauteur pendant la saisie', Math.abs(whileFocused.shellHeight - beforeFocus.shellHeight) < 2, `${beforeFocus.shellHeight}px → ${whileFocused.shellHeight}px`);

        await page.$eval(inputSelector, node => node.blur());
        await wait(180);
        const afterBlur = await page.evaluate(() => ({
            keyboardMode: document.documentElement.classList.contains('pwa-keyboard-open'),
            navVisible: getComputedStyle(document.querySelector('.mobile-bottom-nav')).visibility !== 'hidden',
            totalsVisible: getComputedStyle(document.querySelector('.quote-totals-bar')).visibility !== 'hidden'
        }));
        ok('Les commandes reviennent après la saisie', !afterBlur.keyboardMode && afterBlur.navVisible && afterBlur.totalsVisible, JSON.stringify(afterBlur));
        ok('Aucune erreur console pendant la saisie mobile', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    } finally {
        await close();
    }

    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const result of results) console.log(`  ${result.pass ? '✅' : '❌'} ${result.label}${result.detail ? ' — ' + result.detail : ''}`);
    process.exit(results.every(result => result.pass) ? 0 : 1);
}
