"use client";

import { ImagePlus, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { BusinessProfile } from "@/lib/settings";
import { errorMessage, useErp } from "@/lib/store";
import type { Business } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Field, SaveBar } from "./fields";

/** Color que se muestra en el selector cuando el negocio no eligió uno. */
const DEFAULT_ACCENT = "#b8892b";
const ACCENTS = ["#b8892b", "#0f766e", "#1d4ed8", "#7c3aed", "#be123c", "#c2410c", "#15803d", "#334155"];

interface Form {
  name: string;
  orderPrefix: string;
  quotePrefix: string;
  legalName: string;
  phone: string;
  email: string;
  instagram: string;
  web: string;
  city: string;
  address: string;
  ticketFooter: string;
  accentColor: string | null;
}

const toForm = (business: Business | null, p: BusinessProfile): Form => ({
  name: business?.name ?? "",
  orderPrefix: business?.orderPrefix ?? "",
  quotePrefix: business?.quotePrefix ?? "",
  legalName: p.legalName,
  phone: p.phone,
  email: p.email,
  instagram: p.instagram,
  web: p.web,
  city: p.city,
  address: p.address,
  ticketFooter: p.ticketFooter,
  accentColor: p.accentColor,
});

const normalize = (f: Form): Form => ({
  ...f,
  name: f.name.trim(),
  orderPrefix: f.orderPrefix.trim(),
  quotePrefix: f.quotePrefix.trim(),
  legalName: f.legalName.trim(),
  phone: f.phone.trim(),
  email: f.email.trim(),
  instagram: f.instagram.trim(),
  web: f.web.trim(),
  city: f.city.trim(),
  address: f.address.trim(),
  ticketFooter: f.ticketFooter.trim(),
});

const PREFIX = /^[A-Za-z0-9\-_.]{1,10}$/;

function validate(f: Form): string[] {
  const errors: string[] = [];
  if (!f.name.trim()) errors.push("Escribe el nombre del negocio");
  if (!PREFIX.test(f.orderPrefix.trim())) errors.push("El prefijo de pedidos lleva de 1 a 10 letras, números, guion o punto");
  if (!PREFIX.test(f.quotePrefix.trim())) errors.push("El prefijo de cotizaciones lleva de 1 a 10 letras, números, guion o punto");
  if (f.orderPrefix.trim() && f.orderPrefix.trim().toLowerCase() === f.quotePrefix.trim().toLowerCase())
    errors.push("Los prefijos de pedidos y cotizaciones deben ser distintos");
  if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) errors.push("El correo no parece válido");
  if (f.accentColor && !/^#[0-9a-f]{6}$/i.test(f.accentColor)) errors.push("El color de acento debe ser un color válido");
  return errors;
}

export function NegocioSection() {
  const business = useErp((s) => s.business);
  const profile = useErp((s) => s.profileSettings);
  const saveBusiness = useErp((s) => s.saveBusiness);
  const saveProfileSettings = useErp((s) => s.saveProfileSettings);
  const uploadLogo = useErp((s) => s.uploadLogo);
  const removeLogo = useErp((s) => s.removeLogo);

  const [form, setForm] = useState(() => toForm(business, profile));
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const errors = validate(form);
  const saved = normalize(toForm(business, profile));
  const dirty = JSON.stringify(normalize(form)) !== JSON.stringify(saved);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (errors.length) return toast.error(errors[0]);
    setSaving(true);
    try {
      const next = normalize(form);
      if (next.name !== saved.name || next.orderPrefix !== saved.orderPrefix || next.quotePrefix !== saved.quotePrefix)
        await saveBusiness({ name: next.name, orderPrefix: next.orderPrefix, quotePrefix: next.quotePrefix });
      // El logo se guarda aparte, por eso se toma el perfil vigente y solo se pisan los campos del formulario
      await saveProfileSettings({
        ...useErp.getState().profileSettings,
        legalName: next.legalName,
        phone: next.phone,
        email: next.email,
        instagram: next.instagram,
        web: next.web,
        city: next.city,
        address: next.address,
        ticketFooter: next.ticketFooter,
        accentColor: next.accentColor,
      });
      setForm(next);
      toast.success("Datos del negocio guardados");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const onLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLogoBusy(true);
    try {
      await uploadLogo(file);
      toast.success("Logo actualizado");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLogoBusy(false);
    }
  };

  const onRemoveLogo = async () => {
    setLogoBusy(true);
    try {
      await removeLogo();
      toast.success("Logo quitado");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Datos del negocio</CardTitle>
          <CardDescription>Aparecen en tickets, notas de venta y cotizaciones.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre del negocio" className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Como lo conocen tus clientes" />
          </Field>
          <Field label="Prefijo de pedidos" hint={`Ejemplo de folio: ${form.orderPrefix.trim() || "…"}1001`}>
            <Input value={form.orderPrefix} onChange={(e) => set("orderPrefix", e.target.value)} placeholder="V-" maxLength={10} />
          </Field>
          <Field label="Prefijo de cotizaciones" hint={`Ejemplo de folio: ${form.quotePrefix.trim() || "…"}0001`}>
            <Input value={form.quotePrefix} onChange={(e) => set("quotePrefix", e.target.value)} placeholder="COT-" maxLength={10} />
          </Field>
          <Field label="Razón social" className="sm:col-span-2">
            <Input value={form.legalName} onChange={(e) => set("legalName", e.target.value)} placeholder="Opcional" />
          </Field>
          <Field label="Teléfono">
            <Input inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Correo">
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Instagram">
            <Input value={form.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@tutienda" />
          </Field>
          <Field label="Sitio web">
            <Input value={form.web} onChange={(e) => set("web", e.target.value)} placeholder="tutienda.com" />
          </Field>
          <Field label="Ciudad">
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="Dirección">
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="Pie del ticket" className="sm:col-span-2" hint="Mensaje al final de cada ticket de venta.">
            <Input value={form.ticketFooter} onChange={(e) => set("ticketFooter", e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Logo</CardTitle>
          <CardDescription>PNG, JPG o WebP de hasta 2 MB. Se guarda al subirlo.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <div className="flex size-24 items-center justify-center overflow-hidden rounded-lg border bg-white p-2">
            {profile.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- el logo viene de Storage y su tamaño es libre
              <img src={profile.logoUrl} alt="Logo del negocio" className="max-h-full max-w-full object-contain" />
            ) : (
              <ImagePlus className="size-6 text-neutral-300" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void onLogo(e)} />
            <Button variant="outline" className="h-9" disabled={logoBusy} onClick={() => fileRef.current?.click()}>
              {logoBusy ? <Loader2 className="animate-spin" /> : <ImagePlus />} {profile.logoUrl ? "Reemplazar logo" : "Subir logo"}
            </Button>
            {profile.logoUrl && (
              <Button variant="ghost" className="h-9" disabled={logoBusy} onClick={() => void onRemoveLogo()}>
                <Trash2 /> Quitar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Color de acento</CardTitle>
          <CardDescription>Se usa en botones, resaltados y detalles de la aplicación.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input
            type="color"
            aria-label="Color de acento"
            value={form.accentColor ?? DEFAULT_ACCENT}
            onChange={(e) => set("accentColor", e.target.value)}
            className="h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
          />
          <div className="flex flex-wrap gap-1.5">
            {ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Usar ${c}`}
                onClick={() => set("accentColor", c)}
                className={cn("size-7 rounded-full border-2 transition", form.accentColor?.toLowerCase() === c ? "border-foreground" : "border-transparent")}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <Button variant="ghost" className="h-9" disabled={form.accentColor === null} onClick={() => set("accentColor", null)}>
            <RotateCcw /> Restablecer
          </Button>
          {form.accentColor === null && <span className="text-xs text-muted-foreground">Usando el color predeterminado.</span>}
        </CardContent>
      </Card>

      <SaveBar errors={errors} dirty={dirty} saving={saving} onSave={() => void save()} />
    </div>
  );
}
