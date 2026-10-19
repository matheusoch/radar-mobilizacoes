const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function reply(body:Record<string,unknown>,status=200) {
  return new Response(JSON.stringify(body),{status,headers:corsHeaders});
}

function fromDomain(from:string) {
  const address=from.match(/<([^<>]+)>/)?.[1]||from.trim();
  const at=address.lastIndexOf("@");
  return at>=0?address.slice(at+1).replace(/[>\s]/g,"").toLowerCase():"";
}

Deno.serve(async(request:Request)=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(request.method!=="POST")return reply({ok:false,error:"METHOD_NOT_ALLOWED"},405);

  const base=(Deno.env.get("SUPABASE_URL")||"").replace(/\/+$/,"");
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const anon=Deno.env.get("SUPABASE_ANON_KEY")||service;
  const authorization=request.headers.get("authorization")||"";
  if(!base||!service||!authorization.toLowerCase().startsWith("bearer "))return reply({ok:false,error:"AUTH_REQUIRED"},401);

  let user:any;
  try {
    const response=await fetch(base+"/auth/v1/user",{headers:{apikey:anon,Authorization:authorization}});
    if(!response.ok)return reply({ok:false,error:"SESSION_INVALID"},401);
    user=await response.json();
  } catch {
    return reply({ok:false,error:"AUTH_CHECK_FAILED"},502);
  }
  if(!user?.id)return reply({ok:false,error:"SESSION_INVALID"},401);

  try {
    const adminUrl=new URL(base+"/rest/v1/admin_users");
    adminUrl.searchParams.set("select","user_id");
    adminUrl.searchParams.set("user_id","eq."+user.id);
    adminUrl.searchParams.set("limit","1");
    const adminResponse=await fetch(adminUrl,{headers:{apikey:service,Authorization:"Bearer "+service,Accept:"application/json"}});
    if(!adminResponse.ok)return reply({ok:false,error:"ADMIN_CHECK_FAILED"},502);
    const adminRows=await adminResponse.json();
    if(!Array.isArray(adminRows)||!adminRows.length)return reply({ok:false,error:"ADMIN_ONLY"},403);
  } catch {
    return reply({ok:false,error:"ADMIN_CHECK_FAILED"},502);
  }

  let payload:any={};
  try { payload=await request.json(); } catch {}
  const action=payload?.action==="send_test"?"send_test":"check";
  const resendKey=Deno.env.get("RESEND_API_KEY")||"";
  const from=Deno.env.get("EMAIL_FROM")||"";
  const postal=Deno.env.get("EMAIL_POSTAL_ADDRESS")||"";
  const cronSecret=Deno.env.get("DIGEST_CRON_SECRET")||"";
  const unsubSecret=Deno.env.get("EMAIL_UNSUBSCRIBE_SECRET")||"";
  const site=(Deno.env.get("PUBLIC_SITE_URL")||"").replace(/\/+$/,"");
  const domain=fromDomain(from);

  const checks:Record<string,{ok:boolean;detail:string}>={
    user_email_confirmed:{ok:Boolean(user.email_confirmed_at),detail:Boolean(user.email_confirmed_at)?"O e-mail da conta administradora está confirmado.":"Confirme o e-mail da conta administradora antes do teste."},
    sender_configured:{ok:Boolean(from&&domain),detail:from&&domain?"O remetente está preenchido.":"Defina EMAIL_FROM com um endereço remetente válido."},
    postal_address:{ok:postal.trim().length>=8,detail:postal.trim().length>=8?"O endereço postal está preenchido.":"Defina EMAIL_POSTAL_ADDRESS com o endereço postal público do projeto."},
    unsubscribe_secret:{ok:unsubSecret.length>=32,detail:unsubSecret.length>=32?"A chave de cancelamento tem tamanho suficiente.":"Defina EMAIL_UNSUBSCRIBE_SECRET com pelo menos 32 caracteres aleatórios."},
    cron_secret:{ok:cronSecret.length>=32,detail:cronSecret.length>=32?"A chave de agendamento está configurada.":"Defina DIGEST_CRON_SECRET com pelo menos 32 caracteres aleatórios."},
    public_site_url:{ok:site.startsWith("https://"),detail:site.startsWith("https://")?"A URL pública HTTPS está configurada.":"Defina PUBLIC_SITE_URL com a URL HTTPS do Radar."},
    resend_api_key:{ok:Boolean(resendKey),detail:resendKey?"A chave do provedor foi encontrada; o valor não é exibido.":"Defina RESEND_API_KEY nos segredos da função."},
    sender_domain_verified:{ok:false,detail:"Aguarda a consulta ao provedor de e-mail."},
  };

  let providerResponse:any=null;
  if(resendKey) {
    try {
      const response=await fetch("https://api.resend.com/domains",{headers:{Authorization:"Bearer "+resendKey,Accept:"application/json"}});
      if(response.ok) {
        providerResponse=await response.json();
        const domains=Array.isArray(providerResponse?.data)?providerResponse.data:[];
        const match=domains.find((item:any)=>typeof item?.name==="string"&&(domain===item.name.toLowerCase()||domain.endsWith("."+item.name.toLowerCase())));
        const verified=Boolean(match&&String(match.status||"").toLowerCase()==="verified");
        checks.sender_domain_verified={ok:verified,detail:verified?"O domínio do remetente aparece como verificado no provedor.":match?"O domínio do remetente ainda não está verificado.":"O domínio de EMAIL_FROM não aparece como verificado na conta do provedor."};
      } else {
        checks.sender_domain_verified={ok:false,detail:"O provedor rejeitou a verificação da chave ou da conta. Confira RESEND_API_KEY."};
      }
    } catch {
      checks.sender_domain_verified={ok:false,detail:"Não foi possível consultar o provedor neste momento."};
    }
  } else {
    checks.sender_domain_verified={ok:false,detail:"A verificação do domínio exige RESEND_API_KEY."};
  }

  const testReady=Object.entries(checks).filter(([key])=>key!=="cron_secret").every(([,item])=>item.ok);
  const automationPrerequisitesReady=testReady&&checks.cron_secret.ok;
  if(action==="check")return reply({ok:true,ready:testReady,automation_prerequisites_ready:automationPrerequisitesReady,scheduler_verified:false,checks,from_domain:domain||null,admin_email:user.email||null});

  if(!testReady)return reply({ok:false,ready:false,error:"EMAIL_DIGEST_NOT_READY",checks,from_domain:domain||null},409);
  if(!user.email||!user.email_confirmed_at)return reply({ok:false,error:"ADMIN_EMAIL_NOT_CONFIRMED"},409);

  try {
    const response=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{Authorization:"Bearer "+resendKey,"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify({
        from,
        to:[user.email],
        subject:"Teste de entrega — Agenda de Mobilizações",
        text:"Este é um teste de configuração do boletim de mobilizações. Nenhum usuário inscrito recebeu esta mensagem.",
        html:'<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#171717"><h1>Teste de e-mail concluído</h1><p>O provedor aceitou esta mensagem de teste da Agenda de Mobilizações.</p><p>Este teste foi enviado somente para o endereço da conta administradora autenticada. Nenhum assinante recebeu esta mensagem.</p><p>'+postal.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")+'</p><p><a href="'+site+'">Abrir a Agenda de Mobilizações</a></p></body></html>'
      })
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)return reply({ok:false,error:"TEST_EMAIL_REJECTED",provider_status:response.status,detail:"O provedor rejeitou o envio. Confira o domínio, remetente e os limites da conta."},502);
    return reply({ok:true,sent:true,recipient:user.email,message_id:result.id||null});
  } catch {
    return reply({ok:false,error:"TEST_EMAIL_FAILED",detail:"Não foi possível conectar ao provedor de e-mail."},502);
  }
});
