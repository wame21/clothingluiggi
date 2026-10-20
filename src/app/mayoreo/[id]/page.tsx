"use client";

import { AlertTriangle, ArrowLeft, Ban, FileText, MessageCircle, Pencil, Printer, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, PageHeader, QuoteStatusBadge } from "@/components/erp";
import { SalesDocument } from "@/components/sales-document";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { onlyDigits } from "@/lib/clabe";
import { PAYMENT_LABEL } from "@/lib/constants";
import { mxn } from "@/lib/format";
import { errorMessage, useBusinessName, useErp, useWarehouse, useWholesaleEnabled } from "@/lib/store";
import type { Branch, PaymentMethod, Quote } from "@/lib/types";
import { stockOf } from "@/lib/variants";
import { tierById } from "@/lib/wholesale";
import { NoWarehouseNotice, WholesaleDisabled } from "../_comunes";

export default function CotizacionPage() {
  return useWholesaleEnabled() ? <CotizacionDetalle /> : <WholesaleDisabled />;
}

function CotizacionDetalle() {
  const { id } = useParams<{ id: string }>();
  const quote = useErp((s) => s.quotes.find((q) => q.id === id));
  const customer = useErp((s) => s.customers.find((c) => c.id === quote?.customerId));
  const stock = useErp((s) => s.stock);
  const setQuoteStatus = useErp((s) => s.setQuoteStatus);
  const businessName = useBusinessName();
  const warehouse = useWarehouse();

  if (!quote) return <EmptyState icon={FileText} title="Cotización no encontrada" />;

  const tier = tierById(quote.tierId);
  const pieces = quote.items.reduce((a, it) => a + it.qty, 0);
  const open = quote.status === "borrador" || quote.status === "enviada" || quote.status === "aceptada";
  const shortages = open && warehouse ? quote.items.filter((it) => it.qty > stockOf(stock, it.variantKey, warehouse.id)) : [];
  const waPhone = customer ? `52${onlyDigits(customer.phone).slice(-10)}` : "";
  const waText = encodeURIComponent(
    `Hola ${customer?.name.split(" ")[0] ?? ""}, te comparto tu cotización ${quote.folio} de ${businessName}:\n` +
      `• ${pieces} piezas surtidas · precio ${tier.name}${tier.discount ? ` (−${Math.round(tier.discount * 100)}%)` : ""}\n` +
      `• Total: ${mxn(quote.total)}${quote.shipping ? "" : " con envío incluido"}\n` +
      (quote.depositPct > 0 ? `• Anticipo para apartar: ${mxn(Math.round(quote.total * quote.depositPct))}\n` : "") +
      `Te envío el PDF por aquí. ¡Gracias por tu preferencia!`,
  );

  return (
    <>
      <PageHeader
        title={`Cotización ${quote.folio}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <QuoteStatusBadge status={quote.status} /> {quote.customerName} · {pieces} pzs · {mxn(quote.total)}
          </span>
        }
        actions={
          <>
            <Button asChild variant="ghost" className="h-9">
              <Link href="/mayoreo">
                <ArrowLeft /> Mayoreo
              </Link>
            </Button>
            {open && (
              <Button asChild variant="outline" className="h-9">
                <Link href={`/mayoreo/nueva?id=${quote.id}`}>
                  <Pencil /> Editar
                </Link>
              </Button>
            )}
            {customer && (
              <Button asChild variant="outline" className="h-9">
                <a
                  href={`https://wa.me/${waPhone}?text=${waText}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    if (quote.status === "borrador") setQuoteStatus(quote.id, "enviada").catch((e) => toast.error(errorMessage(e)));
                  }}
                >
                  <MessageCircle /> WhatsApp
                </a>
              </Button>
            )}
            <Button variant="outline" className="h-9" onClick={() => window.print()}>
              <Printer /> PDF
            </Button>
            {open && <ConvertDialog quote={quote} warehouse={warehouse} />}
            {quote.status === "convertida" && quote.orderId && (
              <Button asChild className="h-9">
                <Link href={`/pedidos/${quote.orderId}`}>
                  <ShoppingBag /> Ver pedido
                </Link>
              </Button>
            )}
          </>
        }
      />

      {open && !warehouse && <NoWarehouseNotice className="mb-4" />}

      {warehouse && shortages.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm print:hidden">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <div className="font-medium">Stock insuficiente en {warehouse.short} para {shortages.length} variante(s)</div>
            <div className="text-xs text-muted-foreground">
              {shortages
                .slice(0, 4)
                .map((s) => `${s.name} ${s.color} ${s.size} (pide ${s.qty}, hay ${stockOf(stock, s.variantKey, warehouse.id)})`)
                .join(" · ")}
              {shortages.length > 4 && " · …"}
            </div>
          </div>
        </div>
      )}

      <SalesDocument
        kind="cotizacion"
        folio={quote.folio}
        date={quote.date}
        validUntil={quote.validUntil}
        customer={customer}
        customerName={quote.customerName}
        items={quote.items}
        discount={0}
        shipping={quote.shipping}
        total={quote.total}
        tierName={tier.name}
        tierDiscount={tier.discount}
        depositPct={quote.depositPct}
        notes={quote.notes}
      />

      {open && (
        <div className="mt-4 flex justify-center print:hidden">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              setQuoteStatus(quote.id, "rechazada")
                .then(() => toast("Cotización marcada como rechazada"))
                .catch((e) => toast.error(errorMessage(e)));
            }}
          >
            <Ban /> El cliente no aceptó
          </Button>
        </div>
      )}
    </>
  );
}

function ConvertDialog({ quote, warehouse }: { quote: Quote; warehouse?: Branch }) {
  const convertQuote = useErp((s) => s.convertQuote);
  const router = useRouter();
  const suggested = Math.round(quote.total * quote.depositPct);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(suggested);
  const [method, setMethod] = useState<PaymentMethod>("transferencia");
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    if (!warehouse) return;
    const value = Math.min(amount, quote.total);
    setSaving(true);
    try {
      const order = await convertQuote(quote.id, { amount: value, method, note: value >= quote.total ? "Pago total" : "Anticipo" });
      toast.success(`Pedido ${order.folio} creado desde ${quote.folio}`, { description: `Inventario de ${warehouse.short} actualizado` });
      setOpen(false);
      router.push(`/pedidos/${order.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-9" disabled={!warehouse}>
          <ShoppingBag /> Convertir en pedido
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convertir {quote.folio} en pedido</DialogTitle>
          <DialogDescription>
            Se aparta la mercancía de {warehouse?.short}, se registra el anticipo y el pedido aparece en Pedidos como Mayoreo.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Anticipo recibido</Label>
            <Input type="number" value={amount || ""} onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))} />
            <div className="flex flex-wrap gap-1.5">
              {[0.5, 1].map((f) => (
                <Button key={f} size="xs" variant="outline" onClick={() => setAmount(Math.round(quote.total * f))}>
                  {f === 1 ? "Pago total" : "50%"} · {mxn(quote.total * f)}
                </Button>
              ))}
              <Button size="xs" variant="outline" onClick={() => setAmount(0)}>
                Sin anticipo
              </Button>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Método</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger className="w-full">
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
          </div>
        </div>
        <DialogFooter>
          <Button disabled={saving || !warehouse} onClick={() => void confirm()}>
            Confirmar pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
