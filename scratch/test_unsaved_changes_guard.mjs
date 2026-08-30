// Banc d'essai — Fix UX-1 (2026-08-30), signalé par l'utilisateur : le
// système de validation UX n'empêchait pas de perdre un devis en cours par
// navigation interne, ni de supprimer un ouvrage sans confirmation.
//
// Racine du premier bug (confirmée en direct avant correctif) : hybridQuote
// (les données du devis) est levé dans App et survit au démontage de
// QuoteWorkspace ; hasUnsavedChanges, lui, était un useState LOCAL à
// QuoteWorkspace, réinitialisé à `false` à chaque remontage (bascule vers un
// autre onglet de la barre latérale, puis retour sur « Créer un Devis »).
// Un ouvrage ajouté restait bien visible (données préservées), mais le
// bandeau passait silencieusement de « Modifications non enregistrées » à
// « Enregistré localement » sans le moindre enregistrement réel — et l'effet
// onDirtyChange écrasait au passage le miroir côté App (devisNonEnregistre),
// désarmant du même coup la garde de déconnexion et, si l'onglet était
// fermé ensuite, la garde beforeunload (qui ne se déclenche que si
// hasUnsavedChanges est vrai au moment de la fermeture).
//
// Second bug : handleDeleteItem (suppression d'un ouvrage depuis le tableau)
// supprimait en un clic, sans confirmation — contrairement à handleDeleteLot
// (suppression d'un lot) qui en demande une. Incohérence corrigée en
// alignant le comportement des deux.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode, addCatalogItemBySearch } from './lib/harness.mjs';

async function clickVisibleButton(page, predicate, exact = false) {
    return page.evaluate(({ source, exactMatch }) => {
        const matches = [...document.querySelectorAll('button')]
            .filter(button => {
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

const wait = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1280, height: 900 });
        await enterGuestMode(page);

        await addCatalogItemBySearch(page, 'Peinture Murale');
        await wait(300);

        const dirtyAfterAdd = await page.evaluate(() => document.body.innerText.includes('Modifications non enregistrées'));
        ok('Le bandeau signale des modifications non enregistrées après ajout d\'un ouvrage', dirtyAfterAdd);

        // Bascule vers un autre onglet de la barre latérale (démonte
        // QuoteWorkspace), puis retour — c'est exactement le geste qui
        // faisait disparaître le bandeau avant le correctif.
        const wentToClient = await clickVisibleButton(page, 'Client', true);
        await wait(250);
        const cameBack = await clickVisibleButton(page, 'Créer un Devis', true);
        await wait(250);

        const stillDirty = await page.evaluate(() => document.body.innerText.includes('Modifications non enregistrées'));
        const falselyMarkedSaved = await page.evaluate(() => document.body.innerText.includes('Enregistré localement'));
        const itemSurvived = await page.evaluate(() => document.body.innerText.includes('Peinture Murale'));

        ok(
            'Le bandeau "Modifications non enregistrées" survit à un aller-retour par la barre latérale',
            wentToClient && cameBack && stillDirty,
            `allé sur Client=${wentToClient}, retour=${cameBack}, toujours signalé non enregistré=${stillDirty}`
        );
        ok(
            'Le bandeau ne prétend plus "Enregistré localement" sans enregistrement réel',
            !falselyMarkedSaved
        );
        ok('L\'ouvrage ajouté est toujours présent après l\'aller-retour', itemSurvived);

        // Suppression d'un ouvrage : doit désormais demander confirmation,
        // comme la suppression d'un lot.
        const deleteBtnClicked = await page.evaluate(() => {
            const btn = [...document.querySelectorAll('button')]
                .find((b) => (b.getAttribute('title') || '') === 'Supprimer cette ligne');
            if (!btn) return false;
            btn.click();
            return true;
        });
        await wait(200);
        const confirmDialogShown = await page.evaluate(() => document.body.innerText.includes('Supprimer cet ouvrage'));
        ok(
            'Supprimer un ouvrage affiche une confirmation avant de le retirer (comme un lot)',
            deleteBtnClicked && confirmDialogShown,
            `bouton cliqué=${deleteBtnClicked}, dialogue affiché=${confirmDialogShown}`
        );

        // Confirmer la suppression et vérifier qu'elle a bien lieu.
        const confirmed = await clickVisibleButton(page, 'Supprimer', true);
        await wait(200);
        const itemGone = await page.evaluate(() => !document.body.innerText.includes('Peinture Murale'));
        ok('La confirmation supprime effectivement l\'ouvrage', confirmed && itemGone);
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
