/** oweg.in section chrome that should never become product description */
const DESCRIPTION_SECTION_HEADING =
  /^(product\s+)?(description|overview|details|information|info|specification|specifications)(\s*:)?$/i

function isDescriptionSectionHeading(text: string): boolean {
  return DESCRIPTION_SECTION_HEADING.test(text.replace(/\s+/g, " ").trim())
}

function looksLikeHtml(input: string): boolean {
  return /<[a-z][\s\S]*>/i.test(input)
}

/**
 * Remove oweg tab titles / leftover heading HTML from migrated descriptions.
 */
export function stripDescriptionSectionHeadings(input: string): string {
  let text = (input || "").trim()
  if (!text) return ""

  // Strip leading/standalone heading tags like <h3>Product Description</h3>
  text = text.replace(
    /<(h[1-4]|p|strong|b)[^>]*>\s*(product\s+)?(description|overview|details|information|info|specification|specifications)\s*:?\s*<\/\1>/gi,
    ""
  )

  // Strip plain-text section titles (one per line)
  text = text
    .split("\n")
    .filter((line) => !isDescriptionSectionHeading(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  return text
}

/**
 * Convert stored HTML (or plain text) into editable plain text for vendor forms.
 */
export function htmlToEditableDescription(input: string): string {
  const raw = (input || "").trim()
  if (!raw) return ""

  if (!looksLikeHtml(raw)) {
    return stripDescriptionSectionHeadings(raw)
  }

  if (typeof DOMParser === "undefined") {
    // SSR / non-browser fallback — strip tags roughly
    return stripDescriptionSectionHeadings(
      raw
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|h[1-4]|li|tr)>/gi, "\n")
        .replace(/<li[^>]*>/gi, "- ")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    )
  }

  const doc = new DOMParser().parseFromString(`<div id="root">${raw}</div>`, "text/html")
  const root = doc.getElementById("root")
  if (!root) return stripDescriptionSectionHeadings(raw.replace(/<[^>]+>/g, "").trim())

  const lines: string[] = []

  const emit = (text: string, blankAfter = false) => {
    const normalized = text.replace(/\s+/g, " ").trim()
    if (!normalized || isDescriptionSectionHeading(normalized)) return
    lines.push(normalized)
    if (blankAfter) lines.push("")
  }

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      emit(node.textContent || "")
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return

    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()

    if (tag === "table") {
      el.querySelectorAll("tr").forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll("th, td"))
          .map((cell) => (cell.textContent || "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
        if (cells.length >= 2) emit(`${cells[0]}: ${cells.slice(1).join(" ")}`)
        else if (cells.length === 1) emit(cells[0])
      })
      lines.push("")
      return
    }

    if (tag === "ul" || tag === "ol") {
      Array.from(el.children).forEach((child) => {
        if (child.tagName.toLowerCase() === "li") {
          const item = (child.textContent || "").replace(/\s+/g, " ").trim()
          if (item) emit(`- ${item}`)
        }
      })
      lines.push("")
      return
    }

    if (/^h[1-4]$/.test(tag)) {
      if (el.querySelector("table, ul, ol")) {
        Array.from(el.childNodes).forEach(walk)
      } else {
        emit(el.textContent || "", true)
      }
      return
    }

    if (tag === "br") {
      lines.push("")
      return
    }

    if (tag === "li") {
      const item = (el.textContent || "").replace(/\s+/g, " ").trim()
      if (item) emit(`- ${item}`)
      return
    }

    if (tag === "p" || tag === "div") {
      // Prefer line breaks inside paragraphs
      const hasBlockChildren = el.querySelector("ul, ol, table, p, div, h1, h2, h3, h4")
      if (hasBlockChildren) {
        Array.from(el.childNodes).forEach(walk)
      } else {
        const html = el.innerHTML || ""
        const parts = html
          .split(/<br\s*\/?>/i)
          .map((part) =>
            part
              .replace(/<[^>]+>/g, "")
              .replace(/&nbsp;/g, " ")
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/\s+/g, " ")
              .trim()
          )
          .filter(Boolean)
        if (parts.length) {
          parts.forEach((part) => emit(part))
          lines.push("")
        }
      }
      return
    }

    if (el.childNodes.length) {
      Array.from(el.childNodes).forEach(walk)
    } else {
      emit(el.textContent || "")
    }
  }

  Array.from(root.childNodes).forEach(walk)

  return stripDescriptionSectionHeadings(
    lines
      .filter((line) => !isDescriptionSectionHeading(line))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  )
}

/**
 * Convert plain migrated description text into simple HTML for the storefront.
 * Leaves existing HTML alone (after stripping oweg section chrome).
 */
export function toProductDescriptionHtml(input: string): string {
  const raw = stripDescriptionSectionHeadings(input)
  if (!raw) return ""

  // Already HTML from manual editing — still drop section-chrome-only wrappers
  if (looksLikeHtml(raw)) {
    // If it still looks like full HTML body, keep structure but strip chrome headings
    return stripDescriptionSectionHeadings(raw)
  }

  const blocks = raw.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  const htmlParts: string[] = []

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !isDescriptionSectionHeading(l))
    if (!lines.length) continue

    const bulletLines = lines.filter((l) => /^[-*•]\s+/.test(l))
    if (bulletLines.length === lines.length) {
      const items = lines
        .map((l) => l.replace(/^[-*•]\s+/, "").trim())
        .filter(Boolean)
        .map((l) => `<li>${escapeHtml(l)}</li>`)
        .join("")
      htmlParts.push(`<ul>${items}</ul>`)
      continue
    }

    if (lines.length === 1 && lines[0].length < 80 && !lines[0].includes(":")) {
      htmlParts.push(`<h3>${escapeHtml(lines[0])}</h3>`)
      continue
    }

    htmlParts.push(
      `<p>${lines.map((l) => escapeHtml(l)).join("<br/>")}</p>`
    )
  }

  return htmlParts.join("\n")
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
