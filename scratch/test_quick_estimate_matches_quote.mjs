// Banc d'essai — Audit UX du 2026-08-31, P0 « l'assistant promet 46 M et
// livre 146 M ».
//
// Scénario d'origine : Assistant → Estimation Rapide → Construction Villa,
// valeurs par défaut. L'écran annonçait une fourchette de 35,88 à 43,68 M FCFA
// HT (budget 46,02 M TTC), puis « Transformer en Devis Détaillé » produisait
// 124,06 M HT / 146,39 M TTC — un facteur 3,2. L'écart était MAXIMAL à la
// valeur par défaut, c'est-à-dire exactement ce que voit le premier
// utilisateur, et il arrivait après que celui-ci ait pu montrer l'estimation à
// son client.
//
// Cause : ni le barème ni le gabarit n'étaient faux. `defaultSurface` — la
// quantité pour laquelle le gabarit a été dimensionné, et donc la référence de
// mise à l'échelle — valait 150 m² pour un gabarit qui se décrit lui-même comme
// une villa duplex de standing de ~440 m² (terrassement 25 × 20 m, plancher RDC
// 14 × 20, plancher R+1 16 × 20, 640 m² de maçonnerie, 440 m² de carrelage,
// 1 300 m² de peinture). Une fois la bonne référence posée :
//   124 061 344 HT / 440 m² = 281 958 FCFA/m²
//   barème villa_house / standard = 260 000 FCFA/m²   → +8 %, dans la marge.
// Même erreur sur la façade ACM (référence 120 pour un gabarit à 180 m²).
//
// Ce banc ne fige aucun montant : il vérifie l'ACCORD entre les deux sources,
// quelles que soient leurs évolutions futures. C'est la propriété qui compte —
// un barème peut être révisé, un gabarit recalibré ; ce qu'un utilisateur ne
// doit jamais revoir, c'est une promesse contredite par le devis qui la suit.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 400) => new Promise((r) => setTimeout(r, ms));
// Les montants sont séparés par U+202F (espace fine insécable) et U+00A0 :
// chaque lecture retire donc toute espace avant d'extraire les nombres.

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page);

        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find((x) => /Nouveau devis/.test(x.textContent || ''));
            if (b) b.click();
        });
        await wait(1200);

        // Fourchette annoncée par l'assistant, aux valeurs par défaut.
        const annonce = await page.evaluate(() => {
            const t = document.body.innerText.replace(/[\s\u202f\u00a0]/g, '');
            const f = t.match(/FOURCHETTEESTIMATIVENETHT(\d+)FCFAà(\d+)FCFA/);
            const surf = t.match(/—(\d+)m²/);
            return f ? { minHT: parseInt(f[1], 10), maxHT: parseInt(f[2], 10), surface: surf ? parseInt(surf[1], 10) : null } : null;
        });
        ok('L\'assistant annonce une fourchette chiffrée', annonce !== null,
            annonce ? `${annonce.minHT} – ${annonce.maxHT} HT sur ${annonce.surface} m²` : '');

        // Devis réellement généré.
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find((x) => /Transformer en Devis Détaillé/.test(x.textContent || ''));
            if (b) b.click();
        });
        await wait(2500);

        const reel = await page.evaluate(() => {
            const barre = document.querySelector('.quote-totals-bar');
            if (!barre) return null;
            const norm = barre.innerText.replace(/[\s\u202f\u00a0]/g, '');
            const m = norm.match(/TOTALNETHT(\d+)FCFA/);
            return m ? parseInt(m[1], 10) : null;
        });
        ok('Le devis détaillé est généré et chiffré', reel !== null && reel > 0, `netHT=${reel}`);

        if (annonce && reel) {
            ok('Le devis détaillé tombe DANS la fourchette annoncée par l\'assistant',
                reel >= annonce.minHT && reel <= annonce.maxHT,
                `devis=${reel} HT · fourchette=${annonce.minHT}–${annonce.maxHT} HT`);

            const milieu = (annonce.minHT + annonce.maxHT) / 2;
            const ecart = Math.abs(reel - milieu) / milieu;
            ok('L\'écart au milieu de fourchette reste sous 15 % (contre ×3,2 avant)',
                ecart < 0.15, `écart=${(ecart * 100).toFixed(1)} %`);
        }

        // Les libellés techniques ne doivent pas atteindre le document client.
        const restes = await page.evaluate(() => {
            const t = document.body.innerText;
            return {
                clientPlaceholder: t.includes('Client Estimation Rapide'),
                numeroEST: /DEV-\d{4}-EST-\d+/.test(t)
            };
        });
        ok('Aucun client « Client Estimation Rapide » ne subsiste', !restes.clientPlaceholder);
        ok('Aucun numéro au format technique « -EST-nnn » ne subsiste', !restes.numeroEST);
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
