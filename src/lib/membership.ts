import { MODULE_LABEL } from "./constants";
import { fLongDate } from "./format";
import type { ModuleKey, Membership, MembershipState, Plan, PlanTier } from "./types";

export const PLAN_NAMES: Record<PlanTier, string> = { lite: "Lite", plus: "Plus", pro: "Pro" };

export const STATE_LABELS: Record<MembershipState, string> = {
  prueba: "Prueba",
  activa: "Activa",
  gracia: "En gracia",
  vencida: "Vencida",
  suspendida: "Suspendida",
};

/** Días que faltan para `iso` (negativo o 0 si ya pasó); `null` si no hay fecha. */
export function daysLeft(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000) || 0;
}

export const hasModule = (m: Membership | null, k: ModuleKey) => !!m?.modules.includes(k);

/** Plan más barato (el primero por `sort`) que incluye el módulo; `plans` ya viene ordenado. */
export const minPlanFor = (plans: Plan[], k: ModuleKey) => plans.find((p) => p.modules.includes(k));

/** En gracia, o en los últimos 3 días de la prueba: hay que avisar que falta el pago. */
export const needsPayment = (m: Membership, now = new Date()) =>
  m.state === "gracia" || (m.state === "prueba" && (daysLeft(m.trialEndsAt, now) ?? Infinity) <= 3);

/** Leyenda de la bajada a Lite; la prueba no tiene gracia, así que baja el día que vence (`trialEndsAt`). */
export function graceNotice(m: Membership, plans: Plan[]) {
  const drops = m.graceEndsAt ?? m.trialEndsAt;
  if (!drops) return "";
  const lite = plans.find((p) => p.id === "lite")?.modules ?? [];
  const lost = new Intl.ListFormat("es").format(m.modules.filter((k) => !lite.includes(k)).map((k) => MODULE_LABEL[k]));
  return `Si no se registra tu pago antes del ${fLongDate(drops)}, tu cuenta pasará al plan Lite y se bloquearán ${lost}. Tus datos se conservan.`;
}
