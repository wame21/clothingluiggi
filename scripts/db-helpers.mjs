// Piezas comunes de db-test.mjs y db-flows.mjs: conexión al Supabase LOCAL, registro de resultados y alta de usuarios.
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const raw = execSync("pnpm exec supabase status -o json", { encoding: "utf8" });
const status = JSON.parse(raw.slice(raw.indexOf("{")));
export const URL = status.API_URL;
export const KEY = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
export const SERVICE_KEY = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY;
if (!URL.includes("127.0.0.1") && !URL.includes("localhost")) throw new Error("Solo se ejecuta contra Supabase local");

const PASSWORD = "Prueba123!";
export const results = [];
export const check = (name, ok, detail = "") => results.push(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
export const expectError = async (name, promise, match) => {
  const { error } = await promise;
  check(name, !!error && (!match || match.test(error.message)), error ? error.message : "no hubo error");
};
// Escrituras que RLS rechaza con error o que simplemente no tocan ninguna fila.
export const expectDenied = async (name, promise) => {
  const { data, error } = await promise;
  check(name, !!error || !data || (Array.isArray(data) && data.length === 0), error?.message ?? `${data?.length ?? 0} filas`);
};

// ip: fija cf-connecting-ip, la llave con que la función invite-lookup limita los intentos (en local no hay Cloudflare que la ponga).
export const newClient = (ip) => createClient(URL, KEY, { auth: { persistSession: false }, global: { headers: ip ? { "cf-connecting-ip": ip } : {} } });

// Consulta de códigos por la Edge Function invite-lookup; el error trae el mensaje y el status que manda la función.
export async function inviteLookup(client, code, headers) {
  const { data, error } = await client.functions.invoke("invite-lookup", { body: { code }, headers });
  if (!error) return { data: data.name, error: null };
  const body = error.context instanceof Response ? await error.context.json().catch(() => ({})) : {};
  return { data: null, error: { message: body.error ?? error.message, status: error.context?.status } };
}

export async function signUp(email, data) {
  const c = newClient();
  const { error } = await c.auth.signUp({ email, password: PASSWORD, options: { data } });
  return { client: c, error };
}

export async function user(email, data) {
  const { client, error } = await signUp(email, data);
  if (error) throw error;
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInErr) throw signInErr;
  const { data: me } = await client.auth.getUser();
  return { db: client, id: me.user.id, email };
}

// Cliente con la llave de servicio: se salta RLS para mover fechas de membresía y dar de alta administradores.
export const service = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });

// Administrador de la plataforma: usuario normal (con su propio negocio) dado de alta en platform_admins.
export async function platformAdmin(email) {
  const admin = await user(email, { name: "Admin", business_name: "Plataforma" });
  const { error } = await service.from("platform_admins").insert({ user_id: admin.id });
  if (error) throw error;
  return admin;
}

const stamp = Date.now();
export const mail = (who) => `${who}${stamp}@example.test`;

export function report() {
  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("✗")).length;
  console.log(`\n${results.length - failed}/${results.length} pruebas correctas`);
  process.exit(failed ? 1 : 0);
}
