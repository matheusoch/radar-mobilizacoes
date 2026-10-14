import 'leaflet/dist/leaflet.css';
import {useEffect,useMemo,useState} from 'react';
import {MapContainer,Marker,Popup,TileLayer,useMap} from 'react-leaflet';
import L from 'leaflet';
import {Link} from 'react-router-dom';
import {CalendarDays,Search,LocateFixed,X} from 'lucide-react';
import type {MobilizationEvent} from '../types';
import {formatTimeText} from '../utils/formatTime';

const icon=new L.Icon({
  iconUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize:[25,41],iconAnchor:[12,41],
});

function FitBounds({events}:{events:MobilizationEvent[]}){
  const map=useMap();
  useEffect(()=>{
    const points=events.filter(e=>e.lat!=null&&e.lng!=null).map(e=>[e.lat!,e.lng!] as [number,number]);
    if(!points.length){map.setView([-14.2,-51.9],4);return}
    if(points.length===1){map.setView(points[0],7);return}
    map.fitBounds(L.latLngBounds(points),{padding:[35,35],maxZoom:7});
  },[events,map]);
  return null;
}

function normalizeMapText(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}

function saoPauloDateKey(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return values.year+'-'+values.month+'-'+values.day;
}

function addDaysToDateKey(dateKey:string,days:number){
  const date=new Date(dateKey+'T12:00:00Z');
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}

export default function MapView({events}:{events:MobilizationEvent[]}){
  const[query,setQuery]=useState('');
  const[state,setState]=useState('');
  const[city,setCity]=useState('');
  const[period,setPeriod]=useState<'upcoming'|'today'|'7days'|'all'|'selected-date'>('upcoming');
  const[dateFilter,setDateFilter]=useState('');
  const today=saoPauloDateKey();
  const lastDay=addDaysToDateKey(today,6);
  const normalized=normalizeMapText(query);

  const datesFiltered=useMemo(()=>events.filter(event=>{
    if(period==='selected-date')return Boolean(dateFilter)&&event.date===dateFilter;
    if(period==='today')return event.date===today;
    if(period==='7days')return event.date>=today&&event.date<=lastDay;
    if(period==='all')return true;
    return event.date>=today;
  }),[events,period,dateFilter,today,lastDay]);

  const states=useMemo(()=>{
    const options=[...new Set(datesFiltered.map(event=>event.state).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    return state&&!options.includes(state)?[state,...options]:options;
  },[datesFiltered,state]);

  const cities=useMemo(()=>{
    const options=[...new Set(datesFiltered.filter(event=>!state||event.state===state).map(event=>event.city).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    return city&&!options.includes(city)?[city,...options]:options;
  },[datesFiltered,state,city]);

  const filtered=useMemo(()=>datesFiltered.filter(event=>{
    if(state&&event.state!==state)return false;
    if(city&&normalizeMapText(event.city)!==normalizeMapText(city))return false;
    if(normalized&&!normalizeMapText([event.title,event.city,event.state||'',event.venue,event.address||''].join(' ')).includes(normalized))return false;
    return true;
  }),[datesFiltered,state,city,normalized]);

  const mapped=filtered.filter(event=>event.lat!=null&&event.lng!=null);
  const unmapped=filtered.filter(event=>event.lat==null||event.lng==null);
  const clearFilters=()=>{
    setQuery('');
    setState('');
    setCity('');
    setPeriod('upcoming');
    setDateFilter('');
  };
  const setPeriodFilter=(next:'upcoming'|'today'|'7days'|'all'|'selected-date')=>{
    setPeriod(next);
    if(next!=='selected-date')setDateFilter('');
  };
  const setDate=(next:string)=>{
    setDateFilter(next);
    setPeriod(next?'selected-date':'upcoming');
  };
  const periodLabel=period==='selected-date'&&dateFilter
    ?new Date(dateFilter+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'}).replace('.','')
    :'Data selecionada';

  return <div className="map-shell">
    <div className="map-filters">
      <div className="map-search">
        <Search size={17} aria-hidden="true"/>
        <input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar cidade, local ou evento..." aria-label="Buscar no mapa"/>
        {query&&<button type="button" onClick={()=>setQuery('')} aria-label="Limpar busca no mapa"><X size={15}/></button>}
      </div>
      <label className="map-filter-field"><span>Estado</span>
        <select value={state} onChange={event=>{setState(event.target.value);setCity('')}} aria-label="Filtrar mapa por estado">
          <option value="">Todos os estados</option>{states.map(item=><option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label className="map-filter-field"><span>Cidade</span>
        <select value={city} onChange={event=>setCity(event.target.value)} aria-label="Filtrar mapa por cidade">
          <option value="">Todas as cidades</option>{cities.map(item=><option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label className="map-filter-field"><span>Período</span>
        <select value={period} onChange={event=>setPeriodFilter(event.target.value as 'upcoming'|'today'|'7days'|'all'|'selected-date')} aria-label="Filtrar mapa por período">
          {period==='selected-date'&&dateFilter&&<option value="selected-date">{periodLabel}</option>}
          <option value="upcoming">Próximas mobilizações</option>
          <option value="today">Hoje</option>
          <option value="7days">Próximos 7 dias</option>
          <option value="all">Todas as datas</option>
        </select>
      </label>
      <div className="map-filter-field"><span>Data específica</span>
        <div className="map-date-filter">
          <CalendarDays size={16} aria-hidden="true"/>
          <input type="date" value={dateFilter} onChange={event=>setDate(event.target.value)} aria-label="Escolher data específica no mapa"/>
          {dateFilter&&<button type="button" className="map-date-clear" onClick={()=>setDate('')} aria-label="Remover data selecionada"><X size={14}/></button>}
        </div>
      </div>
      {(state||city||query||period!=='upcoming'||dateFilter)&&<button type="button" className="clear-btn" onClick={clearFilters}><X size={15}/>Limpar filtros</button>}
      <div className="map-count" role="status" aria-live="polite"><LocateFixed size={15} aria-hidden="true"/>{mapped.length} ponto{mapped.length===1?'':'s'} no mapa · {unmapped.length} sem coordenadas · {filtered.length} evento{filtered.length===1?'':'s'} filtrado{filtered.length===1?'':'s'}</div>
    </div>
    <MapContainer center={[-14.2,-51.9]} zoom={4} scrollWheelZoom className="map">
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
      <FitBounds events={filtered}/>
      {mapped.map(event=><Marker key={event.id} position={[event.lat!,event.lng!]} icon={icon}>
        <Popup>
          <strong>{event.title}</strong><br/>
          {new Date(event.date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'}).replace('.','')} · {event.city}{event.state?' / '+event.state:''}<br/>
          {formatTimeText(event.time_label||event.time)||'Horário não informado'} · {event.venue||event.address||'Local não informado'}<br/>
          <Link to={'/evento/'+event.id}>Ver detalhes e compartilhar</Link>
        </Popup>
      </Marker>)}
    </MapContainer>
    <div className="map-note">O mapa só desenha um ponto quando o evento tem latitude e longitude cadastradas. Use os filtros para explorar um período específico; eventos sem coordenadas permanecem listados abaixo e não recebem marcadores aproximados.</div>
    {unmapped.length>0&&<details className="map-unmapped">
      <summary>Ver {unmapped.length} evento{unmapped.length===1?'':'s'} deste filtro que ainda não aparecem como ponto no mapa</summary>
      <div className="map-unmapped-list">
        {unmapped.map(event=><Link key={event.id} to={'/evento/'+event.id} className="map-unmapped-item">
          <strong>{event.title}</strong>
          <span>{new Date(event.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}).replace('.','')} · {event.city}{event.state?' / '+event.state:''}</span>
          <small>{event.venue||event.address||'Local não informado'}</small>
        </Link>)}
      </div>
    </details>}
    {!filtered.length&&<div className="empty map-empty"><Search size={22}/><h3>Nenhum evento para estes filtros</h3><p>Escolha outro período, data ou local.</p><button type="button" className="button ghost" onClick={clearFilters}><X size={15}/>Limpar filtros</button></div>}
  </div>
}