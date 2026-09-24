import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const c=vm.createContext({console});
for(const f of ['js/finance-core.js','js/calc-engine.js']) vm.runInContext(readFileSync(f,'utf8'),c);
let checks=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++};
// Quantities displayed to eight decimals and PU precision explain each stored total.
for(const [q,t,cur] of [[40,386722,'FCFA'],[168,1638000,'FCFA'],[3,100,'FCFA'],[.333333333333,71,'FCFA'],[2.75,18373,'FCFA'],[2.75,18.37,'EUR'],[1,0,'FCFA']]) {
 const p=c.precisionLigneCommerciale(q,t,cur);
 eq(c.arrondiMonetaire(p.quantity*p.unitPrice,c.decimalesDevise(cur)),t,`${q} × PU = ${t}`);
}
eq(c.precisionLigneCommerciale(40,386722,'FCFA').unitPrice,9668.05,'Cas audit exact');
const solutions=[{id:1,name:'Mur test',allowedModes:['surface'],customVars:[]}];
const materials=[{id:10,name:'Agglo test',unitCalc:'u',unitBuy:'u',unitSize:1,priceBuy:400,priceCalc:400,waste:5,purchaseMode:'real'}];
const labor=[{id:20,name:'Maçon test',unit:'h',rate:1500}];
const recipes=[{id:1,solutionId:1,type:'material',refId:10,formula:'SURFACE * 12.5',label:'Agglos'}, {id:2,solutionId:1,type:'labor',refId:20,formula:'SURFACE * .5',label:'Pose'}];
const base={id:'mur',solutionId:1,name:'Mur de clôture',description:'Mur de clôture — 20 m × 2 m\nAccès <cour> & façade échantillon.',qty:1,calcForm:{solutionId:1,takeoffMode:'surface',surfaceDirect:40,qty:1,margin:30,marginType:'reel',overheadRate:5,vatRate:18,discountRate:0,customVarValues:{}}};
const calc=i=>c.calculateSingleWorkItem(i,solutions,materials,labor,recipes,{});
const original=JSON.stringify({base,solutions,materials,labor,recipes});
const initial=calc(base);
const custom={...base,calcForm:{...base.calcForm,priceOverrides:{material:{10:450},labor:{20:1700}}}};
const revised=calc(custom);
eq(revised.quoteData.details[0].unitCost,450,'Prix matière du devis');
eq(revised.quoteData.details[1].unitCost,1700,'Main-d’œuvre du devis');
eq(revised.quoteData.details[1].laborId,20,'Identité main-d’œuvre conservée');
eq(revised.quoteData.totalDebourseConsomme,525*450+20*1700,'Coût après pertes');
eq(JSON.stringify({base,solutions,materials,labor,recipes}),original,'Aucune mutation du catalogue ou autre ouvrage');
eq(calc(base).totalHT,initial.totalHT,'Autre devis inchangé');
eq(calc({...custom,calcForm:{...custom.calcForm,priceOverrides:{material:{10:0}}}}).quoteData.details[0].unitCost,0,'Prix nul explicite');
eq(calc({...custom,calcForm:{...custom.calcForm,priceOverrides:{material:{10:null}}}}).quoteData.details[0].unitCost,400,'Retour au catalogue');
for (const discountRate of [0,13,50]) {
 const r=calc({...custom,calcForm:{...custom.calcForm,discountRate}});
 eq(r.quoteData.margeValeurConsomme,r.totalHT-r.quoteData.totalRevientConsomme,'Marge cohérente après remise');
}
const quote={id:100,number:'TEST-001',clientName:'Client fictif',vatRate:18,overheadRate:5,margin:30,lots:[{id:'lot1',code:'01',name:'Maçonnerie',items:[custom]},{id:'lot2',code:'02',name:'Divers',items:[{id:'libre',isCustom:true,qty:3,unitPriceHT:10000,costUnit:3000,name:'Prestation'}]}]};
const calculated=c.calculateHybridQuote(quote,solutions,materials,labor,recipes);
const saved=c.adaptHybridToSavedQuote(calculated,{name:'Entreprise test',currency:'FCFA'});
const savedCopy=JSON.stringify(saved);
const restored=c.adaptSavedQuoteToHybrid(JSON.parse(savedCopy),solutions,materials,labor,recipes);
eq(restored.lots[0].items[0].description,base.description,'Description après sauvegarde');
eq(restored.lots[0].items[0].calcForm.priceOverrides.material[10],450,'Prix personnalisé après reprise');
eq(restored.totalTTC,calculated.totalTTC,'Total après reprise');
eq(JSON.stringify(saved),savedCopy,'Document enregistré inchangé');
// A new account can have empty/different catalogs: recovered quote stays calculable.
const transfer=c.preparerRepriseDemo(quote,solutions,materials,labor,recipes);
const transferSerialized=JSON.stringify(transfer);
const recovered=c.calculateHybridQuote(JSON.parse(transferSerialized),[],[],[],[]);
eq(recovered.totalTTC,calculated.totalTTC,'Reprise sans catalogue importé');
eq(recovered.lots[0].items[0].calcForm.surfaceDirect,40,'Métré conservé');
eq(recovered.lots[0].items[0].calcForm.margin,30,'Marge conservée');
eq(recovered.lots[0].items[0].description,base.description,'Description multilignes conservée');
eq(JSON.stringify(transfer),transferSerialized,'Reprise sans mutation de la sauvegarde');
eq(saved.quoteData.commercialItems[0].description,base.description,'Description transmise au PDF');

const mixedFees = c.calculateHybridQuote({...quote,lots:[{id:'fees',items:[{...custom,calcForm:{...custom.calcForm,overheadRate:0}},{...custom,id:'second',calcForm:{...custom.calcForm,overheadRate:10}}]}]},solutions,materials,labor,recipes);
eq(mixedFees.totalFraisGen,mixedFees.totalRevient-mixedFees.totalDebourse,'Les frais propres aux ouvrages sont additionnés');
eq(calc({...base,needsQuantityConfirmation:true}).needsQuantityConfirmation,true,'Confirmation encore requise après calcul');
eq(c.calculateHybridQuote({...quote,lots:[{id:'pending',items:[{...base,needsQuantityConfirmation:true}]}]},solutions,materials,labor,recipes).lots[0].isComplete,false,'Une quantité non confirmée ne valide pas le lot');
eq(c.calculateSingleWorkItem({isCustom:true,qty:.5,unitPriceHT:10000,costUnit:6000},[],[],[],[],{overheadRate:0}).totalHT,5000,'Quantité fractionnaire de ligne libre respectée');
eq(c.calculateSingleWorkItem({isCustom:true,qty:2.5,unitPriceHT:10000,costUnit:6000},[],[],[],[],{overheadRate:0}).quoteData.margeValeurConsomme,10000,'Zéro frais explicite respecté sur ligne libre');
eq(c.adaptHybridToSavedQuote({...calculated,clientName:''},{}).clientName,'','Aucun client fictif ajouté au brouillon');
eq(Number.isFinite(calc({...base,calcForm:{...base.calcForm,margin:'',overheadRate:''}}).totalHT),true,'Effacer un taux ne produit pas NaN');
console.log(`${checks} contrôles découverte réussis.`);
