import { launchApp, enterGuestMode } from './lib/harness.mjs';
import path from 'path';

const ARTIFACT_DIR = '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053';

async function run() {
    console.log('🚀 Starting Invoice Payment & Settlement Test Suite...');
    const { page, browser, close } = await launchApp();

    try {
        // 1. Seed quotes and an issued invoice into localStorage for guest BEFORE entering guest mode
        await page.evaluate(() => {
            const guestQuotes = [
                {
                    id: 'quote-btp-1',
                    number: 'DEV-2026-001',
                    clientName: 'BTP Prestige SARL',
                    projectRef: 'Construction Villa Duplex Cocody',
                    statut: 'accepted',
                    quoteData: {
                        totalTTCConsomme: 2360000,
                        lots: [
                            { id: 'lot1', name: 'Gros Œuvre & Fondations', totalHT: 2000000 }
                        ]
                    }
                }
            ];
            const guestInvoices = [
                {
                    id: 'inv-btp-1',
                    numero: 'FAC-2026-0001',
                    devisId: 'quote-btp-1',
                    devisNumero: 'DEV-2026-001',
                    clientName: 'BTP Prestige SARL',
                    projectRef: 'Construction Villa Duplex Cocody',
                    totalHT: 2000000,
                    totalTTC: 2360000,
                    netAPayerTTC: 2360000,
                    montantRegle: 0,
                    statut: 'issued',
                    payments: [],
                    type: 'standard',
                    date: '2026-09-10',
                    lots: []
                }
            ];
            localStorage.setItem('costcalc:org_default:savedQuotes', JSON.stringify(guestQuotes));
            localStorage.setItem('costcalc:org_default:invoices', JSON.stringify(guestInvoices));
            localStorage.setItem('costcalc:guest:savedQuotes', JSON.stringify(guestQuotes));
            localStorage.setItem('costcalc:guest:invoices', JSON.stringify(guestInvoices));
        });

        await enterGuestMode(page);
        console.log('✓ Guest mode entered with seeded invoices');

        // 2. Navigate to Factures
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const invoiceBtn = btns.find(b => b.className.includes('sidebar-item') && b.textContent.includes('Factures'));
            if (invoiceBtn) invoiceBtn.click();
        });
        await new Promise(r => setTimeout(r, 800));

        // 3. Verify Top Financial KPI Strip is rendered
        const kpiStripExists = await page.evaluate(() => {
            const strip = document.querySelector('[data-testid="invoices-kpi-strip"]');
            return strip ? strip.innerText : null;
        });
        console.log('✓ KPI Strip Text:', kpiStripExists?.replace(/\n+/g, ' | '));
        if (!kpiStripExists || !kpiStripExists.toLowerCase().includes('total facturé émis') || !kpiStripExists.toLowerCase().includes('total encaissé')) {
            throw new Error('Top Financial KPI Strip not found or missing metrics');
        }

        // 4. Click the invoice in the list to open inspector
        await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('[role="button"]'));
            const invRow = rows.find(r => r.textContent.includes('FAC-2026-0001') || r.textContent.includes('BTP Prestige SARL'));
            if (invRow) invRow.click();
        });
        await new Promise(r => setTimeout(r, 600));

        // 5. Verify Inspector contains "Enregistrer un règlement"
        const hasPaymentBtn = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            return btns.some(b => b.textContent.includes('Enregistrer un règlement'));
        });
        console.log('✓ Has "Enregistrer un règlement" button:', hasPaymentBtn);
        if (!hasPaymentBtn) throw new Error('Button "Enregistrer un règlement" not found in inspector');

        // Take initial screenshot
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_invoices_kpi_initial.png') });

        // 6. Open Payment Modal
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => b.textContent.includes('Enregistrer un règlement'));
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 500));

        const isModalOpen = await page.evaluate(() => {
            return !!document.querySelector('#reglement_montant');
        });
        console.log('✓ Payment modal opened:', isModalOpen);
        if (!isModalOpen) throw new Error('Payment modal failed to open');

        // Click 50% quick preset button
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const halfBtn = btns.find(b => b.textContent.includes('50%'));
            if (halfBtn) halfBtn.click();
        });

        // Select Wave mode
        await page.evaluate(() => {
            const waveBtn = document.querySelector('button[aria-label="Wave"]');
            if (waveBtn) waveBtn.click();
        });

        // Enter reference and note
        await page.type('#reglement_ref', 'WAVE-CI-98412');
        await page.type('#reglement_note', 'Acompte 50% reçu par Wave Business');

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_invoice_payment_modal.png') });

        // Submit payment
        await page.evaluate(() => {
            const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Valider le règlement'));
            if (submitBtn) submitBtn.click();
        });
        await new Promise(r => setTimeout(r, 800));

        // 7. Verify Receipt Modal opened automatically upon payment submission
        const isReceiptOpen = await page.evaluate(() => {
            return document.body.innerText.includes('QUITTANCE DE RÈGLEMENT') &&
                   document.body.innerText.includes('WAVE-CI-98412');
        });
        console.log('✓ Receipt modal opened with correct reference:', isReceiptOpen);
        if (!isReceiptOpen) throw new Error('Receipt modal did not open with payment details');

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_invoice_payment_receipt_modal.png') });

        // Close receipt modal
        await page.evaluate(() => {
            const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Fermer'));
            if (closeBtn) closeBtn.click();
        });
        await new Promise(r => setTimeout(r, 500));

        // 8. Verify status changed to "partially_paid" and payment appears in history
        const afterFirstPayment = await page.evaluate(() => {
            const text = document.body.innerText;
            const hasPartiallyPaid = text.includes('Partiellement réglée');
            const hasWaveRef = text.includes('WAVE-CI-98412');
            const hasAmount = text.includes('1 180 000') || text.includes('1 180 000');
            return { hasPartiallyPaid, hasWaveRef, hasAmount };
        });
        console.log('✓ After first partial payment:', afterFirstPayment);
        if (!afterFirstPayment.hasPartiallyPaid || !afterFirstPayment.hasWaveRef) {
            throw new Error('Partial payment failed to reflect in status or history');
        }

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_invoice_partial_payment.png') });

        // Reopen and close receipt from table/inspector action button to test that button
        await page.evaluate(() => {
            const receiptBtn = document.querySelector('button[aria-label="Voir la quittance"]');
            if (receiptBtn) receiptBtn.click();
        });
        await new Promise(r => setTimeout(r, 400));
        await page.evaluate(() => {
            const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Fermer'));
            if (closeBtn) closeBtn.click();
        });
        await new Promise(r => setTimeout(r, 400));

        // 9. Settle full invoice with second payment (Virement bancaire)
        await page.evaluate(() => {
            const addBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Ajouter un versement') || b.textContent.includes('Saisir un encaissement'));
            if (addBtn) addBtn.click();
        });
        await new Promise(r => setTimeout(r, 500));

        // Enter reference for remaining balance (already prefilled)
        await page.type('#reglement_ref', 'VIR-BNI-5520');
        await page.type('#reglement_note', 'Solde final reçu par virement bancaire BNI');

        // Submit final payment
        await page.evaluate(() => {
            const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Valider le règlement'));
            if (submitBtn) submitBtn.click();
        });
        await new Promise(r => setTimeout(r, 800));

        // 10. Verify invoice is fully paid ("Réglée" and gauge 100%)
        const afterSettlement = await page.evaluate(() => {
            const text = document.body.innerText;
            const isPaid = text.includes('Réglée') || text.includes('Facture intégralement soldée');
            const has100Pct = text.includes('100%');
            return { isPaid, has100Pct };
        });
        console.log('✓ After settlement payment:', afterSettlement);
        if (!afterSettlement.isPaid) {
            throw new Error('Invoice not marked as paid after full settlement');
        }

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_invoice_fully_paid.png') });

        // 11. Test Deletion of a payment
        await page.evaluate(() => {
            const trashBtns = document.querySelectorAll('button[aria-label="Supprimer ce versement"]');
            if (trashBtns.length > 0) trashBtns[0].click(); // delete first payment
        });
        await new Promise(r => setTimeout(r, 400));

        // Confirm deletion in dialog
        await page.evaluate(() => {
            const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Supprimer');
            if (confirmBtn) confirmBtn.click();
        });
        await new Promise(r => setTimeout(r, 800));

        // Verify status reverted to partially_paid
        const afterDelete = await page.evaluate(() => {
            const text = document.body.innerText;
            return {
                isPartiallyPaid: text.includes('Partiellement réglée'),
                remainingCount: document.querySelectorAll('button[aria-label="Supprimer ce versement"]').length
            };
        });
        console.log('✓ After payment deletion:', afterDelete);
        if (!afterDelete.isPartiallyPaid || afterDelete.remainingCount !== 1) {
            throw new Error('Status did not revert to partially_paid after deleting payment');
        }

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_payment_deleted_restored.png') });

        // 12. Test Persistence across page reload
        await page.reload({ waitUntil: 'networkidle0' });
        await enterGuestMode(page);
        await new Promise(r => setTimeout(r, 600));

        // Re-navigate to Factures
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const invoiceBtn = btns.find(b => b.className.includes('sidebar-item') && b.textContent.includes('Factures'));
            if (invoiceBtn) invoiceBtn.click();
        });
        await new Promise(r => setTimeout(r, 800));

        // Check invoice in list
        const persisted = await page.evaluate(() => {
            const text = document.body.innerText;
            return text.includes('FAC-2026-0001') && text.includes('Partiellement réglée');
        });
        console.log('✓ Payment data persisted across reload:', persisted);
        if (!persisted) throw new Error('Payment data was not persisted across reload');

        console.log('🎉 ALL INVOICE PAYMENT & SETTLEMENT TESTS PASSED SUCCESSFULLY!');
    } finally {
        await close();
    }
}

run().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
