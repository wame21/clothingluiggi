-- Boutique ERP · Decisiones de producto: costo oculto a vendedores, recoger en sucursal, transiciones de estado y límite de invitaciones

-- ---------------------------------------------------------------------------
-- Tablas nuevas y RLS
-- ---------------------------------------------------------------------------

-- El costo solo lo ve el dueño: vive aparte de products y orders, que leen los vendedores.
-- La llave compuesta impide que un negocio ocupe la fila de costo de un producto o pedido ajeno.
alter table public.products add constraint products_id_business_key unique (id, business_id);
alter table public.orders add constraint orders_id_business_key unique (id, business_id);

create table public.product_costs (
  product_id text primary key,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  cost numeric(12, 2) not null default 0 check (cost >= 0),
  foreign key (product_id, business_id) references public.products (id, business_id) on delete cascade
);
create index product_costs_business_idx on public.product_costs (business_id);

-- costs = { "<variantKey>": <costo unitario al momento de la venta> }
create table public.order_costs (
  order_id text primary key,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  costs jsonb not null default '{}',
  foreign key (order_id, business_id) references public.orders (id, business_id) on delete cascade
);
create index order_costs_business_idx on public.order_costs (business_id);

alter table public.product_costs enable row level security;
alter table public.order_costs enable row level security;

create policy "dueño gestiona costos de productos" on public.product_costs
  for all to authenticated
  using (business_id = (select public.current_business_id()) and public.is_owner())
  with check (business_id = (select public.current_business_id()) and public.is_owner());

create policy "dueño gestiona costos de pedidos" on public.order_costs
  for all to authenticated
  using (business_id = (select public.current_business_id()) and public.is_owner())
  with check (business_id = (select public.current_business_id()) and public.is_owner());

-- Recoge en sucursal deja de ser texto en las notas.
alter table public.orders add column pickup boolean not null default false;

-- Intentos de consulta de códigos de invitación; sin políticas ni permisos, solo la función los toca.
create table public.invite_attempts (
  key text not null,
  at timestamptz not null default now()
);
create index invite_attempts_key_at_idx on public.invite_attempts (key, at);
alter table public.invite_attempts enable row level security;
revoke all on public.invite_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Copia de datos
-- ---------------------------------------------------------------------------
insert into public.product_costs (product_id, business_id, cost)
select id, business_id, cost from public.products;

insert into public.order_costs (order_id, business_id, costs)
select o.id, o.business_id,
       coalesce((select jsonb_object_agg(x ->> 'variantKey', x -> 'unitCost')
                   from jsonb_array_elements(o.items) x
                  where x ? 'variantKey' and x ? 'unitCost'), '{}'::jsonb)
  from public.orders o;

update public.orders set pickup = true where position('Recoge en sucursal' in coalesce(notes, '')) > 0;

-- ---------------------------------------------------------------------------
-- Quitar el costo de products, orders.items y quotes.items
-- ---------------------------------------------------------------------------
alter table public.products drop column cost;

update public.orders
   set items = (select coalesce(jsonb_agg(x - 'unitCost' order by n), '[]'::jsonb) from jsonb_array_elements(items) with ordinality t(x, n));
update public.quotes
   set items = (select coalesce(jsonb_agg(x - 'unitCost' order by n), '[]'::jsonb) from jsonb_array_elements(items) with ordinality t(x, n));

-- ---------------------------------------------------------------------------
-- Funciones
-- ---------------------------------------------------------------------------

-- create_order: ignora el unitCost del cliente; el costo sale de product_costs y se guarda en order_costs.
-- p: { channel, customerId, customerName, branch, items[], discount, shipping, payments[], status?,
--      shippingInfo, notes, pickup, quoteId, tierId, seller }
create or replace function public.create_order(p jsonb) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v public.orders;
  v_business uuid := public.current_business_id();
  it jsonb;
  cur int;
  br text := p ->> 'branch';
  v_customer text := nullif(p ->> 'customerId', '');
  v_subtotal numeric := 0;
  v_discount numeric := coalesce((p ->> 'discount')::numeric, 0);
  v_shipping numeric := coalesce((p ->> 'shipping')::numeric, 0);
  v_total numeric;
  v_payments jsonb;
  v_paid numeric;
  v_folio text;
  v_my_branch text;
  v_items jsonb;
  v_costs jsonb := '{}'::jsonb;
begin
  perform public.assert_member();
  if jsonb_array_length(coalesce(p -> 'items', '[]'::jsonb)) = 0 then raise exception 'El pedido no tiene productos'; end if;
  if not exists (select 1 from public.branches where id = br and business_id = v_business) then raise exception 'Sucursal inválida'; end if;
  if v_customer is not null and not exists (select 1 from public.customers where id = v_customer and business_id = v_business) then
    raise exception 'Cliente inválido';
  end if;

  -- Los vendedores solo pueden vender en mostrador de su sucursal asignada
  if p ->> 'channel' = 'tienda' and not public.is_owner() then
    select branch into v_my_branch from public.profiles where id = auth.uid();
    if br is distinct from v_my_branch then
      raise exception 'Solo puedes vender en tu sucursal asignada';
    end if;
  end if;

  select coalesce(jsonb_agg(x - 'unitCost' order by n), '[]'::jsonb) into v_items
    from jsonb_array_elements(p -> 'items') with ordinality t(x, n);

  -- Orden fijo de bloqueo para evitar interbloqueos entre ventas simultáneas
  for it in select value from jsonb_array_elements(p -> 'items') order by value ->> 'variantKey' loop
    if (it ->> 'qty')::int <= 0 then raise exception 'Cantidad inválida'; end if;
    if coalesce((it ->> 'unitPrice')::numeric, -1) < 0 then raise exception 'Precio inválido'; end if;
    select qty into cur from public.stock
     where variant_key = it ->> 'variantKey' and branch = br and business_id = v_business for update;
    if coalesce(cur, 0) < (it ->> 'qty')::int then
      raise exception 'Sin existencia suficiente: % % talla % (hay %)', it ->> 'name', it ->> 'color', it ->> 'size', coalesce(cur, 0);
    end if;
    update public.stock set qty = qty - (it ->> 'qty')::int
     where variant_key = it ->> 'variantKey' and branch = br and business_id = v_business;
    v_subtotal := v_subtotal + (it ->> 'qty')::int * (it ->> 'unitPrice')::numeric;
    v_costs := v_costs || jsonb_build_object(it ->> 'variantKey', coalesce(
      (select pc.cost from public.stock s join public.product_costs pc on pc.product_id = s.product_id
        where s.variant_key = it ->> 'variantKey' and s.branch = br and s.business_id = v_business), 0));
  end loop;

  if v_discount < 0 or v_discount > v_subtotal then raise exception 'Descuento inválido'; end if;
  if v_shipping < 0 then raise exception 'Envío inválido'; end if;
  v_total := v_subtotal - v_discount + v_shipping;
  select coalesce(jsonb_agg(x || jsonb_build_object('id', gen_random_uuid()::text, 'date', now())), '[]'::jsonb)
    into v_payments
  from jsonb_array_elements(coalesce(p -> 'payments', '[]'::jsonb)) x
  where (x ->> 'amount')::numeric > 0;
  select coalesce(sum((x ->> 'amount')::numeric), 0) into v_paid from jsonb_array_elements(v_payments) x;
  if v_paid > v_total then raise exception 'Los pagos exceden el total del pedido'; end if;

  -- Folio consecutivo del negocio
  update public.businesses set next_order_folio = next_order_folio + 1
   where id = v_business
  returning order_prefix || (next_order_folio - 1)::text into v_folio;

  insert into public.orders (business_id, folio, channel, customer_id, customer_name, branch, items, subtotal, discount, shipping, total,
                             payments, status, shipping_info, notes, pickup, quote_id, tier_id, seller)
  values (
    v_business, v_folio, p ->> 'channel', v_customer, p ->> 'customerName', br, v_items,
    v_subtotal, v_discount, v_shipping, v_total, v_payments,
    coalesce(p ->> 'status', case when v_paid >= v_total then 'pagado' when v_paid > 0 then 'apartado' else 'pendiente' end),
    p -> 'shippingInfo', p ->> 'notes', coalesce((p ->> 'pickup')::boolean, false), p ->> 'quoteId', p ->> 'tierId', p ->> 'seller'
  )
  returning * into v;

  insert into public.order_costs (order_id, business_id, costs) values (v.id, v_business, v_costs);

  insert into public.movements (business_id, type, product_id, variant_key, branch, qty, ref)
  select v_business, 'venta', s.product_id, s.variant_key, br, -(x ->> 'qty')::int, v_folio
  from jsonb_array_elements(p -> 'items') x
  join public.stock s on s.variant_key = x ->> 'variantKey' and s.branch = br and s.business_id = v_business;

  return v;
end;
$$;

-- save_quote: guarda los items sin unitCost.
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

-- set_order_status: cancelar regresa las piezas; enviado/entregado siguen el flujo pagado → enviado → entregado
-- (en "recoge en sucursal", pagado → entregado). pendiente/apartado/pagado los mueven los pagos, no esta función.
create or replace function public.set_order_status(p_order text, p_status text, p_shipping jsonb default null)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare v public.orders; prev text; v_pickup boolean; v_business uuid := public.current_business_id();
begin
  perform public.assert_member();
  select status, pickup into prev, v_pickup from public.orders where id = p_order and business_id = v_business for update;
  if prev is null then raise exception 'Pedido no encontrado'; end if;
  if prev = 'cancelado' then raise exception 'El pedido ya está cancelado'; end if;
  if not (case p_status
            when 'cancelado' then prev <> 'entregado'
            when 'enviado' then prev = 'pagado' and not v_pickup
            when 'entregado' then prev = 'enviado' or (prev = 'pagado' and v_pickup)
            else false
          end) then
    raise exception 'No se puede cambiar el pedido de % a %', prev, p_status;
  end if;

  update public.orders
     set status = p_status,
         shipping_info = case when p_shipping is null then shipping_info else coalesce(shipping_info, '{}'::jsonb) || p_shipping end
   where id = p_order and business_id = v_business
  returning * into v;

  if p_status = 'cancelado' then
    update public.stock s set qty = s.qty + (x ->> 'qty')::int
      from jsonb_array_elements(v.items) x
     where s.variant_key = x ->> 'variantKey' and s.branch = v.branch and s.business_id = v_business;
    insert into public.movements (business_id, type, product_id, variant_key, branch, qty, ref, note)
    select v_business, 'cancelacion', s.product_id, s.variant_key, v.branch, (x ->> 'qty')::int, v.folio, 'Regreso a inventario por cancelación'
    from jsonb_array_elements(v.items) x
    join public.stock s on s.variant_key = x ->> 'variantKey' and s.branch = v.branch and s.business_id = v_business;
  end if;
  return v;
end;
$$;

-- invite_lookup: máximo 30 intentos por llave en 10 minutos.
-- shortcut: la llave sale de x-forwarded-for, que el cliente puede alterar; si hay abuso, mover el límite a una Edge Function.
create or replace function public.invite_lookup(p_code text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_key text := coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', 'sin-ip');
begin
  delete from public.invite_attempts where at < now() - interval '1 hour';
  if (select count(*) from public.invite_attempts where key = v_key and at > now() - interval '10 minutes') >= 30 then
    raise exception 'Demasiados intentos, espera unos minutos';
  end if;
  insert into public.invite_attempts (key) values (v_key);
  return (select name from public.businesses where invite_code = upper(trim(p_code)));
end;
$$;
grant execute on function public.invite_lookup(text) to anon;

-- ---------------------------------------------------------------------------
-- Tiempo real
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['product_costs', 'order_costs'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;
