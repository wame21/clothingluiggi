"use client";

import { Cloud, Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO, isSignedIn, signOut } from "@/lib/demo-auth";

// La sesión solo cambia por acciones de esta misma pestaña: no hay nada a qué suscribirse.
const noSubscription = () => () => {};

/** Bienvenida tras iniciar sesión; sin sesión regresa al login (no hay servidor que redirija). */
export default function Bienvenida() {
  const router = useRouter();
  // null en el prerender (sin navegador): se muestra "cargando" hasta leer sessionStorage.
  const signedIn = useSyncExternalStore(noSubscription, isSignedIn, () => null);

  useEffect(() => {
    if (signedIn === false) router.replace("/login");
  }, [signedIn, router]);

  const leave = () => {
    signOut();
    router.replace("/login");
  };

  if (!signedIn) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Cargando" />
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="gap-4">
          <BrandLockup />
          <div>
            <CardTitle className="font-display text-3xl font-bold">¡Hola, {DEMO.name}!</CardTitle>
            <CardDescription>Te damos la bienvenida. Iniciaste sesión como {DEMO.email}.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex gap-3 rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
            <Cloud className="mt-0.5 size-4 shrink-0 text-gold" />
            <p>Demo estática en GitHub Pages: la cuenta de prueba vive en el código y no se conecta a ninguna base de datos.</p>
          </div>
          <Button variant="outline" onClick={leave}>
            <LogOut /> Cerrar sesión
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
