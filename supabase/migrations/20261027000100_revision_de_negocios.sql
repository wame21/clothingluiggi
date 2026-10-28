-- Boutique ERP · Alta de negocios con revisión
-- · Sin SMTP no se confirma el correo: cada negocio nuevo espera a que el administrador de la plataforma lo acepte.
-- · En revisión o rechazado se bloquea igual que uno suspendido (is_member()/is_owner()); la app muestra la pantalla de espera.
-- · Rechazar no borra nada: usa suspended_at/suspended_reason y se puede aceptar después.
-- · La prueba corre desde que se acepta, no desde el registro.

-- null = en revisión. Los negocios que ya existen quedan aceptados.
alter table public.businesses add column approved_at timestamptz;
update public.businesses set approved_at = created_at;

-- membership (versión de 20261025000100_plan_unico.sql) con los estados de la revisión.
create or replace function public.membership(b public.businesses)
returns table (state text, ends_at timestamptz)
language sql stable set search_path = public as $$
  select
    case
      when b.approved_at is null then case when b.suspended_at is null then 'revision' else 'rechazada' end
      when b.suspended_at is not null then 'suspendida'
      when b.paid_until is null then case when now() < b.trial_ends_at then 'prueba' else 'vencida' end
      when now() <= b.paid_until then 'activa'
      when now() <= b.paid_until + interval '3 days' then 'gracia'
      else 'vencida'
    end,
    case
      when b.approved_at is null or b.suspended_at is not null then null
      when b.paid_until is null then case when now() < b.trial_ends_at then b.trial_ends_at end
      when now() <= b.paid_until then b.paid_until
      when now() <= b.paid_until + interval '3 days' then b.paid_until + interval '3 days'
    end
$$;

-- Solo los estados con acceso: cualquier estado nuevo nace bloqueado.
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.role in ('dueno', 'vendedor') and m.state in ('prueba', 'activa', 'gracia')
                     from public.profiles p join public.businesses b on b.id = p.business_id
                     cross join lateral public.membership(b) m
                    where p.id = auth.uid()), false)
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.role = 'dueno' and m.state in ('prueba', 'activa', 'gracia')
                     from public.profiles p join public.businesses b on b.id = p.business_id
                     cross join lateral public.membership(b) m
                    where p.id = auth.uid()), false)
$$;

create or replace function public.assert_member() returns void
language plpgsql stable security definer set search_path = public as $$
declare v_state text;
begin
  if not public.is_member() then
    select m.state into v_state
      from public.businesses b cross join lateral public.membership(b) m
     where b.id = public.current_business_id();
    if v_state = 'revision' then raise exception 'Cuenta en revisión'; end if;
    if v_state = 'rechazada' then raise exception 'Solicitud rechazada'; end if;
    if v_state = 'suspendida' then raise exception 'Cuenta suspendida'; end if;
    if v_state = 'vencida' then raise exception 'Membresía vencida'; end if;
    raise exception 'No autorizado';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Administración: aceptar o rechazar solicitudes
-- ---------------------------------------------------------------------------
-- También acepta una solicitud rechazada; la prueba vuelve a su duración completa desde hoy.
create function public.admin_approve(p_business uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_platform_admin();
  update public.businesses set approved_at = now(), trial_ends_at = default, suspended_at = null, suspended_reason = null
   where id = p_business and approved_at is null;
  if not found then raise exception 'El negocio no está en revisión'; end if;
  insert into public.membership_events (business_id, actor, action) values (p_business, auth.uid(), 'aceptar');
end;
$$;

create function public.admin_reject(p_business uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_platform_admin();
  update public.businesses set suspended_at = now(), suspended_reason = nullif(trim(p_reason), '')
   where id = p_business and approved_at is null;
  if not found then raise exception 'El negocio no está en revisión'; end if;
  insert into public.membership_events (business_id, actor, action, note) values (p_business, auth.uid(), 'rechazar', p_reason);
end;
$$;

revoke execute on function public.admin_approve(uuid), public.admin_reject(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_approve(uuid), public.admin_reject(uuid, text) to authenticated;
