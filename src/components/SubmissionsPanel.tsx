import {useEffect,useMemo,useState} from 'react';
import {Flag,Info,RefreshCw,Search} from 'lucide-react';
import {
  STATUS_LABEL,TAB_LABEL,TAB_ORDER,approvedWithoutEvent,countByTab,filterSubmissions,
  type SubRow,type SubStatus,type SubTab
} from '../lib/submissionsHistory';

const BUCKET='submission_posters';
const PAGE=20;
const BADGE:Record<SubStatus,string>={pending:'badge-info',approved:'badge-good',rejected:'badge-muted',spam:'badge-warn'};

function shortDate(date:string|null){return date&&/^\d{4}-\d{2}-\d{2}/.test(date)?`${date.slice(8,10)}/${date.slice(5,7)}/${date.slice(0,4)}`:'data não informada';}

export function SubmissionsPanel({db,submissions,loadError,loading,busyId,onRefresh,onCreateDraft,onReview,onReopen,onOpenEvent}:{
  db:any;submissions:SubRow[];loadError:string;loading:boolean;busyId:string|null;
  onRefresh:()=>Promise<unknown>;
  onCreateDraft:(s:SubRow)=>Promise<unknown>;
  onReview:(s:SubRow,status:'rejected'|'spam')=>Promise<unknown>;
  onReopen:(s:SubRow)=>Promise<unknown>;
  onOpenEvent:(eventId:string)=>void;
}){
  const[tab,setTab]=useState<SubTab>('pending');
  const[query,setQuery]=useState('');
  const[limit,setLimit]=useState(PAGE);
  const[urls,setUrls]=useState<Record<string,string>>({});
  const counts=useMemo(()=>countByTab(submissions),[submissions]);
  const rows=useMemo(()=>filterSubmissions(submissions,tab,query),[submissions,tab,query]);
  const visible=rows.slice(0,limit);

  useEffect(()=>{
    const missing=visible.map(r=>r.poster_path).filter((p):p is string=>Boolean(p)&&!urls[p as string]);
    if(!missing.length)return;
    let alive=true;
    (async()=>{
      const{data,error}=await db.storage.from(BUCKET).createSignedUrls([...new Set(missing)],3600);
      if(!alive||error||!data)return;
      const next:Record<string,string>={};
      for(const item of data as {path:string|null;signedUrl:string|null}[])if(item.path&&item.signedUrl)next[item.path]=item.signedUrl;
      setUrls(prev=>({...prev,...next}));
    })();
    return()=>{alive=false;};
  },[visible.map(r=>r.poster_path).join('|')]);

  const emptyText=submissions.length===0
    ?'Nenhuma solicitação foi enviada ainda.'
    :query?'Nada encontrado para esta busca.':`Nenhuma solicitação ${tab==='all'?'':TAB_LABEL[tab].toLowerCase()} no momento.`;

  return <section className="admin-section">
    <div className="section-head compact">
      <div>
        <div className="eyebrow">CAIXA DE ENTRADA</div>
        <h2>Solicitações de novos eventos</h2>
        <p className="page-lead">Histórico completo dos envios da comunidade. Aprovar cria um rascunho oculto do evento e guarda o vínculo com a solicitação original.</p>
      </div>
      <button type="button" className="button ghost" onClick={()=>void onRefresh()}><RefreshCw size={16}/>Atualizar</button>
    </div>

    {loadError&&<div className="callout warning" role="alert"><Info size={18}/><div><strong>Não foi possível carregar as solicitações.</strong> {loadError}</div></div>}

    <div className="pr-toolbar">
      <div className="pr-tabs" role="tablist">
        {TAB_ORDER.map(t=><button key={t} type="button" role="tab" aria-selected={tab===t} className={'pr-tab'+(tab===t?' active':'')} onClick={()=>{setTab(t);setLimit(PAGE);}}>{TAB_LABEL[t]}<span className="pr-count">{counts[t]}</span></button>)}
      </div>
      <label className="pr-search"><Search size={16}/><input value={query} onChange={(e:{target:{value:string}})=>{setQuery(e.target.value);setLimit(PAGE);}} placeholder="Buscar por título, autor, cidade ou local"/>{query&&<button type="button" aria-label="Limpar busca" onClick={()=>setQuery('')}>×</button>}</label>
    </div>

    {loading&&submissions.length===0&&!loadError&&<div className="empty">Carregando solicitações…</div>}
    {!loading&&!loadError&&rows.length===0&&<div className="empty">{emptyText}</div>}

    <div className="submission-list">
      {visible.map(s=>{
        const status=(s.status in STATUS_LABEL?s.status:'pending') as SubStatus;
        const busy=busyId===s.id;
        const poster=s.poster_path?urls[s.poster_path]:null;
        return <article className="review-card" key={s.id}>
          <div className="review-copy">
            <div className="review-meta"><span>{new Date(s.created_at).toLocaleString('pt-BR')}</span><strong>{s.display_name}</strong></div>
            <h3>{s.title} <span className={'badge '+BADGE[status]}>{STATUS_LABEL[status]}</span></h3>
            <p>{shortDate(s.date)}{s.time_label||s.time?` · ${s.time_label||(s.time||'').slice(0,5)}`:''}{s.city?` · ${s.city}${s.state?`/${s.state}`:''}`:''}</p>
            {s.venue&&<p>📍 {s.venue}</p>}
            {s.message&&<p className="review-message">{s.message}</p>}
            {s.reviewed_at&&status!=='pending'&&<p className="legend">Revisada em {new Date(s.reviewed_at).toLocaleString('pt-BR')}</p>}
            {approvedWithoutEvent(s)&&<p className="legend">Aprovada, mas sem evento vinculado. Confira manualmente em Eventos.</p>}
          </div>
          {s.poster_path&&(poster?<img className="review-poster" src={poster} alt="Pôster enviado" loading="lazy"/>:<div className="pr-noimg">Carregando pôster…</div>)}
          <div className="review-actions">
            {s.related_event_id&&<button type="button" className="button primary" onClick={()=>onOpenEvent(s.related_event_id as string)}>Abrir evento criado</button>}
            {status==='pending'&&!s.related_event_id&&<button type="button" className="button primary" disabled={busy} onClick={()=>void onCreateDraft(s)}>{busy?'Criando…':'Aprovar e criar rascunho'}</button>}
            {status==='pending'&&<button type="button" className="button ghost" disabled={busy} onClick={()=>void onReview(s,'rejected')}>Rejeitar</button>}
            {status==='pending'&&<button type="button" className="button ghost danger" disabled={busy} onClick={()=>void onReview(s,'spam')}><Flag size={15}/>Spam</button>}
            {(status==='rejected'||status==='spam')&&<button type="button" className="button ghost" disabled={busy} onClick={()=>void onReopen(s)}>Reabrir</button>}
          </div>
        </article>;
      })}
    </div>
    {rows.length>limit&&<button type="button" className="button ghost" style={{marginTop:12}} onClick={()=>setLimit(n=>n+PAGE)}>Mostrar mais ({rows.length-limit})</button>}
  </section>;
}

export default SubmissionsPanel;
