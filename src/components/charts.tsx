"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHANNEL_COLOR, CHANNEL_LABEL, CHANNELS } from "@/lib/constants";
import { fDay, mxn, mxnShort, num } from "@/lib/format";
import type { DailyRow } from "@/lib/metrics";

const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" };

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

interface TipRow {
  label: string;
  value: string;
  color?: string;
  strong?: boolean;
}

function TooltipBox({ title, rows }: { title: string; rows: TipRow[] }) {
  return (
    <div className="min-w-44 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
      <div className="mb-1.5 font-medium">{title}</div>
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.label} className={`flex items-center justify-between gap-4 ${r.strong ? "mt-0.5 border-t pt-1 font-medium" : ""}`}>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              {r.color && <span className="size-2 rounded-[2px]" style={{ background: r.color }} />}
              {r.label}
            </span>
            <span className="tabular">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ventas diarias apiladas por canal                                    */
/* ------------------------------------------------------------------ */
export function ChannelStackedBars({ data, height = 260 }: { data: DailyRow[]; height?: number }) {
  const last = CHANNELS[CHANNELS.length - 1];
  return (
    <div className="flex flex-col gap-3">
      <Legend items={CHANNELS.map((c) => ({ label: CHANNEL_LABEL[c], color: CHANNEL_COLOR[c] }))} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }} barCategoryGap="18%">
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => fDay(`${d}T12:00:00`)}
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis tickFormatter={mxnShort} tick={AXIS} tickLine={false} axisLine={false} width={52} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as DailyRow;
                return (
                  <TooltipBox
                    title={fDay(`${label}T12:00:00`)}
                    rows={[
                      ...CHANNELS.filter((c) => row[c] > 0).map((c) => ({ label: CHANNEL_LABEL[c], value: mxn(row[c]), color: CHANNEL_COLOR[c] })),
                      { label: "Total", value: mxn(row.total), strong: true },
                    ]}
                  />
                );
              }}
            />
            {CHANNELS.map((c) => (
              <Bar
                key={c}
                dataKey={c}
                stackId="ventas"
                fill={CHANNEL_COLOR[c]}
                stroke="var(--card)"
                strokeWidth={1}
                radius={c === last ? [4, 4, 0, 0] : 0}
                maxBarSize={28}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ingresos vs egresos vs utilidad por mes                              */
/* ------------------------------------------------------------------ */
export interface MonthRow {
  month: string;
  partial: boolean;
  ingresos: number;
  costo: number;
  gastos: number;
  utilidad: number;
  margen: number;
}

const FIN = [
  { key: "ingresos", label: "Ingresos", color: "var(--ch-tienda)" },
  { key: "egresos", label: "Costo de mercancía + gastos", color: "color-mix(in oklch, var(--muted-foreground) 55%, transparent)" },
  { key: "utilidad", label: "Utilidad operativa", color: "var(--ch-web)" },
] as const;

export function FinanceBars({ data, height = 280 }: { data: MonthRow[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, egresos: d.costo + d.gastos, label: d.partial ? `${d.month}*` : d.month }));
  return (
    <div className="flex flex-col gap-3">
      <Legend items={FIN.map((f) => ({ label: f.label, color: f.color }))} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, left: -8, bottom: 0 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={mxnShort} tick={AXIS} tickLine={false} axisLine={false} width={52} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as (typeof rows)[number];
                return (
                  <TooltipBox
                    title={r.partial ? `${r.month} (mes en curso)` : r.month}
                    rows={[
                      { label: "Ingresos", value: mxn(r.ingresos), color: FIN[0].color },
                      { label: "Costo de mercancía", value: mxn(r.costo), color: FIN[1].color },
                      { label: "Gastos operativos", value: mxn(r.gastos), color: FIN[1].color },
                      { label: "Utilidad operativa", value: mxn(r.utilidad), color: FIN[2].color, strong: true },
                      { label: "Margen operativo", value: `${(r.margen * 100).toFixed(1)}%` },
                    ]}
                  />
                );
              }}
            />
            {FIN.map((f) => (
              <Bar key={f.key} dataKey={f.key} fill={f.color} radius={[4, 4, 0, 0]} maxBarSize={36} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Barras simples (una serie)                                           */
/* ------------------------------------------------------------------ */
export function SimpleBars({
  data,
  height = 220,
  unit = "pzs",
  color = "var(--ch-tienda)",
  format,
}: {
  data: { label: string; value: number; hint?: string }[];
  height?: number;
  unit?: string;
  color?: string;
  format?: (v: number) => string;
}) {
  const fmt = format ?? ((v: number) => `${num(v)} ${unit}`);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 4, left: -16, bottom: 0 }} barCategoryGap="24%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={format ? 52 : 44} tickFormatter={format ? mxnShort : undefined} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as { label: string; value: number; hint?: string };
              return <TooltipBox title={r.label} rows={[{ label: r.hint ?? "Vendidas", value: fmt(r.value), color }]} />;
            }}
          />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
