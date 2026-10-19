"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase/client";

const AUTH_ERRORS: Record<string, string> = {
  "Invalid login credentials": "Correo o contraseña incorrectos",
  "User already registered": "Ese correo ya tiene cuenta; inicia sesión",
  "Email not confirmed": "Confirma tu correo antes de entrar",
  "email rate limit exceeded": "Se alcanzó el límite de correos de registro; intenta en una hora",
  "Signups not allowed for this instance": "El registro de cuentas está desactivado",
};

const CODE_LENGTH = 8;

type Mode = "entrar" | "crear" | "unirme";

function translate(message: string, mode: Mode) {
  if (AUTH_ERRORS[message]) return AUTH_ERRORS[message];
  if (message.startsWith("Password should")) return "La contraseña debe tener al menos 6 caracteres";
  if (message.startsWith("Email address")) return "Ese correo no es válido";
  if (message.includes("Código de invitación")) return "Código de invitación inválido";
  // Los errores del alta del negocio llegan de Supabase Auth con este mensaje genérico.
  if (message.startsWith("Database error saving new user")) {
    return mode === "unirme"
      ? "No pudimos crear tu cuenta. Revisa el código de invitación."
      : "No pudimos crear tu cuenta. Revisa los datos e intenta de nuevo.";
  }
  return message;
}

/** Resultado de consultar un código: `name` es `null` si no existe. */
type Lookup = { code: string; name: string | null };

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("entrar");
  const [form, setForm] = useState({ name: "", email: "", password: "", businessName: "", inviteCode: "" });
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const code = form.inviteCode;
  const codeReady = code.length === CODE_LENGTH;
  const found = lookup?.code === code ? lookup : null;

  // Al completar el código se consulta el negocio (con una pausa para no consultar en cada tecla).
  useEffect(() => {
    if (mode !== "unirme" || !codeReady) return;
    const timer = setTimeout(async () => {
      const { data, error } = await supabase().rpc("invite_lookup", { p_code: code });
      if (!error) setLookup({ code, name: (data as string | null) ?? null });
    }, 350);
    return () => clearTimeout(timer);
  }, [mode, code, codeReady]);

  const reset = (next: Mode) => {
    setMode(next);
    setError("");
    setNotice("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const email = form.email.trim().toLowerCase();
    const name = form.name.trim();
    const { data, error } =
      mode === "entrar"
        ? await supabase().auth.signInWithPassword({ email, password: form.password })
        : await supabase().auth.signUp({
            email,
            password: form.password,
            options: {
              data: mode === "crear" ? { name, business_name: form.businessName.trim() } : { name, invite_code: code },
            },
          });
    if (error) {
      setError(translate(error.message, mode));
      setBusy(false);
      return;
    }
    // Con "Confirm email" activo en Supabase el registro no abre sesión hasta confirmar el correo.
    if (!data.session) {
      setNotice(`Te enviamos un correo a ${email}. Confírmalo y luego inicia sesión.`);
      setMode("entrar");
      setBusy(false);
      return;
    }
    router.replace("/");
  };

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setCode = (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, inviteCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH) }));

  const registro = mode !== "entrar";
  const codeInvalid = mode === "unirme" && found?.name === null;

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex justify-center">
          <BrandLockup />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{mode === "entrar" ? "Inicia sesión" : "Crea tu cuenta"}</CardTitle>
            <CardDescription>
              {mode === "entrar" && "Entra con el correo que registraste."}
              {mode === "crear" && "Serás el dueño del negocio y podrás configurar sucursales, catálogo y equipo."}
              {mode === "unirme" && "Pide el código de invitación al dueño. Él debe aprobar tu cuenta antes de que puedas ver el sistema."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Tabs value={registro ? "registro" : "entrar"} onValueChange={(v) => reset(v === "entrar" ? "entrar" : "crear")}>
              <TabsList className="w-full">
                <TabsTrigger value="entrar">Entrar</TabsTrigger>
                <TabsTrigger value="registro">Registrarme</TabsTrigger>
              </TabsList>
            </Tabs>
            {registro && (
              <Tabs value={mode} onValueChange={(v) => reset(v as Mode)}>
                <TabsList className="w-full">
                  <TabsTrigger value="crear">Crear mi negocio</TabsTrigger>
                  <TabsTrigger value="unirme">Unirme a un negocio</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <form onSubmit={submit} className="grid gap-3">
              {registro && (
                <div className="grid gap-1.5">
                  <Label htmlFor="name">Tu nombre</Label>
                  <Input id="name" required autoComplete="name" value={form.name} onChange={set("name")} placeholder="Ej. Karla López" />
                </div>
              )}
              {mode === "crear" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="businessName">Nombre del negocio</Label>
                  <Input
                    id="businessName"
                    required
                    autoComplete="organization"
                    value={form.businessName}
                    onChange={set("businessName")}
                    placeholder="Ej. Boutique Aurora"
                  />
                </div>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="email">Correo</Label>
                <Input id="email" type="email" required autoComplete="email" value={form.email} onChange={set("email")} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === "entrar" ? "current-password" : "new-password"}
                  value={form.password}
                  onChange={set("password")}
                />
              </div>
              {mode === "unirme" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="inviteCode">Código de invitación</Label>
                  <Input
                    id="inviteCode"
                    required
                    minLength={CODE_LENGTH}
                    maxLength={CODE_LENGTH}
                    autoComplete="off"
                    spellCheck={false}
                    value={form.inviteCode}
                    onChange={setCode}
                    placeholder="8 caracteres"
                    className="font-mono uppercase tracking-widest"
                  />
                  {codeReady && (
                    <p className={codeInvalid ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
                      {!found ? "Buscando negocio…" : found.name ? `Te unirás a ${found.name}` : "Código no encontrado"}
                    </p>
                  )}
                </div>
              )}
              {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={busy || codeInvalid} className="mt-1">
                {busy && <Loader2 className="animate-spin" />}
                {mode === "entrar" ? "Entrar" : mode === "crear" ? "Crear mi negocio" : "Unirme al negocio"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
