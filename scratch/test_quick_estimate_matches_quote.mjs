// Banc RETOURNÉ le 2026-09-02, à la demande de l'utilisateur.
//
// Ce fichier protégeait « l'Estimation Rapide » : un premier onglet qui, à
// partir d'une surface et d'un standing, annonçait un budget calculé sur des
// tarifs au m² écrits en dur dans le code (260 000 FCFA/m² pour une villa, par
// exemple). Le banc vérifiait que le devis détaillé généré ensuite tombait
// bien dans la fourchette annoncée — ce qu'il faisait, après recalage.
//
// L'utilisateur a tranché autrement : « je voudrais ici avoir d'abord une page
// vierge, créer seulement les nouveaux devis et les modèles que l'utilisateur a
// configurés au préalable (plus d'estimation fictive) ». Le raisonnement se
// tient : ces montants ne venaient d'aucun chiffrage, d'aucun catalogue et
// d'aucun fournisseur. Cohérents entre eux, mais inventés — et annoncés à un
// client dans une devise réelle.
//
// La fonctionnalité est donc retirée, et ce banc garde désormais la propriété
// INVERSE : aucune estimation fictive ne doit revenir dans l'assistant. Le
// fichier n'est pas supprimé pour que cette décision reste lisible ; un banc
// effacé n'explique rien à celui qui, dans six mois, se demandera où est passé
// l'onglet.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 700) => new Promise((r) => setTimeout(r, ms));

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page, { demo: true });
        await wait(2400);
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find((x) => /Nouveau devis/i.test(x.textContent || ''));
            if (b) b.click();
        });
        await wait(1200);

        const etat = await page.evaluate(() => {
            const visibles = [...document.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0);
            const texte = document.body.innerText;
            return {
                onglets: visibles.map((b) => (b.textContent || '').trim()).filter((t) => /^\d\./.test(t)),
                traceEstimation: /Estimation Rapide|ESTIMATION INDICATIVE|Tarif moyen|FOURCHETTE ESTIMATIVE|BUDGET MOYEN/i.test(texte),
                // La trame vierge doit être l'entrée par défaut.
                vierge: /Devis Vierge|Initialiser le Devis Vierge/i.test(texte)
            };
        });

        ok(`L'assistant ouvre sur le devis vierge — onglets ${JSON.stringify(etat.onglets)}`,
            etat.onglets[0] === '1. Devis vierge');
        ok('Aucune trace de l’estimation fictive', !etat.traceEstimation);
        ok('Le devis vierge est proposé d’emblée', etat.vierge);
        ok('L’onglet des modèles de l’utilisateur existe',
            etat.onglets.some((t) => /Mes modèles/.test(t)));
        ok('Les trames livrées sont annoncées comme des exemples, pas comme les siennes',
            etat.onglets.some((t) => /Exemples fournis/.test(t)));

        // Et le contenu de l'onglet des exemples porte l'avertissement.
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find((x) => /Exemples fournis/.test(x.textContent || ''));
            if (b) b.click();
        });
        await wait(700);
        ok('Les exemples préviennent que leurs prix ne sont pas ceux de l’utilisateur',
            await page.evaluate(() => /fournies avec l’application/.test(document.body.innerText)
                && /prix ne sont pas les vôtres/.test(document.body.innerText)));
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
