// Mesure objective des critères notés dans l'audit, sur le produit corrigé.
// Ne juge rien : compte des faits (contrastes, noms accessibles, cibles
// tactiles, place utile, cohérence de vocabulaire).
import { launchApp, enterGuestMode, addCatalogItemBySearch } from './lib/harness.mjs';
const wait = (ms=400)=>new Promise(r=>setTimeout(r,ms));

const SONDE = `(() => {
  const lum=c=>{const m=c.match(/[\\d.]+/g).map(Number);const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(m[0])+0.7152*f(m[1])+0.0722*f(m[2])};
  const bg=el=>{const pile=[];let e=el;
    while(e){const cs=getComputedStyle(e);const m=(cs.backgroundColor||'').match(/[\\d.]+/g);
      if(m){const a=m.length>3?parseFloat(m[3]):1;if(a>0)pile.push([+m[0],+m[1],+m[2],a]);}
      const img=cs.backgroundImage;
      if(img&&img!=='none'&&/gradient/.test(img)){const c=img.match(/rgba?\\(([^)]+)\\)/);
        if(c){const v=c[1].split(',').map(Number);pile.push([v[0],v[1],v[2],v.length>3?v[3]:1]);}}
      e=e.parentElement;}
    pile.push([255,255,255,1]);
    let r=255,g=255,b=255;
    for(let i=pile.length-1;i>=0;i--){const[pr,pg,pb,pa]=pile[i];r=pr*pa+r*(1-pa);g=pg*pa+g*(1-pa);b=pb*pa+b*(1-pa);}
    return 'rgb('+Math.round(r)+', '+Math.round(g)+', '+Math.round(b)+')';};
  const ech=[];let tot=0;
  for(const el of document.querySelectorAll('body *')){const t=(el.innerText||'').trim();
    if(el.children.length||!t||t.length>70)continue;
    const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none')continue;
    const r=el.getBoundingClientRect();if(r.width<2||r.height<2||r.top>innerHeight||r.bottom<0)continue;
    tot++;
    try{const l1=lum(cs.color),l2=lum(bg(el));
      const ratio=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
      const s=parseFloat(cs.fontSize),g=parseInt(cs.fontWeight)>=700;
      const need=(s>=24||(s>=18.66&&g))?3:4.5;
      if(ratio<need)ech.push({t:t.slice(0,30),ratio:+ratio.toFixed(2)});}catch(e){}}
  const btns=[...document.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect();return r.width>0&&r.height>0});
  return {textes:tot, echecsContraste:ech.length, detail:ech.slice(0,4),
    boutons:btns.length,
    sansNom:btns.filter(b=>!(b.innerText||'').trim()&&!b.getAttribute('aria-label')&&!b.getAttribute('title')).length,
    ciblesPetites:btns.filter(b=>{const r=b.getBoundingClientRect();return r.width<24||r.height<24}).length};
})()`;

const ecrans = [];
async function mesurer(page, nom) { ecrans.push({ ecran: nom, ...(await page.evaluate(SONDE)) }); }

{
  const { page, close } = await launchApp();
  try {
    await page.setViewport({ width: 1440, height: 900 });
    await mesurer(page, 'connexion');
    await enterGuestMode(page);
    await wait(800);
    await mesurer(page, 'chiffrage (vide)');
    await addCatalogItemBySearch(page, 'Maçonnerie');
    await wait(900);
    await mesurer(page, 'chiffrage (1 ouvrage)');
    for (const [libelle, nom] of [['Tableau de bord','tableau de bord'],['Chantier','chantiers'],['Client','clients'],['Mes devis','mes devis'],['Facture','factures']]) {
      await page.evaluate((l)=>{const b=[...document.querySelectorAll('aside button')].find(x=>(x.textContent||'').trim().startsWith(l));if(b)b.click();}, libelle);
      await wait(700);
      await mesurer(page, nom);
    }
  } finally { await close(); }
}
console.log(JSON.stringify(ecrans, null, 1));
