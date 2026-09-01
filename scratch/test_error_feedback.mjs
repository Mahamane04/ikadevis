// Banc d'essai — Audit UX P1-1 « Les erreurs portent le costume du succès ».
//
// Le premier correctif (2026-08-31) avait réglé la moitié visible du constat :
// le composant de notification lit désormais `toast.type` et une erreur sort en
// rouge, avec `role="alert"` et `aria-live="assertive"`.
//
// La seconde moitié demandée par l'audit — « en plus du message, agir sur le
// champ fautif : bordure rouge, focus automatique » — n'existait que sur
// l'ANCIEN formulaire d'enregistrement (`clientNameError`, § handleSaveQuoteSubmit).
// Le chemin réellement emprunté depuis l'éditeur, `handleSaveQuoteAction`, ne
// faisait qu'afficher le message : l'utilisateur lisait « il manque le client »
// sans que rien ne lui montre OÙ. Vérifié en direct le 2026-09-01, puis corrigé.
//
// Ce banc couvre les deux moitiés, et le retour à la normale : la bordure rouge
// doit retomber dès la première frappe, sinon le champ continue de crier une
// faute que l'utilisateur est en train de corriger.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function run() {
    const results = [];
    const ok = (label, condition, detail = '') => results.push({ label, pass: Boolean(condition), detail });

    const { page, close } = await launchApp();
    try {
        await enterGuestMode(page);

        // Tentative d'enregistrement sans client : le seul champ obligatoire.
        await page.evaluate(() => {
            const bouton = [...document.querySelectorAll('button')]
                .filter((b) => b.textContent.trim() === 'Enregistrer')
                .find((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
            bouton?.click();
        });
        await wait(600);

        const enFaute = await page.evaluate(() => {
            const notif = document.querySelector('[role="alert"], [role="status"]');
            const pastille = notif?.querySelector('div');
            const champ = document.querySelector('input[aria-label^="Client du devis"]');
            return {
                message: notif?.innerText.replace(/\n/g, ' ') || '',
                role: notif?.getAttribute('role') || '',
                live: notif?.getAttribute('aria-live') || '',
                fondPastille: pastille ? getComputedStyle(pastille).backgroundColor : '',
                icone: notif?.querySelector('i')?.className || '',
                champRouge: Boolean(champ?.className.includes('border-red-500')),
                champInvalide: champ?.getAttribute('aria-invalid') || null,
                champFocalise: document.activeElement === champ
            };
        });

        ok(`L'erreur est annoncée en role="alert" — role=${enFaute.role}`, enFaute.role === 'alert');
        ok(`L'erreur est annoncée en aria-live="assertive" — live=${enFaute.live}`, enFaute.live === 'assertive');
        ok(`L'erreur porte une icône d'alerte, pas une coche — ${enFaute.icone}`, /fa-circle-exclamation/.test(enFaute.icone) && !/fa-check/.test(enFaute.icone));
        // Rouge, et surtout PAS le vert emeraude du succès (rgba(16,185,129,…)).
        ok(`La pastille d'erreur est rouge, pas verte — ${enFaute.fondPastille}`, /^rgba?\(2\d\d,\s*\d+,\s*\d+/.test(enFaute.fondPastille) && !/16,\s*185,\s*129/.test(enFaute.fondPastille));
        ok(`Le message dit où corriger — « ${enFaute.message} »`, /client/i.test(enFaute.message) && /en haut du devis|indiquez/i.test(enFaute.message));
        ok('Le champ fautif est surligné en rouge', enFaute.champRouge);
        ok(`Le champ fautif est marqué aria-invalid — ${enFaute.champInvalide}`, enFaute.champInvalide === 'true');
        ok('Le champ fautif prend le focus', enFaute.champFocalise);

        // La correction doit faire retomber l'alerte immédiatement.
        await page.evaluate(() => {
            const champ = document.querySelector('input[aria-label^="Client du devis"]');
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(champ, 'SARL Diarra Construction');
            champ.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await wait(400);

        const apresFrappe = await page.evaluate(() => {
            const champ = document.querySelector('input[aria-label^="Client du devis"]');
            return {
                champRouge: Boolean(champ?.className.includes('border-red-500')),
                champInvalide: champ?.getAttribute('aria-invalid') || null,
                valeur: champ?.value || ''
            };
        });
        ok('Le surlignage rouge retombe dès la première frappe', !apresFrappe.champRouge);
        ok(`Le champ n'est plus annoncé invalide — aria-invalid=${apresFrappe.champInvalide}`, apresFrappe.champInvalide === null);
        ok(`La saisie est bien conservée — « ${apresFrappe.valeur} »`, apresFrappe.valeur === 'SARL Diarra Construction');
    } finally {
        await close();
    }

    return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    run().then((results) => {
        for (const r of results) {
            console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}${r.detail ? ` — ${r.detail}` : ''}`);
        }
        const echecs = results.filter((r) => !r.pass).length;
        console.log(`\nAudit UX P1-1 : ${results.length - echecs}/${results.length}`);
        process.exit(echecs ? 1 : 0);
    });
}
