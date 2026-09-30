import type {
  Branch,
  BranchId,
  Channel,
  CustomerType,
  ExpenseCategory,
  OrderStatus,
  PaymentMethod,
  QuoteStatus,
} from "./types";

export const BUSINESS = {
  name: "Luiggi Boutique",
  legalName: "Clothing Luiggi",
  instagram: "@clothingluiggi",
  web: "luiggiboutique.com",
  phone: "687 857 6673",
  email: "luiggiboutique@gmail.com",
  city: "Guasave, Sinaloa",
};

export const BRANCHES: Branch[] = [
  {
    id: "andara",
    name: "Sucursal Plaza Andara",
    short: "Andara",
    address: "Plaza Andara, Guasave, Sin.",
  },
  {
    id: "bamoa",
    name: "Sucursal Bamoa",
    short: "Bamoa",
    address: "Estación Bamoa, Guasave, Sin.",
  },
  {
    id: "bodega",
    name: "Bodega / E-commerce",
    short: "Bodega",
    address: "Calle Benito Juárez, Guasave, Sin.",
  },
];

export const BRANCH_IDS: BranchId[] = ["andara", "bamoa", "bodega"];

export const branchName = (id: BranchId) =>
  BRANCHES.find((b) => b.id === id)?.short ?? id;

/** Fixed order — matches the validated categorical palette in globals.css. */
export const CHANNELS: Channel[] = ["tienda", "web", "instagram", "whatsapp", "mayoreo"];

export const CHANNEL_LABEL: Record<Channel, string> = {
  tienda: "Tienda física",
  web: "Página web",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  mayoreo: "Mayoreo",
};

/** CSS variable names defined in globals.css */
export const CHANNEL_COLOR: Record<Channel, string> = {
  tienda: "var(--ch-tienda)",
  web: "var(--ch-web)",
  whatsapp: "var(--ch-whatsapp)",
  instagram: "var(--ch-instagram)",
  mayoreo: "var(--ch-mayoreo)",
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pendiente: "Pendiente de pago",
  apartado: "Apartado (anticipo)",
  pagado: "Pagado · por enviar",
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export const STATUS_SHORT: Record<OrderStatus, string> = {
  pendiente: "Pendiente",
  apartado: "Apartado",
  pagado: "Pagado",
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  aceptada: "Aceptada",
  convertida: "Convertida en pedido",
  rechazada: "Rechazada",
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia / SPEI",
  tarjeta: "Tarjeta (terminal)",
  mercadopago: "Mercado Pago",
  paypal: "PayPal",
};

/** Approximate processor fees (incl. IVA) used to estimate real profit. */
export const PAYMENT_FEE: Record<PaymentMethod, number> = {
  efectivo: 0,
  transferencia: 0,
  tarjeta: 0.036,
  mercadopago: 0.0406,
  paypal: 0.0458,
};

export const EXPENSE_LABEL: Record<ExpenseCategory, string> = {
  renta: "Renta de locales",
  nomina: "Nómina",
  publicidad: "Publicidad (Meta / TikTok)",
  envios: "Guías y envíos",
  servicios: "Luz, agua e internet",
  empaque: "Empaque y bolsas",
  software: "Software y plataformas",
  otros: "Otros gastos",
};

export const CUSTOMER_TYPE_LABEL: Record<CustomerType, string> = {
  menudeo: "Menudeo",
  mayorista: "Mayorista",
  distribuidor: "Distribuidor",
};

export const CARRIERS = ["Estafeta", "FedEx", "DHL", "Paquetexpress", "J&T"];
