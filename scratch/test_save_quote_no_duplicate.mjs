// Banc d'essai — Fix "doublon à chaque Enregistrer" (2026-08-30), signalé
// par un utilisateur du SaaS : cliquer sur "Enregistrer" un devis déjà
// sauvegardé créait une nouvelle fiche à chaque fois (numéro qui s'incrémente
// DEV-001 → DEV-002 → DEV-003) au lieu de mettre à jour la fiche existante.
//
// Cause racine confirmée : côté Cloud, create_quote_v7 est une fonction
// UNIQUEMENT INSERT (aucune fonction de mise à jour n'existait), et
// hybridQuote (l'état actif) ne recevait jamais l'identité serveur après un
// premier succès — donc aucun moyen de savoir, au clic suivant, qu'il
// fallait mettre à jour plutôt que créer. Côté Local/Invité, le
// dédoublonnage par id fonctionnait déjà, mais le compteur "prochain
// numéro" avançait quand même à chaque sauvegarde, y compris une simple
// mise à jour.
//
// Ce banc couvre le mode Local/Invité (seul testable sans compte réel — voir
// REPRISE_SESSION.md, § "Ce qui n'a pas été éprouvé") : dédoublonnage par id,
// non-incrémentation du numéro sur une mise à jour, libellé du bouton, et
// confirmation demandée avant d'écraser un devis déjà enregistré (pas avant
// un tout premier enregistrement).
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode, addCatalogItemBySearch } from './lib/harness.mjs';

const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

// Le libellé change après le premier enregistrement ("Enregistrer" →
// "Mettre à jour", voir QuoteHeader/QuoteTotalsBar) : on accepte les deux
// pour ne pas casser le test au moment précis où le libellé bascule.
async function clickSaveButton(page) {
    return page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')]
            .find((b) => ['Enregistrer', 'Mettre à jour'].includes((b.textContent || '').trim()));
        if (!btn) return false;
        btn.click();
        return true;
    });
}

function readSavedQuotes(page) {
    return page.evaluate(() => {
        const raw = localStorage.getItem('costcalc:guest:savedQuotes');
        return raw ? JSON.parse(raw) : [];
    });
}

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1280, height: 900 });
        await enterGuestMode(page);

        // Client requis avant tout enregistrement (garde existante, non liée
        // à ce correctif) — sélection d'un client de démonstration.
        const clientInput = 'input[aria-label="Client du devis"]';
        await page.click(clientInput);
        await wait(150);
        await page.evaluate(() => {
            const option = [...document.querySelectorAll('[role="option"]')]
                .find((node) => node.textContent.includes('Société Immobilière NBB'));
            option?.click();
        });
        await wait(150);

        await addCatalogItemBySearch(page, 'Peinture Murale');
        await wait(200);

        // --- Premier "Enregistrer" : pas de confirmation attendue (rien à écraser) ---
        // Le Mode Démo est pré-rempli d'un jeu de données de démonstration
        // (voir index_jsx.js, "P0.8 — Données de démonstration réservées au
        // Mode Invité") : on compare un DELTA, pas un compte absolu.
        const savedBeforeFirstSave = await readSavedQuotes(page);
        const baselineCount = savedBeforeFirstSave.length;

        await clickSaveButton(page);
        await wait(300);
        const confirmShownOnFirstSave = await page.evaluate(() => document.body.innerText.includes('Mettre à jour ce devis'));
        ok('Le premier enregistrement ne demande PAS de confirmation', !confirmShownOnFirstSave);

        const savedAfterFirstSave = await readSavedQuotes(page);
        ok(
            'Exactement un nouveau devis apparaît après le premier enregistrement (préfixé en tête de liste)',
            savedAfterFirstSave.length === baselineCount + 1,
            `avant=${baselineCount}, après=${savedAfterFirstSave.length}`
        );
        const firstId = savedAfterFirstSave[0]?.id;
        const firstNumber = savedAfterFirstSave[0]?.number;

        // Le bouton doit maintenant annoncer une mise à jour, pas une création.
        const buttonSaysUpdate = await page.evaluate(() => document.body.innerText.includes('Mettre à jour'));
        ok('Le bouton affiche "Mettre à jour" après un premier enregistrement réussi', buttonSaysUpdate);

        // --- Modification, puis second "Enregistrer" : confirmation attendue ---
        // Un simple changement de taux de TVA suffit à modifier le devis,
        // sans dépendre à nouveau du modal de recherche catalogue.
        await page.select('select[aria-label="Taux de TVA du devis"]', '10');
        await wait(200);

        const confirmClicked = await clickSaveButton(page);
        await wait(250);
        const confirmDialogShown = await page.evaluate(() => document.body.innerText.includes('Mettre à jour ce devis'));
        ok('Ré-enregistrer un devis déjà sauvegardé demande confirmation', confirmClicked && confirmDialogShown);

        // Confirmer la mise à jour (bouton "Mettre à jour" du dialogue de
        // confirmation lui-même — pas celui de l'en-tête, resté derrière le
        // voile de la boîte de dialogue).
        await page.evaluate(() => {
            const dialog = [...document.querySelectorAll('h3')].find((h) => h.textContent.trim() === 'Mettre à jour ce devis ?')?.closest('div');
            const btn = dialog ? [...dialog.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Mettre à jour') : null;
            btn?.click();
        });
        await wait(300);

        const savedAfterSecondSave = await readSavedQuotes(page);
        ok(
            'Toujours le même nombre de devis après la mise à jour — pas de doublon supplémentaire',
            savedAfterSecondSave.length === baselineCount + 1,
            `avant=${baselineCount + 1}, après=${savedAfterSecondSave.length}`
        );
        ok(
            'Le numéro du devis n\'a pas changé après la mise à jour (pas de nouvelle numérotation)',
            savedAfterSecondSave[0]?.number === firstNumber,
            `avant=${firstNumber}, après=${savedAfterSecondSave[0]?.number}`
        );
        ok(
            'L\'identité (id) du devis reste la même après la mise à jour',
            savedAfterSecondSave[0]?.id === firstId,
            `avant=${firstId}, après=${savedAfterSecondSave[0]?.id}`
        );

        // Le contenu, lui, doit refléter la modification (nouveau taux de TVA).
        const updatedVatRate = savedAfterSecondSave[0]?.vatRate;
        ok('Le contenu mis à jour est bien celui du devis modifié (TVA 10%)', updatedVatRate === 10, `vatRate=${updatedVatRate}`);
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
