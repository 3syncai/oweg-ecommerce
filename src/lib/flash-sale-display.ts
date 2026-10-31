export function flashSaleTitle(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : 'Deal of the Day'
}

export function flashSaleCountdown(ms: number) {
  const total = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0
  return { days: Math.floor(total / 86400), hours: Math.floor(total % 86400 / 3600),
    minutes: Math.floor(total % 3600 / 60), seconds: total % 60 }
}

export function flashSaleTimerUnits(time: ReturnType<typeof flashSaleCountdown>) {
  return [...(time.days > 0 ? [{ value: time.days, label: 'Days' }] : []),
    { value: time.hours, label: 'Hours' }, { value: time.minutes, label: 'Minutes' },
    { value: time.seconds, label: 'Seconds' }]
}
