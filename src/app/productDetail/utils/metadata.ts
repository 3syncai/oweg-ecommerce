'use client'

import type { DetailedProduct as DetailedProductType } from '@/lib/medusa'

export type DescriptionLine = { label?: string; value: string }
type MetaRecord = Record<string, unknown> | null | undefined
type DimensionType = 'height' | 'width' | 'length'

const COLOR_KEYWORDS = [
  'white',
  'black',
  'blue',
  'red',
  'green',
  'yellow',
  'silver',
  'gold',
  'brown',
  'grey',
  'gray',
  'orange',
  'pink',
  'purple',
]

export const deriveColorName = (name?: string) => {
  if (!name) return 'All'
  const lower = name.toLowerCase()
  const match = COLOR_KEYWORDS.find((color) => lower.includes(color))
  return match ? match.charAt(0).toUpperCase() + match.slice(1) : 'All'
}

const normalizeMetaKey = (key: string) => key.replace(/[\s_-]+/g, '').toLowerCase()

const resolveMetaValue = (meta: MetaRecord, key: string): unknown => {
  if (!meta) return undefined
  if (Object.prototype.hasOwnProperty.call(meta, key)) {
    return (meta as Record<string, unknown>)[key]
  }
  const normalizedTarget = normalizeMetaKey(key)
  for (const [currentKey, value] of Object.entries(meta)) {
    if (normalizeMetaKey(currentKey) === normalizedTarget) return value
  }
  return undefined
}

const formatNumberCompact = (value: number) => {
  if (Number.isNaN(value)) return '-'
  if (Number.isInteger(value)) return value.toFixed(0)
  const fixed = value.toFixed(2)
  return fixed.replace(/\.?0+$/, '')
}

const extractMetaString = (meta: MetaRecord, key: string) => {
  const value = resolveMetaValue(meta, key)
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

const extractMetaNumber = (meta: MetaRecord, key: string) => {
  const value = resolveMetaValue(meta, key)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^0-9.-]+/g, ''))
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

const formatCapacityFromMeta = (meta: MetaRecord) => {
  const sources: Array<{ keys: string[]; unit?: string; normalize?: (value: number) => number }> = [
    { keys: ['capacity_l', 'capacity_liter', 'capacity_liters'], unit: 'L' },
    { keys: ['capacity_ml'], unit: 'L', normalize: (value) => value / 1000 },
    { keys: ['capacity'], unit: undefined },
    { keys: ['capacity_g'], unit: 'g' },
  ]

  for (const source of sources) {
    for (const key of source.keys) {
      const num = extractMetaNumber(meta, key)
      if (num !== undefined && num > 0) {
        const normalized = source.normalize ? source.normalize(num) : num
        const unitLabel = source.unit ? ` ${source.unit}` : ''
        return `Capacity: ${formatNumberCompact(normalized)}${unitLabel}`
      }
      const raw = extractMetaString(meta, key)
      if (raw) {
        return `Capacity: ${raw}`
      }
    }
  }
  return undefined
}

const formatWeightFromMeta = (meta: MetaRecord) => {
  const kg = extractMetaNumber(meta, 'weight_kg')
  if (kg !== undefined && kg > 0) {
    return `${formatNumberCompact(kg)} kg`
  }
  const grams = extractMetaNumber(meta, 'weight_g')
  if (grams !== undefined && grams > 0) {
    const value = grams / 1000
    return `${formatNumberCompact(value)} kg`
  }
  const generic = extractMetaString(meta, 'weight')
  if (generic) {
    const parsed = parseFloat(generic.replace(/[^0-9.-]+/g, ''))
    if (Number.isFinite(parsed)) {
      if (/kg/i.test(generic)) {
        return `${formatNumberCompact(parsed)} kg`
      }
      if (/g/i.test(generic)) {
        return `${formatNumberCompact(parsed / 1000)} kg`
      }
    }
    return generic
  }
  const capacity = formatCapacityFromMeta(meta)
  if (capacity) return capacity
  return '-'
}

const DIMENSION_KEY_MAP: Record<DimensionType, Array<{ key: string; unit?: string }>> = {
  height: [
    { key: 'height_cm', unit: 'cm' },
    { key: 'height_mm', unit: 'mm' },
    { key: 'height_in', unit: 'in' },
    { key: 'height', unit: '' },
    { key: 'dimensions_height', unit: '' },
  ],
  width: [
    { key: 'width_cm', unit: 'cm' },
    { key: 'width_mm', unit: 'mm' },
    { key: 'width_in', unit: 'in' },
    { key: 'width', unit: '' },
    { key: 'dimensions_width', unit: '' },
  ],
  length: [
    { key: 'length_cm', unit: 'cm' },
    { key: 'length_mm', unit: 'mm' },
    { key: 'length_in', unit: 'in' },
    { key: 'length', unit: '' },
    { key: 'dimensions_length', unit: '' },
  ],
}

const readMeasurement = (meta: MetaRecord, type: DimensionType) => {
  for (const candidate of DIMENSION_KEY_MAP[type]) {
    const numeric = extractMetaNumber(meta, candidate.key)
    if (numeric !== undefined && numeric > 0) {
      return { value: numeric, unit: candidate.unit }
    }
    const raw = extractMetaString(meta, candidate.key)
    if (raw) {
      const parsed = parseFloat(raw.replace(/[^0-9.-]+/g, ''))
      if (Number.isFinite(parsed)) {
        const detected = candidate.unit || (raw.match(/cm|mm|in|inch|ft/i)?.[0] ?? '')
        return { value: parsed, unit: detected.trim() }
      }
    }
  }
  return { value: undefined, unit: undefined }
}

const formatDimensionsFromMeta = (meta: MetaRecord) => {
  const height = readMeasurement(meta, 'height')
  const width = readMeasurement(meta, 'width')
  const length = readMeasurement(meta, 'length')
  const hasValue = height.value !== undefined || width.value !== undefined || length.value !== undefined
  if (hasValue) {
    const formatMeasurement = (measurement: { value?: number; unit?: string }) =>
      measurement.value === undefined
        ? '-'
        : `${formatNumberCompact(measurement.value)}${measurement.unit ? ` ${measurement.unit}` : ''}`
    return `${formatMeasurement(length)} x ${formatMeasurement(width)} x ${formatMeasurement(height)} (L x W x H)`
  }

  const combined = extractMetaString(meta, 'dimensions')
  if (combined) return combined
  return '-'
}

export const formatWeightDisplay = (detail?: DetailedProductType | null) => {
  if (!detail) return '-'
  const meta = detail.metadata as MetaRecord
  const variantMeta = detail.variants?.[0]?.metadata as MetaRecord

  const primary = formatWeightFromMeta(meta)
  if (primary !== '-') return primary

  const variantMetaWeight = formatWeightFromMeta(variantMeta)
  if (variantMetaWeight !== '-') return variantMetaWeight

  const variantWeight = detail.variants?.[0]?.weight
  if (variantWeight !== undefined && variantWeight !== null && Number.isFinite(variantWeight)) {
    return `${variantWeight % 1 === 0 ? variantWeight.toFixed(0) : variantWeight.toFixed(2)} kg`
  }
  return '-'
}

export const formatDimensionsDisplay = (detail?: DetailedProductType | null) => {
  if (!detail) return '-'
  const meta = detail.metadata as MetaRecord
  const variantMeta = detail.variants?.[0]?.metadata as MetaRecord

  const primary = formatDimensionsFromMeta(meta)
  if (primary !== '-') return primary

  const variantMetaDimensions = formatDimensionsFromMeta(variantMeta)
  if (variantMetaDimensions !== '-') return variantMetaDimensions

  const variant = detail.variants?.[0]
  if (variant) {
    const derivedMeta: Record<string, unknown> = {}
    if (variant.length) derivedMeta.length = variant.length
    if (variant.width) derivedMeta.width = variant.width
    if (variant.height) derivedMeta.height = variant.height
    const fromVariant = formatDimensionsFromMeta(derivedMeta)
    if (fromVariant !== '-') return fromVariant
  }
  return '-'
}

export {
  extractMetaString,
  extractMetaNumber,
  formatDimensionsFromMeta,
  formatWeightFromMeta,
  formatCapacityFromMeta,
  formatNumberCompact,
  normalizeMetaKey,
  resolveMetaValue,
  type MetaRecord,
  type DimensionType,
}
