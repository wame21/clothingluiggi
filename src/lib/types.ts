export type Channel = "tienda" | "web" | "whatsapp" | "instagram" | "mayoreo";

export type BranchId = "andara" | "bamoa" | "bodega";

export interface Branch {
  id: BranchId;
  name: string;
  short: string;
  address: string;
}

export type Category =
  | "Camisas manga larga"
  | "Camisas manga corta"
  | "Polos"
  | "Playeras"
  | "Pantalones"
  | "Jeans"
  | "Shorts"
  | "Chamarras y suéteres"
  | "Accesorios";

export interface ProductColor {
  name: string;
  hex: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: Category;
  cost: number;
  price: number;
  sizes: string[];
  colors: ProductColor[];
  minStock: number;
  active: boolean;
  createdAt: string;
  wooId?: number;
}

/** Stock keyed by variant key (`productId|color|size`) then by branch. */
export type StockMap = Record<string, Record<BranchId, number>>;

export type MovementType =
  | "entrada"
  | "venta"
  | "ajuste"
  | "traspaso"
  | "cancelacion";

export interface Movement {
  id: string;
  date: string;
  type: MovementType;
  productId: string;
  variantKey: string;
  branch: BranchId;
  qty: number;
  ref?: string;
  note?: string;
}

export interface LineItem {
  productId: string;
  variantKey: string;
  name: string;
  color: string;
  size: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
  listPrice: number;
}

export type OrderStatus =
  | "pendiente"
  | "apartado"
  | "pagado"
  | "enviado"
  | "entregado"
  | "cancelado";

export type PaymentMethod =
  | "efectivo"
  | "transferencia"
  | "tarjeta"
  | "mercadopago"
  | "paypal";

export interface Payment {
  id: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  note?: string;
}

export interface ShippingInfo {
  carrier?: string;
  tracking?: string;
  address?: string;
  city?: string;
}

export interface Order {
  id: string;
  folio: string;
  date: string;
  channel: Channel;
  customerId?: string;
  customerName: string;
  branch: BranchId;
  items: LineItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  payments: Payment[];
  status: OrderStatus;
  shippingInfo?: ShippingInfo;
  notes?: string;
  quoteId?: string;
  tierId?: TierId;
  seller?: string;
}

export type CustomerType = "menudeo" | "mayorista" | "distribuidor";

export interface Customer {
  id: string;
  name: string;
  business?: string;
  phone: string;
  city: string;
  state: string;
  type: CustomerType;
  instagram?: string;
  rfc?: string;
  email?: string;
  since: string;
  notes?: string;
}

export type TierId = "menudeo" | "medio" | "mayoreo" | "distribuidor";

export type QuoteStatus =
  | "borrador"
  | "enviada"
  | "aceptada"
  | "convertida"
  | "rechazada";

export interface Quote {
  id: string;
  folio: string;
  date: string;
  validUntil: string;
  customerId: string;
  customerName: string;
  items: LineItem[];
  tierId: TierId;
  subtotalList: number;
  discount: number;
  subtotal: number;
  shipping: number;
  total: number;
  depositPct: number;
  status: QuoteStatus;
  notes?: string;
  orderId?: string;
}

export type ExpenseCategory =
  | "renta"
  | "nomina"
  | "publicidad"
  | "envios"
  | "servicios"
  | "empaque"
  | "software"
  | "otros";

export interface Expense {
  id: string;
  date: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  branch?: BranchId;
  method: PaymentMethod;
}

export type Role = "dueno" | "vendedor";

/** Rol guardado en `profiles`: quien se registra queda pendiente hasta que el dueño lo aprueba. */
export type AppRole = Role | "pendiente";

export interface Profile {
  id: string;
  name: string;
  email?: string;
  role: AppRole;
  branch: BranchId;
  createdAt: string;
}

/** Datos del negocio que se cargan de Supabase. Fechas en ISO. */
export interface ErpData {
  products: Product[];
  stock: StockMap;
  movements: Movement[];
  orders: Order[];
  customers: Customer[];
  quotes: Quote[];
  expenses: Expense[];
}
