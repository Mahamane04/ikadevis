// Targeted browser regression. Supply IKADEVIS_PLAYWRIGHT_MODULE when using
// the desktop bundled runtime. No production configuration or network used.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { startServer } from './lib/server.mjs';
const { chromium } = await import(process.env.IKADEVIS_PLAYWRIGHT_MODULE || 'playwright');
const artifacts = process.env.IKADEVIS_UI_ARTIFACTS || '/tmp/ikadevis-pricing-ui';
await mkdir(artifacts, { recursive: true });
const config = await readFile(new URL('../config.example.js', import.meta.url), 'utf8');
const server = await startServer();
let browser, page, checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; console.log(`✓ ${label}`); };
try {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== server.url) return route.abort();
        if (url.pathname === '/config.js') return route.fulfill({ contentType: 'application/javascript', body: config });
        return route.continue();
    });
    page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(10000);
    console.log(`Browser: ${browser.version()} · local demo only`);
    await page.goto(server.url, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Essayer sans compte/ }).click();
    await page.locator('aside button').filter({ hasText: 'Nouveau devis' }).first().click();
    await page.waitForSelector('.quote-totals-bar');
    await page.getByRole('button', { name: 'Choisir dans le Catalogue complet' }).click();
    await page.locator('button').filter({ hasText: /^Ajouter$/ }).first().click();
    await page.getByLabel('Surface directe (m²)', { exact: true }).fill('1000');
    await page.getByRole('button', { name: 'Retour aux ouvrages du lot', exact: true }).click();
    const desktopMargin = page.locator('.quote-margin-edit:visible').first();
    await desktopMargin.click();
    const margin = page.getByLabel('Marge souhaitée (%)', { exact: true });
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Marge souhaitée (%)');
    check(await margin.isVisible(), 'Le lien Marge place le focus dans le champ de marge');
    await margin.fill('25');
    await page.getByRole('button', { name: 'Retour aux ouvrages du lot', exact: true }).click();
    check(/25/.test(await desktopMargin.innerText()), 'La marge modifiée est recalculée sur la ligne');
    const metrics = () => page.locator('.quote-mobile-metrics > div').evaluateAll(els => els.map(el => el.innerText));
    const initial = await metrics();
    const vat = page.getByLabel('Taux de TVA du devis', { exact: true });
    await vat.selectOption('10');
    let current = await metrics();
    check(initial[2] === current[2] && initial[3] === current[3] && initial[5] !== current[5], 'Changer la TVA recalcule le TTC sans changer le HT ni la marge');
    await vat.selectOption('0');
    current = await metrics();
    const money = text => Number(text.replace(/[^0-9,-]/g, '').replace(',', '.'));
    check(money(current[2]) === money(current[5]), 'TVA à 0 % : TTC égal au HT');
    await page.getByRole('button', { name: 'Annuler la modification (Cmd+Z / Ctrl+Z)', exact: true }).click();
    check(await vat.inputValue() === '10', 'Annuler restaure le taux précédent');
    await page.getByRole('button', { name: 'Rétablir la modification (Cmd+Maj+Z / Ctrl+Y)', exact: true }).click();
    check(await vat.inputValue() === '0', 'Rétablir conserve bien le taux nul');
    await vat.selectOption('18');
    await vat.focus();
    check(await vat.evaluate(el => document.activeElement === el && getComputedStyle(el).outlineStyle !== 'none'), 'TVA focalisable avec un indicateur visible');
    await page.keyboard.press('Tab');
    check(await vat.evaluate(el => document.activeElement !== el), 'Tab permet de quitter le sélecteur TVA');
    await vat.selectOption('10');
    await desktopMargin.click();
    check((await page.locator('[data-pricing-section]').innerText()).includes('TVA du devis : 10 %'), 'Le détail utilise la TVA du devis, pas une ancienne valeur de la ligne');
    await page.getByRole('button', { name: 'Retour aux ouvrages du lot', exact: true }).click();
    await page.waitForTimeout(1000);
    const draft = await page.evaluate(() => {
        const key = Object.keys(localStorage).find(key => key.endsWith(':draftQuote'));
        return key ? JSON.parse(localStorage.getItem(key)).quote : null;
    });
    check(draft?.vatRate === 10 && Number(draft.lots[0].items[0].calcForm.margin) === 25 && !draft.lots[0].items[0].isCustom,
        'Le brouillon conserve TVA et marge, sans convertir l’ouvrage en ligne libre');
    await page.locator('.pointer-events-none[role="status"]').waitFor({state:'hidden'});
    for (const width of [1440, 1024, 768, 700, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        const toggle = page.locator('.quote-totals-bascule');
        if (width < 768 && await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
        await vat.scrollIntoViewIfNeeded();
        const geometry = await vat.boundingBox();
        check(geometry && geometry.x >= 0 && geometry.x + geometry.width <= width && geometry.y >= 0 && geometry.y + geometry.height <= 900,
            `TVA accessible dans la fenêtre à ${width}px`);
        check(await page.locator('.quote-mobile-metrics').evaluate(el => el.scrollWidth <= el.clientWidth + 1), `Récapitulatif sans débordement horizontal à ${width}px`);
        await vat.selectOption('0'); check(await vat.inputValue() === '0', `TVA modifiable à ${width}px`);
        await vat.selectOption('10');
        await page.screenshot({ animations: 'disabled', path: `${artifacts}/totals-${width}.png` });
    }
    // Mobile: close summary, open lot then use the explicit margin action.
    await page.locator('.quote-totals-bascule').click();
    const lot = page.locator('[role="button"]').filter({ hasText: 'Lot 01' }).first();
    if (await lot.isVisible()) await lot.click();
    const mobileMargin = page.locator('[data-testid="quote-items-mobile"] .quote-margin-edit').first();
    await mobileMargin.click();
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Marge souhaitée (%)');
    const fieldRect = await margin.boundingBox();
    check(fieldRect && fieldRect.y >= 0 && fieldRect.y + fieldRect.height <= 900, 'Marge focalisée et visible sur téléphone');
    await page.screenshot({ animations: 'disabled', path: `${artifacts}/margin-320.png` });
    await page.keyboard.press('Escape');
    check(await mobileMargin.evaluate(el => document.activeElement === el), 'Échap ferme le panneau mobile et restitue le focus');
    await page.getByRole('button', { name: 'Ajouter une ligne libre personnalisée', exact: true }).click();
    const manualMargin = page.locator('[data-testid="quote-items-mobile"] .quote-margin-edit').last();
    await manualMargin.click();
    const salePrice = page.getByLabel('Prix de vente unitaire HT', { exact: true });
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Prix de vente unitaire HT');
    check(await salePrice.isVisible(), 'Une ligne libre ouvre ses propres prix et coûts');
    await salePrice.fill('10000');
    await page.getByLabel('Coût d’achat unitaire HT', { exact: true }).fill('6000');
    await page.keyboard.press('Escape');
    check(/37%/.test(await manualMargin.innerText()), 'Ligne libre : marge après frais calculée sur les prix saisis');
    await page.waitForTimeout(1000);
    const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.endsWith(':draftQuote')))).quote);
    check(persisted.lots[0].items.length === 2 && !persisted.lots[0].items[0].isCustom && persisted.lots[0].items[1].isCustom,
        'Les réglages de la ligne libre ne modifient pas l’ouvrage calculé');
    check(errors.length === 0, `Aucune erreur JavaScript (${errors.join('; ')})`);
    console.log(`${checks} contrôles réussis. Captures : ${artifacts}`);
} catch (error) {
    if (page) await page.screenshot({ animations: 'disabled', path: `${artifacts}/failure.png` }).catch(() => {});
    throw error;
} finally {
    await browser?.close();
    server.server.closeAllConnections(); await server.close();
}
