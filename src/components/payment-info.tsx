import { Fragment } from "react";
import { SUPPORT_PAYMENT } from "@/lib/constants";

const PAY_FIELDS = [
  ["bank", "Banco"],
  ["clabe", "CLABE"],
  ["holder", "Titular"],
  ["whatsapp", "WhatsApp"],
] as const;

/** Datos para pagar; los vacíos de `SUPPORT_PAYMENT` no se muestran. */
export function PaymentInfo() {
  const rows = PAY_FIELDS.filter(([k]) => SUPPORT_PAYMENT[k]);
  if (!rows.length) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([k, label]) => (
        <Fragment key={k}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium tabular">{SUPPORT_PAYMENT[k]}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
