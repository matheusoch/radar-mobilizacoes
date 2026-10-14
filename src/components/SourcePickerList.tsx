import {useEffect,useMemo,useState} from 'react';
import {Search} from 'lucide-react';

type SourceOption={id:string;account_name:string;platform:string;url:string;account_handle?:string|null};
const PAGE=25;

export default function SourcePickerList({sources,selectedIds,onToggle}:{sources:SourceOption[];selectedIds:string[];onToggle:(id:string,checked:boolean)=>void}){
  const[query,setQuery]=useState('');
  const[limit,setLimit]=useState(PAGE);
  const filtered=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase('pt-BR');
    if(!q)return sources;
    return sources.filter(source=>[source.account_name,source.account_handle,source.platform,source.url].some(value=>String(value||'').toLocaleLowerCase('pt-BR').includes(q)));
  },[sources,query]);
  useEffect(()=>setLimit(PAGE),[query,sources.length]);
  const visible=filtered.slice(0,limit);
  return <div className="source-picker-list">
    <div className="admin-filter-row source-picker-list-tools">
      <label className="source-picker-search"><Search size={16}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar fonte por nome, plataforma ou link…"/></label>
      <span className="analytics-note">{visible.length} de {filtered.length} fontes exibidas · {selectedIds.length} selecionada(s)</span>
    </div>
    <div className="source-checks">
      {visible.map(source=><label key={source.id}>
        <input type="checkbox" checked={selectedIds.includes(source.id)} onChange={event=>onToggle(source.id,event.target.checked)}/>
        <span>{source.account_name}<small>{source.platform} · {source.url}</small></span>
      </label>)}
      {!filtered.length&&<p className="analytics-note">Nenhuma fonte encontrada para esta busca.</p>}
    </div>
    {filtered.length>limit&&<div className="source-picker-more"><button type="button" className="button ghost" onClick={()=>setLimit(value=>Math.min(value+PAGE,filtered.length))}>Mostrar mais {Math.min(PAGE,filtered.length-limit)} fontes ({filtered.length-limit} restantes)</button></div>}
  </div>;
}
