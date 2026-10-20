import { beforeEach, describe, expect, it } from "vitest";
import { CHANNELS } from "@/lib/constants";
import {
  SALE_STATUSES,
  breakEven,
  byChannel,
  dailySeries,
  expensesByCategory,
  expensesIn,
  inRange,
  inventoryValue,
  isSale,
  monthlySeries,
  orderBalance,
  orderCost,
  orderFees,
  orderNet,
  orderPaid,
  orderUnits,
  periodRange,
  pnl,
  productStats,
  receivables,
  replenishment,
  salesSummary,
  type Period,
  type Range,
} from "@/lib/metrics";
import { DEFAULT_SALES, applySalesSettings } from "@/lib/settings";
import type {
  Expense,
  LineItem,
  Order,
  OrderStatus,
  Payment,
  PaymentMethod,
  Product,
  StockMap,
} from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Fábricas                                                             */
/* ------------------------------------------------------------------ */
/** Fecha local (mes 1-12) para no depender de la zona horaria. */
const at = (y: number, m: number, d: number, h = 12, mi = 0, s = 0, ms = 0) =>
  new Date(y, m - 1, d, h, mi, s, ms);
const iso = (...args: Parameters<typeof at>) => at(...args).toISOString();

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

const item = (o: Partial<LineItem> = {}): LineItem => ({
  productId: "p1",
  variantKey: "p1|Negro|M",
  name: "Blusa",
  color: "Negro",
  size: "M",
  qty: 1,
  unitPrice: 500,
  unitCost: 200,
  listPrice: 500,
  ...o,
});

const pay = (amount: number, method: PaymentMethod = "efectivo"): Payment => ({
  id: nextId("pay"),
  date: iso(2026, 10, 15),
  amount,
  method,
});

/** El subtotal sale de las partidas y el total de subtotal - descuento + envío, salvo que se indiquen. */
const order = (o: Partial<Order> = {}): Order => {
  const items = o.items ?? [item()];
  const subtotal = o.subtotal ?? items.reduce((a, it) => a + it.qty * it.unitPrice, 0);
  const discount = o.discount ?? 0;
  const shipping = o.shipping ?? 0;
  return {
    id: nextId("o"),
    folio: `V-${1000 + seq}`,
    date: iso(2026, 10, 15),
    channel: "tienda",
    customerName: "Cliente",
    branch: "b1",
    status: "pagado",
    payments: [],
    pickup: false,
    ...o,
    items,
    subtotal,
    discount,
    shipping,
    total: o.total ?? subtotal - discount + shipping,
  };
};

const expense = (o: Partial<Expense> = {}): Expense => ({
  id: nextId("e"),
  date: iso(2026, 10, 15),
  category: "otros",
  description: "Gasto",
  amount: 100,
  method: "efectivo",
  ...o,
});

const product = (o: Partial<Product> = {}): Product => ({
  id: "p1",
  sku: "SKU-1",
  name: "Blusa",
  brand: "Marca",
  category: "Blusas",
  cost: 100,
  price: 250,
  sizes: ["M", "L"],
  colors: [{ name: "Negro", hex: "#000000" }],
  minStock: 2,
  active: true,
  createdAt: iso(2026, 1, 1),
  ...o,
});

const OCTUBRE: Range = { from: at(2026, 10, 1, 0), to: at(2026, 10, 31, 23, 59, 59) };

beforeEach(() => {
  applySalesSettings(DEFAULT_SALES);
});

/* ------------------------------------------------------------------ */
/* Periodos                                                             */
/* ------------------------------------------------------------------ */
describe("periodRange", () => {
  const NOW = at(2026, 10, 19, 15, 30);

  it("hoy: desde las 00:00 hasta ahora y el periodo previo es ayer a la misma hora", () => {
    const { cur, prev } = periodRange("hoy", NOW);
    expect(cur.from).toEqual(at(2026, 10, 19, 0));
    expect(cur.to).toEqual(NOW);
    expect(prev.from).toEqual(at(2026, 10, 18, 0));
    expect(prev.to).toEqual(at(2026, 10, 18, 15, 30));
  });

  it("7d: incluye hoy y los 6 días anteriores; el previo son los 7 días de antes", () => {
    const { cur, prev } = periodRange("7d", NOW);
    expect(cur.from).toEqual(at(2026, 10, 13, 0));
    expect(cur.to).toEqual(NOW);
    expect(prev.from).toEqual(at(2026, 10, 6, 0));
    expect(prev.to).toEqual(at(2026, 10, 12, 15, 30));
  });

  it("mes: del día 1 hasta ahora y el previo llega al mismo punto del mes anterior", () => {
    const { cur, prev } = periodRange("mes", NOW);
    expect(cur.from).toEqual(at(2026, 10, 1, 0));
    expect(cur.to).toEqual(NOW);
    expect(prev.from).toEqual(at(2026, 9, 1, 0));
    expect(prev.to).toEqual(at(2026, 9, 19, 15, 30));
  });

  it("mes: el 1 de enero el mes previo es diciembre del año anterior", () => {
    const now = at(2026, 1, 1, 8);
    const { cur, prev } = periodRange("mes", now);
    expect(cur.from).toEqual(at(2026, 1, 1, 0));
    expect(prev.from).toEqual(at(2025, 12, 1, 0));
    expect(prev.to).toEqual(at(2025, 12, 1, 8));
  });

  it("mes: el 31 de marzo el previo se recorta al último día de febrero", () => {
    const now = at(2026, 3, 31, 10);
    const { cur, prev } = periodRange("mes", now);
    expect(cur.from).toEqual(at(2026, 3, 1, 0));
    expect(prev.from).toEqual(at(2026, 2, 1, 0));
    expect(prev.to).toEqual(at(2026, 2, 28, 23, 59, 59, 999));
  });

  it("mes_pasado: mes completo anterior y el previo es el mes de antes", () => {
    const { cur, prev } = periodRange("mes_pasado", NOW);
    expect(cur.from).toEqual(at(2026, 9, 1, 0));
    expect(cur.to).toEqual(at(2026, 9, 30, 23, 59, 59, 999));
    expect(prev.from).toEqual(at(2026, 8, 1, 0));
    expect(prev.to).toEqual(at(2026, 8, 31, 23, 59, 59, 999));
  });

  it("mes_pasado: en enero cruza al año anterior (diciembre y noviembre)", () => {
    const { cur, prev } = periodRange("mes_pasado", at(2026, 1, 1, 8));
    expect(cur.from).toEqual(at(2025, 12, 1, 0));
    expect(cur.to).toEqual(at(2025, 12, 31, 23, 59, 59, 999));
    expect(prev.from).toEqual(at(2025, 11, 1, 0));
    expect(prev.to).toEqual(at(2025, 11, 30, 23, 59, 59, 999));
  });

  it("mes_pasado: el 31 de marzo es febrero completo (28 días en 2026) y el previo es enero", () => {
    const { cur, prev } = periodRange("mes_pasado", at(2026, 3, 31, 10));
    expect(cur.from).toEqual(at(2026, 2, 1, 0));
    expect(cur.to).toEqual(at(2026, 2, 28, 23, 59, 59, 999));
    expect(prev.from).toEqual(at(2026, 1, 1, 0));
    expect(prev.to).toEqual(at(2026, 1, 31, 23, 59, 59, 999));
  });

  it("mes_pasado: respeta febrero de año bisiesto", () => {
    const { cur } = periodRange("mes_pasado", at(2028, 3, 15));
    expect(cur.to).toEqual(at(2028, 2, 29, 23, 59, 59, 999));
  });

  it("90d: incluye hoy y los 89 días anteriores; el previo son los 90 días de antes", () => {
    const { cur, prev } = periodRange("90d", NOW);
    expect(cur.from).toEqual(at(2026, 7, 22, 0));
    expect(cur.to).toEqual(NOW);
    expect(prev.from).toEqual(at(2026, 4, 23, 0));
    expect(prev.to).toEqual(new Date(cur.from.getTime() - 1));
  });

  it("7d y 90d cruzan el cambio de año", () => {
    const now = at(2026, 1, 1, 9);
    expect(periodRange("7d", now).cur.from).toEqual(at(2025, 12, 26, 0));
    expect(periodRange("90d", now).cur.from).toEqual(at(2025, 10, 4, 0));
  });

  it("todos los periodos devuelven rangos ordenados (from <= to) con now fijo", () => {
    const periods: Period[] = ["hoy", "7d", "mes", "mes_pasado", "90d"];
    for (const p of periods) {
      const { cur, prev } = periodRange(p, NOW);
      expect(cur.from.getTime(), p).toBeLessThanOrEqual(cur.to.getTime());
      expect(prev.from.getTime(), p).toBeLessThanOrEqual(prev.to.getTime());
    }
  });

  it("mes_pasado no deja huecos: una venta a las 23:59:59.500 del último día entra al mes", () => {
    const venta = iso(2026, 9, 30, 23, 59, 59, 500);
    const { cur } = periodRange("mes_pasado", NOW);
    expect(inRange(venta, cur)).toBe(true);
  });

  it("el periodo previo de 90d no se traslapa con el actual", () => {
    // inRange es inclusivo en ambos extremos: prev.to = from contaría dos veces el instante de corte.
    const { cur, prev } = periodRange("90d", NOW);
    expect(prev.to.getTime()).toBeLessThan(cur.from.getTime());
  });
});

describe("inRange", () => {
  const r: Range = { from: at(2026, 10, 1, 0), to: at(2026, 10, 31, 23, 59, 59) };

  it("incluye el borde inferior exacto", () => {
    expect(inRange(r.from.toISOString(), r)).toBe(true);
  });

  it("incluye el borde superior exacto", () => {
    expect(inRange(r.to.toISOString(), r)).toBe(true);
  });

  it("excluye 1 ms antes del inicio y 1 ms después del fin", () => {
    expect(inRange(new Date(r.from.getTime() - 1).toISOString(), r)).toBe(false);
    expect(inRange(new Date(r.to.getTime() + 1).toISOString(), r)).toBe(false);
  });

  it("incluye fechas intermedias", () => {
    expect(inRange(iso(2026, 10, 15), r)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Pedidos                                                              */
/* ------------------------------------------------------------------ */
describe("isSale / SALE_STATUSES", () => {
  it("SALE_STATUSES son pagado, enviado y entregado", () => {
    expect([...SALE_STATUSES].sort()).toEqual(["entregado", "enviado", "pagado"]);
  });

  it.each<[OrderStatus, boolean]>([
    ["pagado", true],
    ["enviado", true],
    ["entregado", true],
    ["pendiente", false],
    ["apartado", false],
    ["cancelado", false],
  ])("isSale(%s) = %s", (status, esperado) => {
    expect(isSale(order({ status }))).toBe(esperado);
  });
});

describe("cálculos por pedido", () => {
  it("orderNet resta el descuento al subtotal (sin envío)", () => {
    expect(orderNet(order({ subtotal: 1000, discount: 150, shipping: 80 }))).toBe(850);
  });

  it("orderCost suma cantidad x costo unitario de cada partida", () => {
    const o = order({
      items: [item({ qty: 2, unitCost: 100 }), item({ qty: 3, unitCost: 50 })],
    });
    expect(orderCost(o)).toBe(350);
  });

  it("orderUnits suma las cantidades", () => {
    const o = order({ items: [item({ qty: 2 }), item({ qty: 3 })] });
    expect(orderUnits(o)).toBe(5);
  });

  it("orderPaid suma los pagos y vale 0 sin pagos", () => {
    expect(orderPaid(order({ payments: [pay(300), pay(200, "tarjeta")] }))).toBe(500);
    expect(orderPaid(order())).toBe(0);
  });

  it("orderBalance es total menos pagado", () => {
    const o = order({ status: "apartado", total: 1000, payments: [pay(400)] });
    expect(orderBalance(o)).toBe(600);
  });

  it("orderBalance nunca es negativo si hay sobrepago", () => {
    const o = order({ total: 1000, payments: [pay(1200)] });
    expect(orderBalance(o)).toBe(0);
  });

  it("orderBalance de un pedido cancelado es 0 aunque no tenga pagos o tenga pagos parciales", () => {
    expect(orderBalance(order({ status: "cancelado", total: 1000 }))).toBe(0);
    expect(orderBalance(order({ status: "cancelado", total: 1000, payments: [pay(100)] }))).toBe(0);
  });

  it("orderFees es 0 en efectivo y transferencia con la configuración por defecto", () => {
    const o = order({ payments: [pay(500, "efectivo"), pay(300, "transferencia")] });
    expect(orderFees(o)).toBe(0);
  });

  it("orderFees aplica la comisión por defecto de tarjeta (3.6%)", () => {
    expect(orderFees(order({ payments: [pay(1000, "tarjeta")] }))).toBeCloseTo(36, 10);
  });

  it("orderFees suma comisiones de pagos mixtos", () => {
    const o = order({
      payments: [pay(500, "efectivo"), pay(1000, "tarjeta"), pay(200, "mercadopago")],
    });
    expect(orderFees(o)).toBeCloseTo(36 + 200 * 0.0406, 10);
  });

  it("orderFees usa las comisiones configuradas con applySalesSettings", () => {
    applySalesSettings({
      ...DEFAULT_SALES,
      paymentFees: { ...DEFAULT_SALES.paymentFees, efectivo: 0.01, tarjeta: 0.05 },
    });
    const o = order({ payments: [pay(1000, "efectivo"), pay(1000, "tarjeta")] });
    expect(orderFees(o)).toBeCloseTo(10 + 50, 10);
  });

  it("orderFees vale 0 para un método sin comisión definida", () => {
    const sinPaypal: Partial<typeof DEFAULT_SALES.paymentFees> = { ...DEFAULT_SALES.paymentFees };
    delete sinPaypal.paypal;
    applySalesSettings({
      ...DEFAULT_SALES,
      paymentFees: sinPaypal as typeof DEFAULT_SALES.paymentFees,
    });
    expect(orderFees(order({ payments: [pay(1000, "paypal")] }))).toBe(0);
  });

  it("orderFees vale 0 sin pagos", () => {
    expect(orderFees(order())).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Resumen de ventas y finanzas                                         */
/* ------------------------------------------------------------------ */
const ordenesOctubre = () => [
  order({
    date: iso(2026, 10, 10),
    status: "pagado",
    items: [item({ qty: 2, unitPrice: 500, unitCost: 200 })],
    discount: 100,
    shipping: 50,
    payments: [pay(950, "tarjeta")],
  }),
  order({
    date: iso(2026, 10, 12),
    status: "enviado",
    items: [item({ qty: 1, unitPrice: 300, unitCost: 100 })],
    payments: [pay(300, "efectivo")],
  }),
  // No cuentan: sin pagar, cancelado y fuera de rango.
  order({ date: iso(2026, 10, 11), status: "pendiente" }),
  order({ date: iso(2026, 10, 11), status: "cancelado" }),
  order({ date: iso(2026, 9, 30, 23, 0), status: "pagado" }),
];

describe("salesSummary", () => {
  it("solo suma ventas (pagado/enviado/entregado) dentro del rango", () => {
    const s = salesSummary(ordenesOctubre(), OCTUBRE);
    expect(s.orders).toBe(2);
    expect(s.gross).toBe(1300);
    expect(s.discounts).toBe(100);
    expect(s.sales).toBe(1200);
    expect(s.shippingIncome).toBe(50);
    expect(s.revenue).toBe(1250);
    expect(s.cogs).toBe(500);
    expect(s.grossProfit).toBe(750);
    expect(s.grossMargin).toBeCloseTo(0.6, 10);
    expect(s.fees).toBeCloseTo(950 * 0.036, 10);
    expect(s.units).toBe(3);
    expect(s.avgTicket).toBe(625);
  });

  it("cuenta pedidos entregados", () => {
    const s = salesSummary([order({ status: "entregado" })], OCTUBRE);
    expect(s.orders).toBe(1);
  });

  it("el ticket promedio no divide entre 0 cuando no hay ventas", () => {
    const s = salesSummary([order({ status: "pendiente" })], OCTUBRE);
    expect(s.orders).toBe(0);
    expect(s.avgTicket).toBe(0);
    expect(s.grossMargin).toBe(0);
  });

  it("incluye pedidos exactamente en los bordes del rango", () => {
    const orders = [
      order({ date: OCTUBRE.from.toISOString() }),
      order({ date: OCTUBRE.to.toISOString() }),
    ];
    expect(salesSummary(orders, OCTUBRE).orders).toBe(2);
  });
});

describe("expensesIn / expensesByCategory", () => {
  const gastos = [
    expense({ date: iso(2026, 10, 3), category: "renta", amount: 100 }),
    expense({ date: iso(2026, 10, 20), category: "renta", amount: 50 }),
    expense({ date: iso(2026, 10, 25), category: "publicidad", amount: 70 }),
    expense({ date: iso(2026, 9, 25), category: "renta", amount: 999 }),
  ];

  it("expensesIn filtra por fecha", () => {
    const dentro = expensesIn(gastos, OCTUBRE);
    expect(dentro).toHaveLength(3);
    expect(dentro.every((e) => e.amount !== 999)).toBe(true);
  });

  it("expensesByCategory agrupa por categoría y omite las que no tienen gasto", () => {
    const porCategoria = expensesByCategory(gastos, OCTUBRE);
    expect(porCategoria).toEqual({ renta: 150, publicidad: 70 });
    expect(porCategoria.nomina).toBeUndefined();
  });

  it("expensesByCategory devuelve objeto vacío sin gastos en el rango", () => {
    expect(expensesByCategory(gastos, { from: at(2020, 1, 1), to: at(2020, 1, 31) })).toEqual({});
  });
});

describe("pnl", () => {
  it("calcula ingresos, costo, gastos, comisiones y utilidad operativa", () => {
    const gastos = [
      expense({ date: iso(2026, 10, 2), category: "renta", amount: 100 }),
      expense({ date: iso(2026, 10, 9), category: "publicidad", amount: 50 }),
      expense({ date: iso(2026, 9, 9), category: "renta", amount: 999 }),
    ];
    const p = pnl({ orders: ordenesOctubre(), expenses: gastos }, OCTUBRE);
    const fees = 950 * 0.036;
    expect(p.revenue).toBe(1250);
    expect(p.cogs).toBe(500);
    expect(p.grossProfit).toBe(750);
    expect(p.byCat).toEqual({ renta: 100, publicidad: 50 });
    expect(p.opex).toBe(150);
    expect(p.fees).toBeCloseTo(fees, 10);
    expect(p.operatingProfit).toBeCloseTo(750 - 150 - fees, 10);
    expect(p.operatingMargin).toBeCloseTo((750 - 150 - fees) / 1250, 10);
  });

  it("con gastos mayores a la utilidad bruta la utilidad es negativa", () => {
    const p = pnl(
      {
        orders: [order({ date: iso(2026, 10, 5) })],
        expenses: [expense({ date: iso(2026, 10, 5), amount: 1000 })],
      },
      OCTUBRE,
    );
    expect(p.operatingProfit).toBe(300 - 1000);
    expect(p.operatingMargin).toBeLessThan(0);
  });

  it("sin ventas el margen operativo es 0 aunque haya gastos", () => {
    const p = pnl({ orders: [], expenses: [expense({ date: iso(2026, 10, 5), amount: 200 })] }, OCTUBRE);
    expect(p.revenue).toBe(0);
    expect(p.operatingProfit).toBe(-200);
    expect(p.operatingMargin).toBe(0);
  });
});

describe("breakEven", () => {
  const NOW = at(2026, 10, 19, 12);
  const venta = () =>
    order({
      date: iso(2026, 10, 1),
      items: [item({ qty: 1, unitPrice: 1000, unitCost: 400 })],
      payments: [pay(1000, "efectivo")],
    });

  it("divide los costos fijos de 60 días entre 2 y los cubre con el margen de contribución", () => {
    const gastos = [
      expense({ date: iso(2026, 9, 1), category: "renta", amount: 600 }),
      expense({ date: iso(2026, 9, 5), category: "nomina", amount: 400 }),
      expense({ date: iso(2026, 10, 2), category: "publicidad", amount: 100 }),
      // Fuera de la ventana de 60 días: no cuenta.
      expense({ date: iso(2026, 8, 1), category: "renta", amount: 5000 }),
    ];
    const b = breakEven({ orders: [venta()], expenses: gastos }, NOW);
    expect(b.fixedMonthly).toBe(500);
    // (utilidad bruta 600 - comisiones 0 - variables 100) / ingresos 1000
    expect(b.contributionMargin).toBeCloseTo(0.5, 10);
    expect(b.breakEven).toBeCloseTo(1000, 6);
  });

  it("clasifica renta, nómina, servicios y software como fijos; el resto como variables", () => {
    const gastos = (["renta", "nomina", "servicios", "software"] as const).map((category) =>
      expense({ date: iso(2026, 10, 2), category, amount: 200 }),
    );
    const b = breakEven({ orders: [venta()], expenses: gastos }, NOW);
    expect(b.fixedMonthly).toBe(400);
    expect(b.contributionMargin).toBeCloseTo(0.6, 10);
  });

  it("si el margen de contribución no es positivo el punto de equilibrio es 0", () => {
    const gastos = [
      expense({ date: iso(2026, 10, 2), category: "renta", amount: 600 }),
      expense({ date: iso(2026, 10, 2), category: "publicidad", amount: 2000 }),
    ];
    const b = breakEven({ orders: [venta()], expenses: gastos }, NOW);
    expect(b.contributionMargin).toBeLessThan(0);
    expect(b.breakEven).toBe(0);
    expect(b.fixedMonthly).toBe(300);
  });

  it("sin ventas devuelve margen 0 y equilibrio 0, conservando los fijos mensuales", () => {
    const b = breakEven(
      { orders: [], expenses: [expense({ date: iso(2026, 10, 2), category: "renta", amount: 800 })] },
      NOW,
    );
    expect(b).toEqual({ fixedMonthly: 400, contributionMargin: 0, breakEven: 0 });
  });
});

/* ------------------------------------------------------------------ */
/* Canales y series                                                     */
/* ------------------------------------------------------------------ */
describe("byChannel", () => {
  const ventas = () => [
    order({ channel: "tienda", date: iso(2026, 10, 3), items: [item({ qty: 2, unitPrice: 500, unitCost: 200 })], discount: 100 }),
    order({ channel: "tienda", date: iso(2026, 10, 4), items: [item({ qty: 1, unitPrice: 300, unitCost: 100 })], shipping: 40 }),
    order({ channel: "web", date: iso(2026, 10, 5), items: [item({ qty: 1, unitPrice: 800, unitCost: 300 })] }),
    order({ channel: "web", date: iso(2026, 10, 6), status: "cancelado" }),
    order({ channel: "tienda", date: iso(2026, 9, 6) }),
  ];

  it("devuelve una fila por canal de CHANNELS, en ese orden, aunque no haya ventas", () => {
    const rows = byChannel([], OCTUBRE);
    expect(rows.map((r) => r.channel)).toEqual(CHANNELS);
    expect(rows.every((r) => r.revenue === 0 && r.orders === 0 && r.margin === 0 && r.avgTicket === 0)).toBe(true);
  });

  it("incluye mayoreo aunque la configuración de ventas no lo use", () => {
    expect(DEFAULT_SALES.channels).not.toContain("mayoreo");
    expect(byChannel(ventas(), OCTUBRE).some((r) => r.channel === "mayoreo")).toBe(true);
  });

  it("suma ingresos (neto + envío), costo, unidades y pedidos solo de ventas en rango", () => {
    const rows = byChannel(ventas(), OCTUBRE);
    const tienda = rows.find((r) => r.channel === "tienda")!;
    expect(tienda.orders).toBe(2);
    expect(tienda.revenue).toBe(900 + 340);
    expect(tienda.units).toBe(3);
    expect(tienda.cogs).toBe(500);
    expect(tienda.grossProfit).toBe(740);
    expect(tienda.margin).toBeCloseTo(740 / 1240, 10);
    expect(tienda.avgTicket).toBe(620);

    const web = rows.find((r) => r.channel === "web")!;
    expect(web.orders).toBe(1);
    expect(web.revenue).toBe(800);
    expect(web.avgTicket).toBe(800);
  });

  it("los canales sin ventas quedan en 0 sin NaN", () => {
    const rows = byChannel(ventas(), OCTUBRE);
    for (const ch of ["instagram", "whatsapp", "mayoreo"]) {
      const row = rows.find((r) => r.channel === ch)!;
      expect(row.revenue).toBe(0);
      expect(row.margin).toBe(0);
      expect(row.avgTicket).toBe(0);
    }
  });
});

describe("dailySeries", () => {
  it("genera una fila por día del rango (inclusive) con todos los canales en 0", () => {
    const rows = dailySeries([], { from: at(2026, 10, 13, 0), to: at(2026, 10, 19, 15, 30) });
    expect(rows.map((r) => r.date)).toEqual([
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
      "2026-10-19",
    ]);
    for (const row of rows) {
      expect(row).toMatchObject({ tienda: 0, web: 0, whatsapp: 0, instagram: 0, mayoreo: 0, total: 0, profit: 0 });
    }
  });

  it("el canal mayoreo está presente en cada fila aunque el negocio no lo use", () => {
    const rows = dailySeries([], { from: at(2026, 10, 13, 0), to: at(2026, 10, 14, 0) });
    expect(rows.every((r) => r.mayoreo === 0)).toBe(true);
  });

  it("acomoda ingresos y utilidad por día y canal; los días sin ventas quedan en 0", () => {
    const r: Range = { from: at(2026, 10, 13, 0), to: at(2026, 10, 19, 15, 30) };
    const orders = [
      order({ channel: "tienda", date: iso(2026, 10, 15, 9), items: [item({ qty: 1, unitPrice: 500, unitCost: 200 })] }),
      order({ channel: "web", date: iso(2026, 10, 15, 20), items: [item({ qty: 1, unitPrice: 800, unitCost: 300 })], shipping: 50 }),
      order({ channel: "mayoreo", date: iso(2026, 10, 19, 11), items: [item({ qty: 10, unitPrice: 100, unitCost: 60 })], discount: 100 }),
      order({ channel: "tienda", date: iso(2026, 10, 16), status: "pendiente" }),
      order({ channel: "tienda", date: iso(2026, 10, 12, 23, 0) }),
    ];
    const rows = dailySeries(orders, r);
    const dia = (d: string) => rows.find((x) => x.date === d)!;
    expect(dia("2026-10-15")).toMatchObject({ tienda: 500, web: 850, total: 1350, profit: 1350 - 500 });
    expect(dia("2026-10-19")).toMatchObject({ mayoreo: 900, total: 900, profit: 300 });
    expect(dia("2026-10-16").total).toBe(0);
    expect(dia("2026-10-13").total).toBe(0);
    expect(rows.find((x) => x.date === "2026-10-12")).toBeUndefined();
  });

  it("cruza el cambio de mes", () => {
    const rows = dailySeries([], { from: at(2026, 10, 30, 0), to: at(2026, 11, 2, 12) });
    expect(rows.map((r) => r.date)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("cruza el cambio de año", () => {
    const rows = dailySeries([], { from: at(2025, 12, 30, 0), to: at(2026, 1, 2, 12) });
    expect(rows.map((r) => r.date)).toEqual(["2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"]);
  });

  it("un rango que empieza a media tarde arranca en el día de esa fecha", () => {
    const rows = dailySeries([], { from: at(2026, 10, 13, 15), to: at(2026, 10, 14, 15) });
    expect(rows.map((r) => r.date)).toEqual(["2026-10-13", "2026-10-14"]);
  });

  it("asigna una venta de las 23:30 al día local correcto", () => {
    const r: Range = { from: at(2026, 10, 13, 0), to: at(2026, 10, 14, 23, 59, 59) };
    const rows = dailySeries([order({ date: iso(2026, 10, 14, 23, 30) })], r);
    expect(rows.find((x) => x.date === "2026-10-14")!.total).toBe(500);
    expect(rows.find((x) => x.date === "2026-10-13")!.total).toBe(0);
  });

  it("con periodRange('7d') produce 7 filas", () => {
    const now = at(2026, 10, 19, 15, 30);
    expect(dailySeries([], periodRange("7d", now).cur)).toHaveLength(7);
  });
});

describe("monthlySeries", () => {
  const NOW = at(2026, 2, 15, 10);

  it("devuelve los meses hacia atrás hasta el actual (parcial), cruzando el año", () => {
    const rows = monthlySeries({ orders: [], expenses: [] }, 4, NOW);
    expect(rows.map((r) => r.month)).toEqual(["Nov", "Dic", "Ene", "Feb"]);
    expect(rows.map((r) => r.partial)).toEqual([false, false, false, true]);
  });

  it("por omisión devuelve 4 meses y con months=1 solo el actual", () => {
    expect(monthlySeries({ orders: [], expenses: [] }, undefined, NOW)).toHaveLength(4);
    const uno = monthlySeries({ orders: [], expenses: [] }, 1, NOW);
    expect(uno).toHaveLength(1);
    expect(uno[0].partial).toBe(true);
  });

  it("asigna ventas y gastos a su mes y excluye lo posterior a now en el mes actual", () => {
    const orders = [
      order({ date: iso(2025, 11, 20), items: [item({ qty: 1, unitPrice: 1000, unitCost: 400 })] }),
      order({ date: iso(2025, 12, 31, 23, 0), items: [item({ qty: 1, unitPrice: 600, unitCost: 200 })], payments: [pay(600, "tarjeta")] }),
      order({ date: iso(2026, 1, 1, 0, 30), items: [item({ qty: 1, unitPrice: 300, unitCost: 100 })] }),
      order({ date: iso(2026, 2, 10), items: [item({ qty: 1, unitPrice: 200, unitCost: 50 })] }),
      order({ date: iso(2026, 2, 20), items: [item({ qty: 1, unitPrice: 9999, unitCost: 1 })] }),
    ];
    const expenses = [expense({ date: iso(2025, 12, 10), amount: 100 })];
    const [nov, dic, ene, feb] = monthlySeries({ orders, expenses }, 4, NOW);

    expect(nov).toMatchObject({ ingresos: 1000, costo: 400, gastos: 0, utilidad: 600 });
    expect(dic.ingresos).toBe(600);
    expect(dic.costo).toBe(200);
    expect(dic.gastos).toBeCloseTo(100 + 600 * 0.036, 10);
    expect(dic.utilidad).toBeCloseTo(600 - 200 - 100 - 600 * 0.036, 10);
    expect(dic.margen).toBeCloseTo(dic.utilidad / 600, 10);
    expect(ene).toMatchObject({ ingresos: 300, costo: 100, utilidad: 200 });
    expect(feb).toMatchObject({ ingresos: 200, costo: 50, utilidad: 150 });
  });

  it("sin datos todos los meses quedan en 0 y sin NaN", () => {
    for (const row of monthlySeries({ orders: [], expenses: [] }, 6, NOW)) {
      expect(row).toMatchObject({ ingresos: 0, costo: 0, gastos: 0, utilidad: 0, margen: 0 });
    }
  });
});

/* ------------------------------------------------------------------ */
/* Productos y tallas                                                   */
/* ------------------------------------------------------------------ */
describe("productStats", () => {
  const pedidos = () => [
    order({
      date: iso(2026, 10, 10),
      items: [
        item({ productId: "p1", qty: 2, unitPrice: 500, unitCost: 200 }),
        item({ productId: "p2", qty: 1, unitPrice: 300, unitCost: 100, size: "L" }),
      ],
      discount: 130,
    }),
    order({
      date: iso(2026, 10, 12),
      status: "enviado",
      items: [item({ productId: "p1", qty: 1, unitPrice: 500, unitCost: 200, size: "L" })],
    }),
    order({ date: iso(2026, 10, 13), status: "cancelado", items: [item({ productId: "p3" })] }),
    order({ date: iso(2026, 10, 14), status: "pendiente", items: [item({ productId: "p3" })] }),
    order({ date: iso(2026, 9, 14), items: [item({ productId: "p4" })] }),
  ];

  it("agrega unidades, ingresos (prorrateando el descuento), costo y pedidos por producto", () => {
    const stats = productStats(pedidos(), OCTUBRE);
    expect([...stats.keys()]).toEqual(["p1", "p2"]);
    // El descuento de 130 sobre 1300 de subtotal es del 10%.
    const p1 = stats.get("p1")!;
    expect(p1.units).toBe(3);
    expect(p1.revenue).toBeCloseTo(2 * 500 * 0.9 + 500, 10);
    expect(p1.cogs).toBe(600);
    expect(p1.orders).toBe(2);
    const p2 = stats.get("p2")!;
    expect(p2).toMatchObject({ units: 1, cogs: 100, orders: 1 });
    expect(p2.revenue).toBeCloseTo(270, 10);
  });

  it("ignora cancelados, no vendidos y fuera de rango", () => {
    const stats = productStats(pedidos(), OCTUBRE);
    expect(stats.has("p3")).toBe(false);
    expect(stats.has("p4")).toBe(false);
  });

  it("un pedido con subtotal 0 no produce NaN", () => {
    const gratis = order({ items: [item({ unitPrice: 0, unitCost: 50 })], subtotal: 0 });
    const row = productStats([gratis], OCTUBRE).get("p1")!;
    expect(row.revenue).toBe(0);
    expect(Number.isNaN(row.revenue)).toBe(false);
  });

  it("devuelve un mapa vacío sin pedidos", () => {
    expect(productStats([], OCTUBRE).size).toBe(0);
  });

  it("'orders' cuenta pedidos distintos, no partidas del mismo producto", () => {
    const o = order({
      date: iso(2026, 10, 10),
      items: [item({ size: "M", qty: 1 }), item({ size: "L", qty: 1 })],
    });
    expect(productStats([o], OCTUBRE).get("p1")!.orders).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* Cuentas por cobrar                                                   */
/* ------------------------------------------------------------------ */
describe("receivables", () => {
  it("devuelve solo pedidos no cancelados con saldo pendiente", () => {
    const conSaldo = order({ status: "pendiente", total: 1000, payments: [pay(400)] });
    const sinPagos = order({ status: "apartado", total: 500 });
    const entregadoDebe = order({ status: "entregado", total: 700, payments: [pay(100)] });
    const pagado = order({ status: "pagado", total: 500, payments: [pay(500)] });
    const sobrepago = order({ status: "pagado", total: 500, payments: [pay(600)] });
    const cancelado = order({ status: "cancelado", total: 800 });
    const resultado = receivables([conSaldo, sinPagos, entregadoDebe, pagado, sobrepago, cancelado]);
    expect(resultado).toEqual([conSaldo, sinPagos, entregadoDebe]);
  });

  it("los saldos devueltos son todos positivos", () => {
    const lista = [
      order({ status: "pendiente", total: 1000, payments: [pay(400)] }),
      order({ status: "apartado", total: 500, payments: [pay(500)] }),
    ];
    for (const o of receivables(lista)) expect(orderBalance(o)).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* Inventario                                                           */
/* ------------------------------------------------------------------ */
describe("inventoryValue", () => {
  const p1 = product({ id: "p1", cost: 100, price: 250, sizes: ["M", "L"] });
  const p2 = product({
    id: "p2",
    cost: 50,
    price: 120,
    sizes: ["Única"],
    colors: [
      { name: "Rojo", hex: "#ff0000" },
      { name: "Azul", hex: "#0000ff" },
    ],
  });

  it("valúa costo y precio de venta por unidad sumando todas las sucursales", () => {
    const stock: StockMap = {
      "p1|Negro|M": { a: 3, b: 2 },
      "p1|Negro|L": { a: 1 },
      "p2|Rojo|Única": { b: 4 },
      "p2|Azul|Única": {},
      // Variante que no pertenece a ningún producto: se ignora.
      "zz|X|Y": { a: 99 },
    };
    expect(inventoryValue([p1, p2], stock)).toEqual({
      units: 10,
      cost: 6 * 100 + 4 * 50,
      retail: 6 * 250 + 4 * 120,
    });
  });

  it("una sucursal ausente cuenta como 0 y una variante sin fila de stock también", () => {
    const stock: StockMap = { "p1|Negro|M": { a: 5 } };
    expect(inventoryValue([p1], stock)).toEqual({ units: 5, cost: 500, retail: 1250 });
    expect(inventoryValue([p1], {})).toEqual({ units: 0, cost: 0, retail: 0 });
  });

  it("sin productos devuelve ceros", () => {
    expect(inventoryValue([], { "p1|Negro|M": { a: 3 } })).toEqual({ units: 0, cost: 0, retail: 0 });
  });
});

describe("replenishment", () => {
  const NOW = at(2026, 10, 19, 12);
  const prod = product({ id: "p1", cost: 100, sizes: ["M"] });
  const ventas = (qty: number, o: Partial<Order> = {}) =>
    order({ date: iso(2026, 10, 10), items: [item({ productId: "p1", qty })], ...o });

  it("calcula venta diaria, cobertura y sugerido con las ventas de los últimos 30 días", () => {
    const stock: StockMap = { "p1|Negro|M": { a: 3, b: 2 } };
    const [row] = replenishment([prod], stock, [ventas(30)], NOW);
    expect(row.product).toBe(prod);
    expect(row.onHand).toBe(5);
    expect(row.sold30).toBe(30);
    expect(row.perDay).toBe(1);
    expect(row.coverageDays).toBe(5);
    // Cubrir 45 días: 45 - 5 en existencia.
    expect(row.suggested).toBe(40);
    expect(row.capital).toBe(500);
  });

  it("no sugiere reposición si el stock ya cubre 45 días", () => {
    const stock: StockMap = { "p1|Negro|M": { a: 100 } };
    const [row] = replenishment([prod], stock, [ventas(30)], NOW);
    expect(row.coverageDays).toBe(100);
    expect(row.suggested).toBe(0);
  });

  it("sin stock y con ventas la cobertura es 0 y se sugiere cubrir 45 días", () => {
    const [row] = replenishment([prod], {}, [ventas(30)], NOW);
    expect(row.onHand).toBe(0);
    expect(row.coverageDays).toBe(0);
    expect(row.suggested).toBe(45);
    expect(row.capital).toBe(0);
  });

  it("sin ventas recientes la cobertura es infinita y no se sugiere nada", () => {
    const stock: StockMap = { "p1|Negro|M": { a: 8 } };
    const [row] = replenishment([prod], stock, [], NOW);
    expect(row.sold30).toBe(0);
    expect(row.perDay).toBe(0);
    expect(row.coverageDays).toBe(Infinity);
    expect(row.suggested).toBe(0);
    expect(row.capital).toBe(800);
  });

  it("solo cuentan ventas del producto, en la ventana de 30 días y con estatus de venta", () => {
    const stock: StockMap = { "p1|Negro|M": { a: 10 } };
    const orders = [
      ventas(3),
      ventas(4, { date: at(2026, 9, 19, 12).toISOString() }), // borde inferior exacto: cuenta
      ventas(100, { date: iso(2026, 9, 10) }), // fuera de la ventana
      ventas(100, { status: "cancelado" }),
      ventas(100, { status: "pendiente" }),
      order({ date: iso(2026, 10, 10), items: [item({ productId: "otro", qty: 100 })] }),
    ];
    const [row] = replenishment([prod], stock, orders, NOW);
    expect(row.sold30).toBe(7);
  });

  it("devuelve una fila por producto en el mismo orden", () => {
    const otro = product({ id: "p2", sizes: ["M"] });
    const filas = replenishment([prod, otro], {}, [], NOW);
    expect(filas.map((f) => f.product.id)).toEqual(["p1", "p2"]);
  });
});

/* ------------------------------------------------------------------ */
/* Listas vacías                                                        */
/* ------------------------------------------------------------------ */
describe("listas vacías", () => {
  /** Recolecta todos los números de una estructura (objetos, arreglos y Map). */
  const numeros = (v: unknown): number[] => {
    if (typeof v === "number") return [v];
    if (v instanceof Map) return [...v.values()].flatMap(numeros);
    if (Array.isArray(v)) return v.flatMap(numeros);
    if (v && typeof v === "object") return Object.values(v).flatMap(numeros);
    return [];
  };
  const NOW = at(2026, 10, 19, 12);
  const vacio = { orders: [] as Order[], expenses: [] as Expense[] };

  const casos: [string, () => unknown][] = [
    ["salesSummary", () => salesSummary([], OCTUBRE)],
    ["expensesByCategory", () => expensesByCategory([], OCTUBRE)],
    ["pnl", () => pnl(vacio, OCTUBRE)],
    ["breakEven", () => breakEven(vacio, NOW)],
    ["byChannel", () => byChannel([], OCTUBRE)],
    ["dailySeries", () => dailySeries([], OCTUBRE)],
    ["monthlySeries", () => monthlySeries(vacio, 4, NOW)],
    ["productStats", () => productStats([], OCTUBRE)],
    ["receivables", () => receivables([])],
    ["inventoryValue", () => inventoryValue([], {})],
    ["replenishment", () => replenishment([], {}, [], NOW)],
  ];

  it.each(casos)("%s no devuelve NaN ni Infinity", (_nombre, fn) => {
    for (const n of numeros(fn())) expect(Number.isFinite(n)).toBe(true);
  });

  it("periodRange con cada periodo devuelve fechas válidas", () => {
    const periods: Period[] = ["hoy", "7d", "mes", "mes_pasado", "90d"];
    for (const p of periods) {
      const { cur, prev } = periodRange(p, NOW);
      for (const d of [cur.from, cur.to, prev.from, prev.to]) expect(Number.isNaN(d.getTime())).toBe(false);
    }
  });
});
