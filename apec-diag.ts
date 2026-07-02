const API='https://www.apec.fr/cms/webservices/rechercheOffre';
const PAGE='https://www.apec.fr/candidat/recherche-emploi.html/emploi';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const H={'User-Agent':UA,'Content-Type':'application/json; charset=utf-8','Accept':'application/json, text/plain, */*','Accept-Language':'fr-FR,fr;q=0.9,en;q=0.8','Referer':PAGE,'Origin':'https://www.apec.fr'};
const BODY={motsCles:'Recruteur',lieux:[],fonctions:[],secteursActivite:[],typesTeletravail:[],salaires:[],typesContrat:[],niveauxExperience:[],typeClient:'CADRE',sorts:[{type:'DATE',direction:'DESCENDING'}],pagination:{range:50,startIndex:0},activeFiltre:true};
function hdr(h){for(const k of ['content-type','server','date','x-amzn-errortype','x-amzn-requestid','cf-ray','via','x-cache','www-authenticate','retry-after']){const v=h.get(k); if(v) console.log('    '+k+': '+v);} const sc=h.getSetCookie?h.getSetCookie():[]; if(sc.length) console.log('    set-cookie: '+sc.map(c=>c.split(';')[0]).join('; '));}
async function probe(label,url,init){console.log('\n===== '+label+' ====='); try{const r=await fetch(url,init); console.log('status: '+r.status+' '+r.statusText); hdr(r.headers); const t=await r.text(); console.log('body ('+t.length+' chars):\n'+t.slice(0,2000));}catch(e){console.log('ERREUR fetch: '+e.message);}}
await probe('1) POST direct',API,{method:'POST',headers:H,body:JSON.stringify(BODY)});
let ck=''; try{const p=await fetch(PAGE,{headers:{'User-Agent':UA,'Accept':'text/html'}}); console.log('\n[prime] GET page status='+p.status); const sc=p.headers.getSetCookie?p.headers.getSetCookie():[]; ck=sc.map(c=>c.split(';')[0]).join('; '); console.log('cookies: '+(ck||'(aucun)'));}catch(e){console.log('GET err: '+e.message);}
await probe('2) POST avec cookies de session',API,{method:'POST',headers:Object.assign({},H,ck?{Cookie:ck}:{}),body:JSON.stringify(BODY)});
