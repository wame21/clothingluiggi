import { Fragment } from "react";
import { formatClabe } from "@/lib/clabe";
import { useErp } from "@/lib/store";

const PAY_FIELDS = [
  ["bank", "Banco"],
  ["clabe", "CLABE"],
  ["holder", "Titular"],
  ["whatsapp", "WhatsApp"],
] as const;

/** Datos para pagar la membresía (llegan con `my_membership`); los vacíos no se muestran. */
export function PaymentInfo() {
  const payment = useErp((s) => s.membership?.payment);
  const rows = PAY_FIELDS.filter(([k]) => payment?.[k]);
  if (!payment || !rows.length) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([k, label]) => (
        <Fragment key={k}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium tabular">{k === "clabe" ? formatClabe(payment.clabe) : payment[k]}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
