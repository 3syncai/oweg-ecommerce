type Variant = { id: string; options: Record<string, string> };
type Product<V extends Variant = Variant> = {
  variant_id?: string;
  variants: V[];
  options: Array<{ title: string; values: string[] }>;
};

export function initialProductOptions(product: Product): Record<string, string> {
  const preferred = product.variants.find(variant => variant.id === product.variant_id) ?? product.variants[0];
  const result: Record<string, string> = {};
  for (const option of product.options) {
    if (product.variants.length === 1) result[option.title] = preferred?.options[option.title] ?? option.values[0] ?? '';
    else if (option.values.length === 1) result[option.title] = option.values[0];
  }
  return result;
}

export function selectedProductVariant<V extends Variant>(product: Product<V>, selection: Record<string, string>, explicitVariantId?: string | null): V | null {
  if (product.variants.length === 1) return product.variants[0];
  if (!product.options.length) return product.variants.find(variant => variant.id === explicitVariantId) ?? null;
  return product.variants.find(variant => product.options.every(option =>
    Boolean(selection[option.title]) && variant.options[option.title] === selection[option.title]
  )) ?? null;
}

export function changeProductOption(product: Product, previous: Record<string, string>, title: string, value: string) {
  const next = { ...previous, [title]: value };
  for (const option of product.options) {
    if (option.title === title || !next[option.title]) continue;
    const matches = product.variants.some(variant => product.options.every(opt =>
      !next[opt.title] || variant.options[opt.title] === next[opt.title]
    ));
    if (!matches) delete next[option.title];
  }
  return next;
}
