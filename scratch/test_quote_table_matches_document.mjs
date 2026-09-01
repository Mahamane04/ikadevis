// Banc d'essai — Audit UX du 2026-08-31, P1 « le tableau et le PDF ne disent
// pas la même chose ».
//
// Pour une même ligne, l'éditeur et le document client affichaient deux
// réalités différentes :
//
//   tableau   QTÉ 1 │ UNITÉ m² │ P.U. 259 425 │ TOTAL 259 425
//   document  25.00 m² │ 10 377 FCFA │ 259 425 FCFA
//
// La colonne QTÉ portait le multiplicateur d'ouvrages, la colonne UNITÉ
// portait l'unité de MÉTRÉ : côte à côte, elles annonçaient « un mètre carré
// de maçonnerie à 259 425 FCFA ». Un professionnel du BTP en conclut que le
// logiciel se trompe — au moment précis où il calcule juste, puisque le PDF,
// lui, était exact. Et c'est l'écran qu'on relit avant d'envoyer.
//
// Le correctif B1 du 2026-08-18 avait déjà réglé exactement ce point côté PDF
// (allCommercialItems, js/calc-engine.js) ; l'éditeur n'avait jamais suivi.
//
// Ce banc ne vérifie pas des valeurs figées mais l'ACCORD entre les deux
// surfaces : quelles que soient les évolutions du barème, le tableau et le
// document doivent annoncer la même quantité et le même prix unitaire.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode, addCatalogItemBySearch } from './lib/harness.mjs';

const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const nombres = (txt) => (txt.match(/[\d   .,]+/g) || [])
    .map((t) => parseFloat(t.replace(/[   ]/g, '').replace(',', '.')))
    .filter((n) => !Number.isNaN(n));

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1280, height: 900 });
        await enterGuestMode(page);
        await addCatalogItemBySearch(page, 'Maçonnerie');
        await wait(900);

        // Ce que montre le tableau de l'éditeur
        const tableau = await page.evaluate(() => {
            const tr = document.querySelectorAll('tr')[1];
            if (!tr) return null;
            const champs = [...tr.querySelectorAll('input')];
            const pu = champs.find((i) => /Prix unitaire/.test(i.getAttribute('aria-label') || ''));
            const cellules = [...tr.querySelectorAll('td')].map((td) => td.innerText.trim());
            return {
                prixUnitaire: pu ? parseFloat(pu.value) : null,
                quantiteAffichee: cellules[1] || '',
                uniteAffichee: cellules[2] || '',
                totalAffiche: cellules[4] || ''
            };
        });
        ok('Le tableau expose une ligne exploitable', tableau !== null);

        // Ce que montre le document client
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('Aperçu Client'));
            if (b) b.click();
        });
        await wait(1800);
        const document_ = await page.evaluate(() => {
            const carte = document.querySelector('.saved-quote-detail-card');
            if (!carte) return null;
            const t = [...carte.querySelectorAll('table')][0];
            if (!t) return null;
            const ligne = [...t.querySelectorAll('tr')].find((r) => /Maçonnerie/.test(r.innerText));
            if (!ligne) return null;
            const c = [...ligne.querySelectorAll('td')].map((td) => td.innerText.trim());
            return { quantite: c[1] || '', prixUnitaire: c[2] || '', total: c[3] || '' };
        });
        ok('Le document client expose la même ligne', document_ !== null);

        if (tableau && document_) {
            const qteTableau = nombres(tableau.quantiteAffichee)[0];
            const qteDocument = nombres(document_.quantite)[0];
            ok('Tableau et document annoncent la MÊME quantité',
                Math.abs(qteTableau - qteDocument) < 0.01,
                `tableau=${qteTableau} document=${qteDocument}`);

            const puDocument = nombres(document_.prixUnitaire)[0];
            ok('Tableau et document annoncent le MÊME prix unitaire',
                Math.abs(tableau.prixUnitaire - puDocument) <= 1,
                `tableau=${tableau.prixUnitaire} document=${puDocument}`);

            const totalTableau = nombres(tableau.totalAffiche)[0];
            const totalDocument = nombres(document_.total)[0];
            ok('Tableau et document annoncent le MÊME total',
                Math.abs(totalTableau - totalDocument) <= 1,
                `tableau=${totalTableau} document=${totalDocument}`);

            // L'invariant qui rendait la ligne absurde quand il était rompu.
            ok('quantité × prix unitaire = total, dans le tableau lui-même',
                Math.abs(qteTableau * tableau.prixUnitaire - totalTableau) <= Math.max(2, totalTableau * 0.001),
                `${qteTableau} × ${tableau.prixUnitaire} = ${qteTableau * tableau.prixUnitaire} vs ${totalTableau}`);

            ok('L\'unité affichée est bien celle du métré, pas une unité d\'ouvrage',
                /m²/.test(tableau.uniteAffichee),
                `unité="${tableau.uniteAffichee}"`);
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
