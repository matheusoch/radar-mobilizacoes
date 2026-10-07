import {useEffect,useMemo,useRef,useState} from 'react';
import {CalendarDays,Check,Copy,Download,Image as ImageIcon,Link as LinkIcon,Share2,Star,X} from 'lucide-react';
import type {MobilizationEvent} from '../types';

const MAX_EVENTS=5;

function formatDate(date:string){
  return new Date(date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'long'});
}

function panelDate(events:MobilizationEvent[]){
  const dates=[...new Set(events.map(event=>event.date))].sort();
  if(!dates.length)return '';
  if(dates.length===1)return formatDate(dates[0]).toUpperCase();
  const first=new Date(dates[0]+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit'});
  const last=formatDate(dates[dates.length-1]).replace(/^\d{2} de /,'');
  return first+'–'+last.toUpperCase();
}

function formatTime(event:MobilizationEvent){
  return event.time_label||event.time||'horário não informado';
}

function displayLocation(event:MobilizationEvent){
  return [event.city,event.state].filter(Boolean).join(' · ');
}

function drawText(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,maxWidth:number,font:string){
  ctx.font=font;
  ctx.fillStyle='#171717';
  const words=text.split(' ');
  let line='';
  const lines:string[]=[];
  for(const word of words){
    const test=line?line+' '+word:word;
    if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word}else line=test;
  }
  if(line)lines.push(line);
  lines.slice(0,2).forEach((item,index)=>ctx.fillText(item,x,y+index*28));
}

function renderCard(canvas:HTMLCanvasElement,events:MobilizationEvent[]){
  const width=1080;
  const rowHeight=150;
  const height=Math.max(980,230+events.length*rowHeight+150);
  canvas.width=width;
  canvas.height=height;
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  ctx.fillStyle='#fffefa';
  ctx.fillRect(0,0,width,height);

  ctx.fillStyle='#b51f38';
  ctx.fillRect(0,0,width,18);
  ctx.fillStyle='#b51f38';
  ctx.font='900 34px Arial, sans-serif';
  ctx.fillText('★',70,78);
  ctx.fillStyle='#171717';
  ctx.font='700 28px Inter, Arial, sans-serif';
  ctx.fillText('AGENDA DE MOBILIZAÇÕES',112,78);
  ctx.fillStyle='#b51f38';
  ctx.font='900 64px Inter, Arial, sans-serif';
  ctx.fillText(panelDate(events),70,145);
  ctx.fillStyle='#5f6368';
  ctx.font='500 25px Inter, Arial, sans-serif';
  ctx.fillText(events.length+' mobilizaç'+(events.length===1?'ão':'ões')+' selecionada'+(events.length===1?'':'s'),70,190);

  let y=250;
  events.forEach((event,index)=>{
    ctx.fillStyle='#f4f0eb';
    ctx.beginPath();
    ctx.rect(55,y-35,width-110,rowHeight-18);
    ctx.fill();
    ctx.fillStyle='#b51f38';
    ctx.beginPath();
    ctx.arc(92,y+18,22,0,Math.PI*2);
    ctx.fill();
    ctx.fillStyle='#fff';
    ctx.font='900 24px Arial';
    ctx.textAlign='center';
    ctx.fillText(String(index+1),92,y+27);
    ctx.textAlign='left';
    ctx.fillStyle='#171717';
    ctx.font='800 32px Inter, Arial, sans-serif';
    ctx.fillText(displayLocation(event),135,y+10);
    ctx.fillStyle='#555b61';
    ctx.font='600 24px Inter, Arial, sans-serif';
    drawText(ctx,event.venue,135,y+48,width-235,'600 24px Inter, Arial, sans-serif');
    ctx.fillStyle='#777c82';
    ctx.font='700 19px Inter, Arial, sans-serif';
    ctx.fillText(event.type||'Mobilização',135,y+92);
    ctx.fillStyle='#b51f38';
    ctx.font='800 25px Inter, Arial, sans-serif';
    ctx.fillText(formatTime(event),width-270,y+10);
    y+=rowHeight;
  });

  ctx.fillStyle='#b51f38';
  ctx.font='800 23px Inter, Arial, sans-serif';
  ctx.fillText('Participe da mobilização e ajude a ocupar as ruas.',70,height-112);
  ctx.fillStyle='#171717';
  ctx.font='800 20px Inter, Arial, sans-serif';
  ctx.fillText('Confira os demais eventos e fontes na Agenda.',70,height-78);
  ctx.fillStyle='#6b7075';
  ctx.font='500 18px Inter, Arial, sans-serif';
  ctx.fillText('agenda-mobilizacoes.fandomscomlula.workers.dev',70,height-48);
}

export default function ShareBuilder({events}:{events:MobilizationEvent[]}){
  const params=new URLSearchParams(window.location.search);
  const initialIds=(params.get('eventos')||'').split(',').map(decodeURIComponent).filter(Boolean);
  const[query,setQuery]=useState('');
  const[selected,setSelected]=useState<string[]>(initialIds.slice(0,MAX_EVENTS));
  const[feedback,setFeedback]=useState('');
  const canvasRef=useRef<HTMLCanvasElement>(null);

  const candidates=useMemo(()=>{
    const today=new Date().toISOString().slice(0,10);
    const q=query.trim().toLowerCase();
    return events.filter(event=>{
      if(!event.public||event.date<today)return false;
      if(!q)return true;
      return [event.title,event.city,event.state,event.venue,event.type].filter(Boolean).join(' ').toLowerCase().includes(q);
    }).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  },[events,query]);

  const chosen=selected.map(id=>events.find(event=>event.id===id)).filter((event):event is MobilizationEvent=>Boolean(event));

  useEffect(()=>{
    if(!canvasRef.current||!chosen.length)return;
    try{renderCard(canvasRef.current,chosen)}catch{setFeedback('A prévia visual não pôde ser gerada neste navegador. O painel continua disponível para compartilhamento.')}
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
    try{
      await navigator.clipboard.writeText(url);
      setFeedback('Link do painel copiado.');
    }catch{
      setFeedback('Não foi possível copiar automaticamente.');
    }
    window.setTimeout(()=>setFeedback(''),2500);
  };

  const share=async()=>{
    const url=window.location.href;
    if(navigator.share){
      try{await navigator.share({title:'Agenda de Mobilizações',text:'Confira estas mobilizações na Agenda.',url})}catch{}
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
        <h1>Monte seu painel de mobilizações.</h1>
        <p className="page-lead">Escolha até {MAX_EVENTS} eventos e gere uma peça pronta para compartilhar. O painel também ganha um link próprio.</p>
      </div>
      <div className="share-counter"><strong>{selected.length}/{MAX_EVENTS}</strong><span>selecionados</span></div>
    </div>

    <div className="share-builder-layout">
      <section className="share-picker">
        <div className="share-picker-head">
          <strong>Escolha os eventos</strong>
          <span>{candidates.length} disponíveis</span>
        </div>
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
              <span className="share-event-copy"><strong>{displayLocation(event)}</strong><small>{event.venue}</small></span>
              <span className="share-event-time">{formatTime(event)}</span>
            </button>
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
        <p className="share-help">Quem receber o link poderá abrir este mesmo painel e navegar para a Agenda. A imagem baixada também pode ser publicada diretamente nas redes.</p>
      </aside>
    </div>
  </div>;
}
