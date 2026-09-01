import { launchApp, enterGuestMode, addCatalogItemBySearch } from './lib/harness.mjs';
const wait=(ms=500)=>new Promise(r=>setTimeout(r,ms));
const { page, close } = await launchApp();
try{
  await page.setViewport({width:375,height:812,isMobile:true,hasTouch:true});
  await enterGuestMode(page);
  await addCatalogItemBySearch(page,'Maçonnerie');
  await wait(900);
  const m = await page.evaluate(()=>{
    const barre=document.querySelector('.quote-totals-bar');
    const r=barre.getBoundingClientRect();
    const onglets=[...document.querySelectorAll('.mobile-bottom-nav button')].map(b=>b.textContent.trim()).filter(Boolean);
    const burger=[...document.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||'')==='Ouvrir le menu de navigation');
    if(burger)burger.click();
    return {barreHauteur:Math.round(r.height), barreHaut:Math.round(r.top),
            defileEnInterne: barre.scrollHeight>barre.clientHeight+2,
            zoneUtile: Math.round(r.top-80), onglets};
  });
  await wait(600);
  const tiroir = await page.evaluate(()=>[...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(Boolean));
  const coherent = m.onglets.every(o=>tiroir.some(t=>t===o||t.startsWith(o)));
  // On ne mesure pas la boîte du bouton mais sa zone RÉELLEMENT cliquable :
  // un ::after transparent élargit la surface active sans changer le dessin,
  // et getBoundingClientRect ne le voit pas. On interroge donc le hit-testing
  // aux quatre coins d'un carré de 44 px centré sur le bouton.
  const petits = await page.evaluate(()=>{
    const atteint=(b,cx,cy)=>{const el=document.elementFromPoint(cx,cy);return !!el && (b===el || b.contains(el) || el.contains(b));};
    return [...document.querySelectorAll('button')].map(b=>{
      const r=b.getBoundingClientRect();
      if(r.width<=0||r.height<=0) return null;
      const cx=r.left+r.width/2, cy=r.top+r.height/2, d=21;
      if(cx-d<0||cy-d<0||cx+d>innerWidth||cy+d>innerHeight) return null; // hors écran : non mesurable
      const coins=[[cx-d,cy-d],[cx+d,cy-d],[cx-d,cy+d],[cx+d,cy+d]];
      const ok=coins.every(([x,y])=>atteint(b,x,y));
      return ok? null : {t:(b.innerText||'').trim().slice(0,24),aria:b.getAttribute('aria-label'),w:Math.round(r.width),h:Math.round(r.height)};
    }).filter(Boolean);
  });
  console.log(JSON.stringify({...m, vocabulaireCoherent:coherent, ciblesSous44px:petits}, null, 1));
} finally { await close(); }
