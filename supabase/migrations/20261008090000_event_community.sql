create schema if not exists private;

-- event_updates is a source-linked editorial revision log; community safety items need authorship and a verification lifecycle.
-- event_interests is separate from the existing anonymous "Eu Vou" visitor counter and never exposes participant identities.
create table if not exists public.event_security_information(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  origin text not null default '',
  category text not null check(category in('schedule','location','status','guidance','alert','other')),
  content text not null,
  verification_status text not null default 'pending' check(verification_status in('pending','confirmed','unconfirmed','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  constraint event_security_information_content_len_chk check(char_length(trim(content)) between 1 and 1200),
  constraint event_security_information_origin_len_chk check(char_length(trim(origin))<=120)
);

create table if not exists public.event_discussion_comments(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  audience text not null default 'public' check(audience in('public','interested')),
  content text not null,
  status text not null default 'pending' check(status in('pending','published','hidden','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  constraint event_discussion_comments_content_len_chk check(char_length(trim(content)) between 1 and 1200)
);

create table if not exists public.event_community_reports(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check(target_type in('event','comment','security_information')),
  comment_id uuid references public.event_discussion_comments(id) on delete cascade,
  security_information_id uuid references public.event_security_information(id) on delete cascade,
  category text not null check(category in('threat','false_info','fake_change','inappropriate','personal_data','other')),
  details text not null default '',
  status text not null default 'open' check(status in('open','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  constraint event_community_reports_target_chk check(
    (target_type='event' and comment_id is null and security_information_id is null)
    or (target_type='comment' and comment_id is not null and security_information_id is null)
    or (target_type='security_information' and comment_id is null and security_information_id is not null)
  ),
  constraint event_community_reports_details_len_chk check(char_length(details)<=1000)
);

create table if not exists public.event_interests(
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(event_id,user_id)
);

create table if not exists public.event_moderators(
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.event_community_suspensions(
  user_id uuid primary key references auth.users(id) on delete cascade,
  suspended_until timestamptz not null,
  reason text not null check(char_length(trim(reason)) between 1 and 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.event_moderation_actions(
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  target_type text not null check(target_type in('report','comment','security_information','moderator')),
  target_id uuid not null,
  action text not null check(action in('resolve_report','publish_comment','hide_comment','remove_comment','restore_comment','confirm_information','unconfirm_information','hide_information','restore_information','suspend_user','assign_moderator','remove_moderator')),
  reason text not null default '',
  created_at timestamptz not null default now(),
  constraint event_moderation_actions_reason_len_chk check(char_length(reason)<=500)
);

create index if not exists event_security_information_event_status_idx on public.event_security_information(event_id,verification_status,created_at desc);
create index if not exists event_discussion_comments_event_audience_status_idx on public.event_discussion_comments(event_id,audience,status,created_at desc);
create index if not exists event_community_reports_status_idx on public.event_community_reports(status,created_at desc);
create index if not exists event_interests_user_idx on public.event_interests(user_id,event_id);
create index if not exists event_community_suspensions_until_idx on public.event_community_suspensions(suspended_until);

alter table public.event_security_information enable row level security;
alter table public.event_discussion_comments enable row level security;
alter table public.event_community_reports enable row level security;
alter table public.event_interests enable row level security;
alter table public.event_moderators enable row level security;
alter table public.event_community_suspensions enable row level security;
alter table public.event_moderation_actions enable row level security;

drop policy if exists "event security rpc only" on public.event_security_information;
create policy "event security rpc only" on public.event_security_information for all to anon,authenticated using(false) with check(false);
drop policy if exists "event comments rpc only" on public.event_discussion_comments;
create policy "event comments rpc only" on public.event_discussion_comments for all to anon,authenticated using(false) with check(false);
drop policy if exists "event reports rpc only" on public.event_community_reports;
create policy "event reports rpc only" on public.event_community_reports for all to anon,authenticated using(false) with check(false);
drop policy if exists "event interests rpc only" on public.event_interests;
create policy "event interests rpc only" on public.event_interests for all to anon,authenticated using(false) with check(false);
drop policy if exists "event moderators rpc only" on public.event_moderators;
create policy "event moderators rpc only" on public.event_moderators for all to anon,authenticated using(false) with check(false);
drop policy if exists "event suspensions rpc only" on public.event_community_suspensions;
create policy "event suspensions rpc only" on public.event_community_suspensions for all to anon,authenticated using(false) with check(false);
drop policy if exists "event moderation log rpc only" on public.event_moderation_actions;
create policy "event moderation log rpc only" on public.event_moderation_actions for all to anon,authenticated using(false) with check(false);

revoke all on public.event_security_information from anon,authenticated;
revoke all on public.event_discussion_comments from anon,authenticated;
revoke all on public.event_community_reports from anon,authenticated;
revoke all on public.event_interests from anon,authenticated;
revoke all on public.event_moderators from anon,authenticated;
revoke all on public.event_community_suspensions from anon,authenticated;
revoke all on public.event_moderation_actions from anon,authenticated;
revoke all on schema private from public,anon,authenticated;

create or replace function private.community_author_name(p_user_id uuid)
returns text language plpgsql stable security definer
set search_path=pg_catalog,auth,public
as $$
declare v_name text;
begin
  select nullif(left(regexp_replace(coalesce(u.raw_user_meta_data->>'display_name',''),'[[:cntrl:]]','','g'),60),'') into v_name
  from auth.users u where u.id=p_user_id;
  if v_name is null or v_name ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
    or v_name ~* '(\+?55[[:space:]-]*)?\(?[1-9][0-9]\)?[[:space:]-]+9?[0-9]{4}[[:space:]-]?[0-9]{4}'
    or v_name ~* '\m[0-9]{10,11}\M'
    or v_name ~* '(https?://|www\.)'
    or v_name ~* '\m(meu endereco residencial|moro na rua|minha casa fica|endereco da minha casa|rua|avenida|travessa|alameda|cep)\M' then return 'Participante'; end if;
  return v_name;
end;
$$;

create or replace function private.is_event_moderator()
returns boolean language sql stable security definer
set search_path=pg_catalog,public,auth
as $$
  select auth.uid() is not null and (exists(select 1 from public.admin_users a where a.user_id=auth.uid()) or exists(select 1 from public.event_moderators m where m.user_id=auth.uid()));
$$;

create or replace function private.assert_community_not_suspended(p_user_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public
as $$
begin
  if exists(select 1 from public.event_community_suspensions s where s.user_id=p_user_id and s.suspended_until>now()) then
    raise exception 'Sua conta está temporariamente suspensa da participação nesta comunidade.';
  end if;
end;
$$;

create or replace function private.validate_community_text(p_content text,p_check_threats boolean default true)
returns text language plpgsql immutable set search_path=pg_catalog
as $$
declare v_content text:=btrim(coalesce(p_content,''));
begin
  if char_length(v_content) not between 1 and 1200 then raise exception 'O conteúdo deve ter entre 1 e 1200 caracteres.'; end if;
  if v_content ~* '(https?://|www\.|[[:alnum:]._%-]+\.[[:alpha:]]{2,}(/|[[:space:][:punct:]]|$))' then raise exception 'Links não são permitidos neste espaço.'; end if;
  if v_content ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
    or v_content ~* '\m[0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}\M'
    or v_content ~* '\m[0-9]{10,11}\M'
    or v_content ~* '(\+?55[[:space:]-]*)?\(?[1-9][0-9]\)?[[:space:]-]+9?[0-9]{4}[[:space:]-]?[0-9]{4}'
    or v_content ~* '\m(meu endereco residencial|moro na rua|minha casa fica|endereco da minha casa)\M' then
    raise exception 'Remova dados pessoais antes de enviar.';
  end if;
  if p_check_threats and (v_content ~* '\m(vou|vamos|quero)[[:space:]]+(te[[:space:]]+)?(matar|atacar|agredir|explodir|bater|esfaquear)\M'
    or v_content ~* '\m(vou|vamos)[[:space:]]+(colocar|levar)[[:space:]]+(uma[[:space:]]+)?bomba\M'
    or v_content ~* '\m(vou|vamos)[[:space:]]+(te[[:space:]]+)?dar[[:space:]]+um[[:space:]]+tiro\M') then raise exception 'Ameaças diretas não podem ser publicadas.'; end if;
  return v_content;
end;
$$;

create or replace function private.guard_community_submission(p_user_id uuid,p_event_id uuid,p_kind text,p_content text)
returns void language plpgsql security definer set search_path=pg_catalog,public,auth
as $$
declare v_created_at timestamptz; v_count integer;
begin
  perform private.assert_community_not_suspended(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select u.created_at into v_created_at from auth.users u where u.id=p_user_id;
  if p_kind='comment' then
    select count(*) into v_count from public.event_discussion_comments c where c.author_id=p_user_id and c.created_at>now()-interval '10 minutes';
    if v_count>=5 then raise exception 'Limite de comentários atingido. Aguarde alguns minutos.'; end if;
    if v_created_at>now()-interval '24 hours' then
      select count(*) into v_count from public.event_discussion_comments c where c.author_id=p_user_id and c.created_at>now()-interval '24 hours';
      if v_count>=2 then raise exception 'Contas novas têm um limite temporário de comentários.'; end if;
    end if;
    if exists(select 1 from public.event_discussion_comments c where c.author_id=p_user_id and c.event_id=p_event_id and c.status<>'removed' and c.created_at>now()-interval '24 hours' and lower(btrim(c.content))=lower(btrim(p_content))) then raise exception 'Este comentário já foi enviado recentemente.'; end if;
  elsif p_kind='security' then
    select count(*) into v_count from public.event_security_information i where i.author_id=p_user_id and i.created_at>now()-interval '24 hours';
    if v_count>=3 then raise exception 'Limite diário de informações de segurança atingido.'; end if;
  elsif p_kind='report' then
    select count(*) into v_count from public.event_community_reports r where r.reporter_id=p_user_id and r.created_at>now()-interval '1 hour';
    if v_count>=5 then raise exception 'Limite de denúncias atingido. Aguarde antes de enviar outra.'; end if;
  else raise exception 'Tipo de envio inválido.';
  end if;
end;
$$;

create or replace function public.get_event_security_information(p_event_slug text)
returns table(id uuid,category text,content text,origin text,verification_status text,author_name text,created_at timestamptz,verified_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,public,private,auth
as $$
begin
  return query select i.id,i.category,i.content,i.origin,i.verification_status,i.author_name,i.created_at,i.verified_at
  from public.event_security_information i join public.events e on e.id=i.event_id
  where e.slug=p_event_slug and e.is_public and i.verification_status<>'hidden'
  order by (i.verification_status='confirmed') desc,i.created_at desc;
end;
$$;

create or replace function public.get_event_discussion(p_event_slug text,p_audience text default 'public')
returns table(id uuid,author_name text,content text,audience text,status text,created_at timestamptz,edited_at timestamptz,is_mine boolean)
language plpgsql stable security definer set search_path=pg_catalog,public,private,auth
as $$
declare v_event_id uuid;
begin
  if p_audience not in('public','interested') then raise exception 'Área de discussão inválida.'; end if;
  select e.id into v_event_id from public.events e where e.slug=p_event_slug and e.is_public;
  if v_event_id is null then raise exception 'Evento não encontrado.'; end if;
  if p_audience='interested' and (auth.uid() is null or not exists(select 1 from public.event_interests i where i.event_id=v_event_id and i.user_id=auth.uid())) then
    raise exception 'Marque interesse neste evento para acessar a conversa de participantes.';
  end if;
  return query select c.id,c.author_name,c.content,c.audience,c.status,c.created_at,c.edited_at,(c.author_id=auth.uid())
  from public.event_discussion_comments c where c.event_id=v_event_id and c.audience=p_audience
    and (c.status='published' or (c.author_id=auth.uid() and c.status='pending'))
  order by c.created_at asc limit 200;
end;
$$;

create or replace function public.get_event_interest_status(p_event_slug text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth
as $$
declare v_event_id uuid; v_count bigint; v_interested boolean:=false;
begin
  select e.id into v_event_id from public.events e where e.slug=p_event_slug and e.is_public;
  if v_event_id is null then raise exception 'Evento não encontrado.'; end if;
  select count(*) into v_count from public.event_interests i where i.event_id=v_event_id;
  if auth.uid() is not null then select exists(select 1 from public.event_interests i where i.event_id=v_event_id and i.user_id=auth.uid()) into v_interested; end if;
  return jsonb_build_object('count',v_count,'interested',v_interested);
end;
$$;

create or replace function public.toggle_event_interest(p_event_slug text,p_interested boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth
as $$
declare v_event_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select e.id into v_event_id from public.events e where e.slug=p_event_slug and e.is_public;
  if v_event_id is null then raise exception 'Evento não encontrado.'; end if;
  if p_interested then insert into public.event_interests(event_id,user_id) values(v_event_id,auth.uid()) on conflict do nothing;
  else delete from public.event_interests where event_id=v_event_id and user_id=auth.uid(); end if;
  return public.get_event_interest_status(p_event_slug);
end;
$$;

create or replace function public.submit_event_comment(p_event_slug text,p_content text,p_audience text default 'public')
returns uuid language plpgsql security definer set search_path=pg_catalog,public,private,auth
as $$
declare v_event_id uuid; v_content text; v_comment_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_audience not in('public','interested') then raise exception 'Área de discussão inválida.'; end if;
  select e.id into v_event_id from public.events e where e.slug=p_event_slug and e.is_public;
  if v_event_id is null then raise exception 'Evento não encontrado.'; end if;
  if p_audience='interested' and not exists(select 1 from public.event_interests i where i.event_id=v_event_id and i.user_id=auth.uid()) then raise exception 'Marque interesse neste evento para comentar na área de participantes.'; end if;
  v_content:=private.validate_community_text(p_content,true);
  perform private.guard_community_submission(auth.uid(),v_event_id,'comment',v_content);
  insert into public.event_discussion_comments(event_id,author_id,author_name,audience,content,status)
  values(v_event_id,auth.uid(),private.community_author_name(auth.uid()),p_audience,v_content,'pending') returning id into v_comment_id;
  return v_comment_id;
end;
$$;

create or replace function public.update_event_comment(p_comment_id uuid,p_content text)
returns void language plpgsql security definer set search_path=pg_catalog,public,private,auth
as $$
declare v_comment public.event_discussion_comments%rowtype; v_content text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_comment from public.event_discussion_comments c where c.id=p_comment_id and c.author_id=auth.uid() and c.status in('pending','published') for update;
  if not found then raise exception 'Comentário não encontrado ou sem permissão.'; end if;
  if v_comment.edited_at>now()-interval '30 seconds' then raise exception 'Aguarde antes de editar novamente.'; end if;
  v_content:=private.validate_community_text(p_content,true);
  perform private.guard_community_submission(auth.uid(),v_comment.event_id,'comment',v_content);
  update public.event_discussion_comments set content=v_content,status='pending',updated_at=now(),edited_at=now(),reviewed_at=null,reviewed_by=null where id=p_comment_id;
end;
$$;

create or replace function public.delete_event_comment(p_comment_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,auth
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.event_discussion_comments set status='removed',updated_at=now() where id=p_comment_id and author_id=auth.uid() and status in('pending','published');
  if not found then raise exception 'Comentário não encontrado ou sem permissão.'; end if;
end;
$$;

create or replace function public.submit_event_security_information(p_event_slug text,p_category text,p_content text,p_origin text default '')
returns uuid language plpgsql security definer set search_path=pg_catalog,public,private,auth
as $$
declare v_event_id uuid; v_item_id uuid; v_content text; v_origin text:=btrim(coalesce(p_origin,''));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_category not in('schedule','location','status','guidance','alert','other') then raise exception 'Categoria inválida.'; end if;
  if char_length(v_origin)>120 then raise exception 'A origem deve ter no máximo 120 caracteres.'; end if;
  if v_origin<>'' then v_origin:=private.validate_community_text(v_origin,false); end if;
  select e.id into v_event_id from public.events e where e.slug=p_event_slug and e.is_public;
  if v_event_id is null then raise exception 'Evento não encontrado.'; end if;
  v_content:=private.validate_community_text(p_content,true);
  perform private.guard_community_submission(auth.uid(),v_event_id,'security',v_content);
  insert into public.event_security_information(event_id,author_id,author_name,origin,category,content,verification_status)
  values(v_event_id,auth.uid(),private.community_author_name(auth.uid()),v_origin,p_category,v_content,'pending') returning id into v_item_id;
  return v_item_id;
end;
$$;

create or replace function public.report_event_community(p_event_slug text,p_target_type text,p_target_id uuid,p_category text,p_details text default '')
returns uuid language plpgsql security definer set search_path=pg_catalog,public,private,auth
as $$
declare v_event_id uuid; v_report_id uuid; v_details text:=btrim(coalesce(p_details,''));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_target_type not in('event','comment','security_information') then raise exception 'Conteúdo a denunciar inválido.'; end if;
  if p_category not in('threat','false_info','fake_change','inappropriate','personal_data','other') then raise exception 'Categoria inválida.'; end if;
  if char_length(v_details)>1000 then raise exception 'O relato deve ter no máximo 1000 caracteres.'; end if;
  if v_details ~* '(https?://|www\.|[[:alnum:]._%-]+\.[[:alpha:]]{2,}(/|[[:space:][:punct:]]|$)|[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|\m[0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}\M|\m[0-9]{10,11}\M|(\+?55[[:space:]-]*)?\(?[1-9][0-9]\)?[[:space:]-]+9?[0-9]{4}[[:space:]-]?[0-9]{4}|\m(meu endereco residencial|moro na rua|minha casa fica|endereco da minha casa)\M)' then raise exception 'Não inclua links ou dados pessoais no relato.'; end if;
  select e.id into v_event_id from public.events e where e.slug=p_event_slug and e.is_public;
  if v_event_id is null then raise exception 'Evento não encontrado.'; end if;
  if p_target_type='event' and p_target_id is not null then raise exception 'Alvo de denúncia inválido.'; end if;
  if p_target_type='comment' and not exists(select 1 from public.event_discussion_comments c where c.id=p_target_id and c.event_id=v_event_id and c.author_id<>auth.uid()) then raise exception 'Comentário não encontrado ou não denunciável.'; end if;
  if p_target_type='security_information' and not exists(select 1 from public.event_security_information i where i.id=p_target_id and i.event_id=v_event_id and i.author_id<>auth.uid()) then raise exception 'Informação não encontrada ou não denunciável.'; end if;
  perform private.guard_community_submission(auth.uid(),v_event_id,'report',v_details);
  if exists(select 1 from public.event_community_reports r where r.reporter_id=auth.uid() and r.event_id=v_event_id and r.target_type=p_target_type and ((p_target_type='event' and r.comment_id is null and r.security_information_id is null) or (p_target_type='comment' and r.comment_id=p_target_id) or (p_target_type='security_information' and r.security_information_id=p_target_id)) and r.created_at>now()-interval '30 days') then raise exception 'Você já denunciou este conteúdo recentemente.'; end if;
  insert into public.event_community_reports(event_id,reporter_id,target_type,comment_id,security_information_id,category,details)
  values(v_event_id,auth.uid(),p_target_type,case when p_target_type='comment' then p_target_id end,case when p_target_type='security_information' then p_target_id end,p_category,v_details)
  returning id into v_report_id;
  return v_report_id;
end;
$$;

create or replace function public.get_event_moderation_queue()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,private,auth
as $$
declare v_reports jsonb; v_security jsonb; v_comments jsonb; v_actions jsonb; v_can_manage_moderators boolean;
begin
  if not private.is_event_moderator() then raise exception 'FORBIDDEN'; end if;
  select exists(select 1 from public.admin_users a where a.user_id=auth.uid()) into v_can_manage_moderators;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) into v_reports from (
    select r.id,r.event_id,e.slug event_slug,e.title event_title,r.target_type,r.comment_id,r.security_information_id,r.category,r.details,r.status,r.created_at,
      private.community_author_name(r.reporter_id) reporter_name,
      case when r.target_type='comment' then (select c.content from public.event_discussion_comments c where c.id=r.comment_id)
           when r.target_type='security_information' then (select i.content from public.event_security_information i where i.id=r.security_information_id) else e.title end target_content
    from public.event_community_reports r join public.events e on e.id=r.event_id
    where r.status='open' order by r.created_at desc limit 100
  ) q;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) into v_security from (
    select i.id,i.event_id,e.slug event_slug,e.title event_title,i.category,i.content,i.origin,i.author_name,i.verification_status,i.created_at
    from public.event_security_information i join public.events e on e.id=i.event_id
    where i.verification_status in('pending','hidden','unconfirmed') order by i.created_at asc limit 100
  ) q;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at asc),'[]'::jsonb) into v_comments from (
    select c.id,c.event_id,e.slug event_slug,e.title event_title,c.author_name,c.content,c.audience,c.status,c.created_at
    from public.event_discussion_comments c join public.events e on e.id=c.event_id
    where c.status in('pending','hidden','removed') order by c.created_at asc limit 100
  ) q;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) into v_actions from (
    select a.target_type,a.target_id,a.action,a.reason,a.created_at,private.community_author_name(a.actor_id) actor_name
    from public.event_moderation_actions a order by a.created_at desc limit 50
  ) q;
  return jsonb_build_object('reports',v_reports,'security_information',v_security,'comments',v_comments,'actions',v_actions,'can_manage_moderators',v_can_manage_moderators);
end;
$$;

create or replace function public.moderate_event_community(p_target_type text,p_target_id uuid,p_action text,p_reason text default '',p_suspend_hours integer default 24)
returns void language plpgsql security definer set search_path=pg_catalog,public,private,auth
as $$
declare v_subject_user uuid; v_reason text:=btrim(coalesce(p_reason,'')); v_hours integer:=greatest(1,least(coalesce(p_suspend_hours,24),720));
begin
  if not private.is_event_moderator() then raise exception 'FORBIDDEN'; end if;
  if char_length(v_reason)>500 then raise exception 'O motivo deve ter no máximo 500 caracteres.'; end if;
  if p_action='suspend_user' and v_reason='' then raise exception 'Informe o motivo da suspensão.'; end if;
  if p_target_type='report' then
    if p_action='resolve_report' then
      update public.event_community_reports set status='resolved',resolved_at=now(),resolved_by=auth.uid() where id=p_target_id and status='open';
      if not found then raise exception 'Denúncia não encontrada ou já resolvida.'; end if;
    elsif p_action='suspend_user' then
      select case when r.target_type='comment' then c.author_id when r.target_type='security_information' then i.author_id end into v_subject_user
      from public.event_community_reports r left join public.event_discussion_comments c on c.id=r.comment_id
      left join public.event_security_information i on i.id=r.security_information_id where r.id=p_target_id and r.status='open';
      if v_subject_user is null then raise exception 'A denúncia não aponta para um autor suspensível.'; end if;
      insert into public.event_community_suspensions(user_id,suspended_until,reason,created_by)
      values(v_subject_user,now()+make_interval(hours=>v_hours),v_reason,auth.uid())
      on conflict(user_id) do update set suspended_until=excluded.suspended_until,reason=excluded.reason,created_by=excluded.created_by,created_at=now();
      update public.event_community_reports set status='resolved',resolved_at=now(),resolved_by=auth.uid() where id=p_target_id;
    else raise exception 'Ação inválida para denúncia.';
    end if;
    insert into public.event_moderation_actions(actor_id,target_type,target_id,action,reason) values(auth.uid(),'report',p_target_id,p_action,v_reason);
    return;
  elsif p_target_type='comment' then
    select c.author_id into v_subject_user from public.event_discussion_comments c where c.id=p_target_id;
    if v_subject_user is null then raise exception 'Comentário não encontrado.'; end if;
    if p_action='publish_comment' then
      update public.event_discussion_comments set status='published',reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=p_target_id and status='pending';
    elsif p_action='hide_comment' then
      update public.event_discussion_comments set status='hidden',reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=p_target_id and status in('pending','published');
    elsif p_action='remove_comment' then
      update public.event_discussion_comments set status='removed',reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=p_target_id and status in('pending','published','hidden');
    elsif p_action='restore_comment' then
      update public.event_discussion_comments set status='pending',reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=p_target_id and status in('hidden','removed');
    elsif p_action='suspend_user' then
      insert into public.event_community_suspensions(user_id,suspended_until,reason,created_by)
      values(v_subject_user,now()+make_interval(hours=>v_hours),v_reason,auth.uid())
      on conflict(user_id) do update set suspended_until=excluded.suspended_until,reason=excluded.reason,created_by=excluded.created_by,created_at=now();
    else raise exception 'Ação inválida para comentário.';
    end if;
  elsif p_target_type='security_information' then
    select i.author_id into v_subject_user from public.event_security_information i where i.id=p_target_id;
    if v_subject_user is null then raise exception 'Informação não encontrada.'; end if;
    if p_action='confirm_information' then
      update public.event_security_information set verification_status='confirmed',verified_at=now(),verified_by=auth.uid(),updated_at=now() where id=p_target_id and verification_status='pending';
    elsif p_action='unconfirm_information' then
      update public.event_security_information set verification_status='unconfirmed',verified_at=now(),verified_by=auth.uid(),updated_at=now() where id=p_target_id and verification_status in('pending','confirmed');
    elsif p_action='hide_information' then
      update public.event_security_information set verification_status='hidden',verified_at=now(),verified_by=auth.uid(),updated_at=now() where id=p_target_id and verification_status<>'hidden';
    elsif p_action='restore_information' then
      update public.event_security_information set verification_status='pending',verified_at=null,verified_by=null,updated_at=now() where id=p_target_id and verification_status in('hidden','unconfirmed');
    elsif p_action='suspend_user' then
      insert into public.event_community_suspensions(user_id,suspended_until,reason,created_by)
      values(v_subject_user,now()+make_interval(hours=>v_hours),v_reason,auth.uid())
      on conflict(user_id) do update set suspended_until=excluded.suspended_until,reason=excluded.reason,created_by=excluded.created_by,created_at=now();
    else raise exception 'Ação inválida para informação.';
    end if;
  else raise exception 'Tipo de conteúdo inválido.';
  end if;
  insert into public.event_moderation_actions(actor_id,target_type,target_id,action,reason) values(auth.uid(),p_target_type,p_target_id,p_action,v_reason);
end;
$$;

create or replace function public.set_event_moderator(p_user_id uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path=pg_catalog,public,auth
as $$
begin
  if auth.uid() is null or not exists(select 1 from public.admin_users a where a.user_id=auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if p_user_id is null or p_user_id=auth.uid() then raise exception 'Selecione outra conta para administrar.'; end if;
  if p_enabled then
    insert into public.event_moderators(user_id,created_by) values(p_user_id,auth.uid()) on conflict(user_id) do nothing;
    insert into public.event_moderation_actions(actor_id,target_type,target_id,action,reason) values(auth.uid(),'moderator',p_user_id,'assign_moderator','');
  else
    delete from public.event_moderators where user_id=p_user_id;
    insert into public.event_moderation_actions(actor_id,target_type,target_id,action,reason) values(auth.uid(),'moderator',p_user_id,'remove_moderator','');
  end if;
end;
$$;

alter function private.community_author_name(uuid) set search_path=pg_catalog,pg_temp;
alter function private.is_event_moderator() set search_path=pg_catalog,pg_temp;
alter function private.assert_community_not_suspended(uuid) set search_path=pg_catalog,pg_temp;
alter function private.validate_community_text(text,boolean) set search_path=pg_catalog,pg_temp;
alter function private.guard_community_submission(uuid,uuid,text,text) set search_path=pg_catalog,pg_temp;
alter function public.get_event_security_information(text) set search_path=pg_catalog,pg_temp;
alter function public.get_event_discussion(text,text) set search_path=pg_catalog,pg_temp;
alter function public.get_event_interest_status(text) set search_path=pg_catalog,pg_temp;
alter function public.toggle_event_interest(text,boolean) set search_path=pg_catalog,pg_temp;
alter function public.submit_event_comment(text,text,text) set search_path=pg_catalog,pg_temp;
alter function public.update_event_comment(uuid,text) set search_path=pg_catalog,pg_temp;
alter function public.delete_event_comment(uuid) set search_path=pg_catalog,pg_temp;
alter function public.submit_event_security_information(text,text,text,text) set search_path=pg_catalog,pg_temp;
alter function public.report_event_community(text,text,uuid,text,text) set search_path=pg_catalog,pg_temp;
alter function public.get_event_moderation_queue() set search_path=pg_catalog,pg_temp;
alter function public.moderate_event_community(text,uuid,text,text,integer) set search_path=pg_catalog,pg_temp;
alter function public.set_event_moderator(uuid,boolean) set search_path=pg_catalog,pg_temp;

revoke all on function private.community_author_name(uuid) from public,anon,authenticated;
revoke all on function private.is_event_moderator() from public,anon,authenticated;
revoke all on function private.assert_community_not_suspended(uuid) from public,anon,authenticated;
revoke all on function private.validate_community_text(text,boolean) from public,anon,authenticated;
revoke all on function private.guard_community_submission(uuid,uuid,text,text) from public,anon,authenticated;

revoke all on function public.get_event_security_information(text) from public,anon,authenticated;
grant execute on function public.get_event_security_information(text) to anon,authenticated;
revoke all on function public.get_event_discussion(text,text) from public,anon,authenticated;
grant execute on function public.get_event_discussion(text,text) to anon,authenticated;
revoke all on function public.get_event_interest_status(text) from public,anon,authenticated;
grant execute on function public.get_event_interest_status(text) to anon,authenticated;
revoke all on function public.toggle_event_interest(text,boolean) from public,anon,authenticated;
grant execute on function public.toggle_event_interest(text,boolean) to authenticated;
revoke all on function public.submit_event_comment(text,text,text) from public,anon,authenticated;
grant execute on function public.submit_event_comment(text,text,text) to authenticated;
revoke all on function public.update_event_comment(uuid,text) from public,anon,authenticated;
grant execute on function public.update_event_comment(uuid,text) to authenticated;
revoke all on function public.delete_event_comment(uuid) from public,anon,authenticated;
grant execute on function public.delete_event_comment(uuid) to authenticated;
revoke all on function public.submit_event_security_information(text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_event_security_information(text,text,text,text) to authenticated;
revoke all on function public.report_event_community(text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.report_event_community(text,text,uuid,text,text) to authenticated;
revoke all on function public.get_event_moderation_queue() from public,anon,authenticated;
grant execute on function public.get_event_moderation_queue() to authenticated;
revoke all on function public.moderate_event_community(text,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.moderate_event_community(text,uuid,text,text,integer) to authenticated;
revoke all on function public.set_event_moderator(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_event_moderator(uuid,boolean) to authenticated;