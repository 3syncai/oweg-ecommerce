export type OrderItem = {
  id: string;
  title?: string;
  quantity?: number;
  thumbnail?: string;
  unit_price?: number;
  total?: number;
  variant_id?: string;
};

export type OrderAddress = {
  first_name?: string;
  last_name?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  province?: string;
  country_code?: string;
  postal_code?: string;
  phone?: string;
};

export type OrderDetail = {
  id: string;
  display_id?: number;
  created_at?: string;
  updated_at?: string;
  currency_code?: string;
  status?: string;
  total?: number;
  subtotal?: number;
  shipping_total?: number;
  tax_total?: number;
  payment_status?: string;
  fulfillment_status?: string;
  items?: OrderItem[];
  shipping_address?: OrderAddress;
  billing_address?: OrderAddress;
  metadata?: Record<string, unknown>;
  display_totals?: {
    itemsSubtotal: number;
    shipping: number;
    coinDiscount: number;
    oweg10Discount: number;
    grandTotal: number;
  };
};

export type ReturnRequest = {
  id: string;
  order_id: string;
  status: string;
  type: string;
};

export type TrackerStepKey =
  | "placed"
  | "paid"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "return";

export type TrackerStep = {
  key: TrackerStepKey;
  label: string;
  active: boolean;
  current?: boolean;
  tone: "default" | "cancelled";
  timestamp?: string;
  description?: string;
};
