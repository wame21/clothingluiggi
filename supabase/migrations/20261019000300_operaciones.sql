-- Boutique ERP · 3/4 · Operaciones atómicas
-- Cada función valida permisos, bloquea las filas de existencia que toca y deja rastro en
-- `movements`. Así dos sucursales no pueden vender la misma última pieza. Todas filtran por el
-- negocio del usuario en sesión y rechazan sucursales, clientes o filas de otro negocio.

create or replace function public.assert_member() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member() then raise exception 'No autorizado'; end if;
end;
$$;

-- Crea un pedido: valida y descuenta existencias en la sucursal que surte.
-- p: { channel, customerId, customerName, branch, items[], discount, shipping, payments[], status?,
--      shippingInfo, notes, quoteId, tierId, seller }
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

  -- Orden fijo de bloqueo para evitar interbloqueos entre ventas simultáneas
  for it in select value from jsonb_array_elements(p -> 'items') order by value ->> 'variantKey' loop
    if (it ->> 'qty')::int <= 0 then raise exception 'Cantidad inválida'; end if;
    select qty into cur from public.stock
     where variant_key = it ->> 'variantKey' and branch = br and business_id = v_business for update;
    if coalesce(cur, 0) < (it ->> 'qty')::int then
      raise exception 'Sin existencia suficiente: % % talla % (hay %)', it ->> 'name', it ->> 'color', it ->> 'size', coalesce(cur, 0);
    end if;
    update public.stock set qty = qty - (it ->> 'qty')::int
     where variant_key = it ->> 'variantKey' and branch = br and business_id = v_business;
    v_subtotal := v_subtotal + (it ->> 'qty')::int * (it ->> 'unitPrice')::numeric;
  end loop;

  v_total := v_subtotal - v_discount + v_shipping;
  select coalesce(jsonb_agg(x || jsonb_build_object('id', gen_random_uuid()::text, 'date', now())), '[]'::jsonb)
    into v_payments
  from jsonb_array_elements(coalesce(p -> 'payments', '[]'::jsonb)) x
  where (x ->> 'amount')::numeric > 0;
  select coalesce(sum((x ->> 'amount')::numeric), 0) into v_paid from jsonb_array_elements(v_payments) x;

  -- Folio consecutivo del negocio
  update public.businesses set next_order_folio = next_order_folio + 1
   where id = v_business
  returning order_prefix || (next_order_folio - 1)::text into v_folio;

  insert into public.orders (business_id, folio, channel, customer_id, customer_name, branch, items, subtotal, discount, shipping, total,
                             payments, status, shipping_info, notes, quote_id, tier_id, seller)
  values (
    v_business, v_folio, p ->> 'channel', v_customer, p ->> 'customerName', br, p -> 'items',
    v_subtotal, v_discount, v_shipping, v_total, v_payments,
    coalesce(p ->> 'status', case when v_paid >= v_total then 'pagado' when v_paid > 0 then 'apartado' else 'pendiente' end),
    p -> 'shippingInfo', p ->> 'notes', p ->> 'quoteId', p ->> 'tierId', p ->> 'seller'
  )
  returning * into v;

  insert into public.movements (business_id, type, product_id, variant_key, branch, qty, ref)
  select v_business, 'venta', s.product_id, s.variant_key, br, -(x ->> 'qty')::int, v_folio
  from jsonb_array_elements(p -> 'items') x
  join public.stock s on s.variant_key = x ->> 'variantKey' and s.branch = br and s.business_id = v_business;

  return v;
end;
$$;

-- Registra un pago y actualiza el estado (pendiente → apartado → pagado).
create or replace function public.add_payment(p_order text, p_payment jsonb) returns public.orders
language plpgsql security definer set search_path = public as $$
declare v public.orders; v_paid numeric; v_business uuid := public.current_business_id();
begin
  perform public.assert_member();
  if coalesce((p_payment ->> 'amount')::numeric, 0) <= 0 then raise exception 'Monto inválido'; end if;
  update public.orders
     set payments = payments || jsonb_build_array(p_payment || jsonb_build_object('id', gen_random_uuid()::text, 'date', now()))
   where id = p_order and business_id = v_business and status <> 'cancelado'
  returning * into v;
  if v.id is null then raise exception 'Pedido no encontrado o cancelado'; end if;
  select coalesce(sum((x ->> 'amount')::numeric), 0) into v_paid from jsonb_array_elements(v.payments) x;
  if v_paid >= v.total and v.status in ('pendiente', 'apartado') then
    update public.orders set status = 'pagado' where id = p_order returning * into v;
  elsif v_paid > 0 and v.status = 'pendiente' then
    update public.orders set status = 'apartado' where id = p_order returning * into v;
  end if;
  return v;
end;
$$;

-- Cambia el estado del pedido; cancelar regresa las piezas a la sucursal que surtió.
create or replace function public.set_order_status(p_order text, p_status text, p_shipping jsonb default null)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare v public.orders; prev text; v_business uuid := public.current_business_id();
begin
  perform public.assert_member();
  select status into prev from public.orders where id = p_order and business_id = v_business for update;
  if prev is null then raise exception 'Pedido no encontrado'; end if;
  if prev = 'cancelado' then raise exception 'El pedido ya está cancelado'; end if;

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

-- Entradas de mercancía (solo dueño) y ajustes (equipo). qty con signo.
create or replace function public.move_stock(p_entries jsonb, p_branch text, p_type text, p_ref text default null, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare e jsonb; cur int; v_product text; v_business uuid := public.current_business_id();
begin
  perform public.assert_member();
  if p_type not in ('entrada', 'ajuste') then raise exception 'Tipo de movimiento inválido'; end if;
  if p_type = 'entrada' and not public.is_owner() then raise exception 'Solo el dueño registra entradas de mercancía'; end if;
  if not exists (select 1 from public.branches where id = p_branch and business_id = v_business) then raise exception 'Sucursal inválida'; end if;
  for e in select value from jsonb_array_elements(p_entries) order by value ->> 'variantKey' loop
    continue when coalesce((e ->> 'qty')::int, 0) = 0;
    select product_id, qty into v_product, cur from public.stock
     where variant_key = e ->> 'variantKey' and branch = p_branch and business_id = v_business for update;
    if cur is null then raise exception 'Variante inexistente: %', e ->> 'variantKey'; end if;
    update public.stock set qty = greatest(0, qty + (e ->> 'qty')::int)
     where variant_key = e ->> 'variantKey' and branch = p_branch and business_id = v_business;
    insert into public.movements (business_id, type, product_id, variant_key, branch, qty, ref, note)
    values (v_business, p_type, v_product, e ->> 'variantKey', p_branch,
            greatest(-cur, (e ->> 'qty')::int), p_ref, p_note);
  end loop;
end;
$$;

-- Traspaso entre sucursales del negocio (la bodega es una sucursal más).
create or replace function public.transfer_stock(p_entries jsonb, p_from text, p_to text) returns void
language plpgsql security definer set search_path = public as $$
declare
  e jsonb; cur int; v_product text;
  v_business uuid := public.current_business_id();
  v_ref text := 'TR-' || to_char(now(), 'YYMMDDHH24MISS');
  v_from_name text;
  v_to_name text;
begin
  perform public.assert_member();
  if p_from = p_to then raise exception 'Elige ubicaciones distintas'; end if;
  select name into v_from_name from public.branches where id = p_from and business_id = v_business;
  select name into v_to_name from public.branches where id = p_to and business_id = v_business;
  if v_from_name is null or v_to_name is null then raise exception 'Sucursal inválida'; end if;
  for e in select value from jsonb_array_elements(p_entries) order by value ->> 'variantKey' loop
    continue when coalesce((e ->> 'qty')::int, 0) <= 0;
    -- Bloquea origen y destino en el mismo orden para que dos traspasos opuestos no se interbloqueen
    perform 1 from public.stock
     where variant_key = e ->> 'variantKey' and branch in (p_from, p_to) and business_id = v_business
     order by branch for update;
    select product_id, qty into v_product, cur from public.stock
     where variant_key = e ->> 'variantKey' and branch = p_from and business_id = v_business;
    if coalesce(cur, 0) < (e ->> 'qty')::int then raise exception 'Sin existencia suficiente para traspasar %', e ->> 'variantKey'; end if;
    update public.stock set qty = qty + (e ->> 'qty')::int
     where variant_key = e ->> 'variantKey' and branch = p_to and business_id = v_business;
    if not found then raise exception 'Variante inexistente en el destino: %', e ->> 'variantKey'; end if;
    update public.stock set qty = qty - (e ->> 'qty')::int
     where variant_key = e ->> 'variantKey' and branch = p_from and business_id = v_business;
    insert into public.movements (business_id, type, product_id, variant_key, branch, qty, ref, note) values
      (v_business, 'traspaso', v_product, e ->> 'variantKey', p_from, -(e ->> 'qty')::int, v_ref, 'Hacia ' || v_to_name),
      (v_business, 'traspaso', v_product, e ->> 'variantKey', p_to, (e ->> 'qty')::int, v_ref, 'Desde ' || v_from_name);
  end loop;
end;
$$;

-- Conteo físico: fija la existencia contada y registra la diferencia como ajuste.
create or replace function public.set_stock_count(p_branch text, p_entries jsonb, p_note text default 'Conteo físico')
returns int
language plpgsql security definer set search_path = public as $$
declare e jsonb; cur int; v_product text; changed int := 0; v_business uuid := public.current_business_id();
begin
  perform public.assert_member();
  if not exists (select 1 from public.branches where id = p_branch and business_id = v_business) then raise exception 'Sucursal inválida'; end if;
  for e in select value from jsonb_array_elements(p_entries) order by value ->> 'variantKey' loop
    if (e ->> 'qty')::int < 0 then raise exception 'La existencia no puede ser negativa'; end if;
    select product_id, qty into v_product, cur from public.stock
     where variant_key = e ->> 'variantKey' and branch = p_branch and business_id = v_business for update;
    if cur is null then raise exception 'Variante inexistente: %', e ->> 'variantKey'; end if;
    continue when cur = (e ->> 'qty')::int;
    update public.stock set qty = (e ->> 'qty')::int
     where variant_key = e ->> 'variantKey' and branch = p_branch and business_id = v_business;
    insert into public.movements (business_id, type, product_id, variant_key, branch, qty, note)
    values (v_business, 'ajuste', v_product, e ->> 'variantKey', p_branch, (e ->> 'qty')::int - cur, p_note);
    changed := changed + 1;
  end loop;
  return changed;
end;
$$;

-- Alta o edición de cotización con folio consecutivo del negocio.
create or replace function public.save_quote(p jsonb) returns public.quotes
language plpgsql security definer set search_path = public as $$
declare v public.quotes; v_business uuid := public.current_business_id(); v_folio text;
begin
  perform public.assert_member();
  if not exists (select 1 from public.customers where id = p ->> 'customerId' and business_id = v_business) then
    raise exception 'Cliente inválido';
  end if;
  if nullif(p ->> 'id', '') is not null then
    update public.quotes set
      valid_until = (p ->> 'validUntil')::timestamptz, customer_id = p ->> 'customerId', customer_name = p ->> 'customerName',
      items = p -> 'items', tier_id = p ->> 'tierId', subtotal_list = (p ->> 'subtotalList')::numeric,
      discount = (p ->> 'discount')::numeric, subtotal = (p ->> 'subtotal')::numeric, shipping = (p ->> 'shipping')::numeric,
      total = (p ->> 'total')::numeric, deposit_pct = (p ->> 'depositPct')::numeric, status = p ->> 'status', notes = p ->> 'notes'
    where id = p ->> 'id' and business_id = v_business and status <> 'convertida'
    returning * into v;
    if v.id is not null then return v; end if;
  end if;

  update public.businesses set next_quote_folio = next_quote_folio + 1
   where id = v_business
  returning quote_prefix || lpad((next_quote_folio - 1)::text, 4, '0') into v_folio;

  insert into public.quotes (business_id, folio, valid_until, customer_id, customer_name, items, tier_id, subtotal_list, discount, subtotal,
                             shipping, total, deposit_pct, status, notes)
  values (v_business, v_folio, (p ->> 'validUntil')::timestamptz, p ->> 'customerId',
          p ->> 'customerName', p -> 'items', p ->> 'tierId', (p ->> 'subtotalList')::numeric, (p ->> 'discount')::numeric,
          (p ->> 'subtotal')::numeric, (p ->> 'shipping')::numeric, (p ->> 'total')::numeric, (p ->> 'depositPct')::numeric,
          p ->> 'status', p ->> 'notes')
  returning * into v;
  return v;
end;
$$;

-- Convierte una cotización en pedido de mayoreo (aparta de la sucursal que surte mayoreo y registra el anticipo).
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

-- ---------------------------------------------------------------------------
-- Permisos de ejecución y tiempo real
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
-- Internas: solo las llaman otras funciones (o el trigger de alta), nunca la app.
revoke execute on function public.seed_business_defaults(uuid) from authenticated;
revoke execute on function public.generate_invite_code() from authenticated;
grant execute on function public.invite_lookup(text) to anon;

-- La app se actualiza sola cuando otro usuario vende, mueve inventario o cambia la configuración.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['orders', 'stock', 'quotes', 'customers', 'products', 'expenses', 'branches', 'settings'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;
