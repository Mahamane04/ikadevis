// Audit sémantique : ce qu'un lecteur d'écran utilise pour se repérer.
// Ne remplace pas une écoute réelle (VoiceOver/NVDA), mais mesure ce qui est
// vérifiable sans oreille humaine : repères, titres, étiquettes, régions live.
import { launchApp, enterGuestMode, addCatalogItemBySearch } from './lib/harness.mjs';
const wait=(ms=400)=>new Promise(r=>setTimeout(r,ms));
const SONDE = `(() => {
  const q=s=>[...document.querySelectorAll(s)];
  const titres=q('h1,h2,h3,h4,h5,h6').filter(h=>h.getBoundingClientRect().height>0)
    .map(h=>({n:+h.tagName[1], t:(h.textContent||'').trim().slice(0,40)}));
  let sauts=[]; for(let i=1;i<titres.length;i++){ if(titres[i].n - titres[i-1].n > 1) sauts.push(titres[i-1].t+' → '+titres[i].t); }
  const champs=q('input,select,textarea').filter(e=>e.type!=='hidden'&&e.getBoundingClientRect().height>0);
  const sansEtiquette=champs.filter(e=>{
    if(e.getAttribute('aria-label')||e.getAttribute('aria-labelledby')||e.getAttribute('title'))return false;
    if(e.id && document.querySelector('label[for="'+CSS.escape(e.id)+'"]'))return false;
    if(e.closest('label'))return false;
    return true; });
  return {
    langue: document.documentElement.lang || null,
    repères: {main:q('main').length, nav:q('nav').length, aside:q('aside').length, header:q('header,[role=banner]').length},
    navSansNom: q('nav').filter(n=>!n.getAttribute('aria-label')&&!n.getAttribute('aria-labelledby')).length,
    h1: titres.filter(t=>t.n===1).length,
    sautsDeNiveau: sauts.slice(0,4),
    champs: champs.length,
    champsSansEtiquette: sansEtiquette.map(e=>(e.placeholder||e.name||e.type)).slice(0,6),
    regionsLive: q('[aria-live],[role=status],[role=alert]').length,
    lienEvitement: !!q('a[href^="#"]').find(a=>/contenu principal/i.test(a.textContent||'')),
    imagesSansAlt: q('img').filter(i=>i.alt===null||i.alt===undefined).length
  };
})()`;
const { page, close } = await launchApp();
try{
  await page.setViewport({width:1440,height:900});
  const ecrans=[];
  ecrans.push({ecran:'connexion', ...(await page.evaluate(SONDE))});
  await enterGuestMode(page); await wait(900);
  ecrans.push({ecran:'chiffrage', ...(await page.evaluate(SONDE))});
  await addCatalogItemBySearch(page,'Maçonnerie'); await wait(800);
  ecrans.push({ecran:'chiffrage + ouvrage', ...(await page.evaluate(SONDE))});
  console.log(JSON.stringify(ecrans,null,1));
} finally { await close(); }
