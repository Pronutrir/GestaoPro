const fs=require('fs');
const all=JSON.parse(fs.readFileSync('_all_flat.json','utf8'));
const n=x=>x==null?0:Number(x)||0;

// ── reimplementacao FIEL de hoursStatsByActivity (ActivityKanban.tsx:1728) ──
const childrenMap=new Map();
all.forEach(a=>{ if(a.parent_id){ const arr=childrenMap.get(a.parent_id)||[]; arr.push(a); childrenMap.set(a.parent_id,arr);} });
const map=new Map();
const walk=(a,seen=new Set())=>{
  if(map.has(a.id)) return map.get(a.id);
  if(seen.has(a.id)) return {planned:0,consumed:0,hasSubs:false};
  const nextSeen=new Set(seen); nextSeen.add(a.id);
  const kids=childrenMap.get(a.id)||[];
  if(kids.length>0){
    let planned=0,consumed=0;
    kids.forEach(c=>{const s=walk(c,nextSeen); planned+=s.planned; consumed+=s.consumed;});
    const st={planned,consumed,hasSubs:true}; map.set(a.id,st); return st;
  }
  const own=n(a.hours);
  const st={planned:own,consumed:a.status==='completed'?own:0,hasSubs:false};
  map.set(a.id,st); return st;
};
all.forEach(a=>walk(a));

// ── comparacao ──
const pais=all.filter(a=>(childrenMap.get(a.id)||[]).length>0);
const rows=[];
let iguais=0, difer=0, semDerivado=0;
for(const p of pais){
  const tela=map.get(p.id).planned;
  const srv=p.derived_hours==null?null:Number(p.derived_hours);
  if(srv===null){ semDerivado++; continue; }
  if(Math.abs(tela-srv)<0.01){ iguais++; continue; }
  difer++;
  const kids=childrenMap.get(p.id)||[];
  const marcos=kids.filter(k=>k.is_milestone);
  const horasMarco=marcos.reduce((s,k)=>s+n(k.hours),0);
  rows.push({t:p.title,tela,srv,dif:+(tela-srv).toFixed(2),filhas:kids.length,marcos:marcos.length,hMarco:horasMarco,dc:p.derived_children});
}
rows.sort((a,b)=>Math.abs(b.dif)-Math.abs(a.dif));
console.log('');
console.log('PAIS (nos com filhas):', pais.length);
console.log('  numero IGUAL nos dois:', iguais);
console.log('  numero DIFERENTE:', difer);
console.log('  sem derived_hours (trigger nunca rodou):', semDerivado);
console.log('');
console.log('## Os que divergem — as 15 maiores diferencas');
console.log('');
console.log('| pai | tela hoje | servidor | dif | filhas | marcos | h/marco |');
console.log('|---|---|---|---|---|---|---|');
rows.slice(0,15).forEach(r=>console.log(`| ${r.t.slice(0,34)} | ${r.tela} | ${r.srv} | ${r.dif>0?'+':''}${r.dif} | ${r.filhas} | ${r.marcos} | ${r.hMarco} |`));
console.log('');
const expl=rows.filter(r=>Math.abs(r.dif-r.hMarco)<0.01).length;
console.log('Diferenca explicada EXATAMENTE pelas horas de marco:', expl, 'de', difer);
fs.writeFileSync('_rows.json',JSON.stringify(rows));
