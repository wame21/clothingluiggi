import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Zona horaria fija para que las pruebas de fechas sean deterministas.
// Se asigna antes de exportar la config para que los procesos hijos la hereden.
process.env.TZ = "America/Mexico_City";

export default defineConfig({
  oxc: {
    jsx: { runtime: "automatic" },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    env: {
      TZ: "America/Mexico_City",
    },
  },
});
