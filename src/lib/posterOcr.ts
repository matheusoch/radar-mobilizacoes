export type PosterCandidate = {
  id: string; title?: string; type?: string; date?: string; time?: string; time_label?: string;
  city?: string; state?: string; venue?: string; address?: string; confidence?: number; sourceLines: string[];
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
const TIME_RE=/\b([01]?\d|2[0-3])\s*(?:h\s*([0-5]\d)?|:([0-5]\d))\b/gi;
function prettyCity(s:string){
 const map:Record<string,string>={'sao paulo':'São Paulo','rio de janeiro':'Rio de Janeiro','belo horizonte':'Belo Horizonte','duque de caxias':'Duque de Caxias','nova iguacu':'Nova Iguaçu','sao luis':'São Luís','sao goncalo':'São Gonçalo','feira de santana':'Feira de Santana','campo grande':'Campo Grande','campo mourao':'Campo Mourão','ouro preto':'Ouro Preto','ponta grossa':'Ponta Grossa','balneario camboriu':'Balneário Camboriú','sao jose dos campos':'São José dos Campos','sao joao del rei':'São João del-Rei','rio grande':'Rio Grande','sao mateus':'São Mateus','goiania':'Goiânia','cuiaba':'Cuiabá','belem':'Belém','braganca':'Bragança','macapa':'Macapá','niteroi':'Niterói','maringa':'Maringá','brasilia':'Brasília','vitoria':'Vitória','uberlandia':'Uberlândia','arapiraca':'Arapiraca','florianopolis':'Florianópolis','seropedica':'Seropédica','tres rios':'Três Rios'};
 return map[norm(s)]||clean(s);
}
function inferType(s:string):string|undefined{
 const t=norm(s);
 if(/caminhada|passeata/.test(t))return 'Caminhada';
 if(/panfletagem|bandeiracao/.test(t))return 'Panfletagem';
 if(/plenaria/.test(t))return 'Plenária';
 if(/assembleia/.test(t))return 'Assembleia';
 if(/oficina|colagem de lambes/.test(t))return 'Oficina';
 if(/debate|roda de conversa/.test(t))return 'Debate';
 if(/reuniao/.test(t))return 'Reunião';
 if(/ato publico|ato político|ato politico|\bato\b/.test(t))return 'Ato';
 if(/manifestacao|protesto/.test(t))return 'Manifestação';
 if(/universidade|universitario|estudantes|campus|uf[a-z]{2}/.test(t))return 'Atividade universitária';
 if(/samba|show|cultural/.test(t))return 'Atividade cultural/política';
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
function locate(lines:string[],allLines:string[]){
 let city:string|undefined,state:string|undefined;
 for(const line of allLines){
  const m=line.match(/(?:^|[,;|])\s*([^,;|]{2,45}?)\s*[-/·]\s*([A-Z]{2})\b/);
  if(m&&states.has(m[2].toUpperCase())){city=prettyCity(m[1]);state=m[2].toUpperCase();break}
 }
 if(!city){
  for(const line of allLines){
   const n=norm(line);const found=Object.keys(cityUF).sort((a,b)=>b.length-a.length).find(c=>n.includes(c));
   if(found){city=prettyCity(found);state=cityUF[found];break}
  }
 }
 const address=lines.find(x=>/\b(rua|avenida|av\.|travessa|alameda|rodovia|endereco|endereço|cep)\b/i.test(x));
 const venue=lines.find(x=>/\b(praca|praça|largo|campus|uf[a-z]{2}|masp|estacao|estação|terminal|sindicato|audit[oó]rio|teatro|reitoria|rodoviaria|rodoviária|dce|hotel|parque|mercado|centro|ponto de encontro)\b/i.test(x));
 return {city,state,venue:venue?clean(venue):address?clean(address):undefined,address:address?clean(address):undefined};
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
function makeCandidate(local:string[],all:string[],date:string|undefined,index:number,confidence?:number):PosterCandidate{
 const l=local.map(clean).filter(x=>x.length>1), text=l.join(' ');
 const sch=parseTimes(l), loc=locate(l,all), type=inferType(text)||inferType(all.join(' '));
 let title=bestTitle(l,type)||bestTitle(all,type);
 if(title&&/agenda da semana|programacao semanal/i.test(norm(title))&&loc.venue)title=(type||'Mobilização')+' — '+loc.venue;
 if(!title&&loc.venue)title=(type||'Mobilização')+' — '+loc.venue;
 return {id:'suggestion-'+index+'-'+(date||'sem-data'),title:type&&loc.venue&&title&&norm(title)===norm(loc.venue)?type+' — '+loc.venue:title,type,date,time:sch[0]?.time,time_label:sch.length?sch.map(x=>x.label).join(' / ').slice(0,180):undefined,city:loc.city,state:loc.state,venue:loc.venue,address:loc.address,confidence,sourceLines:l};
}
function detect(text:string,confidence?:number):PosterCandidate[]{
 const lines=text.split(/\r?\n/).map(clean).filter(x=>x.length>1);if(!lines.length)return [];
 const anchors=dateAnchors(lines), out:PosterCandidate[]=[];
 if(anchors.length>=2){
  anchors.forEach((a,index)=>{
   const next=anchors[index+1],start=Math.max(0,a.index-1),end=next?next.index:Math.min(lines.length,a.index+7),group=lines.slice(start,end);
   const times=group.filter(line=>parseTimes([line]).length>0);
   const splitTimes=times.length>1&&!times.some(line=>/(concentra|sa[ií]da|partida|abertura|encerramento|encontro)/i.test(line));
   if(splitTimes){
    times.forEach(line=>{const i=group.indexOf(line);const local=group.slice(Math.max(0,i-2),Math.min(group.length,i+3));out.push(makeCandidate(local,lines,a.date,out.length,confidence))});
   }else out.push(makeCandidate(group,lines,a.date,out.length,confidence));
  });
 }else{
  const timeLines=lines.filter(line=>parseTimes([line]).length>0);
  const splitTimes=timeLines.length>=2&&!timeLines.some(line=>/(concentra|sa[ií]da|partida|abertura|encerramento|encontro)/i.test(line));
  if(splitTimes)timeLines.forEach(line=>{const i=lines.indexOf(line);out.push(makeCandidate(lines.slice(Math.max(0,i-2),Math.min(lines.length,i+3)),lines,anchors[0]?.date,out.length,confidence))});
  else out.push(makeCandidate(lines,lines,anchors[0]?.date,out.length,confidence));
 }
 const unique:PosterCandidate[]=[];
 for(const c of out){const key=[c.date||'',c.time||'',norm(c.city||''),norm(c.venue||''),norm(c.title||'')].join('|');if(!unique.some(x=>[x.date||'',x.time||'',norm(x.city||''),norm(x.venue||''),norm(x.title||'')].join('|')===key))unique.push({...c,id:'suggestion-'+unique.length})}
 return unique;
}
export async function extractPosterEvents(file:File):Promise<{text:string;confidence?:number;candidates:PosterCandidate[]}>{
 const api=await loadTesseract(),worker=await api.createWorker('por+eng');
 try{const result=await worker.recognize(file);const text=result.data.text||'';return {text,confidence:result.data.confidence,candidates:detect(text,result.data.confidence)}}finally{await worker.terminate()}
}
