import {useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import {Link} from 'react-router-dom';
import {AlertTriangle,Check,Clock3,Flag,Heart,MessageCircle,Shield,Trash2,X} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {
  deleteEventComment,
  getEventDiscussion,
  getEventInterestStatus,
  getSecurityInformation,
  isEventCommunityAvailable,
  reportEventCommunity,
  submitEventComment,
  submitEventSecurityInformation,
  toggleEventInterest,
  updateEventComment,
  type DiscussionAudience,
  type EventDiscussionComment,
  type EventInterestStatus,
  type ReportCategory,
  type ReportTarget,
  type SecurityCategory,
  type SecurityInformationItem,
} from '../lib/eventCommunity';

const securityCategories:Array<{value:SecurityCategory;label:string}>=[
  {value:'schedule',label:'Data ou horário'},
  {value:'location',label:'Local'},
  {value:'status',label:'Cancelamento ou status'},
  {value:'guidance',label:'Orientação'},
  {value:'alert',label:'Alerta'},
  {value:'other',label:'Outro'},
];

const reportCategories:Array<{value:ReportCategory;label:string}>=[
  {value:'threat',label:'Ameaça'},
  {value:'false_info',label:'Informação falsa'},
  {value:'fake_change',label:'Mudança falsa de local/horário'},
  {value:'inappropriate',label:'Conteúdo inadequado'},
  {value:'personal_data',label:'Divulgação de dados pessoais'},
  {value:'other',label:'Outro'},
];

function verificationLabel(status:SecurityInformationItem['verification_status']){
  if(status==='confirmed')return 'Confirmado';
  if(status==='unconfirmed')return 'Não confirmado';
  return 'Aguardando verificação';
}

function formatTimestamp(value:string){
  return new Date(value).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

function signInPath(eventSlug:string){
  return '/entrar?next='+encodeURIComponent('/evento/'+eventSlug);
}

function communityError(error:unknown){
  const message=error instanceof Error?error.message:'Não foi possível concluir esta ação.';
  if(message==='AUTH_REQUIRED')return 'Entre na sua conta para participar.';
  if(message.includes('PGRST202')||message.toLowerCase().includes('schema cache')||message.toLowerCase().includes('could not find the function'))return 'O módulo comunitário ainda não foi instalado no Supabase deste ambiente.';
  return message;
}

export default function EventCommunity({eventSlug}:{eventSlug:string}){
  const available=isEventCommunityAvailable();
  const[userId,setUserId]=useState<string|null>(null);
  const[loading,setLoading]=useState(true);
  const[loadError,setLoadError]=useState(false);
  const[busy,setBusy]=useState(false);
  const[notice,setNotice]=useState('');
  const[securityItems,setSecurityItems]=useState<SecurityInformationItem[]>([]);
  const[comments,setComments]=useState<EventDiscussionComment[]>([]);
  const[interest,setInterest]=useState<EventInterestStatus>({count:0,interested:false});
  const[audience,setAudience]=useState<DiscussionAudience>('public');
  const[commentText,setCommentText]=useState('');
  const[editingComment,setEditingComment]=useState<string|null>(null);
  const[editText,setEditText]=useState('');
  const[showSecurityForm,setShowSecurityForm]=useState(false);
  const[securityCategory,setSecurityCategory]=useState<SecurityCategory>('alert');
  const[securityText,setSecurityText]=useState('');
  const[securityOrigin,setSecurityOrigin]=useState('');
  const[reportTarget,setReportTarget]=useState<{type:ReportTarget;id:string|null}|null>(null);
  const[reportCategory,setReportCategory]=useState<ReportCategory>('other');
  const[reportDetails,setReportDetails]=useState('');

  useEffect(()=>{
    if(!supabase){setLoading(false);return}
    let active=true;
    supabase.auth.getUser().then(({data})=>{if(active)setUserId(data.user?.id??null)}).catch(()=>{if(active)setUserId(null)});
    const{data}=supabase.auth.onAuthStateChange((_event,session)=>setUserId(session?.user?.id??null));
    return()=>{active=false;data.subscription.unsubscribe()};
  },[]);

  useEffect(()=>{
    if(!available){setLoading(false);setLoadError(true);return}
    let active=true;
    setLoading(true);
    Promise.all([
      getSecurityInformation(eventSlug),
      getEventDiscussion(eventSlug,audience),
      getEventInterestStatus(eventSlug),
    ]).then(([items,nextComments,nextInterest])=>{
      if(!active)return;
      setSecurityItems(items);
      setComments(nextComments);
      setInterest(nextInterest);
      setNotice('');
      setLoadError(false);
    }).catch(error=>{
      if(active){setNotice(communityError(error));setLoadError(true)}
    }).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[available,eventSlug,audience,userId]);

  const refresh=async(nextAudience=audience)=>{
    const[items,nextComments,nextInterest]=await Promise.all([
      getSecurityInformation(eventSlug),
      getEventDiscussion(eventSlug,nextAudience),
      getEventInterestStatus(eventSlug),
    ]);
    setSecurityItems(items);
    setComments(nextComments);
    setInterest(nextInterest);
    setLoadError(false);
  };

  const requireSignIn=()=>setNotice('Entre na sua conta para participar.');
  const startReport=(type:ReportTarget,id:string|null)=>{
    if(!userId){requireSignIn();return}
    setReportTarget({type,id});
    setReportCategory('other');
    setReportDetails('');
    setNotice('');
  };

  const submitComment=async(event:FormEvent)=>{
    event.preventDefault();
    if(!userId){requireSignIn();return}
    setBusy(true);setNotice('');
    try{
      await submitEventComment(eventSlug,commentText,audience);
      setCommentText('');
      await refresh();
      setNotice('Comentário enviado e aguardando moderação.');
    }catch(error){setNotice(communityError(error))}
    finally{setBusy(false)}
  };

  const saveEdit=async(event:FormEvent)=>{
    event.preventDefault();
    if(!editingComment)return;
    setBusy(true);setNotice('');
    try{
      await updateEventComment(editingComment,editText);
      setEditingComment(null);setEditText('');
      await refresh();
      setNotice('Comentário atualizado e reenviado para verificação.');
    }catch(error){setNotice(communityError(error))}
    finally{setBusy(false)}
  };

  const removeComment=async(comment:EventDiscussionComment)=>{
    if(!window.confirm('Excluir seu comentário?'))return;
    setBusy(true);setNotice('');
    try{await deleteEventComment(comment.id);await refresh();setNotice('Comentário excluído.')}
    catch(error){setNotice(communityError(error))}
    finally{setBusy(false)}
  };

  const submitSecurity=async(event:FormEvent)=>{
    event.preventDefault();
    if(!userId){requireSignIn();return}
    setBusy(true);setNotice('');
    try{
      await submitEventSecurityInformation(eventSlug,securityCategory,securityText,securityOrigin);
      setSecurityText('');setSecurityOrigin('');setShowSecurityForm(false);
      await refresh();
      setNotice('Informação enviada. Ela aparecerá como aguardando verificação até ser revisada.');
    }catch(error){setNotice(communityError(error))}
    finally{setBusy(false)}
  };

  const submitReport=async(event:FormEvent)=>{
    event.preventDefault();
    if(!userId||!reportTarget){requireSignIn();return}
    setBusy(true);setNotice('');
    try{
      await reportEventCommunity(eventSlug,reportTarget.type,reportTarget.id,reportCategory,reportDetails);
      setReportTarget(null);setReportDetails('');
      setNotice('Denúncia enviada para análise. Obrigado por ajudar a manter o espaço seguro.');
    }catch(error){setNotice(communityError(error))}
    finally{setBusy(false)}
  };

  const changeInterest=async()=>{
    if(!userId){requireSignIn();return}
    setBusy(true);setNotice('');
    try{
      const next=await toggleEventInterest(eventSlug,!interest.interested);
      setInterest(next);
      if(!next.interested&&audience==='interested')setAudience('public');
    }catch(error){setNotice(communityError(error))}
    finally{setBusy(false)}
  };

  return <section className="event-community" aria-label="Segurança e discussão do evento">
    <section className="event-community-section">
      <div className="section-head compact">
        <div><div className="eyebrow">SEGURANÇA</div><h2><Shield size={21}/> Segurança e informações</h2></div>
        <button type="button" className="button ghost" onClick={()=>startReport('event',null)}><AlertTriangle size={17}/>Reportar informação</button>
      </div>
      <p className="community-explainer">Informações enviadas pela comunidade ficam identificadas como aguardando verificação até serem revisadas.</p>
      {securityItems.length===0&&!loading&&!loadError&&<div className="empty community-empty"><Shield/><h3>Nenhum alerta ou atualização</h3><p>As informações relevantes do evento aparecerão aqui.</p></div>}
      <div className="community-item-list">
        {securityItems.map(item=><article className="community-item" key={item.id}>
          <div className="community-item-header">
            <span className={'verification-badge '+item.verification_status}><Check size={14}/>{verificationLabel(item.verification_status)}</span>
            <time dateTime={item.created_at}>{formatTimestamp(item.created_at)}</time>
          </div>
          <p>{item.content}</p>
          <div className="community-byline">{item.author_name}{item.origin?' · '+item.origin:''}</div>
          <button type="button" className="community-text-action" onClick={()=>startReport('security_information',item.id)}><Flag size={14}/>Denunciar informação</button>
        </article>)}
      </div>
      {userId
        ? <button type="button" className="button ghost" onClick={()=>setShowSecurityForm(value=>!value)}>{showSecurityForm?<X size={16}/>:<Shield size={16}/>} {showSecurityForm?'Fechar':'Adicionar informação'}</button>
        : <Link className="button ghost" to={signInPath(eventSlug)}>Entre para enviar uma informação</Link>}
      {showSecurityForm&&userId&&<form className="community-form" onSubmit={submitSecurity}>
        <label>Categoria<select value={securityCategory} onChange={event=>setSecurityCategory(event.target.value as SecurityCategory)}>{securityCategories.map(category=><option value={category.value} key={category.value}>{category.label}</option>)}</select></label>
        <label>Informação<textarea value={securityText} onChange={event=>setSecurityText(event.target.value)} maxLength={1200} required placeholder="Descreva a atualização ou orientação. Não inclua dados pessoais nem links."/></label>
        <label>Origem (opcional)<input value={securityOrigin} onChange={event=>setSecurityOrigin(event.target.value)} maxLength={120} placeholder="Ex.: organização do evento"/></label>
        <button type="submit" className="button primary" disabled={busy||!securityText.trim()}>Enviar para verificação</button>
      </form>}
    </section>

    <section className="event-community-section">
      <div className="section-head compact">
        <div><div className="eyebrow">CONVERSA</div><h2><MessageCircle size={21}/> Discussão</h2></div>
        <div className="event-interest-control">
          {!loadError&&<span><Heart size={16}/>{interest.count} interessado{interest.count===1?'':'s'}</span>}
          {userId
            ? <button type="button" className={interest.interested?'button primary':'button ghost'} aria-pressed={interest.interested} disabled={busy} onClick={changeInterest}>{interest.interested?<Check size={16}/>:<Heart size={16}/>} {interest.interested?'Remover interesse':'Tenho interesse'}</button>
            : <Link className="button ghost" to={signInPath(eventSlug)}>Tenho interesse</Link>}
        </div>
      </div>
      <div className="community-tabs" role="tablist" aria-label="Área da discussão">
        <button type="button" role="tab" aria-selected={audience==='public'} className={audience==='public'?'active':''} onClick={()=>setAudience('public')}>Discussão pública</button>
        {interest.interested&&<button type="button" role="tab" aria-selected={audience==='interested'} className={audience==='interested'?'active':''} onClick={()=>setAudience('interested')}>Participantes interessados</button>}
      </div>
      <p className="community-explainer">Comentários passam por verificações contra flood, links e dados pessoais. Só comentários publicados ficam visíveis para outras pessoas.</p>
      {audience==='interested'&&!interest.interested&&<div className="empty community-empty"><LockIcon/><h3>Espaço para participantes</h3><p>Marque interesse neste evento para acessar esta conversa.</p><button type="button" className="button ghost" onClick={changeInterest}>Tenho interesse</button></div>}
      {comments.length===0&&!loading&&!loadError&&<div className="empty community-empty"><MessageCircle/><h3>Nenhum comentário publicado</h3><p>Seja a primeira pessoa a iniciar uma conversa respeitosa.</p></div>}
      <div className="community-item-list">
        {comments.map(comment=><article className={'community-comment '+(comment.status==='pending'?'pending':'')} key={comment.id}>
          <div className="community-item-header"><strong>{comment.author_name}</strong><time dateTime={comment.created_at}>{formatTimestamp(comment.created_at)}</time></div>
          {comment.status==='pending'&&<span className="verification-badge pending"><Clock3 size={14}/>Aguardando moderação</span>}
          {editingComment===comment.id
            ? <form className="community-form" onSubmit={saveEdit}><label>Editar comentário<textarea value={editText} onChange={event=>setEditText(event.target.value)} maxLength={1200} required/></label><div className="community-inline-actions"><button className="button primary" disabled={busy}>Salvar para revisão</button><button type="button" className="button ghost" onClick={()=>setEditingComment(null)}>Cancelar</button></div></form>
            : <p>{comment.content}</p>}
          <div className="community-inline-actions">
            {comment.is_mine&&editingComment!==comment.id&&<><button type="button" className="community-text-action" onClick={()=>{setEditingComment(comment.id);setEditText(comment.content)}}>Editar</button><button type="button" className="community-text-action" disabled={busy} onClick={()=>removeComment(comment)}><Trash2 size={14}/>Excluir</button></>}
            {!comment.is_mine&&<button type="button" className="community-text-action" onClick={()=>startReport('comment',comment.id)}><Flag size={14}/>Denunciar comentário</button>}
          </div>
        </article>)}
      </div>
      {userId
        ? <form className="community-form" onSubmit={submitComment}><label>Seu comentário<textarea value={commentText} onChange={event=>setCommentText(event.target.value)} maxLength={1200} required placeholder="Compartilhe informações úteis. Links e dados pessoais são bloqueados."/></label><button type="submit" className="button primary" disabled={busy||!commentText.trim()}>Enviar para moderação</button></form>
        : <div className="community-login"><span>Entre para comentar.</span><Link className="button primary" to={signInPath(eventSlug)}>Entrar / criar conta</Link></div>}
    </section>

    {reportTarget&&<form className="community-form report-form" onSubmit={submitReport}>
      <div className="section-head compact"><div><div className="eyebrow">DENÚNCIA</div><h3>Reportar {reportTarget.type==='comment'?'comentário':reportTarget.type==='security_information'?'informação':'evento'}</h3></div><button type="button" className="icon-button" aria-label="Fechar denúncia" onClick={()=>setReportTarget(null)}><X size={17}/></button></div>
      <label>Categoria<select value={reportCategory} onChange={event=>setReportCategory(event.target.value as ReportCategory)}>{reportCategories.map(category=><option value={category.value} key={category.value}>{category.label}</option>)}</select></label>
      <label>Detalhes (opcional)<textarea value={reportDetails} onChange={event=>setReportDetails(event.target.value)} maxLength={1000} placeholder="Explique o motivo sem repetir dados pessoais ou incluir links."/></label>
      <button type="submit" className="button primary" disabled={busy}>Enviar denúncia</button>
    </form>}
    {loading&&<p className="community-loading">Carregando informações da comunidade…</p>}
    {notice&&<div className="callout info community-notice" role="status"><span>{notice}</span>{notice==='Entre na sua conta para participar.'&&<Link to={signInPath(eventSlug)}>Entrar</Link>}</div>}
    {!available&&<div className="callout warning community-notice"><span>Este espaço depende da migração comunitária do Supabase e não está disponível neste ambiente.</span></div>}
  </section>;
}

function LockIcon(){return <Shield size={22}/>}