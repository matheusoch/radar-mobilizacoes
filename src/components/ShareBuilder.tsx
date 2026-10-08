import {useEffect,useMemo,useRef,useState} from 'react';
import {CalendarDays,Check,Download,Image as ImageIcon,Link as LinkIcon,Share2,Star,X} from 'lucide-react';
import type {MobilizationEvent} from '../types';

const MAX_EVENTS=5;
const CARD_WIDTH=1080;
const CM=103.5/2.47;
const OUTER_MARGIN_Y=3.67*CM;
const TEMPLATE_GAP=1.59*CM;
const CARD_SIDE_MARGIN=2.47*CM;
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

  const first=matches[0];
  const detail=raw
    .replace(first,'')
    .replace(/\s*\/\s*/g,' · ')
    .replace(/\s+/g,' ')
    .replace(/^[\s·\-–—]+/,'')
    .trim();

  return {primary:first,detail};
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

function eventMetrics(ctx:CanvasRenderingContext2D,event:MobilizationEvent,maxWidth:number,compact:boolean){
  const title=fitWrappedText(
    ctx,
    event.title+(displayLocation(event)?' - '+displayLocation(event):''),
    maxWidth,
    2,
    compact?24:29,
    compact?15:20,
    '"Arial Narrow", Arial, sans-serif'
  );

  const timeInfo=getTimeInfo(event);
  const schedule=timeInfo.detail
    ? fitWrappedText(
        ctx,
        timeInfo.detail,
        maxWidth,
        2,
        compact?11:14,
        9,
        '"Arial Narrow", Arial, sans-serif'
      )
    : null;

  const venue=fitWrappedText(
    ctx,
    event.venue||'Local não informado',
    maxWidth,
    2,
    compact?14:18,
    10,
    '"Arial Narrow", Arial, sans-serif'
  );

  const type=fitSingleLine(
    ctx,
    (event.type||'Mobilização').toUpperCase(),
    maxWidth,
    compact?13:17,
    10,
    '900'
  );

  const titleH=title.lines.length*(title.size+2);
  const scheduleH=schedule?schedule.lines.length*(schedule.size+1):0;
  const venueH=venue.lines.length*(venue.size+1);
  const typeH=type.size+2;
  const gaps=(schedule?4:0)+4+4;
  const stackH=titleH+scheduleH+venueH+typeH+gaps;

  return {
    title,
    schedule,
    venue,
    type,
    stackH
  };
}

function drawPanelTemplate(
  ctx:CanvasRenderingContext2D,
  image:HTMLImageElement|undefined,
  x:number,
  y:number,
  w:number,
  h:number
){
  if(image&&image.complete&&image.naturalWidth>0){
    const sourceW=image.naturalWidth;
    const sourceH=image.naturalHeight;
    if(h<=sourceH){
      ctx.drawImage(image,0,0,sourceW,sourceH,x,y,w,h);
      return;
    }

    // 9-slice vertical: preserva exatamente os cantos do PNG e apenas
    // expande a faixa central quando houver mais eventos.
    const slice=Math.min(120,Math.floor(sourceH/3));
    ctx.drawImage(image,0,0,sourceW,slice,x,y,w,slice);
    ctx.drawImage(
      image,0,slice,sourceW,sourceH-slice*2,
      x,y+slice,w,h-slice*2
    );
    ctx.drawImage(
      image,0,sourceH-slice,sourceW,slice,
      x,y+h-slice,w,slice
    );
    return;
  }

  ctx.fillStyle=PANEL;
  roundRect(ctx,x,y,w,h,96);
  ctx.fill();
}

function renderCard(canvas:HTMLCanvasElement,events:MobilizationEvent[],host:string,headerImage?:HTMLImageElement,panelImage?:HTMLImageElement,footerImage?:HTMLImageElement){
  const ordered=groupSort(events);
  const dates=[...new Set(ordered.map(event=>event.date))];
  const ctx=canvas.getContext('2d');
  if(!ctx)return;

  // Geometria retirada diretamente do card de referência 1080x1350.
  const panelX=103;
  const panelW=873;
  const panelY=336;
  const panelBaseH=953;
  const headerW=618;
  const headerH=195;
  const headerX=(CARD_WIDTH-headerW)/2;
  const headerY=74;

  const timeX=143;
  const timeW=149;
  const contentX=318;
  const maxTextWidth=panelX+panelW-36-contentX;

  // Espaçamentos do template.
  const panelTopInset=39;
  const dateW=281;
  const dateH=77;
  const dateEventGap=35;
  const eventGap=66;
  const eventMinH=84;

  const compact=ordered.length>=4;

  const groups=dates.map(date=>({
    date,
    events:ordered.filter(event=>event.date===date).map(event=>{
      const info=eventMetrics(ctx,event,maxTextWidth,compact);
      return {event,info,rowH:Math.max(eventMinH,info.stackH+10)};
    })
  }));

  // Primeiro evento sempre parte imediatamente abaixo da data.
  // Depois disso, cada evento recebe o mesmo espaçamento vertical.
  let flowY=panelY+panelTopInset+dateH+dateEventGap;
  let count=0;

  for(const group of groups){
    for(const item of group.events){
      flowY+=item.rowH;
      count++;
      if(count<ordered.length)flowY+=eventGap;
    }
    // espaço para a próxima etiqueta de dia
    if(group!==groups[groups.length-1]){
      flowY+=Math.max(0,dateH+dateEventGap);
    }
  }

  const footerW=541;
  const footerH=54;
  const bottomGap=32;
  const panelBottom=Math.max(
    panelY+panelBaseH,
    flowY+bottomGap+footerH
  );
  const panelH=panelBottom-panelY;
  const cardHeight=Math.max(1350,Math.ceil(panelBottom+61));

  canvas.width=CARD_WIDTH;
  canvas.height=cardHeight;

  ctx.clearRect(0,0,CARD_WIDTH,cardHeight);
  ctx.fillStyle=BG;
  ctx.fillRect(0,0,CARD_WIDTH,cardHeight);

  // PNG do cabeçalho fornecido, sem rasterização adicional.
  if(headerImage&&headerImage.complete&&headerImage.naturalWidth>0){
    ctx.drawImage(headerImage,headerX,headerY,headerW,headerH);
  }

  // O painel mantém os mesmos cantos do template e só cresce verticalmente
  // por meio de uma extensão sólida no centro.
  ctx.fillStyle=PANEL;
  roundRect(ctx,panelX,panelY,panelW,panelH,96);
  ctx.fill();

  let y=panelY+panelTopInset;
  count=0;

  for(const groupIndex of groups.keys()){
    const group=groups[groupIndex];

    pill(
      ctx,
      formatDateLabel(group.date),
      (CARD_WIDTH-dateW)/2,
      y,
      dateW,
      dateH,
      '900 italic 28px "Arial Narrow", Arial, sans-serif'
    );

    y+=dateH+dateEventGap;

    for(const item of group.events){
      const rowY=y;
      const rowH=item.rowH;
      const info=item.info;

      // O horário acompanha verticalmente o evento, e nunca a página inteira.
      const rowCenter=rowY+rowH/2;
      const pillH=77;
      pill(
        ctx,
        formatTime(item.event),
        timeX,
        rowCenter-pillH/2,
        timeW,
        pillH,
        '900 italic '+(compact?28:31)+'px "Arial Narrow", Arial, sans-serif'
      );

      let textY=rowY+8;

      const titleLH=info.title.size+2;
      const titleH=info.title.lines.length*titleLH;
      ctx.textAlign='left';
      ctx.textBaseline='alphabetic';
      ctx.fillStyle=WHITE;
      ctx.font='900 italic '+info.title.size+'px "Arial Narrow", Arial, sans-serif';
      info.title.lines.forEach((line,index)=>{
        ctx.fillText(line,contentX,textY+info.title.size+index*titleLH);
      });
      textY+=titleH;

      if(info.schedule){
        textY+=4;
        const scheduleLH=info.schedule.size+1;
        ctx.fillStyle=WHITE;
        ctx.font='700 italic '+info.schedule.size+'px "Arial Narrow", Arial, sans-serif';
        info.schedule.lines.forEach((line,index)=>{
          ctx.fillText(line,contentX,textY+info.schedule.size+index*scheduleLH);
        });
        textY+=info.schedule.lines.length*scheduleLH;
      }

      textY+=4;
      const venueLH=info.venue.size+1;
      ctx.fillStyle=WHITE;
      ctx.font='700 italic '+info.venue.size+'px "Arial Narrow", Arial, sans-serif';
      info.venue.lines.forEach((line,index)=>{
        ctx.fillText(line,contentX,textY+info.venue.size+index*venueLH);
      });
      textY+=info.venue.lines.length*venueLH+4;

      ctx.fillStyle=YELLOW;
      ctx.font='900 italic '+info.type.size+'px "Arial Narrow", Arial, sans-serif';
      ctx.fillText(info.type.text,contentX,textY+info.type.size);

      count++;
      y+=rowH;
      if(count<ordered.length){
        y+=eventGap;
      }
    }

    if(groupIndex<groups.length-1){
      y+=Math.max(0,dateH+dateEventGap);
    }
  }

  // Rodapé fica preso ao fundo do painel, sempre centralizado.
  if(footerImage&&footerImage.complete&&footerImage.naturalWidth>0){
    const footerX=(CARD_WIDTH-footerW)/2;
    const footerY=panelBottom-bottomGap-footerH;
    ctx.drawImage(footerImage,footerX,footerY,footerW,footerH);
    ctx.fillStyle=PANEL;
    ctx.fillRect(footerX,footerY+25,footerW,29);
    ctx.textAlign='center';
    ctx.fillStyle=WHITE;
    ctx.font='700 italic 15px "Arial Narrow", Arial, sans-serif';
    ctx.fillText('Confira os demais eventos em:',CARD_WIDTH/2,footerY+37);
    ctx.font='900 italic 15px "Arial Narrow", Arial, sans-serif';
    ctx.fillText('agenda-mobilizacoes.participa.workers.dev',CARD_WIDTH/2,footerY+52);
  }

  ctx.textAlign='left';
  ctx.textBaseline='alphabetic';
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
    header.src='/agenda-header-exact.png?v=2';
    panel.src='/share-panel.svg';
    footer.src='/share-footer.svg';
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
