// Banc d'essai — demandé le 2026-09-02 : « j'aimerais avoir la possibilité
// d'envoyer par WhatsApp et d'envoyer par email ».
//
// Contrainte dite à l'utilisateur AVANT d'écrire la fonction, parce qu'elle
// change la nature de ce qui est livré : ni `wa.me` ni `mailto:` ne permettent
// de joindre un fichier depuis une page web. Seul un texte prérempli passe.
// Le choix retenu — PDF téléchargé puis joint à la main, destinataire demandé
// à l'envoi — est donc en deux gestes, et la fenêtre le dit explicitement
// plutôt que de laisser croire à un envoi complet.
//
// Deux pièges techniques que ce banc protège :
//
//  1. L'ouverture ne doit PAS passer par window.open(). Après l'attente de
//     génération du PDF, le geste utilisateur est rompu et le navigateur
//     bloque la fenêtre — l'utilisateur cliquerait sans que rien ne s'ouvre,
//     sans message. C'est une vraie balise <a>, que rien ne bloque.
//
//  2. `wa.me` exige l'indicatif pays, sans « + » ni séparateur. Un numéro
//     local de 8 chiffres partirait vers un pays au hasard. L'application ne
//     peut pas le deviner (la ville par défaut des fiches dit « Dakar » alors
//     que la société est à Bamako) : elle le signale au lieu de choisir.
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

        const boutonPresent = await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')]
                .find((x) => /^Envoyer le devis /.test(x.getAttribute('aria-label') || ''));
            return !!b && b.getBoundingClientRect().width > 0;
        });
        ok('Le devis expose une action « Envoyer », visible sans rien déplier', boutonPresent);

        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')]
                .find((x) => /^Envoyer le devis /.test(x.getAttribute('aria-label') || ''));
            if (b) b.click();
        });
        await wait(800);

        const fenetre = await page.evaluate(() => {
            const d = document.querySelector('[role="dialog"][aria-label^="Envoyer"]');
            if (!d) return { ouverte: false };
            const t = d.innerText;
            return {
                ouverte: true,
                deuxCanaux: /WhatsApp/.test(t) && /E-mail/.test(t),
                message: document.getElementById('partage-message')?.value || '',
                // La limite doit être écrite, pas sous-entendue.
                limiteDite: /ne peut pas être joint automatiquement/i.test(t),
                deuxEtapes: /1\. Télécharger le PDF/.test(t) && /2\. Ouvrir/.test(t)
            };
        });
        ok('La fenêtre d’envoi s’ouvre', fenetre.ouverte);
        ok('Elle propose les deux canaux', fenetre.deuxCanaux);
        ok('Elle annonce clairement que le document n’est pas joint automatiquement', fenetre.limiteDite);
        ok('Elle guide les deux gestes dans l’ordre', fenetre.deuxEtapes);
        ok(`Le message est prérédigé et reprend le devis — ${fenetre.message.length} caractères`,
            /DEV-2026-001/.test(fenetre.message) && /FCFA/.test(fenetre.message));

        // Piège 1 : l'ouverture doit être une ancre, jamais un window.open.
        const ancre = await page.evaluate(() => {
            const d = document.querySelector('[role="dialog"][aria-label^="Envoyer"]');
            const a = [...d.querySelectorAll('a')].find((x) => /Ouvrir/.test(x.innerText));
            return a ? { estAncre: true, href: a.getAttribute('href'), cible: a.getAttribute('target') } : { estAncre: false };
        });
        ok('L’ouverture passe par une vraie balise <a>, pas par window.open()', ancre.estAncre);
        // Le destinataire est prérempli depuis la fiche client quand elle porte
        // un téléphone — c'est le cas du jeu de démonstration. Le lien doit
        // donc contenir ce numéro, déjà normalisé, et le message encodé.
        ok('Le lien WhatsApp est bien formé et porte le message encodé',
            /^https:\/\/wa\.me\/\d*\?text=Bonjour/.test(ancre.href || ''), `href=${String(ancre.href).slice(0, 60)}…`);
        ok('Le destinataire est prérempli depuis la fiche client quand elle a un téléphone',
            /^https:\/\/wa\.me\/\d{6,}\?/.test(ancre.href || ''));

        // Piège 2 : indicatif pays manquant.
        await page.evaluate(() => {
            const i = document.getElementById('partage-destinataire');
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(i, '71360525');
            i.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await wait(500);
        const avertissement = await page.evaluate(() => {
            const d = document.querySelector('[role="dialog"][aria-label^="Envoyer"]');
            return /Indicatif pays manquant/i.test(d.innerText);
        });
        ok('Un numéro sans indicatif pays est signalé, pas complété au hasard', avertissement);

        // Avec indicatif, le numéro doit être normalisé dans le lien.
        await page.evaluate(() => {
            const i = document.getElementById('partage-destinataire');
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(i, '+223 71 36 05 25');
            i.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await wait(500);
        const lien = await page.evaluate(() => {
            const d = document.querySelector('[role="dialog"][aria-label^="Envoyer"]');
            const a = [...d.querySelectorAll('a')].find((x) => /Ouvrir/.test(x.innerText));
            return { href: a.getAttribute('href'), avertit: /Indicatif pays manquant/i.test(d.innerText) };
        });
        ok('Le numéro est normalisé pour wa.me (chiffres seuls, sans + ni espaces)',
            /^https:\/\/wa\.me\/22371360525\?text=/.test(lien.href || ''), `href=${String(lien.href).slice(0, 45)}…`);
        ok('L’avertissement disparaît une fois l’indicatif ajouté', !lien.avertit);

        // Bascule e-mail : le lien devient un mailto avec sujet et corps.
        await page.evaluate(() => {
            const d = document.querySelector('[role="dialog"][aria-label^="Envoyer"]');
            const b = [...d.querySelectorAll('button')].find((x) => /E-mail/.test(x.innerText));
            if (b) b.click();
        });
        await wait(500);
        await page.evaluate(() => {
            const i = document.getElementById('partage-destinataire');
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(i, 'client@exemple.com');
            i.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await wait(500);
        const mail = await page.evaluate(() => {
            const d = document.querySelector('[role="dialog"][aria-label^="Envoyer"]');
            const a = [...d.querySelectorAll('a')].find((x) => /Ouvrir/.test(x.innerText));
            return a.getAttribute('href');
        });
        ok('Le canal e-mail produit un mailto avec destinataire, sujet et corps',
            /^mailto:client%40exemple\.com\?subject=.+&body=.+/.test(mail || ''), `href=${String(mail).slice(0, 55)}…`);
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
