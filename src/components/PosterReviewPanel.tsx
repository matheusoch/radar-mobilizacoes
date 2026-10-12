import {useCallback,useMemo,useState} from 'react';
import {Check,CheckCircle2,Info,RefreshCw,Search,X} from 'lucide-react';
import {
  classifyPosters,duplicateCounts,eventFlags,fmtDate,groupPending,hasImage,isSafe,localToday,mergeIds,
  posterMatchesQuery,searchEvents,
  type Ev,type Flag,type Poster,type Sug
} from '../lib/posterReview';

type Tab='review'|'registered'|'orphans'|'decided';
type Note={kind:'ok'|'warn'|'error';text:string}|null;

const FLAG_LABEL:Record<Flag,string>={
  'has-other-poster':'Já tem outro pôster',
  'already-linked':'Já vinculado a esta imagem',
  'past':'Evento passado',
  'duplicate':'Possível duplicata',
  'not-public':'Não público',
  'missing-event':'Evento não existe no banco'
};
const FLAG_CLASS:Record<Flag,string>={
  'has-other-poster':'badge-warn','already-linked':'badge-good','past':'badge-muted',
  'duplicate':'badge-warn','not-public':'badge-muted','missing-event':'badge-warn'
};
const PAGE=10;

function evLine(e:Ev){return [fmtDate(e.date),e.time_label,[e.city,e.state].filter(Boolean).join('/')].filter(Boolean).join(' · ');}

export function PosterReviewPanel({db,userId,onChanged}:{db:any;userId?:string|null;onChanged?:()=>Promise<unknown>|void}){
  const[open,setOpen]=useState(false);
  const[loading,setLoading]=useState(false);
  const[loaded,setLoaded]=useState(false);
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState('');
  const[note,setNote]=useState<Note>(null);
  const[tab,setTab]=useState<Tab>('review');
  const[query,setQuery]=useState('');
  const[limit,setLimit]=useState(PAGE);
  const[sel,setSel]=useState<Set<string>>(new Set());
  const[sugs,setSugs]=useState<Sug[]>([]);
  const[posters,setPosters]=useState<Poster[]>([]);
  const[events,setEvents]=useState<Ev[]>([]);

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const[s,p,e]=await Promise.all([
        db.from('poster_match_suggestions').select('id,event_id,sha256,group_size,evidence,status,review_note').order('created_at',{ascending:true}).limit(5000),
        db.from('poster_index').select('sha256,image_url,width,height,source_filenames,matched_event_ids,duplicate_count').order('sha256').limit(5000),
        db.from('events').select('id,title,date,city,state,venue,time_label,image_url,poster_sha256,status,is_public').order('date',{ascending:true}).limit(5000)
      ]);
      const failure=s.error||p.error||e.error;
      if(failure)throw failure;
      setSugs((s.data||[]) as Sug[]);setPosters((p.data||[]) as Poster[]);setEvents((e.data||[]) as Ev[]);
      setSel(new Set());setLoaded(true);
    }catch(err){
      setError(err instanceof Error?err.message:(err as any)?.message||'Não foi possível carregar os dados de pôsteres.');
    }finally{setLoading(false);}
  },[db]);

  const toggleOpen=()=>{const next=!open;setOpen(next);if(next&&!loaded&&!loading)void load();};

  const evById=useMemo(()=>new Map(events.map(e=>[e.id,e])),[events]);
  const posById=useMemo(()=>new Map(posters.map(p=>[p.sha256,p])),[posters]);
  const today=useMemo(()=>localToday(),[]);
  const dups=useMemo(()=>duplicateCounts(events),[events]);
  const groups=useMemo(()=>groupPending(sugs),[sugs]);
  const{registered,orphans}=useMemo(()=>classifyPosters(posters,sugs),[posters,sugs]);
  const decided=useMemo(()=>sugs.filter(s=>s.status==='confirmed'||s.status==='rejected'),[sugs]);
  const withPoster=useMemo(()=>events.filter(e=>hasImage(e)).length,[events]);
  const pendingPairs=useMemo(()=>groups.reduce((n,g)=>n+g.rows.length,0),[groups]);

  const linkedEvents=(p:Poster)=>(p.matched_event_ids||[]).map(id=>evById.get(id)).filter((e):e is Ev=>Boolean(e));
  const flagsFor=(s:Sug)=>eventFlags(evById.get(s.event_id),s.sha256,{today,dups});

  const toggle=(id:string)=>setSel(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n;});
  const setMany=(ids:string[],on:boolean)=>setSel(prev=>{const n=new Set(prev);ids.forEach(id=>on?n.add(id):n.delete(id));return n;});

  const markStatus=async(rows:Sug[],status:'rejected'|'pending')=>{
    if(!rows.length)return;
    setBusy(true);setNote(null);
    try{
      const patch=status==='pending'
        ?{status,reviewed_at:null,reviewed_by:null}
        :{status,reviewed_at:new Date().toISOString(),reviewed_by:userId||null};
      const{error:err}=await db.from('poster_match_suggestions').update(patch).in('id',rows.map(r=>r.id));
      if(err)throw err;
      await load();
      setNote({kind:'ok',text:status==='rejected'?`${rows.length} vínculo(s) rejeitado(s). Nada foi alterado nos eventos.`:`${rows.length} vínculo(s) reabertos para revisão.`});
    }catch(err){setNote({kind:'error',text:'Falha ao atualizar: '+((err as any)?.message||'erro desconhecido')});}
    finally{setBusy(false);}
  };

  const confirmRows=async(rows:Sug[],replace=false)=>{
    if(!rows.length)return;
    setBusy(true);setNote(null);
    try{
      let applied=0,already=0,skipped=0,missing=0;
      const okIds:string[]=[];const bySha=new Map<string,string[]>();
      const remember=(row:Sug)=>{okIds.push(row.id);bySha.set(row.sha256,[...(bySha.get(row.sha256)||[]),row.event_id]);};
      for(const r of rows){
        const ev=evById.get(r.event_id),p=posById.get(r.sha256);
        if(!ev||!p||!p.image_url){missing++;continue;}
        if(hasImage(ev)&&ev.poster_sha256===r.sha256){already++;remember(r);continue;}
        if(hasImage(ev)&&!replace){skipped++;continue;}
        let q=db.from('events').update({image_url:p.image_url,poster_sha256:r.sha256}).eq('id',ev.id);
        // salvaguarda: sem substituição explícita, só grava onde ainda não há pôster
        if(!replace)q=q.or('image_url.is.null,image_url.eq.');
        const{data,error:err}=await q.select('id');
        if(err)throw err;
        if(!data||!data.length){skipped++;continue;}
        applied++;remember(r);
      }
      if(okIds.length){
        const{error:err}=await db.from('poster_match_suggestions')
          .update({status:'confirmed',reviewed_at:new Date().toISOString(),reviewed_by:userId||null}).in('id',okIds);
        if(err)throw err;
        for(const[sha,ids]of bySha){
          const{data:cur,error:readErr}=await db.from('poster_index').select('matched_event_ids').eq('sha256',sha).maybeSingle();
          if(readErr)throw readErr;
          const{error:upErr}=await db.from('poster_index').update({matched_event_ids:mergeIds(cur?.matched_event_ids,ids)}).eq('sha256',sha);
          if(upErr)throw upErr;
        }
      }
      await load();
      if(onChanged)await onChanged();
      const parts=[`${applied} pôster(es) gravado(s)`];
      if(already)parts.push(`${already} já estavam vinculados`);
      if(skipped)parts.push(`${skipped} ignorado(s) porque o evento já tem pôster`);
      if(missing)parts.push(`${missing} ignorado(s) por evento ou imagem inexistente`);
      setNote({kind:skipped||missing?'warn':'ok',text:parts.join(' · ')+'.'});
    }catch(err){setNote({kind:'error',text:'Falha ao gravar: '+((err as any)?.message||'erro desconhecido')+'. Recarregue para ver o que foi gravado.'});}
    finally{setBusy(false);}
  };

  const linkManual=async(sha:string,ev:Ev)=>{
    const replace=hasImage(ev);
    if(replace&&!window.confirm(`"${ev.title}" já tem um pôster. Substituir por esta imagem?`))return;
    setBusy(true);setNote(null);
    try{
      const{error:insErr}=await db.from('poster_match_suggestions').upsert(
        [{event_id:ev.id,sha256:sha,group_size:1,evidence:'Associação manual feita no Admin.',source:'manual',status:'pending'}],
        {onConflict:'event_id,sha256',ignoreDuplicates:true});
      if(insErr)throw insErr;
      const{data,error:selErr}=await db.from('poster_match_suggestions')
        .select('id,event_id,sha256,group_size,evidence,status,review_note').eq('event_id',ev.id).eq('sha256',sha).limit(1);
      if(selErr)throw selErr;
      setBusy(false);
      await confirmRows((data||[]) as Sug[],replace);
    }catch(err){setNote({kind:'error',text:'Falha ao vincular: '+((err as any)?.message||'erro desconhecido')});setBusy(false);}
  };

  const confirmWithReplace=(rows:Sug[])=>{
    const withOther=rows.filter(r=>flagsFor(r).includes('has-other-poster'));
    if(withOther.length){
      const replace=window.confirm(`${withOther.length} evento(s) selecionado(s) já têm outro pôster.\n\nOK = substituir o pôster atual por esta imagem.\nCancelar = manter os pôsteres atuais e gravar apenas os demais.`);
      void confirmRows(rows,replace);
    }else void confirmRows(rows,false);
  };

  const shown=useMemo(()=>{
    const q=query;
    if(tab==='review')return groups.filter(g=>{
      const p=posById.get(g.sha256);
      return p?posterMatchesQuery(p,g.rows.map(r=>evById.get(r.event_id)).filter((e):e is Ev=>Boolean(e)),q):!q;
    });
    return [];
  },[tab,groups,posById,evById,query]);
  const shownRegistered=useMemo(()=>registered.filter(p=>posterMatchesQuery(p,linkedEvents(p),query)),[registered,query,evById]);
  const shownOrphans=useMemo(()=>orphans.filter(p=>posterMatchesQuery(p,[],query)),[orphans,query]);
  const shownDecided=useMemo(()=>decided.filter(s=>{
    const ev=evById.get(s.event_id);const p=posById.get(s.sha256);
    return posterMatchesQuery(p||{sha256:s.sha256,image_url:null,width:null,height:null,source_filenames:[],matched_event_ids:[],duplicate_count:null},ev?[ev]:[],query);
  }),[decided,query,evById,posById]);

  const tabBtn=(id:Tab,label:string,count:number)=>(
    <button key={id} type="button" className={'pr-tab'+(tab===id?' active':'')} onClick={()=>{setTab(id);setLimit(PAGE);}}>
      {label}<span className="pr-count">{count}</span>
    </button>
  );

  const evCard=(e:Ev|undefined,fallbackId:string)=>e?(
    <div className="pr-ev-main">
      <strong>{e.title}</strong>
      <span>{evLine(e)}</span>
      {e.venue&&<span className="pr-ev-venue">{e.venue}</span>}
    </div>
  ):(<div className="pr-ev-main"><strong>Evento não encontrado</strong><span>{fallbackId}</span></div>);

  return <section className="admin-section pr-panel">
    <div className="section-head compact">
      <div>
        <div className="eyebrow">PÔSTERES</div>
        <h2>Revisão de pôsteres</h2>
        <p className="page-lead">Compare o que já está registrado com o que ainda precisa ser analisado e confirme, rejeite ou vincule imagens a eventos.</p>
      </div>
      <div className="admin-actions">
        {open&&<button type="button" className="button ghost" disabled={loading||busy} onClick={()=>void load()}><RefreshCw size={16}/>Atualizar</button>}
        <button type="button" className="button primary" onClick={toggleOpen}>{open?'Fechar':'Abrir revisão'}</button>
      </div>
    </div>

    {open&&<>
      {error&&<div className="callout warning" role="alert"><Info size={18}/><div><strong>Erro ao carregar.</strong> {error} <button type="button" className="mode-switch" onClick={()=>void load()}>Tentar de novo</button></div></div>}
      {loading&&!loaded&&<div className="empty">Carregando pôsteres, vínculos e eventos…</div>}
      {loaded&&<>
        <div className="pr-stats">
          <div><strong>{withPoster}</strong><span>de {events.length} eventos já têm pôster</span></div>
          <div><strong>{registered.length}</strong><span>imagens já vinculadas</span></div>
          <div><strong>{pendingPairs}</strong><span>vínculos a revisar em {groups.length} imagens</span></div>
          <div><strong>{orphans.length}</strong><span>imagens sem evento</span></div>
          <div><strong>{posters.length}</strong><span>imagens no catálogo</span></div>
        </div>

        <div className="pr-toolbar">
          <div className="pr-tabs" role="tablist">
            {tabBtn('review','A revisar',groups.length)}
            {tabBtn('registered','Já registradas',registered.length)}
            {tabBtn('orphans','Sem evento',orphans.length)}
            {tabBtn('decided','Decididas',decided.length)}
          </div>
          <label className="pr-search"><Search size={16}/><input value={query} onChange={ev=>{setQuery(ev.target.value);setLimit(PAGE);}} placeholder="Buscar por evento, cidade, data ou arquivo"/>{query&&<button type="button" aria-label="Limpar busca" onClick={()=>setQuery('')}>×</button>}</label>
        </div>

        {note&&<div className={'callout '+(note.kind==='ok'?'info':'warning')} role="status"><CheckCircle2 size={18}/><div>{note.text}</div></div>}

        {tab==='review'&&<div className="pr-list">
          {shown.length===0&&<div className="empty">{groups.length===0?'Nenhum vínculo pendente de revisão.':'Nada encontrado para esta busca.'}</div>}
          {shown.slice(0,limit).map(g=>{
            const p=posById.get(g.sha256);
            const rows=g.rows;
            const valid=rows.filter(r=>r.status==='pending');
            const safeIds=valid.filter(r=>isSafe(flagsFor(r))).map(r=>r.id);
            const picked=valid.filter(r=>sel.has(r.id));
            return <article className="pr-group" key={g.sha256}>
              <div className="pr-poster">
                {p?.image_url?<a href={p.image_url} target="_blank" rel="noreferrer"><img src={p.image_url} alt="Pôster candidato" loading="lazy"/></a>:<div className="pr-noimg">Imagem indisponível</div>}
                <small>{(p?.source_filenames||[]).slice(0,2).join(', ')||g.sha256.slice(0,12)}{p?.width&&p?.height?` · ${p.width}×${p.height}`:''}</small>
              </div>
              <div className="pr-body">
                <div className="pr-group-head">
                  <div><strong>{rows.length} evento{rows.length===1?'':'s'} candidato{rows.length===1?'':'s'}</strong><small>{rows[0]?.evidence||''}</small></div>
                  <div className="review-actions">
                    <button type="button" className="button ghost" onClick={()=>setMany(valid.map(r=>r.id),true)}>Marcar todos</button>
                    <button type="button" className="button ghost" disabled={!safeIds.length} onClick={()=>setMany(safeIds,true)}>Marcar sem alertas ({safeIds.length})</button>
                    <button type="button" className="button ghost" onClick={()=>setMany(valid.map(r=>r.id),false)}>Limpar</button>
                  </div>
                </div>
                <div className="pr-rows">
                  {rows.map(r=>{
                    const e=evById.get(r.event_id);const f=flagsFor(r);const invalid=r.status==='invalid_event';
                    return <div className={'pr-row'+(sel.has(r.id)?' selected':'')} key={r.id}>
                      <input type="checkbox" disabled={invalid||busy} checked={sel.has(r.id)} onChange={()=>toggle(r.id)} aria-label={'Selecionar '+(e?.title||r.event_id)}/>
                      {evCard(e,r.event_id)}
                      {e&&hasImage(e)&&e.poster_sha256!==r.sha256&&<a className="pr-current" href={e.image_url||'#'} target="_blank" rel="noreferrer" title="Pôster atual do evento"><img src={e.image_url||''} alt="Pôster atual" loading="lazy"/></a>}
                      <div className="pr-flags">{f.map(x=><span key={x} className={'badge '+FLAG_CLASS[x]}>{FLAG_LABEL[x]}</span>)}{invalid&&r.review_note&&<small>{r.review_note}</small>}</div>
                      <div className="pr-row-actions">
                        <button type="button" className="button ghost" disabled={invalid||busy} onClick={()=>confirmWithReplace([r])}><Check size={14}/>Confirmar</button>
                        <button type="button" className="button ghost danger" disabled={busy} onClick={()=>void markStatus([r],'rejected')}><X size={14}/>Rejeitar</button>
                      </div>
                    </div>;
                  })}
                </div>
                <div className="pr-footer">
                  <span>{picked.length} selecionado{picked.length===1?'':'s'}</span>
                  <button type="button" className="button primary" disabled={busy||!picked.length} onClick={()=>confirmWithReplace(picked)}><Check size={16}/>Confirmar selecionados</button>
                  <button type="button" className="button ghost danger" disabled={busy||!picked.length} onClick={()=>void markStatus(picked,'rejected')}><X size={16}/>Rejeitar selecionados</button>
                </div>
              </div>
            </article>;
          })}
          {shown.length>limit&&<button type="button" className="button ghost" onClick={()=>setLimit(n=>n+PAGE)}>Mostrar mais ({shown.length-limit} imagens)</button>}
        </div>}

        {tab==='registered'&&<div className="pr-grid">
          {shownRegistered.length===0&&<div className="empty">Nenhuma imagem vinculada encontrada.</div>}
          {shownRegistered.slice(0,limit*3).map(p=>{
            const linked=linkedEvents(p);
            return <article className="pr-card" key={p.sha256}>
              {p.image_url&&<a href={p.image_url} target="_blank" rel="noreferrer"><img src={p.image_url} alt="Pôster registrado" loading="lazy"/></a>}
              <div className="pr-card-body">
                <small>{(p.source_filenames||[]).slice(0,1).join('')||p.sha256.slice(0,12)}</small>
                {linked.map(e=><div key={e.id} className="pr-linked"><strong>{e.title}</strong><span>{evLine(e)}</span></div>)}
                {(p.matched_event_ids||[]).length>linked.length&&<small>{(p.matched_event_ids||[]).length-linked.length} evento(s) não encontrado(s) no banco</small>}
              </div>
            </article>;
          })}
          {shownRegistered.length>limit*3&&<button type="button" className="button ghost" onClick={()=>setLimit(n=>n+PAGE)}>Mostrar mais</button>}
        </div>}

        {tab==='orphans'&&<div className="pr-grid">
          {shownOrphans.length===0&&<div className="empty">Nenhuma imagem sem evento.</div>}
          {shownOrphans.slice(0,limit*3).map(p=><OrphanCard key={p.sha256} poster={p} events={events} busy={busy} onLink={linkManual}/>)}
          {shownOrphans.length>limit*3&&<button type="button" className="button ghost" onClick={()=>setLimit(n=>n+PAGE)}>Mostrar mais</button>}
        </div>}

        {tab==='decided'&&<div className="pr-list">
          {shownDecided.length===0&&<div className="empty">Nenhuma decisão registrada ainda.</div>}
          {shownDecided.slice(0,limit*3).map(s=>{
            const e=evById.get(s.event_id);const p=posById.get(s.sha256);
            return <div className="pr-row decided" key={s.id}>
              {p?.image_url&&<a className="pr-current" href={p.image_url} target="_blank" rel="noreferrer"><img src={p.image_url} alt="Pôster" loading="lazy"/></a>}
              {evCard(e,s.event_id)}
              <div className="pr-flags"><span className={'badge '+(s.status==='confirmed'?'badge-good':'badge-muted')}>{s.status==='confirmed'?'Confirmado':'Rejeitado'}</span></div>
              <div className="pr-row-actions">{s.status==='rejected'&&<button type="button" className="button ghost" disabled={busy} onClick={()=>void markStatus([s],'pending')}>Reabrir</button>}</div>
            </div>;
          })}
          {shownDecided.length>limit*3&&<button type="button" className="button ghost" onClick={()=>setLimit(n=>n+PAGE)}>Mostrar mais</button>}
        </div>}
      </>}
    </>}
  </section>;
}

function OrphanCard({poster,events,busy,onLink}:{poster:Poster;events:Ev[];busy:boolean;onLink:(sha:string,ev:Ev)=>Promise<void>}){
  const[q,setQ]=useState('');
  const results=useMemo(()=>searchEvents(events,q,poster.sha256),[events,q,poster.sha256]);
  return <article className="pr-card">
    {poster.image_url&&<a href={poster.image_url} target="_blank" rel="noreferrer"><img src={poster.image_url} alt="Pôster sem evento" loading="lazy"/></a>}
    <div className="pr-card-body">
      <small>{(poster.source_filenames||[]).slice(0,1).join('')||poster.sha256.slice(0,12)}{poster.width&&poster.height?` · ${poster.width}×${poster.height}`:''}</small>
      <label className="pr-search small"><Search size={14}/><input value={q} onChange={ev=>setQ(ev.target.value)} placeholder="Buscar evento para vincular"/></label>
      {q.trim().length>=2&&results.length===0&&<small>Nenhum evento encontrado.</small>}
      {results.map(e=><div key={e.id} className="pr-linked">
        <div><strong>{e.title}</strong><span>{evLine(e)}</span>{hasImage(e)&&<span className="badge badge-warn">Já tem pôster</span>}</div>
        <button type="button" className="button ghost" disabled={busy} onClick={()=>void onLink(poster.sha256,e)}>{hasImage(e)?'Substituir…':'Vincular'}</button>
      </div>)}
    </div>
  </article>;
}

export default PosterReviewPanel;
