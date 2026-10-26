import { fLongDate, mxn } from "./format";
import type { Membership, MembershipState } from "./types";

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

/** Vencida o suspendida: la base niega todo y la app solo muestra la pantalla de pago. */
export const isBlocked = (m: Membership | null) => m?.state === "vencida" || m?.state === "suspendida";

/** Lo que toca pagar: el primer pago (sin mensualidades registradas) incluye el alta. */
export const amountDue = (m: Membership) => m.priceMonthly + (m.paidUntil ? 0 : m.priceSetup);

/** Concepto de `amountDue`, con el desglose cuando incluye el alta. */
export const dueLabel = (m: Membership) =>
  m.paidUntil ? "Mensualidad" : `Alta ${mxn(m.priceSetup)} + primera mensualidad ${mxn(m.priceMonthly)}`;

/** En gracia, o en los últimos 3 días de la prueba: hay que avisar que falta el pago. */
export const needsPayment = (m: Membership, now = new Date()) =>
  m.state === "gracia" || (m.state === "prueba" && (daysLeft(m.trialEndsAt, now) ?? Infinity) <= 3);

/** Leyenda del bloqueo; la prueba no tiene gracia, así que se bloquea el día que vence (`trialEndsAt`). */
export function graceNotice(m: Membership) {
  const blocks = m.graceEndsAt ?? m.trialEndsAt;
  if (!blocks) return "";
  return `Si no se registra tu pago antes del ${fLongDate(blocks)}, el sistema se bloqueará hasta que pagues. Tus datos se conservan.`;
}
