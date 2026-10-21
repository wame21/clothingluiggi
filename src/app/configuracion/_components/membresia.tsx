"use client";

import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaymentInfo } from "@/components/payment-info";
import { MODULE_LABEL } from "@/lib/constants";
import { fDate, mxn } from "@/lib/format";
import { daysLeft, PLAN_NAMES, STATE_LABELS } from "@/lib/membership";
import { useErp } from "@/lib/store";
import { cn } from "@/lib/utils";

export function MembresiaSection() {
  const m = useErp((s) => s.membership);
  const plans = useErp((s) => s.plans);
  if (!m) return null;

  // Lite es gratis y no vence
  const ends = m.plan === "lite" ? null : (m.paidUntil ?? m.trialEndsAt);
  const left = daysLeft(ends);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Plan {PLAN_NAMES[m.plan]}
            <Badge variant={m.state === "vencida" || m.state === "gracia" ? "destructive" : "secondary"}>{STATE_LABELS[m.state]}</Badge>
          </CardTitle>
          <CardDescription>
            {m.effectivePlan !== m.plan && `Hoy usas el plan ${PLAN_NAMES[m.effectivePlan]}. `}
            {ends
              ? `${m.state === "vencida" ? "Venció" : "Vence"} el ${fDate(ends)}${left !== null && left > 0 ? ` (${left} ${left === 1 ? "día" : "días"})` : ""}.`
              : "Sin vencimiento."}
            {m.price > 0 && ` Mensualidad: ${mxn(m.price)}.`}
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.id} className={cn(p.id === m.plan && "ring-2 ring-gold")}>
            <CardHeader>
              <CardTitle>{p.name}</CardTitle>
              <CardDescription>{p.price > 0 ? `${mxn(p.price)} al mes` : "Gratis"}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-1.5 text-sm">
                {p.modules.map((k) => (
                  <li key={k} className="flex items-center gap-2">
                    <Check className="size-3.5 text-gold" /> {MODULE_LABEL[k]}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cómo pagar</CardTitle>
          <CardDescription>
            Haz tu transferencia y avísanos: registramos el pago y tu vencimiento se actualiza. Equipo y Configuración van incluidos en todos los planes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentInfo />
        </CardContent>
      </Card>
    </div>
  );
}
