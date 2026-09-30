import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CHANNEL_COLOR, CHANNEL_LABEL, QUOTE_STATUS_LABEL, STATUS_SHORT } from "@/lib/constants";
import { pct } from "@/lib/format";
import { PERIOD_LABEL, type Period } from "@/lib/metrics";
import type { Channel, OrderStatus, QuoteStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between print:hidden">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-[1.7rem]">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PeriodSelect({
  value,
  onChange,
  options = ["hoy", "7d", "mes", "mes_pasado", "90d"],
}: {
  value: Period;
  onChange: (p: Period) => void;
  options?: Period[];
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Period)}>
      <SelectTrigger className="h-9 w-44 bg-card">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        {options.map((p) => (
          <SelectItem key={p} value={p}>
            {PERIOD_LABEL[p]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function Delta({ value, invert = false, className }: { value: number; invert?: boolean; className?: string }) {
  if (!Number.isFinite(value)) return null;
  if (Math.abs(value) < 0.0005) return <span className={cn("text-xs text-muted-foreground tabular", className)}>= 0%</span>;
  const up = value >= 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular", good ? "text-success" : "text-destructive", className)}>
      <Icon className="size-3.5" />
      {pct(Math.abs(value))}
    </span>
  );
}

export const change = (cur: number, prev: number) => (prev ? (cur - prev) / Math.abs(prev) : NaN);

export function KpiCard({
  label,
  value,
  delta,
  deltaLabel = "vs. periodo anterior",
  hint,
  icon: Icon,
  invertDelta,
  accent,
}: {
  label: string;
  value: ReactNode;
  delta?: number;
  deltaLabel?: string;
  hint?: ReactNode;
  icon?: LucideIcon;
  invertDelta?: boolean;
  accent?: boolean;
}) {
  return (
    <Card className={cn("gap-2 px-4 py-4", accent && "bg-gradient-to-br from-gold/10 to-transparent ring-gold/40")}>
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        {label}
        {Icon && <Icon className={cn("size-4", accent ? "text-gold" : "text-muted-foreground/70")} />}
      </div>
      <div className="text-2xl font-semibold tracking-tight tabular">{value}</div>
      <div className="flex min-h-4 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {delta !== undefined && Number.isFinite(delta) && (
          <>
            <Delta value={delta} invert={invertDelta} />
            <span>{deltaLabel}</span>
          </>
        )}
        {hint}
      </div>
    </Card>
  );
}

const STATUS_STYLE: Record<OrderStatus, string> = {
  pendiente: "bg-warning/15 text-warning ring-warning/30",
  apartado: "bg-ch-web/12 text-ch-web ring-ch-web/30",
  pagado: "bg-gold/15 text-gold ring-gold/35",
  enviado: "bg-ch-mayoreo/12 text-ch-mayoreo ring-ch-mayoreo/30",
  entregado: "bg-success/12 text-success ring-success/30",
  cancelado: "bg-muted text-muted-foreground ring-border line-through",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant="outline" className={cn("border-0 ring-1", STATUS_STYLE[status])}>
      {STATUS_SHORT[status]}
    </Badge>
  );
}

const QUOTE_STYLE: Record<QuoteStatus, string> = {
  borrador: "bg-muted text-muted-foreground ring-border",
  enviada: "bg-ch-web/12 text-ch-web ring-ch-web/30",
  aceptada: "bg-gold/15 text-gold ring-gold/35",
  convertida: "bg-success/12 text-success ring-success/30",
  rechazada: "bg-destructive/10 text-destructive ring-destructive/25",
};

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return (
    <Badge variant="outline" className={cn("border-0 ring-1", QUOTE_STYLE[status])}>
      {QUOTE_STATUS_LABEL[status]}
    </Badge>
  );
}

export function ChannelDot({ channel, className }: { channel: Channel; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: CHANNEL_COLOR[channel] }} />;
}

export function ChannelBadge({ channel }: { channel: Channel }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
      <ChannelDot channel={channel} />
      {CHANNEL_LABEL[channel]}
    </span>
  );
}

export function ColorSwatch({ hex, className }: { hex: string; className?: string }) {
  return <span className={cn("inline-block size-3 shrink-0 rounded-full ring-1 ring-foreground/20", className)} style={{ background: hex }} />;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <div className="grid size-10 place-items-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {children && <p className="max-w-xs text-xs text-muted-foreground">{children}</p>}
    </div>
  );
}

/** Horizontal share bar with label and value, used for part-to-whole lists. */
export function ShareBar({
  label,
  value,
  share,
  color,
  sub,
}: {
  label: ReactNode;
  value: ReactNode;
  share: number;
  color: string;
  sub?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2 truncate">{label}</span>
        <span className="shrink-0 font-medium tabular">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${Math.max(1, share * 100)}%`, background: color }} />
      </div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
