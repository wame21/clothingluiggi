import { format, formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";

const mxnFmt = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

const mxnCentsFmt = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numFmt = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });

export const mxn = (n: number) => mxnFmt.format(Math.round(n));
export const mxnCents = (n: number) => mxnCentsFmt.format(n);
export const num = (n: number) => numFmt.format(n);

export const pct = (n: number, digits = 1) =>
  `${(Number.isFinite(n) ? n * 100 : 0).toFixed(digits)}%`;

/** Compact currency for chart axes: $12k, $1.2M */
export const mxnShort = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
};

export const fDate = (iso: string) =>
  format(new Date(iso), "d MMM yyyy", { locale: es });

export const fDateTime = (iso: string) =>
  format(new Date(iso), "d MMM yyyy · HH:mm", { locale: es });

export const fDay = (iso: string) =>
  format(new Date(iso), "d MMM", { locale: es });

export const fLongDate = (iso: string) =>
  format(new Date(iso), "d 'de' MMMM 'de' yyyy", { locale: es });

export const fRelative = (iso: string) =>
  formatDistanceToNowStrict(new Date(iso), { locale: es, addSuffix: true });

export const fMonth = (d: Date) => format(d, "MMM yyyy", { locale: es });
