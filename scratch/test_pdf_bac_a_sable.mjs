// Banc d'essai — troisième signalement du même défaut, 2026-09-02 :
// « toujours pas possible de télécharger le PDF ».
//
// ⚠️ À lire avant de faire confiance à ce banc : il ne reproduit PAS la panne
// signalée. Il protège une propriété structurelle, ce qui n'est pas la même
// chose, et il faut le savoir.
//
// Ce que le diagnostic ajouté au passage précédent a livré :
//
//     zone 720x1918, A4@1800=0x0, repli=0x0
//
// Les DEUX tentatives rendaient un canvas vide pour une zone pourtant bien
// dimensionnée. Ce qui a été éprouvé et ÉCARTÉ depuis, mesures à l'appui :
//   • la largeur de fenêtre : testée jusqu'à 1800 px, capture correcte ;
//   • le logo data-URI : injecté à l'identique, capture correcte ;
//   • le document lui-même : le devis DEV-2026-022 de l'utilisateur, rejoué
//     depuis sa base en mode invité, se capture en 1600 × 3886 ;
//   • le sabotage de la chaîne d'ancêtres (overflow, hauteur, largeur,
//     content-visibility, contain) : l'ANCIEN code y survit aussi.
//
// La cause exacte reste donc inconnue à ce jour. Ce qui a changé n'est pas un
// correctif ciblé mais la suppression d'une fragilité : le document vivait au
// fond d'une chaîne de conteneurs contraints (panneau `hidden lg:flex`, carte
// `h-full overflow-hidden`, zone `overflow-auto`, flex `min-h-0`), et le
// capturer là obligeait à réécrire ses ancêtres dans le clone. Il est
// désormais copié dans un bac à sable posé sur <body>, à la largeur A4, sans
// aucun ancêtre — toute une famille de causes possibles disparaît avec eux.
//
// Ce banc vérifie donc trois choses vraies et vérifiables : le bac est bien
// la voie empruntée, il est monté à la bonne largeur, et il ne laisse aucune
// trace. Si la panne persiste chez l'utilisateur, le message d'erreur porte
// maintenant le résultat du bac en plus des deux autres.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms));

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

        // Observer le bac PENDANT la capture : c'est la seule façon de prouver
        // qu'il est réellement la voie empruntée, puisqu'il disparaît ensuite.
        const observe = await page.evaluate(async () => {
            window.__bac = null;
            window.__msgs = [];
            new MutationObserver(() => {
                const b = document.querySelector('[data-pdf-bac]');
                if (b && !window.__bac) {
                    const copie = b.firstElementChild;
                    window.__bac = {
                        largeurBac: Math.round(b.getBoundingClientRect().width),
                        largeurCopie: copie ? Math.round(copie.getBoundingClientRect().width) : 0,
                        hauteurCopie: copie ? Math.round(copie.getBoundingClientRect().height) : 0,
                        // Le bac doit être rendu, pas masqué : un display:none
                        // ou un visibility:hidden donnerait lui-même un canvas vide.
                        affichage: getComputedStyle(b).display,
                        visibilite: getComputedStyle(b).visibility,
                        // Et hors champ, pour que l'utilisateur ne voie rien.
                        horsChamp: b.getBoundingClientRect().right < 0
                    };
                }
                document.querySelectorAll('[role="alert"],[role="status"]').forEach((e) => {
                    const t = e.innerText.replace(/\n/g, ' ').trim();
                    if (t && !window.__msgs.includes(t)) window.__msgs.push(t);
                });
            }).observe(document.body, { childList: true, subtree: true, characterData: true });

            const b = [...document.querySelectorAll('button')]
                .filter((x) => /Télécharger le PDF/.test(x.textContent || ''))
                .find((x) => x.getBoundingClientRect().width > 0);
            if (!b) return { erreur: 'bouton introuvable' };
            b.click();
            await new Promise((r) => setTimeout(r, 13000));
            return { bac: window.__bac, messages: window.__msgs.join(' | ') || '(aucun message)' };
        });

        ok('Le bac à sable est bien la voie empruntée pour la capture',
            !!observe.bac, observe.erreur || 'aucun bac observé pendant la capture');
        if (observe.bac) {
            ok(`La copie est montée à la largeur A4 — ${observe.bac.largeurCopie} px`,
                observe.bac.largeurCopie >= 780 && observe.bac.largeurCopie <= 820);
            ok(`La copie a une hauteur réelle — ${observe.bac.hauteurCopie} px`,
                observe.bac.hauteurCopie > 200);
            ok('Le bac est rendu, ni display:none ni visibility:hidden',
                observe.bac.affichage !== 'none' && observe.bac.visibilite !== 'hidden',
                `display=${observe.bac.affichage} visibility=${observe.bac.visibilite}`);
            ok('Le bac est hors champ : l’utilisateur ne voit rien apparaître',
                observe.bac.horsChamp);
        }
        ok('Le téléchargement n’échoue pas',
            !/Génération impossible|pas pu être rendu/.test(observe.messages),
            `message=« ${String(observe.messages).slice(0, 80)} »`);

        const propre = await page.evaluate(() => document.querySelectorAll('[data-pdf-bac]').length);
        ok('Le bac est retiré du DOM après la capture', propre === 0, `restants=${propre}`);
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
