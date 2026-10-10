import {Clock3,MapPin,ArrowUpRight,Users,Check} from 'lucide-react';
import {Link} from 'react-router-dom';
import type {MobilizationEvent} from '../types';
import {StatusBadge,TypeBadge} from './Badge';

type Attendance={count:number;attending:boolean};

function formatEventTime(value?:string|null){
  if(!value?.trim())return 'Horário não informado';
  const text=value.trim();
  const match=text.match(/\\b([01]?\\d|2[0-3])\\s*(?:h(?:oras?)?\\s*([0-5]\\d)?|:\\s*([0-5]\\d))/i)
    ?? ( /^(?:[01]?\\d|2[0-3])$/.test(text) ? text.match(/^([01]?\\d|2[0-3])$/) : null );
  if(!match)return 'Horário não informado';
  const hour=String(Number(match[1]));
  const minute=match[2]??match[3];
  return minute&&Number(minute)>0?hour+'h'+minute:hour+'h';
}

function formatParticipants(count:number){
  if(count>=10000){
    return (count/1000).toFixed(1).replace('.',',')+' mil';
  }
  if(count>=1000) return count.toLocaleString('pt-BR');
  return count.toLocaleString('pt-BR');
}

export default function EventCard({event,attendance,onAttendance}:{event:MobilizationEvent;attendance?:Attendance;onAttendance?:()=>void}){
  const d=new Date(event.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}).replace('.','');
  const count=attendance?.count??0;
  return <article className="event-card">
    <div className="event-card-top">
      <div className="event-card-location">
        <div>
          <div className="event-date">{d}</div>
          <div className="event-city">{event.city}{event.state&&<span className="event-uf"> · {event.state}</span>}</div>
        </div>
      </div>
      <span className="event-participants"><Users size={14}/>{formatParticipants(count)} participante{count===1?'':'s'}</span>
    </div>
    <div className="event-card-body">
      <TypeBadge type={event.type}/><div className="event-card-title-row"><h3>{event.title}</h3><StatusBadge status={event.status}/></div>
      <div className="meta-row"><Clock3 size={16}/><span>{formatEventTime(event.time)}</span></div>
      <div className="meta-row"><MapPin size={16}/><span>{event.venue}</span></div>
      <div className="event-card-footer">
        <button type="button" className={attendance?.attending?'going-button active':'going-button'} onClick={onAttendance} disabled={!onAttendance} aria-pressed={attendance?.attending??false}>
          {attendance?.attending?<Check size={15}/>:<Users size={15}/>} {attendance?.attending?'Eu vou':'Eu Vou'}
        </button>
        <Link className="text-link" to={'/evento/'+event.id}>Detalhes <ArrowUpRight size={15}/></Link>
      </div>
    </div>
  </article>
}