"use client";

import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Heart,
  Home,
  Mail,
  Facebook,
  Twitter,
  Instagram,
  Linkedin,
  LogOut,
  MapPin,
  Phone,
  ShoppingBag,
  Store,
  User,
  X,
  ChevronsLeft,
  Gift,
  Trophy,
  Tag,
  FileText,
  RefreshCw,
  Truck,
  Percent,
  Lock,
  Info,
  HelpCircle,
  Users,
} from "lucide-react";
import type { MedusaCategory } from "@/lib/medusa";
import { useAuth } from "@/contexts/AuthProvider";
import { getOriginalImageUrl } from "@/lib/image-utils";
import { usePreferences } from "@/hooks/usePreferences";
import { buildPreferenceSlug } from "@/lib/personalization";
import { getSubcategoryIcon } from "@/components/mobile/categoryIcons";
import { buildLoginUrl, buildSignupUrl } from "@/lib/auth-redirect";

type MobileCategory = {
  id: string;
  title: string;
  handle?: string;
  image?: string;
  children?: MobileCategory[];
};

type ProductLike = {
  id?: string | number;
  handle?: string | number;
  title?: string;
  name?: string;
  image?: string;
  thumbnail?: string;
  images?: Array<{ url?: string | null } | string | null> | null;
  variants?: Array<{ thumbnail?: string | null } | null> | null;
  metadata?: Record<string, unknown> | null;
  price?: number;
  mrp?: number;
  discount?: number;
  tags?: Array<{ value?: string; handle?: string } | string>;
  collection?: { title?: string | null; handle?: string | null };
};

const normalizeCategoryKey = (title?: string) =>
  (title || "")
    .toString()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");

const categoryImageMap: Record<string, string> = {
  "home-appliances": "/Home Appliances.png",
  "kitchen-appliances": "/Kitchen Appliances.png",
  "beauty-personal-care": "/beauty-personal-care.png",
  "computer-mobile": "/Computer & Mobile v1.png",
  "computer-mobile-accessories": "/Computer & Mobile v1.png",
  "mobile-accessories": "/Computer & Mobile v1.png",
  hardware: "/Hardwear-01.png",
  "hard-wear": "/Hardwear-01.png",
  bags: "/Bags-01.png",
  clothing: "/Clothing-01.png",
  "security-surveillance": "/security & surveillance.png",
  "surveillance-security": "/security & surveillance.png",
  "toys-and-games": "/Toysandgames.png",
  jewellery: "/Jewellery.png",
  umbrella: "/Umbrella.png",
  "health-care": "/Sassiest-Health-Care.png",
  health: "/Sassiest-Health-Care.png",
  stationery: "/Stationery.png",
  stationary: "/Stationery.png",
};

const customSubcategoryImages: Record<string, string> = {
  "home-decor": "/Home_Decor.jpg",
  mop: "/Mop.jpg",
  "lunch-box": "/Lunch_Box.jpg",
  "led-bulbs": "/Led_Bulbs.jpg",
  "led-lamps-torches": "/Led_Lamps_&_Torches.jpg",
  "led-lamps-and-torches": "/Led_Lamps_&_Torches.jpg",
  "bottles-flasks": "/Bottles_&_Flasks.jpg",
  "bottles-and-flasks": "/Bottles_&_Flasks.jpg",
  "water-pumps": "/Water_Pumps.png",
  "air-coolers": "/Air_Coolers.jpg",
  "ceiling-fans": "/Ceiling_Fans.jpg",
  choppers: "/Choppers.png",
  "cutlery-sets": "/Cutlery_Sets.jpg",
  "electric-plug": "/Electric_Plug.jpg",
  "hose-pipes": "/Hose_Pipes.jpg",
  "immersion-rods": "/Immersion_Rods.jpg",
  "inverter-and-battery": "/Inverter_&_Battery.jpg",
  iron: "/Iron.jpg",
  "room-heater": "/Room_Heater.jpg",
  "table-fans": "/Table_Fans.jpg",
  tape: "/Tape.jpg",
  tubelights: "/Tubelights.jpg",
  "water-heaters-and-geysers": "/Water_Heaters_&_Geysers.jpg",
  kettles: "/Kettles.jpg",
};

const categoryImageKeywords: Array<{ image: string; includes: string[] }> = [
  { image: "/Home Appliances.png", includes: ["home", "appliance"] },
  { image: "/Kitchen Appliances.png", includes: ["kitchen", "appliance"] },
  { image: "/beauty-personal-care.png", includes: ["beauty"] },
  { image: "/beauty-personal-care.png", includes: ["personal", "care"] },
  { image: "/Computer & Mobile v1.png", includes: ["computer"] },
  { image: "/Computer & Mobile v1.png", includes: ["mobile"] },
  { image: "/Hardwear-01.png", includes: ["hardware"] },
  { image: "/Hardwear-01.png", includes: ["hard", "wear"] },
  { image: "/Bags-01.png", includes: ["bag"] },
  { image: "/Clothing-01.png", includes: ["cloth"] },
  { image: "/security & surveillance.png", includes: ["security"] },
  { image: "/security & surveillance.png", includes: ["surveillance"] },
  {
    image: "/security & surveillance.png",
    includes: ["surveillance", "security"],
  },
  { image: "/Toysandgames.png", includes: ["toy"] },
  { image: "/Toysandgames.png", includes: ["game"] },
  { image: "/Jewellery.png", includes: ["jewel"] },
  { image: "/Umbrella.png", includes: ["umbrella"] },
  { image: "/Sassiest-Health-Care.png", includes: ["health"] },
  { image: "/Stationery.png", includes: ["stationery"] },
  { image: "/Stationery.png", includes: ["stationary"] },
  { image: "/Computer & Mobile v1.png", includes: ["mobile", "accessor"] },
  { image: "/Computer & Mobile v1.png", includes: ["computer", "accessor"] },
];

const accountLinks = [
  { label: "Brands", href: "/brands" },
  { label: "Gift Card", href: "/gift-card" },
  { label: "My Reward", href: "/my-reward" },
  { label: "My Wishlist", href: "/wishlist" },
];

const policyLinks = [
  { label: "Terms & Conditions", href: "/terms" },
  { label: "Returns Policy", href: "/returns-policy" },
  { label: "Shipping Policy", href: "/shipping-policy" },
  { label: "Coupon Code Policy", href: "/coupon-policy" },
  { label: "Reward", href: "/reward-policy" },
  { label: "Privacy Policy", href: "/privacy-policy" },
];

const quickLinks = [
  { label: "About Us", href: "/about" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
  { label: "Seller Registration", href: "/seller-registration" },
  { label: "Agent Registration", href: "/agent-registration" },
];

const buildCategoryList = (data?: unknown): MobileCategory[] => {
  const raw: MedusaCategory[] = Array.isArray(
    (data as { categories?: MedusaCategory[] })?.categories,
  )
    ? ((data as { categories?: MedusaCategory[] })
        .categories as MedusaCategory[])
    : [];
  return raw.map((cat, idx) => {
    const baseId = cat.id || cat.handle || cat.title || `cat-${idx}`;
    return {
      id: baseId,
      title: (cat.title || cat.name || "Category").toString(),
      handle: cat.handle || undefined,
      image:
        (
          cat as MedusaCategory & {
            metadata?: { thumbnail?: string; image?: string };
          }
        ).metadata?.thumbnail ||
        (
          cat as MedusaCategory & {
            metadata?: { thumbnail?: string; image?: string };
          }
        ).metadata?.image ||
        undefined,
      children: Array.isArray(cat.category_children)
        ? cat.category_children.map((child, cIdx) => ({
            id:
              child.id ||
              child.handle ||
              child.title ||
              `${baseId}-child-${cIdx}`,
            title: (child.title || child.name || "Category").toString(),
            handle: child.handle || undefined,
          }))
        : [],
    };
  });
};

type InlineProduct = {
  id: string;
  name: string;
  image?: string;
  price?: number;
  mrp?: number;
  discount?: number;
  brand?: string;
};

const resolveProductImage = (p: ProductLike): string => {
  const candidates: Array<string | undefined | null> = [];
  candidates.push(p?.image);
  candidates.push(p?.thumbnail);
  if (Array.isArray(p?.images)) {
    p.images.forEach((img) => {
      if (!img) return;
      if (typeof img === "string") {
        candidates.push(img);
        return;
      }
      candidates.push(
        (img as { url?: string | null; original_url?: string | null })
          .original_url,
      );
      const urlVal = (img as { url?: string | null }).url;
      if (typeof urlVal === "string") candidates.push(urlVal);
    });
  }
  if (Array.isArray(p?.variants)) {
    p.variants.forEach((v) => {
      if (!v) return;
      candidates.push((v as { thumbnail?: string | null }).thumbnail);
      if (
        Array.isArray(
          (
            v as {
              images?: Array<{
                url?: string | null;
                original_url?: string | null;
              } | null> | null;
            }
          ).images,
        )
      ) {
        (
          v as {
            images?: Array<{
              url?: string | null;
              original_url?: string | null;
            } | null> | null;
          }
        ).images!.forEach((img) => {
          if (!img) return;
          candidates.push(img.original_url);
          const urlVal = (img as { url?: string | null }).url;
          if (typeof urlVal === "string") candidates.push(urlVal);
        });
      }
    });
  }
  const meta = (p?.metadata || {}) as Record<string, unknown>;
  ["image", "thumbnail", "img", "picture", "photo", "image_url", "url"].forEach(
    (key) => {
      const val = meta[key] as string | undefined;
      if (typeof val === "string") candidates.push(val);
    },
  );
  const metaImages = meta.images;
  if (Array.isArray(metaImages)) {
    metaImages.forEach((item) => {
      if (typeof item === "string") candidates.push(item);
      if (item && typeof item === "object" && "url" in item) {
        candidates.push((item as { url?: string }).url);
      }
    });
  }

  const pick =
    candidates.find((c) => typeof c === "string" && c.trim().length > 0) || "";
  if (!pick) return "/oweg_logo.png";
  const normalized = getOriginalImageUrl(pick.trim());
  if (normalized.startsWith("http://") || normalized.startsWith("https://"))
    return normalized;
  if (normalized.startsWith("/")) {
    if (typeof window !== "undefined") {
      return new URL(normalized, window.location.origin).href;
    }
  }
  return normalized || "/oweg_logo.png";
};

const resolveCategoryImage = (src?: string): string => {
  if (!src) return "/oweg_logo.png";
  const normalized = getOriginalImageUrl(src);
  if (normalized.startsWith("http://") || normalized.startsWith("https://"))
    return normalized;
  if (normalized.startsWith("/")) {
    if (typeof window !== "undefined") {
      return new URL(normalized, window.location.origin).href;
    }
  }
  return normalized || "/oweg_logo.png";
};

const getCategoryDisplayImage = (cat: MobileCategory): string => {
  const key = normalizeCategoryKey(cat.title);
  const handleKey = normalizeCategoryKey(cat.handle);

  const custom =
    customSubcategoryImages[handleKey] || customSubcategoryImages[key];
  if (custom) return resolveCategoryImage(custom);

  const mapped =
    categoryImageMap[handleKey] ||
    categoryImageMap[key] ||
    categoryImageMap[cat.handle || ""];
  if (mapped) return resolveCategoryImage(mapped);

  const normalizedTitle = key;
  const normalizedHandle = normalizeCategoryKey(cat.handle);
  const tokens = `${normalizedTitle} ${normalizedHandle}`
    .split("-")
    .filter(Boolean);

  const keywordHit = categoryImageKeywords.find(({ includes }) =>
    includes.every((kw) => tokens.some((t) => t.includes(kw))),
  );
  if (keywordHit) return resolveCategoryImage(keywordHit.image);

  if (cat.image) return resolveCategoryImage(cat.image);
  return "/oweg_logo.png";
};

const getProductBrand = (p: ProductLike): string => {
  const meta = (p.metadata || {}) as Record<string, unknown>;
  const brand =
    (meta.brand as string | undefined) ||
    (meta.Brand as string | undefined) ||
    (meta.brand_name as string | undefined) ||
    (meta.BrandName as string | undefined) ||
    (meta.manufacturer as string | undefined) ||
    (meta.maker as string | undefined) ||
    (p.collection?.title as string | undefined) ||
    (p.collection?.handle as string | undefined);
  if (typeof brand === "string" && brand.trim()) return brand.trim();
  const tagBrand = Array.isArray(p.tags)
    ? p.tags
        .map((t) => (typeof t === "string" ? t : t?.value || t?.handle || ""))
        .map((s) => s.trim())
        .find((s) => s.length > 0)
    : "";
  if (tagBrand) return tagBrand;
  return "";
};

const formatCurrency = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `₹${Math.round(value)}`;
  }
};

const Overlay = ({
  open,
  onClose,
  children,
  scrollable = true,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  scrollable?: boolean;
}) => (
  <div
    className={`fixed inset-0 z-[110] md:hidden transition-opacity duration-200 ${
      open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
    }`}
    onClick={onClose}
  >
    <div
      className={`absolute inset-x-0 top-0 bottom-0 bg-white transition-transform duration-200 ${
        open ? "translate-y-0" : "translate-y-full"
      } shadow-[0_-6px_30px_-20px_rgba(0,0,0,0.35)] border-t border-gray-100 overflow-hidden`}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={`h-full ${scrollable ? "overflow-y-auto" : "overflow-hidden"} px-4 pt-14 pb-[calc(env(safe-area-inset-bottom,0px)+160px)]`}
      >
        {children}
      </div>
    </div>
  </div>
);

export default function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { customer, logout } = useAuth();
  const [storedPincode, setStoredPincode] = useState("");
  const resetPanels = useCallback(() => {
    setCategoryOpen(false);
    setProfileOpen(false);
  }, []);
  const wishlistCount = useMemo(() => {
    const list = (customer?.metadata as Record<string, unknown> | undefined)
      ?.wishlist;
    if (Array.isArray(list)) return list.length;
    return 0;
  }, [customer?.metadata]);
  const { data: categoryData, isLoading: categoriesLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await fetch("/api/medusa/categories", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Unable to load categories");
      }
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
  });
  const categories = useMemo(
    () => buildCategoryList(categoryData),
    [categoryData],
  );
  const { preferences, hasPreferences } = usePreferences();
  const categoryHandleBySlug = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((cat) => {
      const slug = normalizeCategoryKey(cat.title);
      if (slug) map[slug] = cat.handle || slug;
    });
    return map;
  }, [categories]);
  const forYouItems = useMemo(() => {
    const items: Array<{
      label: string;
      query: { tag?: string; type?: string; category?: string; limit?: number };
    }> = [];
    preferences?.categories.forEach((cat) => {
      const slug = buildPreferenceSlug(cat);
      const handle = categoryHandleBySlug[slug] || slug;
      items.push({ label: cat, query: { category: handle, limit: 12 } });
    });
    preferences?.productTypes.forEach((type) => {
      items.push({ label: type, query: { type, limit: 12 } });
    });
    preferences?.brands.forEach((brand) => {
      items.push({ label: brand, query: { tag: brand, limit: 12 } });
    });
    return items.slice(0, 12);
  }, [preferences, categoryHandleBySlug]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [selectedSubcategory, setSelectedSubcategory] =
    useState<MobileCategory | null>(null);
  const [subProducts, setSubProducts] = useState<InlineProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<MobileCategory | null>(
    null,
  );
  const [priceSort, setPriceSort] = useState<"none" | "asc" | "desc">("none");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [sidebarOverlayOpen, setSidebarOverlayOpen] = useState(false);
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);
  const lastCategoryIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedSubcategory) {
      setIsOpen(false);
      setSidebarOverlayOpen(false);
    }
  }, [selectedSubcategory]);
  useEffect(() => {
    if (!categoryOpen) return;
    setIsOpen(false);
    setSidebarOverlayOpen(false);
    setExpandedCatId(null);
  }, [categoryOpen]);
  useEffect(() => {
    if (!sidebarOverlayOpen) return;
    if (!selectedCategoryId) return;
    if (expandedCatId !== selectedCategoryId) {
      setExpandedCatId(selectedCategoryId);
    }
  }, [sidebarOverlayOpen, selectedCategoryId, expandedCatId]);
  useEffect(() => {
    if (!sidebarOverlayOpen) return;
    if (!selectedCategoryId) return;
    if (selectedCategoryId !== lastCategoryIdRef.current) {
      setIsOpen(false);
      setSidebarOverlayOpen(false);
      lastCategoryIdRef.current = selectedCategoryId;
    }
  }, [selectedCategoryId, sidebarOverlayOpen]);
  const closeCategory = () => {
    setCategoryOpen(false);
    setActiveCategory(null);
    setSearchTerm("");
  };
  const closeProfile = () => setProfileOpen(false);
  const overlayOpen = categoryOpen || profileOpen;
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = overlayOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [overlayOpen]);

  // stop auto-selecting first category so products show only after user taps
  useEffect(() => {
    if (!categoryOpen) {
      setSelectedCategoryId(null);
      setSelectedSubcategory(null);
      setActiveCategory(null);
    }
  }, [categoryOpen]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const setClass = (cond: boolean, cls: string) => {
      if (cond) document.body.classList.add(cls);
      else document.body.classList.remove(cls);
    };
    setClass(categoryOpen, "category-overlay-open");
    setClass(profileOpen, "profile-overlay-open");
    return () => {
      document.body.classList.remove(
        "category-overlay-open",
        "profile-overlay-open",
      );
    };
  }, [categoryOpen, profileOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pin = window.localStorage.getItem("oweg_pincode") || "";
    setStoredPincode(pin);
  }, [overlayOpen, pathname]);

  useEffect(() => {
    resetPanels();
  }, [pathname, resetPanels]);

  // Prefetch key routes/data so bottom nav taps feel instant
  useEffect(() => {
    router.prefetch("/account");
    router.prefetch("/account/orders");
    router.prefetch("/wishlist");
    router.prefetch("/");
    router.prefetch("/vendor-portal");
    router.prefetch("/login");
    router.prefetch("/signup");
  }, [router]);

  const categoriesWithChildren = useMemo(
    () =>
      categories.filter(
        (cat) => Array.isArray(cat.children) && cat.children.length > 0,
      ),
    [categories],
  );

  const forYouCategory = useMemo<MobileCategory | null>(
    () =>
      customer
        ? {
            id: "for-you",
            title: "For You",
            handle: "for-you",
            image: "/oweg_logo.png",
            children: [],
          }
        : null,
    [customer],
  );

  useEffect(() => {
    if (!categoryOpen) return;
    if (selectedCategoryId) return;
    const preferred = categoriesWithChildren.find(
      (c) => normalizeCategoryKey(c.title) === "home-appliances",
    );
    const fallback = categoriesWithChildren[0];
    const target = preferred || fallback;
    if (target) {
      setSelectedCategoryId(target.id);
      setSelectedSubcategory(null);
    }
  }, [categoryOpen, categoriesWithChildren, selectedCategoryId]);

  const filteredCategories = useMemo(() => {
    const base = forYouCategory
      ? [forYouCategory, ...categoriesWithChildren]
      : categoriesWithChildren;
    if (selectedSubcategory) return base;
    if (!searchTerm.trim()) return base;
    const term = searchTerm.toLowerCase();
    return base.filter((cat) => cat.title.toLowerCase().includes(term));
  }, [categoriesWithChildren, forYouCategory, searchTerm, selectedSubcategory]);

  const displayedCategory = useMemo(() => {
    if (!selectedCategoryId) return null;
    return filteredCategories.find((c) => c.id === selectedCategoryId) || null;
  }, [filteredCategories, selectedCategoryId]);

  const mapInlineProduct = useCallback((p: any): InlineProduct => {
    let img: string | undefined;
    if (typeof p?.image === "string") img = p.image;
    else if (typeof p?.thumbnail === "string") img = p.thumbnail;
    else if (Array.isArray(p?.images) && p.images.length > 0) {
      const first = p.images[0];
      if (typeof first === "string") img = first;
      else if (first && typeof (first as { url?: string }).url === "string")
        img = (first as { url?: string }).url;
    }
    return {
      id: String(p?.id || p?.handle || Math.random()),
      name: p?.title || p?.name || "Product",
      image: img,
      price: typeof p?.price === "number" ? p.price : undefined,
      mrp: typeof p?.mrp === "number" ? p.mrp : undefined,
      discount: typeof p?.discount === "number" ? p.discount : undefined,
      brand: (p as { brand?: string })?.brand,
    };
  }, []);
  const forYouSelected = false;
  const _forYouQueries: Array<{ data?: any; isLoading?: boolean }> = [];
  const _forYouProductMap: Record<string, InlineProduct[]> = useMemo(
    () => ({}),
    [],
  );

  useEffect(() => {
    if (selectedCategoryId && !displayedCategory) {
      setSelectedCategoryId(null);
      setSelectedSubcategory(null);
      setActiveCategory(null);
    }
  }, [displayedCategory, selectedCategoryId]);

  useEffect(() => {
    if (!displayedCategory) return;
    setActiveCategory(displayedCategory);
    // keep subcategory unselected by default; user must tap one
    setSelectedSubcategory(null);
  }, [displayedCategory]);

  useEffect(() => {
    const target = selectedSubcategory;
    if (!target) {
      setSubProducts([]);
      setProductsLoading(false);
      return;
    }
    const fetchProducts = async () => {
      setProductsLoading(true);
      try {
        const query =
          target.handle && target.handle.length > 0
            ? `category=${encodeURIComponent(target.handle)}`
            : target.id
              ? `categoryId=${encodeURIComponent(target.id)}`
              : "";
        if (!query) {
          setSubProducts([]);
          setProductsLoading(false);
          return;
        }
        const res = await fetch(`/api/medusa/products?${query}&limit=24`, {
          cache: "no-store",
        });
        if (!res.ok) {
          setSubProducts([]);
        } else {
          const data = await res.json();
          const productArray: ProductLike[] = Array.isArray(data?.products)
            ? (data.products as ProductLike[])
            : [];
          const products = productArray.map((p) => {
            const brand = getProductBrand(p);
            return {
              id: String(p.id || p.handle || Math.random()),
              name: p.title || p.name || "Product",
              image: resolveProductImage(p),
              price: typeof p.price === "number" ? p.price : undefined,
              mrp: typeof p.mrp === "number" ? p.mrp : undefined,
              discount: typeof p.discount === "number" ? p.discount : undefined,
              brand,
            };
          });
          setSubProducts(products);
        }
      } catch {
        setSubProducts([]);
      } finally {
        setProductsLoading(false);
      }
    };
    void fetchProducts();
  }, [selectedSubcategory, activeCategory]);

  useEffect(() => {
    setFiltersOpen(false);
  }, [selectedSubcategory, selectedCategoryId, categoryOpen]);

  const filteredProducts = useMemo(() => {
    let list = subProducts;
    if (selectedSubcategory && searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(term));
    }
    const min = priceMin.trim() ? Number(priceMin) : undefined;
    const max = priceMax.trim() ? Number(priceMax) : undefined;
    if (brandFilter) {
      list = list.filter(
        (p) => (p.brand || "").toLowerCase() === brandFilter.toLowerCase(),
      );
    }
    if (Number.isFinite(min)) {
      list = list.filter(
        (p) =>
          typeof p.price === "number" && (p.price as number) >= (min as number),
      );
    }
    if (Number.isFinite(max)) {
      list = list.filter(
        (p) =>
          typeof p.price === "number" && (p.price as number) <= (max as number),
      );
    }
    if (priceSort === "asc") {
      list = [...list].sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (priceSort === "desc") {
      list = [...list].sort((a, b) => (b.price || 0) - (a.price || 0));
    }
    return list;
  }, [
    subProducts,
    brandFilter,
    priceMin,
    priceMax,
    priceSort,
    searchTerm,
    selectedSubcategory,
  ]);

  useEffect(() => {
    const brands = Array.from(
      new Set(
        subProducts
          .map((p) => p.brand || "")
          .map((b) => b.trim())
          .filter((b) => b.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b));
    setAvailableBrands(brands);
    if (brands.length === 0) {
      setBrandFilter("");
    } else if (brandFilter && !brands.includes(brandFilter)) {
      setBrandFilter("");
    }
  }, [subProducts, brandFilter]);

  const iconSize = "w-[22px] h-[22px]";
  const _fetchPrefProducts = useCallback(
    async (query: {
      tag?: string;
      type?: string;
      category?: string;
      limit?: number;
    }) => {
      const params = new URLSearchParams();
      if (query.tag) params.set("tag", query.tag);
      if (query.type) params.set("type", query.type);
      if (query.category) params.set("category", query.category);
      params.set("limit", String(query.limit ?? 12));
      const res = await fetch(`/api/medusa/products?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Unable to load products");
      const data = await res.json();
      return Array.isArray(data?.products) ? data.products : [];
    },
    [],
  );
  // inline For You disabled; use dedicated page
  // const forYouSelected = selectedCategoryId === 'for-you';
  const navActiveKey = profileOpen
    ? "profile"
    : pathname?.startsWith("/account/wishlist") ||
        pathname?.startsWith("/wishlist")
      ? "wishlist"
      : pathname?.startsWith("/account")
        ? "profile"
        : pathname === "/"
          ? "home"
          : null;
  const navItems = [
    {
      key: "home",
      label: "Home",
      href: "/",
      icon: <Home className={iconSize} />,
    },
    {
      key: "profile",
      label: "Profile",
      href: "/account",
      icon: <User className={iconSize} />,
    },
    {
      key: "wishlist",
      label: "Wishlist",
      href: "/wishlist",
      badge: wishlistCount,
      icon: <Heart className={iconSize} />,
      prefetchKey: "wishlist",
    },
  ];

  const customerName = useMemo(() => {
    if (!customer) return "";
    const first =
      typeof customer.first_name === "string" ? customer.first_name.trim() : "";
    const last =
      typeof customer.last_name === "string" ? customer.last_name.trim() : "";
    const full = `${first} ${last}`.trim();
    if (full) return full;
    if (customer.email) {
      const [local] = customer.email.split("@");
      return local || customer.email;
    }
    return "Account";
  }, [customer]);
  const deliverLocation = useMemo(() => {
    const metaPlace =
      (
        customer?.metadata as
          | { place_name?: string; location?: string }
          | undefined
      )?.place_name ||
      (customer?.metadata as { location?: string } | undefined)?.location;
    const firstAddress = Array.isArray(customer?.shipping_addresses)
      ? (customer?.shipping_addresses[0] as
          | { city?: string; country?: string }
          | undefined)
      : undefined;
    const addressCity = firstAddress?.city || firstAddress?.country;
    return metaPlace || addressCity || storedPincode || "Set your location";
  }, [customer?.metadata, customer?.shipping_addresses, storedPincode]);

  const accountIcon = (label: string) => {
    if (label.toLowerCase().includes("brand"))
      return <Store className="w-5 h-5 text-emerald-600" />;
    if (label.toLowerCase().includes("gift"))
      return <Gift className="w-5 h-5 text-emerald-600" />;
    if (label.toLowerCase().includes("reward"))
      return <Trophy className="w-5 h-5 text-emerald-600" />;
    if (label.toLowerCase().includes("wishlist"))
      return <Heart className="w-5 h-5 text-emerald-600" />;
    return <Tag className="w-5 h-5 text-emerald-600" />;
  };
  const policyIcon = (label: string) => {
    const lower = label.toLowerCase();
    if (lower.includes("return"))
      return <RefreshCw className="w-5 h-5 text-emerald-600" />;
    if (lower.includes("shipping"))
      return <Truck className="w-5 h-5 text-emerald-600" />;
    if (lower.includes("coupon"))
      return <Percent className="w-5 h-5 text-emerald-600" />;
    if (lower.includes("privacy"))
      return <Lock className="w-5 h-5 text-emerald-600" />;
    return <FileText className="w-5 h-5 text-emerald-600" />;
  };
  const quickIcon = (label: string) => {
    const lower = label.toLowerCase();
    if (lower.includes("about"))
      return <Info className="w-5 h-5 text-emerald-600" />;
    if (lower.includes("faq"))
      return <HelpCircle className="w-5 h-5 text-emerald-600" />;
    if (lower.includes("contact"))
      return <Phone className="w-5 h-5 text-emerald-600" />;
    if (lower.includes("seller"))
      return <Store className="w-5 h-5 text-emerald-600" />;
    if (lower.includes("agent"))
      return <Users className="w-5 h-5 text-emerald-600" />;
    return <Tag className="w-5 h-5 text-emerald-600" />;
  };

  const goNav = (href: string) => {
    resetPanels();
    router.push(href);
  };

  const prefetchWishlist = () => {
    if (!customer?.id) return;
    void queryClient.prefetchQuery({
      queryKey: ["wishlist", customer.id],
      queryFn: async () => {
        const res = await fetch("/api/medusa/wishlist", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Unable to load wishlist");
        const data = await res.json();
        return Array.isArray(data?.products) ? data.products : [];
      },
      staleTime: 1000 * 60 * 2,
    });
  };

  return (
    <>
      <nav
        aria-label="Primary"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[900] md:hidden px-3 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] pt-2 animate-in slide-in-from-bottom-2 duration-300"
      >
        <div className="pointer-events-auto relative mx-auto max-w-[360px]">
          {/* Floating pill dock */}
          <div className="relative h-16 rounded-full bg-white shadow-[0_10px_28px_rgba(0,0,0,0.12),0_2px_6px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.04]">
            <div className="absolute inset-0 flex items-center justify-between px-5">
              {navItems
                .filter((item) => item.key !== "profile")
                .map((item) => {
                  const active = navActiveKey === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      aria-label={item.label}
                      aria-current={active ? "page" : undefined}
                      className="flex flex-col items-center gap-0.5 min-w-[56px] min-h-11 justify-center transition-transform duration-200 active:scale-[0.96]"
                      onMouseEnter={() => {
                        if (item.prefetchKey === "wishlist") prefetchWishlist();
                      }}
                      onFocus={() => {
                        if (item.prefetchKey === "wishlist") {
                          void router.prefetch("/wishlist");
                        }
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        if (item.href) goNav(item.href);
                      }}
                    >
                      <span
                        className={`relative flex h-11 w-11 items-center justify-center rounded-[14px] transition-all duration-200 ${
                          active
                            ? "bg-[#7AC943] text-white shadow-[0_8px_20px_-10px_rgba(122,201,67,0.85)]"
                            : "bg-[#F4F7F2] text-gray-600"
                        }`}
                      >
                        {item.icon}
                        {item.badge ? (
                          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 rounded-full bg-[#5ea82e] text-white text-[10px] font-semibold px-1.5 flex items-center justify-center border border-white shadow-sm">
                            {item.badge > 99 ? "99+" : item.badge}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={`text-[10px] font-semibold tracking-[0.01em] ${
                          active ? "text-[#326b00]" : "text-gray-500"
                        }`}
                      >
                        {item.label}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Raised Profile orb — center focal point */}
          {(() => {
            const profile = navItems.find((i) => i.key === "profile");
            if (!profile) return null;
            const active = navActiveKey === "profile";
            return (
              <button
                type="button"
                aria-label={profile.label}
                aria-current={active ? "page" : undefined}
                className="absolute left-1/2 top-0 z-10 flex -translate-x-1/2 -translate-y-[38%] flex-col items-center"
                onClick={(e) => {
                  e.preventDefault();
                  if (profile.href) goNav(profile.href);
                }}
              >
                <span
                  className={`flex h-16 w-16 items-center justify-center rounded-full border-[4px] border-white transition-all duration-200 active:scale-[0.96] ${
                    active
                      ? "bg-[#7AC943] text-white shadow-[0_10px_22px_rgba(122,201,67,0.45)]"
                      : "bg-[#E8F3DE] text-[#3d6b14] shadow-[0_8px_18px_rgba(0,0,0,0.12)]"
                  }`}
                >
                  <User className="h-7 w-7" strokeWidth={2.25} />
                </span>
                <span
                  className={`mt-0.5 text-[10px] font-bold tracking-[0.01em] ${
                    active ? "text-[#326b00]" : "text-gray-600"
                  }`}
                >
                  {profile.label}
                </span>
              </button>
            );
          })()}
        </div>
      </nav>

      {/* Category sheet */}
      <Overlay open={categoryOpen} onClose={closeCategory} scrollable={false}>
        <div className="pb-8 space-y-4 relative">
          {!selectedSubcategory && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={
                    isOpen ? "Collapse categories" : "Expand categories"
                  }
                  aria-pressed={isOpen}
                  onClick={() => {
                    const next = !isOpen;
                    setIsOpen(next);
                    setSidebarOverlayOpen(next);
                    if (next) {
                      lastCategoryIdRef.current = selectedCategoryId;
                    }
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition active:scale-[0.97]"
                >
                  <ChevronsLeft
                    className={`w-5 h-5 transition-transform duration-200 ${isOpen ? "rotate-0" : "rotate-180"}`}
                  />
                </button>
                <h3 className="text-lg font-semibold text-gray-900 pt-1">
                  Categories
                </h3>
              </div>
            </div>
          )}

          {categoriesLoading && (
            <div className="grid grid-cols-2 gap-3 pt-2 animate-pulse">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={`cat-skeleton-${idx}`}
                  className="rounded-2xl border border-gray-100 bg-gray-50 p-3 space-y-3 shadow-sm"
                >
                  <div className="h-16 w-full rounded-xl bg-white" />
                  <div className="h-4 w-3/4 rounded bg-white/80" />
                  <div className="h-3 w-1/2 rounded bg-white/60" />
                </div>
              ))}
            </div>
          )}

          {/* <div className="relative">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={selectedSubcategory ? 'Search products' : 'Search categories'}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />
          </div> */}

          {selectedSubcategory && sidebarOverlayOpen && (
            <div
              className="absolute inset-0 z-30 bg-black/20"
              onClick={() => setSidebarOverlayOpen(false)}
            >
              <div
                className="absolute top-0 left-0 h-full w-64 bg-white shadow-2xl border-r border-gray-100 overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-3 py-3 border-b border-gray-100">
                  <h4 className="text-sm font-semibold text-gray-900">
                    Categories
                  </h4>
                  <button
                    type="button"
                    onClick={() => setSidebarOverlayOpen(false)}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-gray-200 text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2 px-3 py-3">
                  {filteredCategories.map((cat) => {
                    const active = displayedCategory?.id === cat.id;
                    const isExpanded = expandedCatId === cat.id;
                    const hasChildren =
                      Array.isArray(cat.children) && cat.children.length > 0;
                    if (cat.id === "for-you") {
                      return (
                        <div
                          key={cat.id}
                          className="rounded-2xl border-gray-200 bg-white"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              resetPanels();
                              setCategoryOpen(false);
                              setSidebarOverlayOpen(false);
                              router.push("/for-you");
                            }}
                            className="w-full px-2.5 py-2 flex items-center justify-between gap-2"
                            title="For You"
                          >
                            <div className="flex items-center gap-3">
                              <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-white border  flex items-center justify-center">
                                <Image
                                  src="/For_You.png"
                                  alt="For You"
                                  fill
                                  className="object-contain"
                                  sizes="48px"
                                  unoptimized
                                />
                              </div>
                              <span className="text-sm font-semibold text-gray-800 line-clamp-2">
                                For You
                              </span>
                            </div>
                          </button>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={cat.id}
                        className={`rounded-2xl border ${active ? "border-emerald-400 bg-emerald-50 shadow-sm" : "border-gray-200 bg-white"}`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCategoryId(cat.id);
                            setSelectedSubcategory(null);
                            setActiveCategory(cat);
                            if (hasChildren) {
                              setExpandedCatId(cat.id);
                              setIsOpen(true);
                              setSidebarOverlayOpen(true);
                            } else {
                              setExpandedCatId(null);
                              setIsOpen(false);
                              setSidebarOverlayOpen(false);
                            }
                          }}
                          className="w-full px-2.5 py-2 flex items-center justify-between gap-2"
                          title={cat.title}
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-white border border-gray-100 flex items-center justify-center">
                              <Image
                                src={getCategoryDisplayImage(cat)}
                                alt={cat.title}
                                fill
                                className="object-contain"
                                sizes="48px"
                                unoptimized
                              />
                            </div>
                            <span className="text-sm font-semibold text-gray-800 line-clamp-2">
                              {cat.title}
                            </span>
                          </div>
                          {hasChildren ? (
                            <ChevronRight
                              className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            />
                          ) : null}
                        </button>
                        {hasChildren && isExpanded ? (
                          <div className="pb-2 px-3 space-y-2">
                            {cat.children!.map((child) => (
                              <button
                                key={child.id}
                                type="button"
                                onClick={() => {
                                  setSelectedCategoryId(cat.id);
                                  setSelectedSubcategory(child);
                                  setActiveCategory(cat);
                                  setIsOpen(false);
                                  setSidebarOverlayOpen(false);
                                }}
                                className="w-full rounded-xl border border-emerald-100 bg-white px-3 py-2 text-left text-sm font-semibold text-gray-800 hover:border-emerald-300"
                              >
                                {child.title}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div
            className={`relative min-h-0 transition-all duration-300 ease-in-out ${selectedSubcategory ? "" : "flex gap-3"}`}
            style={{ height: "calc(100vh - 150px)" }}
          >
            {!selectedSubcategory && (
              <div
                className="flex-shrink-0 space-y-2 overflow-y-auto h-full pr-1 min-h-0 transition-all duration-300 ease-in-out"
                style={{
                  width: isOpen ? 240 : 90,
                  paddingBottom:
                    "calc(env(safe-area-inset-bottom, 0px) + 280px)",
                }}
              >
                {categoriesLoading ? (
                  <div className="text-sm text-gray-500">
                    Loading categories…
                  </div>
                ) : filteredCategories.length === 0 ? (
                  <div className="text-sm text-gray-500">
                    No categories found.
                  </div>
                ) : (
                  filteredCategories.map((cat) => {
                    if (cat.id === "for-you") {
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            resetPanels();
                            setCategoryOpen(false);
                            setSidebarOverlayOpen(false);
                            router.push("/for-you");
                          }}
                          className={`group w-full rounded-2xl border transition-all duration-300 text-left ${
                            isOpen ? "px-2.5 py-2" : "px-1.5 py-1.5"
                          }`}
                          title="For You"
                        >
                          <div className="flex flex-col items-center">
                            <div
                              className="relative w-full rounded-xl overflow-hidden bg-emerald-50 flex items-center justify-center border border-emerald-100"
                              style={{ height: isOpen ? 96 : 80 }}
                            >
                              <Image
                                src="/For_You.png"
                                alt="For You"
                                fill
                                className="object-contain"
                                sizes={isOpen ? "140px" : "120px"}
                                unoptimized
                              />
                            </div>
                            {isOpen ? (
                              <span className="mt-1 text-sm font-semibold text-emerald-800 text-center">
                                For You
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    }
                    const active = displayedCategory?.id === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setSelectedCategoryId(cat.id);
                          setSelectedSubcategory(null);
                        }}
                        className={`group w-full rounded-2xl border transition-all duration-300 text-left ${
                          active
                            ? "border-emerald-400 bg-emerald-50 shadow-sm"
                            : "border-gray-200 bg-white"
                        } ${isOpen ? "px-2.5 py-2" : "px-1.5 py-1.5"}`}
                        title={cat.title}
                      >
                        <div className="flex flex-col items-center">
                          <div
                            className="relative w-full rounded-xl overflow-hidden bg-white flex items-center justify-center"
                            style={{ height: isOpen ? 96 : 80 }}
                          >
                            <Image
                              src={getCategoryDisplayImage(cat)}
                              alt={cat.title}
                              fill
                              className="object-contain"
                              sizes={isOpen ? "140px" : "120px"}
                              unoptimized
                            />
                          </div>
                          {isOpen ? (
                            <span className="mt-2 text-[12px] font-semibold text-gray-800 text-center leading-tight transition-opacity duration-200">
                              {cat.title}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}

            <div
              className={`${selectedSubcategory ? "w-full" : "flex-1 min-w-0"} h-full min-h-0 overflow-y-auto pr-1 transition-all duration-300 ease-in-out`}
              style={{
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 280px)",
              }}
            >
              <div className="space-y-3">
                {forYouSelected ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                          For You
                        </p>
                        <h2 className="text-lg font-semibold text-gray-900">
                          Your picks
                        </h2>
                        <p className="text-xs text-gray-600">
                          Quick access to what you chose.
                        </p>
                      </div>
                    </div>
                    {!hasPreferences ? (
                      <div className="text-sm text-gray-600">
                        Set your preferences to see them here.
                      </div>
                    ) : forYouItems.length === 0 ? (
                      <div className="text-sm text-gray-600">
                        No preferences added yet.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {forYouItems.map((item, idx) => {
                          const query = _forYouQueries[idx];
                          const prod = (query?.data && query.data[0]) || null;
                          let img = "/oweg_logo.png";
                          if (prod) {
                            if (typeof prod.image === "string")
                              img = prod.image;
                            else if (typeof prod.thumbnail === "string")
                              img = prod.thumbnail;
                            else if (
                              Array.isArray(prod.images) &&
                              prod.images.length > 0
                            ) {
                              const first = prod.images[0];
                              if (typeof first === "string") img = first;
                              else if (
                                first &&
                                typeof (first as { url?: string }).url ===
                                  "string"
                              ) {
                                img = (first as { url?: string }).url as string;
                              }
                            }
                          }
                          const loading = query?.isLoading;
                          return (
                            <button
                              key={item.label}
                              type="button"
                              onClick={() => {
                                setSelectedSubcategory({
                                  id: item.label,
                                  title: item.label,
                                  children: [],
                                  handle: item.label,
                                });
                                setActiveCategory({
                                  id: item.label,
                                  title: item.label,
                                  children: [],
                                });
                                setIsOpen(false);
                                setSidebarOverlayOpen(false);
                                if (query?.data && query.data.length > 0) {
                                  setSubProducts(
                                    query.data.map((p: any) =>
                                      mapInlineProduct(p),
                                    ),
                                  );
                                } else {
                                  setSubProducts([]);
                                }
                              }}
                              className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden text-left"
                            >
                              <div className="relative w-full h-24 bg-gray-50">
                                {loading ? (
                                  <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-gray-100 via-white to-gray-100" />
                                ) : (
                                  <Image
                                    src={img}
                                    alt={item.label}
                                    fill
                                    className="object-contain p-3"
                                    sizes="180px"
                                    unoptimized
                                  />
                                )}
                              </div>
                              <div className="p-2 space-y-1">
                                <p className="text-sm font-semibold text-gray-900 line-clamp-2">
                                  {item.label}
                                </p>
                                <p className="text-[11px] text-gray-600">
                                  {query?.data?.length
                                    ? `${query.data.length} picks`
                                    : loading
                                      ? "Loading…"
                                      : "Tap to view"}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {selectedSubcategory ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2 text-sm text-gray-700">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">
                              {selectedSubcategory.title}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">
                            {filteredProducts.length} products
                          </span>
                        </div>
                        {productsLoading ? (
                          <div className="grid grid-cols-2 gap-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                              <div
                                key={i}
                                className="h-32 rounded-xl bg-gradient-to-br from-gray-100 via-white to-gray-100 animate-pulse"
                              />
                            ))}
                          </div>
                        ) : filteredProducts.length === 0 ? (
                          <div className="text-sm text-gray-600">
                            No products found for this preference.
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-3">
                            {filteredProducts.map((p) => (
                              <Link
                                key={p.id}
                                href={
                                  typeof p.id === "string"
                                    ? `/products/${p.id}`
                                    : "#"
                                }
                                className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
                              >
                                <div className="relative w-full h-28 bg-gray-50">
                                  <Image
                                    src={p.image || "/oweg_logo.png"}
                                    alt={p.name}
                                    fill
                                    className="object-contain p-2"
                                    sizes="180px"
                                    unoptimized
                                  />
                                </div>
                                <div className="p-2 space-y-1">
                                  <p className="text-xs font-semibold text-gray-900 line-clamp-2">
                                    {p.name}
                                  </p>
                                  {p.price ? (
                                    <p className="text-xs font-semibold text-emerald-700">
                                      ₹{p.price}
                                    </p>
                                  ) : null}
                                </div>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <>
                    {activeCategory &&
                      (activeCategory.children || []).length > 0 &&
                      !selectedSubcategory && (
                        <div className="flex flex-col gap-2 pb-2 animate-in fade-in duration-200">
                          <div className="px-0.5 mb-1">
                            <h3 className="text-base font-semibold tracking-tight text-gray-900">
                              {activeCategory.title}
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Browse
                            </p>
                          </div>
                          <ul className="flex flex-col gap-2" role="list">
                            {activeCategory.children!.map((child) => {
                              const Icon = getSubcategoryIcon(
                                child.title,
                                child.handle,
                              );
                              return (
                                <li key={child.id}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedSubcategory(child)
                                    }
                                    className="group flex w-full items-center gap-3 rounded-xl bg-[#F4F7F2] px-3 py-3 text-left transition-all duration-200 hover:bg-[#EAF3E0] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7AC943]/40"
                                  >
                                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#7AC943]/18 text-[#5ea82e] ring-1 ring-[#7AC943]/25">
                                      <Icon
                                        className="h-5 w-5"
                                        strokeWidth={2}
                                        aria-hidden
                                      />
                                    </span>
                                    <span className="min-w-0 flex-1 text-[14px] font-medium text-gray-900 line-clamp-2">
                                      {child.title}
                                    </span>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-[#7AC943] transition-transform group-hover:translate-x-0.5" />
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}

                    {selectedSubcategory && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              aria-label="Show categories"
                              onClick={() => {
                                setIsOpen(true);
                                setSidebarOverlayOpen(true);
                                lastCategoryIdRef.current = selectedCategoryId;
                              }}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-800 shadow-sm text-base font-bold"
                            >
                              <ChevronsLeft className="w-5 h-5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedSubcategory(null);
                                setIsOpen(false);
                                setSidebarOverlayOpen(false);
                              }}
                              className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"
                            >
                              <ChevronRight className="w-3 h-3 rotate-180" />
                              All subcategories
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700"
                              onClick={() => setFiltersOpen((v) => !v)}
                            >
                              Filters
                              <ChevronRight
                                className={`w-3 h-3 text-gray-400 transition-transform ${filtersOpen ? "rotate-90" : ""}`}
                              />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-sm text-gray-700">
                          <div className="flex items-center gap-2">
                            {activeCategory ? (
                              <span className="font-semibold text-gray-900">
                                {activeCategory.title}
                              </span>
                            ) : null}
                            <ChevronRight className="w-3 h-3 text-gray-400" />
                            <span className="font-semibold text-gray-900">
                              {selectedSubcategory.title}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">
                            {filteredProducts.length} products available
                          </span>
                        </div>
                        {filtersOpen && (
                          <div className="flex flex-wrap gap-2 items-center text-xs text-gray-600 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                            <div className="flex items-center gap-1">
                              <span className="text-gray-700 font-semibold">
                                Sort:
                              </span>
                              <select
                                value={priceSort}
                                onChange={(e) =>
                                  setPriceSort(
                                    e.target.value as "none" | "asc" | "desc",
                                  )
                                }
                                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
                              >
                                <option value="none">Default</option>
                                <option value="asc">Price: Low to High</option>
                                <option value="desc">Price: High to Low</option>
                              </select>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-700 font-semibold">
                                Brand:
                              </span>
                              <select
                                value={brandFilter}
                                onChange={(e) => setBrandFilter(e.target.value)}
                                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs min-w-[120px]"
                              >
                                <option value="">All</option>
                                {availableBrands.map((b) => (
                                  <option key={b} value={b}>
                                    {b}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-700 font-semibold">
                                Price:
                              </span>
                              <input
                                type="number"
                                inputMode="numeric"
                                placeholder="Min"
                                value={priceMin}
                                onChange={(e) => setPriceMin(e.target.value)}
                                className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-xs"
                              />
                              <span>–</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                placeholder="Max"
                                value={priceMax}
                                onChange={(e) => setPriceMax(e.target.value)}
                                className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-xs"
                              />
                            </div>
                            {(priceSort !== "none" ||
                              brandFilter ||
                              priceMin ||
                              priceMax) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPriceSort("none");
                                  setBrandFilter("");
                                  setPriceMin("");
                                  setPriceMax("");
                                }}
                                className="text-emerald-700 font-semibold"
                              >
                                Clear filters
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {selectedSubcategory ? (
                      <div className="grid grid-cols-2 gap-4 pb-3">
                        {productsLoading ? (
                          <div className="col-span-2 text-sm text-gray-500">
                            Loading products...
                          </div>
                        ) : filteredProducts.length === 0 ? (
                          <div className="col-span-2 text-sm text-gray-500">
                            No products found.
                          </div>
                        ) : (
                          filteredProducts.map((p) => (
                            <Link
                              key={p.id}
                              href={`/productDetail/${encodeURIComponent(p.id)}?id=${encodeURIComponent(p.id)}`}
                              className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm flex flex-col items-center gap-3"
                              onClick={closeCategory}
                            >
                              <div className="relative w-full h-44 rounded-xl bg-white border border-gray-100 overflow-hidden shadow-sm">
                                {p.image ? (
                                  <Image
                                    src={p.image}
                                    alt={p.name}
                                    fill
                                    sizes="(max-width: 768px) 60vw, 240px"
                                    className="object-contain p-3"
                                    unoptimized
                                  />
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
                                    No image
                                  </div>
                                )}
                              </div>
                              <p className="text-sm text-center text-gray-800 line-clamp-2">
                                {p.name}
                              </p>
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-emerald-700 font-semibold">
                                  {formatCurrency(p.price)}
                                </span>
                                {p.mrp && p.mrp > (p.price || 0) ? (
                                  <span className="text-gray-400 line-through">
                                    {formatCurrency(p.mrp)}
                                  </span>
                                ) : null}
                              </div>
                            </Link>
                          ))
                        )}
                      </div>
                    ) : activeCategory &&
                      (activeCategory.children || []).length === 0 ? (
                      <div className="text-sm text-gray-500 px-0.5">
                        No subcategories in this category yet.
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </Overlay>

      {/* Profile sheet */}
      <Overlay open={profileOpen} onClose={closeProfile}>
        <div className="p-4 pb-32 space-y-5">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-gray-900">
              {customer ? `Hi, ${customerName}` : "Welcome back"}
            </h1>
            <p className="text-sm text-gray-600">
              Deliver to {deliverLocation}
            </p>
          </div>

          {!customer && (
            <div className="space-y-2">
              <p className="text-sm text-gray-700">
                Sign in for a better experience.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="flex-1 bg-emerald-600 text-white px-4 py-2.5 text-center font-semibold hover:bg-emerald-700"
                  onClick={() => {
                    closeProfile();
                    router.push(buildLoginUrl(pathname));
                  }}
                >
                  Login
                </button>
                <button
                  type="button"
                  className="flex-1 border border-gray-300 text-emerald-700 px-4 py-2.5 text-center font-semibold hover:bg-gray-50"
                  onClick={() => {
                    closeProfile();
                    router.replace(buildSignupUrl(pathname));
                  }}
                >
                  Sign up
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-base font-semibold text-gray-900">
              Quick actions
            </p>
            <div className="space-y-2">
              {customer ? (
                <Link
                  href="/account"
                  onClick={closeProfile}
                  className="flex items-center justify-between border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                >
                  <span className="flex items-center gap-2">
                    <User className="w-4 h-4 text-emerald-600" />
                    My Profile
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </Link>
              ) : null}
              <Link
                href="/account/orders"
                onClick={closeProfile}
                className="flex items-center justify-between border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
              >
                <span className="flex items-center gap-2">
                  <ChevronsLeft className="w-4 h-4 text-emerald-600" />
                  Orders & Returns
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
              <Link
                href="/cart"
                onClick={closeProfile}
                className="flex items-center justify-between border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
              >
                <span className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-emerald-600" />
                  Cart & Checkout
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
              <a
                href="mailto:owegonline@oweg.in"
                onClick={closeProfile}
                className="flex items-center justify-between border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
              >
                <span className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-600" />
                  Support
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </a>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-base font-semibold text-gray-900">My Account</p>
            <div className="space-y-2">
              {accountLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="flex items-center justify-between border border-gray-200 px-3 py-3 text-base font-semibold text-gray-900 hover:bg-gray-50"
                  onClick={closeProfile}
                >
                  <span className="flex items-center gap-3">
                    {accountIcon(link.label)}
                    {link.label}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-base font-semibold text-gray-900">Policy</p>
            <div className="space-y-2">
              {policyLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="flex items-center justify-between border border-gray-200 px-3 py-3 text-base font-semibold text-gray-900 hover:bg-gray-50"
                  onClick={closeProfile}
                >
                  <span className="flex items-center gap-3">
                    {policyIcon(link.label)}
                    {link.label}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-base font-semibold text-gray-900">Quick Links</p>
            <div className="space-y-2">
              {quickLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="flex items-center justify-between border border-gray-200 px-3 py-3 text-base font-semibold text-gray-900 hover:bg-gray-50"
                  onClick={closeProfile}
                >
                  <span className="flex items-center gap-3">
                    {quickIcon(link.label)}
                    {link.label}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-1 text-sm text-gray-600">
            <p className="font-semibold text-gray-900">Support</p>
            <p>Ascent Retechno India Pvt Ltd</p>
            <p>
              Shop No.04, 05, 06 & 07 AV Crystal, Near Navneet Hospital, Opp.
              Achole Talav, Nallasopara East, Palghar, Maharashtra - 401209.
            </p>
            <a
              href="mailto:owegonline@oweg.in"
              className="inline-flex items-center gap-2 text-emerald-700 font-semibold"
              onClick={closeProfile}
            >
              <Mail className="w-4 h-4" />
              owegonline@oweg.in
            </a>
            <div className="flex gap-4 text-gray-500">
              <a href="#" aria-label="Facebook">
                <Facebook className="h-5 w-5" />
              </a>
              <a href="#" aria-label="Twitter">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="#" aria-label="Instagram">
                <Instagram className="h-5 w-5" />
              </a>
              <a href="#" aria-label="LinkedIn">
                <Linkedin className="h-5 w-5" />
              </a>
            </div>
          </div>

          {customer ? (
            <button
              type="button"
              onClick={async () => {
                await logout();
                setProfileOpen(false);
                router.refresh();
              }}
              className="w-full border border-red-200 bg-red-50 text-red-600 px-4 py-3 flex items-center justify-center gap-2 font-semibold"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          ) : null}
        </div>
      </Overlay>
    </>
  );
}
