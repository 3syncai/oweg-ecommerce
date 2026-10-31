function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

/** Use the actual cart line's variant, never a product's default variant. */
export function cartVariantLabel(item: unknown): string {
  const line = record(item), variant = record(line.variant);
  const options = Array.isArray(variant.options) ? variant.options : [];
  const labels = options.map(option => {
    const row = record(option), value = text(row.value), title = text(record(row.option).title);
    if (!value || /^default(?: variant| option)?$/i.test(value)) return '';
    return title ? `${title}: ${value}` : value;
  }).filter(Boolean);
  if (labels.length) return [...new Set(labels)].join(' · ');
  const values = record(line.variant_option_values);
  const storedLabels = Object.entries(values).filter(([, value]) => text(value) && !/^default$/i.test(text(value)))
    .map(([key, value]) => `${key}: ${text(value)}`);
  if (storedLabels.length) return storedLabels.join(' · ');
  const title = text(line.variant_title) || text(variant.title);
  return /^default(?: variant| option)?$/i.test(title) ? '' : title;
}
