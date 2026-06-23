export const formatAccountDate = (value?: string) => {
  if (!value) return "";
  const d = new Date(value);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export const formatAccountCurrency = (value?: number, currency?: string) => {
  if (typeof value !== "number") return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: (currency || "INR").toUpperCase(),
    maximumFractionDigits: 2,
  }).format(value);
};

export const getCustomerDisplayName = (customer: {
  first_name?: string;
  last_name?: string;
  email?: string;
} | null) => {
  if (!customer) return "Customer";
  if (customer.first_name || customer.last_name) {
    return `${customer.first_name || ""} ${customer.last_name || ""}`.trim();
  }
  return customer.email || "Customer";
};
