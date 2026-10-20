import { describe, expect, it } from "vitest";
import { DEFAULT_WHOLESALE, type WholesaleSettings } from "@/lib/wholesale";
import { fromForm, toForm } from "./mayoreo";

const base = (patch: Partial<WholesaleSettings>, discounts: number[] = []): WholesaleSettings => ({
  ...structuredClone(DEFAULT_WHOLESALE),
  ...patch,
  tiers: discounts.map((discount, i) => ({
    id: `t${i}`,
    name: `Nivel ${i + 1}`,
    minPieces: 1 + i * 10,
    discount,
    description: "",
  })),
});

describe("conversión del formulario de mayoreo", () => {
  it("descuento 0.125 se muestra como 12.5% y vuelve a 0.125", () => {
    const form = toForm(base({}, [0, 0.125]));
    expect(form.tiers[1].discountPct).toBe(12.5);
    expect(fromForm(form).tiers[1].discount).toBe(0.125);
  });

  it("descuento 0.1 se muestra como 10% y vuelve a 0.1", () => {
    const form = toForm(base({}, [0, 0.1]));
    expect(form.tiers[1].discountPct).toBe(10);
    expect(fromForm(form).tiers[1].discount).toBe(0.1);
  });

  it("anticipo 0.125 y 0.3 hacen el viaje de ida y vuelta", () => {
    for (const [fraction, pct] of [
      [0.125, 12.5],
      [0.3, 30],
    ]) {
      const form = toForm(base({ depositPct: fraction }, [0]));
      expect(form.depositPct).toBe(pct);
      expect(fromForm(form).depositPct).toBe(fraction);
    }
  });

  it("el primer nivel siempre queda en 1 pieza y 0% de descuento", () => {
    const form = toForm(base({}, [0.2, 0.3]));
    const tiers = fromForm(form).tiers;
    expect(tiers[0].minPieces).toBe(1);
    expect(tiers[0].discount).toBe(0);
    expect(tiers[1].discount).toBe(0.3);
  });
});
