"use client";

import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Iniciales del nombre del negocio (máx. 2 letras). */
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase();

/** Iniciales de la app sobre el aro del color de acento (la demo no tiene negocio ni logo). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative grid size-9 shrink-0 place-items-center rounded-full bg-[conic-gradient(from_200deg,color-mix(in_oklch,var(--sidebar-primary),white_20%),color-mix(in_oklch,var(--sidebar-primary),black_25%),color-mix(in_oklch,var(--sidebar-primary),white_30%),color-mix(in_oklch,var(--sidebar-primary),black_25%),color-mix(in_oklch,var(--sidebar-primary),white_20%))] p-[2px]",
        className,
      )}
    >
      <div className="grid size-full place-items-center overflow-hidden rounded-full bg-white dark:bg-[oklch(0.12_0.005_75)]">
        <span className="font-display text-[0.95em] font-semibold leading-none tracking-tight text-[#1b1620] dark:text-[oklch(0.95_0.01_85)]">
          {initialsOf(APP_NAME)}
        </span>
      </div>
    </div>
  );
}

export function BrandLockup() {
  const name = APP_NAME;
  return (
    <div className="flex items-center gap-3">
      <BrandMark />
      <div className="min-w-0 leading-tight">
        <div className="truncate font-display text-lg font-bold uppercase tracking-[0.08em]">{name}</div>
      </div>
    </div>
  );
}
