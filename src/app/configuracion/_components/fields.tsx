"use client";

import { Loader2, Save } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Etiqueta nativa que envuelve el campo, así el texto queda asociado al input. */
export function Field({
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

export const round = (n: number, digits = 4) => Number(n.toFixed(digits));

export function NumberInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
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

/** Errores de la sección, aviso de cambios sin guardar y el botón de guardar. */
export function SaveBar({
  errors,
  dirty,
  saving,
  onSave,
}: {
  errors: string[];
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {errors.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs text-destructive" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : (
        dirty && <p className="text-xs text-gold">Tienes cambios sin guardar.</p>
      )}
      <div>
        <Button className="h-9" disabled={!dirty || saving} onClick={onSave}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Guardar cambios
        </Button>
      </div>
    </div>
  );
}
