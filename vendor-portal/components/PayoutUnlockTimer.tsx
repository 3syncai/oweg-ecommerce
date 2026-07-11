"use client"

import { useEffect, useState } from "react"
import { Text } from "@medusajs/ui"
import { Clock } from "@medusajs/icons"

type PayoutUnlockTimerProps = {
  unlockAt: string
  onComplete?: () => void
  className?: string
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

export default function PayoutUnlockTimer({
  unlockAt,
  onComplete,
  className = "",
}: PayoutUnlockTimerProps) {
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, new Date(unlockAt).getTime() - Date.now())
  )

  useEffect(() => {
    let completed = false

    const tick = () => {
      const next = Math.max(0, new Date(unlockAt).getTime() - Date.now())
      setRemainingMs(next)
      if (next === 0 && !completed) {
        completed = true
        onComplete?.()
      }
    }

    tick()
    const intervalId = window.setInterval(tick, 1000)
    return () => window.clearInterval(intervalId)
  }, [unlockAt, onComplete])

  if (remainingMs <= 0) {
    return (
      <Text size="small" className={`text-emerald-600 font-medium ${className}`}>
        Credited to payout
      </Text>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-700 ${className}`}
      title="Amount unlocks to your payout balance after delivery"
    >
      <Clock className="h-3.5 w-3.5 shrink-0" />
      <Text size="small" weight="plus" className="tabular-nums text-amber-700">
        {formatRemaining(remainingMs)}
      </Text>
    </span>
  )
}
