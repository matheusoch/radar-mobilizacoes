import {useEffect,useState} from 'react';
import {AlertTriangle,RefreshCw} from 'lucide-react';

export default function EditorialAuditPanel({db,onOpenEvent}:{db:any;onOpenEvent:(id:string)=>void}){
  const[open,setOpen]=useState(false);
  const[loading,setLoading]=useState(false);
  const[rows,setRows]=useState<any[]>([]);
  const[error,setError]=useState('');
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
        if(!e.city||!e.state)flags.push('Cidade/UF incompleta');
        if(!e.venue)flags.push('Local ausente');
        if(!e.event_sources?.length)flags.push('Sem fonte vinculada');
        if(!e.image_url)flags.push('Sem pôster');
        else if(!e.poster_sha256)flags.push('Pôster sem SHA-256');
        if(e.poster_sha256){
          const p=byHash.get(e.poster_sha256) as any;
          if(!p)flags.push('Hash ausente do índice');
          else if(!(p.matched_event_ids||[]).includes(e.id))flags.push('Vínculo divergente no índice');
          if(p&&Number(p.duplicate_count)>1)flags.push('Imagem repetida');
        }
        return {event:e,flags};
      }).filter((x:any)=>x.flags.length));
    }catch(e){setError(e instanceof Error?e.message:'Falha ao conferir registros.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{if(open&&!rows.length&&!loading)void load();},[open]);
  return <section className="admin-section">
    <div className="section-head compact"><div><div className="eyebrow">CONFERÊNCIA EDITORIAL</div><h2>Divergências e pendências internas</h2><p className="page-lead">Detalhes restritos ao administrativo. Nenhuma alteração é feita automaticamente.</p></div><button className="button ghost" onClick={()=>setOpen(v=>!v)}>{open?'Recolher':'Abrir conferência'}</button></div>
    {open&&<div>{error&&<div className="callout warning"><AlertTriangle size={17}/><span>{error}</span></div>}<div className="admin-filter-row"><strong>{rows.length} registros para conferir</strong><button className="button ghost" disabled={loading} onClick={()=>void load()}><RefreshCw size={15}/>{loading?'Conferindo…':'Atualizar'}</button></div>{rows.slice(0,100).map(({event,flags}:any)=><article className="chat-review" key={event.id}><div><div className="review-meta"><strong>{event.title||'Evento sem título'}</strong><span>{event.date||'Sem data'} · {[event.city,event.state].filter(Boolean).join('/')}</span></div><p>{flags.join(' · ')}</p><small>{event.status||'Sem status'} · {event.is_public?'Público':'Não público'} · {event.image_url?'Com imagem':'Sem imagem'}{event.poster_sha256?' · SHA-256 '+event.poster_sha256.slice(0,12)+'…':''}</small></div><div className="review-actions"><button className="button ghost" onClick={()=>onOpenEvent(event.id)}>Abrir no editor</button></div></article>)}{!loading&&!rows.length&&!error&&<p>Nenhuma pendência encontrada.</p>}<p className="analytics-note">Os alertas são sinais para revisão, não prova de erro. Confira fontes e contexto antes de salvar alterações.</p></div>}
  </section>;
}