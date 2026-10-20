import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("une clases simples", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("ignora valores falsos", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("aplica clases condicionales", () => {
    expect(cn("base", { activo: true, inactivo: false })).toBe("base activo");
  });

  it("resuelve conflictos de Tailwind dejando la última clase", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
});

describe("zona horaria de las pruebas", () => {
  it("es America/Mexico_City", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(
      "America/Mexico_City",
    );
  });

  it("interpreta las fechas locales con el desfase de Ciudad de México", () => {
    // Desde 2022 México no tiene horario de verano: UTC-6 todo el año.
    expect(new Date("2026-01-15T12:00:00Z").getHours()).toBe(6);
    expect(new Date("2026-07-15T12:00:00Z").getHours()).toBe(6);
  });
});
