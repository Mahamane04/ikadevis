// Banc d'essai — découpage du PDF en pages (2026-09-04).
//
// Signalé sur un PDF réel : le bloc des totaux s'imprimait DEUX FOIS, en bas de
// la page 1 puis en haut de la page 2, avec le texte du pied de page écrit
// par-dessus.
//
// Cause : `addImage` posait l'image ENTIÈRE du document sur chaque page,
// simplement décalée vers le haut. jsPDF ne la rogne qu'au bord du papier,
// jamais à la zone de contenu. Sur A4 avec des marges de 10 mm, la page
// affichait le document jusqu'à 280 mm alors que la suivante reprenait à
// 260 mm : vingt millimètres imprimés deux fois.
//
// Ce banc n'ouvre pas le PDF produit — il instrumente jsPDF et lit ce que le
// code lui demande de dessiner. C'est la mesure qui distingue les deux
// implémentations :
//
//   AVANT : une seule image, hauteur = tout le document, y décroissant et
//           négatif dès la page 2.
//   APRÈS : une image par page, hauteur ≤ hauteur de contenu, y constant.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 900) => new Promise((r) => setTimeout(r, ms));

const cliquer = (page, motif) => page.evaluate((t) => {
    const b = [...document.querySelectorAll('button')]
        .filter((x) => x.getBoundingClientRect().width > 0)
        .find((x) => new RegExp(t, 'i').test(x.textContent || ''));
    if (b) b.click();
    return !!b;
}, motif);

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1500, height: 950 });
        await enterGuestMode(page, { demo: true });
        await wait(2400);

        // Les bibliothèques sont chargées à la demande, et le bundle UMD de
        // jsPDF assigne `window.jspdf = {}` AVANT de le remplir : un
        // intercepteur posé sur l'assignation n'habillerait qu'un objet vide.
        // On les charge donc soi-même, puis on remplace `jsPDF` une fois
        // l'objet peuplé. `chargerLibsPdf` court-circuite ensuite, les deux
        // globales étant déjà là.
        await page.evaluate(() => new Promise((resoudre, rejeter) => {
            const charger = (src) => new Promise((ok2, ko) => {
                const el = document.createElement('script');
                el.src = src; el.onload = ok2; el.onerror = ko;
                document.head.appendChild(el);
            });
            Promise.all([charger('vendor/html2canvas.min.js'), charger('vendor/jspdf.umd.min.js')])
                .then(resoudre).catch(rejeter);
        }));
        await page.waitForFunction(() => window.jspdf && window.jspdf.jsPDF && window.html2canvas,
            { timeout: 20000 });

        await page.evaluate(() => {
            window.__tracePdf = { pages: 1, images: [], textes: [], sauve: false, erreur: null };
            const Vrai = window.jspdf.jsPDF;
            function Espion(...args) {
                const inst = new Vrai(...args);
                const addImage = inst.addImage.bind(inst);
                inst.addImage = (d, f, x, y, w, h, ...r) => {
                    window.__tracePdf.images.push({ x, y, w, h, page: window.__tracePdf.pages });
                    return addImage(d, f, x, y, w, h, ...r);
                };
                const addPage = inst.addPage.bind(inst);
                inst.addPage = (...a) => { window.__tracePdf.pages++; return addPage(...a); };
                const text = inst.text.bind(inst);
                inst.text = (t, x, y, o) => {
                    window.__tracePdf.textes.push({ t: String(t), x, y });
                    return text(t, x, y, o);
                };
                // Ne pas écrire de fichier pendant un banc d'essai.
                inst.save = () => { window.__tracePdf.sauve = true; };
                return inst;
            }
            Espion.prototype = Vrai.prototype;
            window.jspdf.jsPDF = Espion;
        });

        // Le devis de démonstration tient sur une page : il ne prouverait rien
        // d'une duplication entre pages. On allonge donc volontairement le
        // document — détaillé, aéré, texte à 130 % — puis on génère depuis
        // l'éditeur, qui emprunte exactement le même chemin PDF.
        const ED = '[role="dialog"][aria-label*="Éditeur de modèle"]';
        await cliquer(page, 'Paramètres du Compte'); await wait(1700);
        await cliquer(page, 'Documents'); await wait(1700);
        await cliquer(page, 'Éditeur de modèles'); await wait(2200);
        await page.evaluate(() => {
            const g = document.querySelector('[role="dialog"][aria-label*="Modèles"]');
            const b = g && [...g.querySelectorAll('button')]
                .find((x) => /Modifier|Nouveau modèle|Choisir un modèle/.test(x.textContent || ''));
            if (b) b.click();
        });
        await wait(2200);
        await page.evaluate(() => {
            const c = document.querySelector('[role="dialog"][aria-label="Choisir un modèle"]');
            const b = c && [...c.querySelectorAll('button')].find((x) => /Repartir de zéro/.test(x.textContent || ''));
            if (b) b.click();
        });
        await wait(1800);
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const nav = (nom) => {
                const b = [...d.querySelectorAll('nav button')].find((x) => new RegExp(nom).test(x.innerText));
                if (b) b.click();
            };
            nav('Tableau');
        }, ED);
        await wait(1200);
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const parLibelle = (t) => [...d.querySelectorAll('button')]
                .find((x) => { const s2 = x.querySelector('span'); return s2 && s2.textContent.trim() === t; });
            const det = parLibelle('Détaillé'); if (det) det.click();
            const aer = parLibelle('Aérée'); if (aer) aer.click();
        }, ED);
        await wait(1400);
        // Une mention de pied, pour reproduire exactement le cas signalé : sans
        // elle, aucune bande n'est réservée et le défaut ne se manifeste pas.
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const b = [...d.querySelectorAll('nav button')].find((x) => /Pied de page/.test(x.innerText));
            if (b) b.click();
        }, ED);
        await wait(1200);
        await page.evaluate((sel) => {
            const d = document.querySelector(sel);
            const t = d.querySelector('textarea');
            if (!t) return;
            Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
                .call(t, 'Adresse: Boulkassoumbougou, Bamako — NIF: 08 1128894f — RCCM: MA.BKO215A');
            t.dispatchEvent(new Event('input', { bubbles: true }));
            const l = [...d.querySelectorAll('label')].find((x) => /Numéroter les pages/.test(x.textContent || ''));
            const cb = l && l.querySelector('input[type="checkbox"]');
            if (cb && !cb.checked) cb.click();
        }, ED);
        await wait(1400);
        ok('Le PDF peut être généré depuis l’éditeur',
            await page.evaluate((sel) => {
                const d = document.querySelector(sel);
                const b = [...d.querySelectorAll('button')].find((x) => /Aperçu PDF/.test(x.textContent || ''));
                if (b) { b.click(); return true; }
                return false;
            }, ED));

        await page.waitForFunction(() => window.__tracePdf && window.__tracePdf.sauve === true,
            { timeout: 45000 }).catch(() => {});
        const trace = await page.evaluate(() => window.__tracePdf);

        ok(`Le PDF est produit — ${trace.pages} page(s)`, trace.sauve === true && trace.pages >= 1);

        // ── Une image par page, et une seule ──────────────────────────────
        ok(`Chaque page reçoit sa propre tranche — ${trace.images.length} image(s) pour ${trace.pages} page(s)`,
            trace.images.length === trace.pages);

        // ── Aucune tranche ne déborde de la zone de contenu ───────────────
        // C'est LE point : avant correction, une même image de la hauteur du
        // document entier était posée sur chaque page et débordait dans la
        // marge basse, dupliquant le contenu sur la page suivante.
        const hauteurs = trace.images.map((i) => Math.round(i.h));
        const plusHaute = Math.max(...hauteurs);
        ok(`Aucune tranche ne dépasse la hauteur d’une page A4 — la plus haute fait ${plusHaute} mm`,
            plusHaute <= 297);

        // ── Les tranches forment une PARTITION, sans recouvrement ─────────
        // C'est la preuve directe que le contenu n'est plus imprimé deux fois :
        // toutes les tranches ont la même hauteur, sauf la dernière qui porte
        // le reste. Avant correction, chacune portait la hauteur du document
        // ENTIER.
        if (trace.images.length > 1) {
            const pleines = hauteurs.slice(0, -1);
            const derniere = hauteurs[hauteurs.length - 1];
            const identiques = new Set(pleines).size === 1;
            ok(`Les tranches se suivent sans se recouvrir — ${JSON.stringify(hauteurs)} mm`,
                identiques && derniere <= pleines[0] + 1);
        } else {
            ok('Document d’une seule tranche : rien à partitionner', true);
        }

        // ── Le haut de chaque tranche est constant ────────────────────────
        // L'ancienne implémentation décalait l'image vers le haut page après
        // page : y devenait négatif dès la page 2. Un y constant prouve que
        // chaque page reçoit sa propre découpe et non un décalage.
        const ordonnees = [...new Set(trace.images.map((i) => Math.round(i.y * 10) / 10))];
        ok(`Le haut de tranche est le même sur toutes les pages — ${JSON.stringify(ordonnees)} mm`,
            ordonnees.length === 1 && ordonnees[0] > 0);

        // ── Le pied tombe dans sa bande, pas sur le contenu ───────────────
        // Le signalement portait précisément là-dessus : la mention légale
        // s'écrivait par-dessus le bloc des totaux. Le bas de la zone de
        // contenu vaut `y de la tranche + hauteur de la tranche` ; toute
        // écriture de pied doit se situer EN DESSOUS.
        const basContenu = Math.round((ordonnees[0] + plusHaute) * 10) / 10;
        const lignesPied = trace.textes.filter((t) => /Boulkassoumbougou|NIF|RCCM/.test(t.t));
        ok(`La mention de pied est écrite sur chaque page — ${lignesPied.length} ligne(s) pour ${trace.pages} page(s)`,
            lignesPied.length >= trace.pages);
        ok(`…et toujours SOUS le contenu — bas du contenu ${basContenu} mm, pied à ${
                [...new Set(lignesPied.map((t) => Math.round(t.y)))].join(', ')} mm`,
            lignesPied.length > 0 && lignesPied.every((t) => t.y > basContenu));

        // ── Le mobilier est écrit sur chaque page ─────────────────────────
        if (trace.pages > 1) {
            const enTetes = trace.textes.filter((t) => /—/.test(t.t) && t.y < 30);
            ok(`L’en-tête courant est écrit sur les pages suivantes — ${enTetes.length} pour ${trace.pages} pages`,
                enTetes.length === trace.pages - 1);
        } else {
            ok('Document d’une seule page : aucun en-tête courant, comme attendu',
                !trace.textes.some((t) => t.y < 30 && /—/.test(t.t)));
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
