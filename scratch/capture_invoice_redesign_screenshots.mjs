import { launchApp, enterGuestMode } from './lib/harness.mjs';
import path from 'path';

const ARTIFACT_DIR = '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053';

async function capture() {
    console.log('🚀 Capturing Invoices Redesign Screenshots with seeded data...');
    const { page, browser, close } = await launchApp();

    try {
        await page.setViewport({ width: 1440, height: 900 });

        // Seed rich test invoices with lots, milestones, and payments
        await page.evaluate(() => {
            const today = new Date();
            const pastDate = new Date(today.getTime() - 30 * 86400000).toISOString().split('T')[0];
            const recentDate = new Date(today.getTime() - 5 * 86400000).toISOString().split('T')[0];

            const guestInvoices = [
                {
                    id: 'inv-btp-1',
                    numero: 'FAC-2026-0001',
                    quoteId: 'dev-2026-001',
                    quoteNumber: 'DEV-2026-001',
                    clientName: 'BTP Prestige SARL',
                    projectRef: 'Construction Villa Duplex Cocody',
                    date: recentDate,
                    echeance: new Date(today.getTime() + 15 * 86400000).toISOString().split('T')[0],
                    totalHT: 2000000,
                    tvaTaux: 18,
                    totalTVA: 360000,
                    totalTTC: 2360000,
                    netAPayerTTC: 2360000,
                    montantRegle: 1000000,
                    statut: 'partially_paid',
                    payments: [
                        { id: 'pay-1', date: recentDate, amount: 1000000, payment_method: 'Virement', reference: 'VIR-9821' }
                    ],
                    echeancierBTP: [
                        { label: 'Démarrage gros œuvre', pourcentage: 40, montantTTC: 944000, datePrevue: recentDate, statut: 'regle' },
                        { label: 'Hors d’eau / Hors d’air', pourcentage: 40, montantTTC: 944000, datePrevue: new Date(today.getTime() + 20 * 86400000).toISOString().split('T')[0], statut: 'en_attente' },
                        { label: 'Livraison & Réception', pourcentage: 20, montantTTC: 472000, datePrevue: new Date(today.getTime() + 45 * 86400000).toISOString().split('T')[0], statut: 'en_attente' }
                    ],
                    lots: [
                        {
                            title: 'Gros Œuvre & Fondations',
                            items: [
                                { description: 'Fouille en rigole pour semelles filantes', quantite: 80, unite: 'm³', prixUnitaire: 8500, total: 680000 },
                                { description: 'Béton armé dosé à 350 kg/m³ en fondation', quantite: 15, unite: 'm³', prixUnitaire: 88000, total: 1320000 }
                            ]
                        }
                    ],
                    notes: 'Règlement sous 15 jours par virement bancaire.'
                },
                {
                    id: 'inv-btp-2',
                    numero: 'FAC-2026-0002',
                    clientName: 'SCI Belle Vue',
                    projectRef: 'Rénovation Siège Social',
                    date: pastDate,
                    echeance: pastDate,
                    totalHT: 3500000,
                    tvaTaux: 18,
                    totalTVA: 630000,
                    totalTTC: 4130000,
                    netAPayerTTC: 4130000,
                    montantRegle: 0,
                    statut: 'issued',
                    payments: [],
                    lots: []
                },
                {
                    id: 'inv-btp-3',
                    numero: 'FAC-2026-0003',
                    clientName: 'Hôtel Ivoire Golf',
                    projectRef: 'Aménagement Extérieur',
                    date: recentDate,
                    echeance: new Date(today.getTime() + 30 * 86400000).toISOString().split('T')[0],
                    totalHT: 1500000,
                    tvaTaux: 0,
                    totalTVA: 0,
                    totalTTC: 1500000,
                    netAPayerTTC: 1500000,
                    montantRegle: 1500000,
                    statut: 'paid',
                    payments: [
                        { id: 'pay-2', date: recentDate, amount: 1500000, payment_method: 'Chèque', reference: 'CHQ-4402' }
                    ],
                    lots: []
                }
            ];

            localStorage.setItem('costcalc:org_default:invoices', JSON.stringify(guestInvoices));
            localStorage.setItem('costcalc:guest:invoices', JSON.stringify(guestInvoices));
        });

        await enterGuestMode(page);
        console.log('✓ Guest mode entered');

        // Navigate to Factures
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const invBtn = btns.find(b => b.className.includes('sidebar-item') && b.textContent.includes('Factures'));
            if (invBtn) invBtn.click();
        });
        await new Promise(r => setTimeout(r, 1000));

        // 1. Overview 1440px
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'redesign_invoices_1440_overview.png') });
        console.log('✓ Captured redesign_invoices_1440_overview.png');

        // Click first invoice (BTP Prestige SARL)
        await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('tr[role="button"], div[role="button"]'));
            const row = rows.find(r => r.innerText.includes('FAC-2026-0001') || r.innerText.includes('BTP Prestige'));
            if (row) row.click();
        });
        await new Promise(r => setTimeout(r, 700));

        // 2. Split view with "Document Facture" tab active
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const tabBtn = btns.find(b => b.textContent.includes('Document Facture'));
            if (tabBtn) tabBtn.click();
        });
        await new Promise(r => setTimeout(r, 600));
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'redesign_invoices_split_tab_document.png') });
        console.log('✓ Captured redesign_invoices_split_tab_document.png');

        // 3. Switch to "Échéancier & Jalons" tab
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const tabBtn = btns.find(b => b.textContent.includes('Échéancier') || b.textContent.includes('Jalons'));
            if (tabBtn) tabBtn.click();
        });
        await new Promise(r => setTimeout(r, 600));
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'redesign_invoices_split_tab_schedule.png') });
        console.log('✓ Captured redesign_invoices_split_tab_schedule.png');

        // 4. Switch to "Règlements & Quittances" tab
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const tabBtn = btns.find(b => b.textContent.includes('Règlements') || b.textContent.includes('Quittances'));
            if (tabBtn) tabBtn.click();
        });
        await new Promise(r => setTimeout(r, 600));
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'redesign_invoices_split_tab_payments.png') });
        console.log('✓ Captured redesign_invoices_split_tab_payments.png');

        // 5. Open "••• Plus d'actions" dropdown
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const moreBtn = btns.find(b => b.getAttribute('aria-label')?.includes("Plus d'actions"));
            if (moreBtn) moreBtn.click();
        });
        await new Promise(r => setTimeout(r, 500));
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'redesign_invoices_more_actions_menu.png') });
        console.log('✓ Captured redesign_invoices_more_actions_menu.png');

        // 6. Mobile 390px view
        await page.setViewport({ width: 390, height: 844 });
        await new Promise(r => setTimeout(r, 600));
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'redesign_invoices_mobile_390.png') });
        console.log('✓ Captured redesign_invoices_mobile_390.png');

        // 7. Company Settings Document Preview Modal (Desktop 1440px)
        await page.setViewport({ width: 1440, height: 900 });
        await page.evaluate(() => {
            window.location.hash = '#settings/documents';
        });
        await new Promise(r => setTimeout(r, 1000));
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const previewBtn = btns.find(b => b.textContent.includes('Aperçu du document'));
            if (previewBtn) previewBtn.click();
        });
        await new Promise(r => setTimeout(r, 800));
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'redesign_invoices_company_doc_preview.png') });
        console.log('✓ Captured redesign_invoices_company_doc_preview.png');

        console.log('🎉 All redesign screenshots captured successfully!');
    } finally {
        await close();
    }
}

capture().catch(err => {
    console.error('Error capturing screenshots:', err);
    process.exit(1);
});
