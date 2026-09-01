// Contrôle ciblé du parcours smartphone PWA.
// Ce banc vérifie les vues réservées aux téléphones sans modifier le parcours
// desktop ni les données de production.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 180) => new Promise(resolve => setTimeout(resolve, ms));

async function clickVisibleButton(page, predicate, exact = false) {
    return page.evaluate(({ source, exactMatch }) => {
        const matches = [...document.querySelectorAll('button')].filter(button => {
            const text = button.textContent || '';
            const aria = button.getAttribute('aria-label') || '';
            return exactMatch
                ? text.trim() === source || aria.trim() === source
                : text.includes(source) || aria.includes(source);
        });
        const visible = matches.find(button => {
            const rect = button.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });
        visible?.click();
        return Boolean(visible);
    }, { source: predicate, exactMatch: exact });
}

export async function run() {
    const results = [];
    const ok = (label, condition, detail = '') => results.push({ label, pass: !!condition, detail });
    const { page, close, consoleErrors } = await launchApp();

    try {
        await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true });
        await enterGuestMode(page);

        const shell = await page.evaluate(() => ({
            header: Boolean(document.querySelector('.mobile-app-header')),
            brand: Boolean(document.querySelector('.mobile-header-brand')),
            actions: Boolean(document.querySelector('.mobile-header-actions')),
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            viewportWidth: window.innerWidth
        }));
        ok('L’en-tête PWA smartphone utilise une structure dédiée', shell.header && shell.brand && shell.actions);
        ok('Le shell smartphone ne déborde pas horizontalement', shell.documentWidth <= shell.viewportWidth + 8 && shell.bodyWidth <= shell.viewportWidth + 8, `document=${shell.documentWidth}, body=${shell.bodyWidth}`);

        const pickerButton = await page.$('input[aria-label="Rechercher un ouvrage à ajouter"]');
        if (pickerButton) await page.$eval('input[aria-label="Rechercher un ouvrage à ajouter"]', node => node.focus());
        ok('La recherche rapide du catalogue peut être ouverte depuis le devis mobile', Boolean(pickerButton));
        await page.waitForSelector('#quote-solution-listbox', { timeout: 3000 });
        await wait();

        const picker = await page.evaluate(() => {
            const node = document.querySelector('#quote-solution-listbox');
            const rect = node?.getBoundingClientRect();
            const style = node ? getComputedStyle(node) : null;
            const search = document.querySelector('input[aria-label="Rechercher un ouvrage dans le catalogue"]');
            const back = document.querySelector('button[aria-label="Retour au devis"]');
            return {
                fixed: style?.position === 'fixed',
                fullViewport: Boolean(rect && rect.width >= window.innerWidth - 1 && rect.height >= window.innerHeight - 1),
                hasSearch: Boolean(search && search.getBoundingClientRect().width > 0),
                hasBack: Boolean(back && back.getBoundingClientRect().width > 0),
                resultsScrollable: (() => {
                    const results = document.querySelector('.solution-picker-results');
                    return Boolean(results && getComputedStyle(results).overflowY === 'auto');
                })()
            };
        });
        ok('Le sélecteur d’ouvrage mobile devient une vue plein écran', picker.fixed && picker.fullViewport);
        ok('La recherche et le retour sont accessibles au doigt', picker.hasSearch && picker.hasBack);
        ok('La liste des ouvrages reste défilable dans sa propre zone', picker.resultsScrollable);

        await page.click('button[aria-label="Retour au devis"]');
        await wait(100);
        ok('Le bouton Retour referme la vue de sélection', await page.$('#quote-solution-listbox') === null);

        const openedQuotes = await clickVisibleButton(page, 'Mes devis', true);
        ok('La liste des devis reste accessible sur smartphone', openedQuotes);
        await page.waitForFunction(() => document.body.innerText.includes('Mes devis'));
        const row = await page.$('tbody tr[role="button"]');
        if (row) await row.click();
        await wait(250);

        const detail = await page.evaluate(() => {
            const modal = [...document.querySelectorAll('.saved-quote-detail-modal')]
                .find(node => (node.className || '').includes('lg:hidden'));
            const card = modal?.querySelector('.saved-quote-detail-card');
            const more = modal?.querySelector('.saved-quote-mobile-more');
            const modalRect = modal?.getBoundingClientRect();
            const cardRect = card?.getBoundingClientRect();
            const visible = node => {
                if (!node) return false;
                const rect = node.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            };
            return {
                modalFullScreen: Boolean(modalRect && modalRect.width >= window.innerWidth - 1 && modalRect.height >= window.innerHeight - 1),
                cardFullScreen: Boolean(cardRect && cardRect.width >= window.innerWidth - 1 && cardRect.height >= window.innerHeight - 1),
                moreVisible: visible(more),
                horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 8 || document.body.scrollWidth > window.innerWidth + 8
            };
        });
        ok('Le détail d’un devis enregistré devient un écran mobile', detail.modalFullScreen && detail.cardFullScreen);
        ok('Les actions secondaires sont regroupées dans un menu mobile', detail.moreVisible);
        ok('Le détail du devis ne déborde pas horizontalement', !detail.horizontalOverflow);

        if (detail.moreVisible) {
            await page.click('.saved-quote-detail-modal.lg\\:hidden .saved-quote-mobile-more > button');
            await wait(80);
            ok('Le menu d’actions secondaires s’ouvre au toucher', await page.$('.saved-quote-mobile-more-menu') !== null);
        }

        ok('Aucune erreur console dans le parcours PWA mobile', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
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
