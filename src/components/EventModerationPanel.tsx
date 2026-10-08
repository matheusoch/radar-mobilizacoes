import {useEffect,useState} from 'react';
import {Check,Flag,RefreshCw,Shield,X} from 'lucide-react';
import {getEventModerationQueue,moderateEventCommunity,setEventModerator,type ModerationQueue,type ModerationAction,type ModerationTargetType,type ReportTarget} from '../lib/eventCommunity';

function dateLabel(value:string){return new Date(value).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
function moderationError(error:unknown){
  const message=error instanceof Error?error.message:'Não foi possível concluir a ação.';
  if(message==='FORBIDDEN')return 'Acesso negado. Somente administradores e moderadores podem ver esta fila.';
  if(message.includes('PGRST202')||message.toLowerCase().includes('schema cache')||message.toLowerCase().includes('could not find the function'))return 'A migration comunitária ainda não foi aplicada neste Supabase.';
  return message;
}

export default function EventModerationPanel(){
  const[queue,setQueue]=useState<ModerationQueue|null>(null);
  const[loading,setLoading]=useState(true);
  const[busy,setBusy]=useState(false);
  const[notice,setNotice]=useState('');
  const[reason,setReason]=useState('');
  const[suspendHours,setSuspendHours]=useState(24);
  const[moderatorId,setModeratorId]=useState('');

  const reload=async()=>{
    setLoading(true);
    try{setQueue(await getEventModerationQueue());setNotice('')}
    catch(error){setQueue(null);setNotice(moderationError(error))}
    finally{setLoading(false)}
  };

  useEffect(()=>{void reload()},[]);

  const act=async(targetType:ModerationTargetType,targetId:string,action:ModerationAction)=>{
    if(action==='suspend_user'&&!reason.trim()){setNotice('Informe o motivo antes de suspender uma conta.');return}
    setBusy(true);setNotice('');
    try{await moderateEventCommunity(targetType,targetId,action,reason,suspendHours);setNotice('Ação registrada no histórico de moderação.');await reload()}
    catch(error){setNotice(moderationError(error))}
    finally{setBusy(false)}
  };

  const changeModerator=async(enabled:boolean)=>{
    if(!moderatorId.trim()){setNotice('Informe o UUID da conta que receberá a alteração.');return}
    setBusy(true);setNotice('');
    try{await setEventModerator(moderatorId.trim(),enabled);setModeratorId('');setNotice(enabled?'Moderador adicionado.':'Moderador removido.');await reload()}
    catch(error){setNotice(moderationError(error))}
    finally{setBusy(false)}
  };

  if(loading&&!queue)return <section className="admin-section community-moderation"><div className="section-head compact"><h2>Segurança e discussão</h2></div><p>Carregando fila…</p></section>;
  if(!queue)return <section className="admin-section community-moderation"><div className="section-head compact"><h2>Segurança e discussão</h2></div><div className="callout warning"><Flag size={18}/><span>{notice||'Fila indisponível. Confirme que a migration foi aplicada e que sua conta tem permissão de moderação.'}</span></div><button type="button" className="button ghost" onClick={()=>void reload()}><RefreshCw size={16}/>Tentar novamente</button></section>;

  return <section className="admin-section community-moderation">
    <div className="section-head compact"><div><div className="eyebrow">MODERAÇÃO COMUNITÁRIA</div><h2>Segurança e discussão</h2></div><button type="button" className="button ghost" onClick={()=>void reload()} disabled={busy}><RefreshCw size={16}/>Atualizar</button></div>
    {notice&&<div className="callout info" role="status"><span>{notice}</span></div>}
    <div className="moderation-controls">
      <label>Motivo de moderação<input value={reason} onChange={event=>setReason(event.target.value)} maxLength={500} placeholder="Obrigatório para suspender uma conta"/></label>
      <label>Duração da suspensão (horas)<input type="number" min={1} max={720} value={suspendHours} onChange={event=>setSuspendHours(Math.max(1,Math.min(720,Number(event.target.value)||1)))}/></label>
    </div>
    {queue.can_manage_moderators&&<div className="moderator-assignment">
      <Shield size={18}/><label>UUID da conta<input value={moderatorId} onChange={event=>setModeratorId(event.target.value)} placeholder="Gerenciar acesso de moderador"/></label>
      <button type="button" className="button ghost" onClick={()=>void changeModerator(true)} disabled={busy}>Adicionar moderador</button>
      <button type="button" className="button ghost" onClick={()=>void changeModerator(false)} disabled={busy}><X size={15}/>Remover</button>
    </div>}

    <h3>Denúncias ({queue.reports.length})</h3>
    {!queue.reports.length&&<p className="analytics-note">Nenhuma denúncia aberta.</p>}
    <div className="review-card-list">{queue.reports.map(report=><article className="review-card community-review" key={report.id}>
      <div className="review-copy"><div className="review-meta"><strong>{report.reporter_name} · {report.category}</strong><time>{dateLabel(report.created_at)}</time></div><h4><a href={'/evento/'+report.event_slug}>{report.event_title}</a></h4><p>{report.target_content}</p>{report.details&&<p>{report.details}</p>}</div>
      <div className="review-actions"><button type="button" className="button primary" onClick={()=>void act('report',report.id,'resolve_report')} disabled={busy}><Check size={15}/>Resolver</button>{report.target_type!=='event'&&<><button type="button" className="button ghost" onClick={()=>void act(report.target_type as Exclude<ReportTarget,'event'>,report.target_type==='comment'?report.comment_id!:report.security_information_id!,'hide_'+(report.target_type==='comment'?'comment':'information') as ModerationAction)} disabled={busy}>Ocultar conteúdo</button><button type="button" className="button ghost danger" onClick={()=>void act('report',report.id,'suspend_user')} disabled={busy}>Suspender autor</button></>}</div>
    </article>)}</div>

    <h3>Informações aguardando verificação ({queue.security_information.length})</h3>
    <div className="review-card-list">{queue.security_information.map(item=><article className="review-card community-review" key={item.id}>
      <div className="review-copy"><div className="review-meta"><strong>{item.author_name} · {item.category}</strong><time>{dateLabel(item.created_at)}</time></div><h4><a href={'/evento/'+item.event_slug}>{item.event_title}</a></h4><p>{item.content}</p>{item.origin&&<p>Origem: {item.origin}</p>}</div>
      <div className="review-actions">{item.verification_status==='pending'?<><button type="button" className="button primary" onClick={()=>void act('security_information',item.id,'confirm_information')} disabled={busy}><Check size={15}/>Confirmar</button><button type="button" className="button ghost" onClick={()=>void act('security_information',item.id,'unconfirm_information')} disabled={busy}>Não confirmar</button><button type="button" className="button ghost danger" onClick={()=>void act('security_information',item.id,'hide_information')} disabled={busy}>Ocultar</button></>:<button type="button" className="button ghost" onClick={()=>void act('security_information',item.id,'restore_information')} disabled={busy}>Restaurar para verificação</button>}<button type="button" className="button ghost" onClick={()=>void act('security_information',item.id,'suspend_user')} disabled={busy}>Suspender autor</button></div>
    </article>)}</div>

    <h3>Comentários aguardando moderação ({queue.comments.length})</h3>
    <div className="review-card-list">{queue.comments.map(comment=><article className="review-card community-review" key={comment.id}>
      <div className="review-copy"><div className="review-meta"><strong>{comment.author_name} · {comment.audience==='interested'?'Participantes':'Público'}</strong><time>{dateLabel(comment.created_at)}</time></div><h4><a href={'/evento/'+comment.event_slug}>{comment.event_title}</a></h4><p>{comment.content}</p></div>
      <div className="review-actions">{comment.status==='pending'?<button type="button" className="button primary" onClick={()=>void act('comment',comment.id,'publish_comment')} disabled={busy}><Check size={15}/>Publicar</button>:<button type="button" className="button ghost" onClick={()=>void act('comment',comment.id,'restore_comment')} disabled={busy}>Restaurar para revisão</button>}{comment.status!=='hidden'&&<button type="button" className="button ghost" onClick={()=>void act('comment',comment.id,'hide_comment')} disabled={busy}>Ocultar</button>}<button type="button" className="button ghost danger" onClick={()=>void act('comment',comment.id,'remove_comment')} disabled={busy}>Remover</button><button type="button" className="button ghost" onClick={()=>void act('comment',comment.id,'suspend_user')} disabled={busy}>Suspender autor</button></div>
    </article>)}</div>

    <h3>Histórico recente</h3>
    {!queue.actions.length&&<p className="analytics-note">Nenhuma ação de moderação registrada.</p>}
    <div className="analytics-list">{queue.actions.map((action,index)=><div key={action.target_type+'-'+action.target_id+'-'+index}><span>{action.actor_name} · {action.action}{action.reason?' · '+action.reason:''}</span><time>{dateLabel(action.created_at)}</time></div>)}</div>
  </section>;
}