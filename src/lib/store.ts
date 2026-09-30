"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { create } from "zustand";
import { supabase } from "./supabase/client";
import type {
  AppRole,
  BranchId,
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
import { applyWholesaleSettings, wholesaleSnapshot, type WholesaleSettings } from "./wholesale";

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

type StockEntry = { variantKey: string; qty: number };
type PaymentInput = Omit<Payment, "id" | "date">;

/** Tablas que se recargan cuando cambian (por esta pestaña o por otro usuario en tiempo real). */
type Table = "products" | "stock" | "movements" | "orders" | "customers" | "quotes" | "expenses";

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
  setMember: (id: string, role: AppRole, branch: BranchId) => Promise<void>;

  saveWholesale: (next: WholesaleSettings) => Promise<void>;
}

interface Session {
  status: "loading" | "ready" | "error";
  error?: string;
  profile: Profile | null;
  /** Rol efectivo para la interfaz; los pendientes nunca llegan a ver datos. */
  role: Role;
  team: Profile[];
  /** Mayoreo y datos para depósito (`settings.wholesale`). */
  wholesale: WholesaleSettings;
  /** Conectado al canal de tiempo real. */
  live: boolean;
}

export type ErpState = ErpData & Session & Actions;

/* ------------------------------------------------------------------ */
/* Filas de Postgres ↔ tipos de la app                                  */
/* ------------------------------------------------------------------ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const opt = <T>(v: T | null | undefined) => v ?? undefined;
const num = (v: unknown) => Number(v ?? 0);

const toProfile = (r: Row): Profile => ({
  id: r.id,
  name: r.name,
  email: opt(r.email),
  role: r.role,
  branch: r.branch,
  createdAt: r.created_at,
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
    map[r.variant_key] ??= { andara: 0, bamoa: 0, bodega: 0 };
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

const LOADERS: Record<Table, () => Promise<Partial<ErpData>>> = {
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
};

const ALL_TABLES = Object.keys(LOADERS) as Table[];

async function loadSettings() {
  const row = must(await supabase().from("settings").select("value").eq("key", "wholesale").maybeSingle()) as Row | null;
  if (row) applyWholesaleSettings(row.value as WholesaleSettings);
}

const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];

const EMPTY: ErpData = { products: [], stock: {}, movements: [], orders: [], customers: [], quotes: [], expenses: [] };

let channel: RealtimeChannel | undefined;

/** Recarga completa hacia /login: así no queda en memoria ningún dato del negocio. */
function goToLogin() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- se busca descartar el estado en memoria
  window.location.assign("/login");
}
const pending = new Map<Table, ReturnType<typeof setTimeout>>();

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
    for (const table of ["orders", "stock", "quotes", "customers", "products", "expenses"] as const)
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => schedule(table));
    channel.subscribe((status) => set({ live: status === "SUBSCRIBED" }));
  };

  return {
    ...EMPTY,
    status: "loading",
    profile: null,
    role: "vendedor",
    team: [],
    wholesale: wholesaleSnapshot(),
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
        const [, ...parts] = await Promise.all([loadSettings(), ...ALL_TABLES.map((t) => LOADERS[t]())]);
        set({ ...Object.assign({}, ...parts), wholesale: wholesaleSnapshot(), status: "ready" });
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
      const parts = await Promise.all(tables.map((t) => LOADERS[t]()));
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

    saveWholesale: async (next) => {
      must(
        await supabase()
          .from("settings")
          .upsert({ key: "wholesale", value: next, updated_at: new Date().toISOString() })
          .select()
          .single(),
      );
      applyWholesaleSettings(next);
      set({ wholesale: wholesaleSnapshot() });
    },
  };
});

export const useIsOwner = () => useErp((s) => s.role === "dueno");

/** Mensaje legible de un error lanzado por una acción del store. */
export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Algo salió mal, intenta de nuevo";
}
