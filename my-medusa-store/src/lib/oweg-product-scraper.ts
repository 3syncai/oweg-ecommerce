import * as cheerio from "cheerio"
import sanitizeHtml from "sanitize-html"

const ALLOWED_HOSTS = new Set(["oweg.in", "www.oweg.in"])
const MAX_IMAGES = 12
const MAX_AUTO_VARIANTS = 100
const FETCH_TIMEOUT_MS = 45000
const FETCH_RETRIES = 1
const VISUAL_OPTION_PATTERN = /color|colour|pattern|finish|shade|style/i

export type ScrapedProductOption = {
  title: string
  values: string[]
  valueImages?: Record<string, string[]>
}

export type ScrapedVariantRow = {
  title: string
  sku: string
  managedInventory: boolean
  allowBackorder: boolean
  inventoryCount: string
  price: string
  discountedPrice: string
  optionValues: Record<string, string>
}

export type ScrapedOwegProduct = {
  sourceUrl: string
  title: string
  handle: string
  description: string
  brand: string
  sku: string
  price: string
  discountedPrice: string
  inStock: boolean
  imageUrls: string[]
  colorImageUrls: Record<string, string[]>
  hasVariants: boolean
  productOptions: ScrapedProductOption[]
  variants: ScrapedVariantRow[]
  warnings: string[]
}

export class OwegScrapeError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "OwegScrapeError"
    this.status = status
  }
}

export function assertAllowedOwegUrl(rawUrl: string): URL {
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    throw new OwegScrapeError("Invalid product URL")
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new OwegScrapeError("URL must use http or https")
  }

  const host = parsed.hostname.toLowerCase()
  if (!ALLOWED_HOSTS.has(host)) {
    throw new OwegScrapeError("Only oweg.in product URLs are allowed")
  }

  const path = parsed.pathname.replace(/\/+$/, "")
  const lastSegment = path.split("/").filter(Boolean).pop() || ""
  const productId = parsed.searchParams.get("product_id")
  const looksLikeProductId = Boolean(productId && /^\d+$/.test(productId))
  const looksLikeSlug = lastSegment.length >= 8 && lastSegment !== "index.php"

  if (!looksLikeProductId && !looksLikeSlug) {
    throw new OwegScrapeError(
      "Paste the full product URL from oweg.in (the link looks incomplete)"
    )
  }

  return parsed
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180)
}

export function parseInrAmount(raw: string | undefined | null): string {
  if (!raw) return ""
  const matches = String(raw).match(/[\d,]+(?:\.\d+)?/g)
  if (!matches?.length) return ""
  const last = matches[matches.length - 1].replace(/,/g, "")
  const num = Number(last)
  if (!Number.isFinite(num) || num <= 0) return ""
  return String(Math.round(num * 100) / 100)
}

function absoluteUrl(base: URL, href: string | undefined | null): string | null {
  if (!href) return null
  const trimmed = href.trim()
  if (!trimmed || trimmed.startsWith("data:")) return null
  try {
    return new URL(trimmed, base).toString()
  } catch {
    return null
  }
}

export function preferLargerImageUrl(url: string): string {
  try {
    const parsed = new URL(url.trim())
    parsed.pathname = parsed.pathname.replace(
      /-(\d{2,4})x(\d{2,4})(\.[a-z0-9]+)$/i,
      (_match, w: string, h: string, ext: string) => {
        const width = Number(w)
        const height = Number(h)
        if (Number.isFinite(width) && Number.isFinite(height) && Math.max(width, height) < 800) {
          return `-800x800${ext}`
        }
        return `-${w}x${h}${ext}`
      }
    )
    return parsed.toString()
  } catch {
    return url.trim()
  }
}

export function catalogOriginalImageUrl(url: string): string {
  try {
    const parsed = new URL(url.trim())
    parsed.pathname = parsed.pathname
      .replace(/\/image\/cache\//i, "/image/")
      .replace(/-\d{2,4}x\d{2,4}(\.[a-z0-9]+)$/i, "$1")
    return parsed.toString()
  } catch {
    return url.trim()
  }
}

export function detectVisualOptionTitle(optionTitles: string[]): string | undefined {
  if (!optionTitles.length) return undefined
  return optionTitles.find((title) => VISUAL_OPTION_PATTERN.test(title)) || optionTitles[0]
}

function imageDedupeKey(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.pathname
      .toLowerCase()
      .replace(/-\d{2,4}x\d{2,4}(\.[a-z0-9]+)$/i, "$1")
  } catch {
    return url.toLowerCase()
  }
}

/** oweg.in tab / section chrome — not real product copy */
const DESCRIPTION_SECTION_HEADING =
  /^(product\s+)?(description|overview|details|information|info|specification|specifications)(\s*:)?$/i

function isDescriptionSectionHeading(text: string): boolean {
  return DESCRIPTION_SECTION_HEADING.test(text.replace(/\s+/g, " ").trim())
}

/**
 * Turn messy oweg HTML into plain text for the vendor form (no raw tags).
 * Specs tables become "Label: Value" lines; lists become "- item" lines.
 * Strips oweg section titles like "Product Description" / "Product Overview".
 */
export function htmlToPlainDescription(html: string): string {
  if (!html?.trim()) return ""

  const cleaned = sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "h1",
      "h2",
      "h3",
      "h4",
      "ul",
      "ol",
      "li",
      "table",
      "tr",
      "th",
      "td",
      "div",
      "strong",
      "em",
      "b",
      "i",
    ],
    allowedAttributes: {},
  })

  const $ = cheerio.load(`<div id="oweg-desc-root">${cleaned}</div>`)

  // Drop section chrome headings from the HTML before walking
  $("#oweg-desc-root")
    .find("h1, h2, h3, h4, strong, b, p")
    .each((_, el) => {
      const $el = $(el)
      if (!$el.find("table, ul, ol, p, div").length && isDescriptionSectionHeading($el.text())) {
        $el.remove()
      }
    })

  const lines: string[] = []

  const emit = (text: string, blankAfter = false) => {
    const normalized = text.replace(/\s+/g, " ").trim()
    if (!normalized) return
    if (isDescriptionSectionHeading(normalized)) return
    lines.push(normalized)
    if (blankAfter) lines.push("")
  }

  const walk = (nodes: cheerio.Cheerio<any>) => {
    nodes.each((_, node) => {
      if (node.type === "text") {
        emit($(node).text())
        return
      }
      if (node.type !== "tag") return

      const tag = node.name?.toLowerCase?.() || ""

      if (tag === "table") {
        $(node)
          .find("tr")
          .each((__, tr) => {
            const cells = $(tr)
              .children("th, td")
              .map((___, cell) => $(cell).text().replace(/\s+/g, " ").trim())
              .get()
              .filter(Boolean)
            if (cells.length >= 2) emit(`${cells[0]}: ${cells.slice(1).join(" ")}`)
            else if (cells.length === 1) emit(cells[0])
          })
        lines.push("")
        return
      }

      if (tag === "ul" || tag === "ol") {
        $(node)
          .children("li")
          .each((__, li) => {
            const item = $(li).text().replace(/\s+/g, " ").trim()
            if (item) emit(`- ${item}`)
          })
        lines.push("")
        return
      }

      if (/^h[1-4]$/.test(tag)) {
        // oweg wraps tables inside <h2> — walk children instead of flattening
        if ($(node).find("table, ul, ol").length) {
          walk($(node).contents())
        } else {
          emit($(node).text(), true)
        }
        return
      }

      if (tag === "br") {
        lines.push("")
        return
      }

      if (tag === "li") {
        const item = $(node).text().replace(/\s+/g, " ").trim()
        if (item) emit(`- ${item}`)
        return
      }

      // Walk children for containers; avoid double-counting nested table/list text
      if ($(node).children().length) {
        walk($(node).contents())
      } else {
        emit($(node).text())
      }
    })
  }

  walk($("#oweg-desc-root").contents())

  return lines
    .filter((line) => !isDescriptionSectionHeading(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function cartesian<T>(arrays: T[][]): T[][] {
  if (!arrays.length) return [[]]
  return arrays.reduce<T[][]>(
    (acc, curr) => acc.flatMap((prefix) => curr.map((item) => [...prefix, item])),
    [[]]
  )
}

function extractJsonLdProducts($: cheerio.CheerioAPI): Record<string, unknown>[] {
  const products: Record<string, unknown>[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html()
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      const nodes = Array.isArray(parsed) ? parsed : [parsed]
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue
        const type = (node as any)["@type"]
        if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) {
          products.push(node as Record<string, unknown>)
        }
        if ((node as any)["@graph"] && Array.isArray((node as any)["@graph"])) {
          for (const graphNode of (node as any)["@graph"]) {
            const gType = graphNode?.["@type"]
            if (gType === "Product" || (Array.isArray(gType) && gType.includes("Product"))) {
              products.push(graphNode)
            }
          }
        }
      }
    } catch {
      // ignore
    }
  })
  return products
}

function collectImageUrls($: cheerio.CheerioAPI, pageUrl: URL): string[] {
  const found: string[] = []

  const push = (href: string | undefined | null) => {
    const abs = absoluteUrl(pageUrl, href)
    if (!abs) return
    if (!/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(abs) && !abs.includes("/image/")) {
      return
    }
    found.push(abs)
  }

  $("#thumb-slider a[data-image], .thumb-vertical a[data-image], .image-additional a[data-image]").each(
    (_, el) => {
      push($(el).attr("data-image"))
    }
  )

  $(".large-image img, #image img, .product-image-zoom img").each((_, el) => {
    push($(el).attr("data-zoom-image") || $(el).attr("data-src") || $(el).attr("src"))
  })

  $('meta[property="og:image"], meta[name="twitter:image"]').each((_, el) => {
    push($(el).attr("content"))
  })

  for (const product of extractJsonLdProducts($)) {
    const image = product.image
    if (typeof image === "string") push(image)
    else if (Array.isArray(image)) {
      for (const item of image) {
        if (typeof item === "string") push(item)
        else if (item && typeof item === "object" && "url" in item) {
          push(String((item as any).url))
        }
      }
    }
  }

  const unique: string[] = []
  const seen = new Set<string>()
  for (const url of found) {
    const key = imageDedupeKey(url)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(url)
    if (unique.length >= MAX_IMAGES) break
  }
  return unique
}

function normalizeOptionValueLabel(raw: string): string {
  return raw
    .replace(/\+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[:*]\s*$/g, "")
    .trim()
}

function extractOptions($: cheerio.CheerioAPI, pageUrl: URL): ScrapedProductOption[] {
  const options: ScrapedProductOption[] = []
  const root: cheerio.Cheerio<any> = $("#product").length ? $("#product") : $.root()

  root.find('select[name^="option"]').each((_, el) => {
    const select = $(el)
    const group =
      select.closest(".form-group, .option, fieldset").find("label").first().text().trim() ||
      select.attr("name") ||
      "Option"
    const title = group.replace(/[:*]\s*$/, "").replace(/\s+/g, " ").trim()
    const values: string[] = []
    select.find("option").each((__, opt) => {
      const value = $(opt).attr("value")
      const text = normalizeOptionValueLabel($(opt).text())
      if (!value || value === "" || /^---/.test(text) || /please select/i.test(text)) {
        return
      }
      if (text) values.push(text)
    })
    const unique = Array.from(new Set(values))
    if (title && unique.length) {
      options.push({ title, values: unique })
    }
  })

  const radioGroups = new Map<string, { values: string[]; valueImages: Record<string, string[]> }>()
  root.find('input[type="radio"][name^="option"]').each((_, el) => {
    const input = $(el)
    const name = input.attr("name") || ""
    const optionBox =
      input.nextAll(".option-content-box").first().length
        ? input.nextAll(".option-content-box").first()
        : input.siblings(".option-content-box").first().length
          ? input.siblings(".option-content-box").first()
          : input.parent().find(".option-content-box").first()

    const wrapper = optionBox.length
      ? optionBox
      : input.closest("label, .radio, span, div")

    const optionName =
      wrapper.find(".option-name").first().text() ||
      wrapper.attr("data-title") ||
      wrapper.find("[data-title]").attr("data-title") ||
      input.closest("label").text() ||
      root.find(`label[for="${input.attr("id")}"]`).text() ||
      ""
    const value = normalizeOptionValueLabel(optionName)
    const groupLabel =
      input.closest(".form-group, .option, fieldset").children("label").first().text().trim() ||
      input.closest(".form-group, .option, fieldset").find("label").first().text().trim() ||
      name
    const title = groupLabel.replace(/[:*]\s*$/, "").replace(/\s+/g, " ").trim()
    if (!title || !value || /^qty$/i.test(title)) return

    const imgSrc = (
      wrapper.find("img").first().attr("src") ||
      wrapper.find("img").first().attr("data-src") ||
      input.parent().find("img").first().attr("src") ||
      ""
    ).trim()
    const absImg = absoluteUrl(pageUrl, imgSrc)

    const existing = radioGroups.get(title) || { values: [], valueImages: {} }
    existing.values.push(value)
    if (absImg) {
      existing.valueImages[value] = [absImg]
    }
    radioGroups.set(title, existing)
  })

  for (const [title, data] of radioGroups.entries()) {
    const unique = Array.from(new Set(data.values))
    if (!options.some((o) => o.title.toLowerCase() === title.toLowerCase()) && unique.length) {
      options.push({
        title,
        values: unique,
        valueImages: Object.keys(data.valueImages).length ? data.valueImages : undefined,
      })
    }
  }

  return options
}

/**
 * Map gallery photos to colors. Do NOT use OpenCart option swatches — those are
 * tiny solid color chips and look wrong under "Photos by color".
 */
export function buildColorImageUrls(
  options: ScrapedProductOption[],
  galleryUrls: string[],
  warnings: string[]
): Record<string, string[]> {
  const visualTitle = detectVisualOptionTitle(options.map((o) => o.title))
  if (!visualTitle) return {}

  const visual = options.find((o) => o.title === visualTitle)
  if (!visual?.values.length) return {}

  const mapped: Record<string, string[]> = {}

  if (galleryUrls.length === visual.values.length) {
    visual.values.forEach((value, index) => {
      mapped[value] = [galleryUrls[index]]
    })
    warnings.push("Assigned gallery photos to colors 1:1 by page order — verify each color")
    return mapped
  }

  if (galleryUrls.length === visual.values.length + 1) {
    // Common pattern: first image is hero, remaining match colors
    visual.values.forEach((value, index) => {
      mapped[value] = [galleryUrls[index + 1]]
    })
    warnings.push(
      "Skipped hero image; assigned remaining gallery photos to colors by order — verify each color"
    )
    return mapped
  }

  if (galleryUrls.length > 0) {
    warnings.push(
      "oweg.in color chips are not real product photos — left Photos by color empty. Upload the correct photo for each color."
    )
  }

  return mapped
}

function buildVariants(params: {
  options: ScrapedProductOption[]
  sku: string
  price: string
  discountedPrice: string
  inStock: boolean
}): { hasVariants: boolean; variants: ScrapedVariantRow[]; warnings: string[] } {
  const warnings: string[] = []
  const { options, sku, price, discountedPrice, inStock } = params
  const inventoryCount = inStock ? "10" : "0"

  if (!options.length) {
    warnings.push("No variants found; created simple product")
    return {
      hasVariants: false,
      variants: [
        {
          title: "Default variant",
          sku,
          managedInventory: true,
          allowBackorder: true,
          inventoryCount,
          price,
          discountedPrice,
          optionValues: {},
        },
      ],
      warnings,
    }
  }

  const valueArrays = options.map((o) => o.values)
  const combos = cartesian(valueArrays)
  if (combos.length > MAX_AUTO_VARIANTS) {
    warnings.push(
      `Too many option combinations (${combos.length}); fell back to a simple product`
    )
    return {
      hasVariants: false,
      variants: [
        {
          title: "Default variant",
          sku,
          managedInventory: true,
          allowBackorder: true,
          inventoryCount,
          price,
          discountedPrice,
          optionValues: {},
        },
      ],
      warnings,
    }
  }

  const variants: ScrapedVariantRow[] = combos.map((combo, index) => {
    const optionValues: Record<string, string> = {}
    combo.forEach((value, i) => {
      optionValues[options[i].title] = value
    })
    const title = combo.join(" / ")
    const suffix = combo.map((v) => slugify(v)).filter(Boolean).join("-")
    return {
      title,
      sku: sku ? `${sku}-${suffix || index + 1}` : "",
      managedInventory: true,
      allowBackorder: true,
      inventoryCount,
      price,
      discountedPrice,
      optionValues,
    }
  })

  return { hasVariants: true, variants, warnings }
}

function handleFromUrl(pageUrl: URL, title: string): string {
  const path = pageUrl.pathname.replace(/\/+$/, "")
  const last = path.split("/").filter(Boolean).pop() || ""
  if (last && last !== "index.php" && !last.includes("product_id")) {
    return slugify(decodeURIComponent(last))
  }
  const productId = pageUrl.searchParams.get("product_id")
  if (productId) {
    return slugify(`${title || "product"}-${productId}`)
  }
  return slugify(title || "product")
}

export function parseOwegProductHtml(html: string, pageUrl: URL): ScrapedOwegProduct {
  const $ = cheerio.load(html)
  const warnings: string[] = []
  const jsonLd = extractJsonLdProducts($)[0]

  const title =
    $('h1[itemprop="name"]').first().text().trim() ||
    $("h1").first().text().trim() ||
    (typeof jsonLd?.name === "string" ? jsonLd.name : "") ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    ""

  if (!title) {
    throw new OwegScrapeError("Could not extract product title from page", 422)
  }

  const brand =
    $(".brand span[itemprop='name']").first().text().trim() ||
    $('a[itemprop="brand"] span[itemprop="name"]').first().text().trim() ||
    $(".brand").first().text().replace(/Brand:\s*/i, "").trim() ||
    (typeof (jsonLd as any)?.brand === "string"
      ? String((jsonLd as any).brand)
      : typeof (jsonLd as any)?.brand?.name === "string"
        ? String((jsonLd as any).brand.name)
        : "") ||
    ""

  const sku =
    $(".model")
      .first()
      .text()
      .replace(/Product Code:\s*/i, "")
      .trim() ||
    (typeof jsonLd?.sku === "string" ? jsonLd.sku : "") ||
    ""

  const saleRaw =
    $("#price-special").text() ||
    $(".product_page_price .price-new").first().text() ||
    $(".price-new").first().text() ||
    ""
  const mrpRaw =
    $("#price-old").text() ||
    $(".product_page_price .price-old").first().text() ||
    $(".price-old").first().text() ||
    ""

  let discountedPrice = parseInrAmount(saleRaw)
  let price = parseInrAmount(mrpRaw)

  if (!price && discountedPrice) {
    price = discountedPrice
    discountedPrice = ""
  } else if (price && discountedPrice) {
    const p = Number(price)
    const d = Number(discountedPrice)
    if (Number.isFinite(p) && Number.isFinite(d) && d >= p) {
      price = String(Math.max(p, d))
      discountedPrice = String(Math.min(p, d))
      if (Number(discountedPrice) >= Number(price)) {
        discountedPrice = ""
      }
    }
  } else if (!price && !discountedPrice) {
    const offer = (jsonLd as any)?.offers
    const offerPrice =
      typeof offer?.price === "string" || typeof offer?.price === "number"
        ? String(offer.price)
        : ""
    price = parseInrAmount(offerPrice)
    if (!price) {
      warnings.push("Could not parse price; set prices before saving")
    }
  }

  const availabilityText =
    $(".stock_status").text() ||
    $("div")
      .filter((_, el) => /Availability/i.test($(el).text()))
      .first()
      .text() ||
    ""
  const inStock = /in\s*stock/i.test(availabilityText) && !/out\s*of\s*stock/i.test(availabilityText)

  let descriptionHtml =
    $("#tab-description").html() ||
    $("#description").html() ||
    $(".product-description").html() ||
    $("[itemprop='description']").html() ||
    $(".content_product_extra").html() ||
    ""

  if (!descriptionHtml) {
    descriptionHtml =
      $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      ""
    if (descriptionHtml) {
      descriptionHtml = `<p>${descriptionHtml}</p>`
      warnings.push("Used meta description; full HTML description was missing")
    }
  }

  const description = htmlToPlainDescription(descriptionHtml)
  const imageUrls = collectImageUrls($, pageUrl)
  if (!imageUrls.length) {
    warnings.push("No product images found on the page")
  }

  const productOptions = extractOptions($, pageUrl)
  const built = buildVariants({
    options: productOptions,
    sku,
    price,
    discountedPrice,
    inStock,
  })

  const colorImageUrls = built.hasVariants
    ? buildColorImageUrls(productOptions, imageUrls, warnings)
    : {}

  return {
    sourceUrl: pageUrl.toString(),
    title,
    handle: handleFromUrl(pageUrl, title),
    description,
    brand: brand.trim(),
    sku,
    price,
    discountedPrice,
    inStock,
    imageUrls,
    colorImageUrls,
    hasVariants: built.hasVariants,
    productOptions: built.hasVariants ? productOptions : [],
    variants: built.variants,
    warnings: [...warnings, ...built.warnings],
  }
}

async function fetchOwegProductHtmlOnce(pageUrl: URL): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(pageUrl.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
        "Cache-Control": "no-cache",
      },
    })

    if (!response.ok) {
      throw new OwegScrapeError(
        `Failed to fetch product page (HTTP ${response.status})`,
        response.status === 404 ? 404 : 502
      )
    }

    const contentType = response.headers.get("content-type") || ""
    if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
      throw new OwegScrapeError("URL did not return an HTML product page", 422)
    }

    return await response.text()
  } catch (error: any) {
    if (error instanceof OwegScrapeError) throw error
    if (error?.name === "AbortError") {
      throw new OwegScrapeError(
        "Timed out fetching product page from oweg.in. Check the full URL, or try again — oweg.in may be slow right now.",
        504
      )
    }
    throw new OwegScrapeError(error?.message || "Failed to fetch product page", 502)
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchOwegProductHtml(pageUrl: URL): Promise<string> {
  let lastError: unknown
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
    try {
      return await fetchOwegProductHtmlOnce(pageUrl)
    } catch (error) {
      lastError = error
      const retryable =
        error instanceof OwegScrapeError && (error.status === 504 || error.status === 502)
      if (!retryable || attempt === FETCH_RETRIES) break
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
    }
  }
  throw lastError
}

export async function scrapeOwegProduct(rawUrl: string): Promise<ScrapedOwegProduct> {
  const pageUrl = assertAllowedOwegUrl(rawUrl)
  const html = await fetchOwegProductHtml(pageUrl)
  return parseOwegProductHtml(html, pageUrl)
}
