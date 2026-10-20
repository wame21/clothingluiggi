// Prueba de humo: da de alta un negocio nuevo desde la pantalla de registro y recorre las rutas en Chromium headless.
// Uso: pnpm dev (en otra terminal, apuntando al Supabase local) y luego `pnpm smoke`. Capturas en ./.smoke
// Solo se ejecuta contra el Supabase LOCAL: cualquier petición a *.supabase.co se bloquea.
import { mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = new URL("../.smoke/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const stamp = Date.now();
const BUSINESS = `Boutique Prueba ${stamp}`;
const EMAIL = `dueno${stamp}@example.test`;
const PASSWORD = "Prueba123!";

const LOCAL_API = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium" });
const supabaseOrigins = new Set();
const newContext = async (options = {}) => {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", ...options });
  await c.route(/\.supabase\.co/, (route) => route.abort());
  c.on("request", (r) => /\/(auth|rest|storage)\/v1\//.test(r.url()) && supabaseOrigins.add(new URL(r.url()).origin));
  return c;
};
const ctx = await newContext();
const page = await ctx.newPage();
const errors = [];
const watch = (p) => {
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  p.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
};
watch(page);

const results = [];
let active = page;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(`✓ ${name}`);
  } catch (e) {
    results.push(`✗ ${name}: ${e.message.split("\n")[0]}`);
    await active.screenshot({ path: `${OUT}fail-${name.replace(/\W+/g, "-")}.png` }).catch(() => {});
  }
};
const shot = (name, fullPage = false) => page.screenshot({ path: `${OUT}${name}.png`, fullPage });

await step("registro de un negocio nuevo", async () => {
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Registrarme" }).click();
  await page.getByRole("tab", { name: "Crear mi negocio" }).click();
  await page.getByLabel("Tu nombre").fill("Dueña de Prueba");
  await page.getByLabel("Nombre del negocio").fill(BUSINESS);
  await page.getByLabel("Correo").fill(EMAIL);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await shot("registro");
  await page.getByRole("button", { name: "Crear mi negocio" }).click();
  await page.getByText("así va tu negocio").waitFor({ timeout: 20000 });
  await shot("dashboard-nuevo", true);
});

await step("el navegador usa el Supabase local", async () => {
  const origins = [...supabaseOrigins];
  if (origins.length === 0 || origins.some((o) => o !== LOCAL_API)) throw new Error(`peticiones a ${origins.join(", ") || "ningún Supabase"}`);
});

const routes = [
  ["dashboard", "/", "Ventas diarias por canal"],
  ["pedidos", "/pedidos", "Por atender"],
  ["pedido-nuevo", "/pedidos/nuevo", "¿Por dónde llegó?"],
  ["pos", "/pos", "Venta actual"],
  ["inventario", "/inventario", "Existencias"],
  ["reabasto", "/inventario?tab=reabasto", "Qué comprar y cuánto"],
  ["mayoreo", "/mayoreo", "El mayoreo está desactivado"],
  ["clientes", "/clientes", "Total comprado"],
  ["finanzas", "/finanzas", "Estado de resultados"],
  ["reportes", "/reportes", "Rentabilidad por canal"],
  ["equipo", "/equipo", "Equipo"],
  ["configuracion", "/configuracion", "Configuración"],
  ["integraciones", "/integraciones", "WooCommerce"],
];

for (const [name, path, text] of routes) {
  await step(`ruta ${path}`, async () => {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.getByText(text, { exact: false }).first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(400);
    await shot(name, name === "dashboard" || name === "finanzas");
  });
}

await step("el negocio aparece en la marca", async () => {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.getByText(BUSINESS).first().waitFor({ timeout: 15000 });
});

await step("sin sesión redirige al login", async () => {
  const anon = await browser.newContext();
  const p = await anon.newPage();
  await p.goto(BASE + "/pedidos", { waitUntil: "networkidle" });
  await p.waitForURL(/\/login/, { timeout: 15000 });
  await anon.close();
});

await step("vista móvil", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.getByText("Ventas diarias por canal").waitFor();
  await shot("movil-dashboard", true);
  await page.goto(BASE + "/pedidos/nuevo", { waitUntil: "networkidle" });
  await shot("movil-pedido-nuevo", true);
});

await step("tema claro", async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Cambiar tema" }).click();
  await page.waitForTimeout(300);
  await shot("dashboard-claro");
  await page.getByRole("button", { name: "Cambiar tema" }).click();
});

// ---------------------------------------------------------------------------
// Flujos principales tras el alta del negocio
// ---------------------------------------------------------------------------
const PRODUCT = `Playera Smoke ${stamp}`;
const BRANCH = "Sucursal Centro";
const panel = () => page.locator('[role="tabpanel"]:visible');
const toast = (text) => page.locator("[data-sonner-toast]").filter({ hasText: text }).first();
// Dos formas de etiquetar: <label> hermano del input (diálogos) o <label> que envuelve el input (Configuración)
const field = (root, label) => {
  const lbl = root.locator("label", { hasText: label }).first();
  return lbl.locator("input").or(lbl.locator("xpath=following-sibling::input[1]")).first();
};

// PNG de 64×64 generado aquí mismo (sin archivos externos)
function makePng(w, h, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// CLABE de 18 dígitos con dígito verificador válido (pesos 3, 7, 1)
const clabeOf = (prefix17) => {
  const weights = [3, 7, 1];
  const sum = [...prefix17].reduce((a, d, i) => a + ((Number(d) * weights[i % 3]) % 10), 0);
  return `${prefix17}${(10 - (sum % 10)) % 10}`;
};

let folio = "";

await step("configuración: crear una sucursal", async () => {
  await page.goto(BASE + "/configuracion", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Sucursales" }).click();
  await page.getByRole("button", { name: "Nueva sucursal" }).click();
  await page.getByPlaceholder("Ej. Sucursal Centro").fill(BRANCH);
  await page.getByPlaceholder("Ej. Centro").fill("Centro");
  await shot("sucursal-dialogo");
  await page.getByRole("button", { name: "Guardar" }).click();
  await toast("Sucursal creada").waitFor({ timeout: 15000 });
  await panel().getByText(BRANCH, { exact: true }).waitFor({ timeout: 10000 });
  await shot("sucursales");
});

await step("inventario: alta de un producto con variantes", async () => {
  await page.goto(BASE + "/inventario", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Ej. Blusa de lino manga corta").fill(PRODUCT);
  await field(dialog, "Costo").fill("250");
  await field(dialog, "Precio de venta").fill("599");
  await shot("producto-dialogo");
  await dialog.getByRole("button", { name: "Crear producto" }).click();
  await toast("dado de alta").waitFor({ timeout: 15000 });
});

await step("inventario: registrar una entrada de stock", async () => {
  await page.getByRole("button", { name: "Entrada de mercancía" }).first().click();
  const dialog = page.getByRole("dialog").filter({ hasText: "Entrada de mercancía" });
  await dialog.getByLabel(`${PRODUCT} Negro talla M`, { exact: true }).fill("10");
  await dialog.getByLabel(`${PRODUCT} Blanco talla S`, { exact: true }).fill("5");
  await shot("entrada-dialogo");
  await dialog.getByRole("button", { name: "Registrar" }).click();
  await toast("+15 piezas").waitFor({ timeout: 15000 });
});

await step("punto de venta: cobrar una venta", async () => {
  await page.goto(BASE + "/pos", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: new RegExp(PRODUCT) }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^M\s*10 pzs/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Listo" }).click();
  await page.getByText("Venta actual").waitFor();
  await shot("pos-carrito");
  await page.getByRole("button", { name: /^Cobrar/ }).click();
  await page.getByText("Venta registrada").waitFor({ timeout: 15000 });
  folio = (await page.getByText(/Folio V-\d+/).first().innerText()).match(/V-\d+/)[0];
  await shot("pos-ticket");
  await page.getByRole("button", { name: "Nueva venta" }).click();
});

await step("pedidos: la venta aparece con su folio", async () => {
  await page.goto(BASE + "/pedidos", { waitUntil: "networkidle" });
  // Las ventas de mostrador nacen entregadas: no salen en «Por atender»
  await page.getByRole("tab", { name: "Todos" }).click();
  const row = page.getByRole("row").filter({ hasText: folio });
  await row.first().waitFor({ timeout: 15000 });
  await shot("pedidos-venta");
  await row.first().click();
  await page.waitForURL(/\/pedidos\/[^/]+$/, { timeout: 10000 });
  await page.getByText(folio).first().waitFor({ timeout: 10000 });
  await shot("pedido-detalle");
});

await step("inventario: la venta queda en el kardex (Movimientos)", async () => {
  await page.goto(BASE + "/inventario?tab=movimientos", { waitUntil: "networkidle" });
  await page.getByText(folio).first().waitFor({ timeout: 15000 });
});

await step("configuración: activar Mayoreo muestra el módulo", async () => {
  await page.goto(BASE + "/configuracion", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Mayoreo" }).click();
  await page.locator("#mayoreo-enabled").click();
  await panel().getByLabel("CLABE interbancaria").fill(clabeOf("00201007777777777"));
  await panel().getByLabel("Titular de la cuenta").fill("Titular Smoke");
  await shot("mayoreo-config");
  await panel().getByRole("button", { name: "Guardar cambios" }).click();
  await toast("Configuración de mayoreo guardada").waitFor({ timeout: 15000 });
  await page.getByRole("link", { name: "Mayoreo" }).first().waitFor({ timeout: 10000 });
  await page.goto(BASE + "/mayoreo", { waitUntil: "networkidle" });
  if (await page.getByText("El mayoreo está desactivado").count()) throw new Error("/mayoreo sigue desactivado");
  await shot("mayoreo-activo");
});

await step("configuración: cambiar el color de acento", async () => {
  await page.goto(BASE + "/configuracion", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Usar #1d4ed8" }).click();
  await panel().getByRole("button", { name: "Guardar cambios" }).click();
  await toast("Datos del negocio guardados").waitFor({ timeout: 15000 });
  const gold = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--gold").trim().toLowerCase());
  if (!gold.includes("1d4ed8")) throw new Error(`--gold sigue en «${gold}»`);
  await shot("acento-azul");
});

await step("configuración: subir un logo PNG", async () => {
  await page.goto(BASE + "/configuracion", { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: makePng(64, 64, [184, 137, 43]) });
  await toast("Logo actualizado").waitFor({ timeout: 15000 });
  const logo = page.getByAltText("Logo del negocio");
  await logo.waitFor({ timeout: 10000 });
  const src = await logo.getAttribute("src");
  if (!src?.startsWith(`${LOCAL_API}/storage/v1/object/public/logos/`)) throw new Error(`URL del logo inesperada: ${src}`);
  await page.waitForFunction(() => {
    const img = document.querySelector('img[alt="Logo del negocio"]');
    return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
  }, null, { timeout: 10000 });
  await shot("logo-subido");
});

const MEMBER = `Karla Smoke ${stamp}`;
const MEMBER_EMAIL = `vendedora${stamp}@example.test`;
let inviteCode = "";
let page2;
let ctx2;

await step("equipo: leer el código de invitación", async () => {
  await page.goto(BASE + "/equipo", { waitUntil: "networkidle" });
  inviteCode = (await page.locator(".select-all.font-mono").first().innerText()).trim();
  if (!/^[A-Z2-9]{8}$/.test(inviteCode)) throw new Error(`código inesperado: «${inviteCode}»`);
});

await step("registro con código de invitación: queda pendiente", async () => {
  ctx2 = await newContext();
  page2 = await ctx2.newPage();
  watch(page2);
  active = page2;
  await page2.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page2.getByRole("tab", { name: "Registrarme" }).click();
  await page2.getByRole("tab", { name: "Unirme a un negocio" }).click();
  await page2.getByLabel("Tu nombre").fill(MEMBER);
  await page2.getByLabel("Correo").fill(MEMBER_EMAIL);
  await page2.getByLabel("Contraseña").fill(PASSWORD);
  await page2.getByLabel("Código de invitación").fill(inviteCode);
  await page2.getByText(`Te unirás a ${BUSINESS}`).waitFor({ timeout: 15000 });
  await page2.getByRole("button", { name: "Unirme al negocio" }).click();
  await page2.getByText("Tu cuenta está pendiente").waitFor({ timeout: 20000 });
  await page2.screenshot({ path: `${OUT}equipo-pendiente.png` });
  active = page;
});

await step("equipo: el dueño aprueba al usuario pendiente", async () => {
  await page.goto(BASE + "/equipo", { waitUntil: "networkidle" });
  await page.getByText("espera tu aprobación").waitFor({ timeout: 15000 });
  const row = page.getByRole("row").filter({ hasText: MEMBER });
  await row.getByRole("combobox").nth(0).click();
  await page.getByRole("option", { name: "Vendedor" }).click();
  await toast("ya puede entrar").waitFor({ timeout: 15000 });
  await row.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "Centro", exact: true }).click();
  await toast(`${MEMBER} actualizado`).waitFor({ timeout: 15000 });
  await shot("equipo-aprobado");
});

await step("el usuario aprobado ya entra a la app", async () => {
  active = page2;
  await page2.reload({ waitUntil: "networkidle" });
  await page2.getByText("Tu cuenta está pendiente").waitFor({ state: "hidden", timeout: 15000 });
  await page2.goto(BASE + "/pos", { waitUntil: "networkidle" });
  await page2.getByText("Venta actual").waitFor({ timeout: 15000 });
  await page2.screenshot({ path: `${OUT}equipo-vendedor-pos.png` });
  active = page;
});
await ctx2?.close();

await browser.close();
console.log(results.join("\n"));
const unique = [...new Set(errors)];
console.log(unique.length ? `\nErrores de consola (${unique.length}):\n${unique.slice(0, 20).join("\n")}` : "\nSin errores de consola");
process.exit(results.some((r) => r.startsWith("✗")) ? 1 : 0);
