"use client";

import { ArrowLeft, FileCheck2, PackagePlus, Save, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { CustomerSelect } from "@/components/customer-picker";
import { PageHeader } from "@/components/erp";
import { ItemsBuilder } from "@/components/product-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CUSTOMER_TYPE_LABEL } from "@/lib/constants";
import { mxn, pct } from "@/lib/format";
import { errorMessage, useErp, useIsOwner, useWarehouse, useWholesaleEnabled } from "@/lib/store";
import type { Branch, Product, Quote } from "@/lib/types";
import { cn } from "@/lib/utils";
import { buildLineItems, qtyTotal, stockOf, type QtyMap } from "@/lib/variants";
import { expandPackage, nextTier, shippingFor, tierFor, tierPrice, type WholesalePackage } from "@/lib/wholesale";
import { NoWarehouseNotice, WholesaleDisabled } from "../_comunes";

const DAY = 86_400_000;

export default function NuevaCotizacionPage() {
  return (
    <Suspense>
      <QuoteGate />
    </Suspense>
  );
}

function QuoteGate() {
  const enabled = useWholesaleEnabled();
  const warehouse = useWarehouse();
  if (!enabled) return <WholesaleDisabled />;
  if (!warehouse)
    return (
      <>
        <PageHeader
          title="Nueva cotización de mayoreo"
          actions={
            <Button asChild variant="ghost" className="h-9">
              <Link href="/mayoreo">
                <ArrowLeft /> Mayoreo
              </Link>
            </Button>
          }
        />
        <NoWarehouseNotice />
      </>
    );
  return <QuoteBuilder warehouse={warehouse} />;
}

const idsFromQty = (q: QtyMap) => [...new Set(Object.keys(q).filter((k) => q[k] > 0).map((k) => k.split("|")[0]))];

function QuoteBuilder({ warehouse }: { warehouse: Branch }) {
  const router = useRouter();
  const params = useSearchParams();
  const owner = useIsOwner();
  const products = useErp((s) => s.products);
  const stock = useErp((s) => s.stock);
  const customers = useErp((s) => s.customers);
  const saveQuote = useErp((s) => s.saveQuote);
  const wholesale = useErp((s) => s.wholesale);
  const tiers = useMemo(() => [...wholesale.tiers].sort((a, b) => a.minPieces - b.minPieces), [wholesale.tiers]);
  const packages = wholesale.packages;

  const editId = params.get("id");
  const [existing] = useState(() => useErp.getState().quotes.find((q) => q.id === editId));
  const [customerId, setCustomerId] = useState<string | undefined>(existing?.customerId);
  const [qty, setQty] = useState<QtyMap>(() => {
    if (existing) return Object.fromEntries(existing.items.map((i) => [i.variantKey, i.qty]));
    const s = useErp.getState();
    const pkg = s.wholesale.packages.find((p) => p.id === params.get("paquete"));
    return pkg ? expandPackage(pkg, s.products, s.stock, warehouse.id).lines : {};
  });
  const [productIds, setProductIds] = useState<string[]>(() => idsFromQty(qty));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [freeShipping, setFreeShipping] = useState(existing ? existing.shipping === 0 : false);

  const customer = customers.find((c) => c.id === customerId);
  const pieces = qtyTotal(qty);
  const tier = tierFor(pieces, customer?.type);
  const next = nextTier(pieces, customer?.type);
  const unitPriceOf = (p: Product) => tierPrice(p.price, tier);
  const items = buildLineItems(qty, products, unitPriceOf);
  const subtotalList = items.reduce((a, it) => a + it.qty * it.listPrice, 0);
  const subtotal = items.reduce((a, it) => a + it.qty * it.unitPrice, 0);
  const cost = items.reduce((a, it) => a + it.qty * it.unitCost, 0);
  const shipping = freeShipping ? 0 : shippingFor(subtotal);
  const total = subtotal + shipping;
  const shortages = items.filter((it) => it.qty > stockOf(stock, it.variantKey, warehouse.id));
  const nextMin = next ? pieces + next.missing : pieces;
  const nextSaving = next ? Math.round(subtotalList * (next.tier.discount - tier.discount)) : 0;

  const addPackage = (pkg: WholesalePackage) => {
    const s = useErp.getState();
    // Descuenta lo ya capturado para no sobrepasar el stock disponible
    const adjusted = { ...s.stock };
    for (const [k, v] of Object.entries(qty)) if (adjusted[k]) adjusted[k] = { ...adjusted[k], [warehouse.id]: (adjusted[k][warehouse.id] ?? 0) - v };
    const { lines, shortfall } = expandPackage(pkg, s.products, adjusted, warehouse.id);
    const merged = { ...qty };
    for (const [k, v] of Object.entries(lines)) merged[k] = (merged[k] ?? 0) + v;
    setQty(merged);
    setProductIds([...new Set([...productIds, ...idsFromQty(lines)])]);
    toast.success(`${pkg.name} agregado con curva de tallas`, {
      description: shortfall ? `${shortfall} pzs no se pudieron surtir por falta de stock` : `Todo con stock disponible en ${warehouse.short}`,
    });
  };

  const [saving, setSaving] = useState(false);

  const save = async (status: "borrador" | "enviada") => {
    if (saving) return;
    if (!customer) return toast.error("Selecciona el cliente mayorista");
    if (!items.length) return toast.error("Agrega productos a la cotización");
    const date = existing?.date ?? new Date().toISOString();
    setSaving(true);
    let q: Quote;
    try {
      q = await saveQuote({
      id: existing?.id,
      date,
      validUntil: new Date(new Date(date).getTime() + wholesale.validityDays * DAY).toISOString(),
      customerId: customer.id,
      customerName: customer.business ?? customer.name,
      items,
      tierId: tier.id,
      subtotalList,
      discount: subtotalList - subtotal,
      subtotal,
      shipping,
      total,
      depositPct: wholesale.depositPct,
      status,
      notes: notes.trim() || undefined,
      });
    } catch (e) {
      setSaving(false);
      return toast.error(errorMessage(e));
    }
    toast.success(status === "borrador" ? `Borrador ${q.folio} guardado` : `Cotización ${q.folio} lista para enviar`);
    router.push(`/mayoreo/${q.id}`);
  };

  return (
    <>
      <PageHeader
        title={existing ? `Editar ${existing.folio}` : "Nueva cotización de mayoreo"}
        description="Captura por color y talla como en tu Excel; el nivel de precio, el envío y el anticipo se calculan solos."
        actions={
          <Button asChild variant="ghost" className="h-9">
            <Link href="/mayoreo">
              <ArrowLeft /> Mayoreo
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Cliente mayorista</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <CustomerSelect value={customerId} onChange={(c) => setCustomerId(c?.id)} wholesaleOnly />
              {customer && (
                <p className="text-xs text-muted-foreground">
                  {CUSTOMER_TYPE_LABEL[customer.type]} · {customer.city}, {customer.state} · Tel. {customer.phone}
                  {customer.type === "distribuidor" &&
                    wholesale.distributorCustomerMin > 0 &&
                    ` · desbloquea precio distribuidor desde ${wholesale.distributorCustomerMin} pzs`}
                </p>
              )}
            </CardContent>
          </Card>

          {packages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles className="size-4 text-gold" /> Armar rápido con un paquete
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 md:grid-cols-3">
                {packages.map((pkg) => (
                  <button
                    key={pkg.id}
                    onClick={() => addPackage(pkg)}
                    className="flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors hover:border-gold/60 hover:bg-gold/5"
                  >
                    <span className="flex w-full items-center justify-between text-sm font-medium">
                      {pkg.name}
                      <PackagePlus className="size-4 text-muted-foreground" />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {pkg.pieces} pzs · {pkg.mix.map((m) => m.category.split(" ")[0]).join(", ")}
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Productos · corrida de tallas (stock de {warehouse.short})</CardTitle>
            </CardHeader>
            <CardContent>
              <ItemsBuilder
                branch={warehouse.id}
                qty={qty}
                setQty={setQty}
                unitPriceOf={unitPriceOf}
                productIds={productIds}
                setProductIds={setProductIds}
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4 xl:sticky xl:top-20 xl:self-start">
          <Card className="bg-gradient-to-br from-gold/10 to-transparent ring-gold/40">
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">Nivel de precio</div>
                  <div className="text-xl font-semibold">{tier.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold tabular">{pieces}</div>
                  <div className="text-xs text-muted-foreground">piezas</div>
                </div>
              </div>
              <div className="flex gap-1">
                {tiers.map((t, i) => (
                  <div key={t.id} className={cn("h-1.5 flex-1 rounded-full", i <= tiers.findIndex((x) => x.id === tier.id) ? "bg-gold" : "bg-muted")} />
                ))}
              </div>
              {next ? (
                <div className="flex flex-col gap-1.5">
                  <Progress value={nextMin ? (pieces / nextMin) * 100 : 0} className="h-1" />
                  <p className="text-xs text-muted-foreground">
                    Agrega <b className="text-foreground">{next.missing} pzs</b> y pasa a <b className="text-gold">{next.tier.name}</b> (−
                    {Math.round(next.tier.discount * 100)}%)
                    {nextSaving > 0 && <> · el cliente ahorraría ~{mxn(nextSaving)} más</>}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gold">Precio máximo de volumen alcanzado.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Totales</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm">
              <Row label="Subtotal a precio de lista" value={mxn(subtotalList)} />
              <Row label={`Descuento ${tier.name}`} value={`−${mxn(subtotalList - subtotal)}`} gold={subtotalList > subtotal} />
              <Row label="Subtotal" value={mxn(subtotal)} />
              <Row label="Envío" value={shipping ? mxn(shipping) : "Sin costo"} />
              {wholesale.flatShipping > 0 && (
                <div className="flex items-center justify-between gap-3 py-1">
                  <Label htmlFor="free-ship" className="text-xs font-normal text-muted-foreground">
                    Regalar el envío {wholesale.freeShippingFrom > 0 && subtotal < wholesale.freeShippingFrom && `(gratis desde ${mxn(wholesale.freeShippingFrom)})`}
                  </Label>
                  <Switch id="free-ship" checked={freeShipping} onCheckedChange={setFreeShipping} />
                </div>
              )}
              <Separator className="my-1" />
              <Row label="Total" value={mxn(total)} strong />
              {wholesale.depositPct > 0 && (
                <Row label={`Anticipo para apartar (${Math.round(wholesale.depositPct * 100)}%)`} value={mxn(Math.round(total * wholesale.depositPct))} />
              )}
              {owner && subtotal > 0 && (
                <div className="mt-2 flex flex-col gap-1 rounded-lg bg-muted/60 px-3 py-2 text-xs">
                  <Row label="Costo de la mercancía" value={mxn(cost)} />
                  <Row label="Utilidad estimada" value={`${mxn(subtotal - cost)} · ${pct((subtotal - cost) / subtotal, 0)}`} strong />
                </div>
              )}
              {shortages.length > 0 && (
                <p className="mt-2 rounded-md bg-warning/15 px-3 py-2 text-xs text-warning">
                  {shortages.length} variante(s) superan el stock de {warehouse.short}. Puedes cotizarlas, pero habrá que reabastecer o traspasar antes de surtir.
                </p>
              )}
              <div className="mt-2 grid gap-1.5">
                <Label>Notas para el cliente</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Ej. Entrega en 3 días hábiles después del anticipo." />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => void save("borrador")} disabled={!items.length || saving}>
                  <Save /> Borrador
                </Button>
                <Button onClick={() => void save("enviada")} disabled={!items.length || saving}>
                  <FileCheck2 /> Generar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, strong, gold }: { label: string; value: string; strong?: boolean; gold?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3", strong ? "text-base font-semibold" : "text-muted-foreground")}>
      <span>{label}</span>
      <span className={cn("tabular", !strong && "text-foreground", gold && "text-gold")}>{value}</span>
    </div>
  );
}
