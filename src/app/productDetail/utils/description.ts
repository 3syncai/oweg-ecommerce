'use client'

import type { DescriptionLine } from '../types'

export const formatPlainDescription = (text: string): DescriptionLine[] =>
  text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, ...rest] = line.split(':')
      const value = rest.join(':').trim()
      const showLabel = value && label && label.trim().length < 40
      if (showLabel) {
        return { label: label.trim(), value }
      }
      return { value: line }
    })

export const formatHtmlDescription = (html: string) => {
  const trimmed = html.trim()
  if (!trimmed) return ''
  if (/<(ul|ol|table|p|li)[^>]*>/i.test(trimmed)) {
    return trimmed
  }
  const fallback = trimmed.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?div[^>]*>/gi, '\n')
  const lines = formatPlainDescription(fallback)
  const listItems = lines
    .map((item) =>
      item.label
        ? `<li><strong>${item.label}:</strong> ${item.value}</li>`
        : `<li>${item.value}</li>`
    )
    .join('')
  return `<ul class="desc-list">${listItems}</ul>`
}
