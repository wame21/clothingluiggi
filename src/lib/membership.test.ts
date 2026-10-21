import { describe, expect, it } from "vitest";
import { daysLeft, graceNotice, hasModule, minPlanFor, needsPayment } from "./membership";
import type { Membership, Plan } from "./types";

const NOW = new Date("2026-03-10T12:00:00Z");

const PLANS: Plan[] = [
  { id: "lite", name: "Lite", price: 0, modules: ["panel"] },
  { id: "plus", name: "Plus", price: 299, modules: ["panel", "mayoreo"] },
  { id: "pro", name: "Pro", price: 499, modules: ["panel", "mayoreo", "reportes"] },
];

const membership = (patch: Partial<Membership> = {}): Membership => ({
  plan: "pro",
  effectivePlan: "pro",
  state: "activa",
  trialEndsAt: null,
  paidUntil: "2026-04-10T12:00:00Z",
  graceEndsAt: "2026-04-13T12:00:00Z",
  modules: ["panel", "mayoreo"],
  price: 499,
  suspendedReason: null,
  ...patch,
});

describe("daysLeft", () => {
  it("sin fecha devuelve null", () => {
    expect(daysLeft(null, NOW)).toBeNull();
  });

  it("cuenta días completos hacia adelante y redondea hacia arriba", () => {
    expect(daysLeft("2026-03-13T12:00:00Z", NOW)).toBe(3);
    expect(daysLeft("2026-03-10T18:00:00Z", NOW)).toBe(1);
  });

  it("hoy mismo, ya pasado o por unas horas da 0, nunca -0", () => {
    expect(Object.is(daysLeft("2026-03-10T12:00:00Z", NOW), 0)).toBe(true);
    expect(Object.is(daysLeft("2026-03-10T06:00:00Z", NOW), 0)).toBe(true);
  });

  it("vencido hace días da negativo", () => {
    expect(daysLeft("2026-03-07T12:00:00Z", NOW)).toBe(-3);
  });
});

describe("hasModule", () => {
  it("sin membresía no incluye nada", () => {
    expect(hasModule(null, "panel")).toBe(false);
  });

  it("lee los módulos del plan efectivo", () => {
    expect(hasModule(membership(), "mayoreo")).toBe(true);
    expect(hasModule(membership(), "reportes")).toBe(false);
  });
});

describe("minPlanFor", () => {
  const plans = PLANS;

  it("devuelve el primer plan que incluye el módulo", () => {
    expect(minPlanFor(plans, "panel")?.id).toBe("lite");
    expect(minPlanFor(plans, "mayoreo")?.id).toBe("plus");
    expect(minPlanFor(plans, "reportes")?.id).toBe("pro");
  });

  it("sin catálogo o módulo en ningún plan devuelve undefined", () => {
    expect(minPlanFor([], "mayoreo")).toBeUndefined();
    expect(minPlanFor(plans.slice(0, 1), "finanzas")).toBeUndefined();
  });
});

describe("needsPayment", () => {
  it("avisa en gracia", () => {
    expect(needsPayment(membership({ state: "gracia" }), NOW)).toBe(true);
  });

  it("avisa solo en los últimos 3 días de la prueba (el día 3 y hoy incluidos)", () => {
    const prueba = (trialEndsAt: string) => membership({ state: "prueba", trialEndsAt, paidUntil: null, graceEndsAt: null });
    expect(needsPayment(prueba("2026-03-14T12:00:00Z"), NOW)).toBe(false);
    expect(needsPayment(prueba("2026-03-13T12:00:00Z"), NOW)).toBe(true);
    expect(needsPayment(prueba("2026-03-10T12:00:00Z"), NOW)).toBe(true);
  });

  it("no avisa si está activa, vencida o suspendida", () => {
    for (const state of ["activa", "vencida", "suspendida"] as const) expect(needsPayment(membership({ state }), NOW)).toBe(false);
  });
});

describe("graceNotice", () => {
  it("en gracia usa la leyenda exacta con la fecha de graceEndsAt", () => {
    const m = membership({ state: "gracia", modules: ["panel", "mayoreo", "finanzas", "reportes"] });
    expect(graceNotice(m, PLANS)).toBe(
      "Si no se registra tu pago antes del 13 de abril de 2026, tu cuenta pasará al plan Lite y se bloquearán Mayoreo, Finanzas y Reportes. Tus datos se conservan.",
    );
  });

  it("lista solo los módulos que el plan actual pierde en Lite", () => {
    expect(graceNotice(membership({ state: "gracia" }), PLANS)).toContain("se bloquearán Mayoreo. Tus");
  });

  it("en prueba (sin gracia) usa el fin de la prueba", () => {
    const m = membership({ state: "prueba", trialEndsAt: "2026-03-12T12:00:00Z", paidUntil: null, graceEndsAt: null });
    expect(graceNotice(m, PLANS)).toContain("antes del 12 de marzo de 2026,");
  });

  it("sin ninguna fecha devuelve vacío", () => {
    expect(graceNotice(membership({ graceEndsAt: null, trialEndsAt: null }), PLANS)).toBe("");
  });
});
