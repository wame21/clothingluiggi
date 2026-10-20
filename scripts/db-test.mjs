// Pruebas de la base de datos contra el Supabase LOCAL (pnpm exec supabase start).
// Uso: pnpm exec supabase db reset && pnpm db:test
// Crea dos negocios y verifica el aislamiento entre ellos, los folios por negocio y las reglas de rol.
import { check, expectDenied, expectError, inviteLookup, mail, newClient, report, signUp, user } from "./db-helpers.mjs";

// ---------------------------------------------------------------------------
// Alta de negocios y usuarios
// ---------------------------------------------------------------------------
const anon = newClient(`anon-${Date.now()}`);
const { data: unknownCode } = await inviteLookup(anon, "ZZZZZZZZ");
check("invite-lookup de un código inexistente = null", unknownCode === null);
await expectError("anon ya no consulta códigos directo en la base", anon.rpc("invite_lookup", { p_code: "ZZZZZZZZ", p_key: "x" }));
const { error: legacyErr } = await anon.rpc("owner_exists");
check("owner_exists ya no existe", !!legacyErr);

const noMeta = await signUp(mail("sin-datos"), { name: "Sin datos" });
check("alta sin negocio ni código se rechaza", !!noMeta.error, noMeta.error?.message);
const badCode = await signUp(mail("mal-codigo"), { name: "Mal código", invite_code: "ZZZZZZZZ" });
check("alta con código inválido se rechaza", !!badCode.error, badCode.error?.message);

const ownerA = await user(mail("dueno-a"), { name: "Dueña Alfa", business_name: "Boutique Alfa" });
const ownerB = await user(mail("dueno-b"), { name: "Dueño Beta", business_name: "Boutique Beta" });

const { data: bizA } = await ownerA.db.from("businesses").select("*").single();
const { data: bizB } = await ownerB.db.from("businesses").select("*").single();
check("alta por business_name crea el negocio", bizA?.name === "Boutique Alfa" && bizB?.name === "Boutique Beta");
check("cada negocio es distinto", !!bizA && !!bizB && bizA.id !== bizB.id);
check("folios iniciales por defecto", bizA?.order_prefix === "V-" && bizA?.next_order_folio === 1001 && bizA?.quote_prefix === "COT-" && bizA?.next_quote_folio === 1);
check("código de invitación de 8 caracteres [A-Z2-9]", /^[A-Z2-9]{8}$/.test(bizA?.invite_code ?? "") && /^[A-Z2-9]{8}$/.test(bizB?.invite_code ?? ""));
check("códigos de invitación distintos", bizA?.invite_code !== bizB?.invite_code);

const { data: profA } = await ownerA.db.from("profiles").select("*").eq("id", ownerA.id).single();
check("quien crea el negocio es dueño", profA?.role === "dueno" && profA?.business_id === bizA.id);

const { data: branchesA } = await ownerA.db.from("branches").select("*");
check("negocio nuevo trae una sucursal principal", branchesA?.length === 1 && branchesA[0].pos && branchesA[0].is_warehouse, `${branchesA?.length} sucursales`);
check("el dueño queda asignado a la sucursal principal", profA?.branch === branchesA?.[0]?.id);
const principalA = branchesA[0];
const { data: branchesB } = await ownerB.db.from("branches").select("*");
const principalB = branchesB[0];
const { data: cfgA } = await ownerA.db.from("settings").select("key, value");
check("configuración inicial: profile, catalog, sales, wholesale", ["profile", "catalog", "sales", "wholesale"].every((k) => cfgA?.some((r) => r.key === k)), cfgA?.map((r) => r.key).join(","));
check("mayoreo viene desactivado", cfgA?.find((r) => r.key === "wholesale")?.value?.enabled === false);

const { data: lookup } = await inviteLookup(anon, bizA.invite_code.toLowerCase());
check("invite-lookup devuelve el nombre sin distinguir mayúsculas", lookup === "Boutique Alfa", String(lookup));

// El vendedor entra con el código en minúsculas; el pendiente con el código tal cual.
const seller = await user(mail("karla"), { name: "Karla", invite_code: bizA.invite_code.toLowerCase() });
const pending = await user(mail("pendiente"), { name: "Pendiente", invite_code: bizA.invite_code });
const { data: sellerProfile } = await seller.db.from("profiles").select("*").eq("id", seller.id).single();
check("alta por invite_code queda pendiente en ese negocio", sellerProfile?.role === "pendiente" && sellerProfile?.business_id === bizA.id);

// ---------------------------------------------------------------------------
// Pendiente: sin acceso hasta que el dueño apruebe
// ---------------------------------------------------------------------------
const { data: pendingProducts } = await seller.db.from("products").select("id");
check("pendiente no ve productos", Array.isArray(pendingProducts) && pendingProducts.length === 0);
const { data: pendingBiz } = await pending.db.from("businesses").select("id");
check("pendiente no lee el negocio", Array.isArray(pendingBiz) && pendingBiz.length === 0);
const { data: pendingCfg } = await pending.db.from("settings").select("key");
check("pendiente no lee la configuración", Array.isArray(pendingCfg) && pendingCfg.length === 0);
await expectError("pendiente no puede vender", seller.db.rpc("create_order", { p: {} }), /No autorizado/);

// ---------------------------------------------------------------------------
// Equipo y sucursales (negocio A)
// ---------------------------------------------------------------------------
const { data: centro, error: centroErr } = await ownerA.db
  .from("branches")
  .insert({ name: "Sucursal Centro", short: "Centro", pos: true, sort: 1 })
  .select()
  .single();
check("dueño da de alta una sucursal", !centroErr && !!centro?.id, centroErr?.message);
await expectDenied("vendedor no da de alta sucursales", seller.db.from("branches").insert({ name: "Intrusa", short: "X" }).select());
await expectError("solo una sucursal surte mayoreo por negocio", ownerA.db.from("branches").update({ is_warehouse: true }).eq("id", centro.id).select());

await expectError("vendedor no puede autoasignarse", seller.db.rpc("set_member", { p_id: seller.id, p_role: "dueno", p_branch: centro.id }));
await expectError("el dueño no cambia su propio rol", ownerA.db.rpc("set_member", { p_id: ownerA.id, p_role: "vendedor", p_branch: null }), /propio rol/);
await expectError("no se puede nombrar a otro dueño", ownerA.db.rpc("set_member", { p_id: seller.id, p_role: "dueno", p_branch: null }), /Solo puede haber un dueño/);
await expectError("set_member rechaza una sucursal de otro negocio", ownerA.db.rpc("set_member", { p_id: seller.id, p_role: "vendedor", p_branch: principalB.id }), /Sucursal inválida/);
const { error: approveErr } = await ownerA.db.rpc("set_member", { p_id: seller.id, p_role: "vendedor", p_branch: centro.id });
check("dueño aprueba vendedor en una sucursal", !approveErr, approveErr?.message);
const { data: sellerAfter } = await seller.db.from("profiles").select("*").eq("id", seller.id).single();
check("el vendedor queda con su rol y sucursal", sellerAfter?.role === "vendedor" && sellerAfter?.branch === centro.id);

// ---------------------------------------------------------------------------
// Catálogo e inventario (negocio A)
// ---------------------------------------------------------------------------
const colors = [{ name: "Negro", hex: "#111111" }];
const { data: pA, error: pAErr } = await ownerA.db
  .from("products")
  .insert({ sku: "T-001", name: "Polo prueba", brand: "Marca", category: "Polos", price: 599, sizes: ["S", "M"], colors, woo_id: 1 })
  .select()
  .single();
check("dueño da de alta producto", !pAErr, pAErr?.message);
await ownerA.db.from("product_costs").insert({ product_id: pA.id, cost: 255 });
const stockRows = async (db, product) => (await db.from("stock").select("*", { count: "exact", head: true }).eq("product_id", product)).count;
check("trigger crea 2 tallas × 2 sucursales", (await stockRows(ownerA.db, pA.id)) === 4);
const { data: bodega, error: bodegaErr } = await ownerA.db.from("branches").insert({ name: "Sucursal Norte", short: "Norte", pos: false, sort: 2 }).select().single();
check("sucursal nueva se crea sin punto de venta", !bodegaErr && bodega?.pos === false, bodegaErr?.message);
check("sucursal nueva abre existencia en 0 de los productos existentes", (await stockRows(ownerA.db, pA.id)) === 6);
await expectError("woo_id es único dentro del negocio", ownerA.db.from("products").insert({ sku: "T-002", name: "Repetido", category: "Polos", price: 1, sizes: ["M"], colors, woo_id: 1 }).select().single());
await expectError("vendedor no puede dar de alta productos", seller.db.from("products").insert({ sku: "X", name: "X", category: "Polos", price: 1, sizes: ["M"] }).select().single());
await expectDenied("vendedor no puede cambiar precios", seller.db.from("products").update({ price: 1 }).eq("id", pA.id).select());

const vkA = `${pA.id}|Negro|M`;
await expectError("vendedor no registra entradas", seller.db.rpc("move_stock", { p_entries: [{ variantKey: vkA, qty: 5 }], p_branch: centro.id, p_type: "entrada" }), /dueño/);
const { error: inErr } = await ownerA.db.rpc("move_stock", { p_entries: [{ variantKey: vkA, qty: 3 }], p_branch: centro.id, p_type: "entrada", p_ref: "OC-1" });
check("dueño registra entrada", !inErr, inErr?.message);

const item = (product, vk, qty) => ({ productId: product.id, variantKey: vk, name: product.name, color: "Negro", size: "M", qty, unitPrice: 599, unitCost: 1, listPrice: 599 });
const order = (product, vk, branch, qty, extra = {}) => ({
  channel: "tienda",
  customerName: "Público general",
  branch,
  items: [item(product, vk, qty)],
  payments: [{ amount: 599 * qty, method: "efectivo" }],
  status: "pagado",
  seller: "Karla",
  ...extra,
});

// ---------------------------------------------------------------------------
// Ventas y folios (negocio A)
// ---------------------------------------------------------------------------
const { data: o1, error: o1Err } = await seller.db.rpc("create_order", { p: order(pA, vkA, centro.id, 1) });
check("vendedor cobra en el mostrador de su sucursal", !o1Err && o1?.folio === "V-1001", o1Err?.message ?? o1?.folio);
await expectError("vendedor solo vende en su sucursal asignada", seller.db.rpc("create_order", { p: order(pA, vkA, principalA.id, 1) }), /sucursal asignada/);
await expectError("no permite sobreventa", seller.db.rpc("create_order", { p: order(pA, vkA, centro.id, 5) }), /Sin existencia/);

// Ventas simultáneas por las 2 últimas piezas: solo una debe pasar si piden 2 cada una
const [a, b] = await Promise.all([seller.db.rpc("create_order", { p: order(pA, vkA, centro.id, 2) }), ownerA.db.rpc("create_order", { p: order(pA, vkA, centro.id, 2) })]);
check("ventas simultáneas no sobrevenden", [a, b].filter((r) => !r.error).length === 1, [a.error?.message, b.error?.message].filter(Boolean).join(" | "));
const { data: st } = await ownerA.db.from("stock").select("qty").eq("variant_key", vkA).eq("branch", centro.id).single();
check("existencia final = 0", st?.qty === 0, `qty=${st?.qty}`);

const sold = a.error ? b.data : a.data;
// Costo oculto: solo el dueño lo lee, también por API; el unitCost que manda el cliente se ignora
const { data: sellerPc } = await seller.db.from("product_costs").select("*");
const { data: sellerOc } = await seller.db.from("order_costs").select("*");
check("vendedor no lee product_costs ni order_costs", sellerPc?.length === 0 && sellerOc?.length === 0, `${sellerPc?.length}/${sellerOc?.length} filas`);
const { data: sellerProducts } = await seller.db.from("products").select("*");
check("products no trae la columna cost", sellerProducts?.length > 0 && sellerProducts.every((r) => !("cost" in r)));
check("orders.items de una venta no tienen unitCost", o1?.items?.every((i) => !("unitCost" in i)));
await expectError("vendedor no escribe product_costs", seller.db.from("product_costs").update({ cost: 0 }).eq("product_id", pA.id).select().single());
const { data: ownerPc } = await ownerA.db.from("product_costs").select("*");
check("dueño lee product_costs de su negocio", ownerPc?.length === 1 && ownerPc[0].product_id === pA.id && ownerPc[0].cost === 255, JSON.stringify(ownerPc));
const { data: ownerOc } = await ownerA.db.from("order_costs").select("*").eq("order_id", o1.id).single();
check("create_order ignora el unitCost del cliente y guarda el costo real", ownerOc?.costs?.[vkA] === 255, JSON.stringify(ownerOc?.costs));

check("el folio es consecutivo dentro del negocio", sold?.folio === "V-1002", sold?.folio);
const { error: cErr } = await ownerA.db.rpc("set_order_status", { p_order: sold.id, p_status: "cancelado" });
const { data: st2 } = await ownerA.db.from("stock").select("qty").eq("variant_key", vkA).eq("branch", centro.id).single();
check("cancelar regresa las piezas", !cErr && st2?.qty === 2, cErr?.message ?? `qty=${st2?.qty}`);

// Pagos y apartados
const layawayInput = { ...order(pA, vkA, centro.id, 1), channel: "whatsapp", payments: [{ amount: 300, method: "transferencia" }] };
delete layawayInput.status;
const { data: layaway } = await seller.db.rpc("create_order", { p: layawayInput });
check("anticipo deja el pedido apartado", layaway?.status === "apartado", layaway?.status);
check("el pedido ganador de la carrera no deja huecos en los folios", layaway?.folio === "V-1003", layaway?.folio);
const { data: paid } = await seller.db.rpc("add_payment", { p_order: layaway.id, p_payment: { amount: 299, method: "transferencia" } });
check("liquidar lo marca pagado", paid?.status === "pagado", paid?.status);

// Clientes, cotización y conversión
const { data: custA, error: custErr } = await seller.db
  .from("customers")
  .insert({ name: "Cliente Mayorista", business: "Tienda Mayorista", phone: "555 000 0000", city: "Ciudad", state: "Estado", type: "distribuidor" })
  .select()
  .single();
check("vendedor registra cliente", !custErr, custErr?.message);
await ownerA.db.rpc("move_stock", { p_entries: [{ variantKey: vkA, qty: 20 }], p_branch: principalA.id, p_type: "entrada" });
const quoteOf = (customer, product, vk) => ({
  customerId: customer.id,
  customerName: customer.business,
  items: [{ ...item(product, vk, 12), unitPrice: 469 }],
  tierId: "lista",
  subtotalList: 7188,
  discount: 1560,
  subtotal: 5628,
  shipping: 280,
  total: 5908,
  depositPct: 0.5,
  status: "enviada",
  validUntil: new Date(Date.now() + 7 * 864e5).toISOString(),
});
const { data: qA, error: qErr } = await seller.db.rpc("save_quote", { p: quoteOf(custA, pA, vkA) });
check("folio de cotización del negocio", !qErr && qA?.folio === "COT-0001", qErr?.message ?? qA?.folio);
check("save_quote guarda los items sin unitCost", qA?.items?.every((i) => !("unitCost" in i)));
const { data: conv, error: convErr } = await seller.db.rpc("convert_quote", { p_quote: qA.id, p_deposit: { amount: 2954, method: "transferencia", note: "Anticipo" } });
check("cotización → pedido apartado de mayoreo", !convErr && conv?.status === "apartado" && conv?.channel === "mayoreo", convErr?.message ?? conv?.status);
check("el mayoreo se aparta de la sucursal que lo surte", conv?.branch === principalA.id);
check("la conversión toma el siguiente folio de pedido", conv?.folio === "V-1004", conv?.folio);
await expectError("no se convierte dos veces", seller.db.rpc("convert_quote", { p_quote: qA.id, p_deposit: {} }), /ya es un pedido/);
const { data: qA2 } = await seller.db.rpc("save_quote", { p: quoteOf(custA, pA, vkA) });
check("la segunda cotización lleva el siguiente folio", qA2?.folio === "COT-0002", qA2?.folio);
await ownerA.db.from("branches").update({ is_warehouse: false }).eq("id", principalA.id);
await expectError("convertir exige una sucursal que surta mayoreo", seller.db.rpc("convert_quote", { p_quote: qA2.id, p_deposit: {} }), /Configura qué sucursal surte el mayoreo/);
await ownerA.db.from("branches").update({ is_warehouse: true }).eq("id", principalA.id);

// Traspaso y conteo
const { error: trErr } = await seller.db.rpc("transfer_stock", { p_entries: [{ variantKey: vkA, qty: 3 }], p_from: principalA.id, p_to: bodega.id });
check("traspaso entre sucursales", !trErr, trErr?.message);
const { data: trMov } = await ownerA.db.from("movements").select("note, branch").eq("type", "traspaso").eq("branch", principalA.id).limit(1).single();
check("el kardex anota el destino del traspaso", trMov?.note === "Hacia Sucursal Norte", trMov?.note);
const { data: changed, error: cntErr } = await seller.db.rpc("set_stock_count", { p_branch: bodega.id, p_entries: [{ variantKey: vkA, qty: 10 }] });
check("conteo físico fija existencia", !cntErr && changed === 1, cntErr?.message);

// Gastos: solo dueño
const { error: exErr } = await ownerA.db.from("expenses").insert({ category: "renta", description: "Renta del local", amount: 22000, method: "transferencia" });
check("dueño registra gasto", !exErr, exErr?.message);
const { data: sellerExpenses } = await seller.db.from("expenses").select("*");
check("vendedor no ve gastos", Array.isArray(sellerExpenses) && sellerExpenses.length === 0);
await expectError("vendedor no registra gastos", seller.db.from("expenses").insert({ category: "otros", description: "x", amount: 1, method: "efectivo" }).select().single());

// Configuración y administración del negocio
const { data: sellerCfg } = await seller.db.from("settings").select("key");
check("vendedor lee la configuración", sellerCfg?.length === 4, `${sellerCfg?.length} llaves`);
await expectDenied("vendedor no cambia la configuración", seller.db.from("settings").update({ value: { enabled: true } }).eq("key", "wholesale").select());
await expectError("vendedor no edita el negocio", seller.db.rpc("update_business", { p_name: "Otro", p_order_prefix: "X-", p_quote_prefix: "Y-" }), /Solo el dueño/);
await expectError("vendedor no renueva el código de invitación", seller.db.rpc("regenerate_invite_code"), /Solo el dueño/);
const { data: team } = await ownerA.db.from("profiles").select("id");
check("dueño ve a todo su equipo", team?.length === 3, `${team?.length} perfiles`);
const { data: ownProfiles } = await seller.db.from("profiles").select("id");
check("vendedor solo ve su propio perfil", ownProfiles?.length === 1);
const { data: movs } = await ownerA.db.from("movements").select("type");
check("kardex registra movimientos", (movs?.length ?? 0) >= 8, `${movs?.length} movimientos`);

const oldCode = bizA.invite_code;
const { data: newCode, error: regenErr } = await ownerA.db.rpc("regenerate_invite_code");
check("dueño renueva el código de invitación", !regenErr && /^[A-Z2-9]{8}$/.test(newCode ?? "") && newCode !== oldCode, regenErr?.message);
const { data: oldLookup } = await inviteLookup(anon, oldCode);
check("el código anterior deja de funcionar", oldLookup === null);
const { data: stillB } = await inviteLookup(anon, bizB.invite_code);
check("renovar el código de A no afecta a B", stillB === "Boutique Beta");

// ---------------------------------------------------------------------------
// Negocio B: datos propios, folios propios
// ---------------------------------------------------------------------------
const { data: pB, error: pBErr } = await ownerB.db
  .from("products")
  .insert({ sku: "T-001", name: "Polo prueba", brand: "Marca", category: "Polos", price: 299, sizes: ["S", "M"], colors, woo_id: 1 })
  .select()
  .single();
check("el mismo woo_id se puede usar en otro negocio", !pBErr, pBErr?.message);
await ownerB.db.from("product_costs").insert({ product_id: pB.id, cost: 100 });
const vkB = `${pB.id}|Negro|M`;
check("producto de B solo crea filas de las sucursales de B", (await stockRows(ownerB.db, pB.id)) === 2);
await ownerB.db.rpc("move_stock", { p_entries: [{ variantKey: vkB, qty: 10 }], p_branch: principalB.id, p_type: "entrada" });
const { data: oB1, error: oB1Err } = await ownerB.db.rpc("create_order", { p: order(pB, vkB, principalB.id, 1, { seller: "Dueño Beta" }) });
check("el primer folio de B también es V-1001", !oB1Err && oB1?.folio === "V-1001", oB1Err?.message ?? oB1?.folio);

await expectError("prefijo de folio vacío", ownerB.db.rpc("update_business", { p_name: "Boutique Beta", p_order_prefix: "", p_quote_prefix: "PRE-" }), /vacíos/);
await expectError("prefijo de folio de más de 10 caracteres", ownerB.db.rpc("update_business", { p_name: "Boutique Beta", p_order_prefix: "ABCDEFGHIJK", p_quote_prefix: "PRE-" }), /10 caracteres/);
const { data: renamed, error: renErr } = await ownerB.db.rpc("update_business", { p_name: "Boutique Beta", p_order_prefix: "BT-", p_quote_prefix: "PRE-" });
check("dueño cambia los prefijos de folio", !renErr && renamed?.order_prefix === "BT-", renErr?.message);
const { data: oB2 } = await ownerB.db.rpc("create_order", { p: order(pB, vkB, principalB.id, 1, { seller: "Dueño Beta" }) });
check("el pedido siguiente usa el prefijo nuevo", oB2?.folio === "BT-1002", oB2?.folio);
const { data: custB } = await ownerB.db.from("customers").insert({ name: "Cliente Beta", business: "Tienda Beta", phone: "555 111 1111", type: "mayorista" }).select().single();
const { data: qB } = await ownerB.db.rpc("save_quote", { p: quoteOf(custB, pB, vkB) });
check("cotización de B empieza en su propio contador", qB?.folio === "PRE-0001", qB?.folio);
await ownerB.db.from("expenses").insert({ category: "otros", description: "Gasto de B", amount: 100, method: "efectivo" });
const { data: nextA } = await ownerA.db.rpc("create_order", { p: order(pA, vkA, centro.id, 1, { seller: "Dueña Alfa" }) });
check("los folios de A no se mueven con los de B", nextA?.folio === "V-1005", nextA?.folio);
const { data: bizAAfter } = await ownerA.db.from("businesses").select("name, order_prefix").single();
check("editar B no cambia el nombre ni el prefijo de A", bizAAfter?.name === "Boutique Alfa" && bizAAfter?.order_prefix === "V-");

// ---------------------------------------------------------------------------
// Aislamiento: un negocio no lee ni escribe datos del otro
// ---------------------------------------------------------------------------
for (const [who, db, own, other] of [
  ["B", ownerB.db, bizB.id, bizA.id],
  ["A", ownerA.db, bizA.id, bizB.id],
]) {
  for (const table of ["businesses", "branches", "profiles", "settings", "products", "stock", "movements", "customers", "orders", "quotes", "expenses", "product_costs", "order_costs"]) {
    const { data: rows, error } = await db.from(table).select("*");
    const idOf = (r) => (table === "businesses" ? r.id : r.business_id);
    check(`${who} solo lee filas de su negocio en ${table}`, !error && rows.length > 0 && rows.every((r) => idOf(r) === own) && !rows.some((r) => idOf(r) === other), error?.message ?? `${rows?.length} filas`);
  }
}
const { data: pFromB } = await ownerB.db.from("products").select("id").eq("id", pA.id);
check("B no lee un producto de A por su id", pFromB?.length === 0);
const { data: pcFromB } = await ownerB.db.from("product_costs").select("*").eq("product_id", pA.id);
const { data: ocFromB } = await ownerB.db.from("order_costs").select("*").eq("order_id", o1.id);
check("B no lee el costo de un producto ni de un pedido de A", pcFromB?.length === 0 && ocFromB?.length === 0);
const { data: oFromB } = await ownerB.db.from("orders").select("id").eq("id", o1.id);
check("B no lee un pedido de A por su id", oFromB?.length === 0);
const { data: profFromB } = await ownerB.db.from("profiles").select("id").eq("id", seller.id);
check("B no lee el perfil de un miembro de A", profFromB?.length === 0);

await expectDenied("B no edita productos de A", ownerB.db.from("products").update({ price: 1 }).eq("id", pA.id).select());
await expectDenied("B no borra productos de A", ownerB.db.from("products").delete().eq("id", pA.id).select());
await expectDenied("B no edita clientes de A", ownerB.db.from("customers").update({ name: "Hackeado" }).eq("id", custA.id).select());
await expectDenied("B no edita cotizaciones de A", ownerB.db.from("quotes").update({ status: "rechazada" }).eq("id", qA2.id).select());
await expectDenied("B no edita la configuración de A", ownerB.db.from("settings").update({ value: { enabled: true } }).eq("business_id", bizA.id).select());
await expectDenied("B no edita sucursales de A", ownerB.db.from("branches").update({ name: "Hackeada" }).eq("id", principalA.id).select());
await expectDenied("B no edita el negocio A", ownerB.db.from("businesses").update({ name: "Hackeado" }).eq("id", bizA.id).select());
await expectDenied("B no borra pedidos de A", ownerB.db.from("orders").delete().eq("id", o1.id).select());
await expectError("B no inserta productos en A", ownerB.db.from("products").insert({ business_id: bizA.id, sku: "H-1", name: "Intruso", category: "Polos", price: 1, sizes: ["M"] }).select());
await expectError("B no inserta sucursales en A", ownerB.db.from("branches").insert({ business_id: bizA.id, name: "Intrusa", short: "X" }).select());
await expectError("B no inserta clientes en A", ownerB.db.from("customers").insert({ business_id: bizA.id, name: "Intruso", phone: "1" }).select());
await expectError("B no inserta gastos en A", ownerB.db.from("expenses").insert({ business_id: bizA.id, category: "otros", description: "x", amount: 1, method: "efectivo" }).select());
await expectError("B no inserta configuración en A", ownerB.db.from("settings").insert({ business_id: bizA.id, key: "extra", value: {} }).select());
await expectError("B no inserta pedidos en A", ownerB.db.from("orders").insert({ business_id: bizA.id, folio: "H-1", channel: "tienda", customer_name: "x", branch: principalA.id, items: [], subtotal: 0, total: 0, status: "pagado" }).select());

// RPC con datos de otro negocio
await expectError("B no vende desde una sucursal de A", ownerB.db.rpc("create_order", { p: order(pA, vkA, principalA.id, 1) }), /Sucursal inválida/);
await expectError("B no vende a un cliente de A", ownerB.db.rpc("create_order", { p: order(pB, vkB, principalB.id, 1, { customerId: custA.id }) }), /Cliente inválido/);
await expectError("B no vende una variante de A", ownerB.db.rpc("create_order", { p: order(pA, vkA, principalB.id, 1) }), /Sin existencia/);
await expectError("B no mueve inventario de una sucursal de A", ownerB.db.rpc("move_stock", { p_entries: [{ variantKey: vkA, qty: 5 }], p_branch: principalA.id, p_type: "entrada" }), /Sucursal inválida/);
await expectError("B no mueve variantes de A en su sucursal", ownerB.db.rpc("move_stock", { p_entries: [{ variantKey: vkA, qty: 5 }], p_branch: principalB.id, p_type: "entrada" }), /Variante inexistente/);
await expectError("B no traspasa hacia una sucursal de A", ownerB.db.rpc("transfer_stock", { p_entries: [{ variantKey: vkB, qty: 1 }], p_from: principalB.id, p_to: principalA.id }), /Sucursal inválida/);
await expectError("B no traspasa desde una sucursal de A", ownerB.db.rpc("transfer_stock", { p_entries: [{ variantKey: vkA, qty: 1 }], p_from: principalA.id, p_to: principalB.id }), /Sucursal inválida/);
await expectError("B no cuenta el inventario de una sucursal de A", ownerB.db.rpc("set_stock_count", { p_branch: principalA.id, p_entries: [{ variantKey: vkA, qty: 99 }] }), /Sucursal inválida/);
await expectError("B no cambia el estado de un pedido de A", ownerB.db.rpc("set_order_status", { p_order: o1.id, p_status: "cancelado" }), /Pedido no encontrado/);
await expectError("B no registra pagos en un pedido de A", ownerB.db.rpc("add_payment", { p_order: o1.id, p_payment: { amount: 1, method: "efectivo" } }), /Pedido no encontrado/);
await expectError("B no cotiza a un cliente de A", ownerB.db.rpc("save_quote", { p: quoteOf(custA, pB, vkB) }), /Cliente inválido/);
await expectError("B no convierte una cotización de A", ownerB.db.rpc("convert_quote", { p_quote: qA2.id, p_deposit: {} }), /Cotización no encontrada/);
await expectError("B no administra miembros de A", ownerB.db.rpc("set_member", { p_id: seller.id, p_role: "pendiente", p_branch: null }), /Colaborador no encontrado/);
await expectError("B no asigna sucursales de A a su equipo", ownerB.db.rpc("set_member", { p_id: pending.id, p_role: "vendedor", p_branch: principalA.id }), /Sucursal inválida/);

// Existencia de la principal de A: 20 de entrada − 12 de la conversión − 3 del traspaso
const { data: afterStock } = await ownerA.db.from("stock").select("qty").eq("variant_key", vkA).eq("branch", principalA.id).single();
const { data: oAfter } = await ownerA.db.from("orders").select("status").eq("id", o1.id).single();
check("tras los intentos de B, el inventario y los pedidos de A siguen intactos", afterStock?.qty === 5 && oAfter?.status === "pagado", `qty=${afterStock?.qty} status=${oAfter?.status}`);

// ---------------------------------------------------------------------------
// invite-lookup: máximo 30 intentos por IP (cf-connecting-ip) en 10 minutos
// ---------------------------------------------------------------------------
const limited = newClient(`test-${Date.now()}`);
let answered = 0;
for (let i = 0; i < 30; i++) if (!(await inviteLookup(limited, "ZZZZZZZZ")).error) answered++;
check("invite-lookup responde las primeras 30 llamadas de una IP", answered === 30, `${answered} respuestas`);
const over = await inviteLookup(limited, "ZZZZZZZZ", { "x-forwarded-for": `otra-${Date.now()}` });
check("la llamada 31 se rechaza con 429 aunque cambie x-forwarded-for", over.error?.status === 429 && /Demasiados intentos/.test(over.error.message), over.error?.message ?? "no hubo error");
const burst = newClient(`rafaga-${Date.now()}`);
const burstAnswered = (await Promise.all(Array.from({ length: 40 }, () => inviteLookup(burst, "ZZZZZZZZ")))).filter((r) => !r.error).length;
check("una ráfaga de 40 en paralelo responde solo 30", burstAnswered === 30, `${burstAnswered} respuestas`);
const { data: otherKey, error: otherKeyErr } = await inviteLookup(newClient(`test-otra-${Date.now()}`), bizB.invite_code);
check("otra IP sigue respondiendo", !otherKeyErr && otherKey === "Boutique Beta", otherKeyErr?.message);

// ---------------------------------------------------------------------------
// Logotipos: cada dueño escribe solo en la carpeta de su negocio
// ---------------------------------------------------------------------------
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const upload = (db, path, body = png, contentType = "image/png") => db.storage.from("logos").upload(path, body, { contentType, upsert: true });
const { error: logoErr } = await upload(ownerA.db, `${bizA.id}/logo.png`);
check("dueño sube el logotipo a la carpeta de su negocio", !logoErr, logoErr?.message);
await expectError("B no sube archivos a la carpeta de A", upload(ownerB.db, `${bizA.id}/intruso.png`));
await expectError("vendedor no sube logotipos", upload(seller.db, `${bizA.id}/vendedor.png`));
await expectError("el bucket rechaza tipos que no son imagen", upload(ownerA.db, `${bizA.id}/nota.txt`, Buffer.from("hola"), "text/plain"));
const { data: publicUrl } = ownerA.db.storage.from("logos").getPublicUrl(`${bizA.id}/logo.png`);
const logoRes = await fetch(publicUrl.publicUrl);
check("el logotipo es público", logoRes.ok, `HTTP ${logoRes.status}`);
await expectDenied("B no borra el logotipo de A", ownerB.db.storage.from("logos").remove([`${bizA.id}/logo.png`]));
const { error: rmErr } = await ownerA.db.storage.from("logos").remove([`${bizA.id}/logo.png`]);
check("dueño borra su propio logotipo", !rmErr, rmErr?.message);

report();
