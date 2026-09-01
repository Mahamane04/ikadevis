// Banc d'essai — Audit UX du 2026-08-31, P1 « le client saisi disparaît ».
//
// Symptôme observé pendant l'audit : on saisit un client, on enregistre (le
// message de succès s'affiche, le bouton passe à « Mettre à jour »), puis on
// modifie une quantité — et le champ Client redevient vide, avec le bandeau
// « Modifications non enregistrées ». La donnée, elle, était intacte : le devis
// enregistré ET le brouillon portaient bien le nom. Purement un décrochage
// d'affichage, mais celui qui fait retaper le client ou douter du reste.
//
// Cause (deux défauts distincts, un par combobox) :
//   · ClientCombobox — `restoreCommittedValue` lisait `value` dans la
//     fermeture du PREMIER rendu. Le listener mousedown est posé par un
//     useEffect à dépendances [], il ne voit donc jamais que la version créée
//     au montage, quand le devis n'avait pas encore de client (value = '').
//     Chaque restauration réécrivait cette chaîne vide d'origine. Le fix P3 du
//     2026-08-30 avait introduit `latestRef` pour cela, mais avait laissé
//     `restoreCommittedValue` en dehors. Mesuré au moment du bug :
//     ref = « Test Delta », prop = « » — la fermeture périmée en flagrant délit.
//   · ProjectCombobox — même défaut de fermeture, ET restauration
//     INCONDITIONNELLE : le correctif P3 (conserver le texte libre non
//     confirmé) n'avait jamais été porté sur ce champ. Un nom de chantier tapé
//     sans le choisir dans la liste était donc toujours perdu, y compris au
//     premier clic ailleurs — il n'atteignait ni le devis, ni le PDF.
//
// Ce banc rejoue le parcours utilisateur complet plutôt que les mécanismes :
// saisie, enregistrement, modification, clics ailleurs, puis contrôle que la
// donnée est bien arrivée jusqu'au devis persisté.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode, addCatalogItemBySearch } from './lib/harness.mjs';

const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));

// Saisit une valeur dans un combobox puis clique ailleurs, comme un humain.
async function saisirPuisCliquerAilleurs(page, ariaLabel, valeur) {
    await page.evaluate(({ label, val }) => {
        const input = document.querySelector(`input[aria-label="${label}"]`);
        input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        input.focus();
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, val);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }, { label: ariaLabel, val: valeur });
    await wait(300);
    await page.evaluate(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    await wait(400);
}

const lire = (page) => page.evaluate(() => ({
    client: document.querySelector('input[aria-label="Client du devis"]')?.value ?? null,
    projet: document.querySelector('input[aria-label="Projet du devis"]')?.value ?? null
}));

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const CLIENT = 'SARL Diarra Construction';
    const CHANTIER = 'Chantier Badalabougou';

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1280, height: 900 });
        await enterGuestMode(page);
        await addCatalogItemBySearch(page, 'Maçonnerie');
        await wait(600);

        await saisirPuisCliquerAilleurs(page, 'Client du devis', CLIENT);
        await saisirPuisCliquerAilleurs(page, 'Projet du devis', CHANTIER);

        const apresSaisie = await lire(page);
        ok('Le client saisi en texte libre est conservé après un clic ailleurs',
            apresSaisie.client === CLIENT, `lu="${apresSaisie.client}"`);
        ok('Le chantier saisi en texte libre est conservé après un clic ailleurs',
            apresSaisie.projet === CHANTIER, `lu="${apresSaisie.projet}"`);

        // Enregistrement
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Enregistrer');
            if (b) b.click();
        });
        await wait(2200);
        const apresSave = await lire(page);
        ok('Le client reste affiché après l\'enregistrement',
            apresSave.client === CLIENT, `lu="${apresSave.client}"`);
        ok('Le chantier reste affiché après l\'enregistrement',
            apresSave.projet === CHANTIER, `lu="${apresSave.projet}"`);

        // Modification d'une quantité — le geste qui vidait le champ
        await page.evaluate(() => {
            const ligne = document.querySelectorAll('tr')[1];
            const qte = [...ligne.querySelectorAll('input[type=number]')][0];
            qte.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(qte, '3');
            qte.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await wait(1200);
        const apresEdition = await lire(page);
        ok('Le client survit à une modification de quantité (symptôme d\'origine)',
            apresEdition.client === CLIENT, `lu="${apresEdition.client}"`);
        ok('Le chantier survit à une modification de quantité',
            apresEdition.projet === CHANTIER, `lu="${apresEdition.projet}"`);

        // Plusieurs clics ailleurs d'affilée : c'est la répétition qui révélait
        // la fermeture périmée (le premier clic passait, les suivants non).
        for (let i = 0; i < 4; i++) {
            await page.evaluate(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
            await wait(180);
        }
        const apresClics = await lire(page);
        ok('Le client survit à quatre clics ailleurs successifs',
            apresClics.client === CLIENT, `lu="${apresClics.client}"`);
        ok('Le chantier survit à quatre clics ailleurs successifs',
            apresClics.projet === CHANTIER, `lu="${apresClics.projet}"`);

        // Et la donnée doit être arrivée jusqu'au devis persisté.
        const persiste = await page.evaluate(() => {
            const liste = JSON.parse(localStorage.getItem('costcalc:guest:savedQuotes') || '[]');
            const q = liste[0];
            return q ? { client: q.clientName, projet: q.projectRef } : null;
        });
        ok('Le devis enregistré porte bien le client saisi',
            persiste && persiste.client === CLIENT, `lu="${persiste && persiste.client}"`);
        ok('Le devis enregistré porte bien le chantier saisi',
            persiste && persiste.projet === CHANTIER, `lu="${persiste && persiste.projet}"`);
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
