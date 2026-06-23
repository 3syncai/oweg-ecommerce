"use client";

import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AccountHubIcon } from "@/components/ui/icons/account-hub";
import AccountLoginPrompt from "@/components/account/AccountLoginPrompt";
import { Button } from "@/components/ui/button";
import { useAccountSettings } from "@/hooks/useAccountSettings";
import { usePreferences } from "@/hooks/usePreferences";
import { useAuth } from "@/contexts/AuthProvider";
import { buildPreferenceSlug } from "@/lib/personalization";
import type { RecommendationSettings } from "@/lib/account-settings";
import { cn } from "@/lib/utils";

type PreferencesContentProps = {
  embedded?: boolean;
};

const normalizePrefList = (list: string[]) => {
  const seen = new Set<string>();
  return list.filter((item) => {
    const slug = buildPreferenceSlug(item);
    if (!slug || seen.has(slug)) return false;
    seen.add(slug);
    return true;
  });
};

const normalizeOptionList = (list: string[]) => {
  const cleaned = list
    .map((item) => (item || "").trim())
    .filter(Boolean);
  return normalizePrefList(cleaned);
};

const RECOMMENDATION_OPTIONS: Array<{
  key: keyof RecommendationSettings;
  label: string;
  description: string;
  icon: "recommendation-toggle" | "offer-alert" | "new-arrival";
}> = [
  {
    key: "personalizedRecommendations",
    label: "Personalized recommendations",
    description: "Show products tailored to your interests.",
    icon: "recommendation-toggle",
  },
  {
    key: "offerAlerts",
    label: "Offer alerts",
    description: "Get notified about deals on items you like.",
    icon: "offer-alert",
  },
  {
    key: "newArrivals",
    label: "New arrivals",
    description: "Hear about fresh products in your categories.",
    icon: "new-arrival",
  },
  {
    key: "similarProducts",
    label: "Similar products",
    description: "Discover alternatives to what you browse.",
    icon: "recommendation-toggle",
  },
];

export default function PreferencesContent({ embedded = false }: PreferencesContentProps) {
  const { customer } = useAuth();
  const { preferences, savePreferences, saving: savingPrefs, loading: prefsLoading } = usePreferences();
  const {
    accountSettings,
    saveAccountSettings,
    saving: savingSettings,
    loading: settingsLoading,
  } = useAccountSettings();

  const [prefCategories, setPrefCategories] = useState<string[]>([]);
  const [prefBrands, setPrefBrands] = useState<string[]>([]);
  const [prefTypes, setPrefTypes] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationSettings>(
    accountSettings.recommendations
  );

  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [visibleCategoryCount, setVisibleCategoryCount] = useState(10);
  const [visibleTypeCount, setVisibleTypeCount] = useState(10);

  useEffect(() => {
    if (!customer?.id) return;
    setPrefCategories(preferences?.categories || []);
    setPrefBrands(preferences?.brands || []);
    setPrefTypes(preferences?.productTypes || []);
  }, [customer?.id, preferences?.brands, preferences?.categories, preferences?.productTypes]);

  useEffect(() => {
    setRecommendations(accountSettings.recommendations);
  }, [accountSettings.recommendations]);

  useEffect(() => {
    let isActive = true;
    const loadOptions = async () => {
      setOptionsLoading(true);
      try {
        const [catRes, brandRes, typeRes] = await Promise.all([
          fetch("/api/medusa/categories", { cache: "no-store" }),
          fetch("/api/medusa/collections", { cache: "no-store" }),
          fetch("/api/medusa/product-types", { cache: "no-store" }),
        ]);

        const catData = catRes.ok ? await catRes.json().catch(() => ({})) : {};
        const brandData = brandRes.ok ? await brandRes.json().catch(() => ({})) : {};
        const typeData = typeRes.ok ? await typeRes.json().catch(() => ({})) : {};

        const cats = normalizeOptionList(
          (catData.categories || catData.product_categories || []).map(
            (item: { title?: string; name?: string; handle?: string }) =>
              item?.title || item?.name || item?.handle || ""
          )
        );
        const brands = normalizeOptionList(
          (brandData.collections || []).map(
            (item: { title?: string; handle?: string }) =>
              item?.title || item?.handle || ""
          )
        );
        const types = normalizeOptionList(
          (typeData.product_types || typeData.types || []).map(
            (item: { value?: string; handle?: string }) =>
              item?.value || item?.handle || ""
          )
        );

        if (!isActive) return;
        setAvailableCategories(cats);
        setAvailableBrands(brands);
        setAvailableTypes(types);
        setVisibleCategoryCount(10);
        setVisibleTypeCount(10);
      } catch (error) {
        console.warn("Failed to load preference options", error);
      } finally {
        if (isActive) setOptionsLoading(false);
      }
    };

    void loadOptions();
    return () => {
      isActive = false;
    };
  }, []);

  const togglePreference = (
    value: string,
    list: string[],
    setList: Dispatch<SetStateAction<string[]>>
  ) => {
    setList((prev) => {
      const has = prev.some((item) => buildPreferenceSlug(item) === buildPreferenceSlug(value));
      const next = has
        ? prev.filter((item) => buildPreferenceSlug(item) !== buildPreferenceSlug(value))
        : [...prev, value];
      return normalizePrefList(next);
    });
  };

  const removePreference = (
    value: string,
    setList: Dispatch<SetStateAction<string[]>>
  ) => {
    setList((prev) =>
      prev.filter((item) => buildPreferenceSlug(item) !== buildPreferenceSlug(value))
    );
  };

  const toggleRecommendation = (key: keyof RecommendationSettings) => {
    setRecommendations((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    try {
      await savePreferences({
        categories: prefCategories,
        brands: prefBrands,
        productTypes: prefTypes,
      });
      await saveAccountSettings({
        ...accountSettings,
        recommendations,
        lastUpdated: new Date().toISOString(),
      });
      toast.success("Preferences saved.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save preferences.";
      toast.error(message);
    }
  };

  const saving = savingPrefs || savingSettings;
  const loading = prefsLoading || settingsLoading;
  const canSave = !loading && !saving;

  if (!customer) {
    return (
      <AccountLoginPrompt
        redirect="/account/preferences"
        title="Sign in to manage preferences"
        description="Please log in to personalize categories, brands, and recommendations."
      />
    );
  }

  const wrapperClass = embedded ? "space-y-5" : "mx-auto max-w-5xl space-y-6 px-4 py-10";

  return (
    <div className={wrapperClass}>
      {!embedded ? (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF8E7]">
            <AccountHubIcon name="preferences" size={22} className="h-[22px] w-[22px]" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-[#1F2A33]">Your Preferences</h1>
            <p className="text-sm text-gray-600">Choose what you love and how we recommend.</p>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:p-6">
        <div className="mb-4 flex items-center gap-2">
          <AccountHubIcon name="category-chip" size={20} className="h-5 w-5" />
          <h3 className="text-base font-semibold text-[#1F2A33]">Shopping interests</h3>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your preferences…
          </div>
        ) : null}

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Chosen</p>
            <div className="flex flex-wrap gap-2">
              {normalizePrefList([...prefCategories, ...prefBrands, ...prefTypes]).length === 0 ? (
                <span className="text-sm text-gray-500">No preferences selected yet.</span>
              ) : null}
              {prefCategories.map((item) => (
                <span
                  key={`cat-${buildPreferenceSlug(item)}`}
                  className="relative rounded-full bg-[#EAF8E7] px-3 py-1.5 text-sm font-medium text-[#66C940]"
                >
                  {item}
                  <button
                    type="button"
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#66C940] text-xs leading-none text-white"
                    onClick={() => removePreference(item, setPrefCategories)}
                    aria-label={`Remove ${item}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {prefBrands.map((item) => (
                <span
                  key={`brand-${buildPreferenceSlug(item)}`}
                  className="relative rounded-full bg-[#EAF8E7] px-3 py-1.5 text-sm font-medium text-[#66C940]"
                >
                  {item}
                  <button
                    type="button"
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#66C940] text-xs leading-none text-white"
                    onClick={() => removePreference(item, setPrefBrands)}
                    aria-label={`Remove ${item}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {prefTypes.map((item) => (
                <span
                  key={`type-${buildPreferenceSlug(item)}`}
                  className="relative rounded-full bg-[#EAF8E7] px-3 py-1.5 text-sm font-medium text-[#66C940]"
                >
                  {item}
                  <button
                    type="button"
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#66C940] text-xs leading-none text-white"
                    onClick={() => removePreference(item, setPrefTypes)}
                    aria-label={`Remove ${item}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">Categories</p>
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const chosen = new Set(prefCategories.map((value) => buildPreferenceSlug(value)));
                  const options = availableCategories.filter(
                    (item) => !chosen.has(buildPreferenceSlug(item))
                  );
                  const visible = options.slice(0, visibleCategoryCount);
                  if (options.length === 0) {
                    return (
                      <span className="text-sm text-gray-500">
                        {optionsLoading ? "Loading categories…" : "No more categories to choose."}
                      </span>
                    );
                  }
                  return (
                    <>
                      {visible.map((item) => (
                        <button
                          key={`opt-cat-${buildPreferenceSlug(item)}`}
                          type="button"
                          onClick={() => togglePreference(item, prefCategories, setPrefCategories)}
                          className="rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:border-[#66C940]"
                        >
                          {item}
                        </button>
                      ))}
                      {options.length > visible.length ? (
                        <button
                          type="button"
                          onClick={() => setVisibleCategoryCount((prev) => prev + 10)}
                          className="group flex items-center gap-1 rounded-full border border-[#66C940]/30 bg-[#EAF8E7] px-3 py-1.5 text-sm font-semibold text-[#66C940] transition hover:bg-[#dff5d8]"
                        >
                          Show more
                          <ChevronDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
                        </button>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">Brands</p>
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const chosen = new Set(prefBrands.map((value) => buildPreferenceSlug(value)));
                  const options = availableBrands.filter(
                    (item) => !chosen.has(buildPreferenceSlug(item))
                  );
                  if (options.length === 0) {
                    return (
                      <span className="text-sm text-gray-500">
                        {optionsLoading ? "Loading brands…" : "No more brands to choose."}
                      </span>
                    );
                  }
                  return options.map((item) => (
                    <button
                      key={`opt-brand-${buildPreferenceSlug(item)}`}
                      type="button"
                      onClick={() => togglePreference(item, prefBrands, setPrefBrands)}
                      className="rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:border-[#66C940]"
                    >
                      {item}
                    </button>
                  ));
                })()}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">Product types</p>
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const chosen = new Set(prefTypes.map((value) => buildPreferenceSlug(value)));
                  const options = availableTypes.filter(
                    (item) => !chosen.has(buildPreferenceSlug(item))
                  );
                  const visible = options.slice(0, visibleTypeCount);
                  if (options.length === 0) {
                    return (
                      <span className="text-sm text-gray-500">
                        {optionsLoading ? "Loading product types…" : "No more product types to choose."}
                      </span>
                    );
                  }
                  return (
                    <>
                      {visible.map((item) => (
                        <button
                          key={`opt-type-${buildPreferenceSlug(item)}`}
                          type="button"
                          onClick={() => togglePreference(item, prefTypes, setPrefTypes)}
                          className="rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:border-[#66C940]"
                        >
                          {item}
                        </button>
                      ))}
                      {options.length > visible.length ? (
                        <button
                          type="button"
                          onClick={() => setVisibleTypeCount((prev) => prev + 10)}
                          className="group flex items-center gap-1 rounded-full border border-[#66C940]/30 bg-[#EAF8E7] px-3 py-1.5 text-sm font-semibold text-[#66C940] transition hover:bg-[#dff5d8]"
                        >
                          Show more
                          <ChevronDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
                        </button>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:p-6">
        <div className="mb-4 flex items-center gap-2">
          <AccountHubIcon name="brand-follow" size={20} className="h-5 w-5" />
          <h3 className="text-base font-semibold text-[#1F2A33]">Recommendations</h3>
        </div>

        <div className="space-y-3">
          {RECOMMENDATION_OPTIONS.map((option) => {
            const enabled = recommendations[option.key];
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => toggleRecommendation(option.key)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-4 text-left transition",
                  enabled
                    ? "border-[#66C940] bg-[#EAF8E7]"
                    : "border-gray-200 bg-white hover:border-[#66C940]/40"
                )}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white">
                  <AccountHubIcon name={option.icon} size={20} className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[#1F2A33]">{option.label}</p>
                  <p className="text-sm text-gray-500">{option.description}</p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    enabled ? "bg-[#66C940] text-white" : "bg-gray-100 text-gray-600"
                  )}
                >
                  {enabled ? "On" : "Off"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Button
        type="button"
        className="w-full rounded-full bg-[#66C940] text-white hover:bg-[#5ab838] sm:w-auto"
        onClick={() => {
          void handleSave();
        }}
        disabled={!canSave}
      >
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving…
          </>
        ) : (
          "Save Preferences"
        )}
      </Button>
    </div>
  );
}
