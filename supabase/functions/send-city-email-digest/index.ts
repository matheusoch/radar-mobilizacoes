type Subscription = { user_id:string; city:string; state:string; enabled:boolean; email_format:"resumo"|"cards"|"ambos"; last_sent_on:string|null };
type DigestEvent = { id:string; title:string; date:string; time:string|null; time_label:string|null; city:string; state:string; venue:string; address:string|null; type:string };
const enc = new TextEncoder();
const MAX_EVENTS_IN_EMAIL = 20;
const CONCURRENCY = 4;

function dateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const values = Object.fromEntries(parts.map((part)=>[part.type,part.value]));
  return values.year+"-"+values.month+"-"+values.day;
}
function addDays(key:string,days:number) { const d=new Date(key+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }
function norm(value:string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim(); }
function esc(value:unknown) { return String(value??"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c)); }
function dateLabel(date:string) { return new Date(date+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"short"}).replace(".",""); }
function timeLabel(e:DigestEvent) { return (e.time_label||e.time||"").trim()||"Horário não informado"; }
function b64(bytes:ArrayBuffer) { return btoa(Array.from(new Uint8Array(bytes),(b)=>String.fromCharCode(b)).join("")).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_"); }
async function tokenFor(userId:string,secret:string) {
  const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return userId+"."+b64(await crypto.subtle.sign("HMAC",key,enc.encode("city-email-digest:"+userId)));
}
async function fetchJson<T>(url:URL,key:string):Promise<T> {
  const r=await fetch(url,{headers:{apikey:key,Authorization:"Bearer "+key,Accept:"application/json"}});
  if(!r.ok) throw new Error("SUPABASE_READ_"+r.status);
  return await r.json() as T;
}
async function fetchAll<T>(url:URL,key:string):Promise<T[]> {
  const all:T[]=[]; const size=500;
  for(let start=0;;start+=size) {
    const r=await fetch(url,{headers:{apikey:key,Authorization:"Bearer "+key,Accept:"application/json",Range:start+"-"+(start+size-1),"Range-Unit":"items"}});
    if(!r.ok) throw new Error("SUPABASE_READ_"+r.status);
    const page=await r.json() as T[]; all.push(...page); if(page.length<size) break;
  }
  return all;
}
function plainText(city:string,state:string,events:DigestEvent[],site:string,unsub:string,address:string) {
  const lines=["Mobilizações em "+city+"/"+state,"Hoje e nos próximos sete dias",""];
  for(const e of events) lines.push(dateLabel(e.date)+" · "+timeLabel(e),e.title,e.city+"/"+e.state+" · "+(e.venue||e.address||"Local não informado"),site+"/evento/"+encodeURIComponent(e.id),"");
  lines.push("Você recebe este resumo porque ativou os alertas por e-mail da Agenda de Mobilizações.","Gerenciar preferências: "+site+"/preferencias-alertas","Cancelar os e-mails: "+unsub,"Agenda de Mobilizações · "+address);
  return lines.join("\n");
}
function htmlBody(city:string,state:string,events:DigestEvent[],format:Subscription["email_format"],site:string,unsub:string,address:string) {
  const cards=events.map((e)=> {
    const details=e.city+"/"+e.state+" · "+(e.venue||e.address||"Local não informado");
    return `<article style="border:1px solid #e5ddd9;border-radius:12px;padding:14px;margin:0 0 10px;background:#fff;">
      <div style="font-size:12px;font-weight:800;color:#a21d35;">${esc(dateLabel(e.date))} · ${esc(timeLabel(e))}</div>
      <h2 style="font-size:18px;line-height:1.3;margin:7px 0;color:#171717;">${esc(e.title)}</h2>
      <p style="font-size:13px;line-height:1.5;color:#56514f;margin:0 0 10px;">${esc(details)}</p>
      ${e.type?`<p style="font-size:11px;color:#686d74;margin:0 0 10px;">${esc(e.type)}</p>`:""}
      <a href="${esc(site+"/evento/"+encodeURIComponent(e.id))}" style="display:inline-block;background:#a21d35;color:#fff;text-decoration:none;font-size:12px;font-weight:800;padding:9px 12px;border-radius:8px;">Ver evento</a>
    </article>`;
  }).join("");
  const summary=`<p style="font-size:14px;line-height:1.6;color:#444;">Encontramos ${events.length} mobilização${events.length===1?"":"ões"} em <strong>${esc(city)}/${esc(state)}</strong> para hoje e os próximos sete dias.</p>`;
  const list=`<ul style="padding-left:20px;color:#444;font-size:13px;line-height:1.65;">${events.map(e=>`<li><strong>${esc(dateLabel(e.date))}</strong> · ${esc(e.title)} — ${esc(timeLabel(e))}</li>`).join("")}</ul>`;
  const content=format==="resumo"?summary+list:format==="cards"?cards:summary+list+`<div style="border-top:1px solid #e5ddd9;padding-top:14px;margin-top:14px;">${cards}</div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"></head>
  <body style="margin:0;background:#f7f4f1;font-family:Arial,Helvetica,sans-serif;color:#171717;"><main style="max-width:620px;margin:0 auto;padding:22px 14px;">
    <header style="background:#a21d35;color:#fff;padding:22px;border-radius:14px 14px 0 0;"><div style="font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">Agenda de Mobilizações</div><h1 style="font-size:26px;line-height:1.1;margin:12px 0 4px;">Sua região hoje</h1><p style="font-size:14px;line-height:1.5;margin:0;color:#fff;">${esc(city)}/${esc(state)} · resumo das próximas datas</p></header>
    <section style="background:#fff;padding:18px;border:1px solid #e5ddd9;border-top:0;">${content}<p style="font-size:12px;line-height:1.5;color:#686d74;margin-top:18px;">As informações podem mudar. Abra a página do evento para conferir detalhes e fontes.</p></section>
    <footer style="padding:16px 6px;font-size:11px;line-height:1.7;color:#686d74;"><strong style="color:#171717;">Agenda de Mobilizações</strong><br>Você recebe esta mensagem porque ativou voluntariamente os resumos por e-mail.<br><a href="${esc(site+"/preferencias-alertas")}" style="color:#a21d35;">Gerenciar preferências</a> · <a href="${esc(unsub)}" style="color:#a21d35;">Cancelar e-mails</a><br>${esc(address)}<br><a href="${esc(site)}" style="color:#a21d35;">Abrir a Agenda</a></footer>
  </main></body></html>`;
}
async function concurrent<T>(items:T[],limit:number,work:(item:T)=>Promise<void>) {
  let index=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
    while(index<items.length) { const item=items[index++]; await work(item); }
  }));
}

Deno.serve(async(request)=>{
  if(request.method!=="POST") return new Response("Method not allowed",{status:405});
  const cron=Deno.env.get("DIGEST_CRON_SECRET")||"";
  if(cron.length<32||request.headers.get("authorization")!=="Bearer "+cron) return new Response("Unauthorized",{status:401});
  const base=Deno.env.get("SUPABASE_URL")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const resend=Deno.env.get("RESEND_API_KEY")||"";
  const from=Deno.env.get("EMAIL_FROM")||"";
  const postal=Deno.env.get("EMAIL_POSTAL_ADDRESS")||"";
  const unsubSecret=Deno.env.get("EMAIL_UNSUBSCRIBE_SECRET")||"";
  const site=(Deno.env.get("PUBLIC_SITE_URL")||"").replace(/\/+$/,"");
  if(!base||!service||!resend||!from||postal.trim().length<8||unsubSecret.length<32||!site.startsWith("https://")) {
    return Response.json({error:"EMAIL_DIGEST_NOT_CONFIGURED"},{status:503});
  }
  const today=dateKey(), end=addDays(today,7);
  const subUrl=new URL(base+"/rest/v1/city_email_digest_subscriptions");
  subUrl.searchParams.set("select","user_id,city,state,enabled,email_format,last_sent_on");
  subUrl.searchParams.set("enabled","eq.true"); subUrl.searchParams.set("order","user_id.asc");
  const eventsUrl=new URL(base+"/rest/v1/events");
  eventsUrl.searchParams.set("select","id,title,date,time,time_label,city,state,venue,address,type");
  eventsUrl.searchParams.set("is_public","eq.true"); eventsUrl.searchParams.set("date","gte."+today); eventsUrl.searchParams.append("date","lte."+end);
  eventsUrl.searchParams.set("order","date.asc"); eventsUrl.searchParams.set("limit","1000");
  try {
    const [subs,events]=await Promise.all([fetchAll<Subscription>(subUrl,service),fetchJson<DigestEvent[]>(eventsUrl,service)]);
    let sent=0,noEvents=0,alreadySent=0,unverified=0,failed=0;
    await concurrent(subs,CONCURRENCY,async(sub)=>{
      if(!sub.enabled)return;
      if(sub.last_sent_on===today){alreadySent++;return;}
      const regional=events.filter(e=>norm(e.city)===norm(sub.city)&&norm(e.state)===norm(sub.state))
        .sort((a,b)=>a.date.localeCompare(b.date)||(a.time||"99:99").localeCompare(b.time||"99:99")).slice(0,MAX_EVENTS_IN_EMAIL);
      if(!regional.length){noEvents++;return;}
      const userResponse=await fetch(base+"/auth/v1/admin/users/"+sub.user_id,{headers:{apikey:service,Authorization:"Bearer "+service}});
      if(!userResponse.ok){failed++;return;}
      const payload=await userResponse.json(); const user=payload.user||payload;
      if(!user.email||!user.email_confirmed_at){unverified++;return;}
      const token=await tokenFor(sub.user_id,unsubSecret);
      const unsubscribe=base+"/functions/v1/unsubscribe-city-email-digest?token="+encodeURIComponent(token);
      const response=await fetch("https://api.resend.com/emails",{
        method:"POST",
        headers:{Authorization:"Bearer "+resend,"Content-Type":"application/json","Idempotency-Key":"city-digest-"+sub.user_id+"-"+today},
        body:JSON.stringify({
          from, to:[user.email], subject:"Mobilizações em "+sub.city+"/"+sub.state+" — próximos dias",
          html:htmlBody(sub.city,sub.state,regional,sub.email_format,site,unsubscribe,postal),
          text:plainText(sub.city,sub.state,regional,site,unsubscribe,postal),
          headers:{"List-Unsubscribe":"<"+unsubscribe+">","List-Unsubscribe-Post":"List-Unsubscribe=One-Click"},
          tags:[{name:"message_type",value:"city-event-digest"}],
        }),
      });
      if(!response.ok){failed++;console.error("Email provider rejected a city digest:",response.status);return;}
      const patchUrl=new URL(base+"/rest/v1/city_email_digest_subscriptions");
      patchUrl.searchParams.set("user_id","eq."+sub.user_id);
      const patch=await fetch(patchUrl,{method:"PATCH",headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify({last_sent_on:today,last_sent_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
      if(!patch.ok){failed++;return;}
      sent++;
    });
    return Response.json({date:today,subscribers:subs.length,sent,noEvents,alreadySent,unverified,failed});
  } catch(error) {
    console.error("City digest run failed:",error instanceof Error?error.message:"unknown error");
    return Response.json({error:"DIGEST_RUN_FAILED"},{status:500});
  }
});
