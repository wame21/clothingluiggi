"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
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
};

function translate(message: string) {
  if (AUTH_ERRORS[message]) return AUTH_ERRORS[message];
  if (message.startsWith("Password should")) return "La contraseña debe tener al menos 6 caracteres";
  if (message.startsWith("Email address")) return "Ese correo no es válido";
  return message;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"entrar" | "registro">("entrar");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const email = form.email.trim().toLowerCase();
    const { data, error } =
      mode === "entrar"
        ? await supabase().auth.signInWithPassword({ email, password: form.password })
        : await supabase().auth.signUp({ email, password: form.password, options: { data: { name: form.name.trim() } } });
    if (error) {
      setError(translate(error.message));
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
              {mode === "entrar"
                ? "Entra con el correo que registraste."
                : "El dueño debe aprobar tu cuenta antes de que puedas ver el sistema."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Tabs
              value={mode}
              onValueChange={(v) => {
                setMode(v as typeof mode);
                setError("");
                setNotice("");
              }}
            >
              <TabsList className="w-full">
                <TabsTrigger value="entrar">Entrar</TabsTrigger>
                <TabsTrigger value="registro">Registrarme</TabsTrigger>
              </TabsList>
            </Tabs>
            <form onSubmit={submit} className="grid gap-3">
              {mode === "registro" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="name">Nombre</Label>
                  <Input id="name" required autoComplete="name" value={form.name} onChange={set("name")} placeholder="Ej. Karla López" />
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
              {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={busy} className="mt-1">
                {busy && <Loader2 className="animate-spin" />}
                {mode === "entrar" ? "Entrar" : "Crear cuenta"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
