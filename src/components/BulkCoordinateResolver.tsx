import {useMemo,useState} from 'react';
import {AlertTriangle,CheckCircle2,Info,MapPinned,RefreshCw,Save,Search} from 'lucide-react';

type DbEvent={
  id:string; title:string; date:string; time_label?:string|null; city:string; state:string;
  venue?:string|null; address?:string|null; description?:string|null; notes?:string|null;
  lat?:number|null; lng?:number|null; status?:string|null; is_public?:boolean;
};
type PlaceOption={
  id:string; title:string; address:string; lat:number|null; lng:number|null;
  city?:string; state?:string; score?:number; maps_url?:string; types?:string[];
};
type ResolvedRow={
  event:DbEvent;
  state:'verified'|'options'|'not-found'|'skipped'|'error'|'saved';
  message:string;
  warnings:string[];
  source?:string;
  options:PlaceOption[];
  selectedOptionId:string;
  apply:boolean;
};
const normalize=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const validBrazilCoords=(lat:unknown,lng:unknown):lat is number=>typeof lat==='number'&&Number.isFinite(lat)&&lat>=-34&&lat<=6&&typeof lng==='number'&&Number.isFinite(lng)&&lng>=-75&&lng<=-32;
const placeFromLocation=(location:any):PlaceOption|null=>{
  if(!location||!validBrazilCoords(location.lat,location.lng))return null;
  return {id:'__verified',title:String(location.venue||''),address:String(location.address||''),lat:location.lat,lng:location.lng,city:String(location.city||''),state:String(location.state||'').toUpperCase(),score:100,maps_url:typeof location.maps_url==='string'?location.maps_url:undefined};
};
const isGenericVenue=(event:DbEvent)=>{
  const venue=normalize(event.venue||'');
  const address=normalize(event.address||'');
  if(!venue&&!address)return true;
  if(/alerta de geolocalizacao|referencia geografica inconsistente|municipio divergente|confirmar municipio/i.test(event.notes||''))return true;
  if(!address&&/^(local a definir|local ainda nao confirmado|local a confirmar|local nao informado|nao informado|endereco nao informado|a confirmar|a definir|online|virtual|presencial|bairro mutirao|centro|local)$/i.test(venue))return true;
  return false;
};
function displayDate(date:string){
  if(!date)return 'Data não informada';
  return new Date(date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function statusLabel(row:ResolvedRow){
  if(row.state==='verified')return 'Ponto validado';
  if(row.state==='options')return 'Escolha manual necessária';
  if(row.state==='saved')return 'Coordenadas gravadas';
  if(row.state==='skipped')return 'Pendente de informação';
  if(row.state==='error')return 'Falha na consulta';
  return 'Ponto não confirmado';
}
function getChosenPlace(row:ResolvedRow):PlaceOption|null{
  if(!row.selectedOptionId)return null;
  return row.options.find(option=>option.id===row.selectedOptionId&&validBrazilCoords(option.lat,option.lng))||null;
}
const RETRYABLE_GEO_HTTP = new Set([408,425,429,500,502,503,504]);

async function requestResolvedLocation(token:string,event:DbEvent):Promise<any>{
  let lastError:Error=new Error('A consulta cartográfica não respondeu.');
  for(let attempt=0;attempt<3;attempt++){
    let response:Response;
    try{
      response=await fetch('/api/resolve-location',{
        method:'POST',
        headers:{'content-type':'application/json','authorization':'Bearer '+token},
        body:JSON.stringify({
          title:event.title||'',
          description:event.description||'',
          city:event.city||'',
          state:event.state||'',
          venue:event.venue||'',
          address:event.address||'',
          postText:event.notes||''
        })
      });
    }catch(error){
      lastError=new Error('Falha de rede ao consultar o serviço cartográfico'+(error instanceof Error&&error.message?': '+error.message:'.'));
      if(attempt===2)throw lastError;
      await new Promise(resolve=>setTimeout(resolve,750*Math.pow(2,attempt)));
      continue;
    }

    const payload=await response.json().catch(()=>null);
    if(response.ok)return payload||{};
    if(response.status===403){
      throw new Error('A sessão não foi reconhecida como administradora. Entre novamente e tente outra vez.');
    }

    const detail=payload&&typeof payload.error==='string'?payload.error:'O serviço não retornou uma resposta utilizável.';
    lastError=new Error(detail+' (HTTP '+response.status+').');
    if(!RETRYABLE_GEO_HTTP.has(response.status)||attempt===2)throw lastError;
    await new Promise(resolve=>setTimeout(resolve,750*Math.pow(2,attempt)));
  }
  throw lastError;
}

export function BulkCoordinateResolver({db,onComplete}:{db:any;onComplete:()=>Promise<unknown>}){
  const[rows,setRows]=useState<ResolvedRow[]>([]);
  const[loading,setLoading]=useState(false);
  const[saving,setSaving]=useState(false);
  const[progress,setProgress]=useState('');
  const[notice,setNotice]=useState('');
  const[expanded,setExpanded]=useState(false);
  const mapped=useMemo(()=>rows.filter(row=>row.state==='verified'||row.state==='saved').length,[rows]);
  const ambiguous=useMemo(()=>rows.filter(row=>row.state==='options'&&!row.selectedOptionId).length,[rows]);
  const skipped=useMemo(()=>rows.filter(row=>row.state==='skipped').length,[rows]);

  const scan=async()=>{
    setLoading(true);setNotice('');setRows([]);setProgress('Consultando os eventos da agenda semanal…');
    try{
      const {data:authData,error:authError}=await db.auth.getSession();
      if(authError)throw authError;
      const token=authData.session?.access_token;
      if(!token)throw new Error('Sua sessão expirou. Entre novamente no painel administrativo.');
      const {data,error}=await db.from('events')
        .select('id,title,date,time_label,city,state,venue,address,description,notes,lat,lng,status,is_public')
        .eq('is_public',true)
        .ilike('notes','%ZIP new-posters.zip%')
        .or('lat.is.null,lng.is.null')
        .order('date',{ascending:true}).order('city',{ascending:true}).limit(1000);
      if(error)throw error;
      const events=(data||[]) as DbEvent[];
      const initial:ResolvedRow[]=events.map(event=>({
        event,state:isGenericVenue(event)?'skipped':'not-found',
        message:isGenericVenue(event)
          ?'Não será geocodificado automaticamente: o local é genérico, está indefinido ou tem alerta editorial.'
          :'Aguardando consulta cartográfica.',
        warnings:[],options:[],selectedOptionId:'',apply:false
      }));
      setRows(initial);
      const candidates=initial.filter(row=>row.state==='not-found');
      let completed=0;
      for(const candidate of candidates){
        completed++;
        setProgress('Validando pontos no mapa '+completed+'/'+candidates.length+'…');
        try{
          const payload=await requestResolvedLocation(token,candidate.event);
          const location=payload.location||{};
          const exact=placeFromLocation(location);
          const sameCity=Boolean(exact&&normalize(exact.city||'')===normalize(candidate.event.city)&&String(exact.state||'').toUpperCase()===String(candidate.event.state||'').toUpperCase());
          const rawOptions=(Array.isArray(location.geography_options)?location.geography_options:[]).filter((option:any)=>option&&typeof option.title==='string').map((option:any):PlaceOption=>({
            id:String(option.id||''),
            title:String(option.title||''),
            address:String(option.address||''),
            lat:typeof option.lat==='number'?option.lat:null,
            lng:typeof option.lng==='number'?option.lng:null,
            city:typeof option.city==='string'?option.city:'',
            state:typeof option.state==='string'?option.state.toUpperCase():'',
            score:Number(option.score)||0,
            maps_url:typeof option.maps_url==='string'&&option.maps_url.startsWith('https://')?option.maps_url:undefined,
            types:Array.isArray(option.types)?option.types.filter((x:unknown)=>typeof x==='string'):[]
          }));
          const safeOptions=rawOptions.filter((option:PlaceOption)=>validBrazilCoords(option.lat,option.lng)&&normalize(option.city||'')===normalize(candidate.event.city)&&String(option.state||'').toUpperCase()===String(candidate.event.state||'').toUpperCase());
          let next:ResolvedRow;
          const warnings=Array.isArray(location.geography_warnings)?location.geography_warnings.filter((x:unknown)=>typeof x==='string'):[];
          if(location.geography_status==='verified_place'&&exact&&sameCity){
            next={...candidate,state:'verified',message:'O local, município/UF e as coordenadas foram validados; confira antes de gravar.',source:String(location.geography_source||''),warnings,options:[exact],selectedOptionId:'__verified',apply:true};
          }else if(safeOptions.length){
            next={...candidate,state:'options',message:'O serviço encontrou opções no município correto. Selecione a referência que corresponde ao pôster.',source:String(location.geography_source||''),warnings,options:safeOptions,selectedOptionId:'',apply:false};
          }else{
            next={...candidate,state:'not-found',message:location.geography_status==='verified_place'&&!sameCity
              ?'O resultado cartográfico retornou município/UF diferente do cadastro; não será gravado automaticamente.'
              :'Nenhum ponto único e compatível foi confirmado. O evento permanece sem coordenadas.',source:String(location.geography_source||''),warnings,options:[],selectedOptionId:'',apply:false};
          }
          setRows(current=>current.map(row=>row.event.id===candidate.event.id?next:row));
        }catch(error){
          if(error instanceof Error&&error.message.includes('A sessão não foi reconhecida')){
            setRows(current=>current.map(row=>row.event.id===candidate.event.id?{...row,state:'error',message:error.message}:row));
            throw error;
          }
          setRows(current=>current.map(row=>row.event.id===candidate.event.id?{...row,state:'error',message:error instanceof Error?error.message:'Falha na consulta.',warnings:[]}:row));
        }
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      setNotice('Conferência concluída. Nenhuma coordenada foi gravada ainda. Revise os pontos validados e escolha manualmente as opções ambíguas.');
      setExpanded(true);
    }catch(error){
      setNotice(error instanceof Error?error.message:'Não foi possível conferir os eventos. Nenhuma coordenada foi gravada.');
    }finally{setLoading(false);setProgress('');}
  };

  const updateRow=(id:string,patch:Partial<ResolvedRow>)=>{
    setRows(current=>current.map(row=>row.event.id===id?{...row,...patch}:row));
  };
  const save=async()=>{
    const pending=rows.filter(row=>row.apply&&getChosenPlace(row));
    if(!pending.length){setNotice('Nenhum ponto válido foi selecionado para gravação.');return;}
    setSaving(true);setNotice('');
    let saved=0,skippedDuringSave=0;
    try{
      for(let i=0;i<pending.length;i++){
        const row=pending[i],place=getChosenPlace(row)!;
        setProgress('Gravando coordenadas '+(i+1)+'/'+pending.length+'…');
        if(!validBrazilCoords(place.lat,place.lng))continue;
        if(normalize(place.city||'')!==normalize(row.event.city)||String(place.state||'').toUpperCase()!==String(row.event.state||'').toUpperCase()){
          skippedDuringSave++;continue;
        }
        const patch:any={lat:place.lat,lng:place.lng,updated_at:new Date().toISOString()};
        if(place.address)patch.address=place.address;
        if(place.title&&row.state==='options')patch.venue=place.title;
        const {data,error}=await db.from('events').update(patch).eq('id',row.event.id).or('lat.is.null,lng.is.null').select('id');
        if(error)throw error;
        if(data?.length){
          saved++;
          updateRow(row.event.id,{state:'saved',message:'Coordenadas confirmadas e gravadas no evento da agenda.'});
        }else{
          skippedDuringSave++;
          updateRow(row.event.id,{apply:false,message:'O evento já recebeu coordenadas ou foi alterado desde a consulta; nenhum dado foi sobrescrito.'});
        }
      }
      await onComplete();
      setNotice(saved+' evento(s) atualizado(s) com coordenadas verificadas.'+(skippedDuringSave?' '+skippedDuringSave+' não foram alterados por divergência ou atualização concorrente.':'')+' Os demais permanecem para revisão.');
    }catch(error){
      setNotice('A gravação foi interrompida: '+(error instanceof Error?error.message:'erro desconhecido')+'. Os eventos já atualizados permanecem salvos; revise a lista antes de tentar novamente.');
    }finally{setSaving(false);setProgress('');}
  };

  return <section className="admin-section">
    <div className="section-head compact">
      <div>
        <div className="eyebrow">MAPA · GEOLOCALIZAÇÃO EM LOTE</div>
        <h2>Coordenar eventos da agenda semanal</h2>
        <p className="page-lead">Verifica os eventos já cadastrados a partir de <strong>new-posters.zip</strong>, pesquisa os locais no IBGE e nas fontes cartográficas disponíveis e prepara as coordenadas para o mapa. A consulta não cria nem duplica eventos.</p>
      </div>
      <MapPinned size={24}/>
    </div>
    <div className="callout info"><Info size={18}/><span>Somente pontos compatíveis com a cidade/UF e validados pelo serviço ficam pré-selecionados. Locais vagos, referências inconsistentes e resultados ambíguos exigem revisão; a consulta não grava coordenadas sozinha.</span></div>
    <div className="review-actions">
      <button type="button" className="button primary" disabled={loading||saving} onClick={()=>void scan()}><Search size={16}/>{loading?'Conferindo…':'Conferir eventos sem coordenadas'}</button>
      <button type="button" className="button ghost" disabled={loading||saving||!rows.some(row=>row.apply&&getChosenPlace(row))} onClick={()=>void save()}><Save size={16}/>{saving?'Gravando…':'Gravar pontos selecionados'}</button>
      {rows.length>0&&<button type="button" className="button ghost" disabled={loading||saving} onClick={()=>setExpanded(value=>!value)}>{expanded?'Ocultar detalhes':'Mostrar detalhes'}</button>}
    </div>
    {progress&&<div className="poster-reconcile-progress"><RefreshCw size={15}/>{progress}</div>}
    {notice&&<div className="callout info" role="status"><Info size={18}/><span>{notice}</span></div>}
    {rows.length>0&&<div className="analytics-stats">
      <div className="analytics-stat"><MapPinned size={18}/><strong>{rows.length}</strong><span>eventos sem ponto identificados</span></div>
      <div className="analytics-stat"><CheckCircle2 size={18}/><strong>{mapped}</strong><span>pontos validados / gravados</span></div>
      <div className="analytics-stat"><AlertTriangle size={18}/><strong>{ambiguous}</strong><span>opções aguardando escolha manual</span></div>
      <div className="analytics-stat"><Info size={18}/><strong>{skipped}</strong><span>locais vagos ou retidos para revisão</span></div>
    </div>}
    {expanded&&rows.length>0&&<div className="review-card-list" style={{maxHeight:620,overflowY:'auto',display:'grid',gap:12}}>
      {rows.map(row=>{
        const chosenPlace=getChosenPlace(row);
        const hasCoordinates=Boolean(chosenPlace);
        return <article className="chat-review" key={row.event.id}>
          <div style={{minWidth:0,flex:1}}>
            <div className="review-meta"><strong>{row.event.title}</strong><span>{displayDate(row.event.date)} · {row.event.time_label||'horário não informado'}</span></div>
            <p>{row.event.city}/{row.event.state} · {row.event.venue||row.event.address||'Local não informado'}</p>
            <p><strong>{statusLabel(row)}</strong>{row.source?' · '+row.source:''}</p>
            {row.options.length>1&&row.state==='options'&&<label style={{display:'grid',gap:6,marginTop:8}}>
              <span>Escolha o ponto correto</span>
              <select value={row.selectedOptionId} onChange={event=>updateRow(row.event.id,{selectedOptionId:event.target.value,apply:Boolean(event.target.value)})}>
                <option value="">Selecione uma referência…</option>
                {row.options.map((option,index)=><option key={option.id||index} value={option.id}>{option.title}{option.address?' — '+option.address:''}{option.score?' · correspondência '+option.score+'%':''}</option>)}
              </select>
            </label>}
            {row.options.length===1&&row.state==='options'&&<label style={{display:'grid',gap:6,marginTop:8}}>
              <span>Confirmar referência</span>
              <select value={row.selectedOptionId} onChange={event=>updateRow(row.event.id,{selectedOptionId:event.target.value,apply:Boolean(event.target.value)})}>
                <option value="">Não confirmar ainda</option><option value={row.options[0].id}>{row.options[0].title}{row.options[0].address?' — '+row.options[0].address:''}</option>
              </select>
            </label>}
            {chosenPlace&&<p>Destino proposto: {chosenPlace.title||row.event.venue} · {chosenPlace.address||'endereço não retornado'} · {Number(chosenPlace.lat).toFixed(6)}, {Number(chosenPlace.lng).toFixed(6)}{chosenPlace.maps_url?' · ':''}{chosenPlace.maps_url&&<a href={chosenPlace.maps_url} target="_blank" rel="noreferrer">abrir mapa</a>}</p>}
            {row.warnings.length>0&&<details><summary>Alertas de validação</summary><ul>{row.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul></details>}
            {row.state!=='saved'&&hasCoordinates&&<label style={{display:'flex',alignItems:'center',gap:8,marginTop:8}}><input type="checkbox" checked={row.apply} onChange={event=>updateRow(row.event.id,{apply:event.target.checked})}/>Incluir na gravação</label>}
            {!row.options.length&&<p>{row.message}</p>}
          </div>
        </article>;
      })}
    </div>}
  </section>;
}
