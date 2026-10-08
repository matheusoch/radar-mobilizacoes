import {useEffect,useMemo,useState} from 'react';
import {CalendarDays,Check,Download,Image as ImageIcon,Link as LinkIcon,Share2,Star,X} from 'lucide-react';
import type {MobilizationEvent} from '../types';

const MAX_EVENTS=5;
const W=1080;
const BG='#ba1414';
const PANEL='#951010';
const WHITE='#fff';
const YELLOW='#f7db26';

const HEADER='/agenda-header-exact.png';
const HEADER_W=618;
const HEADER_H=195;
const FOOTER='/agenda-card-footer-exact.png';
const ICON='/agenda-card-icon.png';

function dateObj(date:string){return new Date(date+'T12:00:00');}

function displayLocation(event:MobilizationEvent){
  return [event.city,event.state].filter(Boolean).join(' ');
}

function timeInfo(event:MobilizationEvent){
  const raw=(event.time_label||event.time||'').trim();
  const times=[...raw.matchAll(/\d{1,2}:\d{2}/g)].map(m=>m[0]);
  if(!times.length)return {primary:'—',detail:''};
  if(times.length===1)return {primary:times[0],detail:''};
  const detail=raw.replace(times[0],'').replace(/\s*\/\s*/g,' · ').replace(/\s+/g,' ').replace(/^[\s·\\-–—]+/,'').trim();
  return {primary:times[0],detail};
}

function formatDateLabel(date:string){
  const d=dateObj(date);
  return d.toLocaleDateString('pt-BR',{weekday:'long'}).replace('-feira','').toUpperCase()+' - '+d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
}

function escapeXml(value:string){
  return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

function measureWrap(text:string,maxChars:number,maxLines=2){
  const words=text.trim().split(/\s+/).filter(Boolean);
  const lines:string[]=[];
  let line='';
  for(const word of words){
    const next=line?line+' '+word:word;
    if(next.length<=maxChars||!line)line=next;
    else{lines.push(line);line=word;}
  }
  if(line)lines.push(line);
  if(lines.length<=maxLines)return lines;
  const clipped=lines.slice(0,maxLines);
  clipped[maxLines-1]=clipped[maxLines-1].slice(0,Math.max(1,maxChars-1)).replace(/\s+$/,'')+'…';
  return clipped;
}

function fitTitle(text:string,maxChars:number){
  const sizes=[29,28,27,26,25,24,23,22,21,20];
  for(const size of sizes){
    const chars=Math.floor(maxChars*(29/size));
    const lines=measureWrap(text,chars,2);
    if(lines.every(line=>line.length<=chars))return {size,lines};
  }
  return {size:20,lines:measureWrap(text,Math.floor(maxChars*1.45),2)};
}

function fitMeta(text:string,maxChars:number){
  return measureWrap(text,Math.max(20,maxChars),2);
}

function escText(text:string){
  return escapeXml(text);
}

type CardEvent={
  event:MobilizationEvent;
  title:string[];
  schedule:string[];
  venue:string[];
  type:string;
  rowH:number;
};

function prepareEvent(event:MobilizationEvent,compact:boolean):CardEvent{
  const ti=timeInfo(event);
  const titleText=event.title+(displayLocation(event)?' - '+displayLocation(event):'');
  const title=fitTitle(titleText,compact?47:43);
  const schedule=ti.detail?fitMeta(ti.detail,compact?48:52):[];
  const venue=fitMeta(event.venue||'Local não informado',compact?50:54);
  const type=(event.type||'Mobilização').toUpperCase();
  const titleLH=title.size+2;
  const scheduleLH=compact?13:15;
  const venueLH=compact?15:17;
  const typeH=compact?15:18;
  const stack=title.lines.length*titleLH+(schedule.length?schedule.length*scheduleLH+5:0)+venue.length*venueLH+5+typeH;
  return {event,title:title.lines,schedule,venue,type,rowH:Math.max(compact?82:92,stack+10)};
}

function groupSort(events:MobilizationEvent[]){
  return events.slice().sort((a,b)=>(a.date+' '+(a.time||a.time_label||'')).localeCompare(b.date+' '+(b.time||b.time_label||'')));
}

function makeSvg(events:MobilizationEvent[]){
  const ordered=groupSort(events);
  const dates=[...new Set(ordered.map(e=>e.date))];
  const compact=ordered.length>=4;
  const groups=dates.map(date=>({date,items:ordered.filter(e=>e.date===date).map(e=>prepareEvent(e,compact))}));

  const panelX=103;
  const panelW=874;
  const panelY=320;
  const dateW=281;
  const dateH=77;
  const dateGap=28;
  const eventGap=compact?28:42;
  const groupGap=compact?18:24;
  const timeX=143;
  const timeW=149;
  const timeH=72;
  const contentX=318;

  let cursor=panelY+38;
  const positioned:{groupIndex:number;item:CardEvent;rowY:number;rowH:number;dateY:number}[]=[];

  groups.forEach((group,groupIndex)=>{
    const dateY=cursor;
    cursor=dateY+dateH+dateGap;

    group.items.forEach(item=>{
      const titleLH=fitTitle(
        item.event.title+(displayLocation(item.event)?' - '+displayLocation(item.event):''),
        compact?47:43
      ).size+2;
      const scheduleLH=compact?13:15;
      const venueLH=compact?15:17;
      const typeLH=compact?15:18;
      const contentH=
        item.title.length*titleLH+
        (item.schedule.length ? 4+item.schedule.length*scheduleLH : 0)+
        5+item.venue.length*venueLH+
        5+typeLH;
      const rowH=Math.max(timeH,contentH)+20;

      positioned.push({groupIndex,item,rowY:cursor,rowH,dateY});
      cursor+=rowH+eventGap;
    });

    if(groupIndex<groups.length-1)cursor+=groupGap;
  });

  const footerH=54;
  const footerW=541;
  const footerGap=36;
  const panelPaddingBottom=34;
  const footerY=cursor+footerGap;
  const panelBottom=footerY+footerH+panelPaddingBottom;
  const panelH=panelBottom-panelY;
  const height=Math.max(1350,Math.ceil(panelBottom+60));

  let body='';
  groups.forEach((group,groupIndex)=>{
    const dateY=positioned.find(p=>p.groupIndex===groupIndex)?.dateY ?? panelY+38;
    body+=\`<rect x="\${(W-dateW)/2}" y="\${dateY}" width="\${dateW}" height="\${dateH}" rx="39" fill="\${WHITE}"/>
      <text x="\${W/2}" y="\${dateY+47}" text-anchor="middle" font-family="Arial, sans-serif" font-size="\${compact?26:28}" font-style="italic" font-weight="900" fill="\${PANEL}">\${escText(formatDateLabel(group.date))}</text>\`;
  });

  positioned.forEach(({item,rowY,rowH})=>{
    const ti=timeInfo(item.event);
    const center=rowY+rowH/2;
    body+=\`<rect x="\${timeX}" y="\${center-timeH/2}" width="\${timeW}" height="\${timeH}" rx="36" fill="\${WHITE}"/>
      <text x="\${timeX+timeW/2}" y="\${center+10}" text-anchor="middle" font-family="Arial, sans-serif" font-size="\${compact?27:31}" font-style="italic" font-weight="900" fill="\${PANEL}">\${escText(ti.primary)}</text>\`;

    const titleSize=fitTitle(
      item.event.title+(displayLocation(item.event)?' - '+displayLocation(item.event):''),
      compact?47:43
    ).size;
    const titleLH=titleSize+2;
    let textY=rowY+titleSize;

    item.title.forEach((line,index)=>{
      body+=\`<text x="\${contentX}" y="\${textY+index*titleLH}" font-family="Arial, sans-serif" font-size="\${titleSize}" font-style="italic" font-weight="900" fill="\${WHITE}">\${escText(line)}</text>\`;
    });
    textY+=item.title.length*titleLH;

    if(item.schedule.length){
      textY+=4;
      const sz=compact?12:14;
      item.schedule.forEach((line,index)=>{
        body+=\`<text x="\${contentX}" y="\${textY+sz+index*(sz+1)}" font-family="Arial, sans-serif" font-size="\${sz}" font-style="italic" font-weight="700" fill="\${WHITE}">\${escText(line)}</text>\`;
      });
      textY+=item.schedule.length*(sz+1);
    }

    textY+=5;
    const vsz=compact?14:17;
    item.venue.forEach((line,index)=>{
      body+=\`<text x="\${contentX}" y="\${textY+vsz+index*(vsz+1)}" font-family="Arial, sans-serif" font-size="\${vsz}" font-style="italic" font-weight="700" fill="\${WHITE}">\${escText(line)}</text>\`;
    });
    textY+=item.venue.length*(vsz+1)+5;

    body+=\`<text x="\${contentX}" y="\${textY+(compact?14:17)}" font-family="Arial, sans-serif" font-size="\${compact?14:17}" font-style="italic" font-weight="900" fill="\${YELLOW}">\${escText(item.type)}</text>\`;
  });

  return \`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="\${W}" height="\${height}" viewBox="0 0 \${W} \${height}">
    <rect width="\${W}" height="\${height}" fill="\${BG}"/>
    <image href="\${HEADER}" x="\${(W-HEADER_W)/2}" y="52" width="\${HEADER_W}" height="\${HEADER_H}" preserveAspectRatio="xMidYMid meet"/>
    <rect x="\${panelX}" y="\${panelY}" width="\${panelW}" height="\${panelH}" rx="96" fill="\${PANEL}"/>
    \${body}
    <image href="\${FOOTER}" x="\${(W-footerW)/2}" y="\${footerY}" width="\${footerW}" height="\${footerH}" preserveAspectRatio="xMidYMid meet"/>
    <image href="\${ICON}" x="0" y="\${height-58}" width="42" height="42" preserveAspectRatio="xMidYMid meet" opacity="0"/>
  </svg>\`;
}
function svgData(svg:string){
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}

async function svgToPng(svg:string,width:number,height:number){
  const assetPaths=[HEADER,FOOTER,ICON];
  const embedded=await Promise.all(assetPaths.map(async path=>{
    const response=await fetch(path,{cache:'no-store'});
    if(!response.ok)throw new Error('asset');
    const blob=await response.blob();
    return new Promise<string>((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result));
      reader.onerror=()=>reject(new Error('asset'));
      reader.readAsDataURL(blob);
    });
  }));
  let embeddedSvg=svg;
  assetPaths.forEach((path,index)=>{
    embeddedSvg=embeddedSvg.split(path).join(embedded[index]);
  });
  const image=new Image();
  image.decoding='async';
  image.src=svgData(embeddedSvg);
  await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('svg'));});
  const canvas=document.createElement('canvas');
  canvas.width=width;
  canvas.height=height;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('canvas');
  ctx.drawImage(image,0,0,width,height);
  return canvas.toDataURL('image/png');
}

export default function ShareBuilder({events}:{events:MobilizationEvent[]}) {
  const params=new URLSearchParams(window.location.search);
  const initialIds=(params.get('eventos')||'').split(',').map(decodeURIComponent).filter(Boolean);
  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState<string[]>(initialIds.slice(0,MAX_EVENTS));
  const [feedback,setFeedback]=useState('');

  const candidates=useMemo(()=>{
    const today=new Date().toISOString().slice(0,10);
    const q=query.trim().toLowerCase();
    return groupSort(events.filter(event=>{
      if(!event.public||event.date<today)return false;
      if(!q)return true;
      return [event.title,event.city,event.state,event.venue,event.type].filter(Boolean).join(' ').toLowerCase().includes(q);
    }));
  },[events,query]);

  const chosen=groupSort(selected.map(id=>events.find(e=>e.id===id)).filter((e):e is MobilizationEvent=>Boolean(e)));
  const svg=useMemo(()=>chosen.length?makeSvg(chosen):'', [chosen]);

  useEffect(()=>{
    const next=selected.length?'/divulgar?eventos='+selected.map(encodeURIComponent).join(','):'/divulgar';
    window.history.replaceState(null,'',next);
  },[selected]);

  const toggle=(id:string)=>{
    setSelected(current=>{
      if(current.includes(id))return current.filter(x=>x!==id);
      if(current.length>=MAX_EVENTS)return current;
      return [...current,id];
    });
    setFeedback('');
  };

  const download=async()=>{
    if(!svg)return;
    try{
      const data=await svgToPng(svg,W,Number(svg.match(/height="(\d+)"/)?.[1]||1350));
      const a=document.createElement('a');
      a.download='agenda-de-mobilizacoes.png';
      a.href=data;
      a.click();
      setFeedback('PNG gerado.');
    }catch{
      setFeedback('Não foi possível gerar o PNG neste navegador.');
    }
    window.setTimeout(()=>setFeedback(''),2500);
  };

  const copyLink=async()=>{
    try{await navigator.clipboard.writeText(window.location.href);setFeedback('Link do painel copiado.');}
    catch{setFeedback('Não foi possível copiar automaticamente.');}
    window.setTimeout(()=>setFeedback(''),2500);
  };

  const share=async()=>{
    if(navigator.share){
      try{await navigator.share({title:'Agenda de Mobilizações',text:'Confira este painel de mobilizações na Agenda.',url:window.location.href});}catch{}
    }else await copyLink();
  };

  return <div className="container page share-builder-page">
    <div className="eyebrow"><Star className="red-star" size={15} fill="currentColor"/>CRIAR DIVULGAÇÃO</div>

    <div className="share-builder-heading">
      <div>
        <h1>Crie seu painel de mobilizações.</h1>
        <p className="page-lead">Escolha até {MAX_EVENTS} eventos e gere uma peça pronta para compartilhar.</p>
      </div>
      <div className="share-counter"><strong>{selected.length}/{MAX_EVENTS}</strong><span>selecionados</span></div>
    </div>

    <div className="share-builder-layout">
      <section className="share-picker">
        <div className="share-picker-head"><strong>Escolha os eventos</strong><span>{candidates.length} disponíveis</span></div>
        <div className="share-search">
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar cidade, estado ou evento..." aria-label="Buscar eventos para divulgação"/>
          {query&&<button type="button" onClick={()=>setQuery('')} aria-label="Limpar busca"><X size={16}/></button>}
        </div>

        <div className="share-selected-list">
          {chosen.length?chosen.map(event=><button className="share-selected-chip" type="button" key={event.id} onClick={()=>toggle(event.id)}>
            <span>{displayLocation(event)} · {timeInfo(event).primary}</span><X size={15}/>
          </button>):<div className="share-empty">Selecione eventos abaixo para começar.</div>}
        </div>

        <div className="share-event-list">
          {candidates.map(event=>{
            const selectedNow=selected.includes(event.id);
            const disabled=!selectedNow&&selected.length>=MAX_EVENTS;
            const ti=timeInfo(event);
            return <button key={event.id} type="button" className={selectedNow?'share-event selected':'share-event'} onClick={()=>toggle(event.id)} disabled={disabled}>
              <span className="share-event-check">{selectedNow?<Check size={15}/>:<span/>}</span>
              <span className="share-event-copy">
                <strong>{displayLocation(event)}</strong>
                <small>{event.title}</small>
                <small>{event.venue}</small>
                {ti.detail&&<small className="share-event-schedule">{ti.detail}</small>}
                <small className="share-event-type">{event.type||'Mobilização'}</small>
              </span>
              <span className="share-event-time">{ti.primary}</span>
            </button>;
          })}
          {!candidates.length&&<div className="share-empty">Nenhum evento encontrado.</div>}
        </div>
      </section>

      <aside className="share-preview-panel">
        <div className="share-preview-head">
          <div><div className="eyebrow">PRÉVIA</div><strong>Seu painel</strong></div>
          <ImageIcon size={19}/>
        </div>

        <div className="share-canvas-wrap">
          {svg?<div className="share-svg-preview" aria-label="Prévia do painel" dangerouslySetInnerHTML={{__html:svg}}/>:
            <div className="share-canvas-placeholder"><CalendarDays size={30}/><strong>Seu painel aparecerá aqui</strong><span>Selecione pelo menos um evento.</span></div>}
        </div>

        <div className="share-actions">
          <button className="button primary" type="button" onClick={download} disabled={!chosen.length}><Download size={17}/>Baixar PNG</button>
          <button className="button ghost" type="button" onClick={share} disabled={!chosen.length}><Share2 size={17}/>Compartilhar</button>
          <button className="button ghost" type="button" onClick={copyLink}><LinkIcon size={17}/>Copiar link</button>
        </div>

        {feedback&&<div className="share-feedback">{feedback}</div>}
        <p className="share-help">O layout se adapta ao número de eventos. Horários com concentração, saída ou outras etapas aparecem como informação complementar abaixo do horário principal.</p>
      </aside>
    </div>
  </div>;
}
