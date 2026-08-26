// Versao corrigida: a NOVA formula pontua cada filha COM as subatividades dela,
// como faz computeActivityProgress(.., subActivities) de verdade.
const fs=require('fs');
const env=fs.readFileSync('.env','utf8');
const g=k=>{const m=env.match(new RegExp('^'+k+'=(.*)$','m'));return m?m[1].trim().replace(/^["']|["']$/g,''):null;};
const KEY=g('SUPABASE_SERVICE_ROLE_KEY'), URL=g('NEXT_PUBLIC_SUPABASE_URL');
const q=async p=>{const r=await fetch(URL+'/rest/v1/'+p,{headers:{apikey:KEY,Authorization:'Bearer '+KEY}});return r.json();};
(async()=>{
  const at=[]; for(let o=0;o<20000;o+=1000){const l=await q(`activities?select=id,parent_id,project_id,title,status,workflow_stage_id,is_milestone&is_trashed=eq.false&order=id&limit=1000&offset=${o}`); at.push(...l); if(l.length<1000)break;}
  const st=await q('workflow_stages?select=id,categoria,is_final,is_blocked,display_order,project_id,contributes_to_progress,is_exception&limit=2000');
  const byP={}; st.forEach(s=>{(byP[s.project_id]=byP[s.project_id]||[]).push(s);});
  const sById=new Map(st.map(s=>[s.id,s]));
  const kids=new Map(); at.forEach(a=>{if(a.parent_id){const r=kids.get(a.parent_id)||[];r.push(a);kids.set(a.parent_id,r);}});
  const fluxo=p=>(byP[p]||[]).filter(s=>s.categoria==='andamento').sort((x,y)=>x.display_order-y.display_order);
  const auto=(c,f)=>{ if(!c)return 0; if(c.categoria==='concluida'||c.is_final)return 100;
    if(c.categoria==='backlog'||c.is_blocked||c.is_exception||c.contributes_to_progress===false)return 0;
    const j=f.findIndex(x=>x.id===c.id)+1; return j<=0?0:(j/(f.length+1))*100; };
  const feita=a=>{const c=sById.get(a.workflow_stage_id);return (a.status||'').toLowerCase()==='completed'||!!(c&&(c.categoria==='concluida'||c.is_final));};
  // subAvanco REAL: se a filha tem filhos, ela vale a media deles (um nivel).
  const subAvanco=(a,f)=>{
    if((a.status||'').toLowerCase()==='completed')return 100;
    if(a.is_milestone)return feita(a)?100:0;
    const ks=kids.get(a.id)||[];
    if(ks.length>0){ const v=ks.map(k=>(k.status||'').toLowerCase()==='completed'?100:auto(sById.get(k.workflow_stage_id),f));
      if(v.length) return v.reduce((x,y)=>x+y,0)/v.length; }
    return auto(sById.get(a.workflow_stage_id),f);
  };
  // ANTIGA
  const memo=new Map();
  const walk=(id,seen=new Set())=>{ if(memo.has(id))return memo.get(id); if(seen.has(id))return{sum:0,count:0};
    const ns=new Set(seen); ns.add(id); let sum=0,count=0;
    (kids.get(id)||[]).forEach(c=>{ const f=fluxo(c.project_id);
      sum+=((c.status||'').toLowerCase()==='completed'?100:auto(sById.get(c.workflow_stage_id),f)); count++;
      const d=walk(c.id,ns); sum+=d.sum; count+=d.count; });
    const r={sum,count}; memo.set(id,r); return r; };
  at.forEach(a=>memo.set(a.id,walk(a.id)));
  let ig=0; const mud=[];
  for(const [pid,fl] of kids){ const p=at.find(a=>a.id===pid); if(!p)continue;
    const d=memo.get(pid); const antiga=d.count>0?Math.round(d.sum/d.count):0;
    const f=fluxo(p.project_id);
    const nova=Math.round(fl.map(c=>subAvanco(c,f)).reduce((a,b)=>a+b,0)/fl.length);
    if(antiga===nova)ig++; else mud.push({t:p.title,antiga,nova,d:nova-antiga,n:fl.length,netos:d.count-fl.length});
  }
  mud.sort((a,b)=>Math.abs(b.d)-Math.abs(a.d));
  const sobem=mud.filter(m=>m.d>0).length;
  console.log('\nCRONOGRAMA — antiga (arvore achatada) x nova (filhas diretas, cada uma com as subs dela)');
  console.log('  iguais:',ig,'  MUDAM:',mud.length,'  SOBEM:',sobem,'  CAEM:',mud.length-sobem);
  console.log('  todos com netos?', mud.every(m=>m.netos>0));
  console.log('\n| pai | antes | depois | delta | filhas | netos |');
  console.log('|---|---|---|---|---|---|');
  mud.slice(0,12).forEach(m=>console.log(`| ${m.t.slice(0,30)} | ${m.antiga}% | ${m.nova}% | ${m.d>0?'+':''}${m.d}pp | ${m.n} | ${m.netos} |`));
})();
