const INDIAN_PHONE_REGEX = /^[6-9]\d{9}$/

export function normalizeIndianPhone(input: unknown) {
  if (typeof input !== "string") return null
  const digits = input.replace(/\D/g, "")
  const local = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits
  if (!INDIAN_PHONE_REGEX.test(local)) return null
  return {
    local,
    e164: `91${local}`,
  }
}
