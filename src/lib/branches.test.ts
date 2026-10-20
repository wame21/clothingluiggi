import { beforeEach, describe, expect, it } from "vitest";
import { activeBranches, applyBranches, branchName, currentBranches, posBranches, warehouseOf } from "./branches";
import type { Branch } from "./types";

const sucursal = (id: string, extra: Partial<Branch> = {}): Branch => ({
  id,
  name: `Sucursal ${id}`,
  short: id.toUpperCase(),
  address: "",
  pos: true,
  isWarehouse: false,
  active: true,
  sort: 0,
  ...extra,
});

const centro = sucursal("centro", { short: "Centro", pos: true, isWarehouse: true, sort: 1 });
const norte = sucursal("norte", { short: "Norte", pos: true, sort: 2 });
const bodega = sucursal("bodega", { short: "Bodega", pos: false, sort: 3 });
const cerrada = sucursal("cerrada", { short: "Cerrada", pos: true, active: false, sort: 4 });
const lista = [centro, norte, bodega, cerrada];

beforeEach(() => {
  applyBranches([]);
});

describe("activeBranches", () => {
  it("excluye las archivadas", () => {
    expect(activeBranches(lista).map((b) => b.id)).toEqual(["centro", "norte", "bodega"]);
  });

  it("conserva el orden de la lista", () => {
    expect(activeBranches([norte, centro]).map((b) => b.id)).toEqual(["norte", "centro"]);
  });

  it("lista vacía o toda archivada → []", () => {
    expect(activeBranches([])).toEqual([]);
    expect(activeBranches([cerrada])).toEqual([]);
  });

  it("no modifica la lista original", () => {
    const copia = [...lista];
    activeBranches(lista);
    expect(lista).toEqual(copia);
  });
});

describe("posBranches", () => {
  it("son las activas con mostrador", () => {
    expect(posBranches(lista).map((b) => b.id)).toEqual(["centro", "norte"]);
  });

  it("una archivada con pos no aparece", () => {
    expect(posBranches([cerrada])).toEqual([]);
  });

  it("una activa sin pos no aparece", () => {
    expect(posBranches([bodega])).toEqual([]);
  });
});

describe("warehouseOf", () => {
  it("devuelve la sucursal que surte", () => {
    expect(warehouseOf(lista)).toBe(centro);
  });

  it("ninguna marcada → undefined", () => {
    expect(warehouseOf([norte, bodega])).toBeUndefined();
    expect(warehouseOf([])).toBeUndefined();
  });
});

describe("sucursales vigentes", () => {
  it("currentBranches parte vacío", () => {
    expect(currentBranches()).toEqual([]);
  });

  it("applyBranches reemplaza la lista vigente", () => {
    applyBranches(lista);
    expect(currentBranches()).toBe(lista);
    applyBranches([norte]);
    expect(currentBranches()).toEqual([norte]);
  });

  it("branchName devuelve el nombre corto", () => {
    applyBranches(lista);
    expect(branchName("centro")).toBe("Centro");
    expect(branchName("norte")).toBe("Norte");
  });

  it("branchName también resuelve las archivadas", () => {
    applyBranches(lista);
    expect(branchName("cerrada")).toBe("Cerrada");
  });

  it("branchName con un id desconocido devuelve el propio id", () => {
    applyBranches(lista);
    expect(branchName("fantasma")).toBe("fantasma");
  });

  it("branchName sin sucursales cargadas devuelve el id", () => {
    expect(branchName("centro")).toBe("centro");
  });

  it("branchName refleja el último applyBranches", () => {
    applyBranches([centro]);
    applyBranches([{ ...centro, short: "Matriz" }]);
    expect(branchName("centro")).toBe("Matriz");
  });
});
