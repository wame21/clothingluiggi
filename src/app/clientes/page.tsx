"use client";

import { AlertCircle, MessageCircle, Search, UserPlus, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { NewCustomerDialog } from "@/components/customer-picker";
import { ChannelBadge, KpiCard, PageHeader, QuoteStatusBadge, StatusBadge } from "@/components/erp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { onlyDigits } from "@/lib/clabe";
import { CUSTOMER_TYPE_LABEL } from "@/lib/constants";
import { fDate, fRelative, mxn, num } from "@/lib/format";
import { orderBalance } from "@/lib/metrics";
import { useBusinessName, useErp, useWholesaleEnabled } from "@/lib/store";
import type { Customer, CustomerType, Order } from "@/lib/types";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;

interface Row {
  customer: Customer;
  orders: Order[];
  total: number;
  balance: number;
  last?: string;
  inactive: boolean;
}

export default function ClientesPage() {
  return (
    <Suspense>
      <Clientes />
    </Suspense>
  );
}

function Clientes() {
  const params = useSearchParams();
  const customers = useErp((s) => s.customers);
  const orders = useErp((s) => s.orders);
  const wholesaleOn = useWholesaleEnabled();
  const [q, setQ] = useState("");
  const [type, setType] = useState<CustomerType | "all" | "inactivos">("all");
  const [selected, setSelected] = useState<string | null>(params.get("c"));
  const [now] = useState(() => Date.now());

  const rows = useMemo<Row[]>(() => {
    const byCustomer = new Map<string, Order[]>();
    for (const o of orders) if (o.customerId && o.status !== "cancelado") byCustomer.set(o.customerId, [...(byCustomer.get(o.customerId) ?? []), o]);
    return customers
      .map((c) => {
        const list = (byCustomer.get(c.id) ?? []).sort((a, b) => b.date.localeCompare(a.date));
        const last = list[0]?.date;
        return {
          customer: c,
          orders: list,
          total: list.reduce((a, o) => a + o.total, 0),
          balance: list.reduce((a, o) => a + orderBalance(o), 0),
          last,
          inactive: c.type !== "menudeo" && (!last || now - new Date(last).getTime() > 30 * DAY),
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [customers, orders, now]);

  const filtered = rows
    .filter((r) => (type === "all" ? true : type === "inactivos" ? r.inactive : r.customer.type === type))
    .filter((r) =>
      q ? `${r.customer.name} ${r.customer.business ?? ""} ${r.customer.city} ${r.customer.phone} ${r.customer.instagram ?? ""}`.toLowerCase().includes(q.toLowerCase()) : true,
    );

  const wholesale = rows.filter((r) => r.customer.type !== "menudeo");
  const ar = rows.reduce((a, r) => a + r.balance, 0);
  const selectedRow = rows.find((r) => r.customer.id === selected);

  return (
    <>
      <PageHeader
        title="Clientes"
        description={`Historial, saldos y frecuencia de compra de cada cliente${wholesaleOn ? ", de menudeo y de mayoreo" : ""}.`}
        actions={
          <NewCustomerDialog
            trigger={
              <Button className="h-9">
                <UserPlus /> Nuevo cliente
              </Button>
            }
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Clientes registrados"
          value={num(customers.length)}
          hint={wholesaleOn ? <span>{wholesale.length} mayoristas y distribuidores</span> : "en tu cartera"}
          icon={Users}
        />
        {wholesaleOn && <KpiCard label="Top 5 mayoristas" value={mxn(wholesale.slice(0, 5).reduce((a, r) => a + r.total, 0))} hint="compras acumuladas" icon={Wallet} accent />}
        <KpiCard label="Saldos por cobrar" value={mxn(ar)} hint="anticipos y pedidos pendientes" icon={Wallet} />
        {wholesaleOn && <KpiCard label="Mayoristas sin comprar 30+ días" value={num(wholesale.filter((r) => r.inactive).length)} hint="oportunidad para reactivar" icon={AlertCircle} />}
      </div>

      <Card className="mt-4 gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {(wholesaleOn ? (["all", "menudeo", "mayorista", "distribuidor", "inactivos"] as const) : (["all", "menudeo"] as const)).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn("rounded-full border px-3 py-1 text-xs transition-colors", type === t ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}
              >
                {t === "all" ? "Todos" : t === "inactivos" ? "Mayoristas inactivos" : CUSTOMER_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="relative md:w-72">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, negocio, ciudad, teléfono…" className="h-9 pl-8" />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Cliente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Ciudad</TableHead>
              <TableHead className="text-right">Pedidos</TableHead>
              <TableHead className="text-right">Total comprado</TableHead>
              <TableHead>Última compra</TableHead>
              <TableHead className="pr-4 text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.customer.id} className="cursor-pointer" onClick={() => setSelected(r.customer.id)}>
                <TableCell className="pl-4">
                  <div className="font-medium">{r.customer.business ?? r.customer.name}</div>
                  <div className="text-xs text-muted-foreground">{r.customer.business ? r.customer.name : r.customer.instagram ?? r.customer.phone}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={r.customer.type === "menudeo" ? "secondary" : "outline"} className={cn(r.customer.type !== "menudeo" && "border-gold/40 text-gold")}>
                    {CUSTOMER_TYPE_LABEL[r.customer.type]}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{r.customer.city}</TableCell>
                <TableCell className="text-right tabular">{r.orders.length}</TableCell>
                <TableCell className="text-right font-medium tabular">{mxn(r.total)}</TableCell>
                <TableCell className={cn("text-sm", r.inactive ? "text-warning" : "text-muted-foreground")}>{r.last ? fRelative(r.last) : "Sin compras"}</TableCell>
                <TableCell className={cn("pr-4 text-right tabular", r.balance > 0 ? "text-warning" : "text-muted-foreground")}>
                  {r.balance > 0 ? mxn(r.balance) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={!!selectedRow} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">{selectedRow && <CustomerSheet row={selectedRow} now={now} />}</SheetContent>
      </Sheet>
    </>
  );
}

function CustomerSheet({ row, now }: { row: Row; now: number }) {
  const allQuotes = useErp((s) => s.quotes);
  const businessName = useBusinessName();
  const wholesaleOn = useWholesaleEnabled();
  const c = row.customer;
  const quotes = allQuotes.filter((q) => q.customerId === c.id);
  const pieces = row.orders.reduce((a, o) => a + o.items.reduce((b, it) => b + it.qty, 0), 0);
  const dates = row.orders.map((o) => new Date(o.date).getTime()).sort((a, b) => a - b);
  const avgGap = dates.length > 1 ? (dates[dates.length - 1] - dates[0]) / (dates.length - 1) / DAY : 0;
  const favMap = new Map<string, number>();
  for (const o of row.orders) for (const it of o.items) favMap.set(it.name, (favMap.get(it.name) ?? 0) + it.qty);
  const favorite = [...favMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const waPhone = `52${onlyDigits(c.phone).slice(-10)}`;
  const waText = encodeURIComponent(
    !wholesaleOn || c.type === "menudeo"
      ? `Hola ${c.name.split(" ")[0]}, te saluda ${businessName}. Nos llegó mercancía nueva que te va a gustar.`
      : `Hola ${c.name.split(" ")[0]}, te saluda ${businessName}. Ya tenemos nuevos modelos para tu tienda y precios de mayoreo actualizados. ¿Te mando la cotización?`,
  );

  return (
    <>
      <SheetHeader>
        <SheetTitle className="text-lg">{c.business ?? c.name}</SheetTitle>
        <SheetDescription>
          {c.business && `${c.name} · `}
          {CUSTOMER_TYPE_LABEL[c.type]} · {[c.city, c.state].filter(Boolean).join(", ")} · cliente desde {fDate(c.since)}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-5 px-4 pb-6">
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <span>Tel. {c.phone}</span>
          {c.instagram && <span>· {c.instagram}</span>}
          {c.rfc && <span>· RFC {c.rfc}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <a href={`https://wa.me/${waPhone}?text=${waText}`} target="_blank" rel="noreferrer">
              <MessageCircle /> Escribir por WhatsApp
            </a>
          </Button>
          {wholesaleOn && c.type !== "menudeo" && (
            <Button asChild size="sm" variant="outline">
              <Link href="/mayoreo/nueva">Nueva cotización</Link>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Comprado" value={mxn(row.total)} />
          <Stat label="Pedidos" value={num(row.orders.length)} />
          <Stat label="Piezas" value={num(pieces)} />
          <Stat label="Compra cada" value={avgGap ? `${Math.round(avgGap)} días` : "—"} />
        </div>

        {row.inactive && row.last && (
          <p className="rounded-lg bg-warning/15 px-3 py-2 text-xs text-warning">
            No compra desde {fRelative(row.last)} ({Math.round((now - new Date(row.last).getTime()) / DAY)} días). Buen momento para ofrecerle un paquete.
          </p>
        )}

        {favorite.length > 0 && (
          <div>
            <div className="mb-1.5 text-sm font-medium">Lo que más compra</div>
            <div className="flex flex-wrap gap-1.5">
              {favorite.map(([name, n]) => (
                <Badge key={name} variant="secondary">
                  {name} · {n} pzs
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-1.5 text-sm font-medium">Historial de pedidos</div>
          <div className="flex flex-col divide-y rounded-lg border">
            {row.orders.length === 0 && <p className="p-3 text-sm text-muted-foreground">Aún no tiene pedidos.</p>}
            {row.orders.slice(0, 12).map((o) => (
              <Link key={o.id} href={`/pedidos/${o.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-muted/50">
                <div>
                  <div className="font-medium">
                    {o.folio} <span className="font-normal text-muted-foreground">· {fDate(o.date)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <ChannelBadge channel={o.channel} /> · {o.items.reduce((a, it) => a + it.qty, 0)} pzs
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-medium tabular">{mxn(o.total)}</span>
                  <StatusBadge status={o.status} />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {quotes.length > 0 && (
          <div>
            <div className="mb-1.5 text-sm font-medium">Cotizaciones</div>
            <div className="flex flex-col divide-y rounded-lg border">
              {quotes.map((q) => (
                <Link key={q.id} href={`/mayoreo/${q.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-muted/50">
                  <span>
                    {q.folio} <span className="text-muted-foreground">· {fDate(q.date)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular">{mxn(q.total)}</span>
                    <QuoteStatusBadge status={q.status} />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/60 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold tabular">{value}</div>
    </div>
  );
}
