// Banc d'essai Phase 1 bis — sélection et création contextuelle des projets.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 160) => new Promise(resolve => setTimeout(resolve, ms));

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });
    const { page, close } = await launchApp();

    try {
        await page.setViewport({ width: 1280, height: 900 });
        await enterGuestMode(page);

        const clientInput = 'input[aria-label="Client du devis"]';
        const projectInput = 'input[aria-label="Projet du devis"]';
        const clientLayout = await page.evaluate(() => {
            const input = document.querySelector('input[aria-label="Client du devis"]');
            const icon = input?.parentElement?.querySelector('i.fa-user');
            if (!input || !icon) return null;
            const inputRect = input.getBoundingClientRect();
            const iconRect = icon.getBoundingClientRect();
            return { paddingLeft: parseFloat(getComputedStyle(input).paddingLeft), iconRight: iconRect.right - inputRect.left };
        });
        ok('Le texte du champ client démarre après son icône', Boolean(clientLayout && clientLayout.paddingLeft >= clientLayout.iconRight + 6), clientLayout ? `padding=${clientLayout.paddingLeft}px, icône=${clientLayout.iconRight.toFixed(1)}px` : 'géométrie introuvable');

        await page.click(clientInput);
        await page.evaluate(() => [...document.querySelectorAll('[role="option"]')]
            .find(node => node.textContent.includes('Société Immobilière NBB'))?.click());
        await wait();

        await page.click(projectInput);
        const existingProject = await page.evaluate(() => {
            const option = [...document.querySelectorAll('[role="option"]')]
                .find(node => node.textContent.includes('Construction Siège NBB'));
            option?.click();
            return Boolean(option);
        });
        await wait();
        const selectedProject = await page.$eval(projectInput, input => input.value);
        ok('Un projet existant du client est sélectionnable depuis le devis', existingProject && selectedProject === 'Construction Siège NBB', selectedProject);

        await page.click(projectInput);
        await page.evaluate((name) => {
            const input = document.querySelector('input[aria-label="Projet du devis"]');
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, name);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }, 'Extension siège NBB');
        await wait(220);
        const createOption = await page.evaluate(() => {
            const option = [...document.querySelectorAll('[role="option"]')]
                .find(node => node.textContent.includes('Créer le projet') && node.textContent.includes('Extension siège NBB'));
            option?.click();
            return Boolean(option);
        });
        ok('Le champ projet propose la création contextuelle', createOption);

        await page.waitForSelector('#newProjectForm', { timeout: 3000 });
        const prefilledProject = await page.$eval('#newProjectForm input[required]', input => input.value);
        ok('La création de projet reprend le texte recherché', prefilledProject === 'Extension siège NBB', prefilledProject);

        await page.click('button[form="newProjectForm"][type="submit"]');
        await wait(240);
        const createdProject = await page.$eval(projectInput, input => input.value);
        ok('Le nouveau projet est sélectionné automatiquement dans le devis', createdProject === 'Extension siège NBB', createdProject);
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
