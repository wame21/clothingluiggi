-- Boutique ERP · Un solo plan con todo el sistema
-- · Sin Lite/Plus/Pro: el negocio usa todos los módulos mientras esté en prueba, activa o en gracia.
-- · Al vencer (prueba sin pago o gracia agotada) la cuenta se bloquea igual que una suspendida: la base niega todo
--   salvo el perfil propio y my_membership, y la app muestra la pantalla de pago. Nada se borra.
-- · Los precios (mensualidad y alta) viven en la app (src/lib/constants.ts); el cobro sigue siendo manual con admin_mark_paid.

-- ---------------------------------------------------------------------------
-- Módulos fuera: políticas y RPC vuelven a sus versiones sin has_module()
-- ---------------------------------------------------------------------------
drop policy "equipo actualiza cotizaciones" on public.quotes;
create policy "equipo actualiza cotizaciones" on public.quotes
  for update to authenticated
  using (business_id = (select public.current_business_id()) and public.is_member())
  with check (business_id = (select public.current_business_id()) and public.is_member());

drop policy "dueño lee gastos" on public.expenses;
drop policy "dueño escribe gastos" on public.expenses;
create policy "dueño gestiona gastos" on public.expenses
  for all to authenticated
  using (business_id = (select public.current_business_id()) and public.is_owner())
  with check (business_id = (select public.current_business_id()) and public.is_owner());

-- save_quote (versión de 20261021000100_membresias.sql) sin la validación del módulo.
create or replace function public.save_quote(p jsonb) returns public.quotes
language plpgsql security definer set search_path = public as $$
declare v public.quotes; v_business uuid := public.current_business_id(); v_folio text; v_items jsonb;
begin
  perform public.assert_member();
  if not exists (select 1 from public.customers where id = p ->> 'customerId' and business_id = v_business) then
    raise exception 'Cliente inválido';
  end if;
  select coalesce(jsonb_agg(x - 'unitCost' order by n), '[]'::jsonb) into v_items
    from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) with ordinality t(x, n);
  if nullif(p ->> 'id', '') is not null then
    update public.quotes set
      valid_until = (p ->> 'validUntil')::timestamptz, customer_id = p ->> 'customerId', customer_name = p ->> 'customerName',
      items = v_items, tier_id = p ->> 'tierId', subtotal_list = (p ->> 'subtotalList')::numeric,
      discount = (p ->> 'discount')::numeric, subtotal = (p ->> 'subtotal')::numeric, shipping = (p ->> 'shipping')::numeric,
      total = (p ->> 'total')::numeric, deposit_pct = (p ->> 'depositPct')::numeric, status = p ->> 'status', notes = p ->> 'notes'
    where id = p ->> 'id' and business_id = v_business and status <> 'convertida'
    returning * into v;
    if v.id is not null then return v; end if;
    if exists (select 1 from public.quotes where id = p ->> 'id' and business_id = v_business and status = 'convertida') then
      raise exception 'La cotización ya es un pedido';
    end if;
  end if;

  update public.businesses set next_quote_folio = next_quote_folio + 1
   where id = v_business
  returning quote_prefix || lpad((next_quote_folio - 1)::text, 4, '0') into v_folio;

  insert into public.quotes (business_id, folio, valid_until, customer_id, customer_name, items, tier_id, subtotal_list, discount, subtotal,
                             shipping, total, deposit_pct, status, notes)
  values (v_business, v_folio, (p ->> 'validUntil')::timestamptz, p ->> 'customerId',
          p ->> 'customerName', v_items, p ->> 'tierId', (p ->> 'subtotalList')::numeric, (p ->> 'discount')::numeric,
          (p ->> 'subtotal')::numeric, (p ->> 'shipping')::numeric, (p ->> 'total')::numeric, (p ->> 'depositPct')::numeric,
          p ->> 'status', p ->> 'notes')
  returning * into v;
  return v;
end;
$$;

-- convert_quote (versión de 20261021000100_membresias.sql) sin la validación del módulo.
create or replace function public.convert_quote(p_quote text, p_deposit jsonb) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  q public.quotes; c public.customers; o public.orders;
  v_business uuid := public.current_business_id();
  v_warehouse text;
begin
  perform public.assert_member();
  select * into q from public.quotes where id = p_quote and business_id = v_business for update;
  if q.id is null then raise exception 'Cotización no encontrada'; end if;
  if q.status = 'convertida' then raise exception 'La cotización ya es un pedido'; end if;
  select id into v_warehouse from public.branches where business_id = v_business and is_warehouse;
  if v_warehouse is null then raise exception 'Configura qué sucursal surte el mayoreo'; end if;
  select * into c from public.customers where id = q.customer_id and business_id = v_business;
  o := public.create_order(jsonb_build_object(
    'channel', 'mayoreo', 'customerId', q.customer_id, 'customerName', q.customer_name, 'branch', v_warehouse,
    'items', q.items, 'shipping', q.shipping, 'tierId', q.tier_id, 'quoteId', q.id,
    'payments', case when coalesce((p_deposit ->> 'amount')::numeric, 0) > 0 then jsonb_build_array(p_deposit) else '[]'::jsonb end,
    'seller', (select name from public.profiles where id = auth.uid()),
    'shippingInfo', case when c.id is null then null else jsonb_build_object('city', c.city || ', ' || c.state) end
  ));
  update public.quotes set status = 'convertida', order_id = o.id where id = q.id and business_id = v_business;
  return o;
end;
$$;

drop function public.has_module(text);
drop function public.admin_set_plan(uuid, public.plan_tier, int, numeric, text);

-- ---------------------------------------------------------------------------
-- Estado calculado sin plan
-- ---------------------------------------------------------------------------
drop function public.membership(public.businesses);
create function public.membership(b public.businesses)
returns table (state text, ends_at timestamptz)
language sql stable set search_path = public as $$
  select
    case
      when b.suspended_at is not null then 'suspendida'
      when b.paid_until is null then case when now() < b.trial_ends_at then 'prueba' else 'vencida' end
      when now() <= b.paid_until then 'activa'
      when now() <= b.paid_until + interval '3 days' then 'gracia'
      else 'vencida'
    end,
    case
      when b.suspended_at is not null then null
      when b.paid_until is null then case when now() < b.trial_ends_at then b.trial_ends_at end
      when now() <= b.paid_until then b.paid_until
      when now() <= b.paid_until + interval '3 days' then b.paid_until + interval '3 days'
    end
$$;
revoke execute on function public.membership(public.businesses) from public, anon, authenticated;

-- Vencida o suspendida: is_member()/is_owner() fallan, así que RLS y las RPC niegan todo.
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.role in ('dueno', 'vendedor') and m.state not in ('vencida', 'suspendida')
                     from public.profiles p join public.businesses b on b.id = p.business_id
                     cross join lateral public.membership(b) m
                    where p.id = auth.uid()), false)
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.role = 'dueno' and m.state not in ('vencida', 'suspendida')
                     from public.profiles p join public.businesses b on b.id = p.business_id
                     cross join lateral public.membership(b) m
                    where p.id = auth.uid()), false)
$$;

-- La app reconoce estos dos mensajes y vuelve a cargar para mostrar la pantalla de pago.
create or replace function public.assert_member() returns void
language plpgsql stable security definer set search_path = public as $$
declare v_state text;
begin
  if not public.is_member() then
    select m.state into v_state
      from public.businesses b cross join lateral public.membership(b) m
     where b.id = public.current_business_id();
    if v_state = 'suspendida' then raise exception 'Cuenta suspendida'; end if;
    if v_state = 'vencida' then raise exception 'Membresía vencida'; end if;
    raise exception 'No autorizado';
  end if;
end;
$$;

-- Responde también con la cuenta bloqueada: la app necesita el estado y el motivo para la pantalla de pago.
create or replace function public.my_membership() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'state', m.state, 'trialEndsAt', b.trial_ends_at, 'paidUntil', b.paid_until,
    'graceEndsAt', b.paid_until + interval '3 days', 'suspendedReason', b.suspended_reason)
    from public.businesses b
    cross join lateral public.membership(b) m
   where b.id = public.current_business_id()
$$;

-- ---------------------------------------------------------------------------
-- Administración de la plataforma
-- ---------------------------------------------------------------------------
drop function public.admin_businesses();
create function public.admin_businesses()
returns table (id uuid, name text, owner_name text, owner_email text, state text, ends_at timestamptz, trial_ends_at timestamptz,
               paid_until timestamptz, suspended_at timestamptz, suspended_reason text, members int, orders_30d int, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_platform_admin();
  return query
    select b.id, b.name, o.name, o.email, m.state, m.ends_at, b.trial_ends_at, b.paid_until, b.suspended_at, b.suspended_reason,
           (select count(*)::int from public.profiles p where p.business_id = b.id and p.role in ('dueno', 'vendedor')),
           (select count(*)::int from public.orders r where r.business_id = b.id and r.date > now() - interval '30 days'),
           b.created_at
      from public.businesses b
      cross join lateral public.membership(b) m
      left join public.profiles o on o.business_id = b.id and o.role = 'dueno'
     order by b.created_at desc;
end;
$$;

-- El nuevo periodo corre desde el pago (o desde el vencimiento si aún no vence), sin cargos extra.
create or replace function public.admin_mark_paid(p_business uuid, p_months int, p_amount numeric, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare b public.businesses; v_paid timestamptz;
begin
  perform public.assert_platform_admin();
  if p_months is null or p_months < 1 then raise exception 'Meses inválidos'; end if;
  select * into b from public.businesses where id = p_business for update;
  if b.id is null then raise exception 'Negocio no encontrado'; end if;
  v_paid := greatest(b.paid_until, now()) + make_interval(months => p_months);
  update public.businesses set paid_until = v_paid where id = p_business;
  insert into public.membership_events (business_id, actor, action, paid_until, amount, note)
  values (p_business, auth.uid(), 'pago', v_paid, nullif(p_amount, 0), p_note);
end;
$$;

drop function public.admin_events(uuid);
alter table public.membership_events drop column from_plan, drop column to_plan;
create function public.admin_events(p_business uuid)
returns table (id bigint, at timestamptz, actor_email text, action text, paid_until timestamptz, amount numeric, note text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_platform_admin();
  return query
    select e.id, e.at, u.email::text, e.action, e.paid_until, e.amount, e.note
      from public.membership_events e left join auth.users u on u.id = e.actor
     where e.business_id = p_business
     order by e.at desc, e.id desc;
end;
$$;

-- Las funciones recreadas nacen ejecutables por todos: mismos permisos que en 20261021000100_membresias.sql.
revoke execute on function public.admin_businesses(), public.admin_events(uuid) from public, anon, authenticated;
grant execute on function public.admin_businesses(), public.admin_events(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Catálogo de planes fuera
-- ---------------------------------------------------------------------------
alter table public.businesses drop column plan;
drop table public.plans;
drop type public.plan_tier;
