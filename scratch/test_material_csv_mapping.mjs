// Parcours d'import CSV : la détection doit aider, sans jamais imposer une
// correspondance de colonnes au fournisseur.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 180) => new Promise(resolve => setTimeout(resolve, ms));

async function clickButton(page, text) {
    return page.evaluate((label) => {
        const button = [...document.querySelectorAll('button')].find(node => (node.textContent || '').includes(label));
        button?.click();
        return Boolean(button);
    }, text);
}

export async function run() {
    const results = [];
    const ok = (label, condition, detail = '') => results.push({ label, pass: !!condition, detail });
    const { page, close, consoleErrors } = await launchApp();

    try {
        await page.setViewport({ width: 1280, height: 900 });
        await enterGuestMode(page);

        await clickButton(page, 'Catalogue technique');
        const openedResources = await clickButton(page, 'Ressources');
        ok('La page Ressource est accessible pour préparer l’import', openedResources);
        await page.waitForSelector('button[aria-label="Importer un fichier CSV"]', { timeout: 4000 });
        await page.click('button[aria-label="Importer un fichier CSV"]');
        await page.waitForSelector('input[type="file"]', { timeout: 3000 });

        const csv = [
            'Référence fournisseur;Libellé fournisseur;Groupe matière;Tarif fournisseur;Conditionnement;Colisage;Unité de mesure;Déchet',
            'AC-25;"Profil fournisseur test 78x45";Fer;12000;Barre;6;m;5',
            'PT-20;Peinture fournisseur test;Peinture;55000;Pot;20;L;8'
        ].join('\n');
        await page.evaluate((content) => {
            const input = document.querySelector('input[type="file"]');
            const data = new DataTransfer();
            data.items.add(new File([content], 'catalogue_fournisseur.csv', { type: 'text/csv' }));
            input.files = data.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }, csv);
        await page.waitForSelector('#csv-map-priceBuy', { timeout: 4000 });
        await wait();

        const initial = await page.evaluate(() => ({
            title: document.querySelector('#csv-mapping-title')?.textContent || '',
            priceMapping: document.querySelector('#csv-map-priceBuy')?.value || '',
            importDisabled: document.querySelector('button[disabled]')?.textContent?.includes('Importer') || false,
            hasExample: document.body.innerText.includes('Profil fournisseur test 78x45')
        }));
        ok('L’assistant affiche une étape dédiée à l’association des colonnes', initial.title.includes('Associer les colonnes'));
        ok('Une colonne ambiguë reste à confirmer au lieu d’être devinée', initial.priceMapping === '');
        ok('L’import est bloqué tant que le prix d’achat n’est pas associé', initial.importDisabled);

        await page.$eval('#csv-map-priceBuy', (select) => {
            select.value = '3';
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await wait();

        const completed = await page.evaluate(() => {
            const button = [...document.querySelectorAll('button')].find(node => (node.textContent || '').includes('Importer 2 Matière'));
            return {
                priceMapping: document.querySelector('#csv-map-priceBuy')?.value || '',
                importEnabled: Boolean(button && !button.disabled),
                preview: document.body.innerText.includes('Profil fournisseur test 78x45') && document.body.innerText.includes('12000 FCFA')
            };
        });
        ok('L’utilisateur peut choisir la colonne du prix d’achat', completed.priceMapping === '3');
        ok('L’import devient possible après confirmation des champs requis', completed.importEnabled);
        ok('L’aperçu reflète les valeurs après le mapping choisi', completed.preview);

        await page.evaluate(() => {
            const button = [...document.querySelectorAll('button')].find(node => (node.textContent || '').includes('Importer 2 Matière'));
            button?.click();
        });
        await page.waitForFunction(() => !document.querySelector('#csv-mapping-title'), { timeout: 4000 });
        const imported = await page.evaluate(() => document.body.innerText.includes('Profil fournisseur test 78x45'));
        ok('Les matières sont réellement créées après validation du mapping', imported);
        ok('Aucune erreur console pendant le mapping CSV', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
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
