"use client";

import {
  AlertTriangle,
  Ban,
  BarChart3,
  Boxes,
  FileText,
  Hourglass,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Settings,
  ShoppingBag,
  Store,
  Sun,
  UserCog,
  Users,
  Wallet,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";
import { BrandLockup, BrandMark } from "@/components/brand";
import { PaymentInfo } from "@/components/payment-info";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { mxn } from "@/lib/format";
import { graceNotice, hasModule, minPlanFor, needsPayment, PLAN_NAMES } from "@/lib/membership";
import { useBusinessName, useErp, useWholesaleEnabled } from "@/lib/store";
import type { ModuleKey } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  ownerOnly?: boolean;
  wholesaleOnly?: boolean;
  /** Módulo del plan que lo habilita; sin él, siempre disponible (Equipo, Configuración). */
  module?: ModuleKey;
  badge?: "orders" | "quotes";
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Operación",
    items: [
      { href: "/", label: "Panel general", icon: LayoutDashboard, module: "panel" },
      { href: "/pedidos", label: "Pedidos", icon: ShoppingBag, badge: "orders", module: "pedidos" },
      { href: "/pos", label: "Punto de venta", icon: Store, module: "pos" },
      { href: "/inventario", label: "Inventario", icon: Boxes, module: "inventario" },
      { href: "/mayoreo", label: "Mayoreo", icon: FileText, badge: "quotes", wholesaleOnly: true, module: "mayoreo" },
      { href: "/clientes", label: "Clientes", icon: Users, module: "clientes" },
    ],
  },
  {
    section: "Negocio",
    items: [
      { href: "/finanzas", label: "Finanzas", icon: Wallet, ownerOnly: true, module: "finanzas" },
      // shortcut: Reportes se calcula en el navegador con datos propios; bloquear en servidor si se vuelve un cálculo del servidor
      { href: "/reportes", label: "Reportes", icon: BarChart3, ownerOnly: true, module: "reportes" },
      { href: "/equipo", label: "Equipo", icon: UserCog, ownerOnly: true },
      { href: "/configuracion", label: "Configuración", icon: Settings, ownerOnly: true },
    ],
  },
];

const NAV_ITEMS = NAV.flatMap((g) => g.items);
const OWNER_ONLY = NAV_ITEMS.filter((i) => i.ownerOnly).map((i) => i.href);
/** Rutas que se muestran sin el menú lateral ni la carga de datos. */
const BARE_PATHS = ["/login", "/admin"];
const isActive = (href: string, pathname: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function parseHex(hex: string): [number, number, number] {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** Texto oscuro o claro, el que más contraste dé sobre el color de fondo. */
function onColor(rgb: number[]) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.179 ? "oklch(0.14 0.006 75)" : "oklch(0.98 0 0)";
}

const ACCENT_VARS = ["--gold", "--gold-foreground", "--ring", "--sidebar-primary", "--sidebar-primary-foreground", "--sidebar-ring", "--primary", "--primary-foreground"];

/**
 * Color de acento del negocio sobre el tema dorado. Se escribe en documentElement (gana a :root y .dark):
 * --gold, --ring y --sidebar-primary toman el color; en claro, --gold se oscurece un poco para leerse sobre
 * fondo blanco, y en oscuro --primary (botones) también toma el acento, igual que el tema por defecto.
 * Sin color válido no se escribe nada y queda el tema actual.
 */
function AccentTheme() {
  const accent = useErp((s) => s.profileSettings.accentColor);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  useEffect(() => {
    const root = document.documentElement;
    const clear = () => ACCENT_VARS.forEach((v) => root.style.removeProperty(v));
    clear();
    if (!accent || !HEX.test(accent)) return;
    const rgb = parseHex(accent);
    const gold = dark ? toHex(rgb) : toHex(rgb.map((v) => v * 0.82));
    const set = (name: string, value: string) => root.style.setProperty(name, value);
    set("--gold", gold);
    set("--gold-foreground", onColor(dark ? rgb : parseHex(gold)));
    set("--ring", toHex(rgb));
    set("--sidebar-primary", toHex(rgb));
    set("--sidebar-primary-foreground", onColor(rgb));
    set("--sidebar-ring", toHex(rgb));
    if (dark) {
      set("--primary", toHex(rgb));
      set("--primary-foreground", onColor(rgb));
    }
    return clear;
  }, [accent, dark]);

  return null;
}

function useNavBadges() {
  const orders = useErp((s) => s.orders);
  const quotes = useErp((s) => s.quotes);
  const toAttend = orders.filter((o) => o.status === "pendiente" || o.status === "apartado" || o.status === "pagado").length;
  const openQuotes = quotes.filter((q) => q.status === "enviada" || q.status === "borrador").length;
  return { orders: toAttend, quotes: openQuotes };
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const role = useErp((s) => s.role);
  const wholesale = useWholesaleEnabled();
  const badges = useNavBadges();
  const membership = useErp((s) => s.membership);
  const plans = useErp((s) => s.plans);

  return (
    <nav className="flex flex-col gap-6">
      {NAV.map((group) => (
        <div key={group.section} className="flex flex-col gap-1">
          <div className="px-3 pb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-sidebar-foreground/40">
            {group.section}
          </div>
          {group.items.filter((item) => wholesale || !item.wholesaleOnly || (item.module && !hasModule(membership, item.module))).map((item) => {
            const active = isActive(item.href, pathname);
            const locked = item.ownerOnly && role !== "dueno";
            const upgrade = item.module && !hasModule(membership, item.module) ? minPlanFor(plans, item.module) : undefined;
            const count = item.badge ? badges[item.badge] : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  active && "bg-sidebar-accent text-sidebar-accent-foreground",
                  (locked || upgrade) && "opacity-50",
                )}
              >
                <item.icon className={cn("size-4 shrink-0", active ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80")} />
                <span className="flex-1 truncate">{item.label}</span>
                {locked ? (
                  <Lock className="size-3.5 text-sidebar-foreground/40" />
                ) : upgrade ? (
                  <span className="flex items-center gap-1 text-[11px] text-sidebar-foreground/60">
                    <Lock className="size-3.5 text-sidebar-foreground/40" /> Plan {upgrade.name}
                  </span>
                ) : count > 0 ? (
                  <span className="rounded-full bg-sidebar-primary/15 px-1.5 py-px text-[11px] font-medium tabular text-sidebar-primary">
                    {count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const live = useErp((s) => s.live);
  return (
    <div className="flex h-full flex-col gap-8 bg-sidebar px-3 py-5 text-sidebar-foreground">
      <div className="px-2">
        <BrandLockup />
      </div>
      <NavLinks onNavigate={onNavigate} />
      <div className="mt-auto rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-3 text-xs">
        <div className="flex items-center gap-2 font-medium text-sidebar-accent-foreground">
          <span className="relative flex size-2">
            {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
            <span className={cn("relative inline-flex size-2 rounded-full", live ? "bg-emerald-400" : "bg-amber-400")} />
          </span>
          {live ? "En línea" : "Reconectando…"}
        </div>
        <p className="mt-1 text-sidebar-foreground/55">
          {live ? "Ventas e inventario se actualizan en tiempo real entre sucursales." : "Los cambios de otros usuarios aparecerán al reconectar."}
        </p>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <Button variant="ghost" size="icon" aria-label="Cambiar tema" onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

function UserMenu() {
  const profile = useErp((s) => s.profile);
  const signOut = useErp((s) => s.signOut);
  const branches = useErp((s) => s.branches);
  if (!profile) return null;
  const owner = profile.role === "dueno";
  const branch = branches.find((b) => b.id === profile.branch)?.short;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9 gap-2 pl-1.5">
          <span className="grid size-6 place-items-center rounded-full bg-gold text-[11px] font-semibold text-gold-foreground">
            {profile.name.charAt(0).toUpperCase()}
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-xs font-medium">{profile.name}</span>
            <span className="block text-[10px] text-muted-foreground">
              {owner ? "Dueño · acceso total" : branch ? `Vendedor · ${branch}` : "Vendedor"}
            </span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{profile.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOut /> Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Restricted() {
  return (
    <div className="mx-auto mt-24 flex max-w-md flex-col items-center gap-4 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-muted">
        <Lock className="size-6 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold">Sección exclusiva del dueño</h2>
      <p className="text-sm text-muted-foreground">
        Los vendedores no pueden ver costos, utilidades ni gastos del negocio. Cada usuario ve solo lo que necesita para trabajar.
      </p>
    </div>
  );
}

function Upgrade({ plan }: { plan: string }) {
  return (
    <div className="mx-auto mt-24 flex max-w-md flex-col items-center gap-4 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-muted">
        <Lock className="size-6 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold">Disponible en el plan {plan}</h2>
      <p className="text-sm text-muted-foreground">El dueño puede mejorar el plan en Configuración → Membresía. Tus datos se conservan.</p>
    </div>
  );
}

/** Aviso de pago pendiente (gracia o últimos 3 días de prueba) o de plan vencido: diálogo al cargar la app y banner fijo. */
function MembershipNotice() {
  const m = useErp((s) => s.membership);
  const plans = useErp((s) => s.plans);
  const [open, setOpen] = useState(true);
  if (!m) return null;

  const pay = needsPayment(m);
  if (!pay && m.state !== "vencida") return null;

  const plan = PLAN_NAMES[m.plan];
  const text = pay
    ? `${graceNotice(m, plans)} Monto del plan ${plan}: ${mxn(m.price)}.`
    : `Estás en Lite porque tu plan venció; paga ${mxn(m.price)} para recuperar ${plan}.`;
  return (
    <>
      <div role="status" className="flex items-start gap-2 bg-amber-100 px-4 py-2 text-xs text-amber-950 dark:bg-amber-950 dark:text-amber-100 md:px-6">
        <AlertTriangle className="mt-px size-3.5 shrink-0" />
        <span>{text}</span>
      </div>
      {pay && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registra tu pago</DialogTitle>
              <DialogDescription>{text}</DialogDescription>
            </DialogHeader>
            <PaymentInfo />
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Entendido</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">{children}</div>
    </div>
  );
}

/** Carga la sesión y los datos del negocio antes de mostrar la app. */
function DataGate({ children }: { children: ReactNode }) {
  const status = useErp((s) => s.status);
  const error = useErp((s) => s.error);
  const profile = useErp((s) => s.profile);
  const init = useErp((s) => s.init);
  const signOut = useErp((s) => s.signOut);
  const membership = useErp((s) => s.membership);

  useEffect(() => {
    void init();
  }, [init]);

  if (status === "loading") {
    return (
      <FullScreen>
        <BrandMark className="size-14 animate-pulse text-xl" />
        <p className="text-sm text-muted-foreground">Cargando tu negocio…</p>
      </FullScreen>
    );
  }

  if (status === "error") {
    return (
      <FullScreen>
        <WifiOff className="size-8 text-muted-foreground" />
        <h2 className="text-xl font-semibold">No se pudo conectar</h2>
        <p className="text-sm text-muted-foreground">{error}</p>
        <div className="flex gap-2">
          <Button onClick={() => void init()}>
            <RefreshCw /> Reintentar
          </Button>
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut /> Cerrar sesión
          </Button>
        </div>
      </FullScreen>
    );
  }

  if (profile?.role === "pendiente") {
    return (
      <FullScreen>
        <Hourglass className="size-8 text-gold" />
        <h2 className="text-xl font-semibold">Tu cuenta está pendiente</h2>
        <p className="text-sm text-muted-foreground">
          Hola {profile.name}. El dueño del negocio debe aprobar tu acceso en la sección Equipo. Cuando lo haga, vuelve a revisar.
        </p>
        <div className="flex gap-2">
          <Button onClick={() => void init()}>
            <RefreshCw /> Revisar de nuevo
          </Button>
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut /> Cerrar sesión
          </Button>
        </div>
      </FullScreen>
    );
  }

  if (membership?.state === "suspendida") {
    return (
      <FullScreen>
        <Ban className="size-8 text-destructive" />
        <h2 className="text-xl font-semibold">Cuenta suspendida</h2>
        {membership.suspendedReason && <p className="text-sm text-muted-foreground">{membership.suspendedReason}</p>}
        <p className="text-sm text-muted-foreground">
          Tus datos se conservan. Para reactivarla, registra el pago de tu plan {PLAN_NAMES[membership.plan]}
          {membership.price > 0 && ` (${mxn(membership.price)})`}.
        </p>
        <PaymentInfo />
        <div className="flex gap-2">
          <Button onClick={() => void init()}>
            <RefreshCw /> Revisar de nuevo
          </Button>
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut /> Cerrar sesión
          </Button>
        </div>
      </FullScreen>
    );
  }

  return <>{children}</>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const role = useErp((s) => s.role);
  const membership = useErp((s) => s.membership);
  const plans = useErp((s) => s.plans);
  const businessName = useBusinessName();
  const [open, setOpen] = useState(false);
  const locked = role !== "dueno" && OWNER_ONLY.some((p) => pathname.startsWith(p));
  const gated = NAV_ITEMS.find((i) => i.module && isActive(i.href, pathname))?.module;
  const upgrade = membership && gated && !hasModule(membership, gated) ? minPlanFor(plans, gated) : undefined;

  if (BARE_PATHS.includes(pathname)) return <>{children}</>;

  return (
    <DataGate>
      <AccentTheme />
      <div className="min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border print:hidden lg:block">
          <SidebarBody />
        </aside>
        <div className="lg:pl-64">
          <div className="sticky top-0 z-20 print:hidden">
            <MembershipNotice />
            <header className="flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur md:px-6">
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menú">
                    <Menu />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 border-sidebar-border p-0" showCloseButton={false}>
                  <SheetTitle className="sr-only">Menú</SheetTitle>
                  <SidebarBody onNavigate={() => setOpen(false)} />
                </SheetContent>
              </Sheet>
              <div className="flex min-w-0 items-center gap-2 lg:hidden">
                <BrandMark className="size-7 text-xs" />
                <span className="truncate font-display text-lg font-semibold uppercase tracking-[0.16em]">{businessName}</span>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <ThemeToggle />
                <UserMenu />
              </div>
            </header>
          </div>
          <main className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-6 md:py-8">
            {locked ? <Restricted /> : upgrade ? <Upgrade plan={upgrade.name} /> : children}
          </main>
        </div>
      </div>
    </DataGate>
  );
}
