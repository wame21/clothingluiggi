import type { Branch, BranchId } from "./types";

/* ------------------------------------------------------------------ */
/* Selectores puros sobre una lista de sucursales                       */
/* ------------------------------------------------------------------ */
export const activeBranches = (list: Branch[]) => list.filter((b) => b.active);

/** Sucursales con mostrador (Punto de venta). */
export const posBranches = (list: Branch[]) => list.filter((b) => b.active && b.pos);

/** Sucursal que surte mayoreo y pedidos en línea. */
export const warehouseOf = (list: Branch[]) => list.find((b) => b.isWarehouse);

/* ------------------------------------------------------------------ */
/* Sucursales vigentes fuera de React                                   */
/* ------------------------------------------------------------------ */
// Mismo patrón que `wholesale.ts`: el store la aplica al cargar y al guardar.
let current: Branch[] = [];

export function applyBranches(list: Branch[]) {
  current = list;
}

export const currentBranches = () => current;

/** Nombre corto de la sucursal; también resuelve las archivadas. */
export const branchName = (id: BranchId) => current.find((b) => b.id === id)?.short ?? id;
