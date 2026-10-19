import {useEffect,useState} from 'react';
import type {User} from '@supabase/supabase-js';
import {Bell,CheckCircle2,Info,LogIn,Mail,MapPin,ShieldCheck,XCircle} from 'lucide-react';
import {Link,useLocation} from 'react-router-dom';
import {BRAZILIAN_STATES} from '../lib/brazilianStates';
import {supabase} from '../lib/supabase';
import {recordAnalyticsEvent} from '../lib/data';
import LocationAutocomplete from './LocationAutocomplete';
import {canonicalizeLocation,canonicalizeLocationOptions} from '../lib/locationNormalization';

type EmailFormat='resumo'|'cards'|'ambos';
type DigestSettings={
  city:string;
  state:string;
  enabled:boolean;
  in_app_enabled:boolean;
  email_format:EmailFormat;
  consent_at:string|null;
  unsubscribed_at:string|null;
};
const DEFAULT_SETTINGS:DigestSettings={
  city:'',
  state:'',
  enabled:false,
  in_app_enabled:false,
  email_format:'ambos',
  consent_at:null,
  unsubscribed_at:null,
};
const EMAIL_DIGEST_ENABLED=import.meta.env.VITE_EMAIL_DIGEST_ENABLED==='true';

export default function CityEmailDigestPreferences(){
  const location=useLocation();
  const[ user,setUser ]=useState<User|null>(null);
  const[authLoading,setAuthLoading]=useState(true);
  const[loading,setLoading]=useState(true);
  const[settings,setSettings]=useState<DigestSettings>(DEFAULT_SETTINGS);
  const[cityOptions,setCityOptions]=useState<string[]>([]);
  const[busy,setBusy]=useState(false);
  const[message,setMessage]=useState('');
  const[error,setError]=useState('');

  useEffect(()=>{
    if(!supabase){setAuthLoading(false);setLoading(false);return}
    let active=true;
    supabase.auth.getUser().then(({data})=>{
      if(active)setUser(data.user);
    }).finally(()=>{if(active)setAuthLoading(false)});
    const{data:listener}=supabase.auth.onAuthStateChange((_event,session)=>{
      if(active)setUser(session?.user??null);
    });
    return()=>{
      active=false;
      listener.subscription.unsubscribe();
    };
  },[]);

  useEffect(()=>{
    if(!supabase)return;
    let active=true;
    supabase.from('events').select('city').eq('is_public',true).not('city','is',null).limit(5000).then(({data})=>{
      if(active)setCityOptions(canonicalizeLocationOptions((data||[]).map((row:any)=>String(row.city||'')).filter(Boolean)));
    });
    return()=>{active=false};
  },[]);

  useEffect(()=>{
    if(authLoading)return;
    if(!supabase||!user){
      setLoading(false);
      return;
    }
    let active=true;
    setLoading(true);
    setError('');
    (async()=>{
      const{data,error:loadError}=await supabase
        .from('city_email_digest_subscriptions')
        .select('city,state,enabled,in_app_enabled,email_format,consent_at,unsubscribed_at')
        .eq('user_id',user.id)
        .maybeSingle();
      if(!active)return;
      if(loadError){
        setError('Não foi possível carregar suas preferências. Tente novamente mais tarde.');
        setSettings(DEFAULT_SETTINGS);
      }else if(data){
        setSettings({
          city:data.city||'',
          state:data.state||'',
          enabled:Boolean(data.enabled),
          in_app_enabled:Boolean(data.in_app_enabled),
          email_format:(data.email_format||'ambos') as EmailFormat,
          consent_at:data.consent_at||null,
          unsubscribed_at:data.unsubscribed_at||null,
        });
      }else{
        const metadata=(user.user_metadata||{}) as Record<string,unknown>;
        const activationRequested=new URLSearchParams(location.search).get('ativar')==='1';
        const hasSignupConsent=metadata.email_digest_opt_in===true;
        setSettings({
          ...DEFAULT_SETTINGS,
          city:typeof metadata.digest_city==='string'?metadata.digest_city:(typeof metadata.city==='string'?metadata.city:''),
          state:typeof metadata.digest_state==='string'?metadata.digest_state:(typeof metadata.state==='string'?metadata.state:''),
          enabled:EMAIL_DIGEST_ENABLED&&activationRequested&&hasSignupConsent,
          email_format:(metadata.email_digest_format==='resumo'||metadata.email_digest_format==='cards'||metadata.email_digest_format==='ambos'?metadata.email_digest_format:'ambos') as EmailFormat,
        });
      }
    })().finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[user?.id,authLoading,location.search]);

  const save=async()=>{
    if(!supabase||!user)return;
    const wasEmailEnabled=settings.enabled;
    setBusy(true);setError('');setMessage('');
    try{
      if((settings.enabled||settings.in_app_enabled)&&(!settings.city.trim()||!settings.state)){
        setError('Informe sua cidade e seu estado para receber apenas os eventos da sua região.');
        return;
      }
      if(settings.enabled&&EMAIL_DIGEST_ENABLED&&!user.email_confirmed_at){
        setError('Confirme primeiro o e-mail da sua conta. Depois volte aqui para ativar os resumos.');
        return;
      }
      const canonicalCity=canonicalizeLocation(settings.city,cityOptions);
      const{data:saveData,error:saveError}=await supabase.rpc('save_city_alert_preferences',{
        p_city:canonicalCity,
        p_state:settings.state,
        p_in_app_enabled:settings.in_app_enabled,
        p_email_enabled:settings.enabled,
        p_email_format:settings.email_format,
      });
      if(saveError){
        if(saveError.message?.includes('EMAIL_NOT_VERIFIED'))throw new Error('Confirme primeiro o e-mail da sua conta para ativar os resumos.');
        throw new Error('Não foi possível salvar agora. Confira os dados e tente novamente.');
      }
      const saved=(saveData||null) as Partial<DigestSettings>|null;
      setSettings(current=>({
        ...current,
        city:typeof saved?.city==='string'?canonicalizeLocation(saved.city,cityOptions):canonicalCity,
        state:typeof saved?.state==='string'?saved.state:current.state,
        enabled:typeof saved?.enabled==='boolean'?saved.enabled:false,
        in_app_enabled:typeof saved?.in_app_enabled==='boolean'?saved.in_app_enabled:false,
        email_format:(saved?.email_format||current.email_format) as EmailFormat,
        consent_at:saved?.consent_at??null,
        unsubscribed_at:saved?.unsubscribed_at??null,
      }));
      if(settings.enabled&&!wasEmailEnabled)void recordAnalyticsEvent('email_alert_opt_in',{source:'preferences'});\n      if(!settings.enabled&&wasEmailEnabled)void recordAnalyticsEvent('email_alert_opt_out',{source:'preferences'});\n      setMessage(settings.in_app_enabled&&settings.enabled
        ?'Preferências salvas. Você receberá notificações no site e, quando o serviço estiver ativo, resumos por e-mail.'
        :settings.in_app_enabled
          ?'Preferência salva. Você receberá notificações dentro do site para eventos da sua cidade.'
          :settings.enabled
            ?'Preferência salva. O envio por e-mail depende da ativação da infraestrutura.'
            :'Preferência salva. Você desativou os alertas por cidade.');
    }catch(err){
      setError(err instanceof Error?err.message:'Não foi possível salvar sua preferência.');
    }finally{
      setBusy(false);
    }
  };


  if(authLoading||loading)return <div className="loading"><div className="spinner"/>Carregando suas preferências…</div>;
  if(!user){
    return <div className="container page narrow city-digest-page">
      <div className="eyebrow"><Bell size={15}/> ALERTAS POR CIDADE</div>
      <h1>Receba alertas sobre mobilizações da sua cidade.</h1>
      <p className="page-lead">Entre ou crie uma conta para escolher a cidade e ativar notificações dentro do site. O e-mail é opcional.</p>
      <div className="city-digest-actions">
        <Link className="button primary" to={'/entrar?next='+encodeURIComponent('/preferencias-alertas')}><LogIn size={17}/>Entrar</Link>
        <Link className="button ghost" to={'/entrar?mode=signup&digest=1&next='+encodeURIComponent('/preferencias-alertas?ativar=1')}><Mail size={17}/>Criar conta e ativar</Link>
      </div>
    </div>;
  }

  if(loading)return <div className="loading"><div className="spinner"/>Carregando suas preferências…</div>;

  return <div className="container page narrow city-digest-page">
    <div className="eyebrow"><Bell size={15}/> ALERTAS POR CIDADE</div>
    <h1>Alertas de mobilizações por cidade.</h1>
    <p className="page-lead">Escolha a cidade e decida se quer notificações dentro do site e, quando estiver ativo, um resumo diário por e-mail às 8h (horário de Brasília).</p>
    <div className="city-digest-panel">
      <label className="city-digest-field"><span><MapPin size={15}/>Cidade</span>
        <LocationAutocomplete value={settings.city} onChange={city=>setSettings(current=>({...current,city}))} options={cityOptions} label="Cidade" maxLength={100} autoComplete="address-level2" placeholder="Ex.: Belo Horizonte" className="location-filter-input" disabled={busy} required={settings.enabled||settings.in_app_enabled}/>
        <small className="location-suggestion-help">Digite para ver sugestões. Ao sair do campo, o nome será padronizado automaticamente.</small>
      </label>
      <label className="city-digest-field"><span>Estado</span>
        <select value={settings.state} onChange={event=>setSettings(current=>({...current,state:event.target.value}))} autoComplete="address-level1" disabled={busy} required={settings.enabled||settings.in_app_enabled}>
          <option value="">Selecione a UF</option>{BRAZILIAN_STATES.map(state=><option key={state.code} value={state.code}>{state.name} ({state.code})</option>)}
        </select>
      </label>
      <fieldset className="city-digest-format" disabled={busy||!EMAIL_DIGEST_ENABLED}>
        <legend>Formato do e-mail</legend>
        <label><input type="radio" name="digest-format" value="resumo" checked={settings.email_format==='resumo'} onChange={()=>setSettings(current=>({...current,email_format:'resumo'}))} disabled={busy}/>Resumo de texto</label>
        <label><input type="radio" name="digest-format" value="cards" checked={settings.email_format==='cards'} onChange={()=>setSettings(current=>({...current,email_format:'cards'}))} disabled={busy}/>Cards por evento</label>
        <label><input type="radio" name="digest-format" value="ambos" checked={settings.email_format==='ambos'} onChange={()=>setSettings(current=>({...current,email_format:'ambos'}))} disabled={busy}/>Resumo + cards</label>
      </fieldset>
      <label className="city-digest-consent">
        <input type="checkbox" checked={settings.in_app_enabled} onChange={event=>setSettings(current=>({...current,in_app_enabled:event.target.checked}))} disabled={busy}/>
        <span><strong>Quero receber notificações dentro do site.</strong><small>O sino no topo mostrará novos eventos públicos da cidade e do estado escolhidos. Você pode desativar a qualquer momento.</small></span>
      </label>
      <label className="city-digest-consent">
        <input type="checkbox" checked={settings.enabled} onChange={event=>setSettings(current=>({...current,enabled:event.target.checked}))} disabled={busy||!EMAIL_DIGEST_ENABLED}/>
        <span><strong>Quero receber o resumo diário por e-mail.</strong><small>É um consentimento separado. Usaremos seu e-mail somente para estes avisos; você pode cancelar a qualquer momento.</small></span>
      </label>
      {!EMAIL_DIGEST_ENABLED&&<div className="callout info"><Info size={18}/><span>O envio por e-mail ainda não foi ativado. Você já pode configurar notificações dentro do site; o e-mail só poderá ser habilitado depois que o remetente, os segredos e o agendamento forem testados.</span></div>}
      <p className="city-digest-privacy">Ao ativar, você confirma uma preferência de comunicação específica da Agenda. <Link to="/privacidade">Leia como os dados serão usados.</Link></p>
      {settings.in_app_enabled&&<div className="city-digest-status"><ShieldCheck size={16}/>Notificações dentro do site serão ativadas após salvar.</div>}
      {settings.enabled&&<div className="city-digest-status"><ShieldCheck size={16}/>Consentimento para e-mail ativo somente após salvar.</div>}
      {settings.consent_at&&<p className="city-digest-meta">Consentimento registrado em {new Date(settings.consent_at).toLocaleDateString('pt-BR')}.</p>}
      {error&&<div className="callout warning"><XCircle size={18}/><span>{error}</span></div>}
      {message&&<div className="callout info"><CheckCircle2 size={18}/><span>{message}</span></div>}
      <div className="city-digest-actions">
        <button type="button" className="button primary" onClick={()=>void save()} disabled={busy}>{busy?'Salvando…':'Salvar preferências'}</button>
        <Link to="/" className="button ghost">Voltar à agenda</Link>
      </div>
    </div>
  </div>;
}
