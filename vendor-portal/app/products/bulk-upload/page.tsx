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
} from "@/lib/api/client"
import { generateSku, isValidSkuFormat } from "@/lib/sku"

type RawRow = Record<string, unknown>

type ParsedRow = {
  rowNumber: number
  title: string
  subtitle: string
  handle: string
  description: string
  brand: string
  category: string
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
  { key: "Category", example: "Jackets" },
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
  { key: "Thumbnail", example: "winter-jacket-1.jpg" },
  { key: "Images", example: "winter-jacket-2.jpg, winter-jacket-3.jpg" },
  { key: "Brand Letter", example: "nike-letter.pdf" },
]

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
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null)
  const [imageMap, setImageMap] = useState<ImageMap>({})
  const [uploadingImages, setUploadingImages] = useState(false)
  const [brandAuthMap, setBrandAuthMap] = useState<BrandAuthMap>({})
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const brandInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
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
        const [catData, colData] = await Promise.all([
          vendorCategoriesApi.list({ limit: 200 }),
          vendorCollectionsApi.list({ limit: 200 }),
        ])
        setCategories(catData.product_categories || [])
        setCollections(colData.collections || [])
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
      ["7. Category and Collection must match an existing entry by name."],
      ["8. Brand authorization must be approved by admin before products can be created."],
      [],
      ["Images:"],
      ["• 'Thumbnail' column: filename of the main image (e.g. winter-jacket-1.jpg)."],
      ["• 'Images' column: comma-separated filenames of additional photos."],
      ["  Example: winter-jacket-2.jpg, winter-jacket-3.jpg, winter-jacket-4.jpg"],
      ["• After uploading the Excel file in the portal, you'll be prompted to drop"],
      ["  the matching image files. The portal uploads them to S3 and links each"],
      ["  filename to the right product. Filenames are matched case-insensitively."],
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
      const collectionName = toStr(get("Collection"))
      if (categoryName && !categoryByName.has(categoryName.toLowerCase())) {
        warnings.push(`Category "${categoryName}" not found — will be ignored`)
      }
      if (collectionName && !collectionByName.has(collectionName.toLowerCase())) {
        warnings.push(`Collection "${collectionName}" not found — will be ignored`)
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
      const imagesRaw = toStr(get("Images"))
      const imageRefs = imagesRaw
        ? imagesRaw.split(",").map((t) => t.trim()).filter(Boolean)
        : []
      const brandLetterRef = toStr(get("Brand Letter"))

      return {
        rowNumber,
        title,
        subtitle: toStr(get("Subtitle")),
        handle: toStr(get("Handle")),
        description: toStr(get("Description")),
        brand,
        category: categoryName,
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
      setRows(parsed)
      const seeded: ImageMap = {}
      parsed.forEach((r) => {
        const allRefs = [r.thumbnailRef, ...r.imageRefs].filter(Boolean)
        allRefs.forEach((name) => {
          const key = normalizeImageKey(name)
          if (!seeded[key]) seeded[key] = { status: "missing" }
        })
      })
      setImageMap(seeded)
      setPhase("preview")
      toast.success("File parsed", {
        description: `${parsed.length} row(s) loaded — review and fix any errors before publishing.`,
      })
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

    const token =
      typeof window !== "undefined" ? localStorage.getItem("vendor_token") : null
    if (!token) {
      toast.error("Not authenticated", { description: "Please sign in again" })
      return
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
        } catch (err: any) {
          const message =
            err?.response?.data?.message ||
            err?.message ||
            "Failed to upload image"
          setImageMap((prev) => ({
            ...prev,
            [key]: { status: "error", file, message },
          }))
        }
      })
    )

    setUploadingImages(false)

    const failed = matched.filter((m) => {
      const s = imageMap[m.key]
      return s && s.status === "error"
    }).length
    toast.success("Images uploaded", {
      description: `${matched.length - failed}/${matched.length} image(s) ready${
        failed ? `, ${failed} failed` : ""
      }`,
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
        const collectionId = row.collection
          ? collectionByName.get(row.collection.toLowerCase()) || null
          : null
        const categoryId = row.category
          ? categoryByName.get(row.category.toLowerCase())
          : undefined

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

        await vendorProductsApi.create({
          title: row.title,
          subtitle: row.subtitle || null,
          description: row.description || null,
          handle: row.handle || null,
          is_giftcard: false,
          discountable: row.discountable,
          category_ids: categoryId ? [categoryId] : [],
          collection_id: collectionId,
          tags: row.tags,
          images: allImageUrls.map((url) => ({ url })),
          thumbnail: thumbnailUrl || allImageUrls[0] || null,
          options: [],
          variants: [
            {
              title: row.variantTitle || "Default variant",
              sku: row.sku || undefined,
              manage_inventory: row.managedInventory,
              allow_backorder: row.allowBackorder,
              inventory_quantity: inventoryQuantity,
              prices,
            },
          ],
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
    brandsCheckedRef.current = new Set()
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
                    <Text weight="plus">Product images</Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      Drop the image files referenced in your Excel sheet. Filenames
                      are matched case-insensitively.
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

            <div className="border border-ui-border-base rounded-lg overflow-hidden overflow-x-auto bg-ui-bg-base">
              <table className="w-full min-w-[1200px] border-collapse text-sm">
                <thead className="bg-ui-bg-subtle border-b border-ui-border-base">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">#</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">Status</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">Title</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">Brand</th>
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
                        <td className="px-3 py-2">
                          <div className="font-medium">{row.title || <span className="text-ui-fg-muted">—</span>}</div>
                          {row.handle && (
                            <div className="text-xs text-ui-fg-subtle">/{row.handle}</div>
                          )}
                        </td>
                        <td className="px-3 py-2">{row.brand || <span className="text-ui-fg-muted">—</span>}</td>
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
                        <td className="px-3 py-2 min-w-[160px]">
                          {(() => {
                            const refs = [
                              ...(row.thumbnailRef ? [row.thumbnailRef] : []),
                              ...row.imageRefs,
                            ]
                            if (refs.length === 0) {
                              return (
                                <span className="text-ui-fg-muted text-xs">No images</span>
                              )
                            }
                            const states = refs.map((name) => ({
                              name,
                              state: imageMap[normalizeImageKey(name)],
                            }))
                            const ready = states.filter(
                              (s) => s.state?.status === "uploaded"
                            ).length
                            const thumbState = row.thumbnailRef
                              ? imageMap[normalizeImageKey(row.thumbnailRef)]
                              : undefined
                            const thumbUrl =
                              thumbState?.status === "uploaded"
                                ? thumbState.url
                                : null
                            const allReady = ready === refs.length
                            return (
                              <div className="flex items-center gap-2">
                                {thumbUrl ? (
                                  <img
                                    src={thumbUrl}
                                    alt={row.thumbnailRef}
                                    className="w-10 h-10 rounded object-cover border border-ui-border-base"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded border border-dashed border-ui-border-base flex items-center justify-center text-ui-fg-muted text-[10px]">
                                    {row.thumbnailRef ? "?" : "—"}
                                  </div>
                                )}
                                <div className="flex flex-col text-xs">
                                  <span
                                    className={
                                      allReady
                                        ? "text-emerald-600 font-medium"
                                        : "text-amber-600 font-medium"
                                    }
                                  >
                                    {ready}/{refs.length} ready
                                  </span>
                                  {row.thumbnailRef && (
                                    <span
                                      className="text-ui-fg-subtle truncate max-w-[140px]"
                                      title={row.thumbnailRef}
                                    >
                                      ★ {row.thumbnailRef}
                                    </span>
                                  )}
                                </div>
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
