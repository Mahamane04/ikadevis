// Banc d'essai — second signalement du même utilisateur, 2026-09-02 :
// « le problème de télécharger le pdf n'est toujours pas réglé ».
//
// Le correctif de la veille visait le bon symptôme (deux #printArea, dont un
// invisible) mais pas la cause profonde. Celle-ci, mesurée en production :
//
//   html2canvas rend le clone dans une iframe dont la largeur est celle passée
//   en `windowWidth`, et les MEDIA QUERIES du document y sont réévaluées. Le
//   code posait `windowWidth = 920` pour obtenir une mise en page A4. Or le
//   panneau de détail d'un devis vit sous `hidden lg:flex` : à 920 px, sous le
//   seuil `lg` de Tailwind (1024 px), il devient `display:none` DANS LE CLONE.
//
// Mesures sur la production, devis d'exemple ouvert depuis « Mes devis » :
//
//   viewport   windowWidth=920 (code)   largeur réelle + forçage A4
//   1440         0 × 0                    800 × 1358
//   1280         0 × 0                    800 × 1358
//   1100         0 × 0                    800 × 1358
//   1024         0 × 0                    800 × 1358
//
// La capture optimisée échouait donc à TOUS LES COUPS sur écran de bureau.
// Le téléchargement aboutissait quand même — le repli sans `windowWidth`
// rattrapait — mais en capturant à la largeur réelle du panneau (530 px) :
// un PDF comprimé, exactement ce que le paramètre voulait éviter. Et dès que
// le repli lâchait à son tour, l'utilisateur n'avait plus rien.
//
// Le mobile impose l'inverse : à 390 px, la modale est la zone visible et il
// FAUT élargir le clone, sinon la capture retombe à 366 px. D'où le maximum
// entre la largeur réelle et le plancher A4 — les deux besoins sont opposés.
//
// Ce banc vérifie la propriété qui compte : la PREMIÈRE capture aboutit, à la
// largeur A4, sans recourir au repli.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms));

async function mesurer(page, largeur, hauteur) {
    await page.setViewport({ width: largeur, height: hauteur });
    await wait(700);
    return page.evaluate(async () => {
        const cible = [...document.querySelectorAll('[data-zone-impression]')]
            .find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
        if (!cible) return { erreur: 'aucune zone visible' };
        // Reproduit exactement ce que fait telechargerElementEnPdf, première
        // tentative seulement — c'est elle qui doit réussir.
        const LARGEUR_CAPTURE = 800;
        const largeurClone = Math.max(document.documentElement.clientWidth || window.innerWidth || 0, LARGEUR_CAPTURE + 120);
        cible.setAttribute('data-pdf-cible', '1');
        try {
            const c = await window.html2canvas(cible, {
                scale: 1, useCORS: true, backgroundColor: '#ffffff', logging: false,
                scrollX: 0, scrollY: -window.scrollY, windowWidth: largeurClone,
                onclone: (d) => {
                    const t = d.querySelector('[data-pdf-cible]');
                    if (!t) return;
                    t.style.width = LARGEUR_CAPTURE + 'px';
                    t.style.maxWidth = 'none';
                    for (let p = t.parentElement; p && p !== d.body; p = p.parentElement) {
                        p.style.overflow = 'visible'; p.style.maxHeight = 'none';
                        p.style.height = 'auto'; p.style.maxWidth = 'none';
                    }
                }
            });
            return { largeurClone, w: c.width, h: c.height };
        } catch (e) {
            return { largeurClone, erreur: String(e).slice(0, 120) };
        } finally {
            cible.removeAttribute('data-pdf-cible');
        }
    });
}

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page, { demo: true });
        await wait(2000);
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('aside button')].find((x) => (x.textContent || '').trim().startsWith('Mes devis'));
            if (b) b.click();
        });
        await wait(1800);
        await page.evaluate(() => { const tr = document.querySelector('tbody tr'); if (tr) tr.click(); });
        await wait(2200);

        // Charger html2canvas comme le fait le premier clic réel.
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')]
                .filter((x) => /Télécharger le PDF/.test(x.textContent || ''))
                .find((x) => x.getBoundingClientRect().width > 0);
            if (b) b.click();
        });
        await page.waitForFunction(() => typeof window.html2canvas === 'function', { timeout: 30000 });
        await wait(2500);

        for (const [l, h] of [[1440, 900], [1280, 800], [1100, 800], [1024, 800]]) {
            const m = await mesurer(page, l, h);
            ok(`Capture A4 réussie du premier coup à ${l} px — ${m.w}×${m.h}`,
                !m.erreur && m.w > 0 && m.h > 0, `clone=${m.largeurClone}px`);
            // 800 px, c'est la mise en page A4 voulue. En dessous, le PDF sort
            // comprimé même s'il sort : c'est le défaut qu'on corrige.
            ok(`Le document est capturé à la largeur A4 à ${l} px — ${m.w} px`, m.w >= 780);
        }

        // Le téléphone, dont le besoin est opposé : sans plancher, la capture
        // retomberait à la largeur de la modale (366 px).
        const mobile = await mesurer(page, 390, 844);
        ok(`Sur mobile la capture reste élargie, pas comprimée — ${mobile.w}×${mobile.h}`,
            !mobile.erreur && mobile.w >= 780, `clone=${mobile.largeurClone}px`);
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
