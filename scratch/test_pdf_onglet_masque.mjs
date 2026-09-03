// Banc d'essai — défaut trouvé le 2026-09-03 en testant sur un vrai compte,
// dans un panneau de navigateur masqué.
//
// La capture en bac à sable, ajoutée la veille, attendait deux
// `requestAnimationFrame` avant de mesurer la copie du document. Or un
// navigateur ne déclenche PLUS rAF dans une page masquée : l'attente ne se
// terminait jamais. Le bouton restait figé sur « Génération… »
// indéfiniment — pas d'erreur, pas de message, rien.
//
// Ce n'est pas un cas de laboratoire : cliquer sur « Télécharger le PDF »
// puis passer à un autre onglet est exactement ce qu'on fait en attendant un
// téléchargement. Le défaut avait été introduit par mon propre correctif.
//
// L'attente est désormais une course entre rAF et un délai de 150 ms : la
// génération avance que l'onglet soit au premier plan ou non.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 800) => new Promise((r) => setTimeout(r, ms));

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page, { demo: true });
        await wait(2200);
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('aside button')].find((x) => (x.textContent || '').trim().startsWith('Mes devis'));
            if (b) b.click();
        });
        await wait(1800);
        await page.evaluate(() => { const tr = document.querySelector('tbody tr'); if (tr) tr.click(); });
        await wait(2200);

        // Forcer l'état « onglet masqué » : c'est la condition qui bloquait.
        // On remplace requestAnimationFrame par une fonction qui n'appelle
        // JAMAIS son argument, ce que fait un navigateur sur une page cachée.
        await page.evaluate(() => {
            window.__rafOrigine = window.requestAnimationFrame;
            window.requestAnimationFrame = () => 0;
        });

        const resultat = await page.evaluate(async () => {
            window.__msgs = [];
            new MutationObserver(() => {
                document.querySelectorAll('[role="alert"],[role="status"]').forEach((e) => {
                    const t = e.innerText.replace(/\n/g, ' ').trim();
                    if (t && !window.__msgs.includes(t)) window.__msgs.push(t);
                });
            }).observe(document.body, { childList: true, subtree: true, characterData: true });
            const b = [...document.querySelectorAll('button')]
                .find((x) => /Télécharger le devis en PDF/.test(x.getAttribute('aria-label') || ''));
            if (!b) return { erreur: 'bouton introuvable' };
            b.click();
            await new Promise((r) => setTimeout(r, 15000));
            return { messages: window.__msgs, texteDuBouton: b.textContent.trim() };
        });

        ok('Le bouton PDF est atteignable', !resultat.erreur, resultat.erreur || '');
        ok(`La génération ne reste pas bloquée sans rAF — bouton « ${resultat.texteDuBouton} »`,
            !/Génération/.test(resultat.texteDuBouton || ''));
        ok(`Un message est bien rendu — « ${(resultat.messages || []).join(' | ').slice(0, 70)} »`,
            (resultat.messages || []).length > 0);
        ok('Et ce n’est pas un message d’échec',
            !/Génération impossible|pas pu être rendu/.test((resultat.messages || []).join(' ')));

        await page.evaluate(() => { if (window.__rafOrigine) window.requestAnimationFrame = window.__rafOrigine; });
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
