-- Mayoreo nace activo: el plan (has_module) es lo que decide si el negocio lo ve.
-- Misma definición que 20261019000100_esquema.sql; solo cambia "enabled" de false a true.
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
      "enabled": true,
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

-- Negocios existentes.
update public.settings set value = jsonb_set(value, '{enabled}', 'true') where key = 'wholesale';
