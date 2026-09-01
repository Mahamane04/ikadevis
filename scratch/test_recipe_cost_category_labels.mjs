// Le type technique et la rubrique de coût doivent rester deux choix
// compréhensibles et distincts : « Matière » ≠ « Fournitures & matériaux ».
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 180) => new Promise(resolve => setTimeout(resolve, ms));

async function clickButton(page, predicate, message) {
    const clicked = await page.evaluate((source) => {
        const matches = (text) => text.includes(source);
        const button = [...document.querySelectorAll('button')].find(node => matches(node.textContent || ''));
        button?.click();
        return Boolean(button);
    }, predicate);
    if (!clicked) throw new Error(message || `Bouton « ${predicate} » introuvable.`);
}

export async function run() {
    const results = [];
    const ok = (label, condition, detail = '') => results.push({ label, pass: Boolean(condition), detail });
    const { page, close, consoleErrors } = await launchApp();

    try {
        await page.setViewport({ width: 1280, height: 900 });
        await enterGuestMode(page);
        await clickButton(page, 'Catalogue technique', 'Entrée Catalogue technique introuvable.');
        await clickButton(page, 'Catalogue', 'Entrée Catalogue introuvable.');
        await page.waitForSelector('button[aria-label="Nature de la ressource à ajouter"]', { timeout: 5000 });

        const quickNature = await page.$eval('button[aria-label="Nature de la ressource à ajouter"]', node => node.textContent.trim());
        ok('Le sélecteur de ressource parle de nature et non de type ambigu', quickNature === 'Matière', quickNature);

        await page.type('input[aria-label="Rechercher une ressource dans le catalogue"]', 'Tube carré', { delay: 15 });
        await page.waitForSelector('[role="option"]', { timeout: 3000 });
        const added = await page.evaluate(() => {
            const item = [...document.querySelectorAll('[role="option"]')]
                .find(node => (node.textContent || '').includes('Tube carré'));
            item?.click();
            return Boolean(item);
        });
        ok('Une ressource du catalogue peut être ajoutée au composant de test', added);
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(node => (node.textContent || '').includes('Options avancées')), { timeout: 3000 });
        await clickButton(page, 'Options avancées');
        await page.waitForSelector('button[aria-label="Nature du composant ajouté"]', { timeout: 3000 });

        const labels = await page.evaluate(() => ({
            natureLabel: [...document.querySelectorAll('label')].some(node => node.textContent.trim() === 'Nature de la ressource'),
            costLabel: [...document.querySelectorAll('label')].some(node => node.textContent.trim() === 'Rubrique de coût du devis'),
            nature: document.querySelector('button[aria-label="Nature du composant ajouté"]')?.textContent.trim(),
            cost: document.querySelector('button[aria-label="Rubrique de coût du composant ajouté"]')?.textContent.trim()
        }));
        ok('Les deux champs sont explicitement distingués', labels.natureLabel && labels.costLabel);
        ok('La nature initiale est une matière', labels.nature === 'Matière', labels.nature || 'champ absent');
        ok('La rubrique initiale décrit les fournitures sans répéter « matière première »', labels.cost === 'Fournitures & matériaux', labels.cost || 'champ absent');

        await page.click('button[aria-label="Rubrique de coût du composant ajouté"]');
        await wait();
        const categories = await page.evaluate(() => [...document.querySelectorAll('[role="listbox"] [role="option"]')].map(node => node.textContent.trim()));
        ok('Les rubriques proposent une famille de coût complète', categories.includes('Fournitures & matériaux') && categories.includes('Installation & pose') && categories.includes('Transport & logistique'), categories.join(' | '));
        ok('L’ancienne option redondante n’est plus proposée', !categories.some(label => /Matières premières/i.test(label)), categories.join(' | '));
        ok('Aucune erreur console pendant le parcours', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
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
