import { beforeEach, describe, expect, it } from "vitest";
import { applyCatalogSettings, DEFAULT_CATALOG } from "@/lib/settings";
import type { Product, StockMap } from "@/lib/types";
import { variantKey } from "@/lib/variants";
import {
  applyWholesaleSettings,
  DEFAULT_WHOLESALE,
  DISTRIBUTOR_CUSTOMER_MIN,
  distributeBySize,
  expandPackage,
  isWholesaleEnabled,
  nextTier,
  PACKAGES,
  shippingFor,
  sizeCurve,
  TIERS,
  tierById,
  tierFor,
  tierPrice,
  WHOLESALE_TERMS,
  wholesaleFrom,
  wholesaleSnapshot,
  type Tier,
  type WholesalePackage,
  type WholesaleSettings,
} from "@/lib/wholesale";

const tier = (id: string, minPieces: number, discount: number): Tier => ({
  id,
  name: id,
  minPieces,
  discount,
  description: id,
});

const NIVELES: Tier[] = [
  tier("lista", 1, 0),
  tier("m6", 6, 0.1),
  tier("m12", 12, 0.2),
  tier("m24", 24, 0.3),
];

const config = (over: Partial<WholesaleSettings> = {}): WholesaleSettings => ({
  ...structuredClone(DEFAULT_WHOLESALE),
  enabled: true,
  tiers: structuredClone(NIVELES),
  ...over,
});

beforeEach(() => {
  applyWholesaleSettings(DEFAULT_WHOLESALE);
  applyCatalogSettings(DEFAULT_CATALOG);
});

/* ------------------------------------------------------------------ */
describe("DEFAULT_WHOLESALE", () => {
  it("coincide con el contrato de la migración (seed_business_defaults)", () => {
    expect(DEFAULT_WHOLESALE).toEqual({
      enabled: false,
      tiers: [
        { id: "lista", name: "Precio de lista", minPieces: 1, discount: 0, description: "Precio de lista" },
      ],
      distributorCustomerMin: 0,
      depositPct: 0,
      freeShippingFrom: 0,
      flatShipping: 0,
      validityDays: 7,
      packages: [],
      bank: { bank: "", holder: "", clabe: "" },
    });
  });
});

describe("wholesaleFrom", () => {
  it("null devuelve los valores por defecto", () => {
    expect(wholesaleFrom(null)).toEqual(DEFAULT_WHOLESALE);
  });

  it("undefined devuelve los valores por defecto", () => {
    expect(wholesaleFrom(undefined)).toEqual(DEFAULT_WHOLESALE);
  });

  it("un objeto vacío devuelve los valores por defecto", () => {
    expect(wholesaleFrom({})).toEqual(DEFAULT_WHOLESALE);
  });

  it("devuelve una copia: mutarla no altera DEFAULT_WHOLESALE", () => {
    const w = wholesaleFrom(null);
    w.tiers[0].discount = 0.99;
    w.tiers.push(tier("x", 5, 0.5));
    w.bank.clabe = "123";
    w.packages.push({ id: "k", name: "k", pieces: 1, description: "", mix: [] });
    expect(DEFAULT_WHOLESALE.tiers).toHaveLength(1);
    expect(DEFAULT_WHOLESALE.tiers[0].discount).toBe(0);
    expect(DEFAULT_WHOLESALE.bank.clabe).toBe("");
    expect(DEFAULT_WHOLESALE.packages).toEqual([]);
  });

  it("completa un objeto parcial con los valores por defecto", () => {
    const w = wholesaleFrom({ enabled: true, depositPct: 0.3 });
    expect(w.enabled).toBe(true);
    expect(w.depositPct).toBe(0.3);
    expect(w.tiers).toEqual(DEFAULT_WHOLESALE.tiers);
    expect(w.validityDays).toBe(7);
    expect(w.flatShipping).toBe(0);
    expect(w.packages).toEqual([]);
    expect(w.bank).toEqual({ bank: "", holder: "", clabe: "" });
  });

  it("completa un banco parcial campo por campo", () => {
    const w = wholesaleFrom({ bank: { bank: "BBVA" } as WholesaleSettings["bank"] });
    expect(w.bank).toEqual({ bank: "BBVA", holder: "", clabe: "" });
  });

  it("conserva el banco completo", () => {
    const bank = { bank: "BBVA", holder: "Tienda SA", clabe: "012345678901234567" };
    expect(wholesaleFrom({ bank }).bank).toEqual(bank);
  });

  it("usa los niveles guardados cuando hay al menos uno", () => {
    expect(wholesaleFrom({ tiers: NIVELES }).tiers).toEqual(NIVELES);
  });

  it("una lista de niveles vacía cae a los niveles por defecto", () => {
    expect(wholesaleFrom({ tiers: [] }).tiers).toEqual(DEFAULT_WHOLESALE.tiers);
  });

  it("conserva los paquetes guardados", () => {
    const packages: WholesalePackage[] = [
      { id: "k1", name: "Surtido", pieces: 12, description: "", mix: [{ category: "Blusas", qty: 12 }] },
    ];
    expect(wholesaleFrom({ packages }).packages).toEqual(packages);
  });

  it("paquetes que no son un arreglo caen a []", () => {
    const w = wholesaleFrom({ packages: null as unknown as WholesalePackage[] });
    expect(w.packages).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
describe("estado de módulo (applyWholesaleSettings)", () => {
  it("al inicio (tras restablecer) refleja los valores por defecto", () => {
    expect(isWholesaleEnabled()).toBe(false);
    expect(TIERS).toEqual(DEFAULT_WHOLESALE.tiers);
    expect(PACKAGES).toEqual([]);
    expect(DISTRIBUTOR_CUSTOMER_MIN).toBe(0);
    expect(WHOLESALE_TERMS.validityDays).toBe(7);
    expect(wholesaleSnapshot()).toEqual(DEFAULT_WHOLESALE);
  });

  it("actualiza TIERS, PACKAGES, WHOLESALE_TERMS e isWholesaleEnabled", () => {
    const packages: WholesalePackage[] = [
      { id: "k1", name: "Surtido", pieces: 12, description: "", mix: [{ category: "Blusas", qty: 12 }] },
    ];
    const bank = { bank: "BBVA", holder: "Tienda SA", clabe: "012345678901234567" };
    applyWholesaleSettings(
      config({
        distributorCustomerMin: 18,
        depositPct: 0.5,
        freeShippingFrom: 3000,
        flatShipping: 150,
        validityDays: 15,
        packages,
        bank,
      }),
    );
    expect(isWholesaleEnabled()).toBe(true);
    expect(TIERS.map((t) => t.id)).toEqual(["lista", "m6", "m12", "m24"]);
    expect(PACKAGES).toEqual(packages);
    expect(DISTRIBUTOR_CUSTOMER_MIN).toBe(18);
    expect(WHOLESALE_TERMS).toMatchObject({
      depositPct: 0.5,
      freeShippingFrom: 3000,
      flatShipping: 150,
      validityDays: 15,
      bank,
    });
  });

  it("mantiene las mismas referencias exportadas (TIERS y PACKAGES se mutan en sitio)", () => {
    const tiersRef = TIERS;
    const packagesRef = PACKAGES;
    applyWholesaleSettings(config({ packages: [{ id: "k", name: "k", pieces: 6, description: "", mix: [] }] }));
    expect(tiersRef).toBe(TIERS);
    expect(tiersRef).toHaveLength(4);
    expect(packagesRef).toBe(PACKAGES);
    expect(packagesRef).toHaveLength(1);
  });

  it("ordena los niveles por minPieces sin alterar el arreglo recibido", () => {
    const desordenados = [NIVELES[2], NIVELES[0], NIVELES[3], NIVELES[1]];
    applyWholesaleSettings(config({ tiers: desordenados }));
    expect(TIERS.map((t) => t.minPieces)).toEqual([1, 6, 12, 24]);
    expect(desordenados.map((t) => t.minPieces)).toEqual([12, 1, 24, 6]);
  });

  it("wholesaleSnapshot devuelve la configuración vigente con la forma de settings.wholesale", () => {
    const bank = { bank: "BBVA", holder: "Tienda SA", clabe: "012345678901234567" };
    const packages: WholesalePackage[] = [
      { id: "k1", name: "Surtido", pieces: 12, description: "d", mix: [{ category: "Blusas", qty: 12 }] },
    ];
    const entrada = config({
      distributorCustomerMin: 18,
      depositPct: 0.3,
      freeShippingFrom: 2000,
      flatShipping: 120,
      validityDays: 10,
      packages,
      bank,
    });
    applyWholesaleSettings(entrada);
    expect(wholesaleSnapshot()).toEqual(entrada);
  });

  it("mutar la entrada después de aplicar no altera TIERS ni PACKAGES", () => {
    const entrada = config({
      tiers: [{ ...NIVELES[0] }],
      packages: [{ id: "k", name: "k", pieces: 6, description: "", mix: [{ category: "Blusas", qty: 6 }] }],
    });
    applyWholesaleSettings(entrada);
    entrada.tiers[0].discount = 0.9;
    entrada.packages[0].mix[0].qty = 99;
    expect(TIERS[0].discount).toBe(0);
    expect(PACKAGES[0].mix[0].qty).toBe(6);
  });

  it("wholesaleSnapshot es una copia: modificarla no cambia la configuración vigente", () => {
    applyWholesaleSettings(
      config({ packages: [{ id: "k", name: "k", pieces: 6, description: "", mix: [{ category: "A", qty: 6 }] }] }),
    );
    const snap = wholesaleSnapshot();
    snap.tiers[1].discount = 0.99;
    snap.tiers.pop();
    snap.packages[0].mix[0].qty = 999;
    snap.bank.bank = "otro";
    expect(TIERS).toHaveLength(4);
    expect(TIERS[1].discount).toBe(0.1);
    expect(PACKAGES[0].mix[0].qty).toBe(6);
    expect(WHOLESALE_TERMS.bank.bank).toBe("");
  });

  it("rellena con valores por defecto lo que falte en la configuración aplicada", () => {
    applyWholesaleSettings({ enabled: true, tiers: NIVELES } as WholesaleSettings);
    expect(isWholesaleEnabled()).toBe(true);
    expect(WHOLESALE_TERMS.validityDays).toBe(7);
    expect(PACKAGES).toEqual([]);
    expect(WHOLESALE_TERMS.bank).toEqual({ bank: "", holder: "", clabe: "" });
  });

  it("restablecer con DEFAULT_WHOLESALE deja el módulo como al inicio", () => {
    applyWholesaleSettings(
      config({
        distributorCustomerMin: 18,
        depositPct: 0.5,
        flatShipping: 150,
        packages: [{ id: "k", name: "k", pieces: 6, description: "", mix: [] }],
        bank: { bank: "B", holder: "H", clabe: "C" },
      }),
    );
    applyWholesaleSettings(DEFAULT_WHOLESALE);
    expect(wholesaleSnapshot()).toEqual(DEFAULT_WHOLESALE);
    expect(isWholesaleEnabled()).toBe(false);
    expect(DISTRIBUTOR_CUSTOMER_MIN).toBe(0);
  });

  describe("condiciones de cotización", () => {
    it("con la configuración por defecto solo quedan las frases que siempre aplican", () => {
      const c = WHOLESALE_TERMS.conditions;
      expect(c[0]).toBe("Precios en MXN, sujetos a disponibilidad de inventario.");
      expect(c.some((x) => x.includes("anticipo"))).toBe(false);
      expect(c.some((x) => x.includes("Envío"))).toBe(false);
      expect(c.some((x) => x.includes("Se pueden mezclar"))).toBe(true);
      expect(c.some((x) => x.includes("Vigencia de la cotización: 7 días"))).toBe(true);
    });

    it("incluye anticipo, envío gratis y vigencia cuando están configurados", () => {
      applyWholesaleSettings(config({ depositPct: 0.3, flatShipping: 150, freeShippingFrom: 2000, validityDays: 10 }));
      const c = WHOLESALE_TERMS.conditions;
      expect(c.some((x) => x.includes("30% de anticipo"))).toBe(true);
      expect(c.some((x) => x.includes("Envío gratis") && x.includes("2,000") && x.includes("150"))).toBe(true);
      expect(c.some((x) => x.includes("10 días naturales"))).toBe(true);
    });

    it("con tarifa fija y sin envío gratis habla solo de la tarifa", () => {
      applyWholesaleSettings(config({ flatShipping: 150, freeShippingFrom: 0 }));
      const envio = WHOLESALE_TERMS.conditions.find((x) => x.includes("Envío"));
      expect(envio).toContain("tarifa fija");
      expect(envio).not.toContain("gratis");
    });

    it("omite la vigencia cuando validityDays es 0", () => {
      applyWholesaleSettings(config({ validityDays: 0 }));
      expect(WHOLESALE_TERMS.conditions.some((x) => x.includes("Vigencia"))).toBe(false);
    });
  });
});

/* ------------------------------------------------------------------ */
describe("tierById", () => {
  beforeEach(() => applyWholesaleSettings(config()));

  it("devuelve el nivel con ese id", () => {
    expect(tierById("m12").minPieces).toBe(12);
  });

  it("un id inexistente cae al primer nivel", () => {
    expect(tierById("no-existe").id).toBe("lista");
  });

  it("el primer nivel es el de menor minPieces aunque se hayan guardado desordenados", () => {
    applyWholesaleSettings(config({ tiers: [NIVELES[3], NIVELES[1], NIVELES[0], NIVELES[2]] }));
    expect(tierById("no-existe").id).toBe("lista");
  });
});

describe("tierFor", () => {
  beforeEach(() => applyWholesaleSettings(config()));

  it.each([
    [0, "lista"],
    [1, "lista"],
    [5, "lista"],
    [6, "m6"],
    [7, "m6"],
    [11, "m6"],
    [12, "m12"],
    [13, "m12"],
    [23, "m12"],
    [24, "m24"],
    [25, "m24"],
    [10_000, "m24"],
  ])("con %i piezas aplica el nivel %s (límites exactos de minPieces)", (piezas, esperado) => {
    expect(tierFor(piezas).id).toBe(esperado);
  });

  it("con niveles guardados desordenados da el mismo resultado", () => {
    applyWholesaleSettings(config({ tiers: [NIVELES[2], NIVELES[0], NIVELES[3], NIVELES[1]] }));
    expect(tierFor(5).id).toBe("lista");
    expect(tierFor(6).id).toBe("m6");
    expect(tierFor(11).id).toBe("m6");
    expect(tierFor(12).id).toBe("m12");
    expect(tierFor(24).id).toBe("m24");
  });

  it("con un solo nivel siempre devuelve ese nivel", () => {
    applyWholesaleSettings(DEFAULT_WHOLESALE);
    expect(tierFor(0).id).toBe("lista");
    expect(tierFor(500).id).toBe("lista");
  });

  describe("regla de distribuidor", () => {
    it("distributorCustomerMin > 0: el distribuidor con suficientes piezas obtiene el último nivel", () => {
      applyWholesaleSettings(config({ distributorCustomerMin: 18 }));
      expect(tierFor(18, "distribuidor").id).toBe("m24");
      expect(tierFor(19, "distribuidor").id).toBe("m24");
    });

    it("el distribuidor con una pieza menos que el mínimo recibe el nivel normal", () => {
      applyWholesaleSettings(config({ distributorCustomerMin: 18 }));
      expect(tierFor(17, "distribuidor").id).toBe("m12");
    });

    it("la regla no aplica a mayoristas, menudeo ni a clientes sin tipo", () => {
      applyWholesaleSettings(config({ distributorCustomerMin: 18 }));
      expect(tierFor(18, "mayorista").id).toBe("m12");
      expect(tierFor(18, "menudeo").id).toBe("m12");
      expect(tierFor(18).id).toBe("m12");
    });

    it("distributorCustomerMin = 0: sin regla especial, el distribuidor sigue la tabla normal", () => {
      applyWholesaleSettings(config({ distributorCustomerMin: 0 }));
      expect(tierFor(1, "distribuidor").id).toBe("lista");
      expect(tierFor(18, "distribuidor").id).toBe("m12");
      expect(tierFor(24, "distribuidor").id).toBe("m24");
    });

    it("un distribuidor con muchas piezas nunca baja de nivel respecto al normal", () => {
      applyWholesaleSettings(config({ distributorCustomerMin: 18 }));
      for (let n = 0; n <= 60; n++)
        expect(tierFor(n, "distribuidor").minPieces).toBeGreaterThanOrEqual(tierFor(n).minPieces);
    });
  });
});

describe("nextTier", () => {
  beforeEach(() => applyWholesaleSettings(config()));

  it("indica el siguiente nivel y las piezas que faltan", () => {
    const n = nextTier(1);
    expect(n?.tier.id).toBe("m6");
    expect(n?.missing).toBe(5);
  });

  it("a una pieza del siguiente nivel falta 1", () => {
    expect(nextTier(5)?.missing).toBe(1);
    expect(nextTier(11)?.tier.id).toBe("m12");
    expect(nextTier(11)?.missing).toBe(1);
  });

  it("al alcanzar el límite exacto ya apunta al nivel siguiente", () => {
    const n = nextTier(6);
    expect(n?.tier.id).toBe("m12");
    expect(n?.missing).toBe(6);
  });

  it("en el último nivel no hay siguiente (null)", () => {
    expect(nextTier(24)).toBeNull();
    expect(nextTier(500)).toBeNull();
  });

  it("con 0 piezas faltan las del segundo nivel completas", () => {
    expect(nextTier(0)?.tier.id).toBe("m6");
    expect(nextTier(0)?.missing).toBe(6);
  });

  it("con un solo nivel no hay siguiente", () => {
    applyWholesaleSettings(DEFAULT_WHOLESALE);
    expect(nextTier(1)).toBeNull();
  });

  it("missing + piezas siempre alcanza el minPieces del siguiente nivel", () => {
    for (let n = 0; n < 24; n++) {
      const next = nextTier(n)!;
      expect(tierFor(n + next.missing).id).toBe(next.tier.id);
    }
  });

  describe("con regla de distribuidor", () => {
    beforeEach(() => applyWholesaleSettings(config({ distributorCustomerMin: 18 })));

    it("hacia el último nivel faltan solo las piezas del mínimo de distribuidor", () => {
      const n = nextTier(12, "distribuidor");
      expect(n?.tier.id).toBe("m24");
      expect(n?.missing).toBe(6);
      expect(tierFor(12 + n!.missing, "distribuidor").id).toBe("m24");
    });

    it("un mayorista con las mismas piezas sigue necesitando las del nivel normal", () => {
      expect(nextTier(12, "mayorista")?.missing).toBe(12);
    });

    it("al llegar al mínimo de distribuidor ya no hay siguiente nivel", () => {
      expect(nextTier(18, "distribuidor")).toBeNull();
    });

    it("si el mínimo de distribuidor es mayor que el nivel, se usa el del nivel", () => {
      applyWholesaleSettings(config({ distributorCustomerMin: 40 }));
      expect(nextTier(12, "distribuidor")?.missing).toBe(12);
    });

    it("antes del penúltimo nivel la regla no altera lo que falta", () => {
      expect(nextTier(1, "distribuidor")?.tier.id).toBe("m6");
      expect(nextTier(1, "distribuidor")?.missing).toBe(5);
    });
  });
});

describe("tierPrice", () => {
  it("aplica el descuento del nivel", () => {
    expect(tierPrice(200, tier("t", 6, 0.1))).toBe(180);
    expect(tierPrice(500, tier("t", 12, 0.2))).toBe(400);
  });

  it("redondea al múltiplo de $5 más cercano", () => {
    expect(tierPrice(199, tier("t", 6, 0.1))).toBe(180); // 179.1
    expect(tierPrice(209, tier("t", 6, 0.1))).toBe(190); // 188.1
    expect(tierPrice(103, tier("t", 6, 0.1))).toBe(95); // 92.7
  });

  it("con descuento 0 devuelve el precio de lista sin redondear", () => {
    expect(tierPrice(103, tier("lista", 1, 0))).toBe(103);
  });

  it("con descuento sí redondea a $5", () => {
    expect(tierPrice(103, tier("t", 6, 0.01))).toBe(100); // 101.97
  });

  it("2.5 de diferencia redondea hacia arriba", () => {
    expect(tierPrice(250, tier("t", 6, 0.01))).toBe(250); // 247.5 -> 250
    expect(tierPrice(100, tier("t", 6, 0.025))).toBe(100); // 97.5 -> 100
  });

  it("sin descuento deja los precios que ya son múltiplos de 5 intactos", () => {
    expect(tierPrice(250, tier("lista", 1, 0))).toBe(250);
  });

  it("precio 0 da 0", () => {
    expect(tierPrice(0, tier("t", 6, 0.3))).toBe(0);
  });

  it("descuento total (100%) da 0", () => {
    expect(tierPrice(300, tier("t", 6, 1))).toBe(0);
  });

  it("el resultado siempre es múltiplo de 5", () => {
    for (const precio of [89, 129, 157, 249, 333, 479])
      for (const d of [0.05, 0.1, 0.15, 0.25, 0.3])
        expect(tierPrice(precio, tier("t", 1, d)) % 5).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
describe("shippingFor", () => {
  it("freeShippingFrom = 0 significa que nunca es gratis", () => {
    applyWholesaleSettings(config({ flatShipping: 150, freeShippingFrom: 0 }));
    expect(shippingFor(100)).toBe(150);
    expect(shippingFor(1_000_000)).toBe(150);
  });

  it("el subtotal justo en el umbral es gratis", () => {
    applyWholesaleSettings(config({ flatShipping: 150, freeShippingFrom: 2000 }));
    expect(shippingFor(2000)).toBe(0);
  });

  it("un peso por debajo del umbral cobra la tarifa fija", () => {
    applyWholesaleSettings(config({ flatShipping: 150, freeShippingFrom: 2000 }));
    expect(shippingFor(1999)).toBe(150);
    expect(shippingFor(1999.99)).toBe(150);
  });

  it("por encima del umbral es gratis", () => {
    applyWholesaleSettings(config({ flatShipping: 150, freeShippingFrom: 2000 }));
    expect(shippingFor(2001)).toBe(0);
    expect(shippingFor(50_000)).toBe(0);
  });

  it("subtotal 0 no cobra envío", () => {
    applyWholesaleSettings(config({ flatShipping: 150, freeShippingFrom: 2000 }));
    expect(shippingFor(0)).toBe(0);
  });

  it("sin tarifa fija (flatShipping = 0) nunca cobra", () => {
    applyWholesaleSettings(config({ flatShipping: 0, freeShippingFrom: 2000 }));
    expect(shippingFor(10)).toBe(0);
    expect(shippingFor(5000)).toBe(0);
  });

  it("con la configuración por defecto no cobra envío", () => {
    expect(shippingFor(500)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
describe("sizeCurve", () => {
  const suma = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

  it("sin curva en el catálogo reparte parejo", () => {
    expect(sizeCurve(["S", "M", "L", "XL"])).toEqual({ S: 0.25, M: 0.25, L: 0.25, XL: 0.25 });
  });

  it("con curva configurada normaliza los pesos a proporciones", () => {
    applyCatalogSettings({ ...DEFAULT_CATALOG, sizeCurve: { S: 1, M: 2, L: 1 } });
    expect(sizeCurve(["S", "M", "L"])).toEqual({ S: 0.25, M: 0.5, L: 0.25 });
  });

  it("las proporciones siempre suman 1", () => {
    applyCatalogSettings({ ...DEFAULT_CATALOG, sizeCurve: { S: 1, M: 3, L: 2 } });
    expect(suma(sizeCurve(["S", "M", "L"]))).toBeCloseTo(1, 10);
    expect(suma(sizeCurve(["S", "M", "L", "XL"]))).toBeCloseTo(1, 10);
  });

  it("las tallas fuera de la curva toman el peso promedio de las que sí aparecen", () => {
    applyCatalogSettings({ ...DEFAULT_CATALOG, sizeCurve: { S: 1, M: 3 } });
    const c = sizeCurve(["S", "M", "XL"]); // XL pesa (1+3)/2 = 2 -> total 6
    expect(c.S).toBeCloseTo(1 / 6, 10);
    expect(c.M).toBeCloseTo(3 / 6, 10);
    expect(c.XL).toBeCloseTo(2 / 6, 10);
  });

  it("si ninguna talla está en la curva el reparto es parejo", () => {
    applyCatalogSettings({ ...DEFAULT_CATALOG, sizeCurve: { XXL: 5 } });
    expect(sizeCurve(["S", "M"])).toEqual({ S: 0.5, M: 0.5 });
  });

  it("los pesos negativos o no numéricos se tratan como ausentes", () => {
    applyCatalogSettings({
      ...DEFAULT_CATALOG,
      sizeCurve: { S: 2, M: -1, L: "x" as unknown as number },
    });
    const c = sizeCurve(["S", "M", "L"]);
    expect(c.S).toBeCloseTo(1 / 3, 10);
    expect(c.M).toBeCloseTo(1 / 3, 10);
    expect(c.L).toBeCloseTo(1 / 3, 10);
  });

  it("una talla con peso 0 se queda en 0", () => {
    applyCatalogSettings({ ...DEFAULT_CATALOG, sizeCurve: { S: 0, M: 1 } });
    expect(sizeCurve(["S", "M"])).toEqual({ S: 0, M: 1 });
  });

  it("sin tallas devuelve un objeto vacío", () => {
    expect(sizeCurve([])).toEqual({});
  });
});

describe("distributeBySize", () => {
  const suma = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

  it("sin tallas devuelve un objeto vacío", () => {
    expect(distributeBySize([], 10)).toEqual({});
  });

  it("qty 0 reparte 0 a cada talla", () => {
    expect(distributeBySize(["S", "M", "L"], 0)).toEqual({ S: 0, M: 0, L: 0 });
  });

  it("reparto parejo cuando divide exacto", () => {
    expect(distributeBySize(["S", "M", "L", "XL"], 12)).toEqual({ S: 3, M: 3, L: 3, XL: 3 });
  });

  it("reparto parejo con residuo: las primeras tallas reciben la pieza extra", () => {
    expect(distributeBySize(["S", "M", "L", "XL"], 6)).toEqual({ S: 2, M: 2, L: 1, XL: 1 });
    expect(distributeBySize(["S", "M", "L"], 7)).toEqual({ S: 3, M: 2, L: 2 });
  });

  it("menos piezas que tallas: solo se surten algunas tallas, sin pasarse", () => {
    const r = distributeBySize(["S", "M", "L", "XL"], 2);
    expect(suma(r)).toBe(2);
    expect(Math.max(...Object.values(r))).toBe(1);
  });

  it("con curva configurada respeta las proporciones", () => {
    applyCatalogSettings({ ...DEFAULT_CATALOG, sizeCurve: { S: 1, M: 2, L: 1 } });
    expect(distributeBySize(["S", "M", "L"], 8)).toEqual({ S: 2, M: 4, L: 2 });
  });

  it("con curva, el residuo va a las tallas con mayor resto fraccionario", () => {
    applyCatalogSettings({ ...DEFAULT_CATALOG, sizeCurve: { S: 1, M: 2, L: 1 } });
    // 5 piezas: S 1.25, M 2.5, L 1.25 -> pisos 1,2,1 y la pieza que falta va a M (resto .5)
    expect(distributeBySize(["S", "M", "L"], 5)).toEqual({ S: 1, M: 3, L: 1 });
  });

  it("tallas fuera de la curva reciben piezas según el peso promedio", () => {
    applyCatalogSettings({ ...DEFAULT_CATALOG, sizeCurve: { S: 1, M: 3 } });
    expect(distributeBySize(["S", "M", "XL"], 12)).toEqual({ S: 2, M: 6, XL: 4 });
  });

  it("una talla con peso 0 no recibe piezas", () => {
    applyCatalogSettings({ ...DEFAULT_CATALOG, sizeCurve: { S: 0, M: 1 } });
    expect(distributeBySize(["S", "M"], 5)).toEqual({ S: 0, M: 5 });
  });

  it("devuelve una clave por cada talla recibida", () => {
    expect(Object.keys(distributeBySize(["28", "30", "32"], 9))).toEqual(["28", "30", "32"]);
  });

  it("la suma repartida es exactamente qty, sin curva (qty 0 a 120, varias corridas)", () => {
    for (const tallas of [["Única"], ["S", "M"], ["S", "M", "L"], ["XS", "S", "M", "L", "XL", "XXL"], ["28", "30", "32", "34", "36"]])
      for (let qty = 0; qty <= 120; qty++) {
        const r = distributeBySize(tallas, qty);
        expect(suma(r)).toBe(qty);
        for (const v of Object.values(r)) {
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
        }
      }
  });

  it("la suma repartida es exactamente qty con curvas irregulares", () => {
    const curvas: Record<string, number>[] = [
      { S: 1, M: 2, L: 2, XL: 1 },
      { S: 0.1, M: 0.3, L: 0.4, XL: 0.2 },
      { S: 7, M: 3 },
      { S: 1, M: 1, L: 1 },
      { S: 0, M: 0, L: 0, XL: 0 },
      { S: 0.333, M: 0.333, L: 0.334 },
    ];
    for (const curva of curvas) {
      applyCatalogSettings({ ...DEFAULT_CATALOG, sizeCurve: curva });
      for (let qty = 0; qty <= 100; qty++) {
        const r = distributeBySize(["S", "M", "L", "XL"], qty);
        expect(suma(r)).toBe(qty);
        for (const v of Object.values(r)) expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
describe("expandPackage", () => {
  const BODEGA = "bodega";
  const TIENDA = "tienda";
  const TALLAS = ["S", "M", "L", "XL"];

  const producto = (id: string, category: string, over: Partial<Product> = {}): Product => ({
    id,
    sku: id.toUpperCase(),
    name: `Modelo ${id}`,
    brand: "Marca",
    category,
    cost: 100,
    price: 250,
    sizes: TALLAS,
    colors: [
      { name: "Rojo", hex: "#f00" },
      { name: "Azul", hex: "#00f" },
    ],
    minStock: 2,
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    ...over,
  });

  /** Pone `qty` piezas en todas las tallas del color indicado, en una sucursal. */
  const surtir = (stock: StockMap, p: Product, color: string, qty: number, branch = BODEGA) => {
    for (const s of p.sizes) {
      const k = variantKey(p.id, color, s);
      stock[k] = { ...stock[k], [branch]: qty };
    }
  };

  const paquete = (mix: { category: string; qty: number }[]): WholesalePackage => ({
    id: "k",
    name: "Paquete",
    pieces: mix.reduce((a, m) => a + m.qty, 0),
    description: "",
    mix,
  });

  const suma = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

  it("surte el paquete desde la sucursal recibida, parejo por talla", () => {
    const p = producto("p1", "Blusas");
    const stock: StockMap = {};
    surtir(stock, p, "Rojo", 10);
    const r = expandPackage(paquete([{ category: "Blusas", qty: 8 }]), [p], stock, BODEGA);
    expect(r.shortfall).toBe(0);
    expect(r.lines).toEqual({
      "p1|Rojo|S": 2,
      "p1|Rojo|M": 2,
      "p1|Rojo|L": 2,
      "p1|Rojo|XL": 2,
    });
  });

  it("usa la sucursal recibida: sin stock ahí todo es faltante", () => {
    const p = producto("p1", "Blusas");
    const stock: StockMap = {};
    surtir(stock, p, "Rojo", 10, TIENDA);
    const enBodega = expandPackage(paquete([{ category: "Blusas", qty: 8 }]), [p], stock, BODEGA);
    expect(enBodega.lines).toEqual({});
    expect(enBodega.shortfall).toBe(8);
    const enTienda = expandPackage(paquete([{ category: "Blusas", qty: 8 }]), [p], stock, TIENDA);
    expect(suma(enTienda.lines)).toBe(8);
    expect(enTienda.shortfall).toBe(0);
  });

  it("no mezcla el stock de otras sucursales", () => {
    const p = producto("p1", "Blusas");
    const stock: StockMap = {};
    surtir(stock, p, "Rojo", 1, BODEGA);
    surtir(stock, p, "Rojo", 50, TIENDA);
    const r = expandPackage(paquete([{ category: "Blusas", qty: 20 }]), [p], stock, BODEGA);
    expect(suma(r.lines)).toBe(4); // solo hay 1 por talla en bodega
    expect(r.shortfall).toBe(16);
  });

  it("respeta la mezcla por categoría del paquete", () => {
    const blusa = producto("b1", "Blusas");
    const jean = producto("j1", "Jeans", { sizes: ["28", "30", "32"] });
    const stock: StockMap = {};
    surtir(stock, blusa, "Rojo", 20);
    surtir(stock, jean, "Rojo", 20);
    const r = expandPackage(
      paquete([
        { category: "Blusas", qty: 8 },
        { category: "Jeans", qty: 6 },
      ]),
      [blusa, jean],
      stock,
      BODEGA,
    );
    const deBlusa = Object.entries(r.lines).filter(([k]) => k.startsWith("b1|"));
    const deJean = Object.entries(r.lines).filter(([k]) => k.startsWith("j1|"));
    expect(deBlusa.reduce((a, [, v]) => a + v, 0)).toBe(8);
    expect(deJean.reduce((a, [, v]) => a + v, 0)).toBe(6);
    expect(r.shortfall).toBe(0);
  });

  it("no toma productos de categorías que el paquete no pide", () => {
    const blusa = producto("b1", "Blusas");
    const falda = producto("f1", "Faldas");
    const stock: StockMap = {};
    surtir(stock, blusa, "Rojo", 20);
    surtir(stock, falda, "Rojo", 500);
    const r = expandPackage(paquete([{ category: "Blusas", qty: 4 }]), [blusa, falda], stock, BODEGA);
    expect(Object.keys(r.lines).every((k) => k.startsWith("b1|"))).toBe(true);
  });

  it("una categoría sin productos suma toda su cantidad al faltante y no frena las demás", () => {
    const blusa = producto("b1", "Blusas");
    const stock: StockMap = {};
    surtir(stock, blusa, "Rojo", 20);
    const r = expandPackage(
      paquete([
        { category: "Vestidos", qty: 6 },
        { category: "Blusas", qty: 4 },
      ]),
      [blusa],
      stock,
      BODEGA,
    );
    expect(r.shortfall).toBe(6);
    expect(suma(r.lines)).toBe(4);
  });

  it("ignora productos inactivos", () => {
    const p = producto("p1", "Blusas", { active: false });
    const stock: StockMap = {};
    surtir(stock, p, "Rojo", 20);
    const r = expandPackage(paquete([{ category: "Blusas", qty: 4 }]), [p], stock, BODEGA);
    expect(r.lines).toEqual({});
    expect(r.shortfall).toBe(4);
  });

  it("ignora productos con stock 0 en la sucursal", () => {
    const sinStock = producto("p1", "Blusas");
    const conStock = producto("p2", "Blusas");
    const stock: StockMap = {};
    surtir(stock, sinStock, "Rojo", 0);
    surtir(stock, conStock, "Rojo", 5);
    const r = expandPackage(paquete([{ category: "Blusas", qty: 4 }]), [sinStock, conStock], stock, BODEGA);
    expect(Object.keys(r.lines).every((k) => k.startsWith("p2|"))).toBe(true);
    expect(r.shortfall).toBe(0);
  });

  it("elige el modelo con más stock disponible", () => {
    const poco = producto("p1", "Blusas");
    const mucho = producto("p2", "Blusas");
    const stock: StockMap = {};
    surtir(stock, poco, "Rojo", 3);
    surtir(stock, mucho, "Rojo", 9);
    const r = expandPackage(paquete([{ category: "Blusas", qty: 4 }]), [poco, mucho], stock, BODEGA);
    expect(Object.keys(r.lines).every((k) => k.startsWith("p2|"))).toBe(true);
  });

  it("con menos de 12 piezas usa un solo modelo y un solo color", () => {
    const p1 = producto("p1", "Blusas");
    const p2 = producto("p2", "Blusas");
    const stock: StockMap = {};
    for (const p of [p1, p2]) {
      surtir(stock, p, "Rojo", 10);
      surtir(stock, p, "Azul", 10);
    }
    const r = expandPackage(paquete([{ category: "Blusas", qty: 11 }]), [p1, p2], stock, BODEGA);
    const modelos = new Set(Object.keys(r.lines).map((k) => k.split("|")[0]));
    const colores = new Set(Object.keys(r.lines).map((k) => k.split("|")[1]));
    expect(modelos.size).toBe(1);
    expect(colores.size).toBe(1);
    expect(suma(r.lines)).toBe(11);
  });

  it("con 12 piezas o más reparte entre dos modelos", () => {
    const p1 = producto("p1", "Blusas");
    const p2 = producto("p2", "Blusas");
    const p3 = producto("p3", "Blusas");
    const stock: StockMap = {};
    surtir(stock, p1, "Rojo", 10);
    surtir(stock, p2, "Rojo", 9);
    surtir(stock, p3, "Rojo", 1);
    const r = expandPackage(paquete([{ category: "Blusas", qty: 12 }]), [p1, p2, p3], stock, BODEGA);
    const porModelo = (id: string) =>
      Object.entries(r.lines)
        .filter(([k]) => k.startsWith(`${id}|`))
        .reduce((a, [, v]) => a + v, 0);
    expect(porModelo("p1")).toBe(6);
    expect(porModelo("p2")).toBe(6);
    expect(porModelo("p3")).toBe(0);
    expect(r.shortfall).toBe(0);
  });

  it("con 24 piezas en un modelo usa dos colores (12 y 12)", () => {
    const p = producto("p1", "Blusas");
    const stock: StockMap = {};
    surtir(stock, p, "Rojo", 10);
    surtir(stock, p, "Azul", 10);
    const r = expandPackage(paquete([{ category: "Blusas", qty: 24 }]), [p], stock, BODEGA);
    const porColor = (c: string) =>
      Object.entries(r.lines)
        .filter(([k]) => k.split("|")[1] === c)
        .reduce((a, [, v]) => a + v, 0);
    expect(porColor("Rojo")).toBe(12);
    expect(porColor("Azul")).toBe(12);
    expect(r.shortfall).toBe(0);
  });

  it("respeta la curva de tallas configurada", () => {
    applyCatalogSettings({ ...DEFAULT_CATALOG, sizeCurve: { S: 1, M: 2, L: 2, XL: 1 } });
    const p = producto("p1", "Blusas");
    const stock: StockMap = {};
    surtir(stock, p, "Rojo", 50);
    const r = expandPackage(paquete([{ category: "Blusas", qty: 12 }]), [p], stock, BODEGA);
    expect(r.lines).toEqual({
      "p1|Rojo|S": 2,
      "p1|Rojo|M": 4,
      "p1|Rojo|L": 4,
      "p1|Rojo|XL": 2,
    });
  });

  it("sin stock suficiente en una talla toma lo que hay y suma el resto al faltante", () => {
    const p = producto("p1", "Blusas");
    const stock: StockMap = {};
    surtir(stock, p, "Rojo", 10);
    stock["p1|Rojo|S"] = { [BODEGA]: 1 };
    const r = expandPackage(paquete([{ category: "Blusas", qty: 8 }]), [p], stock, BODEGA);
    expect(r.lines["p1|Rojo|S"]).toBe(1);
    expect(r.lines["p1|Rojo|M"]).toBe(2);
    expect(r.shortfall).toBe(1);
    expect(suma(r.lines) + r.shortfall).toBe(8);
  });

  it("una talla agotada no se incluye en las líneas", () => {
    const p = producto("p1", "Blusas");
    const stock: StockMap = {};
    surtir(stock, p, "Rojo", 10);
    stock["p1|Rojo|XL"] = { [BODEGA]: 0 };
    const r = expandPackage(paquete([{ category: "Blusas", qty: 8 }]), [p], stock, BODEGA);
    expect("p1|Rojo|XL" in r.lines).toBe(false);
    expect(r.shortfall).toBe(2);
  });

  it("nunca surte más que el stock de la bodega", () => {
    const p = producto("p1", "Blusas");
    const stock: StockMap = {};
    surtir(stock, p, "Rojo", 2);
    const r = expandPackage(paquete([{ category: "Blusas", qty: 100 }]), [p], stock, BODEGA);
    for (const [k, v] of Object.entries(r.lines)) expect(v).toBeLessThanOrEqual(stock[k][BODEGA]);
    expect(suma(r.lines)).toBe(8);
    expect(r.shortfall).toBe(92);
  });

  it("dos renglones de la misma categoría no usan dos veces la misma existencia", () => {
    const p = producto("p1", "Blusas");
    const stock: StockMap = {};
    surtir(stock, p, "Rojo", 2); // 8 piezas en total
    const r = expandPackage(
      paquete([
        { category: "Blusas", qty: 8 },
        { category: "Blusas", qty: 8 },
      ]),
      [p],
      stock,
      BODEGA,
    );
    expect(suma(r.lines)).toBe(8);
    expect(r.shortfall).toBe(8);
  });

  it("con stock en otro color completa lo que el primero no alcanza al repetir categoría", () => {
    const p = producto("p1", "Blusas");
    const stock: StockMap = {};
    surtir(stock, p, "Rojo", 2);
    surtir(stock, p, "Azul", 2);
    const r = expandPackage(
      paquete([
        { category: "Blusas", qty: 8 },
        { category: "Blusas", qty: 8 },
      ]),
      [p],
      stock,
      BODEGA,
    );
    expect(suma(r.lines)).toBe(16);
    expect(r.shortfall).toBe(0);
  });

  it("un paquete sin mezcla no surte nada ni deja faltante", () => {
    const p = producto("p1", "Blusas");
    expect(expandPackage(paquete([]), [p], {}, BODEGA)).toEqual({ lines: {}, shortfall: 0 });
  });

  it("surtido + faltante siempre es igual a la cantidad pedida en el paquete", () => {
    const blusa = producto("b1", "Blusas");
    const jean = producto("j1", "Jeans", { sizes: ["28", "30", "32"] });
    const stock: StockMap = {};
    surtir(stock, blusa, "Rojo", 3);
    surtir(stock, jean, "Rojo", 1);
    for (const qty of [1, 5, 11, 12, 13, 24, 50]) {
      const pkg = paquete([
        { category: "Blusas", qty },
        { category: "Jeans", qty },
        { category: "Vestidos", qty },
      ]);
      const r = expandPackage(pkg, [blusa, jean], stock, BODEGA);
      expect(suma(r.lines) + r.shortfall).toBe(qty * 3);
    }
  });
});
