export type GeographyPlaceOption = {
  id:string; title:string; address:string; lat:number|null; lng:number|null;
  city?:string; state?:string; score:number; maps_url?:string; types?:string[];
};
export type PosterCandidate = {
  id: string; title?: string; type?: string; date?: string; time?: string; time_label?: string;
  city?: string; state?: string; venue?: string; address?: string; confidence?: number; sourceLines: string[];
  organization?: string; description?: string; hashtags?: string[]; evidence?: string[]; missing_fields?: string[]; inferred_title?: boolean; ai_confidence?: string; source_url?: string;
  lat?:number|null; lng?:number|null; maps_url?:string;
  city_needs_clear?:boolean; geography_status?:string; geography_source?:string; geography_confidence?:string;
  geography_warnings?:string[]; geography_options?:GeographyPlaceOption[];
};
type OcrWorker = { recognize:(image:File)=>Promise<{data:{text:string;confidence?:number}}>; terminate:()=>Promise<void> };
type TesseractApi = { createWorker:(languages:string,oem?:number)=>Promise<OcrWorker> };
declare global { interface Window { Tesseract?:TesseractApi } }
let tesseractPromise:Promise<TesseractApi>|null=null;
function loadTesseract():Promise<TesseractApi>{
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  if(!tesseractPromise)tesseractPromise=new Promise((resolve,reject)=>{
    const fail=()=>{tesseractPromise=null;reject(new Error('Não foi possível carregar o OCR. Confira a conexão e tente novamente.'))};
    const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';script.async=true;
    script.onload=()=>window.Tesseract?resolve(window.Tesseract):fail();script.onerror=fail;document.head.appendChild(script);
  });
  return tesseractPromise;
}
const states=new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']);
const cityUF:Record<string,string>={'belo horizonte':'MG','sao paulo':'SP','rio de janeiro':'RJ','duque de caxias':'RJ','nova iguacu':'RJ','niteroi':'RJ','sao goncalo':'RJ','campinas':'SP','sao jose dos campos':'SP','santos':'SP','brasilia':'DF','goiania':'GO','cuiaba':'MT','campo grande':'MS','palmas':'TO','belem':'PA','braganca':'PA','manaus':'AM','fortaleza':'CE','caucaia':'CE','salvador':'BA','feira de santana':'BA','recife':'PE','serra talhada':'PE','natal':'RN','teresina':'PI','sao luis':'MA','macapa':'AP','curitiba':'PR','maringa':'PR','ponta grossa':'PR','florianopolis':'SC','balneario camboriu':'SC','porto alegre':'RS','rio grande':'RS','vitoria':'ES','sao mateus':'ES','ouro preto':'MG','uberlandia':'MG','sao joao del rei':'MG','arapiraca':'AL','boa vista':'RR','blumenau':'SC','seropedica':'RJ','tres rios':'RJ','campo mourao':'PR'};
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const clean=(s:string)=>s.replace(/[•●▪■]+/g,' ').replace(/\s+/g,' ').replace(/^[\s:|–—-]+|[\s|]+$/g,'').trim();
const SMALL_TITLE_WORDS=new Set(['a','as','o','os','um','uma','uns','umas','de','da','das','do','dos','e','em','no','na','nos','nas','por','para','com','pelo','pela','pelos','pelas','ao','à','às','ou']);
const TITLE_ACRONYMS:Record<string,string>={ac:"AC",al:"AL",ap:"AP",am:"AM",ba:"BA",ce:"CE",df:"DF",es:"ES",go:"GO",ma:"MA",mt:"MT",ms:"MS",mg:"MG",pa:"PA",pb:"PB",pr:"PR",pe:"PE",pi:"PI",rj:"RJ",rn:"RN",rs:"RS",ro:"RO",rr:"RR",sc:"SC",sp:"SP",se:"SE",to:"TO",ufmg:"UFMG",dce:"DCE",mst:"MST",pt:"PT",psol:"PSOL",pcb:"PCB",pcdob:"PCdoB",pstu:"PSTU",cut:"CUT",ctb:"CTB",une:"UNE",ubes:"UBES",ujs:"UJS",bh:"BH",stf:"STF",tse:"TSE",tre:"TRE",trt:"TRT",tj:"TJ",tcu:"TCU",mp:"MP",mpf:"MPF",mpt:"MPT",masp:"MASP",ibge:"IBGE",dnit:"DNIT",bndes:"BNDES",ufrj:"UFRJ",ufba:"UFBA",ufro:"UFRO",unir:"UNIR",ufrgs:"UFRGS",ufsc:"UFSC",ufpr:"UFPR",uerj:"UERJ",uff:"UFF",unesp:"Unesp",usp:"USP",uol:"UOL"}
export function normalizePtTitle(value:string):string{
 const words=value.replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim().toLocaleLowerCase('pt-BR').split(' ');
 const result=words.map((word,index)=>{
  const hyphenated=word.split('-').map(part=>{
   const key=norm(part);
   if(TITLE_ACRONYMS[key])return TITLE_ACRONYMS[key];
   return part?part.charAt(0).toLocaleUpperCase('pt-BR')+part.slice(1):part;
  }).join('-');
  return index>0&&SMALL_TITLE_WORDS.has(word)?word:hyphenated;
 }).join(' ');
 return result.replace(/\bD'([a-záàâãéêíóôõúüç])/gu,(_m,letter)=>"d'"+letter.toLocaleUpperCase('pt-BR'));
}
const EVENT_TYPE_LABELS:Record<string,string>={
 'manifestacao':'Manifestação','ato':'Ato','plenaria':'Plenária','assembleia':'Assembleia','reuniao':'Reunião',
 'debate':'Debate','caminhada':'Caminhada','panfletagem':'Panfletagem','bandeiraco':'Bandeiraço','adesivaco':'Adesivaço',
 'carreata':'Carreata','mutirao':'Mutirão','mobilizacao de rua':'Mobilização de rua',
 'atividade cultural politica':'Atividade cultural/política','atividade universitaria':'Atividade universitária',
 'plenaria online':'Plenária online','mobilizacao':'Mobilização','oficina':'Oficina',
 'bicicletada':'Bicicletada','vigilia':'Vigília','aula publica':'Aula pública','faixaco':'Faixaço',
 'encontro':'Encontro','ato ecumenico':'Ato Ecumênico'
};
export function normalizeEventType(value:string):string{
 const key=norm(value);
 return EVENT_TYPE_LABELS[key]||normalizePtTitle(value);
}
export function normalizePtSentence(value:string):string{
 return value.replace(/\s+/g,' ').trim().toLocaleLowerCase('pt-BR')
  .replace(/(^|[.!?]\s+)([a-záàâãéêíóôõúüç])/gu,(_m,lead,letter)=>lead+letter.toLocaleUpperCase('pt-BR'));
}
const TIME_RE=/\b([01]?\d|2[0-3])\s*(?:h\s*([0-5]\d)?|:([0-5]\d))\b/gi;
function prettyCity(s:string){
 const map:Record<string,string>={'sao paulo':'São Paulo','rio de janeiro':'Rio de Janeiro','belo horizonte':'Belo Horizonte','duque de caxias':'Duque de Caxias','nova iguacu':'Nova Iguaçu','sao luis':'São Luís','sao goncalo':'São Gonçalo','feira de santana':'Feira de Santana','campo grande':'Campo Grande','campo mourao':'Campo Mourão','ouro preto':'Ouro Preto','ponta grossa':'Ponta Grossa','balneario camboriu':'Balneário Camboriú','sao jose dos campos':'São José dos Campos','sao joao del rei':'São João del-Rei','rio grande':'Rio Grande','sao mateus':'São Mateus','goiania':'Goiânia','cuiaba':'Cuiabá','belem':'Belém','braganca':'Bragança','macapa':'Macapá','niteroi':'Niterói','maringa':'Maringá','brasilia':'Brasília','vitoria':'Vitória','uberlandia':'Uberlândia','arapiraca':'Arapiraca','florianopolis':'Florianópolis','seropedica':'Seropédica','tres rios':'Três Rios'};
 return map[norm(s)]||clean(s);
}
function inferType(s:string):string|undefined{
 const t=norm(s);
 if(/adesivaco|adesivagem|adesivacao|colagem de adesivos|entrega de adesivos/.test(t))return 'Adesivaço';
 if(/lambe|lambes|colagem de cartaz|colar cartaz|colagem de cartazes|colar lambes|colagem de lambe|colagem de lambes|panfletagem|panfletar|distribuicao de material|distribuicao de panfleto|entrega de material|entrega de panfleto|distribuicao de jornal|entrega de jornal|abordagem de rua|brigada de material|agitacao de rua|cartazagem/.test(t))return 'Panfletagem';
 if(/bandeiracao|bandeiraco|bandeirada|hasteamento de bandeiras/.test(t))return 'Bandeiraço';
 if(/brigada de rua|blitz|mobilizacao de rua/.test(t))return 'Mobilização de rua';
 if(/mutirao/.test(t))return 'Mutirão';
 if(/bicicletada|pedalada coletiva|marcha ciclista/.test(t))return 'Bicicletada';
 if(/vigilia/.test(t))return 'Vigília';
 if(/aula publica|aulao publico/.test(t))return 'Aula pública';
 if(/faixaco|pintura de faixa coletiva/.test(t))return 'Faixaço';
 if(/caminhada|passeata|marcha|cortejo/.test(t))return 'Caminhada';
 if(/carreata/.test(t))return 'Carreata';
 if(/plenaria online|plenaria virtual/.test(t))return 'Plenária online';
 if(/plenaria/.test(t))return 'Plenária';
 if(/assembleia/.test(t))return 'Assembleia';
 if(/oficina/.test(t))return 'Oficina';
 if(/debate|roda de conversa|mesa redonda|seminario|cine debate/.test(t))return 'Debate';
 if(/reuniao/.test(t))return 'Reunião';
 if(/encontro/.test(t))return 'Encontro';
 if(/ato ecumenico/.test(t))return 'Ato Ecumênico';
 if(/ato publico|ato politico|\\bato\\b/.test(t))return 'Ato';
 if(/manifestacao|protesto/.test(t))return 'Manifestação';
 if(/universidade|universitario|estudantes|campus|uf[a-z]{2}/.test(t))return 'Atividade universitária';
 if(/samba|show|cultural|sarau|festival|cine debate/.test(t))return 'Atividade cultural/política';
 return /mobilizacao/.test(t)?'Mobilização':undefined;
}
function dateInLine(line:string):string|undefined{
 const n=norm(line);
 if(/\b\d{1,2}\s*[/.]\s*\d{1,2}\s*(?:a|ate|–|—|-)\s*\d{1,2}\s*[/.]\s*\d{1,2}\b/.test(n))return undefined;
 const numeric=line.match(/\b(\d{1,2})\s*[/. -]\s*(\d{1,2})(?:\s*[/. -]\s*(20\d{2}))?\b/);
 const months:Record<string,number>={janeiro:1,fevereiro:2,marco:3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12};
 const written=n.match(/\b(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(20\d{2}))?\b/);
 const d=numeric?Number(numeric[1]):written?Number(written[1]):NaN;
 const mo=numeric?Number(numeric[2]):written?months[written[2]]:NaN;
 const y=Number((numeric&&numeric[3])||(written&&written[3])||new Date().getFullYear());
 if(!Number.isFinite(d)||!Number.isFinite(mo))return undefined;
 const dt=new Date(y,mo-1,d);if(dt.getFullYear()!==y||dt.getMonth()!==mo-1||dt.getDate()!==d)return undefined;
 return [y,String(mo).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
}
function dateAnchors(lines:string[]){const result:Array<{index:number;date:string}>=[];lines.forEach((line,index)=>{const date=dateInLine(line);if(date)result.push({index,date})});return result.filter((a,i,all)=>i===0||a.date!==all[i-1].date)}
function parseTimes(lines:string[]):Array<{time:string;line:string;label:string}>{
 const out:Array<{time:string;line:string;label:string}>=[];
 for(const line of lines){
  const matches=[...line.matchAll(new RegExp(TIME_RE.source,'gi'))];if(!matches.length)continue;
  const first=matches[0];
  const hasDescription=/(concentra|sa[ií]da|partida|abertura|encerramento|encontro|in[ií]cio|t[eé]rmino|recep[cç][aã]o|largada)/i.test(line);
  const label=hasDescription?clean(line):matches.map(item=>clean(item[0])).join(' / ');
  out.push({time:String(first[1]).padStart(2,'0')+':'+String(first[2]||first[3]||'00').padStart(2,'0'),line:clean(line),label});
 }
 return out;
}
const venueKeyword=/\b(palacio|sede|tre|tribunal|masp|praca|largo|caixa d agua|caixas d agua|campus|rodoviaria|estacao|terminal|sindicato|auditorio|teatro|reitoria|dce|parque|mercado|centro|shopping|museu|memorial|biblioteca|prefeitura|camara|congresso|monumento|viaduto|ponte|quadra|ginasio|rua|avenida|travessa|alameda|rodovia|forum|hospital|cartorio|escola|universidade|catedral|igreja|pavilhao|praia|orla|estrada)\b/;
function extractVenueClue(lines:string[]):string|undefined{
 const patterns=[
  /\b(?:local|ponto de encontro|concentra[cç][aã]o|encontro|sa[ií]da|partida|local do ato)\s*[:–—-]\s*([^,;|()]{3,90})/i,
  /\b(?:concentra[cç][aã]o|ponto de encontro|encontro|sa[ií]da|partida|local do ato|local)\b.*?\b(?:em frente ao|em frente à|em frente a|perto do|perto da|perto de|nas|nos|na|no|em|ao|à)\s+([^,;|()]{3,90})/i
 ];
 for(const line of lines){
  for(const pattern of patterns){
   const match=line.match(pattern);if(!match)continue;
   let value=clean(match[1]);
   value=value.replace(/\s+(?:às?|as?)\s+\d{1,2}(?::\d{2}|h\d{0,2})?.*$/i,'').trim();
   value=value.replace(/\s+(?:dia\s+)?\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?.*$/i,'').trim();
   value=value.replace(/^(?:a|o|as|os|uma|um)\s+/i,'').trim();
   if(value.length>=3&&value.length<=90&&venueKeyword.test(norm(value)))return normalizePtTitle(value);
  }
 }
 return undefined;
}
function locate(lines:string[],contextLines:string[]=[],allLines:string[]=[]){
 let city:string|undefined,state:string|undefined;
 const findCityState=(source:string[])=>{
  const commonCities=Object.keys(cityUF).sort((a,b)=>b.length-a.length);
  const stateNames=new Set(['acre','alagoas','amapa','amazonas','bahia','ceara','distrito federal','espirito santo','goias','maranhao','mato grosso','mato grosso do sul','minas gerais','para','paraiba','parana','pernambuco','piaui','rio de janeiro','rio grande do norte','rio grande do sul','rondonia','roraima','santa catarina','sao paulo','sergipe','tocantins']);
  const groupIdentity=/^(?:juventude|jovens|estudantes|estudantil|trabalhadores|trabalhadoras|moradores|moradoras|militantes|coletivo|coletiva|alunos|alunas|professores|professoras|comunidade|sindicato|movimento|organizacao|grupo) (?:de|do|da|dos|das) /;
  for(const line of source){
   const m=line.match(/(?:^|[,;|])\s*([^,;|]{2,70}?)\s*[-/·]\s*([A-Z]{2})\b/);
   if(!m||!states.has(m[2].toUpperCase()))continue;
   const left=clean(m[1]),key=norm(left),uf=m[2].toUpperCase();
   if(groupIdentity.test(key))continue;
   const foundCity=commonCities.find(city=>key===city||key.endsWith(' '+city));
   if(foundCity)return {city:prettyCity(foundCity),state:uf};
   if(stateNames.has(key)||venueKeyword.test(key))return {city:undefined,state:uf};
   return {city:prettyCity(left),state:uf};
  }
  return null;
 };
 const findKnownCity=(source:string[])=>{
  for(const line of source){
   const n=norm(line);
   const found=Object.keys(cityUF).sort((a,b)=>b.length-a.length).find(city=>{
    const at=n.indexOf(city);
    if(at<0)return false;
    const before=n.slice(0,at);
    const identityTail=/(?:^| )(?:juventude|jovens|estudantes|trabalhadores|trabalhadoras|moradores|moradoras|militantes|coletivo|coletiva|alunos|alunas|professores|professoras|comunidade|sindicato|movimento|organizacao|grupo) (?:de|do|da|dos|das)$/.test(before);
    const explicitLocation=new RegExp('(?:^| )(?:em|no|na|nos|nas|para|cidade de|municipio de|ato em|evento em|concentracao em|marcha em|caminhada em) '+city+'(?: |$)');
    return !identityTail||explicitLocation.test(n);
   });
   if(found)return {city:prettyCity(found),state:cityUF[found]};
  }
  return null;
 };
 const local=findCityState(lines)||findKnownCity(lines);
 const context=[...contextLines].reverse();
 const fallback=local||findCityState(context)||findKnownCity(context)||findCityState(allLines)||findKnownCity(allLines);
 city=fallback?.city;state=fallback?.state;
 const combined=[...lines,...contextLines];
  const addressLine=combined.find(x=>/\b(rua|avenida|av\.|travessa|alameda|rodovia|endereco|endereço|cep)\b/i.test(x));
  const address=addressLine?clean(addressLine.replace(/^(?:endere[cç]o|localiza[cç][aã]o)\s*[:–—-]\s*/i,'')):undefined;
  const extractedVenue=extractVenueClue(combined);
  const venueLine=combined.find(x=>venueKeyword.test(norm(x)));
  const venue=extractedVenue||(venueLine?clean(venueLine):undefined);
  return {city,state,venue:venue?normalizePtTitle(venue):address?normalizePtTitle(address):undefined,address:address?normalizePtTitle(address):undefined};
}
function bestTitle(lines:string[],type?:string):string|undefined{
 const candidates=lines.filter(line=>{
  const n=norm(line);if(line.length<5||line.length>100)return false;
  if(dateInLine(line)||TIME_RE.test(line)){TIME_RE.lastIndex=0;return false} TIME_RE.lastIndex=0;
  if(/^(data|local|localizacao|endereco|horario|hora|cidade|presencial|instagram|facebook|twitter|www)\b/.test(n))return false;
  if(/\b(rua|avenida|av\.|travessa|alameda|cep|bairro)\b/i.test(n))return false;
  if(/^(segunda|terca|quarta|quinta|sexta|sabado|domingo)(-feira)?\b/.test(n))return false;
  return true;
 });
 const score=(line:string)=>{const n=norm(line);let s=Math.min(line.length,70)/20;if(/agenda da semana|programacao semanal/.test(n))s-=2;if(/mobilizacao|manifestacao|protesto|marcha|caminhada|ato|plenaria|assembleia|reuniao|oficina|estudantes|democracia|virada/.test(n))s+=2;if(type&&n===norm(type))s-=2;return s};
 return candidates.sort((a,b)=>score(b)-score(a))[0];
}
function makeCandidate(local:string[],all:string[],date:string|undefined,index:number,confidence?:number,contextLines:string[]=[]):PosterCandidate{
 const l=local.map(clean).filter(x=>x.length>1), text=l.join(' ');
 const scheduleLines=l.filter(line=>parseTimes([line]).length>0);
 const sch=parseTimes(l), loc=locate(l,contextLines,all), type=inferType(text)||inferType(all.join(' '));
 let title=bestTitle(l,type)||bestTitle(contextLines,type)||bestTitle(all,type);
 if(title&&/agenda da semana|programacao semanal|agenda de mobilizacoes/.test(norm(title))&&loc.venue)title=(type||'Mobilização')+' — '+loc.venue;
 if(!title&&loc.venue)title=(type||'Mobilização')+' — '+loc.venue;
 return {id:'suggestion-'+index+'-'+(date||'sem-data'),title,type,date,time:sch[0]?.time,time_label:sch.map(item=>item.label).join(' / ').slice(0,180)||undefined,city:loc.city,state:loc.state,venue:loc.venue,address:loc.address,confidence,sourceLines:l};
}
function detect(text:string,confidence?:number):PosterCandidate[]{
 const lines=text.split(/\r?\n/).map(clean).filter(x=>x.length>1);
 if(!lines.length)return [];
 const anchors=dateAnchors(lines);
 const sections:Array<{start:number;end:number;date?:string}>=[];
 if(anchors.length){
  anchors.forEach((anchor,index)=>{
   sections.push({start:anchor.index+1,end:anchors[index+1]?.index??lines.length,date:anchor.date});
  });
  if(anchors[0].index>0)sections.unshift({start:0,end:anchors[0].index,date:undefined});
 }else sections.push({start:0,end:lines.length,date:undefined});
 const out:PosterCandidate[]=[];
 for(const section of sections){
  const segment=lines.slice(section.start,section.end);
  if(!segment.length)continue;
  const timeIndexes:number[]=[];
  segment.forEach((line,index)=>{if(parseTimes([line]).length)timeIndexes.push(index)});
  if(!timeIndexes.length){
   if(segment.some(line=>inferType(line)))out.push(makeCandidate(segment,lines,section.date,out.length,confidence,segment));
   continue;
  }
  const eventIndexes:number[]=[];
  for(const index of timeIndexes){
   const line=segment[index]||'';
   const previous=eventIndexes.length?segment[eventIndexes[eventIndexes.length-1]]||'':'';
   // "Concentração" and "saída/partida" on consecutive lines are phases of one mobilization, not two events.
   if(eventIndexes.length&&/(concentra|encontro)/i.test(previous)&&/(sa[ií]da|partida)/i.test(line))continue;
   eventIndexes.push(index);
  }
  eventIndexes.forEach((localStart,position)=>{
   const localEnd=eventIndexes[position+1]??segment.length;
   const local=segment.slice(localStart,localEnd);
   const prefix=segment.slice(0,localStart).slice(-4);
   const context=[...prefix,...local];
   out.push(makeCandidate(local,lines,section.date,out.length,confidence,context));
  });
 }
 const unique:PosterCandidate[]=[];
 const keys=new Set<string>();
 for(const candidate of out){
  const key=[candidate.date||'',candidate.time||'',norm(candidate.city||''),norm(candidate.venue||''),norm(candidate.title||'')].join('|');
  if(!keys.has(key)){keys.add(key);unique.push({...candidate,id:'suggestion-'+unique.length})}
 }
 return unique;
}
export function extractPosterEventsFromText(text:string,confidence?:number):PosterCandidate[]{
 return detect(text,confidence);
}
export async function extractPosterEvents(file:File):Promise<{text:string;confidence?:number;candidates:PosterCandidate[]}>{
 const api=await loadTesseract(),worker=await api.createWorker('por+eng');
 try{const result=await worker.recognize(file);const text=result.data.text||'';return {text,confidence:result.data.confidence,candidates:detect(text,result.data.confidence)}}finally{await worker.terminate()}
}
