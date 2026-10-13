import {useEffect,useMemo,useState} from 'react';
import {CalendarDays,Check,Image as ImageIcon,Star,X} from 'lucide-react';
import {CARD_FORMAT_KEYS,IMAGE_FORMATS,type CardFormatKey} from '../config/site';
import type {MobilizationEvent} from '../types';
import {MAX_EVENTS_PER_CARD,generateShareCard,svgToDataUrl} from '../utils/shareCardGenerator';
import {useShareCardAssets} from '../utils/useShareCardAssets';
import {SHARE_SHORT_URL,buildCardShareText,type ShareContent} from '../utils/socialShare';
import ShareCardActions from './ShareCardActions';
import {formatTimeText} from '../utils/formatTime';

const MAX_EVENTS=MAX_EVENTS_PER_CARD*2;
const HASHTAGS=['AgendaDeMobilizacoes'] as const;

function getTimeInfo(event:MobilizationEvent){
  const raw=formatTimeText(event.time_label||event.time).trim();
  const matches=[...raw.matchAll(/\b\d{1,2}h(?:\d{2})?\b/g)].map(match=>match[0]);
  if(matches.length<=1){
    return {primary:matches[0]||'—',detail:''};
  }
  const detail=raw.replace(matches[0],'').replace(/\s*\/\s*/g,' · ').replace(/\s+/g,' ').replace(/^[\s·\\-–—]+/,'').trim();
  return {
    primary:matches[0],
    detail,
  };
}

function formatTime(event:MobilizationEvent){
  return getTimeInfo(event).primary;
}

function displayLocation(event:MobilizationEvent){
  return [event.city,event.state].filter(Boolean).join(' ');
}

function groupSort(events:MobilizationEvent[]){
  return events.slice().sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')));
}

export default function ShareBuilder({events}:{events:MobilizationEvent[]}) {
  const params=new URLSearchParams(window.location.search);
  const initialIds=(params.get('eventos')||'').split(',').map(decodeURIComponent).filter(Boolean);
  const[query,setQuery]=useState('');
  const[dateFilter,setDateFilter]=useState('');
  const[selected,setSelected]=useState<string[]>(initialIds.slice(0,MAX_EVENTS));
  const[format,setFormat]=useState<CardFormatKey>('feed');
  const assets=useShareCardAssets();

  const candidates=useMemo(()=>{
    const dateParts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const dateValues=Object.fromEntries(dateParts.map(part=>[part.type,part.value]));
    const today=dateValues.year+'-'+dateValues.month+'-'+dateValues.day;
    const q=query.trim().toLowerCase();
    return groupSort(events.filter(event=>{
      if(!event.public||event.date<today)return false;
      if(dateFilter&&event.date!==dateFilter)return false;
      if(!q)return true;
      return [event.title,event.city,event.state,event.venue,event.type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    }));
  },[events,query,dateFilter]);

  const chosen=useMemo(()=>groupSort(
    selected
      .map(id=>events.find(event=>event.id===id))
      .filter((event):event is MobilizationEvent=>Boolean(event))
  ),[events,selected]);

  const card=useMemo(
    ()=>chosen.length&&assets?generateShareCard(chosen,{format,assets}):null,
    [chosen,format,assets]
  );

  useEffect(()=>{
    const next=selected.length
      ?'/divulgar?eventos='+selected.map(encodeURIComponent).join(',')
      :'/divulgar';
    window.history.replaceState(null,'',next);
  },[selected]);

  const toggle=(id:string)=>{
    setSelected(current=>{
      if(current.includes(id))return current.filter(item=>item!==id);
      if(current.length>=MAX_EVENTS)return current;
      return [...current,id];
    });
  };

  const content=useMemo<ShareContent>(()=>({
    text:buildCardShareText(chosen),
    url:SHARE_SHORT_URL,
    hashtags:[],
  }),[chosen]);

  return <div className='container page share-builder-page'>
    <div className='eyebrow'>
      <Star className='red-star' size={15} fill='currentColor' aria-hidden='true'/>
      CRIAR DIVULGAÇÃO
    </div>

    <div className='share-builder-heading'>
      <div>
        <h1>Crie seu painel de mobilizações.</h1>
        <p className='page-lead'>
          Escolha até {MAX_EVENTS} eventos e gere uma peça pronta para compartilhar.
          Cada card mostra data, horário, cidade, local e tipo de mobilização.
        </p>
      </div>
      <div className='share-counter'>
        <strong>{selected.length}/{MAX_EVENTS}</strong>
        <span>selecionados</span>
      </div>
    </div>

    <div className='share-builder-layout'>
      <section className='share-picker'>
        <div className='share-picker-head'>
          <strong>Escolha os eventos</strong>
          <span>{candidates.length} disponíveis</span>
        </div>

        <div className='share-filter-row'>
          <div className='share-search'>
            <input
              value={query}
              onChange={e=>setQuery(e.target.value)}
              placeholder='Buscar cidade, estado ou evento...'
              aria-label='Buscar eventos para divulgação'
            />
            {query&&
              <button type='button' onClick={()=>setQuery('')} aria-label='Limpar busca'>
                <X size={16}/>
              </button>
            }
          </div>
          <div className='share-date-filter'>
            <CalendarDays size={17} aria-hidden='true'/>
            <input
              type='date'
              value={dateFilter}
              onChange={e=>setDateFilter(e.target.value)}
              aria-label='Filtrar eventos por data'
            />
            {dateFilter&&
              <button type='button' className='share-date-clear' onClick={()=>setDateFilter('')} aria-label='Limpar filtro de data'>
                <X size={15}/>
              </button>
            }
          </div>
        </div>

        <div className='share-selected-list'>
          {chosen.length
            ? chosen.map(event=>
                <button
                  className='share-selected-chip'
                  type='button'
                  key={event.id}
                  onClick={()=>toggle(event.id)}
                >
                  <span>{displayLocation(event)} · {formatTime(event)}</span>
                  <X size={15}/>
                </button>
              )
            : <div className='share-empty'>Selecione eventos abaixo para começar.</div>}
        </div>

        <div className='share-event-list'>
          {candidates.map(event=>{
            const isSelected=selected.includes(event.id);
            const disabled=!isSelected&&selected.length>=MAX_EVENTS;
            return <button
              key={event.id}
              type='button'
              className={isSelected?'share-event selected':'share-event'}
              onClick={()=>toggle(event.id)}
              disabled={disabled}
            >
              <span className='share-event-check'>{isSelected?<Check size={15}/>:<span/>}</span>
              <span className='share-event-copy'>
                <strong>{displayLocation(event)}</strong>
                <small>{event.title}</small>
                <small>{event.venue}</small>
                {getTimeInfo(event).detail&&<small className='share-event-schedule'>{getTimeInfo(event).detail}</small>}
                <small className='share-event-type'>{event.type||'Mobilização'}</small>
              </span>
              <span className='share-event-time'>{formatTime(event)}</span>
            </button>;
          })}
          {!candidates.length&&<div className='share-empty'>Nenhum evento encontrado.</div>}
        </div>
      </section>

      <aside className='share-preview-panel'>
        <div className='share-preview-head'>
          <div>
            <div className='eyebrow'>PRÉVIA</div>
            <strong>Seu painel</strong>
          </div>
          <ImageIcon size={19}/>
        </div>

        <div className='share-format-tabs' role='radiogroup' aria-label='Formato da imagem'>
          {CARD_FORMAT_KEYS.map(key=>
            <button
              key={key}
              type='button'
              role='radio'
              aria-checked={format===key}
              className={format===key?'share-format-tab active':'share-format-tab'}
              onClick={()=>setFormat(key)}
            >
              <strong>{IMAGE_FORMATS[key].label}</strong>
              <small>{IMAGE_FORMATS[key].width}×{IMAGE_FORMATS[key].height}</small>
            </button>
          )}
        </div>

        <div className='share-canvas-wrap'>
          {card
            ? <div className='share-canvas-pages'>
                {card.pages.map(page=>
                  <img
                    key={page.index}
                    className='share-canvas'
                    src={svgToDataUrl(page.svg)}
                    width={page.width}
                    height={page.height}
                    alt={'Prévia do card '+(page.index+1)+' de '+page.total+' com '+page.shownEvents+(page.shownEvents===1?' evento':' eventos')}
                  />
                )}
              </div>
            : <div className='share-canvas-placeholder'>
                <CalendarDays size={30}/>
                <strong>Seu painel aparecerá aqui</strong>
                <span>Selecione pelo menos um evento.</span>
              </div>}
        </div>

        {card&&card.pages.length>1&&
          <div className='share-feedback' aria-live='polite'>
            Os eventos foram divididos em {card.pages.length} cards de continuação (até {MAX_EVENTS_PER_CARD} eventos cada).
          </div>}

        <ShareCardActions
          card={card}
          fileBase={'agenda-de-mobilizacoes-'+format}
          content={content}
          shareTitle='Agenda de Mobilizações'
        />

        <p className='share-help'>
          O painel é gerado em vetor (SVG) com a identidade visual da Agenda e fica vinculado a um link próprio,
          para facilitar a circulação nas redes.
        </p>
      </aside>
    </div>
  </div>;
}
