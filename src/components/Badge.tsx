import type {EventStatus,EventType} from '../types';
export function StatusBadge({status}:{status:EventStatus}){const m={confirmed:['Verificado','good'],updated:['Atualizado','info'],warning:['Atenção','warn'],pending:['Pendente','muted']} as const; const [t,c]=m[status]; return <span className={`badge badge-${c}`}>{t}</span>}
export function TypeBadge({type}:{type:EventType}){return <span className="type-badge">{type}</span>}
