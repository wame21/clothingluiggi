"use client";

import { Clock, PackageCheck, Plus, Search, Truck, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChannelBadge, KpiCard, PageHeader, StatusBadge } from "@/components/erp";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CHANNEL_COLOR, CHANNEL_LABEL } from "@/lib/constants";
import { fDateTime, mxn, num } from "@/lib/format";
import { orderBalance, orderUnits } from "@/lib/metrics";
import { useChannels, useErp } from "@/lib/store";
import type { Channel, OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const TABS: { id: string; label: string; statuses: OrderStatus[] | null }[] = [
  { id: "atender", label: "Por atender", statuses: ["pendiente", "apartado", "pagado"] },
  { id: "enviados", label: "Enviados", statuses: ["enviado"] },
  { id: "entregados", label: "Entregados", statuses: ["entregado"] },
  { id: "cancelados", label: "Cancelados", statuses: ["cancelado"] },
  { id: "todos", label: "Todos", statuses: null },
];

export default function PedidosPage() {
  const orders = useErp((s) => s.orders);
  const activeChannels = useChannels();
  const router = useRouter();
  const [tab, setTab] = useState("atender");
  const [channel, setChannel] = useState<Channel | "all">("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(40);

  // Los canales del negocio más cualquiera que ya tenga pedidos (p. ej. uno que se desactivó después).
  const channels = useMemo(() => {
    const used = new Set(orders.map((o) => o.channel));
    return [...activeChannels, ...[...used].filter((c) => !activeChannels.includes(c))];
  }, [activeChannels, orders]);

  const stats = useMemo(() => {
    const pending = orders.filter((o) => o.status === "pendiente");
    const layaway = orders.filter((o) => o.status === "apartado");
    return {
      pending: { n: pending.length, amount: pending.reduce((a, o) => a + o.total, 0) },
      toShip: orders.filter((o) => o.status === "pagado").length,
      layaway: { n: layaway.length, balance: layaway.reduce((a, o) => a + orderBalance(o), 0) },
      shipped: orders.filter((o) => o.status === "enviado").length,
    };
  }, [orders]);

  const filtered = useMemo(() => {
    const t = TABS.find((x) => x.id === tab)!;
    const term = q.trim().toLowerCase();
    return orders
      .filter((o) => (t.statuses ? t.statuses.includes(o.status) : true))
      .filter((o) => (channel === "all" ? true : o.channel === channel))
      .filter((o) => (term ? `${o.folio} ${o.customerName} ${o.shippingInfo?.tracking ?? ""}`.toLowerCase().includes(term) : true))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [orders, tab, channel, q]);

  return (
    <>
      <PageHeader
        title="Pedidos"
        description="Todos tus canales de venta en un solo lugar."
        actions={
          <Button asChild className="h-9">
            <Link href="/pedidos/nuevo">
              <Plus /> Nuevo pedido
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Pendientes de pago" value={num(stats.pending.n)} hint={<span>{mxn(stats.pending.amount)} por confirmar</span>} icon={Clock} />
        <KpiCard label="Pagados · por enviar" value={num(stats.toShip)} hint="prepara y genera guía" icon={PackageCheck} accent />
        <KpiCard label="Apartados con anticipo" value={num(stats.layaway.n)} hint={<span>saldo {mxn(stats.layaway.balance)}</span>} icon={Wallet} />
        <KpiCard label="En camino" value={num(stats.shipped)} hint="con número de guía" icon={Truck} />
      </div>

      <Card className="mt-4 gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={tab} onValueChange={(v) => { setTab(v); setLimit(40); }}>
            <TabsList className="flex-wrap group-data-horizontal/tabs:h-auto">
              {TABS.map((t) => (
                <TabsTrigger key={t.id} value={t.id}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative lg:w-72">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Folio, cliente o guía…" className="h-9 pl-8" />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 border-b px-4 py-3">
          <button
            onClick={() => setChannel("all")}
            className={cn("rounded-full border px-3 py-1 text-xs transition-colors", channel === "all" ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}
          >
            Todos los canales
          </button>
          {channels.map((c) => (
            <button
              key={c}
              onClick={() => setChannel(c)}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors", channel === c ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}
            >
              <span className="size-2 rounded-full" style={{ background: CHANNEL_COLOR[c] }} />
              {CHANNEL_LABEL[c]}
            </button>
          ))}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Folio</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead className="text-right">Piezas</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead className="pr-4">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, limit).map((o) => {
              const balance = orderBalance(o);
              return (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => router.push(`/pedidos/${o.id}`)}>
                  <TableCell className="pl-4 font-medium">{o.folio}</TableCell>
                  <TableCell className="text-muted-foreground">{fDateTime(o.date)}</TableCell>
                  <TableCell className="max-w-56 truncate">{o.customerName}</TableCell>
                  <TableCell>
                    <ChannelBadge channel={o.channel} />
                  </TableCell>
                  <TableCell className="text-right tabular">{orderUnits(o)}</TableCell>
                  <TableCell className="text-right font-medium tabular">{mxn(o.total)}</TableCell>
                  <TableCell className={cn("text-right tabular", balance > 0 ? "text-warning" : "text-muted-foreground")}>
                    {balance > 0 ? mxn(balance) : "—"}
                  </TableCell>
                  <TableCell className="pr-4">
                    <StatusBadge status={o.status} />
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No hay pedidos con estos filtros.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
          <span>
            Mostrando {Math.min(limit, filtered.length)} de {num(filtered.length)} pedidos
          </span>
          {filtered.length > limit && (
            <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + 60)}>
              Cargar más
            </Button>
          )}
        </div>
      </Card>
    </>
  );
}
