// Banc d'essai — Audit UX du 2026-08-31, P1 « mobile : 42 % d'en-tête figé,
// 26 % de zone de travail ».
//
// Mesuré à 375×812 avant correctif :
//   en-tête figé                                    338 px   42 %
//   zone de liste réellement visible                210 px   26 %
//   barre des totaux (227 px de contenu dans 191)   191 px   23 %
//   barre d'onglets                                 ~72 px    9 %
//
// La barre des totaux défilait donc À L'INTÉRIEUR d'elle-même et coupait en
// plein milieu son propre avertissement (« * Hors lignes libres sans coût
// d'achat renseigné — complétez les »). Rien ne laissait deviner qu'il
// manquait du texte.
//
// Second défaut, indépendant : la même destination portait deux noms selon le
// chemin emprunté — barre d'onglets « Calcul · Mes devis · Catalogue ·
// Ressources », tiroir « Créer un Devis · Devis · Catégorie Ouvrage ·
// Ressource ». Sur téléphone les deux surfaces cohabitent à quelques
// centimètres : on pouvait croire à des écrans distincts.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode, addCatalogItemBySearch } from './lib/harness.mjs';

const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms));

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
        await enterGuestMode(page);
        await addCatalogItemBySearch(page, 'Maçonnerie');
        await wait(900);

        const replie = await page.evaluate(() => {
            const barre = document.querySelector('.quote-totals-bar');
            if (!barre) return null;
            const r = barre.getBoundingClientRect();
            return {
                hauteur: Math.round(r.height),
                haut: Math.round(r.top),
                defileEnInterne: barre.scrollHeight > barre.clientHeight + 2,
                // `innerText` s'est révélé peu fiable en headless sur cet élément
                // (position: fixed dans un shell overflow-hidden) : il renvoyait ''
                // alors que le DOM et les boîtes étaient corrects. On interroge donc
                // directement ce qui définit « visible pour l'utilisateur » —
                // l'élément porte le texte ET n'est pas display:none.
                montreLeTTC: [...barre.querySelectorAll('span')]
                    .some((e) => /TOTAL TTC/i.test(e.textContent || '') && getComputedStyle(e).display !== 'none'
                        && getComputedStyle(e.closest('div')).display !== 'none'),
                aUneBascule: !!barre.querySelector('.quote-totals-bascule'),
                detailMasque: [...barre.querySelectorAll('.quote-metrique-secondaire')]
                    .every((e) => getComputedStyle(e).display === 'none')
            };
        });

        ok('La barre des totaux est présente sur téléphone', replie !== null);
        ok('Repliée, elle ne défile plus à l\'intérieur d\'elle-même (plus de texte coupé)',
            replie && !replie.defileEnInterne,
            replie ? `contenu ${replie.hauteur}px` : '');
        ok('Repliée, elle reste sous 150 px (contre 191 px avant)',
            replie && replie.hauteur <= 150, `hauteur=${replie && replie.hauteur}px`);
        ok('Le total TTC reste visible même repliée', replie && replie.montreLeTTC);
        ok('Un bouton permet d\'afficher le détail', replie && replie.aUneBascule);
        ok('Repliée, le détail est réellement masqué (et pas seulement hors champ)',
            replie && replie.detailMasque);

        // La zone de travail réellement utilisable doit avoir gagné de la place.
        ok('La zone de travail dépasse 350 px de haut (contre 210 px avant)',
            replie && (replie.haut - 80) > 350, `zone=${replie && (replie.haut - 80)}px`);

        // Déplié : tout doit être lisible, sans troncature.
        await page.evaluate(() => {
            const b = document.querySelector('.quote-totals-bascule');
            if (b) b.click();
        });
        await wait(700);
        const deplie = await page.evaluate(() => {
            const barre = document.querySelector('.quote-totals-bar');
            const visible = (motif) => [...barre.querySelectorAll('div')]
                .some((e) => motif.test(e.textContent || '') && getComputedStyle(e).display !== 'none');
            return {
                defileEnInterne: barre.scrollHeight > barre.clientHeight + 2,
                montreDebourse: visible(/Déboursé Sec/i),
                montreCoeffK: visible(/Coeff K/i)
            };
        });
        ok('Dépliée, le déboursé sec redevient visible', deplie.montreDebourse);
        ok('Dépliée, le coefficient K redevient visible', deplie.montreCoeffK);
        ok('Dépliée, rien n\'est tronqué par un défilement interne', !deplie.defileEnInterne);

        // Vocabulaire : chaque destination porte le même nom partout.
        const vocabulaire = await page.evaluate(() => {
            const onglets = [...document.querySelectorAll('.mobile-bottom-nav button')]
                .map((b) => b.textContent.trim()).filter(Boolean);
            // Ouvrir le tiroir pour lire ses libellés.
            const burger = [...document.querySelectorAll('button')]
                .find((b) => (b.getAttribute('aria-label') || '') === 'Ouvrir le menu de navigation');
            if (burger) burger.click();
            return { onglets };
        });
        await wait(600);
        const tiroir = await page.evaluate(() =>
            [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean));

        for (const onglet of vocabulaire.onglets) {
            ok(`« ${onglet} » (barre d'onglets) porte le même nom dans le tiroir`,
                tiroir.some((t) => t === onglet || t.startsWith(onglet)),
                `libellés du tiroir : ${tiroir.slice(0, 12).join(' · ')}`);
        }
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
