import { CHANNELS } from "./constants";
import { paymentFee } from "./settings";
import type {
  Channel,
  Customer,
  ErpData,
  Expense,
  ExpenseCategory,
  Order,
  OrderStatus,
  Product,
  StockMap,
} from "./types";
import { productStock } from "./variants";

const DAY = 86_400_000;

/* ------------------------------------------------------------------ */
/* Periodos                                                             */
/* ------------------------------------------------------------------ */
export type Period = "hoy" | "7d" | "mes" | "mes_pasado" | "90d";

export const PERIOD_LABEL: Record<Period, string> = {
  hoy: "Hoy",
  "7d": "Últimos 7 días",
  mes: "Este mes",
  mes_pasado: "Mes pasado",
  "90d": "Últimos 90 días",
};

export interface Range {
  from: Date;
  to: Date;
}

export function periodRange(p: Period, now = new Date()): { cur: Range; prev: Range } {
  const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  switch (p) {
    case "hoy": {
      const from = sod(now);
      return { cur: { from, to: now }, prev: { from: new Date(from.getTime() - DAY), to: new Date(now.getTime() - DAY) } };
    }
    case "7d": {
      const from = new Date(sod(now).getTime() - 6 * DAY);
      return { cur: { from, to: now }, prev: { from: new Date(from.getTime() - 7 * DAY), to: new Date(now.getTime() - 7 * DAY) } };
    }
    case "mes": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const pFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const pTo = new Date(Math.min(
        new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime(),
        new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(), now.getHours(), now.getMinutes()).getTime(),
      ));
      return { cur: { from, to: now }, prev: { from: pFrom, to: pTo } };
    }
    case "mes_pasado": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return {
        cur: { from, to },
        prev: { from: new Date(now.getFullYear(), now.getMonth() - 2, 1), to: new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999) },
      };
    }
    case "90d": {
      const from = new Date(sod(now).getTime() - 89 * DAY);
      return { cur: { from, to: now }, prev: { from: new Date(from.getTime() - 90 * DAY), to: new Date(from.getTime() - 1) } };
    }
  }
}

export const inRange = (iso: string, r: Range) => {
  const t = new Date(iso).getTime();
  return t >= r.from.getTime() && t <= r.to.getTime();
};

/* ------------------------------------------------------------------ */
/* Pedidos                                                              */
/* ------------------------------------------------------------------ */
/** A sale is recognized once it's fully paid (or shipped/delivered). */
export const SALE_STATUSES: OrderStatus[] = ["pagado", "enviado", "entregado"];
export const isSale = (o: Order) => SALE_STATUSES.includes(o.status);

export const orderNet = (o: Order) => o.subtotal - o.discount;
export const orderCost = (o: Order) => o.items.reduce((a, it) => a + it.qty * it.unitCost, 0);
export const orderUnits = (o: Order) => o.items.reduce((a, it) => a + it.qty, 0);
export const orderPaid = (o: Order) => o.payments.reduce((a, p) => a + p.amount, 0);
export const orderBalance = (o: Order) => (o.status === "cancelado" ? 0 : Math.max(0, o.total - orderPaid(o)));
export const orderFees = (o: Order) => o.payments.reduce((a, p) => a + p.amount * paymentFee(p.method), 0);

export function salesSummary(orders: Order[], r: Range) {
  let sales = 0, shippingIncome = 0, cogs = 0, fees = 0, units = 0, count = 0, discounts = 0, gross = 0;
  for (const o of orders) {
    if (!isSale(o) || !inRange(o.date, r)) continue;
    count++;
    gross += o.subtotal;
    discounts += o.discount;
    sales += orderNet(o);
    shippingIncome += o.shipping;
    cogs += orderCost(o);
    fees += orderFees(o);
    units += orderUnits(o);
  }
  const revenue = sales + shippingIncome;
  const grossProfit = revenue - cogs;
  return {
    gross,
    discounts,
    sales,
    shippingIncome,
    revenue,
    cogs,
    grossProfit,
    grossMargin: revenue ? grossProfit / revenue : 0,
    fees,
    units,
    orders: count,
    avgTicket: count ? revenue / count : 0,
  };
}

export const expensesIn = (expenses: Expense[], r: Range) =>
  expenses.filter((e) => inRange(e.date, r));

export function expensesByCategory(expenses: Expense[], r: Range) {
  const out = {} as Record<ExpenseCategory, number>;
  for (const e of expensesIn(expenses, r)) out[e.category] = (out[e.category] ?? 0) + e.amount;
  return out;
}

export function pnl(data: Pick<ErpData, "orders" | "expenses">, r: Range) {
  const s = salesSummary(data.orders, r);
  const byCat = expensesByCategory(data.expenses, r);
  const opex = Object.values(byCat).reduce((a, b) => a + b, 0);
  const operatingProfit = s.grossProfit - opex - s.fees;
  return {
    ...s,
    byCat,
    opex,
    operatingProfit,
    operatingMargin: s.revenue ? operatingProfit / s.revenue : 0,
  };
}

const FIXED: ExpenseCategory[] = ["renta", "nomina", "servicios", "software"];

/** Monthly revenue needed to cover fixed costs at the current contribution margin. */
export function breakEven(data: Pick<ErpData, "orders" | "expenses">, now = new Date()) {
  const r = { from: new Date(now.getTime() - 60 * DAY), to: now };
  const inR = expensesIn(data.expenses, r);
  const fixed = inR.filter((e) => FIXED.includes(e.category)).reduce((a, e) => a + e.amount, 0) / 2;
  const variable = inR.filter((e) => !FIXED.includes(e.category)).reduce((a, e) => a + e.amount, 0);
  const s = salesSummary(data.orders, r);
  const contribution = s.revenue ? (s.grossProfit - s.fees - variable) / s.revenue : 0;
  return {
    fixedMonthly: fixed,
    contributionMargin: contribution,
    breakEven: contribution > 0 ? fixed / contribution : 0,
  };
}

export function byChannel(orders: Order[], r: Range) {
  const rows = new Map<Channel, { channel: Channel; revenue: number; orders: number; units: number; cogs: number }>();
  for (const ch of CHANNELS) rows.set(ch, { channel: ch, revenue: 0, orders: 0, units: 0, cogs: 0 });
  for (const o of orders) {
    if (!isSale(o) || !inRange(o.date, r)) continue;
    const row = rows.get(o.channel)!;
    row.revenue += orderNet(o) + o.shipping;
    row.orders++;
    row.units += orderUnits(o);
    row.cogs += orderCost(o);
  }
  return [...rows.values()].map((row) => ({
    ...row,
    grossProfit: row.revenue - row.cogs,
    margin: row.revenue ? (row.revenue - row.cogs) / row.revenue : 0,
    avgTicket: row.orders ? row.revenue / row.orders : 0,
  }));
}

export type DailyRow = Record<Channel | "total" | "profit", number> & { date: string };

export function dailySeries(orders: Order[], r: Range): DailyRow[] {
  const days: Record<string, DailyRow> = {};
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const start = new Date(r.from.getFullYear(), r.from.getMonth(), r.from.getDate());
  for (let d = start; d.getTime() <= r.to.getTime(); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const k = key(d);
    days[k] = { date: k, tienda: 0, web: 0, whatsapp: 0, instagram: 0, mayoreo: 0, total: 0, profit: 0 };
  }
  for (const o of orders) {
    if (!isSale(o) || !inRange(o.date, r)) continue;
    const row = days[key(new Date(o.date))];
    if (!row) continue;
    const rev = orderNet(o) + o.shipping;
    row[o.channel] += rev;
    row.total += rev;
    row.profit += rev - orderCost(o);
  }
  return Object.values(days);
}

/** Calendar month `i` months back (0 = current, cut at `now`) with its short capitalized label. */
function monthBucket(i: number, now: Date) {
  const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
  const to = i === 0 ? now : new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
  const label = from.toLocaleDateString("es-MX", { month: "short" }).replace(".", "");
  return { range: { from, to }, month: label.charAt(0).toUpperCase() + label.slice(1), partial: i === 0 };
}

export function monthlySeries(data: Pick<ErpData, "orders" | "expenses">, months = 4, now = new Date()) {
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const { range, month, partial } = monthBucket(i, now);
    const p = pnl(data, range);
    out.push({
      month,
      partial,
      ingresos: p.revenue,
      costo: p.cogs,
      gastos: p.opex + p.fees,
      utilidad: p.operatingProfit,
      margen: p.operatingMargin,
    });
  }
  return out;
}

export function productStats(orders: Order[], r: Range) {
  const map = new Map<string, { units: number; revenue: number; cogs: number; orders: number }>();
  for (const o of orders) {
    if (!isSale(o) || !inRange(o.date, r)) continue;
    const share = o.subtotal ? (o.subtotal - o.discount) / o.subtotal : 1;
    const seen = new Set<string>();
    for (const it of o.items) {
      const row = map.get(it.productId) ?? { units: 0, revenue: 0, cogs: 0, orders: 0 };
      row.units += it.qty;
      row.revenue += it.qty * it.unitPrice * share;
      row.cogs += it.qty * it.unitCost;
      if (!seen.has(it.productId)) {
        seen.add(it.productId);
        row.orders++;
      }
      map.set(it.productId, row);
    }
  }
  return map;
}

export const receivables = (orders: Order[]) =>
  orders.filter((o) => o.status !== "cancelado" && orderBalance(o) > 0);

/* ------------------------------------------------------------------ */
/* Clientes y mayoreo                                                   */
/* ------------------------------------------------------------------ */
/** Per customer: non-cancelled orders (newest first), billed total, open balance and last purchase. Biggest buyer first. */
export function customerStats(customers: Customer[], orders: Order[]) {
  const byCustomer = new Map<string, Order[]>();
  for (const o of orders) if (o.customerId && o.status !== "cancelado") byCustomer.set(o.customerId, [...(byCustomer.get(o.customerId) ?? []), o]);
  return customers
    .map((customer) => {
      const list = (byCustomer.get(customer.id) ?? []).sort((a, b) => b.date.localeCompare(a.date));
      return {
        customer,
        orders: list,
        total: list.reduce((a, o) => a + o.total, 0),
        balance: list.reduce((a, o) => a + orderBalance(o), 0),
        last: list[0]?.date,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/** Wholesale sale = a recognized sale in the `mayoreo` channel (same definition as the page KPI). */
export const wholesaleOrders = (orders: Order[]) => orders.filter((o) => o.channel === "mayoreo");

/** Mayorista/distribuidor customers with their wholesale revenue and order count in `r`, biggest first. */
export function wholesaleBuyers(customers: Customer[], orders: Order[], r: Range) {
  return customerStats(customers.filter((c) => c.type !== "menudeo"), orders)
    .map((s) => {
      const sales = salesSummary(wholesaleOrders(s.orders), r);
      return { ...s, revenue: sales.revenue, periodOrders: sales.orders };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

/** Wholesale revenue for each of the last `months` calendar months (the current one is partial). */
export function wholesaleMonthly(orders: Order[], months = 6, now = new Date()) {
  const wholesale = wholesaleOrders(orders);
  return Array.from({ length: months }, (_, k) => {
    const { range, month, partial } = monthBucket(months - 1 - k, now);
    return { month, partial, revenue: salesSummary(wholesale, range).revenue };
  });
}

/* ------------------------------------------------------------------ */
/* Inventario                                                           */
/* ------------------------------------------------------------------ */
export function inventoryValue(products: Product[], stock: StockMap) {
  let units = 0, cost = 0, retail = 0;
  for (const p of products) {
    const u = productStock(p, stock);
    units += u;
    cost += u * p.cost;
    retail += u * p.price;
  }
  return { units, cost, retail };
}

/** Coverage and reorder suggestion per product, based on the last 30 days. */
export function replenishment(products: Product[], stock: StockMap, orders: Order[], now = new Date()) {
  const r = { from: new Date(now.getTime() - 30 * DAY), to: now };
  const stats = productStats(orders, r);
  return products.map((p) => {
    const onHand = productStock(p, stock);
    const sold30 = stats.get(p.id)?.units ?? 0;
    const perDay = sold30 / 30;
    const coverageDays = perDay > 0 ? onHand / perDay : Infinity;
    const suggested = perDay > 0 ? Math.max(0, Math.ceil(perDay * 45 - onHand)) : 0;
    return { product: p, onHand, sold30, perDay, coverageDays, suggested, capital: onHand * p.cost };
  });
}
