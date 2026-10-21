"use client";

import { Boxes, FileText, Handshake, MessageCircle, Percent, Plus, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { SimpleBars } from "@/components/charts";
import { change, KpiCard, PageHeader, PeriodSelect, QuoteStatusBadge, ShareBar } from "@/components/erp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { onlyDigits } from "@/lib/clabe";
import { CUSTOMER_TYPE_LABEL } from "@/lib/constants";
import { fDate, fRelative, mxn, num, pct } from "@/lib/format";
import { inRange, type Period, periodRange, salesSummary, wholesaleBuyers, wholesaleMonthly, wholesaleOrders } from "@/lib/metrics";
import { useBusinessName, useErp, useIsOwner, useWholesaleEnabled } from "@/lib/store";
import { cn } from "@/lib/utils";
import { tierPrice, WHOLESALE_TERMS } from "@/lib/wholesale";
import { WholesaleDisabled } from "./_comunes";

const DAY = 86_400_000;

export default function MayoreoPage() {
  return useWholesaleEnabled() ? <Mayoreo /> : <WholesaleDisabled />;
}

function Analisis() {
  const customers = useErp((s) => s.customers);
  const orders = useErp((s) => s.orders);
  const businessName = useBusinessName();
  const [period, setPeriod] = useState<Period>("mes");
  const buyers = useMemo(() => wholesaleBuyers(customers, orders, periodRange(period).cur), [customers, orders, period]);
  const monthly = useMemo(() => wholesaleMonthly(orders), [orders]);
  const top = buyers.filter((b) => b.revenue > 0).slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <PeriodSelect value={period} onChange={setPeriod} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Mejores mayoristas</CardTitle>
            <CardDescription>Top 10 por venta neta de mayoreo en el periodo.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {top.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Sin ventas de mayoreo en este periodo.</p>}
            {top.map((b) => (
              <ShareBar
                key={b.customer.id}
                label={b.customer.business ?? b.customer.name}
                value={mxn(b.revenue)}
                share={b.revenue / top[0].revenue}
                color="var(--ch-tienda)"
                sub={`${CUSTOMER_TYPE_LABEL[b.customer.type]} · ${b.periodOrders} ${b.periodOrders === 1 ? "pedido" : "pedidos"}`}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Ventas de mayoreo por mes</CardTitle>
            <CardDescription>Últimos 6 meses; el mes en curso va parcial.</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBars
              data={monthly.map((m) => ({ label: m.month, value: m.revenue, hint: m.partial ? "Mes en curso" : "Venta de mayoreo" }))}
              format={mxn}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 py-0">
        <CardHeader className="py-4">
          <CardTitle className="text-sm">Control de mayoristas</CardTitle>
          <CardDescription>Compras del periodo elegido; el saldo por cobrar es el total abierto del cliente.</CardDescription>
        </CardHeader>
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Cliente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Compras</TableHead>
              <TableHead className="text-right">Pedidos</TableHead>
              <TableHead>Última compra</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead className="pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {buyers.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                  Aún no tienes clientes mayoristas o distribuidores.
                </TableCell>
              </TableRow>
            )}
            {buyers.map(({ customer: c, revenue, periodOrders, last, balance }) => {
              const waText = encodeURIComponent(
                `Hola ${c.name.split(" ")[0]}, te saluda ${businessName}. Ya tenemos nuevos modelos y precios de mayoreo actualizados. ¿Te mando la cotización?`,
              );
              return (
                <TableRow key={c.id}>
                  <TableCell className="pl-4">
                    <Link href={`/clientes?c=${c.id}`} className="font-medium hover:underline">
                      {c.business ?? c.name}
                    </Link>
                    {c.business && <div className="text-xs text-muted-foreground">{c.name}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-gold/40 text-gold">
                      {CUSTOMER_TYPE_LABEL[c.type]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular">{mxn(revenue)}</TableCell>
                  <TableCell className="text-right tabular">{periodOrders}</TableCell>
                  <TableCell className="text-muted-foreground" title={last ? fDate(last) : undefined}>
                    {last ? fRelative(last) : "Sin compras"}
                  </TableCell>
                  <TableCell className={cn("text-right tabular", balance > 0 ? "text-warning" : "text-muted-foreground")}>
                    {balance > 0 ? mxn(balance) : "—"}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <Button asChild size="sm" variant="outline">
                      <a href={`https://wa.me/52${onlyDigits(c.phone).slice(-10)}?text=${waText}`} target="_blank" rel="noreferrer">
                        <MessageCircle /> WhatsApp
                      </a>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function Mayoreo() {
  const wholesale = useErp((s) => s.wholesale);
  const tiers = useMemo(() => [...wholesale.tiers].sort((a, b) => a.minPieces - b.minPieces), [wholesale.tiers]);
  const packages = wholesale.packages;
  const quotes = useErp((s) => s.quotes);
  const orders = useErp((s) => s.orders);
  const products = useErp((s) => s.products);
  const customers = useErp((s) => s.customers);
  const owner = useIsOwner();
  const router = useRouter();
  const [tab, setTab] = useState("cotizaciones");
  const [now] = useState(() => Date.now());

  const stats = useMemo(() => {
    const { cur, prev } = periodRange("mes");
    const monthQuotes = quotes.filter((q) => inRange(q.date, cur));
    const closed = quotes.filter((q) => q.status === "convertida").length;
    const lost = quotes.filter((q) => q.status === "rechazada").length;
    const wholesaleSales = wholesaleOrders(orders);
    const recent = wholesaleSales.filter((o) => now - new Date(o.date).getTime() < 60 * DAY);
    return {
      quoted: monthQuotes.reduce((a, q) => a + q.total, 0),
      quotedN: monthQuotes.length,
      closeRate: closed + lost ? closed / (closed + lost) : 0,
      sales: salesSummary(wholesaleSales, cur),
      salesPrev: salesSummary(wholesaleSales, prev),
      activeBuyers: new Set(recent.map((o) => o.customerId)).size,
      wholesaleCustomers: customers.filter((c) => c.type !== "menudeo").length,
    };
  }, [quotes, orders, customers, now]);

  const sorted = [...quotes].sort((a, b) => b.date.localeCompare(a.date));
  const showcase = products.filter((p) => p.active).slice(0, 8);

  return (
    <>
      <PageHeader
        title="Mayoreo y cotizaciones"
        description="Adiós al Excel: cotiza con la corrida de tallas, aplica el precio por volumen automáticamente y convierte en pedido con un clic."
        actions={
          <Button asChild className="h-9">
            <Link href="/mayoreo/nueva">
              <Plus /> Nueva cotización
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Venta mayoreo del mes"
          value={mxn(stats.sales.revenue)}
          delta={change(stats.sales.revenue, stats.salesPrev.revenue)}
          icon={TrendingUp}
          accent
        />
        <KpiCard label="Cotizado este mes" value={mxn(stats.quoted)} hint={<span>{stats.quotedN} cotizaciones</span>} icon={FileText} />
        <KpiCard label="Tasa de cierre" value={pct(stats.closeRate, 0)} hint="cotizaciones que se vuelven pedido" icon={Handshake} />
        <KpiCard label="Mayoristas activos" value={`${stats.activeBuyers} / ${stats.wholesaleCustomers}`} hint="compraron en 60 días" icon={Boxes} />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-4">
        <TabsList>
          <TabsTrigger value="cotizaciones">Cotizaciones</TabsTrigger>
          <TabsTrigger value="analisis">Análisis</TabsTrigger>
          <TabsTrigger value="esquema">Esquema de precios</TabsTrigger>
        </TabsList>

        <TabsContent value="analisis">
          <Analisis />
        </TabsContent>

        <TabsContent value="cotizaciones">
          <Card className="gap-0 py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Folio</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Piezas</TableHead>
                  <TableHead>Nivel</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Vigencia</TableHead>
                  <TableHead className="pr-4">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((q) => {
                  const expired = (q.status === "enviada" || q.status === "borrador") && new Date(q.validUntil).getTime() < now;
                  return (
                    <TableRow key={q.id} className="cursor-pointer" onClick={() => router.push(`/mayoreo/${q.id}`)}>
                      <TableCell className="pl-4 font-medium">{q.folio}</TableCell>
                      <TableCell className="text-muted-foreground">{fDate(q.date)}</TableCell>
                      <TableCell className="max-w-60 truncate">{q.customerName}</TableCell>
                      <TableCell className="text-right tabular">{q.items.reduce((a, it) => a + it.qty, 0)}</TableCell>
                      <TableCell>
                        <span className="text-xs">{tiers.find((t) => t.id === q.tierId)?.name ?? q.tierId}</span>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular">{mxn(q.total)}</TableCell>
                      <TableCell className={cn("text-xs", expired ? "text-destructive" : "text-muted-foreground")}>
                        {expired ? "Vencida" : fDate(q.validUntil)}
                      </TableCell>
                      <TableCell className="pr-4">
                        <QuoteStatusBadge status={q.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="esquema" className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {tiers.map((t) => (
              <Card key={t.id} className="gap-1 px-4 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{t.name}</span>
                  {t.discount > 0 && (
                    <Badge variant="outline" className="border-gold/40 text-gold">
                      <Percent className="size-3" /> −{Math.round(t.discount * 100)}%
                    </Badge>
                  )}
                </div>
                <div className="text-2xl font-semibold tabular">{t.minPieces}+ pzs</div>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </Card>
            ))}
          </div>

          <Card className="gap-0 pb-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Lista de precios por nivel</CardTitle>
              <CardDescription>
                Se calcula sola a partir del precio de lista. {owner && "Como dueño también ves el margen que te deja cada nivel."}
              </CardDescription>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Producto</th>
                    {tiers.map((t) => (
                      <th key={t.id} className="py-2 pr-4 text-right font-medium">
                        {t.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {showcase.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{p.name}</div>
                        {owner && <div className="text-xs text-muted-foreground">Costo {mxn(p.cost)}</div>}
                      </td>
                      {tiers.map((t) => {
                        const price = tierPrice(p.price, t);
                        return (
                          <td key={t.id} className="py-2.5 pr-4 text-right tabular">
                            <div className="font-medium">{mxn(price)}</div>
                            {owner && <div className="text-xs text-muted-foreground">margen {pct((price - p.cost) / price, 0)}</div>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {packages.length === 0 && owner && (
            <Card className="gap-1 px-4 py-4">
              <span className="text-sm font-semibold">Paquetes de mayoreo</span>
              <p className="text-xs text-muted-foreground">
                Define paquetes con una mezcla de categorías para armar cotizaciones con un clic.{" "}
                <Link href="/configuracion" className="text-gold underline-offset-4 hover:underline">
                  Configurar paquetes
                </Link>
              </p>
            </Card>
          )}

          <div className="grid gap-3 lg:grid-cols-3">
            {packages.map((pkg) => (
              <Card key={pkg.id} className="gap-2 px-4 py-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{pkg.name}</span>
                  <Badge variant="secondary">{pkg.pieces} pzs</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{pkg.description}</p>
                <ul className="mt-1 flex flex-col gap-0.5 text-xs">
                  {pkg.mix.map((m) => (
                    <li key={m.category} className="flex justify-between">
                      <span className="text-muted-foreground">{m.category}</span>
                      <span className="tabular">{m.qty} pzs</span>
                    </li>
                  ))}
                </ul>
                <Button asChild variant="outline" size="sm" className="mt-2">
                  <Link href={`/mayoreo/nueva?paquete=${pkg.id}`}>Cotizar este paquete</Link>
                </Button>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Condiciones comerciales</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                {WHOLESALE_TERMS.conditions.map((c) => (
                  <li key={c} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold" />
                    {c}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                {[
                  wholesale.depositPct > 0 && `Anticipo: ${num(wholesale.depositPct * 100)}%`,
                  wholesale.freeShippingFrom > 0 && `Envío gratis desde ${mxn(wholesale.freeShippingFrom)}`,
                  wholesale.validityDays > 0 && `Vigencia ${wholesale.validityDays} días`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {" "}
                {owner && (
                  <Link href="/configuracion" className="text-gold underline-offset-4 hover:underline">
                    Cambiar en Configuración
                  </Link>
                )}
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
