/**
 * Extracts images stored using Excel's "Images in Cells" feature
 * (Microsoft 365 / Excel 2021+) from a .xlsx file.
 *
 * Background: SheetJS (the `xlsx` package) only surfaces cell text values.
 * The newer "Image in a Cell" feature stores images as rich data values —
 * a chain of references through several XML files that all live inside the
 * .xlsx ZIP. The cells themselves carry only `t="e" vm="N"` (rich-value
 * metadata index N) and no readable text, so a plain `cell.value` read
 * returns blank and the images appear "missing" downstream.
 *
 * The full reference chain we walk for each picture-cell:
 *
 *   sheetN.xml         <c r="Z2" t="e" vm="1"/>          (cell → metadata idx)
 *        │ vm="N"
 *   metadata.xml       <valueMetadata>/<bk[N-1]><rc v="K"/>   (→ richvalue idx)
 *        │ v="K"
 *   rdrichvalue.xml    <rv[K]><v>R</v>...                (→ rel idx)
 *        │ v="R"
 *   richValueRel.xml   <rel r:id="rIdR+1"/>              (→ relationship id)
 *        │ rId
 *   richValueRel.xml.rels  <Relationship Id="rIdR+1"
 *                              Target="../media/imageN.png"/>
 *        │
 *   xl/media/imageN.png  ← actual image bytes
 *
 * Return shape: a Map keyed by (sheetName, cellAddress) → File. The sheet
 * name is included because workbooks can have multiple sheets; the caller
 * already knows which sheet it parsed and can scope lookups.
 */

import JSZip from "jszip"

export type EmbeddedImage = {
  /** Sheet name the image is anchored to */
  sheetName: string
  /** Cell address like "Z2" */
  cellAddress: string
  /** The image bytes as a File so existing upload code can use it as-is */
  file: File
  /** Original media path, useful for debugging */
  mediaPath: string
}

const NS = {
  rel: "http://schemas.openxmlformats.org/package/2006/relationships",
}

/**
 * Read a single XML file out of the zip and parse it with the browser's
 * DOMParser. Returns null when the file is missing — the rich-data
 * machinery is *optional*, so a workbook without embedded images simply
 * doesn't have these parts.
 */
async function readXmlFromZip(
  zip: JSZip,
  path: string
): Promise<Document | null> {
  const entry = zip.file(path)
  if (!entry) return null
  const text = await entry.async("text")
  return new DOMParser().parseFromString(text, "application/xml")
}

/**
 * `metadata.xml` lists value-metadata blocks in document order. A cell's
 * `vm="N"` attribute is a 1-based index into that list. Each block carries
 * a `<rc t="1" v="K"/>` where K is the (0-based) index into the rich-value
 * table. We return an array `vmIdx -> richValueIdx` (vmIdx is 1-based, so
 * result[0] is unused).
 */
function parseMetadataValueIndex(metadataDoc: Document): number[] {
  const result: number[] = [-1] // pad so result[1] aligns with vm="1"
  const blocks = metadataDoc.getElementsByTagName("bk")
  // valueMetadata is the SECOND <metadataTypes>-aligned section in the
  // file; both <futureMetadata> and <valueMetadata> contain <bk> children
  // and we only want the latter. Walk via parent tag name to be safe.
  for (const bk of Array.from(blocks)) {
    if (bk.parentElement?.tagName !== "valueMetadata") continue
    const rc = bk.getElementsByTagName("rc")[0]
    if (!rc) {
      result.push(-1)
      continue
    }
    const v = rc.getAttribute("v")
    result.push(v == null ? -1 : Number(v))
  }
  return result
}

/**
 * `rdrichvalue.xml` is the rich-value table. Each `<rv>` for an Image-in-
 * a-Cell value has a first `<v>` child whose text is the (0-based) index
 * into `richValueRel.xml`'s `<rel>` list. We return an array indexed by
 * rich-value index.
 */
function parseRichValueRelIndex(rdrichvalueDoc: Document): number[] {
  const result: number[] = []
  const rvs = rdrichvalueDoc.getElementsByTagName("rv")
  for (const rv of Array.from(rvs)) {
    const v = rv.getElementsByTagName("v")[0]
    result.push(v?.textContent ? Number(v.textContent) : -1)
  }
  return result
}

/**
 * `richValueRel.xml` lists `<rel r:id="rIdX"/>` entries in order. The rich-
 * value index from the previous step picks one of these entries; its rId
 * is then resolved against `richValueRel.xml.rels` to get the actual media
 * path. We return an array of rId strings indexed by position.
 */
function parseRichValueRelIds(richValueRelDoc: Document): string[] {
  const rels = richValueRelDoc.getElementsByTagName("rel")
  return Array.from(rels)
    .map((r) =>
      r.getAttributeNS(NS.rel, "id") || r.getAttribute("r:id") || ""
    )
    .filter(Boolean)
}

/**
 * `richValueRel.xml.rels` maps rId → media file. Returns Map<rId, path>
 * with the path resolved relative to `xl/` (since Target is e.g.
 * `../media/image1.png`).
 */
function parseRichValueRelRelationships(
  relsDoc: Document
): Map<string, string> {
  const map = new Map<string, string>()
  const rels = relsDoc.getElementsByTagName("Relationship")
  for (const r of Array.from(rels)) {
    const id = r.getAttribute("Id")
    const target = r.getAttribute("Target")
    if (!id || !target) continue
    // Targets are relative to xl/richData/, so e.g. "../media/image1.png"
    // resolves to "xl/media/image1.png". Use URL resolution rather than
    // string manipulation so edge cases (deeper paths, encoded chars) are
    // handled correctly.
    const resolved = new URL(target, "http://x/xl/richData/").pathname.replace(
      /^\//,
      ""
    )
    map.set(id, resolved)
  }
  return map
}

/**
 * Walk every sheet, find each `<c ... vm="N"/>` cell, and convert it into
 * an EmbeddedImage. Sheets that don't reference any rich values yield no
 * results.
 */
async function extractCellsForSheet(
  zip: JSZip,
  sheetName: string,
  sheetPath: string,
  vmToRichValueIdx: number[],
  richValueToRelIdx: number[],
  relIdxToRId: string[],
  rIdToMediaPath: Map<string, string>
): Promise<EmbeddedImage[]> {
  const sheetDoc = await readXmlFromZip(zip, sheetPath)
  if (!sheetDoc) return []

  const cells = sheetDoc.getElementsByTagName("c")
  const out: EmbeddedImage[] = []

  for (const cell of Array.from(cells)) {
    // Only Image-in-Cell entries — they're typed "e" (error sentinel) and
    // carry the vm metadata attribute. Plain error cells never have vm.
    const vmAttr = cell.getAttribute("vm")
    if (!vmAttr) continue

    const cellAddress = cell.getAttribute("r") || ""
    if (!cellAddress) continue

    const vmIdx = Number(vmAttr)
    const rvIdx = vmToRichValueIdx[vmIdx]
    if (rvIdx == null || rvIdx < 0) continue

    const relIdx = richValueToRelIdx[rvIdx]
    if (relIdx == null || relIdx < 0) continue

    const rId = relIdxToRId[relIdx]
    if (!rId) continue

    const mediaPath = rIdToMediaPath.get(rId)
    if (!mediaPath) continue

    const mediaEntry = zip.file(mediaPath)
    if (!mediaEntry) continue

    const blob = await mediaEntry.async("blob")
    // Derive a content type from the file extension; xlsx media filenames
    // are always like image1.png / image2.jpeg so this is reliable.
    const ext = mediaPath.split(".").pop()?.toLowerCase() || "png"
    const mime =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "gif"
          ? "image/gif"
          : ext === "webp"
            ? "image/webp"
            : "image/png"

    const filename = mediaPath.split("/").pop() || `image.${ext}`
    const file = new File([blob], filename, { type: mime })

    out.push({ sheetName, cellAddress, file, mediaPath })
  }

  return out
}

/**
 * Public entry point: pass the .xlsx File and get every embedded image
 * back, anchored to its cell. Safe to call on workbooks that have no
 * embedded images — returns an empty array.
 */
export async function extractEmbeddedImages(
  file: File
): Promise<EmbeddedImage[]> {
  const buffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(buffer)

  // If any of these are missing, the workbook has no rich-data images.
  const [metadataDoc, rdrichvalueDoc, richValueRelDoc, richValueRelsDoc] =
    await Promise.all([
      readXmlFromZip(zip, "xl/metadata.xml"),
      readXmlFromZip(zip, "xl/richData/rdrichvalue.xml"),
      readXmlFromZip(zip, "xl/richData/richValueRel.xml"),
      readXmlFromZip(zip, "xl/richData/_rels/richValueRel.xml.rels"),
    ])

  if (
    !metadataDoc ||
    !rdrichvalueDoc ||
    !richValueRelDoc ||
    !richValueRelsDoc
  ) {
    return []
  }

  const vmToRichValueIdx = parseMetadataValueIndex(metadataDoc)
  const richValueToRelIdx = parseRichValueRelIndex(rdrichvalueDoc)
  const relIdxToRId = parseRichValueRelIds(richValueRelDoc)
  const rIdToMediaPath = parseRichValueRelRelationships(richValueRelsDoc)

  // Discover sheets from workbook.xml so we can map sheet display names
  // to their internal sheet1.xml/sheet2.xml paths.
  const workbookDoc = await readXmlFromZip(zip, "xl/workbook.xml")
  const workbookRelsDoc = await readXmlFromZip(zip, "xl/_rels/workbook.xml.rels")
  if (!workbookDoc || !workbookRelsDoc) return []

  const sheetEls = Array.from(workbookDoc.getElementsByTagName("sheet"))
  const workbookRels = new Map<string, string>()
  for (const r of Array.from(
    workbookRelsDoc.getElementsByTagName("Relationship")
  )) {
    const id = r.getAttribute("Id")
    const target = r.getAttribute("Target")
    if (id && target) workbookRels.set(id, target)
  }

  const results: EmbeddedImage[] = []
  for (const sh of sheetEls) {
    const name = sh.getAttribute("name") || ""
    const rid =
      sh.getAttributeNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "id"
      ) ||
      sh.getAttribute("r:id") ||
      ""
    const relTarget = workbookRels.get(rid)
    if (!relTarget) continue
    // Targets in workbook.xml.rels are relative to `xl/`, e.g.
    // "worksheets/sheet1.xml" → "xl/worksheets/sheet1.xml".
    const sheetPath = `xl/${relTarget.replace(/^\.?\//, "")}`

    const sheetResults = await extractCellsForSheet(
      zip,
      name,
      sheetPath,
      vmToRichValueIdx,
      richValueToRelIdx,
      relIdxToRId,
      rIdToMediaPath
    )
    results.push(...sheetResults)
  }

  return results
}

/**
 * Helper to split an Excel cell address like "AA12" into its column and
 * row parts. Returns { column: "AA", row: 12 }.
 */
export function splitCellAddress(
  address: string
): { column: string; row: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(address)
  if (!m) return null
  return { column: m[1], row: Number(m[2]) }
}

/**
 * Convert an Excel column letter ("A", "Z", "AA", "AB"...) to a 1-based
 * column index. Useful for mapping a column letter to a header name when
 * you know the header row's contents in order.
 */
export function columnLetterToIndex(letter: string): number {
  let n = 0
  for (const ch of letter) {
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return n
}

/**
 * Convert a 1-based column index back to its Excel letter. Inverse of
 * columnLetterToIndex.
 */
export function indexToColumnLetter(index: number): string {
  let n = index
  let s = ""
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}
