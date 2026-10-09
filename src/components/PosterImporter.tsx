import {useCallback,useEffect,useState} from 'react';
import {AlertTriangle,CheckCircle2,ClipboardPaste,Image as ImageIcon,RefreshCw,Upload} from 'lucide-react';
import {extractPosterEvents,extractPosterEventsFromText,normalizePtSentence,normalizePtTitle,type PosterCandidate} from '../lib/posterOcr';
import type {MobilizationEvent} from '../types';

type Props={
  currentImage?:string|null;
  existingEvents:MobilizationEvent[];
  onFileSelected:(file:File,previewUrl:string)=>void;
  onCandidatesFound:(candidates:PosterCandidate[],text:string)=>void;
  onUseCandidate:(candidate:PosterCandidate,file?:File,previewUrl?:string)=>void;
  getAuthToken:()=>Promise<string|null>;
};
const normalized=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function normalizeCandidate(candidate:PosterCandidate):PosterCandidate{
 return {...candidate,
  title:candidate.title?normalizePtTitle(candidate.title):candidate.title,
  type:candidate.type?normalizePtTitle(candidate.type):candidate.type,
  city:candidate.city?normalizePtTitle(candidate.city):candidate.city,
  venue:candidate.venue?normalizePtTitle(candidate.venue):candidate.venue,
  address:candidate.address?normalizePtTitle(candidate.address):candidate.address,
  organization:candidate.organization?normalizePtTitle(candidate.organization):candidate.organization,
  description:candidate.description?normalizePtSentence(candidate.description):candidate.description,
  time_label:candidate.time_label?normalizePtTitle(candidate.time_label):candidate.time_label
 };
}
function tokenSimilarity(a:string,b:string){
 const x=new Set(normalized(a).split(' ').filter(t=>t.length>2)),y=new Set(normalized(b).split(' ').filter(t=>t.length>2));
 if(!x.size||!y.size)return 0;let inter=0;x.forEach(t=>{if(y.has(t))inter++});
 return inter/(x.size+y.size-inter);
}
function possibleDuplicates(candidate:PosterCandidate,events:MobilizationEvent[]){
 const city=normalized(candidate.city||''),venue=normalized(candidate.venue||''),title=normalized(candidate.title||'');
 return events.filter(event=>{
  if(candidate.date&&event.date!==candidate.date)return false;
  const sameCity=city&&normalized(event.city||'')===city;
  const sameVenue=venue&&normalized(event.venue||'')===venue;
  const titleScore=tokenSimilarity(title,event.title||'');
  const sameTime=candidate.time&&event.time&&candidate.time.slice(0,5)===event.time.slice(0,5);
  return Boolean((sameCity&&(sameVenue||titleScore>=0.3||sameTime))||(sameVenue&&titleScore>=0.25)||(sameCity&&titleScore>=0.6));
 }).slice(0,3);
}
export default function PosterImporter({currentImage,existingEvents,onFileSelected,onCandidatesFound,onUseCandidate,getAuthToken}:Props){
 const [preview,setPreview]=useState<string|null>(null),[dimensions,setDimensions]=useState<{width:number;height:number}|null>(null),[status,setStatus]=useState(''),[rawText,setRawText]=useState('');
 const [busy,setBusy]=useState(false),[selected,setSelected]=useState<File|null>(null),[candidates,setCandidates]=useState<PosterCandidate[]>([]),[fileHash,setFileHash]=useState('');
 type ResearchResult={platform:string;title:string;text:string;url:string;author?:string;handle?:string;publishedAt?:string;likes?:number;reposts?:number;relevance?:number};
type ResearchProvider={platform:string;status:string;message:string;count:number};
const [postText,setPostText]=useState(''),[postUrl,setPostUrl]=useState(''),[aiBusy,setAiBusy]=useState(false),[aiStatus,setAiStatus]=useState('');
 const [researchBusy,setResearchBusy]=useState(false),[researchStatus,setResearchStatus]=useState(''),[researchResults,setResearchResults]=useState<ResearchResult[]>([]),[researchProviders,setResearchProviders]=useState<ResearchProvider[]>([]);
 const processFile=useCallback(async(file:File)=>{
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  const supported=file.type.startsWith('image/')||['jpg','jpeg','jfif','png','webp','gif'].includes(ext);
  if(!supported){setStatus('Formato não reconhecido. Use JPG/JPEG/JFIF, PNG, WEBP ou GIF.');return}
  if(file.size>8*1024*1024){setStatus('O pôster deve ter no máximo 8 MB.');return}
  const url=URL.createObjectURL(file);setPreview(url);setSelected(file);setDimensions(null);setRawText('');setCandidates([]);setFileHash('');
  try{const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());setFileHash(Array.from(new Uint8Array(digest)).map(value=>value.toString(16).padStart(2,'0')).join(''))}catch{setFileHash('')}
  onFileSelected(file,url);
  const probe=new Image();probe.onload=()=>setDimensions({width:probe.naturalWidth,height:probe.naturalHeight});probe.src=url;
  setBusy(true);setStatus('Pôster anexado. Lendo o texto e procurando uma ou várias atividades…');
  try{
   const result=await extractPosterEvents(file);const normalizedCandidates=result.candidates.map(normalizeCandidate);setRawText(result.text);setCandidates(normalizedCandidates);onCandidatesFound(normalizedCandidates,result.text);
   const confidence=typeof result.confidence==='number'?' · confiança OCR média '+Math.round(result.confidence)+'%':'';
   if(!normalizedCandidates.length)setStatus('O OCR não encontrou campos estruturados. O pôster está anexado; confira o texto reconhecido e preencha o formulário manualmente.');
   else setStatus('Leitura concluída: '+normalizedCandidates.length+' sugestão(ões) de evento detectada(s)'+confidence+'. Campos são provisórios; confira antes de salvar.');
  }catch(error){setStatus(error instanceof Error?error.message:'Falha no OCR. O pôster foi anexado e você pode preencher manualmente.')}
  finally{setBusy(false)}
 },[onCandidatesFound,onFileSelected]);
 const interpretCombined=async()=>{
  const combinedPost=postText.trim();
  const combinedPoster=rawText.trim();
  if(!combinedPost&&!combinedPoster&&!postUrl.trim()){
   setAiStatus('Cole o texto da publicação, informe o link de um post público ou selecione um pôster.');
   return;
  }
  setAiBusy(true);setAiStatus('Combinando o texto do post e o texto do pôster para identificar todas as mobilizações…');
  try{
   const token=await getAuthToken();
   if(!token)throw new Error('A sessão expirou. Entre novamente no painel administrativo.');
   const response=await fetch('/api/interpret-events',{
    method:'POST',
    headers:{'content-type':'application/json','authorization':'Bearer '+token},
    body:JSON.stringify({postText:combinedPost,postUrl:postUrl.trim(),posterText:combinedPoster})
   });
   const payload=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(typeof payload.error==='string'?payload.error:'A interpretação por IA não está disponível no momento.');
   const mapped:PosterCandidate[]=(Array.isArray(payload.events)?payload.events:[]).map((event:any,index:number)=>({
    id:String(event.id||'ai-suggestion-'+index),
    title:typeof event.title==='string'?normalizePtTitle(event.title):undefined,
    type:typeof event.type==='string'?normalizePtTitle(event.type):undefined,
    date:typeof event.date==='string'&&event.date?event.date:undefined,
    time:typeof event.time==='string'&&event.time?event.time:undefined,
    time_label:typeof event.time_label==='string'&&event.time_label?normalizePtTitle(event.time_label):undefined,
    city:typeof event.city==='string'&&event.city?normalizePtTitle(event.city):undefined,
    state:typeof event.state==='string'&&event.state?event.state:undefined,
    venue:typeof event.venue==='string'&&event.venue?normalizePtTitle(event.venue):undefined,
    address:typeof event.address==='string'&&event.address?normalizePtTitle(event.address):undefined,
    organization:typeof event.organization==='string'&&event.organization?normalizePtTitle(event.organization):undefined,
    hashtags:Array.isArray(event.hashtags)?event.hashtags.filter((value:unknown)=>typeof value==='string'):[],
    evidence:Array.isArray(event.evidence)?event.evidence.filter((value:unknown)=>typeof value==='string'):[],
    missing_fields:Array.isArray(event.missing_fields)?event.missing_fields.filter((value:unknown)=>typeof value==='string'):[],
    inferred_title:Boolean(event.inferred_title),
    description:typeof event.description==='string'&&event.description?normalizePtSentence(event.description):undefined,
    ai_confidence:typeof event.confidence==='string'?event.confidence:'baixa',
    source_url:typeof event.source_url==='string'&&event.source_url?event.source_url:(typeof payload.sourceUrl==='string'&&payload.sourceUrl?payload.sourceUrl:postUrl.trim()||undefined),
    sourceLines:Array.isArray(event.evidence)?event.evidence.filter((value:unknown)=>typeof value==='string'):[],
  }));
  setCandidates(mapped);
  onCandidatesFound(mapped,[combinedPost,combinedPoster].filter(Boolean).join('\n\n'));
  const urlWarning=payload.urlError?' '+payload.urlError:'';
  setAiStatus(mapped.length+' sugestão(ões) estruturada(s) pela IA. Confira evidências, campos ausentes e possíveis duplicatas antes de salvar.'+urlWarning);
  if(!mapped.length)setAiStatus('A IA não encontrou um evento claro. Revise o texto bruto e acrescente contexto; nenhum evento foi salvo.');
  }catch(error){
   const sourceText=[combinedPost,combinedPoster].filter(Boolean).join('\n\n');
   const fallback=sourceText?extractPosterEventsFromText(sourceText):[];
   const tagged=fallback.map((candidate,index)=>({...candidate,id:'text-fallback-'+index,source_url:postUrl.trim()||undefined,sourceLines:candidate.sourceLines}));
   setCandidates(tagged);
   if(tagged.length){
    onCandidatesFound(tagged,sourceText);
    setAiStatus((error instanceof Error?error.message:'A IA não respondeu.')+' Usei uma leitura básica do texto como alternativa; confira tudo manualmente.');
   }else{
    setAiStatus(error instanceof Error?error.message:'A IA não respondeu. Tente novamente ou cole o texto da publicação.');
   }
  }finally{setAiBusy(false)}
 };
 const loadPastedImageUrl=useCallback(async(url:string)=>{
  try{
   const response=await fetch(url,{mode:'cors'});
   if(!response.ok)throw new Error('O site de origem não permitiu baixar a imagem diretamente.');
   const blob=await response.blob();
   if(!blob.type.startsWith('image/'))throw new Error('O link copiado não aponta diretamente para um arquivo de imagem. Use “Copiar imagem” ou selecione o arquivo baixado.');
   const nameFromUrl=(new URL(url)).pathname.split('/').pop()||'poster';
   const ext=nameFromUrl.match(/\.(jpg|jpeg|jfif|png|webp|gif)$/i)?.[1]||(blob.type.split('/')[1]||'jpg');
   await processFile(new File([blob],nameFromUrl.includes('.')?nameFromUrl:'poster.'+ext,{type:blob.type||'image/jpeg'}));
  }catch(error){setStatus(error instanceof Error?error.message:'Não consegui ler a imagem pelo link copiado. Salve o pôster e selecione o arquivo.')}
 },[processFile]);
 useEffect(()=>{
  const onPaste=(event:ClipboardEvent)=>{
   const items=Array.from(event.clipboardData?.items||[]);
   const item=items.find(entry=>entry.kind==='file'&&entry.type.startsWith('image/'));
   const file=item?.getAsFile();
   if(file){event.preventDefault();void processFile(file);return}
   const html=event.clipboardData?.getData('text/html')||'';
   const imgSrc=html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
   const text=(event.clipboardData?.getData('text/uri-list')||event.clipboardData?.getData('text/plain')||'').split(/\r?\n/).find(line=>/^https?:\/\//i.test(line.trim()))?.trim();
   const url=imgSrc||text;
   if(url&&/^https?:\/\//i.test(url)&&(/\.(jpe?g|jfif|png|webp|gif)(?:[?#]|$)/i.test(url)||/pbs\.twimg\.com\/media\//i.test(url))){
    event.preventDefault();void loadPastedImageUrl(url);
   }
  };
  window.addEventListener('paste',onPaste);return()=>window.removeEventListener('paste',onPaste);
 },[processFile,loadPastedImageUrl]);
 const visibleImage=preview||currentImage||null;
 const shortSide=dimensions?Math.min(dimensions.width,dimensions.height):0;
 return <div className="poster-upload full">
  <div className="poster-upload-label"><ImageIcon size={17}/><strong>Importar pôster e extrair eventos</strong></div>
  <p className="poster-import-help">Cole uma imagem com Ctrl+V ou escolha um arquivo. A leitura tenta identificar título, data, horário, cidade, local e tipo. Em cartazes de programação coletiva, pode sugerir vários eventos. Nada é salvo/publicado até você conferir e clicar em “Salvar evento”.</p>
  {visibleImage&&<img src={visibleImage} alt="Pré-visualização do pôster original" className="poster-preview"/>}
  {dimensions&&<small className={shortSide<550?'poster-quality-warning':shortSide<800?'poster-quality-review':'poster-meta'}>Resolução do arquivo original: <strong>{dimensions.width} × {dimensions.height} px</strong> (menor lado: {shortSide} px). {shortSide<550?'Atenção: resolução baixa; procure a versão original maior antes de publicar.':shortSide<800?'Resolução intermediária; confira a nitidez do texto ampliado, especialmente em cartazes com muitas informações.':'Resolução adequada para conferência; o arquivo original será enviado sem recorte nem redimensionamento.'}</small>}
  <div className="social-post-import">
   <div className="poster-upload-label"><ClipboardPaste size={17}/><strong>Contexto do post / tweet (opcional, mas recomendado)</strong></div>
   <p className="poster-import-help">Cole o texto da publicação para complementar o pôster. Se só tiver a URL pública do X/Twitter, a ferramenta tentará buscar o texto do post; se o acesso falhar, cole o texto manualmente. A URL, sozinha, não garante que o conteúdo esteja acessível.</p>
   <label className="social-post-url">URL do post<input type="url" placeholder="https://x.com/conta/status/…" value={postUrl} onChange={e=>setPostUrl(e.target.value)}/></label>
   <label className="social-post-text">Texto do post / tweet<textarea rows={4} placeholder="Cole aqui a legenda, a descrição ou o texto completo da publicação. Pode conter vários anúncios de mobilização." value={postText} onChange={e=>setPostText(e.target.value)}/></label>
   <button type="button" className="button primary" disabled={aiBusy||busy} onClick={()=>void interpretCombined()}>{aiBusy?'Interpretando…':'Interpretar post + pôster com IA'}</button>
   {aiStatus&&<small className={aiBusy?'poster-meta':'poster-ocr-status'}>{aiStatus}</small>}
  </div>
  <label className="poster-file-button"><Upload size={16}/> Selecionar JPG / JFIF / PNG / WEBP / GIF<input type="file" accept=".jpg,.jpeg,.jfif,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif" onChange={e=>{const file=e.target.files?.[0];if(file)void processFile(file);e.currentTarget.value=''}}/></label>
  <div className="poster-paste-zone" tabIndex={0} onPaste={e=>{const item=Array.from(e.clipboardData.items).find(entry=>entry.kind==='file'&&entry.type.startsWith('image/'));const file=item?.getAsFile();if(file){e.preventDefault();e.stopPropagation();void processFile(file)}}}><ClipboardPaste size={17}/> Clique aqui e use <strong>Ctrl+V</strong> para colar um pôster copiado.</div>
  {selected&&<button type="button" className="button ghost poster-ocr-button" disabled={busy} onClick={()=>void processFile(selected)}><RefreshCw size={15}/>{busy?'Extraindo texto…':'Ler texto novamente'}</button>}
  {status&&<small className={busy?'poster-meta':'poster-ocr-status'}>{status}</small>}
  <small>{selected?'Arquivo original selecionado.':'Nenhum pôster novo selecionado.'} Limite de 8 MB por imagem. A ferramenta não altera nem apaga pôsteres já cadastrados.</small>
  {candidates.length>0&&<div className="poster-candidates">
   <div className="poster-candidates-heading"><strong>Possíveis eventos encontrados</strong><span>{candidates.length} sugestão(ões)</span></div>
   <p className="poster-import-help">Confira todas as linhas. Se o cartaz listar uma semana inteira, escolha só as atividades que deseja cadastrar. “Possível duplicado” é um alerta, não uma exclusão automática.</p>
   {candidates.map((candidate,index)=>{
    const duplicates=possibleDuplicates(candidate,existingEvents);
    const samePosterEvents=fileHash?existingEvents.filter(event=>event.poster_sha256===fileHash).slice(0,4):[];
    return <article className="poster-candidate" key={candidate.id}>
     <div className="poster-candidate-top"><strong>{index+1}. {candidate.title||'Título não identificado — revisar'}</strong>{duplicates.length>0?<span className="poster-duplicate"><AlertTriangle size={13}/> Possível duplicado</span>:<span className="poster-new"><CheckCircle2 size={13}/> Sem correspondência óbvia</span>}</div>
     <p>{[candidate.date,candidate.time_label||candidate.time,candidate.city&&candidate.state?candidate.city+' / '+candidate.state:candidate.city,candidate.venue].filter(Boolean).join(' · ')||'Poucos campos reconhecidos; revise manualmente.'}</p>
     {duplicates.length>0&&<div className="poster-duplicate-details">Possível coincidência pelos dados do evento: {duplicates.map(e=>e.title+' ('+e.city+', '+e.date+')').join(' · ')}</div>}{samePosterEvents.length>0&&<div className="poster-meta">Este mesmo arquivo de pôster já está associado a: {samePosterEvents.map(e=>e.title+' ('+e.city+', '+e.date+')').join(' · ')}. Isso não significa, por si só, que este evento seja duplicado.</div>}
     {candidate.sourceLines.length>0&&<details><summary>Linhas / evidências desta sugestão</summary><p>{candidate.sourceLines.join(' / ')}</p></details>}{candidate.ai_confidence&&<small className={candidate.ai_confidence==='baixa'?'poster-quality-warning':'poster-meta'}>Confiança indicada pela IA: <strong>{candidate.ai_confidence}</strong>{candidate.inferred_title?' · título sintetizado a partir do contexto':''}</small>}{candidate.missing_fields&&candidate.missing_fields.length>0&&<div className="poster-duplicate-details">Conferir: {candidate.missing_fields.join(' · ')}</div>}{candidate.organization&&<small>Organização identificada: {candidate.organization}</small>}{candidate.hashtags&&candidate.hashtags.length>0&&<small>Hashtags: {candidate.hashtags.join(' ')}</small>}{candidate.source_url&&<small>Fonte: <a href={candidate.source_url} target="_blank" rel="noreferrer">abrir publicação</a></small>}
     <button type="button" className="button ghost" disabled={aiBusy||busy} onClick={()=>onUseCandidate(candidate,selected||undefined,preview||undefined)}>Usar esta sugestão no editor</button>
    </article>
   })}
  </div>}
  {rawText&&<details className="poster-ocr-result"><summary>Ver texto bruto reconhecido pelo OCR</summary><pre>{rawText}</pre></details>}
 </div>;
}
