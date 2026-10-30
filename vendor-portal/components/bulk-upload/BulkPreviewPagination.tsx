import { Button } from "@medusajs/ui"
import { bulkPreviewPage } from "@/lib/bulk-preview-page"

type Props = { total: number; page: number; onPageChange: (page: number) => void; label: string }

export default function BulkPreviewPagination({ total, page, onPageChange, label }: Props) {
  const window = bulkPreviewPage(total, page)
  if (total <= 50) return null
  return <nav aria-label={label} className="my-4 flex flex-wrap items-center justify-between gap-3">
    <p role="status" className="text-sm text-ui-fg-subtle">Rows {window.start + 1}–{window.end} of {total} · Page {window.page} of {window.pageCount}</p>
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" disabled={window.page === 1} onClick={() => onPageChange(window.page - 1)}>Previous</Button>
      <Button type="button" variant="secondary" disabled={window.page === window.pageCount} onClick={() => onPageChange(window.page + 1)}>Next</Button>
    </div>
  </nav>
}
