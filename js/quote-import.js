/* Import de bordereaux : lecture locale, aucune transmission du fichier. */
(function (root) {
    'use strict';
    const MAX_ROWS = 1000, MAX_BYTES = 5 * 1024 * 1024;
    const fields = [
        { key: 'lot', label: 'Lot', aliases: ['lot', 'corps d etat', 'chapitre'] },
        { key: 'name', label: 'Désignation', required: true, aliases: ['designation', 'description', 'libelle', 'ouvrage', 'designation des travaux'] },
        { key: 'unit', label: 'Unité', required: true, aliases: ['unite', 'u', 'unite de mesure'] },
        { key: 'qty', label: 'Quantité', required: true, aliases: ['quantite', 'qte', 'qty', 'quantites'] },
        { key: 'price', label: 'Prix unitaire HT', required: true, aliases: ['pu', 'pu ht', 'prix unitaire', 'prix unitaire ht', 'prix de vente ht'] },
        { key: 'cost', label: 'Coût unitaire (facultatif)', aliases: ['cout', 'cout unitaire', 'cout unitaire ht', 'debourse unitaire'] },
        { key: 'total', label: 'Montant HT à vérifier (facultatif)', aliases: ['montant', 'montant ht', 'total ht', 'prix total'] }
    ];
    const normalize = x => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    function number(x) {
        if (typeof x === 'number') return Number.isFinite(x) ? x : NaN;
        let s = String(x ?? '').trim().replace(/[\s\u00a0\u202f]/g, '');
        if (!s || !/^[+\-]?\d+(?:[.,]\d+)*$/.test(s)) return NaN;
        if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
        else s = s.replace(',', '.');
        const n = Number(s); return Number.isFinite(n) ? n : NaN;
    }
    function parseText(text, delimiter) {
        const src = String(text ?? '').replace(/^\uFEFF/, '');
        if (src.length > MAX_BYTES) throw new Error('Le fichier dépasse 5 Mo. Séparez le bordereau en plusieurs fichiers.');
        if (!delimiter) {
            const line = src.split(/\r?\n/).find(x => x.trim()) || '';
            const counts = [';', '\t', ','].map(d => { let quote=false,n=0; for(let i=0;i<line.length;i++){if(line[i]==='"'){if(quote && line[i+1]==='"')i++;else quote=!quote;}else if(!quote && line[i]===d)n++;} return {d,n}; });
            delimiter = counts.sort((a,b)=>b.n-a.n)[0].d;
        }
        const rows=[]; let row=[], cell='', quoted=false;
        const push=()=>{row.push(cell.trim());cell='';};
        const end=()=>{push();rows.push(row);row=[];if(rows.length>MAX_ROWS+101)throw new Error('Maximum 1 000 lignes de travaux par import.');};
        for(let i=0;i<src.length;i++) {
            const c=src[i];
            if(c==='"'){if(quoted && src[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
            else if(!quoted && c===delimiter)push();
            else if(!quoted && (c==='\n'||c==='\r')){if(c==='\r'&&src[i+1]==='\n')i++;end();}
            else cell+=c;
        }
        if(quoted)throw new Error('Guillemets non fermés dans le fichier. Vérifiez le format CSV.');
        if(cell || row.length)end();
        return rows;
    }
    function mapHeaders(row) {
        const mapping={},used=new Set();
        fields.forEach(field=>{const i=row.findIndex((x,i)=>!used.has(i)&&field.aliases.includes(normalize(x)));if(i>=0){mapping[field.key]=i;used.add(i);}});
        return mapping;
    }
    function detectHeader(rows) {
        let best=0, score=-1;
        rows.slice(0,30).forEach((r,i)=>{const m=mapHeaders(r);const n=Object.keys(m).length+(m.name!==undefined?3:0);if(n>score){best=i;score=n;}});
        return best;
    }
    function preview(rows, headerIndex, mapping, excluded=[]) {
        if(!rows.length) return {lines:[],errors:[],total:0,missingCosts:0,skipped:0};
        const errors=[],used=Object.values(mapping).filter(v=>v!==''&&v!=null).map(Number);
        fields.filter(f=>f.required).forEach(f=>{if(mapping[f.key]==null||mapping[f.key]==='')errors.push(`Associez la colonne « ${f.label} ».`);});
        if(new Set(used).size!==used.length)errors.push('Chaque colonne doit être associée à un seul champ.');
        if(rows.length-headerIndex-1>MAX_ROWS)errors.push('Maximum 1 000 lignes par import.');
        let lastLot='Travaux';const ignore=new Set(excluded);let skipped=0;
        const lines=rows.slice(headerIndex+1).flatMap((r,i)=>{
            const rowNumber=headerIndex+i+2;
            if(r.every(x=>String(x??'').trim()===''))return [];
            const get=k=>mapping[k]!=null&&mapping[k]!==''?r[Number(mapping[k])]:undefined;
            const lot=String(get('lot')??'').trim();if(lot)lastLot=lot;
            const name=String(get('name')??'').trim(),unit=String(get('unit')??'').trim();
            const qty=number(get('qty')),price=number(get('price')),costRaw=get('cost'),cost=String(costRaw??'').trim()===''?null:number(costRaw);
            const issues=[];
            if(!name)issues.push('Désignation manquante');
            if(!unit)issues.push('Unité manquante');
            if(!(qty>0)||qty>1e9)issues.push('Quantité positive requise');
            if(!(price>=0)||price>1e12)issues.push('Prix HT invalide');
            if(cost!==null&&(!(cost>=0)||cost>1e12))issues.push('Coût invalide');
            const total=Number.isFinite(qty*price)?Math.round(qty*price):0;
            if(total>1e14)issues.push('Montant trop élevé');
            const supplied=get('total');
            if(String(supplied??'').trim()!==''&&(!Number.isFinite(number(supplied))||Math.abs(Math.round(number(supplied))-total)>1))issues.push('Le montant ne correspond pas à quantité × prix');
            const ignored=ignore.has(rowNumber);if(ignored)skipped++;
            return [{rowNumber,lot:lastLot,name,unit,qty,price,cost,total,issues,ignored}];
        });
        const selected=lines.filter(l=>!l.ignored);
        const total=selected.reduce((s,l)=>s+l.total,0);
        if(total>1e14)errors.push('Le montant du bordereau dépasse la limite autorisée.');
        return {lines,errors,total,missingCosts:selected.filter(l=>l.cost===null).length,skipped,valid:selected.length>0&&!errors.length&&selected.every(l=>!l.issues.length)};
    }
    function toLots(result, sourceName='Bordereau') {
        if(!result.valid)throw new Error('Corrigez les lignes signalées avant de les importer.');
        const lots=[],byName=new Map();
        const id=()=>root.crypto?.randomUUID?.()||`${Date.now()}_${Math.random().toString(36).slice(2)}`;
        result.lines.filter(l=>!l.ignored).forEach(line=>{
            let lot=byName.get(line.lot);
            if(!lot){lot={id:`import_${id()}`,code:String(lots.length+1).padStart(2,'0'),name:line.lot,items:[]};lots.push(lot);byName.set(line.lot,lot);}
            lot.items.push({id:`import_${id()}`,isCustom:true,name:line.name,description:'',unit:line.unit,qty:line.qty,unitPriceHT:line.price,costUnit:line.cost===null?'':line.cost,sourceImport:{file:sourceName,row:line.rowNumber}});
        });return lots;
    }
    let xlsxLoading;
    async function loadXlsx(){
        if(root.XLSX)return root.XLSX;
        if(!xlsxLoading)xlsxLoading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='js/vendor/xlsx-0.20.3.min.js';script.onload=()=>resolve(root.XLSX);script.onerror=()=>{xlsxLoading=null;script.remove();reject(new Error('Lecture Excel indisponible. Réessayez ou exportez le fichier en CSV.'));};document.head.appendChild(script);});
        return xlsxLoading;
    }
    async function readFile(file){
        if(file.size>MAX_BYTES)throw new Error('Maximum 5 Mo par fichier.');
        if(/\.(csv|tsv|txt)$/i.test(file.name))return [{name:file.name,rows:parseText(await file.text())}];
        if(!/\.(xlsx|xls)$/i.test(file.name))throw new Error('Choisissez un fichier Excel (.xlsx, .xls) ou CSV.');
        const XLSX=await loadXlsx();
        const book=XLSX.read(await file.arrayBuffer(),{type:'array',cellHTML:false,cellFormula:false,sheetRows:MAX_ROWS+101});
        return book.SheetNames.map(name=>{
            const sheet=book.Sheets[name],range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1');
            if(range.e.r>MAX_ROWS+100||range.e.c>99)return {name,error:'Cette feuille dépasse 1 100 lignes ou 100 colonnes. Réduisez sa taille avant l’import.',rows:[]};
            return {name,rows:XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true,blankrows:true})};
        });
    }
    root.QuoteImport={fields,number,parseText,mapHeaders,detectHeader,preview,toLots,readFile};
})(globalThis);
