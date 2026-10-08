import {useEffect,useMemo,useRef,useState} from 'react';
import {CalendarDays,Check,Download,Image as ImageIcon,Link as LinkIcon,Share2,Star,X} from 'lucide-react';
import type {MobilizationEvent} from '../types';

const MAX_EVENTS=5;
const CARD_WIDTH=1080;
const CARD_HEIGHT=1378;
const BG='#ba1414';
const PANEL='#951010';
const WHITE='#ffffff';
const YELLOW='#f7db26';

function dateObj(date:string){return new Date(date+'T12:00:00');}

function formatTime(event:MobilizationEvent){
  if(event.time) return event.time.slice(0,5);
  const match=(event.time_label||'').match(/\d{1,2}:\d{2}/);
  return match?.[0]||'—';
}

function displayLocation(event:MobilizationEvent){
  return [event.city,event.state].filter(Boolean).join(' ');
}

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

function fitWrappedText(ctx:CanvasRenderingContext2D,text:string,maxWidth:number,maxLines:number,startSize:number,minSize:number,fontFamily:string){
  let size=startSize;
  while(size>=minSize){
    ctx.font=`900 italic ${size}px ${fontFamily}`;
    const lines=wrapLines(ctx,text,maxWidth,maxLines);
    if(lines.length<=maxLines&&lines.every(line=>ctx.measureText(line).width<=maxWidth))return {size,lines};
    size-=1;
  }
  ctx.font=`900 italic ${minSize}px ${fontFamily}`;
  return {size:minSize,lines:wrapLines(ctx,text,maxWidth,maxLines)};
}

function fitSingleLine(ctx:CanvasRenderingContext2D,text:string,maxWidth:number,startSize:number,minSize:number,weight='700'){
  let size=startSize;
  while(size>=minSize){
    ctx.font=`${weight} italic ${size}px "Arial Narrow", Arial, sans-serif`;
    if(ctx.measureText(text).width<=maxWidth)return {size,text};
    size-=1;
  }
  ctx.font=`${weight} italic ${minSize}px "Arial Narrow", Arial, sans-serif`;
  let clipped=text;
  while(ctx.measureText(clipped+'…').width>maxWidth&&clipped.length>6)clipped=clipped.slice(0,-1);
  return {size:minSize,text:clipped+'…'};
}

function roundRect(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){
  ctx.beginPath();
  if(typeof ctx.roundRect==='function'){ctx.roundRect(x,y,w,h,r);return;}
  ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

function pill(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,w:number,h:number,font:string){
  ctx.fillStyle=WHITE;
  roundRect(ctx,x,y,w,h,h/2);
  ctx.fill();
  ctx.fillStyle=PANEL;
  ctx.font=font;
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillText(text,x+w/2,y+h/2+1);
  ctx.textAlign='left';
  ctx.textBaseline='alphabetic';
}

function renderCard(canvas:HTMLCanvasElement,events:MobilizationEvent[],host:string){
  const ordered=events.slice().sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')));
  const dates=[...new Set(ordered.map(event=>event.date))];

  canvas.width=CARD_WIDTH;
  canvas.height=CARD_HEIGHT;

  const ctx=canvas.getContext('2d');
  if(!ctx)return;

  ctx.fillStyle=BG;
  ctx.fillRect(0,0,CARD_WIDTH,CARD_HEIGHT);

  // Cabeçalho fixo do template.
  ctx.fillStyle=WHITE;
  ctx.textAlign='center';
  ctx.font='900 102px Impact, "Arial Narrow", Arial, sans-serif';
  ctx.fillText('AGENDA',CARD_WIDTH/2,146);
  ctx.font='900 italic 50px "Arial Narrow", Arial, sans-serif';
  ctx.fillText('DE MOBILIZAÇÃO NAS CIDADES',CARD_WIDTH/2,244);
  ctx.textAlign='left';

  // Área de conteúdo: os elementos ficam dentro do vermelho escuro,
  // mantendo a mesma coluna visual do template.
  const panelX=102;
  const panelY=337;
  const panelW=876;
  const panelH=981;
  const panelBottom=panelY+panelH;

  ctx.fillStyle=PANEL;
  roundRect(ctx,panelX,panelY,panelW,panelH,54);
  ctx.fill();

  const contentX=320;
  const timeX=145;
  const timeW=150;
  const rightInset=54;
  const maxTextWidth=panelX+panelW-rightInset-contentX;
  const contentTop=375;
  const footerTop=1208;
  const availableHeight=footerTop-contentTop;

  const dateH=52;
  const dateToEventsGap=12;
  const groupTailGap=6;
  const eventGap=8;
  const fixedHeight=dates.length*(dateH+dateToEventsGap+groupTailGap)+Math.max(0,ordered.length-dates.length)*eventGap;
  const eventH=Math.max(88,(availableHeight-fixedHeight)/Math.max(1,ordered.length));

  let y=contentTop;

  for(const date of dates){
    const dayEvents=ordered.filter(event=>event.date===date);

    const dateW=282;
    pill(
      ctx,
      formatDateLabel(date),
      (CARD_WIDTH-dateW)/2,
      y,
      dateW,
      dateH,
      '900 italic 25px "Arial Narrow", Arial, sans-serif'
    );

    y+=dateH+dateToEventsGap;

    for(const [eventIndex,event] of dayEvents.entries()){
      const rowY=y;
      const rowCenter=rowY+eventH/2;
      const pillH=Math.min(58,Math.max(48,eventH-26));
      pill(
        ctx,
        formatTime(event),
        timeX,
        rowCenter-pillH/2,
        timeW,
        pillH,
        '900 italic 29px "Arial Narrow", Arial, sans-serif'
      );

      const titleText=event.title+(displayLocation(event)?' - '+displayLocation(event):'');
      const title=fitWrappedText(
        ctx,
        titleText,
        maxTextWidth,
        2,
        eventH<105?26:30,
        eventH<105?21:24,
        '"Arial Narrow", Arial, sans-serif'
      );

      const venue=fitSingleLine(
        ctx,
        event.venue||'Local não informado',
        maxTextWidth,
        eventH<105?18:21,
        14
      );

      const type=fitSingleLine(
        ctx,
        (event.type||'Mobilização').toUpperCase(),
        maxTextWidth,
        eventH<105?16:18,
        12,
        '900'
      );

      const titleLineHeight=title.size+3;
      const titleHeight=title.lines.length*titleLineHeight;
      const venueGap=5;
      const typeGap=7;
      const venueLineHeight=venue.size+2;
      const typeLineHeight=type.size+1;
      const textHeight=titleHeight+venueGap+venueLineHeight+typeGap+typeLineHeight;
      let textY=Math.max(rowY+9,rowCenter-textHeight/2);

      ctx.fillStyle=WHITE;
      ctx.font=`900 italic ${title.size}px "Arial Narrow", Arial, sans-serif`;
      title.lines.forEach((line,index)=>ctx.fillText(line,contentX,textY+title.size+index*titleLineHeight));
      textY+=titleHeight+venueGap;

      ctx.font=`${'700'} italic ${venue.size}px "Arial Narrow", Arial, sans-serif`;
      ctx.fillText(venue.text,contentX,textY+venue.size);
      textY+=venueLineHeight+typeGap;

      ctx.fillStyle=YELLOW;
      ctx.font=`900 italic ${type.size}px "Arial Narrow", Arial, sans-serif`;
      ctx.fillText(type.text,contentX,textY+type.size);

      y+=eventH;
      if(eventIndex<dayEvents.length-1)y+=eventGap;
    }

    // Mantém a separação visual entre blocos de datas sem empurrar
    // os elementos para as bordas do painel.
    y+=groupTailGap;
  }

  // Rodapé sempre dentro do painel escuro.
  const footerY=panelBottom-82;
  ctx.textAlign='center';
  ctx.fillStyle=WHITE;
  ctx.font='900 italic 23px "Arial Narrow", Arial, sans-serif';
  ctx.fillText('Participe da mobilização e ajude a ocupar as ruas.',CARD_WIDTH/2,footerY);
  ctx.font='700 italic 18px "Arial Narrow", Arial, sans-serif';
  ctx.fillText('Confira os demais eventos em:',CARD_WIDTH/2,footerY+30);
  ctx.font='900 italic 18px "Arial Narrow", Arial, sans-serif';
  ctx.fillText(host,CARD_WIDTH/2,footerY+59);
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
      return [event.title,event.city,event.state,event.venue,event.type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    }));
  },[events,query]);

  const chosen=groupSort(
    selected
      .map(id=>events.find(event=>event.id===id))
      .filter((event):event is MobilizationEvent=>Boolean(event))
  );

  useEffect(()=>{
    if(!canvasRef.current||!chosen.length)return;
    try{
      renderCard(canvasRef.current,chosen,window.location.host);
      setFeedback('');
    }catch{
      setFeedback('A prévia visual não pôde ser gerada neste navegador.');
    }
  },[chosen]);

  useEffect(()=>{
    const next=selected.length
      ?'/divulgar?eventos='+selected.map(encodeURIComponent).join(',')
      :'/divulgar';
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
    try{
      await navigator.clipboard.writeText(window.location.href);
      setFeedback('Link do painel copiado.');
    }catch{
      setFeedback('Não foi possível copiar automaticamente.');
    }
    window.setTimeout(()=>setFeedback(''),2500);
  };

  const share=async()=>{
    if(navigator.share){
      try{
        await navigator.share({
          title:'Agenda de Mobilizações',
          text:'Confira este painel de mobilizações na Agenda.',
          url:window.location.href
        });
      }catch{}
    }else{
      await copyLink();
    }
  };

  const download=()=>{
    if(!canvasRef.current)return;
    const link=document.createElement('a');
    link.download='agenda-de-mobilizacoes.png';
    link.href=canvasRef.current.toDataURL('image/png');
    link.click();
  };

  return <div className='container page share-builder-page'>
    <div className='eyebrow'>
      <Star className='red-star' size={15} fill='currentColor' aria-hidden='true'/>
      CRIAR DIVULGAÇÃO
    </div>

    <div className='share-builder-heading'>
      <div>
        <h1>Crie seu painel de mobilizações.</h1>
        <p className='page-lead'>
          Escolha até {MAX_EVENTS} eventos e gere uma peça pronta para compartilhar.
          Cada card mostra data, horário, cidade, local e tipo de mobilização.
        </p>
      </div>
      <div className='share-counter'>
        <strong>{selected.length}/{MAX_EVENTS}</strong>
        <span>selecionados</span>
      </div>
    </div>

    <div className='share-builder-layout'>
      <section className='share-picker'>
        <div className='share-picker-head'>
          <strong>Escolha os eventos</strong>
          <span>{candidates.length} disponíveis</span>
        </div>

        <div className='share-search'>
          <input
            value={query}
            onChange={e=>setQuery(e.target.value)}
            placeholder='Buscar cidade, estado ou evento...'
            aria-label='Buscar eventos para divulgação'
          />
          {query&&
            <button type='button' onClick={()=>setQuery('')} aria-label='Limpar busca'>
              <X size={16}/>
            </button>
          }
        </div>

        <div className='share-selected-list'>
          {chosen.length
            ? chosen.map(event=>
                <button
                  className='share-selected-chip'
                  type='button'
                  key={event.id}
                  onClick={()=>toggle(event.id)}
                >
                  <span>{displayLocation(event)} · {formatTime(event)}</span>
                  <X size={15}/>
                </button>
              )
            : <div className='share-empty'>Selecione eventos abaixo para começar.</div>}
        </div>

        <div className='share-event-list'>
          {candidates.map(event=>{
            const isSelected=selected.includes(event.id);
            const disabled=!isSelected&&selected.length>=MAX_EVENTS;
            return <button
              key={event.id}
              type='button'
              className={isSelected?'share-event selected':'share-event'}
              onClick={()=>toggle(event.id)}
              disabled={disabled}
            >
              <span className='share-event-check'>{isSelected?<Check size={15}/>:<span/>}</span>
              <span className='share-event-copy'>
                <strong>{displayLocation(event)}</strong>
                <small>{event.title}</small>
                <small>{event.venue}</small>
                <small className='share-event-type'>{event.type||'Mobilização'}</small>
              </span>
              <span className='share-event-time'>{formatTime(event)}</span>
            </button>;
          })}
          {!candidates.length&&<div className='share-empty'>Nenhum evento encontrado.</div>}
        </div>
      </section>

      <aside className='share-preview-panel'>
        <div className='share-preview-head'>
          <div>
            <div className='eyebrow'>PRÉVIA</div>
            <strong>Seu painel</strong>
          </div>
          <ImageIcon size={19}/>
        </div>

        <div className='share-canvas-wrap'>
          {chosen.length
            ? <canvas ref={canvasRef} className='share-canvas'/>
            : <div className='share-canvas-placeholder'>
                <CalendarDays size={30}/>
                <strong>Seu painel aparecerá aqui</strong>
                <span>Selecione pelo menos um evento.</span>
              </div>}
        </div>

        <div className='share-actions'>
          <button className='button primary' type='button' onClick={download} disabled={!chosen.length}>
            <Download size={17}/>Baixar PNG
          </button>
          <button className='button ghost' type='button' onClick={share} disabled={!chosen.length}>
            <Share2 size={17}/>Compartilhar
          </button>
          <button className='button ghost' type='button' onClick={copyLink} disabled={!chosen.length}>
            <LinkIcon size={17}/>Copiar link
          </button>
        </div>

        {feedback&&
          <div className='share-feedback' aria-live='polite'>
            <LinkIcon size={14}/>{feedback}
          </div>}

        <p className='share-help'>
          O painel segue a identidade visual da Agenda e fica vinculado a um link próprio,
          para facilitar a circulação nas redes.
        </p>
      </aside>
    </div>
  </div>;
}
