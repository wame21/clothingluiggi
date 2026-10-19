import type { BranchId, LineItem, Product, StockMap } from "./types";

/** Quantities keyed by variant key, as captured in the matrix editors. */
export type QtyMap = Record<string, number>;

export const qtyTotal = (q: QtyMap) => Object.values(q).reduce((a, b) => a + (b > 0 ? b : 0), 0);

/** Turns a quantity map into priced line items, ordered like the catalog. */
export function buildLineItems(q: QtyMap, products: Product[], unitPriceOf: (p: Product) => number): LineItem[] {
  const items: LineItem[] = [];
  for (const p of products)
    for (const c of p.colors)
      for (const size of p.sizes) {
        const key = `${p.id}|${c.name}|${size}`;
        const qty = q[key] ?? 0;
        if (qty > 0)
          items.push({
            productId: p.id,
            variantKey: key,
            name: p.name,
            color: c.name,
            size,
            qty,
            unitPrice: unitPriceOf(p),
            unitCost: p.cost,
            listPrice: p.price,
          });
      }
  return items;
}

export const variantKey = (productId: string, color: string, size: string) =>
  `${productId}|${color}|${size}`;

export const parseVariantKey = (key: string) => {
  const [productId, color, size] = key.split("|");
  return { productId, color, size };
};

export const stockOf = (stock: StockMap, key: string, branch?: BranchId) => {
  const s = stock[key];
  if (!s) return 0;
  return branch ? (s[branch] ?? 0) : Object.values(s).reduce((a, b) => a + b, 0);
};

export function productStock(p: Product, stock: StockMap, branch?: BranchId) {
  let total = 0;
  for (const c of p.colors)
    for (const s of p.sizes) total += stockOf(stock, variantKey(p.id, c.name, s), branch);
  return total;
}

export function productVariants(p: Product) {
  return p.colors.flatMap((c) =>
    p.sizes.map((s) => ({ key: variantKey(p.id, c.name, s), color: c, size: s })),
  );
}

export const uid = (prefix = "") =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
