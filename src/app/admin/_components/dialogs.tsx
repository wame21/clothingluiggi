"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fDateTime, mxn } from "@/lib/format";
import { PLAN_NAMES } from "@/lib/membership";
import { supabase } from "@/lib/supabase/client";
import type { MembershipState, PlanTier } from "@/lib/types";

/** Fila de `admin_businesses()`. */
export type AdminBusiness = {
  id: string;
  name: string;
  owner_name: string | null;
  owner_email: string | null;
  plan: PlanTier;
  effective_plan: PlanTier;
  state: MembershipState;
  ends_at: string | null;
  trial_ends_at: string | null;
  paid_until: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  members: number;
  orders_30d: number;
  created_at: string;
};

export type Action = "pagar" | "mejorar" | "degradar" | "suspender" | "historial";

type Event = {
  id: string;
  at: string;
  actor_email: string | null;
  action: string;
  from_plan: PlanTier | null;
  to_plan: PlanTier | null;
  paid_until: string | null;
  amount: number | null;
  note: string | null;
};

type Run = () => PromiseLike<{ error: { message: string } | null }>;
type Props = { biz: AdminBusiness; onClose: () => void; onDone: () => void };

export function ActionDialog({
  target,
  onClose,
  onDone,
}: {
  target: { biz: AdminBusiness; action: Action } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  if (!target) return null;
  const { biz, action } = target;
  const props = { biz, onClose, onDone };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {action === "historial" ? (
          <History {...props} />
        ) : action === "pagar" || action === "mejorar" ? (
          <Pay {...props} upgrade={action === "mejorar"} />
        ) : (
          <Confirm {...props} suspend={action === "suspender"} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Encabezado, pie y envío comunes: toast con el mensaje del servidor si falla. */
function Shell({
  title,
  description,
  label,
  destructive,
  disabled,
  run,
  ok,
  onClose,
  onDone,
  children,
}: {
  title: string;
  description: string;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  run: Run;
  ok: string;
  onClose: () => void;
  onDone: () => void;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const { error } = await run();
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success(ok);
    onDone();
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {children}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant={destructive ? "destructive" : "default"} disabled={busy || disabled} onClick={() => void submit()}>
          {label}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Liga la etiqueta a su control: `children` recibe el id que debe llevar. */
function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
    </div>
  );
}

/** "Marcar como pagado" y "Mejorar" comparten meses, monto y nota; mejorar suma el plan. */
function Pay({ biz, upgrade, onClose, onDone }: Props & { upgrade: boolean }) {
  const [plan, setPlan] = useState<PlanTier>("plus");
  const [months, setMonths] = useState(upgrade ? "0" : "1");
  const [amount, setAmount] = useState("0");
  const [note, setNote] = useState("");
  const m = Math.floor(Number(months));
  const args = { p_business: biz.id, p_months: m, p_amount: Number(amount) || 0, p_note: note.trim() || null };
  return (
    <Shell
      title={upgrade ? "Mejorar plan" : "Marcar como pagado"}
      description={biz.name}
      label={upgrade ? "Mejorar" : "Marcar pagado"}
      disabled={upgrade ? !(m >= 0) : !(m >= 1)}
      run={() => supabase().rpc(upgrade ? "admin_set_plan" : "admin_mark_paid", upgrade ? { ...args, p_plan: plan } : args)}
      ok={upgrade ? "Plan actualizado" : "Pago registrado"}
      onClose={onClose}
      onDone={onDone}
    >
      <div className="grid gap-3">
        {upgrade && (
          <Field label="Plan">
            {(id) => (
              <Select value={plan} onValueChange={(v) => setPlan(v as PlanTier)}>
                <SelectTrigger id={id} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="plus">{PLAN_NAMES.plus}</SelectItem>
                  <SelectItem value="pro">{PLAN_NAMES.pro}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={upgrade ? "Meses pagados (opcional)" : "Meses"}>
            {(id) => (
              <Input id={id} type="number" min={upgrade ? 0 : 1} step={1} value={months} onChange={(e) => setMonths(e.target.value)} />
            )}
          </Field>
          <Field label="Monto (MXN)">
            {(id) => <Input id={id} type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />}
          </Field>
        </div>
        <Field label="Nota">
          {(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Transferencia, referencia…" />}
        </Field>
      </div>
    </Shell>
  );
}

/** Degradar a Lite o suspender (este último pide motivo). */
function Confirm({ biz, suspend, onClose, onDone }: Props & { suspend: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <Shell
      title={suspend ? "Suspender negocio" : "Degradar a Lite"}
      description={
        suspend
          ? `${biz.name} no podrá usar el sistema; sus datos se conservan.`
          : `${biz.name} pierde los módulos de pago y su vencimiento se borra.`
      }
      label={suspend ? "Suspender" : "Degradar"}
      destructive
      disabled={suspend && !reason.trim()}
      run={() =>
        suspend
          ? supabase().rpc("admin_suspend", { p_business: biz.id, p_reason: reason.trim() })
          : supabase().rpc("admin_set_plan", { p_business: biz.id, p_plan: "lite" })
      }
      ok={suspend ? "Negocio suspendido" : "Plan degradado a Lite"}
      onClose={onClose}
      onDone={onDone}
    >
      {suspend && (
        <Field label="Motivo (obligatorio)">
          {(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Falta de pago, abuso…" />}
        </Field>
      )}
    </Shell>
  );
}

function History({ biz }: Props) {
  const [events, setEvents] = useState<Event[] | null>(null);
  useEffect(() => {
    void supabase()
      .rpc("admin_events", { p_business: biz.id })
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setEvents((data as Event[] | null) ?? []);
      });
  }, [biz.id]);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Historial</DialogTitle>
        <DialogDescription>{biz.name}</DialogDescription>
      </DialogHeader>
      <div className="max-h-[60vh] overflow-y-auto">
        {events === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sin movimientos todavía.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Nota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap">
                    {fDateTime(e.at)}
                    <div className="text-xs text-muted-foreground">{e.actor_email}</div>
                  </TableCell>
                  <TableCell>{e.action}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {e.to_plan ? `${e.from_plan ? `${PLAN_NAMES[e.from_plan]} → ` : ""}${PLAN_NAMES[e.to_plan]}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">{e.amount ? mxn(e.amount) : "—"}</TableCell>
                  <TableCell>{e.note ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}
