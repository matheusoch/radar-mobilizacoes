import {useEffect,useMemo,useState} from 'react';
import {AlertTriangle,RefreshCw,Search} from 'lucide-react';

type AuditRow={event:any;flags:string[]};
const PAGE=25;
const ISSUE_OPTIONS=[
  {value:'all',label:'Todos os tipos de pendência'},
  {value:'Status de alerta',label:'Status de alerta'},
  {value:'Data ausente',label:'Data ausente'},
  {value:'Cidade/UF incompleta',label:'Cidade/UF incompleta'},
  {value:'Local ausente',label:'Local ausente'},
  {value:'Sem fonte vinculada',label:'Sem fonte vinculada'},
  {value:'Sem pôster',label:'Sem pôster'},
  {value:'Pôster sem SHA-256',label:'Pôster sem SHA-256'},
  {value:'Hash ausente do índice',label:'Hash ausente do índice'},
  {value:'Vínculo divergente no índice',label:'Vínculo divergente no índice'},
  {value:'Imagem repetida',label:'Imagem repetida'}
];

export default function EditorialAuditPanel({db,onOpenEvent}:{db:any;onOpenEvent:(id:string)=>void}){
  const[open,setOpen]=useState(false);
  const[loading,setLoading]=useState(false);
  const[rows,setRows]=useState<AuditRow[]>([]);
  const[error,setError]=useState('');
  const[query,setQuery]=useState('');
  const[type,setType]=useState('all');
  const[limit,setLimit]=useState(PAGE);

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const[{data:events,error:eventError},{data:posters,error:posterError}]=await Promise.all([
        db.from('events').select('id,title,date,city,state,venue,status,is_public,image_url,poster_sha256,event_sources(source_id)').order('date').limit(5000),
        db.from('poster_index').select('sha256,matched_event_ids,duplicate_count').limit(5000)
      ]);
      if(eventError)throw eventError;if(posterError)throw posterError;
      const byHash=new Map((posters||[]).map((p:any)=>[p.sha256,p]));
      setRows((events||[]).map((e:any)=>{
        const flags:string[]=[];
        if(e.status==='warning')flags.push('Status de alerta');
        if(!e.date)flags.push('Data ausente');
        if(!e.city?.trim()||!e.state?.trim())flags.push('Cidade/UF incompleta');
        if(!e.venue?.trim()||/^local (não informado|a confirmar)$/i.test(e.venue.trim()))flags.push('Local ausente');
        if(!e.event_sources?.length)flags.push('Sem fonte vinculada');
        if(!e.image_url?.trim())flags.push('Sem pôster');
        else if(!e.poster_sha256)flags.push('Pôster sem SHA-256');
        if(e.poster_sha256){
          const p=byHash.get(e.poster_sha256) as any;
          if(!p)flags.push('Hash ausente do índice');
          else if(!(p.matched_event_ids||[]).includes(e.id))flags.push('Vínculo divergente no índice');
          if(p&&Number(p.duplicate_count)>1)flags.push('Imagem repetida');
        }
        return {event:e,flags};
      }).filter((item:AuditRow)=>item.flags.length));
    }catch(e){setError(e instanceof Error?e.message:'Falha ao conferir registros.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{if(open&&!rows.length&&!loading)void load();},[open]);

  const filtered=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase('pt-BR');
    return rows.filter(({event,flags})=>{
      if(type!=='all'&&!flags.includes(type))return false;
      if(!q)return true;
      return [event.title,event.date,event.city,event.state,event.venue,event.status,...flags]
        .some(value=>String(value||'').toLocaleLowerCase('pt-BR').includes(q));
    });
  },[rows,type,query]);
  useEffect(()=>setLimit(PAGE),[type,query]);
  const shown=filtered.slice(0,limit);

  return <section className="admin-section">
    <div className="section-head compact">
      <div><div className="eyebrow">CONFERÊNCIA EDITORIAL</div><h2>Divergências e pendências internas</h2><p className="page-lead">Filtre por tipo, revise até 25 registros por vez e abra o editor quando precisar corrigir algo. Nenhuma alteração é feita automaticamente.</p></div>
      <button type="button" className="button ghost" onClick={()=>{const next=!open;setOpen(next);if(next&&!rows.length&&!loading)void load();}}>{open?'Recolher':'Abrir conferência'}</button>
    </div>
    {open&&<div>
      {error&&<div className="callout warning" role="alert"><AlertTriangle size={17}/><span>{error}</span><button type="button" className="button ghost" onClick={()=>void load()}>Tentar novamente</button></div>}
      <div className="admin-filter-row editorial-audit-filters">
        <label><span>Tipo de conferência</span><select value={type} onChange={event=>setType(event.target.value)}>{ISSUE_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="editorial-audit-search"><span>Buscar registro</span><div><Search size={16}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Título, data, cidade ou local…"/></div></label>
        <button type="button" className="button ghost" disabled={loading} onClick={()=>void load()}><RefreshCw size={15}/>{loading?'Conferindo…':'Atualizar'}</button>
      </div>
      <p className="analytics-note">{filtered.length} registros correspondem ao filtro · mostrando {Math.min(limit,filtered.length)} · {rows.length} no total</p>
      {loading&&rows.length===0?<p>Conferindo eventos e índice de pôsteres…</p>
      :shown.map(({event,flags})=><article className="chat-review" key={event.id}>
        <div><div className="review-meta"><strong>{event.title||'Evento sem título'}</strong><span>{event.date||'Sem data'} · {[event.city,event.state].filter(Boolean).join('/')||'Localidade incompleta'}</span></div>
          <p>{flags.join(' · ')}</p><small>{event.status||'Sem status'} · {event.is_public?'Público':'Não público'} · {event.image_url?'Com imagem':'Sem imagem'}{event.poster_sha256?' · SHA-256 '+event.poster_sha256.slice(0,12)+'…':''}</small>
        </div><div className="review-actions"><button type="button" className="button ghost" onClick={()=>onOpenEvent(event.id)}>Abrir no editor</button></div>
      </article>)}
      {!loading&&!shown.length&&!error&&<p>Nenhuma pendência encontrada com os filtros selecionados.</p>}
      {filtered.length>limit&&<button type="button" className="button ghost" style={{marginTop:12}} onClick={()=>setLimit(value=>Math.min(value+PAGE,filtered.length))}>Mostrar mais {Math.min(PAGE,filtered.length-limit)} registros ({filtered.length-limit} restantes)</button>}
      <p className="analytics-note">Os alertas são sinais para revisão, não prova de erro. Confira fontes e contexto antes de salvar alterações.</p>
    </div>}
  </section>;
}
