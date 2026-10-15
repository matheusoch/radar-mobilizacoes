import {BRAZILIAN_STATES} from './brazilianStates';

export function normalizeLocationKey(value:string){
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim();
}

const LOWERCASE_PARTICLES=new Set(['da','das','de','do','dos','e']);

export function formatBrazilianPlaceName(value:string){
  const trimmed=value.trim().replace(/\s+/g,' ');
  if(!trimmed)return '';
  return trimmed.split(' ').map((word,index)=>{
    if(/^[A-Z]{2,3}$/.test(word))return word;
    const lower=word.toLocaleLowerCase('pt-BR');
    if(index>0&&LOWERCASE_PARTICLES.has(lower))return lower;
    return lower.charAt(0).toLocaleUpperCase('pt-BR')+lower.slice(1);
  }).join(' ');
}

export function canonicalizeLocation(value:string,options:string[]=[]){
  const trimmed=value.trim().replace(/\s+/g,' ');
  if(!trimmed)return '';
  const key=normalizeLocationKey(trimmed);
  const match=options.find(option=>normalizeLocationKey(option)===key);
  return match?formatBrazilianPlaceName(match):formatBrazilianPlaceName(trimmed);
}

export function canonicalizeLocationOptions(values:string[]){
  const byKey=new Map<string,string>();
  for(const value of values){
    const formatted=formatBrazilianPlaceName(value);
    const key=normalizeLocationKey(formatted);
    if(key&&!byKey.has(key))byKey.set(key,formatted);
  }
  return [...byKey.values()].sort((a,b)=>a.localeCompare(b,'pt-BR',{sensitivity:'base'}));
}

export function normalizeBrazilianStateKey(value:string){
  const key=normalizeLocationKey(value);
  const match=BRAZILIAN_STATES.find(state=>state.code.toLowerCase()===key||normalizeLocationKey(state.name)===key);
  return match?.code||key;
}

export function canonicalizeBrazilianState(value:string,options:string[]=[]){
  const key=normalizeLocationKey(value);
  const match=BRAZILIAN_STATES.find(state=>state.code.toLowerCase()===key||normalizeLocationKey(state.name)===key);
  if(match)return match.code;
  return canonicalizeLocation(value,options);
}

export function stateSuggestionOptions(values:string[]){
  const matched=BRAZILIAN_STATES.filter(state=>values.some(value=>{
    const key=normalizeLocationKey(value);
    return key===state.code.toLowerCase()||key===normalizeLocationKey(state.name);
  }));
  const extras=values.filter(value=>!BRAZILIAN_STATES.some(state=>{
    const key=normalizeLocationKey(value);
    return key===state.code.toLowerCase()||key===normalizeLocationKey(state.name);
  }));
  return [...new Set([...matched.flatMap(state=>[state.code,state.name]),...canonicalizeLocationOptions(extras)])];
}
