-- Boutique ERP · El límite de invite_lookup pasa a la Edge Function invite-lookup
-- La llave ya no sale de x-forwarded-for (el cliente la altera): la función manda la IP que pone
-- Cloudflare, y solo ella (service_role) puede consultar códigos.

drop function public.invite_lookup(text);

-- La limpieza de intentos viejos filtra solo por fecha; el índice (key, at) no le sirve.
create index invite_attempts_at_idx on public.invite_attempts (at);

create function public.invite_lookup(p_code text, p_key text) returns text
language plpgsql volatile security definer set search_path = public as $$
begin
  -- Serializa por llave: sin esto, una ráfaga en paralelo cuenta antes de que se guarden sus intentos.
  perform pg_advisory_xact_lock(hashtext('invite_lookup:' || p_key));
  delete from public.invite_attempts where at < now() - interval '1 hour';
  if (select count(*) from public.invite_attempts where key = p_key and at > now() - interval '10 minutes') >= 30 then
    -- PT429: PostgREST responde 429 y la función lo reconoce por el código.
    raise exception 'Demasiados intentos, espera unos minutos' using errcode = 'PT429';
  end if;
  insert into public.invite_attempts (key) values (p_key);
  return (select name from public.businesses where invite_code = upper(trim(p_code)));
end;
$$;
revoke execute on function public.invite_lookup(text, text) from public, anon, authenticated;
grant execute on function public.invite_lookup(text, text) to service_role;
