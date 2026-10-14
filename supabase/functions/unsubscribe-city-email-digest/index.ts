const encoder = new TextEncoder();
function base64Url(bytes:ArrayBuffer) {
  return btoa(Array.from(new Uint8Array(bytes),(b)=>String.fromCharCode(b)).join(""))
    .replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}
async function signUser(userId:string,secret:string) {
  const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return base64Url(await crypto.subtle.sign("HMAC",key,encoder.encode("city-email-digest:"+userId)));
}
function constantTimeEqual(a:string,b:string) {
  if(a.length!==b.length)return false;
  let result=0;
  for(let i=0;i<a.length;i++)result|=a.charCodeAt(i)^b.charCodeAt(i);
  return result===0;
}
function htmlPage(title:string,message:string,token="",showConfirm=false) {
  const form=showConfirm
    ? '<form method="post" action="?token='+encodeURIComponent(token)+'"><button type="submit" style="padding:12px 16px;border:0;border-radius:9px;background:#a21d35;color:#fff;font-weight:800;cursor:pointer;">Cancelar os e-mails</button></form>'
    : "";
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>'+title+'</title></head><body style="font-family:Arial,sans-serif;background:#f7f4f1;margin:0;padding:24px;color:#171717;"><main style="max-width:520px;margin:32px auto;background:#fff;border:1px solid #e5ddd9;border-radius:14px;padding:24px;line-height:1.6;"><div style="font-size:11px;font-weight:900;letter-spacing:1px;color:#a21d35;">AGENDA DE MOBILIZAÇÕES</div><h1 style="font-size:24px;">'+title+'</h1><p>'+message+'</p>'+form+'<p style="font-size:12px;color:#686d74;margin-top:20px;">Nenhum dado de login é solicitado nesta página.</p></main></body></html>';
}
function htmlResponse(content:string,status=200) {
  return new Response(content,{status,headers:{
    "Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer",
    "X-Content-Type-Options":"nosniff",
    "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  }});
}
Deno.serve(async(request)=>{
  if(request.method!=="GET"&&request.method!=="POST")return new Response("Method not allowed",{status:405});
  const secret=Deno.env.get("EMAIL_UNSUBSCRIBE_SECRET")||"";
  const base=Deno.env.get("SUPABASE_URL")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(secret.length<32||!base||!service)return htmlResponse(htmlPage("Cancelamento indisponível","O serviço de e-mail ainda não está configurado."),503);

  const url=new URL(request.url);
  const token=url.searchParams.get("token")||"";
  const parts=token.split(".");
  const userId=parts[0]||"",signature=parts[1]||"";
  if(parts.length!==2||! /^[0-9a-f-]{36}$/i.test(userId)||!signature)return htmlResponse(htmlPage("Link inválido","Este link não é válido. Abra a Agenda e gerencie suas preferências."),400);
  const expected=await signUser(userId,secret);
  if(!constantTimeEqual(signature,expected))return htmlResponse(htmlPage("Link inválido","Este link não é válido. Abra a Agenda e gerencie suas preferências."),400);

  if(request.method==="GET"){
    const checkUrl=new URL(base+"/rest/v1/city_email_digest_subscriptions");
    checkUrl.searchParams.set("select","enabled");checkUrl.searchParams.set("user_id","eq."+userId);
    const check=await fetch(checkUrl,{headers:{apikey:service,Authorization:"Bearer "+service}});
    if(!check.ok)return htmlResponse(htmlPage("Não foi possível confirmar","Não conseguimos verificar a preferência agora. Tente novamente mais tarde."),503);
    const rows=await check.json();
    if(!rows?.length||!rows[0].enabled)return htmlResponse(htmlPage("E-mails já cancelados","Esta conta não está inscrita nos resumos diários por e-mail."));
    return htmlResponse(htmlPage("Cancelar os resumos por e-mail","Ao confirmar, os resumos diários serão desativados. Isso não exclui sua conta da Agenda.",token,true));
  }

  const updateUrl=new URL(base+"/rest/v1/city_email_digest_subscriptions");
  updateUrl.searchParams.set("user_id","eq."+userId);updateUrl.searchParams.set("enabled","eq.true");
  const update=await fetch(updateUrl,{
    method:"PATCH",
    headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json",Prefer:"return=representation"},
    body:JSON.stringify({enabled:false,unsubscribed_at:new Date().toISOString(),updated_at:new Date().toISOString()}),
  });
  if(!update.ok)return htmlResponse(htmlPage("Não foi possível cancelar","Não conseguimos atualizar sua preferência agora. Tente novamente mais tarde."),503);
  return htmlResponse(htmlPage("E-mails cancelados","Pronto. Os resumos diários por e-mail foram desativados. Você pode continuar usando a Agenda normalmente."));
});
