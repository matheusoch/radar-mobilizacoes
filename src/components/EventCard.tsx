import {Clock3,MapPin,ArrowUpRight,Users,Check} from 'lucide-react';
import {Link} from 'react-router-dom';
import type {MobilizationEvent} from '../types';
import {StatusBadge,TypeBadge} from './Badge';

type Attendance={count:number;attending:boolean};

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
      <div className="meta-row"><Clock3 size={16}/><span>{event.time||'Horário não informado'}</span></div>
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