"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { CatalogSettings } from "@/lib/settings";
import { errorMessage, useErp } from "@/lib/store";
import { hasKeySeparator } from "@/lib/variants";
import { Field, round, SaveBar } from "./fields";

/** El formulario trabaja con las tallas como texto separado por comas y la curva en porcentajes. */
interface Form {
  categories: string[];
  presets: { name: string; sizes: string }[];
  curve: Record<string, string>;
}

const parseSizes = (s: string) => [...new Set(s.split(",").map((x) => x.trim()).filter(Boolean))];

const toForm = (c: CatalogSettings): Form => ({
  categories: [...c.categories],
  presets: c.sizePresets.map((p) => ({ name: p.name, sizes: p.sizes.join(", ") })),
  curve: Object.fromEntries(Object.entries(c.sizeCurve).map(([size, w]) => [size, String(round(w * 100, 2))])),
});

/** Tallas que se muestran en la curva: las de los juegos de tallas más las que ya tienen un porcentaje. */
const curveSizes = (f: Form) => [
  ...new Set([...f.presets.flatMap((p) => parseSizes(p.sizes)), ...Object.keys(f.curve).filter((s) => f.curve[s].trim() !== "")]),
];

const fromForm = (f: Form): CatalogSettings => ({
  categories: f.categories.map((c) => c.trim()),
  sizePresets: f.presets.map((p) => ({ name: p.name.trim(), sizes: parseSizes(p.sizes) })),
  sizeCurve: Object.fromEntries(
    curveSizes(f)
      .filter((s) => (f.curve[s] ?? "").trim() !== "")
      .map((s) => [s, round(Number(f.curve[s]) / 100, 6)]),
  ),
});

function validate(f: Form): string[] {
  const errors: string[] = [];
  const names = f.categories.map((c) => c.trim().toLowerCase());
  if (names.some((c) => !c)) errors.push("Hay categorías sin nombre");
  if (new Set(names.filter(Boolean)).size < names.filter(Boolean).length) errors.push("Hay categorías repetidas");
  const presetNames = f.presets.map((p) => p.name.trim().toLowerCase());
  f.presets.forEach((p, i) => {
    if (!p.name.trim()) errors.push(`El juego de tallas ${i + 1} necesita un nombre`);
    const nombre = p.name.trim() || `El juego de tallas ${i + 1}`;
    if (parseSizes(p.sizes).length === 0) errors.push(`${nombre} necesita al menos una talla`);
    if (parseSizes(p.sizes).some(hasKeySeparator)) errors.push(`${nombre} tiene una talla con el carácter «|»`);
  });
  if (new Set(presetNames.filter(Boolean)).size < presetNames.filter(Boolean).length) errors.push("Hay juegos de tallas repetidos");
  for (const s of curveSizes(f)) {
    const raw = (f.curve[s] ?? "").trim();
    if (raw !== "" && (!Number.isFinite(Number(raw)) || Number(raw) < 0 || Number(raw) > 100))
      errors.push(`La talla ${s} de la curva va de 0% a 100%`);
  }
  return errors;
}

export function CatalogoSection() {
  const catalog = useErp((s) => s.catalog);
  const saveCatalog = useErp((s) => s.saveCatalog);
  const [form, setForm] = useState(() => toForm(catalog));
  const [saving, setSaving] = useState(false);

  const errors = validate(form);
  const dirty = JSON.stringify(fromForm(form)) !== JSON.stringify(fromForm(toForm(catalog)));
  const sizes = curveSizes(form);
  const curveTotal = sizes.reduce((a, s) => a + (Number(form.curve[s]) || 0), 0);

  const setCategory = (i: number, v: string) => setForm((f) => ({ ...f, categories: f.categories.map((c, j) => (j === i ? v : c)) }));
  const setPreset = (i: number, patch: Partial<Form["presets"][number]>) =>
    setForm((f) => ({ ...f, presets: f.presets.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));

  const save = async () => {
    if (errors.length) return toast.error(errors[0]);
    setSaving(true);
    try {
      const next = fromForm(form);
      await saveCatalog(next);
      setForm(toForm(next));
      toast.success("Catálogo guardado");
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
          <CardTitle className="text-sm">Categorías</CardTitle>
          <CardDescription>
            Las que aparecen al dar de alta productos. Renombrar o quitar una categoría no cambia los productos que ya la usan.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {form.categories.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input aria-label={`Categoría ${i + 1}`} value={c} onChange={(e) => setCategory(i, e.target.value)} />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Quitar ${c || "categoría"}`}
                onClick={() => setForm((f) => ({ ...f, categories: f.categories.filter((_, j) => j !== i) }))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <div>
            <Button variant="outline" className="h-9" onClick={() => setForm((f) => ({ ...f, categories: [...f.categories, ""] }))}>
              <Plus /> Agregar categoría
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Juegos de tallas</CardTitle>
          <CardDescription>Atajos para capturar las tallas de un producto. Escribe las tallas separadas por comas.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {form.presets.map((p, i) => (
            <div key={i} className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1.5fr_auto]">
              <Field label="Nombre">
                <Input value={p.name} onChange={(e) => setPreset(i, { name: e.target.value })} placeholder="Ej. Ropa S–XL" />
              </Field>
              <Field label="Tallas">
                <Input value={p.sizes} onChange={(e) => setPreset(i, { sizes: e.target.value })} placeholder="S, M, L, XL" />
              </Field>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Quitar ${p.name || "juego de tallas"}`}
                onClick={() => setForm((f) => ({ ...f, presets: f.presets.filter((_, j) => j !== i) }))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <div>
            <Button variant="outline" className="h-9" onClick={() => setForm((f) => ({ ...f, presets: [...f.presets, { name: "", sizes: "" }] }))}>
              <Plus /> Agregar juego de tallas
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Curva de tallas</CardTitle>
          <CardDescription>
            Qué porcentaje de un paquete de mayoreo se reparte en cada talla. Déjala vacía para repartir parejo; a las tallas sin porcentaje les
            toca el promedio de las demás.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {sizes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Agrega tallas en un juego de tallas para definir la curva.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {sizes.map((s) => (
                  <Field key={s} label={s} suffix="%">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.5}
                      value={form.curve[s] ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, curve: { ...f.curve, [s]: e.target.value } }))}
                    />
                  </Field>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Suma: {round(curveTotal, 2)}% (se reparte en proporción, no tiene que sumar 100%)</span>
                {Object.values(form.curve).some((v) => v !== "") && (
                  <Button variant="ghost" className="h-8" onClick={() => setForm((f) => ({ ...f, curve: {} }))}>
                    Repartir parejo
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <SaveBar errors={errors} dirty={dirty} saving={saving} onSave={() => void save()} />
    </div>
  );
}
