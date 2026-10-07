const BOT_UA=/(facebookexternalhit|facebot|twitterbot|slackbot|whatsapp|telegrambot|linkedinbot|discordbot|googlebot|bingbot)/i;

function escapeHtml(value){
  return String(value == null ? '' : value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

export default async function(request,context){
  const response=await context.next();
  const ua=request.headers.get('user-agent')||'';
  if(!BOT_UA.test(ua))return response;

  const url=new URL(request.url);
  const match=url.pathname.match(/^\/evento\/([^/]+)\/?$/);
  if(!match)return response;

  const supabaseUrl=Deno.env.get('VITE_SUPABASE_URL');
  const publishableKey=Deno.env.get('VITE_SUPABASE_PUBLISHABLE_KEY');
  if(!supabaseUrl||!publishableKey)return response;

  try{
    const endpoint=new URL('/rest/v1/events',supabaseUrl);
    endpoint.searchParams.set('select','slug,title,city,state,date,time,time_label,venue,image_url,is_public');
    endpoint.searchParams.set('slug','eq.'+decodeURIComponent(match[1]));
    endpoint.searchParams.set('is_public','eq.true');
    endpoint.searchParams.set('limit','1');
    const result=await fetch(endpoint.toString(),{headers:{apikey:publishableKey,Authorization:'Bearer '+publishableKey}});
    if(!result.ok)return response;

    const rows=await result.json();
    const event=rows && rows[0];
    if(!event)return response;

    const title=event.title+' · '+event.city+(event.state?', '+event.state:'')+' | Radar de Mobilizações';
    const description=event.title+' · '+event.city+(event.state?', '+event.state:'')+'. '+(event.time_label||event.time||'Horário não informado')+' · '+event.venue+'.';
    const image=event.image_url?new URL(event.image_url,url.origin).toString():new URL('/radar-icon-512.png',url.origin).toString();
    const canonical=url.origin+url.pathname;

    const tags=[
      ['name','description',description],
      ['property','og:title',title],
      ['property','og:description',description],
      ['property','og:type','article'],
      ['property','og:url',canonical],
      ['property','og:image',image],
      ['property','og:image:alt','Pôster de '+event.title],
      ['name','twitter:card','summary_large_image'],
      ['name','twitter:title',title],
      ['name','twitter:description',description],
      ['name','twitter:image',image],
    ];

    const body=await response.text();
    const meta=tags.map(function(item){
      return '<meta '+item[0]+'="'+escapeHtml(item[1])+'" content="'+escapeHtml(item[2])+'">';
    }).join('');
    const titleTag='<title>'+escapeHtml(title)+'</title>';
    const updated=body.replace(/<title>[^<]*<\/title>/i,titleTag).replace(/<\/head>/i,meta+'</head>');
    return new Response(updated,{status:response.status,statusText:response.statusText,headers:new Headers(response.headers)});
  }catch{
    return response;
  }
}
