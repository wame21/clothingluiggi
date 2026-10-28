"use client";

import type { User } from "@supabase/supabase-js";
import { Cloud, Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";

/** Bienvenida tras iniciar sesión; sin sesión regresa al login (no hay servidor que redirija). */
export default function Bienvenida() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    void supabase()
      .auth.getUser()
      .then(({ data }) => {
        if (data.user) setUser(data.user);
        else router.replace("/login");
      });
  }, [router]);

  const signOut = async () => {
    await supabase().auth.signOut();
    router.replace("/login");
  };

  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Cargando" />
      </div>
    );
  }

  const name = (user.user_metadata?.name as string | undefined) || user.email;
  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="gap-4">
          <BrandLockup />
          <div>
            <CardTitle className="font-display text-3xl font-bold">¡Hola, {name}!</CardTitle>
            <CardDescription>Te damos la bienvenida. Iniciaste sesión como {user.email}.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex gap-3 rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
            <Cloud className="mt-0.5 size-4 shrink-0 text-gold" />
            <p>Sitio estático en GitHub Pages: el navegador se autentica directo con Supabase (Auth y Postgres en la nube), sin servidor propio.</p>
          </div>
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut /> Cerrar sesión
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
