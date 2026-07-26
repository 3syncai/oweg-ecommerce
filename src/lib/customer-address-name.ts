/**
 * Derive a human title for Medusa customer addresses.
 * Admin shows address_name (falls back to "n/a" when missing).
 */
export function deriveCustomerAddressName(input: {
  address_name?: string | null;
  company?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  address_1?: string | null;
  city?: string | null;
  is_default_shipping?: boolean | null;
}): string {
  const explicit = typeof input.address_name === "string" ? input.address_name.trim() : "";
  if (explicit) return explicit;

  if (input.is_default_shipping) return "Home";

  const company = typeof input.company === "string" ? input.company.trim() : "";
  if (company) return company;

  const fullName = [input.first_name, input.last_name]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join(" ");
  if (fullName) return fullName;

  const line1 = typeof input.address_1 === "string" ? input.address_1.trim() : "";
  if (line1) return line1.length > 48 ? `${line1.slice(0, 45)}…` : line1;

  const city = typeof input.city === "string" ? input.city.trim() : "";
  if (city) return city;

  return "Address";
}

/** Ensure POST bodies always include address_name when address fields are present. */
export function withDerivedAddressName(
  body: Record<string, unknown>
): Record<string, unknown> {
  const existing =
    typeof body.address_name === "string" ? body.address_name.trim() : "";
  if (existing) return body;

  // Pure default-flag updates should not invent a name
  const hasAddressFields = [
    "first_name",
    "last_name",
    "address_1",
    "city",
    "company",
  ].some((k) => typeof body[k] === "string" && String(body[k]).trim());

  if (!hasAddressFields) return body;

  return {
    ...body,
    address_name: deriveCustomerAddressName({
      address_name: typeof body.address_name === "string" ? body.address_name : null,
      company: typeof body.company === "string" ? body.company : null,
      first_name: typeof body.first_name === "string" ? body.first_name : null,
      last_name: typeof body.last_name === "string" ? body.last_name : null,
      address_1: typeof body.address_1 === "string" ? body.address_1 : null,
      city: typeof body.city === "string" ? body.city : null,
      is_default_shipping: body.is_default_shipping === true,
    }),
  };
}
