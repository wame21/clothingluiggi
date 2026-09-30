import type {
  BranchId,
  Category,
  CustomerType,
  Product,
  StockMap,
  TierId,
} from "./types";
import { variantKey } from "./variants";

/**
 * Esquema de mayoreo de Luiggi Boutique. El nivel se determina por el total de
 * piezas del pedido (se pueden mezclar modelos, colores y tallas). Los valores
 * vienen de `settings.wholesale` en Supabase; estos son los mismos que siembra la
 * migración y solo se usan mientras cargan.
 */
export interface Tier {
  id: TierId;
  name: string;
  minPieces: number;
  discount: number;
  description: string;
}

export const TIERS: Tier[] = [
  { id: "menudeo", name: "Menudeo", minPieces: 1, discount: 0, description: "Precio de lista" },
  { id: "medio", name: "Medio mayoreo", minPieces: 6, discount: 0.12, description: "6 a 9 piezas surtidas" },
  { id: "mayoreo", name: "Mayoreo", minPieces: 10, discount: 0.22, description: "10 a 49 piezas surtidas (paquetes de 10, 20 y 30)" },
  { id: "distribuidor", name: "Distribuidor", minPieces: 50, discount: 0.28, description: "50+ piezas o clientes distribuidores desde 30" },
];

export let DISTRIBUTOR_CUSTOMER_MIN = 30;

export const tierById = (id: TierId) => TIERS.find((t) => t.id === id)!;

export function tierFor(pieces: number, customerType?: CustomerType): Tier {
  if (customerType === "distribuidor" && pieces >= DISTRIBUTOR_CUSTOMER_MIN) {
    return tierById("distribuidor");
  }
  let current = TIERS[0];
  for (const t of TIERS) if (pieces >= t.minPieces) current = t;
  return current;
}

/** Next tier the customer could reach and how many pieces they're missing. */
export function nextTier(pieces: number, customerType?: CustomerType) {
  const current = tierFor(pieces, customerType);
  const idx = TIERS.findIndex((t) => t.id === current.id);
  const next = TIERS[idx + 1];
  if (!next) return null;
  const min =
    next.id === "distribuidor" && customerType === "distribuidor"
      ? DISTRIBUTOR_CUSTOMER_MIN
      : next.minPieces;
  return { tier: next, missing: Math.max(0, min - pieces) };
}

/** Wholesale unit price rounded to the nearest $5 for clean price lists. */
export const tierPrice = (listPrice: number, tier: Tier) =>
  Math.round((listPrice * (1 - tier.discount)) / 5) * 5;

const mxn0 = (n: number) => `$${n.toLocaleString("es-MX")}`;

function conditions(t: { depositPct: number; freeShippingFrom: number; flatShipping: number; validityDays: number }) {
  return [
    "Precios en MXN, sujetos a disponibilidad de inventario.",
    `Se aparta con ${Math.round(t.depositPct * 100)}% de anticipo; el resto se liquida antes del envío.`,
    `Envío gratis en pedidos mayoristas desde ${mxn0(t.freeShippingFrom)}; si no, tarifa fija de ${mxn0(t.flatShipping)} por paquete.`,
    "Se pueden mezclar modelos, colores y tallas para alcanzar el nivel de precio.",
    "Cambios únicamente por defecto de fábrica dentro de los 5 días posteriores a la entrega.",
    `Vigencia de la cotización: ${t.validityDays} días naturales.`,
  ];
}

export const WHOLESALE_TERMS = {
  depositPct: 0.5,
  freeShippingFrom: 15000,
  flatShipping: 280,
  validityDays: 7,
  conditions: conditions({ depositPct: 0.5, freeShippingFrom: 15000, flatShipping: 280, validityDays: 7 }),
  bank: { bank: "", holder: "Luiggi Boutique", clabe: "" },
};

/** Forma de `settings.wholesale` en Supabase. */
export interface WholesaleSettings {
  tiers: Tier[];
  distributorCustomerMin: number;
  depositPct: number;
  freeShippingFrom: number;
  flatShipping: number;
  validityDays: number;
  bank: { bank: string; holder: string; clabe: string };
}

/** Copia de la configuración vigente, con la forma en que se guarda en `settings.wholesale`. */
export const wholesaleSnapshot = (): WholesaleSettings => ({
  tiers: TIERS.map((t) => ({ ...t })),
  distributorCustomerMin: DISTRIBUTOR_CUSTOMER_MIN,
  depositPct: WHOLESALE_TERMS.depositPct,
  freeShippingFrom: WHOLESALE_TERMS.freeShippingFrom,
  flatShipping: WHOLESALE_TERMS.flatShipping,
  validityDays: WHOLESALE_TERMS.validityDays,
  bank: { ...WHOLESALE_TERMS.bank },
});

/** Aplica la configuración guardada; se llama al cargar los datos, antes del primer render. */
export function applyWholesaleSettings(s: WholesaleSettings) {
  if (s.tiers?.length) TIERS.splice(0, TIERS.length, ...[...s.tiers].sort((a, b) => a.minPieces - b.minPieces));
  DISTRIBUTOR_CUSTOMER_MIN = s.distributorCustomerMin ?? DISTRIBUTOR_CUSTOMER_MIN;
  Object.assign(WHOLESALE_TERMS, {
    depositPct: s.depositPct,
    freeShippingFrom: s.freeShippingFrom,
    flatShipping: s.flatShipping,
    validityDays: s.validityDays,
    bank: { ...WHOLESALE_TERMS.bank, ...s.bank },
  });
  WHOLESALE_TERMS.conditions = conditions(WHOLESALE_TERMS);
}

export const shippingFor = (subtotal: number) =>
  subtotal >= WHOLESALE_TERMS.freeShippingFrom || subtotal === 0
    ? 0
    : WHOLESALE_TERMS.flatShipping;

/** Size curve used to split wholesale packages. */
const TOP_CURVE: Record<string, number> = { S: 0.15, M: 0.35, L: 0.35, XL: 0.15, XXL: 0 };
const BOTTOM_CURVE: Record<string, number> = { "28": 0.1, "30": 0.25, "32": 0.3, "34": 0.25, "36": 0.1 };

export function sizeCurve(sizes: string[]): Record<string, number> {
  const base = sizes.map((s) => TOP_CURVE[s] ?? BOTTOM_CURVE[s] ?? 1);
  const total = base.reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(sizes.map((s, i) => [s, base[i] / total]));
}

/** Largest-remainder split of `qty` across sizes following the curve. */
export function distributeBySize(sizes: string[], qty: number) {
  const curve = sizeCurve(sizes);
  const raw = sizes.map((s) => ({ s, v: curve[s] * qty }));
  const out: Record<string, number> = Object.fromEntries(
    raw.map((r) => [r.s, Math.floor(r.v)]),
  );
  let left = qty - Object.values(out).reduce((a, b) => a + b, 0);
  const byRemainder = [...raw].sort(
    (a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)),
  );
  for (let i = 0; left > 0; i = (i + 1) % byRemainder.length, left--) {
    out[byRemainder[i].s] += 1;
  }
  return out;
}

export interface WholesalePackage {
  id: string;
  name: string;
  pieces: number;
  description: string;
  mix: { category: Category; qty: number }[];
}

export const PACKAGES: WholesalePackage[] = [
  {
    id: "arranque",
    name: "Paquete Arranque",
    pieces: 12,
    description: "Para quien empieza a revender: polos y camisas, curva de tallas completa.",
    mix: [
      { category: "Polos", qty: 6 },
      { category: "Camisas manga larga", qty: 6 },
    ],
  },
  {
    id: "boutique",
    name: "Paquete Boutique",
    pieces: 24,
    description: "Surtido para aparador: polos, camisas y pantalones.",
    mix: [
      { category: "Polos", qty: 8 },
      { category: "Camisas manga larga", qty: 8 },
      { category: "Pantalones", qty: 8 },
    ],
  },
  {
    id: "distribuidor",
    name: "Paquete Distribuidor",
    pieces: 50,
    description: "Volumen para tiendas establecidas, con precio de distribuidor.",
    mix: [
      { category: "Polos", qty: 15 },
      { category: "Camisas manga larga", qty: 10 },
      { category: "Camisas manga corta", qty: 10 },
      { category: "Jeans", qty: 10 },
      { category: "Playeras", qty: 5 },
    ],
  },
];

const split = (qty: number, parts: number) =>
  Array.from({ length: parts }, (_, i) =>
    Math.floor(qty / parts) + (i < qty % parts ? 1 : 0),
  );

/**
 * Expands a package into concrete variant quantities using the models with the
 * most available stock in `branch`, splitting by color and size curve.
 */
export function expandPackage(
  pkg: WholesalePackage,
  products: Product[],
  stock: StockMap,
  branch: BranchId,
): { lines: Record<string, number>; shortfall: number } {
  const lines: Record<string, number> = {};
  let shortfall = 0;
  const avail = (key: string) => (stock[key]?.[branch] ?? 0) - (lines[key] ?? 0);

  for (const mix of pkg.mix) {
    const candidates = products
      .filter((p) => p.active && p.category === mix.category)
      .map((p) => ({
        p,
        total: p.colors.reduce(
          (a, c) => a + p.sizes.reduce((b, s) => b + (stock[variantKey(p.id, c.name, s)]?.[branch] ?? 0), 0),
          0,
        ),
      }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total)
      // Pocos modelos y colores por categoría para que la corrida S–XL quede completa
      .slice(0, mix.qty >= 12 ? 2 : 1);

    if (candidates.length === 0) {
      shortfall += mix.qty;
      continue;
    }

    const perModel = split(mix.qty, candidates.length);
    candidates.forEach(({ p }, mi) => {
      const colors = [...p.colors]
        .map((c) => ({
          c,
          total: p.sizes.reduce((b, s) => b + avail(variantKey(p.id, c.name, s)), 0),
        }))
        .filter((c) => c.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, perModel[mi] >= 12 ? 2 : 1);
      if (colors.length === 0) {
        shortfall += perModel[mi];
        return;
      }
      const perColor = split(perModel[mi], colors.length);
      colors.forEach(({ c }, ci) => {
        const bySize = distributeBySize(p.sizes, perColor[ci]);
        for (const size of p.sizes) {
          const key = variantKey(p.id, c.name, size);
          const want = bySize[size];
          const take = Math.min(want, Math.max(0, avail(key)));
          if (take > 0) lines[key] = (lines[key] ?? 0) + take;
          shortfall += want - take;
        }
      });
    });
  }

  return { lines, shortfall };
}
