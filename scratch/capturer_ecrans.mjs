// Capture les écrans de l'app pour la fiche UI/UX (référence Adobe XD).
// Réutilise le harnais des bancs d'essai : Mode Démo, aucun Supabase requis.
// Chaque étape est isolée : un écran qui échoue n'interrompt pas la série.
import { launchApp, enterGuestMode, addCatalogItemBySearch, setFirstOuvrageSurface } from './lib/harness.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

const SORTIE = process.argv[2];
const pause = (ms) => new Promise(r => setTimeout(r, ms));
const faits = [], rates = [];

async function clicTexte(page, texte, exact = false) {
    return page.evaluate((t, ex) => {
        const b = [...document.querySelectorAll('button')].find(x => {
            const s = (x.textContent || '').trim();
            const aria = (x.getAttribute('aria-label') || '').trim();
            if (!ex && (s.includes(t) || aria.includes(t))) return true;
            if (ex && (s === t || aria === t)) return true;
            return ex ? s === t : s.includes(t);
        });
        if (!b) return false;
        b.click();
        return true;
    }, texte, exact);
}

// Détecte une modale résiduelle : un voile fixe couvrant l'écran.
async function modaleOuverte(page) {
    return page.evaluate(() => [...document.querySelectorAll('div')].some(d => {
        const st = getComputedStyle(d);
        return st.position === 'fixed' && d.getBoundingClientRect().width >= window.innerWidth * 0.95
            && d.getBoundingClientRect().height >= window.innerHeight * 0.95
            && st.backgroundColor.startsWith('rgba(') && st.backgroundColor !== 'rgba(0, 0, 0, 0)';
    }));
}

async function capturer(page, nom, libelle, attendModale = false) {
    await pause(900);
    // L'aperçu du document et les paramètres SONT des modales : attendu.
    const modaleAttendue = attendModale || /^06-|parametres/.test(nom);
    if (!modaleAttendue && await modaleOuverte(page)) {
        console.log(`  ⚠️  ${nom} : une modale est restée ouverte par-dessus l'écran`);
    }
    const fichier = path.join(SORTIE, `${nom}.png`);
    await page.screenshot({ path: fichier });
    const { size } = await fs.stat(fichier);
    console.log(`  ✅ ${nom.padEnd(32)} ${String(Math.round(size / 1024)).padStart(4)} Ko   ${libelle}`);
    faits.push({ nom, libelle });
}

// Isole une étape : journalise l'échec et continue.
async function etape(libelle, fn) {
    try { await fn(); }
    catch (e) { console.log(`  ❌ ${libelle} — ${e.message.split('\n')[0].slice(0, 90)}`); rates.push(libelle); }
}

const app = await launchApp();
const { page } = app;
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await pause(800);

console.log(`\nCaptures 1440×900 @2x → ${SORTIE}\n`);

await etape('connexion', () => capturer(page, '00-connexion', 'Écran de connexion'));

await enterGuestMode(page);
await pause(1500);   // laisser l'app finir son montage avant d'interagir

// Garnir le devis : un écran vide ne sert pas de référence visuelle.
// L'ouverture de la modale du catalogue est intermittente (le même appel
// passe ou échoue selon le timing du montage React) — on réessaie plutôt
// que d'allonger les pauses au jugé.
const ouvrageExiste = () => page.evaluate(() =>
    !![...document.querySelectorAll('button')]
        .find(x => (x.getAttribute('aria-label') || '').startsWith('Détails techniques de')));

await etape('garnissage du devis', async () => {
    let derniere;
    for (let essai = 1; essai <= 4 && !(await ouvrageExiste()); essai++) {
        try {
            await addCatalogItemBySearch(page, 'Peinture');
            await pause(600);
        } catch (e) {
            derniere = e;
            console.log(`     ↻ essai ${essai} : modale du catalogue non ouverte, nouvelle tentative`);
            await page.keyboard.press('Escape');
            await pause(1200);
        }
    }
    if (!(await ouvrageExiste())) throw derniere || new Error('aucun ouvrage ajouté après 4 essais');

    // setFirstOuvrageSurface laisse l'inspecteur ouvert : c'est un panneau
    // inline, pas une modale — Escape ne le referme pas. On enchaîne donc
    // directement sur ses onglets, puis on en sort par son propre bouton.
    await setFirstOuvrageSurface(page, 120);
    await pause(800);
});

// Les 4 onglets vivent dans l'inspecteur d'un ouvrage, déjà ouvert à ce stade.
await etape('onglets de l\'inspecteur', async () => {
    await capturer(page, '02-inspecteur-metre', 'Inspecteur ouvrage — 1. Métré & Dimensions');
    for (const [onglet, nom, lib] of [
        ['2. Décomposition', '03-inspecteur-decomposition', 'Inspecteur — 2. Décomposition Déboursé'],
        ['3. Prix & Marge', '04-inspecteur-prix-marge', 'Inspecteur — 3. Prix & Marge'],
        ['4. Présentation Client', '05-inspecteur-presentation', 'Inspecteur — 4. Présentation Client'],
    ]) {
        if (await clicTexte(page, onglet)) await capturer(page, nom, lib);
        else console.log(`  ⚠️  onglet introuvable : ${onglet}`);
    }
});

// Sortir de l'inspecteur par son propre bouton pour capturer la vue liste.
await etape('espace de chiffrage (vue liste)', async () => {
    if (!await clicTexte(page, 'Retour aux ouvrages du lot')) throw new Error('bouton de retour introuvable');
    await pause(700);
    await capturer(page, '01-creer-devis', 'Créer un Devis — vue liste des ouvrages');
});

// Ferme une modale par son bouton « Fermer ». Échap ne referme AUCUNE modale
// de cette application — s'y fier laissait la modale du document ouverte
// par-dessus tous les écrans capturés ensuite.
async function fermerModale(page) {
    // Trois voies, dans l'ordre : le bouton « Fermer » du pied, un bouton
    // portant un aria-label de fermeture, puis la croix. L'onglet Diagnostic
    // des paramètres n'a pas de bouton « Fermer » — d'où les deux replis.
    const ok = await page.evaluate(() => {
        const clic = (el) => { if (!el) return false; el.click(); return true; };
        const parTexte = [...document.querySelectorAll('button')].filter(x => x.textContent.trim() === 'Fermer');
        if (parTexte.length) return clic(parTexte[parTexte.length - 1]);
        const parAria = [...document.querySelectorAll('button')]
            .find(x => /fermer|close/i.test(x.getAttribute('aria-label') || ''));
        if (parAria) return clic(parAria);
        const parCroix = [...document.querySelectorAll('button')]
            .filter(x => ['✕', '×', 'X'].includes(x.textContent.trim()));
        return clic(parCroix[parCroix.length - 1]);
    });
    await pause(700);
    return ok;
}

await etape('aperçu document', async () => {
    if (!await clicTexte(page, 'Aperçu Client & PDF')) throw new Error('bouton introuvable');
    await capturer(page, '06-apercu-document', 'Aperçu Client & PDF (document A4)', true);
    if (!await fermerModale(page)) throw new Error('bouton « Fermer » introuvable');
});

for (const [menu, nom, lib] of [
    ['Projet', '07-projet', 'Projet'],
    ['Client', '08-client', 'Client'],
    ['Devis', '09-devis', 'Devis'],
    ['Facture', '10-facture', 'Facture'],
    ['Catalogue technique', '11-catalogue-technique', 'Catalogue technique'],
    ['Paramètres du Compte', '13-parametres-compte', 'Paramètres du Compte — Entreprise'],
]) {
    await etape(lib, async () => {
        if (!await clicTexte(page, menu, true)) throw new Error('menu introuvable');
        await capturer(page, nom, lib);
    });
}

for (const [onglet, nom, lib] of [
    ['Documents & PDF', '14-parametres-documents', 'Paramètres — Documents & PDF'],
    ['Diagnostic', '15-parametres-diagnostic', 'Paramètres — Diagnostic Système'],
]) {
    await etape(lib, async () => {
        if (!await clicTexte(page, onglet)) throw new Error('onglet introuvable');
        await capturer(page, nom, lib);
    });
}

await etape('fermeture des paramètres', async () => {
    if (!await fermerModale(page)) throw new Error('bouton « Fermer » introuvable');
});

// Vue mobile
await etape('vues mobiles', async () => {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await pause(1400);
    await capturer(page, '16-mobile-parametres', 'Vue mobile 390×844 — Paramètres');
    await clicTexte(page, 'Créer un Devis', true);
    await pause(800);
    await capturer(page, '17-mobile-devis', 'Vue mobile 390×844 — Créer un Devis');
});

await app.close();

console.log(`\n${faits.length} captures produites.`);
if (rates.length) console.log(`${rates.length} étape(s) en échec : ${rates.join(', ')}`);
await fs.writeFile(path.join(SORTIE, '_index.json'), JSON.stringify(faits, null, 2));
