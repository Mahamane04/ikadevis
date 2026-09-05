// Banc d'essai — l'écran de connexion doit défiler (2026-09-05).
//
// Signalé : « la page de connexion, le scroll n'est plus possible ».
//
// Cause : `body { overflow: hidden }` est posé pour l'APPLICATION, dont la
// coquille fait 100 dvh et gère son propre défilement dans des conteneurs
// internes. Mais cette déclaration se PROPAGE à la fenêtre quand `html` reste
// `visible` — et l'écran de connexion, lui, n'a aucun conteneur défilant.
// Mesuré à l'origine : 1094 px de contenu pour 620 px de fenêtre, soit 474 px
// inatteignables, mot de passe et boutons compris.
//
// Deux pièges de mesure rencontrés en diagnostiquant, que ce banc évite :
//
//  1. `scrollHeight > clientHeight` ne prouve RIEN. C'est vrai même quand le
//     défilement est interdit : `overflow: hidden` veut dire « défilable mais
//     sans mécanisme offert à l'utilisateur ».
//  2. Écrire `scrollTop` en JavaScript réussit AUSSI avec `overflow: hidden` —
//     le défilement programmatique reste permis. Seul un vrai événement de
//     molette prouve que l'utilisateur peut atteindre le bas.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 900) => new Promise((r) => setTimeout(r, ms));

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        // 620 px de haut : une fenêtre de portable très courante, et la hauteur
        // à laquelle le défaut a été constaté.
        await page.setViewport({ width: 1280, height: 620 });
        await wait(2500);

        const avant = await page.evaluate(() => {
            const se = document.scrollingElement;
            return {
                ecranConnexion: !!document.querySelector('.auth-screen'),
                contenu: se.scrollHeight,
                fenetre: se.clientHeight,
                bodyOverflow: getComputedStyle(document.body).overflowY,
                htmlOverflow: getComputedStyle(document.documentElement).overflowY
            };
        });

        ok('L’écran de connexion est bien affiché', avant.ecranConnexion);
        // Sans débordement, le banc ne prouverait rien : on vérifie d'abord
        // que la situation à risque est bien reproduite.
        ok(`Le contenu dépasse la fenêtre — ${avant.contenu} px pour ${avant.fenetre} px`,
            avant.contenu > avant.fenetre);
        ok(`Le défilement n’est pas interdit — body ${avant.bodyOverflow}, html ${avant.htmlOverflow}`,
            avant.bodyOverflow !== 'hidden');

        // LE contrôle : un vrai événement de molette, pas une écriture de
        // scrollTop qui réussirait même avec overflow:hidden.
        await page.evaluate(() => { document.scrollingElement.scrollTop = 0; });
        await page.mouse.move(640, 300);
        await page.mouse.wheel({ deltaY: 1200 });
        await wait(800);

        const apres = await page.evaluate(() => {
            const se = document.scrollingElement;
            const bouton = [...document.querySelectorAll('button')]
                .find((b) => /Essayer sans compte/.test(b.textContent || ''));
            const r = bouton && bouton.getBoundingClientRect();
            return {
                position: Math.round(se.scrollTop),
                course: Math.round(se.scrollHeight - se.clientHeight),
                boutonAtteignable: r ? (r.top >= 0 && r.bottom <= window.innerHeight) : null
            };
        });

        ok(`La molette fait défiler la page — ${apres.position} px sur ${apres.course}`,
            apres.position > 0);
        ok('Le bas de l’écran devient atteignable', apres.boutonAtteignable === true);

        // ── Aucune régression sur l'application ──────────────────────────
        // `overflow: hidden` doit revenir dès qu'on quitte l'écran de
        // connexion : la coquille de l'application défile dans ses propres
        // conteneurs, une barre au niveau du document y serait un défaut.
        await enterGuestMode(page, { demo: true });
        await wait(2600);
        const dansApp = await page.evaluate(() => {
            const se = document.scrollingElement;
            return {
                ecranConnexion: !!document.querySelector('.auth-screen'),
                bodyOverflow: getComputedStyle(document.body).overflowY,
                deborde: se.scrollHeight > se.clientHeight
            };
        });
        ok('Une fois connecté, l’écran de connexion a disparu', dansApp.ecranConnexion === false);
        ok(`…et l’application retrouve son overflow hidden — ${dansApp.bodyOverflow}`,
            dansApp.bodyOverflow === 'hidden');
        ok('…sans barre de défilement au niveau du document', dansApp.deborde === false);
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
