-- Boutique ERP · Membresías Lite / Plus / Pro
-- · El estado se calcula con now() (sin tareas programadas): prueba de Pro de 14 días al alta; al vencer la
--   prueba o un plan pagado el negocio baja a Lite (tras 3 días de gracia si había pago). Nada se borra.
-- · Suspender es solo manual y bloquea todo vía is_member()/is_owner(), de las que cuelgan RLS y las RPC.
-- · Cobro manual: el administrador de la plataforma marca los pagos con las RPC admin_*.

create type public.plan_tier as enum ('lite', 'plus', 'pro');

-- Catálogo: cambiar precios o módulos son solo datos.
create table public.plans (
  id public.plan_tier primary key,
  name text not null,
  price_monthly numeric(12, 2) not null default 0,
  modules text[] not null,
  sort int not null
);
insert into public.plans (id, name, price_monthly, modules, sort) values
  ('lite', 'Lite', 0, '{panel,pos,pedidos,inventario,clientes}', 1),
  ('plus', 'Plus', 0, '{panel,pos,pedidos,inventario,clientes,mayoreo,finanzas}', 2),
  ('pro',  'Pro',  0, '{panel,pos,pedidos,inventario,clientes,mayoreo,finanzas,reportes}', 3);
alter table public.plans enable row level security;
create policy "todos leen planes" on public.plans for select to authenticated using (true);

-- Los negocios existentes quedan con prueba de Pro desde hoy (el default se evalúa una vez al agregar la columna).
alter table public.businesses
  add column plan public.plan_tier not null default 'pro',
  add column trial_ends_at timestamptz not null default now() + interval '14 days',
  add column paid_until timestamptz,
  add column suspended_at timestamptz,
  add column suspended_reason text;

-- Administradores de la plataforma: se dan de alta por SQL; la app nunca los toca.
create table public.platform_admins (user_id uuid primary key references auth.users (id) on delete cascade);

create table public.membership_events (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  from_plan public.plan_tier,
  to_plan public.plan_tier,
  paid_until timestamptz,
  amount numeric(12, 2),
  note text
);
create index membership_events_business_idx on public.membership_events (business_id, at desc);
alter table public.platform_admins enable row level security;
alter table public.membership_events enable row level security;
revoke all on public.platform_admins, public.membership_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Estado calculado
-- ---------------------------------------------------------------------------
-- ends_at: hasta cuándo dura el estado actual con su plan (null si ya es Lite o está suspendida).
create or replace function public.membership(b public.businesses)
returns table (effective_plan public.plan_tier, state text, ends_at timestamptz)
language sql stable set search_path = public as $$
  select
    (case
       when b.suspended_at is not null then b.plan
       when b.plan = 'lite' then 'lite'
       when b.paid_until is null then case when now() < b.trial_ends_at then b.plan else 'lite' end
       when now() <= b.paid_until + interval '3 days' then b.plan
       else 'lite'
     end)::public.plan_tier,
    case
      when b.suspended_at is not null then 'suspendida'
      when b.plan = 'lite' then 'activa'
      when b.paid_until is null then case when now() < b.trial_ends_at then 'prueba' else 'vencida' end
      when now() <= b.paid_until then 'activa'
      when now() <= b.paid_until + interval '3 days' then 'gracia'
      else 'vencida'
    end,
    case
      when b.suspended_at is not null or b.plan = 'lite' then null
      when b.paid_until is null then case when now() < b.trial_ends_at then b.trial_ends_at end
      when now() <= b.paid_until then b.paid_until
      when now() <= b.paid_until + interval '3 days' then b.paid_until + interval '3 days'
    end
$$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

-- ¿El plan efectivo del negocio en sesión incluye el módulo? Suspendida: ninguno.
create or replace function public.has_module(p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p_module = any (pl.modules)
      from public.businesses b
      cross join lateral public.membership(b) m
      join public.plans pl on pl.id = m.effective_plan
     where b.id = public.current_business_id() and m.state <> 'suspendida'
  ), false)
$$;

-- Responde también con la cuenta suspendida: la app necesita el motivo para mostrar la pantalla.
create or replace function public.my_membership() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'plan', b.plan, 'effectivePlan', m.effective_plan, 'state', m.state,
    'trialEndsAt', b.trial_ends_at, 'paidUntil', b.paid_until,
    'graceEndsAt', b.paid_until + interval '3 days',
    'modules', case when m.state = 'suspendida' then '[]'::json else to_json(pe.modules) end,
    'price', pb.price_monthly, 'suspendedReason', b.suspended_reason)
    from public.businesses b
    cross join lateral public.membership(b) m
    join public.plans pe on pe.id = m.effective_plan
    join public.plans pb on pb.id = b.plan
   where b.id = public.current_business_id()
$$;

-- ---------------------------------------------------------------------------
-- Suspensión: is_member()/is_owner() la exigen, así que RLS y las RPC niegan todo.
-- El perfil propio sigue legible: su política no pasa por is_member().
-- ---------------------------------------------------------------------------
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.role in ('dueno', 'vendedor') and b.suspended_at is null
                     from public.profiles p join public.businesses b on b.id = p.business_id
                    where p.id = auth.uid()), false)
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.role = 'dueno' and b.suspended_at is null
                     from public.profiles p join public.businesses b on b.id = p.business_id
                    where p.id = auth.uid()), false)
$$;

create or replace function public.assert_member() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member() then
    if exists (select 1 from public.businesses where id = public.current_business_id() and suspended_at is not null) then
      raise exception 'Cuenta suspendida';
    end if;
    raise exception 'No autorizado';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC de dueño (versión de 20261019000200_seguridad.sql): assert_member() primero, para que una cuenta suspendida
-- reciba 'Cuenta suspendida' y no 'Solo el dueño…'.
-- ---------------------------------------------------------------------------
create or replace function public.regenerate_invite_code() returns text
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  perform public.assert_member();
  if not public.is_owner() then raise exception 'Solo el dueño puede cambiar el código de invitación'; end if;
  update public.businesses set invite_code = public.generate_invite_code()
   where id = public.current_business_id()
  returning invite_code into v_code;
  return v_code;
end;
$$;

create or replace function public.update_business(p_name text, p_order_prefix text, p_quote_prefix text)
returns public.businesses
language plpgsql security definer set search_path = public as $$
declare
  v public.businesses;
  v_name text := trim(coalesce(p_name, ''));
  v_order text := trim(coalesce(p_order_prefix, ''));
  v_quote text := trim(coalesce(p_quote_prefix, ''));
begin
  perform public.assert_member();
  if not public.is_owner() then raise exception 'Solo el dueño puede editar el negocio'; end if;
  if v_name = '' then raise exception 'El nombre del negocio es obligatorio'; end if;
  if v_order = '' or v_quote = '' then raise exception 'Los prefijos de folio no pueden estar vacíos'; end if;
  if length(v_order) > 10 or length(v_quote) > 10 then raise exception 'Los prefijos de folio admiten hasta 10 caracteres'; end if;
  update public.businesses set name = v_name, order_prefix = v_order, quote_prefix = v_quote
   where id = public.current_business_id()
  returning * into v;
  return v;
end;
$$;

create or replace function public.set_member(p_id uuid, p_role public.app_role, p_branch text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare v public.profiles; v_business uuid := public.current_business_id();
begin
  perform public.assert_member();
  if not public.is_owner() then raise exception 'Solo el dueño puede administrar el equipo'; end if;
  if p_id = auth.uid() then raise exception 'No puedes cambiar tu propio rol'; end if;
  if p_role = 'dueno' then raise exception 'Solo puede haber un dueño'; end if;
  if p_branch is not null and not exists (select 1 from public.branches where id = p_branch and business_id = v_business) then
    raise exception 'Sucursal inválida';
  end if;
  update public.profiles set role = p_role, branch = p_branch where id = p_id and business_id = v_business returning * into v;
  if v.id is null then raise exception 'Colaborador no encontrado'; end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Módulos: Mayoreo (cotizaciones) y Finanzas (gastos). Leer cotizaciones sigue permitido: al bajar de plan se conservan.
-- ---------------------------------------------------------------------------
drop policy "equipo actualiza cotizaciones" on public.quotes;
create policy "equipo actualiza cotizaciones" on public.quotes
  for update to authenticated
  using (business_id = (select public.current_business_id()) and public.is_member() and (select public.has_module('mayoreo')))
  with check (business_id = (select public.current_business_id()) and public.is_member() and (select public.has_module('mayoreo')));

-- Gastos: al bajar de plan el dueño sigue leyendo los suyos (las políticas permisivas se suman con OR); escribir exige Finanzas.
drop policy "dueño gestiona gastos" on public.expenses;
create policy "dueño lee gastos" on public.expenses
  for select to authenticated
  using (business_id = (select public.current_business_id()) and public.is_owner());
create policy "dueño escribe gastos" on public.expenses
  for all to authenticated
  using (business_id = (select public.current_business_id()) and public.is_owner() and (select public.has_module('finanzas')))
  with check (business_id = (select public.current_business_id()) and public.is_owner() and (select public.has_module('finanzas')));

-- save_quote (versión de 20261020000200_decisiones.sql) con la validación del módulo.
create or replace function public.save_quote(p jsonb) returns public.quotes
language plpgsql security definer set search_path = public as $$
declare v public.quotes; v_business uuid := public.current_business_id(); v_folio text; v_items jsonb;
begin
  perform public.assert_member();
  if not public.has_module('mayoreo') then raise exception 'Tu plan no incluye Mayoreo'; end if;
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

-- convert_quote (versión de 20261019000300_operaciones.sql) con la validación del módulo.
create or replace function public.convert_quote(p_quote text, p_deposit jsonb) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  q public.quotes; c public.customers; o public.orders;
  v_business uuid := public.current_business_id();
  v_warehouse text;
begin
  perform public.assert_member();
  if not public.has_module('mayoreo') then raise exception 'Tu plan no incluye Mayoreo'; end if;
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

-- ---------------------------------------------------------------------------
-- Administración de la plataforma (cobro manual)
-- ---------------------------------------------------------------------------
create or replace function public.assert_platform_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Solo administradores de la plataforma'; end if;
end;
$$;

create or replace function public.admin_businesses()
returns table (id uuid, name text, owner_name text, owner_email text, plan public.plan_tier, effective_plan public.plan_tier,
               state text, ends_at timestamptz, trial_ends_at timestamptz, paid_until timestamptz, suspended_at timestamptz, suspended_reason text,
               members int, orders_30d int, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_platform_admin();
  return query
    select b.id, b.name, o.name, o.email, b.plan, m.effective_plan, m.state, m.ends_at, b.trial_ends_at, b.paid_until, b.suspended_at,
           b.suspended_reason,
           (select count(*)::int from public.profiles p where p.business_id = b.id and p.role in ('dueno', 'vendedor')),
           (select count(*)::int from public.orders r where r.business_id = b.id and r.date > now() - interval '30 days'),
           b.created_at
      from public.businesses b
      cross join lateral public.membership(b) m
      left join public.profiles o on o.business_id = b.id and o.role = 'dueno'
     order by b.created_at desc;
end;
$$;

-- Mejora o degrada el plan; con p_months > 0 también marca el pago. Lite no lleva vencimiento.
create or replace function public.admin_set_plan(p_business uuid, p_plan public.plan_tier, p_months int default 0,
                                                 p_amount numeric default 0, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare b public.businesses; v_paid timestamptz;
begin
  perform public.assert_platform_admin();
  if p_months is null or p_months < 0 then raise exception 'Meses inválidos'; end if;
  select * into b from public.businesses where id = p_business for update;
  if b.id is null then raise exception 'Negocio no encontrado'; end if;
  -- Sin periodo pagado ni prueba vigente, mejorar sin pago no surte efecto: el estado seguiría en Lite.
  if p_plan <> 'lite' and p_months = 0
     and not coalesce(b.paid_until > now(), b.trial_ends_at > now(), false) then
    raise exception 'Registra al menos un mes de pago para mejorar el plan';
  end if;
  v_paid := case when p_plan = 'lite' then null
                 when p_months > 0 then greatest(b.paid_until, now()) + make_interval(months => p_months)
                 else b.paid_until end;
  update public.businesses set plan = p_plan, paid_until = v_paid where id = p_business;
  insert into public.membership_events (business_id, actor, action, from_plan, to_plan, paid_until, amount, note)
  values (p_business, auth.uid(), case when p_plan = 'lite' then 'degradar' else 'plan' end, b.plan, p_plan, v_paid,
          nullif(p_amount, 0), p_note);
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
  if b.plan = 'lite' then raise exception 'Lite es gratis: mejora el plan primero'; end if;
  v_paid := greatest(b.paid_until, now()) + make_interval(months => p_months);
  update public.businesses set paid_until = v_paid where id = p_business;
  insert into public.membership_events (business_id, actor, action, from_plan, to_plan, paid_until, amount, note)
  values (p_business, auth.uid(), 'pago', b.plan, b.plan, v_paid, nullif(p_amount, 0), p_note);
end;
$$;

create or replace function public.admin_suspend(p_business uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_platform_admin();
  update public.businesses set suspended_at = now(), suspended_reason = nullif(trim(p_reason), '') where id = p_business;
  if not found then raise exception 'Negocio no encontrado'; end if;
  insert into public.membership_events (business_id, actor, action, note) values (p_business, auth.uid(), 'suspender', p_reason);
end;
$$;

create or replace function public.admin_reactivate(p_business uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_platform_admin();
  update public.businesses set suspended_at = null, suspended_reason = null where id = p_business;
  if not found then raise exception 'Negocio no encontrado'; end if;
  insert into public.membership_events (business_id, actor, action) values (p_business, auth.uid(), 'reactivar');
end;
$$;

create or replace function public.admin_events(p_business uuid)
returns table (id bigint, at timestamptz, actor_email text, action text, from_plan public.plan_tier, to_plan public.plan_tier,
               paid_until timestamptz, amount numeric, note text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_platform_admin();
  return query
    select e.id, e.at, u.email::text, e.action, e.from_plan, e.to_plan, e.paid_until, e.amount, e.note
      from public.membership_events e left join auth.users u on u.id = e.actor
     where e.business_id = p_business
     order by e.at desc, e.id desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución: nada para anon. membership() y assert_platform_admin() son internas.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.membership(public.businesses), public.is_platform_admin(), public.has_module(text), public.my_membership(),
  public.assert_platform_admin(), public.admin_businesses(),
  public.admin_set_plan(uuid, public.plan_tier, int, numeric, text), public.admin_mark_paid(uuid, int, numeric, text),
  public.admin_suspend(uuid, text), public.admin_reactivate(uuid), public.admin_events(uuid)
  from public, anon, authenticated;
grant execute on function
  public.is_platform_admin(), public.has_module(text), public.my_membership(), public.admin_businesses(),
  public.admin_set_plan(uuid, public.plan_tier, int, numeric, text), public.admin_mark_paid(uuid, int, numeric, text),
  public.admin_suspend(uuid, text), public.admin_reactivate(uuid), public.admin_events(uuid)
  to authenticated;
