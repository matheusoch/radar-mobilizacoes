import {useEffect,useMemo,useState} from 'react';
import {CalendarDays,Check,Image as ImageIcon,Star,X} from 'lucide-react';
import {CARD_FORMAT_KEYS,IMAGE_FORMATS,type CardFormatKey} from '../config/site';
import type {MobilizationEvent} from '../types';
import {MAX_EVENTS_PER_CARD,generateShareCard,svgToDataUrl} from '../utils/shareCardGenerator';
import {useShareCardAssets} from '../utils/useShareCardAssets';
import {SHARE_SHORT_URL,buildCardShareText,type ShareContent} from '../utils/socialShare';
import ShareCardActions from './ShareCardActions';
import {formatTimeText} from '../utils/formatTime';

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
  const[stateFilter,setStateFilter]=useState('');
  const[cityFilter,setCityFilter]=useState('');
  const[selected,setSelected]=useState<string[]>(initialIds);
  const[format,setFormat]=useState<CardFormatKey>('feed');
  const assets=useShareCardAssets();

  const dateParts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const dateValues=Object.fromEntries(dateParts.map(part=>[part.type,part.value]));
  const today=dateValues.year+'-'+dateValues.month+'-'+dateValues.day;
  const upcomingEvents=useMemo(()=>events.filter(event=>event.public&&event.date>=today),[events,today]);
  const states=useMemo(()=>[...new Set(upcomingEvents.filter(event=>!dateFilter||event.date===dateFilter).map(event=>event.state).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')),[upcomingEvents,dateFilter]);
  const cities=useMemo(()=>[...new Set(upcomingEvents.filter(event=>(!dateFilter||event.date===dateFilter)&&(!stateFilter||event.state===stateFilter)).map(event=>event.city).filter(city=>city&&city.trim()))].sort((a,b)=>a.localeCompare(b,'pt-BR')),[upcomingEvents,dateFilter,stateFilter]);

  const candidates=useMemo(()=>{
    const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const q=normalize(query);
    return groupSort(upcomingEvents.filter(event=>{
      if(dateFilter&&event.date!==dateFilter)return false;
      if(stateFilter&&event.state!==stateFilter)return false;
      if(cityFilter&&normalize(event.city)!==normalize(cityFilter))return false;
      if(!q)return true;
      return normalize([event.title,event.city,event.state,event.venue,event.type].filter(Boolean).join(' ')).includes(q);
    }));
  },[upcomingEvents,query,dateFilter,stateFilter,cityFilter]);

  const chosen=useMemo(()=>groupSort(selected.map(id=>events.find(event=>event.id===id)).filter((event):event is MobilizationEvent=>Boolean(event))),[events,selected]);
  const allVisibleSelected=candidates.length>0&&candidates.every(event=>selected.includes(event.id));
  const selectVisible=()=>setSelected(current=>[...new Set([...current,...candidates.map(event=>event.id)])]);
  const deselectVisible=()=>{const visibleIds=new Set(candidates.map(event=>event.id));setSelected(current=>current.filter(id=>!visibleIds.has(id)))};
  const clearFilters=()=>{setQuery('');setDateFilter('');setStateFilter('');setCityFilter('')};

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
    setSelected(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]);
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
          Escolha os eventos por estado, cidade e data. Você pode selecionar todos os resultados; a agenda divide automaticamente seleções grandes em vários cards.
          Cada card mostra data, horário, cidade, local e tipo de mobilização.
        </p>
      </div>
      <div className='share-counter'>
        <strong>{selected.length}</strong>
        <span>selecionados</span>
      </div>
    </div>

    <div className='share-builder-layout'>
      <section className='share-picker'>
        <div className='share-picker-head'>
          <strong>Escolha os eventos</strong>
          <span>{candidates.length} disponíveis</span>
        </div>

        <div className='share-filter-row share-filter-row-custom'>
          <div className='share-search'>
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder='Buscar cidade, estado ou evento...' aria-label='Buscar eventos para divulgação'/>
            {query&&<button type='button' onClick={()=>setQuery('')} aria-label='Limpar busca'><X size={16}/></button>}
          </div>
          <label className='share-builder-select'>
            <span>Estado</span>
            <select value={stateFilter} onChange={e=>{setStateFilter(e.target.value);setCityFilter('')}} aria-label='Filtrar por estado'>
              <option value=''>Todos os estados</option>
              {states.map(state=><option key={state} value={state}>{state}</option>)}
            </select>
          </label>
          <label className='share-builder-select'>
            <span>Cidade</span>
            <select value={cityFilter} onChange={e=>setCityFilter(e.target.value)} aria-label='Filtrar por cidade'>
              <option value=''>Todas as cidades</option>
              {cities.map(city=><option key={city} value={city}>{city}</option>)}
            </select>
          </label>
          <div className='share-builder-date'>
            <label htmlFor='share-date-filter'>Data</label>
            <div className='share-date-filter'>
              <CalendarDays size={17} aria-hidden='true'/>
              <input id='share-date-filter' type='date' value={dateFilter} onChange={e=>setDateFilter(e.target.value)} aria-label='Filtrar eventos por data'/>
              {dateFilter&&<button type='button' className='share-date-clear' onClick={()=>setDateFilter('')} aria-label='Limpar filtro de data'><X size={15}/></button>}
            </div>
          </div>
        </div>
        <div className='share-picker-toolbar'>
          <span>{candidates.length} resultado{candidates.length===1?'':'s'} para os filtros atuais</span>
          <div>
            <button type='button' className='button ghost' onClick={allVisibleSelected?deselectVisible:selectVisible} disabled={!candidates.length}>{allVisibleSelected?'Desmarcar resultados':'Selecionar tudo'}</button>
            <button type='button' className='button ghost' onClick={clearFilters} disabled={!query&&!dateFilter&&!stateFilter&&!cityFilter}><X size={15}/>Limpar filtros</button>
            <button type='button' className='button ghost' onClick={()=>setSelected([])} disabled={!selected.length}><X size={15}/>Limpar seleção</button>
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
            return <button
              key={event.id}
              type='button'
              className={isSelected?'share-event selected':'share-event'}
              onClick={()=>toggle(event.id)}
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
