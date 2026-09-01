// Un composant de recette doit proposer un calcul compréhensible, sans champ
// de formule à saisir : le choix métier pilote le calcul automatiquement.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 180) => new Promise(resolve => setTimeout(resolve, ms));

async function clickButton(page, text, errorMessage) {
    const clicked = await page.evaluate((needle) => {
        const button = [...document.querySelectorAll('button')]
            .find(node => (node.textContent || '').includes(needle));
        button?.click();
        return Boolean(button);
    }, text);
    if (!clicked) throw new Error(errorMessage || `Bouton « ${text} » introuvable.`);
}

export async function run() {
    const results = [];
    const ok = (label, condition, detail = '') => results.push({ label, pass: Boolean(condition), detail });
    const { page, close, consoleErrors } = await launchApp();

    try {
        await page.setViewport({ width: 1280, height: 900 });
        await enterGuestMode(page);
        await clickButton(page, 'Catalogue technique');
        await clickButton(page, 'Catalogue');
        await page.waitForSelector('button[aria-label="Nature de la ressource à ajouter"]', { timeout: 5000 });

        await page.type('input[aria-label="Rechercher une ressource dans le catalogue"]', 'Tube carré', { delay: 12 });
        await page.waitForSelector('[role="option"]', { timeout: 3000 });
        const resourceAdded = await page.evaluate(() => {
            const option = [...document.querySelectorAll('[role="option"]')]
                .find(node => (node.textContent || '').includes('Tube carré'));
            option?.click();
            return Boolean(option);
        });
        ok('Une ressource du catalogue est sélectionnable', resourceAdded);

        await page.waitForSelector('button[aria-label^="Éditer "]', { timeout: 3000 });
        const editOpened = await page.evaluate(() => {
            const button = document.querySelector('button[aria-label^="Éditer "]');
            button?.click();
            return Boolean(button);
        });
        ok('Les réglages du composant sont accessibles', editOpened);
        await page.waitForSelector('button[aria-label="Mode de calcul du composant"]', { timeout: 3000 });

        const modalFields = await page.evaluate(() => ({
            hasTechnicalFormulaLabel: [...document.querySelectorAll('label')]
                .some(node => /formule mathématique/i.test(node.textContent || '')),
            hasModeLabel: [...document.querySelectorAll('label')]
                .some(node => (node.textContent || '').trim() === 'Mode de calcul'),
            selectedText: document.querySelector('button[aria-label="Mode de calcul du composant"]')?.textContent.trim() || ''
        }));
        ok('La formule technique n’est plus demandée à l’utilisateur', !modalFields.hasTechnicalFormulaLabel);
        ok('Le champ est présenté comme un choix de calcul métier', modalFields.hasModeLabel);
        ok('Le calcul affiché est compréhensible', /Surface|Longueur|Périmètre|Quantité|Forfait|Volume|Calcul spécifique/.test(modalFields.selectedText), modalFields.selectedText);

        await page.click('button[aria-label="Mode de calcul du composant"]');
        await wait();
        const modeChoices = await page.evaluate(() => [...document.querySelectorAll('[role="listbox"] [role="option"]')]
            .map(node => node.textContent.trim()));
        ok('Les choix utilisent des intitulés métier', modeChoices.some(choice => /Surface de l’ouvrage|Longueur de l’ouvrage|Quantité de l’ouvrage|Forfait fixe/.test(choice)), modeChoices.join(' | '));
        ok('Aucun code brut de formule n’est présenté comme choix', !modeChoices.some(choice => /^(SURFACE|VOLUME|LONGUEUR|PERIMETRE|QTY)$/.test(choice)), modeChoices.join(' | '));
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
