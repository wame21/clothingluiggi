// Prueba de humo de la demo: recorre las rutas y los flujos clave en Chromium headless.
// Uso: pnpm dev (en otra terminal) y luego `pnpm smoke`. Capturas en ./.smoke
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = new URL("../.smoke/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));

const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(`✓ ${name}`);
  } catch (e) {
    results.push(`✗ ${name}: ${e.message.split("\n")[0]}`);
    await page.screenshot({ path: `${OUT}fail-${name.replace(/\W+/g, "-")}.png` }).catch(() => {});
  }
};
const shot = (name, fullPage = false) => page.screenshot({ path: `${OUT}${name}.png`, fullPage });

const routes = [
  ["dashboard", "/", "Luiggi"],
  ["pedidos", "/pedidos", "Por atender"],
  ["pedido-nuevo", "/pedidos/nuevo", "¿Por dónde llegó?"],
  ["pos", "/pos", "Venta actual"],
  ["inventario", "/inventario", "Existencias"],
  ["reabasto", "/inventario?tab=reabasto", "Qué comprar y cuánto"],
  ["mayoreo", "/mayoreo", "Cotizaciones"],
  ["clientes", "/clientes", "Total comprado"],
  ["finanzas", "/finanzas", "Estado de resultados"],
  ["reportes", "/reportes", "Rentabilidad por canal"],
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

await step("esquema de mayoreo", async () => {
  await page.goto(BASE + "/mayoreo", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Esquema de precios" }).click();
  await page.getByText("Lista de precios por nivel").waitFor();
  await shot("mayoreo-esquema", true);
});

let quoteUrl = "";
await step("cotización con paquete → documento", async () => {
  await page.goto(BASE + "/mayoreo/nueva?paquete=boutique", { waitUntil: "networkidle" });
  await page.getByText("Nivel de precio").first().waitFor();
  await page.getByRole("button", { name: /Selecciona un cliente/ }).click();
  await page.getByPlaceholder(/Buscar por nombre, negocio/).fill("Soto");
  await page.getByRole("option").first().click();
  await page.waitForTimeout(300);
  await shot("cotizador", true);
  await page.getByRole("button", { name: /Generar/ }).click();
  await page.waitForURL(/\/mayoreo\/(?!nueva)/, { timeout: 15000 });
  await page.getByText("Cotización mayoreo").first().waitFor();
  quoteUrl = page.url();
  await shot("cotizacion-documento", true);
});

await step("convertir cotización en pedido", async () => {
  if (!quoteUrl) throw new Error("sin cotización");
  await page.getByRole("button", { name: /Convertir en pedido/ }).click();
  await page.getByRole("button", { name: "Confirmar pedido" }).click();
  await page.waitForURL(/\/pedidos\//, { timeout: 15000 });
  await page.getByText("Apartado (anticipo)").waitFor();
  await shot("pedido-desde-cotizacion", true);
});

await step("venta en punto de venta", async () => {
  await page.goto(BASE + "/pos", { waitUntil: "networkidle" });
  await page.getByText("Polo Pavini Original").first().click();
  await page.getByRole("dialog").getByRole("button", { name: /^M/ }).first().click();
  await page.getByRole("button", { name: "Listo" }).click();
  await shot("pos-carrito");
  await page.getByRole("button", { name: /^Cobrar/ }).click();
  await page.getByText("Venta registrada").waitFor();
  await shot("pos-ticket");
});

await step("pedido de WhatsApp", async () => {
  await page.goto(BASE + "/pedidos/nuevo", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Selecciona un cliente/ }).click();
  await page.getByRole("option").first().click();
  await page.getByRole("button", { name: /Buscar producto para agregar/ }).click();
  await page.getByPlaceholder(/Buscar por nombre, SKU/).fill("Playera Básica");
  await page.getByRole("option").first().click();
  await page.locator('input[aria-label="Playera Básica Premium Negro talla M"]').fill("2");
  await page.getByRole("button", { name: /Crear pedido/ }).click();
  await page.waitForURL(/\/pedidos\/o/, { timeout: 15000 });
  await page.getByText("Pagado · por enviar").waitFor();
});

await step("rol vendedor oculta finanzas", async () => {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Luiggi/ }).first().click();
  await page.getByRole("menuitemradio", { name: /Vendedor/ }).click();
  await page.goto(BASE + "/finanzas", { waitUntil: "networkidle" });
  await page.getByText("Sección exclusiva del dueño").waitFor();
  await page.getByRole("button", { name: "Cambiar a vista de dueño" }).click();
});

await step("vista móvil", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.getByText("Ventas diarias por canal").waitFor();
  await shot("movil-dashboard", true);
  await page.goto(BASE + "/mayoreo/nueva", { waitUntil: "networkidle" });
  await shot("movil-cotizador", true);
});

await step("tema claro", async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Cambiar tema" }).click();
  await page.waitForTimeout(300);
  await shot("dashboard-claro");
  await page.getByRole("button", { name: "Cambiar tema" }).click();
});

await browser.close();
console.log(results.join("\n"));
const unique = [...new Set(errors)];
console.log(unique.length ? `\nErrores de consola (${unique.length}):\n${unique.slice(0, 20).join("\n")}` : "\nSin errores de consola");
process.exit(results.some((r) => r.startsWith("✗")) ? 1 : 0);
