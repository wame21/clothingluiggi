"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useMemo } from "react";
import { create } from "zustand";
import { activeBranches, applyBranches, posBranches, warehouseOf } from "./branches";
import { APP_NAME } from "./constants";
import {
  applyCatalogSettings,
  applySalesSettings,
  catalogFrom,
  profileFrom,
  salesFrom,
  type BusinessProfile,
  type CatalogSettings,
  type SalesSettings,
} from "./settings";
import { supabase } from "./supabase/client";
import type {
  AppRole,
  Branch,
  BranchId,
  Business,
  Channel,
  Customer,
  ErpData,
  Expense,
  LineItem,
  Movement,
  MovementType,
  Order,
  OrderStatus,
  Payment,
  Product,
  Profile,
  Quote,
  Role,
  ShippingInfo,
  StockMap,
  TierId,
} from "./types";
import { applyWholesaleSettings, wholesaleFrom, wholesaleSnapshot, type WholesaleSettings } from "./wholesale";

export interface NewOrderInput {
  channel: Channel;
  customerId?: string;
  customerName: string;
  branch: BranchId;
  items: LineItem[];
  discount?: number;
  shipping?: number;
  payments?: Omit<Payment, "id" | "date">[];
  status?: OrderStatus;
  notes?: string;
  shippingInfo?: ShippingInfo;
  tierId?: TierId;
  quoteId?: string;
  seller?: string;
}

/** Datos para crear (sin `id`) o editar (con `id`) una sucursal. */
export interface BranchInput {
  id?: BranchId;
  name: string;
  short: string;
  address: string;
  pos: boolean;
  isWarehouse: boolean;
  active: boolean;
  sort?: number;
}

type StockEntry = { variantKey: string; qty: number };
type PaymentInput = Omit<Payment, "id" | "date">;

/** Tablas que se recargan cuando cambian (por esta pestaña o por otro usuario en tiempo real). */
type Table = "products" | "stock" | "movements" | "orders" | "customers" | "quotes" | "expenses" | "branches" | "settings";

interface Actions {
  init: () => Promise<void>;
  signOut: () => Promise<void>;
  reload: (tables: Table[]) => Promise<void>;

  createOrder: (input: NewOrderInput) => Promise<Order>;
  addPayment: (orderId: string, payment: PaymentInput) => Promise<void>;
  setOrderStatus: (orderId: string, status: OrderStatus, shippingInfo?: ShippingInfo) => Promise<void>;

  moveStock: (entries: StockEntry[], branch: BranchId, type: Extract<MovementType, "entrada" | "ajuste">, meta?: { ref?: string; note?: string }) => Promise<void>;
  transferStock: (entries: StockEntry[], from: BranchId, to: BranchId) => Promise<void>;
  addProduct: (p: Omit<Product, "id" | "createdAt">) => Promise<Product>;
  updateProduct: (id: string, patch: Partial<Product>) => Promise<void>;

  addCustomer: (c: Omit<Customer, "id" | "since">) => Promise<Customer>;
  updateCustomer: (id: string, patch: Partial<Customer>) => Promise<void>;

  saveQuote: (q: Omit<Quote, "id" | "folio"> & { id?: string }) => Promise<Quote>;
  setQuoteStatus: (id: string, status: Quote["status"]) => Promise<void>;
  convertQuote: (id: string, deposit: PaymentInput) => Promise<Order>;

  addExpense: (e: Omit<Expense, "id">) => Promise<void>;
  removeExpense: (id: string) => Promise<void>;

  loadTeam: () => Promise<void>;
  setMember: (id: string, role: AppRole, branch: BranchId | null) => Promise<void>;

  /** Nombre y prefijos de folio del negocio (solo dueño). */
  saveBusiness: (b: { name: string; orderPrefix: string; quotePrefix: string }) => Promise<void>;
  /** Genera un código de invitación nuevo (el anterior deja de servir) y lo devuelve. */
  regenerateInviteCode: () => Promise<string>;

  saveProfileSettings: (next: BusinessProfile) => Promise<void>;
  saveCatalog: (next: CatalogSettings) => Promise<void>;
  saveSales: (next: SalesSettings) => Promise<void>;
  saveWholesale: (next: WholesaleSettings) => Promise<void>;

  /** Crea o edita una sucursal; nunca se borran. Marcar `isWarehouse` desmarca la anterior. */
  saveBranch: (b: BranchInput) => Promise<Branch>;

  /** Sube el logo al bucket `logos`, lo guarda en `profileSettings.logoUrl` y devuelve la URL pública. */
  uploadLogo: (file: File) => Promise<string>;
  removeLogo: () => Promise<void>;
}

/** Configuración del negocio cargada de Supabase; sus snapshots hacen que React se re-renderice. */
interface Config {
  business: Business | null;
  branches: Branch[];
  /** `settings.profile` */
  profileSettings: BusinessProfile;
  /** `settings.catalog` */
  catalog: CatalogSettings;
  /** `settings.sales` */
  sales: SalesSettings;
  /** `settings.wholesale` */
  wholesale: WholesaleSettings;
}

interface Session {
  status: "loading" | "ready" | "error";
  error?: string;
  profile: Profile | null;
  /** Rol efectivo para la interfaz; los pendientes nunca llegan a ver datos. */
  role: Role;
  team: Profile[];
  /** Conectado al canal de tiempo real. */
  live: boolean;
}

type Data = ErpData & Config;

export type ErpState = Data & Session & Actions;

/* ------------------------------------------------------------------ */
/* Filas de Postgres ↔ tipos de la app                                  */
/* ------------------------------------------------------------------ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const opt = <T>(v: T | null | undefined) => v ?? undefined;
const num = (v: unknown) => Number(v ?? 0);

const toProfile = (r: Row): Profile => ({
  id: r.id,
  businessId: r.business_id,
  name: r.name,
  email: opt(r.email),
  role: r.role,
  branch: r.branch ?? null,
  createdAt: r.created_at,
});

const toBusiness = (r: Row): Business => ({
  id: r.id,
  name: r.name,
  inviteCode: r.invite_code,
  orderPrefix: r.order_prefix,
  quotePrefix: r.quote_prefix,
});

const toBranch = (r: Row): Branch => ({
  id: r.id,
  name: r.name,
  short: r.short,
  address: r.address ?? "",
  pos: r.pos,
  isWarehouse: r.is_warehouse,
  active: r.active,
  sort: num(r.sort),
});

const toProduct = (r: Row): Product => ({
  id: r.id,
  sku: r.sku,
  name: r.name,
  brand: r.brand,
  category: r.category,
  cost: num(r.cost),
  price: num(r.price),
  sizes: r.sizes,
  colors: r.colors,
  minStock: r.min_stock,
  active: r.active,
  createdAt: r.created_at,
  wooId: opt(r.woo_id),
});

const productRow = (p: Partial<Product>): Row => {
  const r: Row = {};
  if (p.sku !== undefined) r.sku = p.sku;
  if (p.name !== undefined) r.name = p.name;
  if (p.brand !== undefined) r.brand = p.brand;
  if (p.category !== undefined) r.category = p.category;
  if (p.cost !== undefined) r.cost = p.cost;
  if (p.price !== undefined) r.price = p.price;
  if (p.sizes !== undefined) r.sizes = p.sizes;
  if (p.colors !== undefined) r.colors = p.colors;
  if (p.minStock !== undefined) r.min_stock = p.minStock;
  if (p.active !== undefined) r.active = p.active;
  if (p.wooId !== undefined) r.woo_id = p.wooId;
  return r;
};

const toStock = (rows: Row[]): StockMap => {
  const map: StockMap = {};
  for (const r of rows) {
    map[r.variant_key] ??= {};
    map[r.variant_key][r.branch as BranchId] = r.qty;
  }
  return map;
};

const toMovement = (r: Row): Movement => ({
  id: r.id,
  date: r.date,
  type: r.type,
  productId: r.product_id,
  variantKey: r.variant_key,
  branch: r.branch,
  qty: r.qty,
  ref: opt(r.ref),
  note: opt(r.note),
});

const toOrder = (r: Row): Order => ({
  id: r.id,
  folio: r.folio,
  date: r.date,
  channel: r.channel,
  customerId: opt(r.customer_id),
  customerName: r.customer_name,
  branch: r.branch,
  items: r.items,
  subtotal: num(r.subtotal),
  discount: num(r.discount),
  shipping: num(r.shipping),
  total: num(r.total),
  payments: (r.payments as Payment[]).map((p) => ({ ...p, amount: num(p.amount) })),
  status: r.status,
  shippingInfo: opt(r.shipping_info),
  notes: opt(r.notes),
  quoteId: opt(r.quote_id),
  tierId: opt(r.tier_id),
  seller: opt(r.seller),
});

const toCustomer = (r: Row): Customer => ({
  id: r.id,
  name: r.name,
  business: opt(r.business),
  phone: r.phone,
  city: r.city,
  state: r.state,
  type: r.type,
  instagram: opt(r.instagram),
  rfc: opt(r.rfc),
  email: opt(r.email),
  since: r.since,
  notes: opt(r.notes),
});

const customerRow = (c: Partial<Customer>): Row => {
  const r: Row = {};
  for (const k of ["name", "business", "phone", "city", "state", "type", "instagram", "rfc", "email", "notes"] as const)
    if (c[k] !== undefined) r[k] = c[k];
  return r;
};

const toQuote = (r: Row): Quote => ({
  id: r.id,
  folio: r.folio,
  date: r.date,
  validUntil: r.valid_until,
  customerId: r.customer_id,
  customerName: r.customer_name,
  items: r.items,
  tierId: r.tier_id,
  subtotalList: num(r.subtotal_list),
  discount: num(r.discount),
  subtotal: num(r.subtotal),
  shipping: num(r.shipping),
  total: num(r.total),
  depositPct: num(r.deposit_pct),
  status: r.status,
  notes: opt(r.notes),
  orderId: opt(r.order_id),
});

const toExpense = (r: Row): Expense => ({
  id: r.id,
  date: r.date,
  category: r.category,
  description: r.description,
  amount: num(r.amount),
  branch: opt(r.branch),
  method: r.method,
});

/* ------------------------------------------------------------------ */
/* Acceso a datos                                                       */
/* ------------------------------------------------------------------ */
const PAGE = 1000;
const MOVEMENTS_LIMIT = 1000;

/** Supabase devuelve máximo 1000 filas por consulta; esto pagina hasta traer todas. */
async function fetchAll(table: string, order: [column: string, ascending: boolean][]): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase().from(table).select("*");
    for (const [column, ascending] of order) q = q.order(column, { ascending });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

/** Devuelve `data` o lanza el mensaje de error de Postgres (p. ej. "Sin existencia suficiente…"). */
function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Las configuraciones y sucursales vigentes se aplican al cargar, antes del primer render. */
const LOADERS: Record<Table, (businessId: string) => Promise<Partial<Data>>> = {
  products: async () => ({ products: (await fetchAll("products", [["created_at", true]])).map(toProduct) }),
  stock: async () => ({ stock: toStock(await fetchAll("stock", [["variant_key", true], ["branch", true]])) }),
  movements: async () => {
    const res = await supabase().from("movements").select("*").order("date", { ascending: false }).limit(MOVEMENTS_LIMIT);
    return { movements: must(res).map(toMovement) };
  },
  orders: async () => ({ orders: (await fetchAll("orders", [["date", true]])).map(toOrder) }),
  customers: async () => ({ customers: (await fetchAll("customers", [["since", true]])).map(toCustomer) }),
  quotes: async () => ({ quotes: (await fetchAll("quotes", [["date", true]])).map(toQuote) }),
  expenses: async () => ({ expenses: (await fetchAll("expenses", [["date", false]])).map(toExpense) }),
  branches: async () => {
    const branches = (await fetchAll("branches", [["sort", true], ["created_at", true]])).map(toBranch);
    applyBranches(branches);
    return { branches };
  },
  settings: async (businessId) => {
    const rows = must(await supabase().from("settings").select("key, value").eq("business_id", businessId)) as Row[];
    const value = (key: string) => rows.find((r) => r.key === key)?.value;
    const catalog = catalogFrom(value("catalog"));
    const sales = salesFrom(value("sales"));
    applyCatalogSettings(catalog);
    applySalesSettings(sales);
    applyWholesaleSettings(wholesaleFrom(value("wholesale")));
    return { profileSettings: profileFrom(value("profile")), catalog, sales, wholesale: wholesaleSnapshot() };
  },
};

const ALL_TABLES = Object.keys(LOADERS) as Table[];

async function loadBusiness(businessId: string) {
  return toBusiness(must(await supabase().from("businesses").select("*").eq("id", businessId).single()));
}

const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];

const EMPTY: ErpData = { products: [], stock: {}, movements: [], orders: [], customers: [], quotes: [], expenses: [] };

/** Mientras cargan, se usan los valores por defecto de cada configuración. */
const DEFAULT_CONFIG: Config = {
  business: null,
  branches: [],
  profileSettings: profileFrom(undefined),
  catalog: catalogFrom(undefined),
  sales: salesFrom(undefined),
  wholesale: wholesaleSnapshot(),
};

let channel: RealtimeChannel | undefined;

/** Recarga completa hacia /login: así no queda en memoria ningún dato del negocio. */
function goToLogin() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- se busca descartar el estado en memoria
  window.location.assign("/login");
}
const pending = new Map<Table, ReturnType<typeof setTimeout>>();

const LOGOS_BUCKET = "logos";

/** Ruta dentro del bucket a partir de la URL pública de un logo. */
const logoPath = (url: string) => {
  const tail = url.split(`/${LOGOS_BUCKET}/`)[1];
  return tail ? decodeURIComponent(tail.split("?")[0]) : undefined;
};

/** Borra el archivo de un logo anterior; si falla no importa, solo queda un archivo huérfano. */
async function removeLogoFile(url: string | null) {
  const path = url ? logoPath(url) : undefined;
  if (path) await supabase().storage.from(LOGOS_BUCKET).remove([path]).catch(() => {});
}

export const useErp = create<ErpState>()((set, get) => {
  /** Recarga una tabla poco después del último cambio, para agrupar ráfagas de eventos. */
  const schedule = (table: Table) => {
    clearTimeout(pending.get(table));
    pending.set(
      table,
      setTimeout(() => {
        pending.delete(table);
        void get().reload(table === "stock" ? ["stock", "movements"] : [table]).catch(() => {});
      }, 300),
    );
  };

  const subscribe = () => {
    if (channel) return;
    channel = supabase().channel("erp");
    for (const table of ["orders", "stock", "quotes", "customers", "products", "expenses", "branches", "settings"] as const)
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => schedule(table));
    channel.subscribe((status) => set({ live: status === "SUBSCRIBED" }));
  };

  const businessId = () => {
    const id = get().profile?.businessId;
    if (!id) throw new Error("No hay una sesión activa");
    return id;
  };

  /** Guarda un valor de `settings` del negocio (llave única por negocio). */
  const saveSetting = async (key: "profile" | "catalog" | "sales" | "wholesale", value: unknown) => {
    must(
      await supabase()
        .from("settings")
        .upsert({ business_id: businessId(), key, value, updated_at: new Date().toISOString() }, { onConflict: "business_id,key" })
        .select()
        .single(),
    );
  };

  return {
    ...EMPTY,
    ...DEFAULT_CONFIG,
    status: "loading",
    profile: null,
    role: "vendedor",
    team: [],
    live: false,

    init: async () => {
      set({ status: "loading", error: undefined });
      try {
        const sb = supabase();
        const { data: auth } = await sb.auth.getUser();
        if (!auth.user) return goToLogin();
        const profile = toProfile(must(await sb.from("profiles").select("*").eq("id", auth.user.id).single()));
        set({ profile, role: profile.role === "dueno" ? "dueno" : "vendedor" });
        if (profile.role === "pendiente") {
          set({ status: "ready" });
          return;
        }
        const [business, ...parts] = await Promise.all([
          loadBusiness(profile.businessId),
          ...ALL_TABLES.map((t) => LOADERS[t](profile.businessId)),
        ]);
        set({ ...Object.assign({}, ...parts), business, status: "ready" });
        subscribe();
      } catch (e) {
        set({ status: "error", error: errorMessage(e) });
      }
    },

    signOut: async () => {
      if (channel) await supabase().removeChannel(channel);
      channel = undefined;
      await supabase().auth.signOut();
      goToLogin();
    },

    reload: async (tables) => {
      const id = businessId();
      const parts = await Promise.all(tables.map((t) => LOADERS[t](id)));
      set(Object.assign({}, ...parts));
    },

    createOrder: async (input) => {
      const row = must(await supabase().rpc("create_order", { p: { ...input, seller: input.seller ?? get().profile?.name } }));
      const order = toOrder(row as Row);
      set((s) => ({ orders: upsert(s.orders, order) }));
      await get().reload(["stock", "movements"]);
      return order;
    },

    addPayment: async (orderId, payment) => {
      const row = must(await supabase().rpc("add_payment", { p_order: orderId, p_payment: payment }));
      set((s) => ({ orders: upsert(s.orders, toOrder(row as Row)) }));
    },

    setOrderStatus: async (orderId, status, shippingInfo) => {
      const row = must(
        await supabase().rpc("set_order_status", { p_order: orderId, p_status: status, p_shipping: shippingInfo ?? null }),
      );
      set((s) => ({ orders: upsert(s.orders, toOrder(row as Row)) }));
      if (status === "cancelado") await get().reload(["stock", "movements"]);
    },

    moveStock: async (entries, branch, type, meta) => {
      must(
        await supabase().rpc("move_stock", {
          p_entries: entries,
          p_branch: branch,
          p_type: type,
          p_ref: meta?.ref ?? null,
          p_note: meta?.note ?? null,
        }),
      );
      await get().reload(["stock", "movements"]);
    },

    transferStock: async (entries, from, to) => {
      must(await supabase().rpc("transfer_stock", { p_entries: entries, p_from: from, p_to: to }));
      await get().reload(["stock", "movements"]);
    },

    addProduct: async (p) => {
      const product = toProduct(must(await supabase().from("products").insert(productRow(p)).select().single()));
      set((s) => ({ products: upsert(s.products, product) }));
      await get().reload(["stock"]);
      return product;
    },

    updateProduct: async (id, patch) => {
      const product = toProduct(must(await supabase().from("products").update(productRow(patch)).eq("id", id).select().single()));
      set((s) => ({ products: upsert(s.products, product) }));
    },

    addCustomer: async (c) => {
      const customer = toCustomer(must(await supabase().from("customers").insert(customerRow(c)).select().single()));
      set((s) => ({ customers: upsert(s.customers, customer) }));
      return customer;
    },

    updateCustomer: async (id, patch) => {
      const customer = toCustomer(must(await supabase().from("customers").update(customerRow(patch)).eq("id", id).select().single()));
      set((s) => ({ customers: upsert(s.customers, customer) }));
    },

    saveQuote: async (q) => {
      const quote = toQuote(must(await supabase().rpc("save_quote", { p: q })) as Row);
      set((s) => ({ quotes: upsert(s.quotes, quote) }));
      return quote;
    },

    setQuoteStatus: async (id, status) => {
      const quote = toQuote(must(await supabase().from("quotes").update({ status }).eq("id", id).select().single()));
      set((s) => ({ quotes: upsert(s.quotes, quote) }));
    },

    convertQuote: async (id, deposit) => {
      const order = toOrder(must(await supabase().rpc("convert_quote", { p_quote: id, p_deposit: deposit })) as Row);
      set((s) => ({ orders: upsert(s.orders, order) }));
      await get().reload(["quotes", "stock", "movements"]);
      return order;
    },

    addExpense: async (e) => {
      const expense = toExpense(
        must(
          await supabase()
            .from("expenses")
            .insert({ date: e.date, category: e.category, description: e.description, amount: e.amount, branch: e.branch ?? null, method: e.method })
            .select()
            .single(),
        ),
      );
      set((s) => ({ expenses: [expense, ...s.expenses.filter((x) => x.id !== expense.id)] }));
    },

    removeExpense: async (id) => {
      must(await supabase().from("expenses").delete().eq("id", id));
      set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) }));
    },

    loadTeam: async () => {
      const rows = must(await supabase().from("profiles").select("*").order("created_at", { ascending: true }));
      set({ team: rows.map(toProfile) });
    },

    setMember: async (id, role, branch) => {
      const profile = toProfile(must(await supabase().rpc("set_member", { p_id: id, p_role: role, p_branch: branch })) as Row);
      set((s) => ({ team: s.team.map((m) => (m.id === id ? profile : m)) }));
    },

    saveBusiness: async (b) => {
      const business = toBusiness(
        must(
          await supabase().rpc("update_business", { p_name: b.name, p_order_prefix: b.orderPrefix, p_quote_prefix: b.quotePrefix }),
        ) as Row,
      );
      set({ business });
    },

    regenerateInviteCode: async () => {
      const code = must(await supabase().rpc("regenerate_invite_code")) as string;
      set((s) => ({ business: s.business && { ...s.business, inviteCode: code } }));
      return code;
    },

    saveProfileSettings: async (next) => {
      await saveSetting("profile", next);
      set({ profileSettings: next });
    },

    saveCatalog: async (next) => {
      await saveSetting("catalog", next);
      applyCatalogSettings(next);
      set({ catalog: next });
    },

    saveSales: async (next) => {
      await saveSetting("sales", next);
      applySalesSettings(next);
      set({ sales: next });
    },

    saveWholesale: async (next) => {
      await saveSetting("wholesale", next);
      applyWholesaleSettings(next);
      set({ wholesale: wholesaleSnapshot() });
    },

    saveBranch: async (b) => {
      const sb = supabase();
      // Solo puede haber una sucursal que surte: se desmarca la anterior antes de marcar esta
      let released: string[] = [];
      if (b.isWarehouse) {
        let q = sb.from("branches").update({ is_warehouse: false }).eq("is_warehouse", true);
        if (b.id) q = q.neq("id", b.id);
        released = must(await q.select("id")).map((r: Row) => r.id);
      }
      const row: Row = { name: b.name, short: b.short, address: b.address, pos: b.pos, is_warehouse: b.isWarehouse, active: b.active };
      try {
        let saved: Branch;
        if (b.id) {
          if (b.sort !== undefined) row.sort = b.sort;
          saved = toBranch(must(await sb.from("branches").update(row).eq("id", b.id).select().single()));
        } else {
          row.sort = b.sort ?? Math.max(-1, ...get().branches.map((x) => x.sort)) + 1;
          saved = toBranch(must(await sb.from("branches").insert(row).select().single()));
        }
        await get().reload(["branches", "stock"]);
        return saved;
      } catch (e) {
        if (released.length) await sb.from("branches").update({ is_warehouse: true }).in("id", released);
        throw e;
      }
    },

    uploadLogo: async (file) => {
      const ext = (file.name.split(".").pop() || file.type.split("/")[1] || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${businessId()}/logo-${Date.now()}.${ext || "png"}`;
      const bucket = supabase().storage.from(LOGOS_BUCKET);
      const { error } = await bucket.upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) throw new Error(error.message);
      const url = bucket.getPublicUrl(path).data.publicUrl;
      const previous = get().profileSettings.logoUrl;
      await get().saveProfileSettings({ ...get().profileSettings, logoUrl: url });
      await removeLogoFile(previous);
      return url;
    },

    removeLogo: async () => {
      const previous = get().profileSettings.logoUrl;
      await get().saveProfileSettings({ ...get().profileSettings, logoUrl: null });
      await removeLogoFile(previous);
    },
  };
});

/* ------------------------------------------------------------------ */
/* Hooks y selectores                                                   */
/* ------------------------------------------------------------------ */
export const useIsOwner = () => useErp((s) => s.role === "dueno");

/** Nombre del negocio; mientras carga (o sin sesión) el del producto. */
export const useBusinessName = () => useErp((s) => s.business?.name ?? APP_NAME);

/** Todas las sucursales, también las archivadas (para resolver nombres de datos históricos). */
export const useBranches = () => useErp((s) => s.branches);

/** Sucursales activas, en orden. */
export function useActiveBranches() {
  const branches = useErp((s) => s.branches);
  return useMemo(() => activeBranches(branches), [branches]);
}

/** Sucursales activas con mostrador (Punto de venta). */
export function usePosBranches() {
  const branches = useErp((s) => s.branches);
  return useMemo(() => posBranches(branches), [branches]);
}

/** Sucursal que surte mayoreo y pedidos en línea (puede no haber). */
export const useWarehouse = () => useErp((s) => warehouseOf(s.branches));

/** Nombre corto de una sucursal por id; también resuelve las archivadas. */
export function useBranchName() {
  const branches = useErp((s) => s.branches);
  return useCallback((id: BranchId) => branches.find((b) => b.id === id)?.short ?? id, [branches]);
}

export const useWholesaleEnabled = () => useErp((s) => s.wholesale.enabled);

/** Canales de venta del negocio; `mayoreo` solo si el módulo de mayoreo está activo. */
export function useChannels(): Channel[] {
  const channels = useErp((s) => s.sales.channels);
  const wholesale = useErp((s) => s.wholesale.enabled);
  return useMemo(() => {
    const base = channels.filter((c) => c !== "mayoreo");
    return wholesale ? [...base, "mayoreo"] : base;
  }, [channels, wholesale]);
}

export const useCategories = () => useErp((s) => s.catalog.categories);

/** Mensaje legible de un error lanzado por una acción del store. */
export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Algo salió mal, intenta de nuevo";
}
