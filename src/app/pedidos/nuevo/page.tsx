"use client";

import { ArrowLeft, Boxes, Camera, Check, Globe, MessageCircle, Store, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CustomerSelect } from "@/components/customer-picker";
import { PageHeader } from "@/components/erp";
import { ItemsBuilder } from "@/components/product-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { CHANNEL_LABEL, PAYMENT_LABEL } from "@/lib/constants";
import { mxn } from "@/lib/format";
import { errorMessage, useActiveBranches, useBranchName, useChannels, useErp, useWholesaleEnabled } from "@/lib/store";
import type { BranchId, Channel, Customer, PaymentMethod, Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { buildLineItems, qtyTotal, stockOf, type QtyMap } from "@/lib/variants";
import { DISTRIBUTOR_CUSTOMER_MIN, shippingFor, tierFor, tierPrice } from "@/lib/wholesale";

const CHANNEL_META: Record<Channel, { icon: typeof Store; hint: string }> = {
  whatsapp: { icon: MessageCircle, hint: "Pedido por chat" },
  instagram: { icon: Camera, hint: "DM o comentario" },
  web: { icon: Globe, hint: "Captura manual" },
  tienda: { icon: Store, hint: "Apartado en sucursal" },
  mayoreo: { icon: Boxes, hint: "Pedido de mayoreo" },
};

type PayMode = "pagado" | "anticipo" | "pendiente";
type ShipMode = "envio" | "recoge";

export default function NuevoPedidoPage() {
  const router = useRouter();
  const products = useErp((s) => s.products);
  const stock = useErp((s) => s.stock);
  const createOrder = useErp((s) => s.createOrder);
  const carriers = useErp((s) => s.sales.carriers);
  const channels = useChannels();
  const branches = useActiveBranches();
  const branchName = useBranchName();
  const wholesaleOn = useWholesaleEnabled();
  const [saving, setSaving] = useState(false);

  const [channelSel, setChannel] = useState<Channel | undefined>();
  const [customer, setCustomer] = useState<Customer | undefined>();
  const [branchSel, setBranch] = useState<BranchId | undefined>();
  // Por defecto surte la sucursal de pedidos en línea; si no hay, la primera activa.
  const branch = branchSel ?? (branches.find((b) => b.isWarehouse) ?? branches[0])?.id ?? "";
  const channel = channelSel ?? channels[0] ?? "tienda";
  const [qty, setQty] = useState<QtyMap>({});
  const [productIds, setProductIds] = useState<string[]>([]);
  const [discount, setDiscount] = useState(0);
  const [shipMode, setShipMode] = useState<ShipMode>("envio");
  const [carrierSel, setCarrier] = useState<string | undefined>();
  const carrier = carrierSel ?? carriers[0] ?? "";
  const [shippingInput, setShippingInput] = useState<number | null>(null);
  const [payMode, setPayMode] = useState<PayMode>("pagado");
  const [deposit, setDeposit] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("transferencia");
  const [notes, setNotes] = useState("");

  const pieces = qtyTotal(qty);
  const candidate = wholesaleOn && customer && customer.type !== "menudeo" ? tierFor(pieces, customer.type) : undefined;
  const distributorRule = DISTRIBUTOR_CUSTOMER_MIN > 0 && customer?.type === "distribuidor" && pieces >= DISTRIBUTOR_CUSTOMER_MIN;
  const tier = candidate && candidate.discount > 0 && (pieces >= candidate.minPieces || distributorRule) ? candidate : undefined;
  const unitPriceOf = (p: Product) => (tier ? tierPrice(p.price, tier) : p.price);

  const items = buildLineItems(qty, products, unitPriceOf);
  const subtotal = items.reduce((a, it) => a + it.qty * it.unitPrice, 0);
  const suggestedShipping = tier ? shippingFor(subtotal - discount) : 0;
  const shipping = shipMode === "recoge" || subtotal === 0 ? 0 : (shippingInput ?? suggestedShipping);
  const total = Math.max(0, subtotal - discount + shipping);
  const overStock = items.filter((it) => it.qty > stockOf(stock, it.variantKey, branch));
  const paid = payMode === "pagado" ? total : payMode === "anticipo" ? Math.min(deposit, total) : 0;

  const submit = async () => {
    if (saving) return;
    if (!items.length) return toast.error("Agrega al menos un producto");
    if (overStock.length) return toast.error(`No hay suficiente stock en ${branchName(branch)} para ${overStock.length} variante(s)`);
    if (channel !== "tienda" && !customer) return toast.error("Selecciona o registra al cliente");
    setSaving(true);
    try {
      const order = await createOrder({
      channel: tier ? "mayoreo" : channel,
      customerId: customer?.id,
      customerName: customer ? customer.business ?? customer.name : "Público general",
      branch,
      items,
      discount,
      shipping,
      payments: paid > 0 ? [{ amount: paid, method, note: payMode === "anticipo" ? "Anticipo" : undefined }] : [],
      tierId: tier?.id,
      pickup: shipMode === "recoge",
      notes: notes || undefined,
      shippingInfo: shipMode === "envio" && customer ? { carrier: carrier || undefined, city: [customer.city, customer.state].filter(Boolean).join(", ") } : undefined,
      });
      toast.success(`Pedido ${order.folio} creado · inventario actualizado`);
      router.push(`/pedidos/${order.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Nuevo pedido"
        description="Registra en segundos un pedido que llegó por uno de tus canales de venta. El inventario se descuenta al instante."
        actions={
          <Button asChild variant="ghost" className="h-9">
            <Link href="/pedidos">
              <ArrowLeft /> Volver
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">1 · ¿Por dónde llegó?</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {channels.map((c) => {
                const Icon = CHANNEL_META[c].icon;
                return (
                  <button
                    key={c}
                    onClick={() => {
                      setChannel(c);
                      if (c === "tienda") setShipMode("recoge");
                    }}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors hover:bg-muted/60",
                      channel === c && "border-gold bg-gold/10 ring-1 ring-gold/40",
                    )}
                  >
                    <Icon className={cn("size-5", channel === c ? "text-gold" : "text-muted-foreground")} />
                    <span className="text-sm font-medium">{CHANNEL_LABEL[c]}</span>
                    <span className="text-xs text-muted-foreground">{CHANNEL_META[c].hint}</span>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">2 · Cliente y sucursal que surte</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-[1fr_220px]">
              <div className="grid min-w-0 gap-1.5">
                <Label>Cliente</Label>
                <CustomerSelect value={customer?.id} onChange={setCustomer} allowGeneral={channel === "tienda"} />
              </div>
              <div className="grid gap-1.5">
                <Label>Surtir desde</Label>
                <Select value={branch} onValueChange={(v) => setBranch(v as BranchId)}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {tier && customer && (
                <p className="rounded-lg bg-gold/10 px-3 py-2 text-xs text-gold md:col-span-2">
                  Cliente {customer.type} con {pieces} piezas: se aplica automáticamente el precio <b>{tier.name}</b> (−{Math.round(tier.discount * 100)}%). El pedido se registrará como Mayoreo.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">3 · Productos, colores y tallas</CardTitle>
            </CardHeader>
            <CardContent>
              <ItemsBuilder
                branch={branch}
                qty={qty}
                setQty={setQty}
                unitPriceOf={unitPriceOf}
                productIds={productIds}
                setProductIds={setProductIds}
              />
            </CardContent>
          </Card>
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-1.5">
                <Label>Entrega</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["envio", "recoge"] as ShipMode[]).map((m) => (
                    <Button key={m} variant={shipMode === m ? "default" : "outline"} className="h-9" onClick={() => setShipMode(m)}>
                      {m === "envio" ? <><Truck /> Paquetería</> : <><Store /> Recoge</>}
                    </Button>
                  ))}
                </div>
                {shipMode === "envio" &&
                  (carriers.length > 0 ? (
                    <Select value={carrier} onValueChange={setCarrier}>
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {carriers.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Paquetería" />
                  ))}
                {shipMode === "envio" && (
                  <Input
                    type="number"
                    min={0}
                    value={shippingInput ?? (suggestedShipping || "")}
                    placeholder="Costo de envío ($)"
                    onChange={(e) => setShippingInput(e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))}
                  />
                )}
              </div>

              <div className="grid gap-1.5">
                <Label>Descuento ($)</Label>
                <Input type="number" min={0} value={discount || ""} placeholder="0" onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))} />
              </div>

              <div className="flex flex-col gap-1.5 text-sm">
                <Row label={`Subtotal (${pieces} pzs)`} value={mxn(subtotal)} />
                {discount > 0 && <Row label="Descuento" value={`−${mxn(discount)}`} />}
                <Row label="Envío" value={shipping ? mxn(shipping) : shipMode === "recoge" ? "—" : "Gratis"} />
                <Separator className="my-1" />
                <Row label="Total" value={mxn(total)} strong />
              </div>

              <div className="grid gap-1.5">
                <Label>Pago</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["pagado", "anticipo", "pendiente"] as PayMode[]).map((m) => (
                    <Button key={m} size="sm" variant={payMode === m ? "default" : "outline"} onClick={() => setPayMode(m)}>
                      {m === "pagado" ? "Pagado" : m === "anticipo" ? "Anticipo" : "Pendiente"}
                    </Button>
                  ))}
                </div>
                {payMode === "anticipo" && (
                  <Input type="number" min={0} placeholder="Monto del anticipo" value={deposit || ""} onChange={(e) => setDeposit(Math.max(0, Number(e.target.value) || 0))} />
                )}
                {payMode !== "pendiente" && (
                  <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
                        <SelectItem key={m} value={m}>
                          {PAYMENT_LABEL[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label>Notas</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Dirección, referencias, instrucciones…" rows={2} />
              </div>

              {overStock.length > 0 && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  Hay {overStock.length} variante(s) sin stock suficiente en esta sucursal. Cambia la sucursal o ajusta cantidades.
                </p>
              )}

              <Button className="h-10" onClick={() => void submit()} disabled={!items.length || saving}>
                <Check /> Crear pedido · {mxn(total)}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between", strong ? "text-base font-semibold" : "text-muted-foreground")}>
      <span>{label}</span>
      <span className={cn("tabular", !strong && "text-foreground")}>{value}</span>
    </div>
  );
}
