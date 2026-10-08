import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {Info,LogIn} from 'lucide-react';
import EventModerationPanel from './EventModerationPanel';
import {supabase} from '../lib/supabase';

export default function EventModerationPage(){
  const[userId,setUserId]=useState<string|null>(null);
  const[loading,setLoading]=useState(true);

  useEffect(()=>{
    if(!supabase){setLoading(false);return}
    let active=true;
    supabase.auth.getUser().then(({data})=>{if(active)setUserId(data.user?.id??null)}).catch(()=>{if(active)setUserId(null)}).finally(()=>{if(active)setLoading(false)});
    const{data}=supabase.auth.onAuthStateChange((_event,session)=>setUserId(session?.user?.id??null));
    return()=>{active=false;data.subscription.unsubscribe()};
  },[]);

  if(loading)return <div className="loading"><div className="spinner"/>Verificando acesso…</div>;
  if(!supabase)return <div className="container page narrow"><div className="callout warning"><Info/><span>O Supabase não está configurado neste ambiente.</span></div></div>;
  if(!userId)return <div className="container page narrow"><div className="eyebrow">MODERAÇÃO</div><h1>Entre para continuar</h1><p className="page-lead">Esta área é reservada a administradores e moderadores autorizados.</p><Link className="button primary" to={'/entrar?next='+encodeURIComponent('/admin/moderacao')}><LogIn size={17}/>Entrar</Link></div>;

  return <div className="container page"><Link className="back-link" to="/admin">Voltar ao painel editorial</Link><EventModerationPanel/></div>;
}