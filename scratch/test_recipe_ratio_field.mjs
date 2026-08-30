// Banc d'essai — Fix "Nouveau composant" (2026-08-30), signalé par un
// utilisateur du SaaS : impossible de régler un ratio ("100 Modules LED pour
// 1 m² d'ouvrage") depuis "Mode de calcul" — le sélecteur écrit littéralement
// la variable brute (SURFACE, VOLUME…) dans la formule, coefficient 1
// imposé, sans champ pour le modifier.
//
// Corrigé en ajoutant un champ "Quantité nécessaire par unité" qui compose/
// décompose "MODE * N" (parseRecipeFormulaRatio / composeRecipeFormula dans
// index_jsx.js), sans réintroduire un champ de formule libre : la formule
// enregistrée reste dans le même format que celui déjà utilisé partout dans
// le catalogue (ex. "SURFACE * 25" pour les modules LED d'une enseigne).
//
// Ce banc vérifie, sur l'ouvrage réel "Caisson Enseigne Lumineuse LED" :
// (1) qu'éditer un composant à formule simple ("SURFACE * 25") décompose
//     correctement mode + ratio, avec l'aperçu attendu ;
// (2) qu'un ratio modifié se recompose et se persiste correctement ;
// (3) qu'un composant à formule complexe (calepinage grille) ne montre PAS
//     le champ ratio, et reste inchangé si on l'ouvre sans le modifier.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickButtonWithAriaLabel(page, ariaLabel) {
    return page.evaluate((label) => {
        const btn = [...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || '') === label);
        if (!btn) return false;
        btn.click();
        return true;
    }, ariaLabel);
}

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1280, height: 900 });
        await enterGuestMode(page);

        // Ouvrir "Catalogue technique" > "Catégorie Ouvrage" — groupe repliable
        // de la barre latérale (voir SidebarCatalogGroup, index_jsx.js).
        await page.evaluate(() => {
            const toggle = document.querySelector('button.sidebar-catalog-toggle');
            if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
        });
        await wait(150);
        const openedCategoryOuvrage = await page.evaluate(() => {
            const items = [...document.querySelectorAll('button')];
            const btn = items.find((b) => b.textContent.trim() === 'Catégorie Ouvrage');
            if (!btn) return false;
            btn.click();
            return true;
        });
        await wait(200);
        ok('Navigation vers "Catégorie Ouvrage" réussie', openedCategoryOuvrage);

        // Sélectionner l'ouvrage "Caisson Enseigne Lumineuse LED".
        const searchInput = await page.$('input[placeholder*="Rechercher un ouvrage"]');
        await searchInput.type('Enseigne', { delay: 15 });
        await wait(200);
        const selectedSolution = await page.evaluate(() => {
            const card = [...document.querySelectorAll('button, div[role="button"], li')]
                .find((el) => (el.textContent || '').includes('Caisson Ens'));
            if (!card) return false;
            card.click();
            return true;
        });
        await wait(200);
        ok('Ouvrage "Caisson Enseigne" sélectionné', selectedSolution);

        // --- Cas 1 : composant à formule simple ("SURFACE * 25") ---
        const openedLedEdit = await clickButtonWithAriaLabel(page, 'Éditer Modules LED IP67 1.2W (25 u/m²)');
        await wait(300);
        ok('Modale d\'édition ouverte pour "Modules LED"', openedLedEdit);
        const ledDebug = await page.evaluate(() => ({
            modalPresent: Boolean(document.querySelector('#recipeForm')),
            bodyIncludesLabel: document.body.innerText.includes('Quantité nécessaire par unité'),
            ratioInputFound: Boolean(document.querySelector('input[aria-label="Quantité nécessaire par unité de métré"]'))
        }));
        ok('Le champ "Quantité nécessaire par unité" est présent dans la modale', ledDebug.ratioInputFound, JSON.stringify(ledDebug));

        const ledModalState = await page.evaluate(() => {
            const ratioInput = document.querySelector('input[aria-label="Quantité nécessaire par unité de métré"]');
            const modeSelect = [...document.querySelectorAll('button, [role="combobox"]')]
                .map(el => el.textContent).join('');
            const preview = [...document.querySelectorAll('p')].map(p => p.textContent).find(t => t.includes('pour 1 m²'));
            return { ratioValue: ratioInput?.value, hasPreview: Boolean(preview), previewText: preview || null };
        });
        ok('Le ratio est pré-rempli à 25 (décomposé depuis "SURFACE * 25")', ledModalState.ratioValue === '25', `mesuré=${ledModalState.ratioValue}`);
        ok('L\'aperçu annonce "25 ... pour 1 m² de l\'ouvrage"', ledModalState.hasPreview && ledModalState.previewText.includes('25'), ledModalState.previewText);

        // Modifier le ratio à 30 et enregistrer.
        await page.evaluate(() => {
            const input = document.querySelector('input[aria-label="Quantité nécessaire par unité de métré"]');
            if (!input) return;
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(input, '30');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await wait(150);
        await page.evaluate(() => {
            const btn = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Enregistrer le composant');
            btn?.click();
        });
        await wait(250);

        const savedFormula = await page.evaluate(() => {
            const raw = localStorage.getItem('costcalc:guest:recipes');
            if (!raw) return null;
            const arr = JSON.parse(raw);
            const rec = arr.find(r => r.label && r.label.includes('Modules LED'));
            return rec ? { formula: rec.formula, hasRatioField: 'formulaRatio' in rec, hasComposableField: 'formulaComposable' in rec } : null;
        });
        ok('Le ratio modifié (30) se recompose et se persiste en "SURFACE * 30"', savedFormula?.formula === 'SURFACE * 30', JSON.stringify(savedFormula));
        ok('Les champs transitoires (formulaRatio/formulaComposable) ne fuitent pas dans la donnée persistée', savedFormula && !savedFormula.hasRatioField && !savedFormula.hasComposableField);

        // --- Cas 2 : composant à formule complexe (calepinage grille) ---
        const openedPlexiEdit = await clickButtonWithAriaLabel(page, 'Éditer Faces Plexiglas diffusant blanc 3mm');
        await wait(200);
        ok('Modale d\'édition ouverte pour "Faces Plexiglas" (formule complexe)', openedPlexiEdit);

        const plexiModalState = await page.evaluate(() => {
            const ratioInput = document.querySelector('input[aria-label="Quantité nécessaire par unité de métré"]');
            const modeLabel = [...document.querySelectorAll('button')].find(b => (b.textContent || '').includes('Calcul spécifique'));
            return { ratioFieldPresent: Boolean(ratioInput), specificModeShown: Boolean(modeLabel) };
        });
        ok(
            'Le champ ratio reste masqué pour une formule complexe (calepinage), pas de fausse décomposition',
            !plexiModalState.ratioFieldPresent && plexiModalState.specificModeShown,
            JSON.stringify(plexiModalState)
        );

        // Fermer sans enregistrer : la formule complexe ne doit pas bouger.
        await page.evaluate(() => {
            const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Annuler');
            btn?.click();
        });
        await wait(150);
        const plexiUnchanged = await page.evaluate(() => {
            const raw = localStorage.getItem('costcalc:guest:recipes');
            if (!raw) return null;
            const arr = JSON.parse(raw);
            const rec = Array.isArray(arr) ? arr.find(r => r.label && r.label.includes('Plexiglas')) : null;
            return rec?.formula || null;
        });
        ok(
            'La formule complexe de "Faces Plexiglas" n\'a pas été altérée',
            typeof plexiUnchanged === 'string' && plexiUnchanged.includes('ceil') && plexiUnchanged.includes('LARGEUR'),
            plexiUnchanged
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
