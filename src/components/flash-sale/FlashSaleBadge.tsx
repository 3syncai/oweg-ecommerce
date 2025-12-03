'use client'

import React, { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'
import { formatTimeRemaining } from '@/hooks/useFlashSale'

type FlashSaleBadgeProps = {
  expiresAt?: string
  timeRemainingMs?: number
}

export function FlashSaleBadge({ expiresAt, timeRemainingMs: initialTimeRemaining }: FlashSaleBadgeProps) {
  const [timeRemaining, setTimeRemaining] = useState(initialTimeRemaining || 0)
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
  }, [expiresAt, initialTimeRemaining])

  if (timeRemaining <= 0) return null

  const { hours, minutes, seconds } = formatTimeRemaining(timeRemaining)

  return (
    <div className="inline-flex items-center gap-2 bg-red-50 border-2 border-red-500 rounded-lg px-4 py-2 shadow-md">
      <Clock className="w-5 h-5 text-red-700" />
      <span className="text-sm font-semibold text-red-700">Ends in:</span>
      <span className="font-mono text-lg font-bold text-red-700">
        {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
    </div>
  )
}

