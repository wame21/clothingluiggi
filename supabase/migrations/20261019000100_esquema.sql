-- Boutique ERP · 1/4 · Esquema multi-negocio: negocios, usuarios, sucursales, catálogo, inventario,
-- ventas, mayoreo y gastos. Cada fila de datos pertenece a un negocio (business_id).

-- ---------------------------------------------------------------------------
-- Negocios y usuarios
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('dueno', 'vendedor', 'pendiente');

-- Código de invitación: 8 caracteres [A-Z2-9] sin repetirse entre negocios.
create or replace function public.generate_invite_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';
  idx constant int[] := array[0, 1, 2, 3, 4, 5, 7, 9]; -- evita los bytes fijos de la versión del uuid
  bytes bytea;
  v_code text;
  i int;
begin
  perform pg_advisory_xact_lock(hashtext('erp_invite_code'));
  loop
    bytes := uuid_send(gen_random_uuid());
    v_code := '';
    foreach i in array idx loop
      v_code := v_code || substr(alphabet, get_byte(bytes, i) % 34 + 1, 1);
    end loop;
    exit when not exists (select 1 from public.businesses where invite_code = v_code);
  end loop;
  return v_code;
end;
$$;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default public.generate_invite_code(),
  order_prefix text not null default 'V-',
  quote_prefix text not null default 'COT-',
  next_order_folio int not null default 1001,
  next_quote_folio int not null default 1,
  created_at timestamptz not null default now()
);

-- La llave foránea de `branch` se agrega al crear `branches`.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null default '',
  email text,
  role public.app_role not null default 'pendiente',
  branch text,
  created_at timestamptz not null default now()
);
create index profiles_business_idx on public.profiles (business_id);

-- Negocio del usuario en sesión: base de las políticas y del default de business_id.
create or replace function public.current_business_id() returns uuid
language sql stable security definer set search_path = public as $$
  select business_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('dueno', 'vendedor') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'dueno' from public.profiles where id = auth.uid()), false)
$$;

-- ---------------------------------------------------------------------------
-- Sucursales
-- ---------------------------------------------------------------------------
create table public.branches (
  id text primary key default gen_random_uuid()::text,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  name text not null,
  short text not null,
  address text not null default '',
  pos boolean not null default true,
  is_warehouse boolean not null default false,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index branches_business_idx on public.branches (business_id);
-- Solo una sucursal por negocio surte mayoreo y pedidos en línea.
create unique index branches_one_warehouse_idx on public.branches (business_id) where is_warehouse;

alter table public.profiles
  add constraint profiles_branch_fkey foreign key (branch) references public.branches (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Catálogo e inventario
-- ---------------------------------------------------------------------------
create table public.products (
  id text primary key default gen_random_uuid()::text,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  sku text not null,
  name text not null,
  brand text not null default '',
  category text not null,
  cost numeric(12, 2) not null default 0,
  price numeric(12, 2) not null check (price >= 0),
  sizes text[] not null,
  colors jsonb not null default '[]',
  min_stock int not null default 2,
  active boolean not null default true,
  woo_id bigint,
  image_url text,
  created_at timestamptz not null default now(),
  unique (business_id, woo_id)
);
create index products_business_idx on public.products (business_id);

-- Existencia por variante (producto|color|talla) y sucursal.
create table public.stock (
  variant_key text not null,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade,
  branch text not null references public.branches (id) on delete cascade,
  qty int not null default 0 check (qty >= 0),
  primary key (variant_key, branch)
);
create index stock_product_idx on public.stock (product_id);
create index stock_business_idx on public.stock (business_id);

-- Kardex: cada entrada, venta, traspaso, ajuste o cancelación.
create table public.movements (
  id text primary key default gen_random_uuid()::text,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  date timestamptz not null default now(),
  type text not null check (type in ('entrada', 'venta', 'ajuste', 'traspaso', 'cancelacion')),
  product_id text not null references public.products (id) on delete cascade,
  variant_key text not null,
  branch text not null references public.branches (id),
  qty int not null,
  ref text,
  note text,
  user_id uuid default auth.uid()
);
create index movements_business_date_idx on public.movements (business_id, date desc);
create index movements_product_idx on public.movements (product_id);

-- Crea las filas de existencia en 0 para cada color × talla × sucursal del negocio del producto.
create or replace function public.ensure_stock_rows() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.stock (variant_key, business_id, product_id, branch, qty)
  select new.id || '|' || (c ->> 'name') || '|' || s, new.business_id, new.id, b.id, 0
  from jsonb_array_elements(new.colors) c, unnest(new.sizes) s,
       (select id from public.branches where business_id = new.business_id) b
  on conflict do nothing;
  return new;
end;
$$;

create trigger products_stock_rows
  after insert or update of colors, sizes on public.products
  for each row execute function public.ensure_stock_rows();

-- Una sucursal nueva arranca con existencia 0 de todas las variantes del negocio.
create or replace function public.ensure_branch_stock_rows() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.stock (variant_key, business_id, product_id, branch, qty)
  select p.id || '|' || (c ->> 'name') || '|' || s, p.business_id, p.id, new.id, 0
  from public.products p, jsonb_array_elements(p.colors) c, unnest(p.sizes) s
  where p.business_id = new.business_id
  on conflict do nothing;
  return new;
end;
$$;

create trigger branches_stock_rows
  after insert on public.branches
  for each row execute function public.ensure_branch_stock_rows();

-- ---------------------------------------------------------------------------
-- Clientes, pedidos, cotizaciones, gastos y configuración
-- ---------------------------------------------------------------------------
create table public.customers (
  id text primary key default gen_random_uuid()::text,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  name text not null,
  business text,
  phone text not null,
  city text not null default '',
  state text not null default '',
  type text not null default 'menudeo' check (type in ('menudeo', 'mayorista', 'distribuidor')),
  instagram text,
  rfc text,
  email text,
  since timestamptz not null default now(),
  notes text
);
create index customers_business_idx on public.customers (business_id);

-- Los folios salen de businesses (next_order_folio / next_quote_folio) y se repiten entre negocios.
create table public.orders (
  id text primary key default gen_random_uuid()::text,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  folio text not null,
  date timestamptz not null default now(),
  channel text not null check (channel in ('tienda', 'web', 'whatsapp', 'instagram', 'mayoreo')),
  customer_id text references public.customers (id) on delete set null,
  customer_name text not null,
  branch text not null references public.branches (id),
  items jsonb not null,
  subtotal numeric(12, 2) not null,
  discount numeric(12, 2) not null default 0,
  shipping numeric(12, 2) not null default 0,
  total numeric(12, 2) not null,
  payments jsonb not null default '[]',
  status text not null check (status in ('pendiente', 'apartado', 'pagado', 'enviado', 'entregado', 'cancelado')),
  shipping_info jsonb,
  notes text,
  quote_id text,
  tier_id text,
  seller text,
  created_by uuid default auth.uid(),
  unique (business_id, folio)
);
create index orders_business_date_idx on public.orders (business_id, date desc);
create index orders_customer_idx on public.orders (customer_id);

create table public.quotes (
  id text primary key default gen_random_uuid()::text,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  folio text not null,
  date timestamptz not null default now(),
  valid_until timestamptz not null,
  customer_id text not null references public.customers (id),
  customer_name text not null,
  items jsonb not null,
  tier_id text not null,
  subtotal_list numeric(12, 2) not null,
  discount numeric(12, 2) not null,
  subtotal numeric(12, 2) not null,
  shipping numeric(12, 2) not null,
  total numeric(12, 2) not null,
  deposit_pct numeric(4, 3) not null,
  status text not null check (status in ('borrador', 'enviada', 'aceptada', 'convertida', 'rechazada')),
  notes text,
  order_id text references public.orders (id),
  unique (business_id, folio)
);
create index quotes_business_idx on public.quotes (business_id);

create table public.expenses (
  id text primary key default gen_random_uuid()::text,
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  date timestamptz not null default now(),
  category text not null check (category in ('renta', 'nomina', 'publicidad', 'envios', 'servicios', 'empaque', 'software', 'otros')),
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  branch text references public.branches (id),
  method text not null
);
create index expenses_business_date_idx on public.expenses (business_id, date desc);

create table public.settings (
  business_id uuid not null default public.current_business_id() references public.businesses (id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (business_id, key)
);

-- ---------------------------------------------------------------------------
-- Alta de negocios y usuarios
-- ---------------------------------------------------------------------------

-- Configuración inicial de un negocio nuevo: valores neutros y una sucursal principal.
create or replace function public.seed_business_defaults(p_business uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.branches (business_id, name, short, pos, is_warehouse, sort)
  select p_business, 'Sucursal principal', 'Principal', true, true, 0
  where not exists (select 1 from public.branches where business_id = p_business);

  insert into public.settings (business_id, key, value) values
    (p_business, 'profile', '{
      "legalName": "", "phone": "", "email": "", "instagram": "", "web": "", "city": "", "address": "",
      "ticketFooter": "¡Gracias por tu compra!", "logoUrl": null, "accentColor": null
    }'::jsonb),
    (p_business, 'catalog', '{
      "categories": ["Blusas", "Camisas", "Playeras", "Polos", "Pantalones", "Jeans", "Vestidos", "Faldas", "Shorts", "Chamarras y suéteres", "Accesorios"],
      "sizePresets": [
        { "name": "Ropa S–XL", "sizes": ["S", "M", "L", "XL"] },
        { "name": "Ropa XS–XXL", "sizes": ["XS", "S", "M", "L", "XL", "XXL"] },
        { "name": "Pantalón 28–36", "sizes": ["28", "30", "32", "34", "36"] },
        { "name": "Unitalla", "sizes": ["Única"] }
      ],
      "sizeCurve": {}
    }'::jsonb),
    (p_business, 'sales', '{
      "channels": ["tienda", "web", "instagram", "whatsapp"],
      "carriers": ["Estafeta", "FedEx", "DHL", "Paquetexpress", "J&T"],
      "paymentFees": { "efectivo": 0, "transferencia": 0, "tarjeta": 0.036, "mercadopago": 0.0406, "paypal": 0.0458 }
    }'::jsonb),
    (p_business, 'wholesale', '{
      "enabled": false,
      "tiers": [ { "id": "lista", "name": "Precio de lista", "minPieces": 1, "discount": 0, "description": "Precio de lista" } ],
      "distributorCustomerMin": 0,
      "depositPct": 0,
      "freeShippingFrom": 0,
      "flatShipping": 0,
      "validityDays": 7,
      "packages": [],
      "bank": { "bank": "", "holder": "", "clabe": "" }
    }'::jsonb)
  on conflict (business_id, key) do nothing;
end;
$$;

-- Con `business_name` crea un negocio nuevo y el usuario es su dueño; con `invite_code` entra a un
-- negocio existente como pendiente de aprobación.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(coalesce(new.email, ''), '@', 1));
  v_business_name text := nullif(trim(new.raw_user_meta_data ->> 'business_name'), '');
  v_code text := nullif(upper(trim(new.raw_user_meta_data ->> 'invite_code')), '');
  v_business uuid;
  v_branch text;
begin
  if v_business_name is not null then
    insert into public.businesses (name) values (v_business_name) returning id into v_business;
    perform public.seed_business_defaults(v_business);
    select id into v_branch from public.branches where business_id = v_business and is_warehouse;
    insert into public.profiles (id, business_id, name, email, role, branch)
    values (new.id, v_business, v_name, new.email, 'dueno', v_branch);
  elsif v_code is not null then
    select id into v_business from public.businesses where invite_code = v_code;
    if v_business is null then raise exception 'Código de invitación inválido'; end if;
    insert into public.profiles (id, business_id, name, email, role)
    values (new.id, v_business, v_name, new.email, 'pendiente');
  else
    raise exception 'Falta el nombre del negocio o el código de invitación';
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
