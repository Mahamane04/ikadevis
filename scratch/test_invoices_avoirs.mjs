import { launchApp, enterGuestMode } from './lib/harness.mjs';
import path from 'path';

const ARTIFACT_DIR = '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053';

async function run() {
    console.log('🚀 Starting Invoice Credit Notes (Avoirs) Test Suite...');
    const { page, browser, close } = await launchApp();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

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
                            { id: 'lot1', name: 'Gros Œuvre & Fondations', totalHT: 1200000 },
                            { id: 'lot2', name: 'Charpente & Couverture', totalHT: 800000 }
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
                    tvaTaux: 18,
                    lots: [
                        { id: 'lot1', name: 'Gros Œuvre & Fondations', totalHT: 1200000 },
                        { id: 'lot2', name: 'Charpente & Couverture', totalHT: 800000 }
                    ]
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

        // 3. Click the invoice in the list to open inspector
        await page.evaluate(() => {
            const row = document.querySelector('tr[role="button"]') || document.querySelector('div[role="button"]');
            if (row) row.click();
        });
        await new Promise(r => setTimeout(r, 600));

        // 4. Verify "Créer un Avoir" button exists
        const avoirBtnFound = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => b.textContent.includes('Créer un Avoir'));
            return !!btn;
        });
        console.log('✓ "Créer un Avoir" button visible on issued invoice:', avoirBtnFound);
        if (!avoirBtnFound) throw new Error('Button "Créer un Avoir" not found in detail toolbar');

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_invoice_before_avoir.png') });

        // 5. Click "Créer un Avoir" to open modal
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => b.textContent.includes('Créer un Avoir'));
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 600));

        // 6. Verify modal is opened
        const modalInfo = await page.evaluate(() => {
            const modal = document.querySelector('[role="dialog"]');
            if (!modal) return null;
            return {
                title: modal.querySelector('h3')?.innerText,
                textSnippet: modal.innerText.slice(0, 300),
                hasTotalAnnulation: modal.innerText.toLowerCase().includes('annulation'),
                hasPartialAvoir: modal.innerText.toLowerCase().includes('partiel')
            };
        });
        console.log('✓ Credit Note Modal opened:', modalInfo);
        if (!modalInfo || !modalInfo.hasTotalAnnulation) {
            throw new Error('Credit Note Modal did not open properly');
        }

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_credit_note_modal.png') });

        // 7. Submit the credit note (Annulation totale)
        await page.evaluate(() => {
            const modal = document.querySelector('[role="dialog"]');
            const submitBtn = modal.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.click();
        });
        await new Promise(r => setTimeout(r, 1200));

        // 8. Verify the Avoir was created in the invoice list
        const avoirInvoices = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('tr[role="button"], div[role="button"]'));
            return rows.map(r => r.innerText.replace(/\n+/g, ' | '));
        });
        console.log('✓ Invoices list after Avoir creation:', avoirInvoices);

        const hasAvoirItem = avoirInvoices.some(t => t.includes('AVOIR') || t.includes('AV-'));
        if (!hasAvoirItem) {
            throw new Error('Avoir not found in invoice list after creation');
        }

        // 9. Click the Avoir to open detail pane
        await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('tr[role="button"], div[role="button"]'));
            const avoirRow = rows.find(r => r.innerText.includes('AVOIR') || r.innerText.includes('AV-'));
            if (avoirRow) avoirRow.click();
        });
        await new Promise(r => setTimeout(r, 600));

        // 10. Verify legal banner and inalterable indicator
        const detailCheck = await page.evaluate(() => {
            const detail = document.querySelector('[data-testid="invoice-detail"]');
            if (!detail) return null;
            return {
                textSnippet: detail.innerText.slice(0, 500),
                hasBanner: detail.innerText.includes('Avoir') || detail.innerText.includes('rectificatif'),
                hasInalterable: detail.innerText.includes('Inaltérable'),
                hasDownloadBtn: !!Array.from(detail.querySelectorAll('button')).find(b => b.textContent.includes('Télécharger le PDF'))
            };
        });
        console.log('✓ Avoir Detail View Check:', detailCheck);
        if (!detailCheck?.hasBanner || !detailCheck?.hasInalterable || !detailCheck?.hasDownloadBtn) {
            throw new Error('Avoir detail view missing banner, inalterable lock, or PDF button');
        }

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_avoir_detail_view.png') });
        console.log('🎉 All Avoir (Credit Note) tests passed successfully!');

    } finally {
        await close();
    }
}

run().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
