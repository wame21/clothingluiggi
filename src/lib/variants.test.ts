import { afterEach, describe, expect, it, vi } from "vitest";
import type { Product, StockMap } from "@/lib/types";
import {
  buildLineItems,
  hasKeySeparator,
  productStock,
  qtyTotal,
  stockOf,
  uid,
  variantKey,
} from "@/lib/variants";

const producto = (over: Partial<Product> = {}): Product => ({
  id: "p1",
  sku: "BL-001",
  name: "Blusa lino",
  brand: "Marca",
  category: "Blusas",
  cost: 100,
  price: 250,
  sizes: ["S", "M"],
  colors: [
    { name: "Rojo", hex: "#f00" },
    { name: "Azul", hex: "#00f" },
  ],
  minStock: 2,
  active: true,
  createdAt: "2026-01-01T00:00:00Z",
  ...over,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("qtyTotal", () => {
  it("suma las cantidades positivas", () => {
    expect(qtyTotal({ a: 2, b: 3, c: 5 })).toBe(10);
  });

  it("ignora cantidades negativas y ceros", () => {
    expect(qtyTotal({ a: 4, b: -3, c: 0 })).toBe(4);
  });

  it("un mapa vacío suma 0", () => {
    expect(qtyTotal({})).toBe(0);
  });

  it("ignora valores no numéricos (NaN)", () => {
    expect(qtyTotal({ a: Number.NaN, b: 2 })).toBe(2);
  });
});

describe("variantKey", () => {
  it("une producto, color y talla con |", () => {
    expect(variantKey("p1", "Rojo", "M")).toBe("p1|Rojo|M");
  });
});

describe("hasKeySeparator", () => {
  it("hasKeySeparator detecta | en colores y tallas", () => {
    expect(hasKeySeparator("Rojo|Vino")).toBe(true);
    expect(hasKeySeparator("S|M")).toBe(true);
    expect(hasKeySeparator("|")).toBe(true);
  });

  it("hasKeySeparator no marca nombres válidos", () => {
    for (const ok of ["Café oscuro", "Azul marino", "28/30", "Rojo-Vino", "Ñandú", "XL", ""])
      expect(hasKeySeparator(ok)).toBe(false);
  });
});

describe("buildLineItems", () => {
  const precioLista = (p: Product) => p.price;

  it("arma una línea con precio de unitPriceOf, costo y precio de lista", () => {
    const p = producto();
    const items = buildLineItems({ "p1|Rojo|M": 3 }, [p], (x) => x.price * 0.8);
    expect(items).toEqual([
      {
        productId: "p1",
        variantKey: "p1|Rojo|M",
        name: "Blusa lino",
        color: "Rojo",
        size: "M",
        qty: 3,
        unitPrice: 200,
        unitCost: 100,
        listPrice: 250,
      },
    ]);
  });

  it("omite cantidades 0, negativas y variantes sin captura", () => {
    const items = buildLineItems(
      { "p1|Rojo|S": 0, "p1|Rojo|M": -2, "p1|Azul|S": 1 },
      [producto()],
      precioLista,
    );
    expect(items.map((i) => i.variantKey)).toEqual(["p1|Azul|S"]);
  });

  it("ignora variantes de productos inexistentes", () => {
    const items = buildLineItems(
      { "fantasma|Rojo|M": 5, "p1|Rojo|M": 1 },
      [producto()],
      precioLista,
    );
    expect(items).toHaveLength(1);
    expect(items[0].productId).toBe("p1");
  });

  it("ignora colores o tallas que el producto ya no tiene", () => {
    const items = buildLineItems(
      { "p1|Verde|M": 2, "p1|Rojo|XXL": 2 },
      [producto()],
      precioLista,
    );
    expect(items).toEqual([]);
  });

  it("ordena como el catálogo: producto, color y talla", () => {
    const p1 = producto();
    const p2 = producto({ id: "p2", name: "Falda" });
    const items = buildLineItems(
      { "p2|Rojo|S": 1, "p1|Azul|M": 1, "p1|Rojo|S": 1 },
      [p1, p2],
      precioLista,
    );
    expect(items.map((i) => i.variantKey)).toEqual([
      "p1|Rojo|S",
      "p1|Azul|M",
      "p2|Rojo|S",
    ]);
  });

  it("llama a unitPriceOf con el producto de la línea", () => {
    const p1 = producto();
    const p2 = producto({ id: "p2", price: 400 });
    const items = buildLineItems(
      { "p1|Rojo|S": 1, "p2|Rojo|S": 1 },
      [p1, p2],
      (p) => (p.id === "p1" ? 111 : 222),
    );
    expect(items.map((i) => i.unitPrice)).toEqual([111, 222]);
  });

  it("un mapa vacío no genera líneas", () => {
    expect(buildLineItems({}, [producto()], precioLista)).toEqual([]);
  });
});

describe("stockOf", () => {
  const stock: StockMap = {
    "p1|Rojo|M": { bodega: 5, tienda: 3 },
    "p1|Rojo|S": { bodega: 0 },
  };

  it("devuelve el stock de la sucursal indicada", () => {
    expect(stockOf(stock, "p1|Rojo|M", "bodega")).toBe(5);
    expect(stockOf(stock, "p1|Rojo|M", "tienda")).toBe(3);
  });

  it("una sucursal ausente cuenta como 0", () => {
    expect(stockOf(stock, "p1|Rojo|M", "otra")).toBe(0);
    expect(stockOf(stock, "p1|Rojo|S", "tienda")).toBe(0);
  });

  it("sin sucursal suma todas", () => {
    expect(stockOf(stock, "p1|Rojo|M")).toBe(8);
  });

  it("una variante sin registro vale 0, con o sin sucursal", () => {
    expect(stockOf(stock, "nada|x|y")).toBe(0);
    expect(stockOf(stock, "nada|x|y", "bodega")).toBe(0);
  });
});

describe("productStock", () => {
  const p = producto();
  const stock: StockMap = {
    "p1|Rojo|S": { bodega: 2, tienda: 1 },
    "p1|Rojo|M": { bodega: 3 },
    "p1|Azul|S": { tienda: 4 },
    "p1|Azul|M": { bodega: 1, tienda: 1 },
    "otro|Rojo|S": { bodega: 100 },
  };

  it("suma todas las variantes y sucursales", () => {
    expect(productStock(p, stock)).toBe(12);
  });

  it("filtra por sucursal", () => {
    expect(productStock(p, stock, "bodega")).toBe(6);
    expect(productStock(p, stock, "tienda")).toBe(6);
  });

  it("no cuenta variantes de otros productos", () => {
    expect(productStock(p, { "otro|Rojo|S": { bodega: 9 } })).toBe(0);
  });

  it("un producto sin stock registrado vale 0", () => {
    expect(productStock(p, {})).toBe(0);
  });
});

describe("uid", () => {
  it("antepone el prefijo", () => {
    expect(uid("ped-").startsWith("ped-")).toBe(true);
  });

  it("sin prefijo solo trae caracteres base 36", () => {
    expect(uid()).toMatch(/^[0-9a-z]+$/);
  });

  it("combina la marca de tiempo y un sufijo aleatorio", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const base = (1_700_000_000_000).toString(36);
    expect(uid("x-")).toBe(`x-${base}${(0.5).toString(36).slice(2, 7)}`);
  });

  it("genera 1000 ids únicos (aleatoriedad determinista)", () => {
    // Generador con semilla fija para que la prueba no sea intermitente.
    let s = 123456789;
    vi.spyOn(Math, "random").mockImplementation(() => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 2 ** 32;
    });
    const ids = new Set(Array.from({ length: 1000 }, () => uid("id-")));
    expect(ids.size).toBe(1000);
  });
});
