"use client";

import { UserCog } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState, PageHeader } from "@/components/erp";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BRANCHES } from "@/lib/constants";
import { fDate } from "@/lib/format";
import { errorMessage, useErp } from "@/lib/store";
import type { AppRole, BranchId, Profile } from "@/lib/types";

const ROLE_LABEL: Record<AppRole, string> = { dueno: "Dueño", vendedor: "Vendedor", pendiente: "Pendiente" };

export default function EquipoPage() {
  const team = useErp((s) => s.team);
  const loadTeam = useErp((s) => s.loadTeam);
  const me = useErp((s) => s.profile?.id);

  useEffect(() => {
    loadTeam().catch((e) => toast.error(errorMessage(e)));
  }, [loadTeam]);

  const pendientes = team.filter((m) => m.role === "pendiente").length;

  return (
    <>
      <PageHeader
        title="Equipo"
        description="Quien se registra en la app queda pendiente. Apruébalo como vendedor y asígnale su sucursal; los vendedores no ven costos, utilidades ni gastos."
      />
      {pendientes > 0 && (
        <p className="mb-4 text-sm text-gold">
          {pendientes} {pendientes === 1 ? "persona espera" : "personas esperan"} tu aprobación.
        </p>
      )}
      <Card className="py-0">
        {team.length === 0 ? (
          <EmptyState icon={UserCog} title="Cargando equipo…" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Nombre</TableHead>
                <TableHead>Alta</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="pr-4">Sucursal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.map((m) => (
                <MemberRow key={m.id} member={m} self={m.id === me} />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}

function MemberRow({ member, self }: { member: Profile; self: boolean }) {
  const setMember = useErp((s) => s.setMember);
  const [saving, setSaving] = useState(false);
  const locked = self || member.role === "dueno";

  const save = async (role: AppRole, branch: BranchId) => {
    setSaving(true);
    try {
      await setMember(member.id, role, branch);
      toast.success(
        role === "vendedor" && member.role === "pendiente" ? `${member.name} ya puede entrar` : `${member.name} actualizado`,
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <TableRow>
      <TableCell className="pl-4">
        <div className="font-medium">
          {member.name} {self && <span className="text-xs text-muted-foreground">(tú)</span>}
        </div>
        <div className="text-xs text-muted-foreground">{member.email}</div>
      </TableCell>
      <TableCell className="text-muted-foreground">{fDate(member.createdAt)}</TableCell>
      <TableCell>
        {locked ? (
          <Badge variant="outline" className="border-gold/40 text-gold">
            {ROLE_LABEL[member.role]}
          </Badge>
        ) : (
          <Select value={member.role} disabled={saving} onValueChange={(v) => void save(v as AppRole, member.branch)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vendedor">Vendedor</SelectItem>
              <SelectItem value="pendiente">Pendiente (sin acceso)</SelectItem>
            </SelectContent>
          </Select>
        )}
      </TableCell>
      <TableCell className="pr-4">
        {locked ? (
          <span className="text-muted-foreground">Todas</span>
        ) : (
          <Select value={member.branch} disabled={saving} onValueChange={(v) => void save(member.role, v as BranchId)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BRANCHES.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.short}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </TableCell>
    </TableRow>
  );
}
