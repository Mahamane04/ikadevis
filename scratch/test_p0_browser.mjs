// Run only in a disposable copy with config.example.js as config.js.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { startServer } from './lib/server.mjs';
assert.equal(readFileSync('config.js','utf8'),readFileSync('config.example.js','utf8'),'Ce test exige une copie isolée avec la configuration fictive.');
const server = await startServer();
const browser = await puppeteer.launch({headless:true});
const page = await browser.newPage();
const errors=[], blocked=[];
page.on('pageerror',e=>errors.push(e.message));
await page.setBypassServiceWorker(true);
await page.setRequestInterception(true);
page.on('request',r=>{
    const u=new URL(r.url());
    if (u.origin===server.url || ['data:','blob:','about:'].includes(u.protocol)) r.continue();
    else { blocked.push(u.hostname); r.abort(); }
});
try {
    await page.setViewport({width:1440,height:1000});
    await page.goto(server.url+'/index.html',{waitUntil:'networkidle0'});
    await page.waitForFunction(()=>document.body.innerText.includes('Essayer sans compte'));
    await page.evaluate(()=>{
        localStorage.setItem('costcalc:guest:demoQuoteOpened','true');
        [...document.querySelectorAll('button')].find(b=>b.textContent.includes('Essayer sans compte')).click();
    });
    await page.waitForFunction(()=>document.querySelector('aside') && document.body.innerText.includes('Nouveau devis'));
    await page.waitForFunction(()=>!document.querySelector('.animate-page-spin'));
    assert.deepEqual(errors,[],'Aucune erreur JS au démarrage invité');
    const health=await page.evaluate(()=>({
        catalog:typeof window.CatalogPersistence,
        clean:typeof window.PaymentDataSafety.withoutPaymentSecrets,
        suspended:window.SasPayService.estConfiguree({apiKey:'FAKE',enabled:true})===false,
        platform:typeof window.SubscriptionService,
    }));
    assert.equal(health.catalog,'function');assert.equal(health.clean,'function');
    assert.equal(health.suspended,true);assert.equal(health.platform,'object');
    for(const width of [390,1440]) {
        await page.setViewport({width,height:1000});
        assert.ok(await page.evaluate(()=>!!document.querySelector('#root').textContent.trim()));
    }
    assert.deepEqual(errors,[],'Aucune erreur JS après changement de largeur');
    console.log('Navigateur : démarrage invité, modules P0 chargés, passerelle entreprise suspendue, service abonnement présent, rendu à 390/1440 px, zéro erreur JS.');
    console.log(`Requêtes externes bloquées par le harnais : ${blocked.length}. Aucun compte ni service réel utilisé.`);
} finally { await browser.close(); await server.close(); }
