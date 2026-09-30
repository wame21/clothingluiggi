import { BrandMark } from "@/components/brand";
import { BUSINESS } from "@/lib/constants";
import { fLongDate, mxnCents } from "@/lib/format";
import type { Customer, LineItem } from "@/lib/types";
import { formatClabe } from "@/lib/clabe";
import { WHOLESALE_TERMS } from "@/lib/wholesale";

interface Props {
  kind: "cotizacion" | "nota";
  folio: string;
  date: string;
  validUntil?: string;
  customer?: Customer;
  customerName: string;
  items: LineItem[];
  discount: number;
  shipping: number;
  total: number;
  tierName?: string;
  tierDiscount?: number;
  depositPct?: number;
  paid?: number;
  notes?: string;
}

/** Agrupa partidas por modelo + color y muestra la corrida de tallas. */
function groupItems(items: LineItem[]) {
  const map = new Map<string, { name: string; color: string; sizes: { size: string; qty: number }[]; qty: number; listPrice: number; unitPrice: number }>();
  for (const it of items) {
    const key = `${it.productId}|${it.color}|${it.unitPrice}`;
    const g = map.get(key) ?? { name: it.name, color: it.color, sizes: [], qty: 0, listPrice: it.listPrice, unitPrice: it.unitPrice };
    g.sizes.push({ size: it.size, qty: it.qty });
    g.qty += it.qty;
    map.set(key, g);
  }
  return [...map.values()];
}

export function SalesDocument(p: Props) {
  const groups = groupItems(p.items);
  const pieces = p.items.reduce((a, it) => a + it.qty, 0);
  const subtotalList = p.items.reduce((a, it) => a + it.qty * it.listPrice, 0);
  const subtotal = p.items.reduce((a, it) => a + it.qty * it.unitPrice, 0);
  const tierSaving = subtotalList - subtotal;
  const isQuote = p.kind === "cotizacion";
  const deposit = p.depositPct ? Math.round(p.total * p.depositPct) : 0;

  return (
    <div className="print-area mx-auto w-full max-w-[816px] rounded-xl bg-white p-6 text-[13px] text-neutral-900 shadow-xl ring-1 ring-black/5 sm:p-10">
      {/* Encabezado */}
      <div className="flex flex-col gap-6 border-b border-neutral-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <BrandMark className="size-14 text-xl" />
          <div>
            <div className="font-display text-2xl font-semibold tracking-[0.2em]">LUIGGI</div>
            <div className="text-[11px] uppercase tracking-[0.25em] text-neutral-500">Boutique · Mayoreo y menudeo</div>
            <div className="mt-2 text-xs leading-relaxed text-neutral-500">
              {BUSINESS.city} · Envíos a todo México
              <br />
              WhatsApp {BUSINESS.phone} · {BUSINESS.instagram} · {BUSINESS.web}
            </div>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#9a7424]">
            {isQuote ? "Cotización mayoreo" : "Nota de venta"}
          </div>
          <div className="mt-1 text-2xl font-semibold tabular">{p.folio}</div>
          <div className="mt-2 text-xs text-neutral-500">
            Fecha: <span className="text-neutral-800">{fLongDate(p.date)}</span>
            {p.validUntil && (
              <>
                <br />
                Vigencia: <span className="text-neutral-800">{fLongDate(p.validUntil)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Cliente */}
      <div className="grid gap-4 py-5 sm:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">Cliente</div>
          <div className="mt-1 text-base font-semibold">{p.customerName}</div>
          {p.customer && (
            <div className="text-xs leading-relaxed text-neutral-600">
              {p.customer.business && <>{p.customer.name}<br /></>}
              {p.customer.city}, {p.customer.state} · Tel. {p.customer.phone}
              {p.customer.rfc && <><br />RFC: {p.customer.rfc}</>}
            </div>
          )}
        </div>
        {p.tierName && (
          <div className="rounded-lg bg-[#f7f1e3] px-4 py-3 sm:justify-self-end">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9a7424]">Nivel de precio</div>
            <div className="mt-0.5 text-base font-semibold">
              {p.tierName}
              {p.tierDiscount ? <span className="ml-1 text-sm font-medium text-[#9a7424]">−{Math.round(p.tierDiscount * 100)}%</span> : null}
            </div>
            <div className="text-xs text-neutral-600">{pieces} piezas surtidas</div>
          </div>
        )}
      </div>

      {/* Partidas */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-neutral-900 text-left text-[10px] uppercase tracking-[0.15em] text-neutral-600">
            <th className="py-2 pr-2 font-semibold">Modelo</th>
            <th className="py-2 pr-2 font-semibold">Corrida de tallas</th>
            <th className="py-2 pr-2 text-right font-semibold">Pzs</th>
            {tierSaving > 0 && <th className="hidden py-2 pr-2 text-right font-semibold sm:table-cell">P. lista</th>}
            <th className="py-2 pr-2 text-right font-semibold">P. unit.</th>
            <th className="py-2 text-right font-semibold">Importe</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, i) => (
            <tr key={i} className="border-b border-neutral-200 align-top">
              <td className="py-2.5 pr-2">
                <div className="font-medium">{g.name}</div>
                <div className="text-xs text-neutral-500">{g.color}</div>
              </td>
              <td className="py-2.5 pr-2 text-xs text-neutral-600">
                {g.sizes.map((s) => (
                  <span key={s.size} className="mr-1.5 inline-block whitespace-nowrap">
                    {s.size}<span className="text-neutral-400">×</span>{s.qty}
                  </span>
                ))}
              </td>
              <td className="py-2.5 pr-2 text-right tabular">{g.qty}</td>
              {tierSaving > 0 && <td className="hidden py-2.5 pr-2 text-right text-neutral-400 line-through tabular sm:table-cell">{mxnCents(g.listPrice)}</td>}
              <td className="py-2.5 pr-2 text-right tabular">{mxnCents(g.unitPrice)}</td>
              <td className="py-2.5 text-right font-medium tabular">{mxnCents(g.qty * g.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totales */}
      <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:justify-between">
        <div className="text-xs leading-relaxed text-neutral-600 sm:max-w-[55%]">
          {p.notes && (
            <p className="mb-3">
              <span className="font-semibold text-neutral-800">Notas: </span>
              {p.notes}
            </p>
          )}
          {isQuote && (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">Condiciones</div>
              <ul className="mt-1 list-disc pl-4">
                {WHOLESALE_TERMS.conditions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          )}
          {WHOLESALE_TERMS.bank.clabe && (
            <div className="mt-3 rounded-md border border-neutral-200 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">Datos para depósito</div>
              {[WHOLESALE_TERMS.bank.bank, WHOLESALE_TERMS.bank.holder].filter(Boolean).join(" · ")}
              <br />
              CLABE: <span className="font-mono">{formatClabe(WHOLESALE_TERMS.bank.clabe)}</span>
            </div>
          )}
        </div>
        <div className="w-full text-sm sm:w-72">
          {tierSaving > 0 && (
            <>
              <Line label="Subtotal a precio de lista" value={mxnCents(subtotalList)} muted />
              <Line label={`Descuento ${p.tierName ?? "mayoreo"}`} value={`−${mxnCents(tierSaving)}`} gold />
            </>
          )}
          <Line label="Subtotal" value={mxnCents(subtotal)} />
          {p.discount > 0 && <Line label="Descuento adicional" value={`−${mxnCents(p.discount)}`} />}
          <Line label="Envío" value={p.shipping ? mxnCents(p.shipping) : "Sin costo"} />
          <div className="mt-2 flex items-center justify-between border-t-2 border-neutral-900 pt-2 text-lg font-semibold">
            <span>Total</span>
            <span className="tabular">{mxnCents(p.total)}</span>
          </div>
          <div className="mt-0.5 text-right text-[11px] text-neutral-500">Precios con IVA incluido · MXN</div>
          {isQuote && deposit > 0 && (
            <div className="mt-3 rounded-md bg-neutral-900 px-3 py-2 text-white">
              <div className="flex items-center justify-between text-xs">
                <span>Anticipo para apartar ({Math.round((p.depositPct ?? 0) * 100)}%)</span>
                <span className="font-semibold tabular">{mxnCents(deposit)}</span>
              </div>
            </div>
          )}
          {!isQuote && p.paid !== undefined && (
            <>
              <Line label="Pagado" value={mxnCents(p.paid)} />
              <Line label="Saldo pendiente" value={mxnCents(Math.max(0, p.total - p.paid))} strong />
            </>
          )}
        </div>
      </div>

      <div className="mt-8 border-t border-neutral-200 pt-4 text-center text-[11px] tracking-wide text-neutral-400">
        Gracias por tu preferencia · Luiggi Boutique · Guasave, Sinaloa
      </div>
    </div>
  );
}

function Line({ label, value, muted, gold, strong }: { label: string; value: string; muted?: boolean; gold?: boolean; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-0.5 ${muted ? "text-neutral-400" : ""} ${gold ? "font-medium text-[#9a7424]" : ""} ${strong ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
