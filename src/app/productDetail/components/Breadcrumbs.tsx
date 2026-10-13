'use client'

import React from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { BreadcrumbItem } from '../types'
import styles from '../ProductDetail.module.css'

type BreadcrumbsProps = {
  items: BreadcrumbItem[]
  pillClassName: string
}

const Breadcrumbs = ({ items, pillClassName }: BreadcrumbsProps) => (
  <nav aria-label="Breadcrumb" className={styles.breadcrumbs}>
    {items.map((item, idx) => (
      <React.Fragment key={`${item.label}-${idx}`}>
        {idx > 0 && <ChevronRight className="w-4 h-4 text-green-500" />}
        {idx === items.length - 1 ? (
          <span className={styles.breadcrumbCurrent} title={item.label} aria-current="page">{item.label}</span>
        ) : item.href ? (
          <Link href={item.href} className={pillClassName}>
            {item.label}
          </Link>
        ) : (
          <span className={pillClassName}>{item.label}</span>
        )}
      </React.Fragment>
    ))}
  </nav>
)

export default Breadcrumbs
