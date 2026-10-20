"use client";

import { ChevronsUpDown, UserPlus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CUSTOMER_TYPE_LABEL } from "@/lib/constants";
import { errorMessage, useErp, useWholesaleEnabled } from "@/lib/store";
import type { Customer, CustomerType } from "@/lib/types";

export function NewCustomerDialog({
  trigger,
  defaultType = "menudeo",
  onCreated,
}: {
  trigger: ReactNode;
  defaultType?: CustomerType;
  onCreated?: (c: Customer) => void;
}) {
  const addCustomer = useErp((s) => s.addCustomer);
  const [open, setOpen] = useState(false);
  const wholesaleOn = useWholesaleEnabled();
  const city = useErp((s) => s.profileSettings.city);
  const empty = { name: "", business: "", phone: "", city, state: "", type: defaultType, instagram: "", rfc: "" };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error("Nombre y teléfono son obligatorios");
      return;
    }
    if (saving) return;
    setSaving(true);
    addCustomer({
      name: form.name.trim(),
      business: form.business.trim() || undefined,
      phone: form.phone.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      type: form.type,
      instagram: form.instagram.trim() || undefined,
      rfc: form.rfc.trim() || undefined,
    })
      .then((c) => {
        toast.success(`Cliente ${c.name} registrado`);
        onCreated?.(c);
        setOpen(false);
        setForm(empty);
      })
      .catch((e) => toast.error(errorMessage(e)))
      .finally(() => setSaving(false));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
          <DialogDescription>Queda guardado con su historial de compras y saldo.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Nombre completo *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Nombre y apellido" />
          </div>
          <div className="grid gap-1.5">
            <Label>WhatsApp *</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="10 dígitos" />
          </div>
          {wholesaleOn && (
            <div className="grid gap-1.5">
              <Label>Tipo de cliente</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as CustomerType }))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CUSTOMER_TYPE_LABEL) as CustomerType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {CUSTOMER_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {wholesaleOn && form.type !== "menudeo" && (
            <>
              <div className="grid gap-1.5">
                <Label>Negocio</Label>
                <Input value={form.business} onChange={(e) => set("business", e.target.value)} placeholder="Nombre de su tienda" />
              </div>
              <div className="grid gap-1.5">
                <Label>RFC (para factura)</Label>
                <Input value={form.rfc} onChange={(e) => set("rfc", e.target.value)} placeholder="Opcional" />
              </div>
            </>
          )}
          <div className="grid gap-1.5">
            <Label>Ciudad</Label>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Estado</Label>
            <Input value={form.state} onChange={(e) => set("state", e.target.value)} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Instagram</Label>
            <Input value={form.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@usuario" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            Guardar cliente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CustomerSelect({
  value,
  onChange,
  wholesaleOnly = false,
  allowGeneral = false,
}: {
  value?: string;
  onChange: (c: Customer | undefined) => void;
  wholesaleOnly?: boolean;
  allowGeneral?: boolean;
}) {
  const customers = useErp((s) => s.customers);
  const wholesaleOn = useWholesaleEnabled();
  const [open, setOpen] = useState(false);
  const list = customers.filter((c) => (wholesaleOnly ? c.type !== "menudeo" : true));
  const selected = customers.find((c) => c.id === value);

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-10 min-w-0 flex-1 justify-between font-normal">
            <span className="truncate">
              {selected ? (
                <>
                  {selected.business ?? selected.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {selected.business ? `${selected.name} · ` : ""}
                    {selected.city}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">{allowGeneral ? "Público general" : "Selecciona un cliente…"}</span>
              )}
            </span>
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(92vw,24rem)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar por nombre, negocio, ciudad o teléfono…" />
            <CommandList className="max-h-72">
              <CommandEmpty>No encontrado.</CommandEmpty>
              {allowGeneral && (
                <CommandGroup>
                  <CommandItem
                    value="publico general"
                    onSelect={() => {
                      onChange(undefined);
                      setOpen(false);
                    }}
                  >
                    Público general
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandGroup heading={wholesaleOnly ? "Mayoristas y distribuidores" : "Clientes"}>
                {list.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.name} ${c.business ?? ""} ${c.city} ${c.phone} ${c.instagram ?? ""} ${c.id}`}
                    onSelect={() => {
                      onChange(c);
                      setOpen(false);
                    }}
                  >
                    <div className="min-w-0">
                      <div className="truncate">{c.business ?? c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.business ? `${c.name} · ` : ""}
                        {c.city}
                        {wholesaleOn && ` · ${CUSTOMER_TYPE_LABEL[c.type]}`}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <NewCustomerDialog
        defaultType={wholesaleOnly ? "mayorista" : "menudeo"}
        onCreated={onChange}
        trigger={
          <Button variant="outline" size="icon" className="size-10" aria-label="Nuevo cliente">
            <UserPlus />
          </Button>
        }
      />
    </div>
  );
}
