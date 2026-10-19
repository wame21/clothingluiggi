"use client";

import { Camera, CheckCircle2, CreditCard, FileBadge, Globe, MessageCircle, Truck } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/erp";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useErp } from "@/lib/store";
import { cn } from "@/lib/utils";

const PHASES = [
  {
    phase: "Fase 1",
    time: "Semanas 1–3",
    items: ["Inventario por talla y sucursal", "Pedidos multicanal y punto de venta", "Mayoreo, cotizaciones y notas", "Finanzas y reportes", "Migración de tu Excel actual"],
  },
  { phase: "Fase 2", time: "Semanas 4–6", items: ["Sincronización WooCommerce", "WhatsApp Business e Instagram", "Guías de paquetería automáticas"] },
  { phase: "Fase 3", time: "Semanas 7–10", items: ["Facturación CFDI 4.0", "Portal de mayoristas", "App para vendedores"] },
];

export default function IntegracionesPage() {
  const web = useErp((s) => s.profileSettings.web);
  const carriers = useErp((s) => s.sales.carriers);
  return (
    <>
      <PageHeader
        title="Integraciones"
        description="Conecta tus canales para que los pedidos entren solos y el inventario sea uno mismo en tienda, web y redes."
      />

      <Card className="mb-4 bg-gradient-to-br from-gold/10 to-transparent ring-gold/40">
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-card ring-1 ring-border">
              <Globe className="size-6 text-gold" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">WooCommerce{web && ` · ${web}`}</span>
                <Badge className={STATUS.phase2.cls}>{STATUS.phase2.label}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Los pedidos de la web entrarán como pedidos del ERP y cada venta en tienda o WhatsApp descontará el stock de la página. Mientras tanto,
                registra los pedidos web desde Pedidos → Nuevo pedido.
                {!web && " Agrega la dirección de tu tienda web en Configuración."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Integration
          icon={<CreditCard className="size-5" />}
          title="Mercado Pago y PayPal"
          status="phase2"
          description="Los cobros de la web y los links de pago se concilian solos contra cada pedido, con su comisión calculada."
        />
        <Integration
          icon={<MessageCircle className="size-5" />}
          title="WhatsApp Business"
          status="phase2"
          description="Catálogo con stock real en el chat, pedido capturado desde la conversación y avisos automáticos: pago recibido, guía de envío y entrega."
        />
        <Integration
          icon={<Camera className="size-5" />}
          title="Instagram Direct"
          status="phase2"
          description="Bandeja unificada de DMs: convierte una conversación en pedido con un clic y responde con precio y tallas disponibles."
        />
        <Integration
          icon={<Truck className="size-5" />}
          title="Guías de paquetería"
          status="phase2"
          description={`Cotiza y genera guías${carriers.length ? ` de ${carriers.join(", ")}` : " de tu paquetería"} desde el pedido; el cliente recibe su rastreo por WhatsApp.`}
        />
        <Integration
          icon={<FileBadge className="size-5" />}
          title="Facturación CFDI 4.0"
          status="phase3"
          description="Factura electrónica al SAT para mayoristas y distribuidores directo desde la nota de venta o el pedido."
        />
        <Integration
          icon={<Globe className="size-5" />}
          title="Portal de mayoristas"
          status="phase3"
          description="Catálogo privado con precio de mayoreo donde tus revendedores arman su paquete y apartan con anticipo, 24/7."
        />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-sm">Plan de implementación sugerido</CardTitle>
          <CardDescription>Por fases, para que tu equipo lo adopte sin frenar la operación.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {PHASES.map((f, i) => (
            <div key={f.phase} className={cn("rounded-xl border p-4", i === 0 && "border-gold/50 bg-gold/5")}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{f.phase}</span>
                <span className="text-xs text-muted-foreground">{f.time}</span>
              </div>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                {f.items.map((it) => (
                  <li key={it} className="flex gap-2">
                    <CheckCircle2 className={cn("mt-0.5 size-3.5 shrink-0", i === 0 ? "text-gold" : "text-muted-foreground/50")} />
                    {it}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

const STATUS = {
  phase2: { label: "Fase 2", cls: "bg-ch-web/12 text-ch-web" },
  phase3: { label: "Fase 3", cls: "bg-muted text-muted-foreground" },
};

function Integration({ icon, title, description, status }: { icon: ReactNode; title: string; description: string; status: keyof typeof STATUS }) {
  return (
    <Card className="gap-3 px-4 py-4">
      <div className="flex items-center justify-between">
        <div className="grid size-10 place-items-center rounded-lg bg-muted">{icon}</div>
        <Badge className={STATUS[status].cls}>{STATUS[status].label}</Badge>
      </div>
      <div className="font-medium">{title}</div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </Card>
  );
}
