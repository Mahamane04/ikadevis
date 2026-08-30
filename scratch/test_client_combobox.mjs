// Banc d'essai Phase 1 — ClientCombobox dans l'espace de devis.
// Vérifie la sélection d'un client existant et la création contextuelle sans
// quitter le devis.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await enterGuestMode(page);

        const clientInput = 'input[aria-label="Client du devis"]';
        await page.click(clientInput);
        await page.type(clientInput, 'Recherche non validée', { delay: 10 });
        await page.keyboard.press('Escape');
        await new Promise(resolve => setTimeout(resolve, 80));
        const cancelledSearch = await page.$eval(clientInput, input => input.value);
        ok('Une recherche client annulée ne devient pas une sélection', cancelledSearch === '', cancelledSearch);

        await page.click(clientInput);
        await new Promise(resolve => setTimeout(resolve, 100));
        await page.evaluate(() => {
            const option = [...document.querySelectorAll('[role="option"]')]
                .find(node => node.textContent.includes('Société Immobilière NBB'));
            option?.click();
        });
        await new Promise(resolve => setTimeout(resolve, 150));
        const selectedExisting = await page.$eval(clientInput, input => input.value);
        ok('Un client existant peut être sélectionné depuis le devis', selectedExisting === 'Société Immobilière NBB', selectedExisting);

        await page.click(clientInput);
        await page.evaluate((nextValue) => {
            const input = document.querySelector('input[aria-label="Client du devis"]');
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(input, nextValue);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }, 'Client créé depuis devis');
        await new Promise(resolve => setTimeout(resolve, 250));
        const createOption = await page.evaluate(() => {
            const option = [...document.querySelectorAll('[role="option"]')]
                .find(node => node.textContent.includes('Créer') && node.textContent.includes('Client créé depuis devis'));
            if (!option) return false;
            option.click();
            return true;
        });
        ok('Le menu propose la création du client recherché', createOption);

        await page.waitForSelector('#newClientForm', { timeout: 3000 });
        const prefilledName = await page.$eval('#newClientForm input[required]', input => input.value);
        ok('La création rapide reprend le texte recherché', prefilledName === 'Client créé depuis devis', prefilledName);

        await page.click('button[form="newClientForm"][type="submit"]');
        await new Promise(resolve => setTimeout(resolve, 250));
        const selectedCreated = await page.$eval(clientInput, input => input.value);
        ok('Le nouveau client est sélectionné automatiquement dans le devis', selectedCreated === 'Client créé depuis devis', selectedCreated);

        // Fix P3 (2026-08-30) — cliquer ailleurs dans l'éditeur (pas Escape,
        // ex. la barre de recherche d'ouvrage) pendant qu'un nom de client
        // non confirmé venait d'être tapé faisait disparaître ce texte sans
        // avertir. Le texte doit maintenant être conservé comme client en
        // texte libre (pas de clientId) plutôt qu'écrasé silencieusement.
        await page.click(clientInput);
        await page.evaluate((nextValue) => {
            const input = document.querySelector('input[aria-label="Client du devis"]');
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(input, nextValue);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }, 'Nom tapé sans confirmation XYZ');
        await new Promise(resolve => setTimeout(resolve, 150));
        // mousedown synthétique plutôt que page.click() : le point cliquable
        // de la barre de recherche d'ouvrage dépend de l'état du lot actif
        // (peut être hors-écran/obscurci selon ce qui précède dans ce banc) —
        // seul le déclenchement du mousedown "hors du combobox client"
        // importe ici, pas la géométrie réelle du clic.
        await page.evaluate(() => {
            const target = document.querySelector('input[aria-label="Rechercher un ouvrage à ajouter"]') || document.body;
            target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        });
        await new Promise(resolve => setTimeout(resolve, 150));
        const preservedAfterOutsideClick = await page.$eval(clientInput, input => input.value);
        ok(
            'Un nom tapé sans confirmation survit à un clic ailleurs dans l\'éditeur (pas de perte silencieuse)',
            preservedAfterOutsideClick === 'Nom tapé sans confirmation XYZ',
            preservedAfterOutsideClick
        );
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
