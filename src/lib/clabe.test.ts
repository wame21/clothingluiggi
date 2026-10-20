import { describe, expect, it } from "vitest";
import { bankFromClabe, clabeError, formatClabe, onlyDigits } from "./clabe";

/** Implementación independiente del dígito verificador (pesos 3-7-1, módulo 10) para armar CLABE válidas. */
const conVerificador = (first17: string) => {
  const pesos = [3, 7, 1];
  let suma = 0;
  for (let i = 0; i < 17; i++) suma += (Number(first17[i]) * pesos[i % 3]) % 10;
  return `${first17}${(10 - (suma % 10)) % 10}`;
};

const VALIDA = conVerificador("01218000123456789");

describe("onlyDigits", () => {
  it("quita espacios, guiones y letras", () => {
    expect(onlyDigits("012 180-0012 abc 34")).toBe("012180001234");
  });

  it("cadena vacía o sin dígitos → ''", () => {
    expect(onlyDigits("")).toBe("");
    expect(onlyDigits("abc - ·")).toBe("");
  });

  it("deja intactos los dígitos", () => {
    expect(onlyDigits("0123456789")).toBe("0123456789");
  });
});

describe("clabeError", () => {
  it("una CLABE vacía es válida (sin datos de depósito)", () => {
    expect(clabeError("")).toBeNull();
    expect(clabeError("   ")).toBeNull();
  });

  it("una entrada sin dígitos cuenta como vacía", () => {
    expect(clabeError("abc")).toBeNull();
  });

  it("longitud distinta de 18 → error con la cuenta de dígitos", () => {
    expect(clabeError("0121800012345678")).toBe("La CLABE lleva 18 dígitos (llevas 16)");
    expect(clabeError(`${VALIDA}1`)).toBe("La CLABE lleva 18 dígitos (llevas 19)");
    expect(clabeError("1")).toBe("La CLABE lleva 18 dígitos (llevas 1)");
  });

  it("las letras no cuentan como dígitos", () => {
    expect(clabeError(`${VALIDA}ABC`)).toBeNull();
    expect(clabeError(`ABC${VALIDA.slice(0, 16)}`)).toBe("La CLABE lleva 18 dígitos (llevas 16)");
  });

  it("dígito verificador incorrecto → error", () => {
    const malo = (Number(VALIDA[17]) + 1) % 10;
    expect(clabeError(`${VALIDA.slice(0, 17)}${malo}`)).toBe(
      "El dígito verificador no coincide; revisa que esté bien capturada",
    );
  });

  it("cambiar cualquier dígito de la cuenta rompe el verificador", () => {
    for (let i = 0; i < 17; i++) {
      const cambiado = VALIDA.slice(0, i) + ((Number(VALIDA[i]) + 1) % 10) + VALIDA.slice(i + 1);
      expect(clabeError(cambiado), `posición ${i}`).not.toBeNull();
    }
  });

  it("CLABE válida → null", () => {
    expect(clabeError(VALIDA)).toBeNull();
  });

  it("acepta espacios y guiones en una CLABE válida", () => {
    expect(clabeError(formatClabe(VALIDA))).toBeNull();
    expect(clabeError(`${VALIDA.slice(0, 3)}-${VALIDA.slice(3, 6)}-${VALIDA.slice(6)}`)).toBeNull();
  });

  it("valida varios bancos con verificador calculado", () => {
    for (const banco of ["002", "012", "014", "072", "638", "722"]) {
      expect(clabeError(conVerificador(`${banco}18000123456789`)), banco).toBeNull();
    }
  });

  it("valida CLABE de ejemplo conocidas", () => {
    expect(clabeError("002010077777777771")).toBeNull();
    expect(clabeError("032180000118359719")).toBeNull();
  });

  it("verificador 0 (suma múltiplo de 10) es válido", () => {
    const cuentas = Array.from({ length: 50 }, (_, n) => conVerificador(String(n).padStart(17, "0")));
    const conCero = cuentas.find((c) => c.endsWith("0"));
    expect(conCero).toBeDefined();
    expect(clabeError(conCero!)).toBeNull();
  });
});

describe("bankFromClabe", () => {
  it("reconoce el banco por los 3 primeros dígitos", () => {
    expect(bankFromClabe(VALIDA)).toBe("BBVA");
    expect(bankFromClabe("002010077777777771")).toBe("Banamex");
    expect(bankFromClabe("072180000000000000")).toBe("Banorte");
    expect(bankFromClabe("722180000000000000")).toBe("Mercado Pago");
  });

  it("funciona con la CLABE incompleta o con formato", () => {
    expect(bankFromClabe("012")).toBe("BBVA");
    expect(bankFromClabe("012 180 00123456789 7")).toBe("BBVA");
  });

  it("código desconocido → undefined", () => {
    expect(bankFromClabe("999180000000000000")).toBeUndefined();
  });

  it("vacío o con menos de 3 dígitos → undefined", () => {
    expect(bankFromClabe("")).toBeUndefined();
    expect(bankFromClabe("01")).toBeUndefined();
  });
});

describe("formatClabe", () => {
  it("separa banco · plaza · cuenta · verificador", () => {
    expect(formatClabe("012180001234567897")).toBe("012 180 00123456789 7");
    expect(formatClabe(VALIDA)).toBe(`012 180 00123456789 ${VALIDA[17]}`);
  });

  it("es idempotente", () => {
    const una = formatClabe(VALIDA);
    expect(formatClabe(una)).toBe(una);
  });

  it("formatea de forma progresiva mientras se captura", () => {
    expect(formatClabe("")).toBe("");
    expect(formatClabe("01")).toBe("01");
    expect(formatClabe("0121")).toBe("012 1");
    expect(formatClabe("012180")).toBe("012 180");
    expect(formatClabe("0121800012")).toBe("012 180 0012");
    expect(formatClabe("01218000123456789")).toBe("012 180 00123456789");
  });

  it("ignora los caracteres que no son dígitos", () => {
    expect(formatClabe("abc-012180")).toBe("012 180");
  });
});
