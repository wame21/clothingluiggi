import type { Channel, PaymentMethod } from "./types";

/** Datos del negocio para tickets, cotizaciones y la marca (`settings.profile`). */
export interface BusinessProfile {
  legalName: string;
  phone: string;
  email: string;
  instagram: string;
  web: string;
  city: string;
  address: string;
  ticketFooter: string;
  logoUrl: string | null;
  accentColor: string | null;
}

export interface SizePreset {
  name: string;
  sizes: string[];
}

/** `settings.catalog`: categorías, tallas y curva de reparto por talla (vacía = parejo). */
export interface CatalogSettings {
  categories: string[];
  sizePresets: SizePreset[];
  sizeCurve: Record<string, number>;
}

/** `settings.sales`: canales activos, paqueterías y comisiones por forma de pago. */
export interface SalesSettings {
  channels: Channel[];
  carriers: string[];
  paymentFees: Record<PaymentMethod, number>;
}

export const DEFAULT_PROFILE: BusinessProfile = {
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
};

export const DEFAULT_CATALOG: CatalogSettings = {
  categories: [
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
  ],
  sizePresets: [
    { name: "Ropa S–XL", sizes: ["S", "M", "L", "XL"] },
    { name: "Ropa XS–XXL", sizes: ["XS", "S", "M", "L", "XL", "XXL"] },
    { name: "Pantalón 28–36", sizes: ["28", "30", "32", "34", "36"] },
    { name: "Unitalla", sizes: ["Única"] },
  ],
  sizeCurve: {},
};

export const DEFAULT_SALES: SalesSettings = {
  channels: ["tienda", "web", "instagram", "whatsapp"],
  carriers: ["Estafeta", "FedEx", "DHL", "Paquetexpress", "J&T"],
  paymentFees: { efectivo: 0, transferencia: 0, tarjeta: 0.036, mercadopago: 0.0406, paypal: 0.0458 },
};

const clone = <T>(v: T): T => structuredClone(v);

type Json = Record<string, unknown> | null | undefined;

/** Valor guardado en `settings` + valores por defecto para lo que falte. */
export const profileFrom = (v: Json): BusinessProfile => ({ ...clone(DEFAULT_PROFILE), ...(v as Partial<BusinessProfile>) });

export const catalogFrom = (v: Json): CatalogSettings => {
  const s = (v ?? {}) as Partial<CatalogSettings>;
  const d = clone(DEFAULT_CATALOG);
  return {
    categories: Array.isArray(s.categories) ? s.categories : d.categories,
    sizePresets: Array.isArray(s.sizePresets) ? s.sizePresets : d.sizePresets,
    sizeCurve: s.sizeCurve && typeof s.sizeCurve === "object" && !Array.isArray(s.sizeCurve) ? s.sizeCurve : d.sizeCurve,
  };
};

export const salesFrom = (v: Json): SalesSettings => {
  const s = (v ?? {}) as Partial<SalesSettings>;
  const d = clone(DEFAULT_SALES);
  return {
    channels: Array.isArray(s.channels) ? s.channels : d.channels,
    carriers: Array.isArray(s.carriers) ? s.carriers : d.carriers,
    paymentFees: { ...d.paymentFees, ...s.paymentFees },
  };
};

/* ------------------------------------------------------------------ */
/* Configuración vigente fuera de React                                 */
/* ------------------------------------------------------------------ */
// Mismo patrón que `wholesale.ts`: el store la aplica al cargar y al guardar para que los
// helpers que no son hooks (comisiones, curva de tallas) lean siempre lo vigente.
let catalog = catalogFrom(undefined);
let sales = salesFrom(undefined);

export const applyCatalogSettings = (c: CatalogSettings) => {
  catalog = c;
};

export const applySalesSettings = (s: SalesSettings) => {
  sales = s;
};

export const currentCatalog = () => catalog;
export const currentSales = () => sales;

/** Comisión del procesador de pago (incluye IVA) usada para estimar la utilidad real. */
export const paymentFee = (method: PaymentMethod) => sales.paymentFees[method] ?? 0;
