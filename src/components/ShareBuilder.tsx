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

function getTimeInfo(event:MobilizationEvent){
  const raw=(event.time_label||event.time||'').trim();
  const matches=[...raw.matchAll(/\d{1,2}:\d{2}/g)].map(match=>match[0]);
  if(matches.length<=1){
    return {primary:matches[0]||'—',detail:''};
  }
  const detail=raw.replace(matches[0],'').replace(/\s*\/\s*/g,' · ').replace(/\s+/g,' ').replace(/^[\s·\\-–—]+/,'').trim();
  return {
    primary:matches[0],
    detail,
  };
}

function formatTime(event:MobilizationEvent){
  return getTimeInfo(event).primary;
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
    ctx.font='900 italic '+size+'px '+fontFamily;
    const lines=wrapLines(ctx,text,maxWidth,maxLines);
    if(lines.every(line=>ctx.measureText(line).width<=maxWidth))return {size,lines};
    size-=1;
  }
  ctx.font='900 italic '+minSize+'px '+fontFamily;
  return {size:minSize,lines:wrapLines(ctx,text,maxWidth,maxLines)};
}

function fitSingleLine(ctx:CanvasRenderingContext2D,text:string,maxWidth:number,startSize:number,minSize:number,weight='700'){
  let size=startSize;
  while(size>=minSize){
    ctx.font=weight+' italic '+size+'px "Arial Narrow", Arial, sans-serif';
    if(ctx.measureText(text).width<=maxWidth)return {size,text};
    size-=1;
  }
  ctx.font=weight+' italic '+minSize+'px "Arial Narrow", Arial, sans-serif';
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

function eventMetrics(ctx:CanvasRenderingContext2D,event:MobilizationEvent,maxWidth:number,rowH:number,compact:boolean){
  const title=fitWrappedText(
    ctx,
    event.title+(displayLocation(event)?' - '+displayLocation(event):''),
    maxWidth,
    2,
    compact?24:29,
    compact?14:20,
    '"Arial Narrow", Arial, sans-serif'
  );
  const timeInfo=getTimeInfo(event);
  const schedule=timeInfo.detail
    ? fitSingleLine(ctx,timeInfo.detail,maxWidth,compact?12:14,10,'700')
    : null;
  const venue=fitSingleLine(ctx,event.venue||'Local não informado',maxWidth,compact?15:20,11);
  const type=fitSingleLine(ctx,(event.type||'Mobilização').toUpperCase(),maxWidth,compact?13:17,10,'900');

  const titleHeight=title.lines.length*(title.size+2);
  const scheduleHeight=schedule?(schedule.size+2):0;
  const venueHeight=venue.size+2;
  const typeHeight=type.size+2;
  const gaps=(schedule?4:0)+3+4;
  const total=titleHeight+scheduleHeight+venueHeight+typeHeight+gaps;

  // Se a pilha ainda passa da linha disponível, reduzimos a tipografia
  // em conjunto, preservando duas linhas para títulos longos.
  if(total>rowH-10){
    let scale=Math.max(0.70,(rowH-10)/total);
    const title2=fitWrappedText(
      ctx,
      event.title+(displayLocation(event)?' - '+displayLocation(event):''),
      maxWidth,
      2,
      Math.max(14,Math.floor(title.size*scale)),
      14,
      '"Arial Narrow", Arial, sans-serif'
    );
    const schedule2=timeInfo.detail
      ? fitSingleLine(ctx,timeInfo.detail,maxWidth,Math.max(10,Math.floor((schedule?.size||12)*scale)),9,'700')
      : null;
    const venue2=fitSingleLine(ctx,event.venue||'Local não informado',maxWidth,Math.max(11,Math.floor(venue.size*scale)),10);
    const type2=fitSingleLine(ctx,(event.type||'Mobilização').toUpperCase(),maxWidth,Math.max(10,Math.floor(type.size*scale)),9,'900');
    return {title:title2,schedule:schedule2,venue:venue2,type:type2};
  }

  return {title,schedule,venue,type};
}

function renderCard(canvas:HTMLCanvasElement,events:MobilizationEvent[],host:string,headerImage?:HTMLImageElement,panelImage?:HTMLImageElement,footerImage?:HTMLImageElement){
  const ordered=events.slice().sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')));
  const dates=[...new Set(ordered.map(event=>event.date))];

  canvas.width=CARD_WIDTH;
  canvas.height=CARD_HEIGHT;

  const ctx=canvas.getContext('2d');
  if(!ctx)return;

  // Fundo externo do template.
  ctx.fillStyle='#b91414';
  ctx.fillRect(0,0,CARD_WIDTH,CARD_HEIGHT);

  // Cabeçalho original fornecido.
  const headerW=618;
  const headerH=195;
  const headerX=(CARD_WIDTH-headerW)/2;
  const headerY=52;
  if(headerImage&&headerImage.complete&&headerImage.naturalWidth>0){
    ctx.drawImage(headerImage,headerX,headerY,headerW,headerH);
  }

  // Retângulo original fornecido, sem reconstruir o fundo arredondado.
  const panelX=103.5;
  const panelY=337;
  const panelW=873;
  const panelH=953;
  const panelBottom=panelY+panelH;

  // O painel escuro é a base. O PNG fornecido é uma camada transparente decorativa,
  // portanto ele deve ser aplicado POR CIMA da base, e não substituir a base inteira.
  ctx.fillStyle=PANEL;
  roundRect(ctx,panelX,panelY,panelW,panelH,96);
  ctx.fill();
  if(panelImage&&panelImage.complete&&panelImage.naturalWidth>0){
    ctx.drawImage(panelImage,panelX,panelY,panelW,panelH);
  }

  // Grades do conteúdo dentro do retângulo.
  const timeX=145;
  const timeW=150;
  const contentX=320;
  const rightInset=50;
  const maxTextWidth=panelX+panelW-rightInset-contentX;

  const contentTop=377;
  const footerY=panelBottom-74;

  const compact=ordered.length>=4;
  const dateH=compact?46:52;
  const dateGap=compact?8:11;
  const groupGap=compact?12:16;
  const eventGap=compact?6:9;

    // Não esticamos uma única mobilização para ocupar todo o painel.
  // Cada evento recebe uma faixa própria; o espaço restante fica limpo dentro do template.
  const rowH=compact?128:150;

  let y=contentTop;

  for(const date of dates){
    const dayEvents=ordered.filter(event=>event.date===date);

    // O marcador de data fica sempre isolado, antes das linhas dos eventos.
    const dateW=282;
    pill(
      ctx,
      formatDateLabel(date),
      (CARD_WIDTH-dateW)/2,
      y,
      dateW,
      dateH,
      '900 italic '+(compact?22:25)+'px "Arial Narrow", Arial, sans-serif'
    );

    y+=dateH+dateGap;

    for(const [eventIndex,event] of dayEvents.entries()){
      const rowY=y;
      const rowCenter=rowY+rowH/2;
      const info=eventMetrics(ctx,event,maxTextWidth,rowH,compact);

      // O horário tem espaço próprio e nunca recebe o texto complementar.
      const pillH=Math.min(compact?54:58,Math.max(44,rowH-30));
      pill(
        ctx,
        formatTime(event),
        timeX,
        rowCenter-pillH/2,
        timeW,
        pillH,
        '900 italic '+(compact?25:29)+'px "Arial Narrow", Arial, sans-serif'
      );

      const titleLH=info.title.size+2;
      const titleH=info.title.lines.length*titleLH;
      const scheduleH=info.schedule?info.schedule.size+2:0;
      const venueH=info.venue.size+2;
      const typeH=info.type.size+2;
      const scheduleGap=info.schedule?3:0;
      const stackH=titleH+scheduleGap+scheduleH+3+venueH+4+typeH;

      // Centraliza a pilha inteira do evento dentro de sua própria faixa.
      let textY=rowCenter-stackH/2;
      if(textY<rowY+5)textY=rowY+5;
      if(textY+stackH>rowY+rowH-5)textY=rowY+rowH-5-stackH;

      ctx.textAlign='left';
      ctx.fillStyle=WHITE;
      ctx.font='900 italic '+info.title.size+'px "Arial Narrow", Arial, sans-serif';
      info.title.lines.forEach((line,index)=>{
        ctx.fillText(line,contentX,textY+info.title.size+index*titleLH);
      });
      textY+=titleH;

      if(info.schedule){
        textY+=scheduleGap;
        ctx.fillStyle=WHITE;
        ctx.font='700 italic '+info.schedule.size+'px "Arial Narrow", Arial, sans-serif';
        ctx.fillText(info.schedule.text,contentX,textY+info.schedule.size);
        textY+=scheduleH;
      }

      textY+=3;
      ctx.fillStyle=WHITE;
      ctx.font='700 italic '+info.venue.size+'px "Arial Narrow", Arial, sans-serif';
      ctx.fillText(info.venue.text,contentX,textY+info.venue.size);
      textY+=venueH+4;

      ctx.fillStyle=YELLOW;
      ctx.font='900 italic '+info.type.size+'px "Arial Narrow", Arial, sans-serif';
      ctx.fillText(info.type.text,contentX,textY+info.type.size);

      y+=rowH;
      if(eventIndex<dayEvents.length-1)y+=eventGap;
    }

    y+=groupGap;
  }

  // Rodapé original fornecido. Sem cobrir nem recriar sua transparência.
  if(footerImage&&footerImage.complete&&footerImage.naturalWidth>0){
    const footerW=541;
    const footerH=54;
    const footerX=(CARD_WIDTH-footerW)/2;
    ctx.drawImage(footerImage,footerX,footerY,footerW,footerH);
  }

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
    let cancelled=false;
    const header=new Image();
    const panel=new Image();
    const footer=new Image();
    let ready=0;
    const paint=()=>{
      if(cancelled||!canvasRef.current||ready<3)return;
      try{
        renderCard(canvasRef.current,chosen,window.location.host,header,panel,footer);
        setFeedback('');
      }catch{
        setFeedback('A prévia visual não pôde ser gerada neste navegador.');
      }
    };
    [header,panel,footer].forEach(img=>{
      img.onload=()=>{ready++;paint();};
      img.onerror=()=>{ready++;paint();};
    });
    header.src='/agenda-header-exact.png';
    panel.src='/agenda-card-panel.png';
    footer.src='/agenda-card-footer.png';
    return()=>{cancelled=true;};
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
                {getTimeInfo(event).detail&&<small className='share-event-schedule'>{getTimeInfo(event).detail}</small>}
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
