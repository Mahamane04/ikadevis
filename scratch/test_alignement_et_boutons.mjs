// Banc d'essai — deux signalements visuels du 2026-09-02, captures à l'appui.
//
// 1. « Tu vois le décalage lorsque tu commences à saisir le nom du client ? »
//
//    Régression que j'avais introduite le matin même. En élargissant la zone
//    cliquable des croix « Effacer » (cibles de 20 px, sous le minimum WCAG),
//    j'avais écrit `.champ-effacer { position: relative }` pour ancrer le
//    calque ::after. Posée APRÈS Tailwind dans la feuille, cette règle écrasait
//    le `absolute` de la classe utilitaire : la croix retombait dans le flux.
//
//    Mesuré avant correction, dès la première frappe :
//      racine du champ  30 px → 54 px
//      champ Client     y=170 → y=168   (remonte de 2 px)
//      champ Projet     y=170 → y=180   (descend de 10 px)
//
//    Un élément en `position: absolute` est déjà un bloc conteneur pour ses
//    propres enfants absolus : la règle était inutile autant que nuisible.
//
// 2. « Les boutons sont trop carrés et grands, le plus minime possible. »
//
//    Les boutons des fenêtres de confirmation héritaient de .btn-secondary /
//    .btn-primary, dimensionnés pour des actions de pleine page, et
//    s'étiraient en `flex-1` : trois pavés de taille égale, sans hiérarchie.
//    47 px de haut, rayon 12 px. Ramenés à 34 px et rayon 8, alignés à droite.
//    Sur téléphone ils reprennent la pleine largeur et 44 px : discret ne doit
//    pas vouloir dire difficile à toucher.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 800) => new Promise((r) => setTimeout(r, ms));

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        // ── 1. Alignement de la ligne Client / Projet ─────────────────────
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page, { demo: false });
        await wait(2400);
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('aside button')].find((x) => (x.textContent || '').trim().startsWith('Chiffrage'));
            if (b) b.click();
        });
        await wait(1600);

        const mesurer = () => page.evaluate(() => {
            const i = document.querySelector('input[aria-label^="Client du devis"]');
            const p = document.querySelector('input[aria-label^="Projet du devis"]');
            const b = (e) => { const r = e.getBoundingClientRect(); return { h: Math.round(r.height), y: Math.round(r.y) }; };
            return { client: b(i), projet: b(p), racine: b(i.closest('.relative')) };
        });

        const avant = await mesurer();
        await page.click('input[aria-label^="Client du devis"]');
        await page.keyboard.type('eerr', { delay: 40 });
        await wait(700);
        const apres = await mesurer();

        ok(`La hauteur du champ ne change pas à la saisie — ${avant.racine.h} → ${apres.racine.h} px`,
            apres.racine.h === avant.racine.h);
        ok(`Le champ Client ne se déplace pas — y ${avant.client.y} → ${apres.client.y}`,
            apres.client.y === avant.client.y);
        ok(`Le champ Projet ne se déplace pas — y ${avant.projet.y} → ${apres.projet.y}`,
            apres.projet.y === avant.projet.y);
        ok('Client et Projet restent alignés', apres.client.y === apres.projet.y);

        // La croix doit rester hors du flux ET garder sa zone élargie.
        const croix = await page.evaluate(() => {
            const c = document.querySelector('.champ-effacer');
            if (!c) return { absente: true };
            const r = c.getBoundingClientRect();
            const touche = (dx) => {
                const e = document.elementFromPoint(r.left + r.width / 2 + dx, r.top + r.height / 2);
                return !!(e && (e === c || c.contains(e)));
            };
            return { position: getComputedStyle(c).position, centre: touche(0), etendue: touche(14) };
        });
        ok('La croix « Effacer » reste hors du flux', croix.position === 'absolute', `position=${croix.position}`);
        ok('…tout en gardant sa zone atteignable élargie', croix.centre && croix.etendue);

        // ── 2. Boutons des fenêtres de confirmation ───────────────────────
        // Une saisie dans le champ Client ne suffit pas à marquer le devis
        // comme modifié : seul un vrai changement d'ouvrage le fait. Sans
        // cela, la garde de sortie ne s'ouvre pas et le banc n'a pas de
        // spécimen à mesurer.
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find((x) => /Ajouter une ligne libre/.test(x.textContent || ''));
            if (b) b.click();
        });
        await wait(1200);
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('aside button')].find((x) => (x.textContent || '').trim().startsWith('Mes devis'));
            if (b) b.click();
        });
        await wait(900);
        // La garde de sortie s'ouvre : elle sert aussi de spécimen.
        const bureau = await page.evaluate(() => {
            const d = document.querySelector('[role="dialog"][aria-modal="true"]');
            if (!d) return null;
            return [...d.querySelectorAll('button')].map((b) => {
                const r = b.getBoundingClientRect();
                return { t: b.textContent.trim(), h: Math.round(r.height), l: Math.round(r.width), r: getComputedStyle(b).borderRadius };
            });
        });
        ok('Une fenêtre de confirmation est disponible comme spécimen', !!bureau && bureau.length >= 2);
        if (bureau) {
            ok(`Les boutons sont compacts sur bureau — ${bureau.map((b) => b.h).join(', ')} px de haut`,
                bureau.every((b) => b.h <= 38));
            ok(`Ils ne s'étirent plus sur toute la largeur — ${bureau.map((b) => b.l).join(', ')} px`,
                bureau.every((b) => b.l < 220));
            ok(`Les angles sont moins carrés — rayon ${bureau[0].r}`, parseInt(bureau[0].r, 10) <= 8);
        }

        // Sur téléphone : pleine largeur et 44 px, la compacité ne doit pas
        // rendre la cible difficile à toucher.
        await page.setViewport({ width: 390, height: 844 });
        await wait(900);
        const mobile = await page.evaluate(() => {
            const d = document.querySelector('[role="dialog"][aria-modal="true"]');
            if (!d) return null;
            return [...d.querySelectorAll('button')].map((b) => {
                const r = b.getBoundingClientRect();
                return { h: Math.round(r.height), l: Math.round(r.width) };
            });
        });
        if (mobile) {
            ok(`Sur téléphone ils gardent 44 px de haut — ${mobile.map((b) => b.h).join(', ')}`,
                mobile.every((b) => b.h >= 42));
            ok('…et reprennent la pleine largeur', mobile.every((b) => b.l > 200));
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
