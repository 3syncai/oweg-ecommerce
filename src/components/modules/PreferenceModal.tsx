'use client';

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
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

const defaultCategoryOptions = [
  'Clothing',
  'Beauty & Personal Care',
  'Mobile Accessories',
  'Jewellery',
  'Home Decor',
  'Hardware',
  'Kitchen Appliances',
  'Home Appliances',
];

const defaultTypeOptions = [
  'Home Decor',
  'Generic',
  'Hardware',
  'Clothing',
  'Jewellery',
  'Kitchen Essentials',
  'Smart Home',
  'Accessories',
];

const defaultBrandOptions = ['Samsung', 'Apple', 'Boat', 'Philips', 'Prestige', 'Usha', 'Generic', 'MI'];

export default function PreferenceModal({
  open,
  onClose,
  onSave,
  saving,
  initial,
  suggestedCategories,
}: PreferenceModalProps) {
  const [categories, setCategories] = useState<string[]>(initial?.categories ?? []);
  const [productTypes, setProductTypes] = useState<string[]>(initial?.productTypes ?? []);
  const [brands, setBrands] = useState<string[]>(initial?.brands ?? []);
  const [customInput, setCustomInput] = useState('');
  const [activeTab, setActiveTab] = useState<'categories' | 'types' | 'brands'>('categories');

  useEffect(() => {
    setCategories(initial?.categories ?? []);
    setProductTypes(initial?.productTypes ?? []);
    setBrands(initial?.brands ?? []);
  }, [initial?.brands, initial?.categories, initial?.productTypes]);

  const categoryOptions = useMemo(() => {
    const combined = [...defaultCategoryOptions, ...(suggestedCategories || [])];
    const normalized = normalizePreferenceValues(combined);
    return normalized.map((item) => item);
  }, [suggestedCategories]);

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

  const handleAddCustom = () => {
    const normalized = normalizePreferenceValues([customInput]);
    if (!normalized.length) return;
    const value = normalized[0];
    if (activeTab === 'categories') {
      toggleValue(value, setCategories);
    } else if (activeTab === 'types') {
      toggleValue(value, setProductTypes);
    } else {
      toggleValue(value, setBrands);
    }
    setCustomInput('');
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 via-white to-lime-50">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-600">Personalize</p>
            <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-600" />
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

        <div className="px-6 py-5 space-y-5">
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
            <ChipGroup
              label="Pick the categories you browse the most"
              values={categoryOptions}
              selected={categories}
              onToggle={(v) => toggleValue(v, setCategories)}
            />
          ) : null}

          {activeTab === 'types' ? (
            <ChipGroup
              label="Pick the product types you enjoy"
              values={defaultTypeOptions}
              selected={productTypes}
              onToggle={(v) => toggleValue(v, setProductTypes)}
            />
          ) : null}

          {activeTab === 'brands' ? (
            <ChipGroup
              label="Pick brands that feel right"
              values={defaultBrandOptions}
              selected={brands}
              onToggle={(v) => toggleValue(v, setBrands)}
            />
          ) : null}

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="Add your own (e.g., Kitchen Essentials, Philips)"
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustom();
                }
              }}
            />
            <button
              type="button"
              onClick={handleAddCustom}
              className="px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold shadow hover:bg-gray-800 transition"
            >
              Add
            </button>
          </div>
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
