// Banc d'essai V2 — fumée responsive sur les largeurs prévues au cahier.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 120) => new Promise(resolve => setTimeout(resolve, ms));

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });
    const { page, close, consoleErrors } = await launchApp();

    try {
        await page.setViewport({ width: 1280, height: 900 });
        await enterGuestMode(page);

        for (const width of [1440, 1280, 1024, 768, 390]) {
            await page.setViewport({ width, height: width < 768 ? 844 : 900 });
            await wait();
            const layout = await page.evaluate(() => {
                const visible = selector => {
                    const node = document.querySelector(selector);
                    if (!node) return false;
                    const rect = node.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                };
                return {
                    documentWidth: document.documentElement.scrollWidth,
                    bodyWidth: document.body.scrollWidth,
                    viewportWidth: window.innerWidth,
                    mobileMenu: visible('button[aria-label="Ouvrir le menu de navigation"]'),
                    tabletRail: visible('aside.sidebar-shell-collapsed'),
                    desktopSidebar: visible('aside.sidebar-shell')
                };
            });
            const noOverflow = layout.documentWidth <= width + 8 && layout.bodyWidth <= width + 8;
            ok(`Aucun débordement horizontal à ${width}px`, noOverflow, `document=${layout.documentWidth}, body=${layout.bodyWidth}`);
            if (width < 768) ok(`Le menu mobile est disponible à ${width}px`, layout.mobileMenu);
            if (width >= 768 && width < 1024) ok(`Le rail tablette est disponible à ${width}px`, layout.tabletRail);
            if (width >= 1024) ok(`La sidebar desktop est disponible à ${width}px`, layout.desktopSidebar);
        }

        ok('Aucune erreur console pendant le parcours responsive', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    } finally {
        await close();
    }
    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    process.exit(results.every(r => r.pass) ? 0 : 1);
}
