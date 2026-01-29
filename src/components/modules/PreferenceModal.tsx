'use client';

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Check, ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import type { PreferenceProfile } from '@/lib/personalization';
import { normalizePreferenceValues } from '@/lib/personalization';

type PreferenceModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (prefs: PreferenceProfile) => Promise<void> | void;
  saving?: boolean;
  initial?: PreferenceProfile | null;
  suggestedCategories?: string[];
};

type ChipGroupProps = {
  label: string;
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
};

function ChipGroup({ label, values, selected, onToggle }: ChipGroupProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-gray-900">{label}</p>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => {
          const active = selected.some((item) => item.toLowerCase() === value.toLowerCase());
          return (
            <button
              key={value}
              type="button"
              onClick={() => onToggle(value)}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition ${
                active
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-emerald-200'
              }`}
            >
              {active ? <Check className="w-4 h-4" /> : null}
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const normalizeValue = (value: string) => {
  const normalized = normalizePreferenceValues([value]);
  return (normalized[0] || '').toLowerCase();
};

const normalizeOptionList = (values: string[]) => {
  const normalized = normalizePreferenceValues(values);
  const seen = new Set<string>();
  return normalized.filter((value) => {
    const key = value.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export default function PreferenceModal({
  open,
  onClose,
  onSave,
  saving,
  initial,
  suggestedCategories: _suggestedCategories,
}: PreferenceModalProps) {
  const [categories, setCategories] = useState<string[]>(initial?.categories ?? []);
  const [productTypes, setProductTypes] = useState<string[]>(initial?.productTypes ?? []);
  const [brands, setBrands] = useState<string[]>(initial?.brands ?? []);
  const [activeTab, setActiveTab] = useState<'categories' | 'types' | 'brands'>('categories');
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [typeOptions, setTypeOptions] = useState<string[]>([]);
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [visibleCategoryCount, setVisibleCategoryCount] = useState(10);
  const [visibleTypeCount, setVisibleTypeCount] = useState(10);

  useEffect(() => {
    setCategories(initial?.categories ?? []);
    setProductTypes(initial?.productTypes ?? []);
    setBrands(initial?.brands ?? []);
  }, [initial?.brands, initial?.categories, initial?.productTypes]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const loadOptions = async () => {
      setOptionsLoading(true);
      try {
        const [catRes, brandRes, typeRes] = await Promise.all([
          fetch('/api/medusa/categories', { cache: 'no-store' }),
          fetch('/api/medusa/collections', { cache: 'no-store' }),
          fetch('/api/medusa/product-types', { cache: 'no-store' }),
        ]);
        const catData = catRes.ok ? await catRes.json().catch(() => ({})) : {};
        const brandData = brandRes.ok ? await brandRes.json().catch(() => ({})) : {};
        const typeData = typeRes.ok ? await typeRes.json().catch(() => ({})) : {};

        const cats = normalizeOptionList(
          (catData.categories || catData.product_categories || [])
            .map((item: { title?: string; name?: string; handle?: string }) =>
              item?.title || item?.name || item?.handle || ''
            )
        );
        const brandsList = normalizeOptionList(
          (brandData.collections || [])
            .map((item: { title?: string; handle?: string }) =>
              item?.title || item?.handle || ''
            )
        );
        const types = normalizeOptionList(
          (typeData.product_types || typeData.types || [])
            .map((item: { value?: string; handle?: string }) =>
              item?.value || item?.handle || ''
            )
        );

        if (!active) return;
        setCategoryOptions(cats);
        setBrandOptions(brandsList);
        setTypeOptions(types);
        setVisibleCategoryCount(10);
        setVisibleTypeCount(10);
      } catch (error) {
        console.warn('Failed to load preference options', error);
      } finally {
        if (active) setOptionsLoading(false);
      }
    };

    void loadOptions();
    return () => {
      active = false;
    };
  }, [open]);

  const toggleValue = (value: string, setter: Dispatch<SetStateAction<string[]>>) => {
    const normalized = normalizePreferenceValues([value]);
    const target = normalized[0];
    if (!target) return;
    setter((prev: string[]) => {
      const exists = prev.some((v: string) => v.toLowerCase() === target.toLowerCase());
      if (exists) return prev.filter((v: string) => v.toLowerCase() !== target.toLowerCase());
      return [...prev, target];
    });
  };

  const handleSave = async () => {
    const payload: PreferenceProfile = {
      categories,
      productTypes,
      brands,
      lastUpdated: new Date().toISOString(),
    };
    await onSave(payload);
    onClose();
  };

  const renderChosen = (selected: string[], setter: Dispatch<SetStateAction<string[]>>) => {
    if (!selected.length) {
      return <span className="text-sm text-gray-500">Nothing selected yet.</span>;
    }
    return selected.map((value) => (
      <span
        key={`chosen-${value}`}
        className="relative px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-sm font-medium"
      >
        {value}
        <button
          type="button"
          className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-emerald-600 text-white text-xs leading-none flex items-center justify-center"
          onClick={() => setter((prev) => prev.filter((item) => normalizeValue(item) !== normalizeValue(value)))}
          aria-label={`Remove ${value}`}
        >
          ×
        </button>
      </span>
    ));
  };

  const availableCategories = useMemo(() => {
    const selected = new Set(categories.map(normalizeValue));
    return categoryOptions.filter((value) => !selected.has(normalizeValue(value)));
  }, [categories, categoryOptions]);
  const visibleCategories = useMemo(
    () => availableCategories.slice(0, visibleCategoryCount),
    [availableCategories, visibleCategoryCount]
  );

  const availableTypes = useMemo(() => {
    const selected = new Set(productTypes.map(normalizeValue));
    return typeOptions.filter((value) => !selected.has(normalizeValue(value)));
  }, [productTypes, typeOptions]);
  const visibleTypes = useMemo(
    () => availableTypes.slice(0, visibleTypeCount),
    [availableTypes, visibleTypeCount]
  );

  const availableBrands = useMemo(() => {
    const selected = new Set(brands.map(normalizeValue));
    return brandOptions.filter((value) => !selected.has(normalizeValue(value)));
  }, [brands, brandOptions]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 via-white to-lime-50">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-emerald-600" />
              Curate your home feed
            </h3>
            <p className="text-sm text-gray-600">Tell us what you shop often so we show those first.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1 min-h-0">
          <div className="flex gap-2">
            {[
              { key: 'categories', label: 'Categories' },
              { key: 'types', label: 'Product types' },
              { key: 'brands', label: 'Brands' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`px-4 py-2 rounded-full text-sm font-semibold border transition ${
                  activeTab === tab.key
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-emerald-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'categories' ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">Chosen categories</p>
                <div className="mt-2 flex flex-wrap gap-2">{renderChosen(categories, setCategories)}</div>
              </div>
              {optionsLoading && !availableCategories.length ? (
                <div className="text-sm text-gray-500">Loading categories...</div>
              ) : null}
              {visibleCategories.length ? (
                <ChipGroup
                  label="Available categories"
                  values={visibleCategories}
                  selected={[]}
                  onToggle={(v) => toggleValue(v, setCategories)}
                />
              ) : null}
              {availableCategories.length > visibleCategories.length ? (
                <button
                  type="button"
                  onClick={() => setVisibleCategoryCount((prev) => prev + 10)}
                  className="group inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 active:scale-95"
                >
                  Show more
                  <ChevronDown className="h-4 w-4 transition-transform duration-200 group-hover:translate-y-0.5" />
                </button>
              ) : null}
              {!availableCategories.length && !optionsLoading ? (
                <div className="text-sm text-gray-500">No more categories to choose.</div>
              ) : null}
            </div>
          ) : null}

          {activeTab === 'types' ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">Chosen product types</p>
                <div className="mt-2 flex flex-wrap gap-2">{renderChosen(productTypes, setProductTypes)}</div>
              </div>
              {optionsLoading && !availableTypes.length ? (
                <div className="text-sm text-gray-500">Loading product types...</div>
              ) : null}
              {visibleTypes.length ? (
                <ChipGroup
                  label="Available product types"
                  values={visibleTypes}
                  selected={[]}
                  onToggle={(v) => toggleValue(v, setProductTypes)}
                />
              ) : null}
              {availableTypes.length > visibleTypes.length ? (
                <button
                  type="button"
                  onClick={() => setVisibleTypeCount((prev) => prev + 10)}
                  className="group inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 active:scale-95"
                >
                  Show more
                  <ChevronDown className="h-4 w-4 transition-transform duration-200 group-hover:translate-y-0.5" />
                </button>
              ) : null}
              {!availableTypes.length && !optionsLoading ? (
                <div className="text-sm text-gray-500">No more product types to choose.</div>
              ) : null}
            </div>
          ) : null}

          {activeTab === 'brands' ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">Chosen brands</p>
                <div className="mt-2 flex flex-wrap gap-2">{renderChosen(brands, setBrands)}</div>
              </div>
              {optionsLoading && !availableBrands.length ? (
                <div className="text-sm text-gray-500">Loading brands...</div>
              ) : null}
              {availableBrands.length ? (
                <ChipGroup
                  label="Available brands"
                  values={availableBrands}
                  selected={[]}
                  onToggle={(v) => toggleValue(v, setBrands)}
                />
              ) : null}
              {!availableBrands.length && !optionsLoading ? (
                <div className="text-sm text-gray-500">No more brands to choose.</div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-sm text-gray-700">
            {categories.length + productTypes.length + brands.length > 0
              ? `We will show picks from ${categories.length} categories, ${productTypes.length} product types, ${brands.length} brands.`
              : 'Select at least a couple of options to start tailoring your feed.'}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 bg-white"
              disabled={saving}
            >
              Maybe later
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || (!categories.length && !productTypes.length && !brands.length)}
              className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save & personalize'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
