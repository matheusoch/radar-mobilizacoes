-- Durable, privacy-preserving geocoding queue for public events.
create schema if not exists private;

create table if not exists private.event_geocoding_jobs (
  event_id uuid primary key references public.events(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','processing','retry','done','needs_review')),
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 20),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  last_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_geocoding_jobs_ready_idx
  on private.event_geocoding_jobs (status, next_attempt_at, created_at);

create table if not exists private.event_geocoding_worker_auth (
  singleton boolean primary key default true check (singleton),
  token_hash text not null,
  updated_at timestamptz not null default now()
);

alter table private.event_geocoding_jobs enable row level security;
alter table private.event_geocoding_worker_auth enable row level security;
revoke all on schema private from public, anon, authenticated;
revoke all on table private.event_geocoding_jobs from public, anon, authenticated;
revoke all on table private.event_geocoding_worker_auth from public, anon, authenticated;

create or replace function private.is_valid_event_geocoding_token(p_token text)
returns boolean
language sql
security definer
set search_path = pg_catalog, private, extensions
as $$
  select exists (
    select 1
    from private.event_geocoding_worker_auth a
    where a.singleton = true
      and a.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  );
$$;

revoke all on function private.is_valid_event_geocoding_token(text) from public, anon, authenticated;

create or replace function private.event_has_specific_geocoding_target(p_venue text, p_address text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v text := translate(lower(btrim(coalesce(p_venue, ''))),
    'áàâãäéèêëíìîïóòôõöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc');
  a text := translate(lower(btrim(coalesce(p_address, ''))),
    'áàâãäéèêëíìîïóòôõöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc');
  vague text[] := array[
    '', 'local', 'local a definir', 'local a confirmar',
    'local ainda nao confirmado', 'local nao confirmado',
    'a definir', 'a confirmar', 'nao informado', 'nao informado no poster',
    'endereco nao informado', 'ponto a definir', 'concentracao nao especificada',
    'presencial', 'online', 'virtual', 'centro', 'bairro', 'bairro mutirao',
    'lago', 'local do evento'
  ];
begin
  if v = any(vague) and (a = '' or a = any(vague)) then
    return false;
  end if;
  if v = '' and (a = '' or a = any(vague)) then
    return false;
  end if;
  if v = any(vague) and a = any(vague) then
    return false;
  end if;
  return true;
end;
$$;

revoke all on function private.event_has_specific_geocoding_target(text, text) from public, anon, authenticated;

create or replace function private.enqueue_event_geocoding()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.lat is not null and new.lng is not null then
    update private.event_geocoding_jobs
       set status = 'done', locked_at = null, last_error = null, updated_at = now()
     where event_id = new.id;
    return new;
  end if;

  if new.lat is not null or new.lng is not null then
    update private.event_geocoding_jobs
       set status = 'needs_review',
           locked_at = null,
           last_error = 'O evento tem somente uma das duas coordenadas; revise o ponto manualmente.',
           updated_at = now()
     where event_id = new.id;
    return new;
  end if;

  if new.is_public is distinct from true then
    update private.event_geocoding_jobs
       set status = 'needs_review',
           locked_at = null,
           last_error = 'O evento não está publicado; a geocodificação automática aguarda a publicação.',
           updated_at = now()
     where event_id = new.id and status not in ('done');
    return new;
  end if;

  if not private.event_has_specific_geocoding_target(new.venue, new.address) then
    update private.event_geocoding_jobs
       set status = 'needs_review',
           locked_at = null,
           last_error = 'Local vago ou insuficiente para geocodificação automática.',
           updated_at = now()
     where event_id = new.id and status not in ('done');
    return new;
  end if;

  insert into private.event_geocoding_jobs (event_id)
  values (new.id)
  on conflict (event_id) do update
     set status = 'pending',
         attempts = 0,
         next_attempt_at = now(),
         locked_at = null,
         last_attempt_at = null,
         last_error = null,
         last_source = null,
         updated_at = now();

  return new;
end;
$$;

revoke all on function private.enqueue_event_geocoding() from public, anon, authenticated;

drop trigger if exists events_enqueue_geocoding on public.events;
create trigger events_enqueue_geocoding
after insert or update of is_public, city, state, venue, address, lat, lng
on public.events
for each row execute function private.enqueue_event_geocoding();

-- Backfill existing published events with useful venue/address text.
insert into private.event_geocoding_jobs (event_id)
select e.id
from public.events e
where e.is_public is true
  and e.lat is null
  and e.lng is null
  and private.event_has_specific_geocoding_target(e.venue, e.address)
on conflict (event_id) do nothing;

create or replace function public.claim_event_geocoding_jobs(p_token text, p_limit integer)
returns table (
  event_id uuid,
  title text,
  event_date date,
  city text,
  state text,
  venue text,
  address text,
  description text,
  notes text,
  attempts integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
begin
  if not private.is_valid_event_geocoding_token(p_token) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  return query
  with eligible as (
    select j.event_id
    from private.event_geocoding_jobs j
    join public.events e on e.id = j.event_id
    where e.is_public is true
      and e.lat is null
      and e.lng is null
      and private.event_has_specific_geocoding_target(e.venue, e.address)
      and j.attempts < 6
      and (
        (j.status in ('pending','retry') and j.next_attempt_at <= now())
        or (j.status = 'processing' and j.locked_at < now() - interval '15 minutes')
      )
    order by j.next_attempt_at asc, j.created_at asc
    limit least(greatest(coalesce(p_limit, 2), 1), 2)
    for update of j skip locked
  ),
  claimed as (
    update private.event_geocoding_jobs j
       set status = 'processing',
           attempts = j.attempts + 1,
           locked_at = now(),
           last_attempt_at = now(),
           updated_at = now()
      from eligible x
     where j.event_id = x.event_id
    returning j.event_id, j.attempts
  )
  select e.id, e.title, e.date, e.city, e.state, e.venue, e.address,
         e.description, e.notes, c.attempts
    from claimed c
    join public.events e on e.id = c.event_id;
end;
$$;

create or replace function public.finish_event_geocoding_job(
  p_token text,
  p_event_id uuid,
  p_outcome text,
  p_lat double precision,
  p_lng double precision,
  p_resolved_city text,
  p_resolved_state text,
  p_venue text,
  p_address text,
  p_source text,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_attempts integer;
  v_city text;
  v_state text;
  v_lat double precision;
  v_lng double precision;
  v_saved integer := 0;
  v_status text;
  v_error text := left(coalesce(nullif(btrim(p_error), ''), 'A geocodificação não confirmou um ponto único.'), 1000);
begin
  if not private.is_valid_event_geocoding_token(p_token) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select j.attempts into v_attempts
  from private.event_geocoding_jobs j
  where j.event_id = p_event_id
  for update;

  if not found then
    return jsonb_build_object('saved', false, 'status', 'missing_job');
  end if;

  if p_outcome = 'verified' then
    select e.city, e.state, e.lat, e.lng
      into v_city, v_state, v_lat, v_lng
      from public.events e
     where e.id = p_event_id
     for update;

    if not found then
      update private.event_geocoding_jobs
         set status = 'needs_review', locked_at = null,
             last_error = 'O evento deixou de existir durante a geocodificação.',
             updated_at = now()
       where event_id = p_event_id;
      return jsonb_build_object('saved', false, 'status', 'missing_event');
    end if;

    if v_lat is not null and v_lng is not null then
      update private.event_geocoding_jobs
         set status = 'done', locked_at = null, last_error = null,
             last_source = coalesce(nullif(p_source, ''), last_source), updated_at = now()
       where event_id = p_event_id;
      return jsonb_build_object('saved', false, 'status', 'already_located');
    end if;

    if v_lat is not null or v_lng is not null then
      update private.event_geocoding_jobs
         set status = 'needs_review', locked_at = null,
             last_error = 'O evento tem uma coordenada parcial; não foi sobrescrito.',
             updated_at = now()
       where event_id = p_event_id;
      return jsonb_build_object('saved', false, 'status', 'partial_coordinates');
    end if;

    if p_lat is null or p_lng is null
       or p_lat < -34.0 or p_lat > 6.5
       or p_lng < -74.0 or p_lng > -34.0 then
      update private.event_geocoding_jobs
         set status = 'needs_review', locked_at = null,
             last_error = 'As coordenadas retornadas estão ausentes ou fora dos limites geográficos esperados para o Brasil.',
             last_source = nullif(p_source, ''), updated_at = now()
       where event_id = p_event_id;
      return jsonb_build_object('saved', false, 'status', 'invalid_coordinates');
    end if;

    if translate(lower(btrim(coalesce(p_resolved_city, ''))),
                 'áàâãäéèêëíìîïóôõöúùûüç',
                 'aaaaaeeeeiiiiooooouuuuc')
       <> translate(lower(btrim(coalesce(v_city, ''))),
                 'áàâãäéèêëíìîïóôõöúùûüç',
                 'aaaaaeeeeiiiiooooouuuuc')
       or upper(btrim(coalesce(p_resolved_state, ''))) <> upper(btrim(coalesce(v_state, ''))) then
      update private.event_geocoding_jobs
         set status = 'needs_review', locked_at = null,
             last_error = 'A cidade/UF retornada não coincide exatamente com o cadastro; o ponto não foi gravado.',
             last_source = nullif(p_source, ''), updated_at = now()
       where event_id = p_event_id;
      return jsonb_build_object('saved', false, 'status', 'geography_mismatch');
    end if;

    update public.events
       set lat = p_lat,
           lng = p_lng,
           venue = coalesce(nullif(btrim(p_venue), ''), venue),
           address = coalesce(nullif(btrim(p_address), ''), address)
     where id = p_event_id
       and lat is null and lng is null;

    get diagnostics v_saved = row_count;

    if v_saved = 1 then
      update private.event_geocoding_jobs
         set status = 'done', locked_at = null, last_error = null,
             last_source = nullif(p_source, ''), updated_at = now()
       where event_id = p_event_id;
      return jsonb_build_object('saved', true, 'status', 'done');
    end if;

    update private.event_geocoding_jobs
       set status = 'done', locked_at = null, last_error = null, updated_at = now()
     where event_id = p_event_id;
    return jsonb_build_object('saved', false, 'status', 'already_located');
  end if;

  if p_outcome = 'needs_review' then
    update private.event_geocoding_jobs
       set status = 'needs_review', locked_at = null,
           last_error = v_error,
           last_source = nullif(p_source, ''),
           updated_at = now()
     where event_id = p_event_id;
    return jsonb_build_object('saved', false, 'status', 'needs_review');
  end if;

  if p_outcome = 'retry' then
    if v_attempts >= 6 then
      v_status := 'needs_review';
    else
      v_status := 'retry';
    end if;

    update private.event_geocoding_jobs
       set status = v_status,
           next_attempt_at = now() + case
             when v_attempts <= 1 then interval '15 minutes'
             when v_attempts = 2 then interval '1 hour'
             when v_attempts = 3 then interval '6 hours'
             when v_attempts = 4 then interval '24 hours'
             else interval '48 hours'
           end,
           locked_at = null,
           last_error = v_error,
           last_source = nullif(p_source, ''),
           updated_at = now()
     where event_id = p_event_id;
    return jsonb_build_object('saved', false, 'status', v_status, 'attempts', v_attempts);
  end if;

  update private.event_geocoding_jobs
     set status = 'needs_review', locked_at = null,
         last_error = 'Resultado de geocodificação desconhecido; revise o ponto manualmente.',
         last_source = nullif(p_source, ''), updated_at = now()
   where event_id = p_event_id;
  return jsonb_build_object('saved', false, 'status', 'needs_review');
end;
$$;

revoke all on function public.claim_event_geocoding_jobs(text, integer) from public;
revoke all on function public.finish_event_geocoding_job(text, uuid, text, double precision, double precision, text, text, text, text, text, text) from public;
grant execute on function public.claim_event_geocoding_jobs(text, integer) to anon, authenticated;
grant execute on function public.finish_event_geocoding_job(text, uuid, text, double precision, double precision, text, text, text, text, text, text) to anon, authenticated;
