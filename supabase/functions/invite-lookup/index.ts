// Nombre del negocio de un código de invitación, con límite de intentos por IP.
// La IP sale de cf-connecting-ip, que Cloudflare pone en cada petición y el cliente no puede alterar;
// sin Cloudflare (Supabase local) se usa el primer x-forwarded-for.
// Se despliega con verify_jwt = false: la llave publicable no es un JWT y el login no tiene sesión.
import { withSupabase } from "npm:@supabase/server@1.9.1";

Deno.serve(
  withSupabase({ auth: "none" }, async (req, ctx) => {
    const { code } = await req.json().catch(() => ({}));
    const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "sin-ip";
    const { data, error } = await ctx.supabaseAdmin.rpc("invite_lookup", { p_code: String(code ?? ""), p_key: ip });
    if (error?.code === "PT429") return Response.json({ error: error.message }, { status: 429 });
    if (error) {
      console.error(error);
      return Response.json({ error: "No se pudo consultar el código, intenta de nuevo" }, { status: 500 });
    }
    return Response.json({ name: data });
  }),
);
