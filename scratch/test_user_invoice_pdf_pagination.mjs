import { launchApp, enterGuestMode } from './lib/harness.mjs';
import path from 'path';

const ARTIFACT_DIR = '/Users/mahamanehaidara/.gemini/antigravity-ide/brain/c2b0be91-19f8-47a6-9316-05aa6e9fa053';

async function testUserInvoicePdf() {
    console.log('🚀 Testing User Invoice Reproduction & PDF Single-Page Fit...');
    const { page, close } = await launchApp();

    try {
        await page.setViewport({ width: 1440, height: 900 });

        // Seed exact user invoice with 13 lines and 4-tier schedule
        await page.evaluate(() => {
            const userInvoice = {
                id: 'inv-user-nbb',
                numero: null, // Brouillon comme sur la capture
                statut: 'draft',
                clientName: 'Nouvelle Brasserie Bamakoise',
                projectRef: 'Bras de fer Reaktor',
                date: 'Non émis',
                totalHT: 3261639,
                tauxTva: 0,
                totalTva: 0,
                totalTTC: 3261639,
                netAPayerTTC: 3261639,
                montantRegle: 0,
                lignes: [
                    { designation: 'Lettrage 3D 40cm', quantite: 2.24, unite: 'm²', prixUnitaireHT: 173693, totalHT: 389072 },
                    { designation: 'Lettrage 3D 50cm', quantite: 2.45, unite: 'm²', prixUnitaireHT: 137584, totalHT: 337082 },
                    { designation: 'La tôle décorative', quantite: 7.50, unite: 'm²', prixUnitaireHT: 57184, totalHT: 428880 },
                    { designation: 'Barre Fer Lourd 40/80', quantite: 64.00, unite: 'ml', prixUnitaireHT: 2987, totalHT: 191172 },
                    { designation: 'Barre Fer Lourd 40/80', quantite: 16.00, unite: 'ml', prixUnitaireHT: 2987, totalHT: 47793 },
                    { designation: 'Podium scénique (Cadre 40x27 et surface bois)', quantite: 7.50, unite: 'm²', prixUnitaireHT: 10726, totalHT: 80448 },
                    { designation: 'Bache avec cadre de fer Tube carré', quantite: 48.00, unite: 'm²', prixUnitaireHT: 9713, totalHT: 466200 },
                    { designation: 'Fond de scène', quantite: 35.00, unite: 'm²', prixUnitaireHT: 4085, totalHT: 142973 },
                    { designation: 'Lettrage 3D 50cm', quantite: 2.52, unite: 'm²', prixUnitaireHT: 135948, totalHT: 342588 },
                    { designation: 'Lettrage 3D 50cm', quantite: 2.24, unite: 'm²', prixUnitaireHT: 173693, totalHT: 389072 },
                    { designation: 'Barre Fer Lourd 40/80', quantite: 40.00, unite: 'ml', prixUnitaireHT: 2987, totalHT: 119483 },
                    { designation: 'Panneau fond métallique 10mm', quantite: 4.80, unite: 'm²', prixUnitaireHT: 38299, totalHT: 183834 },
                    { designation: 'Panneau fond métallique 10mm', quantite: 4.20, unite: 'm²', prixUnitaireHT: 34058, totalHT: 143042 }
                ],
                paymentSchedule: [
                    { label: 'Acompte à la signature et au démarrage', pct: 70 },
                    { label: 'Situation intermédiaire / Avancement des travaux', pct: 10 },
                    { label: 'Finitions et équipements', pct: 10 },
                    { label: 'Solde à la réception', pct: 10 }
                ],
                companyInfoSnapshot: {
                    name: 'MicroOffice',
                    logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50" viewBox="0 0 200 50"><rect width="200" height="50" fill="%23111827" rx="6"/><text x="15" y="32" fill="white" font-family="sans-serif" font-size="20" font-weight="bold">microOffice</text></svg>',
                    address: 'Boulkassoumbougou sur la route de koulikoro imm Nimaga',
                    phone: '+223 71 24 24 09 / 89 46 00 00',
                    taxId: '08 1128894f',
                    rccm: 'MA.BKO215A 6852 72581750081',
                    pdfFooterNote: 'Adresse: Boulkassoumbougou sur la route de koulikoro imm Nimaga Tel: +223 71 24 24 09 / 89 46 00 00 Fixe +223 44 39 52 64 NIF: 08 1128894f RCCM: MA.BKO215A 6852 72581750081'
                }
            };

            localStorage.setItem('costcalc:org_default:invoices', JSON.stringify([userInvoice]));
            localStorage.setItem('costcalc:guest:invoices', JSON.stringify([userInvoice]));
        });

        await enterGuestMode(page);

        // Go to Invoices
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const invBtn = btns.find(b => b.className.includes('sidebar-item') && b.textContent.includes('Factures'));
            if (invBtn) invBtn.click();
        });
        await new Promise(r => setTimeout(r, 800));

        // Click the invoice row
        await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('tr[role="button"], div[role="button"]'));
            const row = rows.find(r => r.innerText.includes('Nouvelle Brasserie') || r.innerText.includes('3 261 639'));
            if (row) row.click();
        });
        await new Promise(r => setTimeout(r, 600));

        // Switch to "Document Facture" tab
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const tabBtn = btns.find(b => b.textContent.includes('Document Facture'));
            if (tabBtn) tabBtn.click();
        });
        await new Promise(r => setTimeout(r, 600));

        // Measure the rendered document height and calculate page ratio
        const metrics = await page.evaluate(() => {
            const doc = document.querySelector('[data-zone-impression="1"]');
            if (!doc) return null;
            const rect = doc.getBoundingClientRect();
            // A4 page at 96 dpi is 794px wide, 1123px high.
            // With 8mm margins (top 8mm, bottom 8mm = 16mm = 60px) -> usable height ~1063px
            const usableHeightPx = 1063;
            return {
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                fitsOnSinglePage: rect.height <= usableHeightPx,
                ratio: (rect.height / usableHeightPx).toFixed(2),
                hasDuplicateName: !!doc.querySelector('h3') && !!doc.querySelector('img'),
                echeancierAvoidBreak: doc.querySelector('[data-eviter-coupure="1"]')?.style?.breakInside === 'avoid'
            };
        });

        console.log('Document Measurement Metrics:', metrics);

        // Capture screenshot of the document
        const docElem = await page.$('[data-zone-impression="1"]');
        if (docElem) {
            await docElem.screenshot({ path: path.join(ARTIFACT_DIR, 'test_user_invoice_rendered.png') });
            console.log('✓ Captured test_user_invoice_rendered.png');
        }

        // Click Aperçu button
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const apercuBtn = btns.find(b => b.textContent.trim() === 'Aperçu');
            if (apercuBtn) apercuBtn.click();
        });
        await new Promise(r => setTimeout(r, 800));

        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_user_invoice_preview_modal.png') });
        console.log('✓ Captured test_user_invoice_preview_modal.png');

    } finally {
        await close();
    }
}

testUserInvoicePdf().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
