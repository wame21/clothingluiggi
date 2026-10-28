import { describe, expect, it } from "vitest";
import { mxn } from "./format";
import { amountDue, daysLeft, dueLabel, graceNotice, isBlocked, needsPayment } from "./membership";
import type { Membership } from "./types";

const NOW = new Date("2026-03-10T12:00:00Z");

const membership = (patch: Partial<Membership> = {}): Membership => ({
  state: "activa",
  trialEndsAt: null,
  paidUntil: "2026-04-10T12:00:00Z",
  graceEndsAt: "2026-04-13T12:00:00Z",
  suspendedReason: null,
  priceMonthly: 1199,
  priceSetup: 3599,
  payment: { bank: "", clabe: "", holder: "", whatsapp: "" },
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

describe("isBlocked", () => {
  it("bloquea vencida, suspendida y la solicitud en revisión o rechazada", () => {
    for (const state of ["vencida", "suspendida", "revision", "rechazada"] as const) expect(isBlocked(membership({ state }))).toBe(true);
  });

  it("deja pasar prueba, activa, gracia y la membresía sin cargar", () => {
    for (const state of ["prueba", "activa", "gracia"] as const) expect(isBlocked(membership({ state }))).toBe(false);
    expect(isBlocked(null)).toBe(false);
  });
});

describe("amountDue", () => {
  it("el primer pago suma el alta a la mensualidad", () => {
    expect(amountDue(membership({ state: "prueba", paidUntil: null, graceEndsAt: null }))).toBe(1199 + 3599);
  });

  it("con mensualidades registradas solo cobra la mensualidad", () => {
    expect(amountDue(membership({ state: "vencida" }))).toBe(1199);
  });

  it("usa los precios que manda la base", () => {
    expect(amountDue(membership({ paidUntil: null, priceMonthly: 999, priceSetup: 0 }))).toBe(999);
  });

  it("dueLabel desglosa el alta solo en el primer pago", () => {
    expect(dueLabel(membership({ paidUntil: null }))).toBe(`Alta ${mxn(3599)} + primera mensualidad ${mxn(1199)}`);
    expect(dueLabel(membership())).toBe("Mensualidad");
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
    expect(graceNotice(membership({ state: "gracia" }))).toBe(
      "Si no se registra tu pago antes del 13 de abril de 2026, el sistema se bloqueará hasta que pagues. Tus datos se conservan.",
    );
  });

  it("en prueba (sin gracia) usa el fin de la prueba", () => {
    const m = membership({ state: "prueba", trialEndsAt: "2026-03-12T12:00:00Z", paidUntil: null, graceEndsAt: null });
    expect(graceNotice(m)).toContain("antes del 12 de marzo de 2026,");
  });

  it("sin ninguna fecha devuelve vacío", () => {
    expect(graceNotice(membership({ graceEndsAt: null, trialEndsAt: null }))).toBe("");
  });
});
