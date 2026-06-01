"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Heading,
  Text,
  Button,
  Badge,
  toast,
  clx,
} from "@medusajs/ui"
import * as XLSX from "xlsx"
import axios from "axios"
import VendorShell from "@/components/VendorShell"
import {
  vendorCategoriesApi,
  vendorCollectionsApi,
  vendorProductsApi,
  vendorTagsApi,
  vendorTypesApi,
} from "@/lib/api/client"
import { generateSku, isValidSkuFormat } from "@/lib/sku"
import {
  extractEmbeddedImages,
  indexToColumnLetter,
  splitCellAddress,
} from "@/lib/xlsx-embedded-images"

type RawRow = Record<string, unknown>

type ParsedRow = {
  rowNumber: number
  title: string
  subtitle: string
  handle: string
  description: string
  brand: string
  category: string
  subcategory: string
  collection: string
  tags: string[]
  type: string
  discountable: boolean
  height: string
  width: string
  length: string
  weight: string
  midCode: string
  hsCode: string
  countryOfOrigin: string
  variantTitle: string
  sku: string
  managedInventory: boolean
  allowBackorder: boolean
  inventoryCount: string
  price: string
  discountedPrice: string
  discountPercent: number | null
  thumbnailRef: string
  imageRefs: string[]
  brandLetterRef: string
  // User can override the parsed category by picking from the existing
  // category list, or request a brand-new one via a free-text remark that
  // gets surfaced to admins on the resulting product. Both can coexist —
  // selectedCategoryId wins for the actual category assignment, the remark
  // is stored in product.metadata.category_request for admin review.
  selectedCategoryId?: string
  resolvedParentCategoryId?: string
  categoryRequest?: string
  // Same dual-track pattern for collection: pick one of the existing
  // collections from the dropdown, or leave a remark requesting a new one.
  selectedCollectionId?: string
  collectionRequest?: string
  errors: string[]
  warnings: string[]
  status: "pending" | "uploading" | "success" | "failed"
  errorMessage?: string
}

type ImageState =
  | { status: "missing" }
  | { status: "selected"; file: File }
  | { status: "uploading"; file: File }
  | { status: "uploaded"; url: string; key: string; originalName: string }
  | { status: "error"; file?: File; message: string }

type ImageMap = Record<string, ImageState>

type BrandAuthState =
  | { status: "checking" }
  | { status: "authorized"; fileUrl?: string }
  | { status: "pending"; fileUrl?: string }
  | { status: "missing" }
  | { status: "uploading"; file: File }
  | { status: "uploaded"; fileUrl?: string }
  | { status: "error"; message: string }

type BrandAuthMap = Record<string, BrandAuthState>

type Phase = "intro" | "preview" | "uploading" | "done"

const normalizeBrandKey = (brand: string): string => {
  const t = (brand || "").trim()
  return t === "" ? "UNBRANDED" : t.toLowerCase()
}

const brandReady = (s: BrandAuthState | undefined): boolean => {
  if (!s) return false
  return (
    s.status === "authorized" ||
    s.status === "pending" ||
    s.status === "uploaded"
  )
}

const TEMPLATE_HEADERS: Array<{ key: string; example: string; required?: boolean }> = [
  { key: "Title", example: "Winter jacket", required: true },
  { key: "Subtitle", example: "Warm and cozy" },
  { key: "Handle", example: "winter-jacket" },
  { key: "Description", example: "A warm and cozy jacket" },
  { key: "Brand", example: "Nike", required: true },
  { key: "Category", example: "Clothing" },
  { key: "Subcategory", example: "Jackets" },
  { key: "Collection", example: "Winter Collection" },
  { key: "Tags", example: "winter, jacket, outdoor" },
  { key: "Type", example: "" },
  { key: "Discountable", example: "Yes" },
  { key: "Height", example: "" },
  { key: "Width", example: "" },
  { key: "Length", example: "" },
  { key: "Weight", example: "" },
  { key: "MID Code", example: "" },
  { key: "HS Code", example: "" },
  { key: "Country of Origin", example: "" },
  { key: "Variant Title", example: "Default variant" },
  { key: "SKU", example: "(auto)" },
  { key: "Managed Inventory", example: "Yes" },
  { key: "Allow Backorder", example: "No" },
  { key: "Inventory Count", example: "10" },
  { key: "Price INR", example: "1999", required: true },
  { key: "Discounted Price INR", example: "1499" },
  { key: "Discount %", example: "(auto)" },
  // Image columns — one image per cell.
  // You can either:
  //   (a) Use Excel's Insert → Picture in Cell (Excel 2021 / M365) — the
  //       portal extracts the binary directly from the .xlsx and uploads it.
  //   (b) Type a filename and drop the matching file in the portal's image
  //       dropzone — filenames are matched case-insensitively.
  // The Image 1..Image 5 columns each hold ONE image; add more by editing
  // TEMPLATE_HEADERS and IMAGE_COLUMN_PATTERN.
  { key: "Thumbnail", example: "winter-jacket-1.jpg" },
  { key: "Image 1", example: "winter-jacket-2.jpg" },
  { key: "Image 2", example: "winter-jacket-3.jpg" },
  { key: "Image 3", example: "" },
  { key: "Image 4", example: "" },
  { key: "Image 5", example: "" },
  { key: "Brand Letter", example: "nike-letter.pdf" },
]

// Matches "Image 1", "Image 2", ..., "Image10", "image_1", etc. Used by both
// the row parser (legacy filename-based flow) and the embedded-image cell
// resolver. Keeping this in one place means adding/removing image columns is
// a one-line edit above. We also accept the legacy "Images" (plural) column
// as a synonym for backwards compatibility with templates the user already
// downloaded — that one holds comma-separated filenames.
const IMAGE_COLUMN_PATTERN = /^image\s*\d*$/i
const LEGACY_IMAGES_COLUMN = "Images"

const normalizeImageKey = (name: string): string =>
  name.trim().toLowerCase()

const truthy = (v: unknown): boolean => {
  if (typeof v === "boolean") return v
  if (typeof v === "number") return v !== 0
  const s = String(v ?? "").trim().toLowerCase()
  return ["yes", "y", "true", "1", "on"].includes(s)
}

const falsy = (v: unknown): boolean => {
  const s = String(v ?? "").trim().toLowerCase()
  return ["no", "n", "false", "0", "off"].includes(s)
}

const toStr = (v: unknown): string => {
  if (v === undefined || v === null) return ""
  return String(v).trim()
}

const toNumStr = (v: unknown): string => {
  const s = toStr(v).replace(/[^0-9.\-]/g, "")
  return s
}

const computeDiscountPercent = (
  price: string,
  discountedPrice: string
): number | null => {
  const p = parseFloat(price)
  const d = parseFloat(discountedPrice)
  if (!Number.isFinite(p) || !Number.isFinite(d)) return null
  if (p <= 0 || d <= 0) return null
  if (d >= p) return 0
  return Math.round(((p - d) / p) * 1000) / 10
}

const VendorProductsBulkUploadPage = () => {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>("intro")
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState<string>("")
  const [categories, setCategories] = useState<any[]>([])
  const [collections, setCollections] = useState<any[]>([])
  const [productTypes, setProductTypes] = useState<any[]>([])
  const [productTags, setProductTags] = useState<any[]>([])
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null)
  const [imageMap, setImageMap] = useState<ImageMap>({})
  const [uploadingImages, setUploadingImages] = useState(false)
  const [brandAuthMap, setBrandAuthMap] = useState<BrandAuthMap>({})
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const brandInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  // Per-row hidden file inputs so the user can add images directly to a
  // single row via the "+" button next to that row's thumbnail.
  const rowImageInputRefs = useRef<Record<number, HTMLInputElement | null>>({})
  // Tracks which rows have the "Request new category" remark editor open
  // (independent of whether the user has typed anything yet, so deleting
  // the remark text doesn't auto-collapse the editor).
  const [openCategoryRequestRows, setOpenCategoryRequestRows] = useState<
    Set<number>
  >(new Set())
  const [openCollectionRequestRows, setOpenCollectionRequestRows] = useState<
    Set<number>
  >(new Set())
  // Per-row selected parent category ID for the two-level category picker
  const [rowParentCatIds, setRowParentCatIds] = useState<Record<number, string>>({})

  // Title-case helper for category/collection display names
  const toTitleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
  // Tracks brands whose authorization status has already been requested or
  // resolved in the current upload session so we don't re-fire the request
  // (and don't end up cancelling our own in-flight check).
  const brandsCheckedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("vendor_token") : null
    if (!token) {
      router.push("/login")
      return
    }
    ;(async () => {
      try {
        // We don't await all four in lockstep — types & tags are nice-to-have
        // and shouldn't block category/collection loading on their failures.
        const [catData, colData, typesRes, tagsRes] = await Promise.all([
          vendorCategoriesApi.list({ limit: 200 }),
          vendorCollectionsApi.list({ limit: 200 }),
          vendorTypesApi.list({ limit: 200 }).catch((e) => {
            console.warn("Failed to load product types", e)
            return { product_types: [] as any[] }
          }),
          vendorTagsApi.list({ limit: 500 }).catch((e) => {
            console.warn("Failed to load product tags", e)
            return { product_tags: [] as any[] }
          }),
        ])
        setCategories(catData.product_categories || [])
        setCollections(colData.collections || [])
        setProductTypes((typesRes as any).product_types || [])
        setProductTags((tagsRes as any).product_tags || [])
      } catch (err: any) {
        if (err?.status === 403) {
          router.push("/pending")
          return
        }
        console.error("Failed to load reference data", err)
      }
    })()
  }, [router])

  const categoryByName = useMemo(() => {
    const map = new Map<string, string>()
    categories.forEach((c) => {
      if (c?.name) map.set(String(c.name).toLowerCase().trim(), c.id)
    })
    return map
  }, [categories])

  const collectionByName = useMemo(() => {
    const map = new Map<string, string>()
    collections.forEach((c) => {
      if (c?.title) map.set(String(c.title).toLowerCase().trim(), c.id)
    })
    return map
  }, [collections])

  const requiredImages = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => {
      if (r.thumbnailRef) set.add(normalizeImageKey(r.thumbnailRef))
      r.imageRefs.forEach((name) => set.add(normalizeImageKey(name)))
    })
    return Array.from(set)
  }, [rows])

  const totalImages = requiredImages.length
  const uploadedImages = requiredImages.filter(
    (k) => imageMap[k]?.status === "uploaded"
  ).length
  const missingImages = requiredImages.filter((k) => {
    const s = imageMap[k]
    return !s || s.status === "missing" || s.status === "error"
  })

  const uniqueBrands = useMemo(() => {
    const map = new Map<
      string,
      {
        display: string
        rowNumbers: number[]
        letterFilenames: Set<string>
      }
    >()
    rows.forEach((r) => {
      if (r.errors.length > 0) return
      const key = normalizeBrandKey(r.brand)
      const display = (r.brand || "").trim() || "Unbranded"
      const existing = map.get(key)
      if (existing) {
        existing.rowNumbers.push(r.rowNumber)
        if (r.brandLetterRef) existing.letterFilenames.add(r.brandLetterRef)
      } else {
        map.set(key, {
          display,
          rowNumbers: [r.rowNumber],
          letterFilenames: new Set(r.brandLetterRef ? [r.brandLetterRef] : []),
        })
      }
    })
    return Array.from(map.entries()).map(([key, value]) => {
      const filenames = Array.from(value.letterFilenames)
      return {
        key,
        display: value.display,
        rowNumbers: value.rowNumbers,
        // First filename is treated as the canonical expected file for the brand.
        expectedLetter: filenames[0] || "",
        // If rows of the same brand list different filenames, surface them so we
        // can warn the vendor.
        conflictingLetters: filenames.length > 1 ? filenames : [],
      }
    })
  }, [rows])

  const allBrandsReady = uniqueBrands.every((b) => brandReady(brandAuthMap[b.key]))

  // Whenever the set of unique brands changes, kick off a check for any we
  // haven't seen yet. We dedupe via a ref so the effect can depend only on
  // `uniqueBrands` and we never cancel our own in-flight axios call.
  useEffect(() => {
    if (!uniqueBrands.length) return
    const token =
      typeof window !== "undefined" ? localStorage.getItem("vendor_token") : null
    if (!token) return

    const API_URL =
      process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"

    uniqueBrands.forEach(async ({ key, display }) => {
      if (brandsCheckedRef.current.has(key)) return
      brandsCheckedRef.current.add(key)

      setBrandAuthMap((prev) => ({ ...prev, [key]: { status: "checking" } }))

      try {
        const res = await axios.get(
          `${API_URL}/vendor/brands/check-authorization`,
          {
            params: { brand_name: display },
            headers: { Authorization: `Bearer ${token}` },
          }
        )
        const data = res.data || {}
        const status = data.status as string | undefined
        const fileUrl: string | undefined = data.authorization?.file_url
        if (status === "authorized") {
          setBrandAuthMap((prev) => ({
            ...prev,
            [key]: { status: "authorized", fileUrl },
          }))
        } else if (status === "pending") {
          setBrandAuthMap((prev) => ({
            ...prev,
            [key]: { status: "pending", fileUrl },
          }))
        } else {
          setBrandAuthMap((prev) => ({ ...prev, [key]: { status: "missing" } }))
        }
      } catch (err: any) {
        const message =
          err?.response?.data?.message ||
          err?.message ||
          "Failed to check brand authorization"
        // Allow a retry on the next render if it failed.
        brandsCheckedRef.current.delete(key)
        setBrandAuthMap((prev) => ({
          ...prev,
          [key]: { status: "error", message },
        }))
      }
    })
  }, [uniqueBrands])

  const handleBrandLetterPicked = async (
    brandKey: string,
    brandDisplay: string,
    file: File
  ) => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("vendor_token") : null
    if (!token) {
      toast.error("Not authenticated", { description: "Please sign in again" })
      return
    }
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]
    const extOk = /\.(pdf|jpe?g|png|docx?)$/i.test(file.name)
    if (!extOk && file.type && !allowed.includes(file.type)) {
      toast.error("Unsupported file", {
        description: "Brand authorization must be PDF, DOC, DOCX, JPG, or PNG",
      })
      return
    }

    brandsCheckedRef.current.add(brandKey)
    setBrandAuthMap((prev) => ({
      ...prev,
      [brandKey]: { status: "uploading", file },
    }))

    try {
      const API_URL =
        process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
      const fd = new FormData()
      fd.append("brand_name", brandDisplay)
      fd.append("file", file)

      const res = await axios.post(
        `${API_URL}/vendor/brands/upload-authorization`,
        fd,
        { headers: { Authorization: `Bearer ${token}` } }
      )

      const fileUrl: string | undefined = res.data?.authorization?.file_url
      setBrandAuthMap((prev) => ({
        ...prev,
        [brandKey]: { status: "uploaded", fileUrl },
      }))
      toast.success("Letter uploaded", {
        description: `Brand letter saved for "${brandDisplay}". It will be applied to every row using this brand.`,
      })
    } catch (err: any) {
      const message =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        "Failed to upload brand letter"
      setBrandAuthMap((prev) => ({
        ...prev,
        [brandKey]: { status: "error", message },
      }))
      toast.error("Upload failed", { description: message })
    }
  }

  const handleDownloadTemplate = () => {
    const exampleRow: Record<string, string> = {}
    TEMPLATE_HEADERS.forEach((h) => {
      exampleRow[h.key] = h.example
    })
    const ws = XLSX.utils.json_to_sheet([exampleRow], {
      header: TEMPLATE_HEADERS.map((h) => h.key),
    })

    const range = XLSX.utils.decode_range(ws["!ref"] || "A1")
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c })
      const cell = ws[cellRef]
      if (cell) {
        cell.v = `${cell.v}${TEMPLATE_HEADERS[c]?.required ? " *" : ""}`
      }
    }
    ws["!cols"] = TEMPLATE_HEADERS.map(() => ({ wch: 22 }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Products")

    const instructions = [
      ["Bulk Product Upload — Instructions"],
      [],
      ["1. Fill in one product per row in the 'Products' sheet."],
      ["2. Required columns are marked with an asterisk (*)."],
      ["3. Brand and Title are used to auto-generate the SKU when SKU is left blank."],
      ["   SKU format: <FIRST 3 LETTERS OF BRAND>-<FIRST 2 LETTERS OF TITLE><6 RANDOM DIGITS>"],
      ["   Example: brand 'Nike' + title 'Winter Jacket' → 'NIK-WI348215'."],
      ["4. Discount % is auto-calculated from Price INR and Discounted Price INR."],
      ["   You can leave the Discount % column blank — the system will compute it."],
      ["5. Boolean columns accept Yes/No, True/False, 1/0."],
      ["6. Tags should be comma-separated (e.g. 'winter, jacket, outdoor')."],
      ["7. Category and Subcategory: use Category for the top-level category name"],
      ["   (e.g. 'Home Appliances') and Subcategory for the child category"],
      ["   (e.g. 'Kettles'). Both must match existing entries by name."],
      ["   You can leave Subcategory blank — the product will be placed in"],
      ["   the parent category. If a value doesn't match you can fix it"],
      ["   directly in the portal without re-uploading."],
      ["   Collection must also match an existing entry by name."],
      ["8. Type and Tags don't need to pre-exist — leaving a brand-new value"],
      ["   in those columns will auto-create the matching entry in Medusa"],
      ["   on publish."],
      ["9. Brand authorization must be approved by admin before products can be created."],
      [],
      ["Images — two ways to add them:"],
      [""],
      ["  Method A — Embed images directly in cells (recommended, Excel 2021 / M365 only):"],
      ["  • Click the cell (Thumbnail, Image 1, Image 2, ...), then Insert → Picture in Cell."],
      ["  • One image per cell. Use as many Image columns as you have photos."],
      ["  • Need more than 5 images per product? Duplicate columns Image 6, Image 7, ..."],
      ["  • The portal extracts the image bytes from the .xlsx and uploads them to S3."],
      ["  • No separate dropzone step needed."],
      [""],
      ["  Method B — Type filenames + drop files separately (works in any Excel version):"],
      ["  • Type the filename of each image in its cell (e.g. winter-jacket-1.jpg)."],
      ["  • After uploading the .xlsx, the portal shows an image dropzone — drop all the"],
      ["    matching image files there. Filenames are matched case-insensitively."],
      [""],
      ["  You can mix and match — some cells embedded, some by filename, in the same row."],
      [""],
      ["  Legacy: the old single 'Images' column with comma-separated filenames is still"],
      ["  supported, so templates downloaded earlier keep working."],
      [],
      ["Brand authorization letters:"],
      ["• Use the 'Brand Letter' column to reference the letter file for that"],
      ["  brand by filename (e.g. nike-letter.pdf). It's optional — you can also"],
      ["  pick the file directly in the portal."],
      ["• You only need ONE letter per unique brand. If 10 rows share the same"],
      ["  brand, they all share the same letter — write the same filename in"],
      ["  every row, or leave the column blank and pick it once in the portal."],
      ["• Supported formats: PDF, DOC, DOCX, JPG, PNG."],
      ["• After uploading the Excel, the portal lists every distinct brand"],
      ["  found across the rows. Brands with an already-approved or pending"],
      ["  letter need no action; new brands get a single drop-zone where you"],
      ["  drop the actual file. The file is saved to S3 and applied to every"],
      ["  row that uses that brand."],
    ]
    const wsInfo = XLSX.utils.aoa_to_sheet(instructions)
    wsInfo["!cols"] = [{ wch: 110 }]
    XLSX.utils.book_append_sheet(wb, wsInfo, "Instructions")

    XLSX.writeFile(wb, "vendor-products-template.xlsx")
    toast.success("Template downloaded", {
      description: "Fill in the Products sheet and upload it back here.",
    })
  }

  const parseRows = (raw: RawRow[]): ParsedRow[] => {
    const usedSkus = new Set<string>()
    return raw.map((r, idx) => {
      const rowNumber = idx + 2 // +1 for header, +1 for 1-based
      const errors: string[] = []
      const warnings: string[] = []

      const get = (k: string): unknown => {
        const direct = r[k]
        if (direct !== undefined) return direct
        const wantedKey = k.toLowerCase().replace(/\s+|\*/g, "")
        for (const key of Object.keys(r)) {
          const norm = key.toLowerCase().replace(/\s+|\*/g, "")
          if (norm === wantedKey) return r[key]
        }
        return undefined
      }

      const title = toStr(get("Title"))
      const brand = toStr(get("Brand"))
      const price = toNumStr(get("Price INR"))
      const discountedPrice = toNumStr(get("Discounted Price INR"))

      if (!title) errors.push("Title is required")
      if (!brand) errors.push("Brand is required (used to generate SKU)")
      if (!price) errors.push("Price INR is required")

      const numPrice = parseFloat(price)
      const numDiscount = parseFloat(discountedPrice)
      if (price && (!Number.isFinite(numPrice) || numPrice < 0)) {
        errors.push("Price INR must be a positive number")
      }
      if (discountedPrice && (!Number.isFinite(numDiscount) || numDiscount < 0)) {
        errors.push("Discounted Price INR must be a positive number")
      }
      if (
        Number.isFinite(numPrice) &&
        Number.isFinite(numDiscount) &&
        numDiscount > numPrice
      ) {
        warnings.push("Discounted price is higher than base price — discount % will be 0")
      }

      const categoryName = toStr(get("Category"))
      const subcategoryName = toStr(get("Subcategory"))
      const collectionName = toStr(get("Collection"))

      // Resolve parent category (Category column)
      const matchedParentId = categoryName
        ? categoryByName.get(categoryName.toLowerCase())
        : undefined
      if (categoryName && !matchedParentId) {
        warnings.push(`Category "${categoryName}" not found — request auto-submitted for admin review`)
      }

      // Resolve subcategory, then determine the final category ID to assign
      let finalCategoryId: string | undefined = matchedParentId
      let resolvedParentCategoryId: string | undefined = matchedParentId
      // Tracks what to pre-fill in the "Request new category" remark
      let autoCategoryRequest = ""

      if (!matchedParentId && categoryName) {
        // The whole parent category is new — request it
        autoCategoryRequest = categoryName
      }

      if (subcategoryName) {
        if (matchedParentId) {
          // Look for a subcategory whose parent is the matched parent
          const subcat = categories.find(
            (c) =>
              (c.name || "").toLowerCase().trim() === subcategoryName.toLowerCase().trim() &&
              c.parent_category_id === matchedParentId
          )
          if (subcat) {
            finalCategoryId = subcat.id
          } else {
            warnings.push(
              `Subcategory "${subcategoryName}" not found under "${categoryName}" — request auto-submitted for admin review`
            )
            // Request the subcategory under the known parent
            autoCategoryRequest = `${subcategoryName} (under ${categoryName})`
          }
        } else {
          // No parent given — try to find subcategory anywhere in the tree
          const subcat = categories.find(
            (c) =>
              (c.name || "").toLowerCase().trim() === subcategoryName.toLowerCase().trim() &&
              !!c.parent_category_id
          )
          if (subcat) {
            finalCategoryId = subcat.id
            resolvedParentCategoryId = subcat.parent_category_id || undefined
          } else {
            warnings.push(`Subcategory "${subcategoryName}" not found — request auto-submitted for admin review`)
            autoCategoryRequest = autoCategoryRequest
              ? `${autoCategoryRequest} > ${subcategoryName}`
              : subcategoryName
          }
        }
      }

      const matchedCollectionId = collectionName
        ? collectionByName.get(collectionName.toLowerCase())
        : undefined
      const autoCollectionRequest = collectionName && !matchedCollectionId ? collectionName : ""
      if (collectionName && !matchedCollectionId) {
        warnings.push(`Collection "${collectionName}" not found — request auto-submitted for admin review`)
      }

      let sku = toStr(get("SKU"))
      if (!sku || sku.toLowerCase() === "(auto)") {
        sku = brand && title ? generateSku(brand, title, usedSkus) : ""
      } else if (!isValidSkuFormat(sku)) {
        warnings.push(
          `Provided SKU "${sku}" doesn't match BRAND-PRODUCTNNNNNN format — kept as-is`
        )
        if (usedSkus.has(sku)) errors.push("Duplicate SKU within this file")
        usedSkus.add(sku)
      } else {
        if (usedSkus.has(sku)) errors.push("Duplicate SKU within this file")
        usedSkus.add(sku)
      }

      const discountableRaw = get("Discountable")
      const discountable = discountableRaw === undefined || discountableRaw === ""
        ? true
        : !falsy(discountableRaw)

      const managedInventoryRaw = get("Managed Inventory")
      const managedInventory =
        managedInventoryRaw === undefined || managedInventoryRaw === ""
          ? true
          : !falsy(managedInventoryRaw)

      const allowBackorder = truthy(get("Allow Backorder"))

      const tagsRaw = toStr(get("Tags"))
      const tags = tagsRaw
        ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
        : []

      const thumbnailRef = toStr(get("Thumbnail"))

      // Collect image filenames from:
      //   - Image 1, Image 2, ... Image N columns (one filename each)
      //   - Legacy "Images" column (comma-separated, kept for older templates)
      // Both produce strings of filenames the user is expected to upload via
      // the dropzone unless they used embedded images (handled separately).
      const imageRefs: string[] = []
      for (const headerKey of Object.keys(r)) {
        if (!IMAGE_COLUMN_PATTERN.test(headerKey)) continue
        const v = toStr(get(headerKey))
        if (v) imageRefs.push(v)
      }
      const legacyImagesRaw = toStr(get(LEGACY_IMAGES_COLUMN))
      if (legacyImagesRaw) {
        for (const piece of legacyImagesRaw.split(",")) {
          const t = piece.trim()
          if (t) imageRefs.push(t)
        }
      }
      const brandLetterRef = toStr(get("Brand Letter"))

      return {
        rowNumber,
        title,
        subtitle: toStr(get("Subtitle")),
        handle: toStr(get("Handle")),
        description: toStr(get("Description")),
        brand,
        category: categoryName,
        subcategory: subcategoryName,
        collection: collectionName,
        tags,
        type: toStr(get("Type")),
        discountable,
        height: toNumStr(get("Height")),
        width: toNumStr(get("Width")),
        length: toNumStr(get("Length")),
        weight: toNumStr(get("Weight")),
        midCode: toStr(get("MID Code")),
        hsCode: toStr(get("HS Code")),
        countryOfOrigin: toStr(get("Country of Origin")),
        variantTitle: toStr(get("Variant Title")) || "Default variant",
        sku,
        managedInventory,
        allowBackorder,
        inventoryCount: toNumStr(get("Inventory Count")),
        price,
        discountedPrice,
        discountPercent: computeDiscountPercent(price, discountedPrice),
        thumbnailRef,
        imageRefs,
        brandLetterRef,
        selectedCategoryId: finalCategoryId,
        resolvedParentCategoryId,
        categoryRequest: autoCategoryRequest,
        selectedCollectionId: matchedCollectionId,
        collectionRequest: autoCollectionRequest,
        errors,
        warnings,
        status: errors.length > 0 ? "failed" : "pending",
        errorMessage: errors[0],
      }
    })
  }

  const handleFile = async (file: File) => {
    setFileName(file.name)
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: "array" })
      const sheetName =
        workbook.SheetNames.find((n) => n.toLowerCase().includes("product")) ||
        workbook.SheetNames[0]
      if (!sheetName) {
        toast.error("Empty file", { description: "No sheets were found in this Excel file" })
        return
      }
      const sheet = workbook.Sheets[sheetName]
      const json = XLSX.utils.sheet_to_json<RawRow>(sheet, {
        defval: "",
        raw: false,
      })
      if (!json.length) {
        toast.error("Empty sheet", { description: "No product rows found in the sheet" })
        return
      }
      const parsed = parseRows(json)

      // -------- Embedded "Images in Cells" support (Excel 2021+ / M365) --------
      //
      // When a user uses Excel's "Insert Picture in Cell" feature instead of
      // typing filenames, the cells look empty to SheetJS but actually carry
      // a vm="N" rich-data reference. We extract those binaries out of the
      // .xlsx ZIP, figure out which row + column each one belongs to, and
      // inject them into the parsed rows so they behave exactly like images
      // the user uploaded manually via the dropzone.
      //
      // Mapping rules:
      //   Thumbnail column → row.thumbnailRef (overwrites blank or appends)
      //   Images column    → row.imageRefs (appended)
      //   Brand Letter     → silently ignored here; the brand-letter flow has
      //                      its own UI dropzone and doesn't go through ImageMap.
      //
      // Synthetic filename format keeps embedded images isolated from any
      // filename-based refs in the same row, so we never collide.
      let embeddedImageSeed: ImageMap = {}
      let embeddedCount = 0
      try {
        const embedded = await extractEmbeddedImages(file)
        if (embedded.length > 0) {
          // Build "header text -> column letter" map by reading row 1.
          const headerRows = XLSX.utils.sheet_to_json<RawRow>(sheet, {
            header: 1,
            defval: "",
            raw: false,
          }) as unknown as unknown[][]
          const headerRow = (headerRows[0] as string[]) || []
          const headerToColumn = new Map<string, string>()
          headerRow.forEach((label, idx) => {
            if (typeof label === "string" && label.trim()) {
              headerToColumn.set(label.trim(), indexToColumnLetter(idx + 1))
            }
          })

          const thumbnailColumn = headerToColumn.get("Thumbnail")
          // Collect every column letter that holds product images:
          //   - Image 1, Image 2, ... Image N  (current template, 1 image each)
          //   - Images                          (legacy template, one cell only)
          // Embedded images in any of these columns funnel into row.imageRefs.
          const imagesColumnLetters = new Set<string>()
          headerRow.forEach((label, idx) => {
            if (typeof label !== "string") return
            const trimmed = label.trim()
            if (IMAGE_COLUMN_PATTERN.test(trimmed) || trimmed === LEGACY_IMAGES_COLUMN) {
              imagesColumnLetters.add(indexToColumnLetter(idx + 1))
            }
          })
          // Only consider this sheet's embeddings; sheet name from SheetJS
          // matches what extractEmbeddedImages reports because both read
          // it from workbook.xml.
          const embeddedThisSheet = embedded.filter(
            (e) => e.sheetName === sheetName
          )

          // Group cells by row so multiple Images-column embeddings (rare but
          // possible if the user duplicates the column) all land in the same
          // row's imageRefs.
          const byRow = new Map<number, typeof embedded>()
          for (const e of embeddedThisSheet) {
            const addr = splitCellAddress(e.cellAddress)
            if (!addr) continue
            const list = byRow.get(addr.row) || []
            list.push(e)
            byRow.set(addr.row, list)
          }

          parsed.forEach((row) => {
            // ParsedRow.rowNumber is the sheet row number (1-based, with
            // row 1 being headers), so data rows start at 2. parseRows()
            // already sets rowNumber correctly so we trust it here.
            const sheetRow = row.rowNumber
            const cells = byRow.get(sheetRow) || []

            for (const e of cells) {
              const addr = splitCellAddress(e.cellAddress)
              if (!addr) continue

              if (thumbnailColumn && addr.column === thumbnailColumn) {
                const synthName = `__embedded_r${sheetRow}_thumbnail_${e.file.name}`
                // Wrap the original File with the synthetic name so the
                // matching code in handleImagesPicked stays happy.
                const namedFile = new File([e.file], synthName, {
                  type: e.file.type,
                })
                row.thumbnailRef = synthName
                embeddedImageSeed[normalizeImageKey(synthName)] = {
                  status: "selected",
                  file: namedFile,
                }
                embeddedCount++
              } else if (imagesColumnLetters.has(addr.column)) {
                // Each Image-N column carries one image (Excel's Images-in-
                // Cells feature is one-image-per-cell). We append every match
                // to the row's image list, so a product can carry as many
                // photos as the template has Image columns.
                const synthName = `__embedded_r${sheetRow}_image_${row.imageRefs.length + 1}_${e.file.name}`
                const namedFile = new File([e.file], synthName, {
                  type: e.file.type,
                })
                row.imageRefs.push(synthName)
                embeddedImageSeed[normalizeImageKey(synthName)] = {
                  status: "selected",
                  file: namedFile,
                }
                embeddedCount++
              }
              // Anything in other columns (Brand Letter etc.) is ignored —
              // brand letters have their own dedicated dropzone & flow.
            }
          })
        }
      } catch (embedErr) {
        // Don't block parsing if rich-data extraction fails — fall back to
        // the legacy filename-based flow which still works fine.
        console.warn("Embedded image extraction failed:", embedErr)
      }
      // ----------------------------------------------------------------------

      setRows(parsed)

      // Pre-populate the two-level category picker's parent state from parsed data
      const initialParentIds: Record<number, string> = {}
      const initialOpenCatReqs = new Set<number>()
      const initialOpenColReqs = new Set<number>()
      parsed.forEach((row, idx) => {
        if (row.resolvedParentCategoryId) {
          initialParentIds[idx] = row.resolvedParentCategoryId
        }
        // Auto-open request editors for rows that have unresolved Excel values
        if (row.categoryRequest) initialOpenCatReqs.add(idx)
        if (row.collectionRequest) initialOpenColReqs.add(idx)
      })
      setRowParentCatIds(initialParentIds)
      setOpenCategoryRequestRows(initialOpenCatReqs)
      setOpenCollectionRequestRows(initialOpenColReqs)

      const seeded: ImageMap = { ...embeddedImageSeed }
      parsed.forEach((r) => {
        const allRefs = [r.thumbnailRef, ...r.imageRefs].filter(Boolean)
        allRefs.forEach((name) => {
          const key = normalizeImageKey(name)
          // Don't downgrade an already-seeded embedded image to "missing".
          if (!seeded[key]) seeded[key] = { status: "missing" }
        })
      })
      setImageMap(seeded)
      setPhase("preview")
      toast.success("File parsed", {
        description:
          embeddedCount > 0
            ? `${parsed.length} row(s) loaded — ${embeddedCount} image(s) extracted from cells.`
            : `${parsed.length} row(s) loaded — review and fix any errors before publishing.`,
      })

      // Auto-upload extracted embedded images to S3 so they show up as
      // "ready" without the user having to drag them into the dropzone.
      // We pass the explicit key/file pairs we already built during
      // extraction — bypassing handleImagesPicked's filename-matching
      // step which doesn't apply here (the files have synthetic names
      // that intentionally don't match any user-typed filename).
      const embeddedToUpload = Object.entries(embeddedImageSeed)
        .filter(([, v]) => v.status === "selected" && (v as { file?: File }).file)
        .map(([key, v]) => ({ key, file: (v as { file: File }).file }))

      if (embeddedToUpload.length > 0) {
        const { ok, failed } = await uploadMatchedFiles(embeddedToUpload)
        if (failed === 0) {
          toast.success("Embedded images uploaded", {
            description: `${ok}/${embeddedToUpload.length} image(s) ready`,
          })
        } else {
          toast.error("Some embedded images failed", {
            description: `${ok}/${embeddedToUpload.length} uploaded, ${failed} failed — check the rows in red`,
          })
        }
      }
    } catch (err: any) {
      console.error("Excel parse error", err)
      toast.error("Failed to read Excel", {
        description: err?.message || "Could not parse the uploaded file",
      })
    }
  }

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await handleFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) await handleFile(file)
  }

  /**
   * Pure S3 uploader: take a list of pre-matched {key, file} pairs and POST
   * each one to the vendor image endpoint, transitioning the imageMap entry
   * through "uploading" → "uploaded"/"error".
   *
   * Extracted from handleImagesPicked so embedded-image extraction in
   * handleFile can call it directly without going through the filename-
   * matching step (those files don't have user-typed filenames to match
   * against — we already know which imageMap key each one belongs to).
   *
   * Returns the count of successes & failures so callers can show their
   * own toast.
   */
  const uploadMatchedFiles = async (
    matched: Array<{ key: string; file: File }>
  ): Promise<{ ok: number; failed: number }> => {
    if (!matched.length) return { ok: 0, failed: 0 }

    const token =
      typeof window !== "undefined" ? localStorage.getItem("vendor_token") : null
    if (!token) {
      toast.error("Not authenticated", { description: "Please sign in again" })
      return { ok: 0, failed: matched.length }
    }

    setUploadingImages(true)
    setImageMap((prev) => {
      const next = { ...prev }
      matched.forEach(({ key, file }) => {
        next[key] = { status: "uploading", file }
      })
      return next
    })

    const API_URL =
      process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"

    // Track per-call success/failure rather than relying on the post-await
    // imageMap closure (which can be stale from a still-batched setState).
    let okCount = 0
    let failedCount = 0

    await Promise.all(
      matched.map(async ({ key, file }) => {
        try {
          const fd = new FormData()
          fd.append("productName", "bulk-upload")
          fd.append("files", file)

          const res = await axios.post(
            `${API_URL}/vendor/products/upload-image`,
            fd,
            { headers: { Authorization: `Bearer ${token}` } }
          )
          const uploaded = res.data?.files?.[0]
          if (!uploaded?.url) throw new Error("Upload returned no URL")

          setImageMap((prev) => ({
            ...prev,
            [key]: {
              status: "uploaded",
              url: uploaded.url,
              key: uploaded.key,
              originalName: uploaded.originalName || file.name,
            },
          }))
          okCount++
        } catch (err: any) {
          const message =
            err?.response?.data?.message ||
            err?.message ||
            "Failed to upload image"
          setImageMap((prev) => ({
            ...prev,
            [key]: { status: "error", file, message },
          }))
          failedCount++
        }
      })
    )

    setUploadingImages(false)
    return { ok: okCount, failed: failedCount }
  }

  const handleImagesPicked = async (files: File[]) => {
    if (!files.length) return

    const acceptedExts = /\.(jpe?g|png|gif|webp|avif|svg)$/i
    const accepted: File[] = []
    const ignored: string[] = []
    files.forEach((f) => {
      if (acceptedExts.test(f.name) || f.type.startsWith("image/")) {
        accepted.push(f)
      } else {
        ignored.push(f.name)
      }
    })

    if (ignored.length) {
      toast.error("Some files ignored", {
        description: `Not images: ${ignored.slice(0, 3).join(", ")}${
          ignored.length > 3 ? "…" : ""
        }`,
      })
    }
    if (!accepted.length) return

    const seenInThisDrop = new Set<string>()
    const matched: Array<{ key: string; file: File }> = []
    const unmatched: string[] = []

    accepted.forEach((file) => {
      const key = normalizeImageKey(file.name)
      if (seenInThisDrop.has(key)) return
      seenInThisDrop.add(key)
      const existing = imageMap[key]
      if (!existing || existing.status === "missing" || existing.status === "error") {
        if (key in imageMap) matched.push({ key, file })
        else unmatched.push(file.name)
      } else if (existing.status === "selected" || existing.status === "uploaded") {
        matched.push({ key, file })
      } else {
        unmatched.push(file.name)
      }
    })

    if (unmatched.length) {
      toast.error("Unreferenced files", {
        description: `${unmatched.length} file(s) don't match any filename in the Excel sheet (${unmatched
          .slice(0, 3)
          .join(", ")}${unmatched.length > 3 ? "…" : ""})`,
      })
    }

    if (!matched.length) return

    const { ok, failed } = await uploadMatchedFiles(matched)
    toast.success("Images uploaded", {
      description: `${ok}/${matched.length} image(s) ready${
        failed ? `, ${failed} failed` : ""
      }`,
    })
  }

  /**
   * Inline title edit. Updates the row's title and recomputes the
   * "Title is required" error so the row's status badge and validRows
   * counter update in real time.
   */
  const handleTitleEdit = (rowIdx: number, newTitle: string) => {
    setRows((prev) => {
      const next = [...prev]
      const row = { ...next[rowIdx] }
      row.title = newTitle

      const otherErrors = row.errors.filter((e) => e !== "Title is required")
      if (!newTitle.trim()) {
        row.errors = ["Title is required", ...otherErrors]
      } else {
        row.errors = otherErrors
      }

      // Reset pre-publish "failed" status to "pending" once the row becomes
      // valid again, so it gets picked up on the next publish click.
      if (row.errors.length === 0 && row.status === "failed" && !row.errorMessage) {
        row.status = "pending"
      } else if (row.errors.length > 0 && row.status !== "uploading" && row.status !== "success") {
        row.status = "failed"
        row.errorMessage = undefined
      }

      next[rowIdx] = row
      return next
    })
  }

  /**
   * Per-row image upload — invoked from the "+" button next to a row's
   * thumbnail. Each picked file gets a synthetic filename so it never
   * collides with anything else in imageMap, and is wired into either
   * `thumbnailRef` (for the first image of an empty row) or appended to
   * `imageRefs`.
   */
  const handleRowImagePicked = async (rowIdx: number, files: File[]) => {
    if (!files.length) return
    const acceptedExts = /\.(jpe?g|png|gif|webp|avif|svg)$/i
    const accepted = files.filter(
      (f) => acceptedExts.test(f.name) || f.type.startsWith("image/")
    )
    if (!accepted.length) {
      toast.error("Not an image", {
        description: "Pick a JPG, PNG, WebP, GIF, AVIF, or SVG file",
      })
      return
    }

    const row = rows[rowIdx]
    if (!row) return

    const matched: Array<{ key: string; file: File }> = []
    const newRefs: Array<{ name: string; isThumbnail: boolean }> = []

    accepted.forEach((file, i) => {
      const synthName = `__row${row.rowNumber}_inline_${Date.now()}_${i}_${file.name}`
      const namedFile = new File([file], synthName, { type: file.type })
      matched.push({ key: normalizeImageKey(synthName), file: namedFile })
      // First file fills the thumbnail slot if the row is missing one.
      const isThumbnail = i === 0 && !row.thumbnailRef
      newRefs.push({ name: synthName, isThumbnail })
    })

    setRows((prev) => {
      const next = [...prev]
      const r = { ...next[rowIdx] }
      newRefs.forEach(({ name, isThumbnail }) => {
        if (isThumbnail) {
          r.thumbnailRef = name
        } else {
          r.imageRefs = [...r.imageRefs, name]
        }
      })
      next[rowIdx] = r
      return next
    })

    setImageMap((prev) => {
      const nextMap = { ...prev }
      matched.forEach(({ key, file }) => {
        nextMap[key] = { status: "selected", file }
      })
      return nextMap
    })

    const { ok, failed } = await uploadMatchedFiles(matched)
    if (failed === 0) {
      toast.success("Image added", {
        description: `${ok} image${ok === 1 ? "" : "s"} attached to row #${row.rowNumber}`,
      })
    } else {
      toast.error("Some images failed", {
        description: `${ok}/${matched.length} uploaded, ${failed} failed`,
      })
    }
  }

  /**
   * Inline category override. The picker bypasses the warning when the
   * Excel cell didn't resolve, so we strip that specific warning when the
   * row gets a valid category id.
   */
  const handleCategorySelect = (rowIdx: number, categoryId: string) => {
    setRows((prev) => {
      const next = [...prev]
      const row = { ...next[rowIdx] }
      row.selectedCategoryId = categoryId || undefined
      // Once the user picks (or unsets) a real category, the legacy
      // "Category … not found — will be ignored" warning is no longer
      // accurate, so drop it. It'll be re-evaluated automatically next
      // time we publish the row.
      if (categoryId) {
        row.warnings = row.warnings.filter(
          (w) => !/^Category ".*" not found/.test(w)
        )
      }
      next[rowIdx] = row
      return next
    })
  }

  /**
   * Free-text remark requesting a brand-new category. We keep this
   * separate from selectedCategoryId — both can coexist (e.g. user picks
   * the closest existing match AND leaves a note for admin to create the
   * exact category later). The remark is persisted onto the product as
   * metadata.category_request for admins to action.
   */
  const handleCategoryRequest = (rowIdx: number, remark: string) => {
    setRows((prev) => {
      const next = [...prev]
      const row = { ...next[rowIdx] }
      row.categoryRequest = remark
      if (remark.trim()) {
        // A non-empty remark also resolves the not-found warning — admin
        // will see the request and create the category.
        row.warnings = row.warnings.filter(
          (w) => !/^Category ".*" not found/.test(w)
        )
      }
      next[rowIdx] = row
      return next
    })
  }

  /**
   * Inline collection override — same semantics as category. The user
   * can pick from the existing collections list or, for a missing one,
   * leave a remark via handleCollectionRequest.
   */
  const handleCollectionSelect = (rowIdx: number, collectionId: string) => {
    setRows((prev) => {
      const next = [...prev]
      const row = { ...next[rowIdx] }
      row.selectedCollectionId = collectionId || undefined
      if (collectionId) {
        row.warnings = row.warnings.filter(
          (w) => !/^Collection ".*" not found/.test(w)
        )
      }
      next[rowIdx] = row
      return next
    })
  }

  const handleCollectionRequest = (rowIdx: number, remark: string) => {
    setRows((prev) => {
      const next = [...prev]
      const row = { ...next[rowIdx] }
      row.collectionRequest = remark
      if (remark.trim()) {
        row.warnings = row.warnings.filter(
          (w) => !/^Collection ".*" not found/.test(w)
        )
      }
      next[rowIdx] = row
      return next
    })
  }

  /**
   * Inline product type editor. The Type column is a free-text combobox:
   * existing types get suggested as a datalist, but the vendor can also
   * type a brand-new value. New values are auto-created server-side at
   * publish time, so we don't need a separate "request" mechanism.
   */
  const handleTypeChange = (rowIdx: number, value: string) => {
    setRows((prev) => {
      const next = [...prev]
      const row = { ...next[rowIdx] }
      row.type = value
      next[rowIdx] = row
      return next
    })
  }

  /**
   * Inline tag editor — replaces the row's full tag list. Values can be
   * existing tags from the suggestion list or brand-new strings; the
   * backend dedupes against existing product_tag entities and creates
   * any that don't exist.
   */
  const handleTagsChange = (rowIdx: number, tags: string[]) => {
    setRows((prev) => {
      const next = [...prev]
      const row = { ...next[rowIdx] }
      row.tags = tags
      next[rowIdx] = row
      return next
    })
  }

  const handleImageInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length) await handleImagesPicked(files)
    if (imageInputRef.current) imageInputRef.current.value = ""
  }

  const handleImageDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length) await handleImagesPicked(files)
  }

  const validRows = rows.filter((r) => r.errors.length === 0)
  const invalidRows = rows.filter((r) => r.errors.length > 0)
  const successCount = rows.filter((r) => r.status === "success").length
  const failedAfterUpload = rows.filter(
    (r) => r.status === "failed" && r.errorMessage && r.errors.length === 0
  ).length

  const handlePublish = async () => {
    if (!validRows.length) {
      toast.error("Nothing to upload", {
        description: "Fix the errors in your Excel file and re-upload",
      })
      return
    }
    setPhase("uploading")

    const updated = [...rows]
    for (let i = 0; i < updated.length; i++) {
      const row = updated[i]
      if (row.errors.length > 0) continue
      setUploadingIndex(i)
      updated[i] = { ...row, status: "uploading", errorMessage: undefined }
      setRows([...updated])

      try {
        // Prefer the user-picked collection from the inline editor; fall
        // back to the Excel-resolved one if they didn't touch it.
        const collectionId =
          row.selectedCollectionId ||
          (row.collection
            ? collectionByName.get(row.collection.toLowerCase())
            : undefined) ||
          null
        const collectionRequest = (row.collectionRequest || "").trim()
        // Same dual-track for category.
        const categoryId =
          row.selectedCategoryId ||
          (row.category
            ? categoryByName.get(row.category.toLowerCase())
            : undefined)
        const categoryRequest = (row.categoryRequest || "").trim()

        const parseNumber = (value: string): number | null => {
          if (!value) return null
          const num = parseFloat(value)
          return Number.isFinite(num) ? num : null
        }

        const inventoryQuantity = Math.max(
          0,
          Math.floor(Number.parseInt(row.inventoryCount, 10)) || 0
        )

        const numPrice = parseFloat(row.price)
        const numDiscount = parseFloat(row.discountedPrice)
        const prices: any[] = []
        if (Number.isFinite(numPrice)) {
          prices.push({ amount: numPrice, currency_code: "inr" })
        }
        if (Number.isFinite(numDiscount) && numDiscount > 0 && numDiscount < numPrice) {
          prices.push({
            amount: numDiscount,
            currency_code: "inr",
            price_list_id: "pl_1765232034558",
          })
        }

        const lookupUrl = (name: string): string | null => {
          if (!name) return null
          const s = imageMap[normalizeImageKey(name)]
          return s && s.status === "uploaded" ? s.url : null
        }

        const thumbnailUrl = lookupUrl(row.thumbnailRef)
        const allImageUrls: string[] = []
        if (thumbnailUrl) allImageUrls.push(thumbnailUrl)
        row.imageRefs.forEach((name) => {
          const url = lookupUrl(name)
          if (url && !allImageUrls.includes(url)) allImageUrls.push(url)
        })

        const variantsPayload = [
          {
            title: row.variantTitle || "Default variant",
            sku: row.sku || undefined,
            manage_inventory: row.managedInventory,
            allow_backorder: row.allowBackorder,
            inventory_quantity: inventoryQuantity,
            prices,
          },
        ]

        await vendorProductsApi.create({
          title: row.title,
          subtitle: row.subtitle || null,
          description: row.description || null,
          handle: row.handle || null,
          is_giftcard: false,
          discountable: row.discountable,
          category_ids: categoryId ? [categoryId] : [],
          collection_id: collectionId,
          // Free-text type. The backend finds an existing product_type by
          // value or creates a new one, then assigns its id to the product.
          type: row.type ? row.type.trim() : undefined,
          // Tags as values — backend resolves/creates them and links by id.
          tags: row.tags.map((value) => ({ value })),
          images: allImageUrls.map((url) => ({ url })),
          thumbnail: thumbnailUrl || allImageUrls[0] || null,
          options: [],
          variants: variantsPayload,
          height: parseNumber(row.height),
          width: parseNumber(row.width),
          length: parseNumber(row.length),
          weight: parseNumber(row.weight),
          metadata: {
            categories: categoryId ? [categoryId] : [],
            tags: row.tags,
            brand: row.brand || null,
            mid_code: row.midCode || null,
            hs_code: row.hsCode || null,
            country_of_origin: row.countryOfOrigin || null,
            videos: null,
            // Free-text remark from the bulk-upload UI requesting a new
            // category (or providing context for the admin). Surfaced on
            // the admin product detail page via a widget. Includes the
            // raw Excel value when it didn't resolve, for context.
            ...(categoryRequest
              ? {
                  category_request: categoryRequest,
                  category_request_excel_value: row.category || null,
                  category_request_status: "pending",
                  category_request_submitted_at: new Date().toISOString(),
                }
              : {}),
            // Same pattern for collection requests.
            ...(collectionRequest
              ? {
                  collection_request: collectionRequest,
                  collection_request_excel_value: row.collection || null,
                  collection_request_status: "pending",
                  collection_request_submitted_at: new Date().toISOString(),
                }
              : {}),
          },
        })

        updated[i] = { ...updated[i], status: "success" }
      } catch (err: any) {
        const message =
          err?.data?.message || err?.message || "Failed to create product"
        updated[i] = {
          ...updated[i],
          status: "failed",
          errorMessage: message,
        }
      }
      setRows([...updated])
    }

    setUploadingIndex(null)
    setPhase("done")

    const created = updated.filter((r) => r.status === "success").length
    const failed = updated.filter((r) => r.status === "failed").length
    if (created > 0 && failed === 0) {
      toast.success("Bulk upload complete", {
        description: `${created} product(s) created successfully`,
      })
    } else if (created > 0) {
      toast.success("Partial upload", {
        description: `${created} created, ${failed} failed. Review the table for details.`,
      })
    } else {
      toast.error("Bulk upload failed", {
        description: "No products were created. Review the errors and try again.",
      })
    }
  }

  const handleReset = () => {
    setRows([])
    setFileName("")
    setPhase("intro")
    setUploadingIndex(null)
    setImageMap({})
    setUploadingImages(false)
    setBrandAuthMap({})
    brandInputRefs.current = {}
    rowImageInputRefs.current = {}
    brandsCheckedRef.current = new Set()
    setOpenCategoryRequestRows(new Set())
    setOpenCollectionRequestRows(new Set())
  }

  return (
    <VendorShell>
      <div className="p-4 md:p-8 max-w-[1400px] mx-auto">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <Heading level="h1">Bulk Upload Products</Heading>
            <Text className="text-ui-fg-subtle">
              Upload an Excel sheet to create multiple products at once. SKUs are
              auto-generated and discount % is computed for you.
            </Text>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => router.push("/products")}>
              Back to products
            </Button>
            {phase !== "intro" && (
              <Button variant="secondary" onClick={handleReset}>
                Start over
              </Button>
            )}
          </div>
        </div>

        {phase === "intro" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-ui-border-base rounded-lg p-6 bg-ui-bg-base space-y-4">
              <div className="flex items-center gap-2">
                <Badge color="blue">Step 1</Badge>
                <Text weight="plus">Download the template</Text>
              </div>
              <Text size="small" className="text-ui-fg-subtle">
                The template lists every supported column with one example row.
                Required columns are marked with <span className="font-mono">*</span>.
                Leave the SKU and Discount % columns blank — they are generated
                automatically.
              </Text>
              <Button variant="secondary" onClick={handleDownloadTemplate}>
                Download Excel template
              </Button>
            </div>

            <div
              className="border-2 border-dashed border-ui-border-base rounded-lg p-6 bg-ui-bg-base space-y-4 text-center cursor-pointer hover:bg-ui-bg-subtle transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <div className="flex items-center justify-center gap-2">
                <Badge color="blue">Step 2</Badge>
                <Text weight="plus">Upload the filled file</Text>
              </div>
              <Text size="small" className="text-ui-fg-subtle">
                Drag and drop your <span className="font-mono">.xlsx</span> /{" "}
                <span className="font-mono">.xls</span> /{" "}
                <span className="font-mono">.csv</span> file here, or click to browse.
              </Text>
              <Button
                variant="primary"
                onClick={(e) => {
                  e.stopPropagation()
                  fileInputRef.current?.click()
                }}
              >
                Choose file
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileInputChange}
              />
            </div>

            <div className="md:col-span-2 border border-ui-border-base rounded-lg p-6 bg-ui-bg-base space-y-3">
              <Text weight="plus">How SKUs are generated</Text>
              <Text size="small" className="text-ui-fg-subtle">
                SKU format:{" "}
                <span className="font-mono bg-ui-bg-subtle px-2 py-0.5 rounded">
                  &lt;BRAND_FIRST_3&gt;-&lt;PRODUCT_FIRST_2&gt;&lt;6_RANDOM_DIGITS&gt;
                </span>
              </Text>
              <Text size="small" className="text-ui-fg-subtle">
                Example: brand &quot;Nike&quot;, title &quot;Winter Jacket&quot; →{" "}
                <span className="font-mono">NIK-WI348215</span>. The trailing 6 digits
                are random per row, ensuring every SKU is unique within the upload.
              </Text>
            </div>

            <div className="md:col-span-2 border border-ui-border-base rounded-lg p-6 bg-ui-bg-base space-y-2">
              <Text weight="plus">Brand authorization letters</Text>
              <Text size="small" className="text-ui-fg-subtle">
                The Excel template has a <span className="font-mono">Brand
                Letter</span> column where you can reference the letter
                filename (e.g. <span className="font-mono">nike-letter.pdf</span>).
                You only need <span className="font-medium">one letter per
                brand</span>, no matter how many products use it — write the
                same filename for every row of the same brand, or leave it
                blank and pick the file directly in the portal.
              </Text>
              <Text size="small" className="text-ui-fg-subtle">
                After you upload the Excel, a panel lists every distinct brand.
                For brands that need a letter you&apos;ll see a drop zone — drop
                or browse the file (PDF, DOC, DOCX, JPG, or PNG). The file is
                stored on S3 and reused for every product of that brand.
              </Text>
            </div>

            <div className="md:col-span-2 border border-ui-border-base rounded-lg p-6 bg-ui-bg-base space-y-2">
              <Text weight="plus">Adding photos to your products</Text>
              <Text size="small" className="text-ui-fg-subtle">
                In the Excel file, list image filenames in the{" "}
                <span className="font-mono">Thumbnail</span> and{" "}
                <span className="font-mono">Images</span> columns (the{" "}
                <span className="font-mono">Images</span> column accepts a
                comma-separated list — e.g.{" "}
                <span className="font-mono">jacket-1.jpg, jacket-2.jpg</span>).
              </Text>
              <Text size="small" className="text-ui-fg-subtle">
                After you upload the Excel, a drop zone will appear where you can
                select or drag in those exact image files. We&apos;ll upload them to
                S3 and automatically attach each filename to the right product. The
                <span className="font-mono"> Thumbnail</span> file becomes the
                product&apos;s main image; the rest become the gallery.
              </Text>
            </div>
          </div>
        )}

        {(phase === "preview" || phase === "uploading" || phase === "done") && (
          <div className="space-y-4">
            <div className="border border-ui-border-base rounded-lg p-4 bg-ui-bg-base flex flex-wrap items-center gap-3 justify-between">
              <div>
                <Text size="small" className="text-ui-fg-subtle">File</Text>
                <Text weight="plus">{fileName}</Text>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Badge color="grey">Total: {rows.length}</Badge>
                <Badge color="green">Valid: {validRows.length}</Badge>
                {invalidRows.length > 0 && (
                  <Badge color="red">Errors: {invalidRows.length}</Badge>
                )}
                {phase === "done" && (
                  <>
                    <Badge color="green">Created: {successCount}</Badge>
                    {failedAfterUpload > 0 && (
                      <Badge color="red">Failed: {failedAfterUpload}</Badge>
                    )}
                  </>
                )}
              </div>
              <div className="flex gap-2">
                {phase === "preview" && (
                  <Button
                    variant="primary"
                    onClick={handlePublish}
                    disabled={
                      validRows.length === 0 ||
                      uploadingImages ||
                      !allBrandsReady
                    }
                  >
                    Publish {validRows.length} product
                    {validRows.length === 1 ? "" : "s"}
                  </Button>
                )}
                {phase === "done" && (
                  <Button variant="primary" onClick={() => router.push("/products")}>
                    Go to products
                  </Button>
                )}
              </div>
            </div>

            {uniqueBrands.length > 0 && phase !== "uploading" && (
              <div className="border border-ui-border-base rounded-lg p-4 bg-ui-bg-base space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <Text weight="plus">Brand authorization letters</Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      Upload one letter per brand. We&apos;ll apply it to every row
                      that uses that brand — no need to re-upload for each product.
                    </Text>
                  </div>
                  <Badge color={allBrandsReady ? "green" : "orange"}>
                    {uniqueBrands.filter((b) => brandReady(brandAuthMap[b.key])).length}{" "}
                    / {uniqueBrands.length} ready
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {uniqueBrands.map(
                    ({
                      key,
                      display,
                      rowNumbers,
                      expectedLetter,
                      conflictingLetters,
                    }) => {
                      const state = brandAuthMap[key]
                      const status = state?.status || "checking"
                      const triggerPicker = () => {
                        const input = brandInputRefs.current[key]
                        if (input) input.click()
                      }
                      const onCardDrop = (e: React.DragEvent<HTMLElement>) => {
                        e.preventDefault()
                        const f = e.dataTransfer.files?.[0]
                        if (f) handleBrandLetterPicked(key, display, f)
                      }

                      let badge: React.ReactNode = (
                        <Badge color="grey">Checking…</Badge>
                      )
                      if (status === "authorized")
                        badge = <Badge color="green">Authorized</Badge>
                      else if (status === "pending")
                        badge = <Badge color="orange">Awaiting admin</Badge>
                      else if (status === "uploaded")
                        badge = <Badge color="green">Letter uploaded</Badge>
                      else if (status === "uploading")
                        badge = <Badge color="blue">Uploading…</Badge>
                      else if (status === "missing")
                        badge = <Badge color="red">Letter required</Badge>
                      else if (status === "error")
                        badge = <Badge color="red">Error</Badge>

                      return (
                        <div
                          key={key}
                          className="border border-ui-border-base rounded-md p-3 bg-ui-bg-subtle/50 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <Text weight="plus" className="truncate">
                                {display}
                              </Text>
                              <Text size="xsmall" className="text-ui-fg-subtle">
                                Used in {rowNumbers.length} row
                                {rowNumbers.length === 1 ? "" : "s"}
                                {rowNumbers.length <= 8
                                  ? ` (${rowNumbers.map((n) => `#${n}`).join(", ")})`
                                  : ""}
                              </Text>
                              {expectedLetter && (
                                <Text size="xsmall" className="text-ui-fg-subtle mt-0.5">
                                  Expected file from Excel:{" "}
                                  <span className="font-mono">{expectedLetter}</span>
                                </Text>
                              )}
                              {conflictingLetters.length > 0 && (
                                <Text size="xsmall" className="text-amber-600 mt-0.5">
                                  Rows for this brand list different filenames
                                  ({conflictingLetters.join(", ")}). Only one
                                  letter is needed per brand — using the first.
                                </Text>
                              )}
                            </div>
                            {badge}
                          </div>

                          {(status === "missing" ||
                            status === "uploading" ||
                            status === "error") && (
                            <>
                              <button
                                onClick={triggerPicker}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={onCardDrop}
                                disabled={status === "uploading"}
                                className={clx(
                                  "w-full border-2 border-dashed border-ui-border-base rounded-md py-3 px-2 text-xs text-ui-fg-subtle hover:bg-ui-bg-base transition-colors text-center",
                                  status === "uploading" &&
                                    "opacity-60 cursor-not-allowed"
                                )}
                              >
                                {status === "uploading" ? (
                                  <>
                                    Uploading{" "}
                                    {state && "file" in state ? state.file.name : ""}…
                                  </>
                                ) : expectedLetter ? (
                                  <>
                                    Drop{" "}
                                    <span className="font-mono">{expectedLetter}</span>{" "}
                                    here, or click to browse (PDF, DOC, DOCX, JPG, PNG)
                                  </>
                                ) : (
                                  <>
                                    Drop or click to upload letter (PDF, DOC, DOCX,
                                    JPG, PNG)
                                  </>
                                )}
                              </button>
                              <input
                                ref={(el) => {
                                  brandInputRefs.current[key] = el
                                }}
                                type="file"
                                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0]
                                  if (f) handleBrandLetterPicked(key, display, f)
                                  e.target.value = ""
                                }}
                              />
                            </>
                          )}

                          {status === "error" && state && "message" in state && (
                            <Text size="xsmall" className="text-red-600">
                              {state.message} — click above to retry
                            </Text>
                          )}

                          {status === "pending" && (
                            <Text size="xsmall" className="text-amber-600">
                              Already submitted previously — products can be
                              published; admin approval is still needed for them
                              to go live.
                            </Text>
                          )}

                          {status === "authorized" && (
                            <Text size="xsmall" className="text-emerald-600">
                              Approved by admin — nothing else to do.
                            </Text>
                          )}

                          {status === "uploaded" && (
                            <Text size="xsmall" className="text-emerald-600">
                              Letter saved on S3. Will be reused for every row of
                              this brand.
                            </Text>
                          )}
                        </div>
                      )
                    }
                  )}
                </div>
              </div>
            )}

            {totalImages > 0 && phase !== "uploading" && (
              <div className="border border-ui-border-base rounded-lg p-4 bg-ui-bg-base space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <Text weight="plus">Product images (bulk drop)</Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      Drop the image files referenced in your Excel sheet, or
                      add images directly to a single product using the{" "}
                      <span className="font-mono">+</span> button next to that
                      row in the table below. Filenames are matched
                      case-insensitively.
                    </Text>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge color={uploadedImages === totalImages ? "green" : "orange"}>
                      {uploadedImages} / {totalImages} uploaded
                    </Badge>
                    {uploadingImages && <Badge color="blue">Uploading…</Badge>}
                  </div>
                </div>

                <div
                  className="border-2 border-dashed border-ui-border-base rounded-lg p-5 text-center cursor-pointer hover:bg-ui-bg-subtle transition-colors"
                  onClick={() => imageInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleImageDrop}
                >
                  <Text size="small" className="text-ui-fg-subtle">
                    Drag images here, or{" "}
                    <span className="text-ui-fg-interactive font-medium">
                      click to browse
                    </span>
                    . Supported: JPG, PNG, WebP, GIF.
                  </Text>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageInputChange}
                  />
                </div>

                {missingImages.length > 0 && (
                  <div className="text-xs text-amber-600">
                    Still needed: {missingImages.slice(0, 5).join(", ")}
                    {missingImages.length > 5 ? ` +${missingImages.length - 5} more` : ""}
                  </div>
                )}
              </div>
            )}

            {phase === "preview" && (
              <div className="border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 flex items-start gap-3">
                <div className="shrink-0 mt-0.5 text-blue-600 dark:text-blue-400">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" />
                  </svg>
                </div>
                <Text size="small" className="text-blue-900 dark:text-blue-200">
                  <span className="font-medium">Edit rows in place.</span>{" "}
                  Click the title to rename, the{" "}
                  <span className="font-mono">+</span> next to a row to
                  add an image, and use the inline editors to change the
                  category, subcategory, collection, type, or tags. New
                  types and tags are auto-created in Medusa on publish;
                  missing categories/collections can be requested via{" "}
                  <span className="italic">Request new</span> for admin
                  review. Changes are saved here and applied when you publish.
                </Text>
              </div>
            )}

            <div className="border border-ui-border-base rounded-lg overflow-hidden overflow-x-auto bg-ui-bg-base">
              <table className="w-full min-w-[1500px] border-collapse text-sm">
                <thead className="bg-ui-bg-subtle border-b border-ui-border-base">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">#</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">Status</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">Title</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">Brand</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">Category</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">Collection</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">Type</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">Tags</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">SKU</th>
                    <th className="px-3 py-2 text-right font-medium text-ui-fg-muted">Price</th>
                    <th className="px-3 py-2 text-right font-medium text-ui-fg-muted">Discounted</th>
                    <th className="px-3 py-2 text-right font-medium text-ui-fg-muted">Discount %</th>
                    <th className="px-3 py-2 text-right font-medium text-ui-fg-muted">Inventory</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">Images</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const isUploading =
                      phase === "uploading" && uploadingIndex === idx
                    const statusBadge = (() => {
                      if (row.errors.length > 0)
                        return <Badge color="red">Invalid</Badge>
                      if (isUploading) return <Badge color="orange">Uploading…</Badge>
                      if (row.status === "success")
                        return <Badge color="green">Created</Badge>
                      if (row.status === "failed")
                        return <Badge color="red">Failed</Badge>
                      return <Badge color="blue">Ready</Badge>
                    })()
                    return (
                      <tr
                        key={idx}
                        className={clx(
                          "border-b border-ui-border-base last:border-b-0",
                          row.errors.length > 0 && "bg-red-50 dark:bg-red-950/20",
                          row.status === "success" && "bg-emerald-50 dark:bg-emerald-950/20"
                        )}
                      >
                        <td className="px-3 py-2 text-ui-fg-muted">{row.rowNumber}</td>
                        <td className="px-3 py-2">{statusBadge}</td>
                        <td className="px-3 py-2 min-w-[220px]">
                          <input
                            type="text"
                            value={row.title}
                            onChange={(e) => handleTitleEdit(idx, e.target.value)}
                            placeholder="Product title"
                            disabled={
                              phase === "uploading" ||
                              row.status === "uploading" ||
                              row.status === "success"
                            }
                            className={clx(
                              "w-full bg-transparent border-0 border-b border-transparent hover:border-ui-border-base focus:border-blue-500 focus:outline-none text-sm font-medium px-0 py-1 transition-colors disabled:opacity-70 disabled:cursor-not-allowed",
                              !row.title.trim() &&
                                "text-ui-fg-muted placeholder:italic"
                            )}
                            aria-label={`Title for row ${row.rowNumber}`}
                          />
                          {row.handle && (
                            <div className="text-xs text-ui-fg-subtle">/{row.handle}</div>
                          )}
                        </td>
                        <td className="px-3 py-2">{row.brand || <span className="text-ui-fg-muted">—</span>}</td>
                        <td className="px-3 py-2 min-w-[220px] align-top">
                          {(() => {
                            const canEditCat =
                              phase !== "uploading" &&
                              row.status !== "uploading" &&
                              row.status !== "success"
                            const remark = row.categoryRequest || ""
                            const showRequest =
                              openCategoryRequestRows.has(idx) ||
                              remark.length > 0
                            const noCategoriesLoaded = categories.length === 0
                            const excelMissing =
                              !noCategoriesLoaded &&
                              !!row.category &&
                              !categoryByName.has(row.category.toLowerCase())
                            const openRequestEditor = () => {
                              setOpenCategoryRequestRows((prev) => {
                                const next = new Set(prev)
                                next.add(idx)
                                return next
                              })
                              // If the Excel cell had a value the admin should
                              // know about, prefill the remark with it so the
                              // user doesn't have to retype the missing name.
                              if (
                                !row.categoryRequest &&
                                row.category &&
                                excelMissing
                              ) {
                                handleCategoryRequest(idx, row.category)
                              }
                            }
                            const closeRequestEditor = () => {
                              setOpenCategoryRequestRows((prev) => {
                                const next = new Set(prev)
                                next.delete(idx)
                                return next
                              })
                              handleCategoryRequest(idx, "")
                            }
                            const rootCats = categories.filter((c) => !c.parent_category_id)
                            const parentCatId = rowParentCatIds[idx] || ""
                            const subCats = parentCatId
                              ? categories.filter((c) => c.parent_category_id === parentCatId)
                              : []
                            const selectedSubId = subCats.length > 0
                              ? (row.selectedCategoryId && subCats.some((s) => s.id === row.selectedCategoryId)
                                  ? row.selectedCategoryId
                                  : "")
                              : ""

                            return (
                              <div className="flex flex-col gap-1.5">
                                {/* Parent category */}
                                <select
                                  value={parentCatId}
                                  onChange={(e) => {
                                    const pid = e.target.value
                                    setRowParentCatIds((prev) => ({ ...prev, [idx]: pid }))
                                    const hasChildren = categories.some((c) => c.parent_category_id === pid)
                                    if (pid && !hasChildren) {
                                      handleCategorySelect(idx, pid)
                                    } else {
                                      handleCategorySelect(idx, "")
                                    }
                                  }}
                                  disabled={!canEditCat || noCategoriesLoaded}
                                  className={clx(
                                    "w-full text-xs rounded border bg-ui-bg-base text-ui-fg-base px-2 py-1 focus:border-blue-500 focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed",
                                    !parentCatId && excelMissing && !showRequest
                                      ? "border-amber-400"
                                      : "border-ui-border-base"
                                  )}
                                  aria-label={`Parent category for row ${row.rowNumber}`}
                                >
                                  <option value="">
                                    {noCategoriesLoaded ? "Loading…" : "— Parent category —"}
                                  </option>
                                  {rootCats.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {toTitleCase(c.name)}
                                    </option>
                                  ))}
                                </select>

                                {/* Subcategory — always shown once a parent is chosen */}
                                {parentCatId && (
                                  <select
                                    value={selectedSubId}
                                    onChange={(e) => handleCategorySelect(idx, e.target.value || parentCatId)}
                                    disabled={!canEditCat}
                                    className="w-full text-xs rounded border border-ui-border-base bg-ui-bg-base text-ui-fg-base px-2 py-1 focus:border-blue-500 focus:outline-none transition-colors disabled:opacity-60"
                                    aria-label={`Subcategory for row ${row.rowNumber}`}
                                  >
                                    <option value="">
                                      {subCats.length === 0
                                        ? "— No subcategories yet (or request below) —"
                                        : "— No subcategory (use parent) —"}
                                    </option>
                                    {subCats.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {toTitleCase(c.name)}
                                      </option>
                                    ))}
                                  </select>
                                )}

                                {excelMissing && !row.selectedCategoryId && (
                                  <Text size="xsmall" className="text-amber-600 leading-tight">
                                    Excel said <span className="font-mono">{row.category}</span> — pick a match or request below.
                                  </Text>
                                )}

                                {showRequest ? (
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] uppercase tracking-wide text-ui-fg-subtle font-medium flex items-center justify-between">
                                      <span>Request new category</span>
                                      {canEditCat && (
                                        <button
                                          type="button"
                                          onClick={closeRequestEditor}
                                          className="text-ui-fg-interactive normal-case font-normal text-xs hover:underline"
                                        >
                                          Cancel
                                        </button>
                                      )}
                                    </label>
                                    <textarea
                                      value={remark}
                                      onChange={(e) => handleCategoryRequest(idx, e.target.value)}
                                      disabled={!canEditCat}
                                      rows={2}
                                      placeholder="e.g. Smart home devices — please create"
                                      className="w-full text-xs rounded border border-ui-border-base bg-ui-bg-base text-ui-fg-base px-2 py-1 focus:border-blue-500 focus:outline-none transition-colors resize-y disabled:opacity-60"
                                    />
                                    <Text size="xsmall" className="text-ui-fg-subtle leading-tight">
                                      Admin will see this request on the product page.
                                    </Text>
                                  </div>
                                ) : (
                                  canEditCat && (
                                    <button
                                      type="button"
                                      onClick={openRequestEditor}
                                      className="text-xs text-ui-fg-interactive hover:underline self-start flex items-center gap-1"
                                    >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 5v14M5 12h14" />
                                      </svg>
                                      Request new category
                                    </button>
                                  )
                                )}
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-3 py-2 min-w-[220px] align-top">
                          {(() => {
                            const canEditCol =
                              phase !== "uploading" &&
                              row.status !== "uploading" &&
                              row.status !== "success"
                            const remark = row.collectionRequest || ""
                            const showRequest =
                              openCollectionRequestRows.has(idx) ||
                              remark.length > 0
                            const noCollectionsLoaded = collections.length === 0
                            const excelMissing =
                              !noCollectionsLoaded &&
                              !!row.collection &&
                              !collectionByName.has(
                                row.collection.toLowerCase()
                              )
                            const openRequestEditor = () => {
                              setOpenCollectionRequestRows((prev) => {
                                const next = new Set(prev)
                                next.add(idx)
                                return next
                              })
                              if (
                                !row.collectionRequest &&
                                row.collection &&
                                excelMissing
                              ) {
                                handleCollectionRequest(idx, row.collection)
                              }
                            }
                            const closeRequestEditor = () => {
                              setOpenCollectionRequestRows((prev) => {
                                const next = new Set(prev)
                                next.delete(idx)
                                return next
                              })
                              handleCollectionRequest(idx, "")
                            }
                            return (
                              <div className="flex flex-col gap-1.5">
                                <select
                                  value={row.selectedCollectionId || ""}
                                  onChange={(e) =>
                                    handleCollectionSelect(
                                      idx,
                                      e.target.value
                                    )
                                  }
                                  disabled={
                                    !canEditCol || noCollectionsLoaded
                                  }
                                  className={clx(
                                    "w-full text-xs rounded border bg-ui-bg-base text-ui-fg-base px-2 py-1 focus:border-blue-500 focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed",
                                    !row.selectedCollectionId &&
                                      excelMissing &&
                                      !showRequest
                                      ? "border-amber-400"
                                      : "border-ui-border-base"
                                  )}
                                  aria-label={`Collection for row ${row.rowNumber}`}
                                >
                                  <option value="">
                                    {noCollectionsLoaded
                                      ? "Loading collections…"
                                      : "— No collection —"}
                                  </option>
                                  {collections.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {toTitleCase(c.title || "")}
                                    </option>
                                  ))}
                                </select>
                                {excelMissing && !row.selectedCollectionId && (
                                  <Text
                                    size="xsmall"
                                    className="text-amber-600 leading-tight"
                                  >
                                    Excel said{" "}
                                    <span className="font-mono">
                                      {row.collection}
                                    </span>{" "}
                                    — pick a match or request below.
                                  </Text>
                                )}
                                {showRequest ? (
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] uppercase tracking-wide text-ui-fg-subtle font-medium flex items-center justify-between">
                                      <span>Request new collection</span>
                                      {canEditCol && (
                                        <button
                                          type="button"
                                          onClick={closeRequestEditor}
                                          className="text-ui-fg-interactive normal-case font-normal text-xs hover:underline"
                                        >
                                          Cancel
                                        </button>
                                      )}
                                    </label>
                                    <textarea
                                      value={remark}
                                      onChange={(e) =>
                                        handleCollectionRequest(
                                          idx,
                                          e.target.value
                                        )
                                      }
                                      disabled={!canEditCol}
                                      rows={2}
                                      placeholder="e.g. Summer 2026 — please create"
                                      className="w-full text-xs rounded border border-ui-border-base bg-ui-bg-base text-ui-fg-base px-2 py-1 focus:border-blue-500 focus:outline-none transition-colors resize-y disabled:opacity-60"
                                    />
                                  </div>
                                ) : (
                                  canEditCol && (
                                    <button
                                      type="button"
                                      onClick={openRequestEditor}
                                      className="text-xs text-ui-fg-interactive hover:underline self-start flex items-center gap-1"
                                    >
                                      <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <path d="M12 5v14M5 12h14" />
                                      </svg>
                                      Request new collection
                                    </button>
                                  )
                                )}
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-3 py-2 min-w-[170px] align-top">
                          {(() => {
                            const canEditType =
                              phase !== "uploading" &&
                              row.status !== "uploading" &&
                              row.status !== "success"
                            const datalistId = `vendor-types-list-${idx}`
                            return (
                              <>
                                <input
                                  list={datalistId}
                                  type="text"
                                  value={row.type}
                                  onChange={(e) =>
                                    handleTypeChange(idx, e.target.value)
                                  }
                                  disabled={!canEditType}
                                  placeholder="e.g. Apparel"
                                  className="w-full text-xs rounded border border-ui-border-base bg-ui-bg-base text-ui-fg-base px-2 py-1 focus:border-blue-500 focus:outline-none transition-colors disabled:opacity-60"
                                  aria-label={`Type for row ${row.rowNumber}`}
                                />
                                <datalist id={datalistId}>
                                  {productTypes.map((t) => (
                                    <option key={t.id} value={t.value} />
                                  ))}
                                </datalist>
                                {row.type &&
                                  !productTypes.some(
                                    (t) =>
                                      typeof t?.value === "string" &&
                                      t.value.toLowerCase().trim() ===
                                        row.type.toLowerCase().trim()
                                  ) && (
                                    <Text
                                      size="xsmall"
                                      className="text-emerald-600 leading-tight mt-1"
                                    >
                                      New — will be created on publish
                                    </Text>
                                  )}
                              </>
                            )
                          })()}
                        </td>
                        <td className="px-3 py-2 min-w-[220px] align-top">
                          {(() => {
                            const canEditTags =
                              phase !== "uploading" &&
                              row.status !== "uploading" &&
                              row.status !== "success"
                            const tagsListId = `vendor-tags-list-${idx}`
                            const removeTag = (tagToRemove: string) => {
                              handleTagsChange(
                                idx,
                                row.tags.filter((t) => t !== tagToRemove)
                              )
                            }
                            const addTagFromInput = (
                              ev: React.KeyboardEvent<HTMLInputElement>
                            ) => {
                              if (
                                ev.key === "Enter" ||
                                ev.key === "," ||
                                ev.key === "Tab"
                              ) {
                                const target = ev.currentTarget
                                const value = target.value.trim()
                                if (value) {
                                  ev.preventDefault()
                                  if (
                                    !row.tags.some(
                                      (t) =>
                                        t.toLowerCase() === value.toLowerCase()
                                    )
                                  ) {
                                    handleTagsChange(idx, [...row.tags, value])
                                  }
                                  target.value = ""
                                }
                              } else if (
                                ev.key === "Backspace" &&
                                ev.currentTarget.value === "" &&
                                row.tags.length > 0
                              ) {
                                handleTagsChange(idx, row.tags.slice(0, -1))
                              }
                            }
                            const onBlurAdd = (
                              ev: React.FocusEvent<HTMLInputElement>
                            ) => {
                              const value = ev.currentTarget.value.trim()
                              if (value) {
                                if (
                                  !row.tags.some(
                                    (t) =>
                                      t.toLowerCase() === value.toLowerCase()
                                  )
                                ) {
                                  handleTagsChange(idx, [...row.tags, value])
                                }
                                ev.currentTarget.value = ""
                              }
                            }
                            return (
                              <div
                                className={clx(
                                  "flex flex-wrap items-center gap-1 rounded border border-ui-border-base bg-ui-bg-base px-1.5 py-1 focus-within:border-blue-500 transition-colors",
                                  !canEditTags && "opacity-60"
                                )}
                              >
                                {row.tags.map((tag) => {
                                  const isExisting = productTags.some(
                                    (t) =>
                                      typeof t?.value === "string" &&
                                      t.value.toLowerCase().trim() ===
                                        tag.toLowerCase().trim()
                                  )
                                  return (
                                    <span
                                      key={tag}
                                      className={clx(
                                        "inline-flex items-center gap-1 rounded-full text-xs px-2 py-0.5 border",
                                        isExisting
                                          ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900"
                                          : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
                                      )}
                                      title={
                                        isExisting
                                          ? "Existing tag"
                                          : "New — will be created on publish"
                                      }
                                    >
                                      {tag}
                                      {canEditTags && (
                                        <button
                                          type="button"
                                          onClick={() => removeTag(tag)}
                                          className="opacity-70 hover:opacity-100"
                                          aria-label={`Remove tag ${tag}`}
                                        >
                                          <svg
                                            width="10"
                                            height="10"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="3"
                                            strokeLinecap="round"
                                          >
                                            <path d="M6 6l12 12M18 6L6 18" />
                                          </svg>
                                        </button>
                                      )}
                                    </span>
                                  )
                                })}
                                {canEditTags && (
                                  <>
                                    <input
                                      list={tagsListId}
                                      type="text"
                                      onKeyDown={addTagFromInput}
                                      onBlur={onBlurAdd}
                                      placeholder={
                                        row.tags.length === 0
                                          ? "Type tag, press Enter"
                                          : "+ tag"
                                      }
                                      className="flex-1 min-w-[80px] text-xs bg-transparent outline-none border-none px-1 py-0.5"
                                      aria-label={`Add tag for row ${row.rowNumber}`}
                                    />
                                    <datalist id={tagsListId}>
                                      {productTags.map((t) => (
                                        <option key={t.id} value={t.value} />
                                      ))}
                                    </datalist>
                                  </>
                                )}
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {row.sku || <span className="text-ui-fg-muted">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.price ? `₹${row.price}` : <span className="text-ui-fg-muted">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.discountedPrice ? `₹${row.discountedPrice}` : <span className="text-ui-fg-muted">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.discountPercent !== null ? (
                            <span
                              className={
                                row.discountPercent > 0
                                  ? "text-emerald-600 font-medium"
                                  : "text-ui-fg-muted"
                              }
                            >
                              {row.discountPercent}%
                            </span>
                          ) : (
                            <span className="text-ui-fg-muted">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.inventoryCount || <span className="text-ui-fg-muted">0</span>}
                        </td>
                        <td className="px-3 py-2 min-w-[200px]">
                          {(() => {
                            const refs = [
                              ...(row.thumbnailRef ? [row.thumbnailRef] : []),
                              ...row.imageRefs,
                            ]
                            const states = refs.map((name) => ({
                              name,
                              state: imageMap[normalizeImageKey(name)],
                            }))
                            const ready = states.filter(
                              (s) => s.state?.status === "uploaded"
                            ).length
                            const uploadingThis = states.some(
                              (s) => s.state?.status === "uploading"
                            )
                            const thumbState = row.thumbnailRef
                              ? imageMap[normalizeImageKey(row.thumbnailRef)]
                              : undefined
                            const thumbUrl =
                              thumbState?.status === "uploaded"
                                ? thumbState.url
                                : null

                            const canEdit =
                              phase !== "uploading" &&
                              row.status !== "uploading" &&
                              row.status !== "success"

                            const triggerPicker = () => {
                              if (!canEdit) return
                              rowImageInputRefs.current[idx]?.click()
                            }

                            return (
                              <div className="flex items-start gap-2">
                                {/* Thumbnail / + button */}
                                {thumbUrl ? (
                                  <button
                                    type="button"
                                    onClick={triggerPicker}
                                    disabled={!canEdit}
                                    className="relative w-12 h-12 rounded overflow-hidden border border-ui-border-base group disabled:cursor-not-allowed"
                                    title={canEdit ? "Add another image" : ""}
                                  >
                                    <img
                                      src={thumbUrl}
                                      alt={row.thumbnailRef}
                                      className="w-full h-full object-cover"
                                    />
                                    {canEdit && (
                                      <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                        + Add
                                      </span>
                                    )}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={triggerPicker}
                                    disabled={!canEdit}
                                    className={clx(
                                      "w-12 h-12 rounded border-2 border-dashed flex flex-col items-center justify-center transition-colors",
                                      canEdit
                                        ? "border-ui-border-base text-ui-fg-muted hover:border-blue-500 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/30"
                                        : "border-ui-border-base text-ui-fg-muted opacity-60 cursor-not-allowed"
                                    )}
                                    title="Add image"
                                    aria-label={`Add image for row ${row.rowNumber}`}
                                  >
                                    <svg
                                      width="18"
                                      height="18"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M12 5v14M5 12h14" />
                                    </svg>
                                  </button>
                                )}

                                {/* Status & extra add link */}
                                <div className="flex flex-col gap-0.5 text-xs min-w-0 flex-1">
                                  {refs.length > 0 ? (
                                    <span
                                      className={
                                        ready === refs.length
                                          ? "text-emerald-600 font-medium"
                                          : uploadingThis
                                            ? "text-blue-600 font-medium"
                                            : "text-amber-600 font-medium"
                                      }
                                    >
                                      {ready}/{refs.length} ready
                                    </span>
                                  ) : (
                                    <span className="text-ui-fg-muted italic">
                                      No image yet
                                    </span>
                                  )}
                                  {canEdit && refs.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={triggerPicker}
                                      className="text-ui-fg-interactive hover:underline text-left text-xs"
                                    >
                                      + Add more
                                    </button>
                                  )}
                                </div>

                                <input
                                  ref={(el) => {
                                    rowImageInputRefs.current[idx] = el
                                  }}
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  className="hidden"
                                  onChange={(e) => {
                                    const files = Array.from(e.target.files || [])
                                    if (files.length > 0) {
                                      handleRowImagePicked(idx, files)
                                    }
                                    e.target.value = ""
                                  }}
                                />
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-3 py-2 max-w-[280px]">
                          {row.errors.length > 0 && (
                            <div className="text-red-600 text-xs space-y-0.5">
                              {row.errors.map((e, i) => (
                                <div key={`e-${i}`}>• {e}</div>
                              ))}
                            </div>
                          )}
                          {row.warnings.length > 0 && (
                            <div className="text-amber-600 text-xs space-y-0.5 mt-1">
                              {row.warnings.map((w, i) => (
                                <div key={`w-${i}`}>• {w}</div>
                              ))}
                            </div>
                          )}
                          {row.status === "failed" && row.errorMessage && (
                            <div className="text-red-600 text-xs mt-1">
                              • {row.errorMessage}
                            </div>
                          )}
                          {row.errors.length === 0 &&
                            (() => {
                              const brandKey = normalizeBrandKey(row.brand)
                              const bs = brandAuthMap[brandKey]
                              if (!bs || bs.status === "checking") return null
                              if (bs.status === "missing") {
                                return (
                                  <div className="text-red-600 text-xs">
                                    • Brand letter required for &quot;{row.brand || "Unbranded"}&quot;
                                  </div>
                                )
                              }
                              if (bs.status === "uploading") {
                                return (
                                  <div className="text-blue-600 text-xs">
                                    • Uploading brand letter…
                                  </div>
                                )
                              }
                              return null
                            })()}
                          {row.errors.length === 0 &&
                            row.warnings.length === 0 &&
                            row.status !== "failed" &&
                            brandReady(brandAuthMap[normalizeBrandKey(row.brand)]) && (
                              <span className="text-ui-fg-muted text-xs">—</span>
                            )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </VendorShell>
  )
}

export default VendorProductsBulkUploadPage
