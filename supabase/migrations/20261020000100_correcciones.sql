-- Boutique ERP · Correcciones encontradas por las pruebas

-- create_order: rechaza precios, descuentos, envíos y pagos incoherentes.
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
    if coalesce((it ->> 'unitPrice')::numeric, -1) < 0 then raise exception 'Precio inválido'; end if;
    select qty into cur from public.stock
     where variant_key = it ->> 'variantKey' and branch = br and business_id = v_business for update;
    if coalesce(cur, 0) < (it ->> 'qty')::int then
      raise exception 'Sin existencia suficiente: % % talla % (hay %)', it ->> 'name', it ->> 'color', it ->> 'size', coalesce(cur, 0);
    end if;
    update public.stock set qty = qty - (it ->> 'qty')::int
     where variant_key = it ->> 'variantKey' and branch = br and business_id = v_business;
    v_subtotal := v_subtotal + (it ->> 'qty')::int * (it ->> 'unitPrice')::numeric;
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

-- add_payment: bloquea el pedido y no admite más que el saldo pendiente.
create or replace function public.add_payment(p_order text, p_payment jsonb) returns public.orders
language plpgsql security definer set search_path = public as $$
declare v public.orders; v_paid numeric; v_due numeric; v_business uuid := public.current_business_id();
begin
  perform public.assert_member();
  if coalesce((p_payment ->> 'amount')::numeric, 0) <= 0 then raise exception 'Monto inválido'; end if;
  select total - coalesce((select sum((x ->> 'amount')::numeric) from jsonb_array_elements(payments) x), 0)
    into v_due from public.orders where id = p_order and business_id = v_business and status <> 'cancelado' for update;
  if v_due is null then raise exception 'Pedido no encontrado o cancelado'; end if;
  if (p_payment ->> 'amount')::numeric > v_due then raise exception 'El pago excede el saldo pendiente'; end if;
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

-- save_quote: una cotización convertida ya es un pedido y no se edita ni se duplica.
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
          p ->> 'customerName', p -> 'items', p ->> 'tierId', (p ->> 'subtotalList')::numeric, (p ->> 'discount')::numeric,
          (p ->> 'subtotal')::numeric, (p ->> 'shipping')::numeric, (p ->> 'total')::numeric, (p ->> 'depositPct')::numeric,
          p ->> 'status', p ->> 'notes')
  returning * into v;
  return v;
end;
$$;

-- El "|" separa producto|color|talla en la llave de stock: no puede aparecer en colores ni tallas.
alter table public.products add constraint products_variante_sin_separador
  check (position('|' in array_to_string(sizes, ',') || colors::text) = 0);
