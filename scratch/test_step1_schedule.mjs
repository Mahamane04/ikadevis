import { launchApp, enterGuestMode } from './lib/harness.mjs';
import path from 'path';

const ARTIFACT_DIR = '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053';

async function testStep1Schedule() {
    console.log('🚀 Testing Step 1: Invoice Payment Schedule & Milestones...');
    const { page, browser, close } = await launchApp();

    try {

        await page.evaluate(() => {
            const guestQuotes = [
                {
                    id: 'q-step1',
                    number: 'DEV-2026-0001',
                    clientName: 'BTP Prestige SARL',
                    projectRef: 'Chantier Rénovation Siège',
                    quoteData: { totalTTCConsomme: 2000000 }
                }
            ];
            const guestInvoices = [
                {
                    id: 'fac-step1',
                    numero: 'FAC-2026-0001',
                    type: 'standard',
                    statut: 'issued',
                    clientName: 'BTP Prestige SARL',
                    projectRef: 'Chantier Rénovation Siège',
                    devisNumero: 'DEV-2026-0001',
                    dateEmission: '2026-09-01',
                    totalHT: 1694915,
                    totalTTC: 2000000,
                    netAPayerTTC: 2000000,
                    montantRegle: 800000, // Exactly 40% (covers tranche 1)
                    payments: [
                        { id: 'pay-1', montant: 800000, date: '2026-09-02', mode: 'virement', reference: 'VIR-ACPT' }
                    ]
                }
            ];
            localStorage.setItem('costcalc:org_default:savedQuotes', JSON.stringify(guestQuotes));
            localStorage.setItem('costcalc:org_default:invoices', JSON.stringify(guestInvoices));
            localStorage.setItem('costcalc:guest:savedQuotes', JSON.stringify(guestQuotes));
            localStorage.setItem('costcalc:guest:invoices', JSON.stringify(guestInvoices));
        });

        await enterGuestMode(page);
        console.log('✓ Guest mode entered');

        // Navigate to Factures
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const invoiceBtn = btns.find(b => b.className.includes('sidebar-item') && b.textContent.includes('Factures'));
            if (invoiceBtn) invoiceBtn.click();
        });
        await new Promise(r => setTimeout(r, 800));

        // Click invoice in table
        await page.evaluate(() => {
            const row = document.querySelector('tr[role="button"]') || document.querySelector('div[role="button"]');
            if (row) row.click();
        });
        await new Promise(r => setTimeout(r, 600));

        // 1. Verify InvoiceScheduleManager exists
        const scheduleManagerInfo = await page.evaluate(() => {
            const el = document.querySelector('[data-testid="invoice-schedule-manager"]');
            if (!el) return null;
            return {
                title: el.querySelector('h4')?.textContent.trim(),
                tranchesCount: el.querySelectorAll('.divide-y > div').length,
                text: el.innerText
            };
        });
        console.log('✓ Schedule Manager rendered:', scheduleManagerInfo);
        if (!scheduleManagerInfo) throw new Error('InvoiceScheduleManager not found');

        // Check that tranche 1 is marked as "Soldée" because 800,000 FCFA (40%) has been paid
        if (!scheduleManagerInfo.text.includes('Soldée')) {
            throw new Error('Tranche 1 was not marked as Soldée with 40% payment');
        }
        console.log('✓ Tranche 1 correctly marked as "Soldée" by payment coverage');

        // 2. Check that DocumentFacture (printable) includes the schedule table
        const docInfo = await page.evaluate(() => {
            const doc = document.querySelector('[data-zone-impression="1"]') || document.querySelector('.document-echelle');
            const allDocs = Array.from(document.querySelectorAll('[data-zone-impression]')).map(d => ({
                tag: d.tagName,
                attr: d.getAttribute('data-zone-impression'),
                textSnippet: d.innerText?.slice(0, 300)
            }));
            return {
                found: Boolean(doc),
                docSnippet: doc ? doc.innerText.slice(0, 500) : null,
                allDocs,
                hasEcheancierInDoc: doc ? (doc.innerText.toLowerCase().includes('échéancier') || doc.innerText.toLowerCase().includes('modalités')) : false
            };
        });
        console.log('✓ DocumentFacture debug info:', docInfo);
        if (!docInfo.hasEcheancierInDoc) throw new Error('Printable DocumentFacture missing schedule table');

        // 3. Test quick pay button on tranche 2
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const reglerBtn = btns.find(b => b.textContent.trim() === 'Régler');
            if (reglerBtn) reglerBtn.click();
        });
        await new Promise(r => setTimeout(r, 500));

        // Verify payment modal opened with pre-filled suggested amount
        const paymentModalValue = await page.evaluate(() => {
            const input = document.querySelector('#reglement_montant');
            return input ? input.value : null;
        });
        console.log('✓ Payment modal opened via schedule "Régler" button with pre-filled amount:', paymentModalValue);
        // Tranche 2 is 30% of 2,000,000 = 600,000 FCFA
        if (paymentModalValue !== '600000') {
            throw new Error(`Expected pre-filled 600000 FCFA for tranche 2, got ${paymentModalValue}`);
        }

        // Close modal
        await page.evaluate(() => {
            const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Annuler'));
            if (closeBtn) closeBtn.click();
        });
        await new Promise(r => setTimeout(r, 400));

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_step1_schedule_success.png') });
        console.log('🎉 STEP 1 (Paiements Échelonnés / Échéancier) VALIDATED SUCCESSFULLY!');
    } finally {
        await close();
    }
}

testStep1Schedule().catch(err => {
    console.error('❌ Step 1 failed:', err);
    process.exit(1);
});
