"use client"

import React, { useMemo, useRef, useState } from "react"
import { Button, Heading, Input, Label, Switch, Text, toast } from "@medusajs/ui"
import axios from "axios"
import {
  MAX_AUTO_VARIANTS,
  buildVariantRows,
  collectVisualOptionValues,
  computeDiscountPercent,
  createDefaultVariantRow,
  createVariantRowFromOptions,
  detectVisualOption,
  getSecondaryOptionTitles,
  groupVariantsByVisualOption,
  hasDuplicateCombo,
  normalizeProductOptions,
  parseOptionValuesInput,
  removeOptionValue,
  upsertOptionValue,
  variantRowIndex,
  type ProductOptionDef,
  type UploadedImageRef,
  type VariantMatrixRow,
} from "@/lib/variant-matrix"
import { validateSingleSkuInput } from "@/lib/sku-validation"

export type VariantMatrixEditorProps = {
  hasVariants: boolean
  onHasVariantsChange: (enabled: boolean) => void
  productOptions: ProductOptionDef[]
  onProductOptionsChange: (options: ProductOptionDef[]) => void
  variants: VariantMatrixRow[]
  onVariantsChange: (variants: VariantMatrixRow[]) => void
  colorImages: Record<string, UploadedImageRef[]>
  onColorImagesChange: (images: Record<string, UploadedImageRef[]>) => void
  primaryVisualOption?: string
  onPrimaryVisualOptionChange?: (option: string) => void
  optionsReadOnly?: boolean
  simpleProductExtras?: React.ReactNode
  usedSkus?: Set<string>
}

const VariantDiscountCell = ({
  price,
  discountedPrice,
}: {
  price: string
  discountedPrice: string
}) => {
  const discountPercent = computeDiscountPercent(price, discountedPrice)
  if (discountPercent === null) {
    return <span className="text-ui-fg-muted">—</span>
  }
  return <span className="font-medium text-emerald-500">{discountPercent}%</span>
}

const uploadImageToS3 = async (file: File): Promise<UploadedImageRef> => {
  const API_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
  const vendorToken = localStorage.getItem("vendor_token")
  const formData = new FormData()
  formData.append("files", file)

  const response = await axios.post(`${API_URL}/vendor/products/upload-image`, formData, {
    headers: {
      Authorization: `Bearer ${vendorToken}`,
      "Content-Type": "multipart/form-data",
    },
  })

  const payload = response.data
  const uploaded = payload.files?.[0] || payload
  if (!uploaded?.url) {
    throw new Error("Upload succeeded but no image URL was returned")
  }

  return {
    url: uploaded.url,
    key: uploaded.key,
    filename: uploaded.filename,
    originalName: uploaded.originalName || file.name,
  }
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-ui-border-base bg-ui-bg-base overflow-hidden">
      <div className="px-5 py-4 border-b border-ui-border-base bg-ui-bg-subtle/40">
        <Heading level="h3" className="text-base font-semibold">
          {title}
        </Heading>
        {description ? (
          <Text size="small" className="text-ui-fg-muted mt-1">
            {description}
          </Text>
        ) : null}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function ensureDefaultOptions(options: ProductOptionDef[]): ProductOptionDef[] {
  if (options.length >= 2) return options
  const next = [...options]
  if (!next.some((o) => /color|colour/i.test(o.title))) {
    next.unshift({ title: "Color", values: [], valuesInput: "" })
  }
  if (!next.some((o) => /size/i.test(o.title))) {
    next.push({ title: "Size", values: [], valuesInput: "" })
  }
  return next
}

export default function VariantMatrixEditor({
  hasVariants,
  onHasVariantsChange,
  productOptions,
  onProductOptionsChange,
  variants,
  onVariantsChange,
  colorImages,
  onColorImagesChange,
  primaryVisualOption,
  onPrimaryVisualOptionChange,
  optionsReadOnly = false,
  simpleProductExtras,
  usedSkus,
}: VariantMatrixEditorProps) {
  const [bulkPrice, setBulkPrice] = useState("")
  const [bulkSalePrice, setBulkSalePrice] = useState("")
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const [newColorInput, setNewColorInput] = useState("")
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const normalizedOptions = useMemo(
    () => normalizeProductOptions(productOptions),
    [productOptions]
  )

  const optionTitles = useMemo(
    () => normalizedOptions.map((opt) => opt.title),
    [normalizedOptions]
  )

  const resolvedVisualOption = useMemo(() => {
    if (primaryVisualOption && optionTitles.includes(primaryVisualOption)) {
      return primaryVisualOption
    }
    return detectVisualOption(optionTitles) || "Color"
  }, [primaryVisualOption, optionTitles])

  const secondaryOptions = useMemo(
    () => getSecondaryOptionTitles(productOptions, resolvedVisualOption),
    [productOptions, resolvedVisualOption]
  )

  const primarySecondaryOption = secondaryOptions[0] || "Size"

  const colorValues = useMemo(
    () =>
      collectVisualOptionValues(
        resolvedVisualOption,
        variants,
        colorImages,
        productOptions
      ),
    [resolvedVisualOption, variants, colorImages, productOptions]
  )

  const variantsByColor = useMemo(
    () => groupVariantsByVisualOption(variants, resolvedVisualOption),
    [variants, resolvedVisualOption]
  )

  const useColorFirstFlow =
    hasVariants && secondaryOptions.length <= 1 && !optionsReadOnly

  const handleHasVariantsToggle = (enabled: boolean) => {
    onHasVariantsChange(enabled)
    if (enabled && productOptions.length === 0) {
      onProductOptionsChange([
        { title: "Color", values: [], valuesInput: "" },
        { title: "Size", values: [], valuesInput: "" },
      ])
      onVariantsChange([])
      if (onPrimaryVisualOptionChange) {
        onPrimaryVisualOptionChange("Color")
      }
    }
    if (!enabled) {
      onVariantsChange([createDefaultVariantRow()])
      onColorImagesChange({})
    }
  }

  const addColor = () => {
    const color = newColorInput.trim()
    if (!color) {
      toast.error("Enter a color name")
      return
    }
    if (colorValues.some((c) => c.toLowerCase() === color.toLowerCase())) {
      toast.error("Color already added", { description: `"${color}" is already in the list` })
      return
    }

    const options = ensureDefaultOptions(
      upsertOptionValue(productOptions, resolvedVisualOption, color)
    )
    onProductOptionsChange(options)

    const row = createVariantRowFromOptions({
      [resolvedVisualOption]: color,
      [primarySecondaryOption]: "",
    })
    onVariantsChange([...variants, row])
    setNewColorInput("")

    if (onPrimaryVisualOptionChange) {
      onPrimaryVisualOptionChange(resolvedVisualOption)
    }
  }

  const removeColor = (color: string) => {
    onProductOptionsChange(
      removeOptionValue(productOptions, resolvedVisualOption, color)
    )
    onVariantsChange(
      variants.filter((row) => row.optionValues[resolvedVisualOption] !== color)
    )
    const nextImages = { ...colorImages }
    delete nextImages[color]
    onColorImagesChange(nextImages)
  }

  const addSizeForColor = (color: string) => {
    const row = createVariantRowFromOptions({
      [resolvedVisualOption]: color,
      [primarySecondaryOption]: "",
    })
    onVariantsChange([...variants, row])
  }

  const removeVariantAt = (globalIndex: number) => {
    onVariantsChange(variants.filter((_, i) => i !== globalIndex))
  }

  const updateVariantField = <K extends keyof VariantMatrixRow>(
    index: number,
    field: K,
    value: VariantMatrixRow[K]
  ) => {
    const next = [...variants]
    next[index] = { ...next[index], [field]: value }
    onVariantsChange(next)
  }

  const handleSkuBlur = (index: number, sku: string) => {
    const result = validateSingleSkuInput(
      sku,
      index,
      variants.map((v) => v.sku),
      usedSkus
    )
    if (!result.ok) {
      toast.error(result.title, { description: result.description })
    }
  }

  const updateVariantOptionValue = (
    index: number,
    optionTitle: string,
    value: string
  ) => {
    const row = variants[index]
    if (!row) return

    const nextOptionValues = { ...row.optionValues, [optionTitle]: value }
    const uniqueTitles = Array.from(new Set(normalizedOptions.map((o) => o.title)))

    if (
      value.trim() &&
      hasDuplicateCombo(variants, uniqueTitles, nextOptionValues, index)
    ) {
      toast.error("Duplicate combination", {
        description: `This ${optionTitle.toLowerCase()} already exists for this color`,
      })
      return
    }

    const next = [...variants]
    next[index] = {
      ...row,
      optionValues: nextOptionValues,
      title: Object.values(nextOptionValues).filter(Boolean).join(" / "),
    }
    onVariantsChange(next)

    if (value.trim()) {
      onProductOptionsChange(upsertOptionValue(productOptions, optionTitle, value))
    }
  }

  const generateMatrix = () => {
    const normalized = normalizeProductOptions(productOptions)
    if (!normalized.length) {
      toast.error("Add options first", {
        description: "Example: Color = Black, Red and Size = S, M, L",
      })
      return
    }

    const totalCombos = normalized.reduce((acc, opt) => acc * opt.values.length, 1)
    if (totalCombos > MAX_AUTO_VARIANTS) {
      toast.error("Too many combinations", {
        description: `Maximum ${MAX_AUTO_VARIANTS} variants allowed`,
      })
      return
    }

    try {
      const rows = buildVariantRows(normalized, variants)
      onProductOptionsChange(normalized)
      onVariantsChange(rows)
      const visual = detectVisualOption(normalized.map((o) => o.title))
      if (visual && onPrimaryVisualOptionChange) {
        onPrimaryVisualOptionChange(visual)
      }
      toast.success("Ready", { description: `${rows.length} variant row(s) created` })
    } catch (err) {
      toast.error("Could not build variants", {
        description: err instanceof Error ? err.message : "Unknown error",
      })
    }
  }

  const applyBulkPrice = () => {
    if (!bulkPrice.trim() && !bulkSalePrice.trim()) return
    onVariantsChange(
      variants.map((row) => ({
        ...row,
        price: bulkPrice.trim() ? bulkPrice : row.price,
        discountedPrice: bulkSalePrice.trim() ? bulkSalePrice : row.discountedPrice,
      }))
    )
    toast.success("Prices applied to all rows")
  }

  const handleVisualImageUpload = async (visualValue: string, files: FileList | null) => {
    if (!files?.length) return
    setUploadingFor(visualValue)
    try {
      const uploaded = await Promise.all(Array.from(files).map(uploadImageToS3))
      onColorImagesChange({
        ...colorImages,
        [visualValue]: [...(colorImages[visualValue] || []), ...uploaded],
      })
    } catch (err) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : "Could not upload",
      })
    } finally {
      setUploadingFor(null)
    }
  }

  const removeVisualImage = (visualValue: string, imageIndex: number) => {
    onColorImagesChange({
      ...colorImages,
      [visualValue]: (colorImages[visualValue] || []).filter((_, i) => i !== imageIndex),
    })
  }

  const renderSizeRow = (row: VariantMatrixRow, color: string) => {
    const globalIndex = variantRowIndex(variants, row)
    if (globalIndex < 0) return null

    return (
      <tr key={`${color}-${globalIndex}`} className="border-b border-ui-border-base/60">
        <td className="px-3 py-2">
          <Input
            value={row.optionValues[primarySecondaryOption] || ""}
            onChange={(e) =>
              updateVariantOptionValue(globalIndex, primarySecondaryOption, e.target.value)
            }
            placeholder="e.g. 32"
            className="w-20 h-8"
          />
        </td>
        <td className="px-3 py-2">
          <Input
            value={row.sku}
            onChange={(e) => updateVariantField(globalIndex, "sku", e.target.value)}
            onBlur={(e) => handleSkuBlur(globalIndex, e.target.value)}
            placeholder="Optional"
            className="min-w-[80px] h-8"
          />
        </td>
        <td className="px-3 py-2">
          <Input
            type="number"
            min="0"
            value={row.inventoryCount}
            onChange={(e) =>
              updateVariantField(globalIndex, "inventoryCount", e.target.value)
            }
            className="w-16 h-8"
          />
        </td>
        <td className="px-3 py-2">
          <Input
            value={row.price}
            onChange={(e) => updateVariantField(globalIndex, "price", e.target.value)}
            className="w-24 h-8"
          />
        </td>
        <td className="px-3 py-2">
          <Input
            value={row.discountedPrice}
            onChange={(e) =>
              updateVariantField(globalIndex, "discountedPrice", e.target.value)
            }
            className="w-24 h-8"
          />
        </td>
        <td className="px-3 py-2">
          <VariantDiscountCell price={row.price} discountedPrice={row.discountedPrice} />
        </td>
        <td className="px-3 py-2">
          <Button
            variant="transparent"
            size="small"
            className="text-ui-fg-error"
            onClick={() => removeVariantAt(globalIndex)}
            disabled={(variantsByColor.get(color)?.length || 0) <= 1}
          >
            Remove
          </Button>
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-5">
      {!optionsReadOnly && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-ui-border-base bg-ui-bg-subtle/30 px-5 py-4">
          <div>
            <Text weight="plus">Multiple options?</Text>
            <Text size="small" className="text-ui-fg-muted">
              Turn on for color + size products. Add one color, upload photos, then add sizes.
            </Text>
          </div>
          <Switch checked={hasVariants} onCheckedChange={handleHasVariantsToggle} />
        </div>
      )}

      {hasVariants && optionsReadOnly && normalizedOptions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {normalizedOptions.map((opt) => (
            <span
              key={opt.title}
              className="rounded-full bg-ui-bg-subtle border border-ui-border-base px-3 py-1 text-sm"
            >
              {opt.title}: {opt.values.join(", ")}
            </span>
          ))}
        </div>
      )}

      {hasVariants && useColorFirstFlow && (
        <>
          <SectionCard
            title="Step 1 — Add colors"
            description="Add each color separately. You can upload photos and sizes for each one."
          >
            <div className="flex flex-wrap gap-2 mb-4">
              {colorValues.map((color) => (
                <span
                  key={color}
                  className="inline-flex items-center gap-2 rounded-full border border-ui-border-base bg-ui-bg-subtle px-3 py-1.5 text-sm font-medium"
                >
                  {color}
                  <button
                    type="button"
                    className="text-ui-fg-muted hover:text-ui-fg-error"
                    onClick={() => removeColor(color)}
                    aria-label={`Remove ${color}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {colorValues.length === 0 && (
                <Text size="small" className="text-ui-fg-muted">
                  No colors yet — add your first color below
                </Text>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                value={newColorInput}
                onChange={(e) => setNewColorInput(e.target.value)}
                placeholder="e.g. Black"
                className="max-w-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addColor()
                  }
                }}
              />
              <Button variant="primary" size="small" onClick={addColor}>
                + Add color
              </Button>
            </div>
          </SectionCard>

          {colorValues.length > 0 && (
            <SectionCard
              title={`Step 2 — Photos by ${resolvedVisualOption.toLowerCase()}`}
              description="Upload photos for each color. Customers see these when they pick that color."
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {colorValues.map((value) => (
                  <div
                    key={value}
                    className="rounded-lg border border-dashed border-ui-border-base p-4 hover:border-ui-border-strong transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <Text weight="plus">{value}</Text>
                      <input
                        ref={(el) => {
                          fileInputRefs.current[value] = el
                        }}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          void handleVisualImageUpload(value, e.target.files)
                          e.target.value = ""
                        }}
                      />
                      <Button
                        variant="secondary"
                        size="small"
                        disabled={uploadingFor === value}
                        onClick={() => fileInputRefs.current[value]?.click()}
                      >
                        {uploadingFor === value ? "Uploading…" : "+ Add photos"}
                      </Button>
                    </div>
                    {(colorImages[value]?.length || 0) > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {colorImages[value].map((img, imgIdx) => (
                          <div key={imgIdx} className="relative group">
                            <img
                              src={img.url}
                              alt={`${value} ${imgIdx + 1}`}
                              className="h-20 w-20 rounded-lg object-cover border border-ui-border-base"
                            />
                            <button
                              type="button"
                              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white opacity-0 group-hover:opacity-100"
                              onClick={() => removeVisualImage(value, imgIdx)}
                              aria-label="Remove"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Text size="xsmall" className="text-ui-fg-muted">
                        No photos yet
                      </Text>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {colorValues.length > 0 && (
            <SectionCard
              title="Step 3 — Sizes, price & stock"
              description="For each color, add every size as its own row. Use + Add size to add 32, 33, 34, etc."
            >
              {variants.length > 1 && (
                <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-ui-bg-subtle p-3">
                  <div>
                    <Label className="text-xs">Same price for all</Label>
                    <Input
                      value={bulkPrice}
                      onChange={(e) => setBulkPrice(e.target.value)}
                      placeholder="₹"
                      className="w-28"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Same sale price</Label>
                    <Input
                      value={bulkSalePrice}
                      onChange={(e) => setBulkSalePrice(e.target.value)}
                      placeholder="₹"
                      className="w-28"
                    />
                  </div>
                  <Button variant="secondary" size="small" onClick={applyBulkPrice}>
                    Apply to all
                  </Button>
                </div>
              )}

              <div className="space-y-6">
                {colorValues.map((color) => {
                  const rows = variantsByColor.get(color) || []
                  return (
                    <div
                      key={color}
                      className="rounded-lg border border-ui-border-base overflow-hidden"
                    >
                      <div className="flex items-center justify-between gap-3 bg-ui-bg-subtle px-4 py-3 border-b border-ui-border-base">
                        <Text weight="plus">{color}</Text>
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={() => addSizeForColor(color)}
                        >
                          + Add size
                        </Button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[560px] border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-ui-border-base text-left text-xs uppercase text-ui-fg-muted">
                              <th className="px-3 py-2 font-medium">{primarySecondaryOption}</th>
                              <th className="px-3 py-2 font-medium">SKU</th>
                              <th className="px-3 py-2 font-medium">Stock</th>
                              <th className="px-3 py-2 font-medium">Price ₹</th>
                              <th className="px-3 py-2 font-medium">Sale ₹</th>
                              <th className="px-3 py-2 font-medium">Off %</th>
                              <th className="px-3 py-2 font-medium" />
                            </tr>
                          </thead>
                          <tbody>
                            {rows.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="px-3 py-4 text-center text-ui-fg-muted">
                                  <Button
                                    variant="secondary"
                                    size="small"
                                    onClick={() => addSizeForColor(color)}
                                  >
                                    + Add first size for {color}
                                  </Button>
                                </td>
                              </tr>
                            ) : (
                              rows.map((row) => renderSizeRow(row, color))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </div>
            </SectionCard>
          )}

          <div>
            <button
              type="button"
              className="text-sm text-ui-fg-muted hover:text-ui-fg-base underline-offset-2 hover:underline"
              onClick={() => setShowAdvancedOptions((v) => !v)}
            >
              {showAdvancedOptions ? "Hide advanced options" : "More than color & size?"}
            </button>
            {showAdvancedOptions && (
              <div className="mt-3 rounded-xl border border-ui-border-base p-4">
                <Text size="small" className="text-ui-fg-muted mb-3">
                  For 3+ options (e.g. Color × Size × Material), define all values and build the
                  full matrix.
                </Text>
                <div className="space-y-3">
                  {productOptions.map((opt, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-1 md:grid-cols-[140px_1fr_auto] gap-3 items-end"
                    >
                      <div>
                        <Label className="text-xs">Option</Label>
                        <Input
                          value={opt.title}
                          onChange={(e) =>
                            onProductOptionsChange(
                              productOptions.map((o, i) =>
                                i === index ? { ...o, title: e.target.value } : o
                              )
                            )
                          }
                          placeholder="Color"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">All values (comma-separated)</Label>
                        <Input
                          value={opt.valuesInput ?? opt.values.join(", ")}
                          onChange={(e) => {
                            const valuesInput = e.target.value
                            onProductOptionsChange(
                              productOptions.map((o, i) =>
                                i === index
                                  ? {
                                      ...o,
                                      valuesInput,
                                      values: parseOptionValuesInput(valuesInput),
                                    }
                                  : o
                              )
                            )
                          }}
                          placeholder="Black, White"
                        />
                      </div>
                      <Button
                        variant="transparent"
                        size="small"
                        onClick={() =>
                          onProductOptionsChange(productOptions.filter((_, i) => i !== index))
                        }
                        disabled={productOptions.length <= 1}
                        className="text-ui-fg-error"
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() =>
                      onProductOptionsChange([
                        ...productOptions,
                        { title: "", values: [], valuesInput: "" },
                      ])
                    }
                  >
                    + Add option
                  </Button>
                  <Button variant="primary" size="small" onClick={generateMatrix}>
                    Build full matrix
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {hasVariants && !useColorFirstFlow && !optionsReadOnly && (
        <SectionCard
          title="Product options"
          description="Define options and build the variant matrix."
        >
          <div className="space-y-3">
            {productOptions.map((opt, index) => (
              <div
                key={index}
                className="grid grid-cols-1 md:grid-cols-[140px_1fr_auto] gap-3 items-end"
              >
                <div>
                  <Label className="text-xs">Option</Label>
                  <Input
                    value={opt.title}
                    onChange={(e) =>
                      onProductOptionsChange(
                        productOptions.map((o, i) =>
                          i === index ? { ...o, title: e.target.value } : o
                        )
                      )
                    }
                    placeholder="Color"
                  />
                </div>
                <div>
                  <Label className="text-xs">Values</Label>
                  <Input
                    value={opt.valuesInput ?? opt.values.join(", ")}
                    onChange={(e) => {
                      const valuesInput = e.target.value
                      onProductOptionsChange(
                        productOptions.map((o, i) =>
                          i === index
                            ? {
                                ...o,
                                valuesInput,
                                values: parseOptionValuesInput(valuesInput),
                              }
                            : o
                        )
                      )
                    }}
                    placeholder="Black, White, Red"
                  />
                </div>
                <Button
                  variant="transparent"
                  size="small"
                  onClick={() =>
                    onProductOptionsChange(productOptions.filter((_, i) => i !== index))
                  }
                  disabled={productOptions.length <= 1}
                  className="text-ui-fg-error"
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="small"
              onClick={() =>
                onProductOptionsChange([
                  ...productOptions,
                  { title: "", values: [], valuesInput: "" },
                ])
              }
            >
              + Add option
            </Button>
            <Button variant="primary" size="small" onClick={generateMatrix}>
              Build variants
            </Button>
          </div>
        </SectionCard>
      )}

      {hasVariants &&
        !useColorFirstFlow &&
        resolvedVisualOption &&
        colorValues.length > 0 && (
          <SectionCard
            title={`Photos by ${resolvedVisualOption.toLowerCase()}`}
            description="Upload photos for each visual option value."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {colorValues.map((value) => (
                <div
                  key={value}
                  className="rounded-lg border border-dashed border-ui-border-base p-4"
                >
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <Text weight="plus">{value}</Text>
                    <input
                      ref={(el) => {
                        fileInputRefs.current[value] = el
                      }}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        void handleVisualImageUpload(value, e.target.files)
                        e.target.value = ""
                      }}
                    />
                    <Button
                      variant="secondary"
                      size="small"
                      disabled={uploadingFor === value}
                      onClick={() => fileInputRefs.current[value]?.click()}
                    >
                      {uploadingFor === value ? "Uploading…" : "+ Add photos"}
                    </Button>
                  </div>
                  {(colorImages[value]?.length || 0) > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {colorImages[value].map((img, imgIdx) => (
                        <div key={imgIdx} className="relative group">
                          <img
                            src={img.url}
                            alt={`${value} ${imgIdx + 1}`}
                            className="h-20 w-20 rounded-lg object-cover border border-ui-border-base"
                          />
                          <button
                            type="button"
                            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white"
                            onClick={() => removeVisualImage(value, imgIdx)}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Text size="xsmall" className="text-ui-fg-muted">
                      No photos yet
                    </Text>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        )}

      {!hasVariants && simpleProductExtras ? (
        <SectionCard
          title="Photos & videos"
          description="Upload product images here. First image becomes the thumbnail."
        >
          {simpleProductExtras}
        </SectionCard>
      ) : null}

      {hasVariants && !useColorFirstFlow && (
        <SectionCard
          title="Price & stock"
          description="Set price and stock for each combination."
        >
          {variants.length > 1 && (
            <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-ui-bg-subtle p-3">
              <div>
                <Label className="text-xs">Same price for all</Label>
                <Input
                  value={bulkPrice}
                  onChange={(e) => setBulkPrice(e.target.value)}
                  placeholder="₹"
                  className="w-28"
                />
              </div>
              <div>
                <Label className="text-xs">Same sale price</Label>
                <Input
                  value={bulkSalePrice}
                  onChange={(e) => setBulkSalePrice(e.target.value)}
                  placeholder="₹"
                  className="w-28"
                />
              </div>
              <Button variant="secondary" size="small" onClick={applyBulkPrice}>
                Apply to all
              </Button>
            </div>
          )}

          {variants.length === 0 ? (
            <div className="rounded-lg border border-dashed border-ui-border-base py-10 text-center">
              <Text className="text-ui-fg-muted">
                Add options above and click <strong>Build variants</strong> first.
              </Text>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ui-border-base text-left text-xs uppercase text-ui-fg-muted">
                    {optionTitles.map((title) => (
                      <th key={title} className="px-3 py-2 font-medium">
                        {title}
                      </th>
                    ))}
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium">Stock</th>
                    <th className="px-3 py-2 font-medium">Price ₹</th>
                    <th className="px-3 py-2 font-medium">Sale ₹</th>
                    <th className="px-3 py-2 font-medium">Off %</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((variant, idx) => (
                    <tr key={variant.id || idx} className="border-b border-ui-border-base/60">
                      {optionTitles.map((title) => (
                        <td key={title} className="px-3 py-2 whitespace-nowrap font-medium">
                          {variant.optionValues[title] || "—"}
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        <Input
                          value={variant.sku}
                          onChange={(e) => updateVariantField(idx, "sku", e.target.value)}
                          onBlur={(e) => handleSkuBlur(idx, e.target.value)}
                          placeholder="Optional"
                          className="min-w-[80px] h-8"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min="0"
                          value={variant.inventoryCount}
                          onChange={(e) =>
                            updateVariantField(idx, "inventoryCount", e.target.value)
                          }
                          className="w-16 h-8"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={variant.price}
                          onChange={(e) => updateVariantField(idx, "price", e.target.value)}
                          className="w-24 h-8"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={variant.discountedPrice}
                          onChange={(e) =>
                            updateVariantField(idx, "discountedPrice", e.target.value)
                          }
                          className="w-24 h-8"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <VariantDiscountCell
                          price={variant.price}
                          discountedPrice={variant.discountedPrice}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {!hasVariants && (
        <SectionCard
          title="Pricing & inventory"
          description="Set SKU, stock, and price for this product."
        >
          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ui-border-base text-left text-xs uppercase text-ui-fg-muted">
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium">Stock</th>
                  <th className="px-3 py-2 font-medium">Price ₹</th>
                  <th className="px-3 py-2 font-medium">Sale ₹</th>
                  <th className="px-3 py-2 font-medium">Off %</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((variant, idx) => (
                  <tr key={variant.id || idx} className="border-b border-ui-border-base/60">
                    <td className="px-3 py-2">
                      <Input
                        value={variant.sku}
                        onChange={(e) => updateVariantField(idx, "sku", e.target.value)}
                        onBlur={(e) => handleSkuBlur(idx, e.target.value)}
                        placeholder="Optional"
                        className="min-w-[80px] h-8"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min="0"
                        value={variant.inventoryCount}
                        onChange={(e) =>
                          updateVariantField(idx, "inventoryCount", e.target.value)
                        }
                        className="w-16 h-8"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={variant.price}
                        onChange={(e) => updateVariantField(idx, "price", e.target.value)}
                        className="w-24 h-8"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={variant.discountedPrice}
                        onChange={(e) =>
                          updateVariantField(idx, "discountedPrice", e.target.value)
                        }
                        className="w-24 h-8"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <VariantDiscountCell
                        price={variant.price}
                        discountedPrice={variant.discountedPrice}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  )
}
