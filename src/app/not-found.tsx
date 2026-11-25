import Link from 'next/link'
import { SearchX } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="oweg-page grid min-h-[55svh] place-items-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-[#dde8d8] bg-white px-5 py-9 text-center shadow-sm sm:px-8">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#eff6e8] text-[#326b29]"><SearchX aria-hidden="true" /></span>
        <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-[#326b29]">Error 404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#16382c] sm:text-3xl">We couldn’t find that page</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">The link may have changed. Search for what you were looking for or return to the OWEG home page.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/search" className="inline-flex min-h-11 items-center rounded-xl bg-[#145448] px-4 text-sm font-semibold text-white hover:bg-[#103e36]">Search products</Link>
          <Link href="/" className="inline-flex min-h-11 items-center rounded-xl border border-[#d7e5d3] px-4 text-sm font-semibold text-[#145448] hover:bg-[#eff6e8]">Back to home</Link>
        </div>
      </div>
    </div>
  )
}
