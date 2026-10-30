import * as XLSX from "xlsx"
import JSZip from "jszip"
import { TEMPLATE_HEADERS, normalizeBulkHeader, type Category, type Collection, type RawRow } from "./bulk-upload"
import { GST_TAX_CODES } from "./gst-tax-codes"

export const MAX_BULK_ROWS = 1000
export const MAX_WORKBOOK_BYTES = 10 * 1024 * 1024
const normalizeHeader = normalizeBulkHeader

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
    { ...example, Title: "Bajaj KTX 1.8L DLX Electric Kettle", Category: "Home appliances", Subcategory: "Kettles", "HSN Code": "85167920", "Option 1 Name": "Capacity", "Option 1 Value": "1.8 L", "Option 2 Name": "Colour", "Option 2 Value": "Silver & Black", Thumbnail: "ktx-1-8-l-dlx-1.jpg", "Image 1": "ktx-1-8-l-dlx-1.jpg", "Image 2": "ktx-1-8-l-dlx-2.jpg", "Image 3": "ktx-1-8-l-dlx-3.jpg" },

  ]
  const exampleSheet = XLSX.utils.json_to_sheet(examples, { header: TEMPLATE_HEADERS.map(h => h.key) })
  exampleSheet["!cols"] = products["!cols"]
  XLSX.utils.book_append_sheet(workbook, exampleSheet, "Examples")
  const instructions = [
    ["OWEG vendor product import - Template v4"],
    ["Fill Products only; Examples are never imported. * means mandatory. Calculated/fixed fields are protected."],
    ["Required fields have a coral header and *. Include description, category/subcategory, package dimensions/weight, HSN, origin, tax, base prices, stock and Image 1-3. Enter 0 for no stock. Stock applies to EACH variant."],
    ["Tax country is India. Choose Tax Code from its dropdown; GST Rate is calculated from it. GST alone cannot be imported."],
    ["MRP INR and Selling Price INR are BASE prices, including product GST. Selling price must not exceed base MRP. Discount % is automatic. Final listing prices are calculated and edited in the portal after upload."],
    ["After parsing, logistics uses package dimensions in cm and weight in kg. Review the calculated listing price and View calculation for each product before submitting."],
    ["Managed Inventory and Allow Backorder are always Yes. Shipping uses the backend default profile."],
    ["Brand is also the collection. Unknown brands are requested for admin review; no separate collection field."],
    ["Subtitle and Handle are optional. Same Handle (or Title if blank) groups rows. Repeat product-level details."],
    ["Comma-separated Size 8,9,10 and Color Red,Green,Blue create all NINE combinations. Maximum 100 variants/product."],
    ["Row price and stock apply to each generated variant. For different prices/stock, use separate rows with individual values."],
    ["Option N Images: one shared image OR one image per value in the SAME order. Red,Blue maps to red.jpg,blue.jpg."],
    ["Color (or first option with images) controls the visual gallery. Every option image is also included in the product gallery."],
    ["Blank SKU/(auto) generates unique SKUs. A supplied SKU with multiple combinations gets -1, -2, etc."],
    ["Thumbnail and Image 1,2,3... accept filenames with portal uploads, public HTTP/HTTPS URLs or Excel embedded pictures. HTTP links are checked over HTTPS first; HTTP-only images are imported to secure storage."],
    ["Video URLs is beside product images; use optional comma-separated public HTTPS video links."],
    ["Upload brand authorization AFTER parsing, once per brand: one PNG/JPG or PDF; multiple images are combined into a PDF."],
    ["Dimensions cm; Weight kg. Country of Origin defaults to IN. Keep HSN Code/SKU as text for leading zeros."],
    ["Use numbers without currency symbols/separators; prices allow two decimals. Use Categories for category names."],
    ["Imports create drafts pending admin approval. Fix all errors before submitting; successful products are skipped on retry."],
    [`Multi-sheet files need Products. Maximum ${MAX_BULK_ROWS} rows, 10 MB, 200 columns. Add numbered image/option columns if needed.`],
    ["Headers on row 1; no merged cells or formulas in input cells. Only calculation columns accept formulas."],
  ]
  const info = XLSX.utils.aoa_to_sheet(instructions)
  info["!cols"] = [{ wch: 145 }]
  XLSX.utils.book_append_sheet(workbook, info, "Instructions")
  const guide = XLSX.utils.aoa_to_sheet([
    ["Column", "Required", "Scope", "Example"],
    ...TEMPLATE_HEADERS.map(h => [h.key, h.required ? "Yes" : "No", /Option|Variant|SKU|Inventory|Backorder|Price|MRP|Discount %|Image|Thumbnail/.test(h.key) ? "Variant / media" : "Product — repeat for each variant", h.example]),
  ])
  guide["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 42 }, { wch: 45 }]
  XLSX.utils.book_append_sheet(workbook, guide, "Field Guide")
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(GST_TAX_CODES), "GST Codes")
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(categories.map(c => ({ Name: c.name, ID: c.id, "Parent ID": c.parent_category_id || "" })), { header: ["Name", "ID", "Parent ID"] }), "Categories")
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(collections.map(c => ({ Name: c.title, ID: c.id })), { header: ["Name", "ID"] }), "Brands")
  const col = (key: string) => XLSX.utils.encode_col(TEMPLATE_HEADERS.findIndex(h => normalizeHeader(h.key) === normalizeHeader(key)))
  for (let r = 2; r <= MAX_BULK_ROWS + 1; r++) {
    const tax = `${col("Tax Code")}${r}`, mrp = `${col("MRP INR")}${r}`, sale = `${col("Discounted Price INR")}${r}`
    for (let c = 0; c < headers.length; c++) products[XLSX.utils.encode_cell({ r: r - 1, c })] = { t: "s", v: "" }
    products[`${col("GST Rate")}${r}`] = { t: "str", v: "", f: `IF(${tax}="","",IFERROR(VLOOKUP(${tax},'GST Codes'!$A$2:$C$${GST_TAX_CODES.length + 1},3,FALSE),""))` }
    products[`${col("Discount %")}${r}`] = { t: "str", v: "", f: `IF(OR(${mrp}="",${sale}=""),"",IFERROR(ROUND((${mrp}-${sale})/${mrp}*100,1),""))` }
    for (const key of ["Managed Inventory", "Allow Backorder"]) products[`${col(key)}${r}`] = { t: "s", v: "Yes" }
    products[`${col("Country of Origin")}${r}`] = { t: "s", v: "IN" }
  }
  products["!ref"] = `A1:${XLSX.utils.encode_col(headers.length - 1)}${MAX_BULK_ROWS + 1}`
  workbook.Workbook = { ...workbook.Workbook, Names: [{ Name: "OWEGTaxCodes", Ref: `'GST Codes'!$A$2:$A$${GST_TAX_CODES.length + 1}` }] }
  return workbook
}

/** Serialize the standard OOXML validation and unlocked-input styles unsupported by SheetJS CE. */
export async function serializeBulkTemplate(workbook: XLSX.WorkBook): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(XLSX.write(workbook, { type: "array", bookType: "xlsx" }))
  let styles = await zip.file("xl/styles.xml")!.async("string")
  const fontCount = Number(styles.match(/<fonts count="(\d+)"/)?.[1])
  const fillCount = Number(styles.match(/<fills count="(\d+)"/)?.[1])
  styles = styles.replace(/<fonts count="\d+"/, `<fonts count="${fontCount + 1}"`).replace("</fonts>", '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts>').replace(/<fills count="\d+"/, `<fills count="${fillCount + 3}"`).replace("</fills>", ["D96950", "344B44", "638476"].map(color => `<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`).join("") + "</fills>")
  const match = styles.match(/<cellXfs count="(\d+)"[^>]*>/)
  if (!match) throw new Error("Unable to prepare protected template cells")
  const unlocked = Number(match[1])
  zip.file("xl/styles.xml", styles.replace(match[0], match[0].replace(`count="${unlocked}"`, `count="${unlocked + 5}"`)).replace("</cellXfs>", '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyProtection="1"><protection locked="0"/></xf><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyProtection="1"><protection locked="0"/></xf>' + [0, 1, 2].map(n => `<xf numFmtId="0" fontId="${fontCount}" fillId="${fillCount + n}" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`).join("") + '</cellXfs>'))
  let sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string")
  const locked = new Set(TEMPLATE_HEADERS.flatMap((h, i) => /\((auto|fixed)\)/.test(h.key) ? [XLSX.utils.encode_col(i)] : []))
  const textColumns = new Set(TEMPLATE_HEADERS.flatMap((h, i) => /^(HSN Code|SKU|Handle|Option \d+ Value)/.test(h.key) ? [XLSX.utils.encode_col(i)] : []))
  sheet = sheet.replace(/<c r="([A-Z]+)(\d+)"([^>]*)>/g, (tag, column, row, rest) => Number(row) > 1 && !locked.has(column) ? `<c r="${column}${row}"${rest.replace(/ s="\d+"/, "")} s="${textColumns.has(column) ? unlocked + 1 : unlocked}">` : tag)
  sheet = sheet.replace(/<c r="([A-Z]+)1"([^>]*)>/g, (tag, column, rest) => {
    const header = TEMPLATE_HEADERS[XLSX.utils.decode_col(column)]
    const index = /\((auto|fixed)\)/.test(header.key) ? 2 : header.required ? 0 : 1
    return `<c r="${column}1"${rest.replace(/ s="\d+"/, "")} s="${unlocked + 2 + index}">`
  }).replace(/<row r="1"([^>]*)>/, '<row r="1"$1 ht="36" customHeight="1">')
  sheet = sheet.replace(/<sheetView([^>]*?)\/>/, '<sheetView$1 showGridLines="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView>')
  const taxCol = XLSX.utils.encode_col(TEMPLATE_HEADERS.findIndex(h => h.key === "Tax Code"))
  sheet = sheet.replace("</sheetData>", '</sheetData><sheetProtection sheet="1" objects="1" scenarios="1" selectLockedCells="1"/>')
  const validation = `<dataValidations count="1"><dataValidation type="list" allowBlank="0" showErrorMessage="1" errorTitle="Choose a tax code" error="Select a code from the dropdown" errorStyle="stop" sqref="${taxCol}2:${taxCol}${MAX_BULK_ROWS + 1}"><formula1>OWEGTaxCodes</formula1></dataValidation></dataValidations>`
  // Validation must precede ignoredErrors and other trailing worksheet elements.
  sheet = sheet.replace(/(<(?:hyperlinks|printOptions|pageMargins|pageSetup|headerFooter|rowBreaks|colBreaks|customProperties|cellWatches|ignoredErrors|drawing|legacyDrawing|extLst)\b|<\/worksheet>)/, validation + "$1")
  zip.file("xl/worksheets/sheet1.xml", sheet)
  const workbookXml = await zip.file("xl/workbook.xml")!.async("string")
  zip.file("xl/workbook.xml", workbookXml.replace(/<calcPr[^>]*\/>/, "").replace("</workbook>", '<calcPr calcId="0" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>'))
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })
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
  ;["images", "priceinr", "hscode", "visualoptionname", "visualoptionvalue", "visualimagerefs"].forEach(key => supported.add(key))
  for (let c = 0; c < headers.length; c++) {
    const key = normalized[c]
    if (!key) {
      if (values.slice(1).some(row => String(row[c] ?? "").trim())) throw new Error(`Column ${c + 1} has data but no header`)
      continue
    }
    if (seen.has(key)) throw new Error(`Duplicate column: ${headers[c]}`)
    seen.add(key)
    if (!supported.has(key) && !/^image\d+$/.test(key) && !/^option\d+(name|value|images?)$/.test(key)) throw new Error(`Unsupported column: ${headers[c]}. Use the current template.`)
  }
  const clientFormat = headers.some(header => /selling\s*price|weight\s*\(kg\)/i.test(header))
  const legacyRequired = new Set(["Title", "Brand", "Tax Code", "MRP INR", "Inventory Count"])
  const missing = TEMPLATE_HEADERS.filter(h => h.required && (clientFormat || legacyRequired.has(h.key)) && !seen.has(normalizeHeader(h.key)) && !(h.key === "MRP INR" && seen.has("priceinr")))
  if (missing.length) throw new Error(`Missing required columns: ${missing.map(h => h.key).join(", ")}. Download template v4.`)
  for (let r = 1; r <= range.e.r; r++) for (let c = 0; c <= range.e.c; c++) {
    if (sheet[XLSX.utils.encode_cell({ r, c })]?.f && !["gstrate", "discount%"].includes(normalized[c])) throw new Error(`Row ${r + 1}: formulas are not supported; paste values instead`)
  }
  const json: RawRow[] = values.slice(1).flatMap((row, i) => {
    if (!row.some((value, c) => !["gstrate", "discount%", "managedinventory", "allowbackorder", "countryoforigin"].includes(normalized[c]) && String(value ?? "").trim())) return []
    for (let c = 0; c < headers.length; c++) if (sheet[XLSX.utils.encode_cell({ r: i + 1, c })]?.f && ["gstrate", "discount%"].includes(normalized[c])) row[c] = ""
    return [{ ...Object.fromEntries(headers.filter(Boolean).map(header => [header, row[headers.indexOf(header)] ?? ""])), __rowNumber: i + 2 }]
  })
  if (!json.length) throw new Error("No product rows found. Fill the Products sheet; Examples are not imported.")
  return { sheet, sheetName, json }
}
