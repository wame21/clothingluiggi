import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CATALOG,
  DEFAULT_PROFILE,
  DEFAULT_SALES,
  applyCatalogSettings,
  applySalesSettings,
  catalogFrom,
  currentCatalog,
  currentSales,
  paymentFee,
  profileFrom,
  salesFrom,
} from "./settings";
import type { CatalogSettings, SalesSettings } from "./settings";
import type { PaymentMethod } from "./types";

// Valores que la base podría devolver si `settings` se guardó mal: no deben tumbar la app.
const basura: unknown[] = [null, undefined, {}, [], "texto", 42, true, 0, ""];

beforeEach(() => {
  applyCatalogSettings(catalogFrom(undefined));
  applySalesSettings(salesFrom(undefined));
});

describe("valores por defecto (docs/arquitectura-saas.md)", () => {
  it("DEFAULT_PROFILE es neutro, sin datos de una tienda", () => {
    expect(DEFAULT_PROFILE).toEqual({
      legalName: "",
      phone: "",
      email: "",
      instagram: "",
      web: "",
      city: "",
      address: "",
      ticketFooter: "¡Gracias por tu compra!",
      logoUrl: null,
      accentColor: null,
    });
  });

  it("DEFAULT_CATALOG trae las 11 categorías, 4 presets de tallas y curva vacía", () => {
    expect(DEFAULT_CATALOG.categories).toEqual([
      "Blusas",
      "Camisas",
      "Playeras",
      "Polos",
      "Pantalones",
      "Jeans",
      "Vestidos",
      "Faldas",
      "Shorts",
      "Chamarras y suéteres",
      "Accesorios",
    ]);
    expect(DEFAULT_CATALOG.sizePresets).toEqual([
      { name: "Ropa S–XL", sizes: ["S", "M", "L", "XL"] },
      { name: "Ropa XS–XXL", sizes: ["XS", "S", "M", "L", "XL", "XXL"] },
      { name: "Pantalón 28–36", sizes: ["28", "30", "32", "34", "36"] },
      { name: "Unitalla", sizes: ["Única"] },
    ]);
    expect(DEFAULT_CATALOG.sizeCurve).toEqual({});
  });

  it("DEFAULT_SALES: 4 canales (sin mayoreo), paqueterías y comisiones", () => {
    expect(DEFAULT_SALES.channels).toEqual(["tienda", "web", "instagram", "whatsapp"]);
    expect(DEFAULT_SALES.channels).not.toContain("mayoreo");
    expect(DEFAULT_SALES.carriers).toEqual(["Estafeta", "FedEx", "DHL", "Paquetexpress", "J&T"]);
    expect(DEFAULT_SALES.paymentFees).toEqual({
      efectivo: 0,
      transferencia: 0,
      tarjeta: 0.036,
      mercadopago: 0.0406,
      paypal: 0.0458,
    });
  });

  it("el estado inicial del módulo equivale a los defaults", () => {
    expect(currentCatalog()).toEqual(DEFAULT_CATALOG);
    expect(currentSales()).toEqual(DEFAULT_SALES);
  });
});

describe("profileFrom", () => {
  it.each([null, undefined, {}])("%j → defaults", (v) => {
    expect(profileFrom(v)).toEqual(DEFAULT_PROFILE);
  });

  it("un perfil parcial conserva el resto de los defaults", () => {
    const p = profileFrom({ legalName: "Moda SA", city: "Culiacán" });
    expect(p.legalName).toBe("Moda SA");
    expect(p.city).toBe("Culiacán");
    expect(p.ticketFooter).toBe(DEFAULT_PROFILE.ticketFooter);
    expect(p.logoUrl).toBeNull();
    expect(p.accentColor).toBeNull();
  });

  it("un perfil completo se respeta tal cual", () => {
    const completo = {
      legalName: "A",
      phone: "1",
      email: "a@b.c",
      instagram: "@a",
      web: "a.com",
      city: "C",
      address: "D",
      ticketFooter: "Vuelve pronto",
      logoUrl: "https://x/logo.png",
      accentColor: "#112233",
    };
    expect(profileFrom(completo)).toEqual(completo);
  });

  it.each(basura)("entrada basura %j no lanza ni pierde defaults", (v) => {
    const p = profileFrom(v as never);
    for (const [k, valor] of Object.entries(DEFAULT_PROFILE)) {
      expect(p, k).toHaveProperty(k, valor);
    }
  });

  it("no devuelve el objeto DEFAULT_PROFILE ni lo contamina", () => {
    const p = profileFrom(undefined);
    expect(p).not.toBe(DEFAULT_PROFILE);
    p.legalName = "Cambiado";
    expect(DEFAULT_PROFILE.legalName).toBe("");
    expect(profileFrom(undefined).legalName).toBe("");
  });
});

describe("catalogFrom", () => {
  it.each([null, undefined, {}])("%j → defaults", (v) => {
    expect(catalogFrom(v)).toEqual(DEFAULT_CATALOG);
  });

  it("respeta lo guardado campo por campo", () => {
    const c = catalogFrom({ categories: ["Solo una"] });
    expect(c.categories).toEqual(["Solo una"]);
    expect(c.sizePresets).toEqual(DEFAULT_CATALOG.sizePresets);
    expect(c.sizeCurve).toEqual({});
  });

  it("una lista vacía guardada es válida (no vuelve al default)", () => {
    expect(catalogFrom({ categories: [], sizePresets: [] })).toEqual({
      categories: [],
      sizePresets: [],
      sizeCurve: {},
    });
  });

  it("respeta sizeCurve y presets guardados", () => {
    const guardado = {
      categories: ["A"],
      sizePresets: [{ name: "P", sizes: ["S"] }],
      sizeCurve: { S: 2, M: 3 },
    };
    expect(catalogFrom(guardado)).toEqual(guardado);
  });

  it("campos con tipo equivocado caen al default de ese campo", () => {
    const c = catalogFrom({ categories: "Blusas", sizePresets: 7, sizeCurve: "x" });
    expect(c).toEqual(DEFAULT_CATALOG);
  });

  it("sizeCurve arreglo cae al default {}", () => {
    expect(catalogFrom({ sizeCurve: [1, 2] }).sizeCurve).toEqual({});
  });

  it("sizeCurve null cae al default {}", () => {
    expect(catalogFrom({ sizeCurve: null }).sizeCurve).toEqual({});
  });

  it.each(basura)("entrada basura %j no lanza y devuelve un catálogo usable", (v) => {
    const c = catalogFrom(v as never);
    expect(Array.isArray(c.categories)).toBe(true);
    expect(Array.isArray(c.sizePresets)).toBe(true);
    expect(typeof c.sizeCurve).toBe("object");
    expect(c.categories.length).toBeGreaterThan(0);
  });

  it("los defaults devueltos son copias: mutarlos no daña DEFAULT_CATALOG", () => {
    const c = catalogFrom(undefined);
    c.categories.push("Nueva");
    c.sizePresets[0].sizes.push("XXXL");
    c.sizeCurve.S = 9;
    expect(DEFAULT_CATALOG.categories).not.toContain("Nueva");
    expect(DEFAULT_CATALOG.sizePresets[0].sizes).not.toContain("XXXL");
    expect(DEFAULT_CATALOG.sizeCurve).toEqual({});
    expect(catalogFrom(undefined)).toEqual(DEFAULT_CATALOG);
  });
});

describe("salesFrom", () => {
  it.each([null, undefined, {}])("%j → defaults", (v) => {
    expect(salesFrom(v)).toEqual(DEFAULT_SALES);
  });

  it("respeta canales y paqueterías guardados", () => {
    const s = salesFrom({ channels: ["tienda", "mayoreo"], carriers: ["Local"] });
    expect(s.channels).toEqual(["tienda", "mayoreo"]);
    expect(s.carriers).toEqual(["Local"]);
    expect(s.paymentFees).toEqual(DEFAULT_SALES.paymentFees);
  });

  it("comisiones parciales se mezclan con los defaults de las demás", () => {
    const s = salesFrom({ paymentFees: { tarjeta: 0.05 } });
    expect(s.paymentFees).toEqual({ ...DEFAULT_SALES.paymentFees, tarjeta: 0.05 });
  });

  it("una comisión guardada en 0 se respeta (no vuelve al default)", () => {
    expect(salesFrom({ paymentFees: { tarjeta: 0 } }).paymentFees.tarjeta).toBe(0);
  });

  it("paymentFees null no pierde las comisiones por defecto", () => {
    expect(salesFrom({ paymentFees: null }).paymentFees).toEqual(DEFAULT_SALES.paymentFees);
  });

  it("campos con tipo equivocado caen al default de ese campo", () => {
    const s = salesFrom({ channels: "tienda", carriers: { a: 1 } });
    expect(s.channels).toEqual(DEFAULT_SALES.channels);
    expect(s.carriers).toEqual(DEFAULT_SALES.carriers);
  });

  it.each(basura)("entrada basura %j no lanza y conserva todas las comisiones", (v) => {
    const s = salesFrom(v as never);
    expect(Array.isArray(s.channels)).toBe(true);
    expect(Array.isArray(s.carriers)).toBe(true);
    expect(s.paymentFees).toEqual(DEFAULT_SALES.paymentFees);
  });

  it("los defaults devueltos son copias: mutarlos no daña DEFAULT_SALES", () => {
    const s = salesFrom(undefined);
    s.channels.push("mayoreo");
    s.carriers.push("Otra");
    s.paymentFees.tarjeta = 0.99;
    expect(DEFAULT_SALES.channels).not.toContain("mayoreo");
    expect(DEFAULT_SALES.carriers).not.toContain("Otra");
    expect(DEFAULT_SALES.paymentFees.tarjeta).toBe(0.036);
    expect(salesFrom(undefined)).toEqual(DEFAULT_SALES);
  });
});

describe("configuración vigente", () => {
  it("applyCatalogSettings / currentCatalog", () => {
    const c: CatalogSettings = { categories: ["Zapatos"], sizePresets: [], sizeCurve: { "26": 1 } };
    applyCatalogSettings(c);
    expect(currentCatalog()).toBe(c);
    expect(currentCatalog().categories).toEqual(["Zapatos"]);
  });

  it("applyCatalogSettings reemplaza por completo, sin mezclar con el anterior", () => {
    applyCatalogSettings({ categories: ["A"], sizePresets: [], sizeCurve: { S: 1 } });
    applyCatalogSettings({ categories: ["B"], sizePresets: [], sizeCurve: {} });
    expect(currentCatalog()).toEqual({ categories: ["B"], sizePresets: [], sizeCurve: {} });
  });

  it("applySalesSettings / currentSales", () => {
    const s: SalesSettings = {
      channels: ["tienda"],
      carriers: ["Local"],
      paymentFees: { ...DEFAULT_SALES.paymentFees, tarjeta: 0.05 },
    };
    applySalesSettings(s);
    expect(currentSales()).toBe(s);
    expect(currentSales().channels).toEqual(["tienda"]);
  });

  it("el beforeEach restablece el estado entre pruebas", () => {
    expect(currentSales()).toEqual(DEFAULT_SALES);
    expect(currentCatalog()).toEqual(DEFAULT_CATALOG);
  });
});

describe("paymentFee", () => {
  it("con los defaults devuelve las comisiones del contrato", () => {
    expect(paymentFee("efectivo")).toBe(0);
    expect(paymentFee("transferencia")).toBe(0);
    expect(paymentFee("tarjeta")).toBe(0.036);
    expect(paymentFee("mercadopago")).toBe(0.0406);
    expect(paymentFee("paypal")).toBe(0.0458);
  });

  it("usa la comisión del método configurado", () => {
    applySalesSettings(salesFrom({ paymentFees: { tarjeta: 0.025, paypal: 0.06 } }));
    expect(paymentFee("tarjeta")).toBe(0.025);
    expect(paymentFee("paypal")).toBe(0.06);
    expect(paymentFee("mercadopago")).toBe(0.0406);
  });

  it("un método sin comisión configurada cuesta 0", () => {
    applySalesSettings({
      channels: [],
      carriers: [],
      paymentFees: { efectivo: 0 } as Record<PaymentMethod, number>,
    });
    expect(paymentFee("tarjeta")).toBe(0);
    expect(paymentFee("paypal")).toBe(0);
  });

  it("un método desconocido cuesta 0", () => {
    expect(paymentFee("bitcoin" as PaymentMethod)).toBe(0);
  });

  it("una comisión null guardada se trata como 0", () => {
    applySalesSettings(salesFrom({ paymentFees: { tarjeta: null } }));
    expect(paymentFee("tarjeta")).toBe(0);
  });

  it("refleja el último applySalesSettings", () => {
    applySalesSettings(salesFrom({ paymentFees: { tarjeta: 0.1 } }));
    expect(paymentFee("tarjeta")).toBe(0.1);
    applySalesSettings(salesFrom(undefined));
    expect(paymentFee("tarjeta")).toBe(0.036);
  });
});
