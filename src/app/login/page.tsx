"use client";

import { Info, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEMO, isSignedIn, signIn } from "@/lib/demo-auth";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Quien ya entró en esta pestaña pasa directo a la bienvenida.
  useEffect(() => {
    if (isSignedIn()) router.replace("/");
  }, [router]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!signIn(form.email, form.password)) {
      setError("Correo o contraseña incorrectos");
      return;
    }
    setBusy(true);
    router.replace("/");
  };

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-14 gap-y-8">
        <div className="flex min-w-0 flex-[1_1_22rem] flex-col gap-6">
          <BrandLockup />
          <h1 className="font-display text-3xl leading-[1.02] font-extrabold tracking-tight md:text-6xl">Tu boutique, en un solo lugar.</h1>
          <p className="hidden max-w-md text-lg text-muted-foreground md:block">
            Pedidos, punto de venta, inventario y mayoreo para todas tus sucursales, sincronizados en tiempo real.
          </p>
          <ul className="hidden flex-wrap gap-2.5 text-[13px] font-semibold md:flex">
            {["Punto de venta", "Inventario por talla y color", "Mayoreo y cotizaciones"].map((f) => (
              <li key={f} className="flex h-9 items-center gap-2 rounded-full border bg-card px-3.5 backdrop-blur-xl">
                <span className="size-1.5 rounded-full bg-gold" />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-2xl font-bold">Inicia sesión</CardTitle>
              <CardDescription>Demo en GitHub Pages con una cuenta de prueba.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <form onSubmit={submit} className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="email">Correo</Label>
                  <Input id="email" type="email" required autoComplete="email" value={form.email} onChange={set("email")} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input id="password" type="password" required autoComplete="current-password" value={form.password} onChange={set("password")} />
                </div>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <Button type="submit" disabled={busy} className="mt-1">
                  {busy && <Loader2 className="animate-spin" />}
                  Entrar
                </Button>
              </form>
              <div className="flex gap-3 rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0 text-gold" />
                <p>
                  Cuenta de prueba: <span className="font-mono text-foreground">{DEMO.email}</span> ·{" "}
                  <span className="font-mono text-foreground">{DEMO.password}</span>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
