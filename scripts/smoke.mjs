// Prueba de humo: da de alta un negocio nuevo desde la pantalla de registro y recorre las rutas en Chromium headless.
// Uso: pnpm dev (en otra terminal, con .env.local apuntando a un Supabase de pruebas) y luego `pnpm smoke`. Capturas en ./.smoke
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = new URL("../.smoke/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const stamp = Date.now();
const BUSINESS = `Boutique Prueba ${stamp}`;
const EMAIL = `dueno${stamp}@example.test`;
const PASSWORD = "Prueba123!";

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

await browser.close();
console.log(results.join("\n"));
const unique = [...new Set(errors)];
console.log(unique.length ? `\nErrores de consola (${unique.length}):\n${unique.slice(0, 20).join("\n")}` : "\nSin errores de consola");
process.exit(results.some((r) => r.startsWith("✗")) ? 1 : 0);
