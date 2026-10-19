"use client";

import { ArchiveRestore, ArrowDown, ArrowUp, Archive, Loader2, Pencil, Plus, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { errorMessage, useBranches, useErp, type BranchInput } from "@/lib/store";
import type { Branch } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Field } from "./fields";

const toInput = (b: Branch): BranchInput => ({
  id: b.id,
  name: b.name,
  short: b.short,
  address: b.address,
  pos: b.pos,
  isWarehouse: b.isWarehouse,
  active: b.active,
  sort: b.sort,
});

export function SucursalesSection() {
  const branches = useBranches();
  const saveBranch = useErp((s) => s.saveBranch);
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    try {
      await fn();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const toggleActive = (b: Branch) => {
    if (b.active && b.isWarehouse)
      return toast.error("Primero elige otra sucursal que surta mayoreo y pedidos en línea");
    void run(b.id, async () => {
      await saveBranch({ ...toInput(b), active: !b.active });
      toast.success(b.active ? "Sucursal archivada" : "Sucursal reactivada");
    });
  };

  /** Reordena renumerando `sort` de toda la lista, porque varias sucursales pueden compartir el mismo valor. */
  const move = (i: number, dir: -1 | 1) => {
    const list = [...branches];
    [list[i], list[i + dir]] = [list[i + dir], list[i]];
    void run(list[i].id, async () => {
      for (const [j, b] of list.entries()) if (b.sort !== j) await saveBranch({ ...toInput(b), sort: j });
    });
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Sucursales</CardTitle>
          <CardDescription>
            Cada sucursal lleva su propio inventario. Las sucursales no se borran: si dejas de usar una, archívala y se conserva su historial.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {branches.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay sucursales.</p>}
          {branches.map((b, i) => (
            <div key={b.id} className={cn("flex flex-wrap items-center gap-3 rounded-lg border p-3", !b.active && "opacity-60")}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{b.name}</span>
                  <span className="text-xs text-muted-foreground">({b.short})</span>
                  {b.pos && <Badge variant="secondary">Mostrador</Badge>}
                  {b.isWarehouse && <Badge variant="secondary">Surte mayoreo y en línea</Badge>}
                  {!b.active && <Badge variant="outline">Archivada</Badge>}
                </div>
                {b.address && <div className="mt-0.5 truncate text-xs text-muted-foreground">{b.address}</div>}
              </div>
              <div className="flex items-center gap-1">
                {busy === b.id && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                <Button variant="ghost" size="icon" aria-label="Subir" disabled={busy !== null || i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Bajar" disabled={busy !== null || i === branches.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown />
                </Button>
                <Button variant="ghost" className="h-8" disabled={busy !== null} onClick={() => setEditing(b)}>
                  <Pencil /> Editar
                </Button>
                <Button variant="ghost" className="h-8" disabled={busy !== null} onClick={() => toggleActive(b)}>
                  {b.active ? <Archive /> : <ArchiveRestore />} {b.active ? "Archivar" : "Reactivar"}
                </Button>
              </div>
            </div>
          ))}
          <div>
            <Button variant="outline" className="h-9" onClick={() => setEditing("new")}>
              <Plus /> Nueva sucursal
            </Button>
          </div>
        </CardContent>
      </Card>

      {editing && (
        <BranchDialog
          key={editing === "new" ? "new" : editing.id}
          branch={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function BranchDialog({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const branches = useBranches();
  const saveBranch = useErp((s) => s.saveBranch);
  const [form, setForm] = useState({
    name: branch?.name ?? "",
    short: branch?.short ?? "",
    address: branch?.address ?? "",
    pos: branch?.pos ?? true,
    isWarehouse: branch?.isWarehouse ?? false,
    active: branch?.active ?? true,
  });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const replaced = form.isWarehouse ? branches.find((b) => b.isWarehouse && b.id !== branch?.id) : undefined;

  const errors: string[] = [];
  if (!form.name.trim()) errors.push("Escribe el nombre de la sucursal");
  if (!form.short.trim()) errors.push("Escribe el nombre corto");
  if (form.short.trim().length > 20) errors.push("El nombre corto lleva máximo 20 caracteres");
  if (form.isWarehouse && !form.active) errors.push("Una sucursal archivada no puede surtir mayoreo y pedidos en línea");

  const save = async () => {
    if (errors.length) return toast.error(errors[0]);
    setSaving(true);
    try {
      await saveBranch({
        id: branch?.id,
        name: form.name.trim(),
        short: form.short.trim(),
        address: form.address.trim(),
        pos: form.pos,
        isWarehouse: form.isWarehouse,
        active: form.active,
      });
      toast.success(branch ? "Sucursal guardada" : "Sucursal creada");
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{branch ? "Editar sucursal" : "Nueva sucursal"}</DialogTitle>
          <DialogDescription>
            {branch ? "Los cambios se aplican a todo tu equipo." : "Se crea con existencias en cero para todos tus productos."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Nombre">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ej. Sucursal Centro" />
          </Field>
          <Field label="Nombre corto" hint="Se usa en etiquetas y gráficas.">
            <Input value={form.short} onChange={(e) => set("short", e.target.value)} placeholder="Ej. Centro" maxLength={20} />
          </Field>
          <Field label="Dirección">
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <SwitchRow
            label="Vende en mostrador"
            hint="Aparece en el Punto de venta."
            checked={form.pos}
            onChange={(v) => set("pos", v)}
          />
          <SwitchRow
            label="Surte mayoreo y pedidos en línea"
            hint={
              replaced
                ? `Solo una sucursal puede surtir: dejará de hacerlo ${replaced.short}.`
                : "Solo una sucursal puede surtir; de aquí se aparta el inventario."
            }
            checked={form.isWarehouse}
            onChange={(v) => set("isWarehouse", v)}
          />
          <SwitchRow
            label="Activa"
            hint="Las sucursales archivadas no aparecen al vender ni al mover inventario."
            checked={form.active}
            onChange={(v) => set("active", v)}
          />
          {errors.length > 0 && (
            <ul className="flex flex-col gap-1 text-xs text-destructive" role="alert">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SwitchRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <span className="grid gap-0.5">
        <span className="text-sm font-medium leading-none">{label}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
