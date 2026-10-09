import {useEffect,useMemo,useState} from 'react';
import type {ChangeEvent,FormEvent,ReactNode} from 'react';
import React from 'react';
import {Link,Navigate,Route,Routes,useLocation,useNavigate,useParams} from 'react-router-dom';
import {CalendarDays,CalendarPlus,ExternalLink,Info,MapPinned,Menu,X,CheckCircle2,MessageCircle,Send,Paperclip,ShieldCheck,LogIn,UserPlus,Image as ImageIcon,Check,Trash2,Flag,RefreshCw,Search,BarChart3,Eye,KeyRound,Users,ChevronLeft,ChevronRight,Share2,Star} from 'lucide-react';
import './App.css';
// Tema único: o aplicativo mantém a aparência clara padrão.
import EventCard from './components/EventCard';
import EventCommunity from './components/EventCommunity';
import EventModerationPage from './components/EventModerationPage';
import Filters,{type FiltersState} from './components/Filters';
import MapView from './components/MapView';
import PosterActions from './components/PosterActions';
import PosterImporter from './components/PosterImporter';
import {normalizePtSentence,normalizePtTitle,type PosterCandidate} from './lib/posterOcr';
import ShareBuilder from './components/ShareBuilder';
import {getEvents,getAdminEvents,getSources,resolveImageUrl,mapDbEvent,getAttendanceStatus,toggleEventAttendance,recordPageView} from './lib/data';
import {supabase} from './lib/supabase';
import type {EventSource,MobilizationEvent} from './types';

const ADMIN_SOURCE_FALLBACK='0bb24d8c-4c25-5d74-90c1-f86fc42a9958';
const ADMIN_STORAGE_BUCKET='event_posters';
const SUBMISSION_STORAGE_BUCKET='submission_posters';

type Submission={
  id:string; user_id:string; display_name:string; title:string; date:string|null; time:string|null; time_label:string|null;
  city:string|null; state:string|null; venue:string|null; message:string|null; poster_path:string|null; status:string;
  admin_note:string|null; created_at:string; reviewed_at:string|null; reviewed_by:string|null; poster_url?:string|null;
};
type ChatMessage={id:string;user_id:string;display_name:string;content:string;attachment_path:string|null;status:string;created_at:string;reviewed_at:string|null;reviewed_by:string|null};
type PageViewRow={path:string;event_id:string|null;visitor_id:string;created_at:string};

class AppErrorBoundary extends React.Component<{children:ReactNode},{error:Error|null}>{
  state={error:null as Error|null};
  static getDerivedStateFromError(error:Error){return {error};}
  componentDidCatch(error:Error){console.error('Agenda runtime error',error);}
  render(){
    if(this.state.error){
      return <div className="loading"><div className="empty"><Info/><h2>A Agenda encontrou um erro.</h2><p>{this.state.error.message||'Erro inesperado ao renderizar esta página.'}</p><button className="button primary" onClick={()=>window.location.reload()}><RefreshCw size={16}/>Recarregar</button></div></div>;
    }
    return this.props.children;
  }
}

function slugify(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')}
async function sha256File(file:File){const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());return Array.from(new Uint8Array(digest)).map(value=>value.toString(16).padStart(2,'0')).join('')}
function fmtDate(date?:string|null){if(!date)return 'Data não informada';return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})}
function fmtShortDate(date?:string|null){if(!date)return '—';return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
function safeName(email?:string|null){return email?.split('@')[0] || 'Participante'}
function formatParticipants(count:number){if(count>=10000)return (count/1000).toFixed(1).replace('.',',')+' mil';return count.toLocaleString('pt-BR')}
type AgendaModality='Presencial'|'Virtual'|'Híbrido'|'Não informado';
type AgendaFilterField='state'|'city'|'type'|'modality';
function localDateKey(date=new Date()){
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
function normalizedSearchText(value:string){
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
function hasSpecificEventLocation(venue?:string|null,address?:string|null,city?:string|null){
  const normLocation=(value:string)=>normalizedSearchText(value).replace(/[^a-z0-9]+/g,' ').trim();
  const normCity=normLocation(city||'');
  const isSpecific=(value:string)=>{
    const normalized=normLocation(value);
    const withoutState=normalized.replace(/\s+[a-z]{2}$/,'').trim();
    return Boolean(normalized&&withoutState!==normCity&&!/^(local nao informado|nao informado|a conferir|local a confirmar|brasil|presencial)$/.test(withoutState));
  };
  return isSpecific(address||'')||isSpecific(venue||'');
}
function deriveEventModality(event:MobilizationEvent):AgendaModality{
  const onlinePattern=/\b(online|virtual|remot[oa]s?|zoom|webex|jitsi)\b|\bgoogle\s+meet\b|\bmicrosoft\s+teams\b|\b(link\s+geral|via\s+link)\b/;
  const eventText=[event.title,event.type,event.city,event.venue,event.address,event.description,event.notes].filter(Boolean).join(' ');
  const hasOnlineEvidence=onlinePattern.test(normalizedSearchText(eventText));
  const venueText=normalizedSearchText(event.venue||'')
    .replace(/\b(online|virtual|remot[oa]s?|zoom|webex|jitsi|link\s+geral|via\s+link|link\s+dos?\s+organizadores)\b|google\s+meet|microsoft\s+teams/g,' ')
    .replace(/[\s/;,.-]+/g,' ')
    .trim();
  const hasConcreteVenue=Boolean(venueText)&&!/^local nao informado(?: no poster)?$/.test(venueText)&&!/^nao informado$/.test(venueText);
  const hasMappedCoordinates=Number.isFinite(event.lat)&&Number.isFinite(event.lng);
  const hasExplicitPhysicalEvidence=Boolean(event.address?.trim())||hasConcreteVenue||/\bpresencial(?:mente)?\b/.test(normalizedSearchText([event.venue,event.notes,event.description].filter(Boolean).join(' ')));
  const hasPhysicalEvidence=hasExplicitPhysicalEvidence||(
    Number.isFinite(event.lat)&&Number.isFinite(event.lng)
  );

  if(hasOnlineEvidence&&hasExplicitPhysicalEvidence)return 'Híbrido';
  if(hasOnlineEvidence)return 'Virtual';
  if(hasPhysicalEvidence||hasMappedCoordinates)return 'Presencial';
  return 'Não informado';
}
function physicalCitiesForEvent(event:MobilizationEvent,modality=deriveEventModality(event)){
  if(modality==='Virtual'||modality==='Não informado')return [];
  const city=event.city.trim();
  const normalizedCity=normalizedSearchText(city);
  if(/\bcidade nao (especificada|identificada)\b/.test(normalizedCity))return [];
  if(/\bonline\b/.test(normalizedCity)){
    return city.split(/\s*\/\s*/).map(part=>part.trim()).filter(part=>part&&!/\b(online|virtual)\b/i.test(part));
  }
  return city?[city]:[];
}
function matchesAgendaFilters(event:MobilizationEvent,filters:FiltersState,today:string,lastDay:string,skip?:AgendaFilterField){
  if(!event.public)return false;
  const modality=deriveEventModality(event);
  if(skip!=='modality'&&filters.modality&&modality!==filters.modality)return false;
  const ignorePhysicalLocation=filters.modality==='Virtual'&&modality==='Virtual';
  if(skip!=='state'&&filters.state&&!ignorePhysicalLocation&&((modality!=='Presencial'&&modality!=='Híbrido')||event.state!==filters.state))return false;
  if(skip!=='city'&&filters.city&&!ignorePhysicalLocation&&!physicalCitiesForEvent(event,modality).includes(filters.city))return false;
  if(skip!=='type'&&filters.type&&event.type!==filters.type)return false;
  if(filters.search&&!`${event.title} ${event.city} ${event.state} ${event.venue} ${event.type}`.toLowerCase().includes(filters.search.trim().toLowerCase()))return false;
  if(filters.period==='today'&&event.date!==today)return false;
  if(filters.period==='7days'&&(event.date<today||event.date>lastDay))return false;
  if(filters.period==='upcoming'&&event.date<today)return false;
  return true;
}
function agendaFilterOptions(events:MobilizationEvent[],filters:FiltersState,today:string,lastDay:string,field:AgendaFilterField){
  const options=[...new Set(events.filter(event=>matchesAgendaFilters(event,filters,today,lastDay,field)).flatMap(event=>{
    if(field==='city')return physicalCitiesForEvent(event);
    if(field==='modality'){
      const modality=deriveEventModality(event);
      return modality==='Não informado'?[]:[modality];
    }
    const value=event[field];
    if(field==='state'&&deriveEventModality(event)==='Virtual')return [];
    return value?[value]:[];
  }))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const selected=filters[field];
  return selected&&!options.includes(selected)?[selected,...options]:options;
}

function Layout({children}:{children:ReactNode}){
  const[open,setOpen]=useState(false);
  const location=useLocation();
  return <div className="app-shell">
    <header className="site-header">
      <div className="container nav">
        <Link to="/" className="brand" onClick={()=>setOpen(false)}>
          <span className="brand-mark"><img src="/agenda-fist.svg" alt="" width="30" height="30"/></span>
          <span>Agenda de Mobilizações</span>
        </Link>
        <button className="mobile-menu" onClick={()=>setOpen(!open)} aria-label={open?'Fechar menu':'Abrir menu'} aria-expanded={open}>{open?<X/>:<Menu/>}</button>
        <nav className={open?'nav-links nav-open':'nav-links'} aria-label="Navegação principal">
          <Link onClick={()=>setOpen(false)} to="/">Agenda</Link>
          <Link onClick={()=>setOpen(false)} to="/calendario">Calendário</Link>
          <Link onClick={()=>setOpen(false)} to="/mapa">Mapa</Link>
          <Link onClick={()=>setOpen(false)} to="/divulgar">Divulgar</Link>
          <Link onClick={()=>setOpen(false)} to="/chat">Chat</Link>
          <Link onClick={()=>setOpen(false)} to="/sobre">Sobre</Link>
          <Link onClick={()=>setOpen(false)} className="admin-link" to="/admin">Admin</Link>
          {location.pathname==='/admin'&&<Link onClick={()=>setOpen(false)} to="/admin/moderacao">Moderação comunitária</Link>}
        </nav>
      </div>
    </header>
    <main>{children}</main>
    <footer className="footer"><div className="container footer-inner"><span>Projeto independente de organização e divulgação de mobilizações.</span></div></footer>
  </div>
}

function Home({events}:{events:MobilizationEvent[]}){
  const today=localDateKey();
  const lastDate=new Date();
  lastDate.setDate(lastDate.getDate()+7);
  const lastDay=localDateKey(lastDate);
  const[filters,setFilters]=useState<FiltersState>({search:'',state:'',city:'',type:'',period:'upcoming',modality:''});
  const states=useMemo(()=>agendaFilterOptions(events,filters,today,lastDay,'state'),[events,filters,today,lastDay]);
  const cities=useMemo(()=>agendaFilterOptions(events,filters,today,lastDay,'city'),[events,filters,today,lastDay]);
  const types=useMemo(()=>agendaFilterOptions(events,filters,today,lastDay,'type'),[events,filters,today,lastDay]);
  const modalities:AgendaModality[]=['Presencial','Virtual','Híbrido'];
  const filtered=useMemo(()=>events.filter(event=>matchesAgendaFilters(event,filters,today,lastDay)),[events,filters,today,lastDay]);
  const[attendance,setAttendance]=useState<Record<string,{count:number;attending:boolean}>>({});
  useEffect(()=>{
    const ids=events.map(e=>e.db_id).filter((id):id is string=>Boolean(id));
    getAttendanceStatus(ids).then(setAttendance).catch(()=>setAttendance({}));
  },[events]);
  const handleAttendance=async(event:MobilizationEvent)=>{
    if(!event.db_id)return;
    try{
      const next=await toggleEventAttendance(event.db_id);
      setAttendance(prev=>({...prev,[event.db_id!]:next}));
    }catch(error){
      const message=error instanceof Error?error.message:'Não foi possível atualizar sua presença.';
      if(message.includes('AUTH_REQUIRED')) window.location.href=`/entrar?next=${encodeURIComponent('/evento/'+event.id)}`;
      else alert(message);
    }
  };
  return <><section className="hero"><div className="container hero-grid"><div><div className="eyebrow"><Star className="red-star" size={15} fill="currentColor" aria-hidden="true"/> AGENDA DE MOBILIZAÇÕES</div><h1>Eventos e mobilizações pelo Brasil.</h1><p>Agenda de atos, manifestações, plenárias e encontros em apoio à candidatura de Luiz Inácio Lula da Silva no segundo turno das eleições de 2026, organizados por data e cidade e acompanhados de fontes para conferência.</p><div className="hero-actions"><Link to="/calendario" className="button primary"><CalendarDays size={18}/>Ver calendário</Link><Link to="/divulgar" className="button ghost"><ImageIcon size={18}/>Criar divulgação</Link><Link to="/chat" className="button ghost"><MessageCircle size={18}/>Enviar atualização</Link></div></div><div className="hero-card"><div className="hero-stat"><strong>{events.length}</strong><span>eventos públicos</span></div><div className="hero-stat"><strong>{states.length}</strong><span>estados representados</span></div><div className="hero-stat"><strong>{events.filter(e=>e.status!=='warning').length}</strong><span>sem alerta de divergência</span></div></div></div></section><section className="container section"><Filters value={filters} onChange={setFilters} states={states} cities={cities} types={types} modalities={modalities}/><div className="section-head"><div><div className="eyebrow">AGENDA</div><h2>{filtered.length} evento{filtered.length===1?'':'s'}</h2></div><div className="legend">Informação rastreável</div></div><div className="event-grid">{filtered.map(e=><EventCard key={e.id} event={e} attendance={e.db_id?attendance[e.db_id]:undefined} onAttendance={()=>handleAttendance(e)}/>)}</div>{!filtered.length&&<div className="empty"><Info/><h3>Nenhum evento encontrado</h3><p>Tente outro termo ou remova alguns filtros.</p></div>}</section></>
}

function escapeIcsText(value:string){
  return value.replace(/\\/g,'\\\\').replace(/\r\n|\n|\r/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
}

function foldIcsLine(value:string){
  const encoder=new TextEncoder();
  const lines:string[]=[];
  let line='';
  let bytes=0;
  for(const character of value){
    const characterBytes=encoder.encode(character).length;
    if(bytes+characterBytes>75){
      lines.push(line);
      line=' '+character;
      bytes=1+characterBytes;
    }else{
      line+=character;
      bytes+=characterBytes;
    }
  }
  lines.push(line);
  return lines.join('\r\n');
}

function buildEventIcs(event:MobilizationEvent,eventUrl:string){
  const date=event.date.replace(/-/g,'');
  const time=event.time||event.time_label?.match(/\d{1,2}:\d{2}/)?.[0];
  const [year,month,day]=event.date.split('-').map(Number);
  const nextDate=new Date(Date.UTC(year,month-1,day+1)).toISOString().slice(0,10).replace(/-/g,'');
  const lines=[
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Radar de Mobilizacoes//Agenda//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  if(time){
    const [hour,minute]=time.split(':').map(Number);
    const end=new Date(Date.UTC(year,month-1,day,hour,minute+120));
    const formatDateTime=(dateValue:Date)=>dateValue.toISOString().slice(0,16).replace(/[-:]/g,'')+'00';
    lines.push(
      'BEGIN:VTIMEZONE',
      'TZID:America/Sao_Paulo',
      'X-LIC-LOCATION:America/Sao_Paulo',
      'BEGIN:STANDARD',
      'DTSTART:19700101T000000',
      'TZOFFSETFROM:-0300',
      'TZOFFSETTO:-0300',
      'TZNAME:BRT',
      'END:STANDARD',
      'END:VTIMEZONE',
      'BEGIN:VEVENT',
      'UID:'+escapeIcsText(event.id)+'@radar-mobilizacoes',
      'DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'),
      'DTSTART;TZID=America/Sao_Paulo:'+date+'T'+String(hour).padStart(2,'0')+String(minute).padStart(2,'0')+'00',
      'DTEND;TZID=America/Sao_Paulo:'+formatDateTime(end),
    );
  }else{
    lines.push(
      'BEGIN:VEVENT',
      'UID:'+escapeIcsText(event.id)+'@radar-mobilizacoes',
      'DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'),
      'DTSTART;VALUE=DATE:'+date,
      'DTEND;VALUE=DATE:'+nextDate,
    );
  }

  const location=[event.address,event.venue,event.city,event.state,'Brasil'].filter(Boolean).join(', ');
  const description=[event.description,event.notes].filter(Boolean).join('\n\n');
  lines.push('SUMMARY:'+escapeIcsText(event.title));
  if(location)lines.push('LOCATION:'+escapeIcsText(location));
  if(description)lines.push('DESCRIPTION:'+escapeIcsText(description));
  lines.push('URL:'+eventUrl,'END:VEVENT','END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n')+'\r\n';
}

function EventPage({events,sources}:{events:MobilizationEvent[];sources:EventSource[]}){  const{id}=useParams();
  const event=events.find(e=>e.id===id);
  const[attendance,setAttendance]=useState({count:0,attending:false});
  const[attendanceBusy,setAttendanceBusy]=useState(false);
  const[attendanceError,setAttendanceError]=useState('');const[shareFeedback,setShareFeedback]=useState('');

  useEffect(()=>{
    if(!event?.db_id){
      setAttendance({count:0,attending:false});
      return;
    }
    setAttendanceError('');
    getAttendanceStatus([event.db_id])
      .then(result=>setAttendance(result[event.db_id!]??{count:0,attending:false}))
      .catch(error=>setAttendanceError(error instanceof Error?error.message:'Não foi possível carregar os participantes.'));
  },[event?.db_id]);

  useEffect(()=>{
    if(!event)return;
    const defaultTitle='Agenda de Mobilizações';
    const defaultDescription='Agenda pública e rastreável de mobilizações no Brasil.';
    const defaultImage=window.location.origin+'/agenda-fist.svg';
    const nextTitle=event.title+' · '+event.city+(event.state?', '+event.state:'')+' | Agenda de Mobilizações';
    const nextDescription=event.title+' · '+event.city+(event.state?', '+event.state:'')+'. '+(event.time_label||event.time||'Horário não informado')+' · '+event.venue+'.';
    const nextImage=event.image_url||defaultImage;
    const canonicalUrl=window.location.href.split('#')[0];
    const metaDefinitions=[
      ['name','description',nextDescription],
      ['property','og:title',nextTitle],
      ['property','og:description',nextDescription],
      ['property','og:type','article'],
      ['property','og:url',canonicalUrl],
      ['property','og:image',nextImage],
      ['property','og:image:alt','Pôster de '+event.title],
      ['name','twitter:card','summary_large_image'],
      ['name','twitter:title',nextTitle],
      ['name','twitter:description',nextDescription],
      ['name','twitter:image',nextImage],
    ] as const;
    const previousMeta=new Map<string,{element:HTMLMetaElement|null;had:boolean;content:string}>();
    for(const item of metaDefinitions){
      const attribute=item[0];
      const key=item[1];
      const metaContent=item[2];
      const selector='meta['+attribute+'="'+key+'"]';
      const existing=document.head.querySelector<HTMLMetaElement>(selector);
      previousMeta.set(selector,{element:existing,had:Boolean(existing),content:existing?.content||''});
      const meta=existing||document.createElement('meta');
      meta.setAttribute(attribute,key);
      meta.content=metaContent;
      if(!existing)document.head.appendChild(meta);
    }
    const canonical=document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const previousCanonical={element:canonical,had:Boolean(canonical),href:canonical?.href||''};
    const canonicalLink=canonical||document.createElement('link');
    canonicalLink.rel='canonical';
    canonicalLink.href=canonicalUrl;
    if(!canonical)document.head.appendChild(canonicalLink);
    document.title=nextTitle;
    const existingSchema=document.head.querySelector<HTMLScriptElement>('script[data-agenda-event-schema]');
    const previousSchema=existingSchema?.textContent||null;
    const schema=existingSchema||document.createElement('script');
    schema.type='application/ld+json';
    schema.setAttribute('data-agenda-event-schema','true');
    schema.textContent=JSON.stringify({
      '@context':'https://schema.org',
      '@type':'Event',
      name:event.title,
      startDate:event.date+'T'+(event.time||'00:00'),
      eventStatus:'https://schema.org/EventScheduled',
      eventAttendanceMode:'https://schema.org/OfflineEventAttendanceMode',
      location:{'@type':'Place',name:event.venue,address:[event.address,event.city,event.state,'Brasil'].filter(Boolean).join(', ')},
      url:canonicalUrl,
      image:event.image_url||defaultImage,
      description:nextDescription,
    });
    if(!existingSchema)document.head.appendChild(schema);
    return()=>{
      document.title=defaultTitle;
      for(const [selector,state] of previousMeta){
        if(state.had&&state.element)state.element.content=state.content;
        else document.head.querySelector(selector)?.remove();
      }
      document.head.querySelector('meta[name="description"]')?.setAttribute('content',defaultDescription);
      if(previousCanonical.had&&previousCanonical.element)previousCanonical.element.href=previousCanonical.href;
      else document.head.querySelector('link[rel="canonical"]')?.remove();
      if(previousSchema!==null&&existingSchema)existingSchema.textContent=previousSchema;
      else document.head.querySelector('script[data-agenda-event-schema]')?.remove();
    };
  },[event]);

  const handleShare=async()=>{const url=window.location.href;const shareText=(event?.title||'Mobilização')+' · '+(event?.city||'')+(event?.state?', '+event.state:'');try{if(navigator.share){await navigator.share({title:event?.title||'Agenda de Mobilizações',text:shareText,url});return}if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);setShareFeedback('Link copiado.');window.setTimeout(()=>setShareFeedback(''),2200);return}setShareFeedback('Copie o endereço desta página para compartilhar.')}catch(error){if(error instanceof DOMException&&error.name==='AbortError')return;setShareFeedback('Não foi possível compartilhar automaticamente.')}};

  const handleAttendance=async()=>{
    if(!event?.db_id||attendanceBusy)return;
    setAttendanceBusy(true);
    setAttendanceError('');
    try{
      const next=await toggleEventAttendance(event.db_id);
      setAttendance(next);
    }catch(error){
      const message=error instanceof Error?error.message:'Não foi possível atualizar sua presença.';
      setAttendanceError(message);
    }finally{
      setAttendanceBusy(false);
    }
  };

  if(!event)return <div className="container detail-page">
    <div className="empty">
      <Info size={22}/>
      <h2>Evento não encontrado</h2>
      <p>Este evento não está disponível ou o link pode estar incorreto.</p>
      <div className="event-action-row">
        <Link className="button primary" to="/">Voltar para a agenda</Link>
        <Link className="button ghost" to="/calendario">Abrir calendário</Link>
      </div>
    </div>
  </div>;

  const ss=sources.filter(s=>event.source_ids.includes(s.id));
  const concreteEventLocation=hasSpecificEventLocation(event.venue,event.address,event.city)||(typeof event.lat==='number'&&Number.isFinite(event.lat)&&typeof event.lng==='number'&&Number.isFinite(event.lng));
  const directionsQuery=[event.address,concreteEventLocation?event.venue:'',event.city,event.state,'Brasil'].filter(Boolean).join(', ');
  const hasCoordinates=typeof event.lat==='number'&&Number.isFinite(event.lat)&&typeof event.lng==='number'&&Number.isFinite(event.lng);
  const directionsUrl=hasCoordinates
    ?'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(event.lat+','+event.lng)
    :concreteEventLocation
      ?'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(directionsQuery)
      :'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(directionsQuery);
  const calendarDate=event.date.replace(/-/g,'');
  const calendarStartTime=event.time ? event.time.replace(':','')+'00' : '000000';
  const calendarStart=calendarDate+'T'+calendarStartTime;
  const calendarEndTime=event.time ? (()=>{const [h,m]=event.time.split(':').map(Number);const end=new Date(2000,0,1,h,m);end.setMinutes(end.getMinutes()+120);return String(end.getHours()).padStart(2,'0')+String(end.getMinutes()).padStart(2,'0')+'00'})() : '235900';
  const calendarEnd=calendarDate+'T'+calendarEndTime;
  const calendarDetails=[
    'Evento da Agenda de Mobilizações.',
    event.type ? 'Tipo: '+event.type+'.' : '',
    event.notes ? event.notes : '',
    'Fonte: '+window.location.href,
  ].filter(Boolean).join(' ');
  const calendarUrl='https://calendar.google.com/calendar/render?action=TEMPLATE&text='+encodeURIComponent(event.title)+'&dates='+calendarStart+'/'+calendarEnd+'&details='+encodeURIComponent(calendarDetails)+'&location='+encodeURIComponent(directionsQuery)+'&ctz=America%2FSao_Paulo';
  const downloadIcs=()=>{
    const eventUrl=new URL('/evento/'+encodeURIComponent(event.id),window.location.origin).href;
    const blob=new Blob([buildEventIcs(event,eventUrl)],{type:'text/calendar;charset=utf-8'});
    const objectUrl=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=objectUrl;
    link.download='mobilizacao-'+event.id.replace(/[^a-zA-Z0-9_-]+/g,'-')+'.ics';
    link.click();
    window.setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
  };

  return <div className="container detail-page">
    <Link to="/" className="back-link">← Voltar para a Agenda</Link>
    <div className="detail-grid">
      <div className="detail-main">
        <div className="detail-state-head">
          <div><div className="eyebrow">{event.type} · {event.state||'Brasil'}</div><p className="detail-location">{event.city}{event.state?', '+event.state:''}</p></div>
        </div>
        <h1>{event.title}</h1>
        <div className="detail-meta">
          <div>📅 {fmtDate(event.date)}</div>
          <div>🕐 {event.time_label||event.time||'Horário não informado'}</div>
          <div>📍 {concreteEventLocation?(event.venue||event.address):'Local específico a confirmar'}</div>
          {event.address&&<div>⌖ {event.address}</div>}
        </div>
        {event.description&&<p>{event.description}</p>}
        {!concreteEventLocation&&<p className="community-explainer">O ponto exato ainda não está confirmado. O mapa pesquisa a cidade, não um endereço específico.</p>}
        <div className="detail-attendance">
          <div className="detail-participants">
            <Users size={20}/>
            <div><strong>{formatParticipants(attendance.count)}</strong><span> participante{attendance.count===1?'':'s'}</span></div>
          </div>
          <button type="button" className={attendance.attending?'going-button active':'going-button'} onClick={handleAttendance} disabled={!event.db_id||attendanceBusy} aria-pressed={attendance.attending}>
            {attendance.attending?<Check size={16}/>:<Users size={16}/>} {attendanceBusy?'Atualizando…':attendance.attending?'Eu vou':'Eu Vou'}
          </button>
        </div>
        {attendanceError&&<div className="callout warning"><Info size={18}/><span>{attendanceError}</span></div>}
        <div className="event-action-row"><a className="button ghost directions-button" href={directionsUrl} target="_blank" rel="noreferrer"><MapPinned size={17}/>{concreteEventLocation?'Como chegar':'Localizar cidade no Maps'}</a><button type="button" className="button ghost" onClick={downloadIcs}><CalendarPlus size={17}/>Adicionar ao calendário</button><a className="button primary reminder-button" href={calendarUrl} target="_blank" rel="noreferrer"><CalendarDays size={17}/>Definir lembrete</a><Link className="button ghost" to={'/divulgar?eventos='+encodeURIComponent(event.id)}><ImageIcon size={17}/>Divulgar</Link></div>
        {event.notes&&<div className={event.status==='warning'?'callout warning':'callout info'}><Info size={20}/><span>{event.notes}</span></div>}
        <EventCommunity eventSlug={event.id}/>
        {event.image_url&&<PosterActions event={event}/>}
        <h2>Fontes</h2>
        {ss.length?<div className="source-list">{ss.map(s=><a className="source-item" key={s.id} href={s.url} target="_blank" rel="noreferrer"><div><strong>{s.account_name}</strong><small>{s.account_handle??s.platform}</small></div><ExternalLink size={17}/></a>)}</div>:<div className="empty-source">As fontes deste evento ainda não foram carregadas.</div>}
      </div>
      <aside className="detail-side">
        <div className="share-card quick-share-card"><strong>Compartilhe este evento</strong><p>Envie a página diretamente para WhatsApp, Telegram ou outro aplicativo do seu celular.</p><button type="button" className="button primary" onClick={handleShare}><Share2 size={17}/>Compartilhar evento</button>{shareFeedback&&<small className="share-feedback" aria-live="polite">{shareFeedback}</small>}</div>
        <div className="status-card"><div className="status-icon"><CheckCircle2/></div><h3>Rastreabilidade</h3><p>O evento foi incluído com base em publicações e materiais de origem identificados na pesquisa editorial.</p></div>
        <div className="share-card"><strong>Encontrou alguma atualização?</strong><p>Avise no chat. Um administrador revisará a sugestão antes de ela alterar o radar público.</p><Link className="button primary" to="/chat"><MessageCircle size={17}/>Enviar atualização</Link></div>
      </aside>
    </div>
  </div>
}

function CalendarPage({events}:{events:MobilizationEvent[]}){
  const publicEvents=events.filter(e=>e.public);
  const getLocalDateKey=()=>{
    const d=new Date();
    return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  };
  const today=getLocalDateKey();
  const[selectedDate,setSelectedDate]=useState(today);
  const[query,setQuery]=useState('');

  const shiftDate=(days:number)=>{
    setSelectedDate(current=>{
      const d=new Date(current+'T12:00:00');
      d.setDate(d.getDate()+days);
      return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
    });
  };

  const selectedDateObj=new Date(selectedDate+'T12:00:00');
  const dateLabel=selectedDateObj.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  const dateIndicatorLabel=selectedDate===today
    ?'Hoje'
    :String(selectedDateObj.getDate()).padStart(2,'0')+' '+selectedDateObj.toLocaleDateString('pt-BR',{month:'short'}).replace('.','');
  const normalized=query.trim().toLowerCase();
  const filtered=publicEvents.filter(e=>e.date===selectedDate&&(!normalized||(e.city+' '+(e.state||'')+' '+e.title+' '+e.venue).toLowerCase().includes(normalized)));
  const groups=Object.entries(filtered.reduce((a:Record<string,MobilizationEvent[]>,e)=>{(a[e.date]??=[]).push(e);return a},{})).sort(([a],[b])=>a.localeCompare(b));

  return <div className="container page">
    <div className="eyebrow"><Star className="red-star" size={15} fill="currentColor" aria-hidden="true"/> CALENDÁRIO DO SEGUNDO TURNO</div>
    <div className="calendar-heading">
      <div>
        <h1>{dateLabel.charAt(0).toUpperCase()+dateLabel.slice(1)}</h1>
        <p className="page-lead">Navegue dia a dia e encontre rapidamente uma cidade, estado, local ou evento.</p>
      </div>
      <div className={`calendar-nav${selectedDate===today?'':' has-return'}`} aria-label="Navegação do calendário">
        <button type="button" className="button ghost" onClick={e=>{e.preventDefault();shiftDate(-1)}} aria-label="Dia anterior" title="Dia anterior"><ChevronLeft size={17}/></button>
        <span className="calendar-current-date" aria-live="polite">{dateIndicatorLabel}</span>
        {selectedDate!==today&&<button type="button" className="button ghost" onClick={e=>{e.preventDefault();setSelectedDate(today)}} title="Voltar para hoje">Hoje</button>}
        <button type="button" className="button ghost" onClick={e=>{e.preventDefault();shiftDate(1)}} aria-label="Próximo dia" title="Próximo dia"><ChevronRight size={17}/></button>
      </div>
    </div>
    <div className="calendar-search">
      <Search size={19}/>
      <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar cidade, estado, local ou evento..." aria-label="Buscar no calendário"/>
      {query&&<button type="button" onClick={()=>setQuery('')} aria-label="Limpar busca">×</button>}
    </div>
    <div className="calendar-result-count">{filtered.length} evento{filtered.length===1?'':'s'} em {dateLabel}</div>
    {groups.map(([date,items])=><section className="day-group" key={date}>
      <div className="day-label">
        <strong>{new Date(date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'}).replace('.','')}</strong>
        <span>{items.length} evento{items.length===1?'':'s'}</span>
      </div>
      <div className="day-events">
        {items.sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99')).map(e=>
          <Link className="calendar-item" to={'/evento/'+e.id} key={e.id}>
            <div className="calendar-time">{e.time_label||e.time||'—'}</div>
            <div><strong>{e.city} · {e.state||'—'}</strong><span>{e.venue}</span></div>
            <span className="calendar-type">{e.type}</span>
          </Link>
        )}
      </div>
    </section>)}
    {!groups.length&&<div className="empty calendar-empty">      <Search/><h3>Nenhum evento encontrado</h3>
      <p>{query?'Tente outro termo de busca.':'Não há eventos públicos nesta data.'}</p>
    </div>}
  </div>
}

function MapPage({events}:{events:MobilizationEvent[]}){return <div className="container page"><div className="eyebrow"><Star className="red-star" size={15} fill="currentColor" aria-hidden="true"/> MAPA DE MOBILIZAÇÕES</div><h1>Mobilizações no Brasil</h1><p className="page-lead">Visualize eventos em apoio à candidatura de Lula no segundo turno, filtre por estado ou cidade e clique nos pontos para abrir cada evento. As coordenadas são as cadastradas editorialmente para cada mobilização.</p><MapView events={events.filter(e=>e.public)}/></div>}
function AboutPage(){return <div className="container page narrow"><div className="eyebrow"><Star className="red-star" size={15} fill="currentColor" aria-hidden="true"/> SOBRE A AGENDA</div><h1>Uma agenda pública de mobilizações eleitorais.</h1><p className="page-lead">A Agenda reúne eventos e mobilizações em apoio à candidatura de Luiz Inácio Lula da Silva no segundo turno das eleições de 2026, transformando informações espalhadas em uma agenda navegável, fácil de conferir e de atualizar.</p><div className="about-grid"><div><h2>Como funciona</h2><p>Cada evento tem data, horário, cidade, local, tipo e links para as fontes usadas na conferência.</p></div><div><h2>O que “verificado” significa</h2><p>Os campos essenciais foram comparados com uma ou mais publicações ou fontes identificáveis. Isso não substitui a checagem no dia do evento.</p></div><div><h2>Independente</h2><p>Este projeto não é oficial de campanha, partido, governo ou organização.</p></div><div><h2>Base editorial</h2><p>A primeira carga foi montada a partir das threads, pôsteres e fontes complementares identificadas na pesquisa.</p></div></div></div>}

function AuthPage(){
  const[mode,setMode]=useState<'login'|'signup'|'recover'|'reset'>('login');
  const[email,setEmail]=useState('');
  const[password,setPassword]=useState('');
  const[confirmPassword,setConfirmPassword]=useState('');
  const[displayName,setDisplayName]=useState('');
  const[msg,setMsg]=useState('');
  const[busy,setBusy]=useState(false);
  const navigate=useNavigate();
  const location=useLocation();
  const next=new URLSearchParams(location.search).get('next')||'/chat';

  useEffect(()=>{
    const params=new URLSearchParams(location.search);
    const hashParams=new URLSearchParams(window.location.hash.replace(/^#/,''));
    if(params.get('mode')==='reset'||hashParams.get('type')==='recovery')setMode('reset');
    if(!supabase)return;
    const{data}=supabase.auth.onAuthStateChange((event)=>{
      if(event==='PASSWORD_RECOVERY')setMode('reset');
    });
    return()=>data.subscription.unsubscribe();
  },[location.search]);

  if(!supabase)return <div className="container page narrow"><div className="callout warning"><Info/><span>O Supabase não está configurado neste ambiente.</span></div></div>;
  const db=supabase;

  const submit=async(e:FormEvent)=>{
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try{
      if(mode==='recover'){
        const{error}=await db.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+'/entrar?mode=reset&next='+encodeURIComponent(next)});
        if(error)setMsg(error.message);
        else setMsg('Enviamos um link para redefinir sua senha. Confira seu e-mail.');
      }else if(mode==='reset'){
        if(password!==confirmPassword)setMsg('As senhas não coincidem.');
        else{
          const{error}=await db.auth.updateUser({password});
          if(error)setMsg(error.message);
          else navigate(next);
        }
      }else if(mode==='login'){
        const{error}=await db.auth.signInWithPassword({email,password});
        if(error)setMsg(error.message);
        else navigate(next);
      }else{
        const{data,error}=await db.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+'/chat',data:{display_name:displayName||safeName(email)}}});
        if(error)setMsg(error.message);
        else if(data.session)navigate(next);
        else setMsg('Conta criada. Verifique seu e-mail para confirmar o cadastro e depois entre no chat.');
      }
    }finally{
      setBusy(false);
    }
  };

  const title=mode==='login'?'Entre para participar.':mode==='signup'?'Crie sua conta.':mode==='recover'?'Recupere sua senha.':'Defina uma nova senha.';
  const lead=mode==='reset'?'Use uma senha nova para voltar à Agenda.':'O chat exige login para reduzir spam e manter as sugestões sob moderação.';

  return <div className="container page narrow"><div className="eyebrow">{mode==='login'?'ENTRAR':mode==='signup'?'CRIAR CONTA':mode==='recover'?'RECUPERAÇÃO':'NOVA SENHA'}</div><h1>{title}</h1><p className="page-lead">{lead}</p><form className="auth-form" onSubmit={submit}>{mode==='signup'&&<input placeholder="Como quer aparecer no chat?" value={displayName} onChange={e=>setDisplayName(e.target.value)} autoComplete="name"/>}{mode!=='reset'&&<input type="email" placeholder="E-mail" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete={mode==='recover'?'email':'username'}/>} {(mode==='login'||mode==='signup'||mode==='reset')&&<input type="password" placeholder="Senha" value={password} onChange={e=>setPassword(e.target.value)} minLength={6} required autoComplete={mode==='reset'?'new-password':mode==='login'?'current-password':'new-password'}/>} {mode==='reset'&&<input type="password" placeholder="Confirme a nova senha" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} minLength={6} required autoComplete="new-password"/>}<button className="button primary" disabled={busy}>{busy?'Aguarde…':mode==='login'?'Entrar':mode==='signup'?'Criar conta':mode==='recover'?'Enviar link de recuperação':'Salvar nova senha'}</button>{msg&&<div className="callout info"><Info size={18}/><span>{msg}</span></div>}</form>{mode==='login'&&<button className="auth-forgot" onClick={()=>{setMode('recover');setMsg('')}}><KeyRound size={16}/>Esqueci minha senha</button>}{mode==='login'&&<button className="mode-switch" onClick={()=>{setMode('signup');setMsg('')}}><UserPlus size={16}/>Criar uma conta</button>}{mode==='signup'&&<button className="mode-switch" onClick={()=>{setMode('login');setMsg('')}}><LogIn size={16}/>Já tenho uma conta</button>}{(mode==='recover'||mode==='reset')&&<button className="mode-switch" onClick={()=>{setMode('login');setMsg('')}}><LogIn size={16}/>Voltar para entrar</button>}</div>
}

function ChatPage(){
  const[user,setUser]=useState<any>(null);const[loading,setLoading]=useState(true);const[messages,setMessages]=useState<ChatMessage[]>([]);const[text,setText]=useState('');const[displayName,setDisplayName]=useState('');const[busy,setBusy]=useState(false);const[notice,setNotice]=useState('');const[showSubmission,setShowSubmission]=useState(false);const[sub,setSub]=useState({title:'',date:'',time:'',time_label:'',city:'',state:'',venue:'',message:''});const[file,setFile]=useState<File|null>(null);const navigate=useNavigate();
  useEffect(()=>{if(!supabase){setLoading(false);return}supabase.auth.getUser().then(({data})=>{setUser(data.user);if(data.user)setDisplayName(data.user.user_metadata?.display_name||safeName(data.user.email));setLoading(false)});const{data}=supabase.auth.onAuthStateChange((_e,s)=>{setUser(s?.user??null);if(s?.user)setDisplayName(s.user.user_metadata?.display_name||safeName(s.user.email))});return()=>data.subscription.unsubscribe()},[]);
  const loadMessages=async()=>{if(!supabase||!user)return;const{data,error}=await supabase.from('chat_messages').select('*').order('created_at',{ascending:true}).limit(150);if(!error&&data)setMessages(data as ChatMessage[])};
  useEffect(()=>{if(user)loadMessages()},[user]);
  useEffect(()=>{if(!user)return;const id=window.setInterval(loadMessages,8000);return()=>window.clearInterval(id)},[user]);
  if(loading)return <div className="loading"><div className="spinner"/>Carregando chat…</div>;
  if(!user)return <div className="container page narrow"><div className="eyebrow">CHAT</div><h1>Converse e envie atualizações.</h1><p className="page-lead">Para participar, entre com uma conta. As mensagens ficam sob moderação antes de aparecerem para outras pessoas.</p><div className="chat-login-card"><ShieldCheck size={28}/><div><strong>Sem cadastro público aberto.</strong><p>Isso reduz spam e facilita a triagem de novos eventos.</p></div><Link className="button primary" to="/entrar?next=/chat">Entrar / criar conta</Link></div></div>;
  const send=async(e:FormEvent)=>{e.preventDefault();if(!text.trim()||!supabase)return;setBusy(true);const{error}=await supabase.from('chat_messages').insert({user_id:user.id,display_name:displayName||safeName(user.email),content:text.trim(),status:'pending'});if(error)setNotice(error.message);else{setText('');setNotice('Mensagem enviada para moderação.')}setBusy(false);loadMessages()};
  const sendSubmission=async(e:FormEvent)=>{e.preventDefault();if(!supabase||!sub.title.trim())return;setBusy(true);setNotice('');if(file&&file.size>8*1024*1024){setNotice('O pôster deve ter no máximo 8 MB.');setBusy(false);return}let posterPath:string|null=null;if(file){const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');posterPath=`${user.id}/${crypto.randomUUID()}.${ext}`;const{error}=await supabase.storage.from(SUBMISSION_STORAGE_BUCKET).upload(posterPath,file,{upsert:false,contentType:file.type});if(error){setNotice(`Falha no pôster: ${error.message}`);setBusy(false);return}}
    const{error}=await supabase.from('event_submissions').insert({user_id:user.id,display_name:displayName||safeName(user.email),title:sub.title.trim(),date:sub.date||null,time:sub.time||null,time_label:sub.time_label||null,city:sub.city.trim()||null,state:sub.state.trim().toUpperCase()||null,venue:sub.venue.trim()||null,message:sub.message.trim()||null,poster_path:posterPath,status:'pending'});
    if(error)setNotice(error.message);else{setNotice('Envio recebido. Um administrador vai revisar antes de publicar.');setSub({title:'',date:'',time:'',time_label:'',city:'',state:'',venue:'',message:''});setFile(null);setShowSubmission(false)}setBusy(false)};
  return <div className="container page"><div className="chat-header"><div><div className="eyebrow">CHAT</div><h1>Central de atualizações</h1><p className="page-lead">Converse com outras pessoas e envie novos eventos. Sugestões de evento ficam em uma fila privada até a revisão.</p></div><button className="button ghost" onClick={()=>supabase?.auth.signOut()}>Sair</button></div>{notice&&<div className="callout info"><Info/><span>{notice}</span></div>}<div className="chat-layout"><section className="chat-card"><div className="chat-messages">{messages.length?messages.map(m=><div key={m.id} className={m.status==='pending'?'chat-message pending':'chat-message'}><div className="chat-message-head"><strong>{m.display_name}</strong><span>{new Date(m.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span></div><p>{m.content}</p>{m.status==='pending'&&m.user_id===user.id&&<small>Aguardando moderação.</small>}</div>):<div className="empty"><MessageCircle/><h3>Ninguém falou ainda.</h3><p>Seja a primeira pessoa a abrir a conversa.</p></div>}</div><form className="chat-composer" onSubmit={send}><textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Escreva uma mensagem…" rows={3}/><div className="chat-composer-footer"><input className="chat-name" value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Nome no chat"/><button className="button primary" disabled={busy||!text.trim()}><Send size={17}/>{busy?'Enviando…':'Enviar'}</button></div></form></section><aside className="chat-side"><div className="submission-card"><div className="submission-icon"><Paperclip/></div><h3>Encontrou um novo evento?</h3><p>Envie data, local e o pôster. O administrador recebe tudo em uma caixa de revisão.</p><button className="button primary" onClick={()=>setShowSubmission(!showSubmission)}>{showSubmission?'Fechar formulário':'Enviar novo evento'}</button>{showSubmission&&<form className="submission-form" onSubmit={sendSubmission}><input placeholder="Título do evento" value={sub.title} onChange={e=>setSub({...sub,title:e.target.value})} required/><div className="two-col"><input type="date" value={sub.date} onChange={e=>setSub({...sub,date:e.target.value})}/><input type="time" value={sub.time} onChange={e=>setSub({...sub,time:e.target.value})}/></div><input placeholder="Rótulo do horário (opcional: 16h concentração / 17h saída)" value={sub.time_label} onChange={e=>setSub({...sub,time_label:e.target.value})}/><div className="two-col"><input placeholder="Cidade" value={sub.city} onChange={e=>setSub({...sub,city:e.target.value})}/><input placeholder="UF" maxLength={2} value={sub.state} onChange={e=>setSub({...sub,state:e.target.value.toUpperCase()})}/></div><input placeholder="Local / endereço" value={sub.venue} onChange={e=>setSub({...sub,venue:e.target.value})}/><textarea placeholder="Contexto, fonte ou observações" value={sub.message} onChange={e=>setSub({...sub,message:e.target.value})} rows={4}/><label className="file-pick"><ImageIcon size={17}/><span>{file?file.name:'Anexar pôster'}</span><input type="file" accept="image/*" onChange={(e:ChangeEvent<HTMLInputElement>)=>setFile(e.target.files?.[0]||null)}/></label><button className="button primary" disabled={busy}>{busy?'Enviando…':'Enviar para revisão'}</button></form>}</div><div className="moderation-note"><ShieldCheck size={18}/><span>Mensagens públicas podem ser moderadas, rejeitadas ou marcadas como spam.</span></div></aside></div></div>
}

function AdminPage(){
  const db=supabase!;
  const[user,setUser]=useState<any>(null);const[loading,setLoading]=useState(true);const[authorized,setAuthorized]=useState(false);const[events,setEvents]=useState<MobilizationEvent[]>([]);const[sources,setSources]=useState<EventSource[]>([]);const[submissions,setSubmissions]=useState<Submission[]>([]);const[chatPending,setChatPending]=useState<ChatMessage[]>([]);const[editing,setEditing]=useState<MobilizationEvent|null>(null);const[posterFile,setPosterFile]=useState<File|null>(null);const[posterPreview,setPosterPreview]=useState<string|null>(null);const[indexingPosters,setIndexingPosters]=useState(false);const[posterIndexProgress,setPosterIndexProgress]=useState('');const[message,setMessage]=useState('');const[saving,setSaving]=useState(false);const[submitting,setSubmitting]=useState<string|null>(null);const[subPosterUrls,setSubPosterUrls]=useState<Record<string,string>>({});const[adminQuery,setAdminQuery]=useState('');const[adminDate,setAdminDate]=useState('');const[adminStatus,setAdminStatus]=useState('');const[analyticsRows,setAnalyticsRows]=useState<PageViewRow[]>([]);const[geoBusy,setGeoBusy]=useState(false);const[geoOptions,setGeoOptions]=useState<any[]>([]);
const blank=():MobilizationEvent=>({
  id:'',
  title:'',
  type:'Manifestação',
  date:'',
  time:'',
  time_label:'',
  city:'',
  state:'',
  venue:'',
  description:'',
  status:'pending',
  public:false,
  source_ids:[ADMIN_SOURCE_FALLBACK],
  lat:null,
  lng:null,
  image_url:null,
  notes:''
});
 const loadAdmin=async()=>{
    if(!db||!user)return;
    try{
      const[{data:membership,error:membershipError},{data:subData,error:subError},{data:chatData,error:chatError}]=await Promise.all([
        db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle(),
        db.from('event_submissions').select('*').eq('status','pending').order('created_at',{ascending:false}),
        db.from('chat_messages').select('*').eq('status','pending').order('created_at',{ascending:false})
      ]);
      if(membershipError)throw membershipError;
      if(!membership){
        setAuthorized(false);
        setMessage('Sua conta está autenticada, mas ainda não está vinculada como administradora.');
        setLoading(false);
        return;
      }
      setAuthorized(true);
      setSubmissions((subData||[]) as Submission[]);
      setChatPending((chatData||[]) as ChatMessage[]);
      const[e,s]=await Promise.all([getAdminEvents(),getSources()]);
      setEvents(e);
      setSources(s);
      if(subError)setMessage(subError.message);
      else if(chatError)setMessage(chatError.message);
      const cutoff=new Date(Date.now()-30*864e5).toISOString();
      const{data:analyticsData,error:analyticsError}=await db.from('page_views').select('path,event_id,visitor_id,created_at').gte('created_at',cutoff).order('created_at',{ascending:false}).limit(10000);
      if(analyticsError) setMessage(analyticsError.message);
      setAnalyticsRows((analyticsData||[]) as PageViewRow[]);
      for(const item of (subData||[]) as Submission[]){
        if(item.poster_path&&!subPosterUrls[item.id]){
          const{data}=await db.storage.from(SUBMISSION_STORAGE_BUCKET).createSignedUrl(item.poster_path,3600);
          if(data?.signedUrl)setSubPosterUrls(prev=>({...prev,[item.id]:data.signedUrl}));
        }
      }
    }catch(error){
      setAuthorized(false);
      setMessage(error instanceof Error?error.message:'Não foi possível carregar o painel administrativo.');
    }finally{
      setLoading(false);
    }
  };
  useEffect(()=>{if(!supabase){setLoading(false);return}supabase.auth.getUser().then(({data})=>{setUser(data.user);setLoading(false)});const{data}=supabase.auth.onAuthStateChange((_e,s)=>setUser(s?.user??null));return()=>data.subscription.unsubscribe()},[]);
  useEffect(()=>{if(!user)return;loadAdmin();const id=window.setInterval(loadAdmin,10000);return()=>window.clearInterval(id)},[user]);
  const filteredAdminEvents=events.filter(e=>{
    const haystack=(e.title+' '+e.city+' '+e.state+' '+e.venue).toLowerCase();
    if(adminQuery.trim()&&!haystack.includes(adminQuery.trim().toLowerCase()))return false;
    if(adminDate&&e.date!==adminDate)return false;
    if(adminStatus&&e.status!==adminStatus)return false;
    return true;
  });

  const now=Date.now();
  const todayStart=new Date();
  todayStart.setHours(0,0,0,0);
  const last7=analyticsRows.filter(r=>new Date(r.created_at).getTime()>=now-7*864e5);
  const today=last7.filter(r=>new Date(r.created_at).getTime()>=todayStart.getTime());
  const visitors=new Set(last7.map(r=>r.visitor_id));
  const pages=new Map<string,number>();
  const eventsMap=new Map<string,number>();
  for(const row of last7){
    pages.set(row.path,(pages.get(row.path)||0)+1);
    if(row.event_id)eventsMap.set(row.event_id,(eventsMap.get(row.event_id)||0)+1);
  }
  const topPages=[...pages.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
  const topEvents=[...eventsMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([eventId,count])=>{
    const event=events.find(e=>e.db_id===eventId);
    return {eventId,count,title:event?.title||'Evento removido',city:event?.city||''};
  });
  const analyticsSummary={today:today.length,last7:last7.length,uniqueVisitors:visitors.size,topPages,topEvents};
  const dailyAnalytics=Array.from({length:7},(_,offset)=>{
    const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-(6-offset));
    const next=new Date(d);next.setDate(next.getDate()+1);
    const count=last7.filter(r=>{const t=new Date(r.created_at);return t>=d&&t<next}).length;
    return {label:d.toLocaleDateString('pt-BR',{weekday:'short'}).replace('.',''),date:d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}),count};
  });
  const maxDaily=Math.max(1,...dailyAnalytics.map(d=>d.count));

  if(loading)return <div className="loading"><div className="spinner"/>Carregando painel…</div>;
  if(!supabase)return <div className="container page narrow"><div className="eyebrow">ADMIN</div><h1>Painel editorial</h1><div className="callout warning"><Info/><span>Conecte o Supabase pelo .env para ativar o painel.</span></div></div>;
  if(!user)return <div className="container page narrow"><div className="eyebrow">ADMIN</div><h1>Entrar</h1><p className="page-lead">Use a conta do Supabase marcada como administradora.</p><Link className="button primary" to="/entrar?next=/admin"><LogIn size={17}/>Entrar</Link></div>;
  if(!authorized)return <div className="container page narrow"><div className="eyebrow">ADMIN</div><h1>Conta sem permissão.</h1><p className="page-lead">A conta está autenticada, mas ainda não foi vinculada à tabela de administradores.</p><button className="button ghost" onClick={()=>db.auth.signOut()}>Sair</button></div>;
  const save=async()=>{
    if(!editing)return;
    if(!editing.title.trim()||!editing.date||!editing.city.trim()){
      setMessage('Antes de salvar, preencha pelo menos Título, Data e Cidade. A data não será presumida automaticamente.');
      return;
    }
    setSaving(true);
    setMessage('');
    let eventDataSaved=false;
    try{
      const baseSlug=slugify(`${editing.date}-${editing.city}-${editing.title}`)||crypto.randomUUID();
      const rawTime=(editing.time??'').trim();
      let normalizedTime:string|null=null;
      if(rawTime){
        const match=rawTime.match(/^(\d{1,2})(?:(?::([0-5]\d)(?::[0-5]\d)?)|[hH]([0-5]\d)?)?$/);
        if(!match)throw new Error('No campo Hora, informe HH:MM, HH:MM:SS, 16h ou 16h30; o horário descritivo fica no campo Rótulo do horário.');
        const hours=Number(match[1]),minutes=Number(match[2]||match[3]||0);
        if(hours>23)throw new Error('Hora inválida. Use um horário entre 00:00 e 23:59.');
        normalizedTime=`${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:00`;
      }
      const posterSha256=posterFile?await sha256File(posterFile).catch(()=>editing.poster_sha256||null):(editing.poster_sha256||null);
      const normalizedTitle=normalizePtTitle(editing.title);
      const normalizedType=normalizePtTitle(editing.type);
      const normalizedCity=normalizePtTitle(editing.city);
      const normalizedVenue=normalizePtTitle(editing.venue||'');
      const normalizedAddress=editing.address?.trim()?normalizePtTitle(editing.address):null;
      const normalizedDescription=editing.description?.trim()?normalizePtSentence(editing.description):null;
      const normalizedTimeLabel=editing.time_label?.trim()?normalizePtTitle(editing.time_label):null;
      const payload={slug:editing.db_id?editing.id:baseSlug,title:normalizedTitle,type:normalizedType,date:editing.date,time:normalizedTime,time_label:normalizedTimeLabel,city:normalizedCity,state:editing.state.trim().toUpperCase(),venue:normalizedVenue,address:normalizedAddress,description:normalizedDescription,status:editing.status,is_public:editing.public,lat:editing.lat??null,lng:editing.lng??null,image_url:editing.image_url||null,poster_sha256:posterFile?(editing.poster_sha256||null):posterSha256,notes:editing.notes||null};
      let savedId:string;
      let savedSlug:string;
      if(editing.db_id){
        const{data,error}=await db.from('events').update(payload).eq('id',editing.db_id).select().single();
        if(error)throw error;
        savedId=data.id;
        savedSlug=data.slug;
        eventDataSaved=true;
      }else{
        const{data,error}=await db.from('events').insert(payload).select().single();
        if(error)throw error;
        savedId=data.id;
        savedSlug=data.slug;
        eventDataSaved=true;
      }
      if(posterFile){
        if(posterFile.size>8*1024*1024)throw new Error('O pôster deve ter no máximo 8 MB.');
        const ext=(posterFile.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
        const path=`events/${savedId}-${Date.now()}.${ext}`;
        const{error:upErr}=await db.storage.from(ADMIN_STORAGE_BUCKET).upload(path,posterFile,{upsert:true,contentType:(ext==='jfif'||ext==='jpg'||ext==='jpeg')?'image/jpeg':ext==='webp'?'image/webp':ext==='png'?'image/png':ext==='gif'?'image/gif':posterFile.type||'application/octet-stream'});
        if(upErr)throw upErr;
        const{data:pub}=db.storage.from(ADMIN_STORAGE_BUCKET).getPublicUrl(path);
        const{error:urlErr}=await db.from('events').update({image_url:pub.publicUrl,poster_sha256:posterSha256}).eq('id',savedId);
        if(urlErr)throw urlErr;
        editing.image_url=pub.publicUrl;
        editing.poster_sha256=posterSha256;
      }
      const{error:deleteSourcesError}=await db.from('event_sources').delete().eq('event_id',savedId);
      if(deleteSourcesError)throw deleteSourcesError;
      if(editing.source_ids.length){
        const{error:sourceError}=await db.from('event_sources').insert(editing.source_ids.map(source_id=>({event_id:savedId,source_id})));
        if(sourceError)throw sourceError;
      }
      setMessage(editing.public?'Evento publicado na agenda.':'Evento salvo.');
      setEditing({...editing,title:normalizedTitle,type:normalizedType,city:normalizedCity,state:editing.state.trim().toUpperCase(),venue:normalizedVenue,address:normalizedAddress||undefined,description:normalizedDescription||undefined,time_label:normalizedTimeLabel||undefined,db_id:savedId,id:savedSlug,poster_sha256:posterSha256});
      setPosterFile(null);
      setPosterPreview(null);
      await loadAdmin();
    }catch(error){
      const detail=error&&typeof error==='object'&&'message' in error&&typeof error.message==='string'?error.message:error instanceof Error?error.message:'';
      if(eventDataSaved){
        setMessage('Os dados básicos do evento já foram salvos, mas uma etapa posterior falhou: '+(detail||'erro não identificado')+'. Reabra o mesmo registro para corrigir a etapa pendente; não crie outro evento. Se foi o envio da imagem, selecione o pôster novamente.');
      }else setMessage(detail||'Não foi possível salvar. Confira os dados e tente novamente.');
    }finally{
      setSaving(false);
    }
  };
  const resolveEditingGeography=async()=>{
    if(!editing||geoBusy)return;
    setGeoBusy(true);setGeoOptions([]);setMessage('Validando município no IBGE e procurando o ponto indicado no Maps…');
    try{
      const{data:sessionData}=await db.auth.getSession();
      const token=sessionData.session?.access_token;
      if(!token)throw new Error('Sua sessão expirou. Entre novamente no painel administrativo.');
      const response=await fetch('/api/resolve-location',{
        method:'POST',
        headers:{'content-type':'application/json','authorization':'Bearer '+token},
        body:JSON.stringify({
          title:editing.title,description:editing.description||'',city:editing.city,
          state:editing.state,venue:editing.venue,address:editing.address||'',
          postText:editing.notes||'',posterText:[editing.title,editing.description,editing.notes].filter(Boolean).join(' ')
        })
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(typeof payload.error==='string'?payload.error:'Não foi possível validar o local.');
      const location=payload.location||{};
      setEditing(prev=>prev?{...prev,
        city:location.city?normalizePtTitle(location.city):(location.city_needs_clear?'':prev.city),
        state:location.state?String(location.state).toUpperCase():prev.state,
        venue:location.venue?normalizePtTitle(location.venue):prev.venue,
        address:location.address?normalizePtTitle(location.address):prev.address,
        lat:typeof location.lat==='number'?location.lat:(location.city_needs_clear?null:prev.lat),
        lng:typeof location.lng==='number'?location.lng:(location.city_needs_clear?null:prev.lng)
      }:prev);
      const options=Array.isArray(location.geography_options)?location.geography_options.filter((option:any)=>option&&typeof option.title==='string'):[];
      setGeoOptions(options);
      const warnings=Array.isArray(location.geography_warnings)?location.geography_warnings:[];
      setMessage(location.geography_status==='verified_place'
        ?'Local identificado no Google Maps. Endereço e coordenadas foram preenchidos; confira o resultado antes de salvar.'
        :options.length
          ?'O Google Maps retornou mais de uma possibilidade. Escolha manualmente o local correto na lista abaixo.'
          :payload.googleMapsConfigured
            ?'Validação geográfica concluída com ressalvas. Confira os avisos e preencha qualquer campo que permaneceu vazio.'
            :'Município conferido no IBGE quando reconhecido. Para procurar endereço e coordenadas exatas, configure a chave Google Maps/Places no Cloudflare. '+warnings.slice(0,2).join(' '));
    }catch(error){
      setMessage(error instanceof Error?error.message:'Falha na validação geográfica. Confira os campos manualmente.');
    }finally{setGeoBusy(false)}
  };
  const useGeographyOption=(option:any)=>{
    if(!editing)return;
    setEditing({...editing,
      venue:option.title?normalizePtTitle(option.title):editing.venue,
      address:option.address?normalizePtTitle(option.address):editing.address,
      city:option.city?normalizePtTitle(option.city):editing.city,
      state:option.state?String(option.state).toUpperCase():editing.state,
      lat:typeof option.lat==='number'?option.lat:null,
      lng:typeof option.lng==='number'?option.lng:null
    });
    setGeoOptions([]);
    setMessage('Resultado geográfico selecionado manualmente. Confira o endereço e as coordenadas antes de salvar.');
  };
  const remove=async(e:MobilizationEvent)=>{if(!e.db_id||!confirm(`Excluir ${e.title}?`))return;const{error}=await db.from('events').delete().eq('id',e.db_id);if(error)setMessage(error.message);else{setMessage('Evento excluído.');await loadAdmin()}};
  const createFromSubmission=async(s:Submission)=>{setSubmitting(s.id);setMessage('');try{const slug=slugify(`${s.date||'sem-data'}-${s.city||'brasil'}-${s.title}`)||crypto.randomUUID();const{data:e,error}=await db.from('events').insert({slug,title:s.title,type:'Manifestação',date:s.date||new Date().toISOString().slice(0,10),time:s.time||null,time_label:s.time_label||null,city:s.city||'Brasil',state:s.state||'',venue:s.venue||'A conferir',status:'pending',is_public:false,lat:null,lng:null,image_url:null,notes:`Enviado por ${s.display_name}. ${s.message||''}`.trim()}).select().single();if(error)throw error;await db.from('event_sources').insert({event_id:e.id,source_id:ADMIN_SOURCE_FALLBACK});if(s.poster_path){const{data:blob,error:downErr}=await db.storage.from(SUBMISSION_STORAGE_BUCKET).download(s.poster_path);if(downErr)throw downErr;const ext=s.poster_path.split('.').pop()||'jpg';const path=`events/${e.id}-submission.${ext}`;const{error:upErr}=await db.storage.from(ADMIN_STORAGE_BUCKET).upload(path,blob,{upsert:true,contentType:blob.type||'image/jpeg'});if(upErr)throw upErr;const{data:pub}=db.storage.from(ADMIN_STORAGE_BUCKET).getPublicUrl(path);await db.from('events').update({image_url:pub.publicUrl}).eq('id',e.id)}await db.from('event_submissions').update({status:'approved',reviewed_at:new Date().toISOString(),reviewed_by:user.id}).eq('id',s.id);setMessage('Rascunho criado no painel. Revise e publique quando estiver pronto.');await loadAdmin();const fresh=await getAdminEvents();const created=fresh.find(x=>x.db_id===e.id);if(created)setEditing(created)}catch(error){setMessage(error instanceof Error?error.message:'Falha ao transformar o envio em evento.')}finally{setSubmitting(null)}}
  const reviewSubmission=async(s:Submission,status:'rejected'|'spam')=>{setSubmitting(s.id);const{error}=await db.from('event_submissions').update({status,reviewed_at:new Date().toISOString(),reviewed_by:user.id}).eq('id',s.id);if(error)setMessage(error.message);else setMessage(status==='spam'?'Envio marcado como spam.':'Envio rejeitado.');await loadAdmin();setSubmitting(null)};
  const reviewChat=async(m:ChatMessage,status:'approved'|'rejected'|'spam')=>{const{error}=await db.from('chat_messages').update({status,reviewed_at:new Date().toISOString(),reviewed_by:user.id}).eq('id',m.id);if(error)setMessage(error.message);else setMessage(status==='approved'?'Mensagem aprovada.':status==='spam'?'Mensagem marcada como spam.':'Mensagem rejeitada.');await loadAdmin()};
  const editFrom=(e:MobilizationEvent)=>{setEditing({...e});setPosterFile(null);setPosterPreview(e.image_url||null);setGeoOptions([])};
  const newEvent=()=>{const e=blank();setEditing(e);setPosterFile(null);setPosterPreview(null);setGeoOptions([])};
  const applyOcrCandidates=(candidates:PosterCandidate[])=>{
    if(!candidates.length)return;
    const c=candidates[0];
    setEditing(prev=>{
      if(!prev)return prev;
      const isExisting=Boolean(prev.db_id);
      const assign=(current:string|undefined|null,next:string|undefined):string|undefined=>next&&(!isExisting||!String(current||'').trim())?next:(current??undefined);
      return {...prev,title:assign(prev.title,c.title) as string,type:assign(prev.type,c.type) as string,date:assign(prev.date,c.date) as string,time:assign(prev.time,c.time),time_label:assign(prev.time_label,c.time_label),city:assign(prev.city,c.city) as string,state:assign(prev.state,c.state) as string,venue:assign(prev.venue,c.venue) as string,address:assign(prev.address,c.address)};
    });
    setMessage(candidates.length>1?'O pôster parece conter '+candidates.length+' atividades. A primeira sugestão foi carregada no editor; confira a lista e selecione outras atividades conforme necessário.':'Sugestões extraídas do pôster. Confira os campos antes de salvar.');
  };
  const useOcrCandidate=(candidate:PosterCandidate,file?:File,previewUrl?:string)=>{
    const normalizeText=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const sameDate=Boolean(editing?.db_id&&(!candidate.date||candidate.date===editing.date));
    const sameCity=Boolean(editing?.db_id&&(!candidate.city||normalizeText(candidate.city)===normalizeText(editing.city)));
    const titleMatches=Boolean(candidate.title&&normalizeText(candidate.title)===normalizeText(editing?.title||''));
    const venueMatches=Boolean(candidate.venue&&normalizeText(candidate.venue)===normalizeText(editing?.venue||''));
     const venueCandidateNormalized=normalizeText(candidate.venue||'').replace(/\s+[a-z]{2}$/,'').trim();
     const candidateVenue=candidate.venue&&venueCandidateNormalized!==normalizeText(candidate.city||'')&&!/^(local nao informado|nao informado|a conferir|local a confirmar)$/.test(venueCandidateNormalized)?normalizePtTitle(candidate.venue):undefined;
    const timeMatches=Boolean(candidate.time&&editing?.time&&candidate.time.slice(0,5)===editing.time.slice(0,5));
    const sameEvent=Boolean(editing?.db_id&&sameDate&&sameCity&&(titleMatches&&(venueMatches||timeMatches)||venueMatches&&timeMatches));
    const evidenceNotes=[
      candidate.source_url?'Fonte original: '+candidate.source_url:'',
      candidate.organization?'Organização mencionada: '+candidate.organization:'',
      candidate.hashtags?.length?'Hashtags encontradas: '+candidate.hashtags.join(' '):'',
      candidate.evidence?.length?'Evidências da extração: '+candidate.evidence.join(' | '):'',
      candidate.missing_fields?.length?'Campos a confirmar: '+candidate.missing_fields.join(', '):'',
      candidate.inferred_title?'Título sintetizado a partir do contexto; confirmar se representa o nome oficial.':''
    ].filter(Boolean).join('\n');
    setEditing(prev=>{
      const target=sameEvent&&prev?prev:blank();
      const noteParts=[target.notes,evidenceNotes].filter(Boolean);
      const uniqueNotes=[...new Set(noteParts)];
      return {...target,title:candidate.title?normalizePtTitle(candidate.title):target.title,type:candidate.type?normalizePtTitle(candidate.type):target.type,date:candidate.date||target.date,time:candidate.time||target.time,time_label:candidate.time_label?normalizePtTitle(candidate.time_label):target.time_label,city:candidate.city?normalizePtTitle(candidate.city):(candidate.city_needs_clear?'':target.city),state:candidate.state?candidate.state.toUpperCase():target.state,venue:candidateVenue||target.venue,address:candidate.address?normalizePtTitle(candidate.address):target.address,description:candidate.description?normalizePtSentence(candidate.description):target.description,lat:typeof candidate.lat==='number'?candidate.lat:(candidate.city_needs_clear?null:target.lat),lng:typeof candidate.lng==='number'?candidate.lng:(candidate.city_needs_clear?null:target.lng),notes:uniqueNotes.join('\n'),public:sameEvent?target.public:false,status:sameEvent?target.status:'pending'};
    });
    setPosterFile(file||null);
    setPosterPreview(previewUrl||(sameEvent?editing?.image_url||null:null));
    setMessage(sameEvent?'Sugestão relacionada ao evento em edição. Confira os campos e a fonte antes de salvar.':'Sugestão carregada como rascunho. Confirme data, local, título e possível duplicidade antes de salvar.');
  };
  const indexExistingPosters=async()=>{
    if(indexingPosters)return;
    const unindexed=events.filter(event=>Boolean(event.db_id&&event.image_url&&!event.poster_sha256));
    const grouped=new Map<string,MobilizationEvent[]>();
    for(const event of unindexed){
      const url=event.image_url!;
      if(!grouped.has(url))grouped.set(url,[]);
      grouped.get(url)!.push(event);
    }
    const targets=[...grouped.entries()];
    if(!targets.length){setMessage('Todos os pôsteres acessíveis já possuem impressão digital, ou não há imagens cadastradas para indexar.');return;}
    setIndexingPosters(true);setPosterIndexProgress('0/'+targets.length);
    setMessage('Indexando imagens antigas para detectar reenvios exatos. Isso pode levar alguns minutos.');
    let completed=0,indexedEvents=0,failed=0;
    try{
      for(let start=0;start<targets.length;start+=3){
        const batch=targets.slice(start,start+3);
        await Promise.all(batch.map(async([url,records])=>{
          try{
            const response=await fetch(url,{mode:'cors',cache:'force-cache'});
            if(!response.ok)throw new Error('Imagem inacessível');
            const blob=await response.blob();
            if(!blob.type.startsWith('image/'))throw new Error('O endereço não retornou uma imagem');
            const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
            const hash=Array.from(new Uint8Array(digest)).map(value=>value.toString(16).padStart(2,'0')).join('');
            const ids=records.map(event=>event.db_id).filter((id):id is string=>Boolean(id));
            if(!ids.length)throw new Error('Nenhum evento associado');
            const{error}=await db.from('events').update({poster_sha256:hash}).in('id',ids);
            if(error)throw error;
            indexedEvents+=ids.length;
          }catch{
            failed++;
          }finally{
            completed++;
            setPosterIndexProgress(completed+'/'+targets.length);
            setMessage('Indexando pôsteres antigos: '+completed+'/'+targets.length+' imagens verificadas…');
          }
        }));
      }
      await loadAdmin();
      setMessage('Indexação concluída: '+indexedEvents+' eventos atualizados a partir das imagens acessíveis; '+failed+' arquivo(s) não puderam ser lidos e continuarão sendo comparados pelos dados do evento.');
    }catch(error){
      setMessage(error instanceof Error?'A indexação foi interrompida: '+error.message:'A indexação foi interrompida. Você pode tentar novamente.');
    }finally{
      setIndexingPosters(false);
      setPosterIndexProgress('');
    }
  };
  return <div className="container page"><div className="admin-top"><div><div className="eyebrow">ADMIN</div><h1>Painel editorial</h1><p className="page-lead">Cadastre, revise, publique, anexe pôsteres e faça a triagem de envios.</p></div><div className="admin-actions"><button className="button primary" onClick={newEvent}>＋ Adicionar evento</button><button className="button ghost" disabled={indexingPosters} onClick={indexExistingPosters}>{indexingPosters?'Indexando pôsteres…':'Indexar pôsteres antigos'}{indexingPosters&&posterIndexProgress?' (' + posterIndexProgress + ')':''}</button><button className="button ghost" onClick={()=>db.auth.signOut()}>Sair</button></div></div>{message&&<div className="callout info"><Info/><span>{message}</span></div>}<section className="admin-section analytics-panel"><div className="section-head compact"><div><div className="eyebrow">ANALYTICS</div><h2>Visão da Agenda</h2></div><span className="analytics-note">últimos 7 dias · sem IP ou conta de usuário</span></div><div className="analytics-stats"><div className="analytics-stat"><Eye size={18}/><strong>{analyticsSummary.today}</strong><span>visualizações hoje</span></div><div className="analytics-stat"><Eye size={18}/><strong>{analyticsSummary.last7}</strong><span>visualizações em 7 dias</span></div><div className="analytics-stat"><BarChart3 size={18}/><strong>{analyticsSummary.uniqueVisitors}</strong><span>visitantes em 7 dias</span></div></div><div className="analytics-trend"><h3>Ritmo de acessos</h3><div className="analytics-bars" aria-label="Visualizações por dia nos últimos sete dias">{dailyAnalytics.map(day=><div className="analytics-bar-col" key={day.date}><div className="analytics-bar-track"><div className="analytics-bar" style={{height:Math.max(8,(day.count/maxDaily)*100)+'%'}} title={day.count+' visualizações'}/></div><strong>{day.count}</strong><span>{day.label}<br/>{day.date}</span></div>)}</div></div><div className="analytics-columns"><div><h3>Páginas mais acessadas</h3><div className="analytics-list">{analyticsSummary.topPages.length?analyticsSummary.topPages.map(([path,count])=><div key={path}><span>{path}</span><strong>{count}</strong></div>):<p>Nenhum acesso registrado ainda.</p>}</div></div><div><h3>Eventos mais acessados</h3><div className="analytics-list">{analyticsSummary.topEvents.length?analyticsSummary.topEvents.map(item=><div key={item.eventId}><span>{item.title}{item.city?' · '+item.city:''}</span><strong>{item.count}</strong></div>):<p>Nenhum evento acessado ainda.</p>}</div></div></div></section>
    {submissions.length>0&&<section className="admin-section"><div className="section-head compact"><div><div className="eyebrow">CAIXA DE ENTRADA</div><h2>{submissions.length} novo{submissions.length===1?'':'s'} envio{submissions.length===1?'':'s'} de evento</h2></div><button className="button ghost" onClick={loadAdmin}><RefreshCw size={16}/>Atualizar</button></div><div className="submission-list">{submissions.map(s=><article className="review-card" key={s.id}><div className="review-copy"><div className="review-meta"><span>{new Date(s.created_at).toLocaleString('pt-BR')}</span><strong>{s.display_name}</strong></div><h3>{s.title}</h3><p>{s.date?fmtShortDate(s.date):'data não informada'}{s.time_label||s.time?` · ${s.time_label||s.time}`:''}{s.city?` · ${s.city}${s.state?`/${s.state}`:''}`:''}</p>{s.venue&&<p>📍 {s.venue}</p>}{s.message&&<p className="review-message">{s.message}</p>}</div>{s.poster_url&&<img className="review-poster" src={s.poster_url} alt="Pôster enviado"/>}<div className="review-actions"><button className="button primary" onClick={()=>createFromSubmission(s)} disabled={submitting===s.id}>{submitting===s.id?'Criando…':'Criar rascunho'}</button><button className="button ghost" onClick={()=>reviewSubmission(s,'rejected')} disabled={submitting===s.id}>Rejeitar</button><button className="button ghost danger" onClick={()=>reviewSubmission(s,'spam')} disabled={submitting===s.id}><Flag size={15}/>Spam</button></div></article>)}</div></section>}
    {chatPending.length>0&&<section className="admin-section"><div className="section-head compact"><div><div className="eyebrow">MODERAÇÃO</div><h2>{chatPending.length} mensagem{chatPending.length===1?'':'s'} aguardando revisão</h2></div></div><div className="review-card-list">{chatPending.map(m=><article className="chat-review" key={m.id}><div><div className="review-meta"><strong>{m.display_name}</strong><span>{new Date(m.created_at).toLocaleString('pt-BR')}</span></div><p>{m.content}</p></div><div className="review-actions"><button className="button primary" onClick={()=>reviewChat(m,'approved')}>Aprovar</button><button className="button ghost" onClick={()=>reviewChat(m,'rejected')}>Rejeitar</button><button className="button ghost danger" onClick={()=>reviewChat(m,'spam')}><Flag size={15}/>Spam</button></div></article>)}</div></section>}
    {editing&&<div className="edit-card"><div className="edit-card-head"><div><div className="eyebrow">EDITOR</div><h2>{editing.db_id?'Editar evento':'Adicionar evento'}</h2></div><button className="button ghost" onClick={()=>setEditing(null)}>Fechar</button></div><div className="edit-grid"><label>Título<input value={editing.title} onChange={e=>setEditing({...editing,title:e.target.value})}/></label><label>Tipo<select value={editing.type} onChange={e=>setEditing({...editing,type:e.target.value})}>{['Manifestação','Ato','Plenária','Assembleia','Reunião','Debate','Caminhada','Panfletagem','Atividade cultural/política','Atividade universitária','Plenária online','Mobilização','Oficina'].map(x=><option key={x}>{x}</option>)}</select></label><label>Data<input type="date" value={editing.date} onChange={e=>setEditing({...editing,date:e.target.value})}/></label><label>Hora numérica<input type="text" inputMode="text" autoComplete="off" placeholder="15:00 ou 15h" value={(editing.time??'').slice(0,5)} onChange={e=>setEditing({...editing,time:e.target.value.replace(/[^0-9:hH]/g,'').slice(0,5)})}/></label><label className="full">Rótulo do horário<input placeholder="Ex.: 16h concentração / 17h saída" value={editing.time_label??''} onChange={e=>setEditing({...editing,time_label:e.target.value})}/></label><label>Cidade<input value={editing.city} onChange={e=>setEditing({...editing,city:e.target.value})}/></label><label>Estado<input maxLength={2} value={editing.state} onChange={e=>setEditing({...editing,state:e.target.value.toUpperCase()})}/></label><label className="full">Local<input value={editing.venue} onChange={e=>setEditing({...editing,venue:e.target.value})}/></label><label className="full">Endereço<input value={editing.address??''} onChange={e=>setEditing({...editing,address:e.target.value})}/></label><div className="full maps-verification">
 <div className="geo-admin-actions">
  <button type="button" className="button ghost" onClick={()=>void resolveEditingGeography()} disabled={geoBusy||saving}><MapPinned size={16}/>{geoBusy?'Validando cidade e local…':'Validar cidade, local e coordenadas'}</button>
  <a href={(()=>{const exact=hasSpecificEventLocation(editing.venue,editing.address,editing.city);const hasCoords=typeof editing.lat==='number'&&Number.isFinite(editing.lat)&&typeof editing.lng==='number'&&Number.isFinite(editing.lng);const query=[editing.address,exact?editing.venue:'',editing.city,editing.state,'Brasil'].filter(Boolean).join(', ');return hasCoords?'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(editing.lat+','+editing.lng):exact?'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(query):'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query)})()} target="_blank" rel="noreferrer">{typeof editing.lat==='number'&&typeof editing.lng==='number'?'Abrir rota para as coordenadas':'Conferir local no Google Maps'}</a>
 </div>
 <small>A cidade é comparada com a base de municípios do IBGE. Se a chave do Google Maps/Places estiver configurada, a ferramenta também busca o local, o endereço e as coordenadas. Não publique um resultado ambíguo sem conferir.</small>
 {geoOptions.length>0&&<div className="geography-options"><strong>Resultados do Maps — selecione o ponto correto</strong>{geoOptions.slice(0,5).map((option:any)=><div className="geography-option" key={option.id||option.title}><div><b>{option.title}</b><small>{option.address||'Endereço não informado'}{option.city?' · '+option.city:''}{option.state?' / '+option.state:''}</small><small>Correspondência textual: {Number(option.score)||0}%</small></div><div className="geography-option-actions"><button type="button" className="button ghost" onClick={()=>useGeographyOption(option)}>Usar este ponto</button><a href={option.maps_url||'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent([option.title,option.address].filter(Boolean).join(', '))} target="_blank" rel="noreferrer">Ver no Maps</a></div></div>)}</div>}
 </div><label>Status<select value={editing.status} onChange={e=>setEditing({...editing,status:e.target.value as any})}>{['confirmed','updated','warning','pending'].map(x=><option key={x}>{x}</option>)}</select></label><label>Latitude<input value={editing.lat??''} onChange={e=>setEditing({...editing,lat:e.target.value?Number(e.target.value):null})}/></label><label>Longitude<input value={editing.lng??''} onChange={e=>setEditing({...editing,lng:e.target.value?Number(e.target.value):null})}/></label><label className="full">Descrição<textarea value={editing.description??''} onChange={e=>setEditing({...editing,description:e.target.value})}/></label>
<label className="full">Observação<textarea value={editing.notes??''} onChange={e=>setEditing({...editing,notes:e.target.value})}/></label>
<PosterImporter currentImage={editing.image_url} existingEvents={events} getAuthToken={async()=>{const{data}=await db.auth.getSession();return data.session?.access_token||null}} onFileSelected={(file,previewUrl)=>{setPosterFile(file);setPosterPreview(previewUrl);setMessage('')}} onCandidatesFound={candidates=>applyOcrCandidates(candidates)} onUseCandidate={useOcrCandidate}/>
<div className="source-picker full"><div className="poster-upload-label"><ExternalLink size={17}/><strong>Fontes do evento</strong></div>
<div className="source-checks">{sources.map(s=><label key={s.id}><input type="checkbox" checked={editing.source_ids.includes(s.id)} onChange={e=>setEditing({...editing,source_ids:e.target.checked?[...editing.source_ids,s.id]:editing.source_ids.filter(id=>id!==s.id)})}/><span>{s.account_name}<small>{s.url}</small></span></label>)}</div></div>
<label className="check full"><input type="checkbox" checked={editing.public} onChange={e=>setEditing({...editing,public:e.target.checked})}/> Publicar no radar</label></div>
<div className="edit-footer"><button className="button primary" disabled={saving} onClick={save}>{saving?'Salvando…':'Salvar evento'}</button><button className="button ghost" onClick={()=>setEditing(null)}>Cancelar</button></div></div>}
    <section className="admin-section admin-event-filter"><div className="section-head compact"><div><div className="eyebrow">EVENTOS</div><h2>Filtrar cadastro</h2></div><span className="analytics-note">{filteredAdminEvents.length} de {events.length}</span></div><div className="admin-filter-row"><input value={adminQuery} onChange={e=>setAdminQuery(e.target.value)} placeholder="Buscar por título, cidade, UF ou local…"/><input type="date" value={adminDate} onChange={e=>setAdminDate(e.target.value)} aria-label="Filtrar por data"/><select value={adminStatus} onChange={e=>setAdminStatus(e.target.value)} aria-label="Filtrar por status"><option value="">Todos os status</option><option value="confirmed">Confirmado</option><option value="updated">Atualizado</option><option value="warning">Alerta</option><option value="pending">Pendente</option></select>{(adminQuery||adminDate||adminStatus)&&<button className="clear-btn" onClick={()=>{setAdminQuery('');setAdminDate('');setAdminStatus('')}}><X size={15}/> Limpar</button>}</div></section>
    <div className="admin-table">{filteredAdminEvents.map(e=><div className="admin-row" key={e.id}><span><strong>{e.city}</strong><small>{e.title}</small></span><span>{fmtShortDate(e.date)} · {e.time_label||e.time||'—'}</span><span className="admin-status">{e.status}{e.image_url&&<span title="Com pôster"><ImageIcon size={14}/></span>}<button onClick={()=>editFrom(e)}>Editar</button>{e.db_id&&<button onClick={()=>remove(e)} title="Excluir"><Trash2 size={13}/></button>}</span></div>)}</div></div>
}

export default function App(){
  const[events,setEvents]=useState<MobilizationEvent[]>([]);
  const[sources,setSources]=useState<EventSource[]>([]);
  const[loading,setLoading]=useState(true);
  const[loadError,setLoadError]=useState<string|null>(null);  const location=useLocation();

  useEffect(()=>{
    if(loading||loadError)return;
    if(location.pathname.startsWith('/admin')||location.pathname.startsWith('/entrar'))return;
    const match=location.pathname.match(/^\/evento\/([^/]+)$/);
    let eventId:string|null=null;
    if(match){
      const slug=decodeURIComponent(match[1]);
      eventId=events.find(e=>e.id===slug)?.db_id??null;
    }
    recordPageView(location.pathname,eventId);
  },[location.pathname,loading,loadError,events]);

  const reload=()=>Promise.all([getEvents(),getSources()])
    .then(([e,s])=>{setEvents(e);setSources(s);setLoadError(null);setLoading(false)})
    .catch((error)=>{setLoadError(error instanceof Error?error.message:'Não foi possível carregar a Agenda.');setLoading(false)});

  useEffect(()=>{reload()},[]);

  if(loading)return <div className="loading"><div className="spinner"/>Carregando radar…</div>;

  if(loadError)return <div className="loading"><div className="empty"><Info/><h3>Não foi possível carregar os dados</h3><p>{loadError}</p><button className="button primary" onClick={()=>{setLoading(true);reload()}}><RefreshCw size={16}/>Tentar novamente</button></div></div>;

  return <AppErrorBoundary><Layout><Routes><Route path="/" element={<Home events={events}/>}/><Route path="/evento/:id" element={<EventPage events={events} sources={sources}/>}/><Route path="/calendario" element={<CalendarPage events={events}/>}/><Route path="/mapa" element={<MapPage events={events}/>}/><Route path="/divulgar" element={<ShareBuilder events={events}/>}/><Route path="/sobre" element={<AboutPage/>}/><Route path="/chat" element={<ChatPage/>}/><Route path="/entrar" element={<AuthPage/>}/><Route path="/admin" element={<AdminPage/>}/><Route path="/admin/moderacao" element={<EventModerationPage/>}/></Routes></Layout></AppErrorBoundary>
}