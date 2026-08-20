// Harnais commun aux bancs d'essai : lance l'app dans Chromium headless
// (Chrome embarqué par la dépendance puppeteer, pas besoin d'un Chrome système)
// servie par un petit serveur HTTP local, en Mode Démo/Invité (aucun Supabase requis).
import puppeteer from 'puppeteer';
import { startServer } from './server.mjs';

export async function launchApp() {
    const { url, close: closeServer } = await startServer();
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto(url + '/index.html', { waitUntil: 'networkidle0' });

    return {
        browser, page, consoleErrors,
        close: async () => { await browser.close(); await closeServer(); }
    };
}

export async function enterGuestMode(page) {
    const clicked = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')]
            .find((b) => b.textContent.includes('Mode Démo') && b.textContent.includes('Invité'));
        if (!btn) return false;
        btn.click();
        return true;
    });
    if (!clicked) throw new Error('Bouton "Mode Démo / Invité" introuvable sur l\'écran de connexion.');
    await page.waitForFunction(
        () => document.body.innerText.includes('LOTS DU DEVIS'),
        { timeout: 8000 }
    );
}

// Parse un montant affiché "1 234 567 FCFA" ou "+4 604 FCFA (30%)" en nombre.
function parseFcfa(text) {
    if (!text) return null;
    // Ignore tout ce qui suit une parenthèse (ex: "+24 941 FCFA (30%)" → ne garder que 24941).
    const beforeParen = text.split('(')[0];
    const cleaned = beforeParen.replace(/[^\d.,-]/g, '').replace(/\s/g, '');
    const num = parseFloat(cleaned.replace(/(?<=\d)[,](?=\d{3})/g, ''));
    return Number.isFinite(num) ? num : null;
}

export async function readFinancials(page) {
    return page.evaluate(() => {
        const bodyText = document.body.innerText;
        // Le panneau récapitulatif est le dernier bloc du document et suit toujours
        // l'ordre DÉBOURSÉ SEC → COEFF K → TOTAL NET HT → MARGE → TVA → TOTAL TTC.
        // On ancre sur la DERNIÈRE occurrence de "DÉBOURSÉ SEC" pour éviter les
        // faux positifs des en-têtes de colonnes de tableau (ex: "TOTAL NET HT").
        const anchorIdx = bodyText.lastIndexOf('DÉBOURSÉ SEC');
        const summary = anchorIdx === -1 ? '' : bodyText.slice(anchorIdx);
        const lines = summary.split('\n').map((l) => l.trim()).filter(Boolean);
        const after = (label) => {
            const i = lines.findIndex((l) => l === label || l.startsWith(label));
            return i === -1 ? null : lines[i + 1];
        };
        // 2026-08-20 — Le taux de TVA est devenu un <select> dans la barre de
        // totaux (il n'était modifiable nulle part dans l'éditeur auparavant).
        // Son option sélectionnée s'intercale donc entre le libellé « TVA » et
        // le montant, et `after('TVA')` renvoyait « 18% » au lieu du montant.
        // On cherche le premier montant en devise après le libellé, au lieu de
        // supposer qu'il est exactement sur la ligne suivante — l'assertion
        // testée est inchangée, seule l'extraction devient robuste à l'ajout
        // d'un contrôle dans ce bloc.
        const amountAfter = (label) => {
            const i = lines.findIndex((l) => l === label || l.startsWith(label));
            if (i === -1) return null;
            for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                if (/FCFA|€|\$/.test(lines[j])) return lines[j];
            }
            return null;
        };
        return {
            debourseSecRaw: after('DÉBOURSÉ SEC'),
            coeffKRaw: after('COEFF K'),
            totalNetHtRaw: after('TOTAL NET HT'),
            margeRaw: after('MARGE RÉELLE'),
            tvaRaw: amountAfter('TVA'),
            totalTtcRaw: after('TOTAL TTC'),
        };
    }).then((raw) => ({
        debourseSec: parseFcfa(raw.debourseSecRaw),
        coeffK: parseFloat((raw.coeffKRaw || '').match(/[\d.]+/)?.[0] ?? 'NaN'),
        totalNetHt: parseFcfa(raw.totalNetHtRaw),
        marge: parseFcfa(raw.margeRaw),
        margePct: parseFloat((raw.margeRaw || '').match(/\(([\d.]+)%\)/)?.[1] ?? 'NaN'),
        tva: parseFcfa(raw.tvaRaw),
        totalTtc: parseFcfa(raw.totalTtcRaw),
        raw
    }));
}

export async function addCatalogItemBySearch(page, searchTerm) {
    await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')]
            .find((b) => b.getAttribute('aria-label') === 'Ajouter un ouvrage depuis le catalogue'
                || b.textContent.includes('Choisir dans le Catalogue'));
        if (btn) btn.click();
    });
    await page.waitForSelector('input[placeholder*="Rechercher un ouvrage"]', { timeout: 5000 });
    await page.type('input[placeholder*="Rechercher un ouvrage"]', searchTerm, { delay: 20 });
    await new Promise((r) => setTimeout(r, 300)); // debounce du filtre
    const added = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Ajouter');
        if (!btn) return false;
        btn.click();
        return true;
    });
    if (!added) throw new Error(`Aucun résultat "Ajouter" trouvé pour la recherche "${searchTerm}".`);
    await new Promise((r) => setTimeout(r, 200));
}

// Ouvre l'inspecteur du 1er ouvrage du devis, passe en mode Avancé, force le
// mode de métré "Surface Directe (m²)" et fixe la surface donnée.
export async function setFirstOuvrageSurface(page, surfaceM2) {
    await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')]
            .find((b) => (b.getAttribute('aria-label') || '').startsWith('Détails techniques de'));
        if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 150));
    await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('⚙️ Avancé'));
        if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 150));

    await page.evaluate(() => {
        const select = [...document.querySelectorAll('select')]
            .find((s) => [...s.options].some((o) => o.value === 'surface'));
        if (select) {
            select.value = 'surface';
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    await new Promise((r) => setTimeout(r, 150));

    // Ciblage par label (pas par position) : un ouvrage avec des customVars
    // (ex: COUCHES pour la peinture) ajoute des <input> après le champ de
    // surface dans le DOM — "le dernier input" n'est plus fiable dès qu'un
    // ouvrage a au moins une variable personnalisée. Piège rencontré le
    // 2026-08-16 en ajoutant le rendu générique des customVars (P0.7) : ce
    // même harnais, non mis à jour, avait alors silencieusement rempli le
    // champ COUCHES au lieu du champ Surface Directe pour l'Étalon A.
    const set = await page.evaluate((val) => {
        const label = [...document.querySelectorAll('label')].find((l) => l.textContent.includes('Surface Directe'));
        const target = label?.parentElement?.querySelector('input[type="number"]');
        if (!target) return false;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(target, String(val));
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }, surfaceM2);
    if (!set) throw new Error('Champ de surface introuvable dans l\'inspecteur avancé.');
    await new Promise((r) => setTimeout(r, 250));
}

// Ouvre l'inspecteur avancé du 1er ouvrage et fixe la longueur (mode 'linear',
// champ "Longueur (ml)" — ajouté le 2026-08-16, absent auparavant de cet
// inspecteur bien que le mode existe dans le moteur de calcul, voir P0.7).
export async function setFirstOuvrageLinearLength(page, lengthMl) {
    await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')]
            .find((b) => (b.getAttribute('aria-label') || '').startsWith('Détails techniques de'));
        if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 150));
    await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('⚙️ Avancé'));
        if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 150));

    const set = await page.evaluate((val) => {
        const label = [...document.querySelectorAll('label')].find((l) => l.textContent.includes('Longueur (ml)'));
        const input = label?.parentElement?.querySelector('input[type="number"]');
        if (!input) return false;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, String(val));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }, lengthMl);
    if (!set) throw new Error('Champ "Longueur (ml)" introuvable dans l\'inspecteur avancé.');
    await new Promise((r) => setTimeout(r, 250));
}

// Ouvre l'inspecteur avancé du 1er ouvrage et fixe largeur/hauteur (mode
// 'rectangle') en deux passes séparées — voir la note dans
// test_gold_standard_e_enseigne.mjs sur le risque de fermeture (closure)
// obsolète si les deux champs sont modifiés dans le même tick.
export async function setFirstOuvrageRectangle(page, widthM, heightM) {
    await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')]
            .find((b) => (b.getAttribute('aria-label') || '').startsWith('Détails techniques de'));
        if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 150));
    await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('⚙️ Avancé'));
        if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 150));

    const setByLabel = async (labelText, val) => {
        const set = await page.evaluate((labelText, val) => {
            const label = [...document.querySelectorAll('label')].find((l) => l.textContent.trim() === labelText);
            const input = label?.parentElement?.querySelector('input[type="number"]');
            if (!input) return false;
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(input, String(val));
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }, labelText, val);
        await new Promise((r) => setTimeout(r, 200));
        return set;
    };
    const setW = await setByLabel('Largeur (m)', widthM);
    const setH = await setByLabel('Hauteur (m)', heightM);
    if (!setW || !setH) throw new Error('Champs largeur/hauteur introuvables dans l\'inspecteur avancé.');
}

export async function openDecompositionTab(page) {
    const clicked = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')]
            .find((b) => b.textContent.trim().startsWith('2. Décomposition'));
        if (!btn) return false;
        btn.click();
        return true;
    });
    if (!clicked) throw new Error('Onglet "2. Décomposition Déboursé" introuvable.');
    await new Promise((r) => setTimeout(r, 150));
}

// Lit les cellules du tableau de décomposition ligne par ligne (plutôt que le
// texte brut de la page), pour rester robuste si une cellule contient un
// <input> — innerText casse le flux de texte d'une ligne autour d'un champ
// de formulaire, ce qu'un parsing par tabulations ne survit pas.
export async function readFirstOuvrageBreakdown(page) {
    return page.evaluate(() => {
        const headers = [...document.querySelectorAll('th')]
            .find((th) => th.textContent.trim() === 'Poste');
        const table = headers?.closest('table');
        if (!table) return { found: false, raw: null, rows: [] };

        const cellText = (td) => {
            const input = td.querySelector('input');
            if (input) return input.value;
            return td.textContent.trim();
        };

        const rows = [...table.querySelectorAll('tbody tr')].map((tr) =>
            [...tr.querySelectorAll('td')].map(cellText)
        );

        const debourseLabel = [...document.querySelectorAll('span')]
            .find((s) => s.textContent.includes('Déboursé Sec Consommé'));
        const debourseTotal = debourseLabel?.parentElement?.querySelector('span:last-child')?.textContent.trim();

        return { found: rows.length > 0, raw: rows, debourseTotal };
    });
}

// Charge un modèle 1-clic depuis l'Assistant Intelligent, onglet "2. Modèles
// Métiers 1-Clic", en ciblant la carte dont le titre contient titleSubstring.
export async function loadOneClickTemplate(page, titleSubstring) {
    await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')]
            .find((b) => b.getAttribute('title') === "Ouvrir l'assistant intelligent de création de devis"
                || b.textContent.includes('Nouveau Devis'));
        if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 200));
    await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')]
            .find((b) => b.textContent.includes('Modèles Métiers 1-Clic'));
        if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 200));

    const clicked = await page.evaluate((titleSubstring) => {
        const heading = [...document.querySelectorAll('h3, h2, h4')]
            .find((h) => h.textContent.includes(titleSubstring));
        if (!heading) return false;
        // La carte entière (pas un <button> dédié) porte le onClick de chargement
        // du modèle — on remonte jusqu'au conteneur "p-5 rounded-2xl ... border".
        let card = heading;
        for (let i = 0; i < 6 && card; i++) {
            if (card.className && String(card.className).includes('rounded-2xl') && String(card.className).includes('border')) break;
            card = card.parentElement;
        }
        if (!card) return false;
        card.click();
        return true;
    }, titleSubstring);
    if (!clicked) throw new Error(`Modèle "${titleSubstring}" introuvable dans l'Assistant Intelligent.`);
    await new Promise((r) => setTimeout(r, 300));
}

// Modifie le taux de perte affiché pour une ligne matière donnée (colonne
// "Perte %" de l'onglet "2. Décomposition Déboursé"), en ciblant l'input via
// son aria-label (voir index_jsx.js, aria-label={`Taux de perte pour ${d.label}`}).
export async function setWasteOverride(page, labelSubstring, newPct) {
    const set = await page.evaluate((labelSubstring, newPct) => {
        const input = [...document.querySelectorAll('input[aria-label^="Taux de perte pour"]')]
            .find((el) => el.getAttribute('aria-label').includes(labelSubstring));
        if (!input) return false;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, String(newPct));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }, labelSubstring, newPct);
    if (!set) throw new Error(`Champ "Taux de perte" introuvable pour "${labelSubstring}".`);
    await new Promise((r) => setTimeout(r, 200));
}
