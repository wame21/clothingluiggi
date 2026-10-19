import { currentCatalog } from "./settings";
import type {
  BranchId,
  CustomerType,
  Product,
  StockMap,
  TierId,
} from "./types";
import { variantKey } from "./variants";

/**
 * Esquema de mayoreo del negocio. El nivel se determina por el total de piezas del
 * pedido (se pueden mezclar modelos, colores y tallas). Los valores vienen de
 * `settings.wholesale` en Supabase; los de `DEFAULT_WHOLESALE` solo se usan mientras
 * cargan o si el negocio aún no guarda nada.
 */
export interface Tier {
  id: TierId;
  name: string;
  minPieces: number;
  discount: number;
  description: string;
}

export interface WholesalePackage {
  id: string;
  name: string;
  pieces: number;
  description: string;
  mix: { category: string; qty: number }[];
}

/** Forma de `settings.wholesale` en Supabase. */
export interface WholesaleSettings {
  enabled: boolean;
  tiers: Tier[];
  /** Piezas desde las que un cliente distribuidor recibe el último nivel; 0 = sin regla especial. */
  distributorCustomerMin: number;
  depositPct: number;
  /** 0 = sin envío gratis. */
  freeShippingFrom: number;
  flatShipping: number;
  validityDays: number;
  packages: WholesalePackage[];
  bank: { bank: string; holder: string; clabe: string };
}

export const DEFAULT_WHOLESALE: WholesaleSettings = {
  enabled: false,
  tiers: [{ id: "lista", name: "Precio de lista", minPieces: 1, discount: 0, description: "Precio de lista" }],
  distributorCustomerMin: 0,
  depositPct: 0,
  freeShippingFrom: 0,
  flatShipping: 0,
  validityDays: 7,
  packages: [],
  bank: { bank: "", holder: "", clabe: "" },
};

const clone = <T>(v: T): T => structuredClone(v);

/** Valor guardado en `settings.wholesale` + valores por defecto para lo que falte. */
export function wholesaleFrom(v: Partial<WholesaleSettings> | null | undefined): WholesaleSettings {
  const d = clone(DEFAULT_WHOLESALE);
  return {
    ...d,
    ...v,
    tiers: v?.tiers?.length ? v.tiers : d.tiers,
    packages: Array.isArray(v?.packages) ? v.packages : d.packages,
    bank: { ...d.bank, ...v?.bank },
  };
}

const mxn0 = (n: number) => `$${n.toLocaleString("es-MX")}`;

type Terms = Pick<WholesaleSettings, "depositPct" | "freeShippingFrom" | "flatShipping" | "validityDays">;

/** Condiciones para cotizaciones; omite las frases que no aplican (anticipo, envío o vigencia en 0). */
function conditions(t: Terms) {
  const out = ["Precios en MXN, sujetos a disponibilidad de inventario."];
  if (t.depositPct > 0)
    out.push(`Se aparta con ${Math.round(t.depositPct * 100)}% de anticipo; el resto se liquida antes del envío.`);
  if (t.flatShipping > 0)
    out.push(
      t.freeShippingFrom > 0
        ? `Envío gratis en pedidos mayoristas desde ${mxn0(t.freeShippingFrom)}; si no, tarifa fija de ${mxn0(t.flatShipping)} por paquete.`
        : `Envío con tarifa fija de ${mxn0(t.flatShipping)} por paquete.`,
    );
  out.push("Se pueden mezclar modelos, colores y tallas para alcanzar el nivel de precio.");
  if (t.validityDays > 0) out.push(`Vigencia de la cotización: ${t.validityDays} días naturales.`);
  return out;
}

/* ------------------------------------------------------------------ */
/* Configuración vigente fuera de React                                 */
/* ------------------------------------------------------------------ */
// Estado de módulo aplicado por el store al cargar y al guardar, para que los helpers
// que no son hooks (tierFor, shippingFor, expandPackage…) lean siempre lo vigente.
let enabled = DEFAULT_WHOLESALE.enabled;

export const TIERS: Tier[] = clone(DEFAULT_WHOLESALE.tiers);

export let DISTRIBUTOR_CUSTOMER_MIN = DEFAULT_WHOLESALE.distributorCustomerMin;

export const PACKAGES: WholesalePackage[] = [];

export const WHOLESALE_TERMS = {
  depositPct: DEFAULT_WHOLESALE.depositPct,
  freeShippingFrom: DEFAULT_WHOLESALE.freeShippingFrom,
  flatShipping: DEFAULT_WHOLESALE.flatShipping,
  validityDays: DEFAULT_WHOLESALE.validityDays,
  conditions: conditions(DEFAULT_WHOLESALE),
  bank: { ...DEFAULT_WHOLESALE.bank },
};

export const isWholesaleEnabled = () => enabled;

/** Copia de la configuración vigente, con la forma en que se guarda en `settings.wholesale`. */
export const wholesaleSnapshot = (): WholesaleSettings => ({
  enabled,
  tiers: TIERS.map((t) => ({ ...t })),
  distributorCustomerMin: DISTRIBUTOR_CUSTOMER_MIN,
  depositPct: WHOLESALE_TERMS.depositPct,
  freeShippingFrom: WHOLESALE_TERMS.freeShippingFrom,
  flatShipping: WHOLESALE_TERMS.flatShipping,
  validityDays: WHOLESALE_TERMS.validityDays,
  packages: clone(PACKAGES),
  bank: { ...WHOLESALE_TERMS.bank },
});

/** Aplica la configuración guardada; se llama al cargar los datos, antes del primer render. */
export function applyWholesaleSettings(s: WholesaleSettings) {
  const next = wholesaleFrom(s);
  enabled = next.enabled;
  TIERS.splice(0, TIERS.length, ...[...next.tiers].sort((a, b) => a.minPieces - b.minPieces));
  DISTRIBUTOR_CUSTOMER_MIN = next.distributorCustomerMin;
  PACKAGES.splice(0, PACKAGES.length, ...next.packages);
  Object.assign(WHOLESALE_TERMS, {
    depositPct: next.depositPct,
    freeShippingFrom: next.freeShippingFrom,
    flatShipping: next.flatShipping,
    validityDays: next.validityDays,
    bank: next.bank,
  });
  WHOLESALE_TERMS.conditions = conditions(WHOLESALE_TERMS);
}

/* ------------------------------------------------------------------ */
/* Niveles y precios                                                    */
/* ------------------------------------------------------------------ */
export const tierById = (id: TierId) => TIERS.find((t) => t.id === id) ?? TIERS[0];

/** El cliente distribuidor con suficientes piezas recibe el último nivel (el de mayor descuento). */
const distributorRule = (pieces: number, customerType?: CustomerType) =>
  DISTRIBUTOR_CUSTOMER_MIN > 0 && customerType === "distribuidor" && pieces >= DISTRIBUTOR_CUSTOMER_MIN;

export function tierFor(pieces: number, customerType?: CustomerType): Tier {
  if (distributorRule(pieces, customerType)) return TIERS[TIERS.length - 1];
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
    idx + 1 === TIERS.length - 1 && DISTRIBUTOR_CUSTOMER_MIN > 0 && customerType === "distribuidor"
      ? Math.min(next.minPieces, DISTRIBUTOR_CUSTOMER_MIN)
      : next.minPieces;
  return { tier: next, missing: Math.max(0, min - pieces) };
}

/** Wholesale unit price rounded to the nearest $5 for clean price lists. */
export const tierPrice = (listPrice: number, tier: Tier) =>
  Math.round((listPrice * (1 - tier.discount)) / 5) * 5;

/** Envío de un pedido mayorista: sin tarifa o sobre el mínimo de envío gratis, no se cobra. */
export const shippingFor = (subtotal: number) =>
  subtotal === 0 ||
  WHOLESALE_TERMS.flatShipping === 0 ||
  (WHOLESALE_TERMS.freeShippingFrom > 0 && subtotal >= WHOLESALE_TERMS.freeShippingFrom)
    ? 0
    : WHOLESALE_TERMS.flatShipping;

/* ------------------------------------------------------------------ */
/* Paquetes y curva de tallas                                           */
/* ------------------------------------------------------------------ */
/**
 * Proporción de cada talla según `catalog.sizeCurve`. Las tallas que la curva no
 * menciona toman el peso promedio de las que sí; sin curva el reparto es parejo.
 */
export function sizeCurve(sizes: string[]): Record<string, number> {
  const curve = currentCatalog().sizeCurve;
  const weight = (s: string) => (typeof curve[s] === "number" && curve[s] >= 0 ? curve[s] : undefined);
  const known = sizes.map(weight).filter((w): w is number => w !== undefined);
  const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const base = sizes.map((s) => weight(s) ?? fallback);
  const total = base.reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(sizes.map((s, i) => [s, base[i] / total]));
}

/** Largest-remainder split of `qty` across sizes following the curve. */
export function distributeBySize(sizes: string[], qty: number) {
  if (sizes.length === 0) return {};
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
      // Pocos modelos y colores por categoría para que la corrida de tallas quede completa
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
