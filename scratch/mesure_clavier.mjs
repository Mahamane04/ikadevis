// Balayage clavier : chaque commande est-elle atteignable au Tab, avec un
// focus VISIBLE, sans piège (boucle qui ne progresse plus) ? Ne mesure pas le
// lecteur d'écran — seulement la navigation clavier, qui en est le socle.
import { launchApp, enterGuestMode, addCatalogItemBySearch } from './lib/harness.mjs';
const wait=(ms=200)=>new Promise(r=>setTimeout(r,ms));
const { page, close } = await launchApp();
try{
  await page.setViewport({width:1440,height:900});
  await enterGuestMode(page);
  await addCatalogItemBySearch(page,'Maçonnerie');
  await wait(800);

  const vus = new Set(); const sansFocusVisible = []; let piege = null; let dernier = null, repetitions = 0;
  await page.evaluate(()=>document.body.focus());
  for (let i=0;i<70;i++){
    await page.keyboard.press('Tab');
    const info = await page.evaluate(()=>{
      const a=document.activeElement;
      if(!a||a===document.body) return null;
      const cs=getComputedStyle(a);
      const r=a.getBoundingClientRect();
      // Focus visible = un contour, un anneau, ou un changement de fond marqué
      const contour = cs.outlineStyle!=='none' && parseFloat(cs.outlineWidth)>0;
      const anneau = /inset|rgba?\(/.test(cs.boxShadow) && cs.boxShadow!=='none';
      return {
        cle: (a.tagName+'|'+(a.getAttribute('aria-label')||a.textContent||'').trim().slice(0,40)),
        visible: r.width>0 && r.height>0,
        focusVisible: contour || anneau
      };
    });
    if(!info) continue;
    // Un vrai piège = le focus ne progresse plus. Revoir un élément après un
    // tour complet est le bouclage normal du navigateur, pas un piège : on ne
    // le déclare que si le MÊME élément revient trois fois d'affilée.
    if(info.cle === dernier){ repetitions++; if(repetitions>=2){ piege = info.cle; break; } } else { repetitions = 0; }
    dernier = info.cle;
    vus.add(info.cle);
    if(info.visible && !info.focusVisible) sansFocusVisible.push(info.cle);
  }
  console.log(JSON.stringify({
    commandesAtteintes: vus.size,
    toursComplets: 'balayage de 70 tabulations',
    sansFocusVisible: [...new Set(sansFocusVisible)].slice(0,8),
    nbSansFocusVisible: new Set(sansFocusVisible).size,
    piege
  }, null, 1));
} finally { await close(); }
