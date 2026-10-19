import * as XLSX from "xlsx"
import { TEMPLATE_HEADERS, type Category, type Collection, type RawRow } from "./bulk-upload"
import { GST_TAX_CODES } from "./gst-tax-codes"

export const MAX_BULK_ROWS = 1000
export const MAX_WORKBOOK_BYTES = 10 * 1024 * 1024
const normalizeHeader = (value: unknown) => String(value ?? "").replace(/\*/g, "").replace(/\s+/g, "").toLowerCase()

export async function loadAllReferences<T>(load: (offset: number) => Promise<{ items: T[]; count: number }>): Promise<T[]> {
  const all: T[] = []
  for (;;) {
    const page = await load(all.length)
    if (!page.items.length && all.length < page.count) throw new Error("Reference data is incomplete; retry loading")
    all.push(...page.items)
    if (all.length >= page.count) return all
  }
}

export function buildBulkTemplate(categories: Category[] = [], collections: Collection[] = []) {
  const workbook = XLSX.utils.book_new()
  const headers = TEMPLATE_HEADERS.map(h => h.key + (h.required ? " *" : ""))
  const products = XLSX.utils.aoa_to_sheet([headers])
  products["!cols"] = headers.map(() => ({ wch: 24 }))
  products["!autofilter"] = { ref: XLSX.utils.encode_range({ r: 0, c: 0 }, { r: MAX_BULK_ROWS, c: headers.length - 1 }) }
  XLSX.utils.book_append_sheet(workbook, products, "Products")
  const example = Object.fromEntries(TEMPLATE_HEADERS.map(h => [h.key, h.example]))
  const examples = [
    { ...example, Title: "Sample storage box", Handle: "sample-storage-box", Brand: "Your brand", Category: "", Subcategory: "", Collection: "", "Option 1 Name": "", "Option 1 Value": "", Thumbnail: "box.jpg", "Image 1": "", "Image 2": "", "Brand Letter": "your-letter.pdf" },
    ...["M", "L"].map(size => ({ ...example, Title: "Sample T-shirt", Handle: "sample-t-shirt", Brand: "Your brand", Category: "", Subcategory: "", Collection: "", "Option 1 Name": "Size", "Option 1 Value": size, "Variant Title": size, Thumbnail: "shirt.jpg", "Image 1": "", "Image 2": "", "Brand Letter": "your-letter.pdf" })),
  ]
  const exampleSheet = XLSX.utils.json_to_sheet(examples, { header: TEMPLATE_HEADERS.map(h => h.key) })
  exampleSheet["!cols"] = products["!cols"]
  XLSX.utils.book_append_sheet(workbook, exampleSheet, "Examples")
  const instructions = [
    ["OWEG vendor product import · Template v2"],
    ["Fill ONLY the blank Products sheet; Examples are reference data and are never imported."],
    ["One row = one variant. Same Handle (or same Title when Handle is blank) = one product."],
    ["Use different Handles for different products with the same title. Repeat all product-level details on every variant row."],
    ["Required: Title, Brand, Tax Code, Price INR. GST Rate is derived from Tax Code; do not guess tax classification."],
    ["Price INR = MRP; Discounted Price INR = selling price (optional, cannot exceed MRP). INR amounts use at most 2 decimals."],
    ["Use numbers without ₹, commas, or units. Inventory is a non-negative whole number; blank defaults to 0."],
    ["Dimensions: Height, Width, Length in cm; Weight in kg, matching the product form. Country of Origin: 2-letter code (IN)."],
    ["Keep SKUs, HSN/HS Code and MID Code as text to preserve leading zeros. Blank SKU or (auto) generates a SKU."],
    ["Existing catalog SKU: the backend verifies the same product and creates your own offer; your own duplicate SKU is rejected."],
    ["Options: pair Option N Name with Option N Value on each variant. Add more numbered pairs if needed. Maximum 100 variants/product."],
    ["Visual Option Name / Value must match an option on the row. Visual Image Refs are comma-separated image filenames or HTTPS URLs."],
    ["Images: filenames + matching local uploads, public HTTPS URLs, or supported Excel embedded images. Add Image 6, Image 7, etc."],
    ["Every referenced thumbnail/gallery/visual image must be ready before submission. Use unique filenames for different photos."],
    ["Video URLs: optional comma-separated public HTTPS links to existing videos. Local videos can be added in the individual product form."],
    ["Shipping Profile ID: optional valid sp_ ID supplied by your admin. Blank uses the default shipping profile."],
    ["Sales channel is assigned by the backend (Default Sales Channel), as in individual product creation."],
    ["Use category and collection names from the reference sheets. Unknown names become requests for admin review."],
    ["Additional Category IDs: optional comma-separated IDs from the Categories sheet for products belonging to more categories."],
    ["Type is free text; Tags are comma-separated. Yes/No, True/False, 1/0 are accepted for boolean fields."],
    ["A brand authorization letter is required per vendor/brand. An uploaded, pending letter allows draft submission; publication requires admin verification."],
    ["No products are published directly: all imports are drafts pending admin approval."],
    ["All validation errors must be fixed before submitting. A product's variants are submitted together. Successful products are skipped on retry."],
    ["If a request loses its connection after submission, check Products before retrying; the backend rejects an existing vendor SKU."],
    [`"Products" must be the sheet name in multi-sheet workbooks. .xlsx / .xls / .csv, maximum ${MAX_BULK_ROWS} rows, 10 MB, 200 columns.`],
    ["Keep the header row first. No merged cells, duplicate/unknown headers or formulas in product data. Paste values instead."],
  ]
  const info = XLSX.utils.aoa_to_sheet(instructions)
  info["!cols"] = [{ wch: 145 }]
  XLSX.utils.book_append_sheet(workbook, info, "Instructions")
  const guide = XLSX.utils.aoa_to_sheet([
    ["Column", "Required", "Scope", "Example"],
    ...TEMPLATE_HEADERS.map(h => [h.key, h.required ? "Yes" : "No", /Option|Variant|SKU|Inventory|Backorder|Price|Discount %|Image|Thumbnail/.test(h.key) ? "Variant / media" : "Product — repeat for each variant", h.example]),
  ])
  guide["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 42 }, { wch: 45 }]
  XLSX.utils.book_append_sheet(workbook, guide, "Field Guide")
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(GST_TAX_CODES), "GST Codes")
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(categories.map(c => ({ Name: c.name, ID: c.id, "Parent ID": c.parent_category_id || "" })), { header: ["Name", "ID", "Parent ID"] }), "Categories")
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(collections.map(c => ({ Name: c.title, ID: c.id })), { header: ["Name", "ID"] }), "Collections")
  return workbook
}

/** Bounded reads and explicit header checks prevent silent lost columns / formula cache imports. */
export async function readBulkWorkbook(file: { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }) {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("Choose an .xlsx, .xls or .csv file")
  if (file.size > MAX_WORKBOOK_BYTES) throw new Error("Spreadsheet exceeds 10 MB; split it into smaller files")
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", raw: true, sheetRows: MAX_BULK_ROWS + 2, cellFormula: true })
  const sheetName = workbook.SheetNames.find(n => n.toLowerCase() === "products") || (workbook.SheetNames.length === 1 ? workbook.SheetNames[0] : undefined)
  if (!sheetName) throw new Error("A multi-sheet workbook must have a Products sheet")
  const sheet = workbook.Sheets[sheetName]
  const range = XLSX.utils.decode_range(sheet["!fullref"] || sheet["!ref"] || "A1")
  if (range.s.r !== 0) throw new Error("Put column headers in the first row")
  if (range.e.r > MAX_BULK_ROWS) throw new Error(`Maximum ${MAX_BULK_ROWS} rows per file; split the spreadsheet`)
  if (range.e.c >= 200) throw new Error("Maximum 200 columns per file")
  if (sheet["!merges"]?.length) throw new Error("Unmerge cells before uploading")
  const values = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true, blankrows: true })
  const headers = (values[0] || []).map(v => String(v).trim())
  const normalized = headers.map(normalizeHeader)
  const seen = new Set<string>()
  const supported = new Set(TEMPLATE_HEADERS.map(h => normalizeHeader(h.key)))
  supported.add("images")
  for (let c = 0; c < headers.length; c++) {
    const key = normalized[c]
    if (!key) {
      if (values.slice(1).some(row => String(row[c] ?? "").trim())) throw new Error(`Column ${c + 1} has data but no header`)
      continue
    }
    if (seen.has(key)) throw new Error(`Duplicate column: ${headers[c]}`)
    seen.add(key)
    if (!supported.has(key) && !/^image\d+$/.test(key) && !/^option\d+(name|value)$/.test(key)) throw new Error(`Unsupported column: ${headers[c]}. Use the current template.`)
  }
  const missing = TEMPLATE_HEADERS.filter(h => h.required && !seen.has(normalizeHeader(h.key)))
  if (missing.length) throw new Error(`Missing required columns: ${missing.map(h => h.key).join(", ")}. Download template v2.`)
  for (let r = 1; r <= range.e.r; r++) for (let c = 0; c <= range.e.c; c++) {
    if (sheet[XLSX.utils.encode_cell({ r, c })]?.f) throw new Error(`Row ${r + 1}: formulas are not supported; paste values instead`)
  }
  const json: RawRow[] = values.slice(1).flatMap((row, i) => {
    if (!row.some(value => String(value ?? "").trim())) return []
    return [{ ...Object.fromEntries(headers.filter(Boolean).map(header => [header, row[headers.indexOf(header)] ?? ""])), __rowNumber: i + 2 }]
  })
  if (!json.length) throw new Error("No product rows found. Fill the Products sheet; Examples are not imported.")
  return { sheet, sheetName, json }
}
