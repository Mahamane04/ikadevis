// Audit UI/UX approfondi du 2026-09-02, contre la PRODUCTION déployée et avec
// les données réelles du compte MicroOffice rejouées dans le navigateur.
//
// Limite assumée et dite : la connexion au compte réel exige un mot de passe,
// que je ne saisis pas. Les chemins d'authentification et de synchronisation
// cloud sont donc audités séparément, en base. Tout le reste — rendu, volumes,
// montants, réglages d'entreprise — s'appuie sur les données réelles.
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const URL = 'https://ikadevis.officemicro89.workers.dev/';
const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms));
const REEL = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

// ── Sonde : compte des faits, ne juge rien ────────────────────────────────
const SONDE = `(() => {
  const lum=c=>{const m=(c||'').match(/[\\d.]+/g);if(!m)return 1;const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(m[0])+0.7152*f(m[1])+0.0722*f(m[2])};
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
  const visible=el=>{const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none'||cs.opacity==='0')return false;
    const r=el.getBoundingClientRect();return r.width>1&&r.height>1;};

  // Contraste
  const contrastes=[];let textes=0;
  for(const el of document.querySelectorAll('body *')){const t=(el.innerText||'').trim();
    if(el.children.length||!t||t.length>70)continue;
    if(!visible(el))continue;
    const r=el.getBoundingClientRect();if(r.top>innerHeight||r.bottom<0)continue;
    textes++;
    try{const cs=getComputedStyle(el);const l1=lum(cs.color),l2=lum(bg(el));
      const ratio=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
      const s=parseFloat(cs.fontSize),g=parseInt(cs.fontWeight)>=700;
      const need=(s>=24||(s>=18.66&&g))?3:4.5;
      if(ratio<need)contrastes.push({t:t.slice(0,34),ratio:+ratio.toFixed(2),need});}catch(e){}}

  // Interactifs
  const inter=[...document.querySelectorAll('button,a[href],[role="button"],input,select,textarea')].filter(visible);
  const sansNom=inter.filter(e=>{
    const txt=(e.innerText||'').trim();
    return !txt && !e.getAttribute('aria-label') && !e.getAttribute('title')
      && !e.getAttribute('aria-labelledby')
      && !(e.id && document.querySelector('label[for="'+CSS.escape(e.id)+'"]'));
  }).map(e=>e.tagName+'.'+(e.className||'').toString().split(' ')[0]);

  // Champs de saisie sans étiquette explicite
  const champs=[...document.querySelectorAll('input,select,textarea')].filter(visible);
  const champsSansLabel=champs.filter(e=>!e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby')
      && !(e.id && document.querySelector('label[for="'+CSS.escape(e.id)+'"]'))).length;

  // Cibles tactiles
  const petites=inter.filter(e=>{const r=e.getBoundingClientRect();return r.width<24||r.height<24;}).length;
  const sousQuaranteQuatre=inter.filter(e=>{const r=e.getBoundingClientRect();return r.width<44||r.height<44;}).length;

  // Structure
  const h=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).map(e=>+e.tagName[1]);
  let sauts=0;for(let i=1;i<h.length;i++)if(h[i]-h[i-1]>1)sauts++;

  // Débordement horizontal
  const deborde=document.documentElement.scrollWidth>document.documentElement.clientWidth+1;
  const blocsQuiDebordent=[...document.querySelectorAll('body *')].filter(e=>{
    if(!visible(e))return false;const cs=getComputedStyle(e);
    if(cs.overflowX==='auto'||cs.overflowX==='scroll')return false;
    return e.scrollWidth>e.clientWidth+2 && e.clientWidth>0;}).length;

  // Zones défilantes bloquées : contenu plus grand que la boîte, sans scroll
  const scrollBloque=[...document.querySelectorAll('body *')].filter(e=>{
    if(!visible(e))return false;const cs=getComputedStyle(e);
    if(cs.overflowY!=='auto'&&cs.overflowY!=='scroll')return false;
    const enfant=[...e.children].reduce((m,c)=>Math.max(m,c.getBoundingClientRect().height),0);
    return enfant>e.clientHeight+8 && e.scrollHeight<=e.clientHeight+1;}).length;

  return {
    textes, contrastes:contrastes.length, exemplesContraste:contrastes.slice(0,3),
    interactifs:inter.length, sansNom:sansNom.length, exemplesSansNom:[...new Set(sansNom)].slice(0,3),
    champs:champs.length, champsSansLabel,
    ciblesSous24:petites, ciblesSous44:sousQuaranteQuatre,
    titres:h.length, sautsDeNiveau:sauts,
    h1:document.querySelectorAll('h1').length,
    landmarks:{main:document.querySelectorAll('main').length,nav:document.querySelectorAll('nav').length,aside:document.querySelectorAll('aside').length},
    debordeHorizontal:deborde, blocsQuiDebordent, scrollBloque
  };
})()`;

const ECRANS = [
  ['Tableau de bord', 'Tableau de bord'],
  ['Chantiers', 'Chantiers'],
  ['Clients', 'Clients'],
  ['Chiffrage', 'Chiffrage'],
  ['Mes devis', 'Mes devis'],
  ['Factures', 'Factures']
];

async function session(largeur, hauteur) {
  const nav = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await nav.newPage();
  const consoleErreurs = [];
  const requetesEchouees = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErreurs.push(m.text().slice(0, 140)); });
  page.on('pageerror', (e) => consoleErreurs.push('pageerror: ' + e.message.slice(0, 140)));
  page.on('requestfailed', (r) => requetesEchouees.push(r.url().split('/').pop().slice(0, 60)));
  await page.setViewport({ width: largeur, height: hauteur });
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await wait(1400);
  await page.evaluate(() => { const x = [...document.querySelectorAll('button')].find(e => /Essayer sans compte/.test(e.textContent || '')); if (x) x.click(); });
  await wait(3200);
  // Injecter les données réelles du compte.
  await page.evaluate((r) => {
    localStorage.setItem('costcalc:guest:companyInfo', JSON.stringify(r.societe));
    localStorage.setItem('costcalc:guest:savedQuotes', JSON.stringify(r.devis));
    localStorage.setItem('costcalc:guest:demoQuoteOpened', '1');
  }, REEL);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(2000);
  await page.evaluate(() => { const x = [...document.querySelectorAll('button')].find(e => /Essayer sans compte/.test(e.textContent || '')); if (x) x.click(); });
  await wait(3200);
  return { nav, page, consoleErreurs, requetesEchouees };
}

const resultats = { largeurs: {}, console: [], requetes: [] };

for (const [largeur, hauteur, nomLargeur] of [[1440, 900, 'bureau'], [768, 1024, 'tablette'], [390, 844, 'mobile']]) {
  const { nav, page, consoleErreurs, requetesEchouees } = await session(largeur, hauteur);
  const ecrans = [];
  for (const [libelle, cible] of ECRANS) {
    // La navigation change de forme selon la largeur, et le premier jet de cet
    // audit s'y est fait piéger : à 768 px la barre latérale passe en
    // `display:none` et laisse un RAIL D'ICÔNES dont les libellés vivent dans
    // `aria-label`, pas dans le texte ; à 390 px une barre basse porte quatre
    // entrées et le reste passe par « Ouvrir le menu de navigation ». Chercher
    // le texte du bouton donnait donc « aucun écran atteignable » sur les deux
    // largeurs — un défaut de la sonde, pas du produit. On cherche désormais le
    // texte OU l'aria-label, et on ouvre le menu si besoin.
    const ouvert = await page.evaluate(async (c) => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const trouver = () => [...document.querySelectorAll('button, a[role="button"]')]
        .filter(vis)
        .find(x => (x.textContent || '').trim().startsWith(c)
                || (x.getAttribute('aria-label') || '').trim().startsWith(c));
      let b = trouver();
      if (!b) {
        const menu = [...document.querySelectorAll('button')].filter(vis)
          .find(x => /Ouvrir le menu/i.test(x.getAttribute('aria-label') || ''));
        if (menu) { menu.click(); await new Promise(r => setTimeout(r, 700)); b = trouver(); }
      }
      if (b) { b.click(); return true; }
      return false;
    }, cible);
    await wait(2000);
    const m = await page.evaluate(SONDE);
    ecrans.push({ ecran: libelle, atteignable: ouvert, ...m });
  }
  resultats.largeurs[nomLargeur] = { largeur, ecrans };
  resultats.console.push(...consoleErreurs);
  resultats.requetes.push(...requetesEchouees);
  await nav.close();
  console.error(`  ${nomLargeur} (${largeur}px) mesuré`);
}

resultats.console = [...new Set(resultats.console)];
resultats.requetes = [...new Set(resultats.requetes)];
console.log(JSON.stringify(resultats, null, 1));
