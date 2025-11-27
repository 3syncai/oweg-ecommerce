'use client'

import React from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { BreadcrumbItem } from '../types'

type BreadcrumbsProps = {
  items: BreadcrumbItem[]
  pillClassName: string
}

const Breadcrumbs = ({ items, pillClassName }: BreadcrumbsProps) => (
  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 mb-6">
    {items.map((item, idx) => (
      <React.Fragment key={`${item.label}-${idx}`}>
        {idx > 0 && <ChevronRight className="w-4 h-4 text-green-500" />}
        {idx === items.length - 1 ? (
          <span className="text-slate-900 font-semibold">{item.label}</span>
        ) : item.href ? (
          <Link href={item.href} className={pillClassName}>
            {item.label}
          </Link>
        ) : (
          <span className={pillClassName}>{item.label}</span>
        )}
      </React.Fragment>
    ))}
  </div>
)

export default Breadcrumbs
