"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CHANNEL_LABEL, PAYMENT_LABEL } from "@/lib/constants";
import type { SalesSettings } from "@/lib/settings";
import { errorMessage, useErp, useWholesaleEnabled } from "@/lib/store";
import type { Channel, PaymentMethod } from "@/lib/types";
import { Field, SaveBar } from "./fields";

/** Canales que el negocio elige; `mayoreo` depende del interruptor de Mayoreo. */
const STORE_CHANNELS: Channel[] = ["tienda", "web", "instagram", "whatsapp"];
const METHODS = Object.keys(PAYMENT_LABEL) as PaymentMethod[];

/** El formulario trabaja en porcentajes (texto, para poder dejarlo vacío); la base guarda fracciones (0.036). */
interface Form {
  channels: Channel[];
  carriers: string[];
  fees: Record<PaymentMethod, string>;
}

const round = (n: number, digits = 4) => Number(n.toFixed(digits));

const toForm = (s: SalesSettings): Form => ({
  channels: s.channels.filter((c) => STORE_CHANNELS.includes(c)),
  carriers: [...s.carriers],
  fees: Object.fromEntries(METHODS.map((m) => [m, String(round((s.paymentFees[m] ?? 0) * 100))])) as Record<PaymentMethod, string>,
});

const fromForm = (f: Form): SalesSettings => ({
  channels: STORE_CHANNELS.filter((c) => f.channels.includes(c)),
  carriers: f.carriers.map((c) => c.trim()),
  paymentFees: Object.fromEntries(METHODS.map((m) => [m, round(Number(f.fees[m] || 0) / 100, 6)])) as Record<PaymentMethod, number>,
});

function validate(f: Form): string[] {
  const errors: string[] = [];
  if (f.channels.length === 0) errors.push("Elige al menos un canal de venta");
  const names = f.carriers.map((c) => c.trim().toLowerCase());
  if (names.some((c) => !c)) errors.push("Hay paqueterías sin nombre");
  if (new Set(names.filter(Boolean)).size < names.filter(Boolean).length) errors.push("Hay paqueterías repetidas");
  for (const m of METHODS) {
    const n = Number(f.fees[m] || 0);
    if (!Number.isFinite(n) || n < 0 || n > 100) errors.push(`La comisión de ${PAYMENT_LABEL[m]} va de 0% a 100%`);
  }
  return errors;
}

export function VentasSection() {
  const sales = useErp((s) => s.sales);
  const saveSales = useErp((s) => s.saveSales);
  const wholesaleOn = useWholesaleEnabled();
  const [form, setForm] = useState(() => toForm(sales));
  const [saving, setSaving] = useState(false);

  const errors = validate(form);
  const dirty = JSON.stringify(fromForm(form)) !== JSON.stringify(fromForm(toForm(sales)));

  const toggleChannel = (c: Channel, on: boolean) =>
    setForm((f) => ({ ...f, channels: on ? [...f.channels, c] : f.channels.filter((x) => x !== c) }));

  const save = async () => {
    if (errors.length) return toast.error(errors[0]);
    setSaving(true);
    try {
      const next = fromForm(form);
      await saveSales(next);
      setForm(toForm(next));
      toast.success("Configuración de ventas guardada");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Canales de venta</CardTitle>
          <CardDescription>Por dónde vendes. Se ofrecen al registrar un pedido y en los reportes.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {STORE_CHANNELS.map((c) => (
            <label key={c} className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <span className="text-sm font-medium">{CHANNEL_LABEL[c]}</span>
              <Switch checked={form.channels.includes(c)} onCheckedChange={(on) => toggleChannel(c, on)} />
            </label>
          ))}
          <p className="text-xs text-muted-foreground">
            {CHANNEL_LABEL.mayoreo}: {wholesaleOn ? "activo" : "desactivado"}. Se controla con el interruptor de la pestaña Mayoreo.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Paqueterías</CardTitle>
          <CardDescription>Las opciones al registrar el envío de un pedido.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {form.carriers.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                aria-label={`Paquetería ${i + 1}`}
                value={c}
                onChange={(e) => setForm((f) => ({ ...f, carriers: f.carriers.map((x, j) => (j === i ? e.target.value : x)) }))}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Quitar ${c || "paquetería"}`}
                onClick={() => setForm((f) => ({ ...f, carriers: f.carriers.filter((_, j) => j !== i) }))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <div>
            <Button variant="outline" className="h-9" onClick={() => setForm((f) => ({ ...f, carriers: [...f.carriers, ""] }))}>
              <Plus /> Agregar paquetería
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Comisiones por forma de pago</CardTitle>
          <CardDescription>
            Porcentaje que te cobra cada procesador (con IVA). Se descuenta de la utilidad en los reportes; las formas de pago sin comisión van en 0.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {METHODS.map((m) => (
            <Field key={m} label={PAYMENT_LABEL[m]} suffix="%">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                value={form.fees[m]}
                onChange={(e) => setForm((f) => ({ ...f, fees: { ...f.fees, [m]: e.target.value } }))}
              />
            </Field>
          ))}
        </CardContent>
      </Card>

      <SaveBar errors={errors} dirty={dirty} saving={saving} onSave={() => void save()} />
    </div>
  );
}
