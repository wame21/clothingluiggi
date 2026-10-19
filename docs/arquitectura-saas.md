# Arquitectura SaaS multi-negocio

ERP para boutiques y tiendas de ropa. Una sola app y una sola base de Supabase atienden a muchos
negocios; cada fila de datos pertenece a un negocio (`business_id`) y la seguridad por filas (RLS)
impide que un negocio vea datos de otro. Todo lo que antes era fijo para una tienda en particular
(nombre, sucursales, categorías, tallas, mayoreo, comisiones, paqueterías) se configura por negocio
desde **Configuración**.

Este documento es el contrato entre la base de datos (`supabase/migrations/`) y la app (`src/`).
Si algo aquí cambia, se cambia en los dos lados.

## Nombre del producto

`APP_NAME = "Boutique ERP"` en `src/lib/constants.ts`. Es el único lugar con el nombre del producto;
la marca de cada negocio sale de su configuración.

## Base de datos

### Negocios y usuarios

```
public.businesses
  id                 uuid primary key default gen_random_uuid()
  name               text not null
  invite_code        text not null unique        -- 8 caracteres [A-Z2-9], se genera al crear
  order_prefix       text not null default 'V-'
  quote_prefix       text not null default 'COT-'
  next_order_folio   int  not null default 1001
  next_quote_folio   int  not null default 1
  created_at         timestamptz not null default now()

public.profiles
  id           uuid pk references auth.users on delete cascade
  business_id  uuid not null references businesses on delete cascade
  name, email, role (app_role: dueno | vendedor | pendiente), created_at   -- igual que antes
  branch       text null references branches(id) on delete set null       -- antes era not null con default fijo
```

- `public.current_business_id() returns uuid` — `stable security definer`, devuelve el `business_id`
  del perfil de `auth.uid()`. Base de todas las políticas y del default de las columnas.
- `is_member()` / `is_owner()` siguen existiendo (rol dentro de su negocio).
- **Alta de usuario** (`handle_new_user`, trigger en `auth.users`) lee `raw_user_meta_data`:
  - `{ name, business_name }` → crea el negocio, el perfil queda como `dueno`, siembra la
    configuración por defecto (ver abajo) y una sucursal "Sucursal principal" con
    `pos = true, is_warehouse = true`.
  - `{ name, invite_code }` → busca el negocio por código (sin distinguir mayúsculas); el perfil queda
    `pendiente` en ese negocio. Código inválido → `raise exception 'Código de invitación inválido'`.
  - Ninguno de los dos → `raise exception 'Falta el nombre del negocio o el código de invitación'`.
- `public.invite_lookup(p_code text) returns text` — nombre del negocio o `null`. Ejecutable por `anon`
  (lo usa la pantalla de registro). Reemplaza a `owner_exists()`, que se elimina.
- `public.regenerate_invite_code() returns text` — solo dueño.
- `public.update_business(p_name text, p_order_prefix text, p_quote_prefix text) returns businesses`
  — solo dueño; los contadores de folio no se editan desde la app.
- `public.set_member(p_id uuid, p_role app_role, p_branch text)` — solo dueño y solo miembros de su
  negocio; la sucursal debe ser de su negocio.

### Sucursales

```
public.branches
  id            text primary key default gen_random_uuid()::text
  business_id   uuid not null default current_business_id() references businesses on delete cascade
  name          text not null                 -- "Sucursal Centro"
  short         text not null                 -- "Centro" (etiquetas cortas, gráficas)
  address       text not null default ''
  pos           boolean not null default true -- vende en mostrador (aparece en Punto de venta)
  is_warehouse  boolean not null default false-- surte mayoreo y pedidos en línea; máx. 1 por negocio (índice único parcial)
  active        boolean not null default true -- no se borran, se archivan
  sort          int not null default 0
  created_at    timestamptz not null default now()
```

- Al insertar una sucursal se crean sus filas de `stock` en 0 para todas las variantes del negocio.
- `ensure_stock_rows` (productos) crea filas para todas las sucursales del negocio del producto.
- `stock.branch`, `movements.branch`, `orders.branch`, `expenses.branch`, `profiles.branch`
  referencian `branches(id)`; ya no hay `check (branch in (...))`.

### Tablas de datos

`products, stock, movements, customers, orders, quotes, expenses` agregan
`business_id uuid not null default public.current_business_id() references businesses on delete cascade`
con índice. Como el default sale de la sesión, **la app no manda `business_id` en los insert**.
`products.woo_id` pasa a `unique (business_id, woo_id)`.

`settings` cambia su llave primaria a `(business_id, key)`. Llaves y forma del JSON (camelCase):

| key         | Tipo TS (`src/lib/settings.ts` / `wholesale.ts`) |
|-------------|---------------------------------------------------|
| `profile`   | `BusinessProfile` |
| `catalog`   | `CatalogSettings` |
| `sales`     | `SalesSettings` |
| `wholesale` | `WholesaleSettings` |

### RLS

Cada política existente conserva su regla de rol y además exige
`business_id = public.current_business_id()`. `branches`: miembros leen, dueño inserta/actualiza
(sin delete). `businesses`: miembros leen el suyo; no hay update directo (va por `update_business`).
`profiles`: cada quien ve los perfiles de su negocio.

### Operaciones (RPC `security definer`)

`create_order, add_payment, set_order_status, move_stock, transfer_stock, set_stock_count,
save_quote, convert_quote` conservan su firma y comportamiento, más:

- Toda lectura/escritura filtra por `current_business_id()`; las sucursales recibidas deben ser del
  negocio (`raise exception 'Sucursal inválida'`).
- Folios: `update businesses set next_order_folio = next_order_folio + 1 ... returning` →
  `order_prefix || folio`. Cotizaciones: `quote_prefix || lpad(n, 4, '0')`. Se eliminan las
  secuencias globales.
- `create_order` conserva la regla de la migración `pos_restrict_seller_branch` (vendedor solo vende
  en mostrador en su sucursal).
- `convert_quote` aparta de la sucursal `is_warehouse` del negocio; si no hay,
  `raise exception 'Configura qué sucursal surte el mayoreo'`.

### Storage

Bucket público `logos`. Ruta `<business_id>/<archivo>`. Solo el dueño de ese negocio puede subir,
reemplazar o borrar dentro de su carpeta. La URL pública se guarda en `profile.logoUrl`.
El bucket acepta solo `image/png`, `image/jpeg` e `image/webp`, de hasta 2 MB.

### Precisiones de la línea base

La línea base está en `supabase/migrations/` (`esquema`, `seguridad`, `operaciones`, `storage`); las
migraciones de la tienda original quedan como referencia en `supabase/_legacy/` (no se versionan).

- `businesses.invite_code` tiene `default generate_invite_code()` (interna, no ejecutable por la app).
- `orders.folio` y `quotes.folio` son únicos por negocio: `unique (business_id, folio)`.
- `seed_business_defaults(p_business uuid)` es interna (no ejecutable por la app). El perfil del dueño
  nuevo queda con `branch` = la "Sucursal principal".
- `update_business` exige nombre no vacío y prefijos de folio no vacíos de hasta 10 caracteres.
- `businesses`: lo lee el equipo aprobado (`vendedor` y `dueno`); un `pendiente` no lo lee.
- `profiles`: cada quien lee el suyo y el dueño lee los de todo su negocio (misma regla de rol de antes).
- Errores nuevos de las RPC: `Sucursal inválida`, `Cliente inválido` (`create_order` y `save_quote`
  validan que el cliente sea del negocio) y `Variante inexistente en el destino: <key>` (`transfer_stock`).
- `transfer_stock` anota en el kardex `Hacia <nombre de sucursal>` / `Desde <nombre de sucursal>`.
- `handle_new_user` falla con los mensajes en español del contrato; Supabase Auth los devuelve al
  cliente como un error genérico de registro ("Database error saving new user").
- Realtime: `orders, stock, quotes, customers, products, expenses, branches, settings`.

### Configuración inicial de un negocio nuevo

Valores neutros: nada de cifras de una tienda en particular.

```jsonc
// profile
{ "legalName": "", "phone": "", "email": "", "instagram": "", "web": "", "city": "", "address": "",
  "ticketFooter": "¡Gracias por tu compra!", "logoUrl": null, "accentColor": null }
// catalog
{ "categories": ["Blusas", "Camisas", "Playeras", "Polos", "Pantalones", "Jeans", "Vestidos",
                 "Faldas", "Shorts", "Chamarras y suéteres", "Accesorios"],
  "sizePresets": [ { "name": "Ropa S–XL", "sizes": ["S","M","L","XL"] },
                   { "name": "Ropa XS–XXL", "sizes": ["XS","S","M","L","XL","XXL"] },
                   { "name": "Pantalón 28–36", "sizes": ["28","30","32","34","36"] },
                   { "name": "Unitalla", "sizes": ["Única"] } ],
  "sizeCurve": {} }                       // vacío = reparto parejo entre tallas
// sales
{ "channels": ["tienda", "web", "instagram", "whatsapp"],
  "carriers": ["Estafeta", "FedEx", "DHL", "Paquetexpress", "J&T"],
  "paymentFees": { "efectivo": 0, "transferencia": 0, "tarjeta": 0.036, "mercadopago": 0.0406, "paypal": 0.0458 } }
// wholesale — desactivado; el dueño define sus niveles
{ "enabled": false,
  "tiers": [ { "id": "lista", "name": "Precio de lista", "minPieces": 1, "discount": 0, "description": "Precio de lista" } ],
  "distributorCustomerMin": 0,            // 0 = sin regla especial para clientes distribuidores
  "depositPct": 0, "freeShippingFrom": 0, // 0 = sin envío gratis
  "flatShipping": 0, "validityDays": 7,
  "packages": [],
  "bank": { "bank": "", "holder": "", "clabe": "" } }
```

## App (`src/`)

- `BranchId`, `Category` y `TierId` pasan a ser `string`. `StockMap` = `Record<variantKey, Record<BranchId, number>>`;
  una sucursal ausente cuenta como 0.
- Ya no existen `BUSINESS`, `BRANCHES`, `BRANCH_IDS`, `CARRIERS`, `PAYMENT_FEE`, `PACKAGES`, curvas de
  tallas ni listas de categorías fijas en el código. Todo sale del store (`useErp`) cargado de Supabase.
- El store expone `business`, `branches`, `profileSettings`, `catalog`, `sales`, `wholesale` y las
  acciones para guardarlos; ver `src/lib/store.ts` para la API exacta.
- El canal `mayoreo` y el módulo Mayoreo solo aparecen si `wholesale.enabled`.
- El color de acento (`profile.accentColor`) sobrescribe `--gold`, `--ring` y `--sidebar-primary`.
