import {Search,X} from 'lucide-react';

export interface FiltersState{
  search:string;
  state:string;
  city:string;
  type:string;
  period:string;
  modality:string;
}

export default function Filters({value,onChange,states,cities,types,modalities}:{
  value:FiltersState;
  onChange:(value:FiltersState)=>void;
  states:string[];
  cities:string[];
  types:string[];
  modalities:string[];
}){
  const set=(key:keyof FiltersState,nextValue:string)=>onChange({...value,[key]:nextValue});
  const clear=()=>onChange({search:'',state:'',city:'',type:'',period:'upcoming',modality:''});
  const hasFilters=Boolean(value.search.trim()||value.state||value.city||value.type||value.modality||value.period!=='upcoming');
  const modalityLabel=(modality:string)=>({
    Presencial:'📍 Presencial',
    Virtual:'🌐 Virtual',
    'Híbrido':'📍🌐 Híbrido',
  }[modality]||modality);

  return <div className="filters-wrap">
    <div className="searchbox">
      <Search size={18}/>
      <input value={value.search} onChange={event=>set('search',event.target.value)} placeholder="Busque por cidade, local ou evento..." aria-label="Buscar na agenda"/>
    </div>
    <div className="filter-row">
      <select aria-label="Filtrar por período" value={value.period} onChange={event=>set('period',event.target.value)}>
        <option value="upcoming">Próximos eventos</option>
        <option value="today">Hoje</option>
        <option value="7days">Próximos 7 dias</option>
        <option value="all">Todos</option>
      </select>
      <select aria-label="Filtrar por modalidade" value={value.modality} onChange={event=>set('modality',event.target.value)}>
        <option value="">Todas as modalidades</option>
        {modalities.map(modality=><option key={modality} value={modality}>{modalityLabel(modality)}</option>)}
      </select>
      <select aria-label="Filtrar por estado" value={value.state} onChange={event=>set('state',event.target.value)}>
        <option value="">Todos os estados</option>
        {states.map(state=><option key={state} value={state}>{state}</option>)}
      </select>
      <select aria-label="Filtrar por cidade" value={value.city} onChange={event=>set('city',event.target.value)}>
        <option value="">Todas as cidades</option>
        {cities.map(city=><option key={city} value={city}>{city}</option>)}
      </select>
      <select aria-label="Filtrar por tipo" value={value.type} onChange={event=>set('type',event.target.value)}>
        <option value="">Todos os tipos</option>
        {types.map(type=><option key={type} value={type}>{type}</option>)}
      </select>
      {value.modality!=='Virtual'&&<button type="button" className="clear-btn" onClick={()=>set('modality','Virtual')}>🌐 Eventos virtuais</button>}
      {value.modality==='Virtual'&&<button type="button" className="clear-btn" onClick={clear}>Todos os eventos</button>}
      {hasFilters&&<button type="button" className="clear-btn" onClick={clear}><X size={15}/> Limpar filtros</button>}
    </div>
  </div>;
}