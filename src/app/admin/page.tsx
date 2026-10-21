"use client";

import { LogOut, MoreHorizontal, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BrandLockup } from "@/components/brand";
import { EmptyState, PageHeader } from "@/components/erp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fDate } from "@/lib/format";
import { PLAN_NAMES, STATE_LABELS, daysLeft } from "@/lib/membership";
import { supabase } from "@/lib/supabase/client";
import type { MembershipState } from "@/lib/types";
import { ActionDialog, type Action, type AdminBusiness } from "./_components/dialogs";

const STATES = Object.keys(STATE_LABELS) as MembershipState[];

const BADGE: Record<MembershipState, "default" | "secondary" | "outline" | "destructive"> = {
  activa: "default",
  prueba: "secondary",
  gracia: "outline",
  vencida: "destructive",
  suspendida: "destructive",
};

/** Etiqueta del estado con los días que le quedan a la prueba o a la gracia. */
function stateText(b: AdminBusiness) {
  if (b.state === "vencida") return "Vencida → Lite";
  const days = b.state === "prueba" || b.state === "gracia" ? daysLeft(b.ends_at) : null;
  return days === null ? STATE_LABELS[b.state] : `${STATE_LABELS[b.state]} · ${days} ${days === 1 ? "día" : "días"}`;
}

export default function AdminPage() {
  const router = useRouter();
  const [rows, setRows] = useState<AdminBusiness[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<MembershipState | "todos">("todos");
  const [target, setTarget] = useState<{ biz: AdminBusiness; action: Action } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase().rpc("admin_businesses");
    if (error) toast.error(error.message);
    setRows((data as AdminBusiness[] | null) ?? []);
  }, []);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase().rpc("is_platform_admin");
      if (data !== true) return router.replace("/");
      await load();
    })();
  }, [router, load]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATES.map((s) => [s, 0])) as Record<MembershipState, number>;
    for (const r of rows ?? []) c[r.state]++;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        (filter === "todos" || r.state === filter) &&
        (!t || `${r.name} ${r.owner_name ?? ""} ${r.owner_email ?? ""}`.toLowerCase().includes(t)),
    );
  }, [rows, q, filter]);

  const reactivate = async (b: AdminBusiness) => {
    const { error } = await supabase().rpc("admin_reactivate", { p_business: b.id });
    if (error) return void toast.error(error.message);
    toast.success("Negocio reactivado");
    await load();
  };

  const signOut = async () => {
    await supabase().auth.signOut();
    // Recarga completa para no dejar datos en memoria (igual que el cierre de sesión del ERP).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- se busca descartar el estado en memoria
    window.location.assign("/login");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between gap-3 bg-sidebar px-4 py-3 text-sidebar-foreground">
        <BrandLockup />
        <Button variant="outline" size="sm" className="shrink-0 text-foreground" onClick={() => void signOut()}>
          <LogOut /> Cerrar sesión
        </Button>
      </header>
      <main className="mx-auto max-w-7xl p-4 md:p-6">
        <PageHeader title="Administración de la plataforma" description="Negocios, planes y pagos." />

        <div className="mb-4 flex flex-wrap gap-2">
          {STATES.map((s) => (
            <Badge key={s} variant={BADGE[s]}>
              {STATE_LABELS[s]}: {counts[s]}
            </Badge>
          ))}
        </div>

        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar por negocio o correo" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as MembershipState | "todos")}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {STATES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card className="overflow-hidden p-0">
          {rows === null ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : shown.length === 0 ? (
            <EmptyState icon={Search} title="Sin resultados" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Negocio</TableHead>
                  <TableHead>Dueño</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead className="text-right">Usuarios</TableHead>
                  <TableHead className="text-right">Pedidos 30 d</TableHead>
                  <TableHead>Alta</TableHead>
                  <TableHead className="sticky right-0 bg-card" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((b) => {
                  const due = b.plan === "lite" && !b.paid_until ? null : (b.paid_until ?? b.trial_ends_at);
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="pl-4 font-medium">{b.name}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {b.owner_name}
                        <div className="text-xs text-muted-foreground">{b.owner_email}</div>
                      </TableCell>
                      <TableCell>{PLAN_NAMES[b.plan]}</TableCell>
                      <TableCell>
                        <Badge variant={BADGE[b.state]} className="whitespace-nowrap">
                          {stateText(b)}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{due ? fDate(due) : "—"}</TableCell>
                      <TableCell className="text-right">{b.members}</TableCell>
                      <TableCell className="text-right">{b.orders_30d}</TableCell>
                      <TableCell className="whitespace-nowrap">{fDate(b.created_at)}</TableCell>
                      <TableCell className="sticky right-0 bg-card">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Acciones de ${b.name}`}>
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setTarget({ biz: b, action: "pagar" })}>
                              Marcar como pagado
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setTarget({ biz: b, action: "mejorar" })}>Mejorar plan</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setTarget({ biz: b, action: "degradar" })}>
                              Degradar a Lite
                            </DropdownMenuItem>
                            {b.state === "suspendida" ? (
                              <DropdownMenuItem onClick={() => void reactivate(b)}>Reactivar</DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem variant="destructive" onClick={() => setTarget({ biz: b, action: "suspender" })}>
                                Suspender
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setTarget({ biz: b, action: "historial" })}>Historial</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </main>
      <ActionDialog
        target={target}
        onClose={() => setTarget(null)}
        onDone={() => {
          setTarget(null);
          void load();
        }}
      />
    </div>
  );
}
