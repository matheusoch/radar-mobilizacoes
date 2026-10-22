-- Repair accent normalization used for the final municipality safety check.
-- The replacement alphabet must include "ò" to keep translate() mappings aligned.
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
                 'áàâãäéèêëíìîïóòôõöúùûüç',
                 'aaaaaeeeeiiiiooooouuuuc')
       <> translate(lower(btrim(coalesce(v_city, ''))),
                 'áàâãäéèêëíìîïóòôõöúùûüç',
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
