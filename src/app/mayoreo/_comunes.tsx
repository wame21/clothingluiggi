"use client";

import { AlertTriangle, Handshake, Settings } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/erp";
import { Button } from "@/components/ui/button";
import { useIsOwner } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Estado vacío de las tres rutas cuando el negocio no tiene activado el mayoreo. */
export function WholesaleDisabled() {
  const owner = useIsOwner();
  return (
    <>
      <PageHeader title="Mayoreo y cotizaciones" />
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <div className="grid size-10 place-items-center rounded-full bg-muted">
          <Handshake className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">El mayoreo está desactivado</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          {owner
            ? "Actívalo en Configuración y define tus niveles de precio, paquetes y condiciones."
            : "Pídele al dueño que lo active en Configuración."}
        </p>
        {owner && (
          <Button asChild variant="outline" size="sm" className="mt-2">
            <Link href="/configuracion">
              <Settings /> Ir a Configuración
            </Link>
          </Button>
        )}
      </div>
    </>
  );
}

/** Aviso cuando ninguna sucursal está marcada como la que surte el mayoreo. */
export function NoWarehouseNotice({ className }: { className?: string }) {
  const owner = useIsOwner();
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm print:hidden", className)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
      <div>
        <div className="font-medium">Ninguna sucursal surte el mayoreo</div>
        <div className="text-xs text-muted-foreground">
          Marca una sucursal como la que surte mayoreo y pedidos en línea para cotizar con su inventario y convertir cotizaciones en pedidos.{" "}
          {owner ? (
            <Link href="/configuracion" className="text-gold underline-offset-4 hover:underline">
              Configurar en Configuración
            </Link>
          ) : (
            "Pídele al dueño que la configure."
          )}
        </div>
      </div>
    </div>
  );
}
