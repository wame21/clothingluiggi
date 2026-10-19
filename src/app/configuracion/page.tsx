"use client";

import { PageHeader } from "@/components/erp";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CatalogoSection } from "./_components/catalogo";
import { MayoreoSection } from "./_components/mayoreo";
import { NegocioSection } from "./_components/negocio";
import { SucursalesSection } from "./_components/sucursales";
import { VentasSection } from "./_components/ventas";

const SECTIONS = [
  { value: "negocio", label: "Negocio", Section: NegocioSection },
  { value: "sucursales", label: "Sucursales", Section: SucursalesSection },
  { value: "catalogo", label: "Catálogo", Section: CatalogoSection },
  { value: "ventas", label: "Ventas", Section: VentasSection },
  { value: "mayoreo", label: "Mayoreo", Section: MayoreoSection },
];

export default function ConfiguracionPage() {
  return (
    <>
      <PageHeader
        title="Configuración"
        description="Los datos de tu negocio, sucursales, catálogo y ventas. Cada pestaña se guarda por separado y aplica a todo tu equipo."
      />

      <Tabs defaultValue="negocio" className="gap-4">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList className="min-w-max">
            {SECTIONS.map((s) => (
              <TabsTrigger key={s.value} value={s.value} className="px-3">
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {SECTIONS.map(({ value, Section }) => (
          // Montadas siempre para no perder lo que se está editando al cambiar de pestaña
          <TabsContent key={value} value={value} forceMount className="data-[state=inactive]:hidden">
            <Section />
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
