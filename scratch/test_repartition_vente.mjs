import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync('/Users/mahamanehaidara/Documents/ANTY GRAVITY APSS/Micro office ERP CALCUL/js/utils.js', 'utf-8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(src + '\nthis.distributeLotSalePrice = distributeLotSalePrice;', sandbox);
const f = sandbox.distributeLotSalePrice;

let ok = 0, ko = 0;
const check = (nom, cond, info='') => { if (cond) { ok++; console.log('  OK   ' + nom); } else { ko++; console.log('  ÉCHEC ' + nom + ' ' + info); } };

// Cas 1 — cas réel mesuré dans l'app (Panneau cadre métallique, 7 lignes)
const reel = [
  { label:'Fer du cadre', billedQty:6.3,  totalCost:18000 },
  { label:'Renforts',     billedQty:2.1,  totalCost:9000 },
  { label:'Vinyle',       billedQty:2.16, totalCost:10800 },
  { label:'Plaque fond',  billedQty:2.1,  totalCost:21000 },
  { label:'Soudure',      billedQty:1,    totalCost:10000 },
  { label:'Pose vinyle',  billedQty:2,    totalCost:4000 },
  { label:'Installation', billedQty:1,    totalCost:15000 }
];
const r1 = f(reel, 87800, 131700);
const s1 = r1.reduce((s,d)=>s+d.saleTotal,0);
check('cas réel : somme = prix de vente du lot', s1 === 131700, `(obtenu ${s1})`);
check('cas réel : chaque ligne > 0', r1.every(d=>d.saleTotal>0));
check('cas réel : prix unitaire cohérent', Math.abs(r1[0].saleUnit*r1[0].billedQty - r1[0].saleTotal) < 0.01);

// Cas 2 — arrondis hostiles : montants premiers, coefficient irrationnel
const hostile = Array.from({length:13}, (_,i)=>({ label:'L'+i, billedQty:i+1, totalCost:997*(i+1)+3 }));
const coutH = hostile.reduce((s,d)=>s+d.totalCost,0);
const r2 = f(hostile, coutH, 314159);
const s2 = r2.reduce((s,d)=>s+d.saleTotal,0);
check('arrondis hostiles : somme exacte', s2 === 314159, `(obtenu ${s2})`);

// Cas 3 — une seule ligne
const r3 = f([{label:'Seule', billedQty:1, totalCost:500}], 500, 777);
check('ligne unique : somme exacte', r3.reduce((s,d)=>s+d.saleTotal,0) === 777);

// Cas 4 — coefficient < 1 (vente à perte)
const r4 = f(reel, 87800, 50000);
const s4 = r4.reduce((s,d)=>s+d.saleTotal,0);
check('vente à perte : somme exacte', s4 === 50000, `(obtenu ${s4})`);

// Cas 5 — cas dégénérés : doit renvoyer null, jamais planter
check('déboursé nul -> null', f(reel, 0, 131700) === null);
check('prix de vente nul -> null', f(reel, 87800, 0) === null);
check('aucune ligne -> null', f([], 87800, 131700) === null);
check('details undefined -> null', f(undefined, 87800, 131700) === null);
check('lignes à coût nul -> null', f([{label:'x',billedQty:1,totalCost:0}], 87800, 131700) === null);

// Cas 6 — l'ajustement doit rester négligeable (pas de ligne déformée)
const brut = reel.map(d => d.totalCost * (131700/87800));
const ecarts = r1.map((d,i)=>Math.abs(d.saleTotal - brut[i]));
check('ajustement < 1 FCFA par ligne', Math.max(...ecarts) < 1, `(max ${Math.max(...ecarts).toFixed(3)})`);

// Cas 7 — non-régression : l'entrée ne doit pas être mutée
const avant = JSON.stringify(reel);
f(reel, 87800, 131700);
check('entrée non mutée', JSON.stringify(reel) === avant);

console.log(`\n${ok} OK, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
