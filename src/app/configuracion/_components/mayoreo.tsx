"use client";

import { CheckCircle2, Landmark, Package, Percent, Plus, Trash2, Truck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { bankFromClabe, clabeError, formatClabe, onlyDigits } from "@/lib/clabe";
import { mxn } from "@/lib/format";
import { errorMessage, useCategories, useErp } from "@/lib/store";
import { uid } from "@/lib/variants";
import type { WholesaleSettings } from "@/lib/wholesale";
import { Field, NumberInput, SaveBar } from "./fields";

/** El formulario trabaja en porcentajes enteros; la base guarda fracciones (0.22). */
interface Form {
  enabled: boolean;
  clabe: string;
  bank: string;
  holder: string;
  depositPct: number;
  freeShippingFrom: number;
  flatShipping: number;
  validityDays: number;
  distributorCustomerMin: number;
  tiers: { id: string; name: string; minPieces: number; discountPct: number }[];
  packages: { id: string; name: string; description: string; mix: { category: string; qty: number }[] }[];
}

const toForm = (w: WholesaleSettings): Form => ({
  enabled: w.enabled,
  clabe: w.bank.clabe,
  bank: w.bank.bank,
  holder: w.bank.holder,
  depositPct: Math.round(w.depositPct * 100),
  freeShippingFrom: w.freeShippingFrom,
  flatShipping: w.flatShipping,
  validityDays: w.validityDays,
  distributorCustomerMin: w.distributorCustomerMin,
  tiers: w.tiers.map((t) => ({ id: t.id, name: t.name, minPieces: t.minPieces, discountPct: Math.round(t.discount * 100) })),
  packages: w.packages.map((p) => ({ id: p.id, name: p.name, description: p.description, mix: p.mix.map((m) => ({ ...m })) })),
});

/** Descripción de cada nivel a partir de sus rangos, para que nunca quede desfasada. */
function tierDescription(f: Form, i: number) {
  const t = f.tiers[i];
  const next = f.tiers[i + 1];
  if (i === 0 || t.discountPct === 0) return "Precio de lista";
  if (!next) return `${t.minPieces}+ piezas${f.distributorCustomerMin > 0 ? ` o clientes distribuidores desde ${f.distributorCustomerMin}` : ""}`;
  return `${t.minPieces} a ${next.minPieces - 1} piezas surtidas`;
}

const fromForm = (f: Form): WholesaleSettings => ({
  enabled: f.enabled,
  tiers: f.tiers.map((t, i) => ({
    id: t.id,
    name: t.name.trim(),
    // El primer nivel es siempre el precio de lista desde 1 pieza
    minPieces: i === 0 ? 1 : t.minPieces,
    discount: i === 0 ? 0 : t.discountPct / 100,
    description: tierDescription(f, i),
  })),
  distributorCustomerMin: f.distributorCustomerMin,
  depositPct: f.depositPct / 100,
  freeShippingFrom: f.freeShippingFrom,
  flatShipping: f.flatShipping,
  validityDays: f.validityDays,
  packages: f.packages.map((p) => ({
    id: p.id,
    name: p.name.trim(),
    description: p.description.trim(),
    pieces: p.mix.reduce((a, m) => a + m.qty, 0),
    mix: p.mix.map((m) => ({ category: m.category, qty: m.qty })),
  })),
  bank: { bank: f.bank.trim(), holder: f.holder.trim(), clabe: onlyDigits(f.clabe) },
});

function validate(f: Form): string[] {
  // Con mayoreo apagado no se bloquea el guardado: la configuración queda guardada para cuando se active
  if (!f.enabled) return [];
  const errors: string[] = [];
  const clabe = clabeError(f.clabe);
  if (clabe) errors.push(clabe);
  if (onlyDigits(f.clabe) && !f.holder.trim()) errors.push("Escribe el titular de la cuenta");
  if (f.depositPct < 0 || f.depositPct > 100) errors.push("El anticipo va de 0% a 100%");
  if (f.validityDays < 1) errors.push("La vigencia debe ser de al menos 1 día");
  if (f.freeShippingFrom < 0 || f.flatShipping < 0) errors.push("Los montos de envío no pueden ser negativos");
  if (f.distributorCustomerMin < 0) errors.push("El mínimo para clientes distribuidores no puede ser negativo (0 lo desactiva)");
  f.tiers.forEach((t, i) => {
    const name = t.name.trim() || `El nivel ${i + 1}`;
    if (!t.name.trim()) errors.push(`El nivel ${i + 1} necesita un nombre`);
    if (t.discountPct < 0 || t.discountPct >= 90) errors.push(`${name}: el descuento va de 0% a 89%`);
    const prev = f.tiers[i - 1];
    if (!prev) return;
    // El primer nivel siempre vale 1 pieza y 0% aunque el formulario guarde otra cosa
    const prevName = prev.name.trim() || `el nivel ${i}`;
    if (t.minPieces <= (i === 1 ? 1 : prev.minPieces)) errors.push(`${name} debe empezar en más piezas que ${prevName}`);
    if (t.discountPct < (i === 1 ? 0 : prev.discountPct)) errors.push(`${name} no puede tener menos descuento que ${prevName}`);
  });
  f.packages.forEach((p, i) => {
    const name = p.name.trim() || `El paquete ${i + 1}`;
    if (!p.name.trim()) errors.push(`El paquete ${i + 1} necesita un nombre`);
    if (p.mix.length === 0) errors.push(`${name} necesita al menos una categoría`);
    if (p.mix.some((m) => !m.category || !(m.qty >= 1))) errors.push(`${name}: cada línea lleva categoría y al menos 1 pieza`);
  });
  return errors;
}

export function MayoreoSection() {
  const wholesale = useErp((s) => s.wholesale);
  const saveWholesale = useErp((s) => s.saveWholesale);
  const categories = useCategories();
  const [form, setForm] = useState(() => toForm(wholesale));
  const [saving, setSaving] = useState(false);

  const errors = validate(form);
  const dirty = JSON.stringify(fromForm(form)) !== JSON.stringify(fromForm(toForm(wholesale)));
  const clabeDigits = onlyDigits(form.clabe);
  const clabeOk = clabeDigits.length === 18 && !clabeError(form.clabe);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setTier = (i: number, patch: Partial<Form["tiers"][number]>) =>
    setForm((f) => ({ ...f, tiers: f.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));
  const setPackage = (i: number, patch: Partial<Form["packages"][number]>) =>
    setForm((f) => ({ ...f, packages: f.packages.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const setMix = (i: number, k: number, patch: Partial<Form["packages"][number]["mix"][number]>) =>
    setPackage(i, { mix: form.packages[i].mix.map((m, j) => (j === k ? { ...m, ...patch } : m)) });

  const addTier = () =>
    setForm((f) => {
      const last = f.tiers[f.tiers.length - 1];
      const tier = {
        id: uid("n-"),
        name: "",
        minPieces: last ? last.minPieces + 10 : 1,
        discountPct: last ? Math.min(last.discountPct + 5, 89) : 0,
      };
      return { ...f, tiers: [...f.tiers, tier] };
    });

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
      toast.success("Configuración de mayoreo guardada", { description: "Las cotizaciones y notas ya usan estos datos" });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const saveBar = <SaveBar errors={errors} dirty={dirty} saving={saving} onSave={() => void save()} />;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardContent className="flex items-center justify-between gap-4">
            <label className="grid flex-1 gap-0.5" htmlFor="mayoreo-enabled">
              <span className="text-sm font-medium">Vendo por mayoreo</span>
              <span className="text-xs text-muted-foreground">
                Activa el módulo de Mayoreo: cotizaciones con niveles de precio, paquetes y el canal de venta de mayoreo.
              </span>
            </label>
            <Switch id="mayoreo-enabled" checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
          </CardContent>
        </Card>

        {form.enabled && (
          <>
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
                <CardDescription>Se imprimen en las cotizaciones y calculan el anticipo y el envío. Un 0 desactiva la condición.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Anticipo para apartar" suffix="%">
                  <NumberInput value={form.depositPct} onChange={(v) => set("depositPct", v)} />
                </Field>
                <Field label="Envío gratis desde" prefix="$" hint="0 = nunca es gratis">
                  <NumberInput value={form.freeShippingFrom} onChange={(v) => set("freeShippingFrom", v)} />
                </Field>
                <Field label="Tarifa fija de envío" prefix="$" hint="0 = sin costo de envío">
                  <NumberInput value={form.flatShipping} onChange={(v) => set("flatShipping", v)} />
                </Field>
                <Field label="Vigencia de cotización" suffix="días">
                  <NumberInput value={form.validityDays} onChange={(v) => set("validityDays", v)} />
                </Field>
                <Field label="Clientes distribuidores desde" suffix="pzs" hint="0 = sin regla especial">
                  <NumberInput value={form.distributorCustomerMin} onChange={(v) => set("distributorCustomerMin", v)} />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Percent className="size-4 text-gold" /> Niveles de precio
                </CardTitle>
                <CardDescription>
                  El nivel se elige solo según el total de piezas del pedido (se pueden mezclar modelos, colores y tallas). El último nivel es el de mayor descuento.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {form.tiers.map((t, i) => (
                  <div key={t.id} className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_130px_130px_auto]">
                    <Field label="Nombre" hint={tierDescription(form, i)}>
                      <Input value={t.name} onChange={(e) => setTier(i, { name: e.target.value })} placeholder="Ej. Mayoreo" />
                    </Field>
                    {i === 0 ? (
                      <p className="text-xs text-muted-foreground sm:col-span-3 sm:pb-2 sm:text-right">Siempre desde 1 pieza, a precio de lista.</p>
                    ) : (
                      <>
                        <Field label="Desde" suffix="pzs">
                          <NumberInput value={t.minPieces} onChange={(v) => setTier(i, { minPieces: v })} />
                        </Field>
                        <Field label="Descuento" suffix="%">
                          <NumberInput value={t.discountPct} onChange={(v) => setTier(i, { discountPct: v })} />
                        </Field>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Quitar ${t.name || "nivel"}`}
                          onClick={() => set("tiers", form.tiers.filter((_, j) => j !== i))}
                        >
                          <Trash2 />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
                <div>
                  <Button variant="outline" className="h-9" onClick={addTier}>
                    <Plus /> Agregar nivel
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Package className="size-4 text-gold" /> Paquetes
                </CardTitle>
                <CardDescription>
                  Surtidos listos para cotizar: eliges cuántas piezas de cada categoría. Se arman con el inventario disponible y la curva de tallas del catálogo.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {form.packages.length === 0 && <p className="text-sm text-muted-foreground">Todavía no tienes paquetes. Son opcionales.</p>}
                {form.packages.map((p, i) => {
                  const pieces = p.mix.reduce((a, m) => a + m.qty, 0);
                  return (
                    <div key={p.id} className="flex flex-col gap-3 rounded-lg border p-3">
                      <div className="grid items-end gap-3 sm:grid-cols-[1fr_1.5fr_auto]">
                        <Field label="Nombre">
                          <Input value={p.name} onChange={(e) => setPackage(i, { name: e.target.value })} placeholder="Ej. Paquete inicial" />
                        </Field>
                        <Field label="Descripción">
                          <Input value={p.description} onChange={(e) => setPackage(i, { description: e.target.value })} placeholder="Para quién es y qué incluye" />
                        </Field>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Quitar ${p.name || "paquete"}`}
                          onClick={() => set("packages", form.packages.filter((_, j) => j !== i))}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                      <div className="flex flex-col gap-2">
                        {p.mix.map((m, k) => {
                          const options = [...new Set([...categories, m.category])].filter(Boolean);
                          return (
                            <div key={k} className="grid grid-cols-[1fr_110px_auto] items-center gap-2">
                              <Select value={m.category} onValueChange={(v) => setMix(i, k, { category: v })}>
                                <SelectTrigger aria-label="Categoría">
                                  <SelectValue placeholder="Categoría" />
                                </SelectTrigger>
                                <SelectContent>
                                  {options.map((c) => (
                                    <SelectItem key={c} value={c}>
                                      {c}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <div className="flex items-center gap-2">
                                <NumberInput value={m.qty} onChange={(v) => setMix(i, k, { qty: v })} />
                                <span className="text-sm text-muted-foreground">pzs</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Quitar línea"
                                onClick={() => setPackage(i, { mix: p.mix.filter((_, j) => j !== k) })}
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          );
                        })}
                        <div className="flex items-center justify-between gap-3">
                          <Button
                            variant="outline"
                            className="h-8"
                            disabled={categories.length === 0}
                            onClick={() => setPackage(i, { mix: [...p.mix, { category: categories[0] ?? "", qty: 1 }] })}
                          >
                            <Plus /> Agregar categoría
                          </Button>
                          <span className="text-xs text-muted-foreground">{pieces} piezas en total</span>
                        </div>
                        {categories.length === 0 && <p className="text-xs text-muted-foreground">Agrega categorías en la pestaña Catálogo para armar paquetes.</p>}
                      </div>
                    </div>
                  );
                })}
                <div>
                  <Button
                    variant="outline"
                    className="h-9"
                    onClick={() =>
                      set("packages", [...form.packages, { id: uid("p-"), name: "", description: "", mix: categories[0] ? [{ category: categories[0], qty: 6 }] : [] }])
                    }
                  >
                    <Plus /> Agregar paquete
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {!form.enabled && saveBar}
      </div>

      {form.enabled && (
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
                {form.depositPct > 0 && <li>Anticipo: {form.depositPct}% del total</li>}
                {form.flatShipping > 0 ? (
                  <li>
                    Envío: {form.freeShippingFrom > 0 ? `gratis desde ${mxn(form.freeShippingFrom)}; si no, ` : ""}
                    {mxn(form.flatShipping)}
                  </li>
                ) : (
                  <li>Envío: sin costo</li>
                )}
                <li>Vigencia: {form.validityDays} días</li>
              </ul>
              {saveBar}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
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
