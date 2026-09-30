/** Utilidades para la CLABE interbancaria (18 dígitos: banco 3 · plaza 3 · cuenta 11 · verificador 1). */

/** Bancos más comunes por los 3 primeros dígitos de la CLABE (catálogo de Banxico). */
const BANKS: Record<string, string> = {
  "002": "Banamex",
  "012": "BBVA",
  "014": "Santander",
  "021": "HSBC",
  "030": "BanBajío",
  "036": "Inbursa",
  "044": "Scotiabank",
  "058": "Banregio",
  "062": "Afirme",
  "072": "Banorte",
  "127": "Banco Azteca",
  "137": "BanCoppel",
  "638": "Nu México",
  "646": "STP",
  "722": "Mercado Pago",
};

export const onlyDigits = (s: string) => s.replace(/\D/g, "");

/** Dígito verificador: pesos 3-7-1 sobre los primeros 17 dígitos, módulo 10. */
function checkDigit(first17: string) {
  const weights = [3, 7, 1];
  const sum = [...first17].reduce((a, d, i) => a + ((Number(d) * weights[i % 3]) % 10), 0);
  return (10 - (sum % 10)) % 10;
}

/** Mensaje de error, o `null` si la CLABE es válida. Una CLABE vacía es válida (sin datos de depósito). */
export function clabeError(raw: string): string | null {
  const clabe = onlyDigits(raw);
  if (!clabe) return null;
  if (clabe.length !== 18) return `La CLABE lleva 18 dígitos (llevas ${clabe.length})`;
  if (checkDigit(clabe.slice(0, 17)) !== Number(clabe[17])) return "El dígito verificador no coincide; revisa que esté bien capturada";
  return null;
}

/** Banco según la CLABE, si es uno de los conocidos. */
export const bankFromClabe = (raw: string) => BANKS[onlyDigits(raw).slice(0, 3)];

/** "012180001234567897" → "012 180 00123456789 7" */
export function formatClabe(raw: string) {
  const c = onlyDigits(raw);
  return [c.slice(0, 3), c.slice(3, 6), c.slice(6, 17), c.slice(17)].filter(Boolean).join(" ");
}
