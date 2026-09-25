// Full app + deterministic Supabase double. Never a real account or network backend.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { startServer } from './lib/server.mjs';
assert.equal(readFileSync('config.js','utf8'),readFileSync('config.example.js','utf8'));
function installFake() {
    const org='11111111-1111-4111-8111-111111111111',user='33333333-3333-4333-8333-333333333333';
    const session={user:{id:user,email:'audit@example.invalid',user_metadata:{}}};
    window.testCalls=[];
    sessionStorage.setItem('ikadevis_catalog_writer','fictional-tab');
    const client={
        auth:{getSession:async()=>({data:{session}}),getUser:async()=>({data:{user:session.user}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
        functions:{invoke:async()=>({data:{subscription:{organization_id:org,plan_id:'standard',status:'active',current_period_end:'2099-01-01'}}})},
        from(table) {
            let single=false;
            const query=new Proxy({}, {get(_,method){
                if(method==='then') return resolve=>resolve({data: table==='organization_members'
                    ? [{organization_id:org,role:'owner',organizations:{id:org,name:'Entreprise fictive',currency:'FCFA'}}]
                    : table==='company_settings' ? {organization_id:org,name:'Entreprise fictive',commercial_settings:{}}
                    : single ? null : [], error:null});
                return ()=>{if(['single','maybeSingle'].includes(method))single=true;return query;};
            }}); return query;
        },
        async rpc(name,args) {
            window.testCalls.push({name,args});
            if(name==='bootstrap_user_organization') return {data:{organization_id:org,organization_name:'Entreprise fictive',role:'owner'}};
            if(name==='catalog_snapshot_v1') return {data:{fingerprint:'server-v2',rows:args.p_table==='materials'?[{id:1,name:'Matière serveur',category:'Autres',unit_buy:'u',unit_calc:'u',unit_size:1,price_buy:100,price_calc:100,waste:0,yield_rate:1}]:[]}};
            if(name==='replace_catalog_v1') return {error:{code:'40001',message:'Conflit simulé'}};
            return {data:[],error:null};
        },
    };
    window.supabase={createClient:()=>client};
    localStorage.setItem(`ikadevis_active_org_${user}`,org);
    localStorage.setItem(`ikadevis:catalog:v1:${user}:${org}:materials:fictional-tab`,JSON.stringify({
        org,table:'materials',userId:user,expected:'server-v1',id:'fictional-operation',
        rows:[{id:1,name:'Matière locale à préserver',category:'Autres',unit_buy:'u',unit_calc:'u',unit_size:1,price_buy:150,price_calc:150,waste:0,yield_rate:1}]
    }));
}
const server=await startServer(),browser=await puppeteer.launch({headless:true});
const page=await browser.newPage(),errors=[],external=[];
page.on('pageerror',e=>errors.push(e.message));
await page.setBypassServiceWorker(true);
await page.setRequestInterception(true);
page.on('request',r=>{
    const u=new URL(r.url());
    if(u.origin===server.url && u.pathname==='/vendor/supabase.min.js') r.respond({status:200,contentType:'application/javascript',body:`(${installFake.toString()})();`});
    else if(u.origin===server.url||['data:','blob:','about:'].includes(u.protocol))r.continue();
    else{external.push(u.hostname);r.abort();}
});
try {
    await page.setViewport({width:1440,height:1000});
    await page.goto(server.url+'/index.html',{waitUntil:'networkidle0'});
    await page.waitForFunction(()=>document.body.innerText.includes('Exporter la copie locale'),{timeout:15000});
    const result=await page.evaluate(()=>({
        calls:window.testCalls.map(c=>c.name),
        pending:JSON.parse(localStorage.getItem('ikadevis:catalog:v1:33333333-3333-4333-8333-333333333333:11111111-1111-4111-8111-111111111111:materials:fictional-tab')),
        text:document.body.innerText
    }));
    assert.ok(result.calls.includes('catalog_snapshot_v1')&&result.calls.includes('replace_catalog_v1'));
    assert.equal(result.pending.rows[0].name,'Matière locale à préserver');
    assert.ok(result.text.includes('Sauvegarde non confirmée'));
    assert.ok(!result.text.includes('Synchronisé'));
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    // Check restoration from the durable operation into the UI's export, not only storage.
    const exported=await page.evaluate(()=>{
        let captured;const original=URL.createObjectURL; URL.createObjectURL=b=>{captured=b;return 'blob:fiction';};
        const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=()=>{};
        [...document.querySelectorAll('button')].find(b=>b.textContent==='Exporter la copie locale').click();
        URL.createObjectURL=original;HTMLAnchorElement.prototype.click=click;
        return captured.text();
    });
    assert.equal(JSON.parse(exported).materials[0].name,'Matière locale à préserver');
    assert.equal(await page.evaluate(async()=>{
        const duplicate = new window.CatalogPersistence(window.ikadevisSupabase, localStorage, '33333333-3333-4333-8333-333333333333');
        await duplicate.ready;
        return duplicate.writerId !== 'fictional-tab';
    }), true, 'Identité copiée : le verrou attribue une file distincte');
    console.log('Connecté simulé : chargement RPC, conflit visible, aucun faux succès, outbox conservée, copie locale restaurée dans l’interface et exportable ; identité d’onglet occupée non réutilisée. Zéro erreur JS, zéro requête externe.');
} catch(error) { console.error(JSON.stringify({errors,diagnostic:await page.evaluate(()=>({text:document.body.innerText.slice(0,2000),calls:window.testCalls?.map(c=>c.name)}))})); throw error; } finally{await browser.close();await server.close();}
