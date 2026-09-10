import { launchApp, enterGuestMode } from './lib/harness.mjs';

(async () => {
    console.log('🚀 Démarrage du banc d’essai : BOUTON « MARQUER COMME ENVOYÉE »...');
    const { page, browser, consoleErrors } = await launchApp();
    await page.setViewport({ width: 1440, height: 900 });

    try {
        await enterGuestMode(page);
        await new Promise(r => setTimeout(r, 600));

        // Étape 1 : Préparation de l'entreprise avec coordonnées complètes et facture brouillon
        await page.evaluate(() => {
            const company = {
                name: 'IKADEVIS BTP',
                phone: '+225 07 00 00 00 00',
                email: 'contact@ikadevis.com',
                address: 'Abidjan, Côte d\'Ivoire',
                currency: 'FCFA',
                nif: '',
                rccm: ''
            };
            localStorage.setItem('costcalc:guest:companyInfo', JSON.stringify(company));
            localStorage.setItem('costcalc:org_default:companyInfo', JSON.stringify(company));

            const guestInvoices = [{
                id: 'inv-draft-test',
                numero: '',
                clientName: 'Société Immobilière NBB',
                projectRef: 'Construction Siège NBB',
                totalHT: 17448522,
                totalTTC: 20589256,
                netAPayerTTC: 20589256,
                montantRegle: 0,
                statut: 'draft',
                payments: [],
                date: '2026-09-10',
                quoteRef: 'DEV-2026-001',
                items: [
                    { designation: 'Lot 01 — Terrassement & Fondations', qte: 1, unite: 'lot', puHT: 14110527, totalHT: 14110527 },
                    { designation: 'Lot 02 — Maçonnerie & Cloisonnements', qte: 1, unite: 'lot', puHT: 2693505, totalHT: 2693505 },
                    { designation: 'Lot 03 — Peinture & Finitions', qte: 1, unite: 'lot', puHT: 644490, totalHT: 644490 }
                ]
            }];
            localStorage.setItem('costcalc:guest:invoices', JSON.stringify(guestInvoices));
            localStorage.setItem('costcalc:org_default:invoices', JSON.stringify(guestInvoices));
        });

        await page.reload({ waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1000));
        await enterGuestMode(page);
        await new Promise(r => setTimeout(r, 600));

        // Étape 2 : Navigation vers Factures
        console.log('\n--- Étape 2 : Navigation vers le module Factures ---');
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const invBtn = btns.find(b => b.className.includes('sidebar-item') && b.textContent.includes('Factures'));
            if (invBtn) invBtn.click();
        });
        await new Promise(r => setTimeout(r, 800));

        // Sélection de la facture brouillon
        await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('[role=\"button\"]'));
            const row = rows.find(r => r.textContent.includes('Société Immobilière NBB'));
            if (row) row.click();
        });
        await new Promise(r => setTimeout(r, 800));

        // Vérification de la présence du bouton « Marquer comme envoyée » sur le brouillon
        const draftButtons = await page.evaluate(() => {
            const detail = document.querySelector('[data-testid=\"invoice-detail\"]');
            if (!detail) return [];
            return Array.from(detail.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean);
        });
        console.log('  Boutons détectés sur le brouillon :', draftButtons);
        const hasMarquerEnvoyeeDraft = draftButtons.some(t => t.includes('Marquer comme envoyée'));
        if (!hasMarquerEnvoyeeDraft) throw new Error('Bouton "Marquer comme envoyée" introuvable sur le brouillon');
        console.log('  ✅ Bouton "Marquer comme envoyée" présent sur le brouillon (toolbar & bandeau)');

        await page.screenshot({ path: 'scratch/audit_invoice_draft_marquer_envoyee.png' });
        console.log('  📸 Capture : scratch/audit_invoice_draft_marquer_envoyee.png');

        // Étape 3 : Clic sur « Marquer comme envoyée »
        console.log('\n--- Étape 3 : Clic sur « Marquer comme envoyée » & Confirmation ---');
        await page.evaluate(() => {
            const detail = document.querySelector('[data-testid=\"invoice-detail\"]');
            const btn = Array.from(detail.querySelectorAll('button')).find(b => b.innerText.includes('Marquer comme envoyée'));
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 500));

        // Vérification de la modale de confirmation
        const dialogTitle = await page.evaluate(() => {
            const dialog = document.querySelector('[role=\"dialog\"]');
            return dialog ? dialog.innerText : '';
        });
        console.log('  Dialogue affiché :', dialogTitle.substring(0, 100).replace(/\n/g, ' '));

        // Validation de la confirmation
        await page.evaluate(() => {
            const dialog = document.querySelector('[role=\"dialog\"]');
            if (!dialog) return;
            const confirmBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.innerText.includes('Marquer comme envoyée'));
            if (confirmBtn) confirmBtn.click();
        });
        await new Promise(r => setTimeout(r, 1200));

        // Étape 4 : Vérification du nouveau statut
        console.log('\n--- Étape 4 : Vérification du statut Envoyée & Numérotation ---');
        const invoiceState = await page.evaluate(() => {
            const detail = document.querySelector('[data-testid=\"invoice-detail\"]');
            const text = detail ? detail.innerText : '';
            return {
                hasSentBadge: text.includes('Envoyée') || text.includes('Marquée comme envoyée'),
                hasNumber: /FACT-\d{4}-\d+|FAC-\d{4}-\d+/.test(text),
                fullTextSnippet: text.substring(0, 300).replace(/\n/g, ' | ')
            };
        });
        console.log('  État de la facture après action :', invoiceState);
        if (!invoiceState.hasSentBadge) throw new Error('La facture n’affiche pas le statut Envoyée');
        if (!invoiceState.hasNumber) throw new Error('La facture n’a pas reçu son numéro officiel');
        console.log('  ✅ Facture officiellement émise avec son numéro et marquée Envoyée');

        await page.screenshot({ path: 'scratch/audit_invoice_sent_confirmed.png' });
        console.log('  📸 Capture : scratch/audit_invoice_sent_confirmed.png');

        // Étape 5 : Persistance après rechargement (F5)
        console.log('\n--- Étape 5 : Persistance après F5 ---');
        await page.reload({ waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1000));
        await enterGuestMode(page);
        await new Promise(r => setTimeout(r, 600));

        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const invBtn = btns.find(b => b.className.includes('sidebar-item') && b.textContent.includes('Factures'));
            if (invBtn) invBtn.click();
        });
        await new Promise(r => setTimeout(r, 800));

        await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('[role=\"button\"]'));
            const row = rows.find(r => r.textContent.includes('Société Immobilière NBB'));
            if (row) row.click();
        });
        await new Promise(r => setTimeout(r, 800));

        const persistedText = await page.evaluate(() => {
            const detail = document.querySelector('[data-testid=\"invoice-detail\"]');
            return detail ? detail.innerText : '';
        });
        const persistsSent = persistedText.includes('Envoyée') || persistedText.includes('Marquée comme envoyée');
        if (!persistsSent) throw new Error('Le statut Envoyée n’a pas persisté après rechargement');
        console.log('  ✅ Statut « Envoyée » fidèlement persisté après F5');

        console.log('\n============================================================');
        console.log('🎉 TOUS LES TESTS DU BOUTON « MARQUER COMME ENVOYÉE » SONT RÉUSSIS !');

    } catch (err) {
        console.error('❌ Échec du test :', err);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
