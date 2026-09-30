"use client";

import { CheckCircle2, Landmark, Loader2, Percent, Save, Truck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/erp";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { bankFromClabe, clabeError, formatClabe, onlyDigits } from "@/lib/clabe";
import { mxn } from "@/lib/format";
import { errorMessage, useErp } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { WholesaleSettings } from "@/lib/wholesale";

/** El formulario trabaja en porcentajes enteros; la base guarda fracciones (0.22). */
interface Form {
  clabe: string;
  bank: string;
  holder: string;
  depositPct: number;
  freeShippingFrom: number;
  flatShipping: number;
  validityDays: number;
  distributorCustomerMin: number;
  tiers: { id: WholesaleSettings["tiers"][number]["id"]; name: string; minPieces: number; discountPct: number }[];
}

const toForm = (w: WholesaleSettings): Form => ({
  clabe: w.bank.clabe,
  bank: w.bank.bank,
  holder: w.bank.holder,
  depositPct: Math.round(w.depositPct * 100),
  freeShippingFrom: w.freeShippingFrom,
  flatShipping: w.flatShipping,
  validityDays: w.validityDays,
  distributorCustomerMin: w.distributorCustomerMin,
  tiers: w.tiers.map((t) => ({ id: t.id, name: t.name, minPieces: t.minPieces, discountPct: Math.round(t.discount * 100) })),
});

/** Descripción de cada nivel a partir de sus rangos, para que nunca quede desfasada. */
function tierDescription(f: Form, i: number) {
  const t = f.tiers[i];
  const next = f.tiers[i + 1];
  if (t.discountPct === 0) return "Precio de lista";
  if (!next) return `${t.minPieces}+ piezas o clientes distribuidores desde ${f.distributorCustomerMin}`;
  return `${t.minPieces} a ${next.minPieces - 1} piezas surtidas`;
}

const fromForm = (f: Form): WholesaleSettings => ({
  tiers: f.tiers.map((t, i) => ({
    id: t.id,
    name: t.name,
    minPieces: t.minPieces,
    discount: t.discountPct / 100,
    description: tierDescription(f, i),
  })),
  distributorCustomerMin: f.distributorCustomerMin,
  depositPct: f.depositPct / 100,
  freeShippingFrom: f.freeShippingFrom,
  flatShipping: f.flatShipping,
  validityDays: f.validityDays,
  bank: { bank: f.bank.trim(), holder: f.holder.trim(), clabe: onlyDigits(f.clabe) },
});

function validate(f: Form): string[] {
  const errors: string[] = [];
  const clabe = clabeError(f.clabe);
  if (clabe) errors.push(clabe);
  if (onlyDigits(f.clabe) && !f.holder.trim()) errors.push("Escribe el titular de la cuenta");
  if (f.depositPct < 0 || f.depositPct > 100) errors.push("El anticipo va de 0% a 100%");
  if (f.validityDays < 1) errors.push("La vigencia debe ser de al menos 1 día");
  if (f.freeShippingFrom < 0 || f.flatShipping < 0) errors.push("Los montos de envío no pueden ser negativos");
  if (f.distributorCustomerMin < 1) errors.push("El mínimo para clientes distribuidores debe ser al menos 1 pieza");
  f.tiers.forEach((t, i) => {
    if (t.discountPct < 0 || t.discountPct >= 90) errors.push(`${t.name}: el descuento va de 0% a 89%`);
    const prev = f.tiers[i - 1];
    if (prev && t.minPieces <= prev.minPieces) errors.push(`${t.name} debe empezar en más piezas que ${prev.name}`);
    if (prev && t.discountPct < prev.discountPct) errors.push(`${t.name} no puede tener menos descuento que ${prev.name}`);
  });
  return errors;
}

export default function ConfiguracionPage() {
  const wholesale = useErp((s) => s.wholesale);
  const saveWholesale = useErp((s) => s.saveWholesale);
  const [form, setForm] = useState(() => toForm(wholesale));
  const [saving, setSaving] = useState(false);

  const errors = validate(form);
  const dirty = JSON.stringify(fromForm(form)) !== JSON.stringify(fromForm(toForm(wholesale)));
  const clabeDigits = onlyDigits(form.clabe);
  const clabeOk = clabeDigits.length === 18 && !clabeError(form.clabe);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setTier = (i: number, patch: Partial<Form["tiers"][number]>) =>
    setForm((f) => ({ ...f, tiers: f.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));

  const onClabe = (value: string) => {
    const digits = onlyDigits(value).slice(0, 18);
    setForm((f) => {
      const prevDetected = bankFromClabe(f.clabe);
      const nextDetected = bankFromClabe(digits);
      // Rellena el banco mientras el usuario no haya escrito otro a mano.
      const bank = nextDetected && (!f.bank || f.bank === prevDetected) ? nextDetected : f.bank;
      return { ...f, clabe: digits, bank };
    });
  };

  const save = async () => {
    if (errors.length) return toast.error(errors[0]);
    setSaving(true);
    try {
      const next = fromForm(form);
      await saveWholesale(next);
      setForm(toForm(next));
      toast.success("Configuración guardada", { description: "Las cotizaciones y notas ya usan estos datos" });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const saveButton = (
    <Button className="h-9" disabled={!dirty || saving} onClick={() => void save()}>
      {saving ? <Loader2 className="animate-spin" /> : <Save />} Guardar cambios
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Datos para depósito, condiciones y niveles de mayoreo. Se usan en cotizaciones, notas de venta y en el cotizador de todo tu equipo."
        actions={saveButton}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Landmark className="size-4 text-gold" /> Datos para depósito
              </CardTitle>
              <CardDescription>Aparecen en cada cotización y nota para que el cliente te transfiera el anticipo.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="CLABE interbancaria" className="sm:col-span-2" hint={<ClabeHint raw={form.clabe} ok={clabeOk} />}>
                <Input
                  inputMode="numeric"
                  autoComplete="off"
                  value={formatClabe(form.clabe)}
                  onChange={(e) => onClabe(e.target.value)}
                  placeholder="18 dígitos"
                  className="font-mono tracking-wider"
                  aria-invalid={clabeDigits.length === 18 && !clabeOk}
                />
              </Field>
              <Field label="Banco">
                <Input value={form.bank} onChange={(e) => set("bank", e.target.value)} placeholder="Ej. BBVA" />
              </Field>
              <Field label="Titular de la cuenta">
                <Input value={form.holder} onChange={(e) => set("holder", e.target.value)} placeholder="Nombre como aparece en el banco" />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Truck className="size-4 text-gold" /> Condiciones de mayoreo
              </CardTitle>
              <CardDescription>Se imprimen en las cotizaciones y calculan el anticipo y el envío.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Anticipo para apartar" suffix="%">
                <NumberInput value={form.depositPct} onChange={(v) => set("depositPct", v)} />
              </Field>
              <Field label="Envío gratis desde" prefix="$">
                <NumberInput value={form.freeShippingFrom} onChange={(v) => set("freeShippingFrom", v)} />
              </Field>
              <Field label="Tarifa fija de envío" prefix="$">
                <NumberInput value={form.flatShipping} onChange={(v) => set("flatShipping", v)} />
              </Field>
              <Field label="Vigencia de cotización" suffix="días">
                <NumberInput value={form.validityDays} onChange={(v) => set("validityDays", v)} />
              </Field>
              <Field label="Clientes distribuidores desde" suffix="pzs">
                <NumberInput value={form.distributorCustomerMin} onChange={(v) => set("distributorCustomerMin", v)} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Percent className="size-4 text-gold" /> Niveles de precio
              </CardTitle>
              <CardDescription>El nivel se elige solo según el total de piezas del pedido (se pueden mezclar modelos, colores y tallas).</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {form.tiers.map((t, i) => (
                <div key={t.id} className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_150px_150px]">
                  <div>
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{tierDescription(form, i)}</div>
                  </div>
                  {i === 0 ? (
                    <p className="text-xs text-muted-foreground sm:col-span-2 sm:text-right">Siempre desde 1 pieza, a precio de lista.</p>
                  ) : (
                    <>
                      <Field label="Desde" suffix="pzs">
                        <NumberInput value={t.minPieces} onChange={(v) => setTier(i, { minPieces: v })} />
                      </Field>
                      <Field label="Descuento" suffix="%">
                        <NumberInput value={t.discountPct} onChange={(v) => setTier(i, { discountPct: v })} />
                      </Field>
                    </>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="xl:sticky xl:top-20">
            <CardHeader>
              <CardTitle className="text-sm">Así se verá en tus cotizaciones</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="rounded-md bg-white px-3 py-2 text-xs leading-relaxed text-neutral-700">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">Datos para depósito</div>
                {clabeOk ? (
                  <>
                    {[form.bank.trim(), form.holder.trim()].filter(Boolean).join(" · ")}
                    <br />
                    CLABE: <span className="font-mono">{formatClabe(form.clabe)}</span>
                  </>
                ) : (
                  <span className="text-neutral-400">Sin una CLABE válida este recuadro no aparece en el documento.</span>
                )}
              </div>
              <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                <li>Anticipo: {form.depositPct}% del total</li>
                <li>
                  Envío: gratis desde {mxn(form.freeShippingFrom)}; si no, {mxn(form.flatShipping)}
                </li>
                <li>Vigencia: {form.validityDays} días</li>
              </ul>
              {errors.length > 0 ? (
                <ul className="flex flex-col gap-1 text-xs text-destructive" role="alert">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : (
                dirty && <p className="text-xs text-gold">Tienes cambios sin guardar.</p>
              )}
              {saveButton}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function ClabeHint({ raw, ok }: { raw: string; ok: boolean }) {
  const digits = onlyDigits(raw);
  if (!digits) return <>Déjala vacía si no quieres mostrar datos bancarios.</>;
  if (ok) {
    const bank = bankFromClabe(raw);
    return (
      <span className="flex items-center gap-1 text-success">
        <CheckCircle2 className="size-3.5" /> CLABE válida{bank ? ` · ${bank}` : ""}
      </span>
    );
  }
  if (digits.length < 18) return <>{digits.length} de 18 dígitos</>;
  return <span className="text-destructive">{clabeError(raw)}</span>;
}

/** Etiqueta nativa que envuelve el campo, así el texto queda asociado al input. */
function Field({
  label,
  hint,
  prefix,
  suffix,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  prefix?: string;
  suffix?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("grid gap-1.5", className)}>
      <span className="text-sm font-medium leading-none">{label}</span>
      <span className="flex items-center gap-2">
        {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
        <span className="flex-1">{children}</span>
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={0}
      value={Number.isFinite(value) ? value : ""}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
    />
  );
}
