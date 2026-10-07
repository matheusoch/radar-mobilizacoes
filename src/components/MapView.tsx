import 'leaflet/dist/leaflet.css';
import {useEffect,useMemo,useState} from 'react';
import {MapContainer,Marker,Popup,TileLayer,useMap} from 'react-leaflet';
import L from 'leaflet';
import {Link} from 'react-router-dom';
import {Search,LocateFixed} from 'lucide-react';
import type {MobilizationEvent} from '../types';

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

export default function MapView({events}:{events:MobilizationEvent[]}){
  const[query,setQuery]=useState('');
  const[state,setState]=useState('');
  const states=useMemo(()=>[...new Set(events.map(e=>e.state).filter(Boolean))].sort(),[events]);
  const normalized=query.trim().toLowerCase();
  const filtered=useMemo(()=>events.filter(e=>{
    if(state&&e.state!==state)return false;
    if(normalized&&!(e.title+' '+e.city+' '+(e.state||'')+' '+e.venue).toLowerCase().includes(normalized))return false;
    return true;
  }),[events,state,normalized]);
  const mapped=filtered.filter(e=>e.lat!=null&&e.lng!=null);

  return <div className="map-shell">
    <div className="map-filters">
      <div className="map-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar cidade, local ou evento..." aria-label="Buscar no mapa"/></div>
      <select value={state} onChange={e=>setState(e.target.value)} aria-label="Filtrar mapa por estado"><option value="">Todos os estados</option>{states.map(s=><option key={s}>{s}</option>)}</select>
      <div className="map-count"><LocateFixed size={15}/>{mapped.length} ponto{mapped.length===1?'':'s'} no mapa · {filtered.length} evento{filtered.length===1?'':'s'} filtrado{filtered.length===1?'':'s'}</div>
    </div>
    <MapContainer center={[-14.2,-51.9]} zoom={4} scrollWheelZoom className="map">
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
      <FitBounds events={filtered}/>
      {mapped.map(e=><Marker key={e.id} position={[e.lat!,e.lng!]} icon={icon}><Popup><strong>{e.city} · {e.state}</strong><br/>{e.time_label||e.time||'Horário não informado'} · {e.venue}<br/><Link to={'/evento/'+e.id}>Ver evento</Link></Popup></Marker>)}
    </MapContainer>
    <div className="map-note">O mapa usa as coordenadas cadastradas para cada evento. Quando um evento ainda não tem coordenadas, ele continua disponível no calendário e nos filtros, mas não aparece como ponto.</div>
  </div>
}