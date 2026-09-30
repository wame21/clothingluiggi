import { cn } from "@/lib/utils";

/** Monograma "LB" inspirado en el logo de Instagram de la marca. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative grid size-9 shrink-0 place-items-center rounded-full bg-[conic-gradient(from_200deg,oklch(0.86_0.1_88),oklch(0.62_0.13_70),oklch(0.9_0.08_92),oklch(0.62_0.13_70),oklch(0.86_0.1_88))] p-[2px]",
        className,
      )}
    >
      <div className="grid size-full place-items-center rounded-full bg-[oklch(0.12_0.005_75)]">
        <span className="font-display text-[0.95em] font-semibold leading-none tracking-tight text-[oklch(0.95_0.01_85)]">
          LB
        </span>
      </div>
    </div>
  );
}

export function BrandLockup({ subtitle = "ERP · Boutique" }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark />
      <div className="leading-tight">
        <div className="font-display text-xl font-semibold tracking-[0.18em] gold-text">LUIGGI</div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-sidebar-foreground/60">{subtitle}</div>
      </div>
    </div>
  );
}
