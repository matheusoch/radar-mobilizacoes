import {useState} from 'react';
import {CheckCircle2,Info,MailCheck,RefreshCw,Send,ShieldCheck} from 'lucide-react';
import {supabase} from '../lib/supabase';

type CheckResult={ok:boolean;detail:string};
type DiagnosticResult={ok:boolean;ready:boolean;automation_prerequisites_ready?:boolean;scheduler_verified?:boolean;scheduler_enabled?:boolean;last_test_at?:string|null;test_recorded?:boolean;checks?:Record<string,CheckResult>;from_domain?:string|null;admin_email?:string|null;recipient?:string;sent?:boolean;message_id?:string|null;error?:string;detail?:string};

const LABELS:Record<string,string>={
  user_email_confirmed:'E-mail da conta administradora confirmado',
  sender_configured:'Remetente configurado',
  postal_address:'Endereço postal do projeto',
  unsubscribe_secret:'Chave de cancelamento',
  cron_secret:'Chave privada de agendamento na Vault',
  scheduler_installed:'Agendamento diário instalado',
  public_site_url:'URL pública HTTPS',
  resend_api_key:'Chave do provedor de e-mail',
  sender_domain_verified:'Domínio do remetente verificado',
};

export default function EmailDigestAdminDiagnostics(){
  const[busy,setBusy]=useState(false);
  const[result,setResult]=useState<DiagnosticResult|null>(null);
  const[message,setMessage]=useState('');
  const[error,setError]=useState('');

  const invoke=async(action:'check'|'send_test'|'enable_sending'|'disable_sending')=>{
    if(!supabase)return;
    setBusy(true);setError('');setMessage('');
    try{
      const{data,error:invokeError}=await supabase.functions.invoke('admin-email-digest-diagnostics',{body:{action}});
      if(invokeError){
        const detail=typeof data?.detail==='string'?data.detail:typeof data?.error==='string'?data.error:'A verificação falhou. Confirme se a função de diagnóstico está publicada.';
        setError(detail);
        if(data&&typeof data==='object')setResult(data as DiagnosticResult);
      }else{
        setResult(data as DiagnosticResult);
        if(action==='send_test'&&data?.sent)setMessage(data?.test_recorded?'O teste foi aceito e registrado para '+(data.recipient||'o e-mail da conta administradora')+'. Confira a caixa de entrada e o spam.':'O provedor aceitou o teste, mas não foi possível registrar a validação no banco.');
        else if(action==='enable_sending'&&data?.scheduler_enabled)setMessage('Envio diário ativado. O boletim só será enviado a contas com alerta por e-mail ativo e endereço confirmado.');
        else if(action==='disable_sending')setMessage('Envio automático pausado. As preferências das pessoas inscritas foram preservadas.');
        else if(action==='check')setMessage(data?.scheduler_enabled?'Configuração verificada: os boletins diários estão ativados.':data?.ready?'A configuração parece pronta para o teste de entrega.':'Há itens a configurar antes de testar o envio.');
        else setMessage('A solicitação foi processada.');
      }
    }catch(e){
      setError(e instanceof Error?e.message:'Não foi possível verificar o serviço de e-mail.');
    }finally{setBusy(false)}
  };

  if(!supabase)return null;
  return <section className="admin-section email-digest-diagnostics">
    <div className="section-head compact">
      <div><div className="eyebrow">ENTREGA DE E-MAIL</div><h2>Validar boletins por cidade</h2></div>
      <span className="analytics-note">Verificação protegida para administradores</span>
    </div>
    <p className="page-lead">Confira a configuração do provedor, do domínio remetente, do cancelamento e do agendamento. O teste, quando solicitado, é enviado somente ao e-mail da conta administradora autenticada; não envia mensagens aos inscritos.</p>
    <div className="city-digest-actions">
      <button className="button ghost" type="button" disabled={busy} onClick={()=>void invoke('check')}><RefreshCw size={16}/>{busy?'Verificando…':'Verificar configuração'}</button>
      <button className="button ghost" type="button" disabled={busy||!result?.ready} onClick={()=>{if(window.confirm('Enviar um único e-mail de teste para '+(result?.admin_email||'o e-mail desta conta administradora')+'? Nenhum inscrito receberá esta mensagem.'))void invoke('send_test')}}><Send size={16}/>{busy?'Aguarde…':'Enviar e-mail de teste'}</button>
      {!result?.scheduler_enabled
        ?<button className="button primary" type="button" disabled={busy||!result?.ready||!result?.automation_prerequisites_ready||!result?.last_test_at||Date.now()-new Date(result.last_test_at).getTime()>24*60*60*1000} onClick={()=>{if(window.confirm('Ativar os boletins diários às 8h (horário de Brasília)? Serão enviados apenas a pessoas com alertas por e-mail ativos e endereço confirmado.'))void invoke('enable_sending')}}><MailCheck size={16}/>{busy?'Aguarde…':'Ativar boletins diários'}</button>
        :<button className="button primary" type="button" disabled={busy} onClick={()=>{if(window.confirm('Pausar os boletins diários? As inscrições continuarão salvas, mas nenhum boletim será enviado automaticamente.'))void invoke('disable_sending')}}><Info size={16}/>{busy?'Aguarde…':'Pausar envio diário'}</button>}
    </div>
    {message&&<div className="callout info" role="status"><CheckCircle2 size={18}/><span>{message}</span></div>}
    {error&&<div className="callout warning" role="alert"><Info size={18}/><span>{error}</span></div>}
    {result?.checks&&<div className="email-digest-check-list">
      {Object.entries(result.checks).map(([key,item])=><div className="email-digest-check" key={key}>
        {item.ok?<CheckCircle2 size={17} aria-hidden="true"/>:<Info size={17} aria-hidden="true"/>}
        <div><strong>{LABELS[key]||key}</strong><span>{item.detail}</span></div>
      </div>)}
      {result.from_domain&&<p className="analytics-note">Domínio avaliado: {result.from_domain}</p>}
      {result.ready?<p className="analytics-note"><ShieldCheck size={15} style={{display:'inline',verticalAlign:'text-bottom'}}/> A configuração do remetente está pronta para testar o envio. {result.scheduler_enabled?'O agendamento diário está ativado.':'O agendamento está instalado, mas só enviará boletins depois da ativação explícita acima.'} Os valores dos segredos nunca são exibidos nesta tela.</p>:<p className="analytics-note">Os valores dos segredos nunca são exibidos nesta tela.</p>}
    </div>}
    {result?.sent&&<div className="callout info"><MailCheck size={18}/><span>Teste aceito pelo provedor. ID da mensagem: {result.message_id||'não informado'}.</span></div>}
  </section>;
}
