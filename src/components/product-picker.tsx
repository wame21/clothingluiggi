"use client";

import { Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { ColorSwatch } from "@/components/erp";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { branchName } from "@/lib/constants";
import { mxn } from "@/lib/format";
import { useErp } from "@/lib/store";
import type { BranchId, Category, Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { productStock, stockOf, variantKey, type QtyMap } from "@/lib/variants";

export function ProductCombobox({
  branch,
  onSelect,
  exclude = [],
  label = "Agregar producto…",
}: {
  branch: BranchId;
  onSelect: (p: Product) => void;
  exclude?: string[];
  label?: string;
}) {
  const products = useErp((s) => s.products);
  const stock = useErp((s) => s.stock);
  const [open, setOpen] = useState(false);
  const byCat = new Map<Category, Product[]>();
  for (const p of products.filter((p) => p.active && !exclude.includes(p.id))) {
    byCat.set(p.category, [...(byCat.get(p.category) ?? []), p]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-10 w-full justify-start gap-2 text-muted-foreground sm:w-96">
          <Search className="size-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,26rem)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar por nombre, SKU o categoría…" />
          <CommandList className="max-h-80">
            <CommandEmpty>Sin resultados.</CommandEmpty>
            {[...byCat.entries()].map(([cat, list]) => (
              <CommandGroup key={cat} heading={cat}>
                {list.map((p) => {
                  const avail = productStock(p, stock, branch);
                  return (
                    <CommandItem
                      key={p.id}
                      value={`${p.name} ${p.sku} ${p.category} ${p.brand}`}
                      onSelect={() => {
                        onSelect(p);
                        setOpen(false);
                      }}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.sku} · {mxn(p.price)}
                        </div>
                      </div>
                      <span className={cn("shrink-0 text-xs tabular", avail === 0 ? "text-destructive" : "text-muted-foreground")}>
                        {avail} en {branchName(branch)}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Matriz color × talla para capturar cantidades, como en la hoja de Excel. */
export function VariantQtyGrid({
  product,
  branch,
  qty,
  onChange,
  mode = "out",
}: {
  product: Product;
  branch: BranchId;
  qty: QtyMap;
  onChange: (key: string, value: number) => void;
  /** "out" limita a lo disponible (ventas, traspasos); "in" captura entradas sin tope. */
  mode?: "out" | "in";
}) {
  const stock = useErp((s) => s.stock);
  return (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="pr-3 pb-1.5 text-left font-medium">Color</th>
            {product.sizes.map((s) => (
              <th key={s} className="px-1 pb-1.5 text-center font-medium">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {product.colors.map((c) => (
            <tr key={c.name}>
              <td className="pr-3 py-1">
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  <ColorSwatch hex={c.hex} /> {c.name}
                </span>
              </td>
              {product.sizes.map((s) => {
                const key = variantKey(product.id, c.name, s);
                const avail = stockOf(stock, key, branch);
                const v = qty[key] ?? 0;
                const over = mode === "out" && v > avail;
                return (
                  <td key={s} className="px-1 py-1 text-center align-top">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={v || ""}
                      placeholder="0"
                      disabled={mode === "out" && avail === 0 && v === 0}
                      onChange={(e) => onChange(key, Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                      className={cn(
                        "h-9 w-14 rounded-md border bg-background text-center text-sm tabular outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-40",
                        v > 0 && "border-gold/60 bg-gold/10 font-semibold",
                        over && "border-destructive bg-destructive/10 text-destructive",
                      )}
                      aria-label={`${product.name} ${c.name} talla ${s}`}
                    />
                    <div className={cn("mt-0.5 text-[10px] tabular", avail === 0 && mode === "out" ? "text-destructive" : "text-muted-foreground")}>
                      {mode === "in" ? `hay ${avail}` : avail === 0 ? "agotado" : `disp. ${avail}`}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lista de productos agregados, cada uno con su matriz de tallas. */
export function ItemsBuilder({
  branch,
  qty,
  setQty,
  unitPriceOf,
  productIds,
  setProductIds,
}: {
  branch: BranchId;
  qty: QtyMap;
  setQty: (q: QtyMap) => void;
  unitPriceOf: (p: Product) => number;
  productIds: string[];
  setProductIds: (ids: string[]) => void;
}) {
  const products = useErp((s) => s.products);
  const selected = productIds.map((id) => products.find((p) => p.id === id)).filter(Boolean) as Product[];

  const pieces = (p: Product) =>
    p.colors.reduce((a, c) => a + p.sizes.reduce((b, s) => b + (qty[variantKey(p.id, c.name, s)] ?? 0), 0), 0);

  const remove = (p: Product) => {
    const next = { ...qty };
    for (const c of p.colors) for (const s of p.sizes) delete next[variantKey(p.id, c.name, s)];
    setQty(next);
    setProductIds(productIds.filter((id) => id !== p.id));
  };

  return (
    <div className="flex flex-col gap-3">
      {selected.map((p) => {
        const n = pieces(p);
        const unit = unitPriceOf(p);
        return (
          <Card key={p.id} className="gap-3 px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  {p.sku} · lista {mxn(p.price)}
                  {unit !== p.price && <span className="ml-1 font-medium text-gold">→ {mxn(unit)} c/u</span>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-sm font-semibold tabular">{mxn(n * unit)}</div>
                  <div className="text-xs text-muted-foreground tabular">{n} pzs</div>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => remove(p)} aria-label="Quitar producto">
                  <Trash2 />
                </Button>
              </div>
            </div>
            <VariantQtyGrid product={p} branch={branch} qty={qty} onChange={(key, v) => setQty({ ...qty, [key]: v })} />
          </Card>
        );
      })}
      <div className="flex items-center gap-2">
        <ProductCombobox
          branch={branch}
          exclude={productIds}
          onSelect={(p) => setProductIds([...productIds, p.id])}
          label={selected.length ? "Agregar otro producto…" : "Buscar producto para agregar…"}
        />
        {selected.length === 0 && (
          <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
            <Plus className="size-3" /> captura cantidades por color y talla
          </span>
        )}
      </div>
    </div>
  );
}
