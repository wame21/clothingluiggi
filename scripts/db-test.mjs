// Pruebas de la base de datos contra el Supabase LOCAL (pnpm exec supabase start).
// Uso: pnpm exec supabase db reset && pnpm db:test
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const raw = execSync("pnpm exec supabase status -o json", { encoding: "utf8" });
const status = JSON.parse(raw.slice(raw.indexOf("{")));
const URL = status.API_URL;
const KEY = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
if (!URL.includes("127.0.0.1") && !URL.includes("localhost")) throw new Error("Solo se ejecuta contra Supabase local");

const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
const expectError = async (name, promise, match) => {
  const { error } = await promise;
  check(name, !!error && (!match || match.test(error.message)), error ? error.message : "no hubo error");
};

async function user(email, name) {
  const c = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signUp({ email, password: "Prueba123!", options: { data: { name } } });
  if (error) throw error;
  await c.auth.signInWithPassword({ email, password: "Prueba123!" });
  return c;
}

const stamp = Date.now();
const anon = createClient(URL, KEY, { auth: { persistSession: false } });
const { data: ownerBefore } = await anon.rpc("owner_exists");
check("owner_exists antes del alta = false", ownerBefore === false);

const owner = await user(`dueno${stamp}@luiggi.test`, "Luiggi");
const seller = await user(`karla${stamp}@luiggi.test`, "Karla");
const other = await user(`extra${stamp}@luiggi.test`, "Extraño");

const { data: ownerProfile } = await owner.from("profiles").select("*").eq("email", `dueno${stamp}@luiggi.test`).single();
check("primer usuario es dueño", ownerProfile?.role === "dueno");
const { data: sellerProfile } = await seller.from("profiles").select("*").single();
check("segundo usuario queda pendiente", sellerProfile?.role === "pendiente");

const { data: pendingProducts } = await seller.from("products").select("id");
check("pendiente no ve productos", Array.isArray(pendingProducts) && pendingProducts.length === 0);
await expectError("pendiente no puede vender", seller.rpc("create_order", { p: {} }), /No autorizado/);

const { error: approveErr } = await owner.rpc("set_member", { p_id: sellerProfile.id, p_role: "vendedor", p_branch: "andara" });
check("dueño aprueba vendedor", !approveErr, approveErr?.message);
await expectError("vendedor no puede autoasignarse", seller.rpc("set_member", { p_id: sellerProfile.id, p_role: "dueno", p_branch: "andara" }));

// Catálogo
const { data: product, error: pErr } = await owner
  .from("products")
  .insert({ sku: "T-001", name: "Polo prueba", brand: "Pavini", category: "Polos", cost: 255, price: 599, sizes: ["S", "M"], colors: [{ name: "Negro", hex: "#111" }] })
  .select()
  .single();
check("dueño da de alta producto", !pErr, pErr?.message);
const { count: rows } = await owner.from("stock").select("*", { count: "exact", head: true }).eq("product_id", product.id);
check("trigger crea 2 tallas × 3 ubicaciones", rows === 6, `${rows} filas`);
await expectError("vendedor no puede dar de alta productos", seller.from("products").insert({ sku: "X", name: "X", category: "Polos", price: 1, sizes: ["M"] }).select().single());
const { data: sellerEdit } = await seller.from("products").update({ price: 1 }).eq("id", product.id).select();
check("vendedor no puede cambiar precios", Array.isArray(sellerEdit) && sellerEdit.length === 0);

const vk = `${product.id}|Negro|M`;
await expectError("vendedor no registra entradas", seller.rpc("move_stock", { p_entries: [{ variantKey: vk, qty: 5 }], p_branch: "andara", p_type: "entrada" }), /dueño/);
const { error: inErr } = await owner.rpc("move_stock", { p_entries: [{ variantKey: vk, qty: 3 }], p_branch: "andara", p_type: "entrada", p_ref: "OC-1" });
check("dueño registra entrada", !inErr, inErr?.message);

const item = (qty) => ({ productId: product.id, variantKey: vk, name: "Polo prueba", color: "Negro", size: "M", qty, unitPrice: 599, unitCost: 255, listPrice: 599 });
const order = (qty, extra = {}) => ({
  channel: "tienda",
  customerName: "Público general",
  branch: "andara",
  items: [item(qty)],
  payments: [{ amount: 599 * qty, method: "efectivo" }],
  status: "entregado",
  seller: "Karla",
  ...extra,
});

const { data: o1, error: o1Err } = await seller.rpc("create_order", { p: order(1) });
check("vendedor cobra en POS", !o1Err && o1?.folio?.startsWith("LB-"), o1Err?.message ?? o1?.folio);
await expectError("no permite sobreventa", seller.rpc("create_order", { p: order(5) }), /Sin existencia/);

// Ventas simultáneas por las 2 últimas piezas: solo una debe pasar si piden 2 cada una
const [a, b] = await Promise.all([seller.rpc("create_order", { p: order(2) }), owner.rpc("create_order", { p: order(2) })]);
check("ventas simultáneas no sobrevenden", [a, b].filter((r) => !r.error).length === 1, [a.error?.message, b.error?.message].filter(Boolean).join(" | "));
const { data: st } = await owner.from("stock").select("qty").eq("variant_key", vk).eq("branch", "andara").single();
check("existencia final = 0", st?.qty === 0, `qty=${st?.qty}`);

const sold = a.error ? b.data : a.data;
const { error: cErr } = await owner.rpc("set_order_status", { p_order: sold.id, p_status: "cancelado" });
const { data: st2 } = await owner.from("stock").select("qty").eq("variant_key", vk).eq("branch", "andara").single();
check("cancelar regresa las piezas", !cErr && st2?.qty === 2, cErr?.message ?? `qty=${st2?.qty}`);

// Pagos y apartados
const layawayInput = { ...order(1), channel: "whatsapp", payments: [{ amount: 300, method: "transferencia" }] };
delete layawayInput.status;
const { data: layaway } = await seller.rpc("create_order", { p: layawayInput });
check("anticipo deja el pedido apartado", layaway?.status === "apartado", layaway?.status);
const { data: paid } = await seller.rpc("add_payment", { p_order: layaway.id, p_payment: { amount: 299, method: "transferencia" } });
check("liquidar lo marca pagado", paid?.status === "pagado", paid?.status);

// Clientes, cotización y conversión
const { data: cust, error: custErr } = await seller
  .from("customers")
  .insert({ name: "Brenda Soto", business: "Soto Men's Store", phone: "667 000 0000", city: "Culiacán", state: "Sinaloa", type: "distribuidor" })
  .select()
  .single();
check("vendedor registra cliente", !custErr, custErr?.message);
await owner.rpc("move_stock", { p_entries: [{ variantKey: vk, qty: 20 }], p_branch: "bodega", p_type: "entrada" });
const quote = {
  customerId: cust.id,
  customerName: cust.business,
  items: [{ ...item(12), unitPrice: 469 }],
  tierId: "mayoreo",
  subtotalList: 7188,
  discount: 1560,
  subtotal: 5628,
  shipping: 280,
  total: 5908,
  depositPct: 0.5,
  status: "enviada",
  validUntil: new Date(Date.now() + 7 * 864e5).toISOString(),
};
const { data: q, error: qErr } = await seller.rpc("save_quote", { p: quote });
check("folio de cotización", !qErr && q?.folio === "COT-0001", qErr?.message ?? q?.folio);
const { data: conv, error: convErr } = await seller.rpc("convert_quote", { p_quote: q.id, p_deposit: { amount: 2954, method: "transferencia", note: "Anticipo" } });
check("cotización → pedido apartado", !convErr && conv?.status === "apartado" && conv?.channel === "mayoreo", convErr?.message ?? conv?.status);
await expectError("no se convierte dos veces", seller.rpc("convert_quote", { p_quote: q.id, p_deposit: {} }), /ya es un pedido/);

// Traspaso y conteo
const { error: trErr } = await seller.rpc("transfer_stock", { p_entries: [{ variantKey: vk, qty: 3 }], p_from: "bodega", p_to: "bamoa" });
check("traspaso bodega → Bamoa", !trErr, trErr?.message);
const { data: changed, error: cntErr } = await seller.rpc("set_stock_count", { p_branch: "bamoa", p_entries: [{ variantKey: vk, qty: 10 }] });
check("conteo físico fija existencia", !cntErr && changed === 1, cntErr?.message);

// Gastos: solo dueño
const { error: exErr } = await owner.from("expenses").insert({ category: "renta", description: "Renta Andara", amount: 22000, method: "transferencia" });
check("dueño registra gasto", !exErr, exErr?.message);
const { data: sellerExpenses } = await seller.from("expenses").select("*");
check("vendedor no ve gastos", Array.isArray(sellerExpenses) && sellerExpenses.length === 0);
await expectError("vendedor no registra gastos", seller.from("expenses").insert({ category: "otros", description: "x", amount: 1, method: "efectivo" }).select().single());

const { data: strangerOrders } = await other.from("orders").select("id");
check("usuario pendiente no ve pedidos", Array.isArray(strangerOrders) && strangerOrders.length === 0);
const { data: team } = await owner.from("profiles").select("id");
check("dueño ve al equipo", team?.length === 3);
const { data: movs } = await owner.from("movements").select("type");
check("kardex registra movimientos", (movs?.length ?? 0) >= 8, `${movs?.length} movimientos`);
const { data: cfg } = await seller.from("settings").select("value").eq("key", "wholesale").single();
check("configuración de mayoreo disponible", cfg?.value?.tiers?.length === 4);

console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("✗")) ? 1 : 0);
