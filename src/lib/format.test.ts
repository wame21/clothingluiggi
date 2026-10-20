import { afterEach, describe, expect, it, vi } from "vitest";
import { fDate, fDateTime, fDay, fLongDate, fRelative, mxn, mxnCents, mxnShort, num, pct } from "./format";

afterEach(() => {
  vi.useRealTimers();
});

describe("zona horaria de las pruebas", () => {
  it("corre en America/Mexico_City (UTC−6, sin horario de verano)", () => {
    expect(new Date("2026-07-01T12:00:00Z").getTimezoneOffset()).toBe(360);
    expect(new Date("2026-01-01T12:00:00Z").getTimezoneOffset()).toBe(360);
  });
});

describe("mxn", () => {
  it("formatea pesos sin centavos", () => {
    expect(mxn(0)).toBe("$0");
    expect(mxn(1234)).toBe("$1,234");
    expect(mxn(1234567)).toBe("$1,234,567");
  });

  it("redondea a pesos", () => {
    expect(mxn(99.4)).toBe("$99");
    expect(mxn(99.5)).toBe("$100");
    expect(mxn(1234.99)).toBe("$1,235");
  });

  it("negativos llevan el signo", () => {
    expect(mxn(-1500)).toBe("-$1,500");
  });

  it("un negativo que redondea a cero no muestra «-$0»", () => {
    expect(mxn(-0.4)).toBe("$0");
  });
});

describe("mxnCents", () => {
  it("siempre muestra 2 decimales", () => {
    expect(mxnCents(0)).toBe("$0.00");
    expect(mxnCents(1234.5)).toBe("$1,234.50");
    expect(mxnCents(99)).toBe("$99.00");
  });

  it("redondea a centavos", () => {
    expect(mxnCents(10.126)).toBe("$10.13");
    expect(mxnCents(10.124)).toBe("$10.12");
  });

  it("negativos llevan el signo", () => {
    expect(mxnCents(-45.5)).toBe("-$45.50");
  });
});

describe("num", () => {
  it("separa miles sin decimales", () => {
    expect(num(0)).toBe("0");
    expect(num(999)).toBe("999");
    expect(num(1234567)).toBe("1,234,567");
  });

  it("redondea a entero", () => {
    expect(num(12.4)).toBe("12");
    expect(num(12.6)).toBe("13");
  });

  it("negativos", () => {
    expect(num(-2500)).toBe("-2,500");
  });
});

describe("pct", () => {
  it("convierte fracción a porcentaje con 1 dígito por defecto", () => {
    expect(pct(0.1234)).toBe("12.3%");
    expect(pct(0.5)).toBe("50.0%");
    expect(pct(1)).toBe("100.0%");
    expect(pct(0)).toBe("0.0%");
  });

  it("respeta el número de dígitos", () => {
    expect(pct(0.1234, 0)).toBe("12%");
    expect(pct(0.1234, 2)).toBe("12.34%");
    expect(pct(0.036, 1)).toBe("3.6%");
  });

  it("valores mayores a 100% y negativos", () => {
    expect(pct(1.5)).toBe("150.0%");
    expect(pct(-0.05)).toBe("-5.0%");
  });

  it("NaN e Infinity se muestran como 0", () => {
    expect(pct(NaN)).toBe("0.0%");
    expect(pct(Infinity)).toBe("0.0%");
    expect(pct(-Infinity, 0)).toBe("0%");
  });
});

describe("mxnShort", () => {
  it("menos de mil: pesos redondeados", () => {
    expect(mxnShort(0)).toBe("$0");
    expect(mxnShort(7)).toBe("$7");
    expect(mxnShort(999)).toBe("$999");
    expect(mxnShort(12.6)).toBe("$13");
  });

  it("desde mil: miles con «k»", () => {
    expect(mxnShort(1000)).toBe("$1k");
    expect(mxnShort(1499)).toBe("$1k");
    expect(mxnShort(1500)).toBe("$2k");
    expect(mxnShort(12000)).toBe("$12k");
    expect(mxnShort(999_400)).toBe("$999k");
  });

  it("desde un millón: millones con 1 decimal y «M»", () => {
    expect(mxnShort(1_000_000)).toBe("$1.0M");
    expect(mxnShort(1_200_000)).toBe("$1.2M");
    expect(mxnShort(15_500_000)).toBe("$15.5M");
  });

  it("-0 y negativos pequeños no muestran signo", () => {
    expect(mxnShort(-0)).toBe("$0");
    expect(mxnShort(-0.4)).toBe("$0");
  });

  it("negativos usan los mismos umbrales (por valor absoluto)", () => {
    expect(mxnShort(-999)).toContain("999");
    expect(mxnShort(-1_200_000)).toContain("1.2M");
    expect(mxnShort(-5000)).toContain("5k");
  });

  it("los negativos llevan el signo antes del símbolo, como mxn()", () => {
    expect(mxnShort(-5000)).toBe("-$5k");
    expect(mxnShort(-1_200_000)).toBe("-$1.2M");
    expect(mxnShort(-999)).toBe("-$999");
  });

  it("justo debajo de un millón no se muestra como «$1000k»", () => {
    expect(mxnShort(999_999)).toBe("$1.0M");
  });
});

describe("fechas (America/Mexico_City)", () => {
  // 2026-03-15T18:30:00Z = 12:30 del 15 de marzo en la Ciudad de México.
  const MEDIODIA = "2026-03-15T18:30:00Z";
  // 2026-03-16T05:30:00Z = 23:30 del 15 de marzo local, aunque en UTC ya es día 16.
  const CASI_MEDIANOCHE = "2026-03-16T05:30:00Z";
  // 2026-03-16T06:00:00Z = 00:00 exactas del 16 local.
  const MEDIANOCHE_LOCAL = "2026-03-16T06:00:00Z";
  // 2026-01-01T05:59:00Z = 31 de diciembre de 2025, 23:59 local.
  const FIN_DE_ANIO = "2026-01-01T05:59:00Z";

  describe("fDate", () => {
    it("día, mes abreviado en español y año", () => {
      expect(fDate(MEDIODIA)).toBe("15 mar 2026");
      expect(fDate("2026-12-01T18:00:00Z")).toBe("1 dic 2026");
    });

    it("usa la fecha local, no la UTC, cerca de medianoche", () => {
      expect(fDate(CASI_MEDIANOCHE)).toBe("15 mar 2026");
      expect(fDate(MEDIANOCHE_LOCAL)).toBe("16 mar 2026");
    });

    it("el cambio de año también se resuelve en hora local", () => {
      expect(fDate(FIN_DE_ANIO)).toBe("31 dic 2025");
    });
  });

  describe("fDateTime", () => {
    it("incluye la hora local de 24 horas", () => {
      expect(fDateTime(MEDIODIA)).toBe("15 mar 2026 · 12:30");
      expect(fDateTime(CASI_MEDIANOCHE)).toBe("15 mar 2026 · 23:30");
      expect(fDateTime(MEDIANOCHE_LOCAL)).toBe("16 mar 2026 · 00:00");
      expect(fDateTime(FIN_DE_ANIO)).toBe("31 dic 2025 · 23:59");
    });

    it("acepta ISO con offset explícito", () => {
      expect(fDateTime("2026-03-15T12:30:00-06:00")).toBe("15 mar 2026 · 12:30");
    });
  });

  describe("fDay", () => {
    it("día y mes sin año", () => {
      expect(fDay(MEDIODIA)).toBe("15 mar");
      expect(fDay(CASI_MEDIANOCHE)).toBe("15 mar");
    });

    it("sirve para las etiquetas de gráficas (fecha local a mediodía)", () => {
      expect(fDay("2026-03-15T12:00:00")).toBe("15 mar");
    });
  });

  describe("fLongDate", () => {
    it("fecha larga en español", () => {
      expect(fLongDate(MEDIODIA)).toBe("15 de marzo de 2026");
      expect(fLongDate("2026-09-04T18:00:00Z")).toBe("4 de septiembre de 2026");
    });

    it("usa la fecha local cerca de medianoche", () => {
      expect(fLongDate(CASI_MEDIANOCHE)).toBe("15 de marzo de 2026");
      expect(fLongDate(FIN_DE_ANIO)).toBe("31 de diciembre de 2025");
    });
  });

  describe("fRelative", () => {
    const AHORA = "2026-06-15T18:00:00Z";

    const relativo = (iso: string) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(AHORA));
      return fRelative(iso);
    };

    it("pasado: «hace …» en español", () => {
      expect(relativo("2026-06-15T15:00:00Z")).toBe("hace 3 horas");
      expect(relativo("2026-06-15T17:55:00Z")).toBe("hace 5 minutos");
      expect(relativo("2026-06-13T18:00:00Z")).toBe("hace 2 días");
      expect(relativo("2026-06-14T18:00:00Z")).toBe("hace 1 día");
    });

    it("futuro: «en …»", () => {
      expect(relativo("2026-06-15T20:00:00Z")).toBe("en 2 horas");
      expect(relativo("2026-06-18T18:00:00Z")).toBe("en 3 días");
    });

    it("meses y años", () => {
      expect(relativo("2026-03-15T18:00:00Z")).toBe("hace 3 meses");
      expect(relativo("2024-06-15T18:00:00Z")).toBe("hace 2 años");
    });

    it("sigue el reloj: avanzar el tiempo cambia el resultado", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(AHORA));
      const iso = "2026-06-15T17:00:00Z";
      expect(fRelative(iso)).toBe("hace 1 hora");
      vi.setSystemTime(new Date("2026-06-15T20:00:00Z"));
      expect(fRelative(iso)).toBe("hace 3 horas");
    });
  });
});
