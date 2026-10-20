"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
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
import BulkPricingReview from "@/components/bulk-upload/BulkPricingReview"
import { bulkPricingReady, type BulkPricingDecision } from "@/lib/bulk-pricing"
import GuideCard from "@/components/bulk-upload/GuideCard"
import StepCard from "@/components/bulk-upload/StepCard"
import {
  ArrowDownTray,
  ArrowUpRightMini,
  DocumentText,
  Photo,
  Sparkles,
  Tag,
} from "@medusajs/icons"
import {
  vendorCategoriesApi,
  vendorCollectionsApi,
  vendorProductsApi,
  vendorTagsApi,
  vendorTypesApi,
} from "@/lib/api/client"
import { buildBulkPayload } from "@/lib/bulk-payload"
import { parseRows, applyGroupValidation, editBulkProduct, productGroupKey, rowOptionValues, normalizeImageKey, IMAGE_COLUMN_PATTERN, LEGACY_IMAGES_COLUMN, isMediaUrl, brandReady, type Category, type Collection, type RawRow, type ParsedRow } from "@/lib/bulk-upload"
import { buildBulkTemplate, serializeBulkTemplate, readBulkWorkbook, loadAllReferences } from "@/lib/bulk-workbook"
import {
  extractEmbeddedImages,
  indexToColumnLetter,
  splitCellAddress,
} from "@/lib/xlsx-embedded-images"

type UploadError = { status?: number; message?: string; data?: { message?: string }; response?: { data?: { message?: string; error?: string } } }
const uploadError = (error: unknown): UploadError => error && typeof error === "object" ? error as UploadError : { message: String(error) }

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

const VendorProductsBulkUploadPage = () => {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>("intro")
  const [rows, setRows] = useState<ParsedRow[]>([])
  const updateListingPricing = useCallback((sku: string, decision: BulkPricingDecision | undefined) => {
    setRows(previous => previous.map(row => row.sku === sku ? { ...row, listingPricing: decision } : row))
  }, [])
  const [fileName, setFileName] = useState<string>("")
  const [referencesReady, setReferencesReady] = useState(false)
  const [referenceError, setReferenceError] = useState("")
  const [referenceAttempt, setReferenceAttempt] = useState(0)
  const [categories, setCategories] = useState<Category[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [productTypes, setProductTypes] = useState<Array<{ id: string; value: string }>>([])
  const [productTags, setProductTags] = useState<Array<{ id: string; value: string }>>([])
  const [, setUploadingIndex] = useState<number | null>(null)
  const [imageMap, setImageMap] = useState<ImageMap>({})
  const [uploadingImages, setUploadingImages] = useState(false)
  const [brandAuthMap, setBrandAuthMap] = useState<BrandAuthMap>({})
  const submittingRef = useRef(false)
  const [readingFile, setReadingFile] = useState(false)
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
          loadAllReferences(async offset => {
            const data = await vendorCategoriesApi.list({ limit: 200, offset })
            return { items: data.product_categories, count: data.count }
          }),
          loadAllReferences(async offset => {
            const data = await vendorCollectionsApi.list({ limit: 200, offset })
            return { items: data.collections, count: data.count }
          }),
          vendorTypesApi.list({ limit: 200 }).catch((e) => {
            console.warn("Failed to load product types", e)
            return { product_types: [] as Array<{ id: string; value: string }> }
          }),
          vendorTagsApi.list({ limit: 500 }).catch((e) => {
            console.warn("Failed to load product tags", e)
            return { product_tags: [] as Array<{ id: string; value: string }> }
          }),
        ])
        setCategories(catData)
        setCollections(colData)
        setProductTypes(typesRes.product_types || [])
        setProductTags(tagsRes.product_tags || [])
        setReferencesReady(true)
        setReferenceError("")
      } catch (cause: unknown) {
        const err = uploadError(cause)
        if (err?.status === 403) {
          router.push("/pending")
          return
        }
        setReferenceError("Could not load categories and brands. Retry before downloading or uploading a template.")
        console.warn("Failed to load reference data:", err.message)
      }
    })()
  }, [router, referenceAttempt])

  const categoryByName = useMemo(() => {
    const map = new Map<string, string>()
    categories.forEach((c) => {
      if (c?.name) map.set(String(c.name).toLowerCase().trim(), c.id)
    })
    return map
  }, [categories])

  const requiredImages = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => {
      if (r.thumbnailRef) set.add(normalizeImageKey(r.thumbnailRef))
      ;[...r.imageRefs, ...r.visualImageRefs].forEach((name) => set.add(normalizeImageKey(name)))
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
        rowNumbers: [...new Set(value.rowNumbers)],
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
      } catch (cause: unknown) {
        const err = uploadError(cause)
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
    selected: File | File[]
  ) => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("vendor_token") : null
    if (!token) {
      toast.error("Not authenticated", { description: "Please sign in again" })
      return
    }
    const files = Array.isArray(selected) ? selected : [selected]
    if (!files.length) return
    if (files.some(file => !/\.(pdf|jpe?g|png)$/i.test(file.name)) || (files.length > 1 && files.some(file => !/\.(jpe?g|png)$/i.test(file.name)))) {
      toast.error("Upload one PDF/PNG/JPG or multiple PNG/JPG images to combine into a PDF")
      return
    }
    if (files.length > 20 || files.some(file => file.size > 10 * 1024 * 1024) || files.reduce((size, file) => size + file.size, 0) > 30 * 1024 * 1024) {
      toast.error("Select up to 20 images, 10 MB each and 30 MB total")
      return
    }
    let file = files[0]
    brandsCheckedRef.current.add(brandKey)
    setBrandAuthMap(prev => ({ ...prev, [brandKey]: { status: "uploading", file } }))
    try {
      if (files.length > 1) {
        const { jsPDF } = await import("jspdf")
        const pdf = new jsPDF()
        for (let i = 0; i < files.length; i++) {
          const bitmap = await createImageBitmap(files[i])
          try {
            const canvas = document.createElement("canvas")
            const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
            canvas.width = Math.round(bitmap.width * scale)
            canvas.height = Math.round(bitmap.height * scale)
            const context = canvas.getContext("2d")
            if (!context) throw new Error("Image conversion unavailable")
            context.fillStyle = "white"
            context.fillRect(0, 0, canvas.width, canvas.height)
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
            if (i) pdf.addPage()
            const ratio = Math.min(190 / canvas.width, 277 / canvas.height)
            pdf.addImage(canvas.toDataURL("image/jpeg", 0.85), "JPEG", 10, 10, canvas.width * ratio, canvas.height * ratio)
          } finally { bitmap.close() }
        }
        file = new File([pdf.output("blob")], "brand-authorization.pdf", { type: "application/pdf" })
      }
      if (file.size > 10 * 1024 * 1024) throw new Error("Authorization exceeds 10 MB; compress the PDF and retry")
    } catch (cause) {
      setBrandAuthMap(prev => ({ ...prev, [brandKey]: { status: "error", message: "Could not prepare authorization; retry with valid files" } }))
      toast.error("Could not prepare authorization", { description: cause instanceof Error ? cause.message : "Use valid PNG/JPG or PDF files" })
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
    } catch (cause: unknown) {
      const err = uploadError(cause)
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

  const handleDownloadTemplate = async () => {
    try {
      const bytes = await serializeBulkTemplate(buildBulkTemplate(categories, collections))
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }))
      const link = document.createElement("a")
      link.href = url
      link.download = "vendor-products-template-v3.xlsx"
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success("Template downloaded", { description: "Choose Tax Code; GST and discount calculate automatically." })
    } catch { toast.error("Template download failed. Please retry.") }
  }

  const handleFile = async (file: File) => {
    if (!referencesReady || readingFile || submittingRef.current) return
    setReadingFile(true)
    try {
      const { sheet, sheetName, json } = await readBulkWorkbook(file)
      const parsed = applyGroupValidation(parseRows(json, categories, collections))

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
      const embeddedImageSeed: ImageMap = {}
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
          const optionImageColumns = new Map<string, number>()
          headerRow.forEach((label, idx) => {
            const match = String(label).trim().match(/^Option\s*(\d+)\s*Images?$/i)
            if (match) optionImageColumns.set(indexToColumnLetter(idx + 1), Number(match[1]))
          })
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
              } else if (optionImageColumns.has(addr.column)) {
                const number = optionImageColumns.get(addr.column)!
                const source = json.find(value => value.__rowNumber === row.rowNumber)
                const optionName = String(Object.entries(source || {}).find(([key]) => key.replace(/\s/g, "").toLowerCase() === `option${number}name`)?.[1] || "").trim()
                const optionValue = rowOptionValues(row)[optionName]
                if (!optionName || !optionValue) continue
                const synthName = `__embedded_r${sheetRow}_option${number}_${e.file.name}`
                embeddedImageSeed[normalizeImageKey(synthName)] = { status: "selected", file: new File([e.file], synthName, { type: e.file.type }) }
                row.optionImages = { ...row.optionImages, [optionName]: { value: optionValue, refs: [synthName] } }
                row.visualImageRefs = [...row.visualImageRefs.filter(ref => !ref.startsWith("#")), synthName]
                if (!row.visualOptionName || optionName.toLowerCase() === "color") {
                  row.visualOptionName = optionName
                  row.visualOptionValue = optionValue
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
      parsed.forEach((row, idx) => {
        if (row.resolvedParentCategoryId) {
          initialParentIds[idx] = row.resolvedParentCategoryId
        }
        // Auto-open request editors for rows that have unresolved Excel values
        if (row.categoryRequest) initialOpenCatReqs.add(idx)
      })
      setRowParentCatIds(initialParentIds)
      setOpenCategoryRequestRows(initialOpenCatReqs)

      const seeded: ImageMap = { ...embeddedImageSeed }
      parsed.forEach((r) => {
        const allRefs = [r.thumbnailRef, ...r.imageRefs, ...r.visualImageRefs].filter(Boolean)
        allRefs.forEach((name) => {
          const key = normalizeImageKey(name)
          // Don't downgrade an already-seeded embedded image to "missing".
          if (!seeded[key]) seeded[key] = isMediaUrl(name) ? { status: "uploaded", url: name, key: "", originalName: name } : { status: "missing" }
        })
      })
      setFileName(file.name)
      brandsCheckedRef.current = new Set()
      setBrandAuthMap({})
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
    } catch (cause: unknown) {
      const err = uploadError(cause)
      console.warn("Excel parse failed:", err.message)
      toast.error("Failed to read Excel", {
        description: err?.message || "Could not parse the uploaded file",
      })
    } finally {
      setReadingFile(false)
    }
  }

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await handleFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleDrop = async (e: React.DragEvent) => {
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

    for (let start = 0; start < matched.length; start += 4) {
      await Promise.all(
        matched.slice(start, start + 4).map(async ({ key, file }) => {
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
          } catch (cause: unknown) {
            const err = uploadError(cause)
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
    }

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
    setRows(prev => editBulkProduct(prev, rowIdx, { title: newTitle }))
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
      return applyGroupValidation(next)
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
    const category = categories.find(item => item.id === categoryId)
    setRows(prev => editBulkProduct(prev, rowIdx, {
      selectedCategoryId: categoryId || undefined,
      resolvedParentCategoryId: category?.parent_category_id || category?.id,
    }))
  }

  const handleCategoryRequest = (rowIdx: number, remark: string) => {
    setRows(prev => editBulkProduct(prev, rowIdx, { categoryRequest: remark }))
  }

  const handleTypeChange = (rowIdx: number, value: string) => {
    setRows(prev => editBulkProduct(prev, rowIdx, { type: value }))
  }

  const handleTagsChange = (rowIdx: number, tags: string[]) => {
    setRows(prev => editBulkProduct(prev, rowIdx, { tags }))
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

  const validatedRows = applyGroupValidation(rows)
  const validRows = validatedRows.filter((r) => r.errors.length === 0)
  const invalidRows = validatedRows.filter((r) => r.errors.length > 0)
  const successCount = new Set(rows.filter((r) => r.status === "success").map(productGroupKey)).size
  const failedAfterUpload = new Set(rows.filter(
    (r) => r.status === "failed" && r.errorMessage && r.errors.length === 0
  ).map(productGroupKey)).size

  const rowGroupCounts = useMemo(() => {
    const counts = new Map<string, number>()
    rows.forEach((row) => {
      const key = productGroupKey(row)
      counts.set(key, (counts.get(key) || 0) + 1)
    })
    return counts
  }, [rows])

  const productGroupCount = useMemo(() => {
    const keys = new Set<string>()
    validRows.forEach((row) => keys.add(productGroupKey(row)))
    return keys.size
  }, [validRows])

  const pendingProductGroupCount = new Set(validRows.filter(row => row.status !== "success").map(productGroupKey)).size
  const pendingRowCount = validRows.filter(row => row.status !== "success").length

  const listingPricesReady = validRows.length > 0 && validRows.every(bulkPricingReady)

  const handlePublish = async () => {
    if (submittingRef.current) return
    if (!listingPricesReady || validatedRows.some(row => row.errors.length) || uploadingImages || requiredImages.some(key => imageMap[key]?.status !== "uploaded") || !allBrandsReady) {
      toast.error("Upload not ready", { description: "Fix row errors, review listing prices, upload referenced images and complete brand authorization before submitting." })
      return
    }
    if (!validRows.length) {
      toast.error("Nothing to upload", {
        description: "Fix the errors in your Excel file and re-upload",
      })
      return
    }
    submittingRef.current = true
    setPhase("uploading")

    const updated = [...validatedRows]
    const groups = new Map<string, { rowIndices: number[]; rows: ParsedRow[] }>()

    updated.forEach((row, index) => {
      if (row.errors.length > 0 || row.status === "success") return
      const key = productGroupKey(row)
      if (!groups.has(key)) {
        groups.set(key, { rowIndices: [], rows: [] })
      }
      const group = groups.get(key)!
      group.rowIndices.push(index)
      group.rows.push(row)
    })

    for (const [, group] of groups) {
      const firstIndex = group.rowIndices[0]
      setUploadingIndex(firstIndex)

      group.rowIndices.forEach((index) => {
        updated[index] = {
          ...updated[index],
          status: "uploading",
          errorMessage: undefined,
        }
      })
      setRows([...updated])

      try {
        await vendorProductsApi.create(buildBulkPayload(group.rows, imageMap, true))
        group.rowIndices.forEach((index) => {
          updated[index] = { ...updated[index], status: "success" }
        })
      } catch (cause: unknown) {
        const err = uploadError(cause)
        const message =
          err?.data?.message || err?.message || "Failed to create product"
        group.rowIndices.forEach((index) => {
          updated[index] = {
            ...updated[index],
            status: "failed",
            errorMessage: message,
          }
        })
      }
      setRows([...updated])
    }

    setUploadingIndex(null)
    submittingRef.current = false
    setPhase("done")

    const createdProducts = new Set<string>()
    const failedProducts = new Set<string>()
    updated.forEach((row) => {
      const key = productGroupKey(row)
      if (row.status === "success") createdProducts.add(key)
      if (row.status === "failed") failedProducts.add(key)
    })

    const created = createdProducts.size
    const failed = failedProducts.size
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
  }

  return (
    <VendorShell>
      <div className="mx-auto max-w-7xl p-4 md:p-6 space-y-5 md:space-y-6">
        <div
          className="animate-fade-in-up flex flex-wrap items-start justify-between gap-4"
          style={{ animationDelay: "0ms" }}
        >
          <div>
            <Heading level="h1" className="text-2xl md:text-3xl">
              Bulk Upload Products
            </Heading>
            <Text className="mt-1 text-ui-fg-subtle">
              Upload an Excel sheet to create multiple products at once. SKUs and
              discount % are computed automatically.
            </Text>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => router.push("/products")}>
              Back to products
              <ArrowUpRightMini />
            </Button>
            {phase !== "intro" && (
              <Button variant="secondary" disabled={phase === "uploading" || readingFile || uploadingImages || Object.values(brandAuthMap).some(state => state.status === "uploading")} onClick={handleReset}>
                Start over
              </Button>
            )}
          </div>
        </div>

        {!referencesReady && <div role="status" className="rounded-xl border p-4 text-sm">
          {referenceError || "Loading categories and brands…"}
          {referenceError && <Button variant="secondary" onClick={() => setReferenceAttempt(attempt => attempt + 1)}>Retry</Button>}
        </div>}
        {phase === "intro" && (
          <div className="space-y-5 md:space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
              <StepCard
                step={1}
                title="Download the template"
                style={{ animationDelay: "40ms" }}
              >
                <Text size="small" className="text-ui-fg-subtle">
                  Template v4: mandatory fields are marked in coral with *. Enter base MRP/selling price, complete package attributes and Image 1–3. Review calculated listing prices after upload. Brand becomes the collection; upload authorization after parsing.
                  Required columns are marked with <span className="font-mono">*</span>.
                  Leave SKU and Discount % blank — they are generated automatically.
                </Text>
                <Button variant="secondary" disabled={!referencesReady} onClick={handleDownloadTemplate}>
                  <ArrowDownTray />
                  Download Excel template
                </Button>
              </StepCard>

              <StepCard
                step={2}
                title="Upload the filled file"
                variant="dropzone"
                style={{ animationDelay: "80ms" }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ui-bg-base-hover text-ui-fg-muted ring-1 ring-ui-border-base">
                  <DocumentText />
                </div>
                <Text size="small" className="text-ui-fg-subtle">
                  Drag and drop your <span className="font-mono">.xlsx</span>,{" "}
                  <span className="font-mono">.xls</span>, or{" "}
                  <span className="font-mono">.csv</span> file here, or click to browse.
                </Text>
                <Button
                  variant="primary"
                  disabled={readingFile || !referencesReady}
                  onClick={(e) => {
                    e.stopPropagation()
                    fileInputRef.current?.click()
                  }}
                >
                  {readingFile ? "Reading file…" : "Choose file"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
              </StepCard>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <GuideCard
                icon={<Sparkles />}
                title="How SKUs are generated"
                accent="oweg"
                style={{ animationDelay: "120ms" }}
                className="animate-fade-in-up md:col-span-2"
              >
                <Text size="small" className="text-ui-fg-subtle">
                  SKU format:{" "}
                  <code className="rounded-md bg-ui-bg-subtle px-2 py-0.5 font-mono text-xs">
                    &lt;BRAND_FIRST_3&gt;-&lt;PRODUCT_FIRST_2&gt;-&lt;6_RANDOM_DIGITS&gt;
                  </code>
                </Text>
                <Text size="small" className="text-ui-fg-subtle">
                  Example: brand &quot;Nike&quot;, title &quot;Winter Jacket&quot; →{" "}
                  <code className="font-mono text-xs">NIK-WI348215</code>. The trailing 6
                  digits are random per row, ensuring every SKU is unique within the upload.
                </Text>
              </GuideCard>

              <GuideCard
                icon={<Tag />}
                title="Multi-variant products"
                accent="purple"
                style={{ animationDelay: "160ms" }}
                className="animate-fade-in-up"
              >
                <Text size="small" className="text-ui-fg-subtle">
                  Enter comma-separated values: Size 8,9,10 and Color Red,Green,Blue create nine variants.
                  The row&apos;s price and stock apply to each variant. For different stock or prices, use separate rows.
                  Rows with the same Handle (or Title if blank) form one product.
                </Text>
                <Text size="small" className="text-ui-fg-subtle">
                  Put Option Images beside each option value: one shared photo, or one per value in the same order.
                  For Red,Blue use red.jpg,blue.jpg. Maximum 100 variants per product.
                </Text>
              </GuideCard>

              <GuideCard
                icon={<DocumentText />}
                title="Brand authorization letters"
                accent="orange"
                style={{ animationDelay: "200ms" }}
                className="animate-fade-in-up"
              >
                <Text size="small" className="text-ui-fg-subtle">
                  Authorization is requested after the Excel is read, once per brand. Nothing needs to be entered in Excel.
                </Text>
                <Text size="small" className="text-ui-fg-subtle">
                  Upload one PNG/JPG or PDF. Select multiple PNG/JPG images to combine them into a single PDF automatically.
                  Pending letters allow draft submission; admin approval is required to go live.
                </Text>
              </GuideCard>

              <GuideCard
                icon={<Photo />}
                title="Adding photos"
                accent="green"
                style={{ animationDelay: "240ms" }}
                className="animate-fade-in-up md:col-span-2"
              >
                <Text size="small" className="text-ui-fg-subtle">
                  List filenames in Thumbnail and Image 1, Image 2, Image 3 columns. For option images, use comma-separated names (e.g.{" "}
                  <code className="font-mono text-xs">jacket-1.jpg, jacket-2.jpg</code>).
                </Text>
                <Text size="small" className="text-ui-fg-subtle">
                  After upload, a drop zone lets you match those exact files. Thumbnail
                  becomes the main image; the rest form the gallery.
                </Text>
              </GuideCard>
            </div>
          </div>
        )}

        {(phase === "preview" || phase === "uploading" || phase === "done") && (
          <div className="animate-fade-in-up space-y-4 md:space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-ui-border-base/70 bg-ui-bg-base p-4 md:p-5 shadow-sm">
              <div>
                <Text size="small" className="text-ui-fg-subtle">File</Text>
                <Text weight="plus">{fileName}</Text>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Badge color="grey">Source rows: {new Set(rows.map(row => row.rowNumber)).size} · Variants: {rows.length}</Badge>
                <Badge color="blue">Products: {new Set(rows.map(productGroupKey)).size} · Ready: {productGroupCount}</Badge>
                <Badge color="green">Valid rows: {validRows.length}</Badge>
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
                      pendingRowCount === 0 ||
                      invalidRows.length > 0 ||
                      requiredImages.some(key => imageMap[key]?.status !== "uploaded") ||
                      uploadingImages ||
                      !allBrandsReady || !listingPricesReady
                    }
                  >
                    Submit {pendingProductGroupCount} product
                    {pendingProductGroupCount === 1 ? "" : "s"}
                    {pendingProductGroupCount !== pendingRowCount && (
                      <span className="opacity-80"> ({pendingRowCount} rows)</span>
                    )}
                  </Button>
                )}
                {phase === "done" && failedAfterUpload > 0 && (
                  <Button variant="secondary" onClick={() => setPhase("preview")}>Review failed products</Button>
                )}
                {phase === "done" && (
                  <Button variant="primary" onClick={() => router.push("/products")}>
                    Go to products
                  </Button>
                )}
              </div>
            </div>

            {(phase === "preview" || phase === "uploading") && <BulkPricingReview rows={validatedRows} imageMap={imageMap} disabled={phase === "uploading"} onChange={updateListingPricing} />}

            {phase === "preview" && (invalidRows.length > 0 || uploadedImages < totalImages || !allBrandsReady || !listingPricesReady) && (
              <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Before submitting: {invalidRows.length > 0 ? `fix ${invalidRows.length} row(s) with errors; ` : ""}
                {uploadedImages < totalImages ? `upload ${totalImages - uploadedImages} referenced image(s); ` : ""}
                {!allBrandsReady ? "complete the brand authorization checks; " : ""}
                {!listingPricesReady ? "calculate logistics and review the listing prices." : ""}
                <p className="mt-1">Fix spreadsheet values and upload the file again for fields that cannot be edited here. No partial product variants will be submitted.</p>
              </div>
            )}

            {uniqueBrands.length > 0 && phase !== "uploading" && (
              <div className="space-y-3 rounded-xl border border-ui-border-base/70 bg-ui-bg-base p-4 md:p-5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <Text weight="plus">Brand authorization letters</Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      Upload one PNG/JPG or PDF per brand. Multiple images are combined into one PDF. We&apos;ll apply it to every row
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
                        const files = Array.from(e.dataTransfer.files || [])
                        if (files.length) handleBrandLetterPicked(key, display, files)
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
                          className="space-y-2 rounded-xl border border-ui-border-base/70 bg-ui-bg-subtle/40 p-4 transition-colors hover:border-ui-border-strong"
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
                                    here, or click to browse (PDF, JPG, PNG)
                                  </>
                                ) : (
                                  <>
                                    Upload one PDF/PNG/JPG or select multiple images to combine into a PDF
                                  </>
                                )}
                              </button>
                              <input
                                ref={(el) => {
                                  brandInputRefs.current[key] = el
                                }}
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                  const files = Array.from(e.target.files || [])
                                  if (files.length) handleBrandLetterPicked(key, display, files)
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
                              submitted as drafts; admin approval is still needed for them
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
              <div className="space-y-3 rounded-xl border border-ui-border-base/70 bg-ui-bg-base p-4 md:p-5">
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
                  className="cursor-pointer rounded-xl border-2 border-dashed border-ui-border-base/80 p-6 text-center transition-all duration-200 hover:border-ui-border-strong hover:bg-ui-bg-subtle/40"
                  onClick={() => imageInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleImageDrop}
                >
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-ui-bg-base-hover text-ui-fg-muted">
                    <Photo />
                  </div>
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
              <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-4">
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
                <Text size="small" className="text-ui-fg-base">
                  <span className="font-medium">Edit product details in place; changes apply to all its variants.</span>{" "}
                  Click the title to rename, the{" "}
                  <span className="font-mono">+</span> next to a row to
                  add an image, and use the inline editors to change the
                  category, subcategory, type, or tags. Brand is the collection. New
                  types and tags are auto-created in Medusa on publish;
                  missing categories can be requested via{" "}
                  <span className="italic">Request new</span> for admin
                  review. Changes are saved here and applied when you publish.
                </Text>
              </div>
            )}

            <div className="overflow-hidden overflow-x-auto rounded-xl border border-ui-border-base/70 bg-ui-bg-base">
              <table className="w-full min-w-[1500px] border-collapse text-sm">
                <thead className="bg-ui-bg-subtle border-b border-ui-border-base">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">#</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">Status</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">Title</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">Brand</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">Category</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">Type</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">Tags</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">Options</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">SKU</th>
                    <th className="px-3 py-2 text-right font-medium text-ui-fg-muted">Base MRP INR</th>
                    <th className="px-3 py-2 text-right font-medium text-ui-fg-muted">Base selling</th>
                    <th className="px-3 py-2 text-right font-medium text-ui-fg-muted">Discount %</th>
                    <th className="px-3 py-2 text-right font-medium text-ui-fg-muted">Inventory</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">Images</th>
                    <th className="px-3 py-2 text-left font-medium text-ui-fg-muted">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const isUploading = phase === "uploading" && row.status === "uploading"
                    const groupCount = rowGroupCounts.get(productGroupKey(row)) || 1
                    const optionSummary = Object.entries(rowOptionValues(row))
                      .map(([name, value]) => `${name}: ${value}`)
                      .join(", ")
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
                          <div className="text-xs text-ui-fg-subtle">{row.taxCode} · {row.gstRate}% GST</div>
                          {row.shippingProfile && <div className="text-xs text-ui-fg-subtle">Shipping: {row.shippingProfile}</div>}
                          {row.videoUrls.length > 0 && <div className="text-xs text-ui-fg-subtle">{row.videoUrls.length} video(s)</div>}
                          {row.handle && (
                            <div className="text-xs text-ui-fg-subtle">/{row.handle}</div>
                          )}
                          {groupCount > 1 && (
                            <Badge color="blue" size="2xsmall" className="mt-1">
                              {groupCount} variants
                            </Badge>
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
                                    {noCategoriesLoaded ? "No categories available" : "— Parent category —"}
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
                        <td className="px-3 py-2 text-xs">
                          {optionSummary || <span className="text-ui-fg-muted">Default</span>}
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
                          {row.inventoryCount || <span className="text-red-600">Required</span>}
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
                                    <Image
                                      src={thumbUrl}
                                      alt={row.thumbnailRef}
                                      width={48}
                                      height={48}
                                      unoptimized
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
