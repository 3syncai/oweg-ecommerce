'use client'

import React, { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'
import { flashSaleCountdown, flashSaleTimerUnits } from '@/lib/flash-sale-display'

type FlashSaleBadgeProps = {
  expiresAt?: string
  timeRemainingMs?: number
}

export function FlashSaleBadge({ expiresAt, timeRemainingMs: initialTimeRemaining }: FlashSaleBadgeProps) {
  const [timeRemaining, setTimeRemaining] = useState(initialTimeRemaining ?? 0)
  const [startTime] = useState(() => Date.now())

  useEffect(() => {
    if (!expiresAt && !initialTimeRemaining) return

    const updateTimer = () => {
      if (expiresAt) {
        const now = Date.now()
        const endTime = new Date(expiresAt).getTime()
        const remaining = Math.max(0, endTime - now)
        setTimeRemaining(remaining)
      } else if (initialTimeRemaining !== undefined) {
        const elapsed = Date.now() - startTime
        setTimeRemaining(Math.max(0, initialTimeRemaining - elapsed))
      }
    }

    // Initial update
    updateTimer()

    // Update every second
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [expiresAt, initialTimeRemaining, startTime])

  if (timeRemaining <= 0) return null

  const units = flashSaleTimerUnits(flashSaleCountdown(timeRemaining))

  return (
    <div className="inline-flex max-w-full flex-wrap items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
      <Clock className="w-4 h-4 shrink-0 text-red-700" aria-hidden />
      <span className="text-sm font-semibold text-red-700">Ends in:</span>
      <span className="font-mono text-sm font-semibold text-red-700"
        aria-label={units.map(unit => `${unit.value} ${unit.label.toLowerCase()}`).join(', ')}>
        {units.map(unit => `${String(unit.value).padStart(2, '0')}${unit.label[0].toLowerCase()}`).join(' : ')}
      </span>
    </div>
  )
}

