// Banc d'essai — Audit UX du 2026-08-31, P0 « facturation fantôme ».
//
// Le sélecteur « Mode de Métré » de l'inspecteur AVANCÉ listait les six modes
// en dur, sans filtrer par `allowedModes`, alors que le Mode Simple et l'écran
// d'ajout au devis, eux, filtraient déjà. Reproduit en trois clics sur un
// ouvrage réel du catalogue (« Panneau avec cadre métallique et autocollant »,
// allowedModes: ['rectangle']) : choisir « Surface Directe (m²) » puis saisir
// 0 produisait une ligne affichant « 0 m² » facturée 37 500 FCFA HT
// (44 250 FCFA TTC). La recette continuait de calculer sur LARGEUR/HAUTEUR,
// qui gardent la valeur du mode rectangle, pendant que la SURFACE affichée
// valait bien 0.
//
// Pourquoi un banc dédié, alors que test_zero_negative_no_phantom_charge.mjs
// existe déjà : ce dernier n'exerce QUE l'ouvrage « Carrelage », dont les
// modes autorisés incluent 'surface' et qui tombait donc correctement à 0. Il
// ne pouvait pas voir ce bug. Il l'a pourtant signalé pendant un temps, par
// accident : sous la charge de la suite complète, son `page.type` perdait la
// course contre le debounce du filtre et il ajoutait le premier ouvrage du
// catalogue non filtré — le Panneau, justement. Un test rouge pour la mauvaise
// raison, redevenu vert sans que le bug soit corrigé.
//
// Ce banc-ci vérifie la règle elle-même, pas ses conséquences chiffrées :
// un ouvrage ne doit jamais se voir proposer un mode de métré que sa recette
// ne sait pas calculer.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode, addCatalogItemBySearch } from './lib/harness.mjs';

// Ouvre l'inspecteur avancé du 1er ouvrage et lit les options du sélecteur
// de mode de métré.
async function lireModesProposes(page) {
    await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')]
            .find((b) => (b.getAttribute('aria-label') || '').startsWith('Détails techniques de'));
        if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 200));
    await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('⚙️ Avancé'));
        if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 250));
    return page.evaluate(() => {
        const modes = ['rectangle', 'surface', 'volume', 'linear', 'floor', 'unit'];
        const sel = [...document.querySelectorAll('select')]
            .find((s) => [...s.options].every((o) => modes.includes(o.value)) && s.options.length > 0);
        if (!sel) return null;
        return { options: [...sel.options].map((o) => o.value), valeur: sel.value };
    });
}

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    // --- Cas 1 : ouvrage mono-mode (Panneau, 'rectangle' uniquement) ---
    {
        const { page, close } = await launchApp();
        try {
            await enterGuestMode(page);
            await addCatalogItemBySearch(page, 'Panneau avec cadre');
            const r = await lireModesProposes(page);
            ok(
                'Sélecteur de mode trouvé dans l\'inspecteur avancé',
                r !== null,
                r === null ? 'aucun <select> de mode identifié' : ''
            );
            ok(
                'Un ouvrage rectangle-seul ne propose QUE « rectangle » (pas de mode que sa recette ne sait pas calculer)',
                r && r.options.length === 1 && r.options[0] === 'rectangle',
                `proposés=${r ? JSON.stringify(r.options) : 'n/a'}`
            );
            ok(
                'Aucun mode surfacique proposé sur cet ouvrage (chemin du P0 « 0 m² facturé 37 500 FCFA » fermé)',
                r && !r.options.includes('surface') && !r.options.includes('floor'),
                `proposés=${r ? JSON.stringify(r.options) : 'n/a'}`
            );
        } finally {
            await close();
        }
    }

    // --- Cas 2 : ouvrage multi-modes — la restriction ne doit rien retirer ---
    // Contrôle inverse : sans lui, « ne proposer qu'un mode » passerait aussi
    // en cassant les ouvrages qui en autorisent plusieurs.
    {
        const { page, close } = await launchApp();
        try {
            await enterGuestMode(page);
            await addCatalogItemBySearch(page, 'Peinture Murale');
            const r = await lireModesProposes(page);
            ok(
                'Un ouvrage multi-modes conserve tous ses modes autorisés (surface + sol/plafond)',
                r && r.options.includes('surface') && r.options.includes('floor'),
                `proposés=${r ? JSON.stringify(r.options) : 'n/a'}`
            );
            ok(
                'Et aucun mode NON autorisé ne s\'y est glissé',
                r && r.options.every((m) => ['surface', 'floor'].includes(m)),
                `proposés=${r ? JSON.stringify(r.options) : 'n/a'}`
            );
        } finally {
            await close();
        }
    }

    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const results = await run();
    for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    process.exit(results.every((r) => r.pass) ? 0 : 1);
}
