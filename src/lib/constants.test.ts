import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP_NAME,
  CHANNELS,
  CHANNEL_COLOR,
  CHANNEL_LABEL,
  CUSTOMER_TYPE_LABEL,
  EXPENSE_LABEL,
  PAYMENT_LABEL,
  QUOTE_STATUS_LABEL,
  STATUS_LABEL,
  STATUS_SHORT,
} from "./constants";
import type {
  Channel,
  CustomerType,
  ExpenseCategory,
  OrderStatus,
  PaymentMethod,
  QuoteStatus,
} from "./types";

// Cada Record<…, true> obliga (en tsc) a listar todos los valores del tipo: si types.ts agrega
// uno nuevo, esta prueba deja de compilar hasta que se incluya aquí y en constants.ts.
const channels: Record<Channel, true> = { tienda: true, web: true, whatsapp: true, instagram: true, mayoreo: true };
const orderStatuses: Record<OrderStatus, true> = {
  pendiente: true,
  apartado: true,
  pagado: true,
  enviado: true,
  entregado: true,
  cancelado: true,
};
const quoteStatuses: Record<QuoteStatus, true> = {
  borrador: true,
  enviada: true,
  aceptada: true,
  convertida: true,
  rechazada: true,
};
const paymentMethods: Record<PaymentMethod, true> = {
  efectivo: true,
  transferencia: true,
  tarjeta: true,
  mercadopago: true,
  paypal: true,
};
const expenseCategories: Record<ExpenseCategory, true> = {
  renta: true,
  nomina: true,
  publicidad: true,
  envios: true,
  servicios: true,
  empaque: true,
  software: true,
  otros: true,
};
const customerTypes: Record<CustomerType, true> = { menudeo: true, mayorista: true, distribuidor: true };

const keys = <T extends string>(r: Record<T, true>) => Object.keys(r) as T[];

const tablas: [string, Record<string, string>, string[]][] = [
  ["CHANNEL_LABEL", CHANNEL_LABEL, keys(channels)],
  ["CHANNEL_COLOR", CHANNEL_COLOR, keys(channels)],
  ["STATUS_LABEL", STATUS_LABEL, keys(orderStatuses)],
  ["STATUS_SHORT", STATUS_SHORT, keys(orderStatuses)],
  ["QUOTE_STATUS_LABEL", QUOTE_STATUS_LABEL, keys(quoteStatuses)],
  ["PAYMENT_LABEL", PAYMENT_LABEL, keys(paymentMethods)],
  ["EXPENSE_LABEL", EXPENSE_LABEL, keys(expenseCategories)],
  ["CUSTOMER_TYPE_LABEL", CUSTOMER_TYPE_LABEL, keys(customerTypes)],
];

describe("constants", () => {
  it("APP_NAME es el nombre del producto, no el de un negocio", () => {
    expect(APP_NAME).toBe("Boutique ERP");
  });

  describe("CHANNELS", () => {
    it("contiene los 5 canales, sin repetidos", () => {
      expect(CHANNELS).toHaveLength(5);
      expect(new Set(CHANNELS)).toEqual(new Set(["tienda", "web", "instagram", "whatsapp", "mayoreo"]));
    });

    it("mantiene el orden de la paleta categórica", () => {
      expect(CHANNELS).toEqual(["tienda", "web", "instagram", "whatsapp", "mayoreo"]);
    });

    it("coincide con los valores del tipo Channel", () => {
      expect([...CHANNELS].sort()).toEqual(keys(channels).sort());
    });
  });

  describe.each(tablas)("%s", (_nombre, tabla, valores) => {
    it("tiene exactamente una entrada por valor del tipo", () => {
      expect(Object.keys(tabla).sort()).toEqual([...valores].sort());
    });

    it.each(valores)("«%s» tiene etiqueta no vacía", (valor) => {
      expect(typeof tabla[valor]).toBe("string");
      expect(tabla[valor].trim().length).toBeGreaterThan(0);
    });
  });

  it("las etiquetas de canal se distinguen entre sí", () => {
    const etiquetas = Object.values(CHANNEL_LABEL);
    expect(new Set(etiquetas).size).toBe(etiquetas.length);
  });

  it("CHANNEL_COLOR apunta a variables CSS --ch-<canal>", () => {
    for (const canal of CHANNELS) {
      expect(CHANNEL_COLOR[canal]).toBe(`var(--ch-${canal})`);
    }
  });

  describe("sin datos de un negocio en particular", () => {
    const prohibidas = /luiggi|andara|bamoa|guasave|sinaloa/i;
    const archivos = ["constants.ts", "settings.ts", "wholesale.ts"];

    it.each(archivos)("%s no menciona Luiggi, Andara, Bamoa, Guasave ni Sinaloa", (archivo) => {
      const texto = readFileSync(join(__dirname, archivo), "utf8");
      expect(texto.match(prohibidas)?.[0]).toBeUndefined();
    });
  });
});
