# Luiggi ERP · demo

Demo local de un panel ERP para **Luiggi Boutique** (Guasave, Sinaloa): pedidos multicanal, punto de venta, inventario por talla y sucursal, mayoreo con cotizaciones/notas imprimibles, clientes, finanzas y reportes.

Todos los datos son **de ejemplo** y viven en el navegador (localStorage). No hay backend.

## Arrancar

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

- **Restablecer datos:** menú del usuario (arriba a la derecha) → *Restablecer datos demo*.
- **Ver como vendedor:** mismo menú → *Vendedor*. Oculta costos, utilidades, Finanzas y Reportes.
- **Tema claro/oscuro:** botón del sol/luna.
- Las fechas de los datos se recorren solas cada día para que la demo siempre se vea al día.

Prueba de humo (con `pnpm dev` corriendo; usa `/usr/bin/chromium`, cambia la ruta con `CHROMIUM=`):

```bash
pnpm smoke          # capturas en ./.smoke
```

## Guion sugerido para la presentación (≈10 min)

1. **Panel general:** ventas, utilidad bruta y margen operativo del mes contra el mes anterior; de qué canal viene cada peso y las tallas que se están agotando.
2. **Mayoreo → Nueva cotización:** elige un mayorista (p. ej. *Soto Men's Store*), toca *Paquete Boutique* y ve cómo se arma solo con la curva de tallas. El nivel de precio cambia con las piezas ("agrega 1 pz y pasa a Distribuidor"). *Generar* → cotización con su marca → *PDF* o *WhatsApp*.
3. **Convertir en pedido:** registra el anticipo del 50%, aparta la mercancía de bodega y el pedido aparece en Pedidos como *Apartado*.
4. **Pedidos → Nuevo pedido:** captura un pedido de WhatsApp o Instagram en segundos; el inventario baja al instante.
5. **Punto de venta:** cobra una prenda en Plaza Andara, imprime el ticket y revisa el corte de caja.
6. **Inventario:** matriz color × talla por sucursal, entradas, traspasos, ajustes, kardex y *Reabasto* (qué comprar y cuánto, más el capital detenido).
7. **Finanzas:** estado de resultados, gastos, punto de equilibrio y cuentas por cobrar. Registra un gasto y ve cómo cambia la utilidad.
8. **Reportes:** rentabilidad por canal y por producto (ABC), curva real de tallas y mejores mayoristas.
9. **Integraciones:** *Sincronizar ahora* importa pedidos de la web; ahí mismo está el plan por fases (WhatsApp, guías, CFDI, portal de mayoristas).
10. **Cambiar a Vendedor** para mostrar que el equipo no ve costos ni utilidades.

## Esquema de mayoreo (propuesto)

| Nivel | Piezas (surtidas) | Descuento |
|---|---|---|
| Menudeo | 1–5 | precio de lista |
| Medio mayoreo | 6–11 | −20% |
| Mayoreo | 12–49 | −32% |
| Distribuidor | 50+ (o clientes distribuidores desde 24) | −40% |

Anticipo del 50% para apartar, envío gratis desde $15,000 (si no, $280 fijo) y vigencia de 7 días. Se configura en `src/lib/wholesale.ts`.

## Estructura

- `src/lib/`: modelo de datos (`types.ts`), store persistido (`store.ts`), datos semilla (`seed.ts`), cálculos financieros (`metrics.ts`) y esquema de mayoreo (`wholesale.ts`).
- `src/app/`: una ruta por módulo (`pedidos`, `pos`, `inventario`, `mayoreo`, `clientes`, `finanzas`, `reportes`, `integraciones`).
- `src/components/`: shell de la app, gráficas, documento de venta y selectores de producto y cliente.

Stack: Next.js 16, React 19, Tailwind 4, shadcn/ui, Recharts y Zustand.
