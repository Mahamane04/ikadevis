/* Prévu/réalisé : les coûts proviennent des dépenses, jamais des règlements. */
(function(root){
    'use strict';
    const iso=x=>['FCFA','F CFA','CFA','XOF'].includes(String(x||'').toUpperCase())?'XOF':String(x||'').toUpperCase();
    const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
    const money=(x,currency)=>Math.round((x+Number.EPSILON)*(['XOF','XAF','JPY'].includes(iso(currency))?1:100))/(['XOF','XAF','JPY'].includes(iso(currency))?1:100);
    function matches(project, id, ref, projects){
        if(id!=null&&id!=='')return String(id)===String(project.id);
        const name=String(ref||'').trim();
        return !!name&&name===String(project.name||'').trim()&&projects.filter(p=>String(p.name||'').trim()===name).length===1;
    }
    function quoteMatches(quote,project,projects){return matches(project,quote.projectId,quote.projectRef,projects);}
    function calculate({project,projects,quote,expenses,currency,remaining,organizationId}){
        const warnings=[],rows=[],base=iso(currency);let actual=0,unassigned=0,unusable=0;
        for(const d of expenses||[]){
            if(d.status==='cancelled'||(organizationId&&d.organization_id&&d.organization_id!==organizationId))continue;
            // Les avances personnelles de frais restent des coûts, leur remboursement n'en ajoute pas.
            if(!['expense','supplier_invoice'].includes(d.kind)){unusable++;continue;}
            const splits=Array.isArray(d.splits)?d.splits:[];
            const allParts=splits.length?splits:[{project_id:d.project_id,project_ref:d.project_ref,amount:d.tax_recoverable===false?d.amount_ttc:d.amount_ht}];
            if(allParts.some(p=>!projects.some(pr=>matches(pr,p.project_id,p.project_ref,projects))))unassigned++;
            const parts=allParts.filter(p=>matches(project,p.project_id,p.project_ref,projects));
            if(!parts.length)continue;
            if(splits.length){
                const expected=Number(d.tax_recoverable===false?d.amount_ttc:d.amount_ht);
                const sum=splits.reduce((s,p)=>s+Number(p.amount),0);
                if(!finite(expected)||!Number.isFinite(sum)||Math.abs(money(sum-expected,d.currency))>0.01){warnings.push(`Répartition à corriger : ${d.description||'dépense'}.`);continue;}
            }
            const expenseCurrency=iso(d.currency);
            const fx=expenseCurrency===base?1:iso(d.base_currency)===base&&finite(d.fx_rate)&&Number(d.fx_rate)>0?Number(d.fx_rate):null;
            if(fx===null){warnings.push(`Conversion manquante : ${d.description||'dépense'} (${expenseCurrency}).`);continue;}
            const amount=parts.reduce((s,p)=>s+Number(p.amount),0);
            if(parts.some(p=>!finite(p.amount)||Number(p.amount)<0)||!Number.isFinite(amount)){warnings.push(`Montant inexploitable : ${d.description||'dépense'}.`);continue;}
            const cost=money(amount*fx,base);actual+=cost;
            rows.push({id:d.id,description:d.description,cost,status:d.status,originalCurrency:expenseCurrency});
        }
        actual=money(actual,base);
        if(unassigned)warnings.push(`${unassigned} dépense(s) sans chantier identifiable dans cette entreprise : vérifiez leur affectation.`);
        if(unusable)warnings.push(`${unusable} écriture(s) de nature non prise en charge, exclue(s) du calcul.`);
        const qd=quote?.quoteData||{};
        const quoteCurrency=iso(quote?.companyInfoSnapshot?.currency||quote?.currency);
        const comparable=!!quote&&quoteMatches(quote,project,projects)&&quoteCurrency===base;
        if(quote&&!comparable)warnings.push('Le devis doit être rattaché à ce chantier et exprimé dans la même devise.');
        const snapshot=quote?.hybridQuoteSnapshot;
        const items=snapshot?.lots?.flatMap(l=>l.items||[])||[];
        const incomplete=items.some(i=>i.error||i.needsQuantityConfirmation||(i.isCustom&&(!finite(i.costUnit)||Number(i.costUnit)<0)));
        const sales=comparable&&finite(qd.netHTConsomme)?Number(qd.netHTConsomme):null;
        const costsKnown=comparable&&!incomplete&&(items.length>0||Number(qd.totalDebourseConsomme)>0);
        const planned=costsKnown&&finite(qd.totalDebourseConsomme)?Number(qd.totalDebourseConsomme):null;
        const margin=costsKnown&&sales!==null&&finite(qd.totalRevientConsomme)?money(sales-Number(qd.totalRevientConsomme),base):null;
        if(quote&&!costsKnown)warnings.push('Complétez les coûts du devis pour connaître le budget et la marge prévus.');
        const rest=finite(remaining)&&Number(remaining)>=0?Number(remaining):null;
        return {actual,planned,sales,margin,available:sales===null?null:money(sales-actual,base),variance:planned===null?null:money(actual-planned,base),projected:sales===null||rest===null?null:money(sales-actual-rest,base),rows,warnings};
    }
    root.ProjectProfitability={calculate,quoteMatches,iso};
})(globalThis);
