/**
 * Normalize + match helpers so customer addresses upsert instead of duplicating.
 */

export type AddressMatchFields = {
  address_1?: string | null;
  address_2?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
};

export function normalizeAddressPart(value?: string | null): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Stable key for grouping / matching near-identical addresses. */
export function customerAddressMatchKey(fields: AddressMatchFields): string {
  return [
    normalizeAddressPart(fields.address_1),
    normalizeAddressPart(fields.address_2),
    normalizeAddressPart(fields.city),
    normalizeAddressPart(fields.postal_code),
    normalizeAddressPart(fields.country_code) || "in",
  ].join("|");
}

export function findMatchingCustomerAddress<T extends AddressMatchFields & { id: string }>(
  existing: T[],
  incoming: AddressMatchFields
): T | null {
  const key = customerAddressMatchKey(incoming);
  // Empty street + pin is not a useful match — avoid collapsing unrelated blanks
  const [line1, , , pin] = key.split("|");
  if (!line1 && !pin) return null;

  for (const addr of existing) {
    if (!addr?.id) continue;
    if (customerAddressMatchKey(addr) === key) return addr;
  }
  return null;
}
