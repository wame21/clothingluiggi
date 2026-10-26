-- Boutique ERP · Precios y datos de cobro de la plataforma en la base
-- · Una sola fila; solo el administrador de la plataforma la lee y la edita (desde /admin).
-- · Los negocios la reciben dentro de my_membership(), con sesión iniciada y también con la cuenta bloqueada.

create table public.platform_settings (
  id boolean primary key default true check (id),
  price_monthly numeric(12, 2) not null default 1199 check (price_monthly >= 0),
  price_setup numeric(12, 2) not null default 3599 check (price_setup >= 0),
  bank text not null default '',
  clabe text not null default '' check (clabe ~ '^([0-9]{18})?$'),
  holder text not null default '',
  whatsapp text not null default ''
);
insert into public.platform_settings default values;

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;
grant select, update on public.platform_settings to authenticated;
create policy "administrador lee el cobro" on public.platform_settings
  for select to authenticated using ((select public.is_platform_admin()));
create policy "administrador edita el cobro" on public.platform_settings
  for update to authenticated using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

-- my_membership (versión de 20261025000100_plan_unico.sql) con lo que hay que pagar y a dónde.
create or replace function public.my_membership() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'state', m.state, 'trialEndsAt', b.trial_ends_at, 'paidUntil', b.paid_until,
    'graceEndsAt', b.paid_until + interval '3 days', 'suspendedReason', b.suspended_reason,
    'priceMonthly', s.price_monthly, 'priceSetup', s.price_setup,
    'payment', json_build_object('bank', s.bank, 'clabe', s.clabe, 'holder', s.holder, 'whatsapp', s.whatsapp))
    from public.businesses b
    cross join lateral public.membership(b) m
    cross join public.platform_settings s
   where b.id = public.current_business_id()
$$;
