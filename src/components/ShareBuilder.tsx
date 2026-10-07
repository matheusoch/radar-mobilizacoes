import {useEffect,useMemo,useRef,useState} from 'react';
import {CalendarDays,Check,Download,Image as ImageIcon,Link as LinkIcon,Share2,Star,X} from 'lucide-react';
import type {MobilizationEvent} from '../types';

const MAX_EVENTS=5;
const RED='#c91019';
const DARK_RED='#a70d14';
const CREAM='#fff8ed';
const WHITE='#fffdf8';
const YELLOW='#ffd523';

function dateObj(date:string){return new Date(date+'T12:00:00');}
function formatTime(event:MobilizationEvent){return event.time_label||event.time||'horário não informado';}
function displayLocation(event:MobilizationEvent){return [event.city,event.state].filter(Boolean).join(' · ');}
function formatDateLabel(date:string){
  const d=dateObj(date);
  const weekday=d.toLocaleDateString('pt-BR',{weekday:'long'}).replace('-feira','').toUpperCase();
  return weekday+' - '+d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
}
function wrapLines(ctx:CanvasRenderingContext2D,text:string,maxWidth:number,maxLines=2){
  const words=text.trim().split(/\s+/).filter(Boolean);
  const lines:string[]=[];
  let line='';
  for(const word of words){
    const next=line?line+' '+word:word;
    if(ctx.measureText(next).width<=maxWidth||!line) line=next;
    else {lines.push(line);line=word;}
  }
  if(line)lines.push(line);
  if(lines.length<=maxLines)return lines;
  const clipped=lines.slice(0,maxLines);
  let last=clipped[maxLines-1];
  while(ctx.measureText(last+'…').width>maxWidth&&last.length>5)last=last.slice(0,-1);
  clipped[maxLines-1]=last+'…';
  return clipped;
}
function roundRect(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){
  ctx.beginPath();
  if(typeof ctx.roundRect==='function'){ctx.roundRect(x,y,w,h,r);return;}
  ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}
function pill(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,w:number,h:number,font:string){
  ctx.fillStyle=WHITE;
  roundRect(ctx,x,y,w,h,h/2);
  ctx.fill();
  ctx.fillStyle:DARK_RED;
  ctx.font=font;
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillText(text,x+w/2,y+h/2+1);
  ctx.textAlign='left';
  ctx.textBaseline='alphabetic';
}
function renderCard(canvas:HTMLCanvasElement,events:MobilizationEvent[],host:string){
  const width=1080;
  const groups=[...new Map(events.slice().sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||''))).map(event=>[event.date,event])).keys()].sort();
  const rows=events.length;
  const groupGap=26;
  const headerHeight=285;
  const rowHeight=176;
  const footerHeight=190;
  const height=Math.max(1350,headerHeight+groups.length*groupGap+rows*rowHeight+footerHeight);
  canvas.width=width;
  canvas.height=height;
  const ctx=canvas.getContext('2d');
  if(!ctx)return;

  ctx.fillStyle=RED;
  ctx.fillRect(0,0,width,height);

  const panelX=76,panelY=330,panelW=928,panelH=height-405;
  ctx.fillStyle=DARK_RED;
  roundRect(ctx,panelX,panelY,panelW,panelH,48);
  ctx.fill();

  ctx.fillStyle=WHITE;
  ctx.textAlign='center';
  ctx.font='900 italic 106px Impact, "Arial Narrow", Arial, sans-serif';
  ctx.fillText('AGENDA',width/2,135);
  ctx.font='italic 700 52px "Arial Narrow", Arial, sans-serif';
  ctx.fillText('DE MOBILIZAÇÕES',width/2,218);

  ctx.fillStyle=YELLOW;
  ctx.font='900 20px "Arial Narrow", Arial, sans-serif';
  ctx.fillText('ESCOLHA, COMPARTILHE E AJUDE A DIVULGAR',width/2,270);

  let y=374;
  for(const date of groups){
    const dayEvents=events.filter(event=>event.date===date).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
    const pillW=292;
    pill(ctx,formatDateLabel(date),(width-pillW)/2,y-2,pillW,64,'900 italic 31px "Arial Narrow", Arial, sans-serif');
    y+=88;

    for(const event of dayEvents){
      const timeW=150;
      pill(ctx,formatTime(event),112,y,timeW,68,'900 italic 31px "Arial Narrow", Arial, sans-serif');

      const textX=290;
      const maxWidth=680;
      ctx.fillStyle=WHITE;
      ctx.font='900 italic 31px "Arial Narrow", Arial, sans-serif';
      const titleLine=[event.title,'—',displayLocation(event)].filter(Boolean).join(' ');
      const titleLines=wrapLines(ctx,titleLine,maxWidth,2);
      titleLines.forEach((line,i)=>ctx.fillText(line,textX,y+26+i*34));

      ctx.fillStyle='#ffe9e3';
      ctx.font='italic 700 23px "Arial Narrow", Arial, sans-serif';
      const venueLines=wrapLines(ctx,event.venue||'Local não informado',maxWidth,1);
      ctx.fillText(venueLines[0],textX,y+82);

      ctx.fillStyle=YELLOW;
      ctx.font='900 italic 20px "Arial Narrow", Arial, sans-serif';
      ctx.fillText((event.type||'Mobilização').toUpperCase(),textX,y+116);

      y+=rowHeight;
    }
    y+=groupGap;
  }

  const footerY=height-172;
  ctx.fillStyle=WHITE;
  ctx.textAlign='center';
  ctx.font='900 italic 28px "Arial Narrow", Arial, sans-serif';
  ctx.fillText('Participe da mobilização e ajude a ocupar as ruas.',width/2,footerY);
  ctx.font='italic 700 22px "Arial Narrow", Arial, sans-serif';
  ctx.fillText('Confira os demais eventos em:',width/2,footerY+39);
  ctx.fillStyle=YELLOW;
  ctx.font='900 italic 22px "Arial Narrow", Arial, sans-serif';
  const url='agenda-mobilizacoes.'+host.split('.').slice(-3).join('.');
  ctx.fillText(host?host:url,width/2,footerY+72);
  ctx.textAlign='left';
}
function groupSort(events:MobilizationEvent[]){
  return events.slice().sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')));
}

export default function ShareBuilder({events}:{events:MobilizationEvent[]}) {
  const params=new URLSearchParams(window.location.search);
  const initialIds=(params.get('eventos')||'').split(',').map(decodeURIComponent).filter(Boolean);
  const[query,setQuery]=useState('');
  const[selected,setSelected]=useState<string[]>(initialIds.slice(0,MAX_EVENTS));
  const[feedback,setFeedback]=useState('');
  const canvasRef=useRef<HTMLCanvasElement>(null);

  const candidates=useMemo(()=>{
    const today=new Date().toISOString().slice(0,10);
    const q=query.trim().toLowerCase();
    return groupSort(events.filter(event=>{
      if(!event.public||event.date<today)return false;
      if(!q)return true;
      return [event.title,event.city,event.state,event.venue,event.type].filter(Boolean).join(' ').toLowerCase().includes(q);
    }));
  },[events,query]);

  const chosen=groupSort(selected.map(id=>events.find(event=>event.id===id)).filter((event):event is MobilizationEvent=>Boolean(event)));

  useEffect(()=>{
    if(!canvasRef.current||!chosen.length)return;
    try{renderCard(canvasRef.current,chosen,window.location.host);setFeedback('');}
    catch{setFeedback('A prévia visual não pôde ser gerada neste navegador.');}
  },[chosen]);

  useEffect(()=>{
    const next=selected.length?'/divulgar?eventos='+selected.map(encodeURIComponent).join(','):'/divulgar';
    window.history.replaceState(null,'',next);
  },[selected]);

  const toggle=(id:string)=>{
    setSelected(current=>{
      if(current.includes(id))return current.filter(item=>item!==id);
      if(current.length>=MAX_EVENTS)return current;
      return [...current,id];
    });
    setFeedback('');
  };
  const copyLink=async()=>{
    const url=window.location.href;
    try{await navigator.clipboard.writeText(url);setFeedback('Link do painel copiado.');}
    catch{setFeedback('Não foi possível copiar automaticamente.');}
    window.setTimeout(()=>setFeedback(''),2500);
  };
  const share=async()=>{
    const url=window.location.href;
    if(navigator.share){
      try{await navigator.share({title:'Agenda de Mobilizações',text:'Confira este painel de mobilizações na Agenda.',url});}catch{}
    }else await copyLink();
  };
  const download=()=>{
    if(!canvasRef.current)return;
    const link=document.createElement('a');
    link.download='agenda-de-mobilizacoes.png';
    link.href=canvasRef.current.toDataURL('image/png');
    link.click();
  };

  return <div className="container page share-builder-page">
    <div className="eyebrow"><Star className="red-star" size={15} fill="currentColor" aria-hidden="true"/> CRIAR DIVULGAÇÃO</div>
    <div className="share-builder-heading">
      <div>
        <h1>Crie seu painel de mobilizações.</h1>
        <p className="page-lead">Escolha até {MAX_EVENTS} eventos e gere uma peça pronta para compartilhar. Cada card mostra data, horário, cidade, local e tipo de mobilização.</p>
      </div>
      <div className="share-counter"><strong>{selected.length}/{MAX_EVENTS}</strong><span>selecionados</span></div>
    </div>
    <div className="share-builder-layout">
      <section className="share-picker">
        <div className="share-picker-head"><strong>Escolha os eventos</strong><span>{candidates.length} disponíveis</span></div>
        <div className="share-search"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar cidade, estado ou evento..." aria-label="Buscar eventos para divulgação"/>{query&&<button type="button" onClick={()=>setQuery('')} aria-label="Limpar busca"><X size={16}/></button>}</div>
        <div className="share-selected-list">
          {chosen.length?chosen.map(event=><button className="share-selected-chip" type="button" key={event.id} onClick={()=>toggle(event.id)}><span>{displayLocation(event)} · {formatTime(event)}</span><X size={15}/></button>):<div className="share-empty">Selecione eventos abaixo para começar.</div>}
        </div>
        <div className="share-event-list">
          {candidates.map(event=>{
            const isSelected=selected.includes(event.id);
            const disabled=!isSelected&&selected.length>=MAX_EVENTS;
            return <button key={event.id} type="button" className={isSelected?'share-event selected':'share-event'} onClick={()=>toggle(event.id)} disabled={disabled}>
              <span className="share-event-check">{isSelected?<Check size={15}/>:<span/>}</span>
              <span className="share-event-copy"><strong>{displayLocation(event)}</strong><small>{event.title}</small><small>{event.venue}</small><small className="share-event-type">{event.type||'Mobilização'}</small></span>
              <span className="share-event-time">{formatTime(event)}</span>
            </button>;
          })}
          {!candidates.length&&<div className="share-empty">Nenhum evento encontrado.</div>}
        </div>
      </section>
      <aside className="share-preview-panel">
        <div className="share-preview-head"><div><div className="eyebrow">PRÉVIA</div><strong>Seu painel</strong></div><ImageIcon size={19}/></div>
        <div className="share-canvas-wrap">
          {chosen.length?<canvas ref={canvasRef} className="share-canvas"/>:<div className="share-canvas-placeholder"><CalendarDays size={30}/><strong>Seu painel aparecerá aqui</strong><span>Selecione pelo menos um evento.</span></div>}
        </div>
        <div className="share-actions">
          <button className="button primary" type="button" onClick={download} disabled={!chosen.length}><Download size={17}/>Baixar PNG</button>
          <button className="button ghost" type="button" onClick={share} disabled={!chosen.length}><Share2 size={17}/>Compartilhar</button>
          <button className="button ghost" type="button" onClick={copyLink} disabled={!chosen.length}><LinkIcon size={17}/>Copiar link</button>
        </div>
        {feedback&&<div className="share-feedback" aria-live="polite"><LinkIcon size={14}/>{feedback}</div>}
        <p className="share-help">O painel segue a identidade visual da Agenda e fica vinculado a um link próprio, para facilitar a circulação nas redes.</p>
      </aside>
    </div>
  </div>;
}
