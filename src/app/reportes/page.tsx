"use client";

import { Lightbulb } from "lucide-react";
import { useMemo, useState } from "react";
import { SimpleBars } from "@/components/charts";
import { ChannelDot, PageHeader, PeriodSelect, SectionTitle, ShareBar } from "@/components/erp";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CHANNEL_LABEL } from "@/lib/constants";
import { mxn, num, pct } from "@/lib/format";
import { byChannel, inRange, isSale, orderCost, orderNet, periodRange, productStats, sizeStats, type Period } from "@/lib/metrics";
import { useErp } from "@/lib/store";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const TOP_SIZES = ["S", "M", "L", "XL", "XXL"];
const BOTTOM_SIZES = ["28", "30", "32", "34", "36"];

export default function ReportesPage() {
  const orders = useErp((s) => s.orders);
  const products = useErp((s) => s.products);
  const customers = useErp((s) => s.customers);
  const [period, setPeriod] = useState<Period>("90d");

  const d = useMemo(() => {
    const { cur } = periodRange(period);
    const channels = byChannel(orders, cur)
      .filter((c) => c.orders > 0)
      .sort((a, b) => b.revenue - a.revenue);
    const totalRevenue = channels.reduce((a, c) => a + c.revenue, 0);

    const prod = [...productStats(orders, cur).entries()]
      .map(([id, s]) => ({ product: products.find((p) => p.id === id), ...s, profit: s.revenue - s.cogs }))
      .filter((x) => x.product)
      .sort((a, b) => b.profit - a.profit);
    const totalProfit = prod.reduce((a, x) => a + x.profit, 0);
    const abc: (typeof prod[number] & { cls: "A" | "B" | "C" })[] = [];
    for (let i = 0, acc = 0; i < prod.length; acc += prod[i].profit, i++) {
      const before = totalProfit ? acc / totalProfit : 0;
      abc.push({ ...prod[i], cls: before < 0.8 ? "A" : before < 0.95 ? "B" : "C" });
    }

    const weekday = Array.from({ length: 7 }, () => ({ revenue: 0, days: new Set<string>() }));
    const stores = new Map<string, { revenue: number; tickets: number }>();
    const buyers = new Map<string, { revenue: number; orders: number }>();
    let net = 0;
    let cost = 0;
    for (const o of orders) {
      if (!isSale(o) || !inRange(o.date, cur)) continue;
      const dt = new Date(o.date);
      weekday[dt.getDay()].revenue += orderNet(o) + o.shipping;
      weekday[dt.getDay()].days.add(dt.toDateString());
      net += orderNet(o);
      cost += orderCost(o);
      if (o.channel === "tienda") {
        const s = stores.get(o.branch) ?? { revenue: 0, tickets: 0 };
        s.revenue += orderNet(o);
        s.tickets++;
        stores.set(o.branch, s);
      }
      if (o.channel === "mayoreo" && o.customerId) {
        const b = buyers.get(o.customerId) ?? { revenue: 0, orders: 0 };
        b.revenue += o.total;
        b.orders++;
        buyers.set(o.customerId, b);
      }
    }

    const wholesale = channels.find((c) => c.channel === "mayoreo");
    const retail = channels.filter((c) => c.channel !== "mayoreo");
    const retailRev = retail.reduce((a, c) => a + c.revenue, 0);
    const retailMargin = retailRev ? retail.reduce((a, c) => a + c.grossProfit, 0) / retailRev : 0;
    const online = channels
      .filter((c) => c.channel === "whatsapp" || c.channel === "instagram" || c.channel === "web")
      .reduce((a, c) => a + c.revenue, 0);

    return {
      channels,
      totalRevenue,
      abc,
      totalProfit,
      sizes: sizeStats(orders, cur),
      weekday: weekday.map((w, i) => ({ label: WEEKDAYS[i], value: w.days.size ? w.revenue / w.days.size : 0, hint: "Venta promedio" })),
      stores: [...stores.entries()].map(([id, s]) => ({ id, ...s })),
      buyers: [...buyers.entries()]
        .map(([id, b]) => ({ customer: customers.find((c) => c.id === id), ...b }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 6),
      insights: [
        wholesale &&
          `El mayoreo aporta ${pct(wholesale.revenue / (totalRevenue || 1), 0)} de tus ventas con margen bruto de ${pct(wholesale.margin, 0)} (menudeo: ${pct(retailMargin, 0)}). Vendes volumen con menos margen: cuida que el anticipo cubra el costo.`,
        `WhatsApp, Instagram y la web suman ${pct(online / (totalRevenue || 1), 0)} de las ventas. Hoy esos pedidos se capturan a mano; con la integración entrarían solos.`,
        `Por cada $100 que vendes, $${Math.round((net ? cost / net : 0) * 100)} son costo de mercancía.`,
      ].filter(Boolean) as string[],
    };
  }, [period, orders, products, customers]);

  const sizeData = (list: string[]) => list.map((s) => ({ label: s, value: d.sizes.get(s) ?? 0 })).filter((x) => x.value > 0);
  const topSizes = sizeData(TOP_SIZES);
  const bottomSizes = sizeData(BOTTOM_SIZES);
  const topTotal = topSizes.reduce((a, x) => a + x.value, 0);
  const storeTotal = d.stores.reduce((a, s) => a + s.revenue, 0);

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Qué canal, qué producto y qué talla te dejan más dinero, para decidir qué comprar y dónde invertir en publicidad."
        actions={<PeriodSelect value={period} onChange={setPeriod} options={["7d", "mes", "mes_pasado", "90d"]} />}
      />

      <Card className="mb-4 bg-gradient-to-br from-gold/10 to-transparent ring-gold/30">
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Lightbulb className="size-4 text-gold" /> Lo que dicen tus números
          </div>
          <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            {d.insights.map((i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-gold" />
                {i}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="gap-0 pb-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Rentabilidad por canal de venta</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-y bg-muted/40 text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Canal</th>
                <th className="py-2 text-right font-medium">Ventas</th>
                <th className="py-2 text-right font-medium">% del total</th>
                <th className="py-2 text-right font-medium">Pedidos</th>
                <th className="py-2 text-right font-medium">Ticket prom.</th>
                <th className="py-2 text-right font-medium">Piezas</th>
                <th className="py-2 text-right font-medium">Utilidad bruta</th>
                <th className="px-4 py-2 text-right font-medium">Margen</th>
              </tr>
            </thead>
            <tbody>
              {d.channels.map((c) => (
                <tr key={c.channel} className="border-b last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-2 font-medium">
                      <ChannelDot channel={c.channel} /> {CHANNEL_LABEL[c.channel]}
                    </span>
                  </td>
                  <td className="py-2.5 text-right font-medium tabular">{mxn(c.revenue)}</td>
                  <td className="py-2.5 text-right text-muted-foreground tabular">{pct(c.revenue / (d.totalRevenue || 1), 0)}</td>
                  <td className="py-2.5 text-right tabular">{num(c.orders)}</td>
                  <td className="py-2.5 text-right tabular">{mxn(c.avgTicket)}</td>
                  <td className="py-2.5 text-right tabular">{num(c.units)}</td>
                  <td className="py-2.5 text-right tabular">{mxn(c.grossProfit)}</td>
                  <td className="px-4 py-2.5 text-right tabular">{pct(c.margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card className="gap-0 pb-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Rentabilidad por producto (clasificación ABC)</CardTitle>
            <CardDescription>A = los modelos que generan el 80% de tu utilidad. Nunca deben faltar.</CardDescription>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-y bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Producto</th>
                  <th className="py-2 text-right font-medium">Piezas</th>
                  <th className="py-2 text-right font-medium">Ventas</th>
                  <th className="py-2 text-right font-medium">Utilidad</th>
                  <th className="py-2 text-right font-medium">Margen</th>
                  <th className="px-4 py-2 text-right font-medium">Clase</th>
                </tr>
              </thead>
              <tbody>
                {d.abc.map((x) => (
                  <tr key={x.product!.id} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      <div className="font-medium">{x.product!.name}</div>
                      <div className="text-xs text-muted-foreground">{pct(x.profit / (d.totalProfit || 1))} de la utilidad</div>
                    </td>
                    <td className="py-2 text-right tabular">{num(x.units)}</td>
                    <td className="py-2 text-right tabular">{mxn(x.revenue)}</td>
                    <td className="py-2 text-right font-medium tabular">{mxn(x.profit)}</td>
                    <td className="py-2 text-right tabular">{pct(x.profit / (x.revenue || 1), 0)}</td>
                    <td className="px-4 py-2 text-right">
                      <Badge
                        variant="outline"
                        className={cn(
                          "w-7 justify-center border-0 ring-1",
                          x.cls === "A" && "bg-gold/15 text-gold ring-gold/40",
                          x.cls === "B" && "bg-muted text-foreground ring-border",
                          x.cls === "C" && "text-muted-foreground ring-border",
                        )}
                      >
                        {x.cls}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <SectionTitle>Curva real de tallas · camisas, polos y playeras</SectionTitle>
            </CardHeader>
            <CardContent>
              <SimpleBars data={topSizes} height={180} />
              <p className="mt-2 text-xs text-muted-foreground">
                Compra en esta proporción: {topSizes.map((s) => `${s.label} ${pct(s.value / (topTotal || 1), 0)}`).join(" · ")}. Así evitas quedarte con
                tallas que no rotan.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <SectionTitle>Curva real de tallas · pantalones, jeans y shorts</SectionTitle>
            </CardHeader>
            <CardContent>
              <SimpleBars data={bottomSizes} height={160} color="var(--ch-web)" />
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <SectionTitle>Venta promedio por día de la semana</SectionTitle>
          </CardHeader>
          <CardContent>
            <SimpleBars data={d.weekday} height={200} format={mxn} />
            <p className="mt-2 text-xs text-muted-foreground">Útil para programar personal, promociones y publicaciones.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionTitle>Sucursales físicas</SectionTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {d.stores.map((s) => (
              <ShareBar
                key={s.id}
                label={s.id === "andara" ? "Plaza Andara" : "Bamoa"}
                value={mxn(s.revenue)}
                share={storeTotal ? s.revenue / storeTotal : 0}
                color="var(--ch-tienda)"
                sub={`${num(s.tickets)} tickets · ticket promedio ${mxn(s.revenue / (s.tickets || 1))}`}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionTitle>Mejores clientes de mayoreo</SectionTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {d.buyers.map((b) => (
              <div key={b.customer?.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0">
                <div className="min-w-0">
                  <div className="truncate font-medium">{b.customer?.business ?? b.customer?.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {b.customer?.city} · {b.orders} pedidos
                  </div>
                </div>
                <span className="font-medium tabular">{mxn(b.revenue)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
