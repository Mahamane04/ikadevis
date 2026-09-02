// Banc d'essai — décision de l'utilisateur, 2026-09-02 : « je ne veux pas que
// le NIF et le RCCM soient obligatoirement remplis pour que la facture soit
// émise ».
//
// Les six champs d'identité bloquaient à l'identique. Ils sont désormais
// séparés en deux familles, parce qu'ils ne jouent pas le même rôle :
//
//  • BLOQUANTS — raison sociale, adresse, téléphone, e-mail. Sans eux le
//    client ne sait ni qui l'engage ni comment le joindre : un document parti
//    dans cet état est inexploitable, c'est un défaut d'application.
//
//  • RECOMMANDÉS — NIF et RCCM. Mentions légales OHADA : leur absence est un
//    risque FISCAL, qui appartient au chef d'entreprise, pas au logiciel.
//    L'utilisateur a été prévenu du risque avant le changement et l'a
//    maintenu. Ils restent donc signalés, sans jamais barrer la route.
//
// Ce banc protège les deux moitiés de la décision : le NIF et le RCCM ne
// bloquent plus RIEN, et ils continuent d'être signalés. Retirer le signal
// serait aussi faux que rétablir le blocage.
import { pathToFileURL } from 'node:url';
import { launchApp, enterGuestMode } from './lib/harness.mjs';

const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms));

// Le jeu de démonstration part volontairement sans NIF, sans RCCM et sans
// téléphone : c'est exactement l'état à éprouver.
const poserIdentite = (page, champs) => page.evaluate((c) => {
    const cle = 'costcalc:guest:companyInfo';
    const actuel = JSON.parse(localStorage.getItem(cle) || '{}');
    localStorage.setItem(cle, JSON.stringify({ ...actuel, ...c }));
}, champs);

export async function run() {
    const results = [];
    const ok = (label, cond, detail = '') => results.push({ label, pass: !!cond, detail });

    const { page, close } = await launchApp();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        await enterGuestMode(page, { demo: true });
        await wait(2000);

        // Identité complète SAUF le NIF et le RCCM : le devis doit être
        // envoyable, et aucun bandeau « identité à compléter » ne doit sortir.
        await poserIdentite(page, {
            name: 'MicroOffice', address: 'Bamako', phone: '+223 71 36 05 25',
            email: 'contact@example.com', nif: '', rccm: '', currency: 'FCFA'
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await wait(1500);
        await enterGuestMode(page, { demo: false });
        await wait(2000);
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('aside button')].find((x) => (x.textContent || '').trim().startsWith('Mes devis'));
            if (b) b.click();
        });
        await wait(1800);
        await page.evaluate(() => { const tr = document.querySelector('tbody tr'); if (tr) tr.click(); });
        await wait(2200);

        const sansNif = await page.evaluate(() => {
            const t = document.body.innerText;
            return {
                badgeIdentite: /Identité à compléter/i.test(t),
                bandeauBloquant: /Complétez votre identité d'entreprise avant d'envoyer/i.test(t)
            };
        });
        ok('Sans NIF ni RCCM, le devis n’est plus marqué « Identité à compléter »', !sansNif.badgeIdentite);
        ok('Aucun bandeau bloquant ne s’affiche pour ces deux champs', !sansNif.bandeauBloquant);

        // Les champs réellement bloquants doivent, eux, continuer de bloquer.
        await poserIdentite(page, { phone: '', nif: '', rccm: '' });
        await page.reload({ waitUntil: 'networkidle0' });
        await wait(1500);
        await enterGuestMode(page, { demo: false });
        await wait(2000);
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('aside button')].find((x) => (x.textContent || '').trim().startsWith('Mes devis'));
            if (b) b.click();
        });
        await wait(1800);
        await page.evaluate(() => { const tr = document.querySelector('tbody tr'); if (tr) tr.click(); });
        await wait(2200);
        const sansTelephone = await page.evaluate(() => {
            const t = document.body.innerText;
            return {
                bloque: /Complétez votre identité d'entreprise avant d'envoyer/i.test(t),
                citeTelephone: /téléphone/i.test(t),
                citeNif: /il manque[^.]*NIF/i.test(t)
            };
        });
        ok('Un téléphone manquant bloque toujours l’envoi', sansTelephone.bloque);
        ok('Le bandeau nomme le téléphone', sansTelephone.citeTelephone);
        ok('Le bandeau bloquant ne réclame plus le NIF', !sansTelephone.citeNif);

        // Le cœur de la demande : ÉMETTRE une facture sans NIF ni RCCM.
        // C'est le chemin `emettreFacture`, distinct de celui du devis — il
        // avait son propre contrôle, et c'est lui que l'utilisateur visait.
        await poserIdentite(page, {
            name: 'MicroOffice', address: 'Bamako', phone: '+223 71 36 05 25',
            email: 'contact@example.com', nif: '', rccm: '', currency: 'FCFA'
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await wait(1500);
        await enterGuestMode(page, { demo: false });
        await wait(2000);
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('aside button')].find((x) => (x.textContent || '').trim().startsWith('Mes devis'));
            if (b) b.click();
        });
        await wait(1800);
        await page.evaluate(() => { const tr = document.querySelector('tbody tr'); if (tr) tr.click(); });
        await wait(2200);
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')]
                .find((x) => /^Convertir le devis /.test(x.getAttribute('aria-label') || ''));
            if (b) b.click();
        });
        await wait(2500);
        const emission = await page.evaluate(async () => {
            window.__msgs = [];
            new MutationObserver(() => {
                document.querySelectorAll('[role="alert"],[role="status"]').forEach((e) => {
                    const t = e.innerText.replace(/\n/g, ' ').trim();
                    if (t && !window.__msgs.includes(t)) window.__msgs.push(t);
                });
            }).observe(document.body, { childList: true, subtree: true, characterData: true });
            const b = [...document.querySelectorAll('button')]
                .find((x) => /^Émettre la facture/.test(x.getAttribute('aria-label') || ''));
            if (!b) return { erreur: 'bouton Émettre introuvable' };
            b.click();
            await new Promise((r) => setTimeout(r, 900));
            // La confirmation d'émission. Il faut la chercher DANS la boîte de
            // dialogue : le bouton de la barre d'actions porte exactement le
            // même texte, et un querySelectorAll global renvoie celui-là en
            // premier — le clic rouvrait alors la confirmation au lieu de la
            // valider, et la facture n'était jamais émise.
            const boite = [...document.querySelectorAll('.fixed.inset-0')]
                .find((e) => /ne peut plus être modifiée/i.test(e.innerText || ''));
            const c = boite && [...boite.querySelectorAll('button')]
                .find((x) => (x.textContent || '').trim() === 'Émettre');
            if (c) c.click();
            await new Promise((r) => setTimeout(r, 2500));
            return { messages: window.__msgs.join(' | '), texte: document.body.innerText.slice(0, 4000) };
        });
        ok('Le bouton « Émettre » est atteignable sur le brouillon de facture', !emission.erreur, emission.erreur || '');
        ok('L’émission n’est plus refusée pour NIF ou RCCM manquants',
            !/Complétez l'identité de l'entreprise avant d'émettre/i.test(emission.messages || ''),
            `messages=« ${String(emission.messages).slice(0, 90)} »`);
        ok('La facture reçoit bien un numéro',
            /FACT-\d{4}-\d{3}/.test(emission.messages || '') || /FACT-\d{4}-\d{3}/.test(emission.texte || ''),
            (String(emission.messages).match(/FACT-\d{4}-\d{3}/) || ['aucun numéro'])[0]);

        // Et le signal doit subsister dans les réglages : la décision était de
        // ne plus bloquer, pas de faire disparaître l'information.
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find((x) => /Paramètres du Compte/i.test(x.textContent || ''));
            if (b) b.click();
        });
        await wait(1500);
        const reglages = await page.evaluate(() => {
            const t = document.body.innerText;
            return {
                signale: /NIF et RCCM non renseignés|NIF non renseigné|RCCM non renseigné/i.test(t),
                diteLeRisque: /OHADA/i.test(t) && /contest|refus/i.test(t)
            };
        });
        ok('Les réglages signalent toujours l’absence de NIF et de RCCM', reglages.signale);
        ok('Et disent le risque encouru, sans bloquer', reglages.diteLeRisque);
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
