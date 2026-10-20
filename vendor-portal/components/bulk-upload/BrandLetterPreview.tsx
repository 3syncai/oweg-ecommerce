"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { FileText, ExternalLink } from "lucide-react"

export default function BrandLetterPreview({ file, fileUrl, brand }: { file?: File; fileUrl?: string; brand: string }) {
  const [local, setLocal] = useState<{ file: File; url: string }>()
  const [failedUrl, setFailedUrl] = useState<string>()
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setLocal({ file, url })
    return () => URL.revokeObjectURL(url)
  }, [file])
  const url = file ? (local?.file === file ? local.url : undefined) : fileUrl
  const name = file?.name || "Saved authorization letter"
  const pdf = file ? file.type === "application/pdf" || /\.pdf$/i.test(file.name) : /\.pdf(?:[?#]|$)/i.test(fileUrl || "")
  return <div className="overflow-hidden rounded-lg border border-ui-border-base bg-ui-bg-base">
    <div className="flex h-56 items-center justify-center bg-white sm:h-64">
      {!url ? <p className="text-sm text-ui-fg-muted">Preparing preview…</p> : failedUrl === url ? (
        <div className="space-y-2 p-4 text-center text-ui-fg-subtle"><FileText className="mx-auto" size={32} /><p className="text-sm">Preview unavailable. Open the letter below to review it.</p></div>
      ) : pdf ? (
        <iframe src={`${url}#toolbar=0&navpanes=0`} title={`${brand} authorization PDF preview`} className="h-full w-full border-0" onError={() => setFailedUrl(url)} />
      ) : (
        <Image src={url} alt={`${brand} authorization letter preview`} width={640} height={480} unoptimized className="h-full w-full object-contain p-2" onError={() => setFailedUrl(url)} />
      )}
    </div>
    <div className="space-y-1 border-t border-ui-border-base p-3">
      <p className="break-all text-sm font-medium">{name}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ui-fg-subtle">
        <span>{pdf ? "PDF document" : "Image"}{file ? ` · ${Math.max(1, Math.round(file.size / 1024))} KB` : ""}</span>
        {url && <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-emerald-700 underline">Open full letter <ExternalLink size={12} /></a>}
      </div>
    </div>
  </div>
}
