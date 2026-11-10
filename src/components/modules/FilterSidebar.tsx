"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ChevronDown, ChevronRight, Tag, X } from "lucide-react";
import { CategoryLink } from "@/components/modules/CategoryNavigation";
import type { MedusaCategory } from "@/services/medusa";
import { parseCategoryPrice, type CategoryFilters } from "@/lib/category-filters";
import styles from "./FilterSidebar.module.css";

const priceRanges = [
  { label: "Under ₹1,000", min: 0, max: 1000 },
  { label: "₹1,000–₹5,000", min: 1000, max: 5000 },
  { label: "₹5,000–₹10,000", min: 5000, max: 10000 },
  { label: "₹10,000–₹20,000", min: 10000, max: 20000 },
  { label: "Over ₹20,000", min: 20000, max: undefined },
];

type FilterProps = {
  categoryHandle: string;
  subcategories: MedusaCategory[];
  selectedSubcategory?: string;
  filters: CategoryFilters;
  onFilterChange: (next: Partial<CategoryFilters>) => void;
  brandOptions: string[];
  dealCount: number;
};

function FilterOptions({ categoryHandle, subcategories, selectedSubcategory, filters, onFilterChange, brandOptions, dealCount, onApply, onClose, headingId }: FilterProps & {
  onApply?: (next: CategoryFilters) => void;
  onClose?: () => void;
  headingId?: string;
}) {
  const [brandSearch, setBrandSearch] = useState("");
  const [subcategorySearch, setSubcategorySearch] = useState("");
  const [minInput, setMinInput] = useState(String(filters.priceMin ?? ""));
  const [maxInput, setMaxInput] = useState(String(filters.priceMax ?? ""));
  const [priceError, setPriceError] = useState("");
  const errorId = useId();
  const priceDetails = useRef<HTMLDetailsElement>(null);
  const minField = useRef<HTMLInputElement>(null);
  const maxField = useRef<HTMLInputElement>(null);

  const priceActive = filters.priceMin !== undefined || filters.priceMax !== undefined;
  const hasFilters = priceActive || filters.brands.length > 0 || filters.dealsOnly;
  const allBrands = new Map(brandOptions.map(label => [label.toLowerCase(), label]));
  filters.brands.forEach(brand => { if (!allBrands.has(brand)) allBrands.set(brand, brand); });
  const matchingBrands = [...allBrands].filter(([key]) => key.includes(brandSearch.trim().toLowerCase()));
  const matchingSubcategories = subcategories.filter(category =>
    (category.title || category.name || "").toLowerCase().includes(subcategorySearch.trim().toLowerCase()));

  useEffect(() => {
    setMinInput(String(filters.priceMin ?? ""));
    setMaxInput(String(filters.priceMax ?? ""));
    setPriceError("");
  }, [filters.priceMin, filters.priceMax]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const priceMin = parseCategoryPrice(minInput);
    const priceMax = parseCategoryPrice(maxInput);
    const invalidMin = minField.current?.validity.badInput || (minInput.trim() && priceMin === undefined);
    const invalidMax = maxField.current?.validity.badInput || (maxInput.trim() && priceMax === undefined);
    const reversed = priceMin !== undefined && priceMax !== undefined && priceMin > priceMax;
    if (invalidMin || invalidMax || reversed) {
      setPriceError(reversed ? "The minimum price must be lower than or equal to the maximum." : "Enter a valid price of ₹0 or more.");
      if (priceDetails.current) priceDetails.current.open = true;
      (invalidMax && !invalidMin ? maxField : minField).current?.focus();
      return;
    }
    if (onApply) onApply({ ...filters, priceMin, priceMax });
    else onFilterChange({ priceMin, priceMax });
  }

  return (
    <form className={styles.editor} onSubmit={submit} noValidate>
      <div className={styles.header}>
        <h2 id={headingId}>Filters</h2>
        <button type="button" className={styles.reset}
          disabled={!hasFilters && !minInput && !maxInput}
          onClick={() => {
            setMinInput(""); setMaxInput(""); setPriceError("");
            onFilterChange({ priceMin: undefined, priceMax: undefined, brands: [], dealsOnly: false });
          }}>Clear all</button>
        {onClose && <button type="button" className={styles.close} aria-label="Close filters" onClick={onClose}>
          <X size={19} aria-hidden="true" />
        </button>}
      </div>
      <div className={styles.sections}>
        <details ref={priceDetails} open>
          <summary><span>Price {priceActive && <small>Selected</small>}</span><ChevronDown size={16} aria-hidden="true" /></summary>
          <div className={styles.body}>
            <div className={styles.ranges} role="group" aria-label="Price ranges">
              {priceRanges.map(range => (
                <button key={range.label} type="button"
                  aria-pressed={filters.priceMin === range.min && filters.priceMax === range.max}
                  onClick={() => {
                    setMinInput(String(range.min)); setMaxInput(String(range.max ?? "")); setPriceError("");
                    onFilterChange({ priceMin: range.min, priceMax: range.max });
                  }}>{range.label}</button>
              ))}
            </div>
            <div className={styles.priceFields}>
              <label>Min price (₹)<input ref={minField} type="number" inputMode="decimal" min={0} step="any" value={minInput}
                aria-invalid={!!priceError} aria-describedby={priceError ? errorId : undefined}
                onChange={event => { setMinInput(event.target.value); setPriceError(""); }} /></label>
              <label>Max price (₹)<input ref={maxField} type="number" inputMode="decimal" min={0} step="any" value={maxInput}
                aria-invalid={!!priceError} aria-describedby={priceError ? errorId : undefined}
                onChange={event => { setMaxInput(event.target.value); setPriceError(""); }} /></label>
            </div>
            {priceError && <p id={errorId} className={styles.error} role="alert">{priceError}</p>}
            {!onApply && <button type="submit" className={styles.setRange}>Set price range</button>}
          </div>
        </details>

        <details>
          <summary><span>Brand {filters.brands.length > 0 && <small>{filters.brands.length} selected</small>}</span><ChevronDown size={16} aria-hidden="true" /></summary>
          <div className={styles.body}>
            {allBrands.size > 6 && <input type="search" aria-label="Search brands" placeholder="Search brands" value={brandSearch} onChange={event => setBrandSearch(event.target.value)} />}
            {matchingBrands.length ? <div className={styles.choices}>
              {matchingBrands.map(([key, label]) => {
                const checked = filters.brands.includes(key);
                return <label key={key} className={styles.choice}>
                  <input type="checkbox" checked={checked} disabled={!checked && filters.brands.length >= 20}
                    onChange={() => onFilterChange({ brands: checked ? filters.brands.filter(brand => brand !== key) : [...filters.brands, key] })} />
                  <span>{label}</span>
                </label>;
              })}
            </div> : <p className={styles.hint}>{brandSearch ? "No brands match your search." : "No brands available."}</p>}
          </div>
        </details>

        <label className={styles.deal}>
          <Tag size={17} aria-hidden="true" />
          <span>Today’s deals{dealCount > 0 && <small>{dealCount} available</small>}</span>
          <input type="checkbox" checked={filters.dealsOnly} onChange={event => onFilterChange({ dealsOnly: event.target.checked })} />
        </label>

        {subcategories.length > 0 && <details>
          <summary><span>Browse subcategories</span><ChevronDown size={16} aria-hidden="true" /></summary>
          <div className={styles.body}>
            {subcategories.length > 6 && <input type="search" aria-label="Search subcategories" placeholder="Search subcategories"
              value={subcategorySearch} onChange={event => setSubcategorySearch(event.target.value)} />}
            {matchingSubcategories.length ? <ul className={styles.choices}>
              {matchingSubcategories.map(category => {
                const handle = category.handle || category.id;
                return <li key={category.id}><CategoryLink href={`/c/${categoryHandle}/${encodeURIComponent(handle)}`}
                  prefetch={false} aria-current={selectedSubcategory === handle ? "page" : undefined} onClick={onClose}>
                  {category.title || category.name || "Category"} <ChevronRight size={15} aria-hidden="true" />
                </CategoryLink></li>;
              })}
            </ul> : <p className={styles.hint}>No subcategories match your search.</p>}
          </div>
        </details>}
      </div>
      {onApply && <div className={styles.footer}>
        <button type="submit" className={styles.apply}>Apply filters</button>
      </div>}
    </form>
  );
}

export function FilterSidebar(props: FilterProps) {
  return <FilterOptions {...props} />;
}

export function CategoryFilterDialog({ onClose, onApply, ...props }: FilterProps & {
  onClose: () => void;
  onApply: (next: CategoryFilters) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const trigger = document.activeElement;
    node.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      node.close();
      document.body.style.overflow = overflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialog} className={styles.sheet} aria-labelledby={title}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <FilterOptions {...props} headingId={title} onClose={onClose} onApply={onApply} />
  </dialog>;
}
