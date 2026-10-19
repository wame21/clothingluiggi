-- Boutique ERP · 2/4 · Seguridad por filas (RLS)
-- · Toda política exige que la fila sea del negocio del usuario (business_id = current_business_id()).
-- · Dueño: todo su negocio.  · Vendedor: opera (ventas, clientes, cotizaciones, ajustes) pero no ve
--   gastos ni cambia precios.  · Pendiente: sin acceso hasta que el dueño lo apruebe.
-- stock, movements y orders no tienen políticas de escritura: solo cambian con las funciones
-- atómicas de la migración 3. businesses tampoco: se edita con update_business().

alter table public.businesses enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.stock enable row level security;
alter table public.movements enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.quotes enable row level security;
alter table public.expenses enable row level security;
alter table public.settings enable row level security;

-- Negocio: el equipo aprobado lee el suyo
create policy "equipo lee su negocio" on public.businesses
  for select to authenticated using (id = (select public.current_business_id()) and public.is_member());

-- Perfiles: cada quien ve el suyo; el dueño ve a todo el equipo de su negocio.
create policy "perfil propio o dueño" on public.profiles
  for select to authenticated
  using (business_id = (select public.current_business_id()) and (id = auth.uid() or public.is_owner()));

-- Sucursales: el equipo las lee; el dueño las crea y edita (no se borran, se archivan)
create policy "equipo lee sucursales" on public.branches
  for select to authenticated using (business_id = (select public.current_business_id()) and public.is_member());
create policy "dueño da de alta sucursales" on public.branches
  for insert to authenticated with check (business_id = (select public.current_business_id()) and public.is_owner());
create policy "dueño edita sucursales" on public.branches
  for update to authenticated
  using (business_id = (select public.current_business_id()) and public.is_owner())
  with check (business_id = (select public.current_business_id()) and public.is_owner());

-- Lectura para el equipo aprobado
create policy "equipo lee productos" on public.products
  for select to authenticated using (business_id = (select public.current_business_id()) and public.is_member());
create policy "equipo lee stock" on public.stock
  for select to authenticated using (business_id = (select public.current_business_id()) and public.is_member());
create policy "equipo lee movimientos" on public.movements
  for select to authenticated using (business_id = (select public.current_business_id()) and public.is_member());
create policy "equipo lee clientes" on public.customers
  for select to authenticated using (business_id = (select public.current_business_id()) and public.is_member());
create policy "equipo lee pedidos" on public.orders
  for select to authenticated using (business_id = (select public.current_business_id()) and public.is_member());
create policy "equipo lee cotizaciones" on public.quotes
  for select to authenticated using (business_id = (select public.current_business_id()) and public.is_member());
create policy "equipo lee configuración" on public.settings
  for select to authenticated using (business_id = (select public.current_business_id()) and public.is_member());

-- Catálogo, precios y configuración: solo el dueño
create policy "dueño da de alta productos" on public.products
  for insert to authenticated with check (business_id = (select public.current_business_id()) and public.is_owner());
create policy "dueño edita productos" on public.products
  for update to authenticated
  using (business_id = (select public.current_business_id()) and public.is_owner())
  with check (business_id = (select public.current_business_id()) and public.is_owner());
create policy "dueño gestiona configuración" on public.settings
  for all to authenticated
  using (business_id = (select public.current_business_id()) and public.is_owner())
  with check (business_id = (select public.current_business_id()) and public.is_owner());

-- Clientes: todo el equipo los registra y edita
create policy "equipo registra clientes" on public.customers
  for insert to authenticated with check (business_id = (select public.current_business_id()) and public.is_member());
create policy "equipo edita clientes" on public.customers
  for update to authenticated
  using (business_id = (select public.current_business_id()) and public.is_member())
  with check (business_id = (select public.current_business_id()) and public.is_member());

-- Cotizaciones: el equipo cambia su estado (el alta y edición van por save_quote)
create policy "equipo actualiza cotizaciones" on public.quotes
  for update to authenticated
  using (business_id = (select public.current_business_id()) and public.is_member())
  with check (business_id = (select public.current_business_id()) and public.is_member());

-- Gastos: exclusivos del dueño
create policy "dueño gestiona gastos" on public.expenses
  for all to authenticated
  using (business_id = (select public.current_business_id()) and public.is_owner())
  with check (business_id = (select public.current_business_id()) and public.is_owner());

-- ---------------------------------------------------------------------------
-- Administración del negocio y del equipo
-- ---------------------------------------------------------------------------

-- La pantalla de registro con código de invitación muestra el nombre del negocio, sin exponer más.
create or replace function public.invite_lookup(p_code text) returns text
language sql stable security definer set search_path = public as $$
  select name from public.businesses where invite_code = upper(trim(p_code))
$$;

-- El dueño renueva el código; el anterior deja de funcionar.
create or replace function public.regenerate_invite_code() returns text
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not public.is_owner() then raise exception 'Solo el dueño puede cambiar el código de invitación'; end if;
  update public.businesses set invite_code = public.generate_invite_code()
   where id = public.current_business_id()
  returning invite_code into v_code;
  return v_code;
end;
$$;

-- Nombre y prefijos de folio del negocio (los contadores no se editan desde la app).
create or replace function public.update_business(p_name text, p_order_prefix text, p_quote_prefix text)
returns public.businesses
language plpgsql security definer set search_path = public as $$
declare
  v public.businesses;
  v_name text := trim(coalesce(p_name, ''));
  v_order text := trim(coalesce(p_order_prefix, ''));
  v_quote text := trim(coalesce(p_quote_prefix, ''));
begin
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

-- El dueño aprueba colaboradores, cambia su rol o su sucursal (siempre dentro de su negocio).
create or replace function public.set_member(p_id uuid, p_role public.app_role, p_branch text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare v public.profiles; v_business uuid := public.current_business_id();
begin
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
